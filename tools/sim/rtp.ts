// Return to player of the cluster engine per board size, with the base mods: `npx tsx tools/sim/rtp.ts [spins]`.
import { type SpinParams, spinBoard } from "../../src/game/board";
import { baseMods } from "../../src/game/mods";
import { makeRng } from "../../src/game/rng";

const n = Number(process.argv[2] ?? 50000);
const m = baseMods();
const p: SpinParams = { weights: m.weights, symPay: m.symPay, chainStep: m.chainStep, chainCap: m.chainCap, globalMul: m.slotWinMul };
for (const [rows, cols] of [[3, 3], [4, 4], [5, 5], [6, 6]] as const) {
  const rng = makeRng(1234);
  let paid = 0;
  let steps = 0;
  let hits = 0;
  let best = 0;
  for (let i = 0; i < n; i++) {
    const r = spinBoard(rng, { rows, cols }, 1, p);
    paid += r.payout;
    steps += r.steps.length;
    if (r.payout > 0) hits++;
    best = Math.max(best, r.payout);
  }
  console.log(`${rows}x${cols}: rtp ${(paid / n).toFixed(3)}  hit ${(hits / n).toFixed(3)}  steps/spin ${(steps / n).toFixed(2)}  best ${best}`);
}
