// Thin re-export of shared/grammar/grammar-stars.js for the mastery module
// tree. Callers in the mastery layer import from here; the canonical
// implementation lives in shared/grammar/grammar-stars.js.
//
// Plan: docs/plans/2026-04-27-001-feat-grammar-phase5-star-curve-landing-plan.md (U2).
export {
  GRAMMAR_MONSTER_STAR_MAX,
  GRAMMAR_STAR_STAGE_THRESHOLDS,
  GRAMMAR_CONCEPT_STAR_WEIGHTS,
  deriveGrammarConceptStarEvidence,
  computeGrammarMonsterStars,
  grammarStarStageFor,
  grammarStarDisplayStage,
  grammarStarStageName,
  GRAMMAR_DISPLAY_STATES,
  grammarDisplayStateForStars,
  legacyStarFloorFromStage,
  applyStarHighWaterLatch,
} from '../../../../shared/grammar/grammar-stars.js';
