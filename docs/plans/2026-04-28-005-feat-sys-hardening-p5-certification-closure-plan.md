---
title: "System Hardening P5 — Certification Closure, Drift Containment, and Launch Readiness"
type: feat
status: active
date: 2026-04-28
origin: docs/plans/james/sys-hardening/sys-hardening-p5.md
inherits:
  - docs/plans/james/sys-hardening/sys-hardening-p4-completion-report.md
  - docs/operations/capacity.md
  - docs/hardening/csp-enforcement-decision.md
  - docs/hardening/hsts-preload-audit.md
---

# System Hardening P5 — Certification Closure, Drift Containment, and Launch Readiness

## Overview

P5 closes the certification loop P4 left open. It is a closure phase — not a new hardening programme — that produces honest, dated evidence for three outcomes: 30-learner classroom beta certification, 60-learner stretch preflight, and CSP enforcement decision. The contract explicitly prohibits threshold relaxation, rate-limit weakening, or feature bundling.

The user constraint "no regression" is the primary execution guardrail: every unit must preserve multi-learner correctness, source lockdown, reward replay safety, and existing query budgets.

---

## Problem Frame

P4 built the correct certification machinery (evidence schema v2, provenance anti-fabrication, real `requireBootstrapCapacity` gates, CSP/HSTS decision gates) but failed to certify:

1. **30-learner cert failed** — bootstrap P95 was 1,126 ms vs 1,000 ms ceiling (+12.6%). Hypothesis: cold D1 statement cache after heavy deploy cycle.
2. **60-learner preflight invalid** — single load-generator IP hit `DEMO_LIMITS.createIp = 30` per 10-min window before reaching the application measurement phase.
3. **CSP enforcement deferred** — observation window (2026-04-27 to 2026-05-04) is still open.
4. **Post-P4 drift** — 19+ commits in rewards, SEO, Grammar, Punctuation since the P4 evidence baseline.

(see origin: `docs/plans/james/sys-hardening/sys-hardening-p5.md`)

---

## Requirements Trace

- R1. Capacity wording is evidence-tied — no "classroom ready" without dated v2 evidence (PR-1)
- R2. 30-learner certification uses existing threshold contract unchanged (PR-2)
- R3. Multi-learner account correctness remains non-negotiable (PR-3)
- R4. 60-learner preflight reaches application load, not setup failure (PR-4)
- R5. CSP has a real decision — enforced or dated deferral (PR-5)
- R6. HSTS preload remains gated, not forgotten (PR-6)
- R7. Post-P4 public pages do not weaken lockdown (PR-7)
- R8. Reward presentation remains downstream of committed truth (PR-8)
- R9. Producer-to-gate end-to-end tests for composition gaps (ER-1)
- R10. No silent success on missing evidence (ER-2)
- R11. Setup failures separated from app failures (ER-3)
- R12. Production rate limits stay safe (ER-4)
- R13. Bootstrap P95 investigation is route-level and data-level (ER-5)
- R14. CSP flip mechanically guarded by constant-to-header cross-assertion (ER-6)
- R15. Drift audit reproducible via scripts/tests (ER-7)

---

## Scope Boundaries

- No new child-facing subjects, Hero economy mechanics, or reward semantics
- No SEO content expansion beyond validating existing pages
- No major Admin feature expansion or broad repository rewrites
- No threshold relaxation to get a green run
- No production rate-limit weakening or spoofed IP trust
- No HSTS preload without DNS/operator sign-off
- No CSP enforcement before observation criteria are satisfied

### Deferred to Follow-Up Work

- Deeper `repository.js` pipeline decomposition for impure functions: P6
- Full Admin KPI pre-aggregation: P6
- Admin endpoint budget coverage beyond certification-critical set: P6
- Debug-bundle capacity collector instrumentation: P6
- 100+ learner repeated runs: P6
- Durable Object coordination analysis: P6
- HSTS preload activation if DNS sign-off incomplete: P6

---

## Context & Research

### Relevant Code and Patterns

- `scripts/classroom-load-test.mjs` — classroom load driver (session creation, cold-bootstrap burst, command rounds)
- `scripts/lib/capacity-evidence.mjs` — evidence schema v2, `EVIDENCE_SCHEMA_VERSION = 2`
- `scripts/verify-capacity-evidence.mjs` — verifier with anti-fabrication guards
- `reports/capacity/configs/30-learner-beta.json` — threshold config (maxBootstrapP95Ms: 1000)
- `reports/capacity/configs/60-learner-stretch.json` — stretch thresholds
- `worker/src/security-headers.js` — `CSP_ENFORCEMENT_MODE = 'report-only'`, `HSTS_PRELOAD_ENABLED = false`
- `worker/src/demo/sessions.js` — `DEMO_LIMITS.createIp = 30` (line 24)
- `worker/src/app.js` — GET/POST `/api/bootstrap` (lines 1234, 1281)
- `worker/src/bootstrap-repository.js` — multi-learner bootstrap logic
- `tests/worker-bootstrap-multi-learner-regression.test.js` — 4-learner account contract
- `tests/security-headers.test.js` — CSP_ENFORCEMENT_MODE constant assertion
- `tests/capacity-evidence-schema.test.js` — v2 gate, requireBootstrapCapacity
- `docs/hardening/csp-enforcement-decision.md` — observation window, daily log, flip criteria

### Institutional Learnings

- **P4 composition gap lesson** (`docs/solutions/workflow-issues/autonomous-certification-phase-wave-execution-2026-04-27.md`): gates reading fields from another module need end-to-end producer-to-consumer tests. NaN passes nullish checks — use `Number.isFinite`.
- **P3 measure-first-then-lock** (`docs/solutions/best-practices/p3-stability-capacity-multi-learner-patterns-2026-04-27.md`): never write a ceiling from first principles; characterise first.
- **P4 failure as evidence** (completion report §2): `decision=fail` preserves trust. Never retry silently without recording failed attempts.
- **Punctuation P7 manifest pattern** (`docs/solutions/architecture-patterns/punctuation-p7-stabilisation-contract-and-autonomous-sdlc-2026-04-28.md`): projection performance should be measured not assumed; stabilisation scope defined by outcomes.

### External References

- Cloudflare D1 performance characteristics: prepared statement caches warm after first execution per isolate
- CSP enforcement: `Content-Security-Policy` vs `Content-Security-Policy-Report-Only` are distinct header names, not a directive difference

---

## Key Technical Decisions

- **Warm-cache hypothesis first**: Re-run before investigating. P4's +12.6% overshoot coincided with heavy deploy cycle. A quiescent re-run is the cheapest test of the hypothesis.
- **Session-manifest approach for 60-learner**: Preferred over multi-runner orchestration because it keeps the driver single-process, avoids IP coordination complexity, and matches the evidence structure already in use.
- **CSP flip gated on observation window completion**: The decision is temporal (2026-05-04), not engineering-blocked. P5 executes the flip or records deferral after the window closes — not before.
- **Drift audit is test-driven**: No manual browsing. Run production audit, source-lockdown audit, multi-learner regression tests, and reward replay tests as the verification method.
- **No threshold relaxation**: If 30-learner fails again after warm cache, investigate and fix the route — do not change the ceiling.

---

## Open Questions

### Resolved During Planning

- **Session-manifest format**: Use JSON array of `{learnerId, sessionCookie}` objects, pre-created by the existing demo-session endpoint from multiple IPs or via operator fixture. The driver validates manifest completeness before starting load phase.
- **Where to split setup from app failures**: The load driver already tracks per-learner phases. Add an explicit `failureClass` field (`setup | auth | bootstrap | command | threshold | transport | evidence-write`) to each failure record.

### Deferred to Implementation

- Exact bootstrap P95 root cause (if warm re-run still fails) — depends on measured runtime behaviour
- Whether CSP daily log is populated enough by 2026-05-04 — temporal, cannot be resolved in planning
- Whether post-P4 reward presentation changes contribute to bootstrap payload growth — requires measurement

---

## Implementation Units

- U1. **P5 baseline and drift-surface freeze**

**Goal:** Record the current-main truth before any code changes. Establish the P5 starting position.

**Requirements:** R1, R7, R15

**Dependencies:** None

**Files:**
- Create: `docs/plans/james/sys-hardening/sys-hardening-p5-baseline.md`
- Modify: `docs/operations/capacity.md`

**Approach:**
- Record current main commit SHA, open PR count, latest capacity decision status
- List post-P4 changed surfaces with commit ranges (rewards, SEO, Grammar, Punctuation)
- Explicitly list P4 residuals accepted into P5 vs deferred to P6
- Set allowed capacity language to "Small-pilot-provisional. 30-learner certification is blocked by bootstrap P95 evidence."

**Test expectation:** None — documentation-only unit

**Verification:**
- Baseline doc committed before any P5 code changes
- Capacity.md does not use "classroom ready" or "supports a class" language

---

- U2. **Warm-cache 30-learner schema v2 re-run**

**Goal:** Test the cold-D1-cache hypothesis by re-running the 30-learner release gate after a quiescent period.

**Requirements:** R1, R2, R3, R9, R10

**Dependencies:** U1

**Files:**
- Create: `reports/capacity/evidence/30-learner-beta-v2-YYYYMMDD-p5-warm.json`
- Modify: `docs/operations/capacity.md`

**Approach:**
- Run `npm run capacity:classroom:release-gate` against production after confirming no deploys in the preceding 2+ hours (warm D1 statement caches)
- Use the same threshold config (`reports/capacity/configs/30-learner-beta.json`) without modification
- Record the evidence file with schema v2 and full provenance
- Run `npm run capacity:verify-evidence` to cross-check the result
- If pass: promote decision to `30-learner-beta-certified` in capacity.md
- If fail: do NOT promote; record failure honestly and trigger U3

**Test scenarios:**
- Happy path: P95 < 1000 ms on warm cache → evidence verifier passes, capacity decision promoted
- Fail path: P95 still > 1000 ms → evidence records `decision=fail`, U3 investigation triggered
- Edge case: evidence file has `NaN` or missing capacity fields → verifier rejects, run classified as invalid
- Integration: evidence JSON → verify-capacity-evidence → capacity.md table update pipeline

**Verification:**
- Evidence file is schema v2 with certifiable provenance
- `npm run capacity:verify-evidence` passes for the new evidence row
- Decision is either `30-learner-beta-certified` or honestly `fail` with measured values
- No threshold config modified

---

- U3. **Bootstrap P95 investigation and targeted fix**

**Goal:** If U2 fails, identify the structural cause of bootstrap P95 > 1000 ms and apply a targeted fix.

**Requirements:** R2, R3, R13

**Dependencies:** U2 (only if U2 fails)

**Files:**
- Modify: `worker/src/bootstrap-repository.js` (if fix needed)
- Modify: `worker/src/app.js` (if route-level change needed)
- Modify: `tests/worker-bootstrap-capacity.test.js`
- Modify: `tests/worker-bootstrap-multi-learner-regression.test.js`

**Approach:**
- Compare failed P4 evidence, P5 warm-run evidence, and focused bootstrap probe results
- Measure: query count vs `BUDGET_BOOTSTRAP_MULTI_LEARNER = 13`, D1 rows read, response bytes, not-modified path usage, selected vs sibling learner shape
- Check whether post-P4 commits (reward presentation, SEO, Grammar Phase 7) added bootstrap-path queries
- Identify fix direction: payload reduction, query tightening, deferred non-first-paint data, or regression correction
- Fix must NOT drop sibling learners from bootstrap (PR-3 guard)

**Execution note:** Characterisation-first — snapshot current bootstrap behaviour as a test fixture before modifying anything.

**Test scenarios:**
- Happy path: targeted fix brings P95 under 1000 ms on re-run → U2 re-executed successfully
- Edge case: fix reduces query count below current budget → budget constant updated with measure-first-then-lock pattern
- Error path: investigation proves bottleneck is D1 platform-level (not route-level) → blocker documented with evidence
- Integration: multi-learner bootstrap test still passes after fix (4-learner shape, sibling compact state present, selected learner heavy history bounded)

**Verification:**
- Root cause identified with evidence (query counts, response bytes, timing breakdown)
- Fix is a small targeted PR, not a broad rewrite
- `tests/worker-bootstrap-multi-learner-regression.test.js` passes
- `tests/worker-bootstrap-capacity.test.js` passes
- Bootstrap capacity version bumped only if envelope changes

---

- U4. **Load-driver session-manifest mode**

**Goal:** Enable the 60-learner preflight to reach application load by bypassing the single-IP demo-session creation limit via pre-created session credentials.

**Requirements:** R4, R11, R12

**Dependencies:** U1

**Files:**
- Modify: `scripts/classroom-load-test.mjs`
- Create: `scripts/lib/session-manifest.mjs`
- Create: `scripts/prepare-session-manifest.mjs`
- Create: `tests/capacity-session-manifest.test.js`

**Approach:**
- Add `--session-manifest <path>` flag to `parseClassroomLoadArgs`
- Manifest format: JSON array of `{learnerId, sessionCookie, createdAt, sourceIp}` objects
- When manifest provided, skip demo-session creation phase entirely; validate all sessions are live before starting load
- Add `failureClass` enum to per-learner results: `setup | auth | bootstrap | command | threshold | transport | evidence-write`
- Create `scripts/prepare-session-manifest.mjs` — operator utility that creates N sessions from multiple IPs (or sequentially with delays respecting rate limits)
- Evidence records `sessionSourceMode: 'manifest'` when manifest is used
- Production rate limits (`DEMO_LIMITS.createIp = 30`) remain unchanged in Worker code

**Test scenarios:**
- Happy path: `--session-manifest` with valid 60-entry manifest → driver skips session creation, runs bootstrap burst and command rounds
- Edge case: manifest has expired/invalid session → driver reports per-learner `failureClass: 'auth'`, separates from app failure
- Edge case: manifest has fewer entries than `--learners` → driver aborts with clear error before load phase
- Error path: `--session-manifest` combined with `--demo-sessions` → mutually exclusive, immediate reject
- Integration: evidence JSON records `sessionSourceMode: 'manifest'` and verify-capacity-evidence accepts it

**Verification:**
- `npm run capacity:classroom -- --dry-run --session-manifest <test-manifest> --learners 60` completes without error
- No change to `worker/src/demo/sessions.js` rate limits
- No `CF-Connecting-IP` trust or spoofing introduced
- `failureClass` field present in failure records

---

- U5. **60-learner stretch preflight re-run**

**Goal:** Record a real 60-learner preflight result that reaches `/api/bootstrap` and subject commands.

**Requirements:** R4, R10, R11

**Dependencies:** U4

**Files:**
- Create: `reports/capacity/evidence/60-learner-stretch-preflight-YYYYMMDD-p5.json`
- Modify: `docs/operations/capacity.md`

**Approach:**
- Prepare a 60-entry session manifest via `scripts/prepare-session-manifest.mjs`
- Run classroom load driver with `--session-manifest` flag, 60 learners, bootstrap-burst 30
- Record decision as one of: `60-learner-stretch-candidate`, `fail-with-root-cause`, `invalid-with-named-setup-blocker`
- If invalid, the blocker must be different from the already-known single-IP rate-limit
- No certification claim from a single preflight run

**Test scenarios:**
- Happy path: 60 learners reach bootstrap and command phases → decision is `candidate` with full metrics
- Fail path: P95 or 5xx thresholds exceeded → decision is `fail-with-root-cause` with bottleneck named
- Edge case: some manifest sessions expired during run → setup failures separated, app metrics computed from remaining sessions only
- Integration: evidence verifier accepts the 60-learner file with `sessionSourceMode: 'manifest'`

**Verification:**
- Evidence shows bootstrap and command request distributions (not just setup failures)
- Decision recorded in `docs/operations/capacity.md` honestly
- Bottleneck named if run fails
- `npm run capacity:verify-evidence` passes for the new file

---

- U6. **CSP enforcement flip or dated deferral**

**Goal:** Execute the CSP decision after the observation window closes on 2026-05-04.

**Requirements:** R5, R14

**Dependencies:** U1 (and temporal: must wait until 2026-05-04)

**Files:**
- Modify: `worker/src/security-headers.js`
- Modify: `docs/hardening/csp-enforcement-decision.md`
- Modify: `tests/security-headers.test.js`

**Approach:**

*If flipping (observation criteria met):*
- Set `CSP_ENFORCEMENT_MODE = 'enforced'`
- Change header key from `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in `SECURITY_HEADERS`
- Add cross-assertion: if mode is `enforced`, `SECURITY_HEADERS` must contain `Content-Security-Policy` and must NOT contain `Report-Only`; test fails on disagreement
- Restore `upgrade-insecure-requests` if compatible
- Update decision record with operator sign-off reference and daily log summary

*If deferring (criteria not met):*
- Keep `CSP_ENFORCEMENT_MODE = 'report-only'`
- Add dated deferral section to decision record with: reason, observed violations (or "daily log insufficiently populated"), owner, next review date
- Cross-assertion test still enforces that mode and header key agree (Report-Only in this case)

**Test scenarios:**
- Happy path (flip): `CSP_ENFORCEMENT_MODE === 'enforced'` → security-headers test asserts `Content-Security-Policy` key present, `Report-Only` absent
- Happy path (defer): `CSP_ENFORCEMENT_MODE === 'report-only'` → security-headers test asserts `Content-Security-Policy-Report-Only` key present
- Error path: mode says `enforced` but SECURITY_HEADERS still uses `Report-Only` key → test fails (mechanical guard)
- Integration: production audit (`npm run audit:production`) passes after the header change

**Verification:**
- Mode constant and header key provably agree (test assertion)
- Decision record updated with specific evidence (daily log summary or deferral reason)
- No dead mode constant
- `npm run audit:production -- --skip-local` passes

---

- U7. **Post-P4 drift audit**

**Goal:** Revalidate current main against reward, SEO, Grammar, and Punctuation changes that landed after P4.

**Requirements:** R7, R8, R15

**Dependencies:** U1

**Files:**
- Modify: existing test files as needed for new assertions
- No new production code (audit-only unit)

**Approach:**
- Run `npm run audit:client` — verify no source-path exposure, no private-state leak in public pages
- Run `npm run audit:production -- --skip-local` — verify robots/sitemap alignment, source lockdown
- Run `tests/worker-bootstrap-multi-learner-regression.test.js` — verify multi-learner correctness unchanged
- Verify reward presentation replay does not mutate state (check reward-presentations.js for side-effect-free replay)
- Verify SEO pages (`/ks2-spelling-practice`, `/ks2-grammar-practice`, `/ks2-punctuation-practice`) return public HTML only
- Verify Grammar/Punctuation reward display changes do not widen bootstrap payload (compare response bytes against P4 evidence)
- Verify generated metadata transport does not expose answer-bearing fields

**Execution note:** Characterisation-first — run all audits before asserting any drift. Record current state as baseline, then verify no regression from P4.

**Test scenarios:**
- Happy path: all audits pass, no private data in SEO pages, bootstrap payload within P4 range → drift contained
- Error path: source-lockdown regression found → blocking fix required before certification
- Edge case: reward presentation adds a new event type → verify it doesn't add bootstrap queries or mutate Hero economy state
- Integration: production audit + client audit + multi-learner regression suite all pass as a composition

**Verification:**
- `npm run audit:client` passes
- `npm run audit:production -- --skip-local` passes
- Multi-learner bootstrap tests pass
- No answer-bearing content exposed in public-facing responses
- Bootstrap response bytes not materially larger than P4 evidence baseline

---

- U8. **Admin capacity residual triage**

**Goal:** Document which Admin routes are certification-critical, ensure no Admin route touched by P5 loses tests, and explicitly defer non-critical residuals to P6.

**Requirements:** R3 (multi-learner correctness if Admin touches learner routes)

**Dependencies:** U1

**Files:**
- Modify: `docs/plans/james/sys-hardening/sys-hardening-p5-baseline.md` (add Admin triage section)

**Approach:**
- Verify `/api/admin/ops/kpi` remains manual-refresh and indexed (not live-count on every request)
- Verify debug-bundle limitations are labelled honestly
- Confirm no Admin endpoint touched in P5 loses access/redaction tests
- Explicitly defer to P6: full Admin KPI pre-aggregation, full endpoint budget coverage, debug-bundle capacity collector bypass fix

**Test scenarios:**
- Happy path: Admin access tests pass, KPI route is manual-refresh → no learner-route impact
- Edge case: Admin route performance blocks learner-route certification → escalate as P5 blocker with evidence

**Verification:**
- No Admin route touched by P5 lacks access tests
- Admin KPI live-count cost does not affect learner-route certification (verified by evidence or exclusion)
- Deferred items listed explicitly in P5 baseline

---

- U9. **HSTS preload status update**

**Goal:** Update the HSTS preload audit only if operator has new DNS facts. Do not block P5 on incomplete DNS audit.

**Requirements:** R6

**Dependencies:** U1

**Files:**
- Modify: `docs/hardening/hsts-preload-audit.md` (only if new operator facts available)

**Approach:**
- Check whether operator has filled any `TBD-operator` cells in the DNS audit table
- If yes: update the relevant cells and note which remain
- If no: leave unchanged, note "deferred; operator DNS audit incomplete" in completion report
- Verify `HSTS_PRELOAD_ENABLED` remains `false` in `worker/src/security-headers.js`
- Verify anti-preload gates in tests still assert `false`

**Test scenarios:**
- Happy path (no new facts): `HSTS_PRELOAD_ENABLED === false` assertion passes, audit doc unchanged
- Happy path (sign-off complete): flip constant to `true`, update all 4 anti-preload enforcement points in same PR
- Error path: accidental preload attempt without full sign-off → tests catch the disagreement

**Verification:**
- `HSTS_PRELOAD_ENABLED` remains `false` unless full sign-off is complete
- No accidental preload (test assertion)
- Status clearly stated for completion report

---

- U10. **P5 completion report**

**Goal:** Write the honest completion report summarising all P5 outcomes.

**Requirements:** R1, R10

**Dependencies:** U2, U3 (if triggered), U4, U5, U6, U7, U8, U9

**Files:**
- Create: `docs/plans/james/sys-hardening/sys-hardening-p5-completion-report.md`

**Approach:**
- Record: current-main baseline commit, all P5 PRs/commits, test and smoke evidence actually run
- State 30-learner certification result (certified or honestly blocked with root cause)
- State 60-learner preflight result (candidate, fail-with-root-cause, or invalid-with-named-blocker)
- State CSP decision result (enforced with evidence, or deferred with reason)
- State post-P4 drift audit result (clean or blocker carried)
- List deferred items plainly with owners and recommended P6 scope
- Do not claim any command was run unless it was actually run and its result is recorded

**Test expectation:** None — documentation-only unit

**Verification:**
- Every capacity claim has a dated evidence file reference
- Every command claimed to have been run has a recorded result
- Deferred items are explicit with P6 attribution
- No ambiguous launch language

---

## System-Wide Impact

- **Interaction graph:** Capacity load driver → demo-session endpoint → bootstrap route → D1 queries → evidence verifier → capacity.md. CSP mode constant → `SECURITY_HEADERS` → response headers → browser enforcement. Session-manifest utility → load driver → evidence.
- **Error propagation:** Load-driver failures propagate as `failureClass` taxonomy. Evidence verifier failures prevent certification promotion. CSP test failures prevent flip PR merge.
- **State lifecycle risks:** Cold D1 statement cache invalidation timing; session expiry during long load runs; concurrent deploy during capacity run.
- **API surface parity:** `CSP_ENFORCEMENT_MODE` must agree with header key (mechanical test). Evidence schema version must match tier requirements. Bootstrap capacity version must match envelope shape.
- **Integration coverage:** Producer-to-consumer pipeline (evidence → verifier → docs) tested end-to-end. CSP constant → header → audit tested end-to-end.
- **Unchanged invariants:** Multi-learner 4-account contract (all writable learners appear, sibling compact state present, selected learner bounded). Source lockdown (`/src/*`, `/shared/*`, `/worker/*`, `/tests/*`, `/docs/*`, `/legacy/*` denied). Reward presentation is side-effect-free replay. `DEMO_LIMITS.createIp = 30` unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Warm-cache re-run still fails (cold D1 is not the cause) | U3 investigation path with route-level instrumentation; fix must be targeted |
| CSP daily log unpopulated by 2026-05-04 | Honest deferral with "insufficient sample size" reason; does not block P5 |
| 60-learner sessions expire during preflight | Manifest preparation utility validates session liveness; short-lived runs |
| Post-P4 reward changes widened bootstrap payload | U7 drift audit catches this; U3 fixes if it contributed to P95 regression |
| Production Worker redeploys during capacity run | Operator ensures quiescent window; evidence records `dirtyTreeFlag` |

---

## Sources & References

- **Origin document:** [docs/plans/james/sys-hardening/sys-hardening-p5.md](docs/plans/james/sys-hardening/sys-hardening-p5.md)
- **P4 completion report:** [docs/plans/james/sys-hardening/sys-hardening-p4-completion-report.md](docs/plans/james/sys-hardening/sys-hardening-p4-completion-report.md)
- **CSP decision record:** [docs/hardening/csp-enforcement-decision.md](docs/hardening/csp-enforcement-decision.md)
- **HSTS audit:** [docs/hardening/hsts-preload-audit.md](docs/hardening/hsts-preload-audit.md)
- **Capacity runbook:** [docs/operations/capacity.md](docs/operations/capacity.md)
- **P4 certification failure evidence:** [reports/capacity/evidence/30-learner-beta-v2-20260428.json](reports/capacity/evidence/30-learner-beta-v2-20260428.json)
- **P4 60-learner preflight failure:** [reports/capacity/evidence/60-learner-stretch-preflight-20260428.json](reports/capacity/evidence/60-learner-stretch-preflight-20260428.json)
- **Institutional learning — certification phase execution:** [docs/solutions/workflow-issues/autonomous-certification-phase-wave-execution-2026-04-27.md](docs/solutions/workflow-issues/autonomous-certification-phase-wave-execution-2026-04-27.md)
- **Institutional learning — measure-first-then-lock:** [docs/solutions/best-practices/p3-stability-capacity-multi-learner-patterns-2026-04-27.md](docs/solutions/best-practices/p3-stability-capacity-multi-learner-patterns-2026-04-27.md)
