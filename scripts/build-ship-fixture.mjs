import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  stdio: 'inherit', env: { ...process.env, SHIP_FIXTURE_BUILD: '1' },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
