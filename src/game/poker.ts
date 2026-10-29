import { type Rng, shuffle } from "./rng";

/** Jacks or Better. A card is 0..51: rank = c % 13 + 2 (2..14, ace high), suit = floor(c / 13). */
export type HandName = "royal" | "straightFlush" | "four" | "fullHouse" | "flush" | "straight" | "three" | "twoPair" | "jacks";

export const HAND_ORDER: readonly HandName[] = ["royal", "straightFlush", "four", "fullHouse", "flush", "straight", "three", "twoPair", "jacks"];

export const BASE_PAY: Record<HandName, number> = {
  royal: 250,
  straightFlush: 50,
  four: 25,
  fullHouse: 9,
  flush: 6,
  straight: 4,
  three: 3,
  twoPair: 2,
  jacks: 1,
};

export const HAND_LABEL: Record<HandName, string> = {
  royal: "Royal flush",
  straightFlush: "Straight flush",
  four: "Four of a kind",
  fullHouse: "Full house",
  flush: "Flush",
  straight: "Straight",
  three: "Three of a kind",
  twoPair: "Two pair",
  jacks: "Jacks or better",
};

export const rank = (c: number): number => (c % 13) + 2;
export const suit = (c: number): number => Math.floor(c / 13);

export function newDeck(rng: Rng): number[] {
  return shuffle(rng, Array.from({ length: 52 }, (_, i) => i));
}

export function classify(hand: readonly number[]): HandName | null {
  if (hand.length !== 5) throw new Error("a hand has five cards");
  const ranks = hand.map(rank).sort((a, b) => a - b);
  const flush = hand.every((c) => suit(c) === suit(hand[0] as number));
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  const wheel = ranks.join() === "2,3,4,5,14";
  const straight = new Set(ranks).size === 5 && (ranks[4] as number) - (ranks[0] as number) === 4;
  if (flush && ranks.join() === "10,11,12,13,14") return "royal";
  if (flush && (straight || wheel)) return "straightFlush";
  if (groups[0] === 4) return "four";
  if (groups[0] === 3 && groups[1] === 2) return "fullHouse";
  if (flush) return "flush";
  if (straight || wheel) return "straight";
  if (groups[0] === 3) return "three";
  if (groups[0] === 2 && groups[1] === 2) return "twoPair";
  if (groups[0] === 2) {
    for (const [r, n] of counts) if (n === 2 && r >= 11) return "jacks";
  }
  return null;
}

export function payFor(name: HandName | null, bet: number, table: Record<HandName, number> = BASE_PAY): number {
  return name ? table[name] * bet : 0;
}

export interface PokerState {
  phase: "bet" | "hold";
  hand: number[];
  deck: number[];
  held: boolean[];
  bet: number;
  /** draws left in this hand (1, or 2 with a second draw) */
  draws: number;
}

export function freshPoker(): PokerState {
  return { phase: "bet", hand: [], deck: [], held: [false, false, false, false, false], bet: 1, draws: 0 };
}

export function deal(s: PokerState, rng: Rng, bet: number, draws: number): void {
  s.deck = newDeck(rng);
  s.hand = s.deck.splice(0, 5);
  s.held = [false, false, false, false, false];
  s.bet = bet;
  s.draws = draws;
  s.phase = "hold";
}

export function toggleHold(s: PokerState, i: number): void {
  if (s.phase !== "hold" || i < 0 || i > 4) return;
  s.held[i] = !s.held[i];
}

/** Replaces the cards not held. Returns true when the hand is over (no draw left). */
export function draw(s: PokerState): boolean {
  if (s.phase !== "hold" || s.draws <= 0) return true;
  for (let i = 0; i < 5; i++) if (!s.held[i]) s.hand[i] = s.deck.shift() as number;
  s.draws--;
  if (s.draws === 0) {
    s.phase = "bet";
    return true;
  }
  return false;
}
