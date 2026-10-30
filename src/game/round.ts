import { type Card, freshDeck, rankOf, suitOf } from "./cards";
import { BASE_PAY, type HandCard, type HandRank, rankHand } from "./hands";
import { type Rng, shuffle } from "./rng";

export const SIZE = 5;
/** Five rows and five columns: each is a poker hand. */
export const LINES = 2 * SIZE;
const CELLS = SIZE * SIZE;

export interface CardUpgrade {
  /** levels added to the rank (it never passes the ace) */
  rank?: number;
  joker?: boolean;
  /** every hand this card is in pays 50% more */
  gold?: boolean;
  /** counts as any suit */
  anySuit?: boolean;
}

export interface ScoreMods {
  /** multiplies the pay of each hand rank */
  handMul: Record<HandRank, number>;
  /** multiplies the whole round */
  globalMul: number;
  /** each paying line beyond the third makes the round pay this much more */
  lineBonus: number;
  /** lines (0..9) that pay nothing this round */
  deadLines?: readonly number[];
}

export interface LineScore {
  /** 0..4 rows from the top, 5..9 columns from the left */
  line: number;
  rank: HandRank;
  pay: number;
}

export interface Deal {
  board: Card[];
  bet: number;
  phase: "hold" | "done";
  /** draws made so far, and how many there are (1, plus the tree's free draws): only the last one pays */
  draws: number;
  maxDraws: number;
}

export interface RoundResult {
  /** false after a draw that is not the last: nothing pays yet */
  final: boolean;
  board: Card[];
  lines: LineScore[];
  payout: number;
  /** which cells were replaced by the draw */
  drawn: boolean[];
}

export interface Hold {
  rows: readonly number[];
  cols: readonly number[];
  cells: readonly number[];
}

export interface DrawOptions {
  removedRanks?: readonly number[];
  /** the tree's node: single cards may be held */
  singleHold: boolean;
  upgrades: Readonly<Record<number, CardUpgrade>>;
  score: ScoreMods;
}

/** Shuffle the deck and put 25 of its cards on the board. `extraDraws` are the tree's free draws after the first. */
export function deal(rng: Rng, bet: number, removedRanks: readonly number[] = [], extraDraws = 0): Deal {
  return { board: shuffle(rng, freshDeck(removedRanks)).slice(0, CELLS), bet, phase: "hold", draws: 0, maxDraws: 1 + Math.max(0, Math.floor(extraDraws)) };
}

/** How much of the hold limit a hold uses: a line is one, every five single cards are one more. */
export const holdSlots = (h: Hold): number => h.rows.length + h.cols.length + Math.ceil(h.cells.length / SIZE);

/** The cells that stay: held rows, held columns and held single cells. */
export function heldCells(rows: readonly number[], cols: readonly number[], cells: readonly number[]): Set<number> {
  const kept = new Set<number>(cells);
  for (const r of rows) for (let c = 0; c < SIZE; c++) kept.add(r * SIZE + c);
  for (const c of cols) for (let r = 0; r < SIZE; r++) kept.add(r * SIZE + c);
  return kept;
}

const inRange = (xs: readonly number[], n: number): boolean => xs.every((x) => Number.isInteger(x) && x >= 0 && x < n);

/** The five cells of a line, in order. */
export const lineCells = (line: number): number[] => Array.from({ length: SIZE }, (_, i) => (line < SIZE ? line * SIZE + i : i * SIZE + (line - SIZE)));

export function scoreBoard(board: readonly Card[], bet: number, upgrades: Readonly<Record<number, CardUpgrade>>, score: ScoreMods): { lines: LineScore[]; payout: number } {
  const lines: LineScore[] = [];
  let sum = 0;
  for (let line = 0; line < LINES; line++) {
    if (score.deadLines?.includes(line)) continue;
    const cards = lineCells(line).map((i) => board[i] as Card);
    const hand: HandCard[] = cards.map((c) => {
      const u = upgrades[c];
      return { rank: Math.min(14, rankOf(c) + (u?.rank ?? 0)), suit: suitOf(c), joker: u?.joker, anySuit: u?.anySuit };
    });
    const rank = rankHand(hand);
    if (rank === null) continue;
    const gold = cards.filter((c) => upgrades[c]?.gold).length;
    const pay = BASE_PAY[rank] * bet * score.handMul[rank] * (1 + 0.5 * gold);
    lines.push({ line, rank, pay });
    sum += pay;
  }
  const bonus = 1 + score.lineBonus * Math.max(0, lines.length - 3);
  return { lines, payout: Math.round(sum * score.globalMul * bonus) };
}

/**
 * The draw: held cards stay, every other cell gets a card from the deck minus the cards that stay (replaced cards go back into it).
 * Only the last draw pays (a free extra draw lets the player hold again first). Refused ("bad-hold") for an index out of range, single cells without the node, or a hand that is already drawn.
 */
export function drawRound(rng: Rng, d: Deal, hold: Hold, o: DrawOptions): RoundResult | "bad-hold" {
  if (d.phase !== "hold" || !inRange(hold.rows, SIZE) || !inRange(hold.cols, SIZE) || !inRange(hold.cells, CELLS)) return "bad-hold";
  if (hold.cells.length > 0 && !o.singleHold) return "bad-hold";
  const kept = heldCells(hold.rows, hold.cols, hold.cells);
  const staying = new Set<Card>([...kept].map((i) => d.board[i] as Card));
  const pool = shuffle(rng, freshDeck(o.removedRanks).filter((c) => !staying.has(c)));
  const board = [...d.board];
  const drawn = Array<boolean>(CELLS).fill(false);
  let next = 0;
  for (let i = 0; i < CELLS; i++) {
    if (kept.has(i)) continue;
    board[i] = pool[next++] as Card;
    drawn[i] = true;
  }
  d.board = board;
  d.draws++;
  const final = d.draws >= d.maxDraws;
  if (!final) return { final, board, lines: [], payout: 0, drawn };
  d.phase = "done";
  const scored = scoreBoard(board, d.bet, o.upgrades, o.score);
  return { final, board, lines: scored.lines, payout: scored.payout, drawn };
}
