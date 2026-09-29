import * as THREE from 'three';

// Instanced camera-facing particles: one draw call per system, whatever the
// count. Simulation runs on the CPU in typed arrays (cheap at a few thousand);
// alpha-blended systems are depth-sorted so smoke layers correctly. All
// randomness is presentation-only and never touches the seeded simulation.

const vertexShader = /* glsl */`
  attribute vec3 iOffset;
  attribute vec4 iColor;
  attribute vec2 iSizeSpin;
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vFogDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(iOffset, 1.0);
    float c = cos(iSizeSpin.y), s = sin(iSizeSpin.y);
    mv.xy += mat2(c, s, -s, c) * position.xy * iSizeSpin.x;
    vUv = uv;
    vColor = iColor;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const fragmentShader = /* glsl */`
  uniform sampler2D map;
  uniform vec3 tint;
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform float additive;
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vFogDepth;
  void main() {
    vec4 tex = texture2D(map, vUv);
    float fog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    vec3 color = vColor.rgb * mix(tint, vec3(1.0), additive) * mix(vec3(1.0), tex.rgb, 0.35);
    float alpha = vColor.a * tex.a;
    // Aerial perspective: smoke fades into the haze colour; light just fades out.
    color = mix(color, fogColor, fog * (1.0 - additive));
    alpha *= 1.0 - fog * additive;
    gl_FragColor = vec4(color, alpha);
  }`;

// A cloudy puff: overlapping soft blobs under a round falloff, lighter on top
// so smoke reads as sunlit from above.
export function puffTexture() {
  const size = 128, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * 30, r = 12 + rnd() * 26;
    const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const shade = Math.round(215 + (64 - y) * 0.5);
    g.addColorStop(0, `rgba(${shade},${shade},${shade},0.2)`);
    g.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(64, 64, 0, 64, 64, 63);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(0.45, 'rgba(0,0,0,0.75)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

const FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'age', 'life', 's0', 's1', 'r', 'g', 'b', 'a', 'drag', 'lift', 'wind', 'rot', 'spin', 'fade'];

export function createParticles(scene, { max, additive = false, texture, renderOrder = 2 }) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.getAttribute('position'));
  geometry.setAttribute('uv', quad.getAttribute('uv'));
  const offsets = new Float32Array(max * 3), colors = new Float32Array(max * 4), sizeSpin = new Float32Array(max * 2);
  const attribute = (array, n) => new THREE.InstancedBufferAttribute(array, n).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('iOffset', attribute(offsets, 3));
  geometry.setAttribute('iColor', attribute(colors, 4));
  geometry.setAttribute('iSizeSpin', attribute(sizeSpin, 2));
  geometry.instanceCount = 0;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      tint: { value: new THREE.Color(1, 1, 1) },
      additive: { value: additive ? 1 : 0 },
      fogColor: { value: new THREE.Color() },
      fogDensity: { value: 0 },
    },
    vertexShader, fragmentShader,
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  scene.add(mesh);

  const p = Object.fromEntries(FIELDS.map(f => [f, new Float32Array(max)]));
  const order = new Uint16Array(max), depth = new Float32Array(max);
  let count = 0;

  // o: { x,y,z, vx,vy,vz, life, size: [start, end], color: [r,g,b], alpha,
  //      drag (1/s), lift (+up / -gravity, units/s²), wind (0..1), spin, fade (fade-in share) }
  function emit(o) {
    if (count >= max) return;
    const i = count++;
    p.x[i] = o.x; p.y[i] = o.y; p.z[i] = o.z;
    p.vx[i] = o.vx || 0; p.vy[i] = o.vy || 0; p.vz[i] = o.vz || 0;
    p.age[i] = 0; p.life[i] = o.life;
    p.s0[i] = o.size[0]; p.s1[i] = o.size[1];
    [p.r[i], p.g[i], p.b[i]] = o.color;
    p.a[i] = o.alpha ?? 1;
    p.drag[i] = o.drag || 0; p.lift[i] = o.lift || 0; p.wind[i] = o.wind || 0;
    p.rot[i] = Math.random() * Math.PI * 2; p.spin[i] = o.spin ?? (Math.random() - 0.5) * 0.4;
    p.fade[i] = o.fade ?? 0.08;
  }
  function copy(from, to) { for (const f of FIELDS) p[f][to] = p[f][from]; }

  function update(dt, wind, camera) {
    for (let i = 0; i < count; i++) {
      p.age[i] += dt;
      if (p.age[i] >= p.life[i]) { copy(--count, i); i--; continue; }
      const damp = Math.exp(-p.drag[i] * dt);
      p.vx[i] = p.vx[i] * damp + wind.x * p.wind[i] * (1 - damp);
      p.vz[i] = p.vz[i] * damp + wind.z * p.wind[i] * (1 - damp);
      p.vy[i] = p.vy[i] * damp + p.lift[i] * dt;
      p.x[i] += p.vx[i] * dt;
      p.y[i] = Math.max(p.y[i] + p.vy[i] * dt, p.lift[i] < 0 ? -0.5 : -1e3);
      p.z[i] += p.vz[i] * dt;
      p.rot[i] += p.spin[i] * dt;
    }
    const e = camera.matrixWorldInverse.elements;
    for (let i = 0; i < count; i++) {
      order[i] = i;
      depth[i] = e[2] * p.x[i] + e[6] * p.y[i] + e[10] * p.z[i];
    }
    const sorted = additive ? order.subarray(0, count) : order.subarray(0, count).sort((a, b) => depth[a] - depth[b]);
    for (let k = 0; k < count; k++) {
      const i = sorted[k], t = p.age[i] / p.life[i];
      const alpha = p.a[i] * Math.min(1, t / p.fade[i]) * (1 - t) ** 1.4;
      offsets[k * 3] = p.x[i]; offsets[k * 3 + 1] = p.y[i]; offsets[k * 3 + 2] = p.z[i];
      colors[k * 4] = p.r[i]; colors[k * 4 + 1] = p.g[i]; colors[k * 4 + 2] = p.b[i]; colors[k * 4 + 3] = alpha;
      sizeSpin[k * 2] = p.s0[i] + (p.s1[i] - p.s0[i]) * (1 - (1 - t) ** 2);
      sizeSpin[k * 2 + 1] = p.rot[i];
    }
    geometry.instanceCount = count;
    for (const name of ['iOffset', 'iColor', 'iSizeSpin']) {
      const attr = geometry.getAttribute(name);
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, count * attr.itemSize);
      attr.needsUpdate = true;
    }
  }
  function setFog(fog, tint) {
    material.uniforms.fogColor.value.copy(fog.color);
    material.uniforms.fogDensity.value = fog.density;
    if (tint) material.uniforms.tint.value.copy(tint);
  }
  function clear() { count = 0; geometry.instanceCount = 0; }
  function dispose() { scene.remove(mesh); geometry.dispose(); quad.dispose(); material.dispose(); }
  return { emit, update, setFog, clear, dispose, get count() { return count; } };
}
