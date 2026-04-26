// Phase 4 U7 — Parent Hub confidence label parity with Worker read model.
//
// This is a load-bearing regression lock: both the client read-model and the
// Worker read-model must produce the SAME `confidence.label` for the SAME
// input state. U8 lifted `deriveGrammarConfidence` into
// `shared/grammar/confidence.js`; U7 wires the client read-model to use the
// shared derivation so Parent Hub / Admin Hub never see a divergent label
// vs the Worker.
//
// We exercise this by:
//   1. Seeding a raw grammar subject state (mastery + recentAttempts).
//   2. Running the client `buildGrammarLearnerReadModel` on it.
//   3. Running the Worker `buildGrammarReadModel` on the same state.
//   4. Asserting `clientConcept.confidence.label ===
//      workerConcept.confidence.label` for every concept.
//
// A divergence would indicate the shared derivation has been bypassed on
// one side (e.g., a local reimplementation re-emerged during a merge), or
// that the recentMisses / distinctTemplates window shapes drifted — both
// of which would corrupt Parent Hub's label against the Worker's scoring.
//
// Additionally this file regression-locks the child-surface-free constraint:
// no dashboard / bank / summary / transfer Grammar scene imports
// `AdultConfidenceChip`. The chip is an adult-only component; the
// view-model provides `grammarChildConfidenceLabel` for child surfaces.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGrammarLearnerReadModel } from '../src/subjects/grammar/read-model.js';
import { buildGrammarReadModel } from '../worker/src/subjects/grammar/read-models.js';
import { GRAMMAR_CONFIDENCE_LABELS } from '../shared/grammar/confidence.js';

const THIS_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_FILE_DIR, '..');

function seededGrammarState(nowTs) {
  return {
    mastery: {
      concepts: {
        // Mix of statuses — exercises each precedence rung in deriveGrammarConfidence.
        adverbials: {
          attempts: 6, correct: 2, wrong: 4, strength: 0.35,
          intervalDays: 0, dueAt: nowTs - 1, correctStreak: 0,
        },
        relative_clauses: {
          attempts: 10, correct: 10, wrong: 0, strength: 0.92,
          intervalDays: 14, dueAt: nowTs + 86_400_000, correctStreak: 5,
        },
        word_classes: {
          attempts: 12, correct: 11, wrong: 1, strength: 0.88,
          intervalDays: 3, dueAt: nowTs + 86_400_000, correctStreak: 4,
        },
        clauses: {
          attempts: 1, correct: 1, wrong: 0, strength: 0.4,
          intervalDays: 0, dueAt: nowTs + 86_400_000, correctStreak: 1,
        },
        noun_phrases: {
          attempts: 4, correct: 3, wrong: 1, strength: 0.6,
          intervalDays: 2, dueAt: nowTs + 86_400_000, correctStreak: 2,
        },
        tense_aspect: {
          attempts: 0, correct: 0, wrong: 0, strength: 0.25,
          intervalDays: 0, dueAt: 0, correctStreak: 0,
        },
        sentence_functions: {
          attempts: 8, correct: 6, wrong: 2, strength: 0.85,
          intervalDays: 10, dueAt: nowTs + 86_400_000, correctStreak: 3,
        },
      },
    },
    recentAttempts: [
      // Two misses on adverbials — triggers needs-repair via recentMisses path
      { templateId: 'adv-1', conceptIds: ['adverbials'], result: { correct: false }, createdAt: nowTs - 3_000_000 },
      { templateId: 'adv-2', conceptIds: ['adverbials'], result: { correct: false }, createdAt: nowTs - 2_000_000 },
      { templateId: 'adv-3', conceptIds: ['adverbials'], result: { correct: false }, createdAt: nowTs - 1_000_000 },
      // Correct hits on relative_clauses — leaves it in the secure path
      { templateId: 'rc-1', conceptIds: ['relative_clauses'], result: { correct: true }, createdAt: nowTs - 900_000 },
      { templateId: 'rc-2', conceptIds: ['relative_clauses'], result: { correct: true }, createdAt: nowTs - 800_000 },
      // One correct on clauses
      { templateId: 'cl-1', conceptIds: ['clauses'], result: { correct: true }, createdAt: nowTs - 600_000 },
      // Mixed noun_phrases — 1 miss keeps it in `building`
      { templateId: 'np-1', conceptIds: ['noun_phrases'], result: { correct: true }, createdAt: nowTs - 500_000 },
      { templateId: 'np-2', conceptIds: ['noun_phrases'], result: { correct: false }, createdAt: nowTs - 400_000 },
    ],
  };
}

function workerConceptsById(state, nowTs) {
  const workerModel = buildGrammarReadModel({ state, now: nowTs });
  const concepts = Array.isArray(workerModel?.analytics?.concepts) ? workerModel.analytics.concepts : [];
  return new Map(concepts.map((concept) => [concept.id, concept]));
}

test('U7 parity: client Parent-Hub read-model label matches Worker label for every concept', () => {
  const nowTs = 1_780_000_000_000;
  const state = seededGrammarState(nowTs);
  const workerById = workerConceptsById(state, nowTs);

  const clientModel = buildGrammarLearnerReadModel({
    subjectStateRecord: { data: state, updatedAt: nowTs },
    now: () => nowTs,
  });
  const clientConcepts = Array.isArray(clientModel.conceptStatus) ? clientModel.conceptStatus : [];
  assert.equal(clientConcepts.length, 18, 'client read-model emits exactly 18 concept rows (metadata denominator)');

  for (const clientConcept of clientConcepts) {
    const workerConcept = workerById.get(clientConcept.id);
    assert.ok(workerConcept, `Worker must know about concept '${clientConcept.id}'`);
    assert.ok(clientConcept.confidence, `client concept '${clientConcept.id}' has confidence projection`);
    assert.ok(workerConcept.confidence, `Worker concept '${clientConcept.id}' has confidence projection`);
    assert.equal(
      clientConcept.confidence.label,
      workerConcept.confidence.label,
      `client and Worker must produce the same confidence label for '${clientConcept.id}'; `
      + `client=${clientConcept.confidence.label}, Worker=${workerConcept.confidence.label}`,
    );
  }
});

test('U7: client read-model includes the full confidence projection shape on every concept', () => {
  const nowTs = 1_780_000_000_000;
  const state = seededGrammarState(nowTs);
  const clientModel = buildGrammarLearnerReadModel({
    subjectStateRecord: { data: state, updatedAt: nowTs },
    now: () => nowTs,
  });
  for (const concept of clientModel.conceptStatus) {
    assert.ok(concept.confidence, `concept '${concept.id}' has confidence`);
    const keys = Object.keys(concept.confidence);
    assert.deepEqual(
      keys.sort(),
      ['distinctTemplates', 'intervalDays', 'label', 'recentMisses', 'sampleSize'],
      `concept '${concept.id}' exposes the canonical confidence keys`,
    );
    assert.ok(
      GRAMMAR_CONFIDENCE_LABELS.includes(concept.confidence.label),
      `concept '${concept.id}' confidence.label '${concept.confidence.label}' must be a canonical label`,
    );
    assert.ok(
      concept.confidence.sampleSize >= 0 && Number.isInteger(concept.confidence.sampleSize),
      `concept '${concept.id}' sampleSize is a non-negative integer`,
    );
  }
});

test('U7: adverbials with 3 recent misses emits needs-repair label on BOTH client and Worker', () => {
  const nowTs = 1_780_000_000_000;
  const state = seededGrammarState(nowTs);
  const workerById = workerConceptsById(state, nowTs);
  const clientModel = buildGrammarLearnerReadModel({
    subjectStateRecord: { data: state, updatedAt: nowTs },
    now: () => nowTs,
  });
  const clientAdverbials = clientModel.conceptStatus.find((concept) => concept.id === 'adverbials');
  const workerAdverbials = workerById.get('adverbials');
  assert.equal(clientAdverbials.confidence.label, 'needs-repair');
  assert.equal(workerAdverbials.confidence.label, 'needs-repair');
  // sampleSize and recentMisses must agree numerically
  assert.equal(clientAdverbials.confidence.sampleSize, workerAdverbials.confidence.sampleSize);
  assert.equal(clientAdverbials.confidence.recentMisses, workerAdverbials.confidence.recentMisses);
  assert.equal(clientAdverbials.confidence.distinctTemplates, workerAdverbials.confidence.distinctTemplates);
});

test('U7: untouched concept emits emerging label with sampleSize=0 on BOTH client and Worker', () => {
  const nowTs = 1_780_000_000_000;
  const state = seededGrammarState(nowTs);
  const workerById = workerConceptsById(state, nowTs);
  const clientModel = buildGrammarLearnerReadModel({
    subjectStateRecord: { data: state, updatedAt: nowTs },
    now: () => nowTs,
  });
  const clientUntouched = clientModel.conceptStatus.find((concept) => concept.id === 'tense_aspect');
  const workerUntouched = workerById.get('tense_aspect');
  assert.equal(clientUntouched.confidence.label, 'emerging');
  assert.equal(workerUntouched.confidence.label, 'emerging');
  assert.equal(clientUntouched.confidence.sampleSize, 0);
  assert.equal(workerUntouched.confidence.sampleSize, 0);
});

// --- Child-surface regression lock ---------------------------------------
// The adult confidence chip must NOT be imported by any child-facing
// Grammar scene. Child labels go through `grammarChildConfidenceLabel` in
// `grammar-view-model.js`. This is a straight text grep against the scene
// files the plan names.

// Child-facing scenes (dashboard, bank, session, summary, transfer, and the
// view-model itself). The chip is adult-only — `grammarChildConfidenceLabel`
// from the view-model provides the child copy mapping.
const CHILD_SURFACE_FILES = [
  'src/subjects/grammar/components/GrammarSetupScene.jsx',
  'src/subjects/grammar/components/GrammarConceptBankScene.jsx',
  'src/subjects/grammar/components/GrammarConceptDetailModal.jsx',
  'src/subjects/grammar/components/GrammarMiniTestReview.jsx',
  'src/subjects/grammar/components/GrammarPracticeSurface.jsx',
  'src/subjects/grammar/components/GrammarSessionScene.jsx',
  'src/subjects/grammar/components/GrammarSummaryScene.jsx',
  'src/subjects/grammar/components/GrammarTransferScene.jsx',
  'src/subjects/grammar/components/grammar-view-model.js',
];

async function safeReadFile(relPath) {
  try {
    return await readFile(path.join(REPO_ROOT, relPath), 'utf8');
  } catch {
    return null;
  }
}

test('U7 regression lock: child-facing Grammar scenes MUST NOT import AdultConfidenceChip', async () => {
  for (const file of CHILD_SURFACE_FILES) {
    const source = await safeReadFile(file);
    assert.ok(
      source !== null,
      `expected child-surface file '${file}' to exist; if it has been renamed, update the regression lock too`,
    );
    assert.doesNotMatch(
      source,
      /AdultConfidenceChip/,
      `${file} must not reference AdultConfidenceChip — that component is adult-hub only. Use grammarChildConfidenceLabel for child surfaces.`,
    );
  }
});
