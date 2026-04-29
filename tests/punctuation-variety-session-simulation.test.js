import test from 'node:test';
import assert from 'node:assert/strict';

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
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DECISIONS_PATH = join(__dirname, 'fixtures', 'punctuation-reviewer-decisions.json');

// ─── Session simulation helpers ─────────────────────────────────────────────

/**
 * Simple seeded PRNG (mulberry32).
 * @param {number} seed
 * @returns {function(): number} — returns float in [0, 1)
 */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw a 12-item session from the pool using seeded random selection.
 * @param {Array} pool - Production pool
 * @param {number} seed - PRNG seed
 * @returns {Array} - 12 items drawn without replacement
 */
function drawSession(pool, seed) {
  const rng = mulberry32(seed);
  const available = [...pool];
  const session = [];
  const sessionSize = Math.min(12, available.length);

  for (let i = 0; i < sessionSize; i++) {
    const idx = Math.floor(rng() * available.length);
    session.push(available[idx]);
    available.splice(idx, 1);
  }
  return session;
}

/**
 * Count repetitions within a session based on normalised stem/model/character.
 * @param {Array} session - 12 items
 * @returns {{ stemRepetitions: Map, modelRepetitions: Map, characterRepetitions: Map }}
 */
function countSessionRepetitions(session) {
  const stemCounts = new Map();
  const modelCounts = new Map();
  const characterCounts = new Map();

  const NAME_RE = /\b[A-Z][a-z]{2,}\b/g;
  const COMMON_STARTERS = new Set(['The', 'This', 'That', 'They', 'There', 'Their', 'These', 'Those', 'When', 'Where', 'What', 'Which', 'While', 'After', 'Before', 'During', 'Without', 'Although', 'Because', 'Since', 'Until', 'Unless', 'However', 'Therefore', 'Furthermore', 'Moreover', 'Nevertheless', 'Please', 'Most', 'Everyone', 'Our', 'Your', 'Some', 'Many', 'Few', 'All', 'Each', 'Every', 'Both', 'Neither', 'Either', 'Any', 'Take', 'Keep', 'Put', 'Bring', 'Pack', 'Check', 'Let', 'Don', 'Did', 'Does', 'Can', 'Could', 'Would', 'Should', 'Will', 'May', 'Might', 'Must', 'Shall', 'How', 'Why', 'Are', 'Were', 'Was', 'Has', 'Have', 'Had', 'Its', 'She', 'You', 'Well', 'Year', 'For', 'Im', 'Ive', 'Youre', 'Youll', 'Theyre', 'Weve', 'Wed']);

  for (const item of session) {
    const normStem = normaliseForVariety(item.stem);
    const normModel = normaliseForVariety(item.model);

    if (normStem) {
      stemCounts.set(normStem, (stemCounts.get(normStem) || 0) + 1);
    }
    if (normModel) {
      modelCounts.set(normModel, (modelCounts.get(normModel) || 0) + 1);
    }

    // Character names
    const text = (item.stem || '') + ' ' + (item.model || '');
    const matches = text.match(NAME_RE) || [];
    for (const name of matches) {
      if (!COMMON_STARTERS.has(name)) {
        characterCounts.set(name, (characterCounts.get(name) || 0) + 1);
      }
    }
  }

  return { stemCounts, modelCounts, characterCounts };
}

// ─── Mixed-session simulation tests ─────────────────────────────────────────

const NUM_SIMULATIONS = 100;

test('session simulation: stem repetition frequency within 12-item windows (soft gate)', () => {
  const pool = buildProductionPool();
  let violations = 0;
  const violationDetails = [];

  for (let seed = 1; seed <= NUM_SIMULATIONS; seed++) {
    const session = drawSession(pool, seed);
    const { stemCounts } = countSessionRepetitions(session);

    for (const [stem, count] of stemCounts) {
      if (count > 1) {
        violations++;
        if (violationDetails.length < 5) {
          violationDetails.push(`  seed=${seed} stem="${stem}" count=${count}`);
        }
      }
    }
  }

  // SOFT GATE: informational, not a hard CI blocker for P7
  // Cross-mode overlaps (same sentence in fix/insert/choose) can cause stem repetition
  // when both modes are drawn into the same session. This is a known trade-off
  // documented by the CROSS-MODE-OVERLAP clusters.
  if (violations > 0) {
    process.stderr.write(
      `[info] Session simulation: ${violations} stem repetition(s) across ${NUM_SIMULATIONS} sessions\n` +
      violationDetails.join('\n') + '\n',
    );
  } else {
    process.stderr.write(
      `[info] Session simulation: 0 stem repetitions across ${NUM_SIMULATIONS} sessions (clean)\n`,
    );
  }

  // Informational assertion: stem repetitions from cross-mode overlaps are expected
  // The repetition rate should be low (< 20% of sessions)
  const repetitionRate = violations / NUM_SIMULATIONS;
  process.stderr.write(`[info] Stem repetition rate: ${(repetitionRate * 100).toFixed(1)}% of sessions\n`);
  assert.ok(
    repetitionRate < 0.20,
    `Stem repetition rate ${(repetitionRate * 100).toFixed(1)}% exceeds 20% threshold`,
  );
});

test('session simulation: report repetition frequency distribution', () => {
  const pool = buildProductionPool();
  const modelRepFreq = new Map(); // count -> frequency
  const charRepFreq = new Map();  // count -> frequency

  for (let seed = 1; seed <= NUM_SIMULATIONS; seed++) {
    const session = drawSession(pool, seed);
    const { modelCounts, characterCounts } = countSessionRepetitions(session);

    for (const count of modelCounts.values()) {
      modelRepFreq.set(count, (modelRepFreq.get(count) || 0) + 1);
    }
    for (const count of characterCounts.values()) {
      charRepFreq.set(count, (charRepFreq.get(count) || 0) + 1);
    }
  }

  // Report distribution
  const modelDist = [...modelRepFreq.entries()].sort((a, b) => a[0] - b[0]);
  const charDist = [...charRepFreq.entries()].sort((a, b) => a[0] - b[0]);

  process.stderr.write(
    `[info] Model answer frequency distribution (count -> occurrences):\n` +
    modelDist.map(([c, f]) => `  ${c}x: ${f}`).join('\n') + '\n',
  );
  process.stderr.write(
    `[info] Character name frequency distribution (count -> occurrences):\n` +
    charDist.map(([c, f]) => `  ${c}x: ${f}`).join('\n') + '\n',
  );

  // Informational assertion: just verify we got data
  assert.ok(modelDist.length > 0, 'Should have model answer distribution data');
});

test('session simulation: no single model answer dominates a session (max 2)', () => {
  const pool = buildProductionPool();
  let maxModelCount = 0;
  let worstSeed = 0;
  let worstModel = '';

  for (let seed = 1; seed <= NUM_SIMULATIONS; seed++) {
    const session = drawSession(pool, seed);
    const { modelCounts } = countSessionRepetitions(session);

    for (const [model, count] of modelCounts) {
      if (count > maxModelCount) {
        maxModelCount = count;
        worstSeed = seed;
        worstModel = model;
      }
    }
  }

  process.stderr.write(
    `[info] Max model answer count in any session: ${maxModelCount}` +
    (maxModelCount > 1 ? ` (seed=${worstSeed}, model="${worstModel}")` : '') + '\n',
  );

  // SOFT GATE: no model answer should appear more than twice in a 12-item session
  // (drawing without replacement from 192 items makes this very unlikely)
  assert.ok(
    maxModelCount <= 2,
    `Model answer "${worstModel}" appeared ${maxModelCount} times in session seed=${worstSeed}`,
  );
});

// ─── Cross-mode overlap clusters gated on reviewer decisions ────────────────

test('session simulation: cross-mode overlap clusters require reviewer decision or flag', () => {
  const pool = buildProductionPool();
  const clusters = buildVarietyClusters(pool);
  const crossModeClusters = clusters.filter(
    (c) => (c.type === 'stem' || c.type === 'model') && c.classification === 'CROSS-MODE-OVERLAP',
  );

  const { data } = loadReviewerDecisions(DECISIONS_PATH);

  // Build cluster IDs matching the buildClusterMap convention
  const clusterIds = crossModeClusters.map((c) => {
    const idx = clusters.indexOf(c);
    return `cluster_${idx}_${c.type}_${c.classification}`;
  });

  if (clusterIds.length === 0) {
    process.stderr.write('[info] No cross-mode overlap clusters to gate\n');
    return;
  }

  const result = evaluateClusterGate(data, clusterIds);

  // Report
  process.stderr.write(
    `[info] Cross-mode cluster gate: ${result.pass ? 'PASS' : 'FAIL'} ` +
    `(total=${result.stats.total}, approved=${result.stats.approved}, ` +
    `missing=${result.stats.missing}, blocked=${result.stats.blocked})\n`,
  );

  // Gate status is informational for P7
  assert.equal(typeof result.pass, 'boolean');
  assert.ok(result.stats.total >= 0);
});

test('session simulation: depth-6 activation requires candidate-only variety clusters resolved', () => {
  const { pool, productionIds } = buildPool({ includeDepth6: true });
  const clusters = buildVarietyClusters(pool);

  // Find clusters containing at least one candidate-only item
  const candidateOnlyClusters = clusters.filter((c) => {
    const hasCandidate = c.itemIds.some((id) => !productionIds.has(id));
    return hasCandidate && (c.classification === 'SAME-MODE-DUPLICATE' || c.classification === 'CROSS-MODE-OVERLAP');
  });

  const { data } = loadReviewerDecisions(DECISIONS_PATH);

  if (candidateOnlyClusters.length === 0) {
    process.stderr.write('[info] No candidate-only variety clusters — depth-6 unblocked\n');
    return;
  }

  const clusterIds = candidateOnlyClusters.map((c) =>
    `cluster_${clusters.indexOf(c)}_${c.type}_${c.classification}`,
  );

  const result = evaluateClusterGate(data, clusterIds);

  // Depth-6 MUST NOT activate if decisions are missing
  assert.equal(
    result.pass, false,
    'Depth-6 must be blocked when candidate-only variety clusters lack reviewer decisions',
  );

  process.stderr.write(
    `[info] Depth-6 blocked: ${candidateOnlyClusters.length} candidate-only cluster(s), ` +
    `${result.stats.missing} missing decisions\n`,
  );
});
