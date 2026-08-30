import {
  cloneSerialisable,
  normalisePracticeSessionRecord,
} from '../../platform/core/repositories/index.js';

const SUBJECT_ID = 'arithmetic';

function normaliseProgress(value = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    attempts: Math.max(0, Number(raw.attempts) || 0),
    correct: Math.max(0, Number(raw.correct) || 0),
    nextIndex: Math.max(0, Number(raw.nextIndex) || 0),
    sessionsCompleted: Math.max(0, Number(raw.sessionsCompleted) || 0),
    recentAttempts: Array.isArray(raw.recentAttempts)
      ? cloneSerialisable(raw.recentAttempts.slice(-20))
      : [],
  };
}

export function normaliseArithmeticHarnessData(value = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    prefs: raw.prefs && typeof raw.prefs === 'object' && !Array.isArray(raw.prefs)
      ? cloneSerialisable(raw.prefs)
      : {},
    progress: normaliseProgress(raw.progress),
  };
}

function sessionRecord(learnerId, session, status, now, summary = null) {
  return normalisePracticeSessionRecord({
    id: session.id,
    learnerId,
    subjectId: SUBJECT_ID,
    sessionKind: 'practice',
    status,
    sessionState: status === 'completed' ? null : cloneSerialisable(session),
    summary: summary ? cloneSerialisable(summary) : null,
    createdAt: session.startedAt,
    updatedAt: now,
  });
}

export function createArithmeticPersistence({ repositories } = {}) {
  if (!repositories) {
    throw new TypeError('Arithmetic persistence requires platform repositories.');
  }

  return {
    readData(learnerId) {
      return normaliseArithmeticHarnessData(
        repositories.subjectStates.read(learnerId, SUBJECT_ID).data,
      );
    },
    writeData(learnerId, nextData) {
      return repositories.subjectStates.writeData(
        learnerId,
        SUBJECT_ID,
        normaliseArithmeticHarnessData(nextData),
      ).data;
    },
    writeActiveSession(learnerId, session, now) {
      return repositories.practiceSessions.write(
        sessionRecord(learnerId, session, 'active', now),
      );
    },
    writeCompletedSession(learnerId, session, summary, now) {
      return repositories.practiceSessions.write(
        sessionRecord(learnerId, session, 'completed', now, summary),
      );
    },
    writeAbandonedSession(learnerId, session, now) {
      return repositories.practiceSessions.write(
        sessionRecord(learnerId, session, 'abandoned', now),
      );
    },
    resetLearner(learnerId) {
      repositories.subjectStates.writeData(
        learnerId,
        SUBJECT_ID,
        normaliseArithmeticHarnessData(),
      );
      repositories.practiceSessions.clear(learnerId, SUBJECT_ID);
    },
  };
}
