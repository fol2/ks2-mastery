// U10 — Admin archive + hard-delete for Grammar Writing Try evidence.
//
// Covers: happy paths, cap interaction (archive frees a save slot),
// error paths (archive-before-delete contract, unknown promptId), and
// the non-scored invariant (archive + delete emit zero reward / mastery
// / concept-secured / misconception events).
//
// Role-spoofing rejection + demo-account rejection live in
// `tests/grammar-transfer-admin-security.test.js` so the security
// contract is locked in a dedicated, loud-named file.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  archiveGrammarTransferEvidenceState,
  createInitialGrammarState,
  createServerGrammarEngine,
  deleteGrammarTransferEvidenceState,
} from '../worker/src/subjects/grammar/engine.js';
import {
  GRAMMAR_TRANSFER_MAX_PROMPTS,
  GRAMMAR_TRANSFER_PROMPT_IDS,
} from '../worker/src/subjects/grammar/transfer-prompts.js';
import { buildGrammarAdminTransferLaneReadModel } from '../worker/src/subjects/grammar/read-models.js';

function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value));
}

function seedEvidence(engine, learnerId, promptId, writing) {
  return engine.apply({
    learnerId,
    subjectRecord: {},
    command: 'save-transfer-evidence',
    requestId: `seed-${promptId}`,
    payload: {
      promptId,
      writing,
      selfAssessment: [{ key: 'check-0', checked: true }],
    },
  });
}

test('U10 archive: live entry moves to archive slot; transferEvidence shrinks', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const promptId = GRAMMAR_TRANSFER_PROMPT_IDS[0];
  const saved = seedEvidence(engine, 'learner-admin-1', promptId, 'Baseline draft.');
  assert.ok(saved.state.transferEvidence[promptId]);

  const state = cloneDeep(saved.state);
  const events = archiveGrammarTransferEvidenceState(state, {
    promptId,
    learnerId: 'learner-admin-1',
    requestId: 'tx-archive-1',
    now: 1_777_000_000_100,
  });

  assert.equal(state.transferEvidence[promptId], undefined,
    'archive must remove the entry from live transferEvidence');
  assert.ok(state.transferEvidenceArchive[promptId],
    'archive must populate transferEvidenceArchive');
  assert.equal(state.transferEvidenceArchive[promptId].latest.writing, 'Baseline draft.',
    'archived latest.writing must preserve the saved draft');
  assert.equal(state.transferEvidenceArchive[promptId].archivedAt, 1_777_000_000_100,
    'archivedAt must stamp the now() value');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'grammar.transfer-evidence-archived');
  assert.equal(events[0].nonScored, true);
  assert.equal(events[0].promptId, promptId);
});

test('U10 delete: archived entry is removed; live entry untouched', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const promptId = GRAMMAR_TRANSFER_PROMPT_IDS[0];
  const saved = seedEvidence(engine, 'learner-admin-2', promptId, 'Draft for delete.');

  const state = cloneDeep(saved.state);
  archiveGrammarTransferEvidenceState(state, {
    promptId,
    learnerId: 'learner-admin-2',
    requestId: 'tx-archive-2',
    now: 1_777_000_000_100,
  });
  assert.ok(state.transferEvidenceArchive[promptId]);

  const events = deleteGrammarTransferEvidenceState(state, {
    promptId,
    learnerId: 'learner-admin-2',
    requestId: 'tx-delete-2',
    now: 1_777_000_000_200,
  });
  assert.equal(state.transferEvidenceArchive[promptId], undefined,
    'delete must wipe the archived entry');
  assert.equal(state.transferEvidence[promptId], undefined,
    'delete must not resurrect the live entry');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'grammar.transfer-evidence-deleted');
  assert.equal(events[0].nonScored, true);
  assert.equal(events[0].promptId, promptId);
});

test('U10 delete rejects archive-before-delete: non-archived live entry cannot be deleted', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const promptId = GRAMMAR_TRANSFER_PROMPT_IDS[0];
  const saved = seedEvidence(engine, 'learner-admin-3', promptId, 'Draft no archive.');

  const state = cloneDeep(saved.state);
  assert.throws(
    () => deleteGrammarTransferEvidenceState(state, {
      promptId,
      learnerId: 'learner-admin-3',
      requestId: 'tx-delete-3',
      now: 1_777_000_000_100,
    }),
    (error) => error?.extra?.code === 'archive_required_before_delete',
    'delete on a live entry must throw archive_required_before_delete',
  );
  // Live entry MUST still exist after the rejected delete.
  assert.ok(state.transferEvidence[promptId],
    'live entry must remain after archive_required_before_delete rejection');
});

test('U10 delete rejects unknown promptId with transfer_evidence_not_found', () => {
  const state = createInitialGrammarState();
  assert.throws(
    () => deleteGrammarTransferEvidenceState(state, {
      promptId: 'ghost-prompt',
      learnerId: 'learner-admin-4',
      requestId: 'tx-delete-4',
      now: 1_777_000_000_000,
    }),
    (error) => error?.extra?.code === 'transfer_evidence_not_found',
    'delete on a never-saved prompt must throw transfer_evidence_not_found',
  );
});

test('U10 archive rejects unknown promptId with transfer_evidence_not_found', () => {
  const state = createInitialGrammarState();
  assert.throws(
    () => archiveGrammarTransferEvidenceState(state, {
      promptId: 'ghost-prompt',
      learnerId: 'learner-admin-5',
      requestId: 'tx-archive-5',
      now: 1_777_000_000_000,
    }),
    (error) => error?.extra?.code === 'transfer_evidence_not_found',
    'archive on a never-saved prompt must throw transfer_evidence_not_found',
  );
});

test('U10 archive + delete helpers require a non-empty promptId', () => {
  const state = createInitialGrammarState();
  for (const badPromptId of ['', null, undefined, 42]) {
    assert.throws(
      () => archiveGrammarTransferEvidenceState(state, { promptId: badPromptId, now: 0 }),
      /prompt id/i,
      `archive must reject promptId=${String(badPromptId)}`,
    );
    assert.throws(
      () => deleteGrammarTransferEvidenceState(state, { promptId: badPromptId, now: 0 }),
      /prompt id/i,
      `delete must reject promptId=${String(badPromptId)}`,
    );
  }
});

test('U10 cap interaction: archive frees a slot at the 20-prompt cap', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  // Seed the cap with synthetic promptIds that aren't in the catalogue
  // — the engine rejects unknown prompts on save, so we construct the
  // state directly and drive archive via the pure helper. The pure
  // helper doesn't consult the prompt catalogue, so this still proves
  // the cap arithmetic.
  const learnerId = 'learner-admin-cap';
  let state = createInitialGrammarState();
  // Populate with 20 synthetic entries.
  for (let index = 0; index < GRAMMAR_TRANSFER_MAX_PROMPTS; index += 1) {
    const promptId = GRAMMAR_TRANSFER_PROMPT_IDS[index] || `seed-${index}`;
    state.transferEvidence[promptId] = {
      promptId,
      latest: {
        source: 'transfer-lane',
        writing: `draft ${index}`,
        selfAssessment: [],
        savedAt: 1_777_000_000_000 + index,
      },
      history: [],
      updatedAt: 1_777_000_000_000 + index,
    };
  }
  assert.equal(Object.keys(state.transferEvidence).length, GRAMMAR_TRANSFER_MAX_PROMPTS,
    'pre-condition: state is at cap');

  // Archive one entry — the live count drops by 1.
  const archivedPromptId = Object.keys(state.transferEvidence)[0];
  archiveGrammarTransferEvidenceState(state, {
    promptId: archivedPromptId,
    learnerId,
    requestId: 'tx-archive-cap',
    now: 1_777_000_000_500,
  });
  assert.equal(Object.keys(state.transferEvidence).length, GRAMMAR_TRANSFER_MAX_PROMPTS - 1,
    'archive must free a live-evidence slot');
  assert.ok(state.transferEvidenceArchive[archivedPromptId]);

  // The save-transfer-evidence path's own cap check counts ONLY the
  // live `state.transferEvidence` map, so a 20th save on a fresh
  // promptId now succeeds. We confirm by running a save against a
  // catalogue promptId that is not already in the map. Because we
  // synthetically seeded non-catalogue promptIds above, we pick the
  // first catalogue id and make sure it's absent from the seeded map.
  const freshPromptId = GRAMMAR_TRANSFER_PROMPT_IDS.find((id) => !state.transferEvidence[id]);
  if (freshPromptId) {
    const saveResult = engine.apply({
      learnerId,
      subjectRecord: { data: { ...state } },
      command: 'save-transfer-evidence',
      requestId: 'tx-save-after-archive',
      payload: {
        promptId: freshPromptId,
        writing: 'Post-archive draft that must succeed at the cap.',
        selfAssessment: [],
      },
    });
    assert.ok(saveResult?.state?.transferEvidence?.[freshPromptId],
      `post-archive save of ${freshPromptId} must succeed when cap is freed`);
  }
});

test('U10 admin read-model: buildGrammarAdminTransferLaneReadModel exposes archive', () => {
  const state = createInitialGrammarState();
  state.transferEvidence['active-prompt'] = {
    promptId: 'active-prompt',
    latest: {
      source: 'transfer-lane',
      writing: 'live writing',
      selfAssessment: [],
      savedAt: 10,
    },
    history: [],
    updatedAt: 10,
  };
  state.transferEvidenceArchive['archived-prompt'] = {
    promptId: 'archived-prompt',
    latest: {
      source: 'transfer-lane',
      writing: 'archived writing',
      selfAssessment: [{ key: 'a', checked: true }],
      savedAt: 20,
    },
    history: [{ writing: 'older', savedAt: 5 }],
    updatedAt: 20,
    archivedAt: 25,
  };
  const model = buildGrammarAdminTransferLaneReadModel(state);
  assert.ok(Array.isArray(model.archive));
  assert.equal(model.archive.length, 1);
  assert.equal(model.archive[0].promptId, 'archived-prompt');
  assert.equal(model.archive[0].latest.writing, 'archived writing');
  assert.equal(model.archive[0].archivedAt, 25);
  assert.ok(Array.isArray(model.evidence));
  assert.equal(model.evidence.length, 1);
  assert.equal(model.evidence[0].promptId, 'active-prompt');
});

test('U10 learner read-model stays archive-free', async () => {
  const { buildGrammarReadModel } = await import('../worker/src/subjects/grammar/read-models.js');
  const state = createInitialGrammarState();
  state.transferEvidenceArchive['archived-prompt'] = {
    promptId: 'archived-prompt',
    latest: { source: 'transfer-lane', writing: 'archive leaked', selfAssessment: [], savedAt: 50 },
    history: [],
    updatedAt: 50,
    archivedAt: 55,
  };
  const learnerModel = buildGrammarReadModel({
    learnerId: 'learner-admin-6',
    state,
    now: 1_777_000_000_000,
  });
  // Learner projection MUST NOT carry the archive slot — the scene has
  // no safe place to show this and the child surface should never be
  // able to enumerate admin-managed content.
  assert.equal(Array.isArray(learnerModel.transferLane.archive), false,
    'learner transferLane must omit the archive field entirely');
  // Double-check by stringifying — `archive` must not appear at all.
  const serialised = JSON.stringify(learnerModel.transferLane);
  assert.equal(serialised.includes('"archive"'), false,
    'learner transferLane JSON must not contain the archive key');
});

test('U10 non-scored invariant: archive + delete events never consume reward types', () => {
  const state = createInitialGrammarState();
  state.transferEvidence['p-1'] = {
    promptId: 'p-1',
    latest: { source: 'transfer-lane', writing: 'hello', selfAssessment: [], savedAt: 1 },
    history: [],
    updatedAt: 1,
  };
  const archiveEvents = archiveGrammarTransferEvidenceState(state, {
    promptId: 'p-1',
    learnerId: 'l',
    requestId: 'r1',
    now: 2,
  });
  const deleteEvents = deleteGrammarTransferEvidenceState(state, {
    promptId: 'p-1',
    learnerId: 'l',
    requestId: 'r2',
    now: 3,
  });
  const forbidden = new Set([
    'reward.monster',
    'grammar.answer-submitted',
    'grammar.concept-secured',
    'grammar.misconception-seen',
  ]);
  for (const event of [...archiveEvents, ...deleteEvents]) {
    assert.equal(forbidden.has(event?.type), false,
      `non-scored helper emitted forbidden event type: ${event?.type}`);
    assert.equal(event.nonScored, true,
      'every audit event must carry nonScored: true');
  }
});
