# Ship asset pipeline foundation

`src/ui/ship-assets.js` is the first shared boundary between authored ship art and the procedural models already used by the 3D battle view.

## What exists now

- `SHIP_ASSET_REGISTRY` has a pack per simulation era (`sail`, `ironclad`, `dreadnought`, `modern`, `coldwar`). Authored entries cover all eight Dogger Bank ships under `dreadnought` (HMS Lion, HMS Orion, HMS Meteor, HMS Laurel, SMS Seydlitz, SMS Posen, SMS V186, SMS S33), the four Nevis frigates under `sail` (USS Constellation, USS Baltimore, L’Insurgente, Volontaire), and all seven Hampton Roads ships under `ironclad` (USS Congress, USS Cumberland, USS Minnesota, USS Monitor, CSS Virginia, CSS Patrick Henry, CSS Jamestown): original models generated from their metre specs in `ships/` by the headless Blender pipeline. They retain measured beam; procedural fallbacks follow the [fleet proportion policy](3d-visual-direction.md#fleet-proportions-2026-10-02). See [ship-pipeline.md](ship-pipeline.md) to add more; every entry must name its `specId` and is tested against that spec.
- `createShipAssetManager()` builds a lazy glTF loader using the pinned Three.js addons already in `node_modules`: `GLTFLoader`, `KTX2Loader`, and `MeshoptDecoder`.
- The manager accepts injected loaders for tests and future integration, caches each glTF template by URL, and returns a cloned scene per ship instance.
- Each clone shares template geometry but receives its own material objects so per-ship damage, paint, decals, or disposal will not mutate another ship. Geometry and texture objects remain shared with the cached template and are disposed only when the manager is disposed.
- If no spec is registered, or a load fails, the manager returns the existing procedural model from `battle-models.js` with `userData.proceduralFallback === true`.
- Local-only paths are enforced for ship URLs and optional KTX2 transcoder paths. Any URL scheme (`https:`, `urn:`, etc.) or protocol-relative path is rejected for registry assets. A default LoadingManager also rejects cross-origin embedded glTF dependencies; KTX2 decoder files use Three's bundled local addon resolution unless a local transcoder path is supplied.

## Registry shape

Keep registry entries evidence-backed and license-reviewed. Example shape for a future asset pack:

```js
const registry = {
  dreadnought: {
    'hms lion': {
      url: '/assets/ships/dreadnought/hms-lion.glb',
      className: 'Lion-class battlecruiser',
      lengthMeters: 213,
      beamMeters: 27,
      // presentation units used by wake/foam handoff and camera metadata
      size: { length: 9.4, width: 1.9 },
      // transform from DCC coordinates into the battle view's waterline/orientation
      units: 'meters', // normalization applies modelMetersToWorld(era) once
      waterlineY: 0,
      rotationY: 0,
      funnels: [{ x: 0, y: 1.7, z: -0.8 }],
      turrets: [{ name: 'A', x: 0, z: -70, guns: 2 }],
      paint: 'grand-fleet-grey',
      license: 'record in assets/CREDITS.md before registration',
    },
  },
};
```

Do not add paths here until the model can be redistributed in this web game and its provenance is recorded. Registry keys are matched against lower-case public actor fields in this order: `name`, `className`, then generic `type`; this supports public/identified variants like Lion and Seydlitz without reading hidden side data. Entries must declare `units: 'meters' | 'presentation'`. Specs are normalized at load time with defaults for `scale`, `waterlineY`, `rotationY`, `size`, and real-world `dimensions` metadata.

## Integration advice for `battle-3d.js`

Create one manager per 3D view after the renderer exists:

```js
const shipAssets = createShipAssetManager({ renderer });
```

At the start of a scene/era/model refresh, get a load token:

```js
const token = shipAssets.beginSceneLoad();
```

When adding an actor, keep the procedural model immediately unless `hasShipAsset(actor, era)` returns true. For registered public/known actors, await `createModel(actor, era, token)`. If it returns `null`, the result was stale because the view was disposed or a newer refresh began; skip attaching it. If it returns a procedural fallback, keep the current procedural model. Dispose live authored instances with `disposeShipAssetInstance(model)` and dispose the manager when the 3D view is torn down so KTX2 workers, cached template geometry/materials, and shared textures are released.

This token guard matters because glTF loads are asynchronous: a late HMS Lion load must not attach itself to a disposed scene, the wrong era, or a ship that has already left the player-visible view. Authored instances expose `userData.shipAssetSpec`, `shipClass`, `dimensions`, `size`, `radius`, `anchors` (every `anchor_*` node in the GLB, in wrapper space) and `funnels` as `THREE.Vector3` points for smoke. `funnels` come from a spec-provided list if there is one, otherwise from the GLB's `anchor_funnel_*` nodes. The current battle view uses an item-identity guard instead of advancing generation on every sync; a tick must not cancel valid loads for ships still visible. The swap goes through `adoptAuthoredModel(previous, loaded)`, which copies the pose and builds **new** waterline foam and wake for the authored hull (`createSurfaceEffects` in `battle-models.js`). The foam follows the GLB's `weatherGageWaterline` contour (exposed as `userData.waterline`) and is sized from the authored `size`. The stand-in's foam is never reused, because its hull is a different width; it is disposed with the stand-in. Foam uses shared procedural materials and is detached and disposed separately before the authored instance's materials.

## Compression status

The loader is wired for KTX2 textures and meshopt-compressed geometry through Three's pinned addons. An original tiny GLB with an embedded BasisLZ KTX2 checker now exercises the real texture decode/upload/render path in an isolated fixture build and CI workflow. See [fixture validation](ship-fixtures.md). Meshopt geometry decoding is still not fixture-tested.

### Coordinate contract

The returned actor wrapper has identity scale/orientation/waterline transform. Its authored child receives normalized `scale`, `rotationY` (radians), and `waterlineY` (source units, scaled once). The actor wrapper's negative Z is bow and Y=0 is the waterline. `size` and `funnels` are already in wrapper/world units: do not scale them again. The shorthand `length`/`width` inputs, if used instead of `size`, are source units multiplied by `scale`.

Pinned Three 0.186.1 constructs its default Basis JS/WASM URLs with `new URL(..., import.meta.url)`; Vite emits both files in `dist/assets`. Do not copy an older Three decoder-path recipe without checking the pinned loader. Bundling alone proves packaging; the separate fixture verifies actual KTX2/Basis texture decoding.

This foundation expects static mesh ship assets. Skinned/animated rigs, authored
LODs and trim-texture damage layers are not yet supported
or acceptance-tested; keep using procedural models until those gates are met.


### Enforced units

Registry entries must explicitly declare `units`. For `meters`, normalization
uses `modelMetersToWorld(era)` (the entry's `era`) automatically and rejects conflicting manual scales.
For `presentation`, scale defaults to 1; any explicit scale must be finite and
positive. Re-normalizing a spec is idempotent, so the metre conversion cannot be
applied twice. `length`/`width` and `waterlineY` remain source units; `size` and
`funnels` remain explicit world-space metadata. Invalid declarations fall back
to the procedural model through the existing load boundary.
