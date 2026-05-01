# Hero Mode pA6 - Metrics Summary

**Phase:** A6 (Production close-out, normalisation, or stop)
**Date:** 2026-05-01
**Status:** POPULATED FROM EMPTY SUPPLIED EXPORT - not live rollout evidence
**Report:** `reports/hero/hero-pA6-metrics-report.json`

---

## Source Truth

| Source | A6 role |
|--------|---------|
| `child_game_state` where `system_id = 'hero-mode'` | Authoritative Hero progress, economy, ledger, balance, Hero Pool, and Camp state |
| `event_log` | Observational telemetry mirror only |
| `child_subject_state` | Ready-subject and mastery/Star comparison source when pre/post snapshots exist |
| `account_learner_memberships` | Account-to-learner join source |
| support log export | Manual support/confusion/opt-out source |

The A6 extractor does not reference conceptual Hero-only state tables. Metric source classification is explicit rather than inferred from registry presence.

---

## Source Counts

Report evidence state:

```txt
no-live-export-supplied
```

| Source | Supplied rows |
|--------|---------------|
| `event_log` Hero rows | 0 |
| `child_game_state` Hero rows | 0 |
| `child_subject_state` rows | 0 |
| `account_learner_memberships` rows | 0 |
| support rows | 0 |

Zero supplied rows do not prove zero production issues. They prove that no live production export was supplied to this A6 branch.

For the same reason, privacy validation in the machine-readable report is `status: "not-evaluated"` with `passed: null`; it must not be read as a live privacy pass. When Hero event rows are supplied, malformed, missing, or non-object `event_json` payloads fail closed as privacy evaluation failures. Malformed or non-object `child_game_state.state_json` rows also fail closed as authoritative state inspection failures.

---

## Observability Classification

| Classification | Count | Meaning |
|----------------|-------|---------|
| observed-live | 7 | Can be counted from live telemetry when exported |
| schema-derived | 14 | Can be derived from current real platform state |
| manual-support-log | 2 | Requires support or rollback evidence |
| client-instrumented | 0 | No metric is currently treated as already instrumented client telemetry |
| not-observable-yet | 11 | Must not be counted as covered without additional smoke, logs, or instrumentation |

---

## Launch Metrics

| Metric | Classification | Current value | Decision note |
|--------|----------------|---------------|---------------|
| Eligible ready-subject learner count | schema-derived | 0 supplied rows | Requires production export before widening |
| Exposed account count | schema-derived | 0 supplied rows | Requires production export or resolver classification export |
| Hero Quest shown count | not-observable-yet | Not observable | Needs client telemetry or browser-smoke evidence |
| Hero Quest start count | schema-derived | 0 supplied rows | Derived from Hero progress JSON when supplied |
| Hero task start count | schema-derived | 0 supplied rows | Derived from Hero progress JSON when supplied |
| Hero task completion count | observed-live | 0 supplied rows | event_log mirror only |
| Daily Hero Quest completion count | schema-derived | 0 supplied rows | child_game_state authority, event_log mirror |
| Claim success count | observed-live | 0 supplied rows | Current mirror is `hero.task.completed` |
| Claim rejection count | not-observable-yet | Not observable | Rejections are not persisted in a queryable table |
| Coin award count | schema-derived | 0 supplied rows | Authoritative economy ledger required |
| Camp open count | not-observable-yet | Not observable | Client-only unless instrumented |
| Camp invite/grow count | schema-derived | 0 supplied rows | Authoritative economy/Camp state required |
| Hero route 4xx count | not-observable-yet | Not observable | Needs Workers request logs or persisted route-error telemetry |
| Hero route 5xx count | not-observable-yet | Not observable | Needs Workers request logs or persisted route-error telemetry |

---

## Product Metrics

| Metric | Classification | Current value | Decision note |
|--------|----------------|---------------|---------------|
| Start rate from shown | not-observable-yet | Not observable | Shown denominator is client-side |
| Completion rate from server-started learner-days | schema-derived | 0/0 | Requires Hero progress export |
| Next-day return rate | observed-live | 0/0 | Requires multi-day telemetry export |
| Subject mix distribution | observed-live | `{}` | Requires task completion telemetry |
| Task-intent mix | schema-derived | `{}` | Requires Hero progress JSON |
| Abandonment point distribution | not-observable-yet | Not observable | Requires client/session instrumentation |
| Parent/support confusion reports | manual-support-log | 0 supplied rows | No support log supplied |
| Camp-before-learning ratio | observed-live | 0/0 | Requires Camp and daily completion telemetry |
| Extra subject practice after daily coin cap | observed-live | 0 supplied rows | Requires telemetry after daily completion |
| Warning-condition count | schema-derived | 0 from supplied rows | Not a live all-clear because live rows were not supplied |

---

## Safety Metrics

| Metric | Classification | Current value | Gate impact |
|--------|----------------|---------------|-------------|
| Duplicate daily award | schema-derived | 0 from supplied rows | Needs live Hero state export |
| Duplicate Camp debit | schema-derived | 0 from supplied rows | Needs live Hero state export |
| Negative balance | schema-derived | 0 from supplied rows | Needs live Hero state export; malformed Hero state fails closed as an inspection failure |
| Dead CTA | not-observable-yet | Not observable | Needs browser smoke |
| Claim without Worker-verified completion | schema-derived | 0 from supplied rows | Needs live Hero state and telemetry |
| Raw child content | observed-live | Not evaluated | Needs live telemetry export; malformed or missing Hero `event_json` fails closed |
| Subject Star/mastery drift attributable to Hero Mode | not-observable-yet | Not observable | Needs pre/post subject-state snapshots |
| Exposure to excluded accounts | not-observable-yet | Not observable | Needs resolver classification export or named smoke accounts |
| Rollback failure | manual-support-log | No rehearsal row supplied | Needs rollback rehearsal evidence |
| Production 5xx spike attributable to Hero | not-observable-yet | Not observable | Needs Workers request logs or persisted route-error telemetry |

---

## Decision Impact

The populated A6 report recommends:

```txt
HOLD AT CURRENT ROLLOUT PERCENTAGE
```

Reasons:

- No supplied live Hero production export rows.
- Safety blind spots still require smoke, logs, or manual evidence.
- The metrics layer is now schema-accurate, but it has not yet been run against production data.

Hero Mode must not be described as normalised from this metrics summary.
