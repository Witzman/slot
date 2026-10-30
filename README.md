# CARD SLOT

A casino-style game for the web browser that is a card slot machine roguelike: a 5x5 board of cards where every row and column is a poker hand and the hands add up; you hold lines, draw, and pay a rising quota, pick charms and buy upgrades; between runs you spend chips on a tech tree, finish missions and achievements, and collect and combine relics.

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

The rules are deterministic: a seeded random generator drives the deck, and a run or an Endless session is a pure function of its seed and the calls made on it. The rules live in `src/game` (no browser code), the screen in `src/app`. `tools/sim` plays whole runs with simulated players to measure the balance (`npx tsx tools/sim/balance.ts smart 10 fresh`, `npx tsx tools/sim/endless.ts 3`).

## Changelog

Newest first. A short summary of what was added, no details.

- **Two modes (#10):** *Climb* (runs with a rising coin quota, charms and bosses, about 20 minutes or more) and *Endless* (no quota, upgrades, milestones, prestige, auto-play, about 45 minutes to the first prestige), chips and tech tree separate in each; a start screen with the numbers of both to compare.
- **Card upgrades and a four-branch tree (#10):** rank-ups, gold, any-suit and jokers on single cards; Hold, Cards, Hands and Economy branches; 34 achievements.
- **Cards instead of symbols (#10):** a 5x5 board where every row and column is a poker hand and the hands add up; hold lines, draw, only the last draw pays.
- **Balance:** measured with simulated players (`tools/sim`): a competent bot plays a median Climb run of 23 minutes and reaches the first Endless prestige after about 52.
- **Relic perks and run events:** equip relics for passive bonuses before a run; between rounds a crossroads event offers two choices, with curses as the price.
- **Bosses and stakes:** every third round is a boss round with its own rule and a higher quota; beating a boss pays tickets, chips and a relic and unlocks harder stakes.
- **Charm shop:** run tickets, a shop next to the free charm call, hand-pay charms, 24 charms in all.
- **Playable prototype:** a 5x5 card board with hold and draw (#10), quota rounds, charm draft, coin upgrades, tech tree, missions, achievements, relics you can combine, saved in the browser.
- **Start:** the engine of the Pinball project (physics, rules, game flow, audio, renderer, storage) with a demo table.
