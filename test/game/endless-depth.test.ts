import { describe, expect, it } from "vitest";
import { ENDLESS_UPGRADES } from "../../src/game/content";
import { ASCEND_AT, AUTOBUY_AT, AUTOPRESTIGE_AT, OFFLINE_MAX_ROUNDS, PRESTIGE_AT, STAR_STEP, ascend, autoBuy, autoPrestigeDue, canAscend, dealSession, drawSession, endlessMods, gamble, playOffline, prestige, restoreSession, startSession, takeWin, type Session } from "../../src/game/endless";
import { buyTech, chipBonus, finishRun, modsFor, newMeta, restoreMeta } from "../../src/game/meta";
import { startRun } from "../../src/game/run";
import { baseMods } from "../../src/game/mods";

const treeMeta = (ids: string[]) => {
  const meta = newMeta();
  meta.endless.chips = 1000;
  for (let pass = 0; pass < 4; pass++) for (const id of ids) buyTech(meta, "endless", id);
  return meta;
};
const ALL = ["purse1", "auto1", "autobuy", "autoprest", "auto2", "gamble1", "gamble2"];
const sessionOf = (meta = treeMeta(ALL), seed = 1): { meta: ReturnType<typeof newMeta>; s: Session; m: ReturnType<typeof endlessMods> } => {
  const s = startSession(seed, modsFor(meta, "endless", []), 0);
  return { meta, s, m: endlessMods(meta, s) };
};

describe("auto-buy", () => {
  it("buys the cheapest upgrade that leaves 6 rounds of base bet, and nothing without the node or the milestone", () => {
    const { s, m } = sessionOf();
    s.coins = 10000;
    expect(autoBuy(s, m)).toBeNull(); // milestone 0
    s.milestones = AUTOBUY_AT;
    const cheapest = [...ENDLESS_UPGRADES].sort((a, b) => a.base - b.base)[0] as { id: string; base: number };
    expect(autoBuy(s, m)).toBe(cheapest.id);
    expect(s.upgrades[cheapest.id]).toBe(1);
    expect(s.coins).toBe(10000 - cheapest.base);
    const bare = sessionOf(treeMeta(["purse1", "auto1"]));
    bare.s.coins = 10000;
    bare.s.milestones = AUTOBUY_AT;
    expect(autoBuy(bare.s, bare.m)).toBeNull();
  });

  it("keeps the wallet it plays with, and skips a maxed upgrade", () => {
    const { s, m } = sessionOf();
    s.milestones = AUTOBUY_AT;
    s.coins = 60 + 19; // the cheapest costs 20: it would leave 59 < 60
    expect(autoBuy(s, m)).toBeNull();
    s.coins = 60 + 20;
    expect(autoBuy(s, m)).not.toBeNull();
    const cheapest = [...ENDLESS_UPGRADES].sort((a, b) => a.base - b.base)[0] as { id: string; max: number };
    s.upgrades[cheapest.id] = cheapest.max;
    s.coins = 100000;
    const next = autoBuy(s, m);
    expect(next).not.toBeNull();
    expect(next).not.toBe(cheapest.id);
  });
});

describe("auto-prestige", () => {
  it("waits for the node and for the milestone after the first one that opens prestige", () => {
    const { s, m } = sessionOf();
    s.milestones = PRESTIGE_AT;
    expect(autoPrestigeDue(s, m)).toBe(false);
    s.milestones = AUTOPRESTIGE_AT;
    expect(autoPrestigeDue(s, m)).toBe(true);
    const bare = sessionOf(treeMeta(["purse1", "auto1"]));
    bare.s.milestones = AUTOPRESTIGE_AT;
    expect(autoPrestigeDue(bare.s, bare.m)).toBe(false);
  });
});

describe("offline rounds", () => {
  it("play at half speed while the page was closed, at most 4 hours and the round cap", () => {
    const { s, m } = sessionOf();
    s.autoOn = true;
    s.coins = 100000;
    expect(m.autoRate).toBe(1);
    expect(playOffline(s, m, 60_000).rounds).toBe(30);
    const big = sessionOf();
    big.s.autoOn = true;
    big.s.coins = 100000;
    expect(playOffline(big.s, big.m, 1e12).rounds).toBeLessThanOrEqual(OFFLINE_MAX_ROUNDS);
  });

  it("does nothing without auto-play on, without the rate, or for a junk time", () => {
    const { s, m } = sessionOf();
    s.coins = 1000;
    expect(playOffline(s, m, 60_000)).toEqual({ rounds: 0, coins: 0 });
    s.autoOn = true;
    for (const t of [0, -5, NaN, Infinity]) expect(playOffline(s, m, t).rounds, String(t)).toBeLessThanOrEqual(t === Infinity ? OFFLINE_MAX_ROUNDS : 0);
    const bare = sessionOf(treeMeta([]));
    bare.s.autoOn = true;
    expect(playOffline(bare.s, bare.m, 60_000).rounds).toBe(0);
  });

  it("buys nothing and does not prestige, and is a pure function of the session", () => {
    const a = sessionOf();
    const b = sessionOf();
    for (const x of [a, b]) {
      x.s.autoOn = true;
      x.s.coins = 100000;
      x.s.milestones = AUTOPRESTIGE_AT;
    }
    const ra = playOffline(a.s, a.m, 600_000);
    expect(playOffline(b.s, b.m, 600_000)).toEqual(ra);
    expect(a.s.upgrades).toEqual({});
    expect(a.s.prestige).toBe(0);
    expect(a.s.coins).toBe(100000 + ra.coins);
  });

  it("keeps the time it was saved at", () => {
    const { s } = sessionOf();
    s.savedAt = 1_700_000_000_000;
    expect(restoreSession(JSON.parse(JSON.stringify(s)))?.savedAt).toBe(1_700_000_000_000);
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    raw.savedAt = -4;
    expect(restoreSession(raw)?.savedAt).toBe(0);
  });
});

describe("double or nothing", () => {
  /** A session with a win waiting: a paying draw is looked for. */
  const withWin = (m = sessionOf()): ReturnType<typeof sessionOf> => {
    m.s.coins = 100000;
    for (let i = 0; i < 400; i++) {
      dealSession(m.s, m.m, 1);
      drawSession(m.s, m.m, { rows: [], cols: [], cells: [] });
      if (m.s.gamble) return m;
    }
    throw new Error("no win in 400 rounds");
  };

  it("offers the win after a paying draw, with the tries the tree gave, and not without the node", () => {
    const m = withWin();
    expect(m.s.gamble?.left).toBe(3);
    expect(m.s.gamble?.stake).toBeGreaterThan(0);
    const bare = sessionOf(treeMeta(["purse1"]));
    bare.s.coins = 100000;
    for (let i = 0; i < 60; i++) {
      dealSession(bare.s, bare.m, 1);
      drawSession(bare.s, bare.m, { rows: [], cols: [], cells: [] });
    }
    expect(bare.s.gamble).toBeNull();
  });

  it("doubles a right call and loses a wrong one: the two colours are exact opposites", () => {
    const m = withWin();
    const copy = JSON.parse(JSON.stringify(m.s)) as Session;
    const stake = (m.s.gamble as { stake: number }).stake;
    const coins = m.s.coins;
    const r = gamble(m.s, "red");
    const b = gamble(copy, "black");
    if (r === "none" || b === "none") throw new Error("refused");
    expect(r.won).toBe(!b.won);
    const [win, lose] = r.won ? [m.s, copy] : [copy, m.s];
    expect(win.coins).toBe(coins + stake);
    expect(lose.coins).toBe(coins - stake);
    expect(lose.gamble).toBeNull();
  });

  it("lets the stake ride up to the tries: a win doubles the stake and takes a try", () => {
    const m = withWin();
    const stake = (m.s.gamble as { stake: number }).stake;
    for (let seed = 1; seed < 200; seed++) {
      const c = JSON.parse(JSON.stringify(m.s)) as Session;
      c.rng.s = seed;
      const res = gamble(c, "red");
      if (res !== "none" && res.won) {
        expect(c.gamble).toEqual({ stake: stake * 2, left: 2 });
        return;
      }
    }
    throw new Error("no win found");
  });

  it("ends with the last try, with taking the win, and with the next deal", () => {
    const m = withWin();
    takeWin(m.s);
    expect(m.s.gamble).toBeNull();
    expect(gamble(m.s, "red")).toBe("none");
    const n = withWin();
    dealSession(n.s, n.m, 1);
    expect(n.s.gamble).toBeNull();
    const last = withWin();
    (last.s.gamble as { left: number }).left = 1;
    for (let seed = 1; seed < 200; seed++) {
      const c = JSON.parse(JSON.stringify(last.s)) as Session;
      c.rng.s = seed;
      if ((gamble(c, "red") as { won: boolean }).won) {
        expect(c.gamble).toBeNull();
        return;
      }
    }
  });

  it("never bets more than the wallet holds, and refuses a colour that is not one", () => {
    const m = withWin();
    m.s.coins = 1;
    const before = m.s.gamble?.stake as number;
    expect(before).toBeGreaterThan(1);
    const res = gamble(m.s, "red");
    expect(m.s.coins === 2 || m.s.coins === 0).toBe(true);
    expect(res).not.toBe("none");
    expect(gamble(withWin().s, "green" as never)).toBe("none");
  });

  it("is kept by a save, and junk is dropped", () => {
    const m = withWin();
    expect(restoreSession(JSON.parse(JSON.stringify(m.s)))?.gamble).toEqual(m.s.gamble);
    const raw = JSON.parse(JSON.stringify(m.s)) as Record<string, unknown>;
    raw.gamble = { stake: -3, left: 9 };
    expect(restoreSession(raw)?.gamble).toBeNull();
    raw.gamble = { stake: 5, left: 9 };
    expect(restoreSession(raw)?.gamble).toEqual({ stake: 5, left: 3 });
  });
});

describe("achievements make chips bigger", () => {
  it("adds 1% of the chips of a prestige and of a run for each achievement", () => {
    const meta = treeMeta([]);
    expect(chipBonus(meta)).toBe(1);
    meta.ach = Array.from({ length: 20 }, (_, i) => `a${i}`);
    expect(chipBonus(meta)).toBeCloseTo(1.2);
    const s = startSession(1, modsFor(meta, "endless", []), 0);
    s.milestones = PRESTIGE_AT;
    expect(prestige(s, meta)).toBe(Math.floor(10 * 1.2));
    const run = startRun(1, baseMods());
    run.completed = 10;
    run.phase = "over";
    expect(finishRun(meta, run)).toBe(Math.floor(31 * 1.2));
  });
});

describe("prestige count and ascension", () => {
  it("keeps the prestige count in the meta, so a new session starts with it", () => {
    const meta = treeMeta([]);
    const s = startSession(1, modsFor(meta, "endless", []), 0);
    s.milestones = PRESTIGE_AT;
    prestige(s, meta);
    expect(meta.endless.prestiges).toBe(1);
    expect(s.prestige).toBe(1);
    expect(restoreMeta(JSON.parse(JSON.stringify(meta))).endless.prestiges).toBe(1);
    const lost = startSession(2, modsFor(meta, "endless", []), meta.endless.prestiges);
    lost.milestones = PRESTIGE_AT;
    prestige(lost, meta);
    expect(lost.prestige).toBe(2);
    expect(meta.endless.prestiges).toBe(2);
  });

  it("needs the prestiges and gives a star for the chips, the tree and the count", () => {
    const meta = treeMeta(["purse1"]);
    meta.endless.prestiges = ASCEND_AT - 1;
    expect(canAscend(meta)).toBe(false);
    expect(ascend(meta)).toBe(false);
    meta.endless.prestiges = ASCEND_AT;
    expect(canAscend(meta)).toBe(true);
    expect(ascend(meta)).toBe(true);
    expect(meta.endless).toMatchObject({ stars: 1, prestiges: 0, chips: 0, tech: [] });
    expect(ascend(meta)).toBe(false);
  });

  it("makes every Endless win pay more with each star, and leaves Climb alone", () => {
    const meta = treeMeta([]);
    const s = startSession(1, modsFor(meta, "endless", []), 0);
    const plain = endlessMods(meta, s).slotWinMul;
    meta.endless.stars = 2;
    expect(endlessMods(meta, s).slotWinMul).toBeCloseTo(plain * (1 + 2 * STAR_STEP));
    expect(modsFor(meta, "climb", []).slotWinMul).toBe(1);
  });

  it("reads stars and prestiges back from a save, and drops junk", () => {
    const meta = newMeta();
    meta.endless.stars = 3;
    meta.endless.prestiges = 2;
    const back = restoreMeta(JSON.parse(JSON.stringify(meta)));
    expect([back.endless.stars, back.endless.prestiges]).toEqual([3, 2]);
    const raw = JSON.parse(JSON.stringify(meta)) as { endless: Record<string, unknown> };
    raw.endless.stars = -1;
    raw.endless.prestiges = "x";
    expect(restoreMeta(raw).endless).toMatchObject({ stars: 0, prestiges: 0 });
  });
});

describe("the tree nodes of Endless depth", () => {
  it("are for Endless only, behind auto-play and purse", () => {
    const meta = newMeta();
    meta.climb.chips = 1000;
    meta.endless.chips = 1000;
    for (const id of ["autobuy", "autoprest", "gamble1", "gamble2"]) expect(buyTech(meta, "climb", id), `climb ${id}`).toBe(false);
    expect(buyTech(meta, "endless", "autobuy")).toBe(false); // needs auto1
    for (const id of ["purse1", "auto1", "autobuy", "autoprest", "gamble1", "gamble2"]) expect(buyTech(meta, "endless", id), id).toBe(true);
    const m = modsFor(meta, "endless", []);
    expect([m.autoBuy, m.autoPrestige, m.gamble]).toEqual([true, true, 3]);
  });
});
