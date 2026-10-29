import type { Effect, Mods } from "./mods";

export interface TechNode {
  id: string;
  branch: "run" | "slot" | "poker" | "pusher";
  name: string;
  text: string;
  cost: number;
  requires: string[];
  effect: Effect;
}

/** The permanent tree, bought with chips between runs. */
export const TECH: readonly TechNode[] = [
  { id: "purse1", branch: "run", name: "Pocket Change", text: "Start each run with +10 coins.", cost: 3, requires: [], effect: (m) => void (m.startCoins += 10) },
  { id: "purse2", branch: "run", name: "Lucky Wallet", text: "Start each run with +20 more coins.", cost: 8, requires: ["purse1"], effect: (m) => void (m.startCoins += 20) },
  { id: "time1", branch: "run", name: "Overtime", text: "+1 turn every round.", cost: 6, requires: ["purse1"], effect: (m) => void (m.turns += 1) },
  { id: "time2", branch: "run", name: "Night Shift", text: "+2 more turns every round.", cost: 14, requires: ["time1"], effect: (m) => void (m.turns += 2) },
  { id: "haggle", branch: "run", name: "Haggler", text: "Quotas are 10% lower.", cost: 12, requires: ["purse2"], effect: (m) => void (m.quotaMul *= 0.9) },
  { id: "reroll", branch: "run", name: "Second Look", text: "Re-draw the charm choice once per round.", cost: 9, requires: ["time1"], effect: (m) => void (m.rerolls += 1) },

  { id: "lines3", branch: "slot", name: "Three Lines", text: "Slot plays 3 paylines.", cost: 4, requires: [], effect: (m) => void (m.slotLines = Math.max(m.slotLines, 3)) },
  { id: "lines5", branch: "slot", name: "Five Lines", text: "Slot plays 5 paylines.", cost: 10, requires: ["lines3"], effect: (m) => void (m.slotLines = Math.max(m.slotLines, 5)) },
  { id: "slotbet", branch: "slot", name: "High Roller Reels", text: "Slot max bet 5 per line.", cost: 7, requires: ["lines3"], effect: (m) => void (m.slotMaxBet = 5) },
  { id: "wild2", branch: "slot", name: "Wilder Wilds", text: "More wild stars on the reels.", cost: 9, requires: ["lines3"], effect: (m) => void (m.weights.wild += 1) },
  { id: "scatter2", branch: "slot", name: "Coin Magnet Reels", text: "More coin scatters on the reels.", cost: 8, requires: ["lines3"], effect: (m) => void (m.weights.coin += 1) },
  { id: "slotmul", branch: "slot", name: "Polished Chrome", text: "Slot wins pay 15% more.", cost: 16, requires: ["lines5"], effect: (m) => void (m.slotWinMul *= 1.15) },

  { id: "pbet", branch: "poker", name: "Bigger Stakes", text: "Poker max bet 5.", cost: 4, requires: [], effect: (m) => void (m.pokerMaxBet = 5) },
  { id: "pfull", branch: "poker", name: "Friendly Table", text: "Full house pays 10, flush 7.", cost: 7, requires: ["pbet"], effect: (m) => void ((m.pokerPay.fullHouse = 10), (m.pokerPay.flush = 7)) },
  { id: "ptwo", branch: "poker", name: "Pair Bonus", text: "Two pair pays 3.", cost: 9, requires: ["pfull"], effect: (m) => void (m.pokerPay.twoPair = 3) },
  { id: "pdraw", branch: "poker", name: "Second Draw", text: "Draw twice in every hand.", cost: 18, requires: ["ptwo"], effect: (m) => void (m.pokerDraws = 2) },

  { id: "gold1", branch: "pusher", name: "Gilded Coins", text: "More gold coins on the pusher.", cost: 4, requires: [], effect: (m) => void (m.goldChance += 0.07) },
  { id: "prize1", branch: "pusher", name: "Prize Shelf", text: "Prizes drop more often.", cost: 6, requires: ["gold1"], effect: (m) => void (m.prizeChance += 0.04) },
  { id: "free1", branch: "pusher", name: "Free Drop", text: "One free pusher drop at the start of every round.", cost: 8, requires: ["gold1"], effect: (m) => void (m.freeDropsPerRound += 1) },
  { id: "pmul", branch: "pusher", name: "Deep Pockets", text: "Pusher payouts pay 25% more.", cost: 15, requires: ["free1"], effect: (m) => void (m.pusherPayMul *= 1.25) },
];

export interface Charm {
  id: string;
  name: string;
  text: string;
  effect: Effect;
}

/** Run charms: offered three at a time after each round, gone when the run ends. */
export const CHARMS: readonly Charm[] = [
  { id: "clover", name: "Four-Leaf Clover", text: "Slot wins pay 25% more.", effect: (m) => void (m.slotWinMul *= 1.25) },
  { id: "sharp", name: "Card Sharp", text: "Jacks or better pays 2.", effect: (m) => void (m.pokerPay.jacks = Math.max(m.pokerPay.jacks, 2)) },
  { id: "extra", name: "Borrowed Time", text: "+2 turns every round.", effect: (m) => void (m.turns += 2) },
  { id: "goldrush", name: "Gold Rush", text: "Many more gold coins on the pusher.", effect: (m) => void (m.goldChance += 0.12) },
  { id: "bank", name: "Piggy Bank", text: "Keep 10% of your coins as interest each round (up to 15).", effect: (m) => void (m.interest += 0.1) },
  { id: "discount", name: "Bribed Inspector", text: "Quotas are 15% lower.", effect: (m) => void (m.quotaMul *= 0.85) },
  { id: "drop", name: "Spare Change", text: "+2 free pusher drops every round.", effect: (m) => void (m.freeDropsPerRound += 2) },
  { id: "twin", name: "Twin Draw", text: "Draw twice in every poker hand.", effect: (m) => void (m.pokerDraws = Math.max(m.pokerDraws, 2)) },
  { id: "jackpot", name: "Jackpot Fever", text: "More sevens on the reels.", effect: (m) => void (m.weights.seven += 1) },
  { id: "magnet", name: "Scatter Magnet", text: "More coin scatters on the reels.", effect: (m) => void (m.weights.coin += 2) },
  { id: "pusher", name: "Greasy Plate", text: "Pusher payouts pay 30% more.", effect: (m) => void (m.pusherPayMul *= 1.3) },
  { id: "wildcard", name: "Wild Card", text: "More wild stars on the reels.", effect: (m) => void (m.weights.wild += 2) },
];

export interface Relic {
  id: string;
  name: string;
  text: string;
  /** a crafted relic: the two relics that make it (the ingredients stay with you) */
  craft?: [string, string];
}

/** Collectibles: found as prizes on the pusher, kept for ever. */
export const RELICS: readonly Relic[] = [
  { id: "penny", name: "Lucky Penny", text: "Heads, every time. Allegedly." },
  { id: "dice", name: "Loaded Dice", text: "Seven sides. Do not ask." },
  { id: "tooth", name: "Golden Tooth", text: "Left behind by a big winner." },
  { id: "cat", name: "Waving Cat", text: "Beckons coins. Mostly its own." },
  { id: "key", name: "Rusty Key", text: "Opens nothing. Yet." },
  { id: "chip", name: "Casino Chip No. 0", text: "The first chip ever cut." },
  { id: "horse", name: "Horseshoe", text: "Hang it open side up." },
  { id: "ace", name: "Marked Ace", text: "Folded corner, hidden grin." },
  { id: "bell", name: "Brass Bell", text: "Rings on a win, and also on a loss." },
  { id: "jukebox", name: "Mini Jukebox", text: "Plays one song. Always the same." },
  { id: "crown", name: "Tin Crown", text: "King of the arcade." },
  { id: "eye", name: "Glass Eye", text: "It watches the reels." },
  { id: "luckycharm", name: "Lucky Charm", text: "Penny and horseshoe, wired together.", craft: ["penny", "horse"] },
  { id: "trickdeck", name: "Trick Deck", text: "Marked ace, loaded dice. Do not play it in public.", craft: ["ace", "dice"] },
  { id: "goldbell", name: "Golden Bell", text: "A brass bell with a gold tooth for a clapper.", craft: ["bell", "tooth"] },
  { id: "idol", name: "Watchful Idol", text: "The cat and the eye agree on who is lucky.", craft: ["cat", "eye"] },
  { id: "vault", name: "Vault Token", text: "The key fits the chip. Behind it: more chips.", craft: ["key", "chip"] },
  { id: "musicbox", name: "Music Box", text: "The jukebox learns the bell's tune.", craft: ["jukebox", "bell"] },
  { id: "throne", name: "Gilded Throne", text: "A crown needs a seat; a tooth pays for the gold.", craft: ["crown", "tooth"] },
  { id: "fortune", name: "Fortune Teller", text: "The eye reads the dice.", craft: ["eye", "dice"] },
  { id: "grand", name: "Grand Fortune", text: "Throne, bell and all that luck in one place.", craft: ["goldbell", "throne"] },
];

export interface Upgrade {
  id: string;
  name: string;
  text: string;
  /** coins for level 1; each further level costs 1.5 times the one before */
  base: number;
  max: number;
  effect: (m: Mods, level: number) => void;
}

/** Bought with coins during a run, level by level, gone when the run ends (like towers in a tower defense). */
export const UPGRADES: readonly Upgrade[] = [
  { id: "reels", name: "Reel Tuning", text: "Slot wins pay +10% per level.", base: 8, max: 5, effect: (m, l) => void (m.slotWinMul *= 1 + 0.1 * l) },
  { id: "wilds", name: "Wild Reels", text: "+1 wild star on the reels per level.", base: 10, max: 3, effect: (m, l) => void (m.weights.wild += l) },
  { id: "cards", name: "Marked Deck", text: "Poker wins pay +10% per level.", base: 8, max: 5, effect: (m, l) => void (m.pokerMul *= 1 + 0.1 * l) },
  { id: "gilding", name: "Gold Plating", text: "+4% gold coins per level.", base: 6, max: 5, effect: (m, l) => void (m.goldChance += 0.04 * l) },
  { id: "chute", name: "Coin Chute", text: "+1 free pusher drop at the start of each round, per level.", base: 12, max: 3, effect: (m, l) => void (m.freeDropsPerRound += l) },
  { id: "hours", name: "Longer Shifts", text: "+1 turn per round per level, from the next round.", base: 15, max: 3, effect: (m, l) => void (m.turns += l) },
  { id: "savings", name: "Savings Account", text: "+5% interest per level.", base: 10, max: 3, effect: (m, l) => void (m.interest += 0.05 * l) },
];

export const upgradeCost = (u: Upgrade, level: number): number => Math.ceil(u.base * Math.pow(1.5, level));
