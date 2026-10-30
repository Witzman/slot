/** A playing card as an integer 0..51: rank 2..14 (ace high) and suit 0..3 (spades, hearts, diamonds, clubs). */
export type Card = number;

export const rankOf = (c: Card): number => 2 + (c % 13);
export const suitOf = (c: Card): number => Math.floor(c / 13);

const RANK_NAME: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
export const SUIT_NAME = ["♠", "♥", "♦", "♣"] as const;

export function cardName(c: Card): string {
  const r = rankOf(c);
  return `${RANK_NAME[r] ?? r}${SUIT_NAME[suitOf(c)]}`;
}

/** The 52 cards, without the cards of the removed ranks (the tree can take the twos out of the deck). */
export function freshDeck(removedRanks: readonly number[] = []): Card[] {
  const deck: Card[] = [];
  for (let c = 0; c < 52; c++) if (!removedRanks.includes(rankOf(c))) deck.push(c);
  return deck;
}
