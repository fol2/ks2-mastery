---
title: "System Hardening Optimisation P5 — Implementation Plan"
type: implementation-plan
status: active
date: 2026-04-30
phase: P5
owner: james
route: system-hardening-optimisation
language: en-GB
origin:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5.md
---

# System Hardening Optimisation P5 — Implementation Plan

## Problem Frame

P5 must turn the P4 governance result into an executable diagnostic path without making unsupported capacity claims. The source contract is `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5.md`; this plan maps every P5 unit into implementation work, tests, and evidence-bound reporting.

The key constraint is that the 60-learner production diagnostic may require live Cloudflare access and a human operator. Autonomous work must therefore make the run plan executable, lock the command contracts, and produce an honest decision record if the live run remains operator-gated. No implementation may certify 60 learners, claim 1000-learner readiness, relax thresholds, or change learner-facing semantics.

## Scope Boundaries

- Do not change public subject learning semantics, rewards, Stars, Mega, Hero child-facing behaviour, or mastery logic.
- Do not relax 60-learner thresholds or promote 60-learner certification from one diagnostic.
- Do not commit raw Worker tail JSONL, cookies, bearer tokens, raw `ks2_req_*` IDs, learner names, raw answers, or unredacted SQL/table/column names.
- Do not commit personal account data.
- Keep `reports/capacity/latest-1000-learner-budget.json` modelling-only and non-certifying.
- Runtime product behaviour may change only for diagnostic/operator tooling.
- Do not ship D1 index changes, query-shape changes, command batching, write compaction, or write-amplification mitigation in P5. Those remain deferred until the 60-learner run and route-cost evidence classify the next phase.

## Implementation Units

### P5-U0 — Repair the 60-Learner Operator Checklist

Files:

- Modify `reports/capacity/configs/p4-60-diagnostic-checklist.md`
- Create `tests/capacity-operator-checklist.test.js`
- Reuse parser contracts from `scripts/prepare-session-manifest.mjs`, `scripts/join-capacity-worker-logs.mjs`, and `scripts/build-capacity-statement-map.mjs`

Approach:

- Replace stale `--bucket-reset-minutes` with `--delay-ms 610000`.
- Keep `--batch-size 28` in the manifest command.
- Replace `scripts/correlate-worker-tail.mjs` with `scripts/join-capacity-worker-logs.mjs`.
- Replace `scripts/build-statement-map.mjs` with `scripts/build-capacity-statement-map.mjs`.
- Replace `--tail` with `--logs`.
- Ensure the documented 60-learner load command uses the real production path and safety acknowledgements:
  - `--production`
  - `--confirm-production-load`
  - `--confirm-high-production-load`
- Update P4 naming to P5 diagnostic naming where the checklist is now the P5 operator entry point.
- Add raw-log handling text that explicitly forbids committing raw `*.jsonl` Worker tail captures and documents the redacted correlation/statement-map alternative.

Test Scenarios:

- Every `node scripts/*.mjs` command in the checklist references an existing script.
- Every documented CLI option is accepted by that script parser or help contract.
- The checklist no longer contains stale script names or `--bucket-reset-minutes`.
- The checklist contains the raw JSONL non-commit guardrail.
- The checklist manifest command includes `--batch-size 28` and `--delay-ms 610000`.
- The checklist 60-learner load command cannot omit `--production`, `--confirm-production-load`, or `--confirm-high-production-load`.

### P5-U1 — Add a Dry-Run-Safe 60-Learner Diagnostic Planner

Files:

- Create `scripts/plan-60-learner-diagnostic.mjs`
- Modify `package.json`
- Create `tests/capacity-plan-60-diagnostic.test.js`

Approach:

- Add a planner that validates referenced scripts and parser-known options.
- Default to dry-run: print the exact run sequence, paths, expected duration, prerequisites, and raw-log warning without creating sessions or starting tail capture.
- Add `--json` for a machine-readable plan.
- Add a local-only `--execute` gate that prints the execution sequence and runs safe local validations only. It must not start the 30-minute manifest process, live production load, or tail capture.
- Full production orchestration belongs to `P5-U2/U3`; U1 only proves that the command plan is complete, parser-valid, and safe to hand to that execution phase.
- Add `npm run capacity:plan-60-diagnostic`.
- Planner output must include all contract-required fields: run id, target origin, manifest path, raw tail path, diagnostic evidence path, tail-correlation output path, statement-map output path, exact commands, raw-log warning, expected duration, and environment prerequisites.

Test Scenarios:

- Dry-run works without Cloudflare credentials.
- Planner fails if a required script path is missing.
- Planner fails if a command option is unknown.
- `--json` emits run id, origin, paths, commands, raw-log warning, expected duration, and prerequisites.
- `--json` includes an explicit `rawTailPath` that points outside the repo by default.
- Production-mode load commands include `--production`, `--confirm-production-load`, and `--confirm-high-production-load`; planner/checklist tests fail if any are omitted from the 60-learner command.
- Manifest commands include `--batch-size 28` and `--delay-ms 610000`.
- Planner output never stages or commits raw logs.

### P5-U2/U3 — Evidence-Bound 60-Learner Diagnostic Decision

Files:

- Create `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-60-diagnostic-decision.md`
- Create `reports/capacity/evidence/2026-04-30-p5-60-tail-classification.md`
- Optionally create redacted diagnostic artefacts only if a live run is available and policy-compliant

Approach:

- Attempt only non-destructive local readiness checks in automation.
- Preserve the exact production diagnostic shape in the planner and decision record:
  - origin `https://ks2.eugnel.uk`
  - learners `60`
  - bootstrap burst `20`
  - rounds `1`
  - threshold config `reports/capacity/configs/60-learner-stretch.json`
  - pre-created manifest `/tmp/ks2-p5-60-manifest.json`
  - Worker JSON tail capture started before the load run
  - diagnostic evidence `reports/capacity/evidence/2026-04-30-p5-60-diagnostic.json`
  - tail correlation `reports/capacity/evidence/2026-04-30-p5-60-tail-correlation.json`
  - statement map `reports/capacity/evidence/2026-04-30-p5-60-statement-map.json`
  - tail classification `reports/capacity/evidence/2026-04-30-p5-60-tail-classification.md`
- If Cloudflare tail/session credentials or an approved raw-log capture are unavailable, classify the phase as `60-diagnostic-setup-blocked` with the exact blocker and the validated diagnostic command path.
- When full production orchestration is explicitly approved and credentials are available, execute the U1 command plan:
  - prepare the session manifest with `scripts/prepare-session-manifest.mjs --batch-size 28 --delay-ms 610000`;
  - start `npm run ops:tail:json` before the load run and write to the raw tail path outside the repo;
  - run `npm run capacity:classroom` with the exact P5 60-learner diagnostic shape, including `--production`, `--confirm-production-load`, and `--confirm-high-production-load`;
  - stop/cleanup the tail process after the bounded capture window;
  - join the redacted tail correlation via `scripts/join-capacity-worker-logs.mjs`;
  - build the redacted statement map via `scripts/build-capacity-statement-map.mjs`;
  - write the tail classification markdown and decision record.
- If any required credential, approval, or capture step is missing, fail closed into the setup/telemetry blocker path rather than starting a partial production run.
- If a redacted live diagnostic is available, classify into the contract taxonomy using the evidence, tail correlation, and statement map.
- Never treat one positive diagnostic as certification.

Test Scenarios:

- Decision record states source boundary, run id, artefacts, app-load status, thresholds, tail classification, route/payload summary, CPU/wall status, certification boundary, next path, and rejected alternatives.
- Tail classification markdown is created even when the live run is blocked, and records the selected diagnostic state plus evidence/source boundary.
- Decision record includes a query/row/write/payload summary, not only a route/payload summary.
- No certification wording appears without a separate reviewed certification policy.

### P5-U4a — Route-Cost Collection Probe and Evidence Shape

Files:

- Create `scripts/plan-route-cost-diagnostic.mjs`
- Create `tests/capacity-route-cost-diagnostic.test.js`
- Create or update `reports/capacity/evidence/2026-04-30-p5-route-costs.json` when measured or explicitly blocked route-cost inputs are available

Approach:

- Add a dry-run-safe planner for route-cost coverage. It must list exact route families, expected commands/probes, prerequisite auth/session needs, output path, redaction policy, and whether each route can be measured locally, requires production credentials, or is unavailable because the feature is disabled.
- Add an execution path for route-cost measurement:
  - `--execute-local` measures any route family that can be exercised against the local Worker/test harness or existing redacted evidence without live production credentials.
  - `--execute-production` requires explicit production approval and available auth/session material before probing live routes.
  - Each executable probe writes aggregate, redacted route-family evidence only. Routes that cannot safely run must be recorded as `requires-production-operator`, `requires-auth-session`, `requires-route-discovery`, or `feature-disabled`, never silently omitted.
- Required route families:
  - `full-bootstrap`: `GET /api/bootstrap`
  - `not-modified-bootstrap`: `POST /api/bootstrap` with a matching `{ "lastKnownRevision": "<current revision hash>" }` body. The probe must first obtain the current revision hash from a full bootstrap, then exercise the not-modified branch. Use `src/platform/core/repositories/api.js`, `worker/src/app.js`, and `tests/worker-bootstrap-v2.test.js` as the method/body/response oracle.
  - `demo-session-setup`: `POST /api/demo/session`
  - `spelling-command`: `POST /api/subjects/spelling/command`
  - `grammar-command`: `POST /api/subjects/grammar/command`
  - `punctuation-command`: `POST /api/subjects/punctuation/command`
  - `parent-summary-hub-read`: discover exact endpoint from `worker/src/app.js`, `src/surfaces/hubs/ParentHubSurface.jsx`, `src/platform/hubs/api.js`, `tests/hub-api.test.js`, and `tests/worker-hubs.test.js`; candidate endpoint families are `GET /api/hubs/parent`, `GET /api/hubs/parent/summary`, `GET /api/hubs/parent/recent-sessions`, and `GET /api/hubs/parent/activity`
  - `admin-production-evidence-overview`: discover exact endpoint from `worker/src/app.js`, `src/platform/hubs/admin-production-evidence.js`, `tests/worker-admin-ops-read.test.js`, `tests/react-admin-production-evidence.test.js`, and `tests/react-admin-evidence-lanes.test.js`; expected family includes `GET /api/admin/ops/production-evidence`
  - `hero-read-model`: discover exact endpoint from `worker/src/app.js`, `worker/src/hero/routes.js`, `worker/src/hero/read-model.js`, `tests/worker-hero-command.test.js`, and `tests/hero-pA2-internal-override-surface.test.js`; expected family includes `GET /api/hero/read-model`
  - `hero-command-start`: discover exact Hero command endpoint and start action shape from `worker/src/hero/routes.js`, `worker/src/hero/launch.js`, and `tests/worker-hero-command.test.js` when Hero commands are enabled; expected endpoint family includes `POST /api/hero/command`
  - `hero-command-claim`: discover exact Hero command endpoint and claim action shape from `worker/src/hero/routes.js`, `worker/src/hero/claim.js`, and Hero command/claim tests when Hero claim is enabled
  - `hero-command-camp`: discover exact Hero camp endpoint/action shape from `worker/src/hero/routes.js`, `worker/src/hero/camp.js`, and Hero camp tests when Hero camp is enabled
- The planner must include a `discoverySource` for every non-literal route family, pointing to the exact source files/tests used to resolve endpoint and method. If a route cannot be discovered, mark it `requires-route-discovery` rather than guessing.
- Required output fields per route family:
  - count
  - wall P50/P95/max
  - Worker CPU P50/P95/max when available
  - Worker wall P50/P95/max when available
  - D1 duration P50/P95/max
  - query count P50/P95/max
  - D1 rows read P50/P95/max
  - D1 rows written P50/P95/max
  - response bytes P50/P95/max
  - redaction status
  - evidence source path
  - evidence status: certifying, diagnostic-only, or modelling-only
- The evidence file may record `missing-route`, `missing-metric`, `requires-production-operator`, or `feature-disabled` statuses, but it must not silently omit a required route family.
- Raw logs remain local/private. The route-cost artefact may only contain redacted, aggregate, or explicitly safe diagnostic fields.

Test Scenarios:

- Planner emits all required route families and output fields.
- Planner JSON mode includes output path, commands/probes, prerequisites, and redaction warnings.
- Route-cost evidence validation fails when a required route family is omitted.
- Route-cost evidence validation fails when raw request IDs, raw tail paths intended for commit, or unredacted SQL-like statement text appears.
- Non-literal parent/admin/Hero families must include endpoint/method and discovery source, or an explicit `requires-route-discovery` status.
- Not-modified bootstrap evidence must be for `POST /api/bootstrap` with a matching `lastKnownRevision` and `meta.capacity.bootstrapMode`/equivalent evidence showing the not-modified path, not a second full-bootstrap GET.
- `--execute-local` records measured local/fixture-backed route costs where available and blocked statuses for the rest.

### P5-U4b/U5 — Route-Cost Ledger Integration and 1000-Learner Path Decision

Files:

- Modify `scripts/build-capacity-budget-ledger.mjs`
- Modify `tests/capacity-budget-ledger.test.js`
- Consume `reports/capacity/evidence/2026-04-30-p5-route-costs.json` when available
- Regenerate `reports/capacity/latest-1000-learner-budget.json`
- Regenerate `docs/operations/capacity-1000-learner-free-tier-budget.md`
- Create `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-1000-learner-path-decision.md`

Approach:

- Teach the budget ledger to consume redacted tail-correlation CPU/wall telemetry when available.
- Teach the budget ledger to consume the P5 route-cost evidence shape from U4a.
- Add explicit required route-family coverage for full bootstrap, not-modified bootstrap, demo/session setup, spelling command, grammar command, punctuation command, parent summary/hub read, Admin production evidence/overview, Hero read model, and Hero start/claim/camp command routes when enabled.
- Keep missing route families visible as gaps rather than silently absent.
- Preserve the full required metric list for each route family: wall, Worker CPU, Worker wall, D1 duration, query count, D1 rows read, D1 rows written, response bytes, redaction status, evidence source path, and evidence status.
- Preserve `modellingOnly: true` and `certifying: false`.
- Generate a path decision that answers the seven P5 questions and selects "do not optimise yet" if evidence remains incomplete.
- Path decision must keep the product copy boundary explicit: it may not say “60 learners are supported” or “1000 learners are supported” unless separate accepted certification/evidence exists outside P5.
- Path decision names rejected alternatives, including write compaction, query/cache work, payload/CPU work, and continued diagnostic repair when they are not chosen.

Test Scenarios:

- Worker CPU is not globally `unknown` when joined CPU samples are supplied.
- Demo/session and parent/admin route gaps are explicit in the ledger.
- Required route families report present or missing with missing metrics.
- Separate spelling, grammar, punctuation, parent-summary, Admin evidence, Hero read, and Hero command families are not collapsed into a single generic phase.
- 1000-learner model remains non-certifying.
- Path decision does not choose write compaction solely from incomplete route coverage.

### P5-U6 — Completion Report and Guardrail

Files:

- Create `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-completion-report.md`

Approach:

- Map every contract requirement to delivered evidence or a human/operator-gated blocker.
- State the 30/60/1000 boundaries exactly.
- Record one explicit P5 exit state from the contract taxonomy:
  - `60-diagnostic-positive-repeat-needed`
  - `60-diagnostic-d1-dominated`
  - `60-diagnostic-worker-cpu-dominated`
  - `60-diagnostic-platform-overhead`
  - `60-diagnostic-payload-bound`
  - `60-diagnostic-query-fanout`
  - `60-diagnostic-write-amplification-bound`
  - `60-diagnostic-setup-blocked`
  - `60-diagnostic-insufficient-logs`
  - `1000-route-costs-still-incomplete`
  - `1000-write-amplification-confirmed`
- Record tests run and any production diagnostic blocker.
- Recommend the next path from the evidence.

Test Scenarios:

- Report contains no false promotion wording.
- Report says 60 learners are not certified unless repeat policy and reviewed governance exist.
- Report says 1000 learners remain modelling-only.
- Report records raw-log and Admin evidence guardrails.
- Report confirms the Admin evidence surface still separates `certifying`, `diagnostic`, `preflight`, `smoke`, and `modelling-only` artefacts.
- Report and product-copy checks forbid “60 learners are supported” and “1000 learners are supported” unless separate accepted certification/evidence exists.

## Verification

Focused checks:

```sh
node --test tests/capacity-operator-checklist.test.js
node --test tests/capacity-plan-60-diagnostic.test.js
node --test tests/capacity-route-cost-diagnostic.test.js
node --test tests/capacity-session-manifest.test.js
node --test tests/capacity-worker-log-join.test.js
node --test tests/capacity-statement-map.test.js
node --test tests/capacity-budget-ledger.test.js
node --test tests/capacity-evidence.test.js
node --test tests/capacity-evidence-schema.test.js
node --test tests/generate-evidence-summary.test.js
node --test tests/verify-capacity-evidence.test.js
node --test tests/admin-production-evidence.test.js
node --test tests/capacity-raw-log-gitignore.test.js
npm run capacity:verify-evidence
```

Broad checks after focused tests pass:

```sh
npm test
npm run check
```

`CAPACITY_VERIFY_SKIP_ANCESTRY=1` is allowed only in ZIP-only review environments for local shape checking. It must not be used for the final P5 full-clone verifier claim.

## PR Slices and Dependencies

- `P5-U0` is an independent checklist and command-contract repair slice.
- `P5-U1` depends on `P5-U0` because the planner must emit the corrected command contract. It is limited to dry-run planning, machine-readable output, and local validation.
- `P5-U2/U3` are grouped because production execution, tail classification, and the decision record must land together for evidence traceability. They consume the U1 plan and own any approved production orchestration.
- `P5-U4a` can land after the tooling baseline and defines the route-cost evidence shape plus local/prod probe plan.
- `P5-U4b/U5` are grouped because ledger integration and the 1000-learner path decision both depend on the same route-cost evidence shape.
- `P5-U6` is final-only and must be written after diagnostic, route-cost, budget, and decision artefacts exist.

## Deferred Human/Operator Items

- Running the live production 60-learner diagnostic remains human/operator-gated unless the environment has the required Cloudflare access, tail capture, and safe production-run approval.
- Raw Worker tail capture remains local/private. Only redacted derived artefacts may be committed.
