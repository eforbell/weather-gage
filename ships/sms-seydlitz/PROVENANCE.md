# SMS Seydlitz: references and modelling decisions

Original geometry generated from `spec.json`, representing the undamaged
January 1915 Dogger Bank starting configuration. No third-party mesh, reference
raster, archive page, or texture is embedded in the GLB or shipped with the game.

## Reference ledger (accessed 2026-10-02)

| Reference | Origin and rights/access distinction | Use |
|---|---|---|
| [1913 dockyard plans](https://www.dreadnoughtproject.org/plans/SM_Seydlitz_1913/) | Official Blohm & Voss / Kaiserliche Marine ventilation drawings, dated 25 April 1913, from Bundesarchiv via The Dreadnought Project ([custody corroboration](https://www.model-monkey.com/product-page/battlecruiser-sms-seydlitz-profile-view)). The hosted scans carry a **Copyright © 2003 The Dreadnought Project** label. Access is not a blanket redistribution or tracing licence. | Factual hull/deck dimensions, component centres and arrangement. Original lofted sections and parametric fittings, not copied pixels, vector contours, textures or a pre-existing model. Scans remain private, git-ignored authoring inputs. |
| [ONI, *German Navy—Part III, Section 2*, June 1917](https://ncisahistory.org/wp-content/uploads/2019/11/No.-15-German-Navy-Battleships-and-Battle-Cruisers-June-1917.pdf) | Contemporary US Office of Naval Intelligence publication; a scan hosted by the NCIS Association. US federal-government source. PDF leaves 25–27 contain Seydlitz data; Plate 12 on leaf 49 is **cropped**, not a complete silhouette reference. | Gun-axis elevations, nominal design draught, deck-height/armament corroboration. Later-war removals in its text are not copied into the January 1915 configuration. |
| [Pre-war photograph, NH 46839](https://commons.wikimedia.org/wiki/File:German_battlecruiser_SMS_Seydlitz_in_port_c1913.jpg) | M. L. Carstens photograph, circa 1913–1914, held by NHHC; Commons records public-domain statements. Those statements are source-specific, not a general licence for other artwork. | Two pole masts, funnel/superstructure silhouette and pre-war arrangement; no photographic texture. |
| [Public dimensions](https://commons.wikimedia.org/wiki/Category:SMS_Seydlitz_(ship,_1912)) | Factual measurements only. | Overall 200.6 m length and 28.5 m beam. |

We do not claim that every scan or its modern annotation is freely
redistributable. Only engineering facts inform the original model. The
[US Copyright Office's distinction between facts and their expression](https://copyright.gov/help/faq/faq-protect.html)
is relevant; it is not a worldwide rights clearance for reference imagery.
Do not commit the scans, publish the reference overlays, copy modern protected
illustrations, or replace this original geometry with downloaded artist meshes.

## Reproducing local authoring references

Direct dockyard URLs currently return a bot challenge. These archived copies
are the historical scans, not screenshots of a modern model:

```sh
mkdir -p ships/sms-seydlitz/reference
curl -fL -o ships/sms-seydlitz/reference/dockyard1913-profile.jpg \
 'https://web.archive.org/web/20060622034844if_/http://www.dreadnoughtproject.org:80/plans/SM_Seydlitz_1913/luftungsanlage_langsschnitt_100dpi.jpg'
curl -fL -o ships/sms-seydlitz/reference/dockyard1913-plan.jpg \
 'https://web.archive.org/web/20060622034941if_/http://www.dreadnoughtproject.org:80/plans/SM_Seydlitz_1913/luftungsanlage_obere_ansicht_oberdeck_100dpi.jpg'
curl -fL -o ships/sms-seydlitz/reference/dockyard1913-cross-sections.jpg \
 'https://web.archive.org/web/20060622034859if_/http://www.dreadnoughtproject.org:80/plans/SM_Seydlitz_1913/luftungsanlage_querschnitte_100dpi.jpg'
```

| File | Source pixels | SHA-256 |
|---|---|---|
| `dockyard1913-profile.jpg` | 9155 × 3445 | `1d9f8749e169e0dc39d9ba47def799d1501fcaddf42c1d58dc5d641227b65118` |
| `dockyard1913-plan.jpg` | 8693 × 3544 | `66ae105490f186295b2b977c5f655480aec3d6386c9985a749c413426942bb01` |
| `dockyard1913-cross-sections.jpg` | 6870 × 3689 | `288b4f15dc48619cb909c5e59c87d7bd3170af1eb3575ad9257900189cc10adb` |

## Calibration and configuration

- The dockyard drawing has **bow right**. Profile calibration: bow x=8420,
  stern x=525, waterline y=1376, about 39.36 source pixels/metre. The plan:
  bow x=8270, stern x=390, centreline y=1320, about 39.28 pixels/metre.
- The overlay mirrors the profile but **rotates the plan 180°**. Mirroring a
  top view alone reverses physical port/starboard and would validate the wrong
  wing-turret arrangement. The model itself is never mirrored.
- Five twin 28 cm mounts: A forward; **B starboard and forward of C port**;
  D raised over E aft. `aft` centres are 46, 92, 120, 145, 156.5 m; wing
  offsets ±7.4 m. These are approximate measurements, not surveyed coordinates.
- The gun axes use contemporary tabulated heights: A 10.363 m, B/C 8.153 m,
  D 8.433 m, E 5.994 m. Tests check the real GLB anchors within 0.2 m.
- Overall beam is measured at the waterline. The weather deck narrows through
  tumblehome; do not inflate the deck to 28.5 m just to match the dimension field.
- Two straight-sided oval funnels on boxy uptake casings (the ONI 1917 elevation shows straight funnel sides; an earlier tapered-cone casing read as a cooling tower and was dropped); two pole masts. The ventilation
  section omits full mast tops and gunhouse silhouettes. Pole tops (43/40 m)
  and spotting-top detail are best-effort interpretations of the photograph,
  not a claimed ±1 m surveyed reconstruction.

## Deliberate departures / limitations

- Underwater sections are an original fair approximation, informed by the
  dockyard body-section shape, not a full digitised lines plan. Draught uses
  nominal design loading (8.2 m), not the deeper fully loaded value.
- Bridge, secondary-gun casemates, searchlights, boats and vents are simplified.
  No cut-through casemate openings, rails, rigging, scuttles, net booms/net
  shelves, crane geometry, torpedo tubes, pennants or deck-planking textures yet.
  Pre-war net fittings were present but are explicitly omitted, not mistaken
  for the later configuration where they had been removed.
- Neutral wartime grey, boot topping and readability-oriented shading are art
  choices. They are not a precise paint-chip reconstruction.
- The asset remains at true beam. Procedural fleet shapes use the shared
  class-proportion policy in [the visual direction](../../docs/3d-visual-direction.md#fleet-proportions-2026-10-02).
