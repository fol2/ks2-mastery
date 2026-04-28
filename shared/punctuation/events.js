import { PUNCTUATION_SUBJECT_ID } from './content.js';

export const PUNCTUATION_EVENT_TYPES = Object.freeze({
  COMMAND_ACCEPTED: 'punctuation.command-accepted',
  ITEM_ATTEMPTED: 'punctuation.item-attempted',
  MISCONCEPTION_OBSERVED: 'punctuation.misconception-observed',
  UNIT_SECURED: 'punctuation.unit-secured',
  SESSION_COMPLETED: 'punctuation.session-completed',
  AVAILABILITY_DENIED: 'punctuation.availability-denied',
  STAR_EVIDENCE_UPDATED: 'punctuation.star-evidence-updated',
});

function safeTimestamp(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Date.now();
}

function eventId(type, parts) {
  return [type, ...parts].map((part) => String(part ?? 'unknown')).join(':');
}

function basePunctuationEvent(type, payload = {}, idParts = []) {
  const createdAt = safeTimestamp(payload.createdAt);
  return {
    id: eventId(type, idParts),
    type,
    subjectId: PUNCTUATION_SUBJECT_ID,
    learnerId: payload.learnerId || 'default',
    sessionId: payload.session?.id || payload.sessionId || null,
    createdAt,
  };
}

export function createPunctuationCommandAcceptedEvent({ learnerId, session, command, createdAt } = {}) {
  if (!command) return null;
  return {
    ...basePunctuationEvent(
      PUNCTUATION_EVENT_TYPES.COMMAND_ACCEPTED,
      { learnerId, session, createdAt },
      [learnerId || 'default', session?.id || 'no-session', command, createdAt || 'now'],
    ),
    command,
  };
}

export function createPunctuationItemAttemptedEvent({
  learnerId,
  session,
  item,
  result,
  answer = '',
  createdAt,
} = {}) {
  if (!item?.id) return null;
  const correct = Boolean(result?.correct);
  return {
    ...basePunctuationEvent(
      PUNCTUATION_EVENT_TYPES.ITEM_ATTEMPTED,
      { learnerId, session, createdAt },
      [learnerId || 'default', session?.id || 'session', item.id, Number(session?.answeredCount) || 0],
    ),
    itemId: item.id,
    variantSignature: item.variantSignature || '',
    mode: item.mode,
    skillIds: Array.isArray(item.skillIds) ? [...item.skillIds] : [],
    clusterId: item.clusterId || null,
    rewardUnitId: item.rewardUnitId || null,
    correct,
    answer: String(answer || '').slice(0, 500),
    misconceptionTags: Array.isArray(result?.misconceptionTags) ? [...result.misconceptionTags] : [],
  };
}

export function createPunctuationMisconceptionObservedEvents({
  learnerId,
  session,
  item,
  result,
  createdAt,
} = {}) {
  if (!item?.id || !Array.isArray(result?.misconceptionTags)) return [];
  return result.misconceptionTags.map((tag) => ({
    ...basePunctuationEvent(
      PUNCTUATION_EVENT_TYPES.MISCONCEPTION_OBSERVED,
      { learnerId, session, createdAt },
      [learnerId || 'default', session?.id || 'session', item.id, tag, Number(session?.answeredCount) || 0],
    ),
    itemId: item.id,
    mode: item.mode,
    skillIds: Array.isArray(item.skillIds) ? [...item.skillIds] : [],
    clusterId: item.clusterId || null,
    rewardUnitId: item.rewardUnitId || null,
    misconceptionTag: tag,
  }));
}

export function createPunctuationUnitSecuredEvent({
  learnerId,
  session,
  item,
  rewardUnit,
  masteryKey,
  createdAt,
} = {}) {
  if (!rewardUnit?.rewardUnitId || !masteryKey) return null;
  return {
    ...basePunctuationEvent(
      PUNCTUATION_EVENT_TYPES.UNIT_SECURED,
      { learnerId, session, createdAt },
      [learnerId || 'default', rewardUnit.releaseId, rewardUnit.clusterId, rewardUnit.rewardUnitId],
    ),
    releaseId: rewardUnit.releaseId,
    clusterId: rewardUnit.clusterId,
    rewardUnitId: rewardUnit.rewardUnitId,
    masteryKey,
    monsterId: rewardUnit.monsterId || null,
    itemId: item?.id || null,
    skillIds: Array.isArray(rewardUnit.skillIds) ? [...rewardUnit.skillIds] : [],
  };
}

export function createPunctuationSessionCompletedEvent({ learnerId, session, summary, createdAt } = {}) {
  if (!session?.id) return null;
  return {
    ...basePunctuationEvent(
      PUNCTUATION_EVENT_TYPES.SESSION_COMPLETED,
      { learnerId, session, createdAt },
      [learnerId || 'default', session.id],
    ),
    total: Number(summary?.total) || 0,
    correct: Number(summary?.correct) || 0,
    accuracy: Number(summary?.accuracy) || 0,
    focus: Array.isArray(summary?.focus) ? [...summary.focus] : [],
    securedUnits: Array.isArray(summary?.securedUnits) ? [...summary.securedUnits] : [],
  };
}

export function createPunctuationAvailabilityDeniedEvent({ learnerId, code, message, createdAt } = {}) {
  return {
    ...basePunctuationEvent(
      PUNCTUATION_EVENT_TYPES.AVAILABILITY_DENIED,
      { learnerId, createdAt },
      [learnerId || 'default', code || 'unavailable', createdAt || 'now'],
    ),
    code: code || 'punctuation_availability_denied',
    message: message || 'Punctuation is not available.',
  };
}
