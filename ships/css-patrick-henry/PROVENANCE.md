# CSS Patrick Henry: provenance and modelling decisions

Original geometry generated from `spec.json` by the headless Blender kit
(`tools/blender/`); no reference image, texture or third-party mesh is shipped.

**Fidelity, not a reconstruction.** The goal is a ship that reads as CSS Patrick Henry
at game distance. No drawing was traced or overlaid, so the spec has no
`references[]`. Dimensions are rounded public facts; everything else is plausible.

| ID | Source | Use | Accessed |
|---|---|---|---|
| wiki | [CSS Patrick Henry](https://en.wikipedia.org/wiki/CSS_Patrick_Henry), Wikipedia | Dimensions, armament, configuration in March 1862 | 2026-10-03 |

## Facts used

A converted coastal passenger steamer (ex-Yorktown), about 76 m long and 10.4 m in beam; side wheels; a walking-beam engine; brigantine rig; 12 guns, modelled as two pivots and ten broadside guns on deck (`guns: 12`). The scenario rates firepower as an abstract `battery`, so the spec states the modelled gun count as `guns`.

## Deliberate choices (not evidence)

Paddle boxes and walking beam via the new `paddleBoxes` and `walkingBeam` keys; deck guns via `deckGuns`; the saloon house, pilothouse, paint (black hull, white paddle boxes and houses) and gun positions are plausible, not measured.
