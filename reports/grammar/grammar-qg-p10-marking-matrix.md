# Grammar QG P10 — Marking Matrix (Full Variant Expansion)

Generated: 2026-05-03T21:36:27.522Z
Content release: grammar-qg-p19-2026-05-04
Seed range: 1..5
Total entries: 475
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
| tense_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| active_passive_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| parenthesis_fix_sentence | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| speech_punctuation_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc_fronted_adverbial_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc_colon_list_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc_dash_boundary_fix | 5 | 15/15 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc_speech_punctuation_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc2_standard_english_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| proc2_passive_to_active | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| proc3_clause_join_rewrite | 5 | 10/10 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc3_parenthesis_commas_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc3_hyphen_fix_meaning | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc3_apostrophe_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p14_standard_english_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p14_subject_object_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p14_subordinate_clauses_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p14_tense_aspect_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p14_expanded_noun_phrases_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_active_passive_voice_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_adverbials_move_adverbial | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_apostrophes_possession_possessive_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_boundary_punctuation_boundary_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_clauses_combine_clause | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_formality_formal_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_hyphen_ambiguity_hyphen_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_noun_phrases_build_np_context | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_parenthesis_commas_parenthesis_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_parenthesis_commas_parenthesis_replace | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_pronouns_cohesion_cohesion_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_relative_clauses_punctuate_relative_clause | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_speech_punctuation_speech_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_standard_english_standard_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_standard_english_standard_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_tense_aspect_tense_editing | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_tense_aspect_tense_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_active_passive_rewrite_voice | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_active_passive_tense_preserving_voice | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_adverbials_move_adverbial_to_front | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_boundary_punctuation_insert_boundary_mark | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_clauses_join_with_given_conjunction | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_clauses_punctuate_subordinate_first | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_formality_formal_sentence_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_hyphen_ambiguity_fix_ambiguous_phrase | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_modal_verbs_change_force_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_noun_phrases_expand_plain_noun | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_parenthesis_commas_add_parenthesis_commas | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_parenthesis_commas_replace_brackets_with_commas | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_pronouns_cohesion_fix_pronoun_reference | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_pronouns_cohesion_reduce_repetition_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_relative_clauses_add_commas_non_defining | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_sentence_functions_repair_wrong_function_punctuation | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_speech_punctuation_fix_punctuation_outside_marks | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_speech_punctuation_punctuate_direct_speech | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_standard_english_fix_nonstandard | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_standard_english_rewrite_standard_english | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_subject_object_rewrite_preserve_roles | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_tense_aspect_fix_wrong_form | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_tense_aspect_rewrite_to_named_form | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_active_passive_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_adverbials_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_apostrophes_possession_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_boundary_punctuation_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_clauses_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_formality_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_hyphen_ambiguity_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_modal_verbs_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_noun_phrases_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_parenthesis_commas_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_pronouns_cohesion_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_relative_clauses_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_sentence_functions_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_speech_punctuation_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_standard_english_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_subject_object_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_tense_aspect_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_word_classes_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_active_passive_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_apostrophes_possession_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_boundary_punctuation_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_clauses_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_formality_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_hyphen_ambiguity_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_modal_verbs_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_noun_phrases_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_parenthesis_commas_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_pronouns_cohesion_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_relative_clauses_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_speech_punctuation_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_standard_english_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_subject_object_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_tense_aspect_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_word_classes_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
