import { Quaternion, Vector3 } from 'three';

const up = new Vector3(0, 1, 0);
const inverse = new Quaternion();
const heading = new Quaternion();

// Foam belongs to the sea plane, not the pitching deck. Keep the ship-relative
// heading and horizontal position, but undo heave, roll and pitch.
export function anchorSurfaceFoam(model) {
  inverse.copy(model.quaternion).invert();
  heading.setFromAxisAngle(up, model.rotation.y);
  for (const foam of [model.userData.wake, model.userData.waterlineFoam]) {
    if (!foam) continue;
    foam.position.set(0, -model.position.y, 0).applyQuaternion(inverse);
    foam.quaternion.copy(inverse).multiply(heading);
  }
}
