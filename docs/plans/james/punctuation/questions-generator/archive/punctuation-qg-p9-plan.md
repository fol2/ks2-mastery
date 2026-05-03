---
title: "feat: Punctuation QG P9 — Productionisation Truth Gate, Closed-Item Lockdown, and Release Evidence"
type: feat
status: active
date: 2026-04-30
origin: docs/plans/james/punctuation/questions-generator/punctuation-qg-p9.md
---

# Punctuation QG P9 — Productionisation Truth Gate

## Overview

P9 closes six production-blocking gaps left by P8: the `expectedCount + 2` word-tolerance leak that allows short extra words in closed items, speech rubric bypassing closed preservation, misaligned reviewer cluster IDs, ambiguous review-authority wording, verifier reproducibility issues, and stale report counts. This is not a feature expansion — it is the production truth gate that makes the depth-4 certification defensible.

---

## Problem Frame

Closed punctuation items (insert/fix/combine) ask the learner to fix or add punctuation while preserving the sentence. The current preservation oracle allows answers up to 2 words longer than expected, which means short additions like "today" or "in class" pass incorrectly. Speech items have the same leak after the reporting clause. Additionally, the reviewer fixture's cluster IDs don't match what `buildVarietyClusters()` actually produces, making the cluster gate effectively unreviewed.

(see origin: docs/plans/james/punctuation/questions-generator/punctuation-qg-p9.md)

---

## Requirements Trace

- R1. Every closed insert/fix/combine item rejects added lexical material (Gap 1)
- R2. Closed speech items reject extra words outside reporting clause + quoted speech (Gap 2)
- R3. Generated closed items have the same lockdown as fixed items (Gap 3)
- R4. Reviewer cluster decisions align with actual `buildVarietyClusters()` output (Gap 4)
- R5. AI pre-review and human acceptance are separately labelled (Gap 5)
- R6. Verifier exits cleanly under Node 22, streams progress, no hidden handles (Gap 6)
- R7. Report counts match source of truth (Gap 7)
- R8. `npm run verify:punctuation-qg:p9` exits 0 with all 11 gates passing
- R9. Depth 6 remains blocked; production depth stays at 4
- R10. Live production certification not claimed without deployment evidence

---

## Scope Boundaries

- Depth 6 activation is NOT in scope — it remains blocked
- No new punctuation skills or templates are added
- No changes to the generated item DSL beyond adding rejection examples
- `allowLexicalChange: true` escape hatch exists but must remain item-level and rare

### Deferred to Follow-Up Work

- Depth-6 candidate review and activation: P10
- Live production smoke artefact: requires deployment environment
- Human product-owner sign-off: DEFERRED: requires human — a named human must review and approve the 192-item fixture for `human_acceptance.status` to change from `not_started`

---

## Context & Research

### Relevant Code and Patterns

- `shared/punctuation/marking.js` — main marking entry point (`markPunctuationAnswer` line 1660), preservation logic (`evaluatePreservation` line 291), speech rubric (`evaluateSpeechRubric` line 887), facet helper (line 154), feedback priority (`speechFailureNote` line 38)
- `shared/punctuation/reviewer-decisions.js` — `generateStableClusterId()` (line 21), `evaluateProductionGate()` (line 216), `evaluateClusterGate()` (line 326)
- `scripts/review-punctuation-questions.mjs` — `buildVarietyClusters()` (line 358)
- `scripts/verify-punctuation-qg-p8.mjs` — current verifier with 37 logical gates
- `tests/fixtures/punctuation-reviewer-decisions.json` — schema v2, 192 item decisions
- `tests/fixtures/punctuation-negative-vectors.json` — 144 vectors, schema v1

### Institutional Learnings

- P8 established the preservation oracle pattern but with `+2` tolerance (the leak)
- The `facet()` + `speechFailureNote()` pattern gives child-actionable feedback per priority
- Verifier gates compose: P8 includes P7 includes P6 includes P5
- `buildVarietyClusters()` uses SHA-256 hash of sorted member IDs for stable cluster IDs

---

## Key Technical Decisions

- **Exact word-count enforcement over tolerance:** Replace `expectedCount + 2` with `=== expectedCount` for closed items. The tolerance was the leak — closed items are not creative writing tasks.
- **Preflight before rubric success:** Closed preservation check runs before any validator/rubric can return `correct: true`, not after. This prevents the speech rubric from bypassing the contract.
- **Option B for cluster alignment:** Regenerate the fixture's cluster decisions from actual `buildVarietyClusters()` output rather than forcing all clusters to be review-required. Cross-mode clusters are review-required; same-mode duplicates are informational.
- **Schema v3 for decisions fixture:** Add `_meta.ai_pre_review` and `_meta.human_acceptance` fields to separate authority types without breaking existing gate functions.
- **Addendum over rewrite:** Create a P9 audit addendum rather than rewriting the P8 report — the P8 report is historical evidence of what P8 actually delivered.

---

## Open Questions

### Resolved During Planning

- **Which cluster design?** Option B — only cross-mode clusters are review-required. The reviewer pack already classifies clusters as `SAME-MODE-DUPLICATE` or `CROSS-MODE-OVERLAP`. Only `CROSS-MODE-OVERLAP` clusters need explicit decisions.
- **Where does speech preservation feedback land in priority?** After `reporting_clause_words` but before general `preservation` — the `content_preservation` facet sits between them (matches the patch location in the contract).
- **Do generated items use the same code path?** Yes — `evaluatePreservation()` already receives items regardless of source. The fix to the tolerance applies universally.

### Deferred to Implementation

- **Exact count of cross-mode clusters:** Depends on current pool composition at runtime — the fixture regeneration will discover this.
- **Which specific items need `allowLexicalChange`:** Only `dc_fix_signal_team` is mentioned in the contract; implementation will grep for any others.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
markPunctuationAnswer(item, answer)
  │
  ├─ isClosedPunctuationItem(item)?
  │    YES → evaluateExactClosedPreservation(answer, item)
  │           │
  │           ├─ pass: true → continue to existing marking
  │           └─ pass: false → return INCORRECT with:
  │                              - misconception: content.changed_extra_words
  │                                OR speech.extra_words_outside_reporting_clause
  │                              - facet: content_preservation = false
  │                              - child feedback
  │    NO → continue to existing marking
  │
  ├─ [existing validator/rubric/exact-answer flow]
  │
  └─ [speech rubric path — ALSO applies closed preservation AFTER rubric passes]
       rubricResult.correct && isClosedSpeechItem?
         YES → evaluatePreservation(text, item)
                preserved: false → override correct to false
```

---

## Implementation Units

- U1. **Exact closed-item preservation preflight**

**Goal:** Replace the `expectedCount + 2` tolerance with exact word-count enforcement for all closed punctuation items (insert/fix/combine with a stem).

**Requirements:** R1, R3

**Dependencies:** None

**Files:**
- Modify: `shared/punctuation/marking.js`
- Test: `tests/punctuation-closed-preservation-productionisation.test.js`

**Approach:**
- Change `evaluatePreservation()` (line 301): replace `answerWords.length > expectedCount + 2` with `answerWords.length !== expectedCount`
- Add `content_preservation` to FACET_LABELS constant
- Add `content_preservation` facet check in `speechFailureNote()` priority chain (between `reporting_clause_words` and `preservation`)
- Insert closed-preservation preflight at top of `markPunctuationAnswer()` before mode dispatch — if `isClosedPunctuationItem(item)` and preservation fails, return incorrect immediately
- Honour `allowLexicalChange: true` as the escape hatch
- Honour existing `preserveTokens` arrays (items that intentionally modify the stem)

**Patterns to follow:**
- Existing `facet()` helper pattern (line 154)
- Existing `speechFailureNote()` priority cascade (line 38)
- Patch file in contract shows exact insertion points

**Test scenarios:**
- Happy path: model answer for `lc_insert_supplies` marks correct (preservation passes, punctuation correct)
- Happy path: model answer for `sp_insert_question` marks correct (speech + preservation both pass)
- Edge case: answer with exact same words but different punctuation → correct (punctuation change allowed)
- Edge case: answer with exact same words but different capitalisation → correct (capitalisation change allowed)
- Error path: `lc_insert_supplies` + "today" appended → incorrect, `content.changed_extra_words`
- Error path: `lc_insert_supplies` + "in class" appended → incorrect, `content.changed_extra_words`
- Error path: `pa_insert_museum` + "today" appended → incorrect
- Error path: `pa_fix_author` + "in class" appended → incorrect
- Error path: answer with word removed → incorrect, `missing_words` reason
- Edge case: item with `allowLexicalChange: true` → bypasses preflight, marks via existing path
- Edge case: item with explicit `preserveTokens` → uses those tokens not stem-derived ones
- Integration: generated closed item (list comma family) + "today" → incorrect

**Verification:**
- All 7 contract-specified adversarial probes reject
- All existing model answers still mark correct (regression)
- P8 test suite still passes (preservation oracle tests use the same function)

---

- U2. **Speech outer-text lock**

**Goal:** Ensure closed speech items reject extra words after the reporting clause, using the same preservation preflight as non-speech closed items.

**Requirements:** R2, R3

**Dependencies:** U1

**Files:**
- Modify: `shared/punctuation/marking.js`
- Test: `tests/punctuation-closed-preservation-productionisation.test.js`

**Approach:**
- After `evaluateSpeechRubric()` returns `correct: true` for a closed speech item (has stem, mode is insert/fix/combine), run `evaluatePreservation(text, item)`
- If preservation fails, override `rubricResult.correct` to false, add `speech.extra_words_outside_reporting_clause` misconception tag and `content_preservation` facet
- This runs AFTER the speech rubric so that changed reporters still get the more specific `reporting_clause_words` feedback
- Keep flexible transfer speech items (no stem) exempt from this lock

**Patterns to follow:**
- The contract patch shows the exact location in the speech rubric block (~line 1643)
- Existing pattern: `rubricResult = { ...rubricResult, correct: false, misconceptionTags: [...], facets: [...] }`

**Test scenarios:**
- Happy path: `sp_insert_question` with correct speech and no extra words → correct
- Happy path: `sp_fix_question` with correct reporting clause and speech → correct
- Error path: `sp_insert_question` + "today." at end → incorrect, `speech.extra_words_outside_reporting_clause`
- Error path: `sp_insert_question` + "in the cupboard." at end → incorrect
- Error path: `sp_fix_question` + "in class." at end → incorrect
- Edge case: speech transfer item with no stem → NOT locked (remains flexible)
- Edge case: speech item with wrong reporter → gets `reporting_clause_words` feedback (not preservation feedback)
- Integration: generated speech insert family + "in the cupboard" → incorrect

**Verification:**
- All speech adversarial probes from contract reject
- Existing speech model answers still pass
- Reporter-change feedback still takes priority over preservation feedback

---

- U3. **Negative vectors v2: short-tail and generated coverage**

**Goal:** Expand the negative vector fixture to prove the exact short-tail leak is closed, covering both fixed-bank and generated items.

**Requirements:** R1, R2, R3, R8

**Dependencies:** U1, U2

**Files:**
- Modify: `tests/fixtures/punctuation-negative-vectors.json`
- Modify: `tests/punctuation-negative-vectors.test.js`
- Test: `tests/punctuation-negative-vectors.test.js`

**Approach:**
- Add new failure types to the fixture: `changed_content_short_tail`, `changed_content_extra_phrase`, `speech_extra_tail`, `speech_extra_outer_words`, `generated_closed_extra_tail`
- Add vectors for every contract-specified probe (lc_insert_supplies+today, +in class; pa_insert_museum+today; sp_insert_question+today, +in the cupboard; sp_fix_question+in class)
- Add at least one generated-item vector per closed family (list commas, fronted adverbials, semicolons, dashes, hyphens, parenthesis, apostrophe possession, speech)
- Update negative vector test to verify all new vectors reject through `markPunctuationAnswer()`
- Test must assert it inspects > 0 generated-item vectors (fail if zero generated cases)

**Patterns to follow:**
- Existing fixture schema v1 structure with `_meta`, `vectors[]`, `choiceValidation[]`
- Existing test pattern: iterate vectors, call `markPunctuationAnswer()`, assert `correct === false`

**Test scenarios:**
- Happy path: all existing 144 vectors still reject (regression)
- Happy path: all new short-tail vectors reject with correct misconception tag
- Happy path: all new speech-extra vectors reject with `speech.extra_words_outside_reporting_clause`
- Edge case: generated item vectors reject (proves generated path is locked too)
- Error path: test fails if zero generated vectors are found in fixture (coverage guard)
- Integration: model answers for all vector items still mark correct

**Verification:**
- Vector count exceeds 144 (new vectors added)
- Every new failure type has at least one vector
- Generated coverage spans all closed families at production depth

---

- U4. **Reviewer cluster-decision alignment**

**Goal:** Align the decision fixture's cluster IDs with the actual output of `buildVarietyClusters()`, and wire the verifier to check real cluster gates.

**Requirements:** R4, R5, R8

**Dependencies:** None (parallel with U1-U3)

**Files:**
- Modify: `tests/fixtures/punctuation-reviewer-decisions.json`
- Modify: `shared/punctuation/reviewer-decisions.js`
- Modify: `scripts/review-punctuation-questions.mjs`
- Create: `scripts/regenerate-punctuation-cluster-decisions.mjs`
- Test: `tests/punctuation-reviewer-cluster-alignment.test.js`

**Approach:**
- Create a regeneration script that: builds the production pool, calls `buildVarietyClusters()`, identifies cross-mode clusters, generates stable IDs, outputs fixture-format cluster decisions
- Run the regeneration script to produce aligned cluster decisions in the fixture
- Add `reviewRequired` field to cluster output in `buildVarietyClusters()` — true for `CROSS-MODE-OVERLAP`, false for `SAME-MODE-DUPLICATE`
- Update `evaluateClusterGate()` to accept the `reviewRequired` filter
- Write a test that verifies: fixture cluster IDs === `buildVarietyClusters()` cross-mode cluster IDs

**Patterns to follow:**
- `generateStableClusterId()` existing pattern (reviewer-decisions.js line 21)
- Existing `evaluateClusterGate()` signature (line 326)

**Test scenarios:**
- Happy path: `evaluateClusterGate()` passes when all cross-mode clusters have `ACCEPTABLE_CROSS_MODE_OVERLAP` decisions
- Edge case: fixture missing one cross-mode cluster → gate fails with blocker listing the missing ID
- Edge case: fixture has extra decisions for same-mode clusters → ignored (not required)
- Error path: cluster with `PENDING` decision → gate fails
- Integration: `buildVarietyClusters(pool)` output IDs match fixture `clusterDecisions[].clusterId` exactly

**Verification:**
- No cluster ID mismatch between reviewer pack output and fixture
- `review:punctuation-questions --summary --json` reports same cluster counts as verifier
- Required clusters > 0; all approved; 0 unreviewed; 0 blocked

---

- U5. **Review-authority truth model**

**Goal:** Replace ambiguous review wording with explicit `ai_pre_review` and `human_acceptance` authority fields in the decision fixture schema.

**Requirements:** R5, R9, R10

**Dependencies:** U4

**Files:**
- Modify: `tests/fixtures/punctuation-reviewer-decisions.json`
- Modify: `shared/punctuation/reviewer-decisions.js`
- Test: `tests/punctuation-review-authority.test.js`

**Approach:**
- Upgrade schema to v3: add `_meta.ai_pre_review`, `_meta.human_acceptance`, `_meta.production_certification` fields per contract spec
- `ai_pre_review.status: "complete"` with method and date
- `human_acceptance.status: "not_started"` with null reviewer/role/reviewedAt
- `production_certification.status: "blocked_pending_human_acceptance_and_p9_gates"`
- Update schema validation in `reviewer-decisions.js` to recognise v3
- Verifier gate checks: `ai_pre_review.status === 'complete'` (non-final gate), `production_certification.status` is not `certified` without human acceptance

**Patterns to follow:**
- Existing `_meta` structure in fixture
- Existing schema validation in `reviewer-decisions.js` (lines 60-97)

**Test scenarios:**
- Happy path: fixture with v3 schema passes validation
- Happy path: `ai_pre_review.status === 'complete'` gate passes
- Error path: fixture claiming `human_acceptance.status: 'complete'` without `reviewer` field → validation fails
- Error path: `production_certification.status: 'certified'` while `human_acceptance.status: 'not_started'` → gate fails
- Edge case: backward compat — v2 fixture still loads (legacy support)

**Verification:**
- Fixture explicitly separates AI review from human acceptance
- No wording in the fixture or verifier output claims "human QA approved"
- Production certification remains blocked

---

- U6. **P9 verifier and CLI reproducibility hardening**

**Goal:** Create `scripts/verify-punctuation-qg-p9.mjs` that composes all P8 gates plus new P9 gates, streams progress, exits cleanly under Node 22.

**Requirements:** R6, R8, R9

**Dependencies:** U1, U2, U3, U4, U5

**Files:**
- Create: `scripts/verify-punctuation-qg-p9.mjs`
- Modify: `package.json`

**Approach:**
- Check Node >= 22 before any imports (exit with clear error if wrong version)
- Stream progress: print gate name before running, tick/cross after completion
- Gates (11 total): P8 composed, exact closed preservation probes, speech outer-text probes, negative vectors v2, reviewer item decisions, reviewer cluster decisions, reviewer summary CLI, review-authority truth labels, report-count consistency, depth-6 remains blocked, production evidence boundary
- Each gate has a per-gate timeout (120s default) with clear error on timeout
- Use `execSync` with `stdio: 'pipe'` and progressive output rather than hidden buffering
- Add `"verify:punctuation-qg:p9"` script to package.json
- Ensure clean exit: no lingering handles, no unresolved promises

**Patterns to follow:**
- `scripts/verify-punctuation-qg-p8.mjs` gate runner pattern
- Existing package.json script naming: `verify:punctuation-qg:pN`

**Test scenarios:**
- Happy path: full verifier exits 0 when all gates pass
- Error path: single gate failure → non-zero exit with clear gate identification
- Error path: wrong Node version → immediate exit with version message
- Edge case: gate timeout → reports which gate timed out (not just "timeout")
- Integration: `npm run verify:punctuation-qg:p9` invokable from package.json

**Verification:**
- Command exits 0 under Node 22 without hanging
- All 11 gates produce visible pass/fail output
- Total runtime reported at end

---

- U7. **Production evidence pack**

**Goal:** Create a release evidence file that honestly represents what has been verified locally vs what requires live deployment proof.

**Requirements:** R9, R10

**Dependencies:** U6

**Files:**
- Create: `reports/punctuation/punctuation-qg-p9-production-evidence.json`
- Test: `tests/punctuation-production-evidence.test.js`

**Approach:**
- Populate `releaseId`, `commitSha` (current HEAD), `source.githubRef: "main"`, `source.verifiedPaths` (key fixture/test files)
- `localVerification.command: "npm run verify:punctuation-qg:p9"`, `status: "pass"`, `completedAt` timestamp
- `liveProductionSmoke.status: "not_run"` with all other fields null
- Write a test that validates the evidence file schema and confirms `liveProductionSmoke.status !== "pass"` unless all required fields are populated

**Patterns to follow:**
- Contract-specified schema (U7 section)
- Existing `reports/` directory structure

**Test scenarios:**
- Happy path: evidence file parses as valid JSON with all required fields
- Error path: evidence claiming live smoke "pass" without environment/origin/completedAt → test fails
- Edge case: `commitSha` matches a valid git SHA format
- Edge case: `localVerification.node` matches current Node version pattern

**Verification:**
- Evidence file exists and is schema-valid
- Local verification section is populated; live production section explicitly says "not_run"
- No false claims about live deployment

---

- U8. **P8 report addendum and wording correction**

**Goal:** Create a P9 audit addendum that corrects stale counts and wording drift in the P8 report.

**Requirements:** R7, R5

**Dependencies:** U3, U5 (needs actual counts)

**Files:**
- Create: `docs/plans/james/punctuation/questions-generator/punctuation-qg-p8-addendum-p9-audit.md`

**Approach:**
- Document actual negative vector count (from fixture, will exceed 144)
- Document actual negative-vector test count (from test runner output)
- Document actual `DEPTH_ACTIVATION_EVIDENCE.length`
- Correct any "human QA" wording to "AI pre-review"
- Note that legacy decision fallback still exists if it does
- Clarify that local verification and live production verification are different evidence layers
- This is an addendum — the P8 report is not rewritten

**Patterns to follow:**
- Existing report structure in `docs/plans/james/punctuation/questions-generator/`

**Test scenarios:**
Test expectation: none — this is a documentation-only unit. The verifier's report-count consistency gate (U6) validates the counts programmatically.

**Verification:**
- Addendum file exists
- Counts in addendum match actual fixture/test counts
- No false claims about human review or live production

---

## System-Wide Impact

- **Interaction graph:** `evaluatePreservation()` is called by `markTransfer()` and the speech rubric block. The preflight adds a new call site at the top of `markPunctuationAnswer()` before mode dispatch. Both paths must agree.
- **Error propagation:** Preservation failure returns `{ correct: false }` with misconception tags — this feeds into the existing feedback UI without changes.
- **State lifecycle risks:** None — marking is stateless (pure function of item + answer).
- **API surface parity:** The Cloudflare Worker endpoint and the local test harness both call the same `markPunctuationAnswer()` — changes propagate automatically.
- **Integration coverage:** Tests must verify both the direct preflight path and the speech-rubric-override path produce consistent results for the same item.
- **Unchanged invariants:** Transfer items without stems remain flexible. Choose/paragraph modes are unaffected. The existing P8 reporter-change rejection is preserved.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Exact enforcement breaks legitimate items that intentionally modify the stem | `allowLexicalChange: true` escape hatch + `preserveTokens` override. Grep for affected items during implementation. |
| Cluster regeneration produces different IDs than expected | Script is deterministic (SHA-256 of sorted IDs); test verifies bidirectional match. |
| P8 tests fail after preservation tightening | P8 tests use model answers which should still pass; any that relied on +2 tolerance with extra words were already testing incorrect behavior. |
| Report count drift between U3 (adding vectors) and U8 (documenting counts) | U8 depends on U3 completion; reads actual fixture at implementation time. |

---

## Sources & References

- **Origin document:** [docs/plans/james/punctuation/questions-generator/punctuation-qg-p9.md](docs/plans/james/punctuation/questions-generator/punctuation-qg-p9.md)
- **Supplementary patch:** [docs/plans/james/punctuation/questions-generator/punctuation-qg-p9-preservation.patch](docs/plans/james/punctuation/questions-generator/punctuation-qg-p9-preservation.patch)
- Related code: `shared/punctuation/marking.js`, `shared/punctuation/reviewer-decisions.js`
- Related scripts: `scripts/verify-punctuation-qg-p8.mjs`, `scripts/review-punctuation-questions.mjs`
- Related fixtures: `tests/fixtures/punctuation-reviewer-decisions.json`, `tests/fixtures/punctuation-negative-vectors.json`
- P8 report: `docs/plans/james/punctuation/questions-generator/punctuation-qg-p8-completion-report.md`
