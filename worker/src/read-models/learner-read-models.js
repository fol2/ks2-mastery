import { cloneSerialisable } from '../../../src/platform/core/repositories/helpers.js';

export const LEARNER_SUMMARY_MODEL_KEY = 'learner.summary.v1';
export const PARENT_SUMMARY_MODEL_KEY = 'parent.summary.v1';
export const COMMAND_PROJECTION_MODEL_KEY = 'command.projection.v1';
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
