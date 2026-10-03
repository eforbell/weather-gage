# USS Laffey: references and modelling decisions

Original geometry generated from `spec.json` for the October 1942 Cape Esperance scenario. The asset is a fun, readable game silhouette, not a museum reconstruction, and no third-party mesh, texture, protected plan, or downloaded raster is shipped with it.

## Reference ledger

- Original parametric hull and fittings: narrow 1942 destroyer proportions, two funnels, tiered bridge, pole masts and exposed main guns were authored directly in the ship spec.
- U.S. Navy class-inspired shape: dimensions and arrangement are approximate and chosen for a recognizable in-game silhouette.
- Scenario source: `src/sim/scenarios.js` names USS Laffey at Cape Esperance and assigns the destroyer main-gun count. This model carries four single 5-inch gunhouses / four visible barrels to match that game contract.

## Modelling notes

- Hull length and beam are true-metre style destroyer proportions, with a narrow deck and simplified sheer/deck break.
- Torpedo-tube banks are represented by existing `rig.spars` cylinders so the midships weapons read from game distance without changing the Blender kit.
- Small boats, searchlights, secondary/AA-like mounts, jackstaffs and masts are simplified visual fittings only.

## Deliberate departures / limitations

- Exact station offsets, bridge plans, radar antennas, directors, splinter shields, davits, camouflage, railings and refit-specific fittings are approximate or omitted.
- The model prioritizes an immersive game silhouette and visible weapon layout over exhaustive provenance or precision.
- `tools/blender/` was not modified for this ship.
