import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + path);
    const relative = file.slice(root.length + 1);
    if (!file.startsWith(root + sep) && file !== root || relative.split(sep).some(p => p.startsWith('.')) || /^(reference|tests|scripts)(\/|$)/.test(relative)) {
      res.writeHead(403); return res.end('Forbidden');
    }
    const target = (await stat(file)).isDirectory() ? resolve(file, 'index.html') : file;
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': `${types[extname(target)] || 'text/plain'}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Weather Gage ready at http://127.0.0.1:${server.address().port}`));
