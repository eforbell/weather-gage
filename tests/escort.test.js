import test from 'node:test';
import assert from 'node:assert/strict';
import { activePing, createGame, deserialize, getView, issueOrder, launchPatrol, serialize, setDoctrine, step } from '../src/sim/engine.js';

const ship = (state, id) => state.ships.find((s) => s.id === id);

test('Northern Screen uses a larger chart and distinct carrier, escorts, and submarines', () => {
  const state = createGame('northern_screen', 17);
  assert.deepEqual([state.map.width, state.map.height], [30, 18]);
  assert.equal(state.ships.filter((s) => s.side === 'blue').length, 5);
  assert.equal(state.ships.filter((s) => s.type === 'asw_destroyer').length, 2);
  assert.equal(state.ships.filter((s) => s.type === 'carrier').length, 1);
  assert.deepEqual(Object.keys(state.contactTracks).sort(), state.ships.map((s) => s.id).sort());
  assert.equal(getView(state, 'blue').sonarOf, 'b_steadfast');
  const doctrine = setDoctrine(state, ['b_steadfast', 'b_meridian'], { depth: 'deep', speed: 'silent' });
  assert.equal(ship(doctrine, 'b_steadfast').doctrine.depth, 'surface');
  assert.equal(ship(doctrine, 'b_meridian').doctrine.speed, 'standard');

  const ordered = issueOrder(state, 'b_steadfast', { type: 'proceed', q: 29, r: 17 });
  assert.ok(ordered.pending.some((p) => p.shipId === 'b_steadfast' && p.order.q === 29));
  assert.equal(issueOrder(state, 'b_steadfast', { type: 'proceed', q: 30, r: 17 }).pending.length, 0);
  const invalidMap = structuredClone(state);
  invalidMap.map.width = 20;
  assert.throws(() => deserialize(JSON.stringify(invalidMap)), /Invalid map/);
  const invalidShip = structuredClone(state);
  ship(invalidShip, 'b_steadfast').q = 30;
  assert.throws(() => deserialize(JSON.stringify(invalidShip)), /Invalid coordinate/);
});

test('carrier patrol is finite, delayed, and reports only to its own picture', () => {
  let state = createGame('northern_screen', 12);
  for (const vessel of state.ships) {
    vessel.order = { type: 'hold' };
    vessel.sonar = 0;
    vessel.quiet = 0;
    vessel.noise = 0;
    vessel.doctrine.roe = 'hold';
  }
  Object.assign(ship(state, 'r_razor'), { q: 16, r: 8 });
  Object.assign(ship(state, 'r_echo'), { q: 29, r: 0 });
  Object.assign(ship(state, 'r_dart'), { q: 29, r: 17 });
  const carrier = ship(state, 'b_steadfast');
  state = launchPatrol(state, carrier.id, { q: 16, r: 8 });
  assert.equal(ship(state, carrier.id).airSorties, 3);
  assert.equal(ship(state, carrier.id).patrolReadyAt, 4);
  assert.deepEqual(state.patrols, [{ carrierId: carrier.id, side: 'blue', q: 16, r: 8, resolveAt: 2 }]);
  assert.equal(serialize(deserialize(serialize(state))), serialize(state), 'an in-flight patrol survives a save');
  assert.equal(ship(launchPatrol(state, carrier.id, { q: 16, r: 8 }), carrier.id).airSorties, 3, 'cooldown blocks a second flight');
  assert.equal(ship(launchPatrol(state, carrier.id, { q: 29, r: 17 }), carrier.id).airSorties, 3, 'distant sectors are outside flight range');
  state = step(state);
  assert.equal(getView(state, 'blue', carrier.id).contacts.length, 0);
  state = step(state);
  assert.ok(state.contactTracks[carrier.id].some((c) => c.targetId === 'r_razor' && !c.stale));
  assert.ok(getView(state, 'blue', carrier.id).contacts.length > 0);
  assert.equal(getView(state, 'blue', 'b_meridian').contacts.length, 0, 'destroyer does not inherit the air report');
  assert.equal(getView(state, 'blue', 'b_sable').contacts.length, 0, 'submarine does not inherit the air report');
  assert.equal(serialize(deserialize(serialize(state))), serialize(state));
  // The flight leaves a sonobuoy field that keeps listening for a while, then falls silent.
  assert.ok(state.entities.some((e) => e.kind === 'buoys' && e.carrierId === carrier.id));
  while (state.entities.some((e) => e.kind === 'buoys')) state = step(state);
  state = step(state);
  assert.ok(state.contactTracks[carrier.id].find((c) => c.targetId === 'r_razor').stale, 'coverage lasts only as long as the buoys');
});

test('ASW destroyer can ping and attack a submarine, while the carrier cannot ping', () => {
  let state = createGame('northern_screen', 14);
  const escort = ship(state, 'b_meridian');
  Object.assign(escort, { q: 10, r: 8, facing: 0, order: { type: 'hold' } });
  // Two hexes: inside the ASROC's minimum range, so the tubes take the shot.
  Object.assign(ship(state, 'r_razor'), { q: 12, r: 8, order: { type: 'hold' }, noise: 0, quiet: 0, doctrine: { ...ship(state, 'r_razor').doctrine, roe: 'hold' } });
  const ammo = escort.torpedoes;
  state = activePing(state, [escort.id, 'b_steadfast']);
  assert.equal(ship(state, 'b_steadfast').pingAt, -1);
  state = step(state);
  assert.equal(state.contactTracks[escort.id].find((c) => c.targetId === 'r_razor').confidence, 'identified');
  assert.equal(ship(state, escort.id).torpedoes, ammo - 1);
  assert.ok(state.log.some((e) => /ASW torpedo/.test(e.text)));
});

test('escort outcome names its carrier objective rather than the Defector', () => {
  // Find a won and a lost sortie rather than pinning seeds, so balance changes don't break the check.
  const titles = {};
  for (let seed = 1; seed <= 40 && !(titles.victory && titles.defeat); seed += 1) {
    let state = createGame('northern_screen', seed);
    while (!state.outcome) state = step(state);
    titles[state.outcome.result] ??= state.outcome.title;
  }
  assert.equal(titles.victory, 'Escort Reaches Rendezvous');
  assert.equal(titles.defeat, 'Carrier Lost');
});
