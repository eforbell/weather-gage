# Esperance authored fleet acceptance

Base: main `ef42580`, including PRs #17–21. Branch:
`feat/ww2-esperance-hero-models`; worktree `weather-gage-ww2-models`.

## Result

Twelve original hero models complete the Night off Cape Esperance fleet, with
1942 class-inspired silhouettes and the scenario's exact main turret counts.
The destroyers are game-focused, not precision archive reconstructions. Their
brief provenance notes record original authorship and deliberate simplifications.
References and review output are excluded from git.

Boise and Aoba were built first. Before accepting that pair, the leader's
exported-ray and visual checks caught Boise III's buried barrels and Aoba's
floating tripod feet. Both were corrected in specs. The other ten ships were
then built and inspected. Boise/Helena's elevated third forward turret is a
documented clearance/readability departure rather than an exact historical
arrangement. Fine camouflage, radar lattice, AA and aircraft fittings remain
simplified.

## Shared changes

- `src/ui/ship-assets.js`: twelve exact-name entries in `ww2`, local GLBs,
  explicit era/units/dimensions, zero waterline and rotation, provenance license.
- `src/ui/battle-presentation.js`: explicit `ww2: 180` metre reference. A single
  factor applies to all WW2 authored hulls; other era scales are unchanged.
- **Unavoidable Blender change:** only `tools/blender/shipkit/parts.py`, generic
  physical triple turrets, including mixed twin/triple Pensacola battery.
  Existing single/twin geometry is preserved. The kit previously rejected three.
- Rebuilt all21 older main models for the new kit stamp, including the recently
  merged seventy-fours. All prior specs remain unchanged; material-labelled
  surface vertex sets (0.00001 m, signed zero normalized) and triangle counts
  match main. Binary index order can vary; byte equality is not the contract.

## Validation

- **468/468** full tests; **27/27** WW2 coverage/battery/clearance/FOW/scale checks.
- JavaScript syntax checks, Python compile and production build pass. The build
  retains its existing large-renderer chunk advisory, not an error.
- All33 unique authored models pass current spec/kit reports. Khronos validator:
  zero errors/warnings. New models have baked AO, no textures/reference images,
  hull waterline contours, and checked turret/mast/funnel anchors.
- Normal playable Esperance viewport tested for both commanded sides: all12
  authored hulls loaded; smoke anchors, foam and wake present; three ticks
  advanced on each side; zero unexpected console warnings/errors.
- Deliberately blocked asset requests retain procedural hulls for all12 ships.
  Uncertain enemy contacts never fetch the named authored model.
- Independent visual review of profile, plan, quarter, stern-quarter,
  game-distance and all12 actual night captures: **94/100, pass**. No blocking
  buried barrels, floating fittings, major clipping or hull seams found.

## New asset budget

| Asset | Triangles | Draws | KiB |
|---|---:|---:|---:|
| `uss-san-francisco` | 21,719 | 7 | 932 |
| `uss-boise` | 23,583 | 7 | 1048 |
| `uss-salt-lake-city` | 22,147 | 7 | 974 |
| `uss-helena` | 23,795 | 7 | 1055 |
| `uss-farenholt` | 17,894 | 8 | 750 |
| `uss-duncan` | 17,694 | 8 | 746 |
| `uss-laffey` | 17,794 | 8 | 750 |
| `aoba` | 22,415 | 8 | 958 |
| `furutaka` | 22,715 | 8 | 968 |
| `kinugasa` | 22,415 | 8 | 959 |
| `fubuki` | 18,410 | 8 | 758 |
| `hatsuyuki` | 18,410 | 8 | 758 |

The WW2 pack is approximately **10.41 MiB raw**, with no compression or LODs.
Each ship is within its declared 40k /12 draws /2 MB budget. The aggregate is
above the research document's earlier8 MB aspiration; twelve hero hulls and
per-era lazy loading were preferred here over adding untested compression.
LOD/compression remains future work. Night lighting intentionally hides some
small details, especially Japanese destroyer bow mounts; silhouettes remain
readable and the barrel geometry tests pass.

## Reproduce / review

`npm ci`, `npm test`, `npm run check`, `npm run build`.
Build any ship with `FIXTURE_TOOLS=<validator prefix> npm run ship:build -- <id>`;
see [ship-fixtures.md](ship-fixtures.md) for the pinned validator setup.
A kit change requires rebuilding every spec, not just the new fleet.

Review-only renders: `output/ships/<id>/{profile,plan,quarter,stern-quarter,game-distance}.png`.
Normal gameplay before/after screenshots and metadata:
`output/playwright/ww2-{before,after}-<id>.png` and `ww2-evidence.json`.
Independent report: `output/ships/ww2-independent-review.md`; persisted verdict:
`.omx/state/ww2-independent/ralph-progress.json`. These local review outputs are
not shipped or committed as model references.
