import { describe, expect, it } from "vitest";
import { baseMods } from "../../src/game/mods";
import { dropCoin, newPusher, step } from "../../src/game/pusher";
import { QUOTA_BREAK, quotaFor, spinSlot, startRun } from "../../src/game/run";
import { makeRng } from "../../src/game/rng";
import { BASE_WEIGHTS, spin, spinGrid } from "../../src/game/slot";

// Targets from the balance run (#9, tools/sim, notes/reference/balance.md). They pin the numbers a simulated player was tuned against.
describe("balance targets", () => {
  it("quota curve: forgiving up to round 5, steep after, bosses on top", () => {
    const m = baseMods();
    expect([1, 2, 3, 4, 5].map((r) => quotaFor(r, m))).toEqual([14, 18, 24, 31, 40]);
    expect(QUOTA_BREAK).toBe(5);
    expect(quotaFor(6, m) / quotaFor(5, m)).toBeCloseTo(1.7, 1);
    expect(quotaFor(10, m)).toBeGreaterThan(500);
  });

  it("the wild star only shows on the middle reel", () => {
    const rng = makeRng(4);
    const seen = [0, 0, 0];
    for (let i = 0; i < 3000; i++) for (const row of spinGrid(rng, BASE_WEIGHTS)) row.forEach((s, c) => s === "wild" && seen[c]!++);
    expect(seen[0]).toBe(0);
    expect(seen[2]).toBe(0);
    expect(seen[1]).toBeGreaterThan(500);
  });

  it("a wild star is worth little: four more stars lift the line return by less than 0.35", () => {
    const rtp = (wild: number): number => {
      const rng = makeRng(77);
      let paid = 0;
      for (let i = 0; i < 80000; i++) paid += spin(rng, 1, 1, { ...BASE_WEIGHTS, wild }).payout;
      return paid / 80000;
    };
    const base = rtp(10);
    const more = rtp(14);
    expect(base).toBeGreaterThan(0.75);
    expect(base).toBeLessThan(1);
    expect(more).toBeGreaterThan(base);
    expect(more - base).toBeLessThan(0.35);
  });

  it("the free hand is staked with bet times lines, up to the poker max", () => {
    const m = baseMods();
    m.slotLines = 3;
    const run = startRun(1, m);
    spinSlot(run, m, 1);
    expect(run.poker.bet).toBe(3);
    const big = startRun(2, m);
    spinSlot(big, m, 3);
    expect(big.poker.bet).toBe(m.pokerMaxBet);
  });

  it("the pusher gives back what is poured within about a minute (no long dead start)", () => {
    const out: number[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const p = newPusher(makeRng(seed));
      let fell = 0;
      let x = seed * 3;
      for (let i = 1; i <= 60 * 60; i++) {
        if (i % 120 === 0) for (let k = 0; k < 2; k++) dropCoin(p, 0.6 + ((x = (x * 31 + 7) % 88) / 10));
        fell += step(p).length;
      }
      out.push(fell);
    }
    const avg = out.reduce((a, b) => a + b, 0) / out.length;
    expect(avg).toBeGreaterThan(30); // 60 coins poured in a minute; about 46 came out in the balance run
  });
});
