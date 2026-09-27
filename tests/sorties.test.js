import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, issueOrder, setRadar, getView, serialize, deserialize } from '../src/sim/engine.js';
import { SCENARIOS } from '../src/sim/scenarios.js';

for (const scenario of SCENARIOS) {
  for (const seed of [1, 42, 1799, 2026]) {
    test(`${scenario.id}: complete deterministic sortie, seed ${seed}`, () => {
      let state = createGame(scenario.id, seed);
      const own = getView(state).ships.map(s => s.id);
      if (scenario.era === 'modern') state = setRadar(state, [own[0]], true);
      let combatEvents = 0;
      while (!state.outcome && state.tick <= scenario.maxTicks) {
        const before = serialize(state);
        const next = step(state);
        assert.equal(serialize(state), before, 'step preserves its input');
        assert.equal(serialize(step(deserialize(before))), serialize(next), 'loaded games produce the same next tick');
        state = next;
        combatEvents += state.log.filter(e => e.kind === 'combat' && e.tick === state.tick).length;
        for (const side of ['blue', 'red']) {
          const view = getView(state, side);
          assert.ok(view.ships.every(s => s.side === side));
          assert.ok(view.contacts.every(c => !('hull' in c) && !('targetId' in c)));
          assert.ok(view.pending.every(p => p.order && !('targetId' in p)));
        }
        for (const ship of state.ships) {
          assert.ok(ship.q >= 0 && ship.q < state.map.width && ship.r >= 0 && ship.r < state.map.height);
          assert.ok(ship.ammo >= 0 && ship.defense >= 0);
        }
      }
      assert.ok(state.outcome, 'sortie terminates');
      assert.ok(combatEvents > 0, 'default captains find and engage contacts');
      assert.equal(serialize(step(state)), serialize(state), 'terminal games cannot keep ticking');
    });
  }
}

test('command changes, formations and edge withdrawal remain serializable across both eras', () => {
  for (const scenario of SCENARIOS) {
    let state = createGame(scenario.id, 81);
    const ids = getView(state).ships.map(s => s.id);
    for (const order of [{ type: 'line' }, { type: 'screen' }, { type: 'hold' }, { type: 'proceed', q: 0, r: 13 }, { type: 'withdraw' }]) {
      state = issueOrder(state, ids, order);
      for (let i = 0; i < 4 && !state.outcome; i++) state = step(state);
      assert.equal(serialize(deserialize(serialize(state))), serialize(state));
    }
  }
});
