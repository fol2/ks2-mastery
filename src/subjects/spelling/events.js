import { WORD_BY_SLUG as DEFAULT_WORD_BY_SLUG } from './data/word-data.js';

export const SPELLING_EVENT_TYPES = Object.freeze({
  RETRY_CLEARED: 'spelling.retry-cleared',
  WORD_SECURED: 'spelling.word-secured',
  MASTERY_MILESTONE: 'spelling.mastery-milestone',
  SESSION_COMPLETED: 'spelling.session-completed',
  GUARDIAN_RENEWED: 'spelling.guardian.renewed',
  GUARDIAN_WOBBLED: 'spelling.guardian.wobbled',
  GUARDIAN_RECOVERED: 'spelling.guardian.recovered',
  GUARDIAN_MISSION_COMPLETED: 'spelling.guardian.mission-completed',
});

export const SPELLING_MASTERY_MILESTONES = Object.freeze([1, 5, 10, 25, 50, 100, 150, 200]);

function safeTimestamp(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Date.now();
}

function wordFields(slug, wordMeta = DEFAULT_WORD_BY_SLUG) {
  const word = wordMeta[slug];
  if (!word) return null;
  return {
    wordSlug: word.slug,
    word: word.word,
    family: word.family,
    yearBand: word.year,
    spellingPool: word.spellingPool === 'extra' ? 'extra' : 'core',
  };
}

function eventId(type, parts) {
  return [type, ...parts].map((part) => String(part ?? 'unknown')).join(':');
}

function baseSpellingEvent(type, payload = {}, idParts = []) {
  const createdAt = safeTimestamp(payload.createdAt);
  return {
    id: eventId(type, idParts),
    type,
    subjectId: 'spelling',
    learnerId: payload.learnerId || 'default',
    sessionId: payload.session?.id || payload.sessionId || null,
    mode: payload.session?.mode || payload.mode || null,
    createdAt,
  };
}

export function createSpellingRetryClearedEvent({ learnerId, session, slug, fromPhase, attemptCount = null, createdAt, wordMeta } = {}) {
  const word = wordFields(slug, wordMeta);
  if (!word) return null;
  if (!['retry', 'correction'].includes(fromPhase)) return null;

  return {
    ...baseSpellingEvent(
      SPELLING_EVENT_TYPES.RETRY_CLEARED,
      { learnerId, session, createdAt },
      [learnerId || 'default', session?.id || 'session', slug, fromPhase, Number.isInteger(attemptCount) ? attemptCount : 'na'],
    ),
    ...word,
    fromPhase,
    attemptCount: Number.isInteger(attemptCount) ? attemptCount : null,
  };
}

export function createSpellingWordSecuredEvent({ learnerId, session, slug, stage = null, createdAt, wordMeta } = {}) {
  const word = wordFields(slug, wordMeta);
  if (!word) return null;

  return {
    ...baseSpellingEvent(
      SPELLING_EVENT_TYPES.WORD_SECURED,
      { learnerId, session, createdAt },
      [learnerId || 'default', session?.id || 'session', slug, stage ?? 'secure'],
    ),
    ...word,
    stage: Number.isInteger(stage) ? stage : null,
  };
}

export function createSpellingMasteryMilestoneEvent({ learnerId, session, milestone, secureCount, createdAt } = {}) {
  const parsedMilestone = Number(milestone);
  if (!Number.isInteger(parsedMilestone) || parsedMilestone <= 0) return null;

  return {
    ...baseSpellingEvent(
      SPELLING_EVENT_TYPES.MASTERY_MILESTONE,
      { learnerId, session, createdAt },
      [learnerId || 'default', parsedMilestone],
    ),
    milestone: parsedMilestone,
    secureCount: Number.isInteger(Number(secureCount)) ? Number(secureCount) : parsedMilestone,
  };
}

export function createSpellingSessionCompletedEvent({ learnerId, session, summary, createdAt } = {}) {
  if (!session?.id) return null;
  return {
    ...baseSpellingEvent(
      SPELLING_EVENT_TYPES.SESSION_COMPLETED,
      { learnerId, session, createdAt },
      [learnerId || 'default', session.id],
    ),
    sessionType: session.type,
    totalWords: Array.isArray(session.uniqueWords) ? session.uniqueWords.length : 0,
    mistakeCount: Array.isArray(summary?.mistakes) ? summary.mistakes.length : 0,
  };
}

/**
 * Emitted when a word in a Guardian Mission is answered correctly and its
 * review interval advances to the next schedule step. Carries the resulting
 * reviewLevel and nextDueDay so reward subscribers (landing later) can show
 * "next check in N days" toasts without re-computing the schedule.
 */
export function createSpellingGuardianRenewedEvent({
  learnerId,
  session,
  slug,
  reviewLevel = 0,
  nextDueDay = null,
  createdAt,
  wordMeta,
} = {}) {
  const word = wordFields(slug, wordMeta);
  if (!word) return null;
  return {
    ...baseSpellingEvent(
      SPELLING_EVENT_TYPES.GUARDIAN_RENEWED,
      { learnerId, session, createdAt },
      [learnerId || 'default', session?.id || 'session', slug, Number.isInteger(reviewLevel) ? reviewLevel : 'na'],
    ),
    ...word,
    reviewLevel: Number.isInteger(reviewLevel) && reviewLevel >= 0 ? reviewLevel : 0,
    nextDueDay: Number.isInteger(nextDueDay) && nextDueDay >= 0 ? nextDueDay : null,
  };
}

/**
 * Emitted when a Guardian Mission word is answered wrongly and enters the
 * "wobbling" maintenance state. Mega stays intact; wobbling is a flag on the
 * guardian sibling record, not a demotion of progress.stage. Carries the
 * lapses count so reward subscribers can react to repeated wobbles.
 */
export function createSpellingGuardianWobbledEvent({
  learnerId,
  session,
  slug,
  lapses = 0,
  createdAt,
  wordMeta,
} = {}) {
  const word = wordFields(slug, wordMeta);
  if (!word) return null;
  return {
    ...baseSpellingEvent(
      SPELLING_EVENT_TYPES.GUARDIAN_WOBBLED,
      { learnerId, session, createdAt },
      [learnerId || 'default', session?.id || 'session', slug, Number.isInteger(lapses) ? lapses : 'na'],
    ),
    ...word,
    lapses: Number.isInteger(lapses) && lapses >= 0 ? lapses : 0,
  };
}

/**
 * Emitted when a previously-wobbling word is answered correctly and clears
 * its wobbling flag. Renewal count is the lifetime total of wobbling->clear
 * transitions for this word. reviewLevel is unchanged on recovery (preserves
 * the spaced schedule rather than restarting from 0).
 */
export function createSpellingGuardianRecoveredEvent({
  learnerId,
  session,
  slug,
  renewals = 0,
  reviewLevel = 0,
  createdAt,
  wordMeta,
} = {}) {
  const word = wordFields(slug, wordMeta);
  if (!word) return null;
  return {
    ...baseSpellingEvent(
      SPELLING_EVENT_TYPES.GUARDIAN_RECOVERED,
      { learnerId, session, createdAt },
      [learnerId || 'default', session?.id || 'session', slug, Number.isInteger(renewals) ? renewals : 'na'],
    ),
    ...word,
    renewals: Number.isInteger(renewals) && renewals >= 0 ? renewals : 0,
    reviewLevel: Number.isInteger(reviewLevel) && reviewLevel >= 0 ? reviewLevel : 0,
  };
}

/**
 * Emitted when a Guardian Mission round finalises to summary. Mirrors
 * createSpellingSessionCompletedEvent's shape but carries guardian-specific
 * counts so reward subscribers (and later dashboards) don't have to walk the
 * per-word event stream.
 */
export function createSpellingGuardianMissionCompletedEvent({
  learnerId,
  session,
  renewalCount = 0,
  wobbledCount = 0,
  recoveredCount = 0,
  createdAt,
} = {}) {
  if (!session?.id) return null;
  return {
    ...baseSpellingEvent(
      SPELLING_EVENT_TYPES.GUARDIAN_MISSION_COMPLETED,
      { learnerId, session, createdAt },
      [learnerId || 'default', session.id],
    ),
    totalWords: Array.isArray(session.uniqueWords) ? session.uniqueWords.length : 0,
    renewalCount: Number.isInteger(renewalCount) && renewalCount >= 0 ? renewalCount : 0,
    wobbledCount: Number.isInteger(wobbledCount) && wobbledCount >= 0 ? wobbledCount : 0,
    recoveredCount: Number.isInteger(recoveredCount) && recoveredCount >= 0 ? recoveredCount : 0,
  };
}
