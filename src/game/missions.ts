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
  { id: "hands4", key: "hands", target: 4, reward: 1, text: "Play 4 poker hands" },
  { id: "good2", key: "goodHands", target: 2, reward: 2, text: "Make jacks or better twice" },
  { id: "straight", key: "bestHand", target: 4, reward: 3, text: "Make a straight or better" },
  { id: "drops8", key: "drops", target: 8, reward: 1, text: "Drop 8 coins on the pusher" },
  { id: "paid15", key: "pusherPaid", target: 15, reward: 2, text: "Get 15 coins out of the pusher" },
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
    run.events.push(`Mission done: ${def.text} (+${def.reward} chips)`);
  }
}
