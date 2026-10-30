import { describe, expect, it } from "vitest";
import { HAND_LEVEL_MAX, UPGRADES, levelBonus } from "../../src/game/content";
import { HAND_ORDER } from "../../src/game/hands";
import { buyTech, modsFor, newMeta } from "../../src/game/meta";
import { baseMods, scoreMods } from "../../src/game/mods";
import { type Run, beginRound, buyUpgrade, closeRound, restoreRun, startRun, takeLoan, quotaFor, LOAN_RATE } from "../../src/game/run";
import { type Card, rankOf } from "../../src/game/cards";
import { scoreBoard } from "../../src/game/round";
import { SETUPS, setupUnlocked } from "../../src/game/setups";

const meta = newMeta();
const m0 = baseMods();

/** A board from the cards given, filled up with other cards that make no line worth reading in line 0. */
const boardOf = (first: Card[]): Card[] => [...first, ...Array.from({ length: 52 }, (_, i) => i).filter((c) => !first.includes(c)).slice(0, 25 - first.length)];

describe("hand levels", () => {
  const level = (rank: string) => UPGRADES.find((u) => u.id === `lv_${rank}`);

  it("has one upgrade for each hand rank, dearer for the rarer hands", () => {
    for (const r of HAND_ORDER) expect(level(r), r).toBeDefined();
    const price = (r: string) => (level(r) as { base: number }).base;
    expect(price("jacks")).toBeLessThan(price("flush"));
    expect(price("flush")).toBeLessThan(price("royal"));
    expect(level("flush")?.max).toBe(HAND_LEVEL_MAX);
  });

  it("adds less with every level and never reaches double pay", () => {
    let prev = 0;
    let gain = Infinity;
    for (let l = 1; l <= HAND_LEVEL_MAX; l++) {
      const g = levelBonus(l) - prev;
      expect(g, `level ${l}`).toBeGreaterThan(0);
      expect(g, `level ${l}`).toBeLessThan(gain);
      gain = g;
      prev = levelBonus(l);
    }
    expect(levelBonus(HAND_LEVEL_MAX)).toBeLessThan(1.5);
    expect(levelBonus(0)).toBe(0);
  });

  it("raises the pay of that hand only, by the bonus of its level", () => {
    const plain = modsFor(meta, "climb", []);
    const m = modsFor(meta, "climb", [], { lv_flush: 3 });
    expect(m.handMul.flush).toBeCloseTo(plain.handMul.flush * (1 + levelBonus(3)));
    expect(m.handMul.straight).toBe(plain.handMul.straight);
  });

  it("is bought with coins in a run like any upgrade, level by level", () => {
    const run = startRun(1, m0);
    const before = run.coins;
    expect(buyUpgrade(run, "lv_flush")).toBe(true);
    expect(run.upgrades.lv_flush).toBe(1);
    expect(run.coins).toBeLessThan(before);
    run.coins = 100000;
    for (let i = 1; i < HAND_LEVEL_MAX; i++) expect(buyUpgrade(run, "lv_flush")).toBe(true);
    expect(buyUpgrade(run, "lv_flush")).toBe(false);
    expect(restoreRun(JSON.parse(JSON.stringify(run)))?.upgrades.lv_flush).toBe(HAND_LEVEL_MAX);
  });
});

describe("deuces wild", () => {
  const row = (wild: number[]) => {
    // 2 of spades (wild), three sevens and a king: three of a kind plain, four of a kind with the wild two
    const board = boardOf([0, 18, 31, 44, 11]);
    return scoreBoard(board, 1, {}, { ...scoreMods(m0), wildRanks: wild }).lines.find((l) => l.line === 0)?.rank;
  };

  it("counts the wild ranks as jokers", () => {
    expect(rankOf(0)).toBe(2);
    expect(row([])).toBe("three");
    expect(row([2])).toBe("four");
  });

  it("is a deck with a pay table of its own: pairs pay nothing, a way to open it", () => {
    const wild = SETUPS.find((s) => s.id === "wild");
    expect(wild?.kind).toBe("deck");
    const m = modsFor(meta, "climb", [], {}, null, 0, "wild");
    expect(m.wildRanks).toEqual([2]);
    expect([m.handMul.jacks, m.handMul.twoPair]).toEqual([0, 0]);
    expect(setupUnlocked(newMeta(), "wild")).toBe(false);
    expect(modsFor(meta, "climb", []).wildRanks).toEqual([]);
  });
});

describe("neighbours", () => {
  const pairs = (cells: Record<number, Card>, adjacency = 0.5, bet = 1) => {
    const first: Card[] = Array.from({ length: 25 }, () => -1);
    const used = new Set<Card>(Object.values(cells));
    const rest = Array.from({ length: 52 }, (_, i) => i).filter((c) => !used.has(c) && rankOf(c) > 4);
    let k = 0;
    for (let i = 0; i < 25; i++) first[i] = cells[i] ?? (rest[k++] as Card);
    return scoreBoard(first, bet, {}, { ...scoreMods(m0), adjacency });
  };

  it("pays for each pair of neighbours of one rank, across and down, not diagonal", () => {
    expect(pairs({ 0: 0, 1: 13 }).adjacent).toBe(1);
    expect(pairs({ 0: 0, 5: 13 }).adjacent).toBe(1);
    expect(pairs({ 0: 0, 6: 13 }).adjacent).toBe(0);
    expect(pairs({ 0: 0, 1: 13, 5: 26 }).adjacent).toBe(2);
  });

  it("adds the sum per pair times the bet to the payout, and nothing without the node", () => {
    const base = pairs({ 0: 0, 1: 13 }, 0).payout;
    expect(pairs({ 0: 0, 1: 13 }, 0.5, 2).payout - pairs({ 0: 0, 1: 13 }, 0, 2).payout).toBeCloseTo(1);
    expect(pairs({ 0: 0, 1: 13 }, 0).adjacent).toBe(1);
    expect(base).toBe(pairs({ 0: 0, 1: 13 }, 0).payout);
  });

  it("does not count the neighbours of a joker or a stone", () => {
    const first: Card[] = [0, 13, ...boardOf([0, 13]).slice(2)];
    const score = { ...scoreMods(m0), adjacency: 1 };
    const all = scoreBoard(first, 1, {}, score).adjacent;
    expect(all).toBeGreaterThanOrEqual(1);
    expect(scoreBoard(first, 1, { 0: { joker: true } }, score).adjacent).toBe(all - 1);
    expect(scoreBoard(first, 1, { 13: { stone: true } }, score).adjacent).toBe(all - 1);
  });

  it("comes from two nodes of the Hands branch", () => {
    const m = newMeta();
    m.climb.chips = 500;
    buyTech(m, "climb", "pairs1");
    expect(modsFor(m, "climb", []).adjacency).toBe(0);
    expect(buyTech(m, "climb", "adj2")).toBe(false);
    expect(buyTech(m, "climb", "adj1")).toBe(true);
    expect(buyTech(m, "climb", "adj2")).toBe(true);
    expect(modsFor(m, "climb", []).adjacency).toBeCloseTo(1);
    m.endless.chips = 500;
    buyTech(m, "endless", "pairs1");
    expect(buyTech(m, "endless", "adj1")).toBe(true);
  });
});

describe("a loan", () => {
  const toShop = (round = 4): Run => {
    const m = { ...baseMods(), eventChance: 0 };
    const run = startRun(3, m);
    run.round = round;
    run.coins = 999;
    run.turnsLeft = 0;
    closeRound(run, m, () => m);
    return run;
  };

  it("is taken in the shop, gives coins now and adds its price to the next quota", () => {
    const run = toShop();
    const coins = run.coins;
    const owed = Math.ceil(10 * LOAN_RATE);
    expect(takeLoan(run, 10)).toBe(true);
    expect([run.coins, run.debt]).toEqual([coins + 10, owed]);
    const mk = () => ({ ...baseMods(), eventChance: 0 });
    beginRound(run, mk);
    expect(run.quota).toBe(quotaFor(run.round, mk()) + owed);
    expect(run.debt).toBe(0);
    expect(run.events.join(" ")).toContain(`${owed}`);
  });

  it("is refused outside the shop, twice in a row, above the quota or for nonsense", () => {
    const run = toShop();
    expect(takeLoan(run, 0)).toBe(false);
    expect(takeLoan(run, 1.5)).toBe(false);
    expect(takeLoan(run, run.quota + 1)).toBe(false);
    expect(takeLoan(run, run.quota)).toBe(true);
    expect(takeLoan(run, 1)).toBe(false);
    const play = startRun(1, m0);
    expect(takeLoan(play, 5)).toBe(false);
  });

  it("is kept by a save, and an old save starts without debt", () => {
    const run = toShop();
    takeLoan(run, 10);
    expect(restoreRun(JSON.parse(JSON.stringify(run)))?.debt).toBe(run.debt);
    const raw = JSON.parse(JSON.stringify(run)) as Record<string, unknown>;
    delete raw.debt;
    expect(restoreRun(raw)?.debt).toBe(0);
    raw.debt = -5;
    expect(restoreRun(raw)?.debt).toBe(0);
  });
});
