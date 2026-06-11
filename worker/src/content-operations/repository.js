import { uid } from '../../../src/platform/core/utils.js';
import {
  buildSpellingContentOperationCandidate,
  CONTENT_OPERATION_PACKAGE_STATES,
  CONTENT_OPERATION_SUBJECT_ID,
  contentOperationHash,
  normaliseContentOperation,
} from '../../../src/subjects/spelling/content/operations-model.js';
import {
  buildSpellingContentSummary,
  validateSpellingContentBundle,
} from '../../../src/subjects/spelling/content/model.js';
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

function releaseRowToRecord(row, { includeSnapshot = false } = {}) {
  if (!row) return null;
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
    proof: parseJson(row.proof_json, null),
    createdAt: Number(row.created_at) || 0,
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

function packageOperationsHash(operations = []) {
  return contentOperationHash(
    operations.map((operation) => normaliseContentOperation(operation, { now: () => 0 })),
    'ops',
  );
}

function assertPackageIsNotPublished(packageRow, packageId) {
  if (packageRow.state === CONTENT_OPERATION_PACKAGE_STATES.PUBLISHED) {
    throw new ConflictError('Published content operation packages cannot be mutated.', {
      code: 'content_operation_package_published',
      packageId,
    });
  }
}

export function createContentOperationsRepository({ db, now }) {
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
          ...releaseRowToRecord(existing, { includeSnapshot: true }),
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
      const actor = normaliseString(seededByAccountId) || legacy?.source?.updatedByAccountId || null;
      const source = legacy?.source || { type: 'bundled_fallback' };
      const releaseProof = {
        ...(proof && typeof proof === 'object' && !Array.isArray(proof) ? proof : {}),
        seed: {
          source,
          summary,
        },
      };

      await batch(db, [
        bindStatement(db, `
          INSERT INTO content_operation_releases (
            release_id, subject_id, status, snapshot_json, snapshot_hash,
            base_release_id, package_id, published_at, published_by_account_id,
            rollback_of_release_id, proof_json, created_at
          )
          VALUES (?, ?, 'published', ?, ?, NULL, NULL, ?, ?, NULL, ?, ?)
        `, [
          releaseId,
          resolvedSubjectId,
          JSON.stringify(validation.bundle),
          snapshotHash,
          publishedAt,
          actor,
          JSON.stringify(releaseProof),
          nowTs,
        ]),
        bindStatement(db, `
          INSERT INTO content_operation_events (
            event_id, package_id, release_id, subject_id, event_type,
            actor_account_id, event_json, created_at
          )
          VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
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
        ]),
      ]);

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

    async readContentOperationPackage(packageId, { includeOperations = true } = {}) {
      const row = await requirePackage(db, packageId);
      const record = packageRowToRecord(row);
      if (includeOperations) {
        record.operations = await listPackageOperations(db, packageId);
      }
      return record;
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
      return rows.map(packageRowToRecord);
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
      const baseSnapshot = baseReleaseRow?.snapshot_json
        ? parseJson(baseReleaseRow.snapshot_json, null)
        : await readSeededSpellingContentBundle();
      const candidate = buildSpellingContentOperationCandidate(baseSnapshot, operations);
      const conflicts = [
        ...(candidate.conflicts || []),
        releaseDriftConflict(packageRow, currentReleaseRow, baseReleaseRow),
      ].filter(Boolean);
      const candidateId = uid('cocand');
      const nowTs = Number(nowFactory());
      const validationSummary = {
        ok: Boolean(candidate.validation.ok),
        errorCount: candidate.validation.errors.length,
        warningCount: candidate.validation.warnings.length,
        errors: candidate.validation.errors,
        warnings: candidate.validation.warnings,
      };

      await batch(db, [
        bindStatement(db, `
          INSERT INTO content_operation_package_candidates (
            candidate_id, package_id, base_release_id, current_release_id,
            operations_hash, candidate_hash, candidate_snapshot_json,
            validation_json, audio_scan_json, asset_scan_json, reward_scan_json,
            visibility_scan_json, conflicts_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)
        `, [
          candidateId,
          packageId,
          packageRow.base_release_id || null,
          currentReleaseRow?.release_id || null,
          candidate.operationsHash,
          candidate.candidateHash,
          JSON.stringify(candidate.candidate),
          JSON.stringify(validationSummary),
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
        conflicts,
        createdAt: nowTs,
      };
    },

    async approveContentOperationCandidate(packageId, candidateId, {
      approvedByAccountId,
      notes = '',
      audioFallback = null,
      assetSummary = null,
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
      const candidate = candidateRowToRecord(candidateRow);
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
      if (Array.isArray(candidate.conflicts) && candidate.conflicts.length) {
        throw new ConflictError('Content operation candidate has unresolved conflicts.', {
          code: 'content_operation_candidate_conflicted',
          packageId,
          candidateId,
          conflicts: candidate.conflicts,
        });
      }

      const approvalId = uid('coapp');
      const nowTs = Number(nowFactory());
      await batch(db, [
        bindStatement(db, `
          DELETE FROM content_operation_package_approvals
          WHERE package_id = ?
        `, [packageId]),
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
          audioFallback == null ? null : JSON.stringify(audioFallback),
          assetSummary == null ? null : JSON.stringify(assetSummary),
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
          JSON.stringify({ approvalId, candidateId, candidateHash: candidate.candidateHash }),
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
      const candidate = candidateRowToRecord(candidateRow, { includeSnapshot: true });
      if (!candidate || candidate.candidateHash !== approval.candidateHash) {
        throw new ConflictError('Content operation approval does not match the candidate hash.', {
          code: 'content_operation_approval_hash_mismatch',
          packageId,
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
      const releaseId = uid('corel');
      const nowTs = Number(nowFactory());
      const snapshotHash = contentOperationHash(candidate.candidate, 'release');

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
          `, [
            releaseId,
            packageRow.subject_id,
            JSON.stringify(candidate.candidate),
            snapshotHash,
            candidate.currentReleaseId || packageRow.base_release_id || null,
            packageId,
            nowTs,
            actor,
            proof == null ? null : JSON.stringify(proof),
            nowTs,
            packageId,
            CONTENT_OPERATION_PACKAGE_STATES.APPROVED,
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
            }),
            nowTs,
            releaseId,
          ]),
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

      if (mutationChangeCount(publishResults[0]) < 1 || mutationChangeCount(publishResults[1]) < 1) {
        const latestPackageRow = await requirePackage(db, packageId);
        if (latestPackageRow.state === CONTENT_OPERATION_PACKAGE_STATES.PUBLISHED) {
          throw new ConflictError('Content operation package was already published.', {
            code: 'content_operation_package_published',
            packageId,
          });
        }
        throw new ConflictError('Content operation package must be approved before publish.', {
          code: 'content_operation_package_not_approved',
          packageId,
          state: latestPackageRow.state,
        });
      }

      return {
        releaseId,
        packageId,
        subjectId: packageRow.subject_id,
        status: 'published',
        snapshotHash,
        snapshot: candidate.candidate,
        publishedAt: nowTs,
        publishedByAccountId: actor,
        proof,
      };
    },

    async rollbackContentOperationRelease(subjectId = CONTENT_OPERATION_SUBJECT_ID, releaseId, {
      rolledBackByAccountId,
      proof = null,
    } = {}) {
      const resolvedSubjectId = normaliseSubjectId(subjectId);
      const actor = normaliseString(rolledBackByAccountId);
      if (!actor) throw new BadRequestError('Content operation rollback requires an actor account id.');
      const targetRow = await readReleaseRowById(db, resolvedSubjectId, normaliseString(releaseId), {
        includeSnapshot: true,
      });
      const target = releaseRowToRecord(targetRow, { includeSnapshot: true });
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
      const rollbackProof = {
        ...(proof && typeof proof === 'object' && !Array.isArray(proof) ? proof : {}),
        rollback: {
          targetReleaseId: target.releaseId,
          targetSnapshotHash: target.snapshotHash,
          previousLatestReleaseId: currentRow?.release_id || null,
        },
      };

      await batch(db, [
        bindStatement(db, `
          INSERT INTO content_operation_releases (
            release_id, subject_id, status, snapshot_json, snapshot_hash,
            base_release_id, package_id, published_at, published_by_account_id,
            rollback_of_release_id, proof_json, created_at
          )
          VALUES (?, ?, 'published', ?, ?, ?, NULL, ?, ?, ?, ?, ?)
        `, [
          rollbackReleaseId,
          resolvedSubjectId,
          JSON.stringify(validation.bundle),
          snapshotHash,
          currentRow?.release_id || null,
          nowTs,
          actor,
          target.releaseId,
          JSON.stringify(rollbackProof),
          nowTs,
        ]),
        bindStatement(db, `
          INSERT INTO content_operation_events (
            event_id, package_id, release_id, subject_id, event_type,
            actor_account_id, event_json, created_at
          )
          VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
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
          }),
          nowTs,
        ]),
      ]);

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
        createdAt: nowTs,
      };
    },

    async readLatestContentOperationRelease(subjectId = CONTENT_OPERATION_SUBJECT_ID, { includeSnapshot = false } = {}) {
      const row = await readLatestReleaseRow(db, normaliseSubjectId(subjectId), { includeSnapshot });
      return releaseRowToRecord(row, { includeSnapshot });
    },

    async readContentOperationRelease(subjectId = CONTENT_OPERATION_SUBJECT_ID, releaseId, { includeSnapshot = false } = {}) {
      const row = await readReleaseRowById(db, normaliseSubjectId(subjectId), normaliseString(releaseId), {
        includeSnapshot,
      });
      return releaseRowToRecord(row, { includeSnapshot });
    },

    async listContentOperationReleases({ subjectId = CONTENT_OPERATION_SUBJECT_ID, includeSnapshot = false, limit = 20 } = {}) {
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
      return rows.map((row) => releaseRowToRecord(row, { includeSnapshot }));
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
