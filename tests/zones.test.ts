import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, catalog } from "../server/economy.js";
import {
  zoneMarkets,
  generateForZone,
  chanceFor,
} from "../server/zone-market.js";
import { rarities } from "../shared/types.js";
test("Expanded catalog contains 81 unique zones and hundreds of different names", () => {
  assert.equal(defaultConfig.tlds.length, 81);
  assert.equal(new Set(defaultConfig.tlds.map((t) => t.name)).size, 81);
  assert.ok(new Set(catalog(defaultConfig).map((e) => e.drop.name)).size > 300);
  for (const name of [
    "ua",
    "ru",
    "com",
    "ai",
    "cloud",
    "store",
    "kz",
    "by",
    "tv",
    "finance",
  ])
    assert.ok(zoneMarkets(defaultConfig).has(name));
});
test("Affordable zones are cheaper with higher Rare+ odds, premium zones pay more for the same name", () => {
  const markets = zoneMarkets(defaultConfig),
    ua = markets.get("ua")!,
    com = markets.get("com")!;
  assert.equal(ua.spinPrice, 200);
  assert.equal(com.spinPrice, 2250);
  assert.ok(ua.baseRareChance > com.baseRareChance);
  const same = (zone: typeof ua) =>
    zone.buckets.flat().find((d) => d.name === "777")!;
  assert.ok(same(com).value > same(ua).value);
  assert.equal(same(com).tld, "com");
});
test("Every selected zone stays fixed and its guarantee works even in low tier TLDs", () => {
  for (const zone of zoneMarkets(defaultConfig).values()) {
    assert.equal(chanceFor(zone, defaultConfig, 29), 1);
    for (let i = 0; i < 5; i++) {
      const drop = generateForZone(
        defaultConfig,
        zone.name,
        29,
        () => 0.9999,
        1,
        zone,
      );
      assert.equal(drop.tld, zone.name);
      assert.ok(rarities.indexOf(drop.rarity) >= 2);
      assert.ok(drop.value > 0);
    }
  }
  assert.throws(() => generateForZone(defaultConfig, "invalidzone", 0));
});
test("Selected-zone economy targets 85% RTP including its own pity sequence", () => {
  for (const tld of ["xyz", "ua", "ai", "com"]) {
    let seed = 72531;
    const rng = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const zone = zoneMarkets(defaultConfig).get(tld)!;
    let pity = 0,
      total = 0;
    const n = 150000;
    for (let i = 0; i < n; i++) {
      const d = generateForZone(defaultConfig, tld, pity, rng, 1, zone);
      total += d.value;
      pity = rarities.indexOf(d.rarity) >= 2 ? 0 : pity + 1;
    }
    const rtp = total / n / zone.spinPrice;
    assert.ok(rtp > 0.79 && rtp < 0.91, `${tld}: ${rtp}`);
  }
});
