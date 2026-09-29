# Design sketch: Cold War submarines — "The Defector" (inspired by *The Hunt for Red October*)

Status: sketch + first playable slice, 2026-09-27. Fan scenario for private play; names are homage, numbers are game abstractions.

## Why this era next
The submarine fight is almost pure information warfare, the design's second pillar. Unlike the three surface eras it needs a set of platform capabilities that WWII will need too:

| Capability | Why the scenario needs it | Platform change |
|---|---|---|
| More than two sides | A defector that is neither friend nor foe | `state.sides`, per-side contacts, logs and fx for N sides |
| Dynamic hostility | "Don't shoot first": firing on someone makes their side hostile | `state.hostile` matrix, updated on attack |
| Uncertain positions | Passive sonar gives a bearing, not a fix | Contacts carry `uncertainty` (hexes) and an estimated position that converges while held (target motion analysis) |
| Weapons as moving entities | Torpedoes that run, seek, re-acquire and can fail to arm | `state.entities`: position, heading, speed, run length, arming distance, seeker |
| Emissions as a choice | "One ping only" | A one-shot active sonar action: an exact fix for you, and your position announced |
| Speed as a signature | Silent running vs flank speed | Per-ship noise derived from speed setting and actual movement |
| Depth / the layer | Hiding under the thermocline | Doctrine depth (above / below layer); detection across the layer is degraded |
| Captain personalities | Ramius vs Tupolev | `captain.trait` modifies the era's steering and weapon rules |
| Goals beyond sinking | Get the defector to the rendezvous | Scenario `victory.protect` + goal hexes |

## Model (first slice)
- **Scale:** 1 hex ≈ 1 nm, tick = 2 minutes. Speeds in half-hexes per tick (silent 1, standard, flank).
- **Noise:** each tick a sub's noise = hull base (quiet drive, reactor pumps) + movement this tick + transients (torpedo launch, flank cavitation). Noise sets the range at which others hear her.
- **Passive sonar:** hear range = target noise × 2 + own sonar quality − own self-noise − 3 if across the layer. Nothing is heard in the **baffles** (dead astern) except during a **Crazy Ivan**.
- **Contacts:** a passive contact starts as *sighted* with an uncertainty of 4 hexes and a reported position scattered inside it. Uncertainty shrinks one hex per tick while held; held three ticks it is *classified* (possibly wrong: a quiet drive classifies as "seismic noise"). *Identified* needs close range or an active ping.
- **Active ping:** one tick; everything within 10 hexes is identified with zero uncertainty; everyone within 20 hears the pinger.
- **Torpedoes:** move 4 hexes/tick, run 18 hexes, **arm after 2 hexes** (Tupolev disables the safety). Wire-guided toward the launch target's reported position, then the seeker takes the loudest ship in its forward cone within 3 hexes, **friend or foe**. Hitting unarmed is a dud. Noisemaker decoys can seduce seekers.
- **Captain traits:**
  - *Cunning* (Ramius): clears baffles with periodic Crazy Ivans; when a torpedo closes inside its arming distance he turns *into* it; drops decoys early.
  - *Reckless* (Tupolev): flank speed, shoots at weaker contacts, disables the arming safety.
  - *Steady* (Mancuso): by the book; the player gives the orders.
- **New order:** *Shadow*: trail a contact at 3–4 hexes.

## Scenario: The Defector
- **Blue (player): USS Dallas.** Starts with a faint contact that the sonar classifies as "seismic noise". Peacetime ROE: weapons held.
- **Green: Red October.** Typhoon-class with a near-silent drive, running Red Route One (a canyon of seabed ridges) east to the rendezvous. Hostile to no one until attacked.
- **Red: V. K. Konovalov.** Alfa-class: fast and loud, sprinting in from the west with orders to find and sink the defector. Hostile to Red October; hostile to Dallas only if Dallas fires on her.
- **Victory:** Red October reaches the rendezvous hexes. **Defeat:** Red October or Dallas lost. Time out: draw.
- **Player levers:** speed and depth (hear vs be heard), when to ping, where to put Dallas (between the hunter and the hunted), whether to fire first and start a war.

## Deferred
Towed arrays, convergence zones, SOSUS, surface ships and ASW helicopters, missile subs launching, wire cuts, multiple torpedo modes, and a separate TMA solution per ship (today each side shares one picture).

## What the test harness should reveal
Run 200 seeds for: captains alone; Dallas shadowing Konovalov; Dallas pinging early; Dallas firing first. Whatever looks wrong goes in the "discovered" section of `docs/era-extension.md`.

## Torpedo guidance model (revised 2026-09-29)
A census of every torpedo fired over 200 seeds showed only 21–35% hitting their intended target. Stale wire guidance, no re-attack, a 60° turn limit at point-blank range, noisemakers that always won, and torpedoes running into ridges accounted for most misses. The model now follows a wire-guided homing torpedo:

1. **Wire guidance.** For its first 12 hexes the firing boat steers the torpedo toward her *current* track of the target: her own sonar picture, uncertainty included. The wire is cut when she evades, is lost, or the run pays it out.
2. **Enable point.** The seeker switches on within 3 hexes of the aim point, when the wire is cut, or at once with the safeties off.
3. **Seeker.** It takes the loudest boat in a forward cone out to 3 hexes, and holds a lock out to 4. It turns 120° a hex in terminal homing (pure pursuit: boats have already moved when torpedoes run). If it loses lock it runs to the last position it heard, and that becomes the point it circles to re-attack.
4. **Friend or foe.** The seeker can't tell them apart. While the wire holds, the operator rejects locks on friendly boats (own side, plus sides under or holding command, such as Red October once she answers the ping) and steers around them. Careful captains won't shoot at a contact with a friendly within 1 hex of it and take the next target instead (water-space management). The launcher is never a target unless the safeties are off and the torpedo has run 8 hexes.
5. **Countermeasures.** Each noisemaker gets one seeded chance (45%) to fool each seeker; a seeker that sees through it ignores it thereafter. Sonar gives no depth, so fire control presets the search depth to the firing boat's own depth (surface ships search shallow). A seeker's reach is one hex shorter against a boat on the other side of the layer until it locks and follows her. Evading captains cross the layer as they drop a noisemaker, and return to their ordered depth once clear.
6. **Kinematics.** 4 hexes a tick (about 55 knots against a 30-knot sprint), 22-hex run, and it steers around seabed ridges. The wire never aims at land.

Measured with `npm run census:torpedoes` (200 seeds each, default captains):

| Fate | Defector before → after | Northern Screen before → after |
|---|---|---|
| Hits the intended target | 35% → 50% | 21% → 41% |
| Hits another enemy | 2% → 7% | ~5% → 13% |
| Friendly fire | ~0% → 0% | ~16% → 11% (all after the wire is cut) |
| Hits its own launcher | 9% → 2% | 7% → 0% |
| Seduced by a noisemaker | 38% → 30% | 33% → 20% |
| Seabed / out of fuel | 17% / 0% → 0% / 8% | 4% / 5% → 0% / 5% |

**Balance consequences.** Konovalov now carries 3 torpedoes (was 4). Defector plans: captains alone 45%, fire first 50%, ping for contact 66%. Working torpedoes make shooting first a sound tactic, so "don't start a war" needs a cost of its own if it is to stay a lesson. Northern Screen was not re-tuned: blue wins about 37% with captains alone (was about 42%).

## Anti-submarine warfare (added 2026-09-29)
Navies answered the submarine with more ears and more ways to put a weapon in the water. Firing now has consequences, and a submarine that does is hunted.

1. **Datum and counter-fire.** A heavyweight torpedo heard early in its run (within 6 hexes, in its first 12 hexes) points back down its track to where it was fired. The listener gets a *datum*: a fixed point at the launch position with a 2-hex uncertainty. It never sharpens into a track and does not follow the boat, which has usually moved on. Escorts on Screen prosecute submerged contacts and datums up to 6 ticks old, but only within 8 hexes of the carrier they screen; engaged boats close on recent datums too. A submarine under attack by a hostile heavyweight snap-shoots at the contact lying back down that torpedo's bearing in her own picture, without waiting to classify it, at 2 hexes' extra range for that contact only.
2. **Escort standoff weapon (ASROC).** Each ASW destroyer carries 3. Beyond tube range and out to 8 hexes, with a fix no worse than 2 hexes on a contact sonar reports as submerged, and no friendly within 2 hexes of it, a rocket puts a lightweight torpedo in open water beside the contact on the launcher's side, never on land or on a ship. If there is no such water, the round is held.
3. **Carrier anti-submarine aircraft.** Each patrol flight leaves a sonobuoy field (radius 3) that keeps listening for 6 ticks and reports only to its carrier. Buoys hear shallow boats about 80% of the time per tick and deep boats about 45% (louder boats more often). With a fix no worse than 1 hex on a submerged contact within 14 hexes and weapons free, aircraft drop one of 4 lightweight torpedoes on it. Buoys are silent: the enemy never sees them.

**Lightweight torpedoes** (ASROC and air-dropped) have no wire, a seeker live on splashdown, a shallow search preset (neither launcher knows the depth), 3 hexes a tick, an 8-hex run, a 1-hex arming distance, and a smaller warhead (30–45 hull against 55–80). Crossing the layer is the deep boat's best defence against them. The target hears the splash but never learns where the hunter aimed.

Hunters act on what sonar can tell: a contact is known to be *submerged* (not surface) from how it sounds, not its class, so ASW weapons don't need a classified contact but don't read the true ship type either.

### Measured effect (200 seeds each)
| Northern Screen | Before | After |
|---|---|---|
| Blue wins (captains alone) | 37% | 49% |
| Careful enemy submarine lost within 5 ticks of her first shot | 9% | 18% |
| Reckless enemy submarine lost within 5 ticks of her first shot | 5% | 13% |
| Enemy submarines surviving | about 62% | 45–50% |

| The Defector plan | Before | After |
|---|---|---|
| Captains alone | 45% | 58% |
| Fire first | 50% | 51% |
| Ping for contact | 66% | 57% |

Submarines stay formidable: half of them survive, the escort usually loses a ship or two, and a boat that holds her fire and stays deep is hard to find. Firing doubles her chance of being caught soon afterwards. Counter-fire changed The Defector: once Konovalov shoots, the datum and snap shots let Ramius answer, so the captains alone do better, and firing first is no longer the best plan. It also means that making contact by ping no longer beats letting the captains fight. What contact should buy the player (a shared sonar picture, joint evasion, Dallas taking the datum) is the next design question for that mission.
