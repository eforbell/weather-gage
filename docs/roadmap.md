# Roadmap

## Near term: stabilize the scaffold
1. Broaden the existing regression coverage for the fixed-tick contract: deterministic replay, order delay, stale contacts, missile impact delay, finite defense/ammo, save/load validation, and terminal outcomes.
2. Replace hardcoded era checks with an era-rule registry: movement model, command channel, sensor suite, weapon resolver, contact decay, victory evaluator, and UI labels.
3. Move scenario, ship, weapon, sensor, doctrine, and terrain definitions into explicit data schemas with validation.
4. Document the public simulation API so UI work does not reach into private state.

## Next playable depth
1. Improve command UX: queued orders, acknowledgement state, clearer contact confidence, better doctrine controls, and richer auto-pause policies beyond the existing new-contact pause.
2. Expand the existing run/pause presentation: selectable speeds, additional auto-pause triggers, and replay/event stepping.
3. Deepen the existing radar/passive detection, emission tradeoffs and finite missile/defense model: add salvo planning, decoys, fire-control-quality tracks, and platform roles.
4. Add sail depth after the common systems are stable: shot mix, stronger wind/weather effects, broadside doctrine, and signal visibility.

## Era/content expansion
1. Age of Sail: finish frigate duel slice, then add stealth/harbor and patrol missions.
2. Modern fictional surface warfare: grow from 2v2 missile duel to small task group actions with screens and scouts.
3. Ironclad and dreadnought eras: add only after the registry/data model can express new movement, weapons, signals, and scoring without core rewrites.

## Deferred until foundation is proven
- Take Command.
- Fitting-out and campaign persistence.
- Historical scenario packs.
- Submarines, aircraft, carriers, torpedoes, and mines.
- Multiplayer or production-scale AI.

## Definition of progress
The project advances when each new era or weapon family is added mostly through data and registry entries, with targeted engine extensions and tests. If modern radar/missile work requires rewriting sail movement or contacts, the architecture has failed its main goal.
