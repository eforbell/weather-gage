import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  deserialize,
  distance,
  getView,
  isActive,
  issueOrder,
  serialize,
  setDoctrine,
  setRadar,
  step,
} from '../src/sim/engine.js';
import { SCENARIOS } from '../src/sim/scenarios.js';
import { contactId } from '../src/sim/core.js';

test('scenario metadata exposes two playable eras', () => {
  assert.deepEqual(SCENARIOS.map((s) => s.id), ['nevis', 'hampton', 'dogger', 'defector', 'strait']);
  assert.equal(SCENARIOS.find((s) => s.id === 'dogger').era, 'dreadnought');
  assert.equal(SCENARIOS.find((s) => s.id === 'nevis').era, 'sail');
  assert.equal(SCENARIOS.find((s) => s.id === 'strait').era, 'modern');
});

test('createGame returns contract state and axial distance', () => {
  const state = createGame('nevis', 42);
  assert.equal(state.version, 1);
  assert.equal(state.map.width, 20);
  assert.equal(state.map.height, 14);
  assert.equal(state.ships.length, 4);
  assert.equal(distance({ q: 0, r: 0 }, { q: 3, r: 0 }), 3);
  assert.equal(distance({ q: 0, r: 0 }, { q: 1, r: -0 }), 1);
  assert.equal(isActive(state.ships[0]), true);
});

test('public API is immutable for orders and step', () => {
  const initial = createGame('nevis', 7);
  const ordered = issueOrder(initial, 'b_constellation', { type: 'proceed', q: 5, r: 6 });
  assert.notEqual(ordered, initial);
  assert.equal(initial.pending.length, 0);
  assert.equal(ordered.pending.length, 1);
  const advanced = step(ordered);
  assert.equal(ordered.tick, 0);
  assert.equal(advanced.tick, 1);
});

test('delayed orders arrive and movement respects bounded map', () => {
  let state = createGame('nevis', 9);
  state = issueOrder(state, ['b_constellation'], { type: 'proceed', q: 7, r: 6 });
  state = step(state);
  assert.equal(state.ships.find((s) => s.id === 'b_constellation').order.type, 'proceed');
  for (let i = 0; i < 8; i += 1) state = step(state);
  const ship = state.ships.find((s) => s.id === 'b_constellation');
  assert.ok(ship.q >= 0 && ship.q < 20 && ship.r >= 0 && ship.r < 14);
  assert.ok(distance(ship, { q: 7, r: 6 }) < 4);
});

test('contacts hide enemy health and become stale when detection is lost', () => {
  let state = createGame('strait', 11);
  state = setRadar(state, 'b_valiant', true);
  let view = getView(state, 'blue');
  assert.ok(view.contacts.length > 0);
  assert.equal('hull' in view.contacts[0], false);
  assert.equal('targetId' in view.contacts[0], false);
  state = setRadar(state, 'b_valiant', false);
  state = issueOrder(state, ['b_valiant', 'b_kestrel'], { type: 'withdraw' });
  for (let i = 0; i < 4; i += 1) state = step(state);
  view = getView(state, 'blue');
  assert.ok(view.contacts.some((c) => c.stale), 'expected last-known stale contact');
});

test('modern missile combat uses finite ammo and point defense', () => {
  let state = createGame('strait', 123);
  state = setRadar(state, ['b_valiant', 'r_shahin'], true);
  const beforeAmmo = state.ships.find((s) => s.id === 'b_valiant').ammo;
  state = step(state);
  const afterLaunch = state.ships.find((s) => s.id === 'b_valiant').ammo;
  assert.ok(afterLaunch < beforeAmmo, 'blue destroyer spent missile ammo');
  assert.ok(state.pending.some((p) => p.kind === 'missile'));
  state = step(state);
  const red = state.ships.find((s) => s.id === 'r_shahin');
  assert.ok(red.hull < 100 || red.defense < 5, 'impact was either damaging or intercepted by finite defense');
});

test('serialize/deserialize preserves deterministic future', () => {
  let a = createGame('nevis', 555);
  a = issueOrder(a, ['b_constellation', 'b_baltimore'], { type: 'proceed', q: 9, r: 7 });
  a = step(step(a));
  let b = deserialize(serialize(a));
  for (let i = 0; i < 12; i += 1) {
    a = step(a);
    b = step(b);
  }
  assert.equal(serialize(a), serialize(b));
});

test('outcomes resolve by max tick or force defeat', () => {
  let state = createGame('nevis', 99);
  for (let i = 0; i < 70 && !state.outcome; i += 1) state = step(state);
  assert.ok(state.outcome);
  assert.ok(['victory', 'defeat', 'draw'].includes(state.outcome.result));
});

test('invalid orders are guarded, doctrine is clamped', () => {
  let state = createGame('nevis', 1);
  state = issueOrder(state, 'b_constellation', { type: 'teleport', q: 99, r: 99 });
  assert.equal(state.pending.length, 0);
  state = setDoctrine(state, 'b_constellation', { roe: 'hold', range: 99, withdraw: -10 });
  const ship = state.ships.find((s) => s.id === 'b_constellation');
  assert.equal(ship.doctrine.roe, 'hold');
  assert.equal(ship.doctrine.range, 12);
  assert.equal(ship.doctrine.withdraw, 0);
});

test('default engage searches without initial contact instead of stalling', () => {
  let state = createGame('nevis', 202);
  assert.equal(getView(state, 'blue').contacts.length, 0);
  const start = state.ships.find((s) => s.id === 'b_constellation');
  for (let i = 0; i < 10; i += 1) state = step(state);
  const moved = state.ships.find((s) => s.id === 'b_constellation');
  assert.notDeepEqual({ q: moved.q, r: moved.r, facing: moved.facing }, { q: start.q, r: start.r, facing: start.facing });
});

test('line and screen orders do not require coordinates and use formation targets', () => {
  let state = createGame('nevis', 203);
  state = issueOrder(state, ['b_constellation', 'b_baltimore'], { type: 'line' });
  assert.equal(state.pending.length, 2);
  state = step(step(state));
  assert.equal(state.ships.find((s) => s.id === 'b_baltimore').order.type, 'line');
  state = issueOrder(state, ['b_constellation', 'b_baltimore'], { type: 'screen' });
  assert.ok(state.pending.some((p) => p.order?.type === 'screen'));
});

test('new ship orders replace queued ship orders but preserve missiles', () => {
  let state = createGame('strait', 204);
  state = setRadar(state, ['b_valiant', 'r_shahin'], true);
  state = step(state);
  assert.ok(state.pending.some((p) => p.kind === 'missile'));
  state = issueOrder(state, 'b_kestrel', { type: 'proceed', q: 5, r: 9 });
  state = issueOrder(state, 'b_kestrel', { type: 'withdraw' });
  assert.equal(state.pending.filter((p) => p.shipId === 'b_kestrel' && !p.kind).length, 1);
  assert.equal(state.pending.find((p) => p.shipId === 'b_kestrel' && !p.kind).order.type, 'withdraw');
  assert.ok(state.pending.some((p) => p.kind === 'missile'));
});

test('getView excludes missile pending records', () => {
  let state = createGame('strait', 205);
  state = setRadar(state, ['b_valiant', 'r_shahin'], true);
  state = step(state);
  assert.ok(state.pending.some((p) => p.kind === 'missile'));
  const view = getView(state, 'blue');
  assert.ok(view.pending.every((p) => p.order));
  assert.ok(view.pending.every((p) => p.order.type));
});

test('edge broadside direction does not crash on out-of-bounds neighbor checks', () => {
  let state = createGame('nevis', 206);
  const blue = state.ships.find((s) => s.id === 'b_constellation');
  const red = state.ships.find((s) => s.id === 'r_insurgente');
  Object.assign(blue, { q: 0, r: 0, facing: 0, order: { type: 'engage' } });
  Object.assign(red, { q: 1, r: 0, facing: 3, order: { type: 'hold' } });
  assert.doesNotThrow(() => step(state));
});

test('withdraw orders can leave the battlespace', () => {
  let state = createGame('nevis', 207);
  const ship = state.ships.find((s) => s.id === 'b_constellation');
  Object.assign(ship, { q: 0, r: 6, order: { type: 'withdraw' } });
  state = step(state);
  assert.equal(state.ships.find((s) => s.id === 'b_constellation').status, 'escaped');
});

test('sail wind can shift deterministically during play', () => {
  let state = createGame('nevis', 1);
  const winds = new Set([state.wind]);
  for (let i = 0; i < 40; i += 1) {
    state = step(state);
    winds.add(state.wind);
  }
  assert.ok(winds.size > 1);
});

test('malformed saves are rejected instead of coerced', () => {
  const valid = createGame('nevis', 0);
  assert.equal(valid.seed, 0);
  assert.equal(valid.rng, 0);
  const cases = [
    ['unknown scenario', { scenarioId: 'missing' }],
    ['missing rng', ((s) => { delete s.rng; return s; })(structuredClone(valid))],
    ['no red ships', { ships: valid.ships.filter((s) => s.side === 'blue') }],
    ['missing doctrine', ((s) => { delete s.ships[0].doctrine; return s; })(structuredClone(valid))],
    ['bad proceed coords', { ships: valid.ships.map((s, i) => i ? s : { ...s, order: { type: 'proceed', q: 99, r: 99 } }) }],
    ['bad pending ref', { pending: [{ shipId: 'missing', order: { type: 'hold' }, deliverAt: 1 }] }],
    ['bad contact confidence', { contacts: { ...valid.contacts, blue: [{ id: 'c_bad', targetId: 'r_insurgente', q: 1, r: 1, confidence: 'exact', lastSeen: 0, stale: false }] } }],
    ['bad log', { log: [{ tick: 0, text: '', kind: 'info' }] }],
    ['bad outcome', { outcome: { result: 'win', title: 'x', summary: 'x' } }],
  ];
  for (const [name, patch] of cases) {
    const candidate = patch.version ? patch : { ...structuredClone(valid), ...patch };
    assert.throws(() => deserialize(JSON.stringify(candidate)), Error, name);
  }
});

test('public logs redact hidden enemy identities and damage', () => {
  let state = createGame('strait', 301);
  state = setRadar(state, 'b_valiant', true);
  state = step(state);
  const redView = getView(state, 'red');
  const joined = redView.log.map((e) => e.text).join('\n');
  assert.equal(joined.includes('BNS Valiant'), false);
  assert.equal(joined.includes('Area-defense destroyer'), false);
});

test('last-known contacts persist after authoritative enemy loss', () => {
  let state = createGame('strait', 302);
  state = setRadar(state, 'b_valiant', true);
  state = step(state);
  const target = state.ships.find((s) => s.id === 'r_shahin');
  Object.assign(target, { hull: 0, status: 'sunk' });
  state = step(state);
  const contact = getView(state, 'blue').contacts.find((c) => c.id === contactId(state, 'blue', 'r_shahin'));
  assert.ok(contact);
  assert.equal(contact.stale, true);
  assert.equal('hull' in contact, false);
});

test('mutual destruction resolves as draw after simultaneous missile impacts', () => {
  let state = createGame('strait', 303);
  for (const ship of state.ships) {
    if (ship.id === 'b_valiant') Object.assign(ship, { hull: 10, defense: 0 });
    else if (ship.id === 'r_shahin') Object.assign(ship, { hull: 10, defense: 0 });
    else Object.assign(ship, { status: 'sunk', hull: 0 });
  }
  state.pending = [
    { kind: 'missile', shipId: 'b_valiant', targetId: 'r_shahin', side: 'blue', salvo: 1, deliverAt: 1 },
    { kind: 'missile', shipId: 'r_shahin', targetId: 'b_valiant', side: 'red', salvo: 1, deliverAt: 1 },
  ];
  state = step(state);
  assert.equal(state.outcome.result, 'draw');
});

test('point defense is finite and consumes an interceptor attempt even on leakers', () => {
  let state = createGame('strait', 304);
  const target = state.ships.find((s) => s.id === 'r_shahin');
  target.defense = 0;
  target.hull = 100;
  state.pending = [{ kind: 'missile', shipId: 'b_valiant', targetId: 'r_shahin', side: 'blue', salvo: 1, deliverAt: 1 }];
  state = step(state);
  assert.ok(state.ships.find((s) => s.id === 'r_shahin').hull < 100, 'zero defense cannot intercept');

  state = createGame('strait', 305);
  state.ships.find((s) => s.id === 'r_shahin').defense = 1;
  state.pending = [{ kind: 'missile', shipId: 'b_valiant', targetId: 'r_shahin', side: 'blue', salvo: 1, deliverAt: 1 }];
  state = step(state);
  assert.equal(state.ships.find((s) => s.id === 'r_shahin').defense, 0);
});

test('modern saves with pending missiles remain deterministic after deserialize', () => {
  let a = createGame('strait', 0);
  a = setRadar(a, ['b_valiant', 'r_shahin'], true);
  a = step(a);
  assert.ok(a.pending.some((p) => p.kind === 'missile'));
  let b = deserialize(serialize(a));
  for (let i = 0; i < 6; i += 1) {
    a = step(a);
    b = step(b);
  }
  assert.equal(serialize(a), serialize(b));
});

test('proceed orders to land are rejected with a warning', () => {
  let state = createGame('nevis', 306);
  const land = state.map.terrain.find((t) => t.type === 'land');
  state = issueOrder(state, 'b_constellation', { type: 'proceed', q: land.q, r: land.r });
  assert.equal(state.pending.length, 0);
  assert.match(state.log.at(-1).text, /destination is land/);
  const bad = structuredClone(state);
  bad.ships[0].order = { type: 'proceed', q: land.q, r: land.r };
  assert.throws(() => deserialize(JSON.stringify(bad)), /land/);
});

test('modern captains hold standoff distance once a contact is in preferred range', () => {
  let state = setRadar(createGame('strait', 701), 'b_valiant', true);
  const before = state.ships.find(s => s.id === 'b_valiant');
  state = step(state);
  const after = state.ships.find(s => s.id === before.id);
  assert.deepEqual([after.q, after.r], [before.q, before.r]);
  assert.ok(after.ammo < before.ammo);
});

test('later identification cannot reveal names in past public dispatches', () => {
  let state = setRadar(createGame('strait', 702), 'b_valiant', true);
  state = step(state);
  const before = getView(state).log;
  for (const contact of state.contacts.blue) {
    const ship = state.ships.find(s => s.id === contact.targetId);
    contact.confidence = 'identified';
    contact.name = ship.name;
  }
  assert.deepEqual(getView(state).log, before);
});
