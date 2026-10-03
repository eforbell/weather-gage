# USS Minnesota: provenance and modelling decisions

Original geometry generated from `spec.json` by the headless Blender kit
(`tools/blender/`); no reference image, texture or third-party mesh is shipped.

**Fidelity, not a reconstruction.** The goal is a ship that reads as USS Minnesota
at game distance. No drawing was traced or overlaid, so the spec has no
`references[]`. Dimensions are rounded public facts; everything else is plausible.

| ID | Source | Use | Accessed |
|---|---|---|---|
| wiki | [USS Minnesota (1855)](https://en.wikipedia.org/wiki/USS_Minnesota_(1855)), Wikipedia | Dimensions, armament, configuration in March 1862 | 2026-10-03 |

## Facts used

A Merrimack-class screw frigate, about 80.5 m long, 15.5 m beam, 7 m draught; 43 guns in 1862, modelled as 14 gundeck and 7 spar-deck ports a side plus a 10-inch pivot on the forecastle (`guns: 43`); one funnel between the fore and main masts. The scenario rates firepower as an abstract `battery`, so the spec states the modelled gun count as `guns`.

## Deliberate choices (not evidence)

Derived from USS Congress's spec: the hull stretched to 80.5 m (the bowsprit's reach is not stretched), mast heights kept; under steam with sails furled; black with a white gunport band.
