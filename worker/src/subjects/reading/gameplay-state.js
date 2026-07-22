import { cloneSerialisable } from '../../../../src/platform/core/repositories/helpers.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(value) {
  if (isPlainObject(value)) return cloneSerialisable(value) || {};
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function questionMap(value = {}) {
  return isPlainObject(value?.questions) ? value.questions : {};
}

/** Keep generated/per-question mastery out of Reading's live document. */
export function readingStateWithoutQuestionMastery(value = {}) {
  const output = isPlainObject(value) ? cloneSerialisable(value) || {} : {};
  output.questions = {};
  return output;
}

function addQuestionId(ids, value) {
  if (typeof value === 'string' && value) ids.add(value);
}

const READING_RETRY_WORKING_SET_LIMIT = 120;
const READING_RECENT_QUESTION_WORKING_SET_LIMIT = 72;

/**
 * A command needs the active paper/round plus explicit retry candidates. It
 * never needs every question the learner has encountered across all releases.
 */
export function readingGameplayQuestionIds(subjectRecord = {}, plannedQuestionIds = []) {
  const ids = new Set();
  for (const questionId of Array.isArray(plannedQuestionIds) ? plannedQuestionIds : []) {
    addQuestionId(ids, questionId);
  }
  for (const section of Array.isArray(subjectRecord?.ui?.session?.sections)
    ? subjectRecord.ui.session.sections
    : []) {
    for (const questionId of Array.isArray(section?.questionIds) ? section.questionIds : []) {
      addQuestionId(ids, questionId);
    }
  }
  const retryQueue = Array.isArray(subjectRecord?.data?.retryQueue)
    ? subjectRecord.data.retryQueue.slice(0, READING_RETRY_WORKING_SET_LIMIT)
    : [];
  for (const entry of retryQueue) {
    addQuestionId(ids, entry?.questionId);
  }
  const recentEvents = Array.isArray(subjectRecord?.data?.events)
    ? subjectRecord.data.events.slice(-READING_RECENT_QUESTION_WORKING_SET_LIMIT)
    : [];
  for (const event of recentEvents) addQuestionId(ids, event?.questionId);
  return [...ids];
}

export function composeReadingGameplaySubjectRecord(subjectRecord = {}, questionRows = []) {
  const questions = {};
  for (const row of Array.isArray(questionRows) ? questionRows : []) {
    const questionId = typeof row?.question_id === 'string' ? row.question_id : '';
    if (!questionId) continue;
    const mastery = parseJsonObject(row.mastery_json ?? row.mastery);
    if (mastery) questions[questionId] = mastery;
  }
  const data = readingStateWithoutQuestionMastery(subjectRecord?.data);
  data.questions = questions;
  return { ...subjectRecord, data };
}

function sameJson(left, right) {
  if (left == null || right == null) return left == null && right == null;
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Diff only the bounded question working set loaded for this command. */
export function changedReadingGameplayQuestions(previousData = {}, nextData = {}) {
  const previous = questionMap(previousData);
  const next = questionMap(nextData);
  const changed = [];
  // Catalogue normalisation can omit a retired question that was loaded only
  // for retry or session evidence. Omission must never delete cold learner
  // history; resetAllQuestions performs the intentional bulk deletion.
  for (const questionId of Object.keys(next)) {
    const before = isPlainObject(previous[questionId]) ? previous[questionId] : null;
    const after = isPlainObject(next[questionId]) ? next[questionId] : null;
    if (sameJson(before, after)) continue;
    changed.push({
      questionId,
      mastery: after ? cloneSerialisable(after) : null,
    });
  }
  return changed;
}
