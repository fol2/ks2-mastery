import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGrammarSpeechText,
} from '../src/subjects/grammar/speech.js';
import {
  createGrammarQuestion,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

// --- Helpers ---

function wrapSession(item, overrides = {}) {
  return {
    phase: 'session',
    session: {
      type: 'practice',
      currentItem: item,
      supportGuidance: null,
      ...overrides,
    },
    feedback: null,
  };
}

// --- readAloudText priority ---

test('buildGrammarSpeechText uses readAloudText when present (word_class_underlined_choice)', () => {
  const grammar = wrapSession({
    readAloudText: 'Which word class is the underlined word? The underlined word is: cat.',
    screenReaderPromptText: 'Screen reader fallback prompt.',
    templateLabel: 'Word class — underlined',
    promptText: 'Identify the word class.',
    checkLine: 'Look at the underlined word.',
    inputSpec: {
      type: 'single_choice',
      options: [
        { value: 'noun', label: 'Noun' },
        { value: 'verb', label: 'Verb' },
      ],
    },
  });

  const text = buildGrammarSpeechText(grammar);

  // readAloudText is used
  assert.match(text, /underlined word is: cat/);
  // inputSpec options are still announced
  assert.match(text, /Options:/);
  assert.match(text, /Noun/);
  assert.match(text, /Verb/);
  // Legacy fields are NOT included (no duplication)
  assert.doesNotMatch(text, /Word class — underlined/);
  assert.doesNotMatch(text, /Identify the word class/);
  assert.doesNotMatch(text, /Look at the underlined word/);
});

test('buildGrammarSpeechText ignores empty readAloudText string', () => {
  const grammar = wrapSession({
    readAloudText: '   ',
    screenReaderPromptText: 'Accessible prompt here.',
    promptText: 'Legacy prompt.',
    inputSpec: { type: 'single_choice', options: [{ value: 'a', label: 'Alpha' }] },
  });

  const text = buildGrammarSpeechText(grammar);

  // Falls through to screenReaderPromptText
  assert.match(text, /Accessible prompt here/);
  assert.doesNotMatch(text, /Legacy prompt/);
});

// --- screenReaderPromptText fallback ---

test('buildGrammarSpeechText uses screenReaderPromptText when readAloudText is absent', () => {
  const grammar = wrapSession({
    screenReaderPromptText: 'Choose the correct determiner for the gap.',
    templateLabel: 'Determiners',
    promptText: 'Fill the gap.',
    checkLine: 'Think about the noun.',
    inputSpec: {
      type: 'single_choice',
      options: [
        { value: 'a', label: 'a' },
        { value: 'an', label: 'an' },
      ],
    },
  });

  const text = buildGrammarSpeechText(grammar);

  assert.match(text, /Choose the correct determiner/);
  assert.match(text, /Options:/);
  // Legacy fields are NOT included
  assert.doesNotMatch(text, /Determiners/);
  assert.doesNotMatch(text, /Fill the gap/);
  assert.doesNotMatch(text, /Think about the noun/);
});

// --- Final fallback (no readAloudText, no screenReaderPromptText) ---

test('buildGrammarSpeechText falls back to promptText + checkLine when no accessibility fields', () => {
  const grammar = wrapSession({
    templateLabel: 'Sentence types',
    promptText: 'Which sentence is an exclamation?',
    checkLine: 'Starts with what or how.',
    inputSpec: {
      type: 'single_choice',
      options: [
        { value: 'a', label: 'What a lovely day!' },
        { value: 'b', label: 'It is sunny today.' },
      ],
    },
  });

  const text = buildGrammarSpeechText(grammar);

  assert.match(text, /Sentence types/);
  assert.match(text, /Which sentence is an exclamation/);
  assert.match(text, /Starts with what or how/);
  assert.match(text, /Options:/);
  assert.match(text, /What a lovely day!/);
});

// --- table_choice row-specific options ---

test('inputSpecSpeechParts announces row-specific options for table_choice', () => {
  const grammar = wrapSession({
    promptText: 'Classify each word.',
    inputSpec: {
      type: 'table_choice',
      columns: ['Noun', 'Verb', 'Adjective'],
      rows: [
        { label: 'running', options: [{ label: 'Noun' }, { label: 'Verb' }] },
        { label: 'beautiful', options: [{ label: 'Adjective' }, { label: 'Noun' }] },
        { label: 'dance', options: [{ label: 'Noun' }, { label: 'Verb' }] },
      ],
    },
  });

  const text = buildGrammarSpeechText(grammar);

  assert.match(text, /Row running: Noun, Verb/);
  assert.match(text, /Row beautiful: Adjective, Noun/);
  assert.match(text, /Row dance: Noun, Verb/);
  // Global columns fallback NOT used
  assert.doesNotMatch(text, /Choices:/);
});

test('inputSpecSpeechParts uses global columns fallback for homogeneous table_choice', () => {
  const grammar = wrapSession({
    promptText: 'Sort words into columns.',
    inputSpec: {
      type: 'table_choice',
      columns: ['Past tense', 'Present tense'],
      rows: [
        { label: 'walked' },
        { label: 'running' },
        { label: 'jumped' },
      ],
    },
  });

  const text = buildGrammarSpeechText(grammar);

  assert.match(text, /Rows: walked/);
  assert.match(text, /Choices: Past tense, Present tense/);
  // Row-specific format NOT used
  assert.doesNotMatch(text, /Row walked:/);
});

test('table_choice row-specific options with readAloudText still announces per-row choices', () => {
  const grammar = wrapSession({
    readAloudText: 'Classify the underlined words into word classes.',
    inputSpec: {
      type: 'table_choice',
      rows: [
        { label: 'cat', options: [{ label: 'Noun' }, { label: 'Verb' }] },
        { label: 'run', options: [{ label: 'Noun' }, { label: 'Verb' }] },
      ],
    },
  });

  const text = buildGrammarSpeechText(grammar);

  assert.match(text, /Classify the underlined words/);
  assert.match(text, /Row cat: Noun, Verb/);
  assert.match(text, /Row run: Noun, Verb/);
});

// --- U8: mini-test mode uses readAloudText ---

test('mini-test mode uses readAloudText from current question item', () => {
  const grammarObj = {
    session: {
      type: 'mini-set',
      miniTest: {
        questions: [{
          current: true,
          item: {
            readAloudText: 'The underlined word is: cat.',
            promptText: 'fallback',
            inputSpec: {
              type: 'single_choice',
              options: [['a', 'Noun'], ['b', 'Verb']],
            },
          },
        }],
        currentIndex: 0,
      },
    },
    feedback: null,
  };

  const text = buildGrammarSpeechText(grammarObj);

  assert.match(text, /underlined word is: cat/);
  // Should NOT use the fallback promptText
  assert.doesNotMatch(text, /fallback/);
});

// --- U8: qg_p4_voice_roles_transfer generates readAloudText with focusCue ---

test('qg_p4_voice_roles_transfer generates speech text including focusCue.targetText', () => {
  const question = createGrammarQuestion({ templateId: 'qg_p4_voice_roles_transfer', seed: 1 });
  assert.ok(question, 'qg_p4_voice_roles_transfer must generate a question at seed 1');

  const serialised = serialiseGrammarQuestion(question);
  assert.ok(serialised, 'serialiseGrammarQuestion must return a serialised object');
  assert.ok(serialised.focusCue, 'qg_p4_voice_roles_transfer must produce a focusCue');
  assert.ok(serialised.focusCue.targetText, 'focusCue must have a targetText field');

  // Build a speech grammar object from the serialised question
  const grammarObj = wrapSession(serialised);
  const text = buildGrammarSpeechText(grammarObj);

  assert.ok(text.length > 0, 'speech text must not be empty');
  assert.match(text, new RegExp(serialised.focusCue.targetText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    `speech text must include focusCue.targetText "${serialised.focusCue.targetText}"`);
});
