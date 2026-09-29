# 3D battle view: visual direction and path forward

Written 2026-09-29 for `prototype/three-battle-view`. Complements `docs/3d-prototype.md`, which covers what the prototype proves, its cost and its go/no-go gate. This document is about how to make it *look* like a 2026 game.

## Who this is for
The 3D view exists because of Craig:

> "I like to *see* the warships and the booms and the missiles. … can you introduce a 'go to the battle' viewport overlay that takes me into the sim a bit more, with the battleship gunships glistening in the late day sun and the smoke billowing from their last rapport? I want to PLAY this game but it's just too technical and I'd want to be in the immersion more!"

Eric plays the chart like Civilization's strategic mode; Craig wants to be on the water. The chart stays the place where orders are given. The 3D view has to earn its place by delivering the *moments*: a broadside at golden hour, a straddle throwing up white columns around a battlecruiser, a magazine going up, a periscope in the swell. It is judged by the "Craig test" (below), not by polygon counts.

## Where the prototype stands
Screenshots of Dogger Bank (tick 6) and Nevis (tick 9) from the current branch, plus a read of `battle-3d.js` and `battle-models.js`:

| Area | Now | Why it reads as "amateur hour" |
|---|---|---|
| Scale | Ships about 5× too large for the 1-hex (≈1 nm) spacing | Reads as a tabletop diorama of toys, not a fleet at sea |
| Waterline | Hulls sit on top of a flat plane | Nothing sits *in* the water: no bow wave, no foam, no immersion line |
| Sea | CPU-displaced 76×76 plane, normals recomputed every frame, matte teal | No reflection, no Fresnel, no sun glint, no foam, no depth colour; costly for what it gives |
| Sky and light | Gradient dome, sprite sun, hemisphere and directional lights | No environment map, so steel looks like plastic; hard horizon band; no atmospheric haze |
| Shadows | Hard shadow maps cast onto the sea | Water doesn't take crisp shadows; it looks like a floor |
| Models | Boxes and cylinders; one silhouette for battleship and battlecruiser; sails are flat cards | No recognisable ships, no weathering, no era identity |
| Smoke | 7 flat sprites per ship; **also emitted by sailing frigates** (bug) | No billowing, no wind drift, no battle haze |
| Effects | Shells are spheres on a curve; hits are expanding spheres | 7 of the chart's 24 combat event types are drawn in 3D. Missing: splashes and straddles, sinkings, magazine explosions, fires, torpedoes and wakes, ASROC, air drops, noisemakers, pings |
| Camera | One generic orbit around the selected ship | Starts inside the frigate's rigging at Nevis; never frames the action; no sense of event |
| Sound | The 2D view's synthesized sound is not tied to 3D positions | Guns don't boom from where the guns are |

What is already right and must be kept:
- **Lazy loading and chart fallback.** The renderer loads on demand and drops back to the chart if WebGL fails.
- **Fog-of-war discipline.** The renderer sees only `getView` for the selected ship.
- **Honest depth.** Cold War depth handling means sonar reports never become hulls.
- **The 30 fps cap and pixel-ratio limit.** Both are good defaults on low-power machines.

## Art direction: painted realism, not photorealism
Two directions were considered:
- **Photoreal-lite** (in the manner of World of Warships). Heavy asset budget, a moving target, and the uncanny middle is where this prototype sits now.
- **Painted realism** (recommended). The look of marine painting (Montague Dawson's sail, W. L. Wyllie's dreadnoughts, Norman Wilkinson's grey steel). Light, atmosphere, water and smoke carry the image, and models are well proportioned rather than dense.

Painted realism fits the paper-chart brand, ages better, and puts effort where the camera looks: sky, sea surface, silhouettes against the light, and smoke. Touchstones for feel, not copying: Montague Dawson for sail, Wyllie for Jutland-era haze, *Ultimate Admiral: Dreadnoughts* for readable fleet scale, *Cold Waters* for the undersea mood, *Sea of Thieves* for stylised but convincing water.

Principles:
1. **Light first.** Each scenario gets a time of day and weather that says something: Nevis in late-day sun (Craig's request), Dogger Bank in cold morning haze, Hampton Roads under a flat afternoon sky, the North Atlantic grey and heaving.
2. **Silhouette over detail.** At 1–3 km a ship is a silhouette against sky and sea. Correct proportions, masts, funnels and turret layout matter more than rivets.
3. **Things sit in water.** Every hull has a waterline, a bow wave, foam, and pitch and roll from the swell.
4. **Every event has a physical echo.** Muzzle flash, then gun smoke drifting downwind, then the shell's arc, then a splash column or fire. The smoke lingers and builds battle haze. This is also the dreadnought smoke rule made visible: firing downwind into your own smoke is bad.
5. **Show uncertainty diegetically.** An uncertain contact is a shape in the haze at its reported position, blurred by its uncertainty, never a crisp model. That is prettier than a ring marker and more honest.

## Readability and scale
Pick one rule and hold it: **ships are drawn about 3× their true size, and distances are compressed** so a hex reads as about 1.5 ship lengths at the default camera. That is the World-of-Warships-style compromise between true scale (ships vanish) and the current toys. Camera distances, smoke volume and splash height all scale off the same constant, `PRESENTATION_SCALE` in one place, so it can be tuned against the Craig test.

## Technical path

### Rendering foundation (engine settings)
- **Water:** replace the CPU plane with a GPU ocean shader. Start from three.js's `Water` example: normal-map waves, Fresnel, sun specular, reflection. Graduate to Gerstner or FFT displacement with foam on crests, intersection foam around hulls, and depth-tinted colour. A shared wave function lets hulls sample the same surface for buoyancy.
- **Sky and environment:** `Sky` (the Preetham model) driven by the scenario's sun elevation and azimuth, fed through PMREM into an environment map so steel reads as steel. Add height fog and aerial perspective, so distant ships go blue-grey instead of hitting a hard fog wall.
- **Post-processing:** an effect composer with bloom (muzzle flash, sun glint, fire), a filmic tone-map tuned per era, subtle vignette and SMAA. Optional depth-of-field on the cinematic camera only.
- **Shadows:** no hard shadows on water. Keep ship self-shadowing, and use cascaded or contact shadows only on decks.
- **Future:** keep WebGL2 as the baseline, and track three.js's WebGPU renderer and shading language as a later upgrade path (compute particles, better water), not a dependency now.

### Ships
- **Pipeline:** glTF 2.0 with meshopt or Draco geometry and KTX2 (Basis) textures, loaded per era as lazy asset packs. Each class has a spec sheet (length, beam, turret layout, funnel and mast positions, paint scheme) so models and the simulation agree.
- **Level of detail:** a hero LOD (about 20–40k triangles) for the followed ship, mid (about 5k) for the rest of the scene, and an impostor or silhouette card at the horizon.
- **Materials:** PBR with shared trim sheets (weathered paint, rust streaks, teak decks, canvas), hull numbers and pennants as decals, and damage decals and scorch driven by the ship's own hull track (own ships) or by *observed* hits (contacts, as the chart already does).
- **Motion:** buoyancy from sampled waves (heave, pitch, roll), a heel into turns, and sails that billow with the scenario wind through a vertex shader. Ships that strike haul down their colours; sinking follows a sequence (list, settle by the bow or stern, slip under, leave an oil slick and debris).
- **Sourcing, three options:**
  - Commission hero models for the flagship classes.
  - License marketplace models. Check that the license allows redistribution in a web game, and record provenance in `assets/CREDITS.md`.
  - A procedural kit (lofted hull from a lines plan plus modular turrets, funnels and masts) as an interim that is far better than today's boxes.

  Recommended: the procedural kit for breadth, plus commissioned or licensed hero models for the flagships of the first slice.

### Combat effects
The simulation already emits per-side events for everything the chart animates. The 3D view should cover all of them, with a **presentation contract**: every event type and entity kind declares its 2D and 3D representation, and a test fails when a new sim event has no 3D handler. The 3D view has already fallen behind twice, missing the sonobuoys and the lightweight torpedoes.

- **A GPU particle system** (an instanced custom system, or a library such as three.quarks) with soft particles lit by the sun.
- **Gunfire:** muzzle flash with bloom, a gun-smoke cloud that drifts downwind and lingers, and a tracer or shell on the true ballistic arc with a flight time matching the chart.
- **Fall of shot:** misses and straddles throw tall white splash columns (the signature image of dreadnought gunnery); hits make a fireball, debris and a hull scorch decal.
- **Damage and loss:** persistent fire and smoke columns scale with damage. A magazine detonation gets its own set piece: flash, mushroom cloud, a delayed shock ring on the water, the ship breaking in two. Sinking and struck sequences as above.
- **Undersea and air:** torpedo wakes (a bubble trail seen from above, a propeller wash below), missile exhaust with interceptor bursts, ASROC and air-drop splashes, noisemaker bubble clouds, sonar ping rings, and caustics and god rays underwater.
- **Weather and haze** follow the scenario, and the battle builds its own haze from gun and funnel smoke over the engagement.

### Camera and direction
- **Follow (default):** framed on the selected ship and never inside it. Framing distance comes from the ship's size, fixing the Nevis rigging problem.
- **Action cam:** at each tick, pick the most significant visible event (a sinking, magazine explosion, torpedo hit, or a salvo landing on a new target) and frame it: a short dolly or slow push, and brief slow motion for the biggest moments. The chart's banner events already rank these.
- **Bookmarked shots:** bridge view, masthead view, low waterline view and a periscope view for submarines. Optional letterbox.
- **Rules:** never cut to something the player's side can't see, never linger longer than the tick, and one key returns control and the orbit camera.

### Sound in 3D
Positional audio for guns, hits, splashes and engines, using the existing synthesis plus a small set of recorded or synthesized layers. A distant broadside's report arrives after its flash (1 nm is about 5 seconds of sound). Undersea, everything is muffled and pings ring.

### Performance and scaling
- **Quality tiers** (low, medium, high, ultra), chosen from a short startup benchmark and changeable in settings. Low keeps today's footprint; ultra adds FFT water, depth of field and denser particles.
- **Budgets:** 60 fps on a recent desktop at high; 30 fps on a mid laptop at medium; phones at low with a static-camera option. Under 300 draw calls through instancing, and each era's asset pack at 8 MB or less, compressed.
- **Measurement:** a frame-time HUD (developer toggle) and a scripted benchmark shot per era.

## Guardrails (non-negotiable)
- The 3D view renders only from the selected ship's `getView`, as today. Enemy models appear only for **identified** contacts; everything else is haze at the reported position. No effect may reveal a hidden position; effect references are already fog-safe.
- Presentation randomness (particles, wave phase, camera jitter) never touches the simulation's seeded state.
- The chart remains the fully capable interface. The 3D view is optional, lazily loaded, and falls back cleanly.
- Accessibility: reduced motion gives static frames per tick. Camera shake and slow motion can be turned off. Audio cues come with captions in the dispatch.

## Milestones and gates

**M0: measurement (days).** Golden screenshot set: a fixed seed, tick and camera per era. A frame-time HUD. A written "Craig test" rubric:
1. Does it look like ships at sea in the first second?
2. Can he tell who is shooting whom?
3. Does a big moment make him lean in?
4. Would he play a second sortie for the view?

**M1: "Golden hour at Dogger Bank" vertical slice (about 2–3 weeks of engineering, plus art).** One scenario, done properly:
- GPU water, sky with an environment map, and post-processing.
- The scale rule applied.
- Hero models for HMS Lion and SMS Seydlitz, with procedural-kit destroyers.
- Buoyancy and wakes.
- The full gunfire, splash, hit and fire effect set, plus the magazine explosion.
- The action cam and positional audio.

Gate: Craig's reaction on his own machine, frame time on a mid laptop, the fog-of-war tests passing, and the presentation contract covering all Dogger Bank events.

**M2: the other surface eras.** Nevis in late sun (sails, broadside smoke, rigging done properly), Hampton Roads (ironclads, fires on wooden ships, rams), and the modern scenario (missiles, interceptors, radar masts). Mostly models and effects on the M1 foundation.

**M3: undersea.** The Cold War: underwater volume, caustics, god rays, the thermal layer as a visible shimmer, submarines with buoyancy at depth, torpedoes, noisemakers, pings, and the periscope view.

**M4: polish and scaling.** Quality tiers, phones, weather variants, a photo mode, and replays through the cinematic camera (backlog item 16).

Estimates are rough engineering ranges, not quotes. Art cost depends heavily on commissioning versus licensing, and should be quoted per hero model before M1 starts.

## Quick wins before M1 (about a week, no new assets)
These make the prototype markedly better at once and are worth doing regardless:
1. **Stop funnel smoke on sailing ships** (bug). Give them gun smoke only when they fire.
2. **Apply the scale rule and fix Nevis framing.** Frame from the ship's size, and set a near-plane and minimum distance per era.
3. **Swap in three.js `Water` and `Sky`** with a PMREM environment map, and turn off hard shadows on the sea.
4. **Add bloom and a per-era tone-map.**
5. **Splash columns and muzzle flash** for the existing salvo and broadside events. Sinking and magazine effects from the existing `sunk` and `magazine` events.
6. **Foam wakes and a bow wave** as textured ribbons instead of lines.
7. **The presentation-contract test** listing every event type and entity kind, with the missing 3D handlers marked as known gaps.

**Status (2026-09-29): all seven are in** on this branch, plus a frame-time HUD from M0. See [3d-prototype.md](3d-prototype.md#painted-realism-pass) for what landed, where to tune it, and the measured cost. Still open before M1: the golden screenshot set and Craig-test rubric (M0), hero models, positional audio and the action camera.

## Risks
- **Download size and phone GPUs.** Mitigated by lazy per-era packs, quality tiers and budgets.
- **The uncanny middle.** Half-realistic looks worse than honestly stylised. Hence painted realism.
- **Asset licensing and provenance.** Review every model's license for web redistribution; keep credits.
- **Drift from the simulation.** New sim features ship without 3D representation. Hence the presentation contract and the golden screenshots.
- **Scope creep.** The gate after M1 decides whether the rest is worth it.

## Open questions for Eric and Craig
- Which scenario should be the first showpiece? Dogger Bank is recommended: battleships, smoke and big splashes are exactly Craig's picture.
- Is a cinematic action camera welcome, or should the camera stay under the player's hand?
- What is the art budget: commissioned hero models, licensed models, or procedural only?
- Should the 3D view become the default for some players, with the chart as the "strategic" mode?
- What hardware does Craig actually play on? That sets the M1 performance target.
