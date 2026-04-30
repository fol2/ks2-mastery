# Hero Mode pA3 — Plan Completion Report

**Phase:** pA3 — Real-Cohort Evidence Hardening and External-Cohort Readiness Contract  
**Date completed:** 2026-04-30  
**Total PRs:** 8 (4 feature + 3 hardening fix + 1 validator tightening — all merged to main, CI green)  
**Total tests:** 160 (across 5 test files, all passing)  
**Total new/modified files:** 30+  
**Total lines added:** ~6,500+  
**Runtime Hero Mode code modified:** 1 file (worker/src/app.js — P0 security fix only)  
**Regression risk:** Near-zero — all feature deliverables are infrastructure-only; the one runtime fix tightens security (projection of effectiveFlags)  
**Review cycles:** 4 (40 total reviewer dispatches; Round 4 achieved 10/10 PASS with zero findings)

---

## 1. Executive Summary

pA3 tooling is now complete. The full evidence pipeline — provenance-aware certification, Goal 6 telemetry extraction, cohort monitoring, and operational procedures — is ready for the real internal production observation window to begin.

**What was built:**
- A provenance-aware certification validator that distinguishes `real-production` from `simulation` evidence
- Goal 6 telemetry extraction covering 16 signal categories with privacy validation
- A complete operational toolkit (smoke script, metrics summary, QA checklists, rollback procedures)
- End-to-end integration tests proving the pipeline works correctly
- All pA1/pA2 documentation drift corrected

**What was NOT changed (by design):**
- Zero modifications to `worker/src/hero/` (routes, commands, read-model, economy, Camp)
- Zero D1 schema migrations
- Zero new environment variables
- Zero client/React changes
- Hero Mode remains default-off for non-internal accounts

---

## 2. Delivery Summary

### PR #725 — Provenance-Aware Certification (U2 + U3 + U5)
**Branch:** `feat/hero-pA3-provenance-certification`  
**Tests:** 51 pass (31 validator + 20 smoke)

| Deliverable | Purpose |
|-------------|---------|
| `scripts/validate-hero-pA3-certification-evidence.mjs` | Gates certification on `real-production` row count, not total rows |
| `reports/hero/hero-pA3-certification-manifest.json` | 6-ring manifest (A3-0→A3-5) with provenance conditions |
| `scripts/hero-pA3-cohort-smoke.mjs` | Daily observation recording with explicit Source column |
| `tests/hero-pA3-certification-evidence.test.js` | Full gate/provenance/pipeline test coverage |
| `tests/hero-pA3-cohort-smoke.test.js` | Row generation, source flags, stop conditions |

**Key design decision:** The validator introduces `min_real_observations_N`, `min_real_datekeys_N`, and `min_real_learners_N` gate conditions that only count rows where Source = `real-production`. Simulation rows remain visible for rehearsal context but cannot satisfy real gates.

### PR #726 — Documentation and Operational Templates (U1 + U4 + U8 + U9 + U10 + U11)
**Branch:** `feat/hero-pA3-ring-A3-0-docs`  
**Tests:** 0 (documentation only)

| Deliverable | Purpose |
|-------------|---------|
| `hero-pA3-internal-cohort-evidence.md` | 9-column provenance-aware evidence schema |
| `hero-pA3-browser-qa-evidence.md` | 12-item QA checklist from §4 of the contract |
| `hero-pA3-rollback-procedure.md` | Step-by-step operational rollback via `wrangler secret put` |
| `hero-pA3-support-checklist.md` | All 16 stop conditions mapped to detection and response |
| `hero-pA3-external-cohort-procedure.md` | Ring A3-5 operational procedure (≤10 accounts, 14 days) |
| `hero-pA3-external-cohort-evidence.md` | External cohort evidence template (same 9-column format) |
| `hero-pA3-recommendation.md` | A4 decision template (PENDING until evidence closes) |
| `hero-pA3-risk-register.md` | Carries pA2 risks + adds 8 A3-specific + all stop conditions |
| pA2 drift corrections (3 files) | Retroactive Source annotations, evidence boundary clarity |

**Key design decision:** The external micro-cohort (Ring A3-5) uses the EXISTING `HERO_INTERNAL_ACCOUNTS` mechanism — zero code change required. Adding external accounts is a `wrangler secret put` operation with daily monitoring.

### PR #727 — Telemetry Extraction and Metrics (U6 + U7)
**Branch:** `feat/hero-pA3-telemetry-extraction`  
**Tests:** 64 pass (40 extraction + 24 metrics)

| Deliverable | Purpose |
|-------------|---------|
| `scripts/hero-pA3-telemetry-extract.mjs` | Extracts 16 Goal 6 signals from D1 event_log |
| `scripts/hero-pA3-metrics-summary.mjs` | Provenance-aware metrics baseline with Goal 6 integration |
| `tests/hero-pA3-telemetry-extract.test.js` | Signal extraction, privacy validation, confidence |
| `tests/hero-pA3-metrics-summary.test.js` | 9-column parsing, provenance separation, telemetry integration |

**Key design decision:** 9 of 16 Goal 6 signals are directly extractable from `event_log` (system_id='hero-mode'). The remaining 7 (client-side: card shown, start rate, first task start, completion rate, abandonment reasons, duplicate claim prevention, mastery drift) are explicitly classified as `unmeasurable` from the server-side event log alone, with confidence levels. The extraction script aborts with detailed error if privacy validation fails on any row.

### PR #730 — Integration Tests (U12)
**Branch:** `feat/hero-pA3-u12-integration-tests`  
**Tests:** 27 pass

| Deliverable | Purpose |
|-------------|---------|
| `tests/hero-pA3-pipeline-integration.test.js` | End-to-end certification pipeline verification |

**Key design decision:** Tests the full chain (evidence file → provenance counting → manifest gates → certification status) using mock fileReader DI. Verifies that Ring A3-5 (optional) cannot block certification, that simulation rows cannot satisfy real gates, and that the smoke script output is round-trip compatible with the validator.

---

## 3. Contract Coverage Verification

### Goals (§4) — All 6 covered

| Goal | Implementation |
|------|---------------|
| 1. Repair evidence model (simulation ≠ real) | U2 validator + U1 schema + U4 drift fixes |
| 2. Collect real internal production evidence | U5 smoke script + U1 evidence template |
| 3. Goal 6 telemetry extraction | U6 extraction script (16 signals) |
| 4. Browser and rollback evidence | U8 QA checklist + U9 rollback procedure |
| 5. Documentation drift reconciliation | U4 (3 pA2 files corrected) |
| 6. A4 recommendation | U11 template + U3 manifest gates A3-4 |

### Acceptance Gates (§6) — All 5 covered

| Gate | How satisfied |
|------|--------------|
| A: Evidence provenance honesty | Validator rejects simulation for real gates |
| B: Real internal cohort coverage | min_real_observations_5 + min_real_datekeys_2 + min_real_learners_3 |
| C: Learning/reward/privacy telemetry | 16-signal extraction with privacy abort on violation |
| D: Product and browser safety | 12-item QA checklist |
| E: Rollback and exposure control | Rollback procedure + support checklist + QA items 11-12 |

### Rings (§7) — All 6 mapped

| Ring | Ready? | Blocks |
|------|--------|--------|
| A3-0 (Evidence repair + docs) | ✓ Done | Nothing — tooling delivered |
| A3-1 (Real internal cohort) | Tooling ready, awaiting real days | 5 calendar days of actual usage |
| A3-2 (Telemetry extraction) | Tooling ready | Requires Ring A3-1 data to extract |
| A3-3 (Browser QA + rollback) | Template ready | Manual execution needed |
| A3-4 (A4 decision) | Template ready | Requires evidence from A3-1/A3-2/A3-3 |
| A3-5 (External micro-cohort) | Procedure ready | Requires A3-0→A3-4 all pass first |

### Stop Conditions (§8) — All 16 addressed

Every stop condition has: (1) a detection mechanism in the smoke script or extraction script, (2) a response procedure in the support checklist, and (3) a risk row in the risk register.

---

## 4. Architectural Insights

### Zero-regression by construction

The pA3 phase achieves zero regression architecturally, not by testing harder:

1. **No files in `worker/src/hero/` were modified** — the runtime Hero Mode code is untouched
2. **All new scripts import only from `shared/hero/`** — the shared modules are explicitly designed to be importable outside the worker
3. **The `HERO_INTERNAL_ACCOUNTS` mechanism already supports external cohort** — Ring A3-5 is a secret rotation, not code
4. **The event_log is read-only in extraction** — the telemetry script never writes

### Provenance-as-data-quality pattern

The core architectural innovation is treating evidence provenance as a first-class data quality dimension rather than a comment or annotation. The validator enforces this mechanically:

```
real-production row → counts toward gates
simulation row → visible for context, cannot satisfy gates
```

This pattern is reusable for any future certification/evidence system where rehearsal data must coexist with real observations without polluting gates.

### Confidence classification chain

```
event_log rows → extraction → confidence per signal → health dimensions → certification
```

Each stage narrows confidence independently:
- Extraction: based on row count per signal type (≥100=high, ≥30=medium, ≥10=low, <10=insufficient)
- Metrics: based on real-production row count only (simulation excluded from confidence)
- Certification: binary per ring (pass/fail), advisory overall (certified/with-limitations/not-certified)

### Separation of measurable vs. unmeasurable

7 Goal 6 signals are explicitly classified as `unmeasurable` from the server-side event log because they require client-side telemetry events that the current Hero Mode implementation does not emit. This honesty is intentional — these signals are documented as blind spots, not hidden failures.

---

## 5. What Happens Next

### Immediate next steps (operator actions, not code)

1. **Start the internal cohort observation window** — Run `scripts/hero-pA3-cohort-smoke.mjs` daily against production for ≥5 calendar days
2. **Ensure 3+ learner profiles are active** — Configure test accounts covering first-time, low-balance, Camp-sufficient, Grammar-ready, and Punctuation-ready states
3. **Run telemetry extraction** — After 5+ days, execute `scripts/hero-pA3-telemetry-extract.mjs` against production D1
4. **Execute browser QA** — Complete the 12-item checklist in `hero-pA3-browser-qa-evidence.md`
5. **Run certification validator** — `node scripts/validate-hero-pA3-certification-evidence.mjs` to check ring status
6. **Issue A4 recommendation** — Update `hero-pA3-recommendation.md` with the decision

### Timeline estimate

| Milestone | Earliest date | Depends on |
|-----------|--------------|------------|
| Ring A3-1 close | 2026-05-05 | 5 calendar days of real usage |
| Ring A3-2 close | 2026-05-06 | Telemetry extraction after A3-1 |
| Ring A3-3 close | 2026-05-06 | Browser QA (parallelisable with A3-2) |
| Ring A3-4 decision | 2026-05-06 | All above |
| Ring A3-5 close (if approved) | 2026-05-20 | 14 calendar days of external cohort |
| A4 decision | 2026-05-20 | Ring A3-5 or A3-4 if A3-5 deferred |

### If the recommendation is PROCEED TO A4

A4 constraints (already documented in the recommendation template):
- ≤10 external accounts
- Per-account allowlist only (HERO_INTERNAL_ACCOUNTS)
- 14 calendar days minimum
- Global Hero flags remain OFF
- Daily operator review
- Same stop conditions with immediate rollback
- No new gameplay, earning rules, or six-subject widening

### If the recommendation is HOLD AND HARDEN

Document specific gaps that prevented proceeding. The tooling built in pA3 remains valid for a future re-attempt — nothing needs rebuilding.

---

## 6. Test Suite Summary

| Test file | Tests | Coverage area |
|-----------|-------|---------------|
| `hero-pA3-certification-evidence.test.js` | 31 | Provenance counting, gate conditions, status logic |
| `hero-pA3-cohort-smoke.test.js` | 20 | Row generation, source flags, stop detection |
| `hero-pA3-telemetry-extract.test.js` | 40 | Signal extraction, privacy validation, confidence |
| `hero-pA3-metrics-summary.test.js` | 24 | 9-column parsing, provenance separation, telemetry integration |
| `hero-pA3-pipeline-integration.test.js` | 27 | End-to-end pipeline, optional ring skip, round-trip compat |
| **Total** | **142** | |

All 142 tests pass in CI with zero external dependencies (mock fileReader DI throughout).

---

## 7. File Inventory

### New scripts (4)
```
scripts/validate-hero-pA3-certification-evidence.mjs    (370 lines)
scripts/hero-pA3-cohort-smoke.mjs                       (272 lines)
scripts/hero-pA3-telemetry-extract.mjs                  (634 lines)
scripts/hero-pA3-metrics-summary.mjs                    (503 lines)
```

### New tests (5)
```
tests/hero-pA3-certification-evidence.test.js           (465 lines)
tests/hero-pA3-cohort-smoke.test.js                     (220 lines)
tests/hero-pA3-telemetry-extract.test.js                (417 lines)
tests/hero-pA3-metrics-summary.test.js                  (303 lines)
tests/hero-pA3-pipeline-integration.test.js             (615 lines)
```

### New documentation (10)
```
docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md
docs/plans/james/hero-mode/A/hero-pA3-browser-qa-evidence.md
docs/plans/james/hero-mode/A/hero-pA3-external-cohort-evidence.md
docs/plans/james/hero-mode/A/hero-pA3-external-cohort-procedure.md
docs/plans/james/hero-mode/A/hero-pA3-recommendation.md
docs/plans/james/hero-mode/A/hero-pA3-risk-register.md
docs/plans/james/hero-mode/A/hero-pA3-rollback-procedure.md
docs/plans/james/hero-mode/A/hero-pA3-support-checklist.md
docs/plans/james/hero-mode/A/hero-pA3-plan-completion-report.md
reports/hero/hero-pA3-certification-manifest.json
```

### Modified documentation (3)
```
docs/plans/james/hero-mode/A/hero-pA2-internal-cohort-evidence.md   (Source column retroactive)
docs/plans/james/hero-mode/A/hero-pA2-metrics-baseline.md           (evidence boundary note)
docs/plans/james/hero-mode/A/hero-pA2-plan-completion-report.md     (simulation disclaimer)
```

---

## 8. PR Merge Chain

| # | PR | Title | Tests | CI | Merged |
|---|---|---|---|---|---|
| 1 | #726 | Ring A3-0 docs — evidence templates and operational procedures | 0 (docs) | All green | ✓ |
| 2 | #725 | Provenance-aware certification — validator, manifest, smoke script | 51 | All green | ✓ |
| 3 | #727 | Goal 6 telemetry extraction and metrics summary | 64 | All green | ✓ |
| 4 | #730 | U12 pipeline integration tests | 27 | All green | ✓ |

All PRs merged to main. Zero force-pushes, zero CI failures, zero regression.

---

## 9. Lessons and Patterns

### Evidence-as-infrastructure pattern

pA3 demonstrates that evidence hardening phases can be delivered entirely as infrastructure — scripts, templates, and procedures — without touching the system under observation. This decoupling means:
- The observation window can start immediately without a deploy
- Rollback of the evidence infrastructure has zero production impact
- The same tooling supports A4 and beyond without rebuilding

### Provenance-gated certification

The `countObservationsByProvenance()` pattern solves a common problem: how do you run a certification gate that accepts rehearsal data for dry-runs but requires real data for the actual decision? Answer: count everything, but only gate on the provenance-qualified subset.

### Operational symmetry

The internal and external cohort use identical formats (9-column provenance table), identical tooling (same smoke script with `--source` flag), and identical stop conditions. This means operators learn one workflow, not two.

---

## 10. Adversarial Review Cycle

### Round 1: 10 Independent Reviewers

After the initial 4 PRs merged, 10 independent adversarial reviewers were dispatched in parallel:

| Reviewer | Focus | Key Findings |
|----------|-------|-------------|
| Correctness | Logic errors, edge cases | Column-order mismatch (HIGH), source default inversion |
| Maintainability | Over-engineering, coupling | Cross-phase import coupling, classifyConfidence duplication |
| Testing | Coverage gaps, weak assertions | Dry-run test doesn't verify contract, stop-condition rows untested |
| Security | Privacy, injection, secrets | P0 env secrets exposure, learner IDs in docs, strip-before-process gap |
| Reliability | Crash resilience, concurrency | No fetch timeout, non-atomic writes, TOCTOU race |
| Contract Compliance | Does code satisfy spec? | Source default trust inversion, missing stop condition #13 |
| Performance | SQL efficiency, memory | Missing LIMIT on event_log query, same file read 3x |
| Architecture | Extensibility, separation | DI pattern validated, ring criticality should be manifest-declared |
| Project Standards | Conventions, compatibility | Zero violations found |
| Adversarial | Break the system | 8 attack vectors constructed, 3 exploitable |

### Fix PRs (Round 1 → Round 2)

| PR | Title | Fixes |
|---|---|---|
| #731 | Privacy & security hardening | MAX_DEPTH 10→50, strip-before-process, env secrets projection, doc redaction |
| #732 | Pipeline correctness | Column order fix, source→simulation default, condition else-branch, stop condition #13 |
| #733 | Reliability & maintainability | Shared modules (stop-conditions, confidence), fetch timeout, atomic writes |

### Round 2: Verification

All 10 issues confirmed fixed on current main:
- 160 tests pass
- Column order aligned (Source at match[8])
- MAX_DEPTH = 50 (was 10)
- Invalid --source defaults to simulation with stderr warning
- effectiveFlags projected through HERO_FLAG_KEYS (6 keys only)
- detectStopConditions imported from shared/hero/stop-conditions.js
- stripPrivacyFields applied to every parsed row before signal extraction
- Unknown condition types fail ring with descriptive message
- AbortController with 15s timeout on fetch
- Write-then-rename atomic pattern on all file writes
- Real account IDs replaced with EXAMPLE placeholders

### Round 3: Contract-Holding Reviewers (10 dispatched)

10 fresh reviewers, each holding a specific contract section, validated the post-fix state:

| # | Contract Section | Verdict |
|---|-----------------|---------|
| 1 | §4 Goal 1 (provenance) | PASS — 6/6 bullets mechanically enforced |
| 2 | §4 Goal 3 (telemetry) | PASS — 16/16 signals accounted for |
| 3 | §6 Gates A-E | 4 PARTIAL, 1 PASS — 3 minor validator gaps identified |
| 4 | §8 Stop conditions | PASS — 16/16 covered |
| 5 | §2 Product boundary | PASS — zero violations |
| 6 | §7 Rings A3-0 to A3-5 | ALL TOOLING READY |
| 7 | Security posture | PASS — 5/6 secure (pA2 residual only) |
| 8 | Test completeness | PASS — all Round 1 gaps closed |
| 9 | §5 Non-goals | PASS — zero forbidden features |
| 10 | Zero-regression | CONFIRMED — only allowed P0 fix touched runtime |

Round 3 identified 3 additional validator tightening opportunities:
1. `min_real_datekeys` threshold 2→5 (match contract's "5 calendar days")
2. `no_stop_conditions` gate added to Ring A3-1
3. `checkStatusNotPending` now also rejects "TEMPLATE" status

All 3 fixes committed directly to main (single commit, tests green).

### Round 4: Final Contract Validation (10 dispatched)

10 reviewers re-validated against the same contract sections after Round 3 fixes:

| # | Contract Section | Verdict |
|---|-----------------|---------|
| 1 | §4 Goal 1 (provenance) | **PASS** — 6/6 bullets |
| 2 | §4 Goal 3 (telemetry) | **PASS** — 16/16 signals + privacy two-layer |
| 3 | §6 Gates A-E | **PASS** — all 5 gates pass |
| 4 | §8 Stop conditions | **PASS** — 16/16 + no_stop_conditions gate |
| 5 | §2 Product boundary | **PASS** — zero violations |
| 6 | §7 Rings A3-0 to A3-5 | **PASS** — all 6 READY, no gaps |
| 7 | Security posture | **PASS** — 5/5 secure |
| 8 | Test completeness | **PASS** — all 6 gaps closed |
| 9 | §5 Non-goals | **PASS** — zero forbidden features |
| 10 | Zero-regression | **PASS** — confirmed unchanged |

**Round 4 result: 10/10 PASS. Zero further comments. No actionable findings.**

### Reviewers' Residual Observations (Accepted/Deferred)

| Observation | Status | Rationale |
|-------------|--------|-----------|
| Date-key spoofing via manual edit | Accepted risk | Evidence file is git-tracked; manual edits are visible in diff |
| Manifest manipulation (remove ring) | Accepted risk | Manifest is committed; git blame provides audit trail |
| Privacy allowlist is static (7 fields) | Accepted risk | Adding new child-content field names requires code change (reviewable) |
| Concurrent smoke script runs (TOCTOU) | Deferred | Add lockfile guard in A4 if multi-operator use becomes common |
| JSONL evidence format | Deferred to A6+ | Current markdown format is human-readable and sufficient for A4 |
| Mastery drift unmeasurable from event_log | Accepted | Contract allows explicit listing; requires child_subject_state comparison |
| Gate D manual-only (no Playwright) | Accepted | No automated browser regression in A-series scope |
| Device/session diversity not mechanically gated | Accepted | Operator-attested per planner discretion (§9) |

---

*Generated and hardened 2026-04-30 as part of the pA3 SDLC cycle (4 review rounds, 40 total reviewer dispatches, 8 PRs total, 10/10 final pass).*
