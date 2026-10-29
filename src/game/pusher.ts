import { type Rng, next } from "./rng";

/** A top-down coin pusher: a plate slides back and forth, coins pushed past the front edge fall into the payout. */
export const W = 10;
export const D = 12;
export const R = 0.45;
const PLATE_MIN = 1.5;
const PLATE_TRAVEL = 2;
const PERIOD = 240; // steps per full stroke (60 steps per second)
const ITERATIONS = 6;
export const MAX_COINS = 160;

export type CoinKind = "coin" | "gold" | "prize";

export interface Coin {
  id: number;
  x: number;
  y: number;
  kind: CoinKind;
}

export interface Pusher {
  t: number;
  nextId: number;
  coins: Coin[];
}

/** y of the plate front at step t: a triangle wave, no trigonometry. */
export function plateFront(t: number): number {
  const phase = (t % PERIOD) / PERIOD;
  return PLATE_MIN + PLATE_TRAVEL * (phase < 0.5 ? phase * 2 : 2 - phase * 2);
}

export function newPusher(rng: Rng, coins = 48): Pusher {
  const p: Pusher = { t: 0, nextId: 1, coins: [] };
  const cols = 9;
  for (let i = 0; i < coins; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = R + 0.1 + col * ((W - 2 * R - 0.2) / (cols - 1)) + (next(rng) - 0.5) * 0.15;
    const y = 4.6 + row * 0.95 + (next(rng) - 0.5) * 0.15;
    const kind: CoinKind = i === 17 ? "prize" : i % 13 === 5 ? "gold" : "coin";
    p.coins.push({ id: p.nextId++, x, y, kind });
  }
  return p;
}

export function dropCoin(p: Pusher, x: number, kind: CoinKind = "coin"): Coin | null {
  if (p.coins.length >= MAX_COINS) return null;
  const cx = Math.min(W - R, Math.max(R, x));
  const c: Coin = { id: p.nextId++, x: cx, y: plateFront(p.t) + R + 0.05, kind };
  p.coins.push(c);
  return c;
}

/** One 1/60 s step. Returns the coins that fell off the front. */
export function step(p: Pusher): Coin[] {
  p.t++;
  const front = plateFront(p.t);
  const cs = p.coins;
  for (let it = 0; it < ITERATIONS; it++) {
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i] as Coin;
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j] as Coin;
        const dx = b.x - a.x;
        if (dx > 2 * R || dx < -2 * R) continue;
        const dy = b.y - a.y;
        if (dy > 2 * R || dy < -2 * R) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R) continue;
        let nx: number;
        let ny: number;
        let d = Math.sqrt(d2);
        if (d < 1e-6) {
          nx = 0;
          ny = 1;
          d = 0;
        } else {
          nx = dx / d;
          ny = dy / d;
        }
        const push = (2 * R - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
    for (const c of cs) {
      if (c.x < R) c.x = R;
      else if (c.x > W - R) c.x = W - R;
      if (c.y < front + R) c.y = front + R;
    }
  }
  const fallen: Coin[] = [];
  const kept: Coin[] = [];
  for (const c of cs) (c.y > D ? fallen : kept).push(c);
  p.coins = kept;
  return fallen;
}

export function stepMany(p: Pusher, n: number): Coin[] {
  const out: Coin[] = [];
  for (let i = 0; i < n; i++) out.push(...step(p));
  return out;
}
