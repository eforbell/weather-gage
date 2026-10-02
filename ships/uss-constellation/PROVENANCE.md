# USS Constellation: provenance and modelling decisions

The model is original geometry, generated from `spec.json` by the headless
Blender kit (`tools/blender/`, sail fittings in `shipkit/sail.py`). No reference
image, texture or third-party mesh is embedded in, or shipped with, the GLB.

## Approach

This is a **side-faithful, not ship-faithful** model. The brief for the Nevis
scenario was that American and French frigates should read as different
navies; exact historical accuracy of each named ship was not required. No
drawing was traced or overlaid, so the spec has no `references[]` and the
build produces no overlay. Dimensions are rounded public facts; everything
else is a plausible late-18th-century frigate.

| ID | Source | Use | Accessed |
|---|---|---|---|
| wiki-constellation | [USS Constellation (1797)](https://en.wikipedia.org/wiki/USS_Constellation_(1797)), Wikipedia | Dimensions, rating, Quasi-War service | 2026-10-02 |
| nhhc-danfs | [NHHC DANFS, Constellation I](https://www.history.navy.mil/research/histories/ship-histories/danfs/c/constellation-i.html) | Design family (Humphreys/Fox), service | 2026-10-02 |

## Facts used

- About 50 m (164 ft) on the gundeck, 12.5 m (41 ft) beam, about 6 m draught.
- One of Humphreys' original six frigates: a **flush spar deck** with a continuous bulwark, the American heavy-frigate look.
- 38 guns, matching `guns: 38` in the Nevis scenario: 14 gundeck ports a side plus 5 on the spar deck (2 forecastle, 3 quarterdeck).

## Deliberate choices (not evidence)

- **Paint:** black hull with a yellow-ochre band through the gundeck ports and black port lids (the "chequer" look), ochre bulwark interiors, natural masts, black yards, coppered bottom. Chosen to read as American next to the French ships' red bands.
- **Rig pose:** fighting sail on a broad reach, wind on the starboard quarter: courses clewed up, topsails and topgallants set, royals furled, yards braced 22°. The game does not animate sails yet, so this one pose serves every heading.
- **Flags:** a 13-stripe ensign at the gaff and another at the main truck, coloured through the baked vertex colours (no textures). The 1795 flag had 15 stripes; 13 read the same at game distance.
- **Underwater lines, head, stern galleries and rigging** are plausible, not measured. Shrouds and stays are thicker than real rope so they survive at game distance.
- **Not modelled:** ratlines, running rigging, boats, anchors, channels' deadeyes, carronade slides, deck furniture.
