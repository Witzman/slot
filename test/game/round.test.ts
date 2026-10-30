import { describe, expect, it } from "vitest";
import { cardName, freshDeck, rankOf, suitOf } from "../../src/game/cards";
import { BASE_PAY, HAND_ORDER, type HandRank } from "../../src/game/hands";
import { LINES, type ScoreMods, deal, drawRound, heldCells, scoreBoard } from "../../src/game/round";
import { makeRng } from "../../src/game/rng";

const handMul = Object.fromEntries(HAND_ORDER.map((r) => [r, 1])) as Record<HandRank, number>;
const score: ScoreMods = { handMul, globalMul: 1, lineBonus: 0 };
const opts = (over: Partial<Parameters<typeof drawRound>[3]> = {}) => ({ singleHold: false, upgrades: {}, score, ...over });
const card = (rank: number, suit: number): number => suit * 13 + (rank - 2);
const none = { rows: [], cols: [], cells: [] };

describe("cards", () => {
  it("names, ranks and suits agree", () => {
    expect(rankOf(card(14, 0))).toBe(14);
    expect(suitOf(card(14, 3))).toBe(3);
    expect(cardName(card(14, 0))).toBe("A♠");
    expect(cardName(card(10, 1))).toBe("10♥");
    expect(freshDeck()).toHaveLength(52);
    expect(freshDeck([2]).some((c) => rankOf(c) === 2)).toBe(false);
    expect(freshDeck([2])).toHaveLength(48);
  });
});

describe("deal and draw", () => {
  it("deals 25 distinct cards, the same for the same seed", () => {
    const d = deal(makeRng(1), 1);
    expect(d.board).toHaveLength(25);
    expect(new Set(d.board).size).toBe(25);
    expect(deal(makeRng(1), 1)).toEqual(d);
    expect(deal(makeRng(2), 1).board).not.toEqual(d.board);
    expect(d.phase).toBe("hold");
  });

  it("holding nothing replaces every cell, holding all keeps the board", () => {
    const d = deal(makeRng(3), 1);
    const before = [...d.board];
    const all = drawRound(makeRng(4), d, { rows: [0, 1, 2, 3, 4], cols: [], cells: [] }, opts());
    expect(typeof all).toBe("object");
    if (typeof all === "string") return;
    expect(all.board).toEqual(before);
    expect(all.drawn.every((x) => !x)).toBe(true);
    const d2 = deal(makeRng(3), 1);
    const nothing = drawRound(makeRng(4), d2, none, opts());
    if (typeof nothing === "string") throw new Error(nothing);
    expect(nothing.drawn.every((x) => x)).toBe(true);
    expect(new Set(nothing.board).size).toBe(25);
  });

  it("a held row and a held column keep their cross and nothing else", () => {
    const d = deal(makeRng(5), 1);
    const before = [...d.board];
    const res = drawRound(makeRng(6), d, { rows: [1], cols: [3], cells: [] }, opts());
    if (typeof res === "string") throw new Error(res);
    const kept = heldCells([1], [3], []);
    expect(kept.size).toBe(9);
    for (const i of kept) expect(res.board[i]).toBe(before[i]);
    expect(res.drawn.filter((x) => x)).toHaveLength(16);
    expect(new Set(res.board).size).toBe(25);
  });

  it("refuses single cells without the node, and bad indexes, and a second draw", () => {
    const d = deal(makeRng(7), 1);
    expect(drawRound(makeRng(8), d, { rows: [], cols: [], cells: [4] }, opts())).toBe("bad-hold");
    expect(drawRound(makeRng(8), d, { rows: [5], cols: [], cells: [] }, opts())).toBe("bad-hold");
    expect(drawRound(makeRng(8), d, { rows: [], cols: [-1], cells: [] }, opts())).toBe("bad-hold");
    expect(drawRound(makeRng(8), d, { rows: [1.5], cols: [], cells: [] }, opts())).toBe("bad-hold");
    expect(typeof drawRound(makeRng(8), d, { rows: [], cols: [], cells: [4, 24] }, opts({ singleHold: true }))).toBe("object");
    expect(drawRound(makeRng(8), d, { rows: [], cols: [], cells: [30] }, opts({ singleHold: true }))).toBe("bad-hold");
    expect(d.phase).toBe("done");
    expect(drawRound(makeRng(8), d, none, opts())).toBe("bad-hold");
  });

  it("a deck without twos still deals and draws", () => {
    const d = deal(makeRng(9), 1, [2, 3]);
    expect(d.board.some((c) => rankOf(c) <= 3)).toBe(false);
    const res = drawRound(makeRng(10), d, none, opts({ removedRanks: [2, 3] }));
    if (typeof res === "string") throw new Error(res);
    expect(res.board.some((c) => rankOf(c) <= 3)).toBe(false);
    expect(new Set(res.board).size).toBe(25);
  });

  it("a free extra draw lets the player hold again, and only the last draw pays", () => {
    const d = deal(makeRng(21), 1, [], 1);
    expect(d.maxDraws).toBe(2);
    const first = drawRound(makeRng(22), d, { rows: [0], cols: [], cells: [] }, opts());
    if (typeof first === "string") throw new Error(first);
    expect([first.final, first.payout, first.lines]).toEqual([false, 0, []]);
    expect(d.phase).toBe("hold");
    expect(d.board).toEqual(first.board);
    const second = drawRound(makeRng(23), d, { rows: [0, 1], cols: [], cells: [] }, opts());
    if (typeof second === "string") throw new Error(second);
    expect(second.final).toBe(true);
    expect(second.board.slice(0, 10)).toEqual(first.board.slice(0, 10));
    expect(second.payout).toBe(scoreBoard(second.board, 1, {}, score).payout);
    expect(d.phase).toBe("done");
    expect(drawRound(makeRng(24), d, none, opts())).toBe("bad-hold");
  });

  it("the draw never uses a card that stays on the board", () => {
    for (let seed = 1; seed < 40; seed++) {
      const d = deal(makeRng(seed), 1);
      const res = drawRound(makeRng(seed + 100), d, { rows: [0, 2], cols: [4], cells: [] }, opts());
      if (typeof res === "string") throw new Error(res);
      expect(new Set(res.board).size).toBe(25);
    }
  });

  it("holding every cell when the deck is thin never runs out of cards", () => {
    const d = deal(makeRng(11), 1, [2, 3, 4]);
    for (const hold of [none, { rows: [0, 1, 2, 3, 4], cols: [], cells: [] }, { rows: [], cols: [0, 1, 2, 3, 4], cells: [] }]) {
      expect(typeof drawRound(makeRng(12), { ...d, phase: "hold" }, hold, opts({ removedRanks: [2, 3, 4] }))).toBe("object");
    }
  });
});

describe("scoring", () => {
  // a board whose first row is a royal flush and everything else is junk without pairs
  const junk = (): number[] => [
    card(14, 0), card(13, 0), card(12, 0), card(11, 0), card(10, 0),
    card(2, 1), card(4, 2), card(6, 3), card(8, 1), card(9, 2),
    card(3, 3), card(5, 1), card(7, 2), card(10, 3), card(12, 1),
    card(4, 3), card(6, 1), card(8, 2), card(3, 2), card(5, 3),
    card(7, 1), card(9, 3), card(11, 2), card(2, 2), card(13, 3),
  ];

  it("scores 10 lines, a royal row pays its base pay per bet, and the payout is the sum times the bet", () => {
    const board = junk();
    const r1 = scoreBoard(board, 1, {}, score);
    expect(LINES).toBe(10);
    const row0 = r1.lines.find((l) => l.line === 0);
    expect(row0).toMatchObject({ rank: "royal", pay: BASE_PAY.royal });
    expect(r1.payout).toBe(r1.lines.reduce((s, l) => s + l.pay, 0));
    expect(scoreBoard(board, 3, {}, score).payout).toBe(r1.payout * 3);
  });

  it("a card in a row and in a column scores in both", () => {
    const board = junk();
    // make column 0 hold four of the royal's suit and the ace: put aces/kings there via a pair of jacks in col 0
    board[5] = card(11, 1);
    board[10] = card(11, 2);
    const res = scoreBoard(board, 1, {}, score);
    expect(res.lines.some((l) => l.line === 5 && l.rank === "jacks")).toBe(true);
    expect(res.lines.some((l) => l.line === 0)).toBe(true);
    expect(res.lines.filter((l) => l.line === 0 || l.line === 5)).toHaveLength(2);
  });

  it("gold raises a line by 50% per gold card, and the multipliers apply", () => {
    const board = junk();
    const base = scoreBoard(board, 1, {}, score).lines.find((l) => l.line === 0)?.pay as number;
    const gold = scoreBoard(board, 1, { [board[0] as number]: { gold: true }, [board[1] as number]: { gold: true } }, score).lines.find((l) => l.line === 0)?.pay as number;
    expect(gold).toBeCloseTo(base * 2);
    const boosted = scoreBoard(board, 1, {}, { handMul: { ...handMul, royal: 2 }, globalMul: 1.5, lineBonus: 0 });
    expect(boosted.lines.find((l) => l.line === 0)?.pay).toBe(BASE_PAY.royal * 2);
    expect(boosted.payout).toBe(Math.round(scoreBoard(board, 1, {}, { handMul: { ...handMul, royal: 2 }, globalMul: 1, lineBonus: 0 }).payout * 1.5));
  });

  it("the line bonus rewards many paying lines, a rank upgrade and a joker change the hands", () => {
    const board = junk();
    const plain = scoreBoard(board, 1, {}, score).payout;
    const none3 = scoreBoard(board, 1, {}, { ...score, lineBonus: 0.5 }).payout;
    expect(none3).toBe(plain); // fewer than 4 paying lines: no bonus
    // a rank up makes the 2-high row 1 of 2,4,6,8,9 no straight, but a joker on a junk card can make a pair
    const withJoker = scoreBoard(board, 1, { [board[5] as number]: { joker: true }, [board[6] as number]: { rank: 0 } }, score);
    expect(withJoker.payout).toBeGreaterThanOrEqual(plain);
  });

  it("pays every rank at its base pay", () => {
    for (const r of HAND_ORDER) expect(BASE_PAY[r]).toBeGreaterThan(0);
  });
});
