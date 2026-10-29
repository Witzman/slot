import { ACHIEVEMENTS, type Meta } from "../game/meta";
import { CHARMS, RELICS, TECH, UPGRADES, upgradeCost } from "../game/content";
import type { Mods } from "../game/mods";
import { HAND_LABEL, HAND_ORDER, type HandName, classify, rank, suit } from "../game/poker";
import { type Run, ZONE_HEAT, canClose, zoneMul } from "../game/run";
import { missionDef, missionProgress } from "../game/missions";
import { COLS, LINES, ROWS, type Sym } from "../game/slot";

export type Tab = "play" | "shop" | "tree" | "book";

export interface UI {
  tab: Tab;
  slotBet: number;
  pokerBet: number;
  /** reels are turning: the screen holds back round and run results until they stop */
  busy: boolean;
  grid: Sym[][];
  winCells: Set<string>;
  slotNote: string;
  pokerNote: string;
  pusherNote: string;
  overChips: number;
  muted: boolean;
  /** relics picked for combining (at most two) */
  picked: string[];
  craftNote: string;
}

export interface View {
  run: Run | null;
  meta: Meta;
  mods: Mods;
  ui: UI;
}

const svg = (body: string): string => `<svg viewBox="0 0 48 48" width="1em" height="1em" aria-hidden="true">${body}</svg>`;
/** Symbols are drawn, not typed as emoji: not every system has an emoji font. */
export const GLYPH: Record<Sym, string> = {
  cherry: svg('<path d="M18 30 C20 18 26 12 34 8 M30 32 C30 20 32 14 34 8" stroke="#2f7d32" stroke-width="3" fill="none"/><circle cx="16" cy="34" r="8" fill="#d3213f"/><circle cx="31" cy="35" r="8" fill="#e63950"/><circle cx="13" cy="31" r="2" fill="#fff" opacity=".6"/>'),
  lemon: svg('<ellipse cx="24" cy="26" rx="18" ry="13" fill="#ffd84a" stroke="#c9a100" stroke-width="2"/><path d="M5 26 L1 24 M43 26 L47 24" stroke="#c9a100" stroke-width="3"/><ellipse cx="18" cy="21" rx="5" ry="2.5" fill="#fff" opacity=".5"/>'),
  bell: svg('<path d="M24 6 C14 6 12 16 12 24 C12 31 8 34 8 36 L40 36 C40 34 36 31 36 24 C36 16 34 6 24 6Z" fill="#f2b705" stroke="#a87400" stroke-width="2"/><circle cx="24" cy="40" r="4" fill="#a87400"/>'),
  bar: "BAR",
  seven: "7",
  wild: svg('<polygon points="24,4 30,18 45,19 33,29 37,44 24,36 11,44 15,29 3,19 18,18" fill="#ffcc33" stroke="#b07a00" stroke-width="2"/>'),
  coin: svg('<circle cx="24" cy="24" r="19" fill="#ffd84a" stroke="#a87400" stroke-width="3"/><circle cx="24" cy="24" r="12" fill="none" stroke="#b98500" stroke-width="2"/><text x="24" y="30" font-size="16" font-weight="900" text-anchor="middle" fill="#a87400">$</text>'),
};

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
const BRANCH_NAME = { run: "Run", slot: "Slot", poker: "Poker", pusher: "Pusher" } as const;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export function hud(v: View): string {
  const r = v.run;
  const playing = r !== null && r.phase !== "over";
  const quota = r?.quota ?? 0;
  const pct = r && quota > 0 ? Math.min(100, Math.round((r.coins / quota) * 100)) : 0;
  const turns = r ? Array.from({ length: Math.max(v.mods.turns, r.turnsLeft) }, (_, i) => `<i class="${i < r.turnsLeft ? "on" : ""}"></i>`).join("") : "";
  return `
    <div class="brand">SLOT<b>·</b>ROGUE</div>
    ${
      playing && r
        ? `<div class="stat"><span>Coins</span><strong class="gold">${r.coins}</strong></div>
           <div class="stat"><span>Round</span><strong>${r.round}</strong></div>
           <div class="stat wide"><span>Quota ${quota} <em>(${pct}%)</em></span><div class="bar"><div style="width:${pct}%"></div></div><div class="pips" title="turns left">${turns}</div></div>
           <div class="stat"><span>Free drops</span><strong>${r.freeDrops}</strong></div>`
        : `<div class="stat wide"><span>No run in progress</span></div>`
    }
    <div class="stat"><span>Chips</span><strong class="teal">${v.meta.chips}</strong></div>
    <button class="icon" data-act="mute" title="Toggle sound">${v.ui.muted ? "Unmute" : "Mute"}</button>`;
}

export function nav(v: View): string {
  const tabs: [Tab, string][] = [["play", "Play"], ["shop", "Shop"], ["tree", "Tech"], ["book", "Book"]];
  return tabs.map(([t, label]) => `<button class="${v.ui.tab === t ? "active" : ""}" data-act="tab" data-v="${t}">${label}</button>`).join("");
}

function betRow(act: string, bet: number, max: number, disabled: boolean): string {
  return `<div class="bet"><button data-act="${act}" data-v="-1" ${disabled ? "disabled" : ""}>−</button><span>Bet <strong>${bet}</strong></span><button data-act="${act}" data-v="1" ${disabled ? "disabled" : ""}>+</button><small>max ${max}</small></div>`;
}

export function slotPanel(v: View): string {
  const { run, mods, ui } = v;
  const live = run !== null && run.phase === "play" && !ui.busy;
  const lines = mods.slotLines;
  const cost = ui.slotBet * lines;
  const cells: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const sym = (ui.grid[r] as Sym[])[c] as Sym;
      cells.push(`<div class="cell s-${sym}${ui.winCells.has(`${r},${c}`) ? " win" : ""}" data-col="${c}">${GLYPH[sym]}</div>`);
    }
  }
  const canSpin = live && run !== null && run.poker.phase === "bet" && run.turnsLeft > 0 && run.coins >= cost;
  const why = !run || run.phase !== "play" ? "" : run.poker.phase === "hold" ? "Draw your free hand first." : run.turnsLeft <= 0 ? "No turns left: let the shelf run, then close the round." : run.coins < cost ? "Not enough coins." : "";
  return `
    <section class="machine slot">
      <h2>1 · Reels</h2>
      <div class="reels">${cells.join("")}</div>
      <p class="note">${esc(ui.slotNote) || "Wins pour onto the pusher shelf. The star is wild. Three coin symbols give free drops."}</p>
      ${betRow("slotbet", ui.slotBet, mods.slotMaxBet, !live)}
      <button class="big" data-act="spin" ${canSpin ? "" : "disabled"}>PULL <small>${why || `${cost} coins · ${lines} line${lines > 1 ? "s" : ""} · 1 turn`}</small></button>
      <details class="paytable"><summary>Pay table</summary>
        <ul><li>${GLYPH.cherry}${GLYPH.cherry} (left) ×1</li><li>3× ${GLYPH.cherry} ×4</li><li>3× ${GLYPH.lemon} ×6</li><li>3× ${GLYPH.bell} ×10</li><li>3× BAR ×20</li><li>3× 7 ×60</li></ul>
      </details>
      ${lineKey(lines)}
    </section>`;
}

function lineKey(lines: number): string {
  const names = ["middle", "top", "bottom", "diagonal ↘", "diagonal ↗"];
  return `<p class="hint">Paylines: ${names.slice(0, Math.min(lines, LINES.length)).join(", ")}</p>`;
}

function cardHtml(card: number, held: boolean, hold: boolean, i: number): string {
  const rk = rank(card);
  const red = suit(card) === 1 || suit(card) === 2;
  return `<button class="card${red ? " red" : ""}${held ? " held" : ""}" data-act="hold" data-v="${i}" ${hold ? "" : "disabled"}><span>${RANKS[rk] ?? rk}</span><span>${SUITS[suit(card)]}</span>${held ? "<em>HELD</em>" : ""}</button>`;
}

export function pokerPanel(v: View): string {
  const { run, mods, ui } = v;
  const p = run?.poker;
  const phase = p?.phase ?? "bet";
  const live = run !== null && run.phase === "play" && !ui.busy;
  const made: HandName | null = p && p.hand.length === 5 ? classify(p.hand) : null;
  const bet = p && p.hand.length === 5 ? p.bet : 1;
  const cards = p && p.hand.length === 5 ? p.hand.map((c, i) => cardHtml(c, p.held[i] === true && phase === "hold", phase === "hold" && live, i)).join("") : `<div class="empty">Every pull deals a free hand</div>`;
  const rows = HAND_ORDER.map((h) => `<li class="${made === h ? "now" : ""}"><span>${HAND_LABEL[h]}</span><b>${Math.round(mods.pokerPay[h] * bet * mods.pokerMul)}</b></li>`).join("");
  return `
    <section class="machine poker">
      <h2>2 · Free hand</h2>
      <div class="hand">${cards}</div>
      <p class="note">${esc(ui.pokerNote) || (phase === "hold" ? `Tap cards to hold, then draw${p && p.draws > 1 ? " (two draws)" : ""}. Stake ${bet}.` : "Wins pour onto the shelf too.")}</p>
      <button class="big" data-act="draw" ${phase === "hold" && live ? "" : "disabled"}>DRAW</button>
      <ul class="paytable list">${rows}</ul>
    </section>`;
}

export function pusherPanelInfo(v: View): string {
  const { run, ui, mods } = v;
  const live = run !== null && run.phase === "play";
  const close = run !== null && canClose(run, mods);
  const hint = !live || !run ? "Start a run to play" : `${run.pusher.coins.length} on the shelf · ${run.pour.length} coming · ${run.freeDrops} free drops · tap to drop (1 turn)`;
  const zone = run ? `Zone ${run.zone} (x${zoneMul(run, mods).toFixed(1)}${run.zone < mods.zoneMax ? `, heat ${run.zoneHeat}/${ZONE_HEAT[run.zone - 1] ?? 0}` : ", max"})` : "";
  return `<p class="note">${esc(ui.pusherNote) || "3 · Pusher: your wins land here. Only coins pushed off the front count as yours."}</p>
    <p class="hint">${zone ? `<strong class="gold">${zone}</strong> · ` : ""}${hint}</p>
    ${close && run ? `<button class="big" data-act="close">CLOSE ROUND <small>pay quota ${run.quota} · you have ${run.coins}</small></button>` : ""}`;
}

export function shopPanel(v: View): string {
  const { run } = v;
  const live = run !== null && run.phase === "play" && !v.ui.busy;
  const rows = UPGRADES.map((u) => {
    const level = run?.upgrades[u.id] ?? 0;
    const maxed = level >= u.max;
    const cost = upgradeCost(u, level);
    const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < level ? "on" : ""}"></i>`).join("");
    const can = live && !maxed && run !== null && run.coins >= cost;
    return `<button class="node ${maxed ? "owned" : can ? "ready" : "open"}" data-act="upgrade" data-v="${u.id}" ${can ? "" : "disabled"}>
      <strong>${esc(u.name)} <span class="pips inline">${pips}</span></strong><span>${esc(u.text)}</span><em>${maxed ? "max level" : `${cost} coins`}</em></button>`;
  }).join("");
  return `<section class="tree"><h2>Upgrade shop</h2>
    <p class="note">${run && run.phase !== "over" ? "Spend coins on upgrades that last for this run. Buying costs no turn." : "Start a run to buy upgrades."}</p>
    <div class="branches one">${rows}</div></section>`;
}

export function treePanel(v: View): string {
  const { meta, run } = v;
  const locked = run !== null && run.phase !== "over";
  const cols = (Object.keys(BRANCH_NAME) as (keyof typeof BRANCH_NAME)[]).map((b) => {
    const nodes = TECH.filter((t) => t.branch === b).map((t) => {
      const owned = meta.tech.includes(t.id);
      const open = t.requires.every((r) => meta.tech.includes(r));
      const afford = meta.chips >= t.cost;
      const need = t.requires.filter((r) => !meta.tech.includes(r)).map((r) => TECH.find((x) => x.id === r)?.name ?? r);
      const state = owned ? "owned" : open ? (afford && !locked ? "ready" : "open") : "locked";
      return `<button class="node ${state}" data-act="buy" data-v="${t.id}" ${state === "ready" ? "" : "disabled"}>
        <strong>${esc(t.name)}</strong><span>${esc(t.text)}</span>
        <em>${owned ? "owned" : open ? `${t.cost} chips` : `needs ${esc(need.join(", "))}`}</em></button>`;
    });
    return `<div class="branch"><h3>${BRANCH_NAME[b]}</h3>${nodes.join("")}</div>`;
  });
  const start = locked ? "" : `<button class="big" data-act="newrun">Start run</button>`;
  return `<section class="tree"><h2>Tech tree</h2>${start}
    <p class="note">${locked ? "Finish or lose your run to spend chips." : "Spend chips on permanent upgrades. Earn chips with rounds, missions and achievements."}</p>
    <div class="branches">${cols.join("")}</div></section>`;
}

export function bookPanel(v: View): string {
  const { run, meta } = v;
  const missions =
    run && run.phase !== "over"
      ? run.missions
          .map((m) => {
            const d = missionDef(m.id);
            if (!d) return "";
            return `<li class="${m.done ? "done" : ""}"><span>${esc(d.text)}</span><b>${m.done ? "done" : `${missionProgress(run, m.id)}/${d.target}`}</b><em>+${d.reward} chips</em></li>`;
          })
          .join("")
      : `<li class="empty">Missions appear when a run starts.</li>`;
  const ach = ACHIEVEMENTS.map((a) => `<li class="${meta.ach.includes(a.id) ? "done" : ""}"><span><strong>${esc(a.name)}</strong> ${esc(a.text)}</span><em>+${a.chips} chips</em></li>`).join("");
  const relics = RELICS.map((r) =>
    meta.relics.includes(r.id)
      ? `<button class="relic found${v.ui.picked.includes(r.id) ? " picked" : ""}" data-act="pickrelic" data-v="${r.id}"><strong>${esc(r.name)}</strong><span>${esc(r.text)}</span></button>`
      : `<div class="relic"><strong>???</strong><span>${r.craft ? "Can be crafted" : "Not found yet"}</span></div>`,
  ).join("");
  const craft = `<div class="craft"><span>${v.ui.picked.length === 2 ? esc(v.ui.picked.map((id) => RELICS.find((r) => r.id === id)?.name ?? id).join(" + ")) : "Pick two relics to combine"}</span><button data-act="combine" ${v.ui.picked.length === 2 ? "" : "disabled"}>Combine</button></div><p class="hint">${esc(v.ui.craftNote)}</p>`;
  const charms = run && run.charms.length ? run.charms.map((id) => CHARMS.find((c) => c.id === id)).filter((c) => c !== undefined).map((c) => `<li><strong>${esc(c.name)}</strong> ${esc(c.text)}</li>`).join("") : `<li class="empty">No charms yet.</li>`;
  return `<section class="book"><h2>Book</h2>
    <div class="cols">
      <div><h3>Missions this run</h3><ul class="plain">${missions}</ul><h3>Charms this run</h3><ul class="plain">${charms}</ul>
        <h3>Career</h3><p class="hint">${meta.runs} runs · best round ${meta.bestRound} · ${meta.life.spins} spins · ${meta.life.hands} hands · ${meta.life.drops} drops · ${meta.life.pusherPaid} coins from the pusher</p></div>
      <div><h3>Achievements ${meta.ach.length}/${ACHIEVEMENTS.length}</h3><ul class="plain">${ach}</ul></div>
      <div><h3>Relics ${meta.relics.length}/${RELICS.length} <small>(+1 start coin per 2)</small></h3>${craft}<div class="relics">${relics}</div></div>
    </div></section>`;
}

export function overlay(v: View): string {
  const { run, ui, meta } = v;
  if (ui.busy) return "";
  if ((!run || run.phase === "over") && (ui.tab === "tree" || ui.tab === "book")) return "";
  if (!run) {
    return `<div class="modal"><div class="card-box title">
      <h1>SLOT<b>·</b>ROGUE</h1>
      <p>Slots, video poker and a coin pusher in one run. Win coins on any machine, pay the quota when your turns run out, pick a charm, go deeper. Lose the run, earn chips, grow the tech tree.</p>
      <p class="hint">Each spin, hand or coin drop is one turn.</p>
      <button class="big" data-act="newrun">Start run</button></div></div>`;
  }
  if (run.phase === "draft") {
    const cards = run.draft.map((id) => CHARMS.find((c) => c.id === id)).filter((c) => c !== undefined).map((c) => `<button class="charm" data-act="charm" data-v="${c.id}"><strong>${esc(c.name)}</strong><span>${esc(c.text)}</span></button>`).join("");
    return `<div class="modal"><div class="card-box"><h2>Round ${run.round - 1} cleared</h2><p>Quota paid. Choose a charm for this run.</p><div class="charms">${cards}</div>
      ${run.rerollsLeft > 0 ? `<button data-act="reroll">Re-draw (${run.rerollsLeft} left)</button>` : ""}
      <p class="hint">Coins: ${run.coins} · next quota ${Math.round(run.quota)}</p></div></div>`;
  }
  if (run.phase === "over") {
    const why = run.overReason === "bust" ? "You ran out of coins." : `You missed the quota of ${run.quota} with ${run.coins} coins.`;
    return `<div class="modal"><div class="card-box"><h2>Run over</h2><p>${why}</p>
      <p>Rounds cleared: <strong>${run.completed}</strong> · chips earned: <strong class="teal">+${ui.overChips}</strong> (total ${meta.chips})</p>
      <div class="row"><button data-act="tab" data-v="tree">Tech tree</button><button class="big" data-act="newrun">New run</button></div></div></div>`;
  }
  return "";
}
