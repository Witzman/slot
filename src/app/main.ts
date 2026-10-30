import "./style.css";
import { type Meta, type ModeId, buyTech, combine, toggleEquip, checkAchievements, fileRelic, finishRun, modsFor } from "../game/meta";
import { RELICS, CHARMS } from "../game/content";
import { type Run, type Refusal, buyCardUpgrade, buyCharm, buyUpgrade, chooseEvent, closeRound, dealRound, drainEvents, drawHand, pickCharm, rerollDraft, rerollShop, startRun } from "../game/run";
import type { CardKind } from "../game/cards-shop";
import { HAND_LABEL } from "../game/hands";
import { localStore } from "../storage";
import { loadMeta, loadRun, save } from "./save";
import { isMuted, setMuted, sfx, unlock } from "./sfx";
import { type Tab, type UI, type View, bookPanel, hud, nav, overlay, roundPanel, shopPanel, slotPanel, treePanel } from "./view";

const store = localStore();
const $ = (id: string): HTMLElement => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e;
};

const REFUSAL: Record<Refusal, string> = {
  "not-playing": "No run in progress.",
  "no-turns": "No turns left this round.",
  "no-coins": "Not enough coins for a round.",
  "bad-bet": "That bet is not allowed.",
  busy: "Draw the cards on the table first.",
  "bad-hold": "You cannot hold that.",
  "no-hand": "Deal first.",
};

/** The only mode on screen until the start screen offers both (plan task 5). */
const MODE: ModeId = "climb";

async function boot(): Promise<void> {
  let meta: Meta = await loadMeta(store);
  let run: Run | null = await loadRun(store);
  const ui: UI = { tab: "play", slotBet: 1, holdRows: new Set(), holdCols: new Set(), holdCells: new Set(), result: null, slotNote: "", overChips: 0, muted: false, picked: [], craftNote: "", stake: 0, cardKind: "rank" };
  const mk = (charms: string[]) => modsFor(meta, MODE, charms, run?.upgrades ?? {}, run?.boss ?? null, run?.stake ?? 0);
  const mods = () => mk(run?.charms ?? []);
  const view = (): View => ({ mode: MODE, run, meta, mods: mods(), ui });
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
      roundEl.innerHTML = roundPanel(v);
    } else panelEl.innerHTML = { play: () => "", shop: shopPanel, tree: treePanel, book: bookPanel }[ui.tab](v);
    overlayEl.innerHTML = overlay(v);
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
          meta[MODE].chips++;
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
    for (const a of checkAchievements(meta, MODE, run)) {
      toast(`Achievement: ${a.name} (+${a.chips} chips)`);
      sfx.win();
    }
    persist();
    render();
  }

  function newRun(): void {
    const seed = (Date.now() ^ Math.imul(meta.seedCounter++, 2654435761)) >>> 0;
    ui.stake = Math.min(ui.stake, meta.maxStake);
    run = startRun(seed, modsFor(meta, MODE, [], {}, null, ui.stake), ui.stake);
    lastPhase = "play";
    ui.slotNote = "";
    clearHold();
    ui.result = null;
    ui.tab = "play";
    persist(true);
    render();
  }

  const clearHold = (): void => {
    ui.holdRows.clear();
    ui.holdCols.clear();
    ui.holdCells.clear();
  };

  function dealAction(): void {
    if (!run) return;
    const res = dealRound(run, mods(), ui.slotBet);
    if (typeof res === "string") return void toast(REFUSAL[res]);
    clearHold();
    ui.result = null;
    ui.slotNote = "";
    sfx.click();
    changed();
  }

  function drawAction(): void {
    if (!run) return;
    const res = drawHand(run, mods(), { rows: [...ui.holdRows], cols: [...ui.holdCols], cells: [...ui.holdCells] });
    if (typeof res === "string") return void toast(res === "bad-hold" ? REFUSAL["bad-hold"] : REFUSAL["no-hand"]);
    ui.result = res;
    clearHold();
    if (!res.final) {
      ui.slotNote = "Free draw used: hold again, only the last draw pays.";
      sfx.card();
    } else {
      const best = res.lines.reduce<typeof res.lines[number] | undefined>((b, l) => (b === undefined || l.pay > b.pay ? l : b), undefined);
      ui.slotNote = res.payout > 0 ? `${res.lines.length} hand${res.lines.length > 1 ? "s" : ""} · best: ${best ? HAND_LABEL[best.rank] : ""} · won ${res.payout} coins` : "No hand pays. Next round.";
      if (res.payout >= (run.hand?.bet ?? 1) * 60) sfx.big();
      else if (res.payout > 0) sfx.win();
      else sfx.lose();
    }
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
      case "slotbet":
        ui.slotBet += Number(value);
        sfx.click();
        render();
        break;
      case "deal":
        dealAction();
        break;
      case "draw":
        drawAction();
        break;
      case "cardkind":
        ui.cardKind = value as CardKind;
        sfx.click();
        render();
        break;
      case "cardbuy":
        if (run && buyCardUpgrade(run, Number(value), ui.cardKind, mods())) {
          sfx.gold();
          changed();
        }
        break;
      case "holdrow":
      case "holdcol": {
        const set = name === "holdrow" ? ui.holdRows : ui.holdCols;
        const n = Number(value);
        if (!set.delete(n)) {
          if (ui.holdRows.size + ui.holdCols.size >= mods().holdMax) return void toast(mods().holdMax === 0 ? "Nothing can be held this round." : `You can hold ${mods().holdMax} line${mods().holdMax > 1 ? "s" : ""} (the Hold branch of the tree raises it).`);
          set.add(n);
        }
        sfx.click();
        render();
        break;
      }
      case "holdcell": {
        const n = Number(value);
        if (!ui.holdCells.delete(n)) ui.holdCells.add(n);
        sfx.click();
        render();
        break;
      }
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
        if (buyTech(meta, MODE, value)) {
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

  changed(); // a loaded run that was over still pays its chips once
  render();
}

void boot();
