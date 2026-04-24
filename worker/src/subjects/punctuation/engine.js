import {
  cloneSerialisable,
  normalisePracticeSessionRecord,
} from '../../../../src/platform/core/repositories/helpers.js';
import {
  createInitialPunctuationData,
  createPunctuationService,
  normalisePunctuationData,
  PunctuationServiceError,
} from '../../../../shared/punctuation/service.js';
import { createInitialPunctuationState } from '../../../../src/subjects/punctuation/service-contract.js';
import { BadRequestError, NotFoundError } from '../../errors.js';

const SUBJECT_ID = 'punctuation';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(now = Date.now) {
  const value = typeof now === 'function' ? Number(now()) : Number(now);
  return Number.isFinite(value) ? value : Date.now();
}

export function normaliseServerPunctuationData(value) {
  return normalisePunctuationData(value);
}

function practiceRecord(record) {
  return record ? normalisePracticeSessionRecord(record) : null;
}

function parseChoiceIndex(value) {
  if (Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

function createServerPersistence({ learnerId, data, now }) {
  let nextData = normaliseServerPunctuationData(data);
  let practiceSession = null;

  return {
    readData(nextLearnerId) {
      if (nextLearnerId && nextLearnerId !== learnerId) return createInitialPunctuationData();
      return cloneSerialisable(nextData);
    },
    writeData(nextLearnerId, value) {
      if (nextLearnerId && nextLearnerId !== learnerId) return cloneSerialisable(nextData);
      nextData = normaliseServerPunctuationData(value);
      return cloneSerialisable(nextData);
    },
    syncPracticeSession(nextLearnerId, _state, record) {
      if (nextLearnerId !== learnerId) return null;
      practiceSession = practiceRecord(record);
      return cloneSerialisable(practiceSession);
    },
    abandonPracticeSession(nextLearnerId, _state, record) {
      if (nextLearnerId !== learnerId) return null;
      practiceSession = practiceRecord(record);
      return cloneSerialisable(practiceSession);
    },
    resetLearner(nextLearnerId) {
      if (nextLearnerId !== learnerId) return;
      nextData = createInitialPunctuationData();
      practiceSession = null;
    },
    snapshot() {
      return normaliseServerPunctuationData(nextData);
    },
    practiceSession() {
      return practiceSession ? cloneSerialisable(practiceSession) : null;
    },
  };
}

function typedAnswerFromPayload(payload = {}) {
  if (typeof payload.typed === 'string') return payload.typed;
  if (typeof payload.answer === 'string') return payload.answer;
  const choiceIndex = parseChoiceIndex(payload.choiceIndex);
  if (choiceIndex != null) return { choiceIndex };
  return '';
}

function translatePunctuationError(error) {
  if (!(error instanceof PunctuationServiceError)) throw error;
  if (error.code === 'punctuation_content_unavailable') {
    throw new NotFoundError(error.message, {
      code: error.code,
      subjectId: SUBJECT_ID,
      ...(isPlainObject(error.details) ? error.details : {}),
    });
  }
  throw new BadRequestError(error.message, {
    code: error.code,
    subjectId: SUBJECT_ID,
    ...(isPlainObject(error.details) ? error.details : {}),
  });
}

export function createServerPunctuationEngine({ now = Date.now, random = Math.random } = {}) {
  const clock = () => timestamp(now);
  return {
    apply({
      learnerId,
      subjectRecord = {},
      command,
      payload = {},
    } = {}) {
      if (!(typeof learnerId === 'string' && learnerId)) {
        throw new BadRequestError('Learner id is required for punctuation commands.', {
          code: 'learner_id_required',
          subjectId: SUBJECT_ID,
        });
      }

      const persistence = createServerPersistence({
        learnerId,
        data: subjectRecord.data,
        now: clock,
      });
      const service = createPunctuationService({
        repository: persistence,
        now: clock,
        random,
      });
      const currentState = service.initState(subjectRecord.ui || createInitialPunctuationState(), learnerId);
      let transition;

      try {
        if (command === 'start-session') {
          transition = service.startSession(learnerId, payload);
        } else if (command === 'submit-answer') {
          transition = service.submitAnswer(learnerId, currentState, typedAnswerFromPayload(payload));
        } else if (command === 'continue-session') {
          transition = service.continueSession(learnerId, currentState);
        } else if (command === 'skip-item') {
          transition = service.skipItem(learnerId, currentState);
        } else if (command === 'end-session') {
          transition = service.endSession(learnerId, currentState);
        } else if (command === 'save-prefs') {
          const prefs = service.savePrefs(learnerId, payload.prefs || payload);
          transition = {
            ok: true,
            changed: true,
            state: service.initState(currentState),
            events: [],
            prefs,
          };
        } else if (command === 'reset-learner') {
          transition = service.resetLearner(learnerId);
        } else {
          throw new BadRequestError('Unsupported punctuation command.', {
            code: 'punctuation_command_unsupported',
            subjectId: SUBJECT_ID,
            command,
          });
        }
      } catch (error) {
        translatePunctuationError(error);
      }

      const nextState = service.markServerOwnedState(transition.state);
      return {
        ok: transition.ok !== false,
        changed: transition.changed !== false,
        state: nextState,
        data: persistence.snapshot(),
        practiceSession: persistence.practiceSession(),
        events: transition.events || [],
        prefs: transition.prefs || service.getPrefs(learnerId),
        stats: service.getStats(learnerId),
        analytics: service.getAnalyticsSnapshot(learnerId),
      };
    },
  };
}
