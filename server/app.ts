import * as play from "./play-features.js";
import { registerSystems } from "./system-routes.js";
import * as systems from "./systems.js";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import type { Database, DBClient } from "./db.js";
import { verifyTelegram, login, hashToken, GameError } from "./auth.js";
import {
  configSchema,
  validateConfig,
  type Config,
  levelFor,
  evaluate,
} from "./economy.js";
import * as game from "./game.js";
import { botSetupStatus } from "./bot.js";
export function createApp(db: Database) {
  const app = express();
  const production = process.env.NODE_ENV === "production";
  if (production && process.env.DEV_AUTH === "true")
    throw new Error("DEV_AUTH must be disabled in production");
  if (production && !process.env.APP_URL?.startsWith("https://"))
    throw new Error("Production requires HTTPS APP_URL");
  if (production && process.env.BOT_TOKEN && !process.env.WEBHOOK_SECRET)
    throw new Error("Telegram webhook requires WEBHOOK_SECRET");
  if (production) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://telegram.org"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https://t.me", "https://*.telegram.org"],
          connectSrc: ["'self'"],
          frameAncestors: [
            "'self'",
            "https://web.telegram.org",
            "https://*.telegram.org",
          ],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.get("/api/health", async (_req, res) => {
    try {
      await db.query("SELECT 1");
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });
  const authLimit = rateLimit({
    windowMs: 60000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Слишком много попыток входа" },
  });
  app.get("/api/bootstrap", (_req, res) =>
    res.json({
      devAuth: !production && process.env.DEV_AUTH === "true",
      botUsername: process.env.BOT_USERNAME ?? "",
      telegramSetup: botSetupStatus(),
    }),
  );
  app.post("/api/auth/telegram", authLimit, async (req, res) => {
    const body = z
      .object({ initData: z.string().min(1).max(16000) })
      .strict()
      .parse(req.body);
    if (!process.env.BOT_TOKEN)
      throw new GameError(503, "Telegram пока не подключён");
    const user = verifyTelegram(body.initData, process.env.BOT_TOKEN);
    res.json(await login(db, user));
  });
  app.post("/api/auth/dev", authLimit, async (_req, res) => {
    if (production || process.env.DEV_AUTH !== "true")
      throw new GameError(404, "Не найдено");
    res.json(
      await login(db, {
        id: 123456789,
        first_name: "Explorer",
        username: "testuser",
      }),
    );
  });
  app.post("/api/telegram/webhook", async (req, res) => {
    const actual = req.get("x-telegram-bot-api-secret-token") ?? "",
      expected = process.env.WEBHOOK_SECRET ?? "";
    if (
      !expected ||
      actual.length !== expected.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    )
      throw new GameError(401, "Unauthorized");
    const update = z
      .object({
        update_id: z.number().int(),
        message: z
          .object({
            chat: z.object({ id: z.number().int(), type: z.string() }),
            text: z.string().optional(),
          })
          .optional(),
      })
      .parse(req.body);
    // Persist deduplication only after Telegram accepted the reply; serialize retries.
    await db.transaction(async (c) => {
      if (!c.embedded)
        await c.query("SELECT pg_advisory_xact_lock($1)", [update.update_id]);
      if (
        (
          await c.query(
            "SELECT update_id FROM bot_updates WHERE update_id=$1",
            [update.update_id],
          )
        ).rowCount
      )
        return;
      const msg = update.message;
      if (
        msg?.chat.type === "private" &&
        /^\/(start|help|support)(@\w+)?(?:\s|$)/.test(msg.text ?? "")
      ) {
        const text = msg.text?.startsWith("/support")
          ? process.env.SUPPORT_USERNAME
            ? `Поддержка: @${process.env.SUPPORT_USERNAME}`
            : "Поддержка: обратитесь к владельцу бота."
          : `DOMAIN DROP\nВыбивай редкие виртуальные домены и собирай свою коллекцию.\nСтартовый баланс — ${(await game.configFor(c)).startingBalance} coins.`;
        const response = await fetch(
          `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: msg.chat.id,
              text,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "ОТКРЫТЬ DOMAIN DROP",
                      web_app: { url: process.env.APP_URL },
                    },
                  ],
                ],
              },
            }),
            signal: AbortSignal.timeout(10000),
          },
        );
        const result = (await response.json()) as { ok: boolean };
        if (!result.ok) throw new GameError(502, "Telegram delivery failed");
      }
      await c.query("INSERT INTO bot_updates(update_id) VALUES($1)", [
        update.update_id,
      ]);
    });
    res.json({ ok: true });
  });
  app.use("/api", async (req, res, next) => {
    const token = req
      .get("authorization")
      ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) throw new GameError(401, "Откройте игру через Telegram");
    const session = (
      await db.query(
        "SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()",
        [hashToken(token)],
      )
    ).rows[0];
    if (!session)
      throw new GameError(401, "Сессия истекла. Откройте игру заново");
    res.locals.userId = session.user_id;
    next();
  });
  const traffic = new Map<
    string,
    {
      start: number;
      count: number;
      promos: number;
      repeats: number;
      keys: Set<string>;
    }
  >();
  app.use("/api", async (req, res, next) => {
    const id = res.locals.userId,
      now = Date.now();
    let t = traffic.get(id);
    if (!t || now - t.start > 60000) {
      t = { start: now, count: 0, promos: 0, repeats: 0, keys: new Set() };
      traffic.set(id, t);
    }
    t.count++;
    if (req.path === "/promo/redeem") t.promos++;
    const key = req.get("idempotency-key");
    if (key && t.keys.has(key)) t.repeats++;
    if (key) t.keys.add(key);
    const cfg = await systems.systems(db);
    if (t.count === cfg.security.requestsPerMinute)
      await systems.flag(db, id, "api_rate", { count: t.count });
    if (t.promos === cfg.security.promoAttempts)
      await systems.flag(db, id, "promo_attempts", { count: t.promos });
    if (t.repeats === 10)
      await systems.flag(db, id, "repeated_request_ids", { count: t.repeats });
    if (traffic.size > 10000)
      for (const [k, v] of traffic)
        if (now - v.start > 60000) traffic.delete(k);
    const u = (
      await db.query(
        "SELECT telegram_id,permanent_ban,banned_until FROM users WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (
      !req.path.startsWith("/admin") &&
      (u.permanent_ban ||
        (u.banned_until && new Date(u.banned_until).getTime() > now))
    )
      throw new GameError(403, "Аккаунт заблокирован. Обратитесь в поддержку");
    const cfgGame = await game.configFor(db);
    if (cfgGame.maintenance && !game.isAdmin(u.telegram_id))
      throw new GameError(503, "DOMAIN DROP временно обновляется");
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 120,
      keyGenerator: (_req, res) => res.locals.userId,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Слишком много запросов. Подождите минуту" },
    }),
  );
  app.get("/api/state", async (_req, res) =>
    res.json(await db.transaction((c) => game.state(c, res.locals.userId))),
  );
  app.get("/api/collection", async (req, res) => {
    const q = z
      .object({
        search: z.string().max(64).optional(),
        rarity: z
          .enum(["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"])
          .optional(),
        tld: z
          .string()
          .regex(/^[a-z]{2,12}$/)
          .optional(),
        tag: z.string().max(32).optional(),
        filter: z.enum(["all", "favorite", "vault", "showcase"]).default("all"),
        sort: z
          .enum(["date", "value", "score", "rarity", "tld", "length"])
          .default("date"),
        page: z.coerce.number().int().min(0).max(10000).default(0),
      })
      .parse(req.query);
    const values: unknown[] = [res.locals.userId];
    const where = ["owner_id=$1", "status='kept'"];
    const add = (sql: string, v: unknown) => {
      values.push(v);
      where.push(sql.replace("?", `$${values.length}`));
    };
    if (q.search)
      add(
        "(name||'.'||tld) ILIKE ?",
        "%" + q.search.replace(/[%_\\]/g, "\\$&") + "%",
      );
    if (q.rarity) add("rarity=?", q.rarity);
    if (q.tld) add("tld=?", q.tld);
    if (q.tag) add("tags @> ?::jsonb", JSON.stringify([q.tag]));
    if (q.filter !== "all")
      where.push(
        { favorite: "favorite", vault: "vaulted", showcase: "showcase" }[
          q.filter
        ] + "=true",
      );
    const order = {
      date: "created_at DESC",
      value: "value DESC",
      score: "score DESC",
      rarity:
        "array_position(ARRAY['COMMON','UNCOMMON','RARE','EPIC','LEGENDARY','MYTHIC'],rarity) DESC",
      tld: "tld ASC",
      length: "length(name) ASC",
    }[q.sort];
    const rows = (
      await db.query(
        `SELECT *,count(*) OVER() AS total FROM domains WHERE ${where.join(" AND ")} ORDER BY ${order},id LIMIT 40 OFFSET ${q.page * 40}`,
        values,
      )
    ).rows;
    res.json({
      items: rows.map(game.domainView),
      total: Number(rows[0]?.total ?? 0),
    });
  });
  app.get("/api/collections", async (_req, res) =>
    res.json(
      await db.transaction((c) => game.collections(c, res.locals.userId)),
    ),
  );
  app.get("/api/achievements", async (_req, res) =>
    res.json(
      await db.transaction((c) => game.achievements(c, res.locals.userId)),
    ),
  );
  app.get("/api/themes", async (_req, res) => res.json(game.themes));
  app.get("/api/auctions", async (_req, res) => {
    const rows = (
      await db.query(
        `SELECT a.*,u.first_name AS bidder_name,u.username AS bidder_username,EXISTS(SELECT 1 FROM auction_watchlist w WHERE w.user_id=$1 AND w.auction_id=a.id) AS watched FROM auctions a LEFT JOIN users u ON u.id=a.bidder_id WHERE a.status='active' OR a.id IN (SELECT id FROM auctions WHERE status='settled' ORDER BY ends_at DESC LIMIT 20) OR EXISTS(SELECT 1 FROM auction_watchlist w WHERE w.user_id=$1 AND w.auction_id=a.id) ORDER BY a.starts_at DESC,a.id DESC`,
        [res.locals.userId],
      )
    ).rows;
    res.json(
      rows.map((a) => ({
        ...a,
        bid: Number(a.bid),
        minimum:
          Number(a.bid) > 0
            ? Number(a.bid) + Math.max(100, Math.ceil(Number(a.bid) * 0.05))
            : Number(a.start_price),
        mine: a.bidder_id === res.locals.userId,
        bidder_id: undefined,
      })),
    );
  });
  app.get("/api/leaderboard", async (_req, res) => {
    const rows = (
      await db.query(
        "SELECT u.id,u.username,u.first_name,u.xp,count(d.id)::integer AS domain_count,COALESCE(sum(d.value),0) AS collection_value FROM users u LEFT JOIN domains d ON d.owner_id=u.id AND d.status='kept' GROUP BY u.id ORDER BY collection_value DESC,u.id LIMIT 50",
      )
    ).rows;
    res.json(
      rows.map((r, i) => ({
        ...r,
        rank: i + 1,
        level: levelFor(r.xp),
        collection_value: Number(r.collection_value),
      })),
    );
  });
  app.get("/api/showcase/:id", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const user = (
      await db.query(
        "SELECT id,username,first_name,xp,theme FROM users WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (!user) throw new GameError(404, "Игрок не найден");
    res.json({
      user: { ...user, level: levelFor(user.xp) },
      domains: (
        await db.query(
          "SELECT * FROM domains WHERE owner_id=$1 AND showcase=true AND status='kept' ORDER BY value DESC",
          [id],
        )
      ).rows.map(game.domainView),
    });
  });
  app.get("/api/ledger", async (_req, res) =>
    res.json(
      (
        await db.query(
          "SELECT amount,balance_after,reason,created_at FROM transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
          [res.locals.userId],
        )
      ).rows,
    ),
  );
  const mutation = (
    path: string,
    schema: z.ZodType,
    fn: (c: DBClient, u: any, config: Config, b: any) => Promise<unknown>,
    before?: (c: DBClient, b: any, id: string) => Promise<void>,
  ) =>
    app.post("/api" + path, async (req, res) => {
      const body = schema.parse(req.body ?? {});
      const key = z.uuid().parse(req.get("idempotency-key"));
      res.json(
        await game.mutate(
          db,
          res.locals.userId,
          key,
          path,
          body,
          (c, u, config) => fn(c, u, config, body),
          before ? (c) => before(c, body, res.locals.userId) : undefined,
        ),
      );
    });
  registerSystems(app, db, mutation);
  app.get("/api/recent-drops", async (_req, res) =>
    res.json(
      await db.transaction((c) => play.recentDrops(c, res.locals.userId)),
    ),
  );
  mutation(
    "/auction/watch",
    z.object({ id: z.uuid(), watched: z.boolean() }).strict(),
    (c, u, _cfg, b) => play.watchAuction(c, u.id, b.id, b.watched),
    (c, b, id) => game.auctionBeforeLock(c, b.id, id),
  );
  mutation("/collection/common/preview", z.object({}).strict(), (c, u) =>
    play.previewCommon(c, u.id),
  );
  mutation(
    "/collection/common/sell",
    z.object({ id: z.uuid() }).strict(),
    (c, u, _cfg, b) => play.sellCommon(c, u.id, b.id),
  );
  const empty = z.object({}).strict();
  const idBody = z.object({ id: z.uuid() }).strict();
  mutation(
    "/spin",
    z.object({ tld: z.string().regex(/^[a-z]{2,12}$/) }).strict(),
    (c, u, config, b) => game.spin(c, u, config, false, b.tld),
  );
  mutation("/reroll", empty, (c, u, config) => game.spin(c, u, config, true));
  mutation(
    "/domain",
    z
      .object({
        id: z.uuid(),
        action: z.enum(["keep", "sell", "favorite", "vault", "showcase"]),
      })
      .strict(),
    (c, u, _config, b) => game.domainAction(c, u, b.id, b.action),
  );
  mutation("/daily", empty, game.claimDaily);
  mutation(
    "/quest",
    z.object({ id: z.string().max(32) }).strict(),
    (c, u, _config, b) => game.claimQuest(c, u, b.id),
  );
  mutation("/scanner/open", empty, game.scannerOpen);
  mutation(
    "/scanner/pick",
    z.object({ id: z.uuid(), index: z.number().int().min(0).max(2) }).strict(),
    (c, u, _config, b) => game.scannerPick(c, u, b.id, b.index),
  );
  mutation(
    "/auction/bid",
    z
      .object({ id: z.uuid(), amount: z.number().int().min(1).max(1000000000) })
      .strict(),
    (c, u, _config, b) => game.bid(c, u, b.id, b.amount),
    (c, b, id) => game.auctionBeforeLock(c, b.id, id),
  );
  mutation(
    "/theme",
    z.object({ theme: z.string().max(32) }).strict(),
    async (c, u, _config, b) => {
      const theme = game.themes.find((t) => t.id === b.theme);
      if (
        !theme ||
        (theme.level > levelFor(u.xp) && !u.cosmetics.includes(theme.id))
      )
        throw new GameError(409, "Эта тема пока закрыта");
      await c.query("UPDATE users SET theme=$2 WHERE id=$1", [u.id, theme.id]);
      return { theme: theme.id };
    },
  );
  mutation(
    "/collection/claim",
    z.object({ id: z.string().max(32) }).strict(),
    (c, u, _config, b) => game.claimSet(c, u, b.id),
  );
  mutation(
    "/achievement/claim",
    z.object({ id: z.string().max(32) }).strict(),
    (c, u, _config, b) => game.claimAchievement(c, u, b.id),
  );
  async function admin(c: DBClient, id: string) {
    const u = (await c.query("SELECT telegram_id FROM users WHERE id=$1", [id]))
      .rows[0];
    if (!u || !game.isAdmin(u.telegram_id))
      throw new GameError(403, "Доступ только для администратора");
  }
  app.get("/api/admin", async (_req, res) =>
    res.json(
      await db.transaction(async (c) => {
        await admin(c, res.locals.userId);
        return {
          config: (await c.query("SELECT config FROM settings WHERE id=1"))
            .rows[0].config,
          audit: (
            await c.query(
              "SELECT action,detail,created_at FROM admin_audit ORDER BY created_at DESC LIMIT 30",
            )
          ).rows,
          events: (
            await c.query(
              "SELECT * FROM events ORDER BY starts_at DESC LIMIT 30",
            )
          ).rows,
        };
      }),
    ),
  );
  mutation(
    "/admin/config",
    z
      .object({
        config: configSchema,
        reason: z.string().trim().min(3).max(300),
      })
      .strict(),
    async (c, u, _config, input) => {
      const b = input.config;
      await admin(c, u.id);
      try {
        validateConfig({
          ...b,
          tlds: b.tlds.filter((t: any) => t.enabled !== false),
        });
      } catch {
        throw new GameError(
          400,
          "Активные TLD должны поддерживать все редкости",
        );
      }
      if (b.tlds.filter((t: any) => t.enabled !== false).length < 6)
        throw new GameError(400, "Нужно минимум 6 активных TLD");
      const old = (await c.query("SELECT config FROM settings WHERE id=1"))
        .rows[0].config;
      await c.query(
        "UPDATE settings SET config=$1,version=version+1 WHERE id=1",
        [JSON.stringify(b)],
      );
      await c.query(
        "INSERT INTO admin_audit(id,user_id,action,detail) VALUES($1,$2,$3,$4)",
        [
          randomUUID(),
          u.id,
          "config",
          JSON.stringify({ old, new: b, reason: input.reason }),
        ],
      );
      return { saved: true };
    },
  );
  mutation(
    "/admin/event",
    z
      .object({
        reason: z.string().trim().min(3).max(300),
        title: z.string().min(1).max(80),
        description: z.string().max(240),
        tld: z.string().regex(/^[a-z]{2,12}$/),
        boost: z.number().min(1).max(1.3),
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
      })
      .strict(),
    async (c, u, config, b) => {
      await admin(c, u.id);
      if (
        new Date(b.endsAt) <= new Date(b.startsAt) ||
        !config.tlds.some((t) => t.name === b.tld)
      )
        throw new GameError(400, "Проверьте даты и TLD");
      const id = randomUUID();
      await c.query(
        "INSERT INTO events(id,title,description,tld,boost,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [id, b.title, b.description, b.tld, b.boost, b.startsAt, b.endsAt],
      );
      await c.query(
        "INSERT INTO admin_audit(id,user_id,action,detail) VALUES($1,$2,$3,$4)",
        [randomUUID(), u.id, "event", JSON.stringify(b)],
      );
      return { id };
    },
  );
  mutation(
    "/admin/auction",
    z
      .object({
        name: z.string().regex(/^[a-z0-9]{1,24}$/),
        tld: z.string().regex(/^[a-z]{2,12}$/),
        reason: z.string().trim().min(3).max(300),
        startPrice: z.number().int().min(100).max(100000000),
        hours: z.number().int().min(1).max(168),
      })
      .strict(),
    async (c, u, config, b) => {
      await admin(c, u.id);
      const tld = config.tlds.find((t) => t.name === b.tld);
      if (!tld) throw new GameError(400, "Неизвестная зона");
      const drop = evaluate(b.name, tld, config),
        id = randomUUID();
      await c.query(
        "INSERT INTO auctions(id,domain,ends_at,start_price) VALUES($1,$2,now()+make_interval(hours => $3),$4)",
        [id, JSON.stringify(drop), b.hours, b.startPrice],
      );
      await c.query(
        "INSERT INTO admin_audit(id,user_id,action,detail) VALUES($1,$2,$3,$4)",
        [randomUUID(), u.id, "auction", JSON.stringify(b)],
      );
      return { id };
    },
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Метод не найден" }),
  );
  if (production) {
    app.use(
      express.static(resolve("dist"), {
        maxAge: "1h",
        setHeaders: (response, path) => {
          if (path.endsWith("index.html"))
            response.setHeader("Cache-Control", "no-cache");
        },
      }),
    );
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve("dist/index.html")),
    );
  }
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: "Проверьте введённые данные",
        details: err.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      });
      return;
    }
    if (err instanceof GameError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    // Log type/code only: never log initData, credentials or query parameters.
    console.error("Request failed", {
      type: err instanceof Error ? err.name : "Unknown",
      code: (err as any)?.code,
    });
    res.status(500).json({
      error:
        "Не удалось выполнить действие. Обновите данные и попробуйте снова",
    });
  });
  return app;
}
