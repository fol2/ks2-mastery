---
title: "System Hardening P5 — Certification Closure, Drift Containment, and Launch Readiness Contract"
type: product-engineering-contract
status: proposed
date: 2026-04-28
owner: james
scope: system-hardening, capacity, security-headers, operational-evidence, post-P4-regression-control
inherits:
  - docs/plans/james/sys-hardening/sys-hardening-p4.md
  - docs/plans/james/sys-hardening/sys-hardening-p4-completion-report.md
  - docs/operations/capacity.md
  - docs/hardening/csp-enforcement-decision.md
  - docs/hardening/hsts-preload-audit.md
related_current_surfaces:
  - docs/plans/james/rewards/reward-presentation-contract.md
  - docs/operations/seo.md
  - worker/README.md
non_goal_marker: >
  This is not a low-level implementation-unit plan. The next implementation agent must derive exact PRs, files, tests,
  load-run commands, reviewer prompts, and sequencing from this contract.
---

# System Hardening P5 — Certification Closure, Drift Containment, and Launch Readiness Contract

## 0. Contract summary

P5 is a closure phase, not a new broad hardening programme.

P4 built the correct certification machinery: evidence schema v2, provenance, real `requireBootstrapCapacity` checks, post-P3 route budgets, Star View performance budgets, local-worker capacity harnessing, CSP/HSTS gates, inline-style ratchets, breaker recovery, and a first 30-learner v2 certification attempt.

However, P4 did not certify the 30-learner classroom beta. The v2 production run failed on one threshold only: `/api/bootstrap` P95 was above the 1,000 ms ceiling. The run otherwise passed zero 5xx, zero network failures, command P95, payload size, zero signals, and real bootstrap capacity metadata. The 60-learner stretch preflight also did not measure the real app path because the single load-generator IP hit the demo-session per-IP creation limit before the bootstrap/command phase.

Therefore P5 must answer three questions clearly:

1. Can the current main branch certify 30 active learners under evidence schema v2 without relaxing thresholds?
2. Can the load-test driver reach the 60-learner shape without being blocked by a single-IP demo-session setup artefact?
3. Can security-header hardening move from “gated and almost ready” to an explicit enforced-or-deferred decision, without breaking learner routes?

P5 must also contain post-P4 drift. Since P4, current main has continued to change around rewards, SEO public pages, Grammar, and Punctuation. Those changes are legitimate product work, but they invalidate any lazy assumption that the P4 certification attempt still describes the whole live surface. P5 must revalidate the current branch before making launch language stronger.

P5 is successful only if it produces honest, dated evidence. A failed run with a measured root cause is acceptable. A relaxed threshold, hand-edited evidence file, or “probably fine” classroom claim is not acceptable.

## 1. Executive position

The next phase should be named:

**P5 — Certification Closure, Drift Containment, and Launch Readiness**

Do not call it “P5 optimisation” or “P5 new hardening”. That wording would encourage the wrong behaviour. P5 is about closing the certification loop that P4 deliberately left open.

The product owner should be able to read the P5 completion report and know exactly which of these statements is true:

- “30-learner classroom beta is now certified on current main under schema v2.”
- “30-learner classroom beta is still not certified, and here is the measured root cause and blocker.”
- “60-learner stretch has a real preflight result.”
- “60-learner stretch is still unmeasured, and the remaining blocker is named.”
- “CSP is now enforced.”
- “CSP remains Report-Only, and the deferral has dated evidence rather than inertia.”

P5 must not hide behind Free-tier explanations. If the application cannot keep `/api/bootstrap` below the configured P95 ceiling for 30 virtual learners on current main, the project should say so and fix the route, not change the launch wording.

## 2. Source-review signals that triggered P5

These are the contract-level reasons P5 exists. They are not implementation instructions.

### 2.1 P4 delivered most prerequisites, but not the 30-learner claim

P4 closed nine of ten requirements. The remaining requirement was the 30-learner promotion. The v2 cert run failed only on `maxBootstrapP95Ms`: observed 1,126.3 ms against a 1,000 ms ceiling. All other core thresholds passed.

The right next move is a controlled warm-cache re-run, followed by targeted bootstrap P95 investigation if the run still fails.

### 2.2 The P4 evidence system worked by recording failure honestly

The failed P4 certification run is valuable. It proves the threshold gate is no longer ornamental. P5 must keep this culture: do not retry until green without recording failed attempts, and do not treat a failure as embarrassing. Failures are evidence.

### 2.3 The 60-learner preflight hit a test-infrastructure limit, not an app-capacity limit

The 60-learner preflight failed because `/api/demo/session` has a per-IP creation limit. A single load-generator host does not represent a classroom of independent learners. P5 must extend the load-test setup so the test can actually exercise bootstrap and subject-command routes at 60 learners.

This must not be done by weakening production rate limits or trusting spoofed client IP headers.

### 2.4 CSP enforcement now has a dated decision window

The CSP decision record states that the observation window ends on 2026-05-04, with flip criteria and deferral criteria. P5 should either execute the flip after the window is complete, or record a dated deferral with violations, owner, and next review date.

P5 must also make `CSP_ENFORCEMENT_MODE` an actual runtime/header contract rather than a dead constant.

### 2.5 HSTS preload remains operator-gated

HSTS preload is not an engineering-only decision. The DNS audit still requires operator enumeration and sign-off. P5 may improve the guardrails, but it must not block P5 completion on preload unless the operator has actually completed the audit.

### 2.6 Post-P4 product work creates drift risk

After P4, current main has changed around reward presentation, public SEO pages, Grammar answer specs/reward display, Punctuation generated metadata, and content audit gates. These changes are not automatically unsafe, but they touch surfaces that interact with hardening:

- public pages, robots, sitemap, and static response routing;
- reward presentation, toast, celebration, acknowledgement, and replay;
- Grammar/Punctuation Star display and generated-content transport;
- production audits and CSP/script allowances;
- possible bootstrap or read-model payload shape drift.

P5 must include a current-main drift audit before certifying anything.

## 3. Product promise for P5

After P5, James should be able to say one of two things without caveats.

Preferred outcome:

> “The current main branch is certified for a 30-learner classroom beta under schema v2, and the 60-learner stretch path has a real preflight result rather than a setup failure.”

Honest stop outcome:

> “The current main branch is not yet certified for 30 learners. We know exactly which threshold fails, which route causes it, which commit/evidence proves it, and which fix is next.”

Both outcomes are useful. What is not acceptable is ambiguous launch language.

## 4. Non-goals

P5 must not become a feature phase.

The following are out of scope unless a separate product contract explicitly overrides this file:

- new child-facing subjects;
- new Hero economy, Hero Coins, Hero Camp, inventory, shop, or reward-claim mechanics;
- new reward semantics for Spelling, Grammar, Punctuation, or Hero Mode;
- SEO content expansion beyond validating the pages already added;
- major Admin feature expansion;
- broad repository rewrites;
- Durable Object coordination work;
- relaxing capacity thresholds to get a green run;
- bypassing production rate limits by trusting spoofed `CF-Connecting-IP` or other client-supplied headers;
- HSTS preload activation without completed DNS/operator sign-off;
- CSP enforcement before the documented observation criteria are satisfied.

P5 may touch product-visible code only when the change is necessary to fix a correctness, safety, performance, accessibility, or evidence problem.

## 5. P5 priorities

### Priority A — Settle 30-learner certification on current main

The first hard gate is the 30-learner v2 release gate.

The implementation agent should re-run the 30-learner classroom release gate after a quiet/warm-cache window, using the same threshold config and no relaxed limits. The evidence row must be committed and verified.

If the run passes, promote the capacity decision to `30-learner-beta-certified` only if all schema v2, provenance, threshold, and verification rules pass.

If the run fails again, do not promote. Open the bootstrap P95 investigation path and record the exact failure.

### Priority B — Investigate bootstrap P95 only if the warm run still fails

Do not optimise blindly before the warm-cache re-run. The P4 hypothesis was cold D1 statement cache after a heavy deploy cycle. P5 should test that hypothesis first.

If P95 is still above 1,000 ms, the next agent must isolate where the time is spent:

- Worker cold start versus steady-state response;
- D1 query count and row count;
- D1 query plan/index use;
- bootstrap revision/not-modified path;
- selected learner versus sibling learner compact state;
- published monster visual payload size;
- SEO/static route interference, if any;
- reward presentation or recent event payload drift;
- capacity collector overhead;
- JSON serialisation and response-byte growth.

The investigation should produce either a small targeted fix PR or a clear blocker record. Do not fold this into a large repository rewrite.

### Priority C — Make 60-learner preflight real

The 60-learner stretch preflight must reach the actual bootstrap and subject-command route body. A setup failure at demo-session creation is not a useful app-capacity result.

P5 should add one safe load-driver path:

- `--session-manifest` mode, where the runner uses a pre-created list of valid session cookies/tokens; or
- multi-runner orchestration, where independent runners create sessions without sharing one per-IP bucket; or
- an operator-approved internal fixture path that is unavailable to public traffic and still creates isolated learner/account state.

The implementation must not weaken public demo-session rate limits and must not trust a fake client-provided IP header. If a helper endpoint is introduced for load testing, it must be production-disabled by default, guarded by an explicit secret or environment flag, and covered by access tests.

### Priority D — Execute the CSP decision honestly

P5 should not merely repeat “CSP Report-Only is open”. It should do one of two things:

- flip to enforced CSP after the observation window is complete and the decision record is signed; or
- keep Report-Only and add a dated deferral reason with observed violations, owner, and next review date.

The flip PR must make `CSP_ENFORCEMENT_MODE` cross-assert the actual header key. If the mode is `enforced`, `SECURITY_HEADERS` must contain `Content-Security-Policy` and must not contain `Content-Security-Policy-Report-Only`. If the mode is `report-only`, the reverse must be true.

The enforcing PR should restore `upgrade-insecure-requests` only when doing so is compatible with the active policy and tests.

### Priority E — Contain post-P4 drift

Before making a stronger capacity or security claim, P5 must revalidate the current main branch, not the P4 branch as it existed at the time of the failed run.

The drift audit should cover at least:

- public SEO pages return public HTML and do not expose private state;
- robots and sitemap exclude `/api/`, `/admin`, `/demo`, local, and source-shaped paths;
- source lockdown still denies raw `/src/*`, `/shared/*`, `/worker/*`, `/tests/*`, `/docs/*`, `/legacy/*` paths;
- reward presentation adapters do not add bootstrap queries or replay mutations;
- toast/celebration acknowledgement remains per presentation kind;
- synthetic or future Hero presentation fixtures do not mutate Hero economy state;
- Grammar/Punctuation reward-display changes do not widen bootstrap payloads unexpectedly;
- generated content metadata transport does not expose answer-bearing or server-only fields;
- production audit still passes after SEO and CSP changes;
- multi-learner account correctness remains locked.

### Priority F — Decide what to defer to P6

P4 left some worthwhile engineering residuals that should not all be forced into P5. P5 must triage them honestly.

Likely P6 items unless they block P5 evidence:

- deeper `repository.js` pipeline decomposition for impure functions;
- full Admin KPI pre-aggregation instead of live counters;
- adding ceilings to every admin endpoint that already emits `meta.capacity`;
- debug-bundle capacity collector instrumentation for raw DB aggregation;
- 100+ learner repeated runs;
- Durable Object coordination analysis;
- HSTS preload activation if DNS sign-off is not complete.

P5 should not let these valuable but lower-priority items distract from 30-learner certification closure.

## 6. Product requirements

### PR-1: Capacity wording is evidence-tied

All docs and release notes must use capacity wording tied to a dated run. If 30 learners are not certified, do not use “classroom ready” or “supports a class” language.

Allowed language before certification:

> “Small-pilot-provisional. 30-learner certification is blocked by bootstrap P95 evidence.”

Allowed language after certification:

> “30-learner classroom beta certified on commit `<sha>` with `<n>` learners, bootstrap burst `<n>`, P95 bootstrap `<ms>`, P95 command `<ms>`, zero 5xx, zero signals, schema v2 evidence.”

### PR-2: 30-learner certification uses the existing threshold contract

The 30-learner run must preserve the P4 threshold shape:

- max 5xx: 0;
- max network failures: 0;
- max bootstrap P95: 1,000 ms;
- max command P95: 750 ms;
- max response bytes: 600,000;
- require zero capacity signals;
- require bootstrap capacity metadata;
- require schema v2 evidence and certifiable provenance.

Threshold changes are out of scope for P5 unless the product owner explicitly changes the release target in a separate PR. Do not tune thresholds inside the same PR that tries to certify them.

### PR-3: Multi-learner account correctness remains non-negotiable

Every P5 capacity and bootstrap fix must preserve the 4-learner account contract:

- all writable learners appear;
- selected learner heavy history remains bounded;
- sibling compact subject/game state is present;
- sibling writes invalidate the relevant not-modified probe;
- viewer learners are not silently promoted to writable;
- learner switching must not show zero stats because compact sibling state was omitted.

Optimising bootstrap by returning only one child is a regression.

### PR-4: The 60-learner preflight reaches application load

The 60-learner preflight may fail. It must not fail before it measures the application path.

A valid 60-learner preflight result should include:

- session setup success count;
- explicit setup failure count, if any;
- bootstrap status distribution;
- command status distribution;
- P50/P95 bootstrap and command latency;
- response-byte maxima;
- capacity signals;
- whether the test used demo sessions, pre-created sessions, or authenticated fixtures;
- whether the result is candidate, fail-with-root-cause, or invalid.

### PR-5: CSP has a real decision

P5 completion must state one of:

- CSP enforced on current main, with tests proving the header key matches `CSP_ENFORCEMENT_MODE`; or
- CSP remains Report-Only, with a dated deferral reason, observed violations, operator note, and next review date.

A blank daily log cannot support a flip.

### PR-6: HSTS preload remains gated, not forgotten

P5 should update the HSTS audit only if new operator facts are available. If there is no DNS sign-off, leave preload disabled and say so. Do not turn an operator-gated decision into an engineering default.

### PR-7: Post-P4 public pages do not weaken lockdown

SEO landing pages must remain public identity pages only. They must not expose:

- learner state;
- admin state;
- generated subject content stores;
- answer-bearing content;
- private analytics;
- source paths;
- local/runtime debug details.

Robots and sitemap must stay aligned with the real public surface.

### PR-8: Reward presentation migration remains downstream of committed truth

The reward presentation layer is not a new evidence engine. P5 must preserve this separation:

- subjects own learning evidence;
- presentation services own toast/celebration rendering;
- replaying a presentation must not repeat a mutation;
- future Hero economy events may be shaped, but must not mutate Hero inventory/coins unless a separate economy phase exists;
- no bootstrap query should be added merely to render a presentation event.

## 7. Engineering requirements

### ER-1: Producer-to-gate end-to-end tests

P4 learned that composition gaps survive unit tests. Any gate that reads fields produced by another module must have at least one end-to-end producer-to-consumer test.

For P5 this applies to:

- classroom load results -> summary aggregation -> threshold gate -> evidence verifier;
- CSP mode constant -> header key -> header drift tests -> production audit;
- session manifest or multi-runner setup -> load-driver setup -> application measurement;
- reward presentation event -> adapter -> queue -> acknowledgement -> replay behaviour.

### ER-2: No silent success on missing evidence

If evidence JSON is missing fields needed for a certifiable claim, verification must fail or downgrade the decision. It must not silently pass with `undefined`, `NaN`, `false`, empty strings, or stale files.

### ER-3: Load-test setup failures are separated from app failures

The load driver should distinguish:

- setup/session creation failure;
- authentication failure;
- bootstrap failure;
- subject-command failure;
- threshold failure;
- transport failure;
- evidence-write failure.

The current 60-learner issue is specifically a setup failure. P5 must make that class explicit so it cannot be mistaken for app capacity.

### ER-4: Production rate limits stay safe

Do not weaken public demo rate limits to make tests pass. A load-test-only path must be inaccessible to normal users, must not be enabled accidentally in production, and must be obvious in docs and tests.

### ER-5: Bootstrap P95 investigation must be route-level and data-level

If investigation is required, measure actual route phases rather than guessing. Useful instrumentation may include:

- per-request request id;
- query count and row counts already in `meta.capacity`;
- selected learner id and learner count shape, redacted where necessary;
- response-byte size;
- not-modified status;
- cold versus warm run label;
- route phase timings if they can be added without material CPU cost.

Temporary diagnostic fields must be removed, gated, or closed-allowlisted before P5 completion.

### ER-6: CSP flip must be mechanically guarded

The header key must be derived from or cross-asserted against `CSP_ENFORCEMENT_MODE`. Tests should fail if the constant says one thing and `SECURITY_HEADERS` ships another.

### ER-7: Current-main drift audit must be reproducible

The drift audit should not rely on manual browsing alone. It should be backed by scripts/tests where possible:

- production bundle audit;
- SEO route checks;
- source-lockdown audit;
- reward presentation replay tests;
- multi-learner bootstrap tests;
- capacity evidence verifier;
- selected production smokes.

## 8. Recommended implementation units

### P5-U0 — Baseline and freeze current-main truth

Create or update the P5 plan and record the baseline:

- current main commit SHA;
- open PR count;
- latest capacity decision;
- post-P4 changed surfaces;
- P4 residuals accepted into P5;
- P4 residuals deliberately deferred to P6;
- exact certification language allowed during P5.

Acceptance criteria:

- P5 baseline is committed before code changes;
- P5 states clearly that it is a certification closure phase;
- no new learner-visible feature work is bundled into P5;
- post-P4 commits around rewards, SEO, Grammar, and Punctuation are listed as drift surfaces to revalidate.

### P5-U1 — Warm-cache 30-learner schema v2 re-run

Re-run the 30-learner release gate against current main after a quiet/warm-cache window.

Recommended command shape:

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
  --output reports/capacity/evidence/30-learner-beta-v2-YYYYMMDD-current-main.json
```

The implementation agent may adjust the file name and origin according to repo convention, but not the threshold values.

Acceptance criteria:

- evidence schema v2;
- certifiable provenance present;
- verification passes for the evidence file;
- `docs/operations/capacity.md` table is updated honestly;
- if pass, decision becomes `30-learner-beta-certified`;
- if fail, decision stays fail/provisional and P5-U2 is triggered;
- no threshold relaxation.

### P5-U2 — Bootstrap P95 investigation and targeted fix path

Run only if P5-U1 fails on bootstrap P95 again.

The investigation must explain whether the problem is environmental, route-structural, payload-related, query-related, or newly introduced by post-P4 drift.

Minimum investigation evidence:

- compare failed P4 run, P5 warm run, and at least one focused bootstrap probe;
- record query count and D1 rows read;
- record response bytes;
- record whether not-modified paths are exercised;
- record selected learner / sibling learner shape without leaking private state;
- compare cold and warm sequence if practical;
- identify any new post-P4 payload contributor.

Possible fix directions, only if evidence supports them:

- reduce non-critical bootstrap payload;
- cache or pre-compute a small read model;
- tighten query indexes or query shapes;
- defer non-first-paint public/visual payloads;
- split a heavy admin/public route away from bootstrap;
- correct a regression introduced by reward/SEO/content changes.

Acceptance criteria:

- either a targeted fix lands and P5-U1 is re-run, or the blocker is documented with exact evidence;
- no broad rewrite;
- multi-learner bootstrap tests still pass;
- bootstrap capacity version is bumped only if the envelope changes.

### P5-U3 — Load-driver setup split and session-manifest or multi-runner support

Make the 60-learner preflight capable of measuring the app path.

Preferred low-risk option: add a `--session-manifest` mode to the classroom load driver. The manifest contains pre-created, isolated session credentials, one per virtual learner, generated by an operator-approved process. The driver then skips demo-session creation and measures bootstrap/command routes.

Alternative option: add multi-runner orchestration, where N independent runner processes or hosts create sessions without sharing one IP bucket.

Acceptance criteria:

- setup/session creation failures are reported separately from app failures;
- the driver can run with 60 learners without being invalidated by single-IP demo-session creation limits;
- no production rate limit is weakened;
- no fake `CF-Connecting-IP` trust is introduced;
- evidence records the session source mode;
- docs explain how to prepare or validate the session manifest safely.

### P5-U4 — 60-learner stretch preflight re-run

After P5-U3, run the 60-learner stretch shape and record a real decision.

Suggested shape:

```sh
npm run capacity:classroom -- \
  --production \
  --origin https://ks2.eugnel.uk \
  --confirm-production-load \
  --confirm-high-production-load \
  --learners 60 \
  --bootstrap-burst 30 \
  --rounds 1 \
  --session-manifest reports/capacity/manifests/60-learner-YYYYMMDD.json \
  --output reports/capacity/evidence/60-learner-stretch-preflight-YYYYMMDD.json
```

The exact invocation may vary, but the evidence must show that the run reached `/api/bootstrap` and subject commands.

Acceptance criteria:

- decision is `60-learner-stretch-candidate`, `fail-with-root-cause`, or `invalid-with-named-setup-blocker`;
- if invalid, the invalidation reason is different from the already-known single-IP demo rate limit, or P5-U3 is incomplete;
- no certification claim is made from a single stretch preflight;
- bottleneck is named if the run fails.

### P5-U5 — CSP enforcement flip or dated deferral

After the documented observation window closes, decide CSP.

If flipping:

- `CSP_ENFORCEMENT_MODE = 'enforced'`;
- `SECURITY_HEADERS` contains `Content-Security-Policy`;
- `SECURITY_HEADERS` does not contain `Content-Security-Policy-Report-Only`;
- header drift tests pass;
- production audit passes;
- `upgrade-insecure-requests` is restored if compatible;
- decision record includes operator sign-off and daily log.

If deferring:

- keep `CSP_ENFORCEMENT_MODE = 'report-only'`;
- add dated deferral reason;
- list observed violations or sample-size concern;
- assign owner and next review date;
- keep inline style ratchet active;
- do not present Report-Only as completed enforcement.

Acceptance criteria:

- no dead mode constant;
- decision record and source agree;
- tests prove agreement;
- P5 completion report states the outcome plainly.

### P5-U6 — Post-P4 drift audit: rewards, SEO, Grammar, Punctuation

Run a current-main drift audit around surfaces that changed after P4.

Focus areas:

- reward presentation contract and adapters;
- toast shelf and celebration queue migration;
- SEO public discovery pages;
- robots and sitemap;
- Grammar reward display and answer-spec migration;
- Punctuation generated metadata transport and content audit gate;
- raw source lockdown;
- capacity/payload impact of these changes.

Acceptance criteria:

- no private data leak from SEO/public pages;
- no raw source exposure regression;
- reward presentation replay does not mutate state;
- no Hero economy mutation is introduced accidentally;
- Grammar/Punctuation reward display changes do not break multi-learner bootstrap;
- production audit passes or failure is carried as a blocker;
- any capacity-impacting drift is measured or blocked before certification.

### P5-U7 — Admin capacity residual triage, not full Admin rebuild

P4 carried several Admin capacity residuals. P5 should triage them, not rebuild Admin.

Minimum P5 action:

- document which Admin routes are certification-critical for P5;
- ensure `/api/admin/ops/kpi` remains manual-refresh and indexed;
- ensure debug-bundle limitations are labelled honestly;
- ensure no admin endpoint touched in P5 loses access/redaction tests;
- defer full Admin KPI pre-aggregation or full endpoint budget coverage to P6 unless it blocks P5 evidence.

Acceptance criteria:

- no Admin route touched by P5 lacks access tests;
- debug-bundle capacity collector bypass is either fixed or explicitly carried to P6;
- Admin KPI live-count cost is not allowed to block learner-route certification unless evidence shows it affects learner routes.

### P5-U8 — HSTS preload status update

Update the HSTS preload audit only if the operator has new DNS facts.

Acceptance criteria:

- `HSTS_PRELOAD_ENABLED` remains `false` unless sign-off is complete;
- if sign-off is complete, every anti-preload gate and `_headers` parity test is updated in the same PR;
- if sign-off is incomplete, P5 completion report says “deferred; operator DNS audit incomplete”; 
- no accidental preload.

### P5-U9 — P5 completion report

Write `docs/plans/james/sys-hardening/sys-hardening-p5-completion-report.md`.

The completion report must include:

- current-main baseline commit;
- all PRs/commits in P5;
- test and smoke evidence actually run;
- 30-learner certification result;
- 60-learner preflight result;
- CSP decision result;
- post-P4 drift audit result;
- deferred items and owners;
- recommended P6 scope.

Do not claim commands were run unless they were run.

## 9. Suggested PR sequence

Recommended sequence, keeping the phase small and reviewable:

1. `docs(hardening): add P5 certification-closure baseline`
   - Add this contract to the repo.
   - Record current main, capacity status, P4 residuals, and post-P4 drift surfaces.

2. `capacity(classroom): re-run 30-learner v2 gate on current main`
   - Warm-cache/quiescent re-run.
   - Update evidence and capacity docs.
   - Branch depending on pass/fail.

3. `perf(bootstrap): investigate and fix P95 blocker`
   - Only if PR 2 fails.
   - Keep the fix targeted.
   - Re-run PR 2 evidence after fix.

4. `capacity(driver): support session-manifest or multi-runner setup`
   - Split setup failure from app failure.
   - Avoid rate-limit weakening.

5. `capacity(stretch): record real 60-learner preflight`
   - Candidate or fail-with-root-cause, not certification.

6. `security(csp): enforce CSP or record dated deferral`
   - After observation criteria are satisfied or explicitly not satisfied.
   - Make mode constant and header key agree.

7. `hardening(drift): revalidate post-P4 public/reward/content surfaces`
   - SEO pages, reward presentation, Grammar/Punctuation reward/content changes, source lockdown.

8. `docs(hardening): add P5 completion report`
   - Honest result, no over-claiming.

HSTS preload should be a separate operator-gated PR if the DNS audit becomes complete during P5. Do not delay P5 solely waiting for DNS sign-off.

## 10. Recommended evidence commands

The next implementation agent should choose the exact command set based on changed files. Typical P5 evidence should include these families:

```sh
npm test
npm run check
npm run capacity:verify-evidence
npm run audit:client
npm run audit:production -- --skip-local
```

Capacity evidence:

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
  --output reports/capacity/evidence/30-learner-beta-v2-YYYYMMDD-current-main.json
```

Local worker smoke, where useful:

```sh
npm run capacity:local-worker -- --learners 10 --bootstrap-burst 10 --rounds 1
```

Production bootstrap probe, where useful:

```sh
npm run smoke:production:bootstrap -- \
  --url https://ks2.eugnel.uk \
  --cookie "ks2_session=..." \
  --max-bytes 600000 \
  --max-sessions 12 \
  --max-events 100
```

Subject smoke checks if touched:

```sh
npm run smoke:production:grammar -- --origin https://ks2.eugnel.uk
npm run smoke:production:punctuation -- --origin https://ks2.eugnel.uk
npm run smoke:production:spelling-dense -- --origin https://ks2.eugnel.uk --cookie "ks2_session=..."
```

Admin smoke only if Admin/ops routes are touched:

```sh
npm run smoke:production:admin-ops -- --origin https://ks2.eugnel.uk
```

Do not claim any command was run unless it was actually run and its result is recorded.

## 11. Acceptance criteria

P5 may be considered complete only when all of the following are true:

1. Current main has a P5 baseline document and no ambiguous capacity wording.
2. A current-main 30-learner schema v2 run is recorded.
3. The 30-learner decision is either certified or honestly blocked with measured root cause.
4. If the warm-cache 30-learner run failed, bootstrap P95 has a focused investigation record.
5. The 60-learner test path is no longer blocked by the already-known single-IP demo-session setup limit, or the remaining setup blocker is newly named and justified.
6. A 60-learner preflight result is recorded as candidate, fail-with-root-cause, or invalid-with-named-blocker.
7. CSP is either enforced with tests and sign-off, or explicitly deferred with dated observation evidence.
8. `CSP_ENFORCEMENT_MODE` is not a dead constant.
9. HSTS preload remains gated by operator DNS sign-off; no accidental preload.
10. Post-P4 reward, SEO, Grammar, and Punctuation changes are revalidated for lockdown, replay safety, payload drift, and multi-learner correctness.
11. No public page exposes private learner/admin/generated-answer/source data.
12. No P5 change weakens Worker-authored subject command authority, idempotency, CAS, or learner access checks.
13. Multi-learner account regression tests still pass.
14. Capacity evidence verification passes for every certifiable claim.
15. P5 completion report lists every deferred item plainly.

## 12. Open questions for the implementation agent

1. What is the current main commit SHA at P5 start?
2. Has the production Worker been quiet long enough to test the warm-cache hypothesis fairly?
3. Should the 30-learner re-run use demo sessions, authenticated fixture sessions, or both?
4. Does the existing load driver already support a session manifest under another name?
5. Which session-manifest format is safest and easiest to audit?
6. Are post-P4 reward presentation changes visible in bootstrap payloads, event-log reactions, or only in client-side adapters?
7. Did SEO route additions change production audit expectations or CSP reports?
8. Is the CSP daily log fully populated for the 2026-04-27 to 2026-05-04 window?
9. If CSP has violations, are they third-party allowlist candidates or first-party blockers?
10. Has the operator provided any new HSTS DNS audit information?
11. Which Admin residuals, if any, affect learner-route certification rather than Admin-only operations?
12. If 60 learners still fail after setup is fixed, is the bottleneck Worker CPU, D1, bootstrap payload, subject command projection, rate limiting, or network?

## 13. P6 horizon

P5 should not attempt to finish every possible hardening topic. If P5 succeeds, P6 should be the final planned system-hardening phase before the project moves to ordinary release gates.

Recommended P6 theme:

**P6 — School-Readiness, Operations Handover, and Long-Tail Architecture Debt**

Likely P6 scope:

- repeated 60-learner stretch runs;
- first 100+ learner exploratory run if 60 is stable;
- Admin endpoint budget coverage beyond the small certification-critical set;
- Admin KPI pre-aggregation if live counts become a scale risk;
- debug-bundle capacity collector integration;
- deeper repository pipeline decomposition for impure transform paths;
- operational dashboards for capacity/CSP/breaker state;
- rollback/degrade drill;
- HSTS preload activation only if operator DNS sign-off is complete;
- subject-expansion preflight for the next real subject after classroom stability is proven.

P6 should end the “phase” model for system hardening unless a new scale target or architecture change appears. After P6, the repo should move to normal release gates: every product phase must carry capacity, security, multi-learner, and source-lockdown evidence as part of its own PR, instead of waiting for another hardening sweep.

## 14. Blunt recommendation

P5 should be narrow and evidence-driven.

Do not start with refactoring. Do not start with SEO expansion. Do not start with Hero economy. Do not start with HSTS preload. Do not start by raising limits.

Start by settling the 30-learner evidence on current main.

If it passes, promote the claim carefully and move on to a real 60-learner preflight. If it fails, fix the measured bootstrap P95 blocker before making the product bigger.

P5 is done when the project no longer has to say, “P4 was basically ready, except…”. It should either close that “except”, or name the blocker so clearly that the next fix is unavoidable.
