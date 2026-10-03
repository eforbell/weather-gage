# SMS S33 provenance

## References used
- Wikipedia, SMS S33, gives V25-class/S31 group dimensions (79.6 m overall, 8.3 m beam, 2.8 m draught) and light-gun torpedo-boat armament. URL: https://en.wikipedia.org/wiki/SMS_S33
- Scenario source: `src/sim/scenarios.js`, Dogger Bank fictional January 1915 setup; destroyer/torpedo-boat firepower defaults to `guns: 3` via `dreadShip(...)`.

## Modelling decisions
- Original generated geometry; no protected drawings were traced and no local reference image is shipped.
- S33 is side-faithful: newer German large torpedo-boat proportions, narrow beam, three funnels, low dark profile, and compact fore/aft weapon positions.
- The scenario rates this screen combatant as `guns=3`. The model carries one forward single-barrel mount and one aft twin-barrel mount: three visible barrels and three counted guns. This is a deliberately compact game battery, not an exact historical mount arrangement. The shared kit now honours single and twin turret gun counts, while existing twin-barrel assets retain their geometry.
- Torpedo identity is suggested with paired dark `rig.spars` rods mounted on low deckhouse/tube-bank blocks; remaining fine deck fittings are implied by small deckhouses, boats, funnels and mast silhouettes rather than modelled exactly for game-distance readability.
