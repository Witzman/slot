// `npx tsx tools/sim/balance.ts <smart|never|always> <runs> <fresh|mid|tech> [stake] [setup]`: how deep and how long climb runs go.
import { TECH } from "../../src/game/content";
import { SETUPS } from "../../src/game/setups";
import { buyTech, newMeta } from "../../src/game/meta";
import { playRun } from "./harness";
import { always, never, smart } from "./policy";

const [policyName = "smart", n = "8", tree = "fresh", stake = "0", setup = "classic"] = process.argv.slice(2);
const policy = policyName === "never" ? never : policyName === "always" ? always : smart;
const meta = newMeta();
meta.climb.chips = 100000;
const picks: Record<string, string[]> = { fresh: [], mid: ["purse1", "time1", "hold3", "hold4", "pairs1", "runs1"], tech: TECH.map((t) => t.id) };
for (let pass = 0; pass < TECH.length; pass++) for (const id of picks[tree] ?? []) buyTech(meta, "climb", id);

const out = Array.from({ length: Number(n) }, (_, i) => playRun(setup === "classic" ? 1000 + i : (SETUPS.find((x) => x.id === setup)?.seed ?? 1000) + i, meta, policy, Number(stake), 3000, setup));
const sorted = (xs: number[]): number[] => [...xs].sort((a, b) => a - b);
const med = (xs: number[]): number => sorted(xs)[Math.floor(xs.length / 2)] as number;
console.log(`${policyName} ${tree} stake ${stake} ${setup}: runs ${out.length}  quotas median ${med(out.map((o) => o.rounds))}  rounds median ${med(out.map((o) => o.turns))}  minutes median ${med(out.map((o) => o.minutes)).toFixed(1)}  min ${sorted(out.map((o) => o.minutes))[0]?.toFixed(1)}  capped ${out.filter((o) => o.reason !== "quota").length}  bosses ${(out.reduce((s, o) => s + o.bosses, 0) / out.length).toFixed(2)}`);
const goal = SETUPS.find((x) => x.id === setup)?.goal;
if (goal !== undefined) console.log(`  goal ${goal} quotas: cleared by ${out.filter((o) => o.rounds >= goal).length} of ${out.length} runs`);
