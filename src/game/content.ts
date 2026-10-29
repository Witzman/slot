import type { Effect, Mods } from "./mods";
import type { Sym } from "./slot";

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
  { id: "zone4", branch: "pusher", name: "Zone Boost", text: "The pusher can reach zone 4.", cost: 12, requires: ["free1"], effect: (m) => void (m.zoneMax = Math.max(m.zoneMax, 4)) },
  { id: "zone5", branch: "pusher", name: "Zone Boost II", text: "The pusher can reach zone 5.", cost: 20, requires: ["zone4"], effect: (m) => void (m.zoneMax = 5) },
  { id: "pmul", branch: "pusher", name: "Deep Pockets", text: "Pusher payouts pay 25% more.", cost: 15, requires: ["free1"], effect: (m) => void (m.pusherPayMul *= 1.25) },
];

export type Rarity = "common" | "uncommon" | "rare";
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 70, uncommon: 25, rare: 5 };
/** Tickets a charm costs in the shop. */
export const RARITY_PRICE: Record<Rarity, number> = { common: 2, uncommon: 4, rare: 7 };

export interface Charm {
  id: string;
  name: string;
  text: string;
  rarity: Rarity;
  effect: Effect;
}

const ch = (id: string, name: string, rarity: Rarity, text: string, effect: Effect): Charm => ({ id, name, text, rarity, effect });
const symPay = (sym: Sym, k: number): Effect => (m) => void (m.symPay[sym] *= k);

/** Run charms: one free pick of three after each round (the phone call), the rest bought with tickets; gone when the run ends. */
export const CHARMS: readonly Charm[] = [
  // slot
  ch("clover", "Four-Leaf Clover", "common", "Slot wins pay 25% more.", (m) => void (m.slotWinMul *= 1.25)),
  ch("jackpot", "Jackpot Fever", "uncommon", "More sevens on the reels.", (m) => void (m.weights.seven += 1)),
  ch("magnet", "Scatter Magnet", "common", "More coin scatters on the reels.", (m) => void (m.weights.coin += 2)),
  ch("wildcard", "Wild Card", "uncommon", "More wild stars on the reels.", (m) => void (m.weights.wild += 2)),
  ch("cherrypick", "Cherry Picker", "uncommon", "Cherry lines pay 3 times.", symPay("cherry", 3)),
  ch("lemonade", "Lemonade Stand", "common", "Lemon lines pay 2 times.", symPay("lemon", 2)),
  ch("bellringer", "Bell Ringer", "common", "Bell lines pay 2 times.", symPay("bell", 2)),
  ch("barfly", "Bar Fly", "uncommon", "BAR lines pay 2 times.", symPay("bar", 2)),
  ch("sevenheaven", "Seven Heaven", "rare", "Seven lines pay 1.5 times.", symPay("seven", 1.5)),
  ch("triplewild", "Triple Wild", "rare", "Many more wild stars on the reels.", (m) => void (m.weights.wild += 3)),
  ch("orchard", "Cherry Orchard", "common", "More cherries on the reels.", (m) => void (m.weights.cherry += 3)),
  ch("belltower", "Bell Tower", "uncommon", "More bells on the reels.", (m) => void (m.weights.bell += 2)),
  ch("highroll", "High Roller", "uncommon", "Slot max bet +2.", (m) => void (m.slotMaxBet += 2)),
  ch("longlines", "Long Lines", "uncommon", "Slot plays at least 3 paylines.", (m) => void (m.slotLines = Math.max(m.slotLines, 3))),
  ch("fulllines", "Full Lines", "rare", "Slot plays 5 paylines.", (m) => void (m.slotLines = 5)),
  // poker
  ch("sharp", "Card Sharp", "common", "Jacks or better pays 2.", (m) => void (m.pokerPay.jacks = Math.max(m.pokerPay.jacks, 2))),
  ch("twin", "Twin Draw", "rare", "Draw twice in every poker hand.", (m) => void (m.pokerDraws = Math.max(m.pokerDraws, 2))),
  ch("pairbonus", "Pair Bonus", "common", "Two pair pays 3.", (m) => void (m.pokerPay.twoPair = Math.max(m.pokerPay.twoPair, 3))),
  ch("threes", "Three's Company", "common", "Three of a kind pays 4.", (m) => void (m.pokerPay.three = Math.max(m.pokerPay.three, 4))),
  ch("flushfever", "Flush Fever", "uncommon", "Flush pays 8, straight 5.", (m) => void ((m.pokerPay.flush = Math.max(m.pokerPay.flush, 8)), (m.pokerPay.straight = Math.max(m.pokerPay.straight, 5)))),
  ch("fulltable", "Full Table", "uncommon", "Full house pays 12, four of a kind 30.", (m) => void ((m.pokerPay.fullHouse = Math.max(m.pokerPay.fullHouse, 12)), (m.pokerPay.four = Math.max(m.pokerPay.four, 30)))),
  ch("royalty", "Royal Treatment", "rare", "Royal flush pays 500, straight flush 100.", (m) => void ((m.pokerPay.royal = Math.max(m.pokerPay.royal, 500)), (m.pokerPay.straightFlush = Math.max(m.pokerPay.straightFlush, 100)))),
  ch("highstakes", "High Stakes", "common", "Free poker hands can go up to stake 5.", (m) => void (m.pokerMaxBet = Math.max(m.pokerMaxBet, 5))),
  ch("stackeddeck", "Stacked Deck", "uncommon", "Poker wins pay 25% more.", (m) => void (m.pokerMul *= 1.25)),
  // pusher
  ch("goldrush", "Gold Rush", "uncommon", "Many more gold coins on the pusher.", (m) => void (m.goldChance += 0.12)),
  ch("pusher", "Greasy Plate", "uncommon", "Pusher payouts pay 30% more.", (m) => void (m.pusherPayMul *= 1.3)),
  ch("drop", "Spare Change", "common", "+2 free pusher drops every round.", (m) => void (m.freeDropsPerRound += 2)),
  ch("streak", "Hot Streak", "uncommon", "Each pusher zone pays 10% more.", (m) => void (m.zoneStep += 0.1)),
  ch("prizehunter", "Prize Hunter", "common", "Prizes drop more often.", (m) => void (m.prizeChance += 0.06)),
  ch("goldleaf", "Gold Leaf", "common", "More gold coins on the pusher.", (m) => void (m.goldChance += 0.06)),
  ch("deepshelf", "Deep Shelf", "common", "Pusher payouts pay 15% more.", (m) => void (m.pusherPayMul *= 1.15)),
  ch("zonedance", "Zone Dance", "uncommon", "The pusher can reach one zone higher (up to 5).", (m) => void (m.zoneMax = Math.min(5, m.zoneMax + 1))),
  // economy
  ch("extra", "Borrowed Time", "uncommon", "+2 turns every round.", (m) => void (m.turns += 2)),
  ch("bank", "Piggy Bank", "uncommon", "Keep 10% of your coins as interest each round (up to 15).", (m) => void (m.interest += 0.1)),
  ch("discount", "Bribed Inspector", "uncommon", "Quotas are 15% lower.", (m) => void (m.quotaMul *= 0.85)),
  ch("taxhaven", "Tax Haven", "uncommon", "Another 10% interest each round.", (m) => void (m.interest += 0.1)),
  ch("overtime", "Overtime Pay", "common", "+1 turn every round.", (m) => void (m.turns += 1)),
  ch("landlord", "Landlord's Friend", "uncommon", "Quotas are 10% lower.", (m) => void (m.quotaMul *= 0.9)),
  ch("opinion", "Second Opinion", "common", "Re-draw the charm choice once per round.", (m) => void (m.rerolls += 1)),
  ch("timewarp", "Time Warp", "rare", "+3 turns every round.", (m) => void (m.turns += 3)),
  ch("loanshark", "Loan Shark", "uncommon", "+3 free pusher drops every round, quotas 10% higher.", (m) => void ((m.freeDropsPerRound += 3), (m.quotaMul *= 1.1))),
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

export interface Boss {
  id: string;
  name: string;
  text: string;
  effect: Effect;
}

/** Every third round is a boss round: one of these rules for that round, and a higher quota. */
export const BOSS_EVERY = 3;
export const BOSSES: readonly Boss[] = [
  { id: "collector", name: "The Collector", text: "Quota x1.5.", effect: (m) => void (m.quotaMul *= 1.5) },
  { id: "frozen", name: "Frozen Reels", text: "No wilds, no coin scatters. Quota x1.3.", effect: (m) => void ((m.weights.wild = 0), (m.weights.coin = 0), (m.quotaMul *= 1.3)) },
  { id: "shark", name: "Card Shark", text: "Poker pays half. Quota x1.3.", effect: (m) => void ((m.pokerMul *= 0.5), (m.quotaMul *= 1.3)) },
  { id: "slippery", name: "Slippery Shelf", text: "The pusher pays 60%. Quota x1.3.", effect: (m) => void ((m.pusherPayMul *= 0.6), (m.quotaMul *= 1.3)) },
  { id: "landlord", name: "The Landlord", text: "3 turns fewer. Quota x1.3.", effect: (m) => void ((m.turns = Math.max(4, m.turns - 3)), (m.quotaMul *= 1.3)) },
  { id: "edge", name: "House Edge", text: "Slot wins pay 70%. Quota x1.3.", effect: (m) => void ((m.slotWinMul *= 0.7), (m.quotaMul *= 1.3)) },
];

/** Each stake adds this much quota; from STAKE_TURNS on one turn less. */
export const STAKE_QUOTA = 0.12;
export const STAKE_TURNS = 3;
export const MAX_STAKE = 5;
