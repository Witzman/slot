export type Sym = "cherry" | "lemon" | "plum" | "grape" | "bell" | "bar" | "seven" | "wild" | "coin";
export const SYMS: readonly Sym[] = ["cherry", "lemon", "plum", "grape", "bell", "bar", "seven", "wild", "coin"];

/** The symbols that form clusters. Wild joins any of them; coin is a scatter and never pays a cluster. */
export type PaySym = "cherry" | "lemon" | "plum" | "grape" | "bell" | "bar" | "seven";
export const PAY_SYMS: readonly PaySym[] = ["cherry", "lemon", "plum", "grape", "bell", "bar", "seven"];

/** Three or more coin scatters on the start board give free spins. */
export const SCATTER_MIN = 3;

/** Relative weight of each symbol when a cell is filled. Starting values; the balance pass retunes them. */
export const BASE_WEIGHTS: Record<Sym, number> = { cherry: 4, lemon: 4, plum: 4, grape: 4, bell: 4, bar: 3, seven: 2, wild: 0, coin: 1 };
