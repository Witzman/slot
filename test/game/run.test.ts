import { describe, expect, it } from "vitest";
import { type Meta, ACHIEVEMENTS, buyTech, canBuy, checkAchievements, fileRelic, finishRun, modsFor, newMeta, restoreMeta } from "../../src/game/meta";
import { CHARMS, RELICS, TECH } from "../../src/game/content";
import { baseMods } from "../../src/game/mods";
import { type Run, beginRound, dealPoker, drawPoker, dropAt, drainEvents, pickCharm, quotaFor, rerollDraft, spinSlot, startRun, tickPusher } from "../../src/game/run";
import { makeRng } from "../../src/game/rng";

const mk = (charms: string[]) => modsFor(newMeta(), charms);

function drive(run: Run, m = baseMods()): void {
  // a plain player: poker at bet 1, then slots, then pusher
  for (let i = 0; i < 400 && run.phase === "play"; i++) {
    if (run.poker.phase === "hold") {
      drawPoker(run, m, mk);
      continue;
    }
    const k = i % 3;
    if (k === 0) dealPoker(run, m, 1);
    else if (k === 1) spinSlot(run, m, 1, mk);
    else dropAt(run, m, 5, mk);
    tickPusher(run, m, 300, mk);
  }
}

describe("a run", () => {
  it("starts with the coins, turns and quota of its round", () => {
    const run = startRun(1, baseMods());
    expect([run.coins, run.turnsLeft, run.quota, run.round, run.phase]).toEqual([30, 10, 18, 1, "play"]);
    expect(run.missions).toHaveLength(3);
  });

  it("charges a spin, spends a turn and pays the lines", () => {
    const run = startRun(3, baseMods());
    const before = run.coins;
    const res = spinSlot(run, baseMods(), 2, mk);
    expect(typeof res).toBe("object");
    if (typeof res === "string") return;
    expect(run.coins).toBe(before - 2 + res.payout);
    expect(run.turnsLeft).toBe(9);
    expect(run.stats.spins).toBe(1);
  });

  it("refuses a bet above the max, without coins, or while a hand is open, and charges nothing", () => {
    const run = startRun(3, baseMods());
    const m = baseMods();
    expect(spinSlot(run, m, 4, mk)).toBe("bad-bet");
    expect(spinSlot(run, m, 0, mk)).toBe("bad-bet");
    expect(dealPoker(run, m, 1)).toBeNull();
    expect(spinSlot(run, m, 1, mk)).toBe("busy");
    expect(dealPoker(run, m, 1)).toBe("busy");
    run.coins = 0;
    run.poker.phase = "bet";
    expect(dealPoker(run, m, 1)).toBe("no-coins");
    expect(run.turnsLeft).toBe(9);
  });

  it("pays a poker hand when the draw ends it", () => {
    const run = startRun(11, baseMods());
    const m = baseMods();
    dealPoker(run, m, 3);
    const coins = run.coins;
    const out = drawPoker(run, m, mk);
    expect(out?.done).toBe(true);
    expect(run.coins).toBe(coins + (out?.pay ?? -1));
    expect(run.stats.hands).toBe(1);
  });

  it("uses a free drop before a coin", () => {
    const run = startRun(4, baseMods());
    run.freeDrops = 1;
    const coins = run.coins;
    dropAt(run, baseMods(), 5, mk);
    expect([run.coins, run.freeDrops]).toEqual([coins, 0]);
    dropAt(run, baseMods(), 5, mk);
    expect(run.coins).toBe(coins - 1);
  });

  it("pays coins that fall off the pusher, and a prize is counted for filing", () => {
    const run = startRun(4, baseMods());
    const m = baseMods();
    run.pusher.coins = [{ id: 1, x: 5, y: 12.2, kind: "gold" }, { id: 2, x: 3, y: 12.2, kind: "prize" }];
    const coins = run.coins;
    expect(tickPusher(run, m, 1, mk)).toBe(5 + 2);
    expect(run.coins).toBe(coins + 7);
    expect(run.found).toBe(1);
  });

  it("is a pure function of its seed", () => {
    const a = startRun(77, baseMods());
    const b = startRun(77, baseMods());
    drive(a);
    drive(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("ends a round when the turns run out: pays the quota and offers three charms, or ends the run", () => {
    const rich = startRun(5, baseMods());
    rich.coins = 500;
    rich.turnsLeft = 1;
    spinSlot(rich, baseMods(), 1, mk);
    expect(rich.phase).toBe("draft");
    expect(rich.round).toBe(2);
    expect(rich.coins).toBeLessThan(500 - 17);
    expect(rich.draft).toHaveLength(3);

    const poor = startRun(5, baseMods());
    poor.coins = 5;
    poor.turnsLeft = 1;
    spinSlot(poor, baseMods(), 1, mk);
    expect([poor.phase, poor.overReason]).toEqual(["over", "quota"]);
  });

  it("does not end a round while a poker hand is open", () => {
    const run = startRun(6, baseMods());
    run.turnsLeft = 1;
    run.coins = 100;
    dealPoker(run, baseMods(), 1);
    expect(run.turnsLeft).toBe(0);
    expect(run.phase).toBe("play");
    drawPoker(run, baseMods(), mk);
    expect(run.phase).not.toBe("play");
  });

  it("busts when there is nothing left to play with", () => {
    const run = startRun(8, baseMods());
    run.coins = 1;
    spinSlot(run, baseMods(), 1, mk);
    if (run.coins < 1) expect([run.phase, run.overReason]).toEqual(["over", "bust"]);
  });

  it("applies a picked charm to the next round and keeps the draft honest", () => {
    const run = startRun(5, baseMods());
    run.coins = 500;
    run.turnsLeft = 1;
    spinSlot(run, baseMods(), 1, mk);
    expect(pickCharm(run, "not-offered", mk)).toBe(false);
    const id = run.draft[0] as string;
    expect(pickCharm(run, id, mk)).toBe(true);
    expect(run.phase).toBe("play");
    expect(run.charms).toEqual([id]);
    expect(run.quota).toBe(quotaFor(2, mk([id])));
    expect(pickCharm(run, id, mk)).toBe(false);
  });

  it("re-draws the draft only as often as the tree allows", () => {
    const run = startRun(5, baseMods());
    run.coins = 500;
    run.turnsLeft = 1;
    const meta = newMeta();
    meta.tech = ["purse1", "time1", "reroll"];
    spinSlot(run, modsFor(meta, []), 1, (c) => modsFor(meta, c));
    const first = [...run.draft];
    expect(rerollDraft(run)).toBe(true);
    expect(run.draft.some((d) => first.includes(d))).toBe(false);
    expect(rerollDraft(run)).toBe(false);
  });

  it("gives each charm a real effect on the mods", () => {
    for (const c of CHARMS) {
      const m = baseMods();
      c.effect(m);
      expect(JSON.stringify(m), c.id).not.toBe(JSON.stringify(baseMods()));
    }
  });

  it("raises the quota every round", () => {
    const q = [1, 2, 3, 4, 5].map((r) => quotaFor(r, baseMods()));
    expect(q).toEqual([...q].sort((a, b) => a - b));
    expect(new Set(q).size).toBe(5);
  });

  it("completes missions and says so", () => {
    const run = startRun(2, baseMods());
    run.missions = [{ id: "spin6", done: false }];
    run.coins = 500;
    for (let i = 0; i < 6; i++) spinSlot(run, baseMods(), 1, mk);
    expect(run.missions[0]?.done).toBe(true);
    expect(run.chipsPending).toBe(1);
    expect(drainEvents(run).some((e) => e.startsWith("Mission done"))).toBe(true);
    expect(drainEvents(run)).toEqual([]);
  });

  it("beginRound resets turns and grants free drops from the mods", () => {
    const run = startRun(2, baseMods());
    const m = baseMods();
    m.freeDropsPerRound = 2;
    run.turnsLeft = 0;
    beginRound(run, m);
    expect([run.turnsLeft, run.freeDrops]).toEqual([10, 2]);
  });
});

describe("the meta game", () => {
  it("tree: nothing is bought without chips or its prerequisite, and a node is bought once", () => {
    const meta = newMeta();
    expect(canBuy(meta, "purse1")).toBe(false);
    meta.chips = 100;
    expect(canBuy(meta, "purse2")).toBe(false);
    expect(buyTech(meta, "purse1")).toBe(true);
    expect(buyTech(meta, "purse1")).toBe(false);
    expect(buyTech(meta, "purse2")).toBe(true);
    expect(meta.chips).toBe(100 - 3 - 8);
    expect(modsFor(meta, []).startCoins).toBe(60);
  });

  it("tree: every node can be reached and has an effect", () => {
    const ids = new Set(TECH.map((t) => t.id));
    for (const t of TECH) {
      expect(t.requires.every((r) => ids.has(r)), t.id).toBe(true);
      const m = baseMods();
      t.effect(m);
      expect(JSON.stringify(m), t.id).not.toBe(JSON.stringify(baseMods()));
    }
    const meta = newMeta();
    meta.chips = 10_000;
    for (let pass = 0; pass < TECH.length; pass++) for (const t of TECH) buyTech(meta, t.id);
    expect(meta.tech).toHaveLength(TECH.length);
  });

  it("restores a saved meta, and survives garbage", () => {
    const meta = newMeta();
    meta.chips = 12;
    meta.tech = ["purse1"];
    meta.relics = ["penny"];
    expect(restoreMeta(JSON.parse(JSON.stringify(meta)))).toEqual(meta);
    expect(restoreMeta(null)).toEqual(newMeta());
    expect(restoreMeta("x")).toEqual(newMeta());
    expect(restoreMeta({ v: 2 })).toEqual(newMeta());
    const odd = restoreMeta({ v: 1, chips: -4, tech: ["purse2", "nope", "purse1", "purse1"], relics: [5, "dice"], ach: ["first", "x"] });
    expect(odd.chips).toBe(0);
    expect(odd.tech).toEqual(["purse2", "purse1"].filter((t) => t === "purse1" || odd.tech.includes("purse1")));
    expect(odd.relics).toEqual(["dice"]);
    expect(odd.ach).toEqual(["first"]);
  });

  it("drops a saved node whose prerequisite is missing", () => {
    expect(restoreMeta({ v: 1, tech: ["purse2"] }).tech).toEqual([]);
  });

  it("files relics without repeats until all are found", () => {
    const meta: Meta = newMeta();
    const rng = makeRng(1);
    const got = new Set<string | null>();
    const base = RELICS.filter((r) => !r.craft).length;
    for (let i = 0; i < base; i++) got.add(fileRelic(meta, rng));
    expect(got.size).toBe(base);
    expect(fileRelic(meta, rng)).toBeNull();
  });

  it("pays a finished run once", () => {
    const meta = newMeta();
    const run = startRun(1, baseMods());
    run.completed = 2;
    run.round = 3;
    run.chipsPending = 3;
    expect(finishRun(meta, run)).toBe(2 * 3 + 1 + 3);
    expect(finishRun(meta, run)).toBe(0);
    expect([meta.chips, meta.runs, meta.bestRound]).toEqual([10, 1, 3]);
  });

  it("unlocks achievements once and pays their chips", () => {
    const meta = newMeta();
    const run = startRun(1, baseMods());
    run.stats.spins = 1;
    run.round = 5;
    const fresh = checkAchievements(meta, run).map((a) => a.id);
    expect(fresh).toEqual(expect.arrayContaining(["first", "r3", "r5"]));
    const chips = meta.chips;
    expect(chips).toBeGreaterThan(0);
    expect(checkAchievements(meta, run)).toEqual([]);
    expect(meta.chips).toBe(chips);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

describe("saving a run", () => {
  it("round-trips through JSON and keeps playing the same", async () => {
    const { restoreRun } = await import("../../src/game/run");
    const a = startRun(31, baseMods());
    drive(a);
    a.events = []; // messages and unfiled prizes are not saved: the app drains them after every action
    a.found = 0;
    const b = restoreRun(JSON.parse(JSON.stringify(a)));
    expect(b).toEqual(a);
  });

  it("refuses what is not a run", async () => {
    const { restoreRun } = await import("../../src/game/run");
    expect(restoreRun(null)).toBeNull();
    expect(restoreRun({})).toBeNull();
    const bad = JSON.parse(JSON.stringify(startRun(1, baseMods())));
    bad.charms = ["nope"];
    expect(restoreRun(bad)).toBeNull();
  });
});

describe("run upgrades", () => {
  it("buys levels with coins at rising cost, up to the max, and they change the mods", async () => {
    const { buyUpgrade } = await import("../../src/game/run");
    const { UPGRADES, upgradeCost } = await import("../../src/game/content");
    const run = startRun(1, baseMods());
    run.coins = 1000;
    const u = UPGRADES[0]!;
    for (let l = 0; l < u.max; l++) {
      const before = run.coins;
      expect(buyUpgrade(run, u.id)).toBe(true);
      expect(before - run.coins).toBe(upgradeCost(u, l));
    }
    expect(buyUpgrade(run, u.id)).toBe(false);
    expect(modsFor(newMeta(), [], run.upgrades).slotWinMul).toBeCloseTo(1 + 0.1 * u.max);
  });

  it("refuses without coins, unknown ids and outside a round, and charges nothing", async () => {
    const { buyUpgrade } = await import("../../src/game/run");
    const run = startRun(1, baseMods());
    run.coins = 1;
    expect(buyUpgrade(run, "reels")).toBe(false);
    expect(buyUpgrade(run, "nope")).toBe(false);
    run.coins = 100;
    run.phase = "draft";
    expect(buyUpgrade(run, "reels")).toBe(false);
    expect(run.coins).toBe(100);
  });

  it("gives every upgrade a real effect", async () => {
    const { UPGRADES } = await import("../../src/game/content");
    for (const u of UPGRADES) {
      const m = baseMods();
      u.effect(m, 1);
      expect(JSON.stringify(m), u.id).not.toBe(JSON.stringify(baseMods()));
    }
  });

  it("keeps levels through a save and drops bad ones", async () => {
    const { restoreRun, buyUpgrade } = await import("../../src/game/run");
    const run = startRun(1, baseMods());
    run.coins = 100;
    buyUpgrade(run, "gilding");
    const saved = JSON.parse(JSON.stringify(run));
    expect(restoreRun(saved)?.upgrades).toEqual({ gilding: 1 });
    saved.upgrades = { gilding: 99, reels: "x", nope: 1 };
    expect(restoreRun(saved)?.upgrades).toEqual({});
  });
});

describe("crafting relics", () => {
  it("combines two owned relics into a new one, keeps the ingredients, in either order", async () => {
    const { combine } = await import("../../src/game/meta");
    const meta = newMeta();
    meta.relics = ["penny", "horse"];
    expect(combine(meta, "horse", "penny")).toEqual({ kind: "new", id: "luckycharm" });
    expect(meta.relics).toEqual(["penny", "horse", "luckycharm"]);
    expect(combine(meta, "penny", "horse")).toEqual({ kind: "known", id: "luckycharm" });
  });

  it("does nothing for a pair without a recipe, the same relic twice or one not owned", async () => {
    const { combine } = await import("../../src/game/meta");
    const meta = newMeta();
    meta.relics = ["penny", "horse", "dice"];
    expect(combine(meta, "penny", "dice").kind).toBe("none");
    expect(combine(meta, "penny", "penny").kind).toBe("missing");
    expect(combine(meta, "penny", "eye").kind).toBe("missing");
    expect(meta.relics).toHaveLength(3);
  });

  it("chains: a crafted relic is an ingredient", async () => {
    const { combine } = await import("../../src/game/meta");
    const meta = newMeta();
    meta.relics = ["bell", "tooth", "crown"];
    combine(meta, "bell", "tooth");
    combine(meta, "crown", "tooth");
    expect(combine(meta, "goldbell", "throne")).toEqual({ kind: "new", id: "grand" });
  });

  it("every recipe uses known relics, and no pusher prize is a crafted one", async () => {
    const { fileRelic } = await import("../../src/game/meta");
    const ids = new Set(RELICS.map((r) => r.id));
    for (const r of RELICS) if (r.craft) expect(r.craft.every((i) => ids.has(i)), r.id).toBe(true);
    const meta = newMeta();
    const rng = makeRng(3);
    for (let i = 0; i < 30; i++) fileRelic(meta, rng);
    expect(meta.relics.every((id) => !RELICS.find((r) => r.id === id)?.craft)).toBe(true);
    expect(meta.relics).toHaveLength(RELICS.filter((r) => !r.craft).length);
  });

  it("pays a start coin for every two relics", () => {
    const meta = newMeta();
    meta.relics = ["penny", "dice", "tooth"];
    expect(modsFor(meta, []).startCoins).toBe(31);
  });
});
