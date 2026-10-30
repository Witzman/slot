// A competent player: values charms and upgrades by what they do to the coins of a round, bets big when the machine pays back more than it costs.
import { CHARMS, UPGRADES, upgradeCost } from "../../src/game/content";
import type { Mods } from "../../src/game/mods";
import { type Run, quotaFor } from "../../src/game/run";
import { type Policy, rtpOf } from "./harness";

const cache = new Map<string, number>();
function rtp(m: Mods): number {
  const key = JSON.stringify([m.rows, m.cols, m.weights, m.symPay, m.chainStart, m.chainStep, m.chainCap, m.slotWinMul]);
  let v = cache.get(key);
  if (v === undefined) {
    v = rtpOf(m);
    cache.set(key, v);
  }
  return v;
}

/** Expected coins gained per round with these mods, in a rough sense: spins x bet x (return - 1), plus interest and a lower quota. */
function value(m: Mods, round: number): number {
  const r = rtp(m);
  const bet = r >= 1 ? m.slotMaxBet : 1;
  return m.turns * bet * (r - 1) + 30 * m.interest + quotaFor(round, { ...m, quotaMul: 1 }) * (1 - m.quotaMul) + 0.5 * m.startTickets;
}

export const smart: Policy = {
  bet(run, m) {
    if (rtp(m) >= 1) return m.slotMaxBet;
    // the machine takes a little on every spin: gamble only when the quota is out of reach on small bets
    const need = run.quota - run.coins;
    return run.turnsLeft <= 3 && need > run.turnsLeft ? m.slotMaxBet : 1;
  },
  draft(run, mk) {
    const base = value(mk(run.charms), run.round);
    let best = run.draft[0] as string;
    let bestGain = -Infinity;
    for (const id of run.draft) {
      const g = value(mk([...run.charms, id]), run.round) - base;
      if (g > bestGain) [best, bestGain] = [id, g];
    }
    return best;
  },
  shop(run, mk) {
    const base = value(mk(run.charms), run.round);
    let best: string | null = null;
    let bestRatio = 0.2;
    for (const id of run.shop) {
      const price = { common: 2, uncommon: 4, rare: 7 }[CHARMS.find((c) => c.id === id)?.rarity ?? "rare"];
      if (run.tickets < price) continue;
      const ratio = (value(mk([...run.charms, id]), run.round) - base) / price;
      if (ratio > bestRatio) [best, bestRatio] = [id, ratio];
    }
    return best;
  },
  buy(run, m) {
    const base = value(m, run.round);
    let best: string | null = null;
    let bestRatio = 0.05;
    for (const u of UPGRADES) {
      const level = run.upgrades[u.id] ?? 0;
      if (level >= u.max) continue;
      const cost = upgradeCost(u, level);
      // keep a cushion: spending the quota money away loses the round
      if (run.coins - cost < run.quota) continue;
      const next = { ...m, weights: { ...m.weights }, symPay: { ...m.symPay } };
      u.effect(next, 1);
      const ratio = (value(next, run.round) - base) / cost;
      if (ratio > bestRatio) [best, bestRatio] = [u.id, ratio];
    }
    return best;
  },
  event: () => 0,
};

/** Takes the first of everything and bets 1: the floor of what any player does. */
export const naive: Policy = {
  bet: () => 1,
  draft: (run) => run.draft[0] as string,
  shop: () => null,
  buy: () => null,
  event: () => 1,
};
