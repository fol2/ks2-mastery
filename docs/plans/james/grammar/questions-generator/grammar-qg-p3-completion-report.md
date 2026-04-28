---
title: "Grammar QG P3 completion report"
type: report
status: completed
date: 2026-04-28
plan: docs/plans/james/grammar/questions-generator/grammar-qg-p3.md
release_id: grammar-qg-p3-2026-04-28
---

# Grammar QG P3 completion report

## Summary

Grammar QG P3 ships the explanation-depth expansion for the Grammar question bank. It adds 13 deterministic selected-response explanation templates so every Grammar concept now has at least one `explain` template without introducing runtime AI marking, free-text explanation scoring, or new reward semantics.

The shipped release moves Grammar to:

- 18 concepts.
- 70 templates.
- 50 selected-response templates.
- 20 constructed-response templates.
- 44 generated templates.
- 26 fixed templates.
- 39 answer-spec templates.
- 17 explanation templates.
- 18 / 18 concepts with explanation coverage.
- Zero thin-pool concepts.
- Zero single-question-type concepts.
- Zero invalid answer specs.
- Zero templates missing answer specs.

## P3 Templates

The release adds one selected-response explanation template for each concept that lacked explanation coverage after QG P2:

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

Every P3 template is `questionType: "explain"`, selected-response, generated, SATS-friendly, and declares `requiresAnswerSpec: true` with `answerSpecKind: "exact"`.

## Audit Results

The P3 generator audit reports:

```text
releaseId: grammar-qg-p3-2026-04-28
templateCount: 70
selectedResponseCount: 50
constructedResponseCount: 20
generatedTemplateCount: 44
fixedTemplateCount: 26
answerSpecTemplateCount: 39
constructedResponseAnswerSpecTemplateCount: 20
legacyAdapterTemplateCount: 0
manualReviewOnlyTemplateCount: 4
explainTemplateCount: 17
conceptsWithExplainCoverage: 18 / 18
conceptsMissingExplainCoverage: none
p3ExplanationComplete: true
repeated strict generated variants: 0
invalidAnswerSpecs: 0
templatesMissingAnswerSpecs: 0
```

Answer-spec distribution:

- `acceptedSet`: 2 templates.
- `exact`: 17 templates.
- `manualReviewOnly`: 4 templates.
- `multiField`: 2 templates.
- `normalisedText`: 5 templates.
- `punctuationPattern`: 9 templates.

## Release Evidence

P3 adds separate fixtures rather than overwriting historical baselines:

- `tests/fixtures/grammar-legacy-oracle/grammar-qg-p3-baseline.json`
- `tests/fixtures/grammar-functionality-completeness/grammar-qg-p3-baseline.json`

The QG P1 and QG P2 fixtures remain historical compatibility evidence. P3 also refreshes the content-expansion audit so the documented concept table and active content release id match the executable audit.

Verification run during implementation:

- `node scripts/worktree-setup.mjs`
- `node --check worker/src/subjects/grammar/content.js`
- `node --check scripts/audit-grammar-question-generator.mjs`
- `node --check tests/grammar-qg-p3-explanation.test.js`
- `node scripts/audit-grammar-question-generator.mjs --json`
- `node --test tests/grammar-qg-p3-explanation.test.js tests/grammar-question-generator-audit.test.js tests/grammar-functionality-completeness.test.js tests/grammar-answer-spec.test.js tests/grammar-production-smoke.test.js tests/grammar-selection.test.js tests/grammar-engine.test.js tests/worker-grammar-subject-runtime.test.js tests/hub-read-models.test.js`
- `node --test tests/grammar-content-expansion-audit.test.js`
- `node --test tests/grammar-answer-spec-audit.test.js`
- `node --test tests/react-grammar-surface.test.js`
- `npm test` (5862 passing, 6 skipped, 0 failed)
- `npm run check`
- `git diff --check`

## Operational Notes

P3 does not change the manual-review-only contract from QG P2. Creative open responses remain non-scored and cannot mutate mastery, retries, misconceptions, Star evidence, reward progress, Parent Hub mistake counts, confidence analytics, or SATS mini-test scoring.

P3 does not introduce runtime AI generation or AI marking. All score-bearing P3 items are teacher-authored selected-response questions marked through the existing deterministic `exact` answer-spec path.

No client UI or asset change is required for P3; the new items use the existing single-choice Grammar surface. Production smoke remains an operational gate after deployment and should not be claimed as post-deploy evidence until it is run against `https://ks2.eugnel.uk`.

## Follow-Up Boundary

The natural next content slice is QG P4: deeper generator case banks, richer mixed-transfer coverage, and reduction of legacy advisory repeated-variant families. That should be a separate reviewed content-release plan rather than folded into P3.
