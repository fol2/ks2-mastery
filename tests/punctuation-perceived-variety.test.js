import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  buildProductionPool,
  buildVarietyClusters,
  normaliseForVariety,
} from '../scripts/review-punctuation-questions.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DECISIONS_PATH = join(__dirname, 'fixtures', 'punctuation-reviewer-decisions.json');

// ─── Perceived-variety invariants ─────────────────────────────────────────────

test('perceived-variety: no SAME-MODE duplicate stem clusters in production pool', () => {
  const pool = buildProductionPool();
  const clusters = buildVarietyClusters(pool);
  const sameModeStemClusters = clusters.filter(
    (c) => c.type === 'stem' && c.classification === 'SAME-MODE-DUPLICATE',
  );

  if (sameModeStemClusters.length > 0) {
    const detail = sameModeStemClusters
      .map((c) => `  stem="${c.normalisedText}" mode=${c.modes[0]} items=[${c.itemIds.join(', ')}]`)
      .join('\n');
    assert.fail(
      `Found ${sameModeStemClusters.length} same-mode duplicate stem cluster(s):\n${detail}`,
    );
  }
});

test('perceived-variety: cross-mode overlaps are counted and reported', () => {
  const pool = buildProductionPool();
  const clusters = buildVarietyClusters(pool);
  const crossModeClusters = clusters.filter(
    (c) => c.classification === 'CROSS-MODE-OVERLAP',
  );

  // Informational — this test documents how many cross-mode overlaps exist
  // without failing. The count is available for reviewer inspection.
  assert.ok(
    typeof crossModeClusters.length === 'number',
    'cross-mode overlap count is a number',
  );

  // Log for informational purposes during test run
  if (crossModeClusters.length > 0) {
    process.stderr.write(
      `[info] ${crossModeClusters.length} cross-mode overlap cluster(s) detected (not a failure)\n`,
    );
  }
});

test('perceived-variety: normaliseForVariety strips punctuation and lowercases', () => {
  assert.equal(normaliseForVariety('Hello, World!'), 'hello world');
  assert.equal(normaliseForVariety('"Why?" she asked.'), 'why she asked');
  assert.equal(normaliseForVariety('  Extra   spaces  '), 'extra spaces');
  assert.equal(normaliseForVariety('It’s a dash—test'), 'its a dashtest');
});

// ─── Reviewer decisions fixture schema ────────────────────────────────────────

test('reviewer decisions fixture: is valid JSON with expected schema', () => {
  const raw = readFileSync(DECISIONS_PATH, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    assert.fail(`punctuation-reviewer-decisions.json is not valid JSON: ${err.message}`);
  }

  assert.equal(typeof parsed, 'object');
  assert.ok(parsed !== null, 'fixture is not null');
  assert.ok('_meta' in parsed, 'fixture has _meta key');
  assert.ok('decisions' in parsed, 'fixture has decisions key');

  // _meta shape
  assert.equal(typeof parsed._meta, 'object');
  assert.equal(typeof parsed._meta.generated, 'string');
  assert.equal(typeof parsed._meta.items_reviewed, 'number');

  // decisions is an object (may be empty)
  assert.equal(typeof parsed.decisions, 'object');
  assert.ok(!Array.isArray(parsed.decisions), 'decisions is not an array');
});

test('reviewer decisions fixture: decision values are valid strings if present', () => {
  const parsed = JSON.parse(readFileSync(DECISIONS_PATH, 'utf8'));
  const VALID_DECISIONS = new Set([
    'approved',
    'needs-rewrite',
    'acceptable-cross-mode-overlap',
    'pending',
  ]);

  for (const [key, value] of Object.entries(parsed.decisions || {})) {
    assert.ok(
      typeof value === 'string' && VALID_DECISIONS.has(value),
      `Decision for "${key}" has invalid value "${value}". Expected one of: ${[...VALID_DECISIONS].join(', ')}`,
    );
  }
});

// ─── Production pool sanity ───────────────────────────────────────────────────

test('production pool: contains both fixed and generated items', () => {
  const pool = buildProductionPool();
  const fixedCount = pool.filter((i) => i._source === 'fixed').length;
  const generatedCount = pool.filter((i) => i._source === 'generated').length;

  assert.ok(fixedCount > 0, `Expected fixed items, got ${fixedCount}`);
  assert.ok(generatedCount > 0, `Expected generated items, got ${generatedCount}`);
  assert.ok(pool.length > 50, `Expected pool > 50, got ${pool.length}`);
});

test('production pool: every item has required fields', () => {
  const pool = buildProductionPool();
  for (const item of pool) {
    assert.ok(item.id, `Item missing id`);
    assert.ok(item.mode, `Item ${item.id} missing mode`);
    assert.ok(
      Array.isArray(item.skillIds) && item.skillIds.length > 0,
      `Item ${item.id} missing skillIds`,
    );
  }
});
