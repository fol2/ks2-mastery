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

test('boundary transfer validators require target marks between preserved clauses', () => {
  const semicolon = markPunctuationAnswer({
    item: item('sc_transfer_rain_pitch'),
    answer: { typed: 'The rain had stopped; the pitch was still slippery.' },
  });
  assert.equal(semicolon.correct, true);
  assert.deepEqual(semicolon.misconceptionTags, []);

  const commaSplice = markPunctuationAnswer({
    item: item('sc_transfer_rain_pitch'),
    answer: { typed: 'The rain had stopped, the pitch was still slippery.' },
  });
  assert.equal(commaSplice.correct, false);
  assert.equal(commaSplice.misconceptionTags.includes('boundary.comma_splice'), true);

  const dash = markPunctuationAnswer({
    item: item('dc_transfer_flooded_route'),
    answer: { typed: 'The path was flooded - we took the longer route.' },
  });
  assert.equal(dash.correct, true);

  const missingDash = markPunctuationAnswer({
    item: item('dc_transfer_flooded_route'),
    answer: { typed: 'The path was flooded we took the longer route.' },
  });
  assert.equal(missingDash.correct, false);
  assert.equal(missingDash.misconceptionTags.includes('boundary.dash_missing'), true);
});

test('hyphen transfer validator requires the exact hyphenated phrase', () => {
  const correct = markPunctuationAnswer({
    item: item('hy_transfer_well_known'),
    answer: { typed: 'The well-known author visited our class.' },
  });
  assert.equal(correct.correct, true);

  const missingHyphen = markPunctuationAnswer({
    item: item('hy_transfer_well_known'),
    answer: { typed: 'The well known author visited our class.' },
  });
  assert.equal(missingHyphen.correct, false);
  assert.equal(missingHyphen.misconceptionTags.includes('boundary.hyphen_missing'), true);

  const changedPhrase = markPunctuationAnswer({
    item: item('hy_transfer_well_known'),
    answer: { typed: 'The famous author visited our class.' },
  });
  assert.equal(changedPhrase.correct, false);
  assert.equal(changedPhrase.misconceptionTags.includes('boundary.words_changed'), true);
});

test('structure transfer validators require explicit punctuation roles', () => {
  for (const typed of [
    'The library, which opened last year, is busy.',
    'The library (which opened last year) is busy.',
    'The library - which opened last year - is busy.',
  ]) {
    const parenthesis = markPunctuationAnswer({
      item: item('pa_transfer_library'),
      answer: { typed },
    });
    assert.equal(parenthesis.correct, true, typed);
  }

  const unbalancedParenthesis = markPunctuationAnswer({
    item: item('pa_transfer_library'),
    answer: { typed: 'The library, which opened last year is busy.' },
  });
  assert.equal(unbalancedParenthesis.correct, false);
  assert.equal(unbalancedParenthesis.misconceptionTags.includes('structure.parenthesis_unbalanced'), true);

  const colon = markPunctuationAnswer({
    item: item('cl_transfer_trip'),
    answer: { typed: 'We needed three things: a torch, a map and a whistle.' },
  });
  assert.equal(colon.correct, true);

  const missingColon = markPunctuationAnswer({
    item: item('cl_transfer_trip'),
    answer: { typed: 'We needed three things, a torch, a map and a whistle.' },
  });
  assert.equal(missingColon.correct, false);
  assert.equal(missingColon.misconceptionTags.includes('structure.colon_missing'), true);

  for (const typed of [
    'We needed three things: a torch, a map and a whistle, a rope.',
    'We needed three things: a torch, a map and a whistle. We also packed a rope.',
    'I packed a rope. We needed three things: a torch, a map and a whistle.',
  ]) {
    const malformedColonList = markPunctuationAnswer({
      item: item('cl_transfer_trip'),
      answer: { typed },
    });
    assert.equal(malformedColonList.correct, false, typed);
    assert.equal(malformedColonList.misconceptionTags.length > 0, true, typed);
  }

  const semicolonList = markPunctuationAnswer({
    item: item('sl_transfer_places'),
    answer: { typed: 'We visited York, England; Cardiff, Wales; and Belfast, Northern Ireland.' },
  });
  assert.equal(semicolonList.correct, true);

  const missingSemicolonList = markPunctuationAnswer({
    item: item('sl_transfer_places'),
    answer: { typed: 'We visited York, England, Cardiff, Wales and Belfast, Northern Ireland.' },
  });
  assert.equal(missingSemicolonList.correct, false);
  assert.equal(missingSemicolonList.misconceptionTags.includes('structure.semicolon_list_missing'), true);

  for (const typed of [
    'We visited York, England;; Cardiff, Wales; and Belfast, Northern Ireland.',
    'We visited York, England; and Cardiff, Wales; and Belfast, Northern Ireland.',
    'We visited York, England; Cardiff, Wales; and Belfast, Northern Ireland; Dublin, Ireland.',
  ]) {
    const malformedSemicolonList = markPunctuationAnswer({
      item: item('sl_transfer_places'),
      answer: { typed },
    });
    assert.equal(malformedSemicolonList.correct, false, typed);
    assert.equal(malformedSemicolonList.misconceptionTags.includes('structure.semicolon_list_missing'), true, typed);
  }

  const bullets = markPunctuationAnswer({
    item: item('bp_transfer_class'),
    answer: { typed: 'Bring:\n- a drink\n- a hat\n- a sketchbook' },
  });
  assert.equal(bullets.correct, true);

  const fullStopBullets = markPunctuationAnswer({
    item: item('bp_transfer_class'),
    answer: { typed: 'Bring:\n- a drink.\n- a hat.\n- a sketchbook.' },
  });
  assert.equal(fullStopBullets.correct, true);

  const missingBulletMarker = markPunctuationAnswer({
    item: item('bp_transfer_class'),
    answer: { typed: 'Bring:\na drink\n- a hat\n- a sketchbook' },
  });
  assert.equal(missingBulletMarker.correct, false);
  assert.equal(missingBulletMarker.misconceptionTags.includes('structure.bullet_marker_missing'), true);

  const inlineBullets = markPunctuationAnswer({
    item: item('bp_transfer_class'),
    answer: { typed: 'Bring: - a drink - a hat - a sketchbook' },
  });
  assert.equal(inlineBullets.correct, false);

  const mixedBulletPunctuation = markPunctuationAnswer({
    item: item('bp_transfer_class'),
    answer: { typed: 'Bring:\n- a drink.\n- a hat\n- a sketchbook.' },
  });
  assert.equal(mixedBulletPunctuation.correct, false);
  assert.equal(mixedBulletPunctuation.misconceptionTags.includes('structure.bullet_punctuation_inconsistent'), true);

  for (const typed of [
    'Bring:\n- a drink?\n- a hat?\n- a sketchbook?',
    'Bring:\n- a drink!\n- a hat!\n- a sketchbook!',
  ]) {
    const invalidBulletEnding = markPunctuationAnswer({
      item: item('bp_transfer_class'),
      answer: { typed },
    });
    assert.equal(invalidBulletEnding.correct, false, typed);
    assert.equal(invalidBulletEnding.misconceptionTags.includes('structure.bullet_punctuation_inconsistent'), true, typed);
  }
});

test('structure exact marking honours parenthesis variants and line-based bullet lists', () => {
  assert.equal(markPunctuationAnswer({
    item: item('pa_insert_museum'),
    answer: { typed: 'The museum (a former station) was busy.' },
  }).correct, true);

  assert.equal(markPunctuationAnswer({
    item: item('pa_fix_author'),
    answer: { typed: 'The author - who won the prize - smiled.' },
  }).correct, true);

  assert.equal(markPunctuationAnswer({
    item: item('pa_insert_museum'),
    answer: { typed: 'The museum – a former station – was busy.' },
  }).correct, true);

  assert.equal(markPunctuationAnswer({
    item: item('bp_insert_kit'),
    answer: { typed: 'Bring:\n- a drink\n- a hat\n- a sketchbook' },
  }).correct, true);

  assert.equal(markPunctuationAnswer({
    item: item('bp_insert_kit'),
    answer: { typed: 'Bring:\n- a drink.\n- a hat.\n- a sketchbook.' },
  }).correct, true);

  assert.equal(markPunctuationAnswer({
    item: item('bp_fix_consistency'),
    answer: { typed: 'Bring:\n- a drink.\n- a hat.\n- a sketchbook.' },
  }).correct, true);

  const inlineExactBullets = markPunctuationAnswer({
    item: item('bp_insert_kit'),
    answer: { typed: 'Bring: - a drink - a hat - a sketchbook' },
  });
  assert.equal(inlineExactBullets.correct, false);
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
