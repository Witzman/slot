import { ENDLESS_UPGRADES, type Upgrade, upgradeCost } from "./content";
import { type SpinResult, spinBoard } from "./board";
import { type Meta, modsFor } from "./meta";
import type { Mods } from "./mods";
import { type Rng, makeRng } from "./rng";

/** Endless mode (#10): no quota, no turns. The player spins at their own pace, buys upgrades and board growth with coins, and prestiges at a late milestone. */
export interface Session {
  rng: Rng;
  coins: number;
  /** spins since the session (or the last prestige) began */
  spins: number;
  /** coins won since then: milestones are read from this */
  totalEarned: number;
  /** levels of the coin-bought upgrades */
  upgrades: Record<string, number>;
  /** how many of MILESTONES are reached */
  milestones: number;
  /** how often the player has prestiged */
  prestige: number;
  /** free spins from coin scatters */
  freeSpins: number;
  bestChain: number;
  /** the machine spins by itself (only when the tree gave an auto rate) */
  autoOn: boolean;
}

export type SessionRefusal = "bad-bet";

/** Coins won since the start that reach each milestone. Each one makes every win 10% bigger. Starting values; the balance pass retunes them. */
export const MILESTONES: readonly number[] = [60, 200, 600, 2000, 6000, 20000, 60000, 200000, 600000, 2000000];
export const MILESTONE_MUL = 1.1;
/** Prestige is open once this many milestones are reached. */
export const PRESTIGE_AT = 8;
/** Every prestige makes every win this much bigger, for good. */
export const PRESTIGE_STEP = 0.25;
/** The house edge of the base machine is smaller here: with no quota the player grows by being slightly ahead. */
export const ENDLESS_EDGE = 1.12;

export const prestigeMul = (n: number): number => 1 + PRESTIGE_STEP * Math.max(0, n);
/** Chips a prestige pays: 5 for the first milestone it needs, 5 more for each beyond, plus a base of 5. */
export const prestigeChips = (milestones: number): number => (milestones >= PRESTIGE_AT ? 5 + 5 * (milestones - PRESTIGE_AT + 1) : 0);

/** What the endless shop sells. */
export const ENDLESS_SHOP: readonly Upgrade[] = ENDLESS_UPGRADES;

/** The mods of a session: the endless tree and the upgrades bought, with the win multipliers of milestones and prestige. */
export function endlessMods(meta: Meta, s: Session): Mods {
  const m = modsFor(meta, "endless", [], s.upgrades);
  m.slotWinMul *= ENDLESS_EDGE * Math.pow(MILESTONE_MUL, s.milestones) * prestigeMul(s.prestige);
  return m;
}

export function startSession(seed: number, m: Mods, prestige: number): Session {
  return { rng: makeRng(seed), coins: m.startCoins, spins: 0, totalEarned: 0, upgrades: {}, milestones: 0, prestige, freeSpins: 0, bestChain: 0, autoOn: false };
}

/**
 * One spin. A free spin (from scatters) or a spin the wallet cannot pay is free and, in the second case, base-sized: the machine never locks the player out.
 * A free spin never wins more free spins. The board size is read from `m` at the call, so a row or column bought now shows on the next spin.
 */
export function spinSession(s: Session, m: Mods, bet: number): SessionRefusal | SpinResult {
  if (!Number.isInteger(bet) || bet < 1 || bet > m.slotMaxBet) return "bad-bet";
  const free = s.freeSpins > 0;
  const broke = !free && s.coins < bet;
  const staked = free ? bet : broke ? 1 : bet;
  if (free) s.freeSpins--;
  else if (!broke) s.coins -= bet;
  const res = spinBoard(s.rng, { rows: m.rows, cols: m.cols }, staked, { weights: m.weights, symPay: m.symPay, chainStart: m.chainStart, chainStep: m.chainStep, chainCap: m.chainCap, globalMul: m.slotWinMul });
  if (free) res.freeSpins = 0;
  s.coins += res.payout;
  s.totalEarned += res.payout;
  s.freeSpins += res.freeSpins;
  s.spins++;
  s.bestChain = Math.max(s.bestChain, res.steps.length);
  while (s.milestones < MILESTONES.length && s.totalEarned >= (MILESTONES[s.milestones] as number)) s.milestones++;
  return res;
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

export const canPrestige = (s: Session): boolean => s.milestones >= PRESTIGE_AT;

/** Start over with a permanent win multiplier and chips for the endless tree. Returns the chips (0 when prestige is not open yet). */
export function prestige(s: Session, meta: Meta): number {
  if (!canPrestige(s)) return 0;
  const chips = prestigeChips(s.milestones);
  meta.endless.chips += chips;
  meta.endless.stats.sessions++;
  meta.endless.stats.spins += s.spins;
  meta.endless.stats.endings.prestige = (meta.endless.stats.endings.prestige ?? 0) + 1;
  s.prestige++;
  s.upgrades = {};
  s.milestones = 0;
  s.totalEarned = 0;
  s.spins = 0;
  s.freeSpins = 0;
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
  const nat = (x: unknown, max = Number.MAX_SAFE_INTEGER): number => (isNum(x) ? Math.min(max, Math.max(0, Math.floor(x))) : 0);
  const upgrades: Record<string, number> = {};
  for (const u of ENDLESS_SHOP) {
    const l = (o.upgrades as Record<string, unknown> | undefined)?.[u.id];
    if (isNum(l) && l >= 1) upgrades[u.id] = Math.min(u.max, Math.floor(l));
  }
  return { rng: { s: rng.s }, coins: nat(o.coins), spins: nat(o.spins), totalEarned: nat(o.totalEarned), upgrades, milestones: nat(o.milestones, MILESTONES.length), prestige: nat(o.prestige), freeSpins: nat(o.freeSpins, 1000), bestChain: nat(o.bestChain), autoOn: o.autoOn === true };
}
