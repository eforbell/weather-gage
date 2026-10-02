// Every registered authored ship must match its spec and pass the asset report
// without Blender: the GLB is committed, so CI checks the real artefact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SHIP_ASSET_REGISTRY, adoptAuthoredModel, cloneShipAsset, shipAssetSpecFor } from '../src/ui/ship-assets.js';
import { createActorModel } from '../src/ui/battle-models.js';
import { MODEL_METERS_TO_WORLD } from '../src/ui/battle-presentation.js';
import { SCENARIO_SETUPS } from '../src/sim/scenarios.js';
import { inspectShipGlb, loadShipSpec, muzzleReach, shipGlbPath, shipKitSha256, shipSpecSha256, turretChecks } from '../scripts/ship-asset-report.mjs';

const registered = Object.entries(SHIP_ASSET_REGISTRY).flatMap(([era, entries]) => Object.entries(entries).map(([key, entry]) => ({ era, key, entry })));
const scenarioShips = Object.values(SCENARIO_SETUPS).flatMap(setup => setup.ships || []);

async function glbBytes(spec) {
  return new Uint8Array(await readFile(shipGlbPath(spec)));
}

async function loadInstance(spec, era) {
  const bytes = await glbBytes(spec);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return cloneShipAsset(gltf.scene, shipAssetSpecFor({ name: spec.name, own: true }, era));
}

// Widest |x| of foam vertices within `band` of midships, in model units.
function foamHalfWidthAtMidships(foam, band) {
  let widest = 0;
  foam.updateMatrixWorld(true);
  foam.traverse(item => {
    if (!item.isMesh) return;
    const position = item.geometry.attributes.position, alpha = item.geometry.attributes.color;
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      if (alpha.getW(i) === 0) continue; // ribbon edges fade to nothing; use the visible centre line
      v.fromBufferAttribute(position, i).applyMatrix4(item.matrixWorld);
      if (Math.abs(v.z) < band) widest = Math.max(widest, Math.abs(v.x));
    }
  });
  return widest;
}

test('at least one authored ship is registered', () => {
  assert.ok(registered.length >= 1);
});

for (const { era, key, entry } of registered) {
  test(`${key}: registry entry agrees with ships/${entry.specId}/spec.json`, async () => {
    const spec = await loadShipSpec(entry.specId);
    assert.equal(spec.era, era);
    assert.ok(spec.registryKeys.includes(key));
    assert.equal(`public/${entry.url}`, shipGlbPath(spec));
    assert.equal(entry.lengthMeters, spec.hull.length);
    assert.equal(entry.beamMeters, spec.hull.beam);
    assert.equal(entry.length, spec.hull.length);
    assert.equal(entry.width, spec.hull.beam);
  });

  test(`${key}: main battery matches the scenario's gun count`, async () => {
    const spec = await loadShipSpec(entry.specId);
    const ships = scenarioShips.filter(ship => ship.name?.toLowerCase() === key);
    assert.ok(ships.length, `no scenario ship is named ${key}`);
    const guns = spec.turrets.reduce((sum, turret) => sum + turret.guns, 0);
    const counted = ships.filter(ship => Number.isFinite(ship.guns));
    assert.ok(counted.length, `no scenario entry for ${key} declares guns`);
    for (const ship of counted) assert.equal(guns, ship.guns, `${key}: spec has ${guns} guns, scenario ${ship.guns}`);
  });

  test(`${key}: committed GLB passes the asset report`, async () => {
    const spec = await loadShipSpec(entry.specId);
    const report = await inspectShipGlb(await glbBytes(spec), spec, await shipSpecSha256(entry.specId), await shipKitSha256());
    const failed = report.checks.filter(c => !c.ok).map(c => `${c.name}: ${c.detail}`);
    assert.deepEqual(failed, []);
  });

  test(`${key}: loads through the game's clone path with smoke at the funnel tops`, async () => {
    const spec = await loadShipSpec(entry.specId);
    const bytes = await glbBytes(spec);
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const normalized = shipAssetSpecFor({ name: spec.name, own: true }, era);
    assert.ok(normalized, 'public name resolves to the authored asset');
    const instance = cloneShipAsset(gltf.scene, normalized);
    assert.equal(instance.userData.funnels.length, spec.funnels.length);
    const zs = instance.userData.funnels.map(f => f.z);
    assert.deepEqual(zs, [...zs].sort((a, b) => a - b), 'smoke origins ordered bow to stern');
    for (const funnel of spec.funnels) {
      const point = instance.userData.anchors[`funnel_${funnel.id}`];
      assert.ok(instance.userData.funnels.includes(point), `funnel ${funnel.id} feeds the smoke list`);
      assert.ok(Math.abs(point.z - (funnel.aft - spec.hull.length / 2) * MODEL_METERS_TO_WORLD) < 0.05, `funnel ${funnel.id} position`);
      assert.ok(point.y > funnel.top * MODEL_METERS_TO_WORLD - 0.01, `funnel ${funnel.id} smoke starts above the top`);
    }
    const box = new THREE.Box3().setFromObject(instance);
    assert.ok(Math.abs(box.max.z - box.min.z - spec.hull.length * MODEL_METERS_TO_WORLD) < 0.05, 'world length');
    assert.ok(Math.abs(box.min.y + spec.hull.draft * MODEL_METERS_TO_WORLD) < 0.02, 'waterline at y=0');
    assert.ok(Math.abs(instance.userData.size.length - spec.hull.length * MODEL_METERS_TO_WORLD) < 1e-6);
  });
}

// Uncertain contacts are filtered before this lookup (battle-3d.js and
// createShipAssetManager); here: only exact registered names resolve.
for (const { era, key, entry } of registered) {
  test(`${key}: swapping in the authored model rebuilds waterline foam on its own hull`, async () => {
    const spec = await loadShipSpec(entry.specId);
    const stand = createActorModel({ id: 'x', own: true, name: spec.name, type: 'battlecruiser', className: 'Battlecruiser' }, era);
    stand.position.set(3, 0, -2);
    stand.rotation.y = 1.1;
    const standFoam = stand.userData.waterlineFoam, standWake = stand.userData.wake;
    const loaded = adoptAuthoredModel(stand, await loadInstance(spec, era));
    assert.ok(loaded.userData.waterlineFoam && loaded.userData.wake, 'authored model gets foam and wake');
    assert.notEqual(loaded.userData.waterlineFoam, standFoam, 'stand-in foam is not reused');
    assert.notEqual(loaded.userData.wake, standWake, 'stand-in wake is not reused');
    assert.equal(loaded.userData.waterlineFoam.parent, loaded);
    assert.ok(loaded.position.equals(stand.position) && loaded.quaternion.equals(stand.quaternion), 'pose carried over');
    loaded.position.set(0, 0, 0); loaded.quaternion.identity();
    const hullHalf = spec.hull.beam / 2 * MODEL_METERS_TO_WORLD;
    const foamHalf = foamHalfWidthAtMidships(loaded.userData.waterlineFoam, spec.hull.length * MODEL_METERS_TO_WORLD * 0.1);
    assert.ok(Math.abs(foamHalf - hullHalf) < hullHalf * 0.06, `foam at midships ${foamHalf.toFixed(3)} vs hull ${hullHalf.toFixed(3)}`);
    assert.ok(Math.abs(loaded.userData.size.width - spec.hull.beam * MODEL_METERS_TO_WORLD) < 1e-6, 'wake sized from the authored beam');
  });
}

// The turret checks must follow the builder's geometry for any turret shape,
// not only Lion's: a steep front plate (frontSlope 4) once failed every check.
test('turret placement checks use the builder\'s muzzle formula for any turret shape', () => {
  const turretType = { length: 11, frontSlope: 4, barrelLength: 12 };
  assert.ok(Math.abs(muzzleReach(turretType) - 15.82) < 1e-9);
  const spec = { hull: { length: 200 }, turretType, turrets: [
    { id: 'A', aft: 40, facing: 'fore' },
    { id: 'P', aft: 90, side: -6, facing: 'fore' },
    { id: 'D', aft: 160, facing: 'aft' },
  ] };
  // Anchors where the builder puts them (glTF metres, bow -Z, centre at L/2).
  const anchors = {
    anchor_turret_A: [0, 11, 40 - 100 - 15.82],
    anchor_turret_P: [-6, 11, 90 - 100 - 15.82],
    anchor_turret_D: [0, 11, 160 - 100 + 15.82],
  };
  assert.deepEqual(turretChecks(spec, anchors).filter(c => !c.ok).map(c => c.name), []);
  // A turret 1 m out of place, a wing turret on the wrong side, a reversed turret.
  const wrong = { ...anchors, anchor_turret_A: [0, 11, 40 - 100 - 16.82], anchor_turret_P: [6, 11, 90 - 100 - 15.82], anchor_turret_D: [0, 11, 160 - 100 - 15.82] };
  assert.deepEqual(turretChecks(spec, wrong).filter(c => !c.ok).map(c => c.name), [
    'turret A position (aft 40, side 0)', 'turret P position (aft 90, side -6)', 'turret D faces aft (bow is -Z)', 'turret D position (aft 160, side 0)',
  ]);
});

test('unnamed contacts and unregistered ships of the same class never resolve to an authored hull', () => {
  assert.equal(shipAssetSpecFor({ name: 'Unresolved contact', type: null }, 'dreadnought'), null);
  assert.equal(shipAssetSpecFor({ name: 'SMS Seydlitz', className: 'Battlecruiser', type: 'battlecruiser' }, 'dreadnought'), null);
});
