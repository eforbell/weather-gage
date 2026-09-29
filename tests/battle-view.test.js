import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getView, step } from '../src/sim/engine.js';
import { renderBattleScene } from '../src/ui/battle-view.js';

test('battle view draws only the selected ship picture, not hidden enemy truth', () => {
  const state = createGame('dogger', 3);
  const view = getView(state);
  assert.equal(view.contacts.length, 0);
  const scene = renderBattleScene(view, { selectedId: view.ships[0].id, era: 'dreadnought' });
  assert.equal(scene.visibleContacts, 0);
  assert.match(scene.svg, /battle-ship own/);
  for (const enemy of state.ships.filter(s => s.side === 'red')) assert.ok(!scene.svg.includes(enemy.name));
});

test('reported positions remain uncertain until identified and names are escaped', () => {
  let state = createGame('dogger', 3);
  while (!getView(state).contacts.length && !state.outcome) state = step(state);
  const view = getView(state);
  const contact = { ...view.contacts[0], stale: true, confidence: 'classified', name: '<script>alert(1)</script>', className: 'Unknown' };
  const scene = renderBattleScene({ ...view, contacts: [contact] }, { selectedId: view.ships[0].id, era: 'dreadnought' });
  assert.match(scene.svg, /LAST KNOWN/);
  assert.match(scene.svg, /bv-uncertainty/);
  assert.ok(!scene.svg.includes('<script>'));
  assert.ok(!scene.svg.includes(contact.name));
});

test('battle view accepts per-side combat effects without changing the simulation', () => {
  const state = createGame('dogger', 11);
  const view = getView(state);
  const before = JSON.stringify(state);
  const effect = { type: 'salvo', from: view.ships[0], to: view.ships[1], hits: 1 };
  const scene = renderBattleScene(view, { selectedId: view.ships[0].id, era: 'dreadnought', effects: [effect] });
  assert.match(scene.svg, /bv-impact/);
  assert.equal(JSON.stringify(state), before);
});

test('reported-contact count respects narrow viewport cropping', () => {
  const view = getView(createGame('dogger', 2));
  const focus = view.ships[0];
  const contact = { id: 'reported', q: focus.q + 5, r: focus.r, confidence: 'sighted', className: 'Unknown', stale: false };
  const wide = renderBattleScene({ ...view, contacts: [contact] }, { selectedId: focus.id, era: 'dreadnought' });
  const narrow = renderBattleScene({ ...view, contacts: [contact] }, { selectedId: focus.id, era: 'dreadnought', aspectRatio: 390 / 340 });
  assert.equal(wide.visibleContacts, 1);
  assert.equal(narrow.visibleContacts, 0);
});
