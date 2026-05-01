---
title: "System Hardening Optimisation P6 — Completion Report"
type: completion-report
status: completed-with-p6-continuation-required
date: 2026-05-01
phase: P6
owner: james
route: system-hardening-optimisation
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-baseline.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-diagnostic-decision.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-path-decision.md
  - reports/capacity/evidence/2026-04-30-p6-route-costs.json
  - reports/capacity/latest-1000-learner-budget.json
---

# System Hardening Optimisation P6 — Completion Report

## 1. Source Boundary

P6 was executed from the `sys-hardening-p6` worktree at commit `8a7c3311a1427b445041bd777376ec3309434d47`.

James explicitly approved the P6 plan and P1-P5 plan chain before implementation. P6 preserved the production safety gate: no live load was started without session-manifest and Worker tail readiness.

## 2. ZIP/GitHub/Ref Identity

This was a full git worktree, not a lean ZIP.

- Branch: `sys-hardening-p6`
- Base: `origin/main`
- Ref: `8a7c3311a1427b445041bd777376ec3309434d47`

## 3. Starting P5 Truth

P6 starts from:

- `60-diagnostic-setup-blocked`
- `1000-route-costs-still-incomplete`
- 30 learners: `30-learner-beta-certified`
- 60 learners: not certified
- 1000 learners: modelling-only and non-certifying

## 4. Production Approval Status

The dry-run planner validated successfully and James approved the P6 plan. Live execution was still blocked because no P6 session manifest or raw Worker tail capture existed in this session.

The production load command was therefore not run.

## 5. 60-Learner Run Outcome

Outcome: `60-diagnostic-setup-blocked`

The run did not reach production app-load. The missing live-run prerequisites were:

- `/tmp/ks2-p6-60-manifest.json`
- `/tmp/ks2-p6-60-worker-tail.jsonl`
- a Worker JSON tail capture window started before load

## 6. Tail-Correlation Outcome

No P6 60-learner tail-correlation JSON was produced. The only committed P6 60-learner tail artefact is the blocked-run classification:

- `reports/capacity/evidence/2026-04-30-p6-60-tail-classification.md`

## 7. Statement-Map Outcome

No P6 60-learner statement map was produced because there was no raw tail capture for the run id.

## 8. Route-Cost Coverage Before/After

P5 route-cost coverage:

- required route families: 12
- measured: 1
- partial: 2
- missing or blocked: 9

P6 route-cost coverage:

- required route families: 12
- measured: 1
- partial: 2
- missing/gated: 9

Coverage count did not increase, but the evidence quality improved:

- `grammar-command` now includes wall-time, query, row, write and response-byte aggregate metrics from the existing 60-learner preflight input.
- `grammar-command` is missing only Worker CPU/wall and D1 duration fields.
- parent/admin families are explicitly `auth-gated`.
- Hero families are explicitly `feature-gated`.
- every non-measured route family has `missingMetrics` and a justification.

The P6 route-cost artefact is:

- `reports/capacity/evidence/2026-04-30-p6-route-costs.json`

## 9. 1000-Learner Budget Outcome

The 1000-learner budget was regenerated from the P6 route-cost artefact:

- `reports/capacity/latest-1000-learner-budget.json`
- `docs/operations/capacity-1000-learner-free-tier-budget.md`

It remains:

- `modellingOnly: true`
- `certifying: false`

Expected 1000-learner model:

- dynamic requests/day: green
- D1 rows read/day: red, lower-bound
- D1 rows written/day: red, lower-bound
- Worker CPU: red and partial

No 1000-learner support claim is made.

## 10. Raw-Log/Redaction Scan Result

Raw Worker tail paths remain ignored by git. Redacted tail-correlation and statement-map paths remain commit-eligible.

The committed P6 route-cost and budget artefacts were scanned for raw `ks2_req_*` ids, raw tail path tokens, SQL verbs, account ids and learner ids. No matches were found.

No raw Worker tail JSONL was committed.

## 11. Test/Verifier Result

Fresh-worktree setup completed before the full gates:

```sh
node scripts/worktree-setup.mjs
```

Result: `node_modules` was already present in the worktree.

Focused planner, route-cost and budget checks passed:

```sh
node --test \
  tests/capacity-plan-60-diagnostic.test.js \
  tests/capacity-route-cost-diagnostic.test.js \
  tests/capacity-budget-ledger.test.js
```

Result: 30 tests passed.

The P6 planner dry-run now resolves the run-specific machine metadata and decision path correctly:

```text
p6-60-learner-diagnostic-plan
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-diagnostic-decision.md
```

The P6 route-cost planner resolves the route-cost plan kind from the P6 output path:

```text
p6-route-cost-diagnostic-plan
```

The redaction guard now rejects raw tail paths under `reports/capacity/evidence/` with either POSIX or Windows-style separators.

Focused P6 capacity matrix and evidence verifier passed:

```sh
node --test \
  tests/capacity-operator-checklist.test.js \
  tests/capacity-plan-60-diagnostic.test.js \
  tests/capacity-route-cost-diagnostic.test.js \
  tests/capacity-session-manifest.test.js \
  tests/capacity-worker-log-join.test.js \
  tests/capacity-statement-map.test.js \
  tests/capacity-evidence.test.js \
  tests/capacity-evidence-schema.test.js \
  tests/generate-evidence-summary.test.js \
  tests/verify-capacity-evidence.test.js \
  tests/capacity-raw-log-gitignore.test.js \
  tests/capacity-budget-ledger.test.js
```

```sh
npm run capacity:verify-evidence
```

Result: 231 tests passed and capacity evidence verification passed for 5 checked rows.

Budget regeneration passed:

```sh
node scripts/build-capacity-budget-ledger.mjs \
  --input reports/capacity/evidence/2026-04-30-p6-route-costs.json \
  --learners 30,60,100,300,1000
```

Result: regenerated JSON and Markdown, `certifying: false`.

Full repository test gate passed:

```sh
npm test
```

Result: 16,279 tests passed, 0 failed, 6 skipped.

Cloudflare dry-run check passed:

```sh
npm run check
```

Result: Worker dry-run deploy, build, public asset assertion and client-bundle audit passed. npm emitted the existing `playwright_skip_browser_download` config warning, but the gate exited successfully.

## 12. Certification Boundary

30-learner beta remains the highest public capacity status.

60 learners are still not certified.

1000 learners remain modelling-only and non-certifying.

No public wording exceeds the existing 30-learner beta boundary.

## 13. P7 Selected Path

Selected exit state: `p6-continuation-required`

No P7 optimisation phase is selected yet because the telemetry-complete 60-learner diagnostic did not run.

## 14. Rejected Alternatives

- P7D write-amplification work: rejected because D1 writes are red but coverage is incomplete.
- P7A bootstrap/D1 query-shape work: rejected because D1 reads are red but P6 live telemetry is missing.
- P7B Worker CPU/JSON work: rejected because Worker CPU evidence is bootstrap-only and partial.
- P7G 60-learner repeat governance: rejected because there is no positive P6 diagnostic.

## 15. Residual Risks

- P6 still needs an operator-gated live 60-learner run with raw Worker JSON tail capture outside the repository.
- Not-modified bootstrap, spelling-command, punctuation-command, parent/admin and Hero route costs remain unmeasured or gated.
- Worker CPU is measured for bootstrap only and remains partial across route families.
- The expected 1000-learner scenario still fails D1 rows written and D1 rows read in the lower-bound model.
- Older capacity run artefacts remain source evidence; P6 did not rewrite historical evidence files.

## Final Decision

P6 closed the autonomous route-cost/documentation portion and selected `p6-continuation-required`.

The next safe step is not optimisation. It is the approved operator-gated production diagnostic with session manifest preparation, Worker JSON tail capture, redacted correlation, statement map generation, and then a fresh P7 path decision from completed telemetry.
