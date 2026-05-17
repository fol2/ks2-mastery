# Runtime Import Local Verification - 2026-05-17

## Scope

This evidence supersedes the earlier check-mode-only secure vocabulary handoff state. James approved secure-extension import and the owner-approved generated release-quality fallback fields for all 1217 pinned candidate rows. The worktree then applied the approved source to the local spelling runtime content.

This is still local verification only. It does not prove deployment or live hard-refresh behaviour on `https://ks2.eugnel.uk`.

## Runtime Import Artefacts

- Import plan: `validation/secure-vocabulary-approved-source/runtime-import-plan.json`
- Applied import result: `validation/secure-vocabulary-approved-source/runtime-import-result.json`
- Runtime import manifest: `validation/secure-vocabulary-approved-source/runtime-import-manifest.json`
- Runtime verification report: `validation/secure-vocabulary-approved-source/runtime-verification-report.json`
- Import verifier: `scripts/verify-spelling-secure-vocabulary-runtime.mjs`

## Applied Release

- Release id: `spelling-r6`
- Release version: `6`
- Published timestamp: `2026-05-17T16:30:00.000Z`
- Imported secure-extension words: `1217`
- Imported secure-extension sentences: `1217`
- Imported secure-extension word lists: `15`
- Source JSONL SHA-256: `ae39bfc5091525d602f158c18d254b57c498683f9ae81da4d2733f225862a42c`
- Approval decision: `APPROVED_FOR_SECURE_EXTENSION_IMPORT`
- Reviewer: `James`

## Current Runtime Counts

`runtime-verification-report.json` reports:

- `ok: true`
- `issueCount: 0`
- `checkedSecureExtensionWords: 1217`
- `expectedSecureExtensionWords: 1217`
- `wordListCount: 18`
- `wordCount: 1463`
- `sentenceCount: 3430`
- `releaseCount: 6`
- `publishedReleaseId: spelling-r6`
- `publishedVersion: 6`
- `runtimeWordCount: 1463`
- `runtimeSentenceCount: 3430`
- `coverageTierCounts.statutoryCore: 213`
- `coverageTierCounts.secureExtension: 1217`
- `coverageTierCounts.enrichmentExtra: 33`
- `errorCount: 0`
- `warningCount: 6`

The six warnings are the pre-existing below-threshold pattern launch warnings already tracked in `validation-summary.md`.

## Reviewer-Loop Regression Fixes

The latest local branch also addresses the previous Code Reviewer B3w blockers before fresh reviewer rerun:

- Word-family runtime grouping is now tier-aware, so secure-extension variants do not leak into statutory-core `familyWords`.
- Test fixtures that meant statutory core now use the statutory-core predicate instead of legacy `spellingPool !== 'extra'` or `spellingPool === 'core'` checks.
- Runtime import plan and manifest evidence now report effective adult-reviewed secure-import approval counts for the imported rows, while raw source artefacts still preserve pre-approval provenance.
- Runtime import idempotency detection is narrowed to the secure vocabulary import source provenance and source artifact marker instead of broad id/tag matching.
- Runtime import result path fields are repo-relative POSIX-style paths, not absolute machine paths.

## Commands Run

```powershell
node scripts\import-spelling-secure-vocabulary.mjs --check --audited-source "docs\plans\james\hotfixes\21. spelling-package\validation\secure-vocabulary-approved-source\audited-source.json" --content content\spelling.seed.json --json --out "docs\plans\james\hotfixes\21. spelling-package\validation\secure-vocabulary-approved-source\runtime-import-plan.json"

node scripts\import-spelling-secure-vocabulary.mjs --apply --audited-source "docs\plans\james\hotfixes\21. spelling-package\validation\secure-vocabulary-approved-source\audited-source.json" --content content\spelling.seed.json --manifest "docs\plans\james\hotfixes\21. spelling-package\validation\secure-vocabulary-approved-source\runtime-import-manifest.json" --published-at 2026-05-17T16:30:00.000Z --json --out "docs\plans\james\hotfixes\21. spelling-package\validation\secure-vocabulary-approved-source\runtime-import-result.json"

npm run content:generate

node scripts\verify-spelling-secure-vocabulary-runtime.mjs --json --out "docs\plans\james\hotfixes\21. spelling-package\validation\secure-vocabulary-approved-source\runtime-verification-report.json"

npm run content:validate

node --test tests\spelling-content.test.js tests\spelling-progression.test.js tests\spelling-secure-vocabulary-source.test.js tests\secure-vocabulary-release-gap-summary.test.js tests\secure-vocabulary-release-gates.test.js tests\secure-vocabulary-release-input-template.test.js tests\spelling-content-patterns.test.js tests\spelling-seed-harness.test.js tests\spelling-content-api.test.js tests\spelling-post-mastery-debug.test.js tests\spelling-remote-sync-hydration.test.js tests\worker-hubs.test.js tests\worker-subject-runtime.test.js tests\server-spelling-engine-parity.test.js tests\hub-read-models.test.js

node --test tests\smoke.test.js tests\spelling-sticky-graduation.test.js

npm test

npm run check
```

## Results

- Runtime import check mode: passed, writes disabled, planned `spelling-r6`.
- Runtime import apply mode: passed, writes enabled, generated manifest and result evidence.
- Runtime verifier: passed, `ok=true`, `issueCount=0`.
- `npm run content:validate`: passed, `ok=true`, `1463` runtime words, `3430` runtime sentences, `0` errors, `6` existing warnings.
- Combined B3w regression suite: passed, `207` tests, `0` failures.
- `node --test tests\smoke.test.js tests\spelling-sticky-graduation.test.js`: passed, `31` tests, `0` failures.
- `npm test`: passed, `111631` tests, `111619` passed, `0` failures, `12` skipped.
- `npm run check`: passed, exit `0`; Wrangler dry-run build, public assertion, and client bundle audit completed.

## Remaining Gates

Do not claim `DONE - LIVE VERIFIED` from this local evidence. The remaining gates are:

- independent Code Reviewer exact pass line;
- independent Contract Auditor exact pass line;
- deployment through `npm run deploy`;
- production hard-refresh verification on `https://ks2.eugnel.uk`;
- post-deploy evidence that the live Word Bank and runtime counts reflect `spelling-r6`.
