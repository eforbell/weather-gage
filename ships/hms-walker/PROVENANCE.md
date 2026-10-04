# HMS Walker: references and modelling decisions

Original geometry generated from `spec.json` for the 1942 North Atlantic convoy scenario. The asset is a fun, readable game silhouette, not a museum reconstruction, and no third-party mesh, texture, protected plan, or downloaded raster is shipped with it.

## Reference ledger

- Scenario source: `src/sim/scenarios.js` names HMS Walker in `convoy` and assigns 4 light guns. This model carries four single main mounts / four visible barrels to match that game contract.
- In-repo style source: existing WW2 destroyer specs (`ships/uss-farenholt/`, `ships/uss-duncan/`, `ships/uss-laffey/`) set the metre-scale blockout pattern: authored hull offsets, simple superstructure blocks, pole masts, funnels, boats, and rig-spar weapons/details.
- Limited fact check: uboat.net lists HMS Walker (D 27) as an Admiralty V & W-class destroyer. Naval-History.net's HMS Walker service history also identifies Walker as a V & W-class destroyer. Public summaries of V/W wartime escorts describe old destroyer conversions with radar/ASW refits rather than a modern fleet-destroyer silhouette.
  - https://www.uboat.net/allies/warships/ship/4266.html
  - https://www.naval-history.net/xGM-Chrono-10DD-09VW-Walker.htm

## Modelling notes

- Length and beam are true-metre V/W-style escort-destroyer proportions, rounded to a 95 m × 8.6 m readable model rather than traced from plans.
- Four single centreline mounts intentionally follow the scenario gun count. Two slim funnels, high bridge/radar-like upperwork, boats, pole masts and stern depth-charge rails distinguish Walker from the newer U.S. destroyer assets.
- Depth-charge rails and thrower/readable reloads are built from existing `rig.spars` cylinders; no Blender kit changes were made.

## Deliberate departures / limitations

- Exact station offsets, 1942 Walker refit fittings, AA weapons, directors, bridge wings, HF/DF/radar antennas, rails and camouflage are approximate or omitted.
- The model prioritizes an immersive game silhouette and clear ASW escort role over exhaustive provenance or precision.
- `tools/blender/` was not modified for this ship.
