---
title: "feat: Hero Mode pA5 — Staged Default-On Production Release"
type: feat
status: active
date: 2026-04-30
origin: docs/plans/james/hero-mode/A/hero-mode-pA5.md
---

# feat: Hero Mode pA5 — Staged Default-On Production Release

## Overview

Extend the Hero Mode rollout infrastructure to support staged percentage-based default-on for eligible ready-subject learners. This adds deterministic account bucketing, emergency rollback, explicit exclusion, and the full rollout control ladder to the existing 4-way account-override resolver. The phase also delivers pre-A5 documentation clean-up, tightened exposure detection, safety regression tests, and all required A5 deliverable templates.

---

## Problem Frame

Hero Mode pA4 delivered the external cohort infrastructure (503 tests, 13 stop conditions, 9 warning conditions, metrics pipeline). The resolver currently classifies accounts as `internal | external | global | none` using explicit allowlists only. To move from cohort-gated to staged default-on, the resolver needs:

1. **Emergency brake** (`HERO_EMERGENCY_DISABLED`) — global kill switch overriding all other precedence
2. **Explicit exclusion** (`HERO_EXCLUDED_ACCOUNTS`) — named opt-out accounts
3. **Percentage bucketing** (`HERO_ROLLOUT_PERCENT` + `HERO_ROLLOUT_SALT`) — deterministic stable account-level bucketing
4. **Global default** — all eligible learners see Hero Mode

The pA4 documentation also has known drift items (stale paths, incorrect state storage wording, countable example rows) that must be fixed before any staged rollout begins.

(see origin: docs/plans/james/hero-mode/A/hero-mode-pA5.md)

---

## Requirements Trace

- R1. Extend rollout resolver to 6-way classification with strict precedence (origin §6.1)
- R2. Deterministic stable account-level bucketing via hash (origin §6.3)
- R3. Emergency rollback hides Hero surfaces and rejects commands without 500s (origin §6.4)
- R4. HERO_EXCLUDED_ACCOUNTS removes named accounts regardless of bucket/allowlist (origin §6.2)
- R5. Rollout-control tests prove determinism, reversibility, and no excluded-user leakage (origin §2.1)
- R6. Safety regression tests protect zero-tolerance invariants (origin §2.2)
- R7. Metrics sanity checks prove operator can see all required signals (origin §2.4)
- R8. Pre-A5 documentation clean-up: state storage wording, stale paths, test-count reconciliation, example rows (origin §5.1–5.5)
- R9. Tighten non-cohort exposure detection to require observed exposure signal (origin §5.6)
- R10. Production smoke check infrastructure for real accounts after stage changes (origin §2.3)
- R11. Staged rollout simulation proving gate logic works across Day 0–15 schedule (origin §7)
- R12. All 5 required A5 deliverable templates exist and are structurally valid (origin §12)
- R13. Rollback preserves state dormant at three levels: targeted, stage, emergency (origin §14)
- R14. Child surfaces never see raw account lists, rollout salts, or cohort membership (origin §6.1)
- R15. Malformed JSON in any env var fails closed (origin §12.1)

---

## Scope Boundaries

- Hero Mode remains three-subject only (spelling, grammar, punctuation)
- No new gameplay features, monsters, economy rules, or Camp mechanics
- No new child-facing copy changes
- No six-subject claims
- Real production deployment, external family recruitment, and named owner assignments are DEFERRED: requires human
- Cloudflare Workers secrets creation is DEFERRED: requires human (credentials)

### Deferred to Follow-Up Work

- Actual production rollout execution (Day 0–15 schedule requires named owners, real accounts, calendar time)
- pA4 → pA5 `PROCEED TO STAGED DEFAULT-ON` recommendation (requires real external cohort evidence)
- Parent/adult explainer approval for new families
- Production Cloudflare Workers secret bindings for HERO_ROLLOUT_SALT, HERO_EXCLUDED_ACCOUNTS

---

## Context & Research

### Relevant Code and Patterns

- `shared/hero/account-override.js` — Current 4-way resolver (110 lines, pure function, fail-closed)
- `shared/hero/stop-conditions.js` — 13 stop condition guards (381 lines, pure, zero I/O)
- `shared/hero/warning-conditions.js` — 9 warning condition detectors (328 lines)
- `shared/hero/product-signals.js` — Rate calculations, farming detection, camp usage analysis (284 lines)
- `worker/src/app.js` — Integration point (override resolver called before feature flag gates)
- `worker/src/hero/routes.js` — Read-model handler (110 lines, progressive feature composition)
- `tests/hero-pA4-external-cohort-resolver.test.js` — Existing resolver test pattern (21 tests)
- `tests/hero-pA4-stop-conditions.test.js` — Stop condition testing pattern (52 tests)

### Institutional Learnings

- D1 atomicity uses `batch()` not `withTransaction` (production no-op for the latter)
- Pure function testing pattern: env vars passed as object properties, never mocked via `process.env`
- Test runner: `node:test` + `node:assert/strict`, hand-written factories, no mocking framework
- Resolver applied early in request path BEFORE any feature flag gate (pA2 #683 security fix)

---

## Key Technical Decisions

- **Account-level bucketing over learner-level**: One household gets one coherent product experience. Learner eligibility still applies inside the account (origin §6.3)
- **Hash function**: Use a simple deterministic hash of `accountId + ':' + salt` producing a 0–99 value. No cryptographic hash needed — stability matters more than distribution quality for the small population sizes in early stages
- **Precedence is strict and linear**: `emergency-off > exclude > internal > external > rollout-bucket > global-default > none`. No combining, no weighting
- **Emergency-off rejects commands with 403, not 500**: The route handler returns a clear "Hero Mode is temporarily unavailable" status, not an error. State remains dormant (origin §6.4, §14)
- **Exposure detection signal required**: The stop condition `detectNonCohortExposure` will only trigger when a non-cohort account has OBSERVED exposure (heroSurfaceVisible, commandAccepted, or readModelEnabled), not merely because `overrideStatus === 'none'` (origin §5.6)

---

## Open Questions

### Resolved During Planning

- **Which hash algorithm for bucketing?** — Simple string-based hash (sum of char codes * prime + salt mixing) is sufficient. Crypto hashing is overkill for the population size and the requirement is only stability, not security.
- **Should emergency-off return 403 or 503?** — 403 with a dormant-state message. 503 implies transient server error which could trigger client retries.
- **Should rollout-bucket accounts get all 6 flags forced on?** — Yes, same as internal/external. The bucket is an exposure mechanism, not a partial-feature gate.

### Deferred to Implementation

- Exact char-code hash implementation (any deterministic function producing stable 0-99 from string input works)
- Whether `worker/src/hero/routes.js` needs modification or if `worker/src/app.js` changes are sufficient for route plumbing

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Resolver Precedence Ladder (extended from pA4):

  Input: { env, accountId }
  
  1. HERO_EMERGENCY_DISABLED === 'true'
     → return { resolvedEnv: env (flags untouched), overrideStatus: 'emergency-off' }
  
  2. accountId in HERO_EXCLUDED_ACCOUNTS
     → return { resolvedEnv: env (flags untouched), overrideStatus: 'excluded' }
  
  3. accountId in HERO_INTERNAL_ACCOUNTS
     → return { resolvedEnv: allFlagsOn, overrideStatus: 'internal' }
  
  4. accountId in HERO_EXTERNAL_ACCOUNTS
     → return { resolvedEnv: allFlagsOn, overrideStatus: 'external' }
  
  5. hash(accountId + ':' + HERO_ROLLOUT_SALT) < HERO_ROLLOUT_PERCENT
     → return { resolvedEnv: allFlagsOn, overrideStatus: 'rollout-bucket' }
  
  6. Any global HERO_MODE_*_ENABLED flag is 'true'
     → return { resolvedEnv: env, overrideStatus: 'global-default' }
  
  7. None of the above
     → return { resolvedEnv: env, overrideStatus: 'none' }

Route behaviour when overrideStatus === 'emergency-off':
  - Read-model: return empty/hidden Hero state (no Hero surfaces visible)
  - Commands: reject with 403 "Hero Mode temporarily unavailable", no state mutation
```

---

## Implementation Units

- U1. **Pre-A5 Documentation Clean-up**

**Goal:** Close all documentation drift items from contract §5.1–5.5 so the pA4 docs accurately describe the real implementation before any staged rollout begins.

**Requirements:** R8

**Dependencies:** None

**Files:**
- Modify: `docs/plans/james/hero-mode/A/hero-pA4-plan-completion-report.md`
- Modify: `docs/plans/james/hero-mode/A/hero-pA4-external-cohort-evidence.md`
- Modify: `docs/plans/james/hero-mode/A/hero-pA4-release-candidate.md`
- Modify: `docs/plans/james/hero-mode/A/hero-pA4-default-on-plan.md`

**Approach:**
- §5.1: Update any doc references that say Hero state lives in KV to correctly describe `child_game_state` with `system_id = 'hero-mode'`
- §5.2: Replace stale paths (`src/hero/routes/`, `shared/hero/metrics/`, `shared/hero/product-metrics.js`, `scripts/hero-pA4-cohort-simulation.mjs`) with real file paths
- §5.3: Change any universal test-count claims to named-suite format (e.g. "pA4 focused local suite: 503 tests")
- §5.5: Replace any example row in evidence template that has provenance `real-production` with `<!-- example row only, do not count -->` annotation or provenance `example-only`

**Patterns to follow:**
- Existing evidence template format in `hero-pA4-external-cohort-evidence.md`
- Named-suite format used in `hero-pA4-plan-completion-report.md`

**Test scenarios:**
- Test expectation: none — documentation-only changes with no runtime impact

**Verification:**
- No file in `docs/plans/james/hero-mode/A/` references `src/hero/routes/`, `shared/hero/metrics/`, `shared/hero/product-metrics.js`, or `scripts/hero-pA4-cohort-simulation.mjs`
- No evidence template row has provenance `real-production` as an example
- State storage descriptions reference `child_game_state` with `system_id = 'hero-mode'`

---

- U2. **Tighten Non-Cohort Exposure Detection**

**Goal:** Modify `detectNonCohortExposure` to require an observed exposure signal before triggering, eliminating false positives from normal non-cohort accounts that never saw Hero surfaces.

**Requirements:** R9

**Dependencies:** None

**Files:**
- Modify: `shared/hero/stop-conditions.js`
- Modify: `tests/hero-pA4-stop-conditions.test.js`

**Approach:**
- Extend `detectNonCohortExposure` signature to accept exposure signals: `{ accountId, env, heroSurfaceVisible, commandAccepted, readModelEnabled }`
- Only trigger stop condition when overrideStatus is 'none' OR 'excluded' AND at least one exposure signal is true
- If no exposure signals are true, return `{ triggered: false }` regardless of override status
- Maintain backward compatibility: if no exposure signals are provided and overrideStatus is 'none', still return `triggered: false` (fail safe — no false positives)

**Patterns to follow:**
- Existing stop condition function signatures in `shared/hero/stop-conditions.js`
- Return shape: `{ triggered: boolean, condition: string, detail: string }`

**Test scenarios:**
- Happy path: non-cohort account with `heroSurfaceVisible: true` → triggers
- Happy path: non-cohort account with `commandAccepted: true` → triggers
- Happy path: non-cohort account with `readModelEnabled: true` → triggers
- Happy path: cohort account (internal) with all exposure signals true → does NOT trigger
- Edge case: non-cohort account with all exposure signals false → does NOT trigger (the key fix)
- Edge case: no exposure signals provided (backward compat) → does NOT trigger
- Edge case: excluded account with exposure signal → triggers (excluded should never see Hero)
- Error path: missing accountId → returns not-triggered gracefully
- Error path: missing env → returns not-triggered gracefully

**Verification:**
- The function no longer false-positives on accounts with `overrideStatus === 'none'` that have no exposure signals
- Excluded accounts with exposure signals are caught
- All existing stop-condition tests still pass (backward compat)

---

- U3. **Extended Rollout Resolver**

**Goal:** Extend `shared/hero/account-override.js` to support the full 6-way classification with emergency-off, exclusion, and deterministic percentage bucketing.

**Requirements:** R1, R2, R4, R14, R15

**Dependencies:** None

**Files:**
- Modify: `shared/hero/account-override.js`

**Approach:**
- Add new env var parsing for: `HERO_EMERGENCY_DISABLED`, `HERO_EXCLUDED_ACCOUNTS`, `HERO_ROLLOUT_PERCENT`, `HERO_ROLLOUT_SALT`
- Insert emergency-off check as absolute first in precedence (before any other check)
- Insert excluded-account check as second (before internal/external lists)
- Insert rollout-bucket check after external list, before global-default
- Rename `_detectGlobalStatus` to handle the new 'global-default' status distinct from old 'global'
- Bucket hash: deterministic function of `accountId + ':' + salt` → value 0–99
- `resolvedEnv` for emergency-off and excluded: env unchanged (flags stay as-is, NOT force-enabled)
- `resolvedEnv` for rollout-bucket: all 6 flags force-enabled (same as internal/external)
- `overrideStatus` expands from 4 to 6 values: `'emergency-off' | 'excluded' | 'internal' | 'external' | 'rollout-bucket' | 'global-default' | 'none'`
- Malformed JSON in any list fails closed (existing pattern)
- Non-numeric or out-of-range HERO_ROLLOUT_PERCENT treated as 0 (fail closed)

**Patterns to follow:**
- Existing `parseAccountList` for JSON parsing with fail-closed on malformed input
- Existing `_applyAllFlags` for force-enabling all 6 flags
- Pure function, no side effects, no DB access

**Test scenarios:**
- Happy path: emergency-off overrides internal account → returns 'emergency-off', flags unchanged
- Happy path: excluded account not in any allowlist → returns 'excluded', flags unchanged
- Happy path: excluded account that IS in internal list → 'excluded' wins (higher precedence)
- Happy path: internal account → returns 'internal', all flags on (unchanged from pA4)
- Happy path: external account → returns 'external', all flags on (unchanged from pA4)
- Happy path: rollout bucket account (hash < percent) → returns 'rollout-bucket', all flags on
- Happy path: non-bucketed account (hash >= percent) with global flags → returns 'global-default'
- Happy path: no lists, no bucket, no globals → returns 'none'
- Edge case: HERO_ROLLOUT_PERCENT=0 → no accounts bucketed
- Edge case: HERO_ROLLOUT_PERCENT=100 → all accounts bucketed (if not emergency/excluded/listed)
- Edge case: malformed HERO_EXCLUDED_ACCOUNTS JSON → treated as empty (fail closed)
- Edge case: malformed HERO_ROLLOUT_PERCENT (NaN, negative, >100) → treated as 0
- Edge case: missing HERO_ROLLOUT_SALT → no bucketing possible (treated as percent=0)
- Edge case: same accountId + same salt → same bucket result across 1000 calls (stability)
- Edge case: different accountId + same salt → different bucket results (distribution)
- Integration: overrideStatus never leaks account lists or salt values in its string value

**Verification:**
- Full precedence ladder is respected in strict order
- Bucket is deterministic and stable across calls
- All malformed input fails closed
- Return shape is backward-compatible with existing callers

---

- U4. **Emergency Rollback Route Integration**

**Goal:** Wire the extended resolver into the worker routes so that emergency-off hides Hero surfaces and rejects Hero commands without 500 errors, and excluded accounts are similarly blocked.

**Requirements:** R3, R13, R14

**Dependencies:** U3

**Files:**
- Modify: `worker/src/app.js`
- Modify: `worker/src/hero/routes.js` (if needed for read-model gating)

**Approach:**
- After resolver returns, check `overrideStatus`:
  - `'emergency-off'` → read-model returns empty/hidden state; commands return 403 with dormant message
  - `'excluded'` → same behaviour as emergency-off (account must never see Hero)
- State is NOT mutated or deleted during rollback — existing `child_game_state` row remains untouched
- The 403 response body should include a machine-readable code (e.g. `{ error: 'hero-unavailable', reason: 'emergency-disabled' }`) but NOT reveal overrideStatus, account lists, or rollout internals
- `overrideStatus` continues to be included in `event_log` payloads for ops observability (existing pattern)
- Child-facing responses never include `overrideStatus`

**Patterns to follow:**
- Existing override resolution at lines 1431–1433 of `worker/src/app.js` (resolver called before gates)
- Existing event_log pattern for Hero read-model and command telemetry
- Existing 403 response pattern used elsewhere in the worker

**Test scenarios:**
- Happy path: emergency-off → read-model returns empty Hero state (no surfaces visible)
- Happy path: emergency-off → command request returns 403 with machine-readable error
- Happy path: excluded account → read-model returns empty, command returns 403
- Happy path: rollout-bucket account → full read-model and commands work normally
- Edge case: emergency-off does NOT delete or mutate child_game_state
- Edge case: emergency-off account re-enabled (flag removed) → state restored from dormant
- Edge case: 403 response body does NOT contain overrideStatus, account lists, or salt
- Integration: event_log still records overrideStatus for ops when emergency-off rejects
- Integration: existing internal/external accounts continue to work identically to pA4

**Verification:**
- Emergency-off truly hides ALL Hero surfaces for ALL accounts
- State is preserved dormant (re-enablement restores prior state)
- No 500 errors from rollback scenarios
- Child surfaces never expose rollout internals

---

- U5. **Rollout-Control Test Suite**

**Goal:** Deliver the contract-mandated test suite proving the rollout mechanism is deterministic, reversible, and not leaking to excluded users.

**Requirements:** R5

**Dependencies:** U3, U4

**Files:**
- Create: `tests/hero-pA5-rollout-resolver.test.js`

**Approach:**
- Pure function tests exercising `resolveHeroFlagsForAccount` with the extended env vars
- Route-level tests exercising the command/read-model rejection paths
- Stability tests running the same input N times and asserting identical output
- Privacy tests asserting overrideStatus is NOT in any child-facing response shape

**Patterns to follow:**
- `tests/hero-pA4-external-cohort-resolver.test.js` (21 tests, same import/assertion style)
- `node:test` + `node:assert/strict` conventions

**Test scenarios:**
- Resolver precedence: emergency-off > excluded > internal > external > rollout-bucket > global-default > none (full 7-level chain)
- Bucket stability: same account+salt produces same classification across 1000 invocations
- Bucket distribution: 10000 random accounts at 50% → distribution within 45-55% (statistical)
- Excluded account: cannot see Hero even if in internal list (precedence proven)
- Emergency-off: overrides ALL other statuses (proven with internal, external, bucket accounts)
- Route consistency: read-model and command route use same resolver, same account gets same result
- Ops visibility: event_log payload contains overrideStatus field
- Privacy: read-model response body does NOT contain overrideStatus, account lists, or salt
- Malformed JSON: each env var tested with broken JSON → fails closed
- Rollout percent edge: 0 means nobody, 100 means everyone (after exclusion/lists)

**Verification:**
- All contract §13.2 minimum tests are present: precedence, stability, excluded, emergency, route consistency, ops/privacy
- Tests are deterministic (no timing or network dependencies)

---

- U6. **Safety Regression Test Suite**

**Goal:** Deliver safety regression tests protecting zero-tolerance invariants that would trigger stop conditions during the staged rollout.

**Requirements:** R6

**Dependencies:** U2, U3, U4

**Files:**
- Create: `tests/hero-pA5-safety-regression.test.js`

**Approach:**
- Test each zero-tolerance safety metric from §8.3 / §10 against the stop-condition detectors
- Simulate each violation scenario and prove the detector catches it
- Prove that rollback (emergency-off) preserves state without deletion
- Prove that excluded accounts with accidental exposure signals are caught

**Patterns to follow:**
- `tests/hero-pA4-stop-conditions.test.js` (52 tests, pure function style)
- Factory functions for building test state objects

**Test scenarios:**
- Duplicate daily award: two awards for same dateKey → `detectDuplicateDailyAward` triggers
- Duplicate Camp debit: two debits for same actionId → `detectDuplicateCampDebit` triggers
- Negative balance: balance goes below 0 → `detectNegativeBalance` triggers
- Dead CTA: Hero Quest visible but no launchable task → `detectDeadCTA` triggers
- Raw child content: forbidden fields in telemetry → `detectRawChildContent` triggers
- Subject mutation: Hero command mutates Stars → `detectSubjectMutation` triggers
- Claim without completion: claim without Worker evidence → `detectClaimWithoutCompletion` triggers
- Rollback state loss: emergency-off applied → verify state object unchanged (dormant preservation)
- Non-cohort exposure (tightened): excluded account with readModelEnabled → triggers
- Non-cohort exposure (tightened): non-cohort account with NO exposure signal → does NOT trigger
- Rollback failure: emergency-off set but Hero surfaces still in read-model → `detectRollbackFailure` triggers

**Verification:**
- Every zero-tolerance metric from §8.3 has at least one test proving detection works
- Dormant state preservation is proven for emergency-off scenarios
- No false positives for the tightened exposure detection

---

- U7. **Metrics Sanity Validation**

**Goal:** Prove that all required A5 metrics (14 launch + 10 product + 10 safety) are derivable from the existing product-signals and stop-conditions infrastructure.

**Requirements:** R7

**Dependencies:** U2, U3

**Files:**
- Create: `tests/hero-pA5-metrics-sanity.test.js`
- Create: `scripts/hero-pA5-metrics-sanity-check.mjs`

**Approach:**
- Map each of the 34 required metrics to the function/signal that produces it
- Test that `buildProductSignalsSummary` from `product-signals.js` covers all product metrics
- Test that stop-condition functions cover all safety metrics
- The script `hero-pA5-metrics-sanity-check.mjs` is an operator tool that validates metric coverage against a simulated cohort dataset

**Patterns to follow:**
- `tests/hero-pA4-metrics-infrastructure.test.js` (27 tests)
- `scripts/hero-pA4-metrics-validator.mjs` (operator validation script)

**Test scenarios:**
- Happy path: simulated cohort with all metrics populated → `buildProductSignalsSummary` returns all 10 product metrics
- Happy path: all 14 launch metrics mapped to derivable event/signal sources
- Happy path: all 10 safety metrics mapped to specific stop-condition functions
- Edge case: empty cohort data → metrics return zeroes/nulls, not errors
- Edge case: partial cohort (some learners never started) → metrics handle gracefully
- Integration: script runs against simulated fixture and exits 0 with summary output

**Verification:**
- Every metric listed in contract §8.1, §8.2, §8.3 maps to an existing or tested function
- Operator can run the sanity-check script and see all metrics present

---

- U8. **Staged Rollout Simulation Tests**

**Goal:** Simulate the Day 0–15 staged rollout schedule proving gate logic works, stop conditions halt widening, and date-key rollovers are handled correctly.

**Requirements:** R11

**Dependencies:** U3, U5, U6

**Files:**
- Create: `tests/hero-pA5-staged-rollout-simulation.test.js`

**Approach:**
- Create a state-machine model of the rollout stages (preflight → stage-1 → stage-2 → stage-3 → decision)
- Simulate multi-day progression with fixture data for each stage
- Prove: stop condition at stage-1 → cannot advance to stage-2
- Prove: warning condition at stage-2 → requires daily classification before advancing
- Prove: 7 consecutive clear days at stage-3 → exit criteria met
- Prove: date-key rollover does not break resolver or state
- Prove: rollback from any stage preserves state

**Patterns to follow:**
- `tests/hero-pA4-cohort-simulation.test.js` (27 tests, multi-day simulation)
- Factory functions for building multi-day fixture data

**Test scenarios:**
- Happy path: clean progression through all 4 stages → exit criteria met
- Happy path: stop condition at stage-1 → widening halted, rollback possible
- Happy path: warning at stage-2 classified as 'accepted' → can advance
- Happy path: warning at stage-2 classified as 'stop widening' → halts
- Edge case: date-key rollover (midnight boundary) → resolver still stable
- Edge case: rollback from stage-3 to stage-1 → percentage reduced, state preserved
- Edge case: emergency-off from stage-3 → all accounts hidden immediately
- Edge case: re-enable after emergency-off → resumes at same stage
- Integration: resolver percent changes (0→5→25→100) produce correct population sizes from fixture accounts

**Verification:**
- The staged ladder logic is proven through state-machine coverage
- Stop conditions are gate-breaking (cannot advance while triggered)
- Date boundaries and state persistence are correct

---

- U9. **A5 Deliverable Templates and Scripts**

**Goal:** Create all required A5 deliverable artefacts: rollout resolver evidence script, live rollout log template, metrics summary template, support summary template, and production decision template.

**Requirements:** R12

**Dependencies:** U3, U5

**Files:**
- Create: `scripts/hero-pA5-rollout-resolver-evidence.mjs`
- Create: `docs/plans/james/hero-mode/A/hero-pA5-rollout-log.md`
- Create: `docs/plans/james/hero-mode/A/hero-pA5-metrics-summary.md`
- Create: `docs/plans/james/hero-mode/A/hero-pA5-support-summary.md`
- Create: `docs/plans/james/hero-mode/A/hero-pA5-production-decision.md`

**Approach:**
- **Resolver evidence script**: Runs resolver against fixture accounts and produces evidence proving all precedence levels work (internal, external, rollout-bucket, excluded, emergency-off, malformed JSON fail-closed, overrideStatus visibility)
- **Rollout log**: Timeline template with columns: date/time, flag/secret changed, population affected, operator, smoke result, stop/warning conditions, decision
- **Metrics summary**: Template with sections for all 14 launch + 10 product + 10 safety metrics, collection period, and cohort size
- **Support summary**: Template for parent/child support issues with resolution tracking
- **Production decision**: Template with all 4 possible outcomes (NORMALISE, HOLD, ROLL BACK, KEEP DORMANT) and required evidence for each

**Patterns to follow:**
- `docs/plans/james/hero-mode/A/hero-pA4-metrics-summary.md` (metrics template structure)
- `docs/plans/james/hero-mode/A/hero-pA4-external-cohort-evidence.md` (column definitions)
- `scripts/hero-pA4-metrics-validator.mjs` (operator script pattern)
- `docs/plans/james/hero-mode/A/hero-pA4-recommendation.md` (decision template)

**Test scenarios:**
- Test expectation: none — templates have no runtime behaviour. Script correctness covered by U5 resolver tests.

**Verification:**
- All 5 deliverables from contract §12 exist as files
- Rollout log template has all required columns from §12.2
- Metrics summary covers all metrics from §8.1–8.3
- Production decision template contains all 4 outcomes from §16
- Resolver evidence script runs without error against fixture data

---

- U10. **Deliverables Validation Test**

**Goal:** Prove all required A5 deliverables exist, are structurally valid, and contain the contract-mandated content.

**Requirements:** R12

**Dependencies:** U9

**Files:**
- Create: `tests/hero-pA5-deliverables-validation.test.js`

**Approach:**
- File existence checks for all 5 deliverable templates
- Content validation: each template contains its required sections/columns
- Production decision template must list all 4 outcomes
- Rollout log must have all required column headers
- Metrics summary must reference all 34 metrics
- Resolver evidence script must be importable and export expected functions

**Patterns to follow:**
- `tests/hero-pA4-deliverables-validation.test.js` (35 tests, file existence + content validation)

**Test scenarios:**
- Happy path: all 5 deliverable files exist at expected paths
- Happy path: rollout log template has required columns (date, flag, population, operator, smoke, conditions, decision)
- Happy path: metrics summary references all 14 launch metrics
- Happy path: metrics summary references all 10 product metrics
- Happy path: metrics summary references all 10 safety metrics
- Happy path: production decision template contains NORMALISE, HOLD, ROLL BACK, KEEP DORMANT
- Happy path: support summary template has resolution tracking structure
- Happy path: resolver evidence script is valid JS and exits without error
- Edge case: no template contains provenance 'real-production' as example data (§5.5 guard)

**Verification:**
- All contract §12 deliverables are validated as existing and structurally correct
- Test suite serves as ongoing regression guard against accidental template deletion

---

## System-Wide Impact

- **Interaction graph:** The resolver is called by `worker/src/app.js` for both read-model and command routes. Changes to resolver precedence affect ALL Hero Mode request paths.
- **Error propagation:** Emergency-off returns 403, not 500. This must not trigger error-rate alerts or retry loops in the client.
- **State lifecycle risks:** Emergency-off must NOT write, delete, or mutate `child_game_state`. The dormant pattern is read-only on disable, restore on re-enable.
- **API surface parity:** Both `/api/hero/read-model` (GET) and `/api/hero/command` (POST) must respect the same resolver with identical precedence.
- **Integration coverage:** The resolver+route integration must be tested end-to-end (not just resolver in isolation).
- **Unchanged invariants:** Hero Camp monsters, Hero Coins economy rules, subject engine boundaries, daily quest scheduling — none are modified by this plan.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Hash function produces poor distribution for small populations | Test with statistical assertions (45-55% at 50% target across 10000 accounts) |
| Emergency-off 403 response triggers client error handling that confuses users | Response body includes machine-readable code; client can show "temporarily unavailable" |
| Percentage bucketing might conflict with existing allowlist accounts | Precedence is strict — listed accounts are always resolved BEFORE bucket check |
| Tests depend on specific hash output values and break on algorithm change | Test stability (same input = same output) not specific values |
| Existing 503 pA4 tests may expect `overrideStatus` to only have 4 values | Backward compat: old callers using `resolveHeroFlagsWithOverride` still get only resolvedEnv |

---

## Sources & References

- **Origin document:** [docs/plans/james/hero-mode/A/hero-mode-pA5.md](docs/plans/james/hero-mode/A/hero-mode-pA5.md)
- Related code: `shared/hero/account-override.js`, `shared/hero/stop-conditions.js`, `shared/hero/product-signals.js`
- Related tests: `tests/hero-pA4-external-cohort-resolver.test.js`, `tests/hero-pA4-stop-conditions.test.js`
- Related PRs: #743–#751 (pA4 delivery)
- Related docs: `docs/plans/james/hero-mode/A/hero-mode-pA4.md`
