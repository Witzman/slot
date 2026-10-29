// Tiny procedural sounds: opened by the first gesture, silent until then or when muted.
let ctx: AudioContext | null = null;
let muted = false;

export function unlock(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export const isMuted = (): boolean => muted;
export function setMuted(m: boolean): void {
  muted = m;
}

function tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.05, delay = 0): void {
  if (muted || !ctx || ctx.state !== "running") return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  click: () => tone(520, 0.05, "triangle", 0.04),
  reel: (i: number) => tone(180 + i * 60, 0.08, "square", 0.05),
  card: () => tone(300, 0.06, "triangle", 0.05),
  coin: () => {
    tone(988, 0.07, "square", 0.04);
    tone(1319, 0.14, "square", 0.04, 0.06);
  },
  gold: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.12, "square", 0.045, i * 0.06)),
  win: () => [523, 659, 784].forEach((f, i) => tone(f, 0.14, "triangle", 0.07, i * 0.09)),
  big: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, "triangle", 0.08, i * 0.09)),
  lose: () => [220, 165].forEach((f, i) => tone(f, 0.25, "sawtooth", 0.04, i * 0.15)),
  draft: () => [392, 523, 659].forEach((f, i) => tone(f, 0.1, "triangle", 0.06, i * 0.07)),
};
