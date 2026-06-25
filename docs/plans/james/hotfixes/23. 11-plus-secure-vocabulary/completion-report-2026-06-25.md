# 11 Plus Secure Vocabulary Completion Report

Status: implementation, local verification, commit, and GitHub push complete; production deployment is blocked by missing Cloudflare authentication in this Codex environment.

## Scope

- Added James's supplied 11+ vocabulary source ledger for 300 words and meanings.
- Imported the vocabulary into English Spelling Secure vocabulary without changing Extra vocabulary placement.
- Preserved existing statutory-core and secure-extension words while aligning their 11+ meanings and provenance.
- Fixed the related content-operation snapshot storage risk that appeared once the larger spelling bundle exceeded the D1 inline row budget under gzip.

## Source Ledger

- Source text: `/Users/nelsonto/.codex/attachments/0c412cd5-cd3f-419a-baae-02eae8b8fe57/pasted-text.txt`
- Source text SHA-256: `a5e0e6117ee764c859504429707875f5b132697c84f47d56604cc22320952b75`
- Source words SHA-256: `a40f3e29cd899e2503e0ccd700dcd278c5272d7dc33b3f54c494a19b2ec7897d`
- Source JSON: `content/spelling-11-plus-secure-vocabulary-2026-06-25.json`
- Import manifest: `docs/plans/james/hotfixes/23. 11-plus-secure-vocabulary/validation/11-plus-secure-vocabulary-import-manifest.json`

The importer now verifies the exact supplied date, exact attachment path, exact source text hash, exact parsed word ledger hash, source approval status, per-word approval status, safety status, UK spelling decision, accepted spelling, year band, family root, and morphology tags before import.

## Import Outcome

- Source words: 300
- New secure-extension words: 224
- New secure-extension sentence entries: 224
- New secure-extension lists: 15
- Existing words aligned: 76
- Existing secure-extension alignments: 56
- Existing statutory-core alignments: 20
- Enrichment-extra collisions: 0
- Published spelling release: `spelling-r9`
- Published version: 9
- Runtime words: 1704
- Runtime secure-extension words: 1439
- Runtime statutory-core words: 213
- Runtime enrichment-extra words: 52

## 503 Prevention

The full spelling bundle exposed a storage-size failure in content-operation release snapshots. The snapshot codec now writes Brotli-base64 snapshots when available and still reads legacy gzip-base64 snapshots. The seed/migration reporting records the actual snapshot encoding, and regression tests prove Brotli output remains below the D1 inline row threshold while legacy gzip remains readable.

## Verification Evidence

- `pnpm run test`: pass 111938, fail 0, skipped 8.
- Pre-push `pnpm run test`: pass 111939, fail 0, skipped 8.
- Affected suite after reviewer fixes: pass 67, fail 0.
- `node --test tests/spelling-content.test.js` after exact source gate: pass 20, fail 0.
- `node scripts/apply-spelling-11-plus-secure-vocabulary.mjs --check --json`: passed; current run no-op; initial import evidence records 224 new and 76 existing.
- `node scripts/validate-spelling-content.mjs`: `ok: true`; existing warning count 7.
- `pnpm run check`: passed via `scripts/wrangler-oauth.mjs deploy --dry-run`; client bundle audit passed.

## Reviewer Loop

- First code review: failed on unrelated generated report noise and misleading manifest evidence.
- First contract audit: failed on existing-word provenance, importer no-op mutation, source validation, manifest evidence, and unrelated generated report noise.
- Fixes applied: provenance added for all 300 source words; importer no-op made stable; manifest now records initial import outcome; unrelated generated report/build-version files reverted; source validation now cryptographically ties the JSON ledger to James's pasted source.
- Final reviewer sign-off: blocked until the production deployment blocker is resolved.

## Deployment Evidence

- Deployment command attempted: `pnpm run deploy` through the package script.
- Build and client audit phase passed.
- Cloudflare deploy phase failed before publishing because Wrangler reported no non-interactive authentication.
- Environment check after failure: `CLOUDFLARE_API_TOKEN`, `CF_API_TOKEN`, and `CLOUDFLARE_ACCOUNT_ID` are missing.
- No raw Wrangler deploy or token-dependent workaround was used.

Required unblock: log in Cloudflare Wrangler OAuth on this machine, or provide authorised CI environment variables, then rerun `npm run deploy` / `pnpm run deploy` through the existing package script.

## Git Evidence

- Branch: `codex/11-plus-secure-vocabulary`
- Commit: `c4e8d282 Add James's 11 plus secure vocabulary`
- Push: `origin/codex/11-plus-secure-vocabulary`
