// U7 — Playwright state-seeding infrastructure: frozen fixture objects
// representing deterministic Grammar states for browser tests.
//
// These are pure data fixtures with zero Playwright dependencies. Each seed
// factory returns a frozen { rewardState, analytics } object whose
// rewardState shape matches what progressForGrammarMonster expects on the
// reward-layer read path.
//
// Consumed by U11 Playwright threshold tests; also usable by any unit test
// that needs a known Grammar state without constructing one through the
// engine.

import {
  GRAMMAR_MONSTER_CONCEPTS,
  GRAMMAR_AGGREGATE_CONCEPTS,
} from '../../shared/grammar/grammar-concept-roster.js';
import {
  GRAMMAR_MONSTER_STAR_MAX,
  GRAMMAR_CONCEPT_STAR_WEIGHTS,
} from '../../shared/grammar/grammar-stars.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RELEASE_ID = 'grammar-legacy-reviewed-2026-04-24';

const MONSTER_IDS = ['bracehart', 'chronalyx', 'couronnail', 'concordium'];

// Evidence-tier weight keys for reference.
const TIER_KEYS = Object.keys(GRAMMAR_CONCEPT_STAR_WEIGHTS);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function masteryKey(conceptId) {
  return `grammar:${RELEASE_ID}:${conceptId}`;
}

/** Build a blank monster entry. */
function blankMonster() {
  return {
    mastered: [],
    caught: false,
    starHighWater: 0,
    releaseId: RELEASE_ID,
  };
}

/** Build a monster entry with N mastered concepts drawn from `conceptIds`. */
function monsterWithMastered(conceptIds, count, { caught = true, starHighWater = 0 } = {}) {
  const mastered = conceptIds.slice(0, count).map(masteryKey);
  return {
    mastered,
    caught,
    starHighWater,
    releaseId: RELEASE_ID,
  };
}

/**
 * Build a full four-monster rewardState where only bracehart is non-blank,
 * unless `others` overrides are provided.
 */
function buildRewardState(bracehartEntry, others = {}) {
  return {
    bracehart: bracehartEntry,
    chronalyx: others.chronalyx || blankMonster(),
    couronnail: others.couronnail || blankMonster(),
    concordium: others.concordium || blankMonster(),
  };
}

/**
 * Build a minimal analytics object from the rewardState for dashboard /
 * bank consumption.
 */
function buildAnalytics(rewardState) {
  const concepts = [];
  for (const [monsterId, entry] of Object.entries(rewardState)) {
    const conceptIds = monsterId === 'concordium'
      ? GRAMMAR_AGGREGATE_CONCEPTS
      : (GRAMMAR_MONSTER_CONCEPTS[monsterId] || []);
    for (const cid of conceptIds) {
      const isMastered = (entry.mastered || []).includes(masteryKey(cid));
      concepts.push({
        conceptId: cid,
        monsterId,
        mastered: isMastered,
      });
    }
  }

  // progressSnapshot mirrors the shape the dashboard reads.
  const progressSnapshot = {};
  for (const monsterId of MONSTER_IDS) {
    const entry = rewardState[monsterId] || blankMonster();
    progressSnapshot[monsterId] = {
      caught: entry.caught,
      starHighWater: entry.starHighWater,
      masteredCount: (entry.mastered || []).length,
    };
  }

  return { concepts, progressSnapshot };
}

/** Deep-freeze an object recursively. */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

/** Wrap rewardState + analytics into a frozen seed. */
function makeSeed(rewardState) {
  const analytics = buildAnalytics(rewardState);
  return deepFreeze({ rewardState, analytics });
}

// ---------------------------------------------------------------------------
// Seed factories
// ---------------------------------------------------------------------------

/**
 * 0 Stars everywhere. All 4 monsters at starHighWater: 0, caught: false,
 * mastered: [].
 */
export function seedFreshLearner() {
  return makeSeed(buildRewardState(blankMonster()));
}

/**
 * Bracehart has 1 Star from firstIndependentWin on sentence_functions.
 * starHighWater: 1, caught: true. Other monsters at 0.
 */
export function seedEggState() {
  const bracehart = monsterWithMastered(
    GRAMMAR_MONSTER_CONCEPTS.bracehart,
    0,
    { caught: true, starHighWater: 1 },
  );
  return makeSeed(buildRewardState(bracehart));
}

/**
 * Bracehart at 14 Stars (one point before Hatch at 15). 2-3 concepts with
 * partial evidence tiers. starHighWater: 14.
 */
export function seedPreHatch() {
  // 14 Stars from 6 concepts: partial evidence across sentence_functions,
  // clauses, and relative_clauses.
  const concepts = GRAMMAR_MONSTER_CONCEPTS.bracehart;
  const mastered = [concepts[0], concepts[1]].map(masteryKey);
  const bracehart = {
    mastered,
    caught: true,
    starHighWater: 14,
    releaseId: RELEASE_ID,
  };
  return makeSeed(buildRewardState(bracehart));
}

/**
 * Bracehart at 34 Stars (one before Growing at 35). starHighWater: 34.
 */
export function seedPreGrowing() {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.bracehart;
  const mastered = concepts.slice(0, 4).map(masteryKey);
  const bracehart = {
    mastered,
    caught: true,
    starHighWater: 34,
    releaseId: RELEASE_ID,
  };
  return makeSeed(buildRewardState(bracehart));
}

/**
 * Bracehart at 64 Stars (one before Nearly Mega at 65). starHighWater: 64.
 */
export function seedPreNearlyMega() {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.bracehart;
  const mastered = concepts.slice(0, 5).map(masteryKey);
  const bracehart = {
    mastered,
    caught: true,
    starHighWater: 64,
    releaseId: RELEASE_ID,
  };
  return makeSeed(buildRewardState(bracehart));
}

/**
 * Bracehart at 99 Stars (one before Mega at 100). All concepts near-full
 * evidence. starHighWater: 99.
 */
export function seedPreMega() {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.bracehart;
  const mastered = concepts.map(masteryKey);
  const bracehart = {
    mastered,
    caught: true,
    starHighWater: 99,
    releaseId: RELEASE_ID,
  };
  return makeSeed(buildRewardState(bracehart));
}

/**
 * 17/18 Concordium concepts secured. For Concordium regression testing.
 * starHighWater reflects the 17-concept state.
 *
 * With 17/18 concepts fully weighted (all 5 tiers = weight 1.0 each),
 * Stars = floor(100 / 18 * 17 * 1.0) = floor(94.44) = 94.
 */
export function seedConcordium17of18() {
  const concordiumConcepts = GRAMMAR_AGGREGATE_CONCEPTS;
  const masteredConcepts = concordiumConcepts.slice(0, 17);
  const mastered = masteredConcepts.map(masteryKey);

  // 17 of 18 at full weight: floor(100 * 17/18) = 94
  const starHighWater = 94;

  const concordium = {
    mastered,
    caught: true,
    starHighWater,
    releaseId: RELEASE_ID,
  };

  // Populate direct monsters proportionally.
  const bracehartConcepts = GRAMMAR_MONSTER_CONCEPTS.bracehart;
  const chronalyxConcepts = GRAMMAR_MONSTER_CONCEPTS.chronalyx;
  const couronnailConcepts = GRAMMAR_MONSTER_CONCEPTS.couronnail;

  const bracehartMastered = bracehartConcepts.filter((c) => masteredConcepts.includes(c));
  const chronalyxMastered = chronalyxConcepts.filter((c) => masteredConcepts.includes(c));
  const couronnailMastered = couronnailConcepts.filter((c) => masteredConcepts.includes(c));

  return makeSeed(buildRewardState(
    monsterWithMastered(bracehartConcepts, bracehartMastered.length, {
      caught: bracehartMastered.length > 0,
      starHighWater: bracehartMastered.length > 0
        ? Math.floor(GRAMMAR_MONSTER_STAR_MAX * bracehartMastered.length / bracehartConcepts.length)
        : 0,
    }),
    {
      chronalyx: monsterWithMastered(chronalyxConcepts, chronalyxMastered.length, {
        caught: chronalyxMastered.length > 0,
        starHighWater: chronalyxMastered.length > 0
          ? Math.floor(GRAMMAR_MONSTER_STAR_MAX * chronalyxMastered.length / chronalyxConcepts.length)
          : 0,
      }),
      couronnail: monsterWithMastered(couronnailConcepts, couronnailMastered.length, {
        caught: couronnailMastered.length > 0,
        starHighWater: couronnailMastered.length > 0
          ? Math.floor(GRAMMAR_MONSTER_STAR_MAX * couronnailMastered.length / couronnailConcepts.length)
          : 0,
      }),
      concordium,
    },
  ));
}

/**
 * Several concepts in needs-repair / building states. For testing the
 * Practise Next filter. Bracehart has 2 weak concepts and 1 building
 * concept, reflected in a low starHighWater.
 */
export function seedWeakDueConcepts() {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.bracehart;
  // Only first concept mastered; rest are weak/building.
  const mastered = [concepts[0]].map(masteryKey);
  const bracehart = {
    mastered,
    caught: true,
    starHighWater: 3,
    releaseId: RELEASE_ID,
  };
  return makeSeed(buildRewardState(bracehart));
}

/**
 * A learner with Writing Try evidence. transferLane contains prompts and
 * evidence entries for cross-subject transfer assessment.
 */
export function seedWritingTryEvidence() {
  const bracehart = {
    mastered: [masteryKey('sentence_functions')],
    caught: true,
    starHighWater: 5,
    releaseId: RELEASE_ID,
  };

  const rewardState = buildRewardState(bracehart);

  // Attach transferLane to the rewardState root.
  const rewardStateWithTransfer = {
    ...rewardState,
    transferLane: {
      prompts: [
        { conceptId: 'sentence_functions', promptedAt: Date.UTC(2026, 3, 20), type: 'writing-try' },
      ],
      evidence: [
        { conceptId: 'sentence_functions', observedAt: Date.UTC(2026, 3, 21), source: 'writing-try', quality: 'good' },
      ],
    },
  };

  return deepFreeze({
    rewardState: rewardStateWithTransfer,
    analytics: buildAnalytics(rewardState),
  });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates that a seed object has the required shape for use by Playwright
 * threshold tests and other consumers.
 *
 * @param {object} seed — the object returned by a seed factory.
 * @returns {true} if valid.
 * @throws {Error} with a descriptive message if the shape is invalid.
 */
export function validateSeedShape(seed) {
  if (!seed || typeof seed !== 'object') {
    throw new Error('Seed must be a non-null object.');
  }

  // --- rewardState ---
  if (!seed.rewardState || typeof seed.rewardState !== 'object') {
    throw new Error('Seed must have a rewardState object.');
  }
  for (const monsterId of MONSTER_IDS) {
    const entry = seed.rewardState[monsterId];
    if (!entry || typeof entry !== 'object') {
      throw new Error(`rewardState.${monsterId} must be an object.`);
    }
    if (!Array.isArray(entry.mastered)) {
      throw new Error(`rewardState.${monsterId}.mastered must be an array.`);
    }
    if (typeof entry.caught !== 'boolean') {
      throw new Error(`rewardState.${monsterId}.caught must be a boolean.`);
    }
    if (typeof entry.starHighWater !== 'number' || !Number.isFinite(entry.starHighWater)) {
      throw new Error(`rewardState.${monsterId}.starHighWater must be a finite number.`);
    }
    if (typeof entry.releaseId !== 'string' || !entry.releaseId) {
      throw new Error(`rewardState.${monsterId}.releaseId must be a non-empty string.`);
    }
  }

  // --- analytics ---
  if (!seed.analytics || typeof seed.analytics !== 'object') {
    throw new Error('Seed must have an analytics object.');
  }
  if (!Array.isArray(seed.analytics.concepts)) {
    throw new Error('analytics.concepts must be an array.');
  }
  if (!seed.analytics.progressSnapshot || typeof seed.analytics.progressSnapshot !== 'object') {
    throw new Error('analytics.progressSnapshot must be an object.');
  }

  return true;
}
