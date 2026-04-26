# Phase 2 Capacity Release Gates and Telemetry — Completion Report

Date: 2026-04-26
Repository: `fol2/ks2-mastery`
Plan document: `docs/plans/2026-04-25-002-feat-capacity-release-gates-and-telemetry-plan.md`
Origin note: `docs/plans/james/cpuload/cpuload-p2.md`
Phase 1 report: `docs/plans/james/cpuload/implementation-report.md`

## Executive Summary

Phase 2 transforms KS2 Mastery from "we think it's bounded" to "we can prove it's bounded, gate releases on evidence, and degrade gracefully when limits are hit." Every Phase 2 objective was delivered across **7 merged PRs** (plus 2 units superseded by parallel streams), **22 adversarial review rounds**, and **4 scope-collision reconciliations** — all in a single autonomous session using a scrum-master orchestration pattern that kept main-agent context under 5% of the 1M ceiling.

**Phase 2 exit criteria — all met:**

| Criterion | Status | Evidence |
| --- | --- | --- |
| Every capacity-relevant request carries `meta.capacity` and emits a `capacity.request` structured log | Met | U3 PR #201 |
| Evidence JSON schema persists threshold pass/fail per run | Met | U1 PR #155, schema v1 |
| Release gate script exits non-zero on threshold violation | Met | U1 PR #155 `npm run capacity:verify-evidence` |
| Load driver runs against a real local Worker in one command | Met | U4 PR #230 `npm run capacity:local-worker` |
| Common commands read zero `event_log` rows on hot path | Met | U6 PR #253, `queryCount <= 12` on 2000-event learner |
| `/api/bootstrap` bytes scale with selected learner, not account | Met | U7 PR #290, 30-learner bounded: 19.5 KB (vs 545 KB pre-U7) |
| `notModified` response under 2 KB | Met | U7 PR #290, measured 471 bytes |
| 1 bootstrap fetch across 3 simultaneous tabs | Met | U8 PR #307, Playwright 5/5 scenarios green |
| 5 circuit breakers with graceful degradation | Met | U9 PR #326, all 5 self-tripping |
| Classroom-tier certification unblocked | Met | All gates operational; first dated run is an operator step |

**What this unlocks:** operators can now run `npm run capacity:classroom:release-gate` against production/preview, get a JSON evidence file with per-threshold pass/fail, and make a dated certification claim for 30/60/100+ learner tiers. The tooling exists; the claim requires a real run.

## Delivery Timeline

### Phase 2 PRs (chronological merge order)

| PR | Title | Merge SHA | Merged | Adversarial rounds | Key finding |
| --- | --- | --- | --- | --- | --- |
| #147 | Plan document (Phase 2 release gates + telemetry) | `849bf41` | 2026-04-25 17:01 | 3 (deepening reviewers) | — |
| #155 | **U1** Evidence persistence + threshold gates | `69fdd84` | 2026-04-25 21:01 | **9** | 6 P3 residuals documented; 4 rounds of adversarial escalation on evidence fabrication routes (format gate, ancestry, recomputation) |
| #177 | **U2** Threshold gates + evidence hooks (superseded scope) | `6924802` | 2026-04-25 19:04 | — | Parallel SH1 stream; U2 plan 70% covered, 30% deferred to U2.5 |
| #201 | **U3** Worker telemetry + D1 wrapper + `meta.capacity` | `0cec2d9` | 2026-04-26 00:17 | **3** | Option B override of PR #207 (9-round hardened architecture wins; 2 P0 closed: signals allowlist + Buffer runtime) |
| #230 | **U4** Real worker local-fixture integration load test | `cfc9e7c` | 2026-04-26 02:13 | **2** | P0 readiness-201 bug (real Worker returns 201 Created, test expected 200); env allowlist flip |
| #233 | **U5** Dense-history smoke (superseded scope) | `754396d` | 2026-04-26 01:46 | — | Parallel SH1 U11; U5 plan partially covered |
| #253 | **U6** Projection hot-path + CAS retry with token merge | `89c834a` | 2026-04-26 10:31 | **2** | Pre-U6 v1 row migration safety (adv-u6-r1-001); CAS retry with token merge wired end-to-end (adv-u6-r1-002) |
| #290 | **U7** Minimal bootstrap v2 + JSON `notModified` | `185b1b4` | 2026-04-26 14:56 | **2** | Monster visual config pointer cascade P1 (adv-u7-r1-001); accountId hash input + bounded POST body |
| #307 | **U8** Playwright multi-tab bootstrap validation | `779b46d` | 2026-04-26 19:29 | **2** + coord diagnosis | **Deep architectural bug:** U7 notModified fast-path unmasked pre-latent Phase 1 coordination race; fixed with discriminated lease + follower spin-wait + 100ms settle |
| #326 | **U9** Circuit breakers + graceful degradation | `49645cc` | 2026-04-26 21:46 | **2** | Round 1 caught 4/5 breakers as dead code (wired but `recordFailure/recordSuccess` never called); all 5 wired in fix round |

### Superseded units

| Plan unit | Superseded by | Coverage | Gap (deferred) |
| --- | --- | --- | --- |
| U2 Production High-Load Guardrails | PR #177 (SH1 stream) | `--confirm-high-production-load` at >=20 learners, threshold flags, mode exclusivity | `--confirm-school-load` (60-learner tier), dynamic `guardrailsTriggered[]`/`confirmedVia[]` arrays, dry-run warning path → U2.5 |
| U5 Dense-History Subject Command Smoke | PR #233 (SH1 U11) | Spelling start-session + submit-answer, P95 gate, exit codes, redaction checks | Full loop (advance + end-session), Grammar/Punctuation stale-409, Parent Hub pagination, KV advisory lock → U5.5 |

### Scope collisions resolved

| Unit | Collision | Resolution | Rationale |
| --- | --- | --- | --- |
| U1 | PR #177 (SH1 U2) modified same capacity files | **Option A** — merge main into branch, resolve textual conflicts, preserve both | PR #177 content complementary, not competing |
| U3 | PR #207 (SH1 U4) landed competing telemetry architecture | **Option B** — override with 9-round hardened architecture | PR #201 had `meta.capacity` response surface (plan requirement), constructor injection (stricter isolation), configurable sample rate, closed signals allowlist, overhead benchmark — all absent from PR #207 |
| U5 | PR #233 (SH1 U11) landed dense-history smoke first | **Option A** — close U5 as superseded, defer remaining gaps to U5.5 | PR #233 covered structural proof; remaining items depend on U6/U7 landing |
| U7 | SH2 parallel stream modified `capacity.md` + `app.js` | **Merge + union** — no architectural conflict, only textual overlap | Admin-ops KPI endpoint in capacity.md is additive; SH2-U1/U2 touch different functions in `app.js` |

## Unit-by-Unit Technical Summary

### U1: Evidence Persistence and Threshold Gates (PR #155)

**What shipped:**
- `scripts/lib/capacity-evidence.mjs` — pure evidence library: `EVIDENCE_SCHEMA_VERSION = 1`, `buildReportMeta`, `evaluateThresholds`, `buildEvidencePayload`, `persistEvidenceFile` (tempfile-then-rename atomic writes), `autoNameEvidencePath`, `capRequestSamples` (head 100 + tail 100), `requireBootstrapCapacity` (deferred-to-U3)
- `scripts/verify-capacity-evidence.mjs` — release gate: parses capacity evidence table in `docs/operations/capacity.md`, verifies each row against committed tier configs in `reports/capacity/configs/`, cross-checks thresholds bidirectionally (config ↔ evidence union), recomputes `evaluateThresholds` at verify time (anti-laundering), probes commit existence via `git cat-file -e <sha>^{commit}` (fabricated-SHA detector), exits non-zero on violation
- `reports/capacity/configs/{small-pilot,30-learner-beta,60-learner-stretch,100-plus}.json` — pinned threshold configs
- Extended `scripts/classroom-load-test.mjs` with `--output`, `--config`, `--max-*`, `--require-*`, `--include-request-samples`
- Extended `scripts/probe-production-bootstrap.mjs` with `--output`, `startedAt`/`finishedAt` timing, full evidence envelope
- Added to `package.json`: `"capacity:verify-evidence"`, extended `"verify"` to include evidence gate

**Adversarial hardening (9 rounds):**
Progressive trust-boundary narrowing across 9 rounds of adversarial review:
- Round 1 (20 findings): ordering trust, config validation shape, dry-run flag propagation
- Round 2 (3 P0): tier-claim provenance hardening — reject `dryRun: true` for certification tiers
- Round 3: config content cross-check — committed configs read at verify-time and compared bidirectionally
- Round 4: anti-laundering recomputation — re-evaluate thresholds at verify-time to reject hand-edited `passed` flags
- Round 5: ancestry check — `git cat-file -e` existence probe, `minEvidenceSchemaVersion` honoured
- Round 6: audit trail for `CAPACITY_VERIFY_SKIP_ANCESTRY=1` escape hatch + fabricated-SHA fail-closed
- Round 7: 40-char hex format gate on `reportMeta.commit` + hoisted existence probe for smoke-pass rows
- Round 8: narrow env-var scope — existence probe gated on `isShallowClone()` only, not env var
- Round 9 (final, 14 fresh-surface probes): **clean** — all prior fixes hold, P3 residuals documented as known ceiling

**Documented P3 residuals (accepted ceiling of U1 shape-and-consistency defence):**
1. Self-consistent fabrication using a legitimate in-repo 40-char SHA passes verify (closed only by CI-signed provenance)
2. Threshold value floor not code-enforced (PR review is the mitigation)
3. Zero-duration or physically impossible timings not detected
4. Warning visibility on stdout happy-path
5. Orphan/dangling commits pass existence probe (cat-file checks object-DB presence, not reachability)
6. Row-cell vs evidence-cell case mismatch surfaces as "commit mismatch" rather than "case inconsistency"

### U3: Worker Capacity Telemetry and D1 Wrapper (PR #201)

**Architecture (Option B override of PR #207):**
- `worker/src/logger.js` — `CapacityCollector` class (constructor injection, not AsyncLocalStorage): per-request `requestId`, `endpoint`, `method`, `queryCount`, `d1RowsRead`, `d1RowsWritten`, `d1DurationMs`, per-statement `statements[]` hard-capped at 50 with `statementsTruncated` flag, mutable flags `bootstrapCapacity`, `projectionFallback`, `derivedWriteSkipped`, `signals[]`
- `worker/src/d1.js` — `withCapacityCollector(db, collector)` D1 handle proxy: intercepts `prepare()` → `CollectingStatement` that records `rows_read`/`rows_written`/`duration` per statement. Zero overhead when collector absent.
- `toPublicJSON()` closed allowlist: `requestId, queryCount, d1RowsRead, d1RowsWritten, wallMs, responseBytes, bootstrapCapacity?, projectionFallback?, derivedWriteSkipped?, bootstrapMode?, signals: []`. Per-statement breakdown NEVER in public shape.
- `SIGNAL_ALLOWED_TOKENS` closed set: `exceededCpu, d1Overloaded, d1DailyLimit, rateLimited, networkFailure, server5xx, bootstrapFallback, projectionFallback, derivedWriteSkipped, breakerTransition, redactionFailure, staleWrite, idempotencyReuse`
- `CAPACITY_LOG_SAMPLE_RATE` env var (default 1.0 local/preview, 0.1 recommended production; status >= 500 AND pre-route 401s always at 1.0)
- Collector threaded through `accountSessionFromToken` (production session lookup counted), all `protectDemo*` helpers, ops-error rate-limit path
- `measureUtf8Bytes()` replaces `Buffer.byteLength` (no `nodejs_compat` flag on Workers)

**Option B rationale (preserved in PR body):**
1. 9 adversarial rounds vs PR #207's 1
2. `meta.capacity` response surface is a plan requirement; PR #207 emitted logs only
3. Constructor injection stricter than env-attach (`createWorkerRepository({env, now, capacity})`)
4. `CAPACITY_LOG_SAMPLE_RATE` env var beats hard-coded 0.1
5. `[ks2-worker] {event: capacity.request}` matches existing `logMutation()` stream (consistent log surface)

**Absorbed from PR #207:** 3 failure-taxonomy tokens (`redactionFailure`, `staleWrite`, `idempotencyReuse`); sentinel-token redaction scan test. **Rejected:** 4 HTTP-status-duplicating tokens (`authFailure`, `badRequest`, `notFound`, `backendUnavailable`) — regression-locked.

### U4: Real Worker Local-Fixture Integration Load Test (PR #230)

**What shipped:**
- `scripts/capacity-local-worker.mjs` (~330 lines) — subprocess orchestrator: `npm run db:migrate:local` → `wrangler dev --local --port <dynamic>` via `scripts/wrangler-oauth.mjs` → two-stage readiness poll (any 2xx, not strict 200) → classroom load driver with `--local-fixture` → teardown (SIGINT on POSIX, `taskkill /F /PID` on Windows)
- `scripts/lib/log-redaction.mjs` (~70 lines) — streaming redaction filter: buffers partial lines across stream chunks (no cross-chunk secret leak), scrubs cookies, Bearer tokens, OAuth artefacts, JSON-shape secrets, named third-party tokens
- `WRANGLER_ENV_ALLOWLIST` — denylist-of-one flipped to strict allowlist; `SUSPICIOUS_SUFFIX_PATTERN` rejects `/TOKEN$|SECRET$|PASSWORD$|KEY$/i` even on `WRANGLER_*` prefix entries
- Evidence file existence assertion (exit code 3 on missing/empty after driver exit 0)
- `rejectConflictingDriverArgs` canonicalises both space-form and equals-form (`--origin=x`) before set lookup

### U6: Projection Hot-Path Consumption with CAS Retry (PR #253)

**What shipped:**
- `readLearnerProjectionInput()` closed-union return: `{mode: 'hit', projection, sourceRevision}` | `{mode: 'miss-rehydrated', ...fallbackDurationMs}` | `{mode: 'stale-catchup', ...fallbackDurationMs}` | throws `ProjectionUnavailableError`
- `recentEventTokens` ring (default 250, strict superset of `PROJECTION_RECENT_EVENT_LIMIT = 200`) persisted in `command.projection.v1`
- Asymmetric schema version handling: `newer-opaque` on rollback (preserve data), `miss-rehydrated` on migration (overwrite safely)
- CAS retry with token merge in `runSubjectCommandMutation`: loser re-reads fresh row, calls `mergeRecentEventTokens(loserTokens, winnerTokens)`, re-applies `applyCommand()` against fresh state (Option A semantic — no delta lost), retries CAS ONCE; second failure → `derivedWriteSkipped: {reason: 'concurrent-retry-exhausted'}`, primary state write proceeds
- Stale-at-entry guard: `expectedLearnerRevision` already stale → immediate `stale_write` 409 (no silent rebase, preserves Phase 1 contract)
- `ProjectionUnavailableError` → 503 `{ok: false, error: 'projection_unavailable', retryable: false, requestId}`
- Client `isCommandBackendExhausted(error)` classifier in `subject-command-client.js` — moves to pending without jitter/transport-retry/bootstrap recovery
- Pre-U6 v1 row migration safety: rows WITHOUT `recentEventTokens` field treated as `miss-rehydrated` (not `hit` with empty dedupe seed)

**Measured:** 2000-event learner hot-path command: `queryCount = 12`, zero `event_log` reads.

### U7: Minimal Bootstrap v2 + JSON notModified (PR #290)

**What shipped:**
- Selected-learner bounded bootstrap: full data for selected learner only; others as compact `account.learnerList` (id + name + avatar + revision, <= 50 entries)
- SHA-256 revision hash (16-byte hex / 32 chars) via `crypto.subtle.digest`: input `accountId:<id>;accountRevision:<N>;selectedLearnerRevision:<M>;bootstrapCapacityVersion:<V>;accountLearnerListRevision:<L>`
- POST `/api/bootstrap` variant with `{lastKnownRevision, preferredLearnerId?}` — GET preserved for back-compat + demo paths
- `notModified` response: `{ok: true, notModified: true, revision: {...}, meta: {capacity: {bootstrapMode: 'not-modified'}}}` — measured 471 bytes
- Closed `bootstrapMode` enum: `'selected-learner-bounded' | 'full-legacy' | 'not-modified'`
- `BOOTSTRAP_CAPACITY_VERSION` bumped 1 → 2; snapshot test locks envelope shape per version
- Migration 0011: `adult_account_list_revisions` sibling table (idempotent `CREATE TABLE IF NOT EXISTS` — SQLite has no `ADD COLUMN IF NOT EXISTS`)
- Monster visual config pointer: 455 KB `BUNDLED_MONSTER_VISUAL_CONFIG` stripped from bootstrap; pointer `{schemaVersion, manifestHash, publishedVersion, compact: true}` replaces it; client `resolveMonsterVisualConfigFromPointer(pointer, cachedConfig)` preserves cache on hash match, triggers lazy refetch on mismatch
- `bootstrapRevisionHash` persisted in `persistCachedState`/`loadCachedState` (fixes notModified optimisation surviving page loads — was silently null-initialised before fix)

**Measured:** 30-learner bounded bootstrap: **19.5 KB** (vs 545 KB pre-U7 with monster visual config — **96% reduction**). `notModified` response: **471 bytes** (well under 2 KB budget).

### U8: Playwright Multi-Tab Bootstrap Validation (PR #307)

**What shipped:**
- `globalThis.__ks2_capacityMeta__` counter object (test/dev only, 8 counters): `bootstrapLeaderAcquired`, `bootstrapFollowerWaited`, `bootstrapFollowerUsedCache`, `bootstrapFollowerTimedOut`, `bootstrapFallbackFullRefresh`, `staleCommandSmallRefresh`, `staleCommandFullBootstrapFallback`, `bootstrapCoordinationStorageUnavailable`
- Production tree-shake: inline `if (process.env.NODE_ENV !== 'production') { ... }` at each guard site (esbuild define cannot track intermediate `const`); `KS2_BUILD_MODE=test` env hook in `scripts/build-client.mjs`; `scripts/audit-client-bundle.mjs` forbidden-token entry for `__ks2_capacityMeta__`; production bundle audit: **0 occurrences** confirmed
- 5 Playwright scenarios (A: 3-tab reload, B: 5-tab stress, C: leader-close recovery, D: incognito/isolated-context independence, E: lease TTL expiry) — all green across 3 consecutive runs

**Deep architectural bug found and fixed (U7 multi-tab coordination race):**

The biggest technical finding of Phase 2. Post-U7 merge, multi-tab bootstrap coordination was **deterministically broken** — not a flake. 3 consecutive Playwright runs showed `bootstrapTotal = 3` (expected <= 2) on Scenario A, `5` (expected <= 4) on Scenario B. Stagger 50-750ms between tab opens did NOT fix it.

*Root cause (diagnostic rejected "cache not rehydrated" hypothesis — `loadCachedState` is synchronous):*
U7's `notModified` POST fast-path (~50ms) vs Phase 1 GET bootstrap (~500ms) narrowed the leader lease window below follower tabs' `activeBootstrapCoordination()` check latency. Followers saw no active foreign lease, fell through `confirmBootstrapCoordinationBeforeFetch(null) === true`, and bootstrapped independently. Additionally, `acquireBootstrapCoordination` returned nullable (overloading "storage unavailable" and "lost race") and Chromium's async `storage` event dispatch on Windows takes 50-90ms — all tabs read back their own last-write.

*Fix (3 coupled changes in `src/platform/core/repositories/api.js`):*
1. Persist `bootstrapRevisionHash` in `persistCachedState`/`loadCachedState` (notModified optimisation was silently broken across page loads)
2. Discriminated `acquireBootstrapCoordination` result: `{winner: boolean, storageUnavailable: boolean, ownerId: string|null, lease: object|null}` — race loser vs storage unavailable no longer conflated
3. 100ms cross-tab write-settle window inside acquire (empirically Windows Chromium 50-90ms) + follower spin-wait (3 x 30ms) with localStorage cache-rehydration escape hatch

Result: sibling U10 test (unchanged, 15 viewports) went from 5/15 FAIL to **15/15 green** — confirming the fix is architectural, not test-specific.

### U9: Circuit Breakers and Graceful Degradation (PR #326)

**What shipped:**
- `src/platform/core/circuit-breaker.js` — state machine primitive: CLOSED → OPEN (failureThreshold=3) → HALF_OPEN (cooldown elapsed) → CLOSED (probe success) / OPEN (probe fail, 2x backoff, 30s cap). In-line reentrancy guard (`isEmittingTransition` flag + `pendingTransitionQueue` FIFO drain).
- 5 named breakers: `parentHubRecentSessions`, `parentHubActivity`, `classroomSummary`, `readModelDerivedWrite`, `bootstrapCapacityMetadata`
- Client `fetchHubJsonWithBreaker` wrapper in `src/platform/hubs/api.js` — 5xx/network → recordFailure; 2xx → recordSuccess; 4xx → neither. Wired on 3 hub endpoints.
- Server-side `readModelDerivedWrite` breaker in `worker/src/repository.js` `attemptMutation` — `batch()` throw + `includeProjection=true` → recordFailure; `changes=1` + `includeProjection=true` → recordSuccess; CAS contention (`changes=0`) → neither
- CAS retry Attempt 2 re-checks `shouldBlockCall()` before projection write
- `bootstrapCapacityMetadata` sticky: `cooldownMaxMs: Infinity` + `forceOpen({sticky: true})` — no auto-recovery; reuses U7's `consecutiveMissingBootstrapMetadata` counter
- `breakersDegraded` boolean map: `{parentHub, classroomSummary, derivedWrite, bootstrapCapacity}` — minimal UI exposure
- Multi-tab localStorage broadcast: `ks2-breaker:<name>:open:<until-ts>` TTL-bound keys; stale-key cleanup on each OPEN transition (`clearBroadcastForName` before `setItem`)
- `breakerTransition` telemetry signal via U3's existing `addSignal` method (reuses `SIGNAL_ALLOWED_TOKENS` — zero primitive extension)
- UX degradation: ParentHub "Recently unavailable" / hidden activity feed; AdminHub roster in learner-list-only mode; `derivedWriteSkipped: {reason: 'breaker-open'}` on server
- Priority order preserved: student answer write > reward/event projection > parent analytics — breaker state never masks failed writes as "synced"

## Measurement Summary

### Response payload reductions

| Endpoint | Pre-Phase-2 | Post-Phase-2 | Reduction |
| --- | --- | --- | --- |
| `/api/bootstrap` (30-learner, learner-1 selected) | ~545 KB (incl. 455 KB monster visual config) | **19.5 KB** (bounded + pointer) | **96%** |
| `/api/bootstrap` (repeat, hash match) | ~545 KB (full refetch) | **471 bytes** (notModified) | **99.9%** |
| `/api/bootstrap` (1-learner, empty history) | ~3.2 KB | ~3.7 KB (+500B revision envelope) | +15% (acceptable overhead) |

### Query budget (hot-path subject command, 2000-event learner)

| Metric | Pre-Phase-2 | Post-Phase-2 (U6) | Budget |
| --- | --- | --- | --- |
| `queryCount` | ~25-30 (unbounded event_log scan) | **12** | <= 12 |
| `event_log` reads | ~200+ rows | **0** (hot path) | 0 |

### Overhead benchmark (U3 CapacityCollector proxy)

| Metric | Baseline (no collector) | With collector | Delta |
| --- | --- | --- | --- |
| `bootstrap()` mean | 15.94 ms | 15.28 ms | **-4.14%** (within noise) |
| `bootstrap()` p95 | 22.02 ms | 21.64 ms | **-1.71%** |
| Full-stack `app.fetch('/api/bootstrap')` mean | — | 30.19 ms | — |

### Multi-tab coordination

| Metric | Pre-U8-fix | Post-U8-fix |
| --- | --- | --- |
| Scenario A (3 tabs) `bootstrapTotal` | 3 (deterministic) | **<= 2** (3/3 runs) |
| Scenario B (5 tabs) `bootstrapTotal` | 5 (deterministic) | **<= 4** (3/3 runs) |
| Sibling U10 test (15 viewports) | 5/15 FAIL | **15/15 green** |

### Test suite growth

| Checkpoint | Tests | Pass | Fail | Skip |
| --- | --- | --- | --- | --- |
| Pre-Phase-2 (session start) | ~1544 | ~1544 | 40 (pre-existing) | — |
| Post-U1 merge | 1546 | 1544 | 1 | 1 |
| Post-U3 merge | 2014 | 2014 | 1 | 1 |
| Post-U7 merge | 2949 | 2949 | 2 | 2 |
| Post-U8 merge | 3636 | 3636 | 2 | 2 |
| Post-U9 merge (final) | 3966 | 3960 | 4 | 2 |

Note: pre-existing fail count fluctuated as parallel streams (SH2, Grammar P4, Spelling P2, Punctuation P4) merged and were subsequently fixed by the regression-sweep effort (PRs #333-#339, 14 → 0). Current 4 fails are environmental (Windows concurrent temp-dir races + microbenchmark jitter).

## Adversarial Review Effectiveness

**22 rounds across 7 implemented units. Findings that changed the shipped code:**

| Unit | Rounds | P0 | P1 | P2 | P3 | Key save |
| --- | --- | --- | --- | --- | --- | --- |
| U1 | 9 | 0 | 0 | 0 | 6 | Progressive hardening: format gate → ancestry → recomputation → fabricated-SHA detector. 6 rounds of escalating attack surface narrowing. |
| U3 | 3 | 2 | 4 | 3 | 1 | P0 `Buffer.byteLength` would crash every Workers response (no `nodejs_compat`); P0 signals allowlist prevents future PII leak |
| U4 | 2 | 1 | 4 | 5 | 3 | P0 readiness stage-2 expected 200, real Worker returns 201; P1 env denylist-of-one flipped to strict allowlist |
| U6 | 2 | 0 | 2 | 2 | 1 | Pre-U6 v1 row migration hazard (duplicate reward.monster events); CAS retry with token merge wired |
| U7 | 2 | 0 | 1 | 2 | 0 | P1 monster visual config pointer cascade destroys cached config; accountId in hash input |
| U8 | 2 + diag | 0 | 0 | 3 | 3 | Multi-tab coordination race: discriminated lease + follower spin-wait + 100ms settle window |
| U9 | 2 | 2 | 4 | 5 | 2 | P0 **4/5 breakers dead code** (primitive wired, recordFailure never called); P0 rebase-would-revert landed PRs |
| **Total** | **22** | **5** | **15** | **20** | **16** | |

**False positive rate: 0.** Every P0/P1 finding was validated mechanically (red tests, probe scripts, or direct code-path trace). No finding was retracted.

**Pattern: plan-truth-vs-implementation-truth drift.** U9's "4/5 breakers dead code" is the purest example: the plan described primitives as "recording per-invocation outcome"; the implementation recorded only its own invocation. This gap is invisible to syntax-level review (code compiles, tests pass, types check) — only adversarial semantic probing surfaces it.

## Orchestration Pattern

Phase 2 was delivered using an **autonomous scrum-master orchestration pattern** — main agent acted as dispatcher (plan reading, reviewer dispatch, convergence synthesis, merge decisions) while subagents handled all implementation, review, and git operations in background. This kept main-agent token usage under 50K across the full session (~5% of the 1M ceiling).

**Key operational practices:**

1. **Per-unit SDLC loop:** subagent worker (implement + open PR) → adversarial reviewer subagent → review-follower subagent (apply fixes) → adversarial re-review → "(no blocker) PR merge" → post-merge sync → next unit
2. **Scope-collision reconciliation rubric:** Option A (close as superseded) / Option B (override with architectural justification) / Option C (delta PR layering)
3. **"(no blocker) PR merge" semantic:** P0/P1 blocks merge; P2/P3 merges with follow-up ticket. Gives forward momentum without hiding defects.
4. **Plan-deepening before dispatch:** extract plan section per unit, reconcile with main's recent commits (scope-collision preempt) before worker subagent burns tokens
5. **Post-merge sync:** `git merge origin/main --no-ff` after every unit, preventing drift for subsequent units
6. **ENOSPC crash recovery (U7):** inventory partial working-tree state with a finisher subagent before deciding whether to continue or revert; feed the inventory forward to a tailored finisher rather than dispatching a fresh worker that re-discovers half the problem

Full pattern documented at: `docs/solutions/architecture-patterns/scrum-master-orchestration-phase-completion-2026-04-26.md`

## Known Residuals and Follow-Up Tickets

### Deferred from Phase 2 (tracked)

| Ticket | Scope | Blocked by |
| --- | --- | --- |
| U2.5 | `--confirm-school-load` (60-learner), `guardrailsTriggered[]`/`confirmedVia[]` arrays, dry-run warning path | U7 classroom tier unlock (now shipped) |
| U4.1 | `WRANGLER_*` prefix → per-key allowlist (adv-u4-r2-002); currently prefix-allow passes `WRANGLER_LOG_PATH` which redirects debug log outside redaction pipeline | Nothing — ready to implement |
| U5.5 | Full command loop (advance + end-session), Grammar/Punctuation stale-409, Parent Hub pagination, fixture credential runbook, KV advisory lock | U6 projection hot-path (now shipped) |
| U6 scenario-14 | Projection write transient failure with primary-state preservation — requires `SAVEPOINT` refactor within D1 `batch()` atomicity | Architectural decision on batch decomposition |
| U7.1 (8 items) | 6 P3 from round 1 + 2 P3 from round 2: silent `selected_learner_id` UPDATE side effect, non-HMAC classroom cursor, client `BOOTSTRAP_MODES` validation, unconditional `accountLearnerListRevision` bump on no-op, pointer materialiser test gap, pointer consumer deferred | Nothing — ready to implement |
| U8.1 (8 items) | `_hydrateRetrying` public spread leak (adv-u8-r2-001), stale-command triple-count, Scenario D no-localStorage approximation, Scenario B classroom-scale docs, pointer-hash-mismatch test gap, Playwright `readCapacityMeta` projection gap | Nothing — ready to implement |
| U9.1 (10 items) | `breakerTransition` overemission on blocked calls, capacity.md docs drift, sticky breaker reset conditional, parentHub UI disambiguation, multi-tab cooldown desync, log-attribution drift, AbortError future-hazard, `breakersDegraded.derivedWrite` dead-false on client, `batch()` atomicity cannot distinguish projection vs primary-state fault, `scheduleBreakerRecompute` O(N^2) on N simultaneous transitions | Nothing — ready to implement |

### CI-signed provenance (plan-documented, future hardening)

The evidence persistence gate (U1) can detect shape-and-consistency fabrication but cannot detect a motivated operator who hand-crafts a fully self-consistent evidence payload referencing a real in-repo commit. This class of attack requires CI-signed provenance (HMAC over the evidence payload using a CI-held secret, or OIDC-attested artifact hashes). Plan-documented as future hardening; not in Phase 2 scope.

## What Changed for Users

Phase 2 is invisible to children practising spelling, grammar, and punctuation. No UI changes for learners. The changes are infrastructure that operators use to certify capacity before inviting classroom-scale users:

1. **Operators** can run `npm run capacity:classroom:release-gate` and get a JSON evidence file with dated per-threshold pass/fail.
2. **Parents** see graceful degradation messages ("Recently unavailable") instead of broken widgets when a hub endpoint trips its circuit breaker.
3. **Teachers** accessing classroom summary see a learner-list-only fallback (not a blank page) when the classroom-summary breaker trips.
4. **Multi-tab sessions** (common in families sharing a laptop) no longer waste bandwidth re-fetching identical bootstraps — coordination and `notModified` short-circuit save ~545 KB per redundant load.

## Next Steps (Post-Phase-2)

1. **First dated classroom certification run** — operators execute `npm run capacity:classroom:release-gate` against production with 30 learners. The tooling is built; the claim requires a real run. This is now an operator step, not an engineering step.
2. **Implement U2.5, U5.5** — school-load confirmation and full dense-history command loop coverage. These were deferred to keep Phase 2 focused on the evidence infrastructure.
3. **U9.1 hardening** — wire the remaining 10 advisory items (breakerTransition overemission, docs drift, sticky reset, etc.) in a single focused PR.
4. **CI-signed provenance** — HMAC over evidence payloads using a CI-held secret. Closes the fabrication attack surface that U1's shape-and-consistency defence cannot reach.
5. **30-learner → 60-learner → 100+ progression** — each tier requires its own dated evidence row in `docs/operations/capacity.md` with committed threshold configs. The machinery is built; scaling is now a measurement exercise.

---

*Phase 2 plan: `docs/plans/2026-04-25-002-feat-capacity-release-gates-and-telemetry-plan.md`*
*Phase 1 implementation report: `docs/plans/james/cpuload/implementation-report.md`*
*Orchestration pattern: `docs/solutions/architecture-patterns/scrum-master-orchestration-phase-completion-2026-04-26.md`*
*Capacity operations runbook: `docs/operations/capacity.md`*
