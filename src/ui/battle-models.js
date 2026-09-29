import * as THREE from 'three';

const steel = new THREE.MeshStandardMaterial({ color: 0x57656b, metalness: 0.72, roughness: 0.35 });
const darkSteel = new THREE.MeshStandardMaterial({ color: 0x263844, metalness: 0.67, roughness: 0.43 });
const paleSteel = new THREE.MeshStandardMaterial({ color: 0x8b9693, metalness: 0.55, roughness: 0.47 });
const deck = new THREE.MeshStandardMaterial({ color: 0x6b6860, metalness: 0.25, roughness: 0.72 });
const wood = new THREE.MeshStandardMaterial({ color: 0x65452f, roughness: 0.82 });
const canvas = new THREE.MeshStandardMaterial({ color: 0xe9d9b2, side: THREE.DoubleSide, roughness: 0.9 });
const glass = new THREE.MeshStandardMaterial({ color: 0x1a343d, metalness: 0.35, roughness: 0.22 });
const wake = new THREE.MeshBasicMaterial({ color: 0xcce6e3, transparent: true, opacity: 0.47, depthWrite: false });
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
function line(parent, points, material = wake) {
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
}

function wakeLines(parent, width, length) {
  for (const side of [-1, 1]) {
    line(parent, [[side * width * 0.37, 0.035, length * 0.31], [side * (width * 0.72 + 0.45), 0.025, length * 0.85], [side * (width * 1.25 + 0.8), 0.015, length * 1.6]]);
    line(parent, [[side * (width * 0.68 + 0.3), 0.018, length * 1.1], [side * (width * 0.88 + 0.5), 0.018, length * 1.48]]);
  }
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
  wakeLines(parent, 2.9, 10.5);
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
  wakeLines(parent, width, length);
}

function sailingShip(parent) {
  hull(parent, 8, 1.7, wood);
  for (const z of [-2.15, 0.75, 2.7]) {
    cylinder(parent, 0.045, 0.08, 5, 0, 2.8, z, wood, 8);
    box(parent, 3.7, 0.05, 0.05, 0, 4.5, z, wood);
    const sail = mesh(parent, new THREE.PlaneGeometry(2.45, 2.7), canvas, 0, 3.35, z + 0.08);
    sail.rotation.y = z === 0.75 ? 0.2 : -0.13;
    line(parent, [[-1.35, 4.65, z], [-1.25, 2, z], [0, 0.43, z]], rigging);
    line(parent, [[1.35, 4.65, z], [1.25, 2, z], [0, 0.43, z]], rigging);
  }
  for (const side of [-1, 1]) for (let z = -3; z <= 3; z += 0.74) {
    cylinder(parent, 0.085, 0.085, 0.09, side * 0.82, 0.22, z, darkSteel, 7).rotation.z = Math.PI / 2;
  }
  wakeLines(parent, 1.7, 8);
}

function submarine(parent) {
  const body = mesh(parent, new THREE.SphereGeometry(1, 18, 10), darkSteel, 0, -0.16, 0);
  body.scale.set(0.68, 0.57, 4.2);
  box(parent, 0.55, 0.8, 1.15, 0, 0.55, -0.3, darkSteel);
  box(parent, 2.1, 0.05, 0.46, 0, -0.19, 2.7, darkSteel);
  box(parent, 0.06, 1.1, 0.8, 0, 0.2, 3.7, darkSteel);
}

function reportMarker(parent, stale, uncertainty) {
  const material = new THREE.MeshBasicMaterial({ color: stale ? 0xb7bdc0 : 0xd6bb92, transparent: true, opacity: stale ? 0.21 : 0.34, depthWrite: false, side: THREE.DoubleSide });
  const ring = mesh(parent, new THREE.RingGeometry(Math.max(1.1, uncertainty * 1.2), Math.max(1.2, uncertainty * 1.2 + 0.13), 48), material, 0, 0.08, 0);
  ring.rotation.x = -Math.PI / 2;
  const buoy = cylinder(parent, 0.03, 0.03, 1.4, 0, 0.77, 0, material, 8);
  buoy.castShadow = false;
}

export function createActorModel(actor, era) {
  const group = new THREE.Group();
  if (!actor.own && actor.uncertain) reportMarker(group, actor.stale, actor.uncertainty);
  else {
    const type = actor.type || '';
    if (/carrier/i.test(type)) carrier(group);
    else if (era === 'sail') sailingShip(group);
    else if (/submarine|ssn|ssbn|attack boat/i.test(type) || (era === 'coldwar' && !/destroyer|carrier/i.test(type))) submarine(group);
    else surfaceShip(group, type, era);
    if (!actor.own) group.traverse(obj => { if (obj.isMesh && obj.material === steel) obj.material = darkSteel; });
  }
  group.userData.type = actor.type;
  group.userData.uncertain = actor.uncertain;
  return group;
}

export function disposeActorModel(group) {
  group.traverse(item => {
    item.geometry?.dispose();
    if (item.material && ![steel, darkSteel, paleSteel, deck, wood, canvas, glass, wake, glow, rigging].includes(item.material)) item.material.dispose();
  });
}
