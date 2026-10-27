import assert from "node:assert/strict";
import {
  defaultConfig,
  catalog,
  generate,
  evaluate,
} from "../server/economy.js";
import {
  generateRandom,
  randomMarket,
  generateForZone,
  zoneMarkets,
} from "../server/zone-market.js";
import { quests } from "../server/game.js";
import { rarities } from "../shared/types.js";
let seed = 615039;
const rng = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
function sampler<T>(rows: T[], weight: (r: T) => number) {
  let total = 0;
  const sums = rows.map((r) => (total += weight(r)));
  return (draw: number) => {
    const target = draw * total;
    let lo = 0,
      hi = rows.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (target < sums[mid]) hi = mid;
      else lo = mid + 1;
    }
    return rows[lo];
  };
}
const n = Number(process.argv[2] ?? 200000),
  market = randomMarket(defaultConfig),
  premium = zoneMarkets(defaultConfig).get("com")!,
  scanner = { ...defaultConfig, weights: defaultConfig.scannerWeights },
  pool = catalog(scanner);
// Compile the existing Scanner sampler into CDFs; verify identical outputs first.
const drawRarity = sampler(
  [...rarities],
  (r) => scanner.weights[rarities.indexOf(r)],
);
const draws = Object.fromEntries(
  rarities.map((r) => [
    r,
    sampler(
      pool.filter((p) => p.drop.rarity === r),
      (p) => p.weight,
    ),
  ]),
);
function scannerSample() {
  const selected = draws[drawRarity(rng())](rng()).drop;
  if (selected.rarity === "COMMON") {
    const prefix = selected.name.replace(/\d+$/, "");
    if (prefix !== selected.name)
      return evaluate(
        prefix + String(100 + Math.floor(rng() * 900)),
        scanner.tlds.find((t) => t.name === selected.tld)!,
        scanner,
      );
  }
  return selected;
}
for (let i = 0; i < 1000; i++) {
  const before = seed,
    expected = generate(scanner, 0, rng, undefined, pool);
  seed = before;
  assert.deepEqual(scannerSample(), expected);
}
seed = 615039;
let free = 0,
  reroll0 = 0,
  reroll29 = 0,
  scanRandom = 0,
  scanBest = 0;
for (let i = 0; i < n; i++) {
  free += generateRandom(defaultConfig, 0, rng, undefined, market).value;
  reroll0 += generateForZone(defaultConfig, "com", 0, rng, 1, premium).value;
  reroll29 += generateForZone(defaultConfig, "com", 29, rng, 1, premium).value;
  const cards = Array.from({ length: 3 }, scannerSample);
  scanRandom += cards[0].value;
  scanBest += Math.max(...cards.map((d) => d.value));
}
console.log(
  JSON.stringify(
    {
      seed: 615039,
      samples: n,
      scope:
        "Separate grants, not included in paid RTP; each sample starts at the stated pity",
      startingCoins: defaultConfig.startingBalance,
      dailyCoins: defaultConfig.dailyReward,
      maxDailyQuestCoins: quests.reduce((s, q) => s + q.coins, 0),
      firstFreeRandomMean: free / n,
      freeRerollComMeanAtPity0: reroll0 / n,
      freeRerollComMeanAtPity29: reroll29 / n,
      scannerMeanRandomChoiceAtPity0: scanRandom / n,
      scannerMeanBestChoiceAtPity0: scanBest / n,
      promoAndAdminRewards: "Owner controlled, excluded; no codes generated",
    },
    null,
    2,
  ),
);
