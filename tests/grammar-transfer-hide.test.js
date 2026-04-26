// U10 — Child-side "Hide from my list" toggle for Writing Try orphaned
// evidence. The toggle is purely cosmetic — it writes a promptId to
// `prefs.transferHiddenPromptIds` via the standard `save-prefs` command
// path; server-side evidence is never mutated.
//
// Invariants under test:
//   1. Toggling hide on an orphan promptId persists the id in prefs.
//   2. A second toggle with `hidden: false` removes the id.
//   3. The pref survives a reload / normaliser round-trip.
//   4. The pref is capped at 40 ids so a malformed payload cannot grow
//      state without bound.
//   5. Malformed entries (non-string, empty, duplicate) are dropped.
//   6. Hide NEVER mutates `state.transferEvidence` or any scored slot
//      (this is the non-scored invariant — byte-equal before / after).
//
// The filter correctness (orphan list excludes hidden promptIds) is
// tested as a pure function in this file so the Worker contract stays
// verifiable without a React runtime.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialGrammarState,
  createServerGrammarEngine,
} from '../worker/src/subjects/grammar/engine.js';
import { GRAMMAR_TRANSFER_PROMPT_IDS } from '../worker/src/subjects/grammar/transfer-prompts.js';
import { normaliseGrammarReadModel } from '../src/subjects/grammar/metadata.js';

function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value));
}

test('U10: save-prefs with transferHiddenPromptIds persists the id', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const result = engine.apply({
    learnerId: 'learner-hide-1',
    subjectRecord: {},
    command: 'save-prefs',
    requestId: 'tx-hide-1',
    payload: { prefs: { transferHiddenPromptIds: [GRAMMAR_TRANSFER_PROMPT_IDS[0]] } },
  });
  assert.ok(result?.state);
  assert.deepEqual(
    result.state.prefs.transferHiddenPromptIds,
    [GRAMMAR_TRANSFER_PROMPT_IDS[0]],
    'hidden pref must round-trip verbatim',
  );
});

test('U10: toggling hidden → visible removes the id from the list', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const promptA = GRAMMAR_TRANSFER_PROMPT_IDS[0];
  const promptB = GRAMMAR_TRANSFER_PROMPT_IDS[1] || 'alpha-reserved';
  const seeded = engine.apply({
    learnerId: 'learner-hide-2',
    subjectRecord: {},
    command: 'save-prefs',
    requestId: 'tx-hide-2a',
    payload: { prefs: { transferHiddenPromptIds: [promptA, promptB] } },
  });
  const removed = engine.apply({
    learnerId: 'learner-hide-2',
    subjectRecord: { ui: seeded.state, data: seeded.data },
    command: 'save-prefs',
    requestId: 'tx-hide-2b',
    payload: { prefs: { transferHiddenPromptIds: [promptB] } },
  });
  assert.deepEqual(
    removed.state.prefs.transferHiddenPromptIds,
    [promptB],
    'removing a hidden prompt id must shrink the list',
  );
});

test('U10: omitting transferHiddenPromptIds leaves the existing pref untouched', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const promptA = GRAMMAR_TRANSFER_PROMPT_IDS[0];
  const seeded = engine.apply({
    learnerId: 'learner-hide-3',
    subjectRecord: {},
    command: 'save-prefs',
    requestId: 'tx-hide-3a',
    payload: { prefs: { transferHiddenPromptIds: [promptA] } },
  });
  // Change only the round length — the hidden list must stay.
  const changedRound = engine.apply({
    learnerId: 'learner-hide-3',
    subjectRecord: { ui: seeded.state, data: seeded.data },
    command: 'save-prefs',
    requestId: 'tx-hide-3b',
    payload: { prefs: { roundLength: 12 } },
  });
  assert.deepEqual(
    changedRound.state.prefs.transferHiddenPromptIds,
    [promptA],
    'unrelated prefs update must not reset the hidden list',
  );
});

test('U10: hide pref survives serialise → normalise round-trip', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const promptA = GRAMMAR_TRANSFER_PROMPT_IDS[0];
  const first = engine.apply({
    learnerId: 'learner-hide-4',
    subjectRecord: {},
    command: 'save-prefs',
    requestId: 'tx-hide-4',
    payload: { prefs: { transferHiddenPromptIds: [promptA] } },
  });
  // Serialise then reload — the engine's normaliser runs every apply.
  const serialised = JSON.stringify(first.data);
  const reloaded = engine.apply({
    learnerId: 'learner-hide-4',
    subjectRecord: { data: JSON.parse(serialised) },
    command: 'save-prefs',
    requestId: 'tx-hide-4-reload',
    payload: { prefs: {} },
  });
  assert.deepEqual(
    reloaded.state.prefs.transferHiddenPromptIds,
    [promptA],
    'hidden pref must survive reload via stateData',
  );
});

test('U10: hide pref is capped at 40 ids; excess dropped', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const overflow = Array.from({ length: 60 }, (_, index) => `prompt-${index + 1}`);
  const result = engine.apply({
    learnerId: 'learner-hide-5',
    subjectRecord: {},
    command: 'save-prefs',
    requestId: 'tx-hide-5',
    payload: { prefs: { transferHiddenPromptIds: overflow } },
  });
  assert.equal(result.state.prefs.transferHiddenPromptIds.length, 40,
    'hidden list must be capped at 40 ids');
  assert.equal(result.state.prefs.transferHiddenPromptIds[0], 'prompt-1');
  assert.equal(result.state.prefs.transferHiddenPromptIds[39], 'prompt-40');
});

test('U10: malformed hidden entries (non-string / empty / duplicate) are dropped', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const raw = [
    'alpha',
    'alpha', // duplicate
    '',      // empty
    '   ',   // whitespace — length > 0 so it passes the filter intentionally
    42,      // number
    null,    // null
    { id: 'obj' }, // object
    'beta',
  ];
  const result = engine.apply({
    learnerId: 'learner-hide-6',
    subjectRecord: {},
    command: 'save-prefs',
    requestId: 'tx-hide-6',
    payload: { prefs: { transferHiddenPromptIds: raw } },
  });
  const list = result.state.prefs.transferHiddenPromptIds;
  assert.deepEqual(
    list,
    ['alpha', '   ', 'beta'],
    'only string, non-empty, de-duplicated entries survive',
  );
});

test('U10: hide toggle NEVER mutates transferEvidence or mastery (non-scored invariant)', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  // Seed some transfer evidence.
  const promptId = GRAMMAR_TRANSFER_PROMPT_IDS[0];
  const saved = engine.apply({
    learnerId: 'learner-hide-7',
    subjectRecord: {},
    command: 'save-transfer-evidence',
    requestId: 'tx-hide-7-save',
    payload: {
      promptId,
      writing: 'Baseline Writing Try paragraph for the invariant test.',
      selfAssessment: [],
    },
  });
  // Snapshot the scored slots.
  const beforeMastery = JSON.stringify(saved.state.mastery);
  const beforeRetryQueue = JSON.stringify(saved.state.retryQueue);
  const beforeMisconceptions = JSON.stringify(saved.state.misconceptions);
  const beforeRecentAttempts = JSON.stringify(saved.state.recentAttempts);
  const beforeTransferEvidence = JSON.stringify(saved.state.transferEvidence);

  // Toggle hide on a different promptId (represents an orphan).
  const hideOrphanId = 'retired-prompt-id';
  const toggled = engine.apply({
    learnerId: 'learner-hide-7',
    subjectRecord: { ui: saved.state, data: saved.data },
    command: 'save-prefs',
    requestId: 'tx-hide-7-toggle',
    payload: { prefs: { transferHiddenPromptIds: [hideOrphanId] } },
  });

  assert.equal(JSON.stringify(toggled.state.mastery), beforeMastery,
    'mastery must be byte-equal before / after hide toggle');
  assert.equal(JSON.stringify(toggled.state.retryQueue), beforeRetryQueue,
    'retryQueue must be byte-equal before / after hide toggle');
  assert.equal(JSON.stringify(toggled.state.misconceptions), beforeMisconceptions,
    'misconceptions must be byte-equal before / after hide toggle');
  assert.equal(JSON.stringify(toggled.state.recentAttempts), beforeRecentAttempts,
    'recentAttempts must be byte-equal before / after hide toggle');
  assert.equal(JSON.stringify(toggled.state.transferEvidence), beforeTransferEvidence,
    'transferEvidence must be byte-equal before / after hide toggle');

  // The ONLY delta must be on the pref slot.
  assert.deepEqual(toggled.state.prefs.transferHiddenPromptIds, [hideOrphanId]);

  // Non-scored event assertion — no reward / mastery / concept-secured / misconception
  // events must fire from the save-prefs path.
  const forbidden = new Set([
    'reward.monster',
    'grammar.answer-submitted',
    'grammar.concept-secured',
    'grammar.misconception-seen',
  ]);
  for (const event of toggled.events || []) {
    assert.equal(forbidden.has(event?.type), false,
      `hide toggle emitted forbidden event type: ${event?.type}`);
  }
});

test('U10: client normaliseGrammarReadModel preserves and defaults transferHiddenPromptIds', () => {
  // Case 1: missing prefs entirely → default to empty array.
  const missing = normaliseGrammarReadModel({}, 'learner-hide-8');
  assert.deepEqual(missing.prefs.transferHiddenPromptIds, [],
    'missing prefs must default to empty hidden list');

  // Case 2: malformed entries get filtered and capped.
  const messy = normaliseGrammarReadModel({
    prefs: {
      transferHiddenPromptIds: [
        'alpha', 42, null, '', 'beta', { id: 'obj' }, 'alpha',
      ],
    },
  }, 'learner-hide-8');
  // Client-side normaliser applies the same filter as the Worker:
  // strings only, non-empty, no dedup guarantee at this layer (the
  // Worker's normaliser handles dedup) but cap still applied.
  assert.ok(Array.isArray(messy.prefs.transferHiddenPromptIds));
  for (const entry of messy.prefs.transferHiddenPromptIds) {
    assert.equal(typeof entry, 'string');
    assert.ok(entry.length > 0);
  }
  assert.ok(messy.prefs.transferHiddenPromptIds.length <= 40);

  // Case 3: valid array passes through.
  const valid = normaliseGrammarReadModel({
    prefs: { transferHiddenPromptIds: ['a', 'b', 'c'] },
  }, 'learner-hide-8');
  assert.deepEqual(valid.prefs.transferHiddenPromptIds, ['a', 'b', 'c']);
});

test('U10: orphan filter — hidden ids are excluded from the child-facing orphan list', () => {
  // Replicates the filter logic in GrammarTransferScene.jsx. The scene
  // builds the orphan list as `evidence.filter(entry => entry.promptId
  // && !promptIdSet.has(entry.promptId) && !hiddenSet.has(entry.promptId))`.
  const evidence = [
    { promptId: 'active-1', latest: { writing: 'x', savedAt: 1 }, updatedAt: 1 },
    { promptId: 'retired-1', latest: { writing: 'y', savedAt: 2 }, updatedAt: 2 },
    { promptId: 'retired-2', latest: { writing: 'z', savedAt: 3 }, updatedAt: 3 },
  ];
  const catalogue = new Set(['active-1']);
  const hidden = new Set(['retired-1']);
  const orphans = evidence.filter(
    (entry) => entry.promptId && !catalogue.has(entry.promptId) && !hidden.has(entry.promptId),
  );
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].promptId, 'retired-2');
});

test('U10: initial state default prefs.transferHiddenPromptIds is empty array', () => {
  const initial = createInitialGrammarState();
  assert.deepEqual(initial.prefs.transferHiddenPromptIds, []);
});

test('U10: cloneDeep helper used in other Phase 4 tests stays stable with the new pref', () => {
  const initial = createInitialGrammarState();
  const clone = cloneDeep(initial);
  assert.deepEqual(clone.prefs.transferHiddenPromptIds, []);
  clone.prefs.transferHiddenPromptIds.push('foo');
  assert.deepEqual(initial.prefs.transferHiddenPromptIds, [],
    'cloneDeep must not alias the original hidden list');
});
