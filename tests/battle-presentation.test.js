import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getView } from '../src/sim/engine.js';
import { battleActors } from '../src/ui/battle-presentation.js';

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
