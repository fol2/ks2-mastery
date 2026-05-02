# Grammar QG P10 — Marking Matrix (Full Variant Expansion)

Generated: 2026-05-02T22:20:19.736Z
Content release: grammar-qg-p18-2026-05-02
Seed range: 1..5
Total entries: 945
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
| qg_p14_fronted_adverbials_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p14_subject_object_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p14_subordinate_clauses_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p14_tense_aspect_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p14_speech_punctuation_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p14_expanded_noun_phrases_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p14_parenthesis_commas_constructed_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_active_passive_voice_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_adverbials_fronted_adverbial_comma | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_adverbials_move_adverbial | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_apostrophes_possession_possessive_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_boundary_punctuation_boundary_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_clauses_combine_clause | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_clauses_repair_sub_fragment | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_formality_formal_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_hyphen_ambiguity_hyphen_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_noun_phrases_build_np_context | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_parenthesis_commas_parenthesis_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_parenthesis_commas_parenthesis_replace | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_pronouns_cohesion_cohesion_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_relative_clauses_punctuate_relative_clause | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_sentence_functions_punctuate_by_function | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_speech_punctuation_speech_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_standard_english_standard_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_standard_english_standard_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_tense_aspect_tense_editing | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_tense_aspect_tense_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_active_passive_agent_object_explain | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_active_passive_rewrite_voice | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_active_passive_tense_preserving_voice | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_adverbials_explain_fronted_comma | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_adverbials_fronted_comma_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_adverbials_move_adverbial_to_front | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_apostrophes_possession_explain_position | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_apostrophes_possession_fix_missing_apostrophe | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_boundary_punctuation_explain_colon_semicolon_dash | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_boundary_punctuation_insert_boundary_mark | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_clauses_explain_subordination | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_clauses_join_with_given_conjunction | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_clauses_punctuate_subordinate_first | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_formality_explain_formality_effect | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_formality_formal_sentence_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_hyphen_ambiguity_explain_hyphen_meaning | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_hyphen_ambiguity_fix_ambiguous_phrase | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_modal_verbs_change_force_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_modal_verbs_modal_context_explain | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_noun_phrases_build_with_given_head | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_noun_phrases_expand_plain_noun | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_noun_phrases_explain_expansion | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_parenthesis_commas_add_parenthesis_commas | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_parenthesis_commas_explain_parenthesis | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_parenthesis_commas_replace_brackets_with_commas | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_pronouns_cohesion_explain_cohesion | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_pronouns_cohesion_fix_pronoun_reference | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_pronouns_cohesion_reduce_repetition_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_relative_clauses_add_commas_non_defining | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_relative_clauses_explain_relative_clause | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_sentence_functions_explain_function_reasoning | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_sentence_functions_repair_wrong_function_punctuation | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_speech_punctuation_explain_speech_rule | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_speech_punctuation_fix_punctuation_outside_marks | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_speech_punctuation_punctuate_direct_speech | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_standard_english_explain_standard_choice | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_standard_english_fix_nonstandard | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_standard_english_rewrite_standard_english | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_subject_object_explain_roles | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_subject_object_rewrite_preserve_roles | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_tense_aspect_fix_wrong_form | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_tense_aspect_form_explanation | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_tense_aspect_rewrite_to_named_form | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_word_classes_build_word_class_sentence | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_word_classes_same_word_different_job | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_active_passive_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_active_passive_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_active_passive_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_adverbials_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_adverbials_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_adverbials_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_apostrophes_possession_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_apostrophes_possession_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_apostrophes_possession_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_boundary_punctuation_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_boundary_punctuation_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_boundary_punctuation_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_clauses_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_clauses_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_clauses_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_formality_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_formality_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_formality_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_hyphen_ambiguity_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_hyphen_ambiguity_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_hyphen_ambiguity_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_modal_verbs_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_modal_verbs_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_modal_verbs_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_noun_phrases_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_noun_phrases_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_noun_phrases_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_parenthesis_commas_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_parenthesis_commas_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_parenthesis_commas_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_pronouns_cohesion_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_pronouns_cohesion_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_pronouns_cohesion_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_relative_clauses_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_relative_clauses_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_relative_clauses_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_sentence_functions_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_sentence_functions_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_sentence_functions_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_speech_punctuation_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_speech_punctuation_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_speech_punctuation_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_standard_english_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_standard_english_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_standard_english_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_subject_object_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_subject_object_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_subject_object_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_tense_aspect_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_tense_aspect_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_tense_aspect_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_word_classes_misconception_repair | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_word_classes_transfer_apply | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p17_word_classes_written_reason | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_active_passive_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_active_passive_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_active_passive_subject_object_voice_subject_object_roles | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_adverbials_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_adverbials_clauses_adverbial_clause_join | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_adverbials_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_apostrophes_possession_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_apostrophes_possession_hyphen_ambiguity_possession_hyphen_precision | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_apostrophes_possession_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_boundary_punctuation_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_boundary_punctuation_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_boundary_punctuation_speech_punctuation_boundary_speech_punctuation | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_clauses_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_clauses_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_formality_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_formality_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_hyphen_ambiguity_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_hyphen_ambiguity_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_modal_verbs_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_modal_verbs_formality_modal_formality_strength | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_modal_verbs_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_noun_phrases_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_noun_phrases_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_parenthesis_commas_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_parenthesis_commas_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_pronouns_cohesion_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_pronouns_cohesion_formality_cohesion_formality_choice | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_pronouns_cohesion_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_relative_clauses_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_relative_clauses_parenthesis_commas_relative_parenthesis_punctuation | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_relative_clauses_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_sentence_functions_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_sentence_functions_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_sentence_functions_speech_punctuation_function_speech_boundary | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_speech_punctuation_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_speech_punctuation_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_standard_english_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_standard_english_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_subject_object_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_subject_object_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_tense_aspect_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_tense_aspect_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_tense_aspect_standard_english_tense_standard_register | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_word_classes_application_transfer | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_word_classes_noun_phrases_word_class_np_roles | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_word_classes_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
