# Hero Mode pA3 — Internal Cohort Evidence

**Phase:** A3 Ring A3-1
**Date:** 2026-04-30
**Status:** TEMPLATE — no observations recorded yet

## Metadata

| Field | Value |
|-------|-------|
| Collection method | Ops probe + cohort smoke script |
| Environment | Production (Cloudflare Workers + D1) |
| Operator | — |
| Script version | — |

## Evidence Boundary

Every observation row in this file must carry a `Source` classification. Only rows with `Source = real-production` count towards real cohort duration gates. The certification validator must reject attempts to pass A3 gates using simulation rows.

Source values and their meaning:

- `real-production` — observed in production via automated probe or manual verification against live D1/KV state
- `staging` — observed in a staging environment that mirrors production but serves no real users
- `local` — observed in local development (wrangler dev or vitest)
- `simulation` — operator-accepted modelled outcome, not elapsed real observation
- `manual-note` — operator annotation without automated collection (e.g. support finding, verbal report)

Provenance requirements for `real-production` classification:
1. The observation must correspond to a real calendar date on which production was serving the learner account.
2. The probe or script that collected the data must have run against the production Worker and D1 binding.
3. The operator must record which script or command produced the row.
4. If the row was back-filled after the date, it must note the back-fill date and reason.

## Cohort Configuration

- Internal accounts: *(to be populated when A3-1 begins)*
- Observation start: *(to be populated)*
- Minimum duration: 5 real production calendar days
- Minimum date keys: 2
- Minimum learner profiles: 3
- Minimum devices/sessions: 2

## Observation Log

| Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Source | Status |
|------|---------|-----------|----------------|----------------|----------------|----------|--------|--------|

*(No observations recorded yet. Rows will be appended as real internal cohort usage occurs.)*

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
