import { BOSSES, BOSS_EVERY, CHARMS, CURSES, RARITY_PRICE, RARITY_WEIGHT, UPGRADES, upgradeCost } from "./content";
import type { Mods } from "./mods";
import { type HandName, HAND_ORDER, type PokerState, classify, deal, draw, freshPoker, payFor, toggleHold } from "./poker";
import { type CoinKind, type Pusher, W, dropCoin, newPusher, stepMany } from "./pusher";
import { type Rng, int, makeRng, next, weighted } from "./rng";
import { type SlotResult, spin } from "./slot";
import { eventById, rollEvent } from "./events";
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
  freeDrops: number;
  quota: number;
  charms: string[];
  /** levels of the coin-bought upgrades */
  upgrades: Record<string, number>;
  phase: RunPhase;
  draft: string[];
  /** run tickets: earned by rounds, missions and scatters, spent on charms in the shop */
  tickets: number;
  /** charms for sale after this round */
  shop: string[];
  /** shop re-rolls bought this round */
  shopRerolls: number;
  rerollsLeft: number;
  poker: PokerState;
  pusher: Pusher;
  /** pusher zone 1..5: rises while coins pay out, multiplies the pusher payout, drops when a round closes */
  zone: number;
  /** wallet coins paid by the pusher since the zone last changed (negative while idle) */
  zoneHeat: number;
  /** steps since the pusher last paid */
  zoneIdle: number;
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
    freeDrops: m.freeDropsPerRound,
    quota: quotaFor(1, m),
    charms: [],
    upgrades: {},
    phase: "play",
    draft: [],
    tickets: m.startTickets,
    shop: [],
    shopRerolls: 0,
    rerollsLeft: m.rerolls,
    poker: freshPoker(),
    pusher: newPusher(rng),
    zone: 1,
    zoneHeat: 0,
    zoneIdle: 0,
    pour: [],
    stats: { spins: 0, slotWins: 0, bestSlotWin: 0, jackpots: 0, hands: 0, goodHands: 0, bestHand: 0, drops: 0, pusherPaid: 0, relics: 0, maxCoins: m.startCoins, bosses: 0, events: 0 },
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

/** Heat needed to leave zone 1, 2, 3, 4. */
export const ZONE_HEAT = [8, 14, 22, 32];
/** Steps without a payout before the heat starts to cool, and the steps per point of heat after that. */
export const ZONE_IDLE = 600;
export const ZONE_COOL = 60;

export const zoneMul = (run: Run, m: Mods): number => 1 + m.zoneStep * (run.zone - 1);

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
  run.zone = Math.max(1, run.zone - 1);
  run.zoneHeat = 0;
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
  run.freeDrops += m.freeDropsPerRound;
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

/** One pull: pay the bet, spin the reels, pour the win on the pusher and deal a free poker hand with the same stake (bet times lines, up to the poker max). */
export function spinSlot(run: Run, m: Mods, bet: number): Refusal | SlotResult {
  const no = canAct(run);
  if (no) return no;
  if (run.poker.phase !== "bet") return "busy";
  if (!Number.isInteger(bet) || bet < 1 || bet > m.slotMaxBet) return "bad-bet";
  const cost = bet * m.slotLines;
  if (cost > run.coins) return "no-coins";
  run.coins -= cost;
  run.turnsLeft--;
  const res = spin(run.rng, m.slotLines, bet, m.weights, m.symPay);
  res.payout = Math.round(res.payout * m.slotWinMul);
  pourCoins(run, res.payout);
  run.freeDrops += res.freeDrops;
  if (res.freeDrops > 0) run.tickets++;
  const s = run.stats;
  s.spins++;
  s.slotWins += res.wins.length;
  s.jackpots += res.wins.filter((w) => w.sym === "seven").length;
  if (res.payout > s.bestSlotWin) s.bestSlotWin = res.payout;
  deal(run.poker, run.rng, Math.min(cost, m.pokerMaxBet), m.pokerDraws);
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
  const mul = m.pusherPayMul * zoneMul(run, m);
  let paid = 0;
  for (const c of fallen) {
    if (c.kind === "prize") {
      run.found++;
      run.stats.relics++;
      paid += Math.max(1, Math.round(2 * mul));
      continue;
    }
    paid += Math.max(1, Math.round((c.kind === "gold" ? 5 : 1) * mul));
  }
  if (paid > 0) {
    gain(run, paid);
    run.stats.pusherPaid += paid;
    run.zoneIdle = 0;
    run.zoneHeat += paid;
    const need = ZONE_HEAT[run.zone - 1];
    if (need !== undefined && run.zone < m.zoneMax && run.zoneHeat >= need) {
      run.zone++;
      run.zoneHeat = 0;
      run.events.push(`Zone ${run.zone}! Pusher pays x${zoneMul(run, m).toFixed(1)}`);
    }
    updateMissions(run);
  } else {
    const before = run.zoneIdle;
    run.zoneIdle += n;
    if (run.zoneIdle > ZONE_IDLE) {
      const cools = Math.floor((run.zoneIdle - ZONE_IDLE) / ZONE_COOL) - Math.max(0, Math.floor((before - ZONE_IDLE) / ZONE_COOL));
      run.zoneHeat -= Math.max(0, cools);
      if (run.zoneHeat < 0) {
        run.zoneHeat = 0;
        if (run.zone > 1) run.zone--;
      }
    }
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
    !Array.isArray(o.charms) || !o.charms.every((c) => known.includes(c) || CURSES.some((x) => x.id === c)) ||
    !Array.isArray(o.draft) || !o.draft.every((c) => known.includes(c)) ||
    !["play", "event", "draft", "over"].includes(o.phase as string) ||
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
  const num0 = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const zone = Math.min(5, Math.max(1, Math.floor(num0(o.zone) || 1)));
  const shop = Array.isArray(o.shop) ? o.shop.filter((c) => known.includes(c)) : [];
  const pour = Array.isArray(o.pour) ? o.pour.filter((k) => k === "coin" || k === "gold") : [];
  const bossId = BOSSES.some((b) => b.id === o.boss) ? (o.boss as string) : null;
  const eventId = eventById(o.event ?? null) ? (o.event as string) : null;
  const stats = { ...(o.stats as RunStats), events: Math.max(0, Math.floor(num0((o.stats as Partial<RunStats>).events))), bosses: Math.max(0, Math.floor(num0((o.stats as Partial<RunStats>).bosses))) };
  if (o.phase === "event" && !eventId) return null;
  return { ...(o as Run), stake: Math.min(5, Math.max(0, Math.floor(num0(o.stake)))), boss: bossId, event: o.phase === "event" ? eventId : null, stats, tickets: Math.max(0, Math.floor(num0(o.tickets))), shop, shopRerolls: Math.max(0, Math.floor(num0(o.shopRerolls))), zone, zoneHeat: Math.max(0, num0(o.zoneHeat)), zoneIdle: Math.max(0, num0(o.zoneIdle)), pour, upgrades, events: [], found: 0, finished: o.finished === true, overReason: o.overReason ?? "" };
}
