import { describe, expect, it } from "vitest";
import { makeRng } from "../../src/game/rng";
import { BASE_WEIGHTS, type Sym, evaluate, linePay, spin } from "../../src/game/slot";

const grid = (mid: Sym[], top: Sym[] = ["lemon", "bar", "bell"], bot: Sym[] = ["bar", "lemon", "bell"]): Sym[][] => [top, mid, bot];

describe("slot lines", () => {
  it("pays three of a kind", () => {
    expect(linePay(["bell", "bell", "bell"])).toMatchObject({ sym: "bell", pay: 10 });
    expect(linePay(["seven", "seven", "seven"])?.pay).toBe(60);
  });

  it("lets wild stand in, and three wilds pay as sevens", () => {
    expect(linePay(["bar", "wild", "bar"])).toMatchObject({ sym: "bar", pay: 20 });
    expect(linePay(["wild", "wild", "bell"])).toMatchObject({ sym: "bell", pay: 10 });
    expect(linePay(["wild", "wild", "wild"])).toMatchObject({ sym: "seven", pay: 60 });
  });

  it("never lets wild complete a coin line, and pays a cherry pair on the left", () => {
    expect(linePay(["coin", "wild", "coin"])).toBeNull();
    expect(linePay(["cherry", "cherry", "bar"])?.pay).toBe(1);
    expect(linePay(["wild", "cherry", "bar"])?.pay).toBe(1);
    expect(linePay(["bar", "cherry", "cherry"])).toBeNull();
    expect(linePay(["bar", "bell", "bar"])).toBeNull();
  });

  it("plays only the lines that are unlocked, and multiplies by the bet", () => {
    const g = grid(["bell", "bell", "bell"], ["seven", "seven", "seven"]);
    expect(evaluate(g, 1, 2).payout).toBe(20);
    expect(evaluate(g, 3, 2).payout).toBe(20 + 120);
    expect(evaluate(g, 3, 2).wins.map((w) => w.line)).toEqual([0, 1]);
  });

  it("pays free drops for three or more coin scatters anywhere", () => {
    expect(evaluate(grid(["coin", "bar", "lemon"], ["coin", "bell", "bar"], ["bell", "coin", "bar"]), 1, 1).freeDrops).toBe(3);
    expect(evaluate(grid(["coin", "bar", "lemon"], ["coin", "bell", "bar"]), 1, 1).freeDrops).toBe(0);
  });

  it("returns between 80% and 110% of the bet over many spins (one line and five lines)", () => {
    for (const lines of [1, 5]) {
      const rng = makeRng(99 + lines);
      let paid = 0;
      const n = 60000;
      for (let i = 0; i < n; i++) paid += spin(rng, lines, 1, BASE_WEIGHTS).payout;
      const rtp = paid / (n * lines);
      expect(rtp, `lines ${lines}`).toBeGreaterThan(0.8);
      expect(rtp, `lines ${lines}`).toBeLessThan(1.1);
    }
  });
});
