import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSpellingContentOperationCandidate,
  contentOperationHash,
  detectContentOperationConflicts,
  normaliseContentOperation,
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
  assert.equal(conflicts[0].entityType, 'spelling.word');
  assert.equal(conflicts[0].entityId, 'receipt');
  assert.equal(conflicts[0].fieldPath, 'explanation');
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
