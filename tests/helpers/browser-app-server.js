import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

function contentType(filePath) {
  return MIME_TYPES.get(path.extname(filePath)) || 'application/octet-stream';
}

function resolvePublicFile(publicDir, requestPath) {
  const rawPath = decodeURIComponent(requestPath || '/');
  const normalised = path.normalize(rawPath).replace(/^(\.\.[/\\])+/, '');
  const relativePath = normalised === '/' || normalised === '.'
    ? 'index.html'
    : normalised.replace(/^[/\\]+/, '');
  const filePath = path.resolve(publicDir, relativePath);
  return filePath.startsWith(publicDir) ? filePath : null;
}

async function readStaticFile(publicDir, requestPath) {
  const filePath = resolvePublicFile(publicDir, requestPath);
  if (!filePath) return null;

  try {
    const info = await stat(filePath);
    const resolvedPath = info.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    return {
      body: await readFile(resolvedPath),
      contentType: contentType(resolvedPath),
    };
  } catch {
    const indexPath = path.join(publicDir, 'index.html');
    return {
      body: await readFile(indexPath),
      contentType: contentType(indexPath),
    };
  }
}

export async function startBrowserAppServer({ publicDir = path.join(rootDir, 'dist/public'), port = 0 } = {}) {
  const resolvedPublicDir = path.resolve(publicDir);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/')) {
        response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'The migration smoke server only serves static app assets.' }));
        return;
      }

      const asset = await readStaticFile(resolvedPublicDir, url.pathname);
      if (!asset) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }

      response.writeHead(200, { 'content-type': asset.contentType });
      response.end(asset.body);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(error?.message || 'Static server failed.');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

if (process.argv.includes('--serve-only')) {
  const portArgIndex = process.argv.indexOf('--port');
  const parsedPort = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : 4173;
  const port = Number.isFinite(parsedPort) ? parsedPort : 4173;
  const app = await startBrowserAppServer({ port });
  console.log(app.origin);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      await app.close();
      process.exit(0);
    });
  }
}
