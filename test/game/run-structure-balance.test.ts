import { describe, expect, it } from "vitest";
import { newMeta } from "../../src/game/meta";
import { SETUPS } from "../../src/game/setups";
import { playRun } from "../../tools/sim/harness";
import { smart } from "../../tools/sim/policy";

// Balance of the run structure (#15), measured with `tools/sim` and `npx tsx tools/sim/balance.ts smart <runs> fresh <stake> <setup>`.
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
const runs = (setup: string, stake = 0, n = 10) => {
  const seed = SETUPS.find((s) => s.id === setup)?.seed ?? 1000;
  return Array.from({ length: n }, (_, i) => playRun(seed + i, newMeta(), smart, stake, 3000, setup));
};

describe("balance of decks, stakes and challenges", () => {
  const classic = runs("classic", 0, 6);

  it("no deck is a trap or a free win: its median run stays within 65% to 140% of the classic one", () => {
    for (const d of SETUPS.filter((s) => s.kind === "deck" && s.id !== "classic")) {
      const m = median(runs(d.id, 0, 6).map((r) => r.minutes));
      expect(m, d.id).toBeGreaterThanOrEqual(median(classic.map((r) => r.minutes)) * 0.65);
      expect(m, d.id).toBeLessThanOrEqual(median(classic.map((r) => r.minutes)) * 1.4);
    }
  }, 120_000);

  it("a competent bot clears each challenge sometimes and never always", () => {
    for (const c of SETUPS.filter((s) => s.kind === "challenge")) {
      const cleared = runs(c.id, 0, c.id === "thin" ? 10 : 8).filter((r) => r.rounds >= (c.goal as number)).length;
      expect(cleared, c.id).toBeGreaterThanOrEqual(1);
      expect(cleared, c.id).toBeLessThanOrEqual(c.id === "thin" ? 9 : 7);
    }
  }, 120_000);

  it("the top stake is not easier than no stake", () => {
    expect(median(runs("classic", 5, 6).map((r) => r.rounds))).toBeLessThanOrEqual(median(classic.map((r) => r.rounds)));
  }, 60_000);
});
