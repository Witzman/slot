import { type Card, rankOf } from "./cards";
import { type Rng, next } from "./rng";
import { type CardUpgrade, type Edition, type LineScore, type Seal, COIN_SEAL_PAY, FOIL_PAY, GLASS_MUL, POLY_MUL, STONE_PAY, lineCells } from "./round";

/**
 * What a card can become. Enhancements: a higher rank (up to 3 levels), a joker (the best card for any hand, at most 3), gold, any suit, glass, stone.
 * One edition (foil, holo, poly, negative) and one seal (coin, red) per card.
 */
export type CardKind = "rank" | "joker" | "gold" | "anySuit" | "glass" | "stone" | "foil" | "holo" | "poly" | "negative" | "coin" | "red";
export const CARD_KINDS: readonly CardKind[] = ["rank", "gold", "anySuit", "joker", "glass", "stone", "foil", "holo", "poly", "negative", "coin", "red"];
export const CARD_KIND_LABEL: Record<CardKind, string> = {
  rank: "Rank up",
  gold: "Gold",
  anySuit: "Any suit",
  joker: "Joker",
  glass: "Glass",
  stone: "Stone",
  foil: "Foil",
  holo: "Holo",
  poly: "Polychrome",
  negative: "Negative",
  coin: "Coin seal",
  red: "Red seal",
};
export const CARD_KIND_TEXT: Record<CardKind, string> = {
  rank: "Counts one rank higher (up to 3 times, never above the ace).",
  gold: "Every hand this card is in pays 50% more.",
  anySuit: "Counts as any suit: flushes get easier.",
  joker: "Counts as the best card for every hand it is in (3 jokers at most).",
  glass: `Every line this card is in pays x${GLASS_MUL}. After a round it may shatter and be plain again.`,
  stone: `A blank: never part of a hand, but each of its lines pays ${STONE_PAY} bets, hand or not.`,
  foil: `Every paying line this card is in pays ${FOIL_PAY} bets more.`,
  holo: "Every paying line this card is in pays 100% more.",
  poly: `Every paying line this card is in pays x${POLY_MUL}.`,
  negative: "One more joker may be in the deck (2 negative cards at most).",
  coin: `Pays ${COIN_SEAL_PAY} bets when the card is held through the draw.`,
  red: "The bonuses of this card (gold, foil, holo, poly) count twice.",
};
export const MAX_RANK_LEVELS = 3;
export const MAX_JOKERS = 3;
/** Negative cards that may be in the deck, each one lifts the joker limit by one. */
export const MAX_NEGATIVE = 2;
/** The chance that a glass card in a paying line shatters after the round. */
export const GLASS_BREAK = 0.2;
const BASE_COST: Record<CardKind, number> = { rank: 12, anySuit: 20, gold: 25, joker: 60, glass: 30, stone: 30, foil: 25, holo: 40, poly: 55, negative: 45, coin: 30, red: 50 };

const EDITION_OF: Partial<Record<CardKind, Edition>> = { foil: "foil", holo: "holo", poly: "poly", negative: "negative" };
const SEAL_OF: Partial<Record<CardKind, Seal>> = { coin: "coin", red: "red" };

/** How many upgrades have been bought in all: the price of the next one grows with it. */
export function upgradesBought(ups: Readonly<Record<number, CardUpgrade>>): number {
  let n = 0;
  for (const u of Object.values(ups)) n += (u.rank ?? 0) + [u.joker, u.gold, u.anySuit, u.glass, u.stone, u.edition, u.seal].filter(Boolean).length;
  return n;
}

/** Jokers the deck may hold: the base limit and one more for each negative card. */
export const jokerLimit = (ups: Readonly<Record<number, CardUpgrade>>): number => MAX_JOKERS + Math.min(MAX_NEGATIVE, Object.values(ups).filter((u) => u.edition === "negative").length);

/** Coins for the next upgrade of a kind: the base price times 1.6 for every upgrade already bought, times the tree's discount. */
export function cardUpgradeCost(ups: Readonly<Record<number, CardUpgrade>>, kind: CardKind, costMul = 1): number {
  return Math.ceil(BASE_COST[kind] * Math.pow(1.6, upgradesBought(ups)) * costMul);
}

/** The upgrades with one more of `kind` on `card`, or null when that is not possible (already has it, a limit is used up, the card cannot carry both). */
export function applyCardUpgrade(ups: Readonly<Record<number, CardUpgrade>>, card: number, kind: CardKind): Record<number, CardUpgrade> | null {
  const cur = ups[card] ?? {};
  const next: CardUpgrade = { ...cur };
  const edition = EDITION_OF[kind];
  const seal = SEAL_OF[kind];
  if (kind === "rank") {
    if ((cur.rank ?? 0) >= MAX_RANK_LEVELS || cur.joker || cur.stone || rankOf(card) + (cur.rank ?? 0) >= 14) return null; // a card never rises above the ace
    next.rank = (cur.rank ?? 0) + 1;
  } else if (kind === "joker") {
    if (cur.joker || cur.stone || Object.values(ups).filter((u) => u.joker).length >= jokerLimit(ups)) return null;
    next.joker = true;
  } else if (kind === "gold") {
    if (cur.gold) return null;
    next.gold = true;
  } else if (kind === "anySuit") {
    if (cur.anySuit || cur.joker || cur.stone) return null;
    next.anySuit = true;
  } else if (kind === "glass") {
    if (cur.glass || cur.stone) return null;
    next.glass = true;
  } else if (kind === "stone") {
    if (cur.stone || cur.glass || cur.joker || cur.anySuit || cur.rank) return null; // a blank takes nothing that changes what the card is
    next.stone = true;
  } else if (edition) {
    if (cur.edition || (edition === "negative" && Object.values(ups).filter((u) => u.edition === "negative").length >= MAX_NEGATIVE)) return null;
    next.edition = edition;
  } else if (seal) {
    if (cur.seal) return null;
    next.seal = seal;
  } else {
    return null;
  }
  return { ...ups, [card]: next };
}

/**
 * After a final draw: each glass card that sat in a paying line shatters with the chance GLASS_BREAK (one roll per card, in card order) and is plain again.
 * Returns the cards that broke; `ups` is changed in place.
 */
export function shatterGlass(rng: Rng, ups: Record<number, CardUpgrade>, board: readonly Card[], lines: readonly LineScore[]): Card[] {
  const broken: Card[] = [];
  const paying = new Set<Card>();
  for (const l of lines) for (const i of lineCells(l.line)) paying.add(board[i] as Card);
  for (const card of [...paying].sort((a, b) => a - b)) {
    const u = ups[card];
    if (!u?.glass || next(rng) >= GLASS_BREAK) continue;
    const { glass: _gone, ...rest } = u;
    if (Object.keys(rest).length > 0) ups[card] = rest;
    else delete ups[card];
    broken.push(card);
  }
  return broken;
}
