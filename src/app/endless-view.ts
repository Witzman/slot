import { ASCEND_AT, MILESTONES, MILESTONE_MUL, PRESTIGE_AT, ENDLESS_SHOP, STAR_STEP, canAscend, canPrestige, prestigeChips, prestigeMul } from "../game/endless";
import { upgradeCost } from "../game/content";
import { chipBonus } from "../game/meta";
import type { View } from "./view";

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** Share of the way from the last milestone to the next, in percent. */
export function milestoneProgress(earned: number, reached: number): number {
  if (reached >= MILESTONES.length) return 100;
  const from = reached === 0 ? 0 : (MILESTONES[reached - 1] as number);
  const to = MILESTONES[reached] as number;
  return Math.max(0, Math.min(100, Math.round(((earned - from) / (to - from)) * 100)));
}

export function endlessHud(v: View): string {
  const s = v.session;
  if (!s) return `<div class="stat wide"><span>No session in progress</span></div>`;
  const next = MILESTONES[s.milestones];
  const pct = milestoneProgress(s.totalEarned, s.milestones);
  return `
    <div class="stat"><span>Coins</span><strong class="gold">${s.coins}</strong></div>
    <div class="stat"><span>Rounds</span><strong>${s.rounds}</strong></div>
    <div class="stat wide"><span>Milestone ${s.milestones}/${MILESTONES.length}${next === undefined ? " · all reached" : ` · ${s.totalEarned}/${next} won`} <em>(${pct}%)</em></span><div class="bar"><div style="width:${pct}%"></div></div></div>
    <div class="stat"><span>Prestige${v.meta.endless.stars > 0 ? ` · ${v.meta.endless.stars}★` : ""}</span><strong>×${prestigeMul(s.prestige).toFixed(2)}</strong></div>`;
}

/** Below the cards: auto-play and the prestige button. */
export function endlessPanel(v: View): string {
  const s = v.session;
  if (!s) return "";
  const rate = v.mods.autoRate;
  const auto = rate > 0 ? `<button data-act="auto" class="${s.autoOn ? "active" : ""}">${s.autoOn ? "Auto-play on" : "Auto-play off"} <small>one round every ${Math.round(1000 / rate) / 1000} s, holds the best line</small></button>` : `<p class="hint">Auto-play is a node of the Economy tree (bought with prestige chips).</p>`;
  const chips = Math.floor(prestigeChips(s.milestones) * chipBonus(v.meta));
  const prestigeBtn = canPrestige(s)
    ? `<button class="big" data-act="prestige">PRESTIGE <small>start over with +${chips} chips and ×${prestigeMul(s.prestige + 1).toFixed(2)} wins</small></button>`
    : `<p class="hint">Prestige opens at milestone ${PRESTIGE_AT} of ${MILESTONES.length}. Each milestone makes every win ${Math.round((MILESTONE_MUL - 1) * 100)}% bigger.</p>`;
  const g = s.gamble;
  const gambleRow = g ? `<div class="row"><span class="note">Double ${g.stake} coins? ${g.left} ${g.left === 1 ? "try" : "tries"} left</span><button data-act="gamble" data-v="red">Red</button><button data-act="gamble" data-v="black">Black</button><button data-act="takewin">Keep it</button></div>` : "";
  const ascendBtn = canAscend(v.meta)
    ? `<button class="big" data-act="ascend">ASCEND <small>${v.meta.endless.prestiges} prestiges: lose Endless chips, tree and prestiges for a star (every win +${Math.round(STAR_STEP * 100)}%)</small></button>`
    : v.meta.endless.prestiges > 0 || v.meta.endless.stars > 0
      ? `<p class="hint">${v.meta.endless.stars} star${v.meta.endless.stars === 1 ? "" : "s"} · ascension opens after ${ASCEND_AT} prestiges (${v.meta.endless.prestiges} so far).</p>`
      : "";
  return `${auto}${gambleRow}${prestigeBtn}${ascendBtn}`;
}

export function endlessShop(v: View): string {
  const s = v.session;
  const live = s !== null;
  const rows = ENDLESS_SHOP.map((u) => {
    const level = s?.upgrades[u.id] ?? 0;
    const maxed = level >= u.max;
    const cost = upgradeCost(u, level);
    const pips = u.max <= 12 ? Array.from({ length: u.max }, (_, i) => `<i class="${i < level ? "on" : ""}"></i>`).join("") : `<b>lv ${level}</b>`;
    const can = live && !maxed && s !== null && s.coins >= cost;
    return `<button class="node ${maxed ? "owned" : can ? "ready" : "open"}" data-act="sbuy" data-v="${u.id}" ${can ? "" : "disabled"}>
      <strong>${esc(u.name)} <span class="pips inline">${pips}</span></strong><span>${esc(u.text)}</span><em>${maxed ? "max level" : `${cost} coins`}</em></button>`;
  }).join("");
  return `<section class="tree"><h2>Upgrade shop</h2>
    <p class="note">${s ? "Spend coins on upgrades that last until you prestige." : "Start a session to buy upgrades."}</p>
    <div class="branches one">${rows}</div></section>`;
}
