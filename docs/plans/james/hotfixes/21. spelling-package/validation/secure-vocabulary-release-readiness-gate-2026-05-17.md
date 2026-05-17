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

Result: exit `1`, expected for the current source.

Report: `validation/secure-vocabulary-approved-source/release-readiness-report.json`

- `ok`: `false`
- `issueCount`: `17038`
- `issuesTruncated`: `true`
- `checkedReviewPackWords`: `1463`
- `checkedAuditedSourceWords`: `1463`
- `checkedSecureExtensionWords`: `1217`
- `metadataIssueCount`: `0`

The `metadataIssueCount: 0` result confirms that the B3w reviewer-pack metadata still reconciles with the audited source. The additional release-readiness issues are the intended blockers for live promotion.

Current issue classes:

- `secure_vocabulary_release_word_missing_field`: secure-extension candidates are missing release-quality fields required before learner-facing import on either the audited source word or the matching review-pack word.

The gate still supports the other release-blocking classes (`secure_vocabulary_release_promotion_not_approved`, `secure_vocabulary_release_word_missing_review_pack_entry`, and `secure_vocabulary_release_word_not_adult_approved`), but they are not present in the current report after James's secure-import approval was ingested.

## Interpretation

This stops the review loop from treating B3w source approval, or the later owner secure-import approval, as sufficient live import proof.

The current source has secure-import approval and adult-approved per-word status. It is not suitable for live secure-extension promotion until the missing release-quality fields are supplied and validated.

No spelling content was imported, published, deployed, or promoted by this gate.

## Verification

- `node --test tests\spelling-secure-vocabulary-source.test.js tests\secure-vocabulary-release-gates.test.js tests\secure-vocabulary-release-gap-summary.test.js tests\secure-vocabulary-release-input-template.test.js`: passed, `16` tests, `0` failures.
- Current approved source release-readiness gate: failed as expected with `issueCount: 17038`, `metadataIssueCount: 0`, and `checkedSecureExtensionWords: 1217`.
