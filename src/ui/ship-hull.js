import * as THREE from 'three';

const DEFAULT_HULL = { bowFine: 0.04, sternWidth: 0.7, sheer: 0.16, flare: 0.1, tumblehome: 0.06, rake: 0.04, ram: 0 };
const STATIONS = [-0.52, -0.5, -0.475, -0.44, -0.39, -0.32, -0.24, -0.16, -0.08, 0, 0.08, 0.16, 0.24, 0.32, 0.39, 0.44, 0.475, 0.5, 0.52];

const clamp01 = n => Math.max(0, Math.min(1, n));
const hullParams = spec => ({ ...DEFAULT_HULL, ...spec.hull });

function sectionMetrics(spec, zNorm) {
  const { beam, freeboard, draft } = spec.dimensions, hull = hullParams(spec);
  const bowT = clamp01((zNorm + 0.52) / 0.28), sternT = clamp01((0.52 - zNorm) / 0.24);
  const bowFactor = hull.bowFine + (1 - hull.bowFine) * Math.sin(bowT * Math.PI / 2);
  const sternFactor = hull.sternWidth + (1 - hull.sternWidth) * Math.sin(sternT * Math.PI / 2);
  const fullness = Math.min(bowFactor, sternFactor) * (0.92 + 0.08 * Math.cos(zNorm * Math.PI));
  const endLift = Math.abs(zNorm) ** 1.65;
  const deckY = freeboard + hull.sheer * endLift, waterY = -0.02 + 0.04 * endLift;
  const keelY = -draft + 0.18 * endLift - (zNorm < -0.46 ? hull.ram * spec.dimensions.length * 0.15 : 0);
  const halfDeck = beam * 0.5 * fullness, flare = hull.flare * beam * fullness * (0.25 + endLift);
  const halfWater = halfDeck * (1 - hull.tumblehome * 0.35);
  return { deckY, waterY, keelY, halfTop: halfDeck + flare, halfDeck, halfWater, halfTurn: halfWater * (0.7 + 0.12 * fullness), halfBilge: halfWater * (0.43 + 0.11 * fullness), halfKeel: halfWater * (0.16 + 0.1 * fullness) };
}

function zAt(spec, zNorm, y) {
  const hull = hullParams(spec);
  const { freeboard, draft } = spec.dimensions, high = clamp01((y + draft) / (freeboard + draft));
  const bowFade = clamp01((-zNorm - 0.3) / 0.22);
  return zNorm * spec.dimensions.length + bowFade * (high * hull.rake * spec.dimensions.length - (1 - high) * hull.ram * spec.dimensions.length);
}

function sectionShape(spec, zNorm) {
  const m = sectionMetrics(spec, zNorm), midLow = (m.waterY + m.keelY) / 2, lowTurn = m.keelY + (m.waterY - m.keelY) * 0.24;
  return [
    [-m.halfTop, m.deckY], [-m.halfDeck * 0.98, m.deckY - 0.07], [-m.halfWater, m.waterY],
    [-m.halfTurn, (m.waterY + midLow) / 2], [-m.halfBilge, midLow], [-m.halfKeel, lowTurn], [0, m.keelY],
    [m.halfKeel, lowTurn], [m.halfBilge, midLow], [m.halfTurn, (m.waterY + midLow) / 2],
    [m.halfWater, m.waterY], [m.halfDeck * 0.98, m.deckY - 0.07], [m.halfTop, m.deckY],
  ];
}

function buildGeometry(positions, uvs, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

export function createLoftedHullGeometry(spec) {
  const positions = [], uvs = [], indices = [];
  const ring = sectionShape(spec, 0).length;
  for (const zNorm of STATIONS) for (const [x, y] of sectionShape(spec, zNorm)) {
    positions.push(x, y, zAt(spec, zNorm, y));
    uvs.push((x / spec.dimensions.beam) + 0.5, zNorm + 0.5);
  }
  for (let s = 0; s < STATIONS.length - 1; s++) for (let i = 0; i < ring - 1; i++) {
    const a = s * ring + i, b = a + 1, c = (s + 1) * ring + i, d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
  for (let i = 1; i < ring - 1; i++) indices.push(0, i + 1, i);
  const sternStart = (STATIONS.length - 1) * ring;
  for (let i = 1; i < ring - 1; i++) indices.push(sternStart, sternStart + i, sternStart + i + 1);
  return buildGeometry(positions, uvs, indices);
}

function sideXAtY(points, side, y) {
  const signed = points.map(([x0, y0]) => [x0 * side, y0]).filter(([x0]) => x0 >= 0);
  let best = 0;
  for (let i = 0; i < signed.length - 1; i++) {
    const [x1, y1] = signed[i], [x2, y2] = signed[i + 1];
    if (y >= Math.min(y1, y2) && y <= Math.max(y1, y2) && y1 !== y2) best = Math.max(best, x1 + (x2 - x1) * ((y - y1) / (y2 - y1)));
  }
  return side * best;
}

export function createSheerDeckGeometry(spec) {
  const positions = [], uvs = [], indices = [];
  for (const zNorm of STATIONS) {
    const shape = sectionShape(spec, zNorm), left = shape[0], right = shape.at(-1);
    positions.push(left[0], left[1] + 0.025, zAt(spec, zNorm, left[1]), right[0], right[1] + 0.025, zAt(spec, zNorm, right[1]));
    uvs.push(0, zNorm + 0.5, 1, zNorm + 0.5);
  }
  for (let s = 0; s < STATIONS.length - 1; s++) { const a = s * 2, b = a + 1, c = (s + 1) * 2, d = c + 1; indices.push(a, c, b, b, c, d); }
  return buildGeometry(positions, uvs, indices);
}

export function createBootToppingGeometry(spec) {
  const positions = [], uvs = [], indices = [], yLow = -0.12, yHigh = 0.13, eps = spec.dimensions.beam * 0.012;
  for (const zNorm of STATIONS) {
    const shape = sectionShape(spec, zNorm);
    for (const side of [-1, 1]) {
      positions.push(sideXAtY(shape, side, yLow) + side * eps, yLow, zAt(spec, zNorm, yLow), sideXAtY(shape, side, yHigh) + side * eps, yHigh, zAt(spec, zNorm, yHigh));
      uvs.push(0, zNorm + 0.5, 1, zNorm + 0.5);
    }
  }
  for (let s = 0; s < STATIONS.length - 1; s++) {
    let a = s * 4, b = a + 1, c = (s + 1) * 4, d = c + 1; indices.push(a, c, b, b, c, d);
    a = s * 4 + 2; b = a + 1; c = (s + 1) * 4 + 2; d = c + 1; indices.push(a, b, c, b, d, c);
  }
  return buildGeometry(positions, uvs, indices);
}

export function hullWaterlineStations(spec, side, y = 0.035) {
  const eps = spec.dimensions.beam * 0.018;
  return STATIONS.map(zNorm => [sideXAtY(sectionShape(spec, zNorm), side, y) + side * eps, zAt(spec, zNorm, y)]);
}

export function hullDimensions(spec) {
  return { width: spec.dimensions.beam, length: spec.dimensions.length, draft: spec.dimensions.draft, freeboard: spec.dimensions.freeboard };
}
