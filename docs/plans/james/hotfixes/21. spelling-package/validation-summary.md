# Validation Summary — Spelling Secure Vocabulary Expansion Handoff

## Verdict

The current Spelling module is mature for the uploaded 246-word runtime snapshot, but the requested expansion to thousands of secure words is not already implemented and must not be treated as a simple Extra-pool import. The present source has only two spelling pools, `core` and `extra`; existing mature semantics reserve core/statutory words for key mastery and SATs-style behaviours, while Extra is treated separately. A secure-vocabulary expansion needs a new explicit coverage taxonomy and release pipeline.

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
- Approval decision: `APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY`
- Reviewer: `James`
- Review timestamp: `2026-05-17T12:15:41+01:00`

This breaks the previous missing-source-list loop. It does not approve live secure-extension promotion or prove production deployment.

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

Current published release pool split observed from generated/seeded content:

- core/statutory runtime words: `213`
- extra runtime words: `33`

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

Not fully run in this environment:

- The new Worker endpoint test/probe failed to load under local Node 18 because `node:sqlite` is unavailable. This is an environment limitation, not proof that the patch fails. The local agent must run it under Node 22.

## Blockers for the full expansion

1. **No secure-extension taxonomy yet.** Current spelling content supports only `core` and `extra`. Existing mature behaviours distinguish Extra from core. Thousands of “need to be secured” words need a separate taxonomy rather than being forced into either current pool.

2. **Current content size implies scale risk.** The current 246-word snapshot already produces multi-megabyte generated content data. Thousands of words may need content splitting, lazy loading, Worker-only release reads, or stricter generation boundaries.

3. **Existing pattern warnings remain.** Several registered spelling patterns have below-threshold core coverage. Expansion must improve pattern coverage or explicitly keep those patterns non-launchable.

4. **Import/reviewer-pack proof is still required.** The source list is now pinned and approved for import/reviewer-pack generation only. The next local agent must generate import proof and reviewer-pack proof against the exact JSONL hash before any release gate can pass.

5. **Production is not proven.** No live hard-refresh spelling journey, deployed commit/release id, content-quality endpoint evidence, or logs/screenshots were captured.

## Advisories

- `SPELLING_CONTENT_RELEASE_ID` in `src/subjects/spelling/service-contract.js` is still `spelling-p2-baseline-2026-04-26` while current content validation reports published release `spelling-r5` / version 5. This may be deliberate because the post-Mega/sticky-graduation contract separates service-state content release semantics from content publication, but the expansion must re-audit and document release-id semantics before changing secure coverage.
- Any secure-extension release must avoid telling existing Mega learners that their achievement was lost simply because new words were added.
- Audio/TTS requirements should be decided before importing thousands of dictation words, otherwise release may create cost or learner-facing playback gaps.

## Recommended local-agent status language

Until live verification is complete, final status must be:

`SOURCE LIST APPROVED - IMPORT/REVIEWER PACK REQUIRED`

or, after local import/reviewer-pack verification:

`IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`

or, before implementation:

`CONTRACTED + PATCH PREPARED — PRODUCTION NOT PROVEN`
