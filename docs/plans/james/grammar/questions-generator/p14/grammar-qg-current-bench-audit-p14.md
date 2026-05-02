# Grammar QG Current Bench Audit — P14 line

Source: uploaded lean ZIP `ks2-mastery-lean-04302325.zip`, local import of `worker/src/subjects/grammar/content.js`.

## Key numbers

- Current template families: 78
- Current 30-seed generated instances: 2340
- Current template-family problem: many certified templates are shallow fixed banks, so certification count overstates learner-visible variety.
- Low-diversity families with 1–3 learner-visible surfaces across 30 seeds: 23

## Low-diversity families to deepen first

| Surfaces / 30 seeds | Prompts | Input | Template | Concepts |
|---:|---:|---|---|---|
| 2 | 2 | multi | `build_noun_phrase` | noun_phrases |
| 2 | 2 | single_choice | `explain_reason_choice` | adverbials, standard_english |
| 2 | 1 | multi | `formality_pairs` | formality |
| 2 | 1 | single_choice | `fronted_adverbial_choose` | adverbials |
| 2 | 2 | textarea | `parenthesis_fix_sentence` | parenthesis_commas |
| 2 | 2 | single_choice | `parenthesis_replace_choice` | parenthesis_commas |
| 2 | 1 | single_choice | `pronoun_cohesion_choice` | pronouns_cohesion |
| 2 | 1 | checkbox_list | `question_mark_select` | sentence_functions, speech_punctuation |
| 2 | 2 | single_choice | `relative_clause_complete` | relative_clauses |
| 2 | 1 | multi | `standard_english_pairs` | standard_english |
| 2 | 2 | textarea | `standard_fix_sentence` | standard_english |
| 3 | 3 | textarea | `active_passive_rewrite` | active_passive |
| 3 | 3 | single_choice | `apostrophe_possession_choice` | apostrophes_possession |
| 3 | 3 | textarea | `combine_clauses_rewrite` | clauses |
| 3 | 2 | single_choice | `expanded_noun_phrase_choice` | noun_phrases |
| 3 | 3 | textarea | `fix_fronted_adverbial` | adverbials |
| 3 | 3 | single_choice | `modal_verb_choice` | modal_verbs |
| 3 | 1 | single_choice | `relative_clause_identify` | relative_clauses |
| 3 | 3 | textarea | `speech_punctuation_fix` | speech_punctuation |
| 3 | 3 | single_choice | `subject_object_choice` | subject_object |
| 3 | 3 | single_choice | `subordinate_clause_choice` | clauses |
| 3 | 3 | single_choice | `tense_form_choice` | tense_aspect |
| 3 | 3 | textarea | `tense_rewrite` | tense_aspect |

## Action from this audit

The manual bench expansion pack should not only add more generated seeds. It should add new hand-authored template families, especially for the low-diversity families listed above, and should be integrated as draft-only until quality gates pass.
