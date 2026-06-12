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

async function appendContentOperation(server, packageId, operation) {
  const response = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/operations`,
    jsonInit('POST', { operation }),
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

test('content operations API exposes spelling browse and item detail with package draft overlays', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const repository = createWorkerRepository({
      env: server.env,
      now: () => NOW,
    });
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'content-operations-api-browse-test' },
    });
    const seeded = await readSeededSpellingContentBundle();
    const word = seeded.draft.words[0];
    const sentenceId = word.sentenceEntryIds[0];
    const explanation = `Browse package explanation for ${word.word}.`;

    const created = await createPackage(server, { title: 'Browse package' });
    const packageId = created.package.packageId;

    const candidateRequiredResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/browse?packageId=${packageId}&query=${word.slug}&limit=10`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const candidateRequiredPayload = await readPayload(candidateRequiredResponse);
    assert.equal(candidateRequiredResponse.status, 200);
    assert.equal(candidateRequiredPayload.browse.packageDraft.status, 'candidate_required');
    assert.equal(candidateRequiredPayload.browse.packageDraft.validation.status, 'candidate_required');
    assert.equal(candidateRequiredPayload.browse.packageDraft.validation.ok, false);
    const candidateRequiredRow = candidateRequiredPayload.browse.words.find((entry) => entry.slug === word.slug);
    assert.equal(candidateRequiredRow.validationState.status, 'candidate_required');
    assert.equal(candidateRequiredRow.validationState.ok, false);

    await appendWordExplanationOperation(server, packageId, word, explanation);
    const validated = await validatePackage(server, packageId);

    const browseResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/browse?packageId=${packageId}&query=${word.slug}&limit=10`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const browsePayload = await readPayload(browseResponse);
    assert.equal(browseResponse.status, 200);
    assert.equal(browsePayload.actor.capabilities['content_operations.view'], true);
    assert.equal(browsePayload.browse.packageDraft.status, 'available');
    assert.equal(browsePayload.browse.packageDraft.candidateId, validated.candidate.candidateId);
    const row = browsePayload.browse.words.find((entry) => entry.slug === word.slug);
    assert.equal(row.draftState, 'modified');
    assert.equal(row.family, word.family);
    assert.ok(row.audioReadiness.totalRequired >= 8);
    assert.equal(Object.prototype.hasOwnProperty.call(browsePayload.browse, 'snapshot'), false);

    const wordResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/words/${word.slug}?packageId=${packageId}`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const wordPayload = await readPayload(wordResponse);
    assert.equal(wordResponse.status, 200);
    assert.equal(wordPayload.detail.current.slug, word.slug);
    assert.equal(wordPayload.detail.packageValue.explanation, explanation);
    assert.equal(wordPayload.detail.draftState, 'modified');

    const sentenceResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/sentences/${sentenceId}?packageId=${packageId}`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const sentencePayload = await readPayload(sentenceResponse);
    assert.equal(sentenceResponse.status, 200);
    assert.equal(sentencePayload.detail.type, 'sentence');
    assert.equal(sentencePayload.detail.current.id, sentenceId);
    assert.equal(sentencePayload.detail.packageValue.id, sentenceId);

    await appendWordExplanationOperation(
      server,
      packageId,
      word,
      `A newer operation after validation for ${word.word}.`,
    );

    const staleBrowseResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/browse?packageId=${packageId}&query=${word.slug}&limit=10`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const staleBrowsePayload = await readPayload(staleBrowseResponse);
    assert.equal(staleBrowseResponse.status, 200);
    assert.equal(staleBrowsePayload.browse.packageDraft.status, 'stale_candidate');
    assert.deepEqual(staleBrowsePayload.browse.packageDraft.staleReasons, ['operations_stale']);
    const staleRow = staleBrowsePayload.browse.words.find((entry) => entry.slug === word.slug);
    assert.equal(staleRow.draftState, 'unchanged');
    assert.equal(staleRow.hasPackageDraft, false);
    assert.equal(staleRow.validationState.status, 'stale_candidate');

    const staleWordResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/words/${word.slug}?packageId=${packageId}`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const staleWordPayload = await readPayload(staleWordResponse);
    assert.equal(staleWordResponse.status, 200);
    assert.equal(staleWordPayload.detail.packageDraft.status, 'stale_candidate');
    assert.equal(staleWordPayload.detail.packageValue, null);
    assert.equal(staleWordPayload.detail.draftState, 'unchanged');

    const missingWordResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/words/not-a-real-word?packageId=${packageId}`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const missingWordPayload = await readPayload(missingWordResponse);
    assert.equal(missingWordResponse.status, 404);
    assert.equal(missingWordPayload.code, 'spelling_content_word_not_found');
    assert.equal(missingWordPayload.message, 'Spelling content word was not found.');

    const missingSentenceResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/sentences/not-a-real-sentence?packageId=${packageId}`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const missingSentencePayload = await readPayload(missingSentenceResponse);
    assert.equal(missingSentenceResponse.status, 404);
    assert.equal(missingSentencePayload.code, 'spelling_content_sentence_not_found');
    assert.equal(missingSentencePayload.message, 'Spelling content sentence was not found.');
  } finally {
    server.close();
  }
});

test('content operations API publishes linked sentence-entry operations through the package workflow', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const repository = createWorkerRepository({
      env: server.env,
      now: () => NOW,
    });
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'content-operations-api-sentence-test' },
    });
    const seeded = await readSeededSpellingContentBundle();
    const word = seeded.draft.words[0];
    const sentenceId = `${word.slug}-t11-api-sentence`;
    const sentenceText = `The ${word.word} sentence was added through content operations.`;

    const created = await createPackage(server, { title: 'API sentence package' });
    const packageId = created.package.packageId;

    await appendContentOperation(server, packageId, {
      entityType: 'spelling.sentenceEntry',
      entityId: sentenceId,
      fieldPath: '',
      action: 'upsert',
      payload: {
        id: sentenceId,
        wordSlug: word.slug,
        text: sentenceText,
        variantLabel: 'default',
        tags: ['api-test'],
        sourceNote: 'Added by content operations API test.',
        provenance: { source: 'api-test', note: 'T11 linked sentence' },
      },
    });
    await appendContentOperation(server, packageId, {
      entityType: 'spelling.word',
      entityId: word.slug,
      fieldPath: 'sentenceEntryIds',
      action: 'set',
      payload: [...word.sentenceEntryIds, sentenceId],
    });

    const validated = await validatePackage(server, packageId);
    assert.equal(validated.candidate.validation.status, 'passed');

    await approvePackage(server, packageId, validated.candidate.candidateId);
    const published = await publishPackage(server, packageId, {
      includeSnapshot: true,
      proof: { source: 'content-operations-api-linked-sentence-test' },
    });
    const publishedWord = published.release.snapshot.draft.words.find((entry) => entry.slug === word.slug);
    const publishedSentence = published.release.snapshot.draft.sentences.find((entry) => entry.id === sentenceId);

    assert.ok(publishedWord.sentenceEntryIds.includes(sentenceId));
    assert.equal(publishedSentence.text, sentenceText);
    assert.equal(publishedSentence.wordSlug, word.slug);
  } finally {
    server.close();
  }
});

test('content operations API validates package-scoped pool metadata operations', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const repository = createWorkerRepository({
      env: server.env,
      now: () => NOW,
    });
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'content-operations-api-pool-test' },
    });

    const hiddenPackage = await createPackage(server, { title: 'Create hidden pool package' });
    await appendContentOperation(server, hiddenPackage.package.packageId, {
      entityType: 'spelling.pool',
      entityId: 'secure-vocabulary',
      fieldPath: '',
      action: 'upsert',
      payload: {
        id: 'secure-vocabulary',
        title: 'Secure vocabulary',
        type: 'extension',
        visibility: { state: 'hidden' },
        sourceNote: 'Created by content operations API test.',
        provenance: { source: 'content-operations-api-test' },
      },
    });
    const hiddenValidated = await validatePackage(server, hiddenPackage.package.packageId, { includeSnapshot: true });
    const hiddenPool = hiddenValidated.candidate.candidate.draft.pools.find((entry) => entry.id === 'secure-vocabulary');
    assert.equal(hiddenValidated.candidate.validation.status, 'passed');
    assert.equal(hiddenPool.type, 'extension');
    assert.equal(hiddenPool.visibility.state, 'hidden');

    const exceptionPackage = await createPackage(server, { title: 'Create visible no-reward exception pool package' });
    await appendContentOperation(server, exceptionPackage.package.packageId, {
      entityType: 'spelling.pool',
      entityId: 'secure-visible-exception',
      fieldPath: '',
      action: 'upsert',
      payload: {
        id: 'secure-visible-exception',
        title: 'Secure visible exception',
        type: 'extension',
        visibility: { state: 'visible' },
        noRewardException: { approved: true, reason: 'Temporary editorial exception.' },
        sourceNote: 'Created by content operations API test.',
        provenance: { source: 'content-operations-api-test' },
      },
    });
    const exceptionValidated = await validatePackage(server, exceptionPackage.package.packageId, { includeSnapshot: true });
    const exceptionPool = exceptionValidated.candidate.candidate.draft.pools.find((entry) => entry.id === 'secure-visible-exception');
    assert.equal(exceptionValidated.candidate.validation.status, 'passed');
    assert.equal(exceptionPool.noRewardException.approved, true);

    const rewardPackage = await createPackage(server, { title: 'Create visible rewarded pool package' });
    await appendContentOperation(server, rewardPackage.package.packageId, {
      entityType: 'spelling.pool',
      entityId: 'secure-rewarded',
      fieldPath: '',
      action: 'upsert',
      payload: {
        id: 'secure-rewarded',
        title: 'Secure rewarded',
        type: 'extension',
        visibility: { state: 'visible' },
        rewardTrack: { id: 'secure-reward-track', approved: true, source: 'content-operations-api-test' },
        sourceNote: 'Created by content operations API test.',
        provenance: { source: 'content-operations-api-test' },
      },
    });
    const rewardValidated = await validatePackage(server, rewardPackage.package.packageId, { includeSnapshot: true });
    const rewardPool = rewardValidated.candidate.candidate.draft.pools.find((entry) => entry.id === 'secure-rewarded');
    assert.equal(rewardValidated.candidate.validation.status, 'passed');
    assert.equal(rewardPool.rewardTrack.approved, true);

    const visiblePackage = await createPackage(server, { title: 'Create visible pool package' });
    await appendContentOperation(server, visiblePackage.package.packageId, {
      entityType: 'spelling.pool',
      entityId: 'secure-visible',
      fieldPath: '',
      action: 'upsert',
      payload: {
        id: 'secure-visible',
        title: 'Secure visible',
        type: 'extension',
        visibility: { state: 'visible' },
        sourceNote: 'Created by content operations API test.',
        provenance: { source: 'content-operations-api-test' },
      },
    });
    const visibleValidated = await validatePackage(server, visiblePackage.package.packageId);
    assert.equal(visibleValidated.candidate.validation.status, 'blocked');
    assert.ok(visibleValidated.candidate.validation.errors.some((entry) => entry.code === 'pool_reward_required'));
  } finally {
    server.close();
  }
});

test('content operations API blocks referenced sentence and active word-list retirements', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const repository = createWorkerRepository({
      env: server.env,
      now: () => NOW,
    });
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'content-operations-api-retirement-test' },
    });
    const seeded = await readSeededSpellingContentBundle();
    const baseWord = seeded.draft.words.find((entry) => entry.sentenceEntryIds.length);
    const variantWord = seeded.draft.words.find((entry) => entry.variants?.some((variant) => variant.sentenceEntryIds?.length));
    const variantSentenceId = variantWord?.variants?.find((variant) => variant.sentenceEntryIds?.length)?.sentenceEntryIds[0];
    assert.ok(baseWord, 'seeded spelling content should include a base sentence reference');
    assert.ok(variantWord, 'seeded spelling content should include a variant sentence reference');
    assert.ok(variantSentenceId, 'seeded variant should include a sentence reference');

    const sentencePackage = await createPackage(server, { title: 'Retire referenced sentence package' });
    await appendContentOperation(server, sentencePackage.package.packageId, {
      entityType: 'spelling.sentenceEntry',
      entityId: baseWord.sentenceEntryIds[0],
      fieldPath: '',
      action: 'retire',
      payload: {
        reason: 'API test retirement should be blocked.',
        source: 'content-operations-api-test',
        retiredAt: NOW,
      },
    });
    await appendContentOperation(server, sentencePackage.package.packageId, {
      entityType: 'spelling.sentenceEntry',
      entityId: variantSentenceId,
      fieldPath: '',
      action: 'retire',
      payload: {
        reason: 'API test variant retirement should be blocked.',
        source: 'content-operations-api-test',
        retiredAt: NOW,
      },
    });
    const sentenceValidated = await validatePackage(server, sentencePackage.package.packageId);
    assert.equal(sentenceValidated.candidate.validation.status, 'blocked');
    assert.ok(sentenceValidated.candidate.validation.errors.some((entry) => entry.code === 'retired_sentence_reference'));
    assert.ok(sentenceValidated.candidate.validation.errors.some((entry) => (
      entry.code === 'retired_sentence_reference' && entry.path.includes('variants')
    )));

    const listPackage = await createPackage(server, { title: 'Retire active word-list package' });
    await appendContentOperation(server, listPackage.package.packageId, {
      entityType: 'spelling.wordList',
      entityId: baseWord.listId,
      fieldPath: '',
      action: 'retire',
      payload: {
        reason: 'API test list retirement should be blocked.',
        source: 'content-operations-api-test',
        retiredAt: NOW,
      },
    });
    const listValidated = await validatePackage(server, listPackage.package.packageId);
    assert.equal(listValidated.candidate.validation.status, 'blocked');
    assert.ok(listValidated.candidate.validation.errors.some((entry) => entry.code === 'retired_word_list_reference'));
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
