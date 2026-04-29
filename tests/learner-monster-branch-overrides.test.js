import test from 'node:test';
import assert from 'node:assert/strict';

import {
  monsterBranchOverrideForLearner,
} from '../src/platform/game/learner-monster-branch-overrides.js';
import {
  ensureMonsterBranches,
} from '../src/platform/game/mastery/shared.js';
import {
  monsterSummaryFromSpellingAnalytics,
} from '../src/platform/game/mastery/spelling.js';
import {
  publicGameStateRowToRecord,
  publicMonsterCodexStateFromSpellingProgress,
} from '../worker/src/row-transforms.js';

const NELSON_ID = '86a6c60f-e1ef-4985-954d-95ab13349c6f';
const EUGENIA_ID = 'be3b6831-d7c3-4318-9560-02051dc67704';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeGameStateRepository(initialState = {}) {
  let state = clone(initialState);
  let writes = 0;
  return {
    read() {
      return clone(state);
    },
    write(_learnerId, _systemId, nextState) {
      writes += 1;
      state = clone(nextState);
      return clone(state);
    },
    writes() {
      return writes;
    },
  };
}

test('known review learners have pinned monster branches', () => {
  assert.equal(monsterBranchOverrideForLearner(NELSON_ID), 'b1');
  assert.equal(monsterBranchOverrideForLearner(EUGENIA_ID), 'b2');
  assert.equal(monsterBranchOverrideForLearner('learner-a'), null);
});

test('ensureMonsterBranches rewrites mismatched branches for pinned learners', () => {
  const repository = makeGameStateRepository({
    inklet: { branch: 'b2', caught: true },
    glimmerbug: { branch: 'b2' },
  });

  const state = ensureMonsterBranches(NELSON_ID, repository, {
    random: () => 0.75,
    monsterIds: ['inklet', 'glimmerbug', 'phaeton'],
  });

  assert.equal(state.inklet.branch, 'b1');
  assert.equal(state.glimmerbug.branch, 'b1');
  assert.equal(state.phaeton.branch, 'b1');
  assert.equal(repository.writes(), 1);
});

test('unrecognised learners keep existing branch behaviour', () => {
  const repository = makeGameStateRepository({
    inklet: { branch: 'b1', caught: true },
  });

  const state = ensureMonsterBranches('learner-a', repository, {
    random: () => 0.75,
    monsterIds: ['inklet', 'glimmerbug'],
  });

  assert.equal(state.inklet.branch, 'b1');
  assert.equal(state.glimmerbug.branch, 'b2');
});

test('public monster-codex bootstrap redacts stored branch to learner pin', () => {
  const state = publicGameStateRowToRecord({
    learner_id: EUGENIA_ID,
    system_id: 'monster-codex',
    state_json: JSON.stringify({
      inklet: { mastered: ['possess'], caught: true, branch: 'b1' },
      pealark: { branch: 'b1', starHighWater: 2 },
    }),
  });

  assert.equal(state.inklet.branch, 'b2');
  assert.equal(state.pealark.branch, 'b2');
  assert.equal(state.inklet.masteredCount, 1);
  assert.equal(state.pealark.starHighWater, 2);
});

test('derived spelling codex state uses learner pin when no stored branch exists', () => {
  const derived = publicMonsterCodexStateFromSpellingProgress(
    {
      possess: { stage: 4 },
      necessary: { stage: 4 },
      mollusc: { stage: 4 },
    },
    {
      words: [
        { slug: 'possess', year: '3-4' },
        { slug: 'necessary', year: '5-6' },
        { slug: 'mollusc', spellingPool: 'extra', yearBand: 'extra' },
      ],
    },
    {},
    { learnerId: EUGENIA_ID },
  );

  assert.equal(derived.state.inklet.branch, 'b2');
  assert.equal(derived.state.glimmerbug.branch, 'b2');
  assert.equal(derived.state.phaeton.branch, 'b2');
  assert.equal(derived.state.vellhorn.branch, 'b2');
});

test('read-only spelling analytics projections still apply learner pins', () => {
  const repository = makeGameStateRepository({});
  const summary = monsterSummaryFromSpellingAnalytics(
    { wordGroups: [] },
    {
      learnerId: EUGENIA_ID,
      gameStateRepository: repository,
      persistBranches: false,
    },
  );

  const spellingBranches = Object.fromEntries(
    summary
      .filter((entry) => entry.subjectId === 'spelling')
      .map((entry) => [entry.monster.id, entry.progress.branch]),
  );

  assert.equal(spellingBranches.inklet, 'b2');
  assert.equal(spellingBranches.glimmerbug, 'b2');
  assert.equal(spellingBranches.phaeton, 'b2');
  assert.equal(spellingBranches.vellhorn, 'b2');
  assert.equal(repository.writes(), 0);
});
