---
title: "fix: Grammar QG P11 — Production Launch Fixes and Post-Deploy Certification"
type: fix
status: active
date: 2026-04-30
origin: docs/plans/james/grammar/questions-generator/grammar-qg-p11.md
---

# fix: Grammar QG P11 — Production Launch Fixes and Post-Deploy Certification

## Overview

Fix learner-surface bugs in the Grammar QG prompt-cue extraction pipeline (target-sentence reads grammar labels instead of sentences, accessibility copy uses wrong target-kind, double punctuation in read-aloud), reconcile evidence/report mismatches, strengthen the distractor review evidence chain, and establish the post-deploy certification contract. The pool remains 78 templates — no content expansion.

---

## Problem Frame

P10 achieved `CERTIFIED_PRE_DEPLOY` with 2,340 render inventory items, 0 hard failures, and 0 advisories. However, live validation reveals that:

1. `enrichPromptCue()` resolves target-sentence by taking the first `<strong>` content — which for `identify_words_in_sentence` is a grammar label ("adverbs") and for `subject_object_choice` is "subject"/"object" rather than the actual sentence.
2. Read-aloud always says "The underlined word is:" even when the target is a noun phrase (e.g. `qg_p4_voice_roles_transfer`).
3. Sentence-target read-aloud appends `.` unconditionally, producing `... . .` when `targetText` already ends in punctuation.
4. The prompt-cue audit script only checks that `focusCue.targetText` *exists* in the read-aloud, not whether it's semantically correct (a grammar label passes the check).
5. Report/artefact count mismatches (marking matrix 190 vs 80, quality register 74+4 vs 78, PR accounting gap).

These are S1 (learner hears wrong cue) and S2 (evidence truth) issues blocking production certification. (See origin: `docs/plans/james/grammar/questions-generator/grammar-qg-p11.md`)

---

## Requirements Trace

- R1. `focusCue.targetText` for `target-sentence` cue types must resolve to the actual sentence, not a grammar label
- R2. Read-aloud and screen-reader copy must use the correct target-kind ("noun phrase" vs "word" vs "sentence")
- R3. Read-aloud must never produce double terminal punctuation
- R4. Semantic prompt-cue audit must fail on current P10 snapshot and pass after fixes
- R5. Report/artefact counts must be reconciled and cross-validated by CLI
- R6. Ambiguous distractor templates must carry adult-review evidence or be blocked
- R7. Marking matrix report wording must match committed artefact metadata
- R8. `CERTIFIED_POST_DEPLOY` requires live production smoke evidence JSON
- R9. Scheduler must block any template with unresolved S0/S1 issues
- R10. Cumulative verify chain P6→P11 must pass — zero regression

---

## Scope Boundaries

- No new Grammar templates unless defect fix requires replacement
- No scoring, mastery, Stars, Mega, Concordium, Hero Mode, Hero Coins, monster evolution, or reward semantics
- No cosmetic UI work beyond answerability/accessibility/evidence fixes
- No rebranding or copy-only changes unless removing ambiguity for children

### Deferred to Follow-Up Work

- Full Playwright journey test of fixed read-aloud (manual QA acceptable for P11)
- Device/browser matrix QA beyond existing CI coverage
- Expansion of marking matrix seed window beyond current range (Option B from spec — keep current window if honestly reported)

---

## Context & Research

### Relevant Code and Patterns

- `worker/src/subjects/grammar/content.js:7701-7789` — `enrichPromptCue()`: the prompt-cue enrichment pipeline where all three bugs originate
- `worker/src/subjects/grammar/content.js:7628-7637` — `extractBoldSentence()`: returns first `<strong>` content, which is the root cause for grammar-label-as-sentence
- `worker/src/subjects/grammar/content.js:7732-7739` — `focusCue` assignment: no `targetKind` metadata, always 'underline'/'bold'/'target-sentence'
- `worker/src/subjects/grammar/content.js:7774-7782` — read-aloud generation: always says "underlined word", appends `.` unconditionally
- `scripts/audit-grammar-prompt-cues.mjs` — current audit checks structural presence, not semantic correctness
- `scripts/validate-grammar-qg-certification-evidence.mjs` — P9-U6 validator, needs report count cross-check
- `tests/grammar-qg-p10-prompt-cue-contract.test.js` — existing prompt-cue tests (word count, noun phrase assertions)
- `tests/grammar-qg-p10-read-aloud-alignment.test.js` — existing read-aloud tests
- `reports/grammar/grammar-qg-p10-certification-manifest.json` — manifest for release ID cross-check
- `reports/grammar/grammar-qg-p10-distractor-audit.json` — 2.2 MB distractor quality analysis
- `reports/grammar/grammar-qg-p10-quality-register.json` — 74 approved + 4 approved_with_limitation

### Institutional Learnings

- **Evidence-locked production certification**: Certification is derivable from artefacts, not declared. Manifest→Validator→Report gate pattern. Fail-closed scheduler: unknown = BLOCKED.
- **Production marker as test oracle**: Use `markByAnswerSpec()` as quality oracle, not string comparison. Per-input-type evaluator dispatch mandatory.
- **Structural vs semantic validation**: Independent auditors after every round. Denylist placeholder strings. Evaluator `"no-result"` is hard failure.
- **Cumulative verify chain**: Each phase chains predecessors. Total test count grows monotonically.
- **Machine-verifiable content release**: One-command release gate. Production smoke produces JSON artefacts with provenance metadata. Use `--evidence-origin` flag.

---

## Key Technical Decisions

- **Paragraph-block extraction over `<strong>` heuristic**: Replace `extractBoldSentence()` with `resolveTargetSentence()` that parses `<p>` blocks and filters candidates by length/content heuristics, rejecting grammar labels. Rationale: the spec's resolver order is well-defined and already validated by the P11 acceptance examples.
- **Add `targetKind` to focusCue shape**: Extend the serialised `focusCue` with a `targetKind` discriminator ('word'|'noun-phrase'|'sentence'|'group'|'pair'). Rationale: the read-aloud and screen-reader copy need this to select the correct phrasing template.
- **Conditional punctuation append**: Read-aloud appends `.` only when `targetText` does not already end in `.`, `!`, `?`, or `___` followed by punctuation. Rationale: eliminates double-punctuation class of bugs.
- **Semantic audit as new script**: Create `scripts/audit-grammar-prompt-cues-semantic.mjs` rather than extending the existing audit. Rationale: P10's audit is correct for its checks; the semantic layer adds different assertions that should fail on the P10 snapshot (proving it would have caught the issue).
- **Option A for marking matrix**: Keep current 80-entry window and report it honestly. Rationale: 80 entries across seeds 1..5 is adequate evidence; the fix is truthful reporting, not data expansion.
- **Evidence reconciliation before code changes (U0 first)**: Rationale: ensures the validator catches real mismatches before learner code changes, which may alter artefact counts.

---

## Open Questions

### Resolved During Planning

- **Should `focusCue.targetKind` be backward-compatible?**: Yes — `targetKind` is additive. Existing consumers that don't read it are unaffected. The `contentReleaseId` bumps only if learner-visible serialisation changes.
- **Does fixing read-aloud text require a content release ID bump?**: Yes — `readAloudText` is serialised to the client and heard by children. Bump to `grammar-qg-p11-2026-04-30` per `content_release_id_policy` in spec frontmatter.
- **Which templates need `targetKind: 'noun-phrase'`?**: `qg_p4_voice_roles_transfer` (confirmed in spec). Any template where the prompt says "underlined noun phrase/group/pair" — detected by `CUE_PATTERNS` regex matching.

### Deferred to Implementation

- Exact list of templates affected by double-punctuation (will be enumerated by semantic audit output)
- Whether any template's `stemHtml` structure requires a new `<p>` pattern in paragraph extraction (edge cases discovered at implementation time)

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
enrichPromptCue(question)
  ├── detectCueType(plainPrompt)         [unchanged]
  ├── detectTargetKind(plainPrompt)      [NEW: 'word'|'noun-phrase'|'sentence'|'group'|'pair']
  ├── extractUnderlinedWord(stemHtml)    [unchanged]
  ├── resolveTargetSentence(question, plainPrompt)  [NEW: replaces extractBoldSentence for target-sentence]
  │     ├── explicit field check (question.targetSentence, question.focusTarget)
  │     ├── extractParagraphTextBlocks(stemHtml)
  │     ├── isSentenceCueCandidate(text)  [≥16 chars, whitespace, punctuation/blank, not grammar label]
  │     └── reverse-scan for last qualifying block
  ├── focusCue assignment                [adds targetKind]
  ├── buildPromptParts(...)              [unchanged logic]
  ├── screenReaderPromptText             [uses targetKind for copy template]
  └── readAloudText                      [uses targetKind + conditional punctuation]
```

---

## Implementation Units

- U1. **Evidence truth reconciliation**

**Goal:** Fix P10 report wording and wire `validateReleaseIdConsistency()` into the certification CLI so artefact/report count mismatches become hard failures.

**Requirements:** R5, R7, R10

**Dependencies:** None

**Files:**
- Modify: `scripts/validate-grammar-qg-certification-evidence.mjs`
- Modify: `docs/plans/james/grammar/questions-generator/grammar-qg-p10-final-completion-report-2026-04-29.md`
- Test: `tests/grammar-qg-p11-evidence-truth.test.js`

**Approach:**
- Add a `validateReportCounts(manifest, reportPath)` function that parses the report markdown, extracts claimed counts (marking matrix entries, quality register statuses, PR list), and cross-checks against artefact metadata JSON files.
- Wire `validateReleaseIdConsistency()` into the default validation path (not test-only export).
- Amend P10 report wording: marking matrix → "80 entries, seeds 1..5"; quality register → "74 approved + 4 approved_with_limitation"; PR accounting → reconcile `#722` post-merge reference.
- The validator must fail if report claims 190 matrix entries while artefact metadata says 80.

**Patterns to follow:**
- `scripts/validate-grammar-qg-certification-evidence.mjs` — existing validation functions (`validateManifestSchema`, `computeOracleTestEnvelope`)
- `scripts/validate-grammar-qg-completion-report.mjs` — existing `extractFrontmatter()` helper

**Test scenarios:**
- Happy path: validator passes when report wording matches artefact counts exactly
- Error path: validator fails when report claims 190 matrix entries but artefact metadata has 80
- Error path: validator fails when manifest release ID disagrees with code's `GRAMMAR_CONTENT_RELEASE_ID`
- Error path: validator fails when quality register says "78 approved" but artefact has 74+4 split
- Edge case: validator handles missing optional fields gracefully (smoke evidence not yet present)

**Verification:**
- `node scripts/validate-grammar-qg-certification-evidence.mjs reports/grammar/grammar-qg-p10-certification-manifest.json docs/plans/james/grammar/questions-generator/grammar-qg-p10-final-completion-report-2026-04-29.md` passes after fixes
- The same command would have FAILED on the pre-fix report wording

---

- U2. **Prompt-cue target extraction fix**

**Goal:** Replace the "first `<strong>` wins" heuristic with a semantic sentence resolver that correctly identifies the target sentence from paragraph blocks.

**Requirements:** R1, R10

**Dependencies:** None (parallel with U1)

**Files:**
- Modify: `worker/src/subjects/grammar/content.js` (lines 7628-7740 region)
- Test: `tests/grammar-qg-p11-target-extraction.test.js`

**Approach:**
- Add `extractParagraphTextBlocks(stemHtml)` — extracts text from `<p>` blocks, strips inner HTML, filters empty.
- Add `isSentenceCueCandidate(text)` — rejects strings < 16 chars, no whitespace, no sentence punctuation, or matching grammar-label regex (`/^(subject|object|adverbs?|determiners?|pronouns?|conjunctions?)$/i`).
- Add `resolveTargetSentence(question, plainPrompt)` — checks explicit fields first (`question.targetSentence`, `question.focusTarget`), then reverse-scans paragraph blocks for last qualifying candidate.
- Modify the `enrichPromptCue` flow: when `cueType === 'target-sentence'`, call `resolveTargetSentence()` instead of using `extractBoldSentence()` as target.
- Keep `extractBoldSentence()` available as a fallback for non-sentence cue types that use `<strong>` for emphasis.
- Bump `GRAMMAR_CONTENT_RELEASE_ID` to `'grammar-qg-p11-2026-04-30'` (learner-visible serialisation change).

**Execution note:** Start with characterisation tests that document current broken behaviour (grammar labels as target), then fix extraction, then verify tests flip to pass.

**Patterns to follow:**
- The spec's suggested `resolveTargetSentence` shape (directional, not literal)
- Existing `cleanSpaces()` and `stripLegacyHtml()` helpers already in content.js

**Test scenarios:**
- Happy path: `identify_words_in_sentence` seed 1 → `focusCue.targetText` is "Nina carefully and quietly packed the glass vase." (not "adverbs")
- Happy path: `identify_words_in_sentence` seed 7 → target sentence is "Luca laughed because Maya slipped and nearly dropped the map."
- Happy path: `subject_object_choice` seed 1 → target sentence is "The noisy gull stole the sandwich from Max." (not "object")
- Happy path: `subject_object_choice` seed 2 → target sentence is "On Friday morning, our science club visited the museum."
- Happy path: `subordinate_clause_choice` seed 1 → target sentence remains visible and spoken
- Happy path: `proc_semicolon_choice` seed 1 → target sentence is the sentence with `___`, no double full stop
- Edge case: template with no `<p>` blocks falls back to `extractBoldSentence()` gracefully
- Edge case: sentence candidate exactly 16 chars passes; 15 chars rejected
- Error path: template with only grammar labels and no qualifying sentence → `resolveTargetSentence` returns null, focusCue falls through to existing fallback

**Verification:**
- All 6 spec acceptance examples pass
- `npm run verify:grammar-qg-p10` still passes (no regression in existing P10 tests)

---

- U3. **Cue-kind-specific accessibility copy**

**Goal:** Add `targetKind` to focusCue shape and fix read-aloud/screen-reader copy to use the correct phrasing template with no double punctuation.

**Requirements:** R2, R3, R10

**Dependencies:** U2 (target extraction must be correct before copy generation can be validated)

**Files:**
- Modify: `worker/src/subjects/grammar/content.js` (lines 7760-7783 region)
- Test: `tests/grammar-qg-p11-accessibility-copy.test.js`

**Approach:**
- Add `detectTargetKind(plainPrompt)` that maps CUE_PATTERNS matches to a targetKind:
  - "underlined word" → `'word'`
  - "underlined noun phrase" → `'noun-phrase'`
  - "underlined group" → `'group'`
  - "underlined pair" → `'pair'`
  - "sentence below" → `'sentence'`
  - default → `'word'`
- Include `targetKind` in the serialised `focusCue` object.
- Fix `screenReaderPromptText` generation:
  - `underline` + `'word'` → "Target word: {text}"
  - `underline` + `'noun-phrase'` → "The underlined noun phrase is: {text}"
  - `underline` + `'group'`/`'pair'` → "The underlined {kind} is: {text}"
  - `target-sentence` → "The sentence is: {text}"
- Fix `readAloudText` generation:
  - `underline` + `'word'` → "The underlined word is: {text}."
  - `underline` + `'noun-phrase'` → "The underlined noun phrase is: {text}."
  - `target-sentence` → "The sentence is: {text}." BUT only append `.` when text does not already end in `.`, `!`, `?`
- Conditional punctuation rule: `if (!/[.!?]$/.test(targetText.trim())) append '.'`

**Patterns to follow:**
- Existing `CUE_PATTERNS` array structure for detection
- Spec's `focusCue` serialised shape (type + targetKind + targetText + targetOccurrence)

**Test scenarios:**
- Happy path: `qg_p4_voice_roles_transfer` seed 1 → readAloudText says "The underlined noun phrase is: The trophy" (not "word")
- Happy path: `word_class_underlined_choice` seed 1 → readAloudText says "The underlined word is: {word}."
- Happy path: `identify_words_in_sentence` seed 1 → readAloudText says "The sentence is: Nina carefully and quietly packed the glass vase." (single full stop)
- Edge case: sentence ending in `!` → no extra `.` appended ("The sentence is: Run!")
- Edge case: sentence ending in `___` + `.` → no extra `.` appended
- Error path: `parenthesis_replace_choice` must not produce `..` in read-aloud
- Error path: `proc_semicolon_choice` must not produce double punctuation

**Verification:**
- `focusCue.targetKind` present in all generated questions with cue language
- Zero instances of double terminal punctuation across seeds 1..30
- `npm run verify:grammar-qg-p10` still passes

---

- U4. **Semantic prompt-cue audit**

**Goal:** Create a semantic audit that fails on the current P10 snapshot (proving it would have caught the bugs) and passes after U2/U3 fixes.

**Requirements:** R4, R10

**Dependencies:** U2, U3 (the audit validates their output)

**Files:**
- Create: `scripts/audit-grammar-prompt-cues-semantic.mjs`
- Test: `tests/grammar-qg-p11-semantic-audit.test.js`

**Approach:**
- Generate all 78 templates × 30 seeds.
- Fail if any of these conditions hold:
  - `target-sentence` prompt has no sentence-like target (null from resolver)
  - `focusCue.targetText` for target-sentence matches grammar-label regex
  - `screenReaderPromptText` contains "Sentence: subject/object/adverbs/determiners/pronouns/conjunctions"
  - `readAloudText` uses "underlined word" when `targetKind` is 'noun-phrase'/'group'/'pair'
  - `readAloudText` ends with duplicated punctuation (`/[.!?]{2,}$/`)
  - `promptParts` omit the sentence after sentence extraction (sentence kind missing when target-sentence resolved)
  - A dynamic audit check applies to zero templates (dead-check detection)
- Output structured JSON with per-check findings and summary.
- Add `--baseline` flag to run against the pre-fix state (useful for proving the audit would have caught P10 issues).

**Patterns to follow:**
- `scripts/audit-grammar-prompt-cues.mjs` — same CLI structure (--seeds, --json flags)
- Same import pattern from `worker/src/subjects/grammar/content.js`

**Test scenarios:**
- Happy path: after U2/U3 fixes, audit passes with 0 S0/S1 failures across 78×30 items
- Error path: on unpatched P10, audit fails with findings for `identify_words_in_sentence` (30 seeds), `subject_object_choice` (30 seeds), `qg_p4_voice_roles_transfer` (noun-phrase-as-word)
- Edge case: dead-check detection fires if a check matches zero templates (proves audit coverage)

**Verification:**
- `node scripts/audit-grammar-prompt-cues-semantic.mjs --seeds=1..30 --json` exits 0 after fixes
- The same command exits non-zero against the pre-fix content.js (documented in test as characterisation)

---

- U5. **Render and read-aloud regression tests**

**Goal:** Add explicit tests for the exact bug classes found in P10 to prevent regression.

**Requirements:** R1, R2, R3, R10

**Dependencies:** U2, U3 (tests validate fixed behaviour)

**Files:**
- Create: `tests/grammar-qg-p11-render-regression.test.js`
- Modify: `tests/grammar-qg-p10-read-aloud-alignment.test.js` (add no-double-punctuation assertion if not already present)

**Approach:**
- Pin specific template+seed combinations that demonstrate each bug class:
  - `identify_words_in_sentence` seed 1: visible prompt includes full sentence, screen reader names full sentence, read aloud names full sentence
  - `subject_object_choice` seed 1/2: never use "subject" or "object" as target-sentence text
  - `qg_p4_voice_roles_transfer`: `targetKind: 'noun-phrase'`, speaks "noun phrase"
  - All sentence-target templates: read-aloud avoids duplicated terminal punctuation
- Add a sweeping assertion across all 78 templates × seeds 1..5: no `readAloudText` ends with `/[.!?]{2,}$/`
- If JSDOM is required for render tests, verify it's declared in `package.json`; otherwise write tests at the data/serialisation level (no DOM needed for focusCue assertions).

**Patterns to follow:**
- `tests/grammar-qg-p10-prompt-cue-contract.test.js` — same structure with `describe`/`it` blocks, seed loops
- `tests/grammar-qg-p10-read-aloud-alignment.test.js` — existing read-aloud test patterns

**Test scenarios:**
- Happy path: each pinned template+seed produces correct focusCue and readAloudText
- Edge case: sweeping double-punctuation check across all templates × seeds 1..5 passes
- Integration: existing P10 render tests continue to pass (no regression from test file changes)

**Verification:**
- `node --test tests/grammar-qg-p11-render-regression.test.js` passes
- `npm run verify:grammar-qg-p10` still passes (zero regression)

---

- U6. **Ambiguous selected-response review closure**

**Goal:** Convert distractor audit's `ambiguousTemplates` and `requiresAdultReview` flags into actionable evidence with adult-review decisions.

**Requirements:** R6, R10

**Dependencies:** U1 (evidence framework must be solid before adding review decisions)

**Files:**
- Modify: `reports/grammar/grammar-qg-p10-quality-register.json`
- Modify: `reports/grammar/grammar-qg-p10-quality-register.md`
- Create: `tests/grammar-qg-p11-distractor-review-closure.test.js`

**Approach:**
- For each ambiguous template in the distractor audit, add an adult-review decision section to the quality register with: exact ambiguous risk, why the prompt disambiguates, one accepted example, one rejected plausible alternative, reviewer ID + date, final status.
- Valid final statuses: `approved_with_review`, `approved_with_limitation`, `blocked`, `retire_candidate`.
- Add a validator that cross-checks: every `requiresAdultReview: true` row in the distractor audit must have a linked review decision in the quality register. Missing links block certification.
- Generate certification status map from quality-register decisions.

**Patterns to follow:**
- Existing quality register structure (74 `approved` + 4 `approved_with_limitation` entries)
- `reports/grammar/grammar-qg-p10-certification-status-map.json` — status map pattern

**Test scenarios:**
- Happy path: all ambiguous templates have review evidence → validator passes
- Error path: remove one review decision → validator fails with specific template ID
- Edge case: template with `blocked` status is excluded from active certification denominator

**Verification:**
- Every `requiresAdultReview: true` row in distractor audit links to review evidence
- Certification status map regenerated and consistent with quality register

---

- U7. **Marking matrix truth**

**Goal:** Resolve the marking matrix count mismatch by honestly reporting the current 80-entry window.

**Requirements:** R5, R7, R10

**Dependencies:** U1 (validator must catch mismatches)

**Files:**
- Modify: `reports/grammar/grammar-qg-p10-marking-matrix.json` (metadata.totalEntries field)
- Modify: `scripts/validate-grammar-qg-certification-evidence.mjs` (add matrix count cross-check)
- Test: `tests/grammar-qg-p11-evidence-truth.test.js` (extend U1 test file)

**Approach:**
- Option A (per Key Technical Decisions): keep the 80-entry seed 1..5 window.
- Ensure `metadata.totalEntries` in the marking matrix JSON says `80`.
- Report wording uses "80 matrix entries (seeds 1..5, 16 entries per seed)" or equivalent honest phrasing.
- Validator cross-checks `markingMatrix.metadata.totalEntries` against report claim. Mismatch = hard failure.

**Patterns to follow:**
- Existing manifest validation in `validate-grammar-qg-certification-evidence.mjs`

**Test scenarios:**
- Happy path: report says 80, artefact says 80 → validator passes
- Error path: report says 190 while artefact says 80 → validator fails
- Edge case: metadata field missing → validator fails (required field)

**Verification:**
- Report and artefact agree on entry count
- CI validator passes

---

- U8. **Scheduler blocklist final guard**

**Goal:** Ensure any template with unresolved S0/S1 issues is blocked before deployment; scheduler excludes blocked templates.

**Requirements:** R9, R10

**Dependencies:** U2, U3 (must know which templates remain unfixed, if any)

**Files:**
- Modify: `worker/src/subjects/grammar/certification-status.js`
- Modify: `reports/grammar/grammar-qg-p10-certification-status-map.json`
- Test: `tests/grammar-qg-p11-scheduler-blocklist.test.js`

**Approach:**
- If U2/U3 fully resolve all S0/S1 issues: the status map retains all 78 templates as active. No blocks needed.
- If any S0/S1 remains post-implementation: block affected templates (`identify_words_in_sentence`, `subject_object_choice`, optionally `qg_p4_voice_roles_transfer`) in the certification status map.
- The scheduler already respects the status map (fail-closed: unknown = blocked). Test that blocked entries are excluded from practice queue and mini-pack generation.
- The render inventory and certification manifest must record the reduced active denominator if blocks are active.

**Patterns to follow:**
- `tests/grammar-qg-p10-scheduler-safety.test.js` — existing scheduler safety assertions
- `tests/grammar-qg-p9-blocklist-scheduler.test.js` — blocklist validation pattern
- Fail-closed pattern from institutional learnings: `if (!entry) return true` (blocked)

**Test scenarios:**
- Happy path: all S0/S1 resolved → full 78-template denominator active, scheduler serves all
- Edge case: template marked blocked → scheduler excludes it from practice queue
- Edge case: blocked template → render inventory reports reduced denominator
- Integration: blocked template cannot be served even with explicit seed request

**Verification:**
- Scheduler never serves a blocked template (assertion across seeds 1..30)
- Manifest denominator matches active (non-blocked) template count

---

- U9. **Production smoke and post-deploy certification**

**Goal:** Run production smoke after deployment and attach evidence. Only upgrade to `CERTIFIED_POST_DEPLOY` if evidence passes.

**Requirements:** R8, R10

**Dependencies:** U1, U2, U3, U4, U5, U6, U7, U8 (all fixes must land and deploy first)

**Files:**
- Modify: `scripts/grammar-production-smoke.mjs` (add prompt-cue + read-aloud assertions)
- Create: `reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json` (evidence output)
- Test: `tests/grammar-qg-p11-production-smoke-contract.test.js`

**Approach:**
- Extend production smoke script to include `promptCueAssertion` and `readAloudAssertion` checks alongside existing item-creation, answer-submission, read-model-update, and no-answer-leak assertions.
- Evidence JSON must contain all fields specified in origin spec section 7: releaseId, deployedUrl, timestamp, command, learnerFixtureType, six assertion results, failureDetails.
- The release ID in smoke evidence must match the deployed content release ID (`grammar-qg-p11-2026-04-30`).
- If smoke cannot be run (no deployment), report must remain `CERTIFIED_PRE_DEPLOY` or `BLOCKED_PRE_DEPLOY`.
- Add `--evidence-origin post-deploy` flag per institutional learnings (not `--origin`).

**Patterns to follow:**
- `scripts/grammar-production-smoke.mjs` — existing smoke script structure
- Machine-verifiable content release learning: JSON artefacts with `commitSha`, `contentReleaseId`, `origin`

**Test scenarios:**
- Happy path: smoke passes all assertions → evidence JSON written with `pass: true` for all fields
- Error path: prompt-cue assertion fails → evidence JSON records failure details, `CERTIFIED_POST_DEPLOY` forbidden
- Edge case: missing smoke evidence file → certification validator refuses post-deploy status
- Edge case: smoke releaseId doesn't match manifest → validator fails

**Verification:**
- Evidence file exists at expected path with all required fields
- `CERTIFIED_POST_DEPLOY` status only granted when all smoke assertions pass

---

- U10. **Final report and cumulative verify command**

**Goal:** Create the P11 final report as generated/validated evidence, and wire `npm run verify:grammar-qg-p11` into the cumulative chain.

**Requirements:** R5, R10

**Dependencies:** U1-U9 (report summarises all prior work)

**Files:**
- Create: `docs/plans/james/grammar/questions-generator/grammar-qg-p11-final-completion-report-2026-04-30.md`
- Modify: `package.json` (add `verify:grammar-qg-p11` and `verify:grammar-qg-production-release` scripts)
- Test: `tests/grammar-qg-p11-report-validation.test.js`

**Approach:**
- Add `verify:grammar-qg-p11` that chains `verify:grammar-qg-p10` plus all P11 test files.
- Add `verify:grammar-qg-production-release` that runs: full P6→P11 cumulative chain (`verify:grammar-qg-p11`), then additionally: semantic prompt-cue audit, evidence validator, marking matrix/report count validator, quality-register/status-map coherence, production smoke validator (when decision is `CERTIFIED_POST_DEPLOY`).
- Final report contains exact counts from artefact metadata (not hand-written): release ID, implementation PRs, report commit, active template denominator, render inventory count, quality-register status counts, distractor audit counts, marking-matrix metadata, smoke evidence status, blocked templates (if any), explicit no scoring/mastery/reward/Hero changes.
- Report validator ensures no field disagrees with committed artefact JSON.

**Patterns to follow:**
- `package.json` existing verify chain pattern: `"verify:grammar-qg-p10": "npm run verify:grammar-qg-p9 && node --test tests/grammar-qg-p10-*.test.js"`
- `scripts/validate-grammar-qg-completion-report.mjs` — existing report validation

**Test scenarios:**
- Happy path: `npm run verify:grammar-qg-production-release` exits 0 with all artefacts present and consistent
- Error path: missing smoke evidence when decision is `CERTIFIED_POST_DEPLOY` → fails
- Error path: report claims wrong template count → fails
- Integration: full chain P6→P11 passes in CI time budget

**Verification:**
- `npm run verify:grammar-qg-p11` passes
- `npm run verify:grammar-qg-production-release` passes
- Zero regression in existing P6→P10 test output

---

## System-Wide Impact

- **Interaction graph:** `enrichPromptCue()` is called by `serialiseGrammarQuestion()` which feeds both the Worker API response and the render inventory generator. Changes propagate to: client-side grammar view model (`src/subjects/grammar/components/grammar-view-model.js`), speech module (`src/subjects/grammar/speech.js`), and all report generators that serialise question data.
- **Error propagation:** If `resolveTargetSentence()` returns null, the existing fallback path (no focusCue assigned for target-sentence) preserves backward compatibility — the question renders without structured cue metadata, which is acceptable as a safe degradation.
- **State lifecycle risks:** `contentReleaseId` bump means the render inventory must be regenerated. Any cached render inventory with the old ID becomes stale. The certification manifest must reference the new ID.
- **API surface parity:** The `focusCue` shape change (adding `targetKind`) is additive — no existing consumer breaks. The React renderer, speech module, and admin panel read `focusCue.type` and `focusCue.targetText` which remain unchanged.
- **Integration coverage:** The semantic audit (U4) exercises the full pipeline end-to-end across 78×30 items. This proves integration correctness that unit tests alone cannot cover.
- **Unchanged invariants:** Scoring, mastery, Stars, Mega, Concordium, Hero Mode, Hero Coins, monster evolution, reward projection — all remain completely untouched. The scheduler's fail-closed behaviour is preserved; only the status map entries may change.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Paragraph extraction may not work for all 78 template stemHtml structures | Characterisation tests on seeds 1..30 before and after; fallback to `extractBoldSentence()` for non-sentence cue types |
| Content release ID bump invalidates cached render inventories | Regenerate render inventory as part of U10; validator catches stale-ID artefacts |
| Existing P10 tests may assert specific read-aloud text that changes with fixes | Run `npm run verify:grammar-qg-p10` after each unit; update P10 test assertions only where they assert the buggy behaviour (document why) |
| Production smoke depends on actual deployment which may not happen in this session | Spec explicitly allows `CERTIFIED_PRE_DEPLOY` as valid exit state; U9 is last in sequence |
| Large distractor audit JSON (2.2 MB) may be slow to parse in CI | Validator reads only `metadata` section, not full item array; existing pattern handles this size |

---

## Sources & References

- **Origin document:** [docs/plans/james/grammar/questions-generator/grammar-qg-p11.md](docs/plans/james/grammar/questions-generator/grammar-qg-p11.md)
- Related code: `worker/src/subjects/grammar/content.js:7601-7789` (enrichPromptCue pipeline)
- Related reports: `reports/grammar/grammar-qg-p10-*.json`
- Institutional learnings: `docs/solutions/architecture-patterns/evidence-locked-production-certification-2026-04-29.md`
- Institutional learnings: `docs/solutions/architecture-patterns/grammar-qg-p8-production-marker-as-test-oracle-2026-04-29.md`
- Institutional learnings: Structural vs semantic validation principle (autonomous artefacts must pass semantic substance checks, not just structural presence)
