// Hero Mode — No-write boundary tests.
//
// Structural and behavioural tests proving the Hero code layer cannot
// directly write reward or subject state. These guard against accidental
// drift that would violate the architectural contract.
//
// Structural tests (S1-S6): use fs.readFileSync to scan the import graph
// and source content of every .js file under shared/hero/ and
// worker/src/hero/. No file IO at test-time beyond reading local source.
// New P1 files (launch.js, launch-adapters/, launch-context.js,
// launch-status.js) are automatically included via collectJsFiles().
//
// Behavioural tests (B7-B8): B7 proves GET read-model writes zero rows.
// B8 proves POST /api/hero/command returns 404 when the launch flag is
// off. The flag-on path is covered in worker-hero-command.test.js and
// hero-launch-boundary.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

// ── Helpers ──────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Recursively collect all .js files under a directory.
 */
function collectJsFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Strip single-line and multi-line comments from source code so that
 * structural grep assertions do not fire on documentation or TODOs.
 */
function stripComments(source) {
  return source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

const SHARED_HERO_DIR = path.join(REPO_ROOT, 'shared', 'hero');
const WORKER_HERO_DIR = path.join(REPO_ROOT, 'worker', 'src', 'hero');
const CLIENT_SRC_DIR = path.join(REPO_ROOT, 'src');

const SHARED_HERO_FILES = collectJsFiles(SHARED_HERO_DIR);
const WORKER_HERO_FILES = collectJsFiles(WORKER_HERO_DIR);
const ALL_HERO_FILES = [...SHARED_HERO_FILES, ...WORKER_HERO_FILES];

// Pre-read all hero sources (stripped of comments) for structural checks.
const HERO_SOURCES = new Map();
for (const filePath of ALL_HERO_FILES) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  HERO_SOURCES.set(rel, { raw, code: stripComments(raw) });
}

// ── Structural test 1: shared/hero/ does not import repository write methods ─

test('S1: shared/hero/ modules do not import repository write primitives', () => {
  const FORBIDDEN = ['.run(', '.batch(', 'bindStatement', 'createWorkerRepository'];
  for (const filePath of SHARED_HERO_FILES) {
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const { code } = HERO_SOURCES.get(rel);
    for (const token of FORBIDDEN) {
      assert.ok(
        !code.includes(token),
        `${rel} contains forbidden repository write token "${token}"`,
      );
    }
  }
});

// ── Structural test 2: shared/hero/ does not import subject runtime ──────────

test('S2: shared/hero/ modules do not import worker/src/subjects/runtime.js', () => {
  for (const filePath of SHARED_HERO_FILES) {
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const { code } = HERO_SOURCES.get(rel);
    assert.ok(
      !code.includes('subjects/runtime'),
      `${rel} imports from subjects/runtime — shared/hero must not depend on subject runtime`,
    );
  }
});

// ── Structural test 3: worker/src/hero/ does not import dispatch from subject runtime ─

test('S3: worker/src/hero/ modules do not import dispatch from subject runtime', () => {
  for (const filePath of WORKER_HERO_FILES) {
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const { code } = HERO_SOURCES.get(rel);
    // Check for both the import path and the dispatch function name in
    // combination. A benign comment mentioning "dispatch" is stripped.
    if (code.includes('subjects/runtime')) {
      assert.fail(
        `${rel} imports from subjects/runtime — worker/src/hero must not depend on subject dispatch`,
      );
    }
    // Also check for bare `dispatch(` calls which would indicate runtime mutation.
    assert.ok(
      !/\bdispatch\s*\(/.test(code),
      `${rel} calls dispatch() — Hero providers must be read-only`,
    );
  }
});

// ── Structural test 4: worker/src/hero/ does not use D1 write primitives ─────

test('S4: worker/src/hero/ modules do not use .run(), .batch(), or bindStatement() from d1.js', () => {
  for (const filePath of WORKER_HERO_FILES) {
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const { code } = HERO_SOURCES.get(rel);

    // d1.js import check — matches `from './d1.js'` or `from '../d1.js'` etc.
    assert.ok(
      !/from\s+['"].*d1\.js['"]/.test(code),
      `${rel} imports from d1.js — Hero code must not use D1 write primitives`,
    );

    // bindStatement check
    assert.ok(
      !/\bbindStatement\s*\(/.test(code),
      `${rel} calls bindStatement() — Hero code must not use D1 write primitives`,
    );

    // D1 .run() check — matches `db.prepare(...).run()` and similar
    // dot-prefixed calls, not bare `run(` which matches benign code.
    assert.ok(
      !/\.run\s*\(/.test(code),
      `${rel} calls .run() — Hero code must not use D1 write primitives`,
    );

    // D1 .batch() check — dot-prefixed to avoid matching Array helpers.
    assert.ok(
      !/\.batch\s*\(/.test(code),
      `${rel} calls .batch() — Hero code must not use D1 write primitives`,
    );
  }
});

// ── Structural test 5: no client src/ file imports from shared/hero or worker/src/hero ─

test('S5: client src/ files may import shared/hero/hero-copy only; all other shared/hero/ and worker/src/hero/ imports are forbidden', () => {
  const clientFiles = collectJsFiles(CLIENT_SRC_DIR).filter(
    (f) => (f.endsWith('.js') || f.endsWith('.jsx'))
      && !path.relative(CLIENT_SRC_DIR, f).replace(/\\/g, '/').startsWith('bundles/'),
  );

  // Allowlist: these shared/hero/ module names are safe for client import.
  // hero-copy: copy definitions (P2)
  // completion-status: pure derivation utility (P3 U10 — auto-claim trigger guard)
  const ALLOWED_SHARED_HERO_MODULES = new Set(['hero-copy', 'completion-status']);

  // Forbidden module patterns that must never appear in client code.
  const FORBIDDEN_SHARED_HERO_MODULES = [
    'shared/hero/scheduler',
    'shared/hero/eligibility',
    'shared/hero/seed',
    'shared/hero/launch-context',
    'shared/hero/launch-status',
  ];

  for (const filePath of clientFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');

    // worker/src/hero/ is always forbidden from client code.
    assert.ok(
      !source.includes('worker/src/hero'),
      `${rel} imports from worker/src/hero — Hero worker internals must not be imported by client code`,
    );

    // Explicit check for forbidden shared/hero/ modules.
    for (const forbidden of FORBIDDEN_SHARED_HERO_MODULES) {
      assert.ok(
        !source.includes(forbidden),
        `${rel} imports from ${forbidden} — only shared/hero/hero-copy is allowed in client code`,
      );
    }

    // Any shared/hero/ reference must be on the allowlist.
    const sharedHeroImports = source.match(/shared\/hero\/([a-z0-9-]+)/g) || [];
    for (const match of sharedHeroImports) {
      const moduleName = match.replace('shared/hero/', '');
      assert.ok(
        ALLOWED_SHARED_HERO_MODULES.has(moduleName),
        `${rel} imports shared/hero/${moduleName} — only ${[...ALLOWED_SHARED_HERO_MODULES].join(', ')} allowed in client code`,
      );
    }
  }
});

// ── Structural test 6: no P0 source file contains reward/economy strings ─────

test('S6: no P0 Hero source file contains reward/economy tokens', () => {
  // Case-insensitive check on code (comments already stripped).
  // hero-copy.js is excluded because it *defines* the canonical
  // forbidden-vocabulary list — it legitimately contains those tokens
  // as string literals.
  const FORBIDDEN_ECONOMY_TOKENS = [
    /\bcoin\b/i,
    /\bshop\b/i,
    /\bdeal\b/i,
    /\bloot\b/i,
    /streak\s+loss/i,
  ];

  // P3+ files that legitimately use economy-adjacent vocabulary as part of
  // the claim/reward architecture or as field-rejection guards — excluded from this P0-era scan.
  const S6_EXCLUDED_SUFFIXES = ['hero-copy.js', 'claim-contract.js', 'claim-resolver.js', 'camp.js', 'monster-economy.js'];

  for (const [rel, { code }] of HERO_SOURCES) {
    if (S6_EXCLUDED_SUFFIXES.some((suffix) => rel.endsWith(suffix))) continue;
    for (const pattern of FORBIDDEN_ECONOMY_TOKENS) {
      assert.ok(
        !pattern.test(code),
        `${rel} contains forbidden economy token matching ${pattern} — P0 Hero is read-only, no reward/economy strings allowed`,
      );
    }
  }
});

// ── Behavioural test 7: GET /api/hero/read-model does not mutate any table ───

test('B7: GET /api/hero/read-model does not write to any state table', async () => {
  const server = createWorkerRepositoryServer({
    env: { HERO_MODE_SHADOW_ENABLED: 'true' },
  });

  // Seed account + learner using the platform repositories pattern
  // (mirrors worker-hero-read-model.test.js).
  const repos = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    authSession: server.authSessionFor('adult-a'),
  });
  await repos.hydrate();
  repos.learners.write({
    byId: {
      'learner-a': {
        id: 'learner-a',
        name: 'Boundary Test Learner',
        yearGroup: 'Y5',
        goal: 'sats',
        dailyMinutes: 15,
        avatarColor: '#3E6FA8',
        createdAt: 1,
      },
    },
    allIds: ['learner-a'],
    selectedId: 'learner-a',
  });
  await repos.flush();

  // Tables whose row counts MUST NOT change from a read-only hero route.
  const GUARDED_TABLES = [
    'child_game_state',
    'child_subject_state',
    'practice_sessions',
    'event_log',
    'mutation_receipts',
    'account_subject_content',
    'platform_monster_visual_config',
  ];

  function countRows(tableName) {
    return server.DB.db.prepare(
      `SELECT COUNT(*) AS count FROM ${tableName}`,
    ).get()?.count ?? 0;
  }

  // Snapshot BEFORE
  const before = {};
  for (const table of GUARDED_TABLES) {
    before[table] = countRows(table);
  }

  // Call the hero read-model route
  const response = await server.fetch(
    'https://repo.test/api/hero/read-model?learnerId=learner-a',
  );
  assert.equal(response.status, 200, 'Hero read-model should return 200');

  // Snapshot AFTER
  for (const table of GUARDED_TABLES) {
    const after = countRows(table);
    assert.equal(
      after,
      before[table],
      `Table ${table} row count changed from ${before[table]} to ${after} after GET /api/hero/read-model — violates the read-only contract`,
    );
  }

  server.close();
});

// ── Behavioural test 8: POST /api/hero/command gate — flag off returns 404 ────

test('B8: POST /api/hero/command with HERO_MODE_LAUNCH_ENABLED=false returns 404', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'false',
    },
  });

  const response = await server.fetch(
    'https://repo.test/api/hero/command',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'start-task' }),
    },
  );
  const payload = await response.json();

  assert.equal(
    response.status,
    404,
    `POST /api/hero/command with launch flag off must return 404; got ${response.status}`,
  );
  assert.equal(payload.code, 'hero_launch_disabled');

  server.close();
});
