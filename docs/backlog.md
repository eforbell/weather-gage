# Simulation improvement backlog

Started 2026-09-29. One place for known gaps in the simulation, gathered from playtesting, the 200-seed harnesses, code reviews, and the "still missing" and "deferred" notes in `era-extension.md`, `design/cold-war-submarines.md` and `architecture.md`. Presentation and UI work (the 3D battle view, mission browser) is tracked elsewhere.

**Priority:** P1 changes how a mission plays or is needed before the next era. P2 adds depth or honesty. P3 is polish, or waits for a scenario that needs it.
**Scope:** C marks platform-wide changes; E marks changes inside one era's rules.

## Information and command

### 1. Data links and a shared tactical picture (P1, C)
**Why.** The engine began with one shared picture per side. The Cold War era moved to a separate picture per ship, which is honest for submarines but too strict for 1986 surface forces: in Northern Screen, Steadfast, Meridian and Ward would have shared encrypted tracks by Link 11 within seconds.
**Proposal.** Model links, not a global setting:
- **Surface and air net (Link 11 style).** Linked ships and aircraft pool tracks, keeping each track's uncertainty, perhaps one tick late. Ships without the link get a slower teletype picture (Link 14 style).
- **Submarine broadcast.** Every few ticks the group sends its picture out. A submarine receives it only when shallow or at periscope depth, a tick or two old, as last-known positions rather than live tracks.
- **Report in.** A "come up and report" order sends a submarine's contacts to the group. It costs a tick at periscope depth, where she's easier to detect.
- **Underwater telephone.** Short-range voice between boats that anyone nearby can hear. This is the obvious channel for Dallas and Red October once they've made contact.

**Touches.** Contact scanning (`engine.js`), scenario data (who is linked to whom), a new order, the advisor, and the per-ship chart view.

### 2. Water-space management (P1, E)
**Why.** About 11% of torpedoes in Northern Screen hit a friendly boat, all after the wire is cut. Real groups gave their own submarines assigned operating areas and held fire on submerged contacts inside them.
**Proposal.** Scenario-defined or player-drawn submarine boxes. Escorts and aircraft hold fire on submerged contacts inside a friendly box unless the contact is identified hostile. Friendly submarines keep to their box unless ordered out.

### 3. Target motion analysis from own-ship manoeuvre (P2, C)
**Why.** A passive contact's uncertainty now shrinks only with the time it is held. Real bearing-only tracking needed the listening boat to run a second leg on a new course.
**Proposal.** Shrink uncertainty faster after the observer changes course while holding contact, slower on a steady course. This rewards the classic manoeuvre and gives the player a reason to turn.

### 4. False contacts and misclassification (P2, C)
**Why.** The design calls for unreliable reports: fishing boats, whales, doubled sightings. The Falklands showed how false contacts soak up weapons; San Luis attacked the British task force and was never found. Only Red October's "seismic noise" exists today.
**Proposal.** Seeded false contacts that behave like weak real ones, and a small chance of a wrong class at classified confidence. Weapons spent on false contacts are a real cost.

### 5. Orders and doctrine through the command channel (P3, C)
**Why.** Doctrine, speed, depth and radar changes apply immediately, a known shortcut in `architecture.md`. Orders already travel with each era's signal delay.
**Proposal.** Route doctrine changes through the same pending-signal queue as orders.

## Weapons

### 6. Torpedo behaviour, second pass (P2, E)
**Why.** Torpedoes now track and hit (`design/cold-war-submarines.md`), but the seeker is still a cone and a noise contest.
**Proposal.**
- Search patterns (snake, circle) for lightweight torpedoes.
- Depth search on re-attack.
- A wire cut by the launcher's own hard turns.
- Seeker Doppler, so a slow, stationary noisemaker is less convincing than a moving hull.
- Let Ramius's turn into an unarmed torpedo actually happen: with 4-hex-a-tick torpedoes it almost never triggers.

### 7. More ways to hunt submarines (P2, E)
**Why.** Destroyers now have ASROC and carriers have sonobuoys and air-dropped torpedoes. The rest of the hunt is missing.
**Proposal.**
- **Anti-submarine helicopters** from destroyers: dipping sonar and a torpedo, short range, quick to react.
- **Land-based patrol aircraft and seabed arrays (SOSUS):** wide-area, low-precision cueing.
- **Towed arrays:** long passive range, but deaf in turns and slow.
- **Convergence zones:** detection rings at long range in deep water.

### 8. Anti-ship missiles for submarines and surface ships (P3, E)
**Why.** This bridges to the modern era, and submarine-launched missiles are a Cold War staple.
**Proposal.** Reuse the modern era's missile model as entities (friction 6 in `era-extension.md`). Launching from periscope depth reveals the boat.

### 9. Offensive mining (P3, E)
**Why.** The dreadnought era has declared minefields only.
**Proposal.** Minelaying orders, fields the enemy doesn't know about, and sweeping.

## Captains and the other side

### 10. An enemy admiral (P1, C)
**Why.** The biggest gameplay gap. Red captains keep their starting orders all game: nobody scouts, concentrates, feints or retreats as a force, and every balance figure measures the player against captains with no plan.
**Proposal.** A side-level commander that issues the same orders the player can, driven by that side's own picture, with a few postures (probe, concentrate, screen, withdraw) and seeded variation. Start with Northern Screen, where the raiders coordinating an attack on the carrier is the whole point.

### 11. Threat-aware routes (P2, C)
**Why.** Captains route around terrain and other ships, but not around danger they know about. Red October steams past a known hunter; escorts don't hold sectors.
**Proposal.** Route costs from known hostile contacts and datums, by trait: cunning captains detour widely, reckless ones don't.

### 12. More captain traits (P3, C)
**Why.** The v2 prototype had them; today there are three (steady, cunning, reckless).
**Proposal.** Traits as modifiers on existing rules: aggressive (closer engagement range), cautious (earlier withdrawal), skilled (faster classification and better fire control).

## Platform

### 13. Larger maps or several scales (P1 before WWII, C)
**Why.** Friction 3. Northern Screen already needed a bigger chart. Carrier air and radar work at 100+ nm.
**Proposal.** Per-scenario map sizes (partly done by the escort mission) plus an operational scale where one hex covers more distance, with zoom-in to tactical engagements.

### 14. Move the sail and modern rules into the era registry (P2, C)
**Why.** They are the last era rules still written as `if (era === …)` branches inside `engine.js`.

### 15. Scenario and ship data schemas (P2, C)
**Why.** Roadmap item. Scenario data is JavaScript objects checked piecemeal by each era's `validateShip`.
**Proposal.** Declared schemas for scenarios, ships, weapons and sensors, validated once, with save-migration tests.

### 16. Replays (P2, C)
**Why.** Seed and orders already reproduce a game exactly. Stored replays would let the chart room show a finished sortie, and would make balance bugs much easier to share and inspect.

### 17. Engagement channels (P3, C)
**Why.** Friction 4. One target per battery per tick is fine at today's fleet sizes, but fleet actions and layered air defence will need several.

### 18. Routing speed (P3, C)
**Why.** Route finding runs a breadth-first search on every movement step, and each terrain lookup scans the whole terrain list. It's acceptable today (about 1.7 ms per tick at Dogger Bank) but will not scale to bigger maps. Precompute a terrain set per game.

## Balance and scenario design

### 19. The Defector: what making contact should buy (P1, E)
**Why.** With working torpedoes and counter-fire, pinging for contact (57%) no longer beats letting the captains fight (58%).
**Proposal.** Once item 1 exists, contact gives an underwater-telephone link: a crude shared picture, and joint evasion orders. Re-measure the plan ladder with the harness.

### 20. A cost for starting a war (P2, E)
**Why.** "Don't shoot first" only teaches itself when the tactics happen to punish it. Counter-fire does today (fire first 51%, the lowest plan), but that is incidental.
**Proposal.** A scenario-level consequence, such as a downgraded outcome or a political dispatch in the debrief, when the player's side fires first in peacetime.

### 21. Re-tune Northern Screen after data links (P2, E)
**Why.** Items 1 and 2 will change what escorts know and how often they shoot friends. Blue currently wins 49% with no orders.

### 22. Forced surfacing is reversible through the API (P3, E)
**Why.** A code-review note: the UI locks a surfaced boat's depth, but `setDoctrine` does not.

## Testing and tooling

### 23. Bring the balance harnesses into the repo (P2)
**Why.** Only the torpedo census is a script (`npm run census:torpedoes`). The plan sweep (win/draw/loss per admiral plan) and the submarine-fate measure (lost before firing, within 5 ticks of firing, survived) were the main design tools for the last three changes and live only in scratch files.

### 24. More browsers (P3)
**Why.** Everything has been checked in Chromium only. Safari and Firefox animation and Web Audio behaviour, and real phones, are untested.

### 25. Merged-view dispatch wording (P3)
**Why.** A code-review note: when a side commands another's ships, merged logs take the first report rather than the most informative one.

## Done since these notes were first written
For reference, so older docs aren't read as open issues:
- Era rule registry and shared `core.js` (frictions 1 and 2).
- General entities in flight (friction 6).
- Breadth-first route finding.
- Per-ship sonar pictures.
- Wire guidance, re-attack and torpedo speed against evasion.
- Datums, ASROC, sonobuoys and air-dropped torpedoes.
- A Take Command sweep (`npm run sweep:command`): scripted players on one commanded ship against doctrine. The plan sweep and submarine-fate measures from item 23 are still scratch files.
