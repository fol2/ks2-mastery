# Hero Mode pA6 - Preflight and Hold Note

**Phase:** A6 (Production close-out, normalisation, or stop)
**Date:** 2026-05-01
**Status:** REPO-SIDE HOLD - metric correction complete; production hold boundary blocked
**Contract:** `docs/plans/james/hero-mode/A/hero-mode-pA6.md`

---

## Outcome

A6 cannot normalise Hero Mode from the evidence available in this worktree.

The checked-in production config keeps the global Hero flags off:

```txt
HERO_MODE_SHADOW_ENABLED=false
HERO_MODE_LAUNCH_ENABLED=false
HERO_MODE_CHILD_UI_ENABLED=false
HERO_MODE_PROGRESS_ENABLED=false
HERO_MODE_ECONOMY_ENABLED=false
HERO_MODE_CAMP_ENABLED=false
```

`HERO_ROLLOUT_PERCENT` is absent from the tracked Worker vars. A read-only Cloudflare secret-name check on 2026-05-01 also did not list `HERO_ROLLOUT_PERCENT` or `HERO_ROLLOUT_SALT`, so the rollout-bucket path is effectively 0% from the evidence visible to this branch.

The same secret-name check did list `HERO_INTERNAL_ACCOUNTS`. Cloudflare does not expose secret values through this workflow, so this branch cannot verify the exact live internal allowlist size.

No production rollout secret was changed by this branch. No live Hero production export was supplied. The pA5 rollout, metrics, support, and decision files remain template-era evidence and are not counted as live A6 evidence.

The A6 decision is therefore:

```txt
HOLD AT CURRENT ROLLOUT PERCENTAGE
```

This is a release brake, not a product expansion.

This is not a contract-complete production HOLD certification until an operator records the current `HERO_INTERNAL_ACCOUNTS` size or rotates it to a known value.

---

## Day 0 Checks

| A6 entry or Day 0 requirement | Evidence | Status |
|-------------------------------|----------|--------|
| Resolver supports internal, external, percentage, excluded, emergency-off, global default, and none states | `node scripts/hero-pA5-rollout-resolver-evidence.mjs`: 9/9 scenarios passed | PASS |
| Resolver precedence is emergency-off > excluded > internal > external > rollout-bucket > global-default > none | `node --test tests/hero-pA5-rollout-resolver.test.js tests/hero-pA5-safety-regression.test.js`: 44/44 passed | PASS |
| Read-model and command route use the same resolver | Covered by `tests/hero-pA5-rollout-resolver.test.js` route consistency cases | PASS |
| Emergency-off hides Hero surfaces and rejects commands without deleting Hero state | Covered by `tests/hero-pA5-safety-regression.test.js` rollback-preserves-state cases | PASS (local) |
| Product, engineering, support, and daily-review owners exist | No named owners are recorded in this branch | BLOCKED |
| Parent/support explanation approved for real families | pA4 support/explainer artefacts exist, but A6 has no fresh real-family approval evidence | BLOCKED |
| Exact rollout percentage or allowlist size is known for HOLD | Rollout-bucket percentage is effectively 0%; `HERO_INTERNAL_ACCOUNTS` is present but its value/size is hidden | BLOCKED |
| A5 rollout-control and safety tests pass | Focused local A5 resolver/safety tests passed on 2026-05-01 | PASS (focused local) |
| Metric truth matches the real schema before widening | `scripts/hero-pA6-metrics-extract.mjs`, `tests/hero-pA6-metrics-extract.test.js`, and patched `scripts/hero-pA4-metrics-validator.mjs` | PASS |
| pA5 template rows are not countable as live evidence | A6 docs and report explicitly ignore template-era rows | PASS |

---

## Metric Truth Correction

A6 adds a schema-accurate extraction path:

```txt
scripts/hero-pA6-metrics-extract.mjs
tests/hero-pA6-metrics-extract.test.js
reports/hero/hero-pA6-metrics-report.json
```

The extractor uses these sources:

```txt
event_log
child_game_state
child_subject_state
account_learner_memberships
support_issues export when supplied
```

The authoritative Hero economy and Camp state source is:

```txt
child_game_state
system_id = 'hero-mode'
state_json = Hero progress/economy/Hero Pool JSON
```

`event_log` is treated as a telemetry mirror only. It is not treated as the source of truth for balances, ledger entries, daily awards, Camp spends, or Hero Pool ownership.

The inherited pA4 metric mapping was also patched so it no longer points at conceptual Hero tables. Focused A6 tests now guard this.

---

## Current Evidence Boundary

| Field | Value |
|-------|-------|
| Live rollout secret change executed by this branch | No |
| Observed Hero secret names | `HERO_INTERNAL_ACCOUNTS` present; rollout percent/salt, external, excluded, and emergency secrets absent |
| Repository-declared rollout-bucket percentage | 0% effective (`HERO_ROLLOUT_PERCENT` absent from tracked vars and secret-name list) |
| Live internal allowlist size | Not verified; Cloudflare does not reveal secret values through this workflow |
| Live production Hero export supplied | No |
| `reports/hero/hero-pA6-metrics-report.json` event rows | 0 |
| `reports/hero/hero-pA6-metrics-report.json` Hero state rows | 0 |
| Support rows supplied to extractor | 0 |
| Browser production smoke run | Not run in this branch |
| Production normalisation supported | No |
| Repo-side A6 outcome recorded | HOLD AT CURRENT ROLLOUT PERCENTAGE |
| Contract-complete production HOLD supported | No; exact internal allowlist size is still blocked |

---

## Allowed Next Action

To widen beyond this hold, the team needs all of the following before touching production exposure:

1. Named product, engineering, support, and daily-review owners.
2. An approved support/parent explanation for real families.
3. A production export or live extraction run using `scripts/hero-pA6-metrics-extract.mjs`.
4. The current `HERO_INTERNAL_ACCOUNTS` size recorded or the secret rotated to a known value.
5. A production smoke account proving read model, command, claim, coins, and Camp behaviour.
6. A real rollback rehearsal after the intended exposure state is reached.

Until then, Hero Mode must not be described as normalised.
