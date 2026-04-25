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
import { normaliseGrammarReadModel } from '../src/subjects/grammar/metadata.js';

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

// ----------------------------------------------------------------------------
// U6a: client-side transferLane plumbing drift-detection tests.
// ----------------------------------------------------------------------------
function collectKeyPaths(value, pathPrefix = '', acc = new Set()) {
  if (value === null || typeof value !== 'object') return acc;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectKeyPaths(entry, `${pathPrefix}[${index}]`, acc));
    return acc;
  }
  for (const [key, child] of Object.entries(value)) {
    const nextPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    acc.add(nextPath);
    collectKeyPaths(child, nextPath, acc);
  }
  return acc;
}

function assertNoForbiddenReadModelKeys(value, forbidden) {
  const forbiddenSet = new Set(forbidden);
  const visit = (node, pathPrefix) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${pathPrefix}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      const nextPath = pathPrefix ? `${pathPrefix}.${key}` : key;
      if (forbiddenSet.has(key)) {
        assert.fail(`Forbidden key "${key}" found at ${nextPath}`);
      }
      visit(child, nextPath);
    }
  };
  visit(value, '');
}

test('U6a: client normaliseGrammarReadModel exposes transferLane with full Worker shape', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const promptId = GRAMMAR_TRANSFER_PROMPT_IDS[0];

  const saved = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'save-transfer-evidence',
    requestId: 'tx-u6a-drift',
    payload: {
      promptId,
      writing: 'Suddenly, lightning split the sky. The storm, which roared overhead, pressed on.',
      selfAssessment: [
        { key: 'fronted-adverbial', checked: true },
        { key: 'parenthesis-commas', checked: true },
      ],
    },
  });

  const workerRm = buildGrammarReadModel({ learnerId: 'learner-a', state: saved.state, now: 1_777_000_000_000 });
  assert.ok(workerRm.transferLane, 'Worker read model must include transferLane');

  const clientRm = normaliseGrammarReadModel(workerRm, 'learner-a');
  assert.ok(clientRm.transferLane, 'client normaliser must expose transferLane');

  // Every key path the Worker emits under transferLane must be reachable after
  // normalisation. Missing keys indicate silent drift.
  const workerPaths = collectKeyPaths(workerRm.transferLane);
  const clientPaths = collectKeyPaths(clientRm.transferLane);
  const missing = [...workerPaths].filter((path) => !clientPaths.has(path));
  assert.deepEqual(missing, [], `client dropped transferLane keys: ${missing.join(', ')}`);

  // Spot-check the nested Worker contract explicitly.
  assert.equal(clientRm.transferLane.mode, 'non-scored');
  assert.ok(clientRm.transferLane.prompts.length >= 4);
  const firstPrompt = clientRm.transferLane.prompts[0];
  assert.equal(typeof firstPrompt.id, 'string');
  assert.equal(typeof firstPrompt.title, 'string');
  assert.equal(typeof firstPrompt.brief, 'string');
  assert.ok(Array.isArray(firstPrompt.grammarTargets));
  assert.ok(Array.isArray(firstPrompt.checklist));

  assert.equal(typeof clientRm.transferLane.limits.maxPrompts, 'number');
  assert.equal(typeof clientRm.transferLane.limits.historyPerPrompt, 'number');
  assert.equal(typeof clientRm.transferLane.limits.writingCapChars, 'number');

  const evidence = clientRm.transferLane.evidence.find((entry) => entry.promptId === promptId);
  assert.ok(evidence, 'evidence entry for saved promptId must round-trip');
  assert.equal(evidence.latest.source, 'transfer-lane');
  assert.ok(evidence.latest.writing.startsWith('Suddenly'));
  assert.equal(evidence.latest.selfAssessment.length, 2);
  assert.equal(evidence.latest.selfAssessment[0].key, 'fronted-adverbial');
  assert.equal(evidence.latest.selfAssessment[0].checked, true);
});

test('U6a: normaliseGrammarReadModel omits reviewCopy and requestId anywhere under transferLane', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const promptId = GRAMMAR_TRANSFER_PROMPT_IDS[0];

  const saved = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'save-transfer-evidence',
    requestId: 'tx-redaction',
    payload: { promptId, writing: 'Short evidence sample.' },
  });
  const workerRm = buildGrammarReadModel({ learnerId: 'learner-a', state: saved.state, now: 1_777_000_000_000 });
  const clientRm = normaliseGrammarReadModel(workerRm, 'learner-a');

  assertNoForbiddenReadModelKeys(clientRm.transferLane, ['reviewCopy', 'requestId']);
});

test('U6a: evidence preserves Worker-side updatedAt descending sort (no client re-sort)', () => {
  const workerRm = {
    transferLane: {
      mode: 'non-scored',
      prompts: [
        { id: 'a', title: 'A', brief: 'b', grammarTargets: [], checklist: [] },
      ],
      limits: { maxPrompts: 20, historyPerPrompt: 5, writingCapChars: 2000 },
      evidence: [
        { promptId: 'p3', latest: { writing: 'x', selfAssessment: [], savedAt: 300, source: 'transfer-lane' }, history: [], updatedAt: 300 },
        { promptId: 'p2', latest: { writing: 'x', selfAssessment: [], savedAt: 200, source: 'transfer-lane' }, history: [], updatedAt: 200 },
        { promptId: 'p1', latest: { writing: 'x', selfAssessment: [], savedAt: 100, source: 'transfer-lane' }, history: [], updatedAt: 100 },
      ],
    },
  };
  const clientRm = normaliseGrammarReadModel(workerRm, 'learner-a');
  assert.deepEqual(
    clientRm.transferLane.evidence.map((entry) => entry.promptId),
    ['p3', 'p2', 'p1'],
    'client must preserve Worker-side updatedAt descending order',
  );
});

test('U6a: missing transferLane returns shape-stable zero values', () => {
  const clientRm = normaliseGrammarReadModel({}, 'learner-a');
  assert.deepEqual(clientRm.transferLane, {
    mode: '',
    prompts: [],
    limits: { maxPrompts: 0, historyPerPrompt: 0, writingCapChars: 0 },
    evidence: [],
  });
});

test('U6a: malformed transferLane.prompts coerces to []', () => {
  const clientRm = normaliseGrammarReadModel({
    transferLane: {
      mode: 'non-scored',
      prompts: 'not-an-array',
      limits: { maxPrompts: 20, historyPerPrompt: 5, writingCapChars: 2000 },
      evidence: [],
    },
  }, 'learner-a');
  assert.deepEqual(clientRm.transferLane.prompts, []);
  assert.equal(clientRm.transferLane.mode, 'non-scored');
});

test('U6a: malformed evidence[0].latest.selfAssessment coerces to []', () => {
  const clientRm = normaliseGrammarReadModel({
    transferLane: {
      mode: 'non-scored',
      prompts: [],
      limits: { maxPrompts: 20, historyPerPrompt: 5, writingCapChars: 2000 },
      evidence: [{
        promptId: 'p1',
        latest: { writing: 'hi', selfAssessment: undefined, savedAt: 0, source: 'transfer-lane' },
        history: [],
        updatedAt: 0,
      }],
    },
  }, 'learner-a');
  assert.deepEqual(clientRm.transferLane.evidence[0].latest.selfAssessment, []);
});

test('U6a: orphaned evidence (promptId not in prompts catalogue) passes through untouched', () => {
  const workerRm = {
    transferLane: {
      mode: 'non-scored',
      prompts: [
        { id: 'real-prompt', title: 'Real', brief: 'b', grammarTargets: [], checklist: [] },
      ],
      limits: { maxPrompts: 20, historyPerPrompt: 5, writingCapChars: 2000 },
      evidence: [{
        promptId: 'retired-prompt',
        latest: { writing: 'orphaned draft', selfAssessment: [], savedAt: 123, source: 'transfer-lane' },
        history: [],
        updatedAt: 123,
      }],
    },
  };
  const clientRm = normaliseGrammarReadModel(workerRm, 'learner-a');
  const orphan = clientRm.transferLane.evidence.find((entry) => entry.promptId === 'retired-prompt');
  assert.ok(orphan, 'orphaned evidence must pass through the normaliser untouched');
  assert.equal(orphan.latest.writing, 'orphaned draft');
  assert.equal(orphan.latest.source, 'transfer-lane');
  // Catalogue still reachable
  assert.equal(clientRm.transferLane.prompts.length, 1);
  assert.equal(clientRm.transferLane.prompts[0].id, 'real-prompt');
});

test('U6a: U6a does NOT add "transfer" to the phase allowlist — that is U6b scope', () => {
  // U6a is plumbing only; the `'transfer'` phase string belongs to U6b when
  // the scene ships. Assert that passing `phase: 'transfer'` still falls back
  // to the default `'dashboard'` phase on the client.
  const clientRm = normaliseGrammarReadModel({ phase: 'transfer' }, 'learner-a');
  assert.equal(clientRm.phase, 'dashboard');
});
