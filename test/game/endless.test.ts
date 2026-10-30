import { describe, expect, it } from "vitest";
import { ENDLESS_SHOP, MILESTONES, PRESTIGE_AT, autoHold, buySessionCard, buySessionUpgrade, canPrestige, dealSession, drawSession, endlessMods, prestige, prestigeMul, restoreSession, startSession } from "../../src/game/endless";
import { buyTech, modsFor, newMeta } from "../../src/game/meta";
import { LINES, scoreBoard } from "../../src/game/round";

const NOTHING = { rows: [], cols: [], cells: [] };
const meta = () => {
  const m = newMeta();
  m.endless.chips = 1000;
  return m;
};
const fresh = (seed = 1, prest = 0) => {
  const m = newMeta();
  const s = startSession(seed, endlessMods(m, startSession(0, modsFor(m, "endless", []), 0)), prest);
  return { m, s, mods: () => endlessMods(m, s) };
};
function round(s: ReturnType<typeof fresh>["s"], mods: ReturnType<typeof fresh>["mods"], bet = 1) {
  const d = dealSession(s, mods(), bet);
  return typeof d === "string" ? d : drawSession(s, mods(), NOTHING);
}

describe("endless mode", () => {
  it("has no quota and no turn limit: it plays on and on", () => {
    const { s, mods } = fresh();
    for (let i = 0; i < 300; i++) expect(typeof round(s, mods)).toBe("object");
    expect(s.rounds).toBe(300);
    expect("quota" in s || "turnsLeft" in s).toBe(false);
  });

  it("a deal charges bet times 10 and the draw pays, and a second deal waits for the draw", () => {
    const { s, mods } = fresh();
    s.coins = 100;
    expect(typeof dealSession(s, mods(), 2)).toBe("object");
    expect(s.coins).toBe(80);
    expect(dealSession(s, mods(), 1)).toBe("busy");
    const res = drawSession(s, mods(), NOTHING);
    if (typeof res === "string") throw new Error(res);
    expect(s.coins).toBe(80 + res.payout);
    expect(drawSession(s, mods(), NOTHING)).toBe("no-hand");
  });

  it("a round the wallet cannot pay for is free and base-sized, so it never soft-locks", () => {
    const { s, mods } = fresh();
    s.coins = 3;
    const d = dealSession(s, mods(), 3);
    expect(typeof d).toBe("object");
    if (typeof d === "string") return;
    expect([s.coins, d.bet]).toEqual([3, 1]);
    const res = drawSession(s, mods(), NOTHING);
    if (typeof res === "string") throw new Error(res);
    expect(s.coins).toBe(3 + res.payout);
    s.coins = 12;
    expect(dealSession(s, mods(), 3)).toBe("no-coins"); // enough for a small bet: the player chooses it
    expect(s.coins).toBe(12);
  });

  it("refuses a bet above the max or below 1, and a hold that is not allowed", () => {
    const { s, mods } = fresh();
    s.coins = 500;
    expect(dealSession(s, mods(), 0)).toBe("bad-bet");
    expect(dealSession(s, mods(), 99)).toBe("bad-bet");
    expect(dealSession(s, mods(), 1.5)).toBe("bad-bet");
    dealSession(s, mods(), 1);
    expect(drawSession(s, mods(), { rows: [0, 1, 2], cols: [], cells: [] })).toBe("bad-hold");
    expect(drawSession(s, mods(), { rows: [], cols: [], cells: [3] })).toBe("bad-hold");
    expect(typeof drawSession(s, mods(), { rows: [0, 1], cols: [], cells: [] })).toBe("object");
  });

  it("is a pure function of its seed and calls", () => {
    const play = () => {
      const { s, mods } = fresh(9);
      for (let i = 0; i < 80; i++) round(s, mods);
      return JSON.stringify(s);
    };
    expect(play()).toBe(play());
  });

  it("raises milestones as the coins won pass the thresholds, never lowering them", () => {
    const { s, mods } = fresh(3);
    s.totalEarned = (MILESTONES[2] as number) - 1;
    for (let i = 0; i < 60 && s.milestones < 3; i++) round(s, mods);
    expect(s.milestones).toBeGreaterThanOrEqual(3);
    const reached = s.milestones;
    s.coins = 0;
    round(s, mods);
    expect(s.milestones).toBeGreaterThanOrEqual(reached);
  });

  it("buys a shop upgrade at a rising cost, up to its max, and it changes the mods", () => {
    const { s, mods } = fresh(4);
    s.coins = 1e9;
    expect(mods().holdMax).toBe(2);
    const hold = ENDLESS_SHOP.find((u) => u.id === "ehold");
    expect(hold).toBeDefined();
    expect(buySessionUpgrade(s, "ehold", mods())).toBe(true);
    expect(mods().holdMax).toBe(3);
    const paid = 1e9 - s.coins;
    expect(paid).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) buySessionUpgrade(s, "ehold", mods());
    expect(mods().holdMax).toBe(2 + (hold?.max ?? 0));
    expect(buySessionUpgrade(s, "nope", mods())).toBe(false);
    s.coins = 0;
    expect(buySessionUpgrade(s, "epay", mods())).toBe(false);
    const before = mods().slotWinMul;
    s.coins = 1e9;
    buySessionUpgrade(s, "epay", mods());
    expect(mods().slotWinMul).toBeGreaterThan(before);
  });

  it("buys card upgrades for the session, only of the kinds the endless tree unlocked", () => {
    const { m, s, mods } = fresh(5);
    s.coins = 1e6;
    expect(buySessionCard(s, 7, "rank", mods())).toBe(true);
    expect(s.cardUpgrades[7]).toEqual({ rank: 1 });
    expect(buySessionCard(s, 7, "gold", mods())).toBe(false);
    m.endless.chips = 100;
    buyTech(m, "endless", "golds");
    expect(buySessionCard(s, 7, "gold", mods())).toBe(true);
    s.coins = 0;
    expect(buySessionCard(s, 8, "rank", mods())).toBe(false);
  });

  it("prestige is open only after the milestone it needs", () => {
    const { s } = fresh(5);
    expect(canPrestige(s)).toBe(false);
    s.milestones = PRESTIGE_AT - 1;
    expect(canPrestige(s)).toBe(false);
    s.milestones = PRESTIGE_AT;
    expect(canPrestige(s)).toBe(true);
  });

  it("prestige pays chips to endless only, keeps its tree and resets coins, upgrades and cards", () => {
    const m = meta();
    buyTech(m, "endless", "purse1");
    const s = startSession(6, endlessMods(m, startSession(0, modsFor(m, "endless", []), 0)), 0);
    s.milestones = PRESTIGE_AT;
    s.coins = 12345;
    s.upgrades = { ehold: 2, epay: 3 };
    s.cardUpgrades = { 4: { gold: true } };
    const [chips0, climb0] = [m.endless.chips, m.climb.chips];
    const paid = prestige(s, m);
    expect(paid).toBeGreaterThan(0);
    expect(m.endless.chips).toBe(chips0 + paid);
    expect(m.climb.chips).toBe(climb0);
    expect(m.endless.tech).toEqual(["purse1"]);
    expect([s.upgrades, s.cardUpgrades, s.milestones, s.totalEarned, s.rounds, s.hand]).toEqual([{}, {}, 0, 0, 0, null]);
    expect(s.coins).toBe(endlessMods(m, s).startCoins);
    expect(s.prestige).toBe(1);
    expect(m.endless.stats).toMatchObject({ sessions: 1, endings: { prestige: 1 } });
    const early = startSession(7, endlessMods(m, s), 0);
    expect(prestige(early, m)).toBe(0);
  });

  it("the prestige multiplier raises the payout", () => {
    expect(prestigeMul(0)).toBe(1);
    expect(prestigeMul(2)).toBeGreaterThan(prestigeMul(1));
    const m = newMeta();
    const base = startSession(1, modsFor(m, "endless", []), 0);
    expect(endlessMods(m, { ...base, prestige: 3 }).slotWinMul).toBeGreaterThan(endlessMods(m, base).slotWinMul);
  });

  it("the tree of endless is its own: climb nodes change nothing there", () => {
    const m = newMeta();
    m.climb.chips = 100;
    buyTech(m, "climb", "purse1");
    const s = startSession(1, modsFor(m, "climb", []), 0);
    expect(endlessMods(m, s).startCoins).toBe(modsFor(newMeta(), "endless", []).startCoins);
  });

  it("auto-play holds the best paying line within the limit, or nothing", () => {
    const { s, mods } = fresh(8);
    s.coins = 1e6;
    for (let i = 0; i < 30; i++) {
      const d = dealSession(s, mods(), 1);
      if (typeof d === "string") throw new Error(d);
      const hold = autoHold(d.board, mods(), s.cardUpgrades);
      expect(hold.rows.length + hold.cols.length).toBeLessThanOrEqual(mods().holdMax);
      const paying = scoreBoard(d.board, 1, s.cardUpgrades, { handMul: mods().handMul, globalMul: 1, lineBonus: 0 }).lines;
      expect(hold.rows.length + hold.cols.length).toBe(paying.length > 0 ? 1 : 0);
      drawSession(s, mods(), hold);
    }
    expect(LINES).toBe(10);
  });

  it("restoreSession reads a saved session back and refuses garbage", () => {
    const { s, mods } = fresh(8, 1);
    for (let i = 0; i < 20; i++) round(s, mods);
    dealSession(s, mods(), 1);
    expect(restoreSession(JSON.parse(JSON.stringify(s)))).toEqual(s);
    for (const raw of [null, 5, "x", [], {}, { rng: { s: "x" } }, { ...s, coins: "many" }]) expect(restoreSession(raw)).toBeNull();
    const odd = restoreSession({ ...JSON.parse(JSON.stringify(s)), upgrades: { ehold: 99, nope: 3, epay: -1 }, cardUpgrades: { 99: { gold: true }, 3: { rank: 99 } }, coins: -5, milestones: 999, prestige: -2, hand: { board: [1] } });
    expect(odd).toBeNull();
    const ok = restoreSession({ ...JSON.parse(JSON.stringify(s)), hand: null, upgrades: { ehold: 99, nope: 3, epay: -1 }, cardUpgrades: { 99: { gold: true }, 3: { rank: 99 } }, coins: -5, milestones: 999, prestige: -2 });
    expect(ok?.upgrades).toEqual({ ehold: ENDLESS_SHOP.find((u) => u.id === "ehold")?.max });
    expect(ok?.cardUpgrades).toEqual({ 3: { rank: 12 } });
    expect([ok?.coins, ok?.milestones, ok?.prestige]).toEqual([0, MILESTONES.length, 0]);
  });
});
