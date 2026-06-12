import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepository } from '../worker/src/repository.js';
import {
  readSeededSpellingContentBundle,
} from '../worker/src/generated-spelling-content-seed.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const BASE_URL = 'https://repo.test';
const ADMIN_ID = 'admin-a';
const NOW = Date.UTC(2026, 5, 12, 10, 0, 0);

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

async function publishTemporaryWordEdit(repository, seedRelease) {
  const seeded = await readSeededSpellingContentBundle();
  const word = seeded.draft.words[0];
  const contentPackage = await repository.createContentOperationPackage({
    templateId: 'edit-spelling-word',
    title: 'Rollback route temporary spelling edit',
    createdByAccountId: ADMIN_ID,
  });
  await repository.appendContentOperation(contentPackage.packageId, {
    entityType: 'spelling.word',
    entityId: word.slug,
    fieldPath: 'explanation',
    action: 'set',
    payload: `Temporary rollback route explanation for ${word.word}.`,
  }, {
    actorAccountId: ADMIN_ID,
  });
  const candidate = await repository.buildContentOperationCandidate(contentPackage.packageId, {
    actorAccountId: ADMIN_ID,
  });
  assert.equal(candidate.currentReleaseId, seedRelease.releaseId);
  await repository.approveContentOperationCandidate(contentPackage.packageId, candidate.candidateId, {
    approvedByAccountId: ADMIN_ID,
  });
  return repository.publishContentOperationPackage(contentPackage.packageId, {
    publishedByAccountId: ADMIN_ID,
    proof: {
      source: 'content-operations-rollback-test',
      surfaces: {
        spellingSetup: { evidence: 'setup-smoke-before-rollback' },
        wordBank: { evidence: 'word-bank-smoke-before-rollback' },
      },
    },
  });
}

test('content operations rollback route publishes a new latest release with lineage and reason', async () => {
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
    const seedRelease = await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'content-operations-rollback-seed' },
    });
    const changedRelease = await publishTemporaryWordEdit(repository, seedRelease);
    assert.notEqual(changedRelease.snapshotHash, seedRelease.snapshotHash);

    const missingReasonResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/releases/${seedRelease.releaseId}/rollback`,
      jsonInit('POST', {
        proof: { source: 'content-operations-rollback-test' },
      }),
      adminHeaders(),
    );
    assert.equal(missingReasonResponse.status, 400);

    const rollbackResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/releases/${seedRelease.releaseId}/rollback`,
      jsonInit('POST', {
        reason: 'Restore the seeded release after a temporary content edit.',
        proof: {
          source: 'content-operations-rollback-test',
          rollback: {
            reason: 'Restore the seeded release after a temporary content edit.',
            approvedByAccountId: ADMIN_ID,
            publishedByAccountId: ADMIN_ID,
            approvalMode: 'same-role-placeholder',
            proofRequirement: 'production-proof-after-rollback',
          },
        },
      }),
      adminHeaders(),
    );
    const rollbackPayload = await rollbackResponse.json();
    assert.equal(rollbackResponse.status, 200);
    assert.equal(rollbackPayload.release.rollbackOfReleaseId, seedRelease.releaseId);
    assert.equal(rollbackPayload.release.baseReleaseId, changedRelease.releaseId);
    assert.equal(rollbackPayload.release.snapshotHash, seedRelease.snapshotHash);
    assert.equal(rollbackPayload.release.proof.rollback.reason, 'Restore the seeded release after a temporary content edit.');
    assert.equal(rollbackPayload.release.proof.rollback.approvedByAccountId, ADMIN_ID);
    assert.equal(rollbackPayload.release.proof.rollback.publishedByAccountId, ADMIN_ID);
    assert.equal(rollbackPayload.release.proof.rollback.proofRequirement, 'production-proof-after-rollback');

    const latest = await repository.readLatestContentOperationRelease('spelling', {
      includeSnapshot: true,
    });
    assert.equal(latest.releaseId, rollbackPayload.release.releaseId);
    assert.equal(latest.rollbackOfReleaseId, seedRelease.releaseId);
    assert.deepEqual(latest.snapshot, seedRelease.snapshot);

    const releaseListResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/releases?includeHistory=true`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const releaseList = await releaseListResponse.json();
    assert.equal(releaseListResponse.status, 200);
    assert.equal(releaseList.releases[0].releaseId, rollbackPayload.release.releaseId);
    assert.equal(releaseList.releases[0].rollbackOfReleaseId, seedRelease.releaseId);
    assert.equal(releaseList.releases[0].history.package, null);

    const events = await repository.listContentOperationEvents({
      releaseId: rollbackPayload.release.releaseId,
    });
    const rollbackEvent = events.find((event) => event.eventType === 'release.rollback');
    assert.ok(rollbackEvent);
    assert.equal(rollbackEvent.event.reason, 'Restore the seeded release after a temporary content edit.');
    assert.deepEqual(bucket.deletes, []);
  } finally {
    server.close();
  }
});
