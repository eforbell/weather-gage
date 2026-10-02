// One command per ship: headless Blender build -> GLB in public/assets, review
// renders and a reference overlay in output/ships/<id>/, then the asset report.
//
//   npm run ship:build -- hms-lion            full build (AO bake, ~10-30 s)
//   npm run ship:build -- hms-lion --no-bake  fast iteration; report flags it
//
// Blender is found from $BLENDER, then PATH, then the macOS app bundle.
import { spawnSync } from 'node:child_process';
import { referencePlacement } from './ship-reference-overlay.mjs';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { formatReport, inspectShipGlb, khronosValidate, loadShipSpec, shipGlbPath, shipKitSha256, shipSpecPath, shipSpecSha256 } from './ship-asset-report.mjs';

const [id, ...flags] = process.argv.slice(2);
if (!id) {
  console.error('usage: npm run ship:build -- <ship-id> [--no-bake]');
  process.exit(2);
}

function findBlender() {
  if (process.env.BLENDER) return process.env.BLENDER;
  const which = spawnSync('which', ['blender'], { encoding: 'utf8' });
  if (which.status === 0) return which.stdout.trim();
  const app = '/Applications/Blender.app/Contents/MacOS/Blender';
  if (existsSync(app)) return app;
  throw new Error('Blender not found: install Blender 5.2 LTS or set BLENDER=/path/to/blender');
}

function findMagick() {
  const which = spawnSync('which', ['magick'], { encoding: 'utf8' });
  return which.status === 0 ? which.stdout.trim() : null;
}

const spec = await loadShipSpec(id);
const glb = shipGlbPath(spec);
const previews = `output/ships/${id}`;
await mkdir(previews, { recursive: true });

const blenderArgs = ['-b', '--factory-startup', '-P', 'tools/blender/build_ship.py', '--',
  '--spec', shipSpecPath(id), '--out', glb, '--previews', previews, '--report', `${previews}/build.json`, '--blend', `${previews}/${id}.blend`];
if (flags.includes('--no-bake')) blenderArgs.push('--no-bake');
const blender = findBlender();
const build = spawnSync(blender, blenderArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (build.error) {
  console.error(`Could not start Blender at ${blender}: ${build.error.message}`);
  process.exit(1);
}
const reportLine = (build.stdout || '').split('\n').find(l => l.startsWith('SHIP_BUILD_REPORT '));
if (build.status !== 0 || !reportLine) {
  process.stderr.write((build.stdout || '').split('\n').filter(l => !/^Fra:/.test(l)).slice(-40).join('\n'));
  process.stderr.write(build.stderr || '');
  console.error(`\nBlender build failed (exit ${build.status}${reportLine ? '' : ', no build report'}).`);
  process.exit(1);
}
const buildReport = JSON.parse(reportLine.slice('SHIP_BUILD_REPORT '.length));
console.log(`Built ${glb} in ${buildReport.seconds}s with Blender ${buildReport.blender}.`);

// Reference overlays (profile and plan): the calibrated drawing underneath, the
// render at 55% on top. Profile references give waterlineY, plan references
// centerlineY, both in source-image pixels.
const magick = findMagick();
const overlays = [];
for (const ref of spec.references || []) {
  const view = buildReport.views?.[ref.view];
  const placement = referencePlacement(ref, view, spec.hull.length);
  if (!placement) continue;
  const source = `ships/${id}/${ref.file}`;
  if (!existsSync(source)) { console.warn(`Reference ${source} is not present locally (references are not committed). Download it from ${ref.url || 'the URL in PROVENANCE.md'} to get the overlay.`); continue; }
  if (!magick) { console.warn('ImageMagick not found; skipping reference overlay.'); break; }
  const { scale, flop, flip, x: ox, y: oy } = placement;
  // Calibration is in source-image pixels; the composite is of the cropped image.
  const [cx, cy, cw, ch] = ref.crop || [0, 0, 100000, 100000];
  const out = `${previews}/overlay-${ref.id}.png`;
  const result = spawnSync(magick, [
    '-size', `${view.width}x${view.height}`, 'xc:white',
    '(', source, '-crop', `${cw}x${ch}+${cx}+${cy}`, '+repage', ...(flop ? ['-flop'] : []), ...(flip ? ['-flip'] : []), '-resize', `${(scale * 100).toFixed(3)}%`, ')',
    '-geometry', `${ox >= 0 ? '+' : '-'}${Math.abs(ox)}${oy >= 0 ? '+' : '-'}${Math.abs(oy)}`, '-composite',
    '(', `${previews}/${ref.view}.png`, '-background', 'none', '-channel', 'A', '-evaluate', 'multiply', '0.55', '+channel', ')', '-composite',
    out,
  ], { encoding: 'utf8' });
  if (result.status === 0) overlays.push(out);
  else console.warn(`Overlay failed: ${result.stderr}`);
}

const bytes = new Uint8Array(await readFile(glb));
const report = await inspectShipGlb(bytes, spec, await shipSpecSha256(id), await shipKitSha256());
report.validator = await khronosValidate(bytes, `${id}.glb`);
if (report.validator.errors) report.ok = false;
report.build = buildReport;
await writeFile(`${previews}/report.json`, JSON.stringify(report, null, 2));
console.log(formatReport(report));
console.log(`\nReview: ${previews}/{profile,plan,quarter,stern-quarter,game-distance}.png${overlays.length ? `, ${overlays.join(', ')}` : ''}`);
if (!report.ok) process.exit(1);
