import * as THREE from 'three';

// Camera direction for the battle view: an establishing sweep when the view
// opens, glides between framings, concussion shake from nearby gunfire and hits,
// and a slow drift when nobody is touching the controls. Pure state; battle-3d
// applies it to the real camera. Every behaviour is off under reduced motion,
// and any user input takes over immediately.

export const CAMERA_TUNING = Object.freeze({
  introSeconds: 3.6,     // establishing sweep
  glideSeconds: 1.4,     // between framings (new ship, asset swap, reset)
  introSweep: 0.9,       // radians the establishing shot orbits through
  introDistance: 1.6,    // starts this many framings out...
  introElevation: 0.06,  // ...low over the water (radians above the horizon)
  idleSeconds: 7,        // before the drift starts
  driftSpeed: 0.35,      // OrbitControls autoRotateSpeed
  shakeDecay: 1.5,       // trauma lost per second
  shakeMax: 0.32,        // world units of offset at full trauma
  shakeReach: 4,         // in hexes: impulses fade to nothing at this range
});

const ease = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2); // cubic in-out

export function createCameraDirector({ reduced = false, hex = 13.5, tuning = CAMERA_TUNING } = {}) {
  let glide = null, trauma = 0, idle = 0, pendingIntro = true;
  const spherical = new THREE.Spherical(), from = new THREE.Spherical(), to = new THREE.Spherical();

  // Where the camera should start for a framing that ends at (position, target).
  // The first framing after the view opens is an establishing shot; later ones
  // glide from wherever the camera is now.
  function begin(currentPosition, currentTarget, position, target) {
    if (reduced) { glide = null; pendingIntro = false; return null; }
    to.setFromVector3(position.clone().sub(target));
    if (pendingIntro) {
      pendingIntro = false;
      from.set(to.radius * tuning.introDistance, Math.PI / 2 - tuning.introElevation, to.theta + tuning.introSweep);
      glide = { from: from.clone(), to: to.clone(), fromTarget: target.clone(), toTarget: target.clone(), t: 0, seconds: tuning.introSeconds };
    } else {
      from.setFromVector3(currentPosition.clone().sub(currentTarget));
      glide = { from: from.clone(), to: to.clone(), fromTarget: currentTarget.clone(), toTarget: target.clone(), t: 0, seconds: tuning.glideSeconds };
    }
    // Orbit the short way round.
    const turn = glide.to.theta - glide.from.theta;
    glide.from.theta += Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
    idle = 0;
    return pose(0);
  }

  function pose(u) {
    const k = ease(Math.min(1, u));
    spherical.set(
      THREE.MathUtils.lerp(glide.from.radius, glide.to.radius, k),
      THREE.MathUtils.lerp(glide.from.phi, glide.to.phi, k),
      THREE.MathUtils.lerp(glide.from.theta, glide.to.theta, k),
    );
    const target = glide.fromTarget.clone().lerp(glide.toTarget, k);
    return { position: new THREE.Vector3().setFromSpherical(spherical).add(target), target, done: u >= 1 };
  }

  // Advance the glide; returns the pose to apply, or null when not gliding.
  function step(dt) {
    idle += dt;
    trauma = Math.max(0, trauma - tuning.shakeDecay * dt);
    if (!glide) return null;
    glide.t += dt;
    const out = pose(glide.t / glide.seconds);
    if (out.done) glide = null;
    return out;
  }

  // A gun, hit or explosion `distance` world units from the camera's subject.
  function impulse(strength, distance) {
    if (reduced) return;
    const fall = Math.max(0, 1 - distance / (tuning.shakeReach * hex));
    trauma = Math.min(1, trauma + strength * fall * fall);
  }

  // Additive offset for this frame (apply before rendering, remove after).
  function shake(seconds) {
    if (reduced || trauma <= 0) return null;
    const a = tuning.shakeMax * trauma * trauma, t = seconds * 31;
    return new THREE.Vector3(
      Math.sin(t * 1.0) + 0.5 * Math.sin(t * 2.3 + 1.1),
      0.6 * (Math.sin(t * 1.3 + 2.0) + 0.5 * Math.sin(t * 2.9 + 0.4)),
      Math.sin(t * 1.7 + 4.0) + 0.5 * Math.sin(t * 2.1 + 2.6),
    ).multiplyScalar(a / 1.5);
  }

  function userInput() { glide = null; idle = 0; }

  return {
    begin, step, impulse, shake, userInput,
    establishNext() { pendingIntro = !reduced; },
    get drifting() { return !reduced && !glide && idle >= tuning.idleSeconds; },
    get gliding() { return Boolean(glide); },
    get trauma() { return trauma; },
  };
}
