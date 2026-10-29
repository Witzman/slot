import "./style.css";
import { type Meta, buyTech, combine, checkAchievements, fileRelic, finishRun, modsFor } from "../game/meta";
import { RELICS, CHARMS } from "../game/content";
import { HAND_LABEL } from "../game/poker";
import { type Run, type Refusal, buyUpgrade, closeRound, drainEvents, drawPoker, dropAt, holdCard, pickCharm, rerollDraft, spinSlot, startRun, tickPusher } from "../game/run";
import { type Sym, SYMS, COLS, ROWS } from "../game/slot";
import { localStore } from "../storage";
import { createPusherCanvas } from "./pusher-view";
import { loadMeta, loadRun, save } from "./save";
import { isMuted, setMuted, sfx, unlock } from "./sfx";
import { GLYPH, type Tab, type UI, type View, bookPanel, hud, nav, overlay, pokerPanel, pusherPanelInfo, shopPanel, slotPanel, treePanel } from "./view";

const store = localStore();
const $ = (id: string): HTMLElement => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e;
};

const REFUSAL: Record<Refusal, string> = {
  "not-playing": "No run in progress.",
  "no-turns": "No turns left this round.",
  busy: "Finish the poker hand first.",
  "no-coins": "Not enough coins.",
  "bad-bet": "That bet is not allowed.",
};

const START_GRID: Sym[][] = [["cherry", "bell", "lemon"], ["bar", "seven", "bar"], ["lemon", "wild", "cherry"]];

async function boot(): Promise<void> {
  let meta: Meta = await loadMeta(store);
  let run: Run | null = await loadRun(store);
  const ui: UI = { tab: "play", slotBet: 1, pokerBet: 1, busy: false, grid: START_GRID, winCells: new Set(), slotNote: "", pokerNote: "", pusherNote: "", overChips: 0, muted: false, picked: [], craftNote: "" };
  const mk = (charms: string[]) => modsFor(meta, charms, run?.upgrades ?? {});
  const mods = () => mk(run?.charms ?? []);
  const view = (): View => ({ run, meta, mods: mods(), ui });
  let aim = 5;
  let lastPhase = run?.phase ?? "over";

  const pc = createPusherCanvas($("pc") as HTMLCanvasElement);
  const hudEl = $("hud");
  const navEl = $("nav");
  const panelEl = $("panel");
  const cabinetEl = $("cabinet");
  const slotEl = $("slotbox");
  const pokerEl = $("pokerbox");
  const pinfoEl = $("pinfo");
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
    const go = (): void => void save(store, meta, run).catch((e) => console.error("could not save", e));
    if (now) go();
    else saveTimer = setTimeout(go, 400);
  }

  function render(): void {
    const v = view();
    ui.slotBet = Math.min(Math.max(1, ui.slotBet), v.mods.slotMaxBet);
        hudEl.innerHTML = hud(v);
    navEl.innerHTML = nav(v);
    const onPlay = ui.tab === "play";
    cabinetEl.hidden = !onPlay;
    panelEl.hidden = onPlay;
    if (onPlay) {
      slotEl.innerHTML = slotPanel(v);
      pokerEl.innerHTML = pokerPanel(v);
      pinfoEl.innerHTML = pusherPanelInfo(v);
    } else panelEl.innerHTML = { play: () => "", shop: shopPanel, tree: treePanel, book: bookPanel }[ui.tab](v);
    overlayEl.innerHTML = overlay(v);
    if (onPlay) pc.resize();
  }

  /** after anything changed the game: file prizes, show messages, unlock, close the run, save, draw */
  function changed(): void {
    if (run) {
      for (; run.found > 0; run.found--) {
        const id = fileRelic(meta, run.rng);
        if (id) {
          toast(`Relic found: ${RELICS.find((r) => r.id === id)?.name ?? id}`);
          sfx.big();
        } else {
          meta.chips++;
          toast("A relic you already own: +1 chip");
        }
      }
      for (const e of drainEvents(run)) toast(e);
      if (run.phase === "over" && !run.finished) {
        ui.overChips = finishRun(meta, run);
        sfx.lose();
      }
      if (run.phase === "draft" && lastPhase !== "draft") sfx.draft();
      lastPhase = run.phase;
    }
    for (const a of checkAchievements(meta, run)) {
      toast(`Achievement: ${a.name} (+${a.chips} chips)`);
      sfx.win();
    }
    persist();
    if (!ui.busy) render();
    else hudEl.innerHTML = hud(view());
  }

  function newRun(): void {
    const seed = (Date.now() ^ Math.imul(meta.seedCounter++, 2654435761)) >>> 0;
    run = startRun(seed, mk([]));
    lastPhase = "play";
    ui.slotNote = ui.pokerNote = ui.pusherNote = "";
    ui.winCells = new Set();
    ui.grid = START_GRID;
    ui.tab = "play";
    persist(true);
    render();
  }

  function spinAction(): void {
    if (!run || ui.busy) return;
    const res = spinSlot(run, mods(), ui.slotBet);
    if (typeof res === "string") return void toast(REFUSAL[res]);
    ui.busy = true;
    ui.winCells = new Set();
    ui.slotNote = "";
    const stops = [450, 700, 950];
    const t0 = performance.now();
    const final = res.grid;
    const timer = setInterval(() => {
      const el = performance.now() - t0;
      for (let c = 0; c < COLS; c++) {
        if (el < (stops[c] ?? 0)) for (let r = 0; r < ROWS; r++) (ui.grid[r] as Sym[])[c] = SYMS[Math.floor(Math.random() * SYMS.length)] as Sym;
        else for (let r = 0; r < ROWS; r++) (ui.grid[r] as Sym[])[c] = (final[r] as Sym[])[c] as Sym;
      }
      if (el < 950) {
        const cells = slotEl.querySelectorAll<HTMLElement>(".reels .cell");
        cells.forEach((cell, i) => {
          const r = Math.floor(i / COLS);
          const c = i % COLS;
          cell.innerHTML = GLYPH[(ui.grid[r] as Sym[])[c] as Sym];
        });
        for (let c = 0; c < COLS; c++) if (el >= (stops[c] ?? 0) && el < (stops[c] ?? 0) + 80) sfx.reel(c);
        return;
      }
      clearInterval(timer);
      ui.grid = final.map((row) => [...row]);
      ui.busy = false;
      ui.winCells = new Set(res.wins.flatMap((w) => w.cells.map(([r, c]) => `${r},${c}`)));
      const extra = res.freeDrops > 0 ? ` · ${res.freeDrops} free drops!` : "";
      ui.slotNote = res.payout > 0 ? `Won ${res.payout} coins${extra}` : `No win${extra}`;
      if (res.payout >= ui.slotBet * 20) sfx.big();
      else if (res.payout > 0 || res.freeDrops > 0) sfx.win();
      changed();
    }, 70);
  }

  function dropAction(x: number): void {
    if (!run) return;
    const res = dropAt(run, mods(), x);
    if (res in REFUSAL) toast(REFUSAL[res as Refusal]);
    else {
      sfx.click();
      changed();
    }
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
      case "newrun":
        newRun();
        break;
      case "slotbet":
        ui.slotBet += Number(value);
        sfx.click();
        render();
        break;
      case "spin":
        spinAction();
        break;
      case "close":
        if (run && closeRound(run, mods(), mk)) {
          sfx.click();
          changed();
        }
        break;
      case "hold":
        if (run) holdCard(run, Number(value));
        sfx.click();
        render();
        break;
      case "draw": {
        if (!run) break;
        const r = drawPoker(run, mods());
        if (!r) break;
        sfx.card();
        if (r.done) {
          ui.pokerNote = r.name ? `${HAND_LABEL[r.name]}! +${r.pay} coins` : "No win";
          if (r.pay > 0) (r.pay >= 6 ? sfx.big : sfx.win)();
        }
        changed();
        break;
      }
      case "charm":
        if (run && pickCharm(run, value, mk)) {
          toast(`Charm: ${CHARMS.find((c) => c.id === value)?.name ?? value}`);
          sfx.win();
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
        if (buyTech(meta, value)) {
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

  const canvas = $("pc");
  canvas.addEventListener("pointermove", (e) => void (aim = pc.xAt(e.clientX)));
  canvas.addEventListener("pointerdown", (e) => {
    unlock();
    aim = pc.xAt(e.clientX);
    dropAction(aim);
  });
  addEventListener("keydown", (e) => {
    if (ui.tab !== "play") return;
    if (e.key === "ArrowLeft") aim = Math.max(0, aim - 0.5);
    else if (e.key === "ArrowRight") aim = Math.min(10, aim + 0.5);
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      unlock();
      dropAction(aim);
    }
  });
  addEventListener("resize", () => ui.tab === "play" && pc.resize());
  addEventListener("pagehide", () => persist(true));
  document.addEventListener("visibilitychange", () => document.hidden && persist(true));

  // the pusher runs in real time while its tab is open and a round is on
  let last = performance.now();
  let acc = 0;
  function frame(now: number): void {
    acc += Math.min(100, now - last);
    last = now;
    if (ui.tab === "play" && run) {
      const live = run.phase === "play" && !document.hidden && !ui.busy;
      if (live) {
        const steps = Math.floor(acc / (1000 / 60));
        acc -= steps * (1000 / 60);
        if (steps > 0) {
          const paid = tickPusher(run, mods(), steps);
          if (paid > 0) {
            sfx.coin();
            changed();
          }
        }
      } else acc = 0;
      pc.draw(run.pusher, aim, live);
    } else acc = 0;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  changed(); // a loaded run that was over still pays its chips once
  render();
}

void boot();
