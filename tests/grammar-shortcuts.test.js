import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGrammarShortcut } from '../src/subjects/grammar/shortcuts.js';

function buildAppState({
  subjectId = 'grammar',
  tab = 'practice',
  phase = 'feedback',
  awaitingAdvance = true,
  sessionType = 'practice',
  pendingCommand = '',
} = {}) {
  return {
    route: { subjectId, tab },
    learners: { selectedId: 'learner-1' },
    subjectUi: {
      grammar: {
        phase,
        awaitingAdvance,
        pendingCommand,
        session: { id: 's-1', type: sessionType },
      },
    },
  };
}

test('resolveGrammarShortcut dispatches grammar-continue when Enter hits a feedback phase', () => {
  const result = resolveGrammarShortcut(
    { key: 'Enter', target: { tagName: 'BODY' } },
    buildAppState(),
  );
  assert.deepEqual(result, { action: 'grammar-continue', preventDefault: true });
});

test('resolveGrammarShortcut ignores Enter while the user is typing in a textarea', () => {
  const result = resolveGrammarShortcut(
    { key: 'Enter', target: { tagName: 'TEXTAREA' } },
    buildAppState(),
  );
  assert.equal(result, null);
});

test('resolveGrammarShortcut ignores Enter while the user is typing in an input', () => {
  const result = resolveGrammarShortcut(
    { key: 'Enter', target: { tagName: 'INPUT', name: 'answer' } },
    buildAppState(),
  );
  assert.equal(result, null);
});

test('resolveGrammarShortcut ignores Enter outside the Grammar practice tab', () => {
  const result = resolveGrammarShortcut(
    { key: 'Enter', target: { tagName: 'BODY' } },
    buildAppState({ subjectId: 'spelling' }),
  );
  assert.equal(result, null);
});

test('resolveGrammarShortcut ignores Enter when Grammar is not in feedback / awaiting advance', () => {
  const result = resolveGrammarShortcut(
    { key: 'Enter', target: { tagName: 'BODY' } },
    buildAppState({ phase: 'session', awaitingAdvance: false }),
  );
  assert.equal(result, null);
});

test('resolveGrammarShortcut ignores Enter during a strict mini-test', () => {
  const result = resolveGrammarShortcut(
    { key: 'Enter', target: { tagName: 'BODY' } },
    buildAppState({ sessionType: 'mini-set' }),
  );
  assert.equal(result, null);
});

test('resolveGrammarShortcut ignores Enter while a Grammar command is in flight', () => {
  const result = resolveGrammarShortcut(
    { key: 'Enter', target: { tagName: 'BODY' } },
    buildAppState({ pendingCommand: 'continue-session' }),
  );
  assert.equal(result, null);
});

test('resolveGrammarShortcut ignores modifier keys combined with Enter', () => {
  const result = resolveGrammarShortcut(
    { key: 'Enter', shiftKey: true, target: { tagName: 'BODY' } },
    buildAppState(),
  );
  assert.equal(result, null);
});

test('resolveGrammarShortcut ignores key-repeat Enter events so holding does not chain continues', () => {
  const result = resolveGrammarShortcut(
    { key: 'Enter', repeat: true, target: { tagName: 'BODY' } },
    buildAppState(),
  );
  assert.equal(result, null);
});

test('resolveGrammarShortcut ignores non-Enter keys', () => {
  const result = resolveGrammarShortcut(
    { key: 'Escape', target: { tagName: 'BODY' } },
    buildAppState(),
  );
  assert.equal(result, null);
});
