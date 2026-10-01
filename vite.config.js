import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The legacy local server already hid these repository internals. Keep the
// prototype dev server local-only and apply the same boundary before Vite's
// file-serving middlewares run. Production builds include only dist/.
const privatePath = /^\/(?:reference|tests|scripts|\.omx|\.claude|\.git)(?:\/|$)/;

export default defineConfig({
  build: process.env.SHIP_FIXTURE_BUILD === '1' ? {
    outDir: 'dist-fixture', assetsInlineLimit: 0,
    rollupOptions: { input: fileURLToPath(new URL('./fixture-probe.html', import.meta.url)) },
  } : undefined,
  plugins: [{
    name: 'hide-repository-internals',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let path;
        try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
        catch { res.writeHead(400); res.end('Bad request'); return; }
        if (privatePath.test(path) || path === '/fixture-probe.html' || path === '/src/ui/ship-fixture-probe.js') { res.writeHead(403); res.end('Forbidden'); return; }
        next();
      });
    },
  }],
  server: {
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/.omx/**', '**/.claude/**', '**/reference/**', '**/tests/**', '**/scripts/**', '**/fixture-probe.html', '**/src/ui/ship-fixture-probe.js'],
    },
  },
});
