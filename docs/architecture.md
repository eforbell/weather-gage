# Architecture and extension boundaries

## Current choice
Browser-first, local single-player. Native ES modules and SVG keep deployment static and avoid a framework/build-tool dependency. Node is only needed for the supplied local server and tests. The simulation has no DOM, browser storage, network, timers, or unseeded randomness.

This is a small functional architecture, not a complete generic game engine. Two explicit era models prove different gameplay using a common state and clock. They should be extracted behind a registry as the third era or additional weapon families arrive.

## Data flow

```text
scenario metadata + ship/map definitions
                 ↓
           createGame(seed)
                 ↓
UI command → immutable command API → queued signal
                 ↓
        step(state): one fixed tick
                 ↓
       getView(state, player side)
                 ↓
       SVG chart + HTML controls
```

The UI clock calls `step` once per second when running; manual stepping calls the same function. There is no separate real-time rules implementation. Backgrounding the page pauses the clock.

## Public API
`src/sim/engine.js` exports:

- `createGame(scenarioId, seed)` — initializes versioned state.
- `step(state)` — resolves a complete tick without mutating the input.
- `issueOrder(state, shipIds, order)` — queues an order with era-dependent delivery time.
- `setDoctrine(state, shipIds, patch)` — updates rules of engagement, preferred range and withdrawal threshold.
- `setRadar(state, shipIds, enabled)` — toggles modern active radar.
- `getView(state, side)` — own ships and contact reports, not opponent ship state.
- `serialize(state)` / `deserialize(text)` — stable versioned save/load.
- `distance(a, b)` / `isActive(ship)` — common geometry/status queries.

Orders are `engage`, `hold`, `line`, `screen`, `withdraw`, or `proceed` with axial `q,r`. The map uses six facings in this order: E, SE, SW, W, NW, NE. Coordinate bounds and map dimensions belong to this first scenario format, not a promise of an unbounded map engine.

## State and information boundaries
Ship state has hull, propulsion, weapons, and crew tracks. A ship has status, facing, doctrine, an order, and finite modern magazine/defense resources. The map and own ship status are known; opponent reports contain confidence, last-observed coordinates, and observation time. The UI must not inspect opponent entries in `state.ships` for rendering.

Missiles in flight are simulation-owned pending events, distinct from visible pending command signals. Saves intentionally include authoritative state so they can resume exactly; local files are not multiplayer-safe or secret.

The deterministic RNG state is saved with the game. No action depends on wall-clock time. A future replay format should store initial scenario/version/seed plus commands with tick timestamps; replays are not implemented yet.

## Era rule registry (2026-09-27)
`src/sim/core.js` holds DOM-free shared primitives: hex geometry, seeded RNG, damage, status, dispatch redaction and per-side fx. `ERA_RULES` in `engine.js` maps era names to modules in `src/sim/eras/` that supply optional hooks: `validateShip`, `onOrder`, `orderDelay`, `beforeTick`, `moveShip`, `afterMove`, `combat` and `detection`. The engine keeps the tick order, contacts, signals, reserves, outcomes and saves. `eras/steam.js` holds movement shared by the ironclad and dreadnought eras. Sail and modern rules still live inside `engine.js`.

## Extension sequence
1. Extract current movement, sensing, weapons, signals, and scenario outcome functions behind an era registry. Keep the tick scheduler and contact model common.
2. Replace ship-specific weapon fields with validated sensor/weapon loadout definitions, leaving instance ammo/cooldown in state.
3. Separate detection, classification and fire-control quality. Add track uncertainty, passive bearings, emissions signatures and datalink quality.
4. Add salvo/projectile entities, decoys and engagement channels before expanding into aircraft/submarines. Avoid a single global “modern” branch for every future platform.
5. Add content schemas and migration tests before campaigns. Introduce TypeScript/build tooling only as a deliberate repository-wide decision.

## Known abstraction limits
No real horizon, land occlusion, jamming, missile guidance/seeker simulation, formation collision prediction, layered command hierarchy, physical speed/distance fidelity, or network play. Wind and signals are simplified tick rules. Doctrine/radar changes are immediate rather than traveling through the signal channel. Tactical movement is local heuristic planning, not global route finding; terrain can produce stalls. The development server is not a production hosting service.
