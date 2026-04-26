import {
  canManageAccountRoles,
  canMutateLearnerData,
  canViewAdminHub,
  canViewLearnerDiagnostics,
  canViewParentHub,
  learnerMembershipRoleLabel,
  normaliseLearnerMembershipRole,
  normalisePlatformRole,
  platformRoleLabel,
} from '../access/roles.js';
import { buildSpellingContentSummary, validateSpellingContentBundle } from '../../subjects/spelling/content/model.js';
import { getSpellingPostMasteryState } from '../../subjects/spelling/read-model.js';
import { POST_MEGA_SEED_SHAPES } from '../../../shared/spelling/post-mastery-seed-shapes.js';
import { buildParentHubReadModel } from './parent-read-model.js';

// U1 (P2): neutral "empty" debug envelope for the admin hub when no
// learner is selected or when the role check forbids debug fields. The
// shape mirrors the populated `postMasteryDebug` returned by the selector
// so the React surface can render a single definition-list template
// without having to branch on the "empty" case.
function emptyPostMasteryDebug() {
  return {
    source: 'locked-fallback',
    publishedCoreCount: 0,
    secureCoreCount: 0,
    blockingCoreCount: 0,
    blockingCoreSlugsPreview: [],
    extraWordsIgnoredCount: 0,
    guardianMapCount: 0,
    contentReleaseId: null,
    allWordsMega: false,
    stickyUnlocked: false,
  };
}

function asTs(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

export function normaliseAuditEntry(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
  return {
    requestId: typeof raw.requestId === 'string' ? raw.requestId : '',
    mutationKind: typeof raw.mutationKind === 'string' ? raw.mutationKind : '',
    scopeType: typeof raw.scopeType === 'string' ? raw.scopeType : '',
    scopeId: typeof raw.scopeId === 'string' ? raw.scopeId : '',
    correlationId: typeof raw.correlationId === 'string' ? raw.correlationId : '',
    appliedAt: asTs(raw.appliedAt, 0),
    statusCode: Number(raw.statusCode) || 0,
  };
}

export function normaliseDemoOperations(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
  return {
    sessionsCreated: Math.max(0, Number(raw.sessionsCreated) || 0),
    activeSessions: Math.max(0, Number(raw.activeSessions) || 0),
    conversions: Math.max(0, Number(raw.conversions) || 0),
    cleanupCount: Math.max(0, Number(raw.cleanupCount) || 0),
    rateLimitBlocks: Math.max(0, Number(raw.rateLimitBlocks) || 0),
    ttsFallbacks: Math.max(0, Number(raw.ttsFallbacks) || 0),
    updatedAt: asTs(raw.updatedAt, 0),
  };
}

function toNonNegativeInt(value) {
  return Math.max(0, Number(value) || 0);
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

// P1.5 Phase A (U3): `real` / `demo` pairs are surfaced on every counter
// that can be split by account type. `demo` is optional on every field — a
// legacy server that doesn't emit the new sibling still produces a valid
// normalised read-model with `demo: undefined`, which the UI renders as `—`.
// Using `undefined` instead of `null` / `0` preserves the "missing" signal.
function normaliseRealDemoScalar(raw) {
  if (!isPlainObject(raw)) return undefined;
  if (raw.demo == null) return undefined;
  return toNonNegativeInt(raw.demo);
}

// M3 reviewer fix: `normaliseRealDemoWindow` was the sole caller of a dead
// ternary whose both branches evaluated to `{}`. Removed; the practice-
// session demo sibling is now conditional on `practiceDemo != null` only.

export function normaliseDashboardKpis(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const accounts = isPlainObject(raw.accounts) ? raw.accounts : {};
  const learners = isPlainObject(raw.learners) ? raw.learners : {};
  const demos = isPlainObject(raw.demos) ? raw.demos : {};
  const practiceSessions = isPlainObject(raw.practiceSessions) ? raw.practiceSessions : {};
  const eventLog = isPlainObject(raw.eventLog) ? raw.eventLog : {};
  const mutationReceipts = isPlainObject(raw.mutationReceipts) ? raw.mutationReceipts : {};
  const errorEvents = isPlainObject(raw.errorEvents) ? raw.errorEvents : {};
  const byStatus = isPlainObject(errorEvents.byStatus) ? errorEvents.byStatus : {};
  const byOrigin = isPlainObject(errorEvents.byOrigin) ? errorEvents.byOrigin : {};
  const accountOpsUpdates = isPlainObject(raw.accountOpsUpdates) ? raw.accountOpsUpdates : {};
  const practiceReal = isPlainObject(practiceSessions.real) ? practiceSessions.real : null;
  const practiceDemo = isPlainObject(practiceSessions.demo) ? practiceSessions.demo : null;
  const receiptsReal = isPlainObject(mutationReceipts.real) ? mutationReceipts.real : null;
  const receiptsDemo = isPlainObject(mutationReceipts.demo) ? mutationReceipts.demo : null;

  const normalised = {
    generatedAt: asTs(raw.generatedAt, 0),
    accounts: {
      total: toNonNegativeInt(accounts.total),
      real: accounts.real == null ? toNonNegativeInt(accounts.total) : toNonNegativeInt(accounts.real),
      ...(normaliseRealDemoScalar(accounts) != null ? { demo: normaliseRealDemoScalar(accounts) } : {}),
    },
    learners: {
      total: toNonNegativeInt(learners.total),
      real: learners.real == null ? toNonNegativeInt(learners.total) : toNonNegativeInt(learners.real),
      ...(normaliseRealDemoScalar(learners) != null ? { demo: normaliseRealDemoScalar(learners) } : {}),
    },
    demos: { active: toNonNegativeInt(demos.active) },
    practiceSessions: {
      last7d: toNonNegativeInt(practiceSessions.last7d),
      last30d: toNonNegativeInt(practiceSessions.last30d),
      ...(practiceReal != null ? {
        real: {
          last7d: toNonNegativeInt(practiceReal.last7d),
          last30d: toNonNegativeInt(practiceReal.last30d),
        },
      } : {}),
      ...(practiceDemo != null ? {
        demo: {
          last7d: toNonNegativeInt(practiceDemo.last7d),
          last30d: toNonNegativeInt(practiceDemo.last30d),
        },
      } : {}),
    },
    eventLog: { last7d: toNonNegativeInt(eventLog.last7d) },
    mutationReceipts: {
      last7d: toNonNegativeInt(mutationReceipts.last7d),
      ...(receiptsReal != null ? {
        real: { last7d: toNonNegativeInt(receiptsReal.last7d) },
      } : {}),
      ...(receiptsDemo != null ? {
        demo: { last7d: toNonNegativeInt(receiptsDemo.last7d) },
      } : {}),
    },
    errorEvents: {
      byStatus: {
        open: toNonNegativeInt(byStatus.open),
        investigating: toNonNegativeInt(byStatus.investigating),
        resolved: toNonNegativeInt(byStatus.resolved),
        ignored: toNonNegativeInt(byStatus.ignored),
      },
      ...(isPlainObject(errorEvents.byOrigin) ? {
        byOrigin: {
          client: toNonNegativeInt(byOrigin.client),
          server: toNonNegativeInt(byOrigin.server),
        },
      } : {}),
    },
    accountOpsUpdates: { total: toNonNegativeInt(accountOpsUpdates.total) },
  };
  // Preserve the P1.5 Phase A (U1) refresh envelope siblings when the caller
  // re-normalises after a patch. They are not part of the server payload
  // contract, but the normaliser must round-trip them so UI state survives
  // a re-render following a dirty-clean transition or cascade refresh.
  if (Number.isFinite(Number(raw.refreshedAt))) {
    normalised.refreshedAt = Number(raw.refreshedAt);
  }
  if (raw.refreshError && typeof raw.refreshError === 'object') {
    normalised.refreshError = raw.refreshError;
  } else if (raw.refreshError === null) {
    normalised.refreshError = null;
  }
  return normalised;
}

function normaliseOpsActivityEntry(rawEntry) {
  const raw = isPlainObject(rawEntry) ? rawEntry : {};
  return {
    requestId: typeof raw.requestId === 'string' ? raw.requestId : '',
    accountIdMasked: typeof raw.accountIdMasked === 'string' ? raw.accountIdMasked : '',
    mutationKind: typeof raw.mutationKind === 'string' ? raw.mutationKind : '',
    scopeType: typeof raw.scopeType === 'string' ? raw.scopeType : '',
    // R26: server pre-masks learner/account scope ids; client renders verbatim.
    scopeId: typeof raw.scopeId === 'string' ? raw.scopeId : '',
    correlationId: typeof raw.correlationId === 'string' ? raw.correlationId : '',
    statusCode: toNonNegativeInt(raw.statusCode),
    appliedAt: asTs(raw.appliedAt, 0),
  };
}

export function normaliseOpsActivityStream(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const entries = Array.isArray(raw.entries) ? raw.entries.map(normaliseOpsActivityEntry) : [];
  return {
    generatedAt: asTs(raw.generatedAt, 0),
    entries,
  };
}

function normaliseAccountOpsMetadataTags(rawTags, rawTagsJson) {
  if (Array.isArray(rawTags)) {
    return rawTags
      .map((tag) => (typeof tag === 'string' ? tag : ''))
      .filter((tag) => tag.length > 0);
  }
  if (typeof rawTagsJson === 'string' && rawTagsJson.length > 0) {
    try {
      const parsed = JSON.parse(rawTagsJson);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((tag) => (typeof tag === 'string' ? tag : ''))
        .filter((tag) => tag.length > 0);
    } catch {
      return [];
    }
  }
  return [];
}

function normaliseAccountOpsMetadataEntry(rawEntry) {
  const raw = isPlainObject(rawEntry) ? rawEntry : {};
  // R25: internalNotes may be null for ops-role readers; preserve null verbatim.
  let internalNotes = null;
  if (typeof raw.internalNotes === 'string') {
    internalNotes = raw.internalNotes;
  }
  return {
    accountId: typeof raw.accountId === 'string' ? raw.accountId : '',
    email: typeof raw.email === 'string' ? raw.email : '',
    displayName: typeof raw.displayName === 'string' ? raw.displayName : '',
    platformRole: typeof raw.platformRole === 'string' ? raw.platformRole : '',
    opsStatus: typeof raw.opsStatus === 'string' ? raw.opsStatus : '',
    planLabel: typeof raw.planLabel === 'string' ? raw.planLabel : '',
    tags: normaliseAccountOpsMetadataTags(raw.tags, raw.tagsJson),
    internalNotes,
    updatedAt: asTs(raw.updatedAt, 0),
    updatedByAccountId: typeof raw.updatedByAccountId === 'string' ? raw.updatedByAccountId : '',
  };
}

export function normaliseAccountOpsMetadataDirectory(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const accounts = Array.isArray(raw.accounts) ? raw.accounts.map(normaliseAccountOpsMetadataEntry) : [];
  return {
    generatedAt: asTs(raw.generatedAt, 0),
    accounts,
  };
}

function normaliseErrorEventEntry(rawEntry) {
  const raw = isPlainObject(rawEntry) ? rawEntry : {};
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    errorKind: typeof raw.errorKind === 'string' ? raw.errorKind : '',
    messageFirstLine: typeof raw.messageFirstLine === 'string' ? raw.messageFirstLine : '',
    firstFrame: typeof raw.firstFrame === 'string' ? raw.firstFrame : '',
    routeName: typeof raw.routeName === 'string' ? raw.routeName : '',
    userAgent: typeof raw.userAgent === 'string' ? raw.userAgent : '',
    accountIdMasked: typeof raw.accountIdMasked === 'string' ? raw.accountIdMasked : '',
    occurrenceCount: toNonNegativeInt(raw.occurrenceCount),
    firstSeen: asTs(raw.firstSeen, 0),
    lastSeen: asTs(raw.lastSeen, 0),
    status: typeof raw.status === 'string' ? raw.status : '',
  };
}

export function normaliseErrorEventSummary(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const totalsRaw = isPlainObject(raw.totals) ? raw.totals : {};
  const entries = Array.isArray(raw.entries) ? raw.entries.map(normaliseErrorEventEntry) : [];
  return {
    generatedAt: asTs(raw.generatedAt, 0),
    totals: {
      open: toNonNegativeInt(totalsRaw.open),
      investigating: toNonNegativeInt(totalsRaw.investigating),
      resolved: toNonNegativeInt(totalsRaw.resolved),
      ignored: toNonNegativeInt(totalsRaw.ignored),
      all: toNonNegativeInt(totalsRaw.all),
    },
    entries,
  };
}

export function normaliseMonsterVisualConfigAdminModel(rawValue, platformRole = 'parent') {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
  const status = raw.status && typeof raw.status === 'object' && !Array.isArray(raw.status) ? raw.status : {};
  const validation = status.validation && typeof status.validation === 'object' && !Array.isArray(status.validation)
    ? status.validation
    : {};
  const canManageMonsterVisualConfig = normalisePlatformRole(platformRole) === 'admin';
  return {
    permissions: {
      canManageMonsterVisualConfig,
      canViewMonsterVisualConfig: canViewAdminHub({ platformRole }),
    },
    status: {
      schemaVersion: Number(status.schemaVersion) || 0,
      manifestHash: typeof status.manifestHash === 'string' ? status.manifestHash : '',
      draftRevision: Number(status.draftRevision) || 0,
      draftUpdatedAt: asTs(status.draftUpdatedAt, 0),
      draftUpdatedByAccountId: typeof status.draftUpdatedByAccountId === 'string' ? status.draftUpdatedByAccountId : '',
      publishedVersion: Number(status.publishedVersion) || 0,
      publishedAt: asTs(status.publishedAt, 0),
      publishedByAccountId: typeof status.publishedByAccountId === 'string' ? status.publishedByAccountId : '',
      validation: {
        ok: Boolean(validation.ok),
        errorCount: Number(validation.errorCount) || 0,
        warningCount: Number(validation.warningCount) || 0,
        errors: Array.isArray(validation.errors) ? validation.errors : [],
        warnings: Array.isArray(validation.warnings) ? validation.warnings : [],
      },
    },
    draft: raw.draft && typeof raw.draft === 'object' && !Array.isArray(raw.draft) ? raw.draft : null,
    published: raw.published && typeof raw.published === 'object' && !Array.isArray(raw.published) ? raw.published : null,
    versions: Array.isArray(raw.versions) ? raw.versions : [],
    mutation: raw.mutation && typeof raw.mutation === 'object' && !Array.isArray(raw.mutation) ? raw.mutation : {},
  };
}

export function buildAdminHubReadModel({
  account = null,
  platformRole = 'parent',
  spellingContentBundle = null,
  memberships = [],
  learnerBundles = {},
  runtimeSnapshots = {},
  demoOperations = null,
  monsterVisualConfig = null,
  auditEntries = [],
  auditAvailable = false,
  selectedLearnerId = null,
  dashboardKpis = null,
  opsActivityStream = null,
  accountOpsMetadata = null,
  errorLogSummary = null,
  now = Date.now,
} = {}) {
  const resolvedPlatformRole = normalisePlatformRole(platformRole || account?.platformRole);
  const validation = validateSpellingContentBundle(spellingContentBundle);
  const contentSummary = buildSpellingContentSummary(validation.bundle);
  const generatedAt = typeof now === 'function' ? asTs(now(), Date.now()) : asTs(now, Date.now());
  const diagnosticsEntries = (Array.isArray(memberships) ? memberships : []).map((membership) => {
    const resolvedMembershipRole = normaliseLearnerMembershipRole(membership?.role);
    const learner = membership?.learner || null;
    const learnerId = learner?.id || membership?.learnerId || '';
    const writable = canMutateLearnerData({ membershipRole: resolvedMembershipRole });
    const parentHub = buildParentHubReadModel({
      learner,
      platformRole: 'parent',
      membershipRole: resolvedMembershipRole,
      subjectStates: learnerBundles[learnerId]?.subjectStates || {},
      practiceSessions: learnerBundles[learnerId]?.practiceSessions || [],
      eventLog: learnerBundles[learnerId]?.eventLog || [],
      gameState: learnerBundles[learnerId]?.gameState || {},
      runtimeSnapshots,
      now,
    });
    return {
      learnerId,
      learnerName: learner?.name || 'Learner',
      yearGroup: learner?.yearGroup || 'Y5',
      membershipRole: resolvedMembershipRole,
      membershipRoleLabel: learnerMembershipRoleLabel(resolvedMembershipRole),
      stateRevision: Number(membership?.stateRevision) || 0,
      canViewDiagnostics: canViewLearnerDiagnostics({ platformRole: resolvedPlatformRole, membershipRole: resolvedMembershipRole }),
      writable,
      accessModeLabel: writable ? 'Writable learner' : 'Read-only learner',
      overview: parentHub.learnerOverview,
      currentFocus: parentHub.dueWork[0] || null,
      grammarEvidence: parentHub.grammarEvidence || null,
      punctuationEvidence: parentHub.punctuationEvidence || null,
    };
  });

  const selectedDiagnostics = diagnosticsEntries.find((entry) => entry.learnerId === selectedLearnerId)
    || diagnosticsEntries[0]
    || null;
  const canOpenParentHub = canViewParentHub({
    platformRole: resolvedPlatformRole,
    membershipRole: selectedDiagnostics?.membershipRole || 'viewer',
  });

  // U1 (P2): additive `postMasteryDebug` panel. Gated on `canViewAdminHub`
  // (admin + ops platform roles only) — child and parent surfaces never
  // receive a populated envelope. When the role check fails or when no
  // learner is selected, we emit `emptyPostMasteryDebug()` so the hub
  // response shape stays stable across role changes (the React surface
  // conditionally renders the panel on `permissions.canViewAdminHub`).
  //
  // PII posture: the selector output only contains slug strings (curriculum-
  // public) and integer counts. No learner name / email flows through this
  // sibling, so ICO data-minimisation stays intact even if a later reviewer
  // widens the read to parent-role adults.
  const adminCanViewDebug = canViewAdminHub({ platformRole: resolvedPlatformRole });
  let postMasteryDebug = emptyPostMasteryDebug();
  if (adminCanViewDebug && selectedDiagnostics) {
    const selectedLearnerBundle = learnerBundles[selectedDiagnostics.learnerId] || null;
    const selectedSubjectState = selectedLearnerBundle && isPlainObject(selectedLearnerBundle.subjectStates)
      ? selectedLearnerBundle.subjectStates.spelling
      : null;
    const selectorOutput = getSpellingPostMasteryState({
      subjectStateRecord: isPlainObject(selectedSubjectState) ? selectedSubjectState : null,
      runtimeSnapshot: runtimeSnapshots.spelling || null,
      now,
      sourceHint: 'service',
    });
    if (selectorOutput?.postMasteryDebug) {
      postMasteryDebug = selectorOutput.postMasteryDebug;
    }
  }

  return {
    generatedAt,
    permissions: {
      platformRole: resolvedPlatformRole,
      platformRoleLabel: platformRoleLabel(resolvedPlatformRole),
      canViewAdminHub: canViewAdminHub({ platformRole: resolvedPlatformRole }),
      canViewParentHub: canOpenParentHub,
      canManageAccountRoles: canManageAccountRoles({ platformRole: resolvedPlatformRole }),
      canManageMonsterVisualConfig: resolvedPlatformRole === 'admin',
    },
    account: {
      id: account?.id || 'local-browser',
      selectedLearnerId: selectedLearnerId || account?.selectedLearnerId || '',
      repoRevision: Number(account?.repoRevision) || 0,
    },
    contentReleaseStatus: {
      subjectId: 'spelling',
      publishedReleaseId: contentSummary.publishedReleaseId,
      publishedVersion: contentSummary.publishedVersion,
      publishedAt: contentSummary.publishedAt,
      releaseCount: Number(contentSummary.releaseCount) || 0,
      runtimeWordCount: Number(contentSummary.runtimeWordCount) || 0,
      runtimeSentenceCount: Number(contentSummary.runtimeSentenceCount) || 0,
      currentDraftId: validation.bundle.draft.id,
      currentDraftVersion: validation.bundle.draft.version,
      currentDraftState: validation.bundle.draft.state,
      draftUpdatedAt: validation.bundle.draft.updatedAt,
    },
    importValidationStatus: {
      ok: validation.ok,
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length,
      importedAt: validation.bundle.draft.provenance?.importedAt || 0,
      source: validation.bundle.draft.provenance?.source || '',
      errors: validation.errors.slice(0, 5),
      warnings: validation.warnings.slice(0, 5),
    },
    auditLogLookup: {
      available: Boolean(auditAvailable),
      entries: (Array.isArray(auditEntries) ? auditEntries : []).map(normaliseAuditEntry),
      note: auditAvailable
        ? 'Backed by durable mutation receipts on the Worker path.'
        : 'Local reference build does not have the Worker audit stream enabled yet.',
    },
    demoOperations: normaliseDemoOperations(demoOperations),
    monsterVisualConfig: normaliseMonsterVisualConfigAdminModel(monsterVisualConfig, resolvedPlatformRole),
    dashboardKpis: normaliseDashboardKpis(dashboardKpis),
    opsActivityStream: normaliseOpsActivityStream(opsActivityStream),
    accountOpsMetadata: normaliseAccountOpsMetadataDirectory(accountOpsMetadata),
    errorLogSummary: normaliseErrorEventSummary(errorLogSummary),
    learnerSupport: {
      diagnosticsCount: diagnosticsEntries.length,
      selectedLearnerId: selectedDiagnostics?.learnerId || '',
      accessibleLearners: diagnosticsEntries,
      selectedDiagnostics,
      punctuationReleaseDiagnostics: selectedDiagnostics?.punctuationEvidence?.releaseDiagnostics || null,
      entryPoints: [
        ...(canOpenParentHub ? [{
          label: 'Open Parent Hub',
          action: 'open-parent-hub',
        }] : []),
        {
          label: 'Open Spelling analytics',
          action: 'open-subject',
          subjectId: 'spelling',
          tab: 'analytics',
        },
        {
          label: 'Open Punctuation analytics',
          action: 'open-subject',
          subjectId: 'punctuation',
          tab: 'analytics',
        },
        {
          label: 'Export current learner snapshot',
          action: 'platform-export-learner',
        },
      ],
    },
    reality: {
      contentReleaseStatus: 'real',
      importValidationStatus: 'real',
      auditLogLookup: auditAvailable ? 'real' : 'placeholder',
      demoOperations: demoOperations ? 'real' : 'placeholder',
      monsterVisualConfig: monsterVisualConfig ? 'real' : 'placeholder',
      learnerSupport: 'real',
      postMasteryDebug: adminCanViewDebug && selectedDiagnostics ? 'real' : 'placeholder',
      postMegaSeedHarness: resolvedPlatformRole === 'admin' ? 'real' : 'placeholder',
    },
    postMasteryDebug,
    // P2 U3: seed-harness dropdown contents. Emitted as a cloned array so
    // mutating the returned payload cannot pollute the frozen source list.
    // The UI gates the panel on `permissions.platformRole === 'admin'`; ops
    // accounts receive the list (needed so their admin hub read model stays
    // shape-stable) but the React surface suppresses the control.
    postMegaSeedHarness: {
      shapes: [...POST_MEGA_SEED_SHAPES],
    },
  };
}
