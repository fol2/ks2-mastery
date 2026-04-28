import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldDelayMonsterCelebrations,
  spellingSessionEnded,
  subjectSessionEnded,
} from '../src/platform/game/monster-celebrations.js';

test('monster celebration timing keeps Spelling session-end behaviour', () => {
  assert.equal(shouldDelayMonsterCelebrations('spelling', { phase: 'session' }, { phase: 'session' }), true);
  assert.equal(subjectSessionEnded('spelling', { phase: 'session' }, { phase: 'summary' }), true);
  assert.equal(spellingSessionEnded({ phase: 'session' }, { phase: 'summary' }), true);
});

test('monster celebration timing defers Punctuation active-question overlays until session end', () => {
  assert.equal(shouldDelayMonsterCelebrations('punctuation', { phase: 'active-item' }, { phase: 'feedback' }), true);
  assert.equal(shouldDelayMonsterCelebrations('punctuation', { phase: 'feedback' }, { phase: 'summary' }), true);
  assert.equal(subjectSessionEnded('punctuation', { phase: 'feedback' }, { phase: 'summary' }), true);
  assert.equal(subjectSessionEnded('punctuation', { phase: 'setup' }, { phase: 'summary' }), false);
});

test('monster celebration timing defers Grammar session overlays until session end', () => {
  assert.equal(shouldDelayMonsterCelebrations('grammar', { phase: 'session' }, { phase: 'session' }), true);
  assert.equal(shouldDelayMonsterCelebrations('grammar', { phase: 'feedback' }, { phase: 'summary' }), true);
  assert.equal(subjectSessionEnded('grammar', { phase: 'session' }, { phase: 'summary' }), true);
  assert.equal(subjectSessionEnded('grammar', { phase: 'setup' }, { phase: 'summary' }), false);
});

test('monster celebration timing leaves unknown subjects immediate', () => {
  assert.equal(shouldDelayMonsterCelebrations('reading', { phase: 'session' }, { phase: 'session' }), false);
  assert.equal(subjectSessionEnded('reading', { phase: 'session' }, { phase: 'summary' }), false);
});
