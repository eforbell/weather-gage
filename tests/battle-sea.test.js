import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { configureSea, createWaterNormals, patchWaterShader, __seaTestHooks } from '../src/ui/battle-sea.js';

test('procedural water normals are deterministic and tileable texture settings are stable', () => {
  const a = createWaterNormals({ size: 16, seed: 11, wind: new THREE.Vector3(1, 0, 0), swell: 1.2 });
  const b = createWaterNormals({ size: 16, seed: 11, wind: new THREE.Vector3(1, 0, 0), swell: 1.2 });
  assert.equal(a.image.width, 16);
  assert.equal(a.image.height, 16);
  assert.equal(a.wrapS, THREE.RepeatWrapping);
  assert.equal(a.wrapT, THREE.RepeatWrapping);
  assert.deepEqual([...a.image.data.slice(0, 64)], [...b.image.data.slice(0, 64)]);
  assert.ok(a.image.data.every((value, index) => index % 4 !== 3 || value === 255));
});

test('water normal map is direction-neutral so shader wind is not double-applied', () => {
  const east = createWaterNormals({ size: 16, seed: 11, wind: new THREE.Vector3(1, 0, 0) });
  const north = createWaterNormals({ size: 16, seed: 11, wind: new THREE.Vector3(0, 0, 1) });
  assert.deepEqual([...east.image.data.slice(0, 96)], [...north.image.data.slice(0, 96)]);
});

test('shader patch anchors match the pinned Three Water shader and add bounded sea controls', () => {
  const water = new Water(new THREE.PlaneGeometry(10, 10), { waterNormals: createWaterNormals({ size: 16 }) });
  for (const anchor of __seaTestHooks.patchAnchors) assert.ok(water.material.fragmentShader.includes(anchor), anchor.slice(0, 64));
  const patched = patchWaterShader(water.material.fragmentShader);
  assert.match(patched, /uniform vec2 windDirection;/);
  assert.match(patched, /swellWeight = 1\.30 \* swellScale/);
  assert.match(patched, /chopWeight = 0\.70/);
  assert.match(patched, /uv0 = directionalUv.* - vec2\( time \/ 42\.0, 0\.0 \)/);
  assert.match(patched, /swellSlope0 \* \( 0\.72 \* swellScale \).*chop1\.xy \* 0\.28/s);
  assert.match(patched, /clamp\( surfaceNormal\.xz/);
  assert.match(patched, /whitecapStrength/);
});

test('shader keeps sampled slopes in world xz channels and bounds whitecaps', () => {
  const water = new Water(new THREE.PlaneGeometry(10, 10), { waterNormals: createWaterNormals({ size: 16 }) });
  const patched = patchWaterShader(water.material.fragmentShader);
  assert.match(patched, /directionalUv = vec2\( dot\( uv, wind \), dot\( uv, crossWind \) \)/);
  assert.match(patched, /uv0 = directionalUv.* - vec2\( time \/ 42\.0, 0\.0 \)/);
  assert.match(patched, /swellSlope0 = wind \* swell0\.x \+ crossWind \* swell0\.y/);
  assert.match(patched, /return vec4\( slope\.x, slope\.y, up, 0\.0 \)/);
  assert.match(patched, /surfaceNormal = normalize\( noise\.xzy \* vec3\( 1\.5, 1\.0, 1\.5 \) \)/);
  assert.match(patched, /smoothstep\( 0\.58, 0\.86, length\( surfaceNormal\.xz \) \* swellScale \+ noise\.z \* 0\.12 \) \* whitecapStrength/);
});


test('normal-map slopes remain centered and bounded as swell increases', () => {
  const stats = swell => {
    const texture = createWaterNormals({ size: 64, seed: 3, swell });
    const { data } = texture.image;
    let meanX = 0, meanY = 0, steep = 0, extreme = 0;
    for (let i = 0; i < data.length; i += 4) {
      const x = data[i] / 255 * 2 - 1, y = data[i + 1] / 255 * 2 - 1;
      const slope = Math.hypot(x, y);
      meanX += x; meanY += y;
      if (slope > 0.58) steep++;
      if (slope > 0.86) extreme++;
      assert.ok(data[i + 2] > 127, 'normal faces up');
    }
    const count = data.length / 4;
    texture.dispose();
    assert.ok(Math.abs(meanX / count) < 0.015);
    assert.ok(Math.abs(meanY / count) < 0.015);
    return { steep: steep / count, extreme: extreme / count };
  };
  const calm = stats(1), heavy = stats(1.8);
  assert.ok(heavy.steep > calm.steep, 'heavy swell has more steep normals');
  assert.ok(heavy.steep > 0.01 && heavy.steep < 0.15);
  assert.ok(heavy.extreme < 0.01, 'map does not saturate into foam everywhere');
});

test('missing shader anchor retains plain Water and a usable update API', () => {
  const water = new Water(new THREE.PlaneGeometry(10, 10), { waterNormals: createWaterNormals({ size: 16 }), distortionScale: 3 });
  water.material.fragmentShader = 'unfamiliar upstream shader';
  const warn = console.warn;
  console.warn = () => {};
  try {
    const api = configureSea(water);
    assert.equal(water.material.fragmentShader, 'unfamiliar upstream shader');
    assert.equal(water.material.userData.seaShaderFallback, true);
    assert.equal(water.material.uniforms.distortionScale.value, 1.2);
    assert.equal(api.update({ swell: 1.8 }), api);
    assert.doesNotThrow(() => configureSea(water).update());
  } finally { console.warn = warn; }
});

test('configureSea patches once and exposes a bounded update API', () => {
  const water = new Water(new THREE.PlaneGeometry(10, 10), {
    waterNormals: createWaterNormals({ size: 16 }),
    distortionScale: 3,
  });
  const api = configureSea(water, { wind: new THREE.Vector3(3, 0, 4), swell: 9, whitecaps: 1 });
  const shader = water.material.fragmentShader;
  assert.equal(water.material.userData.seaShaderPatched, true);
  assert.deepEqual(water.material.uniforms.windDirection.value.toArray().map(v => Number(v.toFixed(3))), [0.6, 0.8]);
  assert.equal(water.material.uniforms.swellScale.value, 2.2);
  assert.equal(water.material.uniforms.whitecapStrength.value, 0.28);
  assert.equal(water.material.uniforms.distortionScale.value, 1.2);
  api.update({ wind: new THREE.Vector3(0, 0, -2), swell: 0.1, whitecaps: -1 });
  assert.deepEqual(water.material.uniforms.windDirection.value.toArray(), [0, -1]);
  assert.equal(water.material.uniforms.swellScale.value, 0.35);
  assert.equal(water.material.uniforms.whitecapStrength.value, 0);
  configureSea(water);
  assert.equal(water.material.fragmentShader, shader);
});
