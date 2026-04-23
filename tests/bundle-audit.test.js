import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

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
    assert.match(config, /"run_worker_first"\s*:\s*\[[\s\S]*"\/api\/\*"[\s\S]*"\/demo"[\s\S]*"\/src\/\*"[\s\S]*\]/, configPath);
  }
});
