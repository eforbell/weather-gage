# Take Command plan

Status: draft product plan; first playable prototype implemented and technically checked on `feature/take-command`, awaiting merge. Player playtesting and follow-on scope remain open.
Last updated: 2026-10-06.

## Goal

Make Weather Gage more enjoyable by letting the player step down from fleet doctrine into one vessel's captaincy for a single resolved turn. The feature should add agency, teach the tactical model, and create a stronger sense of ownership without becoming an action game or a more detailed realism simulator.

The player should feel: "I can see why this ship is or is not useful this turn, choose the captain's next intention, and then watch that decision resolve with the rest of the battle."

## Confirmed decisions

- Support both the sail and dreadnought eras in the first slice.
- The player plans while paused, then resolves the plan on the same ordinary Advance tick as every other vessel.
- Take Command bypasses signal delay for the commanded vessel only. It grants no extra turns, moves, reloads, attacks, or hidden information.
- Do not add turret rotation, trigger timing, aim-point clicking, bridge art, or crew-station simulation.
- The rest of the squadron stays on its existing orders and AI doctrine.
- The feature should teach naval command language through XO forecasts and captain reports, not require the player to know phrases in advance.

## Current delivery target

The first playable slice should ship only this loop:

1. Select one operational friendly sail or dreadnought vessel and choose **Take Command**.
2. Pause the clock and clear pending fleet signals for that vessel only.
3. Pick a one-turn helm intention: hold station, port, starboard, or ahead.
4. Choose a public contact report as the intended target, or no target.
5. Choose weapons tight, guns/broadside, or dreadnought-era torpedoes where the vessel has tubes and the target is a valid capital-ship solution.
6. Read the XO forecast and readiness reasons before resolution.
7. Resolve the captain's turn with the fleet's next ordinary tick.
8. Show what actually happened as a last-turn captain report, reset the staged plan to hold/no target/weapons tight, and remain paused for the next captain decision.
9. Let the player return to flag control, preserving the ship's standing order and doctrine.

Everything outside that loop is follow-up work.

## Player-facing design

### Captain station
The captain station replaces the selected ship's fleet-signal controls while that ship is under direct command. It should stay small, textual, and chart-room native:

- **Helm:** hold station, come port, come starboard, make way ahead.
- **Target:** public reported contact IDs only; stale/lost reports stay labelled as estimates.
- **Weapons:** hold fire, release broadside/fire guns, and fitted dreadnought torpedo release.
- **Readiness:** immediate reasons for disabled or risky actions: reload, ROE, range, arc, wind, terrain, traffic, target freshness, ammunition.
- **Resolve:** a single primary action that advances the ordinary tick.
- **Return to flag:** exits direct command and resumes captain automation.

The station must work in the inspector and as a compact control in the 3D battle view. The 3D view remains presentation only; ship meshes are not target geometry.

### XO forecast
The XO gives immediate feedback before the tick resolves. The tone should be practical and honest:

- Explain the current plan in plain language.
- Say why a selected action is unavailable or likely weak.
- Mark forecasts as provisional because wind, traffic, contacts, and enemy action may change during resolution.
- Teach terms such as port, starboard, broadside, fire-control, and ROE in context.
- Use only the player view: own-ship state, public contacts, public pending signals, and the engine-provided captain options.

### Captain reports upward
Outside Take Command, the inspector should expose a bounded **Captain's report** for supported vessels. This is how captains "manage up" to the admiral:

- current acknowledged standing order,
- pending signal timing,
- main known constraint,
- a short lesson that connects the order to game behavior.

This report is not a new fleet alert system. It should teach doctrine terms without cluttering the event log or revealing hidden state.

## Engine contract
Take Command should remain a thin override on the existing simulation:

- `src/sim/engine.js` owns the captain-control state, public view, save/load validation, staged plan, and resolution hooks.
- Era movement and combat still decide what can happen. Captain actions should call the ordinary sail/dreadnought rules rather than duplicate them.
- Hidden ship IDs must never cross into the player-facing plan. Plans store public contact IDs and resolve them back to real targets only inside the simulation.
- Manual movement and manual fire must exclude the commanded ship from automatic movement/fire for that tick, while all other ships continue normally.
- The plan is consumed once after resolution. A second tick with no new plan must not repeat a turn or fire again.
- Old saves without captain-control state must still load. Malformed captain-control saves must be rejected instead of repaired into unsafe state.

## Implementation touchpoints

Observed current work aligns with these files:

- `DESIGN.md` records the first-slice product contract.
- `README.md` explains the playable Take Command loop for users.
- `src/sim/engine.js` contains `takeCommand`, `planCaptainAction`, `releaseCommand`, `captainOptions`, and captain resolution helpers.
- `src/sim/eras/dreadnought.js` owns dreadnought-era manual fire behavior.
- `src/ui/app.js` wires the inspector, clock pause, 3D command entry, focus handling, and event handlers.
- `src/ui/captain-panel.js` renders the captain station.
- `src/ui/captain-feedback.js` renders XO forecasts and captain reports.
- `src/ui/style.css` adds the captain-station visual treatment.
- `tests/take-command.test.js`, `tests/captain-panel.test.js`, and `tests/captain-feedback.test.js` cover the first-slice contract.
- `reference/Frigate Duel v2.dc.html` has an older direct-command prototype: useful as design evidence, not a drop-in implementation.

## Milestones and acceptance criteria

### 1. Simulation contract
Acceptance:
- Taking command is immutable, side-private, and clears only the commanded ship's pending signal.
- Planning does not move or fire before the tick resolves.
- The commanded ship ignores fleet orders and automatic fire while under manual control.
- Public contact IDs are accepted; hidden internal IDs are rejected.
- Sail movement respects wind, terrain, traffic, and propulsion constraints.
- Dreadnought guns and fitted torpedoes use ordinary range, reload, ammunition, and target rules.
- Save/load preserves valid staged plans and rejects malformed ones.

### 2. UI captain station
Acceptance:
- The station exposes staged choices, not immediate fire controls.
- Disabled choices show nearby reasons without relying on hover tooltips.
- The inspector and compact 3D station share the same public options and event paths.
- Clock running is disabled while in Take Command; Advance/Resolve consumes one ordinary tick.
- Focus remains usable after rerenders and on return to flag.

### 3. Explanation layer
Acceptance:
- XO forecasts summarize the staged plan, availability reasons, and last resolution report.
- Captain reports explain standing orders and constraints in under one short paragraph.
- Reports do not serialize or echo hidden enemy IDs, true names, or hidden positions.
- Wording teaches game abstractions and avoids implying real-world precision.

### 4. Final QA before merge
Acceptance:
- Full regression test suite passes on the feature branch.
- Static check and production build pass.
- Manual smoke covers Nevis and Dogger Bank in chart mode and 3D mode.
- Save/export/import resumes a paused captain plan.
- Phone-width layout remains usable enough to resolve and return to flag.

### Verification recorded for this prototype
- `npm test`: 648 tests passed, including the captain-control, panel, feedback, and existing automated-sortie regressions.
- `npm run check`: JavaScript syntax checks passed. No TypeScript compiler or full lint/LSP gate is configured for this repository.
- `npm run build`: passed; the pre-existing large 3D chunk warning remains.
- Browser smoke: staged sail helm leaves the tick/ship unchanged until resolution; dreadnought target designation and gun release resolve once; station remains paused; other-vessel selection does not transfer control; immersive resolve retains focus; local save/load retains the staged plan; return to flag enables normal running.
- Responsive smoke: desktop and 390px phone viewport checks; no phone horizontal overflow and captain primary/helm targets are at least 44px tall. These are desktop-browser viewport checks, not certification on physical phones.
- Independent code review found no remaining blocking defects after fixes for ownership, readiness, fog safety, movement budgets, mine losses, and normal combat initiative.
- Remaining validation: separate browser export/import roundtrip, Safari/Firefox and physical-device checks, and player assessment of whether the new choices feel worthwhile.

## Risks and mitigations
- **Fog-of-war leak:** keep all UI on `getView` output and public contact IDs; test hidden-ID rejection.
- **Double movement or double fire:** exclude the commanded ship from automatic AI movement/fire and consume each plan once.
- **Stale readiness:** label XO text as a forecast and write the actual resolution report after the tick.
- **Save migration bugs:** make `captainControl` optional for old saves and strict for new malformed saves.
- **Pause confusion:** clock label should clearly say the player is paused to plan the captain's turn; Run stays disabled until return to flag.
- **Ownership confusion:** selecting another ship should not silently transfer command; explicit transfer should warn that the old staged plan is discarded.
- **AI regression:** default fleet doctrine must remain the baseline when not taking command.

## Deferred decisions
- Shot types for sail: round, chain, grape, or simplified special actions.
- More expressive maneuvers: tack, wear ship, smoke turn, destroyer attack run, or hold bearing.
- Target retention: whether a stale target remains selected as an intent, clears automatically, or prompts the player.
- Fleet-level captain alerts: whether captains should proactively surface "what is working/not working" beyond the selected-vessel inspector.
- Objective medals, scenario scoring, or end-of-mission captain grades.
- Damage-control budget or repair party tradeoffs.
- Take Command support for ironclads, WWII, Cold War, and modern missile engagements.
- Detailed bridge art or crew portraits; not needed for the first playable slice.

## Alternative rejected for this slice
- **Instant captain acts:** not chosen because they would need a separate action-budget and ordering model to avoid extra tempo. The user selected staged decisions resolved within the ordinary tick instead.
- **Turret/trigger action controls:** rejected because they reward precision timing instead of captain-level decisions.
- **Full era rollout now:** rejected because it would dilute the first slice before the sail and dreadnought loop proves fun.
