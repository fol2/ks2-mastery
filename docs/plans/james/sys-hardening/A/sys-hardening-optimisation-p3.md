---
title: "System Hardening Optimisation P3 — Invocation Telemetry Repair and Strict Evidence Gate"
type: product-engineering-contract
status: proposed
language: en-GB
date: 2026-04-29
route: system-hardening-and-optimisation
owner: james / engineering agent
source_reports:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p1-completion-report.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p2-completion-report.md
source_plan:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p2.md
source_operations:
  - docs/operations/capacity.md
  - docs/operations/capacity-cpu-d1-evidence.md
  - docs/operations/capacity-tail-latency.md
  - docs/operations/capacity-1000-learner-free-tier-budget.md
source_evidence:
  - reports/capacity/evidence/2026-04-29-p2-t1-strict-post-p1.json
  - reports/capacity/evidence/2026-04-29-p2-t5-strict-repeat-1.json
  - reports/capacity/evidence/2026-04-29-p2-t1-tail-correlation.json
  - reports/capacity/evidence/2026-04-29-p2-t5-tail-correlation.json
  - reports/capacity/evidence/2026-04-29-p2-t1-statement-map.json
  - reports/capacity/evidence/2026-04-29-p2-t5-statement-map.json
  - reports/capacity/latest-1000-learner-budget.json
---

# System Hardening Optimisation P3 — Invocation Telemetry Repair and Strict Evidence Gate

## 0. One-sentence contract

P3 repairs the missing machine-joinable Cloudflare invocation CPU/wall telemetry, reruns the strict 30-learner evidence gate with repeat confidence, and only then decides whether the next engineering mitigation should target D1, Worker CPU, payload construction, client/network/platform overhead, or no code path at all.

P3 is an evidence-repair and decision phase. It is not a broad performance phase.

---

## 1. Why P3 exists

P1 delivered the attribution tooling and one narrow public bootstrap query reduction. P2 then exercised that tooling against post-P1 strict production evidence.

The P2 outcome was deliberately non-certifying:

- T1, the first post-P1 strict 30-learner run, passed the existing 30-learner beta threshold shape.
- T5, the repeated strict 30-learner run, failed the same threshold shape on `/api/bootstrap` P95.
- Statement-log coverage was complete for the top-tail samples.
- Cloudflare invocation CPU/wall coverage was missing for all top-tail samples.
- The failure could not be responsibly attributed to D1, Worker CPU, payload size, platform/client overhead, launch variance, or policy.

That means P2 did the right thing by refusing to promote capacity and refusing to choose a speculative optimisation.

P3 exists because the next bottleneck is not yet code. The next bottleneck is the missing telemetry layer that prevents a safe code decision.

---

## 2. Current evidence baseline

P3 starts from the following locked baseline.

### 2.1 Strict 30 T1 — passed once, not certifying alone

`reports/capacity/evidence/2026-04-29-p2-t1-strict-post-p1.json`

| Metric | Value |
| --- | ---: |
| Learners | 30 |
| Bootstrap burst | 20 |
| Rounds | 1 |
| Total requests | 170 |
| Bootstrap P50 | 204.1 ms |
| Bootstrap P95 | 814.6 ms |
| Bootstrap max | 818.2 ms |
| Command P95 | 309.7 ms |
| Max response bytes | 29,588 |
| 5xx | 0 |
| Network failures | 0 |
| Hard capacity signals | 0 |
| Bootstrap query count P95/max | 11 / 11 |
| Bootstrap D1 rows read P95/max | 9 / 9 |
| Bootstrap D1 rows written P95/max | 0 / 0 |

Interpretation: useful positive evidence that the post-P1 system can pass the strict shape once. Not sufficient for certification because repeat evidence failed.

### 2.2 Strict 30 T5 — failed repeat, decisive for current status

`reports/capacity/evidence/2026-04-29-p2-t5-strict-repeat-1.json`

| Metric | Value |
| --- | ---: |
| Learners | 30 |
| Bootstrap burst | 20 |
| Rounds | 1 |
| Total requests | 170 |
| Bootstrap P50 | 233.8 ms |
| Bootstrap P95 | 1,354.5 ms |
| Bootstrap max | 2,062.2 ms |
| Command P95 | 418.0 ms |
| Max response bytes | 29,589 |
| 5xx | 0 |
| Network failures | 0 |
| Hard capacity signals | 0 |
| Bootstrap query count P95/max | 11 / 11 |
| Bootstrap D1 rows read P95/max | 9 / 9 |
| Bootstrap D1 rows written P95/max | 0 / 0 |
| Failed threshold | `maxBootstrapP95Ms` |

Interpretation: this blocks 30-learner beta certification. The failure is concentrated in bootstrap P95 wall time, not query fan-out, response size, hard signals, 5xx, or command latency.

### 2.3 Tail-correlation state

| Run | Top-tail invocation CPU/wall matches | Statement-log matches | Classification |
| --- | ---: | ---: | --- |
| T1 | 0/10 | 10/10 | `unclassified-insufficient-logs` |
| T5 | 0/10 | 10/10 | `unclassified-insufficient-logs` |

Interpretation: statement logs can prove the query shape was bounded, but they cannot prove whether the failed repeat was D1 dominated, Worker CPU dominated, payload dominated, client/platform overhead, or mixed.

### 2.4 1000-learner modelling state

`reports/capacity/latest-1000-learner-budget.json` is modelling-only and non-certifying.

Current ledger signals:

- Worker CPU is unknown because no joined invocation CPU telemetry exists.
- 1000-learner optimistic mode is already red on D1 rows written.
- 1000-learner expected mode is red on D1 rows read and D1 rows written.
- 1000-learner pessimistic mode is red on Worker requests, D1 rows read, and D1 rows written.
- Parent/admin route costs are still represented as missing measured route costs.

Interpretation: the lighthouse target remains valid as an ambition, but the current route cannot claim it. P3 must not pretend that a 30-learner telemetry repair solves the 1000-learner economics.

---

## 3. Product contract

### 3.1 Public capacity wording

P3 starts with public capacity status unchanged:

> `small-pilot-provisional`

Do not promote the 30-learner classroom beta status unless all P3 certification criteria pass.

Do not use any of the following as certification evidence on their own:

- a single passing strict run;
- a reduced-burst run;
- a warm-up run;
- a manifest/setup run;
- a Worker-log join file;
- a statement-map file;
- a 1000-learner ledger;
- a local test pass;
- a diagnostic-only artefact.

### 3.2 What product can expect from P3

By the end of P3, product should have one of these outcomes:

| Outcome | Meaning | Product action |
| --- | --- | --- |
| `strict-30-certified-candidate` | Repeated strict runs pass, verifier passes, CPU/wall join is present, and no hidden warning remains. | Prepare a separate capacity-status update for 30-learner beta, with evidence table review. |
| `strict-30-still-blocked-classified` | Strict repeat still fails, but top-tail cause is classified. | Keep public wording unchanged; approve the targeted Phase 4 mitigation. |
| `strict-30-still-blocked-unclassified` | Strict repeat still fails and telemetry is still incomplete. | Keep public wording unchanged; do not approve performance optimisation yet. |
| `telemetry-repair-failed` | Machine-joinable invocation logs cannot be captured reliably. | Keep public wording unchanged; decide whether an alternative observability path is required. |

### 3.3 Learner and adult UX

P3 should have no learner-facing UX change.

P3 may update Admin / Operations evidence wording only to prevent false promotion, clarify diagnostic status, or expose the presence/absence of invocation CPU/wall evidence.

P3 must not add Hero Mode, coins, reward changes, subject content changes, or new practice flows.

---

## 4. Engineering contract

P3 engineers must preserve the following boundaries.

### 4.1 Evidence before mitigation

No D1/index work, Worker CPU optimisation, payload trimming, launch warm-up policy, cache policy, or threshold change should be merged before P3 produces a classified top-tail result or explicitly exits as telemetry-repair-failed.

### 4.2 Redaction boundary

Committed artefacts must continue to persist only opaque request and statement identifiers:

- `req_<hash>` for request IDs;
- `stmt_<hash>` for statement IDs;
- no raw `ks2_req_*` IDs;
- no raw SQL text;
- no table/column names in public diagnostic artefacts unless explicitly allowed by a reviewed operations-only artefact;
- no cookies, bearer tokens, OAuth tokens, learner names, answers, prompts, request bodies, or response bodies.

Raw tail exports must remain local/operator-held and out of git.

### 4.3 Certification boundary

`diagnostics.workerLogJoin` remains diagnostic-only. It can explain a run. It cannot promote a run.

Capacity promotion still comes from strict verifier-backed capacity evidence, not from log joins.

### 4.4 ZIP/local validation boundary

Lean ZIP validation is useful for code and artefact review, but it cannot certify production capacity. Production capacity certification still requires production-origin evidence and the committed verifier path.

### 4.5 Cloudflare telemetry boundary

P3 must distinguish at least four time surfaces:

| Surface | Meaning | Source |
| --- | --- | --- |
| Client wall time | What the load driver observes. | Capacity run measurement. |
| App/server wall time | What the Worker app records inside `meta.capacity` / `capacity.request`. | `CapacityCollector`. |
| Cloudflare invocation wall time | What Cloudflare reports for the Worker invocation. | Workers Logs / Tail / Trace / Logpush-style export. |
| Cloudflare invocation CPU time | Actual Worker CPU budget pressure. | Workers Logs / Tail / Trace / Logpush-style export. |

Do not infer CPU from wall time.

---

## 5. Non-goals

P3 is intentionally narrow.

Out of scope:

- no 60-learner certification;
- no 100, 300, or 1000 learner certification;
- no threshold relaxation;
- no paid-tier migration decision;
- no broad bootstrap redesign;
- no D1 index migration unless P3 is already exiting and opening a follow-up mitigation phase;
- no command write-amplification reduction;
- no Hero Mode or Hero economy work;
- no subject learning-engine changes;
- no browser-owned production writes;
- no removal of sibling learner state from bootstrap;
- no hiding writable learners to improve numbers;
- no weakening of not-modified revision invalidation;
- no use of warm-up evidence as a certification shortcut.

---

## 6. Work units

## P3-U0 — Baseline lock and report verification

### Purpose

Confirm that the P3 team is starting from the same truth as P2, and prevent any accidental reinterpretation of P2 as a capacity pass.

### Tasks

1. Read and quote the final decision from `sys-hardening-optimisation-p2-completion-report.md`.
2. Confirm the lean ZIP or repository snapshot contains the P2 evidence files listed in this contract.
3. Run the evidence verifier.
4. Run the focused capacity script tests.
5. Record whether the working tree is a full git clone or a lean ZIP without `.git`.
6. Create a P3 baseline note:
   - suggested path: `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3-baseline.md`.

### Suggested commands

```sh
CAPACITY_VERIFY_SKIP_ANCESTRY=1 npm run capacity:verify-evidence
node --test \
  tests/capacity-scripts.test.js \
  tests/capacity-worker-log-join.test.js \
  tests/capacity-evidence.test.js \
  tests/capacity-statement-map.test.js \
  tests/generate-evidence-summary.test.js \
  tests/verify-capacity-evidence.test.js
```

Use `CAPACITY_VERIFY_SKIP_ANCESTRY=1` only in ZIP/shallow contexts where `.git` ancestry is unavailable. Do not use it to bypass full-clone provenance checks.

### Acceptance criteria

- P2 T5 remains the current strict 30 decision row.
- Public status remains `small-pilot-provisional`.
- The verifier passes in the appropriate local context.
- Focused capacity tests pass.
- The baseline explicitly states that P3 is not starting from a certified 30-learner state.

---

## P3-U1 — Machine-joinable invocation capture repair

### Purpose

Fix the missing part of P2: Cloudflare invocation CPU/wall logs for top-tail bootstrap requests.

P2 showed that pretty-tail logs produced complete statement-log matches but no invocation CPU/wall matches. P3 must produce a capture route that the join script can parse reliably.

### Tasks

1. Document the exact supported capture source for P3:
   - `npm run ops:tail:json`, if it emits machine-joinable records with CPU/wall fields;
   - Workers Logs export;
   - Tail Worker export;
   - Logpush/Trace-style JSONL export;
   - another operator-approved source with explicit schema examples.
2. Create a small fixture from the chosen export shape with all sensitive fields removed.
3. Add parser coverage for that exact shape in `tests/capacity-worker-log-join.test.js`.
4. Ensure the parser records invocation coverage separately from statement-log coverage.
5. Ensure a partial invocation record, such as CPU present but wall missing, is classified as partial and non-certifying.
6. Ensure null CPU/wall remains non-finite and never becomes zero.
7. Ensure malformed pretty lines produce warnings, not silent success.
8. Add a runbook section to `docs/operations/capacity-cpu-d1-evidence.md` or `docs/operations/capacity-tail-latency.md`.

### Suggested implementation pattern

Prefer a dedicated capture/runbook path rather than ad-hoc terminal copy-paste.

Possible command pattern:

```sh
npm run ops:tail:json > /tmp/ks2-p3-worker-tail.jsonl
```

Then join:

```sh
node ./scripts/join-capacity-worker-logs.mjs \
  --evidence reports/capacity/evidence/<date>-p3-t1-strict.json \
  --logs /tmp/ks2-p3-worker-tail.jsonl \
  --output reports/capacity/evidence/<date>-p3-t1-tail-correlation.json
```

If the chosen Cloudflare export cannot include CPU/wall, the runbook must say so clearly and P3 must exit through `telemetry-repair-failed` rather than pretending the evidence is sufficient.

### Acceptance criteria

- A fixture proves the chosen export shape can produce matched `cpuTimeMs` and `wallTimeMs` in `diagnostics.workerLogJoin`.
- Parser tests cover the chosen export shape.
- Null, missing, string-garbage, and partial CPU/wall data fail closed.
- The runbook has one canonical capture command/path for P3 operators.
- Raw logs remain out of git.

---

## P3-U2 — Request-id pairing and capture-window discipline

### Purpose

Ensure top-tail request IDs from the strict run can actually be paired with the raw operator-held invocation logs.

The hard part is not only parsing logs. It is capturing the right log window, preserving request IDs locally long enough to join them, and committing only redacted artefacts.

### Tasks

1. Define the capture sequence precisely:
   - start bounded tail/log capture;
   - run strict evidence with a unique output path;
   - stop capture;
   - join logs against evidence;
   - commit only redacted join output, not raw logs.
2. Add an operator checklist that records:
   - timestamp start/end;
   - origin;
   - config path;
   - learners;
   - bootstrap burst;
   - rounds;
   - output evidence path;
   - raw log path kept locally;
   - joined artefact path;
   - whether invocation coverage reached the target.
3. Ensure the load driver persists top-tail request IDs even when full request samples are bounded.
4. Ensure the join script can match raw logs against redacted persisted evidence IDs.
5. Add a warning if log timestamps do not overlap the capacity run window.
6. Add a warning if all statement logs match but all invocation logs are missing; this is exactly the P2 failure shape.

### Acceptance criteria

- The P3 runbook makes it difficult to capture the wrong time window.
- Joined output records invocation coverage and statement coverage separately.
- Coverage warnings are machine-readable.
- Committed artefacts contain only opaque identifiers.

---

## P3-U3 — Strict 30 rerun with telemetry present

### Purpose

Rerun the strict 30 evidence gate only after the invocation capture path is proven against fixtures or a small non-certifying smoke capture.

### Required runs

| Run | Shape | Certification role | Required output |
| --- | --- | --- | --- |
| P3-T0 smoke join | Small bounded diagnostic run or fixture-backed operator capture. | Non-certifying. | Evidence, raw local log, redacted join output. |
| P3-T1 strict 30 | Existing `30-learner-beta.json` shape. | Certification candidate if verifier passes. | Capacity evidence, join, statement map. |
| P3-T5 strict repeat 1 | Same as P3-T1, unique output path. | Must pass independently. | Capacity evidence, join, statement map. |
| P3-T5 strict repeat 2 | Same as P3-T1, unique output path. | Confidence repeat. | Capacity evidence, join, statement map. |
| P3-T3 reduced burst | Reduced burst diagnostic only if T1/T5 fail or are variable. | Diagnostic only. | Capacity evidence, join, statement map. |

### Strict run command shape

Use the existing release-gate config. Do not create a softer config for certification.

```sh
npm run capacity:classroom -- \
  --origin https://ks2.eugnel.uk \
  --config reports/capacity/configs/30-learner-beta.json \
  --output reports/capacity/evidence/<date>-p3-t1-strict.json
```

The exact command may differ if the current operations doc specifies additional flags. The invariant is that the strict run uses the pinned 30-learner beta config and a unique output path.

### Acceptance criteria

- Each strict run has a unique evidence file.
- Each strict run has a redacted tail-correlation artefact.
- Each strict run has a statement map.
- At least the top 10 bootstrap samples have invocation coverage, or the run is marked telemetry-incomplete.
- The evidence verifier passes for any run considered certification-eligible.
- A failing repeat blocks certification even if an earlier strict run passed.

---

## P3-U4 — Top-tail classification and decision matrix

### Purpose

Turn telemetry into a decision.

### Classification vocabulary

P3 should classify each top-tail bootstrap sample into one of these states:

| Classification | Evidence pattern | Follow-up |
| --- | --- | --- |
| `d1-dominated` | D1 duration is a large share of joined Worker wall time. | Phase 4 should target statement/query shape, query-plan evidence, cache contract, or D1 pressure. |
| `worker-cpu-dominated` | CPU is near budget or dominates Worker wall time. | Phase 4 should target JSON construction, response rewrite, object churn, phase timings, or subject/runtime CPU. |
| `payload-size-pressure` | Response bytes are high enough to explain material wall/CPU pressure. | Phase 4 should reduce envelope size or cache/not-modified behaviour. |
| `client-network-or-platform-overhead` | Client wall materially exceeds Worker wall without app/D1 pressure. | Phase 4 should be operational/policy or load-driver investigation, not code optimisation. |
| `mixed-no-single-dominant-resource` | Several resources contribute, none dominates. | Phase 4 should choose the least risky bounded mitigation and repeat evidence. |
| `partial-invocation-only` | Invocation CPU/wall exists but statement logs are absent. | Enough to rule in/out CPU pressure; not enough for D1 query work. |
| `unclassified-insufficient-logs` | CPU/wall or required logs are missing. | Do not optimise; repair telemetry first. |

### Decision rules

| Evidence outcome | P3 decision |
| --- | --- |
| All strict repeats pass, CPU/wall joined, verifier passes, no hard signals | Open a separate 30-learner capacity-status PR. |
| Any strict repeat fails and classification is `d1-dominated` | P4 should be a D1/query/cache mitigation phase. |
| Any strict repeat fails and classification is `worker-cpu-dominated` | P4 should be a Worker CPU/JSON/response construction phase. |
| Any strict repeat fails and classification is `client-network-or-platform-overhead` | P4 should be operations/load-driver/platform-tail investigation, not app code. |
| Any strict repeat fails and classification remains `unclassified-insufficient-logs` | P4 must remain observability-focused. |
| Strict evidence passes but 1000 ledger remains red | Do not infer 1000 readiness; proceed to write/read economics later. |

### Acceptance criteria

- A classification table exists for P3-T1 and every P3-T5 run.
- The table includes client wall, app/server wall, Worker wall, Worker CPU, D1 duration, query count, D1 rows read/written, response bytes, and classification reason.
- The decision record names exactly one recommended next mitigation phase.
- Rejected alternatives are documented.

---

## P3-U5 — Admin/Operations evidence truth update

### Purpose

Keep operators and internal users from misreading diagnostic artefacts as capacity promotion.

### Tasks

1. Update `docs/operations/capacity.md` with the P3 decision row.
2. Update `docs/operations/capacity-tail-latency.md` with the P3 capture outcome.
3. Update `docs/operations/capacity-cpu-d1-evidence.md` with the canonical capture and join runbook.
4. Ensure Admin Production Evidence summary remains fail-closed unless the strict evidence gate passes.
5. Ensure diagnostic-only artefacts are labelled as diagnostic-only in generated summaries.
6. Keep 1000-learner ledger modelling-only.

### Acceptance criteria

- The current capacity status cannot be accidentally inferred from T1 alone.
- T5/repeat evidence remains visible.
- Missing invocation telemetry is not hidden.
- Any certified status has direct verifier-backed evidence.

---

## P3-U6 — Completion report and next-phase handoff

### Purpose

End P3 with a precise handoff, not a vague “more optimisation needed”.

### Required completion report path

```text
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3-completion-report.md
```

### Required sections

The completion report must include:

1. Executive summary.
2. Completion boundary.
3. ZIP/local validation boundary, if applicable.
4. Evidence inventory.
5. Strict run table.
6. Tail-correlation coverage table.
7. Top-tail classification table.
8. Certification decision.
9. 1000-learner budget interpretation.
10. Review findings closed.
11. Validation commands and results.
12. Residual blockers.
13. Recommended Phase 4.
14. Final decision.

### Acceptance criteria

- The report does not use “complete” to imply certification unless certification actually passed.
- The report uses exact evidence file names.
- The report gives the public capacity wording explicitly.
- The report says which Phase 4 path is recommended.

---

## 7. Certification gate for P3

P3 may recommend a 30-learner capacity-status update only if all of the following are true:

1. P3-T1 strict 30 passes.
2. P3-T5 strict repeat 1 passes.
3. P3-T5 strict repeat 2 passes, or a written policy explains why exactly one repeat is sufficient.
4. `npm run capacity:verify-evidence` passes in a full clone without bypass for certifying rows.
5. Bootstrap P95 is below the existing gate on every strict run used for certification.
6. Command P95 is below the existing gate.
7. 5xx, network failures, and hard capacity signals are zero where the config requires zero.
8. Bootstrap capacity meta is present and valid.
9. Invocation CPU/wall telemetry is joined for the retained top-tail bootstrap samples, or a formal policy accepts the risk. The preferred bar is joined telemetry, not policy waiver.
10. Statement-map coverage is complete or the completion report explicitly says query-plan work is unsupported.
11. Admin/Operations evidence remains fail-closed unless the capacity row is backed by verified evidence.
12. Public wording is updated only through a separate, reviewed capacity-status change.

If any strict repeat fails, certification remains blocked.

---

## 8. Expected artefacts

| Artefact | Suggested path | Certifying? |
| --- | --- | --- |
| P3 baseline | `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3-baseline.md` | No |
| CPU/D1 capture runbook update | `docs/operations/capacity-cpu-d1-evidence.md` | No |
| Tail-latency matrix update | `docs/operations/capacity-tail-latency.md` | No |
| P3-T0 smoke evidence | `reports/capacity/evidence/<date>-p3-t0-smoke.json` | No |
| P3-T1 strict evidence | `reports/capacity/evidence/<date>-p3-t1-strict.json` | Candidate only if verifier passes |
| P3-T5 strict repeat evidence | `reports/capacity/evidence/<date>-p3-t5-strict-r1.json` and `...r2.json` | Candidate only if each verifier pass |
| P3 tail correlations | `reports/capacity/evidence/<date>-p3-*-tail-correlation.json` | No, diagnostic |
| P3 statement maps | `reports/capacity/evidence/<date>-p3-*-statement-map.json` | No, diagnostic |
| P3 classification | `reports/capacity/evidence/<date>-p3-tail-classification.md` | No |
| Refreshed evidence summary | `reports/capacity/latest-evidence-summary.json` | Summary only |
| Refreshed budget ledger | `reports/capacity/latest-1000-learner-budget.json` | No, modelling |
| P3 completion report | `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3-completion-report.md` | No, unless it cites verified certification evidence |

---

## 9. Validation commands

Minimum local validation for the P3 implementation branch:

```sh
node --test \
  tests/capacity-scripts.test.js \
  tests/capacity-worker-log-join.test.js \
  tests/capacity-evidence.test.js \
  tests/capacity-statement-map.test.js \
  tests/generate-evidence-summary.test.js \
  tests/verify-capacity-evidence.test.js

npm run capacity:verify-evidence
npm run check
git diff --check
```

If running from a lean ZIP without `.git`, record the limitation and use:

```sh
CAPACITY_VERIFY_SKIP_ANCESTRY=1 npm run capacity:verify-evidence
```

Do not use the ZIP-safe bypass in a full clone for certifying evidence.

Recommended privacy scans before committing artefacts:

```sh
grep -R "ks2_req_" reports/capacity/evidence docs/operations docs/plans/james/sys-hardening/A || true
grep -R "CLOUDFLARE_API_TOKEN\|ks2_session\|Bearer " reports/capacity/evidence docs/operations docs/plans/james/sys-hardening/A || true
```

The expected result for committed evidence/docs is no raw secrets and no raw request IDs.

---

## 10. Risks and guardrails

### Risk: another single passing strict run tempts a false promotion

Guardrail: P3 requires repeated strict evidence. A single pass is useful but not enough.

### Risk: statement-map completeness is mistaken for CPU attribution

Guardrail: statement coverage and invocation CPU/wall coverage are reported separately.

### Risk: pretty logs keep looking “mostly useful” whilst missing CPU/wall

Guardrail: the canonical P3 capture path must prove machine-joinable CPU/wall before strict reruns are used for decision-making.

### Risk: request IDs or SQL leak through diagnostic artefacts

Guardrail: committed files use opaque `req_` and `stmt_` identifiers only. Raw logs stay local.

### Risk: bootstrap tail is platform/client overhead, but engineers optimise D1 or JSON anyway

Guardrail: P3 decision matrix blocks code mitigation unless classification supports it.

### Risk: 30-learner work distracts from the 1000-learner budget problem

Guardrail: the P3 completion report must refresh and restate the 1000-learner ledger as modelling-only. Passing 30 learners does not imply lighthouse readiness.

---

## 11. Phase 4 options opened by P3

P3 should hand off exactly one recommended Phase 4 path.

| P3 result | Recommended Phase 4 |
| --- | --- |
| Strict 30 passes repeatedly with joined CPU/wall | Phase 4A — Capacity status update and 60-learner diagnostic attempt. |
| Bootstrap tail is D1 dominated | Phase 4B — Bootstrap D1/query/cache reduction. |
| Bootstrap tail is Worker CPU dominated | Phase 4C — Worker CPU and JSON response construction optimisation. |
| Bootstrap tail is client/network/platform overhead | Phase 4D — Launch policy, load-driver, and platform-tail investigation. |
| Bootstrap tail remains unclassified | Phase 4E — Observability repair continuation; no performance code. |
| 30 passes but 1000 ledger remains red on writes/reads | Phase 4F — Command/read/write unit-economics planning, not 1000 certification. |

This keeps the route on track without pretending the route is linear. P2 exposed an evidence gap. P3 must close that gap before the next technical branch is chosen.

---

## 12. Final P3 definition of done

P3 is done when one of these is true:

1. Repeated strict 30 evidence passes and the completion report recommends a separate, reviewed capacity-status update.
2. Repeated strict 30 evidence fails, but the failed top-tail samples are classified strongly enough to choose a specific Phase 4 mitigation.
3. Invocation telemetry cannot be captured reliably, and the completion report explicitly exits as `telemetry-repair-failed` with no capacity promotion and no speculative optimisation.

Any other ending is incomplete.

