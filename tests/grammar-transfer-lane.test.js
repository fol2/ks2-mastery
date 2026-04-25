import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAMMAR_TRANSFER_PROMPTS,
  GRAMMAR_TRANSFER_PROMPT_IDS,
  GRAMMAR_TRANSFER_MAX_PROMPTS,
  GRAMMAR_TRANSFER_HISTORY_PER_PROMPT,
  GRAMMAR_TRANSFER_WRITING_CAP,
  grammarTransferPromptById,
  grammarTransferPromptSummary,
} from '../worker/src/subjects/grammar/transfer-prompts.js';
import {
  createInitialGrammarState,
  createServerGrammarEngine,
} from '../worker/src/subjects/grammar/engine.js';
import { buildGrammarReadModel } from '../worker/src/subjects/grammar/read-models.js';

test('U7: transfer-prompts catalogue contains at least 4 seed prompts with grammar targets', () => {
  assert.ok(GRAMMAR_TRANSFER_PROMPTS.length >= 4);
  for (const prompt of GRAMMAR_TRANSFER_PROMPTS) {
    assert.ok(typeof prompt.id === 'string' && prompt.id.length > 0, 'prompt id');
    assert.ok(typeof prompt.title === 'string' && prompt.title.length > 0, 'prompt title');
    assert.ok(typeof prompt.brief === 'string' && prompt.brief.length > 0, 'prompt brief');
    assert.ok(Array.isArray(prompt.grammarTargets) && prompt.grammarTargets.length >= 2, 'grammar targets');
    assert.ok(Array.isArray(prompt.checklist) && prompt.checklist.length >= 2, 'checklist');
    assert.ok(typeof prompt.reviewCopy === 'string', 'review copy');
  }
});

test('U7: grammarTransferPromptById resolves known ids and nulls unknowns', () => {
  const first = GRAMMAR_TRANSFER_PROMPT_IDS[0];
  assert.ok(grammarTransferPromptById(first));
  assert.equal(grammarTransferPromptById('does-not-exist'), null);
});

test('U7: grammarTransferPromptSummary redacts adult-only reviewCopy', () => {
  const prompt = GRAMMAR_TRANSFER_PROMPTS[0];
  const summary = grammarTransferPromptSummary(prompt);
  assert.equal(summary.id, prompt.id);
  assert.equal(summary.title, prompt.title);
  assert.equal(summary.reviewCopy, undefined, 'reviewCopy must not leak into learner surface');
});

test('U7: save-transfer-evidence persists a new evidence row without mutating mastery', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const masteryBefore = JSON.stringify(createInitialGrammarState().mastery);

  const result = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'save-transfer-evidence',
    requestId: 'tx-1',
    payload: {
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      writing: 'Suddenly, the storm broke. Lightning, which split the sky, lit the fields.',
      selfAssessment: [
        { key: 'fronted-adverbial', checked: true },
        { key: 'parenthesis-commas', checked: true },
        { key: 'relative-clause', checked: true },
      ],
    },
  });

  assert.equal(result.state.error, '');
  const entry = result.state.transferEvidence[GRAMMAR_TRANSFER_PROMPT_IDS[0]];
  assert.ok(entry, 'evidence entry exists');
  assert.equal(entry.latest.writing.startsWith('Suddenly'), true);
  assert.equal(entry.latest.source, 'transfer-lane');
  assert.deepEqual(entry.history, []);

  // Mastery / retry / mastery nodes unchanged
  assert.equal(JSON.stringify(result.state.mastery), masteryBefore);
  assert.deepEqual(result.state.retryQueue, []);

  // Event is non-scored and carries the 'transfer-evidence-saved' type
  const event = result.events.find((e) => e.type === 'grammar.transfer-evidence-saved');
  assert.ok(event, 'non-scored event emitted');
  assert.equal(event.nonScored, true);
});

test('U7: repeated saves for the same prompt keep latest + up to 4 history snapshots (5 slots total)', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  let state = createInitialGrammarState();
  const promptId = GRAMMAR_TRANSFER_PROMPT_IDS[0];

  for (let i = 1; i <= 7; i += 1) {
    const result = engine.apply({
      learnerId: 'learner-a',
      subjectRecord: { ui: state, data: { ...state } },
      command: 'save-transfer-evidence',
      requestId: `tx-${i}`,
      payload: { promptId, writing: `Draft ${i}: lightning and rain.` },
    });
    state = result.state;
  }

  const entry = state.transferEvidence[promptId];
  assert.equal(entry.latest.writing, 'Draft 7: lightning and rain.');
  assert.equal(entry.history.length, GRAMMAR_TRANSFER_HISTORY_PER_PROMPT - 1,
    `history cap is ${GRAMMAR_TRANSFER_HISTORY_PER_PROMPT - 1} snapshots (plus the latest for ${GRAMMAR_TRANSFER_HISTORY_PER_PROMPT} total per-prompt)`);
  // History is ordered most-recent-first
  assert.equal(entry.history[0].writing, 'Draft 6: lightning and rain.');
  assert.equal(entry.history[entry.history.length - 1].writing, 'Draft 3: lightning and rain.');
});

test('U7: attempting to save for a 21st distinct prompt fails closed with contained error', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  let state = createInitialGrammarState();
  state.transferEvidence = {};
  // Fill to the cap using synthetic prompt ids first (the seed catalogue only
  // has 4-6 prompts; we set state.transferEvidence directly to simulate the
  // learner having already saved evidence for the cap's worth of prompts).
  for (let i = 0; i < GRAMMAR_TRANSFER_MAX_PROMPTS; i += 1) {
    state.transferEvidence[`filler-${i}`] = {
      promptId: `filler-${i}`,
      latest: { writing: 'x', selfAssessment: [], savedAt: 1, source: 'transfer-lane' },
      history: [],
      updatedAt: 1,
    };
  }

  // Now a save for a real catalogue prompt that isn't in transferEvidence yet
  // should exceed the quota.
  const newPromptId = GRAMMAR_TRANSFER_PROMPT_IDS[0];
  let caught = null;
  try {
    engine.apply({
      learnerId: 'learner-a',
      subjectRecord: { ui: state, data: { ...state } },
      command: 'save-transfer-evidence',
      requestId: 'tx-overflow',
      payload: { promptId: newPromptId, writing: 'Would push past the cap.' },
    });
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, 'must throw when 21st prompt is attempted');
  assert.match(caught.message || '', /quota/i);
  assert.equal(caught.extra?.code, 'grammar_transfer_quota_exceeded');
});

test('U7: empty writing is rejected before any evidence is saved', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  let caught = null;
  try {
    engine.apply({
      learnerId: 'learner-a',
      subjectRecord: {},
      command: 'save-transfer-evidence',
      requestId: 'tx-empty',
      payload: { promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0], writing: '   ' },
    });
  } catch (err) {
    caught = err;
  }
  assert.ok(caught);
  assert.equal(caught.extra?.code, 'grammar_transfer_writing_required');
});

test('U7: unknown promptId is rejected with contained error', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  let caught = null;
  try {
    engine.apply({
      learnerId: 'learner-a',
      subjectRecord: {},
      command: 'save-transfer-evidence',
      requestId: 'tx-unknown',
      payload: { promptId: 'does-not-exist', writing: 'Anything.' },
    });
  } catch (err) {
    caught = err;
  }
  assert.ok(caught);
  assert.equal(caught.extra?.code, 'grammar_transfer_prompt_not_found');
});

test('U7: writing above the length cap is truncated server-side', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const promptId = GRAMMAR_TRANSFER_PROMPT_IDS[0];
  const oversized = 'x'.repeat(GRAMMAR_TRANSFER_WRITING_CAP * 2);

  const result = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'save-transfer-evidence',
    requestId: 'tx-big',
    payload: { promptId, writing: oversized },
  });

  const latest = result.state.transferEvidence[promptId].latest;
  assert.ok(latest.writing.length <= GRAMMAR_TRANSFER_WRITING_CAP,
    `writing must be capped to ${GRAMMAR_TRANSFER_WRITING_CAP} chars, got ${latest.writing.length}`);
});

test('U7: transferLane read-model exposes prompts and evidence redacted, never reviewCopy', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const promptId = GRAMMAR_TRANSFER_PROMPT_IDS[0];

  const saved = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'save-transfer-evidence',
    requestId: 'tx-rm',
    payload: { promptId, writing: 'A storm rolled in.' },
  });

  const rm = buildGrammarReadModel({ learnerId: 'learner-a', state: saved.state, now: 1_777_000_000_000 });
  assert.equal(rm.transferLane.mode, 'non-scored');
  assert.ok(Array.isArray(rm.transferLane.prompts));
  assert.ok(rm.transferLane.prompts.length >= 4);
  // No reviewCopy on any prompt summary
  for (const prompt of rm.transferLane.prompts) {
    assert.equal(prompt.reviewCopy, undefined);
  }
  // Evidence entry present and latest visible
  const evidence = rm.transferLane.evidence.find((e) => e.promptId === promptId);
  assert.ok(evidence);
  assert.equal(evidence.latest.source, 'transfer-lane');
});

test('U7: save-transfer-evidence never updates mastery, retryQueue, or reward projection (regression)', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const base = createInitialGrammarState();
  // Seed a weak concept so any accidental mutation would be visible
  base.mastery.concepts.adverbials = {
    attempts: 5, correct: 4, wrong: 1, strength: 0.5, intervalDays: 3, dueAt: 0, correctStreak: 2,
    lastSeenAt: null, lastWrongAt: null,
  };

  // First pass: normalise the state through the engine without doing anything.
  // This gives us a stable normalised baseline to compare against, avoiding
  // false positives from node normalisation (lastSeenAt / lastWrongAt defaults).
  const priming = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: base, data: { ...base } },
    command: 'save-prefs',
    requestId: 'prime',
    payload: { prefs: {} },
  });
  const masteryBefore = JSON.stringify(priming.state.mastery);
  const retryBefore = JSON.stringify(priming.state.retryQueue);

  const result = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: priming.state, data: priming.data },
    command: 'save-transfer-evidence',
    requestId: 'tx-invariant',
    payload: { promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0], writing: 'Evidence text.' },
  });

  assert.equal(JSON.stringify(result.state.mastery), masteryBefore,
    'mastery must not change across save-transfer-evidence');
  assert.equal(JSON.stringify(result.state.retryQueue), retryBefore,
    'retryQueue must not change across save-transfer-evidence');
  assert.equal(JSON.stringify(result.state.misconceptions), JSON.stringify(priming.state.misconceptions),
    'misconceptions must not change across save-transfer-evidence');
  // The event must not resemble any scored event type
  for (const event of result.events) {
    assert.notEqual(event.type, 'grammar.answer-submitted');
    assert.notEqual(event.type, 'grammar.concept-secured');
    assert.notEqual(event.type, 'grammar.misconception-seen');
  }
});

test('U7: save for an existing prompt at the cap succeeds (quota only trips on NEW prompt slots)', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  let state = createInitialGrammarState();
  // Fill the quota with filler slots so only existing promptIds are available.
  state.transferEvidence = {};
  for (let i = 0; i < GRAMMAR_TRANSFER_MAX_PROMPTS - 1; i += 1) {
    state.transferEvidence[`filler-${i}`] = {
      promptId: `filler-${i}`,
      latest: { writing: 'x', selfAssessment: [], savedAt: 1, source: 'transfer-lane' },
      history: [],
      updatedAt: 1,
    };
  }
  // Add the real prompt so there are 20 total (at the cap) and the real one is re-saveable.
  const realPromptId = GRAMMAR_TRANSFER_PROMPT_IDS[0];
  state.transferEvidence[realPromptId] = {
    promptId: realPromptId,
    latest: { writing: 'initial', selfAssessment: [], savedAt: 1, source: 'transfer-lane' },
    history: [],
    updatedAt: 1,
  };

  // A re-save for the existing realPromptId must succeed even at the cap.
  const result = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: state, data: { ...state } },
    command: 'save-transfer-evidence',
    requestId: 'tx-existing-at-cap',
    payload: { promptId: realPromptId, writing: 'updated draft' },
  });
  assert.equal(result.state.transferEvidence[realPromptId].latest.writing, 'updated draft');
  // Quota unchanged
  assert.equal(Object.keys(result.state.transferEvidence).length, GRAMMAR_TRANSFER_MAX_PROMPTS);
});
