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
} from './grammar.js';
