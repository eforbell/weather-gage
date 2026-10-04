# BNS Kestrel: references and modelling decisions

Original fictional geometry for the Near-future Strait exercise. This is a quick game-readability model, not a historical or real-world reconstruction, and no downloaded plans, meshes, textures, or protected artwork were used.

## Reference ledger

- Scenario source: `src/sim/scenarios.js` names BNS Kestrel as a littoral frigate with finite missile ammo and point defense but no gun-count field. The authored asset therefore declares `guns: 1` and carries one visible forward single turret for the visual gun contract.
- Design intent from task brief: a smaller 120–130 m low-profile modern frigate, distinct from Valiant through a shorter hull, compact bridge/mast silhouette, separated launcher cues and a smaller stern helicopter deck.
- All geometry is original parametric JSON using existing generic ship-kit parts only.

## Deliberate departures / limitations

- VLS cells, canister racks and radar panels are visual identity cues, not literal ammunition counts or sensor specifications.
- The hull, mast, radar, exhaust and helicopter-deck arrangement is fictional and tuned for immersion at game distance.
- `tools/blender/`, registry, tests and shared docs were not modified for this ship.

Launcher cradles and mast supports are simplified original fittings, seated into the deck or existing bridge blocks for readable, grounded game geometry.
