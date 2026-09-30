import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Install the pinned test tools into a temporary prefix, not this repository.
if (!process.env.FIXTURE_TOOLS) throw new Error('Set FIXTURE_TOOLS to a prefix containing playwright 1.58.2 and gltf-validator 2.0.0-dev.3.10 (see docs/ship-fixtures.md)');
const requireTool = createRequire(resolve(process.env.FIXTURE_TOOLS, 'package.json'));
assert.equal(requireTool('playwright/package.json').version, '1.58.2');
assert.equal(requireTool('gltf-validator/package.json').version, '2.0.0-dev.3.10');
const { chromium } = requireTool('playwright');
const validator = requireTool('gltf-validator');
const report = await validator.validateBytes(new Uint8Array(await readFile('tests/fixtures/ship-loader/mini-basis.glb')), { uri: 'mini-basis.glb' });
assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues));
// This pinned validator predates Basis support. Only its known image/ktx2
// warnings are allowed; KTX validation and actual decode cover the extension.
const knownWarnings = new Map([['VALUE_NOT_IN_LIST', '/images/0/mimeType'], ['IMAGE_UNRECOGNIZED_FORMAT', '/images/0']]);
for (const issue of report.issues.messages) if (issue.severity === 1) {
  assert.ok(knownWarnings.get(issue.code) === issue.pointer, JSON.stringify(issue));
}
// Normal production deployment must not include fixture assets or its probe.
const productionFiles = await readdir('dist/assets');
assert.ok(!productionFiles.some(name => /mini-basis|ship-fixture-probe/.test(name)));
for (const name of productionFiles.filter(name => name.endsWith('.js'))) {
  assert.ok(!(await readFile(`dist/assets/${name}`, 'utf8')).includes('__fixtureResult'), 'probe code must not enter the game bundle');
}
await assert.rejects(readFile('dist/fixture-probe.html'), { code: 'ENOENT' });

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-fixture', '--host', '127.0.0.1', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  const url = await new Promise((resolveUrl, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Fixture preview startup timed out')), 15000);
    server.stdout.on('data', data => {
      output += data.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolveUrl(match[0]); }
    });
    server.on('exit', code => { clearTimeout(timer); reject(new Error(`Fixture preview exited ${code}`)); });
    server.on('error', error => { clearTimeout(timer); reject(error); });
  });
  browser = await chromium.launch({ headless: true, ...(process.env.FIXTURE_BROWSER_CHANNEL ? { channel: process.env.FIXTURE_BROWSER_CHANNEL } : {}), args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  const errors = [], warnings = [], resources = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
  page.on('response', response => { if (response.url().includes('basis_transcoder')) resources.push({ url: response.url(), status: response.status() }); });
  await page.route('**/*', route => {
    const requestUrl = route.request().url();
    if (/^https?:/.test(requestUrl) && new URL(requestUrl).origin !== url) { errors.push(`Unexpected remote dependency ${requestUrl}`); return route.abort(); }
    return route.continue();
  });
  await page.goto(`${url}/fixture-probe.html`);
  await page.waitForFunction(() => globalThis.__fixtureResult, null, { timeout: 30000 });
  const result = await page.evaluate(() => globalThis.__fixtureResult);
  await mkdir('output/fixtures', { recursive: true });
  await page.screenshot({ path: 'output/fixtures/codec-probe.png' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.worldLength, 9);
  assert.equal(result.triangles, 24, 'two original 12-triangle meshes rendered');
  assert.ok(resources.some(r => r.url.endsWith('.js') && r.status === 200), 'local Basis JS actually fetched');
  assert.ok(resources.some(r => r.url.endsWith('.wasm') && r.status === 200), 'local Basis WASM actually fetched');
  assert.deepEqual(errors, []);
  assert.ok(warnings.every(text => /GPU stall due to ReadPixels/.test(text)), JSON.stringify(warnings));
  await writeFile('output/fixtures/validation.json', JSON.stringify({ result, resources, validatorIssues: report.issues, errors, warnings }, null, 2));
  console.log(JSON.stringify({ ...result, decoderResources: resources.length, validatorErrors: report.issues.numErrors, validatorWarnings: report.issues.numWarnings }));
} finally {
  await browser?.close();
  if (server.exitCode === null) { const stopped = once(server, 'exit'); server.kill(); await stopped; }
}
