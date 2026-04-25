import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clusterModeForCluster,
  createMemoryState,
  memorySnapshot,
  selectPunctuationItem,
  updateMemoryState,
} from '../shared/punctuation/scheduler.js';

const DAY_MS = 24 * 60 * 60 * 1000;

test('secure status requires repeated clean spaced evidence', () => {
  let state = createMemoryState();
  state = updateMemoryState(state, true, 0);
  assert.equal(memorySnapshot(state, 0).secure, false);
  state = updateMemoryState(state, true, 4 * DAY_MS);
  assert.equal(memorySnapshot(state, 4 * DAY_MS).secure, false);
  state = updateMemoryState(state, true, 8 * DAY_MS);
  const secure = memorySnapshot(state, 8 * DAY_MS);
  assert.equal(secure.secure, true);
  assert.equal(secure.bucket, 'secure');
  assert.ok(secure.accuracy >= 0.8);
  assert.ok(secure.correctSpanDays >= 7);
});

test('scheduler is deterministic under fixed state and random input', () => {
  const base = {
    progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [], sessionsCompleted: 0 },
    session: { answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'smart' },
    now: 1_800_000_000_000,
    random: () => 0,
  };
  const first = selectPunctuationItem(base);
  const second = selectPunctuationItem(base);
  assert.deepEqual(first.item, second.item);
  assert.equal(first.item.mode, 'choose');
});

test('weak mode prioritises weak skill-by-mode facets', () => {
  const weakFacet = updateMemoryState(createMemoryState(), false, 0);
  const result = selectPunctuationItem({
    progress: {
      items: {},
      facets: { 'speech::insert': weakFacet },
      rewardUnits: {},
      attempts: [],
      sessionsCompleted: 0,
    },
    session: { mode: 'weak', answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'weak' },
    now: 0,
    random: () => 0,
  });

  assert.equal(result.item.id, 'sp_insert_question');
  assert.equal(result.item.mode, 'insert');
  assert.equal(result.weakFocus.skillId, 'speech');
  assert.equal(result.weakFocus.bucket, 'weak');
  assert.equal(result.weakFocus.source, 'weak_facet');
});

test('weak mode avoids repeating a recent item when another weak alternative exists', () => {
  const weakFacet = updateMemoryState(createMemoryState(), false, 0);
  const result = selectPunctuationItem({
    progress: {
      items: {},
      facets: {
        'speech::insert': weakFacet,
        'speech::fix': weakFacet,
      },
      rewardUnits: {},
      attempts: [],
      sessionsCompleted: 0,
    },
    session: { mode: 'weak', answeredCount: 0, recentItemIds: ['sp_insert_question'] },
    prefs: { mode: 'weak' },
    now: 0,
    random: () => 0,
  });

  assert.equal(result.item.id, 'sp_fix_question');
  assert.equal(result.item.mode, 'fix');
  assert.equal(result.weakFocus.source, 'weak_facet');
});

test('weak mode falls back to mixed review when no weak evidence exists', () => {
  const result = selectPunctuationItem({
    progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [], sessionsCompleted: 0 },
    session: { mode: 'weak', answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'weak' },
    now: 0,
    random: () => 0,
  });

  assert.ok(result.item);
  assert.equal(result.weakFocus.source, 'fallback');
  assert.equal(result.weakFocus.bucket, 'new');
});

test('weak mode selects due skill-by-mode facets before fallback review', () => {
  let dueFacet = createMemoryState();
  dueFacet = updateMemoryState(dueFacet, true, 0);
  const result = selectPunctuationItem({
    progress: {
      items: {},
      facets: { 'speech::fix': dueFacet },
      rewardUnits: {},
      attempts: [],
      sessionsCompleted: 0,
    },
    session: { mode: 'weak', answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'weak' },
    now: 2 * DAY_MS,
    random: () => 0,
  });

  assert.equal(result.item.id, 'sp_fix_question');
  assert.equal(result.weakFocus.bucket, 'due');
  assert.equal(result.weakFocus.source, 'due_facet');
});

test('weak mode keeps expanded-manifest candidate scoring bounded', async () => {
  const { PUNCTUATION_CONTENT_MANIFEST, createPunctuationContentIndexes } = await import('../shared/punctuation/content.js');
  const extraItems = Array.from({ length: 500 }, (_, index) => ({
    id: `weak_extra_speech_${index}`,
    mode: 'choose',
    skillIds: ['speech'],
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
    prompt: 'Choose the best punctuated sentence.',
    options: ['A.', 'B.'],
    correctIndex: 0,
    explanation: 'Bounded fixture.',
    model: 'A.',
    misconceptionTags: ['speech.fixture'],
    readiness: ['retrieve_discriminate'],
    source: 'generated',
  }));
  const indexes = createPunctuationContentIndexes({
    ...PUNCTUATION_CONTENT_MANIFEST,
    items: [...PUNCTUATION_CONTENT_MANIFEST.items, ...extraItems],
  });
  const result = selectPunctuationItem({
    indexes,
    progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [], sessionsCompleted: 0 },
    session: { mode: 'weak', answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'weak' },
    now: 0,
    random: () => 0,
    candidateWindow: 24,
  });

  assert.equal(result.inspectedCount, 24);
  assert.ok(result.candidateCount > result.inspectedCount);
});

test('comma flow focus mode selects published comma cluster items only', () => {
  const result = selectPunctuationItem({
    progress: { items: {} },
    session: { answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'comma_flow' },
    now: 0,
    random: () => 0,
  });

  assert.equal(result.targetClusterId, 'comma_flow');
  assert.equal(result.item.clusterId, 'comma_flow');
  assert.equal(result.item.id, 'lc_choose_picnic');
  assert.equal(clusterModeForCluster('comma_flow'), 'comma_flow');
});

test('boundary focus mode selects published boundary cluster items only', () => {
  const result = selectPunctuationItem({
    progress: { items: {} },
    session: { answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'boundary' },
    now: 0,
    random: () => 0,
  });

  assert.equal(result.targetClusterId, 'boundary');
  assert.equal(result.item.clusterId, 'boundary');
  assert.equal(result.item.id, 'sc_choose_rain_pitch');
  assert.equal(clusterModeForCluster('boundary'), 'boundary');
});

test('structure focus mode selects published structure cluster items only', () => {
  const result = selectPunctuationItem({
    progress: { items: {} },
    session: { answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'structure' },
    now: 0,
    random: () => 0,
  });

  assert.equal(result.targetClusterId, 'structure');
  assert.equal(result.item.clusterId, 'structure');
  assert.equal(result.item.id, 'pa_choose_coach');
  assert.equal(clusterModeForCluster('structure'), 'structure');
});

test('scheduler keeps candidate windows bounded for expanded manifests', async () => {
  const { PUNCTUATION_CONTENT_MANIFEST, createPunctuationContentIndexes } = await import('../shared/punctuation/content.js');
  const extraItems = Array.from({ length: 500 }, (_, index) => ({
    id: `extra_speech_${index}`,
    mode: 'choose',
    skillIds: ['speech'],
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
    prompt: 'Choose the best punctuated sentence.',
    options: ['A.', 'B.'],
    correctIndex: 0,
    explanation: 'Bounded fixture.',
    model: 'A.',
    misconceptionTags: ['speech.fixture'],
    readiness: ['retrieve_discriminate'],
    source: 'generated',
  }));
  const indexes = createPunctuationContentIndexes({
    ...PUNCTUATION_CONTENT_MANIFEST,
    items: [...PUNCTUATION_CONTENT_MANIFEST.items, ...extraItems],
  });
  const result = selectPunctuationItem({
    indexes,
    progress: { items: {} },
    session: { answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'smart' },
    now: 0,
    random: () => 0.5,
    candidateWindow: 24,
  });
  assert.equal(result.inspectedCount, 24);
  assert.ok(result.candidateCount > result.inspectedCount);
});
