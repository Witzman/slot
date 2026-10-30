import { rankOf } from "./cards";
import type { CardUpgrade } from "./round";

/** What a card can become: a higher rank (up to 3 levels), the best card for any hand (a joker, at most 3 in the deck), gold (hands with it pay 50% more), or any suit. */
export type CardKind = "rank" | "joker" | "gold" | "anySuit";
export const CARD_KINDS: readonly CardKind[] = ["rank", "gold", "anySuit", "joker"];
export const CARD_KIND_LABEL: Record<CardKind, string> = { rank: "Rank up", gold: "Gold", anySuit: "Any suit", joker: "Joker" };
export const CARD_KIND_TEXT: Record<CardKind, string> = {
  rank: "Counts one rank higher (up to 3 times, never above the ace).",
  gold: "Every hand this card is in pays 50% more.",
  anySuit: "Counts as any suit: flushes get easier.",
  joker: "Counts as the best card for every hand it is in (3 jokers at most).",
};
export const MAX_RANK_LEVELS = 3;
export const MAX_JOKERS = 3;
const BASE_COST: Record<CardKind, number> = { rank: 12, anySuit: 20, gold: 25, joker: 60 };

/** How many upgrades have been bought in all: the price of the next one grows with it. */
export function upgradesBought(ups: Readonly<Record<number, CardUpgrade>>): number {
  let n = 0;
  for (const u of Object.values(ups)) n += (u.rank ?? 0) + (u.joker ? 1 : 0) + (u.gold ? 1 : 0) + (u.anySuit ? 1 : 0);
  return n;
}

/** Coins for the next upgrade of a kind: the base price times 1.6 for every upgrade already bought, times the tree's discount. */
export function cardUpgradeCost(ups: Readonly<Record<number, CardUpgrade>>, kind: CardKind, costMul = 1): number {
  return Math.ceil(BASE_COST[kind] * Math.pow(1.6, upgradesBought(ups)) * costMul);
}

/** The upgrades with one more of `kind` on `card`, or null when that is not possible (already has it, rank levels used up, jokers used up). */
export function applyCardUpgrade(ups: Readonly<Record<number, CardUpgrade>>, card: number, kind: CardKind): Record<number, CardUpgrade> | null {
  const cur = ups[card] ?? {};
  const next: CardUpgrade = { ...cur };
  if (kind === "rank") {
    if ((cur.rank ?? 0) >= MAX_RANK_LEVELS || cur.joker || rankOf(card) + (cur.rank ?? 0) >= 14) return null; // a card never rises above the ace
    next.rank = (cur.rank ?? 0) + 1;
  } else if (kind === "joker") {
    if (cur.joker || Object.values(ups).filter((u) => u.joker).length >= MAX_JOKERS) return null;
    next.joker = true;
  } else if (kind === "gold") {
    if (cur.gold) return null;
    next.gold = true;
  } else {
    if (cur.anySuit || cur.joker) return null;
    next.anySuit = true;
  }
  return { ...ups, [card]: next };
}
