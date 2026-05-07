// Public mastery API. Subject hooks and the legacy `monster-system.js` shim
// re-export from here so callers see one stable surface even as internal
// modules are reshaped.
export {
  ensureMonsterBranches,
  loadMonsterState,
  saveMonsterState,
} from './shared.js';
export { derivePhaeton } from './phaeton.js';
export {
  monsterIdForSpellingYearBand,
  monsterIdForSpellingWord,
  monsterSummary,
  monsterSummaryFromState,
  monsterSummaryFromSpellingAnalytics,
  progressForMonster,
  recordMonsterMastery,
} from './spelling.js';
export {
  progressForPunctuationMonster,
  punctuationMonsterSummaryFromState,
  recordPunctuationRewardUnitMastery,
  updatePunctuationStarHighWater,
} from './punctuation.js';
export {
  GRAMMAR_AGGREGATE_CONCEPTS,
  GRAMMAR_CONCEPT_TO_MONSTER,
  GRAMMAR_MONSTER_CONCEPTS,
  GRAMMAR_REWARD_RELEASE_ID,
  activeGrammarMonsterSummaryFromState,
  grammarConceptIdFromMasteryKey,
  grammarMasteryKey,
  grammarMonsterSummaryFromState,
  monsterIdForGrammarConcept,
  normaliseGrammarRewardState,
  progressForGrammarMonster,
  recordGrammarConceptMastery,
  updateGrammarStarHighWater,
} from './grammar.js';
export {
  GRAMMAR_GRAND_MONSTER_ID,
  GRAMMAR_MONSTER_IDS,
  GRAMMAR_RESERVED_MONSTER_IDS,
  READING_MONSTER_IDS,
} from './shared.js';
export {
  READING_DIRECT_STAR_THRESHOLDS,
  READING_GRAND_STAR_THRESHOLDS,
  READING_REWARD_RELEASE_ID,
  READING_SKILL_TO_MONSTER,
  activeReadingMonsterSummaryFromState,
  monsterIdForReadingSkill,
  progressForReadingMonster,
  readingMasteryKey,
  recordReadingSkillMastery,
} from './reading.js';
