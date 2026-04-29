---
title: "feat: Grammar QG P4 deterministic depth and mixed-transfer expansion"
type: feat
status: active
date: 2026-04-28
origin: docs/plans/james/grammar/questions-generator/grammar-qg-p4.md
previous_plan: docs/plans/james/grammar/questions-generator/grammar-qg-p3.md
---

# feat: Grammar QG P4 deterministic depth and mixed-transfer expansion

## Overview

Grammar QG P4 moves the question generator from coverage completeness to depth and transfer quality. It expands explanation case banks to eliminate shallow repeat patterns, repairs legacy repeated generated variants, adds eight deterministic mixed-transfer templates covering all 18 concepts across cross-concept tasks, and hardens audit visibility for case-bank depth.

This is a quality release, not a volume release.

---

## Problem Frame

QG P3 proved breadth: every Grammar concept now has deterministic `explain` coverage. Four quality gaps remain:

1. **Shallow explanation depth** — many P3 explanation families have only 6-7 cases, producing repeats within small seed windows.
2. **Legacy repeated variants** — 12 repeated generated variants across 6 families (`proc_semicolon_choice`, `proc_colon_list_fix`, `proc_dash_boundary_fix`, `proc_hyphen_ambiguity_choice`, `proc2_modal_choice`, `proc2_formality_choice`, `proc3_clause_join_rewrite`) in the default `[1,2,3]` audit window.
3. **No mixed-transfer practice** — mastery evidence is still concept-local; learners cannot prove they understand how concepts interact.
4. **No depth visibility** — the audit tracks template count and coverage but not per-family case-bank depth or deep-seed repeat rates.

(see origin: `docs/plans/james/grammar/questions-generator/grammar-qg-p4.md`)

---

## Requirements Trace

- R1. Expand reviewed explanation case banks to at least 8 distinct visible cases per family where practical.
- R2. Eliminate legacy repeated generated variants from default audit window `[1,2,3]`, or record explicit waivers.
- R3. Add 8 deterministic mixed-transfer templates covering all 18 Grammar concepts across cross-concept tasks.
- R4. Every new P4 template uses `requiresAnswerSpec: true`, declared `answerSpecKind`, stable `generatorFamilyId`, and `tags: ['qg-p4', 'mixed-transfer']`.
- R5. Learner-facing read models hide all answer-spec internals for P4 templates.
- R6. Existing selection, focus mode, smart practice, SATS mini-test, and freshness behaviour unchanged.
- R7. Audit reports mixed-transfer coverage, case-bank depth, and deep-seed repeat rates.
- R8. Production smoke exercises at least one P4 mixed-transfer read-model redaction path.
- R9. P1/P2/P3 fixtures remain immutable; P4 gets its own fixture.
- R10. No runtime AI generation, marking, or answer-key creation.
- R11. No changes to Star, Mega, monster, reward, Parent Hub, or confidence semantics.

---

## Scope Boundaries

- Do not add runtime AI generation, marking, or answer keys.
- Do not introduce free-text explanation scoring.
- Do not change Star, Mega, monster, reward, Parent Hub, or confidence semantics.
- Do not add a new Grammar learner UI mode.
- Do not add a CMS or template DSL.
- Do not weaken the signature audit to hide repetition.
- Do not claim post-deploy smoke evidence unless a logged-in production smoke was actually run.

### Deferred to Follow-Up Work

- Release automation and operational governance (QG P5 scope).
- Real learner telemetry and calibration (QG P6 scope).
- Production smoke as a proper release gate.

---

## Context & Research

### Relevant Code and Patterns

- `worker/src/subjects/grammar/content.js` — all template definitions, P3_EXPLANATION_CASES data, `buildP3ExplanationChoiceQuestion()` helper, `makeBaseQuestion()`, `mulberry32()` RNG, variant signature generation.
- `worker/src/subjects/grammar/answer-spec.js` — `exactAnswerSpec()`, `multiFieldAnswerSpec()`, `validateAnswerSpec()`.
- `worker/src/subjects/grammar/selection.js` — `weightFor()` with multi-skillId handling (lines 220-222, 264-270), `focusAwarePool()`, variant freshness (lines 254-262).
- `worker/src/subjects/grammar/engine.js` — `applyGrammarAttemptToState()` (lines 1562-1729), scoring quality tiers.
- `worker/src/subjects/grammar/read-models.js` — `buildGrammarReadModel()`, `safeSession()`.
- `scripts/audit-grammar-question-generator.mjs` — `buildSignatureAudit()`, `buildExplainCoverage()`, `buildAnswerSpecAudit()`.
- `tests/grammar-qg-p3-explanation.test.js` — pattern for P3 explanation testing (seeds, redaction, signature stability).
- `tests/grammar-production-smoke.test.js` — forbidden-key oracle scanning.
- `tests/grammar-question-generator-audit.test.js` — audit assertion pattern.
- `tests/fixtures/grammar-legacy-oracle/grammar-qg-p3-baseline.json` — fixture format (releaseId + flat metrics + conceptCoverage array).
- `tests/fixtures/grammar-functionality-completeness/grammar-qg-p3-baseline.json` — fixture format (contentReleaseId + nested contentBaseline).

### Institutional Learnings

- **P3 read-model lesson**: Asserting internal serialised question shape is insufficient — tests must assert the learner-facing read model boundary directly via the shared forbidden-key oracle.
- **Variant signature design**: Hash is computed on normalised `stemHtml` + sorted options + questionType + sorted skillIds. Option shuffling alone does not produce a new signature. This is correct and must be preserved.
- **Multi-concept selection**: Templates with multiple `skillIds` already work in selection — concept freshness applies when ALL skillIds were seen within horizon; average strength determines baseline weight.
- **Legacy vs strict tagging**: Strict variant enforcement applies only to templates tagged `qg-p1` or `qg-p3`. P4 templates should be tagged `qg-p4` and will need the same strict enforcement.

---

## Key Technical Decisions

- **P4 strict enforcement**: Tag P4 templates with `qg-p4` and add `qg-p4` to the strict-variant tag list in `buildSignatureAudit()` so P4 templates get the same zero-repeat guarantee as P1/P3.
- **Explanation expansion in-place**: Deepen P3_EXPLANATION_CASES arrays rather than creating new template objects — this preserves existing template IDs, generatorFamilyIds, and test coverage.
- **Mixed-transfer templates use `buildP4MixedTransferQuestion()` helper**: New helper follows same pattern as `buildP3ExplanationChoiceQuestion()` but supports both `exact` and `multiField` answer specs.
- **Case-bank depth measurement**: Add a `generatedCaseDepthByFamily` audit field that counts distinct variant signatures per generator family over a configurable seed window.
- **No scheduler changes needed**: Multi-concept templates already participate in selection via existing `skillIds` multi-membership; freshness and focus mode handle them correctly. Tests will verify this.
- **Fixture additive strategy**: Create `grammar-qg-p4-baseline.json` for both fixture dirs; do not modify P1/P2/P3 fixtures.

---

## Open Questions

### Resolved During Planning

- **Should P4 templates get strict or legacy enforcement?** → Strict (tagged `qg-p4`), same as P1/P3. This is the whole point of removing repeats.
- **How should multi-field answer specs work?** → `multiFieldAnswerSpec()` already exists in `answer-spec.js`. The `classify` question type with `table_choice` inputSpec is the established pattern for multi-field items.
- **Do we need a new question type?** → No. `choose` and `classify` already cover single-choice and table/classification. Existing input shapes (`single_choice`, `table_choice`, `multi`) suffice.
- **Can mixed-transfer inflate mastery?** → No scheduler change needed. Each template emits concept evidence for all its `skillIds`, which is the existing behaviour for multi-skill templates like `question_mark_select`. Mastery quality tiers (engine.js lines 476-504) already handle this correctly.

### Deferred to Implementation

- Exact sentence content for each mixed-transfer case bank — requires writing reviewed grammar items during implementation.
- Whether any legacy repeat family needs a waiver rather than repair — depends on inspection of each family's case-bank structure.
- Exact case count per explanation family after expansion — target is 8+, but some may land at fewer with documented reason.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Content Layer (content.js):
  P3_EXPLANATION_CASES → expand arrays from ~6 to 8+ cases per family
  P4_MIXED_TRANSFER_CASES → new data structure, 8 entries × 8+ cases each
  buildP4MixedTransferQuestion(template, seed, cases) → new helper
  Legacy families → expand case banks to eliminate seed collisions

Audit Layer (audit-grammar-question-generator.mjs):
  buildMixedTransferCoverage() → new function
  buildCaseDepthAudit(seeds) → new function, counts unique sigs per family
  formatSummary → extended with P4 lines
  --deep flag → wider seed window for depth check

Test Layer:
  grammar-qg-p4-mixed-transfer.test.js → new file, P4-specific
  grammar-qg-p4-depth.test.js → new file, case-bank depth assertions
  grammar-question-generator-audit.test.js → extended with P4 assertions
  grammar-production-smoke.test.js → extended with P4 probe
```

---

## Implementation Units

- U1. **P4 audit scaffold and baseline fixture**

**Goal:** Make P4 depth and transfer measurable before adding content.

**Requirements:** R7, R9

**Dependencies:** None

**Files:**
- Modify: `scripts/audit-grammar-question-generator.mjs`
- Modify: `tests/grammar-question-generator-audit.test.js`
- Modify: `tests/grammar-functionality-completeness.test.js`
- Modify: `tests/helpers/grammar-legacy-oracle.js`
- Create: `tests/fixtures/grammar-legacy-oracle/grammar-qg-p4-baseline.json`
- Create: `tests/fixtures/grammar-functionality-completeness/grammar-qg-p4-baseline.json`

**Approach:**
- Add `buildMixedTransferCoverage()` to audit: counts templates with `tags.includes('mixed-transfer')`, reports which concepts are covered and which are missing.
- Add `buildCaseDepthAudit(seeds)`: for each generative template, counts unique variant signatures across the provided seeds and reports per-family depth.
- Add `--deep` flag to CLI that runs seeds 1..30 and includes depth output.
- Add `qg-p4` to the strict-variant tag list in `buildSignatureAudit()`.
- Create P4 baseline fixtures recording pre-content state (0 mixed-transfer templates, current depth stats).
- Existing P3 assertions must continue passing unchanged.

**Patterns to follow:**
- `buildExplainCoverage()` pattern for the new mixed-transfer coverage function.
- Existing fixture format from `grammar-qg-p3-baseline.json`.
- Existing `--seeds=` CLI flag pattern for the new `--deep` flag.

**Test scenarios:**
- Happy path: Audit runs with default seeds and returns all P4 fields (mixedTransferTemplateCount, conceptsWithMixedTransferCoverage, generatedCaseDepthByFamily).
- Happy path: `--deep` flag runs seeds 1..30 and produces deepSampledSeeds field.
- Happy path: P3 baseline assertions still pass unchanged with P4 audit code.
- Happy path: P4 fixture records zero mixed-transfer templates before content is added.
- Edge case: Templates tagged `qg-p4` are treated as strict (not legacy) for repeat detection.
- Edge case: Non-generative templates are excluded from depth audit.

**Verification:**
- `node --test tests/grammar-question-generator-audit.test.js` passes with P3 assertions intact.
- `node scripts/audit-grammar-question-generator.mjs` outputs new P4 lines (mixed-transfer count, depth).
- `node scripts/audit-grammar-question-generator.mjs --deep` outputs per-family depth over 30 seeds.

---

- U2. **Explanation case-bank expansion**

**Goal:** Increase reviewed visible depth for explanation templates to at least 8 cases per family without changing the scoring contract.

**Requirements:** R1

**Dependencies:** U1

**Files:**
- Modify: `worker/src/subjects/grammar/content.js` (P3_EXPLANATION_CASES arrays)
- Create: `tests/grammar-qg-p4-depth.test.js`

**Approach:**
- Expand each P3_EXPLANATION_CASES array from current ~6-7 entries to 8+ entries.
- Each new case needs: `prompt`, `example`, `correct`, `distractors` (3), `why`, `misconception`.
- New cases must cover materially different grammar situations (not just name/word substitution).
- Preserve existing case structure — `buildP3ExplanationChoiceQuestion()` continues to work unchanged.
- The existing seed modulo selection (`cases[seed % cases.length]`) naturally gains variety.

**Execution note:** Start with a depth test that asserts minimum 8 unique variant signatures per family over seeds 1..13, then expand case banks to satisfy it.

**Patterns to follow:**
- Existing P3_EXPLANATION_CASES entries for structure.
- `tests/grammar-qg-p3-explanation.test.js` for test patterns.

**Test scenarios:**
- Happy path: Each target explanation family produces at least 8 unique variant signatures over seeds 1..13.
- Happy path: Each generated item has exactly 4 options, 1 correct, 3 distractors.
- Happy path: Answer spec kind remains `exact` for all explanation templates.
- Happy path: Different visible explanation prompts produce different variant signatures.
- Edge case: Option shuffling alone does not produce a different variant signature (confirmed via same-prompt different-seed check).
- Edge case: `explain_reason_choice` covers multiple concepts — expansion must preserve multi-concept coverage.
- Error path: Learner-facing read model still redacts answerSpec, solutionLines, generatorFamilyId for expanded templates.

**Verification:**
- `node --test tests/grammar-qg-p4-depth.test.js` passes — all target families have 8+ unique prompts.
- `node scripts/audit-grammar-question-generator.mjs --deep` confirms no low-depth explanation families.

---

- U3. **Legacy repeated-variant repair**

**Goal:** Remove all legacy repeated generated variants from the default audit window, or record explicit waivers.

**Requirements:** R2

**Dependencies:** U1

**Files:**
- Modify: `worker/src/subjects/grammar/content.js` (legacy family case banks)
- Modify: `tests/grammar-question-generator-audit.test.js`
- Create or extend: `tests/grammar-qg-p4-depth.test.js`

**Approach:**
- Inspect each of the 6 repeating families: `proc_semicolon_choice`, `proc_colon_list_fix`, `proc_dash_boundary_fix`, `proc_hyphen_ambiguity_choice`, `proc2_modal_choice`, `proc2_formality_choice`, `proc3_clause_join_rewrite`.
- For each: expand the underlying case bank so seeds 1, 2, 3 produce materially different visible grammar tasks (not just name substitutions).
- The repair must change the visible grammar decision, not just character names or superficial vocabulary.
- If a repeat is pedagogically intentional (same grammar task is the correct learning target), record a waiver as a code comment with template ID and reason.
- Update the audit test to assert `legacyRepeatedGeneratedVariants.length === 0` (or count matches waiver list).

**Patterns to follow:**
- Existing case-bank expansion pattern in content.js.
- `mulberry32(seed)` + `pick(rng, cases)` deterministic selection.

**Test scenarios:**
- Happy path: `buildSignatureAudit([1,2,3])` returns empty `legacyRepeatedGeneratedVariants` array.
- Happy path: Each repaired family produces 3 distinct variant signatures for seeds [1,2,3].
- Happy path: Cross-template signature collisions remain zero.
- Happy path: Strict repeated variants (P1/P3 tagged) remain zero.
- Edge case: Seed mapping for a small case bank (3 cases) still produces distinct signatures for seeds [1,2,3] via modulo.
- Edge case: Expanded cases preserve the grammar focus of the original family (not just filler).

**Verification:**
- `node scripts/audit-grammar-question-generator.mjs` reports 0 legacy repeated variants (or all remaining have documented waivers).
- `node --test tests/grammar-question-generator-audit.test.js` passes with the zero-repeat assertion.

---

- U4. **Mixed-transfer template implementation**

**Goal:** Add 8 deterministic mixed-transfer templates covering all 18 Grammar concepts across cross-concept tasks.

**Requirements:** R3, R4, R5, R10

**Dependencies:** U1

**Files:**
- Modify: `worker/src/subjects/grammar/content.js`
- Create: `tests/grammar-qg-p4-mixed-transfer.test.js`

**Approach:**
- Add `P4_MIXED_TRANSFER_CASES` data structure (8 keys, each with 8+ reviewed cases).
- Add `buildP4MixedTransferQuestion(template, seed, cases)` helper, following `buildP3ExplanationChoiceQuestion()` pattern but supporting both `exact` and `multiField` answer specs.
- Add 8 template definitions to `GRAMMAR_TEMPLATE_METADATA`:
  - `qg_p4_sentence_speech_transfer` — `sentence_functions` + `speech_punctuation`, choose, exact
  - `qg_p4_word_class_noun_phrase_transfer` — `word_classes` + `noun_phrases`, classify, multiField
  - `qg_p4_adverbial_clause_boundary_transfer` — `adverbials` + `clauses` + `boundary_punctuation`, choose, exact
  - `qg_p4_relative_parenthesis_transfer` — `relative_clauses` + `parenthesis_commas`, choose, exact
  - `qg_p4_verb_form_register_transfer` — `tense_aspect` + `modal_verbs` + `standard_english`, choose, exact
  - `qg_p4_cohesion_formality_transfer` — `pronouns_cohesion` + `formality`, choose, exact
  - `qg_p4_voice_roles_transfer` — `active_passive` + `subject_object`, classify, multiField
  - `qg_p4_possession_hyphen_clarity_transfer` — `apostrophes_possession` + `hyphen_ambiguity`, choose, exact
- Each template: `generative: true`, `requiresAnswerSpec: true`, `difficulty: 3`, `tags: ['qg-p4', 'mixed-transfer']`, stable `generatorFamilyId`.
- Each case bank: visible prompt requiring both/all listed concepts, 4 options (or multi-field), exactly 1 correct, plausible distractors tied to misconceptions, feedback naming the transfer relationship.
- The authoring contract from origin applies: a learner must need both concepts to answer correctly.

**Execution note:** Write test assertions for build correctness, answer-spec validity, and redaction before authoring case content. Then fill cases to pass.

**Patterns to follow:**
- `buildP3ExplanationChoiceQuestion()` for the builder helper.
- `exactAnswerSpec()` and `multiFieldAnswerSpec()` for answer spec construction.
- `P3_EXPLANATION_CASES` for case data structure.
- `question_mark_select` (lines 1714-1769 in content.js) for existing multi-skillId template pattern.

**Test scenarios:**
- Happy path: Each P4 template builds for seeds [1, 2, 3, 4, 5, 6, 13] without error.
- Happy path: Every generated item has exactly one correct complete answer path.
- Happy path: `answerSpec.kind` matches declared `answerSpecKind` for every seed.
- Happy path: All P4 templates have at least 2 entries in `skillIds`.
- Happy path: Wrong options score 0 (exact) or partial credit only if answerSpec explicitly supports it (multiField).
- Happy path: Feedback includes grammar-specific reasoning naming both concepts.
- Edge case: For multiField templates, each field is independently scoreable and no field leaks correct values in visible metadata.
- Edge case: Variant signatures are distinct for seeds [1..8] (minimum case-bank depth).
- Edge case: Option shuffling does not produce new variant signatures.
- Error path: Learner-facing read model omits answerSpec, solutionLines, generatorFamilyId, variantSignature, golden, nearMiss, misconception for all P4 templates.
- Integration: P4 templates pass the shared forbidden-key oracle.

**Verification:**
- `node --test tests/grammar-qg-p4-mixed-transfer.test.js` passes.
- `node scripts/audit-grammar-question-generator.mjs` reports `mixedTransferTemplateCount: 8` and `conceptsWithMixedTransferCoverage: 18/18`.
- All P4 templates produce zero strict repeated variants.

---

- U5. **Selection and engine regression**

**Goal:** Prove mixed-transfer templates enrich practice without breaking session behaviour.

**Requirements:** R6

**Dependencies:** U4

**Files:**
- Modify: `tests/grammar-selection.test.js`
- Modify: `tests/grammar-engine.test.js`
- Modify: `tests/worker-grammar-subject-runtime.test.js`

**Approach:**
- Add selection test proving a P4 mixed-transfer template can appear in a practice queue.
- Add selection test proving focus mode on one concept does not exclusively select P4 multi-concept templates (focus still works for single-concept).
- Add engine test proving a P4 template can be answered through the deterministic answer-spec path (correct and incorrect submissions).
- Verify internal fields (`contentReleaseId`, `generatorFamilyId`, `variantSignature`) are emitted internally but not exposed in serialised items.
- Verify existing selection tests still pass without modification.

**Patterns to follow:**
- Existing selection test patterns (seeded RNG, mock state objects).
- Existing engine test patterns (submit response, check result).

**Test scenarios:**
- Happy path: A P4 mixed-transfer template appears in a 12-item practice queue when both its concepts are active.
- Happy path: Focus mode on `sentence_functions` still selects single-concept templates as primary picks; P4 multi-concept templates may appear but do not dominate.
- Happy path: P4 template correct submission produces quality >= 4.8 result.
- Happy path: P4 template incorrect submission produces quality 0.0 with misconception and feedback.
- Edge case: Variant freshness prevents same P4 template appearing twice in one queue.
- Integration: Full `npm test` regression passes.

**Verification:**
- `node --test tests/grammar-selection.test.js tests/grammar-engine.test.js tests/worker-grammar-subject-runtime.test.js` passes.
- No existing test is modified or weakened.

---

- U6. **Production-smoke and redaction hardening**

**Goal:** Make P4 visible-data safety explicit in the smoke suite.

**Requirements:** R5, R8

**Dependencies:** U4

**Files:**
- Modify: `tests/grammar-production-smoke.test.js`
- Modify: `tests/hub-read-models.test.js`

**Approach:**
- Add a P4 mixed-transfer smoke probe: start a Grammar session with one P4 template, assert visible payload contains prompt and options, assert hidden answer data absent.
- Add a post-answer probe: submit correct response, verify feedback exists and does not leak reusable answer-key internals.
- Extend hub read-model redaction test to include a P4 template in the recent activity surface.
- Use existing forbidden-key oracle from `tests/helpers/grammar-legacy-oracle.js`.

**Patterns to follow:**
- Existing `grammar-production-smoke.test.js` forbidden-key scanning (lines 98-142).
- Existing hub-read-models grammar redaction test (lines 322-462).

**Test scenarios:**
- Happy path: P4 mixed-transfer template learner-visible payload contains prompt and visible options/fields.
- Happy path: Learner-visible payload does not contain answerSpec, correctResponses, variantSignature, generatorFamilyId, golden, nearMiss, accepted.
- Happy path: After correct submission, feedback is present and does not expose reusable answer-key internals.
- Happy path: After wrong submission, feedback names both grammar concepts involved.
- Edge case: multiField P4 template does not leak correct field values in visible metadata before answering.
- Integration: Hub read-model grammar coverage diagnostics include P4 template count.

**Verification:**
- `node --test tests/grammar-production-smoke.test.js tests/hub-read-models.test.js` passes.
- No hidden answer data appears before answering.

---

- U7. **Final fixture, release bump, and documentation**

**Goal:** Record the P4 denominator honestly and bump the content release ID.

**Requirements:** R9, R7

**Dependencies:** U2, U3, U4, U5, U6

**Files:**
- Modify: `worker/src/subjects/grammar/content.js` (GRAMMAR_CONTENT_RELEASE_ID bump)
- Modify: `src/subjects/grammar/metadata.js` (if release ID is mirrored)
- Overwrite: `tests/fixtures/grammar-legacy-oracle/grammar-qg-p4-baseline.json`
- Overwrite: `tests/fixtures/grammar-functionality-completeness/grammar-qg-p4-baseline.json`
- Modify: `tests/grammar-question-generator-audit.test.js` (P4 denominator assertions)
- Modify: `tests/grammar-functionality-completeness.test.js` (P4 baseline)
- Create: `docs/plans/james/grammar/questions-generator/grammar-qg-p4-completion-report.md`

**Approach:**
- Bump `GRAMMAR_CONTENT_RELEASE_ID` from `grammar-qg-p3-2026-04-28` to `grammar-qg-p4-YYYY-MM-DD`.
- Re-run audit script with `--write-fixture` to capture final P4 baseline.
- Update audit test assertions to match final denominator (expected: 78 templates, 58 selected-response, 52 generated, 47+ answer-spec, 8 mixed-transfer, 18/18 concepts covered).
- Write completion report stating: P3 baseline, P4 final denominator, every new template, every repaired family, any families below target depth, whether smoke was repository-only.
- The completion report must not claim unlimited generated questions.

**Patterns to follow:**
- P3 fixture format for new P4 fixture.
- P3 completion report structure.

**Test scenarios:**
- Happy path: Full `npm test` passes with final P4 denominator assertions.
- Happy path: P3 fixture assertions still pass (P3 fixture untouched).
- Happy path: Release ID string propagates to audit output.

**Verification:**
- `npm test` passes.
- `npm run check` passes.
- `git diff --check` passes.
- Completion report exists and states honest denominator.

---

## System-Wide Impact

- **Interaction graph:** P4 templates participate in the same selection → generation → marking → read-model pipeline as all existing templates. No new middleware, callbacks, or entry points.
- **Error propagation:** Answer-spec validation failures in P4 templates would surface as audit test failures and `invalidAnswerSpecs` in the audit. No new runtime error paths.
- **State lifecycle risks:** None — P4 adds content, not state machinery. Mastery nodes already handle multi-skillId templates.
- **API surface parity:** No API changes. P4 templates flow through existing `/grammar/session` and `/grammar/attempt` worker routes.
- **Integration coverage:** The critical cross-layer scenario is: content generation → serialisation → read-model redaction → learner-facing delivery. Tests in U4 and U6 cover this end-to-end.
- **Unchanged invariants:** Star, Mega, monster, reward, Parent Hub, confidence analytics, SATS mini-test scoring, manual-review-only semantics all remain untouched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Mixed-transfer items may be too hard for early learners | `difficulty: 3` keeps them out of easy practice; selection weights and focus mode preserve concept-local priority |
| Legacy repeat repair may tempt superficial variation | Test asserts materially different grammar tasks, not just name substitution; review checklist in origin doc |
| Case-bank expansion may still be finite | Deep seed audit makes repeat rate visible; completion report must list any low-depth families |
| Multi-concept mastery inflation | Existing mastery quality tiers handle this; no scheduler changes needed; tests verify no reward changes |
| P4 templates might break existing suite | U5 is explicitly a regression unit; `npm test` is the final gate |

---

## Sources & References

- **Origin document:** [grammar-qg-p4.md](docs/plans/james/grammar/questions-generator/grammar-qg-p4.md)
- **Previous plan:** [grammar-qg-p3.md](docs/plans/james/grammar/questions-generator/grammar-qg-p3.md)
- **Previous completion:** [grammar-qg-p3-final-completion-report-2026-04-28.md](docs/plans/james/grammar/questions-generator/grammar-qg-p3-final-completion-report-2026-04-28.md)
- Related code: `worker/src/subjects/grammar/content.js`, `worker/src/subjects/grammar/answer-spec.js`, `worker/src/subjects/grammar/selection.js`
- Audit: `scripts/audit-grammar-question-generator.mjs`
