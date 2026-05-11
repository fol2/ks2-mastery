---
title: "Grammar answer-spec migration audit"
type: audit
status: p21-updated
date: 2026-05-11
plan: docs/plans/james/hotfixes/4. grammar-qg-p21-pool-expansion-package/contract/grammar-qg-p21-pool-expansion-contract.md
unit: QG-P21
---

# Grammar answer-spec migration audit

This document is the per-template classification and shipped-state audit for the Grammar answer-spec migration. It inventories every one of the 546 Grammar templates (357 selected-response + 189 constructed-response) with the target `answerSpec.kind`, a golden accepted answer, near-miss examples that must be rejected, and migration priority. QG P21 promotes the pool-expansion release under `grammar-qg-p21-2026-05-11`; older QG baselines remain frozen for regression comparison.

The authoritative answer-spec kind list lives at `worker/src/subjects/grammar/answer-spec.js` (`ANSWER_SPEC_KINDS`). Every row below proposes one of those kinds; the gate test asserts the set membership.

QG P21 keeps selected-response rows on deterministic declarative answer specs and keeps genuinely open constructed responses as non-scored manual-review-only. Current live metadata: 520 generated templates, 26 fixed templates, 245 templates with specialised declared answer specs (exact: 301, manualReviewOnly: 157, multiField: 56, normalisedText: 12, punctuationPattern: 20).

## 1. Current denominator

- **546 templates total.** Confirmed by `GRAMMAR_TEMPLATES.length === 546` in `worker/src/subjects/grammar/content.js`. Split: 357 `isSelectedResponse: true`, 189 `isSelectedResponse: false`.
- **Selected-response rows keep `NO` release-id bump for answer-spec migration.** Their mark result stays option-value deterministic.
- **Constructed-response rows require release-id discipline.** Every constructed-response row is marked `YES` for release-id bump because changing accepted text, punctuation tolerance, or manual-review routing invalidates stored answer evidence.
- **P1 focus concepts remain high priority.** Rows carrying any of the six P1 focus concept ids stay `high` priority.

## 2. Template classification table

Every row records: template id, concept id(s), question type, current marking path, proposed `answerSpec.kind`, a golden accepted answer, at least one near-miss that must be rejected, priority, and whether the migration requires a `contentReleaseId` bump.

| Template id | Concept id(s) | Question type | Current marking path | Proposed `answerSpec.kind` | Golden accepted | Near-miss to reject | Priority | Release-id bump |
|---|---|---|---|---|---|---|---|---|
| `sentence_type_table` | sentence_functions | `classify` | selected-response option-value equality | `exact` | Template oracle response | At least one row uses a distractor option | low | NO |
| `question_mark_select` | sentence_functions, speech_punctuation | `identify` | selected-response option-value equality | `exact` | Did the train arrive before noon, Is the platform open yet | A partial or extra selection | low | NO |
| `word_class_underlined_choice` | word_classes | `identify` | selected-response option-value equality | `exact` | verb | adjective | low | NO |
| `identify_words_in_sentence` | word_classes | `identify` | selected-response option-value equality | `exact` | She, it, them, they | A partial or extra selection | low | NO |
| `expanded_noun_phrase_choice` | noun_phrases | `choose` | selected-response option-value equality | `exact` | the tall boy with muddy boots | ran across the yard | low | NO |
| `build_noun_phrase` | noun_phrases | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `fronted_adverbial_choose` | adverbials | `choose` | selected-response option-value equality | `exact` | During the storm, the old gate rattled loudly. | The old gate rattled loudly during the storm. | low | NO |
| `fix_fronted_adverbial` | adverbials | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `subordinate_clause_choice` | clauses | `identify` | selected-response option-value equality | `exact` | Although the wind was strong | the boat reached | low | NO |
| `combine_clauses_rewrite` | clauses | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `relative_clause_identify` | relative_clauses | `choose` | selected-response option-value equality | `exact` | The teacher who organised the trip checked the register. | When the teacher organised the trip, she checked the register. | low | NO |
| `relative_clause_complete` | relative_clauses | `build` | selected-response option-value equality | `exact` | that was locked outside | because it was outside | low | NO |
| `tense_form_choice` | tense_aspect | `fill` | selected-response option-value equality | `exact` | marked | has marked | low | NO |
| `tense_rewrite` | tense_aspect | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `standard_english_pairs` | standard_english | `choose` | selected-response option-value equality | `exact` | Template oracle response | A plausible but incorrect response | low | NO |
| `pronoun_cohesion_choice` | pronouns_cohesion | `choose` | selected-response option-value equality | `exact` | Ben gave Luca the map because he was carrying too many bags. | Ben gave Luca the map because Ben was carrying too many bags. | high | NO |
| `formality_pairs` | formality | `choose` | selected-response option-value equality | `exact` | Template oracle response | A plausible but incorrect response | high | NO |
| `active_passive_rewrite` | active_passive | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `subject_object_choice` | subject_object | `identify` | selected-response option-value equality | `exact` | the heavy gate | Maya | high | NO |
| `modal_verb_choice` | modal_verbs | `choose` | selected-response option-value equality | `exact` | The bus might arrive at nine. | The bus will arrive at nine. | high | NO |
| `parenthesis_replace_choice` | parenthesis_commas | `choose` | selected-response option-value equality | `exact` | dashes | question marks | low | NO |
| `parenthesis_fix_sentence` | parenthesis_commas | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `speech_punctuation_fix` | speech_punctuation | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `apostrophe_possession_choice` | apostrophes_possession | `choose` | selected-response option-value equality | `exact` | children's | childrens' | low | NO |
| `explain_reason_choice` | adverbials, standard_english | `explain` | selected-response option-value equality | `exact` | Because Standard English uses ‘were’ with ‘we’. | Because ‘ready’ should be a verb. | low | NO |
| `standard_fix_sentence` | standard_english | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `proc_fronted_adverbial_fix` | adverbials | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `proc_semicolon_choice` | boundary_punctuation | `choose` | selected-response option-value equality | `exact` | ; | : | low | NO |
| `proc_colon_list_fix` | boundary_punctuation | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `proc_dash_boundary_fix` | boundary_punctuation | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `proc_hyphen_ambiguity_choice` | hyphen_ambiguity | `choose` | selected-response option-value equality | `exact` | The six-year-old child ran across the park. | The six year old child ran across the park. | high | NO |
| `proc_speech_punctuation_fix` | speech_punctuation | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `proc_apostrophe_possession_choice` | apostrophes_possession | `choose` | selected-response option-value equality | `exact` | the girls' coats | the girl's coats | low | NO |
| `proc2_standard_english_choice` | standard_english | `choose` | selected-response option-value equality | `exact` | Ava doesn't know why the gate is locked. | Ava don't know why the gate is locked. | low | NO |
| `proc2_standard_english_fix` | standard_english | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `proc2_tense_aspect_choice` | tense_aspect | `fill` | selected-response option-value equality | `exact` | had finished | finished | low | NO |
| `proc2_modal_choice` | modal_verbs | `fill` | selected-response option-value equality | `exact` | must | should | high | NO |
| `proc2_formality_choice` | formality | `choose` | selected-response option-value equality | `exact` | I am writing to request two extra chairs for the hall. | I just wanted to ask if we could maybe have extra chairs. | high | NO |
| `proc2_pronoun_cohesion_choice` | pronouns_cohesion | `choose` | selected-response option-value equality | `exact` | Amira gave Ava the ticket because Amira was carrying too many bags. | Amira gave Ava it because Amira was carrying too many bags. | high | NO |
| `proc2_subject_object_identify` | subject_object | `identify` | selected-response option-value equality | `exact` | the sketchbook | Ava | high | NO |
| `proc2_passive_to_active` | active_passive | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `proc2_relative_clause_choice` | relative_clauses | `identify` | selected-response option-value equality | `exact` | The book that belonged to the club was easy to spot. | When everyone wanted the book, it was easy to spot. | low | NO |
| `proc2_fronted_adverbial_build` | adverbials | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `proc2_boundary_punctuation_explain` | boundary_punctuation | `explain` | selected-response option-value equality | `exact` | The words before the colon make a complete clause and the colon introduces a list. | The colon replaces speech marks. | low | NO |
| `proc3_sentence_function_choice` | sentence_functions | `choose` | selected-response option-value equality | `exact` | Close the gate before the dog runs out. | Why is the gate still open? | low | NO |
| `proc3_word_class_contrast_choice` | word_classes | `choose` | selected-response option-value equality | `exact` | adverb | determiner | low | NO |
| `proc3_noun_phrase_build` | noun_phrases | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `proc3_clause_join_rewrite` | clauses | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `proc3_parenthesis_commas_fix` | parenthesis_commas | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `proc3_hyphen_fix_meaning` | hyphen_ambiguity | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | high | YES |
| `qg_active_passive_choice` | active_passive | `choose` | selected-response option-value equality | `exact` | The hall was locked by the caretaker before assembly. | Before assembly, the caretaker locked the hall. | high | NO |
| `qg_subject_object_classify_table` | subject_object | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_pronoun_referent_identify` | pronouns_cohesion | `identify` | selected-response option-value equality | `exact` | Oliver | the library | high | NO |
| `qg_formality_classify_table` | formality | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_modal_verb_explain` | modal_verbs | `explain` | selected-response option-value equality | `exact` | It shows possibility, not certainty. | It names the person doing the action. | high | NO |
| `qg_hyphen_ambiguity_explain` | hyphen_ambiguity | `explain` | selected-response option-value equality | `exact` | The hyphen shows that the hospital is for small animals. | The hyphen shows a missing letter. | high | NO |
| `qg_p3_sentence_functions_explain` | sentence_functions | `explain` | selected-response option-value equality | `exact` | It asks for information directly, so it is a question. | It is a grammatical exclamation because it ends with a question mark. | low | NO |
| `qg_p3_word_classes_explain` | word_classes | `explain` | selected-response option-value equality | `exact` | It modifies the verb folded by saying how Maya folded. | It joins the two parts of the sentence. | low | NO |
| `qg_p3_noun_phrases_explain` | noun_phrases | `explain` | selected-response option-value equality | `exact` | It is centred on the noun book and expanded by the phrase with a torn cover. | It is direct speech because it names an object. | low | NO |
| `qg_p3_clauses_explain` | clauses | `explain` | selected-response option-value equality | `exact` | It introduces a subordinate clause showing contrast with the main clause. | It shows that the two clauses mean exactly the same thing. | low | NO |
| `qg_p3_relative_clauses_explain` | relative_clauses | `explain` | selected-response option-value equality | `exact` | It adds information about the noun plant. | It is an adverbial telling how the plant needed water. | low | NO |
| `qg_p3_tense_aspect_explain` | tense_aspect | `explain` | selected-response option-value equality | `exact` | It shows one past action completed before another past action. | It is simple past because had is always optional. | low | NO |
| `qg_p3_pronouns_cohesion_explain` | pronouns_cohesion | `explain` | selected-response option-value equality | `exact` | She could refer to Maya or Priya, so the reference is ambiguous. | She is unclear because it is an adjective. | high | NO |
| `qg_p3_formality_explain` | formality | `explain` | selected-response option-value equality | `exact` | It uses chatty wording that suits speech more than formal writing. | It is informal because it contains a noun phrase. | high | NO |
| `qg_p3_active_passive_explain` | active_passive | `explain` | selected-response option-value equality | `exact` | The doer, the caretaker, is the subject before the verb. | It is active because it hides who did the cleaning. | high | NO |
| `qg_p3_subject_object_explain` | subject_object | `explain` | selected-response option-value equality | `exact` | The soup receives the action of tasting. | The soup is an adverbial because it tells when. | high | NO |
| `qg_p3_parenthesis_commas_explain` | parenthesis_commas | `explain` | selected-response option-value equality | `exact` | Usually quiet is extra information inserted into the sentence. | The dashes introduce a list after a complete clause. | low | NO |
| `qg_p3_speech_punctuation_explain` | speech_punctuation | `explain` | selected-response option-value equality | `exact` | The comma separates the spoken words from the reporting clause. | The comma marks a list of speakers. | low | NO |
| `qg_p3_apostrophe_possession_explain` | apostrophes_possession | `explain` | selected-response option-value equality | `exact` | More than one girl owns the bags, and girls is a regular plural ending in s. | The apostrophe turns bags into a verb. | low | NO |
| `proc3_apostrophe_rewrite` | apostrophes_possession | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p4_sentence_speech_transfer` | sentence_functions, speech_punctuation | `choose` | selected-response option-value equality | `exact` | Did Mum really say, "Pack your bag now"? | Did Mum really say "Pack your bag now"? | low | NO |
| `qg_p4_word_class_noun_phrase_transfer` | word_classes, noun_phrases | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p4_adverbial_clause_boundary_transfer` | adverbials, clauses, boundary_punctuation | `choose` | selected-response option-value equality | `exact` | Before the bell rang, the children lined up quietly. | Before the bell rang; the children lined up quietly. | low | NO |
| `qg_p4_relative_parenthesis_transfer` | relative_clauses, parenthesis_commas | `choose` | selected-response option-value equality | `exact` | The oak tree, which was planted by the village founders, has stood for two hundred years. | The oak tree which, was planted by the village founders, has stood for two hundred years. | low | NO |
| `qg_p4_verb_form_register_transfer` | tense_aspect, modal_verbs, standard_english | `choose` | selected-response option-value equality | `exact` | Your child will need a packed lunch and should wear comfortable shoes. | Your child will need a packed lunch and must of worn comfortable shoes. | high | NO |
| `qg_p4_cohesion_formality_transfer` | pronouns_cohesion, formality | `choose` | selected-response option-value equality | `exact` | The council has approved the plans. It will begin work in September. | The council has approved the plans. Them lot will begin work in September. | high | NO |
| `qg_p4_voice_roles_transfer` | active_passive, subject_object | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p4_possession_hyphen_clarity_transfer` | apostrophes_possession, hyphen_ambiguity | `choose` | selected-response option-value equality | `exact` | The well-known author's latest book topped the charts. | The well-known authors' latest book topped the charts. | high | NO |
| `qg_p14_standard_english_diagnostic_choice` | standard_english | `choose` | selected-response option-value equality | `exact` | Ben did the library pass before tea. | Ben has did the library pass before tea. | low | NO |
| `qg_p14_standard_english_constructed_rewrite` | standard_english | `choose` | selected-response option-value equality | `exact` | Ben did the library pass before tea. | Ben has did the library pass before tea. | low | NO |
| `qg_p14_standard_english_explain_why` | standard_english | `explain` | selected-response option-value equality | `exact` | Standard English uses 'did' for this simple past verb form. | Use 'has did' to make the sentence more formal. | low | NO |
| `qg_p14_standard_english_mixed_transfer` | standard_english | `choose` | selected-response option-value equality | `exact` | Ben did the library pass before tea. | Ben has did the library pass before tea. | low | NO |
| `qg_p14_fronted_adverbials_diagnostic_choice` | adverbials | `choose` | selected-response option-value equality | `exact` | Before the final bell, Eli carried the history poster carefully. | Before the final bell, Eli, carried the history poster carefully. | low | NO |
| `qg_p14_fronted_adverbials_constructed_rewrite` | adverbials | `choose` | selected-response option-value equality | `exact` | Before the final bell, Eli carried the history poster carefully. | Before the final bell, Eli, carried the history poster carefully. | low | NO |
| `qg_p14_fronted_adverbials_explain_why` | adverbials | `explain` | selected-response option-value equality | `exact` | The opening phrase is a fronted adverbial, so the comma separates it from the main clause. | The opening phrase is a list opener, so the comma separates it from the listed items. | low | NO |
| `qg_p14_fronted_adverbials_mixed_transfer` | adverbials | `choose` | selected-response option-value equality | `exact` | Before the final bell, Eli carried the history poster carefully. | Eli, carried the history poster carefully before the final bell. | low | NO |
| `qg_p14_subject_object_diagnostic_choice` | subject_object | `choose` | selected-response option-value equality | `exact` | the clay model | behind the stage curtain | high | NO |
| `qg_p14_subject_object_constructed_rewrite` | subject_object | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p14_subject_object_explain_why` | subject_object | `explain` | selected-response option-value equality | `exact` | The object receives the action of the verb. | It tells where the action happens. | high | NO |
| `qg_p14_subject_object_mixed_transfer` | subject_object | `choose` | selected-response option-value equality | `exact` | subject: Ben; object: the clay model | subject: Ben; object: lifted | high | NO |
| `qg_p14_subordinate_clauses_diagnostic_choice` | clauses | `choose` | selected-response option-value equality | `exact` | although the path was muddy | the recipe card | low | NO |
| `qg_p14_subordinate_clauses_constructed_rewrite` | clauses | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p14_subordinate_clauses_explain_why` | clauses | `explain` | selected-response option-value equality | `exact` | It depends on the main clause to complete the meaning. | It is subordinate because it is the longest part. | low | NO |
| `qg_p14_subordinate_clauses_mixed_transfer` | clauses | `choose` | selected-response option-value equality | `exact` | Although the path was muddy, Freya checked the recipe card. | although the path was muddy. | low | NO |
| `qg_p14_tense_aspect_diagnostic_choice` | tense_aspect | `choose` | selected-response option-value equality | `exact` | Dylan finished the class trophy yesterday. | Dylan is finishing the class trophy yesterday. | low | NO |
| `qg_p14_tense_aspect_constructed_rewrite` | tense_aspect | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p14_tense_aspect_explain_why` | tense_aspect | `explain` | selected-response option-value equality | `exact` | A finished past time signal needs the simple past form. | It is correct because every past action uses the same verb form. | low | NO |
| `qg_p14_tense_aspect_mixed_transfer` | tense_aspect | `choose` | selected-response option-value equality | `exact` | finished | is finishing | low | NO |
| `qg_p14_speech_punctuation_diagnostic_choice` | speech_punctuation | `choose` | selected-response option-value equality | `exact` | "Our team won the relay," Cara said. | "Our team won the relay" Cara said. | low | NO |
| `qg_p14_speech_punctuation_constructed_rewrite` | speech_punctuation | `choose` | selected-response option-value equality | `exact` | "Our team won the relay," Cara said. | "Our team won the relay", Cara said. | low | NO |
| `qg_p14_speech_punctuation_explain_why` | speech_punctuation | `explain` | selected-response option-value equality | `exact` | The comma belongs to the spoken words before the reporting clause. | The comma is inside because the sentence has a proper noun. | low | NO |
| `qg_p14_speech_punctuation_mixed_transfer` | speech_punctuation | `choose` | selected-response option-value equality | `exact` | "Can you hear thunder?" Cara asked. | Can you hear thunder? Cara asked. | low | NO |
| `qg_p14_expanded_noun_phrases_diagnostic_choice` | noun_phrases | `choose` | selected-response option-value equality | `exact` | the cracked ceramic kite beside the coach bay | a cracked ceramic kite beside the coach bay | low | NO |
| `qg_p14_expanded_noun_phrases_constructed_rewrite` | noun_phrases | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p14_expanded_noun_phrases_explain_why` | noun_phrases | `explain` | selected-response option-value equality | `exact` | It is centred on a noun and includes extra words that describe or specify it. | It is formal language because it has several adjectives. | low | NO |
| `qg_p14_expanded_noun_phrases_mixed_transfer` | noun_phrases | `choose` | selected-response option-value equality | `exact` | The cracked ceramic kite beside the coach bay caught everyone's attention. | The kite was noticed because it was cracked. | low | NO |
| `qg_p14_parenthesis_commas_diagnostic_choice` | parenthesis_commas | `choose` | selected-response option-value equality | `exact` | Imani found the science folder, which everyone recognised at once, near the office. | Imani found the science folder which everyone recognised at once, near the office. | low | NO |
| `qg_p14_parenthesis_commas_constructed_rewrite` | parenthesis_commas | `choose` | selected-response option-value equality | `exact` | Imani found the science folder, which everyone recognised at once, near the office. | Imani found the science folder which everyone recognised at once, near the office. | low | NO |
| `qg_p14_parenthesis_commas_explain_why` | parenthesis_commas | `explain` | selected-response option-value equality | `exact` | They mark extra information that could be removed without breaking the main sentence. | They mark the exact spoken words that must stay inside direct speech marks. | low | NO |
| `qg_p14_parenthesis_commas_mixed_transfer` | parenthesis_commas | `choose` | selected-response option-value equality | `exact` | Imani found the science folder, which everyone recognised at once, near the office. | Imani found the science folder near, the office, which everyone recognised at once. | low | NO |
| `qg_p18_p15_active_passive_explain_voice` | active_passive | `explain` | selected-response option-value equality | `exact` | The doer and receiver keep the same roles, but the sentence voice changes. | It only depends on the final punctuation mark. | high | NO |
| `qg_p18_p15_active_passive_voice_choice` | active_passive | `choose` | selected-response option-value equality | `exact` | The bread was baked by the chef. | The chef baked the bread. | high | NO |
| `qg_p18_p15_active_passive_voice_rewrite` | active_passive | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p15_active_passive_voice_roles_table` | active_passive | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p15_active_passive_voice_transfer` | active_passive | `choose` | selected-response option-value equality | `exact` | The bread was baked by the chef. | The chef baked the bread. | high | NO |
| `qg_p18_p15_adverbials_adverbial_transfer` | adverbials | `choose` | selected-response option-value equality | `exact` | Before sunrise, the campers packed their bags. | Before sunrise the campers packed their bags. | low | NO |
| `qg_p18_p15_adverbials_explain_fronted_adv` | adverbials | `explain` | selected-response option-value equality | `exact` | It gives when, where or how information at the start of the sentence. | It only depends on the final punctuation mark. | low | NO |
| `qg_p18_p15_adverbials_fronted_adverbial_comma` | adverbials | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p15_adverbials_identify_fronted_adv` | adverbials | `identify` | selected-response option-value equality | `exact` | Before sunrise | the | low | NO |
| `qg_p18_p15_adverbials_move_adverbial` | adverbials | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p15_apostrophes_possession_explain_possession` | apostrophes_possession | `explain` | selected-response option-value equality | `exact` | The apostrophe shows ownership, and its position shows whether the owner is singular or plural. | It only depends on the final punctuation mark. | low | NO |
| `qg_p18_p15_apostrophes_possession_possession_table` | apostrophes_possession | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p15_apostrophes_possession_possession_transfer` | apostrophes_possession | `choose` | selected-response option-value equality | `exact` | the dog's bowl | the dogs' bowl | low | NO |
| `qg_p18_p15_apostrophes_possession_possessive_choice` | apostrophes_possession | `choose` | selected-response option-value equality | `exact` | the dog's bowl | the dogs' bowl | low | NO |
| `qg_p18_p15_apostrophes_possession_possessive_rewrite` | apostrophes_possession | `rewrite` | constructed-response normalisedText marker | `normalisedText` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p15_boundary_punctuation_boundary_fix` | boundary_punctuation | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p15_boundary_punctuation_boundary_label` | boundary_punctuation | `identify` | selected-response option-value equality | `exact` | semi-colon | colon | low | NO |
| `qg_p18_p15_boundary_punctuation_boundary_mark_choice` | boundary_punctuation | `choose` | selected-response option-value equality | `exact` | ; | : | low | NO |
| `qg_p18_p15_boundary_punctuation_boundary_transfer` | boundary_punctuation | `choose` | selected-response option-value equality | `exact` | The sky darkened; the gulls flew inland. | The sky darkened, the gulls flew inland. | low | NO |
| `qg_p18_p15_boundary_punctuation_explain_boundary` | boundary_punctuation | `explain` | selected-response option-value equality | `exact` | semi-colon joins two closely related main clauses | It only depends on the final punctuation mark. | low | NO |
| `qg_p18_p15_clauses_clause_transfer` | clauses | `choose` | selected-response option-value equality | `exact` | Although the wind was strong, the boat reached the shore. | the boat reached the shore. | low | NO |
| `qg_p18_p15_clauses_combine_clause` | clauses | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p15_clauses_explain_sub_clause` | clauses | `explain` | selected-response option-value equality | `exact` | It begins with a subordinating conjunction and depends on the main clause. | It only depends on the final punctuation mark. | low | NO |
| `qg_p18_p15_clauses_identify_sub_clause` | clauses | `identify` | selected-response option-value equality | `exact` | Although the wind was strong | the boat reached the shore | low | NO |
| `qg_p18_p15_clauses_repair_sub_fragment` | clauses | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p15_formality_explain_formality` | formality | `explain` | selected-response option-value equality | `exact` | It uses precise vocabulary and avoids chatty wording. | It only depends on the final punctuation mark. | high | NO |
| `qg_p18_p15_formality_formal_choice` | formality | `choose` | selected-response option-value equality | `exact` | Please discover whether the hall is open. | Please find out whether the hall is open. | high | NO |
| `qg_p18_p15_formality_formal_rewrite` | formality | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p15_formality_formality_pair_table` | formality | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p15_formality_formality_transfer` | formality | `choose` | selected-response option-value equality | `exact` | Please discover whether the hall is open. | Please find out whether the hall is open. | high | NO |
| `qg_p18_p15_hyphen_ambiguity_explain_hyphen` | hyphen_ambiguity | `explain` | selected-response option-value equality | `exact` | The hyphen links words so the reader sees the intended meaning clearly. | It only depends on the final punctuation mark. | high | NO |
| `qg_p18_p15_hyphen_ambiguity_hyphen_choice` | hyphen_ambiguity | `choose` | selected-response option-value equality | `exact` | man-eating shark | man eating shark | high | NO |
| `qg_p18_p15_hyphen_ambiguity_hyphen_fix` | hyphen_ambiguity | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | high | YES |
| `qg_p18_p15_hyphen_ambiguity_hyphen_meaning` | hyphen_ambiguity | `identify` | selected-response option-value equality | `exact` | a shark that eats people | a different meaning of man eating shark | high | NO |
| `qg_p18_p15_hyphen_ambiguity_hyphen_transfer` | hyphen_ambiguity | `choose` | selected-response option-value equality | `exact` | man-eating shark | man eating shark | high | NO |
| `qg_p18_p15_modal_verbs_explain_modal` | modal_verbs | `explain` | selected-response option-value equality | `exact` | It changes the force of the verb to show strong advice. | It only depends on the final punctuation mark. | high | NO |
| `qg_p18_p15_modal_verbs_modal_gap` | modal_verbs | `fill` | selected-response option-value equality | `exact` | should | might | high | NO |
| `qg_p18_p15_modal_verbs_modal_meaning` | modal_verbs | `identify` | selected-response option-value equality | `exact` | strong advice | certainty | high | NO |
| `qg_p18_p15_modal_verbs_modal_strength_order` | modal_verbs | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p15_modal_verbs_modal_transfer` | modal_verbs | `choose` | selected-response option-value equality | `exact` | You should wear a helmet on this trail. | You might wear a helmet on this trail. | high | NO |
| `qg_p18_p15_noun_phrases_build_np_context` | noun_phrases | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p15_noun_phrases_explain_np` | noun_phrases | `explain` | selected-response option-value equality | `exact` | It is centred on a noun and includes extra describing or specifying detail. | It only depends on the final punctuation mark. | low | NO |
| `qg_p18_p15_noun_phrases_head_noun` | noun_phrases | `identify` | selected-response option-value equality | `exact` | goalkeeper | the | low | NO |
| `qg_p18_p15_noun_phrases_identify_expanded_np` | noun_phrases | `choose` | selected-response option-value equality | `exact` | the nervous goalkeeper with muddy gloves | ran across the yard | low | NO |
| `qg_p18_p15_noun_phrases_np_not_clause` | noun_phrases | `choose` | selected-response option-value equality | `exact` | the nervous goalkeeper with muddy gloves | goalkeeper waited outside | low | NO |
| `qg_p18_p15_parenthesis_commas_explain_parenthesis` | parenthesis_commas | `explain` | selected-response option-value equality | `exact` | The extra information could be removed and the main sentence would still work. | It only depends on the final punctuation mark. | low | NO |
| `qg_p18_p15_parenthesis_commas_parenthesis_choice` | parenthesis_commas | `choose` | selected-response option-value equality | `exact` | Our class visited York, the oldest city on our route, first. | Our class visited York the oldest city on our route first. | low | NO |
| `qg_p18_p15_parenthesis_commas_parenthesis_fix` | parenthesis_commas | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p15_parenthesis_commas_parenthesis_replace` | parenthesis_commas | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p15_parenthesis_commas_parenthesis_transfer` | parenthesis_commas | `choose` | selected-response option-value equality | `exact` | Our class visited York, the oldest city on our route, first. | Our class visited York the oldest city on our route first. | low | NO |
| `qg_p18_p15_pronouns_cohesion_cohesion_choice` | pronouns_cohesion | `choose` | selected-response option-value equality | `exact` | Amira picked up the map. She folded it carefully. | Amira picked up the map. Amira folded the map carefully. | high | NO |
| `qg_p18_p15_pronouns_cohesion_cohesion_rewrite` | pronouns_cohesion | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p15_pronouns_cohesion_cohesion_transfer` | pronouns_cohesion | `choose` | selected-response option-value equality | `exact` | Amira picked up the map. She folded it carefully. | Amira picked up the map. Amira folded the map carefully. | high | NO |
| `qg_p18_p15_pronouns_cohesion_explain_cohesion` | pronouns_cohesion | `explain` | selected-response option-value equality | `exact` | The pronouns clearly refer back to the correct nouns without confusing the reader. | It only depends on the final punctuation mark. | high | NO |
| `qg_p18_p15_pronouns_cohesion_pronoun_referent` | pronouns_cohesion | `identify` | selected-response option-value equality | `exact` | Amira | the object | high | NO |
| `qg_p18_p15_relative_clauses_complete_relative_clause` | relative_clauses | `fill` | selected-response option-value equality | `exact` | who had lost her ticket | because ticket | low | NO |
| `qg_p18_p15_relative_clauses_explain_relative_clause` | relative_clauses | `explain` | selected-response option-value equality | `exact` | It begins with a relative word and adds information about the noun before it. | It only depends on the final punctuation mark. | low | NO |
| `qg_p18_p15_relative_clauses_identify_relative_clause` | relative_clauses | `identify` | selected-response option-value equality | `exact` | who had lost her ticket | The girl | low | NO |
| `qg_p18_p15_relative_clauses_punctuate_relative_clause` | relative_clauses | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p15_relative_clauses_relative_transfer` | relative_clauses | `choose` | selected-response option-value equality | `exact` | The girl, who had lost her ticket, waited by the gate. | When the girl arrived, waited by the gate. | low | NO |
| `qg_p18_p15_sentence_functions_explain_function` | sentence_functions | `explain` | selected-response option-value equality | `exact` | It tells someone to do something. | It only depends on the final punctuation mark. | low | NO |
| `qg_p18_p15_sentence_functions_function_contrast` | sentence_functions | `choose` | selected-response option-value equality | `exact` | command | statement | low | NO |
| `qg_p18_p15_sentence_functions_identify_function` | sentence_functions | `identify` | selected-response option-value equality | `exact` | command | statement | low | NO |
| `qg_p18_p15_sentence_functions_punctuate_by_function` | sentence_functions | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p15_sentence_functions_sat_style_function` | sentence_functions | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p15_speech_punctuation_explain_speech` | speech_punctuation | `explain` | selected-response option-value equality | `exact` | The spoken words are enclosed in speech marks and their punctuation is inside the marks. | It only depends on the final punctuation mark. | low | NO |
| `qg_p18_p15_speech_punctuation_speech_choice` | speech_punctuation | `choose` | selected-response option-value equality | `exact` | "Where are you going?" asked Mum. | "Where are you going" asked Mum. | low | NO |
| `qg_p18_p15_speech_punctuation_speech_fix` | speech_punctuation | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p15_speech_punctuation_speech_reporter_position` | speech_punctuation | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p15_speech_punctuation_speech_transfer` | speech_punctuation | `choose` | selected-response option-value equality | `exact` | "Where are you going?" asked Mum. | "Where are you going" asked Mum. | low | NO |
| `qg_p18_p15_standard_english_explain_standard` | standard_english | `explain` | selected-response option-value equality | `exact` | It uses the accepted written grammar form expected in formal school writing. | It only depends on the final punctuation mark. | low | NO |
| `qg_p18_p15_standard_english_standard_choice` | standard_english | `choose` | selected-response option-value equality | `exact` | We were late for assembly. | We was late for assembly. | low | NO |
| `qg_p18_p15_standard_english_standard_fix` | standard_english | `fix` | constructed-response normalisedText marker | `normalisedText` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p15_standard_english_standard_pairs` | standard_english | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p15_standard_english_standard_transfer` | standard_english | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p15_subject_object_explain_roles` | subject_object | `explain` | selected-response option-value equality | `exact` | The subject does the action and the object receives it. | It only depends on the final punctuation mark. | high | NO |
| `qg_p18_p15_subject_object_identify_object` | subject_object | `identify` | selected-response option-value equality | `exact` | the sandwich | The noisy gull | high | NO |
| `qg_p18_p15_subject_object_identify_subject` | subject_object | `identify` | selected-response option-value equality | `exact` | The noisy gull | the sandwich | high | NO |
| `qg_p18_p15_subject_object_role_table` | subject_object | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p15_subject_object_role_transfer` | subject_object | `choose` | selected-response option-value equality | `exact` | The noisy gull stole the sandwich from Max. | the sandwich acted on The noisy gull. | high | NO |
| `qg_p18_p15_tense_aspect_choose_tense_form` | tense_aspect | `fill` | selected-response option-value equality | `exact` | I have finished my homework. | I finish my homework. | low | NO |
| `qg_p18_p15_tense_aspect_explain_tense` | tense_aspect | `explain` | selected-response option-value equality | `exact` | It uses the verb form needed for the present perfect. | It only depends on the final punctuation mark. | low | NO |
| `qg_p18_p15_tense_aspect_tense_editing` | tense_aspect | `fix` | constructed-response normalisedText marker | `normalisedText` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p15_tense_aspect_tense_near_miss` | tense_aspect | `choose` | selected-response option-value equality | `exact` | I have finished my homework. | I finish my homework. | low | NO |
| `qg_p18_p15_tense_aspect_tense_rewrite` | tense_aspect | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p15_word_classes_explain_word_class` | word_classes | `explain` | selected-response option-value equality | `exact` | It is an adverb because of the job it does in this sentence. | It only depends on the final punctuation mark. | low | NO |
| `qg_p18_p15_word_classes_target_word_class` | word_classes | `identify` | selected-response option-value equality | `exact` | adverb | noun | low | NO |
| `qg_p18_p15_word_classes_underline_word_class` | word_classes | `identify` | selected-response option-value equality | `exact` | adverb | noun | low | NO |
| `qg_p18_p15_word_classes_word_class_sort` | word_classes | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p15_word_classes_word_class_transfer` | word_classes | `choose` | selected-response option-value equality | `exact` | On Tuesday, Aisha carefully folded the blue scarf. | Carefully can appear in a different grammatical role. | low | NO |
| `qg_p18_p16_active_passive_agent_object_explain` | active_passive | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p16_active_passive_rewrite_voice` | active_passive | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p16_active_passive_same_meaning_choice` | active_passive | `choose` | selected-response option-value equality | `exact` | The bread was baked by the chef. | The chef baked bread. | high | NO |
| `qg_p18_p16_active_passive_tense_preserving_voice` | active_passive | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p16_active_passive_voice_error_spot` | active_passive | `choose` | selected-response option-value equality | `exact` | reversed roles | The bread was baked by the chef. | high | NO |
| `qg_p18_p16_active_passive_voice_identify` | active_passive | `classify` | selected-response option-value equality | `exact` | passive | active | high | NO |
| `qg_p18_p16_adverbials_adverbial_or_not` | adverbials | `choose` | selected-response option-value equality | `exact` | yes | no | low | NO |
| `qg_p18_p16_adverbials_choose_best_opening_adverbial` | adverbials | `choose` | selected-response option-value equality | `exact` | Before sunrise | The sandwich | low | NO |
| `qg_p18_p16_adverbials_explain_fronted_comma` | adverbials | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_adverbials_fronted_adverbial_type` | adverbials | `classify` | selected-response option-value equality | `exact` | when | who | low | NO |
| `qg_p18_p16_adverbials_fronted_comma_fix` | adverbials | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p16_adverbials_move_adverbial_to_front` | adverbials | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_apostrophes_possession_choose_possessive_phrase` | apostrophes_possession | `choose` | selected-response option-value equality | `exact` | the dog's bowl | the dogs bowl | low | NO |
| `qg_p18_p16_apostrophes_possession_explain_position` | apostrophes_possession | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_apostrophes_possession_fix_missing_apostrophe` | apostrophes_possession | `fix` | constructed-response normalisedText marker | `normalisedText` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p16_apostrophes_possession_meaning_change_choice` | apostrophes_possession | `choose` | selected-response option-value equality | `exact` | the dog's bowl | the dogs' bowl | low | NO |
| `qg_p18_p16_apostrophes_possession_possession_not_contraction` | apostrophes_possession | `choose` | selected-response option-value equality | `exact` | possession | omission | low | NO |
| `qg_p18_p16_apostrophes_possession_singular_plural_possession` | apostrophes_possession | `classify` | selected-response option-value equality | `exact` | singular | plural | low | NO |
| `qg_p18_p16_boundary_punctuation_choose_boundary_mark` | boundary_punctuation | `choose` | selected-response option-value equality | `exact` | semicolon | comma | low | NO |
| `qg_p18_p16_boundary_punctuation_choose_correct_boundary_sentence` | boundary_punctuation | `choose` | selected-response option-value equality | `exact` | The sky darkened; the gulls flew inland. | The sky darkened, the gulls flew inland. | low | NO |
| `qg_p18_p16_boundary_punctuation_explain_colon_semicolon_dash` | boundary_punctuation | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_boundary_punctuation_insert_boundary_mark` | boundary_punctuation | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_boundary_punctuation_match_mark_to_purpose` | boundary_punctuation | `choose` | selected-response option-value equality | `exact` | join two related main clauses | show possession | low | NO |
| `qg_p18_p16_boundary_punctuation_semicolon_or_comma_splice` | boundary_punctuation | `choose` | selected-response option-value equality | `exact` | It links or separates ideas with the correct strength. | It marks possession. | low | NO |
| `qg_p18_p16_clauses_clause_order_meaning_transfer` | clauses | `choose` | selected-response option-value equality | `exact` | Although the wind was strong, the boat reached the shore. / the boat reached the shore although the wind was strong. | Although the wind was strong. / the boat reached the shore. | low | NO |
| `qg_p18_p16_clauses_explain_subordination` | clauses | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_clauses_fragment_or_sentence` | clauses | `choose` | selected-response option-value equality | `exact` | fragment | complete sentence | low | NO |
| `qg_p18_p16_clauses_join_with_given_conjunction` | clauses | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_clauses_main_vs_subordinate_table` | clauses | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p16_clauses_punctuate_subordinate_first` | clauses | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_clauses_subordinate_clause_identify` | clauses | `identify` | selected-response option-value equality | `exact` | Although the wind was strong | the boat reached the shore | low | NO |
| `qg_p18_p16_formality_choose_formal_word` | formality | `choose` | selected-response option-value equality | `exact` | request | ask for | high | NO |
| `qg_p18_p16_formality_explain_formality_effect` | formality | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p16_formality_formal_sentence_rewrite` | formality | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p16_formality_informal_to_formal_pair_table` | formality | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p16_formality_least_formal_choice` | formality | `choose` | selected-response option-value equality | `exact` | ask for | request | high | NO |
| `qg_p18_p16_formality_register_context_choice` | formality | `choose` | selected-response option-value equality | `exact` | I would like to request. | I want to ask for. | high | NO |
| `qg_p18_p16_hyphen_ambiguity_choose_hyphenated_meaning` | hyphen_ambiguity | `choose` | selected-response option-value equality | `exact` | man-eating shark | man eating shark | high | NO |
| `qg_p18_p16_hyphen_ambiguity_explain_hyphen_meaning` | hyphen_ambiguity | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p16_hyphen_ambiguity_fix_ambiguous_phrase` | hyphen_ambiguity | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | high | YES |
| `qg_p18_p16_hyphen_ambiguity_hyphen_function_choice` | hyphen_ambiguity | `choose` | selected-response option-value equality | `exact` | It links words to make the intended meaning clear. | It marks possession. | high | NO |
| `qg_p18_p16_hyphen_ambiguity_hyphen_or_no_hyphen_table` | hyphen_ambiguity | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p16_hyphen_ambiguity_spot_ambiguous_reading` | hyphen_ambiguity | `choose` | selected-response option-value equality | `exact` | man eating shark | man-eating shark | high | NO |
| `qg_p18_p16_modal_verbs_change_force_rewrite` | modal_verbs | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p16_modal_verbs_choose_modal_meaning` | modal_verbs | `fill` | selected-response option-value equality | `exact` | should | might | high | NO |
| `qg_p18_p16_modal_verbs_meaning_transfer_choice` | modal_verbs | `choose` | selected-response option-value equality | `exact` | You should wear a helmet on this trail. | You might wear a helmet on this trail. | high | NO |
| `qg_p18_p16_modal_verbs_modal_context_explain` | modal_verbs | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p16_modal_verbs_modal_or_adverb` | modal_verbs | `classify` | selected-response option-value equality | `exact` | modal verb | adverb | high | NO |
| `qg_p18_p16_modal_verbs_rank_certainty_choice` | modal_verbs | `choose` | selected-response option-value equality | `exact` | must | should | high | NO |
| `qg_p18_p16_noun_phrases_build_with_given_head` | noun_phrases | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_noun_phrases_expand_plain_noun` | noun_phrases | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_noun_phrases_expanded_or_not_choice` | noun_phrases | `choose` | selected-response option-value equality | `exact` | yes | no | low | NO |
| `qg_p18_p16_noun_phrases_explain_expansion` | noun_phrases | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_noun_phrases_head_noun_identify` | noun_phrases | `identify` | selected-response option-value equality | `exact` | explorer | nervous | low | NO |
| `qg_p18_p16_noun_phrases_noun_phrase_vs_clause` | noun_phrases | `classify` | selected-response option-value equality | `exact` | expanded noun phrase | clause | low | NO |
| `qg_p18_p16_parenthesis_commas_add_parenthesis_commas` | parenthesis_commas | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p16_parenthesis_commas_choose_parenthetical_part` | parenthesis_commas | `identify` | selected-response option-value equality | `exact` | the extra information between commas | the first word only | low | NO |
| `qg_p18_p16_parenthesis_commas_explain_parenthesis` | parenthesis_commas | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_parenthesis_commas_parenthesis_or_not` | parenthesis_commas | `choose` | selected-response option-value equality | `exact` | yes | no | low | NO |
| `qg_p18_p16_parenthesis_commas_punctuation_for_parenthesis` | parenthesis_commas | `choose` | selected-response option-value equality | `exact` | commas, brackets or dashes | only question marks | low | NO |
| `qg_p18_p16_parenthesis_commas_replace_brackets_with_commas` | parenthesis_commas | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_pronouns_cohesion_choose_cohesive_sentence` | pronouns_cohesion | `choose` | selected-response option-value equality | `exact` | Amira picked up the map. She folded it carefully. | Amira picked up the map. It folded it carefully. | high | NO |
| `qg_p18_p16_pronouns_cohesion_explain_cohesion` | pronouns_cohesion | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p16_pronouns_cohesion_fix_pronoun_reference` | pronouns_cohesion | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p16_pronouns_cohesion_reduce_repetition_rewrite` | pronouns_cohesion | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p16_pronouns_cohesion_referent_identify` | pronouns_cohesion | `identify` | selected-response option-value equality | `exact` | the earlier noun it replaces | the verb | high | NO |
| `qg_p18_p16_pronouns_cohesion_too_many_pronouns` | pronouns_cohesion | `choose` | selected-response option-value equality | `exact` | The pronouns do not clearly refer to the right nouns. | It has too many capital letters. | high | NO |
| `qg_p18_p16_relative_clauses_add_commas_non_defining` | relative_clauses | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_relative_clauses_complete_with_relative_clause` | relative_clauses | `choose` | selected-response option-value equality | `exact` | who had visited Egypt | because it was late | low | NO |
| `qg_p18_p16_relative_clauses_explain_relative_clause` | relative_clauses | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_relative_clauses_noun_linked_by_relative` | relative_clauses | `identify` | selected-response option-value equality | `exact` | teacher | the verb | low | NO |
| `qg_p18_p16_relative_clauses_relative_clause_identify_span` | relative_clauses | `identify` | selected-response option-value equality | `exact` | who had visited Egypt | the first noun only | low | NO |
| `qg_p18_p16_relative_clauses_relative_or_time_clause` | relative_clauses | `classify` | selected-response option-value equality | `exact` | time clause | relative clause | low | NO |
| `qg_p18_p16_sentence_functions_choose_matching_function_for_context` | sentence_functions | `choose` | selected-response option-value equality | `exact` | Line up quietly by the door. | statement version | low | NO |
| `qg_p18_p16_sentence_functions_direct_indirect_question_contrast` | sentence_functions | `identify` | selected-response option-value equality | `exact` | question | statement | low | NO |
| `qg_p18_p16_sentence_functions_exclamation_not_excited_statement` | sentence_functions | `choose` | selected-response option-value equality | `exact` | exclamation | statement | low | NO |
| `qg_p18_p16_sentence_functions_explain_function_reasoning` | sentence_functions | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_sentence_functions_punctuation_vs_function_table` | sentence_functions | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p16_sentence_functions_repair_wrong_function_punctuation` | sentence_functions | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_speech_punctuation_explain_speech_rule` | speech_punctuation | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_speech_punctuation_fix_punctuation_outside_marks` | speech_punctuation | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_speech_punctuation_inside_marks_choice` | speech_punctuation | `choose` | selected-response option-value equality | `exact` | ? | . | low | NO |
| `qg_p18_p16_speech_punctuation_punctuate_direct_speech` | speech_punctuation | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_speech_punctuation_reporting_clause_position` | speech_punctuation | `classify` | selected-response option-value equality | `exact` | asked Mum | Where are you going | low | NO |
| `qg_p18_p16_speech_punctuation_speech_or_indirect` | speech_punctuation | `choose` | selected-response option-value equality | `exact` | "Where are you going?" asked Mum. | asked Mum that where are you going. | low | NO |
| `qg_p18_p16_standard_english_choose_standard_sentence` | standard_english | `choose` | selected-response option-value equality | `exact` | We were late. | We was late. | low | NO |
| `qg_p18_p16_standard_english_context_formal_standard` | standard_english | `choose` | selected-response option-value equality | `exact` | We were late. | We was late. | low | NO |
| `qg_p18_p16_standard_english_explain_standard_choice` | standard_english | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_standard_english_fix_nonstandard` | standard_english | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_standard_english_rewrite_standard_english` | standard_english | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_standard_english_standard_pairs_table` | standard_english | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p16_subject_object_explain_roles` | subject_object | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p16_subject_object_find_object` | subject_object | `identify` | selected-response option-value equality | `exact` | the sandwich | The noisy gull | high | NO |
| `qg_p18_p16_subject_object_find_subject` | subject_object | `identify` | selected-response option-value equality | `exact` | The noisy gull | the sandwich | high | NO |
| `qg_p18_p16_subject_object_opening_adverbial_trap` | subject_object | `choose` | selected-response option-value equality | `exact` | It tells when/where, not who or what does the action. | It is always the subject. | high | NO |
| `qg_p18_p16_subject_object_rewrite_preserve_roles` | subject_object | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p16_subject_object_subject_object_table` | subject_object | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p16_tense_aspect_choose_best_verb_form` | tense_aspect | `fill` | selected-response option-value equality | `exact` | I have finished my homework. | I finish my homework. | low | NO |
| `qg_p18_p16_tense_aspect_fix_wrong_form` | tense_aspect | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_tense_aspect_form_explanation` | tense_aspect | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_tense_aspect_rewrite_to_named_form` | tense_aspect | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_tense_aspect_spot_tense_shift_error` | tense_aspect | `choose` | selected-response option-value equality | `exact` | I have finished my homework. | I had finished my homework. | low | NO |
| `qg_p18_p16_tense_aspect_timeline_order_choice` | tense_aspect | `fill` | selected-response option-value equality | `exact` | had / started | was / started | low | NO |
| `qg_p18_p16_word_classes_build_word_class_sentence` | word_classes | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p16_word_classes_distractor_reason_choice` | word_classes | `explain` | selected-response option-value equality | `exact` | It is an adverb because of its job in the sentence. | It is an adjective because of its spelling. | low | NO |
| `qg_p18_p16_word_classes_edge_word_class_transfer` | word_classes | `choose` | selected-response option-value equality | `exact` | It is preposition first and adverb second. | It is always preposition. | low | NO |
| `qg_p18_p16_word_classes_multi_token_classify_table` | word_classes | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p16_word_classes_pick_all_target_class` | word_classes | `identify` | selected-response option-value equality | `exact` | carefully, quietly | first word only | low | NO |
| `qg_p18_p16_word_classes_role_in_context_choice` | word_classes | `identify` | selected-response option-value equality | `exact` | adverb | noun | low | NO |
| `qg_p18_p16_word_classes_same_word_different_job` | word_classes | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_active_passive_examiner_trap_contrast` | active_passive | `choose` | selected-response option-value equality | `exact` | 'The bread was baked by the chef.' is defensible; 'The bread baked the chef.' is a near miss because it fails the grammar condition. | 'The bread baked the chef.' is equally defensible. | high | NO |
| `qg_p18_p17_active_passive_misconception_repair` | active_passive | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_active_passive_precision_choice` | active_passive | `choose` | selected-response option-value equality | `exact` | The bread was baked by the chef. | The bread baked the chef. | high | NO |
| `qg_p18_p17_active_passive_table_classify` | active_passive | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p17_active_passive_transfer_apply` | active_passive | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_active_passive_written_reason` | active_passive | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_adverbials_misconception_repair` | adverbials | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_adverbials_precision_choice` | adverbials | `choose` | selected-response option-value equality | `exact` | Before the match | the players | low | NO |
| `qg_p18_p17_adverbials_table_classify` | adverbials | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p17_adverbials_transfer_apply` | adverbials | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_adverbials_written_reason` | adverbials | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_apostrophes_possession_examiner_trap_contrast` | apostrophes_possession | `choose` | selected-response option-value equality | `exact` | 'the dog's bowl' is defensible; 'the dogs' bowl' is a near miss because it fails the grammar condition. | 'the dogs' bowl' is equally defensible. | low | NO |
| `qg_p18_p17_apostrophes_possession_misconception_repair` | apostrophes_possession | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_apostrophes_possession_precision_choice` | apostrophes_possession | `choose` | selected-response option-value equality | `exact` | the dog's bowl | the dogs' bowl | low | NO |
| `qg_p18_p17_apostrophes_possession_table_classify` | apostrophes_possession | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p17_apostrophes_possession_transfer_apply` | apostrophes_possession | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_apostrophes_possession_written_reason` | apostrophes_possession | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_boundary_punctuation_examiner_trap_contrast` | boundary_punctuation | `choose` | selected-response option-value equality | `exact` | ';' is defensible; ':' is a near miss because it fails the grammar condition. | ':' is equally defensible. | low | NO |
| `qg_p18_p17_boundary_punctuation_misconception_repair` | boundary_punctuation | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_boundary_punctuation_precision_choice` | boundary_punctuation | `choose` | selected-response option-value equality | `exact` | ; | : | low | NO |
| `qg_p18_p17_boundary_punctuation_table_classify` | boundary_punctuation | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p17_boundary_punctuation_transfer_apply` | boundary_punctuation | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_boundary_punctuation_written_reason` | boundary_punctuation | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_clauses_examiner_trap_contrast` | clauses | `choose` | selected-response option-value equality | `exact` | 'Although the path was muddy' is defensible; 'we reached the farm' is a near miss because it fails the grammar condition. | 'we reached the farm' is equally defensible. | low | NO |
| `qg_p18_p17_clauses_misconception_repair` | clauses | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_clauses_precision_choice` | clauses | `choose` | selected-response option-value equality | `exact` | Although the path was muddy | we reached the farm | low | NO |
| `qg_p18_p17_clauses_table_classify` | clauses | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p17_clauses_transfer_apply` | clauses | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_clauses_written_reason` | clauses | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_formality_misconception_repair` | formality | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_formality_precision_choice` | formality | `choose` | selected-response option-value equality | `exact` | request | grab | high | NO |
| `qg_p18_p17_formality_table_classify` | formality | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p17_formality_transfer_apply` | formality | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_formality_written_reason` | formality | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_hyphen_ambiguity_examiner_trap_contrast` | hyphen_ambiguity | `choose` | selected-response option-value equality | `exact` | 'man-eating shark' is defensible; 'man eating shark' is a near miss because it fails the grammar condition. | 'man eating shark' is equally defensible. | high | NO |
| `qg_p18_p17_hyphen_ambiguity_misconception_repair` | hyphen_ambiguity | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_hyphen_ambiguity_precision_choice` | hyphen_ambiguity | `choose` | selected-response option-value equality | `exact` | man-eating shark | man eating shark | high | NO |
| `qg_p18_p17_hyphen_ambiguity_table_classify` | hyphen_ambiguity | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p17_hyphen_ambiguity_transfer_apply` | hyphen_ambiguity | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_hyphen_ambiguity_written_reason` | hyphen_ambiguity | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_modal_verbs_misconception_repair` | modal_verbs | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_modal_verbs_precision_choice` | modal_verbs | `choose` | selected-response option-value equality | `exact` | should | might | high | NO |
| `qg_p18_p17_modal_verbs_table_classify` | modal_verbs | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p17_modal_verbs_transfer_apply` | modal_verbs | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_modal_verbs_written_reason` | modal_verbs | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_noun_phrases_examiner_trap_contrast` | noun_phrases | `choose` | selected-response option-value equality | `exact` | 'expanded noun phrase' is defensible; 'verb phrase' is a near miss because it fails the grammar condition. | 'verb phrase' is equally defensible. | low | NO |
| `qg_p18_p17_noun_phrases_misconception_repair` | noun_phrases | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_noun_phrases_precision_choice` | noun_phrases | `choose` | selected-response option-value equality | `exact` | expanded noun phrase | verb phrase | low | NO |
| `qg_p18_p17_noun_phrases_table_classify` | noun_phrases | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p17_noun_phrases_transfer_apply` | noun_phrases | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_noun_phrases_written_reason` | noun_phrases | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_parenthesis_commas_misconception_repair` | parenthesis_commas | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_parenthesis_commas_precision_choice` | parenthesis_commas | `choose` | selected-response option-value equality | `exact` | Our guide, who had visited before, led us inside. | Our guide who, had visited before led us inside. | low | NO |
| `qg_p18_p17_parenthesis_commas_table_classify` | parenthesis_commas | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p17_parenthesis_commas_transfer_apply` | parenthesis_commas | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_parenthesis_commas_written_reason` | parenthesis_commas | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_pronouns_cohesion_misconception_repair` | pronouns_cohesion | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_pronouns_cohesion_precision_choice` | pronouns_cohesion | `choose` | selected-response option-value equality | `exact` | clear | unclear | high | NO |
| `qg_p18_p17_pronouns_cohesion_table_classify` | pronouns_cohesion | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p17_pronouns_cohesion_transfer_apply` | pronouns_cohesion | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_pronouns_cohesion_written_reason` | pronouns_cohesion | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_relative_clauses_misconception_repair` | relative_clauses | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_relative_clauses_precision_choice` | relative_clauses | `choose` | selected-response option-value equality | `exact` | who won the race | The girl | low | NO |
| `qg_p18_p17_relative_clauses_table_classify` | relative_clauses | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p17_relative_clauses_transfer_apply` | relative_clauses | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_relative_clauses_written_reason` | relative_clauses | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_sentence_functions_misconception_repair` | sentence_functions | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_sentence_functions_precision_choice` | sentence_functions | `choose` | selected-response option-value equality | `exact` | command | statement | low | NO |
| `qg_p18_p17_sentence_functions_table_classify` | sentence_functions | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p17_sentence_functions_transfer_apply` | sentence_functions | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_sentence_functions_written_reason` | sentence_functions | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_speech_punctuation_examiner_trap_contrast` | speech_punctuation | `choose` | selected-response option-value equality | `exact` | '"Where are you going?" asked Mum.' is defensible; '"Where are you going"? asked Mum.' is a near miss because it fails the grammar condition. | '"Where are you going"? asked Mum.' is equally defensible. | low | NO |
| `qg_p18_p17_speech_punctuation_misconception_repair` | speech_punctuation | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_speech_punctuation_precision_choice` | speech_punctuation | `choose` | selected-response option-value equality | `exact` | "Where are you going?" asked Mum. | "Where are you going"? asked Mum. | low | NO |
| `qg_p18_p17_speech_punctuation_table_classify` | speech_punctuation | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p17_speech_punctuation_transfer_apply` | speech_punctuation | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_speech_punctuation_written_reason` | speech_punctuation | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_standard_english_misconception_repair` | standard_english | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_standard_english_precision_choice` | standard_english | `choose` | selected-response option-value equality | `exact` | were | was | low | NO |
| `qg_p18_p17_standard_english_table_classify` | standard_english | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p17_standard_english_transfer_apply` | standard_english | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_standard_english_written_reason` | standard_english | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_subject_object_examiner_trap_contrast` | subject_object | `choose` | selected-response option-value equality | `exact` | 'the sandwich' is defensible; 'The noisy gull' is a near miss because it fails the grammar condition. | 'The noisy gull' is equally defensible. | high | NO |
| `qg_p18_p17_subject_object_misconception_repair` | subject_object | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_subject_object_precision_choice` | subject_object | `choose` | selected-response option-value equality | `exact` | the sandwich | The noisy gull | high | NO |
| `qg_p18_p17_subject_object_table_classify` | subject_object | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p17_subject_object_transfer_apply` | subject_object | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_subject_object_written_reason` | subject_object | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p17_tense_aspect_examiner_trap_contrast` | tense_aspect | `choose` | selected-response option-value equality | `exact` | 'has finished' is defensible; 'finished yesterday' is a near miss because it fails the grammar condition. | 'finished yesterday' is equally defensible. | low | NO |
| `qg_p18_p17_tense_aspect_misconception_repair` | tense_aspect | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_tense_aspect_precision_choice` | tense_aspect | `choose` | selected-response option-value equality | `exact` | has finished | finished yesterday | low | NO |
| `qg_p18_p17_tense_aspect_table_classify` | tense_aspect | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p17_tense_aspect_transfer_apply` | tense_aspect | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_tense_aspect_written_reason` | tense_aspect | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_word_classes_examiner_trap_contrast` | word_classes | `choose` | selected-response option-value equality | `exact` | 'adverb' is defensible; 'adjective' is a near miss because it fails the grammar condition. | 'adjective' is equally defensible. | low | NO |
| `qg_p18_p17_word_classes_misconception_repair` | word_classes | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_word_classes_precision_choice` | word_classes | `choose` | selected-response option-value equality | `exact` | adverb | adjective | low | NO |
| `qg_p18_p17_word_classes_table_classify` | word_classes | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p17_word_classes_transfer_apply` | word_classes | `build` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p17_word_classes_written_reason` | word_classes | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_active_passive_application_transfer` | active_passive | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p18_active_passive_diagnostic_identify` | active_passive | `choose` | selected-response option-value equality | `exact` | The bread was baked by the chef. | The chef baked the bread. | high | NO |
| `qg_p18_p18_active_passive_explain_reasoning` | active_passive | `explain` | selected-response option-value equality | `exact` | The object becomes the subject in the passive. | Because the doer always comes first | high | NO |
| `qg_p18_p18_active_passive_precision_repair_or_rewrite` | active_passive | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p18_active_passive_sat_table_classification` | active_passive | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p18_active_passive_subject_object_voice_subject_object_roles` | active_passive, subject_object | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p18_adverbials_application_transfer` | adverbials | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_adverbials_clauses_adverbial_clause_join` | adverbials, clauses | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_adverbials_diagnostic_identify` | adverbials | `choose` | selected-response option-value equality | `exact` | fronted adverbial | main clause | low | NO |
| `qg_p18_p18_adverbials_explain_reasoning` | adverbials | `explain` | selected-response option-value equality | `exact` | The opening phrase tells when and needs a comma. | Because every sentence opening needs a comma | low | NO |
| `qg_p18_p18_adverbials_precision_repair_or_rewrite` | adverbials | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_adverbials_sat_table_classification` | adverbials | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p18_apostrophes_possession_application_transfer` | apostrophes_possession | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_apostrophes_possession_diagnostic_identify` | apostrophes_possession | `choose` | selected-response option-value equality | `exact` | the dog's bowl | the dogs' bowl | low | NO |
| `qg_p18_p18_apostrophes_possession_explain_reasoning` | apostrophes_possession | `explain` | selected-response option-value equality | `exact` | One dog owns the bowl, so apostrophe before s. | Because apostrophes always show plural | low | NO |
| `qg_p18_p18_apostrophes_possession_hyphen_ambiguity_possession_hyphen_precision` | apostrophes_possession, hyphen_ambiguity | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p18_apostrophes_possession_precision_repair_or_rewrite` | apostrophes_possession | `fix` | constructed-response normalisedText marker | `normalisedText` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p18_apostrophes_possession_sat_table_classification` | apostrophes_possession | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p18_boundary_punctuation_application_transfer` | boundary_punctuation | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_boundary_punctuation_diagnostic_identify` | boundary_punctuation | `choose` | selected-response option-value equality | `exact` | semicolon | colon | low | NO |
| `qg_p18_p18_boundary_punctuation_explain_reasoning` | boundary_punctuation | `explain` | selected-response option-value equality | `exact` | A semi-colon links two related main clauses. | Because commas can join any two clauses | low | NO |
| `qg_p18_p18_boundary_punctuation_precision_repair_or_rewrite` | boundary_punctuation | `fix` | constructed-response normalisedText marker | `normalisedText` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p18_boundary_punctuation_sat_table_classification` | boundary_punctuation | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p18_boundary_punctuation_speech_punctuation_boundary_speech_punctuation` | boundary_punctuation, speech_punctuation | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_clauses_application_transfer` | clauses | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_clauses_diagnostic_identify` | clauses | `choose` | selected-response option-value equality | `exact` | Although the path was muddy | the hikers kept walking | low | NO |
| `qg_p18_p18_clauses_explain_reasoning` | clauses | `explain` | selected-response option-value equality | `exact` | The although-clause depends on the main clause. | Because it is the longest part | low | NO |
| `qg_p18_p18_clauses_precision_repair_or_rewrite` | clauses | `fix` | constructed-response normalisedText marker | `normalisedText` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p18_clauses_sat_table_classification` | clauses | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p18_formality_application_transfer` | formality | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p18_formality_diagnostic_identify` | formality | `choose` | selected-response option-value equality | `exact` | The club was established last year. | The club got set up last year. | high | NO |
| `qg_p18_p18_formality_explain_reasoning` | formality | `explain` | selected-response option-value equality | `exact` | Established is more formal than got set up. | Because it is longer only | high | NO |
| `qg_p18_p18_formality_precision_repair_or_rewrite` | formality | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p18_formality_sat_table_classification` | formality | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p18_hyphen_ambiguity_application_transfer` | hyphen_ambiguity | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p18_hyphen_ambiguity_diagnostic_identify` | hyphen_ambiguity | `choose` | selected-response option-value equality | `exact` | man-eating shark | man eating shark | high | NO |
| `qg_p18_p18_hyphen_ambiguity_explain_reasoning` | hyphen_ambiguity | `explain` | selected-response option-value equality | `exact` | The hyphen shows man-eating describes the shark. | Because every adjective needs a hyphen | high | NO |
| `qg_p18_p18_hyphen_ambiguity_precision_repair_or_rewrite` | hyphen_ambiguity | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | high | YES |
| `qg_p18_p18_hyphen_ambiguity_sat_table_classification` | hyphen_ambiguity | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p18_modal_verbs_application_transfer` | modal_verbs | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p18_modal_verbs_diagnostic_identify` | modal_verbs | `choose` | selected-response option-value equality | `exact` | should | might | high | NO |
| `qg_p18_p18_modal_verbs_explain_reasoning` | modal_verbs | `explain` | selected-response option-value equality | `exact` | Should gives strong advice. | Because it is always the strongest modal | high | NO |
| `qg_p18_p18_modal_verbs_formality_modal_formality_strength` | formality, modal_verbs | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p18_modal_verbs_precision_repair_or_rewrite` | modal_verbs | `fix` | constructed-response normalisedText marker | `normalisedText` | Template oracle response | A plausible but incorrect response | high | YES |
| `qg_p18_p18_modal_verbs_sat_table_classification` | modal_verbs | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p18_noun_phrases_application_transfer` | noun_phrases | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_noun_phrases_diagnostic_identify` | noun_phrases | `choose` | selected-response option-value equality | `exact` | the small blue marble | rolled beneath | low | NO |
| `qg_p18_p18_noun_phrases_explain_reasoning` | noun_phrases | `explain` | selected-response option-value equality | `exact` | It is centred on the noun marble and expanded with detail. | Because it has a verb at the centre | low | NO |
| `qg_p18_p18_noun_phrases_precision_repair_or_rewrite` | noun_phrases | `fix` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_noun_phrases_sat_table_classification` | noun_phrases | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p18_parenthesis_commas_application_transfer` | parenthesis_commas | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_parenthesis_commas_diagnostic_identify` | parenthesis_commas | `choose` | selected-response option-value equality | `exact` | Luca, who was first in line, opened the door. | Luca who was first in line opened the door. | low | NO |
| `qg_p18_p18_parenthesis_commas_explain_reasoning` | parenthesis_commas | `explain` | selected-response option-value equality | `exact` | Commas mark the parenthesis. | Because every comma is parenthesis | low | NO |
| `qg_p18_p18_parenthesis_commas_precision_repair_or_rewrite` | parenthesis_commas | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p18_parenthesis_commas_sat_table_classification` | parenthesis_commas | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p18_pronouns_cohesion_application_transfer` | pronouns_cohesion | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p18_pronouns_cohesion_diagnostic_identify` | pronouns_cohesion | `choose` | selected-response option-value equality | `exact` | Amira picked up the map. She folded it carefully. | Amira picked up the map. It folded she carefully. | high | NO |
| `qg_p18_p18_pronouns_cohesion_explain_reasoning` | pronouns_cohesion | `explain` | selected-response option-value equality | `exact` | The pronouns clearly refer back to Amira and the map. | Because all nouns were removed | high | NO |
| `qg_p18_p18_pronouns_cohesion_formality_cohesion_formality_choice` | formality, pronouns_cohesion | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p18_pronouns_cohesion_precision_repair_or_rewrite` | pronouns_cohesion | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p18_pronouns_cohesion_sat_table_classification` | pronouns_cohesion | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p18_relative_clauses_application_transfer` | relative_clauses | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_relative_clauses_diagnostic_identify` | relative_clauses | `choose` | selected-response option-value equality | `exact` | who painted the mural | because she painted the mural | low | NO |
| `qg_p18_p18_relative_clauses_explain_reasoning` | relative_clauses | `explain` | selected-response option-value equality | `exact` | The clause begins with who and adds information about the artist. | Because it starts with a capital letter | low | NO |
| `qg_p18_p18_relative_clauses_parenthesis_commas_relative_parenthesis_punctuation` | parenthesis_commas, relative_clauses | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_relative_clauses_precision_repair_or_rewrite` | relative_clauses | `fix` | constructed-response normalisedText marker | `normalisedText` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p18_relative_clauses_sat_table_classification` | relative_clauses | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p18_sentence_functions_application_transfer` | sentence_functions | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_sentence_functions_diagnostic_identify` | sentence_functions | `identify` | selected-response option-value equality | `exact` | command | statement | low | NO |
| `qg_p18_p18_sentence_functions_explain_reasoning` | sentence_functions | `explain` | selected-response option-value equality | `exact` | It tells someone what to do. | Because it contains the word Please | low | NO |
| `qg_p18_p18_sentence_functions_precision_repair_or_rewrite` | sentence_functions | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p18_sentence_functions_sat_table_classification` | sentence_functions | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p18_sentence_functions_speech_punctuation_function_speech_boundary` | sentence_functions, speech_punctuation | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_speech_punctuation_application_transfer` | speech_punctuation | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_speech_punctuation_diagnostic_identify` | speech_punctuation | `choose` | selected-response option-value equality | `exact` | "Where are you going?" asked Mum. | "Where are you going" asked Mum. | low | NO |
| `qg_p18_p18_speech_punctuation_explain_reasoning` | speech_punctuation | `explain` | selected-response option-value equality | `exact` | The question mark belongs inside the speech marks. | Because end punctuation belongs outside speech marks | low | NO |
| `qg_p18_p18_speech_punctuation_precision_repair_or_rewrite` | speech_punctuation | `fix` | constructed-response punctuationPattern marker | `punctuationPattern` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p18_speech_punctuation_sat_table_classification` | speech_punctuation | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p18_standard_english_application_transfer` | standard_english | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_standard_english_diagnostic_identify` | standard_english | `choose` | selected-response option-value equality | `exact` | We were late for practice. | We was late for practice. | low | NO |
| `qg_p18_p18_standard_english_explain_reasoning` | standard_english | `explain` | selected-response option-value equality | `exact` | Were is the Standard English form with we. | Because informal speech is always wrong | low | NO |
| `qg_p18_p18_standard_english_precision_repair_or_rewrite` | standard_english | `rewrite` | constructed-response normalisedText marker | `normalisedText` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p18_standard_english_sat_table_classification` | standard_english | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p18_subject_object_application_transfer` | subject_object | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | high | YES |
| `qg_p18_p18_subject_object_diagnostic_identify` | subject_object | `identify` | selected-response option-value equality | `exact` | the sandwich | The noisy gull | high | NO |
| `qg_p18_p18_subject_object_explain_reasoning` | subject_object | `explain` | selected-response option-value equality | `exact` | The gull does the stealing; the sandwich receives the action. | Because it comes first | high | NO |
| `qg_p18_p18_subject_object_precision_repair_or_rewrite` | subject_object | `fix` | constructed-response normalisedText marker | `normalisedText` | Template oracle response | A plausible but incorrect response | high | YES |
| `qg_p18_p18_subject_object_sat_table_classification` | subject_object | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | high | NO |
| `qg_p18_p18_tense_aspect_application_transfer` | tense_aspect | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_tense_aspect_diagnostic_identify` | tense_aspect | `choose` | selected-response option-value equality | `exact` | She had packed her bag before the trip. | She packed her bag before the trip. | low | NO |
| `qg_p18_p18_tense_aspect_explain_reasoning` | tense_aspect | `explain` | selected-response option-value equality | `exact` | Past perfect uses had plus past participle for an earlier past action. | Because it is the shortest form | low | NO |
| `qg_p18_p18_tense_aspect_precision_repair_or_rewrite` | tense_aspect | `rewrite` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_tense_aspect_sat_table_classification` | tense_aspect | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p18_p18_tense_aspect_standard_english_tense_standard_register` | standard_english, tense_aspect | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_word_classes_application_transfer` | word_classes | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_word_classes_diagnostic_identify` | word_classes | `identify` | selected-response option-value equality | `exact` | adverb | adjective | low | NO |
| `qg_p18_p18_word_classes_explain_reasoning` | word_classes | `explain` | selected-response option-value equality | `exact` | It describes how Maya folded the map. | Because of where it appears in the alphabet | low | NO |
| `qg_p18_p18_word_classes_noun_phrases_word_class_np_roles` | noun_phrases, word_classes | `explain` | manual-review-only non-scored route | `manualReviewOnly` | Manual review only | Auto-scoring is not permitted | medium | YES |
| `qg_p18_p18_word_classes_precision_repair_or_rewrite` | word_classes | `fix` | constructed-response normalisedText marker | `normalisedText` | Template oracle response | A plausible but incorrect response | medium | YES |
| `qg_p18_p18_word_classes_sat_table_classification` | word_classes | `classify` | selected-response option-value equality | `multiField` | Template oracle response | At least one row uses a distractor option | low | NO |
| `qg_p21_sentence_functions_closed_choice_variety` | sentence_functions | `choose` | selected-response option-value equality | `exact` | Close the gate before the puppy runs out. | The gate is closed. | low | NO |
| `qg_p21_sentence_functions_explanation_choice_variety` | sentence_functions | `explain` | selected-response option-value equality | `exact` | A command tells someone to do something. | It only depends on the final punctuation mark. | low | NO |
| `qg_p21_word_classes_closed_choice_variety` | word_classes | `choose` | selected-response option-value equality | `exact` | adverb | noun | low | NO |
| `qg_p21_word_classes_explanation_choice_variety` | word_classes | `explain` | selected-response option-value equality | `exact` | Often is an adverb because it tells us how frequently Ben walks. | It only depends on the final punctuation mark. | low | NO |
| `qg_p21_noun_phrases_closed_choice_variety` | noun_phrases | `choose` | selected-response option-value equality | `exact` | the tiny silver key beside the vase | opened the door quickly | low | NO |
| `qg_p21_noun_phrases_explanation_choice_variety` | noun_phrases | `explain` | selected-response option-value equality | `exact` | The phrase is centred on the noun key and expands it with description. | It only depends on the final punctuation mark. | low | NO |
| `qg_p21_adverbials_closed_choice_variety` | adverbials | `choose` | selected-response option-value equality | `exact` | After breakfast, the class walked to the hall. | The class after breakfast walked to the hall. | low | NO |
| `qg_p21_adverbials_explanation_choice_variety` | adverbials | `explain` | selected-response option-value equality | `exact` | After breakfast is a fronted adverbial and needs a comma after it. | It only depends on the final punctuation mark. | low | NO |
| `qg_p21_clauses_closed_choice_variety` | clauses | `choose` | selected-response option-value equality | `exact` | Because it was icy | we walked slowly | low | NO |
| `qg_p21_clauses_explanation_choice_variety` | clauses | `explain` | selected-response option-value equality | `exact` | Because it was icy depends on the main clause for the full sentence. | It only depends on the final punctuation mark. | low | NO |
| `qg_p21_relative_clauses_closed_choice_variety` | relative_clauses | `choose` | selected-response option-value equality | `exact` | The girl who won the race smiled. | The girl ran because she trained hard. | low | NO |
| `qg_p21_relative_clauses_explanation_choice_variety` | relative_clauses | `explain` | selected-response option-value equality | `exact` | Who won the race adds information about the girl. | It only depends on the final punctuation mark. | low | NO |
| `qg_p21_tense_aspect_closed_choice_variety` | tense_aspect | `choose` | selected-response option-value equality | `exact` | She has finished her homework. | She finished her homework yesterday. | low | NO |
| `qg_p21_tense_aspect_explanation_choice_variety` | tense_aspect | `explain` | selected-response option-value equality | `exact` | Has finished links a completed action to the present. | It only depends on the final punctuation mark. | low | NO |
| `qg_p21_standard_english_closed_choice_variety` | standard_english | `choose` | selected-response option-value equality | `exact` | We were late for assembly. | We was late for assembly. | low | NO |
| `qg_p21_standard_english_explanation_choice_variety` | standard_english | `explain` | selected-response option-value equality | `exact` | We were is the standard written form. | It only depends on the final punctuation mark. | low | NO |
| `qg_p21_pronouns_cohesion_closed_choice_variety` | pronouns_cohesion | `choose` | selected-response option-value equality | `exact` | Amira picked up the map and folded it carefully. | Amira picked up the map and folded she carefully. | high | NO |
| `qg_p21_pronouns_cohesion_explanation_choice_variety` | pronouns_cohesion | `explain` | selected-response option-value equality | `exact` | It clearly refers to the map. | It only depends on the final punctuation mark. | high | NO |
| `qg_p21_formality_closed_choice_variety` | formality | `choose` | selected-response option-value equality | `exact` | I would be grateful if you could reply soon. | Please get back to me soon. | high | NO |
| `qg_p21_formality_explanation_choice_variety` | formality | `explain` | selected-response option-value equality | `exact` | The vocabulary and structure suit formal writing. | It only depends on the final punctuation mark. | high | NO |
| `qg_p21_active_passive_closed_choice_variety` | active_passive | `choose` | selected-response option-value equality | `exact` | The chef baked the bread. | The bread was baked by the chef. | high | NO |
| `qg_p21_active_passive_explanation_choice_variety` | active_passive | `explain` | selected-response option-value equality | `exact` | In active voice, the doer comes before the verb. | It only depends on the final punctuation mark. | high | NO |
| `qg_p21_subject_object_closed_choice_variety` | subject_object | `choose` | selected-response option-value equality | `exact` | The cat | the mouse | high | NO |
| `qg_p21_subject_object_explanation_choice_variety` | subject_object | `explain` | selected-response option-value equality | `exact` | The subject is the doer of the action. | It only depends on the final punctuation mark. | high | NO |
| `qg_p21_modal_verbs_closed_choice_variety` | modal_verbs | `choose` | selected-response option-value equality | `exact` | must | might | high | NO |
| `qg_p21_modal_verbs_explanation_choice_variety` | modal_verbs | `explain` | selected-response option-value equality | `exact` | Must shows stronger certainty than might, could or may. | It only depends on the final punctuation mark. | high | NO |
| `qg_p21_parenthesis_commas_closed_choice_variety` | parenthesis_commas | `choose` | selected-response option-value equality | `exact` | The garden, full of roses, smelled sweet. | The garden full of roses, smelled sweet. | low | NO |
| `qg_p21_parenthesis_commas_explanation_choice_variety` | parenthesis_commas | `explain` | selected-response option-value equality | `exact` | The commas mark extra information that can be lifted out. | It only depends on the final punctuation mark. | low | NO |
| `qg_p21_speech_punctuation_closed_choice_variety` | speech_punctuation | `choose` | selected-response option-value equality | `exact` | "Where are my shoes?" asked Leo. | "Where are my shoes"? asked Leo. | low | NO |
| `qg_p21_speech_punctuation_explanation_choice_variety` | speech_punctuation | `explain` | selected-response option-value equality | `exact` | The question mark belongs inside the speech marks. | It only depends on the final punctuation mark. | low | NO |
| `qg_p21_apostrophes_possession_closed_choice_variety` | apostrophes_possession | `choose` | selected-response option-value equality | `exact` | Tom's pencil | Toms' pencil | low | NO |
| `qg_p21_apostrophes_possession_explanation_choice_variety` | apostrophes_possession | `explain` | selected-response option-value equality | `exact` | The apostrophe before s shows that one Tom owns the pencil. | It only depends on the final punctuation mark. | low | NO |
| `qg_p21_boundary_punctuation_closed_choice_variety` | boundary_punctuation | `choose` | selected-response option-value equality | `exact` | Bring these items: a pen, a ruler and a book. | Bring these items; a pen, a ruler and a book. | low | NO |
| `qg_p21_boundary_punctuation_explanation_choice_variety` | boundary_punctuation | `explain` | selected-response option-value equality | `exact` | A colon can introduce a list after a complete clause. | It only depends on the final punctuation mark. | low | NO |
| `qg_p21_hyphen_ambiguity_closed_choice_variety` | hyphen_ambiguity | `choose` | selected-response option-value equality | `exact` | man-eating shark | man eating shark | high | NO |
| `qg_p21_hyphen_ambiguity_explanation_choice_variety` | hyphen_ambiguity | `explain` | selected-response option-value equality | `exact` | The hyphen joins man and eating so they work together as one modifier. | It only depends on the final punctuation mark. | high | NO |

## 3. Manual-review-only candidates (≥ 5)

P2 lands `manualReviewOnly` for the four open constructed-response candidates. The two selected-response explain templates remain future re-evaluation candidates if they ever become free text. The doc-gate test asserts this list contains **at least 5** entries so the future free-text risk stays visible.

1. `build_noun_phrase` — open-ended builder; any syntactically valid expanded noun phrase with three+ words should count, but the fixture cannot enumerate every adjective/post-modifier combination.
2. `proc2_fronted_adverbial_build` — free-form sentence building; many valid rewrites preserve the fronted-adverbial target.
3. `proc3_noun_phrase_build` — re-ordering fragments into an expanded noun phrase; adjective-order variations are all valid when English convention allows.
4. `standard_fix_sentence` — Standard English rewrites where multiple register-correct paraphrases exist (`We were walking to school.` vs `We walked to school.`); teacher judgement preferred.
5. `explain_reason_choice` — today a selected-response single-choice, but flagged for Phase 5 re-evaluation: if it migrates to free-text explanation in a future content-release PR, the target kind is `manualReviewOnly` because explanations admit many valid phrasings.
6. `proc2_boundary_punctuation_explain` — same reasoning as above; today selected-response, but a free-text explanation migration would shift it to `manualReviewOnly`.

---

## 4. P1 focus concept priority (high)

The six concepts below were the confirmed thin-pool concepts in the Phase 4 U12 ground truth and **must** all remain high-priority in P1/P5 migration ordering. P1 content expansion lifts them above the two-template floor, but every template carrying one of these concept ids in its `skillIds` still inherits **high** priority in the table above.

1. `pronouns_cohesion`
2. `formality`
3. `active_passive`
4. `subject_object`
5. `modal_verbs`
6. `hyphen_ambiguity`

The doc-gate test asserts every one of these six concept ids appears in this high-priority section and that the table rows tagged high match this set (plus their associated templates).

Why high priority on thin-pool concepts specifically: each concept has fewer templates in the bank, so any marking fragility on one template disproportionately poisons the concept's mastery signal. Fixing answer-spec fragility here first maximises the learning-integrity return per Phase 5 PR.

---

## 5. `contentReleaseId` impact matrix

Every row where marking behaviour changes bumps `contentReleaseId` and invalidates stored attempt evidence against the prior release. Rows that are purely declarative (selected-response → `exact`, where the mark result is byte-identical for every stored attempt) do not bump.

- **Rows requiring `contentReleaseId` bump: 189.** Every row marked `YES` in the table — all constructed-response templates. The 20 legacy constructed-response migrations were batched in QG P2; the 8 P14 constructed rewrites are new score-bearing content and are covered by the P14 content-release bump.
- **Rows NOT requiring `contentReleaseId` bump: 357.** Every selected-response row marked `NO` — legacy selected-response rows preserve option-value equality, and the new P1/P3/P14 selected-response rows emit typed `answerSpec` data from day one. P1, P3, and P14 content themselves bump the Grammar content release because the pool changed, but the answer-spec marking contract does not add a separate marking-behaviour bump.
- **`explain_reason_choice` and `proc2_boundary_punctuation_explain`:** flagged `medium` priority and `NO` bump because today they are selected-response. If Phase 5 migrates them to free-text explanation, that migration **is** a marking-behaviour change and bumps `contentReleaseId` at that time.
- **`build_noun_phrase`, `standard_fix_sentence`, `proc2_fronted_adverbial_build`, `proc3_noun_phrase_build`:** `manualReviewOnly` migration **always** bumps `contentReleaseId`: the mark result shifts from `correct: true/false, score: 0..2` (adapter path) to `correct: false, score: 0, maxScore: 0, nonScored: true` (manual-review path). Stored attempt evidence must not be replayed as P2 mastery evidence.

---

## 6. Doc-gate test contract

The test file `tests/grammar-answer-spec-audit.test.js` enforces the following invariants. Any Phase 5 PR touching this doc must keep them green.

- **Doc exists.** `docs/plans/james/grammar/grammar-answer-spec-audit.md` is readable.
- **Row count.** The classification table in §2 parses to exactly `GRAMMAR_TEMPLATES.length` rows.
- **Template id coverage.** Every template id in the table exists in `GRAMMAR_TEMPLATES` (imported from `worker/src/subjects/grammar/content.js`); no typos, no orphaned rows.
- **Kind validity.** Every proposed `answerSpec.kind` in the table is in `ANSWER_SPEC_KINDS` (imported from `worker/src/subjects/grammar/answer-spec.js`).
- **Manual-review-only floor.** §3 lists **at least 5** `manualReviewOnly` candidates.
- **P1 focus coverage.** §4 lists all six concepts that were thin-pool before P1 expansion: `pronouns_cohesion`, `formality`, `active_passive`, `subject_object`, `modal_verbs`, `hyphen_ambiguity`.

The test file does **not** touch `content.js`, `answer-spec.js`, or any oracle fixture. It is a pure doc gate.

---

## 7. Migration notes and future boundaries

These notes are now historical migration guidance plus future backlog boundaries:

- **QG P2 batching.** P2 intentionally shipped all 20 constructed-response migrations in one release so the answer-spec denominator, release id, redaction gate, smoke family coverage, and reward safety moved together.
- **Historical migration ordering suggestion.**
  1. Thin-pool `active_passive` rewrites (`normalisedText`) — 2 templates.
  2. Thin-pool `hyphen_ambiguity` surgery (`punctuationPattern`) — 1 template (`proc3_hyphen_fix_meaning`).
  3. Remaining punctuation-surgery templates (`punctuationPattern`) — 7 templates.
  4. Remaining rewrites (`normalisedText`) — 3 templates.
  5. Clause combine/join (`acceptedSet`) — 2 templates.
  6. Builders + ambiguous fixes (`manualReviewOnly`) — 4 templates.
  7. Selected-response batch (`exact`/`multiField`) — 82 templates after QG P14, with the four classify tables carrying `multiField` and the P3/P14 explanation templates already carrying `exact`.
  8. Explain-template re-evaluation (potential `manualReviewOnly` migration if they move to free-text) — still deferred to future content-expansion work.
- **`params` usage.** Reserved parameters flagged above (`params.optionalCommas`, `params.acceptHyphenMinus`, `params.acceptQuoteStyle`) remain future enhancements. P2 relies on declared golden strings matching fixture output byte-for-byte.

---

## 8. References

- Plan: `docs/plans/james/grammar/questions-generator/grammar-qg-p2.md`.
- Historical plan: `docs/plans/2026-04-26-001-feat-grammar-phase4-learning-hardening-plan.md` — U11 section.
- Source of truth: `worker/src/subjects/grammar/content.js` (`GRAMMAR_TEMPLATES`).
- Answer-spec module: `worker/src/subjects/grammar/answer-spec.js` (`ANSWER_SPEC_KINDS`, `markByAnswerSpec`, `validateAnswerSpec`).
- Phase 3 deferral of record: `docs/plans/james/grammar/grammar-phase3-implementation-report.md` §5 item 5.
- Phase 2 deferral of record: `docs/plans/james/grammar/grammar-phase2-implementation-report.md` §U5 scope decision.
- Invariants: `docs/plans/james/grammar/grammar-phase4-invariants.md` (Invariant 4: AI is post-marking enrichment only — scored specs contain only deterministic template output).
