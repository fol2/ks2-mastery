import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveRecentModes,
  selectPunctuationItem,
} from '../shared/punctuation/scheduler.js';
import {
  REASON_TAGS,
  MIXED_REVIEW_MIN_RECENT_ATTEMPTS,
} from '../shared/punctuation/scheduler-manifest.js';

function makeItem(id, { mode = 'choose', skillIds = ['sentence_endings'], clusterId = 'endmarks' } = {}) {
  return {
    id,
    mode,
    skillIds,
    clusterId,
    rewardUnitId: 'sentence-endings-core',
    prompt: 'Test prompt.',
    options: ['A.', 'B.'],
    correctIndex: 0,
    explanation: 'Test explanation.',
    model: 'A.',
    source: 'generated',
    variantSignature: `sig_${id}`,
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

function makeAttempt(mode, { correct = true, ts = 1000 } = {}) {
  return {
    ts,
    itemId: `item_${mode}_${ts}`,
    variantSignature: '',
    mode,
    itemMode: mode,
    skillIds: ['sentence_endings'],
    rewardUnitId: 'sentence-endings-core',
    correct,
    misconceptionTags: [],
  };
}

describe('deriveRecentModes', () => {
  test('returns empty when progress.attempts is undefined', () => {
    const modes = deriveRecentModes(undefined);
    assert.deepEqual(modes, []);
  });

  test('returns empty when progress.attempts is not an array', () => {
    const modes = deriveRecentModes({ attempts: 'invalid' });
    assert.deepEqual(modes, []);
  });

  test('returns empty when fewer than MIXED_REVIEW_MIN_RECENT_ATTEMPTS attempts', () => {
    const modes = deriveRecentModes({
      attempts: [makeAttempt('choose'), makeAttempt('insert')],
    });
    assert.deepEqual(modes, []);
  });

  test('derives modes from last 5 attempts when enough present', () => {
    const attempts = [
      makeAttempt('choose', { ts: 1 }),
      makeAttempt('insert', { ts: 2 }),
      makeAttempt('fix', { ts: 3 }),
      makeAttempt('choose', { ts: 4 }),
      makeAttempt('insert', { ts: 5 }),
      makeAttempt('fix', { ts: 6 }),
      makeAttempt('transfer', { ts: 7 }),
    ];
    const modes = deriveRecentModes({ attempts });
    // Last 5: fix(3), choose(4), insert(5), fix(6), transfer(7)
    assert.deepEqual(modes, ['fix', 'choose', 'insert', 'fix', 'transfer']);
  });

  test('skips attempts with missing mode fields gracefully', () => {
    const attempts = [
      makeAttempt('choose', { ts: 1 }),
      makeAttempt('insert', { ts: 2 }),
      { ts: 3, itemId: 'no_mode', skillIds: [], correct: true },
      makeAttempt('fix', { ts: 4 }),
      makeAttempt('transfer', { ts: 5 }),
    ];
    const modes = deriveRecentModes({ attempts });
    // Last 5: choose, insert, (skipped), fix, transfer → 4 valid modes
    assert.deepEqual(modes, ['choose', 'insert', 'fix', 'transfer']);
  });
});

describe('mixed-review scheduling reachability', () => {
  test('session with 5+ attempts across 2+ modes triggers MIXED_REVIEW', () => {
    // All recent attempts are 'insert', selected item is 'choose' → mixed-review
    const itemChoose = makeItem('item_choose', { mode: 'choose' });
    const indexes = makeIndexes([itemChoose]);

    const attempts = [
      makeAttempt('insert', { ts: 1 }),
      makeAttempt('insert', { ts: 2 }),
      makeAttempt('insert', { ts: 3 }),
      makeAttempt('insert', { ts: 4 }),
      makeAttempt('insert', { ts: 5 }),
    ];

    const result = selectPunctuationItem({
      indexes,
      progress: { items: {}, facets: {}, rewardUnits: {}, attempts, sessionsCompleted: 0 },
      session: { answeredCount: 5, recentItemIds: ['a', 'b', 'c', 'd', 'e'] },
      prefs: { mode: 'smart' },
      now: 10000,
      random: () => 0,
    });

    assert.equal(result.item.id, 'item_choose');
    assert.equal(result.reason, REASON_TAGS.MIXED_REVIEW);
  });

  test('session with all same-mode attempts never triggers mixed-review when item matches', () => {
    // All recent attempts are 'choose', selected item is 'choose' → no mixed-review
    const itemChoose = makeItem('item_choose', { mode: 'choose' });
    const indexes = makeIndexes([itemChoose]);

    const attempts = [
      makeAttempt('choose', { ts: 1 }),
      makeAttempt('choose', { ts: 2 }),
      makeAttempt('choose', { ts: 3 }),
      makeAttempt('choose', { ts: 4 }),
      makeAttempt('choose', { ts: 5 }),
    ];

    const result = selectPunctuationItem({
      indexes,
      progress: { items: {}, facets: {}, rewardUnits: {}, attempts, sessionsCompleted: 0 },
      session: { answeredCount: 5, recentItemIds: ['a', 'b', 'c', 'd', 'e'] },
      prefs: { mode: 'smart' },
      now: 10000,
      random: () => 0,
    });

    assert.equal(result.item.id, 'item_choose');
    // Item mode matches last 3 attempt modes → fallback, not mixed-review
    assert.equal(result.reason, REASON_TAGS.FALLBACK);
  });

  test('session with fewer than 3 attempts returns false for mixed-review', () => {
    const itemChoose = makeItem('item_choose', { mode: 'choose' });
    const indexes = makeIndexes([itemChoose]);

    const attempts = [
      makeAttempt('insert', { ts: 1 }),
      makeAttempt('insert', { ts: 2 }),
    ];

    const result = selectPunctuationItem({
      indexes,
      progress: { items: {}, facets: {}, rewardUnits: {}, attempts, sessionsCompleted: 0 },
      session: { answeredCount: 2, recentItemIds: ['a', 'b'] },
      prefs: { mode: 'smart' },
      now: 10000,
      random: () => 0,
    });

    assert.equal(result.item.id, 'item_choose');
    // Fewer than 3 recent IDs → mixed-review unreachable → fallback
    assert.equal(result.reason, REASON_TAGS.FALLBACK);
  });

  test('session.attempts undefined causes graceful degradation, no crash', () => {
    const itemChoose = makeItem('item_choose', { mode: 'choose' });
    const indexes = makeIndexes([itemChoose]);

    // progress.attempts is undefined
    const result = selectPunctuationItem({
      indexes,
      progress: { items: {}, facets: {}, rewardUnits: {}, sessionsCompleted: 0 },
      session: { answeredCount: 5, recentItemIds: ['a', 'b', 'c', 'd', 'e'] },
      prefs: { mode: 'smart' },
      now: 10000,
      random: () => 0,
    });

    assert.ok(result.item, 'Must still select an item');
    assert.equal(result.reason, REASON_TAGS.FALLBACK);
  });

  test('scheduler prefers due-review and weak-skill-repair over mixed-review', () => {
    // Item is due (has memory state with passed interval) AND modes differ
    const itemChoose = makeItem('item_choose', { mode: 'choose' });
    const indexes = makeIndexes([itemChoose]);

    const DAY_MS = 24 * 60 * 60 * 1000;
    const nowMs = 3 * DAY_MS;

    // Create a due item: answered correctly at day 1, interval expired by day 3
    const itemState = {
      attempts: 1,
      correct: 1,
      incorrect: 0,
      streak: 1,
      lapses: 0,
      ease: 2.36,
      intervalDays: 1,
      dueAt: 2 * DAY_MS, // Due at day 2
      firstCorrectAt: DAY_MS,
      lastCorrectAt: DAY_MS,
      lastSeen: DAY_MS,
      lastCorrect: true,
      recent: [1],
    };

    const attempts = [
      makeAttempt('insert', { ts: DAY_MS }),
      makeAttempt('insert', { ts: DAY_MS + 1000 }),
      makeAttempt('insert', { ts: DAY_MS + 2000 }),
      makeAttempt('insert', { ts: DAY_MS + 3000 }),
      makeAttempt('insert', { ts: DAY_MS + 4000 }),
    ];

    const result = selectPunctuationItem({
      indexes,
      progress: {
        items: { item_choose: itemState },
        facets: {},
        rewardUnits: {},
        attempts,
        sessionsCompleted: 0,
      },
      session: { answeredCount: 5, recentItemIds: ['a', 'b', 'c', 'd', 'e'] },
      prefs: { mode: 'smart' },
      now: nowMs,
      random: () => 0,
    });

    assert.equal(result.item.id, 'item_choose');
    // Due-review takes priority over mixed-review in classifySmartReason
    assert.equal(result.reason, REASON_TAGS.DUE_REVIEW);
  });

  test('across 50+ selections with multi-mode session, mixed-review appears at least once but fix-mode items get fallback', () => {
    // Pool has many fix items (matching recent mode) and a few choose items (different mode)
    const fixItems = Array.from({ length: 8 }, (_, i) => makeItem(`item_fix_${i}`, { mode: 'fix' }));
    const chooseItems = Array.from({ length: 3 }, (_, i) => makeItem(`item_choose_${i}`, { mode: 'choose' }));
    const indexes = makeIndexes([...fixItems, ...chooseItems]);

    // All recent attempts are 'fix' — choose items get mixed-review, fix items get fallback
    const attempts = [
      makeAttempt('fix', { ts: 1 }),
      makeAttempt('fix', { ts: 2 }),
      makeAttempt('fix', { ts: 3 }),
      makeAttempt('fix', { ts: 4 }),
      makeAttempt('fix', { ts: 5 }),
    ];

    let mixedCount = 0;
    let fallbackCount = 0;
    const totalRuns = 60;

    for (let i = 0; i < totalRuns; i++) {
      const result = selectPunctuationItem({
        indexes,
        progress: { items: {}, facets: {}, rewardUnits: {}, attempts, sessionsCompleted: 0 },
        session: { answeredCount: 5 + i, recentItemIds: ['a', 'b', 'c', 'd', 'e'] },
        prefs: { mode: 'smart' },
        now: 10000 + i * 1000,
        random: () => (i * 7 % 100) / 100,
      });

      if (result.reason === REASON_TAGS.MIXED_REVIEW) {
        mixedCount++;
        // Mixed-review items must have a different mode from the last 3
        assert.notEqual(result.item.mode, 'fix', 'Mixed-review must select different mode');
      } else if (result.reason === REASON_TAGS.FALLBACK) {
        fallbackCount++;
      }
    }

    // Mixed-review appears at least once (choose items exist with a different mode)
    assert.ok(mixedCount >= 1, `Expected mixed-review at least once in ${totalRuns} runs, got ${mixedCount}`);
    // Fallback also appears (fix items match recent mode, so they get fallback)
    assert.ok(fallbackCount >= 1, `Expected fallback at least once in ${totalRuns} runs, got ${fallbackCount}`);
  });

  test('explicit session.recentModes is preferred over derived modes from attempts', () => {
    const itemChoose = makeItem('item_choose', { mode: 'choose' });
    const indexes = makeIndexes([itemChoose]);

    // Attempts have mode 'choose' (matching item), so derivation would say no mixed-review
    const attempts = [
      makeAttempt('choose', { ts: 1 }),
      makeAttempt('choose', { ts: 2 }),
      makeAttempt('choose', { ts: 3 }),
      makeAttempt('choose', { ts: 4 }),
      makeAttempt('choose', { ts: 5 }),
    ];

    // But explicit session.recentModes says last 3 were 'insert' → mixed-review
    const result = selectPunctuationItem({
      indexes,
      progress: { items: {}, facets: {}, rewardUnits: {}, attempts, sessionsCompleted: 0 },
      session: {
        answeredCount: 5,
        recentItemIds: ['a', 'b', 'c', 'd', 'e'],
        recentModes: ['insert', 'insert', 'insert'],
      },
      prefs: { mode: 'smart' },
      now: 10000,
      random: () => 0,
    });

    assert.equal(result.item.id, 'item_choose');
    assert.equal(result.reason, REASON_TAGS.MIXED_REVIEW);
  });

  test('MIXED_REVIEW_MIN_RECENT_ATTEMPTS constant equals 3', () => {
    assert.equal(MIXED_REVIEW_MIN_RECENT_ATTEMPTS, 3);
  });
});
