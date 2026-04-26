import { cloneSerialisable } from '../../../src/platform/core/repositories/helpers.js';

export const LEARNER_SUMMARY_MODEL_KEY = 'learner.summary.v1';
export const PARENT_SUMMARY_MODEL_KEY = 'parent.summary.v1';
export const COMMAND_PROJECTION_MODEL_KEY = 'command.projection.v1';

// U6: persisted schema version inside the command.projection.v1 payload.
// Additive-only changes keep version at 1; a breaking shape change would
// bump to 2 with an explicit migration path.
export const COMMAND_PROJECTION_SCHEMA_VERSION = 1;

// U6: bounded ring of the most-recent event tokens stored inside the
// persisted projection shape so the hot-path dedupe (combineCommandEvents)
// does not need to reload event_log. 250 is a strict superset of
// PROJECTION_RECENT_EVENT_LIMIT (200) so the token set always covers the
// bounded-fallback window; a Smart Review session (60-120 commands) fits
// comfortably inside the ring.
export const RECENT_EVENT_TOKEN_RING_LIMIT = 250;

function ringClamp(tokens, limit = RECENT_EVENT_TOKEN_RING_LIMIT) {
  if (!Array.isArray(tokens)) return [];
  // Keep most-recent, drop oldest. Caller appends new tokens at the tail.
  const cleaned = tokens.filter((token) => typeof token === 'string' && token);
  if (cleaned.length <= limit) return cleaned;
  return cleaned.slice(cleaned.length - limit);
}

/**
 * Normalise the persisted command.projection.v1 payload shape. Returns a
 * plain object with:
 *   - `version`: number (0 when the row predates U6)
 *   - `rewards`: passthrough object
 *   - `eventCounts`: passthrough object
 *   - `recentEventTokens`: bounded string[] (may be empty)
 *   - `...rest`: any additional fields from a newer writer are preserved
 *     so older readers do not silently delete them (U6 newer-opaque path).
 */
export function normaliseCommandProjectionPayload(raw, {
  fallbackVersion = 0,
  tokenRingLimit = RECENT_EVENT_TOKEN_RING_LIMIT,
} = {}) {
  const payload = isPlainObject(raw) ? raw : {};
  const version = Number.isFinite(Number(payload.version))
    ? Number(payload.version)
    : fallbackVersion;
  const rewards = isPlainObject(payload.rewards) ? payload.rewards : {};
  const eventCounts = isPlainObject(payload.eventCounts) ? payload.eventCounts : {};
  const recentEventTokens = ringClamp(payload.recentEventTokens, tokenRingLimit);
  return {
    ...payload,
    version,
    rewards,
    eventCounts,
    recentEventTokens,
  };
}

/**
 * Merge two token rings (winner + loser) keeping uniqueness and capping at
 * `tokenRingLimit` preserving the most-recent entries. Used by the CAS
 * retry path when a concurrent writer has already persisted a newer row.
 */
export function mergeRecentEventTokens(winnerTokens, loserTokens, {
  tokenRingLimit = RECENT_EVENT_TOKEN_RING_LIMIT,
} = {}) {
  const winner = Array.isArray(winnerTokens) ? winnerTokens : [];
  const loser = Array.isArray(loserTokens) ? loserTokens : [];
  const seen = new Set();
  const output = [];
  // Preserve winner tokens in order, then append any loser tokens not yet
  // seen. This keeps the most-recent tokens from the winning writer at
  // the tail while pulling in the loser's fresh additions.
  for (const token of winner) {
    if (typeof token !== 'string' || !token) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    output.push(token);
  }
  for (const token of loser) {
    if (typeof token !== 'string' || !token) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    output.push(token);
  }
  if (output.length <= tokenRingLimit) return output;
  return output.slice(output.length - tokenRingLimit);
}

/**
 * Append new tokens to an existing ring, clamped to `tokenRingLimit` keeping
 * the most-recent entries. Duplicates are skipped so the ring stays a set.
 */
export function appendRecentEventTokens(existing, tokens, {
  tokenRingLimit = RECENT_EVENT_TOKEN_RING_LIMIT,
} = {}) {
  const base = Array.isArray(existing) ? existing : [];
  const incoming = Array.isArray(tokens) ? tokens : [];
  if (!incoming.length) return ringClamp(base, tokenRingLimit);
  return mergeRecentEventTokens(base, incoming, { tokenRingLimit });
}
export const PUBLIC_ACTIVITY_TYPES = new Set([
  'spelling.retry-cleared',
  'spelling.word-secured',
  'spelling.mastery-milestone',
  'spelling.session-completed',
  'reward.monster',
  'platform.practice-streak-hit',
]);

const PUBLIC_ACTIVITY_TEXT_ENUMS = {
  mode: new Set(['smart', 'trouble', 'single', 'test']),
  sessionType: new Set(['learning', 'test']),
  kind: new Set(['caught', 'evolve', 'mega', 'levelup']),
  monsterId: new Set(['inklet', 'glimmerbug', 'phaeton', 'vellhorn']),
  spellingPool: new Set(['core', 'extra']),
  yearBand: new Set(['3-4', '5-6', 'extra']),
  fromPhase: new Set(['retry', 'correction']),
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeJsonParse(text, fallback) {
  if (text == null || text === '') return cloneSerialisable(fallback);
  try {
    return JSON.parse(text);
  } catch {
    return cloneSerialisable(fallback);
  }
}

function safeText(value) {
  return typeof value === 'string' && value ? value : null;
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeEnum(key, value) {
  const text = safeText(value);
  const allowed = PUBLIC_ACTIVITY_TEXT_ENUMS[key];
  return text && allowed?.has(text) ? text : null;
}

export function normaliseReadModelKey(value, fallback = LEARNER_SUMMARY_MODEL_KEY) {
  const text = String(value || '').trim();
  return text || fallback;
}

export function emptyLearnerReadModel(modelKey = LEARNER_SUMMARY_MODEL_KEY) {
  return {
    modelKey: normaliseReadModelKey(modelKey),
    model: {},
    sourceRevision: 0,
    generatedAt: 0,
    updatedAt: 0,
    missing: true,
  };
}

export function normaliseLearnerReadModelRow(row, modelKey = LEARNER_SUMMARY_MODEL_KEY) {
  if (!row) return emptyLearnerReadModel(modelKey);
  const parsed = safeJsonParse(row.model_json, {});
  return {
    learnerId: row.learner_id || '',
    modelKey: normaliseReadModelKey(row.model_key, modelKey),
    model: isPlainObject(parsed) ? parsed : {},
    sourceRevision: Math.max(0, Number(row.source_revision) || 0),
    generatedAt: Math.max(0, Number(row.generated_at) || 0),
    updatedAt: Math.max(0, Number(row.updated_at) || 0),
    missing: false,
  };
}

export function publicActivityFromEventRow(row) {
  const parsed = safeJsonParse(row?.event_json, {});
  if (!isPlainObject(parsed)) return null;
  const type = safeText(parsed.type) || safeText(row?.event_type);
  if (!PUBLIC_ACTIVITY_TYPES.has(type)) return null;

  const output = {
    type,
    learnerId: safeText(parsed.learnerId) || safeText(row?.learner_id),
    subjectId: parsed.subjectId === 'spelling' || row?.subject_id === 'spelling' ? 'spelling' : null,
    createdAt: safeNumber(parsed.createdAt) ?? safeNumber(row?.created_at) ?? 0,
  };

  [
    'mode',
    'sessionType',
    'kind',
    'monsterId',
    'spellingPool',
    'yearBand',
    'fromPhase',
  ].forEach((key) => {
    const value = safeEnum(key, parsed[key]);
    if (value) output[key] = value;
  });

  [
    'totalWords',
    'mistakeCount',
    'milestone',
    'secureCount',
    'stage',
    'attemptCount',
    'streakDays',
  ].forEach((key) => {
    const value = safeNumber(parsed[key]);
    if (value != null) output[key] = value;
  });

  return output;
}

export function activityFeedRowFromEventRow(row, { now = Date.now() } = {}) {
  const activity = publicActivityFromEventRow(row);
  if (!activity) return null;
  const sourceEventId = safeText(row?.id);
  const createdAt = safeNumber(row?.created_at) ?? safeNumber(activity.createdAt) ?? now;
  return {
    id: sourceEventId ? `event:${sourceEventId}` : `activity:${activity.type}:${activity.learnerId}:${createdAt}`,
    learnerId: activity.learnerId || safeText(row?.learner_id) || '',
    subjectId: activity.subjectId || safeText(row?.subject_id) || null,
    activityType: activity.type,
    activity,
    sourceEventId,
    createdAt,
    updatedAt: now,
  };
}

export function normaliseActivityFeedRow(row) {
  if (!row) return null;
  const activity = safeJsonParse(row.activity_json, {});
  if (!isPlainObject(activity)) return null;
  return {
    id: row.id || '',
    learnerId: row.learner_id || activity.learnerId || null,
    subjectId: row.subject_id || activity.subjectId || null,
    activityType: row.activity_type || activity.type || 'activity',
    activity: cloneSerialisable(activity),
    sourceEventId: row.source_event_id || null,
    createdAt: Math.max(0, Number(row.created_at) || Number(activity.createdAt) || 0),
    updatedAt: Math.max(0, Number(row.updated_at) || 0),
  };
}
