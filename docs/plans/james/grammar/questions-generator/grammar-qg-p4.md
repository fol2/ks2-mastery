---
title: "feat: Grammar QG P4 deterministic depth and mixed-transfer expansion"
type: feat
status: proposed
date: 2026-04-28
subject: grammar
origin: docs/plans/james/grammar/questions-generator/grammar-qg-p3-final-completion-report-2026-04-28.md
previous_plan: docs/plans/james/grammar/questions-generator/grammar-qg-p3.md
previous_release_id: grammar-qg-p3-2026-04-28
target_release_id: grammar-qg-p4-YYYY-MM-DD
---

# feat: Grammar QG P4 deterministic depth and mixed-transfer expansion

## Summary

Grammar QG P4 should move the Grammar question generator from coverage completeness to depth and transfer.

QG P1 made generated Grammar content release-scoped and auditable. QG P2 made constructed-response marking explicit and honest. QG P3 completed deterministic explanation coverage across all 18 Grammar concepts. P4 should not be another baseline rescue release. It should improve the quality of the generator by increasing reviewed case depth, reducing legacy repeated generated variants, and adding constrained mixed-transfer tasks that ask learners to apply Grammar knowledge across related concepts.

The most important product line remains unchanged: Grammar questions, answers, marking, and feedback must be deterministic, reviewed, and release-managed. P4 must not introduce runtime AI question generation, runtime AI answer-key generation, or AI marking.

---

## Current verified baseline after QG P3

QG P3 leaves Grammar in this release-managed state:

| Measure | Current QG P3 state |
| --- | ---: |
| Content release id | `grammar-qg-p3-2026-04-28` |
| Concepts | 18 |
| Templates | 70 |
| Selected-response templates | 50 |
| Constructed-response templates | 20 |
| Generated templates | 44 |
| Fixed templates | 26 |
| Answer-spec templates | 39 |
| Constructed-response answer-spec templates | 20 / 20 |
| Legacy constructed-response adapter templates | 0 |
| Manual-review-only templates | 4 |
| Explanation templates | 17 |
| Concepts with explanation coverage | 18 / 18 |
| Thin-pool concepts | 0 |
| Single-question-type concepts | 0 |
| Invalid answer specs | 0 |
| Templates missing answer specs | 0 |
| Strict generated repeated variants | 0 in the default audit seed window |

Important QG P3 boundaries to preserve:

- Score-bearing Grammar marking remains deterministic.
- Runtime AI must not generate questions, answer keys, marks, or explanations.
- Free-text explanations remain out of scope unless explicitly `manualReviewOnly` and non-scored.
- `manualReviewOnly` attempts must remain non-scored and must not mutate mastery, retries, misconceptions, Star evidence, reward progress, Parent Hub mistake counts, confidence analytics, or SATS mini-test scoring.
- Worker-private fields such as `answerSpec`, accepted answers, solution lines, generated variant signatures, generator family ids, hidden correctness flags, golden answers, near-miss data, and misconception ids must not leak into learner-facing read models.
- Existing smart-practice, focus-mode, mini-pack, SATS mini-test, generated freshness, and question-type weakness behaviour must not be weakened.
- Production Grammar smoke is still an operational gate. P4 should make it easier to run and harder to forget.

---

## Problem frame

P3 fixed breadth of explanation coverage. It did not fully solve depth.

There are four remaining quality gaps.

First, selected-response explanations can still be guessed. They are useful because they force learners to choose a grammar reason, but one explanation template per concept is not enough to prove deep reasoning.

Second, the explanation case banks are finite. The audit proves release metadata, answer-spec correctness, concept coverage, and variant signatures. It does not prove unlimited novelty or deep conceptual variation.

Third, some legacy generated templates still repeat visible generated variants in the advisory audit bucket. P3 did not claim to fix that. P4 should reduce or remove those repeats, starting with the families that already appear in the P3 baseline.

Fourth, Grammar mastery evidence is still mostly concept-local. Learners also need constrained mixed-transfer practice: examples where they must recognise how two or three grammar ideas interact in the same sentence or passage.

P4 should therefore focus on generator quality, not just template count.

---

## P4 product goal

By the end of P4, Grammar should have:

1. Deeper reviewed case banks for explanation and legacy generated families.
2. No legacy repeated generated variants in the default audit seed window, unless a named waiver is recorded with a reason.
3. A small set of deterministic mixed-transfer templates that cover all 18 concepts across cross-concept tasks.
4. Stronger audit visibility for case-bank depth, mixed-transfer coverage, and generated-repeat health.
5. A production-smoke probe that directly exercises explanation and mixed-transfer read-model redaction.

The headline claim after P4 should not be "we have many more questions". The correct claim should be:

> Grammar now has deterministic breadth, honest marking, full reasoning coverage, and a first layer of mixed-transfer practice, with generator-depth checks that make repeated surface variants visible before release.

---

## Expected P4 denominator

If the recommended P4 scope lands in full, the expected denominator is:

| Measure | QG P3 baseline | Expected QG P4 target | Movement |
| --- | ---: | ---: | ---: |
| Concepts | 18 | 18 | no change |
| Templates | 70 | 78 | +8 |
| Selected-response templates | 50 | 58 | +8 |
| Constructed-response templates | 20 | 20 | no change |
| Generated templates | 44 | 52 | +8 |
| Fixed templates | 26 | 26 | no change |
| Answer-spec templates | 39 | 47 | +8 |
| Constructed-response answer-spec templates | 20 / 20 | 20 / 20 | preserved |
| Legacy constructed-response adapters | 0 | 0 | preserved |
| Manual-review-only templates | 4 | 4 | preserved |
| Explanation templates | 17 | 17 | no required change |
| Concepts with explanation coverage | 18 / 18 | 18 / 18 | preserved |
| Mixed-transfer templates | 0 | 8 | +8 |
| Concepts covered by mixed-transfer templates | 0 / 18 | 18 / 18 | +18 concepts |
| Thin-pool concepts | 0 | 0 | preserved |
| Single-question-type concepts | 0 | 0 | preserved |
| Invalid answer specs | 0 | 0 | preserved |
| Templates missing answer specs | 0 | 0 | preserved |
| Default-window legacy repeated generated variants | present | 0 or explicitly waived | improved |

If implementation deliberately lands fewer than eight mixed-transfer templates, the completion report must say why and must update the denominator explicitly. The default target is all eight.

If implementation fixes legacy repeated variants by converting additional legacy selected-response templates to explicit `answerSpec` templates, the answer-spec denominator may be higher than 47. That is acceptable only if the release report states the final count clearly and tests the conversion.

---

## Scope boundaries

P4 should do the following:

- Expand reviewed case depth for P3 explanation templates and selected older explanation templates.
- Reduce the legacy repeated generated variants currently shown by the advisory audit bucket.
- Add eight deterministic mixed-transfer templates covering all 18 concepts across cross-concept tasks.
- Use constrained response shapes: single choice, table/classification, or multi-field selected response.
- Give every new P4 template `requiresAnswerSpec: true` and a declared `answerSpecKind`.
- Prefer `answerSpecKind: 'exact'` or `answerSpecKind: 'multiField'` for the new mixed-transfer templates.
- Tag every new template with `qg-p4` and `mixed-transfer`.
- Give every new generated template a stable `generatorFamilyId`.
- Preserve generated variant signatures that are answer-safe and based on visible prompt/input surface only.
- Add a separate QG P4 fixture rather than overwriting P1, P2, or P3 baselines.
- Update the QG audit so P4-specific progress is executable, not only documented.
- Preserve QG P2 manual-review-only semantics unchanged.

P4 should not do the following:

- Do not add runtime AI generation, runtime AI marking, or AI-generated answer keys.
- Do not introduce free-text explanation scoring.
- Do not change Star, Mega, monster, reward, Parent Hub, or confidence semantics.
- Do not add a new learner UI or a new Grammar mode unless needed for existing input shapes to render correctly.
- Do not add a new broad template DSL or CMS authoring surface.
- Do not let mixed-transfer templates dominate early smart practice.
- Do not hide generator repetition by weakening the audit. If repetition is pedagogically acceptable, record a waiver.
- Do not claim post-deploy smoke evidence unless a logged-in production smoke was actually run after deployment.

---

## P4 mixed-transfer template set

The mixed-transfer set should be small, deterministic, and reviewable. It should cover all 18 Grammar concepts without creating a huge marking surface.

The recommended shape is eight generated selected-response or multi-field templates:

| Proposed template id | Concepts covered | Question type | Answer spec | Response shape | Purpose |
| --- | --- | --- | --- | --- | --- |
| `qg_p4_sentence_speech_transfer` | `sentence_functions`, `speech_punctuation` | `choose` | `exact` | single choice | Choose the sentence/speech punctuation option that matches both the sentence function and direct-speech rule. |
| `qg_p4_word_class_noun_phrase_transfer` | `word_classes`, `noun_phrases` | `classify` | `multiField` | table / classification | Classify the head noun, modifier role, and complete noun phrase in a short sentence. |
| `qg_p4_adverbial_clause_boundary_transfer` | `adverbials`, `clauses`, `boundary_punctuation` | `choose` | `exact` or `multiField` | single choice or two-field choice | Choose the best way to join or punctuate clauses when a fronted adverbial or subordinate clause is present. |
| `qg_p4_relative_parenthesis_transfer` | `relative_clauses`, `parenthesis_commas` | `choose` | `exact` | single choice | Choose why a relative clause is parenthetical or essential, and how punctuation supports that meaning. |
| `qg_p4_verb_form_register_transfer` | `tense_aspect`, `modal_verbs`, `standard_english` | `choose` | `exact` | single choice | Choose the verb phrase that keeps tense/aspect, modal meaning, and Standard English correct. |
| `qg_p4_cohesion_formality_transfer` | `pronouns_cohesion`, `formality` | `choose` | `exact` | single choice | Choose the clearest pronoun/noun reference in a formal or informal context. |
| `qg_p4_voice_roles_transfer` | `active_passive`, `subject_object` | `classify` | `multiField` | table / classification | Identify voice, subject, object, and focus of meaning in active/passive contrasts. |
| `qg_p4_possession_hyphen_clarity_transfer` | `apostrophes_possession`, `hyphen_ambiguity` | `choose` | `exact` | single choice | Choose the version where punctuation makes ownership and compound meaning clear. |

Naming may be adjusted during implementation, but the concept coverage and transfer intent should not drift without a release note.

---

## Mixed-transfer authoring contract

Each P4 mixed-transfer template must include:

- At least two Grammar concepts in `skillIds`.
- A visible prompt that requires the learner to use both concepts, not merely one.
- A reviewed case bank with at least eight distinct visible cases where practical.
- At least four visible options for single-choice templates, or at least two independent fields for multi-field templates.
- Exactly one correct complete answer path.
- Plausible distractors tied to real misconceptions.
- `requiresAnswerSpec: true`.
- `answerSpecKind: 'exact'` or `answerSpecKind: 'multiField'`.
- `generative: true`.
- `satsFriendly: true` only where the item genuinely matches a KS2 GPS-style transfer question.
- `difficulty: 3` unless the implementation has a strong reason to use another value.
- `tags: ['qg-p4', 'mixed-transfer']`, plus any existing narrower tags that are useful.
- A stable `generatorFamilyId`.
- A generated variant signature that changes when the visible prompt materially changes and does not change merely because options shuffle.
- Feedback that names both grammar ideas involved.

A mixed-transfer item is not acceptable if a learner can answer correctly by using only one of the listed concepts.

Good P4 prompt examples:

- "Which option correctly punctuates the direct speech and keeps the sentence a question?"
- "Classify the subject and object, then choose whether the sentence is active or passive."
- "Which version keeps the passage formal and makes the pronoun reference clear?"
- "Which sentence uses the present perfect and a suitable modal verb in Standard English?"

Weak P4 prompt examples:

- "Which sentence is correct?" without requiring the transfer reason.
- A sentence-functions question that merely happens to contain speech marks.
- A voice question where subject/object labels are not needed to answer.
- A formality question where the pronoun choice is irrelevant.

---

## Explanation case-bank depth contract

P4 should deepen the explanation layer created in P3.

Target explanation families:

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
- `qg_modal_verb_explain`
- `qg_hyphen_ambiguity_explain`
- `proc2_boundary_punctuation_explain`
- `explain_reason_choice`

Minimum target:

| Metric | Target |
| --- | ---: |
| Reviewed visible cases per explanation family | at least 8 where practical |
| Options per selected-response explanation item | 4 |
| Correct options per generated item | exactly 1 |
| Distinct misconception distractors per family | at least 3 where practical |
| Feedback lines | at least 1 grammar-specific reason |
| Hidden answer leakage | 0 |

`explain_reason_choice` covers more than one concept, so implementation may either deepen it in place or split it into concept-specific explanation templates. Splitting is allowed only if the release denominator is updated and the old behaviour remains covered by tests.

P4 should not require infinite novelty. It should require enough reviewed cases that repeated practice is not obviously the same question with shuffled options.

---

## Legacy repeated-variant repair contract

P3 leaves some legacy generated repeated variants in the advisory bucket. P4 should repair the visible-repetition problem rather than merely hiding it.

Known families to inspect first:

- `proc_semicolon_choice`
- `proc_colon_list_fix`
- `proc_dash_boundary_fix`
- `proc_hyphen_ambiguity_choice`
- `proc2_modal_choice`
- `proc2_formality_choice`
- `proc3_clause_join_rewrite`

Repair options, in preferred order:

1. Expand the underlying reviewed case bank so nearby seeds generate materially different visible prompts.
2. Improve seed mapping so the first few seeds do not collapse to the same case.
3. Add additional deterministic lexical slots only if they preserve grammar quality.
4. If a repeated visible case is pedagogically intentional, record an explicit waiver with the template id, reason, and safe repeat window.

Do not use superficial changes to defeat the signature audit. Changing a character name while preserving the same grammar decision is usually not enough. The visible grammar task should be materially different.

Default acceptance:

- `legacyRepeatedGeneratedVariants` is empty for the default audit seed window `[1, 2, 3]`, or every remaining entry has a named waiver.
- `repeatedGeneratedVariants` remains empty for strict templates.
- `generatedSignatureCollisions` remains empty.
- `missingGeneratorMetadata` remains empty.
- The audit summary prints both strict and legacy repeat status clearly.

Deep acceptance:

- Add a deep generator check over a wider seed window, such as seeds `1..30`.
- The deep check should report unique visible prompt counts per generated template family.
- A small finite case bank may repeat over `1..30`, but the repeat rate must be visible and reviewed.
- The completion report must list any templates that still have low unique-prompt depth.

---

## P4 audit fields

Extend `scripts/audit-grammar-question-generator.mjs` with P4-visible fields. Suggested fields:

```ts
{
  releaseId,
  templateCount,
  selectedResponseCount,
  constructedResponseCount,
  generatedTemplateCount,
  fixedTemplateCount,
  answerSpecTemplateCount,
  explainTemplateCount,
  conceptsWithExplainCoverage,
  mixedTransferTemplateCount,
  conceptsWithMixedTransferCoverage,
  conceptsMissingMixedTransferCoverage,
  p4MixedTransferComplete,
  generatedSignatureCollisions,
  repeatedGeneratedVariants,
  legacyRepeatedGeneratedVariants,
  legacyRepeatedVariantFamilies,
  generatedCaseDepthByTemplate,
  lowDepthGeneratedTemplates,
  sampledSeeds,
  deepSampledSeeds
}
```

The exact names can change, but the audit must answer these questions:

- How many mixed-transfer templates exist?
- Which concepts are covered by mixed-transfer templates?
- Which concepts are still missing transfer coverage?
- Which generated templates have low visible-prompt depth?
- Which legacy families still repeat in the default seed window?
- Which strict families repeat in the default seed window?
- Did any answer-spec template fail validation?
- Did any new template fail to emit a stable variant signature?

The audit should remain fast by default. If the deep seed window is expensive, provide an explicit flag such as `--deep` or `--seeds=1,2,...,30` and run it in the P4 targeted suite.

---

## Selection and scheduling boundary

P4 mixed-transfer templates are valuable, but they are harder than concept-local questions. The scheduler should not over-use them for learners who are still learning the underlying concepts.

P4 should add or preserve tests showing:

- Smart practice still works with multi-concept templates.
- Focus mode does not get hijacked by unrelated mixed-transfer templates.
- Mixed-transfer templates can be selected when the learner needs breadth, review, or secure/retention evidence.
- A short smart-practice session is not dominated by P4 mixed-transfer items unless the mode explicitly requests mixed review.
- Generated variant freshness still works for P4 templates.
- Question-type weakness behaviour remains intact.

If no scheduler change is needed, the completion report should say that explicitly and cite the tests that prove existing behaviour still holds.

---

## Read-model and redaction boundary

P3 discovered an important testing lesson: internal serialisation and learner-facing read models are not the same boundary.

P4 must test the learner-facing boundary directly for every new mixed-transfer template.

Required redaction assertions:

- Internal generated questions may keep feedback-only `solutionLines` where needed.
- Learner-facing read models must omit `solutionLines` before answering.
- Learner-facing read models must omit `answerSpec`.
- Learner-facing read models must omit accepted answers, golden answers, near-miss data, hidden misconception ids, generator family ids, and variant signatures.
- The shared Grammar forbidden-key oracle must pass for P4 read models.
- Multi-field items must not leak correct field values in visible metadata.

The tests should use the same surface that reaches the browser, not a convenient intermediate shape.

---

## Production-smoke requirement

P4 should improve the smoke story, but it must not overclaim deployment evidence.

Repository smoke should include at least one direct P4 probe:

- Start a Grammar session using one P4 mixed-transfer template.
- Assert the learner-visible payload contains the prompt and visible options/fields.
- Assert the learner-visible payload does not contain hidden answer data.
- Submit the correct response through the deterministic answer-spec path.
- Submit one wrong response and verify deterministic feedback exists.
- Verify no `manualReviewOnly` behaviour is involved unless the tested template is intentionally non-scored.

Post-deploy production smoke remains a separate operational step. The final report may say "repository smoke passed" only if repository smoke passed. It may say "post-deploy smoke passed" only if a logged-in post-deploy smoke was actually run against the deployed site.

---

## Implementation units

### U1. P4 audit scaffold and baseline fixture

**Goal:** Make P4 depth and transfer measurable before adding content.

Likely files:

- `scripts/audit-grammar-question-generator.mjs`
- `tests/grammar-question-generator-audit.test.js`
- `tests/grammar-functionality-completeness.test.js`
- `tests/helpers/grammar-legacy-oracle.js`
- `tests/fixtures/grammar-legacy-oracle/grammar-qg-p4-baseline.json`
- `tests/fixtures/grammar-functionality-completeness/grammar-qg-p4-baseline.json`

Requirements:

- Keep P1, P2, and P3 fixtures immutable.
- Add P4 fixture readers rather than repointing historical helpers.
- Add `mixedTransferTemplateCount` and concept coverage by mixed-transfer templates.
- Add default-window repeat-family reporting.
- Add optional deep seed output for generated case depth.

Acceptance:

- The P3 baseline still passes unchanged.
- Before content is added, the audit can show that mixed-transfer coverage is incomplete.
- After content is added, the P4 fixture records the new denominator.

### U2. Explanation case-bank expansion

**Goal:** Increase reviewed visible depth for explanation templates without changing the scoring contract.

Likely files:

- `worker/src/subjects/grammar/content.js`
- `tests/grammar-qg-p3-explanation.test.js` or a new `tests/grammar-qg-p4-depth.test.js`

Requirements:

- Increase visible explanation cases for the target families where practical.
- Preserve `answerSpecKind: 'exact'` for selected-response explanation templates.
- Preserve four visible options and exactly one correct option.
- Preserve hidden answer redaction.
- Add tests for unique visible prompt depth over a wider seed window.

Acceptance:

- Every target explanation family has at least eight visible cases, or a documented exception.
- Different visible explanation prompts produce different variant signatures.
- Option shuffling alone does not create a different variant signature.

### U3. Legacy repeated-variant repair

**Goal:** Remove or explicitly waive legacy repeated generated variants from the default audit window.

Likely files:

- `worker/src/subjects/grammar/content.js`
- `scripts/audit-grammar-question-generator.mjs`
- `tests/grammar-question-generator-audit.test.js`
- `tests/grammar-qg-p4-depth.test.js`

Requirements:

- Inspect the known repeated families listed above.
- Expand reviewed cases or improve seed mapping.
- Do not weaken the signature audit.
- Do not mark superficial lexical substitutions as pedagogically unique if the grammar task is the same.

Acceptance:

- Default audit has zero legacy repeated generated variants, or documented waivers.
- Strict repeated generated variants remain zero.
- Cross-template signature collisions remain zero.

### U4. Mixed-transfer template implementation

**Goal:** Add eight deterministic mixed-transfer templates covering all 18 concepts.

Likely files:

- `worker/src/subjects/grammar/content.js`
- new `tests/grammar-qg-p4-mixed-transfer.test.js`
- `tests/grammar-answer-spec.test.js`
- `tests/grammar-production-smoke.test.js`
- `tests/grammar-selection.test.js`
- `tests/grammar-engine.test.js`
- `tests/worker-grammar-subject-runtime.test.js`
- `tests/hub-read-models.test.js`

Requirements:

- Add the eight `qg_p4_*` templates or equivalent.
- Give each template at least two `skillIds`.
- Use `questionType` values already supported by the Grammar surface, such as `choose` or `classify`.
- Use existing input shapes where possible.
- Avoid free-text.
- Emit `answerSpec` via deterministic exact or multi-field markers.
- Provide grammar-specific feedback naming the transfer relationship.

Acceptance:

- Each new P4 template builds for seeds `[1, 2, 3, 4, 5, 6, 13]`.
- Every generated item has exactly one correct complete answer path.
- Every wrong option or wrong field path scores zero or partial credit only if the answer spec explicitly supports it.
- The learner-facing read model hides answer data for every P4 template.
- The audit reports `mixedTransferTemplateCount: 8` and `conceptsWithMixedTransferCoverage: 18 / 18`.

### U5. Selection and engine regression

**Goal:** Ensure mixed-transfer templates enrich practice without breaking session behaviour.

Likely files:

- `worker/src/subjects/grammar/selection.js`
- `worker/src/subjects/grammar/engine.js`
- `tests/grammar-selection.test.js`
- `tests/grammar-engine.test.js`
- `tests/worker-grammar-subject-runtime.test.js`

Requirements:

- Preserve template freshness and variant freshness.
- Ensure multi-concept templates do not break concept evidence events.
- Ensure P4 templates emit `contentReleaseId`, `generatorFamilyId`, and `variantSignature` internally where expected.
- Ensure those internal fields are not exposed to learner-facing read models.

Acceptance:

- Existing selection tests continue to pass.
- At least one new test proves a P4 mixed-transfer template can appear in practice and can be answered.
- At least one new test proves focus mode still respects the requested focus concept.

### U6. Production-smoke and redaction hardening

**Goal:** Make P4 visible-data safety explicit.

Likely files:

- `tests/grammar-production-smoke.test.js`
- `tests/helpers/grammar-read-model-redaction.js` or equivalent existing helper

Requirements:

- Add at least one P4 mixed-transfer smoke probe.
- Add at least one explanation-depth smoke probe if not already covered strongly enough.
- Reuse the shared forbidden-key oracle.
- Check both before-answer and after-answer read-model boundaries if the existing smoke helper supports that.

Acceptance:

- No hidden answer data appears before answering.
- Feedback after answering is useful but does not expose reusable answer-key internals beyond what is appropriate after marking.
- The final report separates repository smoke from post-deploy smoke.

### U7. Documentation and release report

**Goal:** Record the denominator honestly.

Likely files:

- `docs/plans/james/grammar/questions-generator/grammar-qg-p4.md`
- `docs/plans/james/grammar/questions-generator/grammar-qg-p4-completion-report.md`
- `docs/plans/james/grammar/questions-generator/grammar-qg-p4-final-completion-report-YYYY-MM-DD.md`
- `docs/plans/james/grammar/grammar-content-expansion-audit.md`

Requirements:

- State the P3 baseline and P4 final denominator.
- List every new P4 template.
- List every legacy repeated family repaired or waived.
- List any explanation families still below the target case depth.
- State whether production smoke was repository-only or post-deploy.
- State whether any manual-review-only prompt changed. The default should be no.

Acceptance:

- The report does not claim unlimited generated questions.
- The report distinguishes reviewed template families, generated surface variation, explanation coverage, and mixed-transfer coverage.
- Historical P1, P2, and P3 baselines remain readable.

---

## Testing checklist

Minimum recommended local verification for P4:

```text
node scripts/worktree-setup.mjs
node --check worker/src/subjects/grammar/content.js
node --check scripts/audit-grammar-question-generator.mjs
node --check tests/grammar-qg-p4-mixed-transfer.test.js
node --check tests/grammar-qg-p4-depth.test.js
node scripts/audit-grammar-question-generator.mjs --json
node scripts/audit-grammar-question-generator.mjs --seeds=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30 --json
node --test tests/grammar-qg-p4-mixed-transfer.test.js tests/grammar-qg-p4-depth.test.js tests/grammar-question-generator-audit.test.js tests/grammar-functionality-completeness.test.js tests/grammar-answer-spec.test.js tests/grammar-production-smoke.test.js tests/grammar-selection.test.js tests/grammar-engine.test.js tests/worker-grammar-subject-runtime.test.js tests/hub-read-models.test.js
node --test tests/grammar-content-expansion-audit.test.js
node --test tests/grammar-answer-spec-audit.test.js
node --test tests/react-grammar-surface.test.js
npm test
npm run check
git diff --check
```

If the full test suite is not run, the completion report must say exactly which targeted suites were run and why the remaining risk is acceptable.

---

## Review checklist

### Content review

- Each P4 mixed-transfer item genuinely needs both grammar concepts.
- No distractor is also correct.
- Distractors are plausible and useful.
- Grammar terminology is KS2-appropriate.
- No item relies on obscure vocabulary to make the grammar point.
- Sentence examples are natural and age-appropriate.
- Punctuation examples are unambiguous.
- Feedback explains the grammar reason, not just the answer.

### Marking review

- Every new P4 score-bearing item has an explicit answer spec.
- Every new answer spec passes validation.
- Multi-field scoring is deterministic and not too generous.
- Free-text is not auto-scored.
- Manual-review-only semantics are unchanged.

### Generator review

- Nearby seeds do not collapse to the same visible prompt in the default audit window.
- Deep seed output is reviewed for low-depth families.
- Variant signatures are stable and answer-safe.
- Option shuffling alone does not create fake uniqueness.
- Cross-template signature collisions remain zero.

### Read-model and safety review

- Learner-facing read models omit hidden answer data.
- Parent/support/hub read models do not leak pre-answer solution data.
- Production smoke covers at least one P4 mixed-transfer path.
- The final report does not claim post-deploy smoke unless it happened.

### Product review

- Mixed-transfer items are not over-weighted for early learners.
- P4 does not change reward semantics.
- P4 does not inflate mastery evidence by treating one mixed item as proof of multiple concepts too aggressively.
- P4 improves learning depth without turning Grammar into a grind.

---

## Residual risks to track after P4

| Risk | Why it matters | P4 mitigation |
| --- | --- | --- |
| Mixed-transfer templates may be harder than normal practice. | Learners may be frustrated if they see them too early. | Keep difficulty clear, preserve focus-mode behaviour, and monitor selection. |
| Multi-concept success could inflate mastery evidence. | One correct answer should not over-prove several concepts. | Preserve subject-owned mastery rules and avoid reward changes. |
| Case-bank expansion may still be finite. | Repetition is acceptable only when visible and reviewed. | Add deep seed reporting and low-depth template lists. |
| Selected-response transfer can still be guessed. | It is stronger than recognition but weaker than open explanation. | Use plausible distractors, multi-field responses, and feedback. |
| Legacy repeat repair may tempt superficial variation. | Name changes are not enough if the grammar decision is identical. | Review visible grammar task uniqueness, not just prompt text hash. |
| Production smoke may remain manual. | Release safety depends on discipline. | Add direct smoke probes and record whether post-deploy smoke ran. |

---

## Out-of-scope for P4

These are valid future ideas, but they should not be folded into P4 unless explicitly re-scoped:

- A CMS or authoring UI for Grammar templates.
- Runtime AI generation or marking.
- Open written explanation auto-marking.
- A new Grammar learner UI.
- Star, Mega, monster, reward, or Parent Hub semantics changes.
- Replacing all manual-review-only prompts.
- Full telemetry-based calibration of mixed-transfer mastery.
- Cross-subject Hero Mode orchestration.

---

## Likely QG P5 after P4

Assuming P4 lands cleanly, QG P5 should focus on release automation and operational governance:

- Make production smoke a proper release gate.
- Add a Grammar QG quality dashboard or generated report.
- Track denominator diffs automatically.
- Require a completion-report denominator to match executable audit output.
- Add CI checks for deep generator sampling if runtime cost is acceptable.
- Add drift checks between docs, fixtures, and code.

QG P6 can then focus on real learner telemetry and calibration:

- Which templates produce durable retention?
- Which mixed-transfer items are too easy or too hard?
- Which distractors reveal useful misconceptions?
- Which concepts need more repair loops?
- How should smart practice balance local concept repair, explanation, and mixed transfer?

---

## Final instruction to implementers

Treat P4 as a quality release, not a volume release.

The release should be considered successful if the repo can prove the following:

- P3 reasoning breadth is preserved.
- New P4 mixed-transfer coverage exists across all 18 concepts.
- New score-bearing items are deterministic and answer-spec governed.
- Legacy generated repetition is reduced or explicitly waived.
- Generator depth is visible in audit output.
- Learner-facing read models remain clean.
- Production-smoke coverage is stronger.
- No reward or mastery semantics are quietly changed.

Do not chase a large theoretical question count. Chase reviewed, auditable, deterministic learning variety.
