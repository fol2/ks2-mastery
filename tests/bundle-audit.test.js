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
import {
  PRACTICE_SEO_PAGES,
  canonicalPracticePageUrl,
} from '../scripts/lib/seo-practice-pages.mjs';
import {
  IDENTITY_SEO_PAGES,
  canonicalIdentityPageUrl,
} from '../scripts/lib/seo-identity-pages.mjs';
import {
  crawlerPolicyFailures,
  isCrawlerPathAllowed,
  parseRobotsGroups,
} from '../scripts/lib/seo-crawler-policy.mjs';

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

// U9 follow-up (review minor-1): self-test for the fault-injection
// token denial. The literal export name
// `__ks2_injectFault_TESTS_ONLY__` is listed in both
// `scripts/audit-client-bundle.mjs::FORBIDDEN_TEXT` and
// `scripts/production-bundle-audit.mjs::FORBIDDEN_DEPLOYED_TEXT`.
// This test pins the client-side arm so any future mistype of the
// token — or an accidental delete of the entry — fails loudly rather
// than silently allowing the chaos middleware to smuggle into a
// shipped bundle. The deployed arm is covered implicitly by the
// `production-bundle-audit.mjs` drift tests in this same file.
test('client bundle audit forbids the fault-injection token via the forbidden-text list', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ks2-runtime-boundary-'));
  const bundle = path.join(dir, 'app.bundle.js');
  const metafile = path.join(dir, 'app.bundle.meta.json');
  const publicDir = path.join(dir, 'public');
  await mkdir(publicDir, { recursive: true });
  // Synthetic bundle: the forbidden token embedded in what would
  // otherwise be a benign console log line. Any accidental import of
  // `tests/helpers/fault-injection.mjs` into a production bundle would
  // emit this symbol; the audit must flag it.
  await writeFile(bundle, 'console.log("__ks2_injectFault_TESTS_ONLY__");\n');
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
  }, /__ks2_injectFault_TESTS_ONLY__|fault-injection middleware/);
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

// Regression pin for the 2026-04-26 deploy failure: events.js is reachable
// from the client entry via achievements.js, so any reference to the
// `./data/` dataset modules drags the full spelling content dataset into
// `src/bundles/app.bundle.js`. The pin runs at `npm test`, so a regression
// fails locally without waiting for `audit:client` to run on deploy.
//
// The regex is path-anchored (not import-keyword-anchored) so it catches
// every reachable form: static `import`, `import ... from`, re-export
// (`export ... from`), dynamic `await import(...)`, side-effect import,
// and template-literal dynamic import (esbuild bundles these when they
// contain no interpolation). Every one of those produces an esbuild edge
// that `audit:client` would reject, and every one is caught here.
const WORD_DATA_PIN_REGEX = /['"`]\.\/data\/(?:word-data|content-data)\.js['"`]/;

test('spelling events factory does not reference the spelling content dataset', async () => {
  const events = await readFile('src/subjects/spelling/events.js', 'utf8');
  assert.doesNotMatch(
    events,
    WORD_DATA_PIN_REGEX,
    'src/subjects/spelling/events.js must not reference ./data/word-data.js '
      + 'or ./data/content-data.js — the dataset is reachable from the client '
      + 'entry and would inflate app.bundle.js past the audit boundary '
      + '(see scripts/audit-client-bundle.mjs).',
  );
});

// Self-test: verify the pin's regex would actually catch each bypass form.
// Without this, a future typo (e.g. `world-data` for `word-data`) silently
// passes the pin above forever. Mirrors the positive+negative pattern used
// by the FORBIDDEN_SHARED_PUNCTUATION_MODULES loop earlier in this file.
const FORBIDDEN_EVENTS_DATASET_SOURCE_FIXTURES = [
  `import { WORD_BY_SLUG } from './data/word-data.js';`,
  `import WORDS from "./data/word-data.js";`,
  `import { SEEDED_SPELLING_PUBLISHED_SNAPSHOT } from './data/content-data.js';`,
  `export { WORD_BY_SLUG } from './data/word-data.js';`,
  `const { WORD_BY_SLUG } = await import('./data/word-data.js');`,
  `import './data/word-data.js';`,
  'const { WORD_BY_SLUG } = await import(`./data/word-data.js`);',
];

for (const fixture of FORBIDDEN_EVENTS_DATASET_SOURCE_FIXTURES) {
  test(`WORD_DATA_PIN_REGEX matches forbidden form: ${fixture}`, () => {
    assert.match(fixture, WORD_DATA_PIN_REGEX);
  });
}

test('WORD_DATA_PIN_REGEX does not match benign references', () => {
  // Benign strings that should not trip the pin — a neighbouring path, a
  // comment mentioning the module, and a different relative-path root.
  assert.doesNotMatch(`import x from './data/other.js';`, WORD_DATA_PIN_REGEX);
  assert.doesNotMatch(`// previously imported ./data/word-data.js here`, WORD_DATA_PIN_REGEX);
  assert.doesNotMatch(`import x from '../data/word-data.js';`, WORD_DATA_PIN_REGEX);
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

test('SEO crawler policy helper keeps OAI public access separate from GPTBot training policy', () => {
  const robots = [
    'User-agent: *',
    'Disallow: /api/',
    'Disallow: /admin',
    'Disallow: /demo',
    'Allow: /',
    '',
    'User-agent: GPTBot',
    'Disallow: /',
  ].join('\n');

  assert.equal(parseRobotsGroups(robots).length, 2);
  assert.equal(isCrawlerPathAllowed(robots, 'OAI-SearchBot', '/about/'), true);
  assert.equal(isCrawlerPathAllowed(robots, 'OAI-SearchBot', '/api/bootstrap'), false);
  assert.equal(isCrawlerPathAllowed(robots, 'GPTBot', '/about/'), false);
  assert.deepEqual(crawlerPolicyFailures(robots, {
    userAgent: 'OAI-SearchBot',
    publicPaths: ['/', '/about/'],
    privatePaths: ['/api/', '/admin', '/demo'],
  }), []);
});

test('SEO crawler policy helper requires private disallows in bot-specific OAI groups', () => {
  const robots = [
    'User-agent: *',
    'Disallow: /api/',
    'Disallow: /admin',
    'Disallow: /demo',
    'Allow: /',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
  ].join('\n');

  assert.equal(isCrawlerPathAllowed(robots, 'OAI-SearchBot', '/about/'), true);
  assert.equal(isCrawlerPathAllowed(robots, 'OAI-SearchBot', '/api/bootstrap'), true);
  assert.match(crawlerPolicyFailures(robots, {
    userAgent: 'OAI-SearchBot',
    publicPaths: ['/', '/about/'],
    privatePaths: ['/api/', '/admin', '/demo'],
  }).join('\n'), /must repeat the private-path disallow for \/api\//);
});

test('SEO crawler policy helper rejects generic private-path allow overrides', () => {
  const robots = [
    'User-agent: *',
    'Disallow: /api/',
    'Allow: /api/',
    'Disallow: /admin',
    'Disallow: /demo',
    'Allow: /',
  ].join('\n');

  assert.equal(isCrawlerPathAllowed(robots, 'OAI-SearchBot', '/api/bootstrap'), true);
  assert.match(crawlerPolicyFailures(robots, {
    userAgent: 'OAI-SearchBot',
    publicPaths: ['/', '/about/'],
    privatePaths: ['/api/', '/admin', '/demo'],
  }).join('\n'), /must disallow OAI-SearchBot from private crawler path \/api\//);
});

const SEO_AUDIT_SECURITY_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'microphone=()',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin-allow-popups',
  'cross-origin-resource-policy': 'same-site',
  'content-security-policy-report-only': "default-src 'none'; script-src 'self' 'sha256-abc=' 'strict-dynamic'; report-uri /api/security/csp-report; report-to csp-endpoint",
  'report-to': '{"group":"csp-endpoint","max_age":10886400,"endpoints":[{"url":"/api/security/csp-report"}]}',
  'reporting-endpoints': 'csp-endpoint="/api/security/csp-report"',
};

function seoAuditRootHtml({ omitCanonical = false } = {}) {
  return [
    '<!doctype html><html lang="en-GB"><head>',
    '<title>KS2 Mastery | KS2 Spelling, Grammar and Punctuation Practice</title>',
    '<meta name="description" content="KS2 Mastery helps learners practise KS2 spelling, grammar and punctuation online." />',
    omitCanonical ? '' : '<link rel="canonical" href="https://ks2.eugnel.uk/" />',
    '<meta property="og:title" content="KS2 Mastery | KS2 Spelling, Grammar and Punctuation Practice" />',
    '<meta property="og:description" content="Online KS2 English practice for spelling, grammar and punctuation." />',
    '<meta property="og:url" content="https://ks2.eugnel.uk/" />',
    '<meta name="twitter:card" content="summary" />',
    '<link rel="alternate" type="text/plain" href="/llms.txt" title="AI-readable KS2 Mastery summary" />',
    '<script type="application/ld+json">',
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': ['WebApplication', 'LearningResource'],
      name: 'KS2 Mastery',
      url: 'https://ks2.eugnel.uk/',
      description: 'KS2 Mastery helps learners practise KS2 spelling, grammar and punctuation online.',
      learningResourceType: 'Practice tool',
      teaches: ['KS2 spelling', 'KS2 grammar', 'KS2 punctuation'],
    }),
    '</script>',
    '</head><body>',
    '<main><h1>KS2 spelling, grammar and punctuation practice</h1>',
    '<p>Spelling practice for KS2 word confidence</p>',
    '<p>Grammar practice for sentence-level accuracy</p>',
    '<p>Punctuation practice for clearer written English</p>',
    '<a href="/about/">About KS2 Mastery</a></main>',
    '<script type="module" src="/src/bundles/app.bundle.js?v=test"></script>',
    '</body></html>',
  ].join('');
}

function seoAuditPracticePageHtml(page, { omitCanonical = false, forbiddenToken = '' } = {}) {
  const canonicalUrl = canonicalPracticePageUrl(page);
  return [
    '<!doctype html><html lang="en-GB"><head>',
    `<title>${page.title}</title>`,
    `<meta name="description" content="${page.description}" />`,
    omitCanonical ? '' : `<link rel="canonical" href="${canonicalUrl}" />`,
    `<meta property="og:title" content="${page.title}" />`,
    `<meta property="og:description" content="${page.description}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    '<meta name="twitter:card" content="summary" />',
    '</head><body>',
    `<main><h1>${page.heading}</h1>`,
    `<p>${page.intro}</p>`,
    '<ul>',
    ...page.points.map((point) => `<li>${point}</li>`),
    '</ul>',
    forbiddenToken ? `<p>${forbiddenToken}</p>` : '',
    '<a href="/demo">Try demo</a>',
    '<a href="/about/">About KS2 Mastery</a>',
    '<a href="/">KS2 Mastery home</a>',
    '</main>',
    '</body></html>',
  ].join('');
}

function seoAuditIdentityPageHtml(page, { forbiddenToken = '' } = {}) {
  const canonicalUrl = canonicalIdentityPageUrl(page);
  return [
    '<!doctype html><html lang="en-GB"><head>',
    `<title>${page.title}</title>`,
    `<meta name="description" content="${page.description}" />`,
    `<link rel="canonical" href="${canonicalUrl}" />`,
    `<meta property="og:title" content="${page.title}" />`,
    `<meta property="og:description" content="${page.description}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    '<meta name="twitter:card" content="summary" />',
    '</head><body>',
    `<main><h1>${page.heading}</h1>`,
    `<p>${page.intro}</p>`,
    '<p>KS2 spelling, grammar and punctuation practice</p>',
    '<p>Learners can try a demo before signing in</p>',
    '<p>Signing in saves learner profiles and progress</p>',
    '<p>Private learner progress, admin tools and generated content stores are not public SEO content</p>',
    forbiddenToken ? `<p>${forbiddenToken}</p>` : '',
    '<a href="/ks2-spelling-practice/">KS2 spelling practice online</a>',
    '<a href="/ks2-grammar-practice/">KS2 grammar practice online</a>',
    '<a href="/ks2-punctuation-practice/">KS2 punctuation practice online</a>',
    '<a href="/demo">Try demo</a>',
    '</main>',
    '</body></html>',
  ].join('');
}

function seoAuditLlmsTxt({ forbiddenToken = '' } = {}) {
  return [
    '# KS2 Mastery',
    '',
    'KS2 Mastery is an online KS2 spelling, grammar and punctuation practice product for learners and supporting adults.',
    '',
    'Canonical public pages:',
    '- https://ks2.eugnel.uk/',
    ...IDENTITY_SEO_PAGES.map((page) => `- ${canonicalIdentityPageUrl(page)}`),
    ...PRACTICE_SEO_PAGES.map((page) => `- ${canonicalPracticePageUrl(page)}`),
    '',
    'Current subject coverage:',
    '- KS2 spelling practice for word confidence and recall',
    '- KS2 grammar practice for sentence-level accuracy',
    '- KS2 punctuation practice for clearer written English',
    '',
    'Product notes:',
    '- Private learner progress, account state, operator tools and generated content stores are not public SEO content.',
    forbiddenToken ? `- ${forbiddenToken}` : '',
    '',
  ].join('\n');
}

function createSeoAuditStubServer(options = {}) {
  const server = createServer((request, response) => {
    const url = request.url || '/';
    const method = request.method || 'GET';
    const write = (status, headers, body = '') => {
      response.writeHead(status, { ...SEO_AUDIT_SECURITY_HEADERS, ...headers });
      response.end(method === 'HEAD' ? '' : body);
    };

    if (url === '/' || url === '/index.html') {
      write(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }, seoAuditRootHtml(options));
      return;
    }
    for (const page of PRACTICE_SEO_PAGES) {
      if (url === `/${page.slug}/`) {
        if (options.practiceFallbackSlug === page.slug) {
          write(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }, seoAuditRootHtml());
          return;
        }
        write(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }, seoAuditPracticePageHtml(page, {
          omitCanonical: options.omitPracticeCanonicalSlug === page.slug,
          forbiddenToken: options.practiceForbiddenTokenSlug === page.slug
            ? 'OPENAI_API_KEY'
            : '',
        }));
        return;
      }
    }
    for (const page of IDENTITY_SEO_PAGES) {
      if (url === `/${page.slug}/`) {
        if (options.identityFallbackSlug === page.slug) {
          write(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }, seoAuditRootHtml());
          return;
        }
        write(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }, seoAuditIdentityPageHtml(page, {
          forbiddenToken: options.identityForbiddenTokenSlug === page.slug
            ? 'OPENAI_API_KEY'
            : '',
        }));
        return;
      }
    }
    if (url === '/robots.txt') {
      if (options.robotsFallback) {
        write(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }, seoAuditRootHtml());
        return;
      }
      const robotsLines = [
        'User-agent: *',
        'Disallow: /api/',
        'Disallow: /admin',
        'Disallow: /demo',
        'Allow: /',
        '',
      ];
      if (options.robotsGenericAllowPrivate) {
        robotsLines.push(
          `Allow: ${options.robotsGenericAllowPrivate}`,
          '',
        );
      }
      if (options.robotsOaiDisallowRoot) {
        robotsLines.push(
          'User-agent: OAI-SearchBot',
          'Disallow: /',
          '',
        );
      }
      if (options.robotsOaiSpecificMissingPrivate) {
        robotsLines.push(
          'User-agent: OAI-SearchBot',
          'Allow: /',
          '',
        );
      }
      if (options.robotsGptbotDisallowRoot) {
        robotsLines.push(
          'User-agent: GPTBot',
          'Disallow: /',
          '',
        );
      }
      robotsLines.push(
        'Sitemap: https://ks2.eugnel.uk/sitemap.xml',
        '',
      );
      write(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' }, robotsLines.join('\n'));
      return;
    }
    if (url === '/sitemap.xml') {
      const sitemapUrls = [
        'https://ks2.eugnel.uk/',
        ...PRACTICE_SEO_PAGES
          .filter((page) => page.slug !== options.omitSitemapPageSlug)
          .map((page) => canonicalPracticePageUrl(page)),
        ...IDENTITY_SEO_PAGES
          .filter((page) => page.slug !== options.omitSitemapIdentitySlug)
          .map((page) => canonicalIdentityPageUrl(page)),
      ];
      if (options.sitemapForbiddenPath) {
        sitemapUrls.push(`https://ks2.eugnel.uk${options.sitemapForbiddenPath}`);
      }
      if (options.sitemapExtraUrl) {
        sitemapUrls.push(options.sitemapExtraUrl);
      }
      write(200, { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' }, [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...sitemapUrls.flatMap((url) => [
          '  <url>',
          `    <loc>${url}</loc>`,
          '  </url>',
        ]),
        '</urlset>',
        '',
      ].join('\n'));
      return;
    }
    if (url === '/llms.txt') {
      if (options.llmsFallback) {
        write(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }, seoAuditRootHtml());
        return;
      }
      write(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' }, seoAuditLlmsTxt({
        forbiddenToken: options.llmsForbiddenToken || '',
      }));
      return;
    }
    if (url === '/src/bundles/app.bundle.js' || url === '/src/bundles/app.bundle.js?v=test') {
      write(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' }, 'import"./chunk-CLEAN.js"; console.log("ok");');
      return;
    }
    if (url === '/src/bundles/chunk-CLEAN.js') {
      write(200, {
        'content-type': 'application/javascript',
        'cache-control': 'public, max-age=31536000, immutable',
      }, 'console.log("clean");');
      return;
    }
    if (url === '/assets/app-icons/favicon-32.png') {
      write(200, {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=31536000, immutable',
      });
      return;
    }
    if (url === '/manifest.webmanifest') {
      write(200, {
        'content-type': 'application/manifest+json',
        'cache-control': 'public, max-age=3600',
      }, '{}');
      return;
    }
    if (url === '/api/demo/session') {
      write(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'set-cookie': 'ks2_session=demo-cookie; Path=/; HttpOnly',
      }, JSON.stringify({
        ok: true,
        session: { demo: true, accountId: 'acct-demo', learnerId: 'learner-demo' },
      }));
      return;
    }
    if (url === '/api/bootstrap') {
      write(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }, JSON.stringify({
        ok: true,
        session: { demo: true, accountId: 'acct-demo', learnerId: 'learner-demo' },
        learners: {
          selectedId: 'learner-demo',
          byId: { 'learner-demo': { stateRevision: 0 } },
        },
      }));
      return;
    }
    if (url === '/api/auth/logout') {
      write(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'clear-site-data': '"cache", "cookies", "storage"',
      }, '{}');
      return;
    }
    if (url === '/api/tts') {
      write(401, { 'content-type': 'application/json', 'cache-control': 'no-store' }, '{}');
      return;
    }
    write(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' }, 'not found');
  });
  return server;
}

async function closeServer(server) {
  server.closeAllConnections?.();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test('production bundle audit passes with SEO root, robots, and sitemap resources', async () => {
  const server = createSeoAuditStubServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const { stdout } = await execFileAsync(process.execPath, [
      './scripts/production-bundle-audit.mjs',
      '--skip-local',
      '--url',
      `http://127.0.0.1:${port}/`,
    ], {
      cwd: process.cwd(),
      timeout: 8000,
    });
    assert.match(stdout, /Production bundle audit passed/);
    assert.match(stdout, /cache-split checks: 12\/12/);
  } finally {
    await closeServer(server);
  }
});

test('production bundle audit fails when a practice page is SPA fallback HTML', async () => {
  const server = createSeoAuditStubServer({ practiceFallbackSlug: 'ks2-spelling-practice' });
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
      assert.match(error.stderr, /Production SEO page \/ks2-spelling-practice\/ appears to be the root SPA shell/);
      return true;
    });
  } finally {
    await closeServer(server);
  }
});

test('production bundle audit fails when a practice page canonical URL disappears', async () => {
  const server = createSeoAuditStubServer({ omitPracticeCanonicalSlug: 'ks2-grammar-practice' });
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
      assert.match(error.stderr, /Production SEO page \/ks2-grammar-practice\/ is missing required token: <link rel="canonical"/);
      return true;
    });
  } finally {
    await closeServer(server);
  }
});

test('production bundle audit fails when a practice page leaks forbidden deployed text', async () => {
  const server = createSeoAuditStubServer({ practiceForbiddenTokenSlug: 'ks2-punctuation-practice' });
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
      assert.match(error.stderr, /Production SEO page \/ks2-punctuation-practice\/ includes forbidden deployed token: OPENAI_API_KEY/);
      return true;
    });
  } finally {
    await closeServer(server);
  }
});

test('production bundle audit fails when the about page is SPA fallback HTML', async () => {
  const server = createSeoAuditStubServer({ identityFallbackSlug: 'about' });
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
      assert.match(error.stderr, /Production SEO page \/about\/ appears to be the root SPA shell/);
      return true;
    });
  } finally {
    await closeServer(server);
  }
});

test('production bundle audit fails when llms.txt is SPA fallback HTML or leaks private text', async () => {
  const fallbackServer = createSeoAuditStubServer({ llmsFallback: true });
  await new Promise((resolve) => fallbackServer.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = fallbackServer.address();
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
      assert.match(error.stderr, /Production llms\.txt appears to be SPA fallback HTML/);
      return true;
    });
  } finally {
    await closeServer(fallbackServer);
  }

  const leakServer = createSeoAuditStubServer({ llmsForbiddenToken: 'OPENAI_API_KEY' });
  await new Promise((resolve) => leakServer.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = leakServer.address();
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
      assert.match(error.stderr, /Production \/llms\.txt must not include forbidden token: OPENAI_API_KEY/);
      return true;
    });
  } finally {
    await closeServer(leakServer);
  }
});

test('production bundle audit fails when sitemap misses or leaks practice-page URLs', async () => {
  const missingServer = createSeoAuditStubServer({ omitSitemapPageSlug: 'ks2-punctuation-practice' });
  await new Promise((resolve) => missingServer.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = missingServer.address();
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
      assert.match(error.stderr, /Production sitemap.xml is missing required token: <loc>https:\/\/ks2\.eugnel\.uk\/ks2-punctuation-practice\/<\/loc>/);
      return true;
    });
  } finally {
    await closeServer(missingServer);
  }

  const leakServer = createSeoAuditStubServer({ sitemapForbiddenPath: '/demo' });
  await new Promise((resolve) => leakServer.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = leakServer.address();
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
      assert.match(error.stderr, /Production sitemap.xml must not advertise private or local path: \/demo/);
      return true;
    });
  } finally {
    await closeServer(leakServer);
  }

  const extraServer = createSeoAuditStubServer({ sitemapExtraUrl: 'https://ks2.eugnel.uk/unplanned-public-page/' });
  await new Promise((resolve) => extraServer.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = extraServer.address();
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
      assert.match(error.stderr, /Production sitemap\.xml must contain exactly/);
      assert.match(error.stderr, /Unexpected: https:\/\/ks2\.eugnel\.uk\/unplanned-public-page\//);
      return true;
    });
  } finally {
    await closeServer(extraServer);
  }
});

test('production bundle audit fails when robots.txt is SPA fallback HTML', async () => {
  const server = createSeoAuditStubServer({ robotsFallback: true });
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
      assert.match(error.stderr, /Production robots\.txt appears to be SPA fallback HTML/);
      return true;
    });
  } finally {
    await closeServer(server);
  }
});

test('production bundle audit fails when OAI-SearchBot is blocked from public SEO pages', async () => {
  const server = createSeoAuditStubServer({ robotsOaiDisallowRoot: true });
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
      assert.match(error.stderr, /Production robots\.txt must allow OAI-SearchBot to fetch public SEO path \//);
      assert.match(error.stderr, /Cloudflare bot\/crawler settings/);
      return true;
    });
  } finally {
    await closeServer(server);
  }
});

test('production bundle audit fails when generic robots allows private paths for OAI-SearchBot', async () => {
  const server = createSeoAuditStubServer({ robotsGenericAllowPrivate: '/api/' });
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
      assert.match(error.stderr, /Production robots\.txt must disallow OAI-SearchBot from private crawler path \/api\//);
      return true;
    });
  } finally {
    await closeServer(server);
  }
});

test('production bundle audit allows GPTBot training disallow when OAI search remains crawlable', async () => {
  const server = createSeoAuditStubServer({ robotsGptbotDisallowRoot: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const { stdout } = await execFileAsync(process.execPath, [
      './scripts/production-bundle-audit.mjs',
      '--skip-local',
      '--url',
      `http://127.0.0.1:${port}/`,
    ], {
      cwd: process.cwd(),
      timeout: 8000,
    });
    assert.match(stdout, /Production bundle audit passed/);
  } finally {
    await closeServer(server);
  }
});

test('production bundle audit fails when OAI-specific robots group omits private disallows', async () => {
  const server = createSeoAuditStubServer({ robotsOaiSpecificMissingPrivate: true });
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
      assert.match(error.stderr, /Production robots\.txt has a bot-specific OAI-SearchBot group, so it must repeat the private-path disallow for \/api\//);
      assert.match(error.stderr, /Cloudflare bot\/crawler settings/);
      return true;
    });
  } finally {
    await closeServer(server);
  }
});

test('production bundle audit fails when the root canonical URL disappears', async () => {
  const server = createSeoAuditStubServer({ omitCanonical: true });
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
      assert.match(error.stderr, /Production SEO root is missing required public identity token: <link rel="canonical"/);
      return true;
    });
  } finally {
    await closeServer(server);
  }
});

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
  // The `/*` block intentionally has no `Cache-Control` line — Cloudflare
  // Workers Static Assets appends matching block headers, so a wildcard
  // `Cache-Control` would prepend onto every more-specific block. The
  // assertion under test (multiple `Cache-Control` in the manifest block)
  // is unrelated to that contract and must still fire.
  const doubleCacheManifest = [
    '/*',
    '  X-Content-Type-Options: nosniff',
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
      response.end('<!doctype html><script type="module" src="/src/bundles/app.bundle.js?v=test"></script>');
      return;
    }
    if (url === '/src/bundles/app.bundle.js' || url === '/src/bundles/app.bundle.js?v=test') {
      response.writeHead(200, {
        'content-type': 'application/javascript',
        'cache-control': 'no-store',
      });
      response.end('import"./chunk-CLEAN.js"; console.log("ok");');
      return;
    }
    if (url === '/src/bundles/chunk-CLEAN.js') {
      response.writeHead(200, {
        'content-type': 'application/javascript',
        'cache-control': 'public, max-age=31536000, immutable',
      });
      response.end('console.log("clean");');
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

// ---------------------------------------------------------------------------
// SH2-U10: split-chunk forbidden-token scan + CLS monster-image width/height.
// ---------------------------------------------------------------------------

test('production bundle audit walks dynamic import chunks referenced only via import()', async () => {
  // Prove the S-01 mirror: a split chunk loaded via `import("./chunk-x.js")`
  // from the HTML-referenced entry is still scanned for forbidden tokens
  // by `scripts/production-bundle-audit.mjs`. Without the walk-all-chunks
  // upgrade, the pre-U10 auditor would only scan `app.bundle.js` and the
  // forbidden token in the split chunk would escape undetected.
  const server = createServer((request, response) => {
    const url = request.url || '/';
    if (url === '/' || url === '/index.html') {
      response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      response.end('<!doctype html><script type="module" src="/src/bundles/app.bundle.js"></script>');
      return;
    }
    if (url === '/src/bundles/app.bundle.js') {
      // The entry chunk itself is clean, but it dynamically imports the
      // split chunk. Esbuild emits `import("./chunk-CAFEBABE.js")` here.
      response.writeHead(200, {
        'content-type': 'application/javascript',
        'cache-control': 'no-store',
      });
      response.end('const m = import("./chunk-CAFEBABE.js"); console.log(m);');
      return;
    }
    if (url === '/src/bundles/chunk-CAFEBABE.js') {
      // Forbidden token buried in the split chunk. Pre-U10 audit missed this.
      response.writeHead(200, {
        'content-type': 'application/javascript',
        'cache-control': 'public, max-age=31536000, immutable',
      });
      response.end('console.log("PUNCTUATION_CONTENT_MANIFEST");');
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
    if (url === '/manifest.webmanifest') {
      response.writeHead(200, {
        'content-type': 'application/manifest+json',
        'cache-control': 'public, max-age=3600',
      });
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
      // Audit must name the SPLIT chunk path + the forbidden token.
      assert.match(
        error.stderr,
        /Production bundle \/src\/bundles\/chunk-CAFEBABE\.js includes forbidden deployed token: PUNCTUATION_CONTENT_MANIFEST/,
        `expected split-chunk failure in stderr; got: ${error.stderr}`,
      );
      return true;
    });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

// SH2-U10 reviewer-follow-up (BLOCKER-1): the production bundle audit MUST
// walk chunks referenced via minified zero-whitespace static imports. The
// pre-follow-up regex required `\s+` between `import` and the clause, which
// missed esbuild's real minified output of `import{X as Y}from"./chunk-X.js"`
// — leaving every shared `chunk-*.js` un-scanned in production. This test
// stages a stub origin serving the exact zero-whitespace form and asserts
// the auditor follows the reference into the referenced chunk and reports
// the forbidden token. Also covers the side-effect form `import"./side.js"`
// with zero whitespace.
test('production audit walks chunks referenced via minified static imports (no whitespace)', async () => {
  const server = createServer((request, response) => {
    const url = request.url || '/';
    if (url === '/' || url === '/index.html') {
      response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      response.end('<!doctype html><script type="module" src="/src/bundles/app.bundle.js"></script>');
      return;
    }
    if (url === '/src/bundles/app.bundle.js') {
      // Exactly the minified form esbuild emits: zero whitespace between
      // `import`, the clause, and `from`. Two chunk refs here — a named
      // static import AND a side-effect import — both zero-whitespace.
      response.writeHead(200, {
        'content-type': 'application/javascript',
        'cache-control': 'no-store',
      });
      response.end(
        'import{X as a,Y as b}from"./chunk-static.js";import"./side-effect.js";console.log(a,b);',
      );
      return;
    }
    if (url === '/src/bundles/chunk-static.js') {
      // Forbidden token in the minified-static-import-referenced chunk.
      response.writeHead(200, {
        'content-type': 'application/javascript',
        'cache-control': 'public, max-age=31536000, immutable',
      });
      response.end('const x="PUNCTUATION_CONTENT_MANIFEST";export{x as X,x as Y};');
      return;
    }
    if (url === '/src/bundles/side-effect.js') {
      // Separate forbidden token in the side-effect-import-referenced chunk.
      response.writeHead(200, {
        'content-type': 'application/javascript',
        'cache-control': 'public, max-age=31536000, immutable',
      });
      response.end('console.log("createPunctuationService");');
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
    if (url === '/manifest.webmanifest') {
      response.writeHead(200, {
        'content-type': 'application/manifest+json',
        'cache-control': 'public, max-age=3600',
      });
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
      // Both chunks must be visited + scanned. If the regex misses either
      // form, the corresponding forbidden token never lands in stderr.
      assert.match(
        error.stderr,
        /Production bundle \/src\/bundles\/chunk-static\.js includes forbidden deployed token: PUNCTUATION_CONTENT_MANIFEST/,
        `expected minified static-import chunk to be scanned; stderr: ${error.stderr}`,
      );
      assert.match(
        error.stderr,
        /Production bundle \/src\/bundles\/side-effect\.js includes forbidden deployed token: createPunctuationService/,
        `expected minified side-effect-import chunk to be scanned; stderr: ${error.stderr}`,
      );
      return true;
    });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

// SH2-U10 CLS: monster image primitives must declare intrinsic `width` +
// `height` so the browser reserves the sprite box before the .webp decodes.
// The grep-backed list keeps the intent static: each file is checked against
// the presence of both attributes in an `<img>` tag. A future refactor that
// rips out either attribute falls into this test with a pointed message.
test('monster image primitives declare intrinsic width/height for CLS', async () => {
  const targets = [
    // Main shell sprite — covers Codex cards, hero, lightbox, because
    // MonsterRender + BaseSprite render the image for all three surfaces.
    'src/platform/game/render/BaseSprite.jsx',
    // Home hero meadow (standalone <img>; not via BaseSprite).
    'src/surfaces/home/MonsterMeadow.jsx',
    // Toast portrait (standalone <img>).
    'src/surfaces/shell/ToastShelf.jsx',
  ];
  for (const file of targets) {
    const source = await readFile(path.join(REPO_ROOT, file), 'utf8');
    const imgTagMatch = source.match(/<img\b[\s\S]*?\/>/m);
    assert.ok(imgTagMatch, `${file}: expected a self-closing <img /> tag`);
    const tag = imgTagMatch[0];
    assert.match(
      tag,
      /\bwidth=/,
      `${file}: <img> must declare width="..." for CLS (no layout shift during decode)`,
    );
    assert.match(
      tag,
      /\bheight=/,
      `${file}: <img> must declare height="..." for CLS (no layout shift during decode)`,
    );
  }
});

// SH2-U10: the Worker allowlist must use prefix + extension match so split
// chunks resolve in production. Parser-level test so a future refactor that
// accidentally restores the exact-equality check (or forgets the `.js`
// suffix gate) fails with an actionable message rather than a silent 404.
test('Worker publicSourceAssetResponse allowlist matches /src/bundles/*.js by prefix (F-01)', async () => {
  const workerSource = await readFile(path.join(REPO_ROOT, 'worker', 'src', 'app.js'), 'utf8');
  // The ALLOWLIST gate must not be a plain string equality check on the
  // main bundle filename — that would 404 every split chunk.
  assert.doesNotMatch(
    workerSource,
    /url\.pathname\s*===\s*['"]\/src\/bundles\/app\.bundle\.js['"]/,
    'exact-equality check reintroduced; would 404 split chunks (F-01)',
  );
  // Positive check: prefix + extension match is present.
  assert.match(
    workerSource,
    /url\.pathname\.startsWith\(['"]\/src\/bundles\/['"]\)/,
    'Worker allowlist must prefix-match /src/bundles/ (F-01)',
  );
  assert.match(
    workerSource,
    /url\.pathname\.endsWith\(['"]\.js['"]\)/,
    'Worker allowlist must gate on the .js extension so metafile JSON cannot leak (F-01)',
  );
});
