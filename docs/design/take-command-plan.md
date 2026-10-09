# Take Command plan

Status: playable on `feature/take-command` (PR #27). First slice by Codex on 2026-10-06; standing-intent revision after playtest sweeps on 2026-10-08. Human playtesting remains open.
Last updated: 2026-10-08.

## Goal

Make Weather Gage more enjoyable by letting the player step down from fleet doctrine onto one vessel's quarterdeck. The feature should add agency, teach the tactical model, and create a stronger sense of ownership without becoming an action game or a more detailed realism simulator.

The player should feel: "I can see what my ship is about to do, I can see the opening her captain would miss, and when I take it the battle shows me it mattered."

The original design (`reference/Design Doc.dc.html` §4) gave Take Command "helm, sail, shot type and which broadside fires", applied with no signal delay, and §8 named raking as the sail era's geometry bonus. The `reference/Frigate Duel v2.dc.html` prototype implemented round/chain/grape shot and raking.

## Confirmed decisions

- Support both the sail and dreadnought eras.
- The player plans while paused, then the orders resolve on the same ordinary Advance tick as every other vessel.
- Take Command bypasses signal delay for the commanded vessel only. It grants no extra turns, moves, reloads, attacks, or hidden information.
- Do not add turret rotation, trigger timing, aim-point clicking, bridge art, or crew-station simulation.
- The rest of the squadron stays on its existing orders and AI doctrine.
- The feature teaches naval command language through XO forecasts and captain reports.

## What the playtest sweeps found in the first slice

The first slice reset every plan to *hold station / no target / weapons tight* after each turn, turned dreadnoughts in place without moving, and offered guns and torpedoes as alternatives. Scripted players using only the station (`scripts/sweep-command.mjs`, 100 seeds) showed that taking command made a ship worse than her own captain:

| Scenario, ship | Doctrine | Took command, did nothing | Followed the XO each turn |
|---|---:|---:|---:|
| Nevis, Constellation | 59% | 0% | 56% |
| The Line of Battle, Bellerophon | 61% | 0% | 1% |
| Dogger Bank, Lion | 73% | 7% | 3% |
| Dogger Bank, Orion | 73% | 1% | 8% |

(Blue win rates.) Causes, from traces:
- Entering command stopped the ship and silenced her guns. Forgetting to re-arm each turn left her as a target.
- A dreadnought's port/starboard turned her on the spot for the whole tick, while her captain turns and steams.
- The XO said guns were "Ready." while Lion lay end-on with Seydlitz crossing her T: readiness checked range, not arc.
- Torpedo warnings told players to turn when her captain's zig-zagging course already spoiled the aim (Lion was hit twice in 563 spreads over 200 games).

## Standing-intent design (2026-10-08)

Principle: **taking command never makes her worse by default; it hands you the levers her captain does not pull.**

- **Default is her captain.** On entry the helm is *Captain's course* and the guns are *fire at will at her captain's choice*. Taking command and changing nothing is move-for-move identical to doctrine (regression test across three scenarios and several seeds).
- **Orders stand until changed.** A one-point turn lasts one tick and the helm returns to *Steady*. Torpedo release is spent after one tick. A designated target stays until it leaves the plot, which is reported. A quiet turn is one click.
- **Helm.** Captain's course, Steady, Port, Starboard, Hard a-port/a-starboard (steam), Heave to/Stop engines. Sail: one point or one hex a turn, wind and rigging permitting, as her captain's. Steam: turns while steaming at her turn rate; a hard turn costs fire control as her captain's does. While the player holds the helm she does not withdraw on doctrine.
- **Target.** Sail: the broadside is kept for the designated ship. Dreadnought: the main battery stays on her and builds fire control. Destroyers keep light guns on light craft and keep torpedoes for the designated capital ship.
- **Shot (sail).** Round to 3 hexes (hull and guns, the doctrine load); chain to 2 (rigging); grape at 1 (crew; drives a ship to strike, which gives prizes).
- **Shared rules for every ship.** Raking ×1.25 from ahead and ×1.5 from astern. Shot-away rigging (under 40%) answers the helm only every other turn, which is what makes chain shot open raking windows. The Line of Battle's French crews moved from 95 to 92 so its doctrine baseline stays at 61%.
- **XO forecast.** From the side's own reports only. For each helm it gives the end-of-turn position and heading (drawn as a ghost on the chart), and for her captain's own course too. It covers arcs and range bands, raking and crossing-the-T openings, being raked or T-crossed, whether each course crosses an incoming torpedo track, a target switch that throws away fire control, and orders that would quietly achieve nothing. Each line has a tone: warn, good or info.
- **Debrief.** Raking broadsides given and taken; turns on the quarterdeck and broadsides or salvos fired from her.

## Playtest evidence for the revision

`npm run sweep:command -- 300 <scenario> [ship]`, 300 seeds. *Careless* takes the helm and holds a steady course. *Skilled* is described in the script header: a three-turn look-ahead for sail; for dreadnoughts it designates and keeps a capital, crosses the T, and leaves torpedo tracks.

| Scenario, ship | Doctrine | Idle in command | Careless | Skilled | Skilled detail |
|---|---:|---:|---:|---:|---|
| Nevis, Constellation | 61% | 61% | 0% | 63% | prizes appear (0.10/game) |
| The Line of Battle, Bellerophon | 61% | 61% | 1% | 67% | rakes 0.8 → 1.7/game |
| Dogger Bank, Orion | 66% | 66% | 55% | 73% | crossing the T 3.3 → 4.3/game |
| Dogger Bank, Lion | 66% | 66% | 36% | 68% | |
| Dogger Bank, Meteor | 66% | 66% | 72% | 66% | see open questions |

Lever-by-lever sweeps (scratch harness, 200–300 seeds) that shaped these choices:
- Re-designating the nearest capital every turn cost Lion 4 points: each switch throws away fire control. Keeping the designation turned it into +7 for Orion. The XO now warns before a switch.
- Turning away from every torpedo spread cost Lion 14 points. Turning only when the planned course crosses the track was neutral, so the XO reports risk per course instead of advising a turn.
- Shot types are worth nothing while her captain keeps the helm: doctrine fights stay at three hexes. They matter once the player closes the range. Grape at one hex produces the first struck prizes.
- A playtest in the browser left chain shot loaded for six turns with the enemy at three hexes, and the ship never fired. That is why the XO now flags wasted standing orders.

Sweeps measure scripted players, not people; a thoughtful human may find more or less. The aim is a curve: no penalty for taking command, real cost for careless orders, and a measurable gain for good ones.

## Engine contract

- `src/sim/engine.js` owns captain-control state, the public view (`captainControl`, `captainOptions` with `helm`, `weapons`, `shots`, `forecast`, `summary`), save/load validation, and resolution hooks.
- Era movement and combat decide what can happen. Sail helm uses the same wind/rigging rules as `bestStep`; steam helm calls `steamMove`; captain's course calls the same `autoMove` as every AI ship; dreadnought fire calls `dreadnought.shipCombat` with the player's intent.
- Hidden ship IDs never cross into the player view. Plans store public contact IDs and resolve them inside the simulation.
- Previews run ordinary rules on copies, against own ships and public reports. Sail and dreadnought reports are exact positions, so her captain's previewed course shows nothing the chart does not.
- Old saves without captain control load unchanged; plans saved without `shot` load with round shot; malformed controls are rejected.
- Entering command clears signals in flight to that ship, and fleet signals skip her until Return to flag (unchanged from the first slice). So "changing nothing equals doctrine" holds when no signal to her is in transit, and Captain's course follows the standing order she had on entry.
- The XO's torpedo-track forecast reads the spread's aim point. The target side could reckon it from its own course, speed and the public eta; only the firing side's *view* of the aim stays hidden.

## Implementation touchpoints

- `src/sim/engine.js`: captain control, standing intent, helm, sail shot and raking, XO forecast.
- `src/sim/eras/dreadnought.js`: `shipCombat` shared by AI and commanded ships; `manualFire`.
- `src/sim/scenarios.js`: The Line of Battle French crews 92.
- `src/ui/captain-panel.js`, `src/ui/captain-feedback.js`, `src/ui/app.js`, `src/ui/fx.js`, `src/ui/style.css`: station, XO, chart ghost, raking callouts, debrief.
- `scripts/sweep-command.mjs` (`npm run sweep:command`): the playtest harness.
- `tests/take-command.test.js`, `tests/captain-panel.test.js`, `tests/captain-feedback.test.js`.

## Risks and mitigations

- **Fog-of-war leak:** UI reads only `getView`; previews use public reports; tests assert no hidden IDs or names in the options.
- **Double movement or double fire:** the commanded ship is excluded from automatic movement and fire and acts once, in her own initiative slot.
- **Standing orders going stale:** helm turns expire after a tick, torpedo releases are spent, lost targets are dropped with a report, and the XO warns about orders that achieve nothing.
- **Balance drift from raking:** doctrine baselines re-measured; The Line of Battle retuned to its previous 61%.
- **Pause friction:** standing orders make each quiet turn a single click; the clock still stays paused while in command (a confirmed decision).

## Open questions and follow-ons

- Human playtests: do players find the raking and crossing-the-T openings without the XO pointing at them, and is per-turn pausing tolerable over a 50-turn action now that turns are one click?
- Whether to let the clock run while in command, with the standing orders carrying on and pauses on XO warnings. This would revisit the confirmed paused-planning decision, so it is the user's call.
- Port and starboard broadsides with separate reloads, so that breaking the line fires both (design doc §4).
- Meteor steaming straight away from the action wins more often (72%) than on doctrine (66%), which suggests the destroyer AI's attack runs cost more than they earn at Dogger Bank. This is an AI and scenario question, not a Take Command one.
- Whether signals should reach a commanded ship while her captain has the helm, so a player can change her standing order without returning to the flag.
- Boarding and prize crews; damage-control choices; Take Command for ironclads, WWII, Cold War and modern.
