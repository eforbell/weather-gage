import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAMERA_TUNING, createCameraDirector } from '../src/ui/battle-camera.js';

const HEX = 13.5;
const target = new THREE.Vector3(0, 1, 0);
const framed = new THREE.Vector3(10, 4, 14);

function run(director, seconds, dt = 1 / 30) {
  let pose = null;
  for (let t = 0; t < seconds; t += dt) pose = director.step(dt) || pose;
  return pose;
}

test('reduced motion: no establishing shot, glide, shake or drift', () => {
  const d = createCameraDirector({ reduced: true, hex: HEX });
  assert.equal(d.begin(new THREE.Vector3(), new THREE.Vector3(), framed, target), null, 'snaps straight to the framing');
  d.impulse(1, 0);
  assert.equal(d.trauma, 0);
  assert.equal(d.shake(1), null);
  run(d, CAMERA_TUNING.idleSeconds + 1);
  assert.equal(d.drifting, false);
});

test('the first framing is a low, wide establishing sweep that lands exactly on the framing', () => {
  const d = createCameraDirector({ hex: HEX });
  const start = d.begin(new THREE.Vector3(), new THREE.Vector3(), framed, target);
  const offset = start.position.clone().sub(target);
  const framedRadius = framed.distanceTo(target);
  assert.ok(Math.abs(offset.length() - framedRadius * CAMERA_TUNING.introDistance) < 1e-6, 'starts wide');
  assert.ok(Math.abs(offset.y / offset.length() - Math.sin(CAMERA_TUNING.introElevation)) < 1e-6, 'starts low over the water');
  assert.ok(start.position.distanceTo(framed) > framedRadius, 'starts well away from the framing');
  assert.ok(d.gliding);
  const end = run(d, CAMERA_TUNING.introSeconds + 0.1);
  assert.ok(end.position.distanceTo(framed) < 1e-6 && end.target.distanceTo(target) < 1e-6, 'lands on the framing');
  assert.equal(d.gliding, false);
});

test('later framings glide from the current camera, the short way round', () => {
  const d = createCameraDirector({ hex: HEX });
  d.begin(new THREE.Vector3(), new THREE.Vector3(), framed, target);
  run(d, CAMERA_TUNING.introSeconds + 0.1);
  // From just west of north to just east of north: a short hop, not a 340° lap.
  const current = new THREE.Vector3(-1, 4, 15), next = new THREE.Vector3(1, 4, 15);
  const start = d.begin(current, target, next, target);
  assert.ok(start.position.distanceTo(current) < 1e-6, 'no jump at the start of a glide');
  let widest = 0;
  for (let t = 0; t < CAMERA_TUNING.glideSeconds + 0.1; t += 1 / 30) {
    const p = d.step(1 / 30);
    if (p) widest = Math.max(widest, Math.abs(p.position.x));
  }
  assert.ok(widest <= 1.0001, `stays between the two bearings (max |x| ${widest.toFixed(3)})`);
});

test('the player\'s input cancels a glide and resets the drift timer', () => {
  const d = createCameraDirector({ hex: HEX });
  d.begin(new THREE.Vector3(), new THREE.Vector3(), framed, target);
  d.userInput();
  assert.equal(d.gliding, false);
  run(d, CAMERA_TUNING.idleSeconds - 1);
  assert.equal(d.drifting, false);
  run(d, 1.5);
  assert.equal(d.drifting, true, 'drifts once left alone');
  d.userInput();
  assert.equal(d.drifting, false);
});

test('impulses shake by proximity, saturate, and die away', () => {
  const d = createCameraDirector({ hex: HEX });
  d.impulse(0.35, 0);
  assert.ok(Math.abs(d.trauma - 0.35) < 1e-9, 'own salvo at full strength');
  const near = d.shake(1).length();
  assert.ok(near > 0);
  d.impulse(5, 0);
  assert.equal(d.trauma, 1, 'saturates');
  run(d, 1 / CAMERA_TUNING.shakeDecay + 0.1);
  assert.equal(d.trauma, 0, 'decays to nothing');
  assert.equal(d.shake(2), null);
  d.impulse(1, CAMERA_TUNING.shakeReach * HEX + 1);
  assert.equal(d.trauma, 0, 'out of reach: no shake');
  d.impulse(1, CAMERA_TUNING.shakeReach * HEX * 0.5);
  assert.ok(Math.abs(d.trauma - 0.25) < 1e-9, 'quadratic falloff');
});

// The effects kit reports guns, hits and explosions to the camera.
function stubCanvas() {
  const context = new Proxy({}, { get: (_, key) => key === 'createRadialGradient' || key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : key === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => {} , set: () => true });
  globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
}

test('salvos, hits and magazine explosions send camera impulses at the right strengths', async () => {
  stubCanvas();
  const { createEffects } = await import('../src/ui/battle-effects.js');
  const impulses = [];
  const effects = createEffects(new THREE.Group(), { onImpulse: (point, strength) => impulses.push({ point: point.clone(), strength }) });
  effects.setScene({ era: 'dreadnought', wind: new THREE.Vector3(1, 0, 0), fog: new THREE.FogExp2(0xffffff, 0.01) });
  const at = { a: new THREE.Vector3(0, 0, 0), b: new THREE.Vector3(30, 0, 0) };
  const pos = ref => at[ref];
  effects.play([
    { type: 'salvo', from: 'a', to: 'b', heavy: true, hits: 1 },
    { type: 'magazine', to: 'b' },
  ], { pos });
  const camera = new THREE.PerspectiveCamera();
  for (let t = 0; t < 6; t += 1 / 30) effects.update(1 / 30, camera);
  const strengths = impulses.map(i => i.strength);
  assert.ok(strengths.includes(0.35), `own heavy salvo kicks the camera: ${strengths}`);
  assert.ok(strengths.includes(0.45), `a heavy hit lands: ${strengths}`);
  assert.ok(strengths.includes(1), `the magazine goes up: ${strengths}`);
  assert.ok(impulses.find(i => i.strength === 1).point.distanceTo(at.b) < 1e-6, 'impulses carry where they happened');
  effects.dispose();
});
