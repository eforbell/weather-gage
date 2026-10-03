# USS San Francisco provenance

## References used
- Naval History and Heritage Command, DANFS “San Francisco II (CA-38),” records New Orleans-class dimensions and armament: displacement 9,950 tons, length 588 ft 2 in, beam 62 ft 9 in, draft 19 ft 5 in, armament 9 8-inch and 8 5-inch guns. URL: https://www.history.navy.mil/research/histories/ship-histories/danfs/s/san-francisco-ii.html
- Scenario source: `src/sim/scenarios.js`, `esperance`, lists USS San Francisco with `guns: 9`.

## Modelling decisions
- Original generated geometry; no protected drawings were traced and no local reference image is shipped.
- The model is a 1942 New Orleans-class heavy-cruiser silhouette: shorter heavy-cruiser hull than the Brooklyn light cruisers, compact tower bridge, two close funnels, tripod foremast, pole mainmast, boats and simplified 5-inch mounts.
- The main battery is explicit and scenario-matched: three triple 8-inch turrets, two forward and one aft, for 9 turret guns total.
- Secondary fittings and boats are included only as silhouette cues and do not count toward scenario `guns`.

## Deliberate departures
- No exact 1942 camouflage, radar lattice, aircraft/catapults, AA tub detail, battle damage or flagship-specific fittings are modelled.
- Superstructure and turret dimensions are approximate and tuned for readable game-distance silhouette and exported barrel clearance.
