import { describe, expect, it } from "vitest";
import { CLUSTER_PAY, MAX_CASCADE, SCATTER_FREE_SPINS, clusterPay, type SpinParams, findClusters, spinBoard } from "../../src/game/board";
import { makeRng } from "../../src/game/rng";
import { BASE_WEIGHTS, SYMS, type Sym } from "../../src/game/slot";

const params = (over: Partial<SpinParams> = {}): SpinParams => ({
  weights: { ...BASE_WEIGHTS },
  symPay: Object.fromEntries(SYMS.map((s) => [s, 1])) as Record<Sym, number>,
  chainStart: 1,
  chainStep: 0.5,
  chainCap: 5,
  globalMul: 1,
  ...over,
});
const only = (sym: Sym): Record<Sym, number> => Object.fromEntries(SYMS.map((s) => [s, s === sym ? 1 : 0])) as Record<Sym, number>;

describe("findClusters", () => {
  it("finds a 3-cluster and ignores a diagonal pair", () => {
    const g: Sym[][] = [
      ["bell", "bell", "lemon"],
      ["bar", "bell", "bar"],
      ["cherry", "lemon", "cherry"],
    ];
    const found = findClusters(g);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ sym: "bell" });
    expect(found[0]?.cells).toHaveLength(3);
    const diag: Sym[][] = [["bar", "lemon", "bar"], ["lemon", "bar", "lemon"], ["bar", "lemon", "bar"]];
    expect(findClusters(diag)).toEqual([]);
  });

  it("lets a wild bridge two groups of the same symbol", () => {
    const g: Sym[][] = [["bell", "bell", "lemon"], ["lemon", "wild", "lemon"], ["bar", "bell", "bar"]];
    const bells = findClusters(g).filter((c) => c.sym === "bell");
    expect(bells).toHaveLength(1);
    expect(bells[0]?.cells).toHaveLength(4);
  });

  it("never forms a cluster out of coins", () => {
    const g: Sym[][] = [["coin", "coin", "coin"], ["coin", "wild", "coin"], ["bar", "lemon", "bar"]];
    expect(findClusters(g).filter((c) => c.sym === ("coin" as Sym))).toEqual([]);
  });

  it("pays a group of wilds alone as sevens, once", () => {
    const g: Sym[][] = [["wild", "wild", "wild"], ["coin", "coin", "coin"], ["coin", "coin", "coin"]];
    expect(findClusters(g).map((c) => c.sym)).toEqual(["seven"]);
  });
});

describe("spinBoard", () => {
  it("is a pure function of the seed", () => {
    const a = spinBoard(makeRng(7), { rows: 4, cols: 4 }, 1, params());
    const b = spinBoard(makeRng(7), { rows: 4, cols: 4 }, 1, params());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("fills the board it is asked for", () => {
    const res = spinBoard(makeRng(1), { rows: 5, cols: 6 }, 1, params());
    expect(res.start).toHaveLength(5);
    expect(res.start.every((r) => r.length === 6)).toBe(true);
  });

  it("a full 6x6 board of one symbol resolves in at most 12 steps and pays a finite amount", () => {
    const res = spinBoard(makeRng(2), { rows: 6, cols: 6 }, 1, params({ weights: only("cherry") }));
    expect(res.steps.length).toBeLessThanOrEqual(MAX_CASCADE);
    expect(res.steps.length).toBe(MAX_CASCADE);
    expect(Number.isFinite(res.payout)).toBe(true);
    expect(res.payout).toBeGreaterThan(0);
  });

  it("a full wild board resolves in at most 12 steps", () => {
    const res = spinBoard(makeRng(3), { rows: 6, cols: 6 }, 1, params({ weights: only("wild") }));
    expect(res.steps.length).toBeLessThanOrEqual(MAX_CASCADE);
    expect(Number.isFinite(res.payout)).toBe(true);
  });

  it("never lets the chain multiplier pass chainCap", () => {
    const res = spinBoard(makeRng(4), { rows: 6, cols: 6 }, 1, params({ weights: only("lemon"), chainStep: 2, chainCap: 3 }));
    expect(Math.max(...res.steps.map((s) => s.multiplier))).toBe(3);
  });

  it("raises the multiplier by chainStep on every step of the chain", () => {
    const res = spinBoard(makeRng(5), { rows: 3, cols: 3 }, 1, params({ weights: only("bell"), chainStep: 0.5, chainCap: 10 }));
    expect(res.steps.slice(0, 3).map((s) => s.multiplier)).toEqual([1, 1.5, 2]);
  });

  it("pays a size 4 cluster twice as much as a size 3 cluster of the same symbol", () => {
    expect(clusterPay("bar", 4)).toBe(2 * clusterPay("bar", 3));
    expect(clusterPay("seven", 3)).toBe(CLUSTER_PAY.seven);
  });

  it("gives free spins for three coins on the start board", () => {
    const res = spinBoard(makeRng(6), { rows: 3, cols: 3 }, 1, params({ weights: only("coin") }));
    expect(res.freeSpins).toBe(SCATTER_FREE_SPINS(9));
    expect(SCATTER_FREE_SPINS(3)).toBe(1);
    expect(SCATTER_FREE_SPINS(2)).toBe(0);
  });

  it("scales the payout with the bet and the global multiplier", () => {
    const a = spinBoard(makeRng(9), { rows: 3, cols: 3 }, 1, params({ weights: only("bell") }));
    const b = spinBoard(makeRng(9), { rows: 3, cols: 3 }, 2, params({ weights: only("bell"), globalMul: 1.5 }));
    expect(b.payout).toBeCloseTo(a.payout * 3, 0);
  });

  it("returns between 80% and 110% of the bet on 3x3, and more on a bigger board (growth is power)", () => {
    const rtp = (rows: number, cols: number): number => {
      const rng = makeRng(99 + rows);
      let paid = 0;
      const n = 20000;
      for (let i = 0; i < n; i++) paid += spinBoard(rng, { rows, cols }, 1, params()).payout;
      return paid / n;
    };
    const small = rtp(3, 3);
    expect(small).toBeGreaterThan(0.8);
    expect(small).toBeLessThan(1.1);
    const big = rtp(6, 6);
    expect(big).toBeGreaterThan(small);
    expect(Number.isFinite(big)).toBe(true);
  });
});
