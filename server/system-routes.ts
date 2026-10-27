import type { Express } from "express";
import { z } from "zod";
import type { Database, DBClient } from "./db.js";
import * as s from "./systems.js";
import * as g from "./game.js";
import { GameError } from "./auth.js";
import { levelFor, type Config } from "./economy.js";
type Mutator = (
  path: string,
  schema: z.ZodType,
  fn: (c: DBClient, u: any, config: Config, b: any) => Promise<unknown>,
  before?: (c: DBClient, b: any, id: string) => Promise<void>,
) => unknown;
const reason = z.string().trim().min(3).max(300);
export function registerSystems(app: Express, db: Database, mutation: Mutator) {
  const empty = z.object({}).strict();
  app.get("/api/records", async (_req, res) =>
    res.json(await db.transaction((c) => s.records(c))),
  );
  app.get("/api/history", async (req, res) => {
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .parse(req.query.page ?? 0);
    res.json(
      (
        await db.query(
          "SELECT *,balance_after-amount AS balance_before FROM transactions WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT 50 OFFSET $2",
          [res.locals.userId, page * 50],
        )
      ).rows,
    );
  });
  mutation("/quick/upgrade", empty, (c, u) => s.upgrade(c, u));
  mutation("/quick/settings", s.quickSchema, (c, u, _cfg, b) =>
    s.saveQuick(c, u, b),
  );
  mutation(
    "/drop/ack",
    z.object({ id: z.uuid() }).strict(),
    async (c, u, _cfg, b) => {
      await c.query(
        "UPDATE domains SET acknowledged=true WHERE id=$1 AND owner_id=$2 AND quick_sold=true",
        [b.id, u.id],
      );
      return { ok: true };
    },
  );
  mutation("/welcome/ack", empty, async (c, u) => {
    await c.query("UPDATE users SET welcome_ack=true WHERE id=$1", [u.id]);
    return { ok: true };
  });
  mutation(
    "/promo/redeem",
    z.object({ code: z.string().trim().min(3).max(40) }).strict(),
    (c, u, _cfg, b) => s.redeem(c, u, b.code),
  );
  app.use("/api/admin", async (_req, res, next) => {
    await s.adminGuard(db, res.locals.userId);
    next();
  });
  app.get("/api/admin/dashboard", async (_req, res) => {
    const users = (
      await db.query(
        "SELECT count(*)::integer AS players,count(*) FILTER(WHERE last_seen_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::integer AS active_today,COALESCE(sum(coins),0) AS coins FROM users",
      )
    ).rows[0];
    const drops = (
      await db.query(
        "SELECT count(*)::integer AS domains,count(*) FILTER(WHERE source='spin' AND created_at>=(now() AT TIME ZONE 'UTC')::date AT TIME ZONE 'UTC')::integer AS spins_today,count(*) FILTER(WHERE rarity='LEGENDARY' AND created_at>=(now() AT TIME ZONE 'UTC')::date AT TIME ZONE 'UTC')::integer AS legendary_today,count(*) FILTER(WHERE rarity='MYTHIC' AND created_at>=(now() AT TIME ZONE 'UTC')::date AT TIME ZONE 'UTC')::integer AS mythic_today,count(*) FILTER(WHERE quick_sold AND created_at>=(now() AT TIME ZONE 'UTC')::date AT TIME ZONE 'UTC')::integer AS quick_sells_today FROM domains",
      )
    ).rows[0];
    const economy = (
      await db.query(
        "SELECT reason,count(*)::integer AS count,COALESCE(sum(amount),0) AS amount FROM transactions WHERE created_at>=(now() AT TIME ZONE 'UTC')::date AT TIME ZONE 'UTC' GROUP BY reason ORDER BY reason",
      )
    ).rows;
    res.json({
      users,
      drops,
      economy,
      auctions: Number(
        (
          await db.query(
            "SELECT count(*) AS n FROM auctions WHERE status='active'",
          )
        ).rows[0].n,
      ),
      redemptions: Number(
        (await db.query("SELECT count(*) AS n FROM promo_redemptions")).rows[0]
          .n,
      ),
      systems: await s.systems(db),
      config: (await db.query("SELECT config FROM settings WHERE id=1")).rows[0]
        .config,
      flags: (
        await db.query(
          "SELECT f.*,u.username FROM security_flags f JOIN users u ON u.id=f.user_id ORDER BY f.resolved,f.created_at DESC LIMIT 100",
        )
      ).rows,
      audit: (
        await db.query(
          "SELECT a.*,u.username FROM admin_audit a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 100",
        )
      ).rows,
    });
  });
  app.get("/api/admin/players", async (req, res) => {
    const q = z
      .string()
      .max(80)
      .parse(req.query.q ?? "");
    res.json(
      (
        await db.query(
          "SELECT id,telegram_id,username,first_name,coins,xp,quick_level,frozen,permanent_ban,banned_until,created_at FROM users WHERE telegram_id=$1 OR id::text=$1 OR username ILIKE $2 ORDER BY created_at DESC LIMIT 30",
          [q, "%" + q.replace(/[%_\\]/g, "\\$&") + "%"],
        )
      ).rows,
    );
  });
  app.get("/api/admin/player/:id", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const tab = z
      .enum([
        "summary",
        "transactions",
        "spins",
        "auctions",
        "scanner",
        "collection",
      ])
      .parse(req.query.tab ?? "summary");
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .parse(req.query.page ?? 0);
    const queries = {
      summary: "SELECT * FROM users WHERE id=$1",
      transactions:
        "SELECT *,balance_after-amount AS balance_before FROM transactions WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT 40 OFFSET $2",
      spins:
        "SELECT s.*,d.name,d.tld,d.rarity,d.value,d.serial FROM spins s JOIN domains d ON d.id=s.domain_id WHERE s.user_id=$1 ORDER BY s.created_at DESC,s.id LIMIT 40 OFFSET $2",
      auctions:
        "SELECT b.*,a.status,a.domain FROM auction_bids b JOIN auctions a ON a.id=b.auction_id WHERE b.user_id=$1 ORDER BY b.created_at DESC,b.id LIMIT 40 OFFSET $2",
      scanner:
        "SELECT * FROM scanner_sessions WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT 40 OFFSET $2",
      collection:
        "SELECT * FROM domains WHERE owner_id=$1 AND status='kept' ORDER BY created_at DESC,id LIMIT 40 OFFSET $2",
    };
    const rows = (
      await db.query(queries[tab], tab === "summary" ? [id] : [id, page * 40])
    ).rows;
    if (tab === "summary") {
      res.json({
        user: rows[0] ? { ...rows[0], level: levelFor(rows[0].xp) } : null,
        pity: (await db.query("SELECT * FROM zone_pity WHERE user_id=$1", [id]))
          .rows,
        stats: (
          await db.query(
            "SELECT count(*) AS total,COALESCE(sum(value) FILTER(WHERE status='kept'),0) AS collection_value,count(*) FILTER(WHERE serial IS NOT NULL) AS serials,count(*) FILTER(WHERE rarity='LEGENDARY') AS legendary,count(*) FILTER(WHERE rarity='MYTHIC') AS mythic FROM domains WHERE owner_id=$1",
            [id],
          )
        ).rows[0],
      });
    } else res.json(rows);
  });
  app.get("/api/admin/serials", async (req, res) => {
    const q = z
      .string()
      .max(64)
      .parse(req.query.q ?? "");
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .parse(req.query.page ?? 0);
    res.json(
      (
        await db.query(
          "SELECT d.*,u.username FROM domains d JOIN users u ON u.id=COALESCE(d.finder_id,d.owner_id) WHERE d.serial IS NOT NULL AND (d.name||'.'||d.tld) ILIKE $1 ORDER BY d.created_at DESC,d.id LIMIT 50 OFFSET $2",
          ["%" + q.replace(/[%_\\]/g, "\\$&") + "%", page * 50],
        )
      ).rows,
    );
  });
  app.get("/api/admin/records", async (_req, res) => {
    const result = await s.records(db);
    for (const key of ["today", "week", "all", "rarest", "first"] as const) {
      const d = result[key];
      if (d) {
        const extra = (
          await db.query(
            "SELECT s.id AS spin_id,s.kind,d.finder_id AS player_id FROM spins s JOIN domains d ON d.id=s.domain_id WHERE d.id=$1 LIMIT 1",
            [d.id],
          )
        ).rows[0];
        Object.assign(d, extra);
      }
    }
    res.json(result);
  });
  app.get("/api/admin/audit", async (req, res) => {
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .parse(req.query.page ?? 0);
    res.json(
      (
        await db.query(
          "SELECT a.*,u.username,u.telegram_id AS admin_telegram_id FROM admin_audit a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC,a.id LIMIT 50 OFFSET $1",
          [page * 50],
        )
      ).rows,
    );
  });
  app.get("/api/admin/promos", async (_req, res) =>
    res.json(
      (
        await db.query(
          "SELECT p.*, (SELECT count(DISTINCT user_id) FROM promo_redemptions r WHERE r.promo_id=p.id) AS unique_users,uses::bigint*reward_value AS rewards_issued FROM promo_codes p ORDER BY created_at DESC LIMIT 100",
        )
      ).rows,
    ),
  );
  mutation(
    "/admin/systems",
    z.object({ config: s.systemSchema, reason }).strict(),
    async (c, u, _cfg, b) => {
      await s.adminGuard(c, u.id);
      const old = await s.systems(c);
      await c.query("UPDATE system_config SET config=$1 WHERE id=1", [
        JSON.stringify(b.config),
      ]);
      await s.audit(c, u.id, "systems", {
        old,
        new: b.config,
        reason: b.reason,
      });
      return { saved: true };
    },
  );
  mutation("/admin/promo/create", s.promoSchema, (c, u, _cfg, b) =>
    s.createPromo(c, u, b),
  );
  mutation(
    "/admin/promo/toggle",
    z.object({ id: z.uuid(), enabled: z.boolean(), reason }).strict(),
    async (c, u, _cfg, b) => {
      await s.adminGuard(c, u.id);
      const old = (
        await c.query("SELECT * FROM promo_codes WHERE id=$1 FOR UPDATE", [
          b.id,
        ])
      ).rows[0];
      if (!old) throw new GameError(404, "Код не найден");
      await c.query("UPDATE promo_codes SET enabled=$2 WHERE id=$1", [
        b.id,
        b.enabled,
      ]);
      await s.audit(c, u.id, "promo_toggle", {
        old: old.enabled,
        new: b.enabled,
        id: b.id,
        reason: b.reason,
      });
      return { ok: true };
    },
  );
  mutation(
    "/admin/flag/resolve",
    z.object({ id: z.uuid(), reason }).strict(),
    async (c, u, _cfg, b) => {
      await s.adminGuard(c, u.id);
      await c.query("UPDATE security_flags SET resolved=true WHERE id=$1", [
        b.id,
      ]);
      await s.audit(c, u.id, "flag_resolve", b);
      return { ok: true };
    },
  );
  mutation(
    "/admin/player/update",
    z
      .object({
        id: z.uuid(),
        action: z.enum([
          "coins",
          "xp",
          "reroll",
          "scanner",
          "quick_level",
          "pity_reset",
          "freeze",
          "unfreeze",
          "ban",
          "unban",
        ]),
        amount: z.number().int().min(-1000000000).max(1000000000).default(0),
        until: z.iso.datetime().nullable().default(null),
        reason,
      })
      .strict(),
    async (c, u, _cfg, b) => {
      await s.adminGuard(c, u.id);
      const target = await g.lockUser(c, b.id);
      if (b.action === "ban" && g.isAdmin(target.telegram_id))
        throw new GameError(
          409,
          "Администратора нельзя заблокировать через игровую панель",
        );
      let old: any = target,
        newValue: any;
      if (b.action === "coins") {
        await g.credit(c, b.id, b.amount, "admin", u.id);
        newValue = Number(target.coins) + b.amount;
        old = Number(target.coins);
      } else if (b.action === "xp") {
        if (
          b.amount < 0 ||
          b.amount > 1000000 ||
          target.xp + b.amount > 2000000000
        )
          throw new GameError(400, "Проверьте XP");
        await g.awardXp(c, b.id, b.amount);
        old = target.xp;
        newValue = target.xp + b.amount;
      } else if (["reroll", "scanner"].includes(b.action)) {
        const col = b.action === "reroll" ? "reroll_tokens" : "scanner_tokens";
        newValue = target[col] + b.amount;
        if (newValue < 0 || newValue > 1000000)
          throw new GameError(400, "Недопустимое количество tokens");
        old = target[col];
        await c.query(`UPDATE users SET ${col}=$2 WHERE id=$1`, [
          b.id,
          newValue,
        ]);
      } else if (b.action === "quick_level") {
        if (b.amount < 0 || b.amount > 5)
          throw new GameError(400, "Уровень 0–5");
        old = target.quick_level;
        newValue = b.amount;
        await c.query("UPDATE users SET quick_level=$2 WHERE id=$1", [
          b.id,
          b.amount,
        ]);
      } else if (b.action === "pity_reset") {
        old = (
          await c.query("SELECT tld,counter FROM zone_pity WHERE user_id=$1", [
            b.id,
          ])
        ).rows;
        newValue = 0;
        await c.query("UPDATE zone_pity SET counter=0 WHERE user_id=$1", [
          b.id,
        ]);
        await c.query("UPDATE users SET pity=0 WHERE id=$1", [b.id]);
      } else if (b.action === "freeze" || b.action === "unfreeze") {
        old = target.frozen;
        newValue = b.action === "freeze";
        await c.query("UPDATE users SET frozen=$2 WHERE id=$1", [
          b.id,
          newValue,
        ]);
      } else {
        if (
          b.action === "ban" &&
          b.until &&
          new Date(b.until).getTime() <= Date.now()
        )
          throw new GameError(400, "Дата бана должна быть в будущем");
        old = { permanent: target.permanent_ban, until: target.banned_until };
        newValue = {
          permanent: b.action === "ban" && !b.until,
          until: b.action === "ban" ? b.until : null,
        };
        await c.query(
          "UPDATE users SET permanent_ban=$2,banned_until=$3 WHERE id=$1",
          [b.id, newValue.permanent, newValue.until],
        );
      }
      await s.audit(c, u.id, "player_" + b.action, {
        target: b.id,
        old,
        new: newValue,
        reason: b.reason,
      });
      return { ok: true };
    },
    async (c, b, id) => {
      await s.adminGuard(c, id);
      for (const target of [...new Set([id, b.id])].sort())
        await g.lockUser(c, target);
    },
  );
}
