# Validation Summary — Spelling Secure Vocabulary Expansion Handoff

## Verdict

The approved secure vocabulary source is now imported locally into the Spelling runtime as release `spelling-r6`. The local runtime contains `1463` spelling words: `213` statutory-core, `1217` secure-extension, and `33` enrichment-extra. The implementation keeps secure-extension words out of statutory Mega, Guardian, SATs-style, and Pattern Quest statutory-core semantics.

This is now a live completion claim for commit `31abee1e3ac7343f59c4a83545c12f416270fef9`. Fresh pre-deploy Code Reviewer and Contract Auditor PASS lines are recorded, `npm run deploy` completed, and production hard-refresh verification on `https://ks2.eugnel.uk` passed. Status: `DONE - LIVE VERIFIED`.

A small high-confidence patch is included for two adjacent problems that become more important at thousands-word scale:

1. The Worker spelling runtime-content cache key used the entire persisted `content_json` string as a `Map` key. That is avoidable memory/key bloat for a large spelling content release.
2. The admin content-quality signal for Spelling read fields that are not present in the current persisted spelling bundle schema, so item coverage could remain `not_available` even when spelling content exists.

The adjacent cache/admin signal patch is retained as scale hardening beside the runtime import.

## Source boundary

### ZIP

- Primary ZIP: `/mnt/data/ks2-mastery-lean-05161145.zip`
- SHA-256: `2eadb98eca14a740a7a67cf54b00f14ef5acca1a8cb9509bb774a7d0c8db00c2`
- Integrity: ZIP extracted and patch dry-run/apply succeeded on fresh extractions.
- Shape: rootless lean review archive.
- `.git`: absent.
- Manifest: review bundle; source, scripts, tests, fixtures, and repo config included; assets/reports/output omitted.

### Secure vocabulary source artifact

- Artifact: `secure-vocabulary-source-v1-input-artifact.zip`
- Artifact SHA-256: `cdf18f85c37f94274608193fe31dc0dd93b23e153b4e492ffd25fb9b924d889e`
- Source JSONL SHA-256: `ae39bfc5091525d602f158c18d254b57c498683f9ae81da4d2733f225862a42c`
- Records: `1463`
- Unique words: `1463`
- Current published spelling snapshot records: `246`
- Secure-extension candidate records: `1217`
- Original ZIP approval decision: `APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY`
- Current pipeline approval decision: `APPROVED_FOR_SECURE_EXTENSION_IMPORT`
- Reviewer: `James`
- Review timestamp: `2026-05-17T12:15:41+01:00`

This breaks the previous missing-source-list loop. The later owner approval is now ingested into the audited source/review pack through `evidence/secure-extension-import-approval-pipeline-record-2026-05-17.json`. The approved source has now also been imported into runtime content as `spelling-r6`, deployed to production, and live verified.

Post-review owner approval addendum: James subsequently approved secure-extension import and owner-approved generated release-quality fallback fields for all 1217 pinned candidate rows on 2026-05-17. This is recorded in `evidence/secure-extension-import-approval-record-2026-05-17.md` and `.json`, and converted to the pipeline record above. The audited source and review pack now carry the secure-import approval and complete release-quality field coverage.

### Local taxonomy backbone proof

Local evidence under `validation/taxonomy-backbone-local-verification-2026-05-17.md` proves the runtime taxonomy seam now exists:

- Canonical tiers: `statutory-core`, `secure-extension`, `enrichment-extra`.
- Current local runtime counts: `213` statutory-core, `1217` secure-extension, `33` enrichment-extra.
- The approved-source aliases `current_statutory_core`, `current_extra`, and `secure_extension_candidate` normalise to the canonical tiers.
- Guardian, Pattern Quest, post-mastery counts, analytics, Word Bank filters, admin read models, Worker read models, and generated spelling data now use tier-aware helpers.
- Secure-extension words remain excluded from statutory Mega/Guardian eligibility after import.

This closes the taxonomy-backbone blocker and supports the runtime import. Deployment and live production proof are now recorded in `validation/live-production-completion-2026-05-17.md`.

### Approved-source import and reviewer-pack proof

Generated local evidence under `validation/secure-vocabulary-approved-source/`:

- `audit-report.json`: `ok: true`, zero issues, exact source hash matched.
- `import-plan.json`: check-mode import plan, `writes: false`, status `approved_for_secure_extension_import_not_applied`.
- `audited-source.json`: audited-source input for the B3w release gate.
- `review-pack.json`: reviewer-pack output with 1463 words.
- `review-pack.md`: human-readable reviewer summary and advisory-word list.
- `verification-report.json`: B3w verification `ok: true`, `issueCount: 0`, `checkedReviewPackWords: 1463`, `checkedAuditedSourceWords: 1463`.
- `release-gate-report.json`: direct CLI verification with the same `ok: true` and zero issues.
- `release-readiness-report.json`: explicit live-promotion source gate with `ok: true`, `issueCount: 0`, `metadataIssueCount: 0`, and `checkedSecureExtensionWords: 1217`.
- `release-gap-summary.json` / `.md`: grouped release summary for the current generated source/review-pack artefacts, showing zero missing review-pack entries, 1217 secure-import adult-approved words, zero not-adult-approved words, zero missing required release-quality fields, and 12 advisory words.
- `release-input-template/`: non-importing CSV input template with 1217 secure-extension rows, 12 advisory rows, the pinned source hash, the ingested secure-extension approval decision, and the release-quality collection columns retained for future source refreshes.
- `evidence/secure-extension-import-approval-record-2026-05-17.md` / `.json`: owner/adult-reviewer approval for secure-extension import of all 1217 pinned candidate rows and the generated release-quality fallback policy used by the pipeline.
- `runtime-import-plan.json`: check-mode runtime import plan for `spelling-r6`, writes disabled.
- `runtime-import-result.json`: applied runtime import result, writes enabled, `1217` secure-extension words imported.
- `runtime-import-manifest.json`: applied runtime import manifest with source hash, approval decision, release metadata, and imported word/list counts.
- `runtime-verification-report.json`: runtime verification `ok: true`, `issueCount: 0`, `checkedSecureExtensionWords: 1217`, local runtime `1463` words, release `spelling-r6` version `6`.
- `validation/runtime-import-local-verification-2026-05-17.md`: local runtime import evidence and command summary, including full `npm test` and `npm run check`.
- `validation/current-head-completion-audit-2026-05-17.md`: moving-branch completion audit including a prompt-to-artifact checklist, the reviewer-found Word Bank Guardian-chip fix, and the live completion decision.
- `validation/reviewer-loop-current-head-2026-05-17.md`: latest independent Code Reviewer and Contract Auditor rerun includes fresh pre-deploy `PASS - no blockers, no advisories, findings=[]` outputs. Historical `NOT PASS` output is preserved as superseded context.
- `validation/live-production-completion-2026-05-17.md`: production completion note for commit `31abee1e3ac7343f59c4a83545c12f416270fef9`, Cloudflare Worker version `40bfe379-7417-4553-bc1b-53bf5a2eb6c3`, and live evidence.
- `validation/live-spelling-dense-smoke-2026-05-17.json`: live spelling dense smoke, `ok: true`, with demo session, bootstrap, spelling `start-session`, and `submit-answer` checks.
- `validation/live-spelling-secure-vocabulary-word-bank-2026-05-17.json`: live Word Bank proof, `ok: true`, with `1463` rows, `213` core, `1217` secure-extension, `33` extra, and `certain`/`certainly` tier isolation.
- `validation/live-spelling-hard-refresh-smoke-2026-05-17.json`: live browser hard-refresh smoke, `ok: true`, with zero console errors, zero page errors, zero request failures, and zero HTTP errors.
- `validation/live-spelling-hard-refresh-smoke-2026-05-17.png`: screenshot from the passing hard-refresh smoke.
- `targeted-tests.log`: original B3w run passed 5 tests. The release-readiness addendum reran `node --test tests/spelling-secure-vocabulary-source.test.js tests/secure-vocabulary-release-gates.test.js` after adding release-readiness coverage, and 10 tests passed.
- `content-validate.log`: historical pre-import `npm run content:validate` evidence. Current post-import counts are recorded in `runtime-verification-report.json`: `ok: true`, 1463 runtime words, 3430 runtime sentences, 0 errors, 6 existing pattern warnings.
- `npm-run-check.log`: `npm run check`, exit `0`; Wrangler dry-run build and client bundle audit passed.

Commands recorded:

- `node scripts/audit-spelling-secure-vocabulary.mjs --source-jsonl D:\tmp\ks2-spelling-b3w-source-artifact-approved-check\source\secure-vocabulary-source-v1.jsonl --approval D:\tmp\ks2-spelling-b3w-source-artifact-approved-check\approval\owner-approval-record.json --out validation/secure-vocabulary-approved-source/audit-report.json`
- `node scripts/import-spelling-secure-vocabulary.mjs --check --source-jsonl D:\tmp\ks2-spelling-b3w-source-artifact-approved-check\source\secure-vocabulary-source-v1.jsonl --approval D:\tmp\ks2-spelling-b3w-source-artifact-approved-check\approval\owner-approval-record.json --out validation/secure-vocabulary-approved-source/import-plan.json`
- `node scripts/build-spelling-secure-vocabulary-review-pack.mjs --source-jsonl D:\tmp\ks2-spelling-b3w-source-artifact-approved-check\source\secure-vocabulary-source-v1.jsonl --approval D:\tmp\ks2-spelling-b3w-source-artifact-approved-check\approval\owner-approval-record.json --out-dir validation/secure-vocabulary-approved-source --json`
- `node scripts/verify-spelling-secure-vocabulary-release.mjs --source validation/secure-vocabulary-approved-source/audited-source.json --review-pack validation/secure-vocabulary-approved-source/review-pack.json --json --out validation/secure-vocabulary-approved-source/release-gate-report.json`
- `node scripts/verify-spelling-secure-vocabulary-release.mjs --release-ready --audited-source validation/secure-vocabulary-approved-source/audited-source.json --review-pack validation/secure-vocabulary-approved-source/review-pack.json --json --out validation/secure-vocabulary-approved-source/release-readiness-report.json`
- `node scripts/summarise-spelling-secure-vocabulary-release-gaps.mjs --audited-source validation/secure-vocabulary-approved-source/audited-source.json --review-pack validation/secure-vocabulary-approved-source/review-pack.json --out validation/secure-vocabulary-approved-source/release-gap-summary.json --md-out validation/secure-vocabulary-approved-source/release-gap-summary.md`
- `node scripts/build-spelling-secure-vocabulary-release-input-template.mjs --audited-source validation/secure-vocabulary-approved-source/audited-source.json --out-dir validation/secure-vocabulary-approved-source/release-input-template --json`
- `node scripts/import-spelling-secure-vocabulary.mjs --check --audited-source validation/secure-vocabulary-approved-source/audited-source.json --content content/spelling.seed.json --json --out validation/secure-vocabulary-approved-source/runtime-import-plan.json`
- `node scripts/import-spelling-secure-vocabulary.mjs --apply --audited-source validation/secure-vocabulary-approved-source/audited-source.json --content content/spelling.seed.json --manifest validation/secure-vocabulary-approved-source/runtime-import-manifest.json --published-at 2026-05-17T16:30:00.000Z --json --out validation/secure-vocabulary-approved-source/runtime-import-result.json`
- `npm run content:generate`
- `node scripts/verify-spelling-secure-vocabulary-runtime.mjs --json --out validation/secure-vocabulary-approved-source/runtime-verification-report.json`
- `node --test tests/spelling-secure-vocabulary-source.test.js tests/secure-vocabulary-release-gates.test.js`
- `npm run content:validate`
- `npm test`
- `npm run check`
- `npm run deploy`
- `node ./scripts/spelling-dense-history-smoke.mjs --require-bootstrap-capacity --output validation/live-spelling-dense-smoke-2026-05-17.json`
- Live Word Bank secure-vocabulary proof saved to `validation/live-spelling-secure-vocabulary-word-bank-2026-05-17.json`
- Live browser hard-refresh proof saved to `validation/live-spelling-hard-refresh-smoke-2026-05-17.json`

### GitHub

GitHub was used only as a supplementary exact-file check. Repository `fol2/ks2-mastery` default branch was reported as `main`. Exact file `worker/src/repository.js` at `main` had blob SHA `a20215b8519c99fca4c05922ba1bc0c47c17108f`, matching the ZIP local blob SHA for the same file. This confirms the two patched adjacent issues were also present in fetched GitHub `main` for that file. It does not prove whole-repo identity.

### Local run

Local validation proves only behaviour in this worktree.

- Local Node for the runtime-import verification: `v22.15.1`
- Repo `.nvmrc`: `22`
- Node 22 Worker/server checks run locally, and production deploy/live smoke are now complete.

### Production

Production is proven for this release.

- Deployed commit: `31abee1e3ac7343f59c4a83545c12f416270fef9`
- Cloudflare Worker version: `40bfe379-7417-4553-bc1b-53bf5a2eb6c3`
- Deploy command: `npm run deploy`
- Production bundle audit: passed for `https://ks2.eugnel.uk/`
- Live spelling dense smoke: passed
- Live Word Bank secure-vocabulary proof: passed
- Live browser hard-refresh proof: passed

## Current local runtime evidence

### Current spelling content counts

The local runtime import promotes the approved secure-extension source as `spelling-r6`. `runtime-verification-report.json` reports:

- `ok: true`
- `wordListCount: 18`
- `wordCount: 1463`
- `sentenceCount: 3430`
- `releaseCount: 6`
- `publishedReleaseId: spelling-r6`
- `publishedVersion: 6`
- `publishedAt: 1779035400000`
- `runtimeWordCount: 1463`
- `runtimeSentenceCount: 3430`
- errors: `0`
- warnings: `6`

Current local release coverage split observed from generated/seeded content:

- statutory-core runtime words: `213`
- secure-extension runtime words: `1217`
- enrichment-extra runtime words: `33`

This closes the local runtime import gap. It is not deployment or live production proof.

### Existing validator warnings

The validator already reports six pattern coverage warnings:

- `suffix-sion`: 3 core tagged words, below threshold 4.
- `suffix-cian`: 0 core tagged words, below threshold 4.
- `suffix-able-ible`: 2 core tagged words, below threshold 4.
- `prefix-un-in-im`: 3 core tagged words, below threshold 4.
- `root-graph-scribe`: 1 core tagged word, below threshold 4.
- `root-port-spect`: 2 core tagged words, below threshold 4.

Expansion work should fix or quarantine these warnings, not bury them under a larger word bank.

### Current generated file sizes

The current 1463-word local runtime generates substantial source data:

- `content/spelling.seed.json`: 14,787,059 bytes; SHA-256 `a3bb2291ac78d4752da0c544962211e10e8be97c47c128164f267e15e13f1c39`
- `src/subjects/spelling/data/content-data.js`: 25,273,664 bytes; SHA-256 `746fae6b92ad3e9accf592f7cf7b8d40ea1bac1686f7dbc70a40b30c77bc3545`
- `src/subjects/spelling/data/word-data.js`: 4,875,186 bytes; SHA-256 `d4f28a8db61443a4d7df25cc591332a4ebd8c82214d74c3c2489c9635879c762`

The bundle and dry-run check passed locally. Production deploy, bundle audit, live spelling command smoke, live Word Bank proof, and hard-refresh browser proof also passed.

## Patch validation

Patch file:

- `patches/001-spelling-expansion-cache-and-admin-signal.patch`

Patch modifies:

- `worker/src/repository.js`
- `tests/spelling-content-api.test.js`

Patch intent:

1. Replace full-JSON spelling runtime content cache keys with a bounded key using subject id, row timestamp, content length, and a deterministic 32-bit hash.
2. Make admin spelling item coverage derive from `runtimeSnapshotForBundle()` and `runtimeContentSummary()` instead of nonexistent bundle fields.
3. Add a Worker endpoint regression test for spelling item coverage in `/api/admin/ops/content-quality-signals`.

Executed local checks:

- `patch --dry-run -p1 < patches/001-spelling-expansion-cache-and-admin-signal.patch`: exit `0`.
- `patch -p1 < patches/001-spelling-expansion-cache-and-admin-signal.patch`: exit `0`.
- `npm run content:validate` after patch: exit `0`.
- Static grep after patch: direct `return row.content_json` and old nonexistent-field lookups were not present in patched source.

Local Codex Node 22 update:

- Node: `v22.15.1`.
- The Task B fix is now implemented in the worktree.
- `node --test tests\spelling-content-api.test.js`: passed, `12` tests, `0` failures.
- `node --test tests\worker-hubs.test.js`: passed, `7` tests, `0` failures.
- Historical Task B check before the runtime import: `npm run content:validate` passed with `246` runtime words, `2213` runtime sentences, `0` errors, and `6` existing pattern warnings. Current post-import counts are in `runtime-verification-report.json`.
- `npm run audit:client`: passed, main bundle gzip `210699 / 232000` bytes.
- `npm run check`: passed, Wrangler dry-run completed successfully.
- Evidence file: `validation/task-b-local-patch-equivalence-2026-05-17.md`.

## Live Completion Blockers

No live completion blockers remain for the B3w secure-vocabulary release at commit `31abee1e3ac7343f59c4a83545c12f416270fef9`.

The previously open production deployment, live Word Bank count, and hard-refresh browser proof blockers are closed by `validation/live-production-completion-2026-05-17.md` and the JSON/screenshot artefacts listed above.

## Residual Notes

- **Current content size implies production scale risk.** The 1463-word runtime produces a 25 MB generated `content-data.js` file. Local `npm test`, `npm run check`, deploy, production bundle audit, live spelling command smoke, live Word Bank proof, and hard-refresh smoke passed.

- **Existing pattern warnings remain.** Several registered spelling patterns have below-threshold core coverage. They remain warnings in the content validator and do not block the secure-extension import.

- **Audio/TTS behaviour.** The live spelling session journey exercised the production spelling surface and waited for session network idle before hard reload. The first hard-refresh attempt aborted an in-flight `/api/tts` request during reload; the rerun superseded it and passed with zero request failures. A separate exploratory `spelling-audio-production-smoke` run showed the U3 word-only primary audio cache is not prefetched for the default sample words; that separate cache-smoke gap needs an explicit TTS generation/upload run and cost approval if it is required for a future audio-cache sign-off.

## Advisories

- `SPELLING_CONTENT_RELEASE_ID` in `src/subjects/spelling/service-contract.js` is still `spelling-p2-baseline-2026-04-26` while current local content validation reports published release `spelling-r6` / version 6. This appears deliberate because the post-Mega/sticky-graduation contract separates service-state content release semantics from content publication; reviewers must confirm this remains acceptable.
- Any secure-extension release must avoid telling existing Mega learners that their achievement was lost simply because new words were added.
- Audio/TTS requirements should be checked in production because a larger dictation word bank may create cost or learner-facing playback gaps.

## Recommended status language

`DONE - LIVE VERIFIED`
