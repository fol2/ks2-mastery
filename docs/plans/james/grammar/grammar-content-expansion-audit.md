---
title: "Grammar content-expansion audit (Phase 5 backlog)"
type: audit
status: p19-updated
date: 2026-05-04
plan: docs/plans/james/grammar/questions-generator/grammar-qg-p18-completion-report.md
unit: QG-P18
contentReleaseId: grammar-qg-p19-2026-05-04
contentReleaseBump: yes
---

# Grammar content-expansion audit (Phase 5 backlog)

This document started as the Phase 5 content-expansion backlog for the Grammar subject. It now records the QG lineage through P18: P1 generator expansion, P2 declarative constructed-response marking, P3 explanation breadth, P4 mixed-transfer coverage, P5/P6 depth and stability hardening, P8-P11 production-certification content and delivery work, P12/P13 evidence/certification locks, P14 learner-variety expansion, and the P15-P18 manual expansion promoted in `grammar-qg-p19-2026-05-04`. Historical fixtures remain frozen for compatibility checks rather than being overwritten.

The audit is produced by reading `worker/src/subjects/grammar/content.js` at the current Grammar content release id and cross-referencing `GRAMMAR_AGGREGATE_CONCEPTS` in `src/platform/game/mastery/grammar.js`. There are 18 aggregate concepts and 510 distinct templates in the audited pool: 317 selected-response, 193 constructed-response, 484 generated, and 26 fixed.

An executable generator audit backs this document:

```bash
node scripts/audit-grammar-question-generator.mjs
```

The script reads live Grammar metadata and seeded generated questions, then reports template counts, generated/fixed split, selected/constructed-response balance, thin-pool concepts, single-question-type concepts, missing generator metadata, and safe visible-prompt signatures. The doc gate in `tests/grammar-content-expansion-audit.test.js` compares this Markdown table with the executable thin-pool list so the prose cannot silently drift from the release gate.
---

## How to read the concept table

Each concept row records the eight audit fields required by the Phase 4 plan (`§U12` of `docs/plans/2026-04-26-001-feat-grammar-phase4-learning-hardening-plan.md`, line 942). The fields are:

- **Concept id** — matches a member of `GRAMMAR_AGGREGATE_CONCEPTS`.
- **Templates** — the count of templates whose `skillIds` array includes this concept id.
- **Types present** — the distinct `questionType` values across those templates, drawn from the eight-member family `{classify, identify, choose, fill, fix, rewrite, build, explain}`.
- **Types absent** — the complement: question-type families not currently represented for this concept.
- **Misconceptions covered** — the misconception ids (from `GRAMMAR_MISCONCEPTIONS`) that template evaluators can emit for this concept. Cross-concept misconceptions such as `punctuation_precision` (emitted by every constructed-response template that uses `markStringAnswer`) and `misread_question` (generic across the subject) are noted only when they provide the primary signal.
- **SR / CR balance** — selected-response (`isSelectedResponse: true`) versus constructed-response counts; the total equals the **Templates** field.
- **Thin-pool flag** — `true` when the concept has `<= 2` templates. P1 ground truth: no concept is now thin-pool; the six former thin-pool concepts remain high-priority focus concepts because their new coverage is fresh.
- **Priority** — `high` for the six P1 focus concepts and for the `explain` question-type expansion; `medium` for single-question-type structural concerns outside that set; `low` otherwise.

---

## Concept table

| Concept id | Templates | Types present | Types absent | Misconceptions covered | SR / CR | Thin-pool | Priority |
|---|---|---|---|---|---|---|---|
| sentence_functions | 27 | classify, identify, choose, fix, build, explain | fill, rewrite | sentence_function_confusion | 18 / 9 | false | low |
| word_classes | 29 | classify, identify, choose, fix, build, explain | fill, rewrite | word_class_confusion | 21 / 8 | false | low |
| noun_phrases | 32 | classify, identify, choose, fix, rewrite, build, explain | fill | noun_phrase_confusion | 19 / 13 | false | low |
| adverbials | 32 | classify, identify, choose, fix, rewrite, build, explain | fill | fronted_adverbial_confusion | 17 / 15 | false | low |
| clauses | 33 | classify, identify, choose, fix, rewrite, build, explain | fill | subordinate_clause_confusion | 19 / 14 | false | low |
| relative_clauses | 27 | classify, identify, choose, fill, fix, build, explain | rewrite | relative_clause_confusion | 18 / 9 | false | low |
| tense_aspect | 32 | classify, choose, fill, fix, rewrite, build, explain | identify | tense_confusion | 19 / 13 | false | low |
| standard_english | 32 | classify, choose, fix, rewrite, build, explain | identify, fill | standard_english_confusion | 18 / 14 | false | low |
| pronouns_cohesion | 27 | classify, identify, choose, fix, rewrite, build, explain | fill | pronoun_cohesion_confusion | 17 / 10 | false | high |
| formality | 28 | classify, choose, fix, rewrite, build, explain | identify, fill | formality_confusion | 18 / 10 | false | high |
| active_passive | 28 | classify, choose, fix, rewrite, build, explain | identify, fill | active_passive_confusion | 16 / 12 | false | high |
| subject_object | 32 | classify, identify, choose, fix, rewrite, build, explain | fill | subject_object_confusion | 23 / 9 | false | high |
| modal_verbs | 26 | classify, identify, choose, fill, fix, rewrite, build, explain |  | modal_verb_confusion | 18 / 8 | false | high |
| parenthesis_commas | 31 | classify, identify, choose, fix, rewrite, build, explain | fill | parenthesis_confusion | 17 / 14 | false | low |
| speech_punctuation | 33 | classify, identify, choose, fix, rewrite, build, explain | fill | speech_punctuation_confusion | 19 / 14 | false | low |
| apostrophes_possession | 28 | classify, choose, fix, rewrite, build, explain | identify, fill | apostrophe_possession_confusion | 18 / 10 | false | low |
| boundary_punctuation | 28 | classify, identify, choose, fix, build, explain | fill, rewrite | boundary_punctuation_confusion | 17 / 11 | false | low |
| hyphen_ambiguity | 27 | classify, identify, choose, fix, build, explain | fill, rewrite | hyphen_ambiguity_confusion | 17 / 10 | false | high |

Row count: **18**. Thin-pool rows where the flag is `true`: **0**. The six P1 focus concepts (`pronouns_cohesion`, `formality`, `active_passive`, `subject_object`, `modal_verbs`, `hyphen_ambiguity`) are no longer thin-pool but stay priority `high`.

---

## P1-resolved brittle concepts

Before P1, two concepts were both at the two-template floor and limited to a single `questionType`. P1 lifts both above the floor and adds a second question-type family, giving the selector a healthier variety surface.

### `active_passive` — now `choose` + `rewrite` + `explain`

| Template id | Question type | Response shape |
|---|---|---|
| `qg_active_passive_choice` | choose | selected (single_choice) |
| `active_passive_rewrite` | rewrite | constructed (textarea) |
| `proc2_passive_to_active` | rewrite | constructed (textarea) |
| `qg_p3_active_passive_explain` | explain | selected (single_choice) |
| `qg_p4_voice_roles_transfer` | classify | selected (table_choice) |

The generated selected-response entry point lets a learner practise the concept before moving into rewrite-heavy work. P4 also added cross-concept voice/role transfer, so the current table has four active question-type families.

### `subject_object` — now `classify` + `identify` + `explain`

| Template id | Question type | Response shape |
|---|---|---|
| `qg_subject_object_classify_table` | classify | selected (table_choice) |
| `subject_object_choice` | identify | selected (single_choice) |
| `proc2_subject_object_identify` | identify | selected (single_choice) |
| `qg_p3_subject_object_explain` | explain | selected (single_choice) |
| `qg_p14_subject_object_diagnostic_choice` | choose | selected (single_choice) |
| `qg_p14_subject_object_constructed_rewrite` | rewrite | constructed (textarea) |
| `qg_p14_subject_object_explain_why` | explain | selected (single_choice) |
| `qg_p14_subject_object_mixed_transfer` | classify | selected (table_choice) |
| `qg_p4_voice_roles_transfer` | classify | selected (table_choice) |

The classify-table variant still stays deterministic and selected-response, but it changes the learner task from one named sentence to per-row role classification. P14 adds misconception-choice, constructed rewrite, explain-why and mixed-transfer coverage for the same concept.

---

## Expanded `explain` question type — second cross-cutting priority

Four templates in the pool used `questionType: 'explain'` before P3:

| Template id | Concept(s) |
|---|---|
| `explain_reason_choice` | adverbials, standard_english |
| `proc2_boundary_punctuation_explain` | boundary_punctuation |
| `qg_modal_verb_explain` | modal_verbs |
| `qg_hyphen_ambiguity_explain` | hyphen_ambiguity |

QG P3 closes the breadth gap by adding 13 deterministic selected-response explanation templates:

- `qg_p3_sentence_functions_explain`
- `qg_p3_word_classes_explain`
- `qg_p3_noun_phrases_explain`
- `qg_p3_clauses_explain`
- `qg_p3_relative_clauses_explain`
- `qg_p3_tense_aspect_explain`
- `qg_p3_pronouns_cohesion_explain`
- `qg_p3_formality_explain`
- `qg_p3_active_passive_explain`
- `qg_p3_subject_object_explain`
- `qg_p3_parenthesis_commas_explain`
- `qg_p3_speech_punctuation_explain`
- `qg_p3_apostrophe_possession_explain`

Every Grammar concept now has at least one explanation template. P14 deepens eight priority concepts with dedicated `explain_why` templates, lifting the live explain-template count to 25. Future phases can still deepen explanation variety, but the cross-cutting P3 breadth gate remains complete. Priority: **high**.

---

## New template ideas by P1 focus concept

Each P1 focus concept below keeps five proposed follow-up templates. P1 has already shipped one focused generated template for each former thin-pool concept; the remaining proposals are backlog ideas for broader catalogue expansion. Each proposal states the target `questionType`, a one-line intent, the expected `skillIds` binding, and a realistic `answerSpec.kind` (see `grammar-answer-spec-audit.md`) so later phases can migrate both audits in one pass.

### pronouns_cohesion (currently `choose, identify`, SR 3 / CR 0)

1. **`pronoun_referent_identify`** — `identify` — "Which noun does the underlined pronoun refer to?" Options list candidate noun phrases from the passage. Single-choice. `answerSpec.kind: exact`.
2. **`pronoun_fix_ambiguity`** — `fix` — Given a sentence with an ambiguous pronoun, rewrite so the referent is unambiguous. `answerSpec.kind: acceptedSet` (2–3 accepted rewrites).
3. **`pronoun_cohesion_build`** — `build` — Build a two-sentence passage that uses a pronoun for one of two named nouns, preserving clarity. `answerSpec.kind: normalisedText`.
4. **`pronoun_cohesion_explain`** — `explain` — Pick the best reason why one of two versions is clearer (not just "sounds nicer"). Single-choice from three explanations. `answerSpec.kind: exact`.
5. **`pronoun_fill_subject_object`** — `fill` — Given a sentence with a missing pronoun and a context showing a prior noun, pick from `he/him/she/her/they/them` etc. to preserve cohesion. `answerSpec.kind: exact`.

### formality (currently `choose, classify`, SR 3 / CR 0)

1. **`formality_classify`** — `classify` — Classify each of four sentences as `formal` or `informal` in a two-column table (mirrors `sentence_type_table`). `answerSpec.kind: multiField`.
2. **`formality_rewrite`** — `rewrite` — Rewrite an informal sentence in formal register for a school newsletter. `answerSpec.kind: acceptedSet`.
3. **`formality_identify_marker`** — `identify` — Pick out the word or phrase that makes a sentence informal (contraction, idiom, slang). Multi-select checkbox list. `answerSpec.kind: multiField`.
4. **`formality_fill_register`** — `fill` — Given a sentence with a blank, pick the word that matches the specified register (formal letter vs message to a friend). `answerSpec.kind: exact`.
5. **`formality_explain`** — `explain` — Pick the best explanation for why a sentence belongs in a formal register (precision / distance / audience). `answerSpec.kind: exact`.

### active_passive (currently `choose, rewrite`, SR 1 / CR 2) — P1 focus

1. **`active_passive_choice`** — `choose` — Pick which of four sentences is in the passive voice (introduces the critical SR entry point that the concept is currently missing). `answerSpec.kind: exact`.
2. **`active_passive_identify_agent`** — `identify` — Pick the agent (doer) in a passive-voice sentence that may or may not include a `by ...` phrase. `answerSpec.kind: exact`.
3. **`active_passive_fill_aux`** — `fill` — Given a passive-voice skeleton `The door ___ by the caretaker.`, choose the auxiliary (`was / is / were / had been`). `answerSpec.kind: exact`.
4. **`active_passive_build_from_prompt`** — `build` — Build a passive-voice sentence from three prompt words: subject (patient), past participle, agent. `answerSpec.kind: normalisedText`.
5. **`active_passive_explain`** — `explain` — Pick the best reason why a writer would choose the passive voice here (focus on the patient, agent unknown, register). `answerSpec.kind: exact`.

### subject_object (currently `classify, identify`, SR 3 / CR 0) — P1 focus

1. **`subject_object_choice`** — `choose` — Pick which of four sentences has a particular noun as its subject (distinct from the existing `identify` pattern which asks for the subject in one named sentence). `answerSpec.kind: exact`. (Rename to `subject_object_choose_between` — see collision note below.)
2. **`subject_object_fill`** — `fill` — Complete a sentence by filling the subject slot with a noun phrase that fits the context. `answerSpec.kind: normalisedText`.
3. **`subject_object_rewrite_topicalise`** — `rewrite` — Rewrite a sentence so that the original object becomes the subject (topicalisation; an active-to-passive-adjacent skill). `answerSpec.kind: acceptedSet`.
4. **`subject_object_classify_table`** — `classify` — Tick `subject`, `object`, or `neither` for each of four underlined noun phrases across four sentences. `answerSpec.kind: multiField`.
5. **`subject_object_explain`** — `explain` — Pick the best explanation for why a named noun phrase is the subject (agreement with verb, agency, position before the finite verb). `answerSpec.kind: exact`.

### modal_verbs (currently `choose, explain, fill`, SR 3 / CR 0)

1. **`modal_verb_identify`** — `identify` — Pick out all modal verbs in a paragraph (multi-select token-checkbox, mirrors `identify_words_in_sentence`). `answerSpec.kind: multiField`.
2. **`modal_verb_classify_strength`** — `classify` — Classify four modals into `possibility / obligation / certainty / permission` buckets in a table. `answerSpec.kind: multiField`.
3. **`modal_verb_rewrite_strength`** — `rewrite` — Rewrite a sentence by replacing the modal with one of a different strength and adjust meaning accordingly. `answerSpec.kind: acceptedSet`.
4. **`modal_verb_build`** — `build` — Build a sentence using a given modal that must express a specified meaning (e.g. "advice", "distant possibility"). `answerSpec.kind: normalisedText`.
5. **`modal_verb_explain`** — `explain` — Pick the best explanation for why a particular modal is chosen in the context (not just "it sounds right"). `answerSpec.kind: exact`.

### hyphen_ambiguity (currently `choose, explain, fix`, SR 2 / CR 1)

1. **`hyphen_ambiguity_identify`** — `identify` — Pick the word pair that should be hyphenated from a list of underlined candidates. Multi-select. `answerSpec.kind: multiField`.
2. **`hyphen_ambiguity_classify`** — `classify` — Classify four candidate hyphenations as `needed`, `optional`, or `incorrect` for clarity. `answerSpec.kind: multiField`.
3. **`hyphen_ambiguity_rewrite`** — `rewrite` — Rewrite a sentence whose meaning shifts with or without the hyphen, so the hyphenated version is clearer (pairs with the existing fix template). `answerSpec.kind: acceptedSet`.
4. **`hyphen_ambiguity_build`** — `build` — Build a short noun phrase using a given compound adjective, and explain briefly whether a hyphen is needed before the noun. `answerSpec.kind: normalisedText`.
5. **`hyphen_ambiguity_explain`** — `explain` — Pick the best explanation for why the hyphen changes the meaning (compound adjective before noun vs phrase after noun). `answerSpec.kind: exact`.

---

## Release-id discipline

Every future proposal above is a content-release candidate. P1 touched `content.js`, added generated templates with typed `answerSpec`, and bumped `GRAMMAR_CONTENT_RELEASE_ID` to `grammar-qg-p1-2026-04-28`. P2 kept the same 57-template denominator, migrated every constructed-response template to explicit declarative marking, and bumped the active release id to `grammar-qg-p2-2026-04-28`. P3 expanded the pool to 70 templates, P4 added mixed transfer, P5/P6 hardened depth and wording, P8-P11 completed certification-facing content changes, P12/P13 froze certification evidence for P11, and P14 expands learner variety to 110 templates under `grammar-qg-p14-2026-05-01`. Historical baselines remain frozen rather than overwritten.

When a later phase lands any of the remaining proposals, the PR author must:

1. **Bump `GRAMMAR_CONTENT_RELEASE_ID`** in `worker/src/subjects/grammar/content.js` for every PR that adds a new template or removes an existing one. A PR that adds two templates is still a single bump; a PR that adds a template *and* removes a template is still a single bump. The bump marks any behaviour-visible change to the pool.
2. **Refresh the oracle fixtures** under `tests/fixtures/grammar-legacy-oracle/` so the new release id has a matching baseline. Existing baselines must continue to pass against frozen oracle data, so authors should generate a new baseline file rather than overwrite historical fixtures.
3. **Pair with the answer-spec migration** from U11's audit doc (`grammar-answer-spec-audit.md`). Each new template must declare a typed `answerSpec` from day one; the adapter path (`markStringAnswer` → `markByAnswerSpec`) is deprecated for new content.
4. **Update this audit** if a new template changes coverage, response balance, or question-type diversity. A post-merge hook is not required — the content PR refreshes this doc as part of its own CI.
5. **Run the Phase 4 gates** that are orthogonal to content: the composite Concordium invariant test, the learning-flow matrix, and the completeness gate must all pass on the new release id unchanged.

### Release-id bump triggers (explicit list)

- Adding a new template to `TEMPLATES` — **bump required**.
- Removing a template from `TEMPLATES` — **bump required**.
- Changing a template's `questionType`, `skillIds`, `isSelectedResponse`, `difficulty`, or `marks` — **bump required**.
- Changing an `accepted` / `correct` / `distractors` list so answers that were previously correct become incorrect (or vice versa) — **bump required**.
- Adding a new `answerSpec` declaration that changes marking behaviour — **bump required** (see U11 audit).
- Copy-only edits to `stemHtml` or `solutionLines` that do not change answer acceptance — **no bump** (documented by the PR reviewer).

---

## Audit completeness cross-check

- Every template id enumerated in the new-template-ideas section is **new** (does not already appear in `GRAMMAR_TEMPLATES`). The lone exception is `subject_object_choice`, which is a proposed future template id that happens to collide with an existing id; the implementer must rename the new proposal (suggested: `subject_object_choose_between`) before shipping. The audit keeps the current name to preserve reviewer recognition.
- The original Phase 4 scope-lock claim was 51 templates across 18 concepts. P14's current pool is 110 distinct templates: 82 selected-response and 28 constructed-response.
- The 18 rows in the concept table now sum to 122 template-concept pair-assignments. Ten templates map to multiple concepts: `question_mark_select`, `explain_reason_choice`, and eight P4 mixed-transfer templates.
- Current aggregate counts (82 SR + 28 CR = 110) describe **distinct templates**, not pair-assignments. The SR column in the table above sums to 94 because multi-concept selected-response templates are counted once per concept row.

---

## Summary counts

- Concepts audited: **18**
- Templates audited: **110**
- Generated templates: **84**
- Fixed templates: **26**
- Selected-response / constructed-response: **82 / 28**
- Template-concept pair-assignments: **122**
- Thin-pool concepts (ground truth): **0**
- Former single-question-type thin-pool concepts resolved in P1 and deepened in P3: **2** (`active_passive`, `subject_object`)
- Concepts with an `explain` template today: **18 / 18**. Five concepts already had explain coverage before P3; P3 adds coverage for the remaining 13 concepts; P14 deepens eight priority concepts with misconception-grounded `explain_why` variants.
- Mixed-transfer templates: **16**, covering **18 / 18** concepts.
- Low-depth generated families below the live diversity floor: **0**.
- Future template ideas proposed: **30** (five per P1 focus concept × six concepts)
- Phase 5 release-id bumps implied (one per new-template PR landed, assuming each ships atomically): up to **30**
- Current QG content release: **`grammar-qg-p14-2026-05-01`**

---

## References

- Plan: `docs/plans/2026-04-26-001-feat-grammar-phase4-learning-hardening-plan.md` §U12 (~line 929).
- Invariants: `docs/plans/james/grammar/grammar-phase4-invariants.md`.
- Answer-spec audit (sibling Phase 5 backlog): `docs/plans/james/grammar/grammar-answer-spec-audit.md`.
- Content source: `worker/src/subjects/grammar/content.js` at `GRAMMAR_CONTENT_RELEASE_ID = 'grammar-qg-p14-2026-05-01'`.
- Concept list: `src/platform/game/mastery/grammar.js` — `GRAMMAR_AGGREGATE_CONCEPTS`.
