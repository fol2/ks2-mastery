// Grammar Stars — the 100-Star evidence-based display curve for Grammar
// monsters. Pure functions, no Worker/client dependencies.
//
// This module is the single source of truth for:
//   - Star constants (GRAMMAR_MONSTER_STAR_MAX, thresholds, weights)
//   - Evidence-tier derivation (deriveGrammarConceptStarEvidence)
//   - Per-monster Star computation (computeGrammarMonsterStars)
//   - Stage derivation (grammarStarStageFor, grammarStarDisplayStage)
//   - Child-facing stage labels (grammarStarStageName)
//
// Imported by both the Worker and client via relative paths. Keeping this
// module free of any Worker- or client-specific deps mirrors the
// shared/grammar/confidence.js pattern from Phase 4 U8.
//
// Plan: docs/plans/2026-04-27-001-feat-grammar-phase5-star-curve-landing-plan.md (U2).

import { conceptIdsForGrammarMonster } from './grammar-concept-roster.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Universal Star cap for all Grammar monsters. */
export const GRAMMAR_MONSTER_STAR_MAX = 100;

/**
 * Named stage thresholds. Internal stage 0-4 uses egg/hatch/evolve3/mega.
 * Display stage 0-5 uses all six. See grammarStarStageFor and
 * grammarStarDisplayStage for the mapping.
 */
export const GRAMMAR_STAR_STAGE_THRESHOLDS = Object.freeze({
  egg: 1,
  hatch: 15,
  evolve2: 35,
  evolve3: 65,
  mega: 100,
});

/**
 * Per-concept evidence-tier weights. Sum must equal 1.0.
 * 60% of the budget requires retention evidence (retainedAfterSecure),
 * ensuring Mega is unreachable without post-secure review proof.
 */
export const GRAMMAR_CONCEPT_STAR_WEIGHTS = Object.freeze({
  firstIndependentWin: 0.05,
  repeatIndependentWin: 0.10,
  variedPractice: 0.10,
  secureConfidence: 0.15,
  retainedAfterSecure: 0.60,
});

// ---------------------------------------------------------------------------
// Display stage names — child-facing labels (6 named stages: 0-5)
// ---------------------------------------------------------------------------

const DISPLAY_STAGE_NAMES = Object.freeze([
  'Not found yet',   // 0: 0 Stars
  'Egg found',       // 1: 1+ Stars
  'Hatched',         // 2: 15+ Stars
  'Growing',         // 3: 35+ Stars
  'Nearly Mega',     // 4: 65+ Stars
  'Mega',            // 5: 100 Stars
]);

// Next milestone lookup: for each display stage, what is the next threshold?
const NEXT_MILESTONE = Object.freeze([
  { stars: 1, label: 'Egg found' },       // from stage 0 → next is Egg
  { stars: 15, label: 'Hatched' },         // from stage 1 → next is Hatch
  { stars: 35, label: 'Growing' },         // from stage 2 → next is Growing
  { stars: 65, label: 'Nearly Mega' },     // from stage 3 → next is Nearly Mega
  { stars: 100, label: 'Mega' },           // from stage 4 → next is Mega
  null,                                     // stage 5 (Mega) → no next
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// Evidence-tier derivation
// ---------------------------------------------------------------------------

/**
 * Derives the five evidence tiers for a single concept from its mastery node
 * and recent attempts.
 *
 * @param {object} params
 * @param {string} params.conceptId - The concept to evaluate.
 * @param {object|null} params.conceptNode - The mastery node for this concept
 *   (shape: { attempts, correct, wrong, strength, intervalDays, correctStreak }).
 * @param {Array} params.recentAttempts - The engine's recentAttempts array.
 *   Production shape: { conceptIds: string[], result: { correct: boolean },
 *   templateId, firstAttemptIndependent, supportLevelAtScoring, createdAt, ... }.
 *   Legacy flat shape also accepted: { conceptId, correct, ... }.
 * @param {number} [params.nowTs=Date.now()] - Current timestamp (ms). Injected
 *   for deterministic test control of the retainedAfterSecure temporal proof.
 * @returns {{ firstIndependentWin: boolean, repeatIndependentWin: boolean,
 *   variedPractice: boolean, secureConfidence: boolean,
 *   retainedAfterSecure: boolean }}
 */
export function deriveGrammarConceptStarEvidence({ conceptId, conceptNode, recentAttempts = [], nowTs } = {}) {
  const result = {
    firstIndependentWin: false,
    repeatIndependentWin: false,
    variedPractice: false,
    secureConfidence: false,
    retainedAfterSecure: false,
  };

  // Normalise inputs defensively.
  const node = isPlainObject(conceptNode) ? conceptNode : null;
  const attempts = Array.isArray(recentAttempts) ? recentAttempts : [];

  // ---------------------------------------------------------------------------
  // Normaliser: production attempts use { conceptIds: [...], result: { correct } }
  // while legacy test fixtures use { conceptId, correct }. Accept both shapes.
  // Mirrors the pattern in src/subjects/grammar/read-model.js:106.
  // ---------------------------------------------------------------------------
  function matchesConcept(a) {
    if (!isPlainObject(a)) return false;
    if (Array.isArray(a.conceptIds)) return a.conceptIds.includes(conceptId);
    return a.conceptId === conceptId;
  }

  function readCorrect(a) {
    if (isPlainObject(a.result)) return a.result.correct;
    return a.correct;
  }

  // Filter to matching concept entries.
  const conceptAttempts = attempts.filter(matchesConcept);

  // --- firstIndependentWin: at least 1 independent correct ---
  // ADV-001: Use firstAttemptIndependent as the sole gate. A nudge attempt
  // (child got it wrong, retried correctly) has supportLevelAtScoring: 0 but
  // firstAttemptIndependent: false. The previous OR condition let nudges
  // through, violating the invariant "supported answers cannot unlock
  // independent tiers." firstAttemptIndependent is the authoritative signal —
  // it is true only when the child answered correctly on the first attempt
  // with no support of any kind.
  const independentCorrects = conceptAttempts.filter(
    (a) => readCorrect(a) === true && a.firstAttemptIndependent === true,
  );
  if (independentCorrects.length >= 1) {
    result.firstIndependentWin = true;
  }

  // --- repeatIndependentWin: at least 2 distinct independent correct ---
  if (independentCorrects.length >= 2) {
    result.repeatIndependentWin = true;
  }

  // --- variedPractice: at least 2 distinct templateId values from CORRECT answers ---
  // U2: Wrong-answer-only exposure must not contribute. Only correct attempts
  // prove the learner can transfer understanding across varied forms.
  const templateIds = new Set();
  for (const a of conceptAttempts) {
    if (readCorrect(a) === true && typeof a.templateId === 'string' && a.templateId) {
      templateIds.add(a.templateId);
    }
  }
  if (templateIds.size >= 2) {
    result.variedPractice = true;
  }

  // --- secureConfidence: node is secured or meets threshold heuristic ---
  if (node) {
    const strength = safeNum(node.strength);
    const intervalDays = safeNum(node.intervalDays);
    const correctStreak = safeNum(node.correctStreak);

    if (strength >= 0.82 && intervalDays >= 7 && correctStreak >= 3) {
      result.secureConfidence = true;
    }
  }

  // --- retainedAfterSecure: secureConfidence AND post-secure temporal proof ---
  // ADV-003 + U3: The learner must have at least one independent correct
  // whose createdAt is strictly AFTER the estimated first-secure timestamp.
  // securedAtTs is estimated as nowTs - (intervalDays * 86400000). This
  // prevents a learning burst before secure status from satisfying the tier.
  if (result.secureConfidence && node) {
    const ts = typeof nowTs === 'number' && Number.isFinite(nowTs) ? nowTs : Date.now();
    const intervalDays = safeNum(node.intervalDays);
    const securedAtTs = ts - (intervalDays * 86400000);

    const hasPostSecureCorrect = independentCorrects.some((a) => {
      // Entries missing createdAt are excluded from the temporal scan.
      if (typeof a.createdAt !== 'number' || !Number.isFinite(a.createdAt)) return false;
      return a.createdAt > securedAtTs;
    });

    if (hasPostSecureCorrect) {
      result.retainedAfterSecure = true;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Per-monster Star computation
// ---------------------------------------------------------------------------

/**
 * Computes the total Stars for a Grammar monster from a pre-computed
 * evidence map.
 *
 * @param {string} monsterId - One of: bracehart, chronalyx, couronnail, concordium.
 * @param {Object<string, {firstIndependentWin: boolean, repeatIndependentWin: boolean,
 *   variedPractice: boolean, secureConfidence: boolean,
 *   retainedAfterSecure: boolean}>} conceptEvidenceMap - Evidence per concept.
 * @returns {{ stars: number, starMax: number, stageName: string,
 *   displayStage: number, nextMilestoneStars: number|null,
 *   nextMilestoneLabel: string|null }}
 */
export function computeGrammarMonsterStars(monsterId, conceptEvidenceMap = {}) {
  const conceptIds = conceptIdsForGrammarMonster(monsterId);
  const conceptCount = conceptIds.length;

  if (conceptCount === 0) {
    return _buildStarResult(0);
  }

  const conceptBudget = GRAMMAR_MONSTER_STAR_MAX / conceptCount;
  let totalStars = 0;
  let hasAnyEvidence = false;

  for (const conceptId of conceptIds) {
    const evidence = isPlainObject(conceptEvidenceMap[conceptId])
      ? conceptEvidenceMap[conceptId]
      : {};

    let weightSum = 0;
    let conceptHasEvidence = false;

    for (const [tier, weight] of Object.entries(GRAMMAR_CONCEPT_STAR_WEIGHTS)) {
      if (evidence[tier] === true) {
        weightSum += weight;
        conceptHasEvidence = true;
      }
    }

    if (conceptHasEvidence) {
      hasAnyEvidence = true;
    }

    // Per-concept contribution is NOT floored before summing.
    totalStars += conceptBudget * weightSum;
  }

  // ADV-002: Epsilon-aware floor to avoid IEEE 754 boundary traps.
  // e.g. Concordium 18 concepts at weight 0.35 yields 34.999... instead of
  // 35, causing Math.floor to return 34 (stage 2) instead of 35 (stage 3).
  // Adding a tiny epsilon before flooring fixes all such boundary cases.
  let stars = Math.floor(totalStars + 1e-9);

  // Per-monster floor guarantee: if any concept has any evidence, at least 1 Star.
  if (hasAnyEvidence && stars < 1) {
    stars = 1;
  }

  // Cap at GRAMMAR_MONSTER_STAR_MAX.
  stars = Math.min(GRAMMAR_MONSTER_STAR_MAX, stars);

  return _buildStarResult(stars);
}

function _buildStarResult(stars) {
  const displayStage = grammarStarDisplayStage(stars);
  const milestone = NEXT_MILESTONE[displayStage] || null;

  return {
    stars,
    starMax: GRAMMAR_MONSTER_STAR_MAX,
    stageName: grammarStarStageName(stars),
    displayStage,
    nextMilestoneStars: milestone ? milestone.stars : null,
    nextMilestoneLabel: milestone ? milestone.label : null,
  };
}

// ---------------------------------------------------------------------------
// Stage derivation
// ---------------------------------------------------------------------------

/**
 * Maps Stars to internal stage 0-4 for compatibility with the existing
 * monster system (stages 0 = not found, 1 = egg, 2 = hatch/growing,
 * 3 = nearly mega, 4 = mega).
 *
 * Stage mapping:
 *   0 Stars        → 0 (Not found)
 *   1-14 Stars     → 1 (Egg found)
 *   15-64 Stars    → 2 (Hatched / Growing)
 *   65-99 Stars    → 3 (Nearly Mega)
 *   100 Stars      → 4 (Mega)
 */
export function grammarStarStageFor(stars) {
  const s = safeNum(stars);
  if (s >= GRAMMAR_STAR_STAGE_THRESHOLDS.mega) return 4;
  if (s >= GRAMMAR_STAR_STAGE_THRESHOLDS.evolve3) return 3;
  if (s >= GRAMMAR_STAR_STAGE_THRESHOLDS.hatch) return 2;
  if (s >= GRAMMAR_STAR_STAGE_THRESHOLDS.egg) return 1;
  return 0;
}

/**
 * Maps Stars to display stage 0-5 for the 6 named child-facing stages.
 *
 * Display stage mapping:
 *   0 Stars        → 0 (Not found yet)
 *   1-14 Stars     → 1 (Egg found)
 *   15-34 Stars    → 2 (Hatched)
 *   35-64 Stars    → 3 (Growing)
 *   65-99 Stars    → 4 (Nearly Mega)
 *   100 Stars      → 5 (Mega)
 */
export function grammarStarDisplayStage(stars) {
  const s = safeNum(stars);
  if (s >= GRAMMAR_STAR_STAGE_THRESHOLDS.mega) return 5;
  if (s >= GRAMMAR_STAR_STAGE_THRESHOLDS.evolve3) return 4;
  if (s >= GRAMMAR_STAR_STAGE_THRESHOLDS.evolve2) return 3;
  if (s >= GRAMMAR_STAR_STAGE_THRESHOLDS.hatch) return 2;
  if (s >= GRAMMAR_STAR_STAGE_THRESHOLDS.egg) return 1;
  return 0;
}

/**
 * Returns the child-facing stage label for a given Star count.
 */
export function grammarStarStageName(stars) {
  return DISPLAY_STAGE_NAMES[grammarStarDisplayStage(stars)] || 'Not found yet';
}

// ---------------------------------------------------------------------------
// Legacy migration — Star floor from pre-P5 ratio-based stage
// ---------------------------------------------------------------------------

/**
 * Maps a pre-P5 legacy stage (0-4 from the old ratio-based grammarStageFor)
 * to a Star floor so existing learners never see a stage regression after
 * the P5 Star curve ships.
 *
 * Legacy stage mapping:
 *   stage 0 → 0 Stars floor (not found)
 *   stage 1 → 1 Star floor  (egg found preserved)
 *   stage 2 → 15 Stars floor (hatched preserved)
 *   stage 3 → 35 Stars floor (growing preserved)
 *   stage 4 → 100 Stars floor (mega preserved)
 */
const LEGACY_STAGE_STAR_FLOOR = Object.freeze([0, 1, 15, 35, 100]);

export function legacyStarFloorFromStage(legacyStage) {
  const s = Math.max(0, Math.min(4, Math.floor(safeNum(legacyStage))));
  return LEGACY_STAGE_STAR_FLOOR[s] || 0;
}

// ---------------------------------------------------------------------------
// starHighWater latch — monotonicity guarantee
// ---------------------------------------------------------------------------

/**
 * Applies the `starHighWater` latch to produce the final display Stars.
 *
 * The latch guarantees Stars are monotonically non-decreasing:
 *   displayStars = max(computedStars, starHighWater, legacyFloor)
 *
 * @param {object} params
 * @param {number} params.computedStars — Stars derived from concept evidence
 *   (0 when no concept nodes are available on the reward-layer read path).
 * @param {number} params.starHighWater — persisted high-water mark from the
 *   reward state entry. Absent or corrupted values treated as 0.
 * @param {number} params.legacyStage — the old ratio-based stage (0-4) for
 *   pre-P5 learners who have no starHighWater field. Pass 0 for post-P5.
 * @returns {{ displayStars: number, updatedHighWater: number }}
 */
export function applyStarHighWaterLatch({ computedStars = 0, starHighWater = 0, legacyStage = 0 } = {}) {
  const computed = Math.max(0, Math.floor(safeNum(computedStars)));
  const hw = Math.max(0, Math.floor(safeNum(starHighWater)));
  const floor = legacyStarFloorFromStage(legacyStage);

  const displayStars = Math.min(
    GRAMMAR_MONSTER_STAR_MAX,
    Math.max(computed, hw, floor),
  );
  const updatedHighWater = Math.min(GRAMMAR_MONSTER_STAR_MAX, Math.max(hw, displayStars));

  return { displayStars, updatedHighWater };
}
