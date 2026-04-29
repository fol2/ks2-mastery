---
title: "feat: Punctuation QG P3 generator DSL and authoring tools"
type: feat
status: active
date: 2026-04-28
origin: docs/plans/james/punctuation/questions-generator/punctuation-qg-p3.md
---

# feat: Punctuation QG P3 generator DSL and authoring tools

## Overview

P3 introduces a minimal deterministic template DSL for Punctuation question authoring, converts seven priority families to DSL-backed definitions with golden marking tests, adds a CLI preview tool and reviewer-mode audit output, and resolves the redaction-contract and context-pack policy questions left open by P2.

Production volume is frozen throughout: `GENERATED_ITEMS_PER_FAMILY = 4`, total runtime items = 192, published reward units = 14.

---

## Problem Frame

P2 made deterministic generation governable. The remaining authoring pain is:

1. **No single source of truth** — template objects in `GENERATED_TEMPLATE_BANK` duplicate metadata that the family already declares (mode, skillIds, rewardUnitId, clusterId). This makes authoring error-prone and review tedious.
2. **No built-in marking tests** — model answers are verified at audit time, but there are no golden accept/reject cases attached to templates. Marking regressions are only caught after the fact.
3. **No reviewer preview** — content reviewers must run a learner session or manually read generator code to see rendered variants.
4. **Thin audit signals** — the audit reports pass/fail but not the content quality signals a reviewer needs (duplicate stems, spare capacity, mode coverage).
5. **Unresolved P2 contracts** — context-pack policy and redaction-contract wording need an explicit decision.

(see origin: `docs/plans/james/punctuation/questions-generator/punctuation-qg-p3.md`)

---

## Requirements Trace

- R1. Define a minimal DSL that generates prompt, stem, model, validator, misconception/readiness tags, and golden tests from one teacher-authored specification.
- R2. Convert at least 7 priority families to DSL-backed definitions maintaining backward-compatible output.
- R3. Each converted family supports 8 audit-only variants with 8 distinct generated signatures.
- R4. Each converted template has golden accept/reject marking tests.
- R5. Production `GENERATED_ITEMS_PER_FAMILY` remains 4, runtime items remain 192, reward units remain 14.
- R6. Author preview CLI renders generated variants in human-readable and JSON formats.
- R7. Audit reviewer report adds duplicate-stem, capacity, mode-coverage, and golden-test-coverage signals.
- R8. Context-pack policy explicitly decided in code and documentation (recommended: teacher/admin-only). Decision recorded in completion report with rationale.
- R9. Redaction contract: code and documentation agree on fail-closed behaviour.
- R10. Existing P2 smoke, audit, and marking tests pass without modification.
- R11. No runtime AI generation, no browser-owned generation, no forbidden metadata leaks.
- R12. The P3 completion report documents any prompt/stem/model drift caused by DSL conversion (expected: none; if intentional drift occurs, list every change with rationale).

---

## Scope Boundaries

- Do not raise production `generatedPerFamily` above 4.
- Do not change the 14 published reward-unit denominator.
- Do not redesign the child-facing Punctuation UI.
- Do not add runtime AI question generation.
- Do not change 100-Star reward semantics.
- Do not chase the 280–420 mature portfolio target.
- Do not introduce Hero Mode coupling.
- Do not publish context-pack-generated child questions.

### Deferred to Follow-Up Work

- Evidence and scheduler maturity (P4 scope).
- Raising production `generatedPerFamily` above 4 (P5 scope).
- Cross-subject authoring framework (P6 scope if needed).

---

## Context & Research

### Relevant Code and Patterns

- `shared/punctuation/generators.js` — `GENERATED_TEMPLATE_BANK` (frozen object, lines 118-1877), `buildGeneratedItem()` (lines 1879-1905), `createPunctuationGeneratedItems()` (lines 1907-1942), `pickTemplate()` three-tier pool (lines 79-112), `variantSignatureFor()` (lines 63-77), `templateIdFor()` (lines 44-60).
- `shared/punctuation/content.js` — `PUNCTUATION_CONTENT_MANIFEST` with skills, generatorFamilies, clusters, rewardUnits.
- `shared/punctuation/context-packs.js` — context-pack template builders and validation.
- `shared/punctuation/marking.js` — `markPunctuationAnswer()` validation logic.
- `shared/punctuation/service.js` — `GENERATED_ITEMS_PER_FAMILY = 4` (line 39), `createPunctuationRuntimeManifest()`.
- `scripts/audit-punctuation-content.mjs` — existing audit with threshold configuration.
- `tests/punctuation-generators.test.js` — generator determinism, signature uniqueness, legacy parity.
- `tests/punctuation-content-audit.test.js` — content audit threshold assertions.
- `tests/punctuation-marking.test.js` — marking engine tests.
- `tests/punctuation-read-models.test.js` — read-model redaction coverage.
- `tests/punctuation-release-smoke.test.js` — end-to-end production smoke.

### Institutional Learnings

- **pickBySeed modulo pattern** (`docs/solutions/logic-errors/seeded-prng-index-collision-pickbyseed-2026-04-28.md`): Use double-modulo `((seed-1) % N + N) % N` for deterministic selection from banks < 20 items. Reserve mulberry32 for large-pool/shuffle scenarios.
- **Punctuation P7 stabilisation contract** (`docs/solutions/architecture-patterns/punctuation-p7-stabilisation-contract-and-autonomous-sdlc-2026-04-28.md`): Follow manifest-leaf pattern for DSL metadata (zero imports from sibling punctuation modules). Redaction for preview/debug tooling must never expose raw answer content.
- **Grammar P7 quality trust** (`docs/solutions/architecture-patterns/grammar-p7-quality-trust-consolidation-and-autonomous-sdlc-2026-04-27.md`): Redaction contract = expose structural metadata (template ID, variant signature, tier booleans) but never raw answer content. Golden tests use frozen state-seeding factories, not hand-constructed fixtures.
- **Admin Console P4 characterisation-first** (`docs/solutions/architecture-patterns/admin-console-p4-hardening-truthfulness-adversarial-review-2026-04-27.md`): Golden tests must seed through production code paths. Guard `.every()`-based audit assertions with non-empty array checks.
- **Grammar P6 normaliser pattern** (`docs/solutions/architecture-patterns/grammar-p6-star-derivation-trust-and-server-owned-persistence-2026-04-27.md`): Derivation functions declare normaliser pairs at entry point; raw property access below normaliser is a defect.

### External References

- No external research needed — local patterns are comprehensive for this work.

---

## Key Technical Decisions

- **DSL as normaliser layer, not replacement**: The DSL normalises teacher-authored specs into the existing template shape consumed by `buildGeneratedItem()`. The runtime path (`pickTemplate` → `buildGeneratedItem`) is unchanged. The DSL is authoring infrastructure, not a new runtime.
- **Slot expansion produces templates**: Each DSL definition with `slots` expands slot combinations into the flat template array that `GENERATED_TEMPLATE_BANK` already expects. This means `pickTemplate()` and `buildGeneratedItem()` see no change.
- **Backward-compatible conversion**: Converted families must produce identical output for the first 4 production variants. The DSL's `build()` function generates the same prompt/stem/model/validator as the current hand-authored templates. Golden snapshot tests lock this.
- **Golden tests live on templates, run at test time**: Each DSL template carries `tests: { accept: [...], reject: [...] }`. A test runner calls `markPunctuationAnswer()` against each case. This is a test-time concern only — golden tests are not shipped to the client.
- **Preview CLI is offline only**: The preview tool renders from the DSL expansion without requiring Worker or learner session. It reads `GENERATED_TEMPLATE_BANK` (after DSL expansion) and formats output.
- **Context-pack policy = teacher/admin-only**: No code change needed. Codify as an explicit constant and documentation statement.
- **Redaction contract = fail-closed everywhere**: Remove documentation wording that implies production silently strips. The guard throws in all environments. Production smoke catches deployed leakage.

---

## Open Questions

### Resolved During Planning

- **Should the DSL replace or wrap existing templates?** → Wrap. DSL definitions expand into the same flat template arrays. Existing non-DSL families continue working unmodified. Conversion is family-by-family.
- **How many templates per converted family?** → At least 8 (to support 8 distinct audit-only signatures). The first 4 must produce identical output to current production.
- **Should golden tests be inline or separate files?** → Inline on the template definition. They travel with the template and are impossible to forget.

### Deferred to Implementation

- Exact slot combinations for each priority family — these depend on inspecting the current template content and teacher review of marking policy.
- Whether any converted family needs its first 4 variants intentionally drifted — the default is no drift; any drift must be documented in the completion report.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
┌─────────────────────────────────────────────────────────┐
│  Teacher-Authored DSL Definition                        │
│  (shared/punctuation/template-dsl.js)                   │
│                                                         │
│  { id, familyId, slots, build(), tests }                │
└───────────────┬─────────────────────────────────────────┘
                │ expandDslTemplate()
                ▼
┌─────────────────────────────────────────────────────────┐
│  Flat Template Array (same shape as today)              │
│  [{ prompt, stem, model, validator, accepted, ... }]    │
└───────────────┬─────────────────────────────────────────┘
                │ injected into GENERATED_TEMPLATE_BANK
                ▼
┌─────────────────────────────────────────────────────────┐
│  Existing Runtime (unchanged)                           │
│  pickTemplate() → buildGeneratedItem() → runtime items  │
└─────────────────────────────────────────────────────────┘

Preview CLI: reads expanded bank → formats per-variant output
Audit: reads expanded bank → reports quality signals
Golden tests: reads template.tests → calls markPunctuationAnswer()
```

---

## Implementation Units

- U1. **Template DSL module and expansion function**

**Goal:** Create the DSL schema, normaliser, and expansion function that converts teacher-authored specs into flat template arrays compatible with `GENERATED_TEMPLATE_BANK`.

**Requirements:** R1, R5

**Dependencies:** None

**Files:**
- Create: `shared/punctuation/template-dsl.js`
- Modify: `shared/punctuation/generators.js` (import DSL-expanded templates for converted families)
- Test: `tests/punctuation-template-dsl.test.js`

**Approach:**
- Define a `definePunctuationTemplate(spec)` function that validates the spec shape and returns a frozen template definition.
- Define `expandDslTemplates(dslDefinitions)` that takes an array of DSL definitions and produces the flat template array (cartesian product of slot combinations, each passed through `build()`).
- The expansion function applies slot combinations deterministically (sorted keys, lexicographic product) so the template array is stable across runs.
- Each expanded template inherits family-level metadata (skillIds, clusterId, rewardUnitId, misconceptionTags, readiness) unless the `build()` function overrides them.
- The expanded template includes a `templateId` override derived from the DSL definition's `id` + slot values for stability.
- Validate: no duplicate signatures after expansion (throw if detected at module load time).
- The module exports are consumed by `generators.js` but have zero imports from sibling punctuation modules (manifest-leaf pattern).

**Execution note:** Start with a characterisation snapshot of the 7 priority families' current output before introducing the DSL.

**Patterns to follow:**
- `shared/punctuation/generators.js` template shape (prompt, stem, model, validator, rubric, accepted, misconceptionTags, readiness, skillIds, clusterId, explanation)
- `templateIdFor()` pattern for stable template IDs
- `normaliseSignatureText()` for text normalisation
- Grammar P6 normaliser-at-boundary pattern

**Test scenarios:**
- Happy path: DSL definition with 3 slots × 3 values = 9 expanded templates, all with correct shape and distinct signatures
- Happy path: expanded template passes through `buildGeneratedItem()` and produces valid generated item
- Happy path: `build()` function receives correct slot values and returns expected prompt/stem/model
- Edge case: DSL definition with single slot value produces exactly 1 template
- Edge case: empty slots object produces zero templates (or throws — implementation decides)
- Error path: DSL definition missing required field (id, familyId, build) throws descriptive error
- Error path: slot expansion produces duplicate signatures → throws at expansion time
- Error path: `build()` returns object missing `model` field → throws with template ID in message
- Integration: expanded templates fed to `pickTemplate()` produce same selection behaviour as hand-authored arrays of same length

**Verification:**
- `node --test tests/punctuation-template-dsl.test.js` passes
- DSL module loads without error and exports are importable from `generators.js`

---

- U2. **Convert seven priority families to DSL-backed definitions**

**Goal:** Convert `gen_sentence_endings_insert`, `gen_apostrophe_contractions_fix`, `gen_comma_clarity_insert`, `gen_dash_clause_fix`, `gen_dash_clause_combine`, `gen_hyphen_insert`, and `gen_semicolon_list_fix` from hand-authored template arrays to DSL-backed definitions while preserving identical production output for the first 4 variants.

**Requirements:** R2, R3, R5, R10

**Dependencies:** U1

**Files:**
- Create: `shared/punctuation/dsl-families/sentence-endings-insert.js`
- Create: `shared/punctuation/dsl-families/apostrophe-contractions-fix.js`
- Create: `shared/punctuation/dsl-families/comma-clarity-insert.js`
- Create: `shared/punctuation/dsl-families/dash-clause-fix.js`
- Create: `shared/punctuation/dsl-families/dash-clause-combine.js`
- Create: `shared/punctuation/dsl-families/hyphen-insert.js`
- Create: `shared/punctuation/dsl-families/semicolon-list-fix.js`
- Modify: `shared/punctuation/generators.js` (replace hand-authored entries with DSL-expanded arrays for these 7 families)
- Test: `tests/punctuation-dsl-conversion-parity.test.js`

**Approach:**
- For each family, create a DSL definition file that declares the slot pools and `build()` function.
- The expanded output must include at least 8 templates (to support 8 distinct audit-only signatures at `generatedPerFamily = 8`).
- The first 4 production variants (at the current seed and variant indices 0-3) must produce identical items to the current hand-authored bank. Lock this with a snapshot assertion.
- Where the current bank has fewer than 8 templates, add new slot combinations that extend the bank without changing the legacy/stable tier entries.
- Conversion is mechanical: the existing hand-authored templates become the reference output that the DSL's `build()` function must reproduce.
- If any converted family's first 4 production variants intentionally drift from the current bank (e.g., improved stem wording), document the rationale and list all changed prompt/stem/model values for the completion report.
- Each DSL file exports its definitions; `generators.js` imports and expands them to replace the corresponding `GENERATED_TEMPLATE_BANK` entries.

**Execution note:** Characterisation-first. Snapshot current production output for all 7 families at `generatedPerFamily = 4` before making any changes. Then snapshot at `generatedPerFamily = 8` for the capacity target. Conversion is green when both snapshots match.

**Patterns to follow:**
- Existing template shape in `GENERATED_TEMPLATE_BANK`
- Three-tier pool constants: `legacyTemplateCount = 2`, `runtimeStableTemplateCount = 4`
- `pickBySeed` modulo pattern for deterministic slot selection in small banks

**Test scenarios:**
- Happy path: each of 7 converted families at `generatedPerFamily = 4` produces identical items (id, variantSignature, prompt, stem, model, validator) to the pre-conversion baseline snapshot
- Happy path: each of 7 converted families at `generatedPerFamily = 8` produces 8 items with 8 distinct variant signatures
- Happy path: total runtime items count remains 192 at `generatedPerFamily = 4`
- Edge case: dash-clause templates accept spaced hyphen, en dash, and em dash variants in model answers
- Edge case: semicolon-list templates with Oxford-comma policy respected
- Error path: if a DSL family produces fewer than 8 distinct signatures at depth 8, the test fails explicitly (non-vacuous assertion)
- Integration: `createPunctuationRuntimeManifest()` with default parameters produces same manifest hash as before conversion
- Integration: `npm run audit:punctuation-content -- --strict --generated-per-family 4` passes

**Verification:**
- Parity snapshot tests pass (production output unchanged)
- 8-variant signature uniqueness assertions pass
- Existing `tests/punctuation-generators.test.js` passes without modification
- `npm run audit:punctuation-content -- --strict --generated-per-family 4` passes

---

- U3. **Golden accept/reject marking tests per template**

**Goal:** Add inline golden accept/reject test declarations to each DSL-backed template and build a test runner that verifies them against `markPunctuationAnswer()`.

**Requirements:** R4, R10

**Dependencies:** U1, U2

**Files:**
- Modify: `shared/punctuation/dsl-families/sentence-endings-insert.js` (add `tests` field per template)
- Modify: `shared/punctuation/dsl-families/apostrophe-contractions-fix.js`
- Modify: `shared/punctuation/dsl-families/comma-clarity-insert.js`
- Modify: `shared/punctuation/dsl-families/dash-clause-fix.js`
- Modify: `shared/punctuation/dsl-families/dash-clause-combine.js`
- Modify: `shared/punctuation/dsl-families/hyphen-insert.js`
- Modify: `shared/punctuation/dsl-families/semicolon-list-fix.js`
- Create: `tests/punctuation-golden-marking.test.js`

**Approach:**
- Each DSL template carries a `tests` object: `{ accept: [...], reject: [...] }`.
- Accept cases must pass `markPunctuationAnswer()` as correct; reject cases must fail.
- Required coverage per template: canonical model answer (accept), one misconception (reject), one legitimate alternate where marking policy allows (accept), one false-positive guard (reject).
- The test runner iterates all DSL-backed templates, expands their golden cases, and asserts marking outcomes.
- Specific marking-policy coverage required:
  - Dash templates: accept spaced hyphen, en dash, and em dash
  - List-comma templates: respect Oxford-comma policy
  - Speech templates: handle straight and curly quotation marks
  - Apostrophe templates: handle straight and curly apostrophes
  - Semicolon-list templates: reject simple comma-only lists
  - Hyphen templates: distinguish ambiguity-resolving from decorative

**Patterns to follow:**
- `tests/punctuation-marking.test.js` for marking assertion patterns
- `markPunctuationAnswer({ item, answer: { typed } })` call signature
- Admin Console P4 pattern: seed through production code paths, not hand-constructed items

**Test scenarios:**
- Happy path: all canonical model answers marked correct for all 7 converted families
- Happy path: all reject cases marked incorrect with expected misconception tags
- Happy path: legitimate alternate forms (curly quotes, en dash vs em dash) marked correct where policy allows
- Edge case: straight vs curly apostrophe in contraction template both accepted
- Edge case: spaced hyphen vs en dash vs em dash all accepted in dash-clause templates
- Error path: template with missing `tests` field fails DSL validation (caught at expansion time, not silently skipped)
- Integration: golden test runner calls `markPunctuationAnswer()` with generated item shape from `buildGeneratedItem()` — not raw template objects

**Verification:**
- `node --test tests/punctuation-golden-marking.test.js` passes
- Every DSL-backed template has at least 4 golden cases (1 model accept, 1 misconception reject, 1 alternate accept or reject, 1 false-positive guard)
- Zero vacuous-truth assertions (all `.every()` guarded by non-empty array check)

---

- U4. **Author preview CLI tool**

**Goal:** Create a CLI tool that renders generated variants for a given family without requiring a learner session, enabling teacher/content review.

**Requirements:** R6

**Dependencies:** U1, U2, U3

**Files:**
- Create: `scripts/preview-punctuation-templates.mjs`
- Modify: `package.json` (add `preview:punctuation-templates` script)
- Test: `tests/punctuation-preview-cli.test.js`

**Approach:**
- Command: `npm run preview:punctuation-templates -- --family <familyId> --variants <N>`
- Renders per-variant: item id, family id, template id, variant signature, mode, skill ids, cluster id, prompt, stem, model answer, validator type, rubric type, misconception tags, readiness tags, golden test results (pass/fail per case).
- Default output: human-readable table/card format.
- `--json` flag: JSON array for tooling and CI diffs.
- `--all` flag: render all families (useful for full review).
- The preview calls `createPunctuationGeneratedItems()` with the requested `perFamily` count and formats the result. No new runtime logic.
- Golden test results are included by running each template's `tests.accept`/`tests.reject` cases through `markPunctuationAnswer()` and reporting pass/fail inline.
- Exit code 0 if all golden tests pass; exit code 1 if any golden test fails (useful for CI).

**Patterns to follow:**
- `scripts/audit-punctuation-content.mjs` for argument parsing and output formatting
- Manifest-leaf: preview reads from `generators.js` exports, not from internal state

**Test scenarios:**
- Happy path: `--family gen_dash_clause_combine --variants 4` outputs 4 items with all required fields
- Happy path: `--json` produces valid JSON array parseable by `JSON.parse()`
- Happy path: `--all --variants 8` renders all 25 families × 8 variants without error
- Edge case: unknown family ID prints helpful error and exits 1
- Edge case: `--variants 0` produces empty output, exit 0
- Error path: golden test failure in a template causes that item's test-results to show "FAIL" and overall exit code 1

**Verification:**
- `npm run preview:punctuation-templates -- --family gen_dash_clause_combine --variants 8` produces readable output
- `npm run preview:punctuation-templates -- --family gen_dash_clause_combine --variants 8 --json` produces valid JSON
- `tests/punctuation-preview-cli.test.js` passes

---

- U5. **Audit reviewer report mode**

**Goal:** Add a `--reviewer-report` flag to the content audit that surfaces content quality signals beyond the existing strict pass/fail gate.

**Requirements:** R7, R10

**Dependencies:** U2, U3

**Files:**
- Modify: `scripts/audit-punctuation-content.mjs`
- Modify: `tests/punctuation-content-audit.test.js`

**Approach:**
- Add `--reviewer-report` flag that outputs additional quality signals after the strict pass/fail gate runs.
- Reviewer report includes:
  - Top duplicate generated stems (grouped, sorted by count)
  - Top duplicate generated models
  - Per-family spare capacity at `generatedPerFamily = 8` (how many more distinct signatures are available)
  - Per-skill mode coverage (which modes cover each skill)
  - Per-skill validator/rubric coverage
  - Per-family template count
  - Per-family signature count
  - Generated model-answer marking failures (already computed, surface in report)
  - Templates missing accept/reject tests (DSL-backed only)
  - Templates with no legitimate alternate-answer test where alternates are expected
  - Families still using legacy non-DSL templates
- Strict gate remains unchanged. Reviewer report is informational — it never causes exit code 1.
- The audit already computes duplicate signatures (hard fail), duplicate stems/models (currently collected). Extend the collection with display formatting.
- Add `--min-generated-by-family`, `--min-templates-by-family`, `--min-signatures-by-family` per-family threshold flags for capacity-mode audit of converted families.

**Patterns to follow:**
- Existing `scripts/audit-punctuation-content.mjs` report structure
- `groupDuplicates()` helper already in the audit script

**Test scenarios:**
- Happy path: `--strict --generated-per-family 4 --reviewer-report` passes strict gate AND prints reviewer section
- Happy path: per-family capacity at depth 8 shows ≥ 8 distinct signatures for converted families
- Happy path: families not yet converted show "legacy (non-DSL)" in the report
- Edge case: reviewer report with zero duplicates still prints the section headers (no crash on empty)
- Integration: `--strict --generated-per-family 8 --min-generated-by-family gen_sentence_endings_insert=8,...` passes for all 7 converted families

**Verification:**
- `npm run audit:punctuation-content -- --strict --generated-per-family 4` still passes (no regression)
- `npm run audit:punctuation-content -- --strict --generated-per-family 8 --min-generated-by-family ...` passes for converted families
- `tests/punctuation-content-audit.test.js` passes with new assertions for reviewer-report output

---

- U6. **Codify context-pack policy**

**Goal:** Make the P3 context-pack decision explicit in code and documentation: teacher/admin-only, no learner-facing output.

**Requirements:** R8, R11

**Dependencies:** None

**Files:**
- Modify: `shared/punctuation/context-packs.js` (add policy constant and JSDoc)
- Modify: `shared/punctuation/service.js` (guard against accidental learner-facing use)
- Test: `tests/punctuation-context-pack-policy.test.js`

**Approach:**
- Add `CONTEXT_PACK_POLICY = 'teacher_admin_only'` constant at the top of `context-packs.js`.
- Add a guard in `service.js` that prevents context-pack templates from being used in the production learner path (they already aren't, but make the intent explicit with an assertion-style guard and comment).
- The guard should throw if `contextPack` is non-null in the production `createPunctuationRuntimeManifest()` call path unless an explicit `allowContextPacks: true` option is passed (which no current code path does).
- Update the module-level documentation comment to state the policy.

**Patterns to follow:**
- Existing `MAX_CONTEXT_TEMPLATE_VARIANTS = 2` constant pattern in `context-packs.js`
- Punctuation P7 stabilisation contract: explicit non-goals in code, not just docs

**Test scenarios:**
- Happy path: `CONTEXT_PACK_POLICY` exported and equals `'teacher_admin_only'`
- Happy path: production runtime manifest creation with no context pack succeeds normally
- Error path: passing a context pack to the production service path without `allowContextPacks: true` throws
- Edge case: passing `allowContextPacks: true` with a valid context pack still works (teacher/admin preview path)

**Verification:**
- `tests/punctuation-context-pack-policy.test.js` passes
- All existing punctuation tests pass without modification
- Production smoke passes (no context pack in production path)

---

- U7. **Resolve redaction-contract wording**

**Goal:** Align code and documentation on fail-closed redaction behaviour in all environments. Remove wording that implies production silently strips forbidden fields.

**Requirements:** R9, R11

**Dependencies:** None (prerequisite: read current redaction implementation in `service.js`, `tests/punctuation-read-models.test.js`, and `tests/helpers/forbidden-keys.mjs`)

**Files:**
- Modify: `shared/punctuation/service.js` (verify/add fail-closed assertion)
- Modify: `tests/punctuation-read-models.test.js` (add characterisation test for fail-closed behaviour)
- Modify: relevant documentation (docs that reference production stripping)

**Approach:**
- Audit the current forbidden-key scanning in the read-model projection path. Verify it throws (not strips) when forbidden keys are present.
- If any code path silently strips instead of throwing, change it to throw.
- Remove or correct documentation wording that says "emits a structured warning plus strips the field in production".
- The production smoke (`tests/punctuation-release-smoke.test.js`) already catches deployed leakage — document this as the second line of defence.
- The explicit `variantSignature` allowance on active `session.currentItem` is preserved and documented as the sole exception.
- Add a characterisation test that asserts: injecting a forbidden key into a generated item's read-model projection throws (not returns stripped result).

**Patterns to follow:**
- `tests/helpers/forbidden-keys.mjs` — `FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS` list
- Grammar P7 redaction contract pattern (tier booleans exposed, raw answer content never)

**Test scenarios:**
- Happy path: read-model projection of a well-formed generated item contains no forbidden keys
- Happy path: `variantSignature` present on active session current item only (the explicit allowance)
- Error path: artificially injecting a forbidden key into the read-model input causes a throw (not silent strip)
- Integration: production smoke still passes after contract tightening

**Verification:**
- `tests/punctuation-read-models.test.js` passes with new fail-closed assertion
- `tests/punctuation-release-smoke.test.js` passes
- No documentation references silent stripping in production

---

- U8. **Documentation and completion report**

**Goal:** Update documentation so future contributors use the DSL, and produce the P3 completion report template.

**Requirements:** R5, R10, R12

**Dependencies:** U1, U2, U3, U4, U5, U6, U7

**Files:**
- Modify: `docs/plans/james/punctuation/questions-generator/` (add P3 completion report)
- Create: `docs/plans/james/punctuation/questions-generator/punctuation-qg-p3-completion-report-2026-04-28.md`

**Approach:**
- Write the P3 completion report with all required contents from the origin doc section 9:
  - Final runtime counts, generatedPerFamily, reward-unit count
  - List of converted DSL families with template/signature counts at depth 4 and 8
  - Duplicate signature count, duplicate stem/model review summary
  - Golden test summary
  - Redaction-contract decision and evidence
  - Context-pack policy decision
  - Preview-tool examples
  - Commands run
  - Residual risks
  - P4 recommendation
- Update inline documentation in DSL module explaining how to add a new template
- Verify all doc references to redaction behaviour are consistent with U7's decision

**Test expectation:** none — documentation unit

**Verification:**
- Completion report covers all 13 required items from origin doc section 9
- Commands listed in the report are runnable and pass

---

## System-Wide Impact

- **Interaction graph:** The DSL module is consumed only by `generators.js` at module load time. No runtime callsite changes. Preview CLI and audit script read from the same expanded bank.
- **Error propagation:** DSL validation errors throw at module load (fast feedback during authoring). They do not propagate to runtime since expansion is static.
- **State lifecycle risks:** None — the DSL is a build-time authoring layer. No new state, no new persistence, no new caching.
- **API surface parity:** No client-facing API changes. The Worker, read-model, and admin surfaces see identical generated items.
- **Integration coverage:** The parity snapshot tests (U2) provide integration coverage that the DSL expansion → pickTemplate → buildGeneratedItem → runtime manifest path produces identical output to the pre-DSL system.
- **Unchanged invariants:** `GENERATED_ITEMS_PER_FAMILY = 4`, total runtime = 192, reward units = 14, release ID = `punctuation-r4-full-14-skill-structure`, all P2 audit/smoke behaviour unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| DSL conversion accidentally changes learner-visible items for the first 4 production variants | Characterisation snapshot locks pre-conversion output; parity assertion fails on any drift |
| Golden tests are too shallow and miss marking regressions | Require 4 cases minimum per template; specific marking-policy coverage for dash/apostrophe/comma/speech |
| DSL becomes over-abstract and harder to author than the flat templates it replaces | Keep the DSL minimal: slots + build function. No inheritance, no conditional logic, no meta-templates |
| Audit reviewer report introduces false confidence about capacity | Capacity at depth 8 requires 8 *distinct* signatures — the audit counts signatures, not templates |
| Context-pack policy changes are requested mid-phase | Guard in service.js makes accidental leakage a hard throw; policy change requires explicit opt-in |
| Duplicate stems/models ignored because signatures are clean | Reviewer report surfaces duplicates prominently; completion report must address them |

---

## Sources & References

- **Origin document:** [docs/plans/james/punctuation/questions-generator/punctuation-qg-p3.md](docs/plans/james/punctuation/questions-generator/punctuation-qg-p3.md)
- **P2 completion report:** [docs/plans/james/punctuation/questions-generator/punctuation-qg-p2-completion-report-2026-04-28.md](docs/plans/james/punctuation/questions-generator/punctuation-qg-p2-completion-report-2026-04-28.md)
- **P2 implementation plan:** [docs/plans/2026-04-28-002-feat-punctuation-qg-p2-depth-release-gate-plan.md](docs/plans/2026-04-28-002-feat-punctuation-qg-p2-depth-release-gate-plan.md)
- Related code: `shared/punctuation/generators.js`, `shared/punctuation/content.js`, `scripts/audit-punctuation-content.mjs`
- Learnings: `docs/solutions/logic-errors/seeded-prng-index-collision-pickbyseed-2026-04-28.md`
- Learnings: `docs/solutions/architecture-patterns/punctuation-p7-stabilisation-contract-and-autonomous-sdlc-2026-04-28.md`
