import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getView, step } from '../src/sim/engine.js';
import { battleActors, classStandIns } from '../src/ui/battle-presentation.js';
import { SCENARIO_SETUPS } from '../src/sim/scenarios.js';
import { hasShipAsset, shipAssetSpecFor } from '../src/ui/ship-assets.js';

test('3D actors contain only player-view ships and reports', () => {
  const state = createGame('dogger', 4);
  const view = getView(state);
  const result = battleActors(view, view.ships[0].id);
  assert.equal(result.actors.length, view.ships.length + view.contacts.length);
  assert.ok(result.actors.every(a => a.own));
  for (const enemy of state.ships.filter(s => s.side === 'red')) {
    assert.ok(!result.actors.some(a => a.name === enemy.name || a.id === enemy.id));
  }
});

test('selection moves the 3D origin without changing reported information', () => {
  const view = getView(createGame('dogger', 5));
  const first = battleActors(view, view.ships[0].id);
  const second = battleActors(view, view.ships[1].id);
  assert.equal(first.actors.find(a => a.id === view.ships[0].id).x, 0);
  assert.equal(second.actors.find(a => a.id === view.ships[1].id).x, 0);
  assert.notEqual(first.actors.find(a => a.id === view.ships[0].id).z, second.actors.find(a => a.id === view.ships[0].id).z);
  assert.deepEqual(new Set(first.actors.map(a => a.id)), new Set(second.actors.map(a => a.id)));
});

test('uncertain and stale contacts never become detailed enemy models', () => {
  const view = getView(createGame('dogger', 6));
  const contact = { id: 'c_blue_1', q: 9, r: 7, className: 'Cruiser', name: 'Secret Name', confidence: 'classified', stale: false, uncertainty: 2 };
  const actors = battleActors({ ...view, contacts: [contact] }, view.ships[0].id).actors;
  const report = actors.find(a => a.id === contact.id);
  assert.equal(report.name, 'Cruiser');
  assert.equal(report.type, null);
  assert.equal(report.uncertain, true);
  assert.equal(report.uncertainty, 2);
  const stale = battleActors({ ...view, contacts: [{ ...contact, stale: true, confidence: 'identified' }] }, view.ships[0].id).actors.at(-1);
  assert.equal(stale.uncertain, true);
});

test('a classified ship in plain sight is drawn as her class, never her name', () => {
  const view = getView(createGame('line', 6));
  const standIns = classStandIns(SCENARIO_SETUPS.line.ships, 'blue', name => hasShipAsset({ name }, 'sail'));
  assert.deepEqual(standIns, { 'ship of the line': 'Le Vengeur du Peuple' });
  const contact = { id: 'c_blue_2', q: 9, r: 5, className: 'Ship of the line', confidence: 'classified', stale: false, facing: 4 };
  const actor = battleActors({ ...view, contacts: [contact] }, view.ships[0].id, standIns).actors.at(-1);
  assert.equal(actor.uncertain, false);
  assert.equal(actor.name, 'Ship of the line');
  assert.equal(actor.facing, 4);
  assert.equal(shipAssetSpecFor(actor, 'sail').specId, 'french-74');
  const sighted = battleActors({ ...view, contacts: [{ id: 'c_blue_2', q: 9, r: 5, confidence: 'sighted', stale: false }] }, view.ships[0].id, standIns).actors.at(-1);
  assert.equal(sighted.uncertain, true);
  assert.equal(sighted.assetName, undefined);
});

test('class stand-ins are withheld when a class could belong to more than one side', () => {
  const ships = [{ side: 'blue', name: 'A', className: 'Frigate' }, { side: 'red', name: 'B', className: 'Frigate' }, { side: 'green', name: 'C', className: 'Frigate' }];
  assert.deepEqual(classStandIns(ships, 'blue'), {});
  assert.deepEqual(classStandIns(ships.slice(0, 2), 'blue'), { frigate: 'B' });
});

test('classified contacts report a heading; sightings and last-known reports do not', () => {
  let state = createGame('line', 6);
  let headed = null;
  for (let t = 0; t < 30 && !headed; t++) {
    state = step(state);
    headed = getView(state).contacts.find(c => c.confidence === 'classified' && !c.stale);
  }
  assert.ok(headed, 'the French line is classified before the action');
  const truth = state.ships.find(s => s.side === 'red' && s.q === headed.q && s.r === headed.r);
  assert.equal(headed.facing, truth.facing);
  for (const c of getView(state).contacts) if (c.stale || c.confidence === 'sighted') assert.equal(c.facing, undefined);
});

test('surface camera shows surface hulls, not friendly submerged boats', () => {
  const state = createGame('northern_screen', 8);
  const view = getView(state, 'blue', 'b_steadfast');
  const result = battleActors(view, 'b_steadfast');
  assert.equal(result.focus.depth, 'surface');
  assert.equal(result.focus.y, 0);
  assert.ok(result.actors.some(a => a.id === 'b_meridian'));
  assert.ok(!result.actors.some(a => a.id === 'b_sable' || a.id === 'b_kite'));
  const surfaced = { ...view, ships: view.ships.map(s => s.id === 'b_sable' ? { ...s, doctrine: { ...s.doctrine, depth: 'surface' } } : s) };
  assert.ok(battleActors(surfaced, 'b_steadfast').actors.some(a => a.id === 'b_sable'));
  const surfacedFocus = battleActors(surfaced, 'b_sable');
  assert.equal(surfacedFocus.focus.depth, 'surface');
  assert.equal(surfacedFocus.focus.y, 0);
});

test('submerged camera follows depth and limits optical visibility', () => {
  const state = createGame('northern_screen', 8);
  const view = getView(state, 'blue', 'b_sable');
  const result = battleActors(view, 'b_sable');
  assert.equal(result.focus.depth, 'shallow');
  assert.ok(result.focus.y < 0);
  assert.ok(result.actors.some(a => a.id === 'b_sable' && a.y === result.focus.y));
  assert.ok(!result.actors.some(a => a.id === 'b_steadfast' || a.id === 'b_meridian' || a.id === 'b_ward'));
  assert.ok(!result.actors.some(a => a.id === 'b_kite'), 'distant friendly submarine is known to command, not optically visible');
  const nearby = { ...view, ships: view.ships.map(s => s.id === 'b_kite' ? { ...s, q: 9, r: 3, doctrine: { ...s.doctrine, depth: 'shallow' } } : s) };
  assert.ok(battleActors(nearby, 'b_sable').actors.some(a => a.id === 'b_kite'));
  const deep = battleActors(getView(state, 'blue', 'b_kite'), 'b_kite');
  assert.equal(deep.focus.depth, 'deep');
  assert.ok(deep.focus.y < result.focus.y);
});

test('Cold War sonar reports without public depth do not become physical hulls', () => {
  const view = getView(createGame('northern_screen', 3), 'blue', 'b_steadfast');
  const report = { id: 'c_blue_1', q: 7, r: 8, name: 'Raider', className: 'Attack submarine', confidence: 'identified', stale: false };
  const result = battleActors({ ...view, contacts: [report] }, 'b_steadfast');
  assert.ok(!result.actors.some(a => a.id === report.id));
});

test('authored metre conversion is applied once at the nominal capital-ship scale', async () => {
  const { MODEL_METERS_TO_WORLD, SHIP_LENGTH, WORLD_UNITS_PER_METER, PRESENTATION_SCALE } = await import('../src/ui/battle-presentation.js');
  assert.equal(PRESENTATION_SCALE, 3);
  assert.equal(MODEL_METERS_TO_WORLD, WORLD_UNITS_PER_METER * PRESENTATION_SCALE);
  assert.ok(Math.abs(210 * MODEL_METERS_TO_WORLD - SHIP_LENGTH) < 1e-9);
});


test('friendly actor class identity comes only from the public view', () => {
  const view = getView(createGame('hampton', 12));
  const actors = battleActors(view, view.ships[0].id).actors;
  for (const actor of actors.filter(a => a.own)) {
    const ship = view.ships.find(s => s.id === actor.id);
    assert.equal(actor.className, ship.className);
    assert.equal(actor.type, ship.type);
  }
});

test('ships at anchor are marked so they leave no wake, own or identified enemy', () => {
  const state = createGame('hampton', 7);
  const union = getView(state, 'red');
  const anchored = battleActors(union, union.ships[0].id).actors.filter(a => a.anchored).map(a => a.name);
  assert.deepEqual(anchored.sort(), ['USS Congress', 'USS Cumberland']);
  const confederate = getView(step(state), 'blue');
  const cumberland = confederate.contacts.find(c => c.name === 'USS Cumberland');
  assert.equal(cumberland?.anchored, true, 'an identified ship at anchor is reported as such');
  assert.ok(confederate.contacts.filter(c => c.confidence !== 'identified').every(c => !('anchored' in c)), 'unidentified reports do not reveal it');
  const actor = battleActors(confederate, confederate.ships[0].id).actors.find(a => a.name === 'USS Cumberland');
  assert.equal(actor.anchored, true);
  assert.equal(battleActors(confederate, confederate.ships[0].id).actors.find(a => a.name === 'CSS Virginia').anchored, false);
});

test('a submerged WWII contact draws no hull; an own submerged U-boat sits below the surface', () => {
  const view = getView(createGame('convoy', 3), 'red');
  const sub = view.ships.find((s) => s.type === 'submarine');
  const under = { ...view, ships: view.ships.map((s) => (s.id === sub.id ? { ...s, doctrine: { ...s.doctrine, depth: 'shallow' } } : s)), contacts: [{ id: 'c9', q: 10, r: 9, confidence: 'classified', className: 'Destroyer', stale: false, submerged: true }] };
  const actors = battleActors(under, view.ships.find((s) => s.id !== sub.id).id).actors;
  assert.equal(actors.some((a) => a.id === 'c9'), false);
  assert.ok(actors.find((a) => a.id === sub.id).y < 0);
});


test('WWII has an explicit cruiser-sized metre reference while preserving relative fleet scale', async () => {
  const { ERA_REFERENCE_METERS, SHIP_LENGTH, modelMetersToWorld } = await import('../src/ui/battle-presentation.js');
  assert.equal(ERA_REFERENCE_METERS.ww2, 180);
  const scale = modelMetersToWorld('ww2');
  assert.equal(180 * scale, SHIP_LENGTH);
  assert.equal((110 * scale) / (180 * scale), 110 / 180);
  assert.equal(modelMetersToWorld('dreadnought'), SHIP_LENGTH / 210);
});
