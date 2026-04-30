---
title: "System Hardening Optimisation P4 — Completion Report"
type: completion-report
status: complete
date: 2026-04-30
phase: P4
terminal_outcome: "30-learner-beta-promoted-60-diagnostic-blocked"
exit_state: "30-learner-beta-promoted-60-diagnostic-blocked"
prs:
  - "#754 — U1 baseline lock"
  - "#756 — U2 30-learner promotion"
  - "#758 — U3/U4/U5 fail-closed tests, 60-learner prep, budget refresh"
  - "#761 — U6/U7/U8 status report, path decision, completion report"
  - "#765 — fix: 3 explicit negative tests for delivery reviewer BLOCK"
---

# System Hardening Optimisation P4 — Completion Report

## Terminal Outcome

```
30-learner-beta-promoted-60-diagnostic-blocked
```

P4 successfully promoted the 30-learner beta capacity status through reviewed governance. The 60-learner diagnostic is prepared but blocked on production access (requires human operator).

---

## 1. Source Boundary

| Layer | Value |
|-------|-------|
| Source | GitHub `main` full clone |
| Starting commit | `0f3f72ae` |
| Ending commit | (this PR's merge commit) |
| Evidence layer | Committed production-origin capacity JSON |

---

## 2. P3 Candidate Row Status

The P3 terminal evidence (P3-T5 repeat 2, commit `3af2b44b`) was successfully promoted. The `reportMeta.commit` was updated from the pre-squash deploy SHA (`b469e58...`) to the squash-merge commit that exists in repo history.

---

## 3. Whether 30-Learner Beta Was Promoted

**Yes.** Public/Admin capacity status moved from `small-pilot-provisional` to `30-learner-beta-certified`.

Evidence: `reports/capacity/latest-evidence-summary.json` shows `certifying: true`, `certificationEligible: true`, `verifiedCapacityRowDecision: "30-learner-beta-certified"`.

---

## 4. 60-Learner Diagnostic Result and Classification

**Exit state: `diagnostic-setup-blocked`**

The 60-learner diagnostic could not be executed autonomously. Production Cloudflare access and simultaneous tail capture require a human operator with:
- Network access to `https://ks2.eugnel.uk` production Workers
- Cloudflare account credentials for `wrangler tail`
- Session-manifest preparation window (30+ minutes for rate-limit bucket resets)

**Autonomous preparation delivered:** Complete operator checklist at `reports/capacity/configs/p4-60-diagnostic-checklist.md` with session-manifest strategy (28/28/4 batches), command sequences, correlation steps, and failure-mode table.

---

## 5. Latest Evidence Summary State

```json
{
  "certified_30_learner_beta": {
    "certifying": true,
    "status": "passed",
    "certificationEligible": true,
    "verifiedCapacityRowDecision": "30-learner-beta-certified"
  }
}
```

---

## 6. Admin Production Evidence State

Admin model returns `CERTIFIED_30` for the capacity_certification lane. Diagnostics classified as `UNKNOWN`. Preflights classified as `PREFLIGHT_ONLY`. 7 fail-closed regression tests prove this separation.

---

## 7. 1000-Learner Budget State

- `modellingOnly: true`
- `certifying: false`
- D1 rows written: RED at 1,008% (expected scenario, 1000 learners)
- Worker CPU: UNKNOWN (tail-correlation CPU not integrated into budget model)
- Decision: Stay blocked by missing route costs (see `sys-hardening-optimisation-p4-1000-learner-path-decision.md`)

---

## 8. Raw-Log/Redaction Scan Result

No raw Worker/Tail captures committed to git. Confirmed:
- `.gitignore` excludes `*.jsonl` raw tail captures
- `git ls-files '*.jsonl'` returns empty
- No `ks2_req_*` request IDs in committed evidence
- No cookies, bearer tokens, or learner names in committed artefacts
- Committed evidence contains only redacted metrics and aggregated statistics

---

## 9. Verifier/Test Results

| Gate | Result |
|------|--------|
| `npm run capacity:verify-evidence` | PASS (5 rows, no skip-ancestry) |
| `tests/admin-production-evidence.test.js` | PASS (39 tests including 10 P4 scenarios: S1-S7 + S2b/S4b/S7b) |
| `tests/capacity-budget-ledger.test.js` | PASS (6 tests) |
| Threshold configs unchanged | PASS (no modifications) |
| Runtime code unchanged | PASS (no `src/` or `worker/` changes) |
| 10-reviewer delivery validation | PASS (all 10 dimensions, 1 fix round for test coverage) |

---

## 10. Recommended Phase 5 Path

**Immediate next action (operator):** Execute the 60-learner diagnostic per the operator checklist, write the decision record (contract P4-U4 tasks 1-4) selecting one Phase 5 path from evidence.

**Independent of diagnostic (from U8 decision):** The 1000-learner budget path stays blocked by missing measured route costs. Write-amplification work (Phase 5D) is premature until parent/admin/demo/Hero route costs are measured.

**If 60-learner diagnostic classifies as:**
- `d1-dominated` → Phase 5A (bootstrap/D1 query-shape and cache contract)
- `worker-cpu-dominated` → Phase 5B (JSON construction, response rewriting)
- `client-network-or-platform-overhead` → Phase 5C (operations/platform investigation)
- `setup-blocked` → Capacity harness repair
- Positive → Repeat certification policy before any public 60-learner claim

---

## Delivery Metrics

| Metric | Value |
|--------|-------|
| PRs merged | 5 (#754, #756, #758, #761, #765) |
| Plan units delivered (autonomous) | 8/8 (U1-U8) |
| Plan units deferred (human-required) | 2 (P4-U3 execution, P4-U4 tasks 1-4) |
| Tests added | 10 fail-closed scenarios (7 original + 3 explicit negative tests from fix round) |
| Regression tests passing | All (39/39 admin-production-evidence, 6/6 capacity-budget-ledger) |
| Runtime code changes | 0 |
| Threshold config changes | 0 |
| Plan review iterations | 1 (3 reviewers found 2 blockers, resolved in 1 pass) |
| Delivery review iterations | 2 (10 reviewers; round 1 had 1 BLOCK on test coverage, fix PR #765, round 2 all 10 PASS) |
