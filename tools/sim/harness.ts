// Plays whole climb runs on the pure `src/game` layer with a Policy, so the balance is measured and not felt (#10).
import { CHARMS, UPGRADES } from "../../src/game/content";
import type { CardKind } from "../../src/game/cards-shop";
import { type Meta, modsFor } from "../../src/game/meta";
import type { Mods } from "../../src/game/mods";
import { eventById } from "../../src/game/events";
import { type Run, buyCardUpgrade, buyCharm, buyUpgrade, chooseEvent, closeRound, dealRound, drainEvents, drawHand, pickCharm, startRun } from "../../src/game/run";
import type { Hold } from "../../src/game/round";

/** The time one round takes a human: deal, hold, draw, with the animation (spec 2026-10-30, a guess). */
export const SECONDS_PER_ROUND = 4;

export interface Policy {
  /** the bet for the next round */
  bet(run: Run, m: Mods): number;
  /** which lines (and cells) to hold from the board on the table */
  hold(run: Run, m: Mods): Hold;
  /** the id of the free charm to take at the call */
  draft(run: Run, mk: (charms: string[]) => Mods): string;
  /** the id of a charm to buy with tickets now, or null */
  shop(run: Run, mk: (charms: string[]) => Mods): string | null;
  /** the id of a coin upgrade to buy now, or null */
  buy(run: Run, m: Mods): string | null;
  /** a card upgrade to buy now, or null */
  buyCard(run: Run, m: Mods): { card: number; kind: CardKind } | null;
  /** 0 or 1: which choice of the waiting event */
  event(run: Run): number;
}

export interface Outcome {
  /** quotas paid */
  rounds: number;
  /** rounds of cards played (a deal and its draws) */
  turns: number;
  minutes: number;
  bosses: number;
  reason: "quota" | "cap" | "stuck";
  phase: string;
}

/** Plays one run to its end (or `maxTurns`, the cap for runs that never end). */
export function playRun(seed: number, meta: Meta, policy: Policy, stake = 0, maxTurns = 3000): Outcome {
  const mkr = (run: Run) => (charms: string[]) => modsFor(meta, "climb", charms, run.upgrades, run.boss, run.stake);
  const run = startRun(seed, modsFor(meta, "climb", [], {}, null, stake), stake);
  const mk = mkr(run);
  let turns = 0;
  for (let guard = 0; guard < 400000 && run.phase !== "over" && turns < maxTurns; guard++) {
    drainEvents(run);
    if (run.phase === "event") {
      const ev = eventById(run.event);
      const want = policy.event(run);
      const ok = ev?.choices[want]?.can?.(run) !== false;
      chooseEvent(run, ok ? want : 1 - want, mk) || chooseEvent(run, 1, mk) || chooseEvent(run, 0, mk);
      continue;
    }
    if (run.phase === "draft") {
      for (let n = 0; n < 8; n++) {
        const id = policy.shop(run, mk);
        if (!id || !buyCharm(run, id)) break;
      }
      pickCharm(run, policy.draft(run, mk), mk);
      continue;
    }
    const m = mk(run.charms);
    if (run.hand === null || run.hand.phase === "done") {
      for (let n = 0; n < 6; n++) {
        const id = policy.buy(run, m);
        if (!id || !buyUpgrade(run, id)) break;
      }
      for (let n = 0; n < 6; n++) {
        const buy = policy.buyCard(run, m);
        if (!buy || !buyCardUpgrade(run, buy.card, buy.kind, m)) break;
      }
    }
    const mm = mk(run.charms);
    const bet = Math.max(1, Math.min(mm.slotMaxBet, policy.bet(run, mm), Math.floor(run.coins / 10)));
    if (run.turnsLeft > 0 && run.coins >= bet * 10 && (run.hand === null || run.hand.phase === "done")) {
      if (typeof dealRound(run, mm, bet) === "string") break;
      turns++;
      for (let d = 0; d < 6 && run.hand !== null && run.hand.phase === "hold"; d++) {
        const hold = policy.hold(run, mm);
        const res = drawHand(run, mm, hold);
        if (res === "bad-hold") drawHand(run, mm, { rows: [], cols: [], cells: [] });
        else if (typeof res === "string") break;
      }
    } else if (!closeRound(run, mm, mk)) break;
  }
  return { rounds: run.completed, turns, minutes: (turns * SECONDS_PER_ROUND) / 60, bosses: run.stats.bosses, reason: run.phase === "over" ? "quota" : turns >= maxTurns ? "cap" : "stuck", phase: `${run.phase} hand=${run.hand?.phase ?? "none"} turns=${run.turnsLeft} coins=${run.coins}` };
}

export { CHARMS, UPGRADES };
