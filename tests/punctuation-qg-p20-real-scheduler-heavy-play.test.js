import test from 'node:test';
import assert from 'node:assert/strict';

import { selectPunctuationItem } from '../shared/punctuation/scheduler.js';
import { PUNCTUATION_CONTENT_INDEXES } from '../shared/punctuation/content.js';
import { createPunctuationService, DEFAULT_PUNCTUATION_CONTENT_INDEXES } from '../shared/punctuation/service.js';
import { REASON_TAGS } from '../shared/punctuation/scheduler-manifest.js';

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

function seededRandom(seed = 20260507) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function answerFor(item) {
  if (item?.inputKind === 'choice') {
    const option = Array.isArray(item.options)
      ? item.options.find((entry) => entry.text === item.model) || item.options[0]
      : null;
    return { choiceIndex: option?.index ?? 0 };
  }
  return { typed: item?.model || '' };
}

test('P20 Smart real-service scheduler surfaces the expanded pool over heavy play', () => {
  let nowMs = Date.UTC(2026, 4, 7, 9, 0, 0);
  const service = createPunctuationService({
    now: () => {
      nowMs += 60_000;
      return nowMs;
    },
    random: seededRandom(),
  });

  const learnerId = 'learner-p20-real-scheduler-heavy-play';
  const exposures = [];
  const sessionSummaries = [];
  let previousItemIdAcrossProbe = '';
  let immediateRepeatsAcrossProbe = 0;

  for (let sessionIndex = 0; sessionIndex < 50; sessionIndex += 1) {
    let state = service.startSession(learnerId, { mode: 'smart', roundLength: '6' }).state;
    const idsThisSession = new Set();
    const signaturesThisSession = new Set();
    const modesThisSession = new Set();
    let previousItemId = '';
    let immediateRepeats = 0;

    while (state.phase === 'active-item') {
      const item = state.session.currentItem;
      assert.ok(item?.id, 'active session must expose a current item id');
      const signature = item.variantSignature || item.id;
      if (previousItemId && previousItemId === item.id) immediateRepeats += 1;
      if (previousItemIdAcrossProbe && previousItemIdAcrossProbe === item.id) immediateRepeatsAcrossProbe += 1;
      idsThisSession.add(item.id);
      signaturesThisSession.add(signature);
      modesThisSession.add(item.mode || '');
      exposures.push({ id: item.id, signature, mode: item.mode || '' });
      previousItemId = item.id;
      previousItemIdAcrossProbe = item.id;

      state = service.submitAnswer(learnerId, state, answerFor(item)).state;
      if (state.phase === 'feedback') {
        state = service.continueSession(learnerId, state).state;
      }
    }

    sessionSummaries.push({
      duplicateItems: idsThisSession.size !== 6,
      duplicateSignatures: signaturesThisSession.size !== 6,
      modes: modesThisSession.size,
      immediateRepeats,
    });
    assert.equal(state.phase, 'summary');
  }

  const uniqueItems = new Set(exposures.map((entry) => entry.id));
  const uniqueSignatures = new Set(exposures.map((entry) => entry.signature));

  assert.equal(exposures.length, 300);
  assert.ok(uniqueItems.size >= 220, `expected at least 220 unique items, got ${uniqueItems.size}`);
  assert.ok(uniqueSignatures.size >= 220, `expected at least 220 unique signatures, got ${uniqueSignatures.size}`);
  assert.equal(immediateRepeatsAcrossProbe, 0);
  assert.equal(sessionSummaries.reduce((sum, row) => sum + row.immediateRepeats, 0), 0);
  assert.equal(sessionSummaries.filter((row) => row.duplicateItems).length, 0);
  assert.equal(sessionSummaries.filter((row) => row.duplicateSignatures).length, 0);
  assert.equal(sessionSummaries.filter((row) => row.modes < 4).length, 0);
});

test('P20 real scheduler inspects a 128-item production choose candidate window by default', () => {
  const chooseCount = modeCount('choose');
  assert.ok(chooseCount > 128, 'P20 production content should exceed the default 128-item window');

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
  assert.equal(selection.inspectedCount, 128);
  assert.ok(selection.item, 'scheduler should select a published item');
});

test('P20 real scheduler avoids recent items and signatures across a 100-attempt window', () => {
  const items = [
    {
      id: 'recent_item_candidate',
      mode: 'choose',
      skillIds: ['sentence_endings'],
      clusterId: 'endmarks',
      rewardUnitId: 'sentence-endings-core',
      prompt: 'Choose the correctly punctuated sentence.',
      options: [{ text: 'A.', index: 0 }, { text: 'B.', index: 1 }],
      correctIndex: 0,
      model: 'A.',
      source: 'generated',
      variantSignature: 'sig_recent_item',
    },
    {
      id: 'recent_signature_candidate',
      mode: 'choose',
      skillIds: ['sentence_endings'],
      clusterId: 'endmarks',
      rewardUnitId: 'sentence-endings-core',
      prompt: 'Choose the correctly punctuated sentence.',
      options: [{ text: 'A.', index: 0 }, { text: 'B.', index: 1 }],
      correctIndex: 0,
      model: 'A.',
      source: 'generated',
      variantSignature: 'sig_recent_signature',
    },
    {
      id: 'fresh_candidate',
      mode: 'choose',
      skillIds: ['sentence_endings'],
      clusterId: 'endmarks',
      rewardUnitId: 'sentence-endings-core',
      prompt: 'Choose the correctly punctuated sentence.',
      options: [{ text: 'A.', index: 0 }, { text: 'B.', index: 1 }],
      correctIndex: 0,
      model: 'A.',
      source: 'generated',
      variantSignature: 'sig_fresh',
    },
  ];

  const result = selectPunctuationItem({
    indexes: {
      items,
      itemById: new Map(items.map((item) => [item.id, item])),
      itemsByMode: new Map([['choose', items]]),
      skillById: new Map([['sentence_endings', { id: 'sentence_endings', name: 'Sentence endings', published: true }]]),
    },
    progress: {
      items: {},
      facets: {},
      rewardUnits: {},
      attempts: [
        ...Array.from({ length: 98 }, (_, index) => ({
          itemId: `filler_${index}`,
          variantSignature: `sig_filler_${index}`,
          mode: 'choose',
          itemMode: 'choose',
          correct: true,
        })),
        {
          itemId: 'historical_item_with_same_signature',
          variantSignature: 'sig_recent_signature',
          mode: 'choose',
          itemMode: 'choose',
          correct: true,
        },
      ],
      sessionsCompleted: 1,
    },
    session: { mode: 'smart', answeredCount: 0, recentItemIds: ['recent_item_candidate'] },
    prefs: { mode: 'smart' },
    now: Date.UTC(2026, 4, 7),
    random: () => 0,
  });

  assert.equal(result.item.id, 'fresh_candidate');
});

test('P20 real scheduler blocks a same-item repeat after one exposure in the last 100 attempts', () => {
  const repeatedItem = {
    id: 'same_item_candidate',
    mode: 'choose',
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    prompt: 'Choose the correctly punctuated sentence.',
    options: [{ text: 'A.', index: 0 }, { text: 'B.', index: 1 }],
    correctIndex: 0,
    model: 'A.',
    source: 'generated',
    variantSignature: 'sig_same_item',
  };
  const freshItem = { ...repeatedItem, id: 'same_item_fresh_candidate', variantSignature: 'sig_same_item_fresh' };
  const items = [repeatedItem, freshItem];

  const result = selectPunctuationItem({
    indexes: {
      items,
      itemById: new Map(items.map((item) => [item.id, item])),
      itemsByMode: new Map([['choose', items]]),
      skillById: new Map([['sentence_endings', { id: 'sentence_endings', name: 'Sentence endings', published: true }]]),
    },
    progress: {
      items: {},
      facets: {},
      rewardUnits: {},
      attempts: [
        {
          itemId: repeatedItem.id,
          variantSignature: repeatedItem.variantSignature,
          mode: 'choose',
          itemMode: 'choose',
          correct: true,
        },
      ],
      sessionsCompleted: 1,
    },
    session: { mode: 'smart', answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'smart' },
    now: Date.UTC(2026, 4, 7),
    random: () => 0,
  });

  assert.equal(result.item.id, freshItem.id);
});

test('P20 misconception retry can bypass the per-session signature block', () => {
  const missed = {
    id: 'missed_retry_seed',
    mode: 'choose',
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    prompt: 'Choose the correctly punctuated sentence.',
    options: [{ text: 'A.', index: 0 }, { text: 'B.', index: 1 }],
    correctIndex: 0,
    model: 'A.',
    source: 'generated',
    variantSignature: 'sig_missed_retry_seed',
    misconceptionTags: ['endmarks.fixture_retry'],
  };
  const retry = {
    ...missed,
    id: 'selected_signature_retry_candidate',
    variantSignature: 'sig_selected_retry_candidate',
  };
  const items = [missed, retry];

  const result = selectPunctuationItem({
    indexes: {
      items,
      itemById: new Map(items.map((item) => [item.id, item])),
      itemsByMode: new Map([['choose', items]]),
      itemsBySkill: new Map([['sentence_endings', items]]),
      itemsByRewardUnit: new Map([['sentence-endings-core', items]]),
      skillById: new Map([['sentence_endings', { id: 'sentence_endings', name: 'Sentence endings', published: true }]]),
    },
    progress: {
      items: {},
      facets: {},
      rewardUnits: {},
      attempts: [
        {
          itemId: missed.id,
          variantSignature: missed.variantSignature,
          mode: 'choose',
          itemMode: 'choose',
          skillIds: missed.skillIds,
          rewardUnitId: missed.rewardUnitId,
          misconceptionTags: missed.misconceptionTags,
          correct: false,
        },
      ],
      sessionsCompleted: 1,
    },
    session: {
      mode: 'smart',
      answeredCount: 1,
      recentItemIds: [],
      selectedSignatures: [retry.variantSignature],
    },
    prefs: { mode: 'smart' },
    now: Date.UTC(2026, 4, 7),
    random: () => 0,
  });

  assert.equal(result.reason, REASON_TAGS.MISCONCEPTION_RETRY);
  assert.equal(result.item.id, retry.id);
});

test('P20 mixed-review reason can be derived from progress history at the start of a new session', () => {
  const items = [
    {
      id: 'choose_mixed_fixture',
      mode: 'choose',
      skillIds: ['sentence_endings'],
      clusterId: 'endmarks',
      rewardUnitId: 'sentence-endings-core',
      prompt: 'Choose the correctly punctuated sentence.',
      options: [{ text: 'A.', index: 0 }, { text: 'B.', index: 1 }],
      correctIndex: 0,
      model: 'A.',
      source: 'generated',
      variantSignature: 'sig_mixed_choose_fixture',
    },
  ];

  const result = selectPunctuationItem({
    indexes: {
      items,
      itemById: new Map(items.map((item) => [item.id, item])),
      itemsByMode: new Map([['choose', items]]),
      skillById: new Map([['sentence_endings', { id: 'sentence_endings', name: 'Sentence endings', published: true }]]),
    },
    progress: {
      items: {},
      facets: {},
      rewardUnits: {},
      attempts: [
        { itemId: 'old_transfer_1', mode: 'transfer', itemMode: 'transfer', correct: true },
        { itemId: 'old_transfer_2', mode: 'transfer', itemMode: 'transfer', correct: true },
        { itemId: 'old_transfer_3', mode: 'transfer', itemMode: 'transfer', correct: true },
      ],
      sessionsCompleted: 4,
    },
    session: { mode: 'smart', answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'smart' },
    now: Date.UTC(2026, 4, 7),
    random: () => 0,
  });

  assert.equal(result.item.id, 'choose_mixed_fixture');
  assert.equal(result.reason, REASON_TAGS.MIXED_REVIEW);
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
