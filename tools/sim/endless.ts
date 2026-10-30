// Plays endless sessions to the first prestige with a competent bot: `npx tsx tools/sim/endless.ts [sessions] [maxSpins]` (#10).
import { upgradeCost } from "../../src/game/content";
import { ENDLESS_SHOP, type Session, buySessionUpgrade, canPrestige, endlessMods, spinSession, startSession } from "../../src/game/endless";
import { type Meta, modsFor, newMeta } from "../../src/game/meta";
import type { Mods } from "../../src/game/mods";
import { SECONDS_PER_SPIN, rtpOf } from "./harness";

export interface EndlessOutcome {
  spins: number;
  minutes: number;
  reached: boolean;
  /** most spins in a row without anything affordable bought: the "dead time" of the session */
  longestGap: number;
  buys: number;
  milestones: number;
}

const rtpCache = new Map<string, number>();
/** Return of a set of mods. Win multipliers and the symbol pay of the endless shop are uniform, so only the board, weights and chain need a simulation; the rest is multiplied on. */
function rtp(m: Mods): number {
  const key = JSON.stringify([m.rows, m.cols, m.weights, m.chainStart, m.chainStep, m.chainCap]);
  let v = rtpCache.get(key);
  if (v === undefined) {
    const flat: Mods = { ...m, slotWinMul: 1, symPay: Object.fromEntries(Object.keys(m.symPay).map((k) => [k, 1])) as Mods["symPay"] };
    rtpCache.set(key, (v = rtpOf(flat)));
  }
  return v * m.slotWinMul * m.symPay.cherry;
}

/** Plays until prestige is open, or `maxSpins`. The bot buys whatever pays back fastest when it can afford it, and bets the max when the machine pays more than it costs. */
export function playSession(seed: number, meta: Meta = newMeta(), maxSpins = 6000, trace?: (s: Session) => void): EndlessOutcome {
  const s: Session = startSession(seed, modsFor(meta, "endless", [], {}), 0);
  let gap = 0;
  let longestGap = 0;
  let buys = 0;
  while (s.spins < maxSpins && (trace !== undefined || !canPrestige(s))) {
    let m = endlessMods(meta, s);
    // buy what pays back fastest among what we can afford now
    for (let n = 0; n < 6; n++) {
      const base = rtp(m);
      let best: string | null = null;
      let bestPayback = Infinity;
      for (const u of ENDLESS_SHOP) {
        const level = s.upgrades[u.id] ?? 0;
        if (level >= u.max) continue;
        const cost = upgradeCost(u, level);
        if (s.coins < cost + 3 * m.slotMaxBet) continue;
        const next = endlessMods(meta, { ...s, upgrades: { ...s.upgrades, [u.id]: level + 1 } });
        const r = rtp(next);
        const betNow = base >= 1 ? m.slotMaxBet : 1;
        const betNext = r >= 1 ? next.slotMaxBet : 1;
        const perSpin = betNext * (r - 1) - betNow * (base - 1);
        const payback = perSpin > 0 ? cost / perSpin : Infinity;
        if (payback < bestPayback) [best, bestPayback] = [u.id, payback];
      }
      if (!best || !buySessionUpgrade(s, best, m)) break;
      buys++;
      gap = 0;
      m = endlessMods(meta, s);
    }
    const base = rtp(m);
    const bet = Math.max(1, Math.min(m.slotMaxBet, base >= 1 ? m.slotMaxBet : 1, s.coins));
    spinSession(s, m, bet);
    trace?.(s);
    gap++;
    longestGap = Math.max(longestGap, gap);
  }
  return { spins: s.spins, minutes: (s.spins * SECONDS_PER_SPIN) / 60, reached: canPrestige(s), longestGap, buys, milestones: s.milestones };
}

if (process.argv[1]?.endsWith("endless.ts")) {
  const n = Number(process.argv[2] ?? 6);
  const cap = Number(process.argv[3] ?? 6000);
  const out = Array.from({ length: n }, (_, i) => playSession(500 + i, newMeta(), cap));
  const med = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
  for (const o of out) console.log(JSON.stringify(o));
  console.log(`median minutes ${med(out.map((o) => o.minutes)).toFixed(1)}  longest gap median ${med(out.map((o) => o.longestGap))}  reached ${out.filter((o) => o.reached).length}/${out.length}`);
}
