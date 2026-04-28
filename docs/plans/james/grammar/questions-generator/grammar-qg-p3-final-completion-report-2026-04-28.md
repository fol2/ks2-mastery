---
title: "Grammar QG P3 final completion report"
type: final-completion-report
status: merged
date: 2026-04-28
subject: grammar
plan: docs/plans/james/grammar/questions-generator/grammar-qg-p3.md
implementation_report: docs/plans/james/grammar/questions-generator/grammar-qg-p3-completion-report.md
previous_final_report: docs/plans/james/grammar/questions-generator/grammar-qg-p2-final-completion-report-2026-04-28.md
contentReleaseId: grammar-qg-p3-2026-04-28
implemented_pr: https://github.com/fol2/ks2-mastery/pull/509
implementation_merge_commit: ec3f0ae1a073685f8942c69416083e50a105196c
implementation_branch: codex/grammar-qg-p3-explanations
---

# Grammar QG P3 Final Completion Report

Date: 28 April 2026

Status: Completed, independently reviewed, re-reviewed after feedback, and merged to remote `main`

Source plan: `docs/plans/james/grammar/questions-generator/grammar-qg-p3.md`

Implementation report: `docs/plans/james/grammar/questions-generator/grammar-qg-p3-completion-report.md`

Implemented PR:

- [PR #509](https://github.com/fol2/ks2-mastery/pull/509) - `feat(grammar): add QG P3 explanation coverage`

Implementation merge commit:

- `ec3f0ae1a073685f8942c69416083e50a105196c`

Implementation commits:

- `b88d000a1dde16c1304d7006a257efa00ccf5cf4` - `feat(grammar): add QG P3 explanation coverage`
- `b5bcab1213135022b5d12c341904c320481fce67` - `test(grammar): lock P3 read-model redaction boundary`

## Executive Summary

Grammar QG P3 is complete. It landed the explanation-depth release promised after QG P1 and QG P2: every Grammar concept now has deterministic `explain` coverage, and the Grammar question bank can ask learners not only to recognise, fix, rewrite, or classify grammar, but also to choose the best grammar reason for an answer.

This is a content-depth release, not a UI release and not another marking migration. The most important product decision was to add teacher-authored selected-response explanation questions, all scored through the existing deterministic `exact` answer-spec path. That gives learners reasoning practice without pretending that open free-text explanations can be safely auto-marked.

The shipped content release is:

```text
Content release id:                      grammar-qg-p3-2026-04-28
Concepts:                                18
Templates:                               70
Selected-response templates:             50
Constructed-response templates:          20
Generated templates:                     44
Fixed templates:                         26
Answer-spec templates:                   39
Constructed-response answer-spec count:  20 / 20
Legacy constructed-response adapters:     0
Manual-review-only templates:             4
Explanation templates:                   17
Concepts with explanation coverage:      18 / 18
Thin-pool concepts:                       0
Single-question-type concepts:            0
Invalid answer specs:                     0
Templates missing answer specs:           0
P3 explanation complete:                  true
```

The implementation merged with one material review finding discovered and resolved before merge. The finding was not an active production leak, but it correctly identified that the first P3 redaction test was asserting the internal serialised question shape rather than the learner-facing read model boundary. The follow-up commit added a stronger regression test that proves internal `solutionLines` exist for feedback while learner read models strip them through the shared Grammar forbidden-key oracle.

The deeper outcome is that Grammar now has a three-phase governance foundation:

- QG P1 made generated Grammar content release-scoped and auditable.
- QG P2 made constructed-response marking explicit, deterministic where possible, and honest where manual review is required.
- QG P3 made reasoning coverage complete across the concept set without expanding the scoring authority beyond deterministic markers.

That combination matters because it turns Grammar from a working question pool into a release-managed subject system with evidence for content breadth, marking honesty, redaction safety, selector behaviour, and CI-governed delivery.

## Final Outcome

### What Shipped

PR #509 shipped one cohesive Grammar content-depth release:

| Area | Outcome |
| --- | --- |
| Release identity | Bumped Grammar to `grammar-qg-p3-2026-04-28`. |
| Explanation breadth | Added deterministic explanation coverage for the 13 concepts that lacked it after QG P2. |
| Final denominator | Moved Grammar from 57 to 70 templates while keeping the constructed-response count fixed at 20. |
| Selected-response depth | Moved selected-response templates from 37 to 50. |
| Generated content | Moved generated templates from 31 to 44, with stable `generatorFamilyId` metadata. |
| Answer-spec coverage | Moved answer-spec templates from 26 to 39. |
| Scoring path | Kept all P3 score-bearing items on the existing `exact` answer-spec path. |
| Manual-review contract | Preserved all QG P2 manual-review-only semantics unchanged. |
| Read-model safety | Preserved hidden answer-spec and solution redaction, including a new P3-specific read-model redaction test. |
| Audit visibility | Extended the QG audit with explanation coverage by concept and a `p3ExplanationComplete` gate. |
| Fixtures | Added P3 fixtures alongside historical P1 and P2 fixtures; older baselines were not overwritten. |
| Selection behaviour | Preserved smart-practice, focus-mode, mini-pack, SATS mini-test, generated freshness, and question-type weakness behaviour. |
| Production smoke contract | Preserved the visible-data-only production smoke pattern. |
| Documentation | Completed the P3 plan and added the implementation completion report; this document records the post-merge final account. |

### What Did Not Change

P3 did not introduce runtime AI question generation, runtime AI marking, or AI-generated answer keys.

P3 did not add open free-text explanation scoring. That was deliberately deferred because it would require a separate product and scoring review.

P3 did not change Stars, Mega, monsters, reward progress, Parent Hub semantics, confidence analytics, or SATS mini-test scoring semantics.

P3 did not change the learner UI. The new questions use the existing single-choice Grammar surface.

P3 did not automate post-deploy production smoke. Repository smoke and CI checks passed, but the report does not claim that a logged-in post-deploy smoke was run against `https://ks2.eugnel.uk`.

## Baseline vs Final State

### Starting Point After QG P2

QG P2 completed the marking-governance release. It left Grammar with a stronger scoring contract, but it intentionally did not expand reasoning coverage.

The starting point was:

```text
Content release id:                      grammar-qg-p2-2026-04-28
Concepts:                                18
Templates:                               57
Selected-response templates:             37
Constructed-response templates:          20
Generated templates:                     31
Fixed templates:                         26
Answer-spec templates:                   26
Manual-review-only templates:             4
Concepts with explanation coverage:       5 / 18
```

The risk was not broken scoring. The risk was skewed evidence. A learner could build a secure Grammar profile while getting comparatively little direct practice explaining why a grammar choice works.

The five concepts with explanation coverage before P3 were:

- `adverbials`
- `standard_english`
- `boundary_punctuation`
- `modal_verbs`
- `hyphen_ambiguity`

The remaining 13 concepts had recognition, correction, rewrite, table, or classification coverage, but no deterministic reasoning prompt.

### Final State After QG P3

P3 closes that coverage gap:

| Measure | QG P2 | QG P3 | Movement |
| --- | ---: | ---: | ---: |
| Content release id | `grammar-qg-p2-2026-04-28` | `grammar-qg-p3-2026-04-28` | release bump |
| Concepts | 18 | 18 | no change |
| Templates | 57 | 70 | +13 |
| Selected-response templates | 37 | 50 | +13 |
| Constructed-response templates | 20 | 20 | no change |
| Generated templates | 31 | 44 | +13 |
| Fixed templates | 26 | 26 | no change |
| Answer-spec templates | 26 | 39 | +13 |
| Constructed-response answer-spec templates | 20 / 20 | 20 / 20 | preserved |
| Legacy constructed-response adapters | 0 | 0 | preserved |
| Manual-review-only templates | 4 | 4 | preserved |
| Explanation templates | 5 | 17 | +12 net templates, +13 missing concepts |
| Concepts with explanation coverage | 5 / 18 | 18 / 18 | complete |
| Thin-pool concepts | 0 | 0 | preserved |
| Single-question-type concepts | 0 | 0 | preserved |
| Invalid answer specs | 0 | 0 | preserved |
| Templates missing answer specs | 0 | 0 | preserved |

The explanation-template movement is +13 new templates, but the final total is 17 rather than 18 because one older explanation template covers two concepts:

- `explain_reason_choice` covers `adverbials` and `standard_english`

That is acceptable because P3's success metric is concept coverage, not a one-template-per-concept global denominator.

## P3 Template Inventory

The release added one selected-response explanation template for each concept that lacked explanation coverage after QG P2.

| Concept | P3 template | Reasoning target |
| --- | --- | --- |
| `sentence_functions` | `qg_p3_sentence_functions_explain` | Why punctuation and sentence purpose match a command, question, statement, or exclamation. |
| `word_classes` | `qg_p3_word_classes_explain` | Why an underlined word is acting as a noun, verb, adjective, adverb, determiner, or pronoun in context. |
| `noun_phrases` | `qg_p3_noun_phrases_explain` | Why a phrase expands a noun by adding precise detail rather than merely adding extra words. |
| `clauses` | `qg_p3_clauses_explain` | Why a clause is main or subordinate, and why it can or cannot stand alone. |
| `relative_clauses` | `qg_p3_relative_clauses_explain` | Why a relative clause gives extra information about a noun and is introduced by an appropriate relative pronoun. |
| `tense_aspect` | `qg_p3_tense_aspect_explain` | Why a tense or aspect choice shows time, duration, completion, or sequence. |
| `pronouns_cohesion` | `qg_p3_pronouns_cohesion_explain` | Why a pronoun choice links back clearly to its referent and avoids ambiguity. |
| `formality` | `qg_p3_formality_explain` | Why wording is more formal or informal for the audience and purpose. |
| `active_passive` | `qg_p3_active_passive_explain` | Why active or passive voice changes focus between the doer and the action or receiver. |
| `subject_object` | `qg_p3_subject_object_explain` | Why a noun phrase is doing the verb or receiving the action. |
| `parenthesis_commas` | `qg_p3_parenthesis_commas_explain` | Why commas mark removable parenthesis rather than a list or fronted adverbial. |
| `speech_punctuation` | `qg_p3_speech_punctuation_explain` | Why punctuation marks the exact spoken words and separates speech from reporting clauses. |
| `apostrophes_possession` | `qg_p3_apostrophe_possession_explain` | Why apostrophe position shows singular or plural possession rather than contraction. |

Every P3 template has:

- `questionType: "explain"`
- `isSelectedResponse: true`
- `generative: true`
- `satsFriendly: true`
- `requiresAnswerSpec: true`
- `answerSpecKind: "exact"`
- a stable `generatorFamilyId`
- hidden Worker-private `answerSpec` data
- visible single-choice options
- deterministic marking through `markByAnswerSpec`
- generated variant signatures derived from the visible prompt/input surface

## Concept Coverage After P3

The audit now reports explanation coverage for all 18 concepts.

| Concept | Total templates | Generated | Fixed | Selected response | Constructed response | Question types | Explanation templates |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `active_passive` | 4 | 3 | 1 | 2 | 2 | choose, explain, rewrite | `qg_p3_active_passive_explain` |
| `adverbials` | 5 | 2 | 3 | 2 | 3 | build, choose, explain, fix | `explain_reason_choice` |
| `apostrophes_possession` | 4 | 3 | 1 | 3 | 1 | choose, explain, rewrite | `qg_p3_apostrophe_possession_explain` |
| `boundary_punctuation` | 4 | 4 | 0 | 2 | 2 | choose, explain, fix | `proc2_boundary_punctuation_explain` |
| `clauses` | 4 | 2 | 2 | 2 | 2 | explain, identify, rewrite | `qg_p3_clauses_explain` |
| `formality` | 4 | 3 | 1 | 4 | 0 | choose, classify, explain | `qg_p3_formality_explain` |
| `hyphen_ambiguity` | 3 | 3 | 0 | 2 | 1 | choose, explain, fix | `qg_hyphen_ambiguity_explain` |
| `modal_verbs` | 3 | 2 | 1 | 3 | 0 | choose, explain, fill | `qg_modal_verb_explain` |
| `noun_phrases` | 4 | 2 | 2 | 2 | 2 | build, choose, explain | `qg_p3_noun_phrases_explain` |
| `parenthesis_commas` | 4 | 2 | 2 | 2 | 2 | choose, explain, fix | `qg_p3_parenthesis_commas_explain` |
| `pronouns_cohesion` | 4 | 3 | 1 | 4 | 0 | choose, explain, identify | `qg_p3_pronouns_cohesion_explain` |
| `relative_clauses` | 4 | 2 | 2 | 4 | 0 | build, choose, explain, identify | `qg_p3_relative_clauses_explain` |
| `sentence_functions` | 4 | 2 | 2 | 4 | 0 | choose, classify, explain, identify | `qg_p3_sentence_functions_explain` |
| `speech_punctuation` | 4 | 2 | 2 | 2 | 2 | explain, fix, identify | `qg_p3_speech_punctuation_explain` |
| `standard_english` | 5 | 2 | 3 | 3 | 2 | choose, explain, fix | `explain_reason_choice` |
| `subject_object` | 4 | 3 | 1 | 4 | 0 | classify, explain, identify | `qg_p3_subject_object_explain` |
| `tense_aspect` | 4 | 2 | 2 | 3 | 1 | explain, fill, rewrite | `qg_p3_tense_aspect_explain` |
| `word_classes` | 4 | 2 | 2 | 4 | 0 | choose, explain, identify | `qg_p3_word_classes_explain` |

This table is useful because it shows P3 did not merely inflate the template count. It filled a specific reasoning gap while preserving wider coverage signals:

- no concept is thin-pool
- no concept is single-question-type
- constructed-response coverage remains stable
- selected-response reasoning coverage is now uniform
- all new explanation work is generated, not fixed-only

## Answer-Spec Governance

P3 adds 13 `exact` answer-spec templates, moving the distribution to:

| Answer-spec kind | Count | Role |
| --- | ---: | --- |
| `acceptedSet` | 2 | Finite rewrite alternatives. |
| `exact` | 17 | Selected-response choices and exact deterministic answers. |
| `manualReviewOnly` | 4 | Saved but non-scored creative responses. |
| `multiField` | 2 | Table/classification style responses. |
| `normalisedText` | 5 | Deterministic text responses with normalisation. |
| `punctuationPattern` | 9 | Punctuation rewrite validation. |

The important P3 decision is that all new explanation items are selected-response exact-answer items. This avoids three failure modes:

1. A free-text explanation marker that accepts vague answers too easily.
2. A local per-template equality checker that bypasses the QG P2 answer-spec audit.
3. A hidden answer-key path that is harder to redact from read models.

P3 therefore deepens the learner task while keeping the scoring authority unchanged.

## Read-Model And Redaction Boundary

P3 creates a subtle but important boundary:

- The Worker-internal serialised question needs `solutionLines` so feedback can explain the correct grammar reason.
- The learner-facing read model must not expose those `solutionLines`, answer specs, golden answers, near-miss data, generated variant signatures, or generator family ids before the learner answers.

The first implementation already used the runtime's existing safe read-model path, so there was no active production leak. However, the first new P3 redaction test was weaker than the real boundary because it asserted the raw `serialiseGrammarQuestion()` output rather than the `buildGrammarReadModel()` output that reaches the browser.

The independent redaction reviewer flagged that as a material test-boundary issue. The follow-up commit added a P3-specific regression test that proves both sides:

- Internal `serialiseGrammarQuestion()` output keeps non-empty `solutionLines`.
- Learner-facing `buildGrammarReadModel()` output omits `solutionLines`.
- The full read model passes `assertNoForbiddenGrammarReadModelKeys`.

This is a useful pattern for future content releases. Redaction tests should assert the exact boundary that matters, not a convenient intermediate shape.

## Audit And Fixture Changes

The QG audit now reports explanation coverage as first-class release evidence:

```text
explainTemplateCount: 17
conceptsWithExplainCoverage: 18 / 18
conceptsMissingExplainCoverage: []
p3ExplanationComplete: true
```

The implementation added P3 fixtures instead of overwriting earlier baselines:

- `tests/fixtures/grammar-legacy-oracle/grammar-qg-p3-baseline.json`
- `tests/fixtures/grammar-functionality-completeness/grammar-qg-p3-baseline.json`

The historical baselines remain intact:

- QG P1 still proves the earlier generated-template release.
- QG P2 still proves the constructed-response answer-spec migration.
- QG P3 now proves explanation-depth coverage.

That separation matters. If a later release changes the denominator, the repo can still explain when and why each movement happened.

## Verification Evidence

### Local Verification During Implementation

The following local gates were run before PR review and merge:

```text
node scripts/worktree-setup.mjs
node --check worker/src/subjects/grammar/content.js
node --check scripts/audit-grammar-question-generator.mjs
node --check tests/grammar-qg-p3-explanation.test.js
node scripts/audit-grammar-question-generator.mjs --json
node --test tests/grammar-qg-p3-explanation.test.js tests/grammar-question-generator-audit.test.js tests/grammar-functionality-completeness.test.js tests/grammar-answer-spec.test.js tests/grammar-production-smoke.test.js tests/grammar-selection.test.js tests/grammar-engine.test.js tests/worker-grammar-subject-runtime.test.js tests/hub-read-models.test.js
node --test tests/grammar-content-expansion-audit.test.js
node --test tests/grammar-answer-spec-audit.test.js
node --test tests/react-grammar-surface.test.js
npm test
npm run check
git diff --check
```

Full local test result before the first PR push:

```text
npm test
5862 passing
6 skipped
0 failed
```

After the review follow-up commit, the targeted regression suite was run:

```text
node --check tests/grammar-qg-p3-explanation.test.js
node --test tests/grammar-qg-p3-explanation.test.js tests/grammar-production-smoke.test.js tests/grammar-engine.test.js tests/worker-grammar-subject-runtime.test.js
git diff --check
```

Targeted result:

```text
88 passing
0 failed
```

### PR CI

PR #509 merged after the following checks completed:

| Check | Result | Duration |
| --- | --- | ---: |
| GitGuardian Security Checks | pass | 1s |
| Client Bundle Audit (PR) / `npm run audit:client` | pass | 34s |
| Punctuation Content Audit (PR) / `npm run audit:punctuation-content` | pass | 38s |
| Node Tests (PR) / `npm test + npm run check` | pass | 2m55s |
| Playwright (PR) / `Chromium + mobile-390 golden paths` | skipped | configured skip |

The PR was mergeable and merged by squash into remote `main`.

### Independent Review Evidence

The implementation followed an independent review cycle:

| Review lane | Result | Evidence |
| --- | --- | --- |
| Correctness and contract review | No blockers or material findings. | Checked release id, answer-spec metadata, generated behaviour, selector/read-model counts, fixtures, and audit tests. |
| Product and content review | No blockers or material findings. | Checked concept fit, plausible distractors, answer ambiguity, SATS-friendly wording, and existing single-choice UX. |
| Redaction and security review | One material test-boundary finding, no active leak. | Identified that the initial P3 test did not assert the learner-facing read-model boundary. |
| Redaction re-review | No blockers or material findings. | Confirmed the follow-up test locks the internal-vs-learner redaction boundary and ran a 13-template redaction scan. |

The review process improved the branch. The final merged PR is stronger because it records the exact redaction boundary future changes must preserve.

## Requirement Traceability

| Requirement | Status | Evidence |
| --- | --- | --- |
| R1. Preserve the QG P2 governance baseline unless intentionally changing denominator. | Met. | P3 intentionally changes template, selected-response, generated, answer-spec, and explanation denominators only. Constructed-response, manual-review-only, adapter, thin-pool, and single-question-type invariants are preserved. |
| R2. Add one deterministic selected-response `explain` template for each of the 13 missing concepts. | Met. | 13 `qg_p3_*_explain` templates added. |
| R3. Make the expected P3 denominator explicit. | Met. | Audit, fixtures, tests, completion report, and this final report state the 70-template denominator. |
| R4. Give every new P3 template exact answer-spec metadata and answer-safe signatures. | Met. | New metadata and tests assert `requiresAnswerSpec`, `answerSpecKind: "exact"`, `generatorFamilyId`, and variant-signature behaviour. |
| R5. Keep score-bearing Grammar marking deterministic and non-AI. | Met. | All new P3 templates use `exact` answer specs and `markByAnswerSpec`; no runtime AI generation or marking was added. |
| R6. Preserve manual-review-only semantics. | Met. | Manual-review-only count remains 4 and QG P2 engine tests continue to pass. |
| R7. Keep learner-facing read models redacted. | Met after review follow-up. | P3 read-model redaction test now proves `solutionLines` and hidden answer metadata do not leak to learner read models. |
| R8. Extend the audit for explanation coverage by concept. | Met. | Audit reports `explainCoverageByConcept`, missing concepts, and `p3ExplanationComplete`. |
| R9. Add P3 fixtures without overwriting P1/P2. | Met. | New P3 fixture files and helper reader were added; P1/P2 tests remain historical. |
| R10. Keep helper narrow and reviewable. | Met. | Helper standardises selected-response explanation shape while the content cases remain readable in `content.js`. |
| R11. Add quality coverage for reasoning items. | Met. | Tests assert exact scoring, visible options, unique option values, feedback, and variant behaviour; content review found no material issues. |
| R12. Preserve selector and practice behaviour. | Met. | Selection, engine, worker runtime, and React surface tests passed. |
| R13. Preserve production smoke as visible-data contract. | Met. | `tests/grammar-production-smoke.test.js` and smoke helper usage remained in the verification suite. |
| R14. Record counts, skipped/deferred items, smoke status, variant status, and residual risks. | Met. | Implementation report and this final report record all counts and caveats. |
| R15. Avoid client bundle growth from Worker-only content. | Met. | CI client bundle audit passed; no client UI imports were added. |

## Product Insights

### 1. Reasoning depth does not have to mean free text

It is tempting to equate "explanation" with open writing. For this product, that would have been the wrong default. KS2 Grammar needs truthful mastery evidence. A free-text explanation marker would either be too strict and frustrating, or too loose and dishonest.

P3's selected-response explanation design is a pragmatic middle path. The learner still has to reason about grammar, but the platform can mark the answer deterministically.

### 2. The honest denominator is the reviewed template family, not the generated surface count

Generated content can create many surface variants. P3 deliberately reports reviewed template families, concept/question-type coverage, and generated signature behaviour separately. That keeps the release denominator honest.

The final claim is not "we can generate many explanation-looking questions". The claim is "all 18 Grammar concepts have at least one reviewed deterministic explanation template, and the audit can prove it".

### 3. Redaction tests must assert the browser boundary

The review finding is valuable because it captures a general rule: internal serialisation is not the same as learner-facing redaction.

Future content releases should test the actual read model returned to the child surface, parent surface, summary, support, mini-test, and AI-enrichment paths. It is not enough to prove that `answerSpec` is absent from an intermediate object if another internal answer-bearing field remains present there by design.

### 4. P1/P2/P3 now form a stable release ladder

Each phase had a different job:

- P1: expand and govern generated templates.
- P2: govern constructed-response marking.
- P3: complete explanation coverage.

Because each phase has separate fixtures and reports, the repo can answer "what changed?" without reconstructing intent from code diffs alone.

### 5. The next value gap is depth, not breadth

P3 closes breadth of reasoning coverage. The next value gap is depth:

- more reviewed cases per explanation family
- richer mixed-transfer tasks
- fewer repeated legacy generated variants
- better production-smoke automation

That should be QG P4, not a stealth extension of P3.

## Residual Risks

| Risk | Current state | Recommended follow-up |
| --- | --- | --- |
| Selected-response explanations can still be guessed. | Accepted for P3 because deterministic marking was the priority. Distractors are plausible and reviewed, but not equivalent to written explanation. | QG P4 should deepen case banks and add mixed-transfer reasoning. |
| Case banks are finite. | Each P3 template has reviewed generated cases; the audit proves metadata and signatures, not unlimited novelty. | Expand case-bank depth by concept and measure repeated prompt patterns. |
| Some legacy generated templates still repeat signatures across sampled seeds. | The audit keeps legacy repeated variants separate from strict P3 generated variants. P3 did not claim to fix legacy repetition. | QG P4 should reduce legacy repeated-variant families. |
| Post-deploy production smoke was not run as part of this report. | Repository smoke and CI checks passed; no logged-in smoke against `https://ks2.eugnel.uk` is claimed here. | Run post-deploy smoke after deployment and record the result in release operations. |
| Explanation coverage can affect practice mix over time. | Existing selector tests passed, and no scheduler change was made. | Monitor whether smart practice over-selects or under-selects explanation items after real usage. |
| Documentation can drift from executable audit output. | P3 report and audit were updated together. | Future releases should regenerate or verify report denominator from the audit before merge. |

## Operational Notes

The implementation PR was merged to remote `main`. The feature branch was deleted from the remote after merge.

The implementation did not require changing the primary checkout branch at `/Users/jamesto/Coding/ks2-mastery`.

The final merged implementation is already in remote `main` history. At the time this final report was prepared, `origin/main` also contained later unrelated work after PR #509. The P3 merge commit remains present in the remote main history:

```text
ec3f0ae1 feat(grammar): add QG P3 explanation coverage
```

Production deployment is not claimed by this report. `npm run check` performed the repo's dry-run deploy/build/audit path, but deployment and logged-in production smoke remain separate operational actions.

## Recommended QG P4 Scope

QG P4 should be a depth and transfer release, not another baseline rescue release.

Recommended scope:

1. Expand generator case banks for the P3 explanation templates.
2. Reduce legacy repeated generated variants currently reported as advisory by the audit.
3. Add mixed-transfer prompts that ask learners to choose, explain, and then apply grammar in a constrained task.
4. Add a dedicated production-smoke P3 explanation probe if it materially increases release confidence beyond the existing exact-family probe.
5. Consider redesigning selected manual-review-only prompts into constrained score-bearing formats only where a deterministic rubric is genuinely safe.
6. Automate post-deploy Grammar smoke as a release gate rather than leaving it as a manual operation.

Suggested success metrics for QG P4:

- No strict or legacy generated variant family repeats across the selected audit seed window unless explicitly waived.
- Each P3 explanation family has a larger reviewed case bank and no obvious repeated prompt cluster.
- Mixed-transfer tasks remain deterministic and do not introduce runtime AI scoring.
- Production smoke has at least one direct explanation-depth probe.
- Manual-review-only semantics remain unchanged unless a separately reviewed constrained replacement lands.

## Final Assessment

QG P3 met its release goals. The implementation is merged, the denominator is explicit, all concepts now have explanation coverage, the scoring path remains deterministic, and the review cycle improved the redaction evidence before merge.

The most important judgement call was restraint. P3 did not try to solve every Grammar content-depth problem in one branch. It closed one clear gap, proved it with executable audit output, preserved the QG P2 marking contract, and left a well-defined QG P4 path for deeper generation and transfer work.

That is the right shape for this stage of the Grammar question generator: small enough to review honestly, broad enough to matter to learners, and evidence-backed enough to trust in production.
