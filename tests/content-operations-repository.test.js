import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepository } from '../worker/src/repository.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';
import {
  readSeededSpellingContentBundle,
} from '../worker/src/generated-spelling-content-seed.js';
import {
  isEncodedContentOperationSnapshot,
} from '../src/subjects/spelling/content/release-snapshot-codec.js';
import {
  buildContentOperationHeroExposureProjection,
  CONTENT_OPERATION_HERO_EXPOSURE_PROOF_KEY,
} from '../worker/src/content-operations/release-projections.js';

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
    assert.deepEqual(
      first.proof[CONTENT_OPERATION_HERO_EXPOSURE_PROOF_KEY],
      buildContentOperationHeroExposureProjection(seeded),
    );
    assert.equal(second.seeded, false);
    assert.equal(second.releaseId, first.releaseId);
    assert.deepEqual(second.snapshot, first.snapshot);

    const rows = DB.db.prepare(`
      SELECT release_id, snapshot_json
      FROM content_operation_releases
      WHERE subject_id = 'spelling'
    `).all();
    assert.equal(rows.length, 1);
    assert.equal(isEncodedContentOperationSnapshot(rows[0].snapshot_json), true);
    assert.ok(Buffer.byteLength(rows[0].snapshot_json, 'utf8') < 2_000_000);
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
      reason: 'Restore the seeded content after a test edit.',
      proof: { source: 'rollback-test' },
    });
    const latest = await repository.readLatestContentOperationRelease('spelling', {
      includeSnapshot: true,
    });

    assert.equal(rollback.rollbackOfReleaseId, seedRelease.releaseId);
    assert.equal(rollback.baseReleaseId, changed.release.releaseId);
    assert.equal(rollback.proof.rollback.reason, 'Restore the seeded content after a test edit.');
    assert.equal(rollback.proof.rollback.approvedByAccountId, 'admin-a');
    assert.equal(rollback.proof.rollback.publishedByAccountId, 'admin-a');
    assert.deepEqual(
      rollback.proof[CONTENT_OPERATION_HERO_EXPOSURE_PROOF_KEY],
      seedRelease.proof[CONTENT_OPERATION_HERO_EXPOSURE_PROOF_KEY],
    );
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
    const candidateStorage = DB.db.prepare(`
      SELECT candidate_snapshot_json
      FROM content_operation_package_candidates
      WHERE candidate_id = ?
    `).get(candidate.candidateId);
    assert.equal(isEncodedContentOperationSnapshot(candidateStorage.candidate_snapshot_json), true);
    assert.ok(Buffer.byteLength(candidateStorage.candidate_snapshot_json, 'utf8') < 2_000_000);

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
    const releaseStorage = DB.db.prepare(`
      SELECT snapshot_json
      FROM content_operation_releases
      WHERE release_id = ?
    `).get(release.releaseId);
    assert.equal(isEncodedContentOperationSnapshot(releaseStorage.snapshot_json), true);
    assert.ok(Buffer.byteLength(releaseStorage.snapshot_json, 'utf8') < 2_000_000);

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

test('content operations repository auto-rebases unrelated package approval after release drift', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => 1_777_000_000_000,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    await repository.seedFirstContentOperationRelease({
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
    const staleExplanation = `Rebased package explanation for ${firstWord.word}.`;
    await repository.appendContentOperation(stalePackage.packageId, {
      entityType: 'spelling.word',
      entityId: firstWord.slug,
      fieldPath: 'explanation',
      action: 'set',
      payload: staleExplanation,
    }, {
      actorAccountId: 'admin-a',
    });

    const newerSourceNote = `Newer package note for ${secondWord.word}.`;
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
      payload: newerSourceNote,
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
    assert.equal(staleCandidate.conflicts.length, 0);
    assert.equal(
      staleCandidate.candidate.draft.words.find((entry) => entry.slug === firstWord.slug).explanation,
      staleExplanation,
    );
    assert.equal(
      staleCandidate.candidate.draft.words.find((entry) => entry.slug === secondWord.slug).sourceNote,
      newerSourceNote,
    );

    await repository.approveContentOperationCandidate(stalePackage.packageId, staleCandidate.candidateId, {
      approvedByAccountId: 'admin-a',
    });
    const release = await repository.publishContentOperationPackage(stalePackage.packageId, {
      publishedByAccountId: 'admin-a',
    });
    assert.equal(release.baseReleaseId, newerRelease.releaseId);
  } finally {
    DB.close();
  }
});

test('content operations repository records structural release drift conflicts without throwing', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => 1_777_000_000_000,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: 'admin-a',
      proof: { source: 'repository-structural-conflict-test' },
    });
    const word = seeded.draft.words[0];
    const baseSentence = seeded.draft.sentences[0];
    const sentencePayload = {
      ...baseSentence,
      id: `${word.slug}__conflict_create`,
      wordSlug: word.slug,
      text: `A structural conflict sentence for ${word.word}.`,
      sortIndex: 90_000,
    };

    const stalePackage = await repository.createContentOperationPackage({
      templateId: 'edit-spelling-sentence',
      title: 'Stale structural create',
      createdByAccountId: 'admin-a',
    });
    await repository.appendContentOperation(stalePackage.packageId, {
      entityType: 'spelling.sentenceEntry',
      entityId: sentencePayload.id,
      action: 'create',
      payload: sentencePayload,
    }, {
      actorAccountId: 'admin-a',
    });

    const newerPackage = await repository.createContentOperationPackage({
      templateId: 'edit-spelling-sentence',
      title: 'Newer structural create',
      createdByAccountId: 'admin-b',
    });
    await repository.appendContentOperation(newerPackage.packageId, {
      entityType: 'spelling.sentenceEntry',
      entityId: sentencePayload.id,
      action: 'create',
      payload: sentencePayload,
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
    assert.equal(staleCandidate.conflicts[0].code, 'structural_conflict');
    assert.equal(staleCandidate.conflicts[0].entityType, 'spelling.sentenceEntry');
    assert.equal(staleCandidate.conflicts[0].entityId, sentencePayload.id);

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

test('content operations repository resolves same-field release drift conflicts', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => 1_777_000_000_000,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: 'admin-a',
      proof: { source: 'repository-conflict-resolution-test' },
    });
    const word = seeded.draft.words[0];
    const packageValue = `Package explanation for ${word.word}.`;
    const currentValue = `Current release explanation for ${word.word}.`;
    const mergedValue = `Merged explanation for ${word.word}.`;

    const conflictedPackage = await repository.createContentOperationPackage({
      templateId: 'edit-spelling-word',
      title: 'Package with same-field conflict',
      createdByAccountId: 'admin-a',
    });
    await repository.appendContentOperation(conflictedPackage.packageId, {
      entityType: 'spelling.word',
      entityId: word.slug,
      fieldPath: 'explanation',
      action: 'set',
      payload: packageValue,
    }, {
      actorAccountId: 'admin-a',
    });

    const newerPackage = await repository.createContentOperationPackage({
      templateId: 'edit-spelling-word',
      title: 'Conflicting release',
      createdByAccountId: 'admin-b',
    });
    await repository.appendContentOperation(newerPackage.packageId, {
      entityType: 'spelling.word',
      entityId: word.slug,
      fieldPath: 'explanation',
      action: 'set',
      payload: currentValue,
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

    const conflictedCandidate = await repository.buildContentOperationCandidate(conflictedPackage.packageId, {
      actorAccountId: 'admin-a',
    });
    assert.equal(conflictedCandidate.currentReleaseId, newerRelease.releaseId);
    assert.equal(conflictedCandidate.conflicts.length, 1);
    assert.equal(conflictedCandidate.conflicts[0].code, 'same_field_conflict');
    assert.equal(conflictedCandidate.conflicts[0].packageValue, packageValue);
    assert.equal(conflictedCandidate.conflicts[0].currentValue, currentValue);

    await assert.rejects(
      () => repository.approveContentOperationCandidate(conflictedPackage.packageId, conflictedCandidate.candidateId, {
        approvedByAccountId: 'admin-a',
      }),
      /unresolved conflicts/,
    );

    const resolved = await repository.resolveContentOperationConflict(conflictedPackage.packageId, {
      conflictId: conflictedCandidate.conflicts[0].conflictId,
      resolution: 'edit',
      value: mergedValue,
    }, {
      actorAccountId: 'admin-a',
    });
    assert.equal(resolved.operation.fieldPath, 'explanation');
    assert.equal(resolved.operation.payload, mergedValue);
    assert.notEqual(resolved.candidate.candidateHash, conflictedCandidate.candidateHash);
    assert.equal(resolved.candidate.conflicts.length, 0);

    await repository.approveContentOperationCandidate(conflictedPackage.packageId, resolved.candidate.candidateId, {
      approvedByAccountId: 'admin-a',
    });
    const release = await repository.publishContentOperationPackage(conflictedPackage.packageId, {
      publishedByAccountId: 'admin-a',
    });
    assert.equal(
      release.snapshot.draft.words.find((entry) => entry.slug === word.slug).explanation,
      mergedValue,
    );

    const keepPackage = await repository.createContentOperationPackage({
      templateId: 'edit-spelling-word',
      title: 'Package-value conflict resolution',
      createdByAccountId: 'admin-a',
    });
    await repository.appendContentOperation(keepPackage.packageId, {
      entityType: 'spelling.word',
      entityId: word.slug,
      fieldPath: 'sourceNote',
      action: 'set',
      payload: `Package source note for ${word.word}.`,
    }, {
      actorAccountId: 'admin-a',
    });
    const newerSource = await repository.createContentOperationPackage({
      templateId: 'edit-spelling-word',
      title: 'Conflicting source note release',
      createdByAccountId: 'admin-b',
    });
    await repository.appendContentOperation(newerSource.packageId, {
      entityType: 'spelling.word',
      entityId: word.slug,
      fieldPath: 'sourceNote',
      action: 'set',
      payload: `Current source note for ${word.word}.`,
    }, {
      actorAccountId: 'admin-b',
    });
    const newerSourceCandidate = await repository.buildContentOperationCandidate(newerSource.packageId, {
      actorAccountId: 'admin-b',
    });
    await repository.approveContentOperationCandidate(newerSource.packageId, newerSourceCandidate.candidateId, {
      approvedByAccountId: 'admin-b',
    });
    await repository.publishContentOperationPackage(newerSource.packageId, {
      publishedByAccountId: 'admin-b',
    });

    const packageConflict = await repository.buildContentOperationCandidate(keepPackage.packageId, {
      actorAccountId: 'admin-a',
    });
    assert.equal(packageConflict.conflicts.length, 1);
    const packageResolved = await repository.resolveContentOperationConflict(keepPackage.packageId, {
      conflictId: packageConflict.conflicts[0].conflictId,
      resolution: 'package',
    }, {
      actorAccountId: 'admin-a',
    });
    assert.equal(packageResolved.candidate.conflicts.length, 0);
    assert.notEqual(packageResolved.candidate.candidateHash, packageConflict.candidateHash);
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

test('content operations repository batches release history enrichment', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => 1_777_000_000_000,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    const words = seeded.draft.words.slice(0, 4);
    assert.equal(words.length, 4);

    for (const [index, word] of words.entries()) {
      await publishWordEdit(repository, word, {
        actorAccountId: `admin-${index}`,
        title: `Batch history package ${index + 1}`,
        payload: `Batch history explanation ${index + 1} for ${word.word}.`,
      });
    }

    DB.clearQueryLog();
    const releases = await repository.listContentOperationReleases({
      subjectId: 'spelling',
      includeHistory: true,
      limit: 10,
    });
    const queryLog = DB.takeQueryLog();

    assert.ok(releases.length >= 4);
    assert.equal(releases[0].history.package.title, 'Batch history package 4');
    assert.equal(releases[0].history.changedEntities.preview[0].entityType, 'spelling.word');
    assert.ok(releases.every((release) => release.history));

    const historyReads = queryLog.filter((entry) => (
      entry.operation === 'all'
        && /FROM content_operation_(releases|packages|package_approvals|package_operations)\b/i.test(entry.sql)
    ));
    assert.equal(historyReads.length, 4);
    assert.equal(historyReads.filter((entry) => /FROM content_operation_packages\b/i.test(entry.sql)).length, 1);
    assert.equal(historyReads.filter((entry) => /FROM content_operation_package_approvals\b/i.test(entry.sql)).length, 1);
    assert.equal(historyReads.filter((entry) => /FROM content_operation_package_operations\b/i.test(entry.sql)).length, 1);
  } finally {
    DB.close();
  }
});
