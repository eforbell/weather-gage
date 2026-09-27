# Weather Gage

A browser-first naval command game: issue squadron orders, work from imperfect contact reports, and let captains fight the engagement. Inspired by the supplied **Naval strategy game concept**, with modern surface warfare brought into the first playable build.

**Status:** playable scaffold, not a finished naval simulator. Single player, three scenarios across three eras (sail, WWI dreadnought, near-future missile), animated combat, abstract balance values. No accounts, telemetry, external fonts, runtime dependencies, or remote services.

## Play locally

Requires **Node.js 22+**. No `npm install` is needed.

```sh
cd /Users/forbell/workspace/weather-gage
npm run dev
```

Open **http://127.0.0.1:4173**. Use `PORT=4174 npm run dev` if needed. The development server binds only to your computer. Static files can later be deployed to an ordinary web host; opening `index.html` with `file://` will not work with ES modules.

1. Read the sealed orders and return to the chart.
2. Select a ship in **Your squadron**. Check **Entire squadron** to address both ships.
3. Issue **Engage**, **Form line**, **Screen**, **Hold**, **Proceed**, or **Withdraw**.
4. For **Proceed**, click a sea hex or enter Q/R coordinates and choose **Plot**.
5. **Advance tick** resolves one step; **Run** starts a pauseable clock at the chosen **Pace**. New contacts pause it automatically. Movement, gunfire, hits, torpedoes and sinkings play out on the chart; **Sound** toggles synthesized effects.
6. Adjust engagement range, hold-fire doctrine and withdrawal threshold. In the modern scenario, decide when to use active radar.
7. Review the dispatch at mission end. **New sortie** restarts; the mission selector switches eras. Both start a fresh game, so save/export first if you want to keep the current sortie.

Keyboard: **Space** run/pause, **N** advance, outside form controls. Native controls work with Tab/Enter. The coordinate inputs are the keyboard alternative to map clicking.

## Three eras, one simulation

- **Weather Gage off Nevis:** sail movement affected by wind, facing and broadside arcs, signal delay, four damage tracks, autonomous captains. Inspired by history, not a reconstruction of the 1799 duel.
- **Smoke over the Dogger Bank (1915):** a battlecruiser, a battleship and two destroyers against a German raiding force. Speed classes, turret arcs (cross the T), fire-control ranging, armour, torpedo attacks, wireless that gives away your flagship, smoke that blinds gunlayers firing downwind, declared minefields. Inspired by Dogger Bank, not a reconstruction. See [the era extension report](docs/era-extension.md).
- **The Strait of Qamar:** fictional near-future surface action, active radar and passive detection, emission tradeoffs, finite missile magazines, delayed missile impacts and defensive interceptors.

All three have fog-of-war reports, last-known contacts, doctrine, terrain, deterministic seeded randomness and a mission debrief. Turn-stepping and real-time presentation call the same fixed-tick engine.

## Save and resume

**Save locally** stores one sortie in this browser, at this exact origin. **Load save** resumes it paused. **Export / Import** moves a versioned JSON save between browsers. Browser storage can be unavailable or cleared; exports are the portable backup. Saves contain complete simulation state, including enemy information; this is not an anti-cheat boundary.

## Verify

```sh
npm test       # Node's built-in regression tests
npm run check  # syntax/static parsing of all source, tests and scripts
```

No compiler/linter package is installed. `check` is a syntax check, not a claim of TypeScript or comprehensive lint coverage. Browser smoke evidence and known verification limits are in [docs/verification.md](docs/verification.md).

## Repository map

```text
src/sim/engine.js       Pure simulation, player views, commands, saves, fx events
src/sim/dreadnought.js  WWI era rules: movement, gunnery, torpedoes, detection
src/sim/scenarios.js    Scenario metadata, ship configurations, maps
src/ui/app.js           Browser controls, SVG chart and dialogs
src/ui/fx.js            Combat animation and synthesized sound (presentation only)
src/ui/advisor.js       Flag lieutenant advice, tactics primer, debrief lessons
src/ui/style.css        Paper-and-ink visual system, responsive layout
scripts/serve.mjs       Local static development server
scripts/check.mjs      Dependency-free JavaScript syntax checks
tests/                 Simulation regression tests
reference/             Original concept/prototype exports, preserved
DESIGN.md              Product and interface design contract
docs/                  Review, architecture, roadmap, validation
```

## Why a browser?

It offers a low-friction way to play on desktop operating systems and share a static deployment, while the DOM-free simulation remains portable to a future desktop shell. This first version uses native JavaScript modules, SVG, and HTML rather than a game framework. The small board does not need a GPU renderer yet. A typed content schema and dedicated rendering engine can be introduced when justified by scale—not before.

The concept recommended TypeScript and Pixi/Canvas; this build deliberately starts with dependency-free ES modules to stay immediately runnable. Browser modules require HTTP serving ([MDN modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)); local saves are best-effort browser storage ([MDN Web Storage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API)).

## What's deliberately not here yet?

Campaigns, fitting-out, direct Take Command controls, shot selection, historical balance, full line-of-sight/weather/signal obstruction, aircraft, submarines, torpedoes, decoys, multiplayer, desktop packaging, and ironclad content. The first two era models are intentionally small and still share explicit era branches; a complete plug-in registry is a next step, not a claim of this scaffold.

See [concept review](docs/concept-review.md), [architecture](docs/architecture.md), and [roadmap](docs/roadmap.md).
