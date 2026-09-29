import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getView, issueOrder, step } from '../src/sim/engine.js';
import { captureCommandReceipt, commandReceiptStatus } from '../src/ui/command-feedback.js';

for (const scenario of ['nevis', 'hampton', 'dogger', 'defector', 'northern_screen', 'strait']) {
  test(`${scenario}: receipts distinguish queued from acknowledged using public timing`, () => {
    let state = createGame(scenario, 6);
    const id = getView(state).ships.find(s => s.status === 'active').id;
    const order = { type: 'hold' };
    state = issueOrder(state, [id], order);
    const receipt = captureCommandReceipt(getView(state), [id], order, 1);
    assert.equal(receipt.rejected, false);
    assert.equal(commandReceiptStatus(receipt, getView(state)).phase, 'queued');
    assert.match(commandReceiptStatus(receipt, getView(state)).detail, /delivery T/);
    for (let i = 0; i < 4 && getView(state).pending.some(p => p.shipId === id); i++) state = step(state);
    assert.equal(commandReceiptStatus(receipt, getView(state)).phase, 'acknowledged');
  });
}

test('rejected order never reuses a prior pending signal as confirmation', () => {
  let state = createGame('dogger', 7);
  const id = getView(state).ships[0].id;
  state = issueOrder(state, [id], { type: 'hold' });
  state = issueOrder(state, [id], { type: 'proceed', q: -1, r: 3 });
  const receipt = captureCommandReceipt(getView(state), [id], { type: 'proceed', q: -1, r: 3 }, 2);
  assert.equal(commandReceiptStatus(receipt, getView(state)).phase, 'rejected');
});

test('group receipts show staggered transmission and do not mislabel loss as delivery', () => {
  const view = { tick: 0, ships: [{ id: 'a', name: 'Alpha', status: 'active', order: { type: 'engage' } }, { id: 'b', name: 'Beta', status: 'active', order: { type: 'engage' } }], pending: [{ shipId: 'a', order: { type: 'hold' }, deliverAt: 1 }, { shipId: 'b', order: { type: 'hold' }, deliverAt: 3 }], log: [{ kind: 'order', text: 'Hold ordered' }] };
  const receipt = captureCommandReceipt(view, ['a', 'b'], { type: 'hold' }, 1);
  assert.match(commandReceiptStatus(receipt, view).detail, /T01–T03/);
  const partial = { ...view, tick: 1, ships: [{ ...view.ships[0], order: { type: 'hold' } }, view.ships[1]], pending: [view.pending[1]] };
  assert.match(commandReceiptStatus(receipt, partial).title, /partly/);
  const lost = { ...partial, tick: 3, pending: [], ships: [partial.ships[0], { ...partial.ships[1], status: 'sunk' }] };
  assert.equal(commandReceiptStatus(receipt, lost).phase, 'resolved');
  assert.match(commandReceiptStatus(receipt, lost).detail, /1 unavailable/);
  const replaced = { ...view, pending: view.pending.map(p => ({ ...p, order: { type: 'withdraw' } })) };
  assert.equal(commandReceiptStatus(receipt, replaced).phase, 'superseded');
});
