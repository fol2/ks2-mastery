import test from 'node:test';
import assert from 'node:assert/strict';

import { SEEDED_SPELLING_PUBLISHED_SNAPSHOT } from '../src/subjects/spelling/data/content-data.js';
import {
  isEnrichmentExtraWord,
  isSecureExtensionWord,
  isStatutoryCoreWord,
} from '../src/subjects/spelling/content/taxonomy.js';
import { buildSpellingProgressPools } from '../worker/src/content/spelling-read-models.js';
import { buildSpellingReadModel } from '../worker/src/subjects/spelling/read-models.js';

const DAY_MS = 24 * 60 * 60 * 1000;

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

test('spelling progress pools preserve tier totals and sample progress counters', () => {
  const now = Date.UTC(2026, 0, 1);
  const today = Math.floor(now / DAY_MS);
  const snapshot = SEEDED_SPELLING_PUBLISHED_SNAPSHOT;

  assert.equal(isStatutoryCoreWord(snapshot.wordBySlug.possess), true);
  assert.equal(isSecureExtensionWord(snapshot.wordBySlug.ability), true);
  assert.equal(isEnrichmentExtraWord(snapshot.wordBySlug.mollusc), true);

  const pools = buildSpellingProgressPools({
    contentSnapshot: snapshot,
    now,
    data: {
      progress: {
        possess: {
          stage: 4,
          attempts: 4,
          correct: 4,
          wrong: 0,
          dueDay: today + 30,
          lastDay: today - 1,
          lastResult: 'correct',
        },
        ability: {
          stage: 4,
          attempts: 2,
          correct: 2,
          wrong: 0,
          dueDay: today + 30,
          lastDay: today - 1,
          lastResult: 'correct',
        },
        mollusc: {
          stage: 1,
          attempts: 1,
          correct: 0,
          wrong: 1,
          dueDay: today,
          lastDay: today,
          lastResult: 'wrong',
        },
      },
    },
  });
  const coreTotal = snapshot.words.filter(isStatutoryCoreWord).length;
  const secureExtensionTotal = snapshot.words.filter(isSecureExtensionWord).length;
  const extraTotal = snapshot.words.filter(isEnrichmentExtraWord).length;

  assert.deepEqual(pools.all, pools.core);
  assert.equal(pools.core.total, coreTotal);
  assert.equal(pools.y34.total + pools.y56.total, coreTotal);
  assert.equal(pools.secureExtension.total, secureExtensionTotal);
  assert.equal(pools.extra.total, extraTotal);
  assert.equal(pools.core.secure, 1);
  assert.equal(pools.core.accuracy, 100);
  assert.equal(pools.secureExtension.secure, 1);
  assert.equal(pools.extra.due, 1);
  assert.equal(pools.extra.trouble, 1);
  assert.equal(pools.extra.accuracy, 0);
});
