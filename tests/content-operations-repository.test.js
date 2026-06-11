import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepository } from '../worker/src/repository.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';
import {
  readSeededSpellingContentBundle,
} from '../worker/src/generated-spelling-content-seed.js';

async function publishWordEdit(repository, word, {
  actorAccountId = 'admin-a',
  title = 'Repository helper package',
  fieldPath = 'explanation',
  payload = `Published learner-facing explanation for ${word?.word || 'word'}.`,
} = {}) {
  await repository.seedFirstContentOperationRelease({
    seededByAccountId: actorAccountId,
    proof: { source: 'repository-test-helper' },
  });
  const contentPackage = await repository.createContentOperationPackage({
    templateId: 'edit-spelling-word',
    title,
    createdByAccountId: actorAccountId,
  });
  await repository.appendContentOperation(contentPackage.packageId, {
    entityType: 'spelling.word',
    entityId: word.slug,
    fieldPath,
    action: 'set',
    payload,
  }, {
    actorAccountId,
  });
  const candidate = await repository.buildContentOperationCandidate(contentPackage.packageId, {
    actorAccountId,
  });
  await repository.approveContentOperationCandidate(contentPackage.packageId, candidate.candidateId, {
    approvedByAccountId: actorAccountId,
  });
  const release = await repository.publishContentOperationPackage(contentPackage.packageId, {
    publishedByAccountId: actorAccountId,
  });
  return { contentPackage, candidate, release };
}

test('content operations repository blocks normal package publish before first global release seed', async () => {
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
      title: 'Publish before cutover seed',
      createdByAccountId: 'admin-a',
    });
    await repository.appendContentOperation(contentPackage.packageId, {
      entityType: 'spelling.word',
      entityId: word.slug,
      fieldPath: 'explanation',
      action: 'set',
      payload: `Unseeded package explanation for ${word.word}.`,
    }, {
      actorAccountId: 'admin-a',
    });
    const candidate = await repository.buildContentOperationCandidate(contentPackage.packageId, {
      actorAccountId: 'admin-a',
    });
    await repository.approveContentOperationCandidate(contentPackage.packageId, candidate.candidateId, {
      approvedByAccountId: 'admin-a',
    });

    await assert.rejects(
      () => repository.publishContentOperationPackage(contentPackage.packageId, {
        publishedByAccountId: 'admin-a',
      }),
      (error) => {
        assert.equal(error.extra?.code, 'content_operation_first_release_required');
        assert.equal(error.extra?.packageId, contentPackage.packageId);
        return true;
      },
    );
  } finally {
    DB.close();
  }
});

test('content operations repository seeds the first global release idempotently from bundled content', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => 1_777_000_000_000,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    const first = await repository.seedFirstContentOperationRelease({
      seededByAccountId: 'admin-a',
      proof: { source: 'seed-idempotency-test' },
    });
    const second = await repository.seedFirstContentOperationRelease({
      seededByAccountId: 'admin-a',
      proof: { source: 'seed-idempotency-test-repeat' },
    });

    assert.equal(first.seeded, true);
    assert.equal(first.source.type, 'bundled_fallback');
    assert.equal(first.snapshot.publication.currentReleaseId, seeded.publication.currentReleaseId);
    assert.equal(second.seeded, false);
    assert.equal(second.releaseId, first.releaseId);
    assert.deepEqual(second.snapshot, first.snapshot);

    const rows = DB.db.prepare(`
      SELECT release_id
      FROM content_operation_releases
      WHERE subject_id = 'spelling'
    `).all();
    assert.equal(rows.length, 1);
  } finally {
    DB.close();
  }
});

test('content operations repository rollback writes a new latest release pointing at the target', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => 1_777_000_000_000,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    const seedRelease = await repository.seedFirstContentOperationRelease({
      seededByAccountId: 'admin-a',
      proof: { source: 'rollback-test-seed' },
    });
    const word = seeded.draft.words[0];
    const changed = await publishWordEdit(repository, word, {
      title: 'Release to roll back',
      payload: `Temporary rollback test explanation for ${word.word}.`,
    });

    assert.notEqual(changed.release.snapshotHash, seedRelease.snapshotHash);

    const rollback = await repository.rollbackContentOperationRelease('spelling', seedRelease.releaseId, {
      rolledBackByAccountId: 'admin-a',
      proof: { source: 'rollback-test' },
    });
    const latest = await repository.readLatestContentOperationRelease('spelling', {
      includeSnapshot: true,
    });

    assert.equal(rollback.rollbackOfReleaseId, seedRelease.releaseId);
    assert.equal(rollback.baseReleaseId, changed.release.releaseId);
    assert.equal(rollback.snapshotHash, seedRelease.snapshotHash);
    assert.deepEqual(rollback.snapshot, seedRelease.snapshot);
    assert.equal(latest.releaseId, rollback.releaseId);
    assert.equal(latest.rollbackOfReleaseId, seedRelease.releaseId);

    const events = await repository.listContentOperationEvents({
      releaseId: rollback.releaseId,
    });
    assert.ok(events.some((event) => event.eventType === 'release.rollback'));
  } finally {
    DB.close();
  }
});

test('content operations repository publishes an approved package as a global release', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => 1_777_000_000_000,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    const seedRelease = await repository.seedFirstContentOperationRelease({
      seededByAccountId: 'admin-a',
      proof: { source: 'repository-lifecycle-test' },
    });
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
    assert.equal(contentPackage.baseReleaseId, seedRelease.releaseId);
    assert.equal(contentPackage.baseReleaseHash, seedRelease.snapshotHash);

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

    const detail = await repository.readContentOperationRelease('spelling', release.releaseId, {
      includeSnapshot: true,
    });
    assert.equal(detail.releaseId, release.releaseId);
    assert.equal(detail.snapshot.draft.words[0].explanation, explanation);

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

test('content operations repository blocks approving a candidate after package operations change', async () => {
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
      title: 'Stale candidate operations package',
      createdByAccountId: 'admin-a',
    });

    await repository.appendContentOperation(contentPackage.packageId, {
      entityType: 'spelling.word',
      entityId: word.slug,
      fieldPath: 'explanation',
      action: 'set',
      payload: `Candidate explanation for ${word.word}.`,
    }, {
      actorAccountId: 'admin-a',
    });
    const staleCandidate = await repository.buildContentOperationCandidate(contentPackage.packageId, {
      actorAccountId: 'admin-a',
    });

    await repository.appendContentOperation(contentPackage.packageId, {
      entityType: 'spelling.word',
      entityId: word.slug,
      fieldPath: 'sourceNote',
      action: 'set',
      payload: 'Operation added after candidate build.',
    }, {
      actorAccountId: 'admin-a',
    });

    await assert.rejects(
      () => repository.approveContentOperationCandidate(contentPackage.packageId, staleCandidate.candidateId, {
        approvedByAccountId: 'admin-a',
      }),
      (error) => {
        assert.equal(error.extra?.code, 'content_operation_candidate_operations_stale');
        assert.equal(error.extra?.candidateId, staleCandidate.candidateId);
        return true;
      },
    );

    const updated = await repository.readContentOperationPackage(contentPackage.packageId, {
      includeOperations: false,
    });
    assert.equal(updated.state, 'draft');
    assert.equal(updated.approvedAt, null);
  } finally {
    DB.close();
  }
});

test('content operations repository blocks approving a candidate after release drift', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => 1_777_000_000_000,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    const seedRelease = await repository.seedFirstContentOperationRelease({
      seededByAccountId: 'admin-a',
      proof: { source: 'repository-release-drift-test' },
    });
    const firstWord = seeded.draft.words[0];
    const secondWord = seeded.draft.words[1];

    const stalePackage = await repository.createContentOperationPackage({
      templateId: 'edit-spelling-word',
      title: 'Candidate built before release drift',
      createdByAccountId: 'admin-a',
    });
    await repository.appendContentOperation(stalePackage.packageId, {
      entityType: 'spelling.word',
      entityId: firstWord.slug,
      fieldPath: 'explanation',
      action: 'set',
      payload: `Stale candidate explanation for ${firstWord.word}.`,
    }, {
      actorAccountId: 'admin-a',
    });
    const staleCandidate = await repository.buildContentOperationCandidate(stalePackage.packageId, {
      actorAccountId: 'admin-a',
    });

    const newerPackage = await repository.createContentOperationPackage({
      templateId: 'edit-spelling-word',
      title: 'Release that creates drift before approval',
      createdByAccountId: 'admin-b',
    });
    await repository.appendContentOperation(newerPackage.packageId, {
      entityType: 'spelling.word',
      entityId: secondWord.slug,
      fieldPath: 'sourceNote',
      action: 'set',
      payload: `Drift package note for ${secondWord.word}.`,
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
      () => repository.approveContentOperationCandidate(stalePackage.packageId, staleCandidate.candidateId, {
        approvedByAccountId: 'admin-a',
      }),
      (error) => {
        assert.equal(error.extra?.code, 'content_operation_candidate_release_drift');
        assert.equal(error.extra?.candidateCurrentReleaseId, seedRelease.releaseId);
        assert.equal(error.extra?.currentReleaseId, newerRelease.releaseId);
        return true;
      },
    );
  } finally {
    DB.close();
  }
});

test('content operations repository keeps published packages immutable', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => 1_777_000_000_000,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: 'admin-a',
      proof: { source: 'repository-immutability-test' },
    });
    const word = seeded.draft.words[0];
    const contentPackage = await repository.createContentOperationPackage({
      templateId: 'edit-spelling-word',
      title: 'Published package immutability package',
      createdByAccountId: 'admin-a',
    });
    await repository.appendContentOperation(contentPackage.packageId, {
      entityType: 'spelling.word',
      entityId: word.slug,
      fieldPath: 'explanation',
      action: 'set',
      payload: `Published package explanation for ${word.word}.`,
    }, {
      actorAccountId: 'admin-a',
    });
    const candidate = await repository.buildContentOperationCandidate(contentPackage.packageId, {
      actorAccountId: 'admin-a',
    });
    await repository.approveContentOperationCandidate(contentPackage.packageId, candidate.candidateId, {
      approvedByAccountId: 'admin-a',
    });
    await repository.publishContentOperationPackage(contentPackage.packageId, {
      publishedByAccountId: 'admin-a',
    });

    await assert.rejects(
      () => repository.buildContentOperationCandidate(contentPackage.packageId, {
        actorAccountId: 'admin-a',
      }),
      (error) => {
        assert.equal(error.extra?.code, 'content_operation_package_published');
        return true;
      },
    );
    await assert.rejects(
      () => repository.approveContentOperationCandidate(contentPackage.packageId, candidate.candidateId, {
        approvedByAccountId: 'admin-a',
      }),
      (error) => {
        assert.equal(error.extra?.code, 'content_operation_package_published');
        return true;
      },
    );

    const updated = await repository.readContentOperationPackage(contentPackage.packageId, {
      includeOperations: false,
    });
    assert.equal(updated.state, 'published');
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
    const seedRelease = await repository.seedFirstContentOperationRelease({
      seededByAccountId: 'admin-a',
      proof: { source: 'repository-stale-package-test' },
    });
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
    assert.equal(staleCandidate.conflicts[0].packageBaseReleaseId, seedRelease.releaseId);
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
    const seedRelease = await repository.seedFirstContentOperationRelease({
      seededByAccountId: 'admin-a',
      proof: { source: 'repository-stale-publish-test' },
    });
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
        assert.equal(error.extra?.candidateCurrentReleaseId, seedRelease.releaseId);
        assert.equal(error.extra?.currentReleaseId, newerRelease.releaseId);
        return true;
      },
    );
  } finally {
    DB.close();
  }
});

test('content operations repository keeps publish idempotent for the same package', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => 1_777_000_000_000,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    const word = seeded.draft.words[0];
    const { contentPackage, release } = await publishWordEdit(repository, word, {
      title: 'Duplicate publish guard package',
      payload: `Duplicate publish guard explanation for ${word.word}.`,
    });

    await assert.rejects(
      () => repository.publishContentOperationPackage(contentPackage.packageId, {
        publishedByAccountId: 'admin-a',
      }),
      (error) => {
        assert.equal(error.extra?.code, 'content_operation_package_published');
        return true;
      },
    );

    DB.db.prepare(`
      UPDATE content_operation_packages
      SET state = 'approved'
      WHERE package_id = ?
    `).run(contentPackage.packageId);
    DB.db.prepare(`
      UPDATE content_operation_package_candidates
      SET current_release_id = ?
      WHERE package_id = ?
    `).run(release.releaseId, contentPackage.packageId);

    await assert.rejects(
      () => repository.publishContentOperationPackage(contentPackage.packageId, {
        publishedByAccountId: 'admin-a',
      }),
      (error) => {
        assert.equal(error.extra?.code, 'content_operation_package_published');
        return true;
      },
    );

    const releaseRows = DB.db.prepare(`
      SELECT release_id
      FROM content_operation_releases
      WHERE package_id = ?
    `).all(contentPackage.packageId);
    assert.equal(releaseRows.length, 1);
  } finally {
    DB.close();
  }
});

test('content operations repository orders latest releases deterministically on timestamp ties', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => 1_777_000_000_000,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    const firstWord = seeded.draft.words[0];
    const secondWord = seeded.draft.words[1];

    const first = await publishWordEdit(repository, firstWord, {
      title: 'First same-timestamp package',
      payload: `First same-timestamp explanation for ${firstWord.word}.`,
    });
    const second = await publishWordEdit(repository, secondWord, {
      actorAccountId: 'admin-b',
      title: 'Second same-timestamp package',
      payload: `Second same-timestamp explanation for ${secondWord.word}.`,
    });

    assert.equal(first.release.publishedAt, second.release.publishedAt);

    const latest = await repository.readLatestContentOperationRelease('spelling', {
      includeSnapshot: true,
    });
    assert.equal(latest.releaseId, second.release.releaseId);
    assert.equal(latest.snapshot.draft.words[1].explanation, `Second same-timestamp explanation for ${secondWord.word}.`);

    const releases = await repository.listContentOperationReleases({
      subjectId: 'spelling',
      limit: 2,
    });
    assert.deepEqual(
      releases.map((release) => release.releaseId),
      [second.release.releaseId, first.release.releaseId],
    );
  } finally {
    DB.close();
  }
});
