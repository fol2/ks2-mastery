import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGrammarSpeechText } from '../src/subjects/grammar/speech.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGrammar(item, overrides = {}) {
  return {
    phase: 'session',
    session: {
      type: 'practice',
      currentItem: item,
      ...overrides,
    },
    feedback: null,
  };
}

function makeMiniTestGrammar(item) {
  return {
    phase: 'session',
    session: {
      type: 'mini-set',
      currentItem: { promptText: 'This fallback must not appear.' },
      miniTest: {
        currentIndex: 0,
        finished: false,
        questions: [{
          current: true,
          item,
        }],
      },
    },
    feedback: null,
  };
}

// ---------------------------------------------------------------------------
// 1. word_class_underlined_choice with readAloudText mentions underlined word
// ---------------------------------------------------------------------------

test('readAloudText preference: word_class_underlined_choice mentions the underlined word', () => {
  const item = {
    templateLabel: 'Identify the word class',
    promptText: 'What word class is the underlined word?',
    readAloudText: 'What word class is the underlined word? The underlined word is: beautiful.',
    screenReaderPromptText: 'What word class is the underlined word? Target word: beautiful',
    checkLine: 'Think about what the word describes.',
    inputSpec: {
      type: 'single_choice',
      options: [
        { value: 'adjective', label: 'adjective' },
        { value: 'adverb', label: 'adverb' },
        { value: 'noun', label: 'noun' },
      ],
    },
  };

  const text = buildGrammarSpeechText(makeGrammar(item));

  assert.match(text, /The underlined word is: beautiful/,
    'readAloudText must be used as primary prompt');
  assert.match(text, /adjective/, 'inputSpec options must still be appended');
  // Must NOT duplicate promptText alongside readAloudText
  const underlinedCount = (text.match(/underlined word/g) || []).length;
  assert.ok(underlinedCount <= 2,
    'readAloudText should not cause duplication of prompt content');
});

// ---------------------------------------------------------------------------
// 2. qg_p4_voice_roles_transfer item mentions the noun phrase
// ---------------------------------------------------------------------------

test('readAloudText preference: voice_roles_transfer item mentions the noun phrase', () => {
  const item = {
    templateLabel: 'Voice roles transfer',
    promptText: 'What is the function of the underlined noun phrase?',
    readAloudText: 'What is the function of the underlined noun phrase? The underlined word is: the old cat.',
    screenReaderPromptText: 'What is the function of the underlined noun phrase? Target word: the old cat',
    checkLine: 'Consider subject, object, or complement.',
    inputSpec: {
      type: 'single_choice',
      options: [
        { value: 'subject', label: 'subject' },
        { value: 'object', label: 'object' },
      ],
    },
  };

  const text = buildGrammarSpeechText(makeGrammar(item));

  assert.match(text, /the old cat/, 'must mention the noun phrase from readAloudText');
  assert.match(text, /subject/, 'options must still appear');
});

// ---------------------------------------------------------------------------
// 3. Row-specific table_choice speech lists per-row choices
// ---------------------------------------------------------------------------

test('table_choice with row-specific options lists per-row choices', () => {
  const item = {
    templateLabel: 'Sort the words',
    promptText: 'Sort each word into the correct column.',
    inputSpec: {
      type: 'table_choice',
      rows: [
        { label: 'quickly', options: ['adverb', 'adjective'] },
        { label: 'bright', options: ['adverb', 'adjective'] },
        { label: 'carefully', options: ['adverb', 'adjective', 'noun'] },
      ],
      columns: ['adverb', 'adjective'],
    },
  };

  const text = buildGrammarSpeechText(makeGrammar(item));

  assert.match(text, /Row quickly: choices adverb, adjective/,
    'row-specific options must be announced per row');
  assert.match(text, /Row bright: choices adverb, adjective/,
    'each row must have its own announcement');
  assert.match(text, /Row carefully: choices adverb, adjective, noun/,
    'heterogeneous row must list all its options');
});

// ---------------------------------------------------------------------------
// 4. Homogeneous table_choice still uses global column fallback
// ---------------------------------------------------------------------------

test('table_choice without row-specific options uses global columns', () => {
  const item = {
    templateLabel: 'Classify sentences',
    promptText: 'Sort each sentence by type.',
    inputSpec: {
      type: 'table_choice',
      rows: [
        { label: 'The cat sat.' },
        { label: 'Did the cat sit?' },
      ],
      columns: ['statement', 'question', 'command'],
    },
  };

  const text = buildGrammarSpeechText(makeGrammar(item));

  assert.match(text, /Rows: The cat sat/,
    'homogeneous table must list row labels');
  assert.match(text, /Choices: statement, question, command/,
    'homogeneous table must list global columns');
  assert.doesNotMatch(text, /Row The cat sat: choices/,
    'must NOT use per-row format for homogeneous tables');
});

// ---------------------------------------------------------------------------
// 5. Empty readAloudText falls back to screenReaderPromptText
// ---------------------------------------------------------------------------

test('empty readAloudText falls back to screenReaderPromptText', () => {
  const item = {
    templateLabel: 'Word class',
    promptText: 'Select the word class.',
    readAloudText: '',
    screenReaderPromptText: 'Select the word class. Target word: running',
    inputSpec: { type: 'single_choice', options: [{ value: 'verb', label: 'verb' }] },
  };

  const text = buildGrammarSpeechText(makeGrammar(item));

  assert.match(text, /Target word: running/,
    'screenReaderPromptText must be used when readAloudText is empty');
  assert.doesNotMatch(text, /^.*Select the word class\. Select the word class/,
    'must not duplicate the prompt text');
});

// ---------------------------------------------------------------------------
// 6. Item with neither readAloudText nor screenReaderPromptText falls back to promptText
// ---------------------------------------------------------------------------

test('item without readAloudText or screenReaderPromptText falls back to promptText', () => {
  const item = {
    templateLabel: 'Spot the adverbial',
    promptText: 'Choose the sentence with a fronted adverbial.',
    checkLine: 'Look for the opener.',
    inputSpec: {
      type: 'single_choice',
      options: [
        { value: 'a', label: 'After lunch, we played.' },
        { value: 'b', label: 'We played after lunch.' },
      ],
    },
  };

  const text = buildGrammarSpeechText(makeGrammar(item));

  assert.match(text, /Choose the sentence with a fronted adverbial/,
    'promptText must be used as fallback');
  assert.match(text, /After lunch, we played/, 'options must still appear');
});

// ---------------------------------------------------------------------------
// 7. Mini-test mode uses current item's readAloudText
// ---------------------------------------------------------------------------

test('mini-test mode uses current item readAloudText', () => {
  const item = {
    templateLabel: 'Mini word class',
    promptText: 'What word class is the underlined word?',
    readAloudText: 'What word class is the underlined word? The underlined word is: slowly.',
    inputSpec: {
      type: 'single_choice',
      options: [{ value: 'adverb', label: 'adverb' }],
    },
  };

  const text = buildGrammarSpeechText(makeMiniTestGrammar(item));

  assert.match(text, /The underlined word is: slowly/,
    'mini-test must use readAloudText from the current item');
  assert.doesNotMatch(text, /This fallback must not appear/,
    'must use mini-test item not session.currentItem');
});

// ---------------------------------------------------------------------------
// 8. readAloudText does NOT also push promptText (no duplication)
// ---------------------------------------------------------------------------

test('readAloudText prevents promptText duplication', () => {
  const item = {
    templateLabel: 'Determiner',
    promptText: 'Choose the determiner.',
    readAloudText: 'Choose the determiner. The underlined word is: the.',
    inputSpec: { type: 'single_choice', options: [{ value: 'the', label: 'the' }] },
  };

  const text = buildGrammarSpeechText(makeGrammar(item));

  // "Choose the determiner" should appear exactly once (inside readAloudText)
  const matches = text.match(/Choose the determiner/g) || [];
  assert.equal(matches.length, 1,
    'promptText must not be pushed separately when readAloudText is used');
});

// ---------------------------------------------------------------------------
// 9. Whitespace-only readAloudText treated as empty (falls through)
// ---------------------------------------------------------------------------

test('whitespace-only readAloudText is treated as empty', () => {
  const item = {
    templateLabel: 'Conjunction',
    promptText: 'Select the conjunction.',
    readAloudText: '   ',
    screenReaderPromptText: 'Select the conjunction. Target word: and',
    inputSpec: { type: 'single_choice', options: [{ value: 'and', label: 'and' }] },
  };

  const text = buildGrammarSpeechText(makeGrammar(item));

  assert.match(text, /Target word: and/,
    'whitespace-only readAloudText must fall through to screenReaderPromptText');
});
