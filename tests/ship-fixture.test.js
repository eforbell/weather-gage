import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SHIP_ASSET_REGISTRY } from '../src/ui/ship-assets.js';
import config from '../vite.config.js';

const bytes = await readFile(new URL('./fixtures/ship-loader/mini-basis.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const binary = bytes.subarray(28 + jsonLength);

test('original fixture stays tiny, structurally valid and reproducible', () => {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  assert.equal(bytes.readUInt32LE(24 + jsonLength), 0x004e4942);
  assert.ok(bytes.length < 8192, `fixture budget: ${bytes.length} bytes`);
  assert.equal(gltf.accessors[3].count / 3, 12);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '2821c8f0b31f4f961cd6d855518473bb8fd273e176fe232e7d80ee9a7bc777db');
  for (const view of gltf.bufferViews) assert.ok(view.byteOffset + view.byteLength <= binary.length);
});

test('fixture requires genuinely Basis-compressed KTX2, not a PNG fallback', () => {
  assert.deepEqual(gltf.extensionsRequired, ['KHR_texture_basisu']);
  assert.equal(gltf.images[0].mimeType, 'image/ktx2');
  assert.equal(gltf.textures[0].extensions.KHR_texture_basisu.source, 0);
  const view = gltf.bufferViews[gltf.images[0].bufferView];
  const image = binary.subarray(view.byteOffset, view.byteOffset + view.byteLength);
  assert.equal(image.subarray(0, 12).toString('hex'), 'ab4b5458203230bb0d0a1a0a');
  assert.equal(image.readUInt32LE(12), 0, 'Basis payload has undefined vkFormat');
  assert.equal(image.readUInt32LE(20), 8);
  assert.equal(image.readUInt32LE(24), 8);
  assert.equal(image.readUInt32LE(44), 1, 'BasisLZ supercompression');
});

test('test geometry and texture do not enter the default game registry', () => {
  assert.ok(Object.values(SHIP_ASSET_REGISTRY).every(pack => Object.keys(pack).length === 0));
  assert.equal(config.build, undefined, 'normal build stays the ordinary game build');
});

test('fixture probe and source remain blocked by ordinary dev serving', () => {
  let middleware;
  config.plugins[0].configureServer({ middlewares: { use(fn) { middleware = fn; } } });
  for (const url of ['/fixture-probe.html', '/src/ui/ship-fixture-probe.js', '/tests/fixtures/ship-loader/mini-basis.glb']) {
    let status, next = false;
    middleware({ url }, { writeHead(code) { status = code; }, end() {} }, () => { next = true; });
    assert.equal(status, 403); assert.equal(next, false);
  }
});
