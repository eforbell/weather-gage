import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShipAssetManager, cloneShipAsset, disposeShipAssetInstance, shipAssetSpecFor, SHIP_ASSET_REGISTRY, normalizeShipAssetSpec, hasShipAsset } from '../src/ui/ship-assets.js';

function templateShip() {
  const group = new THREE.Group();
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ color: 0x445566, map: texture });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 4), material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  group.userData.radius = 2;
  return group;
}

function fakeLoader(scene, options = {}) {
  let calls = 0;
  return {
    get calls() { return calls; },
    async loadAsync(url) {
      calls += 1;
      if (options.reject) throw new Error(options.reject);
      return { scene, url };
    },
  };
}

function firstMesh(root) {
  let found = null;
  root.traverse(item => { if (!found && item.isMesh) found = item; });
  return found;
}

test('default ship asset registry is intentionally empty by era', () => {
  for (const era of ['sail', 'ironclad', 'dreadnought', 'modern', 'coldwar']) assert.deepEqual(SHIP_ASSET_REGISTRY[era], {});
});

test('shipAssetSpecFor resolves and normalizes class/type names within an era registry', () => {
  const spec = { url: '/assets/ships/lion.glb' };
  const registry = { dreadnought: { battlecruiser: spec } };
  assert.deepEqual(shipAssetSpecFor({ type: 'Battlecruiser' }, 'dreadnought', registry), normalizeShipAssetSpec(spec));
  assert.equal(shipAssetSpecFor({ type: 'Battlecruiser' }, 'sail', registry), null);
});

test('ship asset lookup prefers public ship/class variant keys before generic type', () => {
  const lion = { url: '/assets/ships/lion.glb' };
  const seydlitz = { url: '/assets/ships/seydlitz.glb' };
  const generic = { url: '/assets/ships/battlecruiser.glb' };
  const registry = { dreadnought: { lion, seydlitz, battlecruiser: generic } };
  assert.deepEqual(shipAssetSpecFor({ own: true, name: 'Lion', type: 'Battlecruiser' }, 'dreadnought', registry), normalizeShipAssetSpec(lion));
  assert.deepEqual(shipAssetSpecFor({ own: false, name: 'Seydlitz', type: 'Battlecruiser' }, 'dreadnought', registry), normalizeShipAssetSpec(seydlitz));
  assert.deepEqual(shipAssetSpecFor({ own: false, type: 'Battlecruiser' }, 'dreadnought', registry), normalizeShipAssetSpec(generic));
  assert.equal(hasShipAsset({ type: 'Battlecruiser' }, 'dreadnought', { dreadnought: { battlecruiser: { url: 'https://bad.example/lion.glb' } } }), true);
});

test('asset manager lazily caches glTF templates and clones per instance', async () => {
  const source = templateShip();
  const loader = fakeLoader(source);
  const spec = { url: '/assets/ships/lion.glb' };
  const manager = createShipAssetManager({ gltfLoader: loader, registry: { dreadnought: { battlecruiser: spec } } });

  const first = await manager.createModel({ id: 'a', own: true, type: 'Battlecruiser' }, 'dreadnought');
  const second = await manager.createModel({ id: 'b', own: true, type: 'Battlecruiser' }, 'dreadnought');

  assert.equal(loader.calls, 1);
  assert.notEqual(first, second);
  const firstPart = firstMesh(first);
  const secondPart = firstMesh(second);
  assert.equal(firstPart.geometry, secondPart.geometry);
  assert.notEqual(firstPart.material, secondPart.material);
  assert.equal(firstPart.geometry, source.children[0].geometry);
  assert.deepEqual(first.userData.shipAssetSpec, normalizeShipAssetSpec(spec));
});

test('normalized spec applies waterline, orientation, scale, shadows, funnels, and size metadata', () => {
  const source = templateShip();
  const instance = cloneShipAsset(source, {
    url: '/assets/ships/test.glb', scale: 2, waterlineY: 0.3, rotationY: Math.PI / 4,
    length: 9, width: 2, lengthMeters: 180, beamMeters: 24, className: 'Test class', funnels: [{ x: 0.2, y: 1.5, z: -0.4 }],
  });
  assert.equal(instance.scale.x, 1);
  assert.equal(instance.position.y, 0);
  assert.equal(instance.rotation.y, 0);
  const authored = instance.children[0];
  assert.equal(authored.scale.x, 2);
  assert.equal(authored.position.y, -0.6);
  assert.equal(authored.rotation.y, Math.PI / 4);
  assert.equal(firstMesh(instance).castShadow, true);
  assert.equal(firstMesh(instance).receiveShadow, true);
  assert.deepEqual(instance.userData.size, { length: 18, width: 4 });
  assert.deepEqual(instance.userData.dimensions, { lengthMeters: 180, beamMeters: 24 });
  assert.equal(instance.userData.shipClass, 'Test class');
  assert.deepEqual(instance.userData.funnels.map(v => v.toArray()), [[0.2, 1.5, -0.4]]);
  assert.ok(instance.userData.radius > 0);
});

test('asset manager falls back procedurally when no registered asset exists', async () => {
  let fallbackCalls = 0;
  const fallback = (actor, era) => {
    fallbackCalls += 1;
    const group = new THREE.Group();
    group.userData.actor = actor.id;
    group.userData.era = era;
    return group;
  };
  const manager = createShipAssetManager({ gltfLoader: fakeLoader(templateShip()), registry: {}, fallbackFactory: fallback });
  const model = await manager.createModel({ id: 'fallback', own: true, type: 'Destroyer' }, 'dreadnought');
  assert.equal(fallbackCalls, 1);
  assert.equal(model.userData.proceduralFallback, true);
  assert.equal(model.userData.actor, 'fallback');
});

test('stale scene load guard drops late glTF results', async () => {
  let release;
  const loader = { loadAsync: () => new Promise(resolve => { release = () => resolve({ scene: templateShip() }); }) };
  const manager = createShipAssetManager({ gltfLoader: loader, registry: { dreadnought: { cruiser: { url: '/assets/ships/cruiser.glb' } } } });
  const token = manager.beginSceneLoad();
  const pending = manager.createModel({ own: true, type: 'Cruiser' }, 'dreadnought', token);
  manager.beginSceneLoad();
  release();
  assert.equal(await pending, null);
});

test('remote asset and transcoder URLs are rejected and keep proceduralFallback identity', async () => {
  const manager = createShipAssetManager({
    gltfLoader: fakeLoader(templateShip()),
    registry: { dreadnought: { cruiser: { url: 'https://example.com/cruiser.glb' } } },
    fallbackFactory: () => new THREE.Group(),
  });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const model = await manager.createModel({ own: true, type: 'Cruiser' }, 'dreadnought');
    assert.equal(model.userData.proceduralFallback, true);
  } finally {
    console.warn = originalWarn;
  }
  assert.throws(() => createShipAssetManager({ renderer: {}, basisTranscoderPath: 'https://cdn.example/basis/' }), /local path/);
  assert.throws(() => normalizeShipAssetSpec({ url: 'urn:ship:lion' }), /local path/);
  assert.throws(() => normalizeShipAssetSpec({ url: '//cdn.example/lion.glb' }), /local path/);
});

test('rejected glTF loads fall back with proceduralFallback identity', async () => {
  const manager = createShipAssetManager({
    gltfLoader: fakeLoader(templateShip(), { reject: 'missing fixture' }),
    registry: { dreadnought: { cruiser: { url: '/assets/ships/cruiser.glb' } } },
    fallbackFactory: () => new THREE.Group(),
  });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const model = await manager.createModel({ own: true, type: 'Cruiser' }, 'dreadnought');
    assert.equal(model.userData.proceduralFallback, true);
  } finally {
    console.warn = originalWarn;
  }
});

test('disposeShipAssetInstance disposes cloned material resources but not shared geometry or textures', () => {
  const instance = cloneShipAsset(templateShip(), { url: '/assets/ships/test.glb' });
  const mesh = firstMesh(instance);
  const geometry = mesh.geometry;
  const material = mesh.material;
  const texture = material.map;
  let geometryDisposed = 0, materialDisposed = 0, textureDisposed = 0;
  geometry.dispose = () => { geometryDisposed += 1; };
  material.dispose = () => { materialDisposed += 1; };
  texture.dispose = () => { textureDisposed += 1; };
  disposeShipAssetInstance(instance);
  assert.equal(geometryDisposed, 0);
  assert.equal(materialDisposed, 1);
  assert.equal(textureDisposed, 0);
});

test('manager disposal frees cached template geometry, material, and shared textures', async () => {
  const source = templateShip();
  const geometry = source.children[0].geometry;
  const material = source.children[0].material;
  const texture = material.map;
  let geometryDisposed = 0, materialDisposed = 0, textureDisposed = 0;
  geometry.dispose = () => { geometryDisposed += 1; };
  material.dispose = () => { materialDisposed += 1; };
  texture.dispose = () => { textureDisposed += 1; };
  const manager = createShipAssetManager({ gltfLoader: fakeLoader(source), registry: { dreadnought: { cruiser: { url: '/assets/ships/cruiser.glb' } } } });
  await manager.createModel({ own: true, type: 'Cruiser' }, 'dreadnought');
  manager.dispose();
  assert.equal(geometryDisposed, 1);
  assert.equal(materialDisposed, 1);
  assert.equal(textureDisposed, 1);
});

test('manager disposal frees templates that resolve after shutdown', async () => {
  const source = templateShip();
  let release;
  const loader = { loadAsync: () => new Promise(resolve => { release = () => resolve({ scene: source }); }) };
  let disposed = 0;
  source.children[0].geometry.dispose = () => { disposed += 1; };
  const manager = createShipAssetManager({ gltfLoader: loader, registry: { dreadnought: { cruiser: { url: '/assets/ships/cruiser.glb' } } } });
  const pending = manager.createModel({ own: true, type: 'Cruiser' }, 'dreadnought');
  manager.dispose();
  release();
  assert.equal(await pending, null);
  assert.equal(disposed, 1);
});

test('uncertain and stale contacts cannot trigger authored asset loads', async () => {
  const loader = fakeLoader(templateShip());
  const manager = createShipAssetManager({
    gltfLoader: loader,
    registry: { dreadnought: { lion: { url: '/ships/lion.glb' }, battlecruiser: { url: '/ships/generic.glb' } } },
    fallbackFactory: () => new THREE.Group(),
  });
  for (const stale of [false, true]) {
    const model = await manager.createModel({ own: false, uncertain: true, stale, name: 'Lion', type: 'Battlecruiser' }, 'dreadnought');
    assert.equal(model.userData.proceduralFallback, true);
  }
  assert.equal(loader.calls, 0);
  manager.dispose();
});
