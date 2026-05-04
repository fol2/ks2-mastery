# Grammar QG P10 — Marking Matrix (Full Variant Expansion)

Generated: 2026-05-04T02:26:08.526Z
Content release: grammar-qg-p19-2026-05-04
Seed range: 1..5
Total entries: 190
Variant categories: 9

## Categories tested

| # | Category | Description |
|---|----------|-------------|
| 1 | goldenAnswers | All accepted golden answers mark correct |
| 2 | acceptedVariants | Whitespace-normalised variants mark correct |
| 3 | nearMisses | First word removed — marks incorrect |
| 4 | rawPromptProbes | Empty / junk — marks incorrect |
| 5 | smartPunctuationVariants | Curly <-> straight punctuation |
| 6 | caseVariants | toLowerCase / toUpperCase |
| 7 | commonChildMistakes | Last word duplicated — marks incorrect |
| 8 | expectedScore | Pass/fail expectations per category |
| 9 | misconceptionTag | Evaluator misconception for near-miss |

## Summary by template

| Template | Seeds | Golden Pass | Accepted Pass | NearMiss Fail | Probe Fail | Smart Pass | Case Pass | Mistake Fail |
|----------|-------|-------------|---------------|---------------|------------|------------|-----------|--------------|
| fix_fronted_adverbial | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| combine_clauses_rewrite | 5 | 10/10 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| parenthesis_fix_sentence | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| speech_punctuation_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc_fronted_adverbial_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc_colon_list_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc_dash_boundary_fix | 5 | 15/15 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc_speech_punctuation_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc3_clause_join_rewrite | 5 | 10/10 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc3_parenthesis_commas_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc3_hyphen_fix_meaning | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| qg_p14_subject_object_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p14_subordinate_clauses_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p14_tense_aspect_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p14_expanded_noun_phrases_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_boundary_punctuation_boundary_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_clauses_combine_clause | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_hyphen_ambiguity_hyphen_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_parenthesis_commas_parenthesis_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_relative_clauses_punctuate_relative_clause | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_speech_punctuation_speech_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_standard_english_standard_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_tense_aspect_tense_editing | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_active_passive_tense_preserving_voice | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_boundary_punctuation_insert_boundary_mark | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_clauses_join_with_given_conjunction | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_clauses_punctuate_subordinate_first | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_hyphen_ambiguity_fix_ambiguous_phrase | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_noun_phrases_expand_plain_noun | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_parenthesis_commas_add_parenthesis_commas | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_pronouns_cohesion_fix_pronoun_reference | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_relative_clauses_add_commas_non_defining | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_sentence_functions_repair_wrong_function_punctuation | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_speech_punctuation_fix_punctuation_outside_marks | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_speech_punctuation_punctuate_direct_speech | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_standard_english_fix_nonstandard | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_parenthesis_commas_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_speech_punctuation_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
