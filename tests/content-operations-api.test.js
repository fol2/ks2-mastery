import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepository } from '../worker/src/repository.js';
import {
  readSeededSpellingContentBundle,
} from '../worker/src/generated-spelling-content-seed.js';
import {
  listContentOperationAudioJobs,
  reconcileContentOperationAudioJobs,
} from '../worker/src/content-operations/audio.js';
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

function geminiAudioResponse(bytes = [1, 2, 3, 4]) {
  return new Response(JSON.stringify({
    candidates: [{
      content: {
        parts: [{
          inlineData: {
            data: Buffer.from(bytes).toString('base64'),
            mimeType: 'audio/L16;rate=24000',
          },
        }],
      },
    }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function createMemoryR2Bucket() {
  const objects = new Map();
  return {
    gets: [],
    puts: [],
    async get(key) {
      this.gets.push(key);
      const entry = objects.get(key);
      if (!entry) return null;
      return {
        body: entry.bytes,
        httpMetadata: { contentType: entry.contentType },
        customMetadata: entry.customMetadata,
      };
    },
    async put(key, bytes, options = {}) {
      const storedBytes = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
      this.puts.push({ key, bytes: storedBytes, options });
      objects.set(key, {
        bytes: storedBytes,
        contentType: options.httpMetadata?.contentType || 'application/octet-stream',
        customMetadata: options.customMetadata || {},
      });
    },
  };
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

function seedUploadedAudioJobs(DB, {
  packageId,
  candidateId,
  items = [],
  accountId = ADMIN_ID,
  now = NOW,
  status = 'uploaded',
} = {}) {
  const requiredItems = items.filter((item) => item?.required !== false);
  const statement = DB.db.prepare(`
    INSERT INTO content_operation_audio_jobs (
      job_id,
      package_id,
      candidate_id,
      lane,
      entity_type,
      entity_id,
      voice_id,
      pace_id,
      model_id,
      profile_version,
      content_key,
      status,
      r2_key,
      error_json,
      requested_by_account_id,
      completed_at,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
  `);
  for (const [index, item] of requiredItems.entries()) {
    const lane = item.lane === 'sentence' ? 'sentence' : 'word';
    statement.run(
      `audio-job-${packageId}-${index}`,
      packageId,
      candidateId,
      lane,
      lane === 'sentence' ? 'spelling.sentenceEntry' : 'spelling.word',
      lane === 'sentence' ? item.sentenceId : item.slug,
      item.voiceId,
      item.paceId || item.speedId || 'natural',
      item.modelId,
      item.profileVersion,
      item.contentKey,
      status,
      item.r2Key,
      accountId,
      now + index,
      now + index,
    );
  }
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

test('content operation audio job listing returns the full package ledger by default', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    const packageId = 'copkg-audio-ledger-full';
    const statement = server.DB.db.prepare(`
      INSERT INTO content_operation_audio_jobs (
        job_id,
        package_id,
        candidate_id,
        lane,
        entity_type,
        entity_id,
        voice_id,
        pace_id,
        model_id,
        profile_version,
        content_key,
        status,
        r2_key,
        error_json,
        requested_by_account_id,
        completed_at,
        created_at
      )
      VALUES (?, ?, ?, 'word', 'spelling.word', ?, 'puck', 'natural', 'gemini-2.5-flash-preview-tts',
        'spelling-audio-profile-v1', ?, 'uploaded', ?, NULL, ?, ?, ?)
    `);
    for (let index = 0; index < 1005; index += 1) {
      statement.run(
        `audio-ledger-job-${index}`,
        packageId,
        'cocand-audio-ledger',
        `word-${index}`,
        `content-key-${index}`,
        `spelling/audio/word-${index}.wav`,
        ADMIN_ID,
        NOW + index,
        NOW + index,
      );
    }

    const jobs = await listContentOperationAudioJobs(server.DB, { packageId });
    assert.equal(jobs.length, 1005);
  } finally {
    server.close();
  }
});

test('content operations generate-audio uses TTS, stores R2 audio, and records authoritative provenance', async (t) => {
  const originalFetch = globalThis.fetch;
  const providerCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    providerCalls.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body),
    });
    return geminiAudioResponse();
  };
  const bucket = createMemoryR2Bucket();
  const server = createWorkerRepositoryServer({
    now: () => NOW,
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      SPELLING_AUDIO_BUCKET: bucket,
    },
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
    server.close();
  });

  seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
  const repository = createWorkerRepository({
    env: server.env,
    now: () => NOW,
  });
  await repository.seedFirstContentOperationRelease({
    seededByAccountId: ADMIN_ID,
    proof: { source: 'content-operations-api-generate-audio-test' },
  });

  const created = await createPackage(server, { title: 'Generate audio package' });
  const packageId = created.package.packageId;
  await appendContentOperation(server, packageId, {
    entityType: 'spelling.audioRequirementProfile',
    entityId: 'default',
    fieldPath: '',
    action: 'replace',
    payload: {
      wordProfiles: ['male.natural'],
      sentenceProfiles: [{ profileId: 'female.slow', required: false }],
    },
  });
  const validated = await validatePackage(server, packageId, { includeSnapshot: true });
  const target = validated.candidate.audioScan.items.find((item) => item.lane === 'word' && item.required);
  assert.ok(target, 'expected a required word audio item');

  const response = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/generate-audio`,
    jsonInit('POST', {
      candidateId: validated.candidate.candidateId,
      itemIds: [target.itemId],
      limit: 1,
    }),
    adminHeaders(),
  );
  const payload = await readPayload(response);
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.audio.summary.uploaded, 1);
  assert.equal(payload.audio.summary.failed, 0);
  assert.equal(providerCalls.length, 1);
  assert.match(providerCalls[0].url, /generativelanguage\.googleapis\.com/);
  assert.equal(providerCalls[0].headers['x-goog-api-key'], 'test-gemini-key');
  assert.equal(providerCalls[0].body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, target.voiceId);
  assert.equal(bucket.puts.length, 1);

  const row = server.DB.db.prepare(`
    SELECT *
    FROM content_operation_audio_jobs
    WHERE package_id = ?
  `).get(packageId);
  assert.equal(row.status, 'uploaded');
  assert.equal(row.r2_key, bucket.puts[0].key);
  assert.equal(row.requested_by_account_id, ADMIN_ID);
  assert.ok(row.idempotency_key.includes(target.contentKey));
  assert.equal(row.source_kind, 'content-operations-tts');
  assert.equal(row.attempt_count, 1);
  const provenance = JSON.parse(row.provenance_json);
  assert.equal(provenance.sourceIdentity, 'content-operations-tts');
  assert.equal(provenance.generatedByAccountId, ADMIN_ID);
  assert.equal(provenance.lane, target.lane);
  assert.equal(provenance.voiceId, target.voiceId);
  assert.equal(provenance.modelId, target.modelId);
  assert.equal(provenance.profileVersion, target.profileVersion);
  assert.equal(provenance.contentKey, target.contentKey);

  const refreshed = await validatePackage(server, packageId, { includeSnapshot: true });
  const refreshedItem = refreshed.candidate.audioScan.items.find((item) => item.itemId === target.itemId);
  assert.equal(refreshedItem.status, 'present');

  const duplicateResponse = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/generate-audio`,
    jsonInit('POST', {
      candidateId: refreshed.candidate.candidateId,
      itemIds: [target.itemId],
      limit: 1,
    }),
    adminHeaders(),
  );
  const duplicatePayload = await readPayload(duplicateResponse);
  assert.equal(duplicateResponse.status, 200);
  assert.equal(duplicatePayload.audio.summary.requested, 1);
  assert.equal(duplicatePayload.audio.summary.uploaded, 0);
  assert.equal(duplicatePayload.audio.summary.skippedExisting, 1);
  assert.deepEqual(duplicatePayload.audio.jobs, []);
  assert.equal(providerCalls.length, 1, 'idempotent duplicate should not call the provider again');
  const rowCount = server.DB.db.prepare(`
    SELECT COUNT(*) AS count
    FROM content_operation_audio_jobs
    WHERE package_id = ?
  `).get(packageId).count;
  assert.equal(rowCount, 1);

  const overrideResponse = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/generate-audio`,
    jsonInit('POST', {
      candidateId: refreshed.candidate.candidateId,
      itemIds: [target.itemId],
      limit: 1,
      override: true,
      reason: 'Refresh generated audio after editorial review.',
    }),
    adminHeaders(),
  );
  const overridePayload = await readPayload(overrideResponse);
  assert.equal(overrideResponse.status, 200);
  assert.equal(overridePayload.audio.summary.uploaded, 1);
  assert.equal(overridePayload.audio.summary.skippedExisting, 0);
  assert.equal(providerCalls.length, 2, 'override should bypass the cached R2 object and call the provider again');
  assert.equal(bucket.puts.length, 2, 'override should overwrite the R2 object through the approved storage path');
  const overrideRow = server.DB.db.prepare(`
    SELECT *
    FROM content_operation_audio_jobs
    WHERE package_id = ?
  `).get(packageId);
  assert.equal(overrideRow.attempt_count, 2);
  const overrideProvenance = JSON.parse(overrideRow.provenance_json);
  assert.equal(overrideProvenance.override, true);
  assert.equal(overrideProvenance.overrideReason, 'Refresh generated audio after editorial review.');
  const overrideRowCount = server.DB.db.prepare(`
    SELECT COUNT(*) AS count
    FROM content_operation_audio_jobs
    WHERE package_id = ?
  `).get(packageId).count;
  assert.equal(overrideRowCount, 1);

  const batchOverrideResponse = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/generate-audio`,
    jsonInit('POST', {
      limit: 1,
      override: true,
      reason: 'Refresh all generated audio after voice profile review.',
    }),
    adminHeaders(),
  );
  const batchOverridePayload = await readPayload(batchOverrideResponse);
  assert.equal(batchOverrideResponse.status, 200);
  assert.equal(batchOverridePayload.audio.summary.uploaded, 1);
  assert.equal(batchOverridePayload.audio.summary.skippedExisting, 0);
  assert.equal(providerCalls.length, 3, 'batch override should include present assets when itemIds are omitted');
  assert.equal(bucket.puts.length, 3);
  const batchOverrideRow = server.DB.db.prepare(`
    SELECT *
    FROM content_operation_audio_jobs
    WHERE package_id = ?
  `).get(packageId);
  assert.equal(batchOverrideRow.attempt_count, 3);
  const batchOverrideRowCount = server.DB.db.prepare(`
    SELECT COUNT(*) AS count
    FROM content_operation_audio_jobs
    WHERE package_id = ?
  `).get(packageId).count;
  assert.equal(batchOverrideRowCount, 1);
});

test('content operations audio override invalidates approval and records an audit event', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => geminiAudioResponse();
  const bucket = createMemoryR2Bucket();
  const server = createWorkerRepositoryServer({
    now: () => NOW,
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      SPELLING_AUDIO_BUCKET: bucket,
    },
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
    server.close();
  });

  seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
  const repository = createWorkerRepository({
    env: server.env,
    now: () => NOW,
  });
  await repository.seedFirstContentOperationRelease({
    seededByAccountId: ADMIN_ID,
    proof: { source: 'content-operations-api-override-invalidation-test' },
  });

  const seeded = await readSeededSpellingContentBundle();
  const word = seeded.draft.words[0];
  const created = await createPackage(server, { title: 'Override invalidates approval package' });
  const packageId = created.package.packageId;
  await appendContentOperation(server, packageId, {
    entityType: 'spelling.word',
    entityId: word.slug,
    fieldPath: 'word',
    action: 'set',
    payload: word.word,
  });

  const validated = await validatePackage(server, packageId, { includeSnapshot: true });
  seedUploadedAudioJobs(server.DB, {
    packageId,
    candidateId: validated.candidate.candidateId,
    items: validated.candidate.audioScan.items,
  });
  const revalidated = await validatePackage(server, packageId, { includeSnapshot: true });
  const approved = await approvePackage(server, packageId, revalidated.candidate.candidateId);
  assert.equal(approved.approval.candidateId, revalidated.candidate.candidateId);

  const target = revalidated.candidate.audioScan.items.find((item) => item.required !== false);
  assert.ok(target, 'expected a required audio item');
  const overrideResponse = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/generate-audio`,
    jsonInit('POST', {
      candidateId: revalidated.candidate.candidateId,
      itemIds: [target.itemId],
      limit: 1,
      override: true,
      reason: 'Replace clipped word audio after editorial review.',
    }),
    adminHeaders(),
  );
  const overridePayload = await readPayload(overrideResponse);
  assert.equal(overrideResponse.status, 200);
  assert.equal(overridePayload.audio.summary.uploaded, 1);

  const packageRow = server.DB.db.prepare(`
    SELECT state, approved_at
    FROM content_operation_packages
    WHERE package_id = ?
  `).get(packageId);
  assert.equal(packageRow.state, 'draft');
  assert.equal(packageRow.approved_at, null);
  const approvalCount = server.DB.db.prepare(`
    SELECT COUNT(*) AS count
    FROM content_operation_package_approvals
    WHERE package_id = ?
  `).get(packageId).count;
  assert.equal(approvalCount, 0);

  const publishResponse = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/publish`,
    jsonInit('POST', {
      proof: { source: 'content-operations-api-override-invalidation-test' },
    }),
    adminHeaders(),
  );
  const publishPayload = await readPayload(publishResponse);
  assert.equal(publishResponse.status, 409);
  assert.equal(publishPayload.code, 'content_operation_package_not_approved');

  const eventRow = server.DB.db.prepare(`
    SELECT event_type, event_json
    FROM content_operation_events
    WHERE package_id = ? AND event_type = 'audio.override'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(packageId);
  assert.equal(eventRow.event_type, 'audio.override');
  const event = JSON.parse(eventRow.event_json);
  assert.equal(event.reason, 'Replace clipped word audio after editorial review.');
  assert.equal(event.invalidatedApproval, true);
  assert.equal(event.candidateId, revalidated.candidate.candidateId);
});

test('content operations reconcile operator-script audio jobs into readiness scan', async (t) => {
  const server = createWorkerRepositoryServer({
    now: () => NOW,
  });
  t.after(() => server.close());

  seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
  const repository = createWorkerRepository({
    env: server.env,
    now: () => NOW,
  });
  await repository.seedFirstContentOperationRelease({
    seededByAccountId: ADMIN_ID,
    proof: { source: 'content-operations-api-audio-reconcile-test' },
  });

  const created = await createPackage(server, { title: 'Operator audio package' });
  const packageId = created.package.packageId;
  await appendContentOperation(server, packageId, {
    entityType: 'spelling.audioRequirementProfile',
    entityId: 'default',
    fieldPath: '',
    action: 'replace',
    payload: {
      wordProfiles: ['male.natural'],
      sentenceProfiles: [{ profileId: 'female.slow', required: false }],
    },
  });
  const validated = await validatePackage(server, packageId, { includeSnapshot: true });
  const target = validated.candidate.audioScan.items.find((item) => item.lane === 'word' && item.required);
  assert.ok(target, 'expected a required word audio item');

  const reconciliation = await reconcileContentOperationAudioJobs(server.DB, {
    packageId,
    candidateId: validated.candidate.candidateId,
    requestedByAccountId: ADMIN_ID,
    sourceKind: 'operator-script',
    now: NOW,
    entries: [{
      itemId: target.itemId,
      lane: target.lane,
      slug: target.slug,
      voiceId: target.voiceId,
      paceId: target.paceId,
      modelId: target.modelId,
      profileVersion: target.profileVersion,
      contentKey: target.contentKey,
      r2Key: target.r2Key,
      sourceIdentity: 'operator-script',
      generatedByAccountId: ADMIN_ID,
      generatedAt: NOW,
    }],
  });

  assert.equal(reconciliation.summary.uploaded, 1);
  assert.equal(reconciliation.jobs[0].sourceKind, 'operator-script');

  const row = server.DB.db.prepare(`
    SELECT *
    FROM content_operation_audio_jobs
    WHERE package_id = ?
  `).get(packageId);
  assert.equal(row.status, 'uploaded');
  assert.equal(row.r2_key, target.r2Key);
  assert.equal(row.source_kind, 'operator-script');
  const provenance = JSON.parse(row.provenance_json);
  assert.equal(provenance.sourceIdentity, 'operator-script');
  assert.equal(provenance.generatedByAccountId, ADMIN_ID);
  assert.equal(provenance.generatedAt, NOW);
  assert.equal(provenance.lane, 'word');
  assert.equal(provenance.voiceId, target.voiceId);
  assert.equal(provenance.paceId, target.paceId);
  assert.equal(provenance.modelId, target.modelId);
  assert.equal(provenance.profileVersion, target.profileVersion);
  assert.equal(provenance.r2Key, target.r2Key);

  await reconcileContentOperationAudioJobs(server.DB, {
    packageId,
    candidateId: validated.candidate.candidateId,
    requestedByAccountId: ADMIN_ID,
    sourceKind: 'operator-script',
    now: NOW + 1,
    entries: [{
      itemId: `word:${target.slug}:${target.voiceId}:${target.contentKey}`,
      lane: target.lane,
      slug: target.slug,
      voiceId: target.voiceId,
      paceId: target.paceId,
      modelId: target.modelId,
      profileVersion: target.profileVersion,
      contentKey: target.contentKey,
      r2Key: target.r2Key,
      sourceIdentity: 'operator-script',
      generatedByAccountId: ADMIN_ID,
      generatedAt: NOW + 1,
    }],
  });
  const rowCount = server.DB.db.prepare(`
    SELECT COUNT(*) AS count
    FROM content_operation_audio_jobs
    WHERE package_id = ?
  `).get(packageId).count;
  assert.equal(rowCount, 1);

  const refreshed = await validatePackage(server, packageId, { includeSnapshot: true });
  const refreshedItem = refreshed.candidate.audioScan.items.find((item) => item.itemId === target.itemId);
  assert.equal(refreshedItem.status, 'present');
});

test('content operations generate-audio records provider failures as retryable failed jobs', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), {
    status: 429,
    headers: { 'content-type': 'application/json' },
  });
  const server = createWorkerRepositoryServer({
    now: () => NOW,
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      SPELLING_AUDIO_BUCKET: createMemoryR2Bucket(),
    },
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
    server.close();
  });

  seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
  const repository = createWorkerRepository({
    env: server.env,
    now: () => NOW,
  });
  await repository.seedFirstContentOperationRelease({
    seededByAccountId: ADMIN_ID,
    proof: { source: 'content-operations-api-generate-audio-failure-test' },
  });

  const created = await createPackage(server, { title: 'Failed audio package' });
  const packageId = created.package.packageId;
  await appendContentOperation(server, packageId, {
    entityType: 'spelling.audioRequirementProfile',
    entityId: 'default',
    fieldPath: '',
    action: 'replace',
    payload: { wordProfiles: ['male.natural'] },
  });
  const validated = await validatePackage(server, packageId, { includeSnapshot: true });
  const target = validated.candidate.audioScan.items.find((item) => item.lane === 'word' && item.required);

  const response = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/generate-audio`,
    jsonInit('POST', {
      candidateId: validated.candidate.candidateId,
      itemIds: [target.itemId],
      limit: 1,
    }),
    adminHeaders(),
  );
  const payload = await readPayload(response);
  assert.equal(response.status, 200);
  assert.equal(payload.audio.summary.failed, 1);
  assert.equal(payload.audio.jobs[0].status, 'failed');

  const row = server.DB.db.prepare(`
    SELECT status, error_json, attempt_count
    FROM content_operation_audio_jobs
    WHERE package_id = ?
  `).get(packageId);
  assert.equal(row.status, 'failed');
  assert.equal(row.attempt_count, 1);
  const error = JSON.parse(row.error_json);
  assert.equal(error.provider, 'gemini');
  assert.equal(error.providerStatus, 429);

  const refreshed = await validatePackage(server, packageId, { includeSnapshot: true });
  const failedItem = refreshed.candidate.audioScan.items.find((item) => item.itemId === target.itemId);
  assert.equal(failedItem.status, 'failed');
  assert.equal(failedItem.error.providerStatus, 429);
});

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

    const blocked = await validatePackage(server, packageId);
    assert.equal(blocked.candidate.validation.status, 'passed');
    assert.equal(blocked.candidate.blockers.audio.status, 'blocked');

    seedUploadedAudioJobs(server.DB, {
      packageId,
      candidateId: blocked.candidate.candidateId,
      items: blocked.candidate.audioScan.items,
    });

    const validated = await validatePackage(server, packageId, { includeSnapshot: true });
    assert.equal(validated.candidate.validation.status, 'passed');
    assert.equal(validated.candidate.blockers.audio.status, 'passed');

    await approvePackage(server, packageId, validated.candidate.candidateId);
    server.DB.db.prepare(`
      UPDATE content_operation_audio_jobs
      SET status = 'failed', error_json = ?
      WHERE package_id = ?
        AND job_id = (
          SELECT job_id
          FROM content_operation_audio_jobs
          WHERE package_id = ?
          ORDER BY created_at ASC, job_id ASC
          LIMIT 1
        )
    `).run(JSON.stringify({ message: 'Regression guard failed.' }), packageId, packageId);

    const blockedPublishResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${packageId}/publish`,
      jsonInit('POST', {
        includeSnapshot: false,
        proof: { source: 'content-operations-api-linked-sentence-drift-test' },
      }),
      adminHeaders(),
    );
    const blockedPublishPayload = await readPayload(blockedPublishResponse);
    assert.equal(blockedPublishResponse.status, 409);
    assert.equal(blockedPublishPayload.code, 'content_operation_candidate_audio_blocked');
    assert.equal(blockedPublishPayload.audioScan.failedCount, 1);

    const persistedBlockedPublishRow = server.DB.db.prepare(`
      SELECT audio_scan_json
      FROM content_operation_package_candidates
      WHERE candidate_id = ?
    `).get(validated.candidate.candidateId);
    const persistedBlockedPublishScan = JSON.parse(persistedBlockedPublishRow.audio_scan_json);
    assert.equal(persistedBlockedPublishScan.failedCount, 1);

    server.DB.db.prepare(`
      UPDATE content_operation_audio_jobs
      SET status = 'uploaded', error_json = NULL
      WHERE package_id = ?
    `).run(packageId);

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

test('content operations API applies package-scoped audio requirement profiles to candidates', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const repository = createWorkerRepository({
      env: server.env,
      now: () => NOW,
    });
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'content-operations-api-audio-profile-test' },
    });

    const profile = {
      wordProfiles: ['male.natural'],
      sentenceProfiles: ['female.slow'],
    };
    const created = await createPackage(server, { title: 'Audio profile package' });
    const packageId = created.package.packageId;

    await appendContentOperation(server, packageId, {
      entityType: 'spelling.audioRequirementProfile',
      entityId: 'default',
      fieldPath: '',
      action: 'replace',
      payload: profile,
    });

    const validated = await validatePackage(server, packageId, { includeSnapshot: true });
    assert.equal(validated.candidate.validation.status, 'passed');
    assert.equal(validated.candidate.blockers.audio.status, 'blocked');
    assert.deepEqual(validated.candidate.audioScan.profile.wordProfiles.map((entry) => entry.profileId), ['male.natural']);
    assert.deepEqual(validated.candidate.audioScan.profile.sentenceProfiles.map((entry) => entry.profileId), ['female.slow']);
    assert.deepEqual(validated.candidate.candidate.draft.audioRequirementProfile, profile);
    assert.equal(
      validated.candidate.audioScan.totalRequired,
      validated.candidate.audioScan.lanes.word.totalRequired + validated.candidate.audioScan.lanes.sentence.totalRequired,
    );
  } finally {
    server.close();
  }
});

test('content operations API returns a content-operation envelope for unsupported audio profile ids', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const repository = createWorkerRepository({
      env: server.env,
      now: () => NOW,
    });
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'content-operations-api-invalid-audio-profile-test' },
    });

    const created = await createPackage(server, { title: 'Invalid audio profile package' });
    const packageId = created.package.packageId;
    await appendContentOperation(server, packageId, {
      entityType: 'spelling.audioRequirementProfile',
      entityId: 'secondary',
      fieldPath: '',
      action: 'replace',
      payload: { wordProfiles: ['male.natural'] },
    });

    const response = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${packageId}/validate`,
      jsonInit('POST', { includeSnapshot: true }),
      adminHeaders(),
    );
    const payload = await readPayload(response);
    assert.equal(response.status, 400);
    assert.equal(payload.code, 'content_operation_invalid');
    assert.match(payload.detail, /Unsupported audio requirement profile/);
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
      SET audio_scan_json = ?
      WHERE candidate_id = ?
    `).run(
      JSON.stringify({
        status: 'warning',
        blockers: [],
        warnings: ['slow_sentence_missing'],
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
    assert.deepEqual(packageSummary.blockers.audio.blockers, []);
    assert.deepEqual(packageSummary.blockers.audio.warnings, ['slow_sentence_missing']);

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
    assert.deepEqual(approvedSummary.blockers.audio.blockers, []);

    const publishResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${packageId}/publish`,
      jsonInit('POST', {
        proof: {
          source: 'content-operations-api-test',
          reviewer: ADMIN_ID,
          surfaces: {
            spellingSetup: { evidence: 'setup-smoke' },
            wordBank: { evidence: 'word-bank-smoke' },
          },
        },
      }),
      adminHeaders(),
    );
    const published = await readPayload(publishResponse);
    assert.equal(publishResponse.status, 200);
    assert.equal(published.release.packageId, packageId);
    assert.equal(published.release.publishedByAccountId, ADMIN_ID);
    assert.equal(published.release.history.approvedByAccountId, ADMIN_ID);
    assert.equal(published.release.history.publishedByAccountId, ADMIN_ID);
    assert.equal(published.release.history.changedEntities.operationCount, 1);
    assert.equal(published.release.history.changedEntities.entityCount, 1);
    assert.equal(published.release.history.changedEntities.entityTypes[0].entityType, 'spelling.word');
    assert.equal(published.release.history.changedEntities.preview[0].entityId, word.slug);
    assert.equal(published.release.history.changedEntities.preview[0].actions[0], 'set');
    assert.equal(published.release.history.changedEntities.preview[0].fields[0], 'explanation');
    assert.equal(published.release.history.productionProof.status, 'partial');
    assert.deepEqual(
      published.release.history.productionProof.missingSurfaces.map((entry) => entry.key).sort(),
      ['spellingSetup', 'wordBank'].sort(),
    );

    const capturedResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/releases/${published.release.releaseId}/proof`,
      jsonInit('POST', {
        proof: {
          source: 'content-operations-api-test',
          surfaces: {
            spellingSetup: { evidence: 'setup-smoke' },
            wordBank: { evidence: 'word-bank-smoke' },
          },
        },
      }),
      adminHeaders(),
    );
    const captured = await readPayload(capturedResponse);
    assert.equal(capturedResponse.status, 200);
    assert.equal(captured.release.history.productionProof.status, 'recorded');
    assert.equal(captured.release.history.productionProof.capturedByAccountId, ADMIN_ID);
    assert.deepEqual(
      captured.release.history.productionProof.linkedSurfaces.map((entry) => entry.key).sort(),
      ['spellingSetup', 'wordBank'].sort(),
    );

    const proofWithAssetChanges = {
      ...captured.release.proof,
      contentOperationsAssets: {
        assetSummary: {
          uploadCount: 1,
          hash: 'asset-proof-hash',
        },
        assetReferenceManifest: {
          referenceCount: 1,
          hash: 'asset-reference-proof-hash',
          references: [{
            assetUploadId: 'coasset-proof-1',
            referenceId: 'coref-proof-1',
            assetKind: 'monster-image',
            target: {
              monsterId: 'inklet',
              branchId: 'default',
              stageId: 'base',
            },
            validation: { status: 'passed' },
          }],
        },
      },
    };
    server.DB.db.prepare(`
      UPDATE content_operation_releases
      SET proof_json = ?
      WHERE release_id = ?
    `).run(JSON.stringify(proofWithAssetChanges), captured.release.releaseId);

    const capturedAssetProofResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/releases/${published.release.releaseId}/proof`,
      jsonInit('POST', {
        proof: {
          source: 'content-operations-api-test',
          surfaces: {
            spellingSetup: { evidence: 'setup-smoke' },
            wordBank: { evidence: 'word-bank-smoke' },
            monsterRendering: { evidence: 'monster-rendering-smoke' },
          },
        },
      }),
      adminHeaders(),
    );
    const capturedAssetProof = await readPayload(capturedAssetProofResponse);
    assert.equal(capturedAssetProofResponse.status, 200);
    assert.equal(capturedAssetProof.release.history.productionProof.status, 'recorded');
    assert.deepEqual(
      capturedAssetProof.release.history.productionProof.linkedSurfaces.map((entry) => entry.key).sort(),
      ['monsterRendering', 'spellingSetup', 'wordBank'].sort(),
    );

    const releaseDetailResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/releases/${published.release.releaseId}?includeSnapshot=true&includeHistory=true`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const releaseDetail = await readPayload(releaseDetailResponse);
    assert.equal(releaseDetailResponse.status, 200);
    assert.equal(
      releaseDetail.release.snapshot.draft.words.find((entry) => entry.slug === word.slug).explanation,
      explanation,
    );
    assert.equal(releaseDetail.release.history.package.title, 'API spelling edit package renamed');
    assert.equal(releaseDetail.release.history.approvedByAccountId, ADMIN_ID);
    assert.equal(releaseDetail.release.history.productionProof.status, 'recorded');
    assert.equal(releaseDetail.release.history.assetChanges.uploadCount, 1);
    assert.equal(releaseDetail.release.history.assetChanges.referenceCount, 1);
    assert.equal(releaseDetail.release.history.assetChanges.preview[0].monsterId, 'inklet');
    assert.equal(releaseDetail.release.history.assetChanges.preview[0].validationStatus, 'passed');

    const defaultReleaseDetailResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/releases/${published.release.releaseId}`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const defaultReleaseDetail = await readPayload(defaultReleaseDetailResponse);
    assert.equal(defaultReleaseDetailResponse.status, 200);
    assert.equal(defaultReleaseDetail.release.history, null);

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
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/overview?includeHistory=true`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const overview = await readPayload(overviewResponse);
    assert.equal(overviewResponse.status, 200);
    assert.equal(overview.overview.latestRelease.releaseId, published.release.releaseId);
    assert.equal(overview.overview.latestRelease.history.productionProof.status, 'recorded');
    assert.equal(overview.overview.lanes.recentReleases[0].history.changedEntities.preview[0].entityId, word.slug);
    assert.equal(overview.overview.actor.capabilities['content_operations.approve'], true);
    assert.equal(overview.overview.actor.capabilities['content_operations.publish'], true);

    const releaseListResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/releases?includeHistory=true`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const releaseList = await readPayload(releaseListResponse);
    assert.equal(releaseListResponse.status, 200);
    assert.equal(releaseList.releases[0].history.releaseId, captured.release.releaseId);
    assert.equal(releaseList.releases[0].history.productionProof.status, 'recorded');
    assert.equal(releaseList.releases[0].history.assetChanges.preview[0].monsterId, 'inklet');

    const defaultReleaseListResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/releases`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const defaultReleaseList = await readPayload(defaultReleaseListResponse);
    assert.equal(defaultReleaseListResponse.status, 200);
    assert.equal(defaultReleaseList.releases[0].history, null);

    const defaultOverviewResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/overview`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const defaultOverview = await readPayload(defaultOverviewResponse);
    assert.equal(defaultOverviewResponse.status, 200);
    assert.equal(defaultOverview.overview.latestRelease.history, null);
  } finally {
    server.close();
  }
});

test('content operations API requires Hero / Codex proof for hero exposure releases', async () => {
  let currentNow = NOW;
  const server = createWorkerRepositoryServer({ now: () => currentNow });
  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const repository = createWorkerRepository({
      env: server.env,
      now: () => NOW,
    });
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'content-operations-api-hero-proof-test' },
    });
    const seeded = await readSeededSpellingContentBundle();
    const rewardTrack = seeded.draft.rewardTracks[0];
    assert.ok(rewardTrack, 'seeded spelling content should include a reward track');

    const created = await createPackage(server, { title: 'Hero exposure proof package' });
    await appendContentOperation(server, created.package.packageId, {
      entityType: 'spelling.heroExposure',
      entityId: rewardTrack.id,
      fieldPath: '',
      action: 'upsert',
      payload: {
        state: 'scheduled',
        surfaces: ['heroQuest'],
        scheduledAt: NOW + 60_000,
        rolloutFlag: 'content-operations-api-hero-proof',
        previewAllowed: true,
      },
    });

    const validated = await validatePackage(server, created.package.packageId);
    assert.equal(validated.candidate.validation.status, 'passed');
    const approved = await approvePackage(server, created.package.packageId, validated.candidate.candidateId);
    assert.equal(approved.approval.approvedByAccountId, ADMIN_ID);

    const published = await publishPackage(server, created.package.packageId, {
      proof: {
        surfaces: {
          spellingSetup: { evidence: 'setup-smoke' },
          wordBank: { evidence: 'word-bank-smoke' },
        },
      },
    });
    assert.equal(published.release.history.productionProof.status, 'partial');
    assert.deepEqual(
      published.release.history.productionProof.missingSurfaces.map((entry) => entry.key).sort(),
      ['heroCodex', 'spellingSetup', 'wordBank'].sort(),
    );
    assert.equal(published.release.history.productionProof.activation.status, 'scheduled');
    assert.equal(published.release.history.productionProof.warnings.length, 0);
    assert.ok(
      published.release.history.changedEntities.preview.some((entry) => (
        entry.entityType === 'spelling.heroExposure'
          && entry.entityId === rewardTrack.id
      )),
    );

    currentNow = NOW + 60_000;
    const activatedDetailResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/releases/${published.release.releaseId}?includeHistory=true`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const activatedDetail = await readPayload(activatedDetailResponse);
    assert.equal(activatedDetailResponse.status, 200);
    assert.equal(activatedDetail.release.history.productionProof.activation.status, 'active');
    assert.ok(
      activatedDetail.release.history.productionProof.warnings.some((entry) => (
        entry.code === 'production_proof_missing_after_visibility_activation'
      )),
    );

    const capturedResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/releases/${published.release.releaseId}/proof`,
      jsonInit('POST', {
        proof: {
          surfaces: {
            spellingSetup: { evidence: 'setup-smoke' },
            wordBank: { evidence: 'word-bank-smoke' },
            heroCodex: { evidence: 'codex-and-hero-smoke' },
          },
        },
      }),
      adminHeaders(),
    );
    const captured = await readPayload(capturedResponse);
    assert.equal(capturedResponse.status, 200);
    assert.equal(captured.release.history.productionProof.status, 'recorded');
    assert.deepEqual(
      captured.release.history.productionProof.linkedSurfaces.map((entry) => entry.key).sort(),
      ['heroCodex', 'spellingSetup', 'wordBank'].sort(),
    );
    assert.equal(captured.release.history.productionProof.warnings.length, 0);
  } finally {
    server.close();
  }
});

test('content operations API requires Hero / Codex proof for field-level pool visibility releases', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const repository = createWorkerRepository({
      env: server.env,
      now: () => NOW,
    });
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'content-operations-api-pool-visibility-proof-test' },
    });

    const created = await createPackage(server, { title: 'Pool field visibility proof package' });
    await appendContentOperation(server, created.package.packageId, {
      entityType: 'spelling.pool',
      entityId: 'field-visibility-proof',
      fieldPath: '',
      action: 'upsert',
      payload: {
        id: 'field-visibility-proof',
        title: 'Field visibility proof',
        type: 'extension',
        sourceNote: 'Field-level visibility proof regression fixture.',
        provenance: { source: 'content-operations-api-test' },
      },
    });
    await appendContentOperation(server, created.package.packageId, {
      entityType: 'spelling.pool',
      entityId: 'field-visibility-proof',
      fieldPath: 'noRewardException.approved',
      action: 'set',
      payload: true,
    });
    await appendContentOperation(server, created.package.packageId, {
      entityType: 'spelling.pool',
      entityId: 'field-visibility-proof',
      fieldPath: 'noRewardException.reason',
      action: 'set',
      payload: 'Pool intentionally has no reward track while visibility proof is tested.',
    });
    await appendContentOperation(server, created.package.packageId, {
      entityType: 'spelling.pool',
      entityId: 'field-visibility-proof',
      fieldPath: 'visibility.state',
      action: 'set',
      payload: 'visible',
    });

    const validated = await validatePackage(server, created.package.packageId);
    assert.equal(validated.candidate.validation.status, 'passed');
    const approved = await approvePackage(server, created.package.packageId, validated.candidate.candidateId);
    assert.equal(approved.approval.approvedByAccountId, ADMIN_ID);

    const published = await publishPackage(server, created.package.packageId, {
      proof: {
        surfaces: {
          spellingSetup: { evidence: 'setup-smoke' },
          wordBank: { evidence: 'word-bank-smoke' },
        },
      },
    });
    assert.equal(published.release.history.productionProof.status, 'partial');
    assert.ok(
      published.release.history.productionProof.missingSurfaces.some((entry) => entry.key === 'heroCodex'),
      'field-level pool visibility changes must require Hero / Codex production proof',
    );
    assert.equal(published.release.history.productionProof.activation.status, 'active');
  } finally {
    server.close();
  }
});

test('content operations API blocks approval when affected sentence audio is missing', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const repository = createWorkerRepository({
      env: server.env,
      now: () => NOW,
    });
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'content-operations-api-audio-fallback-test' },
    });
    const seeded = await readSeededSpellingContentBundle();
    const word = seeded.draft.words.find((entry) => entry.sentenceEntryIds?.length);
    const sentenceId = word.sentenceEntryIds[0];
    const sentence = seeded.draft.sentences.find((entry) => entry.id === sentenceId);
    const created = await createPackage(server, { title: 'Sentence audio blocker package' });
    const packageId = created.package.packageId;

    await appendContentOperation(server, packageId, {
      entityType: 'spelling.sentenceEntry',
      entityId: sentenceId,
      fieldPath: 'text',
      action: 'set',
      payload: `${sentence.text} This edited sentence needs regenerated speech.`,
    });

    const validated = await validatePackage(server, packageId);
    assert.equal(validated.candidate.validation.status, 'passed');
    assert.equal(validated.candidate.blockers.audio.status, 'blocked');
    assert.ok(validated.candidate.blockers.audio.blockers.includes('sentence_audio_missing'));
    assert.equal(validated.candidate.audioScan.lanes.sentence.totalRequired, 4);

    server.DB.db.prepare(`
      UPDATE content_operation_package_candidates
      SET audio_scan_json = NULL
      WHERE candidate_id = ?
    `).run(validated.candidate.candidateId);

    const approveResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${packageId}/approve`,
      jsonInit('POST', {
        candidateId: validated.candidate.candidateId,
        notes: 'Audio has not been generated yet.',
      }),
      adminHeaders(),
    );
    const approvePayload = await readPayload(approveResponse);
    assert.equal(approveResponse.status, 409);
    assert.equal(approvePayload.code, 'content_operation_candidate_audio_blocked');
    assert.equal(approvePayload.audioScan.lanes.sentence.missingCount, 4);

    const persistedScanRow = server.DB.db.prepare(`
      SELECT audio_scan_json
      FROM content_operation_package_candidates
      WHERE candidate_id = ?
    `).get(validated.candidate.candidateId);
    const persistedScan = JSON.parse(persistedScanRow.audio_scan_json);
    assert.equal(persistedScan.lanes.sentence.missingCount, 4);

    const fallbackResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${packageId}/approve`,
      jsonInit('POST', {
        candidateId: validated.candidate.candidateId,
        notes: 'Attempt a temporary audio fallback.',
        audioFallback: { reason: 'Operator override requested.' },
      }),
      adminHeaders(),
    );
    const fallbackPayload = await readPayload(fallbackResponse);
    assert.equal(fallbackResponse.status, 200);
    assert.equal(fallbackPayload.approval.audioFallback.allowed, true);
    assert.equal(fallbackPayload.approval.audioFallback.reason, 'Operator override requested.');
    assert.equal(fallbackPayload.approval.audioFallback.approvedByAccountId, ADMIN_ID);
    assert.equal(fallbackPayload.approval.audioFallback.approvedAt, NOW);
    assert.equal(fallbackPayload.approval.audioFallback.affectedMatrix.affectedCount, 4);
    assert.equal(fallbackPayload.approval.audioFallback.affectedMatrix.lanes.sentence.affectedCount, 4);
    assert.equal(fallbackPayload.approval.audioFallback.notes, 'Attempt a temporary audio fallback.');

    const approvedScanRow = server.DB.db.prepare(`
      SELECT audio_scan_json
      FROM content_operation_package_candidates
      WHERE candidate_id = ?
    `).get(validated.candidate.candidateId);
    const approvedScan = JSON.parse(approvedScanRow.audio_scan_json);
    assert.equal(approvedScan.status, 'warning');
    assert.deepEqual(approvedScan.blockers, []);
    assert.ok(approvedScan.warnings.includes('audio_fallback_approved'));
    assert.ok(approvedScan.warnings.includes('sentence_audio_missing'));
    assert.equal(approvedScan.strictAudioReadiness.status, 'blocked');
    assert.equal(approvedScan.strictAudioReadiness.affectedCount, 4);
    assert.ok(approvedScan.strictAudioReadiness.blockers.includes('sentence_audio_missing'));

    const blockedPublishResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${packageId}/publish`,
      jsonInit('POST', {
        proof: {
          source: 'content-operations-api-audio-fallback-test',
          audioFallback: { allowed: true },
        },
      }),
      adminHeaders(),
    );
    const blockedPublishPayload = await readPayload(blockedPublishResponse);
    assert.equal(blockedPublishResponse.status, 400);
    assert.equal(blockedPublishPayload.code, 'content_operation_release_proof_reserved_key');

    const published = await publishPackage(server, packageId, {
      proof: { source: 'content-operations-api-audio-fallback-test' },
    });
    assert.equal(published.release.audioFallback.allowed, true);
    assert.equal(published.release.audioFallback.affectedMatrix.affectedCount, 4);
    assert.equal(published.release.audioWarnings.status, 'warning');
    assert.ok(published.release.audioWarnings.warnings.includes('audio_fallback_approved'));
    assert.equal(published.release.proof.contentOperationsAudio.audioFallback.allowed, true);
    assert.equal(published.release.proof.contentOperationsAudio.audioWarnings.status, 'warning');

    const releaseDetailResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/subjects/spelling/releases/${published.release.releaseId}`,
      { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
      adminHeaders(),
    );
    const releaseDetail = await readPayload(releaseDetailResponse);
    assert.equal(releaseDetailResponse.status, 200);
    assert.equal(releaseDetail.release.audioFallback.allowed, true);
    assert.equal(releaseDetail.release.audioWarnings.status, 'warning');
    assert.equal(releaseDetail.release.proof.contentOperationsAudio.audioFallback.allowed, true);
  } finally {
    server.close();
  }
});

test('content operations API rejects client-supplied fallback proof metadata', async () => {
  const server = createWorkerRepositoryServer({ now: () => NOW });
  try {
    seedAdultAccount(server.DB, { accountId: ADMIN_ID, platformRole: 'admin' });
    const repository = createWorkerRepository({
      env: server.env,
      now: () => NOW,
    });
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: ADMIN_ID,
      proof: { source: 'content-operations-api-proof-reserved-key-test' },
    });
    const seeded = await readSeededSpellingContentBundle();
    const word = seeded.draft.words[0];
    const created = await createPackage(server, { title: 'Proof reserved metadata package' });
    const packageId = created.package.packageId;

    await appendContentOperation(server, packageId, {
      entityType: 'spelling.word',
      entityId: word.slug,
      fieldPath: 'explanation',
      action: 'set',
      payload: `${word.explanation || 'Proof metadata guard.'} Reviewed editorial note.`,
    });

    const validated = await validatePackage(server, packageId);
    assert.equal(validated.candidate.validation.status, 'passed');
    await approvePackage(server, packageId, validated.candidate.candidateId);

    const publishResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${packageId}/publish`,
      jsonInit('POST', {
        proof: {
          source: 'content-operations-api-proof-reserved-key-test',
          audioFallback: { allowed: true, reason: 'Forged fallback proof.' },
        },
      }),
      adminHeaders(),
    );
    const publishPayload = await readPayload(publishResponse);
    assert.equal(publishResponse.status, 400);
    assert.equal(publishPayload.code, 'content_operation_release_proof_reserved_key');
    assert.deepEqual(publishPayload.reservedKeys, ['audioFallback']);

    const published = await publishPackage(server, packageId, {
      proof: { source: 'content-operations-api-proof-reserved-key-test' },
    });
    assert.equal(published.release.audioFallback, null);
    assert.equal(published.release.audioWarnings, null);
    assert.equal(Object.prototype.hasOwnProperty.call(published.release.proof, 'audioFallback'), false);
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
