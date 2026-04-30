---
title: "System Hardening Optimisation P4 — Capacity Status Governance and 60-Learner Diagnostic"
type: product-engineering-contract
status: proposed
language: en-GB
date: 2026-04-30
route: system-hardening-and-optimisation
owner: james / engineering agent
source_boundary:
  primary: "uploaded lean ZIP ks2-mastery-lean-04300905.zip"
  supplementary: "GitHub PR #723 and exact-file main fetch for P3 completion report"
  production: "only the committed production-origin evidence artefacts supplied in the ZIP; no fresh live production run performed by this review"
source_contracts:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3.md
source_reports:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3-baseline.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3-telemetry-gate-completion-report.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3-completion-report.md
source_operations:
  - docs/operations/capacity.md
  - docs/operations/capacity-cpu-d1-evidence.md
  - docs/operations/capacity-tail-latency.md
  - docs/operations/capacity-1000-learner-free-tier-budget.md
source_evidence:
  - reports/capacity/evidence/2026-04-30-p3-t0-smoke.json
  - reports/capacity/evidence/2026-04-30-p3-t0-smoke-tail-correlation.json
  - reports/capacity/evidence/2026-04-30-p3-t1-strict.json
  - reports/capacity/evidence/2026-04-30-p3-t1-tail-correlation.json
  - reports/capacity/evidence/2026-04-30-p3-t1-statement-map.json
  - reports/capacity/evidence/2026-04-30-p3-t5-strict-r1.json
  - reports/capacity/evidence/2026-04-30-p3-t5-strict-r1-tail-correlation.json
  - reports/capacity/evidence/2026-04-30-p3-t5-strict-r1-statement-map.json
  - reports/capacity/evidence/2026-04-30-p3-t5-strict-r2.json
  - reports/capacity/evidence/2026-04-30-p3-t5-strict-r2-tail-correlation.json
  - reports/capacity/evidence/2026-04-30-p3-t5-strict-r2-statement-map.json
  - reports/capacity/evidence/2026-04-30-p3-tail-classification.md
  - reports/capacity/latest-evidence-summary.json
  - reports/capacity/latest-1000-learner-budget.json
---

# System Hardening Optimisation P4 — Capacity Status Governance and 60-Learner Diagnostic

## 0. One-sentence contract

P4 converts P3's repeated strict 30-learner production evidence into a reviewed capacity-status change, then runs a telemetry-complete 60-learner diagnostic to decide the next real bottleneck without jumping to 1000-learner claims or speculative optimisation.

P4 is a governance and diagnostic phase. It is not a broad performance rewrite.

---

## 1. Why P4 exists

P3 closed the original telemetry gap. The system now has repeated strict 30-learner production evidence with machine-joinable Cloudflare invocation CPU/wall telemetry and complete sampled statement-log coverage for retained top-tail bootstrap samples.

The P3 terminal outcome is:

```text
strict-30-certified-candidate
```

That wording is deliberately precise. P3 supports a 30-learner certification candidate, but it did not itself update public or Admin capacity status. The current generated latest evidence summary still marks the P3 terminal row as non-certifying because the selected P3 row has not yet been added to the reviewed capacity evidence table.

P4 exists to complete that governance step before anyone treats the product as having a stronger public capacity claim.

The second reason P4 exists is that 60 learners remain unproven. The latest committed 60-learner stretch preflight reached application load but failed the stricter bootstrap P95 gate: 854.0 ms against the 750 ms ceiling. That evidence is useful, but it predates the final P3 invocation telemetry repair and does not settle the post-P3 60-learner shape.

The third reason P4 exists is the lighthouse constraint. The 1000-learner budget remains modelling-only and still shows major red or unknown surfaces, especially D1 rows written and missing measured route costs. P4 should keep that truth visible but must not attempt to solve the 1000-learner economy before the 30/60 evidence ladder is clean.

---

## 2. Source and evidence boundary

P4 must keep evidence layers separate:

| Layer | Meaning in P4 | Use |
| --- | --- | --- |
| Lean ZIP | The uploaded review snapshot. | Primary source for files, reports, scripts, committed evidence, and local checks. |
| GitHub main / PR metadata | Supplementary exact-file and merge-state confirmation. | Used to confirm the P3 completion report and PR #723 state, not to override ZIP content silently. |
| Local run | Behaviour in this extracted ZIP environment. | Useful for verifier and focused tests, but not production certification. |
| Production evidence | Committed production-origin capacity JSON and tail joins. | The only evidence layer relevant to learner-capacity claims. |

A lean ZIP can review source and evidence shape. It cannot by itself prove fresh live production readiness. P4 must preserve that distinction in all reports.

---

## 3. Current evidence baseline

P4 starts from the following locked truth.

### 3.1 P2 truth preserved

P2 remains historically important because it explains why P3 existed.

| Run | Result | Bootstrap P95 | Bootstrap max | Command P95 | Interpretation |
| --- | --- | ---: | ---: | ---: | --- |
| P2 T1 strict post-P1 | Pass | 814.6 ms | 818.2 ms | 309.7 ms | Positive single-run evidence only. |
| P2 T5 strict repeat 1 | Fail | 1,354.5 ms | 2,062.2 ms | 418.0 ms | Failed repeat; blocked certification before P3. |

P2 top-tail statement logs were complete, but invocation CPU/wall coverage was 0/10 for both retained strict samples. That gap is now repaired by P3.

### 3.2 P3 strict 30 evidence

All strict P3 runs used production origin, demo sessions, 30 virtual learners, bootstrap burst 20, one command round, and the pinned `reports/capacity/configs/30-learner-beta.json` threshold config.

| Run | Evidence commit | Total requests | Bootstrap P95 | Bootstrap max | Command P95 | Max response bytes | Threshold result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| P3-T1 strict | `fe8d500` | 170 | 701.3 ms | 703.7 ms | 292.7 ms | 29,597 B | Pass |
| P3-T5 repeat 1 | `3c4b4a5` | 170 | 661.4 ms | 664.3 ms | 319.2 ms | 29,596 B | Pass |
| P3-T5 repeat 2 | `b469e58` | 170 | 715.2 ms | 719.0 ms | 279.7 ms | 29,597 B | Pass |

Each strict run had:

- 0 5xx;
- 0 network failures;
- 0 hard capacity signals;
- bootstrap query count 11;
- bootstrap D1 rows read 9;
- bootstrap D1 rows written 0;
- 10/10 retained top-tail invocation CPU/wall coverage;
- 10/10 retained top-tail statement-log coverage;
- 0 join warnings.

### 3.3 P3 retained top-tail classification

Across 30 retained strict-run bootstrap top-tail samples:

| Classification | Samples | P4 interpretation |
| --- | ---: | --- |
| `d1-dominated` | 24/30 | D1 duration was usually the largest diagnostic share, but the strict 30 gate still passed. Do not optimise D1 merely because this label appears. |
| `worker-cpu-dominated` | 3/30 | Worker CPU was visible but not a repeated 30-learner blocker. |
| `client-network-or-platform-overhead` | 3/30 | Some client/platform gap remained, but not enough to fail the strict 30 gate. |

This classification informs P4, but it does not authorise a D1/index/cache PR on its own. P4 must first complete status governance and then collect post-P3 60-learner evidence.

### 3.4 Current latest summary boundary

`reports/capacity/latest-evidence-summary.json` currently keeps the P3 terminal row fail-closed as:

```text
evidence-not-in-verified-capacity-table
```

That is the correct current state. The status should change only after a separate reviewed capacity-status PR adds the selected P3 terminal row to the verified capacity table and regenerates the latest summary.

### 3.5 1000-learner modelling boundary

`reports/capacity/latest-1000-learner-budget.json` remains:

```text
modellingOnly: true
certifying: false
```

For the 1000-learner expected scenario, the current ledger estimates:

| Resource | Daily estimate | Free-tier limit in ledger | Status |
| --- | ---: | ---: | --- |
| Dynamic requests | 36,015 | 100,000 | Green at 36.02% |
| D1 rows read | 825,300 | 5,000,000 | Unknown lower-bound at 16.51% |
| D1 rows written | 1,008,000 | 100,000 | Red at 1,008% |

For the 1000-learner pessimistic scenario, dynamic requests, D1 rows read, and D1 rows written are all red or above the route policy threshold. Worker CPU remains unknown in the ledger because the route-cost model has not yet integrated joined CPU telemetry and still lacks parent/admin measured route costs.

P4 must preserve this boundary. A 30-learner status update does not reduce the 1000-learner write-amplification problem.

---

## 4. Product contract

### 4.1 What product can expect from P4

By the end of P4, product should have one of these outcomes:

| Outcome | Meaning | Product action |
| --- | --- | --- |
| `30-learner-beta-promoted-60-diagnostic-complete` | The P3 terminal row was reviewed/promoted, and a post-P3 60-learner diagnostic ran with joined telemetry. | Communicate 30-learner beta support only; use the 60 diagnostic to choose P5. |
| `30-learner-beta-promoted-60-diagnostic-blocked` | 30 status was promoted, but 60 learner setup or telemetry failed. | Keep 60+ unclaimed; fix diagnostic infrastructure next. |
| `30-status-promotion-blocked` | The P3 terminal row did not survive verifier/Admin/status review. | Keep public status unchanged; fix the status evidence path before any larger diagnostic. |
| `60-learner-classified-failure` | 60 learner diagnostic failed, but the top-tail cause is classified. | Approve a targeted P5 mitigation. |
| `60-learner-unclassified-failure` | 60 learner diagnostic failed and telemetry was incomplete. | Do not optimise; repair observability or setup first. |
| `60-learner-positive-diagnostic` | 60 learner diagnostic passed or stayed within agreed diagnostic bounds. | Plan repeat/certification policy before any public 60 learner claim. |

The preferred P4 outcome is `30-learner-beta-promoted-60-diagnostic-complete`. That does not mean 60 learners are certified.

### 4.2 Public wording

P4 may recommend a public/Admin status move from:

```text
small-pilot-provisional
```

to:

```text
30-learner-beta-certified
```

only after the reviewed capacity-status PR passes. The status PR must use P3-T5 repeat 2, or a stronger reviewed strict 30 row, as the promoted evidence row.

P4 must not use any of the following wording:

- 60-learner certified;
- 100+ ready;
- 300 ready;
- 1000 ready;
- free-tier lighthouse proven;
- D1 bottleneck solved;
- Worker CPU safe for all routes.

### 4.3 Learner and adult UX

P4 should have no learner-facing UX change.

Admin/Operations may change only to reflect verified capacity status and to keep diagnostic evidence fail-closed. No Hero Mode, coins, subject content, Stars, reward, or practice-flow changes belong in P4.

---

## 5. Engineering contract

### 5.1 Governance before diagnostics

P4 must complete the 30-learner status governance step before treating 60-learner diagnostics as the next route truth. Do not run from P3 directly into 1000-learner work.

### 5.2 Diagnostics before mitigation

No D1/index work, Worker CPU optimisation, payload trimming, cache rewrite, command batching, or threshold change should be merged in P4 unless the 60-learner diagnostic produces a classified result and the P4 decision record explicitly selects that mitigation path.

P4 can prepare a decision record. It should not implement the larger mitigation unless that work is explicitly scoped as a separate Phase 5 plan.

### 5.3 Diagnostic joins remain diagnostic-only

`diagnostics.workerLogJoin` can explain a run. It cannot certify a run by itself.

The certification source remains the verified capacity evidence table plus the generated latest evidence summary.

### 5.4 Raw log and redaction boundary

Raw Cloudflare Worker/Tail captures stay local/operator-held and outside git. Committed artefacts may include only redacted evidence, redacted tail-correlation output, redacted statement maps, and classification markdown.

Committed artefacts must not contain:

- raw `ks2_req_*` request IDs;
- cookies;
- bearer tokens;
- OAuth tokens;
- learner names;
- account identifiers;
- request bodies;
- response bodies;
- raw SQL text;
- table or column names in public diagnostic artefacts unless the artefact has explicit operations-only review.

### 5.5 No threshold relaxation

P4 must not relax the existing threshold configs to achieve a status promotion.

Current relevant gates:

| Tier | Bootstrap P95 | Command P95 | Max response bytes | 5xx | Signals | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 30 learner beta | 1,000 ms | 750 ms | 600,000 B | 0 | 0 | Existing strict gate used by P3. |
| 60 learner stretch | 750 ms | 400 ms | 600,000 B | 0 | 0 | Existing stretch/preflight gate; not yet certified. |

If P4 concludes a threshold is mis-specified, it must produce a separate policy review, not quietly change the config.

---

## 6. Phase units

## P4-U0 — Baseline lock

### Purpose

Record post-P3 truth before changing status tables or running new diagnostics.

### Tasks

1. Create `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-baseline.md`.
2. Record source boundary if the work starts from a lean ZIP, PR branch, or GitHub `main`.
3. Record current `main` commit.
4. Record P3 terminal evidence:
   - P3-T1 strict;
   - P3-T5 repeat 1;
   - P3-T5 repeat 2;
   - P3 tail classification;
   - latest evidence summary status.
5. Record current public/Admin status.
6. Record current 60-learner and 1000-learner non-claims.
7. Confirm `sys-hardening-optimisation-p3-telemetry-gate-completion-report.md` is superseded by the final P3 report and not treated as the terminal P3 state.

### Acceptance criteria

- P4 starts from `strict-30-certified-candidate`, not from public 30 certification.
- P4 records that `reports/capacity/latest-evidence-summary.json` is currently fail-closed for the P3 candidate.
- P4 records that 60+ and 1000 learners remain unverified.
- No mitigation path is selected in the baseline.

---

## P4-U1 — 30-learner capacity-status update

### Purpose

Convert the P3 terminal evidence into a reviewed status row, if the verifier and Admin summary agree.

### Tasks

1. Add a reviewed 30-learner beta evidence row to `docs/operations/capacity.md` using `reports/capacity/evidence/2026-04-30-p3-t5-strict-r2.json`, unless a stronger post-P3 strict repeat exists.
2. Set the row decision to `30-learner-beta-certified` only if the verifier accepts it.
3. Regenerate `reports/capacity/latest-evidence-summary.json`.
4. Verify Admin Production Evidence now reflects the intended 30-learner status.
5. Verify diagnostic-only `*-tail-correlation.json` artefacts cannot promote status independently.
6. Verify P2 failed evidence remains historical and does not override the reviewed P3 row after promotion.
7. Add a short status-change note or completion report:
   - suggested path: `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-capacity-status-report.md`.

### Acceptance criteria

- `npm run capacity:verify-evidence` passes in a full clone without ZIP ancestry bypass.
- `reports/capacity/latest-evidence-summary.json` promotes only through the verified row.
- Admin Production Evidence does not display certification from a diagnostic join alone.
- The status PR contains no runtime performance code changes.
- The public claim is limited to 30-learner beta.

### Rejection criteria

Reject the status PR if:

- P3-T5 repeat 2 cannot back the row under the verifier;
- the generated summary still reports `evidence-not-in-verified-capacity-table` for the selected row;
- Admin shows certification from diagnostic artefacts;
- any raw Worker/Tail capture is staged;
- any threshold config is changed in the same PR.

---

## P4-U2 — Admin and evidence fail-closed regression tests

### Purpose

Make the status promotion safe by proving that the Admin surface, generated summary, and verifier still separate strict evidence from diagnostics.

### Tasks

1. Add or update tests for:
   - promoted 30-learner beta row;
   - diagnostic worker-log join not certifying;
   - failed setup evidence not certifying;
   - P3-T0 smoke not certifying;
   - 60 preflight not certifying;
   - stale or missing latest summary not certifying;
   - setup-rate-limited evidence not overwriting a promoted row.
2. Re-run the Admin evidence model tests.
3. Re-run summary generation tests.
4. Re-run verifier tests.

### Acceptance criteria

- Admin status is positive only because the reviewed capacity table row is positive.
- Diagnostic files remain useful for explanation but cannot change the tier.
- The failure modes introduced during P1/P2/P3 remain covered.

---

## P4-U3 — 60-learner diagnostic preparation

### Purpose

Prepare a post-P3 60-learner diagnostic that reaches application load and keeps invocation telemetry complete.

### Tasks

1. Decide whether to use:
   - direct demo sessions with adequate spacing;
   - a session manifest with full rate-limit reset handling;
   - distributed or multi-IP generation if single-host setup remains rate-limited.
2. Record setup strategy and risks in `docs/operations/capacity-tail-latency.md` or a P4 operator checklist.
3. Start bounded raw JSON tail capture before the diagnostic run:

```sh
P4_RUN=2026-04-30-p4-60-diagnostic
RAW_LOG=/tmp/ks2-${P4_RUN}-worker-tail.jsonl
npm run ops:tail:json > "$RAW_LOG"
```

4. Run the 60 shape using the pinned 60 learner config where appropriate:

```sh
npm run capacity:classroom -- \
  --origin https://ks2.eugnel.uk \
  --demo-sessions \
  --learners 60 \
  --bootstrap-burst 20 \
  --rounds 1 \
  --config reports/capacity/configs/60-learner-stretch.json \
  --output reports/capacity/evidence/<date>-p4-60-diagnostic.json
```

If a session manifest is used, record that clearly and treat the run as diagnostic/preflight unless it also satisfies the certification policy.

5. Produce:
   - `*-tail-correlation.json`;
   - `*-statement-map.json`;
   - `*-tail-classification.md` or a P4 classification section.
6. Keep raw logs out of git.

### Acceptance criteria

- The run either reaches application load or fails with a named setup blocker.
- If it reaches application load, retained top-tail samples have invocation CPU/wall and statement coverage.
- Join warnings are either zero or explicitly classified.
- The result is not automatically treated as 60 certification.

---

## P4-U4 — 60-learner classification and decision record

### Purpose

Use the 60 diagnostic to choose the next engineering path.

### Classification labels

Use the existing P3/P4 classification vocabulary:

| Classification | Meaning | Likely next phase |
| --- | --- | --- |
| `d1-dominated` | D1 duration is the largest repeated top-tail share. | Phase 5A: bootstrap/D1 query-shape and cache contract. |
| `worker-cpu-dominated` | Worker CPU approaches budget or dominates Worker wall. | Phase 5B: JSON construction, response rewriting, and object-allocation reduction. |
| `client-network-or-platform-overhead` | Client wall materially exceeds Worker/D1 evidence. | Phase 5C: load-driver, platform-tail, deployment, warm-up, or operational policy investigation. |
| `query-fanout` | Query count or rows read grows with learner/session shape. | Phase 5A with query-budget ratchet. |
| `payload-bound` | Response bytes or serialisation dominates the tail. | Phase 5B with payload envelope reduction. |
| `write-amplification-bound` | D1 writes or command-derived writes are the first route-cost ceiling. | Phase 5D: command/write compaction and session batching design. |
| `unclassified-insufficient-logs` | Missing CPU/wall or statement coverage. | Observability repair continuation; no performance optimisation. |
| `setup-blocked` | Demo/session/rate-limit setup prevented application load. | Capacity harness repair. |

### Tasks

1. Write `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-decision-record.md`.
2. State one and only one recommended Phase 5 path.
3. Document rejected alternatives.
4. State whether 60 should be rerun, certified later, or held at diagnostic-only.
5. Record whether the 1000-learner budget should move next to write-amplification work or stay blocked by missing route costs.

### Acceptance criteria

- P4 ends with a single recommended next path.
- If 60 fails, the failure is not hidden behind a 30-learner status win.
- If 60 passes, the report still avoids 60 public certification unless the repeated certification policy is satisfied.
- If telemetry is incomplete, P4 exits through observability continuation rather than guessing.

---

## P4-U5 — 1000-learner budget refresh, not certification

### Purpose

Keep the lighthouse goal honest after P3/P4 evidence changes.

### Tasks

1. Rebuild `reports/capacity/latest-1000-learner-budget.json` after any status/diagnostic changes.
2. Integrate available P3/P4 CPU telemetry into route-cost inputs if the ledger supports it.
3. Keep unknown route costs visible, especially:
   - parent/admin route costs;
   - demo/session setup costs;
   - subject command write amplification;
   - Hero route costs, if Hero surfaces are included in future route-cost models.
4. Preserve `modellingOnly: true` and `certifying: false`.
5. Add a short P4 note to `docs/operations/capacity-1000-learner-free-tier-budget.md` if the first predicted failing resource changes.

### Acceptance criteria

- The 1000 ledger remains non-certifying.
- D1 rows written remain visible as the current expected-scenario red surface unless new measured evidence changes it.
- Worker CPU is no longer silently unknown if route-cost integration is completed; otherwise it stays explicitly unknown.
- The ledger cannot be used as a public learner-capacity claim.

---

## P4-U6 — Completion report and handoff

### Purpose

Close P4 without blurring capacity status, diagnostics, and future optimisation.

### Tasks

Create:

```text
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-completion-report.md
```

The report must include:

1. Source boundary.
2. P3 candidate row status.
3. Whether 30-learner beta was promoted.
4. 60 diagnostic result and classification.
5. Latest evidence summary state.
6. Admin Production Evidence state.
7. 1000 budget state.
8. Raw-log/redaction scan result.
9. Verifier/test results.
10. Recommended Phase 5 path.

### Acceptance criteria

- P4 has one terminal outcome.
- No public claim exceeds the verified tier.
- The next phase is chosen from evidence, not intuition.

---

## 7. Expected artefacts

| Artefact | Suggested path | Purpose |
| --- | --- | --- |
| P4 baseline | `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-baseline.md` | Locks post-P3 truth. |
| Capacity-status report | `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-capacity-status-report.md` | Records status promotion or block. |
| Updated capacity runbook | `docs/operations/capacity.md` | Adds reviewed P3 terminal row if accepted. |
| Regenerated latest summary | `reports/capacity/latest-evidence-summary.json` | Admin/public evidence source. |
| 60 diagnostic evidence | `reports/capacity/evidence/<date>-p4-60-diagnostic.json` | Post-P3 60 learner diagnostic. |
| 60 tail correlation | `reports/capacity/evidence/<date>-p4-60-tail-correlation.json` | CPU/wall and statement join. |
| 60 statement map | `reports/capacity/evidence/<date>-p4-60-statement-map.json` | Query/statement support. |
| P4 decision record | `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-decision-record.md` | Chooses Phase 5 path. |
| 1000 budget refresh | `reports/capacity/latest-1000-learner-budget.json` | Non-certifying free-tier model. |
| P4 completion report | `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-completion-report.md` | Final route handoff. |

---

## 8. Test and verification commands

In a full clone, use the normal verifier path without ZIP ancestry bypass:

```sh
npm run capacity:verify-evidence
node --test tests/capacity-worker-log-join.test.js tests/capacity-statement-map.test.js tests/capacity-raw-log-gitignore.test.js
node --test tests/capacity-evidence.test.js tests/generate-evidence-summary.test.js tests/verify-capacity-evidence.test.js
node --test tests/admin-production-evidence.test.js tests/react-admin-production-evidence.test.js
node --test tests/capacity-budget-ledger.test.js
npm run check
npm test
```

When validating from a lean ZIP without `.git`, it is acceptable to use:

```sh
CAPACITY_VERIFY_SKIP_ANCESTRY=1 npm run capacity:verify-evidence
```

That proves local evidence shape for the ZIP snapshot. It does not certify production or replace a full-clone verifier pass.

---

## 9. Non-goals

P4 must not include:

- Hero Mode work;
- new subject work;
- coin/reward/Stars changes;
- command batching implementation;
- D1 partitioning;
- Durable Object architecture;
- public 60/100/300/1000 learner claims;
- threshold relaxation;
- broad repository refactor;
- learner-facing UI changes;
- visual asset certification from a lean ZIP.

If P4 finds that D1, Worker CPU, payload, platform-tail, or write amplification is the next blocker, it should write a Phase 5 contract. It should not smuggle the mitigation into the diagnostic phase.

---

## 10. Exit states

| Exit state | Meaning | Next action |
| --- | --- | --- |
| `30-promoted-60-diagnostic-d1` | 30 beta promoted; 60 diagnostic points to D1. | P5A: D1/query/cache mitigation. |
| `30-promoted-60-diagnostic-cpu` | 30 beta promoted; 60 diagnostic points to Worker CPU. | P5B: Worker CPU/JSON/payload optimisation. |
| `30-promoted-60-diagnostic-platform` | 30 beta promoted; 60 diagnostic points to client/platform overhead. | P5C: operations/platform/load-driver investigation. |
| `30-promoted-60-diagnostic-write-economics` | 30 beta promoted; 60 ok/unclear but 1000 model remains write-red. | P5D: command write-amplification and session batching design. |
| `30-promoted-60-positive` | 30 beta promoted; 60 diagnostic positive. | Decide whether to run repeat 60 certification or move to unit economics. |
| `30-status-blocked` | P3 candidate row cannot be promoted safely. | Fix evidence/Admin/verifier path first. |
| `diagnostic-setup-blocked` | 60 setup does not reach application load. | Fix harness/session manifest/rate-limit setup. |
| `telemetry-regressed` | 60 run lacks invocation CPU/wall or statement coverage. | Observability continuation; no mitigation. |

---

## 11. Final principle

P4 should make one capacity claim stronger and one future decision clearer.

The stronger claim is the reviewed 30-learner beta status, if and only if the P3 terminal row survives the status PR.

The clearer decision is the next bottleneck beyond 30 learners, based on a post-P3 60-learner diagnostic with joined invocation CPU/wall telemetry.

Everything beyond that remains future work.


---

## 12. Platform references checked during review

P4 should treat the repository's committed budget ledger as the local planning source, but the platform assumptions should remain tied to the current Cloudflare references before any public capacity claim is widened.

Official references checked during this review:

- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Cloudflare Workers subrequest-limit changelog: https://developers.cloudflare.com/changelog/2026-02-11-subrequests-limit/

These references confirm the planning assumptions used by the current budget model: Workers Free daily request limits, the 10 ms CPU budget per HTTP request, D1 Free daily rows-read and rows-written limits, D1's per-invocation query/subrequest constraints, and the single-threaded per-database D1 throughput warning. Re-check them before Phase 5 if the route is delayed, because platform limits can change.
