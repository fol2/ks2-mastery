import {
  cloneSerialisable,
  normalisePracticeSessionRecord,
} from '../../platform/core/repositories/index.js';
import { createInitialPunctuationData, normalisePunctuationData } from '../../../shared/punctuation/service.js';

const SUBJECT_ID = 'punctuation';

export function createPunctuationPersistence({ repositories } = {}) {
  if (!repositories) {
    throw new TypeError('Punctuation persistence requires platform repositories.');
  }

  return {
    readData(learnerId) {
      return normalisePunctuationData(repositories.subjectStates.read(learnerId, SUBJECT_ID).data);
    },
    writeData(learnerId, nextData) {
      return repositories.subjectStates.writeData(learnerId, SUBJECT_ID, normalisePunctuationData(nextData)).data;
    },
    syncPracticeSession(_learnerId, _state, record) {
      if (!record) return null;
      return repositories.practiceSessions.write(normalisePracticeSessionRecord(record));
    },
    abandonPracticeSession(_learnerId, _state, record) {
      if (!record) return null;
      return repositories.practiceSessions.write(normalisePracticeSessionRecord(record));
    },
    resetLearner(learnerId) {
      repositories.subjectStates.writeData(learnerId, SUBJECT_ID, createInitialPunctuationData());
      repositories.practiceSessions.clear(learnerId, SUBJECT_ID);
    },
    clone(value) {
      return cloneSerialisable(value);
    },
  };
}
