import { describe, expect, it } from "vitest";
import { modsFor, newMeta } from "../../src/game/meta";
import { type Run, chooseEvent, closeRound, drawPoker, dropAt, holdCard, pickCharm, spinSlot, startRun, tickPusher } from "../../src/game/run";
import { rank } from "../../src/game/poker";
import { makeRng, int } from "../../src/game/rng";

/** A simple player: pulls, holds pairs and high cards, drops a few coins, closes the round when the turns are gone, takes the first charm. */
function play(seed: number, tech: string[]): Run {
  const meta = newMeta();
  meta.tech = tech;
  const mk = (c: string[]) => modsFor(meta, c);
  const run = startRun(seed, mk([]));
  const pick = makeRng(seed ^ 0x55);
  for (let i = 0; i < 3000 && run.phase !== "over"; i++) {
    const m = mk(run.charms);
    if (run.phase === "event") {
      chooseEvent(run, 1, mk);
      continue;
    }
    if (run.phase === "draft") {
      pickCharm(run, run.draft[0] as string, mk);
      continue;
    }
    if (run.poker.phase === "hold") {
      const counts = new Map<number, number>();
      for (const c of run.poker.hand) counts.set(rank(c), (counts.get(rank(c)) ?? 0) + 1);
      run.poker.hand.forEach((c, j) => ((counts.get(rank(c)) ?? 0) >= 2 || rank(c) >= 11) && holdCard(run, j));
      drawPoker(run, m);
    } else if (run.turnsLeft > 0 && run.coins >= m.slotLines) {
      spinSlot(run, m, run.coins > 60 ? Math.min(2, m.slotMaxBet) : 1);
      if (int(pick, 2) === 0) dropAt(run, m, 1 + int(pick, 8));
    } else {
      tickPusher(run, m, 60 * 20);
      closeRound(run, m, mk);
    }
    tickPusher(run, m, 60 * 3);
  }
  return run;
}

describe("a simple player", () => {
  it("clears the first round, does not go on for ever, and every run ends", () => {
    const rounds = Array.from({ length: 12 }, (_, i) => play(1000 + i, []).round).sort((a, b) => a - b);
    console.log("rounds reached (untouched tree): median", rounds[6], "min", rounds[0], "max", rounds[11]);
    expect(rounds.every((r) => r >= 1 && r < 40)).toBe(true);
    expect(rounds[11]).toBeGreaterThan(1);
  }, 60_000);
});
