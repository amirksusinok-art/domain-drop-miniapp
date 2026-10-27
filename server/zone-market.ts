import {
  catalog,
  defaultConfig,
  random,
  type Config,
  type Drop,
} from "./economy.js";
import { rarities } from "../shared/types.js";
export type ZoneMarket = {
  name: string;
  spinPrice: number;
  multiplier: number;
  baseRareChance: number;
  scale: number;
  buckets: Drop[][];
  low: number[];
  high: number[];
};
const cache = new Map<string, Map<string, ZoneMarket>>();
export type RandomMarket = {
  name: "random";
  spinPrice: number;
  multiplier: null;
  baseRareChance: number;
  scale: number;
  entries: { zone: ZoneMarket; weight: number }[];
};
const randomCache = new Map<string, RandomMarket>();
export function randomMarket(config: Config): RandomMarket {
  const key = JSON.stringify(config),
    cached = randomCache.get(key);
  if (cached) return cached;
  const markets = zoneMarkets(config),
    total = config.tlds.reduce((sum, t) => sum + t.weight, 0);
  const entries = config.tlds.map((t) => ({
    zone: markets.get(t.name)!,
    weight: t.weight / total,
  }));
  let survival = 1,
    visits = 0,
    values = 0;
  const means = entries.map(({ zone, weight }) => ({
    zone,
    weight,
    low: zone.low.reduce(
      (sum, p, i) =>
        sum +
        p *
          (zone.buckets[i].reduce((s, d) => s + d.value, 0) /
            (zone.buckets[i].length || 1)),
      0,
    ),
    high: zone.high.reduce(
      (sum, p, i) =>
        sum +
        p *
          (zone.buckets[i].reduce((s, d) => s + d.value, 0) /
            (zone.buckets[i].length || 1)),
      0,
    ),
  }));
  for (let pity = 0; pity < config.pityGuarantee; pity++) {
    let good = 0,
      mean = 0;
    for (const entry of means) {
      const p = chanceFor(entry.zone, config, pity);
      good += entry.weight * p;
      mean += entry.weight * ((1 - p) * entry.low + p * entry.high);
    }
    visits += survival;
    values += survival * mean;
    survival *= 1 - good;
  }
  const market: RandomMarket = {
    name: "random",
    spinPrice: config.spinPrice,
    multiplier: null,
    baseRareChance: entries.reduce(
      (sum, e) => sum + e.weight * e.zone.baseRareChance,
      0,
    ),
    scale:
      (config.spinPrice *
        (config.targetRtp ?? 0.8) *
        (config.valueScale / defaultConfig.valueScale)) /
      (values / visits),
    entries,
  };
  randomCache.set(key, market);
  if (randomCache.size > 4)
    randomCache.delete(randomCache.keys().next().value!);
  return market;
}
export function randomChance(
  config: Config,
  pity: number,
  event?: { tld: string; boost: number },
) {
  const entries = randomMarket(config).entries,
    total = entries.reduce(
      (sum, e) =>
        sum +
        e.weight *
          (event?.tld === e.zone.name
            ? Math.min(1.3, Math.max(1, event.boost))
            : 1),
      0,
    );
  return entries.reduce(
    (sum, e) =>
      sum +
      ((e.weight *
        (event?.tld === e.zone.name
          ? Math.min(1.3, Math.max(1, event.boost))
          : 1)) /
        total) *
        chanceFor(e.zone, config, pity),
    0,
  );
}
export function generateRandom(
  config: Config,
  pity: number,
  rng = random,
  event?: { tld: string; boost: number },
  prepared?: RandomMarket,
): Drop {
  const market = prepared ?? randomMarket(config);
  const total = market.entries.reduce(
    (sum, e) =>
      sum +
      e.weight *
        (event?.tld === e.zone.name
          ? Math.min(1.3, Math.max(1, event.boost))
          : 1),
    0,
  );
  let draw = rng() * total;
  let selected = market.entries.at(-1)!;
  for (const entry of market.entries) {
    draw -=
      entry.weight *
      (event?.tld === entry.zone.name
        ? Math.min(1.3, Math.max(1, event.boost))
        : 1);
    if (draw < 0) {
      selected = entry;
      break;
    }
  }
  const drop = generateForZone(
    config,
    selected.zone.name,
    pity,
    rng,
    1,
    selected.zone,
  );
  const scale = drop.breakdown.scale * market.scale,
    b = drop.breakdown;
  return {
    ...drop,
    value: Math.max(
      1,
      Math.round(b.base * b.tldMultiplier * b.rarityBonus * b.special * scale),
    ),
    breakdown: { ...b, scale },
  };
}
export function expandTlds(config: Config): Config {
  return {
    ...config,
    tlds: [
      ...config.tlds,
      ...defaultConfig.tlds.filter(
        (t) => !config.tlds.some((old) => old.name === t.name),
      ),
    ],
  };
}
function normalize(weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (total ? w / total : 0));
}
export function chanceFor(
  zone: ZoneMarket,
  config: Config,
  pity: number,
  eventBoost = 1,
) {
  if (pity >= config.pityGuarantee - 1) return 1;
  const boost =
    pity >= config.pityStart
      ? Math.min(
          config.pityMaxBoost ?? 0.08,
          (config.pityBaseBoost ?? 0.01) +
            (pity - config.pityStart) * (config.pityStep ?? 0.004),
        )
      : 0;
  return Math.min(0.95, zone.baseRareChance * eventBoost + boost);
}
export function zoneMarkets(config: Config) {
  const key = JSON.stringify(config);
  const old = cache.get(key);
  if (old) return old;
  const rows = catalog({ ...config, valueScale: 1 }),
    result = new Map<string, ZoneMarket>();
  for (const tld of config.tlds) {
    const buckets = rarities.map((r) =>
      rows
        .filter((row) => row.drop.tld === tld.name && row.drop.rarity === r)
        .map((row) => row.drop),
    );
    const low = normalize(
        config.weights.map((w, i) => (i < 2 && buckets[i].length ? w : 0)),
      ),
      high = normalize(
        config.weights.map((w, i) => (i >= 2 && buckets[i].length ? w : 0)),
      );
    if (!low.some(Boolean) || !high.some(Boolean))
      throw new Error(
        `Zone .${tld.name} must support ordinary and Rare+ domains`,
      );
    const zone: ZoneMarket = {
      name: tld.name,
      spinPrice:
        tld.spinPrice ??
        Math.min(
          1000000,
          Math.max(
            100,
            Math.round(
              ((config.zonePriceBase ?? 750) *
                tld.multiplier *
                tld.multiplier) /
                100,
            ) * 50,
          ),
        ),
      multiplier: tld.multiplier,
      baseRareChance:
        tld.rareChance ??
        Math.max(0.025, Math.min(0.18, 0.12 / Math.pow(tld.multiplier, 1.5))),
      scale: 1,
      buckets,
      low,
      high,
    };
    const mean = (distribution: number[]) =>
      distribution.reduce(
        (sum, p, i) =>
          sum +
          p *
            (buckets[i].reduce((a, d) => a + d.value, 0) /
              (buckets[i].length || 1)),
        0,
      );
    const meanLow = mean(low),
      meanHigh = mean(high);
    let survival = 1,
      totalVisits = 0,
      totalValue = 0;
    for (let pity = 0; pity < config.pityGuarantee; pity++) {
      const chance = chanceFor(zone, config, pity);
      totalVisits += survival;
      totalValue += survival * ((1 - chance) * meanLow + chance * meanHigh);
      survival *= 1 - chance;
    }
    zone.scale =
      ((zone.spinPrice * (config.targetRtp ?? 0.8)) /
        (totalValue / totalVisits)) *
      (config.valueScale / defaultConfig.valueScale);
    // Values and their full formula are snapshotted when generated, never repriced later.
    zone.buckets = buckets.map((bucket) =>
      bucket.map((drop) => ({
        ...drop,
        value: Math.max(1, Math.round(drop.value * zone.scale)),
        breakdown: { ...drop.breakdown, scale: zone.scale },
      })),
    );
    result.set(tld.name, zone);
  }
  cache.set(key, result);
  if (cache.size > 4) cache.delete(cache.keys().next().value!);
  return result;
}
export function generateForZone(
  config: Config,
  tld: string,
  pity: number,
  rng = random,
  eventBoost = 1,
  prepared?: ZoneMarket,
): Drop {
  const zone = prepared ?? zoneMarkets(config).get(tld);
  if (!zone) throw new Error("Unknown domain zone");
  const distribution =
    rng() < chanceFor(zone, config, pity, eventBoost) ? zone.high : zone.low;
  let draw = rng(),
    index = distribution.reduce((last, p, i) => (p > 0 ? i : last), 0);
  for (let i = 0; i < distribution.length; i++) {
    draw -= distribution[i];
    if (draw < 0) {
      index = i;
      break;
    }
  }
  const bucket = zone.buckets[index],
    selected =
      bucket[Math.min(bucket.length - 1, Math.floor(rng() * bucket.length))];
  const variant = selected.name.match(/^([a-z]+)(\d+)$/);
  const name =
    variant && rarities.indexOf(selected.rarity) < 2
      ? variant[1] +
        String(
          Math.floor(
            Math.pow(10, variant[2].length - 1) +
              rng() * 9 * Math.pow(10, variant[2].length - 1),
          ),
        )
      : selected.name;
  return {
    ...selected,
    name,
    tags: [...selected.tags],
    breakdown: { ...selected.breakdown },
  };
}
