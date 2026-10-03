# CSS Virginia: provenance and modelling decisions

Original geometry generated from `spec.json` by the headless Blender kit
(`tools/blender/`); no reference image, texture or third-party mesh is shipped.

**Fidelity, not a reconstruction.** The goal is a ship that reads as CSS Virginia
at game distance. No drawing was traced or overlaid, so the spec has no
`references[]`. Dimensions are rounded public facts; everything else is plausible.

| ID | Source | Use | Accessed |
|---|---|---|---|
| wiki | [CSS Virginia](https://en.wikipedia.org/wiki/CSS_Virginia), Wikipedia | Dimensions, armament, configuration in March 1862 | 2026-10-03 |

## Facts used

About 84 m long, 15.6 m beam, 6.7 m draught; the ends awash; a sloped iron casemate about 54 m long with rounded ends; 10 guns, modelled as four ports a side plus one at each end (`guns: 10`); one funnel; a conical pilothouse forward; an iron ram at the bow. The scenario rates firepower as an abstract `battery`, so the spec states the modelled gun count as `guns`.

## Deliberate choices (not evidence)

Casemate via the new `casemate` key; the ends sit just above the water so they read in the game; one port at each end instead of three; the roof grating is a flat dark panel; the Stars and Bars at a staff on the after end of the casemate.
