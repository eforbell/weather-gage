# SS Trevisa provenance

## References used
- Scenario source: `src/sim/scenarios.js`, `convoy`, names this merchant as `SS Trevisa` through the `merchant(...)` helper. The helper assigns `guns: 0`; this spec therefore has no counted turrets, deck guns, batteries or casemate ports.
- Principal dimensions and silhouette are artist-chosen within the requested 1942 tramp-freighter range (112 m × 15.6 m). No measured claim is made for the historical vessel.

## Modelling decisions
- Original generated geometry from the repository ship kit; no protected drawings, photographs or third-party meshes were traced or imported.
- Built as a fun, readable 1942 North Atlantic merchant: broad cargo hull, central bridge, one funnel, cargo hatch blocks, lifeboats, kingposts and angled derrick booms.
- Uses WW2 metre units and the era's 180 m reference scaling; the dimensions are true model metres, not a per-ship presentation hack.

## Deliberate departures
- This is not a museum reconstruction of SS Trevisa. Hatch spacing, paint, sheer, kingpost positions and deckhouse proportions are chosen for convoy-at-night readability and to keep fittings clear of the hull.
- Fine cargo gear, ventilators, anti-aircraft weapons, weathering and individual wartime camouflage are omitted. Scenario gun count remains zero.
