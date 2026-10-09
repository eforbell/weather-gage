import test from 'node:test';
import assert from 'node:assert/strict';
import { captainReport, xoReport } from '../src/ui/captain-feedback.js';

const sailShip = (patch = {}) => ({
  id: 'b_nevis',
  name: 'Nevis',
  era: 'sail',
  status: 'active',
  q: 3,
  r: 4,
  facing: 1,
  hull: 100,
  propulsion: 100,
  weapons: 100,
  crew: 100,
  reloadUntil: 0,
  order: { type: 'engage' },
  doctrine: { roe: 'free', range: 3, withdraw: 25 },
  ...patch,
});

const dreadShip = (patch = {}) => ({
  id: 'b_lion',
  name: 'Lion',
  era: 'dreadnought',
  status: 'active',
  q: 4,
  r: 5,
  facing: 0,
  hull: 100,
  propulsion: 100,
  weapons: 100,
  crew: 100,
  reloadUntil: 0,
  order: { type: 'engage' },
  doctrine: { roe: 'free', range: 6, withdraw: 25 },
  fc: { targetId: null, level: 0 },
  ...patch,
});

const view = (ship, patch = {}) => ({
  version: 1,
  scenarioId: ship.era === 'sail' ? 'nevis' : 'dogger',
  tick: 2,
  ships: [ship],
  contacts: [],
  pending: [],
  log: [],
  ...patch,
});

test('captain report explains Engage with no contacts as intent, not hidden execution', () => {
  const report = captainReport(view(sailShip()), 'b_nevis');
  assert.match(report.title, /Nevis captain: Engage/);
  assert.match(report.detail, /No contacts/);
  assert.match(report.detail, /search\/closing intention/);
  assert.doesNotMatch(JSON.stringify(report), /targetId|lastKnown|hidden|failure/i);
  assert.ok(report.detail.split(/\s+/).length < 55);
});

test('captain report treats stale contacts as estimates rather than current truth', () => {
  const report = captainReport(view(sailShip(), {
    contacts: [{ id: 'C-7', q: 8, r: 4, confidence: 'sighted', stale: true, lastSeen: 1, className: 'frigate' }],
  }), 'b_nevis');
  assert.match(report.detail, /No fresh contact reports/);
  assert.match(report.detail, /places to investigate/);
  assert.doesNotMatch(report.detail, /confirmed current/);
  assert.ok(report.detail.split(/\s+/).length < 55);
});

test('captain report distinguishes Hold movement from ROE Hold Fire', () => {
  const report = captainReport(view(sailShip({ order: { type: 'hold' }, doctrine: { roe: 'hold', range: 3, withdraw: 25 } })), 'b_nevis');
  assert.match(report.detail, /stop movement/);
  assert.match(report.detail, /Hold Fire/);
  assert.match(report.lesson, /Hold stops movement/);
  assert.match(report.lesson, /Rules of Engagement decide/);
  assert.ok(report.detail.split(/\s+/).length < 55);
});

test('captain report calls out pending order delivery separately from current order', () => {
  const report = captainReport(view(sailShip({ order: { type: 'engage' } }), {
    tick: 2,
    pending: [{ shipId: 'b_nevis', order: { type: 'hold' }, deliverAt: 4 }],
  }), 'b_nevis');
  assert.match(report.detail, /Hold signal is still in transit at T04/);
  assert.match(report.detail, /current behavior follows the acknowledged order/);
  assert.ok(report.detail.split(/\s+/).length < 55);
});

test('captain report covers dreadnought reload and ranging without true identity', () => {
  const report = captainReport(view(dreadShip({ reloadUntil: 5, fc: { targetId: 'R-1', level: 1 } }), {
    contacts: [{ id: 'R-1', q: 9, r: 5, confidence: 'classified', stale: false, className: 'battlecruiser', targetId: 'red_real_id' }],
  }), 'b_lion');
  assert.match(report.detail, /Torpedoes are cooling down until T05/);
  assert.doesNotMatch(report.detail, /Main weapons|main guns|reloading/);
  assert.match(report.lesson, /same reported target helps fire control/);
  assert.doesNotMatch(JSON.stringify(report), /red_real_id|targetId/);
  assert.ok(report.detail.split(/\s+/).length < 55);
});


test('captain report status-gates inactive selected vessels', () => {
  for (const status of ['sunk', 'struck', 'escaped', 'reserve']) {
    const report = captainReport(view(sailShip({ status, order: { type: 'withdraw' } })), 'b_nevis');
    assert.match(report.title, new RegExp(status));
    assert.match(report.detail, /no new maneuver or fire|no new maneuver or fire is possible|Not yet in action/);
    assert.match(report.detail, /Last standing order shown: Withdraw/);
    assert.doesNotMatch(report.detail, /Captain intends/);
    assert.match(report.lesson, /roster for awareness/);
    assert.ok(report.detail.split(/\s+/).length < 55);
  }
});

test('XO report mirrors engine summary, planned helm, target, and resolution report', () => {
  const report = xoReport({
    ships: [sailShip()],
    contacts: [{ id: 'C-2', q: 6, r: 4, confidence: 'sighted', stale: false, className: 'frigate' }],
    captainControl: { side: 'blue', shipId: 'b_nevis', plan: { helm: 'port', targetId: 'C-2', weapon: 'guns' }, report: 'Broadside held for resolution.' },
    captainOptions: {
      summary: 'Nevis can turn or hold this tick.',
      helm: [{ id: 'port', label: 'Port turn', enabled: true }, { id: 'starboard', label: 'Starboard turn', enabled: false, reason: 'Shoal water blocks the turn.' }],
      weapons: [{ id: 'guns', label: 'Fire broadside', enabled: true }, { id: 'hold', label: 'Hold fire', enabled: true }],
    },
  });
  assert.match(report.detail, /Nevis can turn or hold/);
  assert.doesNotMatch(report.detail, /Helm: Port turn/);
  assert.doesNotMatch(report.detail, /Weapon: Fire broadside/);
  assert.doesNotMatch(report.detail, /Target: frigate/);
  assert.match(report.detail, /Last turn: Broadside held/);
  assert.match(report.lesson, /Port is left/);
  assert.match(report.lesson, /Broadsides fire off the beam/);
  assert.match(report.lesson, /rakes her/);
  assert.match(report.lesson, /chain cuts rigging/);
  assert.doesNotMatch(report.lesson, /Dreadnought turrets/);
  assert.ok(report.detail.split(/\s+/).length < 85);
});

test('XO dreadnought gun lesson uses turret arcs, not sail broadside wording', () => {
  const report = xoReport({
    ships: [dreadShip()],
    captainControl: { side: 'blue', shipId: 'b_lion', plan: { helm: 'ahead', targetId: 'D-1', weapon: 'guns' } },
    captainOptions: {
      summary: 'Lion can hold course for a salvo.',
      helm: [{ id: 'ahead', label: 'Ahead', enabled: true }],
      weapons: [{ id: 'guns', label: 'Fire guns', enabled: true }],
    },
    contacts: [{ id: 'D-1', q: 6, r: 5, confidence: 'sighted', stale: false, className: 'battlecruiser' }],
  });
  assert.match(report.lesson, /Turrets bear fully abeam/);
  assert.match(report.lesson, /cross her T/);
  assert.doesNotMatch(report.lesson, /broadside/);
  assert.ok(report.detail.split(/\s+/).length < 85);
});

test('XO report uses option reasons without recomputing validity math', () => {
  const report = xoReport({
    captainControl: { side: 'blue', shipId: 'b_lion', plan: { helm: 'starboard', targetId: null, weapon: 'torpedoes' } },
    captainOptions: {
      summary: 'Plan a destroyer attack.',
      helm: [{ id: 'starboard', label: 'Starboard', enabled: false, reason: 'Minefield blocks that heading.' }],
      weapons: [{ id: 'torpedoes', label: 'Loose torpedoes', enabled: false, reason: 'No public target selected.' }],
    },
  });
  assert.match(report.detail, /Starboard unavailable: Minefield blocks that heading/);
  assert.match(report.detail, /Loose torpedoes unavailable: No public target selected/);
  assert.match(report.forecastNote, /Forecasts use your own reports/);
  assert.match(report.detail, /Standing orders: Plan a destroyer attack/);
  assert.match(report.lesson, /starboard right/);
  assert.ok(report.detail.split(/\s+/).length < 85);
});


test('XO no-plan lesson is player-facing, not implementation-facing', () => {
  const report = xoReport({ captainOptions: { summary: 'Take command of a vessel to plan its turn.' } });
  assert.match(report.detail, /Take command of a vessel/);
  assert.match(report.lesson, /Choose a helm intention and reported target/);
  assert.doesNotMatch(report.lesson, /engine options|helper|implementation/i);
});

test('captain feedback serialization is independent of hidden-state shaped extras', () => {
  const publicView = view(sailShip({ propulsion: 50 }), {
    contacts: [{ id: 'C-1', q: 7, r: 4, confidence: 'sighted', stale: false, className: 'frigate' }],
  });
  const leakyShape = {
    ...publicView,
    hiddenEnemyState: { id: 'r_secret', hull: 1, q: 9, r: 9 },
    contacts: publicView.contacts.map((c) => ({ ...c, targetId: 'r_secret', trueName: 'Hidden Enemy' })),
  };
  assert.deepEqual(captainReport(publicView, 'b_nevis'), captainReport(leakyShape, 'b_nevis'));
});
