import { type Rng, shuffle } from "./rng";
import type { Run, RunStats } from "./run";

export interface MissionDef {
  id: string;
  key: keyof RunStats;
  target: number;
  reward: number;
  text: string;
}

export const MISSIONS: readonly MissionDef[] = [
  { id: "spin6", key: "spins", target: 6, reward: 1, text: "Spin the reels 6 times" },
  { id: "lines3", key: "slotWins", target: 3, reward: 2, text: "Win on 3 paylines" },
  { id: "bigwin", key: "bestSlotWin", target: 20, reward: 3, text: "Win 20 coins with one spin" },
  { id: "scatter", key: "scatters", target: 1, reward: 2, text: "Land three coin scatters" },
];

export interface MissionState {
  id: string;
  done: boolean;
}

export function drawMissions(rng: Rng): MissionState[] {
  return shuffle(rng, MISSIONS.map((m) => m.id))
    .slice(0, 3)
    .map((id) => ({ id, done: false }));
}

export function missionDef(id: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.id === id);
}

export function missionProgress(run: Run, id: string): number {
  const def = missionDef(id);
  return def ? Math.min(def.target, run.stats[def.key]) : 0;
}

export function updateMissions(run: Run): void {
  for (const m of run.missions) {
    const def = missionDef(m.id);
    if (!def || m.done || run.stats[def.key] < def.target) continue;
    m.done = true;
    run.chipsPending += def.reward;
    run.tickets++;
    run.events.push(`Mission done: ${def.text} (+${def.reward} chips)`);
  }
}
