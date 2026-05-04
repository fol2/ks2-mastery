---
title: "fix: Hero Mode pA2 — reviewer-found bugs and design gaps"
type: fix
status: active
date: 2026-04-30
origin: docs/plans/james/hero-mode/A/hero-mode-pA2.md
---

# Hero Mode pA2 — Reviewer-Found Bugs and Design Gaps

## Overview

10 independent reviewers audited all 9 pA2 implementation units against the origin contract. They found real bugs in the cohort smoke script (U6), logic issues in the certification validator (U8), semantic errors in the ops probe (U4), and a design gap in the metrics summary (U7). This plan fixes everything that is fixable by code — no production access required.

---

## Problem Frame

The smoke script — the primary safety monitor for the internal cohort — has bugs that would render it ineffective:
- Negative balance stop condition never fires (wrong bucket name comparison)
- Override status check references a non-existent field
- Only 2 of 14 contract stop conditions are detected
- Observations land at wrong position in evidence file

The certification validator can be fooled by placeholder text. The ops probe has semantic errors in reconciliation and override status. These must be fixed before anyone runs the cohort.

---

## Requirements Trace

- R1. Smoke script correctly detects all observable stop conditions from contract §8
- R2. Smoke script correctly reads probe response fields (no field-name mismatches)
- R3. Smoke script appends observations to the correct table position
- R4. Certification validator rejects placeholder decision text
- R5. Ops probe reconciliation compares correct quantities (learner-scoped)
- R6. Ops probe override status reflects queried learner, not operator
- R7. Metrics summary honestly documents which Goal 6 signals it can vs cannot measure

---

## Scope Boundaries

- No production deployment
- No new features or earning paths
- No changes to the contract itself — only fixing implementation that doesn't match contract
- Goal 6 signals that require telemetry data beyond the ops probe are documented as out-of-scope for this script (they need a separate telemetry consumer, not planned here)

---

## Key Technical Decisions

- **Negative balance detection:** Check raw `heroState.economy.balance < 0` from the probe response, not bucket name. The bucket classifier maps ≤0 to `'0'` which is ambiguous.
- **Stop condition coverage:** Only detect conditions observable from the probe response. Document which conditions require manual verification. Do not pretend to detect what we cannot.
- **Observation insertion:** Read file, find Observation Log table end, insert before Stop Conditions section. Use regex to locate the section boundary.
- **Certification validator fix:** Reject decision keywords inside square brackets. Require the keyword to appear on a line starting with `**Decision:**` or `**Recommendation:**`.
- **Reconciliation fix:** Filter `event_log` query by `learner_id` when a learnerId param is provided.
- **Override status fix:** Look up the queried learner's parent accountId from the state/session context, not the calling operator's.

---

## Implementation Units

- U1. **Smoke script field-name and stop-condition fixes**

**Goal:** Fix the two field-name mismatches and expand stop condition coverage to all probe-observable conditions.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `scripts/hero-pA2-cohort-smoke.mjs`
- Create: `tests/hero-pA2-cohort-smoke.test.js`

**Approach:**
- Fix `overrideStatus.active` → `overrideStatus.isInternalAccount`
- Fix negative balance check: instead of `balanceBucket === 'negative'`, read the raw balance from the expanded probe response (add `balance` field to `buildExpandedProbeResponse` output, or derive from health data)
- Add stop condition checks for probe-observable conditions:
  - `health.duplicateAwardPreventedCount > 0` → informational (prevention worked, but flag it)
  - `readiness.overall === 'not_ready'` and specific check failures
  - `overrideStatus.isInternalAccount === false` when learner should be internal → exposure stop
- Document (in script comments) which §8 conditions cannot be detected from the probe:
  - claim without verified completion (requires command-level audit)
  - Hero mutates subject state (architectural impossibility, verified by P1-P6 tests)
  - stale request returns 500 (requires request-level monitoring)
  - operators cannot explain task selection (human assessment)
  - children directed to Camp before learning (UI assessment)
  - support must inspect non-existent tables (documentation assessment)
- Write unit tests for stop condition detection logic using mock probe responses

**Test scenarios:**
- Happy path: all-healthy probe response → no stop conditions fired
- Negative balance: probe response with balance -50 → fires negative-balance stop
- Duplicate award: probe response with duplicateAwardPreventedCount > 0 → fires duplicate-award-prevented info
- Reconciliation gap: hasGap true → fires reconciliation-gap stop
- Override mismatch: isInternalAccount false for expected-internal learner → fires exposure stop
- Override active: isInternalAccount true → correctly reports 'override-active' label
- Multiple stops: response with negative balance AND reconciliation gap → both fire

**Verification:**
- All mock-based tests pass
- Script field names match actual probe response shape from `buildExpandedProbeResponse`

---

- U2. **Smoke script observation file insertion fix**

**Goal:** Observations insert into the Observation Log table, not appended to EOF.

**Requirements:** R3

**Dependencies:** U1

**Files:**
- Modify: `scripts/hero-pA2-cohort-smoke.mjs`

**Approach:**
- Read file content, find the Observation Log table (locate pattern `| Date | Learner |` or the last `|`-prefixed line before the `## Stop Conditions` section)
- Insert new observation rows after the last existing observation row (or after the table header separator if no observations yet)
- Write the modified file back
- If Stop Conditions section not found, fall back to append (defensive)

**Test scenarios:**
- Empty template: insert after header separator, before Stop Conditions section
- Template with 2 existing observations: insert after the second observation row
- Template without Stop Conditions section: fallback to append

**Verification:**
- After insertion, both Observation Log and Stop Conditions tables render correctly in markdown

---

- U3. **Certification validator placeholder rejection**

**Goal:** `contains_decision` rejects placeholder text that contains decision keywords inside brackets.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Modify: `scripts/validate-hero-pA2-certification-evidence.mjs`
- Modify: `tests/hero-pA2-certification-evidence.test.js`

**Approach:**
- Change `checkContainsDecision` to require the keyword on a line that starts with `**Decision:**` or `**Recommendation:**` followed by the keyword NOT inside square brackets
- Regex: `/(?:Decision|Recommendation):\*?\*?\s*(?:PROCEED TO A3|HOLD AND HARDEN|ROLLBACK)/i` — must match a label prefix
- Add test that the current placeholder text `[PROCEED TO A3 / HOLD AND HARDEN / ROLLBACK]` is rejected
- Add test that `**Decision:** PROCEED TO A3` is accepted

**Test scenarios:**
- Placeholder `[PROCEED TO A3 / HOLD AND HARDEN / ROLLBACK]` → rejected (returns false)
- `**Decision:** PROCEED TO A3` → accepted
- `**Recommendation:** HOLD AND HARDEN` → accepted
- `**Decision:** ROLLBACK` → accepted
- File with no decision line at all → rejected
- Decision keyword in body text without label prefix → rejected

**Verification:**
- Running validator against current `hero-pA2-recommendation.md` correctly reports `contains_decision` as FAILED

---

- U4. **Ops probe reconciliation scope fix**

**Goal:** Reconciliation gap compares learner-specific event count, not system-wide.

**Requirements:** R5

**Dependencies:** None

**Files:**
- Modify: `worker/src/hero/telemetry-probe.js`
- Modify: `worker/src/app.js` (probe route)
- Modify: `tests/hero-pA2-ops-probe.test.js`

**Approach:**
- When `learnerId` is provided, run a separate count query: `SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND learner_id = ?`
- Pass this learner-specific count to `deriveReconciliationGap` instead of `probeResult.count`
- The general `probeResult.events` (system-wide last-N) remains unchanged for the events section
- Update `buildExpandedProbeResponse` to accept an optional `learnerEventCount` parameter

**Test scenarios:**
- Learner with 5 ledger entries and 5 learner-scoped events → hasGap: false
- Learner with 5 ledger entries and 3 learner-scoped events → hasGap: true, gap: 2
- No learnerId provided → reconciliation section omitted (backwards compat)

**Verification:**
- Reconciliation gap reflects actual learner data, not system-wide event limit

---

- U5. **Ops probe override status learner-scoped fix**

**Goal:** Override status reflects whether the queried learner's parent account is internal, not the operator.

**Requirements:** R6

**Dependencies:** U4

**Files:**
- Modify: `worker/src/app.js` (probe route)
- Modify: `tests/hero-pA2-ops-probe.test.js`

**Approach:**
- When `learnerId` is provided, resolve the learner's parent accountId via `repository` (look up `account_learner_memberships` for the learner)
- Check whether THAT accountId is in `HERO_INTERNAL_ACCOUNTS`, not `session.accountId`
- Return `overrideStatus: { queriedLearnerId, parentAccountId, isInternalAccount: <bool>, effectiveFlags }`
- If parent accountId cannot be resolved (orphan learner), report `isInternalAccount: null` with a reason

**Test scenarios:**
- Internal operator queries internal learner → isInternalAccount: true
- Internal operator queries non-internal learner → isInternalAccount: false
- Operator queries learner with no parent account → isInternalAccount: null

**Verification:**
- Override status answers the contract question: "Are non-internal accounts still hidden from Hero surfaces?"

---

- U6. **Metrics summary honest coverage documentation**

**Goal:** Clearly document which Goal 6 signals the metrics summary can vs cannot measure.

**Requirements:** R7

**Dependencies:** None

**Files:**
- Modify: `scripts/hero-pA2-metrics-summary.mjs`

**Approach:**
- Add a `## Coverage Limitations` section to the output document
- List the 4 families the script measures (readiness, economy/balance, reconciliation, override)
- List the Goal 6 signals that require telemetry data not available from the ops probe:
  - Quest start/completion rates (requires client-side telemetry)
  - Task abandonment reasons (requires session-level telemetry)
  - Subject mix distribution (derivable from probe events but not from observation table)
  - Weak-repair/due-review/retention exposure (requires per-task telemetry)
  - Claim rejection reasons (requires command-level audit)
  - Extra practice after daily cap (requires session telemetry)
  - Signs of rushing/farming/mastery inflation (requires learning analytics)
- State confidence level for each unmeasurable signal as `not-observable-from-probe`
- This is documentation, not a code change to the measurement logic

**Test scenarios:**
- Test expectation: none — documentation output only

**Verification:**
- Output document clearly separates "measured" from "not measurable by this tool"
- No over-claiming of coverage

---

## System-Wide Impact

- **Interaction graph:** U4 and U5 modify the admin probe route. Smoke script (U1/U2) consumes the probe. Changes must be consistent.
- **Error propagation:** Stop condition fires produce warnings in script output. They do not throw or crash.
- **Unchanged invariants:** No production Hero Mode behaviour changes. No new mutations, earning paths, or state shapes.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| U4 learner-specific event count query adds latency to probe | Single COUNT query on indexed column — negligible |
| U5 parent account lookup requires an additional DB query | Reuse existing repository pattern; admin route already does multiple queries |
| Smoke script tests mock the probe response shape — shape drift | Document the response shape contract in a shared type comment |

---

## Sources & References

- **Origin contract:** [docs/plans/james/hero-mode/A/hero-mode-pA2.md](docs/plans/james/hero-mode/A/hero-mode-pA2.md) §8 (stop conditions)
- **Reviewer findings:** 10 independent subagent reviews (this session, 2026-04-30)
- Related code: `scripts/hero-pA2-cohort-smoke.mjs`, `scripts/validate-hero-pA2-certification-evidence.mjs`, `worker/src/hero/telemetry-probe.js`, `worker/src/app.js`
