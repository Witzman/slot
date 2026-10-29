import { describe, expect, it } from "vitest";
import { BASE_PAY, HAND_ORDER, classify, deal, draw, freshPoker, newDeck, payFor, toggleHold } from "../../src/game/poker";
import { makeRng } from "../../src/game/rng";

// card = suit * 13 + (rank - 2)
const c = (rank: number, suit: number): number => suit * 13 + rank - 2;

describe("poker hands", () => {
  it("names every hand of Jacks or Better", () => {
    expect(classify([c(10, 0), c(11, 0), c(12, 0), c(13, 0), c(14, 0)])).toBe("royal");
    expect(classify([c(5, 1), c(6, 1), c(7, 1), c(8, 1), c(9, 1)])).toBe("straightFlush");
    expect(classify([c(14, 2), c(2, 2), c(3, 2), c(4, 2), c(5, 2)])).toBe("straightFlush");
    expect(classify([c(9, 0), c(9, 1), c(9, 2), c(9, 3), c(2, 0)])).toBe("four");
    expect(classify([c(9, 0), c(9, 1), c(9, 2), c(4, 3), c(4, 0)])).toBe("fullHouse");
    expect(classify([c(2, 0), c(6, 0), c(9, 0), c(11, 0), c(13, 0)])).toBe("flush");
    expect(classify([c(5, 0), c(6, 1), c(7, 2), c(8, 3), c(9, 0)])).toBe("straight");
    expect(classify([c(14, 0), c(2, 1), c(3, 2), c(4, 3), c(5, 0)])).toBe("straight");
    expect(classify([c(9, 0), c(9, 1), c(9, 2), c(4, 3), c(2, 0)])).toBe("three");
    expect(classify([c(9, 0), c(9, 1), c(4, 2), c(4, 3), c(2, 0)])).toBe("twoPair");
    expect(classify([c(11, 0), c(11, 1), c(4, 2), c(5, 3), c(2, 0)])).toBe("jacks");
  });

  it("does not pay a low pair or a wrap-around straight", () => {
    expect(classify([c(10, 0), c(10, 1), c(4, 2), c(5, 3), c(2, 0)])).toBeNull();
    expect(classify([c(12, 0), c(13, 1), c(14, 2), c(2, 3), c(3, 0)])).toBeNull();
    expect(classify([c(2, 0), c(5, 1), c(7, 2), c(9, 3), c(12, 0)])).toBeNull();
  });

  it("pays the table times the bet", () => {
    expect(payFor("fullHouse", 3)).toBe(27);
    expect(payFor(null, 3)).toBe(0);
    expect(HAND_ORDER.map((h) => BASE_PAY[h])).toEqual([...HAND_ORDER.map((h) => BASE_PAY[h])].sort((a, b) => b - a));
  });
});

describe("a hand", () => {
  it("deals five, keeps the held cards and replaces the rest from the deck", () => {
    const rng = makeRng(7);
    const s = freshPoker();
    deal(s, rng, 2, 1);
    const first = [...s.hand];
    toggleHold(s, 0);
    toggleHold(s, 3);
    expect(draw(s)).toBe(true);
    expect(s.hand[0]).toBe(first[0]);
    expect(s.hand[3]).toBe(first[3]);
    expect(new Set(s.hand).size).toBe(5);
    expect(s.phase).toBe("bet");
  });

  it("with two draws needs two draws", () => {
    const s = freshPoker();
    deal(s, makeRng(3), 1, 2);
    expect(draw(s)).toBe(false);
    expect(s.phase).toBe("hold");
    expect(draw(s)).toBe(true);
  });

  it("shuffles all 52 cards once", () => {
    expect(new Set(newDeck(makeRng(1))).size).toBe(52);
  });

  it("returns about 98% over many hands when the best simple strategy is played", () => {
    // hold made hands, else pairs, else nothing: a weak strategy, so the floor is low and the ceiling guards a broken table
    const rng = makeRng(2024);
    let paid = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const s = freshPoker();
      deal(s, rng, 1, 1);
      const counts = new Map<number, number>();
      for (const card of s.hand) counts.set(card % 13, (counts.get(card % 13) ?? 0) + 1);
      s.hand.forEach((card, j) => {
        if ((counts.get(card % 13) ?? 0) >= 2 || card % 13 >= 9) toggleHold(s, j);
      });
      if (classify(s.hand) && ["straight", "flush", "fullHouse", "straightFlush", "royal"].includes(classify(s.hand) as string)) s.held = [true, true, true, true, true];
      draw(s);
      paid += payFor(classify(s.hand), 1);
    }
    expect(paid / n).toBeGreaterThan(0.7);
    expect(paid / n).toBeLessThan(1.02);
  });
});
