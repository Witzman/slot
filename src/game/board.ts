import { type Rng, weighted } from "./rng";
import { PAY_SYMS, type PaySym, SCATTER_MIN, SYMS, type Sym } from "./slot";

export interface BoardSize {
  rows: number;
  cols: number;
}

export interface Cluster {
  sym: PaySym;
  cells: readonly [number, number][];
}

export interface CascadeStep {
  clusters: Cluster[];
  /** coins paid by this step, times the bet, the symbol pay and the chain multiplier (not yet the global multiplier) */
  pay: number;
  /** chain multiplier of this step */
  multiplier: number;
  /** the board after the cleared cells were removed and the columns refilled */
  grid: Sym[][];
}

export interface SpinResult {
  start: Sym[][];
  steps: CascadeStep[];
  /** coins paid in total, whole, after the global multiplier */
  payout: number;
  freeSpins: number;
}

export interface SpinParams {
  weights: Record<Sym, number>;
  /** multiplies the pay of a symbol */
  symPay: Record<Sym, number>;
  /** the chain multiplier of step k (from 0) is chainStart + chainStep * k ... */
  chainStart: number;
  chainStep: number;
  /** ... but never more than this */
  chainCap: number;
  /** multiplies the whole spin */
  globalMul: number;
}

/** A cascade ends after this many steps even when the board still pays (runaway guard). */
export const MAX_CASCADE = 12;
/** Pay of a cluster of three, times the bet; a cluster of n pays (n - 2) times that. Starting values for the balance pass. */
export const CLUSTER_PAY: Record<PaySym, number> = { cherry: 1, lemon: 1, plum: 1, grape: 2, bell: 2, bar: 3, seven: 8, diamond: 20 };
/** A bigger board has more clusters: its pay is scaled by (9 / cells) to this power, so growth is power but not a flood of coins. */
export const AREA_EXP = 0.5;

/** Pay of one cluster of `size` cells, times the bet (before chain, symbol and board factors). */
export const clusterPay = (sym: PaySym, size: number): number => CLUSTER_PAY[sym] * (size - 2);

/** Free spins one scatter win gives at most, and none of them can win more (balance run #10: with the tree's coin nodes on a 6x6 board free spins chained for ever). */
export const MAX_FREE_SPINS = 10;
export const SCATTER_FREE_SPINS = (coins: number): number => (coins >= SCATTER_MIN ? Math.min(MAX_FREE_SPINS, coins - SCATTER_MIN + 1) : 0);

const NEAR: readonly (readonly [number, number])[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** Connected groups of cells that are `sym` or wild, flood-filled from every `sym` cell. */
function groupsOf(grid: Sym[][], sym: Sym, seen: Set<string>, joins: (s: Sym) => boolean): [number, number][][] {
  const out: [number, number][][] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < (grid[r] as Sym[]).length; c++) {
      if ((grid[r] as Sym[])[c] !== sym || seen.has(`${r},${c}`)) continue;
      const cells: [number, number][] = [];
      const queue: [number, number][] = [[r, c]];
      const mine = new Set<string>([`${r},${c}`]);
      while (queue.length > 0) {
        const [cr, cc] = queue.pop() as [number, number];
        cells.push([cr, cc]);
        for (const [dr, dc] of NEAR) {
          const nr = cr + dr;
          const nc = cc + dc;
          const row = grid[nr];
          const key = `${nr},${nc}`;
          if (!row || mine.has(key) || !joins(row[nc] as Sym)) continue;
          mine.add(key);
          queue.push([nr, nc]);
        }
      }
      for (const [cr, cc] of cells) if ((grid[cr] as Sym[])[cc] === sym) seen.add(`${cr},${cc}`);
      out.push(cells);
    }
  }
  return out;
}

/**
 * Every group of 3 or more orthogonally connected equal symbols. Wild joins any group (and may be in several groups of the same step).
 * A group of wilds with no symbol next to it pays as sevens. Coins never form a cluster.
 */
export function findClusters(grid: Sym[][]): Cluster[] {
  const found: Cluster[] = [];
  for (const sym of PAY_SYMS) {
    for (const cells of groupsOf(grid, sym, new Set(), (s) => s === sym || s === "wild")) if (cells.length >= 3) found.push({ sym, cells });
  }
  const covered = new Set(found.flatMap((cl) => cl.cells.map(([r, c]) => `${r},${c}`)));
  for (const cells of groupsOf(grid, "wild", new Set(covered), (s) => s === "wild")) {
    if (cells.length >= 3 && cells.every(([r, c]) => !covered.has(`${r},${c}`))) found.push({ sym: "seven", cells });
  }
  return found;
}

const fill = (rng: Rng, w: number[]): Sym => SYMS[weighted(rng, w)] as Sym;

/** One spin: fill the board, then clear clusters and refill until nothing pays (at most MAX_CASCADE steps). */
export function spinBoard(rng: Rng, size: BoardSize, bet: number, p: SpinParams): SpinResult {
  const w = SYMS.map((s) => p.weights[s]);
  const start: Sym[][] = [];
  for (let r = 0; r < size.rows; r++) {
    const row: Sym[] = [];
    for (let c = 0; c < size.cols; c++) row.push(fill(rng, w));
    start.push(row);
  }
  let coins = 0;
  for (const row of start) for (const s of row) if (s === "coin") coins++;

  let grid = start.map((row) => [...row]);
  const steps: CascadeStep[] = [];
  let total = 0;
  const area = Math.pow(9 / (size.rows * size.cols), AREA_EXP);
  while (steps.length < MAX_CASCADE) {
    const clusters = findClusters(grid);
    if (clusters.length === 0) break;
    const multiplier = Math.min(p.chainCap, p.chainStart + p.chainStep * steps.length);
    let pay = 0;
    for (const cl of clusters) pay += clusterPay(cl.sym, cl.cells.length) * bet * p.symPay[cl.sym] * multiplier * area;
    const gone = new Set(clusters.flatMap((cl) => cl.cells.map(([r, c]) => `${r},${c}`)));
    const next: Sym[][] = grid.map((row) => [...row]);
    for (let c = 0; c < size.cols; c++) {
      const kept: Sym[] = [];
      for (let r = size.rows - 1; r >= 0; r--) if (!gone.has(`${r},${c}`)) kept.push((grid[r] as Sym[])[c] as Sym);
      const fresh = size.rows - kept.length;
      for (let r = 0; r < fresh; r++) (next[r] as Sym[])[c] = fill(rng, w);
      for (let i = 0; i < kept.length; i++) (next[size.rows - 1 - i] as Sym[])[c] = kept[i] as Sym;
    }
    grid = next;
    steps.push({ clusters, pay, multiplier, grid: grid.map((row) => [...row]) });
    total += pay;
  }
  return { start, steps, payout: Math.round(total * p.globalMul), freeSpins: SCATTER_FREE_SPINS(coins) };
}
