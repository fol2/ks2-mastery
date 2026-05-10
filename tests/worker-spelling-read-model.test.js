import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSpellingReadModel } from '../worker/src/subjects/spelling/read-models.js';

test('spelling read model reveals the correct spelling only in correction phase', () => {
  const correctionModel = buildSpellingReadModel({
    learnerId: 'learner-a',
    state: {
      phase: 'session',
      awaitingAdvance: false,
      session: {
        id: 'session-a',
        type: 'learning',
        mode: 'smart',
        phase: 'correction',
        promptCount: 2,
        progress: { done: 0, total: 1 },
        currentCard: {
          word: { word: 'possess', slug: 'possess' },
          prompt: { sentence: 'Do not expose possess.', cloze: 'Do not expose ________.' },
        },
      },
      feedback: {
        kind: 'error',
        headline: 'Try again.',
        answer: 'possess',
        attemptedAnswer: 'posess',
        body: 'Type the correct spelling exactly once before moving on.',
      },
    },
  });

  assert.equal(correctionModel.session.currentCard.word, undefined);
  assert.equal(correctionModel.session.currentCard.prompt.sentence, undefined);
  assert.equal(correctionModel.session.currentCard.prompt.cloze, 'Do not expose ________.');
  assert.equal(correctionModel.feedback.answer, 'possess');
  assert.equal(correctionModel.feedback.attemptedAnswer, 'posess');

  const retryModel = buildSpellingReadModel({
    learnerId: 'learner-a',
    state: {
      phase: 'session',
      awaitingAdvance: false,
      session: {
        id: 'session-a',
        type: 'learning',
        mode: 'smart',
        phase: 'retry',
        promptCount: 1,
        progress: { done: 0, total: 1 },
        currentCard: {
          word: { word: 'possess', slug: 'possess' },
          prompt: { sentence: 'Do not expose possess.', cloze: 'Do not expose ________.' },
        },
      },
      feedback: {
        kind: 'error',
        headline: 'Not quite.',
        answer: 'possess',
        attemptedAnswer: 'posess',
        body: 'No answer shown yet. Hear it again and try once more from memory.',
      },
    },
  });

  assert.equal(retryModel.feedback.answer, undefined);
  assert.equal(retryModel.feedback.attemptedAnswer, 'posess');
});
