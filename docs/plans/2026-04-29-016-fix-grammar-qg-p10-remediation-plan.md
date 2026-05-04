---
title: "fix: Grammar QG P10 — Remediation of Audit-Identified Gaps"
type: fix
status: active
date: 2026-04-29
origin: docs/plans/james/grammar/questions-generator/grammar-qg-p10.md
---

# Grammar QG P10 — Remediation of Audit-Identified Gaps

## Overview

10 independent auditors reviewed P10's shipped artefacts against the origin contract. They found that while the behaviour fixes (prompt cues, read-aloud, table-choice) are genuine, the evidence layer (quality register, distractor audit, marking matrix, render tests) was delivered as shallow mechanical automation rather than the depth the contract demands. This plan closes every gap identified.

---

## Problem Frame

The P10 completion report claims `CERTIFIED_PRE_DEPLOY` but the following artefacts fail the origin contract's acceptance criteria:

- **U5 quality register**: automated pass/fail log with 0/13 required fields
- **U7 marking matrix**: golden+empty only (2/9 required variant categories)
- **U6 distractor audit**: correct-count only, no semantic classification
- **U9 render tests**: structural object checks, not DOM rendering
- **U8 scheduler**: static all-approved, 5 bypass paths in engine.js
- **U0 report**: still has `pending-this-commit` (the defect it was meant to fix)
- **U1 inventory**: missing rendered options, row-specific data, full speech output
- **U2 audit**: missing screen-reader/read-aloud alignment check
- **U3/U4 tests**: minor explicit coverage gaps

(see origin: `docs/plans/james/grammar/questions-generator/grammar-qg-p10.md`)

---

## Requirements Trace

- R1. Quality register has all 13 origin-required fields with concrete per-template evidence
- R2. Marking matrix tests all 9 variant categories per constructed-response template
- R3. Distractor audit classifies misconceptions and flags defensible alternatives
- R4. Render tests use actual DOM rendering (jsdom), keyboard navigation, mobile-width
- R5. Scheduler blocks all code paths: practice queue, mini-test, retry, similar-problem, direct-launch
- R6. Evidence artefacts internally consistent (no `pending-this-commit`, inventory cross-checked)
- R7. Render inventory includes full speech output and actual visible options
- R8. Prompt cue audit checks screen-reader/read-aloud alignment
- R9. Zero regression — existing verify chain unbroken

---

## Scope Boundaries

- No new template content or scoring changes
- No changes to learner-visible behaviour (behaviour fixes already shipped in P10 round 1)
- This is purely evidence depth, safety hardening, and test coverage
- U10 (post-deploy smoke) and U12 (expansion) remain deferred

---

## Key Technical Decisions

- **Quality register stays automated but adds depth**: The origin says "reviewer ID" and "concrete examples" which implies human review. Since this is an autonomous sprint, the register will use `reviewerId: "automated-p10-oracle"` with actual generated question text, option labels, and per-seed evidence as the "concrete examples". This is honest — the reviewer is code, and the evidence is concrete. It is NOT the same as "prompts clear, answers unambiguous".
- **Marking matrix uses `normaliseSmartPunctuation` + case mutations**: Generate actual variant strings programmatically from golden answers rather than hand-authoring 190 × 9 entries.
- **jsdom for React render tests**: The codebase uses `node:test` without a DOM environment. Add `jsdom` as a dev dependency for U9 render tests only.
- **Engine.js blocklist wiring is a behaviour change**: Adding `isTemplateBlocked` checks to `takeDueRetry`, `nextItem`, and `startSimilarProblem` is a real safety improvement, not just evidence.

---

## Implementation Units

- U1. **Quality register full rewrite**

**Goal:** Replace the shallow pass/fail log with a register that satisfies all 13 origin-required fields.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `scripts/generate-grammar-qg-quality-register.mjs`
- Modify: `reports/grammar/grammar-qg-p10-quality-register.json`
- Create: `reports/grammar/grammar-qg-p10-quality-register.md`
- Modify: `tests/grammar-qg-p10-evidence-artefacts.test.js`

**Approach:**
- For each of 78 templates, generate 5 representative items (seeds 1–5) and capture: actual prompt text, actual options/answer, marking result, feedback text
- Produce per-template entry with all 13 fields: `decision`, `severity`, `reviewerId` ("automated-p10-oracle"), `reviewMethod`, `seedWindow`, `concreteExamples` (array of actual generated question snippets), `answerabilityJudgement`, `grammarLogicJudgement`, `distractorQualityJudgement`, `markingJudgement`, `feedbackJudgement`, `accessibilityJudgement`, `finalAction`
- High-risk templates (mixed-transfer, constructed-response, visual-cue, manual-review, formal/informal, subject/object) get `seedWindow: "1..15"` with 3+ concrete examples showing edge cases
- Judgement fields: derive from oracle results (e.g., answerability = "all 5 seeds produce exactly one correct option"; grammarLogic = "feedback references correct grammar rule for concept X")
- Generate markdown companion file

**Test scenarios:**
- Happy path: register has 78 entries, each with all 13 fields non-null
- Happy path: high-risk templates have deeper `concreteExamples` arrays (length ≥ 3)
- Error path: entry with empty `concreteExamples` array fails validation
- Error path: entry missing any of the 6 judgement fields fails validation
- Integration: another adult reading `grammar-qg-p10-quality-register.md` can see actual question text and understand why the template was approved

**Verification:**
- Every entry has all 13 fields populated with non-placeholder content
- Markdown file exists and is human-readable

---

- U2. **Marking matrix full variant expansion**

**Goal:** Expand the marking matrix from golden+empty to all 9 required variant categories.

**Requirements:** R2

**Dependencies:** None

**Files:**
- Modify: `scripts/generate-grammar-marking-matrix.mjs`
- Modify: `reports/grammar/grammar-qg-p10-marking-matrix.json`
- Create: `reports/grammar/grammar-qg-p10-marking-matrix.md`
- Modify: `tests/grammar-qg-p10-evidence-artefacts.test.js`

**Approach:**
- For each constructed-response template × seeds 1..10:
  - `goldenAnswers`: all accepted answers from `answerSpec.golden` array
  - `acceptedVariants`: programmatic mutations (reorder words where grammar allows, synonym substitution where spec allows)
  - `nearMisses`: golden with one word changed/removed (still grammatically valid but wrong answer)
  - `rawPromptProbes`: empty string, whitespace-only, prompt text echo, "I don't know"
  - `smartPunctuationVariants`: apply `normaliseSmartPunctuation` forward and reverse (curly→straight, straight→curly)
  - `caseVariants`: all-lowercase, all-uppercase, sentence-case of golden
  - `commonChildMistakes`: based on template's misconception tags — e.g., for `fix_fronted_adverbial`, try missing comma, wrong comma position
  - `expectedScore`: full mark for golden/accepted, zero for near-miss/probe
  - `misconceptionTag`: from evaluator result

**Test scenarios:**
- Happy path: every template × seed has all 9 categories populated
- Happy path: all golden + accepted variants mark correct
- Happy path: all near-misses mark incorrect
- Happy path: smart punctuation variants are symmetrically handled
- Edge case: whitespace-only and empty string mark incorrect
- Edge case: case variants that are semantically identical still mark correct

**Verification:**
- Matrix JSON has 9 fields per entry (not just 3)
- Markdown companion exists

---

- U3. **Distractor audit semantic classification**

**Goal:** Extend distractor audit beyond count-checking to classify WHY each option is right/wrong.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `scripts/audit-grammar-distractor-quality.mjs`
- Modify: `reports/grammar/grammar-qg-p10-distractor-audit.json`
- Modify: `tests/grammar-qg-p10-evidence-artefacts.test.js`

**Approach:**
- For each option in each selected-response question, capture:
  - `optionText`: the actual label
  - `isCorrect`: boolean from evaluator
  - `misconceptionTag`: from evaluator result (the content.js templates already emit misconception IDs per distractor)
  - `whyWrong`: human-readable string from `GRAMMAR_MISCONCEPTIONS[tag]` dictionary (already exists in content.js)
  - `wordCount`: of the option (for variety analysis)
- Flag `defensibleAlternative: true` when: option text could be correct under a different grammatical interpretation (heuristic: same word class, ambiguous sentence structure). For P10, flag templates in the formal/informal, modal, subject/object, and subordinate/relative concept areas as `requiresAdultReview: true`
- Add `ambiguousTemplates` summary listing templates flagged for adult attention

**Test scenarios:**
- Happy path: every distractor has a non-null `misconceptionTag` and `whyWrong` string
- Happy path: correct options have `isCorrect: true` and null misconception
- Edge case: templates in ambiguous concept areas flagged for adult review
- Integration: audit JSON includes per-option detail (not just template-level counts)

**Verification:**
- Every option in every selected-response item has classification fields
- `ambiguousTemplates` array identifies templates needing human sign-off

---

- U4. **Scheduler safety — engine.js blocklist wiring**

**Goal:** Close the 5 bypass paths in engine.js so blocked templates cannot reach learners via any route.

**Requirements:** R5

**Dependencies:** None

**Files:**
- Modify: `worker/src/subjects/grammar/engine.js`
- Modify: `worker/src/subjects/grammar/certification-status.js`
- Modify: `tests/grammar-qg-p10-scheduler-safety.test.js`

**Approach:**
- In `takeDueRetry` (engine.js): before returning a retry item, check `isTemplateBlocked(item.templateId)` — if blocked, skip to next retry candidate
- In `nextItem` direct-launch path (engine.js): when `templateId` is explicitly provided, check `isTemplateBlocked` — if blocked in normal learner mode, return error `{ blocked: true, reason: 'template-not-certified' }`
- In `startSimilarProblem` (engine.js): check `isTemplateBlocked(baseItem.templateId)` before generating similar
- Make `certification-status.js` load status from the P10 quality register JSON file instead of hardcoding all-approved from metadata
- Add `includeBlocked` guard: only allowed when session has `debugMode: true` or `reviewMode: true`

**Execution note:** Characterisation-first — capture current behaviour of all 5 paths before modifying, then add the blocklist checks.

**Test scenarios:**
- Happy path: approved template passes through all 5 paths normally
- Error path: blocked template rejected from `takeDueRetry` (skipped, next candidate served)
- Error path: blocked template rejected from direct-launch with clear error object
- Error path: blocked template rejected from `startSimilarProblem`
- Error path: blocked template rejected from smart practice queue
- Error path: blocked template rejected from mini-test pack
- Edge case: `includeBlocked` with `debugMode: true` allows blocked template
- Edge case: `includeBlocked` WITHOUT debug/review mode is ignored (still blocked)
- Integration: synthetic blocked template ID provably unreachable from any learner code path

**Verification:**
- All 5 engine.js code paths check `isTemplateBlocked`
- Status map is loaded from register file, not hardcoded

---

- U5. **React DOM render tests (jsdom)**

**Goal:** Replace structural object tests with actual DOM rendering through GrammarSessionScene.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Modify: `package.json` (add `jsdom` as devDependency)
- Modify: `tests/grammar-qg-p10-render-surface.test.js` (rewrite)
- Create: `tests/helpers/grammar-render-harness.js` (jsdom setup + React render helper)

**Approach:**
- Add `jsdom` (dev dependency only — no production bundle impact)
- Create a render harness that: sets up jsdom environment, imports React + GrammarSessionScene, renders a serialised question item into the DOM, returns the DOM tree for assertion
- Tests render actual questions through the component and assert on:
  - `word_class_underlined_choice`: exactly one `.prompt-underline` span, contains single word, no duplicate sentence text in DOM
  - `qg_p4_voice_roles_transfer`: underline on phrase (2-4 words), not entire paragraph
  - `qg_p4_word_class_noun_phrase_transfer`: correct target marked
  - Homogeneous table: all rows share same column headers
  - Heterogeneous table: rows have different option labels
- Keyboard navigation: assert that all `input[type="radio"]`, `input[type="checkbox"]`, `textarea` elements have accessible `name`/`aria-label` attributes and are tabbable (no `tabindex="-1"`)
- Mobile: assert no element with `min-width` > 390px in inline styles (CSS media queries are not testable in jsdom but inline constraints are)

**Test scenarios:**
- Happy path: `word_class_underlined_choice` DOM has one `.prompt-underline` with single word
- Happy path: heterogeneous table has different options per `<tr>`
- Happy path: all interactive inputs have `aria-label` or `name`
- Error path: test fails if zero items generated for template
- Edge case: `promptParts` with `lineBreak` kind produces `<br>` element
- Integration: full render through GrammarSessionScene, not just partial component

**Verification:**
- Tests import and render through `GrammarSessionScene` (not just data assertions)
- `jsdom` in devDependencies, not dependencies

---

- U6. **Render inventory enrichment**

**Goal:** Add actual visible options, row-specific data, full speech output, and feedback to the inventory.

**Requirements:** R7

**Dependencies:** None

**Files:**
- Modify: `scripts/generate-grammar-qg-render-inventory.mjs`
- Modify: `reports/grammar/grammar-qg-p10-render-inventory.json`
- Modify: `reports/grammar/grammar-qg-p10-render-inventory-redacted.md`
- Create: `reports/grammar/grammar-qg-p10-render-inventory.md`
- Modify: `tests/grammar-qg-p10-evidence-artefacts.test.js`

**Approach:**
- Add `visibleOptions`: for single_choice/checkbox_list — array of option label strings; for table_choice — array of `{ rowLabel, options: [...] }`; for text/textarea — placeholder text
- Add `rowSpecificOptions`: for heterogeneous table_choice — per-row option arrays (null for non-table or homogeneous)
- Add `fullSpeechOutput`: call `buildGrammarSpeechText({ session: { currentItem: serialisedItem } })` and store the result — this is what the learner actually hears
- Add `_feedbackSummary`: extract `feedbackLong` or `feedbackShort` from evaluation result for the correct answer
- Generate non-redacted `.md` file (human-readable, includes answer internals — for adult review)

**Test scenarios:**
- Happy path: every item has non-null `visibleOptions` (at least for selected-response/table types)
- Happy path: heterogeneous table items have `rowSpecificOptions` array
- Happy path: `fullSpeechOutput` is a non-empty string for items with `readAloudText`
- Happy path: `_feedbackSummary` present for templates with feedback
- Error path: redacted .md contains no `_solutionLines`, `_answerSpec`, `_feedbackSummary`
- Integration: non-redacted .md file exists and is human-readable

**Verification:**
- Three output files exist (.json, .md, -redacted.md)
- `visibleOptions` shows what a child actually sees on screen

---

- U7. **Prompt cue audit alignment check + cueNotRequiredReason**

**Goal:** Close the two U2 audit gaps: screen-reader/read-aloud alignment check, and `cueNotRequiredReason` field.

**Requirements:** R8

**Dependencies:** None

**Files:**
- Modify: `scripts/audit-grammar-prompt-cues.mjs`
- Modify: `worker/src/subjects/grammar/content.js` (enrichPromptCue function)
- Modify: `tests/grammar-qg-p10-prompt-cue-contract.test.js`

**Approach:**
- Add Check 4 to audit script: when `focusCue` exists, verify that both `screenReaderPromptText` and `readAloudText` contain `focusCue.text` (case-insensitive substring match)
- Add Check 5: when `promptParts` exists but `focusCue` is null, require `cueNotRequiredReason` field on the question object (string explaining why no cue is needed)
- In `enrichPromptCue` (content.js): on the early-return path when `!cueType` but `promptParts` was set, add `question.cueNotRequiredReason = 'no-cue-language-detected'`
- Test: all templates with focusCue have aligned screen-reader and read-aloud text
- Test: templates with promptParts but no focusCue have cueNotRequiredReason

**Test scenarios:**
- Happy path: `word_class_underlined_choice` — screenReaderPromptText contains focusCue.text
- Happy path: `word_class_underlined_choice` — readAloudText contains focusCue.text
- Error path: audit fails if focusCue.text not found in screenReaderPromptText
- Edge case: template with promptParts but no cue language has cueNotRequiredReason

**Verification:**
- Audit passes with Check 4 + Check 5 active
- Zero violations across 2,340 items

---

- U8. **Minor test coverage gaps (U3 + U4)**

**Goal:** Close the small explicit test gaps from U3 and U4 audits.

**Requirements:** R9

**Dependencies:** None

**Files:**
- Modify: `tests/grammar-qg-p10-read-aloud-alignment.test.js`
- Modify: `tests/grammar-qg-p10-table-render.test.js`

**Approach:**
- Add test: mini-test mode with `session.type === 'mini-set'` uses current item's `readAloudText` (build a mock session with mini-test structure, call `buildGrammarSpeechText`, assert output includes the readAloudText content)
- Add test: `qg_p4_voice_roles_transfer` speech output explicitly mentions the noun phrase from `focusCue.text`
- Add test in table-render: assert that `GrammarSessionScene` (or its table sub-component) is referenced in at least one structural way for heterogeneous table (can be structural since U5 handles full DOM render)

**Test scenarios:**
- Happy path: mini-test session with readAloudText item produces speech including that text
- Happy path: `qg_p4_voice_roles_transfer` speech output contains the noun phrase
- Integration: table test covers both template types with >0 items each

**Verification:**
- All read-aloud and table tests pass with new scenarios included

---

- U9. **Evidence truth cleanup**

**Goal:** Fix the completion report placeholder and add inventory-level ID cross-checks.

**Requirements:** R6

**Dependencies:** U1–U8 (runs last, captures final state)

**Files:**
- Modify: `docs/plans/james/grammar/questions-generator/grammar-qg-p10-final-completion-report-2026-04-29.md`
- Modify: `scripts/validate-grammar-qg-certification-evidence.mjs`
- Modify: `tests/grammar-qg-p10-evidence-truth.test.js`

**Approach:**
- Replace `final_report_commit: "pending-this-commit"` with the actual commit SHA of the final merged commit
- Add validator check: import render inventory JSON, verify `metadata.contentReleaseId` matches code, verify every `items[].contentReleaseId` matches code
- Add test exercising inventory-level cross-check
- Update completion report to reflect remediation PRs in `implementation_prs` and `post_merge_fix_commits`

**Test scenarios:**
- Happy path: inventory items all have matching release ID
- Error path: inventory with one mismatched item fails validation
- Integration: full validator run passes against the corrected report

**Verification:**
- `validate-grammar-qg-completion-report.mjs` passes on the corrected report
- No `pending` tokens in any frontmatter field

---

## System-Wide Impact

- **Interaction graph:** U4 (scheduler safety) modifies engine.js which is the grammar session state machine — all grammar session operations flow through it. Must not break normal session flow.
- **Error propagation:** Blocked template in direct-launch should return structured error, not throw. Caller (`commands.js`) must handle gracefully.
- **State lifecycle risks:** None — no persistent state changes.
- **API surface parity:** Worker serialisation unchanged. Only internal engine behaviour and evidence artefacts change.
- **Unchanged invariants:** Prompt cue behaviour, read-aloud preference chain, table rendering, and all P6–P9 verify gates remain untouched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `jsdom` as devDependency increases install time | Only in dev; no production bundle impact. Pin exact version. |
| engine.js blocklist checks slow down hot paths | `isTemplateBlocked` is O(1) map lookup — negligible |
| Quality register "automated oracle" may not satisfy "adult review" reading of origin | Honest: mark as `reviewMethod: "automated-oracle"` not "human-reviewed". Flag templates needing human sign-off. |
| Marking matrix variant generation may produce false near-misses | Use the template's own misconception tags to guide mutations — they describe known child errors |

---

## Sources & References

- **Origin document:** [docs/plans/james/grammar/questions-generator/grammar-qg-p10.md](docs/plans/james/grammar/questions-generator/grammar-qg-p10.md)
- **Audit findings:** 10 independent subagent reviews (session context, 2026-04-29)
- **Prior plan:** [docs/plans/2026-04-29-013-feat-grammar-qg-p10-production-quality-lock-plan.md](docs/plans/2026-04-29-013-feat-grammar-qg-p10-production-quality-lock-plan.md)
