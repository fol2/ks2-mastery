# System Hardening P6 — D1 Tail-Latency Mitigation, Classroom Certification, and Operations Handover

Status: proposed contract for the next implementation agent  
Owner intent: close the remaining production-readiness gap honestly; do not turn P6 into a broad feature phase  
Primary audience: product/engineering agent that will produce implementation PRs, evidence files, tests, runbooks, and a completion report

---

## 1. Executive position

P6 is not another general hardening sweep.

P6 exists because P5 completed the right work but did not reach the preferred certification outcome. The current system is no longer failing because bootstrap payloads are huge, history is unbounded, or subject commands are obviously too expensive. The current blocking evidence is narrower and more useful: `/api/bootstrap` still misses the 30-learner classroom beta gate on burst-tail latency.

P6 should therefore focus on three outcomes:

1. reduce or neutralise `/api/bootstrap` tail latency under classroom-shaped bursts;
2. produce dated certification or honest non-certification evidence for 30 learners and a real 60-learner preflight;
3. hand the result to operations through Admin evidence, capacity docs, CSP decision records, and rollback/degrade procedures.

The phase should be boring, measured, and adversarial. A single green run is not enough. A threshold change is not a fix. A faster median is not the goal. The goal is reliable tail behaviour, correct capacity language, and evidence that can be trusted after the next product branch lands.

---

## 2. P5 validation summary

P5 is accepted as complete, but not as a certification success.

### 2.1 Baseline and identity were valid

The P5 baseline correctly defined P5 as a certification-closure phase rather than a new hardening programme. It carried forward the correct blockers from P4:

- 30-learner certification blocked by bootstrap P95 above the 1,000 ms ceiling;
- 60-learner preflight blocked by the demo-session single-IP rate limit;
- CSP enforcement deferred until the 2026-05-04 observation-window close;
- HSTS preload deferred to operator DNS sign-off;
- deeper repository decomposition, Admin KPI pre-aggregation, full Admin route budgets, debug-bundle capacity instrumentation, Durable Object coordination analysis, and 100+ learner repeated runs deferred beyond P5.

P5 also performed a post-P4 drift audit and recorded no regressions across client bundle audit, production bundle audit, multi-learner bootstrap regression, query budgets, bootstrap capacity, evidence schema, and security headers.

### 2.2 The 30-learner result is an honest fail

The P5 warm-cache 30-learner evidence is a valid stop signal:

| Metric | P5 value | Gate | Result |
| --- | ---: | ---: | --- |
| Bootstrap P95 | 1,167.4 ms | 1,000 ms | Fail |
| Bootstrap P50 | 279.2 ms | n/a | Healthy median |
| Command P95 | 409.7 ms | 750 ms | Pass |
| Max response bytes | 39,002 B | 600,000 B | Pass |
| 5xx | 0 | 0 | Pass |
| Network failures | 0 | 0 | Pass |
| Capacity signals | 0 | 0 | Pass |
| Bootstrap query count | 12 | 13 | Pass |
| Bootstrap D1 rows read | 10 | n/a | Minimal |

The warm-cache hypothesis was refuted because P5 was worse than P4, not better. P5 therefore correctly refused to promote `30-learner-beta-certified`.

P5 attributes the blocker to D1 tail-latency variance under burst load. That is a strong working diagnosis because payload, row count, query budget, command latency, 5xx, and capacity signals all pass. P6 must still test whether fewer D1 round trips, better query consolidation, manifest preparation, or measurement shape can reduce the tail. Do not treat the diagnosis as permission to relax the threshold without evidence.

### 2.3 The 60-learner result is infrastructure progress, not app-capacity evidence

P5 implemented session-manifest mode and a failure-class taxonomy, which is real progress. The 60-learner preflight did not reach application load because manifest preparation was rate-limited after the preceding 30-learner run exhausted the per-IP demo-session bucket.

The P5 evidence is therefore valid only as `invalid-with-named-setup-blocker`. It proves that the driver can separate setup failures from app failures; it does not prove 60-learner capacity.

### 2.4 CSP and HSTS remain deferred honestly

P5 added a mechanical CSP mode/header cross-assertion, but did not flip CSP enforcement. The observation window still ends on 2026-05-04 and the daily log is still unpopulated at the time of P5 completion.

HSTS preload remains deferred because the `eugnel.uk` DNS-zone audit and operator sign-off are incomplete. This is correct. P6 must not flip HSTS preload as an engineering convenience.

### 2.5 Current-main drift after the P5 completion commit must be reconciled

The P5 completion report names `7ea8a00` as the final main commit for the phase. Current `main` is ahead of that point and contains additional Admin and evidence work, including:

- Production Evidence panel and summary-generation script;
- Marketing scheduling truth updates;
- honest Content overview drilldown actions;
- destructive Admin tool confirmation hardening;
- a P5 architecture-pattern solution note;
- the P5 completion report itself.

This is not necessarily a regression. However, P6 must start by recording the actual current main SHA and re-running the relevant drift gates. P6 must not assume the P5 audit covers changes that landed after the reported final commit.

### 2.6 Admin Production Evidence panel exists but its checked-in summary is empty

P5 added an Admin Production Evidence panel with a closed evidence taxonomy. The checked-in `reports/capacity/latest-evidence-summary.json` currently contains an empty metrics object and `generatedAt: null`.

That is acceptable as a placeholder, but it is not an operations-ready state. P6 must generate, validate, and commit or publish a real summary after evidence runs, or explicitly document why the panel intentionally shows stale/not-available.

---

## 3. Product promise for P6

After P6, the owner/operator should be able to say one of these two statements confidently:

> “30-learner classroom beta is certified on commit `<sha>` with dated schema-v2 evidence, zero 5xx, zero capacity signals, bootstrap P95 within the agreed gate, command P95 within the agreed gate, and multi-learner correctness preserved.”

or:

> “30-learner classroom beta remains not certified. We implemented and measured the next mitigation, the failure is still documented, the launch language remains provisional, and the next technical blocker is named.”

A vague middle position is not acceptable.

P6 should also produce a real 60-learner preflight that reaches `/api/bootstrap` and subject-command load. If the 60-learner run fails, it must fail on a named application/platform bottleneck, not on demo-session setup.

---

## 4. Non-goals

P6 must not become a new product feature phase.

The following are out of scope unless explicitly re-contracted:

- new learner-facing Hero Mode surfaces;
- new reward economy, coins, streaks, shops, or monster progression;
- new public subjects;
- broad Admin feature expansion unrelated to production evidence, safety, or capacity;
- rewriting subject engines;
- changing subject mastery or Star semantics;
- weakening access control to make load testing easier;
- bypassing production rate limits by trusting fake client-supplied IP headers;
- relaxing the 30-learner threshold without an evidence-backed policy record;
- HSTS preload activation without completed DNS-zone enumeration and operator sign-off.

---

## 5. Priority order

### Priority A — Tail-latency mitigation before threshold debate

The first engineering priority is to understand and reduce the bootstrap P95 tail under burst load.

P6 should not begin by changing the threshold. First run experiments that isolate whether the tail is caused by:

- number of D1 round trips per bootstrap;
- D1 connection or statement-cache coldness;
- first-request Worker coldness;
- demo-session creation preceding the bootstrap measurement;
- exact lockstep burst shape;
- capacity-driver sequencing;
- route-level JSON decoration or capacity instrumentation overhead;
- any remaining application query fan-out.

Only after this matrix is recorded should a threshold-policy PR be considered.

### Priority B — Evidence must be repeatable

A single pass after a lucky platform window is not enough.

For 30-learner certification, P6 should record at least two passing runs, or one passing run plus a documented reason why a second run is unsafe or impossible. If results are mixed, the decision remains not certified.

### Priority C — 60-learner preflight must reach application load

P6 must finish what P5 prepared. The 60-learner run should use session manifests or another operator-approved source mode so the test reaches bootstrap and command endpoints.

The goal is not to certify 60 learners immediately. The goal is to find the next real bottleneck after the 30-learner path is understood.

### Priority D — Operations surface must reflect the truth

Capacity docs, evidence files, generated summaries, Admin Production Evidence panel, and launch wording must agree. If the app is not certified, Admin must not imply that it is.

---

## 6. P6 units

### P6-U0 — Current-main baseline and P5 reconciliation

Start P6 by creating `docs/plans/james/sys-hardening/sys-hardening-p6-baseline.md`.

The baseline must record:

- actual current main commit SHA;
- comparison from P5 reported final commit `7ea8a00` to current main;
- changed files and changed operational surfaces after `7ea8a00`;
- whether each post-P5 Admin/evidence change has tests;
- current capacity decision status;
- current CSP mode and observation-log status;
- current HSTS preload status;
- exact P6 scope and non-goals.

Required drift gates:

```sh
npm run audit:client
npm run audit:production -- --skip-local
node --test tests/worker-bootstrap-multi-learner-regression.test.js
node --test tests/worker-query-budget.test.js
node --test tests/worker-bootstrap-capacity.test.js
node --test tests/capacity-evidence-schema.test.js
node --test tests/security-headers.test.js
npm run capacity:verify-evidence
```

Acceptance criteria:

- P6 baseline file merged before mitigation work starts.
- No capacity run is interpreted against stale P5 final-SHA assumptions.
- Multi-learner 4-account contract remains passing.
- Any drift introduced after P5 completion is either cleared or named as a P6 blocker.

---

### P6-U1 — Evidence table and Admin Production Evidence truth

P5 added evidence files and an Admin evidence panel, but the generated summary currently contains no metrics. P6 must make the evidence surface useful and truthful.

Tasks:

1. Run the evidence-summary generator against committed evidence files.
2. Decide whether `latest-evidence-summary.json` should be committed, generated at deploy time, or generated by an operator workflow.
3. Ensure the Admin panel displays a failing 30-learner state when the latest 30-learner evidence fails.
4. Ensure stale/missing evidence is not shown as success.
5. Update capacity docs so P5 evidence is represented consistently, not hidden behind older P4 rows.

Acceptance criteria:

- `reports/capacity/latest-evidence-summary.json` has real metrics or an explicit documented reason for remaining empty.
- Admin Production Evidence panel correctly classifies the P5 30-learner run as failing.
- Capacity docs, evidence JSON, and Admin panel agree on the current decision: `small-pilot-provisional`, not certified.
- `npm run capacity:verify-evidence` passes.

---

### P6-U2 — D1 tail-latency experiment matrix

Before writing a mitigation, capture an experiment matrix that separates platform tail from application query fan-out.

Run and record these shapes against the same origin and commit where safe:

| Shape | Purpose | Expected decision value |
| --- | --- | --- |
| 30 learners, burst 20, rounds 1 | Current strict classroom gate | Certification candidate only if thresholds pass |
| 30 learners, burst 20, rounds 1, pre-flight warm-up | Test statement/cache warm-up hypothesis | Diagnostic unless product can implement warm-up safely |
| 30 learners, burst 10, rounds 2 | Test whether exact lockstep concurrency drives D1 tail | Diagnostic unless threshold policy changes |
| 30 learners, burst 20 with session manifest | Remove demo-session creation proximity from measurement | Certification candidate only if equivalent to release gate |
| 30 learners, burst 20 repeated twice | Check run-to-run variance | Certification candidate only if both pass |
| 10 learners, burst 10 local/preview | Regression smoke, not certification | Development signal only |

Each run should persist schema-v2 evidence and record:

- P50, P90, P95, and max wall time per endpoint;
- bootstrap query count and D1 rows read;
- D1 duration if available;
- response bytes;
- status distribution;
- capacity signals;
- request IDs for top-tail samples;
- whether the run used demo sessions, session manifest, shared auth, or another mode;
- exact threshold config hash.

Acceptance criteria:

- At least three diagnostic runs are recorded before any threshold-policy change.
- Tail samples have enough request IDs to inspect Worker logs.
- Results are summarised in the P6 baseline or a dedicated `docs/operations/capacity-tail-latency.md` note.
- No certification claim is made from a diagnostic-only shape.

---

### P6-U3 — Bootstrap round-trip reduction and safe mitigation

If the experiment matrix shows D1 tail is sensitive to bootstrap query fan-out, implement the smallest safe mitigation.

Candidate mitigations, in preferred order:

1. Consolidate independent bootstrap reads into fewer D1 round trips where behaviour is unchanged.
2. Use `IN (...)` queries for per-learner compact subject/game state instead of per-learner query loops, while preserving the all-writable-learners contract.
3. Avoid any optional read in first-paint bootstrap if the same information can be lazy-loaded without breaking learner switching, setup stats, or not-modified invalidation.
4. Add a production-safe warm-up probe only if it does not weaken auth, does not leak private data, and is actually deployable as an operator action.
5. Add client startup jitter only as a real-world smoothing improvement, not as a substitute for the strict gate.

Hard guardrails:

- Do not drop sibling learner compact subject/game state.
- Do not reintroduce full-history `practice_sessions` or `event_log` reads into bootstrap.
- Do not remove `meta.capacity.bootstrapCapacity`.
- Do not hide missing capacity metadata behind a client fallback.
- Do not mark a failed write as synced.
- Do not lower query-budget tests without adversarial review.

Acceptance criteria:

- Bootstrap query count target is lowered if feasible; if not feasible, the reason is documented.
- Multi-learner regression remains passing.
- Bootstrap capacity tests remain passing.
- Query-budget tests are updated to reflect the new budget, not left as loose historical ceilings.
- A before/after evidence pair is recorded.

---

### P6-U4 — 30-learner classroom beta re-certification

After mitigation, re-run the 30-learner classroom gate.

The preferred command remains the release-gate shape:

```sh
npm run capacity:classroom:release-gate -- \
  --production \
  --origin https://ks2.eugnel.uk \
  --confirm-production-load \
  --confirm-high-production-load \
  --demo-sessions \
  --learners 30 \
  --bootstrap-burst 20 \
  --rounds 1 \
  --config reports/capacity/configs/30-learner-beta.json \
  --output reports/capacity/evidence/30-learner-beta-v2-<date>-p6.json
```

If session-manifest mode is used instead of demo-session creation, the completion report must explain why it is equivalent or safer for certification. A manifest-based run may be acceptable only if the test still measures production `/api/bootstrap` and subject-command paths under the same learner/burst/round shape.

Certification acceptance criteria:

- evidence schema version 2 or later;
- threshold config is pinned;
- zero 5xx;
- zero network failures;
- zero capacity signals;
- bootstrap P95 <= 1,000 ms unless a separate threshold-policy PR has landed;
- command P95 <= 750 ms;
- max response bytes <= 600,000 B;
- bootstrap capacity metadata present;
- 4-learner account regression suite passes on the same commit family;
- evidence file committed or otherwise linked by a stable artefact path;
- capacity docs updated in the same PR.

If the run fails, P6 must not promote the tier. The completion report should name the next blocker and retain `small-pilot-provisional` language.

---

### P6-U5 — Real 60-learner preflight

P6 must run a 60-learner preflight that reaches application load.

Preferred path:

1. Prepare a 60-session manifest after the rate-limit window expires, or prepare it from multiple operator-approved sources.
2. Run the preflight with `--session-manifest` so session creation is not part of the measurement.
3. Record whether `/api/bootstrap` and subject-command endpoints were actually hit.
4. Classify failure using the P5 failure taxonomy.

Acceptance criteria:

- The 60-learner preflight is not blocked by demo-session setup.
- Evidence includes endpoint metrics for bootstrap and subject commands, or a new named blocker explains why application load was not reached.
- The result is labelled as preflight, not certification.
- If the preflight passes, P6 may recommend repeated 60-learner stretch runs for a later gate.
- If the preflight fails, the next bottleneck is named with route, metric, and threshold context.

---

### P6-U6 — CSP enforcement decision or dated deferral

The CSP observation window ends on 2026-05-04. P6 must close the decision loop.

Tasks:

1. Populate the daily log in `docs/hardening/csp-enforcement-decision.md`.
2. Record operator sign-off or deferral reasoning.
3. If flip criteria are met, change `CSP_ENFORCEMENT_MODE` to `enforced`, switch the header key to `Content-Security-Policy`, and restore `upgrade-insecure-requests` if appropriate.
4. If criteria are not met, keep Report-Only and open a new dated observation window with reasons.

Acceptance criteria:

- There is no indefinite placeholder daily log after P6.
- The mode constant and actual header key still cross-assert in tests.
- CSP report endpoint tests still pass.
- Inline-style budget does not regress.
- The decision is dated and linked from the P6 completion report.

---

### P6-U7 — Admin capacity and debug-bundle residuals

P5 deferred several Admin capacity items. P6 should close the ones that affect operations trust.

Scope:

- budget ceiling tests for Admin routes that are shown in the operations console;
- debug-bundle capacity collector instrumentation for raw DB aggregation;
- Admin KPI pre-aggregation only if live counts exceed budget or show tail risk;
- Production Evidence panel access, freshness, stale, failing, and missing-data states;
- no-access tests for parent/demo/non-admin roles;
- safe-copy and destructive-action hardening regression checks if affected by P6 changes.

Acceptance criteria:

- Admin evidence panel does not show empty metrics as success.
- Debug-bundle route reports capacity metadata where expected.
- Admin KPI remains manual-refresh and bounded, or is pre-aggregated with tests.
- At least the certification-relevant Admin routes have query/response-time budgets.
- P6 completion report lists any remaining Admin capacity residuals plainly.

---

### P6-U8 — Operations handover and rollback/degrade drill

P6 should make the certification state operable by a non-implementation owner.

Required runbook updates:

- how to run 30-learner certification;
- how to prepare and use a session manifest;
- how to run 60-learner preflight;
- how to read failed evidence;
- how to read Admin Production Evidence panel states;
- how to tail capacity logs by request ID;
- how to respond to bootstrap P95 regression;
- how to roll back or degrade without losing learner writes;
- what language may be used publicly for small pilot, 30 learner, 60 learner, and 100+ readiness.

Required drill:

- simulate or document a bootstrap capacity regression;
- identify the rollback commit or mitigation path;
- confirm student answer writes remain the top priority;
- confirm derived read-model or parent/admin surfaces can degrade without marking failed writes as synced.

Acceptance criteria:

- Runbook is updated in `docs/operations/capacity.md` or a linked operations note.
- P6 completion report includes the drill result or explains why it could not be run.
- Launch language is evidence-tied and does not overclaim.

---

### P6-U9 — Repository pipeline decomposition, only after certification work

Repository decomposition remains useful, but it must not distract from tail-latency mitigation.

Allowed refactor targets:

- pure row transforms;
- read-model row mapping;
- practice-session row mapping;
- event-log row mapping;
- subject-state row mapping;
- capacity metadata shaping.

Not allowed in a refactor-only PR:

- changing bootstrap envelope semantics;
- changing learner membership semantics;
- changing CAS/idempotency semantics;
- changing subject command authority;
- changing not-modified invalidation behaviour;
- changing demo/auth access rules.

Acceptance criteria:

- Characterisation tests land before movement.
- Refactor PRs are behaviour-preserving unless explicitly labelled otherwise.
- Multi-learner and query-budget suites pass after each slice.
- `repository.js` line count decreases without creating a new unreviewable module.

---

### P6-U10 — 100+ learner exploratory run, conditional

Only attempt a 100+ learner exploratory run if all of the following are true:

- 30-learner beta is certified or the team explicitly accepts running exploratory load while certification remains blocked;
- 60-learner preflight reaches application load;
- session-manifest or multi-source load infrastructure is working;
- operator confirms the run window is safe.

Acceptance criteria:

- The result is labelled exploratory, not certified.
- The run records the first bottleneck clearly.
- No launch wording is upgraded because of a single 100+ exploratory pass.

---

## 7. Engineering requirements

### ER-1: Certification language is evidence-gated

No code, UI, docs, or Admin panel may describe 30-learner beta as certified unless a passing schema-v2 evidence file exists and `capacity:verify-evidence` accepts it.

### ER-2: Threshold changes require a policy record

If P6 changes the 1,000 ms bootstrap P95 ceiling, the change must be in a dedicated threshold-policy PR with:

- old and new threshold;
- at least three diagnostic runs;
- reason the old threshold is unrealistic or not product-relevant;
- evidence that users are not seeing 503 or lost progress;
- explicit owner sign-off.

Do not hide a threshold change inside a mitigation PR.

### ER-3: Multi-learner correctness remains non-negotiable

Every capacity mitigation must preserve the contract that one account can own multiple learners. All writable learners need compact subject/game state sufficient for switching and setup stats. Heavy history remains selected-learner-bounded or lazy.

### ER-4: Capacity tests should get tighter, not looser

If P6 reduces bootstrap query count or route cost, update tests to preserve the improvement. Do not leave old wide budgets that allow regressions.

### ER-5: Production rate limits remain trusted

Do not disable or weaken demo/session rate limits in production just to make a load test easier. Use manifests, safe operator windows, multiple legitimate sources, or explicit fixture modes.

### ER-6: Admin evidence must fail visibly

Missing, stale, or failing evidence must show as missing, stale, or failing. It must not be treated as an empty success state.

### ER-7: CSP/HSTS decisions stay operator-gated

CSP enforcement requires observation-log closure. HSTS preload requires DNS-zone enumeration and operator sign-off. P6 should close the decision where possible, not bypass the gate.

---

## 8. Documentation requirements

P6 must update documentation as part of the work.

Required documents:

- `docs/plans/james/sys-hardening/sys-hardening-p6-baseline.md`;
- `docs/plans/james/sys-hardening/sys-hardening-p6-completion-report.md`;
- `docs/operations/capacity.md` updates for all new evidence rows;
- capacity evidence JSON files under `reports/capacity/evidence/` or snapshots;
- `docs/hardening/csp-enforcement-decision.md` updated with decision or dated deferral;
- Admin evidence panel docs or comments if its generation/deploy model changes;
- optional `docs/operations/capacity-tail-latency.md` if the experiment matrix is large.

---

## 9. Recommended PR sequence

1. `docs(hardening): add P6 baseline and reconcile post-P5 main drift`
2. `capacity(evidence): populate production evidence summary and fix Admin evidence truth states`
3. `capacity(d1): add bootstrap tail-latency experiment matrix and evidence notes`
4. `perf(bootstrap): reduce D1 round trips on bounded bootstrap path`
5. `capacity(classroom): re-run 30-learner beta gate after mitigation`
6. `capacity(classroom): run 60-learner session-manifest preflight`
7. `security(csp): close enforcement decision window with flip or dated deferral`
8. `admin(capacity): add budgets and instrumentation for operations-critical Admin routes`
9. `ops(capacity): add rollback/degrade drill and launch-language update`
10. `refactor(worker): extract pure repository row transforms behind locked tests`
11. `capacity(exploratory): optional 100+ learner probe if prerequisites are met`
12. `docs(hardening): add P6 completion report`

---

## 10. Recommended evidence commands

The implementation agent should adapt the exact list to changed files, but P6 completion should normally include:

```sh
npm test
npm run check
npm run audit:client
npm run audit:production -- --skip-local
npm run capacity:verify-evidence
node --test tests/worker-bootstrap-multi-learner-regression.test.js
node --test tests/worker-query-budget.test.js
node --test tests/worker-bootstrap-capacity.test.js
node --test tests/capacity-evidence-schema.test.js
node --test tests/security-headers.test.js
node --test tests/capacity-session-manifest.test.js
npm run capacity:classroom -- --dry-run --learners 30 --bootstrap-burst 20 --rounds 1
```

Production evidence commands should be recorded exactly in the completion report. Do not claim a command was run unless it was actually run.

---

## 11. Acceptance criteria

P6 may be considered complete only when all of the following are true:

1. P6 baseline records the actual current main SHA and post-P5 drift.
2. P5 evidence is reflected consistently across docs, evidence summary, and Admin Production Evidence panel.
3. D1/bootstrap tail-latency experiment matrix has dated evidence.
4. At least one safe mitigation is implemented or the report explains why no code mitigation is justified.
5. 30-learner certification is either honestly promoted with passing evidence or remains honestly blocked with the next blocker named.
6. 60-learner preflight reaches application load or fails with a new named blocker that is not demo-session setup.
7. CSP enforcement has a dated decision: flip or defer with reasons.
8. HSTS preload remains gated unless operator DNS audit is complete.
9. Multi-learner account correctness remains passing.
10. No capacity mitigation widens source exposure, redaction risk, or admin access.
11. Operations runbook explains how to run, read, and act on capacity evidence.
12. Completion report lists every deferred item plainly.

---

## 12. P6 done means

P6 is done when the project stops hovering between “nearly certified” and “not quite”.

A good P6 outcome is not necessarily a green badge. A good P6 outcome is a trustworthy decision.

If the decision is certified, the evidence must be strong enough to defend. If the decision is still provisional, the launch language must stay provisional and the next bottleneck must be named. Either way, the operator should know what the system can handle, what it cannot claim yet, and what to do if classroom traffic pushes the platform into the tail.
