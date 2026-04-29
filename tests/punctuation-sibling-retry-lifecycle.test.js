import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  selectPunctuationItem,
} from '../shared/punctuation/scheduler.js';
import {
  REASON_TAGS,
  MISCONCEPTION_RETRY_MAX_ATTEMPTS,
} from '../shared/punctuation/scheduler-manifest.js';

// --- Deterministic fixture helpers ---

function makeItem(id, {
  mode = 'choose',
  skillIds = ['sentence_endings'],
  clusterId = 'endmarks',
  rewardUnitId = 'sentence-endings-core',
  misconceptionTags = [],
  variantSignature = '',
  templateId = '',
  stem = '',
  source = 'generated',
} = {}) {
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
    source,
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
  const skills = [...new Set(items.flatMap((item) => item.skillIds))].map((id) => ({
    id,
    name: id,
    published: true,
    clusterId: 'endmarks',
  }));
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

function makeProgress(attempts = []) {
  return {
    items: {},
    facets: {},
    rewardUnits: {},
    attempts,
    sessionsCompleted: 0,
  };
}

function missAttempt(itemId, misconceptionTags, variantSignature = '', opts = {}) {
  return {
    ts: opts.ts || 1000,
    itemId,
    variantSignature,
    mode: opts.mode || 'choose',
    skillIds: opts.skillIds || ['sentence_endings'],
    rewardUnitId: opts.rewardUnitId || 'sentence-endings-core',
    correct: false,
    misconceptionTags,
    ...(opts.templateId ? { templateId: opts.templateId } : {}),
    ...(opts.stem ? { stem: opts.stem } : {}),
  };
}

function correctAttempt(itemId, misconceptionTags, variantSignature = '', opts = {}) {
  return {
    ts: opts.ts || 2000,
    itemId,
    variantSignature,
    mode: opts.mode || 'choose',
    skillIds: opts.skillIds || ['sentence_endings'],
    rewardUnitId: opts.rewardUnitId || 'sentence-endings-core',
    correct: true,
    misconceptionTags,
    ...(opts.templateId ? { templateId: opts.templateId } : {}),
    ...(opts.stem ? { stem: opts.stem } : {}),
  };
}

// --- Shared fixtures ---

const missedItem = makeItem('missed_item', {
  misconceptionTags: ['endmarks.mark_mismatch', 'endmarks.capitalisation_missing'],
  variantSignature: 'sig_missed',
  templateId: 'tmpl_A',
  stem: 'the boat sailed away',
});

const siblingRank4 = makeItem('sibling_rank4', {
  misconceptionTags: ['endmarks.mark_mismatch'],
  variantSignature: 'sig_sib_1',
  templateId: 'tmpl_B',
  stem: 'the kite flew high',
});

const siblingRank3 = makeItem('sibling_rank3', {
  misconceptionTags: ['endmarks.mark_mismatch'],
  variantSignature: 'sig_sib_2',
  templateId: 'tmpl_C',
  stem: 'the boat sailed away', // same stem as missed
});

const siblingRank1 = makeItem('sibling_rank1', {
  misconceptionTags: ['endmarks.mark_mismatch'],
  variantSignature: 'sig_sib_3',
  templateId: 'tmpl_A', // same template as missed
  stem: 'the rain stopped at last',
});

const unrelatedItem = makeItem('unrelated', {
  misconceptionTags: ['comma.serial_missing'],
  variantSignature: 'sig_unrelated',
  templateId: 'tmpl_X',
  stem: 'we ate pies cakes and buns',
});

// --- Tests ---

describe('sibling-retry lifecycle', () => {
  test('wrong answer with misconceptionTags schedules sibling with different variantSignature', () => {
    const items = [missedItem, siblingRank4, unrelatedItem];
    const indexes = makeIndexes(items);
    const progress = makeProgress([
      missAttempt('missed_item', ['endmarks.mark_mismatch'], 'sig_missed', {
        templateId: 'tmpl_A',
        stem: 'the boat sailed away',
      }),
    ]);

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

  test('selected sibling has different templateId when available (rank 4 preferred)', () => {
    const items = [missedItem, siblingRank4, siblingRank1, unrelatedItem];
    const indexes = makeIndexes(items);
    const progress = makeProgress([
      missAttempt('missed_item', ['endmarks.mark_mismatch'], 'sig_missed', {
        templateId: 'tmpl_A',
        stem: 'the boat sailed away',
      }),
    ]);

    const result = selectPunctuationItem({
      indexes,
      progress,
      session: { answeredCount: 0, recentItemIds: [] },
      prefs: { mode: 'smart' },
      now: 2000,
      random: () => 0,
    });

    assert.equal(result.reason, REASON_TAGS.MISCONCEPTION_RETRY);
    // siblingRank4: different template + different stem = rank 4 (best)
    assert.equal(result.item.id, 'sibling_rank4');
    assert.equal(result.item.templateId, 'tmpl_B');
    assert.notEqual(result.item.templateId, 'tmpl_A');
  });

  test('correct retry emits MISCONCEPTION_RETRY_PASSED signal (falls through after pass)', () => {
    // After a correct retry the misconception is "passed" — next selection should NOT
    // re-trigger misconception retry because the most recent attempt in the lookback
    // window is now correct.
    const items = [missedItem, siblingRank4, unrelatedItem];
    const indexes = makeIndexes(items);
    const progress = makeProgress([
      missAttempt('missed_item', ['endmarks.mark_mismatch'], 'sig_missed', { ts: 1000 }),
      correctAttempt('sibling_rank4', ['endmarks.mark_mismatch'], 'sig_sib_1', { ts: 2000 }),
    ]);

    const result = selectPunctuationItem({
      indexes,
      progress,
      session: { answeredCount: 1, recentItemIds: ['sibling_rank4'] },
      prefs: { mode: 'smart' },
      now: 3000,
      random: () => 0,
    });

    // The correct attempt breaks the misconception chain — next pick uses standard logic
    assert.notEqual(result.reason, REASON_TAGS.MISCONCEPTION_RETRY);
  });

  test('only 1 item shares the tag — no sibling available — falls through to next reason', () => {
    // Only the missed item has the tag — no siblings to retry
    const loneItem = makeItem('lone_item', {
      misconceptionTags: ['endmarks.rare_unique_tag'],
      variantSignature: 'sig_lone',
      templateId: 'tmpl_lone',
      stem: 'unique stem',
    });
    const items = [loneItem, unrelatedItem];
    const indexes = makeIndexes(items);
    const progress = makeProgress([
      missAttempt('lone_item', ['endmarks.rare_unique_tag'], 'sig_lone', {
        templateId: 'tmpl_lone',
        stem: 'unique stem',
      }),
    ]);

    const result = selectPunctuationItem({
      indexes,
      progress,
      session: { answeredCount: 0, recentItemIds: [] },
      prefs: { mode: 'smart' },
      now: 2000,
      random: () => 0,
    });

    // No sibling → falls through to standard selection
    assert.notEqual(result.reason, REASON_TAGS.MISCONCEPTION_RETRY);
    assert.ok(result.item);
  });

  test('same misconception retried 3 times without repair — priority demoted, learner escapes', () => {
    const items = [missedItem, siblingRank4, siblingRank1, unrelatedItem];
    const indexes = makeIndexes(items);

    // Build N consecutive wrong attempts sharing the same misconception tag
    const consecutiveWrong = Array.from({ length: MISCONCEPTION_RETRY_MAX_ATTEMPTS }, (_, i) =>
      missAttempt(`attempt_${i}`, ['endmarks.mark_mismatch'], `sig_attempt_${i}`, {
        ts: 1000 + i * 100,
        templateId: 'tmpl_A',
      })
    );

    const progress = makeProgress(consecutiveWrong);

    const result = selectPunctuationItem({
      indexes,
      progress,
      session: { answeredCount: 0, recentItemIds: [] },
      prefs: { mode: 'smart' },
      now: 5000,
      random: () => 0,
    });

    // Loop-breaker fires: misconception retry is demoted, standard selection takes over
    assert.notEqual(result.reason, REASON_TAGS.MISCONCEPTION_RETRY);
    assert.ok(result.item, 'Learner still gets an item (not stuck)');
  });

  test('both fixed and generated items participate in sibling retry', () => {
    const fixedMissed = makeItem('fixed_missed', {
      misconceptionTags: ['endmarks.mark_mismatch'],
      variantSignature: '', // fixed items have no variantSignature
      templateId: '',
      stem: 'the boat sailed away',
      source: 'curated',
    });
    const generatedSibling = makeItem('gen_sibling', {
      misconceptionTags: ['endmarks.mark_mismatch'],
      variantSignature: 'sig_gen_1',
      templateId: 'tmpl_gen_1',
      stem: 'the horse jumped the fence',
      source: 'generated',
    });
    const items = [fixedMissed, generatedSibling];
    const indexes = makeIndexes(items);
    const progress = makeProgress([
      missAttempt('fixed_missed', ['endmarks.mark_mismatch'], '', {
        templateId: '',
        stem: 'the boat sailed away',
      }),
    ]);

    const result = selectPunctuationItem({
      indexes,
      progress,
      session: { answeredCount: 0, recentItemIds: [] },
      prefs: { mode: 'smart' },
      now: 2000,
      random: () => 0,
    });

    assert.equal(result.reason, REASON_TAGS.MISCONCEPTION_RETRY);
    assert.equal(result.item.id, 'gen_sibling');
    assert.equal(result.item.source, 'generated');
  });

  test('sibling differs by signature but shares stem — still valid (stem diversity preferred, not required)', () => {
    // siblingRank3 has different template but SAME stem as missed → rank 3 (still valid)
    const items = [missedItem, siblingRank3];
    const indexes = makeIndexes(items);
    const progress = makeProgress([
      missAttempt('missed_item', ['endmarks.mark_mismatch'], 'sig_missed', {
        templateId: 'tmpl_A',
        stem: 'the boat sailed away',
      }),
    ]);

    const result = selectPunctuationItem({
      indexes,
      progress,
      session: { answeredCount: 0, recentItemIds: [] },
      prefs: { mode: 'smart' },
      now: 2000,
      random: () => 0,
    });

    assert.equal(result.reason, REASON_TAGS.MISCONCEPTION_RETRY);
    assert.equal(result.item.id, 'sibling_rank3');
    // Same stem is still valid — stem diversity is preferred but not required
    assert.equal(result.item.stem, 'the boat sailed away');
    assert.notEqual(result.item.variantSignature, 'sig_missed');
  });
});

describe('loop-breaker edge cases', () => {
  test('fewer than MAX_ATTEMPTS consecutive failures still allows retry', () => {
    const items = [missedItem, siblingRank4, unrelatedItem];
    const indexes = makeIndexes(items);

    // Only 2 consecutive wrongs (below threshold of 3)
    const attempts = [
      missAttempt('a1', ['endmarks.mark_mismatch'], 'sig_a1', { ts: 1000 }),
      missAttempt('a2', ['endmarks.mark_mismatch'], 'sig_a2', { ts: 1100 }),
    ];
    const progress = makeProgress(attempts);

    const result = selectPunctuationItem({
      indexes,
      progress,
      session: { answeredCount: 0, recentItemIds: [] },
      prefs: { mode: 'smart' },
      now: 2000,
      random: () => 0,
    });

    // Still within budget — misconception retry fires
    assert.equal(result.reason, REASON_TAGS.MISCONCEPTION_RETRY);
  });

  test('correct answer in the chain resets the consecutive count', () => {
    const items = [missedItem, siblingRank4, unrelatedItem];
    const indexes = makeIndexes(items);

    // 2 wrong, then 1 correct, then 2 wrong — consecutive count is 2 (not 4)
    const attempts = [
      missAttempt('a1', ['endmarks.mark_mismatch'], 'sig_a1', { ts: 1000 }),
      missAttempt('a2', ['endmarks.mark_mismatch'], 'sig_a2', { ts: 1100 }),
      correctAttempt('a3', ['endmarks.mark_mismatch'], 'sig_a3', { ts: 1200 }),
      missAttempt('a4', ['endmarks.mark_mismatch'], 'sig_a4', { ts: 1300 }),
      missAttempt('a5', ['endmarks.mark_mismatch'], 'sig_a5', { ts: 1400 }),
    ];
    const progress = makeProgress(attempts);

    const result = selectPunctuationItem({
      indexes,
      progress,
      session: { answeredCount: 0, recentItemIds: [] },
      prefs: { mode: 'smart' },
      now: 2000,
      random: () => 0,
    });

    // Consecutive count = 2 (after the correct answer) < 3 → retry still fires
    assert.equal(result.reason, REASON_TAGS.MISCONCEPTION_RETRY);
  });

  test('different misconception tag in attempt chain breaks the consecutive count', () => {
    const items = [missedItem, siblingRank4, unrelatedItem];
    const indexes = makeIndexes(items);

    // 2 wrong for mark_mismatch, then 1 wrong for a DIFFERENT tag, then 1 wrong for mark_mismatch
    // The different-tag attempt breaks the chain — consecutive for mark_mismatch = 1
    const attempts = [
      missAttempt('a1', ['endmarks.mark_mismatch'], 'sig_a1', { ts: 1000 }),
      missAttempt('a2', ['endmarks.mark_mismatch'], 'sig_a2', { ts: 1100 }),
      missAttempt('a3', ['comma.serial_missing'], 'sig_a3', { ts: 1200 }),
      missAttempt('a4', ['endmarks.mark_mismatch'], 'sig_a4', { ts: 1300 }),
    ];
    const progress = makeProgress(attempts);

    const result = selectPunctuationItem({
      indexes,
      progress,
      session: { answeredCount: 0, recentItemIds: [] },
      prefs: { mode: 'smart' },
      now: 2000,
      random: () => 0,
    });

    // Consecutive count from tail = 1 (only a4) < 3 → retry still fires
    assert.equal(result.reason, REASON_TAGS.MISCONCEPTION_RETRY);
  });
});
