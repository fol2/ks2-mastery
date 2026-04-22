import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import {
  ensureLocalCodexReviewProfile,
  LOCAL_CODEX_REVIEW_LEARNER_ID,
  LOCAL_CODEX_REVIEW_LEARNER_IDS,
  LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS,
} from '../src/platform/core/local-review-profile.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';
import { monsterSummaryFromSpellingAnalytics } from '../src/platform/game/monster-system.js';

function codexSummaryFor(repositories, learnerId) {
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories }),
    tts: { speak() {}, stop() {}, warmup() {} },
  });
  return monsterSummaryFromSpellingAnalytics(
    service.getAnalyticsSnapshot(learnerId),
    {
      learnerId,
      gameStateRepository: repositories.gameState,
      persistBranches: false,
    },
  );
}

test('local codex review profile seeds all review learners', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });

  const created = ensureLocalCodexReviewProfile(repositories, { now: () => Date.UTC(2026, 0, 1) });

  assert.equal(created, true);
  const learners = repositories.learners.read();
  assert.equal(learners.selectedId, LOCAL_CODEX_REVIEW_LEARNER_ID);
  assert.deepEqual(LOCAL_CODEX_REVIEW_LEARNER_IDS.every((id) => learners.allIds.includes(id)), true);
  assert.equal(learners.byId[LOCAL_CODEX_REVIEW_LEARNER_ID].name, 'Codex All Eggs');
  assert.equal(learners.byId[LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS[4]].name, 'Codex All Stage 4');

  const summary = codexSummaryFor(repositories, LOCAL_CODEX_REVIEW_LEARNER_ID);

  assert.deepEqual(summary.map((entry) => [entry.monster.id, entry.progress.caught, entry.progress.stage]), [
    ['inklet', true, 0],
    ['glimmerbug', true, 0],
    ['phaeton', true, 0],
    ['vellhorn', false, 0],
  ]);
});

test('local codex staged review learners seed matching creature stages', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });

  ensureLocalCodexReviewProfile(repositories, { now: () => Date.UTC(2026, 0, 1) });

  for (const [stage, learnerId] of Object.entries(LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS)) {
    const summary = codexSummaryFor(repositories, learnerId);
    assert.deepEqual(
      summary.map((entry) => [entry.monster.id, entry.progress.caught, entry.progress.stage]),
      [
        ['inklet', true, Number(stage)],
        ['glimmerbug', true, Number(stage)],
        ['phaeton', true, Number(stage)],
        ['vellhorn', false, 0],
      ],
    );
  }
});

test('local codex review profile can be force-selected by review mode', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });

  repositories.learners.write({
    byId: {
      'learner-a': {
        id: 'learner-a',
        name: 'Ava',
        yearGroup: 'Y5',
        avatarColor: '#3E6FA8',
        goal: 'sats',
        dailyMinutes: 15,
        weakSubjects: [],
        createdAt: 1,
      },
    },
    allIds: ['learner-a'],
    selectedId: 'learner-a',
  });

  ensureLocalCodexReviewProfile(repositories);
  assert.equal(repositories.learners.read().selectedId, 'local-codex-egg-review');

  repositories.learners.select('learner-a');
  ensureLocalCodexReviewProfile(repositories);
  assert.equal(repositories.learners.read().selectedId, 'learner-a');

  ensureLocalCodexReviewProfile(repositories, { select: true });
  assert.equal(repositories.learners.read().selectedId, LOCAL_CODEX_REVIEW_LEARNER_ID);

  ensureLocalCodexReviewProfile(repositories, { selectLearnerId: LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS[3] });
  assert.equal(repositories.learners.read().selectedId, LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS[3]);
});
