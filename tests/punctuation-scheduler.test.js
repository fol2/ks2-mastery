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
