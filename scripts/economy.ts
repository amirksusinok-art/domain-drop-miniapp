import { defaultConfig, catalog, generate } from "../server/economy.js";
import { rarities } from "../shared/types.js";
let seed = 437122;
const rng = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const n = Number(process.argv[2] ?? 1000000),
  pool = catalog(defaultConfig);
let pity = 0,
  total = 0,
  maxPity = 0;
const counts: Record<string, number> = {};
for (let i = 0; i < n; i++) {
  const d = generate(defaultConfig, pity, rng, undefined, pool);
  total += d.value;
  counts[d.rarity] = (counts[d.rarity] ?? 0) + 1;
  pity = rarities.indexOf(d.rarity) >= 2 ? 0 : pity + 1;
  maxPity = Math.max(maxPity, pity);
}
console.log(
  JSON.stringify(
    {
      spins: n,
      seed: 437122,
      rtp: total / n / defaultConfig.spinPrice,
      meanValue: total / n,
      maxPity,
      counts,
      recommendedScale:
        defaultConfig.valueScale *
        (0.85 / (total / n / defaultConfig.spinPrice)),
    },
    null,
    2,
  ),
);
