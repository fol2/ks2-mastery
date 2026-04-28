# Grammar QG P2 — Declarative Marking Migration

Status: proposed next implementation phase  
Owner: KS2 Mastery / Grammar  
Previous release baseline: `grammar-qg-p1-2026-04-28`  
Target release: use a new `GRAMMAR_CONTENT_RELEASE_ID` when the P2 migration lands, for example `grammar-qg-p2-YYYY-MM-DD`.

## 1. Context

Grammar QG P1 successfully moved the Grammar question bank from the legacy 51-template baseline to a 57-template release. It added six deterministic question-generator templates, removed the previously thin concept pools, introduced answer-safe generated variant signatures, and added a first audit path for question-generator coverage and production read-model safety.

P1 deliberately did not finish the full marking migration. The six new QG P1 templates declare typed `answerSpec` data, but the legacy constructed-response templates still rely on older accepted-answer or ad-hoc marking paths. P2 should therefore focus on declarative marking governance, not broad content expansion.

The central P2 goal is:

> Every Grammar constructed-response template should have an explicit, validated, Worker-private `answerSpec`, while preserving deterministic, non-AI marking and avoiding hidden answer leakage to child-facing read models.

## 2. Product and learning position

P2 is a quality and trust phase. It should make the engine safer before the team expands the question catalogue further.

The learner-facing experience should not become more complex in this phase. P2 should not add a new mode, a new dashboard, or a new reward surface. It should make the existing Grammar engine more auditable, more consistent, and less dependent on fragile string checks.

The team should continue to avoid runtime AI for production question generation or marking. AI may be used outside production as a review assistant, but no AI-generated question, explanation, answer key, or mark decision should be shipped without deterministic teacher-authored validation.

## 3. Non-goals

P2 must not:

- add broad new Grammar skills or concepts;
- rely on runtime AI generation or AI marking;
- expose `answerSpec`, hidden accepted answers, generator family IDs, variant signatures, or correctness flags in child-facing read models;
- change subject Stars, monster progression, or reward semantics except where a release-id alignment bug is explicitly fixed;
- award mastery for creative open-response templates that cannot be marked deterministically;
- replace subject scheduling with a new external scheduler;
- overwrite the P1 baseline fixture without adding a distinct P2 fixture.

## 4. Validated P1 baseline to preserve

Unless a deliberate P2 release change says otherwise, the following denominator should remain stable:

| Measure | P1 baseline |
|---|---:|
| Concepts | 18 |
| Templates | 57 |
| Selected-response templates | 37 |
| Constructed-response templates | 20 |
| Generated templates | 31 |
| Fixed templates | 26 |
| QG P1 answer-spec templates | 6 |
| Thin-pool concepts | 0 |
| Single-question-type concepts | 0 |

P2 is expected to keep the same 57-template denominator. The main expected denominator change is the answer-spec migration count.

Target after P2:

| Measure | P2 target |
|---|---:|
| Templates | 57 |
| Constructed-response templates | 20 |
| Templates requiring explicit `answerSpec` | 26 |
| Constructed-response templates without explicit `answerSpec` | 0 |
| Thin-pool concepts | 0 |
| Single-question-type concepts | 0 |

Why 26? The six QG P1 templates already require typed `answerSpec`. P2 should add explicit `answerSpec` coverage for the 20 legacy constructed-response templates.

## 5. Main deliverables

P2 should ship the following deliverables:

1. A new Grammar content release ID.
2. Explicit typed `answerSpec` declarations for all 20 constructed-response templates.
3. A P2 audit fixture, separate from the P1 fixture.
4. Audit output that distinguishes between QG template coverage and constructed-response answer-spec migration coverage.
5. Parity tests showing that migrated templates accept the intended answers and reject clear wrong answers.
6. Production smoke coverage for each constructed-response answer-spec family.
7. Read-model redaction tests proving hidden specs and answer keys do not leak.
8. Manual-review handling for genuinely open creative responses.
9. A reward/release-id alignment check for Grammar concept and Star events.

## 6. Workstream A — Baseline and release hygiene

### A1. Keep P1 immutable

Do not mutate the P1 fixture in place. Add a new P2 fixture, for example:

```text
tests/fixtures/grammar-legacy-oracle/grammar-qg-p2-baseline.json
```

The P1 fixture should remain available for regression comparison.

### A2. Bump content release ID

When the constructed-response marking migration lands, update:

```text
worker/src/subjects/grammar/content.js
```

from:

```ts
export const GRAMMAR_CONTENT_RELEASE_ID = 'grammar-qg-p1-2026-04-28';
```

to a new P2 release ID.

Use the actual landing date rather than hard-coding an old date.

### A3. Strengthen audit output

Extend `scripts/audit-grammar-question-generator.mjs` so its JSON output includes:

```ts
{
  answerSpecTemplateCount,
  constructedResponseTemplateCount,
  constructedResponseWithoutAnswerSpec,
  legacyAdapterTemplateCount,
  manualReviewOnlyTemplateCount,
  answerSpecKindCounts,
  p2MigrationComplete
}
```

The audit should fail when a constructed-response template lacks an explicit `answerSpec`, except where the template is intentionally marked as `manualReviewOnly`.

## 7. Workstream B — Migrate normalised text rewrites

Migrate these templates first because they are the lowest-risk constructed-response group:

| Template ID | Target answer-spec kind |
|---|---|
| `tense_rewrite` | `normalisedText` |
| `active_passive_rewrite` | `normalisedText` |
| `proc2_standard_english_fix` | `normalisedText` |
| `proc2_passive_to_active` | `normalisedText` |
| `proc3_apostrophe_rewrite` | `normalisedText` |

For each template:

- add `requiresAnswerSpec: true`;
- add `answerSpecKind: 'normalisedText'`;
- emit a Worker-private `answerSpec` from the question builder;
- mark through `markByAnswerSpec`;
- keep expected child-facing feedback stable;
- add positive and negative tests.

Minimum tests per template:

- exact expected answer passes;
- harmless whitespace/case variation passes where appropriate;
- an answer with the wrong grammar target fails;
- the generated question serialisation does not expose `answerSpec` or hidden accepted responses.

## 8. Workstream C — Migrate punctuation-pattern fixes

Migrate these templates next:

| Template ID | Target answer-spec kind |
|---|---|
| `fix_fronted_adverbial` | `punctuationPattern` |
| `parenthesis_fix_sentence` | `punctuationPattern` |
| `speech_punctuation_fix` | `punctuationPattern` |
| `proc_fronted_adverbial_fix` | `punctuationPattern` |
| `proc_colon_list_fix` | `punctuationPattern` |
| `proc_dash_boundary_fix` | `punctuationPattern` |
| `proc_speech_punctuation_fix` | `punctuationPattern` |
| `proc3_parenthesis_commas_fix` | `punctuationPattern` |
| `proc3_hyphen_fix_meaning` | `punctuationPattern` |

Before migrating these, check whether `punctuationPattern` needs small extensions for:

- quote style normalisation;
- spacing around dashes;
- hyphen-minus handling;
- final punctuation tolerance;
- optional comma tolerance only where explicitly intended.

Do not make the punctuation matcher too permissive. It should accept legitimate formatting variation, not incorrect punctuation.

Minimum tests per template:

- expected answer passes;
- answer with missing target punctuation fails;
- answer with wrong punctuation type fails;
- answer with unrelated wording changes fails unless the original template already accepted that behaviour;
- hidden answer data is absent from the read model.

## 9. Workstream D — Migrate accepted-set rewrites

Migrate these templates:

| Template ID | Target answer-spec kind |
|---|---|
| `combine_clauses_rewrite` | `acceptedSet` |
| `proc3_clause_join_rewrite` | `acceptedSet` |

For each template:

- enumerate the accepted alternatives explicitly;
- keep the accepted set small and teacher-reviewable;
- add tests for each accepted answer;
- add tests for common wrong joins and comma-splice errors;
- ensure option-free constructed responses do not leak hidden accepted alternatives before marking.

## 10. Workstream E — Handle manual-review-only templates safely

The following templates are open enough that deterministic auto-marking may be educationally unsafe:

| Template ID | Target answer-spec kind |
|---|---|
| `build_noun_phrase` | `manualReviewOnly` |
| `standard_fix_sentence` | `manualReviewOnly` or redesigned constrained response |
| `proc2_fronted_adverbial_build` | `manualReviewOnly` |
| `proc3_noun_phrase_build` | `manualReviewOnly` |

For these templates, choose one of two routes.

### Route 1: Keep as manual-review-only

Use this route where the response is genuinely creative or has many valid answers.

Required behaviour:

- the item can collect a response;
- the response can be shown to the learner after submission;
- the response is not auto-scored as correct;
- the response does not increase concept mastery, secure status, Stars, or reward progression;
- the result clearly communicates that this is a writing/practice item rather than an automatically marked mastery item.

### Route 2: Redesign as constrained response

Use this route only if the team can make the item deterministic without making it educationally weak.

Examples:

- provide a fixed word bank;
- require choosing from labelled phrases;
- ask for one controlled transformation;
- mark against a finite accepted set.

If a template is redesigned this way, document the change and test the new constraints thoroughly.

## 11. Workstream F — Production read-model and command safety

P2 must preserve the P1 safety boundary:

- `answerSpec` must remain Worker-private;
- `correctResponses` must not leak before marking;
- generated variant signatures must not appear in child-facing read models;
- generator family IDs must not appear in child-facing read models;
- option objects must not include hidden `correct` flags;
- production smoke should derive correct and incorrect responses only from visible item data, not local hidden objects.

Extend production smoke so it covers at least one template from each answer-spec family:

| Kind | Suggested smoke template |
|---|---|
| `normalisedText` | `active_passive_rewrite` or `tense_rewrite` |
| `punctuationPattern` | `speech_punctuation_fix` or `proc_speech_punctuation_fix` |
| `acceptedSet` | `combine_clauses_rewrite` |
| `multiField` | `qg_subject_object_classify_table` |
| `exact` | `qg_modal_verb_explain` |
| `manualReviewOnly` | one selected manual-review template |

For `manualReviewOnly`, the smoke should prove that the item does not grant mastery or reward progression.

## 12. Workstream G — Selector and variant-quality checks

P1 added generated variant signatures and selector freshness. P2 should not regress that work.

Add or preserve checks that:

- generated templates declare stable `generatorFamilyId` values;
- generated variant signatures ignore answer order and hidden answer specs;
- repeated QG P1 variants remain a strict failure;
- legacy repeated generated variants remain visible in advisory output until fixed;
- the selector does not repeatedly serve the same generated structure merely because surface words changed;
- focus sessions still preserve question-type variety where possible.

P2 should also increase audit sampling for generated templates. The current small seed sample is useful, but it is too shallow to prove broad generator health.

Recommended P2 sampling:

```text
seeds: 1, 2, 3, 7, 11, 19, 29, 37
```

Do not make the sampling set so large that normal development becomes slow. Keep a fast default gate and allow a deeper optional audit command for release candidates.

## 13. Workstream H — Reward and release-id alignment

Check the reward path before shipping P2.

Required checks:

- `grammar.concept-secured` events carry the active `GRAMMAR_CONTENT_RELEASE_ID`;
- reward mastery keys use the active content release ID, not a stale legacy default;
- Star evidence events do not emit reward events under an older release ID unless that is explicitly intended and documented;
- manual-review-only items cannot create secure concept evidence;
- non-scored writing/transfer events remain outside the reward projection pipeline.

If a legacy reward release constant is still used as a fallback, keep it only for backward compatibility and add tests proving active events prefer the event-level release ID.

## 14. Test plan

Add or update tests in these areas:

```text
tests/grammar-answer-spec.test.js
tests/grammar-answer-spec-audit.test.js
tests/grammar-question-generator-audit.test.js
tests/grammar-functionality-completeness.test.js
tests/grammar-production-smoke.test.js
tests/grammar-selection.test.js
tests/grammar-engine.test.js
```

Add a new P2-specific migration test file if the existing files become too crowded:

```text
tests/grammar-answer-spec-migration-p2.test.js
```

Suggested assertions:

- every constructed-response template has explicit answer-spec handling;
- every emitted answer spec validates over multiple seeds;
- migrated templates preserve intended correct-answer behaviour;
- common wrong answers are rejected;
- manual-review-only items do not mutate mastery;
- production read models do not expose hidden answers;
- P2 baseline fixture matches the shipped denominator;
- old P1 fixture remains readable and unchanged.

## 15. Suggested verification commands

Run the targeted gates first:

```bash
node scripts/audit-grammar-question-generator.mjs --json
node --test tests/grammar-question-generator-audit.test.js
node --test tests/grammar-answer-spec.test.js
node --test tests/grammar-answer-spec-audit.test.js
node --test tests/grammar-functionality-completeness.test.js
node --test tests/grammar-production-smoke.test.js
node --test tests/grammar-selection.test.js
node --test tests/grammar-engine.test.js
```

After the P2 fixture is intentionally created or refreshed:

```bash
node scripts/audit-grammar-question-generator.mjs \
  --write-fixture tests/fixtures/grammar-legacy-oracle/grammar-qg-p2-baseline.json
```

Before opening the PR:

```bash
npm test
npm run check
git diff --check
```

## 16. Acceptance criteria

P2 is complete only when all of the following are true:

- the Grammar content release ID has been bumped for the migration;
- the shipped denominator remains 18 concepts and 57 templates unless a deliberate content change is documented;
- all 20 constructed-response templates have explicit answer-spec handling;
- `answerSpecTemplateCount` is 26 or higher, with the difference explained if higher;
- `constructedResponseWithoutAnswerSpec` is empty;
- no hidden answer data leaks into child-facing read models;
- manual-review-only templates do not award mastery, Stars, or reward events;
- the production smoke covers each answer-spec family;
- the P2 fixture is separate from the P1 fixture;
- full tests and static checks pass;
- the PR description states whether marking behaviour changed for any template.

## 17. Known risks

### Risk: over-permissive punctuation marking

A punctuation matcher that accepts too much will create false mastery.

Mitigation: add negative tests for missing punctuation, wrong punctuation, and unrelated wording changes.

### Risk: exact-string marking remains hidden inside migrated templates

A template might technically emit `answerSpec` while still bypassing the shared marker.

Mitigation: tests should assert that migrated templates mark through shared answer-spec code.

### Risk: manual-review-only items become dead content

If manual-review-only items never contribute to progress, learners may experience them as unrewarded work.

Mitigation: position them as practice/writing items, or redesign the most important ones into constrained deterministic templates in a later phase.

### Risk: release-id mismatch between content and rewards

If concept evidence and reward events disagree on release ID, learners may see confusing replay, duplicate reward, or missing reward behaviour.

Mitigation: test concept-secured and Star-evidence reward paths with the active P2 release ID.

### Risk: P2 becomes content expansion by accident

The team may be tempted to add more templates while touching content.

Mitigation: keep P2 focused on marking migration. Defer broad expansion to P3/P4.

## 18. Expected next phases after P2

The recommended total Grammar QG programme is six phases:

| Phase | Theme | Purpose |
|---|---|---|
| P1 | Generator foundation | Add first six deterministic QG templates, coverage audit, signatures, selector freshness, smoke safety. |
| P2 | Declarative marking migration | Move constructed-response marking to explicit answer specs and harden release/read-model safety. |
| P3 | Explanation coverage | Add explain templates for the remaining under-covered concepts so mastery is not mostly recognition/fix. |
| P4 | Generator depth expansion | Increase high-quality deterministic variant depth, especially for broader transfer and mixed grammar use. |
| P5 | Release automation and QA dashboard | Make audits, smoke tests, denominator diffs, and quality metrics part of the normal release gate. |
| P6 | Learning calibration and telemetry | Use live evidence to tune mastery thresholds, scheduler balance, template retirement, and misconception repair. |

After P2, the engine should be safe enough for more content expansion. P3 should then attack the biggest remaining learning gap: too few explanation templates across the Grammar subject.
