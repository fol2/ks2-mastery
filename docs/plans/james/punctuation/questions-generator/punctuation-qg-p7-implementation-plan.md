---
title: "feat: Punctuation QG P7 — Oracle Hardening, Reviewer Decisions, and Depth-6 Readiness"
type: feat
status: active
date: 2026-04-29
origin: docs/plans/james/punctuation/questions-generator/punctuation-qg-p7.md
---

# Punctuation QG P7 — Oracle Hardening, Reviewer Decisions, and Depth-6 Readiness

## Overview

Production trust hardening phase for the Punctuation question generator. P7 addresses five systemic trust risks: a too-permissive speech marking oracle, drifting depth constants, missing reviewer workflow, shallow explanation quality checks, and weak perceived-variety enforcement. The overarching constraint is **zero regression** — every existing P6 gate continues to pass after P7 changes.

---

## Problem Frame

P6 delivered production-quality content at depth 4 (192 items, 25 families, 92 fixed). But P6 validation surfaced trust gaps: `reportingPosition: 'any'` skips reporting-comma checks entirely (`marking.js:191`), depth constants are duplicated across `generators.js` and `service.js`, reviewer decisions are empty fixtures, explanations pass only "not generic" checks, and variety normalisation glues words across dashes.

P7 does not expand content volume. It makes the existing pool provably trustworthy for depth-6 activation.

(see origin: `docs/plans/james/punctuation/questions-generator/punctuation-qg-p7.md`)

---

## Requirements Trace

- R1. Speech oracle rejects reporting-before answers with missing reporting comma under `reportingPosition: 'any'`
- R2. Production depth has exactly one canonical source consumed by all downstream modules
- R3. Depth-6 candidate reviewer pack supports `--include-depth-6`, `--depth 6`, `--candidate-depth 6` CLI flags
- R4. Reviewer decisions gate production items and block depth-6 activation when unresolved
- R5. Accepted alternatives and negative examples are live-marked in the reviewer pack
- R6. Explanations pass semantic lint keyed by validator/rubric type and skill
- R7. Child-facing feedback never displays raw misconception IDs
- R8. Perceived-variety normaliser treats dashes as word boundaries (not glue)
- R9. Depth-6 activation requires all prior gates plus reviewer decisions
- R10. `npm run verify:punctuation-qg:p7` composes all P6+P7 gates
- R11. **Zero regression**: All P6 gates (18 logical) remain green throughout P7 implementation

---

## Scope Boundaries

- No runtime AI question generation
- No new quiz modes or learner UI surfaces
- No depth-8 learner-facing activation
- No change to subject mastery or Star semantics
- Production depth remains at 4 unless all P7 gates pass AND reviewer decisions are populated

### Deferred to Follow-Up Work

- Depth-8 capacity promotion (future P8+)
- Admin panel UI for reviewer decisions (decisions remain JSON fixtures for now)
- Telemetry proof-tested classification upgrade (remains smoke-tested)

---

## Context & Research

### Relevant Code and Patterns

- `shared/punctuation/marking.js:191` — `reportingCommaOk()` unconditionally returns `true` for `'any'`/`'after'`
- `shared/punctuation/marking.js:605` — `evaluateSpeechRubric()` orchestrates all speech facets
- `shared/punctuation/generators.js:215` — `PRODUCTION_DEPTH = 4` (canonical)
- `shared/punctuation/service.js:39` — `GENERATED_ITEMS_PER_FAMILY = 4` (duplicate, drift risk)
- `scripts/review-punctuation-questions.mjs` — current reviewer pack (production-only)
- `scripts/verify-punctuation-qg-p6.mjs` — 9 gates composing 18 logical gates via P5 nesting
- `tests/fixtures/punctuation-reviewer-decisions.json` — empty `{ "decisions": {} }`
- `tests/fixtures/punctuation-duplicate-stem-decisions.json` — empty `{}`
- `tests/punctuation-speech-fairness.test.js` — existing speech fairness tests with `sp_transfer_question`
- `tests/punctuation-explanation-specificity.test.js` — GENERIC_FALLBACK + internal-pattern lint
- `tests/punctuation-perceived-variety.test.js` — same-mode-duplicate CI gate, cross-mode informational

### Institutional Learnings

- **Speech validator fairness** (P6 architecture doc): `reportingPosition: 'any'` must branch comma checks by detected answer shape, not skip them entirely
- **DSL-as-normaliser pattern**: authoring-time expansion, zero runtime change, golden tests travel with templates
- **Composable verification**: each phase chains prior phases as first gate; gates additive, never subtractive
- **Production marker as oracle** (Grammar P8 doc): `markByAnswerSpec()` pattern proves actual learner path, not just string comparison
- **Mode-scoped dedup** (P5 doc): same-mode duplicates always fail CI; cross-mode overlap requires reviewer decision
- **Hash isolation** (P6 doc): new metadata fields must be stripped before identity hash computation

---

## Key Technical Decisions

- **Direction detection in speech validator**: Add a helper that classifies an answer as `reporting-before`, `reporting-after`, `speech-only`, or `invalid` based on quote-pair position relative to non-quoted text. `reportingCommaOk` will dispatch comma checks per detected direction rather than per rubric position.
- **Single canonical depth import**: `service.js` will import `PRODUCTION_DEPTH` from `generators.js` rather than maintaining a separate `GENERATED_ITEMS_PER_FAMILY` constant. A drift test enforces this.
- **Reviewer decisions remain JSON fixtures**: No admin panel or database — decisions live in `tests/fixtures/punctuation-reviewer-decisions.json` with a schema gate. This keeps the review workflow deterministic and CI-enforceable.
- **Semantic explanation lint via rule-id metadata**: Each DSL template carries an `explanationRuleId` that maps to lint rules. Lint checks are test-only (not runtime). The field is stripped before identity hash computation.
- **Variety normaliser dash fix**: Replace `.replace(/[–—]/g, '-')` followed by stripping non-alphanumeric with `.replace(/[–—-]/g, ' ')` to preserve word boundaries.

---

## Open Questions

### Resolved During Planning

- **Q: Where should `detectReportingShape()` live?** In `marking.js` alongside `reportingCommaOk()`. It's called only by speech validation.
- **Q: Should reviewer decisions be per-item or per-cluster?** Both — the schema supports `itemId` and `clusterId` fields with separate decision semantics (per P7-U4 spec).
- **Q: Does the variety normaliser change affect existing passing tests?** The fix makes normalisation less aggressive (preserves word boundaries), so existing assertions that pass will continue passing. New assertions will cover dash-separated words.

### Deferred to Implementation

- Exact `explanationRuleId` values per family (will be discovered during U6 implementation)
- Final reviewer decision counts for the completion report (depends on human review phase)
- Whether depth-6 activation is warranted (depends on all prior gates passing)

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Speech answer marking flow (after P7-U1):

  evaluateSpeechRubric(answer, rubric)
    │
    ├─ findQuotePair(text) → pair
    │
    ├─ detectReportingShape(text, pair)
    │   → 'reporting-before' | 'reporting-after' | 'speech-only' | 'invalid'
    │
    ├─ reportingCommaOk(text, pair, rubric, detectedShape)
    │   ├─ if detectedShape === 'reporting-before': check comma before opening quote
    │   ├─ if detectedShape === 'reporting-after': comma check not applicable
    │   ├─ if rubric.reportingPosition constrains shape: reject disallowed shapes
    │   └─ return result
    │
    └─ (remaining facets unchanged)
```

```
Verification cascade (P7):

  verify:punctuation-qg:p7
    ├─ Gate 1:  verify-punctuation-qg-p6.mjs (18 logical gates)
    ├─ Gate 2:  Direction-aware speech oracle tests
    ├─ Gate 3:  Canonical depth-source drift test
    ├─ Gate 4:  Depth-6 reviewer-pack CLI tests
    ├─ Gate 5:  Reviewer-decision production gate
    ├─ Gate 6:  Accepted-alternative + negative-case reviewer-pack proof
    ├─ Gate 7:  Semantic explanation oracle
    ├─ Gate 8:  Child-facing feedback copy/redaction tests
    ├─ Gate 9:  Perceived-variety second-pass report
    └─ Gate 10: Depth-decision smoke/attestation gate
```

---

## Implementation Units

- U1. **Direction-aware speech oracle**

**Goal:** Fix `reportingCommaOk()` so `reportingPosition: 'any'` rejects reporting-before answers with missing reporting comma while still accepting valid reporting-after answers.

**Requirements:** R1, R11

**Dependencies:** None

**Files:**
- Modify: `shared/punctuation/marking.js`
- Modify: `tests/punctuation-speech-fairness.test.js`
- Create: `tests/punctuation-speech-oracle-hardening.test.js`

**Approach:**
- Add `detectReportingShape(text, pair)` helper that determines answer shape from quote-pair position
- Modify `reportingCommaOk()` to accept a `detectedShape` parameter and only skip comma checks when the answer is genuinely reporting-after
- When `reportingPosition: 'any'` and shape is `reporting-before`, enforce comma-before-opening-quote
- When `reportingPosition: 'before'`, reject reporting-after shapes
- When `reportingPosition: 'after'`, reject reporting-before shapes

**Execution note:** Start with failing negative tests for the exact bug (missing comma under `reportingPosition: 'any'`), then fix the oracle.

**Patterns to follow:**
- Existing facet-based marking pattern in `evaluateSpeechRubric()`
- `makeItem()` helper pattern from `punctuation-speech-fairness.test.js`

**Test scenarios:**
- Happy path: `Mia asked, "Can we start now?"` marks correct under `'any'`
- Happy path: `"Can we start now?" asked Mia.` marks correct under `'any'`
- Error path: `Mia asked "Can we start now?"` (missing comma, reporting-before) marks incorrect under `'any'` — the P7 bug fix
- Error path: Missing comma produces `speech.reporting_comma_missing` misconception tag, not capitalisation
- Edge case: Curly quotes (`"..."`) handled identically to straight quotes
- Edge case: Single quotes (`'...'`) handled identically
- Edge case: `reportingPosition: 'before'` still rejects reporting-after answers
- Edge case: `reportingPosition: 'after'` still rejects reporting-before answers
- Integration: All 25 golden marking families remain green (run golden marking test)
- Integration: Real `sp_transfer_question` item tested with both positive and negative vectors

**Verification:**
- `Mia asked "Can we start now?"` is rejected (was previously accepted — the core bug)
- All existing P6 speech fairness tests pass unchanged
- Golden marking test green for all 25 families

---

- U2. **Canonical production depth source**

**Goal:** Eliminate the production depth drift risk by making `generators.js:PRODUCTION_DEPTH` the single source of truth consumed by all modules.

**Requirements:** R2, R11

**Dependencies:** None

**Files:**
- Modify: `shared/punctuation/service.js`
- Modify: `shared/punctuation/generators.js`
- Create: `tests/punctuation-canonical-depth-source.test.js`

**Approach:**
- Replace `GENERATED_ITEMS_PER_FAMILY = 4` in `service.js` with an import of `PRODUCTION_DEPTH` from `generators.js`
- Add a drift test that imports from both modules and asserts equality, so any future duplication is caught
- Ensure `createPunctuationRuntimeManifest()` and the Worker engine produce identical generated counts
- Document the depth-6 activation path in the test file's comment header

**Patterns to follow:**
- Leaf-manifest pattern from P4 — single-import, drift-test pinned

**Test scenarios:**
- Happy path: `service.js` uses the same depth value as `generators.js`
- Error path: A test fails if a hardcoded production depth is introduced outside `generators.js`
- Integration: `createPunctuationRuntimeManifest()` and Worker runtime produce identical generated counts
- Edge case: Production smoke expected runtime = fixed count + family count × PRODUCTION_DEPTH

**Verification:**
- No hardcoded `4` for generated depth exists outside `generators.js`
- All existing tests pass with the refactored import

---

- U3. **Depth-6 candidate reviewer pack**

**Goal:** Extend `review-punctuation-questions.mjs` to support depth-6 candidate review with `--include-depth-6`, `--depth 6`, and `--candidate-depth 6` CLI flags.

**Requirements:** R3, R5

**Dependencies:** U2

**Files:**
- Modify: `scripts/review-punctuation-questions.mjs`
- Create: `tests/punctuation-reviewer-pack-cli.test.js`

**Approach:**
- Parse new CLI args: `--depth N`, `--include-depth-6`, `--candidate-depth N`
- Build pool at requested depth using `createPunctuationGeneratedItems({ depth: N })`
- Add `productionStatus` field to each item entry: `'production'` | `'candidate-only'`
- Delta view: filter items where `productionStatus === 'candidate-only'`
- Expand each item entry to include all fields specified in P7-U3 (validator summary, misconception tags, readiness, template ID, variant signature, cluster IDs, reviewer decisions)
- Add live marking for accepted alternatives and negative examples (feeds U5)

**Patterns to follow:**
- Existing `buildProductionPool()` and `buildVarietyClusters()` in the review script
- `markingResultSummary()` for consistent formatting

**Test scenarios:**
- Happy path: Default command (no flags) produces exactly 192 items (production pool)
- Happy path: `--include-depth-6` produces exactly 242 items
- Happy path: `--depth 6` produces the depth-6 only generated set (150 items)
- Happy path: `--candidate-depth 6` with `--out` writes JSON file
- Edge case: Delta view shows exactly 50 additional items beyond depth 4
- Edge case: Every item entry includes all required fields (validator summary, explanation, cluster IDs, etc.)
- Integration: Production items are marked `productionStatus: 'production'`, candidates as `'candidate-only'`

**Verification:**
- Running `npm run review:punctuation-questions -- --include-depth-6` produces a 242-item report
- Default command remains unchanged at 192 items
- Report clearly distinguishes production from candidate-only items

---

- U4. **Durable reviewer-decision gate**

**Goal:** Convert empty reviewer-decision fixtures into an enforceable gate that blocks production items with unresolved decisions and blocks depth-6 activation on pending candidate decisions.

**Requirements:** R4, R11

**Dependencies:** U3

**Files:**
- Modify: `tests/fixtures/punctuation-reviewer-decisions.json`
- Create: `shared/punctuation/reviewer-decisions.js`
- Create: `tests/punctuation-reviewer-decision-gate.test.js`

**Approach:**
- Define decision schema: `{ itemId, clusterId?, decision, reviewer, reviewedAt, rationale }`
- Decision enum: `approved`, `acceptable-cross-mode-overlap`, `needs-rewrite`, `needs-marking-fix`, `needs-prompt-tightening`, `retire`, `pending`
- Blocking decisions for production: `needs-rewrite`, `needs-marking-fix`, `needs-prompt-tightening`, `retire`, `pending`
- Add `loadReviewerDecisions()` and `evaluateDecisionGate()` exports
- Production gate: any production item with a blocking decision fails
- Depth-6 gate: any depth-6 candidate with blocking decisions fails depth-6 activation but not current production
- Cluster gate: cross-mode overlap clusters require `acceptable-cross-mode-overlap` with rationale
- Empty `decisions: {}` explicitly fails as "not reviewed" (the P7 invariant)

**Patterns to follow:**
- Existing fixture loading in `punctuation-perceived-variety.test.js`
- Gate pass/fail pattern from verification scripts

**Test scenarios:**
- Happy path: All production items with `approved` decisions pass the production gate
- Error path: A production item with `needs-rewrite` fails the gate
- Error path: A production item with `pending` fails the gate
- Error path: Empty decisions `{}` fails the gate (not treated as approval)
- Edge case: Depth-6 candidate with blocking decision fails depth-6 gate but not production gate
- Edge case: Cross-mode overlap cluster without `acceptable-cross-mode-overlap` decision fails
- Edge case: Same-mode duplicates remain a hard CI failure unless whitelisted with expiry
- Integration: Gate reports exact counts of approved, blocked, rewritten, retired, pending

**Verification:**
- Empty reviewer decisions no longer pass verification
- The fixture schema is validated on load (invalid shape throws)

---

- U5. **Accepted-alternative and negative-case review proof**

**Goal:** Make the reviewer pack show live marking results for every accepted alternative and configured negative example, with blocking verification.

**Requirements:** R5, R11

**Dependencies:** U3

**Files:**
- Modify: `scripts/review-punctuation-questions.mjs`
- Create: `tests/punctuation-alternative-marking-proof.test.js`

**Approach:**
- For each item in the pool, run `markPunctuationAnswer()` against every entry in `item.accepted`
- For choice items, mark every option and assert exactly one marks correct
- For open-transfer items, include configured negative examples from DSL `tests.reject` vectors
- Block verification if any accepted alternative fails marking
- Block verification if any negative example unexpectedly marks correct
- Include results in the reviewer JSON output

**Patterns to follow:**
- `punctuation-fixed-bank-selfmark.test.js` — marks every fixed item's model answer
- `punctuation-golden-marking.test.js` — accept/reject vectors per family

**Test scenarios:**
- Happy path: Every accepted alternative in the production pool marks correct
- Error path: An accepted alternative that fails marking blocks verification
- Error path: A configured negative example that marks correct blocks verification
- Edge case: Choice items verify exactly one option index marks correct
- Integration: Generated DSL families expose their golden accept/reject vectors in the report

**Verification:**
- All 192 production items have their accepted alternatives live-marked
- Any alternative marking failure causes a blocking error

---

- U6. **Semantic explanation oracle**

**Goal:** Strengthen explanation quality from "not generic" to "semantically matched to the exact rule, answer shape, and misconception" via rule-ID-keyed lint.

**Requirements:** R6

**Dependencies:** U2

**Files:**
- Modify: `shared/punctuation/dsl-families/*.js` (add `explanationRuleId` to templates)
- Create: `shared/punctuation/explanation-lint.js`
- Create: `tests/punctuation-semantic-explanation-lint.test.js`

**Approach:**
- Add `explanationRuleId` metadata to each DSL template (e.g., `'speech.inverted-comma-enclosure'`, `'list.oxford-comma'`, `'semicolon.independent-clauses'`)
- Strip `explanationRuleId` before identity hash computation (per P6 learning)
- Create lint rules keyed by `explanationRuleId` that assert the explanation contains expected language for that rule family
- Speech: must mention "inverted comma" or "speech marks" when rule involves them
- Possessive: must distinguish plural vs singular possession
- List-comma: must match item's Oxford-comma policy
- Colon: must mention "complete opening idea" / "introduces" where relevant
- Semicolon: must mention "independent clauses" / "stand alone"
- Keep lint test-only — no runtime cost

**Patterns to follow:**
- Existing `INTERNAL_PATTERNS` in `punctuation-explanation-specificity.test.js`
- Hash isolation pattern from P6 architecture learnings

**Test scenarios:**
- Happy path: All 25 families pass semantic lint at depth 4
- Happy path: All families pass semantic lint at depth 6
- Error path: Generic fallback still blocked at depths 4, 6, 8
- Error path: An explanation that is true but too vague fails lint (e.g., "Use correct punctuation" for a speech item)
- Error path: An explanation that contradicts item policy fails lint (e.g., "Always use the Oxford comma" on a non-Oxford item)
- Integration: Reviewer pack shows `explanationRuleId` and lint result for admin use

**Verification:**
- No template has a missing `explanationRuleId`
- Lint passes for all production items
- Adding a wrong explanation to a template causes the lint test to fail

---

- U7. **Feedback trust and child-facing copy**

**Goal:** Ensure learner feedback is trustworthy and no raw internal IDs surface to children.

**Requirements:** R7, R11

**Dependencies:** U1

**Files:**
- Modify: `tests/punctuation-feedback-redaction.test.js`
- Create: `tests/punctuation-feedback-trust.test.js`

**Approach:**
- Add deterministic assertion for `feedback.body` fallback to explanation (not no-op)
- Add speech feedback tests distinguishing missing inverted commas, missing reporting comma, punctuation outside quotes, changed spoken words, and capitalisation
- Add regex-based tests proving `speech.reporting_comma_missing` and similar dotted IDs are never in learner-visible `feedback.body` or `note` fields
- Verify sibling-retry copy says "similar question" not "replay"
- Verify no new competing primary CTA is added

**Patterns to follow:**
- Existing `punctuation-feedback-redaction.test.js` internal-pattern assertions
- Facet-based misconception tag assertions in `marking.js` tests

**Test scenarios:**
- Happy path: Correct feedback shows rule-specific explanation
- Happy path: Incorrect feedback identifies the specific missing punctuation behaviour
- Error path: Raw ID `speech.reporting_comma_missing` is never visible to children
- Error path: Raw ID `speech.punctuation_outside_quote` is never visible to children
- Edge case: Speech feedback distinguishes all 5 speech failure modes in child-readable copy
- Edge case: `feedback.body` fallback to explanation is tested with a real assertion (not `assert.ok(true)`)
- Integration: All existing P6 feedback redaction tests remain green

**Verification:**
- No dotted misconception ID appears in learner-visible feedback fields
- `feedback.body` fallback test has a meaningful assertion

---

- U8. **Perceived-variety second pass**

**Goal:** Improve variety checks to cover learner-experience-level repetition, fix dash normalisation, and require reviewer decisions for cross-mode clusters.

**Requirements:** R8, R4

**Dependencies:** U4

**Files:**
- Modify: `scripts/review-punctuation-questions.mjs` (fix `normaliseForVariety`)
- Modify: `tests/punctuation-perceived-variety.test.js`
- Create: `tests/punctuation-variety-session-simulation.test.js`

**Approach:**
- Fix `normaliseForVariety`: change `.replace(/[–—]/g, '-')` followed by `[^a-z0-9\s]` strip to `.replace(/[–—-]/g, ' ')` before stripping, preserving word boundaries
- Add grouping dimensions: normalised model answer overlap, same character/topic context, same correction pattern within a skill, repeated explanation within a 12-item session window
- Add mixed-session simulation that draws 12 items from the scheduler and reports same-sentence/context frequency
- Gate cross-mode overlap clusters on reviewer decision (link to U4 decision schema)
- Depth-6 activation requires all candidate-only variety clusters resolved

**Patterns to follow:**
- Existing `buildVarietyClusters()` in the review script
- `normaliseForVariety` existing approach with the fix applied

**Test scenarios:**
- Happy path: Normaliser treats `well-known` as two words: `well known`
- Happy path: Normaliser treats `high—quality` as two words: `high quality`
- Error path: Previous behaviour `wellknown` (glued) no longer occurs
- Edge case: Mixed-session simulation reports frequency of same sentence within 12 items
- Edge case: Same character repeated > 3 times in a skill flags for review
- Integration: Cross-mode clusters without reviewer decision block depth-6 activation
- Integration: Existing same-mode-duplicate CI gate still fails on actual duplicates

**Verification:**
- `normaliseForVariety('well-known phrase')` returns `'well known phrase'` (not `'wellknown phrase'`)
- No new same-mode duplicate clusters introduced
- Depth-6 cannot activate with unresolved variety clusters

---

- U9. **Depth-6 activation gate**

**Goal:** Create the formal gate that allows depth promotion only when all trust evidence is satisfied.

**Requirements:** R9

**Dependencies:** U1, U2, U3, U4, U5, U6, U7, U8

**Files:**
- Create: `shared/punctuation/depth-activation-gate.js`
- Create: `tests/punctuation-depth-activation-gate.test.js`

**Approach:**
- Export `evaluateDepthActivationGate({ targetDepth, decisions, varietyClusters, speechOracleResult, semanticLintResult, runtimeCount })` that returns `{ pass, blockers[] }`
- Required evidence checklist: P7 verification passes, reviewer pack generated, item decisions populated, no blocking decisions, no unresolved clusters, speech oracle hardening passes, semantic lint passes, runtime count updated, release ID changed
- Three outcomes: keep depth 4, raise selected families, raise all families
- Star evidence remains release-scoped — no silent reinterpretation
- The gate itself does not make the depth decision; it reports readiness

**Patterns to follow:**
- P5's attestation pattern (`punctuation-smoke-attestation.test.js`)
- P6's depth decision documentation in the verify script header

**Test scenarios:**
- Happy path: All evidence satisfied → gate passes
- Error path: Missing reviewer decisions → gate fails with specific blocker
- Error path: Unresolved variety cluster → gate fails
- Error path: Speech oracle not passing → gate fails
- Error path: Semantic lint failing → gate fails
- Edge case: Gate output lists exact blockers by item/cluster/family
- Edge case: Depth-8 is never gated as learner-facing (always capacity-only)

**Verification:**
- Gate fails when any single evidence item is missing
- Gate passes only when all evidence is complete
- The gate does not side-effect any production state

---

- U10. **Verification command and completion report**

**Goal:** Create `npm run verify:punctuation-qg:p7` composing all P6+P7 gates, and a completion report template.

**Requirements:** R10, R11

**Dependencies:** U1, U2, U3, U4, U5, U6, U7, U8, U9

**Files:**
- Create: `scripts/verify-punctuation-qg-p7.mjs`
- Create: `docs/plans/james/punctuation/questions-generator/punctuation-qg-p7-completion-report.md`
- Modify: `package.json` (add `verify:punctuation-qg:p7` script)

**Approach:**
- Compose P6 verification (18 logical gates) as Gate 1
- Add 9 P7-specific gates (direction-aware speech, canonical depth, reviewer-pack CLI, reviewer-decision gate, alternative/negative proof, semantic explanation, feedback trust, variety second pass, depth-decision attestation)
- Output clearly distinguishes: top-level gates, composed logical gates, production-only gates, depth-6 candidate gates, warnings and accepted risks
- Completion report template includes all metrics specified in P7-U10 spec

**Patterns to follow:**
- `scripts/verify-punctuation-qg-p6.mjs` — hierarchical gate composition, `execSync` execution, summary table output
- Gate naming convention: sequential numbering continuing from P6

**Test scenarios:**
- Happy path: Command exits 0 when all gates pass
- Error path: Command exits non-zero on any gate failure
- Edge case: P6 gates run first (regression safety before P7 checks)
- Edge case: Summary output distinguishes production-only vs depth-6-candidate gates
- Integration: Completion report accurately reflects gate results

**Verification:**
- `npm run verify:punctuation-qg:p7` is runnable and exits 0 on a fully passing codebase
- Report template has all required fields from P7 spec section 6.10

---

## System-Wide Impact

- **Interaction graph:** Speech oracle change (`marking.js`) is called by `evaluateSpeechRubric()` → `markTransfer()` → `markPunctuationAnswer()` → service/Worker engine → learner runtime. All downstream consumers see the fix.
- **Error propagation:** Reviewer decision gate failures propagate to `verify:punctuation-qg:p7` exit code only — they do not affect learner runtime at production depth 4.
- **State lifecycle risks:** Reviewer decisions are JSON fixtures with no runtime persistence. Star evidence is release-scoped — a depth raise changes the release ID, so old evidence is never reinterpreted.
- **API surface parity:** No external API surfaces change. The speech oracle fix is internal marking logic.
- **Integration coverage:** Speech oracle hardening must be verified against all 25 golden marking families (integration, not just unit).
- **Unchanged invariants:** Production pool remains 192 items unless depth rises. Star semantics unchanged. Mastery calculations unchanged. Telemetry lifecycle status unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Speech oracle fix breaks valid reporting-after acceptance | U1 tests include positive vectors for reporting-after; golden marking gate catches regressions |
| Depth constant refactor breaks service runtime | U2 drift test fails immediately on divergence; existing service tests provide integration coverage |
| Reviewer decisions remain empty (human bottleneck) | Gate explicitly fails on empty decisions — forces human action before depth raise |
| Explanation lint too strict (false positives) | Start with 25 rule IDs matching existing families; tune thresholds per-family in implementation |
| Variety normaliser change creates new clusters | The fix is strictly less aggressive (more boundaries = fewer false-dedup); monitor cluster count |
| Large test surface (est. 100+ new assertions) | Each unit is independently verifiable; compose via hierarchical verification |

---

## Sources & References

- **Origin document:** [punctuation-qg-p7.md](docs/plans/james/punctuation/questions-generator/punctuation-qg-p7.md)
- Related code: `shared/punctuation/marking.js`, `shared/punctuation/generators.js`, `shared/punctuation/service.js`
- Prior phase: `scripts/verify-punctuation-qg-p6.mjs` (18-gate composition)
- Architecture learnings: `docs/solutions/architecture-patterns/punctuation-qg-p6-production-quality-acceptance-architecture-2026-04-29.md`
- DSL pattern: `docs/solutions/architecture-patterns/punctuation-qg-p3-dsl-authoring-time-normaliser-2026-04-28.md`
