import { describe, expect, it } from "vitest";
import { newMeta } from "../../src/game/meta";
import { playSession } from "../../tools/sim/endless";

// Balance of the endless mode (#10): a competent bot, one round of cards is 4 s of play.
describe("balance of the endless mode", () => {
  const runs = [500, 501].map((seed) => playSession(seed, newMeta(), 2500));

  it("a competent bot reaches the first prestige, and not in less than 45 minutes", () => {
    for (const r of runs) {
      expect(r.reached).toBe(true);
      expect(r.minutes).toBeGreaterThanOrEqual(45);
    }
  });

  it("there is always something to buy within a few minutes (no dead time)", () => {
    for (const r of runs) expect(r.longestGap).toBeLessThanOrEqual(60); // 60 rounds are 4 minutes
  });

  it("a session is a pure function of its seed", () => {
    expect(playSession(500, newMeta(), 200)).toEqual(playSession(500, newMeta(), 200));
  });
});
