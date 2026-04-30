# Hero Mode pA3 — A4 Recommendation

**Phase:** A3 Ring A3-4
**Date:** 2026-04-30
**Status:** PENDING

---

## Decision

**Recommendation: [PENDING — complete after A3 evidence closes]**

One of:
- `PROCEED TO A4 LIMITED EXTERNAL COHORT`
- `HOLD AND HARDEN`
- `ROLL BACK / KEEP DORMANT`

---

## Evidence Summary

| Ring | Purpose | Status | Key Finding |
|------|---------|--------|-------------|
| A3-0 | Evidence model repair + docs reconciliation | | |
| A3-1 | Real internal production cohort (5+ days, 3+ learners) | | |
| A3-2 | Goal 6 telemetry extraction | | |
| A3-3 | Browser QA + rollback rehearsal + support checklist | | |
| A3-4 | A4 decision | | |
| A3-5 (optional) | External micro-cohort rehearsal | | |

---

## Stop Condition Review

| Condition | Triggered? | Ring | Details | Resolution |
|-----------|-----------|------|---------|------------|
| Duplicate daily coin award | | | | |
| Duplicate Camp debit | | | | |
| Negative balance | | | | |
| Claim without Worker verification | | | | |
| Hero mutates subject state | | | | |
| Dead CTA | | | | |
| Non-internal exposure | | | | |
| Telemetry sink miss | | | | |
| Raw child content | | | | |
| Rollback failure | | | | |
| Broken locked subjects | | | | |
| Task selection unexplainable | | | | |
| Simulated as real | | | | |
| Camp before learning | | | | |
| Pressure copy | | | | |

---

## Hold-and-Harden Items

*(List specific items that must be remediated before proceeding, if recommendation is HOLD)*

| # | Item | Severity | Owner | Status |
|---|------|----------|-------|--------|
| | | | | |

---

## A4 Scope (if PROCEED)

If the recommendation is to proceed, A4 must operate within these constraints:

| Parameter | Value |
|-----------|-------|
| Maximum external accounts | 10 |
| Minimum duration | 14 real calendar days |
| Enablement mechanism | Per-account allowlist via `HERO_INTERNAL_ACCOUNTS` |
| Global Hero flags | OFF (no change) |
| Daily operator review | Required |
| Immediate rollback triggers | All §8 stop conditions |
| New gameplay or earning rules | Forbidden |
| Six-subject widening | Forbidden |
| Marketing claims | Forbidden |
| Default-on language | Forbidden |

A4 is a limited external cohort, not production default-on. It widens exposure slightly but retains all safety constraints from A3.

---

## Rationale

*(To be completed after evidence closes)*

---

## Signatures

| Role | Name | Date | Decision |
|------|------|------|----------|
| Evidence owner | | | |
| Support owner | | | |
| Daily review owner | | | |

---

*Template created 2026-04-30. Recommendation to be issued at the end of Ring A3-4.*
