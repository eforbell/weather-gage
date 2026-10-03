import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SCENARIO_SETUPS } from '../src/sim/scenarios.js';
import { SHIP_ASSET_REGISTRY, shipAssetSpecFor, createShipAssetManager, disposeShipAssetInstance } from '../src/ui/ship-assets.js';
import { loadShipSpec } from '../scripts/ship-asset-report.mjs';
import { SHIP_LENGTH, modelMetersToWorld } from '../src/ui/battle-presentation.js';

const fleet = SCENARIO_SETUPS.esperance.ships;
const idFor = ship => ship.name.toLowerCase().replaceAll(' ', '-');
const layouts = {
  'uss-boise': [3, 3, 3, 3, 3], 'uss-helena': [3, 3, 3, 3, 3],
  'uss-san-francisco': [3, 3, 3], 'uss-salt-lake-city': [2, 2, 3, 3],
  aoba: [2, 2, 2], furutaka: [2, 2, 2], kinugasa: [2, 2, 2],
  fubuki: [2, 2, 2], hatsuyuki: [2, 2, 2],
  'uss-farenholt': [1, 1, 1, 1], 'uss-duncan': [1, 1, 1, 1], 'uss-laffey': [1, 1, 1, 1],
};

test('all twelve Esperance names have distinct exact-name WW2 authored coverage', () => {
  assert.equal(fleet.length, 12);
  for (const ship of fleet) assert.ok(Object.hasOwn(SHIP_ASSET_REGISTRY.ww2, ship.name.toLowerCase()), `${ship.name}: exact public-name key`);
  const ids = fleet.map(ship => {
    const entry = shipAssetSpecFor(ship, 'ww2');
    assert.ok(entry, ship.name);
    assert.equal(entry.specId, idFor(ship));
    assert.equal(entry.era, 'ww2');
    assert.equal(entry.units, 'meters');
    assert.equal(entry.scale, SHIP_LENGTH / 180);
    return entry.specId;
  });
  assert.equal(new Set(ids).size, fleet.length);
  assert.equal(shipAssetSpecFor({name:'Unresolved contact',type:'cruiser'}, 'ww2'), null);
  assert.equal(shipAssetSpecFor({name:'USS Brooklyn',className:'Light cruiser',type:'cruiser'}, 'ww2'), null);
});

for (const ship of fleet) {
  const id = idFor(ship);
  test(`${ship.name}: 1942 provenance and actual turret battery match the scenario`, async () => {
    const spec = await loadShipSpec(id);
    assert.equal(spec.era, 'ww2');
    assert.equal(spec.turrets.reduce((sum,t) => sum + t.guns, 0), ship.guns);
    assert.deepEqual(spec.turrets.map(t => t.guns).sort((a,b) => a-b), layouts[id]);
    assert.match(spec.configuration, /1942/);
    const provenance = await readFile(`ships/${id}/PROVENANCE.md`, 'utf8');
    assert.match(provenance, /original/i);
    assert.match(provenance, /simplif|approx|depart|faithful|accuracy/i);
    assert.match(provenance, /1942/);
    assert.ok(spec.hull.length / spec.hull.beam >= (ship.type === 'destroyer' ? 9 : 8));
  });

  // Ray-test the exported geometry at every declared barrel centre, including
  // all three lanes of a triple turret; metadata alone cannot pass this check.
  test(`${ship.name}: each exported barrel is exposed, not buried in fittings`, async () => {
    const spec = await loadShipSpec(id);
    const bytes = await readFile(`public/assets/ships/ww2/${id}.glb`);
    const {scene} = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength), '');
    scene.updateMatrixWorld(true);
    const type = spec.turretType;
    for (const turret of spec.turrets) {
      const axis = scene.getObjectByName(`anchor_turret_${turret.id}`).getWorldPosition(new THREE.Vector3());
      const direction = turret.facing === 'aft' ? 1 : -1;
      const sides = turret.guns === 1 ? [0] : turret.guns === 2 ? [-1,1] : [-2,0,2];
      for (const side of sides) {
        for (const fraction of [0.2,0.5,0.9]) {
          const extension = 1.3 + (type.barrelLength - 1.3) * fraction;
          const x = (turret.side || 0) + side * type.gunSpacing / 2;
          const z = axis.z - direction * (type.barrelLength - extension);
          const hit = new THREE.Raycaster(new THREE.Vector3(x,100,z), new THREE.Vector3(0,-1,0)).intersectObject(scene,true)[0];
          assert.ok(hit, `${turret.id}: declared barrel ${side} exists`);
          assert.ok(hit.point.y >= axis.y-.02 && hit.point.y <= axis.y+type.barrelRadius+.12,
            `${turret.id} barrel ${side} at ${extension.toFixed(2)}m buried/missing: top ${hit.point.y.toFixed(2)}m, axis ${axis.y.toFixed(2)}m`);
        }
      }
    }
  });
}

test('WW2 registry preserves uncertainty gating and failed-request fallback for all names', async () => {
  const requests = [];
  const manager = createShipAssetManager({
    gltfLoader: {async loadAsync(url) {requests.push(url); throw new Error('unavailable');}},
    fallbackFactory: () => new THREE.Group(),
  });
  try {
    for (const ship of fleet) {
      const fallback = await manager.createModel({...ship,own:false,uncertain:true}, 'ww2');
      assert.equal(fallback.userData.proceduralFallback, true);
      disposeShipAssetInstance(fallback);
    }
    assert.equal(requests.length, 0);
    for (const ship of fleet) {
      const fallback = await manager.createModel({...ship,own:true}, 'ww2');
      assert.equal(fallback.userData.proceduralFallback, true);
      disposeShipAssetInstance(fallback);
    }
    assert.equal(new Set(requests).size, fleet.length);
  } finally { manager.dispose(); }
});

test('one WWII metre conversion retains real cruiser/destroyer proportions', async () => {
  const specs = await Promise.all(fleet.map(s => loadShipSpec(idFor(s))));
  const scale = modelMetersToWorld('ww2');
  const cruisers = specs.filter((s,i) => fleet[i].type === 'cruiser');
  for (const spec of specs.filter((s,i) => fleet[i].type === 'destroyer')) {
    assert.ok(spec.hull.length < Math.min(...cruisers.map(s => s.hull.length)));
    assert.ok(spec.hull.beam < Math.min(...cruisers.map(s => s.hull.beam)));
    assert.ok(spec.hull.length * scale < SHIP_LENGTH);
  }
});
