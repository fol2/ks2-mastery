---
title: "Grammar answer-spec migration audit"
type: audit
status: p19-updated
date: 2026-05-04
plan: docs/plans/james/grammar/questions-generator/grammar-qg-p18-completion-report.md
unit: QG-P18
---

# Grammar answer-spec migration audit

This document is the per-template classification and shipped-state audit for the Grammar answer-spec migration. It inventories every one of the 510 Grammar templates (317 selected-response + 193 constructed-response) with the target `answerSpec.kind`, a golden accepted answer, near-miss examples that must be rejected, and migration priority. QG P18 promotes the combined P15-P18 manual expansion pack under `grammar-qg-p19-2026-05-04`; older QG baselines remain frozen for regression comparison.

The authoritative answer-spec kind list lives at `worker/src/subjects/grammar/answer-spec.js` (`ANSWER_SPEC_KINDS`). The six kinds are: `exact`, `normalisedText`, `acceptedSet`, `punctuationPattern`, `multiField`, `manualReviewOnly`. Every row below proposes one of those kinds; the gate test asserts the set membership.

QG P18 keeps legacy selected-response rows on the additive `exact` proposal where they do not yet emit hidden answer specs, while all newly generated P15-P18 families publish declarative specs from first runtime scheduling. Current live metadata: 484 generated templates, 26 fixed templates, 479 templates with declared answer specs (legacy-exact-proposed: 31, manualReviewOnly: 95, punctuationPattern: 9, acceptedSet: 2, normalisedText: 87, exact: 230, multiField: 56).
---

## 1. Scope and ground rules

- **510 templates total.** Confirmed by `GRAMMAR_TEMPLATES.length === 510` in `worker/src/subjects/grammar/content.js`. Split: 317 `isSelectedResponse: true`, 193 `isSelectedResponse: false`.
- **P18 release is active.** QG P18 uses `grammar-qg-p19-2026-05-04` and adds separate P18 fixtures/evidence. Historical QG fixtures remain unchanged unless explicitly marked as historical gates.
- **P1 focus concepts drive priority.** Six concepts were the confirmed thin-pool backlog before P1 expansion: `pronouns_cohesion`, `formality`, `active_passive`, `subject_object`, `modal_verbs`, `hyphen_ambiguity`. Every template carrying one of these concept ids in `skillIds` inherits **high** priority, so reliability work continues to land on the concepts that were previously fragile.
- **Selected-response default is `exact` unless the live template declares another kind.** Legacy selected-response rows without hidden answer specs keep the additive `exact` proposal; generated table-classification templates may declare `multiField`.
- **Constructed-response rows require release-id discipline.** Every constructed-response row is marked `YES` for release-id bump because changing accepted text, punctuation tolerance, or manual-review routing invalidates stored answer evidence.

---

## 2. Template classification table

Every row records: template id, concept id(s), question type, current marking path, proposed `answerSpec.kind`, a golden accepted answer, at least one near-miss that must be rejected, priority, and whether the migration requires a `contentReleaseId` bump.

Current marking path column legend:
- `selected: index match` — `isSelectedResponse: true`, the generator's `evaluate` closure compares `resp.answer === item.correct`.
- `adapter: markStringAnswer` — `isSelectedResponse: false`, the generator's `evaluate` closure calls `markStringAnswer(respText, accepted, opts)`, which constructs a transient `acceptedSet` spec and delegates to `markByAnswerSpec`.
- `answerSpec: <kind>` — the template already emits a declared hidden answer spec of that kind from first publication.

Priority column legend: `high` (thin-pool concept or structurally fragile marking), `medium` (constructed-response migration needs a spec-kind change), `low` (additive migration, no marking-behaviour change).

`Release-id bump` column legend: `YES` when Phase 5 migration changes marking behaviour (new near-miss rejections, new accepted variants, or kind change that alters accept/reject outcomes for stored attempts); `NO` when the migration is purely declarative and preserves accept/reject for every existing attempt.

| Template id | Concept id(s) | Question type | Current marking path | Proposed `answerSpec.kind` | Golden accepted | Near-miss to reject | Priority | Release-id bump |
|---|---|---|---|---|---|---|---|---|
| `sentence_type_table` | `sentence_functions` | classify | selected: index match | `exact` | per-row option value | wrong visible option value | low | NO |
| `question_mark_select` | `sentence_functions`, `speech_punctuation` | identify | selected: index match | `exact` | What a difficult puzzle this is | wrong visible option value | low | NO |
| `word_class_underlined_choice` | `word_classes` | identify | selected: index match | `exact` | verb | wrong visible option value | low | NO |
| `identify_words_in_sentence` | `word_classes` | identify | selected: index match | `exact` | She | wrong visible option value | low | NO |
| `expanded_noun_phrase_choice` | `noun_phrases` | choose | selected: index match | `exact` | the tall boy with muddy boots | wrong visible option value | low | NO |
| `build_noun_phrase` | `noun_phrases` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | adult-reviewed response | not auto-rejected; routed to adult review | medium | YES |
| `fronted_adverbial_choose` | `adverbials` | choose | selected: index match | `exact` | During the storm, the old gate rattled loudly. | wrong visible option value | low | NO |
| `fix_fronted_adverbial` | `adverbials` | fix | answerSpec: punctuationPattern | `punctuationPattern` | Later that afternoon, our team finally scored. | punctuation moved or omitted | medium | YES |
| `subordinate_clause_choice` | `clauses` | identify | selected: index match | `exact` | Although the wind was strong | wrong visible option value | low | NO |
| `combine_clauses_rewrite` | `clauses` | rewrite | answerSpec: acceptedSet | `manualReviewOnly` | When the gate opened, the children ran outside. | unsupported paraphrase | medium | YES |
| `relative_clause_identify` | `relative_clauses` | choose | selected: index match | `exact` | The teacher who organised the trip checked the register. | wrong visible option value | low | NO |
| `relative_clause_complete` | `relative_clauses` | build | selected: index match | `exact` | that was locked outside | wrong visible option value | low | NO |
| `tense_form_choice` | `tense_aspect` | fill | selected: index match | `exact` | marked | wrong visible option value | low | NO |
| `tense_rewrite` | `tense_aspect` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | They had finished the model before lunch. | grammar target changed | medium | YES |
| `standard_english_pairs` | `standard_english` | choose | selected: index match | `exact` | accepted model answer | wrong visible option value | low | NO |
| `pronoun_cohesion_choice` | `pronouns_cohesion` | choose | selected: index match | `exact` | Ben gave Luca the map because Ben was carrying too many bags. | wrong visible option value | high | NO |
| `formality_pairs` | `formality` | choose | selected: index match | `exact` | accepted model answer | wrong visible option value | high | NO |
| `active_passive_rewrite` | `active_passive` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Sofia carried the lantern. | grammar target changed | high | YES |
| `subject_object_choice` | `subject_object` | identify | selected: index match | `exact` | Maya | wrong visible option value | high | NO |
| `modal_verb_choice` | `modal_verbs` | choose | selected: index match | `exact` | The bus will arrive at nine. | wrong visible option value | high | NO |
| `parenthesis_replace_choice` | `parenthesis_commas` | choose | selected: index match | `exact` | dashes | wrong visible option value | low | NO |
| `parenthesis_fix_sentence` | `parenthesis_commas` | fix | answerSpec: punctuationPattern | `punctuationPattern` | The trophy (made of silver) stood in the cabinet. | punctuation moved or omitted | medium | YES |
| `speech_punctuation_fix` | `speech_punctuation` | fix | answerSpec: punctuationPattern | `punctuationPattern` | The guide said, "Follow the red arrows." | punctuation moved or omitted | medium | YES |
| `apostrophe_possession_choice` | `apostrophes_possession` | choose | selected: index match | `exact` | children's | wrong visible option value | low | NO |
| `explain_reason_choice` | `adverbials`, `standard_english` | explain | selected: index match | `exact` | Because Standard English uses ‘were’ with ‘we’. | wrong visible option value | low | NO |
| `standard_fix_sentence` | `standard_english` | fix | answerSpec: manualReviewOnly | `manualReviewOnly` | adult-reviewed response | not auto-rejected; routed to adult review | medium | YES |
| `proc_fronted_adverbial_fix` | `adverbials` | fix | answerSpec: punctuationPattern | `punctuationPattern` | With great care, Ava locked the window. | punctuation moved or omitted | medium | YES |
| `proc_semicolon_choice` | `boundary_punctuation` | choose | selected: index match | `exact` | ; | wrong visible option value | low | NO |
| `proc_colon_list_fix` | `boundary_punctuation` | fix | answerSpec: punctuationPattern | `punctuationPattern` | The club offered three prizes: a medal, a certificate, a book token. | punctuation moved or omitted | medium | YES |
| `proc_dash_boundary_fix` | `boundary_punctuation` | fix | answerSpec: punctuationPattern | `punctuationPattern` | The message was clear – everyone must leave the building at once. | punctuation moved or omitted | medium | YES |
| `proc_hyphen_ambiguity_choice` | `hyphen_ambiguity` | choose | selected: index match | `exact` | The six-year-old child ran across the park. | wrong visible option value | high | NO |
| `proc_speech_punctuation_fix` | `speech_punctuation` | fix | answerSpec: punctuationPattern | `punctuationPattern` | Ben said, "Shut the gate behind you!" | punctuation moved or omitted | medium | YES |
| `proc_apostrophe_possession_choice` | `apostrophes_possession` | choose | selected: index match | `exact` | the girl's coats | wrong visible option value | low | NO |
| `proc2_standard_english_choice` | `standard_english` | choose | selected: index match | `exact` | Ava don't know why the gate is locked. | wrong visible option value | low | NO |
| `proc2_standard_english_fix` | `standard_english` | fix | answerSpec: normalisedText | `manualReviewOnly` | Ava doesn't know why the gate is locked. | grammar target changed | medium | YES |
| `proc2_tense_aspect_choice` | `tense_aspect` | fill | selected: index match | `exact` | finished | wrong visible option value | low | NO |
| `proc2_modal_choice` | `modal_verbs` | fill | selected: index match | `exact` | should | wrong visible option value | high | NO |
| `proc2_formality_choice` | `formality` | choose | selected: index match | `exact` | I just wanted to ask if we could maybe have extra chairs. | wrong visible option value | high | NO |
| `proc2_pronoun_cohesion_choice` | `pronouns_cohesion` | choose | selected: index match | `exact` | Amira gave Ava it because Amira was carrying too many bags. | wrong visible option value | high | NO |
| `proc2_subject_object_identify` | `subject_object` | identify | selected: index match | `exact` | Ava | wrong visible option value | high | NO |
| `proc2_passive_to_active` | `active_passive` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Amira lifts the lantern this morning. | grammar target changed | high | YES |
| `proc2_relative_clause_choice` | `relative_clauses` | identify | selected: index match | `exact` | When everyone wanted the book, it was easy to spot. | wrong visible option value | low | NO |
| `proc2_fronted_adverbial_build` | `adverbials` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | adult-reviewed response | not auto-rejected; routed to adult review | medium | YES |
| `proc2_boundary_punctuation_explain` | `boundary_punctuation` | explain | selected: index match | `exact` | The colon replaces speech marks. | wrong visible option value | low | NO |
| `proc3_sentence_function_choice` | `sentence_functions` | choose | selected: index match | `exact` | Close the gate before the dog runs out. | wrong visible option value | low | NO |
| `proc3_word_class_contrast_choice` | `word_classes` | choose | selected: index match | `exact` | determiner | wrong visible option value | low | NO |
| `proc3_noun_phrase_build` | `noun_phrases` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | adult-reviewed response | not auto-rejected; routed to adult review | medium | YES |
| `proc3_clause_join_rewrite` | `clauses` | rewrite | answerSpec: acceptedSet | `manualReviewOnly` | We stayed inside because it was raining. | unsupported paraphrase | medium | YES |
| `proc3_parenthesis_commas_fix` | `parenthesis_commas` | fix | answerSpec: punctuationPattern | `punctuationPattern` | Our new puppy, to my surprise, slept through the storm. | punctuation moved or omitted | medium | YES |
| `proc3_hyphen_fix_meaning` | `hyphen_ambiguity` | fix | answerSpec: punctuationPattern | `punctuationPattern` | The team needed a well-earned break after the match. | punctuation moved or omitted | high | YES |
| `qg_active_passive_choice` | `active_passive` | choose | answerSpec: exact | `exact` | The hall was locked by the caretaker before assembly. | wrong visible option value | high | NO |
| `qg_subject_object_classify_table` | `subject_object` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_pronoun_referent_identify` | `pronouns_cohesion` | identify | answerSpec: exact | `exact` | Oliver | wrong visible option value | high | NO |
| `qg_formality_classify_table` | `formality` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_modal_verb_explain` | `modal_verbs` | explain | answerSpec: exact | `exact` | It shows possibility, not certainty. | wrong visible option value | high | NO |
| `qg_hyphen_ambiguity_explain` | `hyphen_ambiguity` | explain | answerSpec: exact | `exact` | The hyphen shows that the hospital is for small animals. | wrong visible option value | high | NO |
| `qg_p3_sentence_functions_explain` | `sentence_functions` | explain | answerSpec: exact | `exact` | It asks for information directly, so it is a question. | wrong visible option value | low | NO |
| `qg_p3_word_classes_explain` | `word_classes` | explain | answerSpec: exact | `exact` | It modifies the verb folded by saying how Maya folded. | wrong visible option value | low | NO |
| `qg_p3_noun_phrases_explain` | `noun_phrases` | explain | answerSpec: exact | `exact` | It is centred on the noun book and expanded by the phrase with a torn cover. | wrong visible option value | low | NO |
| `qg_p3_clauses_explain` | `clauses` | explain | answerSpec: exact | `exact` | It introduces a subordinate clause showing contrast with the main clause. | wrong visible option value | low | NO |
| `qg_p3_relative_clauses_explain` | `relative_clauses` | explain | answerSpec: exact | `exact` | It adds information about the noun plant. | wrong visible option value | low | NO |
| `qg_p3_tense_aspect_explain` | `tense_aspect` | explain | answerSpec: exact | `exact` | It shows one past action completed before another past action. | wrong visible option value | low | NO |
| `qg_p3_pronouns_cohesion_explain` | `pronouns_cohesion` | explain | answerSpec: exact | `exact` | She could refer to Maya or Priya, so the reference is ambiguous. | wrong visible option value | high | NO |
| `qg_p3_formality_explain` | `formality` | explain | answerSpec: exact | `exact` | It uses chatty wording that suits speech more than formal writing. | wrong visible option value | high | NO |
| `qg_p3_active_passive_explain` | `active_passive` | explain | answerSpec: exact | `exact` | The doer, the caretaker, is the subject before the verb. | wrong visible option value | high | NO |
| `qg_p3_subject_object_explain` | `subject_object` | explain | answerSpec: exact | `exact` | The soup receives the action of tasting. | wrong visible option value | high | NO |
| `qg_p3_parenthesis_commas_explain` | `parenthesis_commas` | explain | answerSpec: exact | `exact` | Usually quiet is extra information inserted into the sentence. | wrong visible option value | low | NO |
| `qg_p3_speech_punctuation_explain` | `speech_punctuation` | explain | answerSpec: exact | `exact` | The comma separates the spoken words from the reporting clause. | wrong visible option value | low | NO |
| `qg_p3_apostrophe_possession_explain` | `apostrophes_possession` | explain | answerSpec: exact | `exact` | More than one girl owns the bags, and girls is a regular plural ending in s. | wrong visible option value | low | NO |
| `proc3_apostrophe_rewrite` | `apostrophes_possession` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Luca's coats | grammar target changed | medium | YES |
| `qg_p4_sentence_speech_transfer` | `sentence_functions`, `speech_punctuation` | choose | answerSpec: exact | `exact` | Did Mum really say, "Pack your bag now"? | wrong visible option value | low | NO |
| `qg_p4_word_class_noun_phrase_transfer` | `word_classes`, `noun_phrases` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p4_adverbial_clause_boundary_transfer` | `adverbials`, `clauses`, `boundary_punctuation` | choose | answerSpec: exact | `exact` | Before the bell rang, the children lined up quietly. | wrong visible option value | low | NO |
| `qg_p4_relative_parenthesis_transfer` | `relative_clauses`, `parenthesis_commas` | choose | answerSpec: exact | `exact` | The oak tree, which was planted by the village founders, has stood for two hundred years. | wrong visible option value | low | NO |
| `qg_p4_verb_form_register_transfer` | `tense_aspect`, `modal_verbs`, `standard_english` | choose | answerSpec: exact | `exact` | Your child will need a packed lunch and should wear comfortable shoes. | wrong visible option value | high | NO |
| `qg_p4_cohesion_formality_transfer` | `pronouns_cohesion`, `formality` | choose | answerSpec: exact | `exact` | The council has approved the plans. It will begin work in September. | wrong visible option value | high | NO |
| `qg_p4_voice_roles_transfer` | `active_passive`, `subject_object` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p4_possession_hyphen_clarity_transfer` | `apostrophes_possession`, `hyphen_ambiguity` | choose | answerSpec: exact | `exact` | The well-known author's latest book topped the charts. | wrong visible option value | high | NO |
| `qg_p14_standard_english_diagnostic_choice` | `standard_english` | choose | answerSpec: exact | `exact` | Ben did the library pass before tea. | wrong visible option value | low | NO |
| `qg_p14_standard_english_constructed_rewrite` | `standard_english` | rewrite | answerSpec: normalisedText | `exact` | Ben did the library pass before tea. | grammar target changed | medium | NO |
| `qg_p14_standard_english_explain_why` | `standard_english` | explain | answerSpec: exact | `exact` | Standard English uses 'did' for this simple past verb form. | wrong visible option value | low | NO |
| `qg_p14_standard_english_mixed_transfer` | `standard_english` | choose | answerSpec: exact | `exact` | Ben did the library pass before tea. | wrong visible option value | low | NO |
| `qg_p14_fronted_adverbials_diagnostic_choice` | `adverbials` | choose | answerSpec: exact | `exact` | Before the final bell, Eli carried the history poster carefully. | wrong visible option value | low | NO |
| `qg_p14_fronted_adverbials_constructed_rewrite` | `adverbials` | rewrite | answerSpec: manualReviewOnly | `exact` | Before the final bell, Eli carried the history poster carefully. | grammar target changed | medium | NO |
| `qg_p14_fronted_adverbials_explain_why` | `adverbials` | explain | answerSpec: exact | `exact` | The opening phrase is a fronted adverbial, so the comma separates it from the main clause. | wrong visible option value | low | NO |
| `qg_p14_fronted_adverbials_mixed_transfer` | `adverbials` | choose | answerSpec: exact | `exact` | Before the final bell, Eli carried the history poster carefully. | wrong visible option value | low | NO |
| `qg_p14_subject_object_diagnostic_choice` | `subject_object` | choose | answerSpec: exact | `exact` | the clay model | wrong visible option value | high | NO |
| `qg_p14_subject_object_constructed_rewrite` | `subject_object` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | the clay model | grammar target changed | high | YES |
| `qg_p14_subject_object_explain_why` | `subject_object` | explain | answerSpec: exact | `exact` | The object receives the action of the verb. | wrong visible option value | high | NO |
| `qg_p14_subject_object_mixed_transfer` | `subject_object` | choose | answerSpec: exact | `exact` | subject: Ben; object: the clay model | wrong visible option value | high | NO |
| `qg_p14_subordinate_clauses_diagnostic_choice` | `clauses` | choose | answerSpec: exact | `exact` | although the path was muddy | wrong visible option value | low | NO |
| `qg_p14_subordinate_clauses_constructed_rewrite` | `clauses` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Although the path was muddy, Freya checked the recipe card. | grammar target changed | medium | YES |
| `qg_p14_subordinate_clauses_explain_why` | `clauses` | explain | answerSpec: exact | `exact` | It depends on the main clause to complete the meaning. | wrong visible option value | low | NO |
| `qg_p14_subordinate_clauses_mixed_transfer` | `clauses` | choose | answerSpec: exact | `exact` | Although the path was muddy, Freya checked the recipe card. | wrong visible option value | low | NO |
| `qg_p14_tense_aspect_diagnostic_choice` | `tense_aspect` | choose | answerSpec: exact | `exact` | Dylan finished the class trophy yesterday. | wrong visible option value | low | NO |
| `qg_p14_tense_aspect_constructed_rewrite` | `tense_aspect` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Dylan finished the class trophy yesterday. | grammar target changed | medium | YES |
| `qg_p14_tense_aspect_explain_why` | `tense_aspect` | explain | answerSpec: exact | `exact` | A finished past time signal needs the simple past form. | wrong visible option value | low | NO |
| `qg_p14_tense_aspect_mixed_transfer` | `tense_aspect` | choose | answerSpec: exact | `exact` | finished | wrong visible option value | low | NO |
| `qg_p14_speech_punctuation_diagnostic_choice` | `speech_punctuation` | choose | answerSpec: exact | `exact` | "Our team won the relay," Cara said. | wrong visible option value | low | NO |
| `qg_p14_speech_punctuation_constructed_rewrite` | `speech_punctuation` | rewrite | answerSpec: manualReviewOnly | `exact` | "Our team won the relay," Cara said. | grammar target changed | medium | NO |
| `qg_p14_speech_punctuation_explain_why` | `speech_punctuation` | explain | answerSpec: exact | `exact` | The comma belongs to the spoken words before the reporting clause. | wrong visible option value | low | NO |
| `qg_p14_speech_punctuation_mixed_transfer` | `speech_punctuation` | choose | answerSpec: exact | `exact` | "Can you hear thunder?" Cara asked. | wrong visible option value | low | NO |
| `qg_p14_expanded_noun_phrases_diagnostic_choice` | `noun_phrases` | choose | answerSpec: exact | `exact` | the cracked ceramic kite beside the coach bay | wrong visible option value | low | NO |
| `qg_p14_expanded_noun_phrases_constructed_rewrite` | `noun_phrases` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | the cracked ceramic kite beside the coach bay | grammar target changed | medium | YES |
| `qg_p14_expanded_noun_phrases_explain_why` | `noun_phrases` | explain | answerSpec: exact | `exact` | It is centred on a noun and includes extra words that describe or specify it. | wrong visible option value | low | NO |
| `qg_p14_expanded_noun_phrases_mixed_transfer` | `noun_phrases` | choose | answerSpec: exact | `exact` | The cracked ceramic kite beside the coach bay caught everyone's attention. | wrong visible option value | low | NO |
| `qg_p14_parenthesis_commas_diagnostic_choice` | `parenthesis_commas` | choose | answerSpec: exact | `exact` | Imani found the science folder, which everyone recognised at once, near the office. | wrong visible option value | low | NO |
| `qg_p14_parenthesis_commas_constructed_rewrite` | `parenthesis_commas` | rewrite | answerSpec: manualReviewOnly | `exact` | Imani found the science folder, which everyone recognised at once, near the office. | grammar target changed | medium | NO |
| `qg_p14_parenthesis_commas_explain_why` | `parenthesis_commas` | explain | answerSpec: exact | `exact` | They mark extra information that could be removed without breaking the main sentence. | wrong visible option value | low | NO |
| `qg_p14_parenthesis_commas_mixed_transfer` | `parenthesis_commas` | choose | answerSpec: exact | `exact` | Imani found the science folder, which everyone recognised at once, near the office. | wrong visible option value | low | NO |
| `qg_p18_p15_active_passive_explain_voice` | `active_passive` | explain | answerSpec: exact | `exact` | The doer and receiver keep the same roles, but the sentence voice changes. | wrong visible option value | high | NO |
| `qg_p18_p15_active_passive_voice_choice` | `active_passive` | choose | answerSpec: exact | `exact` | The bread was baked by the chef. | wrong visible option value | high | NO |
| `qg_p18_p15_active_passive_voice_rewrite` | `active_passive` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | The bread was baked by the chef. | grammar target changed | high | YES |
| `qg_p18_p15_active_passive_voice_roles_table` | `active_passive` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p15_active_passive_voice_transfer` | `active_passive` | choose | answerSpec: exact | `exact` | The bread was baked by the chef. | wrong visible option value | high | NO |
| `qg_p18_p15_adverbials_adverbial_transfer` | `adverbials` | choose | answerSpec: exact | `exact` | Before sunrise, the campers packed their bags. | wrong visible option value | low | NO |
| `qg_p18_p15_adverbials_explain_fronted_adv` | `adverbials` | explain | answerSpec: exact | `exact` | It gives when, where or how information at the start of the sentence. | wrong visible option value | low | NO |
| `qg_p18_p15_adverbials_fronted_adverbial_comma` | `adverbials` | fix | answerSpec: manualReviewOnly | `manualReviewOnly` | Before sunrise, the campers packed their bags. | grammar target changed | medium | YES |
| `qg_p18_p15_adverbials_identify_fronted_adv` | `adverbials` | identify | answerSpec: exact | `exact` | Before sunrise | wrong visible option value | low | NO |
| `qg_p18_p15_adverbials_move_adverbial` | `adverbials` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Before sunrise, the campers packed their bags. | grammar target changed | medium | YES |
| `qg_p18_p15_apostrophes_possession_explain_possession` | `apostrophes_possession` | explain | answerSpec: exact | `exact` | The apostrophe shows ownership, and its position shows whether the owner is singular or plural. | wrong visible option value | low | NO |
| `qg_p18_p15_apostrophes_possession_possession_table` | `apostrophes_possession` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p15_apostrophes_possession_possession_transfer` | `apostrophes_possession` | choose | answerSpec: exact | `exact` | the dog's bowl | wrong visible option value | low | NO |
| `qg_p18_p15_apostrophes_possession_possessive_choice` | `apostrophes_possession` | choose | answerSpec: exact | `exact` | the dog's bowl | wrong visible option value | low | NO |
| `qg_p18_p15_apostrophes_possession_possessive_rewrite` | `apostrophes_possession` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | the dog's bowl | grammar target changed | medium | YES |
| `qg_p18_p15_boundary_punctuation_boundary_fix` | `boundary_punctuation` | fix | answerSpec: normalisedText | `manualReviewOnly` | The sky darkened; the gulls flew inland. | grammar target changed | medium | YES |
| `qg_p18_p15_boundary_punctuation_boundary_label` | `boundary_punctuation` | identify | answerSpec: exact | `exact` | semi-colon | wrong visible option value | low | NO |
| `qg_p18_p15_boundary_punctuation_boundary_mark_choice` | `boundary_punctuation` | choose | answerSpec: exact | `exact` | ; | wrong visible option value | low | NO |
| `qg_p18_p15_boundary_punctuation_boundary_transfer` | `boundary_punctuation` | choose | answerSpec: exact | `exact` | The sky darkened; the gulls flew inland. | wrong visible option value | low | NO |
| `qg_p18_p15_boundary_punctuation_explain_boundary` | `boundary_punctuation` | explain | answerSpec: exact | `exact` | semi-colon joins two closely related main clauses | wrong visible option value | low | NO |
| `qg_p18_p15_clauses_clause_transfer` | `clauses` | choose | answerSpec: exact | `exact` | Although the wind was strong, the boat reached the shore. | wrong visible option value | low | NO |
| `qg_p18_p15_clauses_combine_clause` | `clauses` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Although the wind was strong, the boat reached the shore. | grammar target changed | medium | YES |
| `qg_p18_p15_clauses_explain_sub_clause` | `clauses` | explain | answerSpec: exact | `exact` | It begins with a subordinating conjunction and depends on the main clause. | wrong visible option value | low | NO |
| `qg_p18_p15_clauses_identify_sub_clause` | `clauses` | identify | answerSpec: exact | `exact` | Although the wind was strong | wrong visible option value | low | NO |
| `qg_p18_p15_clauses_repair_sub_fragment` | `clauses` | fix | answerSpec: manualReviewOnly | `manualReviewOnly` | Although the wind was strong, the boat reached the shore. | grammar target changed | medium | YES |
| `qg_p18_p15_formality_explain_formality` | `formality` | explain | answerSpec: exact | `exact` | It uses precise vocabulary and avoids chatty wording. | wrong visible option value | high | NO |
| `qg_p18_p15_formality_formal_choice` | `formality` | choose | answerSpec: exact | `exact` | Please discover whether the hall is open. | wrong visible option value | high | NO |
| `qg_p18_p15_formality_formal_rewrite` | `formality` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Please discover whether the hall is open. | grammar target changed | high | YES |
| `qg_p18_p15_formality_formality_pair_table` | `formality` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p15_formality_formality_transfer` | `formality` | choose | answerSpec: exact | `exact` | Please discover whether the hall is open. | wrong visible option value | high | NO |
| `qg_p18_p15_hyphen_ambiguity_explain_hyphen` | `hyphen_ambiguity` | explain | answerSpec: exact | `exact` | The hyphen links words so the reader sees the intended meaning clearly. | wrong visible option value | high | NO |
| `qg_p18_p15_hyphen_ambiguity_hyphen_choice` | `hyphen_ambiguity` | choose | answerSpec: exact | `exact` | man-eating shark | wrong visible option value | high | NO |
| `qg_p18_p15_hyphen_ambiguity_hyphen_fix` | `hyphen_ambiguity` | fix | answerSpec: normalisedText | `manualReviewOnly` | man-eating shark | grammar target changed | high | YES |
| `qg_p18_p15_hyphen_ambiguity_hyphen_meaning` | `hyphen_ambiguity` | identify | answerSpec: exact | `exact` | a shark that eats people | wrong visible option value | high | NO |
| `qg_p18_p15_hyphen_ambiguity_hyphen_transfer` | `hyphen_ambiguity` | choose | answerSpec: exact | `exact` | man-eating shark | wrong visible option value | high | NO |
| `qg_p18_p15_modal_verbs_explain_modal` | `modal_verbs` | explain | answerSpec: exact | `exact` | It changes the force of the verb to show strong advice. | wrong visible option value | high | NO |
| `qg_p18_p15_modal_verbs_modal_gap` | `modal_verbs` | fill | answerSpec: exact | `exact` | should | wrong visible option value | high | NO |
| `qg_p18_p15_modal_verbs_modal_meaning` | `modal_verbs` | identify | answerSpec: exact | `exact` | strong advice | wrong visible option value | high | NO |
| `qg_p18_p15_modal_verbs_modal_strength_order` | `modal_verbs` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p15_modal_verbs_modal_transfer` | `modal_verbs` | choose | answerSpec: exact | `exact` | You should wear a helmet on this trail. | wrong visible option value | high | NO |
| `qg_p18_p15_noun_phrases_build_np_context` | `noun_phrases` | build | answerSpec: normalisedText | `manualReviewOnly` | the nervous goalkeeper with muddy gloves | grammar target changed | medium | YES |
| `qg_p18_p15_noun_phrases_explain_np` | `noun_phrases` | explain | answerSpec: exact | `exact` | It is centred on a noun and includes extra describing or specifying detail. | wrong visible option value | low | NO |
| `qg_p18_p15_noun_phrases_head_noun` | `noun_phrases` | identify | answerSpec: exact | `exact` | goalkeeper | wrong visible option value | low | NO |
| `qg_p18_p15_noun_phrases_identify_expanded_np` | `noun_phrases` | choose | answerSpec: exact | `exact` | the nervous goalkeeper with muddy gloves | wrong visible option value | low | NO |
| `qg_p18_p15_noun_phrases_np_not_clause` | `noun_phrases` | choose | answerSpec: exact | `exact` | the nervous goalkeeper with muddy gloves | wrong visible option value | low | NO |
| `qg_p18_p15_parenthesis_commas_explain_parenthesis` | `parenthesis_commas` | explain | answerSpec: exact | `exact` | The extra information could be removed and the main sentence would still work. | wrong visible option value | low | NO |
| `qg_p18_p15_parenthesis_commas_parenthesis_choice` | `parenthesis_commas` | choose | answerSpec: exact | `exact` | Our class visited York, the oldest city on our route, first. | wrong visible option value | low | NO |
| `qg_p18_p15_parenthesis_commas_parenthesis_fix` | `parenthesis_commas` | fix | answerSpec: normalisedText | `manualReviewOnly` | Our class visited York, the oldest city on our route, first. | grammar target changed | medium | YES |
| `qg_p18_p15_parenthesis_commas_parenthesis_replace` | `parenthesis_commas` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Our class visited York (the oldest city on our route) first. | grammar target changed | medium | YES |
| `qg_p18_p15_parenthesis_commas_parenthesis_transfer` | `parenthesis_commas` | choose | answerSpec: exact | `exact` | Our class visited York, the oldest city on our route, first. | wrong visible option value | low | NO |
| `qg_p18_p15_pronouns_cohesion_cohesion_choice` | `pronouns_cohesion` | choose | answerSpec: exact | `exact` | Amira picked up the map. She folded it carefully. | wrong visible option value | high | NO |
| `qg_p18_p15_pronouns_cohesion_cohesion_rewrite` | `pronouns_cohesion` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Amira picked up the map. She folded it carefully. | grammar target changed | high | YES |
| `qg_p18_p15_pronouns_cohesion_cohesion_transfer` | `pronouns_cohesion` | choose | answerSpec: exact | `exact` | Amira picked up the map. She folded it carefully. | wrong visible option value | high | NO |
| `qg_p18_p15_pronouns_cohesion_explain_cohesion` | `pronouns_cohesion` | explain | answerSpec: exact | `exact` | The pronouns clearly refer back to the correct nouns without confusing the reader. | wrong visible option value | high | NO |
| `qg_p18_p15_pronouns_cohesion_pronoun_referent` | `pronouns_cohesion` | identify | answerSpec: exact | `exact` | Amira | wrong visible option value | high | NO |
| `qg_p18_p15_relative_clauses_complete_relative_clause` | `relative_clauses` | fill | answerSpec: exact | `exact` | who had lost her ticket | wrong visible option value | low | NO |
| `qg_p18_p15_relative_clauses_explain_relative_clause` | `relative_clauses` | explain | answerSpec: exact | `exact` | It begins with a relative word and adds information about the noun before it. | wrong visible option value | low | NO |
| `qg_p18_p15_relative_clauses_identify_relative_clause` | `relative_clauses` | identify | answerSpec: exact | `exact` | who had lost her ticket | wrong visible option value | low | NO |
| `qg_p18_p15_relative_clauses_punctuate_relative_clause` | `relative_clauses` | fix | answerSpec: normalisedText | `manualReviewOnly` | The girl, who had lost her ticket, waited by the gate. | grammar target changed | medium | YES |
| `qg_p18_p15_relative_clauses_relative_transfer` | `relative_clauses` | choose | answerSpec: exact | `exact` | The girl, who had lost her ticket, waited by the gate. | wrong visible option value | low | NO |
| `qg_p18_p15_sentence_functions_explain_function` | `sentence_functions` | explain | answerSpec: exact | `exact` | It tells someone to do something. | wrong visible option value | low | NO |
| `qg_p18_p15_sentence_functions_function_contrast` | `sentence_functions` | choose | answerSpec: exact | `exact` | command | wrong visible option value | low | NO |
| `qg_p18_p15_sentence_functions_identify_function` | `sentence_functions` | identify | answerSpec: exact | `exact` | command | wrong visible option value | low | NO |
| `qg_p18_p15_sentence_functions_punctuate_by_function` | `sentence_functions` | fix | answerSpec: manualReviewOnly | `manualReviewOnly` | Close the library door quietly. | grammar target changed | medium | YES |
| `qg_p18_p15_sentence_functions_sat_style_function` | `sentence_functions` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p15_speech_punctuation_explain_speech` | `speech_punctuation` | explain | answerSpec: exact | `exact` | The spoken words are enclosed in speech marks and their punctuation is inside the marks. | wrong visible option value | low | NO |
| `qg_p18_p15_speech_punctuation_speech_choice` | `speech_punctuation` | choose | answerSpec: exact | `exact` | "Where are you going?" asked Mum. | wrong visible option value | low | NO |
| `qg_p18_p15_speech_punctuation_speech_fix` | `speech_punctuation` | fix | answerSpec: normalisedText | `manualReviewOnly` | "Where are you going?" asked Mum. | grammar target changed | medium | YES |
| `qg_p18_p15_speech_punctuation_speech_reporter_position` | `speech_punctuation` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p15_speech_punctuation_speech_transfer` | `speech_punctuation` | choose | answerSpec: exact | `exact` | "Where are you going?" asked Mum. | wrong visible option value | low | NO |
| `qg_p18_p15_standard_english_explain_standard` | `standard_english` | explain | answerSpec: exact | `exact` | It uses the accepted written grammar form expected in formal school writing. | wrong visible option value | low | NO |
| `qg_p18_p15_standard_english_standard_choice` | `standard_english` | choose | answerSpec: exact | `exact` | We were late for assembly. | wrong visible option value | low | NO |
| `qg_p18_p15_standard_english_standard_fix` | `standard_english` | fix | answerSpec: normalisedText | `manualReviewOnly` | We were late for assembly. | grammar target changed | medium | YES |
| `qg_p18_p15_standard_english_standard_pairs` | `standard_english` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p15_standard_english_standard_transfer` | `standard_english` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | We were late for assembly. | grammar target changed | medium | YES |
| `qg_p18_p15_subject_object_explain_roles` | `subject_object` | explain | answerSpec: exact | `exact` | The subject does the action and the object receives it. | wrong visible option value | high | NO |
| `qg_p18_p15_subject_object_identify_object` | `subject_object` | identify | answerSpec: exact | `exact` | the sandwich | wrong visible option value | high | NO |
| `qg_p18_p15_subject_object_identify_subject` | `subject_object` | identify | answerSpec: exact | `exact` | The noisy gull | wrong visible option value | high | NO |
| `qg_p18_p15_subject_object_role_table` | `subject_object` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p15_subject_object_role_transfer` | `subject_object` | choose | answerSpec: exact | `exact` | The noisy gull stole the sandwich from Max. | wrong visible option value | high | NO |
| `qg_p18_p15_tense_aspect_choose_tense_form` | `tense_aspect` | fill | answerSpec: exact | `exact` | I have finished my homework. | wrong visible option value | low | NO |
| `qg_p18_p15_tense_aspect_explain_tense` | `tense_aspect` | explain | answerSpec: exact | `exact` | It uses the verb form needed for the present perfect. | wrong visible option value | low | NO |
| `qg_p18_p15_tense_aspect_tense_editing` | `tense_aspect` | fix | answerSpec: normalisedText | `manualReviewOnly` | I have finished my homework. | grammar target changed | medium | YES |
| `qg_p18_p15_tense_aspect_tense_near_miss` | `tense_aspect` | choose | answerSpec: exact | `exact` | I have finished my homework. | wrong visible option value | low | NO |
| `qg_p18_p15_tense_aspect_tense_rewrite` | `tense_aspect` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | I have finished my homework. | grammar target changed | medium | YES |
| `qg_p18_p15_word_classes_explain_word_class` | `word_classes` | explain | answerSpec: exact | `exact` | It is a adverb because of the job it does in this sentence. | wrong visible option value | low | NO |
| `qg_p18_p15_word_classes_target_word_class` | `word_classes` | identify | answerSpec: exact | `exact` | adverb | wrong visible option value | low | NO |
| `qg_p18_p15_word_classes_underline_word_class` | `word_classes` | identify | answerSpec: exact | `exact` | adverb | wrong visible option value | low | NO |
| `qg_p18_p15_word_classes_word_class_sort` | `word_classes` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p15_word_classes_word_class_transfer` | `word_classes` | choose | answerSpec: exact | `exact` | On Tuesday, Aisha carefully folded the blue scarf. | wrong visible option value | low | NO |
| `qg_p18_p16_active_passive_agent_object_explain` | `active_passive` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The doer is in the by-phrase and the affected thing is the subject of the passive sentence. | grammar target changed | high | YES |
| `qg_p18_p16_active_passive_rewrite_voice` | `active_passive` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | The bread was baked by the chef. | grammar target changed | high | YES |
| `qg_p18_p16_active_passive_same_meaning_choice` | `active_passive` | choose | answerSpec: exact | `exact` | The bread was baked by the chef. | wrong visible option value | high | NO |
| `qg_p18_p16_active_passive_tense_preserving_voice` | `active_passive` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | The bread was baked by the chef. | grammar target changed | high | YES |
| `qg_p18_p16_active_passive_voice_error_spot` | `active_passive` | choose | answerSpec: exact | `exact` | reversed roles | wrong visible option value | high | NO |
| `qg_p18_p16_active_passive_voice_identify` | `active_passive` | classify | answerSpec: exact | `exact` | passive | wrong visible option value | high | NO |
| `qg_p18_p16_adverbials_adverbial_or_not` | `adverbials` | choose | answerSpec: exact | `exact` | yes | wrong visible option value | low | NO |
| `qg_p18_p16_adverbials_choose_best_opening_adverbial` | `adverbials` | choose | answerSpec: exact | `exact` | Before sunrise | wrong visible option value | low | NO |
| `qg_p18_p16_adverbials_explain_fronted_comma` | `adverbials` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The comma separates the fronted adverbial "Before sunrise" from the main clause. | grammar target changed | medium | YES |
| `qg_p18_p16_adverbials_fronted_adverbial_type` | `adverbials` | classify | answerSpec: exact | `exact` | when | wrong visible option value | low | NO |
| `qg_p18_p16_adverbials_fronted_comma_fix` | `adverbials` | fix | answerSpec: manualReviewOnly | `manualReviewOnly` | Before sunrise, the campers packed their bags. | grammar target changed | medium | YES |
| `qg_p18_p16_adverbials_move_adverbial_to_front` | `adverbials` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Before sunrise, the campers packed their bags. | grammar target changed | medium | YES |
| `qg_p18_p16_apostrophes_possession_choose_possessive_phrase` | `apostrophes_possession` | choose | answerSpec: exact | `exact` | the dog's bowl | wrong visible option value | low | NO |
| `qg_p18_p16_apostrophes_possession_explain_position` | `apostrophes_possession` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The apostrophe position shows whether one owner or more than one owner possesses the noun. | grammar target changed | medium | YES |
| `qg_p18_p16_apostrophes_possession_fix_missing_apostrophe` | `apostrophes_possession` | fix | answerSpec: manualReviewOnly | `manualReviewOnly` | the dog's bowl | grammar target changed | medium | YES |
| `qg_p18_p16_apostrophes_possession_meaning_change_choice` | `apostrophes_possession` | choose | answerSpec: exact | `exact` | the dog's bowl | wrong visible option value | low | NO |
| `qg_p18_p16_apostrophes_possession_possession_not_contraction` | `apostrophes_possession` | choose | answerSpec: exact | `exact` | possession | wrong visible option value | low | NO |
| `qg_p18_p16_apostrophes_possession_singular_plural_possession` | `apostrophes_possession` | classify | answerSpec: exact | `exact` | singular | wrong visible option value | low | NO |
| `qg_p18_p16_boundary_punctuation_choose_boundary_mark` | `boundary_punctuation` | choose | answerSpec: exact | `exact` | semicolon | wrong visible option value | low | NO |
| `qg_p18_p16_boundary_punctuation_choose_correct_boundary_sentence` | `boundary_punctuation` | choose | answerSpec: exact | `exact` | The sky darkened; the gulls flew inland. | wrong visible option value | low | NO |
| `qg_p18_p16_boundary_punctuation_explain_colon_semicolon_dash` | `boundary_punctuation` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The semicolon helps show the relationship between the two parts of the sentence. | grammar target changed | medium | YES |
| `qg_p18_p16_boundary_punctuation_insert_boundary_mark` | `boundary_punctuation` | fix | answerSpec: normalisedText | `manualReviewOnly` | The sky darkened; the gulls flew inland. | grammar target changed | medium | YES |
| `qg_p18_p16_boundary_punctuation_match_mark_to_purpose` | `boundary_punctuation` | choose | answerSpec: exact | `exact` | join two related main clauses | wrong visible option value | low | NO |
| `qg_p18_p16_boundary_punctuation_semicolon_or_comma_splice` | `boundary_punctuation` | choose | answerSpec: exact | `exact` | It links or separates ideas with the correct strength. | wrong visible option value | low | NO |
| `qg_p18_p16_clauses_clause_order_meaning_transfer` | `clauses` | choose | answerSpec: exact | `exact` | Although the wind was strong, the boat reached the shore. / the boat reached the shore although the wind was strong. | wrong visible option value | low | NO |
| `qg_p18_p16_clauses_explain_subordination` | `clauses` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | It begins with "Although" and depends on the main clause "the boat reached the shore" to complete the meaning. | grammar target changed | medium | YES |
| `qg_p18_p16_clauses_fragment_or_sentence` | `clauses` | choose | answerSpec: exact | `exact` | fragment | wrong visible option value | low | NO |
| `qg_p18_p16_clauses_join_with_given_conjunction` | `clauses` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Although the wind was strong, the boat reached the shore. | grammar target changed | medium | YES |
| `qg_p18_p16_clauses_main_vs_subordinate_table` | `clauses` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p16_clauses_punctuate_subordinate_first` | `clauses` | fix | answerSpec: normalisedText | `manualReviewOnly` | Although the wind was strong, the boat reached the shore. | grammar target changed | medium | YES |
| `qg_p18_p16_clauses_subordinate_clause_identify` | `clauses` | identify | answerSpec: exact | `exact` | Although the wind was strong | wrong visible option value | low | NO |
| `qg_p18_p16_formality_choose_formal_word` | `formality` | choose | answerSpec: exact | `exact` | request | wrong visible option value | high | NO |
| `qg_p18_p16_formality_explain_formality_effect` | `formality` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | "request" sounds more precise and less conversational than "ask for". | grammar target changed | high | YES |
| `qg_p18_p16_formality_formal_sentence_rewrite` | `formality` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Please request whether the hall is open. | grammar target changed | high | YES |
| `qg_p18_p16_formality_informal_to_formal_pair_table` | `formality` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p16_formality_least_formal_choice` | `formality` | choose | answerSpec: exact | `exact` | ask for | wrong visible option value | high | NO |
| `qg_p18_p16_formality_register_context_choice` | `formality` | choose | answerSpec: exact | `exact` | I would like to request. | wrong visible option value | high | NO |
| `qg_p18_p16_hyphen_ambiguity_choose_hyphenated_meaning` | `hyphen_ambiguity` | choose | answerSpec: exact | `exact` | man-eating shark | wrong visible option value | high | NO |
| `qg_p18_p16_hyphen_ambiguity_explain_hyphen_meaning` | `hyphen_ambiguity` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The hyphen links words so they work together to express "a shark that eats people". | grammar target changed | high | YES |
| `qg_p18_p16_hyphen_ambiguity_fix_ambiguous_phrase` | `hyphen_ambiguity` | fix | answerSpec: normalisedText | `manualReviewOnly` | man-eating shark | grammar target changed | high | YES |
| `qg_p18_p16_hyphen_ambiguity_hyphen_function_choice` | `hyphen_ambiguity` | choose | answerSpec: exact | `exact` | It links words to make the intended meaning clear. | wrong visible option value | high | NO |
| `qg_p18_p16_hyphen_ambiguity_hyphen_or_no_hyphen_table` | `hyphen_ambiguity` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p16_hyphen_ambiguity_spot_ambiguous_reading` | `hyphen_ambiguity` | choose | answerSpec: exact | `exact` | man eating shark | wrong visible option value | high | NO |
| `qg_p18_p16_modal_verbs_change_force_rewrite` | `modal_verbs` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | You should wear a helmet on this trail. | grammar target changed | high | YES |
| `qg_p18_p16_modal_verbs_choose_modal_meaning` | `modal_verbs` | fill | answerSpec: exact | `exact` | should | wrong visible option value | high | NO |
| `qg_p18_p16_modal_verbs_meaning_transfer_choice` | `modal_verbs` | choose | answerSpec: exact | `exact` | You should wear a helmet on this trail. | wrong visible option value | high | NO |
| `qg_p18_p16_modal_verbs_modal_context_explain` | `modal_verbs` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | It fits because it shows strong advice. | grammar target changed | high | YES |
| `qg_p18_p16_modal_verbs_modal_or_adverb` | `modal_verbs` | classify | answerSpec: exact | `exact` | modal verb | wrong visible option value | high | NO |
| `qg_p18_p16_modal_verbs_rank_certainty_choice` | `modal_verbs` | choose | answerSpec: exact | `exact` | must | wrong visible option value | high | NO |
| `qg_p18_p16_noun_phrases_build_with_given_head` | `noun_phrases` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | the bright explorer near the library | grammar target changed | medium | YES |
| `qg_p18_p16_noun_phrases_expand_plain_noun` | `noun_phrases` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | the bright gate beside the library | grammar target changed | medium | YES |
| `qg_p18_p16_noun_phrases_expanded_or_not_choice` | `noun_phrases` | choose | answerSpec: exact | `exact` | yes | wrong visible option value | low | NO |
| `qg_p18_p16_noun_phrases_explain_expansion` | `noun_phrases` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | It is centred on a noun and has extra words that describe or specify that noun. | grammar target changed | medium | YES |
| `qg_p18_p16_noun_phrases_head_noun_identify` | `noun_phrases` | identify | answerSpec: exact | `exact` | explorer | wrong visible option value | low | NO |
| `qg_p18_p16_noun_phrases_noun_phrase_vs_clause` | `noun_phrases` | classify | answerSpec: exact | `exact` | expanded noun phrase | wrong visible option value | low | NO |
| `qg_p18_p16_parenthesis_commas_add_parenthesis_commas` | `parenthesis_commas` | fix | answerSpec: normalisedText | `manualReviewOnly` | Luca, who was first in line, opened the door. | grammar target changed | medium | YES |
| `qg_p18_p16_parenthesis_commas_choose_parenthetical_part` | `parenthesis_commas` | identify | answerSpec: exact | `exact` | the extra information between commas | wrong visible option value | low | NO |
| `qg_p18_p16_parenthesis_commas_explain_parenthesis` | `parenthesis_commas` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The commas mark extra information that could be lifted out without destroying the main sentence. | grammar target changed | medium | YES |
| `qg_p18_p16_parenthesis_commas_parenthesis_or_not` | `parenthesis_commas` | choose | answerSpec: exact | `exact` | yes | wrong visible option value | low | NO |
| `qg_p18_p16_parenthesis_commas_punctuation_for_parenthesis` | `parenthesis_commas` | choose | answerSpec: exact | `exact` | commas, brackets or dashes | wrong visible option value | low | NO |
| `qg_p18_p16_parenthesis_commas_replace_brackets_with_commas` | `parenthesis_commas` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Luca, who was first in line, opened the door. | grammar target changed | medium | YES |
| `qg_p18_p16_pronouns_cohesion_choose_cohesive_sentence` | `pronouns_cohesion` | choose | answerSpec: exact | `exact` | Amira picked up the map. She folded it carefully. | wrong visible option value | high | NO |
| `qg_p18_p16_pronouns_cohesion_explain_cohesion` | `pronouns_cohesion` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The pronouns avoid repetition while still making it clear who or what each pronoun refers to. | grammar target changed | high | YES |
| `qg_p18_p16_pronouns_cohesion_fix_pronoun_reference` | `pronouns_cohesion` | fix | answerSpec: normalisedText | `manualReviewOnly` | Amira picked up the map. She folded it carefully. | grammar target changed | high | YES |
| `qg_p18_p16_pronouns_cohesion_reduce_repetition_rewrite` | `pronouns_cohesion` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Amira picked up the map. She folded it carefully. | grammar target changed | high | YES |
| `qg_p18_p16_pronouns_cohesion_referent_identify` | `pronouns_cohesion` | identify | answerSpec: exact | `exact` | the earlier noun it replaces | wrong visible option value | high | NO |
| `qg_p18_p16_pronouns_cohesion_too_many_pronouns` | `pronouns_cohesion` | choose | answerSpec: exact | `exact` | The pronouns do not clearly refer to the right nouns. | wrong visible option value | high | NO |
| `qg_p18_p16_relative_clauses_add_commas_non_defining` | `relative_clauses` | fix | answerSpec: normalisedText | `manualReviewOnly` | The teacher who had visited Egypt helped us. | grammar target changed | medium | YES |
| `qg_p18_p16_relative_clauses_complete_with_relative_clause` | `relative_clauses` | choose | answerSpec: exact | `exact` | who had visited Egypt | wrong visible option value | low | NO |
| `qg_p18_p16_relative_clauses_explain_relative_clause` | `relative_clauses` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | It adds information about a noun and begins with a relative word such as who, which, that, where or whose. | grammar target changed | medium | YES |
| `qg_p18_p16_relative_clauses_noun_linked_by_relative` | `relative_clauses` | identify | answerSpec: exact | `exact` | teacher | wrong visible option value | low | NO |
| `qg_p18_p16_relative_clauses_relative_clause_identify_span` | `relative_clauses` | identify | answerSpec: exact | `exact` | who had visited Egypt | wrong visible option value | low | NO |
| `qg_p18_p16_relative_clauses_relative_or_time_clause` | `relative_clauses` | classify | answerSpec: exact | `exact` | time clause | wrong visible option value | low | NO |
| `qg_p18_p16_sentence_functions_choose_matching_function_for_context` | `sentence_functions` | choose | answerSpec: exact | `exact` | Line up quietly by the door. | wrong visible option value | low | NO |
| `qg_p18_p16_sentence_functions_direct_indirect_question_contrast` | `sentence_functions` | identify | answerSpec: exact | `exact` | question | wrong visible option value | low | NO |
| `qg_p18_p16_sentence_functions_exclamation_not_excited_statement` | `sentence_functions` | choose | answerSpec: exact | `exact` | exclamation | wrong visible option value | low | NO |
| `qg_p18_p16_sentence_functions_explain_function_reasoning` | `sentence_functions` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | It begins with What and follows the exclamation structure. | grammar target changed | medium | YES |
| `qg_p18_p16_sentence_functions_punctuation_vs_function_table` | `sentence_functions` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p16_sentence_functions_repair_wrong_function_punctuation` | `sentence_functions` | fix | answerSpec: normalisedText | `manualReviewOnly` | Turn off the tap. | grammar target changed | medium | YES |
| `qg_p18_p16_speech_punctuation_explain_speech_rule` | `speech_punctuation` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The spoken words go inside speech marks, and the sentence punctuation belongs inside the closing speech mark when it is part of the speech. | grammar target changed | medium | YES |
| `qg_p18_p16_speech_punctuation_fix_punctuation_outside_marks` | `speech_punctuation` | fix | answerSpec: normalisedText | `manualReviewOnly` | "Where are you going?" asked Mum. | grammar target changed | medium | YES |
| `qg_p18_p16_speech_punctuation_inside_marks_choice` | `speech_punctuation` | choose | answerSpec: exact | `exact` | ? | wrong visible option value | low | NO |
| `qg_p18_p16_speech_punctuation_punctuate_direct_speech` | `speech_punctuation` | fix | answerSpec: normalisedText | `manualReviewOnly` | "Where are you going?" asked Mum. | grammar target changed | medium | YES |
| `qg_p18_p16_speech_punctuation_reporting_clause_position` | `speech_punctuation` | classify | answerSpec: exact | `exact` | asked Mum | wrong visible option value | low | NO |
| `qg_p18_p16_speech_punctuation_speech_or_indirect` | `speech_punctuation` | choose | answerSpec: exact | `exact` | "Where are you going?" asked Mum. | wrong visible option value | low | NO |
| `qg_p18_p16_standard_english_choose_standard_sentence` | `standard_english` | choose | answerSpec: exact | `exact` | We were late. | wrong visible option value | low | NO |
| `qg_p18_p16_standard_english_context_formal_standard` | `standard_english` | choose | answerSpec: exact | `exact` | We were late. | wrong visible option value | low | NO |
| `qg_p18_p16_standard_english_explain_standard_choice` | `standard_english` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | It uses the accepted written form rather than the non-standard spoken form "We was late.". | grammar target changed | medium | YES |
| `qg_p18_p16_standard_english_fix_nonstandard` | `standard_english` | fix | answerSpec: normalisedText | `manualReviewOnly` | We were late. | grammar target changed | medium | YES |
| `qg_p18_p16_standard_english_rewrite_standard_english` | `standard_english` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | We were late. | grammar target changed | medium | YES |
| `qg_p18_p16_standard_english_standard_pairs_table` | `standard_english` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p16_subject_object_explain_roles` | `subject_object` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The subject is The noisy gull; the object is the sandwich. | grammar target changed | high | YES |
| `qg_p18_p16_subject_object_find_object` | `subject_object` | identify | answerSpec: exact | `exact` | the sandwich | wrong visible option value | high | NO |
| `qg_p18_p16_subject_object_find_subject` | `subject_object` | identify | answerSpec: exact | `exact` | The noisy gull | wrong visible option value | high | NO |
| `qg_p18_p16_subject_object_opening_adverbial_trap` | `subject_object` | choose | answerSpec: exact | `exact` | It tells when/where, not who or what does the action. | wrong visible option value | high | NO |
| `qg_p18_p16_subject_object_rewrite_preserve_roles` | `subject_object` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | The noisy gull stole the sandwich from Max. | grammar target changed | high | YES |
| `qg_p18_p16_subject_object_subject_object_table` | `subject_object` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p16_tense_aspect_choose_best_verb_form` | `tense_aspect` | fill | answerSpec: exact | `exact` | I have finished my homework. | wrong visible option value | low | NO |
| `qg_p18_p16_tense_aspect_fix_wrong_form` | `tense_aspect` | fix | answerSpec: normalisedText | `manualReviewOnly` | I have finished my homework. | grammar target changed | medium | YES |
| `qg_p18_p16_tense_aspect_form_explanation` | `tense_aspect` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | It uses the helping verb pattern needed for the present perfect and changes the main verb correctly. | grammar target changed | medium | YES |
| `qg_p18_p16_tense_aspect_rewrite_to_named_form` | `tense_aspect` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | I have finished my homework. | grammar target changed | medium | YES |
| `qg_p18_p16_tense_aspect_spot_tense_shift_error` | `tense_aspect` | choose | answerSpec: exact | `exact` | I have finished my homework. | wrong visible option value | low | NO |
| `qg_p18_p16_tense_aspect_timeline_order_choice` | `tense_aspect` | fill | answerSpec: exact | `exact` | had / started | wrong visible option value | low | NO |
| `qg_p18_p16_word_classes_build_word_class_sentence` | `word_classes` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Ben often cycles to school. | grammar target changed | medium | YES |
| `qg_p18_p16_word_classes_distractor_reason_choice` | `word_classes` | explain | answerSpec: exact | `exact` | It is a adverb because of its job in the sentence. | wrong visible option value | low | NO |
| `qg_p18_p16_word_classes_edge_word_class_transfer` | `word_classes` | choose | answerSpec: exact | `exact` | It is preposition first and adverb second. | wrong visible option value | low | NO |
| `qg_p18_p16_word_classes_multi_token_classify_table` | `word_classes` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p16_word_classes_pick_all_target_class` | `word_classes` | identify | answerSpec: exact | `exact` | carefully, quietly | wrong visible option value | low | NO |
| `qg_p18_p16_word_classes_role_in_context_choice` | `word_classes` | identify | answerSpec: exact | `exact` | adverb | wrong visible option value | low | NO |
| `qg_p18_p16_word_classes_same_word_different_job` | `word_classes` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | In the first sentence it is a noun; in the second it is a verb. | grammar target changed | medium | YES |
| `qg_p18_p17_active_passive_examiner_trap_contrast` | `active_passive` | choose | answerSpec: exact | `exact` | 'The bread was baked by the chef.' is defensible; 'The bread baked the chef.' is a near miss because it fails the grammar condition. | wrong visible option value | high | NO |
| `qg_p18_p17_active_passive_misconception_repair` | `active_passive` | fix | answerSpec: normalisedText | `manualReviewOnly` | The bread was baked by the chef. | grammar target changed | high | YES |
| `qg_p18_p17_active_passive_precision_choice` | `active_passive` | choose | answerSpec: exact | `exact` | The bread was baked by the chef. | wrong visible option value | high | NO |
| `qg_p18_p17_active_passive_table_classify` | `active_passive` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p17_active_passive_transfer_apply` | `active_passive` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: The bread was baked by the chef.. New example should show the same rule. | grammar target changed | high | YES |
| `qg_p18_p17_active_passive_written_reason` | `active_passive` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The bread was baked by the chef. is best because the object becomes the subject in the passive. | grammar target changed | high | YES |
| `qg_p18_p17_adverbials_misconception_repair` | `adverbials` | fix | answerSpec: normalisedText | `manualReviewOnly` | Before the match | grammar target changed | medium | YES |
| `qg_p18_p17_adverbials_precision_choice` | `adverbials` | choose | answerSpec: exact | `exact` | Before the match | wrong visible option value | low | NO |
| `qg_p18_p17_adverbials_table_classify` | `adverbials` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p17_adverbials_transfer_apply` | `adverbials` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: Before the match. New example should show the same rule. | grammar target changed | medium | YES |
| `qg_p18_p17_adverbials_written_reason` | `adverbials` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | Before the match is best because the opening phrase tells when. | grammar target changed | medium | YES |
| `qg_p18_p17_apostrophes_possession_examiner_trap_contrast` | `apostrophes_possession` | choose | answerSpec: exact | `exact` | 'the dog's bowl' is defensible; 'the dogs' bowl' is a near miss because it fails the grammar condition. | wrong visible option value | low | NO |
| `qg_p18_p17_apostrophes_possession_misconception_repair` | `apostrophes_possession` | fix | answerSpec: normalisedText | `manualReviewOnly` | the dog's bowl | grammar target changed | medium | YES |
| `qg_p18_p17_apostrophes_possession_precision_choice` | `apostrophes_possession` | choose | answerSpec: exact | `exact` | the dog's bowl | wrong visible option value | low | NO |
| `qg_p18_p17_apostrophes_possession_table_classify` | `apostrophes_possession` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p17_apostrophes_possession_transfer_apply` | `apostrophes_possession` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: the dog's bowl. New example should show the same rule. | grammar target changed | medium | YES |
| `qg_p18_p17_apostrophes_possession_written_reason` | `apostrophes_possession` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | the dog's bowl is best because one dog owns the bowl, so apostrophe before s. | grammar target changed | medium | YES |
| `qg_p18_p17_boundary_punctuation_examiner_trap_contrast` | `boundary_punctuation` | choose | answerSpec: exact | `exact` | ';' is defensible; ':' is a near miss because it fails the grammar condition. | wrong visible option value | low | NO |
| `qg_p18_p17_boundary_punctuation_misconception_repair` | `boundary_punctuation` | fix | answerSpec: normalisedText | `manualReviewOnly` | ; | grammar target changed | medium | YES |
| `qg_p18_p17_boundary_punctuation_precision_choice` | `boundary_punctuation` | choose | answerSpec: exact | `exact` | ; | wrong visible option value | low | NO |
| `qg_p18_p17_boundary_punctuation_table_classify` | `boundary_punctuation` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p17_boundary_punctuation_transfer_apply` | `boundary_punctuation` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer:;. New example should show the same rule. | grammar target changed | medium | YES |
| `qg_p18_p17_boundary_punctuation_written_reason` | `boundary_punctuation` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | ; is best because a semi-colon can join two closely related main clauses. | grammar target changed | medium | YES |
| `qg_p18_p17_clauses_examiner_trap_contrast` | `clauses` | choose | answerSpec: exact | `exact` | 'Although the path was muddy' is defensible; 'we reached the farm' is a near miss because it fails the grammar condition. | wrong visible option value | low | NO |
| `qg_p18_p17_clauses_misconception_repair` | `clauses` | fix | answerSpec: normalisedText | `manualReviewOnly` | Although the path was muddy | grammar target changed | medium | YES |
| `qg_p18_p17_clauses_precision_choice` | `clauses` | choose | answerSpec: exact | `exact` | Although the path was muddy | wrong visible option value | low | NO |
| `qg_p18_p17_clauses_table_classify` | `clauses` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p17_clauses_transfer_apply` | `clauses` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: Although the path was muddy. New example should show the same rule. | grammar target changed | medium | YES |
| `qg_p18_p17_clauses_written_reason` | `clauses` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | Although the path was muddy is best because it cannot stand alone as a full sentence in this context. | grammar target changed | medium | YES |
| `qg_p18_p17_formality_misconception_repair` | `formality` | fix | answerSpec: normalisedText | `manualReviewOnly` | request | grammar target changed | high | YES |
| `qg_p18_p17_formality_precision_choice` | `formality` | choose | answerSpec: exact | `exact` | request | wrong visible option value | high | NO |
| `qg_p18_p17_formality_table_classify` | `formality` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p17_formality_transfer_apply` | `formality` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: request. New example should show the same rule. | grammar target changed | high | YES |
| `qg_p18_p17_formality_written_reason` | `formality` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | request is best because request is more formal. | grammar target changed | high | YES |
| `qg_p18_p17_hyphen_ambiguity_examiner_trap_contrast` | `hyphen_ambiguity` | choose | answerSpec: exact | `exact` | 'man-eating shark' is defensible; 'man eating shark' is a near miss because it fails the grammar condition. | wrong visible option value | high | NO |
| `qg_p18_p17_hyphen_ambiguity_misconception_repair` | `hyphen_ambiguity` | fix | answerSpec: normalisedText | `manualReviewOnly` | man-eating shark | grammar target changed | high | YES |
| `qg_p18_p17_hyphen_ambiguity_precision_choice` | `hyphen_ambiguity` | choose | answerSpec: exact | `exact` | man-eating shark | wrong visible option value | high | NO |
| `qg_p18_p17_hyphen_ambiguity_table_classify` | `hyphen_ambiguity` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p17_hyphen_ambiguity_transfer_apply` | `hyphen_ambiguity` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: man-eating shark. New example should show the same rule. | grammar target changed | high | YES |
| `qg_p18_p17_hyphen_ambiguity_written_reason` | `hyphen_ambiguity` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | man-eating shark is best because the hyphen links man and eating as a compound adjective. | grammar target changed | high | YES |
| `qg_p18_p17_modal_verbs_misconception_repair` | `modal_verbs` | fix | answerSpec: normalisedText | `manualReviewOnly` | should | grammar target changed | high | YES |
| `qg_p18_p17_modal_verbs_precision_choice` | `modal_verbs` | choose | answerSpec: exact | `exact` | should | wrong visible option value | high | NO |
| `qg_p18_p17_modal_verbs_table_classify` | `modal_verbs` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p17_modal_verbs_transfer_apply` | `modal_verbs` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: should. New example should show the same rule. | grammar target changed | high | YES |
| `qg_p18_p17_modal_verbs_written_reason` | `modal_verbs` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | should is best because should gives strong advice. | grammar target changed | high | YES |
| `qg_p18_p17_noun_phrases_examiner_trap_contrast` | `noun_phrases` | choose | answerSpec: exact | `exact` | 'expanded noun phrase' is defensible; 'verb phrase' is a near miss because it fails the grammar condition. | wrong visible option value | low | NO |
| `qg_p18_p17_noun_phrases_misconception_repair` | `noun_phrases` | fix | answerSpec: normalisedText | `manualReviewOnly` | expanded noun phrase | grammar target changed | medium | YES |
| `qg_p18_p17_noun_phrases_precision_choice` | `noun_phrases` | choose | answerSpec: exact | `exact` | expanded noun phrase | wrong visible option value | low | NO |
| `qg_p18_p17_noun_phrases_table_classify` | `noun_phrases` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p17_noun_phrases_transfer_apply` | `noun_phrases` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: expanded noun phrase. New example should show the same rule. | grammar target changed | medium | YES |
| `qg_p18_p17_noun_phrases_written_reason` | `noun_phrases` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | expanded noun phrase is best because it centres on bowl and adds detail. | grammar target changed | medium | YES |
| `qg_p18_p17_parenthesis_commas_misconception_repair` | `parenthesis_commas` | fix | answerSpec: normalisedText | `manualReviewOnly` | Our guide, who had visited before, led us inside. | grammar target changed | medium | YES |
| `qg_p18_p17_parenthesis_commas_precision_choice` | `parenthesis_commas` | choose | answerSpec: exact | `exact` | Our guide, who had visited before, led us inside. | wrong visible option value | low | NO |
| `qg_p18_p17_parenthesis_commas_table_classify` | `parenthesis_commas` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p17_parenthesis_commas_transfer_apply` | `parenthesis_commas` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: Our guide, who had visited before, led us inside.. New example should show the same rule. | grammar target changed | medium | YES |
| `qg_p18_p17_parenthesis_commas_written_reason` | `parenthesis_commas` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | Our guide, who had visited before, led us inside. is best because commas mark the extra relative information. | grammar target changed | medium | YES |
| `qg_p18_p17_pronouns_cohesion_misconception_repair` | `pronouns_cohesion` | fix | answerSpec: normalisedText | `manualReviewOnly` | clear | grammar target changed | high | YES |
| `qg_p18_p17_pronouns_cohesion_precision_choice` | `pronouns_cohesion` | choose | answerSpec: exact | `exact` | clear | wrong visible option value | high | NO |
| `qg_p18_p17_pronouns_cohesion_table_classify` | `pronouns_cohesion` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p17_pronouns_cohesion_transfer_apply` | `pronouns_cohesion` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: clear. New example should show the same rule. | grammar target changed | high | YES |
| `qg_p18_p17_pronouns_cohesion_written_reason` | `pronouns_cohesion` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | clear is best because she refers to Amira and it refers to the map. | grammar target changed | high | YES |
| `qg_p18_p17_relative_clauses_misconception_repair` | `relative_clauses` | fix | answerSpec: normalisedText | `manualReviewOnly` | who won the race | grammar target changed | medium | YES |
| `qg_p18_p17_relative_clauses_precision_choice` | `relative_clauses` | choose | answerSpec: exact | `exact` | who won the race | wrong visible option value | low | NO |
| `qg_p18_p17_relative_clauses_table_classify` | `relative_clauses` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p17_relative_clauses_transfer_apply` | `relative_clauses` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: who won the race. New example should show the same rule. | grammar target changed | medium | YES |
| `qg_p18_p17_relative_clauses_written_reason` | `relative_clauses` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | who won the race is best because it adds information about the girl. | grammar target changed | medium | YES |
| `qg_p18_p17_sentence_functions_misconception_repair` | `sentence_functions` | fix | answerSpec: normalisedText | `manualReviewOnly` | command | grammar target changed | medium | YES |
| `qg_p18_p17_sentence_functions_precision_choice` | `sentence_functions` | choose | answerSpec: exact | `exact` | command | wrong visible option value | low | NO |
| `qg_p18_p17_sentence_functions_table_classify` | `sentence_functions` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p17_sentence_functions_transfer_apply` | `sentence_functions` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: command. New example should show the same rule. | grammar target changed | medium | YES |
| `qg_p18_p17_sentence_functions_written_reason` | `sentence_functions` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | command is best because it tells someone to do something. | grammar target changed | medium | YES |
| `qg_p18_p17_speech_punctuation_examiner_trap_contrast` | `speech_punctuation` | choose | answerSpec: exact | `exact` | '"Where are you going?" asked Mum.' is defensible; '"Where are you going"? asked Mum.' is a near miss because it fails the grammar condition. | wrong visible option value | low | NO |
| `qg_p18_p17_speech_punctuation_misconception_repair` | `speech_punctuation` | fix | answerSpec: normalisedText | `manualReviewOnly` | "Where are you going?" asked Mum. | grammar target changed | medium | YES |
| `qg_p18_p17_speech_punctuation_precision_choice` | `speech_punctuation` | choose | answerSpec: exact | `exact` | "Where are you going?" asked Mum. | wrong visible option value | low | NO |
| `qg_p18_p17_speech_punctuation_table_classify` | `speech_punctuation` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p17_speech_punctuation_transfer_apply` | `speech_punctuation` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: "Where are you going?" asked Mum.. New example should show the same rule. | grammar target changed | medium | YES |
| `qg_p18_p17_speech_punctuation_written_reason` | `speech_punctuation` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | "Where are you going?" asked Mum. is best because the question mark belongs inside the speech marks. | grammar target changed | medium | YES |
| `qg_p18_p17_standard_english_misconception_repair` | `standard_english` | fix | answerSpec: normalisedText | `manualReviewOnly` | were | grammar target changed | medium | YES |
| `qg_p18_p17_standard_english_precision_choice` | `standard_english` | choose | answerSpec: exact | `exact` | were | wrong visible option value | low | NO |
| `qg_p18_p17_standard_english_table_classify` | `standard_english` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p17_standard_english_transfer_apply` | `standard_english` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: were. New example should show the same rule. | grammar target changed | medium | YES |
| `qg_p18_p17_standard_english_written_reason` | `standard_english` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | were is best because standard English uses were with we. | grammar target changed | medium | YES |
| `qg_p18_p17_subject_object_examiner_trap_contrast` | `subject_object` | choose | answerSpec: exact | `exact` | 'the sandwich' is defensible; 'The noisy gull' is a near miss because it fails the grammar condition. | wrong visible option value | high | NO |
| `qg_p18_p17_subject_object_misconception_repair` | `subject_object` | fix | answerSpec: normalisedText | `manualReviewOnly` | the sandwich | grammar target changed | high | YES |
| `qg_p18_p17_subject_object_precision_choice` | `subject_object` | choose | answerSpec: exact | `exact` | the sandwich | wrong visible option value | high | NO |
| `qg_p18_p17_subject_object_table_classify` | `subject_object` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p17_subject_object_transfer_apply` | `subject_object` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: the sandwich. New example should show the same rule. | grammar target changed | high | YES |
| `qg_p18_p17_subject_object_written_reason` | `subject_object` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | the sandwich is best because the sandwich receives the action. | grammar target changed | high | YES |
| `qg_p18_p17_tense_aspect_examiner_trap_contrast` | `tense_aspect` | choose | answerSpec: exact | `exact` | 'has finished' is defensible; 'finished yesterday' is a near miss because it fails the grammar condition. | wrong visible option value | low | NO |
| `qg_p18_p17_tense_aspect_misconception_repair` | `tense_aspect` | fix | answerSpec: normalisedText | `manualReviewOnly` | has finished | grammar target changed | medium | YES |
| `qg_p18_p17_tense_aspect_precision_choice` | `tense_aspect` | choose | answerSpec: exact | `exact` | has finished | wrong visible option value | low | NO |
| `qg_p18_p17_tense_aspect_table_classify` | `tense_aspect` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p17_tense_aspect_transfer_apply` | `tense_aspect` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: has finished. New example should show the same rule. | grammar target changed | medium | YES |
| `qg_p18_p17_tense_aspect_written_reason` | `tense_aspect` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | has finished is best because present perfect links the past action to now. | grammar target changed | medium | YES |
| `qg_p18_p17_word_classes_examiner_trap_contrast` | `word_classes` | choose | answerSpec: exact | `exact` | 'adverb' is defensible; 'adjective' is a near miss because it fails the grammar condition. | wrong visible option value | low | NO |
| `qg_p18_p17_word_classes_misconception_repair` | `word_classes` | fix | answerSpec: normalisedText | `manualReviewOnly` | adverb | grammar target changed | medium | YES |
| `qg_p18_p17_word_classes_precision_choice` | `word_classes` | choose | answerSpec: exact | `exact` | adverb | wrong visible option value | low | NO |
| `qg_p18_p17_word_classes_table_classify` | `word_classes` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p17_word_classes_transfer_apply` | `word_classes` | build | answerSpec: manualReviewOnly | `manualReviewOnly` | Answer: adverb. New example should show the same rule. | grammar target changed | medium | YES |
| `qg_p18_p17_word_classes_written_reason` | `word_classes` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | adverb is best because it tells how Maya folded. | grammar target changed | medium | YES |
| `qg_p18_p18_active_passive_application_transfer` | `active_passive` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The object becomes the subject in the passive. | grammar target changed | high | YES |
| `qg_p18_p18_active_passive_diagnostic_identify` | `active_passive` | choose | answerSpec: exact | `exact` | The bread was baked by the chef. | wrong visible option value | high | NO |
| `qg_p18_p18_active_passive_explain_reasoning` | `active_passive` | explain | answerSpec: exact | `exact` | The object becomes the subject in the passive. | wrong visible option value | high | NO |
| `qg_p18_p18_active_passive_precision_repair_or_rewrite` | `active_passive` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | The bread was baked by the chef. | grammar target changed | high | YES |
| `qg_p18_p18_active_passive_sat_table_classification` | `active_passive` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p18_active_passive_subject_object_voice_subject_object_roles` | `active_passive`, `subject_object` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The bread was baked by the chef.; object: the sandwich | grammar target changed | high | YES |
| `qg_p18_p18_adverbials_application_transfer` | `adverbials` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | Before the bell, the children lined up quietly. | grammar target changed | medium | YES |
| `qg_p18_p18_adverbials_clauses_adverbial_clause_join` | `adverbials`, `clauses` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | Before the bell, the children lined up quietly.; Although the path was muddy | grammar target changed | medium | YES |
| `qg_p18_p18_adverbials_diagnostic_identify` | `adverbials` | choose | answerSpec: exact | `exact` | fronted adverbial | wrong visible option value | low | NO |
| `qg_p18_p18_adverbials_explain_reasoning` | `adverbials` | explain | answerSpec: exact | `exact` | The opening phrase tells when and needs a comma. | wrong visible option value | low | NO |
| `qg_p18_p18_adverbials_precision_repair_or_rewrite` | `adverbials` | fix | answerSpec: manualReviewOnly | `manualReviewOnly` | Before the bell, the children lined up quietly. | grammar target changed | medium | YES |
| `qg_p18_p18_adverbials_sat_table_classification` | `adverbials` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p18_apostrophes_possession_application_transfer` | `apostrophes_possession` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | One dog owns the bowl, so apostrophe before s. | grammar target changed | medium | YES |
| `qg_p18_p18_apostrophes_possession_diagnostic_identify` | `apostrophes_possession` | choose | answerSpec: exact | `exact` | the dog's bowl | wrong visible option value | low | NO |
| `qg_p18_p18_apostrophes_possession_explain_reasoning` | `apostrophes_possession` | explain | answerSpec: exact | `exact` | One dog owns the bowl, so apostrophe before s. | wrong visible option value | low | NO |
| `qg_p18_p18_apostrophes_possession_hyphen_ambiguity_possession_hyphen_precision` | `apostrophes_possession`, `hyphen_ambiguity` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | the dog's bowl; man-eating shark | grammar target changed | high | YES |
| `qg_p18_p18_apostrophes_possession_precision_repair_or_rewrite` | `apostrophes_possession` | fix | answerSpec: normalisedText | `manualReviewOnly` | the dog's bowl | grammar target changed | medium | YES |
| `qg_p18_p18_apostrophes_possession_sat_table_classification` | `apostrophes_possession` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p18_boundary_punctuation_application_transfer` | `boundary_punctuation` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | A semi-colon links two related main clauses. | grammar target changed | medium | YES |
| `qg_p18_p18_boundary_punctuation_diagnostic_identify` | `boundary_punctuation` | choose | answerSpec: exact | `exact` | semicolon | wrong visible option value | low | NO |
| `qg_p18_p18_boundary_punctuation_explain_reasoning` | `boundary_punctuation` | explain | answerSpec: exact | `exact` | A semi-colon links two related main clauses. | wrong visible option value | low | NO |
| `qg_p18_p18_boundary_punctuation_precision_repair_or_rewrite` | `boundary_punctuation` | fix | answerSpec: normalisedText | `manualReviewOnly` | semicolon | grammar target changed | medium | YES |
| `qg_p18_p18_boundary_punctuation_sat_table_classification` | `boundary_punctuation` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p18_boundary_punctuation_speech_punctuation_boundary_speech_punctuation` | `boundary_punctuation`, `speech_punctuation` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | semicolon; "Where are you going?" asked Mum. | grammar target changed | medium | YES |
| `qg_p18_p18_clauses_application_transfer` | `clauses` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | Although the path was muddy, the hikers kept walking. | grammar target changed | medium | YES |
| `qg_p18_p18_clauses_diagnostic_identify` | `clauses` | choose | answerSpec: exact | `exact` | Although the path was muddy | wrong visible option value | low | NO |
| `qg_p18_p18_clauses_explain_reasoning` | `clauses` | explain | answerSpec: exact | `exact` | The although-clause depends on the main clause. | wrong visible option value | low | NO |
| `qg_p18_p18_clauses_precision_repair_or_rewrite` | `clauses` | fix | answerSpec: normalisedText | `manualReviewOnly` | Although the path was muddy | grammar target changed | medium | YES |
| `qg_p18_p18_clauses_sat_table_classification` | `clauses` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p18_formality_application_transfer` | `formality` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | Established is more formal than got set up. | grammar target changed | high | YES |
| `qg_p18_p18_formality_diagnostic_identify` | `formality` | choose | answerSpec: exact | `exact` | The club was established last year. | wrong visible option value | high | NO |
| `qg_p18_p18_formality_explain_reasoning` | `formality` | explain | answerSpec: exact | `exact` | Established is more formal than got set up. | wrong visible option value | high | NO |
| `qg_p18_p18_formality_precision_repair_or_rewrite` | `formality` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | The club was established last year. | grammar target changed | high | YES |
| `qg_p18_p18_formality_sat_table_classification` | `formality` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p18_hyphen_ambiguity_application_transfer` | `hyphen_ambiguity` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The hyphen shows man-eating describes the shark. | grammar target changed | high | YES |
| `qg_p18_p18_hyphen_ambiguity_diagnostic_identify` | `hyphen_ambiguity` | choose | answerSpec: exact | `exact` | man-eating shark | wrong visible option value | high | NO |
| `qg_p18_p18_hyphen_ambiguity_explain_reasoning` | `hyphen_ambiguity` | explain | answerSpec: exact | `exact` | The hyphen shows man-eating describes the shark. | wrong visible option value | high | NO |
| `qg_p18_p18_hyphen_ambiguity_precision_repair_or_rewrite` | `hyphen_ambiguity` | fix | answerSpec: normalisedText | `manualReviewOnly` | man-eating shark | grammar target changed | high | YES |
| `qg_p18_p18_hyphen_ambiguity_sat_table_classification` | `hyphen_ambiguity` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p18_modal_verbs_application_transfer` | `modal_verbs` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | Should gives strong advice. | grammar target changed | high | YES |
| `qg_p18_p18_modal_verbs_diagnostic_identify` | `modal_verbs` | choose | answerSpec: exact | `exact` | should | wrong visible option value | high | NO |
| `qg_p18_p18_modal_verbs_explain_reasoning` | `modal_verbs` | explain | answerSpec: exact | `exact` | Should gives strong advice. | wrong visible option value | high | NO |
| `qg_p18_p18_modal_verbs_formality_modal_formality_strength` | `formality`, `modal_verbs` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | should; The club was established last year. | grammar target changed | high | YES |
| `qg_p18_p18_modal_verbs_precision_repair_or_rewrite` | `modal_verbs` | fix | answerSpec: normalisedText | `manualReviewOnly` | You should wear a helmet on this trail. | grammar target changed | high | YES |
| `qg_p18_p18_modal_verbs_sat_table_classification` | `modal_verbs` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p18_noun_phrases_application_transfer` | `noun_phrases` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | rolled beneath is not centred on a noun; the small blue marble is a noun phrase. | grammar target changed | medium | YES |
| `qg_p18_p18_noun_phrases_diagnostic_identify` | `noun_phrases` | choose | answerSpec: exact | `exact` | the small blue marble | wrong visible option value | low | NO |
| `qg_p18_p18_noun_phrases_explain_reasoning` | `noun_phrases` | explain | answerSpec: exact | `exact` | It is centred on the noun marble and expanded with detail. | wrong visible option value | low | NO |
| `qg_p18_p18_noun_phrases_precision_repair_or_rewrite` | `noun_phrases` | fix | answerSpec: normalisedText | `manualReviewOnly` | the small blue marble rolled beneath the sofa. | grammar target changed | medium | YES |
| `qg_p18_p18_noun_phrases_sat_table_classification` | `noun_phrases` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p18_parenthesis_commas_application_transfer` | `parenthesis_commas` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | Commas mark the parenthesis. | grammar target changed | medium | YES |
| `qg_p18_p18_parenthesis_commas_diagnostic_identify` | `parenthesis_commas` | choose | answerSpec: exact | `exact` | Luca, who was first in line, opened the door. | wrong visible option value | low | NO |
| `qg_p18_p18_parenthesis_commas_explain_reasoning` | `parenthesis_commas` | explain | answerSpec: exact | `exact` | Commas mark the parenthesis. | wrong visible option value | low | NO |
| `qg_p18_p18_parenthesis_commas_precision_repair_or_rewrite` | `parenthesis_commas` | fix | answerSpec: normalisedText | `manualReviewOnly` | Luca, who was first in line, opened the door. | grammar target changed | medium | YES |
| `qg_p18_p18_parenthesis_commas_sat_table_classification` | `parenthesis_commas` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p18_pronouns_cohesion_application_transfer` | `pronouns_cohesion` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The pronouns clearly refer back to Amira and the map. | grammar target changed | high | YES |
| `qg_p18_p18_pronouns_cohesion_diagnostic_identify` | `pronouns_cohesion` | choose | answerSpec: exact | `exact` | Amira picked up the map. She folded it carefully. | wrong visible option value | high | NO |
| `qg_p18_p18_pronouns_cohesion_explain_reasoning` | `pronouns_cohesion` | explain | answerSpec: exact | `exact` | The pronouns clearly refer back to Amira and the map. | wrong visible option value | high | NO |
| `qg_p18_p18_pronouns_cohesion_formality_cohesion_formality_choice` | `formality`, `pronouns_cohesion` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | Amira picked up the map. She folded it carefully.; The club was established last year. | grammar target changed | high | YES |
| `qg_p18_p18_pronouns_cohesion_precision_repair_or_rewrite` | `pronouns_cohesion` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | Amira picked up the map. She folded it carefully. | grammar target changed | high | YES |
| `qg_p18_p18_pronouns_cohesion_sat_table_classification` | `pronouns_cohesion` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p18_relative_clauses_application_transfer` | `relative_clauses` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The artist who painted the mural visited our class. | grammar target changed | medium | YES |
| `qg_p18_p18_relative_clauses_diagnostic_identify` | `relative_clauses` | choose | answerSpec: exact | `exact` | who painted the mural | wrong visible option value | low | NO |
| `qg_p18_p18_relative_clauses_explain_reasoning` | `relative_clauses` | explain | answerSpec: exact | `exact` | The clause begins with who and adds information about the artist. | wrong visible option value | low | NO |
| `qg_p18_p18_relative_clauses_parenthesis_commas_relative_parenthesis_punctuation` | `parenthesis_commas`, `relative_clauses` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | who painted the mural; Commas mark the parenthesis. | grammar target changed | medium | YES |
| `qg_p18_p18_relative_clauses_precision_repair_or_rewrite` | `relative_clauses` | fix | answerSpec: normalisedText | `manualReviewOnly` | who painted the mural | grammar target changed | medium | YES |
| `qg_p18_p18_relative_clauses_sat_table_classification` | `relative_clauses` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p18_sentence_functions_application_transfer` | `sentence_functions` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | It is a command because it tells someone what to do. | grammar target changed | medium | YES |
| `qg_p18_p18_sentence_functions_diagnostic_identify` | `sentence_functions` | identify | answerSpec: exact | `exact` | command | wrong visible option value | low | NO |
| `qg_p18_p18_sentence_functions_explain_reasoning` | `sentence_functions` | explain | answerSpec: exact | `exact` | It tells someone what to do. | wrong visible option value | low | NO |
| `qg_p18_p18_sentence_functions_precision_repair_or_rewrite` | `sentence_functions` | fix | answerSpec: manualReviewOnly | `manualReviewOnly` | Please return the atlas to the shelf. | grammar target changed | medium | YES |
| `qg_p18_p18_sentence_functions_sat_table_classification` | `sentence_functions` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p18_sentence_functions_speech_punctuation_function_speech_boundary` | `sentence_functions`, `speech_punctuation` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | command; "Where are you going?" asked Mum. | grammar target changed | medium | YES |
| `qg_p18_p18_speech_punctuation_application_transfer` | `speech_punctuation` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The question mark belongs inside the speech marks. | grammar target changed | medium | YES |
| `qg_p18_p18_speech_punctuation_diagnostic_identify` | `speech_punctuation` | choose | answerSpec: exact | `exact` | "Where are you going?" asked Mum. | wrong visible option value | low | NO |
| `qg_p18_p18_speech_punctuation_explain_reasoning` | `speech_punctuation` | explain | answerSpec: exact | `exact` | The question mark belongs inside the speech marks. | wrong visible option value | low | NO |
| `qg_p18_p18_speech_punctuation_precision_repair_or_rewrite` | `speech_punctuation` | fix | answerSpec: normalisedText | `manualReviewOnly` | "Where are you going?" asked Mum. | grammar target changed | medium | YES |
| `qg_p18_p18_speech_punctuation_sat_table_classification` | `speech_punctuation` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p18_standard_english_application_transfer` | `standard_english` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | Were is the Standard English form with we. | grammar target changed | medium | YES |
| `qg_p18_p18_standard_english_diagnostic_identify` | `standard_english` | choose | answerSpec: exact | `exact` | We were late for practice. | wrong visible option value | low | NO |
| `qg_p18_p18_standard_english_explain_reasoning` | `standard_english` | explain | answerSpec: exact | `exact` | Were is the Standard English form with we. | wrong visible option value | low | NO |
| `qg_p18_p18_standard_english_precision_repair_or_rewrite` | `standard_english` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | We were late for practice. | grammar target changed | medium | YES |
| `qg_p18_p18_standard_english_sat_table_classification` | `standard_english` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p18_subject_object_application_transfer` | `subject_object` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | The noisy gull is the subject; the sandwich is the object. The gull does the stealing; the sandwich receives the action. | grammar target changed | high | YES |
| `qg_p18_p18_subject_object_diagnostic_identify` | `subject_object` | identify | answerSpec: exact | `exact` | the sandwich | wrong visible option value | high | NO |
| `qg_p18_p18_subject_object_explain_reasoning` | `subject_object` | explain | answerSpec: exact | `exact` | The gull does the stealing; the sandwich receives the action. | wrong visible option value | high | NO |
| `qg_p18_p18_subject_object_precision_repair_or_rewrite` | `subject_object` | fix | answerSpec: normalisedText | `manualReviewOnly` | The noisy gull | grammar target changed | high | YES |
| `qg_p18_p18_subject_object_sat_table_classification` | `subject_object` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | high | NO |
| `qg_p18_p18_tense_aspect_application_transfer` | `tense_aspect` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | Past perfect uses had plus past participle for an earlier past action. | grammar target changed | medium | YES |
| `qg_p18_p18_tense_aspect_diagnostic_identify` | `tense_aspect` | choose | answerSpec: exact | `exact` | She had packed her bag before the trip. | wrong visible option value | low | NO |
| `qg_p18_p18_tense_aspect_explain_reasoning` | `tense_aspect` | explain | answerSpec: exact | `exact` | Past perfect uses had plus past participle for an earlier past action. | wrong visible option value | low | NO |
| `qg_p18_p18_tense_aspect_precision_repair_or_rewrite` | `tense_aspect` | rewrite | answerSpec: normalisedText | `manualReviewOnly` | She had packed her bag before the trip. | grammar target changed | medium | YES |
| `qg_p18_p18_tense_aspect_sat_table_classification` | `tense_aspect` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
| `qg_p18_p18_tense_aspect_standard_english_tense_standard_register` | `standard_english`, `tense_aspect` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | She had packed her bag before the trip.; We were late for practice. | grammar target changed | medium | YES |
| `qg_p18_p18_word_classes_application_transfer` | `word_classes` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | It is a adverb because it describes how maya folded the map. | grammar target changed | medium | YES |
| `qg_p18_p18_word_classes_diagnostic_identify` | `word_classes` | identify | answerSpec: exact | `exact` | adverb | wrong visible option value | low | NO |
| `qg_p18_p18_word_classes_explain_reasoning` | `word_classes` | explain | answerSpec: exact | `exact` | It describes how Maya folded the map. | wrong visible option value | low | NO |
| `qg_p18_p18_word_classes_noun_phrases_word_class_np_roles` | `noun_phrases`, `word_classes` | explain | answerSpec: manualReviewOnly | `manualReviewOnly` | adverb; head noun marble | grammar target changed | medium | YES |
| `qg_p18_p18_word_classes_precision_repair_or_rewrite` | `word_classes` | fix | answerSpec: normalisedText | `manualReviewOnly` | adverb | grammar target changed | medium | YES |
| `qg_p18_p18_word_classes_sat_table_classification` | `word_classes` | classify | answerSpec: multiField | `multiField` | per-field accepted value | wrong row value | low | NO |
---

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

- **Rows requiring `contentReleaseId` bump: 28.** Every row marked `YES` in the table — all constructed-response templates. The 20 legacy constructed-response migrations were batched in QG P2; the 8 P14 constructed rewrites are new score-bearing content and are covered by the P14 content-release bump.
- **Rows NOT requiring `contentReleaseId` bump: 82.** Every selected-response row marked `NO` — legacy selected-response rows preserve option-value equality, and the new P1/P3/P14 selected-response rows emit typed `answerSpec` data from day one. P1, P3, and P14 content themselves bump the Grammar content release because the pool changed, but the answer-spec marking contract does not add a separate marking-behaviour bump.
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
