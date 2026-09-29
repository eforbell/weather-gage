import test from 'node:test';
import assert from 'node:assert/strict';
import { addFx } from '../src/sim/core.js';
import { activePing, createGame, deserialize, getView, issueOrder, serialize, setDoctrine, step } from '../src/sim/engine.js';

const ship = (state, id) => state.ships.find((s) => s.id === id);
const bare = (seed = 5) => {
  const s = createGame('defector', seed);
  s.events = [];
  return s;
};
// Out of the way without ending the game (escaping would count as the rendezvous).
const park = (state, id) => Object.assign(ship(state, id), { q: 0, r: 13, order: { type: 'hold' }, doctrine: { ...ship(state, id).doctrine, roe: 'hold' } });
const twoBlueBoats = () => {
  const state = bare(23);
  const dallas = ship(state, 'b_dallas');
  Object.assign(dallas, { q: 10, r: 9, facing: 3, order: { type: 'hold' }, doctrine: { ...dallas.doctrine, roe: 'hold' } });
  const scout = structuredClone(dallas);
  Object.assign(scout, { id: 'b_scout', name: 'USS Scout', q: 15, r: 9, sonar: 0, torpedoes: 2, doctrine: { ...scout.doctrine, speed: 'silent' } });
  state.ships.push(scout);
  state.contactTracks[scout.id] = [];
  const hunter = ship(state, 'r_konovalov');
  Object.assign(hunter, { q: 7, r: 9, quiet: 1, noise: 1, order: { type: 'hold' }, doctrine: { ...hunter.doctrine, roe: 'hold' } });
  park(state, 'g_red_october');
  return state;
};

test('three sides each get their own picture, and hostility starts one-sided', () => {
  const state = createGame('defector', 1);
  assert.deepEqual(Object.keys(state.contacts).sort(), ['blue', 'green', 'red']);
  const view = getView(state, 'blue');
  assert.deepEqual(view.hostileTo, ['red']);
  assert.ok(view.ships.every((s) => s.side === 'blue'));
});

test('passive contacts carry an uncertainty ring that shrinks while held, then classify', () => {
  let state = bare();
  Object.assign(ship(state, 'b_dallas'), { q: 10, r: 9, facing: 3, order: { type: 'hold' } });
  Object.assign(ship(state, 'r_konovalov'), { q: 3, r: 9, order: { type: 'hold' } });
  park(state, 'g_red_october');
  const seen = [];
  for (let i = 0; i < 5; i++) {
    state = step(state);
    const c = state.contacts.blue.find((x) => x.targetId === 'r_konovalov' && !x.stale);
    if (c) seen.push([c.uncertainty, c.confidence]);
  }
  assert.ok(seen.length >= 3, 'Konovalov is heard');
  assert.ok(seen.at(-1)[0] < seen[0][0], `uncertainty shrinks: ${JSON.stringify(seen)}`);
  assert.ok(seen.some(([, conf]) => conf === 'classified'));
});

test('the baffles are deaf astern', () => {
  let state = bare();
  Object.assign(ship(state, 'b_dallas'), { q: 10, r: 9, facing: 0, order: { type: 'hold' } }); // facing east
  Object.assign(ship(state, 'r_konovalov'), { q: 6, r: 9, order: { type: 'hold' } }); // dead astern, to the west
  park(state, 'g_red_october');
  state = step(state);
  assert.ok(!state.contacts.blue.some((c) => c.targetId === 'r_konovalov' && !c.stale));
});

test('each boat has its own sonar picture, including in the selected-boat view', () => {
  let state = step(twoBlueBoats());
  assert.ok(state.contactTracks.b_dallas.some((c) => c.targetId === 'r_konovalov' && !c.stale));
  assert.ok(!state.contactTracks.b_scout.some((c) => c.targetId === 'r_konovalov' && !c.stale));
  assert.ok(state.contacts.blue.some((c) => c.targetId === 'r_konovalov'), 'command summary can retain reports');
  assert.ok(getView(state, 'blue', 'b_dallas').contacts.length > 0);
  assert.equal(getView(state, 'blue', 'b_scout').contacts.length, 0, 'the scout does not inherit Dallas’s fix');
  assert.equal(getView(state, 'blue', 'r_konovalov').sonarOf, 'b_dallas', 'a caller cannot select an enemy observer');
  addFx(state, { type: 'torpedo', shooterId: 'r_konovalov', targetId: 'b_dallas' });
  assert.ok(getView(state, 'blue', 'b_dallas').fx.some((e) => e.type === 'torpedo'));
  assert.ok(!getView(state, 'blue', 'b_scout').fx.some((e) => e.type === 'torpedo'), 'another boat’s sonar does not reveal chart effects');
  const withFish = structuredClone(state);
  withFish.entities.push({ id: 'probe', kind: 'torpedo', side: 'red', shooterId: 'r_konovalov', q: 9, r: 8, facing: 0, travelled: 0, run: 18, armAt: 2, aimQ: 10, aimR: 8, seeking: null });
  assert.equal(getView(withFish, 'blue', 'b_dallas').entities.length, 1);
  assert.equal(getView(withFish, 'blue', 'b_scout').entities.length, 0, 'another boat’s hearing does not reveal a weapon');

  state = activePing(state, ['b_dallas']);
  state = step(state);
  assert.equal(state.contactTracks.b_dallas.find((c) => c.targetId === 'r_konovalov').uncertainty, 0);
  assert.ok(!state.contactTracks.b_scout.some((c) => c.targetId === 'r_konovalov' && !c.stale), 'one boat’s ping does not update another’s sonar');
});

test('a boat cannot fire using another boat’s classified track', () => {
  let state = twoBlueBoats();
  for (let i = 0; i < 4; i++) state = step(state);
  assert.equal(state.contactTracks.b_dallas.find((c) => c.targetId === 'r_konovalov').confidence, 'classified');
  const scout = ship(state, 'b_scout');
  Object.assign(scout, { q: 10, r: 10, facing: 3, sonar: 5, order: { type: 'engage' }, doctrine: { ...scout.doctrine, roe: 'free', range: 12 } });
  const ammo = scout.torpedoes;
  state = step(state);
  assert.equal(state.contactTracks.b_scout.find((c) => c.targetId === 'r_konovalov').confidence, 'sighted');
  assert.equal(ship(state, 'b_scout').torpedoes, ammo);
  assert.ok(!state.entities.some((e) => e.shooterId === 'b_scout'));
});

test('old saves rebuild separate sonar tracks instead of copying the side report', () => {
  const legacy = twoBlueBoats();
  legacy.contacts.blue = [{ id: 'legacy', targetId: 'r_konovalov', q: 7, r: 9, confidence: 'identified', lastSeen: 0, stale: false }];
  Object.assign(ship(legacy, 'b_dallas'), { q: 19, r: 13 });
  delete legacy.contactTracks;
  const loaded = deserialize(JSON.stringify(legacy));
  assert.ok(!loaded.contactTracks.b_dallas.some((c) => c.targetId === 'r_konovalov' && !c.stale));
  assert.ok(!loaded.contactTracks.b_scout.some((c) => c.targetId === 'r_konovalov' && !c.stale));
  assert.equal(getView(loaded, 'blue', 'b_scout').contacts.length, 0);
});

test('malformed per-boat contact tracks are rejected', () => {
  const state = twoBlueBoats();
  delete state.contactTracks.b_scout;
  assert.throws(() => deserialize(JSON.stringify(state)), /Invalid contact tracks/);
  state.contactTracks.b_scout = [{ id: 'bad', targetId: 'missing', q: 1, r: 1, confidence: 'sighted', lastSeen: 0, stale: false }];
  assert.throws(() => deserialize(JSON.stringify(state)), /Invalid contact target/);
});

test('one ping: exact fix for the pinger, position revealed to everyone, and the defector answers', () => {
  let state = bare();
  Object.assign(ship(state, 'b_dallas'), { q: 6, r: 5, order: { type: 'hold' } });
  Object.assign(ship(state, 'g_red_october'), { q: 3, r: 5, order: { type: 'hold' } });
  state = activePing(state, ['b_dallas']);
  state = step(state);
  const fix = state.contacts.blue.find((c) => c.targetId === 'g_red_october');
  assert.equal(fix.confidence, 'identified');
  assert.equal(fix.uncertainty, 0);
  assert.ok(state.contacts.green.some((c) => c.targetId === 'b_dallas' && !c.stale), 'the pinger is heard');
  assert.deepEqual(state.command, { blue: ['green'] });
  assert.ok(getView(state, 'blue').ships.some((s) => s.id === 'g_red_october'), 'Red October joins the blue command view');
});

test('a torpedo that hits inside its arming distance is a dud', () => {
  let state = bare();
  Object.assign(ship(state, 'b_dallas'), { q: 10, r: 9, order: { type: 'hold' }, decoys: 0 });
  state.entities.push({ id: 'tx', kind: 'torpedo', side: 'red', shooterId: 'r_konovalov', q: 8, r: 9, facing: 0, travelled: 0, run: 18, armAt: 5, aimQ: 10, aimR: 9, seeking: null });
  const hull = ship(state, 'b_dallas').hull;
  state = step(state);
  assert.ok(ship(state, 'b_dallas').hull >= hull - 5, 'unarmed torpedo does little damage');
  assert.ok(state.log.some((e) => /without arming/.test(e.text)));
});

test('seekers cannot tell friend from foe: a torpedo can come back for its own boat', () => {
  let state = bare();
  for (const id of ['b_dallas', 'g_red_october']) park(state, id);
  Object.assign(ship(state, 'b_dallas'), { q: 19, r: 0 });
  Object.assign(ship(state, 'r_konovalov'), { q: 10, r: 9, order: { type: 'hold' }, noise: 12, quiet: 12 });
  state.entities.push({ id: 'tx', kind: 'torpedo', side: 'red', shooterId: 'r_konovalov', q: 12, r: 9, facing: 3, travelled: 6, run: 18, armAt: 0, aimQ: 5, aimR: 9, seeking: null });
  state = step(state);
  assert.ok(state.log.some((e) => /her own/.test(e.text)));
});

test('firing first makes the victim hostile; attacking a protected boat makes the protector hostile', () => {
  let state = bare();
  state = setDoctrine(state, ['b_dallas'], { roe: 'free' });
  Object.assign(ship(state, 'b_dallas'), { q: 6, r: 9, order: { type: 'engage' } });
  Object.assign(ship(state, 'r_konovalov'), { q: 3, r: 9, order: { type: 'hold' } });
  let n = 0;
  while (!state.hostile.red.includes('blue') && n++ < 10) state = step(state);
  assert.ok(state.hostile.red.includes('blue'), 'Konovalov becomes hostile to Dallas after being fired upon');

  let s2 = bare();
  s2.command = { blue: ['green'] };
  Object.assign(ship(s2, 'r_konovalov'), { q: 3, r: 5, order: { type: 'engage' }, doctrine: { ...ship(s2, 'r_konovalov').doctrine, speed: 'silent' } });
  Object.assign(ship(s2, 'g_red_october'), { q: 6, r: 5, order: { type: 'hold' }, quiet: 5 });
  n = 0;
  while (!s2.hostile.blue.includes('red') || !s2.hostile.red.includes('blue')) { s2 = step(s2); if (n++ > 12) break; }
  assert.ok(s2.hostile.red.includes('blue') && s2.hostile.blue.includes('red'), 'an attack on the protected boat is an attack on the protector');
});

test('scripted events fire once inside their window, and different seeds pick different ticks', () => {
  const ticks = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    let state = createGame('defector', seed);
    const at = state.events.find((e) => e.id === 'sabotage').at;
    assert.ok(at >= 8 && at <= 14);
    ticks.add(at);
    while (state.tick < at && !state.outcome) state = step(state); // a finished game stops ticking
    if (state.outcome) continue;
    if (ship(state, 'g_red_october').status === 'active') assert.equal(ship(state, 'g_red_october').quiet, 3);
    assert.ok(state.events.find((e) => e.id === 'sabotage').done);
  }
  assert.ok(ticks.size > 1);
});

test('only your own torpedoes are shown exactly; others only when heard, and roughly', () => {
  let state = bare();
  state.entities.push({ id: 'tx', kind: 'torpedo', side: 'red', shooterId: 'r_konovalov', q: 1, r: 12, facing: 0, travelled: 0, run: 18, armAt: 2, aimQ: 5, aimR: 12, seeking: null });
  assert.equal(getView(state, 'blue').entities.length, 0, 'far away and unheard');
  assert.equal(getView(state, 'red').entities[0].own, true);
});

test('defector saves round-trip and replay deterministically, including entities and events', () => {
  let state = createGame('defector', 11);
  state = issueOrder(state, ['b_dallas'], { type: 'proceed', q: 11, r: 5 });
  while (!state.outcome) {
    const next = step(state);
    assert.equal(serialize(step(deserialize(serialize(state)))), serialize(next));
    state = next;
  }
});

test('fog: public contact ids and effects never reveal true identity or exact position', () => {
  for (const seed of [2, 5, 9]) {
    let state = createGame('defector', seed);
    while (!state.outcome) {
      state = step(state);
      for (const side of ['blue', 'red', 'green']) {
        const view = getView(state, side);
        for (const c of view.contacts) assert.ok(!state.ships.some((s) => c.id.includes(s.id)), `contact id ${c.id} names a ship`);
        for (const e of view.entities) if (!e.own) assert.ok(!state.ships.some((s) => e.id.includes(s.id)));
      }
    }
  }
});

test('a dud that leaves the defector at zero hull is a loss, not a draw', () => {
  let state = bare();
  park(state, 'b_dallas');
  Object.assign(ship(state, 'g_red_october'), { q: 10, r: 9, hull: 2, decoys: 0, order: { type: 'hold' } });
  state.entities.push({ id: 'tx', kind: 'torpedo', side: 'red', shooterId: 'r_konovalov', q: 8, r: 9, facing: 0, travelled: 0, run: 18, armAt: 5, aimQ: 10, aimR: 9, seeking: null });
  state = step(state);
  assert.equal(state.outcome?.result, 'defeat');
});

test('a boat on Hold still launches a noisemaker at an incoming torpedo', () => {
  let state = bare();
  Object.assign(ship(state, 'b_dallas'), { q: 10, r: 9, order: { type: 'hold' } });
  state.entities.push({ id: 'tx', kind: 'torpedo', side: 'red', shooterId: 'r_konovalov', q: 5, r: 9, facing: 0, travelled: 0, run: 18, armAt: 2, aimQ: 10, aimR: 9, seeking: null });
  const before = ship(state, 'b_dallas').decoys;
  state = step(state);
  assert.equal(ship(state, 'b_dallas').decoys, before - 1);
});

test('effects place an uncertain contact where it was reported, not where it is', () => {
  const state = bare();
  const k = ship(state, 'r_konovalov');
  state.contacts.blue = [{ id: 'x', targetId: k.id, q: 1, r: 1, confidence: 'sighted', lastSeen: 0, stale: false, uncertainty: 3, holdSince: 0 }];
  addFx(state, { type: 'decoy', shooterId: k.id });
  const f = state.fx.at(-1).blue;
  assert.deepEqual([f.from.q, f.from.r], [1, 1]);
  assert.notDeepEqual([f.from.q, f.from.r], [k.q, k.r]);
});
