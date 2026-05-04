---
title: "feat: Hero Mode pA4 — Productionisation and Limited External Release Delivery"
type: feat
status: active
date: 2026-04-30
origin: docs/plans/james/hero-mode/A/hero-mode-pA4.md
---

# Hero Mode pA4 — Productionisation and Limited External Release Delivery

## Overview

Deliver the full pA4 contract: external cohort rollout control, simulated external cohort evidence, product/safety metrics infrastructure, support pack, and default-on decision framework. This transforms Hero Mode from an internally-proven feature into a controlled, externally-ready production feature with rollback control, support coverage, and a grounded default-on decision.

---

## Problem Frame

Hero Mode has passed through P0–P6 feature work and A1–A3 assurance. pA3 built provenance-aware certification, telemetry extraction, and operational templates. The remaining gap: Hero Mode cannot yet be exposed to real external families because there is no external cohort control mechanism distinct from internal testing, no parent/support communication pack, and no automated validation proving the system behaves correctly under multi-day external cohort conditions.

pA4 closes this gap by:
1. Adding `HERO_EXTERNAL_ACCOUNTS` with classified internal/external ops output
2. Validating all 13 stop conditions and 9 warning conditions with automated guards
3. Building metrics infrastructure for all required launch/product/safety signals
4. Simulating a diverse external cohort across multiple date-key rollovers
5. Producing all 10 contract deliverables (see origin §19)

---

## Requirements Trace

- R1. External cohort rollout control — `HERO_EXTERNAL_ACCOUNTS` resolver with hierarchy (origin §6 Goal 1)
- R2. Same resolved flag view for read model and command routes (origin §6 Goal 1)
- R3. Every cohort decision observable in ops output (origin §6 Goal 1)
- R4. Multi-day cohort simulation with diverse learner states (origin §6 Goal 2)
- R5. Product signal measurement infrastructure (origin §6 Goal 3, §13.2)
- R6. Safety signal measurement infrastructure (origin §6 Goal 3, §13.3)
- R7. All 13 stop conditions have guard tests (origin §11)
- R8. All 9 warning conditions have detection/reporting (origin §12)
- R9. Parent/adult explainer document (origin §14.1, §6 Goal 4)
- R10. Support triage pack with escalation rules (origin §14.2, §6 Goal 4)
- R11. Operator health lookup route/script (origin §6 Goal 4)
- R12. Default-on decision framework and staged ladder (origin §6 Goal 5)
- R13. Release candidate note (origin §19 item 2)
- R14. External cohort evidence template (origin §19 item 5)
- R15. Metrics summary framework (origin §19 item 6)
- R16. Stop/warning condition register (origin §19 item 7)
- R17. Rollback evidence note (origin §19 item 8)
- R18. Final recommendation template (origin §19 item 9)
- R19. Staged default-on plan template (origin §19 item 10)
- R20. Required launch metrics infrastructure (origin §13.1)
- R21. Browser smoke validation script for critical flow (origin §4.2)
- R22. Malformed JSON fails closed (origin §15.1)
- R23. Non-listed accounts inherit global flags (origin §15.1)
- R24. No new persistent state shape unless essential (origin §15.2)

---

## Scope Boundaries

- No new Hero gameplay, monsters, earning rules, or economy mechanics
- No percentage/hash bucketing (simple allowlist for first cohort per origin §15.1)
- No UI changes — this is infrastructure and operational readiness
- No modifications to existing Hero runtime logic (read model, commands, camp)
- No real external family recruitment (DEFERRED: requires human)
- No real production observation window (DEFERRED: requires calendar time)
- No named product/engineering/support owner assignment (DEFERRED: requires human)

### Deferred to Follow-Up Work

- Real external family recruitment with parent consent — requires human outreach
- Real 7-14 day observation window — requires calendar time after deployment
- Named role assignments (product owner, daily review owner, support owner) — requires human decision
- Percentage/hash bucketing — only needed if A4 includes a second wider ring (origin §15.1)

---

## Context & Research

### Relevant Code and Patterns

- `shared/hero/account-override.js` — existing per-account override resolver (pure function, 50 lines)
- `shared/hero/metrics-contract.js` — 48 canonical metric names across 4 categories
- `shared/hero/metrics-privacy.js` — recursive privacy validation with forbidden field scanning
- `worker/src/hero/telemetry-probe.js` — existing telemetry probe with expanded response
- `worker/src/hero/readiness.js` — health/readiness check pure function
- `worker/src/app.js` lines 1431-1925 — Hero routes using `resolveHeroFlagsWithOverride`
- `tests/hero-pA1-account-override.test.js` — test pattern for override resolver
- `tests/hero-pA3-certification-evidence.test.js` — provenance gate validation pattern
- `scripts/hero-pA3-cohort-smoke.mjs` — daily observation recorder pattern
- `scripts/hero-pA3-telemetry-extract.mjs` — Goal 6 signal extraction (16 signals)

### Institutional Learnings

- Evidence-as-infrastructure pattern: scripts/templates delivered without touching runtime code
- Operational symmetry: internal and external cohort use identical tooling with `--source` flag
- Provenance-gated certification: real-production rows gate-worthy, simulation visible but non-satisfying
- pA3 adversarial review: 4 rounds × 10 reviewers established the validation cadence

### External References

- None required — local patterns are comprehensive and production-proven

---

## Key Technical Decisions

- **Extend account-override.js, not replace**: Add `HERO_EXTERNAL_ACCOUNTS` as a parallel env var with the same resolver pattern. This preserves backward compatibility with existing internal cohort tooling.
- **Classify override source in ops output**: Return `overrideStatus: 'internal' | 'external' | 'global' | 'none'` so operators can distinguish cohort membership.
- **Simulation over real observation**: Multi-day cohort behavior is validated through date-key rollover simulation with diverse learner fixtures, not blocked on real calendar time.
- **Documents as code**: Support pack, parent explainer, and decision templates are markdown deliverables validated by automated structure checks.
- **Test runner**: Node.js built-in `--test` (project standard, not vitest/jest).

---

## Open Questions

### Resolved During Planning

- **How to gate external vs internal?** Separate env vars (`HERO_INTERNAL_ACCOUNTS` stays, `HERO_EXTERNAL_ACCOUNTS` added). Same resolver function with classification output.
- **Should resolver handle priority conflicts?** No — if an account appears in both lists, classify as `internal` (internal takes precedence per origin §15.1 hierarchy).
- **Where do support docs live?** `docs/plans/james/hero-mode/A/` alongside existing pA3 operational docs.

### Deferred to Implementation

- Exact wording of parent explainer copy (implementer follows origin §14.1 constraints)
- Exact metric event shapes (implementer follows `shared/hero/metrics-contract.js` patterns)

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Resolver Hierarchy (origin §15.1):

  resolveHeroFlagsForAccount({ env, accountId })
    │
    ├── 1. Global Hero flags (HERO_MODE_*_ENABLED) — default authority
    ├── 2. HERO_INTERNAL_ACCOUNTS — force-enable for staff/testing
    ├── 3. HERO_EXTERNAL_ACCOUNTS — force-enable for early access
    └── 4. Non-listed accounts — inherit global flags (hidden while off)

  Returns: { resolvedEnv, overrideStatus: 'internal'|'external'|'global'|'none' }

  Rules:
  - Internal takes precedence over external (if in both lists)
  - Malformed JSON → fail closed (return global flags, log warning)
  - Same resolved env used by read model AND command routes
  - overrideStatus visible in ops output, never in child-facing response
```

---

## Implementation Units

- U1. **External Cohort Resolver**

**Goal:** Extend the account override mechanism to support `HERO_EXTERNAL_ACCOUNTS` with classified internal/external/global/none status in ops output.

**Requirements:** R1, R2, R3, R22, R23

**Dependencies:** None

**Files:**
- Modify: `shared/hero/account-override.js`
- Test: `tests/hero-pA4-external-cohort-resolver.test.js`

**Approach:**
- Add `resolveHeroFlagsForAccount({ env, accountId })` that returns `{ resolvedEnv, overrideStatus }`
- Keep existing `resolveHeroFlagsWithOverride` as backward-compatible wrapper (calls new function, returns only `resolvedEnv`)
- Parse `HERO_EXTERNAL_ACCOUNTS` with same safety: null/empty → skip, malformed JSON → fail closed
- Internal takes precedence over external
- Pure function, zero side effects

**Patterns to follow:**
- Existing `resolveHeroFlagsWithOverride` in `shared/hero/account-override.js`
- Test pattern in `tests/hero-pA1-account-override.test.js`

**Test scenarios:**
- Happy path: account in HERO_EXTERNAL_ACCOUNTS → all 6 flags enabled, overrideStatus = 'external'
- Happy path: account in HERO_INTERNAL_ACCOUNTS → all 6 flags enabled, overrideStatus = 'internal'
- Happy path: account in neither list → global flags unchanged, overrideStatus = 'global' (if any flag on) or 'none'
- Edge case: account in BOTH lists → internal takes precedence, overrideStatus = 'internal'
- Edge case: HERO_EXTERNAL_ACCOUNTS is null/undefined/empty string → skip gracefully, return global
- Edge case: HERO_EXTERNAL_ACCOUNTS is malformed JSON → fail closed, return global flags, overrideStatus = 'none'
- Edge case: HERO_EXTERNAL_ACCOUNTS is valid JSON but not array → fail closed
- Edge case: HERO_EXTERNAL_ACCOUNTS is empty array `[]` → no override
- Edge case: accountId is null/undefined → no override regardless of lists
- Integration: backward compatibility — `resolveHeroFlagsWithOverride` returns same shape as before

**Verification:**
- All tests pass with `npm test -- tests/hero-pA4-external-cohort-resolver.test.js`
- Existing `hero-pA1-account-override.test.js` still passes (backward compat)

---

- U2. **Route Integration — Unified Resolver**

**Goal:** Integrate the new resolver into read model and command routes so both use the same resolved flag view and ops output includes overrideStatus.

**Requirements:** R2, R3, R24

**Dependencies:** U1

**Files:**
- Modify: `worker/src/app.js` (Hero route section only)
- Modify: `worker/src/hero/telemetry-probe.js` (include overrideStatus in expanded probe)
- Test: `tests/hero-pA4-route-integration.test.js`

**Approach:**
- Replace `resolveHeroFlagsWithOverride({ env, accountId })` call sites with `resolveHeroFlagsForAccount({ env, accountId })`
- Destructure `{ resolvedEnv, overrideStatus }` — pass `resolvedEnv` to existing logic, attach `overrideStatus` to ops/debug output
- Include `overrideStatus` in telemetry probe expanded response
- Ensure read model route and command route use the exact same resolver call (not two separate calls)
- No new persistent state — overrideStatus is ephemeral, computed per-request

**Patterns to follow:**
- Existing route pattern at `worker/src/app.js` line 1431+ where `resolveHeroFlagsWithOverride` is called
- `buildExpandedProbeResponse` in `worker/src/hero/telemetry-probe.js` already accepts `overrideStatus`

**Test scenarios:**
- Happy path: read model request for external account returns Hero data + debug.overrideStatus = 'external'
- Happy path: command request for external account succeeds with same resolved flags
- Edge case: non-cohort account with global flags off → read model returns hidden/disabled
- Edge case: non-cohort account with global flags off → command route returns 404/disabled
- Integration: read model and command route for same account return consistent overrideStatus

**Verification:**
- All tests pass
- Existing hero route tests still pass (no behavioral change for internal accounts)

---

- U3. **Stop Condition Guards**

**Goal:** Implement automated guard tests for all 13 stop conditions from origin §11, each with a reproducible fixture that proves the system detects and prevents the violation.

**Requirements:** R7

**Dependencies:** U1

**Files:**
- Create: `tests/hero-pA4-stop-conditions.test.js`
- Create: `shared/hero/stop-conditions.js` (pure detection functions)

**Approach:**
- One test group per stop condition (13 groups)
- Each group has: a fixture that would trigger the condition + assertion that the system blocks/detects it
- Pure detection functions in shared/ allow reuse in ops scripts
- Detection functions return `{ triggered: boolean, condition: string, detail: string }`

**Test scenarios:**
- Stop 1: raw child content in telemetry → privacy validator catches and strips
- Stop 2: non-cohort account sees Hero surfaces → resolver correctly hides
- Stop 3: Hero command succeeds for non-enabled account → route rejects
- Stop 4: duplicate daily coin award → economy idempotency prevents
- Stop 5: duplicate Camp debit → CAS + dedup prevents
- Stop 6: negative balance → economy invariant rejects
- Stop 7: claim without Worker-verified completion → claim validator rejects
- Stop 8: Hero mutates subject Stars/mastery → subject boundary guard
- Stop 9: dead CTA (unlaunchable primary action) → readiness check detects
- Stop 10: rollback cannot hide while preserving state → flag-off test
- Stop 11: repeated 500s on Hero routes → error rate detection
- Stop 12: support cannot triage → triage fields present in error output
- Stop 13: parent feedback indicates pressure → copy validator (no pressure vocabulary)

**Verification:**
- All 13 stop condition test groups pass
- Each detection function is independently testable

---

- U4. **Warning Condition Detection**

**Goal:** Implement automated detection and reporting for all 9 warning conditions from origin §12.

**Requirements:** R8

**Dependencies:** U1, U3

**Files:**
- Create: `tests/hero-pA4-warning-conditions.test.js`
- Create: `shared/hero/warning-conditions.js` (pure analysis functions)

**Approach:**
- Warning conditions are product-health signals, not hard blocks
- Each returns `{ flagged: boolean, condition: string, severity: 'warning', detail: string, recommendation: string }`
- Analysis functions take cohort metrics summary as input

**Test scenarios:**
- Warning 1: low Hero Quest start rate (< threshold) → flagged with recommendation
- Warning 2: low completion rate → flagged
- Warning 3: repeated abandonment after first task → detected from abandonment distribution
- Warning 4: children open Camp but don't start learning → Camp-before-learning ratio
- Warning 5: parents misunderstand Hero Coins → detected from support report signals
- Warning 6: telemetry blind spots → missing signal detection
- Warning 7: one subject dominates schedule → subject mix imbalance detection
- Warning 8: support questions cluster → classification density check
- Warning 9: performance slower than ideal → latency threshold detection

**Verification:**
- All 9 warning condition tests pass
- Functions accept structured metrics input and return actionable output

---

- U5. **Metrics Infrastructure — Launch and Safety**

**Goal:** Build the required launch metrics (§13.1) and safety metrics (§13.3) collection infrastructure as validation functions and extraction queries.

**Requirements:** R6, R20

**Dependencies:** U1, U3

**Files:**
- Create: `scripts/hero-pA4-metrics-validator.mjs` (validates all required metrics are extractable)
- Create: `tests/hero-pA4-metrics-infrastructure.test.js`
- Modify: `shared/hero/metrics-contract.js` (add pA4-specific metric names if not already present)

**Approach:**
- Validate that all 18 required launch metrics (§13.1) exist in the metrics contract
- Validate that all 10 required safety metrics (§13.3) exist
- Build extraction query templates for each metric category
- Reuse existing `hero-pA3-telemetry-extract.mjs` pattern for extraction logic

**Patterns to follow:**
- `scripts/hero-pA3-telemetry-extract.mjs` — 16-signal extraction with confidence classification
- `shared/hero/metrics-contract.js` — canonical metric name registry

**Test scenarios:**
- Happy path: all 18 launch metrics mapped to extractable event_log queries
- Happy path: all 10 safety metrics have detection logic (zero-tolerance: duplicates, negatives, leaks)
- Edge case: metric not yet emitted (pre-cohort) → extraction returns null with explanation, not error
- Edge case: metric partially available (server-side only, no client signal) → confidence classification
- Integration: extraction output matches pA3 metrics summary 9-column format

**Verification:**
- Validator script exits 0 when all metrics are mapped
- All tests pass

---

- U6. **Metrics Infrastructure — Product Signals**

**Goal:** Build the required product metrics (§13.2) measurement infrastructure including reward farming detection and subject mix analysis.

**Requirements:** R5

**Dependencies:** U5

**Files:**
- Create: `scripts/hero-pA4-product-metrics.mjs` (product signal extraction and analysis)
- Create: `tests/hero-pA4-product-metrics.test.js`
- Create: `shared/hero/product-signals.js` (pure analysis functions)

**Approach:**
- 11 required product metrics from §13.2: start rate, completion rate, return, subject mix, intent mix, abandonment, support reports, extra practice, Camp usage
- Reward farming detection: rapid repeated claims, clock manipulation patterns
- Subject mix analysis: distribution across spelling/grammar/punctuation with imbalance threshold

**Test scenarios:**
- Happy path: diverse cohort data → correct start/completion rate calculation
- Happy path: return-next-day detection from date-key sequence
- Happy path: subject mix with balanced distribution → no imbalance flag
- Edge case: single-subject learner → mix is 100% one subject, not an error
- Edge case: reward farming pattern (3+ claims within 5 minutes) → flagged
- Edge case: empty cohort data → graceful null/zero output
- Integration: product metrics feed into warning condition analysis (U4)

**Verification:**
- All tests pass
- Product signals produce structured output compatible with metrics summary framework

---

- U7. **Multi-Day Cohort Simulation**

**Goal:** Create comprehensive test fixtures simulating a diverse 7-day external cohort with multiple date-key rollovers, diverse learner states, and all required cohort characteristics from origin §6 Goal 2.

**Requirements:** R4

**Dependencies:** U1, U5, U6

**Files:**
- Create: `tests/fixtures/hero-pA4-external-cohort-simulation.js`
- Create: `tests/hero-pA4-cohort-simulation.test.js`

**Approach:**
- Simulate 8 external family accounts across 7 date-keys
- Required diversity (origin §6 Goal 2): spelling-focused, grammar-ready, punctuation-ready, first-time Hero state, can-afford-Camp, cannot-afford-Camp, multi-device
- Each simulated day: quest shown → start → task completion → claim → coin award → optional Camp
- Date-key rollover tests: prove Hero Quest resets correctly, no carryover corruption
- Multi-device tests: prove same account different sessions are safe

**Test scenarios:**
- Happy path: 7-day sequence with daily quest completion → coins accumulate correctly
- Happy path: learner with grammar-ready signals → grammar tasks scheduled
- Happy path: first-time Hero state → correct initial quest generation
- Happy path: can-afford Camp learner → successful Camp action on day 3
- Happy path: cannot-afford Camp learner → calm insufficient-coins response
- Edge case: date-key rollover at midnight → quest resets, yesterday's progress preserved
- Edge case: multi-device same account → no duplicate daily award across devices
- Edge case: partial day completion → next day starts fresh quest
- Integration: 7-day simulation produces full metrics dataset that U5/U6 can extract

**Verification:**
- All simulation tests pass
- Cohort covers all 7 diversity requirements from origin §6 Goal 2
- Date-key rollover produces correct state transitions

---

- U8. **Browser Smoke Validation Script**

**Goal:** Create an automated browser smoke check script validating the critical Hero flow from origin §4.2.

**Requirements:** R21

**Dependencies:** U1, U2

**Files:**
- Create: `scripts/hero-pA4-external-cohort-smoke.mjs`
- Create: `tests/hero-pA4-browser-smoke.test.js`

**Approach:**
- Validate the critical flow: `Hero visible → start task → subject session → return → claim → coins → Camp → rollback-hidden`
- Script produces structured pass/fail output for each step
- Designed to run against local dev server or staging
- Test file validates the script's logic without requiring a real browser (mock route responses)

**Patterns to follow:**
- `scripts/hero-pA3-cohort-smoke.mjs` — existing observation recorder
- `tests/journeys/hero-pA*.mjs` — existing E2E journey patterns

**Test scenarios:**
- Happy path: full flow completes → all 8 steps pass
- Happy path: rollback (flags off) → Hero surfaces hidden, state preserved
- Edge case: external cohort account → flow works
- Edge case: non-cohort account → Hero not visible (step 1 correctly fails-as-expected)
- Edge case: mid-flow rollback → graceful degradation, no data loss

**Verification:**
- Script exits 0 on successful flow validation
- Unit tests validate each step's detection logic

---

- U9. **Parent/Adult Explainer**

**Goal:** Create the parent/adult early-access explainer document following origin §14.1 constraints precisely.

**Requirements:** R9

**Dependencies:** None

**Files:**
- Create: `docs/plans/james/hero-mode/A/hero-pA4-parent-explainer.md`
- Create: `tests/hero-pA4-parent-explainer-validation.test.js`

**Approach:**
- Must include: daily mission across ready subjects, spelling/grammar/punctuation where ready, more subjects later, Stars belong to subjects, coins for daily completion not speed/correctness, Camp is optional, this is early access
- Must NOT include: six-subject claim, per-answer coins, missed-day punishment, replacement for subject practice, final/default for everyone
- Validation test checks document for forbidden phrases and required content markers

**Test scenarios:**
- Happy path: document contains all 7 required statements from origin §14.1 "should say"
- Edge case: document does NOT contain any of 5 forbidden statements from origin §14.1 "should not say"
- Edge case: no pressure vocabulary (gambling, scarcity, punishment, streak language)
- Edge case: locked subjects described calmly (not as missing features)

**Verification:**
- Validation test passes
- Document is human-readable and parent-appropriate

---

- U10. **Support Triage Pack**

**Goal:** Create the complete support pack: triage guide, known-issues section, rollback instruction, and escalation rules from origin §6 Goal 4 and §14.2.

**Requirements:** R10

**Dependencies:** U3, U9

**Files:**
- Create: `docs/plans/james/hero-mode/A/hero-pA4-support-pack.md`
- Create: `tests/hero-pA4-support-pack-validation.test.js`

**Approach:**
- Triage guide collects: account ID, learner ID, dateKey, time, device/browser, visible surface, request ID, issue category
- Known-issues section: blank template ready for population
- Rollback instruction: step-by-step from pA3-rollback-procedure pattern
- Escalation rules: privacy, duplicate rewards, dead CTA, state corruption → immediate escalation
- Validation test checks required sections exist and forbidden collection items (raw answer text, screenshots with child content) are explicitly excluded

**Patterns to follow:**
- `docs/plans/james/hero-mode/A/hero-pA3-support-checklist.md` — 16 stop conditions mapped to detection/response
- `docs/plans/james/hero-mode/A/hero-pA3-rollback-procedure.md` — step-by-step operational rollback

**Test scenarios:**
- Happy path: support pack contains all 6 required components (triage guide, known issues, rollback, escalation, safe collection list, forbidden collection list)
- Edge case: forbidden collection items explicitly listed as "do NOT collect"
- Edge case: escalation rules cover all 4 immediate-escalation categories

**Verification:**
- Validation test passes
- Support pack references are internally consistent

---

- U11. **Operator Health Lookup Script**

**Goal:** Create an operator-facing health lookup script that shows why an account is enabled/hidden and current Hero health state.

**Requirements:** R3, R11

**Dependencies:** U1, U2

**Files:**
- Create: `scripts/hero-pA4-operator-lookup.mjs`
- Create: `tests/hero-pA4-operator-lookup.test.js`

**Approach:**
- Takes accountId + env as input
- Returns: overrideStatus, resolved flags, readiness checks, last N events, reconciliation state
- Reuses existing `buildExpandedProbeResponse` from telemetry-probe.js
- Pure function logic tested without DB; script wraps with D1 access

**Patterns to follow:**
- `worker/src/hero/telemetry-probe.js` — `buildExpandedProbeResponse` pattern
- `worker/src/hero/readiness.js` — `deriveReadinessChecks` pattern

**Test scenarios:**
- Happy path: internal account → shows overrideStatus='internal', all flags enabled, readiness checks
- Happy path: external account → shows overrideStatus='external', all flags enabled
- Happy path: non-cohort account → shows overrideStatus='none', flags from global config
- Edge case: account with unhealthy state → readiness check failures visible
- Edge case: no event_log entries → graceful "no observations yet" output

**Verification:**
- All tests pass
- Script produces structured JSON output suitable for ops tooling

---

- U12. **External Cohort Evidence and Metrics Summary Templates**

**Goal:** Create the evidence template and metrics summary framework that operators will populate during the real cohort window.

**Requirements:** R14, R15

**Dependencies:** U5, U6, U7

**Files:**
- Create: `docs/plans/james/hero-mode/A/hero-pA4-external-cohort-evidence.md`
- Create: `docs/plans/james/hero-mode/A/hero-pA4-metrics-summary.md`
- Create: `tests/hero-pA4-evidence-template-validation.test.js`

**Approach:**
- Evidence template: 9-column provenance format (matching pA3 operational symmetry)
- Metrics summary: sections for launch metrics (18), product metrics (11), safety metrics (10)
- Validation test ensures all required metric names from §13.1–13.3 appear in the template
- Both documents are pre-populated with column headers and metric names, ready for data

**Patterns to follow:**
- `docs/plans/james/hero-mode/A/hero-pA3-external-cohort-evidence.md` — 9-column provenance schema
- `scripts/hero-pA3-metrics-summary.mjs` — metrics baseline format

**Test scenarios:**
- Happy path: evidence template contains all required columns (date, source, account, learner, signal, value, provenance, confidence, notes)
- Happy path: metrics summary lists all 18 launch + 11 product + 10 safety metrics by name
- Edge case: no metric from §13 is missing from the template

**Verification:**
- Validation test passes
- Templates match pA3 operational symmetry (same tooling can process both)

---

- U13. **Stop/Warning Register and Rollback Evidence Note**

**Goal:** Create the stop/warning condition register (operational document) and rollback evidence note documenting the rollback mechanism's verified state.

**Requirements:** R16, R17

**Dependencies:** U3, U4

**Files:**
- Create: `docs/plans/james/hero-mode/A/hero-pA4-risk-register.md`
- Create: `docs/plans/james/hero-mode/A/hero-pA4-rollback-evidence.md`
- Create: `tests/hero-pA4-register-validation.test.js`

**Approach:**
- Risk register: all 13 stop conditions + 9 warning conditions in tabular format with detection method, response action, owner placeholder, and status
- Rollback evidence: documents that flag-off preserves state, step-by-step procedure verified, re-enable produces identical readiness
- Validation test ensures all conditions from origin §11 and §12 appear

**Patterns to follow:**
- `docs/plans/james/hero-mode/A/hero-pA3-risk-register.md` — existing register format
- `docs/plans/james/hero-mode/A/hero-pA3-rollback-procedure.md` — rollback verification

**Test scenarios:**
- Happy path: register contains all 13 stop conditions by name
- Happy path: register contains all 9 warning conditions by name
- Happy path: rollback evidence documents preserve-state mechanism
- Edge case: each register entry has detection method and response action fields

**Verification:**
- Validation test passes
- Register covers 100% of conditions from origin

---

- U14. **Release Candidate Note and Final Recommendation Framework**

**Goal:** Create the release candidate note documenting the scope freeze, and the final recommendation + staged default-on plan templates.

**Requirements:** R12, R13, R18, R19

**Dependencies:** U1–U13

**Files:**
- Create: `docs/plans/james/hero-mode/A/hero-pA4-release-candidate.md`
- Create: `docs/plans/james/hero-mode/A/hero-pA4-recommendation.md`
- Create: `docs/plans/james/hero-mode/A/hero-pA4-default-on-plan.md`
- Create: `tests/hero-pA4-deliverables-validation.test.js`

**Approach:**
- Release candidate note: scope freeze (no new gameplay, economy, monsters per origin §15.3), allowed changes only (blocker fixes, rollout control, privacy, support, copy)
- Recommendation template: decision framework with three options, required evidence fields (boundary, cohort size, duration, risks, support load, value judgement, next mechanism, owner)
- Default-on plan template: staged ladder (new accounts → small bucket → wider → default-on per origin §6 Goal 5)
- Validation test ensures all required fields from origin §16.3 are present in recommendation template

**Patterns to follow:**
- `docs/plans/james/hero-mode/A/hero-pA3-recommendation.md` — existing template format

**Test scenarios:**
- Happy path: release candidate note lists all allowed change categories from origin §15.3
- Happy path: recommendation template has all 8 required fields from origin §16.3
- Happy path: default-on plan has staged ladder with 4 stages
- Edge case: recommendation enforces one-of-three decision (not open-ended)

**Verification:**
- All validation tests pass
- All 10 contract deliverables (origin §19) exist as files

---

## System-Wide Impact

- **Interaction graph:** `shared/hero/account-override.js` is imported by `worker/src/app.js` Hero routes. Extending it affects all Hero read model and command paths identically.
- **Error propagation:** Malformed `HERO_EXTERNAL_ACCOUNTS` fails closed (returns global flags). No new error surface for child-facing routes.
- **State lifecycle risks:** None — no new persistent state. `overrideStatus` is ephemeral per-request.
- **API surface parity:** Read model and command routes use the same resolver call (enforced by U2).
- **Integration coverage:** U7 cohort simulation exercises the full stack: resolver → read model → command → claim → economy → Camp.
- **Unchanged invariants:** All existing Hero Mode behavior (6-flag hierarchy, P0–P6 feature set, economy caps, Camp mechanics, privacy validation) remains completely unchanged. pA4 only extends the cohort control surface.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Existing account-override tests break when extending | Backward-compatible wrapper preserves old API surface |
| Route integration changes cause regression | Minimal change: only destructure additional field from resolver |
| Document validation tests are brittle | Test for semantic content markers, not exact wording |
| Cohort simulation doesn't cover real multi-device | Simulate session isolation; note limitation in evidence |
| pA3 recommendation still PENDING | Plan assumes PROCEED outcome; all work is additive regardless |

---

## Documentation / Operational Notes

- All 10 deliverables from origin §19 mapped to specific units
- Support pack and parent explainer follow strict content constraints from origin §14
- Metrics infrastructure validates against the canonical `metrics-contract.js` registry
- Rollback evidence note documents the already-verified preserve-state mechanism
- No deploy or CI changes required — all new files are scripts, tests, and docs

---

## Sources & References

- **Origin document:** [docs/plans/james/hero-mode/A/hero-mode-pA4.md](docs/plans/james/hero-mode/A/hero-mode-pA4.md)
- Related code: `shared/hero/account-override.js`, `shared/hero/metrics-contract.js`, `worker/src/app.js`
- Related docs: `docs/plans/james/hero-mode/A/hero-pA3-plan-completion-report.md`
- Related PRs: #725–#742 (pA3 delivery)
