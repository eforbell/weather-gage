# Ship model pipeline: a playbook for agents

Hero ships are **generated, not hand-modelled**. Each ship is one JSON spec in
metres. A headless Blender script turns it into a GLB with baked ambient
occlusion and smoke anchors. A Node report checks the result against the spec,
and the game loads it in place of the procedural model. No one opens the
Blender UI. An agent edits numbers, looks at the renders, and repeats.

HMS Lion is the first ship built this way (`ships/hms-lion/`). SMS Seydlitz (`ships/sms-seydlitz/`) adds measured wing turrets and funnel uptake casings. The four Nevis frigates (`ships/uss-constellation/`, `uss-baltimore/`, `linsurgente/`, `volontaire/`) add the sail kit: transom sterns, gunport batteries, painted strakes, bulwarks, a head, and a full rig with sails and flags. Hampton Roads' USS Congress and USS Cumberland (`ships/uss-congress/`, `uss-cumberland/`) reuse it at anchor with every sail furled, USS Minnesota under steam. The steam kit (`shipkit/steam.py`) adds CSS Virginia's casemate, the side-wheelers' paddle boxes and walking beams (CSS Patrick Henry, CSS Jamestown), deck guns, and USS Monitor's round turret (`turretType.shape`). Copy their structure, not their measurements.

```
ships/<id>/spec.json ──► blender -b (tools/blender/build_ship.py)
      │                     ├─► public/assets/ships/<era>/<id>.glb   (committed, shipped)
      │                     └─► output/ships/<id>/*.png, *.blend      (review only, git-ignored)
      │
      └─► scripts/ship-asset-report.mjs ──► budgets, scale, waterline, orientation, anchors, spec hash
                                            (also run by `npm test` on the committed GLB, no Blender needed)
```

## Files

| Path | What it is |
|---|---|
| `ships/<id>/spec.json` | **The single source of truth**: hull offsets, fittings, paint, budget, reference calibration |
| `ships/<id>/PROVENANCE.md` | Reference ledger, facts used, deliberate departures |
| `ships/<id>/reference/` | Downloaded drawings. **Git-ignored; never shipped** |
| `tools/blender/build_ship.py` | CLI entry: build, bake, export, render, report |
| `tools/blender/shipkit/lines.py` | Hull lofting from the offsets table |
| `tools/blender/shipkit/parts.py` | Fittings: turrets, funnels, masts (pole, tripod), superstructure, boats, secondary guns, hawse pipes |
| `tools/blender/shipkit/steam.py` | Steam-era fittings: casemates, paddle boxes, walking beams, deck guns |
| `tools/blender/shipkit/sail.py` | Sail-era fittings: strakes, bulwarks, gun batteries, head, stern (windows, galleries, rudder), rig (masts, tops, yards, square and fore-and-aft sails, shrouds, stays, spars) and flags |
| `tools/blender/shipkit/finish.py` | Materials, AO bake to vertex colours, glTF export |
| `tools/blender/shipkit/preview.py` | Review renders (profile, plan, quarter views, game distance) |
| `scripts/build-ship.mjs` | `npm run ship:build -- <id>`: runs everything and overlays the reference |
| `scripts/ship-asset-report.mjs` | `npm run ship:report -- <id>`: checks only |
| `tests/ship-authored.test.js` | Runs the report, a spec↔registry↔scenario cross-check and the in-game clone path for every registered ship |
| `src/ui/ship-assets.js` | `SHIP_ASSET_REGISTRY`, where a built ship is switched on |

## Toolchain

- **Blender 5.2 LTS**, headless. `build-ship.mjs` finds it via `$BLENDER`, then `PATH`, then `/Applications/Blender.app`. Other versions build but warn.
- **ImageMagick** (`magick`) for the reference overlay. It is optional; without it the overlay is skipped.
- Node 22 and the repo's pinned `three`.
- Optional Khronos validation: `FIXTURE_TOOLS=<prefix> npm run ship:report -- <id>`. The prefix holds `gltf-validator@2.0.0-dev.3.10`; see [ship-fixtures.md](ship-fixtures.md).

A full Lion build takes about 4 s: AO bake, export and five renders.

## Recipe: adding a ship (for example SMS Seydlitz)

1. **Pin the ship and the date.** Find it in `src/sim/scenarios.js`. The public `name` (lower-cased) becomes the registry key, and `guns` must equal the guns the spec carries; a test enforces this. Where the scenario rates firepower abstractly (the ironclad era's `battery`), state the historical armament as a top-level `guns` in the spec instead. Guns counted are turret guns, 2 × each battery, deck guns and casemate ports. Choose the configuration for the scenario's date: Dogger Bank is January 1915.
2. **Find a measurable reference.** The best free source is the *Jane's Fighting Ships* 1914–1919 line drawings on Wikimedia Commons: a profile and a plan, public domain in the US. Download into `ships/<id>/reference/` and record source, rights and date in `PROVENANCE.md`. Never commit or ship reference images, and never trace protected artwork (see [ship-model-research.md](ship-model-research.md)).
3. **Calibrate the drawing.** Positions are in **source-image pixels**, not crop pixels. Crop and enlarge it (`magick ref.png -crop WxH+X+Y -resize 200% zoom.png`) and view it with the Read tool. Note, in source pixels, the bow at deck level (`bowX`), the stern (`sternX`) and the waterline (`waterlineY`). Then `px per metre = abs(sternX - bowX) / length`. Bow-right references are supported: the overlay mirrors a profile and rotates a plan 180° to preserve port/starboard. Supply the actual crop dimensions for these references. Put these in `spec.references[]` with `crop`. If the drawing has a **plan view**, calibrate it too, as a second reference with `view: "plan"` and `centerlineY` in place of `waterlineY`. The plan overlay is the only check on half-breadths and on off-centre parts such as wing turrets.
4. **Write `spec.json`.** Copy Lion's and replace the values. Read positions straight off the drawing: `aft = (x - bowX) * sign(sternX - bowX) / pxPerMetre` and `height = (waterlineY - y) / pxPerMetre`. Do the hull first, then turrets and funnels, then everything else.
5. **Iterate fast.** Run `npm run ship:build -- <id> --no-bake` (about 2 s). The report fails on the missing bake; that is expected while iterating. Open `output/ships/<id>/overlay-*.png`, where the render sits at 55 % over the calibrated drawing, plus `quarter.png` and `game-distance.png`. Fix the spec until the overlay agrees. Work in this order: **sheer and deck breaks → turret positions and heights → funnels (position, height, size) → masts → superstructure → small detail.**
6. **Full build.** Run `npm run ship:build -- <id>`. Every report line must be `ok`.
7. **Register it** in `SHIP_ASSET_REGISTRY` (`src/ui/ship-assets.js`) under its era, with `url`, `era`, `specId`, `className`, `units: 'meters'`, `lengthMeters`/`beamMeters` and `length`/`width` (all equal to the spec values; tested), `waterlineY: 0`, `rotationY: 0` and `license`. Do not add `funnels`: smoke origins come from the GLB's `anchor_funnel_*` nodes.
8. **Run `npm test`.** The new entry is picked up automatically.
9. **Check it in the real viewport.** Run `npm run dev`, select the ship, press *Go to the battle*, zoom in, advance a few ticks, and screenshot. Check scale next to the procedural ships, the wake and foam, smoke coming from the funnel tops, and no console warnings. Stopping the asset request (or renaming the file) must leave the procedural model in place.
10. **Commit** `spec.json`, `PROVENANCE.md`, the GLB, the registry entry, and any kit changes. Do not commit `reference/` or `output/`.

### Seydlitz reference case

Copy Lion's **structure** (spec layout, provenance ledger, references), not her measurements. Verify Seydlitz's January 1915 configuration independently.

Implemented in `ships/sms-seydlitz/`: 200.6 m long and 28.5 m in beam, two funnels. The provenance ledger records the 1913 dockyard evidence and deliberate simplifications. Ten 28 cm guns in five twin turrets: one forward, two **wing turrets en echelon** amidships, and two superfiring aft. Wing turrets use `"side"` (metres to starboard; negative for port) on a turret, which the kit already supports, and the report checks each turret's side offset. Confirm the echelon (which wing turret is further forward) against the **plan** overlay, not the profile. Her scenario `guns` is 10. B is the forward **starboard** wing turret; C is the after **port** one. A rotated top-view reference must agree with those physical sides. Any kit change made for her rebuilds Lion too (the kit-hash gate), so review Lion's renders again.

## Spec reference

Conventions: `aft` is metres aft of the stem at deck level, `side` is metres to starboard, heights are metres above the design waterline. `base` is either a height or `"deck"`, which resolves to the weather deck under the part (including the sheer step and camber); parts are sunk 0.4 m so no gaps show.

| Field | Meaning |
|---|---|
| `id`, `name`, `className`, `era`, `registryKeys` | Identity. `registryKeys` are the lower-case public names |
| `configuration` | The date and refit the model represents |
| `budget` | `maxTriangles`, `maxDrawCalls`, `maxBytes`. A hero blockout is 40k / 12 / 2 MB |
| `hull.length`, `beam`, `draft`, `camber` | Hull dimensions (m; `length` is stem to stern at the deck) and deck camber at the centreline |
| `hull.overallLength` | Optional: bowsprit tip to rudder, for ships with projections. The report checks it (±1 %); without it the overall length must equal `length` |
| `hull.bootTopping` | `[low, high]`: the dark band around the waterline |
| `hull.stationSpacing` | Loft density (m); stations bunch toward the ends |
| `hull.lines[]` | **Offsets table**, fore to aft, first `aft: 0`, last `aft: length`. `halfDeck`, `halfWater` (half-breadths), `deck` (sheer height), `keel` (z of the keel: negative under water, positive for an overhanging counter), `fullness` (section exponent: ~1.5 fine V, 2 round, 5+ flat floor with a hard bilge). A deck break is two rows about 1 m apart with different `deck`. An end row with `halfDeck` > 0 is closed with a flat face: a **transom stern**. `halfDeck` < `halfWater` gives tumblehome. Across a deck break, keep the side fair: the lower deck's `halfDeck` is measured at its lower height, so it is wider |
| `superstructures[]` | `plan` as `[[aft, halfWidth], …]` fore to aft, mirrored. Two rows make a rectangle, more make a polygon (chamfered ends) |
| `conningTowers[]` | Oval, `length` fore and aft × `width` |
| `turrets[]` + `turretType` | `facing` is `fore` or `aft`; `barbette` is the height of the gunhouse floor above its base (superfiring turrets have taller ones); optional `side` for wing turrets. `turretType` sets gunhouse size, front slope and barrel dimensions; `shape: "cylinder"` builds a round Monitor-style turret (diameter `length`, no barbette or hoods) |
| `funnels[]` | Oval, `length` × `width`, `top` height, optional `material` (default `upper`). Anchors `anchor_funnel_<id>` sit 0.6 m above the top. Optional `casing: { length, width, top }` adds a straight-sided, chamfered uptake casing under the funnel; the funnel rises from its roof |
| `masts[]` | `type: pole` or `tripod` (with optional `legs: { footAft, footSpread, joinHeight }`), `topmastFrom`, `spottingTop`, `yards[]` |
| `searchlightTowers[]`, `boats[]`, `hawsePipes[]`, `secondaryGuns` | Detail. `secondaryGuns.mounts[].angle` is the training angle from the bow (90 = abeam), mirrored to both sides |
| `casemate` | A sloped armoured box with rounded ends: `fromAft`, `toAft`, `base`, `top`, `halfWidth` (at the base), `roofHalfWidth`, `endLength`, `material`, `roof`, and `ports { side: [aft, ...], bow, stern, z, size, gun }` (several bow or stern ports spread across the end). Counts toward the guns |
| `paddleBoxes` | Side wheels: `aft`, `radius`, `axle` (height), `width`, `material`, `guard` (half-length of the sponson ledge), `guardMaterial` |
| `walkingBeam` | Beam-engine gallows and diamond beam: `aft`, `top`, `length`, optional `spread` (gallows legs fore and aft) |
| `deckGuns[]` | Guns on open slides or pivots: `aft`, `side`, `train` (degrees from the bow, + to starboard), `length`, `radius`, optional `carriage` material. Count toward the guns |
| `guns` | Top-level historical gun count, required when the scenario rates firepower abstractly (ironclad `battery`); the test checks the modelled guns against it |
| `paint` | sRGB hex per material: `hull upper deck boot bottom dark canvas`, plus optional `spar` (masts and spars; falls back to `upper`). One draw call per material the ship uses; an unused material is not exported |
| `surface` | Optional per-material `{ roughness, metalness }` overrides (wooden ships use metalness 0) |
| `curves` | Named height lines `{ name: [[aft, z], ...] }`, interpolated like the offsets table. Sail parts follow them (gunport rows, rails, strakes) instead of restating heights |
| `strakes[]` | Painted bands on the side: `line` (curve name or inline points), `from`/`to` (metres relative to the line), `fromAft`/`toAft`, `material`, optional `out` (stand-off) |
| `bulwarks` | The side carried up from the deck edge to the `rail` curve between `fromAft` and `toAft`: `thickness`, and `outer`, `inner`, `cap` materials. Reaching `aft = length` adds a taffrail across the transom |
| `batteries[]` | Broadside gunports per side: `count` evenly from `fromAft` to `toAft`, or explicit `positions` (then `count` is not used), centred on `line`; `size [w, h]`, `gun { length, radius }`, `lids` (default true), `lidAngle`, `lidMaterial`. **Guns = turret guns + 2 × ports per battery + deck guns + casemate ports**; the test compares this with the scenario (or with the spec's `guns`) |
| `head` | Centreplane knee from `profile [[aft, z], ...]` (negative `aft` is ahead of the stem), `thickness`, `material`, optional `figurehead { aft, z, size }` |
| `stern` | `windows[] { z, count, span, size }` and `bands[]` on the transom, quarter `galleries { fromAft, toAft, z0, z1, depth, windows }`, and a `rudder { top, chord }` with sternpost and deadwood down to the keel |
| `rig` | `brace` (degrees, starboard yardarms forward), `belly` (sail fullness), `rigging` (rope radius). `masts[]`: `id` (names `anchor_mast_<id>`), `aft`, `rake`, `sections[] { from, head, radius }`, `top { z, size }`, `crosstrees[]`, `shrouds { count, aft: [from, to] relative to the mast, z (channel height), backstays }`, `yards[] { z, span, sail { foot, footSpan } \| furled }`. `spars[]` (`from`/`to` as `[aft, side, z]`), `stays[]` (point pairs), `foreAftSails[] { corners [[aft, z] × 3 or 4], belly }`, `flags[] { design, hoist [aft, z], size, stream, wave }`. Flag designs live in `sail.py` (`us-1795`, `us-1861`, `fr-1794`, `csa-1861`); their colours are baked into the vertex colours, so they show in the game but not in the Workbench previews |
| `references[]` | `file`, `url`, `view` (`profile` or `plan`), `crop`, `bowX`, `sternX`, and `waterlineY` (profile) or `centerlineY` (plan), all in source pixels |

## What the build guarantees (and the report checks)

- **Coordinate contract:** the bow is -Z, up is +Y, the waterline is Y = 0, and units are metres. Registry `units: 'meters'` applies `modelMetersToWorld(era)` once (see Era scale below).
- **One mesh, at most eight materials:** the seven paints plus the optional `spar`, so at most 8 draw calls (7 for a steel ship) and no textures. Sail specs set `budget.maxDrawCalls: 8` so the report enforces it.
- **Baked AO** in `COLOR_0`, which three.js multiplies into the base colour. This grounds turrets and fittings and costs nothing at runtime. A little waterline grime is added.
- **Anchors:** `anchor_funnel_<id>` (smoke), `anchor_turret_<id>` (muzzle centre, for future muzzle flashes) and `anchor_mast_<id>`. `cloneShipAsset` exposes all of them as `userData.anchors` and derives `userData.funnels`, ordered bow to stern.
- **Waterline contour:** scene extras carry `weatherGageWaterline`, the hull's half-breadth at the design waterline from bow to stern. When the authored model replaces the procedural stand-in, waterline foam and the bow wave are rebuilt on this contour and the authored beam (`adoptAuthoredModel`). Without it, side foam would float off a hull narrower than the stand-in's.
- **Stale-build stamps:** the GLB's scene extras carry `weatherGageSpecSha256` (the ship's `spec.json`) and `weatherGageKitSha256` (every `.py` under `tools/blender/`). If either changes without a rebuild, `npm test` fails. A kit change therefore forces every ship to be rebuilt.
- Outward hull orientation is enforced by positive signed volume after welding, and the report checks an upward painted weather deck.
- Budgets, hull length (the weather deck's extent, ±1 %; bowsprits, heads and rudders may reach past it), keel at `-draft`, turret facings and funnel anchor positions all match the spec.
- **Era scale:** a metre asset is scaled by `modelMetersToWorld(era)` (`battle-presentation.js`). Each era's representative ship fills `SHIP_LENGTH`: 210 m by default, 50 m for sail and 60 m for the ironclad era, where it matches the procedural stand-ins (`ERA_REFERENCE_METERS`), so a frigate at Nevis is as large on screen as a battlecruiser at the Dogger Bank. One uniform factor per era; ships in an era keep their true relative sizes.

Builds are geometrically identical run to run, but not byte-identical: Blender's exporter varies index order. Compare builds with the report, not file hashes.

## Extending the kit

When a ship needs something the kit lacks (wing turrets and the sail rig were examples; casemates, sponsons, cranes or a ram bow are others):

1. Add the parameters to the spec under a new key, in metres and the same conventions, and document them in the table above.
2. Add a builder in `parts.py` (or `sail.py` for sail-era parts) that reads the key and returns nothing when it is absent, so older specs still build. Build in a scratch bmesh, bevel it, and `kit.merge(...)` it with one of the material names in `MATERIALS`.
3. Add any new anchor as `kit.anchor("anchor_<kind>_<id>", point)`, and check it in `ship-asset-report.mjs` if the game will rely on it.
4. Rebuild **every** ship in `ships/` and run the tests, so the kit change cannot silently regress an earlier ship.

Keep the kit generic. Ship-specific numbers belong in the spec, never in Python.

## Acceptance gate (per ship)

- [ ] The configuration date matches the scenario. Provenance is recorded and the references are cleared for this use.
- [ ] The profile overlay agrees with the reference within about 1 m on turret, funnel and mast positions and heights; the plan overlay agrees on half-breadths and off-centre turrets. (Ships modelled side-faithful rather than ship-faithful, like the Nevis frigates, have no reference; say so in `PROVENANCE.md`.)
- [ ] `npm run ship:build -- <id>` is all `ok`. Khronos validation reports 0 errors.
- [ ] `npm test` passes, including the gun count against the scenario.
- [ ] Real viewport: correct scale and waterline, **waterline foam hugging the hull** (check from above), smoke from the funnel tops, wake starting at the bow, no console warnings, procedural fallback still works, and uncertain contacts still show the procedural or contact model.
- [ ] Screenshots before and after are attached to the PR.

## Known limits and next steps

- **Sails are posed, not animated:** one fighting-sail pose on a broad reach serves every heading. Billowing with the scenario wind (a vertex shader) and striking colours are future work.
- **No LODs and no geometry compression.** Lion is about 1 MB raw and 22k triangles. Meshopt (`gltfpack`) would cut that several-fold, but meshopt decoding is not yet fixture-tested ([ship-fixtures.md](ship-fixtures.md#still-open)).
- **Vertex AO only.** There is no texture bake (planking, scuttles, weathering streaks); that needs UVs and the KTX2 path.
- **Fleet proportions are decided:** authored GLBs keep true beam; procedural hulls/fittings use class-specific, non-exaggerated length/beam ratios. Readable presentation lengths/heights and compressed chart distances remain abstractions. See [fleet proportions](3d-visual-direction.md#fleet-proportions-2026-10-02). No per-hero width hack or double scaling.
- No automated golden screenshots of the viewport yet (M0 in [3d-visual-direction.md](3d-visual-direction.md#milestones-and-gates)).
