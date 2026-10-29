import { CHARMS, UPGRADES, upgradeCost } from "./content";
import type { Mods } from "./mods";
import { type HandName, HAND_ORDER, type PokerState, classify, deal, draw, freshPoker, payFor, toggleHold } from "./poker";
import { type CoinKind, type Pusher, W, dropCoin, newPusher, stepMany } from "./pusher";
import { type Rng, makeRng, next, shuffle } from "./rng";
import { type SlotResult, spin } from "./slot";
import { type MissionState, drawMissions, updateMissions } from "./missions";

export interface RunStats {
  spins: number;
  slotWins: number;
  bestSlotWin: number;
  jackpots: number;
  hands: number;
  goodHands: number;
  /** best hand rank this run: 0 none, 1 jacks .. 9 royal */
  bestHand: number;
  drops: number;
  pusherPaid: number;
  relics: number;
  maxCoins: number;
}

export type RunPhase = "play" | "draft" | "over";

export interface Run {
  rng: Rng;
  round: number;
  completed: number;
  turnsLeft: number;
  coins: number;
  freeDrops: number;
  quota: number;
  charms: string[];
  /** levels of the coin-bought upgrades */
  upgrades: Record<string, number>;
  phase: RunPhase;
  draft: string[];
  rerollsLeft: number;
  poker: PokerState;
  pusher: Pusher;
  /** winnings on their way onto the pusher: slot and poker pay by pouring coins on the shelf */
  pour: ("coin" | "gold")[];
  stats: RunStats;
  missions: MissionState[];
  /** chips already earned by missions this run */
  chipsPending: number;
  /** messages for the screen, drained by the app */
  events: string[];
  /** prizes that fell off the pusher and wait for the app to file them as relics */
  found: number;
  overReason: "" | "bust" | "quota";
  /** the chips of this run were paid to the meta */
  finished: boolean;
}

export const QUOTA_BASE = 15;
export const QUOTA_GROWTH = 1.35;

export function quotaFor(round: number, m: Mods): number {
  return Math.max(1, Math.round(QUOTA_BASE * Math.pow(QUOTA_GROWTH, round - 1) * m.quotaMul));
}

export function startRun(seed: number, m: Mods): Run {
  const rng = makeRng(seed);
  const run: Run = {
    rng,
    round: 1,
    completed: 0,
    turnsLeft: m.turns,
    coins: m.startCoins,
    freeDrops: m.freeDropsPerRound,
    quota: quotaFor(1, m),
    charms: [],
    upgrades: {},
    phase: "play",
    draft: [],
    rerollsLeft: m.rerolls,
    poker: freshPoker(),
    pusher: newPusher(rng),
    pour: [],
    stats: { spins: 0, slotWins: 0, bestSlotWin: 0, jackpots: 0, hands: 0, goodHands: 0, bestHand: 0, drops: 0, pusherPaid: 0, relics: 0, maxCoins: m.startCoins },
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

export type Refusal = "not-playing" | "no-turns" | "busy" | "no-coins" | "bad-bet";

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

/** The round can be closed once the turns are gone or nothing more can be paid for, and no hand is open. */
export function canClose(run: Run, m: Mods): boolean {
  return run.phase === "play" && run.poker.phase === "bet" && (run.turnsLeft <= 0 || run.coins < m.slotLines * MIN_BET);
}

/** Close the round: pay the quota from the wallet (coins still on the shelf do not count) and offer charms, or end the run. */
export function closeRound(run: Run, m: Mods, mk: (charms: string[]) => Mods): boolean {
  if (!canClose(run, m)) return false;
  settle(run, m, mk);
  return true;
}

/** Winnings go onto the pusher shelf as coins; every fifth coin is gold. */
function pourCoins(run: Run, n: number): void {
  for (let i = 0; i < Math.floor(n / 5); i++) run.pour.push("gold");
  for (let i = 0; i < n % 5; i++) run.pour.push("coin");
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
  run.events.push(`Quota of ${run.quota} paid.`);
  run.round++;
  const pool = CHARMS.filter((c) => !run.charms.includes(c.id)).map((c) => c.id);
  if (pool.length === 0) return beginRound(run, mk(run.charms));
  run.draft = shuffle(run.rng, pool).slice(0, 3);
  run.rerollsLeft = m.rerolls;
  run.phase = "draft";
}

export function beginRound(run: Run, m: Mods): void {
  run.phase = "play";
  run.draft = [];
  run.quota = quotaFor(run.round, m);
  run.turnsLeft = m.turns;
  run.freeDrops += m.freeDropsPerRound;
}

export function pickCharm(run: Run, id: string, mk: (charms: string[]) => Mods): boolean {
  if (run.phase !== "draft" || !run.draft.includes(id)) return false;
  run.charms.push(id);
  beginRound(run, mk(run.charms));
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
  const pool = CHARMS.filter((c) => !run.charms.includes(c.id) && !run.draft.includes(c.id)).map((c) => c.id);
  if (pool.length === 0) return false;
  run.rerollsLeft--;
  run.draft = shuffle(run.rng, pool).slice(0, 3);
  return true;
}

/** One pull: pay the bet, spin the reels, pour the win on the pusher and deal a free poker hand of the same stake. */
export function spinSlot(run: Run, m: Mods, bet: number): Refusal | SlotResult {
  const no = canAct(run);
  if (no) return no;
  if (run.poker.phase !== "bet") return "busy";
  if (!Number.isInteger(bet) || bet < 1 || bet > m.slotMaxBet) return "bad-bet";
  const cost = bet * m.slotLines;
  if (cost > run.coins) return "no-coins";
  run.coins -= cost;
  run.turnsLeft--;
  const res = spin(run.rng, m.slotLines, bet, m.weights);
  res.payout = Math.round(res.payout * m.slotWinMul);
  pourCoins(run, res.payout);
  run.freeDrops += res.freeDrops;
  const s = run.stats;
  s.spins++;
  s.slotWins += res.wins.length;
  s.jackpots += res.wins.filter((w) => w.sym === "seven").length;
  if (res.payout > s.bestSlotWin) s.bestSlotWin = res.payout;
  deal(run.poker, run.rng, Math.min(bet, m.pokerMaxBet), m.pokerDraws);
  updateMissions(run);
  return res;
}

export function holdCard(run: Run, i: number): void {
  toggleHold(run.poker, i);
}

/** Draws; when the hand is over its win is poured on the pusher. */
export function drawPoker(run: Run, m: Mods): { done: boolean; name: HandName | null; pay: number } | null {
  if (run.poker.phase !== "hold") return null;
  const done = draw(run.poker);
  if (!done) return { done: false, name: null, pay: 0 };
  const name = classify(run.poker.hand);
  const pay = Math.round(payFor(name, run.poker.bet, m.pokerPay) * m.pokerMul);
  pourCoins(run, pay);
  const s = run.stats;
  s.hands++;
  if (name) {
    s.goodHands++;
    const rank = HAND_ORDER.length - HAND_ORDER.indexOf(name);
    if (rank > s.bestHand) s.bestHand = rank;
  }
  updateMissions(run);
  return { done: true, name, pay };
}

/** Drop a coin on the shelf: a free drop first, else one coin from the wallet. Costs a turn, like a pull. */
export function dropAt(run: Run, m: Mods, x: number): Refusal | CoinKind {
  const no = canAct(run);
  if (no) return no;
  if (run.poker.phase !== "bet") return "busy";
  if (run.freeDrops < 1 && run.coins < 1) return "no-coins";
  if (run.freeDrops >= 1) run.freeDrops--;
  else run.coins--;
  run.turnsLeft--;
  const kind: CoinKind = next(run.rng) < m.goldChance ? "gold" : "coin";
  dropCoin(run.pusher, x, kind);
  if (next(run.rng) < m.prizeChance) dropCoin(run.pusher, 1 + next(run.rng) * 8, "prize");
  run.stats.drops++;
  updateMissions(run);
  return kind;
}

/** Advance the pusher by n steps: queued winnings drop in, coins that fall off the front are paid into the wallet. Not a turn. */
export function tickPusher(run: Run, m: Mods, n: number): number {
  let room = Math.ceil(n / 4);
  while (room-- > 0 && run.pour.length > 0) {
    const kind = run.pour[0] as "coin" | "gold";
    if (!dropCoin(run.pusher, 0.6 + next(run.rng) * (W - 1.2), kind)) break;
    run.pour.shift();
  }
  const fallen = stepMany(run.pusher, n);
  let paid = 0;
  for (const c of fallen) {
    if (c.kind === "prize") {
      run.found++;
      run.stats.relics++;
      paid += Math.round(2 * m.pusherPayMul);
      continue;
    }
    paid += Math.max(1, Math.round((c.kind === "gold" ? 5 : 1) * m.pusherPayMul));
  }
  if (paid > 0) {
    gain(run, paid);
    run.stats.pusherPaid += paid;
    updateMissions(run);
  }
  return paid;
}

export function drainEvents(run: Run): string[] {
  const e = run.events;
  run.events = [];
  return e;
}

/** A saved run read back from untrusted storage: null when it does not look like a run. */
export function restoreRun(raw: unknown): Run | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Partial<Run>;
  const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
  const coinsOk = Array.isArray(o.pusher?.coins) && (o.pusher?.coins ?? []).every((c) => isNum(c?.x) && isNum(c?.y) && ["coin", "gold", "prize"].includes(c?.kind));
  const known = CHARMS.map((c) => c.id);
  if (
    !isNum(o.rng?.s) || !isNum(o.round) || !isNum(o.coins) || !isNum(o.turnsLeft) || !isNum(o.quota) || !isNum(o.completed) || !isNum(o.freeDrops) ||
    !coinsOk || !isNum(o.pusher?.t) || !isNum(o.pusher?.nextId) ||
    !Array.isArray(o.charms) || !o.charms.every((c) => known.includes(c)) ||
    !Array.isArray(o.draft) || !o.draft.every((c) => known.includes(c)) ||
    !["play", "draft", "over"].includes(o.phase as string) ||
    !o.poker || !["bet", "hold"].includes(o.poker.phase) || !Array.isArray(o.poker.hand) || !Array.isArray(o.poker.deck) || !Array.isArray(o.poker.held) ||
    !o.stats || !Array.isArray(o.missions) || !isNum(o.chipsPending) || !isNum(o.rerollsLeft)
  ) {
    return null;
  }
  const upgrades: Record<string, number> = {};
  for (const u of UPGRADES) {
    const l = (o.upgrades as Record<string, unknown> | undefined)?.[u.id];
    if (typeof l === "number" && l >= 1 && l <= u.max) upgrades[u.id] = Math.floor(l);
  }
  const pour = Array.isArray(o.pour) ? o.pour.filter((k) => k === "coin" || k === "gold") : [];
  return { ...(o as Run), pour, upgrades, events: [], found: 0, finished: o.finished === true, overReason: o.overReason ?? "" };
}
