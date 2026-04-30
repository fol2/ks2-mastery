---
title: "System Hardening Optimisation P4 — Implementation Plan"
type: feat
status: active
date: 2026-04-30
origin: docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4.md
---

# System Hardening Optimisation P4 — Implementation Plan

## Overview

Promote the P3 terminal strict 30-learner evidence into a reviewed capacity-status row (governance), prepare and validate 60-learner diagnostic tooling, refresh the 1000-learner budget ledger, and establish fail-closed regression tests ensuring diagnostics cannot masquerade as certification. This is infrastructure and governance work — no runtime performance code changes.

---

## Problem Frame

P3 closed the telemetry gap and produced three passing strict 30-learner production runs with joined invocation CPU/wall and statement-log coverage. The P3 terminal outcome is `strict-30-certified-candidate` — candidate, not certified. The verified capacity evidence table and generated latest summary remain fail-closed (`evidence-not-in-verified-capacity-table`). P4 must complete the governance step to promote that candidate, then establish diagnostic readiness for the 60-learner shape.

(see origin: `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4.md`)

---

## Requirements Trace

- R1. Promote P3-T5 repeat 2 into the verified capacity evidence table as `30-learner-beta-certified`
- R2. Regenerate `reports/capacity/latest-evidence-summary.json` to reflect promotion
- R3. Verify Admin Production Evidence displays `CERTIFIED_30` only from the reviewed table row
- R4. Add fail-closed regression tests: diagnostics/preflights/smoke cannot certify
- R5. Prepare 60-learner diagnostic infrastructure (session manifest, operator checklist, config validation)
- R6. Refresh `reports/capacity/latest-1000-learner-budget.json` preserving `modellingOnly: true`
- R7. Record baseline truth before any changes
- R8. Write capacity-status report documenting the promotion decision
- R9. No threshold relaxation in any artefact
- R10. No runtime performance code changes
- R11. Raw log/redaction boundary preserved (no raw captures committed)

---

## Scope Boundaries

- No learner-facing UX changes
- No Hero Mode, coins, Stars, or subject content work
- No D1/index optimisation or Worker CPU mitigation
- No command batching or threshold relaxation
- No public 60/100/300/1000 learner claims
- No broad repository refactor
- Capacity claims limited to 30-learner beta

### Deferred to Follow-Up Work

- **60-learner production diagnostic run** (contract P4-U3 tasks 3–5): requires human operator with Cloudflare production access and simultaneous tail capture (DEFERRED: requires human — see detailed justification below)
- **60-learner classification and decision record** (contract P4-U4 tasks 1–4): classification depends on production diagnostic results that cannot be simulated (DEFERRED: requires human — depends on production run results)
- **Phase 5 mitigation implementation**: P4 recommends a path but does not implement it

### Contract Unit Mapping

| Contract unit | Plan unit | Status |
|---|---|---|
| P4-U0 Baseline lock | U1 | Autonomous |
| P4-U1 30-learner capacity-status update | U2 | Autonomous |
| P4-U2 Admin/evidence fail-closed regression tests | U3 | Autonomous |
| P4-U3 60-learner diagnostic preparation (tasks 1–2, 6) | U4 | Autonomous (preparation only) |
| P4-U3 60-learner diagnostic execution (tasks 3–5) | — | DEFERRED: requires human |
| P4-U4 60-learner classification (tasks 1–4) | — | DEFERRED: requires production results |
| P4-U4 1000-learner path decision (task 5) | U8 | Autonomous (derivable from existing ledger) |
| P4-U5 1000-learner budget refresh | U5 | Autonomous |
| P4-U6 Completion report and handoff | U7 | Autonomous (terminal at exit state `30-learner-beta-promoted-60-diagnostic-blocked`) |

---

## Context & Research

### Relevant Code and Patterns

- `docs/operations/capacity.md` — verified capacity evidence table (lines 195-201)
- `scripts/generate-evidence-summary.mjs` — `generateEvidenceSummary()` produces `latest-evidence-summary.json`
- `scripts/verify-capacity-evidence.mjs` — verifier with `parseEvidenceTable()`, `verifyEvidenceRow()`, decision tier enum
- `src/platform/hubs/admin-production-evidence.js` — 11-state classification, lane definitions, `buildEvidencePanelModel()`
- `scripts/build-capacity-budget-ledger.mjs` — 1000-learner projection with `CLOUDFLARE_FREE_LIMITS`
- `reports/capacity/configs/30-learner-beta.json` — pinned threshold: bootstrap P95 1000ms, command P95 750ms
- `reports/capacity/configs/60-learner-stretch.json` — pinned threshold: bootstrap P95 750ms, command P95 400ms
- `reports/capacity/evidence/2026-04-30-p3-t5-strict-r2.json` — P3 terminal candidate row

### Institutional Learnings

- **Session-manifest mode** required for 60+ learners (P5 learning): `DEMO_LIMITS.createIp = 30` blocks single-host 60-learner setup
- **Characterisation-first**: Lock current state before promotion (P3 patterns doc)
- **Vacuous-truth guards**: Assert `array.length > 0` before `.every()` in evidence assertions
- **failureClass taxonomy**: Distinguish `setup` from `bootstrap` failures in 60-learner output
- **Evidence-locked certification**: Status flows through verifier + generated summary, never declared directly
- **Provenance-gating**: Diagnostic runs classified differently from certification-tier runs

### External References

- Cloudflare Workers limits: `workers/platform/limits/`
- Cloudflare D1 pricing and limits
- Current free-tier caps used by budget model: 100K requests/day, 10ms CPU/invocation, 5M rows read/day, 100K rows written/day

---

## Key Technical Decisions

- **Promote P3-T5 repeat 2** (not T1 or repeat 1): Latest strict run, highest bootstrap P95 (715.2ms) — most conservative passed evidence
- **Row decision `30-learner-beta-certified`**: Matches the closed enum in `DECISION_TIERS` and the threshold config tier name
- **Operator checklist for 60-learner**: Session-manifest mode with bucket-reset delay between batches (28/28/4 pattern from P6 learning)
- **Budget refresh integrates P3 CPU telemetry**: Worker CPU route-cost entries from P3 tail joins populate previously-unknown CPU column
- **Terminal outcome if 60 diagnostic cannot run**: `30-learner-beta-promoted-60-diagnostic-blocked` with named blocker

---

## Open Questions

### Resolved During Planning

- **Which P3 row to promote?** P3-T5 repeat 2 (`b469e58`) — latest, conservative, recommended by P3 completion report
- **Does the verifier accept the promotion?** Yes — the row meets all verification criteria: schema v3, production env, 40-char commit, arithmetic identity, timing order, git ancestry reachable
- **How does summary regeneration pick up the promoted row?** `classifyTier()` filename cascade matches `*p3-t5-strict-r2*` → 30-learner tier; with the row now in the verified table, `certificationEligible` flips to `true`

### Deferred to Implementation

- **Exact format of the session-manifest operator checklist**: Will follow the existing pattern in `docs/operations/capacity-tail-latency.md`
- **Whether P3 tail-correlation CPU data integrates cleanly into the budget ledger route-cost model**: Depends on `normaliseRouteCost()` shape compatibility with tail-join output

---

## Implementation Units

- U1. **Baseline lock**

**Goal:** Record post-P3 truth before any changes, establishing the starting state for P4.

**Requirements:** R7

**Dependencies:** None

**Files:**
- Create: `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-baseline.md`

**Approach:**
- Read current `main` HEAD commit, P3 evidence files, latest-evidence-summary.json, latest-1000-learner-budget.json
- Document all P3 terminal evidence (T1, T5-R1, T5-R2) with key metrics
- Record current public/Admin status as `small-pilot-provisional`
- Record fail-closed state for P3 candidate
- Confirm P3 telemetry-gate report is superseded by final P3 completion report

**Patterns to follow:**
- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3-baseline.md` structure

**Test scenarios:**
- Test expectation: none — pure documentation artefact with no runtime behaviour

**Verification:**
- Baseline document exists, records `strict-30-certified-candidate` starting state
- Records `evidence-not-in-verified-capacity-table` as current fail-closed status
- Records 60+ and 1000 learners as unverified
- No mitigation path selected

---

- U2. **30-learner capacity-status promotion**

**Goal:** Add the P3-T5 repeat 2 evidence as a reviewed row in the verified capacity table and regenerate the latest evidence summary to reflect `30-learner-beta-certified`.

**Requirements:** R1, R2, R3, R9, R10

**Dependencies:** U1

**Files:**
- Modify: `docs/operations/capacity.md`
- Modify: `reports/capacity/latest-evidence-summary.json` (regenerated)
- Modify: `scripts/generate-evidence-summary.mjs` (if changes needed to recognise verified-table presence)

**Approach:**
- **Commit ancestry pre-check**: Before adding the row, run `git cat-file -e b469e585c193b6197fdf1b98ac649de782d03027^{commit}` to confirm the evidence commit exists in the repo object store. The verifier's `probeEvidenceCommitPresence()` hard-fails on missing commits regardless of env vars (Round 8 P1 hardening). If the commit is missing (production deploy from a pre-squash state), resolution: find the squash-merge commit that landed the P3 evidence code and either update `reportMeta.commit` in the evidence JSON to the merge commit SHA (if provenance is equivalent), or halt with `30-status-promotion-blocked` and document the root cause. Note: `CAPACITY_VERIFY_SKIP_ANCESTRY=1` bypasses only the ancestry-reachability check, not the existence probe.
- Add a new row to the `## Capacity Evidence` table in `docs/operations/capacity.md` using values from `reports/capacity/evidence/2026-04-30-p3-t5-strict-r2.json`:
  - Date: 2026-04-30
  - Commit: b469e58 (7-char prefix in table, full SHA in evidence)
  - Env: production
  - Plan: 30-learner-beta P3-T5 strict repeat 2
  - Learners: 30, Burst: 20, Rounds: 1
  - P95 Bootstrap: 715.2, P95 Command: 279.7, Max Bytes: 29597
  - 5xx: 0, Signals: none
  - Decision: `30-learner-beta-certified`
  - Evidence: `[json](reports/capacity/evidence/2026-04-30-p3-t5-strict-r2.json)`
- Update the narrative note below the table to reflect the promotion
- Run `node scripts/generate-evidence-summary.mjs` to regenerate `latest-evidence-summary.json`
- The summary generator's `classifyTier()` will detect the 30-learner evidence, and with the verified table now containing the row, `certificationEligible` should become `true` and `certifying` should become `true`
- **Staleness mitigation**: Tests asserting Admin model state must inject a mocked `now` parameter (within 24h of `finishedAt: 2026-04-30T03:08:07.687Z`) to avoid the 24-hour freshness gate in `classifyEvidenceMetric()`
- Verify no threshold config files are modified
- Verify no runtime source code is modified

**Patterns to follow:**
- Existing row format in `docs/operations/capacity.md` lines 197-200
- Evidence summary generation pattern in `scripts/generate-evidence-summary.mjs`

**Test scenarios:**
- Happy path: Run `npm run capacity:verify-evidence` — passes with new row accepted
- Happy path: Regenerated summary shows `certifying: true` for `certified_30_learner_beta` metric
- Happy path: Summary `verifiedCapacityRowDecision` now shows `30-learner-beta-certified`
- Edge case: P2 failed rows remain in table with `fail` decision unchanged
- Edge case: Preflight 60-learner row remains in separate Capacity Preflight section (not promoted)
- Error path: If verifier rejects the row (commit ancestry fails), halt and report blocker
- Integration: Admin model `classifyEvidenceMetric()` returns `CERTIFIED_30` for the promoted metric

**Verification:**
- `npm run capacity:verify-evidence` passes without `CAPACITY_VERIFY_SKIP_ANCESTRY`
- `reports/capacity/latest-evidence-summary.json` shows `certifying: true` for the 30-learner tier
- No changes to `reports/capacity/configs/*.json`
- No changes to `src/` or `worker/` directories
- `docs/operations/capacity.md` has exactly one new row with decision `30-learner-beta-certified`

---

- U3. **Admin and evidence fail-closed regression tests**

**Goal:** Prove that the status promotion is safe by ensuring diagnostics, preflights, smoke, and stale evidence cannot independently promote capacity status.

**Requirements:** R4, R3

**Dependencies:** U2

**Files:**
- Modify: `tests/admin-production-evidence.test.js`
- Modify: `tests/verify-capacity-evidence.test.js`
- Modify: `tests/generate-evidence-summary.test.js`

**Approach:**
- Add test cases covering 7 fail-closed scenarios listed in contract P4-U2:
  1. Promoted 30-learner beta row → state `CERTIFIED_30`
  2. Diagnostic `*-tail-correlation.json` cannot produce certification state
  3. Failed setup evidence remains `FAILING` or `NON_CERTIFYING`
  4. P3-T0 smoke evidence cannot certify (backs `smoke-pass` only)
  5. 60-learner preflight remains `PREFLIGHT_ONLY` (not `CERTIFIED_60`)
  6. Stale or missing latest summary does not produce certification
  7. Rate-limited evidence cannot overwrite a promoted row
- Each test constructs minimal evidence fixtures and asserts the classification function returns the correct state
- Vacuous-truth guard: every `.every()` assertion preceded by `assert(arr.length > 0)`

**Execution note:** Characterisation-first — verify current behaviour with existing promoted row state before adding new scenarios.

**Patterns to follow:**
- `tests/admin-production-evidence.test.js` existing `classifyEvidenceMetric()` test structure
- `tests/verify-capacity-evidence.test.js` fixture-based verification pattern
- `tests/generate-evidence-summary.test.js` summary output shape assertions

**Test scenarios:**
- Happy path: Promoted 30-learner row classifies as `CERTIFIED_30` in admin model
- Happy path: `buildEvidencePanelModel()` shows capacity_certification lane as green when promoted row present
- Edge case: Tail-correlation JSON placed in evidence directory does NOT change summary certification status
- Edge case: Evidence file with `dryRun: true` classifies as `NON_CERTIFYING` regardless of thresholds passing
- Edge case: Preflight evidence with all thresholds passing still returns `PREFLIGHT_ONLY`
- Edge case: Summary with `generatedAt` older than 24h returns `STALE` state
- Edge case: Missing `certified_30_learner_beta` metric key in summary returns `NOT_AVAILABLE`
- Error path: Evidence with `ok: false` classifies as `FAILING` even in certification lane
- Integration: Full pipeline — add row to capacity.md → verifier accepts → summary regenerates → admin model reflects

**Verification:**
- All new tests pass: `node --test tests/admin-production-evidence.test.js tests/verify-capacity-evidence.test.js tests/generate-evidence-summary.test.js`
- Existing tests remain green (no regressions)
- `npm test` passes
- `npm run check` passes

---

- U4. **60-learner diagnostic preparation and operator checklist**

**Goal:** Prepare all tooling, configuration, and documentation so a human operator can execute the 60-learner diagnostic with a single command sequence.

**Requirements:** R5, R11

**Dependencies:** U2

**Files:**
- Modify: `docs/operations/capacity-tail-latency.md` (add P4 operator checklist section)
- Create: `reports/capacity/configs/p4-60-diagnostic-checklist.md` (operator reference)

**Approach:**
- Document the session-manifest approach (28/28/4 batches with 10-minute bucket-reset delay)
- Record that `DEMO_LIMITS.createIp = 30` requires session-manifest mode for 60 learners
- Specify the exact command sequence for the operator:
  1. Prepare session manifest (pre-create sessions with rate-limit compliance)
  2. Start bounded raw JSON tail capture (local, outside git)
  3. Run `npm run capacity:classroom -- --origin https://ks2.eugnel.uk --demo-sessions --learners 60 --bootstrap-burst 20 --rounds 1 --config reports/capacity/configs/60-learner-stretch.json --output reports/capacity/evidence/2026-04-30-p4-60-diagnostic.json`
  4. Correlate tail capture → produce `*-tail-correlation.json` and `*-statement-map.json`
  5. Classify using P4 vocabulary
- Validate that `reports/capacity/configs/60-learner-stretch.json` exists and has correct thresholds (750ms bootstrap P95, 400ms command P95)
- Validate `.gitignore` patterns exclude raw tail captures

**Patterns to follow:**
- Existing operator guidance in `docs/operations/capacity-tail-latency.md`
- P6 session-manifest approach documented in capacity.md Capacity Preflight section

**Test scenarios:**
- Happy path: `60-learner-stretch.json` config file exists with expected threshold values
- Happy path: `.gitignore` excludes `*.jsonl` raw tail captures from `reports/capacity/`
- Edge case: Operator checklist references correct bucket-reset timing (10 minutes per DEMO_LIMITS)

**Verification:**
- `reports/capacity/configs/60-learner-stretch.json` validated (thresholds match contract: bootstrap 750ms, command 400ms)
- Operator checklist is complete and actionable
- Raw log exclusion pattern confirmed in `.gitignore`
- No production run actually executed (preparation only)

---

- U5. **1000-learner budget refresh**

**Goal:** Rebuild the 1000-learner budget ledger incorporating available P3/P4 CPU telemetry from tail-correlation joins while preserving `modellingOnly: true`.

**Requirements:** R6, R9

**Dependencies:** U2

**Files:**
- Modify: `reports/capacity/latest-1000-learner-budget.json` (regenerated)
- Modify: `docs/operations/capacity-1000-learner-free-tier-budget.md` (P4 note)

**Approach:**
- Run `node scripts/build-capacity-budget-ledger.mjs` with the latest P3 evidence as input
- Check whether P3 tail-correlation CPU data can feed into route-cost model via `normaliseRouteCost()`
- If CPU telemetry integrates: Worker CPU column moves from `unknown` to a measured value for bootstrap/command routes
- If integration is not compatible: keep Worker CPU as explicitly `unknown` and note why
- Preserve `modellingOnly: true` and `certifying: false` in output
- D1 rows written remains the predicted first red ceiling (1,008% at 1000 learners expected)
- Add a P4 update note to `docs/operations/capacity-1000-learner-free-tier-budget.md`
- Preserve all unknown route costs (parent/admin, demo/session setup, Hero routes)

**Patterns to follow:**
- `scripts/build-capacity-budget-ledger.mjs` CLI interface
- Existing `reports/capacity/latest-1000-learner-budget.json` structure

**Test scenarios:**
- Happy path: Budget regenerates with correct free-tier limits (100K requests, 5M reads, 100K writes)
- Happy path: `modellingOnly` remains `true` in output
- Happy path: `certifying` remains `false` in output
- Edge case: D1 rows written at 1000 learners expected remains red (>= 80% of limit)
- Edge case: Unknown route costs (parent/admin) remain explicitly marked
- Integration: `npm run capacity:verify-evidence` still passes after budget regeneration (budget is not part of verification gate)

**Verification:**
- `reports/capacity/latest-1000-learner-budget.json` has `modellingOnly: true` and `certifying: false`
- D1 rows written visible as red surface
- Worker CPU either measured (if integration succeeds) or explicitly unknown
- `tests/capacity-budget-ledger.test.js` passes
- Ledger cannot be interpreted as a public capacity claim

---

- U6. **Capacity status report**

**Goal:** Document the 30-learner beta promotion decision and record the P4 governance outcome for the status change.

**Requirements:** R8, R1

**Dependencies:** U2, U3

**Files:**
- Create: `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-capacity-status-report.md`

**Approach:**
- Record the reviewed P3-T5 repeat 2 evidence row details
- Record the verifier pass result
- Record the summary regeneration outcome
- Record that Admin Production Evidence now shows `CERTIFIED_30`
- Record that diagnostics remain diagnostic-only (tail-correlation cannot certify)
- Record that the public claim is now `30-learner-beta-certified` (upgraded from `small-pilot-provisional`)
- Note that 60+ remains unclaimed pending diagnostic run
- Note that 1000-learner budget remains non-certifying

**Patterns to follow:**
- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3-completion-report.md` structure

**Test scenarios:**
- Test expectation: none — pure documentation artefact

**Verification:**
- Report exists and accurately reflects the promotion outcome
- No wording exceeds `30-learner-beta-certified`
- 60/100/1000 claims explicitly absent

---

- U7. **P4 completion report (terminal)**

**Goal:** Close P4 with a definitive terminal outcome of `30-learner-beta-promoted-60-diagnostic-blocked` — this is the final document, not a draft to be revised later.

**Requirements:** R7 (terminal outcome)

**Dependencies:** U1, U2, U3, U4, U5, U6, U8

**Files:**
- Create: `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-completion-report.md`

**Approach:**
- Record all 10 required completion report sections from contract P4-U6 as follows:
  1. **Source boundary**: GitHub `main` full clone
  2. **P3 candidate row status**: Promoted via verified table row
  3. **Whether 30-learner beta was promoted**: Yes — `30-learner-beta-certified`
  4. **60 diagnostic result and classification**: `diagnostic-setup-blocked` — production Cloudflare access and simultaneous tail capture required; autonomous preparation delivered (U4) but execution requires operator (exit state per contract Section 10)
  5. **Latest evidence summary state**: `certifying: true` for `certified_30_learner_beta`
  6. **Admin Production Evidence state**: `CERTIFIED_30` via reviewed capacity table row
  7. **1000 budget state**: `modellingOnly: true`, `certifying: false`, D1 writes red
  8. **Raw-log/redaction scan result**: No raw captures in git (`.gitignore` validated)
  9. **Verifier/test results**: All pass without ancestry bypass
  10. **Recommended Phase 5 path**: Recorded from U8 decision (1000-learner path derived from ledger)
- Terminal outcome: `30-learner-beta-promoted-60-diagnostic-blocked`
- Next operator action: Execute 60-learner diagnostic per U4 checklist, write decision record (contract P4-U4), then create a separate P4.5 or P5 plan
- This report is final and will not be revised — subsequent diagnostic work produces its own artefacts

**Patterns to follow:**
- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3-completion-report.md` structure
- Contract Section 6 P4-U6 required content list
- Contract Section 10 exit state definitions

**Test scenarios:**
- Test expectation: none — pure documentation artefact

**Verification:**
- Report records exactly one terminal outcome: `30-learner-beta-promoted-60-diagnostic-blocked`
- All 10 contract-required sections populated with definitive content (no placeholders or "TBD")
- No public claim exceeds `30-learner-beta-certified`
- 60-learner result populated with named blocker (not left blank)
- Recommended Phase 5 path populated from U8 ledger-derived decision

---

- U8. **1000-learner path decision (from existing ledger)**

**Goal:** Deliver contract P4-U4 task 5 — record whether the 1000-learner budget should move next to write-amplification work or stay blocked by missing route costs. This is derivable from committed ledger data without a 60-learner diagnostic.

**Requirements:** R6 (partial — the path decision portion)

**Dependencies:** U5

**Files:**
- Create: `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-1000-learner-path-decision.md`

**Approach:**
- Read `reports/capacity/latest-1000-learner-budget.json` (refreshed in U5)
- Assess current red/unknown surfaces:
  - D1 rows written: 1,008% of free-tier at 1000 learners expected (RED)
  - Worker CPU: unknown (missing measured route costs for parent/admin/Hero)
  - D1 rows read: 16.51% lower-bound (unknown due to missing route coverage)
- Decision logic:
  - If D1 rows written remains the dominant red surface AND route costs remain incomplete → decision: "stay blocked by missing route costs — measure parent/admin/Hero route costs before committing to write-amplification work"
  - If CPU integration from U5 reveals CPU as a new constraint → decision: "investigate CPU budget before write-amplification"
  - Default (most likely given current data): "1000-learner budget stays blocked by missing measured route costs; write-amplification work is premature until parent/admin/demo/Hero route costs are measured"
- Record rejected alternatives (e.g., "start write-amplification immediately" rejected because unknown routes may dominate)
- This decision is independent of 60-learner diagnostic results — it concerns the modelling ledger, not the latency tail

**Patterns to follow:**
- Contract P4-U4 decision record structure (minus the 60-learner classification which is deferred)
- Ledger's existing traffic-mode scenario tables

**Test scenarios:**
- Test expectation: none — pure documentation artefact derived from ledger analysis

**Verification:**
- Document states one clear decision about 1000-learner next path
- Decision is grounded in ledger evidence (specific numbers cited)
- Rejected alternatives documented with rationale
- Does not claim 1000-learner capacity is certified or achievable

---

## DEFERRED: Requires Human

### 60-learner production diagnostic run (contract P4-U3, tasks 3–5)

**Contract tasks deferred:**
- Task 3: Start bounded raw JSON tail capture (`npm run ops:tail:json > "$RAW_LOG"`)
- Task 4: Run 60-learner shape (`npm run capacity:classroom -- --origin https://ks2.eugnel.uk ...`)
- Task 5: Produce `*-tail-correlation.json`, `*-statement-map.json`, `*-tail-classification.md`

**Why deferred:** Requires:
1. Network access to production Cloudflare Workers at `https://ks2.eugnel.uk`
2. Simultaneous Cloudflare `wrangler tail` capture (requires Cloudflare account credentials)
3. Session-manifest preparation against live demo-session API (rate-limited per IP)
4. Operator monitoring during the run to capture raw logs locally (outside git)

**Why not autonomously convertible:** The diagnostic purpose is measuring real production D1/Worker/platform tail latency at 60 concurrent learners. Simulating this defeats the diagnostic — synthetic evidence would not answer whether the production system handles 60 learners. The contract's P4-U3 title says "preparation" but tasks 3–5 use imperative execution verbs. We interpret this as: preparation is autonomous (delivered by plan U4); execution requires production credentials the agent does not hold.

**Autonomous preparation delivered:** U4 delivers complete operator checklist, validated configuration, session-manifest strategy, and `.gitignore` exclusion proof. The human step is reduced to executing the documented command sequence.

**Upon completion:** Operator creates `reports/capacity/evidence/2026-04-30-p4-60-diagnostic.json`, correlates tail capture, and classifies per P4 vocabulary. This produces the input needed for the deferred P4-U4 classification below.

### 60-learner classification and decision record (contract P4-U4, tasks 1–4)

**Contract tasks deferred:**
- Task 1: Write `sys-hardening-optimisation-p4-decision-record.md`
- Task 2: State one and only one recommended Phase 5 path
- Task 3: Document rejected alternatives
- Task 4: State whether 60 should be rerun, certified later, or held at diagnostic-only

**Why deferred:** Each of these tasks requires the 60-learner diagnostic result as input. The classification labels (`d1-dominated`, `worker-cpu-dominated`, etc.) are derived from top-tail sample analysis of production CPU/wall telemetry at 60 concurrent learners. Without that data, any classification would be speculation.

**Not deferred (contract P4-U4, task 5):** "Record whether the 1000-learner budget should move next to write-amplification work or stay blocked by missing route costs" — this is delivered autonomously by plan U8, since it depends on the committed budget ledger data (already available), not on 60-learner diagnostic results.

**Upon completion:** Operator writes the full decision record after the diagnostic run, selecting one Phase 5 path from evidence.

---

## System-Wide Impact

- **Interaction graph:** `generate-evidence-summary.mjs` reads verified capacity table + evidence files → produces summary JSON → consumed by `admin-production-evidence.js` model → rendered by `AdminProductionEvidencePanel.jsx`
- **Error propagation:** If the promoted row fails verification, the entire pipeline remains fail-closed. No partial promotion possible.
- **State lifecycle risks:** None — this is additive (new table row) not mutative. Existing rows unchanged.
- **API surface parity:** Admin panel displays evidence state; no API endpoint changes.
- **Integration coverage:** End-to-end pipeline (table row → verifier → summary → admin model → React panel) tested in U3.
- **Unchanged invariants:** All existing evidence rows retain their current decisions. Threshold configs unchanged. Runtime Worker code unchanged. Client bundle unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| P3-T5 repeat 2 commit (`b469e58...`) not in repo object store | Pre-check with `git cat-file -e`. If missing: the production deploy was from a pre-squash branch state. Resolution paths: (a) find the squash-merge commit that landed the P3 code and confirm the evidence JSON's `reportMeta.commit` can be traced to that merge, or update the commit field to the merge commit SHA if provenance is equivalent, (b) halt as `30-status-promotion-blocked` with named root cause. Note: `CAPACITY_VERIFY_SKIP_ANCESTRY=1` does NOT bypass the commit existence probe (Round 8 P1 hardening) — only the ancestry-reachability check. A commit that doesn't exist in the object store fails regardless of env vars. |
| Summary generator does not recognise verified-table presence for certification flip | Read `generate-evidence-summary.mjs` source during implementation. May need to add verified-table cross-reference. The generator currently checks filename patterns; promotion may require linking the table row decision to the summary output. |
| Admin 24-hour staleness gate classifies promoted evidence as STALE | All tests using `classifyEvidenceMetric()` must inject a mocked `now` within 24h of the evidence `finishedAt`. Document this pattern in test file comments. |
| Budget ledger CPU integration incompatible with tail-correlation format | Fallback: keep CPU as explicitly unknown and note the format gap for P5 to resolve. |
| Raw tail captures accidentally staged | `.gitignore` validation in U4 + `tests/capacity-raw-log-gitignore.test.js` existing coverage. |

---

## Sources & References

- **Origin document:** [sys-hardening-optimisation-p4.md](docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4.md)
- **P3 completion report:** [sys-hardening-optimisation-p3-completion-report.md](docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3-completion-report.md)
- **P5 certification closure learning:** `docs/solutions/architecture-patterns/sys-hardening-p5-certification-closure-d1-latency-and-evidence-culture-2026-04-28.md`
- **P3 convergent sprint patterns:** `docs/solutions/best-practices/p3-stability-capacity-multi-learner-patterns-2026-04-27.md`
- **Evidence-locked certification pattern:** `docs/solutions/architecture-patterns/evidence-locked-production-certification-2026-04-29.md`
- Related PRs: P3 PR #723 (merged), P2 evidence PRs
