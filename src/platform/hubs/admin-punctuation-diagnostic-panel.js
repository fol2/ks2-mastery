// P7-U8: Punctuation Doctor diagnostic normaliser — content-free leaf.
//
// Normalises the Worker punctuation-diagnostic response into the shape
// an admin panel expects. This module MUST NOT import subject content
// datasets or any module that transitively pulls in punctuation content
// bundles. The audit gate enforces this invariant.
//
// The normaliser is pure: it accepts the diagnostic payload from the
// worker endpoint and returns a rendering-ready object. No side
// effects, no storage, no fetch.

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

function safeBool(value) {
  return value === true;
}

function safeStringArray(value) {
  return (Array.isArray(value) ? value : []).filter((entry) => typeof entry === 'string');
}

// ---------- Per-monster normalisation ----------

function normaliseMonsterDiagnostic(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    monsterId: safeString(raw.monsterId, ''),
    liveStars: safeNonNegativeInt(raw.liveStars),
    starHighWater: safeNonNegativeInt(raw.starHighWater),
    delta: Number.isFinite(Number(raw.delta)) ? Number(raw.delta) : 0,
    stage: safeNonNegativeInt(raw.stage),
    maxStageEver: safeNonNegativeInt(raw.maxStageEver),
    tryStars: safeNonNegativeInt(raw.tryStars),
    practiceStars: safeNonNegativeInt(raw.practiceStars),
    secureStars: safeNonNegativeInt(raw.secureStars),
    masteryStars: safeNonNegativeInt(raw.masteryStars),
    megaBlocked: safeStringArray(raw.megaBlocked),
    rewardUnitsTracked: safeNonNegativeInt(raw.rewardUnitsTracked),
    rewardUnitsSecured: safeNonNegativeInt(raw.rewardUnitsSecured),
    rewardUnitsDeepSecured: safeNonNegativeInt(raw.rewardUnitsDeepSecured),
  };
}

// ---------- Grand monster normalisation ----------

function normaliseGrandDiagnostic(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    monsterId: safeString(raw.monsterId, 'quoral'),
    grandStars: safeNonNegativeInt(raw.grandStars),
    grandStage: safeNonNegativeInt(raw.grandStage),
    grandStarHighWater: safeNonNegativeInt(raw.grandStarHighWater),
    grandMaxStageEver: safeNonNegativeInt(raw.grandMaxStageEver),
    grandDelta: Number.isFinite(Number(raw.grandDelta)) ? Number(raw.grandDelta) : 0,
    monstersWithSecured: safeStringArray(raw.monstersWithSecured),
    totalSecured: safeNonNegativeInt(raw.totalSecured),
    totalDeepSecured: safeNonNegativeInt(raw.totalDeepSecured),
    totalRewardUnits: safeNonNegativeInt(raw.totalRewardUnits),
  };
}

// ---------- Latch state normalisation ----------

function normaliseLatchEntry(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    latchLeadsLive: safeBool(raw.latchLeadsLive),
    liveLeadsLatch: safeBool(raw.liveLeadsLatch),
  };
}

function normaliseLatchState(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const result = {};
  for (const [monsterId, entry] of Object.entries(raw)) {
    result[monsterId] = normaliseLatchEntry(entry);
  }
  return result;
}

// ---------- Session context normalisation ----------

function normaliseSessionContext(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : null,
    commandCount: safeNonNegativeInt(raw.commandCount),
    lastCommandAt: safeNonNegativeInt(raw.lastCommandAt),
  };
}

// ---------- Telemetry summary normalisation ----------

function normaliseTelemetryKind(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    eventsAccepted: safeNonNegativeInt(raw.eventsAccepted),
    eventsDropped: safeNonNegativeInt(raw.eventsDropped),
    eventsDeduped: safeNonNegativeInt(raw.eventsDeduped),
    eventsRateLimited: safeNonNegativeInt(raw.eventsRateLimited),
    lastEventAt: safeNonNegativeInt(raw.lastEventAt),
  };
}

function normaliseTelemetrySummary(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const result = {};
  for (const [kind, stats] of Object.entries(raw)) {
    result[kind] = normaliseTelemetryKind(stats);
  }
  return result;
}

// ---------- Top-level normalisation ----------

export function normalisePunctuationDiagnostic(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};

  // Normalise per-monster entries.
  const monstersRaw = isPlainObject(raw.monsters) ? raw.monsters : {};
  const monsters = {};
  for (const [monsterId, entry] of Object.entries(monstersRaw)) {
    monsters[monsterId] = normaliseMonsterDiagnostic(entry);
  }

  return {
    subjectId: safeString(raw.subjectId, 'punctuation'),
    generatedAt: safeNonNegativeInt(raw.generatedAt),
    releaseId: safeString(raw.releaseId, ''),
    monsters,
    grand: normaliseGrandDiagnostic(raw.grand),
    latchState: normaliseLatchState(raw.latchState),
    sessionContext: normaliseSessionContext(raw.sessionContext),
    telemetrySummary: normaliseTelemetrySummary(raw.telemetrySummary),
    projectionSource: safeString(raw.projectionSource, 'fresh'),
    totalPublishedRewardUnits: safeNonNegativeInt(raw.totalPublishedRewardUnits),
    activeMonsterIds: safeStringArray(raw.activeMonsterIds),
    directMonsterIds: safeStringArray(raw.directMonsterIds),
  };
}

// ---------- Section labels ----------

export const DIAGNOSTIC_SECTION_LABELS = {
  monsters: 'Per-Monster Diagnostic',
  grand: 'Grand Monster (Quoral)',
  latchState: 'Latch State',
  sessionContext: 'Session Context',
  telemetrySummary: 'Telemetry Summary',
};

export const DIAGNOSTIC_SECTIONS = Object.keys(DIAGNOSTIC_SECTION_LABELS);

// ---------- Section emptiness check ----------

export function isDiagnosticSectionEmpty(diagnostic, sectionKey) {
  const value = diagnostic?.[sectionKey];
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

// ---------- Format timestamp for display ----------

export function formatDiagnosticTimestamp(ts) {
  return formatAdminTimestamp(ts);
}
