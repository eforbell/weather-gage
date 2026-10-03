# USS Monitor: provenance and modelling decisions

Original geometry generated from `spec.json` by the headless Blender kit
(`tools/blender/`); no reference image, texture or third-party mesh is shipped.

**Fidelity, not a reconstruction.** The goal is a ship that reads as USS Monitor
at game distance. No drawing was traced or overlaid, so the spec has no
`references[]`. Dimensions are rounded public facts; everything else is plausible.

| ID | Source | Use | Accessed |
|---|---|---|---|
| wiki | [USS Monitor](https://en.wikipedia.org/wiki/USS_Monitor), Wikipedia | Dimensions, armament, configuration in March 1862 | 2026-10-03 |

## Facts used

About 52.4 m long, 12.6 m beam, 3.2 m draught; a raft hull a little over half a metre above water; one revolving turret about 6.1 m across with two 11-inch Dahlgrens (`guns: 2`); the iron pilothouse near the bow; low smokestacks aft. The scenario rates firepower as an abstract `battery`, so the spec states the modelled gun count as `guns`.

## Deliberate choices (not evidence)

Round turret via `turretType.shape: "cylinder"`; the hull is one flat-sided raft section with no separate lower hull (it is under water anyway); the stacks are round, not square; the anchor well, awning and propeller are not modelled.
