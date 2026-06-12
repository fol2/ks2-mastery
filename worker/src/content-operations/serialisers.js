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
  const section = {
    status: typeof value.status === 'string' && value.status ? value.status : fallbackStatus,
    blockers: asArray(value.blockers),
    warnings: asArray(value.warnings),
  };
  if (value.fallbackApproval && typeof value.fallbackApproval === 'object' && !Array.isArray(value.fallbackApproval)) {
    section.fallbackApproval = value.fallbackApproval;
  }
  if (
    value.strictAudioReadiness
    && typeof value.strictAudioReadiness === 'object'
    && !Array.isArray(value.strictAudioReadiness)
  ) {
    section.strictAudioReadiness = {
      status: typeof value.strictAudioReadiness.status === 'string'
        ? value.strictAudioReadiness.status
        : 'not_scanned',
      blockers: asArray(value.strictAudioReadiness.blockers),
      affectedCount: Number(value.strictAudioReadiness.affectedCount) || 0,
      items: asArray(value.strictAudioReadiness.items),
    };
  }
  return section;
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
    latestCandidate: latestCandidate ? serialiseContentOperationCandidate(latestCandidate) : null,
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
    audioScan: candidate.audioScan || null,
    assetScan: candidate.assetScan || null,
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

export function serialiseContentOperationAssetUpload(upload = {}) {
  const preview = upload.preview && typeof upload.preview === 'object' && !Array.isArray(upload.preview)
    ? upload.preview
    : {};
  return {
    assetUploadId: upload.assetUploadId,
    packageId: upload.packageId,
    monsterId: upload.monsterId,
    branchId: upload.branchId,
    stageId: upload.stageId,
    assetKind: upload.assetKind || 'monster-image',
    contentType: upload.contentType || '',
    byteSize: Number(upload.byteSize) || 0,
    dimensions: {
      width: upload.width == null ? null : Number(upload.width),
      height: upload.height == null ? null : Number(upload.height),
    },
    validation: upload.validation || { ok: false, errors: [], warnings: [] },
    preview: {
      kind: preview.kind || 'admin-api-handle',
      url: typeof preview.url === 'string' ? preview.url : null,
      contentType: preview.contentType || upload.contentType || '',
    },
    previewUrl: typeof preview.url === 'string' ? preview.url : null,
    status: upload.status || 'draft',
    createdByAccountId: upload.createdByAccountId || null,
    createdAt: Number(upload.createdAt) || 0,
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

function releaseAudioProofFromProof(proof = null) {
  const metadata = proof && typeof proof === 'object' && !Array.isArray(proof)
    ? proof.contentOperationsAudio
    : null;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { audioFallback: null, audioWarnings: null };
  }
  return {
    audioFallback: metadata.audioFallback && typeof metadata.audioFallback === 'object' && !Array.isArray(metadata.audioFallback)
      ? metadata.audioFallback
      : null,
    audioWarnings: metadata.audioWarnings && typeof metadata.audioWarnings === 'object' && !Array.isArray(metadata.audioWarnings)
      ? metadata.audioWarnings
      : null,
  };
}

function releaseAssetProofFromProof(proof = null) {
  const metadata = proof && typeof proof === 'object' && !Array.isArray(proof)
    ? proof.contentOperationsAssets
    : null;
  return {
    assetSummary: metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      && metadata.assetSummary && typeof metadata.assetSummary === 'object' && !Array.isArray(metadata.assetSummary)
      ? metadata.assetSummary
      : null,
    assetReferenceManifest: metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      && metadata.assetReferenceManifest && typeof metadata.assetReferenceManifest === 'object' && !Array.isArray(metadata.assetReferenceManifest)
      ? metadata.assetReferenceManifest
      : null,
  };
}

function releaseHasCallerProof(proof = null) {
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) return false;
  return Object.keys(proof).some((key) => (
    key !== 'contentOperationsAudio'
    && key !== 'contentOperationsAssets'
    && key !== 'productionProof'
  ));
}

function serialiseReleaseHistory(history = null) {
  if (!history || typeof history !== 'object' || Array.isArray(history)) return null;
  const productionProof = history.productionProof && typeof history.productionProof === 'object' && !Array.isArray(history.productionProof)
    ? history.productionProof
    : null;
  const changedEntities = history.changedEntities && typeof history.changedEntities === 'object' && !Array.isArray(history.changedEntities)
    ? history.changedEntities
    : null;
  const assetChanges = history.assetChanges && typeof history.assetChanges === 'object' && !Array.isArray(history.assetChanges)
    ? history.assetChanges
    : null;
  const contentPackage = history.package && typeof history.package === 'object' && !Array.isArray(history.package)
    ? history.package
    : null;
  return {
    releaseId: history.releaseId || '',
    package: contentPackage ? {
      packageId: contentPackage.packageId || '',
      title: contentPackage.title || '',
      templateId: contentPackage.templateId || '',
      state: contentPackage.state || '',
    } : null,
    approvedByAccountId: history.approvedByAccountId || null,
    approvedAt: history.approvedAt ?? null,
    approvalId: history.approvalId || null,
    candidateId: history.candidateId || null,
    candidateHash: history.candidateHash || '',
    publishedByAccountId: history.publishedByAccountId || null,
    publishedAt: history.publishedAt ?? null,
    changedEntities: changedEntities ? {
      operationCount: Number(changedEntities.operationCount) || 0,
      entityCount: Number(changedEntities.entityCount) || 0,
      entityTypes: Array.isArray(changedEntities.entityTypes) ? changedEntities.entityTypes : [],
      actionCounts: changedEntities.actionCounts && typeof changedEntities.actionCounts === 'object' && !Array.isArray(changedEntities.actionCounts)
        ? changedEntities.actionCounts
        : {},
      fieldPaths: Array.isArray(changedEntities.fieldPaths) ? changedEntities.fieldPaths : [],
      preview: Array.isArray(changedEntities.preview) ? changedEntities.preview : [],
    } : null,
    assetChanges: assetChanges ? {
      uploadCount: Number(assetChanges.uploadCount) || 0,
      referenceCount: Number(assetChanges.referenceCount) || 0,
      hash: assetChanges.hash || '',
      preview: Array.isArray(assetChanges.preview) ? assetChanges.preview : [],
    } : null,
    productionProof: productionProof ? {
      status: productionProof.status || 'unknown',
      hasCallerProof: Boolean(productionProof.hasCallerProof),
      capturedAt: Number(productionProof.capturedAt) || null,
      capturedByAccountId: productionProof.capturedByAccountId || null,
      requiredSurfaces: Array.isArray(productionProof.requiredSurfaces) ? productionProof.requiredSurfaces : [],
      linkedSurfaces: Array.isArray(productionProof.linkedSurfaces) ? productionProof.linkedSurfaces : [],
      missingSurfaces: Array.isArray(productionProof.missingSurfaces) ? productionProof.missingSurfaces : [],
    } : null,
  };
}

export function serialiseContentOperationRelease(release = {}, { includeSnapshot = false } = {}) {
  const proof = release.proof ?? null;
  const proofAudio = releaseAudioProofFromProof(proof);
  const proofAssets = releaseAssetProofFromProof(proof);
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
    proof,
    hasCallerProof: releaseHasCallerProof(proof),
    audioFallback: release.audioFallback ?? proofAudio.audioFallback,
    audioWarnings: release.audioWarnings ?? proofAudio.audioWarnings,
    assetSummary: release.assetSummary ?? proofAssets.assetSummary,
    assetReferenceManifest: release.assetReferenceManifest ?? proofAssets.assetReferenceManifest,
    history: serialiseReleaseHistory(release.history),
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
