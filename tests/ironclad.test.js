import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, deserialize, getView, serialize, step } from '../src/sim/engine.js';
import { contactId } from '../src/sim/core.js';

const ship = (state, id) => state.ships.find((s) => s.id === id);

test('deep-draught ships never enter shoals; anchored ships never move', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    let state = createGame('hampton', seed);
    const shoals = new Set(state.map.terrain.filter((t) => t.type === 'shoal').map((t) => `${t.q},${t.r}`));
    const anchored = state.ships.filter((s) => s.speed === 0).map((s) => [s.id, s.q, s.r]);
    while (!state.outcome) {
      state = step(state);
      for (const s of state.ships) if (s.draft === 'deep' && s.status === 'active') assert.ok(!shoals.has(`${s.q},${s.r}`), `${s.id} aground at ${s.q},${s.r}`);
      for (const [id, q, r] of anchored) assert.deepEqual([ship(state, id).q, ship(state, id).r], [q, r]);
    }
  }
});

test('the reserve ironclad stays off the board, and out of contact reports, until she arrives', () => {
  let state = createGame('hampton', 9);
  while (state.tick < 6) {
    state = step(state);
    assert.equal(ship(state, 'r_monitor').status, 'reserve');
    assert.ok(!getView(state, 'blue').contacts.some((c) => c.id === contactId(state, 'blue', 'r_monitor')));
    assert.ok(!state.contacts.blue.some((c) => c.targetId === 'r_monitor'));
  }
  state = step(state);
  assert.equal(ship(state, 'r_monitor').status, 'active');
});

test('iron armour turns wooden broadsides; ramming beam-on beats a glancing blow', () => {
  const setup = () => {
    const state = createGame('hampton', 4);
    for (const s of state.ships) if (!['b_virginia', 'r_cumberland'].includes(s.id)) { s.status = 'escaped'; }
    state.contacts = { blue: [], red: [] };
    return state;
  };
  // Virginia two hexes off Cumberland's beam: Cumberland's broadside bears, and so does hers.
  let state = setup();
  Object.assign(ship(state, 'b_virginia'), { q: 4, r: 6, facing: 0, order: { type: 'hold' } });
  state = step(state);
  assert.ok(ship(state, 'b_virginia').hull >= 90, 'armour keeps hull damage small');
  assert.ok(ship(state, 'r_cumberland').hull < 100, 'Virginia\'s shells bite on wood');

  const ramFrom = (q, r, facing) => {
    let s = setup();
    Object.assign(ship(s, 'b_virginia'), { q, r, facing, speed: 0, order: { type: 'engage' }, reloadUntil: 99 });
    Object.assign(ship(s, 'r_cumberland'), { battery: 0 });
    s = step(s);
    return 100 - ship(s, 'r_cumberland').hull;
  };
  const beam = ramFrom(4, 5, 4); // south of her, bow pointing north into her side
  const glancing = ramFrom(3, 4, 0); // astern of her, bow pointing at her stern
  assert.ok(beam > glancing * 1.5, `beam-on ${beam} vs glancing ${glancing}`);
});

test('hampton sorties are deterministic across save/load, with fires and rams in flight', () => {
  let state = createGame('hampton', 21);
  const types = new Set();
  while (!state.outcome) {
    const next = step(state);
    assert.equal(serialize(step(deserialize(serialize(state)))), serialize(next));
    state = next;
    for (const e of state.fx) if (e.blue) types.add(e.blue.type);
  }
  assert.ok(types.has('broadside'));
  assert.ok(types.has('fire') || types.has('ram'));
});

test('invalid ironclad saves are rejected', () => {
  const bad = (mutate) => { const s = JSON.parse(serialize(createGame('hampton', 2))); mutate(s); return () => deserialize(JSON.stringify(s)); };
  assert.throws(bad((s) => { s.ships[0].draft = 'medium'; }), /draft/);
  assert.throws(bad((s) => { s.ships[0].ammunition = 'grape'; }), /ammunition/);
  assert.throws(bad((s) => { s.ships.find((x) => x.status === 'reserve').arriveAt = -4; }), /reserve/);
});

test('a rammer shaken below striking point strikes that same turn', () => {
  const state = createGame('hampton', 4);
  for (const s of state.ships) if (!['b_virginia', 'r_cumberland'].includes(s.id)) s.status = 'escaped';
  Object.assign(ship(state, 'b_virginia'), { q: 4, r: 5, facing: 4, crew: 14, order: { type: 'engage' }, reloadUntil: 99, doctrine: { roe: 'free', range: 2, withdraw: 0 } });
  Object.assign(ship(state, 'r_cumberland'), { battery: 0 });
  const next = step(state);
  assert.ok(next.fx.some((e) => e.blue?.type === 'ram'), 'the ram happened');
  assert.equal(ship(next, 'b_virginia').status, 'struck');
});

test('during ram recovery the rammer turns her broadside instead of sitting bow-on', () => {
  const state = createGame('hampton', 4);
  for (const s of state.ships) if (!['b_virginia', 'r_cumberland'].includes(s.id)) s.status = 'escaped';
  Object.assign(ship(state, 'b_virginia'), { q: 4, r: 5, facing: 4, order: { type: 'engage' }, ramReadyAt: 50 });
  let next = state;
  for (let i = 0; i < 4; i++) next = step(next);
  assert.ok(next.fx.some((e) => e.blue?.type === 'broadside') || next.log.some((e) => /CSS Virginia fires/.test(e.text)), 'she fires while the ram recovers');
});

test('a reserve whose arrival hex is taken comes in on open water nearby', () => {
  const state = createGame('hampton', 4);
  Object.assign(ship(state, 'r_minnesota'), { q: 18, r: 3, order: { type: 'hold' } });
  let next = state;
  while (next.tick < 7) next = step(next);
  const monitor = ship(next, 'r_monitor');
  assert.equal(monitor.status, 'active');
  assert.notDeepEqual([monitor.q, monitor.r], [18, 3]);
});

test('idle admirals draw at Hampton Roads rather than lose on uneven scoring', () => {
  let state = createGame('hampton', 3);
  for (const s of state.ships) s.doctrine.roe = 'hold';
  for (const s of state.ships) if (s.speed > 0) s.order = { type: 'hold' };
  while (!state.outcome) state = step(state);
  assert.equal(state.outcome.result, 'draw');
});

test('torpedo orders are rejected in eras without torpedoes', () => {
  const s = JSON.parse(serialize(createGame('hampton', 2)));
  s.pending.push({ kind: 'torpedo', shipId: 'b_virginia', targetId: 'r_congress', side: 'blue', salvo: 1, deliverAt: 3, q: 1, r: 5, aimQ: 2, aimR: 5 });
  assert.throws(() => deserialize(JSON.stringify(s)), /era/);
});
