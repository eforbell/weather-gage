# HMCS Sackville: references and modelling decisions

Original geometry generated from `spec.json` for the 1942 North Atlantic convoy scenario. The asset is a fun, readable game silhouette, not a museum reconstruction, and no third-party mesh, texture, protected plan, or downloaded raster is shipped with it.

## Reference ledger

- Scenario source: `src/sim/scenarios.js` names HMCS Sackville in `convoy` and assigns 1 light gun. This model carries one forward single main mount / one visible barrel to match that game contract.
- In-repo style source: existing WW2 specs use original metre-scale blockouts and existing rig-spar support details; Sackville follows that same fidelity tier.
- Limited fact check: Canada’s Naval Memorial material and other public Sackville summaries identify Sackville as a Flower-class corvette about 205 ft / 62.5 m long, about 33 ft / 10 m beam, armed around the convoy-war period with a forward 4-inch gun and depth-charge rails/throwers. uboat.net/Nauticapedia-style summaries likewise identify her as a Flower-class corvette.
  - https://www.canadasnavalmemorial.ca/wp-content/uploads/Action-Stations-Fall-2015.pdf
  - https://sites.google.com/site/noabc2project/hmcs-sackville
  - https://nauticapedia.ca/vessel.php?id=14261

## Modelling notes

- Sackville uses true-metre Flower-class proportions: a short, broad 62.5 m hull, tall bridge, one funnel, pole mast, one forward gun and a stern ASW working deck.
- The single visible barrel follows the scenario gun count. Depth-charge rails and side throwers are represented by existing `rig.spars` cylinders so the stern reads as an ASW escort from game distance.
- The slightly lighter Canadian grey palette and high bridge differentiate Sackville from Gentian while keeping the shared Flower-class shape language.

## Deliberate departures / limitations

- Exact 1942 Sackville appearance, camouflage, AA fit, radar lantern, davits, railing, bridge detail and deck equipment are approximate or omitted.
- The model prioritizes an immersive game silhouette and clear Flower-class ASW role over exhaustive provenance or precision.
- `tools/blender/` was not modified for this ship.
