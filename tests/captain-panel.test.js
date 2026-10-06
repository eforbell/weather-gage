import test from 'node:test';
import assert from 'node:assert/strict';
import { captainStation } from '../src/ui/captain-panel.js';

const view = () => ({
  tick: 2, ships: [{ id: 'own', name: 'Test <ship>', era: 'sail', status: 'active' }],
  contacts: [{ id: 'c_public', name: 'Reported <contact>', confidence: 'identified', q: 3, r: 4, stale: false }],
  captainControl: { shipId: 'own', side: 'blue', plan: { helm: 'hold', targetId: null, weapon: 'hold' } },
  captainOptions: {
    summary: 'Preview only; contacts may change.',
    helm: [{ id: 'hold', label: 'Hold station', enabled: true, reason: 'Stay here.' }, { id: 'ahead', label: 'Ahead', enabled: false, reason: 'Wind prevents this move.' }],
    weapons: [{ id: 'hold', label: 'Hold weapons', enabled: true, reason: 'Wait.' }, { id: 'guns', label: 'Fire guns', enabled: false, reason: 'Designate a contact first.' }],
  },
});

test('station exposes staged choices, not immediate fire controls', () => {
  const html = captainStation(view());
  assert.match(html, /Plan here, then advance one turn/);
  assert.match(html, /data-captain-resolve/);
  assert.match(html, /data-captain-release/);
  assert.match(html, /data-captain-helm="hold" aria-pressed="true"/);
  assert.match(html, /data-captain-weapon="guns"[^>]*disabled/);
  assert.match(html, /Designate a contact first/);
  assert.match(html, /Wind prevents this move/);
  assert.match(html, /Captain's station for Test &lt;ship&gt;/);
  assert.match(html, /Reported &lt;contact&gt;/);
  assert.doesNotMatch(html, /data-captain-weapon="torpedoes"/);
});

test('chart and immersive station labels have separate IDs', () => {
  const state = view();
  assert.match(captainStation(state), /for="captain-target"/);
  assert.match(captainStation(state, { prefix: 'bridge', compact: true }), /for="bridge-target"/);
  assert.match(captainStation(state, { compact: true }), /captain-station compact/);
});

test('stale chosen report remains labelled but cannot become a fresh target', () => {
  const state = view();
  state.contacts[0].stale = true;
  state.captainControl.plan.targetId = 'c_public';
  const html = captainStation(state);
  assert.match(html, /value="c_public" selected>Reported &lt;contact&gt; · last known/);
  assert.equal((html.match(/value="c_public"/g) || []).length, 1);
});

test('no station without a commanded vessel and public options', () => {
  assert.equal(captainStation({ ships: [], contacts: [] }), '');
  const state = view();
  delete state.captainOptions;
  assert.equal(captainStation(state), '');
});
