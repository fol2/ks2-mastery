# Spelling Secure Vocabulary Release Input Template

This folder is a data-collection template for the next secure-extension source artefact. It does not approve or import any word into live secure vocabulary.

## Source

- Source JSONL SHA-256: ae39bfc5091525d602f158c18d254b57c498683f9ae81da4d2733f225862a42c
- Current approval decision: APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY
- Required live-import approval decision: APPROVED_FOR_SECURE_EXTENSION_IMPORT
- Secure-extension rows: 1217
- Advisory rows: 12

## Files

- `secure-vocabulary-release-input-template.csv` - one row per secure-extension candidate word.
- `secure-vocabulary-release-input-template-manifest.json` - source hash, counts, required columns, and field guidance.

## Required Filled Fields

- `secureImportReviewStatus`: Use adult_approved_for_secure_extension_import only after the word is approved for live secure-extension import. Use rejected_needs_source_revision when it must not ship.
- `acceptedSpellings`: Pipe-separated spellings accepted by the marker. Include the canonical word when approved.
- `rejectedVariants`: Pipe-separated common confusions or variants that must not be accepted, where useful.
- `explanation`: One child-safe KS2 explanation of the word or spelling point.
- `exampleSentence1`: A KS2-suitable sentence using the word naturally.
- `exampleSentence2`: Optional second KS2-suitable sentence.
- `exampleSentence3`: Optional third KS2-suitable sentence.
- `ukSpellingDecision`: Explicit UK spelling policy decision, including whether US variants are rejected or absent.
- `patternTags`: Pipe-separated spelling pattern tags, if applicable.
- `morphologyTags`: Pipe-separated morphology tags, if applicable.
- `familyRoot`: Word family/root relation used for grouping and teaching.
- `safetyNotes`: Safety, exclusion, age-suitability, or advisory-resolution notes.
- `audioStatus`: Audio requirement or availability status, for example tts_required, audio_available, or not_required.
- `ttsStatus`: TTS plan/status, for example planned, verified, not_required, or blocked.
- `secureImportApprovalDecision`: Use APPROVED_FOR_SECURE_EXTENSION_IMPORT only when the row is approved for live secure-extension import.

## Review Rule

Only rows with `secureImportApprovalDecision=APPROVED_FOR_SECURE_EXTENSION_IMPORT`, adult-approved secure import status, and complete release-quality fields can be considered by a future import/release gate.

Rows with unresolved advisories must either be rejected, downgraded out of secure-extension import, or resolved with explicit safety notes before live promotion.
