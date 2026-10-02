import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shipSpecFor } from './ship-specs.js';
import { createBootToppingGeometry, createLoftedHullGeometry, createSheerDeckGeometry, hullDimensions, hullWaterlineStations } from './ship-hull.js';

// Painted steel is a dielectric: warship grey reads as paint under the sky
// environment map, and the sun's sheen does the glistening.
const steel = new THREE.MeshStandardMaterial({ color: 0x74828a, metalness: 0.22, roughness: 0.52 });
const darkSteel = new THREE.MeshStandardMaterial({ color: 0x3a4a54, metalness: 0.25, roughness: 0.5 });
const subSteel = new THREE.MeshStandardMaterial({ color: 0x526b73, metalness: 0.45, roughness: 0.48, emissive: 0x174253, emissiveIntensity: 0.42 });
const paleSteel = new THREE.MeshStandardMaterial({ color: 0x9ba5a3, metalness: 0.18, roughness: 0.58 });
const deck = new THREE.MeshStandardMaterial({ color: 0x8a7b64, metalness: 0, roughness: 0.82 });
const wood = new THREE.MeshStandardMaterial({ color: 0x3a2e25, roughness: 0.74 });
const ochre = new THREE.MeshStandardMaterial({ color: 0xc49a55, roughness: 0.7 });
const canvas = new THREE.MeshStandardMaterial({ color: 0xf0e4c6, side: THREE.DoubleSide, roughness: 0.95 });
const glass = new THREE.MeshStandardMaterial({ color: 0x1a343d, metalness: 0.1, roughness: 0.08 });
const glow = new THREE.MeshBasicMaterial({ color: 0xe4c592, transparent: true, opacity: 0.67 });
const rigging = new THREE.LineBasicMaterial({ color: 0x46525a });
const boot = new THREE.MeshStandardMaterial({ color: 0x151c20, metalness: 0.08, roughness: 0.68 });

function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  part.castShadow = true;
  part.receiveShadow = true;
  parent.add(part);
  return part;
}
function box(parent, w, h, l, x, y, z, material = steel) {
  return mesh(parent, new THREE.BoxGeometry(w, h, l), material, x, y, z);
}
function cylinder(parent, radiusTop, radiusBottom, height, x, y, z, material = steel, sides = 10) {
  return mesh(parent, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides), material, x, y, z);
}
function line(parent, points, material = rigging) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
  const item = new THREE.Line(geometry, material);
  parent.add(item);
  return item;
}

const materials = { steel, darkSteel, subSteel, paleSteel, deck, wood, ochre, canvas, glass, boot, glow, rigging };
function materialFor(spec, role, fallback = steel) { return materials[spec.paint?.[role]] || fallback; }

function hull(parent, spec) {
  const body = mesh(parent, createLoftedHullGeometry(spec), materialFor(spec, 'hull'));
  body.name = 'lofted-hull';
  body.receiveShadow = true;
  mesh(parent, createBootToppingGeometry(spec), materialFor(spec, 'boot', boot)).name = 'boot-topping';
  mesh(parent, createSheerDeckGeometry(spec), materialFor(spec, 'deck', deck)).name = 'sheered-deck';
}


function markPart(parent, name) {
  (parent.userData.parts ||= []).push(name);
}
function groupGunStyle(parent, style) { parent.userData.gunStyle = style; }

function slopedBoxGeometry(bottomW, topW, h, l) {
  const bw = bottomW / 2, tw = topW / 2, y0 = 0, y1 = h, z0 = -l / 2, z1 = l / 2;
  const vertices = [
    [-bw, y0, z0], [bw, y0, z0], [tw, y1, z0], [-tw, y1, z0],
    [-bw, y0, z1], [bw, y0, z1], [tw, y1, z1], [-tw, y1, z1],
  ];
  const indices = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function casemate(parent, spec, deckY) {
  const c = spec.casemate;
  mesh(parent, slopedBoxGeometry(c.width, c.width * (1 - c.slope), c.height, c.length), materialFor(spec, 'upper', darkSteel), 0, deckY + 0.035, c.z || 0).name = 'sloped-casemate';
  markPart(parent, 'sloped-casemate');
  const gunY = deckY + c.height * 0.48;
  for (const side of [-1, 1]) for (const z of spec.broadsideGuns || []) {
    const gun = cylinder(parent, 0.045, 0.045, 0.58, side * (c.width * 0.52), gunY, z, darkSteel, 7);
    gun.rotation.z = Math.PI / 2;
    markPart(parent, 'casemate-broadside-guns');
  }
}

function monitorTurret(parent, spec, deckY) {
  const t = spec.monitorTurret;
  cylinder(parent, t.radius, t.radius, t.height, 0, deckY + t.height / 2 + 0.025, t.z, darkSteel, 18).name = 'round-monitor-turret';
  markPart(parent, 'round-monitor-turret');
  const offsets = t.barrels === 1 ? [0] : [-t.radius * 0.22, t.radius * 0.22];
  for (const dx of offsets) {
    const gun = cylinder(parent, 0.055, 0.055, 0.9, dx, deckY + t.height * 0.55, t.z - t.radius - 0.25, darkSteel, 8);
    gun.rotation.x = Math.PI / 2;
  }
  box(parent, 0.34, 0.28, 0.32, 0, deckY + 0.17, t.z - 1.05, materialFor(spec, 'upper', darkSteel)).name = 'monitor-pilot-house';
  markPart(parent, 'monitor-pilot-house');
}

function exposedDeckGuns(parent, spec, deckY) {
  for (const g of spec.exposedGuns || []) {
    const dir = g.facing === 'aft' ? 1 : -1;
    const gun = cylinder(parent, 0.045, 0.045, 0.78, 0, deckY + 0.18, g.z + dir * 0.32, darkSteel, 7);
    gun.rotation.x = Math.PI / 2;
    box(parent, 0.24, 0.12, 0.18, 0, deckY + 0.08, g.z, materialFor(spec, 'upper', wood));
  }
  if (spec.exposedGuns?.length) markPart(parent, 'exposed-deck-guns');
}

function turret(parent, x, z, large = false, barrels = 2, deckY = 0.55, facing = z < 0 ? 'fore' : 'aft') {
  const w = large ? 1.08 : 0.66, h = large ? 0.32 : 0.24, l = large ? 0.78 : 0.48;
  const geometry = new THREE.BoxGeometry(w, h, l);
  const pos = geometry.getAttribute('position');
  const dir = facing === 'aft' ? 1 : -1;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), z0 = pos.getZ(i);
    if (z0 * dir > 0 && y > 0) pos.setX(i, pos.getX(i) * 0.82);
  }
  geometry.computeVertexNormals();
  mesh(parent, geometry, paleSteel, x, deckY + h / 2 + 0.025, z);
  const offsets = barrels === 1 ? [0] : [-w * 0.18, w * 0.18];
  for (const dx of offsets) {
    const gun = cylinder(parent, large ? 0.075 : 0.05, large ? 0.075 : 0.05, large ? 1.45 : 0.9, x + dx, deckY + h * 0.6 + 0.025, z + dir * (large ? 0.78 : 0.48), darkSteel, 7);
    gun.rotation.x = Math.PI / 2;
  }
}

function mast(parent, y, z, deckY = 0.55) {
  cylinder(parent, 0.025, 0.055, y, 0, deckY + y / 2, z, darkSteel, 7);
  box(parent, 1.1, 0.045, 0.05, 0, deckY + y * 0.74, z, darkSteel);
  for (const x of [-0.54, 0.54]) line(parent, [[x, deckY + y * 0.74, z], [0, deckY + 0.12, z + (x < 0 ? -0.4 : 0.4)]], rigging);
}

function funnel(parent, x, z, tall = 1.1, deckY = 0.55) {
  cylinder(parent, 0.28, 0.36, tall, x, deckY + tall / 2, z, darkSteel, 10);
  cylinder(parent, 0.3, 0.3, 0.1, x, deckY + tall + 0.05, z, paleSteel, 10);
  (parent.userData.funnels ||= []).push(new THREE.Vector3(x, deckY + tall + 0.1, z));
}

// Foam: tileable speckle in a texture that scrolls aft (animateWakes), with the
// fade along and across each ribbon carried in vertex alpha so it never scrolls.
let foamTexture = null;
function foam() {
  if (foamTexture) return foamTexture;
  const size = 128;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (globalThis.document?.createElement) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    // A soft sheet of churned water broken by streaks of brighter foam, drawn
    // wrapped so the tile repeats seamlessly as it scrolls.
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * size, y = rnd() * size, r = 0.6 + rnd() * rnd() * 3.5;
      ctx.fillStyle = `rgba(255,255,255,${0.1 + rnd() * 0.45})`;
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
        ctx.beginPath(); ctx.ellipse(x + dx, y + dy, r, r * (1.5 + rnd() * 3), 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    foamTexture = new THREE.CanvasTexture(c);
  } else {
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const v = 190 + Math.floor(rnd() * rnd() * 65);
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
      data[i * 4 + 3] = 70 + Math.floor(rnd() * 100);
    }
    foamTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    foamTexture.needsUpdate = true;
  }
  foamTexture.wrapS = foamTexture.wrapT = THREE.RepeatWrapping;
  foamTexture.colorSpace = THREE.SRGBColorSpace;
  return foamTexture;
}
export function animateWakes(seconds) { if (foamTexture) foamTexture.offset.y = -seconds * 0.35; }
const wakeMaterial = new THREE.MeshBasicMaterial({ color: 0xe8f1ee, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });

// A ribbon along [x, z, halfWidth, alpha] stations; alpha fades to 0 at its edges.
function ribbon(parent, stations) {
  const positions = [], colors = [], uvs = [], index = [];
  let v = 0;
  stations.forEach(([x, z, half, alpha], i) => {
    if (i) v += Math.hypot(x - stations[i - 1][0], z - stations[i - 1][1]) / 6;
    const [nx, nz] = stations[Math.min(i + 1, stations.length - 1)];
    const [px, pz] = stations[Math.max(i - 1, 0)];
    const len = Math.hypot(nx - px, nz - pz) || 1;
    const ox = (nz - pz) / len * half, oz = -(nx - px) / len * half;
    for (const [side, u] of [[-1, 0], [0, 0.5], [1, 1]]) {
      positions.push(x + ox * side, 0.035, z + oz * side);
      colors.push(1, 1, 1, side ? 0 : alpha);
      uvs.push(u * half, v * 3);
    }
    if (i) for (const k of [0, 1]) {
      const a = (i - 1) * 3 + k, b = i * 3 + k;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  parent.add(new THREE.Mesh(geometry, wakeMaterial));
}

function foamWake(parent, width, length) {
  wakeMaterial.map ??= foam();
  const group = new THREE.Group();
  group.name = 'wake';
  const bow = -length * 0.5, stern = length * 0.45;
  ribbon(group, Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    return [Math.sin(t * 9) * 0.08 * t, stern + t * length * 1.9, width * (0.3 + t * 0.55), 0.8 * (1 - t) ** 1.3];
  }));
  for (const side of [-1, 1]) {
    // Kelvin arms spread at about 19.5 degrees from the bow shoulders.
    ribbon(group, Array.from({ length: 8 }, (_, i) => {
      const t = i / 7, z = bow + length * 0.2 + t * length * 2;
      return [side * (width * 0.5 + (z - bow - length * 0.2) * 0.354), z, 0.2 + t * 0.7, 0.34 * (1 - t) ** 1.5];
    }));
    ribbon(group, [[0, bow - 0.05, 0.12, 0.7], [side * width * 0.32, bow + length * 0.08, 0.2, 0.9], [side * width * 0.62, bow + length * 0.24, 0.26, 0.6], [side * width * 0.72, bow + length * 0.42, 0.22, 0]]);
  }
  mergeParts(group);
  group.children[0].renderOrder = 1;
  parent.add(group);
}

// sides: one [[x, z], ...] bow-to-stern station list per side of the hull.
function waterlineFoam(parent, sides) {
  wakeMaterial.map ??= foam();
  const group = new THREE.Group();
  group.name = 'waterline-foam';
  group.userData.stationarySurfaceFoam = true;
  for (const stations of sides) {
    ribbon(group, stations.map(([x, z], i) => {
      const t = i / (stations.length - 1);
      const taper = Math.sin(Math.PI * t) ** 0.35;
      return [x, z, 0.08 + 0.1 * taper, 0.28 + 0.24 * taper];
    }));
  }
  mergeParts(group);
  group.children[0].renderOrder = 1;
  parent.add(group);
  return group;
}

function aircraft(parent, x, z) {
  box(parent, 0.08, 0.045, 0.55, x, 0.86, z, paleSteel);
  box(parent, 0.56, 0.035, 0.09, x, 0.87, z - 0.05, paleSteel);
  box(parent, 0.21, 0.035, 0.06, x, 0.88, z + 0.19, paleSteel);
}

function carrier(parent, spec) {
  hull(parent, spec);
  const { length, beam, freeboard } = spec.dimensions;
  const deckY = freeboard + 0.045;
  box(parent, beam * 1.24, 0.23, length * 1.03, -0.22, deckY + 0.18, 0, materialFor(spec, 'deck', deck));
  for (let z = -length * 0.42; z <= length * 0.43; z += 1.2) box(parent, 0.055, 0.014, 0.58, -beam * 0.19, deckY + 0.31, z, glow);
  box(parent, 0.85, 0.7, 1.65, spec.island?.x ?? 1.15, deckY + 0.45, spec.island?.z ?? -0.45, paleSteel);
  box(parent, 0.92, 0.2, 0.48, spec.island?.x ?? 1.15, deckY + 0.9, (spec.island?.z ?? -0.45) - 0.5, glass);
  for (const m of spec.masts || []) mast(parent, m.height, m.z, deckY);
  for (const [x, z] of [[-1.1, -2.8], [0.3, 1.6], [-1.0, 2.8]]) aircraft(parent, x, z);
  return hullDimensions(spec);
}

function surfaceShip(parent, spec) {
  hull(parent, spec);
  const { beam, freeboard } = spec.dimensions;
  const deckY = freeboard + 0.045;
  const bridge = spec.bridge || { z: -0.3, length: 1.5, height: 0.75 };
  if (spec.gunStyle !== 'casemate') {
    box(parent, beam * 0.58, bridge.height, bridge.length, 0, deckY + 0.05 + bridge.height / 2, bridge.z, materialFor(spec, 'upper', paleSteel));
    box(parent, beam * 0.45, 0.18, 0.47, 0, deckY + bridge.height + 0.18, bridge.z - 0.35, materialFor(spec, 'glass', glass));
  }
  box(parent, beam * 0.74, 0.1, Math.max(1.8, bridge.length * 1.65), 0, deckY + 0.06, bridge.z, materialFor(spec, 'deck', deck));
  if (spec.gunStyle === 'casemate') casemate(parent, spec, deckY);
  else if (spec.gunStyle === 'monitor-turret') monitorTurret(parent, spec, deckY);
  else if (spec.gunStyle === 'exposed') exposedDeckGuns(parent, spec, deckY);
  else for (const t of spec.turrets || []) turret(parent, t.x || 0, t.z, t.size === 'large', t.barrels || 1, deckY, t.facing);
  if (spec.gunStyle) groupGunStyle(parent, spec.gunStyle);
  for (const f of spec.funnels || []) funnel(parent, f.x || 0, f.z, f.height || 1, deckY + (spec.gunStyle === 'casemate' ? spec.casemate.height + 0.035 : 0));
  for (const m of spec.masts || []) mast(parent, m.height, m.z, deckY);
  if (spec.paddleBoxes) for (const side of [-1, 1]) box(parent, beam * 0.28, 0.56, 1.28, side * beam * 0.58, deckY + 0.05, 0.25, materialFor(spec, 'upper', paleSteel));
  return hullDimensions(spec);
}

// A sail card bellied forward by the wind, so it catches light like canvas.
function billowedSail(width, height) {
  const geometry = new THREE.PlaneGeometry(width, height, 8, 8);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const u = position.getX(i) / width + 0.5, v = position.getY(i) / height + 0.5;
    position.setZ(i, -Math.sin(Math.PI * u) * (0.25 + 0.2 * Math.sin(Math.PI * v)) * 0.9);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function sailingShip(parent, spec) {
  hull(parent, spec);
  const { beam, freeboard } = spec.dimensions;
  const deckY = freeboard + 0.045;
  box(parent, beam * 0.92, 0.13, 5.6, 0, deckY + 0.08, 0.1, materialFor(spec, 'deck', ochre));
  for (const m of spec.masts || []) {
    cylinder(parent, 0.035, 0.085, m.height, 0, deckY + m.height / 2, m.z, wood, 8);
    for (let tier = 0; tier < (spec.sails?.tiers || 3); tier++) {
      const y = deckY + 1.3 + tier * 1.08;
      const width = (spec.sails?.width || 2.4) * (1 - tier * 0.14);
      const height = (spec.sails?.height || 0.95) * (1 - tier * 0.08);
      box(parent, width * 1.32, 0.045, 0.05, 0, y + height * 0.55, m.z, wood);
      const sail = mesh(parent, billowedSail(width, height), canvas, 0, y, m.z + 0.08);
      sail.rotation.y = m.z > 0 ? 0.18 : -0.13;
    }
    line(parent, [[-1.35, deckY + m.height * 0.86, m.z], [-1.25, deckY + 1.55, m.z], [0, deckY + 0.12, m.z]], rigging);
    line(parent, [[1.35, deckY + m.height * 0.86, m.z], [1.25, deckY + 1.55, m.z], [0, deckY + 0.12, m.z]], rigging);
  }
  for (const side of [-1, 1]) for (let z = -3; z <= 3; z += 0.74) {
    cylinder(parent, 0.085, 0.085, 0.09, side * beam * 0.47, deckY - 0.25, z, darkSteel, 7).rotation.z = Math.PI / 2;
  }
  return hullDimensions(spec);
}

function submarine(parent) {
  const body = mesh(parent, new THREE.SphereGeometry(1, 18, 10), subSteel, 0, -0.16, 0);
  body.scale.set(0.68, 0.57, 4.2);
  box(parent, 0.55, 0.8, 1.15, 0, 0.55, -0.3, subSteel);
  box(parent, 2.1, 0.05, 0.46, 0, -0.19, 2.7, subSteel);
  box(parent, 0.06, 1.1, 0.8, 0, 0.2, 3.7, subSteel);
}

function reportMarker(parent, stale, uncertainty) {
  const material = new THREE.MeshBasicMaterial({ color: stale ? 0xb7bdc0 : 0xd6bb92, transparent: true, opacity: stale ? 0.21 : 0.34, depthWrite: false, side: THREE.DoubleSide });
  const ring = mesh(parent, new THREE.RingGeometry(Math.max(1.1, uncertainty * 1.2), Math.max(1.2, uncertainty * 1.2 + 0.13), 48), material, 0, 0.08, 0);
  ring.rotation.x = -Math.PI / 2;
  const buoy = cylinder(parent, 0.03, 0.03, 1.4, 0, 0.77, 0, material, 8);
  buoy.castShadow = false;
}

// Bake a hull's parts into one mesh per material (and one set of rigging lines),
// so a ship costs a handful of draw calls in each of the shadow, reflection and
// main passes instead of dozens.
function mergeParts(group) {
  const meshes = new Map(), lines = new Map();
  const bucket = (map, material) => map.get(material) || map.set(material, []).get(material);
  for (const part of [...group.children]) {
    if (!part.isMesh && !part.isLine) continue;
    part.updateMatrix();
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    geometry.applyMatrix4(part.matrix);
    if (part.isLine) {
      const p = geometry.getAttribute('position').array;
      for (let i = 3; i < p.length; i += 3) bucket(lines, part.material).push(p[i - 3], p[i - 2], p[i - 1], p[i], p[i + 1], p[i + 2]);
      geometry.dispose();
    } else {
      for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) geometry.deleteAttribute(name);
      bucket(meshes, part.material).push(geometry);
    }
    group.remove(part);
    part.geometry.dispose();
  }
  for (const [material, geometries] of meshes) {
    const merged = new THREE.Mesh(mergeGeometries(geometries), material);
    merged.castShadow = merged.receiveShadow = !material.transparent;
    group.add(merged);
    geometries.forEach(g => g.dispose());
  }
  for (const [material, points] of lines) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    group.add(new THREE.LineSegments(geometry, material));
  }
}

// userData: radius (camera framing, measured before surface foam/wake), size
// (presentation dimensions), funnels (smoke sources, model space), wake (shown
// only while under way), and waterlineFoam (stationary intersection foam).
export function createActorModel(actor, era) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ'; // heading, then pitch and roll in the ship's own frame
  let size = null;
  if (!actor.own && actor.uncertain) reportMarker(group, actor.stale, actor.uncertainty);
  else {
    const type = actor.className || actor.type || '';
    const spec = shipSpecFor(type, era);
    if (spec.key === 'submarine') submarine(group);
    else if (spec.key === 'carrier') size = carrier(group, spec);
    else if (spec.key === 'sail_frigate' || spec.key === 'wooden_sail_ship') size = sailingShip(group, spec); // no funnel, so no coal smoke
    else size = surfaceShip(group, spec);
    group.userData.specKey = spec.key;
    if (!actor.own) group.traverse(obj => { if (obj.isMesh && obj.material === steel) obj.material = darkSteel; });
  }
  mergeParts(group);
  group.userData.radius = new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere()).radius || 1;
  if (size) {
    group.userData.size = size;
    const spec = shipSpecFor(actor.className || actor.type || '', era);
    group.userData.waterlineFoam = waterlineFoam(group, [-1, 1].map(side => hullWaterlineStations(spec, side, 0.035)));
    foamWake(group, size.width, size.length);
  }
  group.userData.wake = group.getObjectByName('wake') || null;
  group.userData.type = actor.type;
  group.userData.uncertain = actor.uncertain;
  return group;
}

// Waterline foam and bow wave/wake for an authored model, from its own hull:
// userData.waterline ([[halfBreadth, z], ...] in model units) when the asset
// carries one, else a fair lens from userData.size. Never reuse the procedural
// stand-in's foam: its hull is a different width.
export function createSurfaceEffects(model) {
  const size = model.userData.size;
  if (!size) return model;
  let contour = model.userData.waterline;
  if (!contour?.length) {
    contour = Array.from({ length: 17 }, (_, i) => {
      const t = i / 16;
      return [size.width / 2 * Math.sin(Math.PI * t) ** 0.6, (t - 0.5) * size.length];
    });
  }
  const eps = size.width * 0.018;
  const sides = [-1, 1].map(side => contour.map(([half, z]) => [side * (half + (half > 0 ? eps : 0)), z]));
  model.userData.waterlineFoam = waterlineFoam(model, sides);
  foamWake(model, size.width, size.length);
  model.userData.wake = model.children.find(child => child.name === 'wake') || null;
  return model;
}

export function disposeActorModel(group) {
  group.traverse(item => {
    item.geometry?.dispose();
    if (item.material && ![steel, darkSteel, subSteel, paleSteel, deck, wood, ochre, canvas, glass, boot, wakeMaterial, glow, rigging].includes(item.material)) item.material.dispose();
  });
}
