import { dropCoin, newPusher, step } from "../../src/game/pusher";
import { makeRng } from "../../src/game/rng";
// Pour `rate` coins every 2 s (about what a pull at bet 1..2 pours) for 120 s; report cumulative falls.
for (const rate of [2, 4]) {
  const falls: number[] = [];
  for (let seed = 1; seed <= 12; seed++) {
    const p = newPusher(makeRng(seed));
    const rng = makeRng(seed * 7);
    let fell = 0;
    const at: Record<number, number> = {};
    for (let i = 1; i <= 60 * 120; i++) {
      if (i % 120 === 0) for (let k = 0; k < rate; k++) dropCoin(p, 0.6 + ((rng.s = (rng.s * 1103515245 + 12345) >>> 0) / 4294967296) * 8.8);
      fell += step(p).length;
      if (i % (60 * 20) === 0) at[i / 60] = fell;
    }
    falls.push(...Object.values(at));
    (falls as unknown as number[][]);
  }
  const per = 6;
  const rows = Array.from({ length: per }, (_, j) => falls.filter((_, i) => i % per === j).reduce((a, b) => a + b, 0) / 12);
  console.log(`pour ${rate}/2s (in by 120s: ${rate * 60}) falls at 20,40,60,80,100,120 s:`, rows.map((x) => x.toFixed(1)).join(" "));
}
