import { type Rng, weighted } from "./rng";

export type Sym = "cherry" | "lemon" | "bell" | "bar" | "seven" | "wild" | "coin";
export const SYMS: readonly Sym[] = ["cherry", "lemon", "bell", "bar", "seven", "wild", "coin"];

/** Pay for three of a kind, times the bet on that line. Coin is a scatter and pays no line. */
export const LINE_PAY: Record<"cherry" | "lemon" | "bell" | "bar" | "seven", number> = {
  cherry: 4,
  lemon: 6,
  bell: 10,
  bar: 20,
  seven: 60,
};
/** Cherry in the first two cells pays this even without a third. */
export const CHERRY_PAIR = 1;
/** Free coin drops for the pusher when this many scatters are on the grid. */
export const SCATTER_MIN = 3;

export const BASE_WEIGHTS: Record<Sym, number> = { cherry: 7, lemon: 6, bell: 4, bar: 3, seven: 2, wild: 2, coin: 2 };

/** Cell indices (row, col) of each payline; a bet unlocks them in this order. */
export const LINES: readonly (readonly [number, number][])[] = [
  [[1, 0], [1, 1], [1, 2]],
  [[0, 0], [0, 1], [0, 2]],
  [[2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 1], [2, 2]],
  [[2, 0], [1, 1], [0, 2]],
];
export const ROWS = 3;
export const COLS = 3;

export interface LineWin {
  line: number;
  sym: Sym;
  /** times the bet */
  pay: number;
  cells: readonly [number, number][];
}

export interface SlotResult {
  grid: Sym[][];
  wins: LineWin[];
  /** coins paid, before any run bonus */
  payout: number;
  /** free pusher drops from scatters */
  freeDrops: number;
}

export function spinGrid(rng: Rng, weights: Record<Sym, number>): Sym[][] {
  const w = SYMS.map((s) => weights[s]);
  const grid: Sym[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Sym[] = [];
    for (let c = 0; c < COLS; c++) row.push(SYMS[weighted(rng, w)] as Sym);
    grid.push(row);
  }
  return grid;
}

/** Pay of one line, in bets; wild stands in for any line symbol, never for coin. */
export function linePay(syms: readonly Sym[]): { sym: Sym; pay: number } | null {
  const first = syms.find((s) => s !== "wild");
  const base: Sym = first ?? "seven";
  if (base !== "coin" && syms.every((s) => s === base || s === "wild")) {
    return { sym: base, pay: LINE_PAY[base as keyof typeof LINE_PAY] };
  }
  const [a, b] = syms;
  if ((a === "cherry" || a === "wild") && (b === "cherry" || b === "wild")) return { sym: "cherry", pay: CHERRY_PAIR };
  return null;
}

export function evaluate(grid: Sym[][], lines: number, bet: number): SlotResult {
  const wins: LineWin[] = [];
  let payout = 0;
  for (let i = 0; i < Math.min(lines, LINES.length); i++) {
    const cells = LINES[i] as readonly [number, number][];
    const hit = linePay(cells.map(([r, c]) => (grid[r] as Sym[])[c] as Sym));
    if (hit) {
      wins.push({ line: i, sym: hit.sym, pay: hit.pay, cells });
      payout += hit.pay * bet;
    }
  }
  let coins = 0;
  for (const row of grid) for (const s of row) if (s === "coin") coins++;
  return { grid, wins, payout, freeDrops: coins >= SCATTER_MIN ? coins : 0 };
}

export function spin(rng: Rng, lines: number, bet: number, weights: Record<Sym, number> = BASE_WEIGHTS): SlotResult {
  return evaluate(spinGrid(rng, weights), lines, bet);
}
