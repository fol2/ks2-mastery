# Grammar QG P10 — Marking Matrix (Full Variant Expansion)

Generated: 2026-05-11T13:25:36.901Z
Content release: grammar-qg-p21-2026-05-11
Seed range: 1..5
Total entries: 160
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
| parenthesis_fix_sentence | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| speech_punctuation_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc_fronted_adverbial_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc_colon_list_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc_dash_boundary_fix | 5 | 15/15 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc_speech_punctuation_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc3_parenthesis_commas_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| proc3_hyphen_fix_meaning | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| qg_p18_p15_adverbials_fronted_adverbial_comma | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| qg_p18_p15_apostrophes_possession_possessive_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_hyphen_ambiguity_hyphen_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 5/10 | 5/5 |
| qg_p18_p15_sentence_functions_punctuate_by_function | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| qg_p18_p15_speech_punctuation_speech_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| qg_p18_p15_standard_english_standard_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p15_tense_aspect_tense_editing | 5 | 10/10 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_adverbials_fronted_comma_fix | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| qg_p18_p16_apostrophes_possession_fix_missing_apostrophe | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p16_hyphen_ambiguity_fix_ambiguous_phrase | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 5/10 | 5/5 |
| qg_p18_p16_parenthesis_commas_add_parenthesis_commas | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| qg_p18_p18_apostrophes_possession_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_boundary_punctuation_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_clauses_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_hyphen_ambiguity_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 5/10 | 5/5 |
| qg_p18_p18_modal_verbs_precision_repair_or_rewrite | 5 | 10/10 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_parenthesis_commas_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| qg_p18_p18_relative_clauses_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_sentence_functions_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| qg_p18_p18_speech_punctuation_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 0/10 | 5/5 |
| qg_p18_p18_standard_english_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_subject_object_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
| qg_p18_p18_word_classes_precision_repair_or_rewrite | 5 | 5/5 | 10/10 | 5/5 | 15/15 | 10/10 | 10/10 | 5/5 |
