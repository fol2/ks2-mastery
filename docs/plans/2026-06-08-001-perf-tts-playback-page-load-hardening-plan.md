---
title: "perf: TTS Playback, Page-Load, and UX Hardening"
type: perf
status: active
date: 2026-06-08
---

# perf: TTS Playback, Page-Load, and UX Hardening

## Summary

Optimise the real Spelling play path after the TTS cache follow-up branch has been deployed to production. The work must align the code path with the production branch, make the actual browser playback path primary-backed instead of indefinitely reading legacy R2 objects, keep production probes redacted, reduce eager hero-image preload pressure, and add bounded client-side request timeouts so learners do not get stuck in long pending states.

## Problem Frame

Production currently reports build hash `93b7b95c`, which exists on `codex/tts-cache-r2-opt` rather than `main`. A future deploy from `main` would risk rolling back the TTS cache probe and redaction fixes unless this branch remains the source of truth for the follow-up work and PR reconciliation.

Direct `/api/tts` probes now show primary cache hits for selected sentence samples, but the real in-app replay path still shows `x-ks2-tts-cache-source: legacy` with browser play-start around 414-625 ms. The likely cause is semantic overlap: the browser cache-hit fast path sends `cacheLookupOnly: true`, while the Worker disables legacy-to-primary migration for lookup-only requests. That is correct for diagnostics, but wrong for playback if it means real learners keep reading legacy cache forever.

The live play path also eagerly probes multiple 1280 WebP hero backgrounds and core fetch clients have retries but no explicit browser-side timeout. Both are meaningful user-experience risks: they add avoidable page-load work and can leave gameplay controls pending for too long when the network hangs.

## Requirements

### Release Alignment

- R1. Continue implementation from `codex/tts-cache-r2-opt`, the branch whose HEAD matches the currently deployed production hash.
- R2. Preserve and extend the existing production probe, smoke, bundle audit, and redaction fixes from that branch.
- R3. Do not deploy or commit from the dirty `main` checkout.

### TTS Playback Cache

- R4. Real browser playback cache-hit requests must be allowed to migrate a legacy R2 hit into the primary R2 key after the request has passed normal audio authorisation and limiter checks.
- R5. Diagnostic lookup-only requests must remain read-only and must not call providers or write R2.
- R6. Existing TTS cache headers, status codes, prompt-token validation, cross-account content-key invariants, demo limits, and safe `Server-Timing` output must remain unchanged except for the expected cache source moving to primary after migration.
- R7. Browser play-start telemetry must keep measuring actual `audio.play()` fulfilment, not just response receipt.

### Probe Redaction

- R8. Production TTS/performance probes must not persist cookies, prompt tokens, account ids, learner ids, R2 object keys, raw prompt text, or raw audio bodies.
- R9. Tests must fail if a probe output reintroduces sensitive fields.

### Page-Load Optimisation

- R10. Spelling hero image preloading must eagerly load only the active/likely-next background needed for a smooth transition.
- R11. Speculative hero backgrounds must be deferred until idle time or otherwise bounded so entering Spelling setup does not immediately fan out across many 1280 WebP images.
- R12. Existing contrast/luminance behaviour must remain safe when speculative preload is delayed.

### Gameplay UX Hardening

- R13. Subject command, read-model, and repository fetch paths must have bounded client-side timeouts with `AbortController` when available.
- R14. Timeout errors must surface through existing network-error/degraded-flow handling rather than introducing unhandled rejections.
- R15. Existing retry, stale-write refresh, replay-refresh, submit-lock, and circuit-breaker behaviours must continue to work.

### Maintainability

- R16. Refactor only where it directly supports the optimisation or hardening above.
- R17. Avoid a broad `worker/src/repository.js` or `worker/src/app.js` rewrite in this slice; use the existing query-budget and smoke tests as the guard for later structural refactors.

## Scope Boundaries

- No R2 public bucket, custom-domain audio URL, unauthenticated audio serving, or Workers Cache API layer in this slice.
- No Smart Placement, D1 Sessions, or Worker placement change without a separate canary plan and before/after measurement.
- No destructive production D1 cleanup or schema migration.
- No broad subject runtime rewrite.
- No weakening of prompt tokens, auth checks, demo guards, CSP, production audit, or Cloudflare OAuth-safe package scripts.

## Key Technical Decisions

- KTD1. Build on the production-equivalent feature branch first. Reconciliation into `main` is handled by PR update/merge, not by editing the dirty `main` worktree.
- KTD2. Split diagnostic lookup from playback lookup. `cacheLookupOnly` remains diagnostic/read-only; playback cache requests get an explicit migration-eligible mode or equivalent server-side distinction.
- KTD3. Migrate only after authorisation and limiter checks. A legacy hit can be copied to primary only on an authenticated playback path that is already allowed to serve audio.
- KTD4. Optimise hero preload by reducing eagerness, not by removing the visual system. The active background remains reliable; broad speculative loads move behind idle scheduling.
- KTD5. Add timeouts at shared client fetch boundaries so subject-specific code benefits without duplicating timeout logic.
- KTD6. Treat maintainability as guardrails in this slice. The next broad refactor should follow after the hot path is measured primary-backed and stable.

## Implementation Units

### U1. Branch and release alignment guard

- **Goal:** Ensure the work continues from the production-equivalent TTS branch and cannot be confused with the dirty `main` checkout.
- **Requirements:** R1, R2, R3
- **Files:**
  - Modify: `docs/plans/2026-06-08-001-perf-tts-playback-page-load-hardening-plan.md`
  - Modify or create only if needed: `docs/residual-review-findings/*`
- **Patterns to follow:** Existing `docs/plans/2026-06-07-002-perf-tts-cache-followup-plan.md` and PR branch workflow.
- **Test scenarios:**
  - Verify `/api/version` production hash still maps to the current feature branch before implementation.
  - Verify the working tree is clean before code edits.
- **Verification:** `git status --short --branch` shows work on `codex/tts-cache-r2-opt` or a branch derived from it; no edits are made in the dirty `main` worktree.

### U2. TTS playback migration semantics

- **Goal:** Let real playback cache hits migrate legacy audio to the primary R2 key while preserving read-only diagnostics.
- **Requirements:** R4, R5, R6, R7
- **Files:**
  - Modify: `src/subjects/spelling/tts.js`
  - Modify: `worker/src/tts.js`
  - Modify: `tests/spelling-tts.test.js`
  - Modify: `tests/worker-tts.test.js`
  - Modify if needed: `scripts/production-performance-probe.mjs`
- **Patterns to follow:** `speakWithCachedBufferedAudio` in `src/subjects/spelling/tts.js`, `readBufferedGeminiAudio` and legacy migration tests in `worker/src/tts.js` / `tests/worker-tts.test.js`.
- **Approach:** Introduce a distinct playback cache flag, or equivalent Worker-side option, that keeps provider calls disabled but allows legacy-to-primary copy after full audio request protection. Keep `cacheLookupOnly` read-only for diagnostics. Browser playback should send the migration-eligible mode; production probes that intentionally test read-only lookup should keep using diagnostic lookup.
- **Test scenarios:**
  - Happy path: playback cache request finds legacy audio, returns `200 hit legacy` on that response, writes the primary copy, and a later playback request hits `primary`.
  - Diagnostic path: `cacheLookupOnly` legacy hit returns the legacy audio without writing a primary copy.
  - Error path: failed migration write still serves the legacy hit and logs only redacted metadata.
  - Client path: cached playback telemetry still records `playStartMs` after `audio.play()` resolves.
- **Verification:** `node --test tests/worker-tts.test.js tests/spelling-tts.test.js` passes; production browser probe after deploy shows the replay path moving to `source=primary` after migration.

### U3. Probe redaction regression lock

- **Goal:** Prevent production probe outputs from leaking sensitive TTS/session material.
- **Requirements:** R8, R9
- **Files:**
  - Modify: `scripts/spelling-audio-production-smoke.mjs`
  - Modify: `scripts/production-performance-probe.mjs`
  - Modify: `tests/spelling-audio-production-smoke.test.js`
  - Modify: `tests/production-performance-probe.test.js`
- **Patterns to follow:** Existing redaction helpers and forbidden-key assertions in production smoke tests.
- **Approach:** Extend tests to cover playback-migration fields and any new cache mode. Keep output useful for operators while replacing sensitive ids/tokens/object keys with coarse labels.
- **Test scenarios:**
  - Probe JSON omits prompt tokens, account ids, learner ids, cookies, expected R2 keys, transcript text, and raw audio bodies.
  - Probe warnings for migration failures include cache state and phase but no object key or prompt data.
  - CLI JSON mode remains parseable when a probe fails.
- **Verification:** Focused probe tests pass and any generated `/tmp` evidence inspected during development contains only redacted identifiers.

### U4. Spelling hero preload reduction

- **Goal:** Reduce image/network pressure when learners enter Spelling setup and start rounds.
- **Requirements:** R10, R11, R12
- **Files:**
  - Modify: `src/subjects/spelling/components/spelling-view-model.js`
  - Modify: `src/subjects/spelling/components/SpellingPracticeSurface.jsx`
  - Modify: `src/platform/ui/luminance.js`
  - Modify or add: relevant Spelling view-model/component tests
- **Patterns to follow:** `heroBgForPhase`, `heroBgPreloadUrls`, `preloadImages`, and existing hero contrast tests.
- **Approach:** Return or split eager and idle preload URLs. Load the active background immediately, maybe one likely next tone/mode, and defer broad mode/tone speculation through `requestIdleCallback` with a timeout fallback. Keep luminance caching intact.
- **Test scenarios:**
  - Fresh Spelling setup eager preload count is bounded and includes the active hero URL.
  - Post-Mega scenes still include the active branch background.
  - Idle preload schedules speculative URLs without blocking initial render.
  - No crash when `requestIdleCallback` is unavailable.
- **Verification:** Focused UI/view-model tests pass; browser smoke shows fewer initial image requests on setup.

### U5. Client fetch timeout hardening

- **Goal:** Bound gameplay network waits without breaking existing retry/degraded-state behaviour.
- **Requirements:** R13, R14, R15
- **Files:**
  - Modify: `src/platform/runtime/subject-command-client.js`
  - Modify: `src/platform/runtime/read-model-client.js`
  - Modify: `src/platform/core/repositories/api.js`
  - Modify or add: tests covering subject command client, read-model client, and repository network errors
- **Patterns to follow:** `SubjectCommandClientError`, `RepositoryHttpError`, bootstrap circuit-breaker tests, and existing retry/backoff tests.
- **Approach:** Add a small shared timeout wrapper or local helper that uses `AbortController` when available and preserves caller-supplied `signal`. Convert abort/timeouts into the existing network error paths. Keep default timeout conservative and configurable by constructor options where those clients already accept options.
- **Test scenarios:**
  - Subject command timeout becomes `subject_command_network_error` and participates in retry policy.
  - Read-model timeout throws the same shaped error as a network failure.
  - Repository timeout becomes `RepositoryHttpError` with status `0`.
  - Existing caller-provided abort signals still cancel requests.
- **Verification:** Focused runtime/repository tests pass; no unhandled rejections in browser smoke.

### U6. Focused refactor and measurement guardrails

- **Goal:** Capture enough guardrails for future CPU/page-load/TTS refactors without widening this PR into a repository rewrite.
- **Requirements:** R16, R17
- **Files:**
  - Modify if needed: `tests/worker-query-budget.test.js`
  - Modify if needed: `tests/bundle-audit.test.js`
  - Modify if needed: `docs/operations/performance-probes.md`
- **Patterns to follow:** Existing query-budget tests, production bundle audit, and performance probe docs.
- **Approach:** Add only narrow assertions needed by U2-U5: cache source expectations, preload budget, timeout error shape, and bundle/resource headroom. Record broad repository/app file splitting as a follow-up rather than mixing it into this optimisation.
- **Test scenarios:**
  - Query-budget tests continue to pass after TTS and timeout changes.
  - Bundle audit remains below the current gzip budget.
  - Documentation states that broad repository/app refactor is deferred until hot-path metrics are stable.
- **Verification:** `npm test`, `npm run check`, production audit, and browser smoke all pass before commit/push.

## Acceptance Examples

- AE1. Given the browser replay path serves a legacy cached audio object, when a learner replays the word, then the response plays successfully and a primary copy is written for subsequent requests.
- AE2. Given a diagnostic lookup-only production probe hits a legacy object, when the probe completes, then it reports the cache source but does not write a primary copy.
- AE3. Given Spelling setup opens for a demo learner, when the initial render completes, then only a bounded number of hero images are eagerly fetched and the active background remains visible.
- AE4. Given a subject command fetch hangs, when the client timeout elapses, then the UI leaves the pending state through the existing network/degraded handling instead of waiting indefinitely.
- AE5. Given production probes run after deployment, when JSON evidence is stored, then it contains timings/cache labels but no cookies, tokens, learner/account ids, object keys, transcript text, or raw audio.

## Verification Plan

- Focused tests: `node --test tests/worker-tts.test.js tests/spelling-tts.test.js tests/spelling-audio-production-smoke.test.js tests/production-performance-probe.test.js`
- Runtime/client tests for fetch timeout changes.
- Query and bundle guards: `node --test tests/worker-query-budget.test.js tests/bundle-audit.test.js`
- Full local gates: `npm test` and `npm run check`.
- Production-safe audit before deploy/PR update: `npm run audit:production -- --skip-local --retries 1 --retry-delay-ms 1000`.
- Browser smoke via the pipeline browser test step, covering home -> demo -> Spelling setup -> Smart Review -> Begin -> replay.

## Risks and Dependencies

- A migration-eligible playback flag must not become a provider-generation bypass. It must only copy already-served legacy audio after auth and limiter checks.
- Delaying hero preloads can cause a background flash if the active URL is not always eager. Tests must pin the active-background rule.
- Client timeouts can surface previously hidden slow-network conditions. The timeout must be long enough for normal mobile connections and must reuse existing retry/degraded UX.
- Full `npm test` is large; focused tests should run during each unit and the full suite should run before PR update.
- Merging the existing PR into `main` remains a repository governance step; this work should make that PR safer to merge rather than bypassing it.
