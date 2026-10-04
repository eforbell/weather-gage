# HMS Gentian: references and modelling decisions

Original geometry generated from `spec.json` for the 1942 North Atlantic convoy scenario. The asset is a fun, readable game silhouette, not a museum reconstruction, and no third-party mesh, texture, protected plan, or downloaded raster is shipped with it.

## Reference ledger

- Scenario source: `src/sim/scenarios.js` names HMS Gentian in `convoy` and assigns 1 light gun. This model carries one forward single main mount / one visible barrel to match that game contract.
- In-repo style source: existing WW2 specs use original metre-scale blockouts and existing rig-spar support details; Gentian follows that same fidelity tier.
- Limited fact check: public Flower-class summaries list the class at about 205 ft / 62.5 m overall with one forward 4-inch gun and depth-charge rails/throwers; HMS Gentian (K90) is listed as a Flower-class corvette.
  - https://en.wikipedia.org/wiki/HMS_Gentian_(K90)
  - https://en.wikipedia.org/wiki/Flower-class_corvette
  - https://naval-encyclopedia.com/ww2/uk/flower-class-corvettes.php

## Modelling notes

- Gentian uses true-metre Flower-class proportions: short broad hull, one funnel, one forward gun, compact bridge, pole mast and stern depth-charge rails.
- The single visible barrel follows the scenario gun count. Existing `rig.spars` form the stern rails, reload cylinders and side throwers; no Blender kit changes were needed.
- Gentian is deliberately a sister-style corvette but not a clone: slightly narrower/darker than Sackville with lower bridge/funnel/mast positions.

## Deliberate departures / limitations

- Exact Gentian refit details, AA weapons, radar, camouflage, davits, rails and boat/funnel details are approximate or omitted.
- The model prioritizes an immersive game silhouette and clear Flower-class ASW role over exhaustive provenance or precision.
- `tools/blender/` was not modified for this ship.
