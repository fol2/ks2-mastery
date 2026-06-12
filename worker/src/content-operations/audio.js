import {
  scanSpellingAudioReadiness,
} from '../../../src/subjects/spelling/content/audio-readiness.js';
import {
  all,
} from '../d1.js';

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
    requestedByAccountId: row.requested_by_account_id,
    completedAt: row.completed_at == null ? null : Number(row.completed_at),
    createdAt: Number(row.created_at) || 0,
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
