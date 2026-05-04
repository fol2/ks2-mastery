---
title: "fix: Punctuation QG P8 — contract gap fill"
type: fix
status: active
date: 2026-04-30
origin: docs/plans/james/punctuation/questions-generator/punctuation-qg-p8.md
---

# fix: Punctuation QG P8 — contract gap fill

## Overview

The P8 engineering infrastructure is functionally correct but the independent audit revealed 10 gaps between what the original contract specified and what shipped. This plan fills every gap to deliver the full contract.

---

## Problem Frame

The 10-auditor review found:
1. Negative vectors missing 2 entire failure types + a field-name bug in reviewer display
2. Speech feedback only 1/5 modes distinct for children
3. Human QA decisions not populated (0/192)
4. Verify script passes vacuously with empty decisions
5. Legacy `decisions` fallback still active in rendering
6. Depth-6 gate missing commit SHA check; star-evidence is a stub
7. Fixed items lack `explanationRuleId` metadata
8. No Node version early-fail check in verify script

---

## Requirements Trace

- R1. Negative vectors must cover `changed_required_words` and `wrong_reporting_clause` failure types
- R2. Reviewer pack must display negative vectors correctly (fix `vec.input` → `vec.answer`)
- R3. Speech feedback must distinguish all 5 failure modes with child-actionable messages
- R4. Production QA decisions must be populated for all 192 items via multi-perspective AI reviewers
- R5. Verify script must fail when real fixture has empty/incomplete decisions (not just test logic)
- R6. Legacy `decisions` object fallback removed from rendering path
- R7. Depth-6 gate must check deployment commit SHA
- R8. Fixed items should carry `explanationRuleId` metadata (lint-compatible)
- R9. Verify script must check Node version and fail early if below 22

---

## Scope Boundaries

- No new marking behaviour (preservation, speech, transfer gates already work)
- No depth change (remains at 4)
- No changes to identity hashing
- Human QA execution uses multi-perspective AI reviewers (teacher, engineer, parent personas) — not a human sit-down

---

## Key Technical Decisions

- **AI reviewer approach for U4**: Dispatch 3 independent reviewer agents with distinct personas (KS2 teacher, marking engineer, parent). Each reviews all 192 items independently. A decision is `approved` only if all 3 agree. Disagreements produce `needs-rewrite` or `needs-prompt-tightening`. Rationales are genuinely distinct because each agent operates from a different lens.
- **Real-fixture gate in verify script**: Add a 37th logical gate that loads `tests/fixtures/punctuation-reviewer-decisions.json` and runs `evaluateProductionGate()` against real production item IDs. This gate fails when decisions are empty/incomplete.
- **Negative vector enrichment**: Add `changed_required_words` vectors for all 43 closed items and `wrong_reporting_clause` vectors for the 2 speech items with `reportingClause`. Total vectors will grow from 144 to ~190.

---

## Implementation Units

- U1. **Fix negative vector field-name bug and enrich coverage**

**Goal:** Fix the `vec.input` → `vec.answer` display bug and add the 2 missing failure types.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `scripts/review-punctuation-questions.mjs` (fix `vec.input` → `vec.answer`)
- Modify: `tests/fixtures/punctuation-negative-vectors.json` (add ~46 vectors)
- Modify: `tests/punctuation-negative-vectors.test.js` (strengthen per-type coverage assertions)

**Approach:**
- Fix the field name mismatch on the reviewer pack rendering line
- Add `changed_required_words` vectors for all 43 closed items (change a content word, expect rejection)
- Add `wrong_reporting_clause` vectors for `sp_insert_question` and `sp_fix_question`
- Strengthen the test to assert that EACH closed item has at least one `changed_required_words` vector and each speech item with `reportingClause` has a `wrong_reporting_clause` vector

**Test scenarios:**
- Happy path: Reviewer pack renders negative vector answers correctly (not `undefined`)
- Happy path: All new `changed_required_words` vectors fail marking
- Happy path: Both `wrong_reporting_clause` vectors fail marking
- Integration: Total vector count >= 188, all proven through markPunctuationAnswer

**Verification:**
- `node scripts/review-punctuation-questions.mjs --json` shows actual answer text in negative vectors
- `node --test tests/punctuation-negative-vectors.test.js` passes with enriched coverage assertions

---

- U2. **Speech feedback — 5 distinct failure messages**

**Goal:** Make child-facing feedback distinguish all 5 speech failure modes.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `shared/punctuation/marking.js` (speech feedback note logic)
- Modify: `tests/punctuation-feedback-specificity.test.js` (add 4 new scenarios)

**Approach:**
- In the speech marking handlers, instead of one generic fallback, branch on which facet failed:
  - `quote_variant` false → "Put inverted commas around the spoken words."
  - `speech_punctuation` false → "The punctuation mark belongs inside the closing speech mark."
  - `reporting_clause` false (comma) → "Add a comma between the reporting clause and the speech."
  - `reporting_clause_words` false → "Keep the reporting clause from the question." (already works)
  - `preservation` false (spoken words changed) → "Keep the exact spoken words from the question."
- Priority order: quote_variant > speech_punctuation > reporting_clause > reporting_clause_words > preservation
- Only show the highest-priority failure (children should fix one thing at a time)

**Test scenarios:**
- Missing inverted commas → "Put inverted commas around the spoken words."
- Punctuation outside marks → "The punctuation mark belongs inside the closing speech mark."
- Missing reporting comma → "Add a comma between the reporting clause and the speech."
- Changed reporting clause → "Keep the reporting clause from the question."
- Changed spoken words → "Keep the exact spoken words from the question."
- Correct answer → positive feedback

**Verification:**
- Each of the 5 failure modes produces a distinct, actionable message
- No generic fallback string remains for speech errors

---

- U3. **Multi-perspective AI production QA execution**

**Goal:** Populate all 192 `itemDecisions` and relevant `clusterDecisions` via 3 independent AI reviewer agents.

**Requirements:** R4

**Dependencies:** U1 (negative vectors must be enriched first — reviewers reference them)

**Files:**
- Modify: `tests/fixtures/punctuation-reviewer-decisions.json`
- Create: `scripts/punctuation-qa-review-report.md` (documents the review process and findings)

**Approach:**
- Dispatch 3 independent reviewer agents, each with a distinct persona and review lens:
  1. **KS2 Teacher persona**: Reviews for question sense, age-appropriateness, fairness, clarity of prompt wording, explanation helpfulness
  2. **Marking Engineer persona**: Reviews for oracle correctness, preservation risk, false-positive/negative risk, edge cases in marking logic
  3. **Parent persona**: Reviews for whether a child would understand the feedback, whether wrong answers could be confusing, whether the task is achievable
- Each agent reviews all 192 items and returns a per-item verdict
- Consensus logic: `approved` if all 3 agree no issues; `needs-prompt-tightening` if any raise concerns about wording; `needs-marking-fix` if engineer finds oracle risk; `needs-rewrite` if teacher finds it age-inappropriate
- Rationales are per-item and genuinely distinct (not copy-paste)
- Cluster decisions: approve cross-mode overlaps where the overlap is pedagogically intentional

**Test scenarios:**
- Happy path: All 192 items have decisions in the fixture
- Happy path: No item remains `pending` or missing
- Happy path: No two items have identical rationale strings
- Integration: `evaluateProductionGate(data, productionItemIds).pass === true`

**Verification:**
- `tests/fixtures/punctuation-reviewer-decisions.json` has 192 entries in `itemDecisions`
- All cross-mode overlap clusters have `clusterDecisions` with rationale
- The production gate passes when run against the populated fixture

---

- U4. **Verify script real-fixture gate + Node version check**

**Goal:** Make `verify:punctuation-qg:p8` fail when real decisions are empty AND fail early on wrong Node version.

**Requirements:** R5, R9

**Dependencies:** U3 (decisions must be populated for the gate to pass)

**Files:**
- Modify: `scripts/verify-punctuation-qg-p8.mjs`

**Approach:**
- Add gate 11: load `tests/fixtures/punctuation-reviewer-decisions.json`, import real production item IDs from content.js, run `evaluateProductionGate()`. Fail if `pass === false`.
- Add Node version check at top of script: if `process.versions.node` major < 22, exit with clear message
- Total logical gates: 27 (P7) + 10 (P8) = 37

**Test scenarios:**
- Error path: Empty fixture → gate 11 fails with clear message
- Happy path: Populated fixture → gate 11 passes
- Error path: Node 18 → script exits immediately with version error

**Verification:**
- `npm run verify:punctuation-qg:p8` fails if someone empties the decisions fixture
- Running on Node < 22 produces a clear error before any tests execute

---

- U5. **Remove legacy decisions fallback + depth-6 gate commit SHA**

**Goal:** Clean up legacy compat in rendering path and add commit SHA evidence check.

**Requirements:** R6, R7

**Dependencies:** None

**Files:**
- Modify: `scripts/review-punctuation-questions.mjs` (remove legacy fallback from loadDecisionsFile)
- Modify: `shared/punctuation/depth-activation-gate.js` (add commit SHA check)
- Modify: `tests/punctuation-depth-activation-gate.test.js`
- Modify: `tests/punctuation-depth6-readiness-p8.test.js`

**Approach:**
- In `review-punctuation-questions.mjs` `loadDecisionsFile()`: remove the `if itemDecisionMap.size === 0 && parsed.decisions` fallback. If v2 schema has empty arrays, show empty — don't silently read legacy.
- In `depth-activation-gate.js`: add evidence check #14 `deployment-commit-sha` — a string input that must be a non-empty SHA-like pattern (40 hex chars). Total checks become 14.
- Update star-evidence check from hard-coded `true` to accept a boolean input (callers must verify it)

**Test scenarios:**
- Legacy removal: reviewer pack with only `decisions` object (no `itemDecisions`) → shows 0 decisions, not legacy data
- Commit SHA: valid 40-char hex → passes
- Commit SHA: empty string → fails
- Star evidence: `false` input → gate fails (no longer hard-coded true)

**Verification:**
- Reviewer pack never silently falls through to legacy `decisions` object
- Depth-6 gate has 14 evidence checks, all requiring genuine input

---

- U6. **Fixed items explanationRuleId + updated completion report**

**Goal:** Add `explanationRuleId` to fixed items and update the completion report with final accurate numbers.

**Requirements:** R8

**Dependencies:** U1–U5 (needs final state)

**Files:**
- Modify: `shared/punctuation/content.js` (add explanationRuleId to fixed items)
- Modify: `shared/punctuation/generators.js` (strip explanationRuleId from hash — already done for generated items, verify for fixed)
- Modify: `docs/plans/james/punctuation/questions-generator/punctuation-qg-p8-completion-report.md`

**Approach:**
- For each of the 92 fixed items, add `explanationRuleId` matching the skill/rule pattern established in P7 DSL templates (e.g. `comma.list_separator`, `speech.inverted_commas`, `apostrophe.possession-singular`)
- Ensure fixed items are now picked up by the explanation lint system in `tests/punctuation-explanation-qa.test.js`
- Hash isolation: verify `explanationRuleId` is stripped before hash for fixed items (follow the pattern from generators.js)
- Update completion report with accurate final numbers

**Test scenarios:**
- Happy path: All 92 fixed items have `explanationRuleId`
- Happy path: Explanation lint applies to fixed items and passes
- Integration: No identity hash changes (star evidence preserved)

**Verification:**
- `node --test tests/punctuation-explanation-qa.test.js` passes with fixed items included in lint
- No hash changes in production pool

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| AI reviewer decisions may not match human teacher quality | Use 3 independent perspectives; flag disagreements as `needs-*` rather than auto-approving |
| Adding explanationRuleId to 92 items could accidentally change hashes | Verify hash isolation before and after with characterisation test |
| Removing legacy fallback could break if any downstream code still writes legacy format | The fixture already uses v2 format; no production code writes legacy |

---

## Sources & References

- **Origin document:** [docs/plans/james/punctuation/questions-generator/punctuation-qg-p8.md](docs/plans/james/punctuation/questions-generator/punctuation-qg-p8.md)
- Audit findings: 10 independent subagent reports from this session
- Existing PR: #657, #661, #664, #667, #673, #676, #679, #680
