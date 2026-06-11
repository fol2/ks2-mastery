import {
  CONTENT_OPERATION_PACKAGE_STATES,
  CONTENT_OPERATION_SUBJECT_ID,
} from '../../../src/subjects/spelling/content/operations-model.js';

export const CONTENT_OPERATION_CAPABILITIES = Object.freeze({
  VIEW: 'content_operations.view',
  EDIT: 'content_operations.edit',
  APPROVE: 'content_operations.approve',
  PUBLISH: 'content_operations.publish',
  ROLLBACK: 'content_operations.rollback',
});

export const CONTENT_OPERATION_CAPABILITY_LABELS = Object.freeze({
  [CONTENT_OPERATION_CAPABILITIES.VIEW]: 'View content operations',
  [CONTENT_OPERATION_CAPABILITIES.EDIT]: 'Edit content packages',
  [CONTENT_OPERATION_CAPABILITIES.APPROVE]: 'Approve content packages',
  [CONTENT_OPERATION_CAPABILITIES.PUBLISH]: 'Publish content packages',
  [CONTENT_OPERATION_CAPABILITIES.ROLLBACK]: 'Roll back content releases',
});

const CONTENT_OPERATION_SECTION_KEYS = Object.freeze([
  'validation',
  'conflicts',
  'audio',
  'assets',
  'rewards',
  'visibility',
  'exposure',
  'publishReadiness',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normaliseValidation(validation = null) {
  if (!validation || typeof validation !== 'object' || Array.isArray(validation)) {
    return {
      status: 'not_run',
      ok: null,
      errorCount: 0,
      warningCount: 0,
      errors: [],
      warnings: [],
    };
  }
  const errors = asArray(validation.errors);
  const warnings = asArray(validation.warnings);
  const ok = Boolean(validation.ok);
  return {
    status: ok ? 'passed' : 'blocked',
    ok,
    errorCount: Number(validation.errorCount ?? errors.length) || 0,
    warningCount: Number(validation.warningCount ?? warnings.length) || 0,
    errors,
    warnings,
  };
}

function normaliseConflictSection(conflicts = null) {
  if (!Array.isArray(conflicts)) {
    return {
      status: 'not_run',
      count: 0,
      items: [],
    };
  }
  return {
    status: conflicts.length ? 'blocked' : 'passed',
    count: conflicts.length,
    items: conflicts,
  };
}

function normaliseReadinessSection(value = null, fallbackStatus = 'not_scanned') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      status: fallbackStatus,
      blockers: [],
      warnings: [],
    };
  }
  return {
    status: typeof value.status === 'string' && value.status ? value.status : fallbackStatus,
    blockers: asArray(value.blockers),
    warnings: asArray(value.warnings),
  };
}

export function buildContentOperationBlockerEnvelope({
  validation = null,
  conflicts = null,
  audio = null,
  assets = null,
  rewards = null,
  visibility = null,
  exposure = null,
  publishReadiness = null,
} = {}) {
  const validationSection = normaliseValidation(validation);
  const conflictSection = normaliseConflictSection(conflicts);
  const audioSection = normaliseReadinessSection(audio);
  const assetSection = normaliseReadinessSection(assets);
  const rewardSection = normaliseReadinessSection(rewards);
  const visibilitySection = normaliseReadinessSection(visibility);
  const exposureSection = normaliseReadinessSection(exposure);
  const blockingSections = [
    validationSection.errorCount ? 'validation' : null,
    conflictSection.count ? 'conflicts' : null,
    audioSection.blockers.length ? 'audio' : null,
    assetSection.blockers.length ? 'assets' : null,
    rewardSection.blockers.length ? 'rewards' : null,
    visibilitySection.blockers.length ? 'visibility' : null,
    exposureSection.blockers.length ? 'exposure' : null,
  ].filter(Boolean);
  const readinessSection = publishReadiness
    ? normaliseReadinessSection(publishReadiness, 'not_ready')
    : {
      status: blockingSections.length ? 'blocked' : 'not_ready',
      blockers: blockingSections,
      warnings: [
        ...validationSection.warnings,
        ...audioSection.warnings,
        ...assetSection.warnings,
        ...rewardSection.warnings,
        ...visibilitySection.warnings,
        ...exposureSection.warnings,
      ],
    };

  return {
    validation: validationSection,
    conflicts: conflictSection,
    audio: audioSection,
    assets: assetSection,
    rewards: rewardSection,
    visibility: visibilitySection,
    exposure: exposureSection,
    publishReadiness: readinessSection,
  };
}

function packagePublishReadiness(contentPackage = {}) {
  if (contentPackage.state === CONTENT_OPERATION_PACKAGE_STATES.PUBLISHED) {
    return {
      status: 'published',
      blockers: ['already_published'],
      warnings: [],
    };
  }
  if (contentPackage.state === CONTENT_OPERATION_PACKAGE_STATES.APPROVED) {
    return {
      status: 'ready',
      blockers: [],
      warnings: [],
    };
  }
  return {
    status: 'not_ready',
    blockers: ['approval_required'],
    warnings: [],
  };
}

export function serialiseContentOperationActor(actor = {}) {
  const platformRole = actor?.platformRole || actor?.platform_role || 'parent';
  const isAdmin = platformRole === 'admin';
  return {
    accountId: actor?.id || actor?.accountId || null,
    platformRole,
    capabilities: {
      [CONTENT_OPERATION_CAPABILITIES.VIEW]: isAdmin,
      [CONTENT_OPERATION_CAPABILITIES.EDIT]: isAdmin,
      [CONTENT_OPERATION_CAPABILITIES.APPROVE]: isAdmin,
      [CONTENT_OPERATION_CAPABILITIES.PUBLISH]: isAdmin,
      [CONTENT_OPERATION_CAPABILITIES.ROLLBACK]: isAdmin,
    },
  };
}

export function serialiseContentOperationPackage(contentPackage = {}, { compact = false } = {}) {
  const latestCandidate = contentPackage.latestCandidate || null;
  const envelope = buildContentOperationBlockerEnvelope({
    validation: latestCandidate?.validation || null,
    conflicts: latestCandidate?.conflicts || null,
    audio: latestCandidate?.audioScan || null,
    assets: latestCandidate?.assetScan || null,
    rewards: latestCandidate?.rewardScan || null,
    visibility: latestCandidate?.visibilityScan || null,
    publishReadiness: packagePublishReadiness(contentPackage),
  });
  const base = {
    packageId: contentPackage.packageId,
    subjectId: contentPackage.subjectId || CONTENT_OPERATION_SUBJECT_ID,
    templateId: contentPackage.templateId || 'general',
    title: contentPackage.title || '',
    description: compact ? undefined : (contentPackage.description || ''),
    baseReleaseId: contentPackage.baseReleaseId || null,
    baseReleaseHash: contentPackage.baseReleaseHash || null,
    state: contentPackage.state || CONTENT_OPERATION_PACKAGE_STATES.DRAFT,
    createdByAccountId: compact ? undefined : (contentPackage.createdByAccountId || null),
    updatedByAccountId: compact ? undefined : (contentPackage.updatedByAccountId || null),
    createdAt: Number(contentPackage.createdAt) || 0,
    updatedAt: Number(contentPackage.updatedAt) || 0,
    approvedAt: contentPackage.approvedAt ?? null,
    publishedAt: contentPackage.publishedAt ?? null,
    supersededByPackageId: contentPackage.supersededByPackageId || null,
    operationCount: Array.isArray(contentPackage.operations) ? contentPackage.operations.length : undefined,
    blockers: envelope,
  };
  if (!compact && Array.isArray(contentPackage.operations)) {
    base.operations = contentPackage.operations.map(serialiseContentOperation);
  }
  return Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined));
}

export function serialiseContentOperation(operation = {}) {
  return {
    operationId: operation.operationId,
    packageId: operation.packageId,
    operationOrder: Number(operation.operationOrder) || 0,
    entityType: operation.entityType,
    entityId: operation.entityId,
    fieldPath: operation.fieldPath || '',
    action: operation.action,
    beforeHash: operation.beforeHash || '',
    afterHash: operation.afterHash || '',
    payload: operation.payload ?? null,
    createdByAccountId: operation.createdByAccountId || null,
    createdAt: Number(operation.createdAt) || 0,
  };
}

export function serialiseContentOperationCandidate(candidate = {}, { includeSnapshot = false } = {}) {
  return {
    candidateId: candidate.candidateId,
    packageId: candidate.packageId,
    baseReleaseId: candidate.baseReleaseId || null,
    currentReleaseId: candidate.currentReleaseId || null,
    operationsHash: candidate.operationsHash || '',
    candidateHash: candidate.candidateHash || '',
    validation: normaliseValidation(candidate.validation),
    blockers: buildContentOperationBlockerEnvelope({
      validation: candidate.validation,
      conflicts: candidate.conflicts,
      audio: candidate.audioScan,
      assets: candidate.assetScan,
      rewards: candidate.rewardScan,
      visibility: candidate.visibilityScan,
    }),
    conflicts: asArray(candidate.conflicts),
    createdAt: Number(candidate.createdAt) || 0,
    ...(includeSnapshot ? { candidate: candidate.candidate || null } : {}),
  };
}

export function serialiseContentOperationApproval(approval = {}) {
  return {
    approvalId: approval.approvalId,
    packageId: approval.packageId,
    candidateId: approval.candidateId,
    candidateHash: approval.candidateHash,
    approvedByAccountId: approval.approvedByAccountId,
    approvedAt: Number(approval.approvedAt) || 0,
    notes: approval.notes || '',
    validationSummary: normaliseValidation(approval.validationSummary),
    audioFallback: approval.audioFallback ?? null,
    assetSummary: approval.assetSummary ?? null,
  };
}

export function serialiseContentOperationRelease(release = {}, { includeSnapshot = false } = {}) {
  return {
    releaseId: release.releaseId,
    subjectId: release.subjectId || CONTENT_OPERATION_SUBJECT_ID,
    status: release.status || 'unknown',
    snapshotHash: release.snapshotHash || '',
    baseReleaseId: release.baseReleaseId || null,
    packageId: release.packageId || null,
    publishedAt: release.publishedAt ?? null,
    publishedByAccountId: release.publishedByAccountId || null,
    rollbackOfReleaseId: release.rollbackOfReleaseId || null,
    proof: release.proof ?? null,
    createdAt: Number(release.createdAt) || 0,
    ...(includeSnapshot ? { snapshot: release.snapshot || null } : {}),
  };
}

export function serialiseContentOperationEvent(event = {}) {
  return {
    eventId: event.eventId,
    packageId: event.packageId || null,
    releaseId: event.releaseId || null,
    subjectId: event.subjectId || CONTENT_OPERATION_SUBJECT_ID,
    eventType: event.eventType || '',
    actorAccountId: event.actorAccountId || null,
    event: event.event || {},
    createdAt: Number(event.createdAt) || 0,
  };
}

export function serialiseContentOperationOverview({
  subjectId = CONTENT_OPERATION_SUBJECT_ID,
  latestRelease = null,
  packages = [],
  releases = [],
  actor = null,
} = {}) {
  const packageCounts = packages.reduce((counts, contentPackage) => {
    const state = contentPackage.state || 'unknown';
    counts[state] = (counts[state] || 0) + 1;
    return counts;
  }, {});

  return {
    subjectId,
    latestRelease: latestRelease ? serialiseContentOperationRelease(latestRelease) : null,
    packageCounts,
    lanes: {
      blocked: packages.filter((entry) => entry.state === CONTENT_OPERATION_PACKAGE_STATES.BLOCKED).map((entry) => serialiseContentOperationPackage(entry, { compact: true })),
      readyForApproval: packages.filter((entry) => entry.state === CONTENT_OPERATION_PACKAGE_STATES.READY_FOR_APPROVAL).map((entry) => serialiseContentOperationPackage(entry, { compact: true })),
      approvedPendingPublish: packages.filter((entry) => entry.state === CONTENT_OPERATION_PACKAGE_STATES.APPROVED).map((entry) => serialiseContentOperationPackage(entry, { compact: true })),
      drafts: packages.filter((entry) => entry.state === CONTENT_OPERATION_PACKAGE_STATES.DRAFT).map((entry) => serialiseContentOperationPackage(entry, { compact: true })),
      recentReleases: releases.map((entry) => serialiseContentOperationRelease(entry)),
    },
    actor: actor ? serialiseContentOperationActor(actor) : null,
    sections: [...CONTENT_OPERATION_SECTION_KEYS],
  };
}

export function serialiseContentOperationStub({
  action,
  ticket,
  capability,
  message = 'This content operations route is reserved for a later ticket.',
} = {}) {
  return {
    ok: false,
    code: 'content_operation_route_not_implemented',
    message,
    stub: {
      action,
      ticket,
      capability,
      implemented: false,
    },
    blockers: buildContentOperationBlockerEnvelope({
      publishReadiness: {
        status: 'blocked',
        blockers: ['route_not_implemented'],
        warnings: [],
      },
    }),
  };
}
