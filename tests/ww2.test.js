// Second World War rules (src/sim/eras/ww2.js) and the dockyard scenario that
// exercises them, Night off Cape Esperance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, getView, setRadar, serialize, deserialize } from '../src/sim/engine.js';
import { SCENARIOS, DOCKYARD_SCENARIOS } from '../src/sim/scenarios.js';
import { radarReach, radarEcho, intercept, optical, firingSolution, detection, TORPEDOES, RADARS, lightAt } from '../src/sim/eras/ww2.js';

const ship = (s, id) => s.ships.find((x) => x.id === id);
// Open water well clear of Savo and Guadalcanal, so no land clutter.
function placed(pairs) {
  const s = createGame('esperance', 7);
  for (const [id, q, r] of pairs) Object.assign(ship(s, id), { q, r });
  return s;
}

test('the WWII scenario is in the dockyard, not the launcher', () => {
  assert.ok(!SCENARIOS.some((s) => s.era === 'ww2'));
  assert.deepEqual(DOCKYARD_SCENARIOS.map((s) => [s.id, s.era]), [['esperance', 'ww2']]);
  assert.equal(lightAt(createGame('esperance', 1)), 'night');
});

test('search radar reach depends on the set, the hull, emission and land behind the echo', () => {
  const s = placed([['b_boise', 9, 7], ['r_aoba', 22, 7], ['r_fubuki', 20, 7]]);
  const boise = ship(s, 'b_boise');
  assert.equal(radarReach(boise, ship(s, 'r_aoba'), s), RADARS.sg.range.large);
  assert.equal(radarReach(boise, ship(s, 'r_fubuki'), s), RADARS.sg.range.small);
  assert.equal(radarEcho(boise, ship(s, 'r_aoba'), s)?.confidence, 'sighted', 'a blip at 13 miles has no class yet');
  boise.radar = false;
  assert.equal(radarReach(boise, ship(s, 'r_aoba'), s), 0, 'a silent set sees nothing');
  boise.radar = true;
  Object.assign(ship(s, 'r_aoba'), { q: 11, r: 3 }); // next to Savo Island
  assert.equal(radarReach(boise, ship(s, 'r_aoba'), s), Math.ceil(RADARS.sg.range.large / 2), 'the island swamps the echo');
});

test('a warning receiver hears only the bands it covers (Metox could not hear centimetric radar)', () => {
  const s = placed([['b_boise', 6, 7], ['b_san_francisco', 8, 9], ['r_aoba', 22, 7]]);
  const aoba = ship(s, 'r_aoba');
  aoba.sensors.esm = 'metric';
  assert.equal(intercept(aoba, ship(s, 'b_boise'), s), null, 'SG is centimetric: unheard');
  assert.equal(intercept(aoba, ship(s, 'b_san_francisco'), s)?.confidence, 'sighted', 'SC is metric: heard at 14 miles, beyond its own 10');
  assert.ok(intercept(aoba, ship(s, 'b_san_francisco'), s).uncertainty > 0, 'a bearing, not a fix');
  aoba.sensors.esm = 'cm';
  assert.ok(intercept(aoba, ship(s, 'b_boise'), s));
  assert.equal(detection(ship(s, 'r_aoba'), ship(s, 'b_boise'), s).emitter, true, 'only a receiver that hears her knows she is radiating');
  aoba.sensors.esm = null;
  assert.equal(detection(ship(s, 'r_aoba'), ship(s, 'b_boise'), s), null);
});

test('at night trained lookouts see further, and gun flashes give a ship away', () => {
  const s = placed([['b_boise', 12, 7], ['r_aoba', 17, 7]]);
  const [boise, aoba] = [ship(s, 'b_boise'), ship(s, 'r_aoba')];
  assert.equal(optical(aoba, boise, s)?.confidence, 'classified', 'a night-trained lookout makes out a cruiser at 5 miles');
  assert.equal(optical(boise, aoba, s), null, 'an untrained one sees nothing');
  boise.firedAt = s.tick;
  assert.equal(optical(aoba, boise, s)?.confidence, 'classified');
  Object.assign(aoba, { q: 21 });
  assert.equal(optical(aoba, boise, s)?.confidence, 'sighted', 'flashes on the horizon at 9 miles');
});

test('radar fire control lays guns in the dark; optical guns need the target lit', () => {
  const s = placed([['b_boise', 12, 7], ['b_san_francisco', 12, 9], ['r_aoba', 20, 7]]);
  const aoba = ship(s, 'r_aoba');
  assert.equal(firingSolution(s, ship(s, 'b_boise'), aoba), 'radar');
  assert.equal(firingSolution(s, ship(s, 'b_san_francisco'), aoba), null, 'SC search radar but no fire-control set');
  aoba.illuminatedUntil = s.tick;
  assert.equal(firingSolution(s, ship(s, 'b_san_francisco'), aoba), 'visual', 'starshell over the target');
  const silent = setRadar(s, ['b_boise'], false);
  assert.equal(firingSolution(silent, ship(silent, 'b_boise'), ship(silent, 'r_aoba')), 'visual', 'radar off: back to laying by eye on the lit target');
});

test('emission control applies only to ships that carry a search radar', () => {
  let s = createGame('esperance', 3);
  assert.equal(ship(s, 'b_boise').radar, true, 'radar ships start radiating');
  s = setRadar(s, ['b_boise', 'b_duncan'], false);
  assert.equal(ship(s, 'b_boise').radar, false);
  s = setRadar(s, ['b_duncan'], true);
  assert.equal(ship(s, 'b_duncan').radar, false, 'Duncan has no set to switch on');
  const bad = JSON.parse(serialize(s));
  bad.ships.find((x) => x.id === 'b_duncan').radar = true;
  assert.throws(() => deserialize(JSON.stringify(bad)), /cannot radiate/);
});

test('the Long Lance outreaches the American torpedo, and launching shows no flash', () => {
  assert.ok(TORPEDOES.type93.range >= 2 * TORPEDOES.mk15.range);
  let s = placed([['r_fubuki', 14, 7], ['b_boise', 21, 7]]);
  for (const x of s.ships) if (!['r_fubuki', 'b_boise'].includes(x.id)) Object.assign(x, { status: 'escaped' });
  ship(s, 'b_boise').firedAt = s.tick; // her gun flashes give Fubuki a bearing
  s = step(s);
  const fubuki = ship(s, 'r_fubuki');
  const spread = s.pending.find((p) => p.kind === 'torpedo' && p.shipId === 'r_fubuki');
  assert.ok(spread, 'fired at a contact 7 miles off');
  assert.equal(spread.weapon, 'type93');
  assert.ok(fubuki.firedAt < s.tick || s.log.some((e) => e.tick === s.tick && /Fubuki (opens|fires starshell)/.test(e.text)), 'only gunfire or starshell flashes');
});

test('radar contacts never carry a name: identity needs eyes', () => {
  const s = placed([['b_boise', 6, 7], ['r_aoba', 18, 7]]);
  const view = getView(s, 'blue');
  for (const c of view.contacts.filter((x) => x.confidence !== 'identified')) assert.equal(c.name, undefined);
  assert.ok(view.contacts.length > 0, 'the SG set holds the Japanese force at long range');
});

test('a raid needs its ships to arrive; turning back off the chart is not arriving', () => {
  let s = createGame('esperance', 11);
  for (const id of ['r_aoba', 'r_furutaka']) Object.assign(ship(s, id), { status: 'escaped' }); // withdrew, did not arrive
  s = step(s);
  assert.equal(s.outcome?.result, 'victory');
  assert.match(s.outcome.title, /Turned Back/);
  let t = createGame('esperance', 11);
  for (const id of ['r_aoba', 'r_furutaka']) Object.assign(ship(t, id), { status: 'escaped', arrived: true });
  t = step(t);
  assert.equal(t.outcome?.result, 'defeat');
  assert.match(t.outcome.title, /Shelled/);
});

test('the dockyard sortie runs to a deterministic outcome and survives save and load', () => {
  const run = (seed) => {
    let s = createGame('esperance', seed);
    while (!s.outcome) {
      s = step(s);
      if (s.tick === 4) s = deserialize(serialize(s));
    }
    return s;
  };
  const a = run(21), b = run(21);
  assert.deepEqual(a.outcome, b.outcome);
  assert.equal(a.tick, b.tick);
  assert.ok(a.log.some((e) => /radar-directed/.test(e.text)), 'the SG cruisers fight by radar');
});

test('a closer glimpse does not replace a clearer radar track in the side picture', () => {
  let s = placed([['b_boise', 10, 7], ['r_aoba', 19, 7], ['b_duncan', 15, 7]]);
  for (const x of s.ships) { x.order = { type: 'hold' }; x.doctrine.roe = 'hold'; if (!['b_boise', 'r_aoba', 'b_duncan'].includes(x.id)) x.status = 'escaped'; }
  s = step(s); // re-sense from these positions; nobody moves or fires
  const aoba = s.contacts.blue.find((c) => c.targetId === 'r_aoba');
  assert.equal(aoba?.confidence, 'classified', 'Boise’s SG classifies Aoba at 9 miles even with Duncan’s lookout closer');
  assert.equal(aoba.className, 'Heavy cruiser');
});

test('a spread fired at gun flashes is aimed at the flash, not at where the target truly is', () => {
  let s = placed([['r_fubuki', 13, 7], ['b_boise', 21, 7]]);
  for (const x of s.ships) if (!['r_fubuki', 'b_boise'].includes(x.id)) Object.assign(x, { status: 'escaped' });
  for (const id of ['r_fubuki', 'b_boise']) ship(s, id).order = { type: 'hold' }; // stay 8 miles apart: beyond Fubuki's lookouts
  ship(s, 'b_boise').firedAt = s.tick;
  s = step(s);
  const spread = s.pending.find((p) => p.kind === 'torpedo' && p.shipId === 'r_fubuki');
  const contact = s.contacts.red.find((c) => c.targetId === 'b_boise');
  assert.ok(spread && contact);
  assert.deepEqual([spread.aimQ, spread.aimR], [contact.q, contact.r], 'no course from a flash, so no lead');
  assert.equal(getView(s, 'blue').fx.some((e) => e.type === 'torpedo'), false, 'the target side does not see the launch');
});

test('saves reject malformed goals, arrivals and torpedo weapons', () => {
  const s = createGame('esperance', 5);
  const broken = (mutate) => { const j = JSON.parse(serialize(s)); mutate(j); return () => deserialize(JSON.stringify(j)); };
  assert.throws(broken((j) => { j.ships.find((x) => x.id === 'r_aoba').goal = 'abc'; }), /goal/);
  assert.throws(broken((j) => { j.ships.find((x) => x.id === 'r_aoba').arrived = true; }), /arrived/);
  assert.throws(broken((j) => { j.ships.find((x) => x.id === 'r_aoba').goalText = 7; }), /goal text/);
  assert.throws(broken((j) => { j.pending.push({ kind: 'torpedo', shipId: 'r_fubuki', targetId: 'b_boise', side: 'red', salvo: 1, deliverAt: 2, q: 20, r: 1, aimQ: 10, aimR: 8, weapon: 'photon' }); }), /weapon/);
});
