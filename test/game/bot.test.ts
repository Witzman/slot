import { describe, expect, it } from "vitest";
import { modsFor, newMeta } from "../../src/game/meta";
import { type Run, dealPoker, drawPoker, dropAt, holdCard, pickCharm, spinSlot, startRun, tickPusher } from "../../src/game/run";
import { rank } from "../../src/game/poker";
import { makeRng, int } from "../../src/game/rng";

/** A simple player: mixes the three machines, holds pairs and high cards, takes the first charm, bets a little more when rich. */
function play(seed: number, tech: string[]): Run {
  const meta = newMeta();
  meta.tech = tech;
  const mk = (c: string[]) => modsFor(meta, c);
  const run = startRun(seed, mk([]));
  const pick = makeRng(seed ^ 0x55);
  for (let i = 0; i < 5000 && run.phase !== "over"; i++) {
    const m = mk(run.charms);
    if (run.phase === "draft") {
      pickCharm(run, run.draft[0] as string, mk);
      continue;
    }
    if (run.poker.phase === "hold") {
      const counts = new Map<number, number>();
      for (const c of run.poker.hand) counts.set(rank(c), (counts.get(rank(c)) ?? 0) + 1);
      run.poker.hand.forEach((c, j) => ((counts.get(rank(c)) ?? 0) >= 2 || rank(c) >= 11) && holdCard(run, j));
      drawPoker(run, m, mk);
      continue;
    }
    const bet = run.coins > 60 ? 2 : 1;
    const k = int(pick, 3);
    if (k === 0) dealPoker(run, m, Math.min(bet, m.pokerMaxBet));
    else if (k === 1) spinSlot(run, m, Math.min(bet, m.slotMaxBet), mk);
    else {
      dropAt(run, m, 1 + int(pick, 8), mk);
      tickPusher(run, m, 60 * 5, mk);
    }
  }
  return run;
}

describe("a simple player", () => {
  it("clears the first rounds often but not for ever, and every run ends", () => {
    const rounds = Array.from({ length: 24 }, (_, i) => play(1000 + i, []).round);
    rounds.sort((a, b) => a - b);
    console.log("rounds reached (untouched tree): median", rounds[12], "min", rounds[0], "max", rounds[23]);
    expect(rounds.every((r) => r >= 1 && r < 40)).toBe(true);
    expect(rounds[23]).toBeGreaterThan(2);
    expect(rounds[0]).toBeLessThan(rounds[23] as number);
  }, 60_000);

  it("goes further with a bought tree", () => {
    const tree = ["purse1", "purse2", "time1", "time2", "lines3", "gold1", "free1", "pbet"];
    const base = Array.from({ length: 20 }, (_, i) => play(2000 + i, []).round).reduce((a, b) => a + b, 0);
    const bought = Array.from({ length: 20 }, (_, i) => play(2000 + i, tree).round).reduce((a, b) => a + b, 0);
    console.log("total rounds, 40 runs: base", base, "tree", bought);
    expect(bought).toBeGreaterThan(base);
  }, 60_000);
});
