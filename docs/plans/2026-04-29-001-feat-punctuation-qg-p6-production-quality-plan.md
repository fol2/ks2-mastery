---
title: "feat: Punctuation QG P6 — Production Question Quality, Manual QA, and UX Support"
type: feat
status: active
date: 2026-04-29
origin: docs/plans/james/punctuation/questions-generator/punctuation-qg-p6.md
deepened: 2026-04-29
---

# feat: Punctuation QG P6 — Production Question Quality, Manual QA, and UX Support

## Overview

P6 is the final production-quality acceptance phase for the Punctuation question generator. P1–P5 built the deterministic generation engine (25/25 DSL families, 192 runtime items, telemetry manifest, duplicate governance). P6 asks whether every learner-visible question is *good enough to trust* — fair marking, useful explanations, acceptable variety, and no silent fairness bugs.

Execution posture: **no regression**. Every unit begins with characterisation coverage of existing behaviour before modifying it.

---

## Problem Frame

The engine is mechanically complete but has known production-quality gaps:
1. A fixed item (`ap_transfer_possession`) whose own model answer is rejected by the marking engine (apostrophe/quote normalisation bug).
2. A speech transfer item (`sp_transfer_question`) that unfairly rejects valid reporting-after forms.
3. Every generated item uses a generic fallback explanation instead of rule-specific teaching feedback.
4. No human reviewer workflow to inspect the actual question bank.
5. Telemetry tests mix proof-level and smoke-level coverage without labelling the distinction.

Until these are resolved, production depth must stay at 4.

---

## Requirements Trace

- R1. Every fixed item model/accepted answer must mark correct through production marking.
- R2. Apostrophe normalisation must not collapse whitespace after terminal possessive apostrophes.
- R3. Speech transfer items must accept both reporting-before and reporting-after structures when the prompt is general.
- R4. Every generated item must have a rule-specific explanation (no generic fallback).
- R5. A human reviewer pack must cover all production items with filtering/decision workflow.
- R6. Every skill must have an explicit edge-case accept/reject test matrix.
- R7. Cross-mode perceived variety must be reviewed and explicitly approved or rewritten.
- R8. Depth decision must be evidence-backed and gated on all quality checks passing.
- R9. UX must surface rule-specific feedback without exposing internal IDs to children.
- R10. Telemetry tests must be classified as `proof-tested` or `smoke-tested` honestly.
- R11. A single verification command gives go/no-go for P6.
- R12. Completion report documents all evidence.

---

## Scope Boundaries

- No runtime AI question generation.
- No production depth raise until all quality gates pass.
- No cosmetic UI redesign beyond feedback clarity.
- No new competing primary CTAs on the learner screen.
- No exposure of template IDs, validator names, or misconception tags to children.
- No depth-8 promotion in this phase.

### Deferred to Follow-Up Work

- Depth-8 production viability assessment: future monitoring phase.
- Automated cross-mode sentence deduplication (P7 if needed).
- AI-enriched explanation generation (explicitly not in scope — all explanations are hand-authored DSL constants).

---

## Context & Research

### Relevant Code and Patterns

| Path | Purpose |
|------|---------|
| `shared/punctuation/marking.js:50-57` | `canonicalPunctuationText()` — the bug location (line 55 strips space after `'`) |
| `shared/punctuation/marking.js:228-241` | `requiredTokenCoverage()` — uses canonicalised text for token boundary matching |
| `shared/punctuation/generators.js:189` | Generic explanation fallback assignment |
| `shared/punctuation/content.js:778-793` | `sp_transfer_question` item definition with `speechWithWords` validator |
| `shared/punctuation/dsl-families/*.js` | 25 DSL family files (each needs `explanation` field in `build()`) |
| `scripts/verify-punctuation-qg-p5.mjs` | P5 gate composition pattern (10 gates via `execSync`) |
| `scripts/audit-punctuation-content.mjs` | Existing audit CLI with `--include-fixed-answers` flag |

### Institutional Learnings

- **DSL-as-normaliser pattern**: Author-facing DSL expands to flat arrays at build time. Runtime is zero-change.
- **Characterisation-first conversion**: Snapshot exact production output BEFORE modification, assert deep equality AFTER.
- **Self-checking test registry**: Test imports production bank and asserts every entry has coverage.
- **Composable verification gates**: Later phases ADD gates, never remove them (P5 adds 3 to P4's 7 = 10 total).
- **Mode-scoped duplicate detection**: `normaliseAuditText(item.stem)::${item.mode}` — cross-mode overlap is NOT duplicate.
- **Release ID bumps only for learner-facing content changes**: Telemetry/tooling changes do NOT bump release ID.

---

## Key Technical Decisions

- **Fix normalisation, not the item**: The `ap_transfer_possession` fix targets `canonicalPunctuationText()` regex, not the item's validator or accepted list. Terminal possessive apostrophes followed by a word must preserve the space.
- **Speech fairness via validator enhancement**: Add `reportingPosition: 'any'` support to `speechWithWords` validator rather than duplicating items. Prompts that require specific order must say so explicitly.
- **Explanation as DSL constant, not runtime computation**: Each DSL template's `build()` returns an `explanation` string. The generator picks it up via the existing `template.explanation || ...` path. Zero runtime overhead.
- **Reviewer pack as script output, not UI feature**: `npm run review:punctuation-questions` produces markdown + JSON. No admin panel needed in P6.
- **Depth decision is a gate, not a target**: P6 may conclude depth 4 is correct.

---

## Open Questions

### Resolved During Planning

- **Oxford comma policy?** — Follow existing convention: each item declares its own policy via validator config. No global default change.
- **HTML preview for reviewer?** — Deferred. Markdown + JSON is sufficient for P6 manual QA.
- **Where do reviewer decisions live?** — As a committed JSON fixture (`tests/fixtures/punctuation-reviewer-decisions.json`) gating CI.

### Deferred to Implementation

- **Exact regex for possessive apostrophe detection**: Needs testing against full normalisation suite to confirm no speech quote regression.
- **Which DSL families need distinct explanation variants per slot?**: Some may share one explanation across all variants; others may need slot-dependent text.
- **Final depth decision outcome**: Depends on whether all quality gates pass after content QA.

---

## Implementation Units

- U1. **Apostrophe normalisation hardening**

**Goal:** Fix `canonicalPunctuationText()` so terminal possessive apostrophes preserve trailing whitespace.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `shared/punctuation/marking.js`
- Test: `tests/punctuation-apostrophe-normalisation.test.js`

**Approach:**
- Line 55 regex `([""''])\s+/g, '$1'` unconditionally strips whitespace after any `'`. A terminal possessive like `teachers'` followed by a word (`notices`) gets collapsed into `teachers'notices`, breaking boundary matching.
- Fix: only collapse whitespace after a quote char when it appears to be a closing speech mark (preceded by punctuation or at sentence boundary), not when it follows a word character and precedes a lowercase word.
- Candidate approach: negative lookbehind `(?<![a-z])` before the quote char, or a two-pass strategy that first identifies speech mark positions.

**Execution note:** Characterisation-first. Snapshot all existing golden marking results at depth 8 before modifying normalisation. After fix, all prior golden tests must still pass.

**Patterns to follow:**
- Existing normalisation functions in `marking.js` lines 30-57
- Golden marking test structure in `tests/punctuation-golden-marking.test.js`

**Test scenarios:**
- Happy path: `"The children's paintings were hanging beside the teachers' notices."` marks correct for `ap_transfer_possession`
- Happy path: `"The boys' jackets were beside the girls' bags."` — plural possessive token matching works
- Happy path: `"The doctors' notes were on the desk."` — terminal possessive at end of sentence
- Edge case: Curly apostrophe equivalents (`’`) preserve same behaviour
- Edge case: `teachers'notices` (no space — learner typo) correctly rejects
- Regression: All 25 DSL family golden tests pass unchanged
- Regression: Speech quote normalisation (`"Hello," said Mia.`) still collapses correctly
- Regression: Contraction marking (`don't`, `won't`, `it's`) unaffected

**Verification:**
- `ap_transfer_possession` model answer marks correct
- All prior golden marking tests pass (zero regression)
- New regression test file passes

---

- U2. **Fixed-bank self-marking gate**

**Goal:** Add a comprehensive audit that runs every fixed item's model/accepted answers through production marking, failing CI on any rejection.

**Requirements:** R1

**Dependencies:** U1

**Files:**
- Create: `tests/punctuation-fixed-bank-selfmark.test.js`
- Modify: `scripts/audit-punctuation-content.mjs` (extend `--include-fixed-answers` to cover all checks)

**Approach:**
- Import `PUNCTUATION_ITEMS` from content.js and `markPunctuationAnswer` from marking.js.
- For every fixed item: assert `model` marks correct, every `accepted` marks correct, choice items have valid correct option, choice explanations match correct option.
- For open transfer items: assert at least one negative test exists (from misconceptionTags or companion fixture).
- Report names exact item id, prompt, model, validator, and failure note on any failure.

**Patterns to follow:**
- `tests/punctuation-golden-marking.test.js` — iterates production bank with per-item assertions
- Self-checking registry pattern from P5 learnings

**Test scenarios:**
- Happy path: All 92 fixed items' model answers mark correct
- Happy path: All accepted alternatives mark correct
- Happy path: Choice items have exactly one correct option
- Edge case: Items with multiple accepted alternatives (all pass)
- Error path: Intentionally broken validator (test infra catches it)
- Integration: Marking engine called with full item context (not just text)

**Verification:**
- Zero fixed items fail self-marking
- CI gate catches any future regression in fixed content

---

- U3. **Speech transfer fairness**

**Goal:** Make `speechWithWords` validator accept both reporting-before and reporting-after structures when the prompt is general.

**Requirements:** R3

**Dependencies:** U1

**Files:**
- Modify: `shared/punctuation/marking.js` (speechWithWords handler)
- Modify: `shared/punctuation/content.js` (update `sp_transfer_question` accepted alternatives)
- Test: `tests/punctuation-speech-fairness.test.js`

**Approach:**
- The `sp_transfer_question` item has `reportingPosition: 'before'` in its rubric but the `speechWithWords` validator doesn't enforce position — it only checks word presence, quote matching, and terminal mark.
- Decision: when the prompt says "Write one sentence of direct speech using these exact spoken words" without specifying position, the validator must accept both forms.
- Implementation: if `rubric.reportingPosition` is not explicitly constrained (or is `'any'`), accept both `Mia asked, "..."` and `"..." asked Mia.` forms.
- Update `sp_transfer_question` rubric to `reportingPosition: 'any'` (or remove the field if 'any' is the default).
- Add accepted alternatives for reporting-after.

**Execution note:** Characterisation-first. Verify current speech golden tests before modifying validator.

**Patterns to follow:**
- `evaluateSpeechRubric` in marking.js
- Speech DSL families (`speech-insert.js`, `fronted-speech-paragraph.js`)

**Test scenarios:**
- Happy path: `Mia asked, "Can we start now?"` marks correct (reporting-before)
- Happy path: `"Can we start now?" asked Mia.` marks correct (reporting-after)
- Happy path: Single-quoted variants also accepted
- Edge case: Reporting-after with exclamation: `"Stop!" shouted the teacher.`
- Edge case: Reporting-after with statement: `"The bus is here," said Tom.`
- Error path: Missing inverted commas still rejects
- Error path: Wrong terminal mark (period instead of question mark) still rejects
- Regression: Items with explicit position constraint still enforce it
- Regression: Fronted-speech paragraph items unaffected

**Verification:**
- Both reporting orders mark correct for general speech prompts
- Position-constrained items still enforce their constraint
- Golden marking passes for all speech DSL families

---

- U4. **Rule-specific generated explanations**

**Goal:** Every DSL template returns a rule-specific explanation from its `build()` function. No generated item uses the generic fallback.

**Requirements:** R4

**Dependencies:** None (independent of U1-U3)

**Files:**
- Modify: `shared/punctuation/dsl-families/apostrophe-contractions-fix.js`
- Modify: `shared/punctuation/dsl-families/apostrophe-mix-paragraph.js`
- Modify: `shared/punctuation/dsl-families/apostrophe-possession-insert.js`
- Modify: `shared/punctuation/dsl-families/bullet-points-fix.js`
- Modify: `shared/punctuation/dsl-families/bullet-points-paragraph.js`
- Modify: `shared/punctuation/dsl-families/colon-list-combine.js`
- Modify: `shared/punctuation/dsl-families/colon-list-insert.js`
- Modify: `shared/punctuation/dsl-families/colon-semicolon-paragraph.js`
- Modify: `shared/punctuation/dsl-families/comma-clarity-insert.js`
- Modify: `shared/punctuation/dsl-families/dash-clause-combine.js`
- Modify: `shared/punctuation/dsl-families/dash-clause-fix.js`
- Modify: `shared/punctuation/dsl-families/fronted-adverbial-combine.js`
- Modify: `shared/punctuation/dsl-families/fronted-adverbial-fix.js`
- Modify: `shared/punctuation/dsl-families/fronted-speech-paragraph.js`
- Modify: `shared/punctuation/dsl-families/hyphen-insert.js`
- Modify: `shared/punctuation/dsl-families/list-commas-combine.js`
- Modify: `shared/punctuation/dsl-families/list-commas-insert.js`
- Modify: `shared/punctuation/dsl-families/parenthesis-combine.js`
- Modify: `shared/punctuation/dsl-families/parenthesis-fix.js`
- Modify: `shared/punctuation/dsl-families/parenthesis-speech-paragraph.js`
- Modify: `shared/punctuation/dsl-families/semicolon-combine.js`
- Modify: `shared/punctuation/dsl-families/semicolon-fix.js`
- Modify: `shared/punctuation/dsl-families/semicolon-list-fix.js`
- Modify: `shared/punctuation/dsl-families/sentence-endings-insert.js`
- Modify: `shared/punctuation/dsl-families/speech-insert.js`
- Test: `tests/punctuation-explanation-specificity.test.js`

**Approach:**
- Each DSL template's object gains an `explanation` string field (or its `build()` returns one).
- Explanations must be child-readable, rule-specific, and never expose internal IDs.
- Example quality: "The comma comes after the starter phrase because it appears before the main clause."
- The generator at `generators.js:189` already uses `template.explanation || fallback` — adding the field is sufficient.
- An audit test imports the full generated bank and asserts no item matches the generic fallback.

**Patterns to follow:**
- Fixed items in `content.js` show explanation quality standard
- Generator fallback path at `generators.js:189`

**Test scenarios:**
- Happy path: Every generated item at depth 4 has a non-generic explanation
- Happy path: Every generated item at depth 6 has a non-generic explanation
- Happy path: Every generated item at depth 8 has a non-generic explanation
- Edge case: Explanations do not contain internal IDs, template IDs, or validator names
- Edge case: Explanation text length is reasonable (10-150 words)
- Error path: Generic fallback text is never present in any generated item

**Verification:**
- Zero generated items at any depth use the generic fallback
- Audit script detects and fails on generic explanations
- Explanations are child-readable and rule-specific

---

- U5. **Edge-case matrix by skill**

**Goal:** Create a comprehensive edge-case accept/reject test matrix for all 14 skills, run through production marking.

**Requirements:** R6

**Dependencies:** U1, U3 (normalisation and speech fairness must be stable)

**Files:**
- Create: `tests/punctuation-edge-case-matrix.test.js`

**Approach:**
- Organised by skill (14 sections). Each skill has explicit accept and reject cases.
- Cases run through `markPunctuationAnswer` with appropriate item context.
- House-style policies visible in test names and explanations.
- Coverage per the plan spec section 5/U6: sentence endings, list commas, apostrophe contractions, apostrophe possession, speech, fronted adverbials, parenthesis, comma clarity, colon lists, semicolons, dash clauses, semicolon lists, bullet points, hyphens.

**Patterns to follow:**
- `tests/punctuation-golden-marking.test.js` — per-family accept/reject structure
- Fixed items show the edge cases that matter per skill

**Test scenarios:**
- Happy path: Standard correct form for each of 14 skills
- Edge case: Straight vs curly apostrophes accepted for contractions
- Edge case: Terminal plural possessive before noun (apostrophe possession)
- Edge case: Reporting-before and reporting-after (speech)
- Edge case: Short vs long fronted adverbials (fronted adverbials)
- Edge case: Removable extra information test (parenthesis)
- Edge case: No colon after incomplete stem (colon lists)
- Edge case: Fragment-to-clause join rejected (semicolons)
- Edge case: Complex items with internal commas (semicolon lists)
- Edge case: Consistent vs inconsistent bullet style
- Edge case: Ambiguity-avoiding vs random hyphenation (hyphens)
- Error path: Common misconceptions correctly rejected per skill

**Verification:**
- All 14 skills have minimum accept/reject coverage
- All edge cases pass through production marking
- House-style policies documented in test names

---

- U6. **Per-question human QA pack**

**Goal:** Create a reviewer artefact that lets a human inspect the complete production question bank with filtering and decision workflow.

**Requirements:** R5

**Dependencies:** U2 (fixed-bank audit proves data integrity), U4 (explanations populated)

**Files:**
- Create: `scripts/review-punctuation-questions.mjs`
- Create: `tests/fixtures/punctuation-reviewer-decisions.json`
- Modify: `package.json` (add `review:punctuation-questions` script)

**Approach:**
- Script generates: (1) markdown report for reading, (2) JSON for filtering/tooling.
- Each item includes all fields from plan spec section 5/U5 (id, source, skill, mode, prompt, stem, model, accepted, reject examples, explanation, validator summary, misconception tags, readiness, template id, marking result, reviewer status, notes).
- Reviewer decisions committed as JSON fixture: `{ itemId: { status: 'approved'|'rewrite'|'retire'|'needs-marking-fix'|'needs-prompt-tightening', notes: '' } }`.
- CI fails if any production-pool item is marked `rewrite`, `retire`, or `needs-marking-fix`.

**Patterns to follow:**
- `scripts/audit-punctuation-content.mjs` — existing reviewer report infrastructure
- `buildReviewerReport`/`formatReviewerReport` functions in that script

**Test scenarios:**
- Happy path: Script runs and produces valid markdown + JSON output
- Happy path: All 92 fixed items appear in the pack
- Happy path: All 100 production generated items appear in the pack
- Edge case: Depth-6 candidates included when `--include-depth-6` flag passed
- Integration: Marking results are live (not cached) — script calls `markPunctuationAnswer` per item

**Verification:**
- `npm run review:punctuation-questions` produces complete output
- Reviewer decision fixture exists and CI gates on it
- Coverage: 192 items minimum (92 fixed + 100 generated)

---

- U7. **Perceived-variety review**

**Goal:** Add cross-mode perceived-variety detection that groups items by normalised stem/model/semantic overlap and requires explicit reviewer decisions.

**Requirements:** R7

**Dependencies:** U6 (reviewer decision infrastructure)

**Files:**
- Create: `tests/punctuation-perceived-variety.test.js`
- Modify: `scripts/review-punctuation-questions.mjs` (add variety clustering section)

**Approach:**
- Cluster items by: normalised stem, normalised model, same semantic sentence across modes, repeated character/topic, repeated correction pattern, repeated explanation.
- Cross-mode overlap is NOT automatically a bug — just requires explicit decision.
- Approved clusters need rationale in reviewer decisions fixture.
- Test asserts no unapproved global duplicate model/stem cluster exists.
- Mixed/GPS session exposure considered (items from different modes can appear in same session).

**Patterns to follow:**
- `tests/punctuation-duplicate-review.test.js` — mode-scoped duplicate governance
- `normaliseAuditText()` in audit script

**Test scenarios:**
- Happy path: Zero unapproved duplicate clusters in production pool
- Happy path: Approved cross-mode overlaps have documented rationale
- Edge case: Same sentence in fix and combine modes — requires explicit approval
- Edge case: Similar but not identical stems (fuzzy matching threshold)
- Integration: Variety report integrates with reviewer decision fixture

**Verification:**
- All cross-mode overlaps either approved with rationale or rewritten
- Variety report in strict mode passes

---

- U8. **Telemetry proof hardening**

**Goal:** Separate proof-level from smoke-level telemetry tests and label each honestly.

**Requirements:** R10

**Dependencies:** None

**Files:**
- Modify: `tests/punctuation-telemetry-command-path.test.js`
- Modify: `shared/punctuation/telemetry-manifest.js` (add `testLevel` field)

**Approach:**
- Review each command-path test. If it deterministically forces the event and asserts emission → `proof-tested`. If it relies on scheduling randomness → `smoke-tested`.
- Add `testLevel: 'proof' | 'smoke'` to manifest entries.
- `STAR_EVIDENCE_DEDUPED_BY_TEMPLATE` remains `reserved` unless a real callsite exists.
- Health reports distinguish `declared`, `emitted`, `proof-tested`, `smoke-tested`, `reserved`.
- Any event claimed as proven must have a deterministic test path.

**Patterns to follow:**
- `shared/punctuation/telemetry-manifest.js` — existing lifecycle status pattern
- P5 learnings: telemetry manifest with lifecycle status as leaf module

**Test scenarios:**
- Happy path: All `proof-tested` events have deterministic forcing tests
- Happy path: Health report correctly classifies each event
- Edge case: `smoke-tested` label does not block CI — it's informational
- Edge case: `STAR_EVIDENCE_DEDUPED_BY_TEMPLATE` stays `reserved` with no test requirement
- Regression: No existing proof-level tests downgraded without justification

**Verification:**
- Manifest accurately reflects actual test coverage level
- Health report shows honest classification
- No event is labelled `proof-tested` if its test can pass without emission

---

- U9. **UX support for answer trust**

**Goal:** Surface rule-specific explanations in the learner feedback UI without exposing internals.

**Requirements:** R9

**Dependencies:** U4 (explanations must exist before displaying them)

**Files:**
- Modify: `src/subjects/punctuation/components/PunctuationFeedback.jsx` (or equivalent feedback component)
- Modify: `shared/punctuation/service.js` (ensure explanation flows through feedback response)
- Test: `tests/punctuation-feedback-redaction.test.js`

**Approach:**
- The service already passes `explanation` in feedback body (`service.js:1586`). P6 ensures rule-specific text arrives (via U4) and the UI displays it.
- Add policy notes for house-style cases (e.g., "Oxford comma is accepted here").
- For speech items, clarify whether both reporting positions are valid.
- For sibling retry, explain the next question is a new sentence with the same trap.
- Redaction: ensure template IDs, validator names, misconception tags never reach the client component.
- Keep existing one-primary-action design principle.

**Patterns to follow:**
- Existing feedback rendering in punctuation component
- Redaction tests in `tests/punctuation-content-audit.test.js`

**Test scenarios:**
- Happy path: Correct answer shows rule-specific explanation
- Happy path: Incorrect answer shows helpful correction guidance
- Edge case: House-style policy note displayed when relevant
- Edge case: Sibling retry shows distinct "same trap, new sentence" message
- Error path: No template ID, validator name, or misconception tag in client-visible payload
- Regression: Feedback still shows for items with no custom explanation (fixed items already have explanations)

**Verification:**
- Child UI never surfaces internal identifiers
- Feedback is specific enough that a child knows what to fix
- No new competing CTAs added

---

- U10. **Production depth decision gate**

**Goal:** After all quality work, make a deliberate evidence-backed depth decision.

**Requirements:** R8

**Dependencies:** U1-U9 (all quality gates must pass before depth decision)

**Files:**
- Modify: `shared/punctuation/generators.js` (PRODUCTION_DEPTH if raising)
- Modify: `src/subjects/punctuation/service-contract.js` (release ID if raising)
- Modify: `tests/punctuation-smoke-attestation.test.js` (expected runtime count if raising)

**Approach:**
- This is a decision gate, not a predetermined outcome.
- If all quality gates pass AND reviewer QA approves depth-6 candidates AND perceived variety is good → raise to 6.
- If any quality gate has unresolved issues at depth 6 → stay at 4.
- Raising selected families is allowed (not all-or-nothing).
- If depth changes: bump release ID, update production smoke expected count, ensure star evidence remains release-scoped.

**Test scenarios:**
- Happy path: If depth stays at 4, no code changes needed — decision documented
- Happy path: If depth raises to 6, new release ID validates, runtime count = 242
- Edge case: Partial family raise — only approved families expand
- Regression: Star evidence projection remains scoped to release ID

**Verification:**
- Decision is documented with supporting evidence
- If raised: one canonical depth source, no divergent constants
- Production smoke passes with new expected counts

---

- U11. **P6 verification command**

**Goal:** Single command `npm run verify:punctuation-qg:p6` that gives reliable go/no-go for production question quality.

**Requirements:** R11

**Dependencies:** U1-U10 (verifies all prior work)

**Files:**
- Create: `scripts/verify-punctuation-qg-p6.mjs`
- Modify: `package.json` (add `verify:punctuation-qg:p6` script)

**Approach:**
- Compose P5 gates (10) plus P6-specific gates:
  - Fixed-bank self-marking audit
  - Apostrophe normalisation regression tests
  - Speech transfer fairness tests
  - Generated explanation specificity audit
  - 14-skill edge-case matrix
  - Perceived-variety strict mode
  - Telemetry proof/smoke classification
  - Reviewer decision gate
- Follow same `execSync` gate pattern as `verify-punctuation-qg-p5.mjs`.
- Print measured counts (items tested, explanations audited, edge cases, etc.), not only pass/fail.

**Patterns to follow:**
- `scripts/verify-punctuation-qg-p5.mjs` — composable gate structure
- Summary table with PASS/FAIL + counts

**Test scenarios:**
- Happy path: All gates pass, summary shows counts
- Error path: Any single gate failure → non-zero exit, named failure in report
- Edge case: Timeout handling for long-running gates (120s per gate)

**Verification:**
- One command provides complete go/no-go
- Exit code reflects overall status
- Measured counts printed in summary

---

- U12. **Final production-quality report**

**Goal:** Create the P6 completion report documenting all evidence.

**Requirements:** R12

**Dependencies:** U1-U11 (all work complete)

**Files:**
- Create: `docs/plans/james/punctuation/questions-generator/punctuation-qg-p6-completion-report.md`

**Approach:**
- Machine-derived counts where possible (call verification script, extract numbers).
- Required content: runtime counts, fixed/generator/depth counts, model answers tested, accepted alternatives tested, explanations audited, edge-case tests, reviewer decisions summary, variety summary, telemetry classification, depth decision + rationale, remaining risks.
- Format follows P5 completion report pattern.

**Test expectation: none — pure documentation artefact with no behavioural change.**

**Verification:**
- Report contains all required evidence sections
- Counts are machine-derived (not manually entered)
- Depth decision stated with supporting evidence

---

## System-Wide Impact

- **Interaction graph:** Normalisation fix in `marking.js` affects all marking paths (generated + fixed, all modes). Characterisation coverage is mandatory before change.
- **Error propagation:** Self-marking audit failures surface as CI test failures, not silent production incorrectness.
- **State lifecycle risks:** None — all changes are to pure functions and static content. No D1 migration, no state shape change.
- **API surface parity:** Feedback response shape unchanged (explanation field already exists). Worker commands unchanged.
- **Integration coverage:** Fixed-bank self-marking test exercises full marking path (content → normalisation → validator → facets → result).
- **Unchanged invariants:** Star evidence projection, scheduler algorithm, reward unit boundaries, telemetry event schemas, session lifecycle — all remain untouched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Normalisation regex fix introduces speech quote regression | Characterisation-first: snapshot ALL golden tests before change, assert zero regression after |
| 25 DSL families need explanations — large surface area | Template structure makes it mechanical: add `explanation` field per template. Self-checking registry test catches gaps |
| Reviewer QA may find items needing rewrite, blocking depth decision | Acceptable outcome: P6 success does not require depth raise. Document what needs rewrite for future phase |
| Speech fairness change may affect paragraph items with embedded speech | Scope speech position flexibility to `speechWithWords` validator only, not paragraph validators |

---

## Sources & References

- **Origin document:** [docs/plans/james/punctuation/questions-generator/punctuation-qg-p6.md](docs/plans/james/punctuation/questions-generator/punctuation-qg-p6.md)
- Related code: `shared/punctuation/marking.js`, `shared/punctuation/generators.js`, `shared/punctuation/content.js`
- Related learning: `docs/solutions/architecture-patterns/punctuation-qg-p3-dsl-authoring-time-normaliser-2026-04-28.md`
- Related learning: `docs/solutions/architecture-patterns/punctuation-qg-p5-production-readiness-attestation-architecture-2026-04-29.md`
- P5 verification: `scripts/verify-punctuation-qg-p5.mjs`
