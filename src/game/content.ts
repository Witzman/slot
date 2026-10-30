import type { Effect, Mods } from "./mods";
import type { HandRank } from "./hands";

export interface TechNode {
  id: string;
  branch: "hold" | "cards" | "hands" | "economy";
  name: string;
  text: string;
  cost: number;
  requires: string[];
  /** the modes a node is for; none given: both */
  modes?: ("climb" | "endless")[];
  effect: Effect;
}

/** The permanent tree, bought with chips between runs. Four branches; the Hold, Cards and Hands branches come with the card upgrades. */
export const TECH: readonly TechNode[] = [
  { id: "purse1", branch: "economy", name: "Pocket Change", text: "Start each run with +20 coins.", cost: 3, requires: [], effect: (m) => void (m.startCoins += 20) },
  { id: "purse2", branch: "economy", name: "Lucky Wallet", text: "Start each run with +40 more coins.", cost: 8, requires: ["purse1"], effect: (m) => void (m.startCoins += 40) },
  { id: "time1", branch: "economy", name: "Overtime", text: "+1 turn every round.", cost: 6, requires: ["purse1"], modes: ["climb"], effect: (m) => void (m.turns += 1) },
  { id: "time2", branch: "economy", name: "Night Shift", text: "+2 more turns every round.", cost: 14, requires: ["time1"], modes: ["climb"], effect: (m) => void (m.turns += 2) },
  { id: "haggle", branch: "economy", name: "Haggler", text: "Quotas are 10% lower.", cost: 12, requires: ["purse2"], modes: ["climb"], effect: (m) => void (m.quotaMul *= 0.9) },
  { id: "reroll", branch: "economy", name: "Second Look", text: "Re-draw the charm choice once per round.", cost: 9, requires: ["time1"], modes: ["climb"], effect: (m) => void (m.rerolls += 1) },
  { id: "case1", branch: "economy", name: "Display Case", text: "Equip a third relic.", cost: 6, requires: ["purse1"], modes: ["climb"], effect: () => {} },
  { id: "case2", branch: "economy", name: "Trophy Room", text: "Equip a fourth relic.", cost: 14, requires: ["case1"], modes: ["climb"], effect: () => {} },
  { id: "slotbet", branch: "economy", name: "High Roller", text: "Max bet 5.", cost: 7, requires: ["purse1"], effect: (m) => void (m.slotMaxBet = 5) },
  { id: "slotmul", branch: "economy", name: "Polished Felt", text: "Every round pays 15% more.", cost: 16, requires: ["slotbet"], effect: (m) => void (m.slotWinMul *= 1.15) },
  { id: "interest1", branch: "economy", name: "Savings Account", text: "Keep 5% of your coins as interest each round.", cost: 10, requires: ["purse2"], modes: ["climb"], effect: (m) => void (m.interest += 0.05) },
  { id: "auto1", branch: "economy", name: "Auto-Play", text: "Endless mode: the machine plays a round by itself every 4 seconds.", cost: 10, requires: ["purse1"], modes: ["endless"], effect: (m) => void (m.autoRate = Math.max(m.autoRate, 0.25)) },
  { id: "auto2", branch: "economy", name: "Turbo Play", text: "Endless mode: a round every second.", cost: 20, requires: ["auto1"], modes: ["endless"], effect: (m) => void (m.autoRate = Math.max(m.autoRate, 1)) },

  // hold: a round starts with at most two held lines, the tree widens that and adds single cards and free draws
  { id: "hold3", branch: "hold", name: "Third Hold", text: "Hold up to 3 lines.", cost: 6, requires: [], effect: (m) => void (m.holdMax = Math.max(m.holdMax, 3)) },
  { id: "hold4", branch: "hold", name: "Fourth Hold", text: "Hold up to 4 lines.", cost: 12, requires: ["hold3"], effect: (m) => void (m.holdMax = Math.max(m.holdMax, 4)) },
  { id: "hold5", branch: "hold", name: "Fifth Hold", text: "Hold up to 5 lines.", cost: 20, requires: ["hold4"], effect: (m) => void (m.holdMax = Math.max(m.holdMax, 5)) },
  { id: "single", branch: "hold", name: "Single Hold", text: "Hold single cards, not only rows and columns.", cost: 10, requires: ["hold3"], effect: (m) => void (m.singleHold = true) },
  { id: "redraw1", branch: "hold", name: "Second Draw", text: "A free second draw: hold again, only the last draw pays.", cost: 16, requires: ["single"], effect: (m) => void (m.redraws += 1) },
  { id: "redraw2", branch: "hold", name: "Third Draw", text: "A free third draw.", cost: 30, requires: ["redraw1"], effect: (m) => void (m.redraws += 1) },

  // cards: the deck and what a single card can become
  { id: "deck2", branch: "cards", name: "Cold Deck", text: "The twos leave the deck.", cost: 8, requires: [], effect: (m) => void (m.removedRanks.includes(2) || m.removedRanks.push(2)) },
  { id: "deck3", branch: "cards", name: "Slim Deck", text: "The threes leave the deck too.", cost: 16, requires: ["deck2"], effect: (m) => void (m.removedRanks.includes(3) || m.removedRanks.push(3)) },
  { id: "golds", branch: "cards", name: "Gold Leaf", text: "Cards can be gilded: every hand with a gold card pays 50% more.", cost: 10, requires: [], effect: (m) => void m.cardKinds.push("gold") },
  { id: "anysuit", branch: "cards", name: "Chameleon", text: "Cards can count as any suit.", cost: 12, requires: ["golds"], effect: (m) => void m.cardKinds.push("anySuit") },
  { id: "jokers", branch: "cards", name: "Joker Shop", text: "Cards can become jokers, the best card for any hand.", cost: 20, requires: ["golds"], effect: (m) => void m.cardKinds.push("joker") },
  { id: "cardcost", branch: "cards", name: "Card Discount", text: "Card upgrades cost 25% less.", cost: 14, requires: ["golds"], effect: (m) => void (m.cardCostMul *= 0.75) },

  // hands: what each kind of hand pays
  { id: "pairs1", branch: "hands", name: "Pair Bonus", text: "Jacks or better and two pair pay 25% more.", cost: 6, requires: [], effect: (m) => void (["jacks", "twoPair"] as const).forEach((r) => (m.handMul[r] *= 1.25)) },
  { id: "pairs2", branch: "hands", name: "Pair Bonus II", text: "Jacks or better and two pair pay another 25% more.", cost: 14, requires: ["pairs1"], effect: (m) => void (["jacks", "twoPair"] as const).forEach((r) => (m.handMul[r] *= 1.25)) },
  { id: "runs1", branch: "hands", name: "Runs and Colours", text: "Three of a kind, straights and flushes pay 25% more.", cost: 8, requires: [], effect: (m) => void (["three", "straight", "flush"] as const).forEach((r) => (m.handMul[r] *= 1.25)) },
  { id: "runs2", branch: "hands", name: "Runs and Colours II", text: "Three of a kind, straights and flushes pay another 25% more.", cost: 16, requires: ["runs1"], effect: (m) => void (["three", "straight", "flush"] as const).forEach((r) => (m.handMul[r] *= 1.25)) },
  { id: "bigs1", branch: "hands", name: "Big Hands", text: "Full houses and four of a kind pay 25% more.", cost: 10, requires: ["runs1"], effect: (m) => void (["fullHouse", "four"] as const).forEach((r) => (m.handMul[r] *= 1.25)) },
  { id: "royals", branch: "hands", name: "Royal Court", text: "Straight flushes and royal flushes pay 50% more.", cost: 22, requires: ["bigs1"], effect: (m) => void (["straightFlush", "royal"] as const).forEach((r) => (m.handMul[r] *= 1.5)) },
  { id: "linebonus", branch: "hands", name: "Many Hands", text: "Each paying line beyond the third makes the round pay 10% more.", cost: 12, requires: ["pairs1"], effect: (m) => void (m.lineBonus += 0.1) },
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
/** Raise the pay of some hand ranks. */
const hands = (k: number, ...ranks: HandRank[]): Effect => (m) => void ranks.forEach((r) => (m.handMul[r] *= k));
const noRanks = (...r: number[]): Effect => (m) => void r.forEach((x) => m.removedRanks.includes(x) || m.removedRanks.push(x));

/** Run charms: one free pick of three after each round (the phone call), the rest bought with tickets; gone when the run ends. */
export const CHARMS: readonly Charm[] = [
  // hands
  ch("sharp", "Card Sharp", "common", "Jacks or better and two pair pay 50% more.", hands(1.5, "jacks", "twoPair")),
  ch("threes", "Three's Company", "common", "Three of a kind pays 50% more.", hands(1.5, "three")),
  ch("runner", "Straight Shooter", "common", "Straights pay 50% more.", hands(1.5, "straight")),
  ch("flushfever", "Flush Fever", "uncommon", "Flushes pay 50% more, straights 30% more.", (m) => (hands(1.5, "flush")(m), hands(1.3, "straight")(m))),
  ch("fulltable", "Full Table", "uncommon", "Full houses pay 50% more, four of a kind 30% more.", (m) => (hands(1.5, "fullHouse")(m), hands(1.3, "four")(m))),
  ch("royalty", "Royal Treatment", "rare", "Royal and straight flushes pay twice.", hands(2, "royal", "straightFlush")),
  ch("quads", "Quad Squad", "uncommon", "Four and five of a kind pay twice.", hands(2, "four", "five")),
  ch("clover", "Four-Leaf Clover", "common", "Every round pays 20% more.", (m) => void (m.slotWinMul *= 1.2)),
  ch("stacked", "Stacked Deck", "uncommon", "Every round pays 30% more.", (m) => void (m.slotWinMul *= 1.3)),
  ch("manyhands", "Many Hands", "uncommon", "Each paying line beyond the third makes the round pay 15% more.", (m) => void (m.lineBonus += 0.15)),
  ch("encore", "Encore", "rare", "Each paying line beyond the third makes the round pay 30% more.", (m) => void (m.lineBonus += 0.3)),
  // the deck and the hold
  ch("colddeck", "Cold Deck", "uncommon", "The twos leave the deck.", noRanks(2)),
  ch("slimdeck", "Slim Deck", "rare", "The twos and threes leave the deck.", noRanks(2, 3)),
  ch("steady", "Steady Hands", "rare", "You may hold single cards.", (m) => void (m.singleHold = true)),
  ch("seconddraw", "Second Draw", "rare", "A free second draw: hold again, only the last draw pays.", (m) => void (m.redraws += 1)),
  ch("highroll", "High Roller", "uncommon", "Max bet +2.", (m) => void (m.slotMaxBet += 2)),
  // economy
  ch("extra", "Borrowed Time", "uncommon", "+2 turns every round.", (m) => void (m.turns += 2)),
  ch("bank", "Piggy Bank", "uncommon", "Keep 10% of your coins as interest each round (up to 15).", (m) => void (m.interest += 0.1)),
  ch("discount", "Bribed Inspector", "uncommon", "Quotas are 15% lower.", (m) => void (m.quotaMul *= 0.85)),
  ch("taxhaven", "Tax Haven", "uncommon", "Another 10% interest each round.", (m) => void (m.interest += 0.1)),
  ch("overtime", "Overtime Pay", "common", "+1 turn every round.", (m) => void (m.turns += 1)),
  ch("landlord", "Landlord's Friend", "uncommon", "Quotas are 10% lower.", (m) => void (m.quotaMul *= 0.9)),
  ch("opinion", "Second Opinion", "common", "Re-draw the charm choice once per round.", (m) => void (m.rerolls += 1)),
  ch("timewarp", "Time Warp", "rare", "+3 turns every round.", (m) => void (m.turns += 3)),
];

export interface Relic {
  id: string;
  name: string;
  text: string;
  /** a crafted relic: the two relics that make it (the ingredients stay with you) */
  craft?: [string, string];
}

/** Collectibles: found by beating bosses, kept for ever. */
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
  /** coins for level 1; each further level costs `growth` (1.5 when not given) times the one before */
  base: number;
  growth?: number;
  max: number;
  effect: (m: Mods, level: number) => void;
}

/** Bought with coins during a run, level by level, gone when the run ends (like towers in a tower defense). */
export const UPGRADES: readonly Upgrade[] = [
  { id: "pay", name: "Better Odds", text: "Every round pays +10% per level.", base: 20, max: 5, effect: (m, l) => void (m.slotWinMul *= 1 + 0.1 * l) },
  { id: "pairs", name: "Pair Bonus", text: "Jacks or better and two pair pay +15% per level.", base: 15, max: 5, effect: (m, l) => void (["jacks", "twoPair"] as const).forEach((r) => (m.handMul[r] *= 1 + 0.15 * l)) },
  { id: "bigs", name: "Big Hands", text: "Straights and better pay +12% per level.", base: 25, max: 5, effect: (m, l) => void (["straight", "flush", "fullHouse", "four", "straightFlush", "royal"] as const).forEach((r) => (m.handMul[r] *= 1 + 0.12 * l)) },
  { id: "hours", name: "Longer Shifts", text: "+1 turn per round per level, from the next round.", base: 30, max: 3, effect: (m, l) => void (m.turns += l) },
  { id: "savings", name: "Savings Account", text: "+5% interest per level.", base: 25, max: 3, effect: (m, l) => void (m.interest += 0.05 * l) },
];

export const upgradeCost = (u: Upgrade, level: number): number => Math.ceil(u.base * Math.pow(u.growth ?? 1.5, level));

/** What the endless shop sells, bought with coins until the next prestige. Many small levels: there is always something to save for. Starting values; the balance pass retunes them. */
export const ENDLESS_UPGRADES: readonly Upgrade[] = [
  { id: "epay", name: "Better Odds", text: "Every round pays +8% per level.", base: 30, growth: 1.22, max: 200, effect: (m, l) => void (m.slotWinMul *= 1 + 0.08 * l) },
  { id: "epairs", name: "Pair Bonus", text: "Jacks or better and two pair pay +10% per level.", base: 20, growth: 1.25, max: 80, effect: (m, l) => void (["jacks", "twoPair"] as const).forEach((r) => (m.handMul[r] *= 1 + 0.1 * l)) },
  { id: "ebigs", name: "Big Hands", text: "Three of a kind and better pay +8% per level.", base: 40, growth: 1.27, max: 80, effect: (m, l) => void (["three", "straight", "flush", "fullHouse", "four", "straightFlush", "royal"] as const).forEach((r) => (m.handMul[r] *= 1 + 0.08 * l)) },
  { id: "eline", name: "Many Hands", text: "Each paying line beyond the third makes a round pay +4% more per level.", base: 80, growth: 1.5, max: 20, effect: (m, l) => void (m.lineBonus += 0.04 * l) },
  { id: "ehold", name: "More Holds", text: "Hold one more line per level (3 levels).", base: 120, growth: 4, max: 3, effect: (m, l) => void (m.holdMax += l) },
  { id: "edraw", name: "Free Draw", text: "One more free draw per level: hold again, only the last draw pays.", base: 400, growth: 6, max: 2, effect: (m, l) => void (m.redraws += l) },
  { id: "ebet", name: "High Roller", text: "The max bet is 1 higher per level.", base: 60, growth: 2.2, max: 4, effect: (m, l) => void (m.slotMaxBet += l) },
];

export interface Boss {
  id: string;
  name: string;
  text: string;
  effect: Effect;
}

/** Every third round is a boss round: one of these rules for that round, and a higher quota. */
export const BOSS_EVERY = 3;
export const BOSSES: readonly Boss[] = [
  { id: "collector", name: "The Collector", text: "Quota x1.35.", effect: (m) => void (m.quotaMul *= 1.35) },
  { id: "nohold", name: "No Holds", text: "You cannot hold anything. Quota x1.2.", effect: (m) => void ((m.holdMax = 0), (m.quotaMul *= 1.2)) },
  { id: "landlord", name: "The Landlord", text: "3 turns fewer. Quota x1.2.", effect: (m) => void ((m.turns = Math.max(4, m.turns - 3)), (m.quotaMul *= 1.2)) },
  { id: "edge", name: "House Edge", text: "Every round pays 70%. Quota x1.2.", effect: (m) => void ((m.slotWinMul *= 0.7), (m.quotaMul *= 1.2)) },
  { id: "lowpay", name: "Low Pay", text: "Pairs and two pair pay nothing. Quota x1.2.", effect: (m) => void ((m.handMul.jacks = 0), (m.handMul.twoPair = 0), (m.quotaMul *= 1.2)) },
  { id: "lockout", name: "The Lockout", text: "One line, marked on the board, pays nothing. Quota x1.15.", effect: (m) => void (m.quotaMul *= 1.15) },
  { id: "shackles", name: "The Shackles", text: "Columns cannot be held, rows can. Quota x1.15.", effect: (m) => void ((m.colHold = false), (m.quotaMul *= 1.15)) },
];

export interface Voucher {
  id: string;
  name: string;
  text: string;
  /** a second tier is only on sale once its first is owned */
  tier: 1 | 2;
  requires?: string;
  /** tickets */
  price: number;
  effect: Effect;
}

/** One voucher is on sale after each cleared round: a permanent upgrade for the run, in tiered pairs. Owned ones are kept in `run.upgrades` at level 1. */
export const VOUCHERS: readonly Voucher[] = [
  { id: "v_hold1", name: "Steady Hands", text: "Hold one more line.", tier: 1, price: 6, effect: (m) => void (m.holdMax += 1) },
  { id: "v_hold2", name: "Iron Grip", text: "Hold one more line again.", tier: 2, requires: "v_hold1", price: 9, effect: (m) => void (m.holdMax += 1) },
  { id: "v_pay1", name: "Sharp Eye", text: "Every round pays 8% more.", tier: 1, price: 6, effect: (m) => void (m.slotWinMul *= 1.08) },
  { id: "v_pay2", name: "Hawk Eye", text: "Every round pays 8% more again.", tier: 2, requires: "v_pay1", price: 9, effect: (m) => void (m.slotWinMul *= 1.08) },
  { id: "v_turn1", name: "Overtime", text: "+1 turn every round.", tier: 1, price: 6, effect: (m) => void (m.turns += 1) },
  { id: "v_turn2", name: "Night Shift", text: "+1 turn every round again.", tier: 2, requires: "v_turn1", price: 9, effect: (m) => void (m.turns += 1) },
  { id: "v_quota1", name: "Haggler", text: "Quotas are 6% lower.", tier: 1, price: 6, effect: (m) => void (m.quotaMul *= 0.94) },
  { id: "v_quota2", name: "Silver Tongue", text: "Quotas are 6% lower again.", tier: 2, requires: "v_quota1", price: 9, effect: (m) => void (m.quotaMul *= 0.94) },
];

/** Each stake adds this much quota; from STAKE_TURNS on one turn less. */
export const STAKE_QUOTA = 0.12;
export const STAKE_TURNS = 3;
export const MAX_STAKE = 5;

/** Relic slots: 2, plus one for each display tech node. */
export const BASE_RELIC_SLOTS = 2;

export interface Perk {
  text: string;
  effect: Effect;
}

/** What an equipped relic does for a run. Crafted relics are stronger. */
export const RELIC_PERKS: Readonly<Record<string, Perk>> = {
  penny: { text: "Start each run with 5 more coins.", effect: (m) => void (m.startCoins += 5) },
  dice: { text: "Jacks or better and two pair pay 10% more.", effect: hands(1.1, "jacks", "twoPair") },
  tooth: { text: "Keep 5% of your coins as interest each round.", effect: (m) => void (m.interest += 0.05) },
  cat: { text: "Three of a kind pays 20% more.", effect: hands(1.2, "three") },
  key: { text: "Start each run with 1 ticket.", effect: (m) => void (m.startTickets += 1) },
  chip: { text: "Every round pays 5% more.", effect: (m) => void (m.slotWinMul *= 1.05) },
  horse: { text: "Every round pays 10% more.", effect: (m) => void (m.slotWinMul *= 1.1) },
  ace: { text: "Full houses pay 30% more.", effect: hands(1.3, "fullHouse") },
  bell: { text: "Flushes pay 30% more.", effect: hands(1.3, "flush") },
  jukebox: { text: "Straights pay 30% more.", effect: hands(1.3, "straight") },
  crown: { text: "Quotas are 5% lower.", effect: (m) => void (m.quotaMul *= 0.95) },
  eye: { text: "The twos leave the deck.", effect: noRanks(2) },
  luckycharm: { text: "Every round pays 20% more, start with 5 more coins.", effect: (m) => void ((m.slotWinMul *= 1.2), (m.startCoins += 5)) },
  trickdeck: { text: "Every round pays 10% more, three of a kind and two pair pay 30% more.", effect: (m) => void ((m.slotWinMul *= 1.1), hands(1.3, "three", "twoPair")(m)) },
  goldbell: { text: "Flushes and full houses pay 30% more, +5% interest.", effect: (m) => void (hands(1.3, "flush", "fullHouse")(m), (m.interest += 0.05)) },
  idol: { text: "+1 turn every round, four of a kind pays 30% more.", effect: (m) => void ((m.turns += 1), hands(1.3, "four")(m)) },
  vault: { text: "Start each run with 3 tickets.", effect: (m) => void (m.startTickets += 3) },
  musicbox: { text: "Straights pay 30% more, +1 turn.", effect: (m) => void (hands(1.3, "straight")(m), (m.turns += 1)) },
  throne: { text: "Quotas are 10% lower, +10% interest.", effect: (m) => void ((m.quotaMul *= 0.9), (m.interest += 0.1)) },
  fortune: { text: "The twos and threes leave the deck.", effect: noRanks(2, 3) },
  grand: { text: "Every round pays 30% more, royal flushes pay twice, +1 turn.", effect: (m) => void ((m.slotWinMul *= 1.3), hands(2, "royal")(m), (m.turns += 1)) },
};

/** Curses are charms with a price: the run carries them, the call and the shop never offer them. */
export const CURSES: readonly Omit<Charm, "rarity">[] = [
  { id: "karma", name: "Bad Karma", text: "Slot wins pay 10% less.", effect: (m) => void (m.slotWinMul *= 0.9) },
  { id: "debt", name: "Debt", text: "Quotas are 15% higher.", effect: (m) => void (m.quotaMul *= 1.15) },
  { id: "haunted", name: "Haunted", text: "1 turn fewer every round.", effect: (m) => void (m.turns = Math.max(4, m.turns - 1)) },
];
