---
title: "System Hardening Optimisation P1 — CPU/D1 Evidence Baseline and Bootstrap Tail Attribution"
type: plan
status: implementation-handoff
date: 2026-04-29
route: system-hardening-and-optimisation
owner: james / engineering agent
source_docs:
  - docs/plans/james/sys-hardening/sys-hardening-A-architecture-product.md
  - docs/plans/james/sys-hardening/sys-hardening-B-engineering-system-code.md
  - docs/plans/james/sys-hardening/sys-hardening-p6-completion-report.md
platform_sources:
  - https://developers.cloudflare.com/workers/platform/limits/
  - https://developers.cloudflare.com/workers/platform/pricing/
  - https://developers.cloudflare.com/d1/platform/limits/
  - https://developers.cloudflare.com/d1/platform/pricing/
---

# System Hardening Optimisation P1 — CPU/D1 Evidence Baseline and Bootstrap Tail Attribution

## 0. One-sentence summary

Phase 1 is the evidence and attribution phase for the 1000+ learner free-tier lighthouse goal: before adding advanced algorithms, batching, partitioning, or scheduler changes, the system must prove where CPU, D1, query count, rows read, rows written, payload size, and bootstrap tail latency are actually being spent.

This phase should be diagnostic-first, not rewrite-first.

---

## 1. Why this phase exists

The post-P6 system is safer than the earlier app, but it is not yet capacity-certified beyond `small-pilot-provisional`.

Current product truth from the sys-hardening handover:

- 30-learner classroom beta is not certified.
- 60-learner stretch is not certified.
- Latest strict 30-learner evidence failed only `/api/bootstrap` P95: 1,167.4 ms observed against a 1,000 ms ceiling.
- Latest 60-learner manifest preflight reached application load, but failed bootstrap P95: 854 ms observed against a 750 ms stretch ceiling.
- Command latency, payload size, 5xx count, network failures, hard capacity signals, query count, and D1 rows are currently healthy in the recorded evidence.
- The current app-level capacity collector measures D1 query count, rows, D1 duration, response bytes, wall time, and request IDs, but it does not yet join actual Cloudflare Worker CPU time into the capacity evidence.

The project goal is more ambitious than 30 or 60 learners: survive 1000+ learners on Cloudflare free tier. That changes the optimisation problem. The limiting resources are no longer just local code speed or average latency. The limiting resources are:

- Cloudflare Worker CPU time per invocation.
- Cloudflare Worker daily dynamic request count.
- Worker subrequest count.
- D1 rows read per day.
- D1 rows written per day.
- D1 per-database queueing and query duration.
- JSON construction and serialization CPU.
- Bootstrap burst tail latency.
- Write amplification per learner action.

Cloudflare currently documents the Workers Free plan as having 100,000 Worker requests per day, 10 ms CPU time per HTTP request, and 50 subrequests per invocation. Cloudflare also documents that Worker CPU time excludes time spent waiting on network, KV, or database queries, and that Workers Logs / Tail Workers / Logpush expose CPU time and wall time. D1 Free limits include 50 queries per Worker invocation, 500 MB maximum database size, and 5 GB storage per account. D1 pricing currently gives Free accounts 5 million rows read per day and 100,000 rows written per day. D1 also processes each individual database one query at a time, so burst throughput depends heavily on query duration.

That means the 1000+ learner target cannot be reasoned about from wall time alone. Phase 1 must turn the system from “we think bootstrap tail is probably D1/platform variance” into “we know whether the top tail is Worker CPU, D1 duration, D1 queueing, duplicate statements, JSON serialization, payload size, or external platform variance.”

---

## 2. Phase 1 product stance

Phase 1 must not overclaim.

At the end of this phase, the system may still be `small-pilot-provisional`. That is acceptable if the evidence is stronger. Phase 1 succeeds if it gives the team a trustworthy optimisation map and prevents blind refactors.

The product wording during and after this phase should remain:

> Small-pilot-provisional. The platform has bounded bootstrap, Worker-owned subject commands, capacity telemetry, multi-learner regression locks, and fail-closed evidence tooling. It is not certified for 30 simultaneous active learners until strict evidence passes the bootstrap P95 gate.

Do not change public wording to 30-learner certified, 60-learner certified, or 1000-learner ready during Phase 1 unless the existing certification gates are passed with valid evidence.

---

## 3. Phase 1 non-goals

Do not use Phase 1 to introduce broad new features.

Out of scope:

- No threshold relaxation.
- No paid-tier migration argument as the “solution”.
- No Hero economy or learner-visible reward changes.
- No broad repository rewrite.
- No subject learning semantics rewrite.
- No CSP enforcement flip.
- No HSTS preload flip.
- No 1000-learner public claim.
- No “D1 is the bottleneck” claim without top-tail correlation.
- No “CPU is fine” claim without Cloudflare CPU evidence.
- No new browser-owned production writes.
- No removal of sibling learner state from bootstrap to make numbers look better.
- No fake CPU proxy based only on wall time.

Phase 1 may ship one narrow code optimisation if and only if the evidence supports it and the change preserves all bootstrap/multi-learner invariants.

---

## 4. Current baseline to preserve

The current hardening work has already established useful boundaries. Phase 1 must preserve them.

### 4.1 Runtime authority

React may render, request, and recover. The Worker owns production authority.

That applies to:

- account/session resolution;
- learner access;
- selected learner resolution;
- subject command validation;
- idempotency and expected revision;
- progress mutation;
- game/reward projection;
- read-model generation;
- capacity telemetry;
- redaction;
- admin/debug operations.

### 4.2 Bootstrap contract

`/api/bootstrap` must still provide the minimum safe, correct account envelope for first paint.

The selected-learner-bounded shape must still preserve:

- account metadata;
- session metadata;
- learner list;
- `selectedLearnerId`;
- all writable learner identities;
- selected learner first-paint state;
- compact sibling learner state;
- sibling learner state in the revision/hash contract;
- no private answer-bearing fields;
- capacity metadata.

Phase 1 must not “optimise” by losing sibling learners, hiding writable learners, removing revision invalidation, or making learner switching show false zero-state.

### 4.3 Command route contract

`POST /api/subjects/:subjectId/command` remains the production write boundary.

The command route must keep:

- subject validation;
- learner access validation;
- same-origin/session capability checks;
- request idempotency;
- expected learner revision / stale-write protection;
- subject-owned scoring and progress mutation;
- bounded projection/read-model output;
- no full `event_log` replay on hot command paths once projections are primed.

### 4.4 Evidence contract

Capacity evidence is a positive-proof problem.

Evidence must remain fail-closed. Diagnostic files, preflights, manifest runs, reduced-shape runs, stale summaries, filename-only tier names, or shared-auth runs must not certify a classroom tier by accident.

---

## 5. Phase 1 objectives

Phase 1 has five concrete objectives.

### Objective A — Join real Cloudflare CPU evidence to app capacity evidence

The app already emits request IDs and app-level capacity metadata. Phase 1 must join that with Cloudflare Worker invocation CPU/wall data from Workers Logs, Tail Workers, or Logpush-style trace events.

Required distinction:

- `wallMs`: elapsed request time seen by app/load driver.
- `d1DurationMs`: D1 statement duration reported through D1 metadata or wrapper timing.
- `cloudflareCpuMs`: actual CPU time reported by Cloudflare invocation logs.
- `jsonSerializeMs`: optional app-internal phase timing for response serialization.
- `bootstrapPhaseMs`: optional app-internal phase timings for bootstrap sub-steps.

Do not infer `cloudflareCpuMs` from `wallMs`. They are different resources.

### Objective B — Attribute `/api/bootstrap` top-tail requests

The strict evidence failure is bootstrap P95. Phase 1 must correlate the top-tail bootstrap request IDs with:

- Cloudflare CPU ms;
- Cloudflare wall ms;
- app wall ms;
- D1 query count;
- D1 rows read;
- D1 rows written;
- D1 duration ms;
- statement breakdown;
- response bytes;
- bootstrap mode;
- not-modified status;
- selected learner count/account shape;
- top slow phase, if phase timings are enabled.

The goal is to classify the tail, not to guess.

Possible classifications:

- `worker-cpu-bound`;
- `d1-duration-bound`;
- `d1-queue-or-platform-tail`;
- `json-serialization-bound`;
- `payload-size-bound`;
- `query-fanout-bound`;
- `auth-or-session-bound`;
- `unclassified-insufficient-logs`.

### Objective C — Build the 1000-learner unit-economics ledger

For every hot route, Phase 1 must estimate unit cost in free-tier terms.

At minimum:

- dynamic Worker requests per learner per day;
- Cloudflare CPU ms per request P50/P95/P99 where available;
- D1 statements per request P50/P95/max;
- D1 rows read per request P50/P95/max;
- D1 rows written per request P50/P95/max;
- response bytes P50/P95/max;
- likely daily total at 30, 60, 100, 300, and 1000 learners;
- remaining headroom against free-tier daily request/read/write budgets;
- burst risk against one D1 database queue.

This is a worksheet and risk model, not a public launch claim.

### Objective D — Evaluate the one-statement bootstrap reduction

P6 identified a plausible low-risk optimisation: `bootstrapBundle()` already reads `child_subject_state`, while `listPublicBootstrapActiveSessionIds()` re-reads `child_subject_state.ui_json` to parse active session IDs.

Phase 1 should evaluate whether active session IDs can be derived from the subject-state rows already loaded by bootstrap, or whether the active-session lookup can be merged without weakening the selected-learner-bounded bootstrap contract.

This is the only code optimisation Phase 1 should consider by default.

Ship it only if:

- bootstrap response shape is unchanged except allowed capacity/debug metadata;
- sibling learner invariants remain true;
- not-modified revision behaviour remains true;
- active session rows remain correctly included;
- query count drops in the expected path;
- query budget tests are ratcheted or explicitly justified;
- strict evidence is rerun after the change.

### Objective E — Produce the next-phase decision record

At the end of Phase 1, the team must know which Phase 2 path is justified:

- bootstrap route consolidation;
- D1 index/query-shape work;
- JSON/payload reduction;
- command write-amplification reduction;
- request batching/compaction;
- read-through cache/revision protocol;
- D1 partitioning / actor analysis;
- or no code change, if the evidence points to platform variance and current thresholds require repeated sampling rather than refactor.

---

## 6. Workstreams

### P1-U0 — Baseline and drift lock

Start by recording the actual current `main` commit and checking that the post-P6 state has not drifted.

Required actions:

1. Record current commit SHA, branch, date, and environment.
2. Run the existing drift and hardening suites relevant to capacity.
3. Confirm `latest-evidence-summary.json` remains fail-closed.
4. Confirm Admin Production Evidence does not show certification from stale or diagnostic evidence.
5. Confirm CSP remains Report-Only unless the separate security phase has completed.
6. Confirm HSTS preload remains operator-gated.

Suggested commands:

```bash
npm test
npm run check
npm run capacity:verify-evidence
npm run audit:client
npm run audit:production
```

Acceptance:

- no regression to source lockdown;
- no regression to multi-learner bootstrap;
- no false capacity certification;
- no public wording beyond `small-pilot-provisional`.

---

### P1-U1 — Cloudflare CPU/wall evidence join

Add a supported way to join Cloudflare Worker CPU/wall logs to capacity evidence by `requestId`.

Required design rules:

- Do not expose Cloudflare CPU values in child-facing JSON unless explicitly reviewed.
- Do not fake CPU values in `meta.capacity`.
- Store joined CPU evidence in evidence files, reports, or operator-only summaries.
- Preserve request ID redaction rules.
- Keep learner-specific command request IDs out of public summaries unless already allowed by the evidence schema.

Possible implementation options:

1. Add a script that ingests a bounded Workers Logs/Tail export and a capacity evidence JSON file, then writes a joined diagnostic file.
2. Add optional capacity-run support that saves top-tail request IDs in a format directly usable for log filtering.
3. Add schema-v4 optional fields for `cloudflareCpuMs`, `cloudflareWallMs`, and `invocationOutcome` under a non-public diagnostics object.

Expected output shape:

```json
{
  "requestId": "server-request-id",
  "endpoint": "/api/bootstrap",
  "status": 200,
  "appWallMs": 1167.4,
  "cloudflareCpuMs": 3.8,
  "cloudflareWallMs": 1170.2,
  "d1DurationMs": 54.1,
  "d1QueryCount": 12,
  "d1RowsRead": 10,
  "d1RowsWritten": 0,
  "responseBytes": 39002,
  "classification": "d1-queue-or-platform-tail"
}
```

Acceptance:

- evidence verifier accepts the new optional fields;
- missing Cloudflare logs classify as `unclassified-insufficient-logs`, not pass;
- joined logs can explain at least the top 10 slowest bootstrap requests from a strict run;
- summary generation cannot certify a run based on joined CPU data alone.

---

### P1-U2 — Low-overhead route phase timings for bootstrap capacity runs

Add optional bootstrap phase timings for capacity diagnostics.

This must be low overhead and disabled outside capacity/debug contexts unless separately reviewed.

Suggested phases:

- `authAndSessionMs`;
- `accountLoadMs`;
- `membershipLoadMs`;
- `revisionHashMs`;
- `monsterVisualPointerMs`;
- `subjectStateLoadMs`;
- `gameStateLoadMs`;
- `readModelLoadMs`;
- `sessionRowsLoadMs`;
- `eventRowsLoadMs`;
- `responseBuildMs`;
- `jsonSerializeMs`.

Design note:

`JSON.stringify` can be real Worker CPU. If the app only measures D1 and wall time, JSON construction and serialization may hide inside “unknown”. Phase 1 should isolate this if possible.

Acceptance:

- phase timings are bounded and allowlisted;
- no raw SQL, learner names, answers, prompts, or private fields appear in timings;
- no visible child UI changes;
- timings appear only in capacity evidence/logs;
- enabling timings does not materially increase query count or response bytes.

---

### P1-U3 — Statement-level map and `EXPLAIN QUERY PLAN` shortlist

Use the existing D1 statement collection to build a ranked statement map for top-tail requests.

Required outputs:

- statement name;
- call count per request;
- rows read;
- rows written;
- duration;
- whether the statement appears only in full bootstrap, not-modified bootstrap, command path, Hero path, Parent path, or Admin path;
- candidate index/query-shape note where relevant.

For the top read-heavy or duration-heavy statements, run `EXPLAIN QUERY PLAN` against representative parameters.

Rules:

- Do not add indexes blindly.
- Do not add broad indexes without write-cost analysis.
- Prefer query-shape reduction before indexing.
- Consider partial indexes only where a hot subset is clearly stable.
- Record the expected read-row reduction and write-row cost before adding an index.

Acceptance:

- at least the top 10 hot statements are classified;
- every proposed index has a specific query and expected benefit;
- any index write amplification is recorded in the 1000-learner ledger;
- no schema migration ships without a before/after query-plan note.

---

### P1-U4 — One-statement bootstrap reduction evaluation

Evaluate the duplicated `child_subject_state` read in the public bounded bootstrap path.

Current suspected shape:

1. `bootstrapBundle()` reads `child_subject_state` to build compact subject state.
2. `listPublicBootstrapActiveSessionIds()` re-reads `child_subject_state.ui_json` to parse active session IDs.
3. `listPublicBootstrapSessionRows()` uses those session IDs to load active practice sessions.

Target shape:

- derive active session IDs from already-loaded subject-state rows, or pass a bounded active-session digest from the first read into the session-row loader;
- preserve selected-learner and sibling behaviour;
- preserve active session inclusion;
- avoid broadening loaded rows.

Implementation guardrails:

- Keep the change small.
- Keep threshold policy unchanged.
- Keep public bootstrap payload shape stable.
- Add a regression test where sibling learners each have active subject sessions.
- Add a regression test where selected learner changes and session rows remain correct.
- Add a regression test where not-modified remains valid until sibling state changes.

Acceptance:

- query count drops by one in the measured public bounded bootstrap path, or the evaluation records why it cannot safely drop;
- no multi-learner regression;
- no selected-learner regression;
- no active-session regression;
- no redaction regression;
- strict 30 evidence is rerun after the change if it ships.

---

### P1-U5 — Strict 30 and diagnostic 60 rerun matrix

Run evidence in a controlled matrix before and after any P1 code change.

Minimum matrix:

| Tier | Purpose | Required? | Certification eligible? |
| --- | --- | --- | --- |
| T0 local smoke | Catch obvious breakage | Yes | No |
| T1 strict 30 baseline | Current certification gate | Yes | Yes, if strict shape and policy pass |
| T3 reduced burst | Diagnose burst sensitivity | Yes | No |
| T4 manifest diagnostic | Separate setup rate limits from app load | Yes | No unless equivalence policy exists |
| T5 repeated strict 30 | Confidence / variance check | Yes | Yes, if strict shape and policy pass |
| 60 manifest preflight | Stretch diagnostic | Recommended | No by default |

Required evidence fields:

- endpoint P50/P95/P99 where available;
- top-tail request IDs;
- app wall time;
- Cloudflare CPU/wall where joined;
- query count;
- D1 rows read/written;
- D1 duration;
- response bytes;
- bootstrap mode counts;
- capacity signals;
- certification eligibility reasons.

Acceptance:

- strict evidence is not replaced by manifest evidence;
- repeated strict runs use unique output paths;
- summary verifier rejects stale or diagnostic evidence as certification;
- top-tail bootstrap samples are available for correlation.

---

### P1-U6 — 1000-learner free-tier budget worksheet

Create a budget worksheet in markdown or JSON that uses measured numbers rather than guesses.

The worksheet should model at least:

- 30 learners;
- 60 learners;
- 100 learners;
- 300 learners;
- 1000 learners.

For each scenario, estimate:

- bootstraps per learner per day;
- not-modified bootstraps per learner per day;
- subject commands per learner per day;
- Hero reads/commands per learner per day;
- Parent/Admin reads per day;
- retries/backoff factor;
- dynamic Worker requests total;
- D1 rows read total;
- D1 rows written total;
- Worker CPU ms total where available;
- worst 15-minute burst shape;
- D1 database queue risk.

Initial free-tier reality checks for 1000 learners:

| Resource | Free-tier daily budget | Naive per-1000-learner allowance | Phase 1 judgement |
| --- | ---: | ---: | --- |
| Worker dynamic requests | 100,000/day | 100 requests/learner/day before any headroom | Very tight |
| D1 rows read | 5,000,000/day | 5,000 rows/learner/day before headroom | Manageable only with indexed/bounded reads |
| D1 rows written | 100,000/day | 100 written rows/learner/day before headroom | Extremely tight |

Recommended modelling headroom:

- Do not plan to use 100% of any free-tier quota.
- Treat 60% of daily quota as the first amber line.
- Treat 80% of daily quota as red unless the owner explicitly accepts degraded mode.
- Preserve budget for retries, parent views, admin operations, auth/session setup, and real user variance.

Acceptance:

- the worksheet uses measured per-route costs;
- optimistic, expected, and pessimistic scenarios are separated;
- write amplification per command is visible;
- any proposed Phase 2/3 optimisation says which quota it protects.

---

## 7. Phase 1 deliverables

Phase 1 should produce these artefacts:

1. `docs/plans/james/sys-hardening/sys-hardening-optimisation-p1.md` — this plan, adjusted after review.
2. `docs/operations/capacity-cpu-d1-evidence.md` — operator guide for collecting/joining Worker CPU and app capacity evidence.
3. `reports/capacity/evidence/<date>-p1-strict-30-baseline.json` — strict baseline evidence.
4. `reports/capacity/evidence/<date>-p1-strict-30-repeat-*.json` — repeated strict evidence.
5. `reports/capacity/evidence/<date>-p1-tail-correlation.json` — joined top-tail CPU/D1 classification.
6. `reports/capacity/evidence/<date>-p1-statement-map.json` — statement-level hot-path map.
7. `docs/operations/capacity-1000-learner-free-tier-budget.md` and `reports/capacity/latest-1000-learner-budget.json` — measured budget worksheet and latest machine-readable modelling artefact.
8. Optional PR: one-statement bootstrap reduction, if proven safe.
9. Completion report: `docs/plans/james/sys-hardening/sys-hardening-optimisation-p1-completion-report.md`.

Implementation handoff:

- Dated implementation plan: `docs/plans/2026-04-29-010-feat-sys-hardening-optimisation-p1-evidence-attribution-plan.md`.
- Worker CPU/D1 guide: `docs/operations/capacity-cpu-d1-evidence.md`.
- P1 rerun matrix: `docs/operations/capacity-tail-latency.md#p1-evidence-attribution-matrix`.
- Budget ledger: `docs/operations/capacity-1000-learner-free-tier-budget.md`.
- Implementation handoff report: `docs/plans/james/sys-hardening/sys-hardening-optimisation-p1-completion-report.md`.

Current status: implementation handoff only. Phase 1 acceptance remains open until post-change strict/repeated production evidence, joined top-tail Worker CPU/wall attribution, and complete statement-map artefacts exist.

---

## 8. Acceptance criteria

Phase 1 is complete only when all required evidence exists.

### Evidence acceptance

- current main commit recorded;
- current capacity status remains honest;
- strict 30 baseline run exists;
- repeated strict 30 run exists;
- top-tail bootstrap request IDs captured;
- Cloudflare CPU/wall data joined for top-tail samples, or missing-log classification recorded honestly;
- D1 query count, rows read, rows written, D1 duration, response bytes, and app wall time are present;
- top-tail classification exists;
- 1000-learner budget worksheet exists;
- evidence verifier passes;
- Admin evidence cannot show certification from diagnostic/stale files.

### Code acceptance, if code ships

- no learner-visible product scope change;
- no public payload privacy regression;
- no sibling learner regression;
- no selected learner regression;
- no not-modified revision regression;
- query budget tests are updated only with explicit rationale;
- strict evidence is rerun after the code change;
- completion report separates “Phase 1 complete” from “capacity promoted”.

### Certification acceptance

30-learner certification is allowed only if the existing strict gate passes:

- strict 30/20/1 production run;
- zero 5xx;
- zero network failures;
- zero hard capacity signals;
- bootstrap P95 <= 1,000 ms;
- command P95 <= 750 ms;
- max response bytes <= 600,000;
- capacity metadata present;
- evidence verifier passes;
- Admin Production Evidence marks certification from positive proof only.

If any of those fail, keep `small-pilot-provisional`.

---

## 9. Expected Phase 1 outcome

The expected outcome is not “we magically reach 1000 learners”.

The expected outcome is a trustworthy map.

At the end of Phase 1, the team should be able to say one of the following with evidence:

1. Bootstrap tail is mostly D1/platform queue variance: low CPU, low D1 rows, stable query count, high wall tail.
2. Bootstrap tail is query-fanout sensitive: each extra D1 statement moves P95, so one-statement reduction is worth shipping and further consolidation is justified.
3. Bootstrap tail is JSON/Worker CPU sensitive: D1 is not the only issue; response construction/stringification must be reduced.
4. Bootstrap tail is account-shape sensitive: multi-learner state, active sessions, or selected learner shape creates a measurable tail.
5. Evidence is insufficient: logs are missing, run shape is invalid, or request IDs cannot be joined.

The worst outcome would be shipping a clever optimisation without knowing which resource it protects.

---

## 10. Phase 1 risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| CPU is guessed from wall time | Worker CPU and wall time are different resources | Join real Cloudflare logs; classify missing logs honestly |
| One-statement reduction breaks active sessions | Bootstrap correctness is more important than query count | Add active-session multi-learner regression tests |
| Evidence becomes too complex to verify | Complex evidence can create false certification paths | Keep certification logic fail-closed; optional fields cannot certify alone |
| Phase timings add overhead | Diagnostics can distort the measured route | Keep timings allowlisted, bounded, and capacity-run-only |
| Indexes are added blindly | Indexes can increase write cost and storage | Require query-plan and write-amplification notes |
| 1000 learner model becomes a marketing claim | Worksheet is not production evidence | Label as modelling only until real load evidence exists |
| Manifest diagnostics are mistaken for certification | P6 explicitly guarded against this | Preserve certification eligibility reasons |

---

## 11. Phase 1 decision record template

Use this template in the completion report.

```md
## Phase 1 Decision Record

Date:
Commit:
Environment:
Evidence files:

### Current certification status

- 30 learner:
- 60 learner:
- Public wording:

### Bootstrap tail classification

- Classification:
- Supporting request IDs:
- App wall P95:
- Cloudflare CPU P95/top-tail:
- D1 duration P95/top-tail:
- Query count P95/max:
- Rows read P95/max:
- Rows written P95/max:
- Response bytes P95/max:

### One-statement reduction decision

- Shipped / not shipped:
- Reason:
- Query count before:
- Query count after:
- Strict evidence after change:

### 1000-learner budget judgement

- Worker request bottleneck:
- D1 read bottleneck:
- D1 write bottleneck:
- CPU bottleneck:
- D1 queue bottleneck:

### Recommended Phase 2 path

- Primary path:
- Secondary path:
- Deferred paths:
```

---

## 12. Relationship to the wider optimisation route

Phase 1 is only the foundation. The likely full route should have six phases.

### Phase 1 — CPU/D1 evidence baseline and bootstrap tail attribution

Purpose: know what the system actually spends and why bootstrap P95 fails.

Primary output: joined CPU/D1 evidence, statement map, 1000-learner budget worksheet, and one safe bootstrap optimisation decision.

### Phase 2 — Bootstrap tail reduction and 30/60 certification attempt

Purpose: reduce `/api/bootstrap` P95 without weakening multi-learner correctness.

Likely work:

- query consolidation;
- not-modified fast path tightening;
- selected-learner envelope slimming;
- active-session/session-row consolidation;
- JSON construction reduction;
- cache/revision contract for semi-static config;
- repeated strict 30 certification attempts;
- diagnostic 60 reruns.

Exit target:

- strict 30 certified if evidence passes;
- 60 remains diagnostic unless policy and evidence mature.

### Phase 3 — Hot command and Hero route unit economics

Purpose: reduce D1 write amplification and query count on practice commands and Hero start-task paths.

Likely work:

- command write ledger;
- no-op and duplicate-write elimination;
- projection write coalescing;
- Hero start-task query reduction;
- static content/runtime cache strategy;
- event/feed write policy review;
- route budget ratchets.

Exit target:

- each hot command has measured rows read/written and CPU budgets;
- Hero cannot become the next bootstrap-sized bottleneck.

### Phase 4 — Request/write compression for 300–1000 learner economics

Purpose: make the daily free-tier request/write budget plausible.

Likely work:

- session-level command compaction;
- idempotent command batching;
- client/server revision protocol for fewer refreshes;
- delayed/non-critical projection writes where safe;
- read-through cache for stable data;
- retry/backoff/degrade policy;
- “class starts now” burst model.

Exit target:

- 1000-learner worksheet has at least one plausible green/amber scenario without exceeding free-tier daily budgets.

### Phase 5 — Advanced scheduling, caching, and partitioning research slice

Purpose: introduce the more advanced algorithms only after the resource ledger proves which ones are needed.

Candidate research-level integrations:

- adaptive bootstrap cache invalidation by revision vector;
- request coalescing for concurrent same-account bootstrap requests;
- probabilistic maintenance scheduling to smooth class bursts;
- control-theoretic backpressure for learner command cadence;
- D1 sharding/partitioning model by account/cohort if a single database queue is the bottleneck;
- Durable Object actor model for hot account/session coordination if justified;
- read-model materialisation policy driven by measured read/write trade-off.

Exit target:

- one advanced strategy selected with a proof-style cost model and regression plan.

### Phase 6 — Lighthouse proof, operational guardrails, and public claim

Purpose: turn the architecture into a credible 1000+ learner lighthouse demo without lying.

Likely work:

- repeated high-shape load evidence;
- free-tier daily quota simulation;
- classroom-start burst drills;
- degraded-mode drills;
- rollback drills;
- Admin evidence surface for lighthouse status;
- public wording policy;
- owner sign-off.

Exit target:

- either “1000+ lighthouse certified under defined constraints” with evidence, or an honest blocker record naming the specific quota/resource that prevents it.

---

## 13. Recommendation

Proceed with Phase 1 before attempting advanced algorithms.

The system already has good correctness hardening. The next limiting factor is not a lack of cleverness; it is missing attribution. Once CPU, D1, query count, row count, serialization, payload, and burst behaviour are all visible in one ledger, the next optimisation will be much less speculative.

The first engineering move should therefore be:

> Join Cloudflare Worker CPU/wall evidence to top-tail `/api/bootstrap` capacity samples, then evaluate the one-statement bootstrap reduction under unchanged certification thresholds.
