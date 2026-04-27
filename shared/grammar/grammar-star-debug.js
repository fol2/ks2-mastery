// Grammar Star Debug Model — redacted tier-level explanation for
// "why does this monster show N Stars?" without exposing answer content.
//
// Pure module: zero imports from src/ or worker/.
// Phase 7 U5.

import {
  deriveGrammarConceptStarEvidence,
  computeGrammarMonsterStars,
  applyStarHighWaterLatch,
  grammarStarStageName,
  grammarStarDisplayStage,
  GRAMMAR_MONSTER_STAR_MAX,
  legacyStarFloorFromStage,
} from './grammar-stars.js';
import { conceptIdsForGrammarMonster } from './grammar-concept-roster.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONSTER_DISPLAY_NAMES = Object.freeze({
  bracehart: 'Bracehart',
  chronalyx: 'Chronalyx',
  couronnail: 'Couronnail',
  concordium: 'Concordium',
});

/**
 * Fixed list of evidence categories that are recognised but never contribute
 * Stars. Provided so admin debug UIs can explain why certain attempt types
 * are absent from the evidence breakdown.
 */
const REJECTED_CATEGORIES = Object.freeze([
  'wrong_answer',
  'supported_attempt',
  'pre_secure_correct',
  'missing_timestamp',
  'wrong_concept',
  'duplicate_tier',
  'non_scored_event',
]);

// Next milestone lookup keyed by display stage.
const NEXT_MILESTONES = Object.freeze([
  { stars: 1, label: 'Egg found' },
  { stars: 15, label: 'Hatched' },
  { stars: 35, label: 'Growing' },
  { stars: 65, label: 'Nearly Mega' },
  { stars: 100, label: 'Mega' },
  null,
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a serialisable debug model that explains a Grammar monster's Star
 * count without exposing answer content.
 *
 * @param {object} params
 * @param {string} params.monsterId - One of bracehart, chronalyx, couronnail, concordium.
 * @param {Object|null} params.conceptNodes - Map of conceptId → mastery node.
 * @param {Array} params.recentAttempts - The engine's recentAttempts array.
 * @param {object|null} params.rewardEntry - The monster's reward state entry
 *   (shape: { starHighWater, legacyStage, ... }).
 * @param {number} [params.nowTs=Date.now()] - Current timestamp (ms).
 * @returns {object} Debug model — see JSDoc at bottom for full shape.
 */
export function buildGrammarStarDebugModel({ monsterId, conceptNodes, recentAttempts = [], rewardEntry, nowTs } = {}) {
  const ts = typeof nowTs === 'number' && Number.isFinite(nowTs) ? nowTs : Date.now();
  const conceptIds = conceptIdsForGrammarMonster(monsterId);
  const hasNodes = isPlainObject(conceptNodes);
  const reward = isPlainObject(rewardEntry) ? rewardEntry : {};

  // -------------------------------------------------------------------------
  // 1. Per-concept evidence derivation
  // -------------------------------------------------------------------------
  const conceptEvidenceMap = {};
  const conceptEvidenceArray = [];

  if (hasNodes) {
    for (const conceptId of conceptIds) {
      const node = isPlainObject(conceptNodes[conceptId]) ? conceptNodes[conceptId] : null;
      const tiers = deriveGrammarConceptStarEvidence({
        conceptId,
        conceptNode: node,
        recentAttempts,
        nowTs: ts,
      });
      conceptEvidenceMap[conceptId] = tiers;

      // Per-concept star contribution — mirrors the weight logic in
      // computeGrammarMonsterStars for transparency.
      const conceptBudget = conceptIds.length > 0 ? GRAMMAR_MONSTER_STAR_MAX / conceptIds.length : 0;
      let weightSum = 0;
      const tierKeys = ['firstIndependentWin', 'repeatIndependentWin', 'variedPractice', 'secureConfidence', 'retainedAfterSecure'];
      const tierWeights = [0.05, 0.10, 0.10, 0.15, 0.60];
      for (let i = 0; i < tierKeys.length; i++) {
        if (tiers[tierKeys[i]] === true) weightSum += tierWeights[i];
      }
      const starsContributed = conceptBudget * weightSum;

      // Retention estimate for concepts with retainedAfterSecure
      let retentionEstimate = null;
      if (tiers.retainedAfterSecure && node) {
        const intervalDays = safeNum(node.intervalDays);
        const securedAtEstimate = ts - intervalDays * 86400000;
        retentionEstimate = { securedAtEstimate, estimateMethod: 'intervalDays' };
      }

      conceptEvidenceArray.push({
        conceptId,
        tiers: { ...tiers },
        starsContributed,
        retentionEstimate,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 2. Compute live stars
  // -------------------------------------------------------------------------
  let computedLiveStars = 0;
  if (hasNodes) {
    const starResult = computeGrammarMonsterStars(monsterId, conceptEvidenceMap);
    computedLiveStars = starResult.stars;
  }

  // -------------------------------------------------------------------------
  // 3. Extract reward state
  // -------------------------------------------------------------------------
  const starHighWater = Math.max(0, Math.floor(safeNum(reward.starHighWater)));
  const legacyStage = safeNum(reward.legacyStage);
  const legacyFloor = legacyStarFloorFromStage(legacyStage);

  // -------------------------------------------------------------------------
  // 4. Apply high-water latch
  // -------------------------------------------------------------------------
  const { displayStars } = applyStarHighWaterLatch({
    computedStars: computedLiveStars,
    starHighWater,
    legacyStage,
  });

  // -------------------------------------------------------------------------
  // 5. Determine source
  // -------------------------------------------------------------------------
  let source;
  if (displayStars === computedLiveStars) {
    source = 'live';
  } else if (displayStars === starHighWater && starHighWater > computedLiveStars) {
    source = 'highWater';
  } else if (displayStars === legacyFloor && legacyFloor > computedLiveStars && legacyFloor > starHighWater) {
    source = 'legacyFloor';
  } else if (starHighWater >= computedLiveStars) {
    source = 'highWater';
  } else {
    source = 'live';
  }

  // -------------------------------------------------------------------------
  // 6. Derived display fields
  // -------------------------------------------------------------------------
  const displayStage = grammarStarDisplayStage(displayStars);
  const stageName = grammarStarStageName(displayStars);
  const nextMilestone = NEXT_MILESTONES[displayStage] || null;

  // -------------------------------------------------------------------------
  // 7. Warnings
  // -------------------------------------------------------------------------
  const warnings = [];
  if (computedLiveStars < starHighWater) {
    warnings.push('Rolling window may have truncated older evidence');
  }

  // -------------------------------------------------------------------------
  // 8. Build result — redacted: never include answer content or raw attempts
  // -------------------------------------------------------------------------
  return {
    monsterId,
    name: MONSTER_DISPLAY_NAMES[monsterId] || monsterId,
    displayStars,
    starHighWater,
    computedLiveStars,
    legacyFloor,
    stageName,
    displayStage,
    nextMilestone,
    source,
    conceptEvidence: conceptEvidenceArray,
    rejectedCategories: [...REJECTED_CATEGORIES],
    warnings,
  };
}
