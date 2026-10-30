// Return per coin of the bare card machine under a few hold rules: `npx tsx tools/sim/rtp.ts [rounds]` (cost of a round is bet x 10 lines).
import { HAND_ORDER, type HandRank } from "../../src/game/hands";
import { LINES, type Hold, SIZE, type ScoreMods, deal, drawRound, scoreBoard } from "../../src/game/round";
import { makeRng } from "../../src/game/rng";

const n = Number(process.argv[2] ?? 20000);
const handMul = Object.fromEntries(HAND_ORDER.map((r) => [r, 1])) as Record<HandRank, number>;
const score: ScoreMods = { handMul, globalMul: 1, lineBonus: 0 };
const none: Hold = { rows: [], cols: [], cells: [] };

/** Hold the paying line with the highest pay (a row or a column), else nothing. */
function greedy(board: number[]): Hold {
  const lines = scoreBoard(board, 1, {}, score).lines;
  const top = [...lines].sort((a, b) => b.pay - a.pay)[0];
  if (!top) return none;
  return top.line < SIZE ? { rows: [top.line], cols: [], cells: [] } : { rows: [], cols: [top.line - SIZE], cells: [] };
}

for (const [name, rule] of [["hold nothing", () => none], ["hold the best line", greedy]] as const) {
  const rng = makeRng(2024);
  let paid = 0;
  const seen: Partial<Record<HandRank, number>> = {};
  for (let i = 0; i < n; i++) {
    const d = deal(rng, 1);
    const res = drawRound(rng, d, rule(d.board), { singleHold: false, upgrades: {}, score });
    if (typeof res === "string") throw new Error(res);
    paid += res.payout;
    for (const l of res.lines) seen[l.rank] = (seen[l.rank] ?? 0) + 1;
  }
  console.log(`${name}: return ${(paid / (n * LINES)).toFixed(3)} per coin  (${(paid / n).toFixed(2)} bets per round)  hands per round: ${HAND_ORDER.map((r) => `${r} ${((seen[r] ?? 0) / n).toFixed(3)}`).join(", ")}`);
}
