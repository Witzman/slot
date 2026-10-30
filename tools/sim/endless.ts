// Plays endless sessions to the first prestige with a competent bot: `npx tsx tools/sim/endless.ts [sessions] [maxRounds]` (#10).
import { upgradeCost } from "../../src/game/content";
import { ENDLESS_SHOP, type Session, buySessionUpgrade, canPrestige, dealSession, drawSession, endlessMods, startSession } from "../../src/game/endless";
import { type Meta, modsFor, newMeta } from "../../src/game/meta";
import type { Mods } from "../../src/game/mods";
import { LINES } from "../../src/game/round";
import { SECONDS_PER_ROUND } from "./harness";
import { rtp, smartHold } from "./policy";

export interface EndlessOutcome {
  rounds: number;
  minutes: number;
  reached: boolean;
  /** most rounds in a row with nothing bought: the "dead time" of the session */
  longestGap: number;
  buys: number;
  milestones: number;
}

/** Return per coin of a set of mods, with a bonus for what the simple hold rule of `rtp` cannot see. */
const eff = (m: Mods): number => rtp(m) * m.slotWinMul + (m.holdMax - 2) * 0.03 + m.redraws * 0.15;

/** Plays until prestige is open, or `maxRounds`. The bot buys what pays back fastest when it can afford it, keeps a wallet to play with, and stakes at most a twelfth of it. */
export function playSession(seed: number, meta: Meta = newMeta(), maxRounds = 3000, trace?: (s: Session) => void): EndlessOutcome {
  const s: Session = startSession(seed, modsFor(meta, "endless", [], {}), 0);
  let gap = 0;
  let longestGap = 0;
  let buys = 0;
  while (s.rounds < maxRounds && (trace !== undefined || !canPrestige(s))) {
    let m = endlessMods(meta, s);
    for (let n = 0; n < 8; n++) {
      const base = eff(m);
      const betNow = base >= 1 ? Math.min(m.slotMaxBet, 3) : 1;
      let best: string | null = null;
      let bestPayback = Infinity;
      for (const u of ENDLESS_SHOP) {
        const level = s.upgrades[u.id] ?? 0;
        if (level >= u.max) continue;
        const cost = upgradeCost(u, level);
        if (s.coins < cost + LINES * 6) continue;
        const next = endlessMods(meta, { ...s, upgrades: { ...s.upgrades, [u.id]: level + 1 } });
        const gain = betNow * LINES * (eff(next) - base);
        const payback = gain > 0 ? cost / gain : Infinity;
        if (payback < bestPayback) [best, bestPayback] = [u.id, payback];
      }
      if (!best || !buySessionUpgrade(s, best, m)) break;
      buys++;
      gap = 0;
      m = endlessMods(meta, s);
    }
    const cap = Math.max(1, Math.floor(s.coins / (LINES * 12)));
    const bet = eff(m) >= 1.02 ? Math.min(m.slotMaxBet, cap) : 1;
    const d = dealSession(s, m, bet);
    if (typeof d === "string") break;
    for (let k = 0; k < 6 && s.hand !== null && s.hand.phase === "hold"; k++) {
      const res = drawSession(s, m, smartHold(s, m));
      if (res === "bad-hold") drawSession(s, m, { rows: [], cols: [], cells: [] });
    }
    trace?.(s);
    gap++;
    longestGap = Math.max(longestGap, gap);
  }
  return { rounds: s.rounds, minutes: (s.rounds * SECONDS_PER_ROUND) / 60, reached: canPrestige(s), longestGap, buys, milestones: s.milestones };
}

if (process.argv[1]?.endsWith("endless.ts")) {
  const n = Number(process.argv[2] ?? 3);
  const cap = Number(process.argv[3] ?? 3000);
  const out = Array.from({ length: n }, (_, i) => playSession(500 + i, newMeta(), cap));
  const med = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
  for (const o of out) console.log(JSON.stringify(o));
  console.log(`median minutes ${med(out.map((o) => o.minutes)).toFixed(1)}  longest gap median ${med(out.map((o) => o.longestGap))}  reached ${out.filter((o) => o.reached).length}/${out.length}`);
}
