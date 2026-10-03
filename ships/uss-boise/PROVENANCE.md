# USS Boise provenance

## References used
- Naval History and Heritage Command, DANFS entry “Boise I (CL-47)”: official service history for Boise and Cape Esperance context. URL: https://www.history.navy.mil/research/histories/ship-histories/danfs/b/boise-i.html
- Naval History and Heritage Command, USS Boise (CL-47) photograph collection: includes late-August 1942 and 1942–44 views used for the two-funnel light-cruiser silhouette and bridge/funnel relationships. URL: https://www.history.navy.mil/our-collections/photography/us-navy-ships/alphabetical-listing/b/uss-boise--cl-47-0.html
- Naval History and Heritage Command, DANFS entry “Brooklyn III (CL-40)”: Brooklyn-class dimensions and listed armament: displacement 9,700 tons, length 608 ft 4 in, beam 61 ft 9 in, draft 24 ft, armament 15 6-inch and 8 5-inch guns. URL: https://www.history.navy.mil/research/histories/ship-histories/danfs/b/brooklyn-iii.html
- Scenario source: `src/sim/scenarios.js`, `esperance`, lists USS Boise with `guns: 15`.

## Modelling decisions
- Original generated geometry; no protected drawings were traced and no local reference image is shipped.
- The model uses Brooklyn-class principal dimensions converted to metres: 185.4 m length, 18.8 m beam and 7.3 m draft. It is intentionally class-faithful rather than a measured Boise reconstruction.
- The October 1942 game silhouette prioritises readable features at battle distance: long narrow cruiser hull, two funnels, tiered forward bridge, tripod/pole mast mix, boats and searchlight platforms.
- The main battery is explicit and scenario-matched: five triple 6-inch turrets, three forward and two aft, for 15 turret guns total. Turret heights and spacing are deliberately opened up to keep barrels clear of deckhouses/funnels in the current viewer.
- Secondary 5-inch mounts, boats, aircraft-deck cues and small fittings are simplified and do not count toward scenario `guns`; they are included for visual fidelity only.

## Deliberate departures
- No 1942 camouflage pattern, individual AA tubs, catapult structure, aircraft, radar antenna lattice, or damage after Cape Esperance are modelled.
- The five turret positions are approximate for gameplay readability; the model favours unmistakable Brooklyn-class battery layout over strict plan accuracy.
- Late-war details visible in some NHHC photographs were not copied into this October 1942 model unless they supported a generic class silhouette.
