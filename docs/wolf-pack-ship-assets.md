# Wolf Pack authored fleet acceptance

Base: clean main `2e2ff09` (merged PR #22). At start there were no open PRs or
active previous workers; existing merged worktrees were retained. New worktree:
`weather-gage-wolfpack-models`, branch `feat/wolf-pack-authored-models`.

## Scope and result

Four escorts, six freighters and four U-boats complete the remaining WWII Wolf
Pack silhouettes. This also completes named-ship coverage for every current
mission throughWW2. Cold War/modern models, carriers, bigger maps, balance and
side-selection UI remain out of scope.

These are original1942 class-inspired game models. Merchant dimensions are
artist-chosen freighter proportions, not assertions about the named historical
hulls; the boats share a coherent TypeVII-inspired silhouette with small tower,
periscope and paint variation. References, textures, museum-level fittings and
measured historical accuracy are not claimed or shipped. U-boats intentionally
omit deck guns because the scenario specifies zero gun battery.

No Blender kit changes, dependencies, era-scale changes or simulation edits.
Existing33 authored models and their specs are untouched. The180m WWII reference
keeps the62m corvettes/67m boats proportionally smaller than106–138m freighters.

## Validation

- **564/564** full tests; **26/26** convoy asset/battery/scale/FOW/visibility tests.
- Syntax check and production build pass; the existing large-renderer chunk
  advisory remains. All47 unique model reports and pinned Khronos validation
  pass, zero errors/warnings.
- Before/after actual night captures for all14 named hulls, both commanded sides,
  three ticks advanced per side. Authored hulls load, smoke anchors and contour
  foam/wake behave correctly; zero unexpected after-load console warnings.
- Deliberately blocked requests preserve procedural fallback for all14 names;
  uncertain contacts never fetch their authored models.
- Own U-96 loaded from a validated submerged save: targetY=-2.7, floating=false,
  underway=false, foamVisible=false, wakeVisible=false, funnels=0. Submerged
  enemy contacts are still filtered from surface actors.
- Independent rendered-view and night-capture review: **92/100, pass**. No
  blocking buried barrels, floating supports, hull seams or clipping found.
  U-201/U-432 are edge-framed/low contrast in captures; individual boat identity
  is subtle. These are non-blocking game-fidelity limits, not archive claims.
- Independent handoff verification: pass;26/26 and564/564 tests. Async stale-load
  identity/disposal and FOW guards remain in place. Race behavior was source-
  inspected and covered by existing stale-load tests, not a new browser stress run.

## Submerged load defect corrected

The first live check reproduced a pre-existing adoption issue: an authored boat
loaded atY=-2.7 with floating=false but newly created foamVisible=true. The
surface contour had been rebuilt correctly, but its visibility default was wrong.

`adoptAuthoredModel` now accepts optional `{ floating, underway }` (defaults keep
old callers unchanged). The battle view supplies the latest pending item's
surface/afloat/underway flags at the async swap. Both foam and wake respect those
flags from the first loaded frame. An exported-model unit regression fails
before this fix and passes after it; normal-gameplay import verifies the result.
This is a small visibility handoff repair, not new Cold War presentation or map work.

## New asset budgets

| Asset | Triangles | Draw calls | KiB |
|---|---:|---:|---:|
| `ss-empire-ocelot` | 16,652 | 8 | 634 |
| `ss-baron-ogilvy` | 15,386 | 8 | 582 |
| `ss-clan-macnab` | 16,632 | 8 | 634 |
| `ss-trevisa` | 14,194 | 8 | 551 |
| `ss-hartington` | 14,946 | 8 | 596 |
| `ss-bretwalda` | 13,634 | 8 | 541 |
| `hms-walker` | 16,952 | 7 | 748 |
| `hms-stork` | 15,934 | 7 | 692 |
| `hmcs-sackville` | 13,330 | 7 | 582 |
| `hms-gentian` | 13,330 | 7 | 583 |
| `u-96` | 7,978 | 6 | 276 |
| `u-201` | 7,978 | 6 | 276 |
| `u-552` | 7,978 | 6 | 277 |
| `u-432` | 7,978 | 6 | 276 |

The incremental Wolf Pack pack is approximately **7.08 MiB raw**. Each asset is
within its declared budget. No compression/LODs were introduced. Per-era/template
loading stays lazy; models are not fetched merely because another scenario
shares the `ww2` era.

## Reproduce and inspect

`npm ci`, `npm test`, `npm run check`, `npm run build`.
`FIXTURE_TOOLS=<pinned-validator-prefix> npm run ship:build -- <id>` for any hull;
see [ship-fixtures.md](ship-fixtures.md) for the validation tool setup.

Ignored review outputs: `output/ships/<id>/{profile,plan,quarter,stern-quarter,game-distance}.png`;
`output/playwright/wolfpack-{before,after}-<id>.png`, `wolfpack-evidence.json`
and `wolfpack-submerged-u-96.png`; independent review/verification Markdown in
`output/ships/`. These review-only outputs and all reference inputs stay out of git.
