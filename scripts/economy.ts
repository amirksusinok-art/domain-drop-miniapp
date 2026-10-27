import { defaultConfig } from "../server/economy.js";
import {
  zoneMarkets,
  generateForZone,
  randomMarket,
  generateRandom,
} from "../server/zone-market.js";
import { rarities } from "../shared/types.js";
let seed = 437122;
const rng = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const n = Number(process.argv[2] ?? 100000),
  only = process.argv.slice(3).filter((v) => !v.startsWith("--event=")),
  eventArg = process.argv
    .find((v) => v.startsWith("--event="))
    ?.slice(8)
    .split(":"),
  event = eventArg
    ? { tld: eventArg[0], boost: Number(eventArg[1] ?? 1.3) }
    : undefined,
  markets = zoneMarkets(defaultConfig),
  preparedRandom = randomMarket(defaultConfig);
const report = [];
for (const zone of [...markets.values(), randomMarket(defaultConfig)]) {
  if (only.length && !only.includes(zone.name)) continue;
  let pity = 0,
    total = 0,
    maxPity = 0,
    rare = 0;
  for (let i = 0; i < n; i++) {
    const d =
      zone.name === "random"
        ? generateRandom(defaultConfig, pity, rng, event, preparedRandom)
        : generateForZone(
            defaultConfig,
            zone.name,
            pity,
            rng,
            1,
            zone as import("../server/zone-market.js").ZoneMarket,
          );
    total += d.value;
    const good = rarities.indexOf(d.rarity) >= 2;
    if (good) rare++;
    pity = good ? 0 : pity + 1;
    maxPity = Math.max(maxPity, pity);
  }
  report.push({
    tld: zone.name,
    spins: n,
    spinPrice: zone.spinPrice,
    baseRareChance: zone.baseRareChance,
    observedRareChance: rare / n,
    rtp: total / n / zone.spinPrice,
    meanValue: total / n,
    maxPity,
  });
}
console.log(
  JSON.stringify(
    { seed: 437122, availableZones: markets.size, event, report },
    null,
    2,
  ),
);
