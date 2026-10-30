import "./style.css";
import { type Meta, type ModeId, buyTech, combine, toggleEquip, checkAchievements, fileRelic, finishRun, modsFor } from "../game/meta";
import { RELICS, CHARMS } from "../game/content";
import type { SpinResult } from "../game/board";
import { type Session, buySessionUpgrade, canPrestige, endlessMods, prestige, spinSession, startSession } from "../game/endless";
import { type Run, type Refusal, buyCharm, buyUpgrade, chooseEvent, closeRound, drainEvents, pickCharm, rerollDraft, rerollShop, spinSlot, startRun } from "../game/run";
import { type Sym, START_SYMS } from "../game/slot";
import { localStore } from "../storage";
import { loadMeta, loadMode, loadRun, loadSession, save } from "./save";
import { isMuted, setMuted, sfx, unlock } from "./sfx";
import { GLYPH, type Tab, type UI, type View, bookPanel, hud, nav, overlay, roundPanel, shopPanel, slotPanel, treePanel } from "./view";

const store = localStore();
const $ = (id: string): HTMLElement => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e;
};

const REFUSAL: Record<Refusal, string> = {
  "not-playing": "No run in progress.",
  "no-turns": "No turns left this round.",
  "no-coins": "Not enough coins.",
  "bad-bet": "That bet is not allowed.",
};

/** A resting board of the given size, shown before the first spin and after the board grew. */
const restGrid = (rows: number, cols: number): Sym[][] => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => START_SYMS[(r * 2 + c * 3) % START_SYMS.length] as Sym));

/** How much faster than normal the animation plays (automatic spins at a high rate): a spin must end before the next begins. */
let animSpeed = 1;
const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms / animSpeed));

async function boot(): Promise<void> {
  let meta: Meta = await loadMeta(store);
  let run: Run | null = await loadRun(store);
  let session: Session | null = await loadSession(store);
  let mode: ModeId = await loadMode(store);
  const ui: UI = { tab: "play", slotBet: 1, busy: false, grid: restGrid(3, 3), winCells: new Set(), slotNote: "", chain: 1, overChips: 0, muted: false, picked: [], craftNote: "", stake: 0 };
  const mk = (charms: string[]) => modsFor(meta, "climb", charms, run?.upgrades ?? {}, run?.boss ?? null, run?.stake ?? 0);
  const idle = startSession(0, modsFor(meta, "endless", [], {}), 0);
  const mods = () => (mode === "endless" ? endlessMods(meta, session ?? idle) : mk(run?.charms ?? []));
  const view = (): View => ({ mode, run, session, meta, mods: mods(), ui });
  let lastPhase = run?.phase ?? "over";

  const hudEl = $("hud");
  const navEl = $("nav");
  const panelEl = $("panel");
  const cabinetEl = $("cabinet");
  const slotEl = $("slotbox");
  const roundEl = $("roundbox");
  const overlayEl = $("overlay");

  function toast(text: string): void {
    const t = document.createElement("div");
    t.textContent = text;
    $("toasts").appendChild(t);
    setTimeout(() => t.remove(), 3800);
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function persist(now = false): void {
    clearTimeout(saveTimer);
    const go = (): void => void save(store, meta, run, session, mode).catch((e) => console.error("could not save", e));
    if (now) go();
    else saveTimer = setTimeout(go, 400);
  }

  function render(): void {
    const v = view();
    ui.slotBet = Math.min(Math.max(1, ui.slotBet), v.mods.slotMaxBet);
    if (!ui.busy && (ui.grid.length !== v.mods.rows || (ui.grid[0] as Sym[]).length !== v.mods.cols)) ui.grid = restGrid(v.mods.rows, v.mods.cols);
    hudEl.innerHTML = hud(v);
    navEl.innerHTML = nav(v);
    const onPlay = ui.tab === "play";
    cabinetEl.hidden = !onPlay;
    panelEl.hidden = onPlay;
    if (onPlay) {
      slotEl.innerHTML = slotPanel(v);
      roundEl.innerHTML = roundPanel(v);
    } else panelEl.innerHTML = { play: () => "", shop: shopPanel, tree: treePanel, book: bookPanel }[ui.tab](v);
    overlayEl.innerHTML = overlay(v);
  }

  /** after anything changed the game: file prizes, show messages, unlock, close the run, save, draw */
  function changed(): void {
    if (mode === "climb" && run) {
      for (; run.found > 0; run.found--) {
        const id = fileRelic(meta, run.rng);
        if (id) {
          toast(`Relic found: ${RELICS.find((r) => r.id === id)?.name ?? id}`);
          sfx.big();
        } else {
          meta.climb.chips++;
          toast("A relic you already own: +1 chip");
        }
      }
      for (const e of drainEvents(run)) {
        toast(e);
        if (e.startsWith("BOSS")) sfx.lose();
      }
      if (run.phase === "over" && !run.finished) {
        ui.overChips = finishRun(meta, run);
        sfx.lose();
      }
      if ((run.phase === "draft" || run.phase === "event") && lastPhase !== run.phase) sfx.draft();
      lastPhase = run.phase;
    }
    for (const a of checkAchievements(meta, mode, mode === "climb" ? run : null)) {
      toast(`Achievement: ${a.name} (+${a.chips} chips)`);
      sfx.win();
    }
    persist();
    if (!ui.busy) render();
    else hudEl.innerHTML = hud(view());
  }

  function newRun(): void {
    const seed = (Date.now() ^ Math.imul(meta.seedCounter++, 2654435761)) >>> 0;
    ui.stake = Math.min(ui.stake, meta.maxStake);
    run = startRun(seed, modsFor(meta, "climb", [], {}, null, ui.stake), ui.stake);
    lastPhase = "play";
    ui.slotNote = "";
    ui.winCells = new Set();
    ui.grid = restGrid(3, 3);
    ui.tab = "play";
    persist(true);
    render();
  }

  /** Reels turn, stop column by column on the start board, then every cascade step flashes its clusters and refills. */
  async function playSpin(res: SpinResult, bet: number): Promise<void> {
    const rows = res.start.length;
    const cols = (res.start[0] as Sym[]).length;
    const paint = (): void => {
      slotEl.innerHTML = slotPanel(view());
      hudEl.innerHTML = hud(view());
    };
    ui.grid = restGrid(rows, cols);
    const stops = Array.from({ length: cols }, (_, c) => 450 + c * (500 / Math.max(1, cols - 1)));
    const t0 = performance.now();
    for (;;) {
      const el = performance.now() - t0;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) (ui.grid[r] as Sym[])[c] = el < (stops[c] ?? 0) ? (START_SYMS[Math.floor(Math.random() * START_SYMS.length)] as Sym) : ((res.start[r] as Sym[])[c] as Sym);
        if (el >= (stops[c] ?? 0) && el < (stops[c] ?? 0) + 80) sfx.reel(c);
      }
      paint();
      if (el >= (stops[cols - 1] ?? 0)) break;
      await wait(70);
    }
    ui.grid = res.start.map((row) => [...row]);
    for (const step of res.steps) {
      ui.chain = step.multiplier;
      ui.winCells = new Set(step.clusters.flatMap((cl) => cl.cells.map(([r, c]) => `${r},${c}`)));
      paint();
      (step.pay >= bet * 6 ? sfx.big : sfx.win)();
      await wait(550);
      ui.winCells = new Set();
      ui.grid = step.grid.map((row) => [...row]);
      paint();
      await wait(320);
    }
  }

  let nextAuto = 0;

  async function spinAction(): Promise<void> {
    if (ui.busy) return;
    const endless = mode === "endless";
    if (endless ? !session : !run) return;
    const m = mods();
    const res = endless && session ? spinSession(session, m, ui.slotBet) : run ? spinSlot(run, m, ui.slotBet) : "not-playing";
    if (typeof res === "string") return void toast(REFUSAL[res as Refusal] ?? "That is not possible now.");
    const began = performance.now();
    ui.busy = true;
    ui.winCells = new Set();
    ui.slotNote = "";
    ui.chain = 1;
    animSpeed = endless && m.autoRate > 0 && session?.autoOn ? Math.max(1, m.autoRate * 2.5) : 1;
    try {
      await playSpin(res, ui.slotBet);
    } finally {
      animSpeed = 1;
      ui.busy = false;
      ui.winCells = new Set();
      ui.chain = 1;
    }
    const extra = res.freeSpins > 0 ? ` · ${res.freeSpins} free spin${res.freeSpins > 1 ? "s" : ""}!` : "";
    const chain = res.steps.length > 1 ? ` · chain of ${res.steps.length}` : "";
    ui.slotNote = res.payout > 0 ? `Won ${res.payout} coins${chain}${extra}` : `No win${extra}`;
    if (res.freeSpins > 0) sfx.gold();
    nextAuto = began + (m.autoRate > 0 ? 1000 / m.autoRate : 0);
    changed();
  }

  function act(name: string, value: string): void {
    unlock();
    switch (name) {
      case "tab":
        ui.tab = value as Tab;
        sfx.click();
        render();
        break;
      case "mute":
        ui.muted = !isMuted();
        setMuted(ui.muted);
        render();
        break;
      case "equip":
        if ((!run || run.phase === "over") && toggleEquip(meta, value)) {
          sfx.click();
          changed();
        }
        break;
      case "event":
        if (run && chooseEvent(run, Number(value), mk)) {
          sfx.gold();
          changed();
        }
        break;
      case "stake":
        ui.stake = Math.min(meta.maxStake, Math.max(0, ui.stake + Number(value)));
        sfx.click();
        render();
        break;
      case "newrun":
        newRun();
        break;
      case "mode":
        if (!ui.busy && (value === "climb" || value === "endless") && value !== mode) {
          mode = value;
          ui.tab = "play";
          ui.slotNote = "";
          ui.winCells = new Set();
          sfx.click();
          persist(true);
          render();
        }
        break;
      case "newsession": {
        const seed = (Date.now() ^ Math.imul(meta.seedCounter++, 2654435761)) >>> 0;
        session = startSession(seed, modsFor(meta, "endless", [], {}), 0);
        session.coins = endlessMods(meta, session).startCoins;
        ui.slotNote = "";
        persist(true);
        render();
        break;
      }
      case "sbuy":
        if (session && buySessionUpgrade(session, value, mods())) {
          sfx.gold();
          changed();
        }
        break;
      case "auto":
        if (session && mods().autoRate > 0) {
          session.autoOn = !session.autoOn;
          nextAuto = performance.now();
          sfx.click();
          changed();
        }
        break;
      case "prestige":
        if (session && canPrestige(session)) {
          const chips = prestige(session, meta);
          toast(`Prestige! +${chips} chips, and every win pays more for good.`);
          sfx.big();
          ui.slotNote = "";
          changed();
        }
        break;
      case "slotbet":
        ui.slotBet += Number(value);
        sfx.click();
        render();
        break;
      case "spin":
        void spinAction();
        break;
      case "close":
        if (run && closeRound(run, mods(), mk)) {
          sfx.click();
          changed();
        }
        break;
      case "charm":
        if (run && pickCharm(run, value, mk)) {
          toast(`Charm: ${CHARMS.find((c) => c.id === value)?.name ?? value}`);
          sfx.win();
          changed();
        }
        break;
      case "buycharm":
        if (run && buyCharm(run, value)) {
          toast(`Bought: ${CHARMS.find((c) => c.id === value)?.name ?? value}`);
          sfx.gold();
          changed();
        }
        break;
      case "rerollshop":
        if (run && rerollShop(run)) {
          sfx.click();
          changed();
        }
        break;
      case "reroll":
        if (run && rerollDraft(run)) {
          sfx.click();
          changed();
        }
        break;
      case "pickrelic": {
        const i = ui.picked.indexOf(value);
        if (i >= 0) ui.picked.splice(i, 1);
        else ui.picked = [...ui.picked, value].slice(-2);
        sfx.click();
        render();
        break;
      }
      case "combine": {
        const [a, b] = ui.picked;
        if (a === undefined || b === undefined) break;
        const res = combine(meta, a, b);
        const name = (id: string): string => RELICS.find((r) => r.id === id)?.name ?? id;
        ui.craftNote = res.kind === "new" ? `Crafted: ${name(res.id)}!` : res.kind === "known" ? `You already have ${name(res.id)}.` : "Nothing happens.";
        if (res.kind === "new") {
          toast(ui.craftNote);
          sfx.big();
          ui.picked = [];
          changed();
        } else {
          sfx.lose();
          render();
        }
        break;
      }
      case "upgrade":
        if (run && buyUpgrade(run, value)) {
          sfx.gold();
          changed();
        }
        break;
      case "buy":
        if (buyTech(meta, mode, value)) {
          sfx.win();
          changed();
        }
        break;
    }
  }

  document.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (t && !(t as HTMLButtonElement).disabled) act(t.dataset.act ?? "", t.dataset.v ?? "");
  });

  addEventListener("pagehide", () => persist(true));
  document.addEventListener("visibilitychange", () => document.hidden && persist(true));

  // the machine spins by itself in endless mode once the tree allows it: never in a hidden tab, never a burst after a pause
  setInterval(() => {
    if (mode !== "endless" || !session?.autoOn || ui.busy || document.hidden || ui.tab !== "play" || mods().autoRate <= 0) return;
    if (performance.now() >= nextAuto) void spinAction();
  }, 200);

  changed(); // a loaded run that was over still pays its chips once
  render();
}

void boot();
