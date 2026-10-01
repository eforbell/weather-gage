import { preview } from 'vite';

// Do not discover readiness by parsing CLI logs: CI can color the port number.
// Vite's API resolves after binding; use the actual socket address instead.
export async function startFixturePreview(outDir = 'dist-fixture') {
  const server = await preview({
    build: { outDir }, preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false }, logLevel: 'silent',
  });
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('Fixture preview did not bind a TCP port');
  }
  return { url: `http://127.0.0.1:${address.port}`, close: () => server.close() };
}
