import { uid } from '../../../src/platform/core/utils.js';
import { cloneSerialisable } from '../../../src/platform/core/repositories/helpers.js';
import {
  buildContentOperationRevertOperations,
  buildSpellingContentOperationCandidate,
  CONTENT_OPERATION_PACKAGE_STATES,
  CONTENT_OPERATION_SUBJECT_ID,
  contentOperationHash,
  contentOperationValueHash,
  detectContentOperationConflicts,
  normaliseContentOperation,
  readContentOperationField,
} from '../../../src/subjects/spelling/content/operations-model.js';
import {
  buildSpellingContentSummary,
  isSpellingPoolLearnerVisible,
  normalisePoolVisibility,
  validateSpellingContentBundle,
} from '../../../src/subjects/spelling/content/model.js';
import {
  HERO_EXPOSURE_SURFACES,
  isHeroExposureVisible,
  normaliseHeroExposure,
} from '../../../src/platform/game/reward-track-config.js';
import {
  audioReadinessHasBlockingItems,
} from '../../../src/subjects/spelling/content/audio-readiness.js';
import {
  decodeContentOperationSnapshot,
  encodeContentOperationSnapshot,
} from '../../../src/subjects/spelling/content/release-snapshot-codec.js';
import {
  readSeededSpellingContentBundle,
} from '../generated-spelling-content-seed.js';
import {
  all,
  batch,
  bindStatement,
  first,
  run,
} from '../d1.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../errors.js';
import {
  buildContentOperationAudioScan,
} from './audio.js';
import {
  buildContentOperationAssetScan,
} from './assets.js';

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normaliseSubjectId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : CONTENT_OPERATION_SUBJECT_ID;
}

function normaliseString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  const output = [];
  const seen = new Set();
  for (const value of values) {
    const normalised = normaliseString(value);
    if (!normalised || seen.has(normalised)) continue;
    seen.add(normalised);
    output.push(normalised);
  }
  return output;
}

function mutationChangeCount(result) {
  return Math.max(0, Number(result?.meta?.changes ?? result?.meta?.rows_written) || 0);
}

function isUniqueConstraintError(error) {
  return /unique constraint|constraint failed/i.test(String(error?.message || error || ''));
}

function packageRowToRecord(row) {
  if (!row) return null;
  return {
    packageId: row.package_id,
    subjectId: row.subject_id,
    templateId: row.template_id,
    title: row.title,
    description: row.description || '',
    baseReleaseId: row.base_release_id || null,
    baseReleaseHash: row.base_release_hash || null,
    state: row.state,
    createdByAccountId: row.created_by_account_id,
    updatedByAccountId: row.updated_by_account_id,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
    approvedAt: row.approved_at == null ? null : Number(row.approved_at),
    publishedAt: row.published_at == null ? null : Number(row.published_at),
    supersededByPackageId: row.superseded_by_package_id || null,
  };
}

function operationRowToRecord(row) {
  if (!row) return null;
  return {
    operationId: row.operation_id,
    packageId: row.package_id,
    operationOrder: Number(row.operation_order) || 0,
    entityType: row.entity_type,
    entityId: row.entity_id,
    fieldPath: row.field_path || '',
    action: row.action,
    beforeHash: row.before_hash || '',
    afterHash: row.after_hash || '',
    payload: parseJson(row.payload_json, null),
    createdByAccountId: row.created_by_account_id,
    createdAt: Number(row.created_at) || 0,
  };
}

function candidateRowToRecord(row, { includeSnapshot = false } = {}) {
  if (!row) return null;
  return {
    candidateId: row.candidate_id,
    packageId: row.package_id,
    baseReleaseId: row.base_release_id || null,
    currentReleaseId: row.current_release_id || null,
    operationsHash: row.operations_hash,
    candidateHash: row.candidate_hash,
    candidate: includeSnapshot ? parseJson(row.candidate_snapshot_json, null) : null,
    validation: parseJson(row.validation_json, { ok: false, errors: [], warnings: [] }),
    audioScan: parseJson(row.audio_scan_json, null),
    assetScan: parseJson(row.asset_scan_json, null),
    rewardScan: parseJson(row.reward_scan_json, null),
    visibilityScan: parseJson(row.visibility_scan_json, null),
    conflicts: parseJson(row.conflicts_json, []),
    createdAt: Number(row.created_at) || 0,
  };
}

async function candidateRowToRecordAsync(row, { includeSnapshot = false } = {}) {
  const record = candidateRowToRecord(row, { includeSnapshot: false });
  if (!record || !includeSnapshot) return record;
  const snapshotJson = await decodeContentOperationSnapshot(row.candidate_snapshot_json);
  return {
    ...record,
    candidate: parseJson(snapshotJson, null),
  };
}

async function persistCandidateAudioScan(db, candidateId, audioScan) {
  if (!candidateId) return;
  await run(db, `
    UPDATE content_operation_package_candidates
    SET audio_scan_json = ?
    WHERE candidate_id = ?
  `, [
    JSON.stringify(audioScan || null),
    candidateId,
  ]);
}

async function readLatestCandidateForPackage(db, packageId) {
  const row = await first(db, `
    SELECT *
    FROM content_operation_package_candidates
    WHERE package_id = ?
    ORDER BY created_at DESC, candidate_id DESC
    LIMIT 1
  `, [packageId]);
  return candidateRowToRecord(row);
}

async function attachLatestCandidatesToPackages(db, packages = []) {
  if (!packages.length) return packages;
  const packageIds = packages.map((contentPackage) => contentPackage.packageId).filter(Boolean);
  if (!packageIds.length) return packages;
  const placeholders = packageIds.map(() => '?').join(', ');
  const rows = await all(db, `
    SELECT *
    FROM content_operation_package_candidates
    WHERE package_id IN (${placeholders})
    ORDER BY package_id ASC, created_at DESC, candidate_id DESC
  `, packageIds);
  const latestByPackageId = new Map();
  for (const row of rows) {
    if (!latestByPackageId.has(row.package_id)) {
      latestByPackageId.set(row.package_id, candidateRowToRecord(row));
    }
  }
  return packages.map((contentPackage) => ({
    ...contentPackage,
    latestCandidate: latestByPackageId.get(contentPackage.packageId) || null,
  }));
}

function releaseRowToRecord(row, { includeSnapshot = false } = {}) {
  if (!row) return null;
  const proof = parseJson(row.proof_json, null);
  const audioProof = audioReleaseProofFromProof(proof);
  const assetProof = releaseAssetProofFromProof(proof);
  return {
    releaseId: row.release_id,
    subjectId: row.subject_id,
    status: row.status,
    snapshotHash: row.snapshot_hash,
    snapshot: includeSnapshot ? parseJson(row.snapshot_json, null) : null,
    baseReleaseId: row.base_release_id || null,
    packageId: row.package_id || null,
    publishedAt: row.published_at == null ? null : Number(row.published_at),
    publishedByAccountId: row.published_by_account_id || null,
    rollbackOfReleaseId: row.rollback_of_release_id || null,
    proof,
    audioFallback: audioProof.audioFallback,
    audioWarnings: audioProof.audioWarnings,
    assetSummary: assetProof.assetSummary,
    assetReferenceManifest: assetProof.assetReferenceManifest,
    createdAt: Number(row.created_at) || 0,
  };
}

async function releaseRowToRecordAsync(row, { includeSnapshot = false } = {}) {
  const record = releaseRowToRecord(row, { includeSnapshot: false });
  if (!record || !includeSnapshot) return record;
  const snapshotJson = await decodeContentOperationSnapshot(row.snapshot_json);
  return {
    ...record,
    snapshot: parseJson(snapshotJson, null),
  };
}

function validationSummary(validation) {
  return {
    ok: Boolean(validation?.ok),
    errorCount: Array.isArray(validation?.errors) ? validation.errors.length : 0,
    warningCount: Array.isArray(validation?.warnings) ? validation.warnings.length : 0,
    errors: Array.isArray(validation?.errors) ? validation.errors : [],
    warnings: Array.isArray(validation?.warnings) ? validation.warnings : [],
  };
}

function latestPublishedReleaseIdSql() {
  return `
    SELECT release_id
    FROM content_operation_releases
    WHERE subject_id = ? AND status = 'published'
    ORDER BY published_at DESC, created_at DESC, rowid DESC
    LIMIT 1
  `;
}

function approvalRowToRecord(row) {
  if (!row) return null;
  return {
    approvalId: row.approval_id,
    packageId: row.package_id,
    candidateId: row.candidate_id,
    candidateHash: row.candidate_hash,
    approvedByAccountId: row.approved_by_account_id,
    approvedAt: Number(row.approved_at) || 0,
    notes: row.notes || '',
    audioFallback: parseJson(row.audio_fallback_json, null),
    assetSummary: parseJson(row.asset_summary_json, null),
    validationSummary: parseJson(row.validation_summary_json, null),
  };
}

function eventRowToRecord(row) {
  if (!row) return null;
  return {
    eventId: row.event_id,
    packageId: row.package_id || null,
    releaseId: row.release_id || null,
    subjectId: row.subject_id,
    eventType: row.event_type,
    actorAccountId: row.actor_account_id || null,
    event: parseJson(row.event_json, {}),
    createdAt: Number(row.created_at) || 0,
  };
}

async function insertContentOperationEvent(db, {
  eventId = uid('coevt'),
  packageId = null,
  releaseId = null,
  subjectId = CONTENT_OPERATION_SUBJECT_ID,
  eventType,
  actorAccountId = null,
  event = {},
  createdAt,
}) {
  await run(db, `
    INSERT INTO content_operation_events (
      event_id, package_id, release_id, subject_id, event_type,
      actor_account_id, event_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    eventId,
    packageId,
    releaseId,
    subjectId,
    eventType,
    actorAccountId,
    JSON.stringify(event || {}),
    createdAt,
  ]);
  return eventId;
}

const AUDIO_FALLBACK_BLOCKING_STATUSES = new Set([
  'missing',
  'stale',
  'generated',
  'failed',
  'skipped',
  'override_requested',
]);
const RELEASE_AUDIO_PROOF_KEY = 'contentOperationsAudio';
const RELEASE_ASSET_PROOF_KEY = 'contentOperationsAssets';
const RELEASE_PRODUCTION_PROOF_KEY = 'productionProof';
const RELEASE_PROOF_RESERVED_KEYS = new Set([
  'audioFallback',
  'audioWarnings',
  'assetSummary',
  'assetWarnings',
  RELEASE_AUDIO_PROOF_KEY,
  RELEASE_ASSET_PROOF_KEY,
  RELEASE_PRODUCTION_PROOF_KEY,
]);
const PRODUCTION_PROOF_SURFACES = Object.freeze([
  { key: 'spellingSetup', label: 'Spelling setup', aliases: ['spellingSetup', 'spelling-setup', 'setup'] },
  { key: 'wordBank', label: 'Word Bank', aliases: ['wordBank', 'word-bank', 'wordbank'] },
  { key: 'heroCodex', label: 'Hero / Codex', aliases: ['heroCodex', 'hero-codex', 'codex', 'hero'] },
  { key: 'monsterRendering', label: 'Monster rendering', aliases: ['monsterRendering', 'monster-rendering', 'monster', 'monsters'] },
]);
const PRODUCTION_PROOF_RESERVED_KEYS = new Set([
  RELEASE_AUDIO_PROOF_KEY,
  RELEASE_ASSET_PROOF_KEY,
  RELEASE_PRODUCTION_PROOF_KEY,
]);

function audioFallbackBlockingItems(scan = null) {
  return asArray(scan?.items).filter((item) => (
    item?.required !== false
    && AUDIO_FALLBACK_BLOCKING_STATUSES.has(normaliseString(item?.status))
  ));
}

function audioFallbackItemIdentity(item = {}) {
  return [
    normaliseString(item.itemId),
    normaliseString(item.lane),
    normaliseString(item.profileVersion),
    normaliseString(item.modelId),
    normaliseString(item.voiceId),
    normaliseString(item.paceId || item.speedId),
    normaliseString(item.contentKey),
  ].join('|');
}

function audioFallbackItemSummary(item = {}) {
  return {
    itemId: normaliseString(item.itemId),
    lane: normaliseString(item.lane),
    entityType: item.lane === 'sentence' ? 'spelling.sentenceEntry' : 'spelling.word',
    entityId: item.lane === 'sentence'
      ? normaliseString(item.sentenceId)
      : normaliseString(item.slug),
    slug: normaliseString(item.slug),
    sentenceId: normaliseString(item.sentenceId),
    voiceId: normaliseString(item.voiceId),
    paceId: normaliseString(item.paceId || item.speedId),
    speedId: normaliseString(item.speedId),
    modelId: normaliseString(item.modelId),
    profileVersion: normaliseString(item.profileVersion),
    contentKey: normaliseString(item.contentKey),
    status: normaliseString(item.status),
    blocker: normaliseString(item.blocker),
  };
}

function buildAudioFallbackAffectedMatrix(scan = null) {
  const items = audioFallbackBlockingItems(scan).map(audioFallbackItemSummary);
  const lanes = {};
  for (const lane of ['word', 'sentence']) {
    const laneItems = items.filter((item) => item.lane === lane);
    lanes[lane] = {
      affectedCount: laneItems.length,
      statuses: uniqueStrings(laneItems.map((item) => item.status)),
      voices: uniqueStrings(laneItems.map((item) => item.voiceId)),
      paces: uniqueStrings(laneItems.map((item) => item.paceId || item.speedId)),
    };
  }
  return {
    profileVersion: normaliseString(scan?.profileVersion),
    modelId: normaliseString(scan?.modelId),
    affectedCount: items.length,
    lanes,
    items,
  };
}

function normaliseAudioFallbackApproval(rawFallback, scan, {
  approvedByAccountId,
  approvedAt,
  notes = '',
} = {}) {
  const raw = isPlainObject(rawFallback) ? rawFallback : {};
  if (raw.allowed === false) return null;
  const reason = normaliseString(raw.reason || raw.justification);
  if (!reason) {
    throw new BadRequestError('Content operation audio fallback approval requires a reason.', {
      code: 'content_operation_audio_fallback_reason_required',
    });
  }
  const affectedMatrix = buildAudioFallbackAffectedMatrix(scan);
  if (affectedMatrix.affectedCount < 1) {
    throw new BadRequestError('Content operation audio fallback approval has no affected audio blockers.', {
      code: 'content_operation_audio_fallback_not_required',
    });
  }
  return {
    allowed: true,
    reason,
    notes: normaliseString(raw.notes || notes),
    approvedByAccountId: normaliseString(approvedByAccountId),
    approvedAt: Number(approvedAt) || 0,
    affectedMatrix,
  };
}

function applyAudioFallbackToScan(scan = null, fallbackApproval = null) {
  if (!fallbackApproval?.allowed) return scan;
  const next = cloneSerialisable(scan || {});
  const fallbackWarning = 'audio_fallback_approved';
  const topBlockers = asArray(next.blockers);
  const strictItems = audioFallbackBlockingItems(next).map(audioFallbackItemSummary);
  const strictBlockers = [...topBlockers];
  next.status = topBlockers.length || audioFallbackBlockingItems(next).length ? 'warning' : (next.status || 'warning');
  next.warnings = uniqueStrings([
    fallbackWarning,
    ...asArray(next.warnings),
    ...topBlockers,
  ]);
  next.blockers = [];
  if (isPlainObject(next.lanes)) {
    for (const laneKey of Object.keys(next.lanes)) {
      const lane = next.lanes[laneKey];
      if (!isPlainObject(lane)) continue;
      const laneBlockers = asArray(lane.blockers);
      strictBlockers.push(...laneBlockers);
      if (laneBlockers.length || lane.status === 'blocked') {
        lane.status = 'warning';
      }
      lane.warnings = uniqueStrings([
        ...asArray(lane.warnings),
        ...laneBlockers,
      ]);
      lane.blockers = [];
    }
  }
  if (isPlainObject(next.bySlug)) {
    for (const entry of Object.values(next.bySlug)) {
      if (!isPlainObject(entry)) continue;
      const slugBlockers = asArray(entry.blockers);
      strictBlockers.push(...slugBlockers);
      if (slugBlockers.length || entry.status === 'blocked') {
        entry.status = 'warning';
      }
      entry.warnings = uniqueStrings([
        ...asArray(entry.warnings),
        ...slugBlockers,
      ]);
      entry.blockers = [];
    }
  }
  next.fallbackApproval = {
    allowed: true,
    approvedAt: fallbackApproval.approvedAt,
    approvedByAccountId: fallbackApproval.approvedByAccountId,
    affectedCount: Number(fallbackApproval.affectedMatrix?.affectedCount) || 0,
  };
  next.strictAudioReadiness = {
    status: normaliseString(scan?.status, strictItems.length || strictBlockers.length ? 'blocked' : 'passed'),
    blockers: uniqueStrings(strictBlockers),
    affectedCount: strictItems.length,
    items: strictItems,
  };
  return next;
}

function audioFallbackCoversCurrentScan(fallbackApproval = null, scan = null) {
  const blockingItems = audioFallbackBlockingItems(scan);
  if (!blockingItems.length) return true;
  if (!fallbackApproval?.allowed) return false;
  const approvedItems = asArray(fallbackApproval.affectedMatrix?.items);
  const approvedIdentities = new Set(approvedItems.map(audioFallbackItemIdentity));
  return blockingItems.every((item) => approvedIdentities.has(audioFallbackItemIdentity(item)));
}

function audioWarningProofForScan(scan = null, fallbackApproval = null) {
  if (!fallbackApproval?.allowed) return null;
  return {
    status: normaliseString(scan?.status, 'warning'),
    warnings: uniqueStrings(asArray(scan?.warnings)),
    affectedCount: Number(fallbackApproval.affectedMatrix?.affectedCount) || 0,
    affectedMatrix: fallbackApproval.affectedMatrix,
  };
}

function assetScanHasBlockingItems(scan = null) {
  return normaliseString(scan?.status) === 'blocked' || asArray(scan?.blockers).length > 0;
}

function assetScansMatch(left = null, right = null) {
  const leftHash = normaliseString(left?.hash);
  const rightHash = normaliseString(right?.hash);
  return Boolean(leftHash && rightHash && leftHash === rightHash);
}

function audioReleaseProofFromProof(proof = null) {
  const metadata = isPlainObject(proof?.[RELEASE_AUDIO_PROOF_KEY])
    ? proof[RELEASE_AUDIO_PROOF_KEY]
    : null;
  return {
    audioFallback: isPlainObject(metadata?.audioFallback) ? metadata.audioFallback : null,
    audioWarnings: isPlainObject(metadata?.audioWarnings) ? metadata.audioWarnings : null,
  };
}

function normaliseCallerReleaseProof(proof = null) {
  if (proof == null) return null;
  if (!isPlainObject(proof)) return { value: proof };
  const reservedKeys = Object.keys(proof).filter((key) => RELEASE_PROOF_RESERVED_KEYS.has(key));
  if (reservedKeys.length) {
    throw new BadRequestError('Content operation release proof contains reserved metadata keys.', {
      code: 'content_operation_release_proof_reserved_key',
      reservedKeys,
    });
  }
  return cloneSerialisable(proof);
}

function buildReleaseProof(proof = null, approval = null, audioScan = null, assetScan = null) {
  let releaseProof = normaliseCallerReleaseProof(proof);
  if (approval?.audioFallback?.allowed) {
    releaseProof = {
      ...(releaseProof || {}),
      [RELEASE_AUDIO_PROOF_KEY]: {
        audioFallback: approval.audioFallback,
        audioWarnings: audioWarningProofForScan(audioScan, approval.audioFallback),
      },
    };
  }
  if (assetScan) {
    releaseProof = {
      ...(releaseProof || {}),
      [RELEASE_ASSET_PROOF_KEY]: {
        assetSummary: cloneSerialisable(assetScan),
        assetReferenceManifest: cloneSerialisable(assetScan.assetReferenceManifest || null),
      },
    };
  }
  return releaseProof;
}

function releaseAssetProofFromProof(proof = null) {
  const metadata = isPlainObject(proof?.[RELEASE_ASSET_PROOF_KEY])
    ? proof[RELEASE_ASSET_PROOF_KEY]
    : null;
  return {
    assetSummary: isPlainObject(metadata?.assetSummary) ? metadata.assetSummary : null,
    assetReferenceManifest: isPlainObject(metadata?.assetReferenceManifest) ? metadata.assetReferenceManifest : null,
  };
}

function proofHasCallerMetadata(proof = null) {
  if (!isPlainObject(proof)) return false;
  return Object.keys(proof).some((key) => !PRODUCTION_PROOF_RESERVED_KEYS.has(key));
}

function normaliseProofSurfaceKey(value) {
  const raw = normaliseString(value);
  if (!raw) return '';
  const comparable = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const surface of PRODUCTION_PROOF_SURFACES) {
    const candidates = [surface.key, ...surface.aliases];
    if (candidates.some((candidate) => candidate.toLowerCase().replace(/[^a-z0-9]/g, '') === comparable)) {
      return surface.key;
    }
  }
  return '';
}

function proofSurfaceKeysFromValue(value, keys = new Set()) {
  if (typeof value === 'string') {
    const key = normaliseProofSurfaceKey(value);
    if (key) keys.add(key);
    return keys;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string') {
        proofSurfaceKeysFromValue(entry, keys);
      } else if (isPlainObject(entry)) {
        proofSurfaceKeysFromValue(entry.key || entry.id || entry.surface || entry.name, keys);
      }
    }
    return keys;
  }
  if (isPlainObject(value)) {
    for (const [rawKey, entry] of Object.entries(value)) {
      if (entry === false || entry == null) continue;
      const key = normaliseProofSurfaceKey(rawKey);
      if (key) keys.add(key);
      if (isPlainObject(entry)) {
        proofSurfaceKeysFromValue(entry.key || entry.id || entry.surface || entry.name, keys);
      }
    }
  }
  return keys;
}

function proofSurfaceEvidenceEntriesFromValue(value, entries = new Map()) {
  if (typeof value === 'string') {
    const key = normaliseProofSurfaceKey(value);
    if (key && !entries.has(key)) entries.set(key, {});
    return entries;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string') {
        proofSurfaceEvidenceEntriesFromValue(entry, entries);
      } else if (isPlainObject(entry)) {
        const key = normaliseProofSurfaceKey(entry.key || entry.id || entry.surface || entry.name);
        if (key && !entries.has(key)) entries.set(key, cloneSerialisable(entry));
      }
    }
    return entries;
  }
  if (isPlainObject(value)) {
    for (const [rawKey, entry] of Object.entries(value)) {
      if (entry === false || entry == null) continue;
      const key = normaliseProofSurfaceKey(rawKey);
      if (key && !entries.has(key)) {
        entries.set(key, isPlainObject(entry) ? cloneSerialisable(entry) : {});
      }
      if (isPlainObject(entry)) {
        const nestedKey = normaliseProofSurfaceKey(entry.key || entry.id || entry.surface || entry.name);
        if (nestedKey && !entries.has(nestedKey)) entries.set(nestedKey, cloneSerialisable(entry));
      }
    }
  }
  return entries;
}

function productionProofCaptureForRelease(proof = null, release = {}) {
  if (!isPlainObject(proof)) return null;
  const capture = isPlainObject(proof[RELEASE_PRODUCTION_PROOF_KEY])
    ? proof[RELEASE_PRODUCTION_PROOF_KEY]
    : null;
  if (!capture) return null;
  const releaseId = normaliseString(capture.releaseId);
  if (!releaseId || releaseId !== release.releaseId) return null;
  const capturedAt = Number(capture.capturedAt) || 0;
  const publishedAt = Number(release.publishedAt) || 0;
  if (!capturedAt || (publishedAt && capturedAt < publishedAt)) return null;
  return {
    ...capture,
    capturedAt,
    capturedByAccountId: normaliseString(capture.capturedByAccountId) || null,
  };
}

function productionProofSurfaceKeys(proof = null, release = {}) {
  const capture = productionProofCaptureForRelease(proof, release);
  if (!capture) return [];
  const keys = new Set();
  proofSurfaceKeysFromValue(capture.surfaces, keys);
  proofSurfaceKeysFromValue(capture.surfaceProof, keys);
  return [...keys];
}

function surfaceDescriptor(key) {
  const surface = PRODUCTION_PROOF_SURFACES.find((entry) => entry.key === key);
  return surface || { key, label: key };
}

function surfaceCaptureDescriptor(key, capture = null) {
  return {
    ...surfaceDescriptor(key),
    capturedAt: Number(capture?.capturedAt) || null,
    capturedByAccountId: capture?.capturedByAccountId || null,
  };
}

function isPoolVisibilityChange(operation = {}) {
  if (operation.entityType !== 'spelling.pool') return false;
  const fieldPath = normaliseString(operation.fieldPath);
  if (
    fieldPath === 'visibility'
      || fieldPath.startsWith('visibility.')
      || fieldPath === 'rewardTrack'
      || fieldPath.startsWith('rewardTrack.')
      || fieldPath === 'noRewardException'
      || fieldPath.startsWith('noRewardException.')
  ) return true;
  return isPlainObject(operation.payload)
    && (
      isPlainObject(operation.payload.visibility)
      || isPlainObject(operation.payload.rewardTrack)
      || isPlainObject(operation.payload.noRewardException)
    );
}

function isHeroCodexVisibilityChange(operation = {}) {
  const entityType = normaliseString(operation.entityType);
  const fieldPath = normaliseString(operation.fieldPath);
  if (entityType === 'spelling.heroExposure' || entityType === 'spelling.visibilityRule') return true;
  if (isPoolVisibilityChange(operation)) return true;
  if (entityType !== 'spelling.rewardTrack') return false;
  if (fieldPath === 'heroExposure' || fieldPath.startsWith('heroExposure.')) return true;
  return isPlainObject(operation.payload) && isPlainObject(operation.payload.heroExposure);
}

function requiredProductionProofSurfaceKeys(operations = [], release = {}) {
  const required = new Set();
  if (operations.some((operation) => normaliseString(operation.entityType).startsWith('spelling.'))) {
    required.add('spellingSetup');
    required.add('wordBank');
  }
  if (operations.some(isHeroCodexVisibilityChange)) {
    required.add('heroCodex');
  }
  const assetReferenceCount = Number(release.assetReferenceManifest?.referenceCount) || 0;
  const assetUploadCount = Number(release.assetSummary?.uploadCount) || 0;
  if (assetReferenceCount > 0 || assetUploadCount > 0) {
    required.add('monsterRendering');
  }
  return [...required];
}

function poolVisibilityFromOperation(operation = {}) {
  const entityType = normaliseString(operation.entityType);
  if (entityType !== 'spelling.pool') return null;
  const fieldPath = normaliseString(operation.fieldPath);
  if (isPlainObject(operation.payload?.visibility)) return normalisePoolVisibility(operation.payload.visibility);
  if (fieldPath === 'visibility' && isPlainObject(operation.payload)) return normalisePoolVisibility(operation.payload);
  if (fieldPath === 'visibility.state') return normalisePoolVisibility({ state: operation.payload });
  if (fieldPath === 'visibility.scheduledAt') return normalisePoolVisibility({ state: 'scheduled', scheduledAt: operation.payload });
  if (fieldPath === 'visibility.rolloutFlag') return normalisePoolVisibility({ state: 'rollout-flagged', rolloutFlag: operation.payload });
  return null;
}

function heroExposureFromOperation(operation = {}) {
  const entityType = normaliseString(operation.entityType);
  const fieldPath = normaliseString(operation.fieldPath);
  if (entityType === 'spelling.heroExposure') return normaliseHeroExposure(operation.payload);
  if (entityType !== 'spelling.rewardTrack') return null;
  if (isPlainObject(operation.payload?.heroExposure)) return normaliseHeroExposure(operation.payload.heroExposure);
  if (fieldPath === 'heroExposure' && isPlainObject(operation.payload)) return normaliseHeroExposure(operation.payload);
  if (fieldPath === 'heroExposure.state') return normaliseHeroExposure({ state: operation.payload });
  if (fieldPath === 'heroExposure.scheduledAt') return normaliseHeroExposure({ state: 'scheduled', scheduledAt: operation.payload });
  if (fieldPath === 'heroExposure.rolloutFlag') return normaliseHeroExposure({ state: 'rollout-flagged', rolloutFlag: operation.payload });
  return null;
}

function activationDescriptorFromState({ entityType, entityId, state, scheduledAt = 0, rolloutFlag = '', learnerVisible = false }) {
  let status = 'inactive';
  if (learnerVisible) status = 'active';
  else if (state === 'scheduled') status = 'scheduled';
  else if (state === 'rollout-flagged') status = 'rollout_flagged';
  else if (state === 'hidden') status = 'hidden';
  return {
    entityType,
    entityId,
    state,
    status,
    learnerVisible: Boolean(learnerVisible),
    scheduledAt: Number(scheduledAt) || null,
    rolloutFlag: normaliseString(rolloutFlag) || null,
  };
}

function isHeroExposureLearnerVisible(exposure, { now = Date.now(), env = {} } = {}) {
  return HERO_EXPOSURE_SURFACES.some((surface) => isHeroExposureVisible(exposure, { surface, now, env }));
}

function buildVisibilityActivationSummary(operations = [], {
  now = Date.now(),
  env = {},
} = {}) {
  const entries = [];
  for (const operation of operations) {
    const poolVisibility = poolVisibilityFromOperation(operation);
    if (poolVisibility) {
      entries.push(activationDescriptorFromState({
        entityType: operation.entityType,
        entityId: operation.entityId,
        state: poolVisibility.state,
        scheduledAt: poolVisibility.scheduledAt,
        rolloutFlag: poolVisibility.rolloutFlag,
        learnerVisible: isSpellingPoolLearnerVisible(poolVisibility, { now, env }),
      }));
      continue;
    }
    const heroExposure = heroExposureFromOperation(operation);
    if (heroExposure) {
      entries.push(activationDescriptorFromState({
        entityType: operation.entityType,
        entityId: operation.entityId,
        state: heroExposure.state,
        scheduledAt: heroExposure.scheduledAt,
        rolloutFlag: heroExposure.rolloutFlag,
        learnerVisible: isHeroExposureLearnerVisible(heroExposure, { now, env }),
      }));
    }
  }

  let status = 'not_applicable';
  if (entries.some((entry) => entry.learnerVisible)) status = 'active';
  else if (entries.some((entry) => entry.status === 'scheduled')) status = 'scheduled';
  else if (entries.some((entry) => entry.status === 'rollout_flagged')) status = 'rollout_flagged';
  else if (entries.length) status = 'inactive';

  return {
    status,
    checkedAt: Number(now) || null,
    activated: status === 'active',
    entries,
  };
}

function summariseContentOperationChanges(operations = []) {
  const entities = new Map();
  const entityTypeCounts = new Map();
  const actionCounts = {};
  const fieldPaths = new Set();
  for (const operation of operations) {
    const entityType = normaliseString(operation.entityType, 'unknown');
    const entityId = normaliseString(operation.entityId, 'unknown');
    const key = `${entityType}:${entityId}`;
    if (!entities.has(key)) {
      entities.set(key, {
        entityType,
        entityId,
        actionCount: 0,
        actions: [],
        fields: [],
      });
    }
    const entry = entities.get(key);
    const action = normaliseString(operation.action, 'unknown');
    const fieldPath = normaliseString(operation.fieldPath || '$', '$');
    entry.actionCount += 1;
    if (!entry.actions.includes(action)) entry.actions.push(action);
    if (!entry.fields.includes(fieldPath)) entry.fields.push(fieldPath);
    entityTypeCounts.set(entityType, (entityTypeCounts.get(entityType) || 0) + 1);
    actionCounts[action] = (actionCounts[action] || 0) + 1;
    fieldPaths.add(fieldPath);
  }
  return {
    operationCount: operations.length,
    entityCount: entities.size,
    entityTypes: [...entityTypeCounts.entries()].map(([entityType, operationCount]) => ({
      entityType,
      operationCount,
      entityCount: [...entities.values()].filter((entry) => entry.entityType === entityType).length,
    })),
    actionCounts,
    fieldPaths: [...fieldPaths],
    preview: [...entities.values()].slice(0, 12),
  };
}

function summariseReleaseAssetChanges(release = {}) {
  const assetSummary = isPlainObject(release.assetSummary) ? release.assetSummary : null;
  const assetReferenceManifest = isPlainObject(release.assetReferenceManifest) ? release.assetReferenceManifest : null;
  const references = asArray(assetReferenceManifest?.references).map((reference) => {
    const target = isPlainObject(reference?.target) ? reference.target : {};
    return {
      assetUploadId: normaliseString(reference?.assetUploadId),
      referenceId: normaliseString(reference?.referenceId),
      assetKind: normaliseString(reference?.assetKind),
      monsterId: normaliseString(target.monsterId),
      branchId: normaliseString(target.branchId),
      stageId: normaliseString(target.stageId),
      validationStatus: normaliseString(reference?.validation?.status),
    };
  }).filter((reference) => reference.assetUploadId || reference.referenceId || reference.monsterId);
  return {
    uploadCount: Number(assetSummary?.uploadCount) || 0,
    referenceCount: Number(assetReferenceManifest?.referenceCount ?? references.length) || 0,
    hash: normaliseString(assetReferenceManifest?.hash || assetSummary?.hash),
    preview: references.slice(0, 12),
  };
}

function buildProductionProofSummary(release = {}, operations = [], {
  now = Date.now(),
  env = {},
} = {}) {
  const requiredKeys = requiredProductionProofSurfaceKeys(operations, release);
  const capture = productionProofCaptureForRelease(release.proof, release);
  const linkedKeys = productionProofSurfaceKeys(release.proof, release);
  const missingKeys = requiredKeys.filter((key) => !linkedKeys.includes(key));
  const hasCallerProof = proofHasCallerMetadata(release.proof);
  const activation = buildVisibilityActivationSummary(operations, { now, env });
  let status = 'not_required';
  if (requiredKeys.length) {
    if (!missingKeys.length) {
      status = 'recorded';
    } else if (linkedKeys.length || hasCallerProof) {
      status = 'partial';
    } else {
      status = 'missing';
    }
  } else if (hasCallerProof) {
    status = 'recorded';
  }
  const warnings = [];
  if (missingKeys.length && activation.activated) {
    warnings.push({
      code: 'production_proof_missing_after_visibility_activation',
      message: 'Learner-visible activation has occurred but production proof is incomplete.',
      missingSurfaces: missingKeys.map(surfaceDescriptor),
    });
  }
  return {
    status,
    hasCallerProof,
    capturedAt: Number(capture?.capturedAt) || null,
    capturedByAccountId: capture?.capturedByAccountId || null,
    requiredSurfaces: requiredKeys.map(surfaceDescriptor),
    linkedSurfaces: linkedKeys.map((key) => surfaceCaptureDescriptor(key, capture)),
    missingSurfaces: missingKeys.map(surfaceDescriptor),
    activation,
    warnings,
  };
}

function buildProductionProofCapture(proof = null, {
  releaseId,
  capturedByAccountId,
  capturedAt,
} = {}) {
  if (!isPlainObject(proof)) {
    throw new BadRequestError('Production proof capture requires a proof object.', {
      code: 'content_operation_release_proof_required',
      releaseId,
    });
  }
  const reservedKeys = Object.keys(proof).filter((key) => (
    key !== RELEASE_PRODUCTION_PROOF_KEY && RELEASE_PROOF_RESERVED_KEYS.has(key)
  ));
  if (reservedKeys.length) {
    throw new BadRequestError('Production proof capture contains reserved metadata keys.', {
      code: 'content_operation_release_proof_reserved_key',
      releaseId,
      reservedKeys,
    });
  }
  const source = isPlainObject(proof[RELEASE_PRODUCTION_PROOF_KEY])
    ? proof[RELEASE_PRODUCTION_PROOF_KEY]
    : proof;
  const entries = new Map();
  proofSurfaceEvidenceEntriesFromValue(proof.surfaces, entries);
  proofSurfaceEvidenceEntriesFromValue(proof.surfaceProof, entries);
  proofSurfaceEvidenceEntriesFromValue(source.surfaces, entries);
  proofSurfaceEvidenceEntriesFromValue(source.surfaceProof, entries);
  for (const surface of PRODUCTION_PROOF_SURFACES) {
    if (proof[surface.key] != null) {
      entries.set(surface.key, isPlainObject(proof[surface.key]) ? cloneSerialisable(proof[surface.key]) : {});
    }
  }
  if (!entries.size) {
    throw new BadRequestError('Production proof capture requires at least one recognised surface.', {
      code: 'content_operation_release_proof_surfaces_required',
      releaseId,
    });
  }
  const surfaces = {};
  for (const [key, evidence] of entries.entries()) {
    surfaces[key] = {
      ...surfaceDescriptor(key),
      ...(isPlainObject(evidence) ? evidence : {}),
      key,
      label: surfaceDescriptor(key).label,
      releaseId,
      capturedAt,
      capturedByAccountId,
    };
  }
  return {
    releaseId,
    capturedAt,
    capturedByAccountId,
    source: normaliseString(proof.source || source.source, 'content-operations-admin'),
    notes: normaliseString(proof.notes || source.notes),
    surfaces,
  };
}

function buildReleaseHistorySummary({
  release = null,
  contentPackage = null,
  approval = null,
  operations = [],
  now = Date.now(),
  env = {},
} = {}) {
  if (!release) return null;
  return {
    releaseId: release.releaseId,
    package: contentPackage ? {
      packageId: contentPackage.packageId,
      title: contentPackage.title,
      templateId: contentPackage.templateId,
      state: contentPackage.state,
    } : null,
    approvedByAccountId: approval?.approvedByAccountId || null,
    approvedAt: approval?.approvedAt ?? null,
    approvalId: approval?.approvalId || null,
    candidateId: approval?.candidateId || null,
    candidateHash: approval?.candidateHash || '',
    publishedByAccountId: release.publishedByAccountId || null,
    publishedAt: release.publishedAt ?? null,
    changedEntities: summariseContentOperationChanges(operations),
    assetChanges: summariseReleaseAssetChanges(release),
    productionProof: buildProductionProofSummary(release, operations, { now, env }),
  };
}

function buildApprovalAssetSummary(assetScan = null) {
  return assetScan ? cloneSerialisable(assetScan) : null;
}

function assetEventSummary(assetScan = null) {
  if (!assetScan) return null;
  return {
    status: normaliseString(assetScan.status, 'not_scanned'),
    hash: normaliseString(assetScan.hash),
    blockers: asArray(assetScan.blockers),
    warnings: asArray(assetScan.warnings),
    uploadCount: Number(assetScan.uploadCount) || 0,
    itemCount: Number(assetScan.itemCount) || 0,
    targetCount: Number(assetScan.targetCount) || 0,
    referenceCount: Number(assetScan.assetReferenceManifest?.referenceCount) || 0,
  };
}

function approvedAssetSummaryMatches(approval = null, assetScan = null) {
  if (!assetScan) return false;
  return assetScansMatch(approval?.assetSummary, assetScan);
}

function candidateAssetScanMatches(candidate = null, assetScan = null) {
  return assetScansMatch(candidate?.assetScan, assetScan);
}

function assetScanConflictExtra(packageId, candidateId, candidateAssetScan, currentAssetScan) {
  return {
    packageId,
    candidateId,
    candidateAssetHash: normaliseString(candidateAssetScan?.hash) || null,
    currentAssetHash: normaliseString(currentAssetScan?.hash) || null,
    assetScan: currentAssetScan,
  };
}

async function readLatestReleaseRow(db, subjectId, { includeSnapshot = false } = {}) {
  return first(db, `
    SELECT
      release_id, subject_id, status, snapshot_hash,
      ${includeSnapshot ? 'snapshot_json' : 'NULL AS snapshot_json'},
      base_release_id, package_id, published_at, published_by_account_id,
      rollback_of_release_id, proof_json, created_at
    FROM content_operation_releases
    WHERE subject_id = ? AND status = 'published'
    ORDER BY published_at DESC, created_at DESC, rowid DESC
    LIMIT 1
  `, [subjectId]);
}

async function readReleaseRowById(db, subjectId, releaseId, { includeSnapshot = false } = {}) {
  if (!releaseId) return null;
  return first(db, `
    SELECT
      release_id, subject_id, status, snapshot_hash,
      ${includeSnapshot ? 'snapshot_json' : 'NULL AS snapshot_json'},
      base_release_id, package_id, published_at, published_by_account_id,
      rollback_of_release_id, proof_json, created_at
    FROM content_operation_releases
    WHERE subject_id = ? AND release_id = ? AND status = 'published'
    ORDER BY published_at DESC, created_at DESC, rowid DESC
    LIMIT 1
  `, [subjectId, releaseId]);
}

async function readReleaseRowByPackageId(db, subjectId, packageId, { includeSnapshot = false } = {}) {
  if (!packageId) return null;
  return first(db, `
    SELECT
      release_id, subject_id, status, snapshot_hash,
      ${includeSnapshot ? 'snapshot_json' : 'NULL AS snapshot_json'},
      base_release_id, package_id, published_at, published_by_account_id,
      rollback_of_release_id, proof_json, created_at
    FROM content_operation_releases
    WHERE subject_id = ? AND package_id = ? AND status = 'published'
    ORDER BY published_at DESC, created_at DESC, rowid DESC
    LIMIT 1
  `, [subjectId, packageId]);
}

async function readLegacySubjectContentBundle(db, subjectId) {
  const row = await first(db, `
    SELECT account_id, subject_id, content_json, updated_at, updated_by_account_id
    FROM account_subject_content
    WHERE subject_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `, [subjectId]);
  const bundle = parseJson(row?.content_json, null);
  if (!bundle) return null;
  return {
    bundle,
    source: {
      type: 'account_subject_content',
      accountId: row.account_id || null,
      updatedAt: Number(row.updated_at) || 0,
      updatedByAccountId: row.updated_by_account_id || null,
    },
  };
}

async function requirePackage(db, packageId) {
  const row = await first(db, `
    SELECT *
    FROM content_operation_packages
    WHERE package_id = ?
  `, [packageId]);
  if (!row) {
    throw new NotFoundError('Content operation package was not found.', {
      code: 'content_operation_package_not_found',
      packageId,
    });
  }
  return row;
}

async function listPackageOperations(db, packageId) {
  const rows = await all(db, `
    SELECT *
    FROM content_operation_package_operations
    WHERE package_id = ?
    ORDER BY operation_order ASC
  `, [packageId]);
  return rows.map(operationRowToRecord);
}

async function readPackageRevertSource(db, packageId) {
  const row = await first(db, `
    SELECT event_json
    FROM content_operation_events
    WHERE package_id = ? AND event_type = 'package.revert_created'
    ORDER BY created_at DESC, event_id DESC
    LIMIT 1
  `, [packageId]);
  const event = parseJson(row?.event_json, null);
  if (!isPlainObject(event)) return null;
  const revertOfPackageId = normaliseString(event.revertOfPackageId);
  const revertOfReleaseId = normaliseString(event.revertOfReleaseId);
  if (!revertOfPackageId || !revertOfReleaseId) return null;
  return {
    revertOfPackageId,
    revertOfReleaseId,
    revertReason: normaliseString(event.revertReason),
  };
}

async function attachReleaseHistorySummary(db, release = null, context = {}) {
  if (!release) return null;
  if (!release.packageId) {
    return {
      ...release,
      history: buildReleaseHistorySummary({ release, ...context }),
    };
  }
  const [packageRow, approvalRow, operations] = await Promise.all([
    first(db, `
      SELECT *
      FROM content_operation_packages
      WHERE package_id = ?
    `, [release.packageId]),
    first(db, `
      SELECT *
      FROM content_operation_package_approvals
      WHERE package_id = ?
      ORDER BY approved_at DESC
      LIMIT 1
    `, [release.packageId]),
    listPackageOperations(db, release.packageId),
  ]);
  return {
    ...release,
    history: buildReleaseHistorySummary({
      release,
      contentPackage: packageRow ? packageRowToRecord(packageRow) : null,
      approval: approvalRowToRecord(approvalRow),
      operations,
      ...context,
    }),
  };
}

async function attachReleaseHistorySummaries(db, releases = [], context = {}) {
  if (!releases.length) return releases;
  const packageIds = uniqueStrings(releases.map((release) => release?.packageId).filter(Boolean));
  if (!packageIds.length) {
    return releases.map((release) => ({
      ...release,
      history: buildReleaseHistorySummary({ release, ...context }),
    }));
  }
  const placeholders = packageIds.map(() => '?').join(', ');
  const [packageRows, approvalRows, operationRows] = await Promise.all([
    all(db, `
      SELECT *
      FROM content_operation_packages
      WHERE package_id IN (${placeholders})
    `, packageIds),
    all(db, `
      SELECT *
      FROM content_operation_package_approvals
      WHERE package_id IN (${placeholders})
      ORDER BY package_id ASC, approved_at DESC
    `, packageIds),
    all(db, `
      SELECT *
      FROM content_operation_package_operations
      WHERE package_id IN (${placeholders})
      ORDER BY package_id ASC, operation_order ASC
    `, packageIds),
  ]);
  const packagesById = new Map(packageRows.map((row) => [row.package_id, packageRowToRecord(row)]));
  const approvalsByPackageId = new Map();
  for (const row of approvalRows) {
    if (!approvalsByPackageId.has(row.package_id)) {
      approvalsByPackageId.set(row.package_id, approvalRowToRecord(row));
    }
  }
  const operationsByPackageId = new Map();
  for (const row of operationRows) {
    const operation = operationRowToRecord(row);
    if (!operationsByPackageId.has(row.package_id)) operationsByPackageId.set(row.package_id, []);
    operationsByPackageId.get(row.package_id).push(operation);
  }
  return releases.map((release) => {
    if (!release?.packageId) {
      return {
        ...release,
        history: buildReleaseHistorySummary({ release, ...context }),
      };
    }
    return {
      ...release,
      history: buildReleaseHistorySummary({
        release,
        contentPackage: packagesById.get(release.packageId) || null,
        approval: approvalsByPackageId.get(release.packageId) || null,
        operations: operationsByPackageId.get(release.packageId) || [],
        ...context,
      }),
    };
  });
}

function releaseDriftConflict(packageRow, currentReleaseRow, baseReleaseRow) {
  const packageBaseReleaseId = packageRow.base_release_id || null;
  const currentReleaseId = currentReleaseRow?.release_id || null;
  const packageBaseReleaseHash = packageRow.base_release_hash || null;
  const currentReleaseHash = currentReleaseRow?.snapshot_hash || null;

  if (packageBaseReleaseId && !baseReleaseRow) {
    return {
      code: 'base_release_missing',
      packageBaseReleaseId,
      packageBaseReleaseHash,
      currentReleaseId,
      currentReleaseHash,
    };
  }

  if (
    packageBaseReleaseId !== currentReleaseId
    || packageBaseReleaseHash !== currentReleaseHash
  ) {
    return {
      code: 'base_release_changed',
      packageBaseReleaseId,
      packageBaseReleaseHash,
      currentReleaseId,
      currentReleaseHash,
    };
  }

  return null;
}

async function listReleaseOperationsAfterBase(db, subjectId, baseReleaseId, currentReleaseId) {
  if (!currentReleaseId || baseReleaseId === currentReleaseId) {
    return { complete: true, operations: [], releases: [] };
  }
  const releaseRows = await all(db, `
    SELECT release_id, package_id, published_at, created_at, rowid AS release_rowid
    FROM content_operation_releases
    WHERE subject_id = ? AND status = 'published'
    ORDER BY published_at ASC, created_at ASC, rowid ASC
  `, [subjectId]);
  const currentIndex = releaseRows.findIndex((row) => row.release_id === currentReleaseId);
  if (currentIndex < 0) {
    return {
      complete: false,
      operations: [],
      releases: [],
      reason: 'current_release_missing',
    };
  }
  const baseIndex = baseReleaseId
    ? releaseRows.findIndex((row) => row.release_id === baseReleaseId)
    : -1;
  if (baseReleaseId && baseIndex < 0) {
    return {
      complete: false,
      operations: [],
      releases: [],
      reason: 'base_release_missing',
    };
  }
  const driftRows = releaseRows.slice(baseIndex + 1, currentIndex + 1);
  const operations = [];
  for (const releaseRow of driftRows) {
    if (!releaseRow.package_id) {
      return {
        complete: false,
        operations,
        releases: driftRows,
        reason: 'release_without_package_operations',
        releaseId: releaseRow.release_id,
      };
    }
    const releasePackageOperations = await listPackageOperations(db, releaseRow.package_id);
    operations.push(...releasePackageOperations.map((operation) => ({
      ...operation,
      releaseId: releaseRow.release_id,
    })));
  }
  return {
    complete: true,
    operations,
    releases: driftRows,
  };
}

function conflictFieldValue(bundle, operation) {
  if (!operation) return null;
  if (!operation.fieldPath || operation.fieldPath === '$') {
    return cloneSerialisable(operation.payload ?? null);
  }
  if (!bundle) return null;
  const value = readContentOperationField(bundle, operation);
  return cloneSerialisable(value === undefined ? null : value);
}

function enrichReleaseConflicts(conflicts, {
  packageOperations = [],
  releaseOperations = [],
  baseSnapshot = null,
  currentSnapshot = null,
  candidateSnapshot = null,
} = {}) {
  const packageById = new Map(packageOperations.map((operation) => [operation.operationId, operation]));
  const releaseById = new Map(releaseOperations.map((operation) => [operation.operationId, operation]));
  return conflicts.map((conflict) => {
    const packageOperation = packageById.get(conflict.leftOperationId) || null;
    const currentOperation = releaseById.get(conflict.rightOperationId) || null;
    const fieldOperation = packageOperation || currentOperation || conflict;
    return {
      ...conflict,
      packageOperation,
      currentOperation,
      baseValue: conflictFieldValue(baseSnapshot, fieldOperation),
      packageValue: conflictFieldValue(candidateSnapshot, fieldOperation),
      currentValue: conflictFieldValue(currentSnapshot, fieldOperation),
    };
  });
}

function packageOperationsHash(operations = []) {
  return contentOperationHash(
    operations.map((operation) => normaliseContentOperation(operation, { now: () => 0 })),
    'ops',
  );
}

const TERMINAL_CONTENT_OPERATION_PACKAGE_STATES = new Set([
  CONTENT_OPERATION_PACKAGE_STATES.PUBLISHED,
  CONTENT_OPERATION_PACKAGE_STATES.REVERTED,
  CONTENT_OPERATION_PACKAGE_STATES.SUPERSEDED,
]);

function assertPackageIsNotPublished(packageRow, packageId) {
  if (packageRow.state === CONTENT_OPERATION_PACKAGE_STATES.PUBLISHED) {
    throw new ConflictError('Published content operation packages cannot be mutated.', {
      code: 'content_operation_package_published',
      packageId,
    });
  }
  if (TERMINAL_CONTENT_OPERATION_PACKAGE_STATES.has(packageRow.state)) {
    throw new ConflictError('Terminal content operation packages cannot be mutated.', {
      code: 'content_operation_package_terminal',
      packageId,
      state: packageRow.state,
    });
  }
}

export function createContentOperationsRepository({ db, env = {}, now }) {
  const nowFactory = typeof now === 'function' ? now : () => Date.now();

  return {
    async seedFirstContentOperationRelease({
      subjectId = CONTENT_OPERATION_SUBJECT_ID,
      seededByAccountId = null,
      proof = null,
    } = {}) {
      const resolvedSubjectId = normaliseSubjectId(subjectId);
      const existing = await readLatestReleaseRow(db, resolvedSubjectId, { includeSnapshot: true });
      if (existing) {
        return {
          ...await releaseRowToRecordAsync(existing, { includeSnapshot: true }),
          seeded: false,
          source: { type: 'existing_release' },
        };
      }

      const nowTs = Number(nowFactory());
      const legacy = await readLegacySubjectContentBundle(db, resolvedSubjectId);
      const seededBundle = legacy?.bundle || await readSeededSpellingContentBundle();
      const validation = validateSpellingContentBundle(seededBundle);
      if (!validation.ok) {
        throw new BadRequestError('First content operation release seed source is invalid.', {
          code: 'content_operation_seed_invalid',
          subjectId: resolvedSubjectId,
          validation: validationSummary(validation),
        });
      }

      const summary = buildSpellingContentSummary(validation.bundle);
      const releaseId = uid('corel');
      const publishedAt = nowTs;
      const snapshotHash = contentOperationHash(validation.bundle, 'release');
      const encodedSnapshot = await encodeContentOperationSnapshot(validation.bundle);
      const actor = normaliseString(seededByAccountId) || legacy?.source?.updatedByAccountId || null;
      const source = legacy?.source || { type: 'bundled_fallback' };
      const releaseProof = {
        ...(proof && typeof proof === 'object' && !Array.isArray(proof) ? proof : {}),
        seed: {
          source,
          summary,
        },
      };

      const seedResults = await batch(db, [
        bindStatement(db, `
          INSERT INTO content_operation_releases (
            release_id, subject_id, status, snapshot_json, snapshot_hash,
            base_release_id, package_id, published_at, published_by_account_id,
            rollback_of_release_id, proof_json, created_at
          )
          SELECT ?, ?, 'published', ?, ?, NULL, NULL, ?, ?, NULL, ?, ?
          WHERE NOT EXISTS (
            SELECT 1
            FROM content_operation_releases
            WHERE subject_id = ? AND status = 'published'
          )
        `, [
          releaseId,
          resolvedSubjectId,
          encodedSnapshot,
          snapshotHash,
          publishedAt,
          actor,
          JSON.stringify(releaseProof),
          nowTs,
          resolvedSubjectId,
        ]),
        bindStatement(db, `
          INSERT INTO content_operation_events (
            event_id, package_id, release_id, subject_id, event_type,
            actor_account_id, event_json, created_at
          )
          SELECT ?, NULL, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1
            FROM content_operation_releases
            WHERE release_id = ?
          )
          AND NOT EXISTS (
            SELECT 1
            FROM content_operation_releases
            WHERE subject_id = ? AND status = 'published' AND release_id <> ?
          )
        `, [
          uid('coevt'),
          releaseId,
          resolvedSubjectId,
          'release.seeded',
          actor,
          JSON.stringify({
            releaseId,
            snapshotHash,
            source,
            summary,
          }),
          nowTs,
          releaseId,
          resolvedSubjectId,
          releaseId,
        ]),
      ]);

      if (mutationChangeCount(seedResults[0]) < 1) {
        const winner = await readLatestReleaseRow(db, resolvedSubjectId, { includeSnapshot: true });
        return {
          ...await releaseRowToRecordAsync(winner, { includeSnapshot: true }),
          seeded: false,
          source: { type: 'existing_release' },
        };
      }

      return {
        releaseId,
        subjectId: resolvedSubjectId,
        status: 'published',
        snapshotHash,
        snapshot: validation.bundle,
        baseReleaseId: null,
        packageId: null,
        publishedAt,
        publishedByAccountId: actor,
        rollbackOfReleaseId: null,
        proof: releaseProof,
        createdAt: nowTs,
        seeded: true,
        source,
      };
    },

    async createContentOperationPackage({
      subjectId = CONTENT_OPERATION_SUBJECT_ID,
      templateId = 'general',
      title = '',
      description = '',
      createdByAccountId,
    } = {}) {
      const resolvedSubjectId = normaliseSubjectId(subjectId);
      const actor = normaliseString(createdByAccountId);
      if (!actor) throw new BadRequestError('Content operation packages require a creator account id.');
      const nowTs = Number(nowFactory());
      const latestRelease = await readLatestReleaseRow(db, resolvedSubjectId);
      const packageId = uid('copkg');
      const record = {
        packageId,
        subjectId: resolvedSubjectId,
        templateId: normaliseString(templateId, 'general'),
        title: normaliseString(title, 'Untitled content package'),
        description: normaliseString(description),
        baseReleaseId: latestRelease?.release_id || null,
        baseReleaseHash: latestRelease?.snapshot_hash || null,
        state: CONTENT_OPERATION_PACKAGE_STATES.DRAFT,
        createdByAccountId: actor,
        updatedByAccountId: actor,
        createdAt: nowTs,
        updatedAt: nowTs,
      };

      await batch(db, [
        bindStatement(db, `
          INSERT INTO content_operation_packages (
            package_id, subject_id, template_id, title, description,
            base_release_id, base_release_hash, state, created_by_account_id,
            updated_by_account_id, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          record.packageId,
          record.subjectId,
          record.templateId,
          record.title,
          record.description,
          record.baseReleaseId,
          record.baseReleaseHash,
          record.state,
          record.createdByAccountId,
          record.updatedByAccountId,
          record.createdAt,
          record.updatedAt,
        ]),
        bindStatement(db, `
          INSERT INTO content_operation_events (
            event_id, package_id, release_id, subject_id, event_type,
            actor_account_id, event_json, created_at
          )
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
        `, [
          uid('coevt'),
          record.packageId,
          record.subjectId,
          'package.created',
          actor,
          JSON.stringify({ templateId: record.templateId, title: record.title }),
          nowTs,
        ]),
      ]);

      return record;
    },

    async createContentOperationPackageRevert(sourcePackageId, {
      createdByAccountId,
      reason = '',
      title = '',
      description = '',
    } = {}) {
      const sourcePackageRow = await requirePackage(db, sourcePackageId);
      const actor = normaliseString(createdByAccountId);
      if (!actor) throw new BadRequestError('Package revert creation requires an actor account id.');
      const revertReason = normaliseString(reason);
      if (!revertReason) {
        throw new BadRequestError('Package revert creation requires a reason.', {
          code: 'content_operation_revert_reason_required',
          packageId: sourcePackageId,
        });
      }
      if (sourcePackageRow.state !== CONTENT_OPERATION_PACKAGE_STATES.PUBLISHED) {
        throw new ConflictError('Only published content operation packages can be reverted.', {
          code: 'content_operation_package_not_published',
          packageId: sourcePackageId,
          state: sourcePackageRow.state,
        });
      }
      if (normaliseString(sourcePackageRow.superseded_by_package_id)) {
        throw new ConflictError('Content operation package already has a revert package.', {
          code: 'content_operation_revert_already_created',
          packageId: sourcePackageId,
          revertPackageId: sourcePackageRow.superseded_by_package_id,
        });
      }

      const sourceReleaseRow = await readReleaseRowByPackageId(
        db,
        sourcePackageRow.subject_id,
        sourcePackageId,
        { includeSnapshot: true },
      );
      const sourceRelease = await releaseRowToRecordAsync(sourceReleaseRow, { includeSnapshot: true });
      if (!sourceRelease?.snapshot) {
        throw new ConflictError('Published package release was not found for package revert.', {
          code: 'content_operation_package_release_missing',
          packageId: sourcePackageId,
        });
      }
      const sourceBaseReleaseId = sourcePackageRow.base_release_id || sourceRelease.baseReleaseId || null;
      const sourceBaseReleaseRow = sourceBaseReleaseId
        ? await readReleaseRowById(db, sourcePackageRow.subject_id, sourceBaseReleaseId, { includeSnapshot: true })
        : null;
      if (sourceBaseReleaseId && !sourceBaseReleaseRow) {
        throw new ConflictError('Published package base release was not found for package revert.', {
          code: 'content_operation_package_base_release_missing',
          packageId: sourcePackageId,
          baseReleaseId: sourceBaseReleaseId,
        });
      }
      const sourceBaseRelease = await releaseRowToRecordAsync(sourceBaseReleaseRow, { includeSnapshot: true });
      const sourceBaseSnapshot = sourceBaseRelease?.snapshot || await readSeededSpellingContentBundle();
      const sourceOperations = await listPackageOperations(db, sourcePackageId);
      if (!sourceOperations.length) {
        throw new ConflictError('Published package has no operations to revert.', {
          code: 'content_operation_revert_no_operations',
          packageId: sourcePackageId,
        });
      }

      const nowTs = Number(nowFactory());
      const inverse = buildContentOperationRevertOperations({
        sourceBaseSnapshot,
        operations: sourceOperations,
        reason: revertReason,
        now: () => nowTs,
        sourcePackageId,
        sourceReleaseId: sourceRelease.releaseId,
      });
      const replayedHash = contentOperationHash(inverse.replayedSnapshot, 'release');
      if (replayedHash !== sourceRelease.snapshotHash) {
        throw new ConflictError('Published package operations no longer replay to the source release.', {
          code: 'content_operation_revert_source_replay_mismatch',
          packageId: sourcePackageId,
          releaseId: sourceRelease.releaseId,
          expectedSnapshotHash: sourceRelease.snapshotHash,
          replayedSnapshotHash: replayedHash,
        });
      }
      if (!inverse.operations.length) {
        throw new ConflictError('Published package has no snapshot-changing operations to revert.', {
          code: 'content_operation_revert_no_operations',
          packageId: sourcePackageId,
          skippedOperations: inverse.skippedOperations,
        });
      }

      const revertPackageId = uid('copkg');
      const normalisedInverseOperations = inverse.operations.map((operation) => normaliseContentOperation(operation, {
        actorAccountId: actor,
        now: () => nowTs,
        operationId: uid('coop'),
      }));
      const record = {
        packageId: revertPackageId,
        subjectId: sourcePackageRow.subject_id,
        templateId: 'package-revert',
        title: normaliseString(title, `Revert: ${sourcePackageRow.title || sourcePackageId}`),
        description: normaliseString(
          description,
          `Package-level revert of ${sourcePackageId}. Reason: ${revertReason}`,
        ),
        baseReleaseId: sourceRelease.releaseId,
        baseReleaseHash: sourceRelease.snapshotHash,
        state: CONTENT_OPERATION_PACKAGE_STATES.DRAFT,
        createdByAccountId: actor,
        updatedByAccountId: actor,
        createdAt: nowTs,
        updatedAt: nowTs,
      };
      const lineage = {
        revertOfPackageId: sourcePackageId,
        revertOfReleaseId: sourceRelease.releaseId,
        revertReason,
        sourcePackageTitle: sourcePackageRow.title || '',
        sourceReleaseSnapshotHash: sourceRelease.snapshotHash,
        sourceBaseReleaseId,
        sourceBaseReleaseHash: sourcePackageRow.base_release_hash || sourceBaseRelease?.snapshotHash || null,
        inverseOperationIds: normalisedInverseOperations.map((operation) => operation.operationId),
        skippedOperations: inverse.skippedOperations,
      };

      await batch(db, [
        bindStatement(db, `
          INSERT INTO content_operation_packages (
            package_id, subject_id, template_id, title, description,
            base_release_id, base_release_hash, state, created_by_account_id,
            updated_by_account_id, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          record.packageId,
          record.subjectId,
          record.templateId,
          record.title,
          record.description,
          record.baseReleaseId,
          record.baseReleaseHash,
          record.state,
          record.createdByAccountId,
          record.updatedByAccountId,
          record.createdAt,
          record.updatedAt,
        ]),
        ...normalisedInverseOperations.map((operation, index) => bindStatement(db, `
          INSERT INTO content_operation_package_operations (
            operation_id, package_id, operation_order, entity_type, entity_id,
            field_path, action, before_hash, after_hash, payload_json,
            created_by_account_id, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          operation.operationId,
          record.packageId,
          index + 1,
          operation.entityType,
          operation.entityId,
          operation.fieldPath,
          operation.action,
          operation.beforeHash || null,
          operation.afterHash || null,
          JSON.stringify(operation.payload),
          operation.createdByAccountId,
          operation.createdAt,
        ])),
        bindStatement(db, `
          INSERT INTO content_operation_events (
            event_id, package_id, release_id, subject_id, event_type,
            actor_account_id, event_json, created_at
          )
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
        `, [
          uid('coevt'),
          record.packageId,
          record.subjectId,
          'package.revert_created',
          actor,
          JSON.stringify(lineage),
          nowTs,
        ]),
        bindStatement(db, `
          INSERT INTO content_operation_events (
            event_id, package_id, release_id, subject_id, event_type,
            actor_account_id, event_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          uid('coevt'),
          sourcePackageId,
          sourceRelease.releaseId,
          record.subjectId,
          'package.revert_requested',
          actor,
          JSON.stringify({
            ...lineage,
            revertPackageId: record.packageId,
          }),
          nowTs,
        ]),
      ]);

      const candidate = await this.buildContentOperationCandidate(record.packageId, {
        actorAccountId: actor,
      });
      const contentPackage = await this.readContentOperationPackage(record.packageId, {
        includeOperations: true,
      });
      return {
        package: contentPackage,
        candidate,
        source: {
          packageId: sourcePackageId,
          releaseId: sourceRelease.releaseId,
          snapshotHash: sourceRelease.snapshotHash,
        },
        skippedOperations: inverse.skippedOperations,
      };
    },

    async readContentOperationPackage(packageId, { includeOperations = true } = {}) {
      const row = await requirePackage(db, packageId);
      const record = packageRowToRecord(row);
      record.latestCandidate = await readLatestCandidateForPackage(db, packageId);
      if (includeOperations) {
        record.operations = await listPackageOperations(db, packageId);
      }
      return record;
    },

    async readLatestContentOperationCandidate(packageId, {
      includeSnapshot = false,
      requireCurrent = false,
    } = {}) {
      const packageRow = await requirePackage(db, packageId);
      const row = await first(db, `
        SELECT *
        FROM content_operation_package_candidates
        WHERE package_id = ?
        ORDER BY created_at DESC, candidate_id DESC
        LIMIT 1
      `, [packageId]);
      if (!row) return null;
      if (!requireCurrent) {
        return candidateRowToRecordAsync(row, { includeSnapshot });
      }
      const record = candidateRowToRecord(row, { includeSnapshot: false });

      const operations = await listPackageOperations(db, packageId);
      const currentOperationsHash = packageOperationsHash(operations);
      const currentReleaseRow = await readLatestReleaseRow(db, packageRow.subject_id);
      const latestReleaseId = currentReleaseRow?.release_id || null;
      const staleReasons = [];
      if (record.operationsHash !== currentOperationsHash) {
        staleReasons.push('operations_stale');
      }
      if ((record.currentReleaseId || null) !== latestReleaseId) {
        staleReasons.push('release_stale');
      }
      const candidate = staleReasons.length || !includeSnapshot
        ? null
        : (await candidateRowToRecordAsync(row, { includeSnapshot: true }))?.candidate || null;
      return {
        ...record,
        candidate,
        isCurrent: staleReasons.length === 0,
        staleReasons,
        expectedOperationsHash: currentOperationsHash,
        latestReleaseId,
      };
    },

    async updateContentOperationPackage(packageId, {
      templateId = undefined,
      title = undefined,
      description = undefined,
    } = {}, { actorAccountId } = {}) {
      const packageRow = await requirePackage(db, packageId);
      assertPackageIsNotPublished(packageRow, packageId);
      const actor = normaliseString(actorAccountId);
      if (!actor) throw new BadRequestError('Content operation package updates require an actor account id.');
      const nowTs = Number(nowFactory());
      const nextTemplateId = templateId === undefined
        ? packageRow.template_id
        : normaliseString(templateId, packageRow.template_id);
      const nextTitle = title === undefined
        ? packageRow.title
        : normaliseString(title, packageRow.title || 'Untitled content package');
      const nextDescription = description === undefined
        ? (packageRow.description || '')
        : normaliseString(description);

      await batch(db, [
        bindStatement(db, `
          DELETE FROM content_operation_package_approvals
          WHERE package_id = ?
        `, [packageId]),
        bindStatement(db, `
          UPDATE content_operation_packages
          SET template_id = ?, title = ?, description = ?,
              state = ?, approved_at = NULL,
              updated_by_account_id = ?, updated_at = ?
          WHERE package_id = ?
        `, [
          nextTemplateId,
          nextTitle,
          nextDescription,
          CONTENT_OPERATION_PACKAGE_STATES.DRAFT,
          actor,
          nowTs,
          packageId,
        ]),
        bindStatement(db, `
          INSERT INTO content_operation_events (
            event_id, package_id, release_id, subject_id, event_type,
            actor_account_id, event_json, created_at
          )
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
        `, [
          uid('coevt'),
          packageId,
          packageRow.subject_id,
          'package.updated',
          actor,
          JSON.stringify({
            templateId: nextTemplateId,
            title: nextTitle,
            description: nextDescription,
          }),
          nowTs,
        ]),
      ]);

      return packageRowToRecord(await requirePackage(db, packageId));
    },

    async listContentOperationPackages({ subjectId = CONTENT_OPERATION_SUBJECT_ID, state = null, limit = 50 } = {}) {
      const resolvedSubjectId = normaliseSubjectId(subjectId);
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
      const params = [resolvedSubjectId];
      let where = 'subject_id = ?';
      if (state) {
        where += ' AND state = ?';
        params.push(state);
      }
      params.push(safeLimit);
      const rows = await all(db, `
        SELECT *
        FROM content_operation_packages
        WHERE ${where}
        ORDER BY updated_at DESC
        LIMIT ?
      `, params);
      return attachLatestCandidatesToPackages(db, rows.map(packageRowToRecord));
    },

    async appendContentOperation(packageId, rawOperation, { actorAccountId } = {}) {
      const packageRow = await requirePackage(db, packageId);
      assertPackageIsNotPublished(packageRow, packageId);
      const actor = normaliseString(actorAccountId);
      if (!actor) throw new BadRequestError('Content operations require an actor account id.');
      const nowTs = Number(nowFactory());
      const nextOrder = Number(await first(db, `
        SELECT COALESCE(MAX(operation_order), 0) + 1 AS next_order
        FROM content_operation_package_operations
        WHERE package_id = ?
      `, [packageId]).then((row) => row?.next_order || 1));
      const operationId = uid('coop');
      const operation = normaliseContentOperation(rawOperation, {
        actorAccountId: actor,
        now: () => nowTs,
        operationId,
      });

      await batch(db, [
        bindStatement(db, `
          INSERT INTO content_operation_package_operations (
            operation_id, package_id, operation_order, entity_type, entity_id,
            field_path, action, before_hash, after_hash, payload_json,
            created_by_account_id, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          operation.operationId,
          packageId,
          nextOrder,
          operation.entityType,
          operation.entityId,
          operation.fieldPath,
          operation.action,
          operation.beforeHash || null,
          operation.afterHash || null,
          JSON.stringify(operation.payload),
          operation.createdByAccountId,
          operation.createdAt,
        ]),
        bindStatement(db, `
          DELETE FROM content_operation_package_approvals
          WHERE package_id = ?
        `, [packageId]),
        bindStatement(db, `
          UPDATE content_operation_packages
          SET state = ?, approved_at = NULL, updated_by_account_id = ?, updated_at = ?
          WHERE package_id = ?
        `, [
          CONTENT_OPERATION_PACKAGE_STATES.DRAFT,
          actor,
          nowTs,
          packageId,
        ]),
        bindStatement(db, `
          INSERT INTO content_operation_events (
            event_id, package_id, release_id, subject_id, event_type,
            actor_account_id, event_json, created_at
          )
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
        `, [
          uid('coevt'),
          packageId,
          packageRow.subject_id,
          'operation.appended',
          actor,
          JSON.stringify({
            operationId: operation.operationId,
            entityType: operation.entityType,
            entityId: operation.entityId,
            fieldPath: operation.fieldPath,
            action: operation.action,
          }),
          nowTs,
        ]),
      ]);

      return { ...operation, packageId, operationOrder: nextOrder };
    },

    async deleteContentOperation(packageId, operationId, { actorAccountId } = {}) {
      const packageRow = await requirePackage(db, packageId);
      assertPackageIsNotPublished(packageRow, packageId);
      const actor = normaliseString(actorAccountId);
      if (!actor) throw new BadRequestError('Content operation deletes require an actor account id.');
      const operationRow = await first(db, `
        SELECT *
        FROM content_operation_package_operations
        WHERE package_id = ? AND operation_id = ?
      `, [packageId, operationId]);
      if (!operationRow) {
        throw new NotFoundError('Content operation was not found.', {
          code: 'content_operation_not_found',
          packageId,
          operationId,
        });
      }
      const operation = operationRowToRecord(operationRow);
      const nowTs = Number(nowFactory());

      await batch(db, [
        bindStatement(db, `
          DELETE FROM content_operation_package_operations
          WHERE package_id = ? AND operation_id = ?
        `, [packageId, operationId]),
        bindStatement(db, `
          DELETE FROM content_operation_package_approvals
          WHERE package_id = ?
        `, [packageId]),
        bindStatement(db, `
          UPDATE content_operation_packages
          SET state = ?, approved_at = NULL, updated_by_account_id = ?, updated_at = ?
          WHERE package_id = ?
        `, [
          CONTENT_OPERATION_PACKAGE_STATES.DRAFT,
          actor,
          nowTs,
          packageId,
        ]),
        bindStatement(db, `
          INSERT INTO content_operation_events (
            event_id, package_id, release_id, subject_id, event_type,
            actor_account_id, event_json, created_at
          )
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
        `, [
          uid('coevt'),
          packageId,
          packageRow.subject_id,
          'operation.deleted',
          actor,
          JSON.stringify({
            operationId: operation.operationId,
            entityType: operation.entityType,
            entityId: operation.entityId,
            fieldPath: operation.fieldPath,
            action: operation.action,
          }),
          nowTs,
        ]),
      ]);

      return {
        packageId,
        operationId,
        deleted: true,
        operation,
      };
    },

    async buildContentOperationCandidate(packageId, { actorAccountId = null } = {}) {
      const packageRow = await requirePackage(db, packageId);
      assertPackageIsNotPublished(packageRow, packageId);
      const operations = await listPackageOperations(db, packageId);
      const currentReleaseRow = await readLatestReleaseRow(db, packageRow.subject_id, { includeSnapshot: true });
      const baseReleaseRow = await readReleaseRowById(
        db,
        packageRow.subject_id,
        packageRow.base_release_id,
        { includeSnapshot: true },
      );
      const baseRelease = await releaseRowToRecordAsync(baseReleaseRow, { includeSnapshot: true });
      const baseSnapshot = baseRelease?.snapshot
        ? baseRelease.snapshot
        : await readSeededSpellingContentBundle();
      const currentRelease = await releaseRowToRecordAsync(currentReleaseRow, { includeSnapshot: true });
      const currentSnapshot = currentRelease?.snapshot || baseSnapshot;
      const packageBaseReleaseId = packageRow.base_release_id || null;
      const currentReleaseId = currentReleaseRow?.release_id || null;
      const releaseChanged = (
        packageBaseReleaseId !== currentReleaseId
        || (packageRow.base_release_hash || null) !== (currentReleaseRow?.snapshot_hash || null)
      );
      let candidateBaseSnapshot = baseSnapshot;
      let releaseOperations = [];
      let releaseConflicts = [];
      let driftConflict = null;
      let detectedReleaseConflicts = [];
      if (releaseChanged && currentReleaseRow) {
        const drift = await listReleaseOperationsAfterBase(
          db,
          packageRow.subject_id,
          packageBaseReleaseId,
          currentReleaseId,
        );
        if (drift.complete) {
          releaseOperations = drift.operations;
          detectedReleaseConflicts = detectContentOperationConflicts(operations, releaseOperations);
          const hasStructuralReleaseConflict = detectedReleaseConflicts.some((conflict) => (
            conflict.code === 'structural_conflict'
            || !conflict.fieldPath
            || conflict.fieldPath === '$'
          ));
          candidateBaseSnapshot = hasStructuralReleaseConflict ? baseSnapshot : currentSnapshot;
        } else {
          driftConflict = {
            ...releaseDriftConflict(packageRow, currentReleaseRow, baseReleaseRow),
            reason: drift.reason || 'release_drift_unresolved',
            releaseId: drift.releaseId || null,
          };
        }
      }
      const candidate = buildSpellingContentOperationCandidate(candidateBaseSnapshot, operations);
      if (releaseOperations.length) {
        releaseConflicts = enrichReleaseConflicts(
          detectedReleaseConflicts,
          {
            packageOperations: operations,
            releaseOperations,
            baseSnapshot,
            currentSnapshot,
            candidateSnapshot: candidate.candidate,
          },
        );
      }
      const conflicts = [
        ...(candidate.conflicts || []),
        ...releaseConflicts,
        driftConflict,
      ].filter(Boolean);
      const audioScan = await buildContentOperationAudioScan({
        db,
        packageId,
        candidate: candidate.candidate,
        operations,
      });
      const assetScan = await buildContentOperationAssetScan(db, {
        packageId,
        env,
        verifyStorage: true,
      });
      const candidateId = uid('cocand');
      const nowTs = Number(nowFactory());
      const validationSummary = {
        ok: Boolean(candidate.validation.ok),
        errorCount: candidate.validation.errors.length,
        warningCount: candidate.validation.warnings.length,
        errors: candidate.validation.errors,
        warnings: candidate.validation.warnings,
      };
      const encodedCandidateSnapshot = await encodeContentOperationSnapshot(candidate.candidate);

      await batch(db, [
        bindStatement(db, `
          INSERT INTO content_operation_package_candidates (
            candidate_id, package_id, base_release_id, current_release_id,
            operations_hash, candidate_hash, candidate_snapshot_json,
            validation_json, audio_scan_json, asset_scan_json, reward_scan_json,
            visibility_scan_json, conflicts_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
        `, [
          candidateId,
          packageId,
          packageRow.base_release_id || null,
          currentReleaseRow?.release_id || null,
          candidate.operationsHash,
          candidate.candidateHash,
          encodedCandidateSnapshot,
          JSON.stringify(validationSummary),
          JSON.stringify(audioScan),
          JSON.stringify(assetScan),
          JSON.stringify(conflicts),
          nowTs,
        ]),
        bindStatement(db, `
          UPDATE content_operation_packages
          SET updated_by_account_id = ?, updated_at = ?
          WHERE package_id = ?
        `, [
          normaliseString(actorAccountId, packageRow.updated_by_account_id),
          nowTs,
          packageId,
        ]),
        bindStatement(db, `
          INSERT INTO content_operation_events (
            event_id, package_id, release_id, subject_id, event_type,
            actor_account_id, event_json, created_at
          )
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
        `, [
          uid('coevt'),
          packageId,
          packageRow.subject_id,
          'candidate.built',
          normaliseString(actorAccountId) || null,
          JSON.stringify({
            candidateId,
            candidateHash: candidate.candidateHash,
            operationsHash: candidate.operationsHash,
            validation: validationSummary,
            audio: {
              status: audioScan.status,
              blockers: audioScan.blockers,
              requiredCount: audioScan.requiredCount,
            },
            assets: assetEventSummary(assetScan),
          }),
          nowTs,
        ]),
      ]);

      return {
        candidateId,
        packageId,
        baseReleaseId: packageRow.base_release_id || null,
        currentReleaseId: currentReleaseRow?.release_id || null,
        operationsHash: candidate.operationsHash,
        candidateHash: candidate.candidateHash,
        candidate: candidate.candidate,
        validation: validationSummary,
        audioScan,
        assetScan,
        conflicts,
        createdAt: nowTs,
      };
    },

    async resolveContentOperationConflict(packageId, request = {}, { actorAccountId } = {}) {
      const {
        conflictId = '',
        conflict = null,
        resolution = '',
        value = undefined,
      } = request && typeof request === 'object' && !Array.isArray(request) ? request : {};
      const actor = normaliseString(actorAccountId);
      if (!actor) throw new BadRequestError('Content operation conflict resolution requires an actor account id.');
      const requestedResolution = normaliseString(resolution).toLowerCase();
      if (!['package', 'current', 'edit'].includes(requestedResolution)) {
        throw new BadRequestError('Content operation conflict resolution is invalid.', {
          code: 'content_operation_conflict_resolution_invalid',
          resolution,
        });
      }
      const requestedConflict = conflict && typeof conflict === 'object' && !Array.isArray(conflict)
        ? conflict
        : {};
      const requestedConflictId = normaliseString(conflictId || requestedConflict.conflictId);
      const candidateBefore = await this.buildContentOperationCandidate(packageId, {
        actorAccountId: actor,
      });
      const match = requestedConflictId
        ? candidateBefore.conflicts.find((entry) => entry.conflictId === requestedConflictId)
        : candidateBefore.conflicts.find((entry) => (
          entry.entityType === requestedConflict.entityType
            && entry.entityId === requestedConflict.entityId
            && (entry.fieldPath || '$') === (requestedConflict.fieldPath || '$')
        ));
      if (!match) {
        throw new NotFoundError('Content operation conflict was not found.', {
          code: 'content_operation_conflict_not_found',
          packageId,
          conflictId: requestedConflictId,
        });
      }
      if (!match.fieldPath || match.fieldPath === '$' || match.code === 'structural_conflict') {
        throw new BadRequestError('Only same-field content operation conflicts can be resolved in this workflow.', {
          code: 'content_operation_conflict_not_resolvable',
          packageId,
          conflictId: match.conflictId,
          conflictCode: match.code,
        });
      }

      const hasExplicitValue = Object.prototype.hasOwnProperty.call(request || {}, 'value');
      let payload;
      if (requestedResolution === 'package') {
        payload = cloneSerialisable(match.packageValue);
      } else if (requestedResolution === 'current') {
        payload = cloneSerialisable(match.currentValue);
      } else {
        if (!hasExplicitValue) {
          throw new BadRequestError('Edited content operation conflict resolution requires a value.', {
            code: 'content_operation_conflict_resolution_value_required',
            packageId,
            conflictId: match.conflictId,
          });
        }
        payload = cloneSerialisable(value);
      }

      const operation = await this.appendContentOperation(packageId, {
        entityType: match.entityType,
        entityId: match.entityId,
        fieldPath: match.fieldPath,
        action: 'set',
        payload,
        beforeHash: contentOperationValueHash(match.currentValue),
        afterHash: contentOperationValueHash(payload),
      }, {
        actorAccountId: actor,
      });
      const nowTs = Number(nowFactory());
      await insertContentOperationEvent(db, {
        packageId,
        subjectId: CONTENT_OPERATION_SUBJECT_ID,
        eventType: 'conflict.resolved',
        actorAccountId: actor,
        event: {
          conflictId: match.conflictId,
          resolution: requestedResolution,
          operationId: operation.operationId,
          entityType: match.entityType,
          entityId: match.entityId,
          fieldPath: match.fieldPath,
          currentValueHash: contentOperationValueHash(match.currentValue),
          resolvedValueHash: contentOperationValueHash(payload),
        },
        createdAt: nowTs,
      });
      const candidate = await this.buildContentOperationCandidate(packageId, {
        actorAccountId: actor,
      });
      return {
        packageId,
        conflict: match,
        operation,
        candidate,
        resolution: requestedResolution,
      };
    },

    async approveContentOperationCandidate(packageId, candidateId, {
      approvedByAccountId,
      notes = '',
      audioFallback = null,
    } = {}) {
      const packageRow = await requirePackage(db, packageId);
      assertPackageIsNotPublished(packageRow, packageId);
      const actor = normaliseString(approvedByAccountId);
      if (!actor) throw new BadRequestError('Content operation approval requires an approver account id.');
      const operations = await listPackageOperations(db, packageId);
      const currentOperationsHash = packageOperationsHash(operations);
      const currentReleaseRow = await readLatestReleaseRow(db, packageRow.subject_id);
      const candidateRow = await first(db, `
        SELECT *
        FROM content_operation_package_candidates
        WHERE package_id = ? AND candidate_id = ?
      `, [packageId, candidateId]);
      if (!candidateRow) {
        throw new NotFoundError('Content operation candidate was not found.', {
          code: 'content_operation_candidate_not_found',
          packageId,
          candidateId,
        });
      }
      const candidate = await candidateRowToRecordAsync(candidateRow, { includeSnapshot: true });
      if (!candidate?.candidate) {
        throw new ConflictError('Content operation candidate snapshot is unavailable.', {
          code: 'content_operation_candidate_snapshot_missing',
          packageId,
          candidateId,
        });
      }
      if (candidate.operationsHash !== currentOperationsHash) {
        throw new ConflictError('Content operation candidate was built from stale package operations.', {
          code: 'content_operation_candidate_operations_stale',
          packageId,
          candidateId,
          candidateOperationsHash: candidate.operationsHash,
          currentOperationsHash,
        });
      }
      if ((candidate.currentReleaseId || null) !== (currentReleaseRow?.release_id || null)) {
        throw new ConflictError('Content operation candidate was built against a stale release.', {
          code: 'content_operation_candidate_release_drift',
          packageId,
          candidateId,
          candidateCurrentReleaseId: candidate.currentReleaseId || null,
          currentReleaseId: currentReleaseRow?.release_id || null,
        });
      }
      if (!candidate.validation?.ok) {
        throw new ConflictError('Content operation candidate has validation blockers.', {
          code: 'content_operation_candidate_invalid',
          packageId,
          candidateId,
          validation: candidate.validation,
        });
      }
      const currentAudioScan = await buildContentOperationAudioScan({
        db,
        packageId,
        candidate: candidate.candidate,
        operations,
      });
      const currentAssetScan = await buildContentOperationAssetScan(db, {
        packageId,
        env,
        verifyStorage: true,
      });
      const nowTs = Number(nowFactory());
      let approvedAudioScan = currentAudioScan;
      let audioFallbackApproval = null;
      if (audioReadinessHasBlockingItems(currentAudioScan)) {
        if (audioFallback == null) {
          await persistCandidateAudioScan(db, candidateId, currentAudioScan);
          throw new ConflictError('Content operation candidate has audio readiness blockers.', {
            code: 'content_operation_candidate_audio_blocked',
            packageId,
            candidateId,
            audioScan: currentAudioScan,
          });
        }
        audioFallbackApproval = normaliseAudioFallbackApproval(audioFallback, currentAudioScan, {
          approvedByAccountId: actor,
          approvedAt: nowTs,
          notes,
        });
        if (!audioFallbackApproval) {
          await persistCandidateAudioScan(db, candidateId, currentAudioScan);
          throw new ConflictError('Content operation candidate has audio readiness blockers.', {
            code: 'content_operation_candidate_audio_blocked',
            packageId,
            candidateId,
            audioScan: currentAudioScan,
          });
        }
        approvedAudioScan = applyAudioFallbackToScan(currentAudioScan, audioFallbackApproval);
      }
      if (!candidateAssetScanMatches(candidate, currentAssetScan)) {
        throw new ConflictError('Content operation candidate was built from stale asset uploads.', {
          code: 'content_operation_candidate_assets_stale',
          ...assetScanConflictExtra(packageId, candidateId, candidate.assetScan, currentAssetScan),
        });
      }
      if (assetScanHasBlockingItems(currentAssetScan)) {
        throw new ConflictError('Content operation candidate has asset readiness blockers.', {
          code: 'content_operation_candidate_assets_blocked',
          packageId,
          candidateId,
          assetScan: currentAssetScan,
        });
      }
      if (Array.isArray(candidate.conflicts) && candidate.conflicts.length) {
        throw new ConflictError('Content operation candidate has unresolved conflicts.', {
          code: 'content_operation_candidate_conflicted',
          packageId,
          candidateId,
          conflicts: candidate.conflicts,
        });
      }

      const approvalId = uid('coapp');
      await batch(db, [
        bindStatement(db, `
          DELETE FROM content_operation_package_approvals
          WHERE package_id = ?
        `, [packageId]),
        bindStatement(db, `
          UPDATE content_operation_package_candidates
          SET audio_scan_json = ?,
              asset_scan_json = ?
          WHERE candidate_id = ?
        `, [
          JSON.stringify(approvedAudioScan),
          JSON.stringify(currentAssetScan),
          candidateId,
        ]),
        bindStatement(db, `
          INSERT INTO content_operation_package_approvals (
            approval_id, package_id, candidate_id, candidate_hash,
            approved_by_account_id, approved_at, notes, audio_fallback_json,
            asset_summary_json, validation_summary_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          approvalId,
          packageId,
          candidateId,
          candidate.candidateHash,
          actor,
          nowTs,
          normaliseString(notes),
          audioFallbackApproval == null ? null : JSON.stringify(audioFallbackApproval),
          JSON.stringify(buildApprovalAssetSummary(currentAssetScan)),
          JSON.stringify(candidate.validation),
        ]),
        bindStatement(db, `
          UPDATE content_operation_packages
          SET state = ?, approved_at = ?, updated_by_account_id = ?, updated_at = ?
          WHERE package_id = ?
        `, [
          CONTENT_OPERATION_PACKAGE_STATES.APPROVED,
          nowTs,
          actor,
          nowTs,
          packageId,
        ]),
        bindStatement(db, `
          INSERT INTO content_operation_events (
            event_id, package_id, release_id, subject_id, event_type,
            actor_account_id, event_json, created_at
          )
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
        `, [
          uid('coevt'),
          packageId,
          packageRow.subject_id,
          'package.approved',
          actor,
          JSON.stringify({
            approvalId,
            candidateId,
            candidateHash: candidate.candidateHash,
            notes: normaliseString(notes),
            validationSummary: candidate.validation,
            audio: {
              status: approvedAudioScan.status,
              blockers: approvedAudioScan.blockers,
              warnings: approvedAudioScan.warnings,
              requiredCount: approvedAudioScan.requiredCount,
            },
            audioFallback: audioFallbackApproval,
            assetSummary: buildApprovalAssetSummary(currentAssetScan),
          }),
          nowTs,
        ]),
      ]);

      return {
        approvalId,
        packageId,
        candidateId,
        candidateHash: candidate.candidateHash,
        approvedByAccountId: actor,
        approvedAt: nowTs,
        notes: normaliseString(notes),
        validationSummary: candidate.validation,
        audioFallback: audioFallbackApproval,
        assetSummary: buildApprovalAssetSummary(currentAssetScan),
      };
    },

    async publishContentOperationPackage(packageId, { publishedByAccountId, proof = null } = {}) {
      const packageRow = await requirePackage(db, packageId);
      const actor = normaliseString(publishedByAccountId);
      if (!actor) throw new BadRequestError('Content operation publish requires a publisher account id.');
      if (packageRow.state === CONTENT_OPERATION_PACKAGE_STATES.PUBLISHED) {
        throw new ConflictError('Content operation package was already published.', {
          code: 'content_operation_package_published',
          packageId,
        });
      }
      if (packageRow.state !== CONTENT_OPERATION_PACKAGE_STATES.APPROVED) {
        throw new ConflictError('Content operation package must be approved before publish.', {
          code: 'content_operation_package_not_approved',
          packageId,
          state: packageRow.state,
        });
      }
      const approvalRow = await first(db, `
        SELECT *
        FROM content_operation_package_approvals
        WHERE package_id = ?
        ORDER BY approved_at DESC
        LIMIT 1
      `, [packageId]);
      const approval = approvalRowToRecord(approvalRow);
      if (!approval) {
        throw new ConflictError('Content operation package has no approval.', {
          code: 'content_operation_approval_missing',
          packageId,
        });
      }
      const candidateRow = await first(db, `
        SELECT *
        FROM content_operation_package_candidates
        WHERE package_id = ? AND candidate_id = ?
      `, [packageId, approval.candidateId]);
      const candidate = await candidateRowToRecordAsync(candidateRow, { includeSnapshot: true });
      if (!candidate || candidate.candidateHash !== approval.candidateHash) {
        throw new ConflictError('Content operation approval does not match the candidate hash.', {
          code: 'content_operation_approval_hash_mismatch',
          packageId,
        });
      }
      const operations = await listPackageOperations(db, packageId);
      const currentOperationsHash = packageOperationsHash(operations);
      if (candidate.operationsHash !== currentOperationsHash) {
        throw new ConflictError('Content operation candidate was built from stale package operations.', {
          code: 'content_operation_candidate_operations_stale',
          packageId,
          candidateId: candidate.candidateId,
          candidateOperationsHash: candidate.operationsHash,
          currentOperationsHash,
        });
      }
      const currentReleaseRow = await readLatestReleaseRow(db, packageRow.subject_id);
      if (!currentReleaseRow) {
        throw new ConflictError('First global content operation release must be seeded before package publish.', {
          code: 'content_operation_first_release_required',
          packageId,
          subjectId: packageRow.subject_id,
        });
      }
      if ((candidate.currentReleaseId || null) !== (currentReleaseRow?.release_id || null)) {
        throw new ConflictError('A newer content operation release was published after approval.', {
          code: 'content_operation_release_drift',
          packageId,
          candidateCurrentReleaseId: candidate.currentReleaseId || null,
          currentReleaseId: currentReleaseRow?.release_id || null,
        });
      }
      const validation = validateSpellingContentBundle(candidate.candidate);
      if (!validation.ok) {
        throw new ConflictError('Approved candidate no longer validates.', {
          code: 'content_operation_candidate_invalid',
          packageId,
          validation,
        });
      }
      const currentAudioScan = await buildContentOperationAudioScan({
        db,
        packageId,
        candidate: candidate.candidate,
        operations,
      });
      const currentAssetScan = await buildContentOperationAssetScan(db, {
        packageId,
        env,
        verifyStorage: true,
      });
      let publishAudioScan = currentAudioScan;
      if (audioReadinessHasBlockingItems(currentAudioScan)) {
        if (audioFallbackCoversCurrentScan(approval.audioFallback, currentAudioScan)) {
          publishAudioScan = applyAudioFallbackToScan(currentAudioScan, approval.audioFallback);
        } else {
          await persistCandidateAudioScan(db, candidate.candidateId, currentAudioScan);
          throw new ConflictError('Approved candidate has audio readiness blockers.', {
            code: 'content_operation_candidate_audio_blocked',
            packageId,
            candidateId: candidate.candidateId,
            audioScan: currentAudioScan,
          });
        }
      }
      if (!candidateAssetScanMatches(candidate, currentAssetScan)) {
        throw new ConflictError('Content operation candidate was built from stale asset uploads.', {
          code: 'content_operation_candidate_assets_stale',
          ...assetScanConflictExtra(packageId, candidate.candidateId, candidate.assetScan, currentAssetScan),
        });
      }
      if (!approvedAssetSummaryMatches(approval, currentAssetScan)) {
        throw new ConflictError('Content operation approval was built from stale asset uploads.', {
          code: 'content_operation_approval_assets_stale',
          packageId,
          candidateId: candidate.candidateId,
          approvalId: approval.approvalId,
          approvalAssetHash: normaliseString(approval.assetSummary?.hash) || null,
          currentAssetHash: normaliseString(currentAssetScan?.hash) || null,
          assetScan: currentAssetScan,
        });
      }
      if (assetScanHasBlockingItems(currentAssetScan)) {
        throw new ConflictError('Approved candidate has asset readiness blockers.', {
          code: 'content_operation_candidate_assets_blocked',
          packageId,
          candidateId: candidate.candidateId,
          assetScan: currentAssetScan,
        });
      }
      const releaseId = uid('corel');
      const nowTs = Number(nowFactory());
      const snapshotHash = contentOperationHash(candidate.candidate, 'release');
      const encodedSnapshot = await encodeContentOperationSnapshot(candidate.candidate);
      const releaseProof = buildReleaseProof(proof, approval, publishAudioScan, currentAssetScan);
      const releaseAudioProof = audioReleaseProofFromProof(releaseProof);
      const releaseAssetProof = releaseAssetProofFromProof(releaseProof);
      const revertSource = await readPackageRevertSource(db, packageId);
      if (revertSource) {
        const sourcePackageRow = await requirePackage(db, revertSource.revertOfPackageId);
        const sourceSupersededByPackageId = normaliseString(sourcePackageRow.superseded_by_package_id);
        if (
          sourcePackageRow.subject_id !== packageRow.subject_id
          || sourcePackageRow.state !== CONTENT_OPERATION_PACKAGE_STATES.PUBLISHED
          || sourceSupersededByPackageId
        ) {
          throw new ConflictError('Package revert source has already been superseded.', {
            code: 'content_operation_revert_source_superseded',
            packageId,
            revertOfPackageId: revertSource.revertOfPackageId,
            sourceState: sourcePackageRow.state,
            supersededByPackageId: sourceSupersededByPackageId || null,
          });
        }
      }

      let publishResults = [];
      try {
        publishResults = await batch(db, [
          bindStatement(db, `
            INSERT INTO content_operation_releases (
              release_id, subject_id, status, snapshot_json, snapshot_hash,
              base_release_id, package_id, published_at, published_by_account_id,
              rollback_of_release_id, proof_json, created_at
            )
            SELECT ?, ?, 'published', ?, ?, ?, ?, ?, ?, NULL, ?, ?
            WHERE EXISTS (
              SELECT 1
              FROM content_operation_packages
              WHERE package_id = ? AND state = ?
            )
            AND ? = (${latestPublishedReleaseIdSql()})
          `, [
            releaseId,
            packageRow.subject_id,
            encodedSnapshot,
            snapshotHash,
            candidate.currentReleaseId || packageRow.base_release_id || null,
            packageId,
            nowTs,
            actor,
            releaseProof == null ? null : JSON.stringify(releaseProof),
            nowTs,
            packageId,
            CONTENT_OPERATION_PACKAGE_STATES.APPROVED,
            currentReleaseRow.release_id,
            packageRow.subject_id,
          ]),
          bindStatement(db, `
            UPDATE content_operation_package_candidates
            SET audio_scan_json = ?,
                asset_scan_json = ?
            WHERE candidate_id = ?
          `, [
            JSON.stringify(publishAudioScan),
            JSON.stringify(currentAssetScan),
            candidate.candidateId,
          ]),
          bindStatement(db, `
            UPDATE content_operation_packages
            SET state = ?, published_at = ?, updated_by_account_id = ?, updated_at = ?
            WHERE package_id = ?
              AND state = ?
              AND EXISTS (
                SELECT 1
                FROM content_operation_releases
                WHERE release_id = ?
              )
          `, [
            CONTENT_OPERATION_PACKAGE_STATES.PUBLISHED,
            nowTs,
            actor,
            nowTs,
            packageId,
            CONTENT_OPERATION_PACKAGE_STATES.APPROVED,
            releaseId,
          ]),
          bindStatement(db, `
            INSERT INTO content_operation_events (
              event_id, package_id, release_id, subject_id, event_type,
              actor_account_id, event_json, created_at
            )
            SELECT ?, ?, ?, ?, ?, ?, ?, ?
            WHERE EXISTS (
              SELECT 1
              FROM content_operation_releases
              WHERE release_id = ?
            )
          `, [
            uid('coevt'),
            packageId,
            releaseId,
            packageRow.subject_id,
            'package.published',
            actor,
            JSON.stringify({
              releaseId,
              candidateId: candidate.candidateId,
              candidateHash: candidate.candidateHash,
              snapshotHash,
              summary: buildSpellingContentSummary(candidate.candidate),
              audioFallback: approval.audioFallback,
              audioWarnings: audioWarningProofForScan(publishAudioScan, approval.audioFallback),
              assets: assetEventSummary(currentAssetScan),
            }),
            nowTs,
            releaseId,
          ]),
          ...(revertSource ? [
            bindStatement(db, `
              UPDATE content_operation_packages
              SET state = ?, superseded_by_package_id = ?,
                  updated_by_account_id = ?, updated_at = ?
              WHERE package_id = ?
                AND state = ?
                AND EXISTS (
                  SELECT 1
                  FROM content_operation_releases
                  WHERE release_id = ?
                )
            `, [
              CONTENT_OPERATION_PACKAGE_STATES.REVERTED,
              packageId,
              actor,
              nowTs,
              revertSource.revertOfPackageId,
              CONTENT_OPERATION_PACKAGE_STATES.PUBLISHED,
              releaseId,
            ]),
            bindStatement(db, `
              INSERT INTO content_operation_events (
                event_id, package_id, release_id, subject_id, event_type,
                actor_account_id, event_json, created_at
              )
              SELECT ?, ?, ?, ?, ?, ?, ?, ?
              WHERE EXISTS (
                SELECT 1
                FROM content_operation_releases
                WHERE release_id = ?
              )
            `, [
              uid('coevt'),
              revertSource.revertOfPackageId,
              releaseId,
              packageRow.subject_id,
              'package.reverted',
              actor,
              JSON.stringify({
                revertPackageId: packageId,
                revertReleaseId: releaseId,
                revertOfPackageId: revertSource.revertOfPackageId,
                revertOfReleaseId: revertSource.revertOfReleaseId,
                revertReason: revertSource.revertReason,
              }),
              nowTs,
              releaseId,
            ]),
            bindStatement(db, `
              INSERT INTO content_operation_events (
                event_id, package_id, release_id, subject_id, event_type,
                actor_account_id, event_json, created_at
              )
              SELECT ?, ?, ?, ?, ?, ?, ?, ?
              WHERE EXISTS (
                SELECT 1
                FROM content_operation_releases
                WHERE release_id = ?
              )
            `, [
              uid('coevt'),
              packageId,
              releaseId,
              packageRow.subject_id,
              'package.revert_published',
              actor,
              JSON.stringify({
                revertPackageId: packageId,
                revertReleaseId: releaseId,
                revertOfPackageId: revertSource.revertOfPackageId,
                revertOfReleaseId: revertSource.revertOfReleaseId,
                revertReason: revertSource.revertReason,
              }),
              nowTs,
              releaseId,
            ]),
          ] : []),
        ]);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ConflictError('Content operation package was already published.', {
            code: 'content_operation_package_published',
            packageId,
          });
        }
        throw error;
      }

      if (mutationChangeCount(publishResults[0]) < 1 || mutationChangeCount(publishResults[2]) < 1) {
        const latestPackageRow = await requirePackage(db, packageId);
        if (latestPackageRow.state === CONTENT_OPERATION_PACKAGE_STATES.PUBLISHED) {
          throw new ConflictError('Content operation package was already published.', {
            code: 'content_operation_package_published',
            packageId,
          });
        }
        if (latestPackageRow.state === CONTENT_OPERATION_PACKAGE_STATES.APPROVED) {
          const latestReleaseRow = await readLatestReleaseRow(db, packageRow.subject_id);
          throw new ConflictError('A newer content operation release was published before this package could publish.', {
            code: 'content_operation_release_drift',
            packageId,
            candidateCurrentReleaseId: candidate.currentReleaseId || null,
            currentReleaseId: latestReleaseRow?.release_id || null,
          });
        }
        throw new ConflictError('Content operation package must be approved before publish.', {
          code: 'content_operation_package_not_approved',
          packageId,
          state: latestPackageRow.state,
        });
      }

      const releaseRecord = {
        releaseId,
        packageId,
        subjectId: packageRow.subject_id,
        status: 'published',
        snapshotHash,
        snapshot: candidate.candidate,
        baseReleaseId: candidate.currentReleaseId || packageRow.base_release_id || null,
        publishedAt: nowTs,
        publishedByAccountId: actor,
        proof: releaseProof,
        audioFallback: releaseAudioProof.audioFallback,
        audioWarnings: releaseAudioProof.audioWarnings,
        assetSummary: releaseAssetProof.assetSummary,
        assetReferenceManifest: releaseAssetProof.assetReferenceManifest,
      };
      return {
        ...releaseRecord,
        history: buildReleaseHistorySummary({
          release: releaseRecord,
          contentPackage: {
            packageId,
            title: packageRow.title,
            templateId: packageRow.template_id,
            state: CONTENT_OPERATION_PACKAGE_STATES.PUBLISHED,
          },
          approval,
          operations,
          now: nowTs,
          env,
        }),
      };
    },

    async rollbackContentOperationRelease(subjectId = CONTENT_OPERATION_SUBJECT_ID, releaseId, {
      rolledBackByAccountId,
      reason = '',
      proof = null,
    } = {}) {
      const resolvedSubjectId = normaliseSubjectId(subjectId);
      const actor = normaliseString(rolledBackByAccountId);
      if (!actor) throw new BadRequestError('Content operation rollback requires an actor account id.');
      const suppliedRollbackProof = isPlainObject(proof?.rollback) ? proof.rollback : {};
      const rollbackReason = normaliseString(reason)
        || normaliseString(proof?.reason)
        || normaliseString(suppliedRollbackProof.reason);
      if (!rollbackReason) {
        throw new BadRequestError('Content operation rollback requires a reason.', {
          code: 'content_operation_rollback_reason_required',
          subjectId: resolvedSubjectId,
          releaseId,
        });
      }
      const targetRow = await readReleaseRowById(db, resolvedSubjectId, normaliseString(releaseId), {
        includeSnapshot: true,
      });
      const target = await releaseRowToRecordAsync(targetRow, { includeSnapshot: true });
      if (!target) {
        throw new NotFoundError('Content operation rollback target release was not found.', {
          code: 'content_operation_release_not_found',
          subjectId: resolvedSubjectId,
          releaseId,
        });
      }
      const currentRow = await readLatestReleaseRow(db, resolvedSubjectId);
      const validation = validateSpellingContentBundle(target.snapshot);
      if (!validation.ok) {
        throw new ConflictError('Rollback target no longer validates.', {
          code: 'content_operation_rollback_target_invalid',
          subjectId: resolvedSubjectId,
          releaseId,
          validation: validationSummary(validation),
        });
      }

      const nowTs = Number(nowFactory());
      const rollbackReleaseId = uid('corel');
      const snapshotHash = contentOperationHash(validation.bundle, 'release');
      const encodedSnapshot = await encodeContentOperationSnapshot(validation.bundle);
      const targetAssetProof = releaseAssetProofFromProof(target.proof);
      const rollbackProof = {
        ...(proof && typeof proof === 'object' && !Array.isArray(proof) ? proof : {}),
        ...(targetAssetProof.assetSummary || targetAssetProof.assetReferenceManifest ? {
          [RELEASE_ASSET_PROOF_KEY]: {
            assetSummary: cloneSerialisable(targetAssetProof.assetSummary),
            assetReferenceManifest: cloneSerialisable(targetAssetProof.assetReferenceManifest),
          },
        } : {}),
        rollback: {
          ...cloneSerialisable(suppliedRollbackProof),
          targetReleaseId: target.releaseId,
          targetSnapshotHash: target.snapshotHash,
          previousLatestReleaseId: currentRow?.release_id || null,
          reason: rollbackReason,
          approvedByAccountId: normaliseString(suppliedRollbackProof.approvedByAccountId, actor),
          publishedByAccountId: normaliseString(suppliedRollbackProof.publishedByAccountId, actor),
          approvalMode: normaliseString(suppliedRollbackProof.approvalMode, 'same-role-placeholder'),
          proofRequirement: normaliseString(suppliedRollbackProof.proofRequirement, 'production-proof-after-rollback'),
        },
      };

      const rollbackResults = await batch(db, [
        bindStatement(db, `
          INSERT INTO content_operation_releases (
            release_id, subject_id, status, snapshot_json, snapshot_hash,
            base_release_id, package_id, published_at, published_by_account_id,
            rollback_of_release_id, proof_json, created_at
          )
          SELECT ?, ?, 'published', ?, ?, ?, NULL, ?, ?, ?, ?, ?
          WHERE ? = (${latestPublishedReleaseIdSql()})
        `, [
          rollbackReleaseId,
          resolvedSubjectId,
          encodedSnapshot,
          snapshotHash,
          currentRow?.release_id || null,
          nowTs,
          actor,
          target.releaseId,
          JSON.stringify(rollbackProof),
          nowTs,
          currentRow?.release_id || null,
          resolvedSubjectId,
        ]),
        bindStatement(db, `
          INSERT INTO content_operation_events (
            event_id, package_id, release_id, subject_id, event_type,
            actor_account_id, event_json, created_at
          )
          SELECT ?, NULL, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1
            FROM content_operation_releases
            WHERE release_id = ?
          )
        `, [
          uid('coevt'),
          rollbackReleaseId,
          resolvedSubjectId,
          'release.rollback',
          actor,
          JSON.stringify({
            releaseId: rollbackReleaseId,
            rollbackOfReleaseId: target.releaseId,
            previousLatestReleaseId: currentRow?.release_id || null,
            snapshotHash,
            reason: rollbackReason,
          }),
          nowTs,
          rollbackReleaseId,
        ]),
      ]);

      if (mutationChangeCount(rollbackResults[0]) < 1) {
        const latestReleaseRow = await readLatestReleaseRow(db, resolvedSubjectId);
        throw new ConflictError('A newer content operation release was published before rollback could complete.', {
          code: 'content_operation_release_drift',
          subjectId: resolvedSubjectId,
          rollbackTargetReleaseId: target.releaseId,
          previousLatestReleaseId: currentRow?.release_id || null,
          currentReleaseId: latestReleaseRow?.release_id || null,
        });
      }

      return {
        releaseId: rollbackReleaseId,
        subjectId: resolvedSubjectId,
        status: 'published',
        snapshotHash,
        snapshot: validation.bundle,
        baseReleaseId: currentRow?.release_id || null,
        packageId: null,
        publishedAt: nowTs,
        publishedByAccountId: actor,
        rollbackOfReleaseId: target.releaseId,
        proof: rollbackProof,
        assetSummary: targetAssetProof.assetSummary,
        assetReferenceManifest: targetAssetProof.assetReferenceManifest,
        createdAt: nowTs,
      };
    },

    async captureContentOperationReleaseProof(subjectId = CONTENT_OPERATION_SUBJECT_ID, releaseId, {
      capturedByAccountId,
      proof = null,
    } = {}) {
      const actor = normaliseString(capturedByAccountId);
      const safeSubjectId = normaliseSubjectId(subjectId);
      const safeReleaseId = normaliseString(releaseId);
      if (!actor) throw new BadRequestError('Content operation release proof capture requires an account id.', {
        code: 'content_operation_release_proof_actor_required',
        releaseId: safeReleaseId,
      });
      const row = await readReleaseRowById(db, safeSubjectId, safeReleaseId, { includeSnapshot: false });
      if (!row) {
        throw new NotFoundError('Content operation release was not found.', {
          code: 'content_operation_release_not_found',
          releaseId: safeReleaseId,
        });
      }
      const release = await releaseRowToRecordAsync(row, { includeSnapshot: false });
      if (release.status !== 'published') {
        throw new ConflictError('Production proof can only be captured for published releases.', {
          code: 'content_operation_release_not_published',
          releaseId: safeReleaseId,
          status: release.status,
        });
      }
      const nowTs = Number(nowFactory());
      const capture = buildProductionProofCapture(proof, {
        releaseId: release.releaseId,
        capturedByAccountId: actor,
        capturedAt: nowTs,
      });
      const nextProof = {
        ...(isPlainObject(release.proof) ? release.proof : {}),
        [RELEASE_PRODUCTION_PROOF_KEY]: capture,
      };
      await batch(db, [
        bindStatement(db, `
          UPDATE content_operation_releases
          SET proof_json = ?
          WHERE subject_id = ? AND release_id = ?
        `, [
          JSON.stringify(nextProof),
          safeSubjectId,
          safeReleaseId,
        ]),
        bindStatement(db, `
          INSERT INTO content_operation_events (
            event_id, package_id, release_id, subject_id, event_type,
            actor_account_id, event_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          uid('coevt'),
          release.packageId || null,
          release.releaseId,
          safeSubjectId,
          'release.production_proof_captured',
          actor,
          JSON.stringify({
            releaseId: release.releaseId,
            capturedAt: nowTs,
            surfaces: Object.keys(capture.surfaces || {}),
          }),
          nowTs,
        ]),
      ]);
      return attachReleaseHistorySummary(db, {
        ...release,
        proof: nextProof,
      }, { now: nowTs, env });
    },

    async readLatestContentOperationRelease(subjectId = CONTENT_OPERATION_SUBJECT_ID, { includeSnapshot = false, includeHistory = false } = {}) {
      const row = await readLatestReleaseRow(db, normaliseSubjectId(subjectId), { includeSnapshot });
      const release = await releaseRowToRecordAsync(row, { includeSnapshot });
      return includeHistory ? attachReleaseHistorySummary(db, release, { now: nowFactory(), env }) : release;
    },

    async readContentOperationRelease(subjectId = CONTENT_OPERATION_SUBJECT_ID, releaseId, { includeSnapshot = false, includeHistory = false } = {}) {
      const row = await readReleaseRowById(db, normaliseSubjectId(subjectId), normaliseString(releaseId), {
        includeSnapshot,
      });
      const release = await releaseRowToRecordAsync(row, { includeSnapshot });
      return includeHistory ? attachReleaseHistorySummary(db, release, { now: nowFactory(), env }) : release;
    },

    async listContentOperationReleases({
      subjectId = CONTENT_OPERATION_SUBJECT_ID,
      includeSnapshot = false,
      includeHistory = false,
      limit = 20,
    } = {}) {
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
      const rows = await all(db, `
        SELECT
          release_id, subject_id, status, snapshot_hash,
          ${includeSnapshot ? 'snapshot_json' : 'NULL AS snapshot_json'},
          base_release_id, package_id, published_at, published_by_account_id,
          rollback_of_release_id, proof_json, created_at
        FROM content_operation_releases
        WHERE subject_id = ?
        ORDER BY published_at DESC, created_at DESC, rowid DESC
        LIMIT ?
      `, [normaliseSubjectId(subjectId), safeLimit]);
      const releases = await Promise.all(rows.map((row) => releaseRowToRecordAsync(row, { includeSnapshot })));
      return includeHistory ? attachReleaseHistorySummaries(db, releases, { now: nowFactory(), env }) : releases;
    },

    async listContentOperationEvents({ packageId = null, releaseId = null, subjectId = CONTENT_OPERATION_SUBJECT_ID, limit = 50 } = {}) {
      const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
      const params = [];
      const clauses = [];
      if (packageId) {
        clauses.push('package_id = ?');
        params.push(packageId);
      }
      if (releaseId) {
        clauses.push('release_id = ?');
        params.push(releaseId);
      }
      if (!packageId && !releaseId) {
        clauses.push('subject_id = ?');
        params.push(normaliseSubjectId(subjectId));
      }
      params.push(safeLimit);
      const rows = await all(db, `
        SELECT *
        FROM content_operation_events
        WHERE ${clauses.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ?
      `, params);
      return rows.map(eventRowToRecord);
    },

    async invalidateContentOperationPackageApproval(packageId, {
      actorAccountId,
      reason = '',
      event = {},
      eventType = 'audio.override',
    } = {}) {
      const packageRow = await requirePackage(db, packageId);
      assertPackageIsNotPublished(packageRow, packageId);
      const actor = normaliseString(actorAccountId);
      if (!actor) throw new BadRequestError('Content operation approval invalidation requires an actor account id.');
      const approvalRow = await first(db, `
        SELECT *
        FROM content_operation_package_approvals
        WHERE package_id = ?
        ORDER BY approved_at DESC
        LIMIT 1
      `, [packageId]);
      const nowTs = Number(nowFactory());
      const invalidatedApproval = Boolean(approvalRow);
      await batch(db, [
        bindStatement(db, `
          DELETE FROM content_operation_package_approvals
          WHERE package_id = ?
        `, [packageId]),
        bindStatement(db, `
          UPDATE content_operation_packages
          SET state = CASE WHEN state = ? THEN ? ELSE state END,
              approved_at = NULL,
              updated_by_account_id = ?,
              updated_at = ?
          WHERE package_id = ?
        `, [
          CONTENT_OPERATION_PACKAGE_STATES.APPROVED,
          CONTENT_OPERATION_PACKAGE_STATES.DRAFT,
          actor,
          nowTs,
          packageId,
        ]),
        bindStatement(db, `
          INSERT INTO content_operation_events (
            event_id, package_id, release_id, subject_id, event_type,
            actor_account_id, event_json, created_at
          )
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
        `, [
          uid('coevt'),
          packageId,
          packageRow.subject_id,
          normaliseString(eventType, 'audio.override'),
          actor,
          JSON.stringify({
            ...(isPlainObject(event) ? event : {}),
            reason: normaliseString(reason),
            invalidatedApproval,
            approvalId: approvalRow?.approval_id || null,
            candidateId: event?.candidateId || approvalRow?.candidate_id || null,
            invalidatedApprovalCandidateId: approvalRow?.candidate_id || null,
          }),
          nowTs,
        ]),
      ]);
      return {
        package: packageRowToRecord(await requirePackage(db, packageId)),
        invalidatedApproval,
        eventType: normaliseString(eventType, 'audio.override'),
        createdAt: nowTs,
      };
    },

    async recordContentOperationEvent(event) {
      const createdAt = Number(event?.createdAt) || Number(nowFactory());
      const eventId = await insertContentOperationEvent(db, {
        ...event,
        subjectId: normaliseSubjectId(event?.subjectId),
        createdAt,
      });
      return { eventId, createdAt };
    },
  };
}
