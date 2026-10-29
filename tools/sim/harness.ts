// Simulation harness: a policy plays whole runs on the pure src/game layer, no browser.
// Run a script with: npx tsx tools/sim/<script>.ts
import { type Meta, modsFor, newMeta } from "../../src/game/meta";
import type { Mods } from "../../src/game/mods";
import {
  type Run, buyCharm, buyUpgrade, chooseEvent, closeRound, drawPoker, dropAt, holdCard, pickCharm, rerollShop, spinSlot, startRun, tickPusher, canClose,
} from "../../src/game/run";
import { rank } from "../../src/game/poker";

/** What a policy may do. Every call returns what happened, and the harness keeps the flows. */
export class Player {
  slotPaid = 0;
  slotSpent = 0;
  pokerPaid = 0;
  pokerStake = 0;
  pusherPaid = 0;
  dropsSpent = 0;
  pulls = 0;
  drops = 0;
  /** coins poured on the shelf by slot and poker wins (the wallet gets them back only through the pusher) */
  poured = 0;

  constructor(public run: Run, public meta: Meta) {}

  mk = (charms: string[]): Mods => modsFor(this.meta, charms, this.run.upgrades, this.run.boss, this.run.stake);
  mods = (): Mods => this.mk(this.run.charms);

  /** one pull: bet per line; returns the slot payout or null when refused */
  pull(bet: number): number | null {
    const m = this.mods();
    const before = this.run.coins;
    const res = spinSlot(this.run, m, bet);
    if (typeof res === "string") return null;
    this.pulls++;
    this.slotSpent += before - this.run.coins;
    this.slotPaid += res.payout;
    this.poured += res.payout;
    this.pokerStake += this.run.poker.bet;
    return res.payout;
  }

  /** hold the cards flagged in `hold` and draw; keeps drawing until the hand ends */
  draw(hold: boolean[]): number {
    const p = this.run.poker;
    let pay = 0;
    for (let guard = 0; guard < 3 && p.phase === "hold"; guard++) {
      p.held = [false, false, false, false, false];
      hold.forEach((h, i) => h && holdCard(this.run, i));
      const out = drawPoker(this.run, this.mods());
      if (out?.done) pay = out.pay;
    }
    this.pokerPaid += pay;
    this.poured += pay;
    return pay;
  }

  drop(x: number): boolean {
    const before = this.run.coins;
    const free = this.run.freeDrops;
    const r = dropAt(this.run, this.mods(), x);
    if (r === "coin" || r === "gold") {
      this.drops++;
      if (free < 1) this.dropsSpent += before - this.run.coins;
      return true;
    }
    return false;
  }

  /** let the shelf run n steps; returns the wallet coins it paid */
  tick(n: number): number {
    const paid = tickPusher(this.run, this.mods(), n);
    this.pusherPaid += paid;
    return paid;
  }

  canClose = (): boolean => canClose(this.run, this.mods());
  close = (): boolean => closeRound(this.run, this.mods(), this.mk);
  call = (i: number): boolean => pickCharm(this.run, this.run.draft[i] as string, this.mk);
  buy = (id: string): boolean => buyCharm(this.run, id);
  restock = (): boolean => rerollShop(this.run);
  upgrade = (id: string): boolean => buyUpgrade(this.run, id);
  event = (i: number): boolean => chooseEvent(this.run, i, this.mk);
}

export interface Policy {
  name: string;
  /** one decision at a time; the harness calls it until the run is over */
  step(p: Player): void;
}

export interface RunResult {
  seed: number;
  /** the round the run ended in (cleared rounds + 1) */
  round: number;
  completed: number;
  bosses: number;
  overReason: string;
  coins: number;
  steps: number;
  slotPaid: number;
  slotSpent: number;
  pokerPaid: number;
  pokerStake: number;
  pusherPaid: number;
  dropsSpent: number;
  poured: number;
  pulls: number;
  drops: number;
  charms: string[];
  upgrades: Record<string, number>;
  stalled: boolean;
}

export interface Options {
  meta?: Meta;
  stake?: number;
  maxSteps?: number;
}

export function playRun(seed: number, policy: Policy, opts: Options = {}): RunResult {
  const meta = opts.meta ?? newMeta();
  const stake = Math.min(opts.stake ?? 0, meta.maxStake);
  const run = startRun(seed, modsFor(meta, [], {}, null, stake), stake);
  const p = new Player(run, meta);
  const max = opts.maxSteps ?? 4000;
  let steps = 0;
  let stalled = false;
  let last = "";
  for (; steps < max && run.phase !== "over"; steps++) {
    policy.step(p);
    run.events = [];
    run.found = 0;
    const sig = `${run.phase}|${run.round}|${run.turnsLeft}|${run.coins}|${run.tickets}|${run.poker.phase}|${run.freeDrops}|${run.pusher.t}`;
    if (sig === last) {
      // a policy that did nothing: let the shelf run so the run cannot hang
      p.tick(60);
      if (++stallCount > 50) {
        stalled = true;
        break;
      }
    } else stallCount = 0;
    last = sig;
  }
  stallCount = 0;
  return {
    seed, round: run.round, completed: run.completed, bosses: run.stats.bosses, overReason: run.overReason || (steps >= max ? "steps" : stalled ? "stalled" : ""), coins: run.coins, steps,
    slotPaid: p.slotPaid, slotSpent: p.slotSpent, pokerPaid: p.pokerPaid, pokerStake: p.pokerStake, pusherPaid: p.pusherPaid, dropsSpent: p.dropsSpent, poured: p.poured,
    pulls: p.pulls, drops: p.drops, charms: [...run.charms], upgrades: { ...run.upgrades }, stalled,
  };
}
let stallCount = 0;

export function batch(policy: Policy, n: number, opts: Options = {}, seed0 = 1): RunResult[] {
  return Array.from({ length: n }, (_, i) => playRun(seed0 + i, policy, opts));
}

export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s.length % 2 ? (s[(s.length - 1) / 2] as number) : ((s[s.length / 2 - 1] as number) + (s[s.length / 2] as number)) / 2;
};
export const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

export function summary(rs: RunResult[]): string {
  const rounds = rs.map((r) => r.round);
  const dist: Record<number, number> = {};
  for (const r of rounds) dist[r] = (dist[r] ?? 0) + 1;
  const causes: Record<string, number> = {};
  for (const r of rs) causes[r.overReason] = (causes[r.overReason] ?? 0) + 1;
  return `n=${rs.length} median round ${median(rounds)} mean ${mean(rounds).toFixed(2)} | dist ${JSON.stringify(dist)} | over ${JSON.stringify(causes)} | boss3 reached ${(rs.filter((r) => r.round >= 3).length / rs.length * 100).toFixed(0)}% beaten ${(rs.filter((r) => r.bosses >= 1).length / rs.length * 100).toFixed(0)}%`;
}

/** The policy the unit tests use: weak on purpose. Kept as the baseline every other policy is compared with. */
export const naive: Policy = {
  name: "naive",
  step(p) {
    const r = p.run;
    if (r.phase === "event") return void p.event(1);
    if (r.phase === "draft") return void p.call(0);
    if (r.poker.phase === "hold") {
      const counts = new Map<number, number>();
      for (const c of r.poker.hand) counts.set(rank(c), (counts.get(rank(c)) ?? 0) + 1);
      return void p.draw(r.poker.hand.map((c) => (counts.get(rank(c)) ?? 0) >= 2 || rank(c) >= 11));
    }
    if (r.turnsLeft > 0 && r.coins >= p.mods().slotLines) {
      p.pull(1);
      if (r.turnsLeft % 2 === 0) p.drop(1 + (r.turnsLeft % 8));
    } else {
      p.tick(60 * 20);
      p.close();
    }
    p.tick(60 * 3);
  },
};
