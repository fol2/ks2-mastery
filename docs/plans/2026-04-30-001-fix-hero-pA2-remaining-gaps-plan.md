---
title: "fix: Hero Mode pA2 — remaining gaps, D2 regression, and honest phase closure"
type: fix
status: active
date: 2026-04-30
origin: docs/plans/james/hero-mode/A/hero-mode-pA2.md
---

# Hero Mode pA2 — Remaining Gaps, D2 Regression, and Honest Phase Closure

## Overview

The prior pA2 session delivered code infrastructure (Ring A2-1) but over-claimed completion. This plan addresses the remaining work that a code agent CAN do, and creates tracked issues for what requires human production execution.

---

## Problem Frame

Three categories of unfinished work:

1. **D2 test regression** — `hero-pA1-flag-ladder.test.js` has a time-sensitive fixture with hardcoded `DATE_KEY = '2026-04-29'`. On any subsequent day, the read-model generates a fresh quest instead of reflecting the fixture's completed tasks. This breaks CI for all branches.

2. **Ring A2-1 local proof** — The ops probe, privacy validator, and launchability fix have unit tests but no local integration proof showing them working together. The ops-evidence document is still a blank template.

3. **Rings A2-2 through A2-4** — Require production access and calendar time. Cannot be completed by a code agent. Need tracked issues for human execution.

Additionally, the completion report needs correction to be honest about what was delivered vs what remains.

---

## Requirements Trace

- R1. Fix D2 test failure so CI is green on main (regression)
- R2. Fill Ring A2-1 evidence with local/dev proof (within code agent capability)
- R3. Create GitHub issues for production cohort work (A2-2, A2-3, A2-4)
- R4. Correct the completion report to reflect honest phase status

---

## Scope Boundaries

- No production deployment or secret configuration
- No pretending local proof equals production evidence
- No over-claiming measurement where only tooling exists

---

## Key Technical Decisions

- **D2 fix: dynamic dateKey** — Replace `const DATE_KEY = '2026-04-29'` with `new Date().toISOString().slice(0, 10)` so the fixture always uses today's date. Also update `NOW` to be consistent. This matches how the read-model derives dateKey.
- **Evidence filling: honest labelling** — Mark local proof as "LOCAL/DEV" not "PRODUCTION". The A2 contract distinguishes these explicitly.
- **Completion report: amend, don't rewrite** — Add a "Status Correction" section to the existing report rather than rewriting it. Transparent correction is better than silent edit.

---

## Implementation Units

- U1. **Fix D2 time-sensitive test regression**

**Goal:** Make `hero-pA1-flag-ladder.test.js` tests pass regardless of calendar date.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `tests/fixtures/hero-pA1-seeded-learners.js`

**Approach:**
- Change `const DATE_KEY = '2026-04-29'` to derive from current date: `const DATE_KEY = new Date().toISOString().slice(0, 10)`
- Ensure `NOW` timestamp is consistent with `DATE_KEY` (same day)
- Verify all 16 flag-ladder tests pass after the fix

**Test scenarios:**
- D2 test passes on any calendar date
- All other flag-ladder tests still pass (no dateKey-dependent assertions broken)
- The `duplicateRequest`, `completedDailyQuest`, `staleRequest` fixtures all use the dynamic dateKey correctly

**Verification:**
- `node --test tests/hero-pA1-flag-ladder.test.js` passes with 0 failures
- Full hero test suite has no new failures

---

- U2. **Fill Ring A2-1 ops evidence with local proof**

**Goal:** Run the ops probe, privacy validator, and launchability check locally and record results in evidence documents.

**Requirements:** R2

**Dependencies:** U1

**Files:**
- Modify: `docs/plans/james/hero-mode/A/hero-pA2-ops-evidence.md`

**Approach:**
- Run `node --test tests/hero-pA2-privacy-recursive.test.js` and record pass/fail count
- Run `node --test tests/hero-pA2-ops-probe.test.js` and record pass/fail count
- Run `node --test tests/hero-pA2-launchability-secure-grammar.test.js` and record pass/fail count
- Run `node --test tests/hero-pA2-internal-override-surface.test.js` and record pass/fail count
- Run `node scripts/validate-hero-pA2-certification-evidence.mjs` and record certification status
- Fill the ops evidence template with actual results, clearly labelled as LOCAL/DEV proof
- Mark Gate C (launchability) and Gate E (privacy) as LOCAL PASS

**Test scenarios:**
- Test expectation: none — evidence documentation only

**Verification:**
- Ops evidence document has no PENDING entries for items provable locally
- All entries clearly distinguish LOCAL proof from PRODUCTION proof

---

- U3. **Create GitHub issues for production cohort work**

**Goal:** Track the human-required work as issues so it doesn't get lost.

**Requirements:** R3

**Dependencies:** None

**Files:** None (GitHub issues only)

**Approach:**
Create 3 issues:
1. **"Hero Mode A2: Configure HERO_INTERNAL_ACCOUNTS and verify override"** — Steps: set secret, verify via ops probe, confirm non-internal accounts see nothing
2. **"Hero Mode A2: Run 5-day internal cohort observation"** — Steps: run smoke script daily, check stop conditions, record observations
3. **"Hero Mode A2: Complete A3 recommendation from cohort evidence"** — Steps: run metrics summary, fill recommendation, run certification validator

Each issue links to the relevant scripts and evidence templates.

**Verification:**
- 3 issues created with clear step-by-step instructions
- Issues reference the correct script paths and evidence file paths

---

- U4. **Correct completion report to honest status**

**Goal:** Amend the completion report to transparently distinguish what was delivered vs what remains.

**Requirements:** R4

**Dependencies:** U2, U3

**Files:**
- Modify: `docs/plans/james/hero-mode/A/hero-pA2-plan-completion-report.md`

**Approach:**
- Add a "## Status Correction (2026-04-30)" section at the top
- Clearly state: "Ring A2-1 code infrastructure is complete. Rings A2-2 through A2-4 require production execution and are tracked as GitHub issues."
- Change the phase status from "complete" to "code-complete, awaiting operational execution"
- Remove any language that implies the phase is finished
- Add links to the 3 GitHub issues

**Verification:**
- Report no longer claims phase completion
- Honest distinction between code-delivered and operationally-pending work

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Dynamic dateKey breaks other tests that rely on specific date values | Check all references to DATE_KEY in fixtures — they should all be relative, not absolute |
| Issues get lost without follow-up | Issues have clear acceptance criteria and link to scripts |

---

## Sources & References

- **Origin:** [docs/plans/james/hero-mode/A/hero-mode-pA2.md](docs/plans/james/hero-mode/A/hero-mode-pA2.md)
- **Prior plan:** [docs/plans/2026-04-29-015-feat-hero-mode-pA2-evidence-cohort-ops-plan.md](docs/plans/2026-04-29-015-feat-hero-mode-pA2-evidence-cohort-ops-plan.md)
- **D2 root cause:** `tests/fixtures/hero-pA1-seeded-learners.js:64` — hardcoded DATE_KEY
