// Punctuation QG P5 U6: Support evidence confirmed future-ready.
//
// These tests verify that:
//   1. Supported attempts (attempt.supported === true) are excluded from Secure
//      and Mastery evidence counts.
//   2. Normal attempts (supported === undefined / false) count normally.
//   3. The support fields in star-projection gracefully handle missing support
//      data (the production default — Punctuation does NOT currently emit
//      supported/guided attempts).
//   4. Supported attempts cannot unlock deep-secure evidence.
//
// IMPORTANT: Punctuation does NOT currently emit supported/guided attempts in
// production.  The fields exist for forward-compatibility only.  No production
// code path sets `supported: true` on a punctuation attempt.
//
// NOTE: If/when a telemetry manifest is created (e.g. U2), support-related
// signals should be marked as `reserved` in that manifest to prevent premature
// consumption by downstream analytics.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  projectPunctuationStars,
} from '../src/subjects/punctuation/star-projection.js';

const CURRENT_RELEASE_ID = 'punctuation-r4-full-14-skill-structure';
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers (mirrors punctuation-star-projection.test.js patterns)
// ---------------------------------------------------------------------------

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

function masteryKey(clusterId, rewardUnitId) {
  return `punctuation:${CURRENT_RELEASE_ID}:${clusterId}:${rewardUnitId}`;
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
// U6: Supported attempts excluded from Secure evidence
// ---------------------------------------------------------------------------

test('U6 support-evidence: attempt with supported=true is excluded from Secure Stars', () => {
  const progress = freshProgress();

  // Secure item state exists (item is in the secure memory bucket).
  progress.items['supported_secure_item'] = secureItemState();

  // The ONLY attempt on this item is supported — it must NOT count.
  progress.attempts.push(makeAttempt({
    itemId: 'supported_secure_item',
    variantSignature: 'puncsig_supported_01',
    skillIds: ['sentence_endings'],
    rewardUnitId: 'sentence-endings-core',
    correct: true,
    supported: true,
    itemMode: 'choose',
  }));

  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  // The supported attempt is excluded. The item has attempts but all are
  // supported, so it fails the dedup gate. Only the reward-unit securedAt
  // contributes: raw = (0 * 2 * 1.0) + (1 * 8 * 1.0) = 8.
  assert.equal(result.perMonster.pealark.secureStars, 8,
    'Supported attempt must not contribute item evidence to Secure Stars');
});

// ---------------------------------------------------------------------------
// U6: Supported attempts excluded from Mastery evidence
// ---------------------------------------------------------------------------

test('U6 support-evidence: attempt with supported=true is excluded from Mastery facet evidence', () => {
  const progress = freshProgress();
  const now = Date.UTC(2026, 3, 25);

  // All attempts are supported — facet qualifying evidence must be 0.
  for (let i = 0; i < 5; i++) {
    progress.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, i, 0),
      itemId: `mastery_supported_${i}`,
      variantSignature: `puncsig_mastery_sup_${i}`,
      templateId: `template_mastery_${i}`,
      skillIds: ['apostrophe_contractions'],
      rewardUnitId: 'apostrophe-contractions-core',
      correct: true,
      supported: true,
      itemMode: i < 3 ? 'choose' : 'insert',
    }));
  }

  // Facets across 2 modes — would normally contribute facetSecureCount.
  progress.facets = {
    'apostrophe_contractions::choose': secureItemState({ lapses: 0 }),
    'apostrophe_contractions::insert': secureItemState({ lapses: 0 }),
  };

  progress.rewardUnits = {
    ...securedRewardUnit('apostrophe', 'apostrophe-contractions-core'),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const claspin = result.perMonster.claspin;

  // All attempts are supported → facetQualifyingEvidence for both facets
  // has entries with evidenceCount = 0. The facets are skipped for
  // facetSecureCount. Mastery raw still receives itemModes and securedUnitCount
  // contributions, but the deep-secure Mega gate (requiring both skills with
  // deep-secure facets) CANNOT be met.
  assert.ok(claspin.masteryStars <= 15,
    'Supported-only attempts must cap Mastery at 15 (Mega gate blocked)');

  // Compare against the same scenario with independent attempts (which would
  // contribute qualifying facet evidence and potentially unlock full Mastery).
  const progressIndependent = freshProgress();
  for (let i = 0; i < 5; i++) {
    progressIndependent.attempts.push(makeAttempt({
      ts: Date.UTC(2026, 3, 25, 10, i, 0),
      itemId: `mastery_independent_${i}`,
      variantSignature: `puncsig_mastery_ind_${i}`,
      templateId: `template_mastery_ind_${i}`,
      skillIds: ['apostrophe_contractions'],
      rewardUnitId: 'apostrophe-contractions-core',
      correct: true,
      supported: false,
      itemMode: i < 3 ? 'choose' : 'insert',
    }));
  }
  progressIndependent.facets = {
    'apostrophe_contractions::choose': secureItemState({ lapses: 0 }),
    'apostrophe_contractions::insert': secureItemState({ lapses: 0 }),
  };
  progressIndependent.rewardUnits = {
    ...securedRewardUnit('apostrophe', 'apostrophe-contractions-core'),
  };

  const resultIndependent = projectPunctuationStars(progressIndependent, CURRENT_RELEASE_ID);
  // Independent version gets facetSecureCount > 0, yielding higher Mastery Stars.
  assert.ok(resultIndependent.perMonster.claspin.masteryStars >= claspin.masteryStars,
    'Independent attempts must yield >= Mastery Stars vs supported-only');
});

// ---------------------------------------------------------------------------
// U6: Normal attempts (supported === undefined) count normally
// ---------------------------------------------------------------------------

test('U6 support-evidence: attempt with supported=undefined counts normally toward Secure', () => {
  const progress = freshProgress();

  // Normal attempt — no supported field set (the default production case).
  progress.items['normal_item'] = secureItemState();

  const attempt = makeAttempt({
    itemId: 'normal_item',
    variantSignature: 'puncsig_normal_01',
    skillIds: ['sentence_endings'],
    rewardUnitId: 'sentence-endings-core',
    correct: true,
    itemMode: 'choose',
  });
  // Explicitly remove the supported field to simulate production omission.
  delete attempt.supported;
  progress.attempts.push(attempt);

  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  // The normal attempt counts: raw = (1 * 2 * 1.0) + (1 * 8 * 1.0) = 10.
  assert.equal(result.perMonster.pealark.secureStars, 10,
    'Attempt with supported=undefined must count normally toward Secure Stars');
});

test('U6 support-evidence: attempt with supported=false counts normally toward Secure', () => {
  const progress = freshProgress();

  progress.items['independent_item'] = secureItemState();
  progress.attempts.push(makeAttempt({
    itemId: 'independent_item',
    variantSignature: 'puncsig_independent_01',
    skillIds: ['sentence_endings'],
    rewardUnitId: 'sentence-endings-core',
    correct: true,
    supported: false,
    itemMode: 'choose',
  }));

  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  // raw = (1 * 2 * 1.0) + (1 * 8 * 1.0) = 10.
  assert.equal(result.perMonster.pealark.secureStars, 10,
    'Attempt with supported=false must count normally toward Secure Stars');
});

test('U6 support-evidence: attempt with supported=undefined counts normally toward Mastery', () => {
  const progress = freshProgress();
  const now = Date.UTC(2026, 3, 25);

  // Normal attempts across 2 item modes — Mastery should unlock.
  for (const mode of ['choose', 'insert']) {
    for (let i = 0; i < 3; i++) {
      const attempt = makeAttempt({
        ts: Date.UTC(2026, 3, 25, 10, 0, i),
        itemId: `mastery_normal_${mode}_${i}`,
        variantSignature: `puncsig_mastery_normal_${mode}_${i}`,
        templateId: `template_mastery_normal_${mode}_${i}`,
        skillIds: ['apostrophe_contractions'],
        rewardUnitId: 'apostrophe-contractions-core',
        correct: true,
        itemMode: mode,
      });
      delete attempt.supported;
      progress.attempts.push(attempt);
    }
  }

  progress.facets = {
    'apostrophe_contractions::choose': secureItemState({ lapses: 0 }),
    'apostrophe_contractions::insert': secureItemState({ lapses: 0 }),
  };

  progress.rewardUnits = {
    ...securedRewardUnit('apostrophe', 'apostrophe-contractions-core'),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const claspin = result.perMonster.claspin;

  assert.ok(claspin.masteryStars > 0,
    'Attempts with supported=undefined must qualify for Mastery Stars');
});

// ---------------------------------------------------------------------------
// U6: Supported attempts cannot unlock deep-secure evidence
// ---------------------------------------------------------------------------

test('U6 support-evidence: supported attempts cannot unlock deep-secure evidence for Mega gate', () => {
  const progress = freshProgress();
  const now = Date.UTC(2026, 3, 25);

  // Build a Claspin journey where ALL attempts are supported.
  // Even with items reaching the secure bucket externally and facets being
  // deep-secure, the Mastery gate requires qualifying (non-supported) attempt
  // evidence per facet to count those facets.
  for (const { skillId, ru } of [
    { skillId: 'apostrophe_contractions', ru: 'apostrophe-contractions-core' },
    { skillId: 'apostrophe_possession', ru: 'apostrophe-possession-core' },
  ]) {
    for (let i = 0; i < 10; i++) {
      const itemId = `deep_sec_supported_${skillId}_${i}`;
      progress.items[itemId] = secureItemState();

      for (let d = 0; d < 4; d++) {
        progress.attempts.push(makeAttempt({
          ts: Date.UTC(2026, 3, 25 - d, 10, 0, i),
          itemId,
          skillIds: [skillId],
          rewardUnitId: ru,
          correct: true,
          supported: true, // ALL supported
          itemMode: d % 2 === 0 ? 'choose' : 'insert',
        }));
      }
    }
  }

  progress.rewardUnits = {
    ...securedRewardUnit('apostrophe', 'apostrophe-contractions-core'),
    ...securedRewardUnit('apostrophe', 'apostrophe-possession-core'),
  };

  // Facets: deep-secure with spaced return (would normally unlock Mega).
  for (const skillId of ['apostrophe_contractions', 'apostrophe_possession']) {
    for (const mode of ['choose', 'insert']) {
      progress.facets[`${skillId}::${mode}`] = secureItemState({
        lapses: 0,
        firstCorrectAt: now - (14 * DAY_MS),
        lastCorrectAt: now,
      });
    }
  }

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const claspin = result.perMonster.claspin;

  // All attempts are supported → no qualifying Mastery evidence per facet.
  // The deep-secure Mega gate (requiring both skills deep-secure) CANNOT be
  // satisfied because facetSecureCount = 0 means skillsWithDeepSecure is empty.
  // Mastery Stars are capped at 15 by the Claspin Mega gate.
  assert.ok(claspin.masteryStars <= 15,
    'Supported-only attempts must cap Mastery at 15 (Mega gate unmet)');
  assert.ok(claspin.total < 100,
    'Claspin must not reach Mega (100) when all attempts are supported');

  // Verify this is strictly worse than the independent-attempt equivalent.
  const progressIndependent = freshProgress();
  for (const { skillId, ru } of [
    { skillId: 'apostrophe_contractions', ru: 'apostrophe-contractions-core' },
    { skillId: 'apostrophe_possession', ru: 'apostrophe-possession-core' },
  ]) {
    for (let i = 0; i < 10; i++) {
      const itemId = `deep_sec_ind_${skillId}_${i}`;
      progressIndependent.items[itemId] = secureItemState();
      for (let d = 0; d < 4; d++) {
        progressIndependent.attempts.push(makeAttempt({
          ts: Date.UTC(2026, 3, 25 - d, 10, 0, i),
          itemId,
          skillIds: [skillId],
          rewardUnitId: ru,
          correct: true,
          supported: false, // Independent
          itemMode: d % 2 === 0 ? 'choose' : 'insert',
        }));
      }
    }
  }
  progressIndependent.rewardUnits = {
    ...securedRewardUnit('apostrophe', 'apostrophe-contractions-core'),
    ...securedRewardUnit('apostrophe', 'apostrophe-possession-core'),
  };
  for (const skillId of ['apostrophe_contractions', 'apostrophe_possession']) {
    for (const mode of ['choose', 'insert']) {
      progressIndependent.facets[`${skillId}::${mode}`] = secureItemState({
        lapses: 0,
        firstCorrectAt: now - (14 * DAY_MS),
        lastCorrectAt: now,
      });
    }
  }

  const resultIndependent = projectPunctuationStars(progressIndependent, CURRENT_RELEASE_ID);
  // Independent version unlocks the Mega gate → 100 stars total.
  assert.equal(resultIndependent.perMonster.claspin.total, 100,
    'Independent attempts must reach Mega (100) — confirming supported exclusion matters');
  assert.ok(claspin.total < resultIndependent.perMonster.claspin.total,
    'Supported-only total must be strictly less than independent total');
});

// ---------------------------------------------------------------------------
// U6: Support fields handle missing support data gracefully
// ---------------------------------------------------------------------------

test('U6 support-evidence: star-projection handles attempts with no support fields at all', () => {
  const progress = freshProgress();

  // Attempt with absolutely no support-related fields (legacy shape).
  progress.items['legacy_item'] = secureItemState();
  const attempt = {
    ts: Date.UTC(2026, 3, 25, 10, 0, 0),
    itemId: 'legacy_item',
    skillIds: ['sentence_endings'],
    rewardUnitId: 'sentence-endings-core',
    correct: true,
    itemMode: 'choose',
    // No supported, supportLevel, or supportKind fields.
  };
  progress.attempts.push(attempt);

  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
  };

  // Must not throw and must count the attempt normally.
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.equal(result.perMonster.pealark.secureStars, 10,
    'Legacy attempt without support fields must count normally toward Secure Stars');
  assert.ok(result.perMonster.pealark.tryStars > 0,
    'Legacy attempt must still count for Try Stars');
});

test('U6 support-evidence: star-projection handles supported=null gracefully (treated as non-supported)', () => {
  const progress = freshProgress();

  progress.items['null_supported_item'] = secureItemState();
  progress.attempts.push(makeAttempt({
    itemId: 'null_supported_item',
    variantSignature: 'puncsig_null_sup',
    skillIds: ['sentence_endings'],
    rewardUnitId: 'sentence-endings-core',
    correct: true,
    supported: null, // Explicit null — must be treated as non-supported.
    itemMode: 'choose',
  }));

  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.equal(result.perMonster.pealark.secureStars, 10,
    'Attempt with supported=null must count normally (not excluded)');
});

test('U6 support-evidence: star-projection handles supportKind without supported flag gracefully', () => {
  const progress = freshProgress();

  // supportKind set but supported is NOT true — must still count as independent.
  progress.items['kind_only_item'] = secureItemState();
  progress.attempts.push(makeAttempt({
    itemId: 'kind_only_item',
    variantSignature: 'puncsig_kind_only',
    skillIds: ['sentence_endings'],
    rewardUnitId: 'sentence-endings-core',
    correct: true,
    supported: false,
    supportKind: 'hint', // Future field — must not gate exclusion by itself.
    itemMode: 'choose',
  }));

  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.equal(result.perMonster.pealark.secureStars, 10,
    'supportKind alone (without supported=true) must not exclude from Secure');
});

test('U6 support-evidence: supportLevel > 0 does not trigger the Secure exclusion guard', () => {
  const progress = freshProgress();

  // supportLevel > 0 affects Practice Stars (independent correct gate) but
  // does NOT trigger the supported === true exclusion for Secure/Mastery.
  progress.items['level_item'] = secureItemState();
  progress.attempts.push(makeAttempt({
    itemId: 'level_item',
    variantSignature: 'puncsig_level',
    skillIds: ['sentence_endings'],
    rewardUnitId: 'sentence-endings-core',
    correct: true,
    supported: false,
    supportLevel: 2,
    itemMode: 'choose',
  }));

  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  // supportLevel affects Practice but NOT the Secure/Mastery supported gate.
  assert.equal(result.perMonster.pealark.secureStars, 10,
    'supportLevel > 0 without supported=true must still count for Secure Stars');
});

// ---------------------------------------------------------------------------
// U6: Mixed supported and independent — only independent evidence counts
// ---------------------------------------------------------------------------

test('U6 support-evidence: mixed supported + independent attempts — only independent counts for Secure', () => {
  const progress = freshProgress();

  // 3 supported attempts + 2 independent attempts on different items.
  progress.items['sup_a'] = secureItemState();
  progress.items['sup_b'] = secureItemState();
  progress.items['sup_c'] = secureItemState();
  progress.items['ind_a'] = secureItemState();
  progress.items['ind_b'] = secureItemState();

  // Supported.
  for (const itemId of ['sup_a', 'sup_b', 'sup_c']) {
    progress.attempts.push(makeAttempt({
      itemId,
      variantSignature: `puncsig_${itemId}`,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supported: true,
      itemMode: 'choose',
    }));
  }

  // Independent.
  for (const itemId of ['ind_a', 'ind_b']) {
    progress.attempts.push(makeAttempt({
      itemId,
      variantSignature: `puncsig_${itemId}`,
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: true,
      supported: false,
      itemMode: 'choose',
    }));
  }

  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
  };

  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  // Only 2 independent items pass the dedup gate.
  // Secure raw = (2 * 2 * 1.0) + (1 * 8 * 1.0) = 12.
  assert.equal(result.perMonster.pealark.secureStars, 12,
    'Only independent attempts (2 of 5) should count toward Secure Stars');
});
