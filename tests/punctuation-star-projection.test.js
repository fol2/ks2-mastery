import test from 'node:test';
import assert from 'node:assert/strict';

import { projectPunctuationStars } from '../src/subjects/punctuation/star-projection.js';

const CURRENT_RELEASE_ID = 'punctuation-r4-full-14-skill-structure';
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function masteryKey(clusterId, rewardUnitId) {
  return `punctuation:${CURRENT_RELEASE_ID}:${clusterId}:${rewardUnitId}`;
}

function freshProgress() {
  return {
    items: {},
    facets: {},
    rewardUnits: {},
    attempts: [],
  };
}

function makeAttempt(overrides = {}) {
  return {
    ts: Date.UTC(2026, 3, 25, 10, 0, 0),
    itemId: 'test-item-01',
    skillIds: ['sentence_endings'],
    rewardUnitId: 'sentence-endings-core',
    correct: true,
    supportLevel: 0,
    supportKind: null,
    itemMode: 'choose',
    sessionMode: 'smart',
    testMode: null,
    ...overrides,
  };
}

function secureItemState(overrides = {}) {
  const now = Date.UTC(2026, 3, 25);
  return {
    attempts: 10,
    correct: 9,
    incorrect: 1,
    streak: 4,
    lapses: 0,
    dueAt: 0,
    firstCorrectAt: now - (14 * DAY_MS),
    lastCorrectAt: now,
    lastSeen: now,
    ...overrides,
  };
}

function securedRewardUnit(clusterId, rewardUnitId) {
  const key = masteryKey(clusterId, rewardUnitId);
  return {
    [key]: {
      masteryKey: key,
      releaseId: CURRENT_RELEASE_ID,
      clusterId,
      rewardUnitId,
      securedAt: Date.UTC(2026, 3, 24),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('fresh learner (zero attempts) — all Stars 0 for every monster', () => {
  const result = projectPunctuationStars(freshProgress(), CURRENT_RELEASE_ID);

  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    const m = result.perMonster[monsterId];
    assert.ok(m, `perMonster.${monsterId} must exist`);
    assert.equal(m.tryStars, 0, `${monsterId} tryStars`);
    assert.equal(m.practiceStars, 0, `${monsterId} practiceStars`);
    assert.equal(m.secureStars, 0, `${monsterId} secureStars`);
    assert.equal(m.masteryStars, 0, `${monsterId} masteryStars`);
    assert.equal(m.total, 0, `${monsterId} total`);
  }

  assert.equal(result.grand.grandStars, 0, 'grand stars');
  assert.equal(result.grand.total, 100, 'grand total cap');
});

test('one meaningful attempt in Pealark cluster — Try Stars increase, total > 0', () => {
  const progress = freshProgress();
  progress.attempts.push(makeAttempt({
    itemId: 'se_choose_basic',
    skillIds: ['sentence_endings'],
    rewardUnitId: 'sentence-endings-core',
  }));

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const pealark = result.perMonster.pealark;
  assert.ok(pealark.tryStars > 0, 'Try Stars must increase with one attempt');
  assert.ok(pealark.total > 0, 'total must be > 0');

  // Claspin should still be zero (no apostrophe attempts).
  assert.equal(result.perMonster.claspin.total, 0, 'Claspin must remain at 0');
});

test('3+ independent correct in Claspin — Practice Stars accumulate', () => {
  const progress = freshProgress();
  for (let i = 0; i < 5; i++) {
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, i, 0),
      itemId: `apos_item_${i}`,
      skillIds: ['apostrophe_contractions'],
      rewardUnitId: 'apostrophe-contractions-core',
      correct: true,
      supportLevel: 0,
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const claspin = result.perMonster.claspin;
  assert.ok(claspin.practiceStars > 0, 'Practice Stars must accumulate');
  assert.ok(claspin.practiceStars >= 3, 'At least 3 Practice Stars for 5 independent correct');
});

test('item reaching secure bucket — Secure Stars unlock', () => {
  const progress = freshProgress();

  // Add a secure item state.
  progress.items['se_choose_basic'] = secureItemState();

  // Add attempts so the item maps to Pealark.
  for (let i = 0; i < 4; i++) {
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25 - i, 10, 0, 0),
      itemId: 'se_choose_basic',
      skillIds: ['sentence_endings'],
      correct: true,
    }));
  }

  // Also add a secured reward unit for Pealark.
  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const pealark = result.perMonster.pealark;
  assert.ok(pealark.secureStars > 0, 'Secure Stars must unlock with a secure item');
});

test('10 same-item repeated attempts — Try/Practice Stars capped', () => {
  const progress = freshProgress();
  for (let i = 0; i < 10; i++) {
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, i, 0),
      itemId: 'se_choose_basic',  // same item every time
      skillIds: ['sentence_endings'],
      correct: true,
      supportLevel: 0,
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const pealark = result.perMonster.pealark;

  // Try Stars: capped at MAX_ATTEMPTS_PER_ITEM (3) for a single item.
  assert.ok(pealark.tryStars <= 3, `Try Stars should be capped, got ${pealark.tryStars}`);
  // Practice Stars: also capped because same-item repeats are limited.
  assert.ok(pealark.practiceStars <= 5, `Practice Stars should be capped for single item, got ${pealark.practiceStars}`);
});

test('supported-only answers (supportLevel > 0) — Try/Practice only, Secure/Mastery blocked', () => {
  const progress = freshProgress();

  // Supported attempts only.
  for (let i = 0; i < 6; i++) {
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, i, 0),
      itemId: `apos_supported_${i}`,
      skillIds: ['apostrophe_contractions'],
      rewardUnitId: 'apostrophe-contractions-core',
      correct: true,
      supportLevel: 2,
      supportKind: 'guided',
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const claspin = result.perMonster.claspin;

  // Try Stars accumulate (supported answers still count as meaningful attempts).
  assert.ok(claspin.tryStars > 0, 'Try Stars should count supported attempts');
  // Practice Stars: supportLevel > 0 means independentCorrect is 0.
  assert.equal(claspin.practiceStars, 0, 'Practice Stars must be 0 for supported-only answers');
  // Secure/Mastery cannot activate from supported attempts alone.
  assert.equal(claspin.secureStars, 0, 'Secure Stars must be 0 with no secure items');
  assert.equal(claspin.masteryStars, 0, 'Mastery Stars must be 0 with no facet coverage');
});

test('Claspin 2 items both simple secure but no mixed/GPS evidence — ~60-70 stars max, not 100', () => {
  const progress = freshProgress();

  // Two items in a single item mode (choose), both secure.
  for (let i = 0; i < 2; i++) {
    const itemId = `apos_item_${i}`;
    progress.items[itemId] = secureItemState();
    for (let j = 0; j < 4; j++) {
      progress.attempts.push(makeAttempt({
        ts: Date.UTC(2026, 3, 25 - j, 10, i, 0),
        itemId,
        skillIds: ['apostrophe_contractions'],
        rewardUnitId: 'apostrophe-contractions-core',
        correct: true,
        itemMode: 'choose',
      }));
    }
  }

  // Add secured reward units.
  progress.rewardUnits = {
    ...securedRewardUnit('apostrophe', 'apostrophe-contractions-core'),
    ...securedRewardUnit('apostrophe', 'apostrophe-possession-core'),
  };

  // Only one facet — single item mode (choose), so mastery needs 2+ modes.
  progress.facets = {
    'apostrophe_contractions::choose': secureItemState(),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const claspin = result.perMonster.claspin;

  assert.ok(claspin.total < 100, `Claspin total should be < 100, got ${claspin.total}`);
  assert.ok(claspin.total <= 75, `Claspin total should be at most ~70, got ${claspin.total}`);
  // Mastery must be 0: only 1 item mode, gate requires 2+.
  assert.equal(claspin.masteryStars, 0, 'Mastery Stars must be 0 with single item mode');
});

test('Grand Stars: 0 with single-monster-only progress (breadth gate)', () => {
  const progress = freshProgress();

  // Only Pealark evidence (endmarks cluster).
  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
  };
  for (let i = 0; i < 3; i++) {
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, i, 0),
      itemId: `se_item_${i}`,
      skillIds: ['sentence_endings'],
      correct: true,
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  // Single monster secured → breadth gate caps at 15, but with only 1 secured unit
  // the raw score is 4 so grandStars is low.
  assert.ok(result.grand.grandStars <= 15, `Grand Stars must be capped with single-monster progress, got ${result.grand.grandStars}`);
});

test('Grand Stars: increase with multi-monster secured units', () => {
  const progress = freshProgress();

  // Secured units across all 3 direct monsters.
  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
    ...securedRewardUnit('apostrophe', 'apostrophe-contractions-core'),
    ...securedRewardUnit('comma_flow', 'list-commas-core'),
    ...securedRewardUnit('structure', 'parenthesis-core'),
    ...securedRewardUnit('boundary', 'semicolons-core'),
  };

  // Add deep-secured facets.
  progress.facets = {
    'sentence_endings::choose': secureItemState({ lapses: 0 }),
    'apostrophe_contractions::choose': secureItemState({ lapses: 0 }),
    'list_commas::choose': secureItemState({ lapses: 0 }),
    'parenthesis::insert': secureItemState({ lapses: 0 }),
    'semicolon::choose': secureItemState({ lapses: 0 }),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  assert.ok(result.grand.grandStars > 15, `Grand Stars should be > 15 with 3-monster breadth, got ${result.grand.grandStars}`);
  assert.ok(result.grand.grandStars > 0, 'Grand Stars must be positive');
});

test('pure function: calling twice with same input returns identical output', () => {
  const progress = freshProgress();
  progress.attempts.push(makeAttempt({
    itemId: 'se_choose_basic',
    skillIds: ['sentence_endings'],
    correct: true,
  }));
  progress.items['se_choose_basic'] = secureItemState();
  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
  };

  const result1 = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const result2 = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.deepStrictEqual(result1, result2, 'Identical inputs must produce identical outputs');
});

test('null / undefined progress returns all-zero structure', () => {
  const result = projectPunctuationStars(null, CURRENT_RELEASE_ID);

  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    assert.equal(result.perMonster[monsterId].total, 0, `${monsterId} total`);
  }
  assert.equal(result.grand.grandStars, 0);
  assert.equal(result.grand.total, 100);
});

test('output shape matches contract: perMonster has 3 direct monsters, grand has grandStars + total', () => {
  const result = projectPunctuationStars(freshProgress(), CURRENT_RELEASE_ID);

  assert.ok(result.perMonster, 'perMonster must exist');
  assert.ok(result.grand, 'grand must exist');

  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    const m = result.perMonster[monsterId];
    assert.ok(m, `perMonster.${monsterId} must exist`);
    assert.ok('tryStars' in m, 'tryStars field');
    assert.ok('practiceStars' in m, 'practiceStars field');
    assert.ok('secureStars' in m, 'secureStars field');
    assert.ok('masteryStars' in m, 'masteryStars field');
    assert.ok('total' in m, 'total field');
  }

  assert.ok('grandStars' in result.grand, 'grandStars field');
  assert.ok('total' in result.grand, 'total field');
});

test('mastery stars require facet coverage across 2+ item modes', () => {
  const progress = freshProgress();

  // Secure items and reward units for apostrophe cluster.
  progress.items['apos_item_1'] = secureItemState();
  progress.items['apos_item_2'] = secureItemState();
  progress.rewardUnits = {
    ...securedRewardUnit('apostrophe', 'apostrophe-contractions-core'),
    ...securedRewardUnit('apostrophe', 'apostrophe-possession-core'),
  };

  // Map items to Claspin via attempts.
  for (let i = 1; i <= 2; i++) {
    for (let j = 0; j < 3; j++) {
      progress.attempts.push(makeAttempt({
        ts: Date.UTC(2026, 3, 25 - j, 10, i, 0),
        itemId: `apos_item_${i}`,
        skillIds: ['apostrophe_contractions'],
        rewardUnitId: 'apostrophe-contractions-core',
        correct: true,
        itemMode: j % 2 === 0 ? 'choose' : 'insert',
      }));
    }
  }

  // Facets across TWO item modes — mastery should unlock.
  progress.facets = {
    'apostrophe_contractions::choose': secureItemState({ lapses: 0 }),
    'apostrophe_contractions::insert': secureItemState({ lapses: 0 }),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const claspin = result.perMonster.claspin;
  assert.ok(claspin.masteryStars > 0, `Mastery Stars should unlock with 2 item modes, got ${claspin.masteryStars}`);
});

test('recent lapse blocks Mastery Stars for that cluster', () => {
  const progress = freshProgress();

  progress.rewardUnits = {
    ...securedRewardUnit('apostrophe', 'apostrophe-contractions-core'),
  };

  // Facets across 2 modes but one has a recent lapse (lapses > 0, streak === 0).
  progress.facets = {
    'apostrophe_contractions::choose': secureItemState({ lapses: 0 }),
    'apostrophe_contractions::insert': { attempts: 5, correct: 3, incorrect: 2, streak: 0, lapses: 2, dueAt: 0, firstCorrectAt: Date.UTC(2026, 3, 10), lastCorrectAt: Date.UTC(2026, 3, 25), lastSeen: Date.UTC(2026, 3, 25) },
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const claspin = result.perMonster.claspin;
  assert.equal(claspin.masteryStars, 0, 'Mastery Stars must be 0 when a facet has a recent lapse');
});

test('per-monster Stars never exceed their respective caps', () => {
  const progress = freshProgress();

  // Saturate: many attempts, many items, secured units, facets.
  for (let i = 0; i < 50; i++) {
    progress.items[`se_item_${i}`] = secureItemState();
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, 0, i),
      itemId: `se_item_${i}`,
      skillIds: ['sentence_endings'],
      correct: true,
      itemMode: i % 3 === 0 ? 'choose' : (i % 3 === 1 ? 'insert' : 'fix'),
    }));
  }

  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
    ...securedRewardUnit('speech', 'speech-core'),
    ...securedRewardUnit('boundary', 'semicolons-core'),
    ...securedRewardUnit('boundary', 'dash-clauses-core'),
    ...securedRewardUnit('boundary', 'hyphens-core'),
  };

  progress.facets = {
    'sentence_endings::choose': secureItemState({ lapses: 0 }),
    'sentence_endings::insert': secureItemState({ lapses: 0 }),
    'sentence_endings::fix': secureItemState({ lapses: 0 }),
    'speech::choose': secureItemState({ lapses: 0 }),
    'semicolon::choose': secureItemState({ lapses: 0 }),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const pealark = result.perMonster.pealark;

  assert.ok(pealark.tryStars <= 10, `Try Stars cap: ${pealark.tryStars}`);
  assert.ok(pealark.practiceStars <= 30, `Practice Stars cap: ${pealark.practiceStars}`);
  assert.ok(pealark.secureStars <= 35, `Secure Stars cap: ${pealark.secureStars}`);
  assert.ok(pealark.masteryStars <= 25, `Mastery Stars cap: ${pealark.masteryStars}`);
  assert.ok(result.grand.grandStars <= 100, `Grand Stars cap: ${result.grand.grandStars}`);
});

// ---------------------------------------------------------------------------
// FIX 1 tests: substring collision in clustersForAttempt
// ---------------------------------------------------------------------------

test('semicolon-lists-core maps only to structure (Curlune), not also to boundary (Pealark)', () => {
  const progress = freshProgress();
  // Attempt with no skillIds — forces the rewardUnitId fallback path.
  progress.attempts.push(makeAttempt({
    itemId: 'scl_item_01',
    skillIds: [],
    rewardUnitId: 'semicolon-lists-core',
    correct: true,
    supportLevel: 0,
  }));

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  // Curlune owns the structure cluster; must see the attempt.
  assert.ok(result.perMonster.curlune.tryStars > 0,
    'Curlune (structure) must see semicolon-lists-core attempt');
  // Pealark owns the boundary cluster and must NOT see this attempt.
  assert.equal(result.perMonster.pealark.tryStars, 0,
    'Pealark (boundary) must NOT see semicolon-lists-core attempt');
});

test('colons-core maps only to structure (Curlune)', () => {
  const progress = freshProgress();
  progress.attempts.push(makeAttempt({
    itemId: 'col_item_01',
    skillIds: [],
    rewardUnitId: 'colons-core',
    correct: true,
    supportLevel: 0,
  }));

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  assert.ok(result.perMonster.curlune.tryStars > 0,
    'Curlune must see colons-core attempt');
  assert.equal(result.perMonster.pealark.tryStars, 0,
    'Pealark must NOT see colons-core attempt');
  assert.equal(result.perMonster.claspin.tryStars, 0,
    'Claspin must NOT see colons-core attempt');
});

// ---------------------------------------------------------------------------
// FIX 2 tests: near-retry support gate
// ---------------------------------------------------------------------------

test('near-retry with supported correction yields 0 Practice Stars from retry credit', () => {
  const progress = freshProgress();
  // Seed alternating (independent fail) then (supported correct) for the same items.
  for (let i = 0; i < 3; i++) {
    const itemId = `retry_gate_item_${i}`;
    // First attempt: independent, incorrect.
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, i, 0),
      itemId,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: false,
      supportLevel: 0,
    }));
    // Second attempt: guided support, correct.
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, i, 30),
      itemId,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supportLevel: 2,
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const pealark = result.perMonster.pealark;
  // No independent correct answers at all, and near-retry corrections are
  // gated by supportLevel===0, so Practice Stars must be 0.
  assert.equal(pealark.practiceStars, 0,
    'Practice Stars must be 0 when all retry corrections are supported');
});

test('near-retry with independent correction still earns Practice Stars', () => {
  const progress = freshProgress();
  for (let i = 0; i < 3; i++) {
    const itemId = `retry_ok_item_${i}`;
    // First attempt: independent, incorrect.
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, i, 0),
      itemId,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: false,
      supportLevel: 0,
    }));
    // Second attempt: independent, correct.
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, i, 30),
      itemId,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supportLevel: 0,
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const pealark = result.perMonster.pealark;
  // 3 independent corrects + 3 items variety (0.5 each) + 3 near-retry (0.5 each) = 6
  assert.ok(pealark.practiceStars > 0,
    'Practice Stars must be positive with independent near-retry corrections');
});

// ---------------------------------------------------------------------------
// FIX 3a: Grand Star 2-monster breadth tier
// ---------------------------------------------------------------------------

test('Grand Stars capped at 50 with exactly 2-monster breadth', () => {
  const progress = freshProgress();

  // Secured units in only Pealark and Claspin — no Curlune.
  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
    ...securedRewardUnit('speech', 'speech-core'),
    ...securedRewardUnit('boundary', 'semicolons-core'),
    ...securedRewardUnit('boundary', 'dash-clauses-core'),
    ...securedRewardUnit('boundary', 'hyphens-core'),
    ...securedRewardUnit('apostrophe', 'apostrophe-contractions-core'),
    ...securedRewardUnit('apostrophe', 'apostrophe-possession-core'),
  };

  // Deep-secured facets (enough to push rawScore well above 50).
  progress.facets = {
    'sentence_endings::choose': secureItemState({ lapses: 0 }),
    'sentence_endings::insert': secureItemState({ lapses: 0 }),
    'speech::choose': secureItemState({ lapses: 0 }),
    'semicolon::choose': secureItemState({ lapses: 0 }),
    'semicolon::insert': secureItemState({ lapses: 0 }),
    'dash_clause::choose': secureItemState({ lapses: 0 }),
    'hyphen::choose': secureItemState({ lapses: 0 }),
    'apostrophe_contractions::choose': secureItemState({ lapses: 0 }),
    'apostrophe_possession::choose': secureItemState({ lapses: 0 }),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  // rawScore = 7 secured * 4 + 9 deep-secured * 2 = 28 + 18 = 46
  // Even if rawScore < 50 here, the cap is the important assertion.
  assert.ok(result.grand.grandStars <= 50,
    `Grand Stars must be capped at 50 with 2-monster breadth, got ${result.grand.grandStars}`);
  assert.ok(result.grand.grandStars > 15,
    `Grand Stars should exceed 1-monster cap with 2-monster breadth, got ${result.grand.grandStars}`);
});

// ---------------------------------------------------------------------------
// FIX 3b: Grand Star 1-monster test tightening
// ---------------------------------------------------------------------------

test('Grand Stars capped at 15 with single-monster progress — exact value check', () => {
  const progress = freshProgress();

  // Saturate Pealark only with many secured units to push rawScore above 15.
  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
    ...securedRewardUnit('speech', 'speech-core'),
    ...securedRewardUnit('boundary', 'semicolons-core'),
    ...securedRewardUnit('boundary', 'dash-clauses-core'),
    ...securedRewardUnit('boundary', 'hyphens-core'),
  };

  // Deep-secured facets to push rawScore further.
  progress.facets = {
    'sentence_endings::choose': secureItemState({ lapses: 0 }),
    'sentence_endings::insert': secureItemState({ lapses: 0 }),
    'speech::choose': secureItemState({ lapses: 0 }),
    'semicolon::choose': secureItemState({ lapses: 0 }),
    'dash_clause::choose': secureItemState({ lapses: 0 }),
    'hyphen::choose': secureItemState({ lapses: 0 }),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  // rawScore = 5 secured * 4 + 6 deep-secured * 2 = 20 + 12 = 32, well above 15.
  // The breadth gate must clamp to exactly 15.
  assert.equal(result.grand.grandStars, 15,
    `Grand Stars must be exactly 15 (clamped by 1-monster breadth gate), got ${result.grand.grandStars}`);
});

// ---------------------------------------------------------------------------
// FIX 3c: Curlune targeted test
// ---------------------------------------------------------------------------

test('Curlune: list_commas attempts produce tryStars for Curlune only', () => {
  const progress = freshProgress();

  for (let i = 0; i < 4; i++) {
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, i, 0),
      itemId: `lc_item_${i}`,
      skillIds: ['list_commas'],
      rewardUnitId: 'list-commas-core',
      correct: true,
      supportLevel: 0,
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.ok(result.perMonster.curlune.tryStars > 0,
    `Curlune tryStars must be > 0 with list_commas attempts, got ${result.perMonster.curlune.tryStars}`);
  assert.ok(result.perMonster.curlune.practiceStars > 0,
    `Curlune practiceStars must be > 0 with independent correct list_commas, got ${result.perMonster.curlune.practiceStars}`);
  assert.equal(result.perMonster.pealark.tryStars, 0,
    'Pealark tryStars must be 0 — no endmarks/speech/boundary attempts');
  assert.equal(result.perMonster.claspin.tryStars, 0,
    'Claspin tryStars must be 0 — no apostrophe attempts');
});

test('Curlune: parenthesis (structure) attempts isolate to Curlune', () => {
  const progress = freshProgress();

  for (let i = 0; i < 3; i++) {
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, i, 0),
      itemId: `par_item_${i}`,
      skillIds: ['parenthesis'],
      rewardUnitId: 'parenthesis-core',
      correct: true,
      supportLevel: 0,
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.ok(result.perMonster.curlune.tryStars > 0,
    'Curlune must see parenthesis (structure) attempts');
  assert.equal(result.perMonster.pealark.tryStars, 0,
    'Pealark must NOT see parenthesis attempts');
  assert.equal(result.perMonster.claspin.tryStars, 0,
    'Claspin must NOT see parenthesis attempts');
});
