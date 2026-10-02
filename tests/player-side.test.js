import test from 'node:test';
import assert from 'node:assert/strict';
import { outcomeFor, playerSideFor, requestedSide } from '../src/ui/player-side.js';
import { SCENARIOS, SCENARIO_SETUPS } from '../src/sim/scenarios.js';
import { createGame, getView, issueOrder, step } from '../src/sim/engine.js';

const sideIn = (id, requested) => playerSideFor(SCENARIOS.find(s => s.id === id), SCENARIO_SETUPS[id], requested);

test('the ?side= backdoor reads the query string and defaults to blue', () => {
  assert.equal(requestedSide('?side=red'), 'red');
  assert.equal(requestedSide(''), null);
  assert.equal(sideIn('dogger', null), 'blue');
  assert.equal(sideIn('dogger', 'red'), 'red');
  assert.equal(sideIn('dogger', 'green'), 'blue', 'unknown side');
  assert.equal(sideIn('dogger', 'RED'), 'blue', 'exact match only');
});

test('only two-sided scenarios without an escort objective can be played as red', () => {
  const playable = SCENARIOS.filter(s => sideIn(s.id, 'red') === 'red').map(s => s.id).sort();
  assert.deepEqual(playable, ['dogger', 'hampton', 'nevis', 'strait']);
  assert.equal(sideIn('defector', 'red'), 'blue', 'three-sided');
  assert.equal(sideIn('northern_screen', 'red'), 'blue', 'escort objective');
});

test('outcomes are restated from the commanded side', () => {
  const won = { result: 'victory', title: 'Enemy Squadron Defeated', summary: 's' };
  assert.equal(outcomeFor(won, 'blue'), won);
  assert.deepEqual(outcomeFor(won, 'red'), { result: 'defeat', title: 'Squadron Lost', summary: 's' });
  assert.deepEqual(outcomeFor({ result: 'defeat', title: 'Unfavorable Dispatch' }, 'red'), { result: 'victory', title: 'Favorable Dispatch' });
  assert.deepEqual(outcomeFor({ result: 'draw', title: 'Mutual Destruction' }, 'red'), { result: 'draw', title: 'Mutual Destruction' });
  assert.equal(outcomeFor(null, 'red'), null);
});

test('the engine takes red orders and keeps red fog of war', () => {
  let state = createGame('dogger', 1915);
  const view = getView(state, 'red', 'r_seydlitz');
  assert.ok(view.ships.length && view.ships.every(s => s.side === 'red'), 'red sees its own squadron');
  assert.ok(view.ships.some(s => s.id === 'r_seydlitz'));
  assert.ok(!view.contacts.some(c => c.id === 'b_lion'), 'contacts never expose true ids');
  // Left alone she steams to engage; a red Hold order must stop her.
  const where = s => { const ship = getView(s, 'red', 'r_seydlitz').ships.find(x => x.id === 'r_seydlitz'); return `${ship.q},${ship.r}`; };
  let free = state, held = issueOrder(state, ['r_seydlitz'], { type: 'hold' });
  for (let i = 0; i < 4; i++) { free = step(free); held = step(held); }
  assert.notEqual(where(free), '16,4', 'unordered Seydlitz moves');
  assert.equal(where(held), '16,4', 'red Hold order is obeyed');
});
