# Grammar QG P10 — Marking Matrix (Full Variant Expansion)

Generated: 2026-05-01T16:23:10.924Z
Content release: grammar-qg-p14-2026-05-01
Seed range: 1..5
Total entries: 120
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
