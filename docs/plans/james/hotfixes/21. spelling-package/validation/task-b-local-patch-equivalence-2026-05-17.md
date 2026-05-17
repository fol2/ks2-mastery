# Task B Local Patch-Equivalence Evidence - 2026-05-17

## Scope

This evidence records the local Codex implementation of Task B from the Spelling Secure Vocabulary Expansion contract.

Task B requires patch-equivalent fixes for:

- the Worker spelling runtime-content cache key, so the full persisted `content_json` string is not used as the `Map` key;
- the admin content-quality Spelling item coverage signal, so it derives from the persisted runtime snapshot/summary rather than nonexistent bundle fields.

This is a narrow hardening fix. It does not import or publish secure-extension vocabulary.

## Implementation

Files changed:

- `worker/src/repository.js`
- `tests/spelling-content-api.test.js`

Implementation details:

- `spellingRuntimeContentRowKey()` now builds a bounded key from `row`, `subjectId`, `updated_at`, content length, and deterministic `stableHash(contentJson)`.
- `/api/admin/ops/content-quality-signals` now parses the persisted spelling content through `contentRowToBundle()`, derives the runtime snapshot through `runtimeSnapshotForBundle()`, and derives counts through `runtimeContentSummary()`.
- The regression test publishes a test content release with one extra word, calls the admin content-quality endpoint, and asserts that item coverage totals match the persisted runtime snapshot.
- A cache-key tripwire asserts that `worker/src/repository.js` no longer returns `row.content_json` directly as the runtime cache key.

## Environment

- Node: `v22.15.1`
- Worktree: `.worktrees/spelling-package-b3w-completion`
- Branch: `codex/spelling-package-b3w-completion`

## Validation

Commands run locally:

- `node --test tests\spelling-content-api.test.js`
  - Result: pass
  - Tests: `12`
  - Failures: `0`
- `node --test tests\worker-hubs.test.js`
  - Result: pass
  - Tests: `7`
  - Failures: `0`
- `npm run content:validate`
  - Result: pass
  - `ok: true`
  - Runtime words: `246`
  - Runtime sentences: `2213`
  - Errors: `0`
  - Existing pattern warnings: `6`
- `npm run audit:client`
  - Result: pass
  - Main bundle gzip: `210699 / 232000` bytes
- `npm run check`
  - Result: pass
  - Wrangler dry-run completed successfully

## Remaining Limitations

- Production was not deployed or hard-refresh verified for this Task B fix in this evidence pass.
- The approved source list remains approved for import/reviewer-pack generation only, not live secure-extension promotion.
- The full secure-extension taxonomy, import, runtime UI semantics, release manifest, audio/TTS validation, reviewer loop, deployment, and production proof are still not complete.
