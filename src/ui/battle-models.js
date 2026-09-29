import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

function hull(parent, length, width, material) {
  const shape = new THREE.Shape();
  shape.moveTo(0, length * 0.53);
  shape.lineTo(width * 0.44, length * 0.39);
  shape.lineTo(width * 0.5, -length * 0.42);
  shape.lineTo(width * 0.38, -length * 0.52);
  shape.lineTo(-width * 0.38, -length * 0.52);
  shape.lineTo(-width * 0.5, -length * 0.42);
  shape.lineTo(-width * 0.44, length * 0.39);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.65, bevelEnabled: true, bevelSize: 0.11, bevelThickness: 0.12, bevelSegments: 1 });
  geometry.rotateX(-Math.PI / 2);
  const body = mesh(parent, geometry, material, 0, -0.34, 0);
  body.receiveShadow = true;
  box(parent, width * 0.82, 0.08, length * 0.77, 0, 0.39, 0, deck);
}

function turret(parent, x, z, large = false) {
  const r = large ? 0.55 : 0.34;
  cylinder(parent, r * 0.78, r, large ? 0.31 : 0.22, x, 0.65, z, paleSteel, 9);
  for (const dx of [-r * 0.28, r * 0.28]) {
    const gun = cylinder(parent, large ? 0.075 : 0.05, large ? 0.075 : 0.05, large ? 1.45 : 0.9, x + dx, 0.69, z - (large ? 0.88 : 0.57), darkSteel, 7);
    gun.rotation.x = Math.PI / 2;
  }
}

function mast(parent, y, z) {
  cylinder(parent, 0.025, 0.055, y, 0, y / 2 + 0.4, z, darkSteel, 7);
  box(parent, 1.1, 0.045, 0.05, 0, y * 0.74 + 0.4, z, darkSteel);
  for (const x of [-0.54, 0.54]) line(parent, [[x, y * 0.74 + 0.4, z], [0, 0.52, z + (x < 0 ? -0.4 : 0.4)]], rigging);
}

function funnel(parent, x, z, tall = 1.1) {
  cylinder(parent, 0.28, 0.36, tall, x, 0.95 + tall / 2, z, darkSteel, 10);
  cylinder(parent, 0.3, 0.3, 0.1, x, 0.97 + tall, z, paleSteel, 10);
  (parent.userData.funnels ||= []).push(new THREE.Vector3(x, 1.05 + tall, z));
}

// Foam: tileable speckle in a texture that scrolls aft (animateWakes), with the
// fade along and across each ribbon carried in vertex alpha so it never scrolls.
let foamTexture = null;
function foam() {
  if (foamTexture) return foamTexture;
  const size = 128, c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
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

function aircraft(parent, x, z) {
  box(parent, 0.08, 0.045, 0.55, x, 0.86, z, paleSteel);
  box(parent, 0.56, 0.035, 0.09, x, 0.87, z - 0.05, paleSteel);
  box(parent, 0.21, 0.035, 0.06, x, 0.88, z + 0.19, paleSteel);
}

function carrier(parent) {
  hull(parent, 10.5, 2.9, darkSteel);
  box(parent, 3.7, 0.23, 11, -0.22, 0.65, 0, deck);
  for (let z = -4.5; z <= 4.5; z += 1.2) box(parent, 0.055, 0.014, 0.58, -0.55, 0.78, z, glow);
  box(parent, 0.85, 0.7, 1.65, 1.15, 1.1, -0.45, paleSteel);
  box(parent, 0.92, 0.2, 0.48, 1.15, 1.55, -0.95, glass);
  mast(parent, 2.1, -0.9);
  for (const [x, z] of [[-1.1, -2.8], [0.3, 1.6], [-1.0, 2.8]]) aircraft(parent, x, z);
  return { width: 2.9, length: 10.5 };
}

function surfaceShip(parent, type, era) {
  const destroyer = /destroyer|frigate|corvette|sloop|gunboat|torpedo boat/i.test(type);
  const ironclad = era === 'ironclad';
  const length = destroyer ? 6.1 : ironclad ? 8.5 : 9.1;
  const width = destroyer ? 1.35 : ironclad ? 2.4 : 2.15;
  hull(parent, length, width, ironclad ? darkSteel : steel);
  const bridgeZ = destroyer ? -0.55 : -0.2;
  box(parent, width * 0.61, destroyer ? 0.68 : 0.85, destroyer ? 1.35 : 1.7, 0, 0.83, bridgeZ, paleSteel);
  box(parent, width * 0.47, 0.18, 0.47, 0, destroyer ? 1.25 : 1.35, bridgeZ - 0.35, glass);
  box(parent, width * 0.76, 0.12, destroyer ? 2.3 : 3.4, 0, 0.49, bridgeZ, deck);
  turret(parent, 0, -length * 0.34, !destroyer);
  turret(parent, 0, length * 0.32, !destroyer);
  if (!destroyer && !ironclad) { turret(parent, 0, -length * 0.19, true); turret(parent, 0, length * 0.2, true); }
  funnel(parent, destroyer ? 0 : -0.2, destroyer ? 0.75 : 1.0, destroyer ? 0.8 : 1.2);
  if (!ironclad) mast(parent, destroyer ? 1.65 : 2.4, destroyer ? -1.2 : -1.65);
  return { width, length };
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

function sailingShip(parent) {
  hull(parent, 8, 1.7, wood);
  box(parent, 1.74, 0.13, 5.6, 0, 0.16, 0.1, ochre);
  for (const z of [-2.15, 0.75, 2.7]) {
    cylinder(parent, 0.045, 0.08, 5, 0, 2.8, z, wood, 8);
    box(parent, 3.7, 0.05, 0.05, 0, 4.5, z, wood);
    const sail = mesh(parent, billowedSail(2.45, 2.7), canvas, 0, 3.35, z + 0.08);
    sail.rotation.y = z === 0.75 ? 0.2 : -0.13;
    line(parent, [[-1.35, 4.65, z], [-1.25, 2, z], [0, 0.43, z]], rigging);
    line(parent, [[1.35, 4.65, z], [1.25, 2, z], [0, 0.43, z]], rigging);
  }
  for (const side of [-1, 1]) for (let z = -3; z <= 3; z += 0.74) {
    cylinder(parent, 0.085, 0.085, 0.09, side * 0.82, 0.22, z, darkSteel, 7).rotation.z = Math.PI / 2;
  }
  return { width: 1.7, length: 8 };
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

// userData: radius (camera framing, measured before the wake is added),
// funnels (smoke sources, model space) and wake (shown only while under way).
export function createActorModel(actor, era) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ'; // heading, then pitch and roll in the ship's own frame
  let size = null;
  if (!actor.own && actor.uncertain) reportMarker(group, actor.stale, actor.uncertainty);
  else {
    const type = actor.type || '';
    if (/carrier/i.test(type)) size = carrier(group);
    else if (era === 'sail' || /sail/i.test(type)) size = sailingShip(group); // no funnel, so no coal smoke
    else if (/submarine|ssn|ssbn|attack boat/i.test(type) || (era === 'coldwar' && !/destroyer|carrier/i.test(type))) submarine(group);
    else size = surfaceShip(group, type, era);
    if (!actor.own) group.traverse(obj => { if (obj.isMesh && obj.material === steel) obj.material = darkSteel; });
  }
  mergeParts(group);
  group.userData.radius = new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere()).radius || 1;
  if (size) foamWake(group, size.width, size.length);
  group.userData.wake = group.getObjectByName('wake') || null;
  group.userData.type = actor.type;
  group.userData.uncertain = actor.uncertain;
  return group;
}

export function disposeActorModel(group) {
  group.traverse(item => {
    item.geometry?.dispose();
    if (item.material && ![steel, darkSteel, subSteel, paleSteel, deck, wood, ochre, canvas, glass, wakeMaterial, glow, rigging].includes(item.material)) item.material.dispose();
  });
}
