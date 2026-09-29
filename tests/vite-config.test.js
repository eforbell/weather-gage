import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../vite.config.js';

test('3D dev server retains the legacy boundary around repository internals', () => {
  let middleware;
  config.plugins[0].configureServer({ middlewares: { use(fn) { middleware = fn; } } });
  const request = url => {
    const result = { status: null, next: false };
    middleware({ url }, { writeHead(code) { result.status = code; }, end() {} }, () => { result.next = true; });
    return result;
  };
  for (const url of ['/reference/Design%20Doc.dc.html', '/tests/sim.test.js', '/scripts/serve.mjs', '/.omx/notepad.md', '/%2Eclaude/worktrees/a']) {
    assert.deepEqual(request(url), { status: 403, next: false }, url);
  }
  for (const url of ['/', '/src/ui/app.js']) assert.deepEqual(request(url), { status: null, next: true }, url);
});
