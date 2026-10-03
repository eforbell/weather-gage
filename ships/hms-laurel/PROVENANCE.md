# HMS Laurel provenance

## References used
- Wikipedia, HMS Laurel (1913), gives Laforey-class identity and approximate 268 ft overall length, 27 ft beam, 10 ft draught; class references note Laurel/Liberty as two-funnel ships. URL: https://en.wikipedia.org/wiki/HMS_Laurel_(1913)
- Scenario source: `src/sim/scenarios.js`, Dogger Bank fictional January 1915 setup; destroyer/torpedo-boat firepower defaults to `guns: 3` via `dreadShip(...)`.

## Modelling decisions
- Original generated geometry; no protected drawings were traced and no local reference image is shipped.
- Laurel is side-faithful: compact Laforey-class hull, raised forecastle and the two-funnel Samuel White silhouette noted in class references, grey British paint, light masts and compact fore/aft weapon positions.
- The scenario rates this screen combatant as `guns=3`. The model carries one forward single-barrel mount and one aft twin-barrel mount: three visible barrels and three counted guns. This is a deliberately compact game battery, not an exact historical mount arrangement. The shared kit now honours single and twin turret gun counts, while existing twin-barrel assets retain their geometry.

- Torpedo tubes and fine deck fittings are implied by small deckhouses, boats, funnels and mast silhouettes rather than modelled exactly for game-distance readability.
