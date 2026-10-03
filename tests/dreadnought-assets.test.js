import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SCENARIO_SETUPS } from '../src/sim/scenarios.js';
import { SHIP_ASSET_REGISTRY, createShipAssetManager, disposeShipAssetInstance, shipAssetSpecFor } from '../src/ui/ship-assets.js';
import { loadShipSpec } from '../scripts/ship-asset-report.mjs';

const fleet = SCENARIO_SETUPS.dogger.ships;

test('the entire Dogger fleet resolves to distinct named authored assets', () => {
  assert.equal(fleet.length, 8);
  const ids = fleet.map(ship => {
    const entry = shipAssetSpecFor({ ...ship, own: true }, 'dreadnought');
    assert.ok(entry, `${ship.name} must not remain a procedural stand-in`);
    assert.equal(entry.specId, ship.name.toLowerCase().replaceAll(' ', '-'));
    assert.equal(entry.units, 'meters');
    assert.equal(entry.waterlineY, 0);
    assert.equal(entry.rotationY, 0);
    return entry.specId;
  });
  assert.equal(new Set(ids).size, fleet.length);
  assert.deepEqual(Object.keys(SHIP_ASSET_REGISTRY.dreadnought).sort(), fleet.map(ship => ship.name.toLowerCase()).sort());
});

test('Dogger screens keep slender, smaller hulls and distinct national palettes', async () => {
  const specs = await Promise.all(fleet.map(ship => loadShipSpec(shipAssetSpecFor(ship, 'dreadnought').specId)));
  const capitals = specs.filter((_, i) => fleet[i].type !== 'destroyer');
  const screens = specs.filter((_, i) => fleet[i].type === 'destroyer');
  for (const spec of screens) {
    assert.ok(spec.hull.length / spec.hull.beam >= 9, `${spec.name}: not a widened capital-ship clone`);
    assert.ok(spec.hull.length < Math.min(...capitals.map(s => s.hull.length)));
    assert.ok(spec.hull.beam < Math.min(...capitals.map(s => s.hull.beam)));
    assert.ok(spec.funnels.length >= 2, `${spec.name}: period steam silhouette`);
    assert.equal(spec.secondaryGuns?.mounts?.length || 0, 0, `${spec.name}: no invented secondary battery on screens`);
  }
  const british = specs.find(s => s.id === 'hms-meteor');
  const german = specs.find(s => s.id === 'sms-v186');
  assert.notEqual(british.paint.hull, german.paint.hull, 'screen sides have distinct paint character');
});

test('every new fleet hull has a provenance ledger and explicitly chosen fidelity', async () => {
  for (const ship of fleet.filter(s => !['b_lion', 'r_seydlitz'].includes(s.id))) {
    const entry = shipAssetSpecFor(ship, 'dreadnought');
    const provenance = await readFile(`ships/${entry.specId}/PROVENANCE.md`, 'utf8');
    assert.match(provenance, /original/i);
    assert.match(provenance, /simplif|abstrac|depart|class-faithful|side-faithful/i);
    assert.match(provenance, /1915/);
  }
});

test('all Dogger names retain procedural fallback on failed loads and never fetch uncertain contacts', async () => {
  const requests = [];
  const manager = createShipAssetManager({
    gltfLoader: { async loadAsync(url) { requests.push(url); throw new Error('asset unavailable'); } },
    fallbackFactory: () => new THREE.Group(),
  });
  try {
    for (const ship of fleet) {
      const uncertain = await manager.createModel({ ...ship, own: false, uncertain: true }, 'dreadnought');
      assert.equal(uncertain.userData.proceduralFallback, true);
      disposeShipAssetInstance(uncertain);
    }
    assert.equal(requests.length, 0, 'named but uncertain reports do not disclose authored hull identity');
    for (const ship of fleet) {
      const fallback = await manager.createModel({ ...ship, own: true }, 'dreadnought');
      assert.equal(fallback.userData.proceduralFallback, true, ship.name);
      disposeShipAssetInstance(fallback);
    }
    assert.equal(new Set(requests).size, fleet.length);
  } finally {
    manager.dispose();
  }
});

// Keep declared gun counts honest, and inspect the exported geometry rather
// than trusting spec heights: both single and twin mounts must expose barrels.
// A ray from above each exposed barrel must hit that barrel, not a deckhouse,
// forecastle or another turret roof hiding it.
for (const ship of fleet.filter(s => !['b_lion', 'r_seydlitz'].includes(s.id))) {
  test(`${ship.name}: exported main gun barrels are exposed above surrounding geometry`, async () => {
    const entry = shipAssetSpecFor(ship, 'dreadnought');
    const spec = await loadShipSpec(entry.specId);
    const bytes = await readFile(`public/${entry.url}`);
    const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    scene.updateMatrixWorld(true);
    const t = spec.turretType;
    for (const turret of spec.turrets) {
      assert.ok([1, 2].includes(turret.guns), 'only supported single/twin mounts');
      const anchor = scene.getObjectByName(`anchor_turret_${turret.id}`).getWorldPosition(new THREE.Vector3());
      const direction = turret.facing === 'aft' ? 1 : -1;
      const exposedStart = Math.min(t.barrelLength * 0.7, 1.3); // beyond the canvas sleeve
      for (const side of turret.guns === 1 ? [0] : [-1, 1]) {
        for (const fraction of [0.15, 0.5, 0.9]) {
          const extension = exposedStart + (t.barrelLength - exposedStart) * fraction;
          const x = (turret.side || 0) + side * t.gunSpacing / 2;
          const z = anchor.z - direction * (t.barrelLength - extension);
          const ray = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObject(scene, true)[0];
          assert.ok(hit, `${turret.id}: exported barrel geometry exists`);
          assert.ok(hit.point.y >= anchor.y - 0.02 && hit.point.y <= anchor.y + t.barrelRadius + 0.12,
            `${turret.id}: barrel at ${extension.toFixed(2)}m is buried/occluded (top ${hit.point.y.toFixed(2)}m, axis ${anchor.y.toFixed(2)}m)`);
        }
      }
    }
  });
}
