---
title: "perf: TTS Cache Follow-Up Optimisation"
type: perf
status: active
date: 2026-06-07
---

# perf: TTS Cache Follow-Up Optimisation

## Summary

Finish the TTS cache optimisation slice by making every intended cached audio path measurable, primary-backed, and regression-guarded. The work should close the remaining word-only cache miss, formalise the sentence-cache and browser play-start probes, and then lightly refactor the TTS timing/limiter helpers without changing response semantics.

---

## Problem Frame

The sentence-shaped TTS cache path now serves primary R2 hits in production with direct `/api/tts` header p50 around 400 ms, down from the earlier two-second range. The remaining gap is not the sentence cache path; it is that word-only Word Bank probes still return `204 miss`, cross-account word smoke remains red, and browser-side play-start measurement is not yet part of the repeatable production probe. Without those guards, future TTS changes could regress the user-visible replay path while direct API timing still looks healthy.

---

## Requirements

**Cache Correctness**

- R1. Word-only Word Bank TTS requests must be able to return `200 hit/primary` when a warmable word audio object exists or can be warmed through the existing authenticated path.
- R2. Cross-account word audio reuse must keep the existing content-key invariant: reusable word audio keys must not include account id or learner id.
- R3. Sentence-shaped cached dictation audio must keep returning `200 hit/primary`; this work must not reintroduce legacy fallback dependency.

**Measurement**

- R4. `npm run perf:production` must measure sentence cache-hit audio alongside word-only lookup timing, not rely on one-off `/tmp` scripts.
- R5. The production probe must optionally measure browser-side audio start latency with bounded `playStartMs` evidence when a browser runtime is available.
- R6. Probe output must redact cookies, learner ids, account ids, prompt tokens, raw audio bodies, and transcript text.

**Refactor Safety**

- R7. TTS timing and limiter code may be extracted only if existing headers, rate-limit buckets, status codes, warmup rules, and cache semantics remain unchanged.
- R8. `Server-Timing` must stay numeric and non-sensitive; it must not expose slug, prompt token, learner id, account id, provider key, SQL, or transcript material.

**Verification and Operations**

- R9. Existing package scripts remain the deployment path: `npm test`, `npm run check`, and `npm run deploy`.
- R10. Existing production bundle and spelling-audio smoke gates must either pass or report only a clearly documented remaining operational prefill limitation.

---

## Scope Boundaries

- No public R2 bucket, R2 custom-domain audio serving, or unauthenticated audio URL migration.
- No D1 Sessions, Smart Placement, Workers Cache API, or bundle route migration in this slice.
- No broad spelling subject runtime rewrite.
- No weakening of prompt-token validation, cross-account isolation, demo limits, or TTS rate-limit behaviour.
- No claims about lower Worker CPU unless backed by a direct CPU metric; request timing and `Server-Timing` are latency evidence, not CPU proof.

---

## Key Technical Decisions

- KTD1. Fix word-only cache first: the latest production evidence shows sentence cache hits are primary and fast enough for the current slice, while word-only probes still miss and keep the smoke red.
- KTD2. Keep authenticated warming server-side: word audio can be cross-account reusable at the R2 object key, but request validation must remain learner/account scoped before any lookup or warmup.
- KTD3. Productise the measurement before deeper refactor: sentence hit and browser play-start measurements should become repeatable probe features before further optimisation decisions.
- KTD4. Treat `cacheLookupOnly` and `cacheOnly` distinctly: lookup-only remains a read/diagnostic path, while warmup or playback paths may store missing word audio when already authorised.
- KTD5. Refactor only after behaviour is locked: timing and limiter helper extraction follows tests for word-only hits, sentence hits, and safe headers.

---

## Implementation Units

### U1. Word-only cache warm and hit path

- **Goal:** Make Word Bank word-only audio reach `200 hit/primary` for warmed words and keep cross-account reuse safe.
- **Requirements:** R1, R2, R3, R7, R8
- **Files:**
  - Modify: `worker/src/tts.js`
  - Modify: `tests/worker-tts.test.js`
  - Modify: `scripts/spelling-audio-production-smoke.mjs`
- **Patterns to follow:** `worker/src/tts.js` word metadata key generation, `tests/worker-tts.test.js` word-bank TTS tests, `scripts/spelling-audio-production-smoke.mjs` cross-account probe.
- **Approach:** Inspect the existing word-only cache miss path before changing it. Preserve lookup-only `204` semantics when the object is genuinely absent, but ensure authorised warm/playback requests store and then serve primary word audio. If the smoke expects a prefilled object, make the warmup step explicit rather than treating absence as a cache contract failure.
- **Test scenarios:**
  - Happy path: a warmed word-only request returns `200 hit/primary` with the expected model and voice headers.
  - Cross-account path: two learners requesting the same word share the same word content key while prompt tokens remain learner scoped.
  - Edge path: `cacheLookupOnly` for an unwarmed word still returns a bounded miss without provider fetch.
  - Security path: `Server-Timing`, logs, and probe summaries do not expose learner id, account id, slug, prompt token, transcript, or provider keys.
- **Verification:** `node --test tests/worker-tts.test.js` passes and `npm run smoke:production:spelling-audio -- --word-sample accident,knowledge --sentence-sample accident,knowledge --json` no longer fails for the word-only prefill reason after deployment.

### U2. Production probe sentence and word-cache coverage

- **Goal:** Move the one-off sentence cache-hit timing script into `scripts/production-performance-probe.mjs`.
- **Requirements:** R3, R4, R6, R9
- **Files:**
  - Modify: `scripts/production-performance-probe.mjs`
  - Modify: `tests/production-performance-probe.test.js`
  - Modify: `package.json`
- **Patterns to follow:** existing `measureTts`, `parseServerTiming`, `classifyTtsTimingSample`, and `computeWordBankPromptToken` usage in `scripts/production-performance-probe.mjs`.
- **Approach:** Add explicit probe modes for word-only lookup and sentence cache-hit audio. Report per-mode status, cache source, bytes, header/body/total timing, and parsed phases. Keep the default sample count low and redacted.
- **Test scenarios:**
  - Happy path: stubbed word lookup miss and sentence hit produce separate summaries.
  - Edge path: missing sentence cache produces a bounded failure that identifies the cache mode.
  - Redaction path: output excludes cookies, prompt tokens, learner/account identifiers, and transcript text.
  - CLI path: duplicate or incompatible timing flags fail fast rather than silently overriding.
- **Verification:** `node --test tests/production-performance-probe.test.js` passes and `npm run perf:production -- --samples 2 --warmup 1 --word-sample accident,knowledge --voices Iapetus` reports both TTS modes.

### U3. Browser-side TTS play-start measurement

- **Goal:** Add a repeatable browser-side measurement for the real client TTS replay path.
- **Requirements:** R4, R5, R6, R9
- **Files:**
  - Modify: `src/subjects/spelling/tts.js`
  - Modify: `tests/spelling-tts.test.js`
  - Modify: `scripts/production-performance-probe.mjs`
  - Modify: `tests/production-performance-probe.test.js`
- **Patterns to follow:** `[ks2-tts-cache-latency]` logging in `src/subjects/spelling/tts.js`, existing `playStartMs` tests in `tests/spelling-tts.test.js`, and the repo's Playwright script usage.
- **Approach:** Keep client telemetry as the source of truth for play-start. Add a probe option that runs the client TTS path in a controlled browser context when available, captures console telemetry or a structured test hook, and records `headerMs`, `blobMs`, `playStartMs`, `bytes`, cache state, and request id.
- **Test scenarios:**
  - Happy path: a mocked cached audio response records `playStartMs` and byte size.
  - Edge path: cache miss records no `playStartMs` and does not trigger provider fallback after cancellation.
  - Browser-unavailable path: the production probe marks browser timing skipped without failing non-browser runs.
  - Redaction path: browser timing output excludes prompt token, learner/account identifiers, and transcript text.
- **Verification:** `node --test tests/spelling-tts.test.js tests/production-performance-probe.test.js` passes and the production probe can mark browser play-start as measured or explicitly skipped.

### U4. TTS timing and limiter helper refactor

- **Goal:** Reduce local complexity in `worker/src/tts.js` after the cache and measurement paths are covered by tests.
- **Requirements:** R7, R8, R9
- **Files:**
  - Modify: `worker/src/tts.js`
  - Modify: `tests/worker-tts.test.js`
- **Patterns to follow:** current `createTtsTiming`, `timeTtsPhase`, `withTtsServerTiming`, `protectTts`, `protectTtsLookup`, and `allowTtsWarmup` behaviour.
- **Approach:** Extract small helpers for limiter-pair execution and timing-header construction only where doing so removes duplication. Do not introduce a new module unless the file becomes harder to read without one. Preserve all thrown error codes and bucket names.
- **Test scenarios:**
  - Behavioural path: existing lookup, warmup, playback, demo, and provider tests continue to pass.
  - Error path: account and IP limiter failures still map to the existing TTS error codes.
  - Header path: `Server-Timing` remains bounded, numeric, and non-sensitive.
- **Verification:** focused TTS tests pass before full gates are run.

---

## Acceptance Examples

- AE1. Given a warmed Word Bank word audio object, when a learner requests `wordOnly: true` for that word, then `/api/tts` returns `200`, `x-ks2-tts-cache: hit`, and `x-ks2-tts-cache-source: primary`.
- AE2. Given two learners request the same warmed Word Bank word, when their prompt tokens differ, then both can hit the same primary R2 word object without sharing learner-scoped prompt material.
- AE3. Given the production probe runs with TTS enabled, when it finishes, then it reports separate word-only lookup and sentence cache-hit timing summaries.
- AE4. Given browser timing is unavailable in the environment, when the production probe runs, then it records browser play-start as skipped and still completes API timing.
- AE5. Given the TTS helper refactor is applied, when focused worker tests run, then cache status codes, rate-limit error codes, and safe `Server-Timing` output remain unchanged.

---

## Risks and Dependencies

- Warming word-only audio may call the Gemini provider when cache is absent. The implementation must respect existing warmup limits and avoid doing provider work for lookup-only diagnostics.
- Browser play-start timing depends on browser audio APIs and autoplay constraints. The probe must degrade to an explicit skipped state when a reliable browser context is unavailable.
- Production smoke may require an explicit warmup step before requiring word hits. The smoke should distinguish "not warmed" from "cache contract broken".
- Existing local tests are large and can generate report/build side effects. Generated files should be cleaned or ignored without reverting unrelated user work.

---

## Sources and Research

- `docs/plans/2026-06-07-001-perf-production-performance-attribution-plan.md` established the first measurement and `Server-Timing` slice.
- `worker/src/tts.js` owns TTS prompt validation, limiter checks, R2 lookup, warmup, provider fetch, cache headers, and timing headers.
- `src/subjects/spelling/tts.js` owns client cache lookup, audio blob loading, playback, and `[ks2-tts-cache-latency]` telemetry.
- `scripts/production-performance-probe.mjs` now measures production assets, bootstrap, and word-only TTS lookup timing.
- `scripts/spelling-audio-production-smoke.mjs` owns the production word/sentence/cross-account TTS smoke contract.
- `tests/worker-tts.test.js`, `tests/spelling-tts.test.js`, and `tests/production-performance-probe.test.js` are the primary focused regression targets.
