# HMS Stork: references and modelling decisions

Original geometry generated from `spec.json` for the 1942 North Atlantic convoy scenario. The asset is a fun, readable game silhouette, not a museum reconstruction, and no third-party mesh, texture, protected plan, or downloaded raster is shipped with it.

## Reference ledger

- Scenario source: `src/sim/scenarios.js` names HMS Stork in `convoy` and assigns 6 light guns. This model carries three twin main mounts / six visible barrels to match that game contract.
- In-repo style source: existing WW2 specs use original metre-scale blockouts with class-inspired hulls and existing kit parts; Stork follows that same fidelity tier.
- Limited fact check: uboat.net lists Bittern-class sloops with 6 × 4-inch AA guns in 3 twin mounts. Navypedia's Bittern-class page lists Stork and gives about 86 m length with 3 × 2 102 mm guns plus ASW gear.
  - https://uboat.net/allies/warships/class.html?ID=162&navy=HMS
  - https://navypedia.org/ships/uk/brit_sl_bittern.htm

## Modelling notes

- Stork is represented as a Bittern-class-inspired sloop, not a Black Swan clone: shorter and broader than a destroyer, with a single funnel, high bridge, and one aft twin mount.
- Three twin mounts provide exactly six visible barrels. The broad sloop hull and compact single-funnel upperworks intentionally separate her silhouette from Walker and the corvettes.
- Depth-charge rails and thrower/readable reloads are built from existing `rig.spars` cylinders; no Blender kit changes were made.

## Deliberate departures / limitations

- Exact 1942 Stork refit details, bridge/radar/davit geometry, directors, small AA weapons, camouflage and rails are approximate or omitted.
- The model prioritizes an immersive game silhouette and scenario gun-count readability over exhaustive provenance or precision.
- `tools/blender/` was not modified for this ship.
