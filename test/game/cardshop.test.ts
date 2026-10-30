import { describe, expect, it } from "vitest";
import { MAX_JOKERS, MAX_RANK_LEVELS, applyCardUpgrade, cardUpgradeCost, upgradesBought } from "../../src/game/cards-shop";
import { ACHIEVEMENTS, checkAchievements, modsFor, newMeta } from "../../src/game/meta";
import { type Run, buyCardUpgrade, dealRound, drawHand, restoreRun, startRun } from "../../src/game/run";
import { makeRng } from "../../src/game/rng";

const m = (kinds: string[] = ["rank"]) => {
  const base = modsFor(newMeta(), "climb", []);
  base.cardKinds = kinds;
  return base;
};
const rich = (seed = 1): Run => {
  const run = startRun(seed, m());
  run.coins = 100000;
  return run;
};

describe("card upgrades", () => {
  it("cost more with every upgrade bought, and the tree's discount lowers them", () => {
    const run = rich();
    const first = cardUpgradeCost(run.cardUpgrades, "rank");
    expect(buyCardUpgrade(run, 5, "rank", m())).toBe(true);
    const second = cardUpgradeCost(run.cardUpgrades, "rank");
    expect(second).toBeGreaterThan(first);
    expect(cardUpgradeCost(run.cardUpgrades, "rank", 0.75)).toBeLessThan(second);
    expect(upgradesBought(run.cardUpgrades)).toBe(1);
    expect(run.coins).toBe(100000 - first);
  });

  it("refuses kinds the tree has not unlocked, unknown cards, and what it cannot afford", () => {
    const run = rich();
    expect(buyCardUpgrade(run, 5, "gold", m())).toBe(false);
    expect(buyCardUpgrade(run, 5, "gold", m(["rank", "gold"]))).toBe(true);
    expect(buyCardUpgrade(run, 99, "rank", m())).toBe(false);
    expect(buyCardUpgrade(run, -1, "rank", m())).toBe(false);
    expect(buyCardUpgrade(run, 1.5, "rank", m())).toBe(false);
    const poor = startRun(2, m());
    poor.coins = 1;
    expect(buyCardUpgrade(poor, 5, "rank", m())).toBe(false);
    expect(poor.coins).toBe(1);
    expect(poor.cardUpgrades).toEqual({});
  });

  it("limits rank levels, jokers and repeats", () => {
    const ups = {};
    let cur: Record<number, object> | null = ups;
    for (let i = 0; i < MAX_RANK_LEVELS; i++) cur = applyCardUpgrade(cur as never, 7, "rank");
    expect(cur?.[7]).toEqual({ rank: MAX_RANK_LEVELS });
    expect(applyCardUpgrade(cur as never, 7, "rank")).toBeNull();
    let j: Record<number, object> | null = {};
    for (let c = 0; c < MAX_JOKERS; c++) j = applyCardUpgrade(j as never, c, "joker");
    expect(applyCardUpgrade(j as never, 20, "joker")).toBeNull();
    expect(applyCardUpgrade({ 3: { gold: true } }, 3, "gold")).toBeNull();
    expect(applyCardUpgrade({ 3: { joker: true } }, 3, "rank")).toBeNull();
  });

  it("a joker or a gold card changes what a round pays", () => {
    // the same seed, the same cards: a run with every card gold pays at least as much as one without
    const pay = (setup: (r: Run) => void): number => {
      const run = startRun(11, m(["rank", "gold", "joker"]));
      run.coins = 100000;
      setup(run);
      const mm = m(["rank", "gold", "joker"]);
      dealRound(run, mm, 1);
      const res = drawHand(run, mm, { rows: [0, 1], cols: [], cells: [] });
      if (typeof res === "string") throw new Error(res);
      return res.payout;
    };
    const plain = pay(() => {});
    const gold = pay((r) => { for (let c = 0; c < 52; c++) r.cardUpgrades[c] = { gold: true }; });
    const jokers = pay((r) => { for (let c = 0; c < 52; c++) r.cardUpgrades[c] = { joker: true }; });
    expect(gold).toBeGreaterThanOrEqual(plain);
    expect(jokers).toBeGreaterThan(plain);
  });

  it("are saved with the run and bad ones are dropped", () => {
    const run = rich();
    buyCardUpgrade(run, 9, "rank", m());
    const back = restoreRun(JSON.parse(JSON.stringify(run)));
    expect(back?.cardUpgrades).toEqual({ 9: { rank: 1 } });
    const raw = JSON.parse(JSON.stringify(run));
    raw.cardUpgrades = { 9: { rank: 99, gold: "x" }, 60: { gold: true }, abc: { gold: true }, 4: 5, 5: {} };
    expect(restoreRun(raw)?.cardUpgrades).toEqual({ 9: { rank: 3 } });
    raw.hand = { board: [1, 2, 3], bet: 1, phase: "hold", draws: 0, maxDraws: 1 };
    expect(restoreRun(raw)?.hand).toBeNull(); // the hand is dropped, the run goes on
  });
});

describe("achievements", () => {
  const stats = (over: Record<string, number>) => {
    const run = startRun(1, m());
    Object.assign(run.stats, over);
    return run;
  };
  const got = (run: Run): string[] => checkAchievements(newMeta(), "climb", run).map((a) => a.id);

  it("has at least 30 achievements with unique ids", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it("unlocks the hand achievements by the best hand made", () => {
    expect(got(stats({ bestHand: 5 }))).toEqual(expect.arrayContaining(["flush"]));
    expect(got(stats({ bestHand: 5 }))).not.toContain("fullhouse");
    expect(got(stats({ bestHand: 10 }))).toEqual(expect.arrayContaining(["flush", "fullhouse", "quads", "sflush", "five", "royal"]));
  });

  it("unlocks the line and hold achievements", () => {
    expect(got(stats({ bestLines: 4 }))).toContain("lines4");
    expect(got(stats({ bestLines: 10 }))).toEqual(expect.arrayContaining(["lines4", "lines7", "lines10"]));
    expect(got(stats({ heldWins: 1 }))).toContain("hold1");
    expect(got(stats({ heldWins: 8 }))).toContain("hold8");
    expect(got(stats({ singleWins: 1 }))).toContain("single1");
  });

  it("unlocks the card upgrade achievements", () => {
    const run = rich();
    for (const c of [1, 2, 3]) run.cardUpgrades[c] = { gold: true };
    expect(got(run)).toEqual(expect.arrayContaining(["upg3", "gold3"]));
    const j = rich();
    j.cardUpgrades[4] = { joker: true };
    expect(got(j)).toContain("joker1");
  });

  it("unlocks the big round achievements", () => {
    expect(got(stats({ bestSlotWin: 100 }))).toContain("win100");
    expect(got(stats({ bestSlotWin: 100 }))).not.toContain("win500");
    expect(got(stats({ bestSlotWin: 500 }))).toContain("win500");
  });

  it("unlocks the tree achievements from the tree of either mode", () => {
    const meta = newMeta();
    meta.endless.tech = ["hold3", "hold4", "hold5", "single", "redraw1"];
    const ids = checkAchievements(meta, "endless", null).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["tech5", "branch5"]));
    expect(ids).not.toContain("treeall");
    expect(meta.endless.chips).toBeGreaterThan(0);
    expect(meta.climb.chips).toBe(0);
  });

  it("pays each achievement once", () => {
    const meta = newMeta();
    const run = stats({ bestHand: 10 });
    const first = checkAchievements(meta, "climb", run);
    expect(first.length).toBeGreaterThan(3);
    expect(checkAchievements(meta, "climb", run)).toEqual([]);
  });

  it("a seeded round gives the same achievements twice", () => {
    const play = (): string[] => {
      const run = startRun(3, m());
      run.coins = 100000;
      for (let i = 0; i < 10; i++) {
        dealRound(run, m(), 1);
        drawHand(run, m(), { rows: [0], cols: [], cells: [] });
      }
      return got(run);
    };
    expect(play()).toEqual(play());
    expect(makeRng(1).s).toBe(1);
  });
});
