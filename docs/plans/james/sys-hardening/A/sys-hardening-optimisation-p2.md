---
title: "System Hardening Optimisation P2 — Bootstrap Tail Reduction and 30/60 Evidence Attempt"
type: plan
status: draft
language: en-GB
date: 2026-04-29
route: system-hardening-and-optimisation
owner: james / engineering agent
source_docs:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p1.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p1-completion-report.md
  - docs/operations/capacity.md
  - docs/operations/capacity-cpu-d1-evidence.md
  - docs/operations/capacity-tail-latency.md
  - docs/operations/capacity-1000-learner-free-tier-budget.md
  - reports/capacity/latest-1000-learner-budget.json
---

# System Hardening Optimisation P2 — Bootstrap Tail Reduction and 30/60 Evidence Attempt

## 0. One-sentence summary

Phase 2 turns the Phase 1 attribution tooling into a targeted `/api/bootstrap` tail-reduction pass, with the narrow aim of making the 30-learner strict classroom gate pass if the evidence supports it, while keeping the 60-learner and 1000-learner goals diagnostic and non-certifying.

Phase 2 must begin with evidence collection. It must not begin with another speculative code change.

---

## 1. P1 validation record

P1 should be treated as a successfully delivered implementation and operations-handoff slice, not as a completed capacity-certification phase.

The P1 completion report is broadly accurate against the lean bundle and GitHub main snapshot:

- the Worker-log join script exists;
- the statement-map builder exists;
- the 1000-learner budget ledger exists;
- the verifier rejects diagnostic Worker-log joins that try to contribute to certification;
- matched invocation samples with missing/null CPU/wall data are fail-closed by verifier tests;
- bootstrap phase timings are written to structured `capacity.request` logs, not to child-facing `meta.capacity`;
- the public bounded bootstrap path now reuses already-loaded `child_subject_state` rows for active-session discovery;
- local query-budget tests pin the measured public bounded bootstrap count at 11 queries, with budget headroom at 12;
- no new capacity tier was certified.

The important caveat is that P1 evidence acceptance is still open. P1 did not produce the post-change strict 30 production run, repeated strict run, joined top-tail Worker CPU/wall artefact, or complete production statement-map artefact required to close the evidence loop.

Therefore Phase 2 starts from this truth:

- 30-learner classroom beta: not certified.
- 60-learner stretch: not certified.
- 100+ / 300 / 1000 learner targets: not certified.
- Public wording remains `small-pilot-provisional`.
- Current failed strict evidence is still pre-P1-code-change evidence.
- Worker CPU is still unknown until real Cloudflare CPU/wall logs are joined.
- D1 rows read are the first obvious 1000-learner ledger warning, but D1 rows written remain lower-bound/unknown in the latest ledger.
- The P1 phase timing called `responseConstruction` covers repository response-object construction. It does not yet isolate the outer HTTP JSON serialisation, body clone/read, JSON parse, and capacity-meta rewrite path in `worker/src/app.js`.

That last point matters. If Phase 2 sees Worker CPU pressure, it must not assume that the repository `responseConstruction` timing is the whole serialisation cost.

---

## 2. Why Phase 2 exists

The system is already safer than it was before P6/P1. The hot route is now well bounded compared with a naïve bootstrap:

- selected-learner-bounded first paint;
- compact sibling learner state preserved;
- sibling learner revision invalidation preserved;
- heavy history lazy-loaded;
- monster visual config shipped as a pointer in bounded mode;
- active-session discovery no longer re-reads `child_subject_state`;
- query-budget tests ratchet the measured P1 bootstrap count;
- strict capacity evidence remains fail-closed.

The remaining problem is not broad correctness. The remaining problem is tail evidence.

The latest committed strict 30 run failed only bootstrap P95: 1,167.4 ms observed against a 1,000 ms ceiling. The 60-learner diagnostic/preflight also failed bootstrap P95: 854.0 ms observed against a 750 ms stretch ceiling. Command latency, response bytes, 5xx, network failures, and hard capacity signals were otherwise healthy in those committed runs.

Phase 2 exists to answer two questions:

1. After the P1 one-statement reduction, does the strict 30 gate pass or still fail?
2. If it still fails, which measured resource explains the bootstrap tail strongly enough to justify a specific mitigation?

Phase 2 is not the 1000-learner phase. It is the bootstrap-tail phase that earns the right to attempt 30-learner certification and to produce better diagnostic evidence for the 60-learner stretch.

---

## 3. Product stance

Do not promote public wording at the start of Phase 2.

The correct product wording remains:

> Small-pilot-provisional. The platform has bounded bootstrap, Worker-owned subject commands, capacity telemetry, multi-learner regression locks, and fail-closed evidence tooling. It is not certified for 30 simultaneous active learners until strict evidence passes the bootstrap P95 gate.

Phase 2 may update the 30-learner status only if strict verifier-backed evidence passes the existing gate. A passing reduced-burst run, manifest run, warm-up run, Worker-log diagnostic join, statement map, or modelling ledger is not enough.

60-learner evidence remains diagnostic unless a separate threshold/config/equivalence policy is approved. 1000-learner wording remains an internal lighthouse target, not a capacity claim.

---

## 4. Non-goals

Phase 2 must stay narrow.

Out of scope:

- no threshold relaxation;
- no paid-tier migration as the answer;
- no Hero economy or learner-visible reward changes;
- no command write-amplification rewrite;
- no broad repository rewrite;
- no subject learning-semantics rewrite;
- no new browser-owned production writes;
- no removal of sibling learner state from bootstrap;
- no hiding writable learners to improve numbers;
- no weakening of selected-learner switching;
- no weakening of not-modified revision invalidation;
- no D1 index migration without statement-map and query-plan evidence;
- no D1 partitioning, Durable Object actor model, or request batching research slice;
- no 60/100/300/1000 learner claim.

Phase 2 may include small instrumentation work if P1 logs are insufficient to classify the tail. Instrumentation is allowed because blind optimisation is worse than an extra diagnostic slice.

---

## 5. Current baseline to preserve

### 5.1 Worker authority

The Worker remains the production authority for:

- session and account resolution;
- learner access;
- selected learner resolution;
- subject command validation;
- idempotency and expected revision;
- subject state mutation;
- game/reward projection;
- bootstrap/read-model generation;
- capacity telemetry;
- redaction;
- admin/operations evidence.

### 5.2 Bootstrap correctness

`/api/bootstrap` must continue to preserve:

- account metadata;
- session metadata;
- learner list;
- selected learner id;
- all writable learner identities;
- selected learner first-paint state;
- compact sibling learner state;
- sibling learner state in the revision/hash contract;
- active session inclusion;
- no private answer-bearing fields;
- capacity metadata;
- not-modified behaviour when the server revision matches `lastKnownRevision`.

Do not optimise by deleting data the shell needs to avoid false zero-state or broken learner switching.

### 5.3 Evidence truth boundary

Capacity support remains a positive-proof problem. Diagnostic artefacts must explain, not certify.

Preserve these boundaries:

- strict 30 evidence must use the pinned `reports/capacity/configs/30-learner-beta.json` config;
- evidence files must have unique output paths;
- failed evidence must not be overwritten;
- Worker-log joins stay under `diagnostics.workerLogJoin` and remain diagnostic-only;
- missing CPU/wall logs classify as `unclassified-insufficient-logs`;
- statement-map recommendations require complete statement coverage;
- public `meta.capacity` must not expose statement detail or phase timings.

---

## 6. Phase 2 objectives

Phase 2 has five objectives.

### Objective A — Close the P1 evidence gap before changing behaviour

Run post-P1-code-change strict evidence and join bounded Cloudflare Worker CPU/wall logs for top-tail bootstrap samples.

Required artefacts:

- post-change strict 30 run;
- repeated strict 30 run;
- bounded Worker log export for those windows;
- joined tail-correlation file;
- statement map for complete sampled `capacity.request` logs, or an explicit incomplete-coverage record;
- refreshed 1000-learner budget ledger;
- verifier output.

If the evidence cannot be joined, Phase 2 must first fix the evidence collection path rather than guessing at CPU/D1 causes.

### Objective B — Classify the bootstrap tail

For the slowest `/api/bootstrap` requests, classify the tail as one of:

- `unclassified-insufficient-logs`;
- `partial-invocation-only`;
- `d1-dominated`;
- `worker-cpu-dominated`;
- `payload-size-pressure`;
- `client-network-or-platform-overhead`;
- `mixed-no-single-dominant-resource`.

The classification must include request IDs, app wall time, Cloudflare CPU time, Worker wall time, D1 duration, query count, rows read, rows written, response bytes, bootstrap mode, and top statement/phase evidence where available.

### Objective C — Choose one targeted mitigation path

Phase 2 should choose at most one primary code path after evidence classification.

Allowed paths:

1. D1/query-shape reduction for bootstrap.
2. Worker CPU / JSON serialisation reduction for bootstrap.
3. Bootstrap payload/envelope reduction.
4. Burst/warm-up operational mitigation with no code change.
5. Evidence-capture correction if logs remain insufficient.

Avoid mixing several speculative optimisations in one PR. A small second change is acceptable only if it is directly required by the selected primary path and has independent regression tests.

### Objective D — Re-run the strict gate after mitigation

If any code or operational mitigation ships, rerun strict 30 evidence and at least one repeated strict run with unique paths.

A passing single run is useful. A passing strict run plus repeated strict run is stronger. A passing reduced-burst or warm-up run is diagnostic only.

### Objective E — Produce a Phase 2 decision record

Phase 2 ends with a completion report that says one of:

- strict 30 certification is justified and the capacity table has been updated;
- strict 30 is still blocked, with a classified bottleneck and next mitigation;
- evidence remains insufficient, with a named log/instrumentation blocker;
- the route looks platform-tail dominated and requires an operational policy decision rather than a code rewrite.

---

## 7. Workstreams

### P2-U0 — Evidence lock and post-P1 strict rerun

Run the production evidence matrix before any new optimisation PR.

Minimum commands:

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
  --output reports/capacity/evidence/2026-04-29-p2-t1-strict-post-p1.json
```

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
  --output reports/capacity/evidence/2026-04-29-p2-t5-strict-repeat-1.json
```

Then export bounded Worker logs covering the same windows and join them:

```sh
node ./scripts/join-capacity-worker-logs.mjs \
  --evidence reports/capacity/evidence/2026-04-29-p2-t1-strict-post-p1.json \
  --logs reports/capacity/evidence/2026-04-29-p2-t1-worker-logs.jsonl \
  --output reports/capacity/evidence/2026-04-29-p2-t1-tail-correlation.json
```

Build the statement map only when sampled statement coverage is complete:

```sh
node ./scripts/build-capacity-statement-map.mjs \
  --input reports/capacity/evidence/2026-04-29-p2-t1-worker-logs.jsonl \
  --output reports/capacity/evidence/2026-04-29-p2-t1-statement-map.json
```

Refresh the budget ledger:

```sh
node ./scripts/build-capacity-budget-ledger.mjs \
  --input reports/capacity/evidence/2026-04-29-p2-t1-strict-post-p1.json
```

Acceptance:

- strict and repeated evidence files exist and are not overwritten;
- `npm run capacity:verify-evidence` passes for committed capacity rows;
- top-tail bootstrap request IDs are present;
- Worker CPU/wall is joined or missing logs are classified honestly;
- statement coverage status is explicit;
- 1000-learner ledger is refreshed and still marked non-certifying;
- no capacity status is promoted from diagnostics alone.

### P2-U1 — Tail classification and decision gate

Create a short decision record before code changes.

Required fields:

```md
## P2 Tail Classification Record

Date:
Commit:
Evidence files:
Worker log source:
Statement map:
Budget ledger:

### Strict 30 result

- Bootstrap P50/P95/P99/max:
- Command P50/P95/P99/max:
- Max response bytes:
- 5xx/network/signals:
- Query count P95/max:
- D1 rows read P95/max:
- D1 rows written P95/max:

### Top-tail attribution

- Classification:
- Request IDs:
- Cloudflare CPU:
- Worker wall:
- App/client wall:
- D1 duration:
- Top statements:
- Top bootstrap phases:
- Response bytes:

### Decision

- Primary Phase 2 path:
- Rationale:
- Non-chosen paths:
- No-go conditions:
```

Decision rules:

| Evidence pattern | Primary path | No-go |
| --- | --- | --- |
| Missing or incomplete Worker CPU/wall for top-tail samples | Fix log export/join coverage | Do not optimise CPU or D1 from guesswork. |
| D1 duration is at least half of Worker wall time | Statement-map-backed query/read reduction | Do not add indexes without query-plan/write-cost evidence. |
| Query count or rows read rise with account/burst shape | Bootstrap query consolidation or row fan-out reduction | Do not drop sibling learner state. |
| Worker CPU is near the Free limit or dominates Worker wall time | JSON/response construction/serialisation reduction | Do not blame D1 from wall time alone. |
| Response bytes approach cap | Envelope slimming | Do not raise byte caps. |
| Worker wall is low but app/client wall is high | Load-driver/network/platform investigation | Do not rewrite bootstrap internals first. |
| Strict T1 fails but repeated/warm run passes | Launch-tail operational policy investigation | Do not call warm evidence strict success without a policy record. |
| Strict T1 and T5 pass cleanly | Prepare 30-learner certification update | Do not jump to 60/1000 claims. |

Acceptance:

- no implementation branch starts without this record;
- every proposed change names the metric it protects;
- every deferred path has a reason.

### P2-U2 — D1/query-shape reduction path, if selected

Use this path only if joined evidence points to D1 duration, query fan-out, or rows-read pressure.

Candidate investigations, to be proved before implementation:

1. Combine account and learner-list-revision reads where safe.
   - Current full bootstrap reads `adult_accounts`, then reads `adult_account_list_revisions` for the revision hash.
   - The not-modified probe also reads account, membership rows, and list revision.
   - A safe left-join or helper-level consolidation may reduce one statement on full and not-modified paths.
   - Must preserve empty/missing list-revision behaviour and hash agreement with the full bundle.

2. Check whether spelling runtime content lookup is necessary on every full bootstrap.
   - `readSpellingRuntimeContentBundle()` still performs an `account_subject_content` lookup before using the module cache.
   - If most accounts use seeded published content, consider a safe content-pointer or default-content fast path.
   - Must preserve account-scoped spelling content, release pinning, and older seed-release support.

3. Validate `practice_sessions` and `event_log` query plans for selected-learner bootstrap.
   - Run `EXPLAIN QUERY PLAN` with representative parameters.
   - Confirm indexes are used for learner/status/update-time queries.
   - Prefer query-shape reduction over adding broad indexes.

4. Validate `child_subject_state` and `child_game_state` row fan-out across multi-learner accounts.
   - These reads intentionally include every writable learner for compact sibling state.
   - Do not narrow them to selected learner unless a new sibling-summary read model exists and revision invalidation remains correct.

5. Review `computeWritableLearnerStatesDigest()` cost in the revision hash path.
   - It currently protects sibling learner invalidation.
   - Any optimisation must keep sibling writes invalidating `notModified` responses.

Implementation guardrails:

- target at most one additional bootstrap statement reduction in this phase unless evidence proves more is required;
- update query-budget constants only with measured rationale;
- add tests for full bootstrap, not-modified bootstrap, selected-learner switching, sibling learner mutation invalidation, and active session inclusion;
- do not add an index without before/after query-plan notes and write-cost notes;
- record before/after query count, rows read, D1 duration, and response bytes.

Acceptance:

- measured full bootstrap query count does not regress above the P1 count unless explicitly justified;
- not-modified query count does not regress;
- top statement duration/rows-read improves in the selected evidence shape;
- no multi-learner, selected learner, active-session, or redaction regression;
- strict 30 evidence is rerun after change.

### P2-U3 — Worker CPU / JSON serialisation path, if selected

Use this path only if joined Worker CPU evidence or phase timings show CPU pressure.

The likely CPU-sensitive area is not only repository response construction. The current JSON response flow can involve:

1. route handler builds a JavaScript object;
2. `json()` serialises it into a Response body;
3. capacity middleware clones and reads the body text to measure bytes;
4. capacity middleware parses the JSON text;
5. capacity middleware appends `meta.capacity`;
6. capacity middleware stringifies the whole payload again.

That double serialisation/rewrite path is acceptable for observability, but it may be expensive if Worker CPU is the real bottleneck.

Required investigation before optimisation:

- add or extract structured-log-only timing for JSON body read, JSON parse, capacity-meta rewrite, and final serialisation;
- keep those timings out of public `meta.capacity`;
- run a local/bootstrap fixture to ensure the timing itself is bounded and does not distort payload shape;
- join Worker CPU logs before and after any change.

Candidate mitigations, only if measured:

- avoid parsing/re-stringifying the full body when a route can attach capacity metadata before the first JSON serialisation;
- introduce a Worker-internal JSON response helper that accepts a late capacity-meta hook without changing route payloads;
- reduce object cloning in bootstrap response construction;
- precompute compact public read-model fragments only where read/write economics support it;
- avoid per-row expensive transformations in the first-paint path where a read model already exists.

No-go conditions:

- do not remove capacity metadata to save CPU;
- do not expose phase timings publicly;
- do not change public bootstrap envelope shape without capacity version and snapshot tests;
- do not hide sibling learner state;
- do not weaken redaction.

Acceptance:

- Cloudflare CPU top-tail evidence improves or is no longer near the Free-plan ceiling;
- app/client wall time does not regress;
- response bytes do not grow materially;
- capacity metadata still appears on successful capacity-relevant JSON responses;
- tests prove phase timings remain structured-log-only.

### P2-U4 — Payload/envelope reduction path, if selected

Use this path only if response bytes are a material part of the tail.

Current committed evidence does not show bootstrap payload pressure: the failed strict 30 run had max response bytes well below the 600,000-byte cap. Therefore this path is not expected to be primary unless post-P1 evidence changes.

Allowed investigations:

- confirm selected-learner-bounded bootstrap stays small under high sibling-count and active-session shapes;
- confirm full-legacy bootstrap is not accidentally used by public signed-in routes;
- confirm monster visual config pointer remains compact;
- inspect per-subject public read-model fragments for unnecessary fields.

No-go conditions:

- do not drop account/learner/revision fields needed by the shell;
- do not remove sibling learner compact state;
- do not strip error/debug data from operator-only logs that are needed for attribution;
- do not raise `maxResponseBytes`.

Acceptance:

- payload reduction is measurable;
- bootstrap envelope snapshot/version rules are followed;
- no first-paint, learner switching, or redaction regression;
- strict evidence is rerun.

### P2-U5 — Burst/warm-up operational path, if selected

Use this path only if strict first-run tail differs materially from repeated/warm evidence while Worker CPU, query count, rows, and payload remain stable.

Possible outcome:

- no code change;
- record launch-tail risk;
- define an operator pre-warm runbook;
- still require a strict run that does not hide initial-tail risk before certification, unless a separate owner-reviewed policy explicitly changes the gate.

Acceptance:

- warm-up/repeated evidence is kept separate from strict T1 evidence;
- capacity docs explain the distinction;
- no threshold is relaxed;
- Admin evidence cannot treat warm-only success as strict certification.

### P2-U6 — Re-run matrix and certification decision

After the selected mitigation path, run the evidence matrix again.

Minimum:

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
  --output reports/capacity/evidence/2026-04-29-p2-t1-strict-after-mitigation.json
```

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
  --output reports/capacity/evidence/2026-04-29-p2-t5-strict-repeat-after-mitigation.json
```

Recommended diagnostic:

```sh
npm run capacity:classroom -- \
  --production \
  --origin https://ks2.eugnel.uk \
  --confirm-production-load \
  --confirm-high-production-load \
  --demo-sessions \
  --learners 60 \
  --bootstrap-burst 20 \
  --rounds 1 \
  --config reports/capacity/configs/60-learner-stretch.json \
  --include-request-samples \
  --output reports/capacity/evidence/2026-04-29-p2-60-learner-diagnostic.json
```

Certification rule:

30-learner certification is allowed only if the existing strict gate passes:

- production origin;
- demo sessions or another approved strict session source;
- 30 learners;
- bootstrap burst 20;
- 1 round;
- pinned `30-learner-beta.json` config;
- zero 5xx;
- zero network failures;
- zero hard capacity signals;
- bootstrap P95 <= 1,000 ms;
- command P95 <= 750 ms;
- max response bytes <= 600,000;
- bootstrap capacity metadata present;
- evidence verifier passes;
- Admin Production Evidence remains fail-closed.

If any of those fail, keep `small-pilot-provisional`.

---

## 8. Expected implementation shape

Phase 2 should normally be one of these shapes.

### Shape 1 — Evidence-only close-out

If post-P1 strict and repeated strict runs pass cleanly, Phase 2 may be mostly evidence and documentation:

- add capacity evidence rows;
- update `latest-evidence-summary.json` through the approved generator;
- update `docs/operations/capacity.md`;
- produce completion report;
- schedule 60-learner diagnostic as follow-up.

This is the best outcome. Do not add code just because a phase expected a code PR.

### Shape 2 — One small D1/query mitigation

If D1/query shape is the tail:

- one query consolidation or one statement-shape change;
- query-budget ratchet;
- query-plan notes if index/query shape is involved;
- strict evidence rerun.

### Shape 3 — One JSON/CPU mitigation

If Worker CPU/serialisation is the tail:

- add missing structured-log-only timings if needed;
- reduce double serialisation or response rewriting only where measured;
- preserve `meta.capacity`;
- strict evidence rerun.

### Shape 4 — Evidence capture repair

If logs cannot be joined:

- fix request-id propagation or Worker log export instructions;
- add tests for accepted log shape;
- rerun evidence;
- no capacity promotion.

### Shape 5 — No-code operational decision

If evidence points at first-run platform/warm-up variance:

- document the launch-tail risk;
- define a pre-warm or retry/backoff policy as diagnostic mitigation;
- do not certify unless strict gate policy explicitly accepts it.

---

## 9. Required tests and verification

Minimum local verification for any Phase 2 PR:

```sh
npm test
npm run check
npm run capacity:verify-evidence
```

Focused suites should include, as relevant:

```sh
node --test tests/worker-query-budget.test.js
node --test tests/worker-bootstrap-capacity.test.js
node --test tests/worker-bootstrap-v2.test.js
node --test tests/capacity-worker-log-join.test.js
node --test tests/capacity-statement-map.test.js
node --test tests/verify-capacity-evidence.test.js
```

Add targeted tests when touching:

- bootstrap query shape;
- not-modified revision hash;
- sibling learner compact state;
- active session inclusion;
- capacity structured logs;
- capacity public metadata;
- JSON response decoration;
- statement-map/verifier semantics;
- budget ledger assumptions.

Any test that updates a query-budget constant must update the rationale comment in the same PR.

---

## 10. Deliverables

Phase 2 should produce:

1. `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p2.md` — this plan after review.
2. `reports/capacity/evidence/<date>-p2-t1-strict-post-p1.json`.
3. `reports/capacity/evidence/<date>-p2-t5-strict-repeat-*.json`.
4. `reports/capacity/evidence/<date>-p2-*-tail-correlation.json`.
5. `reports/capacity/evidence/<date>-p2-*-statement-map.json`, or an explicit incomplete-coverage artefact.
6. Refreshed `reports/capacity/latest-1000-learner-budget.json` and `docs/operations/capacity-1000-learner-free-tier-budget.md`.
7. Optional implementation PR with one selected mitigation path.
8. Updated query-budget tests and capacity docs, if behaviour changes.
9. `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p2-completion-report.md`.

---

## 11. Exit criteria

Phase 2 is complete when all of these are true:

- P1 evidence gap is closed or explicitly blocked by a named logging/evidence issue;
- strict 30 post-P1 evidence exists;
- at least one repeated strict 30 evidence file exists;
- Worker CPU/wall top-tail join exists, or missing logs are classified honestly;
- statement-map coverage status is explicit;
- budget ledger is refreshed and non-certifying;
- selected mitigation path is recorded;
- any code change has tests and before/after evidence;
- capacity wording remains honest.

Phase 2 is successful if it does one of the following:

- certifies 30 learners with strict verifier-backed evidence;
- or produces a classified bootstrap-tail blocker with a measured next action;
- or proves that evidence capture is still insufficient and fixes/records that blocker.

Phase 2 fails if it relaxes thresholds, hides sibling state, claims CPU safety without Worker logs, treats modelling as certification, or uses a diagnostic run as a public capacity claim.

---

## 12. Relationship to later phases

Phase 2 should not absorb the entire lighthouse route.

Expected remaining route:

### Phase 3 — Hot command and Hero route unit economics

Reduce practice-command and Hero-start query/write cost. Target write amplification, duplicate state reads, static content lookup, projection writes, and route budget ratchets.

### Phase 4 — Request/write compression for 300–1000 learner economics

Make free-tier daily request and write budgets plausible through command batching/compaction, stronger revision contracts, fewer refreshes, retry shaping, and burst smoothing.

### Phase 5 — Advanced scheduling, caching, and partitioning research slice

Bring in adaptive cache invalidation, request coalescing, probabilistic burst smoothing, control-theoretic backpressure, D1 sharding/partitioning, or Durable Object actor patterns only after measured economics justify them.

### Phase 6 — Lighthouse proof and operational guardrails

Run repeated high-shape evidence, daily quota simulations, classroom-start burst drills, degraded-mode drills, rollback drills, Admin evidence surface updates, and honest public wording.

---

## 13. Recommendation

Proceed with Phase 2 as an evidence-first bootstrap-tail phase.

The first move is not another optimisation PR. The first move is to run post-P1 strict evidence, join top-tail Worker CPU/wall logs, build the statement map if coverage is complete, refresh the 1000-learner ledger, and only then choose the smallest mitigation that protects the measured bottleneck.
