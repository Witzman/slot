import { BASE_RELIC_SLOTS, BOSSES, CHARMS, CURSES, MAX_STAKE, RELICS, RELIC_PERKS, STAKE_QUOTA, STAKE_TURNS, TECH, UPGRADES } from "./content";
import { type Mods, baseMods } from "./mods";
import type { Run } from "./run";
import { type Rng, weighted } from "./rng";

/** What survives between runs. */
export interface Meta {
  v: 1;
  chips: number;
  tech: string[];
  relics: string[];
  ach: string[];
  runs: number;
  bestRound: number;
  life: { spins: number };
  seedCounter: number;
  /** highest stake a run may start at */
  maxStake: number;
  /** relics equipped for the next run */
  loadout: string[];
}

export function newMeta(): Meta {
  return { v: 1, chips: 0, tech: [], relics: [], ach: [], runs: 0, bestRound: 1, life: { spins: 0 }, seedCounter: 1, maxStake: 0, loadout: [] };
}

const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : d);
const ids = (x: unknown, known: readonly string[]): string[] => (Array.isArray(x) ? [...new Set(x.filter((v): v is string => typeof v === "string" && known.includes(v)))] : []);

/** Chips the removed pusher and poker tech nodes cost (#10): a saved meta that owns one gets the chips back. */
export const REMOVED_TECH_COST: Readonly<Record<string, number>> = { pbet: 4, pfull: 7, ptwo: 9, pdraw: 18, gold1: 4, prize1: 6, free1: 8, zone4: 12, zone5: 20, pmul: 15 };

const refund = (raw: unknown): number => (Array.isArray(raw) ? [...new Set(raw)].reduce<number>((sum, id) => sum + (typeof id === "string" && Object.hasOwn(REMOVED_TECH_COST, id) ? (REMOVED_TECH_COST[id] as number) : 0), 0) : 0);

/** Storage is untrusted: anything unreadable becomes a fresh meta, unknown ids are dropped. */
export function restoreMeta(raw: unknown): Meta {
  if (typeof raw !== "object" || raw === null) return newMeta();
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return newMeta();
  const life = (typeof o.life === "object" && o.life !== null ? o.life : {}) as Record<string, unknown>;
  const tech = ids(o.tech, TECH.map((t) => t.id)).filter((id, _, all) => (TECH.find((t) => t.id === id)?.requires ?? []).every((r) => all.includes(r)));
  const owned = ids(o.relics, RELICS.map((r) => r.id));
  const slots = BASE_RELIC_SLOTS + tech.filter((t) => t === "case1" || t === "case2").length;
  return {
    v: 1,
    chips: num(o.chips) + refund(o.tech),
    tech,
    relics: owned,
    ach: ids(o.ach, ACH_IDS),
    runs: num(o.runs),
    bestRound: Math.max(1, num(o.bestRound, 1)),
    life: { spins: num(life.spins) },
    seedCounter: Math.max(1, num(o.seedCounter, 1)),
    maxStake: Math.min(MAX_STAKE, num(o.maxStake)),
    loadout: ids(o.loadout, Object.keys(RELIC_PERKS)).filter((id) => owned.includes(id)).slice(0, slots),
  };
}

export const relicSlots = (meta: Meta): number => BASE_RELIC_SLOTS + meta.tech.filter((t) => t === "case1" || t === "case2").length;

/** Equip or unequip an owned relic. A full loadout refuses a new one. */
export function toggleEquip(meta: Meta, id: string): boolean {
  if (!meta.relics.includes(id) || !RELIC_PERKS[id]) return false;
  const i = meta.loadout.indexOf(id);
  if (i >= 0) {
    meta.loadout.splice(i, 1);
    return true;
  }
  if (meta.loadout.length >= relicSlots(meta)) return false;
  meta.loadout.push(id);
  return true;
}

export function modsFor(meta: Meta, charms: readonly string[], upgrades: Readonly<Record<string, number>> = {}, boss: string | null = null, stake = 0): Mods {
  const m = baseMods();
  for (const id of meta.tech) TECH.find((t) => t.id === id)?.effect(m);
  m.startCoins += Math.floor(meta.relics.length / 2); // the collection pays: 1 coin per 2 relics
  for (const id of meta.loadout.slice(0, relicSlots(meta))) RELIC_PERKS[id]?.effect(m);
  for (const id of charms) (CHARMS.find((c) => c.id === id) ?? CURSES.find((c) => c.id === id))?.effect(m);
  for (const u of UPGRADES) if ((upgrades[u.id] ?? 0) > 0) u.effect(m, upgrades[u.id] as number);
  m.quotaMul *= 1 + STAKE_QUOTA * stake;
  if (stake >= STAKE_TURNS) m.turns -= 1;
  if (boss) BOSSES.find((b) => b.id === boss)?.effect(m);
  return m;
}

export function canBuy(meta: Meta, id: string): boolean {
  const node = TECH.find((t) => t.id === id);
  return !!node && !meta.tech.includes(id) && meta.chips >= node.cost && node.requires.every((r) => meta.tech.includes(r));
}

export function buyTech(meta: Meta, id: string): boolean {
  if (!canBuy(meta, id)) return false;
  meta.chips -= (TECH.find((t) => t.id === id) as { cost: number }).cost;
  meta.tech.push(id);
  return true;
}

/** File a relic won from a boss: a new one when any is missing, else a duplicate (null). */
export function fileRelic(meta: Meta, rng: Rng): string | null {
  const missing = RELICS.filter((r) => !r.craft && !meta.relics.includes(r.id));
  if (missing.length === 0) return null;
  const pick = missing[weighted(rng, missing.map(() => 1))] as { id: string };
  meta.relics.push(pick.id);
  return pick.id;
}

export type Combined = { kind: "new"; id: string } | { kind: "known"; id: string } | { kind: "none" } | { kind: "missing" };

/** Little-Alchemy style: two owned relics may make a third. The ingredients stay. */
export function combine(meta: Meta, a: string, b: string): Combined {
  if (a === b || !meta.relics.includes(a) || !meta.relics.includes(b)) return { kind: "missing" };
  const made = RELICS.find((r) => r.craft && ((r.craft[0] === a && r.craft[1] === b) || (r.craft[0] === b && r.craft[1] === a)));
  if (!made) return { kind: "none" };
  if (meta.relics.includes(made.id)) return { kind: "known", id: made.id };
  meta.relics.push(made.id);
  return { kind: "new", id: made.id };
}

export interface Achievement {
  id: string;
  name: string;
  text: string;
  chips: number;
  test: (meta: Meta, run: Run | null) => boolean;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: "first", name: "First Pull", text: "Spin the reels once.", chips: 1, test: (m, r) => m.life.spins + (r?.stats.spins ?? 0) >= 1 },
  { id: "seven", name: "Lucky Seven", text: "Hit three sevens on a line.", chips: 3, test: (_, r) => (r?.stats.jackpots ?? 0) >= 1 },
  { id: "r3", name: "Getting Warm", text: "Reach round 3.", chips: 2, test: (_, r) => (r?.round ?? 0) >= 3 },
  { id: "r5", name: "On a Roll", text: "Reach round 5.", chips: 4, test: (_, r) => (r?.round ?? 0) >= 5 },
  { id: "r8", name: "High Stakes", text: "Reach round 8.", chips: 8, test: (_, r) => (r?.round ?? 0) >= 8 },
  { id: "hoard", name: "Hoarder", text: "Hold 200 coins at once.", chips: 4, test: (_, r) => (r?.stats.maxCoins ?? 0) >= 200 },
  { id: "relic1", name: "Finders Keepers", text: "Find your first relic.", chips: 2, test: (m) => m.relics.length >= 1 },
  { id: "relic6", name: "Collector", text: "Find 6 relics.", chips: 4, test: (m) => m.relics.length >= 6 },
  { id: "alchemy", name: "Alchemist", text: "Craft 3 relics by combining others.", chips: 5, test: (m) => RELICS.filter((r) => r.craft && m.relics.includes(r.id)).length >= 3 },
  { id: "boss1", name: "Debt Collector", text: "Beat a boss.", chips: 4, test: (_, r) => (r?.stats.bosses ?? 0) >= 1 },
  { id: "boss3", name: "Boss Rush", text: "Beat three bosses in one run.", chips: 10, test: (_, r) => (r?.stats.bosses ?? 0) >= 3 },
  { id: "stake1", name: "Raising the Stakes", text: "Unlock stake 1.", chips: 3, test: (m) => m.maxStake >= 1 },
  { id: "stake3", name: "High Stakes Hero", text: "Unlock stake 3.", chips: 8, test: (m) => m.maxStake >= 3 },
  { id: "road3", name: "Road Warrior", text: "Face 3 events in one run.", chips: 4, test: (_, r) => (r?.stats.events ?? 0) >= 3 },
  { id: "gear2", name: "Dressed for the Job", text: "Equip 2 relics.", chips: 3, test: (m) => m.loadout.length >= 2 },
  { id: "tech5", name: "Engineer", text: "Own 5 tech upgrades.", chips: 3, test: (m) => m.tech.length >= 5 },
];
const ACH_IDS = ACHIEVEMENTS.map((a) => a.id);

/** Unlocks what is now true; pays the chips. Returns the new achievements. */
export function checkAchievements(meta: Meta, run: Run | null): Achievement[] {
  const fresh = ACHIEVEMENTS.filter((a) => !meta.ach.includes(a.id) && a.test(meta, run));
  for (const a of fresh) {
    meta.ach.push(a.id);
    meta.chips += a.chips;
  }
  return fresh;
}

/** Chips for a finished run, paid once: 3 per round paid, one for trying, plus the missions. */
export function finishRun(meta: Meta, run: Run): number {
  if (run.finished) return 0;
  run.finished = true;
  const chips = Math.floor((run.completed * 3 + 1 + run.chipsPending) * (1 + 0.25 * run.stake));
  if (run.stats.bosses >= 1 && run.stake === meta.maxStake && meta.maxStake < MAX_STAKE) meta.maxStake++;
  meta.chips += chips;
  meta.runs++;
  meta.bestRound = Math.max(meta.bestRound, run.round);
  meta.life.spins += run.stats.spins;
  return chips;
}
