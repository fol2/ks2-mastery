import test from 'node:test';
import assert from 'node:assert/strict';

import { selectPunctuationItem } from '../shared/punctuation/scheduler.js';
import { PUNCTUATION_CONTENT_INDEXES } from '../shared/punctuation/content.js';
import { DEFAULT_PUNCTUATION_CONTENT_INDEXES } from '../shared/punctuation/service.js';

const CLUSTER_PRIMARY_SKILLS = Object.freeze({
  endmarks: Object.freeze(['sentence_endings']),
  apostrophe: Object.freeze(['apostrophe_contractions', 'apostrophe_possession']),
  speech: Object.freeze(['speech']),
  comma_flow: Object.freeze(['list_commas', 'fronted_adverbial', 'comma_clarity']),
  boundary: Object.freeze(['semicolon', 'dash_clause', 'hyphen']),
  structure: Object.freeze(['parenthesis', 'colon_list', 'semicolon_list', 'bullet_points']),
});

function modeCount(mode) {
  return (PUNCTUATION_CONTENT_INDEXES.itemsByMode.get(mode) || []).length;
}

test('P20 real scheduler inspects the full production choose candidate set by default', () => {
  const chooseCount = modeCount('choose');
  assert.ok(chooseCount > 32, 'P20 production content should exceed the old 32-item window');

  const selection = selectPunctuationItem({
    indexes: PUNCTUATION_CONTENT_INDEXES,
    progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [] },
    session: { mode: 'smart', answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'smart' },
    now: Date.UTC(2026, 4, 7),
    random: () => 0.999999,
  });

  assert.equal(selection.targetMode, 'choose');
  assert.equal(selection.candidateCount, chooseCount);
  assert.equal(selection.inspectedCount, chooseCount);
  assert.ok(selection.item, 'scheduler should select a published item');
});

test('P20 real scheduler still honours an explicit small candidate window for deterministic probes', () => {
  const selection = selectPunctuationItem({
    indexes: PUNCTUATION_CONTENT_INDEXES,
    progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [] },
    session: { mode: 'smart', answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'smart' },
    candidateWindow: 7,
    now: Date.UTC(2026, 4, 7),
    random: () => 0.999999,
  });

  assert.equal(selection.targetMode, 'choose');
  assert.equal(selection.inspectedCount, 7);
  assert.equal(selection.candidateCount, modeCount('choose'));
});

test('P20 runtime generated items keep each primary skill in the correct cluster', () => {
  const failures = DEFAULT_PUNCTUATION_CONTENT_INDEXES.items
    .filter((item) => item.source === 'generated' && item.generatorFamilyId?.startsWith('gen_p20_'))
    .filter((item) => !CLUSTER_PRIMARY_SKILLS[item.clusterId]?.includes(item.skillIds?.[0]))
    .map((item) => `${item.id}:${item.skillIds?.[0]}:${item.clusterId}`);

  assert.deepEqual(failures, []);
});

test('P20 real scheduler keeps focus-cluster starts inside the requested primary skill cluster', () => {
  for (const [clusterId, skillIds] of Object.entries(CLUSTER_PRIMARY_SKILLS)) {
    const samples = [0, 0.25, 0.5, 0.75, 0.999999];
    for (const randomValue of samples) {
      const selection = selectPunctuationItem({
        indexes: DEFAULT_PUNCTUATION_CONTENT_INDEXES,
        progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [] },
        session: { mode: clusterId, answeredCount: 0, recentItemIds: [] },
        prefs: { mode: clusterId },
        now: Date.UTC(2026, 4, 7),
        random: () => randomValue,
      });

      assert.equal(selection.targetClusterId, clusterId);
      assert.ok(selection.item, `scheduler should select an item for ${clusterId}`);
      assert.ok(
        skillIds.includes(selection.item.skillIds?.[0]),
        `${clusterId} selected ${selection.item.id} with primary skill ${selection.item.skillIds?.[0]}`,
      );
    }
  }
});
