import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepository } from '../worker/src/repository.js';
import {
  readSeededSpellingContentBundle,
} from '../worker/src/generated-spelling-content-seed.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const BASE_URL = 'https://repo.test';
const ADMIN_ID = 'admin-a';
const NOW = Date.UTC(2026, 5, 12, 14, 0, 0);

function seedAdultAccount(DB, {
  accountId = ADMIN_ID,
  platformRole = 'admin',
} = {}) {
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, ?, ?, NULL, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET
      platform_role = excluded.platform_role,
      updated_at = excluded.updated_at
  `).run(accountId, `${accountId}@example.test`, accountId, platformRole, NOW, NOW);
}

function jsonInit(method, body = {}) {
  return {
    method,
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify(body),
  };
}

function adminHeaders() {
  return {
    'x-ks2-dev-platform-role': 'admin',
    'sec-fetch-site': 'same-origin',
  };
}

function createDeleteTrackingBucket() {
  return {
    deletes: [],
    async get() {
      return null;
    },
    async put() {},
    async delete(key) {
      this.deletes.push(key);
    },
  };
}

async function publishOperations(repository, {
  title,
  operations,
  actorAccountId = ADMIN_ID,
  templateId = 'test-package',
} = {}) {
  const contentPackage = await repository.createContentOperationPackage({
    templateId,
    title,
    createdByAccountId: actorAccountId,
  });
  for (const operation of operations) {
    // eslint-disable-next-line no-await-in-loop
    await repository.appendContentOperation(contentPackage.packageId, operation, {
      actorAccountId,
    });
  }
  const candidate = await repository.buildContentOperationCandidate(contentPackage.packageId, {
    actorAccountId,
  });
  await repository.approveContentOperationCandidate(contentPackage.packageId, candidate.candidateId, {
    approvedByAccountId: actorAccountId,
  });
  const release = await repository.publishContentOperationPackage(contentPackage.packageId, {
    publishedByAccountId: actorAccountId,
    proof: { source: 'content-operations-revert-test' },
  });
  return { contentPackage, candidate, release };
}

test('package-level revert restores one package while preserving unrelated later releases', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => NOW,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'package-revert-seed' },
    });
    const firstWord = seeded.draft.words[0];
    const secondWord = seeded.draft.words[1];
    const firstExplanation = `Temporary package-level revert explanation for ${firstWord.word}.`;
    const secondExplanation = `Unrelated later explanation for ${secondWord.word}.`;
    const source = await publishOperations(repository, {
      title: 'Package to revert',
      operations: [{
        entityType: 'spelling.word',
        entityId: firstWord.slug,
        fieldPath: 'explanation',
        action: 'set',
        payload: firstExplanation,
      }],
    });
    await publishOperations(repository, {
      title: 'Unrelated later package',
      operations: [{
        entityType: 'spelling.word',
        entityId: secondWord.slug,
        fieldPath: 'explanation',
        action: 'set',
        payload: secondExplanation,
      }],
    });

    const revert = await repository.createContentOperationPackageRevert(source.contentPackage.packageId, {
      createdByAccountId: ADMIN_ID,
      reason: 'Undo the first package without touching the second package.',
    });
    assert.equal(revert.package.templateId, 'package-revert');
    assert.equal(revert.package.baseReleaseId, source.release.releaseId);
    assert.equal(revert.candidate.conflicts.length, 0);
    assert.equal(revert.package.operations.length, 1);
    assert.equal(revert.package.operations[0].action, 'set');
    assert.equal(revert.package.operations[0].payload, firstWord.explanation);

    await repository.approveContentOperationCandidate(revert.package.packageId, revert.candidate.candidateId, {
      approvedByAccountId: ADMIN_ID,
    });
    await repository.publishContentOperationPackage(revert.package.packageId, {
      publishedByAccountId: ADMIN_ID,
      proof: { source: 'package-revert-publish-test' },
    });
    const latest = await repository.readLatestContentOperationRelease('spelling', {
      includeSnapshot: true,
    });
    const latestFirst = latest.snapshot.draft.words.find((entry) => entry.slug === firstWord.slug);
    const latestSecond = latest.snapshot.draft.words.find((entry) => entry.slug === secondWord.slug);
    const sourceAfterRevert = await repository.readContentOperationPackage(source.contentPackage.packageId);

    assert.equal(latestFirst.explanation, firstWord.explanation);
    assert.equal(latestSecond.explanation, secondExplanation);
    assert.equal(sourceAfterRevert.state, 'reverted');
    assert.equal(sourceAfterRevert.supersededByPackageId, revert.package.packageId);

    const sourceEvents = await repository.listContentOperationEvents({
      packageId: source.contentPackage.packageId,
      limit: 10,
    });
    assert.ok(sourceEvents.some((event) => event.eventType === 'package.revert_requested'));
    assert.ok(sourceEvents.some((event) => event.eventType === 'package.reverted'));
  } finally {
    DB.close();
  }
});

test('package-level revert surfaces same-field drift as a normal candidate conflict', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => NOW,
  });

  try {
    const seeded = await readSeededSpellingContentBundle();
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'package-revert-conflict-seed' },
    });
    const word = seeded.draft.words[0];
    const sourceValue = `Source package explanation for ${word.word}.`;
    const laterValue = `Later package explanation for ${word.word}.`;
    const source = await publishOperations(repository, {
      title: 'Source package with later conflict',
      operations: [{
        entityType: 'spelling.word',
        entityId: word.slug,
        fieldPath: 'explanation',
        action: 'set',
        payload: sourceValue,
      }],
    });
    await publishOperations(repository, {
      title: 'Later same-field package',
      operations: [{
        entityType: 'spelling.word',
        entityId: word.slug,
        fieldPath: 'explanation',
        action: 'set',
        payload: laterValue,
      }],
    });

    const revert = await repository.createContentOperationPackageRevert(source.contentPackage.packageId, {
      createdByAccountId: ADMIN_ID,
      reason: 'Show the later same-field edit as a conflict.',
    });

    assert.equal(revert.candidate.conflicts.length, 1);
    assert.equal(revert.candidate.conflicts[0].code, 'same_field_conflict');
    assert.equal(revert.candidate.conflicts[0].packageValue, word.explanation);
    assert.equal(revert.candidate.conflicts[0].currentValue, laterValue);

    await assert.rejects(
      () => repository.approveContentOperationCandidate(revert.package.packageId, revert.candidate.candidateId, {
        approvedByAccountId: ADMIN_ID,
      }),
      (error) => {
        assert.equal(error.extra?.code, 'content_operation_candidate_conflicted');
        return true;
      },
    );
  } finally {
    DB.close();
  }
});

test('package-level revert retires published content created by the source package', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => NOW,
  });

  try {
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'package-revert-created-content-seed' },
    });
    const source = await publishOperations(repository, {
      title: 'Create a temporary spelling pool',
      templateId: 'pool-create',
      operations: [{
        entityType: 'spelling.pool',
        entityId: 'temporary-revert-pool',
        fieldPath: '',
        action: 'create',
        payload: {
          id: 'temporary-revert-pool',
          title: 'Temporary revert pool',
          type: 'extension',
          visibility: { state: 'hidden' },
          sourceNote: 'Created by package revert test.',
          provenance: { source: 'content-operations-revert-test' },
        },
      }],
    });

    const revert = await repository.createContentOperationPackageRevert(source.contentPackage.packageId, {
      createdByAccountId: ADMIN_ID,
      reason: 'Retire the published pool rather than hard deleting it.',
    });
    assert.equal(revert.package.operations[0].action, 'retire');

    await repository.approveContentOperationCandidate(revert.package.packageId, revert.candidate.candidateId, {
      approvedByAccountId: ADMIN_ID,
    });
    await repository.publishContentOperationPackage(revert.package.packageId, {
      publishedByAccountId: ADMIN_ID,
      proof: { source: 'package-revert-created-content-publish' },
    });
    const latest = await repository.readLatestContentOperationRelease('spelling', {
      includeSnapshot: true,
    });
    const pool = latest.snapshot.draft.pools.find((entry) => entry.id === 'temporary-revert-pool');

    assert.ok(pool, 'Published pool should remain as auditable retired content.');
    assert.equal(pool.active, false);
    assert.equal(pool.retired, true);
    assert.equal(pool.retirement.source, 'content-operations-package-revert');
  } finally {
    DB.close();
  }
});

test('package-level revert publish rejects a source package that was superseded after approval', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({
    env: { DB },
    now: () => NOW,
  });

  try {
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'package-revert-source-superseded-seed' },
    });
    const seeded = await readSeededSpellingContentBundle();
    const word = seeded.draft.words[0];
    const source = await publishOperations(repository, {
      title: 'Package to supersede before revert publish',
      operations: [{
        entityType: 'spelling.word',
        entityId: word.slug,
        fieldPath: 'explanation',
        action: 'set',
        payload: `Superseded source package explanation for ${word.word}.`,
      }],
    });

    const revert = await repository.createContentOperationPackageRevert(source.contentPackage.packageId, {
      createdByAccountId: ADMIN_ID,
      reason: 'Prepare a revert before another operator supersedes the source.',
    });
    await repository.approveContentOperationCandidate(revert.package.packageId, revert.candidate.candidateId, {
      approvedByAccountId: ADMIN_ID,
    });
    DB.db.prepare(`
      UPDATE content_operation_packages
      SET state = 'reverted', superseded_by_package_id = ?
      WHERE package_id = ?
    `).run('copkg-other-revert', source.contentPackage.packageId);

    await assert.rejects(
      () => repository.publishContentOperationPackage(revert.package.packageId, {
        publishedByAccountId: ADMIN_ID,
        proof: { source: 'package-revert-source-superseded-publish' },
      }),
      (error) => {
        assert.equal(error.extra?.code, 'content_operation_revert_source_superseded');
        assert.equal(error.extra?.revertOfPackageId, source.contentPackage.packageId);
        assert.equal(error.extra?.supersededByPackageId, 'copkg-other-revert');
        return true;
      },
    );
  } finally {
    DB.close();
  }
});

test('package-level revert API creates a draft inverse package and never deletes R2 audio objects', async () => {
  const bucket = createDeleteTrackingBucket();
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: bucket },
    now: () => NOW,
  });

  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const repository = createWorkerRepository({
      env: server.env,
      now: () => NOW,
    });
    const seeded = await readSeededSpellingContentBundle();
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'package-revert-api-seed' },
    });
    const word = seeded.draft.words[0];
    const source = await publishOperations(repository, {
      title: 'API package to revert',
      operations: [{
        entityType: 'spelling.word',
        entityId: word.slug,
        fieldPath: 'explanation',
        action: 'set',
        payload: `API source package explanation for ${word.word}.`,
      }],
    });
    const unpublished = await repository.createContentOperationPackage({
      templateId: 'draft-only',
      title: 'Unpublished revert target',
      createdByAccountId: ADMIN_ID,
    });

    const missingReasonResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${source.contentPackage.packageId}/create-revert`,
      jsonInit('POST', {}),
      adminHeaders(),
    );
    const missingReason = await missingReasonResponse.json();
    assert.equal(missingReasonResponse.status, 400);
    assert.equal(missingReason.code, 'content_operation_revert_reason_required');

    const unpublishedResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${unpublished.packageId}/create-revert`,
      jsonInit('POST', { reason: 'This draft should not be revertable.' }),
      adminHeaders(),
    );
    const unpublishedPayload = await unpublishedResponse.json();
    assert.equal(unpublishedResponse.status, 409);
    assert.equal(unpublishedPayload.code, 'content_operation_package_not_published');

    const response = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${source.contentPackage.packageId}/create-revert`,
      jsonInit('POST', {
        reason: 'Create a package revert through the API.',
      }),
      adminHeaders(),
    );
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.ok, true);
    assert.equal(payload.package.templateId, 'package-revert');
    assert.equal(payload.package.baseReleaseId, source.release.releaseId);
    assert.equal(payload.candidate.currentReleaseId, source.release.releaseId);
    assert.equal(payload.source.packageId, source.contentPackage.packageId);
    assert.equal(payload.release, undefined);
    assert.deepEqual(bucket.deletes, []);

    await repository.approveContentOperationCandidate(payload.package.packageId, payload.candidate.candidateId, {
      approvedByAccountId: ADMIN_ID,
    });
    await repository.publishContentOperationPackage(payload.package.packageId, {
      publishedByAccountId: ADMIN_ID,
      proof: { source: 'package-revert-api-publish' },
    });
    assert.deepEqual(bucket.deletes, []);
  } finally {
    server.close();
  }
});
