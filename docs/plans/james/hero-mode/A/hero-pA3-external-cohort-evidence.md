# Hero Mode pA3 — External Cohort Evidence

**Phase:** A3 Optional Ring A3-5
**Date:** 2026-04-30
**Status:** TEMPLATE — no observations recorded yet

## Metadata

| Field | Value |
|-------|-------|
| Collection method | Ops probe + cohort smoke script + Goal 6 telemetry extraction |
| Environment | Production (Cloudflare Workers + D1) |
| Operator | — |
| Script version | — |

## Evidence Boundary

Every observation row in this file must carry a `Source` classification. Only rows with `Source = real-production` count towards external cohort duration gates.

Source values and their meaning:

- `real-production` — observed in production via automated probe or manual verification against live D1/KV state
- `staging` — observed in a staging environment that mirrors production but serves no real users
- `local` — observed in local development (wrangler dev or vitest)
- `simulation` — operator-accepted modelled outcome, not elapsed real observation
- `manual-note` — operator annotation without automated collection (e.g. support finding, verbal report)

This file is distinct from `hero-pA3-internal-cohort-evidence.md`. Internal cohort evidence tracks team accounts during Ring A3-1. This file tracks external accounts during the optional Ring A3-5.

## Cohort Configuration

- External accounts: *(to be populated when A3-5 begins)*
- Account count: *(max 10)*
- Observation start: *(to be populated)*
- Minimum duration: 14 real production calendar days
- Minimum date-key rollovers: 7
- Daily operator review: required

### Entry criteria status

| Ring | Status |
|------|--------|
| A3-0 (evidence model repair) | |
| A3-1 (real internal cohort) | |
| A3-2 (Goal 6 telemetry) | |
| A3-3 (browser QA + rollback) | |
| A3-4 (A4 recommendation) | |

All rings must show PASS before this file receives observation rows.

## Observation Log

| Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Source | Status |
|------|---------|-----------|----------------|----------------|----------------|----------|--------|--------|

*(No observations recorded yet. Rows will be appended as real external cohort usage occurs.)*

## Stop Conditions

| Condition | Observed | Date | Details |
|-----------|----------|------|---------|
| Duplicate daily award | | | |
| Duplicate Camp debit | | | |
| Negative balance | | | |
| Claim without Worker verification | | | |
| Hero mutates subject state | | | |
| Dead CTA | | | |
| Non-internal exposure | | | |
| Telemetry sink miss | | | |
| Raw child content | | | |
| Rollback failure | | | |
| Broken locked subjects | | | |
| Task selection unexplainable | | | |
| Simulated as real | | | |
| Camp before learning | | | |
| Pressure copy | | | |
| Learner confusion or distress | | | |

---

*Template created 2026-04-30. Observations begin only after Ring A3-5 entry criteria are met.*
