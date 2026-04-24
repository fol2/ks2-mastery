import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLearnerMonsterSummary } from '../src/platform/app/surface-models.js';
import { buildCodexEntries } from '../src/surfaces/home/data.js';

function makeContext({ rewardState = {}, analytics = null } = {}) {
  let writes = 0;
  return {
    services: {
      spelling: {
        getAnalyticsSnapshot() {
          return analytics;
        },
      },
    },
    repositories: {
      gameState: {
        read() {
          return rewardState;
        },
        write() {
          writes += 1;
          throw new Error('render must not write monster reward state');
        },
        writes() {
          return writes;
        },
      },
    },
  };
}

test('learner monster summary uses public reward projection when analytics is redacted', () => {
  const context = makeContext({
    rewardState: {
      inklet: { masteredCount: 14, caught: true, branch: 'b2' },
      glimmerbug: { masteredCount: 11, caught: true, branch: 'b1' },
      vellhorn: { masteredCount: 8, caught: true, branch: 'b2' },
    },
    analytics: { wordGroups: [] },
  });

  const summary = buildLearnerMonsterSummary('learner-a', context);

  assert.equal(summary.find((entry) => entry.monster.id === 'inklet').progress.mastered, 14);
  assert.equal(summary.find((entry) => entry.monster.id === 'glimmerbug').progress.branch, 'b1');
  assert.equal(summary.find((entry) => entry.monster.id === 'vellhorn').progress.caught, true);
  assert.equal(context.repositories.gameState.writes(), 0);

  const vellhornEntry = buildCodexEntries(summary).find((entry) => entry.id === 'vellhorn');
  assert.equal(vellhornEntry.displayState, 'egg');
  assert.match(vellhornEntry.img, /vellhorn-b2-0\.640\.webp/);
  assert.equal(vellhornEntry.placeholder, '');
});

test('learner monster summary falls back to analytics when reward projection is empty', () => {
  const context = makeContext({
    rewardState: {},
    analytics: {
      wordGroups: [
        {
          words: [
            { slug: 'possess', status: 'secure', year: '3-4' },
            { slug: 'mollusc', status: 'secure', year: 'extra', spellingPool: 'extra' },
          ],
        },
      ],
    },
  });

  const summary = buildLearnerMonsterSummary('learner-a', context);

  assert.equal(summary.find((entry) => entry.monster.id === 'inklet').progress.mastered, 1);
  assert.equal(summary.find((entry) => entry.monster.id === 'vellhorn').progress.mastered, 1);
  assert.equal(context.repositories.gameState.writes(), 0);
});
