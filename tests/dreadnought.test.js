import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, deserialize, getView, issueOrder, serialize, step } from '../src/sim/engine.js';
import { movesThisTick } from '../src/sim/eras/dreadnought.js';
import { contactId } from '../src/sim/core.js';

const ship = (state, id) => state.ships.find((s) => s.id === id);
const runTo = (state, tick) => { while (state.tick < tick && !state.outcome) state = step(state); return state; };

test('speed classes: destroyers outrun battlecruisers, which outrun battleships', () => {
  const state = createGame('dogger', 5);
  const over4 = (id) => [1, 2, 3, 4].reduce((sum, tick) => sum + movesThisTick({ ...state, tick }, ship(state, id)), 0);
  assert.equal(over4('b_orion'), 4);
  assert.equal(over4('b_lion'), 6);
  assert.equal(over4('b_meteor'), 8);
  const crippled = { ...ship(state, 'b_meteor'), propulsion: 10 };
  assert.equal(movesThisTick({ ...state, tick: 1 }, crippled), 0, 'crippled engines crawl at half a hex per tick');
});

test('fire control builds on one target and a battle produces salvo, torpedo and loss effects', () => {
  let state = createGame('dogger', 3);
  const types = new Set();
  let maxLevel = 0;
  while (!state.outcome) {
    state = step(state);
    for (const e of state.fx) for (const side of ['blue', 'red']) if (e[side]) types.add(e[side].type);
    for (const s of state.ships) if (s.fc) maxLevel = Math.max(maxLevel, s.fc.level);
  }
  assert.ok(types.has('salvo'));
  assert.ok(types.has('torpedo'));
  assert.ok(types.has('sunk') || types.has('struck') || types.has('magazine'));
  assert.equal(maxLevel, 3, 'sustained fire reaches full ranging');
});

test('fx are per-side views: exact damage only on own ships, no enemy truth ids', () => {
  let state = createGame('dogger', 11);
  let seen = 0;
  for (let i = 0; i < 20 && !state.outcome; i++) {
    state = step(state);
    for (const side of ['blue', 'red']) {
      for (const f of getView(state, side).fx) {
        seen += 1;
        if (f.damage !== undefined) assert.equal(f.to.own, true, 'damage numbers only for own ships');
        for (const ref of [f.from, f.to]) if (ref && !ref.own) assert.match(ref.id, new RegExp(`^c_${side}_`));
      }
    }
  }
  assert.ok(seen > 10, 'the player view actually carries combat effects');
});

test('wireless orders reveal the flagship bearing to a distant enemy', () => {
  let state = createGame('dogger', 1);
  assert.equal(getView(state, 'red').contacts.length, 0);
  state = issueOrder(state, ['b_meteor'], { type: 'hold' });
  assert.equal(ship(state, 'b_lion').emitUntil, 1);
  state = step(state);
  const bearing = getView(state, 'red').contacts.find((c) => c.id === contactId(state, 'red', 'b_lion'));
  assert.ok(bearing, 'flagship transmission is detected');
  assert.equal(bearing.emitter, true);
});

test('torpedoes in flight survive save/load and resolve deterministically', () => {
  let state = createGame('dogger', 3);
  while (!state.pending.some((p) => p.kind === 'torpedo') && !state.outcome) state = step(state);
  assert.ok(state.pending.some((p) => p.kind === 'torpedo'), 'a torpedo spread is launched');
  const loaded = deserialize(serialize(state));
  assert.equal(serialize(runTo(loaded, state.tick + 4)), serialize(runTo(state, state.tick + 4)));
});

test('invalid dreadnought saves are rejected', () => {
  const bad = (mutate) => { const s = JSON.parse(serialize(createGame('dogger', 2))); mutate(s); return () => deserialize(JSON.stringify(s)); };
  assert.throws(bad((s) => { s.ships[0].type = 'submarine'; }), /ship type/);
  assert.throws(bad((s) => { s.ships[0].fc.level = 9; }), /fire control/);
  assert.throws(bad((s) => { s.map.terrain[0].type = 'lava'; }), /terrain/);
  assert.throws(bad((s) => { s.pending.push({ kind: 'torpedo', shipId: 'b_meteor', targetId: 'r_posen', side: 'blue', salvo: 1, deliverAt: 3, q: 1, r: 1, aimQ: 99, aimR: 1 }); }), /coordinate/);
});

test('saves from before the fx channel still load', () => {
  const state = JSON.parse(serialize(createGame('nevis', 4)));
  delete state.fx;
  assert.deepEqual(deserialize(JSON.stringify(state)).fx, []);
});

test('captains do not steer into declared minefields on their own', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    let state = createGame('dogger', seed);
    while (!state.outcome) {
      state = step(state);
      assert.ok(!state.fx.some((e) => (e.blue || e.red)?.type === 'mine'), `seed ${seed} tick ${state.tick}: mine strike without orders`);
    }
  }
});

test('losses on unidentified enemies never reach the player as named events', () => {
  for (const scenario of ['nevis', 'dogger', 'strait']) {
    for (const seed of [1, 6, 42]) {
      let state = createGame(scenario, seed);
      let seen = 0;
      while (!state.outcome) {
        state = step(state);
        const view = getView(state, 'blue');
        seen += view.fx.length;
        for (const f of view.fx) {
          if (!f.to || f.to.own) continue;
          const contact = view.contacts.find((c) => c.id === f.to.id);
          if (['sunk', 'struck', 'magazine', 'torpedo-hit', 'torpedo-miss', 'mine', 'missile-hit', 'intercept', 'aground'].includes(f.type)) {
            assert.equal(contact?.confidence, 'identified', `${scenario}/${seed} T${state.tick}: ${f.type} on unidentified contact`);
          }
        }
      }
      assert.ok(seen > 0, `${scenario}/${seed}: effects reached the player view`);
    }
  }
});

test('dogger is won by removing the enemy capital ships, not every torpedo boat', () => {
  const state = createGame('dogger', 8);
  for (const s of state.ships) if (s.side === 'red' && s.type !== 'destroyer') { s.status = 'sunk'; s.hull = 0; }
  const next = step(state);
  assert.equal(next.outcome?.result, 'victory');
});

test('corrupt fx in a save is rejected', () => {
  for (const fx of [[null], [{ blue: { type: 'salvo', from: { q: 'x' } }, red: null }], [{ blue: { type: 'salvo', hits: 'many' }, red: null }]]) {
    const s = JSON.parse(serialize(createGame('dogger', 2)));
    s.fx = fx;
    assert.throws(() => deserialize(JSON.stringify(s)), /fx|coordinate/);
  }
});

test('the target of a torpedo attack never learns the aim point', () => {
  let state = createGame('dogger', 3);
  let checked = 0;
  while (!state.outcome) {
    state = step(state);
    for (const side of ['blue', 'red']) {
      for (const f of getView(state, side).fx) {
        if (f.type !== 'torpedo') continue;
        checked += 1;
        if (f.from?.own) assert.ok(f.at, 'the launching side sees its own aim');
        else assert.equal(f.at, undefined, 'the target side only knows torpedoes are running');
      }
    }
  }
  assert.ok(checked > 0);
});
