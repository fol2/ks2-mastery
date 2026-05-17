# Validation Summary — Refresh / Server-Event Hardening Package

## Snapshot inspected

Primary ZIP: `/mnt/data/ks2-mastery-lean-05161145.zip`

SHA-256: `2eadb98eca14a740a7a67cf54b00f14ef5acca1a8cb9509bb774a7d0c8db00c2`

ZIP integrity: `unzip -t` reported no errors.

Archive shape: rootless lean review ZIP. No `.git` metadata. Manifest profile is `review`, mode `omit`; `reports/**`, `assets/**`, `output/**`, and planning packs are intentionally omitted.

GitHub supplement: exact-file supplement only. `src/platform/core/repositories/api.js` and `worker/src/errors.js` in the ZIP matched GitHub `main` byte-for-byte for the fetched blob SHAs.

Production: not checked and not proven. The patch is not live.

## Main findings

1. Original client bootstrap backoff handled 503 / CPU-limit style failures but not HTTP 429. A repeated refresh during a bootstrap 429 could degrade to cached state but would not persist the retry window, so a reloaded client could keep hitting `/api/bootstrap`.

2. Original `RepositoryHttpError` and `classifyError()` did not treat 429 as retryable. This is too harsh for normal temporary server protection.

3. The worker already had a `rateLimitResponse()` helper that emits `Retry-After`, but generic `HttpError` responses did not add `Retry-After` when their JSON payload already included `retryAfterSeconds`. Demo/auth/TTS-style rate-limit errors therefore had weaker backoff signalling unless they used the helper directly.

4. `src/main.js::startDemoSession()` had no visible in-flight guard, so rapid double-clicks could send multiple `POST /api/demo/session` requests before redirect/cookie completion.

5. Deploy recovery is partially implemented: stable entry is no-store, chunks are content-hashed, and chunk-load failures reload once. There is no proactive build/version check that lets the app update without waiting for a child to hit a lazy-chunk failure or manually hard refresh.

## Patch produced

Patch: `patches/001-refresh-rate-limit-retry-after-hardening.patch`

Files changed by patch:

- `src/platform/core/repositories/api.js`
- `worker/src/errors.js`
- `tests/persistence.test.js`
- `tests/worker-rate-limit-ipv6-propagation.test.js`

Patch behaviour:

- parses `Retry-After` header and JSON `retryAfterSeconds`;
- stores `retryAfterSeconds` on `RepositoryHttpError`;
- classifies HTTP 429 as retryable;
- treats `/api/bootstrap` 429 as a bootstrap-backoff error;
- uses server-provided retry-after delay for bootstrap backoff, capped by existing max;
- surfaces `Retry-After` header on `HttpError` responses when `retryAfterSeconds` is present;
- adds tests for bootstrap 429 persisted reload backoff and demo rate-limit `Retry-After` header propagation.

## Commands run

```bash
npm ci --ignore-scripts --prefer-offline
node --check src/platform/core/repositories/api.js
node --check worker/src/errors.js
node --test --test-name-pattern "bootstrap (429|503)" tests/persistence.test.js
node --test tests/worker-rate-limit-ipv6-propagation.test.js
patch --dry-run -p1 < patches/001-refresh-rate-limit-retry-after-hardening.patch
patch -p1 < patches/001-refresh-rate-limit-retry-after-hardening.patch
```

## Results

- `npm ci --ignore-scripts --prefer-offline`: pass, 87 packages installed, 0 vulnerabilities.
- `node --check src/platform/core/repositories/api.js`: pass.
- `node --check worker/src/errors.js`: pass.
- Focused persistence tests: pass, 2/2.
  - `bootstrap 503 with a usable cache...`: pass.
  - `bootstrap 429 Retry-After with a usable cache...`: pass.
- `tests/worker-rate-limit-ipv6-propagation.test.js`: pass, 10/10.
- Patch dry-run against a fresh extraction: pass.
- Patch apply against a fresh extraction: pass.

## Full-test limitation encountered

`node --test tests/persistence.test.js` ran 21 subtests; 19 passed and 2 failed because the lean ZIP omits `reports/**` and the full test file imports an app harness that builds `src/surfaces/hubs/AdminVisualEngineSection.jsx`, which imports `../../../reports/ui-refactor/ui-refactor-p4-production-visual-evidence-2026-05-01.json`. That report file is intentionally outside the review ZIP profile. The new bootstrap 429 test itself passed.

This is a lean-ZIP validation boundary, not proof that the product is broken. The local agent must re-run the full test in a full checkout or include the omitted report path if full-file proof is required.

## Status

Patch status: generated, dry-run/apply verified against the ZIP snapshot, focused local tests passed.

Overall status: `DEPLOYMENT READY` only for the patch subset after the local agent reruns required checks in its authoritative checkout. The broader update-without-hard-refresh work remains to be implemented by the local agent.

Production status: not proven.
