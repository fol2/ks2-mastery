---
title: "feat: Grammar QG P7 — Production Calibration Activation and Evidence-Led Actions"
type: feat
status: active
date: 2026-04-29
origin: docs/plans/james/grammar/questions-generator/grammar-qg-p7.md
---

# feat: Grammar QG P7 — Production Calibration Activation and Evidence-Led Actions

## Overview

Activates P6's calibration telemetry against real production evidence. Closes remaining P6 governance gaps, plumbs client elapsed timing, builds a canonical event expansion pipeline, runs health/retention/mixed-transfer reports from expanded rows, and generates reviewed action candidates — all without mutating mastery, Star, Mega, monster, Concordium, or reward semantics.

---

## Problem Frame

P6 shipped shadow-mode calibration telemetry (template triage, mixed-transfer weights, retention monitoring) operating on synthetic fixtures only. P7 must prove the infrastructure works against production data, identify which templates and concepts need action, and prepare evidence-led changes for P8 review — without quietly altering learner-facing behaviour.

The P6 completion report reveals three governance gaps that must close before production activation: placeholder frontmatter acceptance, smoke evidence path mismatch, and hand-written test totals.

---

## Requirements Trace

- R1. Close P6 governance gaps (placeholder rejection, canonical smoke path, machine-derived test counts)
- R2. Plumb client elapsed timing safely into `elapsedMsBucket` without exposing raw ms
- R3. Expand multi-concept events into canonical per-concept analytics rows
- R4. Export and anonymise Grammar QG calibration events from production
- R5. Run health, mixed-transfer, and retention reports from canonical expanded rows
- R6. Generate evidence-led action candidates with confidence thresholds
- R7. Decide mixed-transfer shadow weight maturity gate
- R8. Decide retention-after-secure maintenance gate
- R9. Optional adult-facing calibration view reading report artefacts
- R10. Post-deploy smoke evidence at canonical path
- R11. Zero regression in P5/P6 verification gates
- R12. No mutation of mastery, Star, Mega, monster, Concordium, or reward semantics

---

## Scope Boundaries

- No AI-generated production questions
- No auto-retirement of templates without human review
- No mastery threshold or mixed-transfer scoring changes
- No child-facing demotion copy
- No telemetry in learner read models
- No D1 schema migration unless script-only exports prove insufficient
- No content release ID bump unless learner-facing content changes (R12)
- Action candidates are report-only — never auto-actioned in P7

### Deferred to Follow-Up Work

- P8: Evidence-led content and scheduler adjustments based on P7 production findings
- P8: Mixed-transfer shadow weight promotion to mastery scoring (requires separate reviewed plan)
- P8: Durable adult analytics dashboard (if script reports prove useful)
- P8: Bridge template creation where mixed-transfer gaps are proven

---

## Context & Research

### Relevant Code and Patterns

- `worker/src/subjects/grammar/engine.js:1712` — `elapsedMsBucket: bucketElapsedMs(null)` placeholder to plumb
- `worker/src/subjects/grammar/engine.js` — `bucketElapsedMs()` helper already exists (5 coarse bands)
- `worker/src/subjects/grammar/read-models.js` — `safeRecentAttempt()` redacts P6 calibration fields
- `scripts/grammar-qg-health-report.mjs` — template triage (8 categories), expects singular `conceptId` rows
- `scripts/grammar-qg-mixed-transfer-calibration.mjs` — evidence weight model (5 levels, 4 recommendations)
- `scripts/grammar-qg-retention-monitor.mjs` — lapse detection (3 classifications + insufficient_data)
- `scripts/validate-grammar-qg-completion-report.mjs` — `validateReleaseFrontmatter()` (length-only check)
- `scripts/grammar-production-smoke.mjs` — production smoke with `--json` evidence output
- `scripts/audit-grammar-question-generator.mjs` — corpus audit with provenance metadata

### Institutional Learnings

- **Grammar QG P6 architecture** — "Event enrichment, never fork the pipeline." P7 must plumb timing into the existing `grammar.answer-submitted` event, not introduce new event types.
- **Grammar QG P5 release gate** — One-command composable verification. P7 adds its gate as `verify:grammar-qg-p7` chaining `verify:grammar-qg-p6`.
- **Punctuation QG P4 governance** — Characterisation-first safe conversion: snapshot exact current output as frozen fixture before activating production calibration.
- **Grammar P7 quality/trust** — Deterministic event IDs for replay idempotency. Redacted debug models. Monotonicity proofs for evidence weighting.
- **DSL-as-normaliser** — If templates are reclassified, prove output identity via characterisation tests. Never batch template-management actions.
- **P6 release ID rule** — Telemetry plumbing and analytics scripts do NOT bump `GRAMMAR_CONTENT_RELEASE_ID`.

---

## Key Technical Decisions

- **Analytics schema version over content release bump**: P7 adds `grammarQGCalibrationSchemaVersion: 'grammar-qg-p7-calibration-v1'` rather than bumping the content release ID, since no learner-facing content changes.
- **Event expansion as offline script, not runtime transform**: The canonical row expansion runs as `scripts/grammar-qg-expand-events.mjs`, not as an event-time projection, to keep the engine zero-overhead.
- **Client timing via payload extension, not new command**: `submit-answer` payload gains optional `clientElapsedMs`; server validates, buckets, and discards the raw value.
- **Transfer-gap and retention-gap as cross-report classifications**: Only emitted when both concept-local AND cross-report data meet confidence thresholds.
- **`weakToSecureRecoveryRate` uses state transitions**: Computed from `conceptStatusBefore === 'weak'` AND `conceptStatusAfter === 'secure'` (or `'secured'`), not just correct attempts.

---

## Open Questions

### Resolved During Planning

- **Where to plumb client timing?** → `submit-answer` command payload. The engine's `applyGrammarAttemptToState` receives it and passes to `bucketElapsedMs()`.
- **New event type for expansion?** → No. Enrich existing `grammar.answer-submitted`. The expansion is an offline script, not a runtime pipeline.
- **Should reports consume raw or expanded events?** → Expanded only. All three report scripts (health, mixed-transfer, retention) will consume the canonical per-concept row format.

### Deferred to Implementation

- Exact anonymisation hash algorithm (SHA-256 vs HMAC-SHA-256 with salt) — depends on privacy review during U3.
- Whether the adult-facing view (U8) gets its own route or lives inside the admin console — depends on admin console P7 infrastructure availability.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT                                                             │
│  submit-answer { response, clientElapsedMs? }                       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  ENGINE (runtime)                                                    │
│  validate → clamp(0..180000) → bucketElapsedMs() → event emission   │
│  grammar.answer-submitted { ...P6 fields, elapsedMsBucket }         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ (stored in D1 event log)
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  EXPORT (offline script)                                             │
│  scripts/export-grammar-qg-events.mjs                               │
│  → filter by subject/release → anonymise → raw + expanded output    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  EXPANSION (offline script)                                          │
│  scripts/grammar-qg-expand-events.mjs                               │
│  → multi-concept events → N canonical rows per (eventId, conceptId) │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  CALIBRATION RUNNER (offline script)                                  │
│  npm run grammar:qg:calibrate                                        │
│  → health-report.json                                                │
│  → mixed-transfer-calibration.json                                   │
│  → retention-report.json                                             │
│  → action-candidates.json                                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  DECISION GATES (analytical — no auto-action)                        │
│  Mixed-transfer maturity: keep_shadow / prepare_experiment / deny    │
│  Retention maintenance: recommend / defer / insufficient_data        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Units

- U0. **Governance closure and release evidence hardening**

**Goal:** Close the three remaining P6 governance gaps before adding new analytics behaviour.

**Requirements:** R1, R11

**Dependencies:** None

**Files:**
- Modify: `scripts/validate-grammar-qg-completion-report.mjs`
- Modify: `scripts/grammar-production-smoke.mjs`
- Create: `scripts/capture-verification-summary.mjs`
- Modify: `package.json` (add `verify:grammar-qg-p7`)
- Create: `tests/grammar-qg-p7-governance.test.js`

**Approach:**
- Harden `validateReleaseFrontmatter()` to reject placeholder tokens: `pending`, `todo`, `tbc`, `unknown`, empty strings, and values matching `/^(pending|todo|tbc|unknown|n\/a|tbd)$/i`.
- Standardise production smoke evidence path to `reports/grammar/grammar-production-smoke-<contentReleaseId>.json`.
- Add `capture-verification-summary.mjs` that outputs `reports/grammar/grammar-qg-p7-verify-summary.json` with: command, commitSha, contentReleaseId, testFiles, testCount, passCount, failCount, timestamp.
- Wire `verify:grammar-qg-p7` in package.json: chains `verify:grammar-qg-p6` plus P7-specific test files.

**Execution note:** Characterisation-first — snapshot the current `validateReleaseFrontmatter` behaviour before modifying.

**Patterns to follow:**
- `scripts/validate-grammar-qg-completion-report.mjs` existing validator structure
- P5/P6 `verify:grammar-qg` composable chain pattern

**Test scenarios:**
- Happy path: valid frontmatter with real commit SHAs passes validation
- Error path: `final_report_commit: pending` → validation failure with field name in error
- Error path: `final_report_commit: todo` → validation failure
- Error path: `final_report_commit: ""` → validation failure
- Edge case: `final_report_commit: "pending-abcdef1"` → passes (contains but isn't the placeholder token)
- Happy path: smoke evidence path matches canonical format
- Error path: report claims post-deploy smoke passed but evidence file missing → failure
- Happy path: verification summary JSON written with correct test counts after a test run
- Integration: `verify:grammar-qg-p7` chains P6 gate successfully (P5/P6 backward-compatibility preserved)

**Verification:**
- `npm run verify:grammar-qg-p6` still passes (132 + 67 P6 tests)
- `validateReleaseFrontmatter()` rejects all placeholder tokens
- Verification summary JSON is parseable and machine-derived

---

- U1. **Client elapsed timing plumbing**

**Goal:** Wire `clientElapsedMs` from the `submit-answer` payload into `elapsedMsBucket` in emitted events.

**Requirements:** R2, R11

**Dependencies:** None (parallel with U0)

**Files:**
- Modify: `worker/src/subjects/grammar/engine.js`
- Modify: `worker/src/subjects/grammar/commands.js`
- Create: `tests/grammar-qg-p7-elapsed-timing.test.js`

**Approach:**
- In `commands.js`, extract `clientElapsedMs` from the `submit-answer` payload.
- Pass it through to `applyGrammarAttemptToState()` as an additional param.
- In `engine.js`, replace `bucketElapsedMs(null)` with `bucketElapsedMs(validatedMs)`.
- Validation rules: accept only finite numbers in range `[0, 180000]`; reject negative, NaN, Infinity, non-number. Invalid or missing → `null` (existing behaviour).
- Never store raw milliseconds — only the bucket string reaches the event.
- Read models continue to redact `elapsedMsBucket` via `safeRecentAttempt()`.

**Patterns to follow:**
- `engine.js` P6 telemetry field emission pattern (lines 1709-1717)
- `read-models.js` `safeRecentAttempt()` redaction pattern
- `bucketElapsedMs()` helper already in engine.js

**Test scenarios:**
- Happy path: `clientElapsedMs: 3500` → event contains `elapsedMsBucket: '2-5s'`
- Happy path: `clientElapsedMs: 500` → `elapsedMsBucket: '<2s'`
- Happy path: `clientElapsedMs: 25000` → `elapsedMsBucket: '>20s'`
- Edge case: `clientElapsedMs` missing/undefined → `elapsedMsBucket: null` (no crash)
- Edge case: `clientElapsedMs: -1` → `elapsedMsBucket: null`
- Edge case: `clientElapsedMs: Infinity` → `elapsedMsBucket: null`
- Edge case: `clientElapsedMs: NaN` → `elapsedMsBucket: null`
- Edge case: `clientElapsedMs: "fast"` → `elapsedMsBucket: null`
- Edge case: `clientElapsedMs: 180001` (above clamp) → `elapsedMsBucket: null` or clamped to '>20s'
- Integration: read model does NOT expose `elapsedMsBucket` after timing is plumbed
- Happy path: manual-review-saved events also receive timing when available

**Verification:**
- All existing grammar engine tests pass (no regression)
- `elapsedMsBucket` populated for valid timing, `null` for missing/invalid
- Read models remain unchanged

---

- U2. **Canonical event expansion pipeline**

**Goal:** Bridge raw Grammar events (multi-concept per event) into canonical per-concept analytics rows consumable by all report scripts.

**Requirements:** R3, R5

**Dependencies:** None (parallel with U0, U1)

**Files:**
- Create: `scripts/grammar-qg-expand-events.mjs`
- Create: `tests/grammar-qg-p7-event-expansion.test.js`

**Approach:**
- Input: raw Grammar event stream (JSON array or newline-delimited JSON).
- For each event with `conceptIds` array of length N, emit N rows with unique `rowId` = `${parentEventId}:${conceptId}`.
- Per-row: carry forward all parent fields, add `conceptId`, `conceptStatusBefore` (extracted from object), `conceptStatusAfter` (extracted from object), and boolean flags `isMixedTransfer`, `isExplanation`, `isSurgery`, `isManualReviewOnly`.
- Malformed events (missing templateId, conceptIds, or timestamp) are skipped with a summary count written to stderr.
- Deterministic and idempotent: same input always produces same output.
- CLI: `node scripts/grammar-qg-expand-events.mjs --input=<path> --output=<path>`

**Patterns to follow:**
- `scripts/grammar-qg-health-report.mjs` `isValidEvent()` shape expectation
- Row output shape matches the P7 brief §U2 exactly

**Test scenarios:**
- Happy path: single-concept event → one expanded row with all fields
- Happy path: multi-concept event (3 concepts) → three expanded rows with correct per-concept status
- Happy path: mixed-transfer tagged event → `isMixedTransfer: true` on all rows
- Edge case: event with empty `conceptIds: []` → zero rows, counted in malformed summary
- Edge case: event with `conceptStatusBefore` as string (legacy shape) → expanded correctly
- Edge case: event with `conceptStatusBefore` as object (P6 shape) → per-concept extraction
- Error path: malformed event (no templateId) → skipped, counted in summary
- Error path: malformed event (no timestamp) → skipped
- Happy path: idempotency — running twice produces identical output
- Happy path: `rowId` is deterministic given same parentEventId + conceptId
- Integration: health report script can consume expanded rows directly

**Verification:**
- Expansion is deterministic across runs
- Summary includes malformed count, total input events, total output rows
- Report scripts accept expanded row format without modification

---

- U3. **Production telemetry export and anonymisation**

**Goal:** Safe offline export of Grammar QG calibration events from production D1/event-log with learner anonymisation.

**Requirements:** R4, R12

**Dependencies:** U2 (expansion format defined)

**Files:**
- Create: `scripts/export-grammar-qg-events.mjs`
- Create: `tests/grammar-qg-p7-production-evidence.test.js`

**Approach:**
- Filter by subject `grammar` and release IDs `grammar-qg-p6-2026-04-29` onward.
- Optional filters: `--date-from`, `--date-to`, `--learner-cohort`, `--template-id`, `--concept-id`.
- Anonymise learner identifiers by HMAC-SHA-256 hashing with a local salt (salt file not committed).
- Output: raw events and expanded rows (invokes expansion logic from U2) as separate files.
- Dry-run mode: `--dry-run` reports event count and date range without writing output.
- Export summary: event count, unique learner count (hashed), date range, malformed count, release IDs covered.
- Can run locally against a fixture file for testing without production access.

**Patterns to follow:**
- `scripts/grammar-production-smoke.mjs` CLI pattern
- P6 telemetry event shape in engine.js

**Test scenarios:**
- Happy path: fixture with 5 events from 2 learners → exported with hashed learner IDs
- Happy path: filter by release ID → only matching events in output
- Happy path: filter by date range → only events within window
- Error path: no events match filters → empty output with summary showing 0 count
- Edge case: learner hash is consistent across runs with same salt
- Edge case: learner hash differs with different salt
- Happy path: dry-run mode → summary printed, no files written
- Error path: raw child name in event `learnerId` field → output contains only hash, never the original
- Integration: expanded output matches U2 row format exactly

**Verification:**
- Zero raw learner identifiers in any output artefact
- Export summary is machine-parseable JSON
- Fixture-based tests prove anonymisation without production access

---

- U4. **Calibration report runner**

**Goal:** Single command that runs all calibration reports from canonical expanded rows, with confidence gating and provenance metadata.

**Requirements:** R5, R6

**Dependencies:** U2 (expansion format), U0 (evidence path conventions)

**Files:**
- Create: `scripts/grammar-qg-calibrate.mjs`
- Modify: `scripts/grammar-qg-health-report.mjs` (accept expanded row format)
- Modify: `scripts/grammar-qg-mixed-transfer-calibration.mjs` (accept expanded row format)
- Modify: `scripts/grammar-qg-retention-monitor.mjs` (accept expanded row format)
- Modify: `package.json` (add `grammar:qg:calibrate` script)
- Create: `tests/grammar-qg-p7-health-report.test.js`

**Approach:**
- CLI: `npm run grammar:qg:calibrate -- --input=<expanded-events.json>`
- Orchestrates: health report → mixed-transfer calibration → retention report → action candidates.
- Each report outputs JSON + Markdown to `reports/grammar/grammar-qg-p7-<report-type>.json/.md`.
- Provenance metadata on every output: `origin`, `commitSha`, `timestamp`, `inputRowCount`, `calibrationSchemaVersion`.
- Confidence gating: reports distinguish `high` (>100), `medium` (30-100), `low` (10-30), `insufficient_data` (<10) per template/concept.
- Reports do NOT make scoring recommendations when confidence is insufficient.
- Refactor existing health/mixed-transfer/retention scripts to accept the canonical row format from U2, maintaining backward-compatibility with P6 test fixtures.

**Execution note:** Characterisation-first — run existing P6 report tests against current scripts, capture output as frozen baselines, then refactor input shape while proving output equivalence.

**Patterns to follow:**
- `scripts/grammar-qg-health-report.mjs` classification logic
- `scripts/grammar-qg-mixed-transfer-calibration.mjs` evidence weight model
- `scripts/grammar-qg-retention-monitor.mjs` lapse detection

**Test scenarios:**
- Happy path: calibration runner with fixture → all 4 output files created with provenance
- Happy path: health report classifies templates into 8 categories from expanded rows
- Happy path: mixed-transfer calibration computes evidence weights from expanded rows
- Happy path: retention report detects retained/lapsed concepts from expanded rows
- Edge case: input with <10 attempts per template → all classifications are `insufficient_data`
- Edge case: input with >100 attempts → `high` confidence classification
- Error path: empty input → reports generated with zero findings and `insufficient_data` across all
- Happy path: `transfer_gap` emitted when local success healthy + mixed-transfer weak + medium confidence
- Happy path: `retention_gap` emitted when secure concept lapses at high rate + medium confidence
- Happy path: `weakToSecureRecoveryRate` computed from status transitions, not just correct attempts
- Happy path: `weakCorrectAttemptRate` computed from correct attempts starting from weak
- Integration: P6 report tests still pass against refactored scripts (no regression)
- Integration: calibration schema version appears in all output files

**Verification:**
- All P6 health/mixed-transfer/retention tests pass unchanged
- `transfer_gap` and `retention_gap` classifications are functional
- `weakCorrectAttemptRate` and `weakToSecureRecoveryRate` are distinct metrics
- Report outputs include provenance and confidence levels

---

- U5. **Evidence-led action candidate generation**

**Goal:** Generate reviewed action candidates from calibration reports with confidence thresholds, rationale, and evidence counts — never auto-actioning.

**Requirements:** R6, R12

**Dependencies:** U4 (calibration reports as input)

**Files:**
- Create: `scripts/grammar-qg-action-candidates.mjs`
- Create: `tests/grammar-qg-p7-action-candidates.test.js`

**Approach:**
- Consumes health report, mixed-transfer calibration, and retention report JSONs.
- For each template/concept, classifies into one of 9 candidate categories: `keep`, `warm_up_only`, `review_wording`, `add_bridge_practice`, `expand_case_bank`, `rewrite_distractors`, `reduce_scheduler_weight`, `retire_candidate`, `increase_maintenance`.
- Each candidate includes: `templateId` or `conceptId`, `category`, `confidence`, `evidenceCount`, `rationale` (human-readable sentence), `sourceMetrics` (numbers backing the decision).
- Output: `reports/grammar/grammar-qg-p7-action-candidates.json` + `.md`.
- Confidence threshold: candidates require at least `medium` confidence (≥30 attempts) to emit a non-`keep` recommendation.
- Below threshold: emit as `insufficient_data` rather than overclaiming.
- No imports from mastery-write, reward, or Star modules.

**Patterns to follow:**
- P6 "recommendations never auto-actioned in same phase" contract
- `scripts/grammar-qg-health-report.mjs` classification logic
- `scripts/grammar-qg-mixed-transfer-calibration.mjs` recommendation pattern

**Test scenarios:**
- Happy path: healthy template with >100 attempts → `keep` with high confidence
- Happy path: template with >95% success + >100 attempts → `warm_up_only`
- Happy path: template with high `wrongAfterSupportRate` → `review_wording`
- Happy path: concept with healthy local success + weak mixed-transfer → `add_bridge_practice`
- Happy path: template with high repeat exposure + timing collapse → `expand_case_bank`
- Happy path: template with clustered wrong answers on one distractor → `rewrite_distractors`
- Happy path: template too hard + support-dependent + high confidence → `reduce_scheduler_weight`
- Happy path: persistent poor performance after revision → `retire_candidate`
- Happy path: concept with retention gap after secure → `increase_maintenance`
- Edge case: all templates below 30 attempts → all candidates are `insufficient_data`
- Edge case: candidate output includes rationale string explaining the classification
- Error path: no health report JSON available → script exits with clear error message
- Integration: no mastery-write/reward/Star imports in action-candidates script

**Verification:**
- Action candidates JSON is parseable with non-empty `rationale` per entry
- No template is auto-modified by this script
- Confidence thresholds enforced — no non-`keep` candidates below medium confidence

---

- U6. **Mixed-transfer evidence decision gate**

**Goal:** Determine whether P6's shadow weight model is mature enough to influence mastery scoring in a future phase, based on real production data.

**Requirements:** R7, R12

**Dependencies:** U4 (mixed-transfer calibration report)

**Files:**
- Create: `scripts/grammar-qg-mixed-transfer-decision.mjs`
- Modify: `tests/grammar-qg-p7-production-evidence.test.js`

**Approach:**
- Reads mixed-transfer calibration report JSON.
- Decision logic: if ≥6 of 8 mixed-transfer templates have ≥30 attempts (medium confidence), and ≥3 have ≥100 (high confidence), the model is `prepare_scoring_experiment`. Otherwise `keep_shadow_only`.
- If evidence shows clear harm (e.g., mixed-transfer success lower than random across high-confidence templates), output `do_not_promote`.
- Decision output is a single JSON file: `reports/grammar/grammar-qg-p7-mixed-transfer-decision.json`.
- Any scoring-change proposal is explicitly written as a separate future plan reference, never shipped in P7.

**Patterns to follow:**
- `scripts/grammar-qg-mixed-transfer-calibration.mjs` confidence thresholds

**Test scenarios:**
- Happy path: all 8 templates have >100 attempts, evidence positive → `prepare_scoring_experiment`
- Happy path: only 2 templates have >30 attempts → `keep_shadow_only`
- Edge case: mixed evidence (some positive, some harmful) → `keep_shadow_only` with detailed breakdown
- Edge case: clear harm signal across high-confidence templates → `do_not_promote`
- Happy path: decision includes per-template attempt counts and confidence levels
- Error path: calibration report missing → clear error with instruction to run calibration first

**Verification:**
- Decision JSON includes evidence summary with per-template attempt counts
- No mastery-write or scoring code touched
- Decision references "separate future plan" for any promotion

---

- U7. **Retention-after-secure maintenance decision gate**

**Goal:** Use production data to decide whether secure concepts need additional maintenance scheduling.

**Requirements:** R8, R12

**Dependencies:** U4 (retention report)

**Files:**
- Create: `scripts/grammar-qg-retention-decision.mjs`
- Modify: `tests/grammar-qg-p7-production-evidence.test.js`

**Approach:**
- Reads retention report JSON.
- Measures per-concept: retained-after-secure rate, lapse rate, difference between mixed-review and local-review retention, time-to-first-lapse, cluster analysis by template family.
- Decision outputs: `recommend_maintenance_experiment`, `defer_insufficient_data`, `no_action_needed`.
- If data insufficient (fewer than 30 secured attempts per concept on average): `defer_insufficient_data`.
- Any scheduler change is written as a separate future plan, never auto-shipped.

**Patterns to follow:**
- `scripts/grammar-qg-retention-monitor.mjs` lapse classification

**Test scenarios:**
- Happy path: concepts with high lapse rate + sufficient data → `recommend_maintenance_experiment`
- Happy path: concepts with low lapse rate + sufficient data → `no_action_needed`
- Edge case: insufficient data across all concepts → `defer_insufficient_data`
- Happy path: per-concept breakdown includes days-to-first-lapse
- Happy path: template-family clustering identifies if lapses concentrate in specific families
- Error path: retention report missing → clear error

**Verification:**
- Decision includes per-concept evidence counts
- No scheduler or mastery code modified
- Decision references "separate future plan" for any maintenance changes

---

- U8. **Adult-facing calibration view (optional)**

**Goal:** Lightweight internal view reading generated report artefacts for adult/admin review.

**Requirements:** R9

**Dependencies:** U4, U5, U6, U7 (report artefacts exist)

**Files:**
- Create: `src/subjects/grammar/GrammarAnalyticsScene.jsx`
- Create: `tests/grammar-qg-p7-analytics-view.test.js` (optional — unit tests for data transform only)

**Approach:**
- Reads pre-generated JSON artefacts (health report, mixed-transfer calibration, retention report, action candidates, decision gates).
- Displays: release ID, date range, template classification table, concept retention table, mixed-transfer evidence table, action candidates, confidence warnings.
- Admin/internal route only — never child-facing.
- Does not expose: answer keys, raw learner identifiers, demotion copy.
- Minimal interactive — static display of latest report run.

**Patterns to follow:**
- Admin Console patterns from `src/admin/` (if applicable)
- Existing read-only analytics views in the codebase

**Test scenarios:**
- Happy path: renders template classification table from health report JSON
- Happy path: shows confidence warnings for insufficient-data entries
- Edge case: missing report file → graceful "no data yet" state
- Error path: does not display answer keys or raw learner IDs
- Integration: admin-only route gate (not accessible to learner sessions)

**Verification:**
- View renders from fixture data without errors
- No answer keys or learner identifiers visible
- Admin-only access enforced

---

- U9. **Post-deploy smoke evidence and P7 completion**

**Goal:** Run Grammar production smoke against the deployed Worker, produce evidence artefact at canonical path, and validate the P7 completion report.

**Requirements:** R10, R11

**Dependencies:** U0 (canonical path), all other units (final validation)

**Files:**
- Modify: `scripts/grammar-production-smoke.mjs` (canonical path output)
- Create: `reports/grammar/grammar-qg-p7-completion-report.md`
- Modify: `tests/grammar-qg-p7-governance.test.js` (validate P7 report)

**Approach:**
- Run `scripts/grammar-production-smoke.mjs` post-deploy against the live Worker.
- Evidence artefact at: `reports/grammar/grammar-production-smoke-grammar-qg-p7-calibration-v1.json`
- Artefact includes: `ok`, deployed origin, content release ID, analytics schema version, commit SHA, tested template IDs, answer-spec families covered, timestamp.
- Completion report includes all fields from §9 of the brief: PRs, release ID, analytics schema, verification summary, smoke status, telemetry source, calibration conclusions, scoring change status, action candidates, risks, P8 recommendations.
- Report validator ensures: no placeholders, evidence file exists if smoke claimed passed, test totals from machine-derived artefact.

**Patterns to follow:**
- `scripts/grammar-production-smoke.mjs` existing evidence output
- P6 completion report structure

**Test scenarios:**
- Happy path: smoke artefact at canonical path with all required fields
- Happy path: completion report passes `validateReleaseFrontmatter()` with real commit SHAs
- Happy path: report's test totals match verification summary artefact
- Error path: report claims smoke passed but evidence file missing → validation fails
- Happy path: report correctly states `no` for mastery/scoring changes

**Verification:**
- `npm run verify:grammar-qg-p7` passes all tests
- `npm run verify:grammar-qg-p6` still passes (zero regression)
- Completion report validated against live audit output

---

## System-Wide Impact

- **Interaction graph:** `commands.js` → `engine.js` (timing param pass-through); `export` → `expand` → `calibrate` → `decision-gates` (offline pipeline, no runtime coupling)
- **Error propagation:** Invalid `clientElapsedMs` silently degrades to `null` bucket — never crashes the engine or blocks scoring
- **State lifecycle risks:** None — all analytics work is offline script output; no runtime state mutation
- **API surface parity:** The `submit-answer` payload gains an optional field; no breaking change for clients that omit it
- **Integration coverage:** P6 backward-compatibility (132 + 67 tests) proves no runtime regression; P7 adds governance + timing + expansion + report + candidate tests
- **Unchanged invariants:** Star, Mega, monster, Concordium, reward, mastery thresholds — explicitly unchanged; content release ID unchanged unless learner-facing content changes; `safeRecentAttempt()` redaction contract unchanged

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Insufficient production data for meaningful calibration conclusions | Reports explicitly output `insufficient_data` rather than overclaiming; decision gates defer rather than guess |
| `clientElapsedMs` from untrusted client could be spoofed | Never used for scoring; bucketed only for analytics; extreme values rejected |
| Expansion script changes break P6 health report tests | Characterisation-first: freeze P6 report output before refactoring input shape |
| Admin view exposes sensitive data | Strict redaction: no answer keys, no raw learner IDs; admin-only route gate |
| D1 event-log export requires schema migration | Script designed to work from fixture file first; D1 migration deferred unless proven necessary |

---

## Sources & References

- **Origin document:** [docs/plans/james/grammar/questions-generator/grammar-qg-p7.md](docs/plans/james/grammar/questions-generator/grammar-qg-p7.md)
- P6 completion report: `docs/plans/james/grammar/questions-generator/grammar-qg-p6-final-completion-report-2026-04-29.md`
- P6 architecture pattern: `docs/solutions/architecture-patterns/grammar-qg-p6-calibration-telemetry-architecture-2026-04-29.md`
- P5 release gate pattern: `docs/solutions/architecture-patterns/grammar-qg-p5-machine-verifiable-content-release-process-2026-04-28.md`
- Grammar engine: `worker/src/subjects/grammar/engine.js`
- Existing health report: `scripts/grammar-qg-health-report.mjs`
- Report validator: `scripts/validate-grammar-qg-completion-report.mjs`
