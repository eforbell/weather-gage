import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('local server serves game modules, blocks internals and rejects writes', async () => {
  const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const [chunk] = await once(server.stdout, 'data');
    const url = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    assert.ok(url, 'server reports the listening URL');
    const root = await fetch(url);
    assert.equal(root.status, 200);
    assert.match(await root.text(), /Weather Gage/);
    const module = await fetch(`${url}/src/sim/engine.js`);
    assert.equal(module.status, 200);
    assert.match(module.headers.get('content-type'), /text\/javascript/);
    assert.equal((await fetch(`${url}/.git/config`)).status, 403);
    assert.equal((await fetch(`${url}/reference/support.js`)).status, 403);
    assert.equal((await fetch(`${url}/missing`)).status, 404);
    assert.equal((await fetch(url, { method: 'POST', body: 'x' })).status, 405);
  } finally { server.kill(); await once(server, 'exit'); }
});
