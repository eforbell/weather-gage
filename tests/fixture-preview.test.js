import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFixturePreview } from '../scripts/fixture-preview.mjs';

test('fixture preview binds a ready ephemeral port without relying on colored logs', async t => {
  const keys = ['FORCE_COLOR', 'CI', 'NO_COLOR'];
  const previous = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }));
  process.env.FORCE_COLOR = '1'; process.env.CI = 'true'; delete process.env.NO_COLOR;
  const temp = await mkdtemp(join(tmpdir(), 'fixture-preview-test-'));
  let server;
  try {
    await writeFile(join(temp, 'index.html'), '<h1>fixture readiness</h1>');
    server = await startFixturePreview(temp);
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    const response = await fetch(server.url);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /fixture readiness/);
  } finally { await server?.close(); await rm(temp, { recursive: true, force: true }); }
});
