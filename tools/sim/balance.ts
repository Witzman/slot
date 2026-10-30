// `npx tsx tools/sim/balance.ts <naive|smart> <runs> <fresh|tech|mid>`: how deep and how long climb runs go.
import { buyTech, newMeta } from "../../src/game/meta";
import { TECH } from "../../src/game/content";
import { playRun } from "./harness";
import { naive, smart } from "./policy";

const [policyName = "smart", n = "20", tree = "fresh"] = process.argv.slice(2);
const policy = policyName === "naive" ? naive : smart;
const meta = newMeta();
meta.climb.chips = 100000;
const picks: Record<string, string[]> = { fresh: [], mid: ["purse1", "time1", "rows4", "cols4", "chain1", "wild1"], tech: TECH.map((t) => t.id) };
for (let pass = 0; pass < TECH.length; pass++) for (const id of picks[tree] ?? []) buyTech(meta, "climb", id);

const out = Array.from({ length: Number(n) }, (_, i) => playRun(1000 + i, meta, policy));
const med = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
console.log(`${policyName} ${tree}: runs ${out.length}  rounds median ${med(out.map((o) => o.rounds))}  spins median ${med(out.map((o) => o.spins))}  minutes median ${med(out.map((o) => o.minutes)).toFixed(1)}  p10 ${[...out.map((o) => o.minutes)].sort((a, b) => a - b)[Math.floor(out.length / 10)]?.toFixed(1)}  capped ${out.filter((o) => o.reason === "cap").length}  bosses ${(out.reduce((s, o) => s + o.bosses, 0) / out.length).toFixed(2)}`);
