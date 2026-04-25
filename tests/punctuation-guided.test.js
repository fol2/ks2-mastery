import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPunctuationContentIndexes,
} from '../shared/punctuation/content.js';
import {
  createMemoryState,
  memorySnapshot,
  updateMemoryState,
} from '../shared/punctuation/scheduler.js';
import { createPunctuationService } from '../shared/punctuation/service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeRepository() {
  let data = null;
  return {
    readData() {
      return data;
    },
    writeData(_learnerId, nextData) {
      data = JSON.parse(JSON.stringify(nextData));
      return data;
    },
    syncPracticeSession() {},
    snapshot() {
      return data;
    },
  };
}

function correctAnswerFor(readItem) {
  const source = createPunctuationContentIndexes().itemById.get(readItem.id);
  assert.ok(source, `Expected source item for ${readItem.id}`);
  if (readItem.inputKind === 'choice') return { choiceIndex: source.correctIndex };
  return { typed: source.model };
}

test('guided mode starts against the requested published skill', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });

  const start = service.startSession('learner-a', {
    mode: 'guided',
    skillId: 'speech',
    roundLength: '2',
  }).state;

  assert.equal(start.session.mode, 'guided');
  assert.equal(start.session.guidedSkillId, 'speech');
  assert.equal(start.session.guidedSupportLevel, 2);
  assert.equal(typeof start.session.guided.teachBox.workedExample.before, 'string');
  assert.equal(typeof start.session.guided.teachBox.contrastExample.before, 'string');
  assert.equal(start.session.currentItem.skillIds.includes('speech'), true);
  assert.equal(start.session.currentItem.mode, 'choose');
});

test('guided mode falls back to a valid skill when the requested skill is unavailable', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });

  const start = service.startSession('learner-a', {
    mode: 'guided',
    skillId: 'not-a-skill',
    roundLength: '1',
  }).state;

  assert.equal(start.session.mode, 'guided');
  assert.equal(typeof start.session.guidedSkillId, 'string');
  assert.equal(start.session.currentItem.skillIds.includes(start.session.guidedSkillId), true);
});

test('guided support decreases after clean answers and is recorded on attempts', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });

  const start = service.startSession('learner-a', {
    mode: 'guided',
    skillId: 'sentence_endings',
    roundLength: '2',
  }).state;
  const first = service.submitAnswer('learner-a', start, correctAnswerFor(start.session.currentItem)).state;

  assert.equal(first.session.guidedSupportLevel, 1);
  assert.equal(first.session.guided.teachBox.workedExample, undefined);
  assert.equal(typeof first.session.guided.teachBox.rule, 'string');
  assert.equal(repository.snapshot().progress.attempts.at(-1).sessionMode, 'guided');
  assert.equal(repository.snapshot().progress.attempts.at(-1).supportLevel, 2);

  const next = service.continueSession('learner-a', first).state;
  const second = service.submitAnswer('learner-a', next, correctAnswerFor(next.session.currentItem)).state;
  assert.equal(second.session.guidedSupportLevel, 0);
  assert.equal(second.session.guided.teachBox, null);
  assert.equal(repository.snapshot().progress.attempts.at(-1).supportLevel, 1);
});

test('supported correct answers do not create a clean secure streak', () => {
  let state = createMemoryState();
  state = updateMemoryState(state, true, 0, { supported: true });
  state = updateMemoryState(state, true, 8 * DAY_MS, { supported: true });
  state = updateMemoryState(state, true, 16 * DAY_MS, { supported: true });

  const snap = memorySnapshot(state, 16 * DAY_MS);
  assert.equal(snap.state.correct, 3);
  assert.equal(snap.state.streak, 0);
  assert.equal(snap.secure, false);
});
