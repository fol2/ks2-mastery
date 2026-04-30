# Hero Mode pA4 — Plan Completion Report

**Phase:** A4 — Productionisation Path and Limited External Release  
**Date:** 2026-04-30  
**Status:** CODE COMPLETE — awaiting real external cohort observation  
**Contract:** docs/plans/james/hero-mode/A/hero-mode-pA4.md  
**Plan:** docs/plans/2026-04-30-005-feat-hero-pA4-productionisation-delivery-plan.md

---

## Executive Summary

Hero Mode pA4 productionisation infrastructure is code-complete. The delivery implements all autonomous-deliverable requirements from the contract across 14 implementation units merged in 7 PRs (#743–#750). The system is ready for external cohort enablement once pA3 Ring A3-4 issues the PROCEED decision and human-dependent entry criteria are satisfied (named owners, family recruitment, consent).

Key metrics:
- 14 implementation units, all merged
- 7 PRs: #743, #744, #745, #746, #747, #748, #749, #750
- 503 new tests passing
- 0 regression in existing test suite
- 10/10 contract deliverables created
- 13 stop condition guards automated
- 9 warning condition detectors automated
- 18 launch + 11 product + 10 safety metrics mapped
- 8 diverse learner profiles across 7 simulated days
- Only runtime change: `worker/src/app.js` — resolver upgrade (backward compatible)

---

## Contract Requirements vs Delivery Mapping

| Requirement | Contract Ref | Unit | PR | Status |
|-------------|-------------|------|----|----|
| External cohort resolver (HERO_EXTERNAL_ACCOUNTS) | §6 Goal 1, §15.1 | U1 | #744 | DELIVERED |
| Same resolved flag view for read model + commands | §6 Goal 1 | U2 | #745 | DELIVERED |
| OverrideStatus observable in ops output | §6 Goal 1 | U2, U11 | #745 | DELIVERED |
| Multi-day cohort simulation | §6 Goal 2 | U7 | #749 | DELIVERED |
| Product signal measurement | §6 Goal 3, §13.2 | U6 | #747 | DELIVERED |
| Safety signal measurement | §6 Goal 3, §13.3 | U5 | #746 | DELIVERED |
| 13 stop condition guards | §11 | U3 | #745 | DELIVERED |
| 9 warning condition detectors | §12 | U4 | #746 | DELIVERED |
| Parent/adult explainer | §14.1 | U9 | #743 | DELIVERED |
| Support triage pack | §14.2, §6 Goal 4 | U10 | #746 | DELIVERED |
| Operator health lookup | §6 Goal 4 | U11 | #745 | DELIVERED |
| Browser smoke script | §4.2 | U8 | #745 | DELIVERED |
| Release candidate note | §19.2 | U14 | #750 | DELIVERED |
| Evidence template | §19.5 | U12 | #749 | DELIVERED |
| Metrics summary framework | §19.6 | U12 | #749 | DELIVERED |
| Risk register | §19.7 | U13 | #748 | DELIVERED |
| Rollback evidence | §19.8 | U13 | #748 | DELIVERED |
| Recommendation template | §19.9 | U14 | #750 | DELIVERED |
| Default-on plan template | §19.10 | U14 | #750 | DELIVERED |
| Malformed JSON fails closed | §15.1 | U1 | #744 | DELIVERED |
| No new persistent state | §15.2 | — | — | VERIFIED (overrideStatus is ephemeral) |
| Launch metrics infrastructure | §13.1 | U5 | #746 | DELIVERED |
| Reward farming detection | §13.2 | U6 | #747 | DELIVERED |
| Staged default-on ladder | §6 Goal 5 | U14 | #750 | DELIVERED |

---

## Architecture Decisions

1. **Additive resolver extension** — Extended `shared/hero/account-override.js` with `resolveHeroFlagsForAccount()` returning `{ resolvedEnv, overrideStatus }`. The existing `resolveHeroFlagsWithOverride()` wrapper preserved for backward compatibility.

2. **Classification over boolean** — Four-way classification (internal/external/global/none) instead of boolean override. Enables ops visibility without exposing cohort membership to child-facing responses.

3. **Simulation over real observation** — Multi-day cohort validated through date-key rollover simulation (8 accounts × 7 days). Real observation deferred to human-operated calendar window.

4. **Documents as validated code** — All operational documents (support pack, parent explainer, risk register) have automated validation tests checking for required content and forbidden patterns.

5. **Pure functions throughout** — All 13 stop conditions, 9 warning conditions, and product signal analysis are pure functions with zero I/O, independently testable and composable.

---

## Test Coverage Summary

| Test File | Tests | Coverage |
|-----------|-------|----------|
| hero-pA4-external-cohort-resolver.test.js | 21 | Resolver hierarchy, classification, edge cases |
| hero-pA4-route-integration.test.js | 14 | Route consistency, ops output |
| hero-pA4-stop-conditions.test.js | 52 | 13 stop conditions × trigger/safe/null |
| hero-pA4-warning-conditions.test.js | 50 | 9 warnings × threshold/null + aggregator |
| hero-pA4-metrics-infrastructure.test.js | 27 | Metric completeness, zero-tolerance, extraction |
| hero-pA4-product-metrics.test.js | 35 | Rates, farming, mix, abandonment |
| hero-pA4-cohort-simulation.test.js | 27 | 7-day sequence, diversity, rollover |
| hero-pA4-browser-smoke.test.js | 52 | 8-step flow, failure modes |
| hero-pA4-parent-explainer-validation.test.js | 24 | Content markers, forbidden phrases |
| hero-pA4-support-pack-validation.test.js | 47 | 6 sections, escalation, safe/forbidden |
| hero-pA4-operator-lookup.test.js | 18 | Classification, health, privacy |
| hero-pA4-evidence-template-validation.test.js | 21 | 9-column format, metric names |
| hero-pA4-register-validation.test.js | 80 | All conditions registered |
| hero-pA4-deliverables-validation.test.js | 35 | 10/10 deliverables exist |
| **Total** | **503** | |

---

## Delivery Waves

| Wave | Units | PR(s) | Duration |
|------|-------|-------|----------|
| 1 | U1 (resolver), U9 (parent explainer) | #743, #744 | Parallel |
| 2 | U2 (routes), U3 (stop conditions), U8 (smoke), U11 (operator) | #745 | Parallel |
| 3 | U4 (warnings), U5 (launch metrics), U10 (support pack) | #746 | Parallel |
| 4 | U6 (product signals), U13 (risk register) | #747, #748 | Parallel |
| 5 | U7 (cohort simulation), U12 (evidence templates) | #749 | Parallel |
| 6 | U14 (RC, recommendation, default-on) | #750 | Sequential |

---

## Deferred Items (Requires Human)

| Item | Why Deferred | Prerequisite |
|------|-------------|-------------|
| Real external family recruitment | Requires parent/adult consent and outreach | Named support owner |
| Real 7-14 day observation window | Requires calendar time after deployment | Cohort enabled |
| Named role assignments | Requires human decision | Organisational |
| pA3 Ring A3-4 PROCEED decision | Requires real internal production evidence | Calendar time |
| Percentage/hash bucketing | Only needed if second wider ring (§15.1) | A4-1 clean |

---

## Insights and Learnings

1. **Parallel wave execution**: 14 units delivered in 6 waves by mapping the dependency graph. Units with no cross-dependencies (U1 + U9, then U2/U3/U8/U11, etc.) executed simultaneously.

2. **Document-as-code validation**: Automated tests for markdown documents catch content drift early. Forbidden-phrase validation prevents accidental introduction of pressure vocabulary.

3. **Operational symmetry preserved**: pA4 evidence template uses the same 9-column provenance format as pA3, enabling the same tooling to process both.

4. **Minimal runtime footprint**: Only `worker/src/app.js` and `shared/hero/account-override.js` were modified. All other delivery is additive scripts, tests, and documentation.

5. **503 tests in 635ms**: Node.js built-in test runner keeps the full pA4 suite fast enough for CI feedback loops.

---

## What Happens Next

1. **pA3 closes** — Real internal production observation completes, A3-4 decision issued
2. **If PROCEED** — Entry criteria 6-7 satisfied (named owners, family recruitment)
3. **External cohort enabled** — HERO_EXTERNAL_ACCOUNTS populated with 5-10 real account IDs
4. **7-day observation** — Daily operator review using support pack and operator lookup
5. **A4-2 checkpoint** — Review findings, classify blockers/warnings/known-issues
6. **A4-4 decision** — Final recommendation using pA4-recommendation.md template
7. **If PROCEED TO STAGED DEFAULT-ON** — Execute pA4-default-on-plan.md staged ladder

---

*Report generated 2026-04-30. All code on main branch.*
