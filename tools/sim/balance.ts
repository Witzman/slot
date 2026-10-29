// npx tsx tools/sim/balance.ts <naive|smart> <n> <fresh|tech> [stake]
import { newMeta } from "../../src/game/meta";
import { batch, mean, naive, summary } from "./harness";
import { smart } from "./policy-smart";

const [, , which = "smart", n = "60", tree = "fresh", stake = "0"] = process.argv;
const meta = newMeta();
if (tree === "tech") meta.tech = ["purse1", "purse2", "time1", "free1", "gold1", "pbet", "haggle"];
if (tree === "mid") meta.tech = ["purse1", "purse2", "time1", "time2", "free1", "gold1", "prize1", "pbet", "pfull", "lines3", "slotbet", "wild2", "haggle", "reroll"];
meta.maxStake = 5;
const rs = batch(which === "naive" ? naive : smart, Number(n), { meta, stake: Number(stake) });
console.log(`${which} ${tree} stake ${stake}:`, summary(rs));
const m = (f: (r: (typeof rs)[number]) => number) => mean(rs.map(f)).toFixed(1);
console.log(`  mean flows: slot ${m((r) => r.slotPaid)}/${m((r) => r.slotSpent)}  poker ${m((r) => r.pokerPaid)}/${m((r) => r.pokerStake)}  pusher ${m((r) => r.pusherPaid)}  pulls ${m((r) => r.pulls)} drops ${m((r) => r.drops)}`);
