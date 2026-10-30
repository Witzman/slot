import { BOSSES, BOSS_EVERY, CHARMS, CURSES, RARITY_PRICE, RARITY_WEIGHT, UPGRADES, upgradeCost } from "./content";
import type { Mods } from "./mods";
import { type Rng, int, makeRng, weighted } from "./rng";
import { type SpinResult, spinBoard } from "./board";
import { eventById, rollEvent } from "./events";
import { type MissionState, drawMissions, updateMissions } from "./missions";

export interface RunStats {
  spins: number;
  slotWins: number;
  bestSlotWin: number;
  jackpots: number;
  scatters: number;
  /** most cascade steps in one spin */
  bestChain: number;
  relics: number;
  maxCoins: number;
  bosses: number;
  events: number;
}

export type RunPhase = "play" | "event" | "draft" | "over";

export interface Run {
  rng: Rng;
  round: number;
  /** stake the run was started at: more quota, from stake 3 one turn less */
  stake: number;
  /** boss of the current round, or null */
  boss: string | null;
  /** the event waiting for a choice while the phase is "event" */
  event: string | null;
  completed: number;
  turnsLeft: number;
  coins: number;
  quota: number;
  charms: string[];
  /** levels of the coin-bought upgrades */
  upgrades: Record<string, number>;
  phase: RunPhase;
  draft: string[];
  /** run tickets: earned by rounds, missions and scatters, spent on charms in the shop */
  tickets: number;
  /** free spins from coin scatters: a free spin costs no coins and no turn */
  freeSpins: number;
  /** charms for sale after this round */
  shop: string[];
  /** shop re-rolls bought this round */
  shopRerolls: number;
  rerollsLeft: number;
  stats: RunStats;
  missions: MissionState[];
  /** chips already earned by missions this run */
  chipsPending: number;
  /** messages for the screen, drained by the app */
  events: string[];
  /** relics earned by beating bosses that wait for the app to file them */
  found: number;
  overReason: "" | "bust" | "quota";
  /** the chips of this run were paid to the meta */
  finished: boolean;
}

export const QUOTA_BASE = 14;
/** Growth per round up to QUOTA_BREAK, and from there on: the early game is forgiving, the late game cannot be farmed for ever (balance run, #9). */
export const QUOTA_GROWTH = 1.3;
export const QUOTA_BREAK = 5;
export const QUOTA_GROWTH_LATE = 1.7;

export function quotaFor(round: number, m: Mods): number {
  const early = Math.min(round, QUOTA_BREAK) - 1;
  const late = Math.max(0, round - QUOTA_BREAK);
  return Math.max(1, Math.round(QUOTA_BASE * Math.pow(QUOTA_GROWTH, early) * Math.pow(QUOTA_GROWTH_LATE, late) * m.quotaMul));
}

export function startRun(seed: number, m: Mods, stake = 0): Run {
  const rng = makeRng(seed);
  const run: Run = {
    rng,
    round: 1,
    stake,
    boss: null,
    event: null,
    completed: 0,
    turnsLeft: m.turns,
    coins: m.startCoins,
    quota: quotaFor(1, m),
    charms: [],
    upgrades: {},
    phase: "play",
    draft: [],
    tickets: m.startTickets,
    freeSpins: 0,
    shop: [],
    shopRerolls: 0,
    rerollsLeft: m.rerolls,
    stats: { spins: 0, slotWins: 0, bestSlotWin: 0, jackpots: 0, scatters: 0, bestChain: 0, relics: 0, maxCoins: m.startCoins, bosses: 0, events: 0 },
    missions: [],
    chipsPending: 0,
    events: [],
    found: 0,
    overReason: "",
    finished: false,
  };
  run.missions = drawMissions(rng);
  return run;
}

export type Refusal = "not-playing" | "no-turns" | "no-coins" | "bad-bet";

function canAct(run: Run): Refusal | null {
  if (run.phase !== "play") return "not-playing";
  if (run.turnsLeft <= 0) return "no-turns";
  return null;
}

function gain(run: Run, n: number): void {
  run.coins += n;
  if (run.coins > run.stats.maxCoins) run.stats.maxCoins = run.coins;
}

export const MIN_BET = 1;

/** The round can be closed once the turns are gone or nothing more can be paid for. */
export function canClose(run: Run, m: Mods): boolean {
  return run.phase === "play" && (run.turnsLeft <= 0 || run.coins < MIN_BET);
}

/** Close the round: pay the quota from the wallet (coins still on the shelf do not count) and offer charms, or end the run. */
export function closeRound(run: Run, m: Mods, mk: (charms: string[]) => Mods): boolean {
  if (!canClose(run, m)) return false;
  settle(run, m, mk);
  return true;
}

function settle(run: Run, m: Mods, mk: (charms: string[]) => Mods): void {
  const interest = Math.min(15, Math.floor(run.coins * m.interest));
  if (interest > 0) {
    gain(run, interest);
    run.events.push(`Interest: +${interest} coins`);
  }
  if (run.coins < run.quota) {
    run.phase = "over";
    run.overReason = "quota";
    run.events.push(`Quota of ${run.quota} missed.`);
    return;
  }
  run.coins -= run.quota;
  run.completed++;
  if (run.boss) {
    run.stats.bosses++;
    run.tickets += 2;
    run.chipsPending += 3;
    run.found++;
    run.events.push(`${BOSSES.find((b) => b.id === run.boss)?.name ?? "The boss"} is beaten: +2 tickets, +3 chips, a relic`);
    run.boss = null;
  }
  run.events.push(`Quota of ${run.quota} paid.`);
  run.round++;
  run.tickets++;
  run.shopRerolls = 0;
  const event = rollEvent(run, m.eventChance);
  if (event) {
    run.event = event;
    run.phase = "event";
    return;
  }
  openDraft(run, m, mk);
}

/** The charm call and the shop after a cleared round (or the next round at once when every charm is owned). */
function openDraft(run: Run, m: Mods, mk: (charms: string[]) => Mods): void {
  if (CHARMS.every((c) => run.charms.includes(c.id))) return beginRound(run, mk);
  run.draft = drawCharms(run.rng, run.charms, [], 3);
  run.shop = drawCharms(run.rng, run.charms, run.draft, 4);
  run.rerollsLeft = m.rerolls;
  run.phase = "draft";
}

/** Take choice 0 or 1 of the waiting event; the charm call follows. Mods are read after the choice (a curse or a blessing counts). */
export function chooseEvent(run: Run, index: number, mk: (charms: string[]) => Mods): boolean {
  const ev = eventById(run.event);
  const choice = ev?.choices[index];
  if (run.phase !== "event" || !ev || !choice) return false;
  if (choice.can && !choice.can(run)) return false;
  run.events.push(`${ev.title}: ${choice.apply(run)}`);
  run.stats.events++;
  run.event = null;
  openDraft(run, mk(run.charms), mk);
  return true;
}

/** Up to n charms the run does not own and that are not in `skip`, drawn by rarity without repeats. */
export function drawCharms(rng: Rng, owned: readonly string[], skip: readonly string[], n: number): string[] {
  const pool = CHARMS.filter((c) => !owned.includes(c.id) && !skip.includes(c.id));
  const out: string[] = [];
  while (out.length < n && pool.length > 0) {
    const i = weighted(rng, pool.map((c) => RARITY_WEIGHT[c.rarity]));
    out.push((pool.splice(i, 1)[0] as { id: string }).id);
  }
  return out;
}

export const charmPrice = (id: string): number => RARITY_PRICE[CHARMS.find((c) => c.id === id)?.rarity ?? "rare"];
export const shopRerollPrice = (run: Run): number => 1 + run.shopRerolls;

/** Buy a charm from the shop with tickets. It joins the run at once (turns and drops from the next round). */
export function buyCharm(run: Run, id: string): boolean {
  if (run.phase !== "draft" || !run.shop.includes(id)) return false;
  const price = charmPrice(id);
  if (run.tickets < price) return false;
  run.tickets -= price;
  run.shop = run.shop.filter((x) => x !== id);
  run.draft = run.draft.filter((x) => x !== id);
  run.charms.push(id);
  return true;
}

export function rerollShop(run: Run): boolean {
  const price = shopRerollPrice(run);
  if (run.phase !== "draft" || run.tickets < price) return false;
  const fresh = drawCharms(run.rng, run.charms, run.draft, 4);
  if (fresh.length === 0) return false;
  run.tickets -= price;
  run.shopRerolls++;
  run.shop = fresh;
  return true;
}

/** Starts the round in `run.round`: a boss every third one, then quota, turns and free drops from the mods as they now are. */
export function beginRound(run: Run, mk: (charms: string[]) => Mods): void {
  run.boss = run.round % BOSS_EVERY === 0 ? (BOSSES[int(run.rng, BOSSES.length)] as { id: string }).id : null;
  const m = mk(run.charms);
  if (run.boss) {
    const b = BOSSES.find((x) => x.id === run.boss);
    run.events.push(`BOSS: ${b?.name ?? ""} - ${b?.text ?? ""}`);
  }
  run.phase = "play";
  run.draft = [];
  run.quota = quotaFor(run.round, m);
  run.turnsLeft = m.turns;
}

export function pickCharm(run: Run, id: string, mk: (charms: string[]) => Mods): boolean {
  if (run.phase !== "draft" || !run.draft.includes(id)) return false;
  run.charms.push(id);
  run.shop = [];
  beginRound(run, mk);
  return true;
}

/** Buy the next level of an upgrade with coins. Not a turn. Returns false when it cannot be bought. */
export function buyUpgrade(run: Run, id: string): boolean {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || run.phase !== "play") return false;
  const level = run.upgrades[id] ?? 0;
  const cost = upgradeCost(u, level);
  if (level >= u.max || run.coins < cost) return false;
  run.coins -= cost;
  run.upgrades[id] = level + 1;
  return true;
}

export function rerollDraft(run: Run): boolean {
  if (run.phase !== "draft" || run.rerollsLeft <= 0) return false;
  const fresh = drawCharms(run.rng, run.charms, [...run.draft, ...run.shop], 3);
  if (fresh.length === 0) return false;
  run.rerollsLeft--;
  run.draft = fresh;
  return true;
}

/** One pull: pay the bet, fill the board and play the cascade; the win goes into the wallet. A free spin (from scatters) costs no coins and no turn. */
export function spinSlot(run: Run, m: Mods, bet: number): Refusal | SpinResult {
  const free = run.phase === "play" && run.freeSpins > 0;
  const no = free ? null : canAct(run);
  if (no) return no;
  if (run.phase !== "play") return "not-playing";
  if (!Number.isInteger(bet) || bet < 1 || bet > m.slotMaxBet) return "bad-bet";
  if (!free && bet > run.coins) return "no-coins";
  if (free) run.freeSpins--;
  else {
    run.coins -= bet;
    run.turnsLeft--;
  }
  const res = spinBoard(run.rng, { rows: m.rows, cols: m.cols }, bet, { weights: m.weights, symPay: m.symPay, chainStep: m.chainStep, chainCap: m.chainCap, globalMul: m.slotWinMul });
  gain(run, res.payout);
  run.freeSpins += res.freeSpins;
  const s = run.stats;
  s.spins++;
  if (res.freeSpins > 0) s.scatters++;
  const clusters = res.steps.flatMap((st) => st.clusters);
  s.slotWins += clusters.length;
  s.jackpots += clusters.filter((c) => c.sym === "seven").length;
  s.bestChain = Math.max(s.bestChain, res.steps.length);
  if (res.payout > s.bestSlotWin) s.bestSlotWin = res.payout;
  updateMissions(run);
  return res;
}

export function drainEvents(run: Run): string[] {
  const e = run.events;
  run.events = [];
  return e;
}

/** A saved run read back from untrusted storage: null when it does not look like a run (a run from before the pusher and poker were removed is one of those). */
export function restoreRun(raw: unknown): Run | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Partial<Run>;
  if ("pusher" in o || "poker" in o) return null;
  const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
  const known = CHARMS.map((c) => c.id);
  if (
    !isNum(o.rng?.s) || !isNum(o.round) || !isNum(o.coins) || !isNum(o.turnsLeft) || !isNum(o.quota) || !isNum(o.completed) ||
    !Array.isArray(o.charms) || !o.charms.every((c) => known.includes(c) || CURSES.some((x) => x.id === c)) ||
    !Array.isArray(o.draft) || !o.draft.every((c) => known.includes(c)) ||
    !["play", "event", "draft", "over"].includes(o.phase as string) ||
    !o.stats || !Array.isArray(o.missions) || !isNum(o.chipsPending) || !isNum(o.rerollsLeft)
  ) {
    return null;
  }
  const upgrades: Record<string, number> = {};
  for (const u of UPGRADES) {
    const l = (o.upgrades as Record<string, unknown> | undefined)?.[u.id];
    if (typeof l === "number" && l >= 1 && l <= u.max) upgrades[u.id] = Math.floor(l);
  }
  const num0 = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const shop = Array.isArray(o.shop) ? o.shop.filter((c) => known.includes(c)) : [];
  const bossId = BOSSES.some((b) => b.id === o.boss) ? (o.boss as string) : null;
  const eventId = eventById(o.event ?? null) ? (o.event as string) : null;
  const st = o.stats as Partial<RunStats>;
  const stats = { ...(o.stats as RunStats), events: Math.max(0, Math.floor(num0(st.events))), bosses: Math.max(0, Math.floor(num0(st.bosses))), scatters: Math.max(0, Math.floor(num0(st.scatters))), bestChain: Math.max(0, Math.floor(num0(st.bestChain))) };
  if (o.phase === "event" && !eventId) return null;
  return { ...(o as Run), stake: Math.min(5, Math.max(0, Math.floor(num0(o.stake)))), boss: bossId, event: o.phase === "event" ? eventId : null, stats, tickets: Math.max(0, Math.floor(num0(o.tickets))), freeSpins: Math.max(0, Math.floor(num0(o.freeSpins))), shop, shopRerolls: Math.max(0, Math.floor(num0(o.shopRerolls))), upgrades, events: [], found: 0, finished: o.finished === true, overReason: o.overReason ?? "" };
}
