# CSS Jamestown: provenance and modelling decisions

Original geometry generated from `spec.json` by the headless Blender kit
(`tools/blender/`); no reference image, texture or third-party mesh is shipped.

**Fidelity, not a reconstruction.** The goal is a ship that reads as CSS Jamestown
at game distance. No drawing was traced or overlaid, so the spec has no
`references[]`. Dimensions are rounded public facts; everything else is plausible.

| ID | Source | Use | Accessed |
|---|---|---|---|
| wiki | [CSS Jamestown](https://en.wikipedia.org/wiki/CSS_Jamestown), Wikipedia | Dimensions, armament, configuration in March 1862 | 2026-10-03 |

## Facts used

A smaller converted coastal steamer (ex-Thomas Jefferson), about 73 m long; side wheels; two guns, modelled as pivots fore and aft (`guns: 2`). The scenario rates firepower as an abstract `battery`, so the spec states the modelled gun count as `guns`.

## Deliberate choices (not evidence)

Derived from Patrick Henry's spec, scaled to 73 m, with the funnel abaft the engine and a schooner rig (gaffs, no square yards) so the two gunboats can be told apart.
