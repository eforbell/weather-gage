# Real compressed-texture fixture

This closes the initial **KTX2/Basis texture decode** gap, not every glTF codec or
hero-art gate. The original 2484-byte GLB has a 12-triangle synthetic hull and an
8×8 checker. No third-party art or default game registry entry is added.

## Run the verification

Application dependencies are unchanged. Install the exact test tools into a
**temporary prefix**, not the repository:

```sh
TOOLS=$(mktemp -d)
npm install --prefix "$TOOLS" --no-package-lock --ignore-scripts playwright@1.58.2 gltf-validator@2.0.0-dev.3.10
node "$TOOLS/node_modules/playwright/cli.js" install --no-shell chromium
npm ci
npm run check
npm test
npm run build
npm run build:fixture
FIXTURE_TOOLS="$TOOLS" FIXTURE_BROWSER_CHANNEL=chromium npm run test:fixture
```

On Linux CI use `install --with-deps --no-shell chromium`; the workflow pins
checkout/setup/artifact actions by commit and runs on Node 22 / Ubuntu 22.04.
`FIXTURE_BROWSER_CHANNEL=chrome` can use local Chrome for an additional check,
but the pinned Chromium channel is the reproducible baseline.

The probe exercises the **real** `createShipAssetManager` with `units: 'meters'`:
no procedural fallback, 9-unit hull length, decoded 8×8 texture, shared geometry
and separate materials, a real GPU upload/render with both checker colors, and
local Basis JS/WASM fetches. It rejects console errors, unexpected warnings and remote dependencies. Driver performance warnings caused by the deliberate ReadPixels checks/screenshots are recorded and narrowly allowed; they are not a frame-time benchmark.
Teardown disposes instances, cached resources, decoder workers and renderer. Preview readiness uses Vite’s API and actual bound TCP address, never ANSI-colored CLI output.
`output/fixtures/validation.json` and `codec-probe.png` record local/CI evidence.

The pinned Khronos glTF Validator reports **zero errors** but cannot understand
`KHR_texture_basisu`. It emits two known image/ktx2 warnings, narrowly allowed by
code/pointer in the verifier; all other warnings fail. The encoder validates the
KTX2 container at generation, structural tests check BasisLZ headers and a locked
hash, and real browser decoding/rendering covers the unsupported extension.
Do not describe this as warning-free or full extension validation.

## Isolation

`build:fixture` makes `dist-fixture/` with its own HTML probe and emitted GLB.
Ordinary `build` still produces only the game in `dist/`; the verifier checks
that the probe/fixture are absent. Ordinary dev serving blocks the probe and
its source, as well as repository tests/scripts/reference. The fixture is never
registered in the gameplay asset packs. KTX2 dependencies now share the local
LoadingManager guard used by glTF, rather than bypassing it.

## Regeneration

Use the [official KTX-Software 4.4.2 release](https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2).
Do not install system packages just to generate a fixture. On macOS, extract the
Darwin arm64 pkg using `pkgutil --expand-full`, then merge its tools and library
payload `usr/local/` trees into a temporary prefix so `bin/ktx` finds
`lib/libktx.4.dylib`. Verify the downloaded package against the provenance hash.
Linux has an official tarball which can likewise be extracted temporarily.

```sh
KTX_BIN="$PREFIX/bin/ktx" node scripts/generate-ship-fixture.mjs
```

The generator creates an original PNG, calls `ktx create --format
R8G8B8A8_SRGB --encode basis-lz`, validates the KTX2 container, and embeds it in a
GLB. Generation requires encoder version 4.4.2. Intentional changes must update
both the fixture test hash and the provenance record after fresh validation.

## Still open

Meshopt/Draco geometry fixtures, skinned rigs/LODs, large hero assets, device frame
times and broader browser/GPU coverage are not proven by this tiny fixture.
The CI workflow has been authored and local equivalent checks run; a hosted
GitHub result must be observed before claiming hosted CI passes. Craig feedback
remains optional, not a release gate.
