# Local Codex Agent Execution Contract — Refresh, Backoff, and Live-Update Hardening

## Title and purpose

Refresh / server-event hardening for KS2 Mastery. The goal is to make ordinary learner behaviour — repeated F5, double-clicking Start Demo, refreshing during temporary Worker/D1 pressure, and using the app across a deploy — graceful and barely noticeable for children. This is not a DDoS bypass. Server protection remains in place, but friendly clients must back off, reuse cached state, and surface safe update recovery without making children feel blocked.

## Source authority

Primary source authority: uploaded ZIP snapshot `ks2-mastery-lean-05161145.zip`.

ZIP SHA-256: `2eadb98eca14a740a7a67cf54b00f14ef5acca1a8cb9509bb774a7d0c8db00c2`.

ZIP facts: review-profile lean ZIP, rootless archive, no `.git` metadata, `reports/**`, `assets/**`, `output/**`, and planning packs omitted by manifest. Node target is `.nvmrc` `22`; local validation used Node `v22.16.0` and npm `10.9.2`.

GitHub supplement: `fol2/ks2-mastery`, default branch `main`. GitHub was used only as exact-file/ref supplement. The ZIP copies of `src/platform/core/repositories/api.js` and `worker/src/errors.js` were byte-identical to GitHub `main` for the fetched file blobs:

- `src/platform/core/repositories/api.js`: ZIP/GitHub git blob SHA `8b3a3cfc6e6852cc34e29d334e0ab2a805f1e08c`.
- `worker/src/errors.js`: ZIP/GitHub git blob SHA `3326628ecea0f659626d1db22514cb7a675d2d46`.

Recent GitHub `main` commit search result observed in this session: `c6b003fbf452367765ad677c66f5d6eb68958dbb` (`2026-04-30T13:08:12+01:00`). Do not treat that as the ZIP commit unless you independently prove repository ancestry; this lean ZIP has no `.git` metadata.

Authoritative for implementation in this task: the local repository snapshot the agent is applying to. If it differs from this ZIP or from GitHub `main`, record the divergence before editing.

Production authority: only live evidence from `https://ks2.eugnel.uk`. This package does not prove production.

## Patch root and apply assumptions

Patch root: repository root / rootless lean-ZIP extraction root, where `package.json`, `src/`, `worker/`, and `tests/` are direct children.

Patch file included: `patches/001-refresh-rate-limit-retry-after-hardening.patch`.

Dry-run/apply commands:

```bash
patch --dry-run -p1 < patches/001-refresh-rate-limit-retry-after-hardening.patch
patch -p1 < patches/001-refresh-rate-limit-retry-after-hardening.patch
```

The patch modifies only:

- `src/platform/core/repositories/api.js`
- `worker/src/errors.js`
- `tests/persistence.test.js`
- `tests/worker-rate-limit-ipv6-propagation.test.js`

## Scope

In scope:

1. Treat `/api/bootstrap` 429 / Retry-After as a retryable graceful-degradation path when a usable cache exists.
2. Persist bootstrap backoff across immediate reloads so repeated F5 does not keep hammering the Worker.
3. Preserve the existing cached-state fallback: if the learner has usable local/cache state, they continue using that state while the client waits for the next retry window.
4. Surface `Retry-After` headers for existing `HttpError` rate-limit responses that already include `retryAfterSeconds` in the payload.
5. Add client-side idempotence / in-flight guard for demo start and any other learner-facing start/retry action that can fire concurrent duplicate requests before a cookie/redirect/state transition lands.
6. Add deploy-update detection that avoids relying on hard refresh: a small build/version endpoint or manifest and a client check on focus/visibility/idle/safe navigation points.
7. Preserve current server protections, rate-limit budgets, mutation receipts, cache scopes, auth/session boundaries, and subject command authority.

## Non-goals

Do not remove rate limiting. Do not widen rate-limit budgets as the first fix. Do not make all 429s disappear. Do not introduce background polling that meaningfully increases load. Do not rewrite the persistence engine. Do not turn deploy updates into forced reloads during answer submission or pending writes. Do not change learning/reward systems.

## No-go areas

Do not touch reward, mastery, Stars, Mega semantics, Hero Mode, monsters, subject progression, subject schedulers, question generators, answer marking, production Cloudflare config, D1 migrations, or content releases unless a directly task-caused regression forces it and the final evidence explains why.

Do not mark the task `DONE` unless it is live and verified on `https://ks2.eugnel.uk` under the production wording below.

## Files / areas likely to change

Likely direct areas:

- `src/platform/core/repositories/api.js`
- `worker/src/errors.js`
- `src/main.js`
- `src/platform/react/chunk-load-recovery.js`
- `src/platform/react/ErrorBoundary.jsx`
- `worker/src/app.js`
- `worker/src/security-headers.js`
- `scripts/build-client.mjs`
- `scripts/build-public.mjs`
- `tests/persistence.test.js`
- `tests/worker-rate-limit-ipv6-propagation.test.js`
- `tests/error-boundary-chunk-load.test.js`
- `tests/playwright/chaos-http-boundary.playwright.test.mjs`
- new focused tests for build/version/update detection if implemented

## Exact implementation tasks

### A. Apply and validate the included low-risk patch

Apply `patches/001-refresh-rate-limit-retry-after-hardening.patch` unless the current branch already contains equivalent code. If already present, prove equivalence with source snippets and tests rather than reapplying.

The patch does four things:

1. Parses HTTP `Retry-After` and JSON `retryAfterSeconds` from repository responses.
2. Classifies HTTP 429 as retryable for repository persistence.
3. Treats `/api/bootstrap` 429 as a bootstrap-backoff signal, using the server-provided `Retry-After` value where available and capping it at the existing `BOOTSTRAP_BACKOFF_MAX_MS`.
4. Adds a shared `Retry-After` header on `HttpError` responses that already carry `retryAfterSeconds`.

### B. Add demo-start duplicate-request guard

Add a minimal in-flight guard around `startDemoSession()` in `src/main.js` so rapid double-clicks cannot dispatch multiple concurrent `POST /api/demo/session` requests before the first redirect/cookie lands. The guard must reset on failure so the learner can retry. It must not block a later legitimate new demo start after an error.

Suggested shape:

- module-level `let demoStartInFlight = false`;
- if already true, return the existing promise or no-op safely;
- set true before request;
- clear only on catch/failure path;
- leave true during successful redirect.

Add a focused test if an auth/demo surface harness already exists; otherwise add a small unit/integration test around the handler or document why the existing harness is not practical.

### C. Convert rate-limit statuses where safe

Audit rate-limit call sites that currently throw `BadRequestError` with `retryAfterSeconds` and codes such as `demo_rate_limited`, `auth_rate_limited`, or `tts_rate_limited`. Prefer a dedicated `RateLimitedError` subclass with HTTP 429 where this will not break existing clients. If a status change is risky, keep the compatibility status for now but still emit `Retry-After` and document the follow-up.

Do not silently change auth/security semantics. Add tests for every changed call site.

### D. Implement update-without-hard-refresh UX

The current ZIP has chunk-load recovery and no-store app entry handling, but it still relies on the user hitting a chunk-load failure or manually reloading. Implement a lightweight update detector:

1. Server/build side exposes a tiny current build identifier via either `/api/version`, `/api/build`, or a static build manifest served with `no-store`.
2. Identifier should use the existing `__BUILD_HASH__` / build hash machinery where possible. If `.git` is unavailable, the endpoint must still return a stable explicit fallback such as `null` plus timestamp/source, not random per request.
3. Client records the loaded build id and checks on safe points: app start, browser focus, visibility change from hidden to visible, and after returning to shell/landing from a completed subject session.
4. When a new build is detected, reload only when it is safe: no active answer submission, no pending local writes, no active modal/input that would lose child work. Otherwise show a friendly banner: “An update is ready. Finish this question, then refresh safely.”
5. Use `location.reload()` as a soft reload; do not require hard refresh. Add cache headers so the stable entry and manifest/version endpoint are refetched.
6. Keep the existing chunk-load one-shot recovery as a fallback.

### E. Add chaos/regression coverage for repeated refresh

Extend browser-level or repository-level chaos tests to cover repeated refresh with:

- cached bootstrap available;
- `/api/bootstrap` returning 429 plus `Retry-After`;
- repeated app reloads during the retry window;
- assertion that only one failed bootstrap request is made during the window and the shell remains usable/degraded rather than blocked.

Also add a Playwright or worker test for the demo double-click path if practical.

### F. Preserve learner-facing tone

Any new banners/copy must be calm and child-friendly. Avoid “blocked”, “rate limited”, “too many requests”, “server error”, or blame language in learner surfaces. Developer/admin logs can use precise technical labels.

## Previous-work validation tasks

Validate and record what is genuinely already present:

- Shared `consumeRateLimit` helper and IPv6 `/64` bucketing exist.
- `rateLimitResponse()` emits HTTP 429 plus `Retry-After` where that helper is used.
- Existing bootstrap 503 / CPU-limit backoff with usable cache exists and persists across reload.
- Multi-tab bootstrap coordination/backoff tests exist.
- Stable `app.bundle.js` is served `no-store`; split chunks are content-hashed/immutable.
- Chunk-load recovery reloads once and has a reload CTA fallback.

Validate and record what is incomplete or overclaimed:

- `/api/bootstrap` 429 was not previously treated as a persistent backoff signal.
- `HttpError` rate-limit-style payloads with `retryAfterSeconds` did not previously emit `Retry-After` unless the call site used `rateLimitResponse()` directly.
- Start Demo had no obvious in-flight guard in `src/main.js`.
- Deploy recovery was chunk-error-driven, not proactive update detection; users could still need manual reload/hard refresh after a background deploy.
- Lean ZIP omitted `reports/**` and planning packs, so full release-evidence gates and some full tests cannot be certified from this ZIP alone.

## Acceptance criteria

Local acceptance:

- `RepositoryHttpError` captures `Retry-After`/`retryAfterSeconds`.
- Repository persistence classifies HTTP 429 as retryable.
- `/api/bootstrap` 429 with usable cache degrades once and persists backoff across reloads.
- Backoff honours server `Retry-After` and caps it at the existing bootstrap max.
- During bootstrap backoff, repeated hydrate/reload does not send more bootstrap requests until the retry window expires.
- Existing 503 bootstrap backoff behaviour remains unchanged.
- Existing rate-limit helper tests still pass.
- Existing `HttpError` rate-limit payloads surface a `Retry-After` header.
- Start Demo rapid double-click/concurrent call path dispatches at most one create request.
- Update detection can detect a new build and soft-reload/show a safe banner without losing in-progress work.
- No reward/mastery/Stars/Hero/monster/subject progression files are touched.

Production acceptance:

- Live `https://ks2.eugnel.uk` hard-refresh check passes.
- Live app can be opened, Start Demo can be attempted/used, and learner shell remains usable.
- Live repeated-refresh scenario does not produce a child-visible block under normal use.
- Live deploy/update check proves the latest bundle/version can be picked up without telling the user to hard refresh.

## Required commands / tests / audits

Run from repository root after applying changes:

```bash
node --version
npm --version
npm ci
node --check src/platform/core/repositories/api.js
node --check worker/src/errors.js
node --test --test-name-pattern "bootstrap (429|503)" tests/persistence.test.js
node --test tests/worker-rate-limit-ipv6-propagation.test.js
node --test tests/error-boundary-chunk-load.test.js
npm run build
npm run assert:build-public
npm run audit:client
```

If you add an update detector, add and run its focused tests. If Playwright is available:

```bash
npm run test:playwright -- tests/playwright/chaos-http-boundary.playwright.test.mjs
```

If full `node --test tests/persistence.test.js` fails because generated `reports/**` are missing from a lean ZIP, record that as a lean-ZIP limitation and re-run in a full checkout or with the exact omitted report paths restored. Do not hide the failure.

## Regression checks

- `tests/persistence.test.js` focused bootstrap 503 and 429 tests pass.
- `tests/worker-rate-limit-ipv6-propagation.test.js` passes.
- Existing 401/403/409/stale-write paths are not reclassified incorrectly.
- Cache fallback is scoped by auth/session and does not leak between accounts.
- Two tabs do not both become bootstrap leaders during retry/backoff.
- Demo session reuse still works when a valid demo cookie exists.
- Demo/session rate limiting still protects no-cookie repeated creation.
- TTS/auth rate-limit responses keep their expected payload codes.
- CSP/security headers still pass, especially cache headers for stable entry, chunks, and any new version endpoint/manifest.
- Update banner does not appear repeatedly or force reload during answer submission.
- No bundle-size or client audit regression.

## Production deployment and verification requirement for `ks2.eugnel.uk`

Production wording is mandatory:

- `DONE` is forbidden unless the change is live and verified on `ks2.eugnel.uk`.
- `DEPLOYMENT READY` means all local/CI/reviewer checks pass and the change can be directly deployed, but it is not the same as live proof.
- `DONE — LIVE VERIFIED` means the change is deployed or already present on `ks2.eugnel.uk`, verified after a hard refresh, and usable on the live site.
- If production cannot be checked, final status must be `IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`, not done.

Live evidence must include:

- URL/origin: `https://ks2.eugnel.uk`
- timestamp
- release/version/commit/build identifier where available
- deployment command or deployment source if applicable
- hard-refresh/browser check performed
- specific user journey checked
- pass/fail result
- logs/screenshots/console/network notes where relevant

Minimum live journeys:

1. Hard refresh `https://ks2.eugnel.uk` and confirm the app bootstraps.
2. Start Demo or authenticated learner journey, then press refresh repeatedly in normal intervals and confirm no child-visible block.
3. Force or observe build/version mismatch in staging/production-safe way and confirm soft reload/update banner path works.
4. Confirm no console/network flood, no repeated `/api/bootstrap` busy-loop, and no lost learner work.

## Required final evidence

The local agent’s final report must include:

- source authority and exact ref/snapshot used;
- patch or commit SHA;
- files changed;
- command list with pass/fail and logs;
- before/after explanation for 429 bootstrap backoff;
- before/after explanation for `Retry-After` headers;
- demo duplicate-request evidence;
- update detector evidence;
- production evidence, or the exact status `IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`;
- reviewer loop results.

## Reviewer loop requirement

After implementation, run two independent review passes:

1. Code Reviewer.
2. Contract Auditor.

Both reviewers must return exactly:

`PASS — no blockers, no advisories, findings=[]`

Anything else fails the review. Blockers, advisories, “good to have” comments, uncertainties, weak evidence, overclaims, and task-related regressions must be fixed. Repeat implementation, validation, and both reviewer passes until both reviewers return the exact PASS line.
