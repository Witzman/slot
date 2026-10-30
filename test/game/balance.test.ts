import { describe, expect, it } from "vitest";
import { TECH } from "../../src/game/content";
import { buyTech, newMeta } from "../../src/game/meta";
import { baseMods } from "../../src/game/mods";
import { quotaFor } from "../../src/game/run";
import { playRun } from "../../tools/sim/harness";
import { always, never, smart } from "../../tools/sim/policy";

// Balance of the climb mode (#10), measured with `tools/sim`: one round of cards is 4 s of play, a competent bot stands for the owner's target.
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
const treeOf = (ids: string[]) => {
  const meta = newMeta();
  meta.climb.chips = 100000;
  for (let pass = 0; pass < TECH.length; pass++) for (const id of ids) buyTech(meta, "climb", id);
  return meta;
};
const seeds = (n: number): number[] => Array.from({ length: n }, (_, i) => 1000 + i);

describe("balance of the climb mode", () => {
  const fresh = seeds(10).map((s) => playRun(s, newMeta(), smart));

  it("a competent bot on an empty tree plays a median run of at least 20 minutes", () => {
    expect(median(fresh.map((r) => r.minutes))).toBeGreaterThanOrEqual(20);
    expect(fresh.every((r) => r.reason === "quota")).toBe(true);
  });

  it("most competent runs get past the first boss", () => {
    expect(fresh.filter((r) => r.rounds >= 5).length).toBeGreaterThanOrEqual(6);
  });

  it("a bought tree goes deeper than an empty one", () => {
    const mid = treeOf(["purse1", "time1", "hold3", "hold4", "pairs1", "runs1"]);
    const bought = seeds(5).map((s) => playRun(s, mid, smart));
    expect(median(bought.map((r) => r.rounds))).toBeGreaterThanOrEqual(median(fresh.map((r) => r.rounds)));
    expect(median(bought.map((r) => r.minutes))).toBeGreaterThan(median(fresh.map((r) => r.minutes)));
  }, 60_000);

  it("a bot that decides its holds beats one that never holds and one that always holds the first lines", () => {
    const smartRounds = median(fresh.map((r) => r.rounds));
    expect(median(seeds(5).map((s) => playRun(s, newMeta(), never).rounds))).toBeLessThan(smartRounds / 2);
    expect(median(seeds(5).map((s) => playRun(s, newMeta(), always).rounds))).toBeLessThan(smartRounds / 2);
  });

  it("nothing is farmable for ever: the quota outgrows any income", () => {
    expect(quotaFor(40, baseMods())).toBeGreaterThan(1e7);
  });

  it("a run is a pure function of its seed", () => {
    expect(playRun(7, newMeta(), smart)).toEqual(playRun(7, newMeta(), smart));
  });
});
