# HMS Meteor provenance

## References used
- Wikipedia, HMS Meteor (1914), gives Thornycroft M-class identity and 274 ft overall length, 27 ft beam, 10 ft draught. URL: https://en.wikipedia.org/wiki/HMS_Meteor_(1914)
- Scenario source: `src/sim/scenarios.js`, Dogger Bank fictional January 1915 setup; destroyer/torpedo-boat firepower defaults to `guns: 3` via `dreadShip(...)`.

## Modelling decisions
- Original generated geometry; no protected drawings were traced and no local reference image is shipped.
- Meteor is side-faithful: long low Thornycroft M-class destroyer hull, raised forecastle, three funnels with a heavier middle funnel, grey British paint, light masts and compact fore/aft weapon positions.
- The scenario rates this screen combatant as `guns=3`. The model carries one forward single-barrel mount and one aft twin-barrel mount: three visible barrels and three counted guns. This is a deliberately compact game battery, not an exact historical mount arrangement. The shared kit now honours single and twin turret gun counts, while existing twin-barrel assets retain their geometry.

- Torpedo tubes and fine deck fittings are implied by small deckhouses, boats, funnels and mast silhouettes rather than modelled exactly for game-distance readability.
