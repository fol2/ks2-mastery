---
title: "System Hardening Optimisation P3 Completion Report"
type: completion-report
status: completed
language: en-GB
date: 2026-04-30
route: system-hardening-and-optimisation
owner: james / engineering agent
source_contract: docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3.md
source_plan: docs/plans/2026-04-30-001-feat-sys-hardening-optimisation-p3-telemetry-gate-plan.md
source_baseline: docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3-baseline.md
p3_decision: strict-30-certified-candidate
public_capacity_status: small-pilot-provisional
certification_status: candidate-pending-separate-status-pr
recommended_next_phase: phase-4a-capacity-status-update-and-60-learner-diagnostic
---

# System Hardening Optimisation P3 Completion Report

## Executive Summary

System Hardening Optimisation P3 is complete as an evidence-repair and decision phase. The source contract required the team to repair missing machine-joinable Cloudflare invocation CPU/wall telemetry, rerun the strict 30-learner evidence gate with repeat confidence, and only then choose whether the next engineering move should be D1, Worker CPU, payload, platform/client overhead, observability continuation, or no code mitigation.

P3 now exits through the contract outcome:

```text
strict-30-certified-candidate
```

The evidence sequence was:

1. P3-T0 smoke proved the live `npm run ops:tail:json` capture path on a bounded production run.
2. P3-T1 strict passed the 30-learner gate with joined invocation CPU/wall telemetry.
3. P3-T5 repeat 1 passed the same strict gate with joined invocation CPU/wall telemetry.
4. P3-T5 repeat 2 passed the same strict gate with joined invocation CPU/wall telemetry.
5. Each strict run joined 10/10 retained bootstrap top-tail samples for Cloudflare invocation CPU/wall and 10/10 for sampled statement logs, with zero join warnings.

This closes the original P3 gap. The correct interpretation is deliberately conservative:

- P3 does support a 30-learner certification candidate.
- P3 does not itself update public or Admin capacity status.
- P3 does not certify 60, 100, 300, or 1000 learners.
- P3 does not justify immediate D1, Worker CPU, payload, cache, launch-policy, or threshold mitigation, because the strict 30-learner gate passed repeatedly.

Public capacity wording therefore remains `small-pilot-provisional` until a separate reviewed capacity-status PR adds the chosen P3 terminal evidence row to the verified capacity table and regenerates the latest evidence summary from that reviewed table.

## Completion Boundary

This report uses "completion" in the P3 contract sense: the missing telemetry layer has been repaired, strict 30-learner evidence has been rerun with joined invocation telemetry, the diagnostic classification is present, the terminal P3 decision has been selected, and the residual capacity wording boundary is explicit.

It does not mean every downstream operational status has already been promoted. That is an intentional two-step release boundary:

| Area | Final P3 status | Notes |
| --- | --- | --- |
| Telemetry capture | Complete | `npm run ops:tail:json` was proven by a live smoke and strict production joins. |
| Strict 30 evidence | Complete | P3-T1, P3-T5 repeat 1, and P3-T5 repeat 2 all passed the pinned 30-learner gate. |
| Invocation CPU/wall join | Complete for retained strict top tails | Each strict run matched 10/10 invocation samples. |
| Statement-log join | Complete for retained strict top tails | Each strict run matched 10/10 sampled statement logs. |
| Diagnostic classification | Complete | The strict-run retained top tails are classified without warnings. |
| Public/Admin capacity promotion | Deferred | A separate capacity-status row PR must promote the candidate. |
| 60+ learner support | Not certified | P3 intentionally did not run or certify those tiers. |
| 1000-learner economics | Not certified | The ledger remains modelling-only and still red/unknown in important places. |
| UI/UX impact | None | No learner-facing or adult-facing UI was changed. |

Lean ZIP or local validation can review the code and artefacts, but production capacity certification remains tied to production-origin evidence and the verifier path. P3 respected that boundary throughout.

## Source Contract Traceability

The source contract was:

```text
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3.md
```

The central contract sentence was that P3 repairs missing invocation telemetry, reruns strict 30-learner evidence with repeat confidence, and only then chooses the next mitigation or no mitigation.

The resulting trace is:

| Contract obligation | P3 result |
| --- | --- |
| Preserve P2 truth and avoid single-run certification | Closed. P2 remains documented as non-certifying; P3 uses repeated strict evidence. |
| Prove a machine-joinable invocation CPU/wall capture path | Closed. Live smoke and strict joins use `ops:tail:json` raw captures held outside git. |
| Keep invocation coverage separate from statement-log coverage | Closed. Correlation artefacts report both independently. |
| Preserve request-id pairing and capture-window discipline | Closed. Join artefacts include coverage and warning semantics; raw captures remain local. |
| Keep committed evidence redacted | Closed for new P3 artefacts. Committed files use opaque request and statement identifiers. |
| Rerun strict 30 only after capture path is proven | Closed. P3-T0 preceded the strict P3 runs. |
| Classify retained top-tail bootstrap samples | Closed. The classification markdown summarises the 30 retained strict samples. |
| Keep diagnostics non-certifying | Closed. Worker-log joins remain diagnostic-only and cannot promote status. |
| Keep 1000-learner ledger modelling-only | Closed. The refreshed ledger remains non-certifying and explicitly incomplete. |
| End P3 with one terminal outcome | Closed. Outcome is `strict-30-certified-candidate`. |

## Evidence Inventory

| Artefact | Role | Certification meaning |
| --- | --- | --- |
| `reports/capacity/evidence/2026-04-30-p3-t0-smoke.json` | Bounded production smoke proving the operator path. | Diagnostic only; not a strict gate. |
| `reports/capacity/evidence/2026-04-30-p3-t0-smoke-tail-correlation.json` | Redacted join for the smoke proof. | Diagnostic only. |
| `reports/capacity/evidence/2026-04-30-p3-t1-setup-rate-limited.json` | Preserved failed setup attempt after the demo rate-limit window was hit. | Fail-closed setup evidence; not performance evidence. |
| `reports/capacity/evidence/2026-04-30-p3-t1-strict.json` | First strict 30-learner P3 production run. | Passed candidate evidence. |
| `reports/capacity/evidence/2026-04-30-p3-t1-tail-correlation.json` | Redacted top-tail invocation and statement join for P3-T1. | Diagnostic-only explanation of a passed strict run. |
| `reports/capacity/evidence/2026-04-30-p3-t1-statement-map.json` | Full request-to-statement coverage map for P3-T1. | Diagnostic support, not promotion by itself. |
| `reports/capacity/evidence/2026-04-30-p3-t5-strict-r1.json` | First strict repeat. | Passed candidate evidence. |
| `reports/capacity/evidence/2026-04-30-p3-t5-strict-r1-tail-correlation.json` | Redacted top-tail invocation and statement join for repeat 1. | Diagnostic-only explanation of a passed strict run. |
| `reports/capacity/evidence/2026-04-30-p3-t5-strict-r1-statement-map.json` | Full request-to-statement coverage map for repeat 1. | Diagnostic support, not promotion by itself. |
| `reports/capacity/evidence/2026-04-30-p3-t5-strict-r2.json` | Second strict repeat and recommended promotion candidate row. | Passed candidate evidence, pending separate status PR. |
| `reports/capacity/evidence/2026-04-30-p3-t5-strict-r2-tail-correlation.json` | Redacted top-tail invocation and statement join for repeat 2. | Diagnostic-only explanation of a passed strict run. |
| `reports/capacity/evidence/2026-04-30-p3-t5-strict-r2-statement-map.json` | Full request-to-statement coverage map for repeat 2. | Diagnostic support, not promotion by itself. |
| `reports/capacity/evidence/2026-04-30-p3-tail-classification.md` | Human-readable classification of retained strict top-tail samples. | Diagnostic explanation, not promotion by itself. |
| `reports/capacity/latest-evidence-summary.json` | Generated latest evidence summary. | Remains fail-closed until the verified capacity table includes the P3 candidate row. |
| `reports/capacity/latest-1000-learner-budget.json` | Refreshed 1000-learner modelling ledger. | Modelling-only and non-certifying. |

The raw Cloudflare/Tail captures used for joins stayed outside git under `/tmp/`. That is the intended retention boundary.

## Strict 30-Learner Results

All strict P3 runs used production origin, demo sessions, 30 virtual learners, bootstrap burst 20, one command round, and the pinned `reports/capacity/configs/30-learner-beta.json` threshold config.

| Run | Evidence commit | Total requests | Bootstrap P95 | Bootstrap max | Command P95 | Max response bytes | Failures | Dirty tree |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| P3-T1 strict | `fe8d500` | 170 | 701.3 ms | 703.7 ms | 292.7 ms | 29,597 B | none | false |
| P3-T5 repeat 1 | `3c4b4a5` | 170 | 661.4 ms | 664.3 ms | 319.2 ms | 29,596 B | none | false |
| P3-T5 repeat 2 | `b469e58` | 170 | 715.2 ms | 719.0 ms | 279.7 ms | 29,597 B | none | false |

Every configured threshold passed:

- `max5xx`: 0 observed / 0 allowed.
- `maxNetworkFailures`: 0 observed / 0 allowed.
- `maxBootstrapP95Ms`: below the 1,000 ms ceiling on all strict runs.
- `maxCommandP95Ms`: below the 750 ms ceiling on all strict runs.
- `maxResponseBytes`: below the 600,000 B ceiling on all strict runs.
- `requireZeroSignals`: 0 hard capacity signals on all strict runs.
- `requireBootstrapCapacity`: bootstrap query count 11 and D1 rows read 9 on all strict runs.

The strict evidence is stable enough to close P3 as a 30-learner certification candidate. It is not a status promotion until the capacity table and generated Admin summary are updated in a separate PR.

## Tail Coverage and Classification

P3-T0 proved that the live tail path could produce finite invocation CPU/wall telemetry. The strict runs then produced complete retained top-tail coverage:

| Run | Invocation coverage | Statement coverage | Join warnings | Classification counts |
| --- | ---: | ---: | ---: | --- |
| P3-T1 strict | 10/10 | 10/10 | 0 | `d1-dominated`: 9; `worker-cpu-dominated`: 1 |
| P3-T5 repeat 1 | 10/10 | 10/10 | 0 | `d1-dominated`: 7; `worker-cpu-dominated`: 2; `client-network-or-platform-overhead`: 1 |
| P3-T5 repeat 2 | 10/10 | 10/10 | 0 | `d1-dominated`: 8; `client-network-or-platform-overhead`: 2 |

Across the 30 retained strict-run top-tail bootstrap samples:

| Classification | Samples | Interpretation |
| --- | ---: | --- |
| `d1-dominated` | 24/30 | D1 duration was the largest diagnostic share for most retained samples. |
| `worker-cpu-dominated` | 3/30 | Worker CPU was visible but not a repeated capacity blocker. |
| `client-network-or-platform-overhead` | 3/30 | Some client/platform gap remained, but not enough to fail the strict gate. |

The important distinction is that D1 dominance in a passed strict run is not itself a mandate to optimise D1 immediately. P3 was designed to avoid speculative mitigation. Since the strict gate passed repeatedly, the next action is status governance and a larger diagnostic step, not immediate query or index work.

## Certification Decision

The P3 terminal decision is:

```text
strict-30-certified-candidate
```

This means:

- repeated strict 30-learner production runs passed;
- the verifier path remains intact;
- retained top-tail invocation CPU/wall telemetry is present;
- sampled statement-log coverage is present;
- join warnings are zero;
- no hidden failure, capacity signal, or threshold violation remains in the strict P3 evidence set.

It does not mean:

- public wording has already been promoted;
- Admin Production Evidence should display certified status without a verified table row;
- the diagnostic Worker-log join can certify by itself;
- 60+ learners are supportable;
- the 1000-learner lighthouse target is economically safe.

The recommended promotion row is P3-T5 repeat 2, because it is the final strict repeat after the branch had integrated latest `origin/main`. The separate capacity-status PR should add that reviewed row, regenerate `reports/capacity/latest-evidence-summary.json`, and verify that Admin/latest moves from fail-closed candidate state to the intended public status.

## 1000-Learner Budget State

The refreshed 1000-learner ledger remains modelling-only and non-certifying. It is useful as a planning signal, not as a launch claim.

For the 1000-learner expected scenario:

| Quota | Daily estimate | Free-tier limit | Status |
| --- | ---: | ---: | --- |
| Dynamic requests | 36,015 | 100,000 | green at 36.02% |
| D1 rows read | 825,300 | 5,000,000 | unknown lower-bound at 16.51% |
| D1 rows written | 1,008,000 | 100,000 | red at 1,008% |

For the 1000-learner pessimistic scenario:

| Quota | Daily estimate | Free-tier limit | Status |
| --- | ---: | ---: | --- |
| Dynamic requests | 85,875 | 100,000 | red at 85.88% under the red threshold policy |
| D1 rows read | 57,915,000 | 5,000,000 | red at 1,158.3% |
| D1 rows written | 2,400,000 | 100,000 | red at 2,400% |

Worker CPU remains `unknown` in the ledger because the route-cost model has not yet integrated the joined strict-run CPU telemetry and still lacks parent/admin measured route costs. That is a ledger-modelling limitation, not a contradiction of the P3 strict 30 evidence.

The practical conclusion is unchanged: P3 closes the 30-learner evidence decision. It does not close 1000-learner unit economics.

## Review-Driven Gap Fixes Closed

This P3 closure specifically addresses the gaps found after the earlier tooling/report branches:

| Gap | Resolution |
| --- | --- |
| Tooling branch wording risked implying original P3 completion. | The earlier telemetry-gate report is now marked superseded and points here. |
| No live proof of `ops:tail:json`. | P3-T0 smoke proves the operator path and records a redacted join. |
| Strict P3 evidence had not been rerun. | P3-T1, P3-T5 repeat 1, and P3-T5 repeat 2 are committed. |
| Top-tail invocation CPU/wall coverage was missing in P2. | Each P3 strict run has 10/10 invocation coverage. |
| Statement-log coverage could be confused with invocation coverage. | Correlation artefacts and docs report both separately. |
| Timestamp-free log exports could silently avoid capture-window validation. | Join warnings now include missing-log-timestamp semantics. |
| Parser fixtures used raw-looking request identifiers. | The P3 canonical fixture now uses fixture-only identifiers. |
| Pretty multi-line tail output was not handled by the statement-map parser. | The statement-map parser now accepts that shape and has coverage. |
| Final P3 report was missing. | This report records the terminal decision, evidence inventory, residual gaps, and next phase. |
| Admin/latest could overpromote candidate evidence. | The generated summary remains fail-closed until the verified capacity table is updated. |

The result is not only better evidence. It is a cleaner governance boundary: tooling, diagnostics, strict evidence, public status, and 1000-learner modelling now each have their own role.

## Validation Performed

Local validation for the final P3 gap-fix branch included:

| Command | Result |
| --- | --- |
| `node --test tests/capacity-statement-map.test.js tests/capacity-worker-log-join.test.js tests/capacity-raw-log-gitignore.test.js` | Passed: 18/18 tests. |
| `npm run capacity:verify-evidence` | Passed: 4 verified capacity rows checked. |
| `git diff --check` | Passed. |
| `npm run check` | Passed, including main client bundle at 227,077 / 227,500 bytes gzip. |
| `npm test` | Passed: 14,252 tests, 14,246 passed, 0 failed, 6 skipped. |

The full test run emitted existing warning noise from known test surfaces, including React key-spread warnings, mocked telemetry rejection warnings, expected spelling preference save failure logging, SQLite experimental warnings, and capacity request logs printed during tests. None of those warnings represented a test failure or a new P3 evidence leak.

The new P3 committed artefacts were also scanned for common privacy hazards. No raw Worker request identifiers, bearer tokens, session cookies, SQL text, or obvious table-name leakage were found in the new P3 evidence set.

## Residual Risks and Non-Claims

The following gaps remain by design:

| Residual item | Status | Recommended owner |
| --- | --- | --- |
| 30-learner public/Admin promotion | Pending separate capacity-status PR. | Phase 4A. |
| 60-learner stretch | Not certified. | Phase 4A diagnostic after status update. |
| 100, 300, and 1000 learners | Not certified. | Later capacity phases. |
| Latest evidence summary | Currently fail-closed for P3 candidate evidence until the verified table row exists. | Capacity-status PR. |
| Demo session rate-limit window | Can block setup if strict runs are not spaced or manifest-backed. | Capacity operator checklist. |
| 1000-learner Worker CPU ledger | Still unknown because joined CPU telemetry is not yet integrated into the route-cost model. | Unit-economics modelling phase. |
| Parent/admin route costs | Still incomplete in the modelling ledger. | Unit-economics modelling phase. |

These are not regressions. They are the remaining honest boundaries after P3.

## Recommended Phase 4 Path

The next phase should be:

```text
phase-4a-capacity-status-update-and-60-learner-diagnostic
```

Recommended sequence:

1. Open a narrow capacity-status PR that adds P3-T5 repeat 2 as the reviewed 30-learner beta evidence row.
2. Regenerate `reports/capacity/latest-evidence-summary.json`.
3. Verify Admin Production Evidence now reflects the intended 30-learner certified status and no diagnostic join can certify independently.
4. Keep the P3 report and T1/T5 repeat evidence linked from `docs/operations/capacity.md`.
5. After that status PR is merged, run a 60-learner diagnostic or preflight with the same invocation telemetry discipline.
6. Decide from the 60-learner diagnostic whether Phase 4B should target D1/query shape, write amplification, Worker CPU/payload construction, operations/platform variance, or modelling.

The crucial ordering is status governance first, then larger capacity diagnostics. Do not jump from P3's successful 30-learner strict evidence directly to 1000-learner claims.

## Final Decision

P3 fixed the original gap. The system now has repeated strict 30-learner production evidence with machine-joinable Cloudflare invocation CPU/wall telemetry and complete sampled statement-log coverage for retained top-tail bootstrap samples.

The branch should land as a P3 completion and evidence-lock update. The public capacity status should move only through the next reviewed capacity-status PR.
