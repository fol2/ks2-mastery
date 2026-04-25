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

test('client bundle audit fails when Grammar server runtime, engine, content, or enrichment enters the client bundle', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ks2-runtime-boundary-'));
  const bundle = path.join(dir, 'app.bundle.js');
  const metafile = path.join(dir, 'app.bundle.meta.json');
  const publicDir = path.join(dir, 'public');
  await mkdir(publicDir, { recursive: true });
  await writeFile(bundle, 'console.log("grammar surface");\n');
  await writeFile(metafile, JSON.stringify({
    inputs: {
      'src/main.js': { bytes: 1 },
      'worker/src/subjects/grammar/engine.js': { bytes: 1 },
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
  }, /server-authoritative Grammar runtime, engine, content, and enrichment code/);
});

test('client bundle audit fails on browser-side AI provider key tokens', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ks2-runtime-boundary-'));
  const bundle = path.join(dir, 'app.bundle.js');
  const metafile = path.join(dir, 'app.bundle.meta.json');
  const publicDir = path.join(dir, 'public');
  await mkdir(publicDir, { recursive: true });
  await writeFile(bundle, 'window.localStorage.setItem("OPENAI_API_KEY", "browser-key");\n');
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
  }, /browser-side AI provider key flow/);
});

test('client bundle audit fails on Punctuation browser-side AI context-pack provider flows', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ks2-runtime-boundary-'));
  const bundle = path.join(dir, 'app.bundle.js');
  const metafile = path.join(dir, 'app.bundle.meta.json');
  const publicDir = path.join(dir, 'public');
  await mkdir(publicDir, { recursive: true });
  await writeFile(bundle, 'localStorage.setItem("PUNCTUATION_AI_CONTEXT_PACK_KEY", "browser-key"); fetch("https://generativelanguage.googleapis.com/v1beta/models");\n');
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
  }, /browser-side Punctuation AI context-pack provider flow|browser-side AI provider endpoint flow/);
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

test('client bundle audit permits the admin monster visual config endpoint', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ks2-runtime-boundary-'));
  const bundle = path.join(dir, 'app.bundle.js');
  const metafile = path.join(dir, 'app.bundle.meta.json');
  const publicDir = path.join(dir, 'public');
  await mkdir(publicDir, { recursive: true });
  await writeFile(bundle, 'fetch("/api/admin/monster-visual-config/draft");\n');
  await writeFile(metafile, JSON.stringify({
    inputs: {
      'src/main.js': { bytes: 1 },
      'src/platform/hubs/api.js': { bytes: 1 },
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

test('client bundle audit fails on punctuation engine and content imports', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ks2-runtime-boundary-'));
  const bundle = path.join(dir, 'app.bundle.js');
  const metafile = path.join(dir, 'app.bundle.meta.json');
  const publicDir = path.join(dir, 'public');
  await mkdir(publicDir, { recursive: true });
  await writeFile(bundle, 'console.log("PUNCTUATION_CONTENT_MANIFEST", "createPunctuationService", "createPunctuationRuntimeManifest");\n');
  await writeFile(metafile, JSON.stringify({
    inputs: {
      'shared/punctuation/generators.js': { bytes: 1 },
      'shared/punctuation/service.js': { bytes: 1 },
      'worker/src/subjects/punctuation/commands.js': { bytes: 1 },
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
  }, /punctuation/);
});

// Phase 2 U10: verify the browser-local re-export path at
// `src/subjects/punctuation/service.js` cannot smuggle the shared engine
// into a production bundle. The audit must catch this via the existing
// shared/punctuation/service.js forbidden-module rule even when the
// metafile only lists the re-export wrapper.
test('client bundle audit fails on punctuation browser-local service re-export', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ks2-runtime-boundary-'));
  const bundle = path.join(dir, 'app.bundle.js');
  const metafile = path.join(dir, 'app.bundle.meta.json');
  const publicDir = path.join(dir, 'public');
  await mkdir(publicDir, { recursive: true });
  await writeFile(bundle, 'console.log("createPunctuationService");\n');
  // Bundle traces the re-export back to the shared service regardless of
  // whether the wrapper at src/subjects/punctuation/service.js surfaces in
  // the metafile. The audit must fail whether the path appears as the
  // wrapper or the upstream module.
  await writeFile(metafile, JSON.stringify({
    inputs: {
      'src/subjects/punctuation/service.js': { bytes: 1 },
      'shared/punctuation/service.js': { bytes: 1 },
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
  }, /shared\/punctuation\/service\.js|punctuation/);
});

// Per-module regression. Any new audit rule drift must not silently allow
// a previously-forbidden module to slip through. Each module is tested
// individually so a future regex change that drops one of them surfaces
// a targeted failure rather than a generic "punctuation" pass.
const FORBIDDEN_SHARED_PUNCTUATION_MODULES = [
  'shared/punctuation/content.js',
  'shared/punctuation/generators.js',
  'shared/punctuation/marking.js',
  'shared/punctuation/scheduler.js',
  'shared/punctuation/service.js',
];

for (const forbiddenModule of FORBIDDEN_SHARED_PUNCTUATION_MODULES) {
  test(`client bundle audit fails when ${forbiddenModule} is in the metafile`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ks2-runtime-boundary-'));
    const bundle = path.join(dir, 'app.bundle.js');
    const metafile = path.join(dir, 'app.bundle.meta.json');
    const publicDir = path.join(dir, 'public');
    await mkdir(publicDir, { recursive: true });
    await writeFile(bundle, 'console.log("ok");\n');
    await writeFile(metafile, JSON.stringify({
      inputs: {
        [forbiddenModule]: { bytes: 1 },
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
      // Path-specific assertion rather than a generic /punctuation/ match:
      // a regex change that accidentally drops any one module would pass a
      // loose /punctuation/ check via the shared `reason` string. Pinning
      // on the literal path forces the failure message to actually name
      // the module under test.
    }, new RegExp(forbiddenModule.replace(/[.]/g, '\\.').replace(/\//g, '\\/')), `${forbiddenModule} should fail the audit with its own path in the error`);
  });
}

test('client bundle audit fails when public output exposes shared punctuation source', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ks2-runtime-boundary-'));
  const bundle = path.join(dir, 'app.bundle.js');
  const metafile = path.join(dir, 'app.bundle.meta.json');
  const publicDir = path.join(dir, 'public');
  await mkdir(path.join(publicDir, 'shared', 'punctuation'), { recursive: true });
  await writeFile(bundle, 'console.log("ok");\n');
  await writeFile(metafile, JSON.stringify({ inputs: { 'src/main.js': { bytes: 1 } } }));
  await writeFile(path.join(publicDir, 'shared', 'punctuation', 'content.js'), 'export const leaked = true;\n');

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
  }, /shared source/);
});

test('worker spelling runtime imports the shared domain service instead of the browser service entrypoint', async () => {
  const workerEngine = await readFile('worker/src/subjects/spelling/engine.js', 'utf8');
  const browserService = await readFile('src/subjects/spelling/service.js', 'utf8');

  assert.doesNotMatch(workerEngine, /src\/subjects\/spelling\/service\.js/);
  assert.match(workerEngine, /shared\/spelling\/service\.js/);
  assert.match(browserService, /shared\/spelling\/service\.js/);
});

test('worker-first asset routing keeps demo and source lockdown routes out of SPA fallback', async () => {
  const expectedRoutes = [
    '/api/*',
    '/demo',
    '/src/*',
    '/shared/*',
    '/worker/*',
    '/tests/*',
    '/docs/*',
    '/legacy/*',
    '/migration-plan.md',
  ];
  for (const configPath of ['wrangler.jsonc', 'worker/wrangler.example.jsonc']) {
    const config = await readFile(configPath, 'utf8');
    for (const route of expectedRoutes) {
      assert.match(config, new RegExp(`"${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `${configPath} missing ${route}`);
    }
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

test('production bundle audit denies the Punctuation hub read-model source path', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/assets/app.js') {
      response.writeHead(200, { 'content-type': 'application/javascript' });
      response.end('console.log("ok");');
      return;
    }
    if (request.url === '/src/subjects/punctuation/read-model.js') {
      response.writeHead(200, { 'content-type': 'application/javascript' });
      response.end('export function buildPunctuationLearnerReadModel() { return {}; }');
      return;
    }
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><script src="/assets/app.js"></script>');
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
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
      assert.match(error.stderr, /Direct URL should be denied with a 4xx response, got 200: \/src\/subjects\/punctuation\/read-model\.js/);
      assert.match(error.stderr, /Direct URL unexpectedly served raw source-like JavaScript: \/src\/subjects\/punctuation\/read-model\.js/);
      return true;
    });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('production bundle audit fails on deployed Punctuation context-pack source and provider tokens', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/assets/app.js') {
      response.writeHead(200, { 'content-type': 'application/javascript' });
      response.end('console.log("PUNCTUATION_AI_CONTEXT_PACK_KEY", "generativelanguage.googleapis.com");');
      return;
    }
    if (request.url === '/shared/punctuation/context-packs.js') {
      response.writeHead(200, { 'content-type': 'application/javascript' });
      response.end('export const PUNCTUATION_CONTEXT_PACK_LIMITS = {}; export function normalisePunctuationContextPack() {}');
      return;
    }
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><script src="/assets/app.js"></script>');
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
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
      assert.match(error.stderr, /forbidden deployed token: PUNCTUATION_AI_CONTEXT_PACK_KEY/);
      assert.match(error.stderr, /forbidden deployed token: generativelanguage\.googleapis\.com/);
      assert.match(error.stderr, /Direct URL should be denied with a 4xx response, got 200: \/shared\/punctuation\/context-packs\.js/);
      assert.match(error.stderr, /forbidden deployed token: PUNCTUATION_CONTEXT_PACK_LIMITS/);
      assert.match(error.stderr, /forbidden deployed token: normalisePunctuationContextPack/);
      return true;
    });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
