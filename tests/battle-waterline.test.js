import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { anchorSurfaceFoam } from '../src/ui/battle-waterline.js';

test('foam stays on the sea with heading preserved under hull motion', () => {
  const model = new Group(), wake = new Group(), foam = new Group();
  model.rotation.order = 'YXZ';
  model.rotation.set(0.15, 1.2, -0.12);
  model.position.set(2, 0.2, 3);
  model.add(wake, foam);
  model.userData.wake = wake;
  model.userData.waterlineFoam = foam;
  anchorSurfaceFoam(model);
  model.updateMatrixWorld(true);
  for (const group of [wake, foam]) {
    for (const p of [new Vector3(), new Vector3(2, 0, 4)]) {
      assert.ok(Math.abs(group.localToWorld(p).y) < 1e-7);
    }
    const forward = group.localToWorld(new Vector3(0, 0, -1)).sub(group.getWorldPosition(new Vector3()));
    assert.ok(Math.abs(forward.x + Math.sin(1.2)) < 1e-7);
  }
});
