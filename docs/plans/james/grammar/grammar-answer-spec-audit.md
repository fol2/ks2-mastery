---
title: "Grammar answer-spec migration audit"
type: audit
status: implemented
date: 2026-04-28
plan: docs/plans/james/grammar/questions-generator/grammar-qg-p2.md
unit: QG-P2
---

# Grammar answer-spec migration audit

This document is the per-template classification and shipped-state audit for the Grammar answer-spec migration. It inventories every one of the 57 Grammar templates (37 selected-response + 20 constructed-response) with the target `answerSpec.kind`, a golden accepted answer, near-miss examples that must be rejected, and migration priority. QG P2 ships the legacy constructed-response migration under `grammar-qg-p2-2026-04-28`; the previous QG P1 baseline remains frozen for regression comparison.

The authoritative answer-spec kind list lives at `worker/src/subjects/grammar/answer-spec.js` (`ANSWER_SPEC_KINDS`). The six kinds are: `exact`, `normalisedText`, `acceptedSet`, `punctuationPattern`, `multiField`, `manualReviewOnly`. Every row below proposes one of those kinds; the gate test asserts the set membership.

QG P2 makes this audit executable: every constructed-response template now sets `requiresAnswerSpec: true` and `answerSpecKind`, and each generated question emits hidden `question.answerSpec` data that passes `validateAnswerSpec()`. Legacy `markStringAnswer` remains as a compatibility adapter, but the shipped P2 release has zero constructed-response templates left on that adapter path.

---

## 1. Scope and ground rules

- **57 templates total.** Confirmed by `GRAMMAR_TEMPLATES.length === 57` in `worker/src/subjects/grammar/content.js`. Split: 37 `isSelectedResponse: true`, 20 `isSelectedResponse: false`.
- **P2 template migration shipped.** The 20 constructed-response templates now emit hidden answer specs directly.
- **`contentReleaseId` bumped.** QG P2 uses `grammar-qg-p2-2026-04-28` and adds separate P2 fixtures. The QG P1 fixtures remain unchanged.
- **P1 focus concepts drive priority.** Six concepts were the confirmed thin-pool backlog before P1 expansion: `pronouns_cohesion`, `formality`, `active_passive`, `subject_object`, `modal_verbs`, `hyphen_ambiguity`. Every template carrying one of these concept ids in `skillIds` inherits **high** priority, so reliability work continues to land on the concepts that were previously fragile.
- **Selected-response default is `exact`, except classify-table specs.** 35 selected-response rows use `exact`. Two new P1 classify-table templates use `multiField` because they have per-row answers. These are additive migrations: the marking result is deterministic and no stored constructed-response evidence changes.
- **Constructed-response triage is per-concept.** Rewrite templates for `active_passive` and `tense_aspect` migrate to `normalisedText` (whitespace + case tolerance, single golden). Punctuation-surgery templates migrate to `punctuationPattern` (the marker keeps the punctuation characters literal and can opt into `optionalCommas`). Multi-way rewrites (`clauses` combine / join) use explicit `acceptedSet` alternatives. Open-ended builders and ambiguous rewrites are `manualReviewOnly` in P2, with neutral feedback and no auto-scored mastery or reward progression.

---

## 2. Template classification table

Every row records: template id, concept id(s), question type, current marking path, proposed `answerSpec.kind`, a golden accepted answer, at least one near-miss that must be rejected, priority, and whether the migration requires a `contentReleaseId` bump.

Current marking path column legend:
- `selected: index match` — `isSelectedResponse: true`, the generator's `evaluate` closure compares `resp.answer === item.correct`.
- `adapter: markStringAnswer` — `isSelectedResponse: false`, the generator's `evaluate` closure calls `markStringAnswer(respText, accepted, opts)`, which constructs a transient `acceptedSet` spec and delegates to `markByAnswerSpec`.

Priority column legend: `high` (thin-pool concept or structurally fragile marking), `medium` (constructed-response migration needs a spec-kind change), `low` (additive migration, no marking-behaviour change).

`Release-id bump` column legend: `YES` when Phase 5 migration changes marking behaviour (new near-miss rejections, new accepted variants, or kind change that alters accept/reject outcomes for stored attempts); `NO` when the migration is purely declarative and preserves accept/reject for every existing attempt.

| Template id | Concept id(s) | Question type | Current marking path | Proposed `answerSpec.kind` | Golden accepted | Near-miss to reject | Priority | Release-id bump |
|---|---|---|---|---|---|---|---|---|
| `sentence_type_table` | `sentence_functions` | classify | selected: index match | `exact` | per-row option value (e.g. `statement`) | `Statement` (wrong case); `statement.` (trailing dot) | low | NO |
| `question_mark_select` | `sentence_functions`, `speech_punctuation` | identify | selected: index match | `exact` | per-checkbox option value (e.g. `Can you help me carry the boxes`) | `can you help me carry the boxes` (wrong case); `Can you help me carry the boxes?` (trailing `?`) | low | NO |
| `word_class_underlined_choice` | `word_classes` | identify | selected: index match | `exact` | `adjective` | `Adjective` (wrong case); `adjectives` (plural) | low | NO |
| `identify_words_in_sentence` | `word_classes` | identify | selected: index match | `exact` | each checkbox value (e.g. `carefully`) | `Carefully` (wrong case); `carefully.` (trailing dot) | low | NO |
| `expanded_noun_phrase_choice` | `noun_phrases` | choose | selected: index match | `exact` | `the silver key under the mat` | `the silver key, under the mat` (stray comma); `The silver key under the mat` (wrong case) | low | NO |
| `build_noun_phrase` | `noun_phrases` | build | adapter: markStringAnswer | `manualReviewOnly` | `The tall captain with curly hair.` | `the tall captain with curly hair` (creative variant — should NOT be auto-rejected); `A curly-haired tall captain.` (valid alternative phrasing) | medium | YES |
| `fronted_adverbial_choose` | `adverbials` | choose | selected: index match | `exact` | `After dinner, Kal is going to her room.` | `After dinner Kal is going to her room.` (missing comma); `After dinner, Kal is going to her room` (missing full stop) | low | NO |
| `fix_fronted_adverbial` | `adverbials` | fix | adapter: markStringAnswer | `punctuationPattern` | `Before sunrise, the campers packed their bags.` | `Before sunrise the campers packed their bags.` (missing comma); `Before, sunrise the campers packed their bags.` (comma in wrong place) | medium | YES |
| `subordinate_clause_choice` | `clauses` | identify | selected: index match | `exact` | `Although the wind was strong` | `although the wind was strong` (wrong case); `Although the wind was strong.` (trailing dot) | low | NO |
| `combine_clauses_rewrite` | `clauses` | rewrite | adapter: markStringAnswer | `acceptedSet` | `Although Mia was tired, she finished the race.` (also accepts `Mia finished the race although she was tired.`) | `Mia finished the race although tired.` (ellipted subject); `Although Mia was tired she finished the race` (missing comma and full stop — partial credit under punctuation-precision, not accept) | medium | YES |
| `relative_clause_identify` | `relative_clauses` | choose | selected: index match | `exact` | `The boy who dropped his hat waved to us.` | `The boy, who dropped his hat, waved to us.` (non-defining punctuation); `The boy who dropped his hat waved to us` (missing full stop) | low | NO |
| `relative_clause_complete` | `relative_clauses` | build | selected: index match | `exact` | `that was locked outside` | `that locked outside` (missing auxiliary); `that was locked outside.` (trailing dot) | low | NO |
| `tense_form_choice` | `tense_aspect` | fill | selected: index match | `exact` | `had / started` | `had started` (no separator); `had  /  started` (extra whitespace) | low | NO |
| `tense_rewrite` | `tense_aspect` | rewrite | adapter: markStringAnswer | `normalisedText` | `The dog was chasing the cat.` | `The dog chased the cat.` (simple past instead of past progressive); `The dog is chasing the cat.` (present progressive) | medium | YES |
| `standard_english_pairs` | `standard_english` | choose | selected: index match | `exact` | `were; did` (per pair order) | `were, did` (wrong separator); `was; done` (wrong non-standard forms) | low | NO |
| `pronoun_cohesion_choice` | `pronouns_cohesion` | choose | selected: index match | `exact` | `Mila put her coat on the chair before she zipped her bag.` | `Mila put her coat on the chair before zipping her bag.` (non-finite variant); `Mila put her coat on the chair before Mila zipped her bag.` (repeated noun — the target is cohesive pronoun use) | high | NO |
| `formality_pairs` | `formality` | choose | selected: index match | `exact` | `established; requested; compete` (per-triple order) | `established, requested, compete` (wrong separator); `made; asked; compete` (informal variants) | high | NO |
| `active_passive_rewrite` | `active_passive` | rewrite | adapter: markStringAnswer | `normalisedText` | `The council maintains the local park.` | `The local park is maintained by the council.` (original sentence — not a rewrite); `The local park was maintained by the council.` (tense drift) | high | YES |
| `subject_object_choice` | `subject_object` | identify | selected: index match | `exact` | `the tired goalkeeper` | `tired goalkeeper` (missing determiner); `the tired goalkeeper.` (trailing dot) | high | NO |
| `modal_verb_choice` | `modal_verbs` | choose | selected: index match | `exact` | `The team might win.` | `The team may win.` (close-meaning modal — but `might` is the targeted form); `The team might wins.` (agreement slip) | high | NO |
| `parenthesis_replace_choice` | `parenthesis_commas` | choose | selected: index match | `exact` | `dashes` | `dash` (singular); `Dashes` (wrong case) | low | NO |
| `parenthesis_fix_sentence` | `parenthesis_commas` | fix | adapter: markStringAnswer | `punctuationPattern` | `Our class visited a castle (the oldest in the county) to help with our history project.` | `Our class visited a castle the oldest in the county to help with our history project.` (no brackets); `Our class visited a castle, the oldest in the county, to help with our history project.` (wrong punctuation family — commas instead of brackets) | medium | YES |
| `speech_punctuation_fix` | `speech_punctuation` | fix | adapter: markStringAnswer | `punctuationPattern` | `“Where are you going?” asked Mum.` | `"Where are you going?" asked Mum.` (straight quotes instead of curly — same pattern, likely accept; retain as candidate for `params.optionalQuoteStyle` Phase 5 knob); `Where are you going? asked Mum.` (missing quotation marks entirely) | medium | YES |
| `apostrophe_possession_choice` | `apostrophes_possession` | choose | selected: index match | `exact` | `girls'` | `girl's` (singular possessive); `girls` (no apostrophe) | low | NO |
| `explain_reason_choice` | `adverbials`, `standard_english` | explain | selected: index match | `exact` | `Because the opening words are a fronted adverbial.` | `Because the opening words are fronted adverbials.` (plural noun drift); `Because of the fronted adverbial.` (shortened variant) | medium | NO |
| `standard_fix_sentence` | `standard_english` | fix | adapter: markStringAnswer | `manualReviewOnly` | `We were walking to school.` | `We was walking to school.` (original non-standard); `We are walking to school.` (tense drift — valid alternative rewrite that preserves Standard English; flag for manual review) | medium | YES |
| `proc_fronted_adverbial_fix` | `adverbials` | fix | adapter: markStringAnswer | `punctuationPattern` | `Without warning, Zac lifted the picnic basket.` | `Without warning Zac lifted the picnic basket.` (missing comma); `Without, warning Zac lifted the picnic basket.` (comma misplaced) | medium | YES |
| `proc_semicolon_choice` | `boundary_punctuation` | choose | selected: index match | `exact` | `;` | `:` (colon, wrong boundary mark); `,` (comma splice) | low | NO |
| `proc_colon_list_fix` | `boundary_punctuation` | fix | adapter: markStringAnswer | `punctuationPattern` | `We still needed two items for camp: a torch, a sleeping bag.` | `We still needed two items for camp; a torch, a sleeping bag.` (semi-colon instead of colon); `We still needed two items for camp, a torch, a sleeping bag.` (comma — no list introducer) | medium | YES |
| `proc_dash_boundary_fix` | `boundary_punctuation` | fix | adapter: markStringAnswer | `punctuationPattern` | `There was only one answer – turn back at once.` | `There was only one answer - turn back at once.` (hyphen-minus instead of en-dash — candidate for `params.acceptHyphenMinus` Phase 5 knob); `There was only one answer, turn back at once.` (comma splice) | medium | YES |
| `proc_hyphen_ambiguity_choice` | `hyphen_ambiguity` | choose | selected: index match | `exact` | `We saw a man-eating shark near the rocks.` | `We saw a man eating shark near the rocks.` (missing hyphen — changes meaning); `We saw a man-eating-shark near the rocks.` (over-hyphenation) | high | NO |
| `proc_speech_punctuation_fix` | `speech_punctuation` | fix | adapter: markStringAnswer | `punctuationPattern` | `"When does the match begin?" shouted Ben.` | `"When does the match begin" shouted Ben.` (missing question mark); `"When does the match begin?" Shouted Ben.` (wrong reporting-verb case) | medium | YES |
| `proc_apostrophe_possession_choice` | `apostrophes_possession` | choose | selected: index match | `exact` | `the teacher's coats` | `the teachers coats` (no apostrophe); `the teachers' coats` (plural possessive — different meaning) | low | NO |
| `proc2_standard_english_choice` | `standard_english` | choose | selected: index match | `exact` | `Zac doesn't know how to fold the map.` | `Zac don't know how to fold the map.` (non-standard form); `Zac doesn't knows how to fold the map.` (agreement slip) | low | NO |
| `proc2_standard_english_fix` | `standard_english` | fix | adapter: markStringAnswer | `normalisedText` | `Zac doesn't know how to fold the map.` | `Zac don't know how to fold the map.` (original non-standard); `Zac does not know how to fold the map.` (full form — accepted as Phase 5 variant under `acceptedSet` migration) | medium | YES |
| `proc2_tense_aspect_choice` | `tense_aspect` | fill | selected: index match | `exact` | `have finished` | `has finished` (wrong agreement); `had finished` (wrong tense — past perfect) | low | NO |
| `proc2_modal_choice` | `modal_verbs` | fill | selected: index match | `exact` | `should` | `Should` (wrong case); `shall` (close-meaning modal but wrong targeted form) | high | NO |
| `proc2_formality_choice` | `formality` | choose | selected: index match | `exact` | `The club was established last year.` | `The club was set up last year.` (informal variant); `The club got established last year.` (colloquial passive) | high | NO |
| `proc2_pronoun_cohesion_choice` | `pronouns_cohesion` | choose | selected: index match | `exact` | `Amira gave Elsie the note because Elsie needed it for the next lesson.` | `Amira gave Elsie the note because she needed it for the next lesson.` (ambiguous pronoun — the target is disambiguated reference); `Amira gave Elsie the note because Elsie needed it.` (truncated — loses the cohesive tail) | high | NO |
| `proc2_subject_object_identify` | `subject_object` | identify | selected: index match | `exact` | `Zac` | `Zac.` (trailing dot); `zac` (wrong case) | high | NO |
| `proc2_passive_to_active` | `active_passive` | rewrite | adapter: markStringAnswer | `normalisedText` | `Amira cleaned the trophy after the match.` | `The trophy was cleaned by Amira after the match.` (original passive); `Amira cleans the trophy after the match.` (tense drift) | high | YES |
| `proc2_relative_clause_choice` | `relative_clauses` | identify | selected: index match | `exact` | `The bag which stood by the window was easy to spot.` | `The bag, which stood by the window, was easy to spot.` (non-defining punctuation); `The bag that stood by the window was easy to spot.` (relative pronoun variant — target is `which`) | low | NO |
| `proc2_fronted_adverbial_build` | `adverbials` | build | adapter: markStringAnswer | `manualReviewOnly` | `Without warning, Zac lifted the picnic basket.` | `Zac lifted the picnic basket without warning.` (grammatically correct but does NOT use a fronted adverbial — the target is the fronted structure); `Without warning Zac lifted the picnic basket.` (missing comma — partial credit candidate, not accept) | medium | YES |
| `proc2_boundary_punctuation_explain` | `boundary_punctuation` | explain | selected: index match | `exact` | `A semi-colon can join two closely related main clauses.` | `A semi-colon joins two sentences.` (close but imprecise); `A colon can join two closely related main clauses.` (wrong punctuation mark) | medium | NO |
| `proc3_sentence_function_choice` | `sentence_functions` | choose | selected: index match | `exact` | `Bring the blue folder to the hall.` | `Bring the blue folder to the hall` (missing full stop); `Bring the blue folder to the hall!` (exclamation instead of command terminator) | low | NO |
| `proc3_word_class_contrast_choice` | `word_classes` | choose | selected: index match | `exact` | `preposition` | `Preposition` (wrong case); `prepositions` (plural) | low | NO |
| `proc3_noun_phrase_build` | `noun_phrases` | build | adapter: markStringAnswer | `manualReviewOnly` | `the heavy red rucksack` | `red heavy rucksack` (wrong adjective order — English convention rejects this); `the rucksack heavy red` (wrong phrase order) | medium | YES |
| `proc3_clause_join_rewrite` | `clauses` | rewrite | adapter: markStringAnswer | `acceptedSet` | `When the gate opened, the crowd cheered.` (also accepts `The crowd cheered when the gate opened.`) | `The gate opened and the crowd cheered.` (coordination instead of subordination — target is `when`); `When the gate opened the crowd cheered` (missing comma and full stop — partial credit, not accept) | medium | YES |
| `proc3_parenthesis_commas_fix` | `parenthesis_commas` | fix | adapter: markStringAnswer | `punctuationPattern` | `Our new puppy, to my surprise, slept through the storm.` | `Our new puppy to my surprise slept through the storm.` (no commas); `Our new puppy (to my surprise) slept through the storm.` (wrong punctuation family — target is commas) | medium | YES |
| `proc3_hyphen_fix_meaning` | `hyphen_ambiguity` | fix | adapter: markStringAnswer | `punctuationPattern` | `The class made a last-minute poster for the hall.` | `The class made a last minute poster for the hall.` (no hyphen — ambiguous); `The class made a last-minute-poster for the hall.` (over-hyphenation) | high | YES |
| `qg_active_passive_choice` | `active_passive` | choose | answerSpec: exact | `exact` | `The heavy gate was opened by Maya after lunch.` | `Maya opened the heavy gate after lunch.` (active voice); `Maya was opening the heavy gate after lunch.` (progressive active) | high | NO |
| `qg_subject_object_classify_table` | `subject_object` | classify | answerSpec: multiField | `multiField` | per-row option value (`subject` / `object`) | swapped role labels; `neither` when the phrase is a subject or object | high | NO |
| `qg_pronoun_referent_identify` | `pronouns_cohesion` | identify | answerSpec: exact | `exact` | `the map` | `the torch` (nearby noun but wrong referent); `Lena` (person, not the pronoun target) | high | NO |
| `qg_formality_classify_table` | `formality` | classify | answerSpec: multiField | `multiField` | per-row option value (`formal` / `informal`) | swapped register labels | high | NO |
| `qg_modal_verb_explain` | `modal_verbs` | explain | answerSpec: exact | `exact` | `It shows a rule or strong obligation.` | `It shows a weak possibility.` (wrong modal meaning); `It shows the action happened yesterday.` (tense confusion) | high | NO |
| `qg_hyphen_ambiguity_explain` | `hyphen_ambiguity` | explain | answerSpec: exact | `exact` | `The hyphen shows that the shark eats people.` | `The hyphen shows that a man is eating a shark.` (opposite meaning); `The hyphen shows plural possession.` (wrong punctuation function) | high | NO |
| `proc3_apostrophe_rewrite` | `apostrophes_possession` | rewrite | adapter: markStringAnswer | `normalisedText` | `the farmers' coats` | `the farmer's coats` (singular possessive — different meaning); `the farmers coats` (no apostrophe) | medium | YES |

### 2.1 Row count reconciliation

The table above has exactly **57 rows**, one per template. The doc-gate test (§6) parses this table and asserts `rows.length === GRAMMAR_TEMPLATES.length` and that every proposed kind is in `ANSWER_SPEC_KINDS`.

### 2.2 Proposed-spec distribution

- `exact`: **35** rows (selected-response templates with one answer value).
- `normalisedText`: **5** rows (`tense_rewrite`, `active_passive_rewrite`, `proc2_standard_english_fix`, `proc2_passive_to_active`, `proc3_apostrophe_rewrite`).
- `acceptedSet`: **2** rows (`combine_clauses_rewrite`, `proc3_clause_join_rewrite`).
- `punctuationPattern`: **9** rows (every punctuation-surgery fix template: `fix_fronted_adverbial`, `parenthesis_fix_sentence`, `speech_punctuation_fix`, `proc_fronted_adverbial_fix`, `proc_colon_list_fix`, `proc_dash_boundary_fix`, `proc_speech_punctuation_fix`, `proc3_parenthesis_commas_fix`, `proc3_hyphen_fix_meaning`).
- `multiField`: **2** rows (`qg_subject_object_classify_table`, `qg_formality_classify_table`).
- `manualReviewOnly`: **4** rows in the table (`build_noun_phrase`, `standard_fix_sentence`, `proc2_fronted_adverbial_build`, `proc3_noun_phrase_build`). §3 additionally flags **2** explain templates as Phase 5 re-evaluation candidates for migration to `manualReviewOnly` once they become free-text, lifting the candidate list to **6**.

Totals: 35 + 5 + 2 + 9 + 2 + 4 = 57.

### 2.3 Constructed-response triage summary

| Concept family | Template id(s) | Proposed kind | Rationale |
|---|---|---|---|
| `active_passive` rewrite | `active_passive_rewrite`, `proc2_passive_to_active` | `normalisedText` | Single fixture golden per seed; whitespace and case tolerance is correct marking; no multi-way enumeration needed. |
| `tense_aspect` rewrite | `tense_rewrite` | `normalisedText` | Fixture golden is a single targeted form; other tenses are wrong-target, not near-miss. |
| `apostrophes_possession` rewrite | `proc3_apostrophe_rewrite` | `normalisedText` | Single golden phrase; whitespace/case tolerance is safe. |
| `standard_english` fix (word-level) | `proc2_standard_english_fix` | `normalisedText` | Single fixture golden; full-form expansion (`does not` vs `doesn't`) is the one multi-way variant — deferred to Phase 5 `acceptedSet` upgrade if needed. |
| `standard_english` fix (sentence-level) | `standard_fix_sentence` | `manualReviewOnly` | Multiple valid Standard English rewrites of the same non-standard input; teacher judgement needed to distinguish register-correct from content-preserving paraphrase. |
| `clauses` combine / join | `combine_clauses_rewrite`, `proc3_clause_join_rewrite` | `acceptedSet` | Fixture already lists ≥ 2 valid orderings per seed; keeps partial-credit path for punctuation-only near-misses. |
| `adverbials` fix (comma surgery) | `fix_fronted_adverbial`, `proc_fronted_adverbial_fix` | `punctuationPattern` | Punctuation-sensitive; accepts byte-identical pattern only; `optionalCommas` knob unused. |
| `parenthesis_commas` surgery | `parenthesis_fix_sentence`, `proc3_parenthesis_commas_fix` | `punctuationPattern` | Punctuation-sensitive; the bracket variant uses literal `(` `)`, the comma variant uses literal `,`. |
| `speech_punctuation` surgery | `speech_punctuation_fix`, `proc_speech_punctuation_fix` | `punctuationPattern` | Punctuation-sensitive; curly vs straight quote style flagged for a Phase 5 `params.acceptQuoteStyle` knob. |
| `boundary_punctuation` surgery | `proc_colon_list_fix`, `proc_dash_boundary_fix` | `punctuationPattern` | Punctuation-sensitive; dash variant flagged for a Phase 5 `params.acceptHyphenMinus` knob. |
| `hyphen_ambiguity` surgery | `proc3_hyphen_fix_meaning` | `punctuationPattern` | Punctuation-sensitive; hyphen presence changes meaning, so `optionalHyphen` must stay **false**. |
| Open-ended builders | `build_noun_phrase`, `proc2_fronted_adverbial_build`, `proc3_noun_phrase_build` | `manualReviewOnly` | Free-form construction; multiple linguistically valid answers the fixture cannot enumerate; `acceptedSet` would produce false negatives. |

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

- **Rows requiring `contentReleaseId` bump: 20.** Every row marked `YES` in the table — all 20 legacy constructed-response templates. QG P2 batches these as one content release and pairs them with separate QG P2 fixtures.
- **Rows NOT requiring `contentReleaseId` bump: 37.** Every selected-response row marked `NO` — legacy selected-response rows preserve option-value equality, and the new P1 rows emit typed `answerSpec` data from day one. The P1 content itself bumps the Grammar content release because the pool changed, but the answer-spec marking contract does not add a separate marking-behaviour bump.
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
  7. Selected-response batch (`exact`/`multiField`) — 37 templates in one PR, with the two P1 classify tables already carrying `multiField`.
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
