# Hero Mode pA7 - Metrics Summary

**Phase:** A7 release execution sprint
**Date:** 2026-05-01
**Status:** LIVE PRODUCTION COUNTS RECORDED - hold boundary incomplete
**Machine evidence:** `reports/hero/hero-pA7-release-boundary.json`

---

## Source Truth

| Source | A7 role | Result |
|--------|---------|--------|
| `child_game_state` where `system_id='hero-mode'` | Authoritative Hero state, economy, ledger, Camp | 0 rows |
| `event_log` where `system_id='hero-mode'` | Observational Hero telemetry mirror | 0 rows |
| Cloudflare Worker secret-name list | Exposure-control presence only | `HERO_INTERNAL_ACCOUNTS` present; other A7 rollout/rollback secrets absent; exact exposure unknown |
| `wrangler.jsonc` | Checked-in global flag defaults | all six Hero flags false |
| Production demo smoke | Non-cohort hidden proof | 404 `hero_shadow_disabled` |

Zero Hero rows are real live production evidence. They do not prove Hero Mode is healthy under cohort use; they prove there is no current Hero production state or telemetry to use for normalisation. They also do not prove zero exposure while `HERO_INTERNAL_ACCOUNTS` is present and write-only.

---

## Population Context

| Metric | Live value | Evidence note |
|--------|------------|---------------|
| Adult accounts | 162 | D1 read-only count |
| Real accounts | 5 | D1 read-only count |
| Demo accounts | 157 | D1 read-only count |
| Learner memberships | 161 | D1 read-only count |
| Ready-subject learners with spelling/grammar/punctuation state | 138 | Distinct learners across ready-subject state rows |
| Spelling learners | 54 | D1 read-only count |
| Grammar learners | 87 | D1 read-only count |
| Punctuation learners | 27 | D1 read-only count |

These are population counts, not Hero exposure counts. Exposure remains unknown while `HERO_INTERNAL_ACCOUNTS` value is write-only.

---

## Required Release Metrics

| Metric | Classification | A7 live value | Decision note |
|--------|----------------|---------------|---------------|
| Exposed account count | not-observable-yet | Unknown | `HERO_INTERNAL_ACCOUNTS` count not readable; no resolver export supplied |
| Eligible ready-subject learner count | schema-derived | 138 learners with any ready-subject state | Does not imply Hero eligibility or exposure |
| Hero read model requested | observed-live smoke | 1 demo/non-cohort request returned 404 | Hidden check only; no cohort success |
| Hero Quest started | schema-derived | 0 Hero state rows | No evidence of production Hero starts |
| Hero task started | schema-derived | 0 Hero state rows | No evidence of production Hero starts |
| Hero task completed | observed-live | 0 Hero event rows | No evidence of production Hero completions |
| Daily Hero Quest completed | schema-derived | 0 Hero state rows | No evidence of production Hero completions |
| Claim success count | observed-live/schema-derived | 0 Hero event/state rows | No evidence of production Hero claims |
| Coin award count | schema-derived | 0 Hero state rows | No live Hero ledger rows |
| Camp invite/grow count | schema-derived | 0 Hero state rows | No live Hero Pool rows |
| Support issue count by category | manual-support-log | 0 supplied rows | Not proof of zero real issues |
| Opt-out count | manual-support-log | 0 supplied rows; exclusion secret absent | Opt-out path not ready |
| Rollback rehearsal result | manual-support-log/smoke | Not run with emergency-off | Global-flags-off hidden check passed for demo only |
| Route error count if request logs are available | not-observable-yet | Not available | No Worker tail/request-log export supplied |

---

## Zero-Tolerance Safety Metrics

| Metric | A7 live value | Gate impact |
|--------|---------------|-------------|
| Duplicate daily Hero Coin award | 0 Hero state rows | No breach observed, but no cohort activity exists |
| Duplicate Camp debit | 0 Hero state rows | No breach observed, but no cohort activity exists |
| Negative Hero Coin balance | 0 Hero state rows | No breach observed, but no cohort activity exists |
| Claim without Worker-verified completion | 0 Hero state/event rows | No breach observed, but no cohort claim path exercised |
| Hero command mutating subject Stars, mastery, or subject monsters | Not observable from supplied rows | Requires known-account smoke and/or pre/post subject snapshots |
| Child-visible dead CTA | Not observable from supplied rows | Requires browser or known-account smoke |
| Raw child content in telemetry/logs/exports/ops output | No Hero event rows to inspect | Privacy pass cannot be claimed for cohort telemetry |
| Excluded account exposed | Not observable | `HERO_EXCLUDED_ACCOUNTS` secret absent |
| Rollback failure | Not rehearsed | Blocks widening |
| Hero-related 5xx spike | Not observable | Requires request logs or tail evidence |

---

## Metrics Decision

```txt
HOLD AT CURRENT ROLLOUT PERCENTAGE
```

The live production database does not contain Hero state or Hero telemetry rows. That supports no-widening, but it is not a contract-complete hold boundary because exposed account count is unknown. A7 must not normalise or widen until the required known-account smoke, rollback rehearsal, support log, known exposure, and live Hero metrics exist.
