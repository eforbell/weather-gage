# Design: the Second World War era — radar, night action and the road to carriers

Status: research, rules module and a playable night action, 2026-10-03. Night off
Cape Esperance is in the mission launcher ("Radar & Night Action"); carriers are
designed below but not built.

## Why radar first, carriers second

The era's two big inventions are radar and the carrier. They need different
things from the platform:

| | Radar and night surface action | Carrier air power |
|---|---|---|
| Scale | Tactical: 1 hex ≈ 1 nm, a 3-minute tick, a 26 × 16 chart | Operational: 100–250 nm strike radius. Needs a second scale or zoom ([backlog 13](../backlog.md)) |
| New platform | Sensors as data, emission state, illumination, conditions | Aircraft as entities in flight with fuel, deck cycles, CAP, flak, strike coordination |
| Teaches | Information: see without being seen; the radar picture against the eye | Timing: find first, strike first, recover the strike |
| Builds on | Dreadnought gunnery and torpedoes, Cold War contacts and uncertainty | Cold War entities and patrol missions, Northern Screen's sorties |

Radar is the smaller step and fits the existing tactical scale. It is also the
foundation the carrier war needs: air-search radar, early warning and fighter
direction are what make combat air patrol work. So the first slice is a radar
night action, and carriers are designed below for the next one.

## Research: what radar changed (sources at the end)

- **Centimetric surface search changed night fighting.** The US SG set (first fitted April 1942) held a destroyer at about 15 nm and large ships further. At Cape Esperance (11–12 October 1942) Helena's SG had the Japanese force at about 27,000 yd (13 nm), and SG- and FC-equipped cruisers fired by radar. Before that, at Savo Island (August 1942), the Imperial Navy's trained lookouts, flares and torpedoes had beaten an Allied force that had radar but did not trust it.
- **The British Type 271** (1941, centimetric) detected a battleship at about 13 nm, a destroyer at about 7.5 nm and a surfaced U-boat at about 3 nm.
- **Bands matter for interception.** Germany's Metox (FuMB 1) warning receiver heard metric radars, but not the 9.7 cm Type 271. Escorts could close U-boats without warning them until Naxos (1943).
- **The Imperial Navy's counter was the eye and the torpedo.** Its lookouts were selected and trained for night work, with large binoculars, and it used searchlights and flares. The Type 93 oxygen torpedo ran about 12 nm at nearly 50 kn, or 22 nm at 36 kn, left almost no wake and carried a very large warhead. It was often fired at gun flashes. US Mark 15 torpedoes ran shorter and in 1942 often ran deep or failed to explode.
- **Radar-directed gunnery** (Mk 3/Mk 8, British Type 284) let a ship fire accurately on an unseen target and keep her solution through a turn. Ships without it fired starshell or used searchlights to lay their guns by eye. A searchlight marked the ship holding it for every gun in range.

## The model (`src/sim/eras/ww2.js`)

Scale: 1 hex ≈ 1 nautical mile, 1 tick ≈ 3 minutes. Speeds are in half-hexes a tick, as in the other steam eras: 3 is about 30 kn and 2 is about 20 kn. Every number is a game abstraction tuned against the history above.

### Sensors are data on the ship

`sensors: { search, fireControl, esm }`, and `radar` is the emission state.

| Set | Large / small hull (hexes) | Classifies within | Band |
|---|---|---|---|
| `sc` (US metric, 1941–42) | 10 / 6 | none (a blip only) | metric |
| `sg` (US centimetric, 1942) | 15 / 11 | 10 (echo size) | cm |
| `type271` (British, 1941) | 12 / 7 | 6 | cm |
| `seetakt` (German metric, 1939) | 12 / 7 | 3 | metric |
| `type22` (Japanese, 1944) | 9 / 5 | none | cm |

- A target with land beside it returns half the range: island clutter, the reason Savo mattered.
- **Radar never names a ship.** Identification needs eyes.
- **Warning receivers** (`esm: 'metric' | 'cm'`) hear a radiating set of a band they cover at 1.5 times that set's own large-hull range. They give a bearing with uncertainty that firms up while the signal is held, using the Cold War target-motion analysis.
- A contact's `emitter` flag now comes from the era. You learn the enemy is radiating only if a receiver of yours can hear it.
- **Emission control** uses the existing `setRadar` API, extended to WWII ships that carry a set.

### Eyes, light and flashes

Scenario `conditions: { light: 'day' | 'night', dawnAt }`.

- **By day**, ships are identified at 6 hexes (4 for a destroyer), classified at 10 and sighted at 14.
- **At night**, the lookout's reach is 2 hexes, plus 1 for a large hull, plus 2 for `nightTraining`. The ship is identified inside that reach, classified at the reach and sighted one beyond it.
- A ship that fired last tick is sighted at 10 at night: gun flashes.
- Illuminated (starshell or searchlight) or burning ships are seen as by day out to 8 hexes.

### Gunnery

Each tick a ship gets a firing solution, best first:
1. **Radar:** fire control fitted, radiating, within 12 hexes and within its search radar's reach.
2. **Visual:** daylight, a lit target, or a target identified by eye.
3. **None:** the ship illuminates instead.
   - **Searchlight:** for ships with `searchlight` doctrine, inside 4 hexes. It is certain to light the target, but it lights the ship holding it too.
   - **Starshell:** inside 6 hexes. It lights the target 60% of the time, and the burst is a flash that gives the firing ship away.

The hit chance follows the dreadnought model: a range band, times a fire-control ladder (0–3), times crew.
- Radar ranging climbs the ladder two steps a salvo and loses only one in a hard turn.
- Untrained crews firing by eye at night take ×0.7.
- Damage per hit by calibre (heavy 14–16 in, medium 8 in, light 5–6 in) is scaled by the target's hull type.

### Torpedoes

| | Reach | Hit (on aim / one hex off) | Duds | Damage |
|---|---|---|---|---|
| `type93` Long Lance | 8 hexes | 55% / 27% | 5% | 28–42 |
| `mk15` (US, 1942) | 4 | 40% / 20% | 35% | 16–26 |
| `mk9` (British) | 5 | 45% / 22% | 5% | 18–28 |

- A spread needs only a fresh contact (a bearing and a rough range; gun flashes will do).
- It is aimed where the target will be if she holds her course, and it resolves after movement.
- Launching makes no flash.

### Captains

Captains choose and steer by their side's reports, never by true positions.
- **They hold fire on unclassified echoes. This is a deliberate rule.** With no way to tell friend from foe on a 1942 radar scope, US cruisers at Cape Esperance shot up their own destroyer Duncan. Firing at blips, with a friendly-fire risk, is a candidate mechanic for later.
- **Torpedo misses are known only to the side that fired,** and a dud only to the ship it struck.

Heavy ships prefer heavy ships. In gun range they keep the target abeam; further out they steer for a lead point on the biggest contact they hold. The course for that lead comes only from a held radar or visual track, which is what a radar plot (CIC) worked out. Destroyers make torpedo runs as in 1915.

## Platform changes (small, generic)

| Change | Where | Why |
|---|---|---|
| `DOCKYARD_SCENARIOS`, found by `createGame` but not listed in `SCENARIOS` | `scenarios.js`, `engine.js` | Build an era in the open without shipping it in the launcher |
| `victory.raid { ships, count }` | `checkOutcome` | The enemy's aim is to get through, not to win a gunfight. Blue loses when `count` raiders reach their goal, wins when too few remain who could, and draws at the time limit |
| `ship.arrived` set on reaching a goal | `moveShips` | A raider that withdraws off the chart is `escaped` too; only arriving counts |
| `ship.raid` | `withdrawTarget` | A damaged raider turns for home instead of limping on to her goal (as the defector does) |
| Side picture merges contacts by confidence, then range | `scanContacts` | A closer, vaguer report no longer overwrites a clearer one; `emitter` is known if any observer hears it |
| `goal`, `arrived`, `raid`, `goalText` and torpedo `weapon` validated on load | `validateShip`, `validatePending` | Crafted saves can't crash `step` or end a game |
| `ship.goalText` | `moveShips` | "reaches the bombardment line…" instead of "reaches the rendezvous" |
| Detection may return `emitter` | `scanContacts` | Radiating is only known to a receiver that can hear it |
| Torpedo pending items allowed in `ww2` | `validatePending` | Reuses the dreadnought delivery, with the WWII weapon recorded |
| `setRadar` covers WWII ships with a set | `engine.js` | Emission control |

Presentation, so the era fails no contract test:
- Procedural `ww2_cruiser` and `ww2_destroyer` silhouettes.
- `starshell` and `searchlight` listed as named 3D gaps.

## Dockyard scenario: Night off Cape Esperance (October 1942)

An inspired-by-history night action on a 26 × 16 chart, moonless. Savo Island lies to the north-west, and Guadalcanal's coast runs along the south.
- **Blue (US):** San Francisco and Salt Lake City (SC only), Boise and Helena (SG and fire-control radar), and three destroyers with Mk 15s.
- **Red (Japan):** Aoba, Furutaka and Kinugasa as a bombardment group heading for the line off Lunga Point, at formation speed, turning for home when badly hurt. Fubuki and Hatsuyuki screen. All of them carry Long Lances and have night-trained lookouts and searchlights.
- **Outcome:** two cruisers on the bombardment line is a defeat. Too few left to get there (sunk, or turned back at 30% hull) is a victory.

### Balance snapshot (200 seeds, `npm run sweep:ww2 -- 200`)

| Plan | Win / draw / loss | Ships lost per game (US / Japan) | Torpedo hits per game (by US / by Japan) |
|---|---|---|---|
| Let the captains fight (radar on) | 74 / 0 / 26 | 0.16 / 1.22 | 0.42 / 0.49 |
| Emission control (radar off) | 3 / 0 / 98 | 0.25 / 0.63 | 0.59 / 0.04 |
| Cruisers in line, destroyers screen | 89 / 0 / 11 | 0.07 / 1.30 | 0.28 / 0.28 |

**Balance is provisional.** These numbers come after closing three hidden-information leaks found in review:
- Captains steered by true positions.
- Gun flashes gave an exact hex.
- Torpedo misses revealed the aim point.

Long Lances fired at scattered flash positions now hit far less, and the US wins more. Re-tuning waits until the scenario is playable: the night needs more Japanese teeth again, and the levers are lookout reach, flash uncertainty and spread size.

What the harness found while tuning:
- **The engine was dropping radar tracks.** The side picture took the closest report, not the clearest, so a destroyer's glimpse of Aoba replaced Boise's classified radar track. The cruisers then lost their target whenever a destroyer was out ahead. Contacts now merge by confidence first.
  - This changed nothing in the six existing scenarios: identical results over 200 seeds each, because their observers rarely disagree.
  - It moved captains-alone here from 52% to 98%, so the bombardment group was made more determined: it turns back at 30% hull, not 60%.
- **Torpedoes are aimed at the report, not the truth.** A spread at gun flashes goes to the flash, which is itself a bearing and a rough range (uncertainty 2). It is led along the target's course only when the firing ship holds a track: her own radar echo, or a classified sight.
- **Radar decides it.** With the sets off, US captains never find the cruisers in time, and the raid always gets through.
- **Emission control is a trap here,** because the Japanese of 1942 had no receivers. In this scenario no ship carries a warning receiver, so the receiver rules and the per-observer `emitter` run only in unit tests. They should pay against a German force with Metox, which is the obvious second dockyard scenario: an escort group against a surfaced U-boat pack, where 271 against Metox is the whole story.
- **The line trades losses for reliability.** In line the cruisers stay on the raiders instead of being drawn north by the screen, but they eat more Long Lances (1.2 hits a game), which is the Tassafaronga lesson.
- **Still to watch:** red seldom uses its searchlights to effect, and starshell is the US's main use of optical guns. Both deserve a look once this is in front of a player.

## Next steps

### Playable night action (done)
- **Launcher:** Night off Cape Esperance is a mission, with an era header, briefing note, field-manual entry and flag-lieutenant tips and debrief. It can be played as red with `?side=red`.
- **Chart:**
  - Cruiser and destroyer silhouettes, and gun and torpedo range rings (the Long Lance's reach is visible).
  - The shaded envelope is the selected ship's search radar while it radiates, or her night lookouts' reach when silent.
  - Every report says how it was made (`contact.by`: radar, eyes, flash or receiver). Unclassified reports read RADAR BLIP, GUN FLASHES or RADAR EMISSIONS, and the ring style differs by source.
- **Ship panel:** the radar set with an on/off switch, its reach and band, fire-control pips, torpedo count and what laying guns at night needs.
- **3D:**
  - A moonless night grade.
  - Starshell: a small, fierce flare in a faint halo that drifts down. A wide burst hangs off to one side.
  - A searchlight beam from the ship holding it to her target.

A deliberate choice: a burning ship (hull at 45% or less) counts as lit, so at night she is seen, and reported `by: 'eyes'`, well beyond lookout range. That tells the other side she is on fire, which is what a burning ship at night does.

### Still to do for the night action
- **Re-tune balance:** the night needs more Japanese teeth after the information fixes.
- **Authored WWII hulls** through the ship pipeline.
- **Gun-flash lighting** of nearby hulls and water.
- **A radar scope view**, perhaps.

### Carriers (the second slice)
- **An operational scale.** One hex covers roughly 10 nm and one tick roughly 20 minutes, so strike ranges of 150–250 nm become 15–25 hexes. This needs per-scenario scale, which already exists in part.
- **Air groups as entities:**
  - Each has a kind (search, strike, CAP), aircraft, fuel and a position.
  - Each moves several hexes a tick.
  - Flak and CAP attrition happen on arrival.
  - It reports what it sees, with the classification errors that defined Coral Sea and Midway ("two carriers" that were a tanker and a destroyer).
  - Build on Cold War `entities` and Northern Screen's `launchPatrol`.
- **Deck cycle:**
  - Spotting, launching, recovering and re-arming take ticks, and a carrier caught re-arming is vulnerable.
  - Air-search radar plus fighter direction makes CAP effective, which ties back to this slice.
- **Search before strike:**
  - Search sectors are the player's main decision.
  - Strike timing is the captains'.

### Submarines and convoys: The Wolf Pack (built)

**The scenario:** a night convoy battle in the North Atlantic, 1942.
- Six merchant ships steam east at about 9 knots for the next escort group at the far edge of the chart.
- Four escorts:
  - Walker, with Type 271 and HF/DF, ranges out by default.
  - Stork and Gentian, with Type 271, screen the convoy.
  - Sackville, with the old metric Type 286, screens too.
- A four-boat wolf pack waits ahead.
- **Outcome:** three merchant ships sunk is a defeat. Arriving, or still sailing at the end of the night (turn 48; dawn at 42), with one loss or fewer is a victory.

**Rules added to `eras/ww2.js`:**
- **U-boats:**
  - Run surfaced at night, faster than the convoy and nearly invisible to lookouts.
  - Dive when escorts close, when Metox hears a metric radar, after an attack, at dawn, or when damaged.
  - Submerged, they move one hex every third turn (about 7 knots), so a boat forced down falls astern.
- **Contact reports:** a shadowing U-boat radios the convoy home every few turns, and every report gives an HF/DF-equipped escort a bearing (`by: 'hfdf'`).
- **ASDIC and depth charges:**
  - ASDIC holds a U-boat inside 2 miles, surfaced or submerged, and says which (`contact.submerged`, which reaches the view).
  - Guns ignore submerged contacts; depth charges (25% damage chance per pattern) go after them.
  - The escort never learns whether a pattern hurt; the U-boat's side hears "depth charges close aboard".
- **Radar against surfaced boats:**
  - Type 271 finds a surfaced U-boat at about 4 miles, before her lookouts see the escort.
  - Type 286 manages about 1 mile, and Metox hears it from about 10.
- **Merchants:** a merchant ship broken by a G7e torpedo sinks.
- **Escorts:** escorts on Screen hunt contacts within 8 miles of the convoy, then return.

**Platform:**
- `victory.convoy { ships, maxLosses, goodLosses }`, which reports the counts through, lost and still at sea.
- `scenario.region`.
- The 3D view draws no hull for a submerged contact, and puts an own submerged U-boat below the surface.
- A depth-charge effect on the chart and in 3D.
- WWII ships ignore depth and speed in `setDoctrine`.
- `searchAt` is validated.

| Plan (200 seeds) | Win / draw / loss | Merchants lost per game | U-boats lost per game |
|---|---|---|---|
| Walker ranges out, the rest screen (default) | 79 / 6 / 15 | 0.90 | 0.56 |
| All escorts screen the convoy | 4 / 9 / 87 | 2.90 | 0.26 |
| All escorts hunt freely (Engage) | 98 / 2 / 1 | 0.23 | 0.83 |
| Sackville silences her metric radar | 87 / 11 / 2 | 0.65 | 0.70 |
| All radar off | 92 / 8 / 1 | 0.53 | 0.56 |

**What the harness says:**
- **Escorts must hunt.** Escorts that cling to the columns lose the convoy.
- **Emissions cut both ways, and the harness shows it plainly.** A radiating escort is heard by Metox and draws the pack in. Silencing Sackville's metric set helps, and in this tuning even silencing everything helps, because the 271s' detections matter less than not being heard. That over-rewards emission control.
- **Next tuning pass:** give the U-boats a better search, so silence costs the escorts their warning, and narrow the gap between screening and hunting.

## Sources

- [SG radar](https://en.wikipedia.org/wiki/SG_radar), Wikipedia: range and first fitting. See also [WNUS Radar WWII](https://navweaps.com/Weapons/WNUS_Radar_WWII.php), NavWeaps.
- [Type 271 radar](https://en.wikipedia.org/wiki/Type_271_radar), Wikipedia: detection ranges, and why Metox could not hear it.
- [Cape Esperance campaign](https://www.sonsoflibertymuseum.org/cape-esperance-campaign.cfm), Sons of Liberty Museum, and [USS Helena (CL-50) history](https://www.modelwarships.com/reviews/ships/cl/cl-50/history/helena-history.html): Helena's SG contact at about 27,000 yd, and fire directed by SG and FC radar.
- [Tassafaronga campaign](https://www.sonsoflibertymuseum.org/tassafaronga-campaign.cfm), Sons of Liberty Museum: Type 93 ranges.
