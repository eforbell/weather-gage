import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createActorModel, disposeActorModel } from '../src/ui/battle-models.js';
import { createBootToppingGeometry, createLoftedHullGeometry, createSheerDeckGeometry, hullWaterlineStations } from '../src/ui/ship-hull.js';
import { shipSpecFor, SHIP_SPECS } from '../src/ui/ship-specs.js';
import { SCENARIO_SETUPS } from '../src/sim/scenarios.js';

function bounds(geometry) {
  geometry.computeBoundingBox();
  return geometry.boundingBox;
}

const expectedScenarioSpecs = {
  b_constellation: 'sail_frigate', b_baltimore: 'sail_frigate', r_insurgente: 'sail_frigate', r_volontaire: 'sail_frigate',
  b_virginia: 'ironclad_casemate', b_patrick_henry: 'sidewheel_gunboat', b_jamestown: 'sidewheel_gunboat',
  r_cumberland: 'wooden_sail_ship', r_congress: 'wooden_sail_ship', r_minnesota: 'wooden_steamer', r_monitor: 'ironclad_monitor',
  b_lion: 'battlecruiser', b_orion: 'dreadnought_battleship', b_meteor: 'destroyer', b_laurel: 'destroyer',
  r_seydlitz: 'battlecruiser', r_posen: 'dreadnought_battleship', r_v186: 'destroyer', r_s33: 'destroyer',
  b_dallas: 'submarine', r_konovalov: 'submarine', g_red_october: 'submarine',
  b_steadfast: 'carrier', b_meridian: 'asw_destroyer', b_ward: 'asw_destroyer', b_sable: 'submarine', b_kite: 'submarine', r_razor: 'submarine', r_echo: 'submarine', r_dart: 'submarine',
  b_valiant: 'modern_surface', b_kestrel: 'modern_surface', r_shahin: 'modern_surface', r_miraj: 'modern_surface',
};

function scenarioEra(id) {
  return { nevis: 'sail', hampton: 'ironclad', dogger: 'dreadnought', defector: 'coldwar', northern_screen: 'coldwar', strait: 'modern' }[id];
}

test('ship specs resolve from public era/type and expose presentation dimensions', () => {
  assert.equal(shipSpecFor('Battlecruiser', 'dreadnought').key, 'battlecruiser');
  assert.equal(shipSpecFor('Heavy frigate', 'sail').key, 'sail_frigate');
  assert.equal(shipSpecFor('Littoral frigate', 'modern').key, 'modern_surface');
  assert.equal(shipSpecFor('Steam frigate', 'ironclad').key, 'wooden_steamer');
  for (const spec of Object.values(SHIP_SPECS)) {
    assert.equal(spec.presentationUnits, true);
    assert.ok(spec.loaderKey, `${spec.key} has an external-loader key`);
    assert.ok(spec.dimensions.length > spec.dimensions.beam, `${spec.key} length/beam are presentation dimensions`);
  }
});

test('every scenario ship resolves to the intended public model spec', () => {
  const seen = new Set();
  for (const [scenarioId, setup] of Object.entries(SCENARIO_SETUPS)) {
    const era = scenarioEra(scenarioId);
    for (const ship of setup.ships) {
      seen.add(ship.id);
      const spec = shipSpecFor(ship.className || ship.type, era);
      assert.equal(spec.key, expectedScenarioSpecs[ship.id], `${scenarioId}:${ship.name}`);
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(expectedScenarioSpecs).sort());
});

test('lofted hull geometry has submerged bow/stern and sheered deck above water', () => {
  const spec = shipSpecFor('Battlecruiser', 'dreadnought');
  const geometry = createLoftedHullGeometry(spec);
  const box = bounds(geometry);
  assert.ok(box.min.y < -0.45, `hull draft reaches below water: ${box.min.y}`);
  assert.ok(box.max.y > 0.55, `sheered deck rises above water: ${box.max.y}`);
  assert.ok(geometry.getAttribute('position').count >= 150, 'hull has enough stations/section points for a rounded low-poly silhouette');
  const position = geometry.getAttribute('position');
  let bowLow = Infinity, sternLow = Infinity;
  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i), y = position.getY(i);
    if (z < -spec.dimensions.length * 0.45) bowLow = Math.min(bowLow, y);
    if (z > spec.dimensions.length * 0.45) sternLow = Math.min(sternLow, y);
  }
  assert.ok(bowLow < -0.3, `bow remains immersed: ${bowLow}`);
  assert.ok(sternLow < -0.3, `stern remains immersed: ${sternLow}`);
  geometry.dispose();
});

test('hull shell and sheered deck are separate surfaces', () => {
  const spec = shipSpecFor('Battlecruiser', 'dreadnought');
  const hull = createLoftedHullGeometry(spec);
  const deck = createSheerDeckGeometry(spec);
  const hp = hull.getAttribute('position'), hn = hull.getAttribute('normal');
  let deckLikeNormals = 0;
  for (let i = 0; i < hp.count; i++) if (hn.getY(i) > 0.9) deckLikeNormals++;
  assert.equal(deckLikeNormals, 0, 'hull shell does not carry a smoothed deck plane');
  const dp = deck.getAttribute('position'), dn = deck.getAttribute('normal');
  let midY = 0, endY = 0, midCount = 0, endCount = 0;
  for (let i = 0; i < dp.count; i++) {
    assert.ok(dn.getY(i) > 0.94, 'deck normals are flat/upward');
    if (Math.abs(dp.getZ(i)) < spec.dimensions.length * 0.08) { midY += dp.getY(i); midCount++; }
    if (Math.abs(dp.getZ(i)) > spec.dimensions.length * 0.45) { endY += dp.getY(i); endCount++; }
  }
  assert.ok(endY / endCount > midY / midCount, 'deck follows sheer upward at bow/stern');
  hull.dispose(); deck.dispose();
});

test('boot stripe and hull end normals face outward', () => {
  const spec = shipSpecFor('Battlecruiser', 'dreadnought');
  const hull = createLoftedHullGeometry(spec);
  const hp = hull.getAttribute('position'), hn = hull.getAttribute('normal');
  let bow = 0, stern = 0;
  for (let i = 0; i < hp.count; i++) {
    if (hp.getZ(i) < -spec.dimensions.length * 0.49) bow += hn.getZ(i);
    if (hp.getZ(i) > spec.dimensions.length * 0.49) stern += hn.getZ(i);
  }
  assert.ok(bow < 0, `bow cap normals face forward/outward: ${bow}`);
  assert.ok(stern > 0, `stern cap normals face aft/outward: ${stern}`);

  const boot = createBootToppingGeometry(spec);
  const bp = boot.getAttribute('position'), bn = boot.getAttribute('normal');
  let port = 0, starboard = 0;
  for (let i = 0; i < bp.count; i++) {
    if (bp.getX(i) < 0) port += bn.getX(i);
    if (bp.getX(i) > 0) starboard += bn.getX(i);
  }
  assert.ok(port < 0, `port boot normals face outward: ${port}`);
  assert.ok(starboard > 0, `starboard boot normals face outward: ${starboard}`);
  const foamStations = hullWaterlineStations(spec, 1);
  const xs = foamStations.map(([x]) => x);
  assert.ok(Math.min(...xs) < Math.max(...xs) * 0.45, 'waterline foam tapers with the hull instead of forming a rectangle');
  hull.dispose();
  boot.dispose();
});


test('ironclad specs use era-specific gun styles instead of generic deck turrets', () => {
  assert.equal(SHIP_SPECS.ironclad_casemate.turrets, undefined);
  assert.equal(SHIP_SPECS.ironclad_casemate.gunStyle, 'casemate');
  assert.equal(SHIP_SPECS.ironclad_monitor.gunStyle, 'monitor-turret');
  assert.equal(SHIP_SPECS.sidewheel_gunboat.gunStyle, 'exposed');
});

test('ironclad actor geometry exposes casemate, monitor turret, and exposed gun metadata', () => {
  const virginia = createActorModel({ own: true, type: 'ironclad', name: 'CSS Virginia' }, 'ironclad');
  assert.equal(virginia.userData.gunStyle, 'casemate');
  assert.ok(virginia.userData.parts?.includes('sloped-casemate'));
  assert.ok(virginia.userData.parts?.includes('casemate-broadside-guns'));
  disposeActorModel(virginia);

  const monitor = createActorModel({ own: true, type: 'ironclad', className: 'Turret ironclad', name: 'USS Monitor' }, 'ironclad');
  assert.equal(monitor.userData.gunStyle, 'monitor-turret');
  assert.ok(monitor.userData.parts?.includes('round-monitor-turret'));
  assert.ok(monitor.userData.parts?.includes('monitor-pilot-house'));
  disposeActorModel(monitor);

  const sidewheel = createActorModel({ own: true, type: 'wooden', className: 'Side-wheel gunboat', name: 'CSS Patrick Henry' }, 'ironclad');
  assert.equal(sidewheel.userData.gunStyle, 'exposed');
  assert.ok(sidewheel.userData.parts?.includes('exposed-deck-guns'));
  disposeActorModel(sidewheel);
});

test('actor fittings sit on their class deck and after guns face aft', () => {
  const ironclad = createActorModel({ own: true, type: 'ironclad', name: 'CSS Virginia' }, 'ironclad');
  const ironSpec = shipSpecFor('ironclad', 'ironclad', 'CSS Virginia');
  const deckY = ironSpec.dimensions.freeboard + 0.045;
  assert.ok(ironclad.userData.funnels.every(f => Math.abs(f.y - (deckY + 0.035 + ironSpec.casemate.height + ironSpec.funnels[0].height + 0.1)) < 1e-6), 'casemate funnel is mounted on the armored roof');
  disposeActorModel(ironclad);

  const model = createActorModel({ own: true, type: 'battlecruiser', name: 'HMS Lion' }, 'dreadnought');
  const spec = shipSpecFor('battlecruiser', 'dreadnought');
  const aft = spec.turrets.find(t => t.facing === 'aft');
  assert.ok(aft, 'battlecruiser spec declares aft-facing turrets');
  const targetY = spec.dimensions.freeboard + 0.045 + (aft.size === 'large' ? 0.32 : 0.24) + 0.18;
  let aftGunVertices = 0;
  model.traverse(obj => {
    if (!obj.isMesh || !obj.geometry) return;
    const pos = obj.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i) - targetY) < 0.25 && pos.getZ(i) > aft.z + 0.7) aftGunVertices++;
    }
  });
  assert.ok(aftGunVertices > 0, 'after turret barrels extend aft of their turret center');
  disposeActorModel(model);
});


test('createActorModel dispatch matches scenario ship specs', () => {
  for (const [scenarioId, setup] of Object.entries(SCENARIO_SETUPS)) {
    const era = scenarioEra(scenarioId);
    for (const ship of setup.ships) {
      const model = createActorModel({ own: true, type: ship.type, className: ship.className, name: ship.name }, era);
      assert.equal(model.userData.specKey, expectedScenarioSpecs[ship.id], `${scenarioId}:${ship.name}`);
      if (['sail_frigate', 'wooden_sail_ship'].includes(expectedScenarioSpecs[ship.id])) assert.equal(model.userData.funnels, undefined, `${ship.name} has no funnel smoke source`);
      if (expectedScenarioSpecs[ship.id] === 'wooden_steamer') assert.ok(model.userData.funnels?.length, `${ship.name} has a steam funnel source`);
      disposeActorModel(model);
    }
  }
});

test('actor models expose size metadata, stationary waterline foam, and wake separately', () => {
  const model = createActorModel({ own: true, type: 'Battlecruiser' }, 'dreadnought');
  assert.equal(model.userData.specKey, 'battlecruiser');
  assert.deepEqual(Object.keys(model.userData.size).sort(), ['draft', 'freeboard', 'length', 'width']);
  assert.ok(model.userData.radius > 1);
  assert.ok(model.userData.wake, 'underway wake is exposed');
  assert.ok(model.userData.waterlineFoam, 'stationary hull intersection foam is exposed');
  assert.equal(model.userData.waterlineFoam.name, 'waterline-foam');
  assert.equal(model.userData.waterlineFoam.userData.stationarySurfaceFoam, true);
  assert.equal(model.userData.waterlineFoam.parent, model);
  const fullRadius = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere()).radius;
  assert.ok(fullRadius > model.userData.radius, 'camera radius excludes wake and waterline foam');
  disposeActorModel(model);
});

test('procedural selection ignores scenario ship names', () => {
  for (const name of ['USS Monitor', 'CSS Virginia', 'USS Minnesota', 'CSS Patrick Henry', 'Typhoon', 'Alfa', 'Los Angeles']) {
    assert.equal(shipSpecFor('Sloop of war', 'ironclad', name).key, 'wooden_sail_ship');
    assert.equal(shipSpecFor('Missile destroyer', 'modern', name).key, 'modern_surface');
  }
});

test('casemate roof is narrow and unobstructed by a generic bridge', () => {
  const spec = SHIP_SPECS.ironclad_casemate;
  assert.ok(spec.casemate.slope >= 0.65);
  const model = createActorModel({ own: true, type: 'Casemate ironclad', name: 'CSS Virginia' }, 'ironclad');
  assert.ok(!model.children.some(p => p.material?.color?.getHex() === 0x1a343d), 'no generic bridge windows in the armor shell');
  const roofY = spec.dimensions.freeboard + 0.045 + 0.035 + spec.casemate.height;
  assert.ok(Math.abs(model.userData.funnels[0].y - (roofY + spec.funnels[0].height + 0.1)) < 1e-6);
  disposeActorModel(model);
});
