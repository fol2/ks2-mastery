# Grammar QG P15 Manual 1000+ Expansion Pack

**Status:** draft for review; not scheduler-ready.  
**Base release:** `grammar-qg-p14-2026-05-01`  
**Pack id:** `grammar-qg-p15-manual-expansion-1000`  
**Language:** UK English.

## Purpose

This is a human-authored content bench expansion pack for Grammar QG. It is intentionally separate from runtime certification. The goal is to deepen the bench so children do not repeatedly see the same few fixed-bank questions.

The pack is not an AI-integration layer. It is expert-authored content, represented as structured JSON so engineering can import it into a draft-only Grammar QG content bank.

## Counts

| Metric | Count |
|---|---:|
| Additional cases | 1080 |
| New template families | 90 |
| Concepts covered | 18 |
| Cases per concept | 60 |
| Unique prompt texts | 861 |
| Unique learner-visible surfaces | 1069 |

## Concept coverage

| Concept | Cases |
|---|---:|
| active_passive | 60 |
| adverbials | 60 |
| apostrophes_possession | 60 |
| boundary_punctuation | 60 |
| clauses | 60 |
| formality | 60 |
| hyphen_ambiguity | 60 |
| modal_verbs | 60 |
| noun_phrases | 60 |
| parenthesis_commas | 60 |
| pronouns_cohesion | 60 |
| relative_clauses | 60 |
| sentence_functions | 60 |
| speech_punctuation | 60 |
| standard_english | 60 |
| subject_object | 60 |
| tense_aspect | 60 |
| word_classes | 60 |

## Input type coverage

| Input type | Cases |
|---|---:|
| single_choice | 732 |
| table_choice | 108 |
| text | 60 |
| textarea | 180 |

## Question type coverage

| Question type | Cases |
|---|---:|
| build | 12 |
| choose | 324 |
| classify | 108 |
| explain | 216 |
| fill | 36 |
| fix | 120 |
| identify | 156 |
| rewrite | 108 |

## Sample first cases

- `grammar-qg-p15-manual-expansion-1000:sentence_functions:identify_function:01` — What is the function of this sentence? Close the library door quietly.
- `grammar-qg-p15-manual-expansion-1000:sentence_functions:punctuate_by_function:01` — Add the correct ending punctuation for the command: Close the library door quietly
- `grammar-qg-p15-manual-expansion-1000:sentence_functions:explain_function:01` — Why is this sentence a command? Close the library door quietly.
- `grammar-qg-p15-manual-expansion-1000:sentence_functions:function_contrast:01` — Which label best matches the sentence below? Close the library door quietly.
- `grammar-qg-p15-manual-expansion-1000:sentence_functions:sat_style_function:01` — Tick the sentence function for this sentence: Close the library door quietly.
- `grammar-qg-p15-manual-expansion-1000:sentence_functions:identify_function:02` — What is the function of this sentence? How bright the comet looked!
- `grammar-qg-p15-manual-expansion-1000:sentence_functions:punctuate_by_function:02` — Add the correct ending punctuation for the exclamation: How bright the comet looked
- `grammar-qg-p15-manual-expansion-1000:sentence_functions:explain_function:02` — Why is this sentence a exclamation? How bright the comet looked!
- `grammar-qg-p15-manual-expansion-1000:sentence_functions:function_contrast:02` — Which label best matches the sentence below? How bright the comet looked!
- `grammar-qg-p15-manual-expansion-1000:sentence_functions:sat_style_function:02` — Tick the sentence function for this sentence: How bright the comet looked!
- `grammar-qg-p15-manual-expansion-1000:sentence_functions:identify_function:03` — What is the function of this sentence? Did Maya remember her reading journal?
- `grammar-qg-p15-manual-expansion-1000:sentence_functions:punctuate_by_function:03` — Add the correct ending punctuation for the question: Did Maya remember her reading journal

## Scheduler and review rule

Do not schedule this pack directly. Import as `draft_for_review`, generate a reviewer pack, run answerability/oracle/marking/distractor/read-aloud checks, then promote only cases with complete evidence.
