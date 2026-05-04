---
title: "feat: Hero Mode pA3 — Real-Cohort Evidence Hardening and External-Cohort Readiness"
type: feat
status: active
date: 2026-04-30
origin: docs/plans/james/hero-mode/A/hero-mode-pA3.md
---

# feat: Hero Mode pA3 — Real-Cohort Evidence Hardening and External-Cohort Readiness

## Overview

pA3 replaces the simulation-backed pA2 evidence model with real internal production evidence, direct Goal 6 telemetry extraction, honest provenance-gated certification, and a validated operational loop — proving Hero Mode safe enough to recommend a tiny external cohort in A4.

All deliverables are **infrastructure-only**: scripts, validators, evidence templates, and operational procedures. Zero changes to Hero Mode runtime code (routes, commands, read-model, economy, Camp). This architectural constraint guarantees zero regression.

---

## Problem Frame

pA2 reached `CERTIFIED_PRE_A3` mechanically but with an honest limitation: 4/5 observation rows are operator-accepted simulation, not elapsed real production days. The validator counts dated rows without provenance distinction, so `| 2026-05-01 |` passes the gate whether it represents real usage or a simulation row. pA3 must make the evidence model honest and then actually prove the system works under repeated real internal use before any external widening. (see origin: `docs/plans/james/hero-mode/A/hero-mode-pA3.md`)

---

## Requirements Trace

- R1. Every evidence row carries a source classification (`real-production` / `staging` / `local` / `simulation` / `manual-note`)
- R2. Validator counts `real-production` rows separately; A3 gates cannot pass on simulation alone
- R3. Validator emits `CERTIFIED_WITH_LIMITATIONS` or `NOT_CERTIFIED` when real evidence is below threshold
- R4. At least 5 real production calendar days, 2 date-key rollovers, 3 learner profiles
- R5. Direct telemetry extraction for all Goal 6 signals (§3 of origin: start, completion, abandonment, subject mix, claim, economy, Camp, mastery drift)
- R6. Privacy-validated extraction output — no raw child content in any export path
- R7. Browser QA and rollback evidence repeatable by another operator
- R8. pA1/pA2 documentation drift corrected before external widening
- R9. A4 recommendation issued (PROCEED / HOLD / ROLLBACK) on evidence
- R10. External micro-cohort (≤10 accounts, ≥14 days) executed with daily operator review and immediate rollback for stop conditions
- R11. Zero changes to Hero Mode runtime worker code, routes, commands, economy, or Camp logic

---

## Scope Boundaries

- No Hero Mode runtime changes (routes, claim, camp, read-model, economy, launch)
- No D1 schema migrations
- No new environment variables
- No new client/React code
- No feature additions, new monsters, new earning rules, or economy changes
- No six-subject widening
- Hero Mode remains default-off for non-internal accounts throughout

### Deferred to Follow-Up Work

- A4 external cohort execution: separate phase with its own contract if pA3 recommends PROCEED
- Analytics dashboard: pA3 uses scripts and D1 queries, not a UI
- Parent reports: not in scope for any A-series work

---

## Context & Research

### Relevant Code and Patterns

- `scripts/validate-hero-pA2-certification-evidence.mjs` — current validator (provenance-unaware `countObservations` regex)
- `reports/hero/hero-pA2-certification-manifest.json` — ring-based manifest with condition evaluators
- `scripts/hero-pA2-cohort-smoke.mjs` — smoke script that fetches ops probe and appends evidence rows
- `scripts/hero-pA2-metrics-summary.mjs` — metrics aggregation with `parseObservationTable` that reads 8-column table
- `shared/hero/metrics-privacy.js` — recursive privacy validator and stripper
- `shared/hero/metrics-contract.js` — 52 defined metric names across 4 families
- `worker/src/hero/telemetry-probe.js` — admin-only D1 read from `event_log WHERE system_id='hero-mode'`
- `worker/src/hero/analytics.js` — balance bucket, health indicators, reconciliation gap derivation
- `shared/hero/account-override.js` — `resolveHeroFlagsWithOverride` controlling internal cohort access
- `worker/src/app.js:1617-1914` — event_log writes for claim, coins, and camp events (system_id='hero-mode')

### Institutional Learnings

- `project_hero_mode_pA2.md` — pA2 certification is mechanically complete but evidence is simulation-backed
- `project_d1_atomicity_batch_vs_withtransaction.md` — D1 batch() for atomicity, not withTransaction
- `project_windows_nodejs_pitfalls.md` — path handling, CRLF awareness for scripts

### External References

- pA3 contract document: `docs/plans/james/hero-mode/A/hero-mode-pA3.md` (sections §1-§13)
- pA2 recommendation: `docs/plans/james/hero-mode/A/hero-pA2-recommendation.md`
- pA2 internal cohort evidence: `docs/plans/james/hero-mode/A/hero-pA2-internal-cohort-evidence.md`

---

## Key Technical Decisions

- **Provenance via table column, not separate files:** Add a `Source` column to the observation table rather than splitting into separate files. Simpler for the validator and matches the pA3 contract's column-level requirement.
- **D1 query pack over new admin route:** Goal 6 telemetry extraction implemented as a Node.js script that queries D1 via Wrangler (`wrangler d1 execute`). Avoids touching `routes.js` and guarantees zero regression.
- **A3 manifest is a new file, not a modification of A2's:** `hero-pA3-certification-manifest.json` with A3 rings. The A2 manifest remains frozen as a historical record.
- **External micro-cohort uses existing `HERO_INTERNAL_ACCOUNTS`:** No code change required — simply add accounts to the JSON array in production secrets. Operational procedure only.
- **Smoke script evolves to A3 variant:** New `hero-pA3-cohort-smoke.mjs` rather than modifying the A2 script. Preserves the A2 tool chain as a historical reference.
- **All test scenarios use the existing pA2 test pattern:** `describe/it` with dependency-injected file readers and mock data — no real filesystem or network access in CI.

---

## Open Questions

### Resolved During Planning

- **Where does telemetry extraction run?** — As a local script via `wrangler d1 execute` for the production database, or against a local D1 file for dev. Never as a deployed route.
- **How many event types exist in event_log for hero-mode?** — Three: claim events (app.js:1643), coin award events (app.js:1667), and camp spend events (app.js:1899). The extraction script covers all three.
- **Can Ring A3-5 be done without code?** — Yes. Adding account IDs to `HERO_INTERNAL_ACCOUNTS` via `wrangler secret put` is sufficient. The account-override module (`shared/hero/account-override.js`) already handles any JSON array of account IDs.

### Deferred to Implementation

- Exact learner IDs for the 3+ internal learner profiles (depends on test account availability)
- Whether the metrics summary script should produce a combined A2+A3 view or A3-only (implementer decides based on readability)
- Exact wording of pA1/pA2 drift corrections (requires reading each doc and identifying specific false claims)

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
┌─────────────────────────────────────────────────────────────────┐
│                    pA3 Evidence Pipeline                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  D1 event_log ──────► extraction script ──► privacy-strip ──►   │
│  (hero-mode)          (Goal 6 signals)      (recursive)         │
│       │                                          │               │
│       │                                          ▼               │
│       │                              A3 metrics baseline         │
│       │                                          │               │
│       ▼                                          ▼               │
│  ops probe ──► smoke script ──► evidence file ──► validator ──►  │
│  (existing)    (provenance)     (9-col table)    (A3 manifest)   │
│                                                       │          │
│                                                       ▼          │
│                                        CERTIFIED / NOT_CERTIFIED │
│                                                       │          │
│                                                       ▼          │
│                                        A4 recommendation         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Units

- U1. **Evidence schema provenance upgrade**

**Goal:** Add `Source` column to the observation table format and create the A3 evidence file with the provenance-aware schema.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Create: `docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md`
- Reference: `docs/plans/james/hero-mode/A/hero-pA2-internal-cohort-evidence.md` (schema reference)

**Approach:**
- 9-column table: `| Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Source | Status |`
- Source values: `real-production`, `staging`, `local`, `simulation`, `manual-note`
- Each row also carries collection method, environment, and operator fields in a metadata section above the table
- Include the evidence boundary statement explaining provenance requirements

**Patterns to follow:**
- Existing `hero-pA2-internal-cohort-evidence.md` table structure (extended by one column)

**Test scenarios:**
- Test expectation: none — pure documentation artifact

**Verification:**
- File exists with 9-column header row and provenance metadata section
- No observation rows yet (those come from Ring A3-1)

---

- U2. **Provenance-aware certification validator**

**Goal:** Create the A3 validator that counts `real-production` rows separately and gates certification on provenance-qualified evidence.

**Requirements:** R2, R3

**Dependencies:** U1

**Files:**
- Create: `scripts/validate-hero-pA3-certification-evidence.mjs`
- Create: `reports/hero/hero-pA3-certification-manifest.json`
- Test: `tests/hero-pA3-certification-evidence.test.js`

**Approach:**
- `countObservationsByProvenance(content)` — extends `countObservations` to return `{ total, realProduction, simulation, staging, local, manualNote, dateKeys, realDateKeys }`
- Gate conditions: `min_real_observations_N` and `min_real_datekeys_N` that only count `real-production` source rows
- Certification states: `NOT_CERTIFIED`, `CERTIFIED_WITH_LIMITATIONS`, `CERTIFIED_PRE_A4`
- Manifest rings map to pA3 §6: A3-0 through A3-5 with appropriate evidence conditions per gate
- `checkContainsDecision` updated for A4 keywords (`PROCEED TO A4` / `HOLD AND HARDEN` / `ROLL BACK`)
- DI pattern preserved: `validateCertification(manifest, fileReader, rootDir)` signature

**Patterns to follow:**
- `scripts/validate-hero-pA2-certification-evidence.mjs` — exact structure, DI pattern, exit code 0

**Test scenarios:**
- Happy path: 5 real-production rows with 3 date keys → `CERTIFIED_PRE_A4`
- Happy path: all rings pass, decision present → full certification
- Edge case: 5 rows but only 2 are `real-production` → `NOT_CERTIFIED` (below threshold)
- Edge case: 4 real + 3 simulation → `CERTIFIED_WITH_LIMITATIONS` if date keys insufficient
- Edge case: 0 rows → `NOT_CERTIFIED`
- Edge case: rows with no Source column → treated as `simulation` (defensive default)
- Error path: manifest file missing → graceful exit, no crash
- Error path: evidence file missing → ring failure with descriptive message
- Integration: real-datekey count excludes simulation rows even when simulation rows have distinct dates

**Verification:**
- Script runs without error; `--json` flag produces machine-readable output
- Tests pass covering all gate conditions and provenance logic

---

- U3. **A3 certification manifest**

**Goal:** Define the ring-by-ring evidence gates for pA3 matching the contract's §6 acceptance gates.

**Requirements:** R2, R3, R4, R9

**Dependencies:** U1, U2

**Files:**
- Create: `reports/hero/hero-pA3-certification-manifest.json`

**Approach:**
- Ring A3-0: evidence provenance, docs drift (file_exists checks)
- Ring A3-1: real internal cohort (`min_real_observations_5`, `min_real_datekeys_2`, `min_real_learners_3`)
- Ring A3-2: telemetry extraction (file_exists for metrics output)
- Ring A3-3: browser QA + rollback (file_exists for QA evidence and rollback evidence)
- Ring A3-4: A4 decision (`contains_decision` for the recommendation file)
- Ring A3-5: external micro-cohort (min_real_observations for external evidence file, min_real_datekeys for 14-day duration)

**Patterns to follow:**
- `reports/hero/hero-pA2-certification-manifest.json` structure

**Test scenarios:**
- Happy path: manifest parses as valid JSON with all 6 rings defined
- Edge case: each ring condition type is recognised by the validator
- Covered by U2 integration tests (manifest loaded + validated end-to-end)

**Verification:**
- JSON parses without error; all ring names match §7 of the origin contract

---

- U4. **Documentation drift reconciliation**

**Goal:** Correct pA1/pA2 documents so they no longer claim evidence strength that does not exist.

**Requirements:** R8

**Dependencies:** None

**Files:**
- Modify: `docs/plans/james/hero-mode/A/hero-mode-pA1.md`
- Modify: `docs/plans/james/hero-mode/A/hero-pA1-recommendation.md`
- Modify: `docs/plans/james/hero-mode/A/hero-mode-pA2.md`
- Modify: `docs/plans/james/hero-mode/A/hero-pA2-plan-completion-report.md`
- Modify: `docs/plans/james/hero-mode/A/hero-pA2-internal-cohort-evidence.md`
- Modify: `docs/plans/james/hero-mode/A/hero-pA2-metrics-baseline.md`

**Approach:**
- Add evidence boundary statement to pA1 docs where they forward-reference A2 cohort evidence
- Ensure pA2 docs clearly separate "code complete", "mechanically certified", "production internal enablement verified", and "external readiness proven" (per §5 of origin)
- Add explicit Source annotation to existing pA2 evidence rows (retroactively label the 1 real + 4 simulation)
- Reconcile "what remains" sections that may contradict final status
- Ensure the certification manifest comment explains what it proves vs. what it deliberately does not

**Patterns to follow:**
- Existing pA2 recommendation already uses honest language ("operator-accepted simulation rows") — extend this pattern to all docs

**Test scenarios:**
- Test expectation: none — documentation corrections only

**Verification:**
- No document claims "5 real production days" when 4 are simulation
- Evidence boundary is explicit in every evidence and metrics file
- Certification manifest has a human-readable `limitations` or `scope` field

---

- U5. **A3 cohort smoke script (provenance-aware)**

**Goal:** Create the pA3 cohort smoke script that records observations with source provenance.

**Requirements:** R1, R4, R11

**Dependencies:** U1

**Files:**
- Create: `scripts/hero-pA3-cohort-smoke.mjs`
- Test: `tests/hero-pA3-cohort-smoke.test.js`

**Approach:**
- Extends the pA2 smoke script pattern (fetch ops probe, detect stop conditions, append row)
- Appends 9-column rows with explicit `real-production` source when fetched from live probe
- CLI flags: `--probe-url`, `--learner-ids`, `--dry-run`, `--source` (defaults to `real-production`, allows `staging`/`local` override)
- Operator and timestamp metadata recorded in the append section
- Stop condition detection reused from pA2 smoke (import the `detectStopConditions` function)

**Patterns to follow:**
- `scripts/hero-pA2-cohort-smoke.mjs` — CLI pattern, fetch, append, dry-run

**Test scenarios:**
- Happy path: probe returns OK data → 9-column row appended with `real-production` source
- Happy path: `--source staging` → row appended with `staging` source
- Happy path: `--dry-run` → outputs row but does not modify evidence file
- Edge case: probe returns error → row appended with `source: manual-note` and error in Status
- Edge case: multiple learner IDs → one row per learner per invocation
- Error path: evidence file missing → creates file with header (defensive)
- Integration: appended row parseable by U2 validator's `countObservationsByProvenance`

**Verification:**
- Script runs without error; appended rows contain Source column
- Tests pass including integration with the provenance counter

---

- U6. **Goal 6 telemetry extraction script**

**Goal:** Extract the 16 Goal 6 signals from D1 event_log for the internal cohort, with privacy validation on output.

**Requirements:** R5, R6, R11

**Dependencies:** None (reads existing event_log data)

**Files:**
- Create: `scripts/hero-pA3-telemetry-extract.mjs`
- Test: `tests/hero-pA3-telemetry-extract.test.js`

**Approach:**
- Queries D1 `event_log WHERE system_id='hero-mode'` grouped by event_type, learner_id, date
- Computes each Goal 6 signal from the raw events:
  - `hero-quest-shown` → card rendered count
  - `hero-claim-success` / `hero-claim-rejected` → completion rate, rejection reasons
  - `hero-coins-awarded` → daily award count, duplicate prevention
  - `hero-camp-*` → Camp open, invite, grow, insufficient, duplicate
  - Derived: start rate, abandonment (shown minus completed), subject mix (from subject_id), task intent (from event_json)
- Privacy pass: runs `validateMetricPrivacyRecursive` on every extracted row; aborts with error if any violation found
- Output: structured JSON report + optional markdown summary
- Execution: `node scripts/hero-pA3-telemetry-extract.mjs --db-path .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite` (local) or via `wrangler d1 execute` wrapper for production
- Mastery drift signal: compares `child_subject_state` before/after Hero sessions for the cohort learners (cross-table join)
- Can be run against local dev D1 file or production via `--env production`

**Patterns to follow:**
- `scripts/hero-pA2-metrics-summary.mjs` — CLI arg parsing, output generation
- `shared/hero/metrics-privacy.js` — privacy validation import

**Test scenarios:**
- Happy path: mock event_log rows for all 3 event types → correct signal extraction per type
- Happy path: privacy validation passes on clean data → report generated
- Edge case: no events for a learner → signals report zeros, not errors
- Edge case: event_json is malformed → gracefully skipped with warning, not crash
- Error path: privacy violation in extracted data → script aborts with violation path
- Error path: D1 database not available → clear error message with usage hint
- Integration: extracted report includes all 16 Goal 6 signal categories from §3 of origin

**Verification:**
- Script produces report covering all 16 signal categories
- Privacy validation passes on output
- Report distinguishes measurable vs. not-yet-measurable signals with confidence levels

---

- U7. **A3 metrics summary (provenance-aware)**

**Goal:** Upgrade the metrics summary script to read 9-column provenance-aware evidence and integrate Goal 6 extraction results.

**Requirements:** R2, R5

**Dependencies:** U1, U6

**Files:**
- Create: `scripts/hero-pA3-metrics-summary.mjs`
- Test: `tests/hero-pA3-metrics-summary.test.js`

**Approach:**
- Reads the A3 evidence file (9-column format)
- Separates real vs. simulation observations in all counts
- Generates confidence levels based on real-production row count only
- Incorporates Goal 6 extraction output (reads JSON from U6 output) for the health-test assessment
- Health-test dimensions upgrade from `insufficient-data` / `observed` to include provenance-qualified confidence
- Outputs to `docs/plans/james/hero-mode/A/hero-pA3-metrics-baseline.md`

**Patterns to follow:**
- `scripts/hero-pA2-metrics-summary.mjs` — `parseObservationTable`, `aggregateMetrics`, markdown generation

**Test scenarios:**
- Happy path: 5 real + 2 simulation rows → confidence classified on real count only (5)
- Happy path: Goal 6 JSON report integrated → health dimensions reflect telemetry findings
- Edge case: no Goal 6 report file → health dimensions marked `telemetry-pending`
- Edge case: mixed provenance → summary clearly separates real vs. total counts
- Error path: malformed evidence file → graceful error with descriptive message

**Verification:**
- Generated baseline document shows real/total split
- Health test dimensions reflect provenance-qualified confidence

---

- U8. **Browser QA checklist and evidence template**

**Goal:** Create a repeatable browser QA checklist matching pA3 §4 (Goal 4) that another operator can re-run.

**Requirements:** R7

**Dependencies:** None

**Files:**
- Create: `docs/plans/james/hero-mode/A/hero-pA3-browser-qa-evidence.md`

**Approach:**
- 12-item checklist matching §4 Goal 4 items 1-12
- Each item: description, pass/fail, evidence method (screenshot, console log, network tab), date, operator
- Includes rollback rehearsal section (items 11-12)
- Format allows manual or Playwright-assisted execution
- Pre-populated with the expected result for each check

**Patterns to follow:**
- Structured evidence tables from `hero-pA2-internal-cohort-evidence.md`

**Test scenarios:**
- Test expectation: none — operational template/checklist

**Verification:**
- All 12 items from §4 present
- Rollback items (11-12) explicitly require preserve-state proof

---

- U9. **Rollback and support procedures**

**Goal:** Document the exact rollback procedure and support checklist for the internal and external cohort.

**Requirements:** R7, R10

**Dependencies:** None

**Files:**
- Create: `docs/plans/james/hero-mode/A/hero-pA3-rollback-procedure.md`
- Create: `docs/plans/james/hero-mode/A/hero-pA3-support-checklist.md`

**Approach:**
- Rollback: step-by-step narrowing/clearing `HERO_INTERNAL_ACCOUNTS` via `wrangler secret put`
- Verification that Hero surfaces disappear for removed accounts
- Confirmation that balances, ledgers, ownership remain dormant (not deleted)
- Support checklist: what to inspect for each stop condition (which table, which field, which probe query)
- Maps each §8 stop condition to the operational response

**Patterns to follow:**
- pA2 recommendation's "Rollback And Dormancy Note" section (expanded to operational procedure)

**Test scenarios:**
- Test expectation: none — operational documentation

**Verification:**
- Every §8 stop condition has an explicit response procedure
- Rollback procedure is testable without deleting state

---

- U10. **External micro-cohort operational procedure (Ring A3-5)**

**Goal:** Define the operational procedure for adding ≤10 external accounts to the allowlist and monitoring for 14 days.

**Requirements:** R10

**Dependencies:** U5, U6, U8, U9

**Files:**
- Create: `docs/plans/james/hero-mode/A/hero-pA3-external-cohort-procedure.md`
- Create: `docs/plans/james/hero-mode/A/hero-pA3-external-cohort-evidence.md`

**Approach:**
- Entry criteria: all A3-0 through A3-4 rings pass
- Account selection: up to 10 external accounts, per-account allowlist only
- Onboarding: add account IDs to `HERO_INTERNAL_ACCOUNTS` JSON via `wrangler secret put`
- Monitoring: daily smoke script run + daily telemetry extraction + daily operator review
- Evidence file: same 9-column provenance format as internal evidence (U1)
- Stop conditions: immediate rollback for any §8 condition; rollback = remove account from JSON
- Duration gate: 14 real calendar days minimum
- Exit: recommendation issued, accounts either kept or removed

**Patterns to follow:**
- `shared/hero/account-override.js` — `HERO_INTERNAL_ACCOUNTS` is the existing mechanism

**Test scenarios:**
- Test expectation: none — operational procedure documentation

**Verification:**
- Procedure matches §7 Ring A3-5 constraints exactly (10 accounts, 14 days, per-account, daily review)
- Evidence file uses provenance-aware schema
- Rollback procedure references U9

---

- U11. **A4 recommendation template and risk register**

**Goal:** Create the decision template and risk register update for the A3→A4 gate.

**Requirements:** R9

**Dependencies:** U2 (validator must be able to issue final certification)

**Files:**
- Create: `docs/plans/james/hero-mode/A/hero-pA3-recommendation.md`
- Create: `docs/plans/james/hero-mode/A/hero-pA3-risk-register.md`

**Approach:**
- Recommendation template: PROCEED TO A4 / HOLD AND HARDEN / ROLL BACK — with evidence summary, stop condition review, and next-phase constraints
- Risk register: carry forward pA2 risks + add A3-specific risks (evidence strength, micro-cohort findings, telemetry gaps)
- Template pre-filled with section headers and placeholder decision keywords for the validator to check
- References all A3 evidence files and gate results

**Patterns to follow:**
- `docs/plans/james/hero-mode/A/hero-pA2-recommendation.md` — structure and tone
- `docs/plans/james/hero-mode/A/hero-pA2-risk-register.md` — risk categories

**Test scenarios:**
- Test expectation: none — template documents with placeholder content

**Verification:**
- Recommendation file has `Recommendation: [PLACEHOLDER]` that the validator can detect as not-yet-decided
- Risk register covers all §8 stop conditions as risk rows

---

- U12. **Integration test suite for the A3 pipeline**

**Goal:** Verify the full A3 certification pipeline end-to-end: evidence file → provenance counting → manifest gates → certification status.

**Requirements:** R2, R3, R11

**Dependencies:** U1, U2, U3, U5, U7

**Files:**
- Create: `tests/hero-pA3-pipeline-integration.test.js`

**Approach:**
- End-to-end test: create mock evidence file with mixed provenance → run validator against A3 manifest → assert correct certification status
- Test the full gate chain: Ring A3-0 pass + A3-1 fail → `NOT_CERTIFIED`
- Test provenance gate: 5 rows total but only 2 real → fails `min_real_observations_5`
- Test smoke script output format is parseable by metrics summary script
- Test privacy validation on mock telemetry extraction output
- All tests use DI (mock fileReader) — no real filesystem or network

**Patterns to follow:**
- `tests/hero-pA2-certification-evidence.test.js` — DI pattern, describe/it structure

**Test scenarios:**
- Happy path: all gates pass with sufficient real evidence → `CERTIFIED_PRE_A4`
- Happy path: mixed provenance, only real rows counted → correct gate behaviour
- Edge case: Ring A3-5 missing (optional) → does not block A3-4 certification
- Edge case: external evidence file missing → Ring A3-5 fails gracefully, other rings unaffected
- Error path: decision keyword missing → A3-4 fails with descriptive message
- Integration: smoke output + metrics summary + validator form a coherent pipeline

**Verification:**
- All tests pass in CI
- Pipeline correctly separates real from simulated evidence end-to-end

---

## System-Wide Impact

- **Interaction graph:** New scripts read from existing evidence files and D1 data only. No callbacks, middleware, or observer changes. The extraction script reads event_log but never writes.
- **Error propagation:** All scripts exit 0 and report status — they never crash CI. Test files use standard assert/expect.
- **State lifecycle risks:** None — no state mutations anywhere. Evidence files are append-only markdown.
- **API surface parity:** No API changes. The telemetry extraction is offline-only, never exposed as a route.
- **Integration coverage:** U12 provides end-to-end pipeline verification. Browser QA (U8) is manual/semi-automated.
- **Unchanged invariants:** All Hero Mode runtime routes, commands, economy logic, Camp logic, read-model, and account-override remain untouched. The `worker/src/hero/` directory receives zero modifications.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| D1 event_log may have few/no hero-mode events if Hero was rarely used internally | Ring A3-1 requires 5 real calendar days of actual use; extraction script handles zero-event case gracefully |
| Internal test accounts may not cover all required states (low-balance, Camp-sufficient, etc.) | Document which states were achieved vs. which need explicit setup; accept limitations with evidence boundary |
| External micro-cohort accounts may not actively use Hero Mode | 14-day minimum with daily review; extend duration if activity is insufficient |
| Provenance column change means pA2 scripts won't parse A3 evidence | A3 gets its own scripts — pA2 tools remain frozen as historical references |
| Windows path handling in new scripts | Use `path.join`/`path.resolve` consistently; test on Windows CI runner |

---

## Sources & References

- **Origin document:** [docs/plans/james/hero-mode/A/hero-mode-pA3.md](docs/plans/james/hero-mode/A/hero-mode-pA3.md)
- Related code: `scripts/validate-hero-pA2-certification-evidence.mjs`, `scripts/hero-pA2-cohort-smoke.mjs`
- Related evidence: `docs/plans/james/hero-mode/A/hero-pA2-internal-cohort-evidence.md`
- Related PRs: pA2 series #660-#678, #683-#709
