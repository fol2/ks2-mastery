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

test('punctuation manifest publishes fixed combine items as score-bearing practice', () => {
  const combineIds = PUNCTUATION_CONTENT_INDEXES.itemsByMode.get('combine').map((entry) => entry.id);

  assert.deepEqual(combineIds, [
    'lc_combine_trip_list',
    'fa_combine_after_storm',
    'sc_combine_rain_pitch',
    'dc_combine_flooded_route',
    'pa_combine_lighthouse',
    'cl_combine_awards',
  ]);
  assert.equal(combineIds.every((id) => item(id).inputKind !== 'choice'), true);
  assert.equal(PUNCTUATION_CONTENT_INDEXES.rewardUnitById.get('semicolons-core').evidenceItemIds.includes('sc_combine_rain_pitch'), true);
});

test('combine validators cover list commas, fronted adverbials, and colon lists', () => {
  const list = markPunctuationAnswer({
    item: item('lc_combine_trip_list'),
    answer: { typed: 'We packed torches, maps and water.' },
  });
  assert.equal(list.correct, true);

  const finalComma = markPunctuationAnswer({
    item: item('lc_combine_trip_list'),
    answer: { typed: 'We packed torches, maps, and water.' },
  });
  assert.equal(finalComma.correct, false);
  assert.equal(finalComma.misconceptionTags.includes('comma.unnecessary_final_comma'), true);

  const fronted = markPunctuationAnswer({
    item: item('fa_combine_after_storm'),
    answer: { typed: 'After the storm, the playground gleamed.' },
  });
  assert.equal(fronted.correct, true);

  const missingFrontedComma = markPunctuationAnswer({
    item: item('fa_combine_after_storm'),
    answer: { typed: 'After the storm the playground gleamed.' },
  });
  assert.equal(missingFrontedComma.correct, false);
  assert.equal(missingFrontedComma.misconceptionTags.includes('comma.fronted_adverbial_missing'), true);

  const colon = markPunctuationAnswer({
    item: item('cl_combine_awards'),
    answer: { typed: 'The team won three awards: player of the match, best defence and fair play.' },
  });
  assert.equal(colon.correct, true);

  const commaBeforeList = markPunctuationAnswer({
    item: item('cl_combine_awards'),
    answer: { typed: 'The team won three awards, player of the match, best defence and fair play.' },
  });
  assert.equal(commaBeforeList.correct, false);
  assert.equal(commaBeforeList.misconceptionTags.includes('structure.colon_missing'), true);
});

test('semi-colon combine accepts preserved clauses and rejects comma splices', () => {
  const semicolon = markPunctuationAnswer({
    item: item('sc_combine_rain_pitch'),
    answer: { typed: 'The rain had stopped; the pitch was still slippery.' },
  });
  assert.equal(semicolon.correct, true);
  assert.equal(semicolon.facets.find((facet) => facet.id === 'single_sentence')?.ok, true);

  const commaSplice = markPunctuationAnswer({
    item: item('sc_combine_rain_pitch'),
    answer: { typed: 'The rain had stopped, the pitch was still slippery.' },
  });
  assert.equal(commaSplice.correct, false);
  assert.equal(commaSplice.misconceptionTags.includes('boundary.comma_splice'), true);

  const extraSentence = markPunctuationAnswer({
    item: item('sc_combine_rain_pitch'),
    answer: { typed: 'The rain had stopped; the pitch was still slippery. We played anyway.' },
  });
  assert.equal(extraSentence.correct, false);
  assert.equal(extraSentence.misconceptionTags.includes('combine.extra_sentence'), true);
});

test('dash combine requires a spaced dash between preserved clauses', () => {
  const dash = markPunctuationAnswer({
    item: item('dc_combine_flooded_route'),
    answer: { typed: 'The path was flooded - we took the longer route.' },
  });
  assert.equal(dash.correct, true);

  const unpunctuated = markPunctuationAnswer({
    item: item('dc_combine_flooded_route'),
    answer: { typed: 'The path was flooded we took the longer route.' },
  });
  assert.equal(unpunctuated.correct, false);
  assert.equal(unpunctuated.misconceptionTags.includes('boundary.dash_missing'), true);

  const unspaced = markPunctuationAnswer({
    item: item('dc_combine_flooded_route'),
    answer: { typed: 'The path was flooded-we took the longer route.' },
  });
  assert.equal(unspaced.correct, false);
  assert.equal(unspaced.misconceptionTags.includes('boundary.dash_missing'), true);
});

test('parenthesis combine accepts matched commas, brackets, and dashes only in the target position', () => {
  for (const typed of [
    'The lighthouse, a useful lookout, guided the boats.',
    'The lighthouse (a useful lookout) guided the boats.',
    'The lighthouse - a useful lookout - guided the boats.',
  ]) {
    const result = markPunctuationAnswer({
      item: item('pa_combine_lighthouse'),
      answer: { typed },
    });
    assert.equal(result.correct, true, typed);
  }

  const unbalanced = markPunctuationAnswer({
    item: item('pa_combine_lighthouse'),
    answer: { typed: 'The lighthouse, a useful lookout guided the boats.' },
  });
  assert.equal(unbalanced.correct, false);
  assert.equal(unbalanced.misconceptionTags.includes('structure.parenthesis_unbalanced'), true);

  const misplaced = markPunctuationAnswer({
    item: item('pa_combine_lighthouse'),
    answer: { typed: 'The lighthouse guided, a useful lookout, the boats.' },
  });
  assert.equal(misplaced.correct, false);
  assert.equal(misplaced.misconceptionTags.includes('structure.words_changed'), true);
});

test('combine validators require the model terminal mark', () => {
  for (const id of [
    'lc_combine_trip_list',
    'fa_combine_after_storm',
    'sc_combine_rain_pitch',
    'dc_combine_flooded_route',
    'pa_combine_lighthouse',
    'cl_combine_awards',
  ]) {
    for (const terminal of ['?', '!']) {
      const result = markPunctuationAnswer({
        item: item(id),
        answer: { typed: item(id).model.replace(/[.?!]$/, terminal) },
      });
      assert.equal(result.correct, false, `${id} accepted ${terminal}`);
      assert.equal(result.facets.find((facet) => facet.id === 'terminal_punctuation')?.ok, false, id);
    }
  }
});

test('generated combine items are deterministic and model answers are markable', () => {
  const first = createPunctuationGeneratedItems({ seed: 'combine-seed', perFamily: 1 })
    .filter((entry) => entry.mode === 'combine');
  const second = createPunctuationGeneratedItems({ seed: 'combine-seed', perFamily: 1 })
    .filter((entry) => entry.mode === 'combine');

  assert.deepEqual(second, first);
  assert.deepEqual(first.map((entry) => entry.generatorFamilyId), [
    'gen_list_commas_combine',
    'gen_fronted_adverbial_combine',
    'gen_semicolon_combine',
    'gen_dash_clause_combine',
    'gen_parenthesis_combine',
    'gen_colon_list_combine',
  ]);
  for (const generated of first) {
    assert.equal(markPunctuationAnswer({ item: generated, answer: { typed: generated.model } }).correct, true, generated.id);
  }
});

test('smart, weak, and focused scheduling can select combine at controlled frequency', () => {
  const smart = selectPunctuationItem({
    progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [], sessionsCompleted: 0 },
    session: { answeredCount: 4, recentItemIds: [] },
    prefs: { mode: 'smart' },
    now: 0,
    random: () => 0,
  });
  assert.equal(smart.targetMode, 'combine');
  assert.equal(smart.item.mode, 'combine');

  const boundary = selectPunctuationItem({
    progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [], sessionsCompleted: 0 },
    session: { answeredCount: 4, recentItemIds: [] },
    prefs: { mode: 'boundary' },
    now: 0,
    random: () => 0,
  });
  assert.equal(boundary.targetMode, 'combine');
  assert.equal(boundary.item.id, 'sc_combine_rain_pitch');

  const speechFallback = selectPunctuationItem({
    progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [], sessionsCompleted: 0 },
    session: { answeredCount: 4, recentItemIds: [] },
    prefs: { mode: 'speech' },
    now: 0,
    random: () => 0,
  });
  assert.equal(speechFallback.targetMode, 'choose');
  assert.equal(speechFallback.item.clusterId, 'speech');

  const weakFacet = updateMemoryState(createMemoryState(), false, 0);
  const weak = selectPunctuationItem({
    progress: {
      items: {},
      facets: { 'semicolon::combine': weakFacet },
      rewardUnits: {},
      attempts: [],
      sessionsCompleted: 0,
    },
    session: { mode: 'weak', answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'weak' },
    now: 0,
    random: () => 0,
  });
  assert.equal(weak.item.id, 'sc_combine_rain_pitch');
  assert.equal(weak.weakFocus.mode, 'combine');
});

test('combine attempts update item memory and skill-by-mode facets', () => {
  const repository = makeRepository({
    prefs: { mode: 'boundary', roundLength: '1' },
    progress: {
      items: {},
      facets: { 'semicolon::combine': updateMemoryState(createMemoryState(), false, 0) },
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
  assert.equal(start.session.currentItem.id, 'sc_combine_rain_pitch');
  service.submitAnswer('learner-a', start, { typed: 'The rain had stopped; the pitch was still slippery.' });

  const data = repository.snapshot();
  assert.equal(data.progress.attempts.at(-1).mode, 'combine');
  assert.equal(data.progress.attempts.at(-1).sessionMode, 'weak');
  assert.equal(data.progress.facets['semicolon::combine'].correct, 1);
});
