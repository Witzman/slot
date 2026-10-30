import { describe, expect, it } from "vitest";
import { ENDLESS_SHOP, MILESTONES, PRESTIGE_AT, buySessionUpgrade, canPrestige, endlessMods, prestige, prestigeMul, restoreSession, spinSession, startSession } from "../../src/game/endless";
import { buyTech, newMeta } from "../../src/game/meta";
import { baseMods } from "../../src/game/mods";

const meta = () => {
  const m = newMeta();
  m.endless.chips = 1000;
  return m;
};
const mods = (s = startSession(1, baseMods(), 0), m = newMeta()) => endlessMods(m, s);

describe("endless mode", () => {
  it("has no quota and no turn limit: it spins on and on", () => {
    const s = startSession(1, baseMods(), 0);
    const m = mods(s);
    for (let i = 0; i < 300; i++) expect(typeof spinSession(s, m, 1)).toBe("object");
    expect(s.spins).toBe(300);
    expect("quota" in s || "turnsLeft" in s).toBe(false);
  });

  it("a spin with fewer coins than the bet is free and base-sized, so it never soft-locks", () => {
    const s = startSession(1, baseMods(), 0);
    s.coins = 0;
    const res = spinSession(s, mods(s), 3);
    expect(typeof res).toBe("object");
    expect(s.coins).toBe((res as { payout: number }).payout);
    s.coins = 1;
    const before = s.coins;
    const two = spinSession(s, mods(s), 3);
    expect(s.coins).toBe(before + (two as { payout: number }).payout);
  });

  it("charges the bet otherwise, and refuses a bet above the max or below 1", () => {
    const s = startSession(1, baseMods(), 0);
    s.coins = 50;
    expect(spinSession(s, mods(s), 0)).toBe("bad-bet");
    expect(spinSession(s, mods(s), 99)).toBe("bad-bet");
    expect(spinSession(s, mods(s), 1.5)).toBe("bad-bet");
    expect(s.coins).toBe(50);
    const res = spinSession(s, mods(s), 2);
    expect(s.coins).toBe(48 + (res as { payout: number }).payout);
  });

  it("is a pure function of its seed and calls", () => {
    const play = () => {
      const s = startSession(9, baseMods(), 0);
      for (let i = 0; i < 120; i++) spinSession(s, mods(s), 1);
      return JSON.stringify(s);
    };
    expect(play()).toBe(play());
  });

  it("a free spin from scatters costs nothing and cannot win more free spins", () => {
    const s = startSession(2, baseMods(), 0);
    s.freeSpins = 2;
    s.coins = 10;
    const m = mods(s);
    m.weights = { ...m.weights, cherry: 0, lemon: 0, plum: 0, grape: 0, bell: 0, bar: 0, seven: 0, diamond: 0, wild: 0, coin: 1 };
    spinSession(s, m, 1);
    expect([s.coins, s.freeSpins]).toEqual([10, 1]);
  });

  it("raises milestones as the coins earned pass the thresholds, never lowering them", () => {
    const s = startSession(3, baseMods(), 0);
    s.totalEarned = (MILESTONES[2] as number) + 1;
    spinSession(s, mods(s), 1);
    expect(s.milestones).toBeGreaterThanOrEqual(3);
    const reached = s.milestones;
    s.coins = 0;
    spinSession(s, mods(s), 1);
    expect(s.milestones).toBeGreaterThanOrEqual(reached);
  });

  it("buys a session upgrade with coins at a rising cost, up to its max, and the board grows with it", () => {
    const s = startSession(4, baseMods(), 0);
    s.coins = 100000;
    const row = ENDLESS_SHOP.find((u) => u.id === "rowup");
    expect(row).toBeDefined();
    expect(mods(s).rows).toBe(3);
    expect(buySessionUpgrade(s, "rowup", mods(s))).toBe(true);
    expect(mods(s).rows).toBe(4);
    const paid = 100000 - s.coins;
    expect(paid).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) buySessionUpgrade(s, "rowup", mods(s));
    expect(mods(s).rows).toBe(6);
    expect(buySessionUpgrade(s, "nope", mods(s))).toBe(false);
    s.coins = 0;
    expect(buySessionUpgrade(s, "colup", mods(s))).toBe(false);
  });

  it("prestige is open only after the last milestone it needs", () => {
    const s = startSession(5, baseMods(), 0);
    expect(canPrestige(s)).toBe(false);
    s.milestones = PRESTIGE_AT - 1;
    expect(canPrestige(s)).toBe(false);
    s.milestones = PRESTIGE_AT;
    expect(canPrestige(s)).toBe(true);
  });

  it("prestige pays chips to endless only, keeps its tree and resets coins and upgrades", () => {
    const m = meta();
    buyTech(m, "endless", "purse1");
    const s = startSession(6, baseMods(), 0);
    s.milestones = PRESTIGE_AT;
    s.coins = 12345;
    s.upgrades = { rowup: 2, reels: 3 };
    const chipsBefore = m.endless.chips;
    const climbBefore = m.climb.chips;
    const paid = prestige(s, m);
    expect(paid).toBeGreaterThan(0);
    expect(m.endless.chips).toBe(chipsBefore + paid);
    expect(m.climb.chips).toBe(climbBefore);
    expect(m.endless.tech).toEqual(["purse1"]);
    expect([s.coins, s.upgrades, s.milestones, s.totalEarned, s.spins]).toEqual([endlessMods(m, s).startCoins, {}, 0, 0, 0]);
    expect(s.prestige).toBe(1);
    expect(m.endless.stats).toMatchObject({ sessions: 1, endings: { prestige: 1 } });
    expect(prestige(startSession(7, baseMods(), 0), m)).toBe(0);
  });

  it("the prestige multiplier raises the payout", () => {
    expect(prestigeMul(0)).toBe(1);
    expect(prestigeMul(2)).toBeGreaterThan(prestigeMul(1));
    const plain = endlessMods(newMeta(), startSession(1, baseMods(), 0));
    const boosted = endlessMods(newMeta(), startSession(1, baseMods(), 3));
    expect(boosted.slotWinMul).toBeGreaterThan(plain.slotWinMul);
  });

  it("the tree of endless is its own: climb nodes change nothing there", () => {
    const m = newMeta();
    m.climb.chips = 100;
    buyTech(m, "climb", "purse1");
    expect(endlessMods(m, startSession(1, baseMods(), 0)).startCoins).toBe(baseMods().startCoins);
  });

  it("restoreSession reads a saved session back and refuses garbage", () => {
    const s = startSession(8, baseMods(), 1);
    for (let i = 0; i < 20; i++) spinSession(s, mods(s), 1);
    expect(restoreSession(JSON.parse(JSON.stringify(s)))).toEqual(s);
    for (const raw of [null, 5, "x", [], {}, { rng: { s: "x" } }, { ...s, coins: "many" }]) expect(restoreSession(raw)).toBeNull();
    const odd = restoreSession({ ...JSON.parse(JSON.stringify(s)), upgrades: { rowup: 99, nope: 3, reels: -1 }, coins: -5, milestones: 999, prestige: -2 });
    expect(odd).not.toBeNull();
    expect(odd?.upgrades).toEqual({ rowup: 3 });
    expect(odd?.coins).toBeGreaterThanOrEqual(0);
    expect(odd?.milestones).toBeLessThanOrEqual(MILESTONES.length);
    expect(odd?.prestige).toBeGreaterThanOrEqual(0);
  });
});
