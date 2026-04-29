---
title: "feat: Punctuation QG P5 — Safe Production Capacity and Telemetry Attestation"
type: feat
status: active
date: 2026-04-29
origin: docs/plans/james/punctuation/questions-generator/punctuation-qg-p5.md
---

# Punctuation QG P5 — Safe Production Capacity and Telemetry Attestation

## Overview

Make the Punctuation question generator safe to operate at production scale by closing every validation gap P4 left open: exhaustive golden marking, honest telemetry, reachable mixed-review scheduling, proven misconception sibling-retry lifecycle, duplicate-stem governance, and deployment attestation. Only after all gates pass may production capacity be raised from depth 4 → 6.

**Regression constraint:** No P4 invariant may regress. P4 parity baselines, release gate, runtime item count (192), and release ID remain untouched until U8 explicitly bumps them.

---

## Problem Frame

P4 converted all 25 generator families to DSL-backed authoring and introduced scheduler maturity + evidence dedup. However, P4 is an engineering phase — not a production release. Six families lack golden marking coverage, two telemetry events have no command-path emission proof, mixed-review scheduling is unreachable without `session.recentModes`, and sibling-retry lifecycle has no end-to-end integration test. These gaps must close before capacity can safely increase.

---

## Requirements Trace

- R1. All 25 DSL families have exhaustive golden accept/reject coverage
- R2. Every declared `emitted` telemetry event has a command-path test; `reserved` events are not counted
- R3. Mixed-review scheduling is either reachable end-to-end or the claim is removed
- R4. Misconception sibling-retry works end-to-end (detect → select different sibling → record repair signal → no trap loop)
- R5. Duplicate stem/model clusters are reviewed before any capacity raise
- R6. Support evidence is either fully wired or clearly labelled future-ready
- R7. Production depth may be raised from 4 → 6 only after R1–R6 pass
- R8. Production smoke proves which build was tested (release ID, commit SHA, runtime count)
- R9. Completion report language distinguishes declared vs emitted, source vs deployed, current vs future-ready
- R10. No runtime AI generation is introduced

---

## Scope Boundaries

- No runtime AI question generation
- No Star model rewrite — may harden evidence gates but Stars remain subject-owned learning evidence
- No second reward system inside Punctuation (Hero Coins / Hero Mode stay external)
- No capacity raise before telemetry, golden coverage, duplicate-review, and smoke gates pass
- Depth 8 remains capacity-audit only, not production default

### Deferred to Follow-Up Work

- Long-term monitoring dashboards: future P6
- Cross-subject Hero Mode task envelopes: Hero Mode owns
- Content portfolio expansion based on real learner data: requires P5 telemetry to accumulate

---

## Context & Research

### Relevant Code and Patterns

| Area | Key files |
|------|-----------|
| DSL families (25) | `shared/punctuation/dsl-families/*.js` |
| Generator bank | `shared/punctuation/generators.js` — `GENERATED_TEMPLATE_BANK`, `createPunctuationGeneratedItems()` |
| Golden marking test | `tests/punctuation-golden-marking.test.js` — 19 families registered, 6 missing |
| Scheduler | `shared/punctuation/scheduler.js` — `selectPunctuationItem()`, `isMixedReview()`, `selectMisconceptionRetry()` |
| Scheduler manifest | `shared/punctuation/scheduler-manifest.js` — leaf module, REASON_TAGS enum |
| Telemetry events | `shared/punctuation/telemetry-events.js` — 11 event names (manifest-leaf) |
| Telemetry shapes | `shared/punctuation/telemetry-shapes.js` — per-kind payload allowlist |
| Client telemetry | `src/subjects/punctuation/telemetry.js` — `buildAllowlistedPayload()` |
| Worker events | `worker/src/subjects/punctuation/events.js` — `applyRecordEventCommand()` |
| Star projection | `src/subjects/punctuation/star-projection.js` — evidence dedup at projection layer |
| Content audit | `scripts/audit-punctuation-content.mjs` — `--strict --reviewer-report` |
| Production smoke | `scripts/punctuation-production-smoke.mjs` |
| Release gate | `scripts/verify-punctuation-qg.mjs` — 7-component composition |
| CI workflow | `.github/workflows/punctuation-content-audit.yml` |

### Institutional Learnings

1. **DSL-as-normaliser pattern** (`docs/solutions/architecture-patterns/punctuation-qg-p3-dsl-authoring-time-normaliser-2026-04-28.md`): Golden tests call production `markPunctuationAnswer()`, min 4 cases per template, `embedTemplateId: false` preserves content-hash IDs.
2. **P4 autonomous governance** (`docs/solutions/architecture-patterns/punctuation-qg-p4-autonomous-governance-phase-2026-04-29.md`): Evidence dedup is projection-layer only; scheduler-manifest is a leaf with drift tests; release gate composes 7 components.
3. **Grammar QG P5 machine-verifiable release** (`docs/solutions/architecture-patterns/grammar-qg-p5-machine-verifiable-content-release-process-2026-04-28.md`): Deep-seed expansion at 30+ seeds for capacity validation; production-smoke evidence capture with `--json` and provenance metadata.
4. **Grammar QG P6 calibration telemetry** (`docs/solutions/architecture-patterns/grammar-qg-p6-calibration-telemetry-architecture-2026-04-29.md`): Enrich existing events, never fork pipeline; script-only analytics in shadow mode; release ID bumps only for learner-facing content changes.
5. **pickBySeed modulo pattern** (`docs/solutions/logic-errors/seeded-prng-index-collision-pickbyseed-2026-04-28.md`): Use double-modulo for banks <20 items; reserve mulberry32 for shuffling/large pools.

---

## Key Technical Decisions

- **Golden marking self-check enforcement**: The test will import the generator bank's family list and assert every family is registered. A missing family fails the test — no manual registry maintenance required.
- **Telemetry manifest with explicit status**: Each event gets `emitted | reserved | deprecated`. Reports filter by status. `STAR_EVIDENCE_DEDUPED_BY_TEMPLATE` likely → `reserved` until Star projection can actually detect template-level dedup (currently only signature-level).
- **Mixed-review via derived recentModes**: Derive from last N attempt records rather than requiring explicit persistence — avoids new storage and works with existing session shape.
- **Capacity raise gated by verification script**: A new `--depth 6` flag to the existing verify script. Cannot pass unless all P5 gates are green.
- **No new D1 tables or schema changes**: All P5 work is in shared/client/worker logic and test harness.

---

## Open Questions

### Resolved During Planning

- **Should `STAR_EVIDENCE_DEDUPED_BY_TEMPLATE` be emitted or reserved?** → Reserved. Current star-projection only deduplicates by `variantSignature` per facet, not by `templateId`. Marking it `reserved` is honest; emitting it would require projection-layer changes that are out of P5 scope.
- **Should `GENERATED_SIGNATURE_EXPOSED` be emitted?** → Yes. The scheduler already selects generated items; the emission point is when a generated item is delivered as the active item. This is a one-line emit in the Worker command handler.
- **How to derive recentModes without new storage?** → Read the last 5 attempt records from the session's attempt history (already available in `session.attempts`). Map each to its mode. This is derivation, not persistence.
- **Support evidence — wire or defer?** → Defer and label `future-ready`. Punctuation does not currently emit supported/guided attempts in production. The Star projection fields exist for forward-compatibility but are not active signals.

### Deferred to Implementation

- Exact accept/reject test vectors for the 6 missing families — depends on reading each DSL's `build()` output
- Whether any duplicate stem clusters at depth 6 require template rewrites — depends on audit output
- Exact JSON schema for the learning-health report — shaped by what the strict audit already collects

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
┌─────────────────────────────────────────────────────────────────┐
│ P5 Verification Pipeline (extends verify-punctuation-qg.mjs)   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [P4 gates — unchanged]                                         │
│    ├── strict audit (depth 4)                                   │
│    ├── capacity audit (depth 8)                                 │
│    ├── golden marking (now 25/25)  ← U1                         │
│    ├── DSL parity                                               │
│    ├── read-model redaction                                     │
│    └── reviewer report                                          │
│                                                                 │
│  [P5 gates — new]                                               │
│    ├── telemetry command-path tests ← U2                        │
│    ├── learning-health report (strict) ← U3                     │
│    ├── mixed-review integration ← U4                            │
│    ├── sibling-retry lifecycle ← U5                             │
│    ├── duplicate stem/model review ← U7                         │
│    └── production smoke attestation ← U9                        │
│                                                                 │
│  [Optional gate — capacity raise]                               │
│    └── depth-6 audit + release-id bump ← U8                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Units

- U1. **Make golden marking coverage exhaustive**

**Goal:** Close the 19→25 coverage gap with a self-checking registry that fails on any unregistered family.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `tests/punctuation-golden-marking.test.js`
- Read: `shared/punctuation/generators.js` (import family list for self-check)
- Read: `shared/punctuation/dsl-families/colon-list-combine.js`
- Read: `shared/punctuation/dsl-families/semicolon-fix.js`
- Read: `shared/punctuation/dsl-families/semicolon-combine.js`
- Read: `shared/punctuation/dsl-families/colon-semicolon-paragraph.js`
- Read: `shared/punctuation/dsl-families/bullet-points-fix.js`
- Read: `shared/punctuation/dsl-families/bullet-points-paragraph.js`
- Test: `tests/punctuation-golden-marking.test.js`

**Approach:**
- Import the 6 missing DSL families and add them to the FAMILIES registry
- Add a new assertion that compares `FAMILIES.map(f => f.name)` against the keys exported from `generators.js` (the GENERATED_TEMPLATE_BANK family set). Any mismatch fails the test.
- Each template in the 6 new families already has `tests.accept` / `tests.reject` from P4 DSL conversion — the golden test just needs to exercise them through `markPunctuationAnswer()`
- Assert 25/25 families, update the `totalTemplatesTested >= 152` floor to reflect expanded count

**Execution note:** Characterisation-first — run existing golden tests before modifying, freeze the 19-family passing state, then add 6 families one-by-one confirming each passes.

**Patterns to follow:**
- Existing FAMILIES registry pattern in `tests/punctuation-golden-marking.test.js:57-77`
- Each DSL family's `tests` block convention from `docs/solutions/architecture-patterns/punctuation-qg-p3-dsl-authoring-time-normaliser-2026-04-28.md`

**Test scenarios:**
- Happy path: All 25 families pass accept cases through `markPunctuationAnswer()` → marked correct
- Happy path: All 25 families fail reject cases through `markPunctuationAnswer()` → marked incorrect
- Edge case: A DSL family present in GENERATED_TEMPLATE_BANK but missing from test registry → test fails with descriptive error naming the missing family
- Edge case: A test registry entry referencing a family not in GENERATED_TEMPLATE_BANK → test fails (orphan detection)
- Edge case: A template with 0 accept cases → test fails
- Edge case: A template with 0 reject cases → test fails
- Integration: Capacity depth 8 model answers also pass marking (proves expanded variants are valid)

**Verification:**
- `npm test -- --test-name-pattern "golden marking"` passes with 25/25 families
- Deliberately removing one family from FAMILIES causes the self-check to fail

---

- U2. **Align telemetry declaration, emission, and tests**

**Goal:** Create an explicit telemetry manifest with `emitted | reserved | deprecated` status per event, and prove every `emitted` event through a Worker command-path test.

**Requirements:** R2

**Dependencies:** None (parallel with U1)

**Files:**
- Modify: `shared/punctuation/telemetry-events.js` — add status metadata
- Create: `shared/punctuation/telemetry-manifest.js` — manifest-leaf with event statuses
- Modify: `worker/src/subjects/punctuation/events.js` — emit `GENERATED_SIGNATURE_EXPOSED` on active-item delivery
- Create: `tests/punctuation-telemetry-command-path.test.js`
- Test: `tests/punctuation-telemetry-command-path.test.js`

**Approach:**
- Create `telemetry-manifest.js` as a manifest-leaf (zero imports) that maps each event name to its status: `emitted`, `reserved`, or `deprecated`
- Mark `STAR_EVIDENCE_DEDUPED_BY_TEMPLATE` as `reserved` (projection doesn't detect template-level dedup yet)
- Mark `GENERATED_SIGNATURE_EXPOSED` as `emitted` and add emission in the Worker command handler when a generated item is selected for the active slot
- Write a command-path integration test per `emitted` event: create a Worker app with migrated D1, run a command that triggers the event, assert it was recorded
- Add a meta-test: count events with status `emitted` and assert each has a corresponding test case

**Patterns to follow:**
- Manifest-leaf module pattern (zero sibling imports, `Object.freeze`)
- Worker integration test pattern via `createWorkerApp()` + `createMigratedSqliteD1Database()`
- Grammar QG P6 event enrichment principle: enrich, never fork

**Test scenarios:**
- Happy path: Worker command delivering a generated item emits `GENERATED_SIGNATURE_EXPOSED` with opaque signature payload
- Happy path: Misconception retry scheduling emits `MISCONCEPTION_RETRY_SCHEDULED`
- Happy path: Each `emitted` event has at least one command-path test exercising it through a real Worker
- Edge case: Telemetry payload for `GENERATED_SIGNATURE_EXPOSED` contains no raw answers, no full validator, no template internals
- Error path: Attempt to emit a `reserved` event through the approved emission path is not possible (no emission callsite exists)
- Integration: Meta-test counts `emitted` events in manifest vs test cases — mismatch fails

**Verification:**
- All command-path tests pass
- Report utility can distinguish emitted (with test proof) from reserved (no emission callsite)

---

- U3. **Add Punctuation QG learning-health report**

**Goal:** Create a CI-safe report that aggregates scheduling, exposure, retry, and evidence metrics from synthetic fixtures.

**Requirements:** R2, R9

**Dependencies:** U2 (needs telemetry manifest for reserved/emitted distinction)

**Files:**
- Create: `scripts/punctuation-qg-health-report.mjs`
- Create: `tests/punctuation-health-report.test.js`
- Modify: `scripts/verify-punctuation-qg.mjs` — add health report to verification pipeline
- Test: `tests/punctuation-health-report.test.js`

**Approach:**
- Report collects: signature exposure count, repeat rate, scheduler reason distribution, misconception retry scheduled/pass rate, spaced-return rates, retention-after-secure rates, Star dedup by signature/template, production/capacity depth, duplicate signature count, duplicate stem/model clusters, reserved event list
- Two output modes: `--json` for CI consumption, human-readable markdown for dev/admin
- `--strict` mode: fails if any `emitted` telemetry event lacks command-path coverage (reads from manifest)
- `--fixture synthetic` mode: runs against deterministic synthetic data (no live DB required)
- No raw learner answers in output — only aggregate counts and rates

**Patterns to follow:**
- `scripts/audit-punctuation-content.mjs` CLI flag pattern
- Grammar QG P5 evidence capture with `--json` structured artefact

**Test scenarios:**
- Happy path: Report generates valid JSON in `--json` mode with all expected sections
- Happy path: Report generates readable markdown in default mode
- Happy path: `--strict` mode passes when all emitted events have tests
- Edge case: `--strict` mode fails when a hypothetical emitted event has no command-path test
- Edge case: Report works on empty synthetic fixture (zero attempts) without crashing
- Edge case: Report does not include reserved events in the "emitted count" section

**Verification:**
- `node scripts/punctuation-qg-health-report.mjs --strict --fixture synthetic` exits 0
- Report included in `verify-punctuation-qg.mjs` pipeline

---

- U4. **Make mixed-review scheduling reachable**

**Goal:** Wire `session.recentModes` derivation so `MIXED_REVIEW` reason tag can actually be selected in normal sessions.

**Requirements:** R3

**Dependencies:** None (parallel with U1–U3)

**Files:**
- Modify: `shared/punctuation/scheduler.js` — derive `recentModes` from attempt history when not explicitly provided
- Modify: `shared/punctuation/service.js` — pass attempt history to scheduler context
- Create: `tests/punctuation-mixed-review.test.js`
- Test: `tests/punctuation-mixed-review.test.js`

**Approach:**
- The scheduler already reads `session.recentModes` (line 653). Currently returns `false` when array length < 3.
- Add derivation: if `session.recentModes` is not provided but `session.attempts` exists, derive recentModes from the last 5 attempts' item modes
- In `service.js`, ensure the session object passed to the scheduler includes recent attempts when calling `selectPunctuationItem()`
- Guard: mixed-review must not overselect at the expense of `due-review` or `weak-skill-repair` — weight it below those priorities

**Patterns to follow:**
- Existing `isMixedReview()` function structure
- Scheduler-manifest leaf: any new constants (e.g., `MIXED_REVIEW_MIN_RECENT_MODES = 3`) must go in `scheduler-manifest.js`

**Test scenarios:**
- Happy path: Session with 5+ attempts across 2+ modes → `MIXED_REVIEW` is selectable when no higher-priority reason applies
- Happy path: Scheduler still prefers `due-review` and `weak-skill-repair` over mixed-review when both qualify
- Edge case: Session with all attempts in the same mode → mixed-review never triggers (no variety to mix)
- Edge case: Session with < 3 recent attempts → mixed-review returns false (existing guard preserved)
- Error path: `session.attempts` is undefined → derivation gracefully returns empty array, no crash
- Integration: Full scheduler cycle with synthetic session produces a reason-tag distribution that includes `mixed-review` at least once across 50 item selections

**Verification:**
- Deterministic test creates sessions with multi-mode history and confirms `MIXED_REVIEW` tag appears
- Scheduler does not overselect mixed-review (verify distribution across 50+ selections)

---

- U5. **Complete misconception sibling-retry lifecycle**

**Goal:** Prove the full retry loop end-to-end: detect misconception → select different sibling → record repair signal → no infinite trap.

**Requirements:** R4

**Dependencies:** None (parallel)

**Files:**
- Modify: `shared/punctuation/scheduler.js` — add loop-breaker guard if missing
- Create: `tests/punctuation-sibling-retry-lifecycle.test.js`
- Test: `tests/punctuation-sibling-retry-lifecycle.test.js`

**Approach:**
- Existing `selectMisconceptionRetry()` → `misconceptionSiblingCandidates()` → `rankMisconceptionCandidates()` already selects siblings with different `variantSignature` and preferably different `templateId`
- P5 must add: (a) integration test proving the full lifecycle, (b) loop-breaker — if the same misconception has been retried N times without repair, demote priority so the learner isn't trapped
- Loop-breaker constant in scheduler-manifest: `MISCONCEPTION_RETRY_MAX_ATTEMPTS = 3` (per misconception tag per session)
- Successful retry: emit or record `MISCONCEPTION_RETRY_PASSED` signal (already in telemetry events)

**Patterns to follow:**
- Existing `MISCONCEPTION_RETRY_WINDOW = 5` pattern in scheduler-manifest
- Rank-4/3/2/1 diversity ranking in `rankMisconceptionCandidates()`

**Test scenarios:**
- Happy path: Wrong answer with misconceptionTags → scheduler selects a sibling with different variantSignature
- Happy path: Sibling has different templateId (rank 4 preferred over rank 1)
- Happy path: Correct retry attempt emits `MISCONCEPTION_RETRY_PASSED`
- Edge case: Sibling differs by signature but shares stem text → still valid (stem diversity is preferred, not required)
- Edge case: Only 1 item shares the misconception tag → no sibling available → falls through to next reason
- Error path: Same misconception retried 3 times without repair → priority demoted, learner escapes
- Integration: Full Worker lifecycle: wrong answer → retry scheduled → different item delivered → correct answer → repair signal recorded
- Integration: Both fixed and generated items participate in sibling retry (not just generated)

**Verification:**
- Lifecycle test proves all 6 stages from spec section 2.4
- Loop-breaker prevents infinite retry on a single misconception

---

- U6. **Clarify support evidence as future-ready**

**Goal:** Mark support evidence fields as `future-ready` since Punctuation does not currently emit supported/guided attempts.

**Requirements:** R6

**Dependencies:** None (parallel)

**Files:**
- Modify: `src/subjects/punctuation/star-projection.js` — add inline documentation marking support fields as future-ready
- Create: `tests/punctuation-support-evidence.test.js`
- Test: `tests/punctuation-support-evidence.test.js`

**Approach:**
- Confirm that no production command path currently emits a `supported: true` or `guidanceKind` field in Punctuation attempts
- Star projection already excludes supported attempts from Secure/Mastery evidence — verify this gate with a test
- Add a test that a supported attempt (if one existed) cannot unlock deep secure evidence unless the Star contract explicitly allows it
- Mark the support fields in star-projection with a clear `future-ready` label in the telemetry manifest

**Patterns to follow:**
- Star projection exclusion logic already in `star-projection.js`
- Manifest-leaf documentation convention

**Test scenarios:**
- Happy path: An attempt with `supported: true` is excluded from Secure evidence
- Happy path: An attempt with `supported: true` is excluded from Mastery evidence
- Edge case: An attempt with `supported: undefined` (normal case) counts normally
- Integration: The telemetry manifest marks support-related events as `reserved` not `emitted`

**Verification:**
- Tests prove support evidence cannot inflate Stars
- Report and manifest agree that supported attempts are `future-ready`

---

- U7. **Review duplicate stems and models before capacity raise**

**Goal:** Extend the reviewer report to surface duplicate stem/model clusters with per-cluster decisions.

**Requirements:** R5

**Dependencies:** U1 (needs exhaustive coverage to validate all families)

**Files:**
- Modify: `scripts/audit-punctuation-content.mjs` — add stem/model duplicate cluster report with decision field
- Create: `tests/punctuation-duplicate-review.test.js`
- Test: `tests/punctuation-duplicate-review.test.js`

**Approach:**
- The audit already detects duplicate signatures. Extend to cluster by normalised stem text and normalised model text.
- Each cluster output: family ID, mode, template IDs, variant signatures, visible stem/model summary, production-depth impact (depth 4), capacity-depth impact (depth 6/8)
- The `--reviewer-report` flag should include a section requiring explicit decisions for each cluster: `acceptable-intentional-overlap | needs-rewrite | acceptable-at-depth-4 | acceptable-at-depth-6 | acceptable-at-depth-8`
- Capacity raise to depth 6 is blocked if any unreviewed clusters would reduce variety at that depth

**Patterns to follow:**
- Existing `groupDuplicates(rows, keyFn)` in audit script
- `normaliseAuditText()` for text comparison
- Grammar QG P5 content-quality linting as hard gate

**Test scenarios:**
- Happy path: No duplicate stems at depth 4 → report shows "0 clusters, no action needed"
- Happy path: Duplicate stems at depth 6 → report surfaces clusters with required decision fields
- Edge case: Two templates share normalised stem but different modes → treated as separate (mode-scoped clusters)
- Edge case: Intentional overlap (same stem, different misconception target) → decision = `acceptable-intentional-overlap` does not block
- Error path: Unreviewed cluster at depth 6 + attempt to use `--depth 6` flag → audit fails with descriptive error

**Verification:**
- `npm run audit:punctuation-content -- --reviewer-report` includes duplicate stem/model section
- Depth-6 gate blocked if unreviewed clusters exist

---

- U8. **Controlled production capacity decision**

**Goal:** Provide the mechanism to safely raise production depth from 4 → 6 with a new release ID, gated on all prior units passing.

**Requirements:** R7, R10

**Dependencies:** U1, U2, U3, U4, U5, U6, U7

**Files:**
- Modify: `shared/punctuation/generators.js` — add configurable depth parameter (default stays 4)
- Modify: `shared/punctuation/content.js` — manifest reflects actual depth
- Modify: `scripts/verify-punctuation-qg.mjs` — add `--depth 6` verification path
- Modify: `scripts/audit-punctuation-content.mjs` — validate at requested depth
- Test: `tests/punctuation-capacity-raise.test.js`

**Approach:**
- Production depth remains 4 by default. A depth-6 release requires:
  1. All P5 gates green at depth 4
  2. Duplicate stem review complete (U7) — no unreviewed clusters at depth 6
  3. Capacity audit passes at depth 6
  4. New release ID: `punctuation-r5-qg-capacity-6`
- Runtime count formula: `92 + 25 × depth` → depth 6 = 242 items
- Star evidence remains release-scoped. Old release evidence does not inflate new release Stars.
- `starHighWater` ratchet preserved: high-water Stars from the old release carry forward safely.
- If evidence doesn't support depth 6, keeping depth 4 is the correct P5 outcome.

**Patterns to follow:**
- Release ID convention: `punctuation-r<N>-<descriptor>`
- Star projection release-scoping logic

**Test scenarios:**
- Happy path: Default production depth remains 4, runtime count = 192
- Happy path: Depth-6 mode produces 242 items with no duplicate signatures
- Happy path: New release ID `punctuation-r5-qg-capacity-6` is distinct from P4's `punctuation-r4-full-14-skill-structure`
- Edge case: Star high-water from release-r4 is preserved when switching to release-r5
- Edge case: Old release evidence does not count toward new release Stars
- Error path: Attempting depth 6 with unreviewed duplicate clusters → verification fails

**Verification:**
- Verify script at `--depth 6` passes only after all gates are green
- Production smoke asserts correct runtime total for whichever depth is active

---

- U9. **Strengthen production smoke and deployment attestation**

**Goal:** Extend smoke tests to prove what was tested — environment, release ID, commit SHA, runtime count, authenticated status.

**Requirements:** R8

**Dependencies:** U8 (needs release ID and runtime count to be accurate)

**Files:**
- Modify: `scripts/punctuation-production-smoke.mjs` — add attestation metadata to output
- Create: `tests/punctuation-smoke-attestation.test.js`
- Test: `tests/punctuation-smoke-attestation.test.js`

**Approach:**
- Smoke output gains fields: `environment`, `releaseId`, `runtimeItemCount`, `generatedDepth`, `workerCommitSha` (if available), `timestamp`, `authenticatedCoverage` (boolean), `adminHubCoverage` (boolean)
- Smoke fails if runtime count doesn't match expected for the active depth
- Smoke fails if generated metadata leaks beyond approved opaque fields
- If Admin credentials not available → `adminHubCoverage: false` with explicit note (not silent omission)
- `--json` output mode for CI artefact capture

**Patterns to follow:**
- Grammar QG P5 production-smoke evidence capture (provenance metadata, `--evidence-origin`)
- Existing `PUNCTUATION_P2_LOCAL_RELEASE_MANIFEST_EXPECTATIONS` shape

**Test scenarios:**
- Happy path: Smoke at depth 4 asserts 192 runtime items + correct release ID
- Happy path: Smoke at depth 6 asserts 242 runtime items + new release ID
- Happy path: JSON output includes all attestation fields with correct types
- Edge case: Worker commit SHA unavailable → field is `null`, smoke still passes but notes the gap
- Edge case: Admin credentials unavailable → `adminHubCoverage: false`, no false confidence
- Error path: Runtime count mismatch → smoke fails with descriptive error showing expected vs actual

**Verification:**
- Smoke script produces JSON attestation artefact
- Runtime count assertion catches any drift between manifest and production

---

- U10. **Tighten completion-report language and P5 verification command**

**Goal:** Write a completion report template and verification script that uses precise language — no over-claiming.

**Requirements:** R9

**Dependencies:** U1–U9 (runs last as it summarises all work)

**Files:**
- Create: `scripts/verify-punctuation-qg-p5.mjs` — single P5 verification entry point
- Modify: `package.json` — add `verify:punctuation-qg:p5` script
- Test: (verified by running the script itself)

**Approach:**
- The P5 verification script runs the full pipeline: P4 gates + P5-specific gates + optional depth-6 gate
- Completion report language rules: declared vs emitted, manifest vs command-path, model-answer vs golden accept/reject, production vs capacity depth, source vs deployed, current vs future-ready
- Known residual risks listed with owner, severity, and next action
- Runtime counts shown with formulae

**Patterns to follow:**
- `scripts/verify-punctuation-qg.mjs` composition pattern (runs sub-commands, aggregates results)
- Grammar QG P5 machine-verifiable completion report convention

**Test scenarios:**
- Happy path: `npm run verify:punctuation-qg:p5` runs all checks and reports aggregate pass/fail
- Happy path: Report correctly distinguishes "11 declared, N emitted, M reserved" (not "11 emitted")
- Edge case: A single sub-check failure → whole verification fails with clear indication of which gate failed

**Verification:**
- Script exits 0 only when all P5 gates pass
- Output uses precise vocabulary matching spec section 5.10

---

## System-Wide Impact

- **Interaction graph:** Telemetry emission touches Worker command handler → D1 write path. Golden marking exercises `markPunctuationAnswer()` which is the same function learners hit live. Scheduler changes affect item selection for all Punctuation sessions.
- **Error propagation:** Telemetry emission failure must not block item delivery — fire-and-forget with rate limiting (existing pattern). Scheduler derivation failure (missing attempts) must gracefully degrade to existing behaviour.
- **State lifecycle risks:** Mixed-review derivation reads from existing attempt records — no new writes. Capacity raise changes the runtime manifest shape, requiring release-id scoping in Star projection.
- **API surface parity:** Client read-model already redacts sensitive fields — no new surfaces exposed. Admin Hub optional coverage is explicitly noted when unavailable.
- **Integration coverage:** Sibling-retry lifecycle test must exercise the full Worker stack (not just isolated scheduler logic). Telemetry command-path tests use real Worker instances.
- **Unchanged invariants:** P4 parity baselines untouched. 14 published reward units unchanged. Star high-water ratchet unchanged. Existing REASON_TAGS enum not modified (only the reachability of `mixed-review` changes).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Missing DSL families have broken accept/reject test vectors | Run each through markPunctuationAnswer before committing — the 6 families were DSL-converted in P4 so tests should already be valid |
| Mixed-review derivation degrades scheduler performance | Derivation reads last 5 attempts (O(1) slice) — negligible overhead |
| Depth-6 reveals duplicate stems that block the raise | U7 catches this before U8 — keeping depth 4 is an acceptable P5 outcome |
| Telemetry command-path tests require Worker harness | Pattern already established; uses in-process Worker with migrated D1 |
| Release-id bump invalidates some admin/smoke tooling | Smoke script already reads release ID dynamically from the manifest |

---

## Sources & References

- **Origin document:** [docs/plans/james/punctuation/questions-generator/punctuation-qg-p5.md](docs/plans/james/punctuation/questions-generator/punctuation-qg-p5.md)
- Related architecture: [docs/solutions/architecture-patterns/punctuation-qg-p4-autonomous-governance-phase-2026-04-29.md](docs/solutions/architecture-patterns/punctuation-qg-p4-autonomous-governance-phase-2026-04-29.md)
- Related pattern: [docs/solutions/architecture-patterns/punctuation-qg-p3-dsl-authoring-time-normaliser-2026-04-28.md](docs/solutions/architecture-patterns/punctuation-qg-p3-dsl-authoring-time-normaliser-2026-04-28.md)
- Related pattern: [docs/solutions/architecture-patterns/grammar-qg-p5-machine-verifiable-content-release-process-2026-04-28.md](docs/solutions/architecture-patterns/grammar-qg-p5-machine-verifiable-content-release-process-2026-04-28.md)
- Related pattern: [docs/solutions/architecture-patterns/grammar-qg-p6-calibration-telemetry-architecture-2026-04-29.md](docs/solutions/architecture-patterns/grammar-qg-p6-calibration-telemetry-architecture-2026-04-29.md)
