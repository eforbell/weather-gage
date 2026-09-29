# Weather Gage

A browser-first naval command game: issue squadron orders, work from imperfect contact reports, and let captains fight the engagement. Inspired by the supplied **Naval strategy game concept**, with modern surface warfare brought into the first playable build.

**Status:** playable scaffold with an experimental Three.js battle camera on `prototype/three-battle-view`, not a finished naval simulator or a production art pass. Single player, six scenarios across sail, ironclad, WWI dreadnought, Cold War undersea/escort, and near-future missile eras. Combat and balance values are abstractions. No accounts, telemetry, external fonts, or remote services.

## Play locally

Requires **Node.js 22.12+**. This branch adds Three.js and Vite; install the pinned dependencies first.

```sh
cd /Users/forbell/workspace/weather-gage
npm ci
npm run dev
```

Open **http://127.0.0.1:4173**. The development server binds only to your computer. Use `npm run build` to create self-contained static files in `dist/`; `npm run preview` serves that build locally. Opening `index.html` with `file://` will not work with ES modules.

1. Pick a mission in the **chart room** (the **Missions** button reopens it), read the sealed orders, and return to the chart.
2. Select a ship in **Your squadron**. Check **Entire squadron** to address the group.
3. Issue **Engage**, **Form line**, **Screen**, **Hold**, **Proceed**, or **Withdraw**.
4. For **Proceed**, click a sea hex or enter Q/R coordinates and choose **Plot**.
5. **Advance tick** resolves one step; **Run** starts a pauseable clock at the chosen **Pace**. New contacts pause it automatically. Movement, gunfire, hits, torpedoes and sinkings play out on the chart; **Sound** toggles synthesized ambience and effects.
6. Choose **Go to the battle · 3D** above the chart for an orbitable ship view. Drag to orbit, scroll or pinch to zoom, and select a ship in the roster to follow it. Orders and the clock still work; use **Return to chart** for exact hex plotting. Surface cameras do not show submerged boats; underwater cameras show only the selected boat and nearby friendlies at the same depth. Cold War sonar contacts stay in the chart/list because their depth is not reported. If WebGL is unavailable, the chart remains playable.
7. Adjust engagement range, hold-fire doctrine and withdrawal threshold. In the modern scenario, decide when to use active radar.
8. In **The Northern Screen**, select the carrier to launch a limited patrol flight toward a Q/R sector. Its report arrives two ticks later on the carrier’s picture, not on every submarine’s sonar.
9. Review the dispatch at mission end. **New sortie** restarts; the mission selector switches eras. Both start a fresh game, so save/export first if you want to keep the current sortie.

Keyboard: **Space** run/pause, **N** advance, outside form controls. Native controls work with Tab/Enter. The coordinate inputs are the keyboard alternative to map clicking.

## Five eras, one simulation

- **Weather Gage off Nevis:** sail movement affected by wind, facing and broadside arcs, signal delay, four damage tracks, autonomous captains. Inspired by history, not a reconstruction of the 1799 duel.
- **Iron at Hampton Roads (1862):** CSS Virginia and two gunboats against the wooden blockade: Cumberland and Congress at anchor, Minnesota under steam. An unknown contact arrives mid-action. Armour against shell, the ram (beam-on or glancing), fires aboard wooden ships, deep draught barred by shoals, raking anchored ships, flag signals slowed by gun smoke, simultaneous fire. Inspired by the 1862 battle, with both days compressed into one sortie.
- **Smoke over the Dogger Bank (1915):** a battlecruiser, a battleship and two destroyers against a German raiding force. Speed classes, turret arcs (cross the T), fire-control ranging, armour, torpedo attacks, wireless that gives away your flagship, smoke that blinds gunlayers firing downwind, declared minefields. Inspired by Dogger Bank, not a reconstruction. See [the era extension report](docs/era-extension.md).
- **The Defector (1984):** a fan scenario inspired by *The Hunt for Red October*. You command USS Dallas; Red October (a third party, neither friend nor foe) runs a seabed canyon toward a rendezvous while the Alfa-class Konovalov hunts her. Passive sonar with uncertainty rings, the baffles and Crazy Ivans, the thermal layer, one ping only (which can put the defector under your command), torpedoes that seek the loudest boat, friend or foe, and can fail to arm, noisemakers, peacetime rules of engagement, and scripted sabotage and surfacing.
- **The Northern Screen (1986):** a fictional carrier escort on a larger 30×18 chart. Two ASW destroyers and two attack submarines screen a light carrier against three hostile boats. Surface escorts can ping and fire limited ASW torpedoes; the carrier launches four delayed patrol flights. Every vessel retains its own contact picture. Get the carrier to the eastern rendezvous before she is lost or time runs out.
- **The Strait of Qamar:** fictional near-future surface action, active radar and passive detection, emission tradeoffs, finite missile magazines, delayed missile impacts and defensive interceptors.

All scenarios have fog-of-war reports, last-known contacts, doctrine, terrain, deterministic seeded randomness and a mission debrief. Turn-stepping and real-time presentation call the same fixed-tick engine.

## Save and resume

**Save locally** stores one sortie in this browser, at this exact origin. **Load save** resumes it paused. **Export / Import** moves a versioned JSON save between browsers. Browser storage can be unavailable or cleared; exports are the portable backup. Saves contain complete simulation state, including enemy information; this is not an anti-cheat boundary.

## Verify

```sh
npm test       # Node's built-in regression tests
npm run check  # syntax/static parsing of all source, tests and scripts
npm run build  # bundle the 3D renderer for static hosting
```

No TypeScript compiler/linter package is installed. `check` is a syntax check, not a claim of comprehensive lint coverage. See [the 3D prototype notes](docs/3d-prototype.md) for scope, costs, and known gaps.

## Repository map

```text
src/sim/engine.js       Pure simulation, player views, commands, saves, fx events
src/sim/core.js         Shared rule primitives: hex math, seeded RNG, damage, dispatches, fx
src/sim/eras/           Era rule modules (registry): ironclad, dreadnought, coldwar, shared steam movement and route finding
src/sim/scenarios.js    Scenario metadata, ship configurations, maps
src/ui/app.js           Browser controls, SVG chart and dialogs
src/ui/battle-presentation.js  Fog-safe actors from the selected ship's player view
src/ui/battle-3d.js    Optional Three.js camera, sea, lighting, and combat effects
src/ui/battle-models.js  Procedural 3D ship models
src/ui/fx.js            Combat animation and synthesized sound (presentation only)
src/ui/advisor.js       Flag lieutenant advice, tactics primer, debrief lessons
src/ui/style.css        Paper-and-ink visual system, responsive layout
scripts/serve.mjs       Legacy dependency-free server retained for server tests
scripts/check.mjs      Dependency-free JavaScript syntax checks
tests/                 Simulation regression tests
reference/             Original concept/prototype exports, preserved
DESIGN.md              Product and interface design contract
docs/                  Review, architecture, roadmap, validation
```

## Why a browser?

It offers a low-friction way to play on desktop operating systems and share a static deployment, while the DOM-free simulation remains portable to a future desktop shell. The tactical chart remains SVG; this branch adds a lazy-loaded GPU renderer only when the player enters the 3D camera.

The original scaffold was dependency-free. The 3D experiment follows the [official Three.js installation approach](https://threejs.org/manual/pages/installation.html) with Vite, retaining the pure simulation and ordinary static deployment. Local saves are best-effort browser storage ([MDN Web Storage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API)).

## What's deliberately not here yet?

Campaigns, fitting-out, direct Take Command controls, shot selection, historical balance, full line-of-sight/weather/signal obstruction, individually flown aircraft or air combat, multiplayer, desktop packaging, and a WWII era. The era models remain deliberately small; a complete plug-in registry is a next step, not a claim of this scaffold.

See [concept review](docs/concept-review.md), [architecture](docs/architecture.md), and [roadmap](docs/roadmap.md).
