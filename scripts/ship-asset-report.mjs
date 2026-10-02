// Inspect an authored ship GLB against its spec (ships/<id>/spec.json): budgets,
// scale, waterline, orientation and smoke/turret anchors. Uses the same
// GLTFLoader as the game. Optional Khronos validation when FIXTURE_TOOLS points
// at the pinned tool prefix (docs/ship-fixtures.md).
//
//   node scripts/ship-asset-report.mjs hms-lion
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const shipSpecPath = id => `ships/${id}/spec.json`;
export const shipGlbPath = spec => `public/assets/ships/${spec.era}/${spec.id}.glb`;

export async function loadShipSpec(id) {
  return JSON.parse(await readFile(shipSpecPath(id), 'utf8'));
}

// Same recipe as kit_sha256() in tools/blender/build_ship.py.
export async function shipKitSha256(dir = 'tools/blender') {
  const files = (await readdir(dir, { recursive: true })).map(p => p.split(sep).join('/')).filter(p => p.endsWith('.py') && !p.includes('__pycache__')).sort();
  const hash = createHash('sha256');
  for (const path of files) hash.update(Buffer.concat([Buffer.from(`${path}\0`), await readFile(`${dir}/${path}`), Buffer.from('\0')]));
  return hash.digest('hex');
}

export async function shipSpecSha256(id) {
  return createHash('sha256').update(await readFile(shipSpecPath(id))).digest('hex');
}

function parseGlbJson(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
}

// Must match the turret builder (GUN_AXIS in tools/blender/shipkit/parts.py):
// the barrels leave the sloped front plate at the gun axis, so the muzzle is
// half a gunhouse, less the slope's set-back at that height, plus a barrel.
const GUN_AXIS = 0.42;
export function muzzleReach(turretType = {}) {
  return (turretType.length ?? 0) / 2 - (turretType.frontSlope ?? 0) * GUN_AXIS + (turretType.barrelLength ?? 0);
}

// Facing and placement of every turret from its muzzle anchor ([x, y, z] in
// glTF metres, bow -Z). Returns check records like inspectShipGlb's.
export function turretChecks(spec, anchors) {
  const L = spec.hull.length, out = [];
  const expected = muzzleReach(spec.turretType);
  for (const turret of spec.turrets || []) {
    const point = anchors[`anchor_turret_${turret.id}`];
    const centreZ = turret.aft - L / 2, side = turret.side ?? 0;
    const sign = turret.facing === 'fore' ? -1 : 1;
    out.push({ name: `turret ${turret.id} faces ${turret.facing} (bow is -Z)`, ok: Boolean(point && Math.sign(point[2] - centreZ) === sign), detail: point ? point.join(', ') : 'missing' });
    const reach = point ? sign * (point[2] - centreZ) : NaN;
    out.push({
      name: `turret ${turret.id} position (aft ${turret.aft}, side ${side})`,
      ok: Boolean(point && Math.abs(point[0] - side) < 0.15 && Math.abs(reach - expected) < 0.15),
      detail: point ? `x ${point[0]} vs ${side}; muzzle ${reach.toFixed(2)} m from turret centre vs ${expected.toFixed(2)}` : 'missing',
    });
  }
  return out;
}

export async function inspectShipGlb(bytes, spec, specSha256 = null, kitSha256 = null) {
  const json = parseGlbJson(bytes);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  let triangles = 0, drawCalls = 0, vertexColors = true;
  const materials = new Set();
  root.traverse(item => {
    if (!item.isMesh) return;
    drawCalls += 1;
    materials.add(item.material.name);
    const geometry = item.geometry;
    triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    if (!geometry.attributes.color) vertexColors = false;
  });
  const box = new THREE.Box3().setFromObject(root);
  const anchors = {};
  root.traverse(item => {
    if (item.name.startsWith('anchor_')) anchors[item.name] = item.getWorldPosition(new THREE.Vector3()).toArray().map(v => +v.toFixed(3));
  });

  const L = spec.hull.length, draft = spec.hull.draft;
  const budget = spec.budget || {};
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
  check('glTF 2.0', json.asset?.version === '2.0', json.asset?.generator);
  const stamp = json.scenes?.[json.scene || 0]?.extras || {};
  check('built from this spec', stamp.weatherGageSpec === spec.id && (!specSha256 || stamp.weatherGageSpecSha256 === specSha256),
    specSha256 && stamp.weatherGageSpecSha256 !== specSha256 ? 'spec.json changed since the GLB was built: run npm run ship:build' : stamp.weatherGageSpec);
  check('built with the current kit', !kitSha256 || stamp.weatherGageKitSha256 === kitSha256,
    kitSha256 && stamp.weatherGageKitSha256 !== kitSha256 ? 'tools/blender changed since the GLB was built: rebuild every ship' : 'tools/blender unchanged');
  check('no external or embedded images', !(json.images?.length) && !(json.buffers || []).some(b => b.uri), `${json.images?.length || 0} images`);
  check('triangle budget', !budget.maxTriangles || triangles <= budget.maxTriangles, `${triangles} / ${budget.maxTriangles}`);
  check('draw-call budget', !budget.maxDrawCalls || drawCalls <= budget.maxDrawCalls, `${drawCalls} / ${budget.maxDrawCalls}`);
  check('download budget', !budget.maxBytes || bytes.byteLength <= budget.maxBytes, `${bytes.byteLength} / ${budget.maxBytes} bytes`);
  check('length matches spec (±1%)', Math.abs(box.max.z - box.min.z - L) <= L * 0.01, `${(box.max.z - box.min.z).toFixed(2)} m vs ${L} m`);
  check('keel at -draft (waterline at Y=0)', Math.abs(box.min.y + draft) <= 0.25, `min Y ${box.min.y.toFixed(2)} vs -${draft}`);
  check('baked vertex colours (COLOR_0)', vertexColors, vertexColors ? 'present' : 'missing: was the build run with --no-bake?');
  let waterline = null;
  try { waterline = JSON.parse(stamp.weatherGageWaterline || 'null'); } catch { /* reported below */ }
  const widest = Array.isArray(waterline) ? Math.max(...waterline.map(([half]) => half)) : NaN;
  check('waterline contour for surface foam', Array.isArray(waterline) && waterline.length >= 3 && Math.abs(widest * 2 - spec.hull.beam) <= spec.hull.beam * 0.05,
    Array.isArray(waterline) ? `${waterline.length} stations, widest ${(widest * 2).toFixed(2)} m vs beam ${spec.hull.beam} m` : 'missing weatherGageWaterline');
  for (const funnel of spec.funnels || []) {
    const point = anchors[`anchor_funnel_${funnel.id}`];
    check(`smoke anchor for funnel ${funnel.id}`, point && Math.abs(point[2] - (funnel.aft - L / 2)) < 0.6 && Math.abs(point[1] - funnel.top) < 1.5, point ? point.join(', ') : 'missing');
  }
  checks.push(...turretChecks(spec, anchors));
  return {
    id: spec.id, bytes: bytes.byteLength, triangles, drawCalls, materials: [...materials].sort(),
    boundsMeters: { min: box.min.toArray().map(v => +v.toFixed(2)), max: box.max.toArray().map(v => +v.toFixed(2)) },
    anchors, checks, ok: checks.every(c => c.ok),
  };
}

export async function khronosValidate(bytes, uri) {
  if (!process.env.FIXTURE_TOOLS) return { skipped: 'set FIXTURE_TOOLS to run the pinned Khronos glTF Validator' };
  const requireTool = createRequire(resolve(process.env.FIXTURE_TOOLS, 'package.json'));
  const report = await requireTool('gltf-validator').validateBytes(new Uint8Array(bytes), { uri });
  return { errors: report.issues.numErrors, warnings: report.issues.numWarnings, infos: report.issues.numInfos, messages: report.issues.messages.filter(m => m.severity <= 1) };
}

export function formatReport(report) {
  const lines = [`${report.id}: ${report.triangles} triangles, ${report.drawCalls} draw calls, ${(report.bytes / 1024).toFixed(0)} KiB`];
  for (const c of report.checks) lines.push(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name} — ${c.detail}`);
  if (report.validator) lines.push(`  validator: ${report.validator.skipped || `${report.validator.errors} errors, ${report.validator.warnings} warnings`}`);
  return lines.join('\n');
}

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error('usage: node scripts/ship-asset-report.mjs <ship-id>');
  const spec = await loadShipSpec(id);
  const path = shipGlbPath(spec);
  await stat(path);
  const bytes = new Uint8Array(await readFile(path));
  const report = await inspectShipGlb(bytes, spec, await shipSpecSha256(id), await shipKitSha256());
  report.validator = await khronosValidate(bytes, `${id}.glb`);
  if (report.validator.errors) report.ok = false;
  await mkdir(`output/ships/${id}`, { recursive: true });
  await writeFile(`output/ships/${id}/report.json`, JSON.stringify(report, null, 2));
  console.log(formatReport(report));
  if (!report.ok) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
