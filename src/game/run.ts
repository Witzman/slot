import { BOSSES, BOSS_EVERY, CHARMS, CURSES, RARITY_PRICE, RARITY_WEIGHT, UPGRADES, upgradeCost } from "./content";
import type { Mods } from "./mods";
import { type Rng, int, makeRng, weighted } from "./rng";
import { HAND_ORDER } from "./hands";
import { type CardKind, cardUpgradeCost, applyCardUpgrade } from "./cards-shop";
import { type CardUpgrade, type Deal, LINES, type RoundResult, deal, drawRound } from "./round";
import { eventById, rollEvent } from "./events";
import { type MissionState, drawMissions, updateMissions } from "./missions";

export interface RunStats {
  /** rounds played (a deal and its draw) */
  spins: number;
  /** hands scored over all rounds */
  slotWins: number;
  /** the most coins one round paid */
  bestSlotWin: number;
  /** the most hands scored in one round */
  bestLines: number;
  /** the best hand made: 0 none, else the index in HAND_ORDER plus 1 */
  bestHand: number;
  /** rounds that paid with at least one held row or column, and with held single cards */
  heldWins: number;
  singleWins: number;
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
  /** the round on the table: dealt, waiting for the draw, or drawn and showing its result until the next deal */
  hand: Deal | null;
  /** upgrades on single cards (by card id 0..51), for this run */
  cardUpgrades: Record<number, CardUpgrade>;
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
    hand: null,
    cardUpgrades: {},
    shop: [],
    shopRerolls: 0,
    rerollsLeft: m.rerolls,
    stats: { spins: 0, slotWins: 0, bestSlotWin: 0, bestLines: 0, bestHand: 0, heldWins: 0, singleWins: 0, relics: 0, maxCoins: m.startCoins, bosses: 0, events: 0 },
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

export type Refusal = "not-playing" | "no-turns" | "no-coins" | "bad-bet" | "busy" | "bad-hold" | "no-hand";

function canAct(run: Run): Refusal | null {
  if (run.phase !== "play") return "not-playing";
  if (run.turnsLeft <= 0) return "no-turns";
  return null;
}

function gain(run: Run, n: number): void {
  run.coins += n;
  if (run.coins > run.stats.maxCoins) run.stats.maxCoins = run.coins;
}

/** The least a round can cost per line; a round costs bet times the 10 lines. */
export const MIN_BET = 1;

/** The round can be closed once the turns are gone or nothing more can be paid for. */
export function canClose(run: Run, m: Mods): boolean {
  const open = run.hand !== null && run.hand.phase === "hold";
  return run.phase === "play" && !open && (run.turnsLeft <= 0 || run.coins < MIN_BET * LINES);
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

/** Deal a round: it costs the bet on each of the 10 lines and one turn, and the cards are on the table to hold from. */
export function dealRound(run: Run, m: Mods, bet: number): Refusal | Deal {
  const no = canAct(run);
  if (no) return no;
  if (run.hand !== null && run.hand.phase === "hold") return "busy";
  if (!Number.isInteger(bet) || bet < 1 || bet > m.slotMaxBet) return "bad-bet";
  if (bet * LINES > run.coins) return "no-coins";
  run.coins -= bet * LINES;
  run.turnsLeft--;
  run.hand = deal(run.rng, bet, m.removedRanks, m.redraws);
  return run.hand;
}

/** Hold rows, columns (and single cards with the tree's node) and draw. Only the last draw of a round pays; the win goes into the wallet. */
export function drawHand(run: Run, m: Mods, hold: { rows: number[]; cols: number[]; cells: number[] }): RoundResult | "bad-hold" | "no-hand" {
  const d = run.hand;
  if (run.phase !== "play" || d === null || d.phase !== "hold") return "no-hand";
  if (hold.rows.length + hold.cols.length > m.holdMax || (m.holdMax === 0 && hold.cells.length > 0)) return "bad-hold";
  const res = drawRound(run.rng, d, hold, { removedRanks: m.removedRanks, singleHold: m.singleHold, upgrades: run.cardUpgrades, score: { handMul: m.handMul, globalMul: m.slotWinMul, lineBonus: m.lineBonus } });
  if (typeof res === "string" || !res.final) return res;
  gain(run, res.payout);
  const s = run.stats;
  s.spins++;
  s.slotWins += res.lines.length;
  s.bestLines = Math.max(s.bestLines, res.lines.length);
  for (const l of res.lines) s.bestHand = Math.max(s.bestHand, HAND_ORDER.indexOf(l.rank) + 1);
  if (res.payout > s.bestSlotWin) s.bestSlotWin = res.payout;
  if (res.payout > 0 && hold.rows.length + hold.cols.length > 0) s.heldWins++;
  if (res.payout > 0 && hold.cells.length > 0) s.singleWins++;
  updateMissions(run);
  return res;
}

export function drainEvents(run: Run): string[] {
  const e = run.events;
  run.events = [];
  return e;
}

function restoreHand(raw: unknown): Deal | null {
  if (typeof raw !== "object" || raw === null) return null;
  const h = raw as Partial<Deal>;
  const ok = Array.isArray(h.board) && h.board.length === 25 && h.board.every((c) => Number.isInteger(c) && c >= 0 && c < 52) && new Set(h.board).size === 25;
  if (!ok || (h.phase !== "hold" && h.phase !== "done") || !Number.isInteger(h.bet) || (h.bet as number) < 1 || !Number.isInteger(h.draws) || !Number.isInteger(h.maxDraws) || (h.maxDraws as number) < 1) return null;
  return { board: [...(h.board as number[])], bet: h.bet as number, phase: h.phase, draws: h.draws as number, maxDraws: h.maxDraws as number };
}

function restoreCardUpgrades(raw: unknown): Record<number, CardUpgrade> {
  const out: Record<number, CardUpgrade> = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const card = Number(k);
    if (!Number.isInteger(card) || card < 0 || card > 51 || typeof v !== "object" || v === null) continue;
    const u = v as CardUpgrade;
    const clean: CardUpgrade = {};
    if (typeof u.rank === "number" && u.rank >= 1) clean.rank = Math.min(12, Math.floor(u.rank));
    if (u.joker === true) clean.joker = true;
    if (u.gold === true) clean.gold = true;
    if (u.anySuit === true) clean.anySuit = true;
    if (Object.keys(clean).length > 0) out[card] = clean;
  }
  return out;
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
  const stats = { ...(o.stats as RunStats), events: Math.max(0, Math.floor(num0(st.events))), bosses: Math.max(0, Math.floor(num0(st.bosses))), heldWins: Math.max(0, Math.floor(num0(st.heldWins))), singleWins: Math.max(0, Math.floor(num0(st.singleWins))), bestLines: Math.max(0, Math.floor(num0(st.bestLines))), bestHand: Math.max(0, Math.floor(num0(st.bestHand))) };
  if (o.phase === "event" && !eventId) return null;
  if (!("hand" in o) || !("cardUpgrades" in o)) return null; // a run from before the cards
  const hand = restoreHand(o.hand);
  if (o.hand !== null && hand === null) return null;
  const cardUpgrades = restoreCardUpgrades(o.cardUpgrades);
  return { ...(o as Run), stake: Math.min(5, Math.max(0, Math.floor(num0(o.stake)))), boss: bossId, event: o.phase === "event" ? eventId : null, stats, tickets: Math.max(0, Math.floor(num0(o.tickets))), hand, cardUpgrades, shop, shopRerolls: Math.max(0, Math.floor(num0(o.shopRerolls))), upgrades, events: [], found: 0, finished: o.finished === true, overReason: o.overReason ?? "" };
}

/** Buy an upgrade on one card of the deck with coins, for this run. Not a turn. False when it is not allowed or not affordable. */
export function buyCardUpgrade(run: Run, card: number, kind: CardKind, m: Mods): boolean {
  if (run.phase !== "play" || !Number.isInteger(card) || card < 0 || card > 51 || !m.cardKinds.includes(kind)) return false;
  const cost = cardUpgradeCost(run.cardUpgrades, kind, m.cardCostMul);
  if (run.coins < cost) return false;
  const next = applyCardUpgrade(run.cardUpgrades, card, kind);
  if (next === null) return false;
  run.coins -= cost;
  run.cardUpgrades = next;
  return true;
}
