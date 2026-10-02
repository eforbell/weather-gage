# HMS Lion: provenance and modelling decisions

The model is original geometry, generated from `spec.json` by the headless
Blender kit (`tools/blender/`). No reference image, texture or third-party mesh
is embedded in, or shipped with, the GLB.

## References

| ID | Source | Rights statement | Use | Accessed |
|---|---|---|---|---|
| janes-1918-profile | *Jane's Fighting Ships* 1919, "Type of British battle cruiser: The Lion" (profile and plan), via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Lion_class_battleship_-_Jane%27s_Fighting_Ships,_1919_-_Project_Gutenberg_etext_24797.png) / Project Gutenberg etext 24797 | Published 1919; public domain in the US (pre-1929). The Commons file page carries the PD statement | Measuring positions and heights; local overlay check. **Not committed, not shipped.** | 2026-10-02 |
| wiki-lion | [HMS Lion (1910)](https://en.wikipedia.org/wiki/HMS_Lion_(1910)) and [Lion-class battlecruiser](https://en.wikipedia.org/wiki/Lion-class_battlecruiser), Wikipedia | Facts only (dimensions, turret designations, 1912 rebuild) | Dimensions and configuration | 2026-10-02 |

Get the drawing with:

```sh
curl -sL -A "weather-gage-research" -o ships/hms-lion/reference/janes1919.png \
  "https://commons.wikimedia.org/wiki/Special:FilePath/Lion_class_battleship_-_Jane's_Fighting_Ships,_1919_-_Project_Gutenberg_etext_24797.png"
```

## Facts used

- Length overall 213.4 m (700 ft); beam 27.0 m (88 ft 6¾ in); mean draught 8.4 m (27⅔ ft, from Jane's).
- Four twin 13.5-inch turrets: A, B (superfiring over A), Q amidships between funnels 2 and 3, X aft. 8 guns, which matches `guns: 8` in the Dogger Bank scenario.
- Three funnels of equal height after the 1912 rebuild; the foremast moved ahead of the fore funnel and became a pole mast.
- 4-inch secondary guns grouped in the forward and aft superstructure.

## Measured from the Jane's drawing (approximate)

Scale: 1433 px at 2× = 213.4 m, about 6.7 px/m, so readings are good to about ±0.5 m.
Turret, funnel and mast positions (`aft`) and heights were read off the profile;
half-breadths come from the plan. X's gunhouse sits about 2.5 m lower than A's
and Q's, which is the evidence for the quarterdeck step at about 162 m aft.

## Deliberate departures and open questions

- **Configuration:** January 1915. The drawing shows the 1918 tripod foremast. The spec keeps a pole foremast, per the 1912 rebuild.
- **Underwater lines** are plausible, not historical: no lines plan was used. They are mostly hidden by the sea.
- **Boats** are placed plausibly; the drawing does not show them.
- **Bridge** is simplified to stacked blocks; the real one is more open.
- **Not modelled yet:** rails, torpedo-net shelf, anchors, deck planking, scuttles, rigging, funnel bands.
- **Paint:** a mid Home Fleet grey with a dark boot topping chosen for readability on water. The boot topping is an assumption.
