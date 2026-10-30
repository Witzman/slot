export type HandRank = "jacks" | "twoPair" | "three" | "straight" | "flush" | "fullHouse" | "four" | "straightFlush" | "royal" | "five";

/** From the lowest paying hand to the highest. */
export const HAND_ORDER: readonly HandRank[] = ["jacks", "twoPair", "three", "straight", "flush", "fullHouse", "four", "straightFlush", "five", "royal"];

export const HAND_LABEL: Record<HandRank, string> = {
  jacks: "Jacks or better",
  twoPair: "Two pair",
  three: "Three of a kind",
  straight: "Straight",
  flush: "Flush",
  fullHouse: "Full house",
  four: "Four of a kind",
  straightFlush: "Straight flush",
  royal: "Royal flush",
  five: "Five of a kind",
};

/** Pay in bets per line. Starting values; the balance pass retunes them. */
export const BASE_PAY: Record<HandRank, number> = { jacks: 2, twoPair: 3, three: 5, straight: 6, flush: 9, fullHouse: 14, four: 40, straightFlush: 80, royal: 400, five: 150 };

export interface HandCard {
  rank: number;
  suit: number;
  /** takes the rank and suit that make the best hand */
  joker?: boolean;
  /** counts as the suit the other cards have */
  anySuit?: boolean;
}

const ORDER_INDEX = new Map(HAND_ORDER.map((r, i) => [r, i]));
const better = (a: HandRank | null, b: HandRank | null): HandRank | null => (a === null ? b : b === null ? a : (ORDER_INDEX.get(b) as number) > (ORDER_INDEX.get(a) as number) ? b : a);

/** Ranks of five cards (jokers already given a rank) and whether they are all of one suit. */
function classify(ranks: number[], flush: boolean): HandRank | null {
  const count = new Map<number, number>();
  for (const r of ranks) count.set(r, (count.get(r) ?? 0) + 1);
  const groups = [...count.values()].sort((a, b) => b - a);
  const distinct = [...count.keys()].sort((a, b) => a - b);
  const consecutive = distinct.length === 5 && distinct[4] === (distinct[0] as number) + 4;
  const wheel = distinct.length === 5 && distinct.join() === "2,3,4,5,14";
  const straight = consecutive || wheel;
  if (groups[0] === 5) return "five";
  if (straight && flush) return consecutive && distinct[0] === 10 ? "royal" : "straightFlush";
  if (groups[0] === 4) return "four";
  if (groups[0] === 3 && groups[1] === 2) return "fullHouse";
  if (flush) return "flush";
  if (straight) return "straight";
  if (groups[0] === 3) return "three";
  if (groups[0] === 2 && groups[1] === 2) return "twoPair";
  if (groups[0] === 2) return (ranks.find((r) => (count.get(r) ?? 0) === 2) as number) >= 11 ? "jacks" : null;
  return null;
}

/**
 * The poker rank of a line of five cards, or null when it does not pay (below a pair of jacks).
 * Jokers take the rank that makes the best hand and the suit the others have (all combinations of joker ranks are tried: at most 455 for three jokers; four or five jokers are decided at once).
 */
export function rankHand(cards: readonly HandCard[]): HandRank | null {
  const jokers = cards.filter((c) => c.joker).length;
  const real = cards.filter((c) => !c.joker);
  const suits = new Set(real.filter((c) => !c.anySuit).map((c) => c.suit));
  const flush = suits.size <= 1;
  if (jokers >= 5) return "royal";
  if (jokers === 4) return (real[0] as HandCard).rank >= 10 ? "royal" : "straightFlush";
  const base = real.map((c) => c.rank);
  if (jokers === 0) return classify(base, flush);
  let best: HandRank | null = null;
  const fill = (from: number, left: number, picked: number[]): void => {
    if (left === 0) {
      best = better(best, classify([...base, ...picked], flush));
      return;
    }
    for (let r = from; r <= 14; r++) fill(r, left - 1, [...picked, r]);
  };
  fill(2, jokers, []);
  return best;
}
