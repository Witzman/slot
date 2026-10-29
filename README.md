# SLOT

A casino-style game for the web browser that combines a slot machine, video poker and a coin pusher. It is in its first steps: the engine is in place, the game is not built yet.

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

- **Start:** the engine of the Pinball project (physics, rules, game flow, audio, renderer, storage) with a demo table.
