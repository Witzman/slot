/** Seeded random numbers for the run: mulberry32, state is one JSON-safe integer. */
export interface Rng {
  s: number;
}

export function makeRng(seed: number): Rng {
  return { s: seed >>> 0 };
}

/** A number in [0, 1). */
export function next(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** An integer in [0, n). */
export function int(r: Rng, n: number): number {
  return Math.floor(next(r) * n);
}

export function pick<T>(r: Rng, items: readonly T[]): T {
  return items[int(r, items.length)] as T;
}

/** Index chosen by weights (non-negative, at least one positive). */
export function weighted(r: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let x = next(r) * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i] as number;
    if (x < 0) return i;
  }
  return weights.length - 1;
}

/** In-place Fisher-Yates. */
export function shuffle<T>(r: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = int(r, i + 1);
    const a = items[i] as T;
    items[i] = items[j] as T;
    items[j] = a;
  }
  return items;
}
