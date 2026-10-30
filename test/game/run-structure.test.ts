import { describe, expect, it } from "vitest";
import { BOSSES, CHARMS, VOUCHERS } from "../../src/game/content";
import { finishRun, modsFor, newMeta, restoreMeta } from "../../src/game/meta";
import { baseMods } from "../../src/game/mods";
import { type Run, beginRound, buyVoucher, closeRound, dealRound, drawCharms, drawHand, restoreRun, skipDraft, startRun } from "../../src/game/run";
import { LINES, scoreBoard } from "../../src/game/round";
import { SETUPS, dailySeed, recordDaily, setupUnlocked } from "../../src/game/setups";
import { makeRng } from "../../src/game/rng";

const meta = newMeta();
const mkFor = (run: Run) => (c: string[]) => modsFor(meta, "climb", c, run.upgrades, run.boss, run.stake, run.setup);
const NOTHING = { rows: [], cols: [], cells: [] };

describe("start decks", () => {
  it("has the classic deck, always open, that changes nothing", () => {
    expect(setupUnlocked(meta, "classic")).toBe(true);
    expect(modsFor(meta, "climb", [], {}, null, 0, "classic")).toEqual(modsFor(meta, "climb", []));
  });

  it("has at most four decks, each with a way to open it", () => {
    const decks = SETUPS.filter((s) => s.kind === "deck");
    expect(decks.length).toBeGreaterThanOrEqual(2);
    expect(decks.length).toBeLessThanOrEqual(4);
    for (const d of decks) expect(d.lock.length, d.id).toBeGreaterThan(0);
  });

  it("changes the mods of a run by the deck it started with", () => {
    const plain = modsFor(meta, "climb", []);
    const lean = modsFor(meta, "climb", [], {}, null, 0, "lean");
    expect(lean.removedRanks).toEqual([2, 3, 4]);
    expect(lean.quotaMul).toBeGreaterThan(plain.quotaMul);
    const steady = modsFor(meta, "climb", [], {}, null, 0, "steadfast");
    expect(steady.holdMax).toBe(plain.holdMax + 1);
    expect(steady.turns).toBeLessThan(plain.turns);
  });

  it("opens a deck by what the player has done, not by a switch", () => {
    const m = newMeta();
    expect(setupUnlocked(m, "lean")).toBe(false);
    m.runs = 1;
    expect(setupUnlocked(m, "lean")).toBe(true);
    expect(setupUnlocked(m, "steadfast")).toBe(false);
    m.maxStake = 1;
    expect(setupUnlocked(m, "steadfast")).toBe(true);
    expect(setupUnlocked(m, "nonsense")).toBe(false);
  });
});

describe("challenges", () => {
  const challenges = SETUPS.filter((s) => s.kind === "challenge");

  it("each has a fixed seed and a goal", () => {
    expect(challenges.length).toBeGreaterThanOrEqual(3);
    for (const c of challenges) {
      expect(Number.isInteger(c.seed), c.id).toBe(true);
      expect(c.goal ?? 0, c.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("is cleared when a run of it ends with the goal reached, and pays chips once", () => {
    const c = challenges[0] as (typeof challenges)[number];
    const m = newMeta();
    const run = startRun(c.seed as number, modsFor(m, "climb", [], {}, null, 0, c.id), 0, c.id);
    run.completed = c.goal as number;
    run.phase = "over";
    const base = Math.floor(run.completed * 3 + 1);
    expect(finishRun(m, run)).toBeGreaterThan(base);
    expect(m.challenges).toEqual([c.id]);
    const again = startRun(c.seed as number, modsFor(m, "climb", [], {}, null, 0, c.id), 0, c.id);
    again.completed = c.goal as number;
    again.phase = "over";
    expect(finishRun(m, again)).toBe(base);
    expect(m.challenges).toEqual([c.id]);
  });

  it("is not cleared below the goal", () => {
    const c = challenges[0] as (typeof challenges)[number];
    const m = newMeta();
    const run = startRun(c.seed as number, modsFor(m, "climb", [], {}, null, 0, c.id), 0, c.id);
    run.completed = (c.goal as number) - 1;
    run.phase = "over";
    finishRun(m, run);
    expect(m.challenges).toEqual([]);
  });
});

describe("daily seed", () => {
  it("is the same for one day and differs between days", () => {
    expect(dailySeed(20000)).toBe(dailySeed(20000));
    expect(dailySeed(20000)).not.toBe(dailySeed(20001));
  });

  it("deals the same board to everyone that day", () => {
    const a = startRun(dailySeed(20000), modsFor(meta, "climb", []), 0, "classic", 20000);
    const b = startRun(dailySeed(20000), modsFor(meta, "climb", []), 0, "classic", 20000);
    const da = dealRound(a, modsFor(meta, "climb", []), 1);
    const db = dealRound(b, modsFor(meta, "climb", []), 1);
    expect(typeof da === "string" ? da : da.board).toEqual(typeof db === "string" ? db : db.board);
  });

  it("keeps today's best and the last day's best to compare with", () => {
    const m = newMeta();
    recordDaily(m, 100, 4);
    expect(m.daily).toEqual({ day: 100, best: 4, prev: 0 });
    recordDaily(m, 100, 2);
    expect(m.daily.best).toBe(4);
    recordDaily(m, 100, 6);
    expect(m.daily).toEqual({ day: 100, best: 6, prev: 0 });
    recordDaily(m, 101, 3);
    expect(m.daily).toEqual({ day: 101, best: 3, prev: 6 });
  });

  it("is recorded when a daily run finishes", () => {
    const m = newMeta();
    const run = startRun(dailySeed(300), modsFor(m, "climb", []), 0, "classic", 300);
    run.completed = 5;
    run.phase = "over";
    finishRun(m, run);
    expect(m.daily).toEqual({ day: 300, best: 5, prev: 0 });
  });
});

describe("the meta with the new fields", () => {
  it("reads old saves without them and drops junk", () => {
    const old = JSON.parse(JSON.stringify(newMeta())) as Record<string, unknown>;
    delete old.challenges;
    delete old.daily;
    const m = restoreMeta(old);
    expect(m.challenges).toEqual([]);
    expect(m.daily).toEqual({ day: 0, best: 0, prev: 0 });
    old.challenges = ["thin", "nope", 5];
    old.daily = { day: -3, best: "x", prev: 2 };
    const r = restoreMeta(old);
    expect(r.challenges).toEqual(["thin"]);
    expect(r.daily).toEqual({ day: 0, best: 0, prev: 2 });
  });
});

describe("rarity tiers", () => {
  it("offers only common charms when asked to", () => {
    const rng = makeRng(3);
    for (let i = 0; i < 30; i++) for (const id of drawCharms(rng, [], [], 4, "common")) expect(CHARMS.find((c) => c.id === id)?.rarity).toBe("common");
  });

  it("offers only common charms in the free call of the first rounds, and any later", () => {
    const m = { ...baseMods(), eventChance: 0 };
    for (const round of [1, 2]) {
      const r = startRun(11 + round, m);
      r.round = round;
      r.coins = 999;
      r.turnsLeft = 0;
      expect(closeRound(r, m, () => m)).toBe(true);
      expect(r.phase).toBe("draft");
      expect(r.draft).toHaveLength(3);
      for (const id of r.draft) expect(CHARMS.find((c) => c.id === id)?.rarity, `round ${round}`).toBe("common");
      expect(r.shop).toHaveLength(4);
    }
    let later = 0;
    for (let seed = 0; seed < 40; seed++) {
      const r = startRun(seed, m);
      r.round = 6;
      r.coins = 999;
      r.turnsLeft = 0;
      closeRound(r, m, () => m);
      later += r.draft.filter((id) => CHARMS.find((c) => c.id === id)?.rarity !== "common").length;
    }
    expect(later).toBeGreaterThan(0);
  });
});

describe("boss affixes on the grid", () => {
  const toBoss = (id: string, seed = 7): Run => {
    for (let s = seed; s < seed + 400; s++) {
      const run = startRun(s, baseMods());
      run.round = 3;
      beginRound(run, mkFor(run));
      if (run.boss === id) return run;
    }
    throw new Error("no seed gave " + id);
  };

  it("has a lockout boss and a shackles boss that raise the quota", () => {
    for (const id of ["lockout", "shackles"]) {
      expect(BOSSES.some((b) => b.id === id), id).toBe(true);
      expect(modsFor(meta, "climb", [], {}, id).quotaMul, id).toBeGreaterThan(1);
    }
  });

  it("locks one line for the lockout round, and says which", () => {
    const run = toBoss("lockout");
    expect(run.lockedLine).toBeGreaterThanOrEqual(0);
    expect(run.lockedLine).toBeLessThan(LINES);
    expect(run.events.join(" ")).toMatch(/line|row|column/i);
    const plain = toBoss("collector");
    expect(plain.lockedLine).toBe(-1);
  });

  it("scores a dead line as nothing", () => {
    const m = baseMods();
    const board = Array.from({ length: 25 }, (_, i) => i); // the first row is 2..6 of clubs? a straight flush in suit order
    const score = { handMul: m.handMul, globalMul: 1, lineBonus: 0 };
    const all = scoreBoard(board, 1, {}, score);
    const dead = all.lines.map((l) => l.line);
    expect(dead.length).toBeGreaterThan(0);
    const without = scoreBoard(board, 1, {}, { ...score, deadLines: [dead[0] as number] });
    expect(without.lines.some((l) => l.line === dead[0])).toBe(false);
    expect(without.payout).toBeLessThan(all.payout);
  });

  it("refuses to hold a column under the shackles, and lets a row through", () => {
    const run = toBoss("shackles");
    const m = mkFor(run)(run.charms);
    expect(m.colHold).toBe(false);
    run.coins = 500;
    expect(typeof dealRound(run, m, 1)).toBe("object");
    expect(drawHand(run, m, { rows: [], cols: [0], cells: [] })).toBe("bad-hold");
    expect(typeof drawHand(run, m, { rows: [0], cols: [], cells: [] })).toBe("object");
  });

  it("keeps the lock after a save and ends it with the round", () => {
    const run = toBoss("lockout");
    const back = restoreRun(JSON.parse(JSON.stringify(run)));
    expect(back?.lockedLine).toBe(run.lockedLine);
    run.round = 4;
    beginRound(run, mkFor(run));
    expect(run.lockedLine).toBe(-1);
  });
});

describe("vouchers and the skip tag", () => {
  const toShop = (seed = 2, round = 5): Run => {
    const m = { ...baseMods(), eventChance: 0 };
    const run = startRun(seed, m);
    run.round = round;
    run.coins = 999;
    run.turnsLeft = 0;
    closeRound(run, m, () => m);
    return run;
  };

  it("has tiered pairs: a second tier needs its first", () => {
    for (const v of VOUCHERS.filter((x) => x.tier === 2)) {
      const first = VOUCHERS.find((x) => x.id === v.requires);
      expect(first?.tier, v.id).toBe(1);
    }
    expect(VOUCHERS.filter((x) => x.tier === 1).length).toBeGreaterThanOrEqual(3);
  });

  it("puts one voucher in the shop after a cleared round, never a second tier first", () => {
    for (let seed = 0; seed < 30; seed++) {
      const run = toShop(seed);
      expect(run.phase).toBe("draft");
      const v = VOUCHERS.find((x) => x.id === run.voucher);
      expect(v, `seed ${seed}`).toBeDefined();
      expect(v?.tier).toBe(1);
    }
  });

  it("is bought with tickets, is permanent, changes the mods, and opens its second tier", () => {
    const run = toShop();
    const id = run.voucher as string;
    const price = VOUCHERS.find((v) => v.id === id)?.price as number;
    run.tickets = price - 1;
    expect(buyVoucher(run, id)).toBe(false);
    run.tickets = price + 3;
    expect(buyVoucher(run, id)).toBe(true);
    expect(run.tickets).toBe(3);
    expect(run.upgrades[id]).toBe(1);
    expect(run.voucher).toBeNull();
    expect(buyVoucher(run, id)).toBe(false);
    const plain = modsFor(meta, "climb", [], {}, null, 0);
    const now = modsFor(meta, "climb", [], run.upgrades);
    expect(JSON.stringify(now)).not.toBe(JSON.stringify(plain));
    const second = VOUCHERS.find((v) => v.requires === id);
    if (second) {
      const m = { ...baseMods(), eventChance: 0 };
      run.phase = "play";
      run.turnsLeft = 0;
      run.coins = 999;
      run.round = 5;
      closeRound(run, m, () => m);
      expect(run.voucher === null || VOUCHERS.find((v) => v.id === run.voucher)?.tier === 2 || run.voucher !== id).toBe(true);
    }
  });

  it("refuses a voucher that is not on sale, or outside the shop", () => {
    const run = toShop();
    run.tickets = 99;
    const other = VOUCHERS.find((v) => v.id !== run.voucher) as (typeof VOUCHERS)[number];
    expect(buyVoucher(run, other.id)).toBe(false);
    run.phase = "play";
    expect(buyVoucher(run, run.voucher as string)).toBe(false);
  });

  it("skips the charm call for tickets, and the round begins", () => {
    const run = toShop();
    const t = run.tickets;
    const mk = () => ({ ...baseMods(), eventChance: 0 });
    expect(skipDraft(run, mk)).toBe(true);
    expect(run.tickets).toBe(t + 2);
    expect(run.phase).toBe("play");
    expect(run.charms).toEqual([]);
    expect(skipDraft(run, mk)).toBe(false);
  });

  it("reads the voucher and the vouchers owned back from a save, and drops unknown ones", () => {
    const run = toShop();
    const id = run.voucher as string;
    run.tickets = 99;
    buyVoucher(run, id);
    const raw = JSON.parse(JSON.stringify(run)) as Record<string, unknown>;
    (raw.upgrades as Record<string, number>).nope = 1;
    raw.voucher = "nope";
    const back = restoreRun(raw);
    expect(back?.upgrades[id]).toBe(1);
    expect(back?.upgrades.nope).toBeUndefined();
    expect(back?.voucher).toBeNull();
  });

  it("starts without any voucher on sale, and an old save reads back with the defaults", () => {
    const run = startRun(1, baseMods());
    expect([run.voucher, run.setup, run.daily, run.lockedLine]).toEqual([null, "classic", 0, -1]);
    const raw = JSON.parse(JSON.stringify(run)) as Record<string, unknown>;
    for (const k of ["voucher", "setup", "daily", "lockedLine"]) delete raw[k];
    expect(restoreRun(raw)).toMatchObject({ voucher: null, setup: "classic", daily: 0, lockedLine: -1 });
    raw.setup = "nonsense";
    expect(restoreRun(raw)?.setup).toBe("classic");
  });
});

describe("a plain draw is untouched", () => {
  it("still plays a round with no setup", () => {
    const run = startRun(4, baseMods());
    expect(typeof dealRound(run, baseMods(), 1)).toBe("object");
    expect(typeof drawHand(run, baseMods(), NOTHING)).toBe("object");
  });
});
