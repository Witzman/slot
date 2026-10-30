import { CHARMS, CURSES, UPGRADES } from "./content";
import { int, next } from "./rng";
import type { Run } from "./run";

export interface EventChoice {
  text: string;
  /** false: the choice is shown but cannot be taken */
  can?: (run: Run) => boolean;
  /** changes the run and returns the message for the screen */
  apply: (run: Run) => string;
}

export interface RunEvent {
  id: string;
  title: string;
  text: string;
  /** an event may need something to be true (a curse to remove) */
  eligible?: (run: Run) => boolean;
  choices: [EventChoice, EventChoice];
}

/** The chance that a cleared round is followed by an event. */
export const EVENT_CHANCE = 0.5;

const curse = (run: Run, id: string): void => void (run.charms.includes(id) || run.charms.push(id));
const hasCurse = (run: Run): boolean => run.charms.some((id) => CURSES.some((c) => c.id === id));
const upgradeable = (run: Run) => UPGRADES.filter((u) => (run.upgrades[u.id] ?? 0) < u.max);

export const EVENTS: readonly RunEvent[] = [
  {
    id: "suitcase",
    title: "A Stranger with a Suitcase",
    text: "He pushes it across the table. It is heavy and it clinks.",
    choices: [
      { text: "Take it: +20 coins, but bad karma follows.", can: (r) => !r.charms.includes("karma"), apply: (r) => (curse(r, "karma"), (r.coins += 20), "+20 coins. Bad Karma joins the run.") },
      { text: "Walk away: +1 ticket.", apply: (r) => ((r.tickets += 1), "+1 ticket.") },
    ],
  },
  {
    id: "well",
    title: "The Wishing Well",
    text: "A well in the corner of the arcade, full of old coins.",
    eligible: (r) => CHARMS.some((c) => !r.charms.includes(c.id)),
    choices: [
      {
        text: "Throw in 10 coins: a free uncommon or rare charm.",
        can: (r) => r.coins >= 10,
        apply: (r) => {
          const pool = CHARMS.filter((c) => c.rarity !== "common" && !r.charms.includes(c.id));
          const got = pool.length > 0 ? pool[int(r.rng, pool.length)] : undefined;
          if (!got) return "The well stays silent.";
          r.coins -= 10;
          r.charms.push(got.id);
          return `The well gives: ${got.name}.`;
        },
      },
      { text: "Keep your coins.", apply: () => "You keep your coins." },
    ],
  },
  {
    id: "dice",
    title: "Back-Alley Dice",
    text: "Two men, one pair of dice, an empty chair.",
    choices: [
      {
        text: "Roll: win 30 coins or lose 15 (even odds).",
        can: (r) => r.coins >= 15,
        apply: (r) => (next(r.rng) < 0.5 ? ((r.coins += 30), "You win 30 coins.") : ((r.coins -= 15), "You lose 15 coins.")),
      },
      { text: "Walk on.", apply: () => "You walk on." },
    ],
  },
  {
    id: "mechanic",
    title: "The Mechanic",
    text: "She taps the cabinet and frowns. \"I can fix that for you.\"",
    eligible: (r) => upgradeable(r).length > 0,
    choices: [
      {
        text: "Pay 8 coins: one random upgrade gains a level.",
        can: (r) => r.coins >= 8 && upgradeable(r).length > 0,
        apply: (r) => {
          const pool = upgradeable(r);
          const u = pool[int(r.rng, pool.length)] as (typeof pool)[number];
          r.coins -= 8;
          r.upgrades[u.id] = (r.upgrades[u.id] ?? 0) + 1;
          return `${u.name} is now level ${r.upgrades[u.id]}.`;
        },
      },
      { text: "Take 2 tickets instead.", apply: (r) => ((r.tickets += 2), "+2 tickets.") },
    ],
  },
  {
    id: "shower",
    title: "Coin Shower",
    text: "The ceiling rattles. Something is about to fall.",
    choices: [
      { text: "Hold out your hat: +25 coins.", apply: (r) => ((r.coins += 25), "+25 coins.") },
      { text: "Catch what you can: +8 coins and a ticket.", apply: (r) => ((r.coins += 8), (r.tickets += 1), "+8 coins, +1 ticket.") },
    ],
  },
  {
    id: "loan",
    title: "A Loan Offer",
    text: "\"No questions asked,\" says the man in the good coat.",
    choices: [
      { text: "Take 40 coins, owe more at every quota.", can: (r) => !r.charms.includes("debt"), apply: (r) => (curse(r, "debt"), (r.coins += 40), "+40 coins. Debt joins the run.") },
      { text: "Decline.", apply: () => "You decline." },
    ],
  },
  {
    id: "haunted",
    title: "The Haunted Machine",
    text: "A machine nobody switched on is humming your name.",
    choices: [
      { text: "Play it: +3 tickets, but you lose a turn every round.", can: (r) => !r.charms.includes("haunted"), apply: (r) => (curse(r, "haunted"), (r.tickets += 3), "+3 tickets. Haunted joins the run.") },
      { text: "Unplug it.", apply: () => "You unplug it." },
    ],
  },
  {
    id: "lucky",
    title: "Lucky Day",
    text: "Everything you touch turns up cherries.",
    choices: [
      { text: "Take a ticket and 5 coins.", apply: (r) => ((r.tickets += 1), (r.coins += 5), "+1 ticket, +5 coins.") },
      { text: "Pocket 10 coins.", apply: (r) => ((r.coins += 10), "+10 coins.") },
    ],
  },
  {
    id: "exorcist",
    title: "The Exorcist",
    text: "\"That thing on your shoulder,\" she says. \"I can take it off.\"",
    eligible: hasCurse,
    choices: [
      {
        text: "Pay 2 tickets: one curse is lifted.",
        can: (r) => r.tickets >= 2 && hasCurse(r),
        apply: (r) => {
          const id = r.charms.find((c) => CURSES.some((x) => x.id === c)) as string;
          r.tickets -= 2;
          r.charms = r.charms.filter((c) => c !== id);
          return `${CURSES.find((c) => c.id === id)?.name ?? "The curse"} is lifted.`;
        },
      },
      { text: "Keep it.", apply: () => "You keep it." },
    ],
  },
];

export const eventById = (id: string | null): RunEvent | undefined => EVENTS.find((e) => e.id === id);

/** An event for this run, or null (no event this time, or none eligible). */
export function rollEvent(run: Run, chance: number): string | null {
  if (next(run.rng) >= chance) return null;
  const pool = EVENTS.filter((e) => !e.eligible || e.eligible(run));
  return pool.length === 0 ? null : (pool[int(run.rng, pool.length)] as RunEvent).id;
}
