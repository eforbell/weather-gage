# 3D battle-camera prototype

This work lives on `prototype/three-battle-view`. The existing SVG chart and deterministic simulation are unchanged. The 3D scene is presentation only and receives `getView(state, 'blue', selected)` rather than raw enemy state. It is lazy-loaded on **Go to the battle · 3D**, stops rendering when hidden, caps pixel density at 1.5 and frames near 30 fps, and falls back to the chart if WebGL fails.

## What this branch proves

- Real orbit/zoom perspective, 3D meshes for sail, ironclad, battleship/destroyer, carrier, and submarine roles.
- Lit sea, low sun, wakes, smoke, shell/missile paths, and impact flashes.
- The selected ship remains the camera anchor; orders, clock, saves, and mission results still come from the same simulation.
- Unseen enemies are absent. Unidentified and stale contacts get uncertain 3D markers, not detailed enemy models.
- A Vite build produces static `dist/` files. No remote art, font, account, or runtime service is needed.

## Cost and decision boundary

Three.js itself has no license fee ([MIT license](https://threejs.org/license/)). Its [official installation guide](https://threejs.org/manual/pages/installation.html) recommends npm and a build tool for a project with package imports; this branch uses pinned Three.js and Vite packages. [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) supplies mouse/touch orbit and zoom.

Engineering estimate, not a quote: a robust vertical slice with camera, fog-of-war plumbing, failure fallback, and browser QA is roughly **1–3 developer days**; making six eras look convincingly cinematic is likely **several weeks** of modeling, materials, environment, effects, optimization, and playtest iteration. The engine is the cheap part. The biggest variable is model quality and provenance: licensed glTF ships or commissioned art would need a separate asset budget and permission review. Procedural meshes in this branch cost no asset fee, but they are deliberately low-poly and not the final Craig-ready look.

The current build's lazy 3D JavaScript chunk is about **608 kB / 154 kB gzip**, while the initial app chunk is about **145 kB / 51 kB gzip** (local `npm run build`, 2026-09-29). This excludes any future high-detail meshes and textures, which could dominate download size and GPU memory.

Do **not** merge this branch on the strength of a successful build alone. The go/no-go gate should include: Craig's visual reaction to the live camera; licensed/provenanced models for at least one flagship and one opposing ship; desktop and phone frame-time measurement; no new fog-of-war leaks; WebGL failure recovery; and a full saved-sortie regression pass. If the procedural art is still too toy-like, invest in assets before expanding code.

## Known limits

- Models are authored from Three.js geometry, not high-fidelity `.glb` assets. Silhouettes are representative rather than historically exact.
- The sea and smoke are restrained prototypes, not volumetric rendering. No post-processing bloom or physically based environment map is included.
- The 3D camera is for immersion, not aiming or exact navigation; use the chart for hex plotting.
- Reduced-motion users get a static 3D view that updates on turns and camera gestures. WebGL is still required for the mode.
