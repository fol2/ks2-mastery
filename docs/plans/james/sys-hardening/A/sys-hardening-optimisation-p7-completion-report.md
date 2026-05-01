---
title: "System Hardening Optimisation P7 — Completion Report"
type: completion-report
status: merged-operator-gated
date: 2026-05-01
phase: P7
owner: james
route: system-hardening-optimisation
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-baseline.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-statement-family-summary.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-post-change-run-report.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-path-decision.md
  - reports/capacity/evidence/2026-05-01-p7-statement-family-summary.json
  - reports/capacity/evidence/2026-05-02-p7-production-bootstrap-probe.json
---

# System Hardening Optimisation P7 — Completion Report

## Status

P7 has passed independent review and was merged via PR #824 at `2026-05-01T23:04:26Z`. A low-risk production demo bootstrap probe confirmed the merged Worker shape. P7 is not ready for certification.

Implementation evidence exists for a narrow bootstrap/D1 query-shape reduction. A deployed single-demo bootstrap probe exists, but post-change 60-learner production diagnostic evidence and route-cost refresh evidence do not exist yet.

## Completed Artefacts

- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-baseline.md`
- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-statement-family-summary.md`
- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-post-change-run-report.md`
- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-path-decision.md`
- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-completion-report.md`
- `reports/capacity/evidence/2026-05-01-p7-statement-family-summary.json`
- `reports/capacity/evidence/2026-05-02-p7-production-bootstrap-probe.json`

P6 handoff ambiguity was also repaired by marking `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-diagnostic-decision.md` as historical pre-approval evidence superseded by the approved P6 run report and path decision.

## Implementation

P7 selected two safe statement families from the P6 statement-family summary:

1. `account-row-selected-learner`
2. `demo-active-account-guard`

The implementation passes the existing authenticated `ensureAccount()` row into bootstrap and uses the already-authenticated demo account snapshot before falling back to the existing D1 demo-active guard.

Expected effect on the P6 target path:

- P6 approved production shape: 11 full-bootstrap statements.
- P7 local valid-demo public bootstrap shape: 9 full-bootstrap statements.
- P7 local three-learner bounded GET/POST bootstrap shape: 10 full-bootstrap statements.
- D1 writes remain 0.
- Bootstrap capacity metadata remains present.
- Public capacity mode remains `public-bounded`.
- Bootstrap mode remains `selected-learner-bounded`.

## Diagnostic Evidence

Statement-family attribution:

- `reports/capacity/evidence/2026-05-01-p7-statement-family-summary.json`
- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-statement-family-summary.md`

Local query-shape evidence:

```sh
node --test tests/worker-bootstrap-capacity.test.js
node --test tests/worker-query-budget.test.js
```

The new P7 assertion locks the valid demo public bootstrap query count at 9 and asserts the duplicate account read plus demo-active guard read are absent. The query-budget ratchet locks the bounded three-learner GET/POST bootstrap count at 10, down from the previous measured 11.

Verification completed after independent review:

```sh
node --test tests/worker-bootstrap-capacity.test.js tests/worker-bootstrap-v2.test.js tests/worker-bootstrap-multi-learner-regression.test.js tests/worker-query-budget.test.js tests/capacity-statement-map.test.js tests/capacity-statement-family-summary.test.js tests/capacity-worker-log-join.test.js tests/capacity-budget-ledger.test.js tests/capacity-evidence.test.js tests/capacity-evidence-schema.test.js tests/verify-capacity-evidence.test.js tests/admin-production-evidence.test.js
node --test tests/worker-capacity-overhead.test.js
npm run capacity:verify-evidence
npm run check
npm test
git diff --check
```

Results:

- focused P7/capacity suite: passed, 276 tests, 0 failures;
- capacity overhead benchmark: passed, 2 tests, 0 failures;
- capacity evidence verifier: passed, 5 rows checked;
- dry-run deploy check: passed;
- full test suite: passed, 21,515 tests, 0 failures, 6 skipped;
- whitespace check: passed;
- P7 redaction scan across this worktree's P7 docs and JSON evidence: no matches.

Deployed production confirmation:

- `reports/capacity/evidence/2026-05-02-p7-production-bootstrap-probe.json`
- production demo session returned HTTP 201;
- production `GET /api/bootstrap` returned HTTP 200;
- `meta.capacity.queryCount` was 9;
- `meta.capacity.d1RowsWritten` was 0;
- bootstrap mode remained `selected-learner-bounded`;
- capacity mode remained `public-bounded`.

## Independent Review Closure

James required two independent reviews before commit, PR and merge. Both are closed:

- Engineering code reviewer: closed the benchmark-gate and report-wording findings with no blocker remaining.
- Contract reviewer: closed the P7-U3 `not-modified-bootstrap` route-cost residual with no blocker remaining.

## Certification Boundary

30 learners remain `30-learner-beta-certified`.

60 learners remain uncertified.

1000 learners remain modelling-only and non-certifying.

This branch must not be described as a 60-learner certification candidate until a deployed post-change production diagnostic passes and a separate repeat-governance step reviews the result.

## Missing / Operator-Gated Evidence

These P7 items remain blocked until an approved 60-learner production diagnostic is run and captured:

- post-change 60-learner production diagnostic;
- redacted post-change tail correlation;
- redacted post-change statement map;
- post-change route-cost refresh;
- explicit `not-modified-bootstrap` route-cost closure, currently still `requires-production-operator` in the 1000-learner budget until post-change route-cost evidence exists;
- regenerated 1000-learner budget from post-change evidence.

The current path decision is therefore `p7-continuation-required`.
