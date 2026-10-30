import type { Effect, Mods } from "./mods";
import type { Sym } from "./slot";

export interface TechNode {
  id: string;
  branch: "board" | "symbols" | "combos" | "economy";
  name: string;
  text: string;
  cost: number;
  requires: string[];
  effect: Effect;
}

/** The permanent tree, bought with chips between runs. Four branches; each node changes how a spin plays or what a run starts with. */
export const TECH: readonly TechNode[] = [
  // board: the grid grows one row or column at a time
  { id: "rows4", branch: "board", name: "Fourth Row", text: "The board gets a fourth row.", cost: 4, requires: [], effect: (m) => void (m.rows = Math.max(m.rows, 4)) },
  { id: "cols4", branch: "board", name: "Fourth Column", text: "The board gets a fourth column.", cost: 8, requires: ["rows4"], effect: (m) => void (m.cols = Math.max(m.cols, 4)) },
  { id: "rows5", branch: "board", name: "Fifth Row", text: "The board gets a fifth row.", cost: 14, requires: ["cols4"], effect: (m) => void (m.rows = Math.max(m.rows, 5)) },
  { id: "cols5", branch: "board", name: "Fifth Column", text: "The board gets a fifth column.", cost: 20, requires: ["rows5"], effect: (m) => void (m.cols = Math.max(m.cols, 5)) },
  { id: "rows6", branch: "board", name: "Sixth Row", text: "The board gets a sixth row.", cost: 28, requires: ["cols5"], effect: (m) => void (m.rows = Math.max(m.rows, 6)) },
  { id: "cols6", branch: "board", name: "Sixth Column", text: "The board gets a sixth column.", cost: 36, requires: ["rows6"], effect: (m) => void (m.cols = Math.max(m.cols, 6)) },
  { id: "slotbet", branch: "board", name: "High Roller Reels", text: "Slot max bet 5.", cost: 7, requires: ["rows4"], effect: (m) => void (m.slotMaxBet = 5) },

  // symbols: what falls onto the board and what it pays
  { id: "wild1", branch: "symbols", name: "Wild Stars", text: "Wild stars join the board and complete any group.", cost: 6, requires: [], effect: (m) => void (m.weights.wild += 1) },
  { id: "wild2", branch: "symbols", name: "Wilder Wilds", text: "More wild stars on the board.", cost: 12, requires: ["wild1"], effect: (m) => void (m.weights.wild += 1) },
  { id: "scatter2", branch: "symbols", name: "Coin Magnet", text: "More coin scatters on the board: more free spins.", cost: 8, requires: [], effect: (m) => void (m.weights.coin += 1) },
  { id: "sevens", branch: "symbols", name: "Lucky Sevens", text: "More sevens on the board.", cost: 10, requires: ["wild1"], effect: (m) => void (m.weights.seven += 1) },
  { id: "diamond", branch: "symbols", name: "Diamond Mine", text: "Diamonds appear on the board: the richest group of all.", cost: 14, requires: ["wild1"], effect: (m) => void (m.weights.diamond += 1) },
  { id: "highpay", branch: "symbols", name: "Gilded Bars", text: "BAR and seven groups pay 50% more.", cost: 16, requires: ["sevens"], effect: (m) => void ((m.symPay.bar *= 1.5), (m.symPay.seven *= 1.5)) },

  // combos: how a cascade chains
  { id: "chain1", branch: "combos", name: "Sticky Chain", text: "Each cascade step adds 0.25 more to the chain multiplier.", cost: 8, requires: [], effect: (m) => void (m.chainStep += 0.25) },
  { id: "chain2", branch: "combos", name: "Hot Chain", text: "Another 0.25 per cascade step.", cost: 16, requires: ["chain1"], effect: (m) => void (m.chainStep += 0.25) },
  { id: "cap1", branch: "combos", name: "Higher Ceiling", text: "The chain multiplier can reach 2 more.", cost: 12, requires: ["chain1"], effect: (m) => void (m.chainCap += 2) },
  { id: "opener", branch: "combos", name: "Strong Opener", text: "The first step of every chain already pays 0.5 more.", cost: 14, requires: ["chain1"], effect: (m) => void (m.chainStart += 0.5) },
  { id: "slotmul", branch: "combos", name: "Polished Chrome", text: "Slot wins pay 15% more.", cost: 18, requires: ["cap1"], effect: (m) => void (m.slotWinMul *= 1.15) },

  // economy: what a run starts with, and how it is paced
  { id: "purse1", branch: "economy", name: "Pocket Change", text: "Start each run with +10 coins.", cost: 3, requires: [], effect: (m) => void (m.startCoins += 10) },
  { id: "purse2", branch: "economy", name: "Lucky Wallet", text: "Start each run with +20 more coins.", cost: 8, requires: ["purse1"], effect: (m) => void (m.startCoins += 20) },
  { id: "time1", branch: "economy", name: "Overtime", text: "+1 turn every round.", cost: 6, requires: ["purse1"], effect: (m) => void (m.turns += 1) },
  { id: "time2", branch: "economy", name: "Night Shift", text: "+2 more turns every round.", cost: 14, requires: ["time1"], effect: (m) => void (m.turns += 2) },
  { id: "haggle", branch: "economy", name: "Haggler", text: "Quotas are 10% lower.", cost: 12, requires: ["purse2"], effect: (m) => void (m.quotaMul *= 0.9) },
  { id: "reroll", branch: "economy", name: "Second Look", text: "Re-draw the charm choice once per round.", cost: 9, requires: ["time1"], effect: (m) => void (m.rerolls += 1) },
  { id: "interest1", branch: "economy", name: "Savings Account", text: "Keep 5% of your coins as interest each round.", cost: 10, requires: ["purse2"], effect: (m) => void (m.interest += 0.05) },
  { id: "auto1", branch: "economy", name: "Auto-Spin", text: "Endless mode: the machine spins by itself, one spin every 2.5 seconds.", cost: 10, requires: ["purse1"], effect: (m) => void (m.autoRate = Math.max(m.autoRate, 0.4)) },
  { id: "auto2", branch: "economy", name: "Turbo Spin", text: "Endless mode: one automatic spin per second.", cost: 20, requires: ["auto1"], effect: (m) => void (m.autoRate = Math.max(m.autoRate, 1)) },
  { id: "case1", branch: "economy", name: "Display Case", text: "Equip a third relic.", cost: 6, requires: ["purse1"], effect: () => {} },
  { id: "case2", branch: "economy", name: "Trophy Room", text: "Equip a fourth relic.", cost: 14, requires: ["case1"], effect: () => {} },
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
  ch("cherrypick", "Cherry Picker", "uncommon", "Cherry clusters pay 3 times.", symPay("cherry", 3)),
  ch("lemonade", "Lemonade Stand", "common", "Lemon clusters pay 2 times.", symPay("lemon", 2)),
  ch("bellringer", "Bell Ringer", "common", "Bell clusters pay 2 times.", symPay("bell", 2)),
  ch("barfly", "Bar Fly", "uncommon", "BAR clusters pay 2 times.", symPay("bar", 2)),
  ch("sevenheaven", "Seven Heaven", "rare", "Seven clusters pay 1.5 times.", symPay("seven", 1.5)),
  ch("triplewild", "Triple Wild", "rare", "Many more wild stars on the reels.", (m) => void (m.weights.wild += 3)),
  ch("orchard", "Cherry Orchard", "common", "More cherries on the reels.", (m) => void (m.weights.cherry += 3)),
  ch("belltower", "Bell Tower", "uncommon", "More bells on the reels.", (m) => void (m.weights.bell += 2)),
  ch("highroll", "High Roller", "uncommon", "Slot max bet +2.", (m) => void (m.slotMaxBet += 2)),
  ch("chainlink", "Chain Link", "uncommon", "Each cascade step adds 0.2 more to the chain multiplier.", (m) => void (m.chainStep += 0.2)),
  ch("ceiling", "Glass Ceiling", "rare", "The chain multiplier can reach 3 more.", (m) => void (m.chainCap += 3)),
  ch("opening", "Opening Move", "common", "The first step of every chain pays 0.3 more.", (m) => void (m.chainStart += 0.3)),
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
  /** coins for level 1; each further level costs 1.5 times the one before */
  base: number;
  max: number;
  effect: (m: Mods, level: number) => void;
}

/** Bought with coins during a run, level by level, gone when the run ends (like towers in a tower defense). */
export const UPGRADES: readonly Upgrade[] = [
  { id: "reels", name: "Reel Tuning", text: "Slot wins pay +10% per level.", base: 8, max: 5, effect: (m, l) => void (m.slotWinMul *= 1 + 0.1 * l) },
  { id: "wilds", name: "Wild Reels", text: "+1 wild star on the reels per level.", base: 10, max: 3, effect: (m, l) => void (m.weights.wild += l) },
  { id: "chainup", name: "Chain Booster", text: "+0.1 chain multiplier per cascade step, per level.", base: 12, max: 4, effect: (m, l) => void (m.chainStep += 0.1 * l) },
  { id: "lure", name: "Scatter Lure", text: "+1 coin scatter on the board per level.", base: 12, max: 3, effect: (m, l) => void (m.weights.coin += l) },
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
  { id: "collector", name: "The Collector", text: "Quota x1.35.", effect: (m) => void (m.quotaMul *= 1.35) },
  { id: "frozen", name: "Frozen Reels", text: "No wilds, no coin scatters. Quota x1.2.", effect: (m) => void ((m.weights.wild = 0), (m.weights.coin = 0), (m.quotaMul *= 1.2)) },
  { id: "landlord", name: "The Landlord", text: "3 turns fewer. Quota x1.2.", effect: (m) => void ((m.turns = Math.max(4, m.turns - 3)), (m.quotaMul *= 1.2)) },
  { id: "edge", name: "House Edge", text: "Slot wins pay 70%. Quota x1.2.", effect: (m) => void ((m.slotWinMul *= 0.7), (m.quotaMul *= 1.2)) },
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
  dice: { text: "+1 seven on the reels.", effect: (m) => void (m.weights.seven += 1) },
  tooth: { text: "Keep 5% of your coins as interest each round.", effect: (m) => void (m.interest += 0.05) },
  cat: { text: "+1 coin scatter on the reels.", effect: (m) => void (m.weights.coin += 1) },
  key: { text: "Start each run with 1 ticket.", effect: (m) => void (m.startTickets += 1) },
  chip: { text: "Slot wins pay 5% more.", effect: (m) => void (m.slotWinMul *= 1.05) },
  horse: { text: "Slot wins pay 10% more.", effect: (m) => void (m.slotWinMul *= 1.1) },
  ace: { text: "Cherry clusters pay 1.5 times.", effect: symPay("cherry", 1.5) },
  bell: { text: "Bell clusters pay 1.5 times.", effect: symPay("bell", 1.5) },
  jukebox: { text: "+1 coin scatter on the reels.", effect: (m) => void (m.weights.coin += 1) },
  crown: { text: "Quotas are 5% lower.", effect: (m) => void (m.quotaMul *= 0.95) },
  eye: { text: "+1 wild star on the reels.", effect: (m) => void (m.weights.wild += 1) },
  luckycharm: { text: "Slot wins pay 20% more, start with 5 more coins.", effect: (m) => void ((m.slotWinMul *= 1.2), (m.startCoins += 5)) },
  trickdeck: { text: "Slot wins pay 10% more, cherry clusters pay 2 times.", effect: (m) => void ((m.slotWinMul *= 1.1), symPay("cherry", 2)(m)) },
  goldbell: { text: "Bell clusters pay 2 times, +5% interest.", effect: (m) => void (symPay("bell", 2)(m), (m.interest += 0.05)) },
  idol: { text: "+1 turn every round, +1 coin scatter.", effect: (m) => void ((m.turns += 1), (m.weights.coin += 1)) },
  vault: { text: "Start each run with 3 tickets.", effect: (m) => void (m.startTickets += 3) },
  musicbox: { text: "+2 coin scatters on the reels, +1 turn.", effect: (m) => void ((m.weights.coin += 2), (m.turns += 1)) },
  throne: { text: "Quotas are 10% lower, +10% interest.", effect: (m) => void ((m.quotaMul *= 0.9), (m.interest += 0.1)) },
  fortune: { text: "+2 wild stars on the reels.", effect: (m) => void (m.weights.wild += 2) },
  grand: { text: "Slot wins pay 30% more, seven clusters pay 1.5 times, +1 turn.", effect: (m) => void ((m.slotWinMul *= 1.3), symPay("seven", 1.5)(m), (m.turns += 1)) },
};

/** Curses are charms with a price: the run carries them, the call and the shop never offer them. */
export const CURSES: readonly Omit<Charm, "rarity">[] = [
  { id: "karma", name: "Bad Karma", text: "Slot wins pay 10% less.", effect: (m) => void (m.slotWinMul *= 0.9) },
  { id: "debt", name: "Debt", text: "Quotas are 15% higher.", effect: (m) => void (m.quotaMul *= 1.15) },
  { id: "haunted", name: "Haunted", text: "1 turn fewer every round.", effect: (m) => void (m.turns = Math.max(4, m.turns - 1)) },
];
