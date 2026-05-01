---
title: "System Hardening Optimisation P6 — Completion Report"
type: completion-report
status: completed-with-approved-diagnostic-threshold-failed
date: 2026-05-01
phase: P6
owner: james
route: system-hardening-optimisation
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-baseline.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-diagnostic-decision.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-approved-run-report.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-path-decision.md
  - reports/capacity/evidence/2026-05-01-p6-60-diagnostic.json
  - reports/capacity/evidence/2026-05-01-p6-60-tail-correlation.json
  - reports/capacity/evidence/2026-05-01-p6-60-statement-map.json
  - reports/capacity/evidence/2026-05-01-p6-route-costs-after-60-diagnostic.json
  - reports/capacity/latest-1000-learner-budget.json
---

# System Hardening Optimisation P6 — Completion Report

## 1. Source Boundary

P6 was first executed from the `sys-hardening-p6` worktree at commit `8a7c3311a1427b445041bd777376ec3309434d47`.

James explicitly approved the P6 plan and P1-P5 plan chain before implementation. After the initial P6 completion, James explicitly approved the operator-gated 60-learner production diagnostic. That live diagnostic ran with session-manifest and Worker tail readiness in place.

## 2. ZIP/GitHub/Ref Identity

This was a full git worktree, not a lean ZIP.

- Branch: `sys-hardening-p6`
- Base: `origin/main`
- Initial P6 ref: `8a7c3311a1427b445041bd777376ec3309434d47`
- Approved diagnostic ref: `dcb699e99134130e61787973a0b66837652ffa49`

## 3. Starting P5 Truth

P6 started from:

- `60-diagnostic-setup-blocked`
- `1000-route-costs-still-incomplete`
- 30 learners: `30-learner-beta-certified`
- 60 learners: not certified
- 1000 learners: modelling-only and non-certifying

## 4. Production Approval Status

The dry-run planner validated successfully and James approved the P6 plan. The initial P6 pass stopped before live execution because no P6 session manifest or raw Worker tail capture existed in that session.

James then approved the operator-gated production diagnostic. The session manifest was prepared outside the repository, Worker JSON tail capture was started outside the repository, and the production load command was run.

## 5. 60-Learner Run Outcome

Outcome: `60-diagnostic-threshold-failed`

The approved run reached production app-load and completed:

- expected requests: 260
- observed requests: 260
- HTTP 200 responses: 260
- 5xx responses: 0
- network failures: 0
- capacity signals: 0

The run failed the 60-learner stretch threshold because bootstrap P95 wall time was 1057.3 ms against the configured 750 ms limit.

## 6. Tail-Correlation Outcome

P6 produced a redacted 60-learner tail correlation artefact:

- `reports/capacity/evidence/2026-05-01-p6-60-tail-correlation.json`

The join matched 10/10 retained top-tail invocation samples and 10/10 statement-log samples with no warnings. Top-tail classifications were:

- `d1-dominated`: 8
- `worker-cpu-dominated`: 2

## 7. Statement-Map Outcome

P6 produced a redacted 60-learner statement map artefact:

- `reports/capacity/evidence/2026-05-01-p6-60-statement-map.json`

Coverage was complete: 260/260 requests had statement logs, 4484/4484 expected statements were observed, and no requests were truncated.

## 8. Route-Cost Coverage Before/After

P5 route-cost coverage:

- required route families: 12
- measured: 1
- partial: 2
- missing or blocked: 9

P6 route-cost coverage after the approved diagnostic:

- required route families: 12
- measured: 1
- partial: 2
- missing/gated: 9

Coverage count did not increase, but evidence quality improved:

- `full-bootstrap` now includes live 60-learner Worker CPU/wall and D1 duration from the approved diagnostic.
- `grammar-command` includes wall-time, query, row, write and response-byte aggregate metrics.
- parent/admin families are explicitly `auth-gated`.
- Hero families are explicitly `feature-gated`.
- every non-measured route family has `missingMetrics` and a justification.

The latest P6 route-cost artefact is:

- `reports/capacity/evidence/2026-05-01-p6-route-costs-after-60-diagnostic.json`

## 9. 1000-Learner Budget Outcome

The 1000-learner budget was regenerated from the latest P6 route-cost artefact:

- `reports/capacity/latest-1000-learner-budget.json`
- `docs/operations/capacity-1000-learner-free-tier-budget.md`

It remains:

- `modellingOnly: true`
- `certifying: false`

Expected 1000-learner model:

- dynamic requests/day: green in the expected scenario
- D1 rows read/day: red, lower-bound
- D1 rows written/day: red, lower-bound
- Worker CPU: red or partial depending on scenario and route coverage

No 1000-learner support claim is made.

## 10. Raw-Log/Redaction Scan Result

Raw Worker tail paths remain ignored by git. Redacted tail-correlation, statement-map, classification and aggregate route-cost paths remain commit-eligible.

No raw Worker tail JSONL was committed.

## 11. Test/Verifier Result

Initial P6 gates passed before the first PR merge:

```sh
npm test
npm run check
```

Result: 16,279 tests passed, 0 failed, 6 skipped; Worker dry-run deploy, build, public asset assertion and client-bundle audit passed.

The approved diagnostic produced `ok: false` because one threshold failed:

```text
max-bootstrap-p95-ms: observed 1057.3 ms, limit 750 ms
```

Route-cost regeneration passed:

```sh
node scripts/plan-route-cost-diagnostic.mjs --json --execute-local \
  --output reports/capacity/evidence/2026-05-01-p6-route-costs-after-60-diagnostic.json \
  --budget reports/capacity/latest-1000-learner-budget.json \
  --evidence reports/capacity/evidence/2026-05-01-p6-60-diagnostic.json \
  --tail-correlation reports/capacity/evidence/2026-05-01-p6-60-tail-correlation.json
```

Budget regeneration passed:

```sh
node scripts/build-capacity-budget-ledger.mjs \
  --input reports/capacity/evidence/2026-05-01-p6-route-costs-after-60-diagnostic.json \
  --learners 30,60,100,300,1000
```

Result: regenerated JSON and Markdown, `certifying: false`.

## 12. Certification Boundary

30-learner beta remains the highest public capacity status.

60 learners are still not certified.

1000 learners remain modelling-only and non-certifying.

No public wording exceeds the existing 30-learner beta boundary.

## 13. P7 Selected Path

Selected exit state: `p7a-bootstrap-d1-selected`

The telemetry-complete 60-learner diagnostic ran and failed bootstrap P95. P7A is selected because the top-tail bootstrap samples are mostly D1 dominated.

## 14. Rejected Alternatives

- P7G 60-learner repeat governance: rejected because the approved diagnostic failed bootstrap P95.
- P7B Worker CPU/JSON work: rejected as the primary path because top-tail bootstrap classification was mostly D1 dominated.
- P7D write-amplification work: rejected as the immediate certification blocker because command P95 passed.
- P6 continuation: rejected because the approved live diagnostic, tail join and statement map are now complete.

## 15. Residual Risks

- P6 still needs post-optimisation repeat evidence before any 60-learner certification candidate can be proposed.
- Not-modified bootstrap, spelling-command, punctuation-command, parent/admin and Hero route costs remain unmeasured or gated.
- Worker CPU is measured for bootstrap only and remains partial across route families.
- The expected 1000-learner scenario still fails D1 rows written and D1 rows read in the lower-bound model.
- Older capacity run artefacts remain source evidence; P6 did not rewrite historical evidence files.

## Final Decision

P6 now includes the approved operator-gated 60-learner diagnostic and selected `p7a-bootstrap-d1-selected`.

The next safe step is not certification. It is P7A bootstrap/D1 query-shape and cache-contract optimisation, followed by a fresh approved 60-learner diagnostic and repeat-governance evidence before any 60-learner public status promotion.
