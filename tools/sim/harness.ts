// Plays whole climb runs on the pure `src/game` layer with a Policy, so the balance is measured and not felt (#10).
import { spinBoard } from "../../src/game/board";
import { CHARMS, UPGRADES, upgradeCost } from "../../src/game/content";
import { type Meta, modsFor } from "../../src/game/meta";
import type { Mods } from "../../src/game/mods";
import { makeRng } from "../../src/game/rng";
import { type Run, buyCharm, buyUpgrade, chooseEvent, closeRound, drainEvents, pickCharm, spinSlot, startRun } from "../../src/game/run";
import { eventById } from "../../src/game/events";

/** The time one spin takes a human, including the cascade animation (spec 2026-10-30). */
export const SECONDS_PER_SPIN = 2.5;

export interface Policy {
  /** the bet for the next spin */
  bet(run: Run, m: Mods): number;
  /** the id of the free charm to take at the call */
  draft(run: Run, mk: (charms: string[]) => Mods): string;
  /** the id of an upgrade to buy with coins now, or null */
  buy(run: Run, m: Mods): string | null;
  /** the id of a charm to buy with tickets now, or null */
  shop(run: Run, mk: (charms: string[]) => Mods): string | null;
  /** 0 or 1: which choice of the waiting event */
  event(run: Run): number;
}

export interface Outcome {
  /** rounds paid */
  rounds: number;
  spins: number;
  minutes: number;
  bosses: number;
  reason: "quota" | "cap" | "stuck";
  /** the phase the run was in when the loop ended */
  phase: string;
  /** chips the run paid to the meta */
  chips: number;
}

/** Plays one run to its end (or `maxSpins`, which is the cap for runs that never end). */
export function playRun(seed: number, meta: Meta, policy: Policy, stake = 0, maxSpins = 4000): Outcome {
  const mk = (run: Run) => (charms: string[]) => modsFor(meta, "climb", charms, run.upgrades, run.boss, run.stake);
  const first = modsFor(meta, "climb", [], {}, null, stake);
  const run = startRun(seed, first, stake);
  const mkr = mk(run);
  let spins = 0;
  for (let guard = 0; guard < 200000 && run.phase !== "over" && spins < maxSpins; guard++) {
    drainEvents(run);
    if (run.phase === "event") {
      const ev = eventById(run.event);
      const want = policy.event(run);
      const ok = ev?.choices[want]?.can?.(run) !== false;
      chooseEvent(run, ok ? want : 1 - want, mkr) || chooseEvent(run, 1, mkr) || chooseEvent(run, 0, mkr);
      continue;
    }
    if (run.phase === "draft") {
      for (let n = 0; n < 8; n++) {
        const id = policy.shop(run, mkr);
        if (!id || !buyCharm(run, id)) break;
      }
      pickCharm(run, policy.draft(run, mkr), mkr);
      continue;
    }
    const m = mkr(run.charms);
    if (spins % 6 === 0) {
      for (let n = 0; n < 12; n++) {
        const id = policy.buy(run, m);
        if (!id || !buyUpgrade(run, id)) break;
      }
    }
    const mm = mkr(run.charms);
    const bet = Math.max(1, Math.min(mm.slotMaxBet, policy.bet(run, mm), run.coins));
    if ((run.turnsLeft > 0 || run.freeSpins > 0) && (run.freeSpins > 0 || run.coins >= bet)) {
      if (typeof spinSlot(run, mm, bet) !== "string") spins++;
    } else if (!closeRound(run, mm, mkr)) break;
  }
  return { rounds: run.completed, spins, minutes: (spins * SECONDS_PER_SPIN) / 60, bosses: run.stats.bosses, reason: run.phase === "over" ? "quota" : spins >= maxSpins ? "cap" : "stuck", phase: `${run.phase}${run.phase === "event" ? ":" + run.event : ""} draft=${run.draft.length} shop=${run.shop.length} turns=${run.turnsLeft} coins=${run.coins} free=${run.freeSpins}`, chips: 0 };
}

/** Average return per coin staked of a set of mods on its own board: 600 spins on fixed seeds, so two mods are compared on the same boards. */
export function rtpOf(m: Mods, spinsToTry = 600): number {
  const rng = makeRng(4242);
  let paid = 0;
  for (let i = 0; i < spinsToTry; i++) paid += spinBoard(rng, { rows: m.rows, cols: m.cols }, 1, { weights: m.weights, symPay: m.symPay, chainStart: m.chainStart, chainStep: m.chainStep, chainCap: m.chainCap, globalMul: m.slotWinMul }).payout;
  return paid / spinsToTry;
}

export { CHARMS, UPGRADES, upgradeCost };
