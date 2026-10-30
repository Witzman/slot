import { ACHIEVEMENTS, type Meta, relicSlots } from "../game/meta";
import { BOSSES, CHARMS, CURSES, RELICS, RELIC_PERKS, TECH, UPGRADES, upgradeCost } from "../game/content";
import { eventById } from "../game/events";
import type { Mods } from "../game/mods";
import { type Run, canClose, charmPrice, quotaFor, shopRerollPrice } from "../game/run";
import { missionDef, missionProgress } from "../game/missions";
import { rankOf, suitOf } from "../game/cards";
import { BASE_PAY, HAND_LABEL, HAND_ORDER } from "../game/hands";
import { LINES, type RoundResult, SIZE, heldCells } from "../game/round";

export type Tab = "play" | "shop" | "tree" | "book";

export interface UI {
  tab: Tab;
  slotBet: number;
  /** held rows, columns and single cells for the next draw */
  holdRows: Set<number>;
  holdCols: Set<number>;
  holdCells: Set<number>;
  /** the last draw, for the cells it replaced and the hands it scored */
  result: RoundResult | null;
  slotNote: string;
  overChips: number;
  muted: boolean;
  /** relics picked for combining (at most two) */
  picked: string[];
  craftNote: string;
  /** stake picked for the next run */
  stake: number;
}

export interface View {
  run: Run | null;
  meta: Meta;
  mods: Mods;
  ui: UI;
}

const BRANCH_NAME = { hold: "Hold", cards: "Cards", hands: "Hands", economy: "Economy" } as const;

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
           <div class="stat"><span>Tickets</span><strong>${r.tickets}</strong></div>`
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
  return `<div class="bet"><button data-act="${act}" data-v="-1" ${disabled ? "disabled" : ""}>−</button><span>Bet <strong>${bet}</strong></span><button data-act="${act}" data-v="1" ${disabled ? "disabled" : ""}>+</button><small>max ${max} · a round costs ${bet * LINES}</small></div>`;
}

const RANK_LABEL: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
const SUIT_GLYPH = ["♠", "♥", "♦", "♣"];

/** One card, with its marks: held, new from the draw, and the upgrades it carries. */
function cardHtml(v: View, cell: number, held: boolean, fresh: boolean, clickable: boolean): string {
  const board = v.run?.hand?.board;
  if (!board) return `<div class="pc back"></div>`;
  const card = board[cell] as number;
  const u = v.run?.cardUpgrades[card];
  const rank = Math.min(14, rankOf(card) + (u?.rank ?? 0));
  const suit = suitOf(card);
  const marks = [u?.joker ? "★" : "", u?.gold ? "$" : "", u?.rank ? `+${u.rank}` : "", u?.anySuit ? "◆" : ""].join("");
  const face = u?.joker ? "★" : `${RANK_LABEL[rank] ?? rank}`;
  return `<button class="pc ${suit === 1 || suit === 2 ? "red" : ""}${held ? " held" : ""}${fresh ? " new" : ""}${u?.joker ? " joker" : ""}${u?.gold ? " gold" : ""}" data-act="holdcell" data-v="${cell}" ${clickable ? "" : "disabled"}><span>${face}</span><span>${u?.joker ? "" : SUIT_GLYPH[suit]}</span>${marks ? `<em>${marks}</em>` : ""}</button>`;
}

export function slotPanel(v: View): string {
  const { run, mods, ui } = v;
  const hand = run?.hand ?? null;
  const open = hand !== null && hand.phase === "hold";
  const playing = run !== null && run.phase === "play";
  const kept = heldCells([...ui.holdRows], [...ui.holdCols], [...ui.holdCells]);
  const result = hand !== null && hand.phase === "done" ? ui.result : null;
  const lineOf = (line: number) => result?.lines.find((l) => l.line === line);
  const badge = (line: number): string => {
    const l = lineOf(line);
    return l ? `<span class="badge" title="${HAND_LABEL[l.rank]}">${HAND_LABEL[l.rank]} <b>+${Math.round(l.pay)}</b></span>` : `<span class="badge none"></span>`;
  };
  const rowBtn = (r: number): string => `<button class="line${ui.holdRows.has(r) ? " on" : ""}" data-act="holdrow" data-v="${r}" ${open ? "" : "disabled"} aria-label="Hold row ${r + 1}">${ui.holdRows.has(r) ? "HOLD" : "R" + (r + 1)}</button>`;
  const colBtn = (c: number): string => `<button class="line${ui.holdCols.has(c) ? " on" : ""}" data-act="holdcol" data-v="${c}" ${open ? "" : "disabled"} aria-label="Hold column ${c + 1}">${ui.holdCols.has(c) ? "HOLD" : "C" + (c + 1)}</button>`;
  const cells: string[] = ['<span></span>', ...Array.from({ length: SIZE }, (_, c) => colBtn(c)), '<span></span>'];
  for (let r = 0; r < SIZE; r++) {
    cells.push(rowBtn(r));
    for (let c = 0; c < SIZE; c++) {
      const i = r * SIZE + c;
      cells.push(cardHtml(v, i, open && kept.has(i), result?.drawn[i] === true || (open && (ui.result?.drawn[i] ?? false)), open && mods.singleHold));
    }
    cells.push(badge(r));
  }
  cells.push("<span></span>", ...Array.from({ length: SIZE }, (_, c) => badge(SIZE + c)), "<span></span>");
  const cost = ui.slotBet * LINES;
  const why = !playing ? "" : !open && run.turnsLeft <= 0 ? "No turns left: close the round." : !open && run.coins < cost ? "Not enough coins." : "";
  const canDeal = playing && !open && run.turnsLeft > 0 && run.coins >= cost;
  const drawsLeft = hand ? hand.maxDraws - hand.draws : 0;
  const pays = HAND_ORDER.map((r) => `<li><span>${HAND_LABEL[r]}</span><b>${Math.round(BASE_PAY[r] * mods.handMul[r] * ui.slotBet)}</b></li>`).reverse().join("");
  const help = open
    ? `Hold rows or columns${mods.singleHold ? " or single cards" : ""} you want to keep, then draw.${drawsLeft > 1 ? ` ${drawsLeft} draws: only the last one pays.` : " Only this draw pays."}`
    : "Deal 25 cards. Every row and every column is a poker hand; all hands add up.";
  return `
    <section class="machine slot">
      <h2>Cards <small>10 hands</small></h2>
      <div class="cards">${cells.join("")}</div>
      <p class="note">${esc(ui.slotNote) || help}</p>
      ${betRow("slotbet", ui.slotBet, mods.slotMaxBet, !playing || open)}
      ${open ? `<button class="big" data-act="draw">DRAW <small>${kept.size === 0 ? "hold nothing: draw all 25" : `keeping ${kept.size} cards`}${drawsLeft > 1 ? ` · draw ${hand?.draws !== undefined ? hand.draws + 1 : 1} of ${hand?.maxDraws ?? 1}` : ""}</small></button>` : `<button class="big" data-act="deal" ${canDeal ? "" : "disabled"}>DEAL <small>${why || `${cost} coins · 1 turn`}</small></button>`}
      <details class="paytable"><summary>Pay table (bet ${ui.slotBet})</summary>
        <ul class="list">${pays}</ul>
        <p class="hint">Pairs below jacks pay nothing. A card in a row and a column scores in both.</p>
      </details>
    </section>`;
}

export function roundPanel(v: View): string {
  const { run, mods } = v;
  const close = run !== null && canClose(run, mods);
  const boss = run?.boss ? BOSSES.find((b) => b.id === run.boss) : undefined;
  const bossLine = boss ? `<p class="boss"><strong>BOSS · ${esc(boss.name)}</strong> ${esc(boss.text)}</p>` : "";
  return `${bossLine}${close && run ? `<button class="big" data-act="close">CLOSE ROUND <small>pay quota ${run.quota} · you have ${run.coins}</small></button>` : ""}`;
}

export function shopPanel(v: View): string {
  const { run } = v;
  const live = run !== null && run.phase === "play";
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
  const noRun = !run || run.phase === "over";
  const relics = RELICS.map((r) => {
    if (!meta.relics.includes(r.id)) return `<div class="relic"><strong>???</strong><span>${r.craft ? "Can be crafted" : "Not found yet"}</span></div>`;
    const on = meta.loadout.includes(r.id);
    const full = !on && meta.loadout.length >= relicSlots(meta);
    return `<div class="relic found${v.ui.picked.includes(r.id) ? " picked" : ""}${on ? " equipped" : ""}"><strong>${esc(r.name)}</strong><span>${esc(r.text)}</span><span class="perk">${esc(RELIC_PERKS[r.id]?.text ?? "")}</span>
      <div class="two"><button data-act="pickrelic" data-v="${r.id}">${v.ui.picked.includes(r.id) ? "Picked" : "Combine"}</button><button data-act="equip" data-v="${r.id}" ${noRun && (on || !full) ? "" : "disabled"}>${on ? "Unequip" : "Equip"}</button></div></div>`;
  }).join("");
  const craft = `<div class="craft"><span>${v.ui.picked.length === 2 ? esc(v.ui.picked.map((id) => RELICS.find((r) => r.id === id)?.name ?? id).join(" + ")) : "Pick two relics to combine"}</span><button data-act="combine" ${v.ui.picked.length === 2 ? "" : "disabled"}>Combine</button></div><p class="hint">${esc(v.ui.craftNote)}</p>`;
  const charms = run && run.charms.length ? run.charms.map((id) => CHARMS.find((c) => c.id === id) ?? CURSES.find((c) => c.id === id)).filter((c) => c !== undefined).map((c) => `<li><strong>${esc(c.name)}</strong> ${esc(c.text)}</li>`).join("") : `<li class="empty">No charms yet.</li>`;
  return `<section class="book"><h2>Book</h2>
    <div class="cols">
      <div><h3>Missions this run</h3><ul class="plain">${missions}</ul><h3>Charms this run</h3><ul class="plain">${charms}</ul>
        <h3>Career</h3><p class="hint">${meta.runs} runs · best round ${meta.bestRound} · stake ${meta.maxStake} unlocked · ${meta.life.spins} spins</p></div>
      <div><h3>Achievements ${meta.ach.length}/${ACHIEVEMENTS.length}</h3><ul class="plain">${ach}</ul></div>
      <div><h3>Relics ${meta.relics.length}/${RELICS.length} <small>(+1 start coin per 2)</small></h3><p class="hint">Equipped ${meta.loadout.length}/${relicSlots(meta)} — perks apply to the next run${noRun ? "" : " (locked during a run)"}.</p>${craft}<div class="relics">${relics}</div></div>
    </div></section>`;
}

function stakePicker(v: View): string {
  if (v.meta.maxStake < 1) return "";
  const s = v.ui.stake;
  return `<div class="bet"><button data-act="stake" data-v="-1" ${s <= 0 ? "disabled" : ""}>−</button><span>Stake <strong>${s}</strong></span><button data-act="stake" data-v="1" ${s >= v.meta.maxStake ? "disabled" : ""}>+</button><small>unlocked ${v.meta.maxStake} · +${s * 12}% quota${s >= 3 ? ", 1 turn less" : ""} · chips x${(1 + 0.25 * s).toFixed(2)}</small></div>`;
}

export function overlay(v: View): string {
  const { run, ui, meta } = v;
  if ((!run || run.phase === "over") && (ui.tab === "tree" || ui.tab === "book")) return "";
  if (!run) {
    return `<div class="modal"><div class="card-box title">
      <h1>SLOT<b>·</b>ROGUE</h1>
      <p>Deal a 5×5 board of cards: every row and column is a poker hand and the hands add up. Hold what you like, draw, pay the quota when your turns run out, pick a charm, go deeper. Lose the run, earn chips, grow the tech tree.</p>
      <p class="hint">Each round (deal, hold, draw) is one turn.</p>
      ${stakePicker(v)}<button class="big" data-act="newrun">Start run</button></div></div>`;
  }
  if (run.phase === "event") {
    const ev = eventById(run.event);
    if (!ev) return "";
    const choices = ev.choices.map((c, i) => `<button class="charm" data-act="event" data-v="${i}" ${!c.can || c.can(run) ? "" : "disabled"}><strong>${esc(c.text)}</strong></button>`).join("");
    return `<div class="modal"><div class="card-box"><h2>${esc(ev.title)}</h2><p>${esc(ev.text)}</p><div class="charms">${choices}</div>
      <p class="hint">Coins ${run.coins} · tickets ${run.tickets}</p></div></div>`;
  }
  if (run.phase === "draft") {
    const find = (id: string) => CHARMS.find((c) => c.id === id);
    const cards = run.draft.map(find).filter((c) => c !== undefined).map((c) => `<button class="charm ${c.rarity}" data-act="charm" data-v="${c.id}"><strong>${esc(c.name)}</strong><span>${esc(c.text)}</span><em>${c.rarity}</em></button>`).join("");
    const shop = run.shop.map(find).filter((c) => c !== undefined).map((c) => {
      const price = charmPrice(c.id);
      return `<button class="charm ${c.rarity}" data-act="buycharm" data-v="${c.id}" ${run.tickets >= price ? "" : "disabled"}><strong>${esc(c.name)}</strong><span>${esc(c.text)}</span><em>${c.rarity} · ${price} tickets</em></button>`;
    }).join("");
    const rr = shopRerollPrice(run);
    return `<div class="modal"><div class="card-box wide"><h2>Round ${run.round - 1} cleared</h2><p>Quota paid. The phone rings: take one charm for free.</p><div class="charms">${cards}</div>
      ${run.rerollsLeft > 0 ? `<button data-act="reroll">Re-draw the call (${run.rerollsLeft} left)</button>` : ""}
      <h3>Shop <span class="teal">${run.tickets} tickets</span></h3>
      <div class="charms">${shop || '<p class="hint">Sold out.</p>'}</div>
      <button data-act="rerollshop" ${run.tickets >= rr ? "" : "disabled"}>New stock (${rr} ticket${rr > 1 ? "s" : ""})</button>
      <p class="hint">Coins: ${run.coins} · next quota ${quotaFor(run.round, v.mods)} · tickets come from rounds, missions and coin scatters</p></div></div>`;
  }
  if (run.phase === "over") {
    const why = run.overReason === "bust" ? "You ran out of coins." : `You missed the quota of ${run.quota} with ${run.coins} coins.`;
    return `<div class="modal"><div class="card-box"><h2>Run over</h2><p>${why}</p>
      <p>Rounds cleared: <strong>${run.completed}</strong> · chips earned: <strong class="teal">+${ui.overChips}</strong> (total ${meta.chips})</p>
      ${stakePicker(v)}<div class="row"><button data-act="tab" data-v="tree">Tech tree</button><button class="big" data-act="newrun">New run</button></div></div></div>`;
  }
  return "";
}
