import { describe, expect, it } from "vitest";
import { TECH } from "../../src/game/content";
import { addPlayTime, buyTech, canBuy, checkAchievements, finishRun, modsFor, newMeta, relicSlots, restoreMeta } from "../../src/game/meta";
import { baseMods } from "../../src/game/mods";
import { restoreRun, startRun } from "../../src/game/run";

const v1 = (over: Record<string, unknown> = {}) => ({ v: 1, chips: 5, tech: ["purse1"], relics: ["penny"], ach: ["first"], runs: 3, bestRound: 4, life: { spins: 9 }, seedCounter: 7, maxStake: 1, loadout: ["penny"], ...over });

describe("chips and tree per mode", () => {
  it("a new meta has an empty climb and an empty endless", () => {
    const meta = newMeta();
    expect([meta.climb.chips, meta.endless.chips]).toEqual([0, 0]);
    expect([meta.climb.tech, meta.endless.tech]).toEqual([[], []]);
    expect(meta.endless.stats).toEqual({ sessions: 0, playMs: 0, spins: 0, endings: {} });
  });

  it("buying in one mode changes only that mode", () => {
    const meta = newMeta();
    meta.climb.chips = 50;
    meta.endless.chips = 50;
    expect(buyTech(meta, "climb", "purse1")).toBe(true);
    expect([meta.climb.chips, meta.endless.chips]).toEqual([47, 50]);
    expect(meta.endless.tech).toEqual([]);
    expect(canBuy(meta, "endless", "purse1")).toBe(true);
    expect(canBuy(meta, "climb", "purse1")).toBe(false);
  });

  it("modsFor reads the tree of the mode it is asked for", () => {
    const meta = newMeta();
    meta.climb.chips = 50;
    buyTech(meta, "climb", "purse1");
    expect(modsFor(meta, "climb", []).startCoins).toBe(baseMods().startCoins + 10);
    expect(modsFor(meta, "endless", []).startCoins).toBe(baseMods().startCoins);
  });

  it("restoreMeta moves a v1 meta's chips and valid tech into climb and starts endless empty", () => {
    const meta = restoreMeta(v1());
    expect([meta.v, meta.climb.chips, meta.climb.tech]).toEqual([2, 5, ["purse1"]]);
    expect([meta.endless.chips, meta.endless.tech]).toEqual([0, []]);
    expect([meta.relics, meta.ach, meta.runs, meta.bestRound, meta.maxStake, meta.loadout]).toEqual([["penny"], ["first"], 3, 4, 1, ["penny"]]);
  });

  it("restoreMeta refunds the chips of nodes that no longer exist into climb", () => {
    const meta = restoreMeta(v1({ chips: 0, tech: ["purse1", "pbet", "lines3", "zone4"] }));
    expect(meta.climb.tech).toEqual(["purse1"]);
    expect(meta.climb.chips).toBe(4 + 4 + 12);
  });

  it("restoreMeta keeps a v2 meta as it is, per mode, and drops unknown ids", () => {
    const meta = newMeta();
    meta.climb.chips = 3;
    meta.endless.chips = 8;
    meta.endless.tech = ["purse1", "nope"];
    meta.endless.stats = { sessions: 2, playMs: 1000, spins: 40, endings: { prestige: 1 } };
    const back = restoreMeta(JSON.parse(JSON.stringify(meta)));
    expect([back.climb.chips, back.endless.chips, back.endless.tech]).toEqual([3, 8, ["purse1"]]);
    expect(back.endless.stats).toEqual({ sessions: 2, playMs: 1000, spins: 40, endings: { prestige: 1 } });
  });

  it("corrupt storage gives a fresh meta without throwing", () => {
    for (const raw of [null, undefined, 5, "x", [], { v: 2 }, { v: 2, climb: 7, endless: "x" }, { v: 2, climb: { chips: -3, tech: "no", stats: 5 } }]) {
      const meta = restoreMeta(raw);
      expect(meta.v).toBe(2);
      expect(meta.climb.chips).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(meta.endless.tech)).toBe(true);
      expect(meta.endless.stats.sessions).toBe(0);
    }
  });

  it("a saved v1 run is discarded", () => {
    const run = JSON.parse(JSON.stringify(startRun(1, baseMods())));
    expect(restoreRun({ ...run, pusher: {}, poker: {} })).toBeNull();
  });

  it("pays the chips of a finished climb run to climb only, and counts the session there", () => {
    const meta = newMeta();
    const run = startRun(1, baseMods());
    run.completed = 2;
    run.round = 3;
    run.overReason = "quota";
    run.stats.spins = 20;
    expect(finishRun(meta, run)).toBe(7);
    expect([meta.climb.chips, meta.endless.chips]).toEqual([7, 0]);
    expect(meta.climb.stats).toMatchObject({ sessions: 1, spins: 20, endings: { quota: 1 } });
    expect(meta.endless.stats.sessions).toBe(0);
  });

  it("pays achievement chips to the mode being played", () => {
    const meta = newMeta();
    const run = startRun(1, baseMods());
    run.stats.spins = 1;
    checkAchievements(meta, "endless", run);
    expect(meta.endless.chips).toBeGreaterThan(0);
    expect(meta.climb.chips).toBe(0);
  });

  it("adds play time to one mode", () => {
    const meta = newMeta();
    addPlayTime(meta, "endless", 1500);
    addPlayTime(meta, "endless", -5);
    addPlayTime(meta, "endless", Number.NaN);
    expect([meta.endless.stats.playMs, meta.climb.stats.playMs]).toEqual([1500, 0]);
  });

  it("relic slots count the display case of either mode, once", () => {
    const meta = newMeta();
    meta.climb.chips = 100;
    meta.endless.chips = 100;
    buyTech(meta, "climb", "purse1");
    buyTech(meta, "climb", "case1");
    expect(relicSlots(meta)).toBe(3);
    buyTech(meta, "endless", "purse1");
    buyTech(meta, "endless", "case1");
    expect(relicSlots(meta)).toBe(3);
  });

  it("the tree catalogue is shared by both modes", () => {
    expect(TECH.length).toBeGreaterThan(20);
  });
});
