import { describe, expect, it } from "vitest";
import { TECH } from "../../src/game/content";
import { buyTech, newMeta } from "../../src/game/meta";
import { baseMods } from "../../src/game/mods";
import { quotaFor } from "../../src/game/run";
import { playRun } from "../../tools/sim/harness";
import { naive, smart } from "../../tools/sim/policy";

// Balance of the climb mode (#10), measured with `tools/sim`: one spin is 2.5 s of play, a competent bot stands for the owner's target.
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
const treeOf = (ids: string[]) => {
  const meta = newMeta();
  meta.climb.chips = 100000;
  for (let pass = 0; pass < TECH.length; pass++) for (const id of ids) buyTech(meta, "climb", id);
  return meta;
};
const seeds = (n: number): number[] => Array.from({ length: n }, (_, i) => 1000 + i);

describe("balance of the climb mode", () => {
  const fresh = seeds(8).map((s) => playRun(s, newMeta(), smart));

  it("a competent bot on an empty tree plays a median run of at least 20 minutes", () => {
    expect(median(fresh.map((r) => r.minutes))).toBeGreaterThanOrEqual(20);
    expect(fresh.filter((r) => r.minutes < 15).length).toBeLessThanOrEqual(1); // bad luck early can end a run
    expect(fresh.every((r) => r.reason === "quota")).toBe(true);
  });

  it("hardly any competent run ends in the first rounds", () => {
    expect(fresh.filter((r) => r.rounds < 5).length).toBeLessThanOrEqual(1);
  });

  it("a bought tree goes deeper than an empty one", () => {
    const mid = treeOf(["purse1", "time1", "rows4", "cols4", "chain1", "wild1"]);
    const bought = median(seeds(3).map((s) => playRun(s, mid, smart).rounds));
    expect(bought).toBeGreaterThan(median(fresh.map((r) => r.rounds)));
  }, 60_000);

  it("a player who takes the first of everything does much worse than a competent one", () => {
    const poor = median(seeds(6).map((s) => playRun(s, newMeta(), naive).rounds));
    expect(poor).toBeLessThan(median(fresh.map((r) => r.rounds)) / 2);
  });

  it("nothing is farmable for ever: the quota outgrows any income", () => {
    expect(quotaFor(40, baseMods())).toBeGreaterThan(1e7);
  });

  it("a run is a pure function of its seed", () => {
    expect(playRun(7, newMeta(), smart)).toEqual(playRun(7, newMeta(), smart));
  });
});
