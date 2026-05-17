# Validation Summary — Spelling Secure Vocabulary Expansion Handoff

## Verdict

The current Spelling module is mature for the uploaded 246-word runtime snapshot, but the requested expansion to thousands of secure words is not fully implemented and must not be treated as a simple Extra-pool import. The present source still has only two spelling pools, `core` and `extra`; existing mature semantics reserve core/statutory words for key mastery and SATs-style behaviours, while Extra is treated separately. A local taxonomy backbone now exists for `statutory-core`, `secure-extension`, and `enrichment-extra`, but the secure-extension candidate list is not imported or live.

A small high-confidence patch is included for two adjacent problems that become more important at thousands-word scale:

1. The Worker spelling runtime-content cache key used the entire persisted `content_json` string as a `Map` key. That is avoidable memory/key bloat for a large spelling content release.
2. The admin content-quality signal for Spelling read fields that are not present in the current persisted spelling bundle schema, so item coverage could remain `not_available` even when spelling content exists.

The patch does not implement the full vocabulary expansion.

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

This breaks the previous missing-source-list loop. The later owner approval is now ingested into the audited source/review pack through `evidence/secure-extension-import-approval-pipeline-record-2026-05-17.json`, but no live secure-extension content has been imported or deployed.

Post-review owner approval addendum: James subsequently approved secure-extension import and owner-approved generated release-quality fallback fields for all 1217 pinned candidate rows on 2026-05-17. This is recorded in `evidence/secure-extension-import-approval-record-2026-05-17.md` and `.json`, and converted to the pipeline record above. The audited source and review pack now carry the secure-import approval and complete release-quality field coverage.

### Local taxonomy backbone proof

Local evidence under `validation/taxonomy-backbone-local-verification-2026-05-17.md` proves the runtime taxonomy seam now exists:

- Canonical tiers: `statutory-core`, `secure-extension`, `enrichment-extra`.
- Current published runtime counts: `213` statutory-core, `0` secure-extension, `33` enrichment-extra.
- The approved-source aliases `current_statutory_core`, `current_extra`, and `secure_extension_candidate` normalise to the canonical tiers.
- Guardian, Pattern Quest, post-mastery counts, analytics, Word Bank filters, admin read models, Worker read models, and generated spelling data now use tier-aware helpers.
- Secure-extension words remain excluded from statutory Mega/Guardian eligibility unless a later explicit import and release promotes them.

This closes the taxonomy-backbone blocker. It does not import the 1217 secure-extension candidate records, generate their learner-facing sentence/audio coverage, publish a release, deploy, or prove production.

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
- `validation/current-head-completion-audit-2026-05-17.md`: moving-branch completion audit including a prompt-to-artifact checklist, the reviewer-found Word Bank Guardian-chip fix, and the explicit decision that the active goal is not achieved from this state.
- `validation/reviewer-loop-current-head-2026-05-17.md`: latest independent Code Reviewer and Contract Auditor rerun for head `9cc389568c2fc10b9d1d52d12d247bca1e4a7580`; both returned `NOT PASS` for full-contract blockers, while confirming the stale-evidence and Guardian-chip findings are closed.
- `targeted-tests.log`: original B3w run passed 5 tests. The release-readiness addendum reran `node --test tests/spelling-secure-vocabulary-source.test.js tests/secure-vocabulary-release-gates.test.js` after adding release-readiness coverage, and 10 tests passed.
- `content-validate.log`: `npm run content:validate`, `ok: true`, 246 runtime words, 2213 runtime sentences, 0 errors, 6 existing pattern warnings.
- `npm-run-check.log`: `npm run check`, exit `0`; Wrangler dry-run build and client bundle audit passed.

Commands recorded:

- `node scripts/audit-spelling-secure-vocabulary.mjs --source-jsonl D:\tmp\ks2-spelling-b3w-source-artifact-approved-check\source\secure-vocabulary-source-v1.jsonl --approval D:\tmp\ks2-spelling-b3w-source-artifact-approved-check\approval\owner-approval-record.json --out validation/secure-vocabulary-approved-source/audit-report.json`
- `node scripts/import-spelling-secure-vocabulary.mjs --check --source-jsonl D:\tmp\ks2-spelling-b3w-source-artifact-approved-check\source\secure-vocabulary-source-v1.jsonl --approval D:\tmp\ks2-spelling-b3w-source-artifact-approved-check\approval\owner-approval-record.json --out validation/secure-vocabulary-approved-source/import-plan.json`
- `node scripts/build-spelling-secure-vocabulary-review-pack.mjs --source-jsonl D:\tmp\ks2-spelling-b3w-source-artifact-approved-check\source\secure-vocabulary-source-v1.jsonl --approval D:\tmp\ks2-spelling-b3w-source-artifact-approved-check\approval\owner-approval-record.json --out-dir validation/secure-vocabulary-approved-source --json`
- `node scripts/verify-spelling-secure-vocabulary-release.mjs --source validation/secure-vocabulary-approved-source/audited-source.json --review-pack validation/secure-vocabulary-approved-source/review-pack.json --json --out validation/secure-vocabulary-approved-source/release-gate-report.json`
- `node scripts/verify-spelling-secure-vocabulary-release.mjs --release-ready --audited-source validation/secure-vocabulary-approved-source/audited-source.json --review-pack validation/secure-vocabulary-approved-source/review-pack.json --json --out validation/secure-vocabulary-approved-source/release-readiness-report.json`
- `node scripts/summarise-spelling-secure-vocabulary-release-gaps.mjs --audited-source validation/secure-vocabulary-approved-source/audited-source.json --review-pack validation/secure-vocabulary-approved-source/review-pack.json --out validation/secure-vocabulary-approved-source/release-gap-summary.json --md-out validation/secure-vocabulary-approved-source/release-gap-summary.md`
- `node scripts/build-spelling-secure-vocabulary-release-input-template.mjs --audited-source validation/secure-vocabulary-approved-source/audited-source.json --out-dir validation/secure-vocabulary-approved-source/release-input-template --json`
- `node --test tests/spelling-secure-vocabulary-source.test.js tests/secure-vocabulary-release-gates.test.js`
- `npm run content:validate`
- `npm run check`

### GitHub

GitHub was used only as a supplementary exact-file check. Repository `fol2/ks2-mastery` default branch was reported as `main`. Exact file `worker/src/repository.js` at `main` had blob SHA `a20215b8519c99fca4c05922ba1bc0c47c17108f`, matching the ZIP local blob SHA for the same file. This confirms the two patched adjacent issues were also present in fetched GitHub `main` for that file. It does not prove whole-repo identity.

### Local run

Local validation proves only behaviour in this ChatGPT container.

- Local Node: `v18.20.4`
- Repo `.nvmrc`: `22`
- Node 22-only Worker/server checks could not be run faithfully here.

### Production

Production is not proven. `https://ks2.eugnel.uk` was only checked for public reachability at the app shell level, not for this patch, spelling expansion, content release, hard-refresh journey, or admin signal endpoint.

## Current ZIP evidence

### Current spelling content counts

`npm run content:validate` on the ZIP/patch snapshot reported:

- `ok: true`
- `wordListCount: 3`
- `wordCount: 246`
- `sentenceCount: 2213`
- `releaseCount: 5`
- `publishedReleaseId: spelling-r5`
- `publishedVersion: 5`
- `publishedAt: 1777248000000`
- `runtimeWordCount: 246`
- `runtimeSentenceCount: 2213`
- errors: `0`
- warnings: `6`

Current published release coverage split observed from generated/seeded content:

- statutory-core runtime words: `213`
- secure-extension runtime words: `0`
- enrichment-extra runtime words: `33`

This is far below the requested “thousands of new words” coverage level.

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

The current 246-word snapshot already generates substantial source data:

- `content/spelling.seed.json`: 5,590,368 bytes; SHA-256 `c5ccb3ac85758d16b71f681e0c5137b116d15127fbf36a311ec503e536ff5483`
- `src/subjects/spelling/data/content-data.js`: 7,142,568 bytes; SHA-256 `ede692f1e05287954368e2a9d4d6a9983b19b286ccdfd0610f607e770a482b47`
- `src/subjects/spelling/data/word-data.js`: 703,030 bytes; SHA-256 `481d9e9d6f5ebf09894c7f8ee8eadd7dd073e327d32bff46198d91b5784e9998`

A thousands-word expansion needs bundle/runtime capacity evidence.

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
- `npm run content:validate`: passed, `ok: true`, `246` runtime words, `2213` runtime sentences, `0` errors, `6` existing pattern warnings.
- `npm run audit:client`: passed, main bundle gzip `210699 / 232000` bytes.
- `npm run check`: passed, Wrangler dry-run completed successfully.
- Evidence file: `validation/task-b-local-patch-equivalence-2026-05-17.md`.

## Blockers for the full expansion

1. **No live secure-extension import or release yet.** The taxonomy backbone exists locally, but current spelling content still publishes `0` secure-extension runtime words. The 1217 secure-extension candidate records are source-gate ready, but have not been imported into runtime content.

2. **Current content size implies scale risk.** The current 246-word snapshot already produces multi-megabyte generated content data. Thousands of words may need content splitting, lazy loading, Worker-only release reads, or stricter generation boundaries.

3. **Existing pattern warnings remain.** Several registered spelling patterns have below-threshold core coverage. Expansion must improve pattern coverage or explicitly keep those patterns non-launchable.

4. **Full content import and release remain required.** The source list is now pinned, approved for secure-extension import, release-quality complete under James's owner-approved generated fallback policy, mapped into a check-mode import plan, B3w-verified as a reviewer pack, and backed by a local taxonomy seam. The full secure-extension runtime import, generated learner-facing content release, release manifest, CI, deployment, and production verification are still not complete.

5. **Production is not proven.** No live hard-refresh spelling journey, deployed commit/release id, content-quality endpoint evidence, or logs/screenshots were captured.

## Advisories

- `SPELLING_CONTENT_RELEASE_ID` in `src/subjects/spelling/service-contract.js` is still `spelling-p2-baseline-2026-04-26` while current content validation reports published release `spelling-r5` / version 5. This may be deliberate because the post-Mega/sticky-graduation contract separates service-state content release semantics from content publication, but the expansion must re-audit and document release-id semantics before changing secure coverage.
- Any secure-extension release must avoid telling existing Mega learners that their achievement was lost simply because new words were added.
- Audio/TTS requirements should be decided before importing thousands of dictation words, otherwise release may create cost or learner-facing playback gaps.

## Recommended local-agent status language

Until live verification is complete, final status must be:

`SOURCE LIST APPROVED - RUNTIME IMPORT/RELEASE REQUIRED`

or, after local import/reviewer-pack verification:

`IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`

or, after the taxonomy-backbone implementation:

`TAXONOMY BACKBONE IMPLEMENTED + LOCAL VERIFIED — SECURE IMPORT/PRODUCTION NOT PROVEN`

or, before implementation:

`CONTRACTED + PATCH PREPARED — PRODUCTION NOT PROVEN`
