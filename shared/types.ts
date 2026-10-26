export const rarities = [
  "COMMON",
  "UNCOMMON",
  "RARE",
  "EPIC",
  "LEGENDARY",
  "MYTHIC",
] as const;
export type Rarity = (typeof rarities)[number];
export type Domain = {
  id: string;
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
  status: "pending" | "kept" | "sold" | "destroyed";
  favorite: boolean;
  vaulted: boolean;
  showcase: boolean;
  created_at: string;
};
export type Profile = {
  id: string;
  username: string;
  first_name: string;
  coins: number;
  xp: number;
  level: number;
  pity: number;
  spins: number;
  free_spin: boolean;
  daily_claimed: boolean;
  reroll_available: boolean;
  reroll_tokens: number;
  scanner_tokens: number;
  vault_slots: number;
  theme: string;
  onboarded: boolean;
  admin: boolean;
  collection_count: number;
  collection_value: number;
  rare_counts: Record<string, number>;
  best_domain: Domain | null;
  favorite_tld: string | null;
};
export type Quest = {
  id: string;
  title: string;
  target: number;
  progress: number;
  coins: number;
  xp: number;
  scanner: number;
  reroll: number;
  claimed: boolean;
};
export type Auction = {
  id: string;
  domain: Domain;
  ends_at: string;
  bid: number;
  minimum: number;
  bidder_name: string | null;
  mine: boolean;
  status: string;
};
export type Event = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  tld: string;
  boost: number;
};
export type State = {
  profile: Profile;
  pending: Domain | null;
  config: { spinPrice: number; dailyReward: number; pityGuarantee: number };
  quests: Quest[];
  events: Event[];
  scanner: { id: string } | null;
  serverTime: string;
};
