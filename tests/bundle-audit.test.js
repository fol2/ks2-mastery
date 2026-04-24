import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('client bundle audit fails on forbidden engine, content, and local-mode tokens', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ks2-runtime-boundary-'));
  const bundle = path.join(dir, 'app.bundle.js');
  const metafile = path.join(dir, 'app.bundle.meta.json');
  const publicDir = path.join(dir, 'public');
  await mkdir(publicDir, { recursive: true });
  await writeFile(bundle, 'console.log("Legacy vendor seed for Pass 11 content model", "?local=1");\n');
  await writeFile(metafile, JSON.stringify({
    inputs: {
      'src/subjects/spelling/engine/legacy-engine.js': { bytes: 1 },
    },
  }));

  assert.throws(() => {
    execFileSync(process.execPath, [
      './scripts/audit-client-bundle.mjs',
      '--bundle',
      bundle,
      '--metafile',
      metafile,
      '--public-dir',
      publicDir,
    ], {
      cwd: process.cwd(),
      stdio: 'pipe',
    });
  }, /Forbidden production-client/);
});

test('client bundle audit permits reviewed endpoint strings without content modules', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ks2-runtime-boundary-'));
  const bundle = path.join(dir, 'app.bundle.js');
  const metafile = path.join(dir, 'app.bundle.meta.json');
  const publicDir = path.join(dir, 'public');
  await mkdir(publicDir, { recursive: true });
  await writeFile(bundle, 'fetch("/api/subjects/spelling/word-bank"); fetch("/api/content/spelling");\n');
  await writeFile(metafile, JSON.stringify({
    inputs: {
      'src/main.js': { bytes: 1 },
      'src/platform/runtime/read-model-client.js': { bytes: 1 },
    },
  }));

  assert.doesNotThrow(() => {
    execFileSync(process.execPath, [
      './scripts/audit-client-bundle.mjs',
      '--bundle',
      bundle,
      '--metafile',
      metafile,
      '--public-dir',
      publicDir,
    ], {
      cwd: process.cwd(),
      stdio: 'pipe',
    });
  });
});

test('client bundle audit fails on legacy broad runtime write routes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ks2-runtime-boundary-'));
  const bundle = path.join(dir, 'app.bundle.js');
  const metafile = path.join(dir, 'app.bundle.meta.json');
  const publicDir = path.join(dir, 'public');
  await mkdir(publicDir, { recursive: true });
  await writeFile(bundle, 'fetch("/api/child-subject-state"); fetch("/api/debug/reset");\n');
  await writeFile(metafile, JSON.stringify({
    inputs: {
      'src/main.js': { bytes: 1 },
    },
  }));

  assert.throws(() => {
    execFileSync(process.execPath, [
      './scripts/audit-client-bundle.mjs',
      '--bundle',
      bundle,
      '--metafile',
      metafile,
      '--public-dir',
      publicDir,
    ], {
      cwd: process.cwd(),
      stdio: 'pipe',
    });
  }, /legacy broad/);
});

test('worker spelling runtime imports the shared domain service instead of the browser service entrypoint', async () => {
  const workerEngine = await readFile('worker/src/subjects/spelling/engine.js', 'utf8');
  const browserService = await readFile('src/subjects/spelling/service.js', 'utf8');

  assert.doesNotMatch(workerEngine, /src\/subjects\/spelling\/service\.js/);
  assert.match(workerEngine, /shared\/spelling\/service\.js/);
  assert.match(browserService, /shared\/spelling\/service\.js/);
});

test('worker-first asset routing keeps demo and source lockdown routes out of SPA fallback', async () => {
  for (const configPath of ['wrangler.jsonc', 'worker/wrangler.example.jsonc']) {
    const config = await readFile(configPath, 'utf8');
    assert.match(config, /"run_worker_first"\s*:\s*\[[\s\S]*"\/api\/\*"[\s\S]*"\/demo"[\s\S]*"\/src\/\*"[\s\S]*"\/worker\/\*"[\s\S]*"\/tests\/\*"[\s\S]*\]/, configPath);
  }
});

test('production bundle audit fails source paths served by SPA fallback', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/assets/app.js') {
      response.writeHead(200, { 'content-type': 'application/javascript' });
      response.end('console.log("ok");');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><script src="/assets/app.js"></script>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    await assert.rejects(async () => {
      await execFileAsync(process.execPath, [
        './scripts/production-bundle-audit.mjs',
        '--skip-local',
        '--url',
        `http://127.0.0.1:${port}/`,
      ], {
        cwd: process.cwd(),
        timeout: 5000,
      });
    }, (error) => {
      assert.match(error.stderr, /Direct URL should be denied with a 4xx response, got 200: \/src\/main\.js/);
      return true;
    });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
