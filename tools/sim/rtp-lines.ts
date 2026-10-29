import { BASE_WEIGHTS, CHERRY_PAIR, LINE_PAY, SYMS, type Sym } from "../../src/game/slot";
type Rule = "current" | "noWildSeven" | "wildHalf" | "wildCap";
function pay(s: Sym[], rule: Rule): number {
  const first = s.find((x) => x !== "wild");
  const base: Sym = first ?? "seven";
  const wilds = s.filter((x) => x === "wild").length;
  let p = 0;
  if (base !== "coin" && s.every((x) => x === base || x === "wild")) {
    p = LINE_PAY[base as keyof typeof LINE_PAY];
    if (wilds > 0) {
      if (rule === "noWildSeven" && base === "seven" && wilds > 0) p = first ? LINE_PAY.bar : LINE_PAY.bar; // a seven line with wilds pays as bar
      if (rule === "wildHalf") p = p / 2;
      if (rule === "wildCap") p = Math.min(p, LINE_PAY.bell);
    }
    return p;
  }
  const [a, b] = s;
  if ((a === "cherry" || a === "wild") && (b === "cherry" || b === "wild")) return CHERRY_PAIR;
  return 0;
}
function rtp(w: Record<Sym, number>, rule: Rule): number {
  const tot = SYMS.reduce((n, x) => n + w[x], 0);
  let e = 0;
  for (const a of SYMS) for (const b of SYMS) for (const c of SYMS) e += (w[a] * w[b] * w[c]) / tot ** 3 * pay([a, b, c], rule);
  return e;
}
for (const rule of ["current", "noWildSeven", "wildHalf", "wildCap"] as Rule[]) {
  const row = [0, 2, 4, 6, 8, 11].map((extra) => rtp({ ...BASE_WEIGHTS, wild: BASE_WEIGHTS.wild + extra - 0 }, rule).toFixed(2));
  console.log(rule.padEnd(12), "wild weight 2,4,6,8,10,13:", row.join("  "));
}

// wild only on the middle reel: columns 0 and 2 never show a wild
function rtpMid(w: Record<Sym, number>): number {
  const side = { ...w, wild: 0 };
  const ts = SYMS.reduce((n, x) => n + side[x], 0);
  const tm = SYMS.reduce((n, x) => n + w[x], 0);
  let e = 0;
  for (const a of SYMS) for (const b of SYMS) for (const c of SYMS) e += (side[a] / ts) * (w[b] / tm) * (side[c] / ts) * pay([a, b, c], "current");
  return e;
}
console.log("wildMid     wild weight 2,4,6,8,10,13:", [0, 2, 4, 6, 8, 11].map((x) => rtpMid({ ...BASE_WEIGHTS, wild: BASE_WEIGHTS.wild + x }).toFixed(2)).join("  "));
console.log("wildMid with wild 4:", rtpMid({ ...BASE_WEIGHTS, wild: 4 }).toFixed(2));
