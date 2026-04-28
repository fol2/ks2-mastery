// U6 (P3): Debug Bundle client panel — content-free leaf.
//
// Normalises the Worker debug-bundle response into the shape the
// AdminDebuggingSection panel expects. This module MUST NOT import
// subject content datasets or any module that transitively pulls in
// spelling / grammar / punctuation content bundles. The audit gate
// enforces this invariant.
//
// The normaliser is pure: it accepts the bundle payload from the worker
// endpoint and returns a rendering-ready object. No side effects, no
// storage, no fetch.

import { formatAdminTimestamp } from './admin-refresh-envelope.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeNonNegativeInt(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function safeString(value, fallback) {
  return typeof value === 'string' && value ? value : (fallback || '');
}

// ---------- Normalisation ----------

export function normaliseDebugBundleResponse(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const bundle = isPlainObject(raw.bundle) ? raw.bundle : {};
  return {
    ok: raw.ok === true,
    bundle: normaliseBundle(bundle),
    humanSummary: safeString(raw.humanSummary, ''),
    actorRole: safeString(raw.actorRole, 'ops'),
    canExportJson: raw.canExportJson === true,
  };
}

export function normaliseBundle(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    generatedAt: safeNonNegativeInt(raw.generatedAt),
    query: normaliseQuery(raw.query),
    buildHash: safeString(raw.buildHash, null),
    accountSummary: raw.accountSummary != null ? normaliseAccountSummary(raw.accountSummary) : null,
    linkedLearners: Array.isArray(raw.linkedLearners) ? raw.linkedLearners.map(normaliseLearner) : [],
    recentErrors: Array.isArray(raw.recentErrors) ? raw.recentErrors.map(normaliseError) : [],
    errorOccurrences: Array.isArray(raw.errorOccurrences) ? raw.errorOccurrences.map(normaliseOccurrence) : [],
    recentDenials: Array.isArray(raw.recentDenials) ? raw.recentDenials.map(normaliseDenial) : [],
    recentMutations: Array.isArray(raw.recentMutations) ? raw.recentMutations.map(normaliseMutation) : [],
    capacityState: Array.isArray(raw.capacityState) ? raw.capacityState.map(normaliseCapacity) : [],
  };
}

function normaliseQuery(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    accountId: typeof raw.accountId === 'string' ? raw.accountId : null,
    learnerId: typeof raw.learnerId === 'string' ? raw.learnerId : null,
    timeFrom: safeNonNegativeInt(raw.timeFrom),
    timeTo: safeNonNegativeInt(raw.timeTo),
    errorFingerprint: typeof raw.errorFingerprint === 'string' ? raw.errorFingerprint : null,
    errorEventId: typeof raw.errorEventId === 'string' ? raw.errorEventId : null,
    route: typeof raw.route === 'string' ? raw.route : null,
  };
}

function normaliseAccountSummary(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    accountId: safeString(raw.accountId, ''),
    email: typeof raw.email === 'string' ? raw.email : null,
    displayName: typeof raw.displayName === 'string' ? raw.displayName : null,
    platformRole: safeString(raw.platformRole, 'unknown'),
    accountType: safeString(raw.accountType, 'real'),
    createdAt: safeNonNegativeInt(raw.createdAt),
    updatedAt: safeNonNegativeInt(raw.updatedAt),
  };
}

function normaliseLearner(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    learnerId: safeString(raw.learnerId, ''),
    learnerName: typeof raw.learnerName === 'string' ? raw.learnerName : null,
    yearGroup: typeof raw.yearGroup === 'string' ? raw.yearGroup : null,
    membershipRole: typeof raw.membershipRole === 'string' ? raw.membershipRole : null,
    accessMode: typeof raw.accessMode === 'string' ? raw.accessMode : null,
  };
}

function normaliseError(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    id: safeString(raw.id, ''),
    fingerprint: safeString(raw.fingerprint, ''),
    errorKind: typeof raw.errorKind === 'string' ? raw.errorKind : null,
    messageFirstLine: typeof raw.messageFirstLine === 'string' ? raw.messageFirstLine : null,
    firstFrame: typeof raw.firstFrame === 'string' ? raw.firstFrame : null,
    routeName: typeof raw.routeName === 'string' ? raw.routeName : null,
    accountId: typeof raw.accountId === 'string' ? raw.accountId : null,
    firstSeen: safeNonNegativeInt(raw.firstSeen),
    lastSeen: safeNonNegativeInt(raw.lastSeen),
    occurrenceCount: Math.max(1, safeNonNegativeInt(raw.occurrenceCount)),
    status: safeString(raw.status, 'open'),
  };
}

function normaliseOccurrence(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    id: safeString(raw.id, ''),
    eventId: typeof raw.eventId === 'string' ? raw.eventId : null,
    occurredAt: safeNonNegativeInt(raw.occurredAt),
    release: typeof raw.release === 'string' ? raw.release : null,
    routeName: typeof raw.routeName === 'string' ? raw.routeName : null,
    accountId: typeof raw.accountId === 'string' ? raw.accountId : null,
  };
}

function normaliseDenial(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    id: safeString(raw.id, ''),
    deniedAt: safeNonNegativeInt(raw.deniedAt),
    denialReason: typeof raw.denialReason === 'string' ? raw.denialReason : null,
    routeName: typeof raw.routeName === 'string' ? raw.routeName : null,
    accountId: typeof raw.accountId === 'string' ? raw.accountId : null,
    isDemo: raw.isDemo === true,
    release: typeof raw.release === 'string' ? raw.release : null,
  };
}

function normaliseMutation(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    requestId: typeof raw.requestId === 'string' ? raw.requestId : null,
    mutationKind: typeof raw.mutationKind === 'string' ? raw.mutationKind : null,
    scopeType: typeof raw.scopeType === 'string' ? raw.scopeType : null,
    scopeId: typeof raw.scopeId === 'string' ? raw.scopeId : null,
    appliedAt: safeNonNegativeInt(raw.appliedAt),
    accountId: typeof raw.accountId === 'string' ? raw.accountId : null,
  };
}

function normaliseCapacity(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    metricKey: typeof raw.metricKey === 'string' ? raw.metricKey : null,
    metricCount: safeNonNegativeInt(raw.metricCount),
    updatedAt: safeNonNegativeInt(raw.updatedAt),
  };
}

// ---------- Section labels ----------

export const BUNDLE_SECTION_LABELS = {
  accountSummary: 'Account Summary',
  linkedLearners: 'Linked Learners',
  recentErrors: 'Recent Errors',
  errorOccurrences: 'Error Occurrences',
  recentDenials: 'Recent Denials',
  recentMutations: 'Recent Mutations',
  capacityState: 'Capacity Metrics',
};

export const BUNDLE_SECTIONS = Object.keys(BUNDLE_SECTION_LABELS);

// ---------- Section emptiness check ----------

export function isSectionEmpty(bundle, sectionKey) {
  const value = bundle?.[sectionKey];
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

// ---------- Format timestamp for display ----------

export function formatBundleTimestamp(ts) {
  return formatAdminTimestamp(ts);
}
