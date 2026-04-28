import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_INDEXES } from '../shared/punctuation/content.js';
import { evaluateSpeechRubric, markPunctuationAnswer } from '../shared/punctuation/marking.js';

function item(id) {
  return PUNCTUATION_CONTENT_INDEXES.itemById.get(id);
}

function facet(result, id) {
  return result.facets.find((entry) => entry.id === id);
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

  const embeddedContractions = markPunctuationAnswer({
    item: item('ac_transfer_contractions'),
    answer: { typed: "We can'tankerous because we'rewolf." },
  });
  assert.equal(embeddedContractions.correct, false);
  assert.equal(embeddedContractions.misconceptionTags.includes('apostrophe.contraction_missing'), true);
  assert.equal(facet(embeddedContractions, 'preservation')?.ok, false);

  const missingToken = markPunctuationAnswer({
    item: item('ap_transfer_possession'),
    answer: { typed: "The children's paintings were near the teachers notices." },
  });
  assert.equal(missingToken.correct, false);
  assert.equal(missingToken.misconceptionTags.includes('apostrophe.possession_missing'), true);
  assert.equal(facet(missingToken, 'preservation')?.ok, false);
  assert.equal(facet(missingToken, 'terminal_punctuation')?.ok, true);
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
  assert.equal(finalComma.correct, true);
  assert.deepEqual(finalComma.misconceptionTags, []);

  const anchored = markPunctuationAnswer({
    item: item('lc_transfer_bake_sale'),
    answer: { typed: 'For the bake sale we needed eggs, flour, butter and sugar.' },
  });
  assert.equal(anchored.correct, true);

  const strictFinalCommaItem = item('lc_transfer_bake_sale');
  assert.equal(strictFinalCommaItem.validator.allowFinalComma, false);
  assert.match(`${strictFinalCommaItem.prompt} ${strictFinalCommaItem.explanation}`, /house style/i);
  assert.match(`${strictFinalCommaItem.prompt} ${strictFinalCommaItem.explanation}`, /no final comma before (?:the final )?and/i);
  const strictFinalComma = markPunctuationAnswer({
    item: strictFinalCommaItem,
    answer: { typed: 'For the bake sale we needed eggs, flour, butter, and sugar.' },
  });
  assert.equal(strictFinalComma.correct, false);
  assert.equal(strictFinalComma.misconceptionTags.includes('comma.unnecessary_final_comma'), true);
  assert.match(strictFinalComma.note, /house style: no final comma before the final and/i);

  const changedStem = markPunctuationAnswer({
    item: item('lc_transfer_bake_sale'),
    answer: { typed: 'For the party we needed eggs, flour, butter and sugar.' },
  });
  assert.equal(changedStem.correct, false);
  assert.equal(changedStem.misconceptionTags.includes('comma.list_words_changed'), true);
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

  const noMainClause = markPunctuationAnswer({
    item: item('fa_transfer_after_lunch'),
    answer: { typed: 'After lunch,.' },
  });
  assert.equal(noMainClause.correct, false);
  assert.equal(noMainClause.misconceptionTags.includes('comma.main_clause_missing'), true);
  assert.equal(facet(noMainClause, 'preservation')?.ok, false);
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

  for (const typed of [
    'The path was flooded - we took the longer route.',
    'The path was flooded – we took the longer route.',
    'The path was flooded — we took the longer route.',
  ]) {
    const variant = markPunctuationAnswer({
      item: item('dc_transfer_flooded_route'),
      answer: { typed },
    });
    assert.equal(variant.correct, true, typed);
  }

  const missingDash = markPunctuationAnswer({
    item: item('dc_transfer_flooded_route'),
    answer: { typed: 'The path was flooded we took the longer route.' },
  });
  assert.equal(missingDash.correct, false);
  assert.equal(missingDash.misconceptionTags.includes('boundary.dash_missing'), true);
});

test('dash-clause model display teaches a spaced en dash', () => {
  const dashItemIds = [
    'dc_choose_flooded_route',
    'dc_insert_door_froze',
    'dc_fix_signal_team',
    'dc_transfer_flooded_route',
    'dc_combine_flooded_route',
    'dc_choose_lights_out',
    'dc_insert_alarm_rang',
    'dc_transfer_curtain_rose',
  ];

  for (const itemId of dashItemIds) {
    const currentItem = item(itemId);
    assert.match(currentItem.model, /\s–\s/, `${itemId} model`);
    assert.doesNotMatch(currentItem.model, /\s-\s/, `${itemId} model`);
    if (currentItem.mode === 'choose') {
      assert.match(currentItem.options[currentItem.correctIndex], /\s–\s/, `${itemId} correct option`);
      assert.doesNotMatch(currentItem.options[currentItem.correctIndex], /\s-\s/, `${itemId} correct option`);
    }
  }
});

test('fixed dash-clause exact items accept spaced hyphen, en dash, and em dash answers', () => {
  const cases = [
    {
      itemId: 'dc_insert_door_froze',
      answers: [
        'The door creaked open - we froze.',
        'The door creaked open – we froze.',
        'The door creaked open — we froze.',
      ],
    },
    {
      itemId: 'dc_fix_signal_team',
      answers: [
        'The signal failed - the team waited.',
        'The signal failed – the team waited.',
        'The signal failed — the team waited.',
      ],
    },
  ];

  for (const { itemId, answers } of cases) {
    for (const typed of answers) {
      const result = markPunctuationAnswer({
        item: item(itemId),
        answer: { typed },
      });
      assert.equal(result.correct, true, `${itemId}: ${typed}`);
      assert.deepEqual(result.misconceptionTags, [], `${itemId}: ${typed}`);
    }
  }
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

  const legacyPhrase = markPunctuationAnswer({
    item: item('hy_transfer_man_eating_shark'),
    answer: { typed: 'The divers spotted a man-eating shark near the reef.' },
  });
  assert.equal(legacyPhrase.correct, true);

  const missingLegacyHyphen = markPunctuationAnswer({
    item: item('hy_transfer_man_eating_shark'),
    answer: { typed: 'The divers spotted a man eating shark near the reef.' },
  });
  assert.equal(missingLegacyHyphen.correct, false);
  assert.equal(missingLegacyHyphen.misconceptionTags.includes('boundary.hyphen_missing'), true);

  const embeddedLegacyPhrase = markPunctuationAnswer({
    item: item('hy_transfer_man_eating_shark'),
    answer: { typed: 'The divers spotted a human-eating shark near the reef.' },
  });
  assert.equal(embeddedLegacyPhrase.correct, false);
  assert.equal(embeddedLegacyPhrase.misconceptionTags.includes('boundary.words_changed'), true);

  const embeddedWellKnownPhrase = markPunctuationAnswer({
    item: item('hy_transfer_well_known'),
    answer: { typed: 'The swell-known author visited our class.' },
  });
  assert.equal(embeddedWellKnownPhrase.correct, false);
  assert.equal(embeddedWellKnownPhrase.misconceptionTags.includes('boundary.words_changed'), true);
});

test('P2 U3 free-text fixed anchors accept golden answers and tag representative misconceptions', () => {
  const cases = [
    {
      itemId: 'se_insert_quiet_command',
      correct: 'Please close the classroom door.',
      wrong: 'please close the classroom door',
      tag: 'endmarks.capitalisation_missing',
    },
    {
      itemId: 'se_fix_excited_statement',
      correct: 'What a clever idea!',
      wrong: 'what a clever idea.',
      tag: 'endmarks.mark_mismatch',
    },
    {
      itemId: 'se_transfer_where',
      correct: 'Where did the trail begin?',
      wrong: 'Where did the trail begin.',
      tag: 'endmarks.question_mark_missing',
    },
    {
      itemId: 'ac_insert_well_youre',
      correct: "We'll check that you're ready before we leave.",
      wrong: 'Well check that youre ready before we leave.',
      tag: 'apostrophe.contraction_missing',
    },
    {
      itemId: 'ac_transfer_dont_theyre',
      correct: "Don't worry because they're on the way.",
      wrong: 'Dont worry because theyre on the way.',
      tag: 'apostrophe.contraction_missing',
    },
    {
      itemId: 'cc_insert_after_supper',
      correct: 'After supper, we read quietly.',
      wrong: 'After supper we read quietly.',
      tag: 'comma.clarity_missing',
    },
    {
      itemId: 'cc_fix_if_lost',
      correct: 'If you get lost, ask a helper.',
      wrong: 'If you get lost ask a helper.',
      tag: 'comma.opening_clause_missing',
    },
    {
      itemId: 'cc_transfer_after_the_match',
      correct: 'After the match, the team shook hands.',
      wrong: 'After the match the team shook hands.',
      tag: 'comma.clarity_missing',
    },
    {
      itemId: 'sl_insert_helper_roles',
      correct: 'The helpers were Maya, register monitor; Leo, equipment monitor; and Aisha, line leader.',
      wrong: 'The helpers were Maya, register monitor, Leo, equipment monitor and Aisha, line leader.',
      tag: 'structure.semicolon_list_missing',
    },
    {
      itemId: 'sl_fix_stalls',
      correct: 'The stalls were crafts, table one; games, table two; and snacks, table three.',
      wrong: 'The stalls were crafts, table one, games, table two and snacks, table three.',
      tag: 'structure.semicolon_list_missing',
    },
    {
      itemId: 'sl_transfer_event_stalls',
      correct: 'The stalls were crafts, table one; games, table two; and snacks, table three.',
      wrong: 'The stalls were crafts, table one, games, table two and snacks, table three.',
      tag: 'structure.semicolon_list_missing',
    },
    {
      itemId: 'hy_insert_well_behaved',
      correct: 'The well-behaved puppy waited by the gate.',
      wrong: 'The well behaved puppy waited by the gate.',
      tag: 'boundary.hyphen_missing',
    },
    {
      itemId: 'hy_transfer_part_time_job',
      correct: 'My sister found a part-time job at the library.',
      wrong: 'My sister found a part time job at the library.',
      tag: 'boundary.hyphen_missing',
    },
    {
      itemId: 'dc_insert_alarm_rang',
      correct: 'The alarm rang - everyone lined up.',
      wrong: 'The alarm rang everyone lined up.',
      tag: 'boundary.dash_missing',
    },
    {
      itemId: 'dc_transfer_curtain_rose',
      correct: 'The curtain rose - the hall fell silent.',
      wrong: 'The curtain rose, the hall fell silent.',
      tag: 'boundary.dash_missing',
    },
  ];

  for (const { itemId, correct, wrong, tag } of cases) {
    const correctResult = markPunctuationAnswer({
      item: item(itemId),
      answer: { typed: correct },
    });
    assert.equal(correctResult.correct, true, `${itemId}: ${correct}`);

    const wrongResult = markPunctuationAnswer({
      item: item(itemId),
      answer: { typed: wrong },
    });
    assert.equal(wrongResult.correct, false, `${itemId}: ${wrong}`);
    assert.equal(wrongResult.misconceptionTags.includes(tag), true, `${itemId}: expected ${tag}`);
  }
});

test('P2 U3 transfer anchors reject target-only sentence fragments', () => {
  const cases = [
    {
      itemId: 'ac_transfer_dont_theyre',
      model: "Don't worry because they're on the way.",
      fragment: "Don't they're.",
    },
    {
      itemId: 'hy_transfer_part_time_job',
      model: 'My sister found a part-time job at the library.',
      fragment: 'Part-time job.',
    },
  ];

  for (const { itemId, model, fragment } of cases) {
    const modelResult = markPunctuationAnswer({
      item: item(itemId),
      answer: { typed: model },
    });
    assert.equal(modelResult.correct, true, `${itemId}: model answer should pass`);

    const fragmentResult = markPunctuationAnswer({
      item: item(itemId),
      answer: { typed: fragment },
    });
    assert.equal(fragmentResult.correct, false, `${itemId}: ${fragment}`);
    assert.equal(fragmentResult.misconceptionTags.includes('transfer.sentence_fragment'), true, `${itemId}: sentence fragment tag`);
    assert.equal(facet(fragmentResult, 'sentence_completeness')?.ok, false, `${itemId}: sentence completeness facet`);
  }
});

test('mixed transfer validators constrain fronted speech and colon-list stems', () => {
  const frontedSpeech = markPunctuationAnswer({
    item: item('sp_fa_transfer_at_last_speech'),
    answer: { typed: 'At last, Noah shouted, "We made it!"' },
  });
  assert.equal(frontedSpeech.correct, true);
  assert.equal(facet(frontedSpeech, 'comma_placement')?.ok, true);
  assert.equal(facet(frontedSpeech, 'speech_punctuation')?.ok, true);
  assert.equal(facet(frontedSpeech, 'single_sentence')?.ok, true);

  const missingFrontedComma = markPunctuationAnswer({
    item: item('sp_fa_transfer_at_last_speech'),
    answer: { typed: 'At last Noah shouted, "We made it!"' },
  });
  assert.equal(missingFrontedComma.correct, false);
  assert.equal(missingFrontedComma.misconceptionTags.includes('comma.fronted_adverbial_missing'), true);
  assert.equal(missingFrontedComma.misconceptionTags.includes('speech.reporting_comma_missing'), false);
  assert.equal(facet(missingFrontedComma, 'reporting_clause')?.ok, true);

  const invalidReportingClause = markPunctuationAnswer({
    item: item('sp_fa_transfer_at_last_speech'),
    answer: { typed: 'At last, blue green, "We made it!"' },
  });
  assert.equal(invalidReportingClause.correct, false);
  assert.equal(facet(invalidReportingClause, 'preservation')?.ok, false);
  assert.equal(facet(invalidReportingClause, 'reporting_clause')?.ok, false);

  const changedSpeechWords = markPunctuationAnswer({
    item: item('sp_fa_transfer_at_last_speech'),
    answer: { typed: 'At last, Noah shouted, "We missed it!"' },
  });
  assert.equal(changedSpeechWords.correct, false);
  assert.equal(changedSpeechWords.misconceptionTags.includes('speech.words_changed'), true);

  const missingReportingClause = markPunctuationAnswer({
    item: item('sp_fa_transfer_at_last_speech'),
    answer: { typed: 'At last, "We made it!"' },
  });
  assert.equal(missingReportingClause.correct, false);
  assert.equal(missingReportingClause.misconceptionTags.includes('speech.reporting_comma_missing'), true);

  const mixedColonList = markPunctuationAnswer({
    item: item('cl_lc_transfer_toolkit'),
    answer: { typed: 'Our toolkit contained three items: glue, card and scissors.' },
  });
  assert.equal(mixedColonList.correct, true);
  assert.equal(facet(mixedColonList, 'colon_boundary')?.ok, true);
  assert.equal(facet(mixedColonList, 'list_separators')?.ok, true);

  const changedStem = markPunctuationAnswer({
    item: item('cl_lc_transfer_toolkit'),
    answer: { typed: 'Our toolkit contained useful items: glue, card and scissors.' },
  });
  assert.equal(changedStem.correct, false);
  assert.equal(changedStem.misconceptionTags.includes('structure.list_words_changed'), true);

  const finalComma = markPunctuationAnswer({
    item: item('cl_lc_transfer_toolkit'),
    answer: { typed: 'Our toolkit contained three items: glue, card, and scissors.' },
  });
  assert.equal(finalComma.correct, true);
  assert.deepEqual(finalComma.misconceptionTags, []);

  const strictColonListItem = {
    ...item('cl_lc_transfer_toolkit'),
    validator: {
      ...item('cl_lc_transfer_toolkit').validator,
      allowFinalComma: false,
    },
  };
  const strictFinalComma = markPunctuationAnswer({
    item: strictColonListItem,
    answer: { typed: 'Our toolkit contained three items: glue, card, and scissors.' },
  });
  assert.equal(strictFinalComma.correct, false);
  assert.equal(strictFinalComma.misconceptionTags.includes('comma.unnecessary_final_comma'), true);
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
