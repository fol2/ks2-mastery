---
title: "System Hardening Optimisation P1 Implementation Handoff"
type: report
status: implementation-handoff
date: 2026-04-29
branch: codex/sys-hardening-p1-evidence-attribution
source_plan: docs/plans/2026-04-29-010-feat-sys-hardening-optimisation-p1-evidence-attribution-plan.md
---

# System Hardening Optimisation P1 Implementation Handoff

## Executive Summary

This is an implementation handoff for the P1 evidence-attribution and narrow bootstrap-query optimisation slice. It is not a Phase 1 acceptance completion claim, and it does not promote capacity status.

The repo now has a diagnostic lane for joining Cloudflare Worker CPU/wall logs to app capacity evidence, structured bootstrap phase timings in Worker logs, a statement-map builder, and a non-certifying 1000-learner free-tier budget ledger. These artefacts explain what to investigate next; they do not certify 30, 60, 100, 300, or 1000 learner capacity.

The one allowed P1 code optimisation shipped: public selected-learner-bounded bootstrap now derives active session IDs from the `child_subject_state` rows it already loaded, instead of issuing a second `child_subject_state` read. Local query-budget coverage measured the public bootstrap path dropping from 12 to 11 D1 queries. The budget was ratcheted to 12 (measured +1 headroom) and multi-learner, selected learner, active-session, redaction, and not-modified regression coverage remained green.

## Final Decision

| Gate | Final P1 result | Reason |
| --- | --- | --- |
| Phase 1 acceptance | Not complete | Post-change strict/repeated production evidence and joined top-tail Worker CPU/wall artefacts are still required. |
| 30-learner classroom beta | Not certified | Latest committed strict evidence still fails bootstrap P95: 1,167.4 ms observed vs 1,000 ms configured. |
| 60-learner stretch | Not certified | Latest committed stretch preflight is diagnostic and fails bootstrap P95: 854 ms observed vs 750 ms configured. |
| Public capacity wording | Remains `small-pilot-provisional` | P1 artefacts are diagnostic or modelling only; no passing strict 30 evidence exists. |
| Worker CPU/D1 attribution | Tooling shipped | Missing Worker CPU logs classify as `unclassified-insufficient-logs`; joined diagnostics cannot certify. |
| One-statement bootstrap reduction | Shipped | Query budget dropped by one while preserving bootstrap correctness invariants. |
| 1000-learner readiness | Not certified | Budget ledger marks 1000-learner modelling as D1-read red and CPU unknown until Worker log joins exist. |

## Phase 1 Decision Record

Date: 2026-04-29
Branch: `codex/sys-hardening-p1-evidence-attribution`
PR base commit after rebase: `951af720` (`origin/main`, `test(hero-mode): enhance pA1 flag ladder validation with additional assertions (U3)`)
Environment: local verification plus committed production evidence from 2026-04-28

Existing evidence files and implementation artefacts:

- `reports/capacity/evidence/30-learner-beta-v2-20260428-p5-warm.json`
- `reports/capacity/evidence/60-learner-stretch-preflight-20260428-p6.json`
- `reports/capacity/latest-1000-learner-budget.json`
- `docs/operations/capacity-cpu-d1-evidence.md`
- `docs/operations/capacity-tail-latency.md#p1-evidence-attribution-matrix`
- `docs/operations/capacity-1000-learner-free-tier-budget.md`

Pending acceptance artefacts:

- post-change strict 30 baseline evidence;
- repeated post-change strict 30 evidence;
- bounded Cloudflare Worker CPU/wall export for the same strict evidence window;
- joined top-tail CPU/D1 classification artefact;
- statement map generated from complete statement coverage for the same investigation window.

### Current Certification Status

- 30 learner: not certified. The strict 30 evidence fails `maxBootstrapP95Ms`.
- 60 learner: not certified. The latest 60 evidence is diagnostic and fails `maxBootstrapP95Ms`.
- Public wording: remains `small-pilot-provisional`.

### Bootstrap Tail Classification

- Classification: `unclassified-insufficient-logs` for CPU attribution on committed evidence until a bounded Cloudflare Worker log export is joined.
- Supporting request IDs: the P6 60-learner diagnostic file retains top-tail request IDs including `ks2_req_2ab4fe93-5ecb-4e56-879e-0c6fe7dddd8d`, `ks2_req_891a4f3c-9b2f-4ef3-a363-c7dbb04d9be2`, and `ks2_req_6f612c5a-b201-4033-8bdb-434a86bd8e0a`.
- App wall P95: 1,167.4 ms for the strict 30 file; 854 ms for the 60 stretch preflight.
- Cloudflare CPU P95/top-tail: unknown until Worker logs are joined.
- D1 duration P95/top-tail: not available in the strict 30 file; the P6 60 file has server-side endpoint summaries and top-tail request IDs for correlation.
- Query count P95/max: 12 on committed production evidence; local post-U5 bootstrap budget path measured 11.
- Rows read P95/max: 10 for bootstrap on committed production evidence.
- Rows written P95/max: 0 for bootstrap on the P6 60 diagnostic evidence.
- Response bytes P95/max: 2,450 bytes max for bootstrap on committed evidence.

### One-Statement Reduction Decision

- Shipped / not shipped: shipped.
- Reason: active session IDs can be derived from already-loaded selected-learner subject-state rows without widening the bootstrap envelope or losing sibling state.
- Query count before: 12 in the measured public bounded bootstrap path.
- Query count after: 11 in local query-budget tests.
- Strict evidence after change: not present in this handoff. A post-deploy strict 30 production run is still required before Phase 1 acceptance can be closed or any capacity promotion can be considered.

### 1000-Learner Budget Judgement

- Worker request bottleneck: green through expected 1000-learner modelling, red in the pessimistic 1000-learner scenario.
- D1 read bottleneck: red for 1000 learners across optimistic, expected, and pessimistic scenarios, using current measured route costs.
- D1 write bottleneck: unknown lower-bound because the committed strict evidence lacks full write coverage for every route.
- CPU bottleneck: unknown until Worker CPU logs are joined.
- D1 queue bottleneck: plausible but not proven; top-tail request IDs must be joined with Worker logs and statement timings before claiming D1 queue/platform variance.

### Recommended Phase 2 Path

- Primary path: bootstrap tail reduction using joined Worker-log evidence, with D1 read reduction as the first budget-protecting direction.
- Secondary path: complete Worker CPU join before CPU-specific optimisation.
- Deferred paths: public capacity promotion, threshold relaxation, D1 indexing without query-plan/write-cost evidence, and any 1000-learner public claim.

## What Shipped

### Worker CPU/D1 Evidence Lane

`scripts/join-capacity-worker-logs.mjs` ingests bounded Workers Trace, Tail Workers, Logpush-style JSON/JSONL, and sampled `[ks2-worker]` `capacity.request` logs. It writes a diagnostic-only correlation file that separates invocation coverage from statement-log coverage, preserves bounded statement metadata, and classifies missing CPU/wall logs as insufficient evidence.

`scripts/verify-capacity-evidence.mjs` now rejects any joined Worker-log diagnostic that tries to contribute to certification. Joined CPU data can explain a failure, but it cannot override stale evidence, missing capacity-table proof, manifest-only evidence, non-production run shape, or failed thresholds.

### Bootstrap Phase Timings

The Worker now records allowlisted bootstrap phase timings on structured capacity logs only. Phase timing data does not appear in child-facing `meta.capacity`, and the collector caps/rejects invalid phase names and invalid durations.

### Statement Map and Budget Ledger

`scripts/build-capacity-statement-map.mjs` ranks sampled `capacity.request` statements and only accepts query-plan notes when statement coverage is complete. Incomplete or truncated statement evidence refuses query-shape recommendations.

`scripts/build-capacity-budget-ledger.mjs` produces `reports/capacity/latest-1000-learner-budget.json` and `docs/operations/capacity-1000-learner-free-tier-budget.md`. The ledger is marked `modellingOnly: true` and `certifying: false`.

### One-Statement Bootstrap Reduction

`worker/src/repository.js` now reuses the preloaded subject-state rows to discover active session IDs. The implementation preserves per-learner ordering, deduplicates active session IDs, tolerates malformed `ui_json`, and keeps the active-session row lookup bounded to the selected/query learner set.

The query-budget tests were ratcheted after measurement:

- POST bootstrap multi-learner bounded: measured 11, budget 12.
- GET bootstrap full bundle: measured 11, budget 12.

## Verification Ledger

| Command | Result |
| --- | --- |
| `node --test tests/worker-bootstrap-multi-learner-regression.test.js tests/worker-bootstrap-capacity.test.js tests/worker-query-budget.test.js tests/worker-bootstrap-v2.test.js` | Passed: 65/65. |
| `node --test tests/capacity-evidence.test.js tests/verify-capacity-evidence.test.js tests/capacity-scripts.test.js tests/capacity-worker-log-join.test.js tests/capacity-statement-map.test.js tests/capacity-budget-ledger.test.js tests/worker-capacity-telemetry.test.js tests/worker-bootstrap-capacity.test.js tests/worker-query-budget.test.js tests/worker-bootstrap-multi-learner-regression.test.js tests/worker-bootstrap-v2.test.js` | Passed: 291/291. |
| `npm test` | Passed: 11,965 pass, 0 fail, 6 skipped. |
| `npm run check` | Passed: Wrangler dry-run build, public assert, and client bundle audit. |
| `npm run capacity:verify-evidence` | Passed: 3 capacity evidence rows checked. |
| `git diff --check` | Passed. |

## Independent Worker Cycle

| Role | Scope | Result |
| --- | --- | --- |
| Worker A | Evidence schema, verifier, Worker-log join, capacity docs. | Implemented diagnostic-only join and verifier coverage. |
| Worker B | Statement map and 1000-learner budget ledger. | Implemented tooling, fixtures, generated ledger, and modelling documentation. |
| Worker C | Bootstrap phase timings. | Added structured-log-only phase timing diagnostics and coverage. |
| Worker D | One-statement bootstrap reduction. | Removed the duplicate subject-state read and ratcheted query-budget tests. |

Independent review and reviewer-follower closure are required before PR merge; no blocker may remain open and CI/build must be green.

## Next Phase

Phase 2 should start from evidence, not optimism:

1. Deploy the P1 branch through the normal PR path after reviewers and CI pass.
2. Run a post-deploy strict 30 evidence file with unique output path.
3. Export a bounded Cloudflare Worker log slice for the same window.
4. Join top-tail request IDs and classify whether the remaining bootstrap tail is Worker CPU, D1 duration, D1 queue/platform, payload/serialization, or still insufficient.
5. Only then choose between bootstrap query consolidation, payload reduction, Worker CPU work, burst shaping, or no further code change.
