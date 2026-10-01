# 3D battle-camera prototype

This work lives on `prototype/three-battle-view`. The existing SVG chart and deterministic simulation are unchanged. The 3D scene is presentation only and receives `getView(state, 'blue', selected)` rather than raw enemy state. It is lazy-loaded on **Go to the battle · 3D**, stops rendering when hidden, caps pixel density at 1.5 and frames near 30 fps, and falls back to the chart if WebGL fails.

## What this branch proves

- Real orbit/zoom perspective, 3D meshes for sail, ironclad, battleship/destroyer, carrier, and submarine roles.
- Painted-realism rendering: a reflective GPU sea, a Preetham sky with clouds lighting the ships through an environment map, bloom and a per-scenario grade (see [Painted realism pass](#painted-realism-pass)).
- Combat effects for 21 of the chart's 24 event types, from muzzle flash and splash columns to magazine explosions, with a contract test for the rest.
- The selected ship remains the camera anchor; orders, clock, saves, and mission results still come from the same simulation.
- Unseen enemies are absent. Surface-era uncertain and stale contacts get markers, not detailed enemy models. Cold War sonar/air reports have no public depth and remain in the chart/list instead of appearing as physical hulls.
- Friendly vessels carry their own doctrine depth into presentation. Surface cameras omit submerged boats; underwater cameras follow shallow/deep depth and show only nearby friendlies on the same layer through limited-visibility fog.
- A Vite build produces static `dist/` files. No remote art, font, account, or runtime service is needed.

## Cost and decision boundary

Three.js itself has no license fee ([MIT license](https://threejs.org/license/)). Its [official installation guide](https://threejs.org/manual/pages/installation.html) recommends npm and a build tool for a project with package imports; this branch uses pinned Three.js and Vite packages. [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) supplies mouse/touch orbit and zoom.

Engineering estimate, not a quote: a robust vertical slice with camera, fog-of-war plumbing, failure fallback, and browser QA is roughly **1–3 developer days**; making six eras look convincingly cinematic is likely **several weeks** of modeling, materials, environment, effects, optimization, and playtest iteration. The engine is the cheap part. The biggest variable is model quality and provenance: licensed glTF ships or commissioned art would need a separate asset budget and permission review. Procedural meshes in this branch cost no asset fee, but they are deliberately low-poly and not the final Craig-ready look.

The current build's lazy 3D JavaScript chunk is about **608 kB / 154 kB gzip**, while the initial app chunk is about **145 kB / 51 kB gzip** (local `npm run build`, 2026-09-29). This excludes any future high-detail meshes and textures, which could dominate download size and GPU memory.

Do **not** merge this branch on the strength of a successful build alone. The go/no-go gate should include: licensed/provenanced models for at least one flagship and one opposing ship; desktop and phone frame-time measurement; no new fog-of-war leaks; WebGL failure recovery; and a full saved-sortie regression pass. If the procedural art is still too toy-like, invest in assets before expanding code.

## Known limits

- Models are authored from Three.js geometry, not high-fidelity `.glb` assets. Silhouettes are representative rather than historically exact.
- The sea is a flat reflective plane with animated normals, not displaced Gerstner or FFT waves; hulls bob on an analytic swell rather than sampling the surface. Smoke is billboard particles, not volumetric.
- Three chart events have no 3D echo yet (`event`, `ivan`, `struck`), and Cold War entities (running torpedoes, sonobuoy fields, noisemakers) stay on the chart until M3. `FX_KNOWN_GAPS` and `ENTITY_KNOWN_GAPS` in `battle-effects.js` list them with reasons.
- The 3D camera is for immersion, not aiming or exact navigation; use the chart for hex plotting.
- Reduced-motion users get a static 3D view that updates on turns and camera gestures. WebGL is still required for the mode.

## Painted realism pass

The "quick wins before M1" from [3d-visual-direction.md](3d-visual-direction.md), done without new assets:

| Area | What changed | Where to tune |
|---|---|---|
| Scale | One rule: a hex is `HEX` = 13.5 world units and reads as about 1.5 capital-ship lengths. Chart and 3D share `hexToWorld`. | `battle-presentation.js` |
| Light | Per-scenario looks: Nevis in late-day sun, Dogger Bank in cold morning haze, Hampton Roads under a flat afternoon, the North Atlantic grey and heaving, the Strait hot and hazy. The haze colour is sampled from the sky's own horizon, so distant ships fade into the air instead of a fog wall, with no hard horizon band. | `battle-looks.js` |
| Sea | three.js `Water` with a procedural tileable normal map (no texture download), reflections and sun glints, noise retuned for follow-camera range. No shadows on the water. | `waterNormals()` and look `waves` |
| Sky | three.js `Sky` (Preetham with clouds), scaled and clamped once at the source so the sky, its PMREM environment map, reflections and haze agree. Painted steel is dielectric paint, not chrome. | look `sky`, `skyScale` |
| Post | Half-float MSAA composer, bloom only above the clamped sky (flashes, fire, the sun), a linear grade (tint, saturation, vignette), then ACES or AgX tone mapping per look. | look `tone`, `exposure`, `grade` |
| Camera | Framed from the followed ship's size, from the bearing clear of neighbouring hulls, with the low sun behind and to one side so the sides and canvas we see are lit. This fixes the Nevis start inside the rigging. | `frameCamera()` |
| Ships | Hull parts are merged per material (about 7 draw calls per ship), with textured foam wakes, Kelvin arms and bow waves shown only while under way, and billowed sails. Hulls heave, pitch and roll with the swell; sinking ships settle and list. Sailing ships have no funnel and so no coal smoke, in the ironclad era too. | `battle-models.js` |
| Effects | GPU-instanced particles (two draw calls in total, smoke depth-sorted), in sea-fixed coordinates so smoke stays where it was made while the camera follows its ship. Funnel smoke from real funnel positions drifts downwind. Muzzle flash, gun smoke by era, shell arcs, tall splash columns for misses and straddles, fireballs for hits, fires, sinkings, the magazine set piece (flash, fire column, mushroom cloud, shock ring), torpedo wakes, missile trails, intercepts, and ASW splashes and ping rings. | `battle-effects.js` |
| Contract | `tests/battle-contract.test.js` scans the simulation and chart for every event type and entity kind, and fails when one has neither a 3D handler nor a named known gap. | `FX_KNOWN_GAPS` |

**Performance.** The 30 fps cap and the 1.5 pixel-ratio cap are unchanged. At Dogger Bank with eight ships, one frame's scene pass (shadow map, water reflection and main view) is 114 draw calls, down from 410 before hull merging, and about 15k triangles, well inside the doc's 300-call budget. That pass renders in about 1.7 ms at 1920×1200 on an Apple M4 Pro (ANGLE Metal). Expect roughly three to four times that on an M1 or M2, which still leaves most of a 33 ms frame. If a machine cannot hold about 20 fps, the renderer steps its pixel ratio down, but it ignores stalled windows so a background or throttled tab is not mistaken for a slow GPU. The lazy 3D chunk is 663 kB (172 kB gzip).

**Developer tools.** Press <kbd>`</kbd> in the 3D view, or add `?hud` to the URL, for a frame-time HUD showing fps, CPU time per frame, draw calls, triangles, live particles, pixel ratio and the active look. In `npm run dev`, `window.__battle3d` exposes the scene, camera, effects and look for tuning in the console.

## Visual direction
The plan for taking the view from prototype to a convincing 2026 look (art direction, scale rule, water, ships, effects, camera, sound, performance tiers, milestones and quick wins) is in [3d-visual-direction.md](3d-visual-direction.md).

## Ship foundation follow-up

The follow-up worktree `feat/battle-ship-foundation` adds public, type/era-driven
presentation specs (`ship-specs.js`), a lofted hull kit (`ship-hull.js`), boot-topping,
angular gun houses, tiered sails and stationary hull foam. Foam is anchored to the
flat sea rather than inheriting deck pitch/roll. `battle-sea.js` tunes directional
normal-map swell/chop and bounded reflection distortion; a failed pinned shader
patch leaves plain Three Water and a HUD warning, not a failed battle camera.
This is still a flat reflector, not a shared displaced-wave buoyancy model.

`ship-assets.js` provides optional local per-era glTF loading with meshopt/KTX2
hooks, public identified-name variants, shared geometry and procedural fallback.
The registry remains empty. No hero art or borrowed reference images are shipped;
KTX2/Basis texture decode is now covered by an original isolated fixture; see [fixture validation](ship-fixtures.md).
See [asset contract](ship-assets.md) and [Blender/reference recommendation](ship-model-research.md).
The chart, simulation, fog-of-war input boundary and reduced-motion path remain
unchanged. These procedural improvements do not replace real-device frame-time measurement or hero-model provenance gates.

Foundation verification (2026-09-29): `npm test` **162 passing**; syntax check,
`git diff --check`, and production build pass. Production-preview browser smoke
covered all six scenarios, reduced-motion tick updates and WebGL-loss chart
fallback, with no unexpected console errors. Scenario-table tests cover every
current ship's spec and procedural dispatch. Screenshots are local QA artifacts
under `output/playwright/*-final.png`, not a fixed-seed golden reference suite.
The new lazy 3D chunk is **820.54 kB / 224.00 kB gzip**; Vite's size warning
remains. Basis JS/WASM are emitted locally and both return HTTP 200 from preview;
that is packaging evidence only, not compressed-texture decode validation.
Phone/mid-laptop frame times and Craig's art acceptance were not measured.

**Current user override:** Craig’s visual feedback is optional, not a merge/release gate. Retain measurable rendering, fog-of-war, licensing and performance checks.
