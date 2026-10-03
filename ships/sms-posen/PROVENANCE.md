# SMS Posen provenance

## References used
- German-Navy.de, "Posen Technical Data": Nassau-class dimensions (146.1 m length, 26.9 m beam) and class identity. URL: https://german-navy.de/hochseeflotte/ships/battleships/posen/tech.html
- Nassau-class summaries and contemporary descriptions identify the unusual six-turret hexagonal arrangement and historical twelve 28 cm guns. URL: https://en.wikipedia.org/wiki/Nassau-class_battleship
- Scenario source: `src/sim/scenarios.js`, Dogger Bank fictional January 1915 setup, where SMS Posen carries `guns: 8`.

## Deliberate abstractions
- Original generated geometry; no protected drawings were traced and no local reference image is shipped.
- The model deliberately reduces Posen from the historical six twin turrets to four visible twin turrets (A, a port/starboard echelon pair, and Y) so the authored silhouette honestly carries the scenario's 8 guns. Historically Posen carried twelve main guns in six turrets.
- The retained wing-turret shoulders, broad beam, two funnels and compact upperworks keep the side recognisable at game distance without pretending to be a measured Nassau-class reconstruction.
- Secondary guns, boats and upperworks are simplified for game-distance readability; side-faithful, not measured ship-faithful.
