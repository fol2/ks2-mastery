import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepository } from '../worker/src/repository.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';
import {
  readSeededSpellingContentBundle,
} from '../worker/src/generated-spelling-content-seed.js';

test('content operations repository publishes an approved package as a global release', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => 1_777_000_000_000,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    const word = seeded.draft.words[0];
    const explanation = `A package-approved learner-facing explanation for ${word.word}.`;

    const contentPackage = await repository.createContentOperationPackage({
      subjectId: 'spelling',
      templateId: 'edit-spelling-word',
      title: 'Edit first seeded spelling word',
      description: 'Repository lifecycle test package.',
      createdByAccountId: 'admin-a',
    });

    assert.equal(contentPackage.state, 'draft');
    assert.equal(contentPackage.baseReleaseId, null);
    assert.equal(contentPackage.baseReleaseHash, null);

    const operation = await repository.appendContentOperation(contentPackage.packageId, {
      entityType: 'spelling.word',
      entityId: word.slug,
      fieldPath: 'explanation',
      action: 'set',
      payload: explanation,
    }, {
      actorAccountId: 'admin-a',
    });

    assert.equal(operation.packageId, contentPackage.packageId);
    assert.equal(operation.operationOrder, 1);
    assert.equal(operation.entityId, word.slug);

    const candidate = await repository.buildContentOperationCandidate(contentPackage.packageId, {
      actorAccountId: 'admin-a',
    });

    assert.equal(candidate.validation.ok, true);
    assert.equal(candidate.candidate.draft.words[0].explanation, explanation);
    assert.match(candidate.candidateHash, /^candidate-/);

    const approval = await repository.approveContentOperationCandidate(
      contentPackage.packageId,
      candidate.candidateId,
      {
        approvedByAccountId: 'admin-a',
        notes: 'Approved in repository lifecycle test.',
      },
    );

    assert.equal(approval.candidateHash, candidate.candidateHash);
    assert.equal(approval.approvedByAccountId, 'admin-a');

    const release = await repository.publishContentOperationPackage(contentPackage.packageId, {
      publishedByAccountId: 'admin-a',
      proof: { source: 'node-test' },
    });

    assert.equal(release.status, 'published');
    assert.equal(release.packageId, contentPackage.packageId);
    assert.equal(release.snapshot.draft.words[0].explanation, explanation);

    const latest = await repository.readLatestContentOperationRelease('spelling', {
      includeSnapshot: true,
    });
    assert.equal(latest.releaseId, release.releaseId);
    assert.equal(latest.snapshot.draft.words[0].explanation, explanation);

    const packages = await repository.listContentOperationPackages({ subjectId: 'spelling' });
    assert.equal(packages.length, 1);
    assert.equal(packages[0].state, 'published');

    const events = await repository.listContentOperationEvents({
      packageId: contentPackage.packageId,
    });
    assert.deepEqual(
      events.map((event) => event.eventType).sort(),
      [
        'candidate.built',
        'operation.appended',
        'package.approved',
        'package.created',
        'package.published',
      ].sort(),
    );
  } finally {
    DB.close();
  }
});

test('content operations repository invalidates approval after package mutation', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => 1_777_000_000_000,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    const word = seeded.draft.words[0];
    const contentPackage = await repository.createContentOperationPackage({
      templateId: 'edit-spelling-word',
      title: 'Approval invalidation package',
      createdByAccountId: 'admin-a',
    });

    await repository.appendContentOperation(contentPackage.packageId, {
      entityType: 'spelling.word',
      entityId: word.slug,
      fieldPath: 'explanation',
      action: 'set',
      payload: `First learner-facing explanation for ${word.word}.`,
    }, {
      actorAccountId: 'admin-a',
    });
    const candidate = await repository.buildContentOperationCandidate(contentPackage.packageId, {
      actorAccountId: 'admin-a',
    });
    await repository.approveContentOperationCandidate(contentPackage.packageId, candidate.candidateId, {
      approvedByAccountId: 'admin-a',
    });

    await repository.appendContentOperation(contentPackage.packageId, {
      entityType: 'spelling.word',
      entityId: word.slug,
      fieldPath: 'sourceNote',
      action: 'set',
      payload: 'Changed after approval.',
    }, {
      actorAccountId: 'admin-a',
    });

    const updated = await repository.readContentOperationPackage(contentPackage.packageId, {
      includeOperations: false,
    });
    assert.equal(updated.state, 'draft');
    assert.equal(updated.approvedAt, null);

    await assert.rejects(
      () => repository.publishContentOperationPackage(contentPackage.packageId, {
        publishedByAccountId: 'admin-a',
      }),
      /approved before publish/,
    );
  } finally {
    DB.close();
  }
});

test('content operations repository blocks stale package approval after release drift', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => 1_777_000_000_000,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    const firstWord = seeded.draft.words[0];
    const secondWord = seeded.draft.words[1];

    const stalePackage = await repository.createContentOperationPackage({
      templateId: 'edit-spelling-word',
      title: 'Package that starts before a newer release',
      createdByAccountId: 'admin-a',
    });
    await repository.appendContentOperation(stalePackage.packageId, {
      entityType: 'spelling.word',
      entityId: firstWord.slug,
      fieldPath: 'explanation',
      action: 'set',
      payload: `Stale package explanation for ${firstWord.word}.`,
    }, {
      actorAccountId: 'admin-a',
    });

    const newerPackage = await repository.createContentOperationPackage({
      templateId: 'edit-spelling-word',
      title: 'Newer package',
      createdByAccountId: 'admin-b',
    });
    await repository.appendContentOperation(newerPackage.packageId, {
      entityType: 'spelling.word',
      entityId: secondWord.slug,
      fieldPath: 'sourceNote',
      action: 'set',
      payload: `Newer package note for ${secondWord.word}.`,
    }, {
      actorAccountId: 'admin-b',
    });
    const newerCandidate = await repository.buildContentOperationCandidate(newerPackage.packageId, {
      actorAccountId: 'admin-b',
    });
    await repository.approveContentOperationCandidate(newerPackage.packageId, newerCandidate.candidateId, {
      approvedByAccountId: 'admin-b',
    });
    const newerRelease = await repository.publishContentOperationPackage(newerPackage.packageId, {
      publishedByAccountId: 'admin-b',
    });

    const staleCandidate = await repository.buildContentOperationCandidate(stalePackage.packageId, {
      actorAccountId: 'admin-a',
    });

    assert.equal(staleCandidate.currentReleaseId, newerRelease.releaseId);
    assert.equal(staleCandidate.conflicts.length, 1);
    assert.equal(staleCandidate.conflicts[0].code, 'base_release_changed');
    assert.equal(staleCandidate.conflicts[0].packageBaseReleaseId, null);
    assert.equal(staleCandidate.conflicts[0].currentReleaseId, newerRelease.releaseId);

    await assert.rejects(
      () => repository.approveContentOperationCandidate(stalePackage.packageId, staleCandidate.candidateId, {
        approvedByAccountId: 'admin-a',
      }),
      /unresolved conflicts/,
    );
  } finally {
    DB.close();
  }
});

test('content operations repository blocks publish when approval becomes stale', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => 1_777_000_000_000,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    const firstWord = seeded.draft.words[0];
    const secondWord = seeded.draft.words[1];

    const approvedPackage = await repository.createContentOperationPackage({
      templateId: 'edit-spelling-word',
      title: 'Approved before another release',
      createdByAccountId: 'admin-a',
    });
    await repository.appendContentOperation(approvedPackage.packageId, {
      entityType: 'spelling.word',
      entityId: firstWord.slug,
      fieldPath: 'explanation',
      action: 'set',
      payload: `Approved package explanation for ${firstWord.word}.`,
    }, {
      actorAccountId: 'admin-a',
    });
    const approvedCandidate = await repository.buildContentOperationCandidate(approvedPackage.packageId, {
      actorAccountId: 'admin-a',
    });
    await repository.approveContentOperationCandidate(approvedPackage.packageId, approvedCandidate.candidateId, {
      approvedByAccountId: 'admin-a',
    });

    const newerPackage = await repository.createContentOperationPackage({
      templateId: 'edit-spelling-word',
      title: 'Release that lands first',
      createdByAccountId: 'admin-b',
    });
    await repository.appendContentOperation(newerPackage.packageId, {
      entityType: 'spelling.word',
      entityId: secondWord.slug,
      fieldPath: 'sourceNote',
      action: 'set',
      payload: `First published release note for ${secondWord.word}.`,
    }, {
      actorAccountId: 'admin-b',
    });
    const newerCandidate = await repository.buildContentOperationCandidate(newerPackage.packageId, {
      actorAccountId: 'admin-b',
    });
    await repository.approveContentOperationCandidate(newerPackage.packageId, newerCandidate.candidateId, {
      approvedByAccountId: 'admin-b',
    });
    const newerRelease = await repository.publishContentOperationPackage(newerPackage.packageId, {
      publishedByAccountId: 'admin-b',
    });

    await assert.rejects(
      () => repository.publishContentOperationPackage(approvedPackage.packageId, {
        publishedByAccountId: 'admin-a',
      }),
      (error) => {
        assert.equal(error.extra?.code, 'content_operation_release_drift');
        assert.equal(error.extra?.candidateCurrentReleaseId, null);
        assert.equal(error.extra?.currentReleaseId, newerRelease.releaseId);
        return true;
      },
    );
  } finally {
    DB.close();
  }
});
