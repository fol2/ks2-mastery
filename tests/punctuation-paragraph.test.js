import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPunctuationContentIndexes,
  PUNCTUATION_CONTENT_INDEXES,
  PUNCTUATION_CONTENT_MANIFEST,
} from '../shared/punctuation/content.js';
import {
  createPunctuationGeneratedItems,
  createPunctuationRuntimeManifest,
} from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';
import { createMemoryState, selectPunctuationItem, updateMemoryState } from '../shared/punctuation/scheduler.js';
import { createPunctuationService } from '../shared/punctuation/service.js';

function item(id) {
  return PUNCTUATION_CONTENT_INDEXES.itemById.get(id);
}

function facet(result, id) {
  return result.facets.find((entry) => entry.id === id);
}

function makeRepository(initialData = null) {
  let data = initialData;
  return {
    readData() {
      return data;
    },
    writeData(_learnerId, nextData) {
      data = JSON.parse(JSON.stringify(nextData));
      return data;
    },
    syncPracticeSession() {
      return null;
    },
    snapshot() {
      return data;
    },
  };
}

test('punctuation manifest publishes paragraph repair items as score-bearing text practice', () => {
  const paragraphIds = PUNCTUATION_CONTENT_INDEXES.itemsByMode.get('paragraph').map((entry) => entry.id);

  assert.deepEqual(paragraphIds, [
    'pg_fronted_speech',
    'pg_parenthesis_speech',
    'pg_colon_semicolon',
    'pg_bullet_consistency',
    'pg_apostrophe_mix',
  ]);
  assert.equal(PUNCTUATION_CONTENT_INDEXES.rewardUnitById.get('speech-core').evidenceItemIds.includes('pg_fronted_speech'), true);
  assert.equal(PUNCTUATION_CONTENT_INDEXES.rewardUnitById.get('semicolons-core').evidenceItemIds.includes('pg_colon_semicolon'), true);
});

test('paragraph marking accepts fully repaired passages and isolates failed speech facets', () => {
  const correct = markPunctuationAnswer({
    item: item('pg_fronted_speech'),
    answer: { typed: 'After lunch, Mia asked, "Can we start now?"' },
  });
  assert.equal(correct.correct, true);
  assert.equal(facet(correct, 'comma_placement')?.ok, true);
  assert.equal(facet(correct, 'speech_punctuation')?.ok, true);

  const speechWrong = markPunctuationAnswer({
    item: item('pg_fronted_speech'),
    answer: { typed: 'After lunch, Mia asked can we start now?' },
  });
  assert.equal(speechWrong.correct, false);
  assert.equal(facet(speechWrong, 'comma_placement')?.ok, true);
  assert.equal(facet(speechWrong, 'quote_variant')?.ok, false);
  assert.equal(speechWrong.misconceptionTags.includes('speech.quote_missing'), true);
});

test('paragraph marking rejects partial colon, semi-colon, and apostrophe repairs', () => {
  const commaSplice = markPunctuationAnswer({
    item: item('pg_colon_semicolon'),
    answer: {
      typed: 'The kit included three tools: a torch, a rope and a map. The weather changed, the team packed quickly.',
    },
  });
  assert.equal(commaSplice.correct, false);
  assert.equal(facet(commaSplice, 'colon_boundary')?.ok, true);
  assert.equal(facet(commaSplice, 'boundary_mark')?.ok, false);
  assert.equal(commaSplice.misconceptionTags.includes('boundary.comma_splice'), true);

  const apostropheWrong = markPunctuationAnswer({
    item: item('pg_apostrophe_mix'),
    answer: { typed: "We can't find the childrens coats. The girls bags are in the hall." },
  });
  assert.equal(apostropheWrong.correct, false);
  assert.equal(facet(apostropheWrong, 'apostrophe_forms')?.ok, false);
  assert.equal(apostropheWrong.misconceptionTags.includes('apostrophe.unrepaired_forms'), true);
});

test('paragraph marking rejects incomplete passages, token soup, and extra sentences', () => {
  const missingReportingClause = markPunctuationAnswer({
    item: item('pg_fronted_speech'),
    answer: { typed: 'After lunch, "Can we start now?"' },
  });
  assert.equal(missingReportingClause.correct, false);
  assert.equal(facet(missingReportingClause, 'preservation')?.ok, false);
  assert.equal(missingReportingClause.misconceptionTags.includes('paragraph.words_changed'), true);

  const apostropheTokenSoup = markPunctuationAnswer({
    item: item('pg_apostrophe_mix'),
    answer: { typed: "can't children's girls' bags" },
  });
  assert.equal(apostropheTokenSoup.correct, false);
  assert.equal(facet(apostropheTokenSoup, 'apostrophe_forms')?.ok, true);
  assert.equal(facet(apostropheTokenSoup, 'preservation')?.ok, false);

  const extraSentence = markPunctuationAnswer({
    item: item('pg_colon_semicolon'),
    answer: {
      typed: `${item('pg_colon_semicolon').model} Extra unrelated sentence.`,
    },
  });
  assert.equal(extraSentence.correct, false);
  assert.equal(facet(extraSentence, 'colon_boundary')?.ok, true);
  assert.equal(facet(extraSentence, 'boundary_mark')?.ok, true);
  assert.equal(facet(extraSentence, 'preservation')?.ok, false);
});

test('paragraph bullet repair preserves line breaks and rejects inline or mixed punctuation', () => {
  for (const typed of [
    'Bring:\r\n- a drink\r\n- a hat\r\n- a sketchbook',
    'Bring:\n- a drink.\n- a hat.\n- a sketchbook.',
  ]) {
    const result = markPunctuationAnswer({
      item: item('pg_bullet_consistency'),
      answer: { typed },
    });
    assert.equal(result.correct, true, typed);
  }

  const inline = markPunctuationAnswer({
    item: item('pg_bullet_consistency'),
    answer: { typed: 'Bring: - a drink - a hat - a sketchbook' },
  });
  assert.equal(inline.correct, false);
  assert.equal(facet(inline, 'bullet_markers')?.ok, false);

  const mixed = markPunctuationAnswer({
    item: item('pg_bullet_consistency'),
    answer: { typed: 'Bring:\n- a drink.\n- a hat\n- a sketchbook.' },
  });
  assert.equal(mixed.correct, false);
  assert.equal(mixed.misconceptionTags.includes('structure.bullet_punctuation_inconsistent'), true);
});

test('generated paragraph items are deterministic, multi-skill aware, and markable', () => {
  const first = createPunctuationGeneratedItems({ seed: 'paragraph-seed', perFamily: 1 })
    .filter((entry) => entry.mode === 'paragraph');
  const second = createPunctuationGeneratedItems({ seed: 'paragraph-seed', perFamily: 1 })
    .filter((entry) => entry.mode === 'paragraph');

  assert.deepEqual(second, first);
  assert.deepEqual(first.map((entry) => entry.generatorFamilyId), [
    'gen_apostrophe_mix_paragraph',
    'gen_fronted_speech_paragraph',
    'gen_colon_semicolon_paragraph',
    'gen_parenthesis_speech_paragraph',
    'gen_bullet_points_paragraph',
  ]);
  assert.equal(first.some((entry) => entry.skillIds.length > 1), true);
  for (const generated of first) {
    assert.equal(markPunctuationAnswer({ item: generated, answer: { typed: generated.model } }).correct, true, generated.id);
  }
});

test('smart, weak, and focused scheduling can select paragraph repair at controlled frequency', () => {
  const smart = selectPunctuationItem({
    progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [], sessionsCompleted: 0 },
    session: { answeredCount: 5, recentItemIds: [] },
    prefs: { mode: 'smart' },
    now: 0,
    random: () => 0,
  });
  assert.equal(smart.targetMode, 'paragraph');
  assert.equal(smart.item.id, 'pg_fronted_speech');

  const boundary = selectPunctuationItem({
    progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [], sessionsCompleted: 0 },
    session: { answeredCount: 5, recentItemIds: [] },
    prefs: { mode: 'boundary' },
    now: 0,
    random: () => 0,
  });
  assert.equal(boundary.targetMode, 'paragraph');
  assert.equal(boundary.item.id, 'pg_colon_semicolon');

  const weakFacet = updateMemoryState(createMemoryState(), false, 0);
  const weak = selectPunctuationItem({
    progress: {
      items: {},
      facets: { 'speech::paragraph': weakFacet },
      rewardUnits: {},
      attempts: [],
      sessionsCompleted: 0,
    },
    session: { mode: 'weak', answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'weak' },
    now: 0,
    random: () => 0,
  });
  assert.equal(weak.item.id, 'pg_fronted_speech');
  assert.equal(weak.weakFocus.mode, 'paragraph');
});

test('focused scheduling avoids immediately repeating the only paragraph item', () => {
  const result = selectPunctuationItem({
    progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [], sessionsCompleted: 0 },
    session: {
      answeredCount: 5,
      currentItemId: 'pg_fronted_speech',
      recentItemIds: [
        'sp_choose_reporting_comma',
        'sp_insert_question',
        'sp_fix_question',
        'sp_transfer_question',
        'pg_fronted_speech',
      ],
    },
    prefs: { mode: 'speech' },
    now: 0,
    random: () => 0,
  });

  assert.equal(result.targetMode, 'choose');
  assert.notEqual(result.item.id, 'pg_fronted_speech');
  assert.equal(result.item.clusterId, 'speech');
});

test('focused scheduling avoids back-to-back paragraph mode in the runtime manifest', () => {
  const indexes = createPunctuationContentIndexes(createPunctuationRuntimeManifest({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    seed: 'paragraph-runtime-focus',
    generatedPerFamily: 1,
  }));
  const result = selectPunctuationItem({
    indexes,
    progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [], sessionsCompleted: 0 },
    session: {
      answeredCount: 5,
      currentItemId: 'pg_fronted_speech',
      recentItemIds: [
        'sp_choose_reporting_comma',
        'sp_insert_question',
        'sp_fix_question',
        'sp_transfer_question',
        'pg_fronted_speech',
      ],
    },
    prefs: { mode: 'speech' },
    now: 0,
    random: () => 0.99,
    candidateWindow: 32,
  });

  assert.equal(result.targetMode, 'choose');
  assert.notEqual(result.item.mode, 'paragraph');
  assert.equal(result.item.clusterId, 'speech');
});

test('paragraph attempts update every included skill-by-mode facet', () => {
  const repository = makeRepository({
    prefs: { mode: 'weak', roundLength: '1' },
    progress: {
      items: {},
      facets: { 'speech::paragraph': updateMemoryState(createMemoryState(), false, 0) },
      rewardUnits: {},
      attempts: [],
      sessionsCompleted: 0,
    },
  });
  const service = createPunctuationService({
    repository,
    now: () => 0,
    random: () => 0,
    manifest: createPunctuationRuntimeManifest({ manifest: PUNCTUATION_CONTENT_MANIFEST, generatedPerFamily: 0 }),
    indexes: createPunctuationContentIndexes(PUNCTUATION_CONTENT_MANIFEST),
  });

  const start = service.startSession('learner-a', { mode: 'weak', roundLength: '1' }).state;
  assert.equal(start.session.currentItem.id, 'pg_fronted_speech');
  service.submitAnswer('learner-a', start, { typed: 'After lunch, Mia asked, "Can we start now?"' });

  const data = repository.snapshot();
  assert.equal(data.progress.attempts.at(-1).mode, 'paragraph');
  assert.equal(data.progress.facets['speech::paragraph'].correct, 1);
  assert.equal(data.progress.facets['fronted_adverbial::paragraph'].correct, 1);
});
