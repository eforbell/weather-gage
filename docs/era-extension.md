# Era extension report: adding WWI (dreadnought) and the ironclads — 2026-09-27

The **Smoke over the Dogger Bank** scenario was built as a probe: how much of the platform survives contact with a new era, and what had to change?

## What carried over unchanged
- Fixed-tick scheduler, seeded RNG, immutable `step`, save/load, deterministic replay tests.
- Contact model (sighted → classified → identified, stale last-known markers) and the fog-of-war redaction of dispatches.
- Order verbs (engage, line, screen, hold, proceed, withdraw), doctrine (ROE, preferred range, withdraw threshold), the signal queue.
- Four damage tracks, strike/sink resolution and outcome scoring. The only change was an optional per-ship `value` weight (capital ships ×3).
- Terrain and hex geometry. `mines` was added as a third terrain type with no structural change.

## What needed an era module (`src/sim/dreadnought.js`, ~250 lines)
| Concern | Sail | Dreadnought |
|---|---|---|
| Movement | 1 hex/tick, wind blocks headings, ships stop to fire | Speed classes in half-hexes/tick (1, 1½, 2), turn-rate limits, ships always under way |
| Arcs | Broadside only | All turrets abeam, half fore/aft, so crossing the T emerges from geometry |
| Gunnery | One broadside roll | Shots × hit probability by range band, fire-control ranging over salvos, reset by hard turns |
| Damage | Uniform | Calibre vs. armour table; battlecruiser magazine flash risk |
| Weapons in flight | — | Torpedoes as pending events aimed at a predicted position; turning spoils the solution |
| Detection | Lookout ranges | Funnel smoke on horizon, gun-flash detection, wireless direction-finding |
| Signals | Flag delay by distance from flagship | Wireless: 1 tick, 8% garble, transmission reveals the flagship |
| Wind | Movement | Smoke drifts downwind and blinds gunlayers firing that way |

The engine gained four dispatch points (`moveShips`, `resolveCombat`, contact `detection`, pending `torpedo` delivery), plus validation hooks. This is the "era registry" the roadmap predicted, done by hand.

## The name
"Weather gage" still works in WWI, and the scenario teaches why: the wind still decides the fight, but it **inverts**. In sail you want to be upwind. In 1915 your own funnel and gun smoke blow downwind, so the favoured position is to leeward (at Dogger Bank the British squadron was hampered by exactly this). In modern warfare the phrase survives as a metaphor for the position of advantage. The title can stay.

## Frictions found (fix before WWII)
1. **Era branching is still `if (era === …)`** in four engine functions. A third era module confirms the shape; extracting `{ move, combat, detect, resolvePending, validateShip }` into a registry is now low-risk.
2. **Helpers are shared by circular import** (`engine.js` ⇄ `dreadnought.js`). It works because the helpers are hoisted function declarations. Moving the helpers into a `core.js` module removes that fragility.
3. **The map is a fixed 20×14.** At 1 nm/hex that is barely a WWI gunnery range. WWII carriers and radar (100+ nm) need either larger maps or multi-scale zoom.
4. **One target per battery per tick.** Fine at this size; fleet actions will want engagement channels.
5. **Captains are local heuristics.** Formation orders needed a patch so ships still fight in line. A doctrine-driven behaviour tree will be needed for bigger fleets.
6. **Pending events are ad hoc** (`missile`, `torpedo`). WWII (aircraft strikes, shell flight, submarines) needs a general "entity in flight" type with a position, not just a delivery tick.

## Second probe: the ironclads (Iron at Hampton Roads, 1862)
Adding the ironclad era after WWI tested whether frictions 1 and 2 were real. They were, so both are now fixed:
- **Era registry.** `ERA_RULES` in `engine.js` maps an era to a module that can provide `validateShip`, `onOrder`, `orderDelay`, `beforeTick`, `moveShip`, `afterMove`, `combat` and `detection`. Ironclad and dreadnought use it; sail and modern still use the engine's built-in rules and are the next to move out.
- **No import cycle.** Shared primitives now live in `src/sim/core.js`, and steam movement (speed classes, turn rate, draught, minefields) lives in `src/sim/eras/steam.js`, shared by both steam eras.
- **Platform features added generically:** reserve ships that arrive at a set tick (the Monitor), per-scenario victory lists (`meta.victory = { enemy, own }`) scored only on decisive ships at the time limit, deep draught vs shoals, and ships at anchor (`speed: 0`).
- **Era-specific rules (≈200 lines):** armour against shell vs solid shot, the ram (beam-on vs glancing, may be lost, cooldown), fire aboard wooden ships, raking fire against bow and stern, flag signals slowed by gun smoke, and simultaneous (WEGO) resolution, where every ship fires on the same picture and damage lands together.

The ironclad module needed no engine changes beyond the hooks, which suggests the registry shape is right. WWII will test it against aircraft, which need entities in flight and a larger map (frictions 3 and 6).

### Hampton Roads balance (200 seeds)
| Plan | Win | Draw | Loss |
|---|---|---|---|
| Let the captains fight (gunboats start on Screen) | 77% | 22% | 1% |
| Send the gunboats straight in | 30% | 3% | 67% |

Virginia is almost never lost, which is true to history. Defeat comes from failing to finish the wooden ships before the Monitor and time run out.

## Dreadnought balance snapshot (200 seeds each, blue as admiral)
| Plan | Win | Loss |
|---|---|---|
| No orders | 65% | 35% |
| Capitals at preferred range 9 | 70% | 30% |
| Capitals in line | 64% | 36% |
| Destroyers held on Screen | 44% | 56% |
| Capitals detour north, then engage | 47% | 53% |

The default is forgiving, which suits a casual first WWI mission. Good gunnery doctrine helps a little, and holding back destroyers or wasting time maneuvering hurts. The gap between a good and a bad admiral is still too narrow. Widening it is the next balance task: stronger T-crossing and smoke effects, and a smarter red commander. The numbers are game abstractions, not historical claims.
