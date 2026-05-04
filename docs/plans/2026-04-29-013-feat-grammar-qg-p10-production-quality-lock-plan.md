---
title: "feat: Grammar QG P10 — Production Question Pool Quality Lock"
type: feat
status: active
date: 2026-04-29
origin: docs/plans/james/grammar/questions-generator/grammar-qg-p10.md
---

# Grammar QG P10 — Production Question Pool Quality Lock

## Overview

Lock the 78-template grammar question pool to production quality. P10 is not another feature expansion — it fixes evidence consistency (G0–G2), prompt cue rendering correctness (G5), read-aloud alignment (G6), table-choice test holes (G7), adds distractor auditing, constructed-response marking matrices, and wires the final single-gate verify command. Zero regression: the cumulative P6→P7→P8→P9 chain (4,141 tests) passes unchanged at every commit.

---

## Problem Frame

P9 delivered strong certification infrastructure (evidence manifest, status map, prompt cue fields, review register). But the evidence package has internal inconsistencies (manifest says P8, code says P9), the read-aloud path ignores the new structured fields, prompt cue heuristics produce incorrect targets for noun-phrase templates, and the homogeneous table test targets a non-existent template ID. These gaps block a credible "production-certified" claim.

P10 returns to first principles: every question a child sees must be logically correct, visually unambiguous, correctly marked, accessible, and backed by reproducible evidence.

(see origin: `docs/plans/james/grammar/questions-generator/grammar-qg-p10.md`)

---

## Requirements Trace

- R1. Evidence truth: manifest/inventory/code/report release IDs must agree
- R2. No placeholder tokens in final report frontmatter (`pending`, `todo`, etc.)
- R3. Prompt cue targets must match what the prompt text asks about (word vs phrase vs sentence)
- R4. Read-aloud must consume `readAloudText`/`screenReaderPromptText` when present
- R5. Table-choice row-specific options render, mark, normalise, and speak correctly
- R6. Every selected-response question has exactly one defensible correct answer
- R7. Constructed-response marking is neither over-strict nor over-lenient for KS2
- R8. Blocked/unknown templates cannot reach any learner scheduling surface
- R9. A single `npm run verify:grammar-qg-p10` gate chains all prior + new checks
- R10. Post-deploy certification requires live smoke evidence
- R11. Zero regression: all P6→P7→P8→P9 verify gates pass at every commit
- R12. Render-level tests prove the learner sees correct visual cues (no duplicate sentences)

---

## Scope Boundaries

- No Star, Mega, Hero Mode, Hero Coin, Concordium, reward, or mastery changes
- No template count growth beyond 78 unless the quality register blocks a template and requires replacement
- No new scoring model
- No AI-generated "adult review" text presented as human evidence
- No cosmetic-only redesign
- No changes to Spelling, Punctuation, Arithmetic, Reading, or Reasoning subjects

### Deferred to Follow-Up Work

- Post-deploy production smoke execution: separate operational step after deployment (U10)
- Template expansion (U12): only after U0–U11 pass; draft-only entries that must earn their own certification

---

## Context & Research

### Relevant Code and Patterns

- `worker/src/subjects/grammar/content.js:8100` — `GRAMMAR_CONTENT_RELEASE_ID = 'grammar-qg-p9-2026-04-29'`
- `worker/src/subjects/grammar/content.js:7562-7680` — prompt cue enrichment (CUE_PATTERNS, buildPromptParts, focusCue, readAloudText)
- `worker/src/subjects/grammar/certification-status.js` — fail-closed CERTIFICATION_STATUS_MAP
- `src/subjects/grammar/speech.js:129` — `buildGrammarSpeechText()` (ignores `readAloudText`)
- `src/subjects/grammar/components/GrammarSessionScene.jsx:684` — React `promptParts` renderer
- `scripts/validate-grammar-qg-completion-report.mjs` — frontmatter/denominator/release validation
- `scripts/validate-grammar-qg-certification-evidence.mjs` — oracle window/manifest validation
- `scripts/audit-grammar-content-quality.mjs` — content quality audit (hard-fail + advisory tiers)
- `scripts/generate-grammar-qg-quality-inventory.mjs` — inventory generator
- `scripts/generate-grammar-qg-certification-manifest.mjs` — manifest generator
- `reports/grammar/grammar-qg-p9-certification-manifest.json` — stale `contentReleaseId: "grammar-qg-p8-2026-04-29"`
- `reports/grammar/grammar-qg-p9-certification-status-map.json` — all 78 approved

### Institutional Learnings

- **Evidence-locked certification** (docs/solutions/architecture-patterns/evidence-locked-production-certification-2026-04-29.md): manifest-driven verification, cumulative verify chain, fail-closed scheduler, additive serialisation
- **Production marker as oracle** (grammar-qg-p8): use `markByAnswerSpec()` as distractor/golden oracle — catches defects string comparison misses
- **Punctuation QG P7 trust hardening**: gate-as-pure-function, empty-fails invariant, direction-aware validation
- **Grammar QG P5 machine-verifiable release**: one-command gate, hard-fail vs advisory tiers, frozen fixture strategy
- **TTS/audio contract** (spelling-audio-cache-contract): two-source-of-truth assertion, content-addressed hashing

### External References

- No external research needed — local patterns for certification, prompt rendering, TTS, and scheduling are mature and well-documented across P5–P9

---

## Key Technical Decisions

- **Additive prompt cue contract**: `promptText` remains alongside `promptParts`/`focusCue`/`readAloudText`. Clients that don't understand structured parts fallback safely. P10 fixes the targets inside the existing additive model — no schema break.
- **markByAnswerSpec() as distractor oracle**: Run every distractor through the production marker; assert `correct: false`. Run every golden answer; assert `correct: true`. This is the P8 pattern — it catches defects string comparison misses.
- **Certification status map sourced from quality register**: P10 switches from static all-approved to register-driven status. Templates without explicit approval revert to blocked (fail-closed).
- **Verify chain composition**: `verify:grammar-qg-p10` = `verify:grammar-qg-p9` + P10-specific gates. Total expected to exceed 5,000 tests.
- **Prompt cue target contract**: Replace heuristic `extractUnderlinedWord` with template-owned `promptCue` metadata that explicitly declares what text is the target, eliminating whole-sentence-underline bugs.

---

## Open Questions

### Resolved During Planning

- **Which template ID should the homogeneous table test use?** → `sentence_type_table` (confirmed at content.js:1936). The P9 test erroneously targets `sentence_function_classify` which does not exist.
- **Should `buildGrammarSpeechText` prefer `readAloudText` or `screenReaderPromptText`?** → Prefer `readAloudText` (human-readable spoken form). Fallback to `screenReaderPromptText` if no `readAloudText`. Final fallback to `promptText + inputSpec`.

### Deferred to Implementation

- Exact set of templates requiring `promptCue` metadata additions — depends on running the new prompt cue audit against all 78 × 30 combinations
- Precise marking matrix coverage for each constructed-response template — depends on generating items and reviewing the output
- Which templates (if any) receive `blocked` status in the quality register — depends on adult review findings during U5

---

## Implementation Units

<!-- Unit IDs match the origin document (grammar-qg-p10.md Section 6). The suggested
     execution order differs from U-ID order — see Section 10 of the origin document:
     U0 → U2 → U3 → U4 → U1 → U5 → U6 → U7 → U8 → U9 → U10 → U11 → U12.
     This prevents producing certification reports before learner-facing quality is locked. -->

<!-- Global meta-requirements that apply to ALL units (not cited per-unit):
     R11 (zero regression) — every unit must leave the P6→P7→P8→P9 verify chain passing.
     R9 (single gate) — delivered by U11 but applies as cumulative discipline throughout. -->

- U0. **Evidence truth reset**

**Goal:** Fix the evidence foundation so all release IDs agree before touching content.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `scripts/generate-grammar-qg-certification-manifest.mjs`
- Modify: `scripts/validate-grammar-qg-completion-report.mjs`
- Modify: `scripts/validate-grammar-qg-certification-evidence.mjs`
- Create: `reports/grammar/grammar-qg-p10-certification-manifest.json`
- Create: `tests/grammar-qg-p10-evidence-truth.test.js`

**Approach:**
- Regenerate the certification manifest with `contentReleaseId` matching `GRAMMAR_CONTENT_RELEASE_ID` from code
- Extend the certification evidence validator to cross-check: report release ID, manifest release ID, inventory summary release ID, every inventory item release ID, `GRAMMAR_CONTENT_RELEASE_ID` import, and production smoke evidence release ID when present
- Add validator rule: reject any final report with `pending`, `todo`, `tbc`, `tbd`, `unknown`, `n/a`, or compound variants in release-evidence frontmatter
- Fix the completion report validator's inline `[]` YAML parsing (accept `post_merge_fix_commits: []` as empty list)
- Note: R2 here fixes P9 report stale frontmatter and hardens the validator; the P10 report itself is validated in U11

**Patterns to follow:**
- `scripts/validate-grammar-qg-completion-report.mjs` existing frontmatter extraction
- `scripts/validate-grammar-qg-certification-evidence.mjs` seed window validation

**Test scenarios:**
- Happy path: P10 manifest + P10 report with matching release IDs passes both validators
- Error path: manifest with `contentReleaseId: "grammar-qg-p8-2026-04-29"` when code exports `grammar-qg-p10-2026-04-29` fails evidence validator
- Error path: report with `final_report_commit: "pending-this-commit"` fails completion-report validator
- Error path: report with `post_merge_fix_commits: []` (inline) passes YAML parsing (regression fix)
- Edge case: compound placeholder like `pending-report-commit` is rejected
- Edge case: valid hex SHA containing "pending" substring (e.g., `7pendinga3f`) is NOT rejected
- Integration: cross-check validator imports `GRAMMAR_CONTENT_RELEASE_ID` from content.js and compares

**Verification:**
- `node scripts/validate-grammar-qg-completion-report.mjs` fails on current P9 report (stale frontmatter)
- `node scripts/validate-grammar-qg-certification-evidence.mjs` fails on current P9 manifest (stale release ID)
- New P10 manifest passes both validators

---

- U1. **Canonical learner-render inventory**

**Goal:** Produce a canonical inventory of what learners actually see and hear for every template × seed.

**Requirements:** R1, R12

**Dependencies:** U2, U3 (must be complete so inventory captures corrected cues and read-aloud)

**Files:**
- Create: `scripts/generate-grammar-qg-render-inventory.mjs`
- Create: `reports/grammar/grammar-qg-p10-render-inventory.json`
- Create: `reports/grammar/grammar-qg-p10-render-inventory-redacted.md`
- Create: `tests/grammar-qg-p10-render-inventory.test.js`

**Approach:**
- For each template × seed (78 × 30 = 2,340 items), generate and serialise the question, then capture: template ID, seed, concept IDs, input type, rendered prompt text, resolved `promptParts` display sequence, focus cue target, screen-reader prompt, read-aloud text (from the corrected speech contract), visible options/rows/fields, row-specific options, expected answer (internal-only), feedback summary (internal-only), certification status
- Produce redacted version stripping answer internals
- Validate: release ID matches code, item count = 2,340, redacted has no answer fields

**Patterns to follow:**
- `scripts/generate-grammar-qg-quality-inventory.mjs` existing structure
- P9 inventory JSON shape for backwards compatibility

**Test scenarios:**
- Happy path: render inventory contains exactly 2,340 items
- Happy path: every item has non-empty rendered prompt text
- Happy path: redacted version has zero `expectedAnswer`/`goldenAnswers` fields
- Error path: inventory release ID mismatch with code release ID fails validation
- Edge case: items with `promptParts` have consistent rendered text (two-source-of-truth check)

**Verification:**
- `node scripts/generate-grammar-qg-render-inventory.mjs --seeds=1..30 --release=p10` produces both files
- Item count = 2,340
- Redacted file passes redaction check

---

- U2. **Explicit prompt target contract**

**Goal:** Replace heuristic prompt-cue inference with explicit template-owned cue metadata so cue targets are always correct.

**Requirements:** R3, R12

**Dependencies:** U0

**Files:**
- Modify: `worker/src/subjects/grammar/content.js` (prompt cue enrichment section, lines 7555–7680)
- Create: `scripts/audit-grammar-prompt-cues.mjs`
- Create: `tests/grammar-qg-p10-prompt-cue-contract.test.js`

**Approach:**
- Extend the `enrichPromptCue()` function to accept explicit template-owned `promptCue` metadata when present, falling back to heuristic detection only for templates without explicit metadata
- For templates with "underlined noun phrase" prompts (`qg_p4_voice_roles_transfer`, `qg_p4_word_class_noun_phrase_transfer`, `qg_p3_noun_phrases_explain`), add explicit `targetText` that names the actual target phrase/word, not the whole sentence
- Fix `buildPromptParts()` duplication: when prompt already contains the sentence, do not append it again
- Enforce rule: a question with `promptParts` must have either `focusCue` or an explicit `cueNotRequiredReason`
- Create audit script that validates all 78 × 30 items: no duplicated prompt target, no whole-sentence underline when prompt asks for word/phrase, cue metadata consistent with rendered output

**Execution note:** Start with a characterisation test capturing the current output for high-risk templates (seeds 1–5), then fix the cue logic, then verify the characterisation tests show the intended improvement.

**Patterns to follow:**
- Existing `CUE_PATTERNS` detection at content.js:7562
- `buildPromptParts()` structure at content.js:7591
- P9 `focusCue` field shape: `{ type, text }`

**Test scenarios:**
- Happy path: `word_class_underlined_choice` seed 1–5 produces `focusCue.text` = single word (not whole sentence)
- Happy path: `qg_p4_voice_roles_transfer` seed 1–5 produces `focusCue.text` = noun phrase (not whole sentence)
- Happy path: `qg_p4_word_class_noun_phrase_transfer` seed 3 produces `focusCue.text` = target word within phrase
- Edge case: `qg_p3_noun_phrases_explain` produces underline on the noun phrase only
- Error path: audit script fails if any prompt contains "underlined word" but `focusCue.text` has whitespace indicating a phrase/sentence
- Error path: audit fails if `promptParts` contains duplicate sentence content
- Integration: all existing P9 learner-surface tests still pass (no regression to structural cue shape)

**Verification:**
- `node scripts/audit-grammar-prompt-cues.mjs --seeds=1..30 --json` passes with 0 failures
- All P9 prompt cue tests pass unchanged

---

- U3. **Read-aloud and accessibility alignment**

**Goal:** Make `buildGrammarSpeechText()` consume the structured prompt cue contract instead of ignoring `readAloudText`.

**Requirements:** R4

**Dependencies:** U2

**Files:**
- Modify: `src/subjects/grammar/speech.js` (`buildGrammarSpeechText` function)
- Modify: `tests/grammar-speech.test.js`
- Create: `tests/grammar-qg-p10-read-aloud-alignment.test.js`

**Approach:**
- In `buildGrammarSpeechText()`, prefer `item.readAloudText` when present (it already includes the prompt + cue description in spoken form). Fallback chain: `readAloudText` → `screenReaderPromptText` → existing `promptText + inputSpec` path
- For `table_choice` with row-specific options: announce row labels followed by their specific choices, not just global columns
- Ensure read-aloud does not duplicate the sentence (mirrors U2 fix in the speech domain)
- Add test coverage for mini-test current-item read-aloud using the structured fields

**Patterns to follow:**
- `buildGrammarSpeechText()` existing structure (speech.js:129)
- `inputSpecSpeechParts()` for table_choice handling (speech.js:54)
- Two-source-of-truth assertion from spelling audio cache contract

**Test scenarios:**
- Happy path: `buildGrammarSpeechText` for `word_class_underlined_choice` item mentions which word is underlined
- Happy path: `buildGrammarSpeechText` for `qg_p4_voice_roles_transfer` item mentions which noun phrase is underlined
- Happy path: row-specific table speech lists per-row choices (not just global columns)
- Edge case: item with `readAloudText` but no `promptParts` still produces correct speech
- Edge case: mini-test mode uses current mini-test item's `readAloudText`
- Error path: item with empty `readAloudText` string falls back to `screenReaderPromptText`
- Integration: existing speech tests pass unchanged (no regression)

**Verification:**
- Read-aloud output for cue-based templates includes the target word/phrase
- All existing `tests/grammar-speech.test.js` tests pass

---

- U4. **Table-choice and multi-field production UX**

**Goal:** Fix the homogeneous table test target and ensure row-specific tables render, mark, and normalise correctly.

**Requirements:** R5, R12

**Dependencies:** U2

**Files:**
- Modify: `tests/grammar-qg-p9-table-choice-contract.test.js`
- Create: `tests/grammar-qg-p10-table-render.test.js`
- Modify: `src/subjects/grammar/components/GrammarSessionScene.jsx` (table rendering section, if needed)

**Approach:**
- Fix homogeneous table test: change `HOMOGENEOUS_ID` from `sentence_function_classify` to `sentence_type_table`
- Add assertion: every generated test loop must fail if it checks zero cases (empty-fails invariant)
- Validate that heterogeneous templates show only relevant options per row in React render
- Normalise response values per row in both session and mini-test paths
- Ensure wrong-row option values are rejected in marking

**Patterns to follow:**
- `tests/grammar-qg-p9-table-choice-contract.test.js` existing structure
- `GrammarSessionScene.jsx` table rendering section
- Empty-fails invariant from punctuation QG P7

**Test scenarios:**
- Happy path: homogeneous table (`sentence_type_table`) generates ≥1 test case and all rows share same columns
- Happy path: heterogeneous table (`qg_p4_voice_roles_transfer`) shows only relevant options per row
- Error path: submitting a choice from the wrong row's option set is rejected by marking
- Edge case: test loop that generates 0 questions for a template ID fails with descriptive error
- Integration: React render for heterogeneous table shows row-local options (not global columns for all rows)

**Verification:**
- `node --test tests/grammar-qg-p9-table-choice-contract.test.js` passes with corrected ID
- Zero test cases from zero-case loops

---

- U5. **Full question quality register**

**Goal:** Create real template quality decisions backed by concrete reviewed examples.

**Requirements:** R6, R7

**Dependencies:** U1, U2

**Files:**
- Create: `scripts/generate-grammar-qg-quality-register.mjs`
- Create: `reports/grammar/grammar-qg-p10-quality-register.json`
- Create: `reports/grammar/grammar-qg-p10-quality-register.md`
- Create: `tests/grammar-qg-p10-quality-register.test.js`

**Approach:**
- Each of 78 templates gets a decision: `approved`, `approved_after_fix`, `blocked`, or `retire_candidate`
- Each entry includes: reviewer method, reviewed seed window, concrete reviewed examples (not template-derived placeholders), answerability/grammar-logic/distractor/marking/feedback/accessibility judgements
- High-risk templates (mixed-transfer, constructed-response, visual-cue, manual-review, formal/informal, subject/object/voice) require deeper notes
- Validation: no placeholder notes, approved templates have enough evidence for another adult to understand
- Note: Quality register *produces* approval/block decisions. U8 *enforces* those decisions in the scheduler.

**Patterns to follow:**
- `scripts/generate-grammar-qg-review-register.mjs` existing structure (P9 review register)
- Empty-fails invariant: missing decision = blocked

**Test scenarios:**
- Happy path: register has exactly 78 entries (one per template)
- Happy path: every entry has a valid decision value
- Error path: entry with placeholder note text (e.g., "prompts clear, answers unambiguous") without concrete example fails
- Error path: entry with decision `blocked` or `retire_candidate` lists severity and concrete reason
- Edge case: `approved_after_fix` entries reference the fix commit or unit that resolved the issue

**Verification:**
- Register covers all 78 templates with no missing decisions
- No placeholder notes pass validation

---

- U6. **Distractor and ambiguity audit**

**Goal:** Prove every selected-response question has exactly one defensible correct answer.

**Requirements:** R6

**Dependencies:** U2 (needs corrected prompt cues to verify answer/prompt alignment)

**Files:**
- Create: `scripts/audit-grammar-distractor-quality.mjs`
- Create: `reports/grammar/grammar-qg-p10-distractor-audit.json`
- Create: `tests/grammar-qg-p10-distractor-audit.test.js`

**Approach:**
- For each selected-response template × seed, classify every option: correct answer, distractor (why wrong), whether defensible under another reading, whether the prompt removes that alternative reading
- Use `markByAnswerSpec()` as the oracle: run every distractor through the production marker and assert `correct: false`; run every golden answer and assert `correct: true`
- Flag: checkbox questions must have complete correct set with no missing defensible options
- Flag: any plausible alternative answer must be reworded, removed, or explicitly accepted
- Note: U6 can run in parallel with U5 — it uses the production marker, not the quality register

**Patterns to follow:**
- P8 oracle pattern: `markByAnswerSpec()` as quality oracle (docs/solutions)
- `scripts/audit-grammar-content-quality.mjs` existing hard-fail/advisory tier classification
- Tier: distractor-passes-marker = S0 hard-fail; plausible-alternative-reading = S1 advisory

**Test scenarios:**
- Happy path: all 58 selected-response templates × 30 seeds have exactly one option marked correct by the marker
- Error path: distractor that `markByAnswerSpec()` accepts as correct triggers S0 failure
- Error path: no option marked correct by the marker triggers S0 failure
- Edge case: checkbox template with multiple correct answers validates complete correct set
- Integration: audit script JSON output validates against schema

**Verification:**
- `node scripts/audit-grammar-distractor-quality.mjs --seeds=1..30 --json` passes with 0 S0/S1

---

- U7. **Constructed-response marking matrix**

**Goal:** Validate marking for every constructed-response template is neither over-strict nor over-lenient.

**Requirements:** R7

**Dependencies:** U2 (needs corrected prompt cues for marking/prompt consistency)

**Files:**
- Create: `scripts/generate-grammar-marking-matrix.mjs`
- Create: `reports/grammar/grammar-qg-p10-marking-matrix.json`
- Create: `reports/grammar/grammar-qg-p10-marking-matrix.md`
- Create: `tests/grammar-qg-p10-marking-matrix.test.js`

**Approach:**
- For each of 20 constructed-response templates, generate: golden answers, accepted variants, near misses, raw prompt/no-op probes, smart punctuation variants, case/whitespace variants, common KS2 child mistakes, expected score, feedback and misconception tag
- Validate: all golden/accepted variants mark correct; near misses and raw prompts do not mark fully correct; smart punctuation handled symmetrically; answer spec not so strict that correct KS2 answer is rejected; not so loose that grammar mistake is accepted
- Note: U7 can run in parallel with U5 and U6 — it uses the production marker directly

**Patterns to follow:**
- `markByAnswerSpec()` production marker as oracle
- `normaliseSmartPunctuation()` from answer-spec.js
- P8 oracle pattern: defence-in-depth via three layered rules

**Test scenarios:**
- Happy path: every golden answer for all 20 templates marks `correct: true`
- Happy path: every accepted variant marks `correct: true`
- Error path: near-miss that should fail marks `correct: false`
- Error path: raw prompt submission (empty or prompt echo) marks `correct: false`
- Edge case: curly quotes vs straight quotes both accepted when template allows
- Edge case: trailing whitespace or extra space does not reject a correct answer

**Verification:**
- `node scripts/generate-grammar-marking-matrix.mjs --json` produces valid matrix
- All marking tests pass

---

- U8. **Scheduler safety and production blocklist**

**Goal:** Drive certification status from the P10 quality register, not a static all-approved assertion. Enforce that blocked/unknown templates cannot reach learners.

**Requirements:** R8

**Dependencies:** U5

**Files:**
- Modify: `worker/src/subjects/grammar/certification-status.js`
- Create: `reports/grammar/grammar-qg-p10-certification-status-map.json` (new file; P9 map left unchanged for P9 verify chain)
- Create: `tests/grammar-qg-p10-scheduler-safety.test.js`

**Approach:**
- Generate certification status map from P10 quality register decisions (approved → approved, blocked → blocked, retire_candidate → blocked)
- Unknown templates remain blocked by default (existing fail-closed behaviour preserved)
- Blocked templates excluded from: smart practice queue, mini-test pack, retry queue rehydration, similar problem generation, direct template launch
- Debug/review bypass not available in normal learner mode
- Relationship to U5: Quality register (U5) produces human-reviewed decisions; this status map (U8) is the derived scheduler-facing lookup table

**Patterns to follow:**
- `worker/src/subjects/grammar/certification-status.js` existing `isTemplateBlocked()` + `_testBlockOverride`
- `tests/grammar-qg-p9-blocklist-scheduler.test.js` existing scheduler safety tests
- Gate-as-pure-function pattern (punctuation QG P7)

**Test scenarios:**
- Happy path: approved template is not blocked, can enter all scheduling surfaces
- Happy path: synthetic uncertified template is blocked by default (fail-closed)
- Error path: blocked template cannot enter smart practice queue
- Error path: blocked template cannot enter mini-test pack
- Error path: blocked template cannot enter retry queue rehydration
- Error path: direct template launch for blocked template in learner mode returns clear error
- Edge case: debug/review bypass works only with explicit review flag
- Integration: status map key count matches GRAMMAR_TEMPLATE_METADATA length

**Verification:**
- All blocked templates provably excluded from every learner scheduling surface
- All P9 blocklist tests pass unchanged

---

- U9. **Render-level browser smoke tests**

**Goal:** Validate rendered learner surface for representative questions, not just object shape.

**Requirements:** R12

**Dependencies:** U2, U4

**Files:**
- Create: `tests/grammar-qg-p10-render-surface.test.js`
- Modify: `tests/react-grammar-surface.test.js` (extend if needed)

**Approach:**
- React render test for `word_class_underlined_choice`: one visible sentence, target word underlined, no duplicate sentence
- React render test for `qg_p4_voice_roles_transfer`: target noun phrase visibly marked, not whole sentence
- React render test for `qg_p4_word_class_noun_phrase_transfer`: intended word/phrase target marked correctly
- React render test for homogeneous table (`sentence_type_table`) and heterogeneous table
- Keyboard navigation check for radio groups, checkbox lists, multi-field groups, textarea, table rows
- Every test must fail if it checks zero generated cases (empty-fails invariant)

**Patterns to follow:**
- `tests/react-grammar-surface.test.js` existing React render test structure
- `tests/grammar-qg-p9-learner-surface.test.js` prompt cue structural tests

**Test scenarios:**
- Happy path: `word_class_underlined_choice` renders exactly one `.prompt-underline` span containing only the target word
- Happy path: `qg_p4_voice_roles_transfer` renders underline on noun phrase, not entire sentence
- Happy path: homogeneous table renders global columns for all rows
- Happy path: heterogeneous table renders different options per row
- Error path: test fails if zero questions generated for target template
- Edge case: 375px mobile-width layout constraints respected (no overflow)
- Integration: keyboard tab order hits all interactive elements in expected sequence

**Verification:**
- `node --test tests/grammar-qg-p10-render-surface.test.js` passes with no zero-case loops

---

- U10. **Production smoke and deployed release proof**

**Goal:** Prove the deployed app serves correct grammar items after deployment.

**Requirements:** R10

**Dependencies:** U0–U9 (runs post-deploy)

**Files:**
- Create: `scripts/grammar-production-smoke-post-deploy.mjs`
- Create: `reports/grammar/grammar-production-smoke-grammar-qg-p10-2026-04-29.json` (generated post-deploy)
- Create: `reports/grammar/grammar-qg-p10-post-deploy-smoke.md` (generated post-deploy)

**Approach:**
- Smoke proves: deployed Worker reports correct release, learner can start session, certified template served, serialisation contains no answer internals, valid answer submittable, wrong answer gives feedback without reward leak, blocked templates not served
- Evidence records: URL, timestamp, command, fixture learner, release ID, item IDs, result shape, failure details
- Before smoke: `CERTIFIED_PRE_DEPLOY_WITH_LIMITATIONS` allowed. After: `CERTIFIED_POST_DEPLOY` only if smoke passes

**Test expectation: none — this unit produces a script for post-deploy execution, not automated test coverage. Validation is via the U11 verify gate (see below) which requires smoke evidence when post-deploy certification is claimed.**

**Patterns to follow:**
- `tests/grammar-production-smoke.test.js` existing repository-level smoke pattern
- P9 `post_deploy_smoke_evidence: not-run` placeholder

**Verification:**
- Script executes against deployed Worker and produces evidence JSON
- Validator accepts the evidence file when present and rejects post-deploy claims without it

---

- U11. **Final report validator as the single gate**

**Goal:** Wire `npm run verify:grammar-qg-p10` as the single authoritative gate.

**Requirements:** R9

**Dependencies:** U0–U9

**Files:**
- Modify: `package.json` (add `verify:grammar-qg-p10` script)
- Create: `tests/grammar-qg-p10-final-gate.test.js`

**Approach:**
- Chain: `verify:grammar-qg-p9` (which chains P8→P7→P6) + P10-specific tests
- P10 tests include: evidence truth, prompt cue audit, read-aloud alignment, table-choice contract, render inventory, quality register, distractor audit, marking matrix, scheduler safety, render surface
- Final report fails if: any release ID mismatch, any placeholder in frontmatter, stale evidence artefact, item count mismatch, `draft_only` claimed as approved without register entry, S0/S1 open, post-deploy claimed without smoke evidence

**Patterns to follow:**
- `package.json` existing `verify:grammar-qg-p9` chain pattern
- Cumulative chain: P10 gate expected to reach 5,000+ tests total

**Test scenarios:**
- Happy path: clean P10 state passes entire verify chain
- Error path: removing one P10 evidence artefact fails the gate
- Error path: reverting to P9 stale manifest fails the gate
- Integration: P6→P7→P8→P9 tests all still pass within the chain (zero regression proof)

**Verification:**
- `npm run verify:grammar-qg-p10` exits 0 from clean checkout
- Total test count exceeds 5,000

---

- U12. **Expansion only after lock**

**Goal:** Only after U0–U11 pass, optionally add new question variants where evidence shows weakness.

**Requirements:** (none — this is optional post-lock work)

**Dependencies:** U0–U11

**Files:**
- Modify: `worker/src/subjects/grammar/content.js` (template bank additions, if needed)
- Modify: `reports/grammar/grammar-qg-p10-quality-register.json` (new entries as `draft_only`)

**Approach:**
- Add variants only where quality register or calibration evidence shows real weakness
- New variants enter as `draft_only` and remain blocked until passing the same P10 review/evidence gates
- Expansion must not break any existing test or change behaviour of existing 78 templates

**Test expectation: none — expansion is optional and only proceeds if evidence demands it. Any added templates would be tested via the existing P10 gates (prompt cue audit, distractor audit, marking matrix) as part of their own certification cycle.**

**Verification:**
- Existing 78 templates unchanged
- `npm run verify:grammar-qg-p10` still passes after any expansion

---

## Suggested Execution Order

Per origin document Section 10, execution order differs from U-ID numbering to prevent producing certification reports before learner-facing quality is locked:

```
U0 → U2 → U3 → U4 → U1 → U5 → U6 → U7 → U8 → U9 → U10 → U11 → U12
           ↕              ↑         ↕    ↕
      (parallel: U6, U7 can start after U2 in parallel with U5)
```

1. **U0** — evidence truth reset (foundation)
2. **U2** — prompt cue target contract (fix known cue failures)
3. **U3** — read-aloud alignment (consumes U2 outputs)
4. **U4** — table-choice test + render hardening (parallel with U3)
5. **U1** — render inventory (captures corrected cues from U2+U3)
6. **U5** — quality register (uses inventory for concrete reviewed examples)
7. **U6** — distractor audit (can parallel with U5; uses marker, not register)
8. **U7** — marking matrix (can parallel with U5, U6; uses marker directly)
9. **U8** — scheduler status map (needs U5 register decisions)
10. **U9** — render surface tests (needs U2 + U4 content corrections in place)
11. **U10** — production smoke (post-deploy only)
12. **U11** — final verify gate (wires everything together)
13. **U12** — optional expansion (only after U0–U11 pass)

---

## System-Wide Impact

- **Interaction graph:** Prompt cue changes (U2) affect content.js serialisation → GrammarSessionScene.jsx rendering → speech.js read-aloud → tests. All three consumers must agree on the `focusCue`/`promptParts` contract.
- **Error propagation:** Certification validator failures should produce structured JSON output with specific field-level errors, not generic "validation failed" messages. This feeds CI gate reporting.
- **State lifecycle risks:** No persistent state changes. Certification artefacts are read-only report files. `CERTIFICATION_STATUS_MAP` is computed at module load from template metadata.
- **API surface parity:** Worker serialisation adds fields but never removes. Client `promptParts` renderer already handles unknown `kind` values via `default:` case.
- **Integration coverage:** U9 render tests prove the full chain: content.js → serialise → React render → DOM output. Unit tests for speech.js and content.js alone do not catch rendering bugs.
- **Unchanged invariants:** Star, Mega, Hero Mode, Concordium, reward semantics unchanged. Template count stays at 78 unless quality register blocks one. All P6–P9 verify gates continue to pass.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Prompt cue fix changes serialisation shape, breaking existing P9 tests | Characterisation-first approach in U1: capture current output, fix incrementally, verify existing tests adapt or are explicitly updated |
| Quality register blocks templates that learners currently see | Fail-closed is correct — a blocked template is better than a broken one. Monitor scheduler coverage after any block. |
| Read-aloud preference change causes different speech output | Fallback chain preserves existing behaviour when `readAloudText` is absent. Only items enriched by P9+ get new speech. |
| Cumulative verify chain takes too long (>5,000 tests) | Tests are fast (no I/O, no network). P9 chain runs in <30s. P10 additions are structural/assertion tests. |
| Production smoke (U10) depends on deployment | U10 is post-deploy by design. Pre-deploy certification is valid without it. |

---

## Sources & References

- **Origin document:** [docs/plans/james/grammar/questions-generator/grammar-qg-p10.md](docs/plans/james/grammar/questions-generator/grammar-qg-p10.md)
- Related code: `worker/src/subjects/grammar/content.js`, `certification-status.js`, `src/subjects/grammar/speech.js`
- Related plans: `docs/plans/2026-04-29-011-feat-grammar-qg-p9-evidence-locked-certification-plan.md`
- Institutional learnings: `docs/solutions/architecture-patterns/evidence-locked-production-certification-2026-04-29.md`
