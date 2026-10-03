# USS Helena provenance

## References used
- USS Helena Association, “Helena as outfitted during her last major overhaul period at Mare Island Navy Yard, June 1942,” records dimensions and 1942 armament: 607 ft 4-1/8 in overall length, 61 ft 7-1/2 in beam, 15 6-inch/47 in five triple turrets, 8 5-inch/38 in four twin mounts, 16 40 mm and 12 20 mm AA. URL: https://www.usshelena.org/datacl50.html
- NavSource, Cruiser Photo Index CL-50 USS Helena, identifies Helena as a modified Brooklyn / St. Louis class cruiser and includes Mare Island June-July 1942 starboard-side references used for the simplified two-funnel, compact-bridge silhouette. URL: https://www.navsource.net/archives/04/050/04050.htm
- Scenario source: `src/sim/scenarios.js`, `esperance`, lists USS Helena with `guns: 15`.

## Modelling decisions
- Original generated geometry; no protected drawings were traced and no local reference image is shipped.
- The model is a class-faithful 1942 St. Louis-subclass Brooklyn silhouette: long narrow cruiser hull, two funnels, compact layered bridge, tripod foremast, pole mainmast, boats and simplified dual-purpose gun positions.
- The main battery is explicit and scenario-matched: five triple 6-inch turrets, three forward and two aft, for 15 turret guns total.
- Turret III uses the corrected Boise-style elevated barbette so all three exported barrels clear the forward platforms in the game asset tests.
- Secondary 5-inch/38, AA, boats and searchlight platforms are simplified for game-distance readability and do not count toward scenario `guns`.

## Deliberate departures
- No exact Mare Island camouflage, exact AA tubs, lattice radar antennas, catapults/aircraft, or battle damage are modelled.
- Turret spacing, superstructure heights and deckhouse shapes are adjusted for visual clarity and barrel clearance rather than measured reconstruction.
