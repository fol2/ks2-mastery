import test from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryState, updateMemoryState } from '../shared/punctuation/scheduler.js';
import { createPunctuationService } from '../shared/punctuation/service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeRepository(initialData = null) {
  let data = initialData ? JSON.parse(JSON.stringify(initialData)) : null;
  return {
    readData() {
      return data;
    },
    writeData(_learnerId, nextData) {
      data = JSON.parse(JSON.stringify(nextData));
      return data;
    },
  };
}

test('punctuation analytics exposes safe mode, support, GPS, facet, goal, and streak evidence', () => {
  const now = Date.UTC(2026, 3, 25, 12, 0, 0);
  const repository = makeRepository({
    prefs: { mode: 'smart', roundLength: '4' },
    progress: {
      items: {
        sp_insert_question: updateMemoryState(createMemoryState(), false, now),
        sp_choose_reporting_comma: updateMemoryState(createMemoryState(), true, now - DAY_MS),
      },
      facets: {
        'speech::insert': updateMemoryState(createMemoryState(), false, now),
        'speech::choose': updateMemoryState(createMemoryState(), true, now - DAY_MS),
      },
      rewardUnits: {},
      attempts: [
        {
          ts: now - DAY_MS,
          sessionId: 'gps-session',
          itemId: 'sp_choose_reporting_comma',
          mode: 'choose',
          skillIds: ['speech'],
          rewardUnitId: 'speech-core',
          sessionMode: 'gps',
          testMode: 'gps',
          supportLevel: 0,
          correct: true,
          misconceptionTags: [],
        },
        {
          ts: now,
          sessionId: 'guided-session',
          itemId: 'sp_insert_question',
          mode: 'insert',
          skillIds: ['speech'],
          rewardUnitId: 'speech-core',
          sessionMode: 'guided',
          supportLevel: 2,
          correct: false,
          attemptedAnswer: 'Noah shouted we made it.',
          model: '"We made it!" shouted Noah.',
          displayCorrection: '"We made it!" shouted Noah.',
          misconceptionTags: ['speech.quote_missing'],
          facetOutcomes: [{ id: 'speech::insert', label: 'Speech - Insert punctuation', ok: false }],
        },
      ],
      sessionsCompleted: 2,
    },
  });
  const service = createPunctuationService({ repository, now: () => now, random: () => 0 });

  const analytics = service.getAnalyticsSnapshot('learner-a');

  assert.equal(analytics.bySessionMode.find((entry) => entry.id === 'guided').accuracy, 0);
  assert.equal(analytics.bySessionMode.find((entry) => entry.id === 'gps').accuracy, 100);
  assert.equal(analytics.byItemMode.find((entry) => entry.id === 'insert').wrong, 1);
  assert.equal(analytics.weakestFacets[0].id, 'speech::insert');
  assert.equal(analytics.dailyGoal.attemptsToday, 1);
  assert.equal(analytics.streak.currentDays, 2);

  const mistake = analytics.recentMistakes[0];
  assert.equal(mistake.sessionMode, 'guided');
  assert.equal(mistake.supportLevel, 2);
  assert.equal(mistake.supportKind, 'guided');
  assert.equal(mistake.testMode, null);
  assert.deepEqual(mistake.facetOutcomes, [{ id: 'speech::insert', label: 'Speech - Insert punctuation', ok: false }]);
  assert.equal(analytics.misconceptionPatterns[0].id, 'speech.quote_missing');

  assert.equal(Object.hasOwn(mistake, 'attemptedAnswer'), false);
  assert.equal(Object.hasOwn(mistake, 'model'), false);
  assert.equal(Object.hasOwn(mistake, 'displayCorrection'), false);
});
