import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { DBClient } from "./db.js";
import { GameError } from "./auth.js";
import {
  credit,
  progress,
  awardXp,
  isAdmin,
  domainView,
  themes,
} from "./game.js";
import { rarities } from "../shared/types.js";
import type { Drop } from "./economy.js";
export const systemSchema = z
  .object({
    quickEnabled: z.boolean(),
    quickCosts: z.array(z.number().int().min(0).max(1000000)).length(5),
    quickMaxLevel: z.number().int().min(0).max(5),
    quickRarities: z.array(z.enum(["COMMON", "UNCOMMON"])).min(1),
    protectedTags: z.array(z.string().max(32)).max(30),
    serialMinRarity: z.enum(rarities),
    serialSpecial: z.array(z.enum(["PERFECT MATCH", "ULTRA SHORT", "EVENT"])),
    flags: z.object({
      spin: z.boolean(),
      auction: z.boolean(),
      scanner: z.boolean(),
      reroll: z.boolean(),
      promo: z.boolean(),
      events: z.boolean(),
      feed: z.boolean(),
    }),
    security: z.object({
      spinsPerDay: z.number().int().min(10),
      requestsPerMinute: z.number().int().min(10),
      coinGrowth: z.number().int().min(1000),
      promoAttempts: z.number().int().min(2),
      bidsPerDay: z.number().int().min(5),
    }),
  })
  .strict();
export type SystemConfig = z.infer<typeof systemSchema>;
export const systemDefaults: SystemConfig = {
  quickEnabled: true,
  quickCosts: [1000, 2500, 5000, 10000, 20000],
  quickMaxLevel: 5,
  quickRarities: ["COMMON", "UNCOMMON"],
  protectedTags: [
    "SHORT",
    "ULTRA SHORT",
    "TRIPLE",
    "PERFECT MATCH",
    "PALINDROME",
    "MIRROR",
    "SEQUENCE",
  ],
  serialMinRarity: "EPIC",
  serialSpecial: ["PERFECT MATCH", "ULTRA SHORT", "EVENT"],
  flags: {
    spin: true,
    auction: true,
    scanner: true,
    reroll: true,
    promo: true,
    events: true,
    feed: true,
  },
  security: {
    spinsPerDay: 5000,
    requestsPerMinute: 100,
    promoAttempts: 15,
    coinGrowth: 1000000,
    bidsPerDay: 200,
  },
};
export const quickSchema = z
  .object({
    enabled: z.boolean(),
    rarities: z
      .array(z.enum(["COMMON", "UNCOMMON"]))
      .min(1)
      .max(2),
    below: z.number().int().min(1).max(100000000).nullable(),
    tlds: z.array(z.string().regex(/^[a-z]{2,12}$/)).max(120),
    keepTags: z.array(z.enum(["SHORT", "TRIPLE", "PERFECT MATCH"])).max(3),
    favoriteTld: z
      .string()
      .regex(/^[a-z]{2,12}$/)
      .nullable(),
  })
  .strict();
export async function systems(c: DBClient): Promise<SystemConfig> {
  return systemSchema.parse(
    (await c.query("SELECT config FROM system_config WHERE id=1")).rows[0]
      .config,
  );
}
export async function adminGuard(c: DBClient, id: string) {
  const u = (await c.query("SELECT telegram_id FROM users WHERE id=$1", [id]))
    .rows[0];
  if (!u || !isAdmin(u.telegram_id))
    throw new GameError(403, "Доступ только для администратора");
}
export async function audit(
  c: DBClient,
  actor: string,
  action: string,
  detail: unknown,
) {
  await c.query(
    "INSERT INTO admin_audit(id,user_id,action,detail) VALUES($1,$2,$3,$4)",
    [randomUUID(), actor, action, JSON.stringify(detail)],
  );
}
export async function flag(
  c: DBClient,
  user: string,
  kind: string,
  detail: unknown = {},
) {
  await c.query(
    "INSERT INTO security_flags(id,user_id,kind,detail) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,kind,day) DO NOTHING",
    [randomUUID(), user, kind, JSON.stringify(detail)],
  );
}
export async function access(c: DBClient, u: any, path: string, body: any) {
  const s = await systems(c);
  if (!path.startsWith("/admin/")) {
    if (
      u.permanent_ban ||
      (u.banned_until && new Date(u.banned_until).getTime() > Date.now())
    )
      throw new GameError(403, "Аккаунт заблокирован. Обратитесь в поддержку");
    if (u.frozen && !["/drop/ack", "/welcome/ack", "/theme"].includes(path))
      throw new GameError(403, "Экономика аккаунта заморожена");
  }
  const feature =
    path === "/spin"
      ? "spin"
      : path === "/reroll"
        ? "reroll"
        : path.startsWith("/scanner/")
          ? "scanner"
          : path.startsWith("/auction/")
            ? "auction"
            : path === "/promo/redeem"
              ? "promo"
              : null;
  if (feature && !s.flags[feature])
    throw new GameError(503, "Функция временно отключена");
  if (path.startsWith("/quick/") && !s.quickEnabled)
    throw new GameError(503, "Quick Sell временно отключён");
}
export function matchesQuick(u: any, d: any, s: SystemConfig) {
  const r = u.quick_rules,
    level = Math.min(u.quick_level, s.quickMaxLevel);
  if (
    (r.below !== null && level < 3) ||
    (r.tlds.length && level < 4) ||
    (r.favoriteTld && level < 5)
  )
    return false;
  return !!(
    s.quickEnabled &&
    level >= 1 &&
    r.enabled &&
    ["COMMON", "UNCOMMON"].includes(d.rarity) &&
    s.quickRarities.includes(d.rarity) &&
    !d.serial &&
    !d.favorite &&
    !d.vaulted &&
    !d.tags.some((t: string) => s.protectedTags.includes(t)) &&
    r.rarities.includes(d.rarity) &&
    (d.rarity !== "UNCOMMON" || level >= 2) &&
    (level < 3 || r.below === null || d.value < r.below) &&
    (level < 4 || !r.tlds.length || r.tlds.includes(d.tld)) &&
    (level < 5 ||
      (!d.tags.some((t: string) => r.keepTags.includes(t)) &&
        r.favoriteTld !== d.tld))
  );
}
export async function serialAndDiscovery(
  c: DBClient,
  userId: string,
  drop: Drop,
  source: string,
) {
  if (!["spin", "reroll", "scanner"].includes(source))
    return { serial: null, finder: null, discovery: {} };
  // Serialize global record comparisons. Does not touch or lock another player's row.
  if (!c.embedded) await c.query("SELECT pg_advisory_xact_lock(7346823)");
  const s = await systems(c);
  const event =
    s.flags.events &&
    (
      await c.query(
        "SELECT id FROM events WHERE tld=$1 AND starts_at<=now() AND ends_at>now() LIMIT 1",
        [drop.tld],
      )
    ).rowCount;
  const eligible =
    rarities.indexOf(drop.rarity) >= rarities.indexOf(s.serialMinRarity) ||
    drop.tags.some((t) => s.serialSpecial.includes(t as any)) ||
    (s.serialSpecial.includes("EVENT") && event);
  let serial = null;
  if (eligible)
    serial = Number(
      (
        await c.query(
          "INSERT INTO domain_serial_counters(name,tld,last_number) VALUES($1,$2,1) ON CONFLICT(name,tld) DO UPDATE SET last_number=domain_serial_counters.last_number+1 RETURNING last_number",
          [drop.name, drop.tld],
        )
      ).rows[0].last_number,
    );
  const rows = (
    await c.query(
      "SELECT COALESCE((SELECT value FROM domains WHERE source IN ('spin','reroll','scanner') ORDER BY value DESC,created_at,id LIMIT 1),0) AS global,COALESCE((SELECT value FROM domains WHERE source IN ('spin','reroll','scanner') AND COALESCE(finder_id,owner_id)=$1 ORDER BY value DESC,created_at,id LIMIT 1),0) AS personal",
      [userId],
    )
  ).rows[0];
  return {
    serial,
    finder: userId,
    discovery: {
      globalRecord: drop.value > Number(rows.global),
      personalBest: drop.value > Number(rows.personal),
      oldPersonal: Number(rows.personal),
      firstFound: serial === 1,
      event: !!event,
    },
  };
}
export async function quickSell(c: DBClient, u: any, id: string) {
  const d = (await c.query("SELECT * FROM domains WHERE id=$1", [id])).rows[0];
  if (matchesQuick(u, d, await systems(c))) {
    await c.query(
      "UPDATE domains SET status='sold',quick_sold=true,acknowledged=false WHERE id=$1",
      [id],
    );
    await credit(c, u.id, Number(d.value), "quick_sell", id);
    await progress(c, u.id, "sell");
  }
}
export async function upgrade(c: DBClient, u: any) {
  const s = await systems(c);
  if (u.quick_level >= s.quickMaxLevel)
    throw new GameError(409, "Максимальный уровень");
  await credit(c, u.id, -s.quickCosts[u.quick_level], "quick_upgrade");
  await c.query("UPDATE users SET quick_level=quick_level+1 WHERE id=$1", [
    u.id,
  ]);
  return { level: u.quick_level + 1 };
}
export async function saveQuick(
  c: DBClient,
  u: any,
  r: z.infer<typeof quickSchema>,
) {
  if (r.enabled && u.quick_level < 1)
    throw new GameError(409, "Сначала откройте Quick Sell");
  if (
    (r.rarities.includes("UNCOMMON") && u.quick_level < 2) ||
    (r.below !== null && u.quick_level < 3) ||
    (r.tlds.length && u.quick_level < 4) ||
    (r.favoriteTld && u.quick_level < 5)
  )
    throw new GameError(409, "Недостаточный уровень Quick Sell");
  await c.query("UPDATE users SET quick_rules=$2 WHERE id=$1", [
    u.id,
    JSON.stringify(r),
  ]);
  return { saved: true };
}
export async function records(c: DBClient) {
  const base =
    "SELECT d.*,u.username,u.first_name FROM domains d JOIN users u ON u.id=COALESCE(d.finder_id,d.owner_id) WHERE d.source IN ('spin','reroll','scanner')";
  const one = async (
    extra: string,
    order = "d.value DESC,d.created_at,d.id",
  ) => {
    const d = (await c.query(base + extra + " ORDER BY " + order + " LIMIT 1"))
      .rows[0];
    return d ? publicDrop(d) : null;
  };
  const feed = (
    await c.query(
      base +
        " AND (d.serial=1 OR d.rarity IN ('LEGENDARY','MYTHIC') OR (d.rarity NOT IN ('COMMON','UNCOMMON') AND d.discovery->>'globalRecord'='true')) ORDER BY d.created_at DESC,d.id DESC LIMIT 30",
    )
  ).rows.map(publicDrop);
  return {
    today: await one(
      " AND d.created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
    ),
    week: await one(
      " AND d.created_at>=date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
    ),
    all: await one(""),
    rarest: await one(
      "",
      "array_position(ARRAY['COMMON','UNCOMMON','RARE','EPIC','LEGENDARY','MYTHIC'],d.rarity) DESC,d.score DESC,d.value DESC,d.created_at,d.id",
    ),
    first: await one(" AND d.serial=1", "d.created_at DESC,d.id"),
    feed: (await systems(c)).flags.feed ? feed : [],
  };
}
function publicDrop(d: any) {
  const {
    id,
    name,
    tld,
    rarity,
    score,
    value,
    tags,
    breakdown,
    serial,
    created_at,
    username,
    first_name,
    discovery,
  } = d;
  return {
    id,
    name,
    tld,
    rarity,
    score,
    value: Number(value),
    tags,
    breakdown,
    serial: serial ? Number(serial) : null,
    created_at,
    username,
    first_name,
    discovery,
  };
}
export const promoSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,40}$/),
    rewardType: z.enum(["coins", "reroll", "scanner", "xp", "cosmetic"]),
    rewardValue: z.number().int().min(1).max(1000000),
    cosmetic: z.string().max(32).nullable(),
    totalLimit: z.number().int().min(1).max(10000000),
    userLimit: z.number().int().min(1).max(1000),
    startsAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    enabled: z.boolean(),
  })
  .strict();
export async function createPromo(
  c: DBClient,
  u: any,
  b: z.infer<typeof promoSchema>,
) {
  await adminGuard(c, u.id);
  if (
    new Date(b.expiresAt) <= new Date(b.startsAt) ||
    b.userLimit > b.totalLimit
  )
    throw new GameError(400, "Проверьте даты и лимиты");
  if (b.rewardType === "cosmetic" && !themes.some((t) => t.id === b.cosmetic))
    throw new GameError(400, "Выберите существующую тему");
  if (
    (await c.query("SELECT id FROM promo_codes WHERE code=$1", [b.code]))
      .rowCount
  )
    throw new GameError(409, "Такой код уже есть");
  const id = randomUUID();
  await c.query(
    "INSERT INTO promo_codes(id,code,reward_type,reward_value,cosmetic,total_limit,user_limit,starts_at,expires_at,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      id,
      b.code,
      b.rewardType,
      b.rewardValue,
      b.cosmetic,
      b.totalLimit,
      b.userLimit,
      b.startsAt,
      b.expiresAt,
      b.enabled,
    ],
  );
  await audit(c, u.id, "promo_create", { id, ...b });
  return { id };
}
export async function redeem(c: DBClient, u: any, code: string) {
  const p = (
    await c.query("SELECT * FROM promo_codes WHERE code=$1 FOR UPDATE", [
      code.trim().toUpperCase(),
    ])
  ).rows[0];
  if (
    !p ||
    !p.enabled ||
    new Date(p.starts_at).getTime() > Date.now() ||
    new Date(p.expires_at).getTime() <= Date.now() ||
    p.uses >= p.total_limit
  )
    throw new GameError(409, "Промокод недоступен");
  const n = Number(
    (
      await c.query(
        "SELECT count(*) AS n FROM promo_redemptions WHERE promo_id=$1 AND user_id=$2",
        [p.id, u.id],
      )
    ).rows[0].n,
  );
  if (n >= p.user_limit)
    throw new GameError(409, "Лимит использований исчерпан");
  await c.query(
    "INSERT INTO promo_redemptions(id,promo_id,user_id,ordinal,reward_type,reward_value) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), p.id, u.id, n + 1, p.reward_type, p.reward_value],
  );
  await c.query("UPDATE promo_codes SET uses=uses+1 WHERE id=$1", [p.id]);
  if (p.reward_type === "coins")
    await credit(c, u.id, p.reward_value, "promo", p.id);
  else if (p.reward_type === "xp") await awardXp(c, u.id, p.reward_value);
  else if (p.reward_type === "cosmetic")
    await c.query(
      "UPDATE users SET cosmetics=CASE WHEN cosmetics @> $2::jsonb THEN cosmetics ELSE cosmetics||$2::jsonb END WHERE id=$1",
      [u.id, JSON.stringify([p.cosmetic])],
    );
  else {
    const col =
      p.reward_type === "scanner" ? "scanner_tokens" : "reroll_tokens";
    await c.query(`UPDATE users SET ${col}=${col}+$2 WHERE id=$1`, [
      u.id,
      p.reward_value,
    ]);
  }
  return { reward: p.reward_type, value: p.reward_value };
}
