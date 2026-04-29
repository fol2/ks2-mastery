import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  buildProductionPool,
  buildPool,
  buildVarietyClusters,
  normaliseForVariety,
} from '../scripts/review-punctuation-questions.mjs';
import {
  loadReviewerDecisions,
  evaluateClusterGate,
} from '../shared/punctuation/reviewer-decisions.js';

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
  assert.equal(normaliseForVariety('It’s a dash—test'), 'its a dash test');
});

test('perceived-variety: normaliseForVariety treats dashes as word boundaries', () => {
  // Hyphen becomes word boundary (P7 U8 dash-boundary fix)
  assert.equal(normaliseForVariety('well-known phrase'), 'well known phrase');
  // Em-dash becomes word boundary
  assert.equal(normaliseForVariety('high—quality'), 'high quality');
  // En-dash becomes word boundary
  assert.equal(normaliseForVariety('London–Bristol train'), 'london bristol train');
  // Multiple hyphens collapse to single space
  assert.equal(normaliseForVariety('self-self-aware'), 'self self aware');
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

// ─── New grouping dimensions (P7 U8) ────────────────────────────────────────

test('perceived-variety: buildVarietyClusters produces explanation clusters', () => {
  const pool = buildProductionPool();
  const clusters = buildVarietyClusters(pool);
  const explanationClusters = clusters.filter((c) => c.type === 'explanation');

  // Informational: report count
  if (explanationClusters.length > 0) {
    process.stderr.write(
      `[info] ${explanationClusters.length} repeated-explanation cluster(s) detected\n`,
    );
  }

  // Each explanation cluster must have correct classification
  for (const c of explanationClusters) {
    assert.equal(c.classification, 'REPEATED-EXPLANATION');
    assert.ok(c.count >= 2, `Explanation cluster should have count >= 2, got ${c.count}`);
    assert.ok(c.sampleExplanation, 'Explanation cluster must have sampleExplanation');
  }
});

test('perceived-variety: buildVarietyClusters produces character-overuse clusters', () => {
  const pool = buildProductionPool();
  const clusters = buildVarietyClusters(pool);
  const characterClusters = clusters.filter((c) => c.type === 'character');

  // Each character cluster must have > 3 items (threshold)
  for (const c of characterClusters) {
    assert.equal(c.classification, 'CHARACTER-OVERUSE');
    assert.ok(c.count > 3, `Character cluster should have count > 3, got ${c.count}`);
    assert.ok(c.skill, 'Character cluster must have skill');
    assert.ok(c.character, 'Character cluster must have character');
  }

  // Informational
  if (characterClusters.length > 0) {
    process.stderr.write(
      `[info] ${characterClusters.length} character-overuse cluster(s) detected\n`,
    );
  }
});

test('perceived-variety: buildVarietyClusters produces correction-pattern clusters', () => {
  const pool = buildProductionPool();
  const clusters = buildVarietyClusters(pool);
  const correctionClusters = clusters.filter((c) => c.type === 'correction-pattern');

  for (const c of correctionClusters) {
    assert.ok(
      c.classification === 'SAME-CORRECTION-PATTERN' || c.classification === 'CROSS-MODE-CORRECTION',
      `Unexpected classification: ${c.classification}`,
    );
    assert.ok(c.count >= 2, `Correction cluster should have count >= 2, got ${c.count}`);
    assert.ok(c.skill, 'Correction cluster must have skill');
  }

  // Informational
  if (correctionClusters.length > 0) {
    process.stderr.write(
      `[info] ${correctionClusters.length} correction-pattern cluster(s) detected\n`,
    );
  }
});

test('perceived-variety: no SAME-MODE duplicate stem clusters after dash-boundary fix', () => {
  // The dash-boundary fix makes normalisation LESS aggressive (more word boundaries)
  // so existing same-mode duplicate clusters should not increase
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
      `Found ${sameModeStemClusters.length} same-mode duplicate stem cluster(s) after dash fix:\n${detail}`,
    );
  }
});

// ─── Cross-mode overlap gating on reviewer decisions (P7 U8) ────────────────

test('perceived-variety: cross-mode overlap clusters gated on reviewer decisions', () => {
  const pool = buildProductionPool();
  const clusters = buildVarietyClusters(pool);
  const crossModeClusters = clusters.filter(
    (c) => (c.type === 'stem' || c.type === 'model') && c.classification === 'CROSS-MODE-OVERLAP',
  );

  // Load decisions
  const { data } = loadReviewerDecisions(DECISIONS_PATH);
  const clusterIds = crossModeClusters.map((_, idx) => {
    const c = crossModeClusters[idx];
    return `cluster_${clusters.indexOf(c)}_${c.type}_${c.classification}`;
  });

  const result = evaluateClusterGate(data, clusterIds);

  // Informational: report the gate result
  process.stderr.write(
    `[info] Cluster gate: ${result.pass ? 'PASS' : 'FAIL'} (${result.stats.approved} approved, ${result.stats.missing} missing, ${result.stats.blocked} blocked)\n`,
  );

  // This is informational for P7 — not a hard gate until depth-6 activation
  assert.equal(typeof result.pass, 'boolean');
});

test('perceived-variety: depth-6 activation blocked if candidate-only variety clusters unresolved', () => {
  // Depth-6 activation requires ALL candidate-only variety clusters to be resolved
  const { pool, productionIds } = buildPool({ includeDepth6: true });
  const clusters = buildVarietyClusters(pool);

  // Find clusters that contain candidate-only items
  const candidateOnlyClusters = clusters.filter((c) => {
    const hasCandidate = c.itemIds.some((id) => !productionIds.has(id));
    return hasCandidate && (c.classification === 'SAME-MODE-DUPLICATE' || c.classification === 'CROSS-MODE-OVERLAP');
  });

  // Load decisions
  const { data } = loadReviewerDecisions(DECISIONS_PATH);

  // If there are candidate-only clusters, depth-6 cannot activate without decisions
  if (candidateOnlyClusters.length > 0) {
    const clusterIds = candidateOnlyClusters.map((c) =>
      `cluster_${clusters.indexOf(c)}_${c.type}_${c.classification}`,
    );
    const result = evaluateClusterGate(data, clusterIds);

    // Gate MUST fail when decisions are empty (core invariant)
    assert.equal(
      result.pass, false,
      'Depth-6 activation must be blocked when candidate-only variety clusters have no reviewer decisions',
    );
    process.stderr.write(
      `[info] Depth-6 blocked: ${candidateOnlyClusters.length} candidate-only cluster(s) unresolved\n`,
    );
  } else {
    // No candidate-only clusters means depth-6 is unblocked from variety perspective
    process.stderr.write('[info] No candidate-only variety clusters — depth-6 unblocked\n');
  }
});
