import type { Meta } from "./meta";
import type { Effect } from "./mods";

/** What a Climb run starts from: a start deck (a rule set the player picks) or a challenge (fixed rules and a fixed seed, with a goal). */
export interface Setup {
  id: string;
  name: string;
  kind: "deck" | "challenge";
  text: string;
  /** how it opens, as the player reads it */
  lock: string;
  unlocked: (m: Pick<Meta, "runs" | "maxStake" | "bestRound">) => boolean;
  effect: Effect;
  /** challenges: the same board every time */
  seed?: number;
  /** challenges: quotas to pay for it to count as cleared */
  goal?: number;
}

/** Chips for the first clear of a challenge. */
export const CHALLENGE_CHIPS = 10;

export const SETUPS: readonly Setup[] = [
  { id: "classic", name: "Classic", kind: "deck", text: "The plain deck, no changes.", lock: "Always open.", unlocked: () => true, effect: () => {} },
  {
    id: "lean",
    name: "Lean Deck",
    kind: "deck",
    text: "The twos, threes and fours leave the deck: more pairs and straights. Quota x1.15.",
    lock: "Finish a run.",
    unlocked: (m) => m.runs >= 1,
    effect: (m) => void (([2, 3, 4] as const).forEach((r) => m.removedRanks.includes(r) || m.removedRanks.push(r)), (m.quotaMul *= 1.15)),
  },
  {
    id: "gambler",
    name: "Gambler's Deck",
    kind: "deck",
    text: "Pairs and two pair pay 30% less, three of a kind and better pay 25% more.",
    lock: "Reach round 4.",
    unlocked: (m) => m.bestRound >= 4,
    effect: (m) => {
      for (const r of ["jacks", "twoPair"] as const) m.handMul[r] *= 0.7;
      for (const r of ["three", "straight", "flush", "fullHouse", "four", "straightFlush", "royal"] as const) m.handMul[r] *= 1.25;
    },
  },
  {
    id: "steadfast",
    name: "Steadfast Deck",
    kind: "deck",
    text: "Hold one more line, but 3 turns fewer every round.",
    lock: "Unlock stake 1.",
    unlocked: (m) => m.maxStake >= 1,
    effect: (m) => void ((m.holdMax += 1), (m.turns = Math.max(4, m.turns - 3))),
  },
  {
    id: "wild",
    name: "Deuces Wild",
    kind: "deck",
    text: "Every two is a joker, but pairs and two pair pay nothing.",
    lock: "Reach round 6.",
    unlocked: (m) => m.bestRound >= 6,
    effect: (m) => void ((m.wildRanks.includes(2) || m.wildRanks.push(2)), (m.handMul.jacks = 0), (m.handMul.twoPair = 0)),
  },
  {
    id: "thin",
    name: "Thin Air",
    kind: "challenge",
    text: "The twos to sixes are gone. Quota x3. Pay 22 quotas.",
    lock: "Finish a run.",
    unlocked: (m) => m.runs >= 1,
    seed: 1101,
    goal: 22,
    effect: (m) => void (([2, 3, 4, 5, 6] as const).forEach((r) => m.removedRanks.includes(r) || m.removedRanks.push(r)), (m.quotaMul *= 3)),
  },
  {
    id: "tight",
    name: "Tight Fist",
    kind: "challenge",
    text: "Bet 1 only, hold up to 5 lines, 10 turns. Pay 14 quotas.",
    lock: "Finish a run.",
    unlocked: (m) => m.runs >= 1,
    seed: 2202,
    goal: 14,
    effect: (m) => void ((m.slotMaxBet = 1), (m.holdMax = 5), (m.turns = 10)),
  },
  {
    id: "shoestring",
    name: "Shoestring",
    kind: "challenge",
    text: "Start with 60 coins, but 15% interest. Pay 21 quotas.",
    lock: "Finish a run.",
    unlocked: (m) => m.runs >= 1,
    seed: 3303,
    goal: 21,
    effect: (m) => void ((m.startCoins = 60), (m.interest += 0.15)),
  },
];

export const setupById = (id: string): Setup | undefined => SETUPS.find((s) => s.id === id);

export const setupUnlocked = (m: Pick<Meta, "runs" | "maxStake" | "bestRound">, id: string): boolean => setupById(id)?.unlocked(m) ?? false;

/** The seed of a day (days since 1970, counted by the app: the game layer reads no clock). Everyone gets the same board that day. */
export const dailySeed = (day: number): number => (Math.imul(day, 2654435761) ^ 0x9e3779b9) >>> 0;

/** Keep the best result of a day and the best of the last day played, to compare with. */
export function recordDaily(meta: Meta, day: number, score: number): void {
  const d = meta.daily;
  if (d.day === day) {
    d.best = Math.max(d.best, score);
    return;
  }
  meta.daily = { day, best: score, prev: d.best };
}
