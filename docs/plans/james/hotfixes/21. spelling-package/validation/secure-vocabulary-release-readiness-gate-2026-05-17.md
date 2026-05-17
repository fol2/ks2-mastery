# Secure Vocabulary Release Readiness Gate - 2026-05-17

## Purpose

This evidence records the explicit gate that separates the B3w import/reviewer-pack source proof from live secure-extension promotion.

The B3w metadata gate proves that the approved source, audited source, and reviewer pack are internally consistent. It does not prove that the candidate words are ready to become live learner-facing spelling content.

## Gate Added

`scripts/verify-spelling-secure-vocabulary-release.mjs` now supports `--release-ready`.

The release-readiness gate first runs the existing B3w metadata comparison, then blocks secure-extension promotion unless all of these conditions are met:

- the audited source and review pack both use `APPROVED_FOR_SECURE_EXTENSION_IMPORT`;
- the audited source and review pack both have `securePromotionAllowed: true`;
- every `secure-extension` audited source word appears in the review pack;
- every `secure-extension` word has a release-ready adult review status;
- every `secure-extension` audited source word and matching review-pack word has accepted spelling data, learner explanation, example sentences, UK spelling decision, pattern or morphology tags, family/root metadata, and audio or TTS status.

## Current Approved Source Result

Command:

```powershell
node scripts\verify-spelling-secure-vocabulary-release.mjs --release-ready --audited-source "docs\plans\james\hotfixes\21. spelling-package\validation\secure-vocabulary-approved-source\audited-source.json" --review-pack "docs\plans\james\hotfixes\21. spelling-package\validation\secure-vocabulary-approved-source\review-pack.json" --out "docs\plans\james\hotfixes\21. spelling-package\validation\secure-vocabulary-approved-source\release-readiness-report.json" --json
```

Result: exit `0` after James's secure-import and generated release-quality fallback approval was ingested.

Report: `validation/secure-vocabulary-approved-source/release-readiness-report.json`

- `ok`: `true`
- `issueCount`: `0`
- `issuesTruncated`: `false`
- `checkedReviewPackWords`: `1463`
- `checkedAuditedSourceWords`: `1463`
- `checkedSecureExtensionWords`: `1217`
- `metadataIssueCount`: `0`

The `metadataIssueCount: 0` result confirms that the B3w reviewer-pack metadata still reconciles with the audited source. The release-readiness source gate now passes for the audited source and review pack.

Current issue classes:

- None.

The gate still supports the other release-blocking classes (`secure_vocabulary_release_promotion_not_approved`, `secure_vocabulary_release_word_missing_review_pack_entry`, and `secure_vocabulary_release_word_not_adult_approved`), but they are not present in the current report after James's secure-import approval was ingested.

## Interpretation

This stops the review loop from treating B3w source approval, or the later owner secure-import approval, as sufficient live import proof.

The current source has secure-import approval, adult-approved per-word status, and complete owner-approved generated release-quality fallback fields. It is suitable for the next runtime import/release implementation step, but that step has not been performed by this gate.

No spelling content was imported, published, deployed, or promoted by this gate.

## Verification

- `node --test tests\spelling-secure-vocabulary-source.test.js tests\secure-vocabulary-release-gates.test.js tests\secure-vocabulary-release-gap-summary.test.js tests\secure-vocabulary-release-input-template.test.js`: passed, `16` tests, `0` failures.
- Current approved source release-readiness gate: passed with `issueCount: 0`, `metadataIssueCount: 0`, and `checkedSecureExtensionWords: 1217`.
