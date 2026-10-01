import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import * as THREE from 'three';

// Original synthetic data, not historical art. Encoder is temporary external
// tooling, not a runtime/repo dependency. Regenerate with KTX_BIN=/path/to/ktx.
const encoder = process.env.KTX_BIN || 'ktx';
function run(args) {
  const result = spawnSync(encoder, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr || result.stdout);
  return result.stdout;
}
if (!/4\.4\.2\b/.test(run(['--version']))) throw new Error('Fixture generation requires pinned KTX-Software 4.4.2');
const temp = await mkdtemp(join(tmpdir(), 'ship-fixture-'));
function chunk(type, data) {
  const name = Buffer.from(type), body = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const prefix = Buffer.alloc(4), suffix = Buffer.alloc(4);
  prefix.writeUInt32BE(data.length); suffix.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([prefix, body, suffix]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(8, 0); header.writeUInt32BE(8, 4); header[8] = 8; header[9] = 6;
const pixels = Buffer.alloc(8 * (1 + 8 * 4));
for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
  const color = ((x >> 2) + (y >> 2)) % 2 ? [210, 170, 100, 255] : [45, 100, 130, 255];
  pixels.set(color, y * 33 + 1 + x * 4);
}
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('sRGB', Buffer.from([0])), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
await writeFile(join(temp, 'checker.png'), png);
run(['create', '--format', 'R8G8B8A8_SRGB', '--encode', 'basis-lz', join(temp, 'checker.png'), join(temp, 'checker.ktx2')]);
run(['validate', join(temp, 'checker.ktx2')]);
const texture = await readFile(join(temp, 'checker.ktx2'));
const geometry = new THREE.BoxGeometry(28, 12, 210);
const position = geometry.getAttribute('position');
for (let i = 0; i < position.count; i++) {
  if (position.getZ(i) < 0) position.setX(i, position.getX(i) * 0.1);
  position.setY(i, position.getY(i) + 2 + (position.getY(i) > 0 && position.getZ(i) < 0 ? 2 : 0));
}
geometry.computeVertexNormals(); geometry.computeBoundingBox();
const buffers = [], bufferViews = []; let length = 0;
function add(bytes, target) {
  const padding = (4 - length % 4) % 4;
  if (padding) { buffers.push(Buffer.alloc(padding)); length += padding; }
  const view = { buffer: 0, byteOffset: length, byteLength: bytes.length, ...(target ? { target } : {}) };
  bufferViews.push(view); buffers.push(bytes); length += bytes.length;
  return bufferViews.length - 1;
}
const accessors = [];
for (const [name, type] of [['position', 'VEC3'], ['normal', 'VEC3'], ['uv', 'VEC2']]) {
  const a = geometry.getAttribute(name);
  const accessor = { bufferView: add(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength), 34962), componentType: 5126, count: a.count, type };
  if (name === 'position') { accessor.min = geometry.boundingBox.min.toArray(); accessor.max = geometry.boundingBox.max.toArray(); }
  accessors.push(accessor);
}
const indices = geometry.index;
accessors.push({ bufferView: add(Buffer.from(indices.array.buffer, indices.array.byteOffset, indices.array.byteLength), 34963), componentType: 5123, count: indices.count, type: 'SCALAR' });
const image = add(texture);
const json = { asset: { version: '2.0', generator: 'Weather Gage original fixture / KTX-Software 4.4.2' }, extensionsUsed: ['KHR_texture_basisu'], extensionsRequired: ['KHR_texture_basisu'], scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.8 } }], samplers: [{ minFilter: 9729, magFilter: 9729 }], textures: [{ sampler: 0, extensions: { KHR_texture_basisu: { source: 0 } } }], images: [{ bufferView: image, mimeType: 'image/ktx2' }], accessors, bufferViews, buffers: [{ byteLength: length }] };
const jsonBytes = Buffer.from(JSON.stringify(json));
const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc((4 - jsonBytes.length % 4) % 4, 0x20)]);
const bin = Buffer.concat([...buffers, Buffer.alloc((4 - length % 4) % 4)]);
const glbHeader = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
glbHeader.writeUInt32LE(0x46546c67, 0); glbHeader.writeUInt32LE(2, 4); glbHeader.writeUInt32LE(12 + 8 + paddedJson.length + 8 + bin.length, 8);
jsonHeader.writeUInt32LE(paddedJson.length); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
binHeader.writeUInt32LE(bin.length); binHeader.writeUInt32LE(0x004e4942, 4);
await writeFile(new URL('../tests/fixtures/ship-loader/mini-basis.glb', import.meta.url), Buffer.concat([glbHeader, jsonHeader, paddedJson, binHeader, bin]));
geometry.dispose();
console.log(`Generated original fixture: ${glbHeader.readUInt32LE(8)} bytes; 12 triangles; 8x8 Basis texture. Temporary sources: ${temp}`);
