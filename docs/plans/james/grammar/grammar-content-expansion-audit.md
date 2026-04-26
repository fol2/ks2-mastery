---
title: "Grammar content-expansion audit (Phase 5 backlog)"
type: audit
status: inventory-only
date: 2026-04-26
plan: docs/plans/2026-04-26-001-feat-grammar-phase4-learning-hardening-plan.md
unit: U12
contentReleaseId: grammar-legacy-reviewed-2026-04-24
contentReleaseBump: none
---

# Grammar content-expansion audit (Phase 5 backlog)

This document is the Phase 5 content-expansion backlog for the Grammar subject. It is **inventory only**: no new templates are introduced, no existing templates are changed, and the `GRAMMAR_CONTENT_RELEASE_ID` constant is **not** bumped. Every proposal below is a Phase 5 candidate that will require paired oracle-fixture refresh, per-template answer-spec migration (see `grammar-answer-spec-audit.md`), and a `contentReleaseId` bump when it lands.

The audit is produced by reading `worker/src/subjects/grammar/content.js` at release id `grammar-legacy-reviewed-2026-04-24` and cross-referencing `GRAMMAR_AGGREGATE_CONCEPTS` in `src/platform/game/mastery/grammar.js`. There are 18 aggregate concepts and 51 templates in the pool at the time of the audit.

---

## How to read the concept table

Each concept row records the eight audit fields required by the Phase 4 plan (`§U12` of `docs/plans/2026-04-26-001-feat-grammar-phase4-learning-hardening-plan.md`, line 942). The fields are:

- **Concept id** — matches a member of `GRAMMAR_AGGREGATE_CONCEPTS`.
- **Templates** — the count of templates whose `skillIds` array includes this concept id.
- **Types present** — the distinct `questionType` values across those templates, drawn from the eight-member family `{classify, identify, choose, fill, fix, rewrite, build, explain}`.
- **Types absent** — the complement: question-type families not currently represented for this concept.
- **Misconceptions covered** — the misconception ids (from `GRAMMAR_MISCONCEPTIONS`) that template evaluators can emit for this concept. Cross-concept misconceptions such as `punctuation_precision` (emitted by every constructed-response template that uses `markStringAnswer`) and `misread_question` (generic across the subject) are noted only when they provide the primary signal.
- **SR / CR balance** — selected-response (`isSelectedResponse: true`) versus constructed-response counts; the total equals the **Templates** field.
- **Thin-pool flag** — `true` when the concept has `<= 2` templates. Ground truth: exactly six concepts are thin-pool. This matches the Phase 4 plan's scope-lock list (`pronouns_cohesion`, `formality`, `active_passive`, `subject_object`, `modal_verbs`, `hyphen_ambiguity`).
- **Priority** — `high` for thin-pool concepts and for the `explain` question-type expansion; `medium` for single-question-type structural concerns outside the thin-pool; `low` otherwise.

---

## Concept table

| Concept id | Templates | Types present | Types absent | Misconceptions covered | SR / CR | Thin-pool | Priority |
|---|---|---|---|---|---|---|---|
| sentence_functions | 3 | classify, identify, choose | fill, fix, rewrite, build, explain | sentence_function_confusion | 3 / 0 | false | low |
| word_classes | 3 | identify, choose | classify, fill, fix, rewrite, build, explain | word_class_confusion | 3 / 0 | false | low |
| noun_phrases | 3 | choose, build | classify, identify, fill, fix, rewrite, explain | noun_phrase_confusion | 1 / 2 | false | low |
| adverbials | 5 | choose, fix, explain, build | classify, identify, fill, rewrite | fronted_adverbial_confusion | 2 / 3 | false | low |
| clauses | 3 | identify, rewrite | classify, choose, fill, fix, build, explain | subordinate_clause_confusion | 1 / 2 | false | low |
| relative_clauses | 3 | choose, build, identify | classify, fill, fix, rewrite, explain | relative_clause_confusion | 3 / 0 | false | low |
| tense_aspect | 3 | fill, rewrite | classify, identify, choose, fix, build, explain | tense_confusion | 2 / 1 | false | low |
| standard_english | 5 | choose, explain, fix | classify, identify, fill, rewrite, build | standard_english_confusion | 3 / 2 | false | low |
| pronouns_cohesion | 2 | choose | classify, identify, fill, fix, rewrite, build, explain | pronoun_cohesion_confusion | 2 / 0 | true | high |
| formality | 2 | choose | classify, identify, fill, fix, rewrite, build, explain | formality_confusion | 2 / 0 | true | high |
| active_passive | 2 | rewrite | classify, identify, choose, fill, fix, build, explain | active_passive_confusion | 0 / 2 | true | high |
| subject_object | 2 | identify | classify, choose, fill, fix, rewrite, build, explain | subject_object_confusion | 2 / 0 | true | high |
| modal_verbs | 2 | choose, fill | classify, identify, fix, rewrite, build, explain | modal_verb_confusion | 2 / 0 | true | high |
| parenthesis_commas | 3 | choose, fix | classify, identify, fill, rewrite, build, explain | parenthesis_confusion | 1 / 2 | false | low |
| speech_punctuation | 3 | identify, fix | classify, choose, fill, rewrite, build, explain | speech_punctuation_confusion | 1 / 2 | false | low |
| apostrophes_possession | 3 | choose, rewrite | classify, identify, fill, fix, build, explain | apostrophe_possession_confusion | 2 / 1 | false | low |
| boundary_punctuation | 4 | choose, fix, explain | classify, identify, fill, rewrite, build | boundary_punctuation_confusion | 2 / 2 | false | low |
| hyphen_ambiguity | 2 | choose, fix | classify, identify, fill, rewrite, build, explain | hyphen_ambiguity_confusion | 1 / 1 | true | high |

Row count: **18**. Thin-pool rows where the flag is `true`: **6** (`pronouns_cohesion`, `formality`, `active_passive`, `subject_object`, `modal_verbs`, `hyphen_ambiguity`). Every other concept is `false`.

---

## Especially brittle — single-question-type thin-pool concepts

Two thin-pool concepts are not only at the two-template floor: both of their templates share a single `questionType`. Phase 5 must lift these first because any template retirement or seed bug leaves the concept with no usable variety at all, and the adaptive selector (`worker/src/subjects/grammar/selection.js`) cannot honour the "mixed question type" retrieval-science floor (R6) with only one type available.

### `active_passive` — both templates are `rewrite` (HIGHEST priority)

| Template id | Question type | Response shape |
|---|---|---|
| `active_passive_rewrite` | rewrite | constructed (textarea) |
| `proc2_passive_to_active` | rewrite | constructed (textarea) |

No selected-response cover. No identification, classification, choice, fill, fix, build, or explain variety. A learner who is weak on active-passive voice sees only two rewrite prompts, with no lower-cost SR entry point and no higher-level explain prompt.

### `subject_object` — both templates are `identify` (HIGHEST priority)

| Template id | Question type | Response shape |
|---|---|---|
| `subject_object_choice` | identify | selected (single_choice) |
| `proc2_subject_object_identify` | identify | selected (single_choice) |

No constructed-response cover. No rewrite, build, fix, explain, or even `choose` variety. Every practice interaction is the same "pick the subject / pick the object from four options" pattern. The "Build / transform" and "Explain why" rungs of the learning ladder are absent.

---

## Expanded `explain` question type — second cross-cutting priority

Only two templates in the entire pool use `questionType: 'explain'`:

| Template id | Concept(s) |
|---|---|
| `explain_reason_choice` | adverbials, standard_english |
| `proc2_boundary_punctuation_explain` | boundary_punctuation |

Sixteen of the 18 concepts have no `explain` template. This is a cross-cutting gap: Phase 5 should add at least one `explain` template per thin-pool concept (and prioritise mid-pool concepts where an explain variant would raise the metacognitive ceiling, especially `word_classes`, `noun_phrases`, `clauses`, `relative_clauses`, `tense_aspect`, `apostrophes_possession`, `parenthesis_commas`, `speech_punctuation`, `hyphen_ambiguity`). Priority: **high**.

---

## New template ideas by thin-pool concept

Each thin-pool concept below has five proposed new templates. Proposals are written to lift the concept out of thin-pool status (exits at `templates > 2`) and to introduce at least two new question-type families per concept so that the "single question type" trap cannot recur. Each proposal states the target `questionType`, a one-line intent, the expected `skillIds` binding, and a realistic `answerSpec.kind` (see `grammar-answer-spec-audit.md`) so Phase 5 can migrate both audits in one pass.

### pronouns_cohesion (currently `choose`, SR 2 / CR 0)

1. **`pronoun_referent_identify`** — `identify` — "Which noun does the underlined pronoun refer to?" Options list candidate noun phrases from the passage. Single-choice. `answerSpec.kind: exact`.
2. **`pronoun_fix_ambiguity`** — `fix` — Given a sentence with an ambiguous pronoun, rewrite so the referent is unambiguous. `answerSpec.kind: acceptedSet` (2–3 accepted rewrites).
3. **`pronoun_cohesion_build`** — `build` — Build a two-sentence passage that uses a pronoun for one of two named nouns, preserving clarity. `answerSpec.kind: normalisedText`.
4. **`pronoun_cohesion_explain`** — `explain` — Pick the best reason why one of two versions is clearer (not just "sounds nicer"). Single-choice from three explanations. `answerSpec.kind: exact`.
5. **`pronoun_fill_subject_object`** — `fill` — Given a sentence with a missing pronoun and a context showing a prior noun, pick from `he/him/she/her/they/them` etc. to preserve cohesion. `answerSpec.kind: exact`.

### formality (currently `choose`, SR 2 / CR 0)

1. **`formality_classify`** — `classify` — Classify each of four sentences as `formal` or `informal` in a two-column table (mirrors `sentence_type_table`). `answerSpec.kind: multiField`.
2. **`formality_rewrite`** — `rewrite` — Rewrite an informal sentence in formal register for a school newsletter. `answerSpec.kind: acceptedSet`.
3. **`formality_identify_marker`** — `identify` — Pick out the word or phrase that makes a sentence informal (contraction, idiom, slang). Multi-select checkbox list. `answerSpec.kind: multiField`.
4. **`formality_fill_register`** — `fill` — Given a sentence with a blank, pick the word that matches the specified register (formal letter vs message to a friend). `answerSpec.kind: exact`.
5. **`formality_explain`** — `explain` — Pick the best explanation for why a sentence belongs in a formal register (precision / distance / audience). `answerSpec.kind: exact`.

### active_passive (currently `rewrite`, SR 0 / CR 2) — HIGHEST priority

1. **`active_passive_choice`** — `choose` — Pick which of four sentences is in the passive voice (introduces the critical SR entry point that the concept is currently missing). `answerSpec.kind: exact`.
2. **`active_passive_identify_agent`** — `identify` — Pick the agent (doer) in a passive-voice sentence that may or may not include a `by ...` phrase. `answerSpec.kind: exact`.
3. **`active_passive_fill_aux`** — `fill` — Given a passive-voice skeleton `The door ___ by the caretaker.`, choose the auxiliary (`was / is / were / had been`). `answerSpec.kind: exact`.
4. **`active_passive_build_from_prompt`** — `build` — Build a passive-voice sentence from three prompt words: subject (patient), past participle, agent. `answerSpec.kind: normalisedText`.
5. **`active_passive_explain`** — `explain` — Pick the best reason why a writer would choose the passive voice here (focus on the patient, agent unknown, register). `answerSpec.kind: exact`.

### subject_object (currently `identify`, SR 2 / CR 0) — HIGHEST priority

1. **`subject_object_choice`** — `choose` — Pick which of four sentences has a particular noun as its subject (distinct from the existing `identify` pattern which asks for the subject in one named sentence). `answerSpec.kind: exact`. (Rename to `subject_object_choose_between` — see collision note below.)
2. **`subject_object_fill`** — `fill` — Complete a sentence by filling the subject slot with a noun phrase that fits the context. `answerSpec.kind: normalisedText`.
3. **`subject_object_rewrite_topicalise`** — `rewrite` — Rewrite a sentence so that the original object becomes the subject (topicalisation; an active-to-passive-adjacent skill). `answerSpec.kind: acceptedSet`.
4. **`subject_object_classify_table`** — `classify` — Tick `subject`, `object`, or `neither` for each of four underlined noun phrases across four sentences. `answerSpec.kind: multiField`.
5. **`subject_object_explain`** — `explain` — Pick the best explanation for why a named noun phrase is the subject (agreement with verb, agency, position before the finite verb). `answerSpec.kind: exact`.

### modal_verbs (currently `choose, fill`, SR 2 / CR 0)

1. **`modal_verb_identify`** — `identify` — Pick out all modal verbs in a paragraph (multi-select token-checkbox, mirrors `identify_words_in_sentence`). `answerSpec.kind: multiField`.
2. **`modal_verb_classify_strength`** — `classify` — Classify four modals into `possibility / obligation / certainty / permission` buckets in a table. `answerSpec.kind: multiField`.
3. **`modal_verb_rewrite_strength`** — `rewrite` — Rewrite a sentence by replacing the modal with one of a different strength and adjust meaning accordingly. `answerSpec.kind: acceptedSet`.
4. **`modal_verb_build`** — `build` — Build a sentence using a given modal that must express a specified meaning (e.g. "advice", "distant possibility"). `answerSpec.kind: normalisedText`.
5. **`modal_verb_explain`** — `explain` — Pick the best explanation for why a particular modal is chosen in the context (not just "it sounds right"). `answerSpec.kind: exact`.

### hyphen_ambiguity (currently `choose, fix`, SR 1 / CR 1)

1. **`hyphen_ambiguity_identify`** — `identify` — Pick the word pair that should be hyphenated from a list of underlined candidates. Multi-select. `answerSpec.kind: multiField`.
2. **`hyphen_ambiguity_classify`** — `classify` — Classify four candidate hyphenations as `needed`, `optional`, or `incorrect` for clarity. `answerSpec.kind: multiField`.
3. **`hyphen_ambiguity_rewrite`** — `rewrite` — Rewrite a sentence whose meaning shifts with or without the hyphen, so the hyphenated version is clearer (pairs with the existing fix template). `answerSpec.kind: acceptedSet`.
4. **`hyphen_ambiguity_build`** — `build` — Build a short noun phrase using a given compound adjective, and explain briefly whether a hyphen is needed before the noun. `answerSpec.kind: normalisedText`.
5. **`hyphen_ambiguity_explain`** — `explain` — Pick the best explanation for why the hyphen changes the meaning (compound adjective before noun vs phrase after noun). `answerSpec.kind: exact`.

---

## Phase 5 release-id discipline

Every proposal above is a **Phase 5** candidate. Phase 4 unit U12 ships this audit without touching `content.js`, without touching `worker/src/subjects/grammar/answer-spec.js`, and without bumping `GRAMMAR_CONTENT_RELEASE_ID` (which stays at `grammar-legacy-reviewed-2026-04-24`). The `release-id impact: none` statement from the Phase 4 plan (§"Key Technical Decisions") is preserved.

When Phase 5 lands any of these proposals, the PR author must:

1. **Bump `GRAMMAR_CONTENT_RELEASE_ID`** in `worker/src/subjects/grammar/content.js` for every PR that adds a new template or removes an existing one. A PR that adds two templates is still a single bump; a PR that adds a template *and* removes a template is still a single bump. The bump marks any behaviour-visible change to the pool.
2. **Refresh the oracle fixtures** under `tests/fixtures/grammar-legacy-oracle/` so the new release id has a matching baseline. The existing baseline at `grammar-legacy-reviewed-2026-04-24` must continue to pass against the frozen oracle, so Phase 5 authors should generate a new baseline file rather than overwrite the legacy one (see `scripts/extract-grammar-legacy-oracle.mjs`).
3. **Pair with the answer-spec migration** from U11's audit doc (`grammar-answer-spec-audit.md`). Each new template must declare a typed `answerSpec` from day one; the adapter path (`markStringAnswer` → `markByAnswerSpec`) is deprecated for new content.
4. **Update this audit** if the new template resolves a thin-pool flag. A post-merge hook is not required — the Phase 5 follow-up PR refreshes this doc as part of its own CI.
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
- The Phase 4 plan's scope-lock claim that 51 templates cover 18 concepts matches the enumeration above: the 18 rows in the concept table sum to 53 template-concept pair-assignments. Two templates map to two concepts each (`question_mark_select` on `sentence_functions` + `speech_punctuation`; `explain_reason_choice` on `adverbials` + `standard_english`), so 51 distinct templates inflate to 53 pair-assignments.
- The Phase 3 aggregate counts referenced in the Phase 4 plan (31 SR + 20 CR = 51) describe **distinct templates**, not pair-assignments. Counting distinct templates from `GRAMMAR_TEMPLATES`: 31 have `isSelectedResponse: true` and 20 have `isSelectedResponse: false`, totalling 51. The SR column in the table above sums to 33 (not 31) because the two multi-concept templates are both SR and therefore counted in two rows.

---

## Summary counts

- Concepts audited: **18**
- Templates audited: **51**
- Thin-pool concepts (ground truth): **6**
- Single-question-type thin-pool concepts (HIGHEST priority): **2** (`active_passive`, `subject_object`)
- Concepts with an `explain` template today: **3 (represented by 2 templates)** — `adverbials` and `standard_english` both via `explain_reason_choice`; `boundary_punctuation` via `proc2_boundary_punctuation_explain`. The concept-table shows three rows with `explain` coverage, but only two distinct templates carry the type.
- New template ideas proposed: **30** (five per thin-pool concept × six thin-pool concepts)
- Phase 5 release-id bumps implied (one per new-template PR landed, assuming each ships atomically): up to **30**
- `contentReleaseId` bumps produced by this audit: **0**

---

## References

- Plan: `docs/plans/2026-04-26-001-feat-grammar-phase4-learning-hardening-plan.md` §U12 (~line 929).
- Invariants: `docs/plans/james/grammar/grammar-phase4-invariants.md`.
- Answer-spec audit (sibling Phase 5 backlog): `docs/plans/james/grammar/grammar-answer-spec-audit.md`.
- Content source: `worker/src/subjects/grammar/content.js` at `GRAMMAR_CONTENT_RELEASE_ID = 'grammar-legacy-reviewed-2026-04-24'`.
- Concept list: `src/platform/game/mastery/grammar.js` — `GRAMMAR_AGGREGATE_CONCEPTS`.
