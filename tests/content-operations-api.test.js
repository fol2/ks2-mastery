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

    const approved = await approvePackage(server, packageId, validated.candidate.candidateId);
    assert.equal(approved.approval.candidateId, validated.candidate.candidateId);
    assert.equal(approved.approval.approvedByAccountId, ADMIN_ID);

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
    assert.ok(detail.events.some((event) => event.eventType === 'package.approved'));
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
