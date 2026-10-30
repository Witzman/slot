import { describe, expect, it } from "vitest";
import { dealSession, endlessMods, startSession } from "../../src/game/endless";
import { modsFor, newMeta } from "../../src/game/meta";
import { dealRound, startRun } from "../../src/game/run";
import { type UI, type View, hud, overlay, shopPanel, slotPanel, startScreen } from "../../src/app/view";

const ui = (over: Partial<UI> = {}): UI => ({ screen: "game", tab: "play", slotBet: 1, holdRows: new Set(), holdCols: new Set(), holdCells: new Set(), result: null, slotNote: "", overChips: 0, muted: false, picked: [], craftNote: "", stake: 0, setup: "classic", today: 20000, cardKind: "rank", ...over });
const climb = (over: Partial<View> = {}): View => {
  const meta = newMeta();
  const mods = modsFor(meta, "climb", []);
  return { mode: "climb", run: startRun(1, mods), session: null, meta, mods, ui: ui(), ...over };
};
const endless = (): View => {
  const meta = newMeta();
  const session = startSession(1, modsFor(meta, "endless", []), 0);
  return { mode: "endless", run: null, session, meta, mods: endlessMods(meta, session), ui: ui() };
};

describe("the start screen", () => {
  it("lists both modes with a text, a button and their numbers", () => {
    const html = startScreen(climb({ ui: ui({ screen: "start" }) }));
    expect(html).toContain("Climb");
    expect(html).toContain("Endless");
    expect(html).toContain('data-act="play" data-v="climb"');
    expect(html).toContain('data-act="play" data-v="endless"');
    expect(html).toContain("0 sessions");
    expect(html).toMatch(/Version \d/);
  });

  it("shows the numbers of each mode apart, and offers to continue what is running", () => {
    const v = climb({ ui: ui({ screen: "start" }) });
    v.meta.endless.stats = { sessions: 3, playMs: 5400000, spins: 700, endings: { prestige: 2 } };
    v.meta.endless.chips = 12;
    const html = startScreen(v);
    expect(html).toContain("3 sessions");
    expect(html).toContain("1 h 30 min played");
    expect(html).toContain("prestige 2");
    expect(html).toContain("Continue Climb");
    expect(html).toContain("Play Endless");
  });

  it("is what the overlay shows on the start screen, in either mode", () => {
    expect(overlay(climb({ run: null, ui: ui({ screen: "start" }) }))).toContain("Play Climb");
    expect(overlay({ ...endless(), session: null, ui: ui({ screen: "start" }) })).toContain("Play Endless");
  });
});

describe("the card board", () => {
  it("shows 25 card backs before a deal, and the toggles are off", () => {
    const html = slotPanel(climb());
    expect((html.match(/class="pc back"/g) ?? []).length).toBe(25);
    expect(html).toContain('data-act="deal"');
    expect(html).not.toContain('data-act="draw"');
    expect(html).toMatch(/data-act="holdrow" data-v="0" disabled/);
  });

  it("after a deal it offers the holds and the draw, with the hold limit", () => {
    const v = climb();
    dealRound(v.run!, v.mods, 1);
    const html = slotPanel(v);
    expect(html).toContain('data-act="draw"');
    expect(html).toContain("lines 0/2");
    expect(html).not.toMatch(/data-act="holdrow" data-v="0" disabled/);
    expect((html.match(/class="pc[ "]/g) ?? []).length).toBe(25);
  });

  it("single cards are clickable only with the node", () => {
    const v = climb();
    dealRound(v.run!, v.mods, 1);
    expect(slotPanel(v)).toMatch(/data-act="holdcell" data-v="0" disabled/);
    v.mods.singleHold = true;
    expect(slotPanel(v)).not.toMatch(/data-act="holdcell" data-v="0" disabled/);
  });

  it("works for an endless session too: no turns, a free round when the wallet is empty", () => {
    const v = endless();
    expect(slotPanel(v)).toContain("coins");
    expect(slotPanel(v)).not.toContain("1 turn");
    v.session!.coins = 3;
    expect(slotPanel(v)).toContain("a free base round");
    dealSession(v.session!, v.mods, 1);
    expect(slotPanel(v)).toContain('data-act="draw"');
  });
});

describe("the other panels", () => {
  it("the hud shows the mode switch and the chips of the mode on screen", () => {
    const v = climb();
    v.meta.climb.chips = 7;
    v.meta.endless.chips = 99;
    expect(hud(v)).toContain("7</strong>");
    const e = endless();
    e.meta.endless.chips = 99;
    expect(hud(e)).toContain("99</strong>");
    expect(hud(e)).toContain("Milestone 0/10");
    expect(hud(v)).toContain('data-act="mode" data-v="endless"');
  });

  it("the shop of each mode sells its own upgrades and the card upgrades", () => {
    expect(shopPanel(climb())).toContain("Better Odds");
    expect(shopPanel(climb())).toContain("Card upgrades");
    expect(shopPanel(endless())).toContain("More Holds");
    expect(shopPanel(endless())).toContain("Card upgrades");
  });
});

describe("run structure on screen", () => {
  const fresh = (over: Partial<View> = {}): View => climb({ run: null, ...over });

  it("offers the start decks and challenges before a run, locked ones with the way to open them", () => {
    const html = overlay(fresh());
    expect(html).toContain('data-act="setup" data-v="classic"');
    expect(html).toContain("Lean Deck");
    expect(html).toMatch(/disabled><strong>Lean Deck<\/strong><span>Locked: Finish a run\./);
    expect(html).toContain("Thin Air");
    expect(html).toContain('data-act="daily"');
  });

  it("opens a deck once its condition is met, and marks a cleared challenge", () => {
    const v = fresh();
    v.meta.runs = 1;
    v.meta.challenges = ["tight"];
    const html = overlay(v);
    expect(html).not.toMatch(/disabled><strong>Lean Deck/);
    expect(html).toMatch(/<em>cleared<\/em>/);
    expect(overlay({ ...v, ui: ui({ setup: "lean" }) })).toContain("Start Lean Deck");
  });

  it("shows the daily result of today and of the last time", () => {
    const v = fresh();
    v.meta.daily = { day: 20000, best: 7, prev: 5 };
    expect(overlay(v)).toContain("today 7 quotas · last time 5");
    v.meta.daily = { day: 19990, best: 4, prev: 0 };
    expect(overlay(v)).toContain("last time 4");
  });

  it("puts the voucher and the skip button in the shop after a round", () => {
    const run = startRun(1, modsFor(newMeta(), "climb", []));
    run.phase = "draft";
    run.draft = ["runner"];
    run.voucher = "v_hold1";
    run.tickets = 6;
    const html = overlay(climb({ run }));
    expect(html).toContain('data-act="buyvoucher" data-v="v_hold1"');
    expect(html).toContain('data-act="skip"');
    run.tickets = 5;
    expect(overlay(climb({ run }))).toMatch(/buyvoucher" data-v="v_hold1" disabled/);
  });

  it("marks the locked line and shuts the columns under the shackles", () => {
    const meta = newMeta();
    const run = startRun(1, modsFor(meta, "climb", []));
    run.lockedLine = 7;
    const mods = modsFor(meta, "climb", [], {}, "shackles");
    dealRound(run, mods, 1);
    const html = slotPanel(climb({ run, mods }));
    expect(html).toContain("aria-label=\"Hold column 3 (locked: pays nothing)");
    expect((html.match(/class="pc[^"]* dead/g) ?? []).length).toBe(5);
    expect(html).toContain("(not allowed this round)");
  });
});
