import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSpellingContentOperationCandidate,
  contentOperationHash,
  detectContentOperationConflicts,
  normaliseContentOperation,
  operationConflictKey,
  readContentOperationField,
} from '../src/subjects/spelling/content/operations-model.js';
import {
  readSeededSpellingContentBundle,
} from '../worker/src/generated-spelling-content-seed.js';

test('content operations produce stable hashes and normalised field edits', () => {
  const operation = normaliseContentOperation({
    entityType: 'spelling.word',
    entityId: 'receipt',
    fieldPath: 'explanation',
    action: 'set',
    payload: 'A learner-facing explanation used by the content operation test.',
  }, {
    actorAccountId: 'admin-a',
    now: () => 1_777_000_000_000,
    operationId: 'op-a',
  });

  assert.equal(operation.operationId, 'op-a');
  assert.equal(operation.createdByAccountId, 'admin-a');
  assert.equal(operation.createdAt, 1_777_000_000_000);
  assert.equal(operation.afterHash, contentOperationHash(operation.payload, 'after'));
  assert.equal(contentOperationHash(operation), contentOperationHash({ ...operation }));
});

test('content operations apply spelling pool metadata operations', async () => {
  const bundle = await readSeededSpellingContentBundle();
  const candidate = buildSpellingContentOperationCandidate(bundle, [{
    entityType: 'spelling.pool',
    entityId: 'secure-vocabulary',
    action: 'upsert',
    payload: {
      id: 'secure-vocabulary',
      title: 'Secure vocabulary',
      type: 'extension',
      visibility: { state: 'hidden' },
      sourceNote: 'Created by content operations merge test.',
      provenance: { source: 'content-operations-merge-test' },
    },
  }]);
  const pool = candidate.candidate.draft.pools.find((entry) => entry.id === 'secure-vocabulary');

  assert.equal(candidate.validation.ok, true);
  assert.equal(pool.title, 'Secure vocabulary');
  assert.equal(pool.visibility.state, 'hidden');
});

test('content operations detect same-field conflicts without blocking unrelated fields', () => {
  const left = [{
    operationId: 'left-op',
    entityType: 'spelling.word',
    entityId: 'receipt',
    fieldPath: 'explanation',
    action: 'set',
    payload: 'First explanation.',
  }];
  const right = [{
    operationId: 'right-op',
    entityType: 'spelling.word',
    entityId: 'receipt',
    fieldPath: 'explanation',
    action: 'set',
    payload: 'Second explanation.',
  }];
  const unrelated = [{
    operationId: 'right-tags',
    entityType: 'spelling.word',
    entityId: 'receipt',
    fieldPath: 'tags',
    action: 'set',
    payload: ['test-tag'],
  }];

  assert.deepEqual(detectContentOperationConflicts(left, unrelated), []);

  const conflicts = detectContentOperationConflicts(left, right);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].code, 'same_field_conflict');
  assert.match(conflicts[0].conflictId, /^conflict-/);
  assert.equal(conflicts[0].entityType, 'spelling.word');
  assert.equal(conflicts[0].entityId, 'receipt');
  assert.equal(conflicts[0].fieldPath, 'explanation');
});

test('content operations treat an acknowledged current value as resolved', () => {
  const releaseEdit = normaliseContentOperation({
    operationId: 'release-op',
    entityType: 'spelling.word',
    entityId: 'receipt',
    fieldPath: 'explanation',
    action: 'set',
    payload: 'Current published explanation.',
  });
  const resolvedPackageEdit = normaliseContentOperation({
    operationId: 'resolution-op',
    entityType: 'spelling.word',
    entityId: 'receipt',
    fieldPath: 'explanation',
    action: 'set',
    beforeHash: releaseEdit.afterHash,
    payload: 'Merged explanation chosen by the admin.',
  });

  assert.deepEqual(detectContentOperationConflicts([resolvedPackageEdit], [releaseEdit]), []);
});

test('structural operations conflict with child-field edits on the same entity', () => {
  const structural = [{
    operationId: 'retire-op',
    entityType: 'spelling.word',
    entityId: 'receipt',
    action: 'retire',
    payload: { reason: 'No longer active.' },
  }];
  const edit = [{
    operationId: 'edit-op',
    entityType: 'spelling.word',
    entityId: 'receipt',
    fieldPath: 'explanation',
    action: 'set',
    payload: 'A new explanation.',
  }];

  const conflicts = detectContentOperationConflicts(structural, edit);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].code, 'structural_conflict');
  assert.equal(conflicts[0].fieldPath, '$');
});

test('Hero / Codex exposure operations conflict with reward-track edits on the same track', async () => {
  const structuralRewardTrackEdit = [{
    operationId: 'reward-track-op',
    entityType: 'spelling.rewardTrack',
    entityId: 'spelling-core-inklet',
    action: 'upsert',
    payload: {
      id: 'spelling-core-inklet',
      poolId: 'core',
      monsterId: 'inklet',
      thresholdOverrides: [1],
      heroExposure: { state: 'visible', surfaces: ['codex'] },
    },
  }];
  const exposureOnlyEdit = [{
    operationId: 'exposure-op',
    entityType: 'spelling.heroExposure',
    entityId: 'spelling-core-inklet',
    action: 'upsert',
    payload: {
      state: 'hidden',
      surfaces: ['codex'],
      scheduledAt: 0,
      rolloutFlag: '',
      previewAllowed: true,
    },
  }];
  const unrelatedRewardTrackLabelEdit = [{
    operationId: 'reward-track-labels-op',
    entityType: 'spelling.rewardTrack',
    entityId: 'spelling-core-inklet',
    fieldPath: 'labels.title',
    action: 'set',
    payload: 'Core Inklet',
  }];
  const bundle = await readSeededSpellingContentBundle();

  const conflicts = detectContentOperationConflicts(exposureOnlyEdit, structuralRewardTrackEdit);

  assert.equal(operationConflictKey(exposureOnlyEdit[0]), 'spelling.rewardTrack::spelling-core-inklet::heroExposure');
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].code, 'structural_conflict');
  assert.equal(conflicts[0].entityType, 'spelling.rewardTrack');
  assert.equal(conflicts[0].entityId, 'spelling-core-inklet');
  assert.equal(conflicts[0].fieldPath, '$');
  assert.deepEqual(detectContentOperationConflicts(exposureOnlyEdit, unrelatedRewardTrackLabelEdit), []);
  assert.equal(
    readContentOperationField(bundle, exposureOnlyEdit[0]).state,
    'visible',
  );
}
);

test('spelling package candidate applies word edits against the existing bundle', async () => {
  const bundle = await readSeededSpellingContentBundle();
  const word = bundle.draft.words[0];
  const nextExplanation = `A package-scoped learner-facing explanation for ${word.word}.`;
  const candidate = buildSpellingContentOperationCandidate(bundle, [{
    entityType: 'spelling.word',
    entityId: word.slug,
    fieldPath: 'explanation',
    action: 'set',
    payload: nextExplanation,
  }]);

  assert.equal(candidate.validation.ok, true);
  assert.equal(candidate.candidate.draft.words[0].explanation, nextExplanation);
  assert.equal(
    readContentOperationField(candidate.candidate, {
      entityType: 'spelling.word',
      entityId: word.slug,
      fieldPath: 'explanation',
      action: 'set',
      payload: nextExplanation,
    }),
    nextExplanation,
  );
  assert.match(candidate.operationsHash, /^ops-/);
  assert.match(candidate.candidateHash, /^candidate-/);
});
