# Aoba: references and modelling decisions

Original geometry generated from `spec.json`, representing Aoba in an October
1942 Cape Esperance-ready configuration. No third-party mesh, texture, reference
raster, archive page, or downloaded drawing is embedded in the GLB or shipped
with the game.

## Reference ledger (accessed 2026-10-03)

| Reference | Origin and rights/access distinction | Use |
|---|---|---|
| [ONI identification image, Aoba class heavy cruiser, NH 97733](https://commons.wikimedia.org/wiki/File:ONI_identification_image_Aoba_class_heavy_cruiser.jpg) | Office of Naval Intelligence / U.S. Navy recognition drawing dated 1940; Commons records it as a U.S. federal-government public-domain work. | Overall recognizable Aoba/Kinugasa silhouette: two forward superfiring turrets, one aft turret, high tiered bridge, twin funnels, aft aircraft-handling area and mast rhythm. Used as reference only; no pixel tracing or raster data is committed. |
| [U.S. Navy recognition drawing for Aoba-class cruisers](https://commons.wikimedia.org/wiki/File:AobaClassCruiser.jpg) | U.S. Navy recognition drawing; Commons records public-domain status. | Cross-check of class silhouette and major fitting order. |
| [Combined Fleet / Nihon Kaigun Furutaka-class cruiser page](https://combinedfleet.com/ships/furutaka) | Public web reference summarising Furutaka/Aoba-class dimensions and TROM links. | Factual dimensions cross-check, especially Aoba-class beam difference noted separately from the Furutaka baseline. |
| [Japanese-warship.com Aoba page](https://japanese-warship.com/heavy/aoba/) | Public secondary reference in Japanese with tabulated Aoba particulars and refit notes. | Corroborated 185.17 m length, 17.56 m beam, and late-1930s/1940 modernization context. |
| [Scenario source](../../src/sim/scenarios.js) | In-repo game scenario. | The scenario's `esperance` entry gives Aoba six medium guns; this asset therefore carries exactly three twin turrets / six visible main barrels. |

The model uses factual ship dimensions and high-level arrangement facts, but the
hull loft, deckhouse footprints, mast heights and small fittings are original
parametric approximations. Reference images, if downloaded locally during future
rebuilds, must remain under `ships/aoba/reference/` and out of git.

## Configuration notes

- Hull dimensions in the spec are 185.17 m length, 17.56 m beam and 5.66 m draft
  to match the modernized Aoba-class proportions used by the scenario.
- Main battery is six 20.3 cm / 8-inch guns in three twin mounts: A and B forward,
  B superfiring; Y aft. The visible turret-gun count equals the scenario `guns: 6`.
- The model emphasizes a flared, long, narrow cruiser hull; a tall tiered Japanese
  bridge; twin funnels on uptake casings; pole/tripod mast silhouettes; boats and
  an aft diagonal catapult represented with existing `rig.spars`.
- Secondary and AA details are non-counted visual fittings only; they do not alter
  the scenario main-gun contract.

## Deliberate departures / limitations

- This is an enjoyable hero-read model, not a surveyed reconstruction. Exact
  station offsets, armor belt geometry, bridge platform outlines, director tubs,
  torpedo-tube doors, davits, rails, floatplane shape and wartime camouflage are
  simplified or omitted.
- No modern commercial plan, protected artwork, model-kit geometry, or downloaded
  3D mesh was traced or incorporated. The ONI silhouettes guided proportions only.
- Paint is neutral IJN-style grey with readable deck and boot-topping contrast for
  the game lighting; it is not a paint-chip claim for October 1942.
- `tools/blender/` was not modified for this ship.
