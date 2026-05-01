# Hero Mode pA6 - Production Decision

**Phase:** A6 (Production close-out, normalisation, or stop)
**Date:** 2026-05-01
**Status:** REPO-SIDE HOLD RECORD - production hold boundary blocked
**Contract:** `docs/plans/james/hero-mode/A/hero-mode-pA6.md`

---

## Decision

```txt
HOLD AT CURRENT ROLLOUT PERCENTAGE
```

Hero Mode is not normalised by this A6 branch. This is a repo-side hold record, not a contract-complete production HOLD certification.

---

## Why Hold

The hold decision is based on the following real evidence:

1. The pA5 rollout infrastructure exists, but pA5 live rollout evidence remains template-era or deferred.
2. The checked-in production Worker vars keep global Hero flags off.
3. No production rollout secret was changed by this branch.
4. No live production Hero state, telemetry, support, or route-log export was supplied to the A6 extractor.
5. The pA5 metric layer needed schema-truth correction before widening; A6 now supplies that correction.
6. Product, support, engineering, and daily-review owners are not named in this branch.
7. Local resolver/safety rehearsal passed, but production smoke and rollback rehearsal are still required before widening.
8. A read-only Cloudflare secret-name check found `HERO_INTERNAL_ACCOUNTS` still present, but Cloudflare does not expose secret values through this workflow, so the exact live internal allowlist size is not verified.

---

## Exact Hold Boundary

| Field | Value |
|-------|-------|
| Selected outcome | HOLD AT CURRENT ROLLOUT PERCENTAGE |
| Rollout percentage changed by this branch | No |
| Secret-name check | `node scripts/wrangler-oauth.mjs secret list` on 2026-05-01 |
| Hero rollout percentage/salt secrets | `HERO_ROLLOUT_PERCENT` and `HERO_ROLLOUT_SALT` not present in the secret-name list |
| Hero external/excluded/emergency secrets | `HERO_EXTERNAL_ACCOUNTS`, `HERO_EXCLUDED_ACCOUNTS`, and `HERO_EMERGENCY_DISABLED` not present in the secret-name list |
| Internal allowlist secret | `HERO_INTERNAL_ACCOUNTS` present; value and size not readable by this workflow |
| Repository-declared rollout-bucket percentage | 0% effective (`HERO_ROLLOUT_PERCENT` absent from tracked vars and absent from the observed secret-name list) |
| Existing checked-in global Hero flags | false |
| Exact live allowlist size | BLOCKED - `HERO_INTERNAL_ACCOUNTS` is present but its value is write-only/hidden |
| A6 HOLD contract boundary | BLOCKED until an operator records the current `HERO_INTERNAL_ACCOUNTS` size or rotates it to a known value |
| Live production export rows supplied | 0 |
| Normalisation allowed | No |
| Review-by date | 2026-05-15 |

The review-by date is 14 calendar days after the A6 hold record, matching the A6 hold rule. The exact current production allowlist size is still required before this can be treated as a contract-complete A6 production HOLD.

---

## Required Actions Before Widening

1. Name product, engineering, support, and daily-review owners.
2. Confirm the family-facing support explanation is approved for real families.
3. Record the current `HERO_INTERNAL_ACCOUNTS` allowlist size or rotate it to a known value.
4. Run a real production extraction with `scripts/hero-pA6-metrics-extract.mjs`.
5. Run production smoke for read model, command, claim, coins, and Camp.
6. Rehearse production rollback after the intended exposure state is reached.
7. Record support zeroes or issues in the support log.
8. Revisit this decision no later than 2026-05-15.

---

## Outcome Options Not Selected

| Outcome | Reason not selected |
|---------|---------------------|
| NORMALISE HERO MODE | No live rollout evidence, production metrics, production smoke, support owner sign-off, or production rollback rehearsal exists in this branch |
| ROLL BACK TO COHORT ONLY | No live stop condition was observed by this branch |
| KEEP DORMANT AND REWORK | No serious product, privacy, economy, or architecture failure was observed by this branch |

---

## Signatures

| Role | Name | Date | Status |
|------|------|------|--------|
| Product owner | Not recorded | | REQUIRED BEFORE WIDENING |
| Engineering owner | Not recorded | | REQUIRED BEFORE WIDENING |
| Support owner | Not recorded | | REQUIRED BEFORE WIDENING |

This decision is an engineering hold record from the A6 worktree. It does not replace product/support sign-off, and it does not certify the exact current production exposure until the `HERO_INTERNAL_ACCOUNTS` size is recorded or reset to a known value.
