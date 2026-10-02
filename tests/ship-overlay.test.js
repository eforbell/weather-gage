import test from 'node:test';
import assert from 'node:assert/strict';
import { referencePlacement } from '../scripts/ship-reference-overlay.mjs';

const view = { pxPerMeter: 8, bowX: 64, anchorY: 200 };
test('reference calibration uses source pixels after a nonzero crop', () => {
  const p = referencePlacement({ bowX: 120, sternX: 920, waterlineY: 180, crop: [100, 50, 850, 240], view: 'profile' }, view, 200);
  assert.equal(p.scale, 2);
  assert.equal(p.flop, false);
  assert.equal(p.x, 24);
  assert.equal(p.y, -60);
});
test('bow-right dockyard references are flopped without mirroring model coordinates', () => {
  const p = referencePlacement({ bowX: 920, sternX: 120, centerlineY: 180, crop: [100, 50, 850, 240], view: 'plan' }, view, 200);
  assert.equal(p.scale, 2);
  assert.equal(p.flop, true);
  assert.equal(p.x, 6); // crop local bow 820 becomes 849 - 820 = 29
  assert.equal(p.flip, true);
  assert.equal(p.y, -18); // rotate the plan, preserving physical port/starboard
});
test('uncalibrated or zero-length references cannot produce an overlay', () => {
  for (const ref of [{}, { bowX: 10, sternX: 10, waterlineY: 0, view: 'profile' }, { bowX: 0, sternX: 10, view: 'plan' }]) assert.equal(referencePlacement(ref, view, 200), null);
});
