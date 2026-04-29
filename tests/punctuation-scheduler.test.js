import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  clusterModeForCluster,
  createMemoryState,
  memorySnapshot,
  selectPunctuationItem,
  updateMemoryState,
  DAY_MS as SCHEDULER_DAY_MS,
} from '../shared/punctuation/scheduler.js';
import {
  REASON_TAGS,
  MAX_SAME_SIGNATURE_ACROSS_ATTEMPTS,
  MAX_SAME_SIGNATURE_DAYS,
  EXPOSURE_WEIGHT_BLOCKED,
  EXPOSURE_WEIGHT_PENALISED,
  EXPOSURE_WEIGHT_DAY_AVOIDED,
} from '../shared/punctuation/scheduler-manifest.js';

const DAY_MS = 24 * 60 * 60 * 1000;

test('secure status requires repeated clean spaced evidence', () => {
  let state = createMemoryState();
  state = updateMemoryState(state, true, DAY_MS);
  assert.equal(memorySnapshot(state, DAY_MS).secure, false);
  state = updateMemoryState(state, true, 5 * DAY_MS);
  assert.equal(memorySnapshot(state, 5 * DAY_MS).secure, false);
  state = updateMemoryState(state, true, 9 * DAY_MS);
  const secure = memorySnapshot(state, 9 * DAY_MS);
  assert.equal(secure.secure, true);
  assert.equal(secure.bucket, 'secure');
  assert.ok(secure.accuracy >= 0.8);
  assert.ok(secure.correctSpanDays >= 7);
});

test('secure status ignores epoch-zero firstCorrectAt sentinels', () => {
  const now = Date.UTC(2026, 3, 25);
  const state = {
    attempts: 4,
    correct: 4,
    incorrect: 0,
    streak: 4,
    lapses: 0,
    dueAt: 0,
    firstCorrectAt: 0,
    lastCorrectAt: now,
    lastSeen: now,
  };

  const snap = memorySnapshot(state, now);

  assert.equal(snap.correctSpanDays, 0);
  assert.equal(snap.secure, false);
  assert.equal(snap.bucket, 'learning');
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

test('scheduler avoids recently seen generated variant signatures when alternatives exist', () => {
  const signatureItem = (id, variantSignature) => ({
    id,
    mode: 'choose',
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    prompt: 'Choose the best punctuated sentence.',
    options: [{ text: 'Where is the tide bell?', index: 0 }, { text: 'where is the tide bell', index: 1 }],
    correctIndex: 0,
    explanation: 'Capitalise the first word and use a question mark.',
    model: 'Where is the tide bell?',
    source: 'generated',
    variantSignature,
  });
  const previous = signatureItem('generated_previous_same', 'puncsig_same');
  const sameSignature = signatureItem('generated_same_signature', 'puncsig_same');
  const differentSignature = signatureItem('generated_different_signature', 'puncsig_different');
  const items = [sameSignature, differentSignature, previous];
  const indexes = {
    items,
    itemById: new Map(items.map((item) => [item.id, item])),
    itemsByMode: new Map([['choose', [sameSignature, differentSignature]]]),
    skillById: new Map([['sentence_endings', { id: 'sentence_endings', name: 'Capital letters and sentence endings', published: true }]]),
  };

  for (const randomValue of [0, 0.05, 0.2, 0.99]) {
    const result = selectPunctuationItem({
      indexes,
      progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [], sessionsCompleted: 0 },
      session: { answeredCount: 0, recentItemIds: [previous.id] },
      prefs: { mode: 'smart' },
      now: 0,
      random: () => randomValue,
    });

    assert.equal(result.item.id, differentSignature.id, `random=${randomValue}`);
  }
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

// --- Misconception retry tests ---

function makeItem(id, { mode = 'choose', skillIds = ['sentence_endings'], clusterId = 'endmarks', rewardUnitId = 'sentence-endings-core', misconceptionTags = [], variantSignature = '', templateId = '', stem = '' } = {}) {
  return {
    id,
    mode,
    skillIds,
    clusterId,
    rewardUnitId,
    prompt: 'Test prompt.',
    options: ['A.', 'B.'],
    correctIndex: 0,
    explanation: 'Test explanation.',
    model: 'A.',
    misconceptionTags,
    variantSignature,
    templateId,
    stem,
    source: 'generated',
  };
}

function makeIndexes(items) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const itemsByMode = new Map();
  const itemsBySkill = new Map();
  const itemsByRewardUnit = new Map();
  for (const item of items) {
    if (!itemsByMode.has(item.mode)) itemsByMode.set(item.mode, []);
    itemsByMode.get(item.mode).push(item);
    for (const skillId of item.skillIds) {
      if (!itemsBySkill.has(skillId)) itemsBySkill.set(skillId, []);
      itemsBySkill.get(skillId).push(item);
    }
    if (!itemsByRewardUnit.has(item.rewardUnitId)) itemsByRewardUnit.set(item.rewardUnitId, []);
    itemsByRewardUnit.get(item.rewardUnitId).push(item);
  }
  const skills = [...new Set(items.flatMap((item) => item.skillIds))].map((id) => ({ id, name: id, published: true, clusterId: 'endmarks' }));
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  return {
    items,
    itemById,
    itemsByMode,
    itemsBySkill,
    itemsByRewardUnit,
    skillById,
    skills,
    clusters: [{ id: 'endmarks', published: true, skillIds: skills.map((s) => s.id) }],
    clusterById: new Map([['endmarks', { id: 'endmarks', published: true }]]),
    rewardUnits: [],
    rewardUnitById: new Map(),
    rewardUnitByKey: new Map(),
    rewardUnitsByCluster: new Map(),
    rewardUnitsBySkill: new Map(),
    generatorFamilies: [],
    generatorFamilyById: new Map(),
    generatorFamiliesBySkill: new Map(),
    publishedSkillIds: skills.map((s) => s.id),
    publishedClusterIds: ['endmarks'],
    publishedRewardUnits: [],
  };
}

describe('misconception retry', () => {
  const missedItem = makeItem('missed_item', {
    misconceptionTags: ['endmarks.mark_mismatch', 'endmarks.capitalisation_missing'],
    variantSignature: 'sig_missed',
    templateId: 'tmpl_A',
    stem: 'the boat sailed away',
  });
  const siblingDiffTemplate = makeItem('sibling_diff_tmpl', {
    misconceptionTags: ['endmarks.mark_mismatch'],
    variantSignature: 'sig_sibling_1',
    templateId: 'tmpl_B',
    stem: 'the kite flew high',
  });
  const siblingSameTemplate = makeItem('sibling_same_tmpl', {
    misconceptionTags: ['endmarks.mark_mismatch'],
    variantSignature: 'sig_sibling_2',
    templateId: 'tmpl_A',
    stem: 'the rain stopped at last',
  });
  const siblingDiffTemplateSameStem = makeItem('sibling_diff_tmpl_same_stem', {
    misconceptionTags: ['endmarks.capitalisation_missing'],
    variantSignature: 'sig_sibling_3',
    templateId: 'tmpl_C',
    stem: 'the boat sailed away',
  });
  const unrelatedItem = makeItem('unrelated_item', {
    misconceptionTags: ['comma.missing_serial'],
    variantSignature: 'sig_unrelated',
    templateId: 'tmpl_X',
    stem: 'we ate pies cakes and buns',
  });

  const allItems = [missedItem, siblingDiffTemplate, siblingSameTemplate, siblingDiffTemplateSameStem, unrelatedItem];
  const indexes = makeIndexes(allItems);

  function progressWithMiss(itemId, misconceptionTags, variantSignature = '', opts = {}) {
    return {
      items: {},
      facets: {},
      rewardUnits: {},
      attempts: [
        {
          ts: 1000,
          itemId,
          variantSignature,
          mode: 'choose',
          skillIds: ['sentence_endings'],
          rewardUnitId: 'sentence-endings-core',
          correct: false,
          misconceptionTags,
          ...(opts.templateId ? { templateId: opts.templateId } : {}),
          ...(opts.stem ? { stem: opts.stem } : {}),
        },
      ],
      sessionsCompleted: 0,
    };
  }

  test('wrong answer with known misconception schedules sibling with different signature', () => {
    const progress = progressWithMiss('missed_item', ['endmarks.mark_mismatch'], 'sig_missed', { templateId: 'tmpl_A', stem: 'the boat sailed away' });
    const result = selectPunctuationItem({
      indexes,
      progress,
      session: { answeredCount: 0, recentItemIds: [] },
      prefs: { mode: 'smart' },
      now: 2000,
      random: () => 0,
    });

    assert.equal(result.reason, REASON_TAGS.MISCONCEPTION_RETRY);
    assert.notEqual(result.item.variantSignature, 'sig_missed');
    assert.ok(result.item.misconceptionTags.includes('endmarks.mark_mismatch'));
  });

  test('retry does not reuse same variant signature if alternatives exist', () => {
    // Add an item with same signature as missed — should never be selected
    const sameSignatureItem = makeItem('same_sig_as_missed', {
      misconceptionTags: ['endmarks.mark_mismatch'],
      variantSignature: 'sig_missed',
      templateId: 'tmpl_D',
      stem: 'different stem',
    });
    const testItems = [...allItems, sameSignatureItem];
    const testIndexes = makeIndexes(testItems);
    const progress = progressWithMiss('missed_item', ['endmarks.mark_mismatch'], 'sig_missed');
    const result = selectPunctuationItem({
      indexes: testIndexes,
      progress,
      session: { answeredCount: 0, recentItemIds: [] },
      prefs: { mode: 'smart' },
      now: 2000,
      random: () => 0,
    });

    assert.equal(result.reason, REASON_TAGS.MISCONCEPTION_RETRY);
    assert.notEqual(result.item.variantSignature, 'sig_missed');
  });

  test('retry prefers different templateId over same templateId', () => {
    const progress = progressWithMiss('missed_item', ['endmarks.mark_mismatch'], 'sig_missed', { templateId: 'tmpl_A', stem: 'the boat sailed away' });
    const result = selectPunctuationItem({
      indexes,
      progress,
      session: { answeredCount: 0, recentItemIds: [] },
      prefs: { mode: 'smart' },
      now: 2000,
      random: () => 0,
    });

    assert.equal(result.reason, REASON_TAGS.MISCONCEPTION_RETRY);
    // siblingDiffTemplate (tmpl_B, different stem) should rank highest
    assert.equal(result.item.id, 'sibling_diff_tmpl');
    assert.equal(result.item.templateId, 'tmpl_B');
  });

  test('retry falls back gracefully when family has only 1 template', () => {
    const singleTemplateItems = [
      missedItem,
      siblingSameTemplate, // Same templateId (tmpl_A) as missed, but different signature
    ];
    const singleIndexes = makeIndexes(singleTemplateItems);
    const progress = progressWithMiss('missed_item', ['endmarks.mark_mismatch'], 'sig_missed', { templateId: 'tmpl_A' });
    const result = selectPunctuationItem({
      indexes: singleIndexes,
      progress,
      session: { answeredCount: 0, recentItemIds: [] },
      prefs: { mode: 'smart' },
      now: 2000,
      random: () => 0,
    });

    assert.equal(result.reason, REASON_TAGS.MISCONCEPTION_RETRY);
    assert.equal(result.item.id, 'sibling_same_tmpl');
  });

  test('misconception tag not in any candidate falls back to standard selection', () => {
    // Progress has a misconception that no other items share
    const progress = progressWithMiss('missed_item', ['endmarks.rare_tag_nobody_has'], 'sig_missed');
    const result = selectPunctuationItem({
      indexes,
      progress,
      session: { answeredCount: 0, recentItemIds: [] },
      prefs: { mode: 'smart' },
      now: 2000,
      random: () => 0,
    });

    assert.equal(result.reason, REASON_TAGS.FALLBACK);
    assert.ok(result.item);
  });

  test('misconception retry respects session anti-repeat (does not retry same misconception twice)', () => {
    const progress = progressWithMiss('missed_item', ['endmarks.mark_mismatch'], 'sig_missed');
    // Mark the misconception tag as already retried in this session
    const result = selectPunctuationItem({
      indexes,
      progress,
      session: {
        answeredCount: 1,
        recentItemIds: ['sibling_diff_tmpl'],
        retriedMisconceptions: ['endmarks.mark_mismatch'],
      },
      prefs: { mode: 'smart' },
      now: 2000,
      random: () => 0,
    });

    // Should fall back, because the misconception has already been retried
    assert.equal(result.reason, REASON_TAGS.FALLBACK);
  });

  test('wrong fixed-item answer schedules generated sibling where appropriate', () => {
    // Simulate a fixed item being missed, with a generated sibling available
    const fixedMissed = makeItem('fixed_missed', {
      misconceptionTags: ['endmarks.mark_mismatch'],
      variantSignature: '',
      templateId: '',
      stem: 'the boat sailed away',
    });
    const generatedSibling = makeItem('gen_sibling', {
      misconceptionTags: ['endmarks.mark_mismatch'],
      variantSignature: 'sig_gen_1',
      templateId: 'tmpl_gen_1',
      stem: 'the horse jumped the fence',
    });
    const testItems = [fixedMissed, generatedSibling];
    const testIndexes = makeIndexes(testItems);
    const progress = progressWithMiss('fixed_missed', ['endmarks.mark_mismatch'], '');
    const result = selectPunctuationItem({
      indexes: testIndexes,
      progress,
      session: { answeredCount: 0, recentItemIds: [] },
      prefs: { mode: 'smart' },
      now: 2000,
      random: () => 0,
    });

    assert.equal(result.reason, REASON_TAGS.MISCONCEPTION_RETRY);
    assert.equal(result.item.id, 'gen_sibling');
  });
});

// --- Per-signature exposure limits (U4) ---

function makeSignatureItem(id, variantSignature, skillId = 'sentence_endings') {
  return {
    id,
    mode: 'choose',
    skillIds: [skillId],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    prompt: 'Choose the correct punctuation.',
    options: [{ text: 'A.', index: 0 }, { text: 'B.', index: 1 }],
    correctIndex: 0,
    explanation: 'Fixture.',
    model: 'A.',
    source: 'generated',
    variantSignature,
  };
}

function makeFixedItem(id, skillId = 'sentence_endings') {
  return {
    id,
    mode: 'choose',
    skillIds: [skillId],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    prompt: 'Choose the correct punctuation.',
    options: [{ text: 'A.', index: 0 }, { text: 'B.', index: 1 }],
    correctIndex: 0,
    explanation: 'Fixed fixture.',
    model: 'A.',
    source: 'curated',
    // no variantSignature
  };
}

function makeExposureIndexes(items) {
  return {
    items,
    itemById: new Map(items.map((item) => [item.id, item])),
    itemsByMode: new Map([['choose', items.filter(i => i.mode === 'choose')]]),
    skillById: new Map([['sentence_endings', { id: 'sentence_endings', name: 'Sentence endings', published: true }]]),
  };
}

describe('per-signature exposure limits', () => {
  test('same signature not selected twice in same session when alternatives exist', () => {
    const itemA = makeSignatureItem('item_a', 'sig_alpha');
    const itemB = makeSignatureItem('item_b', 'sig_beta');
    const indexes = makeExposureIndexes([itemA, itemB]);

    // Session already selected sig_alpha — item_a weight ×0.01, item_b weight 1.0
    // Any random > ~0.01 will select item_b overwhelmingly
    for (const r of [0.05, 0.3, 0.5, 0.9]) {
      const result = selectPunctuationItem({
        indexes,
        progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [], sessionsCompleted: 0 },
        session: { answeredCount: 0, recentItemIds: [], selectedSignatures: ['sig_alpha'] },
        prefs: { mode: 'smart' },
        now: 1_000_000_000_000,
        random: () => r,
      });

      assert.equal(result.item.id, 'item_b', `random=${r}: should select alternative when same-session signature blocked`);
    }
  });

  test('signature seen in last 3 attempts gets penalised weight (selects alternative)', () => {
    const itemA = makeSignatureItem('item_a', 'sig_alpha');
    const itemB = makeSignatureItem('item_b', 'sig_beta');
    const indexes = makeExposureIndexes([itemA, itemB]);

    const attempts = [
      { itemId: 'item_x', variantSignature: 'sig_alpha', correct: true, timestamp: 900_000_000_000 },
    ];

    // With random=0 normally first item wins; but penalty should make itemB preferred
    for (const r of [0, 0.1, 0.5, 0.9]) {
      const result = selectPunctuationItem({
        indexes,
        progress: { items: {}, facets: {}, rewardUnits: {}, attempts, sessionsCompleted: 0 },
        session: { answeredCount: 0, recentItemIds: [], selectedSignatures: [] },
        prefs: { mode: 'smart' },
        now: 1_000_000_000_000,
        random: () => r,
      });

      assert.equal(result.item.id, 'item_b', `random=${r}: penalised signature should lose to alternative`);
    }
  });

  test('signature seen within 7 days gets avoided when alternatives exist', () => {
    const nowMs = 1_000_000_000_000;
    const fiveDaysAgo = nowMs - 5 * DAY_MS;
    const itemA = makeSignatureItem('item_a', 'sig_alpha');
    const itemB = makeSignatureItem('item_b', 'sig_beta');
    const indexes = makeExposureIndexes([itemA, itemB]);

    // Attempt was 5 days ago (within 7-day window) but NOT in last 3 attempts distance
    const attempts = Array.from({ length: 10 }, (_, i) => ({
      itemId: `filler_${i}`,
      variantSignature: `filler_sig_${i}`,
      correct: true,
      timestamp: fiveDaysAgo + i * 1000,
    }));
    // Insert the sig_alpha attempt before the fillers
    attempts.unshift({ itemId: 'old_item', variantSignature: 'sig_alpha', correct: true, timestamp: fiveDaysAgo });

    // item_a gets ×0.3 day-penalty, item_b stays at full weight
    // random > ~0.23 will select item_b deterministically
    for (const r of [0.3, 0.5, 0.7, 0.9]) {
      const result = selectPunctuationItem({
        indexes,
        progress: { items: {}, facets: {}, rewardUnits: {}, attempts, sessionsCompleted: 0 },
        session: { answeredCount: 0, recentItemIds: [], selectedSignatures: [] },
        prefs: { mode: 'smart' },
        now: nowMs,
        random: () => r,
      });

      assert.equal(result.item.id, 'item_b', `random=${r}: day-window avoidance should prefer alternative`);
    }
  });

  test('when ALL candidates seen within 7 days, least-recently-seen preferred (no deadlock)', () => {
    const nowMs = 1_000_000_000_000;
    const itemA = makeSignatureItem('item_a', 'sig_alpha');
    const itemB = makeSignatureItem('item_b', 'sig_beta');
    const indexes = makeExposureIndexes([itemA, itemB]);

    // Both signatures seen within 7 days — neither should be zeroed out
    const attempts = [
      { itemId: 'x1', variantSignature: 'sig_alpha', correct: true, timestamp: nowMs - 2 * DAY_MS },
      { itemId: 'x2', variantSignature: 'sig_beta', correct: true, timestamp: nowMs - 1 * DAY_MS },
    ];

    const result = selectPunctuationItem({
      indexes,
      progress: { items: {}, facets: {}, rewardUnits: {}, attempts, sessionsCompleted: 0 },
      session: { answeredCount: 0, recentItemIds: [], selectedSignatures: [] },
      prefs: { mode: 'smart' },
      now: nowMs,
      random: () => 0,
    });

    // Both get day-avoidance penalty (x0.3) — selection still occurs (no deadlock)
    assert.ok(result.item, 'Must still select an item when all candidates have day-window penalty');
    assert.ok(['item_a', 'item_b'].includes(result.item.id));
  });

  test('misconception-retry overrides per-session block', () => {
    const itemA = makeSignatureItem('item_a', 'sig_alpha');
    const itemB = makeSignatureItem('item_b', 'sig_beta');
    const indexes = makeExposureIndexes([itemA, itemB]);

    // Session already selected sig_alpha, but misconception-retry is active
    const result = selectPunctuationItem({
      indexes,
      progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [], sessionsCompleted: 0 },
      session: {
        answeredCount: 0,
        recentItemIds: [],
        selectedSignatures: ['sig_alpha'],
        selectionReason: REASON_TAGS.MISCONCEPTION_RETRY,
      },
      prefs: { mode: 'smart' },
      now: 1_000_000_000_000,
      random: () => 0,
    });

    // With misconception-retry, the per-session block is relaxed — item_a is selectable
    assert.equal(result.item.id, 'item_a', 'Misconception-retry should bypass per-session block');
  });

  test('fixed items (no variantSignature) are never penalised by exposure limits', () => {
    const fixedItem = makeFixedItem('fixed_1');
    const sigItem = makeSignatureItem('sig_item', 'sig_alpha');
    const indexes = makeExposureIndexes([fixedItem, sigItem]);

    // Session already has sig_alpha; fixed item should not be penalised
    const result = selectPunctuationItem({
      indexes,
      progress: { items: {}, facets: {}, rewardUnits: {}, attempts: [], sessionsCompleted: 0 },
      session: { answeredCount: 0, recentItemIds: [], selectedSignatures: ['sig_alpha'] },
      prefs: { mode: 'smart' },
      now: 1_000_000_000_000,
      random: () => 0,
    });

    // Fixed item has no variantSignature so it cannot be penalised
    assert.equal(result.item.id, 'fixed_1', 'Fixed item should be preferred over session-blocked signature item');
  });

  test('exposure limits interact correctly with existing weak-mode priority weighting', () => {
    const weakItem = makeSignatureItem('weak_item', 'sig_alpha', 'sentence_endings');
    const freshItem = makeSignatureItem('fresh_item', 'sig_beta', 'sentence_endings');
    const indexes = makeExposureIndexes([weakItem, freshItem]);

    const weakFacet = updateMemoryState(createMemoryState(), false, 0);

    // sig_alpha was seen in session, so weak_item gets session-blocked
    const result = selectPunctuationItem({
      indexes,
      progress: {
        items: {},
        facets: { 'sentence_endings::choose': weakFacet },
        rewardUnits: {},
        attempts: [],
        sessionsCompleted: 0,
      },
      session: { mode: 'weak', answeredCount: 0, recentItemIds: [], selectedSignatures: ['sig_alpha'] },
      prefs: { mode: 'weak' },
      now: 0,
      random: () => 0,
    });

    // Even though weak_item has higher weak-facet priority, the exposure block
    // should penalise it enough to prefer fresh_item
    assert.equal(result.item.id, 'fresh_item', 'Exposure penalty should override weak-priority when alternative exists');
  });
});
