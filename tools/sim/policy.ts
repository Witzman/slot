// The players of the simulation: a competent one that decides its holds by expected value, and two that do not think.
import { CHARMS, UPGRADES, upgradeCost } from "../../src/game/content";
import { type CardKind, CARD_KINDS, applyCardUpgrade, cardUpgradeCost } from "../../src/game/cards-shop";
import { rankOf, suitOf } from "../../src/game/cards";
import type { Mods } from "../../src/game/mods";
import { type Run, quotaFor } from "../../src/game/run";
import { type CardUpgrade, type Deal, type Hold, LINES, SIZE, deal, drawRound, lineCells, scoreBoard } from "../../src/game/round";
import { makeRng } from "../../src/game/rng";
import type { Policy } from "./harness";

/** What a hold decision needs to see: the round on the table and the card upgrades (a climb run or an endless session). */
export interface HoldState {
  hand: Deal | null;
  cardUpgrades: Readonly<Record<number, CardUpgrade>>;
}

const NONE: Hold = { rows: [], cols: [], cells: [] };
const holdOf = (lines: readonly number[]): Hold => ({ rows: lines.filter((l) => l < SIZE), cols: lines.filter((l) => l >= SIZE).map((l) => l - SIZE), cells: [] });

/** How promising a line is to keep: pairs and runs of one suit or rank count. A cheap guess; the expected value decides in the end. */
function potential(board: readonly number[], line: number, ups: Readonly<Record<number, CardUpgrade>>): number {
  const cards = lineCells(line).map((i) => board[i] as number);
  const ranks = cards.map((c) => Math.min(14, rankOf(c) + (ups[c]?.rank ?? 0)));
  const count = new Map<number, number>();
  for (const r of ranks) count.set(r, (count.get(r) ?? 0) + 1);
  const suits = new Map<number, number>();
  for (const c of cards) suits.set(suitOf(c), (suits.get(suitOf(c)) ?? 0) + 1);
  const same = Math.max(...count.values());
  const flush = Math.max(...suits.values());
  const sorted = [...new Set(ranks)].sort((a, b) => a - b);
  let run = 1;
  let best = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = (sorted[i] as number) - (sorted[i - 1] as number) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const jokers = cards.filter((c) => ups[c]?.joker).length;
  return same * 3 + flush * 1.5 + best + jokers * 4 + ranks.filter((r) => r >= 11).length * 0.4;
}

function expected(run: HoldState, m: Mods, board: number[], hold: Hold, samples: number, drawsLeft: number): number {
  const rng = makeRng(777);
  let total = 0;
  for (let i = 0; i < samples; i++) {
    const d = { board: [...board], bet: 1, phase: "hold" as const, draws: 0, maxDraws: 1 };
    const res = drawRound(rng, d, hold, { removedRanks: m.removedRanks, singleHold: m.singleHold, upgrades: run.cardUpgrades, score: { handMul: m.handMul, globalMul: m.slotWinMul, lineBonus: m.lineBonus } });
    if (typeof res !== "string") total += res.payout;
  }
  return total / samples + (drawsLeft > 1 ? 0.1 : 0);
}

/** Holds by expected value: starting from nothing, add the line that raises the average payout of a few sample draws the most, while it helps and the limit allows. */
export function smartHold(run: HoldState, m: Mods): Hold {
  const d = run.hand;
  if (!d || m.holdMax === 0) return NONE;
  const board = d.board;
  const drawsLeft = d.maxDraws - d.draws;
  const ranked = Array.from({ length: LINES }, (_, l) => l).sort((a, b) => potential(board, b, run.cardUpgrades) - potential(board, a, run.cardUpgrades)).slice(0, 4);
  let held: number[] = [];
  let best = expected(run, m, board, NONE, 6, drawsLeft);
  while (held.length < Math.min(m.holdMax, 4)) {
    let pick = -1;
    let pickValue = best;
    for (const l of ranked) {
      if (held.includes(l)) continue;
      const v = expected(run, m, board, holdOf([...held, l]), 6, drawsLeft);
      if (v > pickValue + 1e-9) [pick, pickValue] = [l, v];
    }
    if (pick < 0) break;
    held = [...held, pick];
    best = pickValue;
  }
  return holdOf(held);
}

const cache = new Map<string, number>();
/** Average coins per round per coin staked of a set of mods with a simple hold rule (the best line), over fixed rounds. */
export function rtp(m: Mods): number {
  const key = JSON.stringify([m.handMul, m.slotWinMul, m.lineBonus, m.removedRanks, m.holdMax, m.redraws]);
  let v = cache.get(key);
  if (v === undefined) {
    const rng = makeRng(31337);
    let paid = 0;
    const n = 250;
    for (let i = 0; i < n; i++) {
      const d = deal(rng, 1, m.removedRanks, m.redraws);
      const opts = { removedRanks: m.removedRanks, singleHold: m.singleHold, upgrades: {}, score: { handMul: m.handMul, globalMul: m.slotWinMul, lineBonus: m.lineBonus } };
      let res;
      for (let k = 0; k < d.maxDraws; k++) {
        const lines = scoreBoard(d.board, 1, {}, opts.score).lines;
        const top = [...lines].sort((a, b) => b.pay - a.pay)[0];
        const hold = top && m.holdMax > 0 ? holdOf([top.line]) : NONE;
        res = drawRound(rng, d, hold, opts);
      }
      if (res && typeof res !== "string") paid += res.payout;
    }
    cache.set(key, (v = paid / (n * LINES)));
  }
  return v;
}

/** What a set of mods is worth per round, in coins: the return over the cost, plus what the other mods give. */
function value(m: Mods, round: number): number {
  const r = rtp(m);
  const bet = r >= 1 ? m.slotMaxBet : 1;
  const hold = (m.holdMax - 2) * 0.02 + (m.singleHold ? 0.03 : 0) + m.redraws * 0.12;
  return m.turns * bet * LINES * (r + hold - 1) + 30 * m.interest + quotaFor(round, { ...m, quotaMul: 1 }) * (1 - m.quotaMul) + 0.5 * m.startTickets;
}

export const smart: Policy = {
  bet(run, m) {
    const r = rtp(m);
    // never stake more than a twelfth of the wallet on a round: a few bad rounds must not end the run
    const cap = Math.max(1, Math.floor(run.coins / (LINES * 12)));
    if (r >= 1.02) return Math.min(m.slotMaxBet, cap);
    const need = run.quota - run.coins;
    return run.turnsLeft <= 2 && need > 0 ? m.slotMaxBet : 1;
  },
  hold: smartHold,
  draft(run, mk) {
    const base = value(mk(run.charms), run.round);
    let best = run.draft[0] as string;
    let bestGain = -Infinity;
    for (const id of run.draft) {
      const g = value(mk([...run.charms, id]), run.round) - base;
      if (g > bestGain) [best, bestGain] = [id, g];
    }
    return best;
  },
  shop(run, mk) {
    const base = value(mk(run.charms), run.round);
    let best: string | null = null;
    let bestRatio = 0.5;
    for (const id of run.shop) {
      const price = { common: 2, uncommon: 4, rare: 7 }[CHARMS.find((c) => c.id === id)?.rarity ?? "rare"];
      if (run.tickets < price) continue;
      const ratio = (value(mk([...run.charms, id]), run.round) - base) / price;
      if (ratio > bestRatio) [best, bestRatio] = [id, ratio];
    }
    return best;
  },
  buy(run, m) {
    const base = value(m, run.round);
    let best: string | null = null;
    let bestRatio = 0.05;
    for (const u of UPGRADES) {
      const level = run.upgrades[u.id] ?? 0;
      if (level >= u.max) continue;
      const cost = upgradeCost(u, level);
      if (run.coins - cost < run.quota + m.turns * LINES * 0.5) continue; // keep the money the next rounds are played with
      const next = { ...m, handMul: { ...m.handMul } };
      u.effect(next, 1);
      const ratio = (value(next, run.round) - base) / cost;
      if (ratio > bestRatio) [best, bestRatio] = [u.id, ratio];
    }
    return best;
  },
  buyCard(run, m) {
    // gold on a card that sits in a held line pays most; the bot keeps it simple: gild or rank up the cards of the deck at random once it is rich
    const kinds = CARD_KINDS.filter((k) => m.cardKinds.includes(k) && k !== "joker");
    if (kinds.length === 0) return null;
    const kind = (kinds.includes("gold") ? "gold" : "rank") as CardKind;
    const cost = cardUpgradeCost(run.cardUpgrades, kind, m.cardCostMul);
    if (run.coins - cost < run.quota * 2 + 100) return null;
    const card = [...Array(52).keys()].filter((c) => !m.removedRanks.includes(rankOf(c))).find((c) => applyCardUpgrade(run.cardUpgrades, c, kind) !== null && rankOf(c) >= 10);
    return card === undefined ? null : { card, kind };
  },
  event: () => 0,
};

/** Never holds anything: every round is two dealt hands in one. */
export const never: Policy = { ...smart, hold: () => NONE, bet: () => 1, buy: () => null, buyCard: () => null, shop: () => null, draft: (run) => run.draft[0] as string, event: () => 1 };

/** Always holds as many lines as the limit allows, whatever they are (the first rows): a player who does not look. */
export const always: Policy = { ...never, hold: (run, m) => holdOf(Array.from({ length: Math.min(m.holdMax, LINES) }, (_, i) => i)) };
