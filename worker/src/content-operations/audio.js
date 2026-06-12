import {
  scanSpellingAudioReadiness,
} from '../../../src/subjects/spelling/content/audio-readiness.js';
import {
  uid,
} from '../../../src/platform/core/utils.js';
import {
  generateBufferedSpellingAudio,
} from '../tts.js';
import {
  all,
  batch,
  bindStatement,
  first,
  run,
} from '../d1.js';
import {
  BadRequestError,
} from '../errors.js';

const CONTENT_OPERATION_AUDIO_SOURCE_KIND = 'content-operations-tts';
const DEFAULT_AUDIO_GENERATION_LIMIT = 5;
const MAX_AUDIO_GENERATION_LIMIT = 25;
const GENERATABLE_AUDIO_STATUSES = new Set([
  'missing',
  'stale',
  'generated',
  'failed',
  'skipped',
  'override_requested',
]);

function normaliseString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function audioJobRowToRecord(row) {
  if (!row) return null;
  return {
    jobId: row.job_id,
    packageId: row.package_id || null,
    candidateId: row.candidate_id || null,
    lane: row.lane,
    entityType: row.entity_type,
    entityId: row.entity_id,
    voiceId: row.voice_id,
    paceId: row.pace_id,
    modelId: row.model_id,
    profileVersion: row.profile_version,
    contentKey: row.content_key,
    status: row.status,
    r2Key: row.r2_key || '',
    error: parseJson(row.error_json, null),
    idempotencyKey: row.idempotency_key || '',
    sourceKind: row.source_kind || '',
    provenance: parseJson(row.provenance_json, null),
    attemptCount: Number(row.attempt_count) || 0,
    requestedByAccountId: row.requested_by_account_id,
    completedAt: row.completed_at == null ? null : Number(row.completed_at),
    createdAt: Number(row.created_at) || 0,
    updatedAt: row.updated_at == null ? null : Number(row.updated_at),
  };
}

export async function listContentOperationAudioJobs(db, {
  packageId = '',
  limit = null,
} = {}) {
  const safePackageId = normaliseString(packageId);
  if (!safePackageId) return [];
  const safeLimit = Number(limit);
  const hasLimit = Number.isFinite(safeLimit) && safeLimit > 0;
  const rows = await all(db, `
    SELECT *
    FROM content_operation_audio_jobs
    WHERE package_id = ?
    ORDER BY created_at DESC, job_id DESC
    ${hasLimit ? 'LIMIT ?' : ''}
  `, hasLimit ? [safePackageId, Math.floor(safeLimit)] : [safePackageId]);
  return rows.map(audioJobRowToRecord).filter(Boolean);
}

export async function buildContentOperationAudioScan({
  db,
  packageId = '',
  candidate,
  operations = [],
  profile = null,
  inventory = [],
} = {}) {
  const jobs = await listContentOperationAudioJobs(db, { packageId });
  return scanSpellingAudioReadiness(candidate, {
    operations,
    profile: profile || candidate?.draft?.audioRequirementProfile || null,
    inventory,
    jobs,
    scope: 'affected',
  });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normaliseLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_AUDIO_GENERATION_LIMIT;
  return Math.min(MAX_AUDIO_GENERATION_LIMIT, Math.max(1, Math.floor(parsed)));
}

function audioJobIdempotencyKey({
  packageId,
  item,
  action = 'generate',
} = {}) {
  return [
    'content-operation-audio',
    normaliseString(packageId),
    normaliseString(action, 'generate'),
    normaliseString(item?.lane),
    normaliseString(item?.profileVersion),
    normaliseString(item?.modelId),
    normaliseString(item?.voiceId),
    normaliseString(item?.paceId || item?.speedId),
    normaliseString(item?.contentKey),
  ].join('|');
}

function entityTypeForAudioItem(item) {
  return item?.lane === 'sentence' ? 'spelling.sentenceEntry' : 'spelling.word';
}

function entityIdForAudioItem(item) {
  return item?.lane === 'sentence'
    ? normaliseString(item?.sentenceId)
    : normaliseString(item?.slug);
}

function audioPayloadForItem(item, accountId) {
  if (item?.lane === 'word') {
    return {
      accountId,
      slug: item.slug,
      word: item.word,
      transcript: item.word,
      wordOnly: true,
      bufferedGeminiVoice: item.voiceId,
    };
  }
  return {
    accountId,
    slug: item.slug,
    word: item.word,
    sentence: item.sentence,
    sentenceIndex: item.sentenceIndex,
    slow: Boolean(item.slow),
    bufferedGeminiVoice: item.voiceId,
  };
}

function serialisableError(error) {
  return {
    name: normaliseString(error?.name, 'Error'),
    message: normaliseString(error?.message || error, 'Audio generation failed.'),
    ...(normaliseString(error?.provider) ? { provider: normaliseString(error.provider) } : {}),
    ...(Number.isFinite(Number(error?.providerStatus)) ? { providerStatus: Number(error.providerStatus) } : {}),
    ...(Number.isFinite(Number(error?.status)) ? { status: Number(error.status) } : {}),
    ...(normaliseString(error?.extra?.code || error?.code) ? { code: normaliseString(error?.extra?.code || error?.code) } : {}),
    ...(error?.timedOut || error?.extra?.providerTimedOut ? { providerTimedOut: true } : {}),
    retryable: true,
  };
}

function provenanceForItem({
  item,
  packageId,
  candidateId,
  accountId,
  now,
  r2Key = '',
  cacheState = '',
  override = false,
  overrideReason = '',
  status = '',
} = {}) {
  return {
    sourceIdentity: CONTENT_OPERATION_AUDIO_SOURCE_KIND,
    generatedByAccountId: accountId,
    generatedAt: now,
    packageId,
    candidateId: candidateId || null,
    itemId: item.itemId,
    lane: item.lane,
    entityType: entityTypeForAudioItem(item),
    entityId: entityIdForAudioItem(item),
    slug: item.slug,
    sentenceId: item.sentenceId || null,
    voiceId: item.voiceId,
    paceId: item.paceId,
    speedId: item.speedId,
    modelId: item.modelId,
    profileVersion: item.profileVersion,
    contentKey: item.contentKey,
    r2Key,
    cacheState,
    status,
    override,
    overrideReason: override ? overrideReason : '',
  };
}

async function readAudioJobByIdempotencyKey(db, idempotencyKey) {
  if (!idempotencyKey) return null;
  const row = await first(db, `
    SELECT *
    FROM content_operation_audio_jobs
    WHERE idempotency_key = ?
    LIMIT 1
  `, [idempotencyKey]);
  return audioJobRowToRecord(row);
}

async function claimAudioJob(db, {
  packageId,
  candidateId,
  item,
  accountId,
  now,
  override = false,
  overrideReason = '',
} = {}) {
  const idempotencyKey = audioJobIdempotencyKey({ packageId, candidateId, item, action: 'generate' });
  const existing = await readAudioJobByIdempotencyKey(db, idempotencyKey);
  if (existing?.status === 'uploaded' && !override) {
    return { skippedExisting: true, job: existing };
  }

  const provenance = provenanceForItem({
    item,
    packageId,
    candidateId,
    accountId,
    now,
    override,
    overrideReason,
    status: 'queued',
  });
  if (existing) {
    await run(db, `
      UPDATE content_operation_audio_jobs
      SET
        candidate_id = ?,
        status = 'queued',
        error_json = NULL,
        requested_by_account_id = ?,
        completed_at = NULL,
        source_kind = ?,
        provenance_json = ?,
        updated_at = ?
      WHERE idempotency_key = ?
    `, [
      candidateId || null,
      accountId,
      CONTENT_OPERATION_AUDIO_SOURCE_KIND,
      JSON.stringify(provenance),
      now,
      idempotencyKey,
    ]);
    return { skippedExisting: false, job: await readAudioJobByIdempotencyKey(db, idempotencyKey) };
  }

  const jobId = uid('coaud');
  await run(db, `
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
      created_at,
      idempotency_key,
      source_kind,
      provenance_json,
      attempt_count,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', NULL, NULL, ?, NULL, ?, ?, ?, ?, 0, ?)
  `, [
    jobId,
    packageId,
    candidateId || null,
    item.lane,
    entityTypeForAudioItem(item),
    entityIdForAudioItem(item),
    item.voiceId,
    item.paceId || item.speedId || 'natural',
    item.modelId,
    item.profileVersion,
    item.contentKey,
    accountId,
    now,
    idempotencyKey,
    CONTENT_OPERATION_AUDIO_SOURCE_KIND,
    JSON.stringify(provenance),
    now,
  ]);
  return { skippedExisting: false, job: await readAudioJobByIdempotencyKey(db, idempotencyKey) };
}

async function markAudioJobUploaded(db, {
  idempotencyKey,
  item,
  packageId,
  candidateId,
  accountId,
  now,
  result,
  override = false,
  overrideReason = '',
} = {}) {
  const provenance = provenanceForItem({
    item,
    packageId,
    candidateId,
    accountId,
    now,
    r2Key: result.key,
    cacheState: result.cacheState,
    override,
    overrideReason,
    status: 'uploaded',
  });
  await run(db, `
    UPDATE content_operation_audio_jobs
    SET
      status = 'uploaded',
      r2_key = ?,
      error_json = NULL,
      completed_at = ?,
      source_kind = ?,
      provenance_json = ?,
      attempt_count = attempt_count + 1,
      updated_at = ?
    WHERE idempotency_key = ?
  `, [
    result.key,
    now,
    CONTENT_OPERATION_AUDIO_SOURCE_KIND,
    JSON.stringify(provenance),
    now,
    idempotencyKey,
  ]);
  return readAudioJobByIdempotencyKey(db, idempotencyKey);
}

async function markAudioJobFailed(db, {
  idempotencyKey,
  item,
  packageId,
  candidateId,
  accountId,
  now,
  error,
  override = false,
  overrideReason = '',
} = {}) {
  const errorRecord = serialisableError(error);
  const provenance = provenanceForItem({
    item,
    packageId,
    candidateId,
    accountId,
    now,
    override,
    overrideReason,
    status: 'failed',
  });
  await run(db, `
    UPDATE content_operation_audio_jobs
    SET
      status = 'failed',
      error_json = ?,
      completed_at = ?,
      source_kind = ?,
      provenance_json = ?,
      attempt_count = attempt_count + 1,
      updated_at = ?
    WHERE idempotency_key = ?
  `, [
    JSON.stringify(errorRecord),
    now,
    CONTENT_OPERATION_AUDIO_SOURCE_KIND,
    JSON.stringify(provenance),
    now,
    idempotencyKey,
  ]);
  return readAudioJobByIdempotencyKey(db, idempotencyKey);
}

function selectAudioItemsForGeneration(scan, {
  itemIds = [],
  limit = DEFAULT_AUDIO_GENERATION_LIMIT,
  override = false,
} = {}) {
  const requestedIds = new Set(asArray(itemIds).map((value) => normaliseString(value)).filter(Boolean));
  const requiredItems = asArray(scan?.items).filter((item) => item?.required !== false);
  const scoped = requestedIds.size
    ? requiredItems.filter((item) => requestedIds.has(item.itemId))
    : override
      ? requiredItems
      : requiredItems.filter((item) => GENERATABLE_AUDIO_STATUSES.has(item.status));
  if (requestedIds.size) {
    const found = new Set(scoped.map((item) => item.itemId));
    const missing = [...requestedIds].filter((itemId) => !found.has(itemId));
    if (missing.length) {
      throw new BadRequestError('Requested content operation audio item was not found.', {
        code: 'content_operation_audio_item_not_found',
        itemIds: missing,
      });
    }
  }
  const generatable = (override || requestedIds.size)
    ? scoped
    : scoped.filter((item) => GENERATABLE_AUDIO_STATUSES.has(item.status));
  return {
    selected: generatable.slice(0, limit),
    skippedDueLimit: Math.max(0, generatable.length - limit),
    skippedPresent: requestedIds.size ? 0 : scoped.length - generatable.length,
  };
}

function summariseGeneratedJobs(jobs, {
  skippedExisting = 0,
  skippedPresent = 0,
  skippedDueLimit = 0,
} = {}) {
  const summary = {
    requested: jobs.length + skippedExisting + skippedPresent + skippedDueLimit,
    uploaded: 0,
    failed: 0,
    queued: 0,
    skippedExisting,
    skippedPresent,
    skippedDueLimit,
  };
  for (const job of jobs) {
    if (job.status === 'uploaded') summary.uploaded += 1;
    else if (job.status === 'failed') summary.failed += 1;
    else if (job.status === 'queued') summary.queued += 1;
  }
  return summary;
}

export async function generateContentOperationPackageAudio({
  db,
  env,
  packageId,
  candidate,
  candidateId,
  requestedByAccountId,
  itemIds = [],
  limit = DEFAULT_AUDIO_GENERATION_LIMIT,
  override = false,
  overrideReason = '',
  fetchFn = fetch,
  now = Date.now(),
} = {}) {
  const safePackageId = normaliseString(packageId);
  const safeCandidateId = normaliseString(candidateId || candidate?.candidateId);
  const accountId = normaliseString(requestedByAccountId);
  if (!safePackageId) {
    throw new BadRequestError('Content operation audio generation requires a package id.', {
      code: 'content_operation_package_id_required',
    });
  }
  if (!accountId) {
    throw new BadRequestError('Content operation audio generation requires an account id.', {
      code: 'content_operation_audio_account_required',
      packageId: safePackageId,
    });
  }
  if (override && !normaliseString(overrideReason)) {
    throw new BadRequestError('Content operation audio override requires a reason.', {
      code: 'content_operation_audio_override_reason_required',
      packageId: safePackageId,
    });
  }
  const safeLimit = normaliseLimit(limit);
  const scan = candidate?.audioScan || await buildContentOperationAudioScan({
    db,
    packageId: safePackageId,
    candidate: candidate?.candidate || candidate,
    operations: [],
  });
  const selection = selectAudioItemsForGeneration(scan, {
    itemIds,
    limit: safeLimit,
    override,
  });
  const jobs = [];
  let skippedExisting = 0;

  for (const item of selection.selected) {
    const claim = await claimAudioJob(db, {
      packageId: safePackageId,
      candidateId: safeCandidateId,
      item,
      accountId,
      now,
      override,
      overrideReason,
    });
    if (claim.skippedExisting) {
      skippedExisting += 1;
      continue;
    }
    const idempotencyKey = claim.job.idempotencyKey;
    try {
      const result = await generateBufferedSpellingAudio({
        env,
        accountId,
        model: item.modelId,
        voice: item.voiceId,
        payload: audioPayloadForItem(item, accountId),
        force: override,
        fetchFn,
      });
      jobs.push(await markAudioJobUploaded(db, {
        idempotencyKey,
        item,
        packageId: safePackageId,
        candidateId: safeCandidateId,
        accountId,
        now,
        result,
        override,
        overrideReason,
      }));
    } catch (error) {
      jobs.push(await markAudioJobFailed(db, {
        idempotencyKey,
        item,
        packageId: safePackageId,
        candidateId: safeCandidateId,
        accountId,
        now,
        error,
        override,
        overrideReason,
      }));
    }
  }

  return {
    packageId: safePackageId,
    candidateId: safeCandidateId || null,
    sourceKind: CONTENT_OPERATION_AUDIO_SOURCE_KIND,
    limit: safeLimit,
    summary: summariseGeneratedJobs(jobs, {
      skippedExisting,
      skippedPresent: selection.skippedPresent,
      skippedDueLimit: selection.skippedDueLimit,
    }),
    jobs,
  };
}

export async function reconcileContentOperationAudioJobs(db, {
  packageId,
  candidateId = '',
  requestedByAccountId,
  entries = [],
  sourceKind = 'operator-script',
  now = Date.now(),
} = {}) {
  const safePackageId = normaliseString(packageId);
  const accountId = normaliseString(requestedByAccountId);
  if (!safePackageId || !accountId) {
    throw new BadRequestError('Content operation audio reconciliation requires a package id and account id.', {
      code: 'content_operation_audio_reconcile_invalid',
      packageId: safePackageId,
    });
  }
  const statements = [];
  const jobs = [];
  for (const entry of asArray(entries)) {
    const item = {
      itemId: normaliseString(entry.itemId || `${entry.lane || 'word'}:${entry.slug || entry.entityId}:${entry.voiceId || entry.voice}:${entry.contentKey}`),
      lane: normaliseString(entry.lane, 'word'),
      slug: normaliseString(entry.slug || entry.entityId),
      sentenceId: normaliseString(entry.sentenceId || entry.entityId),
      voiceId: normaliseString(entry.voiceId || entry.voice),
      paceId: normaliseString(entry.paceId || entry.speedId || entry.speed, entry.lane === 'sentence' ? 'standard' : 'natural'),
      speedId: normaliseString(entry.speedId || entry.speed),
      modelId: normaliseString(entry.modelId || entry.model),
      profileVersion: normaliseString(entry.profileVersion || entry.profile_version),
      contentKey: normaliseString(entry.contentKey || entry.content_key),
      r2Key: normaliseString(entry.r2Key || entry.r2_key || entry.key),
    };
    if (!item.contentKey || !item.r2Key || !item.voiceId || !item.modelId || !item.profileVersion) continue;
    const idempotencyKey = audioJobIdempotencyKey({
      packageId: safePackageId,
      candidateId,
      item,
      action: 'generate',
    });
    const provenance = {
      sourceIdentity: normaliseString(entry.sourceIdentity || entry.source_identity, sourceKind),
      reconciledByAccountId: accountId,
      reconciledAt: now,
      generatedByAccountId: normaliseString(entry.generatedByAccountId || entry.generated_by_account_id, accountId),
      generatedAt: Number.isFinite(Number(entry.generatedAt || entry.generated_at))
        ? Number(entry.generatedAt || entry.generated_at)
        : now,
      packageId: safePackageId,
      candidateId: candidateId || null,
      itemId: item.itemId,
      lane: item.lane,
      voiceId: item.voiceId,
      paceId: item.paceId,
      speedId: item.speedId,
      modelId: item.modelId,
      profileVersion: item.profileVersion,
      contentKey: item.contentKey,
      r2Key: item.r2Key,
    };
    const jobId = uid('coaud');
    statements.push(bindStatement(db, `
      INSERT INTO content_operation_audio_jobs (
        job_id, package_id, candidate_id, lane, entity_type, entity_id,
        voice_id, pace_id, model_id, profile_version, content_key, status,
        r2_key, error_json, requested_by_account_id, completed_at, created_at,
        idempotency_key, source_kind, provenance_json, attempt_count, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, NULL, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(idempotency_key) DO UPDATE SET
        status = 'uploaded',
        r2_key = excluded.r2_key,
        error_json = NULL,
        requested_by_account_id = excluded.requested_by_account_id,
        completed_at = excluded.completed_at,
        source_kind = excluded.source_kind,
        provenance_json = excluded.provenance_json,
        updated_at = excluded.updated_at
    `, [
      jobId,
      safePackageId,
      candidateId || null,
      item.lane,
      entityTypeForAudioItem(item),
      entityIdForAudioItem(item),
      item.voiceId,
      item.paceId,
      item.modelId,
      item.profileVersion,
      item.contentKey,
      item.r2Key,
      accountId,
      now,
      now,
      idempotencyKey,
      sourceKind,
      JSON.stringify(provenance),
      now,
    ]));
    jobs.push({
      idempotencyKey,
      packageId: safePackageId,
      candidateId: candidateId || null,
      status: 'uploaded',
      r2Key: item.r2Key,
      sourceKind,
      provenance,
    });
  }
  await batch(db, statements);
  return {
    packageId: safePackageId,
    candidateId: candidateId || null,
    sourceKind,
    summary: {
      requested: asArray(entries).length,
      uploaded: jobs.length,
      skippedInvalid: Math.max(0, asArray(entries).length - jobs.length),
    },
    jobs,
  };
}
