---
title: "System Hardening Optimisation P1 Completion Report"
type: completion-report
status: merged
date: 2026-04-29
route: system-hardening-and-optimisation
owner: james / engineering agent
source_plan: docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p1.md
implementation_plan: docs/plans/2026-04-29-010-feat-sys-hardening-optimisation-p1-evidence-attribution-plan.md
implementation_pr: https://github.com/fol2/ks2-mastery/pull/618
merge_commit: 666e278b409bbe63e08ced8826fd932c0db68d3c
merged_at: 2026-04-29T16:11:30Z
---

# System Hardening Optimisation P1 Completion Report

## Executive Summary

System Hardening Optimisation P1 has completed as a merged implementation and operations-handoff slice. It delivered the evidence-attribution tooling needed to stop guessing about `/api/bootstrap` tail latency, and it shipped one narrow, tested bootstrap query reduction. It did not certify any new capacity tier.

The most important outcome is not a faster number. The important outcome is a stronger truth boundary: the repository can now distinguish strict capacity evidence, diagnostic Worker CPU/wall joins, statement-level D1 attribution, bootstrap phase timings, and 1000-learner modelling. Those artefacts can explain what to investigate next, but they cannot promote public capacity status.

The current capacity truth remains:

- 30-learner classroom beta: not certified.
- 60-learner stretch: not certified.
- 100+ / 300 / 1000 learner targets: not certified.
- Public wording: remains `small-pilot-provisional`.
- Phase 1 evidence acceptance: still open until post-change strict/repeated production evidence and joined Worker CPU/wall top-tail artefacts exist.

P1 did, however, materially improve the system's ability to make the next decision. Before this slice, the bootstrap P95 failure could be described only from app wall time and D1 counters. After this slice, the next strict run can be joined to bounded Cloudflare Worker logs, classified conservatively, and compared with statement timings and a 1000-learner free-tier budget ledger.

## Completion Boundary

This report uses "completion" in the PR-delivery sense: the implementation branch was reviewed, verified, merged, and the remote branch was cleaned up.

It does not mean the Phase 1 evidence acceptance criteria are fully satisfied. The source plan deliberately defines Phase 1 evidence acceptance as requiring strict and repeated post-change production evidence plus Worker CPU/wall attribution. Those production artefacts were not generated inside the implementation PR because doing so would have mixed code delivery with live-capacity certification. That separation is intentional.

| Area | Final status | Notes |
| --- | --- | --- |
| Tooling and code delivery | Complete and merged | PR #618 merged to `main` at `666e278b409bbe63e08ced8826fd932c0db68d3c`. |
| Evidence attribution capability | Complete enough for next production run | Worker-log join, verifier boundaries, statement map, phase timings, and docs are in place. |
| One-statement bootstrap reduction | Complete and merged | Local public bootstrap query count dropped from 12 to 11 in ratcheted tests. |
| Phase 1 evidence acceptance | Not complete | Needs post-change strict 30 run, repeated strict run, joined Worker CPU/wall top-tail evidence, and complete statement-map artefact. |
| Capacity certification | Not promoted | Latest committed strict 30 evidence still fails bootstrap P95. |
| 1000-learner readiness | Not certified | Ledger is modelling-only and marks D1 reads red at 1000 learners. Worker CPU remains unknown until log joins exist. |

## Baseline Before P1

P1 started from the post-P6 hardening state:

- `/api/bootstrap` was already bounded and instrumented, but strict 30-learner evidence failed bootstrap P95.
- The latest strict 30 evidence recorded bootstrap P95 at 1,167.4 ms against a 1,000 ms ceiling.
- The latest 60-learner stretch preflight recorded bootstrap P95 at 854.0 ms against a 750 ms stretch ceiling.
- Command latency, payload size, 5xx count, network failures, hard capacity signals, query count, and D1 rows were otherwise healthy in the recorded evidence.
- App-level capacity telemetry had request IDs, wall time, D1 counts, D1 duration where available, response bytes, and top-tail samples.
- The missing layer was actual Cloudflare Worker CPU and Worker wall time per top-tail request.

That missing layer mattered because Worker wall time, app wall time, D1 duration, and Worker CPU time are different resources. A slow client-observed bootstrap could mean D1 duration, D1 queueing, cold platform variance, JSON construction, payload size, Worker CPU pressure, or network/platform overhead. P1's job was to prevent a broad optimisation pass from being chosen before that distinction was observable.

## What Shipped

### 1. Diagnostic-Only Worker CPU/D1 Evidence Lane

P1 added `scripts/join-capacity-worker-logs.mjs`, which joins bounded Cloudflare Workers Trace, Workers Logs, Tail Worker, Logpush-style JSON/JSONL exports, and sampled `[ks2-worker] capacity.request` structured logs back to capacity evidence by request id.

The join is intentionally diagnostic-only. It records:

- invocation coverage separately from statement-log coverage;
- Cloudflare CPU and Worker wall time where present;
- app wall time and response bytes from the load evidence;
- D1 duration, query count, rows read, and rows written where present;
- bounded statement metadata;
- join status and conservative classification per top-tail sample.

The join does not record request bodies, cookies, learner names, raw SQL parameters, child answers, or free-form log messages.

The classification vocabulary is conservative by design:

- `unclassified-insufficient-logs`;
- `partial-invocation-only`;
- `d1-dominated`;
- `worker-cpu-dominated`;
- `payload-size-pressure`;
- `client-network-or-platform-overhead`;
- `mixed-no-single-dominant-resource`.

The important insight is that a complete invocation join and a complete statement join are different things. Cloudflare CPU/wall can be present while sampled statement logs are absent. That state can support partial attribution, but it cannot support a capacity claim.

### 2. Verifier Fail-Closed Boundary

`scripts/verify-capacity-evidence.mjs` now enforces the non-certifying boundary for `diagnostics.workerLogJoin`.

It rejects diagnostic blocks that try to set any certification contribution flag, including:

- `contributesToCertification`;
- `certifying`;
- `promotesCertification`.

It also rejects samples that are missing invocation CPU/wall data unless they are classified as `unclassified-insufficient-logs`.

An independent review found a subtle but important bug during implementation: `Number(null)` evaluates to `0`, so a matched invocation with `cpuTimeMs: null` and `wallTimeMs: null` could have been treated as finite. P1 closed that gap with a strict diagnostic-number helper and a regression test for the matched-null case. This is the right kind of hardening: it blocks a future false pass rather than trusting operator convention.

### 3. Bootstrap Phase Timings in Structured Logs

The Worker now records bounded bootstrap phase timings through the capacity collector. Phase names are allowlisted, durations are capped, and invalid entries are dropped.

The phase timing surface is deliberately structured-log-only:

- it is included in `[ks2-worker] capacity.request` structured logs;
- it is excluded from public child-facing `meta.capacity`;
- it has a hard cap on the number of timing entries;
- it does not introduce public payload shape risk.

This gives operators a way to distinguish account/session work, membership, subject state, game state, sessions, event rows, read-model generation, not-modified probes, and response construction without exposing those details to child-facing bootstrap responses.

### 4. One-Statement Public Bootstrap Reduction

P1 shipped one narrow code optimisation: public selected-learner-bounded bootstrap now derives active session IDs from the `child_subject_state` rows already loaded for selected/query learners, instead of issuing a second `child_subject_state` read for active-session discovery.

The change preserved the bootstrap correctness boundaries:

- selected learner state remains available;
- sibling learner state is not stripped to make numbers look better;
- active-session lookups remain bounded to the selected/query learner set;
- active session IDs are deduplicated;
- malformed `ui_json` does not block valid active session discovery;
- stale active sessions embedded in already-loaded subject state are still discoverable;
- not-modified revision behaviour remains covered.

Local query-budget tests measured the public bootstrap path at 11 D1 queries after the change. The budget remains 12, but tests now also assert the measured P1 count of 11 so a silent regression back to 12 cannot pass merely because of the `measured + 1` headroom rule.

### 5. Statement Map Tooling

P1 added `scripts/build-capacity-statement-map.mjs`.

The statement map ranks sampled `capacity.request` statement data and accepts query-plan notes only when statement coverage is complete. If statement evidence is truncated or incomplete, it refuses query-shape recommendations instead of presenting a partial log as an optimisation map.

This is important because statement-level data can easily become overconfident. A top statement list with missing sampled logs can point an engineer at the wrong query. P1's statement map treats incomplete evidence as useful for diagnosis but insufficient for prescriptive query/index work.

### 6. 1000-Learner Free-Tier Budget Ledger

P1 added `scripts/build-capacity-budget-ledger.mjs`, `reports/capacity/latest-1000-learner-budget.json`, and `docs/operations/capacity-1000-learner-free-tier-budget.md`.

The ledger is modelling-only and explicitly non-certifying. It uses measured route costs from committed capacity evidence and models Cloudflare Free-plan pressure across 30, 60, 100, 300, and 1000 learner scenarios.

The strongest signal from the ledger is that D1 rows read become the first obvious free-tier constraint:

- 1000 optimistic: D1 rows read reaches 86.8 percent of the free daily limit and is already red.
- 1000 expected: D1 rows read reaches 227.64 percent of the free daily limit and is red.
- 1000 pessimistic: D1 rows read reaches 542 percent of the free daily limit and is red.
- Worker requests remain green until the pessimistic 1000 scenario.
- Worker CPU remains unknown because the input evidence has no joined Cloudflare CPU telemetry.

This does not prove that 1000 learners cannot work. It proves that a responsible 1000-learner path cannot ignore D1 read economics, and it cannot claim CPU safety until Worker logs are joined.

### 7. Operator Documentation

P1 updated the capacity operations docs so future evidence collection has a stable path:

- `docs/operations/capacity.md` now points to P1 attribution artefacts and keeps the certification boundary explicit.
- `docs/operations/capacity-cpu-d1-evidence.md` explains the Worker log join flow, accepted log shapes, output contract, and verification rules.
- `docs/operations/capacity-tail-latency.md` now includes a P1 evidence attribution matrix with strict, reduced-burst, manifest, and repeated-strict run shapes.
- `docs/operations/capacity-1000-learner-free-tier-budget.md` records the non-certifying modelling worksheet.

The docs intentionally repeat the same warning in several places: diagnostic files do not certify capacity.

## Scope Mapping

| P1 objective | Delivered artefact | Status | Notes |
| --- | --- | --- | --- |
| Join real Cloudflare CPU evidence to app evidence | `scripts/join-capacity-worker-logs.mjs`, `buildWorkerLogJoinDiagnostics`, verifier checks | Delivered | Supports bounded JSON/JSONL log exports and sampled structured logs. |
| Attribute `/api/bootstrap` top-tail requests | top-tail sample retention, Worker-log join output, bootstrap phase timings | Delivered for tooling | Actual post-change production top-tail join remains pending. |
| Build 1000-learner unit-economics ledger | `scripts/build-capacity-budget-ledger.mjs`, latest budget JSON, operations doc | Delivered | Modelling-only and non-certifying. |
| Preserve fail-closed capacity evidence | verifier diagnostic-only checks and matched-null CPU/wall regression coverage | Delivered | Independent blocker closed before merge. |
| Ship one narrow optimisation only if safe | active-session discovery reused preloaded `child_subject_state` rows | Delivered | Query count measured at 11 with regression coverage. |
| Avoid learner-visible scope change | no product UI/copy/reward changes | Delivered | P1 stayed on telemetry, docs, tests, and server bootstrap internals. |
| Keep public capacity wording honest | docs explicitly keep `small-pilot-provisional` | Delivered | No certification promotion was made. |

## Acceptance Status

### Evidence Acceptance

| Criterion | Status | Notes |
| --- | --- | --- |
| Current main commit recorded | Partially complete | Implementation PR recorded base commits and merge commit; future evidence files must record the exact production commit used for live runs. |
| Current capacity status remains honest | Complete | Public status remains `small-pilot-provisional`; 30/60/100+ not certified. |
| Strict 30 baseline run exists | Existing pre-change evidence only | Existing strict evidence remains committed, but post-change strict evidence is pending. |
| Repeated strict 30 run exists | Pending | Required before closing Phase 1 evidence acceptance. |
| Top-tail bootstrap request IDs captured | Tooling complete | Existing P6/P1 paths retain top-tail IDs; post-change strict top-tail IDs still need collection. |
| Cloudflare CPU/wall joined for top-tail samples or missing-log classification recorded | Tooling complete, live artefact pending | Missing logs classify as `unclassified-insufficient-logs`; actual post-change join still pending. |
| D1 query count, rows read, rows written, D1 duration, response bytes, app wall time present | Partially complete | Existing evidence has most app-level fields; D1 duration and Worker CPU are incomplete for the strict 30 file. |
| Top-tail classification exists | Tooling complete, live artefact pending | Needs joined post-change evidence. |
| 1000-learner budget worksheet exists | Complete | Produced as modelling-only JSON and markdown. |
| Evidence verifier passes | Complete for committed evidence | `npm run capacity:verify-evidence` passed. |
| Admin evidence cannot show certification from diagnostic/stale files | Preserved | P1 artefacts live outside the certification lane and are labelled non-certifying. |

### Code Acceptance

| Criterion | Status | Notes |
| --- | --- | --- |
| No learner-visible product scope change | Complete | No child UI, reward, or subject-learning semantics change. |
| No public payload privacy regression | Complete | Phase timings are structured-log-only; public `meta.capacity` does not expose statement or phase detail. |
| No sibling learner regression | Complete | Bootstrap still preserves sibling learner state and revision semantics. |
| No selected learner regression | Complete | Active-session lookup remains bounded and selected/query learner scoped. |
| No not-modified revision regression | Complete | Tests cover the not-modified path. |
| Query budget tests updated only with rationale | Complete | Measured count and budget are documented in test constants. |
| Strict evidence rerun after code change | Pending | This is the main remaining evidence-acceptance gap. |
| Completion report separates Phase 1 completion from capacity promotion | Complete | This report and the implementation handoff both keep the distinction explicit. |

### Certification Acceptance

No certification target passed in P1. That is the correct result given the evidence.

| Target | Status | Reason |
| --- | --- | --- |
| 30-learner classroom beta | Not certified | Latest committed strict evidence fails bootstrap P95 at 1,167.4 ms vs 1,000 ms. |
| 60-learner stretch | Not certified | Latest committed stretch preflight fails bootstrap P95 at 854.0 ms vs 750 ms and remains diagnostic. |
| 100+ school-ready | Not certified | Requires repeated higher-scale runs and operational tail evidence. |
| 1000+ free-tier lighthouse | Not certified | D1 read modelling is red and Worker CPU is unknown. |

## Verification and Release Ledger

### Local Verification

| Command | Result |
| --- | --- |
| `node scripts/worktree-setup.mjs` | Passed; `node_modules` already present after final rebase cycle. |
| Focused P1 suite after reviewer fixes | Passed: 292/292. |
| Focused post-rebase suite | Passed: 267/267. |
| `npm test` | Passed: 11,982 pass, 0 fail, 6 skipped. |
| `npm run check` | Passed; Wrangler dry-run build, public assert, and client bundle audit completed. |
| `npm run capacity:verify-evidence` | Passed: 3 capacity evidence rows checked. |
| `git diff --check` / `git diff --check origin/main...HEAD` | Passed. |

Known local noise:

- npm warns that `playwright_skip_browser_download` / `playwright-skip-browser-download` are unknown npm configs. This is existing project behaviour documented in repo instructions.
- React key-spread warnings appeared in existing SSR tests.
- One expected spelling preference save failure log appeared in the remote-sync hydration tests.

None of those warnings failed the gate.

### PR and CI Verification

Implementation PR:

- PR: https://github.com/fol2/ks2-mastery/pull/618
- Branch: `codex/sys-hardening-p1-evidence-attribution`
- Merge commit: `666e278b409bbe63e08ced8826fd932c0db68d3c`
- Merged at: 2026-04-29T16:11:30Z
- Remote branch: deleted after merge.

Visible GitHub checks at merge time:

| Check | Result |
| --- | --- |
| `npm test + npm run check` | Success, 3m 6s. |
| `npm run audit:client` | Success. |
| `npm run audit:punctuation-content` | Success. |
| GitGuardian Security Checks | Success. |
| Chromium + mobile-390 golden paths | Skipped by CI. |

Merge guard status:

- Branch was rebased onto the then-current `origin/main`.
- `origin/main...HEAD` was `0 behind / 2 ahead` before merge.
- PR was `MERGEABLE` and `CLEAN`.
- No unrelated `origin/main` files were deleted by the PR diff.

## Independent Review Closure

P1 was not merged after a single happy-path implementation pass. Reviewers found real issues, and those issues changed the final state.

| Finding | Severity | Resolution |
| --- | --- | --- |
| Matched Worker invocation with `cpuTimeMs: null` / `wallTimeMs: null` could false-pass because `Number(null) === 0`. | Blocker | Added strict diagnostic-number validation and a matched-null regression test. |
| Query-budget proof could allow a regression from measured 11 back to 12 because the budget was `<= 12`. | Low but useful | Kept budget headroom at 12 but added assertions that the measured P1 count remains 11. |
| Branch became stale behind `origin/main`, risking PR drift. | Release blocker | Rebased twice as `main` moved, updated the base commit in handoff docs, and waited for fresh CI. |
| Handoff wording overclaimed P1 completion while strict evidence was still pending. | Release blocker | Rewrote completion language as implementation handoff and explicitly marked Phase 1 evidence acceptance as open. |
| Implementation artefacts were initially untracked. | Release blocker | Tracked scripts, docs, tests, fixtures, and generated budget JSON before PR. |

The useful pattern here is that the blockers were about evidence integrity, not style. P1 would have been weaker if the review had only checked whether the tests passed. The matched-null CPU/wall issue in particular was exactly the kind of false-positive certification path this phase was meant to eliminate.

## Key Insights

### 1. The bottleneck is not yet a bottleneck until the logs prove it

The latest failed strict evidence suggests bootstrap tail latency, but P1 deliberately avoids saying "D1 is the bottleneck" or "Worker CPU is fine". The correct current classification is `unclassified-insufficient-logs` for CPU attribution.

That is not a failure of P1. It is the honest state before the next production run. The system now has the tooling to move from that honest unknown to a classified tail sample.

### 2. D1 rows read are the first 1000-learner warning light

The modelling ledger points at D1 rows read as the most obvious free-tier pressure at 1000 learners. In the expected 1000-learner model, D1 rows read/day is already more than double the free daily limit.

This does not mean the immediate next PR should blindly add indexes or denormalise everything. It means Phase 2 should prefer statement-map-backed read reduction over generic latency work once top-tail evidence confirms the route and statement shape.

### 3. Query count is a release contract, not just observability

The one-statement reduction shows why query-budget tests matter. Without a hard assertion, the duplicate `child_subject_state` read could return later as "just one more query". P1 now records both the budget and the measured count so future work has to be explicit about changing either.

### 4. Public payload privacy and operator observability can coexist

Bootstrap phase timings give operators more visibility without exposing phase detail in child-facing JSON. This is the right pattern for future hardening: put diagnostic richness in structured logs, keep public payloads small and closed.

### 5. Capacity claims need multiple fences

The capacity claim boundary is now protected by several independent fences:

- evidence table rows;
- persisted JSON artefacts;
- threshold configs and config hashes;
- verifier recomputation;
- diagnostic-only Worker log join flags;
- non-certifying ledger labels;
- Admin evidence summary source restrictions.

No single label or filename should be enough to certify capacity. P1 strengthens that principle.

## Residual Risks

### Worker CPU remains unknown

The implementation can join Worker CPU/wall logs, but no post-change strict production Worker log export has been joined yet. Until that exists, CPU-specific optimisation remains premature.

### D1 queue/platform tail remains plausible but unproven

The existing evidence pattern is compatible with D1/platform tail variance, but P1 does not prove it. The next production run must join top-tail request IDs to Worker invocation wall time and statement timings before any D1 queue or platform-tail claim is made.

### The 1000-learner ledger is modelling, not measurement

The ledger is useful because it converts route costs into quota pressure. It is not a load test. Missing route coverage stays `unknown` or lower-bound, not green.

### Statement names depend on safe SQL conventions

Statement-map output uses bounded statement names derived from SQL first lines. Current reviewed paths do not persist bodies, cookies, learner names, prompt text, or answer text. Future raw SQL literals could still leak sensitive text if developers violate the existing parameterisation convention. This is a residual discipline risk worth keeping in reviews.

### Strict post-change evidence may still fail

The one-statement reduction is useful, but it is not guaranteed to move production bootstrap P95 below 1,000 ms. It removes one D1 read from the local public bootstrap path; the failing production P95 may still be platform tail, cold D1 duration, burst sensitivity, response construction, or another route shape.

## Recommended Phase 2 Path

Phase 2 should begin with evidence collection, not another code change.

### Step 1 - Run post-change strict 30 evidence

Use a unique output path:

```sh
npm run capacity:classroom -- \
  --production \
  --origin https://ks2.eugnel.uk \
  --confirm-production-load \
  --confirm-high-production-load \
  --demo-sessions \
  --learners 30 \
  --bootstrap-burst 20 \
  --rounds 1 \
  --config reports/capacity/configs/30-learner-beta.json \
  --include-request-samples \
  --output reports/capacity/evidence/2026-04-29-p1-t1-strict-post-merge.json
```

This run answers: did the one-statement reduction and current main state change the strict 30 bootstrap P95?

### Step 2 - Repeat strict 30

Run at least one repeated strict file:

```sh
npm run capacity:classroom -- \
  --production \
  --origin https://ks2.eugnel.uk \
  --confirm-production-load \
  --confirm-high-production-load \
  --demo-sessions \
  --learners 30 \
  --bootstrap-burst 20 \
  --rounds 1 \
  --config reports/capacity/configs/30-learner-beta.json \
  --include-request-samples \
  --output reports/capacity/evidence/2026-04-29-p1-t5-strict-repeat-1.json
```

This run answers: was the first run a one-off tail, a warm-up effect, or a reproducible route cost?

### Step 3 - Export bounded Cloudflare Worker logs

Export only the relevant time window. The export must include top-tail request IDs from the evidence files. Keep it bounded and avoid persisting request bodies or secrets.

Recommended path:

```text
reports/capacity/evidence/2026-04-29-p1-worker-logs.jsonl
```

### Step 4 - Join top-tail samples

```sh
node ./scripts/join-capacity-worker-logs.mjs \
  --evidence reports/capacity/evidence/2026-04-29-p1-t1-strict-post-merge.json \
  --logs reports/capacity/evidence/2026-04-29-p1-worker-logs.jsonl \
  --output reports/capacity/evidence/2026-04-29-p1-t1-tail-correlation.json
```

Read invocation coverage separately from statement-log coverage. If CPU/wall is missing, keep the classification at `unclassified-insufficient-logs`.

### Step 5 - Build the statement map

If sampled statement coverage is complete for the investigation window, build the statement map and allow it to guide query-shape decisions. If coverage is incomplete, preserve the diagnostic output but do not make query-plan recommendations from it.

### Step 6 - Refresh the 1000-learner budget ledger

After new evidence exists:

```sh
node ./scripts/build-capacity-budget-ledger.mjs \
  --input reports/capacity/evidence/2026-04-29-p1-t1-strict-post-merge.json
```

Do not treat the refreshed ledger as certification. Use it to choose whether Phase 2 should focus on D1 read reduction, burst shaping, Worker CPU, payload size, or no code change.

## Phase 2 Decision Matrix

| Evidence pattern | Recommended next move | What not to do |
| --- | --- | --- |
| Worker CPU near or over budget on top-tail samples | CPU-specific bootstrap work, JSON construction review, response construction timing review | Do not blame D1 solely from wall time. |
| D1 duration dominates Worker wall time | Statement-map-backed D1 read/query reduction | Do not add indexes without query-plan/write-cost evidence. |
| Worker wall time is low but client wall time is high | Investigate network/platform overhead and load-driver timing | Do not rewrite bootstrap internals first. |
| Query count or D1 rows rise with learner/burst shape | Consolidate reads or reduce row fan-out, preserving sibling state | Do not drop sibling learners from bootstrap. |
| Payload size rises towards cap | Reduce envelope growth or history bounds | Do not raise response-byte caps without policy review. |
| Strict T1 fails but warm/repeated runs pass | Treat as launch-tail risk and evaluate pre-warm/burst policy separately | Do not reclassify warm runs as strict success without a policy record. |
| Strict T1 and T5 pass with clean verifier | Consider 30-learner certification update through the existing capacity table | Do not jump from 30 to 1000 learner claims. |

## Operational Guardrails

Keep these guardrails active in the next phase:

- Use package scripts for Cloudflare operations; do not reintroduce raw `wrangler` commands in docs or scripts.
- Use unique evidence output paths; never overwrite a failing run during diagnosis.
- Keep diagnostic Worker-log joins outside the certification lane.
- Keep phase timings and statement detail out of public `meta.capacity`.
- Keep `small-pilot-provisional` wording until strict verifier-backed evidence passes.
- Treat missing CPU/wall logs as insufficient evidence, not as zero CPU.
- Preserve sibling learner state and revision invalidation in bootstrap.
- Keep threshold changes separate from optimisation PRs.

## Final Decision

P1 should be considered successfully delivered as a hardening and attribution implementation slice.

It should not be considered a capacity-certification milestone.

The correct next move is a production evidence round using the new tools. If that evidence classifies the tail, Phase 2 can become a targeted optimisation. If it does not, the right answer is more instrumentation or better log capture, not threshold relaxation and not a speculative rewrite.
