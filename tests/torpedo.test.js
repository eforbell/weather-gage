import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, deserialize, serialize, step } from '../src/sim/engine.js';
import { contactsForShip } from '../src/sim/core.js';

const ship = (state, id) => state.ships.find((s) => s.id === id);
// A quiet test tank: no scripted events, Red October parked out of the way.
function tank(seed = 5) {
  const state = createGame('defector', seed);
  state.events = [];
  Object.assign(ship(state, 'g_red_october'), { q: 0, r: 13, order: { type: 'hold' }, doctrine: { ...ship(state, 'g_red_october').doctrine, roe: 'hold' } });
  return state;
}
const fish = (over) => ({
  id: 'tx', kind: 'torpedo', side: 'blue', shooterId: 'b_dallas', facing: 3, travelled: 0, run: 22, armAt: 2,
  seeking: null, targetId: 'r_konovalov', wired: true, enabled: false, ignore: [], lockQ: null, lockR: null, depth: 'shallow', ...over,
});
const hitLogged = (state, name) => state.log.some((e) => e.text.startsWith(`${name} is hit by a torpedo`));

// Konovalov runs north-east across Dallas's bow; a torpedo aimed where she was misses.
function wireRun(wired) {
  let state = tank();
  Object.assign(ship(state, 'b_dallas'), { q: 17, r: 8, facing: 3, order: { type: 'hold' }, decoys: 0 });
  const k = ship(state, 'r_konovalov');
  Object.assign(k, { q: 6, r: 6, facing: 5, decoys: 0, order: { type: 'proceed', q: 12, r: 0 }, doctrine: { ...k.doctrine, roe: 'hold', speed: 'standard' } });
  state = step(state); // Dallas builds a track
  state.entities.push(fish({ q: 16, r: 8, aimQ: k.q, aimR: k.r, targetId: wired ? 'r_konovalov' : null, wired }));
  const aims = [];
  for (let i = 0; i < 6; i++) {
    state = step(state);
    const t = state.entities.find((e) => e.id === 'tx');
    const track = contactsForShip(state, ship(state, 'b_dallas')).find((c) => c.targetId === 'r_konovalov' && !c.stale);
    // Compare only while the wire is steering (before the seeker takes over).
    if (t && t.wired && !t.seeking && t.lockQ === null && track) aims.push([[t.aimQ, t.aimR], [track.q, track.r]]);
    if (hitLogged(state, 'V. K. Konovalov')) return { hit: true, aims };
  }
  return { hit: false, aims };
}

test('the wire steers toward the firing boat’s current track, and that is what makes the hit', () => {
  const guided = wireRun(true);
  assert.ok(guided.hit, 'wire-guided torpedo runs down the moving target');
  assert.ok(guided.aims.length > 0);
  for (const [aim, track] of guided.aims) assert.deepEqual(aim, track, 'aim point is Dallas’s own track');
  assert.equal(wireRun(false).hit, false, 'without the wire the same shot misses');
});

test('a torpedo will not home on the boat that fired it unless the safeties are off', () => {
  let state = tank();
  Object.assign(ship(state, 'b_dallas'), { q: 10, r: 9, order: { type: 'hold' }, quiet: 9, noise: 9, decoys: 0 });
  Object.assign(ship(state, 'r_konovalov'), { q: 1, r: 12, order: { type: 'hold' } });
  state.entities.push(fish({ q: 12, r: 9, facing: 3, travelled: 10, wired: false, enabled: true, aimQ: 5, aimR: 9, targetId: null }));
  for (let i = 0; i < 4; i++) state = step(state);
  assert.ok(!hitLogged(state, 'USS Dallas'), 'safeties on: the launcher is excluded');
});

test('while the wire holds, the operator rejects a lock on a friendly boat; once cut, the seeker cannot tell', () => {
  const run = (wired) => {
    let state = createGame('northern_screen', 3);
    // Keep an enemy and the carrier afloat (out of the way) so the game keeps running.
    for (const s of state.ships) if (!['b_sable', 'b_kite', 'r_razor', 'b_steadfast'].includes(s.id)) Object.assign(s, { status: 'escaped' });
    Object.assign(ship(state, 'r_razor'), { q: 2, r: 1, order: { type: 'hold' }, doctrine: { ...ship(state, 'r_razor').doctrine, roe: 'hold' } });
    Object.assign(ship(state, 'b_steadfast'), { q: 2, r: 15, order: { type: 'hold' } });
    Object.assign(ship(state, 'b_sable'), { q: 10, r: 8, facing: 3, order: { type: 'hold' }, decoys: 0 });
    // Kite sits loud in the seeker's cone, just off the torpedo's track: no steering involved.
    Object.assign(ship(state, 'b_kite'), { q: 15, r: 6, facing: 0, order: { type: 'hold' }, noise: 8, quiet: 8, decoys: 0 });
    state.entities = [fish({ side: 'blue', shooterId: 'b_sable', q: 13, r: 8, facing: 0, travelled: 3, wired, enabled: true, aimQ: 20, aimR: 8, targetId: null })];
    state.events = [];
    let locked = false;
    for (let i = 0; i < 3 && !state.outcome; i++) {
      state = step(state);
      locked ||= state.entities.some((e) => e.id === 'tx' && e.seeking === 'b_kite') || hitLogged(state, 'BNS Kite');
    }
    assert.equal(state.outcome, null, 'the game keeps running');
    return locked;
  };
  assert.equal(run(true), false, 'wired: the operator rejects the friendly lock');
  assert.equal(run(false), true, 'wire cut: the seeker locks the loudest boat in its cone');
});

test('torpedoes steer around seabed ridges instead of running into them', () => {
  let state = tank();
  Object.assign(ship(state, 'b_dallas'), { q: 1, r: 1, order: { type: 'hold' } });
  Object.assign(ship(state, 'r_konovalov'), { q: 6, r: 1, order: { type: 'hold' }, decoys: 0 });
  // Row 3 (q 2–11) is a ridge; start just north of it heading south into it.
  state.entities.push(fish({ q: 5, r: 2, facing: 1, aimQ: 5, aimR: 5, wired: false, enabled: false, targetId: null }));
  state = step(state);
  assert.ok(!state.log.some((e) => /seabed/.test(e.text)));
});

test('torpedo guidance state round-trips through saves and replays identically', () => {
  let state = createGame('northern_screen', 7);
  let checked = 0;
  while (!state.outcome) {
    const next = step(state);
    if ((state.entities || []).some((e) => e.kind === 'torpedo')) {
      assert.equal(serialize(step(deserialize(serialize(state)))), serialize(next));
      checked++;
    }
    state = next;
  }
  assert.ok(checked > 0, 'some ticks had torpedoes in the water');
});

test('saves from before wire guidance still load, and their torpedoes run', () => {
  let state = tank();
  state.entities.push({ id: 'old', kind: 'torpedo', side: 'red', shooterId: 'r_konovalov', q: 4, r: 9, facing: 0, travelled: 0, run: 18, armAt: 2, aimQ: 10, aimR: 9, seeking: null });
  const loaded = deserialize(serialize(state));
  const next = step(loaded);
  const t = next.entities.find((e) => e.id === 'old');
  assert.ok(!t || t.travelled > 0);
});

test('invalid guidance fields are rejected', () => {
  const bad = (over) => { const s = tank(); s.entities.push(fish({ q: 5, r: 5, aimQ: 6, aimR: 5, ...over })); return () => deserialize(serialize(s)); };
  assert.throws(bad({ wired: 'yes' }), /wired/);
  assert.throws(bad({ depth: 'abyss' }), /depth/);
  assert.throws(bad({ targetId: 'nobody' }), /target/);
  assert.throws(bad({ ignore: [3] }), /ignore/);
  assert.throws(bad({ enabled: 1 }), /enabled/);
  assert.throws(bad({ lockQ: null, lockR: 4 }), /lock/);
});

test('a boat that crosses the layer to evade returns to her ordered depth afterwards', () => {
  let state = tank();
  Object.assign(ship(state, 'b_dallas'), { q: 10, r: 9, order: { type: 'hold' }, decoys: 2, doctrine: { ...ship(state, 'b_dallas').doctrine, depth: 'deep' } });
  state.entities.push(fish({ side: 'red', shooterId: 'r_konovalov', q: 5, r: 9, facing: 0, aimQ: 10, aimR: 9, targetId: 'b_dallas', wired: false, depth: 'deep' }));
  state = step(state);
  assert.equal(ship(state, 'b_dallas').doctrine.depth, 'shallow', 'crossed the layer');
  // She stays across the layer while she can hear the torpedo, then returns.
  for (let i = 0; i < 12 && ship(state, 'b_dallas').doctrine.depth !== 'deep' && !state.outcome; i++) state = step(state);
  assert.equal(ship(state, 'b_dallas').doctrine.depth, 'deep', 'back to the ordered depth');
  assert.equal(ship(state, 'b_dallas').chosenDepth, undefined);
});

test('under command, the defector counts as a friend: a wired torpedo will not lock her', () => {
  let state = tank();
  state.command = { blue: ['green'] };
  Object.assign(ship(state, 'g_red_october'), { q: 12, r: 7, order: { type: 'hold' }, quiet: 8, noise: 8, decoys: 0 });
  Object.assign(ship(state, 'b_dallas'), { q: 16, r: 9, order: { type: 'hold' } });
  state.entities.push(fish({ q: 14, r: 8, facing: 3, travelled: 3, aimQ: 5, aimR: 8, targetId: null, enabled: true }));
  let locked = false;
  for (let i = 0; i < 2; i++) {
    state = step(state);
    locked ||= state.entities.some((e) => e.id === 'tx' && e.seeking === 'g_red_october') || hitLogged(state, 'Red October');
  }
  assert.equal(locked, false);
});
