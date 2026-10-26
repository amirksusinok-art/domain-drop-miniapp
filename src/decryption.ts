import type { Domain } from "../shared/types";

export type RevealStage =
  | "destroying"
  | "initializing"
  | "scramble"
  | "name"
  | "signal"
  | "tld"
  | "multiplier"
  | "analyzing"
  | "rarity"
  | "value"
  | "tags"
  | "ready";
export type RevealFrame = {
  at: number;
  stage: RevealStage;
  nameLocked: number;
  tldLocked: number;
};
export function revealTimeline(
  domain: Domain,
  fast = false,
  reduced = false,
  reroll = false,
): RevealFrame[] {
  if (reduced)
    return [
      { at: 0, stage: "initializing", nameLocked: 0, tldLocked: 0 },
      {
        at: 100,
        stage: "ready",
        nameLocked: domain.name.length,
        tldLocked: domain.tld.length,
      },
    ];
  const target =
    fast && ["COMMON", "UNCOMMON"].includes(domain.rarity)
      ? 1000
      : fast && domain.rarity === "RARE"
        ? 1500
        : {
            COMMON: 2700,
            UNCOMMON: 2700,
            RARE: 3100,
            EPIC: 3500,
            LEGENDARY: 4000,
            MYTHIC: 4500,
          }[domain.rarity];
  const frames: RevealFrame[] = [];
  let at = 0,
    nameLocked = 0,
    tldLocked = 0;
  const push = (stage: RevealStage) =>
    frames.push({ at, stage, nameLocked, tldLocked });
  push("initializing");
  at += 250;
  push("scramble");
  at += 320;
  for (let i = 1; i <= domain.name.length; i++) {
    at += 700 / domain.name.length;
    nameLocked = i;
    push("name");
  }
  at += 60;
  push("signal");
  at +=
    domain.rarity === "MYTHIC"
      ? 450
      : domain.rarity === "LEGENDARY"
        ? 350
        : domain.rarity === "EPIC"
          ? 240
          : 180;
  push("tld");
  for (let i = 1; i <= domain.tld.length; i++) {
    at += i === domain.tld.length ? 300 : 120;
    tldLocked = i;
    push("tld");
  }
  at += 120;
  push("multiplier");
  at += 120;
  push("analyzing");
  at += 300;
  push("rarity");
  at += 180;
  push("value");
  at += 180;
  push("tags");
  at += 180;
  push("ready");
  const offset = reroll ? 350 : 0;
  return [
    ...(reroll
      ? [{ at: 0, stage: "destroying" as const, nameLocked: 0, tldLocked: 0 }]
      : []),
    ...frames.map((f) => ({
      ...f,
      at: Math.round((f.at / at) * target) + offset,
    })),
  ];
}
export const stageOrder: RevealStage[] = [
  "destroying",
  "initializing",
  "scramble",
  "name",
  "signal",
  "tld",
  "multiplier",
  "analyzing",
  "rarity",
  "value",
  "tags",
  "ready",
];
export const reached = (stage: RevealStage, threshold: RevealStage) =>
  stageOrder.indexOf(stage) >= stageOrder.indexOf(threshold);
// Unlocked TLD symbols cannot form a real alternative TLD or near-miss prize.
export function maskedText(
  text: string,
  locked: number,
  tick: number,
  tld = false,
) {
  const alphabet = tld ? "?#04826" : "#X7?A94K2";
  return [...text]
    .map((char, i) =>
      i < locked ? char : alphabet[(tick * 7 + i * 3) % alphabet.length],
    )
    .join("");
}
