import { randomInt, randomUUID } from "node:crypto";
import type { DBClient } from "./db.js";
import { catalog, type Config, type Drop } from "./economy.js";
import { GameError } from "./auth.js";
import { credit, progress, domainView } from "./game.js";
import { systems, systemDefaults } from "./systems.js";

let cache: { key: string; drops: Drop[] } | undefined;
export function auctionPool(config: Config) {
  const key = JSON.stringify(config);
  if (cache?.key !== key)
    cache = {
      key,
      drops: catalog(config)
        .map((x) => x.drop)
        .filter((d) => !["COMMON", "UNCOMMON"].includes(d.rarity)),
    };
  return cache!.drops;
}
export function pickAuction(
  config: Config,
  kind: "daily" | "live",
  excluded: Set<string>,
  rng = () => randomInt(0, 0x1000000) / 0x1000000,
): Drop | null {
  const pool = auctionPool(config).filter(
    (d) => !excluded.has(`${d.name}.${d.tld}`),
  );
  const weights =
    kind === "daily"
      ? ([
          ["EPIC", 65],
          ["LEGENDARY", 30],
          ["MYTHIC", 5],
        ] as const)
      : ([
          ["RARE", 65],
          ["EPIC", 28],
          ["LEGENDARY", 6],
          ["MYTHIC", 1],
        ] as const);
  const available = weights
    .map(([rarity, weight]) => ({
      weight,
      drops: pool.filter((d) => d.rarity === rarity),
    }))
    .filter((x) => x.drops.length);
  if (!available.length) return null;
  let roll = rng() * available.reduce((sum, x) => sum + x.weight, 0);
  const bucket =
    available.find((x) => (roll -= x.weight) < 0) ?? available.at(-1)!;
  return bucket.drops[
    Math.min(bucket.drops.length - 1, Math.floor(rng() * bucket.drops.length))
  ];
}
export async function fillAuctions(c: DBClient, config: Config) {
  const slots = [
    { slot: "daily", kind: "daily", minutes: 720 },
    ...[30, 60, 120, 240].map((minutes) => ({
      slot: `live-${minutes}`,
      kind: "live",
      minutes,
    })),
  ];
  const active = (
    await c.query("SELECT slot,domain FROM auctions WHERE status='active'")
  ).rows;
  const recent = (
    await c.query(
      "SELECT domain FROM auctions WHERE slot IS NOT NULL ORDER BY starts_at DESC,id DESC LIMIT 20",
    )
  ).rows;
  const excluded = new Set(
    [...recent, ...active].map((a) => `${a.domain.name}.${a.domain.tld}`),
  );
  for (const slot of slots) {
    if (active.some((a) => a.slot === slot.slot)) continue;
    const drop = pickAuction(config, slot.kind as "daily" | "live", excluded);
    if (!drop) continue; // An administrator can disable all qualifying zones.
    await c.query(
      "INSERT INTO auctions(id,domain,ends_at,start_price,kind,slot) VALUES($1,$2,now()+make_interval(mins => $3),$4,$5,$6)",
      [
        randomUUID(),
        JSON.stringify(drop),
        slot.minutes,
        Math.max(1000, Math.round(drop.value * 0.5)),
        slot.kind,
        slot.slot,
      ],
    );
    excluded.add(`${drop.name}.${drop.tld}`);
  }
}
export async function watchAuction(
  c: DBClient,
  userId: string,
  id: string,
  watched: boolean,
) {
  if (!(await c.query("SELECT id FROM auctions WHERE id=$1", [id])).rowCount)
    throw new GameError(404, "Аукцион не найден");
  if (watched)
    await c.query(
      "INSERT INTO auction_watchlist(user_id,auction_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [userId, id],
    );
  else
    await c.query(
      "DELETE FROM auction_watchlist WHERE user_id=$1 AND auction_id=$2",
      [userId, id],
    );
  return { id, watched };
}
async function protectedTags(c: DBClient) {
  return [
    ...new Set([
      ...systemDefaults.protectedTags,
      ...(await systems(c)).protectedTags,
    ]),
  ];
}
export async function saleCandidates(
  c: DBClient,
  userId: string,
  ids?: string[],
) {
  const tags = await protectedTags(c);
  return (
    await c.query(
      `SELECT * FROM domains WHERE owner_id=$1 AND status='kept' AND rarity='COMMON' AND NOT favorite AND NOT vaulted AND NOT showcase AND serial IS NULL AND NOT(tags ?| $2::text[]) ${ids ? "AND id=ANY($3::uuid[])" : ""} ORDER BY id FOR UPDATE`,
      ids ? [userId, tags, ids] : [userId, tags],
    )
  ).rows;
}
export async function previewCommon(c: DBClient, userId: string) {
  const rows = await saleCandidates(c, userId);
  const id = randomUUID(),
    total = rows.reduce((n, d) => n + Number(d.value), 0);
  await c.query(
    "INSERT INTO common_sale_quotes(id,user_id,domain_ids,total) VALUES($1,$2,$3,$4)",
    [id, userId, JSON.stringify(rows.map((d) => d.id)), total],
  );
  return { id, count: rows.length, total, expiresIn: 300 };
}
export async function sellCommon(c: DBClient, userId: string, id: string) {
  const quote = (
    await c.query(
      "SELECT *,expires_at>now() AS valid FROM common_sale_quotes WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [id, userId],
    )
  ).rows[0];
  if (!quote || !quote.valid || quote.used)
    throw new GameError(409, "Подтверждение устарело. Обновите список Common");
  const ids = quote.domain_ids as string[],
    rows = await saleCandidates(c, userId, ids);
  if (
    !ids.length ||
    rows.length !== ids.length ||
    rows.reduce((n, d) => n + Number(d.value), 0) !== Number(quote.total)
  )
    throw new GameError(
      409,
      "Список изменился. Обновите подтверждение продажи",
    );
  await c.query("UPDATE domains SET status='sold' WHERE id=ANY($1::uuid[])", [
    ids,
  ]);
  await credit(c, userId, Number(quote.total), "sell_common", id);
  await progress(c, userId, "sell", ids.length);
  await c.query("UPDATE common_sale_quotes SET used=true WHERE id=$1", [id]);
  return { count: ids.length, total: Number(quote.total) };
}
export async function recentDrops(c: DBClient, userId: string) {
  return (
    await c.query(
      "SELECT d.*,s.kind AS drop_kind,s.created_at AS dropped_at FROM spins s JOIN domains d ON d.id=s.domain_id WHERE s.user_id=$1 ORDER BY s.created_at DESC,s.id DESC LIMIT 10",
      [userId],
    )
  ).rows.map((d) => {
    const { owner_id, finder_id, ...visible } = domainView(d) as any;
    return { ...visible, drop_kind: d.drop_kind, dropped_at: d.dropped_at };
  });
}
