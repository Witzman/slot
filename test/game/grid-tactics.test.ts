import { describe, expect, it } from "vitest";
import { CHARMS } from "../../src/game/content";
import { autoHold, startSession, dealSession, endlessMods } from "../../src/game/endless";
import { buyTech, modsFor, newMeta } from "../../src/game/meta";
import { baseMods, scoreMods } from "../../src/game/mods";
import { makeRng } from "../../src/game/rng";
import { dealRound, restoreHand, startRun } from "../../src/game/run";
import { type Deal, MYSTERY_MUL, deal, drawRound, nudge, scoreBoard } from "../../src/game/round";

// The board 0..24: rows 0, 1, 3 and 4 are straight flushes (80 a bet), row 2 and every column pay nothing.
const board = Array.from({ length: 25 }, (_, i) => i);
const m0 = baseMods();
const mk = (over: Partial<Deal> = {}): Deal => ({ board: [...board], bet: 1, phase: "hold", draws: 0, maxDraws: 1, ...over });
const opts = (o: Record<string, unknown> = {}) => ({ singleHold: true, upgrades: {}, score: scoreMods(m0), ...o });
const row0pay = (res: ReturnType<typeof drawRound>): number => (typeof res === "string" ? -1 : (res.lines.find((l) => l.line === 0)?.pay ?? 0));

describe("mystery cards", () => {
  it("deals the asked number of cells face down, and none by default", () => {
    expect(deal(makeRng(1), 1).mystery).toEqual([]);
    expect(deal(makeRng(1), 1).hidden).toBe(false);
    const d = deal(makeRng(1), 1, [], 0, 3);
    expect(d.mystery).toHaveLength(3);
    expect(new Set(d.mystery).size).toBe(3);
    expect(d.hidden).toBe(true);
    for (const i of d.mystery as number[]) expect(i).toBeGreaterThanOrEqual(0), expect(i).toBeLessThan(25);
  });

  it("changes nothing about the cards dealt", () => {
    expect(deal(makeRng(5), 1, [], 0, 2).board).toEqual(deal(makeRng(5), 1, [], 0, 0).board);
  });

  it("makes every paying line of a held mystery card pay x1.5", () => {
    const res = drawRound(makeRng(1), mk({ mystery: [0], hidden: true }), { rows: [0], cols: [], cells: [] }, opts());
    expect(row0pay(res)).toBe(80 * MYSTERY_MUL);
    expect(row0pay(drawRound(makeRng(1), mk(), { rows: [0], cols: [], cells: [] }, opts()))).toBe(80);
  });

  it("is an ordinary card once drawn away, and face up after the first draw", () => {
    const d = mk({ mystery: [0, 12], hidden: true });
    drawRound(makeRng(2), d, { rows: [0], cols: [], cells: [] }, opts());
    expect(d.hidden).toBe(false);
    expect(d.mystery).toEqual([0]);
  });

  it("keeps a mystery card that is held through a free draw, and pays it at the last", () => {
    const d = mk({ mystery: [0], hidden: true, maxDraws: 2 });
    const first = drawRound(makeRng(3), d, { rows: [0], cols: [], cells: [] }, opts());
    expect(typeof first !== "string" && first.final).toBe(false);
    expect(d.mystery).toEqual([0]);
    expect(row0pay(drawRound(makeRng(4), d, { rows: [0], cols: [], cells: [] }, opts()))).toBe(80 * MYSTERY_MUL);
  });

  it("comes with a deal from the mods, in a run and in a session", () => {
    const meta = newMeta();
    meta.climb.chips = 500;
    for (const id of ["hold3", "mystery1", "mystery2"]) expect(buyTech(meta, "climb", id), id).toBe(true);
    const m = modsFor(meta, "climb", []);
    expect(m.mystery).toBe(2);
    const run = startRun(1, m);
    const d = dealRound(run, m, 1);
    expect(typeof d === "string" ? [] : d.mystery).toHaveLength(2);
    meta.endless.chips = 500;
    for (const id of ["hold3", "mystery1"]) buyTech(meta, "endless", id);
    const s = startSession(1, modsFor(meta, "endless", []), 0);
    dealSession(s, endlessMods(meta, s), 1);
    expect(s.hand?.mystery).toHaveLength(1);
  });

  it("is read back from a save, only what is valid", () => {
    const h = restoreHand({ ...mk({ mystery: [3, 3, 99, -1, 7], hidden: true, nudges: 2 }) });
    expect(h?.mystery).toEqual([3, 7]);
    expect(h?.hidden).toBe(true);
    expect(h?.nudges).toBe(2);
    expect(restoreHand(mk({ mystery: [3], hidden: true, draws: 1 }))?.hidden).toBe(false);
    expect(restoreHand(mk())).toMatchObject({ mystery: [], hidden: false, nudges: 0 });
  });

  it("is not seen by automatic play: it holds a line without a face-down card", () => {
    const m = { ...baseMods(), holdMax: 2 };
    expect(autoHold(board, m, {})).toMatchObject({ rows: [expect.any(Number)] });
    const hold = autoHold(board, m, {}, [0, 1, 2]);
    expect(hold.rows).not.toContain(0);
    expect(hold.rows[0] === 1 || hold.rows[0] === 3 || hold.rows[0] === 4).toBe(true);
  });
});

describe("nudge", () => {
  it("shifts a row one cell right and a column one cell down, round the edge", () => {
    const d = mk({ nudges: 2 });
    expect(nudge(d, "row", 0)).toBe(true);
    expect(d.board.slice(0, 5)).toEqual([4, 0, 1, 2, 3]);
    expect(nudge(d, "col", 4)).toBe(true);
    expect([d.board[4], d.board[9], d.board[14], d.board[19], d.board[24]]).toEqual([24, 3, 9, 14, 19]);
    expect(d.nudges).toBe(0);
  });

  it("moves the face-down cards with their cards", () => {
    const d = mk({ nudges: 1, mystery: [4, 12], hidden: true });
    nudge(d, "row", 0);
    expect(d.mystery).toEqual([0, 12]);
  });

  it("is refused without a nudge, after a draw, outside the hold, or for a line that is not there", () => {
    expect(nudge(mk(), "row", 0)).toBe(false);
    expect(nudge(mk({ nudges: 1, draws: 1 }), "row", 0)).toBe(false);
    expect(nudge(mk({ nudges: 1, phase: "done" }), "row", 0)).toBe(false);
    expect(nudge(mk({ nudges: 1 }), "row", 5)).toBe(false);
    expect(nudge(mk({ nudges: 1 }), "col", -1)).toBe(false);
    expect(nudge(mk({ nudges: 1 }), "row", 1.5)).toBe(false);
  });

  it("changes what a line pays: a shift can make a hand and break one", () => {
    const d = mk({ nudges: 1 });
    const before = scoreBoard(d.board, 1, {}, scoreMods(m0)).payout;
    nudge(d, "col", 0); // column 0 moves down: rows 1, 3, 4 are broken at their first cell
    expect(scoreBoard(d.board, 1, {}, scoreMods(m0)).payout).not.toBe(before);
  });

  it("comes from the tree, one nudge for each node", () => {
    const meta = newMeta();
    meta.climb.chips = 500;
    for (const id of ["hold3", "nudge1", "nudge2"]) expect(buyTech(meta, "climb", id), id).toBe(true);
    expect(modsFor(meta, "climb", []).nudges).toBe(2);
    const run = startRun(1, modsFor(meta, "climb", []));
    const d = dealRound(run, modsFor(meta, "climb", []), 1);
    expect(typeof d === "string" ? 0 : d.nudges).toBe(2);
  });
});

describe("cells that count as gold", () => {
  it("pays the lines of a gold cell 50% more, and does not double a card that is gold already", () => {
    const plain = scoreBoard(board, 1, {}, scoreMods(m0)).lines.find((l) => l.line === 0)?.pay;
    const gold = { ...scoreMods(m0), goldCells: [0] };
    expect(scoreBoard(board, 1, {}, gold).lines.find((l) => l.line === 0)?.pay).toBe((plain as number) * 1.5);
    expect(scoreBoard(board, 1, { 0: { gold: true } }, gold).lines.find((l) => l.line === 0)?.pay).toBe((plain as number) * 1.5);
  });

  it("has charms for the corners and for the centre", () => {
    const corners = CHARMS.find((c) => c.id === "corners");
    const centre = CHARMS.find((c) => c.id === "centre");
    expect(modsFor(newMeta(), "climb", ["corners"]).goldCells).toEqual([0, 4, 20, 24]);
    expect(modsFor(newMeta(), "climb", ["centre"]).goldCells).toEqual([12]);
    expect([corners?.rarity, centre?.rarity]).toEqual(["uncommon", "common"]);
  });
});
