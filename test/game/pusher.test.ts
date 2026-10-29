import { describe, expect, it } from "vitest";
import { D, R, W, dropCoin, newPusher, plateFront, step, stepMany } from "../../src/game/pusher";
import { makeRng } from "../../src/game/rng";

describe("pusher", () => {
  it("moves the plate back and forth inside its stroke", () => {
    const fronts = Array.from({ length: 500 }, (_, t) => plateFront(t));
    expect(Math.min(...fronts)).toBeCloseTo(1.5, 1);
    expect(Math.max(...fronts)).toBeCloseTo(5, 1);
  });

  it("never lets coins overlap the plate or leave the side walls", () => {
    const p = newPusher(makeRng(1));
    let minX = Infinity;
    let maxX = -Infinity;
    let minGap = Infinity;
    for (let i = 0; i < 2000; i++) {
      step(p);
      if (i % 7 === 0) dropCoin(p, (i * 0.37) % W);
      const front = plateFront(p.t);
      for (const c of p.coins) {
        minX = Math.min(minX, c.x);
        maxX = Math.max(maxX, c.x);
        minGap = Math.min(minGap, c.y - front - R);
      }
    }
    expect(minX).toBeGreaterThanOrEqual(R - 1e-9);
    expect(maxX).toBeLessThanOrEqual(W - R + 1e-9);
    expect(minGap).toBeGreaterThanOrEqual(-1e-9);
  });

  it("pushes coins off the front over time: what goes in comes out", () => {
    const p = newPusher(makeRng(5));
    const start = p.coins.length;
    let dropped = 0;
    let fell = 0;
    for (let i = 0; i < 60 * 120; i++) {
      if (i % 60 === 0) {
        if (dropCoin(p, 1 + ((i / 60) % 8))) dropped++;
      }
      fell += step(p).length;
    }
    expect(fell).toBeGreaterThan(20);
    expect(fell + p.coins.length).toBe(start + dropped);
  });

  it("is deterministic", () => {
    const a = newPusher(makeRng(9));
    const b = newPusher(makeRng(9));
    for (let i = 0; i < 600; i++) {
      if (i % 50 === 0) {
        dropCoin(a, 4);
        dropCoin(b, 4);
      }
    }
    stepMany(a, 3000);
    stepMany(b, 3000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("keeps the coins on the shelf until their centre passes the front edge", () => {
    const p = newPusher(makeRng(2), 0);
    p.coins.push({ id: 1, x: 5, y: D - 0.5, kind: "coin" });
    expect(step(p)).toHaveLength(0);
    p.coins[0]!.y = D + 0.01;
    expect(step(p)).toHaveLength(1);
  });
});
