import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, deserialize, getView, launchPatrol, serialize, step } from '../src/sim/engine.js';
import { splashPoint } from '../src/sim/eras/coldwar.js';

const ship = (state, id) => state.ships.find((s) => s.id === id);
const track = (state, observerId, targetId) => state.contactTracks[observerId].find((c) => c.targetId === targetId && !c.stale);
const quiet = (s) => Object.assign(s, { order: { type: 'hold' }, doctrine: { ...s.doctrine, roe: 'hold' } });

// Northern Screen with everyone parked and holding fire; tests move in the ships they need.
function range(seed = 3) {
  const state = createGame('northern_screen', seed);
  state.events = [];
  const parking = { b_steadfast: [2, 16], b_meridian: [3, 16], b_ward: [4, 16], b_sable: [5, 16], b_kite: [6, 16], r_razor: [28, 0], r_echo: [29, 0], r_dart: [29, 2] };
  for (const s of state.ships) { quiet(s); const [q, r] = parking[s.id]; Object.assign(s, { q, r }); }
  return state;
}
const heavy = (over) => ({
  id: 'tx', kind: 'torpedo', side: 'red', shooterId: 'r_razor', facing: 3, travelled: 0, run: 22, armAt: 2, seeking: null,
  targetId: 'b_meridian', wired: true, enabled: false, ignore: [], lockQ: null, lockR: null, depth: 'shallow', ...over,
});

test('datum: a boat that hears a torpedo early in its run gets a rough fix on whoever fired it', () => {
  let state = range();
  Object.assign(ship(state, 'b_sable'), { q: 12, r: 8, facing: 0, sonar: 0 }); // too deaf to hear the silent shooter herself
  Object.assign(ship(state, 'r_razor'), { q: 24, r: 8, facing: 3, quiet: 0, noise: 0, doctrine: { ...ship(state, 'r_razor').doctrine, depth: 'deep' } });
  state.entities.push(heavy({ q: 18, r: 8, targetId: 'b_sable', aimQ: 12, aimR: 8, originQ: 24, originR: 8 })); // still running at the end of the tick
  state = step(state);
  assert.ok(state.entities.some((e) => e.id === 'tx'));
  const fix = track(state, 'b_sable', 'r_razor');
  assert.ok(fix, 'the shooter is placed down the torpedo’s track');
  assert.equal(fix.confidence, 'sighted');
  assert.ok(fix.uncertainty >= 1, 'a datum is a rough fix, not a position');
});

test('snap shot: a submarine under attack fires back at the shooter without waiting to classify her', () => {
  let state = range();
  const sable = ship(state, 'b_sable');
  Object.assign(sable, { q: 12, r: 8, facing: 0, decoys: 0, doctrine: { ...sable.doctrine, roe: 'free' }, order: { type: 'hold' } });
  Object.assign(ship(state, 'r_razor'), { q: 18, r: 8, facing: 3, quiet: 0, noise: 0, doctrine: { ...ship(state, 'r_razor').doctrine, depth: 'deep' } });
  state.entities.push(heavy({ q: 17, r: 8, targetId: 'b_sable', aimQ: 12, aimR: 8, originQ: 18, originR: 8 }));
  const before = sable.torpedoes;
  state = step(state);
  assert.equal(ship(state, 'b_sable').torpedoes, before - 1);
  assert.ok(state.log.some((e) => /snap shot down the bearing/.test(e.text)));
});

test('ASROC: a destroyer with a fair fix beyond tube range puts a lightweight torpedo in just short of it', () => {
  let state = range();
  const meridian = ship(state, 'b_meridian');
  Object.assign(meridian, { q: 10, r: 8, facing: 0, doctrine: { ...meridian.doctrine, roe: 'free' }, order: { type: 'hold' } });
  Object.assign(ship(state, 'r_razor'), { q: 15, r: 8, quiet: 3, noise: 3 });
  state = step(state); // localize
  state = step(state);
  assert.equal(ship(state, 'b_meridian').asroc, 2, 'one ASROC fired');
  assert.ok(state.log.some((e) => /fires an ASROC/.test(e.text)));
  const fish = state.entities.find((e) => e.kind === 'torpedo' && e.shooterId === 'b_meridian');
  if (fish) { // it may already have run its course
    assert.equal(fish.weight, 'light');
    assert.equal(fish.wired, false);
  }
});

test('ASROC holds when the fix is poor or a friendly boat is near the contact', () => {
  let state = range();
  const meridian = ship(state, 'b_meridian');
  Object.assign(meridian, { q: 10, r: 8, facing: 0, doctrine: { ...meridian.doctrine, roe: 'free' }, order: { type: 'hold' } });
  Object.assign(ship(state, 'r_razor'), { q: 15, r: 8, quiet: 3, noise: 3 });
  Object.assign(ship(state, 'b_kite'), { q: 16, r: 8 }); // friendly right beside the contact
  for (let i = 0; i < 3; i++) state = step(state);
  assert.equal(ship(state, 'b_meridian').asroc, 3);
});

test('sonobuoys hear shallow boats more reliably than deep ones, and only the carrier gets the report', () => {
  const heard = (depth) => {
    let n = 0;
    for (let seed = 1; seed <= 30; seed++) {
      let state = range(seed);
      const razor = ship(state, 'r_razor');
      Object.assign(razor, { q: 16, r: 8, quiet: 0, noise: 0, doctrine: { ...razor.doctrine, depth } });
      Object.assign(ship(state, 'b_steadfast'), { q: 4, r: 8 });
      state = launchPatrol(state, 'b_steadfast', { q: 16, r: 8 });
      for (let i = 0; i < 6; i++) {
        state = step(state);
        if (track(state, 'b_steadfast', 'r_razor')) n++;
        assert.ok(!track(state, 'b_meridian', 'r_razor'), 'escorts do not inherit the buoy picture');
      }
    }
    return n;
  };
  const shallow = heard('shallow');
  const deep = heard('deep');
  assert.ok(shallow > deep * 1.4, `shallow ${shallow} vs deep ${deep}`);
});

test('carrier aircraft attack only with a good fix, and only when weapons are free', () => {
  const run = (roe) => {
    let state = range();
    const carrier = ship(state, 'b_steadfast');
    Object.assign(carrier, { q: 4, r: 8, doctrine: { ...carrier.doctrine, roe } });
    Object.assign(ship(state, 'r_razor'), { q: 16, r: 8, quiet: 4, noise: 4 });
    state = launchPatrol(state, 'b_steadfast', { q: 16, r: 8 });
    for (let i = 0; i < 6; i++) state = step(state);
    return state;
  };
  const free = run('free');
  assert.ok(ship(free, 'b_steadfast').airTorpedoes < 4, 'aircraft dropped a torpedo on the buoy fix');
  assert.ok(free.log.some((e) => /aircraft drop a torpedo/.test(e.text)));
  assert.equal(ship(run('hold'), 'b_steadfast').airTorpedoes, 4);
});

test('a lightweight warhead does less damage than a heavyweight', () => {
  const hit = (weight) => {
    let state = range();
    Object.assign(ship(state, 'r_razor'), { q: 16, r: 8, decoys: 0 });
    state.entities.push(heavy({ side: 'blue', shooterId: 'b_meridian', q: 15, r: 8, facing: 0, travelled: 3, targetId: 'r_razor', wired: false, enabled: true, aimQ: 16, aimR: 8, weight, speed: weight === 'light' ? 3 : 4, run: 8 }));
    state = step(state);
    return 100 - ship(state, 'r_razor').hull;
  };
  const light = hit('light');
  const heavyDamage = hit('heavy');
  assert.ok(light > 0 && light < heavyDamage, `light ${light} vs heavy ${heavyDamage}`);
});

test('the enemy never sees your sonobuoys', () => {
  let state = range();
  Object.assign(ship(state, 'r_razor'), { q: 16, r: 9 });
  state = launchPatrol(state, 'b_steadfast', { q: 16, r: 8 });
  state = step(state);
  state = step(state);
  assert.ok(getView(state, 'blue', 'b_steadfast').entities.some((e) => e.kind === 'buoys'));
  assert.ok(!getView(state, 'red', 'r_razor').entities.some((e) => e.kind === 'buoys'));
});

test('ASW loads and sonobuoy fields validate and survive a save', () => {
  const bad = (mutate) => { const s = range(); mutate(s); return () => deserialize(JSON.stringify(s)); };
  assert.throws(bad((s) => { ship(s, 'b_sable').asroc = 2; }), /ASROC/);
  assert.throws(bad((s) => { ship(s, 'b_meridian').airTorpedoes = 2; }), /airTorpedoes/);
  assert.throws(bad((s) => { s.entities.push({ id: 'bx', kind: 'buoys', side: 'blue', carrierId: 'nobody', q: 5, r: 5, until: 4 }); }), /sonobuoy/);
  assert.throws(bad((s) => { s.entities.push(heavy({ q: 5, r: 5, aimQ: 6, aimR: 5, weight: 'medium' })); }), /weight/);
  assert.throws(bad((s) => { s.entities.push({ id: 'bx', kind: 'buoys', side: 'red', carrierId: 'b_steadfast', q: 5, r: 5, until: 4 }); }), /sonobuoy/);
  let state = range();
  state = launchPatrol(state, 'b_steadfast', { q: 10, r: 16 });
  state = step(state);
  state = step(state);
  assert.equal(serialize(deserialize(serialize(state))), serialize(state));
});

test('a datum stays a rough, fixed point where the torpedo was fired: it never sharpens into a track', () => {
  let state = range();
  Object.assign(ship(state, 'b_sable'), { q: 12, r: 11, facing: 0, sonar: 0 });
  const razor = ship(state, 'r_razor');
  Object.assign(razor, { q: 26, r: 8, facing: 3, quiet: 0, noise: 0, order: { type: 'proceed', q: 26, r: 2 }, doctrine: { ...razor.doctrine, depth: 'deep' } });
  state.entities.push(heavy({ q: 17, r: 11, facing: 3, targetId: 'b_kite', aimQ: 2, aimR: 11, originQ: 26, originR: 8, wired: false }));
  const seen = [];
  for (let i = 0; i < 4; i++) {
    state = step(state);
    const c = state.contactTracks.b_sable.find((x) => x.targetId === 'r_razor');
    if (c && !c.stale) seen.push([c.q, c.r, c.uncertainty, c.confidence]);
  }
  assert.ok(seen.length > 0, 'the datum was heard');
  for (const [q, r, u, conf] of seen) {
    assert.deepEqual([q, r], [26, 8], 'anchored at the launch point, not the moving boat');
    assert.equal(u, 2);
    assert.equal(conf, 'sighted');
  }
});

test('snap shot: no extra range against an unrelated contact, and never for a friendly torpedo', () => {
  let state = range();
  const sable = ship(state, 'b_sable');
  Object.assign(sable, { q: 12, r: 8, facing: 0, decoys: 0, doctrine: { ...sable.doctrine, roe: 'free', range: 4 }, order: { type: 'hold' } });
  Object.assign(ship(state, 'r_echo'), { q: 12, r: 3, quiet: 6, noise: 6 }); // a loud, unrelated contact 5 hexes off
  // A friendly torpedo passing by makes Sable evade, but must not unlock a snap shot.
  state.entities.push(heavy({ side: 'blue', shooterId: 'b_kite', q: 15, r: 8, facing: 3, targetId: 'r_echo', aimQ: 2, aimR: 8, wired: false }));
  state = step(state);
  assert.ok(!state.log.some((e) => /snap shot/.test(e.text)));
  assert.ok(!state.log.some((e) => /BNS Sable fires a torpedo at RNS Echo/.test(e.text)), 'no +2 range against an unrelated contact');
});

test('lightweight torpedoes splash down on open water beside the contact, never on a ship or land', () => {
  const state = range();
  const launcher = { q: 8, r: 8 };
  Object.assign(ship(state, 'r_echo'), { q: 13, r: 8 }); // in the hex just short of the contact, launcher side
  const p = splashPoint(state, launcher, { q: 14, r: 8 });
  assert.ok(p, 'another neighbouring hex is used');
  assert.equal(Math.max(Math.abs(p.q - 14), Math.abs(p.r - 8), Math.abs(p.q + p.r - 22)), 1, 'right beside the contact');
  assert.ok(!state.ships.some((s) => s.status === 'active' && s.q === p.q && s.r === p.r));
  assert.notEqual(state.map.terrain.find((t) => t.q === p.q && t.r === p.r)?.type, 'land');
  // Boxed in on every side: hold the round rather than drop it on someone.
  const crowded = range();
  const ring = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const pieces = ['r_echo', 'r_dart', 'b_kite', 'b_sable', 'b_ward', 'r_razor'];
  ring.forEach(([dq, dr], i) => Object.assign(ship(crowded, pieces[i]), { q: 14 + dq, r: 8 + dr }));
  assert.equal(splashPoint(crowded, launcher, { q: 14, r: 8 }), null);
});

test('the target of an ASROC hears the splash but does not learn where the hunter thinks she is', () => {
  let state = range();
  const meridian = ship(state, 'b_meridian');
  Object.assign(meridian, { q: 10, r: 8, facing: 0, doctrine: { ...meridian.doctrine, roe: 'free' }, order: { type: 'hold' } });
  Object.assign(ship(state, 'r_razor'), { q: 16, r: 8, quiet: 3, noise: 3 });
  let asroc;
  for (let i = 0; i < 3 && !asroc; i++) {
    state = step(state);
    asroc = getView(state, 'red', 'r_razor').fx.find((f) => f.type === 'asroc');
  }
  assert.ok(asroc, 'an ASROC was fired at Razor');
  assert.equal(asroc.at, undefined);
});
