import * as THREE from 'three';

const DEFAULT_NORMAL_SIZE = 256;
const DEFAULT_SEED = 3;
const WIND_EPSILON = 1e-6;

function lcg(seed) {
  let state = Math.max(1, seed | 0) % 2147483647;
  return () => ((state = (state * 16807) % 2147483647) / 2147483647);
}

function windVector2(wind) {
  if (!wind) return new THREE.Vector2(0, 1);
  const x = Number.isFinite(wind.x) ? wind.x : 0;
  const z = Number.isFinite(wind.z) ? wind.z : Number.isFinite(wind.y) ? wind.y : 0;
  const v = new THREE.Vector2(x, z);
  if (v.lengthSq() < WIND_EPSILON) return new THREE.Vector2(0, 1);
  return v.normalize();
}

function normalByte(value) {
  return Math.round(THREE.MathUtils.clamp(value * 0.5 + 0.5, 0, 1) * 255);
}

// Tileable, deterministic normals for the flat Water reflector. This map stays
// direction-neutral; configureSea rotates sampled swell into the current wind so
// wind direction is not applied twice.
export function createWaterNormals({ size = DEFAULT_NORMAL_SIZE, seed = DEFAULT_SEED, swell = 1 } = {}) {
  const dimension = Math.max(8, Math.floor(size));
  const rnd = lcg(seed);
  const strength = THREE.MathUtils.clamp(swell, 0.25, 2.5);
  const waves = [];

  for (let i = 0; i < 12; i++) {
    let kx = 0, ky = 0;
    while (Math.hypot(kx, ky) < 3) {
      kx = Math.round(rnd() * 18 - 9);
      ky = Math.round(rnd() * 18 - 9);
    }
    const k = Math.hypot(kx, ky);
    waves.push({ kx, ky, a: strength * (0.42 / Math.pow(k, 1.18)), phase: rnd() * Math.PI * 2 });
  }

  // Fine chop avoids the pond/metal sheet look at follow-camera range and feeds
  // restrained whitecap candidates in the shader.
  for (let i = 0; i < 22; i++) {
    let kx = 0, ky = 0;
    while (Math.hypot(kx, ky) < 8) {
      kx = Math.round(rnd() * 34 - 17);
      ky = Math.round(rnd() * 34 - 17);
    }
    waves.push({ kx, ky, a: 0.34 / Math.pow(Math.hypot(kx, ky), 1.25), phase: rnd() * Math.PI * 2 });
  }

  const data = new Uint8Array(dimension * dimension * 4);
  for (let y = 0; y < dimension; y++) for (let x = 0; x < dimension; x++) {
    let dx = 0, dy = 0;
    for (const wave of waves) {
      const phase = Math.PI * 2 * (wave.kx * x + wave.ky * y) / dimension + wave.phase;
      const c = Math.cos(phase) * wave.a * Math.PI * 2;
      dx += c * wave.kx;
      dy += c * wave.ky;
    }
    const n = new THREE.Vector3(-dx * 0.045, -dy * 0.045, 1).normalize();
    data.set([normalByte(n.x), normalByte(n.y), normalByte(n.z), 255], (y * dimension + x) * 4);
  }

  const texture = new THREE.DataTexture(data, dimension, dimension, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  texture.userData = { ...texture.userData, seaNormals: { size: dimension, seed, swell: strength } };
  return texture;
}

const PATCHES = [
  {
    anchor: 'uniform float distortionScale;\n\t\t\t\tuniform sampler2D normalSampler;',
    replacement: 'uniform float distortionScale;\n\t\t\t\tuniform vec2 windDirection;\n\t\t\t\tuniform float swellScale;\n\t\t\t\tuniform float whitecapStrength;\n\t\t\t\tuniform sampler2D normalSampler;',
  },
  {
    anchor: `\t\t\t\tvec4 getNoise( vec2 uv ) {\n\t\t\t\t\tvec2 uv0 = ( uv / 103.0 ) + vec2(time / 17.0, time / 29.0);\n\t\t\t\t\tvec2 uv1 = uv / 107.0-vec2( time / -19.0, time / 31.0 );\n\t\t\t\t\tvec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );\n\t\t\t\t\tvec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( time / 109.0, time / -113.0 );\n\t\t\t\t\tvec4 noise = texture2D( normalSampler, uv0 ) +\n\t\t\t\t\t\ttexture2D( normalSampler, uv1 ) +\n\t\t\t\t\t\ttexture2D( normalSampler, uv2 ) +\n\t\t\t\t\t\ttexture2D( normalSampler, uv3 );\n\t\t\t\t\treturn noise * 0.5 - 1.0;\n\t\t\t\t}`,
    replacement: `\t\t\t\tvec4 getNoise( vec2 uv ) {\n\t\t\t\t\tvec2 wind = normalize( windDirection );\n\t\t\t\t\tvec2 crossWind = vec2( -wind.y, wind.x );\n\t\t\t\t\tvec2 directionalUv = vec2( dot( uv, wind ), dot( uv, crossWind ) );\n\t\t\t\t\tvec2 uv0 = directionalUv / vec2( 92.0, 28.0 ) - vec2( time / 42.0, 0.0 );\n\t\t\t\t\tvec2 uv1 = directionalUv / vec2( 37.0, 18.0 ) - vec2( time / 31.0, time / 83.0 );\n\t\t\t\t\tvec2 uv2 = uv / vec2( 17.0, 19.0 ) - wind * time / 24.0;\n\t\t\t\t\tvec2 uv3 = uv / vec2( 9.0, 11.0 ) - crossWind * time / 37.0;\n\t\t\t\t\tvec4 swell0 = texture2D( normalSampler, uv0 ) * 2.0 - 1.0;\n\t\t\t\t\tvec4 swell1 = texture2D( normalSampler, uv1 ) * 2.0 - 1.0;\n\t\t\t\t\tvec4 chop0 = texture2D( normalSampler, uv2 ) * 2.0 - 1.0;\n\t\t\t\t\tvec4 chop1 = texture2D( normalSampler, uv3 ) * 2.0 - 1.0;\n\t\t\t\t\tvec2 swellSlope0 = wind * swell0.x + crossWind * swell0.y;\n\t\t\t\t\tvec2 swellSlope1 = wind * swell1.x + crossWind * swell1.y;\n\t\t\t\t\tfloat swellWeight = 1.30 * swellScale;\n\t\t\t\t\tfloat chopWeight = 0.70;\n\t\t\t\t\tvec2 slope = ( swellSlope0 * ( 0.72 * swellScale ) + swellSlope1 * ( 0.58 * swellScale ) + chop0.xy * 0.42 + chop1.xy * 0.28 ) / ( swellWeight + chopWeight );\n\t\t\t\t\tfloat up = ( swell0.z * ( 0.72 * swellScale ) + swell1.z * ( 0.58 * swellScale ) + chop0.z * 0.42 + chop1.z * 0.28 ) / ( swellWeight + chopWeight );\n\t\t\t\t\treturn vec4( slope.x, slope.y, up, 0.0 );\n\t\t\t\t}`,
  },
  {
    anchor: 'vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;',
    replacement: 'vec2 distortion = clamp( surfaceNormal.xz * ( 0.00045 + 0.45 / max( distance, 1.0 ) ) * distortionScale, vec2( -0.018 ), vec2( 0.018 ) );',
  },
  {
    anchor: 'vec3 outgoingLight = albedo;\n\t\t\t\t\tgl_FragColor = vec4( outgoingLight, alpha );',
    replacement: 'float whitecap = smoothstep( 0.58, 0.86, length( surfaceNormal.xz ) * swellScale + noise.z * 0.12 ) * whitecapStrength;\n\t\t\t\t\tvec3 outgoingLight = mix( albedo, vec3( 0.82, 0.88, 0.86 ) + sunColor * 0.04, whitecap );\n\t\t\t\t\tgl_FragColor = vec4( outgoingLight, alpha );',
  },
];

export function patchWaterShader(fragmentShader) {
  let shader = fragmentShader;
  for (const { anchor, replacement } of PATCHES) {
    if (!shader.includes(anchor)) throw new Error(`Water shader patch anchor not found: ${anchor.slice(0, 80)}`);
    shader = shader.replace(anchor, replacement);
  }
  return shader;
}

export function configureSea(water, { wind = new THREE.Vector3(0, 0, 1), swell = 1, whitecaps = 0.16 } = {}) {
  if (!water?.material?.uniforms) throw new TypeError('configureSea requires a THREE Water mesh with material uniforms');
  const material = water.material;
  if (material.userData?.seaShaderFallback) return { update() { return this; } };
  if (!material.userData?.seaShaderPatched) {
    try {
      material.fragmentShader = patchWaterShader(material.fragmentShader);
    } catch (error) {
      // A Three upgrade should cost sea detail, not the entire battle camera.
      material.userData.seaShaderFallback = true;
      console.warn('Sea detail patch unavailable; using standard Water', error.message);
      const fallback = { update() {
        if (material.uniforms.distortionScale) material.uniforms.distortionScale.value = Math.min(material.uniforms.distortionScale.value, 1.2);
        return fallback;
      } };
      return fallback.update();
    }
    material.uniforms.windDirection = { value: new THREE.Vector2(0, 1) };
    material.uniforms.swellScale = { value: 1 };
    material.uniforms.whitecapStrength = { value: 0.16 };
    material.userData = { ...material.userData, seaShaderPatched: true };
    material.needsUpdate = true;
  }

  const api = {
    update({ wind: nextWind = wind, swell: nextSwell = swell, whitecaps: nextWhitecaps = whitecaps } = {}) {
      const direction = windVector2(nextWind);
      material.uniforms.windDirection.value.copy(direction);
      material.uniforms.swellScale.value = THREE.MathUtils.clamp(nextSwell, 0.35, 2.2);
      material.uniforms.whitecapStrength.value = THREE.MathUtils.clamp(nextWhitecaps, 0, 0.28);
      if (material.uniforms.distortionScale) material.uniforms.distortionScale.value = Math.min(material.uniforms.distortionScale.value, 1.2);
      return api;
    },
  };
  return api.update({ wind, swell, whitecaps });
}

export const __seaTestHooks = { windVector2, patchAnchors: PATCHES.map(p => p.anchor) };
