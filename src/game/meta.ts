import { BASE_RELIC_SLOTS, BOSSES, CHARMS, CURSES, MAX_STAKE, RELICS, RELIC_PERKS, STAKE_QUOTA, STAKE_TURNS, TECH, UPGRADES, VOUCHERS } from "./content";
import { type Mods, baseMods } from "./mods";
import type { Run } from "./run";
import { type Rng, weighted } from "./rng";
import { CHALLENGE_CHIPS, SETUPS, recordDaily, setupById } from "./setups";

export type ModeId = "climb" | "endless";
export const MODES: readonly ModeId[] = ["climb", "endless"];

/** What the owner compares the two modes by: how often, how long, how it ended. */
export interface ModeStats {
  sessions: number;
  /** milliseconds played, added by the app (the game layer reads no clock) */
  playMs: number;
  spins: number;
  /** how sessions ended, by name (a climb run: quota or bust; an endless session: prestige) */
  endings: Record<string, number>;
}

/** Chips and tree progress of one mode: the two modes never share them. */
export interface ModeMeta {
  chips: number;
  tech: string[];
  stats: ModeStats;
}

/** What survives between runs. */
export interface Meta {
  v: 2;
  climb: ModeMeta;
  endless: ModeMeta;
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
  /** challenges cleared */
  challenges: string[];
  /** the daily run: the day (days since 1970), its best result (quotas paid) and the best of the last day played */
  daily: { day: number; best: number; prev: number };
}

const newMode = (): ModeMeta => ({ chips: 0, tech: [], stats: { sessions: 0, playMs: 0, spins: 0, endings: {} } });

export function newMeta(): Meta {
  return { v: 2, climb: newMode(), endless: newMode(), relics: [], ach: [], runs: 0, bestRound: 1, life: { spins: 0 }, seedCounter: 1, maxStake: 0, loadout: [], challenges: [], daily: { day: 0, best: 0, prev: 0 } };
}

const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : d);
const ids = (x: unknown, known: readonly string[]): string[] => (Array.isArray(x) ? [...new Set(x.filter((v): v is string => typeof v === "string" && known.includes(v)))] : []);

/** Chips the tech nodes cost that no longer exist (pusher and poker, lines; #10): a saved meta that owns one gets the chips back. */
export const REMOVED_TECH_COST: Readonly<Record<string, number>> = { rows4: 4, cols4: 10, wild2: 9, scatter2: 8, lines3: 4, lines5: 10, pbet: 4, pfull: 7, ptwo: 9, pdraw: 18, gold1: 4, prize1: 6, free1: 8, zone4: 12, zone5: 20, pmul: 15 };

/** Chips back for every saved node the tree no longer holds: removed ones, and ones whose prerequisite is gone. */
const refund = (raw: unknown, kept: readonly string[]): number =>
  Array.isArray(raw)
    ? [...new Set(raw)].reduce<number>((sum, id) => (typeof id !== "string" || kept.includes(id) ? sum : sum + (TECH.find((t) => t.id === id)?.cost ?? (Object.hasOwn(REMOVED_TECH_COST, id) ? (REMOVED_TECH_COST[id] as number) : 0))), 0)
    : 0;

const record = (x: unknown): Record<string, unknown> => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : {});

/** One mode out of untrusted storage: unknown ids dropped, nodes without their prerequisites dropped and refunded. */
function restoreMode(raw: unknown): ModeMeta {
  const o = record(raw);
  let tech = ids(o.tech, TECH.map((t) => t.id));
  for (let again = true; again; ) {
    const kept = tech.filter((id) => (TECH.find((t) => t.id === id)?.requires ?? []).every((r) => tech.includes(r)));
    again = kept.length !== tech.length;
    tech = kept;
  }
  const st = record(o.stats);
  const endings: Record<string, number> = {};
  for (const [k, n] of Object.entries(record(st.endings))) if (k !== "__proto__" && num(n) > 0) endings[k] = num(n);
  return { chips: num(o.chips) + refund(o.tech, tech), tech, stats: { sessions: num(st.sessions), playMs: num(st.playMs), spins: num(st.spins), endings } };
}

/** Storage is untrusted: anything unreadable becomes a fresh meta, unknown ids are dropped. A v1 meta (one chip balance, one tree) becomes the climb mode. */
export function restoreMeta(raw: unknown): Meta {
  if (typeof raw !== "object" || raw === null) return newMeta();
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 && o.v !== 2) return newMeta();
  const life = record(o.life);
  const climb = restoreMode(o.v === 1 ? { chips: o.chips, tech: o.tech } : o.climb);
  const endless = o.v === 1 ? newMode() : restoreMode(o.endless);
  const owned = ids(o.relics, RELICS.map((r) => r.id));
  const slots = BASE_RELIC_SLOTS + caseCount(climb.tech, endless.tech);
  return {
    v: 2,
    climb,
    endless,
    relics: owned,
    ach: ids(o.ach, ACH_IDS),
    runs: num(o.runs),
    bestRound: Math.max(1, num(o.bestRound, 1)),
    life: { spins: num(life.spins) },
    seedCounter: Math.max(1, num(o.seedCounter, 1)),
    maxStake: Math.min(MAX_STAKE, num(o.maxStake)),
    loadout: ids(o.loadout, Object.keys(RELIC_PERKS)).filter((id) => owned.includes(id)).slice(0, slots),
    challenges: ids(o.challenges, SETUPS.filter((x) => x.kind === "challenge").map((x) => x.id)),
    daily: { day: num(record(o.daily).day), best: num(record(o.daily).best), prev: num(record(o.daily).prev) },
  };
}

/** Display cases owned in either mode (the relic loadout is shared, so the better of the two counts). */
const caseCount = (...trees: string[][]): number => Math.max(...trees.map((t) => t.filter((id) => id === "case1" || id === "case2").length));

export const relicSlots = (meta: Meta): number => BASE_RELIC_SLOTS + caseCount(meta.climb.tech, meta.endless.tech);

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

export function modsFor(meta: Meta, mode: ModeId, charms: readonly string[], upgrades: Readonly<Record<string, number>> = {}, boss: string | null = null, stake = 0, setup = "classic"): Mods {
  const m = baseMods();
  for (const id of meta[mode].tech) TECH.find((t) => t.id === id)?.effect(m);
  if (mode === "climb") {
    // relics are won in Climb and are for Climb: Endless is measured without them
    m.startCoins += Math.floor(meta.relics.length / 2); // the collection pays: 1 coin per 2 relics
    for (const id of meta.loadout.slice(0, relicSlots(meta))) RELIC_PERKS[id]?.effect(m);
  }
  for (const id of charms) (CHARMS.find((c) => c.id === id) ?? CURSES.find((c) => c.id === id))?.effect(m);
  for (const u of UPGRADES) if ((upgrades[u.id] ?? 0) > 0) u.effect(m, upgrades[u.id] as number);
  for (const v of VOUCHERS) if ((upgrades[v.id] ?? 0) > 0) v.effect(m);
  setupById(setup)?.effect(m);
  m.quotaMul *= 1 + STAKE_QUOTA * stake;
  if (stake >= STAKE_TURNS) m.turns -= 1;
  if (boss) BOSSES.find((b) => b.id === boss)?.effect(m);
  return m;
}

export function canBuy(meta: Meta, mode: ModeId, id: string): boolean {
  const node = TECH.find((t) => t.id === id);
  const m = meta[mode];
  return !!node && (node.modes === undefined || node.modes.includes(mode)) && !m.tech.includes(id) && m.chips >= node.cost && node.requires.every((r) => m.tech.includes(r));
}

export function buyTech(meta: Meta, mode: ModeId, id: string): boolean {
  if (!canBuy(meta, mode, id)) return false;
  meta[mode].chips -= (TECH.find((t) => t.id === id) as { cost: number }).cost;
  meta[mode].tech.push(id);
  return true;
}

/** Play time of a mode, in milliseconds, measured by the app. Junk (negative, NaN) adds nothing. */
export function addPlayTime(meta: Meta, mode: ModeId, ms: number): void {
  if (Number.isFinite(ms) && ms > 0) meta[mode].stats.playMs += Math.round(ms);
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

/** What the achievements read: a climb run, or the same numbers of an endless session. */
export type RunView = Pick<Run, "stats" | "cardUpgrades" | "round">;

export interface Achievement {
  id: string;
  name: string;
  text: string;
  chips: number;
  test: (meta: Meta, run: RunView | null) => boolean;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: "first", name: "First Deal", text: "Play a round.", chips: 1, test: (m, r) => m.life.spins + (r?.stats.spins ?? 0) >= 1 },
  { id: "flush", name: "Flush!", text: "Make a flush or better.", chips: 2, test: (_, r) => (r?.stats.bestHand ?? 0) >= 5 },
  { id: "fullhouse", name: "Full House", text: "Make a full house or better.", chips: 3, test: (_, r) => (r?.stats.bestHand ?? 0) >= 6 },
  { id: "quads", name: "Four of a Kind", text: "Make four of a kind or better.", chips: 4, test: (_, r) => (r?.stats.bestHand ?? 0) >= 7 },
  { id: "sflush", name: "Straight Flush", text: "Make a straight flush or better.", chips: 6, test: (_, r) => (r?.stats.bestHand ?? 0) >= 8 },
  { id: "five", name: "Five of a Kind", text: "Make five of a kind: it takes a joker or rank-ups.", chips: 8, test: (_, r) => (r?.stats.bestHand ?? 0) >= 9 },
  { id: "royal", name: "Royalty", text: "Make a royal flush.", chips: 10, test: (_, r) => (r?.stats.bestHand ?? 0) >= 10 },
  { id: "lines4", name: "Four at Once", text: "Score 4 hands in one round.", chips: 2, test: (_, r) => (r?.stats.bestLines ?? 0) >= 4 },
  { id: "lines7", name: "Seven at Once", text: "Score 7 hands in one round.", chips: 5, test: (_, r) => (r?.stats.bestLines ?? 0) >= 7 },
  { id: "lines10", name: "Every Line Pays", text: "Score all 10 hands in one round.", chips: 12, test: (_, r) => (r?.stats.bestLines ?? 0) >= 10 },
  { id: "hold1", name: "Keeper", text: "Win a round with a held row or column.", chips: 2, test: (_, r) => (r?.stats.heldWins ?? 0) >= 1 },
  { id: "hold8", name: "Steady Nerves", text: "Win 8 rounds with a held row or column.", chips: 4, test: (_, r) => (r?.stats.heldWins ?? 0) >= 8 },
  { id: "single1", name: "Sniper", text: "Win a round with a held single card.", chips: 3, test: (_, r) => (r?.stats.singleWins ?? 0) >= 1 },
  { id: "upg3", name: "Tuned Deck", text: "Upgrade 3 different cards in one run.", chips: 3, test: (_, r) => Object.keys(r?.cardUpgrades ?? {}).length >= 3 },
  { id: "joker1", name: "Wild Card", text: "Turn a card into a joker.", chips: 4, test: (_, r) => Object.values(r?.cardUpgrades ?? {}).some((u) => u.joker) },
  { id: "gold3", name: "Gilded", text: "Gild 3 cards in one run.", chips: 5, test: (_, r) => Object.values(r?.cardUpgrades ?? {}).filter((u) => u.gold).length >= 3 },
  { id: "win100", name: "Big Round", text: "Win 100 coins in one round.", chips: 3, test: (_, r) => (r?.stats.bestSlotWin ?? 0) >= 100 },
  { id: "win500", name: "Huge Round", text: "Win 500 coins in one round.", chips: 8, test: (_, r) => (r?.stats.bestSlotWin ?? 0) >= 500 },
  { id: "r3", name: "Getting Warm", text: "Reach round 3.", chips: 2, test: (_, r) => (r?.round ?? 0) >= 3 },
  { id: "r5", name: "On a Roll", text: "Reach round 5.", chips: 4, test: (_, r) => (r?.round ?? 0) >= 5 },
  { id: "r8", name: "High Stakes", text: "Reach round 8.", chips: 8, test: (_, r) => (r?.round ?? 0) >= 8 },
  { id: "hoard", name: "Hoarder", text: "Hold 300 coins at once.", chips: 4, test: (_, r) => (r?.stats.maxCoins ?? 0) >= 300 },
  { id: "relic1", name: "Finders Keepers", text: "Find your first relic.", chips: 2, test: (m) => m.relics.length >= 1 },
  { id: "relic6", name: "Collector", text: "Find 6 relics.", chips: 4, test: (m) => m.relics.length >= 6 },
  { id: "alchemy", name: "Alchemist", text: "Craft 3 relics by combining others.", chips: 5, test: (m) => RELICS.filter((r) => r.craft && m.relics.includes(r.id)).length >= 3 },
  { id: "boss1", name: "Debt Collector", text: "Beat a boss.", chips: 4, test: (_, r) => (r?.stats.bosses ?? 0) >= 1 },
  { id: "boss3", name: "Boss Rush", text: "Beat three bosses in one run.", chips: 10, test: (_, r) => (r?.stats.bosses ?? 0) >= 3 },
  { id: "stake1", name: "Raising the Stakes", text: "Unlock stake 1.", chips: 3, test: (m) => m.maxStake >= 1 },
  { id: "stake3", name: "High Stakes Hero", text: "Unlock stake 3.", chips: 8, test: (m) => m.maxStake >= 3 },
  { id: "edition1", name: "Collector's Edition", text: "Own a card with an edition.", chips: 3, test: (_, r) => Object.values(r?.cardUpgrades ?? {}).some((u) => u.edition !== undefined) },
  { id: "fullkit", name: "Fully Loaded", text: "Own a card with an enhancement, an edition and a seal.", chips: 6, test: (_, r) => Object.values(r?.cardUpgrades ?? {}).some((u) => u.edition !== undefined && u.seal !== undefined && (u.gold || u.glass || u.stone || u.joker || u.anySuit)) },
  { id: "challenge1", name: "Challenger", text: "Clear a challenge.", chips: 5, test: (m) => m.challenges.length >= 1 },
  { id: "challenge3", name: "Unbroken", text: "Clear every challenge.", chips: 12, test: (m) => m.challenges.length >= 3 },
  { id: "daily1", name: "Daily Bread", text: "Play the daily run.", chips: 3, test: (m) => m.daily.day > 0 },
  { id: "road3", name: "Road Warrior", text: "Face 3 events in one run.", chips: 4, test: (_, r) => (r?.stats.events ?? 0) >= 3 },
  { id: "gear2", name: "Dressed for the Job", text: "Equip 2 relics.", chips: 3, test: (m) => m.loadout.length >= 2 },
  { id: "tech5", name: "Engineer", text: "Own 5 tech upgrades in one mode.", chips: 3, test: (m) => Math.max(m.climb.tech.length, m.endless.tech.length) >= 5 },
  { id: "branch5", name: "Specialist", text: "Own 5 nodes of one branch in one mode.", chips: 6, test: (m) => [m.climb, m.endless].some((mm) => (["hold", "cards", "hands", "economy"] as const).some((b) => mm.tech.filter((id) => TECH.find((t) => t.id === id)?.branch === b).length >= 5)) },
  { id: "treeall", name: "Fully Wired", text: "Own every node of the Hold, Cards and Hands branches in one mode.", chips: 15, test: (m) => [m.climb, m.endless].some((mm) => TECH.filter((t) => t.branch !== "economy").every((t) => mm.tech.includes(t.id))) },
];
const ACH_IDS = ACHIEVEMENTS.map((a) => a.id);

/** Unlocks what is now true; pays the chips to the mode being played. Returns the new achievements. */
export function checkAchievements(meta: Meta, mode: ModeId, run: RunView | null): Achievement[] {
  const fresh = ACHIEVEMENTS.filter((a) => !meta.ach.includes(a.id) && a.test(meta, run));
  for (const a of fresh) {
    meta.ach.push(a.id);
    meta[mode].chips += a.chips;
  }
  return fresh;
}

/** Chips for a finished run, paid once: 3 per round paid, one for trying, plus the missions. */
export function finishRun(meta: Meta, run: Run): number {
  if (run.finished) return 0;
  run.finished = true;
  const chips = Math.floor((run.completed * 3 + 1 + run.chipsPending) * (1 + 0.25 * run.stake));
  if (run.stats.bosses >= 1 && run.stake === meta.maxStake && meta.maxStake < MAX_STAKE) meta.maxStake++;
  meta.climb.chips += chips;
  meta.runs++;
  const stats = meta.climb.stats;
  stats.sessions++;
  stats.spins += run.stats.spins;
  const ending = run.overReason || "quit";
  stats.endings[ending] = (stats.endings[ending] ?? 0) + 1;
  meta.bestRound = Math.max(meta.bestRound, run.round);
  meta.life.spins += run.stats.spins;
  if (run.daily > 0) recordDaily(meta, run.daily, run.completed);
  const challenge = setupById(run.setup);
  if (challenge?.kind === "challenge" && run.completed >= (challenge.goal ?? Infinity) && !meta.challenges.includes(challenge.id)) {
    meta.challenges.push(challenge.id);
    meta.climb.chips += CHALLENGE_CHIPS;
    return chips + CHALLENGE_CHIPS;
  }
  return chips;
}
