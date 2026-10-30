import { describe, expect, it } from "vitest";
import { GLASS_BREAK, MAX_JOKERS, MAX_NEGATIVE, applyCardUpgrade, cardUpgradeCost, jokerLimit, shatterGlass, upgradesBought } from "../../src/game/cards-shop";
import { TECH } from "../../src/game/content";
import { buyTech, modsFor, newMeta } from "../../src/game/meta";
import { baseMods } from "../../src/game/mods";
import { makeRng } from "../../src/game/rng";
import { dealRound, drawHand, restoreCardUpgrades, startRun } from "../../src/game/run";
import { type CardUpgrade, type Deal, COIN_SEAL_PAY, FOIL_PAY, drawRound, scoreBoard } from "../../src/game/round";

// The board 0..24: rows 0, 1, 3 and 4 are straight flushes (2-6 and 7-J of spades, 4-8 and 9-K of hearts); row 2 and every column pay nothing. Card 12 sits in no paying line.
const board = Array.from({ length: 25 }, (_, i) => i);
const m = baseMods();
const score = { handMul: m.handMul, globalMul: 1, lineBonus: 0 };
const row0 = (ups: Record<number, CardUpgrade>, bet = 1): number => scoreBoard(board, bet, ups, score).lines.find((l) => l.line === 0)?.pay ?? 0;
const SF = 80;

describe("card effects in a line", () => {
  it("pays the plain straight flush without any upgrade", () => {
    expect(row0({})).toBe(SF);
  });

  it("foil adds a flat sum in bets to a paying line", () => {
    expect(row0({ 0: { edition: "foil" } })).toBe(SF + FOIL_PAY);
    expect(row0({ 0: { edition: "foil" } }, 2)).toBe(2 * SF + 2 * FOIL_PAY);
  });

  it("holo doubles, poly pays x1.5, glass x1.6", () => {
    expect(row0({ 0: { edition: "holo" } })).toBe(SF * 2);
    expect(row0({ 0: { edition: "poly" } })).toBe(SF * 1.5);
    expect(row0({ 0: { glass: true } })).toBeCloseTo(SF * 1.6);
  });

  it("adds the gold and holo steps and multiplies the poly steps over the line", () => {
    expect(row0({ 0: { gold: true, edition: "holo" } })).toBe(SF * 2.5);
    expect(row0({ 0: { edition: "poly" }, 1: { edition: "poly" } })).toBeCloseTo(SF * 2.25);
  });

  it("lets a red seal count the bonuses of its card twice, and does nothing alone", () => {
    expect(row0({ 0: { edition: "holo", seal: "red" } })).toBe(SF * 3);
    expect(row0({ 0: { gold: true, seal: "red" } })).toBe(SF * 2);
    expect(row0({ 0: { seal: "red" } })).toBe(SF);
  });

  it("makes a stone a blank that breaks the hand but pays a flat sum for each of its lines", () => {
    const res = scoreBoard(board, 1, { 4: { stone: true } }, score);
    expect(res.lines.some((l) => l.line === 0)).toBe(false);
    expect(res.payout).toBe(3 * SF + 4);
  });

  it("pays a stone's sum even in a line that would not pay", () => {
    expect(scoreBoard(board, 3, { 12: { stone: true } }, score).payout).toBe(4 * 3 * SF + 3 * 2 * 2);
  });

  it("leaves a dead line out, stone and all", () => {
    expect(scoreBoard(board, 1, { 4: { stone: true } }, { ...score, deadLines: [0] }).payout).toBe(3 * SF + 2);
  });
});

describe("the coin seal", () => {
  const deal = (): Deal => ({ board: [...board], bet: 1, phase: "hold", draws: 0, maxDraws: 1 });
  const opts = { singleHold: false, upgrades: { 0: { seal: "coin" as const } }, score };

  it("pays when its card is held through the draw", () => {
    const res = drawRound(makeRng(1), deal(), { rows: [0], cols: [], cells: [] }, opts);
    if (typeof res === "string") throw new Error(res);
    expect(res.sealCoins).toBe(COIN_SEAL_PAY);
    expect(res.payout).toBeGreaterThanOrEqual(SF + COIN_SEAL_PAY);
  });

  it("pays nothing when the card is drawn away", () => {
    const res = drawRound(makeRng(1), deal(), { rows: [3], cols: [], cells: [] }, opts);
    if (typeof res === "string") throw new Error(res);
    expect(res.sealCoins).toBe(0);
  });

  it("scales with the bet and the number of held coin cards", () => {
    const d = { ...deal(), bet: 2 };
    const res = drawRound(makeRng(1), d, { rows: [0], cols: [], cells: [] }, { ...opts, upgrades: { 0: { seal: "coin" }, 1: { seal: "coin" } } });
    if (typeof res === "string") throw new Error(res);
    expect(res.sealCoins).toBe(2 * COIN_SEAL_PAY * 2);
  });

  it("does not pay on a draw that is not the last", () => {
    const res = drawRound(makeRng(1), { ...deal(), maxDraws: 2 }, { rows: [0], cols: [], cells: [] }, opts);
    if (typeof res === "string") throw new Error(res);
    expect([res.final, res.sealCoins, res.payout]).toEqual([false, 0, 0]);
  });
});

describe("shattering glass", () => {
  const lines = scoreBoard(board, 1, {}, score).lines;

  it("breaks about one glass card in five that sat in a paying line", () => {
    let broke = 0;
    const N = 600;
    for (let seed = 0; seed < N; seed++) {
      const ups: Record<number, CardUpgrade> = { 0: { glass: true } };
      broke += shatterGlass(makeRng(seed), ups, board, lines).length;
    }
    expect(broke / N).toBeGreaterThan(GLASS_BREAK - 0.07);
    expect(broke / N).toBeLessThan(GLASS_BREAK + 0.07);
  });

  it("never breaks glass outside a paying line", () => {
    for (let seed = 0; seed < 100; seed++) expect(shatterGlass(makeRng(seed), { 12: { glass: true } }, board, lines)).toEqual([]);
  });

  it("takes only the glass away, and drops an entry that is empty", () => {
    for (let seed = 0; seed < 100; seed++) {
      const ups: Record<number, CardUpgrade> = { 0: { glass: true, gold: true }, 1: { glass: true } };
      const broken = shatterGlass(makeRng(seed), ups, board, lines);
      if (broken.includes(0)) expect(ups[0]).toEqual({ gold: true });
      if (broken.includes(1)) expect(ups[1]).toBeUndefined();
    }
  });

  it("is rolled by the run's own seeded rng, so a replay breaks the same cards", () => {
    const a = shatterGlass(makeRng(9), { 0: { glass: true }, 1: { glass: true }, 2: { glass: true } }, board, lines);
    const b = shatterGlass(makeRng(9), { 0: { glass: true }, 1: { glass: true }, 2: { glass: true } }, board, lines);
    expect(a).toEqual(b);
  });

  it("is reported by a run when glass shatters in its round", () => {
    const all = Object.fromEntries(Array.from({ length: 52 }, (_, c) => [c, { glass: true }]));
    let seen = false;
    for (let seed = 1; seed < 80 && !seen; seed++) {
      const run = startRun(seed, baseMods());
      run.cardUpgrades = structuredClone(all);
      run.coins = 5000;
      const mods = { ...baseMods(), holdMax: 5 };
      for (let i = 0; i < 6 && !seen; i++) {
        if (typeof dealRound(run, mods, 1) === "string") break;
        const res = drawHand(run, mods, { rows: [], cols: [], cells: [] });
        if (typeof res !== "string" && (res.shattered?.length ?? 0) > 0) {
          seen = true;
          expect(run.events.some((e) => e.startsWith("Glass shattered"))).toBe(true);
          for (const c of res.shattered ?? []) expect(run.cardUpgrades[c]).toBeUndefined();
        }
      }
    }
    expect(seen).toBe(true);
  });
});

describe("buying the new kinds", () => {
  it("lets a card carry one edition and one seal, and stacks them with other upgrades", () => {
    let ups = applyCardUpgrade({}, 5, "foil") as Record<number, CardUpgrade>;
    expect(applyCardUpgrade(ups, 5, "holo")).toBeNull();
    expect(applyCardUpgrade(ups, 5, "negative")).toBeNull();
    ups = applyCardUpgrade(ups, 5, "coin") as Record<number, CardUpgrade>;
    expect(applyCardUpgrade(ups, 5, "red")).toBeNull();
    ups = applyCardUpgrade(ups, 5, "gold") as Record<number, CardUpgrade>;
    expect(ups[5]).toEqual({ edition: "foil", seal: "coin", gold: true });
  });

  it("keeps a stone a blank, and glass apart from it", () => {
    for (const k of ["rank", "joker", "anySuit", "glass"] as const) {
      const stone = applyCardUpgrade({}, 3, "stone") as Record<number, CardUpgrade>;
      expect(applyCardUpgrade(stone, 3, k), `stone then ${k}`).toBeNull();
    }
    for (const k of ["rank", "joker", "anySuit", "glass"] as const) {
      const first = applyCardUpgrade({}, 3, k) as Record<number, CardUpgrade>;
      expect(applyCardUpgrade(first, 3, "stone"), `${k} then stone`).toBeNull();
    }
    const gilded = applyCardUpgrade({}, 3, "gold") as Record<number, CardUpgrade>;
    expect(applyCardUpgrade(gilded, 3, "stone")).not.toBeNull();
  });

  it("lifts the joker limit by each negative card, up to two", () => {
    let ups: Record<number, CardUpgrade> = {};
    for (let c = 0; c < MAX_JOKERS; c++) ups = applyCardUpgrade(ups, c, "joker") as Record<number, CardUpgrade>;
    expect(applyCardUpgrade(ups, 10, "joker")).toBeNull();
    ups = applyCardUpgrade(ups, 20, "negative") as Record<number, CardUpgrade>;
    expect(jokerLimit(ups)).toBe(MAX_JOKERS + 1);
    ups = applyCardUpgrade(ups, 10, "joker") as Record<number, CardUpgrade>;
    expect(applyCardUpgrade(ups, 11, "joker")).toBeNull();
    ups = applyCardUpgrade(ups, 21, "negative") as Record<number, CardUpgrade>;
    expect(applyCardUpgrade(ups, 22, "negative")).toBeNull();
    expect(jokerLimit(ups)).toBe(MAX_JOKERS + MAX_NEGATIVE);
  });

  it("counts every new upgrade towards the rising price", () => {
    const ups = { 1: { glass: true, edition: "holo" as const, seal: "red" as const }, 2: { stone: true } };
    expect(upgradesBought(ups)).toBe(4);
    expect(cardUpgradeCost(ups, "poly")).toBeGreaterThan(cardUpgradeCost({}, "poly"));
  });
});

describe("saves with the new fields", () => {
  it("keeps what is valid and drops the rest", () => {
    const back = restoreCardUpgrades({ 1: { glass: true, edition: "holo", seal: "coin" }, 2: { edition: "nope", seal: "x" }, 3: { stone: true, joker: true }, 4: { stone: true, rank: 2 } });
    expect(back[1]).toEqual({ glass: true, edition: "holo", seal: "coin" });
    expect(back[2]).toBeUndefined();
    expect(back[3]).toEqual({ joker: true });
    expect(back[4]).toEqual({ rank: 2 });
  });

  it("caps negative cards and jokers by the limit they give", () => {
    const raw: Record<string, CardUpgrade> = {};
    for (let c = 0; c < 8; c++) raw[c] = { joker: true };
    for (let c = 10; c < 15; c++) raw[c] = { edition: "negative" };
    const back = restoreCardUpgrades(raw);
    expect(Object.values(back).filter((u) => u.edition === "negative")).toHaveLength(MAX_NEGATIVE);
    expect(Object.values(back).filter((u) => u.joker)).toHaveLength(MAX_JOKERS + MAX_NEGATIVE);
  });
});

describe("the tree opens the kinds", () => {
  it("has a node for each new kind and puts them behind gold", () => {
    const meta = newMeta();
    meta.climb.chips = 1000;
    for (const id of ["golds", "glass1", "stone1", "editions", "polys", "seals"]) expect(buyTech(meta, "climb", id), id).toBe(true);
    const kinds = modsFor(meta, "climb", []).cardKinds;
    for (const k of ["gold", "glass", "stone", "foil", "holo", "poly", "negative", "coin", "red"]) expect(kinds, k).toContain(k);
    expect(TECH.find((t) => t.id === "polys")?.requires).toEqual(["editions"]);
    expect(buyTech(newMeta(), "climb", "polys")).toBe(false);
  });
});

describe("achievements of the card upgrades", () => {
  it("opens with an edition, and with a card that has an enhancement, an edition and a seal", async () => {
    const { checkAchievements } = await import("../../src/game/meta");
    const meta = newMeta();
    const view = (ups: Record<number, CardUpgrade>) => ({ stats: startRun(1, baseMods()).stats, cardUpgrades: ups, round: 1 });
    expect(checkAchievements(meta, "climb", view({ 1: { edition: "foil" } })).map((a) => a.id)).toContain("edition1");
    expect(meta.ach).not.toContain("fullkit");
    expect(checkAchievements(meta, "climb", view({ 1: { gold: true, edition: "holo", seal: "red" } })).map((a) => a.id)).toContain("fullkit");
  });
});
