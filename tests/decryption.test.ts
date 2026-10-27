import { test } from "node:test";
import assert from "node:assert/strict";
import { maskedText, reached, revealTimeline } from "../src/decryption.js";
import { rarities, type Domain } from "../shared/types.js";
function drop(rarity: Domain["rarity"]): Domain {
  return {
    id: "test",
    name: "777",
    tld: "ai",
    rarity,
    score: 85,
    value: 28000,
    tags: ["TRIPLE"],
    breakdown: {
      base: 10000,
      tldMultiplier: 2.5,
      rarityBonus: 1.2,
      special: 1,
      scale: 1,
    },
    status: "pending",
    favorite: false,
    vaulted: false,
    showcase: false,
    created_at: new Date(0).toISOString(),
  };
}
test("Decryption locks the real name before TLD, then multiplier, rarity, price, tags and actions", () => {
  for (const rarity of rarities) {
    const d = drop(rarity),
      frames = revealTimeline(d);
    let nameLocked = 0,
      tldLocked = 0;
    for (const frame of frames) {
      assert.ok(frame.nameLocked >= nameLocked);
      assert.ok(frame.tldLocked >= tldLocked);
      if (frame.tldLocked > 0) assert.equal(frame.nameLocked, d.name.length);
      if (reached(frame.stage, "multiplier"))
        assert.equal(frame.tldLocked, d.tld.length);
      nameLocked = frame.nameLocked;
      tldLocked = frame.tldLocked;
    }
    for (const stages of [
      ["multiplier", "rarity"],
      ["rarity", "value"],
      ["value", "tags"],
      ["tags", "ready"],
    ] as const) {
      assert.ok(
        frames.find((f) => f.stage === stages[0])!.at <
          frames.find((f) => f.stage === stages[1])!.at,
      );
    }
    const nameFrames = frames.filter((f) => f.stage === "name");
    assert.deepEqual(
      nameFrames.map((f) => f.nameLocked),
      [1, 2, 3],
    );
  }
});
test("Fast Spin meets timing ranges and preserves Epic+ duration", () => {
  for (const r of ["COMMON", "UNCOMMON"] as const)
    assert.equal(revealTimeline(drop(r), true).at(-1)!.at, 1000);
  assert.equal(revealTimeline(drop("RARE"), true).at(-1)!.at, 1500);
  for (const r of ["EPIC", "LEGENDARY", "MYTHIC"] as const)
    assert.equal(
      revealTimeline(drop(r), true).at(-1)!.at,
      revealTimeline(drop(r)).at(-1)!.at,
    );
  assert.ok(revealTimeline(drop("MYTHIC")).at(-1)!.at <= 5000);
});
test("Re-roll destruction precedes new initialization; reduced motion is short and resolves exact result", () => {
  const normal = revealTimeline(drop("COMMON"), false, false, true);
  assert.equal(normal[0].stage, "destroying");
  assert.equal(normal[1].stage, "initializing");
  assert.equal(normal[1].at, 350);
  const reduced = revealTimeline(drop("MYTHIC"), false, true, true);
  assert.equal(reduced.length, 2);
  assert.equal(reduced.at(-1)!.stage, "ready");
  assert.equal(reduced.at(-1)!.at, 100);
  assert.equal(reduced.at(-1)!.tldLocked, 2);
});
test("Unknown TLD characters cannot suggest another real prize; locked text never changes", () => {
  for (let tick = 0; tick < 100; tick++)
    for (let locked = 0; locked <= 2; locked++) {
      const text = maskedText("ai", locked, tick, true);
      assert.equal(text.slice(0, locked), "ai".slice(0, locked));
      if (locked < 2) {
        assert.ok(/[?#0-9]/.test(text));
        assert.notEqual(text, "com");
        assert.notEqual(text, "io");
      }
    }
  assert.equal(maskedText("777", 3, 99), "777");
  assert.equal(maskedText("online", 6, 1, true), "online");
});

test("Fixed TLD stays known throughout decryption without a secret-zone phase", () => {
  const d = drop("RARE");
  const frames = revealTimeline(d, false, false, false, true);
  assert.ok(frames.every((f) => f.tldLocked === d.tld.length));
  assert.ok(frames.every((f) => f.stage !== "tld" && f.stage !== "signal"));
  assert.equal(frames.at(-1)?.stage, "ready");
});

test("Rarity follows the fully visible domain by 300ms for Legendary and 400ms otherwise in RANDOM and fixed TLD modes", () => {
  for (const rarity of rarities)
    for (const fixed of [false, true])
      for (const fast of [false, true]) {
        const d = drop(rarity),
          frames = revealTimeline(d, fast, false, false, fixed);
        const complete = frames.find(
          (f) => f.nameLocked === d.name.length && f.tldLocked === d.tld.length,
        )!;
        const reveal = frames.find((f) => f.stage === "rarity")!;
        assert.equal(
          reveal.at - complete.at,
          rarity === "LEGENDARY" ? 300 : 400,
        );
        assert.ok(frames.find((f) => f.stage === "value")!.at > reveal.at);
      }
});

test("Mythic UNKNOWN SIGNAL has a readable pause before random TLD lock; reveal clocks remain monotonic", () => {
  for (const rarity of rarities) {
    for (const fixed of [false, true]) {
      const frames = revealTimeline(drop(rarity), false, false, false, fixed);
      for (let i = 1; i < frames.length; i++)
        assert.ok(frames[i].at >= frames[i - 1].at);
    }
  }
  const frames = revealTimeline(drop("MYTHIC"));
  assert.ok(
    frames.find((f) => f.stage === "tld")!.at -
      frames.find((f) => f.stage === "signal")!.at >=
      250,
  );
});
