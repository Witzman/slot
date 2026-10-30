import { EVENT_CHANCE } from "./events";
import { BASE_WEIGHTS, SYMS, type Sym } from "./slot";

/** Everything the tech tree and the charms of a run can change. Built fresh from the base by `applyAll`. */
export interface Mods {
  startCoins: number;
  turns: number;
  /** board size: rows and columns, each unlocked on its own */
  rows: number;
  cols: number;
  /** the chain multiplier grows by this much per cascade step, up to chainCap */
  chainStep: number;
  chainCap: number;
  /** the chain multiplier of the first cascade step */
  chainStart: number;
  /** Endless mode: automatic spins per second (0: none) */
  autoRate: number;
  slotMaxBet: number;
  slotWinMul: number;
  weights: Record<Sym, number>;
  /** multiplies the line pay of a symbol */
  symPay: Record<Sym, number>;
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
    startCoins: 50,
    turns: 24,
    rows: 3,
    cols: 3,
    chainStep: 0.25,
    chainCap: 5,
    chainStart: 1,
    autoRate: 0,
    slotMaxBet: 3,
    slotWinMul: 1,
    weights: { ...BASE_WEIGHTS },
    symPay: Object.fromEntries(SYMS.map((s) => [s, 1])) as Record<Sym, number>,
    quotaMul: 1,
    interest: 0,
    rerolls: 0,
    startTickets: 0,
    eventChance: EVENT_CHANCE,
  };
}

export type Effect = (m: Mods) => void;
