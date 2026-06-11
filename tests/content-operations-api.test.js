import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepository } from '../worker/src/repository.js';
import {
  readSeededSpellingContentBundle,
} from '../worker/src/generated-spelling-content-seed.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const BASE_URL = 'https://repo.test';
const ADMIN_ID = 'admin-a';
const NOW = Date.UTC(2026, 5, 11, 12, 0, 0);

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

async function readPayload(response) {
  return response.json();
}

async function createPackage(server, body = {}) {
  const response = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/subjects/spelling/packages`,
    jsonInit('POST', {
      title: 'API spelling edit package',
      templateId: 'edit-spelling-word',
      ...body,
    }),
    adminHeaders(),
  );
  assert.equal(response.status, 201);
  return readPayload(response);
}

async function appendWordExplanationOperation(server, packageId, word, payload) {
  const response = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/operations`,
    jsonInit('POST', {
      operation: {
        entityType: 'spelling.word',
        entityId: word.slug,
        fieldPath: 'explanation',
        action: 'set',
        payload,
      },
    }),
    adminHeaders(),
  );
  assert.equal(response.status, 201);
  return readPayload(response);
}

async function validatePackage(server, packageId, body = {}) {
  const response = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/validate`,
    jsonInit('POST', body),
    adminHeaders(),
  );
  assert.equal(response.status, 200);
  return readPayload(response);
}

async function approvePackage(server, packageId, candidateId) {
  const response = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/approve`,
    jsonInit('POST', {
      candidateId,
      notes: 'Reviewed in the content operations API test.',
    }),
    adminHeaders(),
  );
  assert.equal(response.status, 200);
  return readPayload(response);
}

async function publishPackage(server, packageId, body = {}) {
  const response = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/publish`,
    jsonInit('POST', {
      ...body,
      includeSnapshot: body.includeSnapshot ?? false,
      proof: { source: 'content-operations-api-test', ...body.proof },
    }),
    adminHeaders(),
  );
  assert.equal(response.status, 200);
  return readPayload(response);
}

async function resolveConflictResponse(server, packageId, body = {}) {
  return server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/resolve-conflict`,
    jsonInit('POST', body),
    adminHeaders(),
  );
}

async function resolveConflict(server, packageId, body = {}) {
  const response = await resolveConflictResponse(server, packageId, body);
  assert.equal(response.status, 200);
  return readPayload(response);
}

test('content operations API requires the admin platform role', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    seedAdultAccount(server.DB, { accountId: 'ops-a', platformRole: 'ops' });

    const response = await server.fetchAs(
      'ops-a',
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/overview`,
      {
        method: 'GET',
        headers: { 'sec-fetch-site': 'same-origin' },
      },
      { 'x-ks2-dev-platform-role': 'ops' },
    );
    const payload = await readPayload(response);

    assert.equal(response.status, 403);
    assert.equal(payload.code, 'content_operations_forbidden');
    assert.equal(payload.capability, 'content_operations.view');
    assert.equal(payload.required, 'platform_role:admin');
  } finally {
    server.close();
  }
});

test('content operations API supports admin package lifecycle through separate approve and publish actions', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const repository = createWorkerRepository({
      env: server.env,
      now: () => NOW,
    });
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'content-operations-api-test' },
    });
    const seeded = await readSeededSpellingContentBundle();
    const word = seeded.draft.words[0];

    const created = await createPackage(server);
    const packageId = created.package.packageId;
    assert.equal(created.actor.capabilities['content_operations.edit'], true);
    assert.equal(created.package.state, 'draft');

    const patchResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${packageId}`,
      jsonInit('PATCH', {
        title: 'API spelling edit package renamed',
        description: 'Managed through the content operations API.',
      }),
      adminHeaders(),
    );
    const patched = await readPayload(patchResponse);
    assert.equal(patchResponse.status, 200);
    assert.equal(patched.package.title, 'API spelling edit package renamed');
    assert.equal(patched.package.description, 'Managed through the content operations API.');

    const throwaway = await appendWordExplanationOperation(
      server,
      packageId,
      word,
      'Temporary explanation that will be deleted before validation.',
    );
    const deleteResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${packageId}/operations/${throwaway.operation.operationId}`,
      {
        method: 'DELETE',
        headers: { 'sec-fetch-site': 'same-origin' },
      },
      adminHeaders(),
    );
    const deleted = await readPayload(deleteResponse);
    assert.equal(deleteResponse.status, 200);
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.operation.operationId, throwaway.operation.operationId);

    const explanation = `API-reviewed explanation for ${word.word}.`;
    await appendWordExplanationOperation(server, packageId, word, explanation);

    const validated = await validatePackage(server, packageId);
    assert.equal(validated.candidate.validation.status, 'passed');
    assert.equal(validated.candidate.blockers.publishReadiness.status, 'not_ready');
    server.DB.db.prepare(`
      UPDATE content_operation_package_candidates
      SET audio_scan_json = ?, asset_scan_json = ?
      WHERE candidate_id = ?
    `).run(
      JSON.stringify({
        status: 'blocked',
        blockers: ['word_audio_missing'],
        warnings: ['slow_sentence_missing'],
      }),
      JSON.stringify({
        status: 'warning',
        blockers: [],
        warnings: ['monster_asset_pending'],
      }),
      validated.candidate.candidateId,
    );

    const packageListResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const packageList = await readPayload(packageListResponse);
    assert.equal(packageListResponse.status, 200);
    const packageSummary = packageList.packages.find((entry) => entry.packageId === packageId);
    assert.deepEqual(packageSummary.blockers.audio.blockers, ['word_audio_missing']);
    assert.deepEqual(packageSummary.blockers.audio.warnings, ['slow_sentence_missing']);
    assert.deepEqual(packageSummary.blockers.assets.warnings, ['monster_asset_pending']);

    const approved = await approvePackage(server, packageId, validated.candidate.candidateId);
    assert.equal(approved.approval.candidateId, validated.candidate.candidateId);
    assert.equal(approved.approval.approvedByAccountId, ADMIN_ID);

    const prePublishOverviewResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/overview`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const prePublishOverview = await readPayload(prePublishOverviewResponse);
    assert.equal(prePublishOverviewResponse.status, 200);
    const approvedSummary = prePublishOverview.overview.lanes.approvedPendingPublish.find(
      (entry) => entry.packageId === packageId,
    );
    assert.deepEqual(approvedSummary.blockers.audio.blockers, ['word_audio_missing']);
    assert.deepEqual(approvedSummary.blockers.assets.warnings, ['monster_asset_pending']);

    const publishResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${packageId}/publish`,
      jsonInit('POST', {
        proof: { source: 'content-operations-api-test', reviewer: ADMIN_ID },
      }),
      adminHeaders(),
    );
    const published = await readPayload(publishResponse);
    assert.equal(publishResponse.status, 200);
    assert.equal(published.release.packageId, packageId);
    assert.equal(published.release.publishedByAccountId, ADMIN_ID);

    const releaseDetailResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/releases/${published.release.releaseId}?includeSnapshot=true`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const releaseDetail = await readPayload(releaseDetailResponse);
    assert.equal(releaseDetailResponse.status, 200);
    assert.equal(
      releaseDetail.release.snapshot.draft.words.find((entry) => entry.slug === word.slug).explanation,
      explanation,
    );

    const detailResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${packageId}`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const detail = await readPayload(detailResponse);
    assert.equal(detailResponse.status, 200);
    assert.equal(detail.package.state, 'published');
    assert.equal(detail.package.latestCandidate.candidateId, validated.candidate.candidateId);
    assert.equal(detail.package.latestCandidate.candidateHash, validated.candidate.candidateHash);
    assert.ok(detail.events.some((event) => event.eventType === 'package.approved'));
    assert.ok(detail.events.some((event) => (
      event.eventType === 'package.approved'
        && event.event.candidateHash === validated.candidate.candidateHash
    )));
    assert.ok(detail.events.some((event) => event.eventType === 'package.published'));

    const overviewResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/overview`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const overview = await readPayload(overviewResponse);
    assert.equal(overviewResponse.status, 200);
    assert.equal(overview.overview.latestRelease.releaseId, published.release.releaseId);
    assert.equal(overview.overview.actor.capabilities['content_operations.approve'], true);
    assert.equal(overview.overview.actor.capabilities['content_operations.publish'], true);
  } finally {
    server.close();
  }
});

test('content operations API resolves same-field package conflicts before approval', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const repository = createWorkerRepository({
      env: server.env,
      now: () => NOW,
    });
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'content-operations-api-conflict-test' },
    });
    const seeded = await readSeededSpellingContentBundle();
    const word = seeded.draft.words[0];
    const packageValue = `API package explanation for ${word.word}.`;
    const currentValue = `API current explanation for ${word.word}.`;
    const mergedValue = `API merged explanation for ${word.word}.`;

    const conflicted = await createPackage(server, { title: 'API conflicted package' });
    await appendWordExplanationOperation(server, conflicted.package.packageId, word, packageValue);

    const current = await createPackage(server, { title: 'API current package' });
    await appendWordExplanationOperation(server, current.package.packageId, word, currentValue);
    const currentCandidate = await validatePackage(server, current.package.packageId);
    await approvePackage(server, current.package.packageId, currentCandidate.candidate.candidateId);
    await publishPackage(server, current.package.packageId);

    const conflictedCandidate = await validatePackage(server, conflicted.package.packageId);
    assert.equal(conflictedCandidate.candidate.conflicts.length, 1);
    assert.equal(conflictedCandidate.candidate.conflicts[0].packageValue, packageValue);
    assert.equal(conflictedCandidate.candidate.conflicts[0].currentValue, currentValue);

    const resolved = await resolveConflict(server, conflicted.package.packageId, {
      conflictId: conflictedCandidate.candidate.conflicts[0].conflictId,
      resolution: 'edit',
      value: mergedValue,
    });
    assert.equal(resolved.operation.payload, mergedValue);
    assert.equal(resolved.candidate.conflicts.length, 0);
    assert.notEqual(resolved.candidate.candidateHash, conflictedCandidate.candidate.candidateHash);

    await approvePackage(server, conflicted.package.packageId, resolved.candidate.candidateId);
    const published = await publishPackage(server, conflicted.package.packageId, {
      includeSnapshot: true,
      proof: { source: 'content-operations-api-conflict-resolution-test' },
    });
    assert.equal(published.release.snapshot.draft.words.find((entry) => entry.slug === word.slug).explanation, mergedValue);
  } finally {
    server.close();
  }
});

test('content operations API rejects missing and stale conflict resolution requests', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const repository = createWorkerRepository({
      env: server.env,
      now: () => NOW,
    });
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'content-operations-api-stale-conflict-test' },
    });
    const seeded = await readSeededSpellingContentBundle();
    const word = seeded.draft.words[0];

    const conflicted = await createPackage(server, { title: 'API stale conflicted package' });
    await appendWordExplanationOperation(server, conflicted.package.packageId, word, `Stale package value for ${word.word}.`);

    const current = await createPackage(server, { title: 'API first current package' });
    await appendWordExplanationOperation(server, current.package.packageId, word, `First current value for ${word.word}.`);
    const currentCandidate = await validatePackage(server, current.package.packageId);
    await approvePackage(server, current.package.packageId, currentCandidate.candidate.candidateId);
    await publishPackage(server, current.package.packageId);

    const conflictedCandidate = await validatePackage(server, conflicted.package.packageId);
    const oldConflict = conflictedCandidate.candidate.conflicts[0];
    assert.ok(oldConflict.conflictId);

    const missingValueResponse = await resolveConflictResponse(server, conflicted.package.packageId, {
      conflictId: oldConflict.conflictId,
      resolution: 'edit',
    });
    const missingValue = await readPayload(missingValueResponse);
    assert.equal(missingValueResponse.status, 400);
    assert.equal(missingValue.code, 'content_operation_conflict_resolution_value_required');

    const newer = await createPackage(server, { title: 'API second current package' });
    await appendWordExplanationOperation(server, newer.package.packageId, word, `Second current value for ${word.word}.`);
    const newerCandidate = await validatePackage(server, newer.package.packageId);
    await approvePackage(server, newer.package.packageId, newerCandidate.candidate.candidateId);
    await publishPackage(server, newer.package.packageId);

    const staleResponse = await resolveConflictResponse(server, conflicted.package.packageId, {
      conflictId: oldConflict.conflictId,
      conflict: oldConflict,
      resolution: 'edit',
      value: `Stale merged value for ${word.word}.`,
    });
    const stalePayload = await readPayload(staleResponse);
    assert.equal(staleResponse.status, 404);
    assert.equal(stalePayload.code, 'content_operation_conflict_not_found');
    assert.equal(stalePayload.conflictId, oldConflict.conflictId);
  } finally {
    server.close();
  }
});

test('content operations API returns a structured first-release publish blocker', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const seeded = await readSeededSpellingContentBundle();
    const word = seeded.draft.words[0];
    const created = await createPackage(server, { title: 'Unseeded publish package' });
    const packageId = created.package.packageId;

    await appendWordExplanationOperation(
      server,
      packageId,
      word,
      `Unseeded API explanation for ${word.word}.`,
    );
    const validated = await validatePackage(server, packageId);
    await approvePackage(server, packageId, validated.candidate.candidateId);

    const publishResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${packageId}/publish`,
      jsonInit('POST', { proof: { source: 'unseeded-api-test' } }),
      adminHeaders(),
    );
    const payload = await readPayload(publishResponse);

    assert.equal(publishResponse.status, 409);
    assert.equal(payload.code, 'content_operation_first_release_required');
    assert.equal(payload.packageId, packageId);
  } finally {
    server.close();
  }
});

test('content operations API exposes stable blocker envelopes for later batch routes', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const created = await createPackage(server, { title: 'Audio scan package' });

    const response = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${created.package.packageId}/scan-audio`,
      jsonInit('POST', { requestId: 'scan-audio-api-test' }),
      adminHeaders(),
    );
    const payload = await readPayload(response);

    assert.equal(response.status, 501);
    assert.equal(payload.code, 'content_operation_route_not_implemented');
    assert.equal(payload.stub.action, 'scan-audio');
    assert.deepEqual(Object.keys(payload.blockers), [
      'validation',
      'conflicts',
      'audio',
      'assets',
      'rewards',
      'visibility',
      'exposure',
      'publishReadiness',
    ]);
    assert.deepEqual(payload.blockers.publishReadiness.blockers, ['route_not_implemented']);
  } finally {
    server.close();
  }
});
