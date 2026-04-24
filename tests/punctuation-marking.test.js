import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_INDEXES } from '../shared/punctuation/content.js';
import { evaluateSpeechRubric, markPunctuationAnswer } from '../shared/punctuation/marking.js';

function item(id) {
  return PUNCTUATION_CONTENT_INDEXES.itemById.get(id);
}

test('speech rubric accepts straight, curly, single, and double inverted commas', () => {
  const rubric = {
    type: 'speech',
    reportingPosition: 'before',
    spokenWords: 'can we start now',
    requiredTerminal: '?',
  };
  for (const answer of [
    'Mia asked, "Can we start now?"',
    "Mia asked, 'Can we start now?'",
    'Mia asked, “Can we start now?”',
    'Mia asked, ‘Can we start now?’',
  ]) {
    const result = evaluateSpeechRubric(answer, rubric);
    assert.equal(result.correct, true, answer);
    assert.deepEqual(result.misconceptionTags, []);
  }
});

test('speech rubric rejects punctuation outside the closing inverted comma', () => {
  const result = markPunctuationAnswer({
    item: item('sp_fix_question'),
    answer: { typed: '"Where are we meeting"? asked Zara.' },
  });
  assert.equal(result.correct, false);
  assert.equal(result.misconceptionTags.includes('speech.punctuation_outside_quote'), true);
});

test('speech rubric rejects missing, unmatched, and mixed quote pairs', () => {
  const missing = evaluateSpeechRubric('Mia asked, Can we start now?', {
    spokenWords: 'can we start now',
    requiredTerminal: '?',
  });
  assert.equal(missing.correct, false);
  assert.deepEqual(missing.misconceptionTags, ['speech.quote_missing']);

  const unmatched = evaluateSpeechRubric('Mia asked, “Can we start now?\'', {
    spokenWords: 'can we start now',
    requiredTerminal: '?',
  });
  assert.equal(unmatched.correct, false);
  assert.deepEqual(unmatched.misconceptionTags, ['speech.quote_unmatched']);
});

test('speech rubric rejects missing reporting comma and changed target words', () => {
  const noComma = markPunctuationAnswer({
    item: item('sp_insert_question'),
    answer: { typed: 'Ella asked "Can we start now?"' },
  });
  assert.equal(noComma.correct, false);
  assert.equal(noComma.misconceptionTags.includes('speech.reporting_comma_missing'), true);

  const changedWords = markPunctuationAnswer({
    item: item('sp_transfer_question'),
    answer: { typed: 'Mia asked, "Can we leave now?"' },
  });
  assert.equal(changedWords.correct, false);
  assert.equal(changedWords.misconceptionTags.includes('speech.words_changed'), true);
});

test('endmarks and apostrophe marking handles exact answers and constrained transfer', () => {
  assert.equal(markPunctuationAnswer({
    item: item('se_insert_question'),
    answer: { typed: 'Why was the hall still locked?' },
  }).correct, true);

  assert.equal(markPunctuationAnswer({
    item: item('ac_transfer_contractions'),
    answer: { typed: "We can't leave yet because we're still tidying up." },
  }).correct, true);

  const missingToken = markPunctuationAnswer({
    item: item('ap_transfer_possession'),
    answer: { typed: "The children's paintings were near the teachers notices." },
  });
  assert.equal(missingToken.correct, false);
  assert.equal(missingToken.misconceptionTags.includes('apostrophe.possession_missing'), true);
});

test('comma list transfer requires preserved items and KS2 list comma placement', () => {
  const correct = markPunctuationAnswer({
    item: item('lc_transfer_trip'),
    answer: { typed: 'For the trip, we packed torches, maps and water.' },
  });
  assert.equal(correct.correct, true);
  assert.deepEqual(correct.misconceptionTags, []);

  const missingComma = markPunctuationAnswer({
    item: item('lc_transfer_trip'),
    answer: { typed: 'For the trip, we packed torches maps and water.' },
  });
  assert.equal(missingComma.correct, false);
  assert.equal(missingComma.misconceptionTags.includes('comma.list_separator_missing'), true);

  const finalComma = markPunctuationAnswer({
    item: item('lc_transfer_trip'),
    answer: { typed: 'For the trip, we packed torches, maps, and water.' },
  });
  assert.equal(finalComma.correct, false);
  assert.equal(finalComma.misconceptionTags.includes('comma.unnecessary_final_comma'), true);
});

test('fronted adverbial and clarity transfers require the opening phrase comma', () => {
  const fronted = markPunctuationAnswer({
    item: item('fa_transfer_after_lunch'),
    answer: { typed: 'After lunch, we practised our lines.' },
  });
  assert.equal(fronted.correct, true);

  const missingFrontedComma = markPunctuationAnswer({
    item: item('fa_transfer_after_lunch'),
    answer: { typed: 'After lunch we practised our lines.' },
  });
  assert.equal(missingFrontedComma.correct, false);
  assert.equal(missingFrontedComma.misconceptionTags.includes('comma.fronted_adverbial_missing'), true);

  const clarity = markPunctuationAnswer({
    item: item('cc_transfer_morning'),
    answer: { typed: 'In the morning, the path was quiet.' },
  });
  assert.equal(clarity.correct, true);

  const missingClarityComma = markPunctuationAnswer({
    item: item('cc_transfer_morning'),
    answer: { typed: 'In the morning the path was quiet.' },
  });
  assert.equal(missingClarityComma.correct, false);
  assert.equal(missingClarityComma.misconceptionTags.includes('comma.clarity_missing'), true);
});

test('choice marking accepts integer indexes only without coercing malformed values', () => {
  const speechChoice = item('sp_choose_reporting_comma');
  assert.equal(markPunctuationAnswer({ item: speechChoice, answer: { choiceIndex: 0 } }).correct, true);
  assert.equal(markPunctuationAnswer({ item: speechChoice, answer: { choiceIndex: '0' } }).correct, true);

  for (const choiceIndex of [null, '', [0], '0abc']) {
    assert.equal(markPunctuationAnswer({ item: speechChoice, answer: { choiceIndex } }).correct, false);
  }
});

test('empty, whitespace-only, overlong, and unsupported answer payloads return marked results', () => {
  for (const answer of ['', '   ', { typed: 'x'.repeat(2000) }, { unexpected: true }]) {
    const result = markPunctuationAnswer({ item: item('se_fix_statement'), answer });
    assert.equal(typeof result.correct, 'boolean');
    assert.equal(Array.isArray(result.misconceptionTags), true);
  }
});
