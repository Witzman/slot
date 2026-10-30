import { describe, expect, it } from "vitest";
import { type HandCard, type HandRank, BASE_PAY, HAND_ORDER, rankHand } from "../../src/game/hands";

/** "AS KH 10D" style: rank letters, suit S H D C; "JK" is a joker. */
function hand(text: string): HandCard[] {
  return text.split(" ").map((t) => {
    if (t === "JK") return { rank: 2, suit: 0, joker: true };
    const r = t.slice(0, -1);
    const rank = r === "A" ? 14 : r === "K" ? 13 : r === "Q" ? 12 : r === "J" ? 11 : Number(r);
    return { rank, suit: "SHDC".indexOf(t.slice(-1)) };
  });
}
const rank = (t: string): HandRank | null => rankHand(hand(t));

describe("rankHand", () => {
  it("ranks every standard hand", () => {
    expect(rank("JS JH 4D 7C 9S")).toBe("jacks");
    expect(rank("5S 5H 9D 9C KS")).toBe("twoPair");
    expect(rank("7S 7H 7D 2C KS")).toBe("three");
    expect(rank("4S 5H 6D 7C 8S")).toBe("straight");
    expect(rank("2S 6S 9S JS KS")).toBe("flush");
    expect(rank("8S 8H 8D KC KS")).toBe("fullHouse");
    expect(rank("9S 9H 9D 9C KS")).toBe("four");
    expect(rank("4S 5S 6S 7S 8S")).toBe("straightFlush");
    expect(rank("10S JS QS KS AS")).toBe("royal");
  });

  it("a pair of jacks pays but a pair of tens does not, and high card does not", () => {
    expect(rank("10S 10H 4D 7C 9S")).toBeNull();
    expect(rank("2S 5H 9D JC KS")).toBeNull();
    expect(rank("QS QH 4D 7C 9S")).toBe("jacks");
    expect(rank("AS AH 4D 7C 9S")).toBe("jacks");
  });

  it("an ace-low straight counts and a wrap-around does not", () => {
    expect(rank("AS 2H 3D 4C 5S")).toBe("straight");
    expect(rank("QS KH AD 2C 3S")).toBeNull();
    expect(rank("10S JH QD KC AS")).toBe("straight");
  });

  it("a joker completes the best hand", () => {
    expect(rank("JK 7H 7D 2C KS")).toBe("three");
    expect(rank("JK 5H 6D 7C 8S")).toBe("straight");
    expect(rank("JK 6S 9S JS KS")).toBe("flush");
    expect(rank("JK 9H 9D 9C KS")).toBe("four");
    expect(rank("JK 8H 8D KC KS")).toBe("fullHouse");
  });

  it("two jokers make a royal from three high cards of one suit, and five of a kind needs a joker", () => {
    expect(rank("JK JK QS KS AS")).toBe("royal");
    expect(rank("JK 9H 9D 9C 9S")).toBe("five");
    expect(rank("9S 9H 9D 9C KS")).toBe("four");
  });

  it("three, four and five jokers resolve at once and never take long", () => {
    const t = performance.now();
    expect(rank("JK JK JK 4S 9H")).toBe("four");
    expect(rank("JK JK JK QS KS")).toBe("royal");
    expect(rank("JK JK JK JK 3S")).toBe("straightFlush");
    expect(rank("JK JK JK JK AS")).toBe("royal");
    expect(rank("JK JK JK JK JK")).toBe("royal");
    expect(performance.now() - t).toBeLessThan(50);
  });

  it("a card that counts as any suit makes a flush", () => {
    const h = hand("2S 6S 9S JS KH");
    expect(rankHand(h)).toBeNull();
    (h[4] as HandCard).anySuit = true;
    expect(rankHand(h)).toBe("flush");
  });

  it("has a pay for every rank, rising with the rank", () => {
    let last = 0;
    for (const r of HAND_ORDER) {
      expect(BASE_PAY[r]).toBeGreaterThanOrEqual(last);
      last = BASE_PAY[r];
    }
    expect(BASE_PAY.jacks).toBeGreaterThan(0);
    expect(HAND_ORDER[HAND_ORDER.length - 1]).toBe("royal");
  });
});
