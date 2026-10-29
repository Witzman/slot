import { describe, expect, it } from "vitest";
import { type Meta, ACHIEVEMENTS, buyTech, canBuy, checkAchievements, fileRelic, finishRun, modsFor, newMeta, restoreMeta } from "../../src/game/meta";
import { CHARMS, RELICS, TECH } from "../../src/game/content";
import { baseMods as realBase } from "../../src/game/mods";

/** Tests that are not about events switch them off, so no seed decides what they see. */
const baseMods = () => {
  const m = realBase();
  m.eventChance = 0;
  return m;
};
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
    expect([run.coins, run.turnsLeft, run.quota, run.round, run.phase]).toEqual([50, 12, 14, 1, "play"]);
    expect(run.missions).toHaveLength(3);
  });

  it("a pull charges the bet, spends a turn, pours the win on the shelf and deals a free hand", () => {
    const run = startRun(3, baseMods());
    const res = spinSlot(run, baseMods(), 2);
    expect(typeof res).toBe("object");
    if (typeof res === "string") return;
    expect(run.coins).toBe(48);
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
    expect(rich.coins).toBe(500 - quotaFor(1, baseMods()));
    expect(rich.draft).toHaveLength(3);

    const poor = startRun(5, baseMods());
    poor.coins = 5;
    poor.turnsLeft = 0;
    closeRound(poor, baseMods(), mk);
    expect([poor.phase, poor.overReason]).toEqual(["over", "quota"]);
  });

  it("coins still on the shelf are not counted against the quota", () => {
    const run = startRun(5, baseMods());
    run.coins = 13;
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
    const quiet = modsFor(meta, []);
    quiet.eventChance = 0;
    closeRound(run, quiet, (c) => modsFor(meta, c));
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
    beginRound(run, () => m);
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
    expect(modsFor(meta, []).startCoins).toBe(80);
  });

  it("tree: every node can be reached and has an effect", () => {
    const ids = new Set(TECH.map((t) => t.id));
    for (const t of TECH) {
      expect(t.requires.every((r) => ids.has(r)), t.id).toBe(true);
      const m = baseMods();
      t.effect(m);
      if (t.id !== "case1" && t.id !== "case2") expect(JSON.stringify(m), t.id).not.toBe(JSON.stringify(baseMods())); // the cases add relic slots, not mods
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
    expect(modsFor(meta, []).startCoins).toBe(51);
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

describe("charm shop and tickets", () => {
  const atCall = (seed = 5): Run => {
    const run = startRun(seed, baseMods());
    run.coins = 500;
    run.turnsLeft = 0;
    closeRound(run, baseMods(), mk);
    return run;
  };

  it("gives a ticket for a cleared round, and offers a call of three and a shop of four that do not overlap", () => {
    const run = atCall();
    expect(run.tickets).toBe(1);
    expect(run.draft).toHaveLength(3);
    expect(run.shop).toHaveLength(4);
    expect(new Set([...run.draft, ...run.shop]).size).toBe(7);
  });

  it("gives a ticket for a mission and for a coin scatter", () => {
    const run = startRun(2, baseMods());
    run.missions = [{ id: "spin6", done: false }];
    run.coins = 500;
    for (let i = 0; i < 6; i++) {
      spinSlot(run, baseMods(), 1);
      drawPoker(run, baseMods());
    }
    expect(run.tickets).toBeGreaterThanOrEqual(1); // the mission, plus any scatter
    const w = baseMods();
    w.weights = { ...w.weights, cherry: 0, lemon: 0, bell: 0, bar: 0, seven: 0, wild: 0, coin: 1 };
    const scatter = startRun(2, w);
    spinSlot(scatter, w, 1);
    expect(scatter.tickets).toBe(1);
  });

  it("buys a charm with tickets at its rarity price, once, and it joins the run", async () => {
    const { charmPrice, buyCharm } = await import("../../src/game/run");
    const run = atCall();
    const id = run.shop[0] as string;
    run.tickets = 10;
    const price = charmPrice(id);
    expect(buyCharm(run, id)).toBe(true);
    expect(run.tickets).toBe(10 - price);
    expect(run.charms).toEqual([id]);
    expect(run.shop).not.toContain(id);
    expect(buyCharm(run, id)).toBe(false);
  });

  it("refuses without tickets, for a charm not in the shop and outside the call screen", async () => {
    const { buyCharm } = await import("../../src/game/run");
    const run = atCall();
    run.tickets = 0;
    expect(buyCharm(run, run.shop[0] as string)).toBe(false);
    run.tickets = 99;
    expect(buyCharm(run, "nope")).toBe(false);
    expect(buyCharm(run, run.draft[0] as string)).toBe(false);
    run.phase = "play";
    expect(buyCharm(run, run.shop[0] as string)).toBe(false);
    expect(run.tickets).toBe(99);
  });

  it("re-stocks the shop for a rising price that starts over each round", async () => {
    const { rerollShop, shopRerollPrice } = await import("../../src/game/run");
    const run = atCall();
    run.tickets = 10;
    const before = [...run.shop];
    expect(shopRerollPrice(run)).toBe(1);
    expect(rerollShop(run)).toBe(true);
    expect(run.tickets).toBe(9);
    expect(shopRerollPrice(run)).toBe(2);
    expect(run.shop).toHaveLength(4);
    expect(run.shop.some((c) => run.draft.includes(c))).toBe(false);
    expect(run.shop).not.toEqual(before);
    run.tickets = 1;
    expect(rerollShop(run)).toBe(false);
  });

  it("never offers an owned charm, and picking from the call clears the shop", () => {
    const run = atCall();
    const id = run.draft[0] as string;
    pickCharm(run, id, mk);
    expect(run.shop).toEqual([]);
    run.coins = 500;
    run.turnsLeft = 0;
    closeRound(run, mk(run.charms), mk);
    expect([...run.draft, ...run.shop]).not.toContain(id);
  });

  it("draws by rarity: commons far more often than rares", async () => {
    const { drawCharms } = await import("../../src/game/run");
    const rng = makeRng(1);
    const count = { common: 0, uncommon: 0, rare: 0 };
    for (let i = 0; i < 2000; i++) for (const id of drawCharms(rng, [], [], 1)) count[CHARMS.find((c) => c.id === id)!.rarity]++;
    expect(count.common).toBeGreaterThan(count.rare * 4);
  });

  it("has at least 36 charms, every id unique, each with a real effect", () => {
    expect(CHARMS.length).toBeGreaterThanOrEqual(36);
    expect(new Set(CHARMS.map((c) => c.id)).size).toBe(CHARMS.length);
  });

  it("restores a save from before the shop", async () => {
    const { restoreRun } = await import("../../src/game/run");
    const raw = JSON.parse(JSON.stringify(startRun(1, baseMods())));
    delete raw.tickets;
    delete raw.shop;
    delete raw.shopRerolls;
    expect(restoreRun(raw)).toMatchObject({ tickets: 0, shop: [], shopRerolls: 0 });
    raw.shop = ["clover", "bogus"];
    expect(restoreRun(raw)?.shop).toEqual(["clover"]);
  });
});

describe("symbol charms", () => {
  it("multiply the pay of one symbol and leave the others", async () => {
    const { evaluate } = await import("../../src/game/slot");
    const g = [["lemon", "bar", "bell"], ["cherry", "cherry", "cherry"], ["bar", "lemon", "bell"]] as const;
    const grid = g.map((r) => [...r]) as Parameters<typeof evaluate>[0];
    expect(evaluate(grid, 3, 1).payout).toBe(4);
    expect(evaluate(grid, 3, 1, { cherry: 3 }).payout).toBe(12);
    expect(evaluate(grid, 3, 1, { lemon: 9 }).payout).toBe(4);
  });

  it("keep the slot return in a sane range with every symbol charm at once", async () => {
    const { spin } = await import("../../src/game/slot");
    const m = modsFor(newMeta(), ["cherrypick", "lemonade", "bellringer", "barfly", "sevenheaven"]);
    const rng = makeRng(321);
    let paid = 0;
    const n = 40000;
    for (let i = 0; i < n; i++) paid += spin(rng, 1, 1, m.weights, m.symPay).payout;
    expect(paid / n).toBeGreaterThan(1);
    expect(paid / n).toBeLessThan(2.5);
  });
});

describe("bosses", () => {
  const meta = newMeta();
  const mkBoss = (run: Run) => (c: string[]) => modsFor(meta, c, run.upgrades, run.boss, run.stake);

  const toRound = (round: number, seed = 5): Run => {
    const run = startRun(seed, baseMods());
    run.round = round;
    beginRound(run, mkBoss(run));
    return run;
  };

  it("makes every third round a boss round and no other", async () => {
    const { BOSS_EVERY } = await import("../../src/game/content");
    expect(BOSS_EVERY).toBe(3);
    for (const r of [1, 2, 4, 5, 7]) expect(toRound(r).boss, `round ${r}`).toBeNull();
    for (const r of [3, 6, 9]) expect(toRound(r).boss, `round ${r}`).not.toBeNull();
  });

  it("announces the boss and raises the quota above the plain quota of that round", () => {
    const run = toRound(3);
    expect(drainEvents(run).some((e) => e.startsWith("BOSS"))).toBe(true);
    expect(run.quota).toBeGreaterThan(quotaFor(3, baseMods()));
  });

  it("changes the mods by the rule of the boss, and only for that round", async () => {
    const { BOSSES } = await import("../../src/game/content");
    const plain = modsFor(meta, []);
    const frozen = modsFor(meta, [], {}, "frozen");
    expect([frozen.weights.wild, frozen.weights.coin]).toEqual([0, 0]);
    expect(modsFor(meta, [], {}, "shark").pokerMul).toBe(0.5);
    expect(modsFor(meta, [], {}, "slippery").pusherPayMul).toBeCloseTo(0.6);
    expect(modsFor(meta, [], {}, "landlord").turns).toBe(plain.turns - 3);
    expect(modsFor(meta, [], {}, "edge").slotWinMul).toBeCloseTo(0.7);
    expect(modsFor(meta, [], {}, "collector").quotaMul).toBeCloseTo(1.35);
    for (const b of BOSSES) expect(modsFor(meta, [], {}, b.id).quotaMul, b.id).toBeGreaterThanOrEqual(1.2);
    const run = toRound(3);
    run.coins = 500;
    run.turnsLeft = 0;
    closeRound(run, mkBoss(run)(run.charms), mkBoss(run));
    expect(run.boss).toBeNull();
    expect(run.round).toBe(4);
  });

  it("rewards a beaten boss with tickets, chips and a relic to file, and counts it", () => {
    const run = toRound(3);
    run.coins = 500;
    run.turnsLeft = 0;
    const tickets = run.tickets;
    closeRound(run, mkBoss(run)(run.charms), mkBoss(run));
    expect([run.stats.bosses, run.tickets - tickets, run.chipsPending, run.found]).toEqual([1, 3, 3, 1]);
  });

  it("gives a missed boss round no reward and ends the run", () => {
    const run = toRound(3);
    run.coins = 1;
    run.turnsLeft = 0;
    closeRound(run, mkBoss(run)(run.charms), mkBoss(run));
    expect([run.phase, run.stats.bosses, run.found]).toEqual(["over", 0, 0]);
  });

  it("restores an old save without a boss, and drops an unknown boss id", async () => {
    const { restoreRun } = await import("../../src/game/run");
    const raw = JSON.parse(JSON.stringify(startRun(1, baseMods())));
    delete raw.boss;
    delete raw.stake;
    delete raw.stats.bosses;
    expect(restoreRun(raw)).toMatchObject({ boss: null, stake: 0, stats: { bosses: 0 } });
    raw.boss = "nobody";
    raw.stake = 9;
    expect(restoreRun(raw)).toMatchObject({ boss: null, stake: 5 });
    raw.boss = "shark";
    expect(restoreRun(raw)?.boss).toBe("shark");
  });
});

describe("stakes", () => {
  it("raise the quota by 12% each and take a turn from stake 3 on", () => {
    const meta = newMeta();
    const plain = modsFor(meta, []);
    expect(modsFor(meta, [], {}, null, 1).quotaMul).toBeCloseTo(1.12);
    expect(modsFor(meta, [], {}, null, 2).turns).toBe(plain.turns);
    expect(modsFor(meta, [], {}, null, 3).turns).toBe(plain.turns - 1);
    expect(quotaFor(1, modsFor(meta, [], {}, null, 5))).toBeGreaterThan(quotaFor(1, plain));
  });

  it("pay more chips, and a boss beaten at the top unlocked stake unlocks the next", () => {
    const meta = newMeta();
    const run = startRun(1, baseMods(), 0);
    run.completed = 3;
    run.stats.bosses = 1;
    expect(finishRun(meta, run)).toBe(10);
    expect(meta.maxStake).toBe(1);
    const low = startRun(1, baseMods(), 0);
    low.completed = 3;
    low.stats.bosses = 1;
    finishRun(meta, low); // stake 0 is below the top: nothing new
    expect(meta.maxStake).toBe(1);
    const high = startRun(1, baseMods(), 1);
    high.completed = 3;
    high.stats.bosses = 1;
    expect(finishRun(meta, high)).toBe(Math.floor(10 * 1.25));
    expect(meta.maxStake).toBe(2);
  });

  it("does not unlock a stake without a boss, and stops at the maximum", () => {
    const meta = newMeta();
    const run = startRun(1, baseMods(), 0);
    run.completed = 2;
    finishRun(meta, run);
    expect(meta.maxStake).toBe(0);
    meta.maxStake = 5;
    const top = startRun(1, baseMods(), 5);
    top.stats.bosses = 2;
    finishRun(meta, top);
    expect(meta.maxStake).toBe(5);
  });

  it("are saved with the meta, bounded", () => {
    expect(restoreRun_meta({ v: 1, maxStake: 3 }).maxStake).toBe(3);
    expect(restoreRun_meta({ v: 1, maxStake: 99 }).maxStake).toBe(5);
    expect(restoreRun_meta({ v: 1 }).maxStake).toBe(0);
  });

  it("have achievements for the bosses and the stakes", () => {
    const meta = newMeta();
    meta.maxStake = 1;
    const run = startRun(1, baseMods());
    run.stats.bosses = 1;
    expect(checkAchievements(meta, run).map((a) => a.id)).toEqual(expect.arrayContaining(["boss1", "stake1"]));
  });
});

const restoreRun_meta = restoreMeta;

describe("relic perks", () => {
  it("gives every relic a perk that changes the mods, crafted ones more than found ones", async () => {
    const { RELIC_PERKS } = await import("../../src/game/content");
    for (const r of RELICS) {
      const perk = RELIC_PERKS[r.id];
      expect(perk, r.id).toBeDefined();
      const m = realBase();
      perk!.effect(m);
      expect(JSON.stringify(m), r.id).not.toBe(JSON.stringify(realBase()));
    }
    expect(Object.keys(RELIC_PERKS).sort()).toEqual(RELICS.map((r) => r.id).sort());
  });

  it("equips owned relics into 2 slots, 3 and 4 with the display nodes, and unequips", async () => {
    const { toggleEquip, relicSlots } = await import("../../src/game/meta");
    const meta = newMeta();
    meta.relics = ["penny", "dice", "tooth", "cat", "key"];
    expect(relicSlots(meta)).toBe(2);
    expect(toggleEquip(meta, "penny")).toBe(true);
    expect(toggleEquip(meta, "dice")).toBe(true);
    expect(toggleEquip(meta, "tooth")).toBe(false);
    expect(toggleEquip(meta, "eye")).toBe(false); // not owned
    expect(toggleEquip(meta, "penny")).toBe(true); // off
    expect(meta.loadout).toEqual(["dice"]);
    meta.tech = ["purse1", "case1", "case2"];
    expect(relicSlots(meta)).toBe(4);
  });

  it("applies the equipped perks to the mods of a run, and no others", () => {
    const meta = newMeta();
    meta.relics = ["penny", "horse"];
    meta.loadout = ["penny"];
    const m = modsFor(meta, []);
    expect(m.freeDropsPerRound).toBe(1);
    expect(m.slotWinMul).toBe(1);
    meta.loadout = ["penny", "horse"];
    expect(modsFor(meta, []).slotWinMul).toBeCloseTo(1.1);
  });

  it("does not apply a loadout that is larger than the slots", () => {
    const meta = newMeta();
    meta.relics = ["penny", "dice", "tooth"];
    meta.loadout = ["penny", "dice", "tooth"];
    expect(modsFor(meta, []).goldChance).toBeCloseTo(0.08);
  });

  it("starts a run with the tickets of the key relics", () => {
    const meta = newMeta();
    meta.relics = ["key", "vault"];
    meta.tech = ["purse1", "case1"];
    meta.loadout = ["key", "vault"];
    const m = modsFor(meta, []);
    expect(startRun(1, m).tickets).toBe(4);
  });

  it("is kept in the save, owned relics only, within the slots", async () => {
    const saved = restoreMeta({ v: 1, relics: ["penny", "dice", "tooth"], loadout: ["penny", "eye", "dice", "tooth"] });
    expect(saved.loadout).toEqual(["penny", "dice"]);
    expect(restoreMeta({ v: 1 }).loadout).toEqual([]);
  });
});

describe("run events", () => {

  const at = async (eventId: string, tweak?: (r: Run) => void): Promise<Run> => {
    const run = startRun(5, baseMods());
    run.coins = 100;
    run.phase = "event";
    run.event = eventId;
    tweak?.(run);
    return run;
  };

  it("rolls an event only with the chance of the mods, and only an eligible one", async () => {
    const { rollEvent, EVENTS } = await import("../../src/game/events");
    const run = startRun(3, baseMods());
    expect(rollEvent(run, 0)).toBeNull();
    const ids = new Set<string | null>();
    for (let i = 0; i < 300; i++) ids.add(rollEvent(run, 1));
    expect(ids.has(null)).toBe(false);
    expect(ids.has("exorcist")).toBe(false); // no curse to lift
    run.charms.push("karma");
    let seen = false;
    for (let i = 0; i < 400 && !seen; i++) seen = rollEvent(run, 1) === "exorcist";
    expect(seen).toBe(true);
    expect(EVENTS.length).toBeGreaterThanOrEqual(8);
  });

  it("follows a cleared round: the event screen first, then the charm call", () => {
    const run = startRun(5, baseMods());
    const m = baseMods();
    m.eventChance = 1;
    run.coins = 500;
    run.turnsLeft = 0;
    closeRound(run, m, mk);
    expect(run.phase).toBe("event");
    expect(run.event).not.toBeNull();
    expect(run.draft).toEqual([]);
  });

  it("applies a choice, counts it, and opens the call", async () => {
    const { chooseEvent } = await import("../../src/game/run");
    const run = await at("shower");
    expect(chooseEvent(run, 1, mk)).toBe(true);
    expect(run.coins).toBe(108);
    expect(run.stats.events).toBe(1);
    expect(run.phase).toBe("draft");
    expect(run.draft).toHaveLength(3);
    expect(run.event).toBeNull();
    expect(chooseEvent(run, 0, mk)).toBe(false);
  });

  it("refuses a choice that cannot be taken and a bad index, and changes nothing", async () => {
    const { chooseEvent } = await import("../../src/game/run");
    const run = await at("well", (r) => (r.coins = 5));
    expect(chooseEvent(run, 0, mk)).toBe(false);
    expect(chooseEvent(run, 7, mk)).toBe(false);
    expect([run.coins, run.phase, run.stats.events]).toEqual([5, "event", 0]);
  });

  it("curses: the suitcase pays 20 coins and adds Bad Karma, which cuts slot wins; never twice", async () => {
    const { chooseEvent } = await import("../../src/game/run");
    const run = await at("suitcase");
    chooseEvent(run, 0, mk);
    expect(run.coins).toBe(120);
    expect(run.charms).toContain("karma");
    expect(modsFor(newMeta(), run.charms).slotWinMul).toBeCloseTo(0.9);
    const again = await at("suitcase", (r) => r.charms.push("karma"));
    expect(chooseEvent(again, 0, mk)).toBe(false);
  });

  it("debt raises the quota and haunting takes a turn, on top of what the run has", () => {
    const meta = newMeta();
    expect(modsFor(meta, ["debt"]).quotaMul).toBeCloseTo(1.15);
    expect(modsFor(meta, ["haunted"]).turns).toBe(modsFor(meta, []).turns - 1);
  });

  it("the well gives a free uncommon or rare charm for 10 coins", async () => {
    const { chooseEvent } = await import("../../src/game/run");
    const run = await at("well");
    chooseEvent(run, 0, mk);
    expect(run.coins).toBe(90);
    expect(run.charms).toHaveLength(1);
    expect(CHARMS.find((c) => c.id === run.charms[0])?.rarity).not.toBe("common");
  });

  it("dice: win 30 or lose 15, and both happen over many rolls", async () => {
    const { chooseEvent } = await import("../../src/game/run");
    const outcomes = new Set<number>();
    for (let seed = 1; seed < 40; seed++) {
      const run = startRun(seed, baseMods());
      run.coins = 100;
      run.phase = "event";
      run.event = "dice";
      chooseEvent(run, 0, mk);
      outcomes.add(run.coins);
    }
    expect([...outcomes].sort((a, b) => a - b)).toEqual([85, 130]);
  });

  it("mechanic: pays 8 coins for one upgrade level, refuses when every upgrade is maxed", async () => {
    const { chooseEvent } = await import("../../src/game/run");
    const { UPGRADES } = await import("../../src/game/content");
    const run = await at("mechanic");
    chooseEvent(run, 0, mk);
    expect(run.coins).toBe(92);
    expect(Object.values(run.upgrades).reduce((a, b) => a + b, 0)).toBe(1);
    const maxed = await at("mechanic", (r) => UPGRADES.forEach((u) => (r.upgrades[u.id] = u.max)));
    expect(chooseEvent(maxed, 0, mk)).toBe(false);
  });

  it("shower pours 25 coins on the shelf, lucky raises the zone, loan and haunted give their price", async () => {
    const { chooseEvent } = await import("../../src/game/run");
    const shower = await at("shower");
    chooseEvent(shower, 0, mk);
    expect(shower.pour.reduce((n, k) => n + (k === "gold" ? 5 : 1), 0)).toBe(25);
    const lucky = await at("lucky");
    chooseEvent(lucky, 0, mk);
    expect(lucky.zone).toBe(2);
    const loan = await at("loan");
    chooseEvent(loan, 0, mk);
    expect([loan.coins, loan.charms]).toEqual([140, ["debt"]]);
    const haunted = await at("haunted");
    chooseEvent(haunted, 0, mk);
    expect([haunted.tickets, haunted.charms]).toEqual([3, ["haunted"]]);
  });

  it("exorcist lifts one curse for 2 tickets", async () => {
    const { chooseEvent } = await import("../../src/game/run");
    const run = await at("exorcist", (r) => ((r.charms = ["karma", "clover"]), (r.tickets = 2)));
    chooseEvent(run, 0, mk);
    expect(run.charms).toEqual(["clover"]);
    expect(run.tickets).toBe(0);
    const poor = await at("exorcist", (r) => ((r.charms = ["karma"]), (r.tickets = 1)));
    expect(chooseEvent(poor, 0, mk)).toBe(false);
  });

  it("curses are never offered by the call or the shop, and survive a save; an event survives too", async () => {
    const { drawCharms, restoreRun } = await import("../../src/game/run");
    const rng = makeRng(1);
    for (let i = 0; i < 200; i++) expect(drawCharms(rng, [], [], 7).some((id) => ["karma", "debt", "haunted"].includes(id))).toBe(false);
    const run = await at("suitcase", (r) => r.charms.push("karma"));
    const back = restoreRun(JSON.parse(JSON.stringify(run)));
    expect(back).toMatchObject({ phase: "event", event: "suitcase", charms: ["karma"] });
    const bad = JSON.parse(JSON.stringify(run));
    bad.event = "nope";
    expect(restoreRun(bad)).toBeNull();
    delete bad.stats.events;
    bad.event = "suitcase";
    expect(restoreRun(bad)?.stats.events).toBe(0);
  });
});

describe("event and loadout achievements", () => {
  it("unlock from events faced and relics equipped", () => {
    const meta = newMeta();
    meta.loadout = ["penny", "dice"];
    const run = startRun(1, baseMods());
    run.stats.events = 3;
    expect(checkAchievements(meta, run).map((a) => a.id)).toEqual(expect.arrayContaining(["road3", "gear2"]));
  });
});
