# Hero Mode pA4 — External Cohort Evidence

**Phase:** A4 Ring A4-1 (first external cohort)
**Date:** 2026-04-30
**Status:** TEMPLATE — no observations recorded yet

## Purpose

This is the evidence log for pA4 Ring A4-1, the first external cohort deployment of Hero Mode. Each row records a single observation from the external cohort period with full provenance tracing.

## Format Instructions

One row per observation. Do not combine multiple signals into a single row. If the same learner shows two distinct signals on the same date, record two rows.

## Column Definitions

| Column | Description |
|--------|-------------|
| Date | ISO-8601 date (YYYY-MM-DD) of the observation |
| Source | Classification of how the observation was captured |
| Account | Account identifier (redacted where necessary) |
| Learner | Learner profile identifier within the account |
| Signal | What was observed (e.g. daily-completion, claim-success, camp-open) |
| Value | Quantitative or qualitative value of the signal |
| Provenance | Trust classification of the observation |
| Confidence | Operator confidence in the observation accuracy |
| Notes | Free-text context, script name, or back-fill reason |

## Source Values

- `external-cohort` — observed from a real external cohort account in production
- `operator-check` — manual operator verification against live state
- `telemetry-extract` — extracted from Goal 6 telemetry pipeline output
- `support-report` — reported via parent/guardian support channel

## Provenance Values

- `real-production` — observed in production via automated probe or manual verification against live D1/KV state
- `operator-verified` — operator has independently confirmed the observation against a second source
- `system-generated` — automatically produced by telemetry or monitoring infrastructure

## Confidence Values

- `high` — observation is unambiguous and directly verifiable
- `medium` — observation is likely correct but depends on indirect evidence
- `low` — observation is inferred or partially supported; requires follow-up

## Certification Gate Rule

Rows with provenance='real-production' count toward certification gates. Rows with other provenance values provide supporting context but do not satisfy gate duration requirements.

## Observation Log

| Date | Source | Account | Learner | Signal | Value | Provenance | Confidence | Notes |
|------|--------|---------|---------|--------|-------|------------|------------|-------|
| 2026-05-01 | external-cohort | acct-example-001 | learner-A | daily-completion | 1 | real-production | high | Example row — replace with real observations |

*(Rows will be appended as real external cohort usage occurs during Ring A4-1.)*

## Stop Conditions

If any stop condition from `hero-pA4-risk-register.md` is observed, record it here and immediately halt the cohort.

| Condition | Observed | Date | Details |
|-----------|----------|------|---------|
| Duplicate daily award | | | |
| Duplicate Camp debit | | | |
| Negative balance | | | |
| Claim without Worker verification | | | |
| Hero mutates subject state | | | |
| Dead CTA | | | |
| Non-cohort exposure | | | |
| Raw child content | | | |
| Rollback failure | | | |
| Parent feedback indicates pressure | | | |

---

*Template created 2026-04-30. Observations begin only after Ring A4-1 entry criteria are met.*
