---
title: "feat: Punctuation QG P8 — Production QA, Preservation Oracles, and Human Acceptance"
type: feat
status: active
date: 2026-04-29
origin: docs/plans/james/punctuation/questions-generator/punctuation-qg-p8.md
---

# feat: Punctuation QG P8 — Production QA, Preservation Oracles, and Human Acceptance

## Overview

P8 transforms the Punctuation question-generator from "mechanically correct" to "production-certified." Rather than expanding the pool or adding families, P8 asks: are the actual questions children will see logical, fair, tightly marked, and useful when wrong?

The phase introduces closed-item preservation oracles, speech reporting-clause enforcement, meaningful transfer gates, fixed-bank negative vectors, a reviewer QA cockpit, human acceptance execution, and feedback trust improvements — all without regression to the existing 192-item production pool.

---

## Problem Frame

P1–P7 completed the engineering build-out: DSL families exist, generation is stable, marking is direction-aware, explanations are annotated, and depth-6 is gated behind reviewer evidence. However, validation shows that:

1. Closed questions can accept content changes (extra tails, changed words) that violate the "only fix punctuation" contract.
2. Speech items with supplied reporting clauses accept alternative clauses or speech-only answers.
3. Transfer validators accept token-only fragments that are technically correct but poor English.
4. Fixed items lack per-item negative vectors in the reviewer pack.
5. The reviewer pack is not yet a complete human QA cockpit.

The best P8 outcome is production depth 4 genuinely certified — not depth 6 prematurely activated.

---

## Requirements Trace

- R1. Every closed item must reject content changes beyond punctuation/capitalisation
- R2. Speech marking must preserve required reporting clauses when the prompt supplies one
- R3. Transfer validators must reject token-only fragments that are not meaningful sentences
- R4. Every fixed open item must have at least two negative vectors proven through production marking
- R5. Reviewer pack must become an operational QA cockpit with v2 schema, stable cluster IDs, choice rendering, and filter flags
- R6. All 192 production items must carry explicit human reviewer decisions (no item may remain pending/missing)
- R7. Fixed and generated explanations must pass semantic lint and match item policy
- R8. Child-facing feedback must distinguish specific failure modes (content change, reporting clause, fragment)
- R9. Depth-6 activation requires full production QA + all 50 candidate items reviewed
- R10. `npm run verify:punctuation-qg:p8` must compose all new gates additively on P7's 27 gates

---

## Scope Boundaries

- No runtime AI question generation
- No new generator families
- No depth increase without full human QA evidence
- No cosmetic UI redesign — only feedback trust improvements
- No change to star evidence continuity or identity hashing

### Deferred to Follow-Up Work

- Depth-6 activation (separate PR after all candidate decisions populated)
- Depth-8 is capacity-only and never learner-facing
- Broad grammar parsing for transfer validation (use item-specific rules instead)

---

## Context & Research

### Relevant Code and Patterns

- `shared/punctuation/marking.js` — main marking oracle; `evaluateSpeechRubric()`, `wordSequencePreserved()`, `requiredTokenCoverage()`, `completeEnoughSentence()`
- `shared/punctuation/generators.js` — `PRODUCTION_DEPTH=4`, `CAPACITY_DEPTH=8`, `buildGeneratedItem()`
- `shared/punctuation/content.js` — 92 fixed items (`PUNCTUATION_ITEMS`), 25 families (`PUNCTUATION_GENERATOR_FAMILIES`)
- `shared/punctuation/reviewer-decisions.js` — schema validation, `evaluateProductionGate()`, `evaluateDepth6Gate()`, `evaluateClusterGate()`
- `shared/punctuation/depth-activation-gate.js` — 9 evidence checks for depth promotion
- `shared/punctuation/template-dsl.js` — DSL validation with hash-isolation for metadata
- `shared/punctuation/dsl-families/*.js` — 25 template files with `definePunctuationTemplate()` DSL
- `scripts/verify-punctuation-qg-p7.mjs` — 27 logical gates across 10 top-level gates
- `scripts/review-punctuation-questions.mjs` — reviewer pack CLI with depth/candidate flags
- `scripts/audit-punctuation-content.mjs` — strict/capacity content audits

### Institutional Learnings

- **Direction-aware validation** (P7): Detect concrete shape first (`reporting-before`, `reporting-after`, `speech-only`), then dispatch rules. P8's reporting-clause enforcement builds on `detectReportingShape()`.
- **Empty-fails invariant** (P7): Empty decisions fail the gate. P8 must maintain this for all new reviewer fields.
- **Hash isolation** (P6/P7): New metadata fields (preservation flags, negative vectors) must be stripped before `variantSignature` computation. Follow `explanationRuleId` pattern.
- **Production marker as test oracle** (Grammar P8): Run items through `markPunctuationAnswer()` itself to prove correctness/rejection rather than relying on string comparison.
- **Evidence-locked certification** (Grammar P9): Certification is a derivable property of committed artefacts. P8's reviewer decisions must be machine-verifiable, not prose assertions.
- **DSL-as-normaliser** (P3): Negative vectors should be authored as `tests.reject` cases inline with DSL templates — they travel with the template and are tested atomically.

---

## Key Technical Decisions

- **Preservation as a marking-layer contract, not item metadata-only**: The preservation oracle lives in `marking.js` as a new `evaluatePreservation()` function rather than only as static metadata. This means the production marking engine itself rejects content changes — not just a test-time assertion.
- **Reporting-clause enforcement as a new speech facet**: Add `reporting_clause_words` as a distinct facet from `reporting_clause` (comma placement). This preserves the existing comma-direction fix while adding word-level enforcement.
- **Meaningful-sentence gate via minimum-word + subject-verb heuristic**: Not a grammar parser. Use `wordCount >= 5` (configurable per item) plus a light check that the answer contains at least one word outside the required tokens. Item-specific overrides via `minMeaningfulWords` in validator.
- **Negative vectors as a fixture JSON file**: `tests/fixtures/punctuation-negative-vectors.json` — separate from content.js to keep the fixed bank clean and allow independent negative-vector CI without modifying content hashes.
- **Stable cluster IDs via content hash, not array index**: Migrate cluster identification from positional indexing to normalised-content hashing for deterministic cross-session stability.
- **Reviewer pack v3 extends v2 (additive, not breaking)**: New fields and filter flags added to the existing CLI. No schema-version bump needed since v2 schema already supports `itemDecisions`/`clusterDecisions`.

---

## Open Questions

### Resolved During Planning

- **Should preservation metadata live on items or in marking logic?** Both — items carry `preserveTokens`/`allowExtraTail` declarations, and `marking.js` enforces them. This gives reviewers visibility AND production enforcement.
- **Should negative vectors be inline in DSL or separate fixture?** Separate fixture (`tests/fixtures/punctuation-negative-vectors.json`) for fixed items; DSL templates carry their own `tests.reject` arrays. Two surfaces, one verification command.
- **How should meaningfulness be checked without a grammar parser?** Word count threshold + "at least one non-required word" heuristic. This catches `Can't we're.` (2 words, both required) without needing NLP.

### Deferred to Implementation

- Exact word-count threshold per item (likely 5 for most, possibly 4 for short prompts)
- Whether `speech-only` shape should be accepted when the prompt has no explicit reporting clause but a contextual one
- Precise normalised-content hash algorithm for cluster ID migration (likely SHA-256 of sorted member IDs)
- Full list of items where model intentionally differs from stem words (e.g. `dc_fix_signal_team` removes "and") — characterisation pass will surface these

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TD
    subgraph "Marking Pipeline (marking.js)"
        A[markPunctuationAnswer] --> B{item.mode}
        B -->|insert/fix/combine| C[evaluatePreservation]
        B -->|transfer| D[evaluateMeaningfulness]
        B -->|speech+reportingClause| E[evaluateReportingClauseWords]
        C --> F[Existing mode handler]
        D --> F
        E --> F
        F --> G[Return result with facets]
    end

    subgraph "Verification Chain"
        H[verify:p8] --> I[verify:p7 (27 gates)]
        H --> J[Preservation oracle tests]
        H --> K[Reporting-clause tests]
        H --> L[Meaningful-transfer tests]
        H --> M[Negative-vector fixture tests]
        H --> N[Reviewer pack v3 schema tests]
        H --> O[Explanation semantic lint]
        H --> P[Production human QA gate]
        H --> Q[Feedback trust tests]
    end
```

---

## Implementation Units

- U1. **Closed-item preservation oracle**

**Goal:** Make all `insert`, `fix`, and `combine` items reject content changes beyond punctuation/capitalisation.

**Requirements:** R1, R10

**Dependencies:** None

**Files:**
- Modify: `shared/punctuation/marking.js`
- Modify: `shared/punctuation/content.js` (add `preserveTokens` to fixed items)
- Modify: `shared/punctuation/template-dsl.js` (generate `preserveTokens` from DSL stems)
- Create: `tests/punctuation-preservation-oracle.test.js`

**Approach:**
- Add `evaluatePreservation(answer, item)` function in `marking.js` that:
  - Derives expected tokens from `item.stem` (strip punctuation → word list) when `item.preserveTokens` is absent
  - Uses `wordSequencePreserved()` to check all expected words appear in order
  - Rejects answers with word count significantly exceeding expected (catches extra tails)
  - Returns `{ preserved: boolean, extraWords: string[], missingWords: string[] }`
- **Scope:** Only apply to validator-based items and generated DSL items. Items going through `markExact()` (31 of 37 insert/fix items) already reject all non-accepted answers via exact string comparison — preservation adds no value there. The live bug exists in the ~12 validator-based closed items (e.g. `lc_insert_supplies`, `pa_fix_author`) and all generated items.
- Call `evaluatePreservation()` early in mode handlers for validator-based `insert`, `fix`, `combine` — if preservation fails, mark incorrect with specific facet
- Add explicit `preserveTokens` arrays to items where stem-derivation would be incorrect (e.g. `dc_fix_signal_team` where the model intentionally removes "and" from the stem). The characterisation test must prove the MODEL ANSWER passes preservation before the gate is committed.
- For generated DSL items: derive `preserveTokens` automatically from the template `stem` field at build time via `template-dsl.js`
- Default `allowExtraTail: false` for closed modes; `allowExtraTail: true` only for transfer/paragraph
- Add new facet label: `content_preservation: 'Original words preserved'`

**Execution note:** Start with characterisation tests that prove current marking behaviour, then add preservation layer and verify regressions are caught.

**Patterns to follow:**
- `wordSequencePreserved()` existing implementation in `marking.js`
- `explanationRuleId` hash-isolation pattern from P7

**Test scenarios:**
- Happy path: `lc_insert_supplies` with correct punctuation only (`We needed pencils, rulers and glue.`) → passes
- Happy path: `pa_fix_author` with commas added only → passes
- Edge case: Answer with different capitalisation but same words → passes (punctuation/case variation allowed)
- Error path: `lc_insert_supplies` + `in the cupboard` tail → fails with `content_preservation` facet
- Error path: `lc_fix_display` + extra words → fails
- Error path: `pa_insert_museum` + arbitrary tail → fails
- Error path: Generated list-comma item with extra sentence appended → fails
- Integration: Transfer items remain flexible (no preservation enforcement applied)

**Verification:**
- All 5 specific regression rejects from P8 requirements fail marking
- All existing accepted answers for fixed closed items still pass
- Generated closed items derive preservation tokens at build time

---

- U2. **Speech reporting-clause word enforcement**

**Goal:** Ensure speech items with a supplied `reportingClause` reject answers that change or omit the required clause words.

**Requirements:** R2, R10

**Dependencies:** U1 (preservation infrastructure concepts reused)

**Files:**
- Modify: `shared/punctuation/marking.js`
- Modify: `shared/punctuation/content.js` (add `reportingClause` to fixed speech items lacking it)
- Create: `tests/punctuation-reporting-clause-enforcement.test.js`

**Approach:**
- Add a `reporting_clause_words` facet distinct from `reporting_clause` (which covers comma placement)
- In `evaluateSpeechRubric()`: when `rubric.reportingClause` is supplied AND the item mode is `insert`/`fix` (not transfer), enforce that the answer's reporting clause matches the required words (case-insensitive, punctuation-insensitive)
- Use `detectReportingShape()` to locate the clause text, then compare against `rubric.reportingClause`
- For `reportingPosition: 'any'` items with a supplied clause: enforce the clause words regardless of position
- For items WITHOUT a supplied `reportingClause`: no word enforcement (preserve P7 flexibility)
- Speech-only answers (no reporting clause at all) are rejected when the prompt supplies one, UNLESS the item explicitly sets `allowSpeechOnly: true`

**Execution note:** Characterise existing speech marking before modifying — the P7 direction-aware fix is load-bearing.

**Patterns to follow:**
- `detectReportingShape()` from P7's speech oracle hardening
- `includesWords()` for flexible word matching
- Facet pattern: `facet('reporting_clause_words', clauseWordsOk)`

**Test scenarios:**
- Happy path: `sp_insert_question` with `Ella asked, "Can we start now?"` → passes
- Happy path: `sp_fix_question` with `"Where are we meeting?" asked Zara.` → passes
- Error path: `sp_insert_question` with `Tom shouted, "Can we start now?"` → fails (changed clause)
- Error path: `sp_fix_question` with `"Where are we meeting?"` alone → fails (no clause)
- Error path: `sp_fix_question` with `"Where are we meeting?" asked Mia.` → fails (wrong name)
- Error path: `sp_fix_question` with `"Where are we meeting?" yelled Tom.` → fails (wrong verb + name)
- Edge case: Broad transfer speech item without supplied clause → still accepts child-created clauses
- Integration: P7 comma-direction tests still pass (direction-aware logic untouched)

**Verification:**
- All 4 specific regression rejects from P8 requirements fail marking
- P7 speech oracle hardening test suite still passes (zero regression)
- Broad speech items remain flexible

---

- U3. **Meaningful transfer-sentence gate**

**Goal:** Reject token-only fragments for transfer items while keeping legitimate child variation.

**Requirements:** R3, R10

**Dependencies:** None (parallel with U1/U2)

**Files:**
- Modify: `shared/punctuation/marking.js`
- Create: `tests/punctuation-meaningful-transfer.test.js`

**Approach:**
- Add `evaluateMeaningfulness(text, validator, item)` function that checks:
  - Word count meets `validator.minMeaningfulWords || 5`
  - At least one word in the answer is NOT in the required token set (proves context beyond tokens)
  - Answer is not merely the required tokens concatenated with a full stop
- Call from `markTransfer()` when `validator.requiresTokens` is present and mode is not `paragraph`
- Add new facet: `sentence_completeness: 'Complete sentence'` (reuse existing label)
- Return specific feedback: "Include your punctuated forms in a complete sentence" rather than generic pass
- Item-specific override: `validator.minMeaningfulWords` allows short-prompt items to reduce threshold

**Patterns to follow:**
- `completeEnoughSentence()` existing pattern with `minimumWordCount()`
- `requiredTokenCoverage()` for identifying which words are "required"

**Test scenarios:**
- Happy path: `ac_transfer_contractions` with `We can't go because we're too tired.` → passes
- Happy path: `ap_transfer_possession` with `The children's coats were on the teachers' hooks.` → passes
- Error path: `ac_transfer_contractions` with `Can't we're.` → fails (2 words, both required tokens)
- Error path: `ap_transfer_possession` with `The children's teachers'.` → fails (only required tokens + possessive)
- Edge case: Answer exactly at threshold (5 words including required) → passes
- Edge case: Answer with 4 words but includes context beyond tokens → edge decision (implementation time)
- Error path: Only required tokens + full stop → fails with `sentence_completeness` facet

**Verification:**
- Both specific regression rejects from P8 requirements fail marking
- Existing good transfer answers in accepted-alternative proof still pass
- No false negatives on the 100 generated transfer items at depth 4

---

- U4. **Fixed-bank negative vector pack**

**Goal:** Create a durable negative-example fixture for every fixed open item, proven through production marking.

**Requirements:** R4, R10

**Dependencies:** U1, U2, U3 (preservation/speech/transfer enforcement must exist for vectors to fail correctly)

**Files:**
- Create: `tests/fixtures/punctuation-negative-vectors.json`
- Create: `tests/punctuation-negative-vectors.test.js`

**Approach:**
- JSON fixture with structure: `{ "vectors": [{ "itemId": "...", "answer": "...", "expectedResult": "fail", "failureType": "..." }] }`
- For each of the 72 fixed non-choice items (92 total minus 20 choose-mode), include at least 2 negative vectors covering:
  - Missing target punctuation
  - Wrong punctuation position
  - Changed required words (for closed items, leveraging U1)
  - Arbitrary extra words (for closed items)
  - Wrong reporting clause (for speech closed items, leveraging U2)
  - Token-only fragment (for transfer items, leveraging U3)
- Test file runs each vector through `markPunctuationAnswer()` and asserts `correct: false`
- Separate from content.js to preserve identity hash stability
- Choice items: assert all options marked with exactly one correct — separate from open-item vectors

**Patterns to follow:**
- Grammar P8 "production marker as test oracle" — use `markPunctuationAnswer()` directly
- `tests/punctuation-alternative-marking-proof.test.js` existing positive-case pattern (invert for negatives)

**Test scenarios:**
- Happy path: Every negative vector marks incorrect through production marking
- Happy path: Model answers for same items still mark correct (regression check)
- Error path: A vector that accidentally marks correct → test failure surfaces the defect
- Integration: Fixture loads cleanly and covers all 92 fixed non-choice items
- Edge case: Choice items have all-options coverage with exactly one correct index

**Verification:**
- `npm run verify:punctuation-qg:p8` fails if any negative vector marks correct
- Every fixed non-choice item (72 items) has >= 2 vectors
- Every fixed choice item has all options validated
- Fixture is shown in reviewer pack (U5 dependency)

---

- U5. **Reviewer pack v3 and decision-schema alignment**

**Goal:** Upgrade `review:punctuation-questions` from a report to an operational QA cockpit.

**Requirements:** R5, R6, R10

**Dependencies:** U4 (negative vectors displayed in pack)

**Files:**
- Modify: `scripts/review-punctuation-questions.mjs`
- Modify: `shared/punctuation/reviewer-decisions.js`
- Create: `tests/punctuation-reviewer-pack-v3.test.js`

**Approach:**
- Extend reviewer pack output to show:
  - Choice options and correct index for choice items
  - Fixed negative examples with their live marking result (from U4 fixture)
  - Preservation contract summary per closed item
  - Semantic explanation lint result per item
- Read decisions from `itemDecisions`/`clusterDecisions` v2 schema exclusively; remove legacy `decisions` object fallback from rendering logic (keep in loader for backward compat)
- Generate stable cluster IDs from normalised content hash (sorted member item IDs → SHA-256 prefix) instead of array index
- Add `reviewStatus`, `reviewer`, `reviewedAt`, `rationale` display per item and cluster
- Add CLI flags: `--only-blocked`, `--only-candidates`, `--only-unreviewed`, `--summary`
- `--summary` outputs counts by decision state without per-item detail

**Patterns to follow:**
- Existing `review-punctuation-questions.mjs` CLI structure with flags
- `evaluateProductionGate()` decision map pattern

**Test scenarios:**
- Happy path: Default production pack covers 192 items
- Happy path: `--include-depth-6` covers 242 items
- Happy path: `--candidate-depth 6` covers 50 candidate-only items
- Happy path: `--summary` outputs decision state counts
- Edge case: `--only-unreviewed` with empty decisions → shows all 192
- Edge case: `--only-blocked` with no blocking decisions → empty output
- Integration: Stable cluster IDs are deterministic across runs (no index-dependency)

**Verification:**
- Reviewer pack renders without error for all modes
- Stable cluster IDs are consistent between consecutive runs
- Decision display matches fixture data exactly
- New flags filter correctly

---

- U6. **Human production QA execution gate**

**Goal:** Establish machine-enforced gate that production release requires all 192 items to carry explicit reviewer decisions.

**Requirements:** R6, R9, R10

**Dependencies:** U5 (reviewer pack must be operational for humans to use)

**Files:**
- Modify: `shared/punctuation/reviewer-decisions.js` (strengthen gate logic)
- Modify: `fixtures/punctuation-reviewer-decisions.json` (populate with real decisions)
- Create: `tests/punctuation-production-qa-gate.test.js`

**Approach:**
- Gate logic additions to `evaluateProductionGate()`:
  - Reject auto-generated identical rationales across all entries (evidence-locked certification pattern)
  - Require every cross-mode overlap cluster has decision with rationale
  - Require every repeated-explanation cluster has decision
- The fixture file is populated by the human reviewer using the pack from U5
- Gate enforcement: `npm run verify:punctuation-qg:p8` includes the production QA gate — if decisions are empty or incomplete, the gate fails
- Decision population is the human task; the gate is the machine enforcement

**Execution note:** The test asserts the gate LOGIC is correct (passes with valid data, fails with invalid data). The actual decision population is a human workflow.

**Patterns to follow:**
- P7 empty-fails invariant
- Evidence-locked certification: identical-note rejection

**Test scenarios:**
- Happy path: All 192 items with valid decisions → gate passes
- Error path: Empty `itemDecisions` → gate fails (P7 invariant)
- Error path: One item with `pending` decision → gate fails
- Error path: One item missing entirely → gate fails
- Error path: All rationales identical string → gate fails (auto-gen rejection)
- Edge case: Mix of `approved` and `acceptable-cross-mode-overlap` → passes
- Integration: Cluster gate requires rationale for cross-mode overlap decisions

**Verification:**
- Gate passes only when every production item has a non-blocking decision
- Auto-generated identical rationales are rejected
- Cluster decisions are required for all cross-mode clusters

---

- U7. **Fixed and generated explanation QA**

**Goal:** Ensure every explanation is child-readable, rule-specific, and matches item policy.

**Requirements:** R7, R10

**Dependencies:** None (parallel)

**Files:**
- Modify: `shared/punctuation/content.js` (fix any explanation that fails lint)
- Modify: `shared/punctuation/dsl-families/*.js` (fix generated explanations)
- Create: `tests/punctuation-explanation-qa.test.js`

**Approach:**
- Extend existing semantic explanation lint (P7's `explanationRuleId` pattern) to:
  - Verify fixed item explanations reference the correct rule
  - Verify no explanation says a flexible policy (e.g. Oxford comma) is mandatory unless the item makes it mandatory
  - Verify explanations for depths 4, 6, and 8 all pass the same lint
  - Verify explanations help AFTER an incorrect answer (not merely describe the correct one)
- Add lint rule: explanation must not contain internal IDs, validator names, or implementation jargon
- Attach rule-IDs to any fixed items currently lacking them

**Patterns to follow:**
- P7 semantic explanation lint (`explanationRuleId` metadata, stripped from hash)
- P6 explanation-as-constant pattern

**Test scenarios:**
- Happy path: All 92 fixed item explanations pass lint
- Happy path: All depth-4 generated explanations pass lint
- Happy path: Depth-6 and depth-8 explanations also pass
- Error path: Explanation containing `validator.type` → lint failure
- Error path: Explanation claiming Oxford comma is mandatory when item allows both → lint failure
- Edge case: Explanation for possession correctly distinguishes singular vs plural
- Integration: Lint results visible in reviewer pack (U5 renders them)

**Verification:**
- Zero lint failures across all production and capacity items
- No explanation contains internal identifiers
- Explanations match item policy (Oxford comma, reporting position, possession type)

---

- U8. **Feedback and UI trust support**

**Goal:** Make child-facing feedback distinguish specific failure modes rather than generic messages.

**Requirements:** R8, R10

**Dependencies:** U1, U2, U3 (preservation/speech/transfer facets must exist)

**Files:**
- Modify: `shared/punctuation/marking.js` (feedback note generation)
- Modify: `worker/src/subjects/punctuation/engine.js` (if feedback rendering lives here)
- Create: `tests/punctuation-feedback-specificity.test.js`

**Approach:**
- For closed items with preservation failure: feedback says "You changed the sentence — only add/fix the punctuation"
- For speech items with reporting-clause failure: feedback distinguishes:
  - Missing inverted commas
  - Punctuation outside speech marks
  - Missing reporting comma
  - Changed/missing reporting clause (new from U2)
  - Changed spoken words
- For transfer items with meaningfulness failure: "Include your punctuated forms in a complete sentence"
- All feedback uses child-readable language — no validator names, no dotted IDs
- Feedback is generated from facet results, not hardcoded strings per item

**Patterns to follow:**
- Existing `note` generation in `markTransfer()` and `markSpeech()` handlers
- P7 feedback trust tests (`tests/punctuation-feedback-trust.test.js`)

**Test scenarios:**
- Happy path: Correct answer → positive feedback mentioning what was done well
- Error path: Closed item with extra words → "only add/fix the punctuation" feedback
- Error path: Speech item with changed clause → "keep the reporting clause" feedback
- Error path: Transfer item with fragment → "write a complete sentence" feedback
- Edge case: Multiple failures → most important failure shown first
- Integration: No raw validator names or internal IDs surface in any feedback string

**Verification:**
- Feedback strings are actionable and child-readable
- P7 feedback trust test suite still passes (additive, not breaking)
- New failure modes produce distinct, helpful messages

---

- U9. **Depth-6 quality-readiness gate**

**Goal:** Ensure depth-6 cannot activate unless full production QA AND candidate QA both pass.

**Requirements:** R9, R10

**Dependencies:** U4, U5, U6 (negative vectors, reviewer pack, and human QA gate)

**Files:**
- Modify: `shared/punctuation/depth-activation-gate.js`
- Create: `tests/punctuation-depth6-readiness-p8.test.js`

**Approach:**
- Add new evidence checks to the depth-6 activation gate:
  - `preservation-oracle-pass`: All closed items pass preservation tests
  - `negative-vectors-pass`: All fixed-bank negative vectors fail marking correctly
  - `transfer-meaningfulness-pass`: No transfer item accepts fragments
  - `candidate-decisions-populated`: All 50 depth-6 candidates have decisions
- Gate outcome remains `keep-depth-4` until all checks pass
- If depth-6 activation is attempted without full evidence, gate returns blocking explanation
- Release ID would change to `punctuation-r5-qg-depth-6` only on activation
- Production smoke expected runtime updates to 242 on activation

**Patterns to follow:**
- Existing 9-check structure in `depth-activation-gate.js`
- Pure-function gate pattern (no side effects)

**Test scenarios:**
- Happy path: All evidence present → `raise-all-to-6` outcome
- Error path: Empty candidate decisions → `keep-depth-4`
- Error path: One candidate with `needs-rewrite` → `keep-depth-4`
- Error path: Preservation tests not passing → `keep-depth-4`
- Edge case: Production fully approved but candidates not reviewed → `keep-depth-4`
- Integration: Existing 9 checks still evaluated (additive, not replacing)

**Verification:**
- Gate cannot return `raise-all-to-6` without full evidence
- Current state (no candidate decisions) correctly returns `keep-depth-4`
- All new checks are evaluated as pure functions

---

- U10. **P8 verification command and completion report**

**Goal:** Single command that composes ALL P7 + P8 gates for a reliable pass/fail answer.

**Requirements:** R10

**Dependencies:** U1–U9 (all gates must exist)

**Files:**
- Create: `scripts/verify-punctuation-qg-p8.mjs`
- Create: `docs/plans/james/punctuation/questions-generator/punctuation-qg-p8-completion-report.md`

**Approach:**
- Gate layout (P7's 27 gates + P8-specific):
  1. P7 verification gates (27 logical) [PRODUCTION]
  2. Closed-item preservation oracle tests [PRODUCTION]
  3. Speech reporting-clause enforcement tests [PRODUCTION]
  4. Meaningful transfer-sentence tests [PRODUCTION]
  5. Fixed-bank negative vector tests [PRODUCTION]
  6. Reviewer pack v3 schema tests [PRODUCTION]
  7. Fixed explanation semantic lint [PRODUCTION]
  8. Production human QA gate [PRODUCTION]
  9. Candidate-depth QA gate [DEPTH-6-CANDIDATE]
  10. Feedback specificity tests [PRODUCTION]
- Total logical gates: 27 (P7) + 9 (P8) = 36 minimum
- Completion report documents exact counts per P8 requirements

**Patterns to follow:**
- `scripts/verify-punctuation-qg-p7.mjs` cascade structure
- Gate classification labels: `[PRODUCTION]` / `[DEPTH-6-CANDIDATE]`

**Test scenarios:**
- Happy path: All gates pass → clean exit with summary
- Error path: Any single gate fails → non-zero exit code with gate name
- Integration: P7 gates run first (cascade order preserved)

**Verification:**
- `npm run verify:punctuation-qg:p8` exits 0 when all gates pass
- Script chains P7 as first gate (monotonic growth)
- Completion report includes all counts specified in requirements

---

## System-Wide Impact

- **Interaction graph:** `marking.js` is the shared marking oracle used by worker engine, reviewer pack CLI, audit scripts, and all test suites. Changes to marking logic affect all consumers simultaneously — this is by design (single source of truth).
- **Error propagation:** Preservation/transfer/reporting failures propagate through the existing facet system. New facets integrate into the same `{ correct, facets, misconceptionTags, note }` return shape.
- **State lifecycle risks:** Reviewer decisions fixture is the only mutable state. Concurrent edits to the JSON fixture could conflict — mitigated by single-reviewer-at-a-time workflow.
- **API surface parity:** The worker engine's `markPunctuationAnswer()` call site does not change signature. All new behaviour is internal to the marking oracle based on item metadata.
- **Integration coverage:** Negative vectors running through the full marking pipeline prove that preservation/speech/transfer enforcement works end-to-end, not just in isolation.
- **Unchanged invariants:** Star evidence hash computation, item identity hashing, DSL variant signature generation, production depth value (remains 4), and the 92-item fixed bank structure are all unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Preservation oracle rejects currently-accepted valid answers | Characterisation tests before adding preservation; run all existing accepted-alternative proofs after |
| Speech reporting-clause over-constrains broad transfer items | Only enforce when item explicitly supplies `reportingClause` AND mode is closed |
| Meaningful-transfer gate produces false negatives | Item-specific `minMeaningfulWords` override; existing accepted answers as regression suite |
| Negative vector fixture becomes maintenance burden | Fixture is additive-only; vectors are stable because they test fixed content |
| Reviewer pack performance with 242 items | Pack already handles this count; new fields are metadata, not computation |
| Node version dependency (import.meta.dirname) | Ensure `.nvmrc` enforces Node 22; add early version check in verify script |

---

## Sources & References

- **Origin document:** [docs/plans/james/punctuation/questions-generator/punctuation-qg-p8.md](docs/plans/james/punctuation/questions-generator/punctuation-qg-p8.md)
- Related architecture: `docs/solutions/architecture-patterns/punctuation-qg-p7-production-trust-hardening-2026-04-29.md`
- Related architecture: `docs/solutions/architecture-patterns/punctuation-qg-p6-production-quality-acceptance-architecture-2026-04-29.md`
- Related architecture: `docs/solutions/architecture-patterns/evidence-locked-production-certification-2026-04-29.md`
- Related pattern: `docs/solutions/architecture-patterns/grammar-qg-p8-production-marker-as-test-oracle-2026-04-29.md`
- P7 PRs: #623, #625, #636, #640, #641, #644, #645, #646, #647, #648
