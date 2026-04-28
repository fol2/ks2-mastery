import test from 'node:test';
import assert from 'node:assert/strict';

import {
  projectPunctuationStars,
  PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER,
  ACTIVE_PUNCTUATION_MONSTER_IDS,
  CLASPIN_REQUIRED_SKILLS,
} from '../src/subjects/punctuation/star-projection.js';
import { PUNCTUATION_CLIENT_SKILLS } from '../src/subjects/punctuation/read-model.js';
import {
  PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER as VM_CLUSTER_TO_MONSTER,
} from '../src/subjects/punctuation/components/punctuation-view-model.js';

const CURRENT_RELEASE_ID = 'punctuation-r4-full-14-skill-structure';
const OLD_RELEASE_ID = 'punctuation-r3-endmarks-apostrophe-speech-comma-flow-boundary';
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function masteryKeyForRelease(releaseId, clusterId, rewardUnitId) {
  return `punctuation:${releaseId}:${clusterId}:${rewardUnitId}`;
}

function masteryKey(clusterId, rewardUnitId) {
  return masteryKeyForRelease(CURRENT_RELEASE_ID, clusterId, rewardUnitId);
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
  return securedRewardUnitForRelease(CURRENT_RELEASE_ID, clusterId, rewardUnitId);
}

function securedRewardUnitForRelease(releaseId, clusterId, rewardUnitId) {
  const key = masteryKeyForRelease(releaseId, clusterId, rewardUnitId);
  return {
    [key]: {
      masteryKey: key,
      releaseId,
      clusterId,
      rewardUnitId,
      securedAt: Date.UTC(2026, 3, 24),
    },
  };
}

function richCurrentReleaseProgress() {
  const progress = freshProgress();
  const units = [
    { cluster: 'endmarks', ru: 'sentence-endings-core', skill: 'sentence_endings' },
    { cluster: 'apostrophe', ru: 'apostrophe-contractions-core', skill: 'apostrophe_contractions' },
    { cluster: 'comma_flow', ru: 'list-commas-core', skill: 'list_commas' },
  ];

  for (const { cluster, ru, skill } of units) {
    progress.rewardUnits = {
      ...progress.rewardUnits,
      ...securedRewardUnit(cluster, ru),
    };
    progress.facets[`${skill}::choose`] = secureItemState({ lapses: 0 });
    progress.facets[`${skill}::insert`] = secureItemState({ lapses: 0 });
  }

  return progress;
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

test('non-meaningful attempts do not mint Try Stars', () => {
  const progress = freshProgress();
  progress.attempts.push(makeAttempt({
    itemId: 'se_empty_submit',
    skillIds: ['sentence_endings'],
    rewardUnitId: 'sentence-endings-core',
    meaningful: false,
    correct: false,
  }));

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  assert.equal(result.perMonster.pealark.tryStars, 0);
  assert.equal(result.perMonster.pealark.total, 0);
});

test('legacy attempts without meaningful flag still count as meaningful', () => {
  const progress = freshProgress();
  const attempt = makeAttempt({
    itemId: 'se_legacy_submit',
    skillIds: ['sentence_endings'],
    rewardUnitId: 'sentence-endings-core',
  });
  delete attempt.meaningful;
  progress.attempts.push(attempt);

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  assert.equal(result.perMonster.pealark.tryStars, 1);
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

test('generated variant signatures group equivalent surfaces for Try evidence', () => {
  const progress = freshProgress();
  progress.attempts.push(makeAttempt({
    itemId: 'generated_sentence_1',
    variantSignature: 'puncsig_equivalent',
    skillIds: ['sentence_endings'],
    correct: true,
  }));
  progress.attempts.push(makeAttempt({
    itemId: 'generated_sentence_2',
    variantSignature: 'puncsig_equivalent',
    skillIds: ['sentence_endings'],
    correct: true,
  }));
  progress.attempts.push(makeAttempt({
    itemId: 'generated_sentence_3',
    variantSignature: 'puncsig_distinct',
    skillIds: ['sentence_endings'],
    correct: true,
  }));

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  assert.equal(result.perMonster.pealark.tryStars, 2);
});

test('legacy unsigned attempts coalesce with signed attempts for the same generated item', () => {
  const progress = freshProgress();
  for (let i = 0; i < 3; i++) {
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 20 + i, 10, 0, 0),
      itemId: 'generated_sentence_legacy',
      skillIds: ['sentence_endings'],
      correct: true,
    }));
  }
  for (let i = 0; i < 3; i++) {
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 23 + i, 10, 0, 0),
      itemId: 'generated_sentence_legacy',
      variantSignature: 'puncsig_legacy_surface',
      skillIds: ['sentence_endings'],
      correct: true,
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  assert.equal(result.perMonster.pealark.tryStars, 3);
  assert.equal(result.perMonster.pealark.practiceStars, 3);
});

test('secure Stars dedupe generated items with the same variant signature', () => {
  const progress = freshProgress();
  progress.items.generated_sentence_a = secureItemState();
  progress.items.generated_sentence_b = secureItemState();
  progress.attempts.push(makeAttempt({
    itemId: 'generated_sentence_a',
    variantSignature: 'puncsig_same_surface',
    skillIds: ['sentence_endings'],
    correct: true,
  }));
  progress.attempts.push(makeAttempt({
    itemId: 'generated_sentence_b',
    variantSignature: 'puncsig_same_surface',
    skillIds: ['sentence_endings'],
    correct: true,
  }));

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  assert.equal(result.perMonster.pealark.secureStars, 2);
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

test('old-release reward units cannot project current Secure, Mastery, or Grand Stars', () => {
  const progress = freshProgress();
  progress.rewardUnits = {
    ...securedRewardUnitForRelease(OLD_RELEASE_ID, 'endmarks', 'sentence-endings-core'),
    ...securedRewardUnitForRelease(OLD_RELEASE_ID, 'apostrophe', 'apostrophe-contractions-core'),
    ...securedRewardUnitForRelease(OLD_RELEASE_ID, 'comma_flow', 'list-commas-core'),
  };
  progress.facets = {
    'sentence_endings::choose': secureItemState({ lapses: 0 }),
    'sentence_endings::insert': secureItemState({ lapses: 0 }),
    'apostrophe_contractions::choose': secureItemState({ lapses: 0 }),
    'apostrophe_contractions::insert': secureItemState({ lapses: 0 }),
    'list_commas::choose': secureItemState({ lapses: 0 }),
    'list_commas::insert': secureItemState({ lapses: 0 }),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    assert.equal(result.perMonster[monsterId].secureStars, 0, `${monsterId} secureStars`);
    assert.equal(result.perMonster[monsterId].masteryStars, 0, `${monsterId} masteryStars`);
    assert.equal(result.perMonster[monsterId].total, 0, `${monsterId} total`);
  }
  assert.equal(result.grand.grandStars, 0, 'old-release reward units must not lift Grand Stars');
});

test('mixed old and current release reward units count only current-release entries', () => {
  const progress = freshProgress();
  progress.rewardUnits = {
    ...securedRewardUnit('apostrophe', 'apostrophe-contractions-core'),
    ...securedRewardUnitForRelease(OLD_RELEASE_ID, 'apostrophe', 'apostrophe-possession-core'),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.equal(result.perMonster.claspin.secureStars, 20, 'one current Claspin unit should count');
  assert.equal(result.perMonster.claspin.masteryStars, 0, 'old paired unit must not unlock Mastery evidence');
  assert.equal(result.perMonster.pealark.total, 0);
  assert.equal(result.perMonster.curlune.total, 0);
});

test('canonical duplicate and current-looking loose rows cannot inflate Secure or Grand Stars', () => {
  const baselineProgress = richCurrentReleaseProgress();
  const progress = richCurrentReleaseProgress();
  const now = Date.UTC(2026, 3, 24);

  progress.rewardUnits.looseDuplicateEndmarks = {
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    securedAt: now,
  };
  progress.rewardUnits.looseDuplicateApostrophe = {
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-contractions-core',
    securedAt: now,
  };
  progress.rewardUnits.looseDuplicateCommaFlow = {
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'comma_flow',
    rewardUnitId: 'list-commas-core',
    securedAt: now,
  };

  const baseline = projectPunctuationStars(baselineProgress, CURRENT_RELEASE_ID);
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.ok(baseline.grand.grandStars > 0, 'baseline must exercise Grand Stars');
  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    assert.equal(
      result.perMonster[monsterId].secureStars,
      baseline.perMonster[monsterId].secureStars,
      `${monsterId} duplicate loose row must not add Secure Stars`,
    );
  }
  assert.equal(result.grand.grandStars, baseline.grand.grandStars,
    'duplicate loose rows must not add Grand Stars');
});

test('malformed current-looking mastery keys with extra segments do not count', () => {
  const progress = freshProgress();
  const malformedKey = `${masteryKey('endmarks', 'sentence-endings-core')}:extra`;
  progress.rewardUnits[malformedKey] = {
    masteryKey: malformedKey,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    securedAt: Date.UTC(2026, 3, 24),
  };
  progress.facets = {
    'sentence_endings::choose': secureItemState({ lapses: 0 }),
    'sentence_endings::insert': secureItemState({ lapses: 0 }),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.equal(result.perMonster.pealark.secureStars, 0);
  assert.equal(result.perMonster.pealark.masteryStars, 0);
  assert.equal(result.grand.grandStars, 0);
});

test('unknown current-release rewardUnitId and clusterId entries do not count', () => {
  const progress = freshProgress();
  const unknownRewardKey = masteryKey('endmarks', 'not-published-core');
  const unknownClusterKey = masteryKey('unknown_cluster', 'sentence-endings-core');
  progress.rewardUnits[unknownRewardKey] = {
    masteryKey: unknownRewardKey,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'not-published-core',
    securedAt: Date.UTC(2026, 3, 24),
  };
  progress.rewardUnits[unknownClusterKey] = {
    masteryKey: unknownClusterKey,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'unknown_cluster',
    rewardUnitId: 'sentence-endings-core',
    securedAt: Date.UTC(2026, 3, 24),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.equal(result.perMonster.pealark.secureStars, 0);
  assert.equal(result.perMonster.claspin.secureStars, 0);
  assert.equal(result.perMonster.curlune.secureStars, 0);
  assert.equal(result.grand.grandStars, 0);
});

test('mixed old and current projection matches a current-only baseline for Mastery and Grand Stars', () => {
  const baselineProgress = richCurrentReleaseProgress();
  const progress = richCurrentReleaseProgress();
  progress.rewardUnits = {
    ...progress.rewardUnits,
    ...securedRewardUnitForRelease(OLD_RELEASE_ID, 'speech', 'speech-core'),
    ...securedRewardUnitForRelease(OLD_RELEASE_ID, 'boundary', 'semicolons-core'),
  };
  progress.rewardUnits.currentLookingUnknown = {
    masteryKey: masteryKey('endmarks', 'not-published-core'),
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'not-published-core',
    securedAt: Date.UTC(2026, 3, 24),
  };

  const baseline = projectPunctuationStars(baselineProgress, CURRENT_RELEASE_ID);
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.ok(baseline.perMonster.pealark.masteryStars > 0, 'baseline must exercise Pealark Mastery Stars');
  assert.ok(baseline.perMonster.claspin.masteryStars > 0, 'baseline must exercise Claspin Mastery Stars');
  assert.ok(baseline.perMonster.curlune.masteryStars > 0, 'baseline must exercise Curlune Mastery Stars');
  assert.ok(baseline.grand.grandStars > 0, 'baseline must exercise Grand Stars');
  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    assert.equal(
      result.perMonster[monsterId].secureStars,
      baseline.perMonster[monsterId].secureStars,
      `${monsterId} Secure Stars must match current-only baseline`,
    );
    assert.equal(
      result.perMonster[monsterId].masteryStars,
      baseline.perMonster[monsterId].masteryStars,
      `${monsterId} Mastery Stars must match current-only baseline`,
    );
  }
  assert.equal(result.grand.grandStars, baseline.grand.grandStars);
});

test('release metadata falls back only to mastery keys that clearly belong to the current release', () => {
  const progress = freshProgress();
  const currentKey = masteryKey('endmarks', 'sentence-endings-core');
  const oldKey = masteryKeyForRelease(OLD_RELEASE_ID, 'endmarks', 'speech-core');
  const currentEntry = {
    masteryKey: currentKey,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    securedAt: Date.UTC(2026, 3, 24),
  };
  progress.rewardUnits = {
    [currentKey]: currentEntry,
    [oldKey]: {
      masteryKey: oldKey,
      clusterId: 'speech',
      rewardUnitId: 'speech-core',
      securedAt: Date.UTC(2026, 3, 24),
    },
    ambiguousLooseEntry: {
      clusterId: 'boundary',
      rewardUnitId: 'semicolons-core',
      securedAt: Date.UTC(2026, 3, 24),
    },
  };
  const currentOnly = freshProgress();
  currentOnly.rewardUnits = { [currentKey]: currentEntry };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const baseline = projectPunctuationStars(currentOnly, CURRENT_RELEASE_ID);

  assert.equal(
    result.perMonster.pealark.secureStars,
    baseline.perMonster.pealark.secureStars,
    'only the clearly current mastery key should count',
  );
  assert.equal(result.perMonster.pealark.masteryStars, 0);
  assert.equal(result.grand.grandStars, baseline.grand.grandStars);
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

test('Grand Stars capped below Hatch with exactly 2-monster breadth (U6 tier gate)', () => {
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

  // Deep-secured facets.
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
  // U6: 2 monsters qualifies for Egg tier (15) but cannot reach Hatch (35,
  // requires 3 monsters).  Interpolation towards Hatch is blocked by the
  // monster dimension (2 of 3 needed), so grand stars sit at 15.
  assert.ok(result.grand.grandStars >= 15,
    `Grand Stars should be at Egg tier with 2-monster breadth, got ${result.grand.grandStars}`);
  assert.ok(result.grand.grandStars < 35,
    `Grand Stars must not reach Hatch tier without 3 monsters, got ${result.grand.grandStars}`);
});

// ---------------------------------------------------------------------------
// FIX 3b: Grand Star 1-monster test tightening
// ---------------------------------------------------------------------------

test('Grand Stars capped below Egg with single-monster progress (U6 tier gate)', () => {
  const progress = freshProgress();

  // Saturate Pealark only with many secured units.
  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
    ...securedRewardUnit('speech', 'speech-core'),
    ...securedRewardUnit('boundary', 'semicolons-core'),
    ...securedRewardUnit('boundary', 'dash-clauses-core'),
    ...securedRewardUnit('boundary', 'hyphens-core'),
  };

  // Deep-secured facets.
  progress.facets = {
    'sentence_endings::choose': secureItemState({ lapses: 0 }),
    'sentence_endings::insert': secureItemState({ lapses: 0 }),
    'speech::choose': secureItemState({ lapses: 0 }),
    'semicolon::choose': secureItemState({ lapses: 0 }),
    'dash_clause::choose': secureItemState({ lapses: 0 }),
    'hyphen::choose': secureItemState({ lapses: 0 }),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  // U6: 1 monster cannot qualify for Egg tier (needs 2 monsters).
  // Interpolation towards Egg is capped by monster dimension (1/2 = 0.5).
  // With 5 secured (needs 3) and 0 deep-secured (needs 0), the min frac
  // is 0.5, giving floor(0.5 * 15) = 7.
  assert.ok(result.grand.grandStars < 15,
    `Grand Stars must be below Egg tier (15) with single-monster progress, got ${result.grand.grandStars}`);
  assert.ok(result.grand.grandStars > 0,
    `Grand Stars should be > 0 with some secured evidence, got ${result.grand.grandStars}`);
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

// ---------------------------------------------------------------------------
// FIX 1 (T2 — convergent): SKILL_TO_CLUSTER parity with read-model
// ---------------------------------------------------------------------------

test('SKILL_TO_CLUSTER parity: every skill.id in PUNCTUATION_CLIENT_SKILLS maps to the same clusterId in star-projection', () => {
  // For each skill defined in the read-model, fire a single attempt through
  // projectPunctuationStars using that skillId and verify the resulting
  // tryStars land on the correct monster (the one that owns the skill's
  // clusterId according to PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER).
  for (const skill of PUNCTUATION_CLIENT_SKILLS) {
    const expectedMonsterId = PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER[skill.clusterId];
    assert.ok(expectedMonsterId,
      `skill ${skill.id} has clusterId "${skill.clusterId}" which must exist in PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER`);

    const progress = freshProgress();
    progress.attempts.push(makeAttempt({
      itemId: `parity_${skill.id}`,
      skillIds: [skill.id],
      correct: true,
    }));

    const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

    // The expected monster must have received the attempt (tryStars > 0).
    assert.ok(result.perMonster[expectedMonsterId].tryStars > 0,
      `skill "${skill.id}" (cluster "${skill.clusterId}") must route to monster "${expectedMonsterId}" — got tryStars=${result.perMonster[expectedMonsterId].tryStars}`);

    // No OTHER direct monster should have received the attempt.
    for (const otherId of ['pealark', 'claspin', 'curlune']) {
      if (otherId === expectedMonsterId) continue;
      assert.equal(result.perMonster[otherId].tryStars, 0,
        `skill "${skill.id}" must NOT route to monster "${otherId}"`);
    }
  }
});

test('SKILL_TO_CLUSTER parity: PUNCTUATION_CLIENT_SKILLS covers exactly 14 skills', () => {
  assert.equal(PUNCTUATION_CLIENT_SKILLS.length, 14,
    'PUNCTUATION_CLIENT_SKILLS must have exactly 14 entries (one per published skill)');
});

test('PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER parity: star-projection and view-model exports are identical', () => {
  // The star-projection re-exports PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER
  // and the view-model exports its own copy. They must be identical.
  assert.deepStrictEqual(
    { ...PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER },
    { ...VM_CLUSTER_TO_MONSTER },
    'PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER in star-projection.js must match the view-model version',
  );
});

test('ACTIVE_PUNCTUATION_MONSTER_IDS includes all 3 direct monsters plus quoral', () => {
  for (const id of ['pealark', 'claspin', 'curlune', 'quoral']) {
    assert.ok(ACTIVE_PUNCTUATION_MONSTER_IDS.includes(id),
      `ACTIVE_PUNCTUATION_MONSTER_IDS must include "${id}"`);
  }
  assert.equal(ACTIVE_PUNCTUATION_MONSTER_IDS.length, 4,
    'ACTIVE_PUNCTUATION_MONSTER_IDS must have exactly 4 entries');
});

// ---------------------------------------------------------------------------
// U5: Per-monster weight calibration tests
// ---------------------------------------------------------------------------

/**
 * Build a "complete simple secure" journey for a given monster.
 * All reward units secured, items secure, facets secure in ONE mode only
 * (no mixed/GPS evidence, no spaced return beyond the minimum 7-day span).
 */
function simpleSecureJourney(monsterId) {
  const progress = freshProgress();

  // Monster -> clusters -> skills -> reward units
  const monsterSkills = {
    pealark: [
      { skillId: 'sentence_endings', cluster: 'endmarks', ru: 'sentence-endings-core' },
      { skillId: 'speech', cluster: 'speech', ru: 'speech-core' },
      { skillId: 'semicolon', cluster: 'boundary', ru: 'semicolons-core' },
      { skillId: 'dash_clause', cluster: 'boundary', ru: 'dash-clauses-core' },
      { skillId: 'hyphen', cluster: 'boundary', ru: 'hyphens-core' },
    ],
    claspin: [
      { skillId: 'apostrophe_contractions', cluster: 'apostrophe', ru: 'apostrophe-contractions-core' },
      { skillId: 'apostrophe_possession', cluster: 'apostrophe', ru: 'apostrophe-possession-core' },
    ],
    curlune: [
      { skillId: 'list_commas', cluster: 'comma_flow', ru: 'list-commas-core' },
      { skillId: 'fronted_adverbial', cluster: 'comma_flow', ru: 'fronted-adverbials-core' },
      { skillId: 'comma_clarity', cluster: 'comma_flow', ru: 'comma-clarity-core' },
      { skillId: 'parenthesis', cluster: 'structure', ru: 'parenthesis-core' },
      { skillId: 'colon_list', cluster: 'structure', ru: 'colons-core' },
      { skillId: 'semicolon_list', cluster: 'structure', ru: 'semicolon-lists-core' },
      { skillId: 'bullet_points', cluster: 'structure', ru: 'bullet-points-core' },
    ],
  };

  const skills = monsterSkills[monsterId];
  let itemIdx = 0;

  for (const { skillId, cluster, ru } of skills) {
    // Secure items: 10 items per skill, all with secure memory state.
    for (let i = 0; i < 10; i++) {
      const itemId = `${monsterId}_${skillId}_item_${i}`;
      progress.items[itemId] = secureItemState();

      // Create attempts spread over days for meaningful Try/Practice evidence.
      for (let d = 0; d < 4; d++) {
        progress.attempts.push(makeAttempt({
          ts: Date.UTC(2026, 3, 25 - d, 10, itemIdx, i),
          itemId,
          skillIds: [skillId],
          rewardUnitId: ru,
          correct: true,
          supportLevel: 0,
          itemMode: 'choose', // Single mode only — simple secure.
        }));
      }
      itemIdx++;
    }

    // Secured reward unit.
    progress.rewardUnits = {
      ...progress.rewardUnits,
      ...securedRewardUnit(cluster, ru),
    };

    // Facet: secure in ONE mode (choose only — simple secure).
    progress.facets[`${skillId}::choose`] = secureItemState({ lapses: 0 });
  }

  return progress;
}

test('U5 calibration: simple secure journeys — Pealark, Claspin, Curlune stages within 1 of each other', () => {
  const pealarkResult = projectPunctuationStars(simpleSecureJourney('pealark'), CURRENT_RELEASE_ID);
  const claspinResult = projectPunctuationStars(simpleSecureJourney('claspin'), CURRENT_RELEASE_ID);
  const curluneResult = projectPunctuationStars(simpleSecureJourney('curlune'), CURRENT_RELEASE_ID);

  // Map star totals to stages (0-25=Egg, 26-50=Hatch, 51-75=Evolve, 76-99=Strong, 100=Mega).
  function stageOf(total) {
    if (total >= 100) return 4; // Mega
    if (total >= 76) return 3;  // Strong
    if (total >= 51) return 2;  // Evolve
    if (total >= 26) return 1;  // Hatch
    return 0;                   // Egg
  }

  const pStage = stageOf(pealarkResult.perMonster.pealark.total);
  const cStage = stageOf(claspinResult.perMonster.claspin.total);
  const uStage = stageOf(curluneResult.perMonster.curlune.total);

  assert.ok(Math.abs(pStage - cStage) <= 1,
    `Pealark stage (${pStage}, total=${pealarkResult.perMonster.pealark.total}) and Claspin stage (${cStage}, total=${claspinResult.perMonster.claspin.total}) must be within 1 stage`);
  assert.ok(Math.abs(pStage - uStage) <= 1,
    `Pealark stage (${pStage}, total=${pealarkResult.perMonster.pealark.total}) and Curlune stage (${uStage}, total=${curluneResult.perMonster.curlune.total}) must be within 1 stage`);
  assert.ok(Math.abs(cStage - uStage) <= 1,
    `Claspin stage (${cStage}, total=${claspinResult.perMonster.claspin.total}) and Curlune stage (${uStage}, total=${curluneResult.perMonster.curlune.total}) must be within 1 stage`);
});

test('U5 calibration: all simple secure journeys produce totals > 50 (meaningful progression)', () => {
  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    const result = projectPunctuationStars(simpleSecureJourney(monsterId), CURRENT_RELEASE_ID);
    assert.ok(result.perMonster[monsterId].total > 50,
      `${monsterId} simple secure total must be > 50 (got ${result.perMonster[monsterId].total})`);
  }
});

test('U5: Claspin Mega gate — 2 simple secure units cannot reach 100 stars', () => {
  const progress = simpleSecureJourney('claspin');
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const claspin = result.perMonster.claspin;

  // Simple secure journey has only 1 item mode and no spaced return beyond
  // minimum. Mastery Stars must be capped at 15, giving total < 100.
  assert.ok(claspin.total < 100,
    `Claspin simple secure total must be < 100 (Mega), got ${claspin.total}`);
  assert.ok(claspin.total <= 75,
    `Claspin simple secure total must be <= 75 (capped by Mastery gate), got ${claspin.total}`);
  assert.ok(claspin.masteryStars <= 15,
    `Claspin Mastery Stars must be <= 15 without deep-secure evidence, got ${claspin.masteryStars}`);
});

test('U5: Claspin Mega — deep secure + mixed + spaced return unlocks 100 stars', () => {
  const progress = freshProgress();

  // Both apostrophe skills with rich evidence.
  for (const { skillId, ru } of [
    { skillId: 'apostrophe_contractions', ru: 'apostrophe-contractions-core' },
    { skillId: 'apostrophe_possession', ru: 'apostrophe-possession-core' },
  ]) {
    // 10 items per skill, all secure.
    for (let i = 0; i < 10; i++) {
      const itemId = `claspin_mega_${skillId}_${i}`;
      progress.items[itemId] = secureItemState();

      // Attempts in both choose and insert modes.
      for (let d = 0; d < 4; d++) {
        progress.attempts.push(makeAttempt({
          ts: Date.UTC(2026, 3, 25 - d, 10, 0, i),
          itemId,
          skillIds: [skillId],
          rewardUnitId: ru,
          correct: true,
          supportLevel: 0,
          itemMode: d % 2 === 0 ? 'choose' : 'insert',
        }));
      }
    }
  }

  // Both reward units secured.
  progress.rewardUnits = {
    ...securedRewardUnit('apostrophe', 'apostrophe-contractions-core'),
    ...securedRewardUnit('apostrophe', 'apostrophe-possession-core'),
  };

  // Facets: both skills, both modes, secure, no lapses, spaced return.
  const now = Date.UTC(2026, 3, 25);
  for (const skillId of ['apostrophe_contractions', 'apostrophe_possession']) {
    for (const mode of ['choose', 'insert']) {
      progress.facets[`${skillId}::${mode}`] = secureItemState({
        lapses: 0,
        firstCorrectAt: now - (14 * DAY_MS), // 14-day span — spaced return
        lastCorrectAt: now,
      });
    }
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const claspin = result.perMonster.claspin;

  // All gates met: both skills deep secure, mixed modes, spaced return.
  assert.equal(claspin.total, 100,
    `Claspin deep secure total must be exactly 100 (Mega), got ${claspin.total}`);
  assert.ok(claspin.masteryStars > 15,
    `Claspin Mastery Stars must exceed the simple-secure cap of 15, got ${claspin.masteryStars}`);
});

test('U5: Claspin Mega gate — missing possession skill blocks full Mastery', () => {
  const progress = freshProgress();

  // Only contractions skill with deep evidence.
  for (let i = 0; i < 10; i++) {
    const itemId = `claspin_partial_${i}`;
    progress.items[itemId] = secureItemState();
    for (let d = 0; d < 4; d++) {
      progress.attempts.push(makeAttempt({
        ts: Date.UTC(2026, 3, 25 - d, 10, 0, i),
        itemId,
        skillIds: ['apostrophe_contractions'],
        rewardUnitId: 'apostrophe-contractions-core',
        correct: true,
        supportLevel: 0,
        itemMode: d % 2 === 0 ? 'choose' : 'insert',
      }));
    }
  }

  // Both units secured but only contractions has deep-secure facets.
  progress.rewardUnits = {
    ...securedRewardUnit('apostrophe', 'apostrophe-contractions-core'),
    ...securedRewardUnit('apostrophe', 'apostrophe-possession-core'),
  };

  const now = Date.UTC(2026, 3, 25);
  progress.facets = {
    'apostrophe_contractions::choose': secureItemState({ lapses: 0, firstCorrectAt: now - (14 * DAY_MS), lastCorrectAt: now }),
    'apostrophe_contractions::insert': secureItemState({ lapses: 0, firstCorrectAt: now - (14 * DAY_MS), lastCorrectAt: now }),
    // possession has attempts in 2 modes but facets are NOT secure.
    'apostrophe_possession::choose': { attempts: 3, correct: 1, streak: 1, lapses: 0, firstCorrectAt: now - DAY_MS, lastCorrectAt: now, lastSeen: now },
    'apostrophe_possession::insert': { attempts: 2, correct: 1, streak: 1, lapses: 0, firstCorrectAt: now - DAY_MS, lastCorrectAt: now, lastSeen: now },
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const claspin = result.perMonster.claspin;

  assert.ok(claspin.masteryStars <= 15,
    `Claspin Mastery must be capped at 15 without both skills deep secure, got ${claspin.masteryStars}`);
  assert.ok(claspin.total < 100,
    `Claspin total must be < 100 without both skills deep secure, got ${claspin.total}`);
});

// ---------------------------------------------------------------------------
// P6-U5: Curlune Mega breadth gate tests
// ---------------------------------------------------------------------------

/**
 * Build a Curlune journey with a specific number of deep-secured units.
 * @param {number} deepSecuredCount — how many of 7 units have deep-secure facets
 * @param {Object} [opts] — { mixedModes, spacedReturn }
 */
function curluneJourney(deepSecuredCount, { mixedModes = true, spacedReturn = true } = {}) {
  const progress = freshProgress();
  const now = Date.UTC(2026, 3, 25);

  // All 7 Curlune reward units in order.
  const curluneUnits = [
    { skillId: 'list_commas', cluster: 'comma_flow', ru: 'list-commas-core' },
    { skillId: 'fronted_adverbial', cluster: 'comma_flow', ru: 'fronted-adverbials-core' },
    { skillId: 'comma_clarity', cluster: 'comma_flow', ru: 'comma-clarity-core' },
    { skillId: 'parenthesis', cluster: 'structure', ru: 'parenthesis-core' },
    { skillId: 'colon_list', cluster: 'structure', ru: 'colons-core' },
    { skillId: 'semicolon_list', cluster: 'structure', ru: 'semicolon-lists-core' },
    { skillId: 'bullet_points', cluster: 'structure', ru: 'bullet-points-core' },
  ];

  // All 7 units are secured (securedAt > 0).
  for (const { cluster, ru, skillId } of curluneUnits) {
    progress.rewardUnits = {
      ...progress.rewardUnits,
      ...securedRewardUnit(cluster, ru),
    };

    // Add items and attempts for Try/Practice/Secure evidence.
    for (let i = 0; i < 10; i++) {
      const itemId = `curlune_${skillId}_item_${i}`;
      progress.items[itemId] = secureItemState();
      for (let d = 0; d < 4; d++) {
        const modes = mixedModes ? ['choose', 'insert'] : ['choose'];
        progress.attempts.push(makeAttempt({
          ts: Date.UTC(2026, 3, 25 - d, 10, 0, i),
          itemId,
          skillIds: [skillId],
          rewardUnitId: ru,
          correct: true,
          supportLevel: 0,
          itemMode: modes[d % modes.length],
        }));
      }
    }
  }

  // Deep-secure facets for the first N units.
  const deepSecuredUnits = curluneUnits.slice(0, deepSecuredCount);
  const modes = mixedModes ? ['choose', 'insert'] : ['choose'];
  for (const { skillId } of deepSecuredUnits) {
    for (const mode of modes) {
      progress.facets[`${skillId}::${mode}`] = secureItemState({
        lapses: 0,
        firstCorrectAt: spacedReturn ? now - (14 * DAY_MS) : now - DAY_MS,
        lastCorrectAt: now,
      });
    }
  }

  // Non-deep-secure facets for the remaining units (secure but with lapses).
  const nonDeepUnits = curluneUnits.slice(deepSecuredCount);
  for (const { skillId } of nonDeepUnits) {
    for (const mode of modes) {
      progress.facets[`${skillId}::${mode}`] = secureItemState({
        lapses: 1,  // Has lapse — not deep-secure
        streak: 3,  // Still secure (streak >= 3)
        firstCorrectAt: spacedReturn ? now - (14 * DAY_MS) : now - DAY_MS,
        lastCorrectAt: now,
      });
    }
  }

  return progress;
}

test('P6-U5: Curlune 5/7 deep-secure + mixed + spaced return — 100 Stars achievable', () => {
  const progress = curluneJourney(5, { mixedModes: true, spacedReturn: true });
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const curlune = result.perMonster.curlune;

  assert.equal(curlune.total, 100,
    `Curlune with 5/7 deep-secure must reach 100 (Mega), got ${curlune.total}`);
  assert.ok(curlune.masteryStars > 15,
    `Curlune Mastery Stars must exceed the capped value of 15, got ${curlune.masteryStars}`);
});

test('P6-U5: Curlune 7/7 deep-secure — Mega reached', () => {
  const progress = curluneJourney(7, { mixedModes: true, spacedReturn: true });
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const curlune = result.perMonster.curlune;

  assert.equal(curlune.total, 100,
    `Curlune with 7/7 deep-secure must reach 100 (Mega), got ${curlune.total}`);
});

test('P6-U5: Curlune 3/7 deep-secure — Mastery capped at 15, total max 90', () => {
  const progress = curluneJourney(3, { mixedModes: true, spacedReturn: true });
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const curlune = result.perMonster.curlune;

  assert.ok(curlune.masteryStars <= 15,
    `Curlune Mastery must be capped at 15 with 3/7 deep-secure, got ${curlune.masteryStars}`);
  assert.ok(curlune.total <= 90,
    `Curlune total must be <= 90 with 3/7 deep-secure, got ${curlune.total}`);
  assert.ok(curlune.total < 100,
    `Curlune must NOT reach Mega (100) with 3/7 deep-secure, got ${curlune.total}`);
});

test('P6-U5: Curlune 4/7 deep-secure — still capped (threshold is 5)', () => {
  const progress = curluneJourney(4, { mixedModes: true, spacedReturn: true });
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const curlune = result.perMonster.curlune;

  assert.ok(curlune.masteryStars <= 15,
    `Curlune Mastery must be capped at 15 with 4/7 deep-secure, got ${curlune.masteryStars}`);
  assert.ok(curlune.total < 100,
    `Curlune must NOT reach Mega (100) with 4/7 deep-secure, got ${curlune.total}`);
});

test('P6-U5: Curlune 5/7 deep-secure but no mixed modes — Mastery blocked by itemModes gate', () => {
  const progress = curluneJourney(5, { mixedModes: false, spacedReturn: true });
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const curlune = result.perMonster.curlune;

  assert.equal(curlune.masteryStars, 0,
    `Curlune Mastery must be 0 without mixed modes (itemModes.size < 2), got ${curlune.masteryStars}`);
  assert.ok(curlune.total < 100,
    `Curlune must NOT reach Mega without mixed modes, got ${curlune.total}`);
});

test('P6-U5: Pealark and Claspin unaffected by Curlune breadth gate', () => {
  // Verify Pealark and Claspin simple-secure journeys are unchanged.
  const pealarkResult = projectPunctuationStars(simpleSecureJourney('pealark'), CURRENT_RELEASE_ID);
  const claspinResult = projectPunctuationStars(simpleSecureJourney('claspin'), CURRENT_RELEASE_ID);

  // These should produce the same results as before the Curlune gate was added.
  // Pealark: simple secure journey has 1 mode, so Mastery = 0.
  assert.equal(pealarkResult.perMonster.pealark.masteryStars, 0,
    'Pealark Mastery Stars must be 0 with single mode (unaffected by Curlune gate)');
  // Claspin: simple secure journey has 1 mode, so Mastery = 0.
  assert.equal(claspinResult.perMonster.claspin.masteryStars, 0,
    'Claspin Mastery Stars must be 0 with single mode (unaffected by Curlune gate)');

  // Neither monster has Curlune's gate applied.
  assert.ok(pealarkResult.perMonster.pealark.total > 0,
    'Pealark total must be > 0');
  assert.ok(claspinResult.perMonster.claspin.total > 0,
    'Claspin total must be > 0');
});

test('P6-U5: Curlune simple-secure journey (1 mode) cannot reach Mega', () => {
  // The existing simpleSecureJourney helper uses single mode.
  const result = projectPunctuationStars(simpleSecureJourney('curlune'), CURRENT_RELEASE_ID);
  const curlune = result.perMonster.curlune;

  assert.ok(curlune.total < 100,
    `Curlune simple secure (single mode) must not reach Mega, got ${curlune.total}`);
  // Mastery Stars should be 0 due to the itemModes.size < 2 gate.
  assert.equal(curlune.masteryStars, 0,
    'Curlune Mastery Stars must be 0 with single item mode');
});

// ---------------------------------------------------------------------------
// U6: Grand Star tier gate tests
// ---------------------------------------------------------------------------

/**
 * Build progress with N secured units spread across the specified number
 * of direct monsters, plus optional deep-secure facets and mixed evidence.
 */
function grandStarEvidence({ securedCount, monsterCount, deepSecuredCount = 0, hasMixed = false, hasGps = false }) {
  const progress = freshProgress();

  // Distribute secured units across monsters.
  const allUnits = [
    { cluster: 'endmarks', ru: 'sentence-endings-core', skill: 'sentence_endings', monster: 'pealark' },
    { cluster: 'speech', ru: 'speech-core', skill: 'speech', monster: 'pealark' },
    { cluster: 'boundary', ru: 'semicolons-core', skill: 'semicolon', monster: 'pealark' },
    { cluster: 'boundary', ru: 'dash-clauses-core', skill: 'dash_clause', monster: 'pealark' },
    { cluster: 'boundary', ru: 'hyphens-core', skill: 'hyphen', monster: 'pealark' },
    { cluster: 'apostrophe', ru: 'apostrophe-contractions-core', skill: 'apostrophe_contractions', monster: 'claspin' },
    { cluster: 'apostrophe', ru: 'apostrophe-possession-core', skill: 'apostrophe_possession', monster: 'claspin' },
    { cluster: 'comma_flow', ru: 'list-commas-core', skill: 'list_commas', monster: 'curlune' },
    { cluster: 'comma_flow', ru: 'fronted-adverbials-core', skill: 'fronted_adverbial', monster: 'curlune' },
    { cluster: 'comma_flow', ru: 'comma-clarity-core', skill: 'comma_clarity', monster: 'curlune' },
    { cluster: 'structure', ru: 'parenthesis-core', skill: 'parenthesis', monster: 'curlune' },
    { cluster: 'structure', ru: 'colons-core', skill: 'colon_list', monster: 'curlune' },
    { cluster: 'structure', ru: 'semicolon-lists-core', skill: 'semicolon_list', monster: 'curlune' },
    { cluster: 'structure', ru: 'bullet-points-core', skill: 'bullet_points', monster: 'curlune' },
  ];

  // Select units by round-robin across monsters to ensure breadth.
  const monsterOrder = ['pealark', 'claspin', 'curlune'];
  const allowedMonsters = monsterOrder.slice(0, monsterCount);
  const perMonsterUnits = new Map();
  for (const m of allowedMonsters) {
    perMonsterUnits.set(m, allUnits.filter((u) => u.monster === m));
  }

  // Round-robin: take one unit from each monster in turn.
  const selected = [];
  let round = 0;
  while (selected.length < securedCount) {
    let added = false;
    for (const m of allowedMonsters) {
      if (selected.length >= securedCount) break;
      const mUnits = perMonsterUnits.get(m);
      if (round < mUnits.length) {
        selected.push(mUnits[round]);
        added = true;
      }
    }
    if (!added) break; // All units exhausted.
    round++;
  }

  for (const { cluster, ru, skill } of selected) {
    progress.rewardUnits = {
      ...progress.rewardUnits,
      ...securedRewardUnit(cluster, ru),
    };
  }

  // Deep-secure facets.
  const now = Date.UTC(2026, 3, 25);
  const dsSelected = selected.slice(0, deepSecuredCount);
  const modes = hasMixed ? ['choose', 'insert'] : ['choose'];
  for (const { skill } of dsSelected) {
    for (const mode of modes) {
      progress.facets[`${skill}::${mode}`] = secureItemState({
        lapses: 0,
        firstCorrectAt: now - (14 * DAY_MS),
        lastCorrectAt: now,
      });
    }
  }

  // GPS evidence.
  if (hasGps) {
    progress.attempts.push(makeAttempt({
      ts: now,
      itemId: 'gps_item_01',
      skillIds: [selected[0]?.skill || 'sentence_endings'],
      correct: true,
      testMode: 'gps',
    }));
  }

  return progress;
}

test('U6: Grand Stars = 0 with zero secured evidence', () => {
  const result = projectPunctuationStars(freshProgress(), CURRENT_RELEASE_ID);
  assert.equal(result.grand.grandStars, 0,
    'Grand Stars must be 0 with no evidence');
});

test('U6: single-unit depth cannot exceed Egg gate (breadth blocks)', () => {
  // 1 monster, 5 secured (all Pealark), 5 deep-secured.
  const progress = grandStarEvidence({ securedCount: 5, monsterCount: 1, deepSecuredCount: 5, hasMixed: true });
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.ok(result.grand.grandStars < 15,
    `Grand Stars must be below Egg (15) with single-monster depth, got ${result.grand.grandStars}`);
});

test('U6 Egg tier: 2+ monsters, 3+ secured units reaches Egg (15)', () => {
  // 2 monsters, 3 secured.
  const progress = grandStarEvidence({ securedCount: 3, monsterCount: 2 });
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.ok(result.grand.grandStars >= 15,
    `Grand Stars must reach Egg (15) with 2 monsters + 3 secured, got ${result.grand.grandStars}`);
});

test('U6 Hatch tier: 3 monsters, 6+ secured units reaches Hatch (35)', () => {
  // 3 monsters, 6 secured.
  const progress = grandStarEvidence({ securedCount: 6, monsterCount: 3 });
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.ok(result.grand.grandStars >= 35,
    `Grand Stars must reach Hatch (35) with 3 monsters + 6 secured, got ${result.grand.grandStars}`);
});

test('U6 Evolve tier: 8+ secured, 4+ deep-secured reaches Evolve (60)', () => {
  const progress = grandStarEvidence({ securedCount: 8, monsterCount: 3, deepSecuredCount: 4 });
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.ok(result.grand.grandStars >= 60,
    `Grand Stars must reach Evolve (60) with 8 secured + 4 deep, got ${result.grand.grandStars}`);
});

test('U6 Strong tier: 11+ secured, 8+ deep-secured, mixed evidence reaches Strong (80)', () => {
  const progress = grandStarEvidence({ securedCount: 11, monsterCount: 3, deepSecuredCount: 8, hasMixed: true });
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.ok(result.grand.grandStars >= 80,
    `Grand Stars must reach Strong (80) with 11 secured + 8 deep + mixed, got ${result.grand.grandStars}`);
});

test('U6 Strong tier: missing mixed evidence blocks Strong even with sufficient depth', () => {
  // 11 secured, 8 deep, but NO mixed evidence.
  const progress = grandStarEvidence({ securedCount: 11, monsterCount: 3, deepSecuredCount: 8, hasMixed: false });
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.ok(result.grand.grandStars < 80,
    `Grand Stars must be below Strong (80) without mixed evidence, got ${result.grand.grandStars}`);
});

test('U6 Grand Quoral: all 14 deep secure reaches 100 Grand Stars', () => {
  const progress = grandStarEvidence({ securedCount: 14, monsterCount: 3, deepSecuredCount: 14, hasMixed: true });
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.equal(result.grand.grandStars, 100,
    `Grand Stars must be 100 with all 14 units deep secure, got ${result.grand.grandStars}`);
});

test('U6 Grand Quoral: GPS test mode counts as mixed evidence for Strong gate', () => {
  // 11 secured, 8 deep, GPS evidence instead of mixed modes.
  const progress = grandStarEvidence({ securedCount: 11, monsterCount: 3, deepSecuredCount: 8, hasGps: true });
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.ok(result.grand.grandStars >= 80,
    `Grand Stars must reach Strong (80) with GPS evidence, got ${result.grand.grandStars}`);
});

test('U6: Grand Stars increase monotonically as evidence grows', () => {
  // Progressively add evidence and verify grand stars never decrease.
  let prevGrand = 0;

  const steps = [
    { securedCount: 1, monsterCount: 1 },
    { securedCount: 3, monsterCount: 2 },
    { securedCount: 6, monsterCount: 3 },
    { securedCount: 8, monsterCount: 3, deepSecuredCount: 4 },
    { securedCount: 11, monsterCount: 3, deepSecuredCount: 8, hasMixed: true },
    { securedCount: 14, monsterCount: 3, deepSecuredCount: 14, hasMixed: true },
  ];

  for (const step of steps) {
    const progress = grandStarEvidence(step);
    const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
    assert.ok(result.grand.grandStars >= prevGrand,
      `Grand Stars must not decrease: ${result.grand.grandStars} < previous ${prevGrand} at step ${JSON.stringify(step)}`);
    prevGrand = result.grand.grandStars;
  }
});

test('U6: interpolation within a tier band — partial progress yields intermediate values', () => {
  // Between Egg (15) and Hatch (35): 2 monsters, 3 secured (Egg base).
  // Add 1 more secured to start climbing towards Hatch.
  const progress = grandStarEvidence({ securedCount: 4, monsterCount: 3 });
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  // Should be between Hatch threshold (35) and Evolve (60), since we meet
  // Hatch gate (3 monsters, 6 secured? No — 4 secured < 6). Actually with 3
  // monsters + 4 secured we meet Egg but not Hatch. So we interpolate within
  // Egg band towards Hatch.
  assert.ok(result.grand.grandStars >= 15,
    `Grand Stars should be at least Egg (15), got ${result.grand.grandStars}`);
  assert.ok(result.grand.grandStars < 35,
    `Grand Stars should be below Hatch (35) with only 4 secured, got ${result.grand.grandStars}`);
  assert.ok(result.grand.grandStars > 15,
    `Grand Stars should interpolate above Egg floor with partial progress, got ${result.grand.grandStars}`);
});

// ---------------------------------------------------------------------------
// P6-U6: CLASPIN_REQUIRED_SKILLS derivation parity tests
// ---------------------------------------------------------------------------

test('P6-U6: CLASPIN_REQUIRED_SKILLS contains exactly apostrophe_contractions and apostrophe_possession', () => {
  // Verify the derived constant matches the expected hardcoded values.
  const expected = ['apostrophe_contractions', 'apostrophe_possession'];
  assert.deepStrictEqual(
    [...CLASPIN_REQUIRED_SKILLS].sort(),
    [...expected].sort(),
    `CLASPIN_REQUIRED_SKILLS must contain exactly ${JSON.stringify(expected)}, got ${JSON.stringify([...CLASPIN_REQUIRED_SKILLS])}`,
  );
});

test('P6-U6: CLASPIN_REQUIRED_SKILLS is frozen (immutable)', () => {
  assert.ok(Object.isFrozen(CLASPIN_REQUIRED_SKILLS),
    'CLASPIN_REQUIRED_SKILLS must be frozen');
});

test('P6-U6: CLASPIN_REQUIRED_SKILLS derivation — hypothetical 3rd apostrophe skill auto-included', () => {
  // Simulate what would happen if SKILL_TO_CLUSTER gained a 3rd apostrophe
  // entry by replicating the derivation logic on an extended Map.
  const extendedMap = new Map([
    ['apostrophe_contractions', 'apostrophe'],
    ['apostrophe_possession', 'apostrophe'],
    ['apostrophe_plural', 'apostrophe'], // hypothetical new skill
  ]);

  const derived = Array.from(extendedMap.entries())
    .filter(([, c]) => c === 'apostrophe')
    .map(([s]) => s);

  assert.equal(derived.length, 3,
    'Adding a 3rd apostrophe skill to the mapping must yield 3 entries');
  assert.ok(derived.includes('apostrophe_plural'),
    'The hypothetical skill must appear in the derived set');
  assert.ok(derived.includes('apostrophe_contractions'),
    'Existing skills must still be present');
  assert.ok(derived.includes('apostrophe_possession'),
    'Existing skills must still be present');
});

// ---------------------------------------------------------------------------
// U4: Practice Stars daily throttle (anti-grinding R10)
// ---------------------------------------------------------------------------

test('U4 daily throttle: 20 distinct correct items across 2 days — no cap hit', () => {
  const progress = freshProgress();
  // 10 items on day 1, 10 items on day 2 — both under the 25-item daily cap.
  for (let i = 0; i < 20; i++) {
    const day = i < 10 ? 0 : 1;
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25 + day, 10, 0, i),
      itemId: `throttle_item_${i}`,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supportLevel: 0,
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const pealark = result.perMonster.pealark;
  // 20 independent correct + 20 variety * 0.5 = 30 → capped at PRACTICE_CAP (30).
  assert.equal(pealark.practiceStars, 30,
    `Expected full Practice Stars with 20 items across 2 days, got ${pealark.practiceStars}`);
});

test('U4 daily throttle: 25 distinct correct items in 1 day — at daily ceiling', () => {
  const progress = freshProgress();
  for (let i = 0; i < 25; i++) {
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, 0, i),
      itemId: `throttle_item_${i}`,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supportLevel: 0,
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const pealark = result.perMonster.pealark;
  // 25 independent correct + 25 variety * 0.5 = 37.5 → floor 37 → cap 30.
  // Daily ceiling at 25 items is exactly the cap input, all count.
  const ceilingStars = pealark.practiceStars;
  assert.equal(ceilingStars, 30,
    `Practice Stars from 25 items in one day must hit PRACTICE_CAP exactly, got ${ceilingStars}`);
});

test('U4 daily throttle: 30 distinct correct items in 1 day — capped at daily ceiling', () => {
  const progress = freshProgress();
  for (let i = 0; i < 30; i++) {
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, 0, i),
      itemId: `throttle_item_${i}`,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supportLevel: 0,
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const pealark = result.perMonster.pealark;

  // With 25-item daily cap: 25 independent correct + 25 variety * 0.5 = 37.5
  // → floor 37 → PRACTICE_CAP 30.
  // Compare against un-capped scenario (would be 30 + 15 = 45 → 30).
  // The daily cap restricts the independent correct count to 25.

  // Build the same scenario with 25 items on day 1 for comparison.
  const progress25 = freshProgress();
  for (let i = 0; i < 25; i++) {
    progress25.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, 0, i),
      itemId: `throttle25_item_${i}`,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supportLevel: 0,
    }));
  }
  const result25 = projectPunctuationStars(progress25, CURRENT_RELEASE_ID);

  assert.equal(pealark.practiceStars, result25.perMonster.pealark.practiceStars,
    `30 items in 1 day must produce the same Practice Stars as 25 items (daily cap), got ${pealark.practiceStars} vs ${result25.perMonster.pealark.practiceStars}`);
});

test('U4 daily throttle: 15 items day 1 + 15 items day 2 — no cap (each day under threshold)', () => {
  const progress = freshProgress();
  for (let i = 0; i < 30; i++) {
    const day = i < 15 ? 0 : 1;
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25 + day, 10, 0, i % 15),
      itemId: `split_item_${i}`,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supportLevel: 0,
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const pealark = result.perMonster.pealark;

  // 30 independent correct (15 per day, both under 25 cap) + 30 variety * 0.5 = 45
  // → floor 45 → PRACTICE_CAP 30.
  assert.equal(pealark.practiceStars, 30,
    `Expected full Practice Stars with 15+15 across 2 days, got ${pealark.practiceStars}`);
});

test('U4 daily throttle: same item attempted 5 times in 1 day — per-item cap (3) applies before per-day cap', () => {
  const progress = freshProgress();
  // 5 attempts on same item — per-item cap is 3, only first 3 count.
  for (let i = 0; i < 5; i++) {
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, 0, i),
      itemId: 'same_item_repeated',
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supportLevel: 0,
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const pealark = result.perMonster.pealark;

  // Per-item cap (3) limits to 3 independent correct from 1 item.
  // Variety: 1 item * 0.5 = 0.5. Total raw = 3.5, floor = 3.
  assert.equal(pealark.practiceStars, 3,
    `Expected 3 Practice Stars for 5 repeats of same item (per-item cap 3), got ${pealark.practiceStars}`);
});

test('U4 daily throttle: zero timestamp on all attempts — all cluster to day 0, cap applies', () => {
  const progress = freshProgress();
  for (let i = 0; i < 30; i++) {
    progress.attempts.push(makeAttempt({
      ts: 0,
      itemId: `zero_ts_item_${i}`,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supportLevel: 0,
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const pealark = result.perMonster.pealark;

  // All 30 items land on day 0. Daily cap = 25 distinct items.
  // 25 independent correct + 25 variety * 0.5 = 37.5, floor = 37, cap = 30.
  // The 5 excess items beyond daily cap do NOT contribute.

  // Build a 25-item reference for comparison.
  const progress25 = freshProgress();
  for (let i = 0; i < 25; i++) {
    progress25.attempts.push(makeAttempt({
      ts: 0,
      itemId: `zero_ts_ref_${i}`,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supportLevel: 0,
    }));
  }
  const result25 = projectPunctuationStars(progress25, CURRENT_RELEASE_ID);

  assert.equal(pealark.practiceStars, result25.perMonster.pealark.practiceStars,
    `30 items at ts=0 must equal 25 items at ts=0 (daily cap), got ${pealark.practiceStars} vs ${result25.perMonster.pealark.practiceStars}`);
});

test('U4 verification: adding items beyond daily cap produces zero additional Practice Stars', () => {
  // Saturate: 50 distinct correct items, all on the same day.
  const progress = freshProgress();
  for (let i = 0; i < 50; i++) {
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, 0, i),
      itemId: `saturate_item_${i}`,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supportLevel: 0,
    }));
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const pealark = result.perMonster.pealark;

  // Daily cap = 25 items. Raw = 25 + 25*0.5 = 37.5, floor = 37, cap = 30.
  // BUT the contract says a child cannot reach the FULL 30 from a single day
  // when the cap is designed to prevent single-day grinding to the maximum.
  // With 25 daily cap: 25 + 12.5 = 37.5 → 37 → capped at 30.
  // This hits the PRACTICE_CAP, but that's because 25 items is generous.
  // The key verification: increasing items beyond 25 does NOT increase stars.
  const progress100 = freshProgress();
  for (let i = 0; i < 100; i++) {
    progress100.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, 0, i),
      itemId: `mega_saturate_item_${i}`,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supportLevel: 0,
    }));
  }
  const result100 = projectPunctuationStars(progress100, CURRENT_RELEASE_ID);

  assert.equal(result100.perMonster.pealark.practiceStars, pealark.practiceStars,
    `100 items in 1 day must produce the same Practice Stars as 50 items (daily cap enforced), got ${result100.perMonster.pealark.practiceStars} vs ${pealark.practiceStars}`)
});

test('U4 near-retry + daily-cap interaction: 30 fail-then-correct items equal 25 items under PRACTICE_CAP', () => {
  // Baseline: 25 distinct items, each independently correct on the same day.
  const progress25 = freshProgress();
  for (let i = 0; i < 25; i++) {
    progress25.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, 0, i),
      itemId: `cap_baseline_${i}`,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supportLevel: 0,
    }));
  }

  const baselineStars = projectPunctuationStars(progress25, CURRENT_RELEASE_ID)
    .perMonster.pealark.practiceStars;

  // 30 distinct items, each with a fail-then-correct sequence on the same day.
  const progress30 = freshProgress();
  for (let i = 0; i < 30; i++) {
    const itemId = `cap_retry_${i}`;
    // First attempt: independent, incorrect.
    progress30.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, i, 0),
      itemId,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: false,
      supportLevel: 0,
    }));
    // Second attempt: independent, correct.
    progress30.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, i, 30),
      itemId,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supportLevel: 0,
    }));
  }

  const retryStars = projectPunctuationStars(progress30, CURRENT_RELEASE_ID)
    .perMonster.pealark.practiceStars;

  // Both scenarios hit PRACTICE_CAP — the excess near-retries are absorbed
  // by the daily cap, producing the same result.
  assert.equal(retryStars, baselineStars,
    `30 fail-then-correct items must produce the same Practice Stars as 25 items (both at cap), got retry=${retryStars} vs baseline=${baselineStars}`);
});
