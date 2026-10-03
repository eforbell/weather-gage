# SMS V186 provenance

## References used
- Wikipedia, SMS V186, identifies V186 as an S-138-class large torpedo boat and describes its torpedo-boat arrangement and torpedo outfit. URL: https://en.wikipedia.org/wiki/SMS_V186
- Scenario source: `src/sim/scenarios.js`, Dogger Bank fictional January 1915 setup; destroyer/torpedo-boat firepower defaults to `guns: 3` via `dreadShip(...)`.

## Modelling decisions
- Original generated geometry; no protected drawings were traced and no local reference image is shipped.
- V186 is side-faithful: smaller than the British destroyers, older German torpedo-boat proportions, two funnels, low freeboard, darker German paint, and compact fore/aft weapon positions.
- The scenario rates this screen combatant as `guns=3`. The model carries one forward single-barrel mount and one aft twin-barrel mount: three visible barrels and three counted guns. This is a deliberately compact game battery, not an exact historical mount arrangement. The shared kit now honours single and twin turret gun counts, while existing twin-barrel assets retain their geometry.
- Torpedo identity is suggested with paired dark `rig.spars` rods mounted on low deckhouse/tube-bank blocks; remaining fine deck fittings are implied by small deckhouses, boats, funnels and mast silhouettes rather than modelled exactly for game-distance readability.
