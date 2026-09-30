// Only built by build:fixture. Not imported by the game or shipped in dist/.
import * as THREE from 'three';
import fixtureUrl from '../../tests/fixtures/ship-loader/mini-basis.glb?url';
import { createShipAssetManager, disposeShipAssetInstance } from './ship-assets.js';

async function probe() {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(512, 256);
  document.body.append(renderer.domElement);
  const manager = createShipAssetManager({ renderer, registry: { dreadnought: { fixture: { url: fixtureUrl, units: 'meters', length: 210, width: 28 } } } });
  const models = [];
  try {
    const actor = { own: true, type: 'Fixture', id: 'fixture' };
    const first = await manager.createModel(actor, 'dreadnought'); models.push(first);
    const second = await manager.createModel(actor, 'dreadnought'); models.push(second);
    if (!first || first.userData.proceduralFallback || !second || second.userData.proceduralFallback) throw new Error('Real asset did not load; procedural fallback is not a codec pass');
    let mesh, other;
    first.traverse(p => { if (p.isMesh) mesh = p; }); second.traverse(p => { if (p.isMesh) other = p; });
    if (!mesh?.material.map || !other) throw new Error('Fixture texture or geometry missing');
    const texture = mesh.material.map;
    const size = new THREE.Box3().setFromObject(first).getSize(new THREE.Vector3());
    if (Math.abs(size.z - 9) > 1e-5) throw new Error(`Wrong meter conversion: length ${size.z}`);
    if (texture.image.width !== 8 || texture.image.height !== 8) throw new Error('Basis did not decode the 8x8 image');
    if (!texture.isCompressedTexture && !texture.isDataTexture) throw new Error('Unexpected KTX2 output texture');
    if (mesh.geometry !== other.geometry || mesh.material === other.material) throw new Error('Instance resource ownership failed');
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf2edde);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 3));
    first.position.x = -2; second.position.x = 2; scene.add(first, second);
    const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 100);
    camera.position.set(10, 8, 16); camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    if (gl.getError() !== gl.NO_ERROR) throw new Error('GPU upload/render error');
    const pixels = new Uint8Array(512 * 256 * 4);
    gl.readPixels(0, 0, 512, 256, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    // A blank background is not a successful rendered texture.
    let changed = 0, warm = 0, cool = 0;
    for (let i = 0; i < pixels.length; i += 4) if (Math.abs(pixels[i] - pixels[0]) + Math.abs(pixels[i + 1] - pixels[1]) + Math.abs(pixels[i + 2] - pixels[2]) > 20) {
      changed++; if (pixels[i] > pixels[i + 2] + 10) warm++; if (pixels[i + 2] > pixels[i] + 10) cool++;
    }
    if (changed < 100 || warm < 20 || cool < 20) throw new Error(`Fixture palette missing: ${JSON.stringify({changed,warm,cool})}`);
    return { ok: true, width: 8, height: 8, worldLength: size.z, compressedGpu: Boolean(texture.isCompressedTexture), triangles: renderer.info.render.triangles, changedPixels: changed, warmPixels: warm, coolPixels: cool };
  } finally {
    models.filter(Boolean).forEach(disposeShipAssetInstance);
    manager.dispose(); renderer.dispose();
  }
}
probe().then(result => {
  globalThis.__fixtureResult = result;
  document.getElementById('fixture-status').textContent = `PASS: ${JSON.stringify(result)}`;
}).catch(error => {
  globalThis.__fixtureResult = { ok: false, error: error.message };
  document.getElementById('fixture-status').textContent = `FAIL: ${error.message}`;
});
