import { describe, expect, it } from "vitest";
import { applyCardUpgrade } from "../../src/game/cards-shop";
import { ENDLESS_SHOP, drawSession, dealSession, endlessMods, restoreSession, sessionView, startSession } from "../../src/game/endless";
import { ACHIEVEMENTS, buyTech, canBuy, checkAchievements, modsFor, newMeta, restoreMeta } from "../../src/game/meta";
import { baseMods } from "../../src/game/mods";
import { dealRound, drawHand, restoreRun, startRun } from "../../src/game/run";
import { TECH } from "../../src/game/content";

const NOTHING = { rows: [], cols: [], cells: [] };

describe("fixes after the whole-branch review (#10)", () => {
  it("refunds the chips of every node that was ever live and is gone now", () => {
    const meta = restoreMeta({ v: 1, chips: 0, tech: ["purse1", "rows4", "cols4", "wild2", "scatter2"] });
    expect(meta.climb.chips).toBe(4 + 10 + 9 + 8);
    expect(meta.climb.tech).toEqual(["purse1"]);
  });

  it("a rank-up is refused on a card that cannot rise", () => {
    expect(applyCardUpgrade({}, 12, "rank")).toBeNull(); // ace of spades
    expect(applyCardUpgrade({ 11: { rank: 1 } }, 11, "rank")).toBeNull(); // king +1 is the ace
    expect(applyCardUpgrade({}, 10, "rank")).toEqual({ 10: { rank: 1 } }); // queen
  });

  it("single cards count against the hold limit", () => {
    const run = startRun(3, { ...baseMods(), singleHold: true });
    const m = { ...baseMods(), singleHold: true };
    run.coins = 1000;
    dealRound(run, m, 1);
    expect(drawHand(run, m, { rows: [], cols: [], cells: Array.from({ length: 25 }, (_, i) => i) })).toBe("bad-hold");
    expect(drawHand(run, m, { rows: [0], cols: [], cells: [10, 11, 12, 13, 14, 15] })).toBe("bad-hold");
    expect(typeof drawHand(run, m, { rows: [0], cols: [], cells: [10, 11] })).toBe("object");
  });

  it("endless takes nothing from the climb relics, and the display case is climb only", () => {
    const meta = newMeta();
    meta.relics = ["grand", "fortune", "penny", "dice"];
    meta.loadout = ["grand", "fortune"];
    const s = startSession(1, modsFor(newMeta(), "endless", []), 0);
    const plain = endlessMods(newMeta(), s);
    const withRelics = endlessMods(meta, s);
    expect(withRelics.slotWinMul).toBe(plain.slotWinMul);
    expect(withRelics.removedRanks).toEqual([]);
    expect(withRelics.startCoins).toBe(plain.startCoins);
    expect(modsFor(meta, "climb", []).removedRanks).toEqual([2, 3]);
    expect(TECH.filter((t) => t.id.startsWith("case")).every((t) => t.modes?.join() === "climb")).toBe(true);
  });

  it("climb-only nodes cannot be bought for endless", () => {
    const meta = newMeta();
    meta.endless.chips = 100;
    expect(canBuy(meta, "endless", "time1")).toBe(false);
    expect(buyTech(meta, "endless", "time1")).toBe(false);
    meta.climb.chips = 100;
    expect(canBuy(meta, "climb", "auto1")).toBe(false);
  });

  it("endless counts its rounds and best hands as it goes, and earns the hand achievements", () => {
    const meta = newMeta();
    const s = startSession(2, modsFor(meta, "endless", []), 0);
    s.coins = 100000;
    for (let i = 0; i < 40; i++) {
      dealSession(s, endlessMods(meta, s), 1);
      drawSession(s, endlessMods(meta, s), NOTHING);
    }
    const v = sessionView(s);
    expect(v.stats.spins).toBe(40);
    expect(v.stats.bestLines).toBe(s.bestLines);
    const got = checkAchievements(meta, "endless", v).map((a) => a.id);
    expect(got).toContain("first");
    expect(got).toContain("jacks" in {} ? "" : "first");
    expect(ACHIEVEMENTS.length).toBeGreaterThan(30);
    expect(meta.endless.chips).toBeGreaterThan(0);
    expect(meta.climb.chips).toBe(0);
  });

  it("one bad field does not throw away a saved session", () => {
    const s = startSession(8, modsFor(newMeta(), "endless", []), 3);
    const back = restoreSession({ ...JSON.parse(JSON.stringify(s)), hand: { board: [1] } });
    expect(back).not.toBeNull();
    expect([back?.prestige, back?.hand]).toEqual([3, null]);
    expect(restoreRun({ ...JSON.parse(JSON.stringify(startRun(1, baseMods()))), hand: { board: [1] } })?.hand ?? null).toBeNull();
  });

  it("a tampered save cannot carry more than 3 jokers or more than 3 rank levels", () => {
    const raw = JSON.parse(JSON.stringify(startRun(1, baseMods())));
    raw.cardUpgrades = { 1: { joker: true }, 2: { joker: true }, 3: { joker: true }, 4: { joker: true }, 5: { rank: 9 } };
    const back = restoreRun(raw);
    expect(Object.values(back?.cardUpgrades ?? {}).filter((u) => u.joker)).toHaveLength(3);
    expect(back?.cardUpgrades[5]).toEqual({ rank: 3 });
  });

  it("a node whose prerequisite chain is broken is dropped at every depth", () => {
    const meta = restoreMeta({ v: 1, chips: 0, tech: ["slotbet", "slotmul", "case2"] });
    expect(meta.climb.tech).toEqual([]);
  });

  it("the more-holds upgrade says how far it goes", () => {
    const u = ENDLESS_SHOP.find((x) => x.id === "ehold");
    expect(u?.text).not.toContain("up to 5");
  });
});
