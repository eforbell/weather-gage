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
