// Phase 3 U10 — Writing Try non-scored invariants (gate test).
//
// This file bundles the Phase 3 non-scored invariants into a single, well-
// labelled location so the completeness gate is trivially findable. The
// assertions below also run from `tests/grammar-transfer-scene.test.js`
// (U6b); keeping the gate here means a future Writing Try refactor that
// accidentally starts scoring paragraphs fails both files.
//
// Invariants under test:
//   1. `state.mastery`, `state.retryQueue`, `state.misconceptions`,
//      `state.session` are **byte-equal** before and after a successful
//      `save-transfer-evidence` (deep-clone + JSON.stringify).
//   2. Worker response events contain NO `reward.monster`,
//      `grammar.answer-submitted`, `grammar.concept-secured`, or
//      `grammar.misconception-seen`. Reward toasts must not fire.
//   3. `state.transferEvidence[promptId]` records a **positive delta** —
//      the saved writing + selfAssessment ticks land in the evidence slot.
//
// Seeded state is non-empty (mastery, retryQueue, misconceptions, session
// populated) so the invariants catch a regression that accidentally wipes
// learner progress mid-save rather than only exercising the pristine case.
//
// SSR blind spots:
//   * This file exercises the Worker engine directly — SSR, pointer-
//     capture, focus, IME, scroll-into-view, animation frames,
//     requestIdleCallback, MutationObserver, and timer drift do not apply.
//     The UI-layer equivalents live in `tests/grammar-transfer-scene.test.js`.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialGrammarState,
  createServerGrammarEngine,
} from '../worker/src/subjects/grammar/engine.js';
import { GRAMMAR_TRANSFER_PROMPT_IDS } from '../worker/src/subjects/grammar/transfer-prompts.js';

function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value));
}

function seedLearnerState() {
  // Start from the canonical initial shape and populate the four slots the
  // save MUST leave untouched. Shapes mirror `normaliseServerGrammarData`:
  // mastery is a map of node-maps ({concepts, templates, questionTypes,
  // items}); retryQueue is an array of {templateId, seed, dueAt,
  // conceptIds, reason}; misconceptions is a plain object; session is a
  // reduced practice-session snapshot.
  //
  // Values are small but non-empty so that a regression that zeros or
  // rewrites any slot shows up as a JSON.stringify drift rather than
  // slipping past an empty baseline.
  const state = createInitialGrammarState();
  state.mastery = {
    concepts: {
      adverbials: { attempts: 5, correct: 4, wrong: 1, correctStreak: 2, strength: 0.76, intervalDays: 3, dueAt: 1_777_300_000_000 },
      clauses: { attempts: 2, correct: 1, wrong: 1, correctStreak: 0, strength: 0.52, intervalDays: 1, dueAt: 1_777_050_000_000 },
    },
    templates: {
      fronted_adverbial_choose: { attempts: 3, correct: 2 },
    },
    questionTypes: {
      choose: { attempts: 6, correct: 4 },
    },
    items: {},
  };
  state.retryQueue = [
    {
      templateId: 'fronted_adverbial_choose',
      seed: 1234,
      dueAt: 1_777_100_000_000,
      conceptIds: ['adverbials'],
      reason: 'recent-miss',
    },
    {
      templateId: 'relative_clause_choose',
      seed: 5678,
      dueAt: 1_777_200_000_000,
      conceptIds: ['relative_clauses'],
      reason: 'recent-miss',
    },
  ];
  state.misconceptions = {
    adverbials: { count: 1, lastSeenAt: 1_776_900_000_000, tags: ['missing-comma'] },
  };
  state.session = {
    id: 'seeded-session',
    mode: 'smart',
    type: 'practice',
    targetCount: 5,
    answered: 2,
    currentIndex: 2,
    questions: [
      { templateId: 'fronted_adverbial_choose', item: { promptText: 'seed-question' } },
    ],
  };
  return state;
}

// -----------------------------------------------------------------------------
// Gate test — full Writing Try save round-trip
// -----------------------------------------------------------------------------

test('U10 gate: save-transfer-evidence leaves mastery/retryQueue/misconceptions/session byte-equal and emits zero reward events', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const seeded = seedLearnerState();

  // The server engine runs `normaliseServerGrammarData` on every apply,
  // which fills in default fields and re-orders keys. To compare byte-
  // equal states, we first apply a no-op (`save-prefs` with no patch)
  // so the baseline is captured from the engine's canonical shape. Any
  // subsequent save against that same canonical shape must produce
  // identical mastery/retryQueue/misconceptions/session snapshots.
  const baseline = engine.apply({
    learnerId: 'learner-u10',
    subjectRecord: { ui: seeded, data: { ...seeded } },
    command: 'save-prefs',
    requestId: 'tx-u10-seed',
    payload: { prefs: {} },
  });
  assert.ok(baseline?.state, 'baseline save-prefs must resolve with a canonical state');

  const beforeMastery = JSON.stringify(cloneDeep(baseline.state.mastery));
  const beforeRetryQueue = JSON.stringify(cloneDeep(baseline.state.retryQueue));
  const beforeMisconceptions = JSON.stringify(cloneDeep(baseline.state.misconceptions));
  const beforeSession = JSON.stringify(cloneDeep(baseline.state.session));
  const beforeTransferEvidence = JSON.stringify(cloneDeep(baseline.state.transferEvidence));

  const promptId = GRAMMAR_TRANSFER_PROMPT_IDS[0];

  const result = engine.apply({
    learnerId: 'learner-u10',
    subjectRecord: { ui: baseline.state, data: { ...baseline.state } },
    command: 'save-transfer-evidence',
    requestId: 'tx-u10-gate',
    payload: {
      promptId,
      writing: 'Suddenly, thunder cracked across the sky. The lightning, which struck the lone oak, was fierce.',
      selfAssessment: [
        { key: 'check-0', checked: true },
        { key: 'check-1', checked: false },
        { key: 'check-2', checked: true },
      ],
    },
  });

  assert.ok(result?.state, 'save-transfer-evidence must resolve with a state');

  // ---- Invariant 1: byte-equal snapshots on the four untouched slots.
  assert.equal(
    JSON.stringify(result.state.mastery),
    beforeMastery,
    'mastery must be byte-equal before/after a non-scored save',
  );
  assert.equal(
    JSON.stringify(result.state.retryQueue),
    beforeRetryQueue,
    'retryQueue must be byte-equal before/after a non-scored save',
  );
  assert.equal(
    JSON.stringify(result.state.misconceptions),
    beforeMisconceptions,
    'misconceptions must be byte-equal before/after a non-scored save',
  );
  assert.equal(
    JSON.stringify(result.state.session),
    beforeSession,
    'session must be byte-equal before/after a non-scored save',
  );

  // ---- Invariant 2: no scoring / reward events fire.
  const forbiddenEventTypes = new Set([
    'reward.monster',
    'grammar.answer-submitted',
    'grammar.concept-secured',
    'grammar.misconception-seen',
  ]);
  const events = Array.isArray(result.events) ? result.events : [];
  for (const event of events) {
    assert.equal(
      forbiddenEventTypes.has(event?.type),
      false,
      `non-scored save emitted forbidden event type: ${event?.type}`,
    );
  }

  // ---- Invariant 3: positive delta on transferEvidence.
  const afterTransferEvidence = JSON.stringify(cloneDeep(result.state.transferEvidence));
  assert.notEqual(
    afterTransferEvidence,
    beforeTransferEvidence,
    'transferEvidence must record a positive delta after save',
  );
  const entry = result.state.transferEvidence[promptId];
  assert.ok(entry, `transferEvidence[${promptId}] must exist after save`);
  assert.equal(entry.latest.writing.startsWith('Suddenly'), true,
    'latest.writing must preserve the saved paragraph');
  assert.deepEqual(entry.latest.selfAssessment, [
    { key: 'check-0', checked: true },
    { key: 'check-1', checked: false },
    { key: 'check-2', checked: true },
  ], 'latest.selfAssessment must mirror the learner ticks verbatim');
});

// -----------------------------------------------------------------------------
// Edge: a second save on the same prompt still leaves the four untouched
// slots byte-equal and grows the history, not the mastery.
// -----------------------------------------------------------------------------

test('U10 gate: a second save on the same prompt preserves the four non-scored slots and grows history', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const initial = seedLearnerState();
  const promptId = GRAMMAR_TRANSFER_PROMPT_IDS[0];

  const first = engine.apply({
    learnerId: 'learner-u10-b',
    subjectRecord: { ui: initial, data: { ...initial } },
    command: 'save-transfer-evidence',
    requestId: 'tx-u10-gate-1',
    payload: { promptId, writing: 'First draft.', selfAssessment: [] },
  });

  const afterFirstMastery = JSON.stringify(first.state.mastery);
  const afterFirstRetry = JSON.stringify(first.state.retryQueue);
  const afterFirstMisconceptions = JSON.stringify(first.state.misconceptions);
  const afterFirstSession = JSON.stringify(first.state.session);

  const second = engine.apply({
    learnerId: 'learner-u10-b',
    subjectRecord: { ui: first.state, data: { ...first.state } },
    command: 'save-transfer-evidence',
    requestId: 'tx-u10-gate-2',
    payload: { promptId, writing: 'Second draft, richer detail.', selfAssessment: [{ key: 'c', checked: true }] },
  });

  assert.equal(JSON.stringify(second.state.mastery), afterFirstMastery,
    'mastery must stay byte-equal across a second save');
  assert.equal(JSON.stringify(second.state.retryQueue), afterFirstRetry,
    'retryQueue must stay byte-equal across a second save');
  assert.equal(JSON.stringify(second.state.misconceptions), afterFirstMisconceptions,
    'misconceptions must stay byte-equal across a second save');
  assert.equal(JSON.stringify(second.state.session), afterFirstSession,
    'session must stay byte-equal across a second save');

  const entry = second.state.transferEvidence[promptId];
  assert.ok(entry, 'evidence entry present after second save');
  assert.equal(entry.latest.writing, 'Second draft, richer detail.');
  assert.ok(Array.isArray(entry.history));
  assert.ok(entry.history.length >= 1, 'history must record the first draft');
});
