// Canonical Grammar concept-to-monster mapping. Pure frozen data with zero
// platform imports. Both the shared Star module and the platform mastery
// module import from here so the mapping has a single dependency-safe source.
//
// Phase 7 U1: extracted from src/platform/game/mastery/grammar.js to break
// the shared→platform dependency direction violation.

export const GRAMMAR_MONSTER_CONCEPTS = Object.freeze({
  bracehart: Object.freeze([
    'sentence_functions',
    'clauses',
    'relative_clauses',
    'noun_phrases',
    'active_passive',
    'subject_object',
  ]),
  chronalyx: Object.freeze([
    'tense_aspect',
    'modal_verbs',
    'adverbials',
    'pronouns_cohesion',
  ]),
  couronnail: Object.freeze([
    'word_classes',
    'standard_english',
    'formality',
  ]),
});

export const GRAMMAR_AGGREGATE_CONCEPTS = Object.freeze([
  'sentence_functions',
  'word_classes',
  'noun_phrases',
  'adverbials',
  'clauses',
  'relative_clauses',
  'tense_aspect',
  'standard_english',
  'pronouns_cohesion',
  'formality',
  'active_passive',
  'subject_object',
  'modal_verbs',
  'parenthesis_commas',
  'speech_punctuation',
  'apostrophes_possession',
  'boundary_punctuation',
  'hyphen_ambiguity',
]);

export const GRAMMAR_CONCEPT_TO_MONSTER = Object.freeze(Object.fromEntries(
  Object.entries(GRAMMAR_MONSTER_CONCEPTS)
    .flatMap(([monsterId, conceptIds]) => conceptIds.map((conceptId) => [conceptId, monsterId])),
));

export function conceptIdsForGrammarMonster(monsterId) {
  if (monsterId === 'concordium') return GRAMMAR_AGGREGATE_CONCEPTS;
  return GRAMMAR_MONSTER_CONCEPTS[monsterId] || [];
}
