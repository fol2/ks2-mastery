import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';

import {
  CACHE_SPLIT_RULES,
  assertCacheSplitRules,
  parseHeadersBlocks,
} from '../scripts/lib/headers-drift.mjs';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

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

// ---------------------------------------------------------------------------
// U8 (sys-hardening p1): cache-split contract coverage.
// Parser-level assertions against the checked-in `_headers` confirm every
// path group lands the expected Cache-Control value; a runtime scenario
// drives `scripts/production-bundle-audit.mjs` against a stub origin that
// advertises a bad manifest cache policy to prove the new HEAD check fails.
// ---------------------------------------------------------------------------

function normaliseCacheControl(value) {
  return String(value || '').replace(/\s+/gu, ' ').replace(/,\s*/gu, ', ').trim();
}

test('_headers carries the U8 cache-split rule set for every path group', async () => {
  const content = await readFile(path.join(REPO_ROOT, '_headers'), 'utf8');
  // The pure contract must not throw on the checked-in _headers.
  assert.doesNotThrow(() => assertCacheSplitRules(content));

  // Parser-level readback: every exported rule must resolve to a path block
  // whose final Cache-Control line matches the expected value. This proves
  // the rule set is grounded in the file rather than just an internal echo.
  const blocks = parseHeadersBlocks(content);
  const byPath = new Map(blocks.map((block) => [block.path, block]));
  for (const rule of CACHE_SPLIT_RULES) {
    const block = byPath.get(rule.path);
    assert.ok(block, `_headers missing block for ${rule.path}`);
    const cacheLines = block.body.match(/^\s*Cache-Control:\s*(.+)$/gmu) || [];
    assert.ok(cacheLines.length > 0, `_headers block ${rule.path} missing Cache-Control line`);
    const last = cacheLines[cacheLines.length - 1].replace(/^\s*Cache-Control:\s*/u, '').trim();
    assert.equal(
      normaliseCacheControl(last),
      normaliseCacheControl(rule.cacheControl),
      `_headers block ${rule.path} Cache-Control mismatch`,
    );
  }
});

test('assertCacheSplitRules rejects a drifted _headers per path group', async () => {
  const content = await readFile(path.join(REPO_ROOT, '_headers'), 'utf8');

  // Drift 1: manifest rule is flipped to immutable — must fail with a
  // pointed message naming the path and the observed value.
  const driftedManifest = content.replace(
    /\/manifest\.webmanifest[\s\S]*?Cache-Control: public, max-age=3600/m,
    (block) => block.replace('Cache-Control: public, max-age=3600', 'Cache-Control: public, max-age=31536000, immutable'),
  );
  assert.throws(
    () => assertCacheSplitRules(driftedManifest),
    /\/manifest\.webmanifest/,
    'drifted manifest rule must fail the cache-split contract',
  );

  // Drift 2: bundle rule drops the `immutable` qualifier.
  const driftedBundle = content.replace(
    /(\/assets\/bundles\/\*[\s\S]*?Cache-Control: )public, max-age=31536000, immutable/,
    '$1public, max-age=31536000',
  );
  assert.throws(
    () => assertCacheSplitRules(driftedBundle),
    /\/assets\/bundles\/\*/,
    'drifted bundle rule must fail the cache-split contract',
  );

  // Drift 3: `/index.html` silently gains a cache — HTML must never cache.
  // The `/index.html` group is a distinct, uniquely-named block at the end
  // of the file; scoping the rewrite to its block avoids the ambiguity of
  // the bare `/` group which is nested between `/manifest.webmanifest` and
  // `/index.html` in the file.
  const driftedIndex = content.replace(
    /(\/index\.html[\s\S]*?Cache-Control: )no-store/,
    '$1public, max-age=60',
  );
  assert.throws(
    () => assertCacheSplitRules(driftedIndex),
    /Cache-Control: public, max-age=60/,
    'drifted /index.html rule must fail the cache-split contract',
  );

  // Drift 4: a group vanishes entirely (remove the `/favicon.ico` block).
  // Use `\r?\n` so the test passes regardless of the host line-ending style.
  const driftedMissing = content.replace(
    /\/favicon\.ico[\s\S]*?Cache-Control: public, max-age=86400\r?\n/,
    '',
  );
  assert.throws(
    () => assertCacheSplitRules(driftedMissing),
    /missing path group: \/favicon\.ico/,
    'missing path group must fail the cache-split contract',
  );

  // Type guard: non-string input surfaces the contract's own error path.
  assert.throws(
    () => assertCacheSplitRules(null),
    /headersContent must be a string/,
  );
});

test('assertCacheSplitRules rejects duplicate path groups (adv-2)', () => {
  const duplicateManifest = [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Cache-Control: no-store',
    '',
    '/manifest.webmanifest',
    '  Cache-Control: public, max-age=3600',
    '',
    '/manifest.webmanifest',
    '  Cache-Control: no-store',
    '',
    '/favicon.ico',
    '  Cache-Control: public, max-age=86400',
    '',
    '/',
    '  Cache-Control: no-store',
    '',
    '/index.html',
    '  Cache-Control: no-store',
    '',
    '/assets/bundles/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/assets/app-icons/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/styles/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n');
  assert.throws(
    () => assertCacheSplitRules(duplicateManifest),
    /duplicate path group: \/manifest\.webmanifest/,
  );
});

test('assertCacheSplitRules rejects multiple Cache-Control lines in one block (adv-3)', () => {
  const doubleCacheManifest = [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Cache-Control: no-store',
    '',
    '/manifest.webmanifest',
    '  Cache-Control: public, max-age=3600',
    '  Cache-Control: no-store',
    '',
    '/favicon.ico',
    '  Cache-Control: public, max-age=86400',
    '',
    '/',
    '  Cache-Control: no-store',
    '',
    '/index.html',
    '  Cache-Control: no-store',
    '',
    '/assets/bundles/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/assets/app-icons/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/styles/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n');
  assert.throws(
    () => assertCacheSplitRules(doubleCacheManifest),
    /has 2 Cache-Control lines; expected exactly one/,
  );
});

test('parseHeadersBlocks segments a `_headers` file into path/body pairs', () => {
  const sample = [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Cache-Control: no-store',
    '',
    '/favicon.ico',
    '  Cache-Control: public, max-age=86400',
  ].join('\n');
  const blocks = parseHeadersBlocks(sample);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].path, '/*');
  assert.match(blocks[0].body, /X-Content-Type-Options: nosniff/);
  assert.match(blocks[0].body, /Cache-Control: no-store/);
  assert.equal(blocks[1].path, '/favicon.ico');
  assert.match(blocks[1].body, /Cache-Control: public, max-age=86400/);
});

test('production bundle audit fails when live manifest Cache-Control drifts off 1-hour', async () => {
  // Stand up a stub origin that serves a sane HTML index + app bundle +
  // manifest, but advertises the *wrong* Cache-Control on the manifest
  // (no-store instead of 1-hour). The cache-split HEAD check must flag it.
  const server = createServer((request, response) => {
    const url = request.url || '/';
    if (url === '/' || url === '/index.html') {
      response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      response.end('<!doctype html><script src="/assets/app.js"></script>');
      return;
    }
    if (url === '/assets/app.js') {
      response.writeHead(200, {
        'content-type': 'application/javascript',
        'cache-control': 'public, max-age=31536000, immutable',
      });
      response.end('console.log("ok");');
      return;
    }
    if (url === '/src/bundles/app.bundle.js') {
      response.writeHead(200, {
        'content-type': 'application/javascript',
        'cache-control': 'public, max-age=31536000, immutable',
      });
      response.end('console.log("ok");');
      return;
    }
    if (url === '/assets/app-icons/favicon-32.png') {
      response.writeHead(200, {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=31536000, immutable',
      });
      response.end('');
      return;
    }
    if (url === '/api/bootstrap') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end('{}');
      return;
    }
    if (url === '/manifest.webmanifest') {
      // Drift: manifest must advertise `public, max-age=3600` but this
      // stub serves `no-store` — the HEAD check should fail loudly.
      response.writeHead(200, { 'content-type': 'application/manifest+json', 'cache-control': 'no-store' });
      response.end('{}');
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
        timeout: 8000,
      });
    }, (error) => {
      assert.match(
        error.stderr,
        /Cache-split HEAD check on web app manifest.*expected Cache-Control: public, max-age=3600, got: no-store/,
        'audit must name the drifted path and expected value',
      );
      return true;
    });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
