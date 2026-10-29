import { describe, expect, it } from "vitest";
import { type Meta, ACHIEVEMENTS, buyTech, canBuy, checkAchievements, fileRelic, finishRun, modsFor, newMeta, restoreMeta } from "../../src/game/meta";
import { CHARMS, RELICS, TECH } from "../../src/game/content";
import { baseMods } from "../../src/game/mods";
import { type Run, beginRound, canClose, closeRound, drawPoker, dropAt, drainEvents, pickCharm, quotaFor, rerollDraft, spinSlot, startRun, tickPusher } from "../../src/game/run";
import { makeRng } from "../../src/game/rng";

const mk = (charms: string[]) => modsFor(newMeta(), charms);

/** Plays a round or more the plain way: pull, draw, let the shelf run, close the round, take the first charm. */
function drive(run: Run, m = baseMods()): void {
  for (let i = 0; i < 600 && run.phase !== "over"; i++) {
    if (run.phase === "draft") {
      pickCharm(run, run.draft[0] as string, mk);
      continue;
    }
    if (run.poker.phase === "hold") {
      drawPoker(run, m);
    } else if (run.turnsLeft > 0 && run.coins >= m.slotLines) {
      spinSlot(run, m, 1);
      if (i % 2 === 0) dropAt(run, m, 5);
    } else {
      tickPusher(run, m, 60 * 30);
      if (!closeRound(run, m, mk)) tickPusher(run, m, 60);
    }
    tickPusher(run, m, 120);
    if (run.round >= 3) break;
  }
}

describe("a run", () => {
  it("starts with the coins, turns and quota of its round", () => {
    const run = startRun(1, baseMods());
    expect([run.coins, run.turnsLeft, run.quota, run.round, run.phase]).toEqual([40, 12, 15, 1, "play"]);
    expect(run.missions).toHaveLength(3);
  });

  it("a pull charges the bet, spends a turn, pours the win on the shelf and deals a free hand", () => {
    const run = startRun(3, baseMods());
    const res = spinSlot(run, baseMods(), 2);
    expect(typeof res).toBe("object");
    if (typeof res === "string") return;
    expect(run.coins).toBe(38);
    expect(run.turnsLeft).toBe(11);
    expect(run.pour.reduce((n, k) => n + (k === "gold" ? 5 : 1), 0)).toBe(res.payout);
    expect(run.poker.phase).toBe("hold");
    expect(run.poker.bet).toBe(2);
    expect(run.stats.spins).toBe(1);
  });

  it("a win reaches the wallet only after it has been pushed off the shelf", () => {
    const run = startRun(3, baseMods());
    const m = baseMods();
    run.pour = ["gold", "coin", "coin"];
    const coins = run.coins;
    const shelf = run.pusher.coins.length;
    tickPusher(run, m, 12);
    expect(run.pour).toHaveLength(0);
    expect(run.pusher.coins.length).toBeGreaterThanOrEqual(shelf + 3 - run.stats.pusherPaid);
    expect(run.coins).toBe(coins + run.stats.pusherPaid);
    let paid = 0;
    for (let i = 0; i < 60 * 90; i++) {
      if (i % 40 === 0) run.pour.push("coin");
      paid += tickPusher(run, m, 1);
    }
    expect(paid).toBeGreaterThan(0);
    expect(run.coins).toBe(coins + run.stats.pusherPaid);
  });

  it("refuses a bet above the max, without coins, or while a hand is open, and charges nothing", () => {
    const run = startRun(3, baseMods());
    const m = baseMods();
    expect(spinSlot(run, m, 4)).toBe("bad-bet");
    expect(spinSlot(run, m, 0)).toBe("bad-bet");
    run.coins = 0;
    expect(spinSlot(run, m, 1)).toBe("no-coins");
    run.coins = 10;
    expect(typeof spinSlot(run, m, 1)).toBe("object");
    expect(spinSlot(run, m, 1)).toBe("busy");
    expect(run.coins).toBe(9);
    expect(run.turnsLeft).toBe(11);
    run.turnsLeft = 0;
    run.poker.phase = "bet";
    expect(spinSlot(run, m, 1)).toBe("no-turns");
  });

  it("pours the poker win on the shelf when the draw ends the hand", () => {
    const run = startRun(11, baseMods());
    const m = baseMods();
    spinSlot(run, m, 3);
    run.pour = [];
    const coins = run.coins;
    const out = drawPoker(run, m);
    expect(out?.done).toBe(true);
    expect(run.coins).toBe(coins);
    expect(run.pour.reduce((n, k) => n + (k === "gold" ? 5 : 1), 0)).toBe(out?.pay);
    expect(run.stats.hands).toBe(1);
    expect(run.poker.phase).toBe("bet");
  });

  it("a drop costs a turn: a free drop first, then a coin", () => {
    const run = startRun(4, baseMods());
    run.freeDrops = 1;
    const coins = run.coins;
    dropAt(run, baseMods(), 5);
    expect([run.coins, run.freeDrops, run.turnsLeft]).toEqual([coins, 0, 11]);
    dropAt(run, baseMods(), 5);
    expect(run.coins).toBe(coins - 1);
    run.coins = 0;
    expect(dropAt(run, baseMods(), 5)).toBe("no-coins");
    run.turnsLeft = 0;
    expect(dropAt(run, baseMods(), 5)).toBe("no-turns");
  });

  it("pays coins that fall off the pusher, and a prize is counted for filing", () => {
    const run = startRun(4, baseMods());
    const m = baseMods();
    run.pusher.coins = [{ id: 1, x: 5, y: 12.2, kind: "gold" }, { id: 2, x: 3, y: 12.2, kind: "prize" }];
    const coins = run.coins;
    expect(tickPusher(run, m, 1)).toBe(5 + 2);
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

  it("closes a round only when the turns are gone (or nothing can be paid) and no hand is open", () => {
    const run = startRun(5, baseMods());
    const m = baseMods();
    expect(canClose(run, m)).toBe(false);
    run.turnsLeft = 1;
    spinSlot(run, m, 1);
    expect(canClose(run, m)).toBe(false); // hand open
    drawPoker(run, m);
    expect(canClose(run, m)).toBe(true);
    expect(closeRound(startRun(5, m), m, mk)).toBe(false);
  });

  it("closing a round pays the quota and offers three charms, or ends the run", () => {
    const rich = startRun(5, baseMods());
    rich.coins = 500;
    rich.turnsLeft = 0;
    expect(closeRound(rich, baseMods(), mk)).toBe(true);
    expect(rich.phase).toBe("draft");
    expect(rich.round).toBe(2);
    expect(rich.coins).toBe(500 - 15);
    expect(rich.draft).toHaveLength(3);

    const poor = startRun(5, baseMods());
    poor.coins = 5;
    poor.turnsLeft = 0;
    closeRound(poor, baseMods(), mk);
    expect([poor.phase, poor.overReason]).toEqual(["over", "quota"]);
  });

  it("coins still on the shelf are not counted against the quota", () => {
    const run = startRun(5, baseMods());
    run.coins = 14;
    run.turnsLeft = 0;
    run.pusher.coins = Array.from({ length: 50 }, (_, i) => ({ id: i, x: 5, y: 6, kind: "coin" as const }));
    closeRound(run, baseMods(), mk);
    expect(run.phase).toBe("over");
  });

  it("lets a player with no coins left close the round (and lose it)", () => {
    const run = startRun(8, baseMods());
    run.coins = 0;
    expect(canClose(run, baseMods())).toBe(true);
    closeRound(run, baseMods(), mk);
    expect(run.phase).toBe("over");
  });

  it("applies a picked charm to the next round and keeps the draft honest", () => {
    const run = startRun(5, baseMods());
    run.coins = 500;
    run.turnsLeft = 0;
    closeRound(run, baseMods(), mk);
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
    run.turnsLeft = 0;
    const meta = newMeta();
    meta.tech = ["purse1", "time1", "reroll"];
    closeRound(run, modsFor(meta, []), (c) => modsFor(meta, c));
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
    for (let i = 0; i < 6; i++) {
      spinSlot(run, baseMods(), 1);
      drawPoker(run, baseMods());
    }
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
    expect([run.turnsLeft, run.freeDrops]).toEqual([12, 2]);
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
    expect(modsFor(meta, []).startCoins).toBe(70);
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
    expect(modsFor(meta, []).startCoins).toBe(41);
  });
});

describe("pusher zones", () => {
  const pay = (run: Run, kinds: ("coin" | "gold")[], m = baseMods()): number => {
    run.pusher.coins = kinds.map((kind, i) => ({ id: i, x: 1 + i, y: 12.2, kind }));
    return tickPusher(run, m, 1);
  };

  it("starts in zone 1 and rises exactly at the heat thresholds, never above the max", async () => {
    const { ZONE_HEAT } = await import("../../src/game/run");
    const run = startRun(1, baseMods());
    const m = baseMods();
    expect(run.zone).toBe(1);
    pay(run, Array(ZONE_HEAT[0]! - 1).fill("coin"), m);
    expect(run.zone).toBe(1);
    pay(run, ["coin"], m);
    expect([run.zone, run.zoneHeat]).toEqual([2, 0]);
    expect(drainEvents(run).some((e) => e.startsWith("Zone 2"))).toBe(true);
    for (let i = 0; i < 10; i++) pay(run, Array(40).fill("gold"), m);
    expect(run.zone).toBe(m.zoneMax);
  });

  it("pays more per coin in a higher zone", () => {
    const run = startRun(1, baseMods());
    run.zone = 3;
    expect(pay(run, ["gold", "gold"])).toBe(2 * Math.round(5 * 1.4));
    run.zone = 1;
    expect(pay(run, ["gold"])).toBe(5);
  });

  it("drops a zone when a round closes", () => {
    const run = startRun(1, baseMods());
    run.zone = 3;
    run.coins = 100;
    run.turnsLeft = 0;
    closeRound(run, baseMods(), mk);
    expect([run.zone, run.zoneHeat]).toEqual([2, 0]);
  });

  it("cools down when the pusher pays nothing for a long time, and drops a zone when the heat is gone", () => {
    const run = startRun(1, baseMods());
    const m = baseMods();
    run.pusher.coins = [];
    run.zone = 2;
    run.zoneHeat = 2;
    tickPusher(run, m, 600);
    expect([run.zone, run.zoneHeat]).toEqual([2, 2]);
    tickPusher(run, m, 60 * 2);
    expect([run.zone, run.zoneHeat]).toEqual([2, 0]);
    tickPusher(run, m, 60);
    expect([run.zone, run.zoneHeat]).toEqual([1, 0]);
    tickPusher(run, m, 60 * 10);
    expect(run.zone).toBe(1);
  });

  it("is raised and widened by the tree and a charm", () => {
    const meta = newMeta();
    meta.tech = ["gold1", "free1", "zone4", "zone5"];
    expect(modsFor(meta, []).zoneMax).toBe(5);
    expect(modsFor(newMeta(), ["streak"]).zoneStep).toBeCloseTo(0.3);
  });

  it("reads an old save without zone fields as zone 1, and keeps a saved one", async () => {
    const { restoreRun } = await import("../../src/game/run");
    const raw = JSON.parse(JSON.stringify(startRun(1, baseMods())));
    delete raw.zone;
    delete raw.zoneHeat;
    delete raw.zoneIdle;
    expect(restoreRun(raw)).toMatchObject({ zone: 1, zoneHeat: 0, zoneIdle: 0 });
    raw.zone = 3;
    raw.zoneHeat = 5;
    expect(restoreRun(raw)).toMatchObject({ zone: 3, zoneHeat: 5 });
    raw.zone = 99;
    expect(restoreRun(raw)?.zone).toBe(5);
  });
});
