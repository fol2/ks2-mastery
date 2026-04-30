# Hero Mode pA4 — Release Candidate Note

**Phase:** A4 (Productionisation Path and Limited External Release)
**Date:** 2026-04-30
**Status:** CANDIDATE

---

## Scope Freeze Statement

The pA4 release candidate scope is locked. Only the following changes are permitted after this point:

### Allowed Changes Post-RC

1. **Blocker fixes** — a stop condition has triggered and requires a code change
2. **Rollout-control fixes** — cohort enablement bugs preventing correct account resolution
3. **Privacy fixes** — raw child content leak detected in telemetry, logs, or output
4. **Support/ops fixes** — triage improvements that reduce time-to-resolve
5. **Copy changes** — wording edits that remove confusion or perceived pressure (no new features)

### Rejected in RC (Origin §15.3)

The following are explicitly rejected and must not land while the RC is active:

- New gameplay mechanics or surfaces
- New economy mechanics (coins, spending, earning changes)
- New monsters or visual assets
- Visual polish that risks regressions (animation, layout refactors)
- Broad refactors (code reorganisation without direct bug-fix purpose)
- Unrelated subject work (spelling, grammar, punctuation changes)

---

## Included in RC

The following deliverables constitute the pA4 release candidate:

| # | Deliverable | Location |
|---|-------------|----------|
| 1 | External cohort resolver (HERO_EXTERNAL_ACCOUNTS) | `shared/hero/account-override.js` |
| 2 | Unified route integration with overrideStatus | `src/hero/routes/` |
| 3 | 13 stop condition guards | `shared/hero/stop-conditions.js` |
| 4 | 9 warning condition detectors | `shared/hero/warning-conditions.js` |
| 5 | Metrics infrastructure (18 launch + 11 product + 10 safety) | `shared/hero/metrics/` |
| 6 | Product signal analysis with reward farming detection | `shared/hero/product-metrics.js` |
| 7 | Multi-day cohort simulation (8 accounts, 7 days) | `scripts/hero-pA4-cohort-simulation.mjs` |
| 8 | Browser smoke validation script | `scripts/hero-pA4-external-cohort-smoke.mjs` |
| 9 | Parent/adult explainer | `docs/plans/james/hero-mode/A/hero-pA4-parent-explainer.md` |
| 10 | Support triage pack | `docs/plans/james/hero-mode/A/hero-pA4-support-pack.md` |
| 11 | Operator health lookup | `scripts/hero-pA4-operator-lookup.mjs` |
| 12 | Evidence and metrics templates | `docs/plans/james/hero-mode/A/hero-pA4-metrics-summary.md` |
| 13 | Risk register (stop/warning conditions) | `docs/plans/james/hero-mode/A/hero-pA4-risk-register.md` |
| 14 | Rollback evidence | `docs/plans/james/hero-mode/A/hero-pA4-rollback-evidence.md` |

---

## Entry Criteria Checklist (Origin §5)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | pA3 ended with PROCEED TO A4 | PENDING (awaiting pA3 A3-4) |
| 2 | pA3 evidence based on real internal production | PENDING |
| 3 | Direct Goal 6 telemetry extraction exists | VERIFIED (`scripts/hero-pA3-telemetry-extract.mjs`) |
| 4 | Browser QA and rollback rehearsal passed | VERIFIED (`hero-pA3-browser-qa-evidence.md`) |
| 5 | Global Hero flags remain off for non-cohort | VERIFIED (resolver fails closed) |
| 6 | Named owners assigned | DEFERRED: requires human |
| 7 | External families recruited with consent | DEFERRED: requires human |
| 8 | Support and rollback playbooks ready | VERIFIED (`hero-pA4-support-pack.md`) |
| 9 | Planned cohort size, dates, cadence | TEMPLATE READY (`hero-pA4-external-cohort-evidence.md`) |
| 10 | pA4 scope frozen to productionisation | VERIFIED (this document) |

---

## RC Gate

This release candidate is blocked on criteria 1 and 2 above. The pA3 phase must complete with a PROCEED recommendation before pA4 enters active external cohort operation.

All other criteria are either verified or deferred to human action (recruitment, owner assignment) which cannot be automated.
