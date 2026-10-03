# Dreadnought fleet acceptance record

Base reviewed: `main` at `c0cec92`. Delivery branch: `feat/dreadnought-fleet-models`.

## Scope and fidelity

Six new specs, provenance ledgers and baked original GLBs complete all eight
named Dogger Bank ships. Class-/side-faithful painted realism is the acceptance
tier; these are not measured historical reconstructions. Existing flagship and
sail/ironclad specs were not changed. The separate Hampton Roads worktree was
not edited.

Orion keeps five centreline twin turrets. Posen deliberately carries four twins
for the scenario's eight guns instead of claiming a historical twelve-gun
reconstruction. Screen ships have one forward single plus one aft twin mount,
matching three main guns and no secondary battery. Exact 1915 fine fittings
and turret/torpedo arrangements remain deliberately simplified.

## Technical evidence

- Main baseline: 244 tests passed; final: **284/284** passed.
- `npm run check`, Python compile check and `npm run build` passed. Vite still
  reports the existing large battle-renderer chunk advisory; no build error.
- All fourteen assets rebuilt after adding single-barrel turret support; all
  asset reports and pinned Khronos validation passed, zero errors/warnings.
- Earlier eight assets match main's material-labelled surface vertex sets to
  0.00001 m; counts match. Export triangle diagonals/order may differ, so byte
  or triangle-connectivity hashes are not preservation evidence. Original
  flagship/sail/ironclad specs remain unchanged.
- The eight-ship dreadnought pack is approximately **6.00 MiB**, uncompressed.
- Real viewport: both commanded sides, all six new names loaded authored hulls,
  correct relative metre scale, foam and wake present, funnel smoke anchors;
  three ticks advanced on each side; no unexpected console warnings/errors.
- Failed asset requests were deliberately tested in the browser: all six
  retained procedural models. Exact-name lookup and uncertain-contact no-fetch
  behavior also have regression tests.
- Exported-geometry ray tests check every exposed main barrel at three points,
  including centreline single guns. They caught Orion's original Q/funnel
  intersection and the original missing single-barrel support before fixes.
  A separate regression caught inherited unused screen secondary mounts.
- Unsupported three-gun turret input was rejected by headless Blender without
  exporting an asset; only single/twin gunhouses are supported.

| New asset | Triangles | Draw calls | KiB |
|---|---:|---:|---:|
| `hms-orion` | 20,778 | 7 | 994 |
| `sms-posen` | 19,446 | 7 | 899 |
| `hms-meteor` | 14,582 | 7 | 569 |
| `hms-laurel` | 14,110 | 7 | 544 |
| `sms-v186` | 13,330 | 7 | 537 |
| `sms-s33` | 14,298 | 7 | 567 |

## Reproducing the review

Run `npm ci`, `npm test`, `npm run check`, `npm run build`, then
`npm run ship:build -- <id>` for each ship with Blender 5.2 LTS available.
Set `FIXTURE_TOOLS` to the pinned validator tool prefix described in
[ship-fixtures.md](ship-fixtures.md) to include Khronos validation.
Review `output/ships/<id>/{profile,plan,quarter,stern-quarter,game-distance}.png`.
The local before/after viewport screenshots and browser evidence are under
`output/playwright/`; these review-only outputs are not shipped. The independent
verdict is also persisted at `.omx/state/dreadnought-independent/ralph-progress.json`.

A later merge with the Hampton steam kit must preserve both sets of registry
entries and rebuild **all** specs under the merged kit hash. See
[ship-pipeline.md](ship-pipeline.md#parallel-era-integration).

---

## Independent reviewer report

The following review was performed by a separate reviewer, not either asset
author, after final builds and screenshots. It is visual/technical acceptance,
not certification of historical accuracy.

# Independent dreadnought asset review

Scope reviewed: six newly authored non-flagship Dogger Bank assets (`hms-orion`, `sms-posen`, `hms-meteor`, `hms-laurel`, `sms-v186`, `sms-s33`) plus a quick regression preview of rebuilt flagships (`hms-lion`, `sms-seydlitz`).

## Visual evidence inspected

- Per-ship generated renders: `profile.png`, `plan.png`, `quarter.png`, `stern-quarter.png`, `game-distance.png` for all six new ships.
- Contact sheets and zoom sheets under `output/ships/independent-review-contact/`.
- Final live viewport captures: `output/playwright/after-{orion,posen,meteor,laurel,v186,s33}-viewport.png` and combined review sheet `output/ships/independent-review-contact/live-viewports-final.png`.
- Quick rebuilt-flagship sheets: `output/ships/independent-review-contact/hms-lion-views.png` and `sms-seydlitz-views.png`.

## Visual verdict

Pass for the requested enjoyable-fidelity tier. I did not find blocking visual artifacts such as buried bow/stern guns, floating main fittings, major hull seams, obvious boat/funnel clipping, or implausible silhouette failures in the inspected final images.

Ship-by-ship notes:

- `hms-orion`: five centerline twin turrets read clearly in profile/plan/quarter views; bow/stern guns are exposed; tripod foremast/funnels/deckhouses are grounded; viewport scale, wake and foam look coherent. Long mast shadows are visible at game distance but read as lighting, not model geometry.
- `sms-posen`: compact broad German hull and four twin mounts match the scenario-gun abstraction; wing turrets and fore/aft turrets are visible without apparent burial; funnels, masts and boats are grounded.
- `hms-meteor`: final fore mount is physically single-barrel and aft mount twin-barrel with no inherited decorative secondary mounts; funnels and deckhouses are grounded; no bow/stern burial visible.
- `hms-laurel`: final fore single + aft twin mounts read clearly with no inherited decorative secondary mounts; two-funnel silhouette is distinct from Meteor; no additional clipping/seam concern found.
- `sms-v186`: final fore single + aft twin mounts read clearly with no inherited decorative secondary guns; torpedo-boat rods/deckhouse suggestions are visible in plan/profile and do not appear accidentally buried; low German silhouette is distinct.
- `sms-s33`: final fore single + aft twin mounts read clearly with no inherited decorative secondary guns; three-funnel torpedo-boat silhouette is distinct from V186; no additional clipping/seam concern found.
- `hms-lion` / `sms-seydlitz` quick rebuild preview: no new obvious visual regression from the kit-stamp rebuild in the profile/plan/quarter/stern-quarter/game-distance sheets.

Non-blocking note: game-distance/viewports show long mast shadows on several tall-masted ships. They are consistent with scene lighting and not a mesh defect; tune shadows only if they distract in live play.

## Validation run

- `npm run check` — pass: `All JavaScript files pass syntax checks.`
- `python3 -m py_compile tools/blender/shipkit/parts.py` — pass.
- `npm test -- tests/dreadnought-assets.test.js` — pass: 10/10.
- `npm test` — pass: 284/284.
- `FIXTURE_TOOLS=/tmp/weather-gage-fixture-tools npm run ship:report -- <id>` for all six new ships — pass; each reports current spec, current kit, budget checks and Khronos validator `0 errors, 0 warnings`. The final four screen specs have `secondaryGuns: null`, preserving main battery 1+2 = 3 and secondary 0 for the scenario.

## Limitations

- I inspected committed/generated raster views and live viewport captures, not an interactive Blender scene.
- `lsp_diagnostics` was not available through the exposed tools in this subagent; I substituted the repo syntax check, full test suite, targeted asset tests, Python compile check and per-ship GLB reports/validator.
