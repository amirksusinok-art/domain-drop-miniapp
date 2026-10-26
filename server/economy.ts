import { randomInt } from "node:crypto";
import { z } from "zod";
import { rarities, type Rarity } from "../shared/types.js";
const tldSchema = z.object({
  name: z.string().regex(/^[a-z]{2,12}$/),
  weight: z.number().min(0.01).max(1000),
  multiplier: z.number().min(0.1).max(10),
  score: z.number().int().min(0).max(30),
  spinPrice: z.number().int().min(100).max(1000000).optional(),
  rareChance: z.number().min(0.005).max(0.8).optional(),
});
export const configSchema = z
  .object({
    spinPrice: z.number().int().min(100).max(100000),
    startingBalance: z.number().int().min(0).max(1000000),
    dailyReward: z.number().int().min(0).max(10000),
    pityGuarantee: z.number().int().min(10).max(100),
    pityStart: z.number().int().min(0).max(90),
    dailyRerolls: z.number().int().min(0).max(1),
    valueScale: z.number().min(0.01).max(10),
    maintenance: z.boolean(),
    weights: z.array(z.number().positive().max(10000)).length(6),
    scannerWeights: z
      .array(z.number().positive().max(10000))
      .length(6)
      .default([7800, 1800, 350, 45, 4.5, 0.5]),
    tlds: z.array(tldSchema).min(6).max(120),
  })
  .superRefine((v, ctx) => {
    if (v.pityStart >= v.pityGuarantee)
      ctx.addIssue({
        code: "custom",
        message: "Pity start must precede guarantee",
      });
    if (new Set(v.tlds.map((t) => t.name)).size !== v.tlds.length)
      ctx.addIssue({ code: "custom", message: "Duplicate TLD" });
  });
export type Config = z.infer<typeof configSchema>;
export const defaultConfig: Config = {
  spinPrice: 500,
  startingBalance: 10000,
  dailyReward: 1000,
  pityGuarantee: 30,
  pityStart: 10,
  dailyRerolls: 1,
  valueScale: 0.583,
  maintenance: false,
  weights: [7800, 1800, 350, 45, 4.5, 0.5],
  scannerWeights: [7800, 1800, 350, 45, 4.5, 0.5],
  tlds: [
    ["xyz", 28, 0.6, 0],
    ["site", 16, 0.7, 0],
    ["online", 12, 0.7, 0],
    ["ru", 7, 0.9, 3],
    ["ua", 7, 0.9, 3],
    ["uk", 7, 1.1, 4],
    ["me", 5, 1.2, 6],
    ["net", 4, 1.4, 10],
    ["org", 4, 1.3, 10],
    ["gg", 3, 1.7, 16],
    ["io", 2, 2, 22],
    ["co", 2, 1.8, 20],
    ["ai", 1, 2.5, 30],
    ["com", 0.5, 3, 30],
    ["app", 3, 1.5, 14],
    ["dev", 3, 1.6, 16],
    ["tech", 5, 1.2, 8],
    ...["de", "fr", "fi", "pl", "it", "es", "nl", "jp", "ca", "us"].map((t) => [
      t,
      5,
      1,
      4,
    ]),
    ...[
      "by",
      "kz",
      "uz",
      "ge",
      "am",
      "az",
      "md",
      "ee",
      "lv",
      "lt",
      "se",
      "no",
      "dk",
      "ch",
      "at",
      "be",
      "cz",
      "sk",
      "pt",
      "gr",
      "ie",
      "au",
      "nz",
      "br",
      "in",
      "cn",
      "kr",
      "sg",
      "mx",
      "tr",
    ].map((t) => [t, 5, 1, 4]),
    ...[
      ["info", 0.8, 2],
      ["biz", 0.9, 3],
      ["live", 1, 6],
      ["club", 1.1, 6],
      ["store", 1.7, 12],
      ["shop", 1.6, 10],
      ["blog", 1.1, 8],
      ["cloud", 1.8, 18],
      ["digital", 1.3, 10],
      ["games", 1.7, 16],
      ["space", 1.2, 8],
      ["world", 1.1, 6],
      ["fun", 0.8, 3],
      ["art", 1.3, 10],
      ["design", 1.6, 14],
      ["studio", 1.3, 10],
      ["tv", 1.8, 18],
      ["news", 1.2, 8],
      ["pro", 1.8, 20],
      ["agency", 1.3, 8],
      ["finance", 2.3, 24],
      ["travel", 1.5, 10],
      ["social", 1.2, 8],
      ["network", 1.5, 12],
    ].map(([t, m, s]) => [t, 4, m, s]),
  ].map(([name, weight, multiplier, score]) => ({
    name: String(name),
    weight: Number(weight),
    multiplier: Number(multiplier),
    score: Number(score),
  })),
};
export type Drop = {
  name: string;
  tld: string;
  rarity: Rarity;
  score: number;
  value: number;
  tags: string[];
  breakdown: {
    base: number;
    tldMultiplier: number;
    rarityBonus: number;
    special: number;
    scale: number;
  };
};
export const random = () => randomInt(0, 0x100000000) / 0x100000000;
function pick<T>(entries: T[], weight: (v: T) => number, rng: () => number) {
  const total = entries.reduce((s, e) => s + weight(e), 0);
  let n = rng() * total;
  for (const e of entries) {
    n -= weight(e);
    if (n < 0) return e;
  }
  return entries.at(-1)!;
}
const words = [
  "car",
  "moon",
  "shop",
  "game",
  "code",
  "app",
  "go",
  "dev",
  "ai",
  "cat",
  "null",
  "void",
  "error",
  "cloud",
  "pixel",
  "nova",
  "star",
  "byte",
  "mint",
  "play",
  ..."sun sky fox dog owl bee wolf bear lion frog fish bird duck panda tiger whale shark eagle robin raven horse apple mango peach berry grape lemon lime melon coral ocean river lake snow rain wind storm fire ice earth stone sand leaf tree wood moss fern bloom rose iris lotus orbit solar lunar comet mars venus saturn space rocket astro cosmos music song beat jazz rock film cinema video photo art paint craft book story news daily today world globe city town home house room desk lamp chair cafe coffee tea cake bread pizza sushi pasta hotel trip travel route road train plane ship boat bike drive motor fast speed sprint run walk jump climb surf skate golf ball sport team win gold silver ruby jade pearl opal amber crypto coin cash bank money trade swap mint vault token chain block hash byte bit data code dev cloud stack node host server web app link click tap touch pixel vector grid frame shape font type design studio agency market shop store sale cart buy gift box pack bundle kit tool build maker forge create draft edit sketch draw write read learn teach class study brain mind smart logic puzzle quest hero epic myth legend dragon phoenix spirit ghost angel demon magic spell rune void null glitch error crash debug patch script shell terminal linux unix rust swift react vite java python ruby scala elixir go ai io me us it we be up on no yes ok hi yo zen neo lux aura nova core echo apex flow flux wave pulse spark light dark black white red blue green cyan pink aqua violet neon frost haze dusk dawn night noon zero one two six ten alpha beta gamma delta sigma omega atlas nexus vector vertex".split(
    " ",
  ),
];
const names = [
  ...new Set([
    "random482",
    "market928",
    "node472",
    "site839",
    "web625",
    "shop24",
    "car99",
    "pixel42",
    "cloud88",
    ...words,
    "111",
    "222",
    "333",
    "444",
    "555",
    "666",
    "777",
    "888",
    "999",
    "123",
    "404",
    "101",
    "1221",
    "a",
    "x",
    "go1",
    ...[
      "1111",
      "2222",
      "7777",
      "8888",
      "9999",
      "1001",
      "2002",
      "3003",
      "4004",
      "8008",
      "9009",
      "1234",
      "2345",
      "3456",
      "4567",
      "5678",
      "6789",
      "4321",
      "9876",
      "1212",
      "2020",
      "2121",
      "3030",
      "8080",
      "9090",
      "1337",
      "2048",
      "2026",
      "2027",
      "xyz",
      "abc",
      "aaa",
      "bbb",
      "xxx",
      "zzz",
    ],
    ...[
      "market",
      "domain",
      "portal",
      "system",
      "network",
      "signal",
      "project",
      "search",
      "browse",
      "mobile",
      "online",
      "digital",
      "global",
      "future",
      "studio",
      "travel",
      "gaming",
      "social",
      "stream",
      "design",
    ].flatMap((word) => [word + "24", word + "365", word + "482"]),
  ]),
];
const matches = new Set([
  "ai.ai",
  "game.gg",
  "code.dev",
  "app.app",
  "go.me",
  "dev.io",
  "cloud.cloud",
  "shop.shop",
  "store.store",
  "blog.blog",
  "news.news",
  "game.games",
  "art.art",
  "design.design",
  "studio.studio",
  "live.live",
  "go.travel",
  "coin.finance",
  "social.social",
  "network.network",
]);
export function evaluate(
  name: string,
  tld: Config["tlds"][number],
  config: Config,
): Drop {
  const tags: string[] = [];
  let score = 8,
    base = 100,
    special = 1;
  if (name.length <= 2) {
    tags.push("ULTRA SHORT");
    score += 35;
    base = 3500;
  } else if (name.length <= 4) {
    tags.push("SHORT");
    score += 16;
    base = 450;
    special *= 1.15;
  }
  if (/^\d+$/.test(name)) {
    tags.push("NUMERIC");
    score += 7;
    base = 700;
  }
  if (/^(.)\1{2}$/.test(name)) {
    tags.push("TRIPLE");
    score += 24;
    base = 10000;
    special *= 1.2;
  } else if (name.length >= 3 && name === name.split("").reverse().join("")) {
    tags.push("PALINDROME", "MIRROR");
    score += 15;
    base = 1600;
  }
  if (["123", "234", "345", "456", "567", "678", "789"].includes(name)) {
    tags.push("SEQUENCE");
    score += 20;
    base = 2000;
  }
  if (words.includes(name)) {
    tags.push("WORD");
    score += 14;
    base = name.length <= 2 ? 3500 : 650;
  }
  if (matches.has(`${name}.${tld.name}`)) {
    tags.push("PERFECT MATCH");
    score += 14;
    special *= 1.5;
  }
  score += tld.score;
  if (["ai", "com"].includes(tld.name)) tags.push("PREMIUM");
  // Premium names distinguish .com from .ai without making random.com Mythic.
  if (tld.name === "com" && score >= 70) score += 12;
  const rarity: Rarity =
    score >= 90
      ? "MYTHIC"
      : score >= 80
        ? "LEGENDARY"
        : score >= 60
          ? "EPIC"
          : score >= 45
            ? "RARE"
            : score >= 25
              ? "UNCOMMON"
              : "COMMON";
  const rarityBonus = [1, 1.05, 1.1, 1.15, 1.2, 1.25][rarities.indexOf(rarity)];
  return {
    name,
    tld: tld.name,
    rarity,
    score,
    value: Math.max(
      1,
      Math.round(
        base * tld.multiplier * rarityBonus * special * config.valueScale,
      ),
    ),
    tags,
    breakdown: {
      base,
      tldMultiplier: tld.multiplier,
      rarityBonus,
      special,
      scale: config.valueScale,
    },
  };
}
export function catalog(config: Config) {
  return names.flatMap((name) =>
    config.tlds.map((tld) => ({
      drop: evaluate(name, tld, config),
      weight: tld.weight,
    })),
  );
}
export function generate(
  config: Config,
  pity: number,
  rng = random,
  event?: { tld: string; boost: number },
  pool = catalog(config),
): Drop {
  const weights = [...config.weights];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (pity >= config.pityGuarantee - 1) {
    weights[0] = 0;
    weights[1] = 0;
  } else if (pity >= config.pityStart) {
    const boost = Math.min(0.08, 0.01 + (pity - config.pityStart) * 0.004);
    weights[2] += sum * boost;
  }
  const available = rarities
    .map((rarity, i) => ({ rarity, weight: weights[i] }))
    .filter((r) => pool.some((p) => p.drop.rarity === r.rarity));
  if (!available.some((r) => r.weight > 0))
    throw new Error("Configuration cannot generate guaranteed rarity");
  const rarity = pick(available, (r) => r.weight, rng).rarity;
  const candidates = pool.filter((p) => p.drop.rarity === rarity);
  const selected = pick(
    candidates,
    (p) => p.weight * (event?.tld === p.drop.tld ? event.boost : 1),
    rng,
  ).drop;
  if (selected.rarity === "COMMON") {
    // Cosmetic variation preserves length and pattern so score/value remain valid.
    const prefix = selected.name.replace(/\d+$/, "");
    if (prefix !== selected.name)
      return evaluate(
        prefix + String(100 + Math.floor(rng() * 900)),
        config.tlds.find((t) => t.name === selected.tld)!,
        config,
      );
  }
  return { ...selected, tags: [...selected.tags] };
}
export function validateConfig(config: Config) {
  const pool = catalog(config);
  for (const r of rarities)
    if (!pool.some((p) => p.drop.rarity === r))
      throw new Error(`Configuration must support ${r}`);
  return config;
}
export const xpFor = (rarity: Rarity) =>
  [1, 2, 5, 15, 50, 200][rarities.indexOf(rarity)];
export const levelFor = (xp: number) => 1 + Math.floor(Math.sqrt(xp / 25));
