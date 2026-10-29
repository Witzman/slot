// A competent policy: Jacks-or-Better hold strategy, bet sizing, charm/upgrade valuation by a small income model, event heuristics.
import type { Player, Policy } from "./harness";
import { rank, suit, classify, deal, draw, freshPoker, type HandName, HAND_ORDER } from "../../src/game/poker";
import { CHARMS, CURSES, UPGRADES, upgradeCost, RARITY_PRICE } from "../../src/game/content";
import { LINE_PAY, CHERRY_PAIR, SYMS, type Sym, linePay } from "../../src/game/slot";
import { makeRng } from "../../src/game/rng";
import type { Mods } from "../../src/game/mods";

/** Hold flags for a Jacks-or-Better hand (priority strategy, close to optimal for a 9/6 table). */
export function holdFor(hand: readonly number[]): boolean[] {
  const rk = hand.map(rank);
  const st = hand.map(suit);
  const idxAll = [0, 1, 2, 3, 4];
  const cnt = new Map<number, number>();
  for (const r of rk) cnt.set(r, (cnt.get(r) ?? 0) + 1);
  const only = (pred: (i: number) => boolean) => idxAll.map(pred);
  const sc = [0, 0, 0, 0];
  st.forEach((s) => sc[s]++);
  const made = classify(hand);
  if (made && made !== "jacks" && made !== "twoPair" && made !== "three" && made !== "four") return [true, true, true, true, true];
  if (made === "four") return only((i) => cnt.get(rk[i]!) === 4);
  if (made === "three") return only((i) => cnt.get(rk[i]!) === 3);
  const fs = sc.findIndex((n) => n >= 4);
  // 4 to a royal
  if (fs >= 0 && idxAll.filter((i) => st[i] === fs).every((i) => rk[i]! >= 10)) return only((i) => st[i] === fs);
  if (made === "twoPair") return only((i) => cnt.get(rk[i]!) === 2);
  // 4 to a straight flush (open or inside), only when there is no pair
  if (fs >= 0 && !made) {
    const rr = idxAll.filter((i) => st[i] === fs).map((i) => rk[i]!);
    if (Math.max(...rr) - Math.min(...rr) <= 4) return only((i) => st[i] === fs);
  }
  if (made === "jacks") return only((i) => cnt.get(rk[i]!) === 2);
  // 3 to a royal
  for (let s = 0; s < 4; s++) {
    const idx = idxAll.filter((i) => st[i] === s && rk[i]! >= 10);
    if (idx.length >= 3) return only((i) => idx.slice(0, 3).includes(i));
  }
  if (fs >= 0) return only((i) => st[i] === fs);
  const lowPair = [...cnt.entries()].find(([, n]) => n === 2);
  if (lowPair) return only((i) => rk[i] === lowPair[0]);
  // 4 to an open-ended straight
  const uniq = [...new Set(rk)].sort((a, b) => a - b);
  for (let r = 3; r <= 10; r++) if ([r, r + 1, r + 2, r + 3].every((x) => uniq.includes(x))) {
    const used = new Set<number>();
    return only((i) => rk[i]! >= r && rk[i]! <= r + 3 && !used.has(rk[i]!) && !!used.add(rk[i]!));
  }
  // 2 suited high cards
  for (let s = 0; s < 4; s++) {
    const idx = idxAll.filter((i) => st[i] === s && rk[i]! >= 11);
    if (idx.length >= 2) return only((i) => idx.slice(0, 2).includes(i));
  }
  const highs = idxAll.filter((i) => rk[i]! >= 11).sort((a, b) => rk[a]! - rk[b]!);
  if (highs.length > 0) return only((i) => i === highs[0]);
  return [false, false, false, false, false];
}

// ---------- income model ----------
let freq: Record<string, number> | null = null;
function handFreq(): Record<string, number> {
  if (freq) return freq;
  const rng = makeRng(99);
  const s = freshPoker();
  const n = 40000;
  const f: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    deal(s, rng, 1, 1);
    s.held = holdFor(s.hand);
    draw(s);
    const c = classify(s.hand);
    if (c) f[c] = (f[c] ?? 0) + 1 / n;
  }
  return (freq = f);
}
const pokerRtp = (m: Mods): number => {
  const f = handFreq();
  let t = 0;
  for (const h of HAND_ORDER) t += (f[h] ?? 0) * m.pokerPay[h as HandName];
  return t * m.pokerMul * (m.pokerDraws > 1 ? 1.08 : 1);
};
/** exact slot RTP per line per unit bet */
function slotRtp(m: Mods): number {
  const tot = SYMS.reduce((a, s) => a + m.weights[s], 0);
  let rtp = 0;
  for (const a of SYMS) for (const b of SYMS) for (const c of SYMS) {
    const pr = (m.weights[a] * m.weights[b] * m.weights[c]) / tot ** 3;
    const hit = linePay([a, b, c]);
    if (hit) rtp += pr * hit.pay * (m.symPay[hit.sym] ?? 1);
  }
  return rtp * m.slotWinMul;
}
void LINE_PAY; void CHERRY_PAIR; void (0 as unknown as Sym);

export interface Tuning {
  name: string;
  zoneExp: number;
  /** turns kept back for pushing coins when the wallet is short */
  loan: "never" | "early" | "always";
  suitcase: "coins" | "ticket" | "early";
  horizon: number;
  reserveDrops: number;
  dropX: "center" | "sweep" | "front";
  useFreeDrops: boolean;
  /** wallet floor kept while betting, as a share of the quota */
  resFrac: number;
  /** coin drops per pull (fractions accumulate) */
  dropsPerPull: number;
  /** max bet cap (0 = the game's) */
  betCap: number;
  /** pause between pulls in steps */
  wait: number;
  /** upgrade horizon scale: 0 disables upgrades */
  upg: number;
  /** wallet floor kept after buying an upgrade, share of quota */
  upFloor: number;
  /** bet cap while round <= earlyRounds */
  earlyCap: number;
  earlyRounds: number;
  /** upgrades allowed (empty = all by value) */
  only: string[];
  /** value of one free drop in coins (pipeline: a drop pushes out stock) */
  dv: number;
}

export const DEFAULT: Tuning = { name: "smart", zoneExp: 2, loan: "early", suitcase: "early", horizon: 3, reserveDrops: 0, dropX: "sweep", useFreeDrops: true, resFrac: 0.8, dropsPerPull: 0, betCap: 2, wait: 180, upg: 0, upFloor: 1.5, earlyCap: 0, earlyRounds: 0, only: [], dv: 1.3 };

export function makePolicy(t: Tuning): Policy {
  /** value of a mod set: coins per round of net income plus free drops, in units of quota */
  const F = (m: Mods): number => {
    const zm = 1 + m.zoneStep * (Math.min(m.zoneMax, t.zoneExp) - 1);
    const k = zm * m.pusherPayMul;
    const sr = slotRtp(m);
    const pr = pokerRtp(m);
    const L = m.slotLines;
    let best = -1e9;
    for (let b = 1; b <= m.slotMaxBet; b++) {
      const bp = Math.min(b, m.pokerMaxBet);
      best = Math.max(best, (b * L * sr + bp * pr) * k - b * L);
    }
    const dropVal = t.dv * k;
    let income = m.turns * best + m.freeDropsPerRound * dropVal;
    income += Math.min(15, income * m.interest * 1.5);
    return Math.max(0.5, income) / m.quotaMul;
  };
  const value = (p: Player, charms: string[]): number => F(p.mk(charms));

  const bought = new WeakMap<object, number>(); // run -> round in which upgrades were looked at
  let dropCursor = 0;

  const upgrades = (p: Player): void => {
    const r = p.run;
    if (bought.get(r) === r.round) return;
    bought.set(r, r.round);
    for (let guard = 0; guard < 12; guard++) {
      const base = F(p.mods());
      let pick: string | null = null;
      let bestGain = 0;
      for (const u of UPGRADES) {
        const lv = r.upgrades[u.id] ?? 0;
        if (lv >= u.max || (t.only.length > 0 && !t.only.includes(u.id))) continue;
        const cost = upgradeCost(u, lv);
        if (r.coins - cost < Math.ceil(r.quota * t.upFloor)) continue;
        const up = { ...r.upgrades, [u.id]: lv + 1 };
        const m2 = require_modsFor(p, up);
        const gain = F(m2) - base;
        const val = gain * t.horizon * t.upg; // gain is in quota units: income/quota; scale by quota
        const coinGain = val;
        if (coinGain > cost * 1.3 && coinGain - cost > bestGain) {
          bestGain = coinGain - cost;
          pick = u.id;
        }
      }
      if (!pick || !p.upgrade(pick)) break;
    }
  };

  const draft = (p: Player): void => {
    const r = p.run;
    // shop: spend tickets on the best charms
    for (let guard = 0; guard < 10; guard++) {
      const base = value(p, r.charms);
      let pick: string | null = null;
      let bestG = 1.01;
      for (const id of r.shop) {
        const price = RARITY_PRICE[CHARMS.find((c) => c.id === id)?.rarity ?? "rare"];
        if (price > r.tickets) continue;
        const g = value(p, [...r.charms, id]) / base;
        if (g > bestG) {
          bestG = g;
          pick = id;
        }
      }
      if (!pick || !p.buy(pick)) break;
    }
    let best = 0;
    let bi = 0;
    const base = value(p, r.charms);
    r.draft.forEach((id, i) => {
      const g = value(p, [...r.charms, id]) / base;
      if (g > best) {
        best = g;
        bi = i;
      }
    });
    if (!p.call(bi)) p.call(0);
  };

  const event = (p: Player): void => {
    const r = p.run;
    const id = r.event;
    let pick = 1;
    const early = r.round <= 3;
    switch (id) {
      case "suitcase": pick = t.suitcase === "coins" || (t.suitcase === "early" && early) ? 0 : 1; break;
      case "well": pick = r.coins >= 14 ? 0 : 1; break;
      case "dice": pick = r.coins >= 25 ? 0 : 1; break;
      case "mechanic": pick = r.coins >= 25 ? 0 : 1; break;
      case "shower": pick = 0; break;
      case "loan": pick = (t.loan === "always" || (t.loan === "early" && r.round <= 2)) ? 0 : 1; break;
      case "haunted": pick = 1; break;
      case "lucky": pick = r.zone < p.mods().zoneMax ? 0 : 1; break;
      case "exorcist": pick = 0; break;
    }
    if (!p.event(pick)) p.event(1 - pick);
  };

  const play = (p: Player): void => {
    const r = p.run;
    const m = p.mods();
    if (r.poker.phase === "hold") {
      p.draw(holdFor(r.poker.hand));
      p.tick(t.wait);
      return;
    }
    if (t.upg > 0) upgrades(p);
    const L = m.slotLines;
    if (r.turnsLeft > 0) {
      const floor = Math.ceil(r.quota * t.resFrac);
      const cap0 = t.betCap > 0 ? Math.min(t.betCap, m.slotMaxBet) : m.slotMaxBet;
      const cap = r.round <= t.earlyRounds && t.earlyCap > 0 ? Math.min(cap0, t.earlyCap) : cap0;
      const room = r.coins - floor;
      const wantDrop = dropDebt >= 1;
      if (wantDrop && (r.freeDrops >= 1 || r.coins >= 1)) {
        dropDebt -= 1;
        return void doDrop(p);
      }
      if (room >= L) {
        const bet = Math.max(1, Math.min(cap, Math.floor(room / L)));
        if (p.pull(bet) !== null) dropDebt += t.dropsPerPull;
        return;
      }
      // cannot bet above the floor: free drops, else a paid drop if any coin is spare, else wait for the shelf
      if (r.freeDrops >= 1 && t.useFreeDrops) return void doDrop(p);
      if (r.coins >= L && room < L) {
        // below the floor: bet only if the quota is already hopeless to cover otherwise; else drop
        if (r.coins > 1) return void doDrop(p);
      }
      const paid = p.tick(60 * 5);
      idle = paid === 0 ? idle + 1 : 0;
      if (idle > 3) {
        idle = 0;
        if (r.coins >= L) {
          p.pull(Math.max(1, Math.min(cap, Math.floor(r.coins / L))));
        } else r.turnsLeft = 0;
      }
      return;
    }
    // turns gone: let the shelf run, then close
    for (let i = 0; i < 12; i++) {
      const paid = p.tick(60 * 5);
      if (paid === 0 && r.pour.length === 0 && i >= 2) break;
    }
    p.close();
  };
  let dropDebt = 0;
  let idle = 0;
  const doDrop = (p: Player): void => {
    const x = t.dropX === "center" ? 5 : t.dropX === "front" ? 2 + (dropCursor++ % 3) * 3 : 1 + ((dropCursor++ * 3) % 9);
    p.drop(x);
  };

  return {
    name: t.name,
    step(p) {
      const r = p.run;
      if (r.phase === "event") return event(p);
      if (r.phase === "draft") return draft(p);
      play(p);
    },
  };
}

import { modsFor } from "../../src/game/meta";
function require_modsFor(p: Player, up: Record<string, number>): Mods {
  return modsFor(p.meta, p.run.charms, up, p.run.boss, p.run.stake);
}

export const smart: Policy = makePolicy(DEFAULT);
void CURSES;
