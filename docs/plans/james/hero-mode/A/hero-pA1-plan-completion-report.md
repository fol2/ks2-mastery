---
title: "Hero Mode pA1 — Plan Completion Report"
type: completion-report
status: complete
date: 2026-04-29
plan: docs/plans/2026-04-29-010-feat-hero-mode-pA1-staging-rollout-validation-plan.md
origin: docs/plans/james/hero-mode/A/hero-mode-pA1.md
previous: docs/plans/james/hero-mode/hero-mode-p6-completion-report.md
---

# Hero Mode pA1 — Plan Completion Report

## Executive Summary

pA1 planning is complete. The implementation plan translates the 736-line pA1 contract document into a 9-unit, 4-ring execution plan that proves Hero Mode is safe, reversible, measurable, and honest in staging and internal production — without adding new gameplay, earning mechanics, or mutations.

**Key planning outcome:** Hero Mode transitions from "staging-ready on paper" to a concrete validation pipeline with observable evidence gates at each ring.

---

## Planning Context

### Phase Position

Hero Mode has a coherent P0–P6 implementation line:

| Phase | Purpose | PR |
|-------|---------|-----|
| P0 | Shadow scheduler and read model | #357 |
| P1 | Launch bridge into subject command paths | #397 |
| P2 | Child-facing Hero Quest shell | #451 |
| P3 | Task completion claims and daily progress | #533 |
| P4 | Capped Hero Coins ledger | #553 |
| P5 | Hero Camp and Hero Pool monsters | #564 |
| P6 | Production hardening, 52 metrics, rollout playbook | #585 |

P6's verdict: **READY FOR STAGING** (382 tests, 0 regressions). pA1 is the first A-series phase — validation and operational evidence, not feature development.

### Origin Document

The pA1 contract (`docs/plans/james/hero-mode/A/hero-mode-pA1.md`) defines 7 goals, 5 acceptance gates (A–E), 9 stop conditions, and 4 rollout rings (plus optional Ring 4). The user chose to include Ring 4 (internal production) in scope.

---

## Plan Structure Delivered

### Implementation Units (9 total)

| U-ID | Name | Ring | Dependencies | Key Decision |
|------|------|------|--------------|--------------|
| U1 | Documentation Drift Reconciliation | 0 | None | Fix `hero_progress` table refs, reconcile test count (282 vs 283) |
| U2 | Telemetry Probe Ops Route | 0 | None | Lightweight admin route reading last-N from KV, not a full dashboard |
| U3 | Local/Dev Flag Ladder Validation | 1 | U1 | Seeded fixtures covering all critical learner states; prove 6-flag sequence |
| U4 | Playwright QA Journeys | 1→2 | U1 | Browser-level 12-step path proof; runs in local dev AND staging |
| U5 | Provider/Launcher Parity Audit | 1 | U3 | Proves Grammar `mini-test` gap is safe (fallback always provides launchable task) |
| U6 | Staging Seeded Ring 2 Validation | 2 | U2, U3, U4, U5 | Deploy + smoke + telemetry probe verification + 30-min observation |
| U7 | Staging Multi-Day Ring 3 Validation | 3 | U6 | Real calendar days (min 2 dateKeys); idempotency under refresh/retry |
| U8 | Internal Production Ring 4 Validation | 4 | U7 | Per-account flag override (new mechanism); team-only for 3–5 days |
| U9 | A2 Decision Baseline and Recommendation | — | U8 | Evidence-based proceed/hold/rollback against all 5 exit criteria and 5 gates |

### Critical Discovery: Per-Account Override Gap

Research revealed that the current Worker resolves Hero flags from flat env vars only — no per-account override mechanism exists. The plan includes this as part of U8: a minimal `HERO_INTERNAL_ACCOUNTS` JSON secret that force-enables all 6 flags for listed accounts. This is the minimum viable mechanism for Ring 4 without building the full account-hash bucketing (deferred to A2/Ring 5+).

### Critical Discovery: Grammar Launchability Gap

The Grammar provider emits `mini-test` (breadth-maintenance intent) but the Grammar launch adapter only supports `smart-practice` and `trouble-practice`. Analysis confirms this is architecturally safe:

1. The client UI skips non-launchable tasks (`hero-ui-model.js:30`)
2. Grammar always emits a fallback `smart-practice` envelope when no specific intent matches
3. A learner with only `secureCount >= 3` still gets the generic fallback (launchable)

U5 proves this with explicit test fixtures. No code change needed — only evidence.

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Telemetry via KV probe route, not dashboard | Avoid overbuilding; structured logs + probe gives Ring 2–4 operators sufficient evidence |
| Per-account override, not env-var changes per ring | Production stays default-off for all non-team accounts; override is additive-only |
| Playwright journeys reused across Ring 1 and Ring 2 | Same assertions, different target URL; avoids duplicate test maintenance |
| No new mutations in pA1 | Validation phase must not add state shapes, commands, or earning paths |
| Launchability: filter at read-model level (existing) | Architecture already handles this; pA1 only proves it with explicit coverage |

---

## Verification Strategy

### Automated (existing + new)

- 382 existing P6 tests run as regression baseline (no changes allowed to regress these)
- New test files: `hero-pA1-telemetry-probe.test.js`, `hero-pA1-flag-ladder.test.js`, `hero-pA1-launchability-parity.test.js`, `hero-pA1-account-override.test.js`
- Playwright journeys: `hero-pA1-full-path.mjs`, `hero-pA1-rollback-safety.mjs`
- Staging smoke: `scripts/hero-pA1-staging-smoke.mjs`

### Manual/Observational (Ring 2–4)

- Multi-day staging observation (minimum 2 real calendar days)
- Internal production team usage (3–5 days)
- Telemetry sink verification via probe route
- Evidence artefacts in `docs/plans/james/hero-mode/A/` (ring2, ring3, ring4 evidence)

---

## Risk Register (from planning)

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Staging KV namespace differs from production | Low | U6 verifies probe returns events; Ring 4 re-verifies |
| Grammar breadth-maintenance traps a learner | Very Low | U5 proves fallback always provides launchable task |
| Multi-day staging requires real calendar days | Certain | Start Ring 3 early; small daily effort |
| Ring 4 team accounts don't cover all learner states | Medium | Seeded fixtures cover locked subjects, low balance, completed quests |
| D1 tail latency under burst | Low | Accept as known; verify p95 within 200ms budget |

---

## Product Contract Preservation

The plan explicitly preserves:

- Hero Mode remains default-off for all non-team accounts
- Subject engines own learning, mastery, Stars, and subject monsters
- Capped daily economy (+100/day) is the only earning path
- Hero Camp remains a spending/autonomy surface, not a learning-evidence surface
- No new gameplay, monsters, streaks, trading, or pressure mechanics
- Rollback preserves state dormant (never deletes balances, ledger, or ownership)

---

## Plan Quality Metrics

| Metric | Value |
|--------|-------|
| Implementation units | 9 |
| Requirements traced | 7 (R1–R7) |
| Test scenario count | 52 (across all units) |
| Files to create | 9 |
| Files to modify | 6–8 (contingent on drift found) |
| Evidence artefacts produced | 4 (ring2, ring3, ring4, recommendation) |
| Acceptance gates covered | 5 (A–E from origin) |
| Stop conditions enumerated | 9 (from origin §9) |

---

## Relationship to Prior Work

```
P0 ─ P1 ─ P2 ─ P3 ─ P4 ─ P5 ─ P6 (feature development line)
                                      │
                                      └─ pA1 (validation + operational evidence)
                                           │
                                           └─ A2 (if pA1 passes: internal cohort measurement)
                                                │
                                                └─ A3 (if A2 passes: limited cohort)
```

pA1 explicitly does NOT continue the P-series feature line. It starts a new A-series validation line that must earn its way forward through evidence, not optimism.

---

## Insights and Observations

### Architecture Maturity

The P0–P6 codebase demonstrates strong architectural discipline:
- Three-layer separation (shared/worker/client) enforced by import constraints
- Deterministic scheduling via DJB2 seed + LCG PRNG — fully reproducible for any given learner+dateKey
- 6-flag hierarchy with fail-closed enforcement (409 on misconfiguration)
- Server-side quest recomputation on every command — client never trusted
- Three-tier idempotency (receipt replay → business short-circuit → deterministic entry ID)

This maturity means pA1's primary risk is operational (does the deployed system behave as tested?) rather than architectural (is the design sound?).

### Documentation Drift Pattern

The rollout playbook references a `hero_progress` table that doesn't exist — authoritative state lives in `child_game_state` with `system_id = 'hero-mode'`. This is a common pattern when docs are written during early phases and not reconciled after architectural decisions shift. U1 addresses this systematically.

### The "No Regression" Constraint

The user specified "no regression" — pA1 must not break any existing P0–P6 tests. This is naturally enforced: the plan introduces no new mutations, modifies no existing production code paths, and adds only verification/observation infrastructure. The 382-test baseline serves as the regression gate.

---

## Next Steps

1. Execute plan via `/ce-work` when ready to begin implementation
2. U1 and U2 are parallelisable (Ring 0, no shared dependencies)
3. Ring 3 is calendar-bound — start staging deployment early to allow multi-day observation
4. Ring 4 decision: advance only if Rings 2–3 pass with zero stop conditions
5. U9 produces the final go/no-go for A2

---

## File Locations

| Artefact | Path |
|----------|------|
| Origin contract | `docs/plans/james/hero-mode/A/hero-mode-pA1.md` |
| Implementation plan | `docs/plans/2026-04-29-010-feat-hero-mode-pA1-staging-rollout-validation-plan.md` |
| This report | `docs/plans/james/hero-mode/A/hero-pA1-plan-completion-report.md` |
| P6 completion | `docs/plans/james/hero-mode/hero-mode-p6-completion-report.md` |
| P6 readiness | `docs/plans/james/hero-mode/hero-mode-p6-readiness-report.md` |
| Rollout playbook | `docs/plans/james/hero-mode/hero-mode-p6-rollout-playbook.md` |
