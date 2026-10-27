import { fillAuctions } from "./play-features.js";
import * as systems from "./systems.js";
import { randomUUID, createHash } from "node:crypto";
import type { DBClient, Database } from "./db.js";
import { GameError } from "./auth.js";
import {
  zoneMarkets,
  chanceFor,
  generateForZone,
  randomMarket,
  randomChance,
  generateRandom,
} from "./zone-market.js";
import {
  generate,
  evaluate,
  xpFor,
  levelFor,
  type Config,
  type Drop,
} from "./economy.js";
import {
  rarities,
  type Domain,
  type State,
  type Quest,
} from "../shared/types.js";
export const quests = [
  {
    id: "spin",
    title: "Сделать 10 вращений",
    metric: "spin",
    target: 10,
    coins: 500,
    xp: 25,
    scanner: 0,
    reroll: 0,
  },
  {
    id: "rare",
    title: "Найти Rare или выше",
    metric: "rare",
    target: 1,
    coins: 250,
    xp: 15,
    scanner: 0,
    reroll: 0,
  },
  {
    id: "keep",
    title: "Сохранить 3 домена",
    metric: "keep",
    target: 3,
    coins: 200,
    xp: 10,
    scanner: 1,
    reroll: 0,
  },
  {
    id: "sell",
    title: "Продать 5 доменов",
    metric: "sell",
    target: 5,
    coins: 250,
    xp: 10,
    scanner: 0,
    reroll: 0,
  },
  {
    id: "scanner",
    title: "Открыть Domain Scanner",
    metric: "scanner",
    target: 1,
    coins: 100,
    xp: 10,
    scanner: 0,
    reroll: 0,
  },
  {
    id: "bid",
    title: "Сделать ставку",
    metric: "bid",
    target: 1,
    coins: 100,
    xp: 10,
    scanner: 0,
    reroll: 0,
  },
  {
    id: "short",
    title: "Найти 3 коротких домена",
    metric: "short",
    target: 3,
    coins: 150,
    xp: 10,
    scanner: 0,
    reroll: 1,
  },
];
export const themes = [
  { id: "CYBER", level: 1, color: "#5485ff" },
  { id: "TERMINAL", level: 2, color: "#79ed9c" },
  { id: "NEON", level: 3, color: "#f27fca" },
  { id: "GOLD", level: 5, color: "#e9bf6b" },
  { id: "MATRIX", level: 7, color: "#41e296" },
  { id: "RETRO INTERNET", level: 10, color: "#ac9cff" },
];
export const sets = [
  {
    id: "tech",
    title: "Tech collection",
    tlds: ["ai", "io", "dev", "app"],
    coins: 1500,
  },
  {
    id: "europe",
    title: "Europe collection",
    tlds: ["uk", "de", "fr", "fi", "pl", "it", "es"],
    coins: 2500,
  },
  {
    id: "premium",
    title: "Premium collection",
    tlds: ["com", "co", "me"],
    coins: 2000,
  },
];
export const daySQL = "(now() AT TIME ZONE 'UTC')::date";
export const isAdmin = (telegramId: string) =>
  (process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(telegramId);
export async function configFor(c: DBClient): Promise<Config> {
  const config = (await c.query("SELECT config FROM settings WHERE id=1"))
    .rows[0].config;
  return {
    ...config,
    tlds: config.tlds.filter((t: any) => t.enabled !== false),
  };
}
export async function lockUser(c: DBClient, id: string) {
  const user = (
    await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (!user) throw new GameError(401, "Войдите заново");
  return user;
}
export async function credit(
  c: DBClient,
  userId: string,
  amount: number,
  reason: string,
  reference?: string,
) {
  const result = await c.query(
    "UPDATE users SET coins=coins+$2 WHERE id=$1 AND coins+$2>=0 AND coins+$2<=9000000000000 RETURNING coins",
    [userId, amount],
  );
  if (!result.rowCount)
    throw new GameError(409, "Недостаточно coins или достигнут лимит баланса");
  await c.query(
    "INSERT INTO transactions(id,user_id,amount,balance_after,reason,reference) VALUES($1,$2,$3,$4,$5,$6)",
    [
      randomUUID(),
      userId,
      amount,
      result.rows[0].coins,
      reason,
      reference ?? null,
    ],
  );
}
export async function progress(
  c: DBClient,
  userId: string,
  metric: string,
  amount = 1,
) {
  await c.query(
    `INSERT INTO daily_progress(user_id,day,metric,value) VALUES($1,${daySQL},$2,$3) ON CONFLICT(user_id,day,metric) DO UPDATE SET value=daily_progress.value+$3`,
    [userId, metric, amount],
  );
}
export async function awardXp(c: DBClient, userId: string, xp: number) {
  const u = (await c.query("SELECT xp FROM users WHERE id=$1", [userId]))
    .rows[0];
  if (u.xp + xp > 2000000000) throw new GameError(409, "Достигнут лимит XP");
  const before = levelFor(u.xp),
    after = levelFor(u.xp + xp);
  await c.query(
    "UPDATE users SET xp=xp+$2,scanner_tokens=scanner_tokens+$3,vault_slots=GREATEST(vault_slots,$4) WHERE id=$1",
    [userId, xp, after - before, after >= 10 ? 20 : after >= 5 ? 10 : 5],
  );
}
export async function insertDomain(
  c: DBClient,
  userId: string,
  drop: Drop,
  status = "pending",
  source = "spin",
  spinMode?: string,
) {
  const id = randomUUID();
  const meta = await systems.serialAndDiscovery(c, userId, drop, source);
  await c.query(
    "INSERT INTO domains(id,owner_id,name,tld,rarity,score,value,tags,breakdown,status,source,spin_mode,serial,finder_id,discovery) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
    [
      id,
      userId,
      drop.name,
      drop.tld,
      drop.rarity,
      drop.score,
      drop.value,
      JSON.stringify(drop.tags),
      JSON.stringify(drop.breakdown),
      status,
      source,
      spinMode ?? null,
      meta.serial,
      meta.finder,
      JSON.stringify(meta.discovery),
    ],
  );
  return id;
}
export const domainView = (d: any): Domain => ({
  ...d,
  value: Number(d.value),
});
export async function questsFor(c: DBClient, userId: string): Promise<Quest[]> {
  const rows = (
    await c.query(
      `SELECT metric,value FROM daily_progress WHERE user_id=$1 AND day=${daySQL}`,
      [userId],
    )
  ).rows;
  const claimed = (
    await c.query(
      `SELECT reward_key FROM reward_claims WHERE user_id=$1 AND reward_key LIKE ('quest:'||${daySQL}::text||':%')`,
      [userId],
    )
  ).rows;
  return quests.map((q) => ({
    ...q,
    progress: Math.min(
      q.target,
      rows.find((r) => r.metric === q.metric)?.value ?? 0,
    ),
    claimed: claimed.some((r) => r.reward_key.endsWith(":" + q.id)),
  }));
}
export async function state(c: DBClient, userId: string): Promise<State> {
  const u = (
    await c.query(
      `SELECT *,daily_claim_date=${daySQL} AS daily_claimed,reroll_date=${daySQL} AS reroll_used FROM users WHERE id=$1`,
      [userId],
    )
  ).rows[0];
  if (!u) throw new GameError(401, "Войдите заново");
  const config = await configFor(c);
  const sys = await systems.systems(c);
  const zonePity = (
    await c.query("SELECT tld,counter FROM zone_pity WHERE user_id=$1", [
      userId,
    ])
  ).rows;
  const activeEvents = !sys.flags.events
    ? []
    : (
        await c.query(
          "SELECT * FROM events WHERE starts_at<=now() AND ends_at>now() ORDER BY starts_at DESC",
        )
      ).rows;
  const collection = (
    await c.query(
      "SELECT count(*)::integer AS count,COALESCE(sum(value),0) AS value FROM domains WHERE owner_id=$1 AND status='kept'",
      [userId],
    )
  ).rows[0];
  const rareCounts = (
    await c.query(
      "SELECT rarity,count(*)::integer AS count FROM domains WHERE owner_id=$1 AND source IN ('spin','reroll','scanner') GROUP BY rarity",
      [userId],
    )
  ).rows;
  const best = (
    await c.query(
      "SELECT * FROM domains WHERE COALESCE(finder_id,owner_id)=$1 AND source IN ('spin','reroll','scanner') ORDER BY value DESC,created_at,id LIMIT 1",
      [userId],
    )
  ).rows[0];
  const favoriteTld =
    (
      await c.query(
        "SELECT d.tld,count(*)::integer AS count FROM spins s JOIN domains d ON d.id=s.domain_id WHERE s.user_id=$1 AND s.kind='spin' GROUP BY d.tld ORDER BY count(*) DESC,max(s.created_at) DESC,d.tld LIMIT 1",
        [userId],
      )
    ).rows[0] ?? null;
  const pending = (
    await c.query(
      "SELECT * FROM domains WHERE owner_id=$1 AND (status='pending' OR (quick_sold=true AND acknowledged=false)) ORDER BY created_at DESC LIMIT 1",
      [userId],
    )
  ).rows[0];
  return {
    systems: sys,
    account: {
      frozen: u.frozen,
      banned:
        u.permanent_ban ||
        !!(u.banned_until && new Date(u.banned_until).getTime() > Date.now()),
      maintenance: config.maintenance && !isAdmin(u.telegram_id),
    },
    welcome: u.welcome_ack ? null : u.welcome_amount,
    quickSell: { level: u.quick_level, rules: u.quick_rules },
    cosmetics: u.cosmetics,
    profile: {
      id: u.id,
      username: u.username,
      first_name: u.first_name,
      coins: Number(u.coins),
      xp: u.xp,
      level: levelFor(u.xp),
      pity: u.pity,
      spins: u.spins,
      free_spin: u.free_spin,
      daily_claimed: !!u.daily_claimed,
      reroll_available: !u.reroll_used && config.dailyRerolls > 0,
      reroll_tokens: u.reroll_tokens,
      scanner_tokens: u.scanner_tokens,
      vault_slots: u.vault_slots,
      theme: u.theme,
      onboarded: u.onboarded,
      admin: isAdmin(u.telegram_id),
      collection_count: collection.count,
      collection_value: Number(collection.value),
      rare_counts: Object.fromEntries(
        rareCounts.map((r) => [r.rarity, r.count]),
      ),
      best_domain: best ? domainView(best) : null,
      favorite_tld: favoriteTld?.tld ?? null,
      favorite_tld_count: favoriteTld?.count ?? 0,
    },
    pending: pending ? domainView(pending) : null,
    config: {
      spinPrice: config.spinPrice,
      dailyReward: config.dailyReward,
      pityGuarantee: config.pityGuarantee,
      pityStart: config.pityStart,
      zones: [
        ...[...zoneMarkets(config).values()].map((zone) => {
          const pity = zonePity.find((p) => p.tld === zone.name)?.counter ?? 0;
          return {
            name: zone.name,
            spinPrice: zone.spinPrice,
            multiplier: zone.multiplier,
            baseRareChance: zone.baseRareChance,
            rareChance: chanceFor(zone, config, pity),
            pity,
          };
        }),
        {
          name: "random",
          spinPrice: randomMarket(config).spinPrice,
          multiplier: null,
          baseRareChance: randomChance(
            config,
            0,
            activeEvents[0]
              ? {
                  tld: activeEvents[0].tld,
                  boost: Number(activeEvents[0].boost),
                }
              : undefined,
          ),
          rareChance: randomChance(
            config,
            zonePity.find((p) => p.tld === "random")?.counter ?? 0,
            activeEvents[0]
              ? {
                  tld: activeEvents[0].tld,
                  boost: Number(activeEvents[0].boost),
                }
              : undefined,
          ),
          pity: zonePity.find((p) => p.tld === "random")?.counter ?? 0,
        },
      ],
    },
    quests: await questsFor(c, userId),
    events: activeEvents as any,
    scanner:
      ((
        await c.query(
          "SELECT id FROM scanner_sessions WHERE user_id=$1 AND picked IS NULL",
          [userId],
        )
      ).rows[0] as { id: string }) ?? null,
    serverTime: new Date().toISOString(),
  };
}
export async function mutate(
  db: Database,
  userId: string,
  key: string,
  action: string,
  body: unknown,
  fn: (c: DBClient, u: any, config: Config) => Promise<unknown>,
  beforeLock?: (c: DBClient) => Promise<void>,
) {
  const fingerprint = createHash("sha256")
    .update(action + JSON.stringify(body))
    .digest("hex");
  return db.transaction(async (c) => {
    if (beforeLock) await beforeLock(c);
    const u = await lockUser(c, userId);
    const previous = (
      await c.query("SELECT * FROM requests WHERE user_id=$1 AND key=$2", [
        userId,
        key,
      ])
    ).rows[0];
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new GameError(409, "Этот ключ запроса уже использован");
      return previous.response;
    }
    const config = await configFor(c);
    if (config.maintenance && !isAdmin(u.telegram_id))
      throw new GameError(
        503,
        "Техническое обслуживание. Вернитесь немного позже",
      );
    await systems.access(c, u, action, body);
    const data = await fn(c, u, config);
    const security = (await systems.systems(c)).security;
    const stats = (
      await c.query(
        "SELECT count(*) FILTER(WHERE kind='spin') AS n FROM spins WHERE user_id=$1 AND created_at>=(now() AT TIME ZONE 'UTC')::date AT TIME ZONE 'UTC'",
        [userId],
      )
    ).rows[0];
    if (Number(stats.n) >= security.spinsPerDay)
      await systems.flag(c, userId, "spin_rate", { count: Number(stats.n) });
    const gains = Number(
      (
        await c.query(
          "SELECT COALESCE(sum(amount),0) AS n FROM transactions WHERE user_id=$1 AND created_at>=(now() AT TIME ZONE 'UTC')::date AT TIME ZONE 'UTC'",
          [userId],
        )
      ).rows[0].n,
    );
    if (gains >= security.coinGrowth)
      await systems.flag(c, userId, "coin_growth", { amount: gains });
    if (action === "/auction/bid") {
      const n = Number(
        (
          await c.query(
            "SELECT count(*) AS n FROM auction_bids WHERE user_id=$1 AND created_at>=(now() AT TIME ZONE 'UTC')::date AT TIME ZONE 'UTC'",
            [userId],
          )
        ).rows[0].n,
      );
      if (n >= security.bidsPerDay)
        await systems.flag(c, userId, "auction_activity", { count: n });
    }
    const response = { data, state: await state(c, userId) };
    await c.query(
      "INSERT INTO requests(user_id,key,fingerprint,response) VALUES($1,$2,$3,$4)",
      [userId, key, fingerprint, JSON.stringify(response)],
    );
    return response;
  });
}
async function recordDrop(
  c: DBClient,
  u: any,
  drop: Drop,
  kind: string,
  cost: number,
  pityZone?: string,
) {
  const id = await insertDomain(c, u.id, drop, "pending", kind, pityZone);
  await c.query(
    "INSERT INTO spins(id,user_id,domain_id,kind,cost,pity_before) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), u.id, id, kind, cost, u.pity],
  );
  const rare = rarities.indexOf(drop.rarity) >= 2;
  if (pityZone)
    await c.query(
      "UPDATE zone_pity SET counter=$3 WHERE user_id=$1 AND tld=$2",
      [u.id, pityZone, rare ? 0 : u.pity + 1],
    );
  await c.query(
    "UPDATE users SET pity=$2,spins=spins+$3,last_spin_at=now() WHERE id=$1",
    [u.id, rare ? 0 : u.pity + 1, kind === "spin" ? 1 : 0],
  );
  await awardXp(c, u.id, xpFor(drop.rarity));
  if (kind === "spin") await progress(c, u.id, "spin");
  if (rare) await progress(c, u.id, "rare");
  if (drop.tags.includes("SHORT") || drop.tags.includes("ULTRA SHORT"))
    await progress(c, u.id, "short");
  await systems.quickSell(c, u, id);
  return id;
}
export async function spin(
  c: DBClient,
  u: any,
  config: Config,
  reroll = false,
  requestedTld?: string,
) {
  if (u.last_spin_at && Date.now() - new Date(u.last_spin_at).getTime() < 1000)
    throw new GameError(429, "Подождите секунду перед следующим вращением");
  const pending = (
    await c.query(
      "SELECT id,tld,spin_mode,status FROM domains WHERE owner_id=$1 AND (status='pending' OR (quick_sold=true AND acknowledged=false))",
      [u.id],
    )
  ).rows[0];
  if (pending?.status === "sold")
    throw new GameError(409, "Подтвердите результат Quick Sell");
  const selectedTld = reroll
    ? (pending?.spin_mode ?? pending?.tld)
    : requestedTld;
  const market =
    selectedTld === "random"
      ? randomMarket(config)
      : selectedTld
        ? zoneMarkets(config).get(selectedTld)
        : undefined;
  if (!market) throw new GameError(400, "Выберите доступную доменную зону");
  await c.query(
    "INSERT INTO zone_pity(user_id,tld,counter) VALUES($1,$2,0) ON CONFLICT DO NOTHING",
    [u.id, selectedTld],
  );
  const pity = (
    await c.query(
      "SELECT counter FROM zone_pity WHERE user_id=$1 AND tld=$2 FOR UPDATE",
      [u.id, selectedTld],
    )
  ).rows[0].counter;
  if (
    (
      await c.query(
        "SELECT id FROM scanner_sessions WHERE user_id=$1 AND picked IS NULL",
        [u.id],
      )
    ).rowCount
  )
    throw new GameError(409, "Сначала выберите карту Scanner");
  let cost = 0;
  if (reroll) {
    if (!pending) throw new GameError(409, "Нет домена для Re-roll");
    const daily = (
      await c.query(
        `SELECT reroll_date=${daySQL} AS used FROM users WHERE id=$1`,
        [u.id],
      )
    ).rows[0];
    if (!daily.used && config.dailyRerolls > 0)
      await c.query(`UPDATE users SET reroll_date=${daySQL} WHERE id=$1`, [
        u.id,
      ]);
    else if (u.reroll_tokens > 0)
      await c.query(
        "UPDATE users SET reroll_tokens=reroll_tokens-1 WHERE id=$1",
        [u.id],
      );
    else throw new GameError(409, "Re-roll закончились на сегодня");
    await c.query("UPDATE domains SET status='destroyed' WHERE id=$1", [
      pending.id,
    ]);
  } else {
    if (pending)
      throw new GameError(409, "Сначала оставьте или продайте выпавший домен");
    cost = u.free_spin ? 0 : market.spinPrice;
    await credit(c, u.id, -cost, u.free_spin ? "first_free_spin" : "spin");
    await c.query("UPDATE users SET free_spin=false WHERE id=$1", [u.id]);
  }
  const event = !(await systems.systems(c)).flags.events
    ? undefined
    : (
        await c.query(
          "SELECT tld,boost FROM events WHERE starts_at<=now() AND ends_at>now() ORDER BY starts_at DESC LIMIT 1",
        )
      ).rows[0];
  const drop =
    selectedTld === "random"
      ? generateRandom(
          config,
          pity,
          undefined,
          event ? { tld: event.tld, boost: Number(event.boost) } : undefined,
        )
      : generateForZone(config, selectedTld!, pity, undefined, 1);
  const id = await recordDrop(
    c,
    { ...u, pity },
    drop,
    reroll ? "reroll" : "spin",
    cost,
    selectedTld,
  );
  return { domainId: id };
}
export async function domainAction(
  c: DBClient,
  u: any,
  id: string,
  action: string,
) {
  const d = (
    await c.query(
      "SELECT * FROM domains WHERE id=$1 AND owner_id=$2 FOR UPDATE",
      [id, u.id],
    )
  ).rows[0];
  if (!d) throw new GameError(404, "Домен не найден");
  if (action === "keep") {
    if (d.status !== "pending")
      throw new GameError(409, "Этот результат уже обработан");
    await c.query("UPDATE domains SET status='kept' WHERE id=$1", [id]);
    await progress(c, u.id, "keep");
    await c.query("UPDATE users SET onboarded=true WHERE id=$1", [u.id]);
  } else if (action === "sell") {
    if (!["pending", "kept"].includes(d.status))
      throw new GameError(409, "Этот домен уже недоступен");
    if (d.vaulted || d.favorite || d.showcase)
      throw new GameError(
        409,
        "Сначала уберите домен из сейфа, избранного и Showcase",
      );
    await c.query("UPDATE domains SET status='sold' WHERE id=$1", [id]);
    await credit(c, u.id, Number(d.value), "sell", id);
    await progress(c, u.id, "sell");
    await c.query("UPDATE users SET onboarded=true WHERE id=$1", [u.id]);
  } else {
    if (d.status !== "kept")
      throw new GameError(409, "Сначала сохраните домен");
    const column = {
      favorite: "favorite",
      vault: "vaulted",
      showcase: "showcase",
    }[action];
    if (!column) throw new GameError(400, "Неизвестное действие");
    if (!d[column] && column !== "favorite") {
      const count = (
        await c.query(
          `SELECT count(*)::integer AS n FROM domains WHERE owner_id=$1 AND ${column}=true`,
          [u.id],
        )
      ).rows[0].n;
      const max =
        column === "vaulted" ? u.vault_slots : levelFor(u.xp) >= 5 ? 6 : 3;
      if (count >= max) throw new GameError(409, `Доступно ${max} мест`);
    }
    await c.query(`UPDATE domains SET ${column}=NOT ${column} WHERE id=$1`, [
      id,
    ]);
  }
  return { domainId: id };
}
export async function claimDaily(c: DBClient, u: any, config: Config) {
  const r = await c.query(
    `UPDATE users SET daily_claim_date=${daySQL} WHERE id=$1 AND daily_claim_date IS DISTINCT FROM ${daySQL} RETURNING id`,
    [u.id],
  );
  if (!r.rowCount) throw new GameError(409, "Сегодняшняя награда уже получена");
  await credit(c, u.id, config.dailyReward, "daily");
  return { coins: config.dailyReward };
}
export async function claimQuest(c: DBClient, u: any, id: string) {
  const q = (await questsFor(c, u.id)).find((q) => q.id === id);
  if (!q) throw new GameError(404, "Задание не найдено");
  if (q.claimed || q.progress < q.target)
    throw new GameError(409, "Награда пока недоступна");
  await c.query(
    `INSERT INTO reward_claims(user_id,reward_key) VALUES($1,'quest:'||${daySQL}::text||':'||$2)`,
    [u.id, id],
  );
  await credit(c, u.id, q.coins, "quest", id);
  await awardXp(c, u.id, q.xp);
  await c.query(
    "UPDATE users SET scanner_tokens=scanner_tokens+$2,reroll_tokens=reroll_tokens+$3 WHERE id=$1",
    [u.id, q.scanner, q.reroll],
  );
  return { quest: id };
}
export async function scannerOpen(c: DBClient, u: any, config: Config) {
  if (u.scanner_tokens <= 0)
    throw new GameError(409, "Нет Scanner token. Выполните задания");
  if (
    (
      await c.query(
        "SELECT id FROM domains WHERE owner_id=$1 AND (status='pending' OR (quick_sold=true AND acknowledged=false))",
        [u.id],
      )
    ).rowCount
  )
    throw new GameError(409, "Сначала обработайте выпавший домен");
  if (
    (
      await c.query(
        "SELECT id FROM scanner_sessions WHERE user_id=$1 AND picked IS NULL",
        [u.id],
      )
    ).rowCount
  )
    throw new GameError(409, "Scanner уже открыт");
  const cards = Array.from({ length: 3 }, () =>
    generate(
      { ...config, weights: config.scannerWeights ?? config.weights },
      u.pity,
    ),
  );
  const id = randomUUID();
  await c.query(
    "INSERT INTO scanner_sessions(id,user_id,cards) VALUES($1,$2,$3)",
    [id, u.id, JSON.stringify(cards)],
  );
  await c.query(
    "UPDATE users SET scanner_tokens=scanner_tokens-1 WHERE id=$1",
    [u.id],
  );
  return { id };
}
export async function scannerPick(
  c: DBClient,
  u: any,
  id: string,
  index: number,
) {
  const scanner = (
    await c.query(
      "SELECT * FROM scanner_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [id, u.id],
    )
  ).rows[0];
  if (!scanner || scanner.picked !== null)
    throw new GameError(409, "Этот Scanner уже закрыт");
  if (
    (
      await c.query(
        "SELECT id FROM domains WHERE owner_id=$1 AND (status='pending' OR (quick_sold=true AND acknowledged=false))",
        [u.id],
      )
    ).rowCount
  )
    throw new GameError(409, "Сначала обработайте текущий домен");
  await c.query("UPDATE scanner_sessions SET picked=$2 WHERE id=$1", [
    id,
    index,
  ]);
  const domainId = await recordDrop(c, u, scanner.cards[index], "scanner", 0);
  await progress(c, u.id, "scanner");
  return { cards: scanner.cards, picked: index, domainId };
}
export async function collections(c: DBClient, userId: string) {
  const owned = (
    await c.query(
      "SELECT DISTINCT tld FROM domains WHERE owner_id=$1 AND status='kept'",
      [userId],
    )
  ).rows.map((r) => r.tld);
  const claimed = (
    await c.query(
      "SELECT reward_key FROM reward_claims WHERE user_id=$1 AND reward_key LIKE 'set:%'",
      [userId],
    )
  ).rows.map((r) => r.reward_key);
  return sets.map((s) => ({
    ...s,
    found: s.tlds.filter((t) => owned.includes(t)),
    claimed: claimed.includes("set:" + s.id),
  }));
}
export async function claimSet(c: DBClient, u: any, id: string) {
  const set = (await collections(c, u.id)).find((s) => s.id === id);
  if (!set || set.claimed || set.found.length < set.tlds.length)
    throw new GameError(409, "Набор пока не собран или награда уже получена");
  await c.query("INSERT INTO reward_claims(user_id,reward_key) VALUES($1,$2)", [
    u.id,
    "set:" + id,
  ]);
  await credit(c, u.id, set.coins, "collection", id);
  await c.query("UPDATE users SET reroll_tokens=reroll_tokens+1 WHERE id=$1", [
    u.id,
  ]);
  return { id };
}
export async function achievements(c: DBClient, userId: string) {
  const u = (await c.query("SELECT spins,xp FROM users WHERE id=$1", [userId]))
    .rows[0];
  const domains = (
    await c.query(
      "SELECT count(*)::integer AS n FROM domains WHERE owner_id=$1 AND status='kept'",
      [userId],
    )
  ).rows[0].n;
  const claimed = (
    await c.query(
      "SELECT reward_key FROM reward_claims WHERE user_id=$1 AND reward_key LIKE 'achievement:%'",
      [userId],
    )
  ).rows.map((r) => r.reward_key);
  return [
    {
      id: "first10",
      title: "Первые 10 вращений",
      target: 10,
      progress: u.spins,
      coins: 500,
    },
    {
      id: "collector",
      title: "Коллекционер: 25 доменов",
      target: 25,
      progress: domains,
      coins: 1500,
    },
    {
      id: "explorer",
      title: "Исследователь: 100 вращений",
      target: 100,
      progress: u.spins,
      coins: 2500,
    },
  ].map((a) => ({
    ...a,
    progress: Math.min(a.progress, a.target),
    claimed: claimed.includes("achievement:" + a.id),
  }));
}
export async function claimAchievement(c: DBClient, u: any, id: string) {
  const a = (await achievements(c, u.id)).find((a) => a.id === id);
  if (!a || a.claimed || a.progress < a.target)
    throw new GameError(409, "Достижение недоступно");
  await c.query("INSERT INTO reward_claims(user_id,reward_key) VALUES($1,$2)", [
    u.id,
    "achievement:" + id,
  ]);
  await credit(c, u.id, a.coins, "achievement", id);
  return { id };
}
export async function auctionBeforeLock(
  c: DBClient,
  id: string,
  userId: string,
) {
  const a = (
    await c.query("SELECT * FROM auctions WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (!a) throw new GameError(404, "Аукцион не найден");
  const ids = [...new Set([userId, a.bidder_id].filter(Boolean))].sort();
  for (const id of ids) await lockUser(c, id);
}
export async function bid(c: DBClient, u: any, id: string, amount: number) {
  const a = (
    await c.query(
      "SELECT *,ends_at>now() AS open FROM auctions WHERE id=$1 FOR UPDATE",
      [id],
    )
  ).rows[0];
  if (!a || a.status !== "active" || !a.open)
    throw new GameError(409, "Аукцион завершён");
  const minimum =
    Number(a.bid) > 0
      ? Number(a.bid) + Math.max(100, Math.ceil(Number(a.bid) * 0.05))
      : Number(a.start_price);
  if (amount < minimum)
    throw new GameError(409, `Минимальная ставка: ${minimum}`);
  if (a.bidder_id === u.id) {
    await credit(c, u.id, -(amount - Number(a.bid)), "auction_raise", id);
  } else {
    await credit(c, u.id, -amount, "auction_escrow", id);
    if (a.bidder_id)
      await credit(c, a.bidder_id, Number(a.bid), "auction_refund", id);
  }
  await c.query("UPDATE auctions SET bid=$2,bidder_id=$3 WHERE id=$1", [
    id,
    amount,
    u.id,
  ]);
  await c.query(
    "INSERT INTO auction_bids(id,auction_id,user_id,amount) VALUES($1,$2,$3,$4)",
    [randomUUID(), id, u.id, amount],
  );
  await progress(c, u.id, "bid");
  return { id, amount };
}
export async function scheduler(db: Database) {
  await db.transaction(async (c) => {
    if (!c.embedded) {
      const got = (
        await c.query("SELECT pg_try_advisory_xact_lock(7346822) AS got")
      ).rows[0].got;
      if (!got) return;
    }
    const due = (
      await c.query(
        "SELECT * FROM auctions WHERE status='active' AND ends_at<=now() ORDER BY id FOR UPDATE",
      )
    ).rows;
    for (const a of due) {
      let domainId = null;
      if (a.bidder_id) {
        await lockUser(c, a.bidder_id);
        domainId = await insertDomain(
          c,
          a.bidder_id,
          a.domain,
          "kept",
          "auction",
        );
      }
      await c.query(
        "UPDATE auctions SET status='settled',domain_id=$2 WHERE id=$1",
        [a.id, domainId],
      );
    }
    if ((await systems.systems(c)).flags.auction)
      await fillAuctions(c, await configFor(c));
    await c.query("DELETE FROM common_sale_quotes WHERE expires_at<now()");
    await c.query("DELETE FROM sessions WHERE expires_at<now()");
  });
}
