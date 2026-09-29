import * as THREE from 'three';
import { HEX, SHIP_LENGTH as L } from './battle-presentation.js';
import { createParticles, puffTexture, glowTexture } from './battle-particles.js';

// 3D combat effects. Driven only by the per-side `view.fx` events the chart
// already animates, placed at their fog-safe references (never true enemy
// positions), in sea-fixed coordinates so lingering smoke stays put on the sea. Every event has a physical echo: flash, drifting smoke, the
// shell's arc, then a splash column, fireball or fire.

const G = 14; // spray gravity, world units/s²
const rand = (a, b) => a + Math.random() * (b - a);
const up = (v, y) => v.clone().setY(v.y + y);
function around(p, radius) {
  const a = rand(0, Math.PI * 2), d = radius * Math.sqrt(Math.random());
  return new THREE.Vector3(p.x + Math.cos(a) * d, p.y, p.z + Math.sin(a) * d);
}

// Smoke and spray by era: black powder is dense and white, cordite brown-grey,
// coal funnels near black, gas turbines barely visible.
const ERA = {
  sail: { funnel: 0, coal: [0.2, 0.19, 0.18], gun: [0.94, 0.93, 0.89], gunAmount: 1.8, splash: 0.4 },
  ironclad: { funnel: 1, coal: [0.15, 0.14, 0.13], gun: [0.9, 0.89, 0.85], gunAmount: 1.3, splash: 0.55 },
  dreadnought: { funnel: 1.1, coal: [0.13, 0.12, 0.11], gun: [0.6, 0.55, 0.48], gunAmount: 0.9, splash: 1 },
  coldwar: { funnel: 0.12, coal: [0.5, 0.5, 0.5], gun: [0.72, 0.72, 0.72], gunAmount: 0.4, splash: 0.6 },
  modern: { funnel: 0.1, coal: [0.55, 0.55, 0.55], gun: [0.75, 0.75, 0.75], gunAmount: 0.4, splash: 0.6 },
};

// The presentation contract. Each chart event type is either drawn here or
// named as a known gap with the reason; tests fail on anything unaccounted for.
export const FX_KNOWN_GAPS = {
  event: 'Scenario announcements are banners in the dispatch, not a physical event.',
  ivan: 'A Crazy Ivan is a turn; the hull model shows it on the next tick.',
  struck: 'Hauling down colours needs flag models (M1).',
};
export const ENTITY_KNOWN_GAPS = {
  torpedo: 'Running Cold War torpedoes are chart-only until the undersea milestone (M3).',
  buoys: 'Sonobuoy fields are chart-only until M3.',
  decoy: 'Noisemakers in the water are chart-only until M3; the launch bubble cloud is drawn.',
};

function gunfire(e, c, fx) {
  const P = c.pos(e.from), T = c.pos(e.to);
  const heavy = e.type === 'broadside' || e.heavy;
  if (!P && !T) return;
  const dir = P && T ? T.clone().sub(P).setY(0).normalize() : new THREE.Vector3(1, 0, 0);
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const size = e.type === 'broadside' ? 0.8 : heavy ? 1 : 0.55;
  let muzzle = null;
  if (P) {
    const guns = e.type === 'broadside' ? 7 : heavy ? 4 : 2;
    muzzle = up(P, 0.7).addScaledVector(dir, 1);
    for (let k = 0; k < guns; k++) {
      const along = guns > 1 ? (k / (guns - 1) - 0.5) * L * (e.type === 'broadside' ? 0.62 : 0.5) : 0;
      const at = muzzle.clone().addScaledVector(side, along);
      fx.later(k * (e.type === 'broadside' ? 0.05 : 0.03), () => { fx.flash(at, size); fx.gunSmoke(at, dir, size); });
    }
  }
  if (!T) return;
  const land = () => {
    if (e.hits) {
      for (let k = 0; k < Math.min(e.hits, 3); k++) fx.later(k * 0.09, () => fx.fireball(up(around(T, L * 0.25), 0.6), heavy ? 1.1 : 0.7));
      return;
    }
    const over = Math.random() < 0.5 ? 1 : -1;
    const centre = e.straddle ? T : T.clone().addScaledVector(dir, over * rand(0.5, 1.2) * L).addScaledVector(side, rand(-0.3, 0.3) * L);
    const height = fx.era.splash * L * (heavy ? 0.85 : 0.45);
    const columns = Math.max(2, Math.min(e.shots || 2, 6));
    for (let k = 0; k < columns; k++) fx.later(k * 0.06, () => fx.splash(around(centre, L * (e.straddle ? 0.5 : 0.35)), height * rand(0.8, 1.1), heavy ? 1 : 0.6));
  };
  if (!muzzle) { fx.later(0.5, land); return; }
  const distance = muzzle.distanceTo(T);
  fx.fly(muzzle, up(T, 0.3), THREE.MathUtils.clamp(0.7 + distance / HEX * 0.28, 0.8, 3.2), distance * 0.16 + 1, heavy ? fx.tracer : null, land);
}
function impact(e, c, fx) {
  const T = c.pos(e.to);
  if (!T) return;
  fx.later({ 'missile-hit': 1.5, 'torpedo-hit': 0.6, mine: 0.3 }[e.type], () => {
    if (e.type === 'missile-hit') fx.fireball(up(T, 0.8), 1.4);
    else { fx.splash(T, L * 0.9, 1.6); fx.fireball(up(T, 0.3), 0.9); }
    fx.emitter(T, 12, 'fire');
  });
}
// Handlers receive the event, its fog-safe positions (c.pos) and the effect kit.
const HANDLERS = {
  salvo: gunfire,
  broadside: gunfire,
  'missile-hit': impact,
  'torpedo-hit': impact,
  mine: impact,
  missile(e, c, fx) {
    const P = c.pos(e.from), T = c.pos(e.to);
    if (!P) return;
    fx.flash(up(P, 0.8), 0.6);
    fx.gunSmoke(up(P, 0.8), new THREE.Vector3(0, 0, 0), 1);
    if (T) { const d = P.distanceTo(T); fx.fly(up(P, 1), up(T, 0.8), THREE.MathUtils.clamp(1 + d / HEX * 0.15, 1.2, 2.5), d * 0.05 + 1.5, fx.exhaust, null); }
  },
  intercept(e, c, fx) {
    const T = c.pos(e.to);
    if (T) fx.later(0.9, () => { const p = up(around(T, L * 0.5), rand(3, 6)); fx.flash(p, 0.6); fx.smoke({ x: p.x, y: p.y, z: p.z, drag: 1, wind: 0.8, life: 6, size: [0.8, 3], color: [0.2, 0.2, 0.2], alpha: 0.6 }); });
  },
  torpedo(e, c, fx) {
    const P = c.pos(e.from), aim = c.pos(e.at) || c.pos(e.to);
    if (!P) return;
    fx.splash(P, L * 0.08, 0.35);
    if (e.eta && aim) fx.run(P, P.clone().lerp(aim, Math.min(1, 1 / e.eta)), 4);
  },
  ram(e, c, fx) {
    const T = c.pos(e.to);
    if (!T) return;
    for (let k = 0; k < 3; k++) fx.later(k * 0.08, () => fx.splash(around(T, L * 0.3), L * 0.25, 0.7));
    fx.fireball(up(T, 0.4), e.heavy ? 0.8 : 0.4);
  },
  fire(e, c, fx) { const T = c.pos(e.to); if (T) fx.later(1, () => fx.emitter(T, 16, 'fire')); },
  ping(e, c, fx) {
    const P = c.pos(e.from);
    if (P) for (let k = 0; k < 3; k++) fx.later(k * 0.26, () => fx.ring(P, HEX * 2.2, 2.2, new THREE.Color(0.5, 1.5, 1.7)));
  },
  asroc(e, c, fx) {
    const P = c.pos(e.from), D = c.pos(e.at) || c.pos(e.to);
    const land = () => { fx.splash(D, L * 0.3, 0.7); fx.ring(D, HEX * 0.4, 1.2, new THREE.Color(0.8, 0.9, 0.9)); };
    if (P && D) { fx.flash(up(P, 0.8), 0.6); fx.fly(up(P, 1), D, 2.2, P.distanceTo(D) * 0.3 + 3, fx.exhaust, land); }
    else if (D) fx.later(0.8, land);
  },
  airdrop(e, c, fx) { const D = c.pos(e.at) || c.pos(e.to); if (D) fx.later(0.8, () => fx.splash(D, L * 0.2, 0.5)); },
  buoys(e, c, fx) { const A = c.pos(e.at); if (A) for (let k = 0; k < 6; k++) fx.later(0.4 + k * 0.07, () => fx.splash(around(A, HEX * 1.4), L * 0.08, 0.3)); },
  decoy(e, c, fx) {
    const P = c.pos(e.from);
    if (P) for (let k = 0; k < 30; k++) fx.later(k * 0.04, () => { const q = around(P, 1.5); fx.smoke({ x: q.x, y: fx.surfaceY + 0.05, z: q.z, vy: 0.05, drag: 1, life: 5, size: [0.4, 1.6], color: [0.92, 0.96, 0.96], alpha: 0.5 }); });
  },
  dud(e, c, fx) { const T = c.pos(e.to); if (T) fx.later(0.6, () => fx.splash(T, L * 0.3, 0.8)); },
  explosion(e, c, fx) {
    const P = c.pos(e.to) || c.pos(e.at);
    if (P) fx.later(1, () => { fx.fireball(up(P, 0.5), 1.3); fx.emitter(P, 8, 'smoke'); });
  },
  'torpedo-miss'(e, c, fx) { const A = c.pos(e.at); if (A) fx.later(0.5, () => fx.splash(A, L * 0.15, 0.4)); },
  sunk(e, c, fx) {
    const T = c.pos(e.to);
    if (!T) return;
    fx.later(1.2, () => { fx.fireball(up(T, 0.5), 1.4); fx.ring(T, HEX * 0.6, 3, new THREE.Color(0.6, 0.65, 0.65)); fx.emitter(T, 25, 'pyre'); });
    fx.later(1.36, () => fx.fireball(up(around(T, L * 0.3), 0.4), 1.1));
  },
  magazine(e, c, fx) {
    const T = c.pos(e.to);
    if (!T) return;
    fx.later(1.2, () => {
      fx.flash(up(T, 2), 4);
      fx.boom();
      for (let i = 0; i < 45; i++) fx.light({ x: T.x + rand(-1, 1), y: T.y + 0.5, z: T.z + rand(-1, 1), vx: rand(-2, 2), vy: rand(5, 16), vz: rand(-2, 2), drag: 1.1, lift: -3, life: rand(1, 2), size: [1.5, 4.5], color: [9, 4, 1.3], fade: 0.01 });
      for (let i = 0; i < 40; i++) fx.light({ x: T.x, y: T.y + 1, z: T.z, vx: rand(-6, 6), vy: rand(8, 18), vz: rand(-6, 6), lift: -12, drag: 0.1, life: rand(2, 3), size: [0.25, 0.15], color: [6, 2.5, 0.8], fade: 0.01 });
      for (let i = 0; i < 90; i++) fx.smoke({ x: T.x + rand(-1, 1), y: T.y + 1, z: T.z + rand(-1, 1), vx: rand(-3, 3), vy: rand(8, 20), vz: rand(-3, 3), drag: 0.8, lift: -0.4, wind: 0.6, life: rand(16, 24), size: [3, rand(10, 15)], color: [0.13, 0.12, 0.11], alpha: 0.85 });
      for (let k = 0; k < 4; k++) fx.splash(around(T, L * 0.6), L * 0.5, 1.2);
      fx.emitter(T, 30, 'pyre', 1.5);
    });
    fx.later(1.45, () => fx.ring(T, HEX * 2.8, 1.4, new THREE.Color(1.4, 1.4, 1.3)));
  },
  aground(e, c, fx) { const T = c.pos(e.to); if (T) fx.splash(around(T, L * 0.3), L * 0.12, 0.5); },
};

export const FX_HANDLED = Object.keys(HANDLERS);

export function createEffects(scene) {
  const puff = puffTexture(), glow = glowTexture();
  const smoke = createParticles(scene, { max: 5000, texture: puff, renderOrder: 2 });
  const light = createParticles(scene, { max: 1500, additive: true, texture: glow, renderOrder: 3 });
  const flashLight = new THREE.PointLight(0xffb070, 0, L * 4, 2);
  scene.add(flashLight);
  const ringGeometry = new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2);
  let now = 0, era = ERA.dreadnought, surfaceY = 0;
  const wind = new THREE.Vector3(1, 0, 0);
  const queue = [], flights = [], runners = [], emitters = [], rings = [];
  const later = (seconds, fn) => queue.push({ t: now + seconds, fn });

  // ---------- primitives ----------
  function flash(p, s = 1) {
    light.emit({ x: p.x, y: p.y, z: p.z, life: 0.16, size: [3 * s, 4.6 * s], color: [10, 7, 4], fade: 0.001, spin: 0 });
    for (let i = 0; i < 5; i++) {
      light.emit({ x: p.x, y: p.y, z: p.z, vx: rand(-4, 4) * s, vy: rand(0, 3) * s, vz: rand(-4, 4) * s, drag: 6, life: rand(0.14, 0.26), size: [0.8 * s, 1.9 * s], color: [8, 4, 1.5], fade: 0.001 });
    }
    flashLight.position.copy(p).setY(p.y + 1);
    flashLight.intensity = Math.max(flashLight.intensity, 160 * s * s);
  }
  function gunSmoke(p, dir, s = 1) {
    const n = Math.max(1, Math.round(3 * era.gunAmount * s));
    for (let i = 0; i < n; i++) {
      const push = rand(1.5, 5) * s;
      smoke.emit({ x: p.x, y: p.y, z: p.z, vx: dir.x * push, vy: rand(0.2, 0.7), vz: dir.z * push, drag: 1.1, lift: 0.04, wind: 1, life: rand(8, 14), size: [0.6 * s, rand(3.5, 5.5) * s], color: era.gun, alpha: 0.55 });
    }
  }
  // A tall, slender white column with a crown of spray: the signature image of
  // dreadnought gunnery. Speeds are spread so the column fills from sea to crown.
  function splash(p, height, s = 1) {
    const v0 = Math.sqrt(2 * G * height);
    for (let i = 0; i < 14 + 30 * s; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0, 0.25) * s, out = rand(0.05, 0.45) * s;
      smoke.emit({ x: p.x + Math.cos(a) * r, y: surfaceY, z: p.z + Math.sin(a) * r, vx: Math.cos(a) * out, vy: v0 * (0.35 + 0.65 * Math.sqrt(Math.random())), vz: Math.sin(a) * out, lift: -G, drag: 0.3, wind: 0.15, life: rand(1.6, 2.6), size: [0.45 * s, 1.6 * s], color: [0.95, 0.97, 0.98], alpha: 0.85, fade: 0.02 });
    }
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2);
      smoke.emit({ x: p.x, y: surfaceY, z: p.z, vx: Math.cos(a) * 1.3 * s, vy: v0, vz: Math.sin(a) * 1.3 * s, lift: -G, drag: 0.5, wind: 0.3, life: rand(2, 2.6), size: [0.6 * s, 2 * s], color: [0.95, 0.97, 0.98], alpha: 0.6 });
    }
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2);
      smoke.emit({ x: p.x, y: surfaceY + 0.1, z: p.z, vx: Math.cos(a) * 3 * s, vz: Math.sin(a) * 3 * s, drag: 1.5, life: 2.5, size: [0.6 * s, 2.5 * s], color: [0.9, 0.94, 0.95], alpha: 0.55 });
    }
    later(0.55, () => {
      for (let i = 0; i < 5; i++) smoke.emit({ x: p.x + rand(-0.4, 0.4) * s, y: surfaceY + height * rand(0.5, 0.9), z: p.z + rand(-0.4, 0.4) * s, drag: 1, wind: 0.5, life: 3, size: [1.5 * s, 4 * s], color: [0.92, 0.95, 0.96], alpha: 0.3 });
    });
  }
  function fireball(p, s = 1) {
    flash(p, s);
    for (let i = 0; i < 10; i++) light.emit({ x: p.x, y: p.y, z: p.z, vx: rand(-2.5, 2.5) * s, vy: rand(0.5, 3) * s, vz: rand(-2.5, 2.5) * s, drag: 3, life: rand(0.35, 0.75), size: [1 * s, 2.6 * s], color: [8, 3.6, 1.2], fade: 0.01 });
    for (let i = 0; i < 10; i++) light.emit({ x: p.x, y: p.y, z: p.z, vx: rand(-6, 6) * s, vy: rand(2, 7) * s, vz: rand(-6, 6) * s, lift: -9, drag: 0.2, life: rand(0.6, 1.1), size: [0.2 * s, 0.14 * s], color: [6, 3, 1], fade: 0.01 });
    for (let i = 0; i < 8; i++) smoke.emit({ x: p.x, y: p.y + 0.5, z: p.z, vx: rand(-1, 1), vy: rand(0.6, 1.6), vz: rand(-1, 1), drag: 1, lift: 0.4, wind: 0.8, life: rand(6, 10), size: [1.2 * s, 5 * s], color: [0.1, 0.09, 0.08], alpha: 0.75 });
  }
  function ring(p, radius, seconds, color) {
    const mesh = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.position.set(p.x, surfaceY + 0.08, p.z);
    mesh.renderOrder = 3;
    scene.add(mesh);
    rings.push({ mesh, start: now, seconds, radius });
  }
  // A body on a curved path (shell, missile or rocket), trailing tracer or exhaust.
  function fly(from, to, seconds, apex, trail, land) {
    const ctrl = from.clone().lerp(to, 0.5);
    ctrl.y += apex * 2;
    flights.push({ from: from.clone(), ctrl, to: to.clone(), start: now, seconds, trail, land, u: 0 });
  }
  const tracer = p => light.emit({ x: p.x, y: p.y, z: p.z, life: 0.22, size: [0.45, 0.2], color: [4, 2.6, 1.4], fade: 0.001 });
  const exhaust = p => {
    light.emit({ x: p.x, y: p.y, z: p.z, life: 0.08, size: [0.7, 0.3], color: [7, 4, 2], fade: 0.001 });
    smoke.emit({ x: p.x, y: p.y, z: p.z, vy: 0.15, drag: 0.5, wind: 0.6, life: rand(3, 5), size: [0.9, 2.4], color: [0.86, 0.86, 0.85], alpha: 0.35 });
  };
  function emitter(p, seconds, kind, s = 1) { emitters.push({ p: p.clone(), until: now + seconds, kind, s, acc: 0 }); }

  // ---------- per frame ----------
  function update(dt, camera) {
    now += dt;
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].t <= now) queue.splice(i, 1)[0].fn();
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      const u = Math.min(1, (now - f.start) / f.seconds);
      const at = t => f.from.clone().lerp(f.ctrl, t).lerp(f.ctrl.clone().lerp(f.to, t), t);
      // Lay the trail every half unit along the stretch flown since the last
      // frame, so it stays continuous however fast the body or slow the frame.
      if (f.trail) for (let k = 1, n = Math.min(60, Math.ceil(at(f.u).distanceTo(at(u)) / 0.5)); k <= n; k++) f.trail(at(f.u + (u - f.u) * k / n));
      f.u = u;
      if (u >= 1) { flights.splice(i, 1); f.land?.(); }
    }
    for (let i = runners.length - 1; i >= 0; i--) {
      const r = runners[i];
      const u = (now - r.start) / r.seconds;
      if (u >= 1) { runners.splice(i, 1); continue; }
      // Scatter bubbles along the stretch run since the last frame: a trail, not beads.
      const back = Math.max(0, u - dt / r.seconds);
      for (let k = 0; k < 2; k++) {
        const q = r.p.clone().lerp(r.to, rand(back, u));
        smoke.emit({ x: q.x + rand(-0.15, 0.15), y: surfaceY + 0.06, z: q.z + rand(-0.15, 0.15), drag: 2, life: rand(3.5, 5), size: [0.3, rand(0.9, 1.5)], color: [0.92, 0.96, 0.96], alpha: 0.4 });
      }
    }
    for (let i = emitters.length - 1; i >= 0; i--) {
      const m = emitters[i];
      if (now > m.until) { emitters.splice(i, 1); continue; }
      const fade = Math.min(1, (m.until - now) / 4);
      m.acc += dt * (m.kind === 'smoke' ? 3 : 8) * m.s;
      for (; m.acc >= 1; m.acc--) {
        if (m.kind !== 'smoke' && Math.random() < 0.7 * fade) light.emit({ x: m.p.x + rand(-0.8, 0.8), y: m.p.y + rand(0.4, 1), z: m.p.z + rand(-0.8, 0.8), vy: rand(1, 2.5), drag: 1.5, wind: 0.4, life: rand(0.4, 0.9), size: [0.9 * m.s, 0.3], color: [6, 2.6, 0.8] });
        smoke.emit({ x: m.p.x + rand(-0.6, 0.6), y: m.p.y + 1, z: m.p.z + rand(-0.6, 0.6), vy: rand(1, 2) * (m.kind === 'pyre' ? 1.6 : 1), drag: 0.5, lift: 0.3, wind: 1, life: rand(8, 14), size: [1 * m.s, rand(5, 8) * m.s], color: [0.09, 0.085, 0.08], alpha: 0.7 * fade });
      }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i], u = (now - r.start) / r.seconds;
      if (u >= 1) { scene.remove(r.mesh); r.mesh.material.dispose(); rings.splice(i, 1); continue; }
      r.mesh.scale.setScalar(Math.max(0.01, r.radius * (1 - (1 - u) ** 2)));
      r.mesh.material.opacity = (1 - u) ** 1.5;
    }
    flashLight.intensity *= Math.exp(-dt * 14);
    smoke.update(dt, wind, camera);
    light.update(dt, wind, camera);
  }

  // Funnel smoke from each ship's real funnels, streaming downwind, plus a
  // damage plume on our own ships (their true hull; contacts show only fire we saw).
  function shipSmoke(ships, dt) {
    const tmp = new THREE.Vector3();
    for (const s of ships) {
      const funnels = s.model.userData.funnels || [];
      if (s.underway && era.funnel) for (const f of funnels) {
        s.acc = (s.acc || 0) + dt * 7 * era.funnel;
        for (; s.acc >= 1; s.acc--) {
          s.model.localToWorld(tmp.copy(f));
          smoke.emit({ x: tmp.x, y: tmp.y, z: tmp.z, vx: rand(-0.1, 0.1), vy: rand(0.6, 1.1), vz: rand(-0.1, 0.1), drag: 0.6, lift: 0.12, wind: 1, life: rand(7, 12), size: [0.5, rand(3, 4.6)], color: era.coal, alpha: Math.min(0.7, 0.65 * era.funnel), fade: 0.03 });
        }
      }
      if (s.hull !== undefined && s.hull < 60 && s.afloat) {
        s.dmg = (s.dmg || 0) + dt * (60 - s.hull) / 20;
        for (; s.dmg >= 1; s.dmg--) {
          s.model.localToWorld(tmp.set(rand(-0.4, 0.4), 0.8, rand(-1.5, 1.5)));
          smoke.emit({ x: tmp.x, y: tmp.y, z: tmp.z, vy: rand(0.8, 1.4), drag: 0.5, lift: 0.2, wind: 1, life: rand(7, 11), size: [0.8, rand(4, 6)], color: [0.08, 0.075, 0.07], alpha: 0.6 });
        }
      }
    }
  }

  const kit = {
    flash, splash, fireball, ring, fly, gunSmoke, emitter, later, tracer, exhaust,
    smoke: smoke.emit, light: light.emit,
    run: (from, to, seconds) => runners.push({ p: from.clone(), to: to.clone(), start: now, seconds }),
    boom: () => { flashLight.intensity = 3000; },
    get era() { return era; },
    get surfaceY() { return surfaceY; },
  };
  function play(events, context) {
    events.forEach((e, i) => { const handle = HANDLERS[e.type]; if (handle) later(i * 0.12, () => handle(e, context, kit)); });
  }
  function setScene({ era: name, wind: w, fog, tint, surface = 0 }) {
    era = ERA[name] || ERA.dreadnought;
    wind.copy(w);
    surfaceY = surface;
    smoke.setFog(fog, tint);
    light.setFog(fog);
  }
  function clear() {
    queue.length = flights.length = runners.length = emitters.length = 0;
    for (const r of rings) { scene.remove(r.mesh); r.mesh.material.dispose(); }
    rings.length = 0;
    smoke.clear(); light.clear();
  }
  function dispose() {
    clear();
    smoke.dispose(); light.dispose();
    puff.dispose(); glow.dispose(); ringGeometry.dispose();
    scene.remove(flashLight);
  }
  return { play, update, shipSmoke, setScene, clear, dispose, get particles() { return smoke.count + light.count; } };
}

