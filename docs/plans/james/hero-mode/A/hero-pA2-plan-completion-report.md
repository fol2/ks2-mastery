---
title: "Hero Mode pA2 — Plan Completion Report"
type: completion-report
status: complete
date: 2026-04-30
plan: docs/plans/2026-04-29-015-feat-hero-mode-pA2-evidence-cohort-ops-plan.md
origin: docs/plans/james/hero-mode/A/hero-mode-pA2.md
previous: docs/plans/james/hero-mode/A/hero-pA1-plan-completion-report.md
---

# Hero Mode pA2 — Plan Completion Report

## Executive Summary

pA2 code work is complete. The phase delivers a fully operationally observable, privacy-hardened, launchability-proven Hero Mode ready for internal cohort measurement. All 9 implementation units landed across 7 PRs with 71+ new tests and zero production regressions.

**Phase posture:** Code-complete. Internal cohort execution (Ring A2-2 + A2-3) is calendar-bound and awaits team configuration of `HERO_INTERNAL_ACCOUNTS` secret.

**Key outcome:** Hero Mode transitions from "code exists but unobserved in production" to "operators can see everything, privacy is machine-enforced at every depth, and a certification validator mechanically gates the A3 decision."

---

## Phase Position

```
P0─P1─P2─P3─P4─P5─P6 (feature development line)
                       │
                       └─ pA1 (validation code, COMPLETE)
                            │
                            └─ pA2 (evidence + ops + measurement, CODE COMPLETE)
                                 │
                                 └─ A3 (limited external cohort, GATED by A2 evidence)
```

Hero Mode's A-series (assurance line) is distinct from the P-series (feature line). A2 adds no gameplay, no new earning paths, and no mutations. It adds observability, privacy hardening, and the infrastructure to measure whether Hero Mode is safe to widen.

---

## Implementation Summary

### PRs Delivered (7 total)

| PR | Unit | Title | Tests Added | Key Deliverable |
|----|------|-------|-------------|-----------------|
| #660 | U2 | Recursive privacy validator extraction | 16 | `shared/hero/metrics-privacy.js` — validates forbidden fields at any nesting depth |
| #663 | U3 | Grammar mini-test launchability parity fix | 9 | `mini-test` → `satsset` mapping closes dead CTA gap |
| #662 | U4 | Ops probe expansion with readiness and health | 12 | Expanded admin probe with readiness checks, health indicators, reconciliation |
| #671 | U5 | Internal override surface verification | 16 | Comprehensive coverage of per-account override mechanism |
| #672 | U8 | Certification manifest and evidence validator | 16 | Machine-verifiable gate for A3 decision |
| #674 | U6+U7 | Cohort scripts and evidence templates | 2 (scripts) | Smoke script + metrics summary + evidence templates |
| #677 | U1+U9 | Evidence close-out and A3 recommendation | 0 (docs) | pA1 recommendation finalised; risk register; A3 scaffold |

### Test Impact

| Metric | Value |
|--------|-------|
| New test files created | 5 |
| New test cases | 71+ |
| Existing tests modified | 3 (intentional evolution for mini-test launchability) |
| Existing tests broken | 0 |
| Production code files modified | 4 |
| New shared modules | 1 (`shared/hero/metrics-privacy.js`) |
| New scripts | 3 |
| New evidence documents | 5 |
| Documentation files updated | 4 |

---

## Technical Decisions and Rationale

### 1. Recursive Privacy Validator (U2)

**Decision:** Extract recursive validation into `shared/hero/metrics-privacy.js` with dotted-path violation reporting.

**Rationale:** The existing `validateMetricPrivacy` only checked top-level keys — a payload like `{ data: { nested: { rawAnswer: "text" } } }` would pass. For internal cohort measurement, we need input-side rejection (not just output-side stripping). The shared module serves both: validation rejects events at write-time; stripping cleans output at read-time.

**Architecture insight:** The two-layer approach (validate-on-write + strip-on-read) provides defence-in-depth. If a forbidden field somehow enters the event_log (e.g., via a future bug in a producer), the output-side strip catches it before any operator sees it.

### 2. Grammar Launchability Fix (U3)

**Decision:** Add `'mini-test': 'satsset'` to the Grammar launch adapter rather than changing the provider's intent or suppressing envelopes.

**Rationale:** The Grammar engine already supports `satsset` mode (its mini-test equivalent). The adapter is the correct seam — it translates Hero intent to engine mode. Changing the provider would hide the breadth-maintenance intent; suppressing envelopes would reduce scheduling flexibility. One line in the adapter, full test coverage for all Grammar learner states.

**Evolution story:** pA1 proved the gap was safe via fallback (client skips non-launchable tasks). A2 makes it safe via direct mapping — a stronger guarantee because operators can now explain "this task launches as mini-test" rather than "a fallback fired."

### 3. Ops Probe Expansion (U4)

**Decision:** Wire existing pure modules (`readiness.js`, `analytics.js`) into the existing probe route with a `?learnerId=X` param rather than creating new routes.

**Rationale:** Keeps the admin surface minimal (one route) and auditable (one rate-limit bucket, one RBAC gate). The expansion is backwards-compatible — without the param, the original response shape is preserved. The ledger lives inside `heroState.economy.ledger` (embedded in state JSON), so loading hero state gives us everything.

### 4. Certification Manifest Pattern (U8)

**Decision:** Adopt the evidence-locked principle from grammar-qg but with a fundamentally different schema (file existence + observation counts vs content generation counts).

**Rationale:** The principle is transferable (a JSON manifest gates a decision mechanically), but the schema must fit the domain. Hero A2 validates multi-ring evidence accumulation; grammar-qg validates template×seed content generation. Dependency injection (`fileReader` parameter) makes the validator testable without filesystem mocking.

### 5. pA1 Evidence Supersession (U1)

**Decision:** Mark pA1 Rings 2/3/4 as "SUPERSEDED BY A2" rather than attempting to fill them with post-hoc evidence.

**Rationale:** Honesty over completeness. pA1's original Ring 2-4 scope was staging-level observation. A2 provides richer production-level observation (expanded probe, recursive privacy, real internal accounts). Claiming Ring 2 "passed" by running a smoke script in local dev would be over-claiming. Instead, we document the supersession clearly and let A2's evidence stand on its own merits.

---

## Architecture Insights

### Three-Layer Privacy Defence

```
Layer 1: Input validation (validateMetricPrivacyRecursive)
  → Rejects events with forbidden fields before they enter event_log
  → Reports violations with dotted paths for debugging

Layer 2: Storage (D1 event_log)
  → Events that pass validation are stored
  → If a producer bug bypasses validation, data reaches storage

Layer 3: Output stripping (stripPrivacyFields)
  → All probe/ops output is recursively stripped before returning
  → Catches anything that slipped past Layer 1
```

This is defence-in-depth applied to child privacy — the most critical non-functional requirement in the system.

### Certification as Code

The A3 decision is not a human judgment call in a markdown file. It is a machine-verifiable state:

```
scripts/validate-hero-pA2-certification-evidence.mjs
  → Reads reports/hero/hero-pA2-certification-manifest.json
  → Checks each ring's conditions against filesystem state
  → Reports: NOT_CERTIFIED / CERTIFIED_WITH_LIMITATIONS / CERTIFIED_PRE_A3
```

This prevents over-claiming. If the team says "A2 is done" but the validator reports `NOT_CERTIFIED` because cohort evidence has only 3 observations (minimum 5), the gap is visible and non-negotiable.

### The "No New Mutations" Discipline

A2 touches 4 production code files:
- `shared/hero/metrics-contract.js` — validation logic upgrade (no new state)
- `shared/hero/metrics-privacy.js` — new shared module (pure, no side-effects)
- `worker/src/hero/telemetry-probe.js` — expanded probe response (read-only)
- `worker/src/hero/launch-adapters/grammar.js` — one new mapping entry
- `shared/hero/hero-copy.js` — vocabulary allowlist update

None of these add state shapes, mutations, earning paths, or new event types. The discipline is structural: A-series phases add observability and evidence, not features.

---

## Risk Landscape

### Resolved Risks (3)

| Risk | Resolution |
|------|-----------|
| Grammar dead CTA for breadth-maintenance | `mini-test` → `satsset` mapping (PR #663) |
| Privacy validator misses nested fields | Recursive validation with depth-10 guard (PR #660) |
| Raw child content in ops output | Recursive stripping in shared module (PR #660) |

### Monitoring Risks (4)

| Risk | Verification Method |
|------|-------------------|
| Duplicate daily coin award | Ops probe health indicators during cohort |
| Camp debit race condition | Ops probe reconciliation gap detection |
| Rollback state preservation | Re-verify after cohort via flag disable |
| Non-internal account exposure | Ops probe override status field |

### Accepted Risks (3)

| Risk | Rationale |
|------|-----------|
| D1 tail latency (P95 = 4.2× P50) | Platform characteristic, not application bug |
| Cohort too small for meaningful baselines | Accept insufficient_data honestly; extend in A3 |
| Pre-existing test failures (D2 flag-ladder, semi-colon) | Introduced by punctuation-qg P8 merge; unrelated to Hero Mode |

---

## Product Contract Preservation

A2 explicitly preserves:

- ✅ Hero Mode remains default-off for all non-team accounts
- ✅ Subject engines own learning, mastery, Stars, and subject monsters
- ✅ Capped daily economy (+100/day) is the only earning path
- ✅ Hero Camp remains a spending/autonomy surface, not a learning-evidence surface
- ✅ No new gameplay, monsters, streaks, trading, or pressure mechanics
- ✅ Rollback preserves state dormant (never deletes balances, ledger, or ownership)
- ✅ No Hero command can mint subject Stars, alter mastery, or mutate subject monsters
- ✅ 6 Hero Pool monsters unchanged (glossbloom, loomrill, mirrane, colisk, hyphang, carillon)

---

## What Remains: Operational Execution

A2 code is complete. What remains is calendar-bound operational execution:

### Immediate Next Steps

1. **Configure `HERO_INTERNAL_ACCOUNTS` secret** with 3-10 team account IDs
2. **Run cohort smoke script** daily: `node scripts/hero-pA2-cohort-smoke.mjs --learner-ids <ids>`
3. **Observe for 5+ calendar days** with 2+ date-key rollovers
4. **Monitor stop conditions** — any trigger pauses widening immediately
5. **Run metrics summary** after observation window: `node scripts/hero-pA2-metrics-summary.mjs`
6. **Run certification validator**: `node scripts/validate-hero-pA2-certification-evidence.mjs`
7. **Complete A3 recommendation** based on evidence

### Calendar Estimate

- Day 0: Configure accounts, verify override works via ops probe
- Day 1-5: Daily smoke observations (automated or manual)
- Day 6: Run metrics summary, assess confidence levels
- Day 6-7: Complete recommendation, decide A3 posture

### Go/No-Go for A3

The certification validator will report one of:
- `CERTIFIED_PRE_A3` → Proceed to A3 (limited external cohort)
- `CERTIFIED_WITH_LIMITATIONS` → Proceed with stated limitations documented
- `NOT_CERTIFIED` → Hold and harden; list remediation items

---

## Session Metrics

| Metric | Value |
|--------|-------|
| Total PRs | 7 |
| Total new tests | 71+ |
| Production regressions | 0 |
| New files created | 14 |
| Existing files modified | 8 |
| Plan units | 9 |
| Sprints | 4 |
| Parallel workers used | 8 (3 + 2 + 1 + 1 + 1) |
| Pre-existing CI failures inherited | 2 (D2 flag-ladder, semi-colon combine) |

---

## File Inventory

### New Production Code
- `shared/hero/metrics-privacy.js` — recursive privacy validation shared module

### Modified Production Code
- `shared/hero/metrics-contract.js` — delegates to recursive validator
- `shared/hero/hero-copy.js` — vocabulary allowlist update
- `worker/src/hero/telemetry-probe.js` — expanded probe with readiness/health
- `worker/src/hero/launch-adapters/grammar.js` — mini-test mapping
- `worker/src/app.js` — probe route expansion for learnerId param

### New Test Files
- `tests/hero-pA2-privacy-recursive.test.js` (16 tests)
- `tests/hero-pA2-launchability-secure-grammar.test.js` (9 tests)
- `tests/hero-pA2-ops-probe.test.js` (12 tests)
- `tests/hero-pA2-internal-override-surface.test.js` (16 tests)
- `tests/hero-pA2-certification-evidence.test.js` (16 tests)

### New Scripts
- `scripts/hero-pA2-cohort-smoke.mjs`
- `scripts/hero-pA2-metrics-summary.mjs`
- `scripts/validate-hero-pA2-certification-evidence.mjs`

### New Evidence / Reports
- `reports/hero/hero-pA2-certification-manifest.json`
- `docs/plans/james/hero-mode/A/hero-pA2-ops-evidence.md`
- `docs/plans/james/hero-mode/A/hero-pA2-internal-cohort-evidence.md`
- `docs/plans/james/hero-mode/A/hero-pA2-risk-register.md`
- `docs/plans/james/hero-mode/A/hero-pA2-recommendation.md`
- `docs/plans/james/hero-mode/A/hero-pA2-plan-completion-report.md` (this file)

### Modified Evidence / Plans
- `docs/plans/james/hero-mode/A/hero-pA1-recommendation.md` (finalised)
- `docs/plans/james/hero-mode/A/hero-pA1-ring2-evidence.md` (superseded)
- `docs/plans/james/hero-mode/A/hero-pA1-ring3-evidence.md` (superseded)
- `docs/plans/james/hero-mode/A/hero-pA1-ring4-evidence.md` (superseded)

---

## Phase Lineage

```
P0-P6 (feature)  →  pA1 (validation, COMPLETE)  →  pA2 (measurement, CODE COMPLETE)
                                                          │
                                                          └─ A3 (external cohort, GATED)
```

A2 is not where Hero Mode becomes bigger. A2 is where Hero Mode becomes observable, measurable, supportable, and honest under tiny internal production use. The code is ready. The calendar is next.
