import { describe, expect, it } from "vitest";
import { TECH, UPGRADES } from "../../src/game/content";
import { freshDeck } from "../../src/game/cards";
import { buyTech, canBuy, modsFor, newMeta, restoreMeta } from "../../src/game/meta";
import { baseMods } from "../../src/game/mods";

const BRANCHES = ["hold", "cards", "hands", "economy"] as const;
const rich = () => {
  const meta = newMeta();
  meta.climb.chips = 10000;
  meta.endless.chips = 10000;
  return meta;
};

describe("the tech tree", () => {
  it("every node requires only existing ids, and there is no cycle", () => {
    const ids = new Set(TECH.map((t) => t.id));
    expect(ids.size).toBe(TECH.length);
    const walk = (id: string, seen: string[]): void => {
      if (seen.includes(id)) throw new Error(`cycle through ${id}`);
      const node = TECH.find((t) => t.id === id);
      if (!node) throw new Error(`unknown node ${id}`);
      for (const r of node.requires) walk(r, [...seen, id]);
    };
    for (const t of TECH) walk(t.id, []);
  });

  it("has four branches with at least 5 nodes each", () => {
    for (const b of BRANCHES) expect(TECH.filter((t) => t.branch === b).length, b).toBeGreaterThanOrEqual(5);
    expect(TECH.every((t) => (BRANCHES as readonly string[]).includes(t.branch))).toBe(true);
  });

  it("every node can be bought in order and changes the mods or the unlocks", () => {
    const meta = rich();
    for (let pass = 0; pass < TECH.length; pass++) for (const t of TECH) buyTech(meta, "climb", t.id);
    expect(meta.climb.tech).toHaveLength(TECH.filter((t) => t.modes === undefined || t.modes.includes("climb")).length);
    for (const t of TECH) {
      const m = baseMods();
      t.effect(m);
      if (t.id !== "case1" && t.id !== "case2") expect(JSON.stringify(m), t.id).not.toBe(JSON.stringify(baseMods()));
    }
  });

  it("a round starts with two holds, and the Hold branch widens that to five", () => {
    const meta = rich();
    expect(modsFor(meta, "climb", []).holdMax).toBe(2);
    expect(canBuy(meta, "climb", "hold4")).toBe(false);
    for (const id of ["hold3", "hold4", "hold5"]) expect(buyTech(meta, "climb", id), id).toBe(true);
    expect(modsFor(meta, "climb", []).holdMax).toBe(5);
  });

  it("Single Hold sets singleHold, and the free draws stack", () => {
    const meta = rich();
    expect(modsFor(meta, "climb", []).singleHold).toBe(false);
    for (const id of ["hold3", "single", "redraw1", "redraw2"]) expect(buyTech(meta, "climb", id), id).toBe(true);
    const m = modsFor(meta, "climb", []);
    expect([m.singleHold, m.redraws]).toEqual([true, 2]);
  });

  it("the deck nodes take ranks out of the deck, and the card nodes unlock upgrade kinds", () => {
    const meta = rich();
    for (const id of ["deck2", "deck3", "golds", "jokers", "anysuit"]) expect(buyTech(meta, "climb", id), id).toBe(true);
    const m = modsFor(meta, "climb", []);
    expect(m.removedRanks).toEqual([2, 3]);
    expect(freshDeck(m.removedRanks)).toHaveLength(44);
    expect(m.cardKinds).toEqual(expect.arrayContaining(["rank", "gold", "joker", "anySuit"]));
    expect(modsFor(newMeta(), "climb", []).cardKinds).toEqual(["rank"]);
  });

  it("the hands nodes raise the pay of their ranks only", () => {
    const meta = rich();
    for (const id of ["pairs1", "pairs2"]) buyTech(meta, "climb", id);
    const m = modsFor(meta, "climb", []);
    expect(m.handMul.jacks).toBeCloseTo(1.5625);
    expect(m.handMul.flush).toBe(1);
    buyTech(meta, "climb", "linebonus");
    expect(modsFor(meta, "climb", []).lineBonus).toBeCloseTo(0.1);
  });

  it("the auto-play nodes belong to endless and give a rate there", () => {
    const meta = rich();
    for (const id of ["purse1", "auto1", "auto2"]) buyTech(meta, "endless", id);
    expect(modsFor(meta, "endless", []).autoRate).toBe(1);
    expect(TECH.filter((t) => t.id.startsWith("auto")).every((t) => t.modes?.join() === "endless")).toBe(true);
    expect(modsFor(newMeta(), "climb", []).autoRate).toBe(0);
  });

  it("no text speaks of symbols, paylines, the pusher or the shelf", () => {
    for (const x of [...TECH, ...UPGRADES]) expect(`${x.name} ${x.text}`, x.id).not.toMatch(/symbol|payline|pusher|shelf|zone|cluster|reel/i);
  });

  it("a saved node whose prerequisite is gone is dropped and its chips come back", () => {
    const meta = restoreMeta({ v: 1, chips: 0, tech: ["hold5"] });
    expect(meta.climb.tech).toEqual([]);
    expect(meta.climb.chips).toBe(TECH.find((t) => t.id === "hold5")?.cost);
  });
});
