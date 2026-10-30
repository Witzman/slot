import { EVENT_CHANCE } from "./events";
import { HAND_ORDER, type HandRank } from "./hands";
import type { ScoreMods } from "./round";

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
  /** lines (0..9, rows then columns) that pay nothing */
  deadLines: number[];
  /** columns may be held (a boss can forbid it) */
  colHold: boolean;
  /** ranks (2 to 14) whose cards count as jokers, by their face (a pay table variant) */
  wildRanks: number[];
  /** bets paid for each pair of neighbouring cards of one rank (across and down); 0: none */
  adjacency: number;
  /** cells (0..24) whose card counts as gold, whatever the card is */
  goldCells: number[];
  /** cards hidden at the hold of each deal: shown only by the draw, a held one pays its lines more */
  mystery: number;
  /** nudges a round has: shift a row or a column one cell before the draw */
  nudges: number;
  /** Endless: the machine buys the cheapest shop upgrade it can afford while it plays (from milestone 3) */
  autoBuy: boolean;
  /** Endless: the machine prestiges by itself at milestone 9 */
  autoPrestige: boolean;
  /** Endless: double-or-nothing tries after a win (0: none) */
  gamble: number;
}

export function baseMods(): Mods {
  return {
    startCoins: 150,
    turns: 14,
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
    deadLines: [],
    colHold: true,
    wildRanks: [],
    adjacency: 0,
    goldCells: [],
    mystery: 0,
    nudges: 0,
    autoBuy: false,
    autoPrestige: false,
    gamble: 0,
  };
}

export type Effect = (m: Mods) => void;

/** What the scoring reads from the mods of a round. `deadLines` are lines that pay nothing (a lockout boss adds its line). */
export const scoreMods = (m: Mods, deadLines: readonly number[] = m.deadLines): ScoreMods => ({ handMul: m.handMul, globalMul: m.slotWinMul, lineBonus: m.lineBonus, deadLines, wildRanks: m.wildRanks, adjacency: m.adjacency, goldCells: m.goldCells });
