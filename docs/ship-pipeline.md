# Ship model pipeline: a playbook for agents

Hero ships are **generated, not hand-modelled**. Each ship is one JSON spec in
metres. A headless Blender script turns it into a GLB with baked ambient
occlusion and smoke anchors. A Node report checks the result against the spec,
and the game loads it in place of the procedural model. No one opens the
Blender UI. An agent edits numbers, looks at the renders, and repeats.

HMS Lion is the first ship built this way (`ships/hms-lion/`). Copy it.

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

1. **Pin the ship and the date.** Find it in `src/sim/scenarios.js`. The public `name` (lower-cased) becomes the registry key, and `guns` must equal the sum of turret guns in your spec; a test enforces this. Choose the configuration for the scenario's date: Dogger Bank is January 1915.
2. **Find a measurable reference.** The best free source is the *Jane's Fighting Ships* 1914–1919 line drawings on Wikimedia Commons: a profile and a plan, public domain in the US. Download into `ships/<id>/reference/` and record source, rights and date in `PROVENANCE.md`. Never commit or ship reference images, and never trace protected artwork (see [ship-model-research.md](ship-model-research.md)).
3. **Calibrate the drawing.** Positions are in **source-image pixels**, not crop pixels. Crop and enlarge it (`magick ref.png -crop WxH+X+Y -resize 200% zoom.png`) and view it with the Read tool. Note, in source pixels, the bow at deck level (`bowX`), the stern (`sternX`) and the waterline (`waterlineY`). Then `px per metre = (sternX - bowX) / length`. Put these in `spec.references[]` with `crop`. If the drawing has a **plan view**, calibrate it too, as a second reference with `view: "plan"` and `centerlineY` in place of `waterlineY`. The plan overlay is the only check on half-breadths and on off-centre parts such as wing turrets.
4. **Write `spec.json`.** Copy Lion's and replace the values. Read positions straight off the drawing: `aft = (x - bowX) / pxPerMetre` and `height = (waterlineY - y) / pxPerMetre`. Do the hull first, then turrets and funnels, then everything else.
5. **Iterate fast.** Run `npm run ship:build -- <id> --no-bake` (about 2 s). The report fails on the missing bake; that is expected while iterating. Open `output/ships/<id>/overlay-*.png`, where the render sits at 55 % over the calibrated drawing, plus `quarter.png` and `game-distance.png`. Fix the spec until the overlay agrees. Work in this order: **sheer and deck breaks → turret positions and heights → funnels (position, height, size) → masts → superstructure → small detail.**
6. **Full build.** Run `npm run ship:build -- <id>`. Every report line must be `ok`.
7. **Register it** in `SHIP_ASSET_REGISTRY` (`src/ui/ship-assets.js`) under its era, with `url`, `specId`, `className`, `units: 'meters'`, `lengthMeters`/`beamMeters` and `length`/`width` (all equal to the spec values; tested), `waterlineY: 0`, `rotationY: 0` and `license`. Do not add `funnels`: smoke origins come from the GLB's `anchor_funnel_*` nodes.
8. **Run `npm test`.** The new entry is picked up automatically.
9. **Check it in the real viewport.** Run `npm run dev`, select the ship, press *Go to the battle*, zoom in, advance a few ticks, and screenshot. Check scale next to the procedural ships, the wake and foam, smoke coming from the funnel tops, and no console warnings. Stopping the asset request (or renaming the file) must leave the procedural model in place.
10. **Commit** `spec.json`, `PROVENANCE.md`, the GLB, the registry entry, and any kit changes. Do not commit `reference/` or `output/`.

### Seydlitz notes (unverified, check against references)

Copy Lion's **structure** (spec layout, provenance ledger, references), not her measurements. Verify Seydlitz's January 1915 configuration independently.

About 200.6 m long and 28.5 m in beam, two funnels. Ten 28 cm guns in five twin turrets: one forward, two **wing turrets en echelon** amidships, and two superfiring aft. Wing turrets use `"side"` (metres to starboard; negative for port) on a turret, which the kit already supports, and the report checks each turret's side offset. Confirm the echelon (which wing turret is further forward) against the **plan** overlay, not the profile. Her scenario `guns` is 10. Any kit change made for her rebuilds Lion too (the kit-hash gate), so review Lion's renders again.

## Spec reference

Conventions: `aft` is metres aft of the stem at deck level, `side` is metres to starboard, heights are metres above the design waterline. `base` is either a height or `"deck"`, which resolves to the weather deck under the part (including the sheer step and camber); parts are sunk 0.4 m so no gaps show.

| Field | Meaning |
|---|---|
| `id`, `name`, `className`, `era`, `registryKeys` | Identity. `registryKeys` are the lower-case public names |
| `configuration` | The date and refit the model represents |
| `budget` | `maxTriangles`, `maxDrawCalls`, `maxBytes`. A hero blockout is 40k / 12 / 2 MB |
| `hull.length`, `beam`, `draft`, `camber` | Overall dimensions (m) and deck camber at the centreline |
| `hull.bootTopping` | `[low, high]`: the dark band around the waterline |
| `hull.stationSpacing` | Loft density (m); stations bunch toward the ends |
| `hull.lines[]` | **Offsets table**, fore to aft, first `aft: 0`, last `aft: length`. `halfDeck`, `halfWater` (half-breadths), `deck` (sheer height), `keel` (z of the keel: negative under water, positive for an overhanging counter), `fullness` (section exponent: ~1.5 fine V, 2 round, 5+ flat floor with a hard bilge). A deck break is two rows about 1 m apart with different `deck` |
| `superstructures[]` | `plan` as `[[aft, halfWidth], …]` fore to aft, mirrored. Two rows make a rectangle, more make a polygon (chamfered ends) |
| `conningTowers[]` | Oval, `length` fore and aft × `width` |
| `turrets[]` + `turretType` | `facing` is `fore` or `aft`; `barbette` is the height of the gunhouse floor above its base (superfiring turrets have taller ones); optional `side` for wing turrets. `turretType` sets gunhouse size, front slope and barrel dimensions |
| `funnels[]` | Oval, `length` × `width`, `top` height. Anchors `anchor_funnel_<id>` sit 0.6 m above the top |
| `masts[]` | `type: pole` or `tripod` (with optional `legs: { footAft, footSpread, joinHeight }`), `topmastFrom`, `spottingTop`, `yards[]` |
| `searchlightTowers[]`, `boats[]`, `hawsePipes[]`, `secondaryGuns` | Detail. `secondaryGuns.mounts[].angle` is the training angle from the bow (90 = abeam), mirrored to both sides |
| `paint` | sRGB hex per material: `hull upper deck boot bottom dark canvas`. Exactly these seven, one draw call each |
| `references[]` | `file`, `url`, `view` (`profile` or `plan`), `crop`, `bowX`, `sternX`, and `waterlineY` (profile) or `centerlineY` (plan), all in source pixels |

## What the build guarantees (and the report checks)

- **Coordinate contract:** the bow is -Z, up is +Y, the waterline is Y = 0, and units are metres. Registry `units: 'meters'` applies `MODEL_METERS_TO_WORLD` once.
- **One mesh, seven materials:** at most 7 draw calls and no textures.
- **Baked AO** in `COLOR_0`, which three.js multiplies into the base colour. This grounds turrets and fittings and costs nothing at runtime. A little waterline grime is added.
- **Anchors:** `anchor_funnel_<id>` (smoke), `anchor_turret_<id>` (muzzle centre, for future muzzle flashes) and `anchor_mast_<id>`. `cloneShipAsset` exposes all of them as `userData.anchors` and derives `userData.funnels`, ordered bow to stern.
- **Waterline contour:** scene extras carry `weatherGageWaterline`, the hull's half-breadth at the design waterline from bow to stern. When the authored model replaces the procedural stand-in, waterline foam and the bow wave are rebuilt on this contour and the authored beam (`adoptAuthoredModel`). Without it, side foam would float off a hull narrower than the stand-in's.
- **Stale-build stamps:** the GLB's scene extras carry `weatherGageSpecSha256` (the ship's `spec.json`) and `weatherGageKitSha256` (every `.py` under `tools/blender/`). If either changes without a rebuild, `npm test` fails. A kit change therefore forces every ship to be rebuilt.
- Budgets, length (±1 %), keel at `-draft`, turret facings and funnel anchor positions all match the spec.

Builds are geometrically identical run to run, but not byte-identical: Blender's exporter varies index order. Compare builds with the report, not file hashes.

## Extending the kit

When a ship needs something the kit lacks (wing turrets were one example; sails, casemates, sponsons, cranes or a ram bow are others):

1. Add the parameters to the spec under a new key, in metres and the same conventions, and document them in the table above.
2. Add a builder in `parts.py` that reads the key and returns nothing when it is absent, so older specs still build. Build in a scratch bmesh, bevel it, and `kit.merge(...)` it with one of the seven material names.
3. Add any new anchor as `kit.anchor("anchor_<kind>_<id>", point)`, and check it in `ship-asset-report.mjs` if the game will rely on it.
4. Rebuild **every** ship in `ships/` and run the tests, so the kit change cannot silently regress an earlier ship.

Keep the kit generic. Ship-specific numbers belong in the spec, never in Python.

## Acceptance gate (per ship)

- [ ] The configuration date matches the scenario. Provenance is recorded and the references are cleared for this use.
- [ ] The profile overlay agrees with the reference within about 1 m on turret, funnel and mast positions and heights; the plan overlay agrees on half-breadths and off-centre turrets.
- [ ] `npm run ship:build -- <id>` is all `ok`. Khronos validation reports 0 errors.
- [ ] `npm test` passes, including the gun count against the scenario.
- [ ] Real viewport: correct scale and waterline, **waterline foam hugging the hull** (check from above), smoke from the funnel tops, wake starting at the bow, no console warnings, procedural fallback still works, and uncertain contacts still show the procedural or contact model.
- [ ] Screenshots before and after are attached to the PR.

## Known limits and next steps

- **No LODs and no geometry compression.** Lion is about 1 MB raw and 22k triangles. Meshopt (`gltfpack`) would cut that several-fold, but meshopt decoding is not yet fixture-tested ([ship-fixtures.md](ship-fixtures.md#still-open)).
- **Vertex AO only.** There is no texture bake (planking, scuttles, weathering streaks); that needs UVs and the KTX2 path.
- **Proportions differ from the procedural kit.** Authored ships use true beam. The procedural ships are about twice as beamy for readability, so Lion looks slimmer than the procedural Orion beside her. Decide fleet-wide whether to exaggerate beam at presentation time or to slim the procedural specs; don't hack it per ship.
- No automated golden screenshots of the viewport yet (M0 in [3d-visual-direction.md](3d-visual-direction.md#milestones-and-gates)).
