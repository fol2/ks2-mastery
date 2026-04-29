---
title: "feat: Grammar QG P8 — Production Question Quality Certification"
type: feat
status: active
date: 2026-04-29
origin: docs/plans/james/grammar/questions-generator/grammar-qg-p8.md
---

# feat: Grammar QG P8 — Production Question Quality Certification

## Overview

P8 certifies the actual questions the Grammar QG system generates. P1–P7 built the generator infrastructure (templates, answer specs, mixed-transfer, calibration); P8 returns to first principles — every question must be logically sound, unambiguous, age-appropriate, and fair.

The hard constraint from the user: **no regression**. The existing `verify:grammar-qg-p7` chain (which cascades P6→P5→P4→P3→P2→P1) must remain green at every commit.

---

## Problem Frame

A structural scan found one known S0 content defect (a "fix the punctuation" item where the raw sentence already matches the golden answer) and a gap in the content-quality audit that fails to detect this class of issue. P8 fixes the defect, strengthens the audit, then certifies the full corpus through automated oracles, adult review, and UX validation.

---

## Requirements Trace

- R1. Fix the known `speech_punctuation_fix` no-op item (Finding 1)
- R2. Strengthen the content-quality audit to detect near-miss/golden equality and raw-prompt-passes cases (Finding 2)
- R3. Tighten report/frontmatter placeholder rejection for compound tokens (Finding 3)
- R4. Generate a reviewable inventory of all question shapes in the certification window
- R5. Automated oracles prove exactly-one-correct for selected response, golden/near-miss integrity for constructed response, and redaction safety for all
- R6. Every concept has adult review sign-off in a committed register
- R7. UX/input-type support is audited across device widths
- R8. Feedback reviewed for teaching value and consistency
- R9. Production smoke evidence is either run or honestly marked not-run
- R10. Final certification decision is one of: certified / certified_with_watchlist / not_certified
- R11. No runtime AI generation, AI marking, reward change, mastery scoring change (Non-goal from origin §4)
- R12. **No regression** — `verify:grammar-qg-p7` remains green at every commit

---

## Scope Boundaries

- No new template banks until certification is complete
- No AI for production question generation or marking
- No changes to Stars, Mega, Hero Mode, Concordium, or mastery semantics
- No mixed-transfer scoring weight promotion from shadow mode
- No cosmetic UI changes unrelated to question comprehension/entry/feedback

### Deferred to Follow-Up Work

- Post-deploy Cloudflare Worker smoke (depends on deployment scheduling — not blocking P8 certification)
- Evidence-led expansion phase (post-certification, driven by P7 calibration data)

---

## Context & Research

### Relevant Code and Patterns

- `worker/src/subjects/grammar/content.js` — 78 templates, `createGrammarQuestion()`, fixture arrays including `SPEECH_FIX_ITEMS`
- `worker/src/subjects/grammar/answer-spec.js` — `markByAnswerSpec()`, answer-spec kinds: normalisedText, acceptedSet, punctuationPattern, manualReviewOnly, exact, multiField
- `scripts/audit-grammar-content-quality.mjs` — 5 hard-fail rules, 3 advisory rules, `buildGrammarContentQualityAudit(seeds)`
- `scripts/validate-grammar-qg-completion-report.mjs` — `validateReleaseFrontmatter()`, `validateGrammarCompletionReport()`
- `tests/grammar-qg-p5-content-quality.test.js` — asserts 0 hard failures for seeds 1–10
- `tests/grammar-qg-p7-governance.test.js` — placeholder rejection tests, smoke path format, report structure validation
- Test pattern: `node:test` + `node:assert/strict`, factory helpers, descriptive messages

### Institutional Learnings

- Fixture fix + audit rule must be atomic to preserve P5 "zero hard failures" assertion (R12)
- `answerSpecBase()` places `golden` and `nearMiss` arrays on every constructed-response answer spec — they are always available for comparison
- `stemHtml` includes the instruction text (e.g., "Punctuate the direct speech correctly.") — the existing `fix-task-noop` rule comparing full stemHtml to golden is why the no-op escapes detection
- `SPEECH_FIX_ITEMS[2]` at index 2 is selected by `seed % 3 === 2` — seeds 2, 5, 8, 11, 14, 17, 20, 23, 26, 29

---

## Key Technical Decisions

- **Atomic fixture+rule commit (U0)**: The stronger audit rule would detect the existing bug and fail P5 if landed without the fixture fix. Both must ship in one commit.
- **New test files are additive**: All P8 tests go in new files (`tests/grammar-qg-p8-*.test.js`). Existing test files are unchanged.
- **Verify chain layering**: `verify:grammar-qg-p8` chains `verify:grammar-qg-p7` first, ensuring all prior gates still pass.
- **Inventory script is non-destructive**: Generates read-only report artefacts; does not modify content or answer specs.
- **Review register is committed JSON**: Machine-readable sign-off entries rather than free-form markdown, enabling future automation.
- **Content release ID bumped only if content changes**: U0 fixes a fixture → content changes → bump to `grammar-qg-p8-2026-04-29`.

---

## Open Questions

### Resolved During Planning

- **Q: Does fixing SPEECH_FIX_ITEMS[2] break the existing test chain?** Resolution: No — the P5 content-quality test currently passes because the existing `fix-task-noop` rule compares full stemHtml (including instructions) to golden, so the equality check never triggers. Fixing the fixture preserves 0 hard failures. The new stronger rule will also pass once the fixture is fixed.
- **Q: Should the inventory cover all 78×60 = 4,680 items?** Resolution: Generated families use seeds 1–60; static fixtures enumerate all items. Total certification window ~2,500–3,000 items (some templates have fewer meaningful seeds).

### Deferred to Implementation

- Exact replacement raw sentence for `SPEECH_FIX_ITEMS[2]` — must be genuinely incorrect direct speech that tests the same punctuation rule
- Whether `generatorFamilyId` is derivable from template metadata at generation time or needs addition to the generator output

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
┌─────────────────────────────────────────────────────────┐
│  verify:grammar-qg-p8 (package.json script)             │
│                                                         │
│  1. npm run verify:grammar-qg-p7       ← existing chain │
│  2. node --test tests/grammar-qg-p8-*  ← new P8 tests  │
│  3. audit-grammar-content-quality --seeds=1..30 --json  │
│  4. generate-grammar-qg-quality-inventory --seeds=1..60 │
└─────────────────────────────────────────────────────────┘

New audit rules (added to audit-grammar-content-quality.mjs):
  HARD FAIL 6: near-miss-marks-correct
  HARD FAIL 7: near-miss-equals-golden
  HARD FAIL 8: raw-prompt-passes (constructed-response raw vs answerSpec)

New test files:
  grammar-qg-p8-question-quality.test.js  — automated oracles
  grammar-qg-p8-review-register.test.js   — review register validation
  grammar-qg-p8-governance.test.js        — placeholder compound tokens + report wiring
```

---

## Implementation Units

- U0. **Fix speech_punctuation_fix no-op and strengthen audit**

**Goal:** Eliminate the known S0 content defect and ensure the audit catches this class of issue, atomically in one commit.

**Requirements:** R1, R2, R12

**Dependencies:** None

**Files:**
- Modify: `worker/src/subjects/grammar/content.js` (SPEECH_FIX_ITEMS[2])
- Modify: `scripts/audit-grammar-content-quality.mjs` (add 3 new hard-fail rules)
- Modify: `tests/grammar-qg-p5-content-quality.test.js` (extend seed range to 1–30 for stronger coverage)
- Create: `tests/grammar-qg-p8-question-quality.test.js` (regression test for the previous failing item + new oracle harness)
- Test: `tests/grammar-qg-p8-question-quality.test.js`

**Approach:**
- Replace `SPEECH_FIX_ITEMS[2].raw` with a genuinely incorrect sentence (e.g., `"Sit down" said the coach.` — missing exclamation mark inside speech marks).
- Update `.accepted` and `.solution` arrays to match the new correct form.
- Add three new hard-fail rules to the audit:
  - `near-miss-marks-correct`: for every constructed-response template, run each nearMiss through `markByAnswerSpec()` — must NOT mark correct.
  - `near-miss-equals-golden`: no normalised nearMiss may equal any normalised golden.
  - `raw-prompt-passes`: for fix/constructed-response templates, run the raw/nearMiss text through `markByAnswerSpec()` — must NOT pass.
- Add regression test that verifies the old raw `"Sit down!" said the coach.` would now be caught if re-introduced.
- Bump content release ID to `grammar-qg-p8-2026-04-29`.

**Patterns to follow:**
- Existing hard-fail rule structure in `audit-grammar-content-quality.mjs` (lines 54–131)
- `markByAnswerSpec()` import from `worker/src/subjects/grammar/answer-spec.js`

**Test scenarios:**
- Happy path: Fixed item raw sentence marks incorrect; fixed golden marks correct
- Happy path: Audit across seeds 1–30 produces 0 hard failures, 0 unwaived advisories
- Edge case: Synthetic near-miss equal to golden is detected by `near-miss-equals-golden` rule
- Edge case: Synthetic raw-prompt that passes marking is detected by `raw-prompt-passes` rule
- Regression: Old `"Sit down!" said the coach.` raw value would trigger `raw-prompt-passes` rule
- Integration: P5 content-quality test remains green (0 hard failures)

**Verification:**
- `npm run verify:grammar-qg-p7` passes (R12)
- `node --test tests/grammar-qg-p8-question-quality.test.js` passes
- Content-quality audit with seeds 1–30 returns 0 hard failures

---

- U1. **Governance hardening: compound placeholder rejection**

**Goal:** Reject compound placeholder tokens in report frontmatter that currently slip through validation.

**Requirements:** R3, R12

**Dependencies:** None (parallel with U0)

**Files:**
- Modify: `scripts/validate-grammar-qg-completion-report.mjs` (extend placeholder regex)
- Create: `tests/grammar-qg-p8-governance.test.js`
- Test: `tests/grammar-qg-p8-governance.test.js`

**Approach:**
- Extend the placeholder detection regex to reject compound tokens: `pending-report-commit`, `pending-commit`, `report-pending`, `tbd-report`, `unknown-report`.
- Pattern: reject if the value, after lowercasing, matches `/^(pending|todo|tbc|unknown|n\/a|tbd)(-\w+)*$/` or known compound patterns.
- Wire both `validateGrammarCompletionReport()` and `validateReleaseFrontmatter()` into a single validation entry-point test.

**Patterns to follow:**
- `tests/grammar-qg-p7-governance.test.js` placeholder rejection pattern (lines 42–108)

**Test scenarios:**
- Happy path: Valid SHA strings pass validation
- Edge case: `pending-report-commit` is rejected
- Edge case: `tbd-report` is rejected
- Edge case: `unknown-report` is rejected
- Edge case: `pending-commit` is rejected
- Edge case: `report-pending` is rejected
- Happy path: Strings that contain but are not pure placeholder compounds pass (e.g., `abcdef-pending-1234567` if ≥7 hex chars)

**Verification:**
- `node --test tests/grammar-qg-p8-governance.test.js` passes
- Existing P7 governance tests remain green

---

- U2. **Master question inventory generator**

**Goal:** Produce a human-reviewable inventory of every question shape in the certification window.

**Requirements:** R4, R12

**Dependencies:** U0 (inventory must run against fixed content)

**Files:**
- Create: `scripts/generate-grammar-qg-quality-inventory.mjs`
- Test: `tests/grammar-qg-p8-question-quality.test.js` (extend with inventory contract tests)

**Approach:**
- Script iterates all 78 templates × seeds 1–60 for generated families, plus full static fixture enumeration.
- Each item captured with fields per origin §U1 (contentReleaseId, templateId, seed, itemId, conceptIds, questionType, inputType, isGenerated, isMixedTransfer, answerSpecKind, marks, promptText, visibleOptionsOrRows, expectedAnswerSummary, misconceptionId, solutionLines, variantSignature, generatorFamilyId, reviewStatus).
- Outputs:
  - `reports/grammar/grammar-qg-p8-question-inventory.json` (full internal)
  - `reports/grammar/grammar-qg-p8-question-inventory.md` (adult review)
  - `reports/grammar/grammar-qg-p8-question-inventory-redacted.md` (learner-safe)
- Redacted version strips: answerSpec, golden, nearMiss, accepted, variantSignature, generatorFamilyId.
- CLI supports `--seeds=1..60` range notation and `--json` output.

**Patterns to follow:**
- `scripts/audit-grammar-content-quality.mjs` — iteration over `GRAMMAR_TEMPLATE_METADATA` + `createGrammarQuestion()`
- `scripts/grammar-qg-health-report.mjs` — report generation pattern

**Test scenarios:**
- Happy path: Inventory contains all 78 template IDs
- Happy path: Every generated family has variants for seeds 1–60
- Happy path: Every item has templateId + seed traceable to source
- Edge case: Redacted version contains no `answerSpec`, `golden`, `nearMiss`, `accepted`, `variantSignature`, `generatorFamilyId` fields
- Edge case: Internal version includes all metadata fields for reviewer sign-off
- Integration: Script exits 0 when run against current content

**Verification:**
- Script generates all three output files without error
- `reports/grammar/grammar-qg-p8-question-inventory.json` has entries for all 78 templates
- Redacted file grep confirms zero hidden answer data

---

- U3. **Automated question-quality oracles (full suite)**

**Goal:** Comprehensive automated tests proving question quality properties across the certification window.

**Requirements:** R5, R12

**Dependencies:** U0, U2 (needs fixed content and understanding of item shapes)

**Files:**
- Modify: `tests/grammar-qg-p8-question-quality.test.js` (expand from U0 regression tests into full oracle suite)
- Test: `tests/grammar-qg-p8-question-quality.test.js`

**Approach:**
- **Selected-response oracles** (single_choice, checkbox_list, table_choice):
  - Exactly one fully correct response path exists
  - Correct options present exactly once
  - No duplicate normalised option values
  - No duplicate row keys (table_choice)
  - Distractors rejected by marker
- **Constructed-response oracles** (normalisedText, acceptedSet, punctuationPattern):
  - Every golden marks correct via `markByAnswerSpec()`
  - Every nearMiss marks incorrect or partial
  - No nearMiss equals golden (normalised)
  - Raw prompt does not pass marking
  - `answerText` does not contradict golden
- **Manual-review-only oracles**:
  - `maxScore === 0`
  - No mastery/Star/retry mutation
- **Redaction oracles**:
  - Client-facing read model strips `answerSpec`, `golden`, `nearMiss`, `accepted`, `variantSignature`, `generatorFamilyId`

Run across seeds 1–30 (matching audit scope). Failures include templateId, seed, inputType, and visible prompt for debuggability.

**Patterns to follow:**
- `tests/punctuation-star-projection.test.js` — factory helpers, structured assertions with descriptive messages
- `scripts/audit-grammar-content-quality.mjs` — iteration pattern over templates × seeds

**Test scenarios:**
- Happy path: All selected-response items across seeds 1–30 have exactly one correct answer
- Happy path: All constructed-response golden answers mark correct
- Happy path: All nearMiss values mark incorrect or partial
- Edge case: table_choice rows have unique keys
- Edge case: checkbox_list items don't accidentally style as single_choice
- Edge case: manualReviewOnly items have maxScore 0 and no scoring side-effects
- Error path: If a synthetic bad template were added, the oracle would catch it (characterisation)
- Integration: markByAnswerSpec called with actual golden values returns correct=true for all templates

**Verification:**
- `node --test tests/grammar-qg-p8-question-quality.test.js` passes with 0 failures
- Every answer-spec template family covered by at least one oracle assertion

---

- U4. **Content review register and concept-level sign-off**

**Goal:** Create a machine-readable review register where each concept receives adult sign-off against the rubric in the origin brief.

**Requirements:** R6, R8, R12

**Dependencies:** U2 (needs inventory to review against)

**Files:**
- Create: `scripts/generate-grammar-qg-review-register.mjs`
- Create: `reports/grammar/grammar-qg-p8-content-review-register.json`
- Create: `tests/grammar-qg-p8-review-register.test.js`
- Test: `tests/grammar-qg-p8-review-register.test.js`

**Approach:**
- Review register schema: array of entries, each with `conceptId`, `templateId`, `seed`, `reviewerDecision` (accepted/rejected/watchlist), `severity` (S0–S3), `notes`, `feedbackReviewed` (boolean), `reviewedAt` (ISO date).
- Script generates a skeleton register from the inventory, pre-populated with `reviewerDecision: "pending"`.
- Reviewer (human/James) fills decisions; committed register is the certification artefact.
- Test validates:
  - All 18 concepts present in register
  - No concept has `reviewerDecision: "pending"` at certification time
  - Rejected items have severity + action
  - Feedback review entries exist for all templates with `feedbackLong`
  - No "reviewed by passing tests" shortcut (at least one entry per concept must have non-empty notes)

**Patterns to follow:**
- `reports/grammar/grammar-qg-p5-review-pack.md` — prior review artefact structure
- Origin §U3 rubric table — 18 concepts with edge cases

**Test scenarios:**
- Happy path: Completed register with all 18 concepts accepted passes validation
- Edge case: Missing concept fails validation
- Edge case: `pending` decision fails certification gate
- Edge case: Rejected item without severity fails validation
- Happy path: Feedback entries present for all templates with feedbackLong content

**Verification:**
- `node --test tests/grammar-qg-p8-review-register.test.js` passes
- Register JSON is well-formed and parseable

---

- U5. **UX/input-type support audit**

**Goal:** Verify learner interface supports all question types without avoidable friction or accidental unfairness.

**Requirements:** R7, R12

**Dependencies:** U0 (needs fixed content to audit against)

**Files:**
- Create: `reports/grammar/grammar-qg-p8-ux-support-audit.md`
- Create: `tests/grammar-qg-p8-ux-support.test.js`
- Test: `tests/grammar-qg-p8-ux-support.test.js`

**Approach:**
- Automated structural checks (not visual — those are manual):
  - Every input type in corpus has at least one example in the inventory
  - `table_choice` templates have ARIA role/label attributes declared
  - `textarea` inputs have `placeholder` text
  - No answer-spec data leaks into client-facing `inputSpec` for any template
  - Constructed-response items with punctuation requirements specify quote guidance
- Manual audit items documented in `grammar-qg-p8-ux-support-audit.md`:
  - Mobile width usability (table_choice horizontal scrolling)
  - Keyboard-only navigation (all selected-response types)
  - Screen-reader friendliness
  - Smart punctuation tolerance on mobile

**Patterns to follow:**
- Origin §U4 input-type matrix
- Component structure patterns in existing Phaser/React input components

**Test scenarios:**
- Happy path: All 6 input families (single_choice, checkbox_list, table_choice, textarea/constructed, multi, manualReviewOnly) represented in inventory
- Happy path: No `answerSpec` field leaks into client-facing question object
- Edge case: table_choice items have column/row header metadata
- Edge case: textarea items have non-empty placeholder
- Integration: Every inputSpec type used in the corpus matches a known UI component

**Verification:**
- `node --test tests/grammar-qg-p8-ux-support.test.js` passes
- UX audit markdown committed with findings

---

- U6. **Production smoke and verify:grammar-qg-p8 gate**

**Goal:** Wire the full P8 verification chain and capture production-readiness evidence.

**Requirements:** R9, R12

**Dependencies:** U0, U1, U2, U3, U4, U5

**Files:**
- Modify: `package.json` (add `verify:grammar-qg-p8` script)
- Test: All P8 test files via the chained command

**Approach:**
- `verify:grammar-qg-p8` chains:
  1. `npm run verify:grammar-qg-p7` (R12 — existing chain)
  2. `node --test tests/grammar-qg-p8-question-quality.test.js tests/grammar-qg-p8-governance.test.js tests/grammar-qg-p8-review-register.test.js tests/grammar-qg-p8-ux-support.test.js`
  3. `node scripts/audit-grammar-content-quality.mjs --seeds=1,...,30 --json`
  4. `node scripts/generate-grammar-qg-quality-inventory.mjs --seeds=1..60`
- Post-deploy smoke: explicitly documented as not-run unless deployment occurs during P8 window.
- Evidence artefacts referenced in final report by path.

**Test scenarios:**
- Happy path: `npm run verify:grammar-qg-p8` exits 0
- Integration: The chained `verify:grammar-qg-p7` still passes (regression gate)
- Edge case: If any P8 test file fails, the entire gate fails

**Verification:**
- `npm run verify:grammar-qg-p8` exits 0 end-to-end

---

- U7. **P8 final certification report**

**Goal:** Produce the formal certification decision document with all evidence.

**Requirements:** R10, R12

**Dependencies:** U0–U6 (all prior units complete)

**Files:**
- Create: `docs/plans/james/grammar/questions-generator/grammar-qg-p8-final-completion-report-2026-04-29.md`

**Approach:**
- Report structure per origin §U7:
  - Final content release ID
  - Denominator changes (yes — fixture fix)
  - Known issues before P8 / fixed / unresolved with severity
  - Automated quality audit summary
  - Adult content review summary
  - UX support audit summary
  - Smoke evidence status
  - Exact commands run
  - Certification decision: `certified` | `certified_with_watchlist` | `not_certified`
- Use `certified` only if: no known no-op fix item, no ambiguous correct answer, no hidden-answer leak, no production-blocking UI issue remains.

**Test expectation: none** — this is a documentation artefact validated by report structure tests in the existing governance infrastructure.

**Verification:**
- `validateGrammarCompletionReport()` passes against the report content
- `validateReleaseFrontmatter()` passes against the report frontmatter
- Certification decision is justified by prior unit evidence

---

## System-Wide Impact

- **Interaction graph:** Content-quality audit (`buildGrammarContentQualityAudit`) now imports `markByAnswerSpec` from `answer-spec.js` — no circular dependency (audit already imports from `content.js`; `answer-spec.js` has no upstream deps).
- **Error propagation:** Audit failures propagate as hard-fail entries → exit code 1 in CLI → test failure in verify chain. No silent swallowing.
- **State lifecycle risks:** None — P8 changes fixture data and adds tooling. No runtime state, no cache, no persistence changes.
- **API surface parity:** Content release ID bump may affect the Cloudflare Worker response's `releaseId` field — consumers should already tolerate ID string changes.
- **Unchanged invariants:** Stars, Mega, Hero Mode, Concordium, mastery scoring, reward mechanics, scheduler, and calibration pipeline are all untouched. The `markByAnswerSpec()` function is read-only when called from the audit — it has no side-effects.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Fixture replacement produces ambiguous question | Review replacement against origin §U3 speech_punctuation rubric before committing |
| New audit rule false-positives on edge-case templates | Run audit across seeds 1–30 before committing; any legitimate exceptions get reviewer-owned allowlist entries |
| Inventory generation too slow for CI | Inventory is generated as a one-time script, not part of the fast verify gate; verify chain uses seeds 1–30 (not 1–60) |
| Review register incomplete at certification time | Test explicitly rejects `pending` decisions — cannot certify without full sign-off |
| Content release ID bump breaks downstream | ID is a string; consumers compare for equality only; bump is semantically correct |

---

## Sources & References

- **Origin document:** [docs/plans/james/grammar/questions-generator/grammar-qg-p8.md](docs/plans/james/grammar/questions-generator/grammar-qg-p8.md)
- Related code: `worker/src/subjects/grammar/content.js`, `worker/src/subjects/grammar/answer-spec.js`
- Related scripts: `scripts/audit-grammar-content-quality.mjs`, `scripts/validate-grammar-qg-completion-report.mjs`
- Prior plan: `docs/plans/2026-04-29-007-feat-grammar-qg-p7-production-calibration-activation-plan.md`
