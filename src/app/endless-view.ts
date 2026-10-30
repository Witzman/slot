import { ENDLESS_SHOP, MILESTONES, MILESTONE_MUL, PRESTIGE_AT, canPrestige, prestigeChips, prestigeMul } from "../game/endless";
import { upgradeCost } from "../game/content";
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
    <div class="stat"><span>Spins</span><strong>${s.spins}</strong></div>
    <div class="stat wide"><span>Milestone ${s.milestones}/${MILESTONES.length}${next === undefined ? " · all reached" : ` · ${s.totalEarned}/${next} won`} <em>(${pct}%)</em></span><div class="bar"><div style="width:${pct}%"></div></div></div>
    <div class="stat"><span>Prestige</span><strong>×${prestigeMul(s.prestige).toFixed(2)}</strong></div>`;
}

/** Below the reels: free spins, auto-spin and the prestige button. */
export function endlessPanel(v: View): string {
  const s = v.session;
  if (!s) return "";
  const rate = v.mods.autoRate;
  const auto = rate > 0 ? `<button data-act="auto" class="${s.autoOn ? "active" : ""}">${s.autoOn ? "Auto-spin on" : "Auto-spin off"} <small>${rate} per second</small></button>` : `<p class="hint">Auto-spin is a node of the Economy tree (bought with prestige chips).</p>`;
  const open = canPrestige(s);
  const chips = prestigeChips(s.milestones);
  const prestigeBtn = open
    ? `<button class="big" data-act="prestige">PRESTIGE <small>start over with +${chips} chips and ×${prestigeMul(s.prestige + 1).toFixed(2)} wins</small></button>`
    : `<p class="hint">Prestige opens at milestone ${PRESTIGE_AT} of ${MILESTONES.length}. Each milestone makes every win ${Math.round((MILESTONE_MUL - 1) * 100)}% bigger.</p>`;
  return `${auto}${prestigeBtn}`;
}

export function endlessShop(v: View): string {
  const s = v.session;
  const live = s !== null && !v.ui.busy;
  const rows = ENDLESS_SHOP.map((u) => {
    const level = s?.upgrades[u.id] ?? 0;
    const maxed = level >= u.max;
    const cost = upgradeCost(u, level);
    const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < level ? "on" : ""}"></i>`).join("");
    const can = live && !maxed && s !== null && s.coins >= cost;
    return `<button class="node ${maxed ? "owned" : can ? "ready" : "open"}" data-act="sbuy" data-v="${u.id}" ${can ? "" : "disabled"}>
      <strong>${esc(u.name)} <span class="pips inline">${pips}</span></strong><span>${esc(u.text)}</span><em>${maxed ? "max level" : `${cost} coins`}</em></button>`;
  }).join("");
  return `<section class="tree"><h2>Upgrade shop</h2>
    <p class="note">${s ? "Spend coins on upgrades that last until you prestige." : "Start a session to buy upgrades."}</p>
    <div class="branches one">${rows}</div></section>`;
}
