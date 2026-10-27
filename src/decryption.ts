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
  fixedZone = false,
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
            COMMON: 1700,
            UNCOMMON: 1900,
            RARE: 2400,
            EPIC: 3000,
            LEGENDARY: 3600,
            MYTHIC: 4000,
          }[domain.rarity];
  const offset = reroll ? 350 : 0,
    complete = target - (domain.rarity === "MYTHIC" ? 1100 : 720),
    nameEnd = fixedZone ? complete : Math.round(complete * 0.68);
  const frames: RevealFrame[] = [];
  const add = (
    at: number,
    stage: RevealStage,
    nameLocked: number,
    tldLocked: number,
  ) => frames.push({ at: at + offset, stage, nameLocked, tldLocked });
  if (reroll)
    frames.push({
      at: 0,
      stage: "destroying",
      nameLocked: 0,
      tldLocked: fixedZone ? domain.tld.length : 0,
    });
  const known = fixedZone ? domain.tld.length : 0;
  add(0, "initializing", 0, known);
  add(Math.min(200, Math.round(complete * 0.2)), "scramble", 0, known);
  for (let i = 1; i <= domain.name.length; i++)
    add(
      Math.round(
        complete * 0.25 +
          ((nameEnd - complete * 0.25) * i) / domain.name.length,
      ),
      "name",
      i,
      known,
    );
  if (!fixedZone) {
    add(nameEnd + 1, "signal", domain.name.length, 0);
    add(nameEnd + 20, "tld", domain.name.length, 0);
    for (let i = 1; i <= domain.tld.length; i++)
      add(
        Math.round(nameEnd + ((complete - nameEnd) * i) / domain.tld.length),
        "tld",
        domain.name.length,
        i,
      );
  }
  add(complete + 1, "multiplier", domain.name.length, domain.tld.length);
  add(
    complete +
      (domain.rarity === "MYTHIC"
        ? 400
        : domain.rarity === "LEGENDARY"
          ? 300
          : 100),
    "analyzing",
    domain.name.length,
    domain.tld.length,
  );
  add(
    complete +
      (domain.rarity === "MYTHIC"
        ? 650
        : domain.rarity === "LEGENDARY"
          ? 450
          : 300),
    "rarity",
    domain.name.length,
    domain.tld.length,
  );
  add(
    complete +
      (domain.rarity === "MYTHIC"
        ? 850
        : domain.rarity === "LEGENDARY"
          ? 570
          : ["COMMON", "UNCOMMON"].includes(domain.rarity)
            ? 360
            : 420),
    "value",
    domain.name.length,
    domain.tld.length,
  );
  add(target - 80, "tags", domain.name.length, domain.tld.length);
  add(target, "ready", domain.name.length, domain.tld.length);
  return frames;
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
