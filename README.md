# SLOT

A casino-style game for the web browser that is a slot machine roguelike: every run is a series of rounds at the reels; you pay a rising quota, pick charms and buy upgrades; between runs you spend chips on a tech tree, finish missions and achievements, and collect and combine relics.

It runs in any modern browser with no install and no account.

**Play:** the site is published from this repository with GitHub Pages (<https://witzman.github.io/slot/>).

## Run it yourself

You need Node.js.

```
npm install
npm run dev        # a local server with live reload
npm test           # the test suite
npm run typecheck
npm run build      # a static site in dist/
npm run budget     # checks the download size limits
```

The engine is deterministic: a fixed 1 ms physics step, a seeded random generator, and recorded games can be replayed exactly. Tables are plain data, the rules are a small script over events, and the 3D view (PlayCanvas, with a plain canvas fallback) only reads snapshots of the game and never changes it.

## Changelog

Newest first. A short summary of what was added, no details.

- **Balance:** the numbers of the old three-game version are void (#10); the balance is measured again when the new engine is in.
- **Relic perks and run events:** equip relics for passive bonuses before a run; between rounds a crossroads event offers two choices, with curses as the price.
- **Bosses and stakes:** every third round is a boss round with its own rule and a higher quota; beating a boss pays tickets, chips and a relic and unlocks harder stakes.
- **Charm shop:** run tickets, a shop next to the free charm call, per-symbol charms, 41 charms in all.
- **Playable prototype:** slot machine only (pusher and poker were removed in #10), quota rounds, charm draft, coin upgrades, tech tree, missions, achievements, relics you can combine, saved in the browser.
- **Start:** the engine of the Pinball project (physics, rules, game flow, audio, renderer, storage) with a demo table.
