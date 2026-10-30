import { ENDLESS_UPGRADES, type Upgrade, upgradeCost } from "./content";
import { type CardKind, applyCardUpgrade, cardUpgradeCost, shatterGlass } from "./cards-shop";
import { type Meta, type RunView, modsFor } from "./meta";
import { type Mods, scoreMods } from "./mods";
import { type Rng, makeRng } from "./rng";
import { restoreCardUpgrades, restoreHand } from "./run";
import { HAND_ORDER } from "./hands";
import { type CardUpgrade, type Deal, type Hold, LINES, type RoundResult, SIZE, deal, drawRound, holdSlots, scoreBoard } from "./round";

/** Endless mode (#10): no quota, no turns. The player plays rounds at their own pace, buys upgrades and card upgrades with coins, and prestiges at a late milestone. */
export interface Session {
  rng: Rng;
  coins: number;
  /** rounds played since the session (or the last prestige) began */
  rounds: number;
  /** coins won since then: milestones are read from this */
  totalEarned: number;
  /** levels of the shop upgrades */
  upgrades: Record<string, number>;
  /** upgrades on single cards (by card id), until the next prestige */
  cardUpgrades: Record<number, CardUpgrade>;
  /** the round on the table, or null */
  hand: Deal | null;
  /** how many of MILESTONES are reached */
  milestones: number;
  /** how often the player has prestiged */
  prestige: number;
  bestLines: number;
  /** numbers the achievements read, since the session began (they are not reset by a prestige) */
  bestHand: number;
  bestWin: number;
  heldWins: number;
  singleWins: number;
  maxCoins: number;
  linesTotal: number;
  /** the machine plays by itself (only when the tree gave an auto rate) */
  autoOn: boolean;
}

export type SessionRefusal = "bad-bet" | "busy" | "no-coins" | "bad-hold" | "no-hand";

/** Coins won since the start that reach each milestone. Each one makes every win 10% bigger. Starting values; the balance pass retunes them. */
export const MILESTONES: readonly number[] = [100, 400, 1500, 5000, 24000, 80000, 250000, 800000, 2400000, 7000000];
export const MILESTONE_MUL = 1.1;
/** Prestige is open once this many milestones are reached. */
export const PRESTIGE_AT = 8;
/** Every prestige makes every win this much bigger, for good. */
export const PRESTIGE_STEP = 0.25;
/** The base machine pays this much more here than in Climb: with no quota the player grows by being slightly ahead. */
export const ENDLESS_EDGE = 1.2;

export const prestigeMul = (n: number): number => 1 + PRESTIGE_STEP * Math.max(0, n);
/** Chips a prestige pays: 5, plus 5 for each milestone beyond the one prestige needs. */
export const prestigeChips = (milestones: number): number => (milestones >= PRESTIGE_AT ? 5 + 5 * (milestones - PRESTIGE_AT + 1) : 0);

/** What the endless shop sells. */
export const ENDLESS_SHOP: readonly Upgrade[] = ENDLESS_UPGRADES;

/** The mods of a session: the endless tree, the shop upgrades bought, the win multipliers of milestones and prestige. */
export function endlessMods(meta: Meta, s: Session): Mods {
  const m = modsFor(meta, "endless", [], {});
  for (const u of ENDLESS_SHOP) if ((s.upgrades[u.id] ?? 0) > 0) u.effect(m, s.upgrades[u.id] as number);
  m.slotWinMul *= ENDLESS_EDGE * Math.pow(MILESTONE_MUL, s.milestones) * prestigeMul(s.prestige);
  return m;
}

export function startSession(seed: number, m: Mods, prestigeCount: number): Session {
  return { rng: makeRng(seed), coins: m.startCoins, rounds: 0, totalEarned: 0, upgrades: {}, cardUpgrades: {}, hand: null, milestones: 0, prestige: prestigeCount, bestLines: 0, bestHand: 0, bestWin: 0, heldWins: 0, singleWins: 0, maxCoins: m.startCoins, linesTotal: 0, autoOn: false };
}

/**
 * Deal a round. It costs bet times the 10 lines. With less than one line of bet in the wallet the round is free and base-sized (bet 1): the machine never locks the player out.
 * With enough for a small bet but not for this one the player is told (`"no-coins"`) and chooses a smaller bet.
 */
export function dealSession(s: Session, m: Mods, bet: number): SessionRefusal | Deal {
  if (s.hand !== null && s.hand.phase === "hold") return "busy";
  if (!Number.isInteger(bet) || bet < 1 || bet > m.slotMaxBet) return "bad-bet";
  const broke = s.coins < LINES;
  if (!broke && s.coins < bet * LINES) return "no-coins";
  const staked = broke ? 1 : bet;
  if (!broke) s.coins -= bet * LINES;
  s.hand = deal(s.rng, staked, m.removedRanks, m.redraws);
  return s.hand;
}

/** Hold and draw. Only the last draw of a round pays; the win goes into the wallet and counts towards the milestones. */
export function drawSession(s: Session, m: Mods, hold: Hold): RoundResult | SessionRefusal {
  const d = s.hand;
  if (d === null || d.phase !== "hold") return "no-hand";
  if (holdSlots(hold) > m.holdMax) return "bad-hold";
  const res = drawRound(s.rng, d, hold, { removedRanks: m.removedRanks, singleHold: m.singleHold, upgrades: s.cardUpgrades, score: scoreMods(m) });
  if (typeof res === "string" || !res.final) return res;
  res.shattered = shatterGlass(s.rng, s.cardUpgrades, res.board, res.lines);
  s.coins += res.payout;
  s.totalEarned += res.payout;
  s.rounds++;
  s.bestLines = Math.max(s.bestLines, res.lines.length);
  s.linesTotal += res.lines.length;
  s.bestWin = Math.max(s.bestWin, res.payout);
  s.maxCoins = Math.max(s.maxCoins, s.coins);
  for (const l of res.lines) s.bestHand = Math.max(s.bestHand, HAND_ORDER.indexOf(l.rank) + 1);
  if (res.payout > 0 && hold.rows.length + hold.cols.length > 0) s.heldWins++;
  if (res.payout > 0 && hold.cells.length > 0) s.singleWins++;
  while (s.milestones < MILESTONES.length && s.totalEarned >= (MILESTONES[s.milestones] as number)) s.milestones++;
  return res;
}

/** The hold of automatic play: the best paying line (a row or a column), or nothing. */
export function autoHold(board: readonly number[], m: Mods, upgrades: Readonly<Record<number, CardUpgrade>>): Hold {
  if (m.holdMax === 0) return { rows: [], cols: [], cells: [] };
  const lines = scoreBoard(board, 1, upgrades, { handMul: m.handMul, globalMul: 1, lineBonus: 0 }).lines;
  const top = [...lines].sort((a, b) => b.pay - a.pay)[0];
  if (!top) return { rows: [], cols: [], cells: [] };
  return top.line < SIZE ? { rows: [top.line], cols: [], cells: [] } : { rows: [], cols: [top.line - SIZE], cells: [] };
}

/** The next level of a shop upgrade, bought with coins. */
export function buySessionUpgrade(s: Session, id: string, _m: Mods): boolean {
  const u = ENDLESS_SHOP.find((x) => x.id === id);
  if (!u) return false;
  const level = s.upgrades[id] ?? 0;
  const cost = upgradeCost(u, level);
  if (level >= u.max || s.coins < cost) return false;
  s.coins -= cost;
  s.upgrades[id] = level + 1;
  return true;
}

/** An upgrade on one card for this session, of a kind the endless tree has unlocked. */
export function buySessionCard(s: Session, card: number, kind: CardKind, m: Mods): boolean {
  if (!Number.isInteger(card) || card < 0 || card > 51 || !m.cardKinds.includes(kind)) return false;
  const cost = cardUpgradeCost(s.cardUpgrades, kind, m.cardCostMul);
  if (s.coins < cost) return false;
  const next = applyCardUpgrade(s.cardUpgrades, card, kind);
  if (next === null) return false;
  s.coins -= cost;
  s.cardUpgrades = next;
  return true;
}

/** The numbers of a session in the shape the achievements read. */
export function sessionView(s: Session): RunView {
  return { round: 0, cardUpgrades: s.cardUpgrades, stats: { spins: s.rounds, slotWins: s.linesTotal, bestSlotWin: s.bestWin, bestLines: s.bestLines, bestHand: s.bestHand, heldWins: s.heldWins, singleWins: s.singleWins, relics: 0, maxCoins: s.maxCoins, bosses: 0, events: 0 } };
}

export const canPrestige = (s: Session): boolean => s.milestones >= PRESTIGE_AT;

/** Start over with a permanent win multiplier and chips for the endless tree. Returns the chips (0 when prestige is not open yet). */
export function prestige(s: Session, meta: Meta): number {
  if (!canPrestige(s)) return 0;
  const chips = prestigeChips(s.milestones);
  meta.endless.chips += chips;
  meta.endless.stats.sessions++;
  meta.endless.stats.spins += s.rounds;
  meta.endless.stats.endings.prestige = (meta.endless.stats.endings.prestige ?? 0) + 1;
  s.prestige++;
  s.upgrades = {};
  s.cardUpgrades = {};
  s.hand = null;
  s.milestones = 0;
  s.totalEarned = 0;
  s.rounds = 0;
  s.coins = modsFor(meta, "endless", [], {}).startCoins;
  return chips;
}

/** A saved session from untrusted storage: null when it does not look like one; odd numbers and unknown upgrades are repaired or dropped. */
export function restoreSession(raw: unknown): Session | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
  const rng = o.rng as { s?: unknown } | null;
  if (!rng || typeof rng !== "object" || !isNum(rng.s) || !isNum(o.coins)) return null;
  const hand = o.hand === null || o.hand === undefined ? null : restoreHand(o.hand); // a hand that does not read back is dropped, the session goes on (the prestige count lives here)
  const nat = (x: unknown, max = Number.MAX_SAFE_INTEGER): number => (isNum(x) ? Math.min(max, Math.max(0, Math.floor(x))) : 0);
  const upgrades: Record<string, number> = {};
  for (const u of ENDLESS_SHOP) {
    const l = (o.upgrades as Record<string, unknown> | undefined)?.[u.id];
    if (isNum(l) && l >= 1) upgrades[u.id] = Math.min(u.max, Math.floor(l));
  }
  return { rng: { s: rng.s }, coins: nat(o.coins), rounds: nat(o.rounds), totalEarned: nat(o.totalEarned), upgrades, cardUpgrades: restoreCardUpgrades(o.cardUpgrades), hand, milestones: nat(o.milestones, MILESTONES.length), prestige: nat(o.prestige), bestLines: nat(o.bestLines), bestHand: nat(o.bestHand, HAND_ORDER.length), bestWin: nat(o.bestWin), heldWins: nat(o.heldWins), singleWins: nat(o.singleWins), maxCoins: nat(o.maxCoins), linesTotal: nat(o.linesTotal), autoOn: o.autoOn === true };
}
