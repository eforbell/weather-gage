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

## Third probe: Cold War submarines (The Defector, 1984)
Design sketch: `docs/design/cold-war-submarines.md`. The approach was to lay down the obvious rules, run 200 seeds per plan, and let the harness say what was missing. It found gaps in order:

| # | What the harness showed | Rule or platform change it forced |
|---|---|---|
| 1 | Nobody ever fired: the hunter circled the American boat it wasn't at war with | Captains close only on contacts their side is **hostile** to (engine, all eras) |
| 2 | An Alfa at flank speed never heard the Typhoon | **Sprint and drift**: hunters with no contact slow every third tick to listen |
| 3 | Each Crazy Ivan left Red October pointing backwards and she never arrived | A Crazy Ivan listens down the baffles and costs one tick; heading is kept |
| 4 | Hunters searched the wrong half of the ocean | Scenario **search areas** (`searchAt`) as captains' intelligence |
| 5 | Konovalov stuck behind a ridge, then behind Dallas parked in the gap | Breadth-first **route finding** shared by all steam-and-later eras, treating other boats as obstacles |
| 6 | A damaged Red October "withdrew" to a map corner | Ships with a **goal** limp toward it instead of the red or blue map edge |
| 7 | Every seed played out identically | The sub rules used almost no randomness. **Seeded variation** now comes from a hash that includes the seed (fading contacts at the limit of hearing, Crazy Ivan and drift timing) |
| 8 | Red October escaped 98% of the time | **Scripted scenario events**: sabotage of the caterpillar drive, then forced surfacing. Each seed picks a tick in the event's window |
| 9 | Nothing Dallas did changed the outcome | **Command transfer**: one ping near Ramius gets an answer, and his boat and sonar picture join the player's command |
| 10 | Dallas still couldn't legitimately defend her | **Protection**: attacking a boat under a side's command makes that side hostile too |

Platform capabilities added in the process, usable by every era:
- More than two sides, a changing hostility table, and command of another side's ships.
- Contacts with **position uncertainty** that shrinks while held (target motion analysis) and can be misclassified.
- **Entities**: weapons and decoys that move, seek, arm and run out.
- Scripted events with seeded timing, goal hexes, escort victory conditions, and map marks.
- One-shot sensor actions (`activePing`), and doctrine speed and depth.

### The Defector balance (200 seeds, win / draw / loss)
| Plan | Result |
|---|---|
| Let the captains fight | 49 / 5 / 46 |
| Fire on Konovalov first | 52 / 2 / 46 |
| Escort loud (shadow the unknown at flank speed) | 82 / 5 / 14 |
| Close on the "seismic noise" and ping for contact | 83 / 8 / 9 |

Before the fog-of-war review, firing first was clearly punished (28% wins). Once captains could no longer read a contact's true side, a reckless Tupolev started shooting at unidentified contacts, sometimes Dallas. The war tends to come whether or not you start it. That emerged from making the information model honest, and it fits the character.

### What the review taught (information-model rules, now enforced by tests)
- Public contact ids are opaque per game and side; they don't name the ship or its side.
- Effects place other ships at the side's *reported* position, never the true one.
- Position scatter and wobble include the game seed, so they can't be reversed from the view.
- Captains believe what their side knows: with third parties, a contact's side is only known once identified, and route finding avoids only own ships and reported contacts.
- Scripted events reach the audience the scenario names, even unobserved.

Route finding also changed the older steam scenarios: the Union ships at Hampton Roads now find their way around shoals. Hampton was re-tuned (Virginia's battery 12, Minnesota's 16): captains alone win 63%, and sending the gunboats in wins 14%.

### Still missing (next discoveries)
- Each side still shares one sonar picture. A boat-by-boat picture with sharing by communication would make "one ping" even more meaningful.
- The seeker is a cone and a noise contest. Wire cuts, re-attack patterns and torpedo speed versus a boat's evasion speed are not modelled.
- Red October's captain uses the platform's generic goal-seeking. A real Ramius would read the threat picture and take a different route.
- Towed arrays, convergence zones, surface ships and aircraft (the WWII groundwork).
