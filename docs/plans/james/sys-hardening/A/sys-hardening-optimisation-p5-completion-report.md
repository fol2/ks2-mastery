---
title: "System Hardening Optimisation P5 - Completion Report"
type: completion-report
status: completed-with-operator-gated-production-work
date: 2026-04-30
phase: P5
owner: james
route: system-hardening-optimisation
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-plan.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-60-diagnostic-decision.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-1000-learner-path-decision.md
  - reports/capacity/configs/p4-60-diagnostic-checklist.md
  - reports/capacity/evidence/2026-04-30-p5-route-costs.json
  - reports/capacity/evidence/2026-04-30-p5-60-tail-classification.md
  - reports/capacity/latest-1000-learner-budget.json
---

# System Hardening Optimisation P5 - Completion Report

## Executive summary

P5 repaired the 60-learner diagnostic operator path, added dry-run-safe planning tools, added route-cost evidence validation, integrated partial route-cost and Worker CPU evidence into the 1000-learner budget ledger, and recorded the resulting decisions without promoting unsupported capacity claims.

The phase did not run the live 60-learner production diagnostic because that remains gated on explicit production approval, Cloudflare tail capture, and raw-log handling outside the repository. The selected 60-learner exit state is therefore `60-diagnostic-setup-blocked`.

The 1000-learner model remains `modellingOnly: true` and `certifying: false`. The selected 1000-learner exit state is `1000-route-costs-still-incomplete`.

The existing 30-learner status remains `30-learner-beta-certified` unless later evidence invalidates it. P5 did not change that certification boundary.

## Contract mapping

| Contract area | Delivery status | Evidence |
| --- | --- | --- |
| Repair stale 60-learner checklist commands | Delivered | `reports/capacity/configs/p4-60-diagnostic-checklist.md`; `tests/capacity-operator-checklist.test.js` |
| Validate checklist script paths and options | Delivered | Checklist tests parse command blocks and validate script parser contracts |
| Add a single 60-learner diagnostic planner | Delivered | `scripts/plan-60-learner-diagnostic.mjs`; `npm run capacity:plan-60-diagnostic`; `tests/capacity-plan-60-diagnostic.test.js` |
| Preserve production safety gates | Delivered | Planner and checklist require `--production`, `--confirm-production-load`, and `--confirm-high-production-load` for the 60-learner load command |
| Execute telemetry-complete 60-learner diagnostic | Operator-gated | `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-60-diagnostic-decision.md`; `reports/capacity/evidence/2026-04-30-p5-60-tail-classification.md` |
| Add route-cost diagnostic planner and evidence shape | Delivered | `scripts/plan-route-cost-diagnostic.mjs`; `tests/capacity-route-cost-diagnostic.test.js`; `reports/capacity/evidence/2026-04-30-p5-route-costs.json` |
| Measure every required route family | Partially delivered, gaps explicit | Route-cost evidence records 12 required families, 1 measured, 2 partial, and 9 blocked or missing |
| Integrate route costs into 1000-learner ledger | Delivered | `scripts/build-capacity-budget-ledger.mjs`; `tests/capacity-budget-ledger.test.js`; `reports/capacity/latest-1000-learner-budget.json` |
| Regenerate 1000-learner budget documentation | Delivered | `docs/operations/capacity-1000-learner-free-tier-budget.md` |
| Produce path decisions | Delivered | P5 60 diagnostic decision and P5 1000 learner path decision |
| Avoid false promotion wording | Delivered | Report, decisions, and tests preserve non-certifying wording for 60 and 1000 learners |

## Delivered changes

- Added `scripts/plan-60-learner-diagnostic.mjs` as a dry-run-safe 60-learner run planner. It emits run id, target origin, manifest path, raw tail path, evidence paths, exact commands, expected duration, prerequisites, and raw-log warnings.
- Added `scripts/plan-route-cost-diagnostic.mjs` as a dry-run-safe route-cost planner, validator, and local evidence generator.
- Added npm aliases `capacity:plan-60-diagnostic` and `capacity:plan-route-costs`.
- Repaired the P5 operator checklist so command blocks reference current script names and parser-supported options.
- Added route-cost evidence covering the required route-family inventory, with blocked families represented explicitly instead of silently omitted.
- Updated the 1000-learner budget ledger so route-family coverage, route-cost status, evidence status, redaction status, Worker CPU, Worker wall, and D1 duration can flow into the generated model.
- Regenerated the latest 1000-learner budget JSON and operating documentation from the P5 route-cost input.
- Added P5 decision records for the 60-learner diagnostic and 1000-learner path.

## Evidence summary

The route-cost artefact is `reports/capacity/evidence/2026-04-30-p5-route-costs.json`.

It is deliberately:

- `modellingOnly: true`;
- `certifying: false`;
- `diagnosticOnly: true`;
- aggregate-only and redacted;
- free of committed raw Worker tail JSONL, raw tail paths intended for commit, raw request IDs, and unredacted SQL-like statement text.

Route-family coverage is incomplete by design because several families need live production credentials, authenticated browser/session state, enabled Hero feature flags, or route discovery through the production run path.

The route-cost evidence has one fully measured family and two partial families.

Fully measured:

- `full-bootstrap`;

Partial:

- `demo-session-setup`;
- `grammar-command`.

The missing or blocked families remain explicit in the evidence and budget ledger:

- `not-modified-bootstrap`;
- `spelling-command`;
- `punctuation-command`;
- `parent-summary-hub-read`;
- `admin-production-evidence-overview`;
- `hero-read-model`;
- `hero-command-start`;
- `hero-command-claim`;
- `hero-command-camp`.

## Capacity boundaries

30 learners remain within the previously reviewed `30-learner-beta-certified` boundary. P5 did not alter the promoted row or broaden the claim.

60 learners are not certified. The only selected P5 state for 60 learners is `60-diagnostic-setup-blocked`, because the live production run and Cloudflare tail capture were not started without explicit production approval.

1000 learners remain non-certifying modelling only. The selected P5 state is `1000-route-costs-still-incomplete`, because route-family coverage is incomplete and the current model still shows red risk for D1 write/read budget under expected or pessimistic scenarios.

## Admin evidence and raw-log guardrails

P5 keeps Admin evidence lanes separate: certifying, diagnostic, preflight, smoke, and modelling-only artefacts are not collapsed into one status.

Raw Worker tail JSONL remains local/private. The committed artefacts contain only aggregate, redacted, or explicitly safe diagnostic fields. The checklist and planners warn operators not to commit raw tail captures.

## Reviewer record

The implementation plan passed three independent plan-review gates after seven review rounds:

- Contract completeness: PASS.
- Feasibility and ordering: PASS.
- Autonomous conversion: PASS.

The review blockers fixed before implementation included run-shape precision, route-cost family detail, exit-state taxonomy, `rawTailPath`, personal-account-data boundaries, Admin evidence lanes, verifier guardrails, production flags, endpoint discovery sources, and the not-modified bootstrap `POST /api/bootstrap` path.

## Verification

Focused P5 checks passed:

```sh
node --test tests/capacity-operator-checklist.test.js tests/capacity-plan-60-diagnostic.test.js tests/capacity-route-cost-diagnostic.test.js tests/capacity-budget-ledger.test.js
```

Result: 32 tests passed.

Evidence/schema/Admin/raw-log gate passed:

```sh
node --test tests/capacity-evidence.test.js tests/capacity-evidence-schema.test.js tests/generate-evidence-summary.test.js tests/verify-capacity-evidence.test.js tests/admin-production-evidence.test.js tests/capacity-raw-log-gitignore.test.js && npm run capacity:verify-evidence
```

Result: 200 tests passed, and `Capacity evidence verification passed (5 row(s) checked)`.

Full focused capacity matrix passed:

```sh
node --test tests/capacity-operator-checklist.test.js tests/capacity-plan-60-diagnostic.test.js tests/capacity-route-cost-diagnostic.test.js tests/capacity-session-manifest.test.js tests/capacity-worker-log-join.test.js tests/capacity-statement-map.test.js tests/capacity-budget-ledger.test.js tests/capacity-evidence.test.js tests/capacity-evidence-schema.test.js tests/generate-evidence-summary.test.js tests/verify-capacity-evidence.test.js tests/admin-production-evidence.test.js tests/capacity-raw-log-gitignore.test.js && npm run capacity:verify-evidence
```

Result: 265 tests passed, and `Capacity evidence verification passed (5 row(s) checked)`.

Route-cost local evidence generation passed:

```sh
node scripts/plan-route-cost-diagnostic.mjs --execute-local --output reports/capacity/evidence/2026-04-30-p5-route-costs.json
```

Result: 12 required route families recorded, 1 measured, 2 partial, and 9 missing or blocked.

Budget regeneration passed:

```sh
node scripts/build-capacity-budget-ledger.mjs --input reports/capacity/evidence/2026-04-30-p5-route-costs.json --learners 30,60,100,300,1000
```

Result: regenerated modelling-only budget and documentation; 1000-learner status remains non-certifying.

Worktree setup was run before the full repository gates:

```sh
node scripts/worktree-setup.mjs
```

Result: package files differed from the primary checkout, so `npm install` ran successfully with 0 vulnerabilities.

Repository check passed:

```sh
npm run check
```

Result: Wrangler dry-run build, public asset assertion, and client bundle audit passed.

Final PR CI passed after the rebase:

```sh
npm test + npm run check
```

Result: PASS on the final PR #794 head `92508e4b` after rebasing onto the latest `origin/main`.

Final PR #794 status:

- PR state: merged.
- Merge commit: `abd23e20ea7c13159c63f8d28f29e0753368045b`.
- Merged at: 2026-04-30 21:29:20 UTC.
- `Node Tests (PR)` / `npm test + npm run check`: PASS.
- `Client Bundle Audit (PR)` / `npm run audit:client`: PASS.
- `Punctuation Content Audit (PR)` / `npm run audit:punctuation-content`: PASS.
- `GitGuardian Security Checks`: PASS.
- `Playwright (PR)` mobile golden path job: skipped by path classification.

An earlier pre-rebase PR run and local full-suite run failed on unrelated non-P5 tests. That failure state was superseded by the final rebase onto `origin/main`, after which the PR CI passed and the PR was merged.

## Final decision

P5 has a validated diagnostic command plan and route-cost evidence integration.

The next recommended path is to continue P5 through a human/operator-gated production diagnostic run:

1. Run the 60-learner diagnostic with the repaired checklist or `npm run capacity:plan-60-diagnostic` output.
2. Capture Worker tail JSONL outside the repository.
3. Commit only redacted derived evidence.
4. Re-run the ledger and path decision from the measured 60-learner and route-cost artefacts.
5. Decide the optimisation phase from measured bottlenecks rather than from the current incomplete model.

No 60-learner or 1000-learner support claim should be published from this phase.
