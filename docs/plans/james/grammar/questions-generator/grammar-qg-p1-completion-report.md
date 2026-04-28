---
title: "Grammar QG P1 completion report"
type: implementation-report
status: ready-for-review
date: 2026-04-28
plan: docs/plans/james/grammar/questions-generator/grammar-qg-p1.md
contentReleaseId: grammar-qg-p1-2026-04-28
---

# Grammar QG P1 Completion Report

## Summary

Grammar QG P1 moved the subject from a legacy 51-template pool to an auditable 57-template release with deterministic generated content, typed answer contracts for the new templates, selector-aware variant freshness, and read-model redaction guards for generator metadata.

The release id is now `grammar-qg-p1-2026-04-28`. The historical `grammar-legacy-reviewed-2026-04-24` oracle remains frozen for compatibility checks rather than being overwritten.

## What changed

- Added `scripts/audit-grammar-question-generator.mjs` as the executable inventory gate for concept coverage, selected/constructed split, generated/fixed split, thin-pool warnings, answer-spec coverage, and answer-safe generated variant signatures.
- Made repeated generated variants a strict release gate for QG P1 templates while keeping legacy repeated variants advisory, because several older procedural families intentionally have finite or non-varying surfaces.
- Added six focused `qg_*` generated templates:
  - `qg_active_passive_choice`
  - `qg_subject_object_classify_table`
  - `qg_pronoun_referent_identify`
  - `qg_formality_classify_table`
  - `qg_modal_verb_explain`
  - `qg_hyphen_ambiguity_explain`
- Added opt-in hidden `answerSpec` data for those templates using `exact` and `multiField`, with validation coverage through the existing answer-spec module.
- Added generator family and visible-variant signatures to persisted attempt history so selection can penalise repeated generated variants without putting the signature on `session.currentItem`; shuffle-only option order no longer creates a fresh variant signature.
- Corrected recent-miss weighting to use actual miss distance, then added an urgent concept slot so weak or recently missed concepts recycle early without sacrificing breadth and variant freshness in the rest of the queue.
- Hardened read-model redaction so child-facing Grammar recent-attempt models do not expose `answerSpec`, `generatorFamilyId`, `variantSignature`, recent-attempt raw responses, or hidden result answer text.
- Updated current-release oracle and functionality fixtures while keeping legacy and Phase 4 fixtures frozen.
- Updated adult/operator coverage diagnostics so Worker read-models carry the full safe `contentStats` payload, while the client fallback keeps only the compact release, template, generated-template, and thin-pool summary needed before Worker data arrives.
- Updated the Grammar production smoke to exercise the current P1 generated content release and keep deriving answers from production-visible options.

## Current counts

| Metric | Count |
|---|---:|
| Concepts | 18 |
| Templates | 57 |
| Selected-response templates | 37 |
| Constructed-response templates | 20 |
| Generated templates | 31 |
| Fixed templates | 26 |
| Templates with required answer specs | 6 |
| Thin-pool concepts | 0 |
| Single-question-type concepts | 0 |

Question-type coverage:

| Type | Count |
|---|---:|
| build | 4 |
| choose | 18 |
| classify | 3 |
| explain | 4 |
| fill | 3 |
| fix | 11 |
| identify | 8 |
| rewrite | 6 |

## Verification run

Targeted verification passed locally:

```bash
node --test tests/grammar-question-generator-audit.test.js tests/grammar-selection.test.js tests/grammar-engine.test.js tests/grammar-functionality-completeness.test.js tests/grammar-answer-spec.test.js tests/grammar-answer-spec-audit.test.js tests/grammar-production-smoke.test.js tests/grammar-stats-rename.test.js tests/hub-read-models.test.js tests/worker-grammar-subject-runtime.test.js
```

Result: 177 tests passed.

Full repository verification passed locally after rebasing onto the latest `origin/main`:

```bash
npm test
```

Result: 5,783 tests passed, 0 failed, 6 skipped.

An earlier post-rebase full-suite run had one unrelated `react-admin-hub-refresh` ordering assertion fail once; the isolated rerun of that file passed, and the final full-suite rerun above passed cleanly.

Build verification also passed locally:

```bash
npm run check
git diff --check
```

`npm run check` completed the Wrangler dry-run build and client bundle audit successfully. The npm config warning about `playwright_skip_browser_download` is pre-existing project configuration noise.

## Residual risks and follow-up

- The current generated templates are intentionally a P1 lift, not the full catalogue target. Later phases should expand every concept towards a deeper mixed pool.
- Fourteen concepts still lack an `explain` template; that remains the highest-value cross-cutting catalogue expansion.
- Legacy constructed-response templates still use adapter marking paths. Their full declarative `answerSpec` migration should be paired with separate content-release fixture refreshes.
- Legacy generated families can still report advisory repeated variants in the audit. QG P1 templates are hard-gated to avoid repeated strict variants across the sampled release seeds.
- Generated variant signatures are answer-safe and persisted for selector freshness, but they are not child-facing API fields. Keep that split intact in future diagnostics.
