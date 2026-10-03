# USS Salt Lake City provenance

## References used
- HyperWar, “CA-25 USS Salt Lake City,” compiled from Ships of the U.S. Navy 1940-1945, records Pensacola-class dimensions and wartime armament: length 585 ft 8 in, beam 65 ft 3 in, draft 22 ft 5 in, armament 2 × 3 and 2 × 2 8-inch/55 guns plus secondary/AA fittings. URL: https://www.ibiblio.org/hyperwar/USN/ships/CA/CA-25_SaltLakeCity.html
- Scenario source: `src/sim/scenarios.js`, `esperance`, lists USS Salt Lake City with `guns: 10`.

## Modelling decisions
- Original generated geometry; no protected drawings were traced and no local reference image is shipped.
- The model is a 1942 Pensacola-class heavy-cruiser silhouette: slim early treaty-cruiser hull, two tall funnels, bridge tower, tripod foremast, pole mainmast, boats and simplified 5-inch/AA positions.
- The main battery is explicit and scenario-matched: four turrets carrying two twins and two triples for 10 visible 8-inch barrels total.
- The current generic turret house is reused for both twin and triple mounts; this intentionally simplifies the true mixed mount sizes while preserving the visible barrel count.

## Deliberate departures
- No exact 1942 camouflage, AA tub layout, catapult/aircraft detail, radar lattice, or ship-specific damage/state is modelled.
- Turret and deckhouse spacing is approximate and tuned for game readability and exported barrel clearance rather than measured reconstruction.
