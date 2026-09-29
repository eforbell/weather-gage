# Review: ship foundation work in progress (2026-09-29)

A preliminary review of the uncommitted work on `feat/battle-ship-foundation`: the two docs, `ship-assets.js`, `ship-hull.js`, `ship-specs.js`, `battle-sea.js`, `battle-waterline.js`, and the edits to `battle-3d.js` and `battle-models.js`. It was written by another agent at Eric's request while you were rate-limited. Nothing else in this workspace was changed. Read-only checks: `node --test` gives 151 passing and 1 failing.

Overall this is a strong foundation. Eric's testing already shows ships sitting better in the water (boot-topping, waterline foam, foam anchored to the sea). The items below are ranked by how visible they are, and most are small.

## Fix first: visible in the next screenshots

### 1. `shipSpecFor` picks the wrong spec for whole scenarios (`src/ui/ship-specs.js:62-72`)
The era checks run before the type checks.
- **Hampton Roads (`era === 'ironclad'`):** every ship gets `SHIP_SPECS.ironclad`, including USS Cumberland (className `Sloop of war`), USS Congress (`Sail frigate`), USS Minnesota (`Steam frigate`, speed 2) and USS Monitor (`Turret ironclad`, `turret: true`). CSS Patrick Henry and Jamestown are `Side-wheel gunboat`.
- **Modern and Cold War:** `/destroyer.../` matches before `era === 'modern'`, so the modern `Area-defense destroyer` and `Missile destroyer`, and the Cold War `ASW destroyer`, get the 1915 destroyer with gun turrets.

Suggested order: `carrier` first, then use the actor type to pick among the specs *within* an era:
- **ironclad:** casemate, turret monitor, wooden sail ship, wooden steamer, side-wheel gunboat.
- **dreadnought:** battlecruiser, battleship, destroyer.
- **modern and coldwar:** surface combatant, ASW destroyer. Submarines stay in their own path.

Add a table test that runs every ship in `SCENARIO_SETUPS` through `shipSpecFor` and asserts the expected spec key, so new scenarios can't silently fall back to the battleship.

### 2. Fittings float on low-freeboard hulls (`src/ui/battle-models.js:54-80`)
The deck now sits at `freeboard + 0.045` (line 51), but `turret`, `funnel` and `mast` still use fixed heights: `0.62 + h / 2` and `0.72 + h / 2` at lines 63 and 66, plus the fixed bases in `funnel` and `mast`. The ironclad (freeboard 0.34) has its turret, funnel and mast about 0.25 units above the deck, and every other class is off by its freeboard minus 0.5.
Pass `deckY = spec.dimensions.freeboard + 0.045` (or a per-fitting `y` from the spec) into these helpers.

### 3. After turrets face forward (`src/ui/battle-models.js:66`)
The guns always extend toward the bow: `z - (large ? 0.78 : 0.48)`. On Lion and Seydlitz the after turrets face aft, which is a signature part of the silhouette. Add `facing: 'fore' | 'aft'` to the turret specs (default by the sign of `z`) and mirror the barrel offset.

## Next: quality

### 4. The hull is coarse, and its deck shading can smear (`src/ui/ship-hull.js:33`, `:48-50`)
- **Resolution:** 7 stations of 6-point sections give hard chines. Try about 15–20 stations clustered toward bow and stern, and 10–12 points per section with a rounded bilge.
- **Deck:** the section ring includes the deck edge, so the deck is part of the same mesh and shares smoothed normals with the sides. That smears shading along the deck edge. There's also a separate deck box on top (`battle-models.js:51`). Prefer an open hull shell with split normals at the deck edge, plus one flat deck surface following the sheer.
- **Stem:** the bow cap is a flat fan. A raked stem line (or the ram bow for ironclads) would read much better at the follow camera.

### 5. The water-shader patch disables the whole 3D view if it fails (`src/ui/battle-sea.js:97-104`, `battle-3d.js:107`)
`patchWaterShader` throws when an anchor string is missing, for example after a three.js upgrade. `createBattle3D` is wrapped in a `try` in `app.js`, so the result is no 3D view at all, not a plainer sea. Either catch in `configureSea` and keep the unpatched `Water` (with a console warning and a flag the HUD can show), or copy `Water.js` into the repo (MIT, with attribution) and edit it directly. The anchor test keeps the patch honest either way.

### 6. The failing test `whitecap threshold is reachable but not full-surface foam at heavy swell` (`tests/battle-sea.test.js:47`)
- It passes `wind` to `createWaterNormals`, which ignores that option.
- It re-implements the shader's noise mix by hand, so it will keep drifting from the GLSL.

Prefer asserting statistics of the generated normal map directly: the slope distribution, the share above the whitecap threshold at swell 1 and 1.8, and tileability at the edges.

## Asset pipeline

### 7. One model per class across navies (`src/ui/ship-assets.js:51`)
Keying by class is right for fog of war, but HMS Lion and SMS Seydlitz are both `Battlecruiser`, so they'd share one model. Consider keys like `battlecruiser:rn` and `battlecruiser:kaiserliche`, with the nation part used only for own ships and *identified* contacts (identified contacts already carry their side in multi-side games). Unidentified contacts stay on the procedural or generic model.

### 8. Every instance copies its geometry (`src/ui/ship-assets.js:102`)
`cloneShipAsset` clones geometry for each ship. For 20–40k-triangle hero models that multiplies GPU memory for no benefit: damage, paint and decals are material or decal work. Share the template's geometry and clone only materials, and don't dispose the shared geometry per instance (the manager already owns template lifetime).

### 9. KTX2 decoder packaging — original finding withdrawn
**Correction from the PR #3 review:** the original claim that an empty
`basisTranscoderPath` requests missing site-root files was incorrect for pinned
Three 0.186.1. Its `KTX2Loader` uses module-relative `new URL(..., import.meta.url)`
Basis JS/WASM URLs when the transcoder path is empty. Vite emits both into
`dist/assets`; local preview serving was verified. Keep `basisTranscoderPath: ''`.
No copy into `public/basis/` is required for this pinned version.

The remaining gap is **runtime decoding validation**: no compressed glTF/KTX2
fixture exercises the decoder yet. Packaging evidence does not close that gate.

### 10. Unused `steam` era key (`src/ui/ship-assets.js:11`)
The simulation's eras are `sail`, `ironclad`, `dreadnought`, `coldwar` and `modern`. Harmless, but drop it or document what it's for.

## The research doc (`docs/ship-model-research.md`)
Good as it stands:
- It separates access, public-domain status, permission to trace, and permission to redistribute.
- It keeps a per-reference provenance record and ties each model to a refit year.
- It's honest that photographs alone don't recover a hull.
- It scripts the lofting in Blender Python, reviews silhouettes at the game camera, and starts with one blockout rather than a fleet.

Suggested additions:
- **One spec, two pipelines.** Have the Blender build script read the same spec as `ship-specs.js` (for example `blender -b -P tools/build_ship.py -- --spec specs/lion.json`), so procedural and authored models agree on stations, fittings, waterline and orientation.
- **Tools, pinned and checked.**
  - Name the Blender version, the geometry and texture compression tools, and how the medium and horizon versions are generated.
  - Run the Khronos glTF validator in CI.
  - Add a script that reports triangle counts and texture sizes against the budget: 20–40k triangles for a hero model, about 5k for mid-distance, and 8 MB per era pack.
- **Units.** `lengthMeters`/`beamMeters` sit beside presentation units. State the single conversion, including the 3× presentation scale from `docs/3d-visual-direction.md`, in one place.
- **Art sign-off.** The doc says the silhouette and historical interpretation are human art tasks. Name who approves each model, against which reference sheet.
- **The frigate reference is stricter than it needs to be.** USS Constellation (1797) was one of Humphreys' original six frigates, the same design family as Constitution, though rated 38 guns rather than 44. So Constitution plans are a legitimate family reference for Constellation, with dimensions scaled. L'Insurgente is French and needs French references; many of those are in copyrighted monographs, so rights matter there.

## Suggested order
Items 1–3 first: they're cheap and the most visible (Hampton Roads and Dogger Bank especially). Then 5 and 6 so the sea can't take the view down and the suite is green. Then 4 for the hull. Items 7–9 before the first authored model is registered.

## Post-merge review follow-ups

PR #3 was approved and merged after verification at `9dbe50c`: 162 tests, syntax
checks, production build, scenario-wide model selection, and Hampton/Dogger
browser smoke passed. The review identified no blocking findings. This document's
initial failing-test observation and original implementation findings are historical.

Non-blocking next-pass work:
- Enforce authored-asset units at normalization/registration, rather than relying
  only on authors to supply `MODEL_METERS_TO_WORLD`.
- Remove scenario-specific ship-name alternatives from `shipSpecFor`; retain
  class/type selection and the scenario-table regression tests.
- Strengthen Virginia's casemate slope and narrow its flat top for a more
  distinctive silhouette at the follow camera.

Mid-laptop/phone frame-time measurements remain open. Craig's feedback is optional, not a release/merge gate (current user override).
