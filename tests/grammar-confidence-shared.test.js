// U8: Shared confidence module — single-source-of-truth invariants.
// Asserts the five-label taxonomy, derivation function, status machine,
// and drift guard against duplicate DEFINITIONS in production code.
//
// This complements `grammar-confidence.test.js` which tests the
// derivation-function semantics. Here we focus on module-shape invariants
// and the drift guard (no duplicate constant definitions in Worker or
// client code after U8's consolidation).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveGrammarConfidence,
  GRAMMAR_CHILD_CONFIDENCE_LABEL_MAP,
  GRAMMAR_CONFIDENCE_LABELS,
  GRAMMAR_RECENT_ATTEMPT_HORIZON,
  grammarChildConfidenceLabel,
  grammarConceptStatus,
  isGrammarConfidenceLabel,
} from '../shared/grammar/confidence.js';

const THIS_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_FILE_DIR, '..');

test('U8: GRAMMAR_CONFIDENCE_LABELS has exactly five entries in the canonical Worker order', () => {
  assert.equal(GRAMMAR_CONFIDENCE_LABELS.length, 5);
  assert.deepEqual([...GRAMMAR_CONFIDENCE_LABELS], [
    'emerging',
    'building',
    'consolidating',
    'secure',
    'needs-repair',
  ]);
});

test('U8: GRAMMAR_CONFIDENCE_LABELS is frozen at runtime', () => {
  assert.ok(Object.isFrozen(GRAMMAR_CONFIDENCE_LABELS));
  assert.throws(() => { GRAMMAR_CONFIDENCE_LABELS[0] = 'tampered'; });
});

test('U8: GRAMMAR_RECENT_ATTEMPT_HORIZON is 12 (matches Worker engine write-time slice)', () => {
  assert.equal(GRAMMAR_RECENT_ATTEMPT_HORIZON, 12);
});

test('U8: GRAMMAR_CHILD_CONFIDENCE_LABEL_MAP covers all five internal labels', () => {
  assert.ok(Object.isFrozen(GRAMMAR_CHILD_CONFIDENCE_LABEL_MAP));
  for (const label of GRAMMAR_CONFIDENCE_LABELS) {
    assert.equal(typeof GRAMMAR_CHILD_CONFIDENCE_LABEL_MAP[label], 'string',
      `missing child copy for label '${label}'`);
  }
  // Exact mapping — locked to child copy the analytics surface has shipped.
  assert.deepEqual({ ...GRAMMAR_CHILD_CONFIDENCE_LABEL_MAP }, {
    emerging: 'New',
    building: 'Learning',
    'needs-repair': 'Trouble spot',
    consolidating: 'Nearly secure',
    secure: 'Secure',
  });
});

test('U8: grammarChildConfidenceLabel maps all five internal labels', () => {
  assert.equal(grammarChildConfidenceLabel({ label: 'emerging' }), 'New');
  assert.equal(grammarChildConfidenceLabel({ label: 'building' }), 'Learning');
  assert.equal(grammarChildConfidenceLabel({ label: 'needs-repair' }), 'Trouble spot');
  assert.equal(grammarChildConfidenceLabel({ label: 'consolidating' }), 'Nearly secure');
  assert.equal(grammarChildConfidenceLabel({ label: 'secure' }), 'Secure');
});

test('U8: grammarChildConfidenceLabel falls back to Learning for unknown / missing input', () => {
  assert.equal(grammarChildConfidenceLabel({ label: 'unknown' }), 'Learning');
  assert.equal(grammarChildConfidenceLabel({}), 'Learning');
  assert.equal(grammarChildConfidenceLabel({ label: null }), 'Learning');
  assert.equal(grammarChildConfidenceLabel({ label: 42 }), 'Learning');
  assert.equal(grammarChildConfidenceLabel(), 'Learning');
});

test('U8: isGrammarConfidenceLabel accepts exactly the five canonical labels', () => {
  for (const label of GRAMMAR_CONFIDENCE_LABELS) {
    assert.equal(isGrammarConfidenceLabel(label), true, `expected '${label}' to be valid`);
  }
  assert.equal(isGrammarConfidenceLabel('unknown'), false);
  assert.equal(isGrammarConfidenceLabel(''), false);
  assert.equal(isGrammarConfidenceLabel(null), false);
  assert.equal(isGrammarConfidenceLabel(undefined), false);
  assert.equal(isGrammarConfidenceLabel(42), false);
  assert.equal(isGrammarConfidenceLabel('Secure'), false, 'case-sensitive; child copy not valid');
});

test('U8: deriveGrammarConfidence output is always one of the canonical labels', () => {
  const inputs = [
    // Emerging — thin evidence
    { attempts: 0 },
    { attempts: 1 },
    { attempts: 2, strength: 0.95 },
    // Needs-repair — weak status or ≥ 2 misses
    { status: 'weak', attempts: 8, strength: 0.3 },
    { status: 'learning', attempts: 10, strength: 0.7, recentMisses: 2 },
    { status: 'secured', attempts: 20, strength: 0.9, correctStreak: 4, intervalDays: 10, recentMisses: 3 },
    // Secure — all thresholds met
    { status: 'secured', attempts: 10, strength: 0.95, correctStreak: 5, intervalDays: 10 },
    { status: 'secured', attempts: 9, strength: 0.82, correctStreak: 3, intervalDays: 7 },
    // Consolidating — strength+streak secured but interval < 7
    { status: 'learning', attempts: 100, strength: 0.95, correctStreak: 10, intervalDays: 3 },
    // Building — default
    { status: 'learning', attempts: 4, strength: 0.55, correctStreak: 1, intervalDays: 1 },
    // Malformed
    null,
    undefined,
    {},
    { attempts: 'garbage', strength: NaN },
  ];
  for (const input of inputs) {
    const label = deriveGrammarConfidence(input);
    assert.ok(
      GRAMMAR_CONFIDENCE_LABELS.includes(label),
      `deriveGrammarConfidence(${JSON.stringify(input)}) returned '${label}' which is not in GRAMMAR_CONFIDENCE_LABELS`,
    );
  }
});

test('U8: grammarConceptStatus returns canonical statuses ("new" | "weak" | "due" | "secured" | "learning")', () => {
  const validStatuses = new Set(['new', 'weak', 'due', 'secured', 'learning']);
  const now = 1_700_000_000_000;
  // No attempts → new
  assert.equal(grammarConceptStatus(null, now), 'new');
  assert.equal(grammarConceptStatus({}, now), 'new');
  assert.equal(grammarConceptStatus({ attempts: 0 }, now), 'new');
  // Low strength → weak
  assert.equal(grammarConceptStatus({ attempts: 5, strength: 0.3, correct: 1, wrong: 4, dueAt: now + 1 }, now), 'weak');
  // Wrong > correct + 1 → weak
  assert.equal(grammarConceptStatus({ attempts: 5, strength: 0.6, correct: 1, wrong: 4, dueAt: now + 1 }, now), 'weak');
  // Due — dueAt <= now
  assert.equal(grammarConceptStatus({ attempts: 5, strength: 0.6, correct: 4, wrong: 1, dueAt: now - 1 }, now), 'due');
  // Secured
  assert.equal(grammarConceptStatus({
    attempts: 10, strength: 0.9, correct: 9, wrong: 1, correctStreak: 5, intervalDays: 10, dueAt: now + 1,
  }, now), 'secured');
  // Learning default
  assert.equal(grammarConceptStatus({
    attempts: 5, strength: 0.6, correct: 4, wrong: 1, correctStreak: 1, intervalDays: 1, dueAt: now + 1,
  }, now), 'learning');
  // Sanity: all returns are in the allowed set
  for (const status of ['new', 'weak', 'due', 'secured', 'learning']) {
    assert.ok(validStatuses.has(status));
  }
});

test('U8: grammarConceptStatus threshold pin — 0.82 / 7-day / streak-3 boundaries are canonical', () => {
  const now = 2_000_000_000_000;
  // Exactly at the secured boundary
  assert.equal(grammarConceptStatus({
    attempts: 10, strength: 0.82, correct: 8, wrong: 2, correctStreak: 3, intervalDays: 7, dueAt: now + 1,
  }, now), 'secured');
  // Just below the strength threshold
  assert.equal(grammarConceptStatus({
    attempts: 10, strength: 0.819, correct: 8, wrong: 2, correctStreak: 3, intervalDays: 7, dueAt: now + 1,
  }, now), 'learning');
  // Just below the streak threshold
  assert.equal(grammarConceptStatus({
    attempts: 10, strength: 0.9, correct: 8, wrong: 2, correctStreak: 2, intervalDays: 7, dueAt: now + 1,
  }, now), 'learning');
  // Just below the interval threshold
  assert.equal(grammarConceptStatus({
    attempts: 10, strength: 0.9, correct: 8, wrong: 2, correctStreak: 3, intervalDays: 6.99, dueAt: now + 1,
  }, now), 'learning');
  // 0.42 weak floor: strictly below is weak
  assert.equal(grammarConceptStatus({
    attempts: 5, strength: 0.419, correct: 3, wrong: 2, dueAt: now + 1,
  }, now), 'weak', 'strength strictly below 0.42 is weak');
  // Exactly 0.42 and wrong <= correct+1 is not weak; falls through to
  // due (dueAt > now+1 suppresses due, so it becomes 'learning' here)
  assert.equal(grammarConceptStatus({
    attempts: 5, strength: 0.42, correct: 3, wrong: 2, dueAt: now + 1,
  }, now), 'learning', 'strength exactly at 0.42 is not weak (< is strict)');
  // wrong > correct + 1 (wrong=4, correct=2) forces weak regardless of strength
  assert.equal(grammarConceptStatus({
    attempts: 6, strength: 0.9, correct: 2, wrong: 4, dueAt: now + 1,
  }, now), 'weak', 'wrong > correct + 1 forces weak even with high strength');
});

// --- Drift guard ----------------------------------------------------------
// After U8, the five-label taxonomy must live in exactly ONE place in
// production code: `shared/grammar/confidence.js`. Any additional
// definition — array of all five strings, map keyed by all five, Set with
// all five — is drift. We scan a curated list of production files for the
// five-literal signature; only the shared module and test files are
// allowed to contain it.

const PRODUCTION_FILES_TO_SCAN = [
  'worker/src/subjects/grammar/read-models.js',
  'worker/src/subjects/grammar/engine.js',
  'src/subjects/grammar/read-model.js',
  'src/subjects/grammar/components/GrammarAnalyticsScene.jsx',
  'src/subjects/grammar/components/grammar-view-model.js',
];

async function loadFile(relPath) {
  const absolute = path.join(REPO_ROOT, relPath);
  return readFile(absolute, 'utf8');
}

// Detects the historical drift shape: an ARRAY literal (or `new Set([...])`)
// that enumerates all five internal labels as STRING VALUES. This is the
// precise drift that U8 lifts out of `GrammarAnalyticsScene.jsx`'s
// `ADULT_CONFIDENCE_LABELS` and `read-models.js`'s `GRAMMAR_CONFIDENCE_LABELS`.
// Legitimate per-label maps (object literals keyed by label, mapping each
// to a distinct value like a CSS tone or child copy) are NOT drift — each
// label is a key, not a value. The distinction: drift repeats the taxonomy;
// per-label maps consume it.
const LABEL_LITERALS = Object.freeze(['emerging', 'building', 'consolidating', 'secure', 'needs-repair']);

function countDuplicateLabelArrays(source) {
  // Match any [ ... ] or Set(... [...]) block where all five labels appear
  // as quoted strings inside the brackets within a 400-char window. We
  // constrain the match to ARRAY / SET CONSTRUCTOR shape so that per-label
  // maps (object literals with label keys) do not trigger the guard.
  const WINDOW = 400;
  const quotedVariants = LABEL_LITERALS.map((label) => [`'${label}'`, `"${label}"`, `\`${label}\``]);
  let hits = 0;
  // Scan every '[' as a potential array-literal start.
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== '[') continue;
    const window = source.slice(start, start + WINDOW);
    let allPresent = true;
    for (const variants of quotedVariants) {
      if (!variants.some((v) => window.includes(v))) {
        allPresent = false;
        break;
      }
    }
    if (!allPresent) continue;
    // This array literal contains all five labels as quoted values —
    // this is the duplicate-taxonomy drift shape.
    hits += 1;
    start += WINDOW;
  }
  return hits;
}

test('U8 drift guard: no production file outside shared/grammar defines all five labels as an array', async () => {
  for (const file of PRODUCTION_FILES_TO_SCAN) {
    const source = await loadFile(file);
    const hits = countDuplicateLabelArrays(source);
    assert.equal(
      hits,
      0,
      `${file} contains an array literal of all five confidence labels — this duplicates GRAMMAR_CONFIDENCE_LABELS in shared/grammar/confidence.js. Remove the duplicate and import from shared.`,
    );
  }
});

test('U8 drift guard: shared/grammar/confidence.js itself contains the canonical array', async () => {
  const source = await loadFile('shared/grammar/confidence.js');
  const hits = countDuplicateLabelArrays(source);
  assert.equal(hits, 1, 'shared/grammar/confidence.js should contain exactly one array of all five labels (GRAMMAR_CONFIDENCE_LABELS)');
});
