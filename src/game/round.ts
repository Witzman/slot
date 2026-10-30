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
  /** every line it is in pays 1.6 times; after a round it may shatter and is plain again */
  glass?: boolean;
  /** a blank: never part of a hand, but every line it is in pays a flat sum, paying hand or not */
  stone?: boolean;
  /** one edition: foil (flat sum per paying line), holo (+100% per paying line), poly (x1.5 per paying line), negative (one more joker may be in the deck) */
  edition?: Edition;
  /** one seal: coin (pays when held), red (the card's bonuses count twice) */
  seal?: Seal;
}

export type Edition = "foil" | "holo" | "poly" | "negative";
export type Seal = "coin" | "red";

/** What the card effects pay, in bets. */
export const FOIL_PAY = 3;
export const STONE_PAY = 2;
export const GLASS_MUL = 1.6;
export const POLY_MUL = 1.5;
export const COIN_SEAL_PAY = 4;

export interface ScoreMods {
  /** multiplies the pay of each hand rank */
  handMul: Record<HandRank, number>;
  /** multiplies the whole round */
  globalMul: number;
  /** each paying line beyond the third makes the round pay this much more */
  lineBonus: number;
  /** lines (0..9) that pay nothing this round */
  deadLines?: readonly number[];
  /** cards of these ranks (by face) count as jokers */
  wildRanks?: readonly number[];
  /** bets paid for each pair of neighbouring cards of one rank */
  adjacency?: number;
  /** cells whose card counts as gold */
  goldCells?: readonly number[];
  /** held mystery cells: each one makes every paying line it is in pay x1.5 */
  mysteryCells?: readonly number[];
}

/** What a held mystery card does to each paying line it sits in. */
export const MYSTERY_MUL = 1.5;

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
  /** cells dealt face down (the mystery cards): they stay unseen until the first draw; a held one pays its lines x1.5 */
  mystery?: number[];
  /** the mystery cards are still face down */
  hidden?: boolean;
  /** nudges left: shift a row or column one cell before the first draw */
  nudges?: number;
}

export interface RoundResult {
  /** false after a draw that is not the last: nothing pays yet */
  final: boolean;
  board: Card[];
  lines: LineScore[];
  payout: number;
  /** which cells were replaced by the draw */
  drawn: boolean[];
  /** coins the coin seals of the held cards paid (already in the payout) */
  sealCoins: number;
  /** pairs of neighbouring cards of one rank (they pay when the mods give a sum for them) */
  adjacent: number;
  /** glass cards that shattered after the round (set by the run or the session) */
  shattered?: number[];
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
export function deal(rng: Rng, bet: number, removedRanks: readonly number[] = [], extraDraws = 0, mystery = 0, nudges = 0): Deal {
  const board = shuffle(rng, freshDeck(removedRanks)).slice(0, CELLS);
  const hiddenCells = mystery > 0 ? shuffle(rng, Array.from({ length: CELLS }, (_, i) => i)).slice(0, Math.min(CELLS, Math.floor(mystery))).sort((a, b) => a - b) : [];
  return { board, bet, phase: "hold", draws: 0, maxDraws: 1 + Math.max(0, Math.floor(extraDraws)), mystery: hiddenCells, hidden: hiddenCells.length > 0, nudges: Math.max(0, Math.floor(nudges)) };
}

/** Shift a row one cell to the right, or a column one cell down (the card that falls off comes round the other side), before the first draw. Costs one nudge. Mystery cards move with their cards. */
export function nudge(d: Deal, axis: "row" | "col", index: number): boolean {
  if (d.phase !== "hold" || d.draws > 0 || (d.nudges ?? 0) <= 0 || !Number.isInteger(index) || index < 0 || index >= SIZE) return false;
  const cells = axis === "row" ? Array.from({ length: SIZE }, (_, c) => index * SIZE + c) : Array.from({ length: SIZE }, (_, r) => r * SIZE + index);
  const to = (i: number): number => cells[((cells.indexOf(i) + 1) % SIZE) as number] as number;
  const cards = cells.map((i) => d.board[i] as Card);
  cells.forEach((i, k) => void (d.board[to(i)] = cards[k] as Card));
  d.mystery = (d.mystery ?? []).map((i) => (cells.includes(i) ? to(i) : i)).sort((a, b) => a - b);
  d.nudges = (d.nudges ?? 0) - 1;
  return true;
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

/** Pairs of cards of one rank that sit next to each other across or down. Jokers, wild ranks and stones match nothing. */
export function neighbours(board: readonly Card[], upgrades: Readonly<Record<number, CardUpgrade>>, wild: readonly number[] = []): number {
  const face = (i: number): number | null => {
    const c = board[i] as Card;
    const u = upgrades[c];
    return u?.joker || u?.stone || wild.includes(rankOf(c)) ? null : Math.min(14, rankOf(c) + (u?.rank ?? 0));
  };
  let n = 0;
  for (let i = 0; i < CELLS; i++) {
    const r = face(i);
    if (r === null) continue;
    if ((i + 1) % SIZE !== 0 && face(i + 1) === r) n++;
    if (i + SIZE < CELLS && face(i + SIZE) === r) n++;
  }
  return n;
}

export function scoreBoard(board: readonly Card[], bet: number, upgrades: Readonly<Record<number, CardUpgrade>>, score: ScoreMods): { lines: LineScore[]; payout: number; adjacent: number } {
  const lines: LineScore[] = [];
  let sum = 0;
  for (let line = 0; line < LINES; line++) {
    if (score.deadLines?.includes(line)) continue;
    const cells = lineCells(line);
    const cards = cells.map((c) => board[c] as Card);
    // a stone is a blank: a rank and a suit no other card has, so it never joins a hand
    const hand: HandCard[] = cards.map((c, i) => {
      const u = upgrades[c];
      if (u?.stone) return { rank: -100 - 10 * i, suit: -1 - i };
      return { rank: Math.min(14, rankOf(c) + (u?.rank ?? 0)), suit: suitOf(c), joker: u?.joker || score.wildRanks?.includes(rankOf(c)) || undefined, anySuit: u?.anySuit };
    });
    const stones = cards.filter((c) => upgrades[c]?.stone).length;
    sum += STONE_PAY * bet * stones;
    const rank = rankHand(hand);
    if (rank === null) continue;
    // a red seal makes the bonuses of its card count twice
    const weight = (c: Card): number => (upgrades[c]?.seal === "red" ? 2 : 1);
    const count = (test: (u: CardUpgrade) => boolean): number => cards.reduce((n, c) => n + (upgrades[c] && test(upgrades[c] as CardUpgrade) ? weight(c) : 0), 0);
    const goldCards = cells.reduce((n, i) => n + (score.goldCells?.includes(i) && !upgrades[board[i] as Card]?.gold ? weight(board[i] as Card) : 0), 0);
    const gold = count((u) => u.gold === true) + goldCards;
    const holo = count((u) => u.edition === "holo");
    const foil = count((u) => u.edition === "foil");
    const poly = count((u) => u.edition === "poly");
    const glass = cards.filter((c) => upgrades[c]?.glass).length;
    const mystery = cells.filter((i) => score.mysteryCells?.includes(i)).length;
    const pay = Math.pow(MYSTERY_MUL, mystery) * (BASE_PAY[rank] * bet * score.handMul[rank] * (1 + 0.5 * gold + 1.0 * holo) + FOIL_PAY * bet * foil) * Math.pow(POLY_MUL, poly) * Math.pow(GLASS_MUL, glass);
    lines.push({ line, rank, pay });
    sum += pay;
  }
  const adjacent = neighbours(board, upgrades, score.wildRanks ?? []);
  sum += (score.adjacency ?? 0) * bet * adjacent;
  const bonus = 1 + score.lineBonus * Math.max(0, lines.length - 3);
  return { lines, payout: Math.round(sum * score.globalMul * bonus), adjacent };
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
  d.hidden = false;
  d.mystery = (d.mystery ?? []).filter((i) => kept.has(i)); // a replaced mystery cell is an ordinary card now
  const final = d.draws >= d.maxDraws;
  if (!final) return { final, board, lines: [], payout: 0, drawn, sealCoins: 0, adjacent: 0 };
  d.phase = "done";
  const scored = scoreBoard(board, d.bet, o.upgrades, { ...o.score, mysteryCells: d.mystery ?? [] });
  const sealCoins = [...kept].filter((i) => o.upgrades[board[i] as Card]?.seal === "coin").length * COIN_SEAL_PAY * d.bet;
  return { final, board, lines: scored.lines, payout: scored.payout + sealCoins, drawn, sealCoins, adjacent: scored.adjacent };
}
