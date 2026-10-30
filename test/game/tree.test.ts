import { describe, expect, it } from "vitest";
import { TECH, UPGRADES } from "../../src/game/content";
import { buyTech, canBuy, modsFor, newMeta, restoreMeta } from "../../src/game/meta";
import { baseMods } from "../../src/game/mods";

const BRANCHES = ["board", "symbols", "combos", "economy"] as const;

describe("the tech tree", () => {
  it("every node requires only existing ids, and there is no cycle", () => {
    const ids = new Set(TECH.map((t) => t.id));
    expect(ids.size).toBe(TECH.length);
    const depth = new Map<string, number>();
    const walk = (id: string, seen: string[]): number => {
      if (seen.includes(id)) throw new Error(`cycle through ${id}`);
      const node = TECH.find((t) => t.id === id);
      if (!node) throw new Error(`unknown node ${id}`);
      const d = 1 + Math.max(0, ...node.requires.map((r) => walk(r, [...seen, id])));
      depth.set(id, d);
      return d;
    };
    for (const t of TECH) walk(t.id, []);
  });

  it("has four branches with at least 5 nodes each", () => {
    for (const b of BRANCHES) expect(TECH.filter((t) => t.branch === b).length, b).toBeGreaterThanOrEqual(5);
    expect(TECH.every((t) => (BRANCHES as readonly string[]).includes(t.branch))).toBe(true);
  });

  it("rows6 needs rows5 (through cols5), and each board node needs the size before it", () => {
    const needs = (id: string, other: string): boolean => (TECH.find((t) => t.id === id)?.requires ?? []).some((r) => r === other || needs(r, other));
    expect(needs("rows6", "rows5")).toBe(true);
    expect(needs("cols6", "rows6")).toBe(true);
    const chain = ["rows4", "cols4", "rows5", "cols5", "rows6", "cols6"];
    for (let i = 1; i < chain.length; i++) expect(TECH.find((t) => t.id === chain[i])?.requires, chain[i]).toEqual([chain[i - 1]]);
  });

  it("buying the board nodes in order grows the board to 6x6", () => {
    const meta = newMeta();
    meta.climb.chips = 1000;
    expect([modsFor(meta, "climb", []).rows, modsFor(meta, "climb", []).cols]).toEqual([3, 3]);
    expect(canBuy(meta, "climb", "cols4")).toBe(false);
    for (const id of ["rows4", "cols4"]) expect(buyTech(meta, "climb", id), id).toBe(true);
    expect([modsFor(meta, "climb", []).rows, modsFor(meta, "climb", []).cols]).toEqual([4, 4]);
    for (const id of ["rows5", "cols5", "rows6", "cols6"]) expect(buyTech(meta, "climb", id), id).toBe(true);
    expect([modsFor(meta, "climb", []).rows, modsFor(meta, "climb", []).cols]).toEqual([6, 6]);
  });

  it("no text speaks of paylines, the pusher or poker", () => {
    for (const x of [...TECH, ...UPGRADES]) expect(`${x.name} ${x.text}`, x.id).not.toMatch(/payline|pusher|poker|shelf|zone/i);
  });

  it("the combo nodes change how a spin chains", () => {
    const meta = newMeta();
    meta.climb.chips = 1000;
    for (const id of ["chain1", "chain2", "cap1", "opener"]) expect(buyTech(meta, "climb", id), id).toBe(true);
    const m = modsFor(meta, "climb", []);
    expect(m.chainStep).toBeGreaterThan(baseMods().chainStep);
    expect(m.chainCap).toBeGreaterThan(baseMods().chainCap);
    expect(m.chainStart).toBeGreaterThan(baseMods().chainStart);
  });

  it("a symbol node puts the diamond on the board", () => {
    const meta = newMeta();
    meta.climb.chips = 1000;
    expect(modsFor(meta, "climb", []).weights.diamond).toBe(0);
    for (const id of ["wild1", "diamond"]) buyTech(meta, "climb", id);
    expect(modsFor(meta, "climb", []).weights.diamond).toBeGreaterThan(0);
  });

  it("the auto-spin nodes give a spin rate, and nothing else does", () => {
    const meta = newMeta();
    meta.climb.chips = 1000;
    expect(modsFor(meta, "climb", []).autoRate).toBe(0);
    for (const id of ["purse1", "auto1", "auto2"]) buyTech(meta, "climb", id);
    expect(modsFor(meta, "climb", []).autoRate).toBeGreaterThan(0);
  });

  it("a saved node whose prerequisite is gone is dropped and its chips come back", () => {
    const meta = restoreMeta({ v: 1, chips: 0, tech: ["cols5"] });
    expect(meta.climb.tech).toEqual([]);
    expect(meta.climb.chips).toBe(TECH.find((t) => t.id === "cols5")?.cost);
  });
});
