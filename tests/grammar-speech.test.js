import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGrammarSpeechText,
  normaliseGrammarSpeechRate,
  speakGrammarReadModel,
} from '../src/subjects/grammar/speech.js';

function sampleGrammarReadModel() {
  return {
    phase: 'session',
    prefs: { speechRate: 1 },
    session: {
      type: 'practice',
      currentItem: {
        templateLabel: 'Spot the fronted adverbial',
        promptText: 'Choose the sentence with a correctly punctuated fronted adverbial.',
        checkLine: 'Look for the opener and comma.',
        inputSpec: {
          type: 'single_choice',
          options: [
            { value: 'a', label: 'After lunch, we revised grammar.' },
            { value: 'b', label: 'After lunch we revised grammar.' },
          ],
        },
      },
      supportGuidance: {
        title: 'Faded guidance',
        summary: 'A fronted adverbial usually comes before the main clause.',
        notices: ['Check where the comma sits.'],
      },
    },
    feedback: null,
  };
}

test('Grammar speech rate matches the legacy supported range', () => {
  assert.equal(normaliseGrammarSpeechRate(0.1), 0.6);
  assert.equal(normaliseGrammarSpeechRate(1), 1);
  assert.equal(normaliseGrammarSpeechRate('1.25'), 1.25);
  assert.equal(normaliseGrammarSpeechRate(9), 1.4);
  assert.equal(normaliseGrammarSpeechRate('bad', 1.2), 1.2);
});

test('Grammar speech text includes visible prompt, option and support text only', () => {
  const grammar = sampleGrammarReadModel();
  grammar.feedback = {
    result: {
      feedbackShort: 'Not quite.',
      feedbackLong: 'Look again at the opening phrase.',
      answerText: 'After lunch, we revised grammar.',
    },
  };

  const text = buildGrammarSpeechText(grammar);

  assert.match(text, /Choose the sentence/);
  assert.match(text, /After lunch, we revised grammar/);
  assert.match(text, /After lunch we revised grammar/);
  assert.match(text, /Faded guidance/);
  assert.match(text, /Answer: After lunch, we revised grammar/);
});

test('Grammar mini-test speech omits hidden feedback before the set is marked', () => {
  const grammar = {
    phase: 'session',
    session: {
      type: 'mini-set',
      currentItem: { promptText: 'Fallback prompt should not win.' },
      miniTest: {
        currentIndex: 0,
        finished: false,
        questions: [{
          current: true,
          item: {
            templateLabel: 'Mini-set item',
            promptText: 'Choose the sentence function.',
            inputSpec: {
              type: 'single_choice',
              options: [
                { value: 'statement', label: 'The bell rang.' },
                { value: 'question', label: 'Did the bell ring?' },
              ],
            },
          },
        }],
      },
    },
    feedback: {
      result: {
        feedbackShort: 'Hidden feedback',
        answerText: 'Did the bell ring?',
      },
    },
  };

  const text = buildGrammarSpeechText(grammar);

  assert.match(text, /Choose the sentence function/);
  assert.match(text, /The bell rang/);
  assert.doesNotMatch(text, /Hidden feedback/);
  assert.doesNotMatch(text, /Answer:/);
  assert.doesNotMatch(text, /Fallback prompt/);
});

test('Grammar speech uses browser synthesis when available and fails contained when absent', () => {
  const grammar = sampleGrammarReadModel();
  const calls = [];
  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this.rate = 1;
      this.lang = '';
    }
  }
  const globalObject = {
    SpeechSynthesisUtterance: FakeUtterance,
    speechSynthesis: {
      cancel() {
        calls.push({ type: 'cancel' });
      },
      speak(utterance) {
        calls.push({ type: 'speak', utterance });
      },
    },
  };

  const spoken = speakGrammarReadModel(grammar, { globalObject, rate: 3 });

  assert.equal(spoken.ok, true);
  assert.equal(spoken.rate, 1.4);
  assert.equal(calls[0].type, 'cancel');
  assert.equal(calls[1].type, 'speak');
  assert.equal(calls[1].utterance.lang, 'en-GB');
  assert.match(calls[1].utterance.text, /Spot the fronted adverbial/);

  const unavailable = speakGrammarReadModel(grammar, { globalObject: {}, rate: 1 });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.code, 'grammar_speech_unavailable');
  assert.match(unavailable.text, /Choose the sentence/);
});
