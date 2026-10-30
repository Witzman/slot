import { EVENT_CHANCE } from "./events";
import { HAND_ORDER, type HandRank } from "./hands";

/** Everything the tech tree, the charms and the upgrades of a run can change. Built fresh from the base by `modsFor`. */
export interface Mods {
  startCoins: number;
  turns: number;
  slotMaxBet: number;
  /** multiplies everything a round pays */
  slotWinMul: number;
  /** multiplies the pay of each hand rank */
  handMul: Record<HandRank, number>;
  /** each paying line beyond the third makes a round pay this much more */
  lineBonus: number;
  /** single cards may be held, not only rows and columns */
  singleHold: boolean;
  /** the most lines (rows and columns) that may be held; the tree raises it from 2 up to 5 (10 is no limit) */
  holdMax: number;
  /** free draws after the first: the player holds again, only the last draw pays */
  redraws: number;
  /** ranks that are not in the deck (2 to 14) */
  removedRanks: number[];
  /** the kinds of card upgrade the player may buy in a run (rank-ups always; the tree unlocks the rest) */
  cardKinds: string[];
  /** multiplies the price of card upgrades */
  cardCostMul: number;
  /** Endless mode: automatic rounds per second (0: none) */
  autoRate: number;
  quotaMul: number;
  /** share of the coins kept at round end that is paid as interest (capped) */
  interest: number;
  /** charm re-draws a round may have (the tree gives one per run) */
  rerolls: number;
  /** tickets a run starts with */
  startTickets: number;
  /** chance that a cleared round is followed by an event */
  eventChance: number;
}

export function baseMods(): Mods {
  return {
    startCoins: 100,
    turns: 12,
    slotMaxBet: 3,
    slotWinMul: 1,
    handMul: Object.fromEntries(HAND_ORDER.map((r) => [r, 1])) as Record<HandRank, number>,
    lineBonus: 0,
    singleHold: false,
    holdMax: 2,
    redraws: 0,
    removedRanks: [],
    cardKinds: ["rank"],
    cardCostMul: 1,
    autoRate: 0,
    quotaMul: 1,
    interest: 0,
    rerolls: 0,
    startTickets: 0,
    eventChance: EVENT_CHANCE,
  };
}

export type Effect = (m: Mods) => void;
