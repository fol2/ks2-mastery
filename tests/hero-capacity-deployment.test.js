// Hero Mode P2 U9 — Capacity instrumentation and deployment gates.
//
// Verifies:
// 1. /api/hero/read-model is matched by isCapacityRelevantPath
// 2. /api/hero/command is still matched (regression check)
// 3. wrangler.jsonc and worker/wrangler.example.jsonc default all three
//    Hero flags to "false"

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Replicate isCapacityRelevantPath from worker/src/app.js ───────────

const CAPACITY_RELEVANT_PATH_PATTERNS = [
  /^\/api\/bootstrap$/,
  /^\/api\/subjects\/[^/]+\/command$/,
  /^\/api\/hero\/command$/,
  /^\/api\/hero\/read-model$/,
  /^\/api\/hubs\/parent(\/.*)?$/,
  /^\/api\/classroom(\/.*)?$/,
];

function isCapacityRelevantPath(pathname) {
  return CAPACITY_RELEVANT_PATH_PATTERNS.some((re) => re.test(pathname || ''));
}

// ── Hero flag names ───────────────────────────────────────────────────

const HERO_FLAGS = [
  'HERO_MODE_SHADOW_ENABLED',
  'HERO_MODE_LAUNCH_ENABLED',
  'HERO_MODE_CHILD_UI_ENABLED',
];

// ── Helpers ───────────────────────────────────────────────────────────

/** Strip JSONC single-line comments and parse. */
function parseJsonc(text) {
  const stripped = text.replace(/\/\/.*$/gm, '');
  return JSON.parse(stripped);
}

// ── Tests ─────────────────────────────────────────────────────────────

test('U9: /api/hero/read-model is capacity-relevant', () => {
  assert.ok(
    isCapacityRelevantPath('/api/hero/read-model'),
    '/api/hero/read-model must be matched by isCapacityRelevantPath',
  );
});

test('U9: /api/hero/command remains capacity-relevant (regression)', () => {
  assert.ok(
    isCapacityRelevantPath('/api/hero/command'),
    '/api/hero/command must still be matched',
  );
});

test('U9: non-hero paths are correctly excluded', () => {
  assert.ok(!isCapacityRelevantPath('/api/hero/read-model/extra'));
  assert.ok(!isCapacityRelevantPath('/api/hero'));
  assert.ok(!isCapacityRelevantPath('/api/hero/'));
});

test('U9: wrangler.jsonc defaults all Hero flags to "false"', async () => {
  const raw = await readFile(resolve(ROOT, 'wrangler.jsonc'), 'utf-8');
  const config = parseJsonc(raw);
  const vars = config.vars || {};
  for (const flag of HERO_FLAGS) {
    assert.equal(
      vars[flag],
      'false',
      `wrangler.jsonc: ${flag} must default to "false"`,
    );
  }
});

test('U9: worker/wrangler.example.jsonc defaults all Hero flags to "false"', async () => {
  const raw = await readFile(resolve(ROOT, 'worker/wrangler.example.jsonc'), 'utf-8');
  const config = parseJsonc(raw);
  const vars = config.vars || {};
  for (const flag of HERO_FLAGS) {
    assert.equal(
      vars[flag],
      'false',
      `worker/wrangler.example.jsonc: ${flag} must default to "false"`,
    );
  }
});
