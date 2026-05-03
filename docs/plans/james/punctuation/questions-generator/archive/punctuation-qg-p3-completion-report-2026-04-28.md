# Punctuation Question Generator P3 Completion Report

Date: 28 April 2026

Report status: final post-merge completion report

Source plan: `docs/plans/james/punctuation/questions-generator/punctuation-qg-p3.md`

Implementation plan: `docs/plans/2026-04-28-009-feat-punctuation-qg-p3-dsl-authoring-tools-plan.md`

PR: [#552](https://github.com/fol2/ks2-mastery/pull/552) — squash-merged to main

Primary production target: `https://ks2.eugnel.uk`

## Executive Verdict

Punctuation QG P3 is complete.

P3 transformed the Punctuation question generator from a hand-authored bank of template objects into a teacher-authorable DSL system with golden marking tests, preview tooling, and reviewer-grade audit output. The runtime path is unchanged — the DSL is an authoring-time normaliser that expands into the same flat template arrays the production system has always consumed.

Production volume remains frozen at the P2 baseline. No learner-visible change occurred. The system is strictly more reviewable, testable, and extensible without being larger.

## Final Production-Shape Figures

| Metric | Final P3 value | P2 value | Why it matters |
| --- | ---: | ---: | --- |
| Release id | `punctuation-r4-full-14-skill-structure` | same | Anchors all evidence to a named release. |
| Fixed items | 92 | 92 | Human-authored anchors unchanged. |
| Published generator families | 25 | 25 | Deterministic generator surface unchanged. |
| Generated variants per family | 4 | 4 | Production volume frozen. |
| Generated runtime items | 100 | 100 | 25 families x 4 variants. |
| Total runtime items | 192 | 192 | Fixed (92) + generated (100). |
| Published reward units | 14 | 14 | Reward denominator unchanged. |
| Generated duplicate signatures | 0 | 0 | Hard uniqueness gate clean. |
| Generated duplicate stems | 3 | 3 | Review signal (not a gate). |
| Generated duplicate models | 22 | 22 | Review signal (not a gate). |
| DSL-backed families | 7 | 0 | New: structured authoring. |
| Golden marking test cases | 264 | 0 | New: accept/reject coverage. |
| DSL templates (total across 7 families) | 56 | — | 8 per converted family. |
| Audit-only capacity signatures (depth 8) | 56 | — | 8 distinct per converted family. |

The most important product conclusion: **P3 makes authoring safer without making the bank bigger.** All production metrics are identical to P2. The new infrastructure (DSL, golden tests, preview CLI, audit reviewer mode) is invisible to learners and purely additive for authors and reviewers.

## Completion Ledger

| Unit | Commit | Purpose |
| --- | --- | --- |
| U1 | `e959f19` | Add template DSL module and expansion function |
| U6 | `0766fdc` | Codify context-pack teacher/admin-only policy with runtime guard |
| U7 | `9cb7a73` | Strengthen redaction contract to explicit fail-closed characterisation |
| U2 | `3d422ea` | Convert 7 priority families to DSL-backed definitions with parity |
| U3 | `f87a82c` | Add golden accept/reject marking tests for all DSL-backed templates |
| U4 | `0520ac5` | Add author preview CLI for generated template variants |
| U5 | `e44f689` | Add audit reviewer report and per-family capacity thresholds |
| Fix | `b125441` | Address review findings — context-pack test guard and tests-field leak assertion |

## What P3 Changed

### U1 — Template DSL Module

Created `shared/punctuation/template-dsl.js` with two exports:

- **`definePunctuationTemplate(spec)`** — validates and freezes a teacher-authored DSL definition with `id`, `familyId`, `mode`, `skillIds`, `slots`, `build()`, and `tests`.
- **`expandDslTemplates(dslDefinitions, options)`** — expands slot combinations via deterministic lexicographic cartesian product into flat template arrays compatible with `GENERATED_TEMPLATE_BANK`.

Key design decisions:
- Manifest-leaf pattern: zero imports from sibling punctuation modules. Hash utilities (FNV-1a) copied inline to maintain independence.
- Deterministic expansion: sort slot keys alphabetically, then produce the cartesian product in lexicographic order.
- All output frozen with `Object.freeze`.
- `embedTemplateId: false` mode preserves content-hash-based template IDs for backward compatibility with existing families.

### U2 — Convert Seven Priority Families

Created DSL family files in `shared/punctuation/dsl-families/`:

| Family | File | Templates | Distinct signatures (depth 8) |
| --- | --- | ---: | ---: |
| `gen_sentence_endings_insert` | `sentence-endings-insert.js` | 8 | 8 |
| `gen_apostrophe_contractions_fix` | `apostrophe-contractions-fix.js` | 8 | 8 |
| `gen_comma_clarity_insert` | `comma-clarity-insert.js` | 8 | 8 |
| `gen_dash_clause_fix` | `dash-clause-fix.js` | 8 | 8 |
| `gen_dash_clause_combine` | `dash-clause-combine.js` | 8 | 8 |
| `gen_hyphen_insert` | `hyphen-insert.js` | 8 | 8 |
| `gen_semicolon_list_fix` | `semicolon-list-fix.js` | 8 | 8 |

Each file replaces the corresponding hand-authored entry in `GENERATED_TEMPLATE_BANK`. A characterisation snapshot (`tests/fixtures/punctuation-qg-p3-parity-baseline.json`) locks the exact production output before and after conversion.

### U3 — Golden Accept/Reject Marking Tests

Every DSL-backed template now carries a `tests: { accept: [...], reject: [...] }` object with at least 4 golden cases per template.

Coverage summary:
- **56 templates** tested across 7 families
- **96 accept cases** pass `markPunctuationAnswer()` as correct
- **168 reject cases** fail `markPunctuationAnswer()` as incorrect
- **Total: 264 golden marking cases**

Specific marking-policy coverage:
- Dash templates: accept spaced hyphen ` - `, en dash `–`, and em dash `—`
- Apostrophe templates: accept straight `'` and curly `'`
- Semicolon-list templates: reject comma-only lists
- Sentence-ending templates: distinguish question marks from exclamation marks
- Comma-clarity templates: verify correct vs incorrect comma position

### U4 — Author Preview CLI

New command: `npm run preview:punctuation-templates`

```bash
npm run preview:punctuation-templates -- --family gen_dash_clause_combine --variants 8
npm run preview:punctuation-templates -- --family gen_dash_clause_combine --variants 8 --json
npm run preview:punctuation-templates -- --all --variants 4
```

Per-variant output includes: item ID, family ID, template ID, variant signature, mode, skill IDs, cluster ID, prompt, stem, model answer, validator type, rubric type, misconception tags, readiness tags, and golden test results (pass/fail per case).

Exit code: 0 if all golden tests pass, 1 if any fail.

### U5 — Audit Reviewer Report

New `--reviewer-report` flag on `npm run audit:punctuation-content`:

```bash
npm run audit:punctuation-content -- --strict --generated-per-family 4 --reviewer-report
```

Surfaces 11 informational quality signals beyond the strict gate:
1. Top duplicate generated stems
2. Top duplicate generated models
3. Per-family spare capacity at depth 8
4. Per-skill mode coverage
5. Per-skill validator/rubric coverage
6. Per-family template count (DSL vs legacy)
7. Per-family signature count
8. Generated model-answer marking failures
9. Templates missing accept/reject tests
10. Templates with no alternate-answer test
11. Families using legacy non-DSL templates

Per-family capacity thresholds (`--min-signatures-by-family`) enable strict capacity-mode audit for converted families.

### U6 — Context-Pack Policy

Explicit decision: **context packs are teacher/admin-only in P3.**

- `CONTEXT_PACK_POLICY = 'teacher_admin_only'` exported from `context-packs.js`
- Runtime guard in `createPunctuationRuntimeManifest()` throws if `contextPack` is truthy without `allowContextPacks: true`
- No code change was needed to the production path (it already passes no contextPack)
- The guard prevents accidental future leakage without a deliberate opt-in

Rationale: context-pack-generated content is not teacher-reviewed. Learner-facing questions must come from deterministic, reviewed templates. If context packs are expanded in a future phase, they must pass through a review gate first.

### U7 — Redaction Contract

Verified that the system is **fail-closed in all environments**:

- `assertNoForbiddenReadModelKeys()` in `worker/src/subjects/punctuation/read-models.js` already throws (not strips) when forbidden keys are present
- The sole exception (`variantSignature` on active `session.currentItem`) is correctly preserved
- `variantSignature` is correctly stripped from feedback-phase `currentItem`

Added 10 characterisation tests proving:
- Every key in `FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS` throws when injected into any read-model section (summary, stats, analytics, prefs, availability, nested)
- The mechanism is throw-not-strip, with error message naming the leaked key
- Clean generated items pass with zero forbidden keys

No documentation wording was found that contradicted the implementation (the existing comment at line 346 already correctly states "Throws rather than silently stripping").

## Prompt/Stem/Model Drift Report

**No drift occurred.** All 7 converted families produce identical output at `generatedPerFamily = 4` to their pre-conversion hand-authored definitions. This is verified by:

1. The characterisation baseline fixture (`tests/fixtures/punctuation-qg-p3-parity-baseline.json`) which locks the exact pre-conversion output
2. The parity test (`tests/punctuation-dsl-conversion-parity.test.js`) which asserts deep equality of id, variantSignature, templateId, prompt, stem, model, validator, misconceptionTags, and readiness for all 28 production items (7 families x 4 variants)
3. The total runtime manifest count assertion (192 items)

No intentional drift was introduced. The DSL conversion is purely representational — the teacher-facing content is identical.

## Duplicate Stem/Model Review Summary

| Metric | Count | Note |
| --- | ---: | --- |
| Duplicate generated stems | 3 | Review signal only; different families sharing similar prompts |
| Duplicate generated models | 22 | Expected: multiple families may produce the same target sentence (e.g., same corrected form from different error types) |

These are not hard failures. They are surfaced in the new `--reviewer-report` output for teacher review. The duplicate-signature gate (the hard safety check) shows 0 duplicates.

## Golden Accept/Reject Test Summary

| Family | Templates | Accept cases | Reject cases | Total cases | All pass? |
| --- | ---: | ---: | ---: | ---: | --- |
| `gen_sentence_endings_insert` | 8 | 8 | 24 | 32 | Yes |
| `gen_apostrophe_contractions_fix` | 8 | 16 | 24 | 40 | Yes |
| `gen_comma_clarity_insert` | 8 | 8 | 24 | 32 | Yes |
| `gen_dash_clause_fix` | 8 | 24 | 24 | 48 | Yes |
| `gen_dash_clause_combine` | 8 | 24 | 24 | 48 | Yes |
| `gen_hyphen_insert` | 8 | 8 | 24 | 32 | Yes |
| `gen_semicolon_list_fix` | 8 | 8 | 24 | 32 | Yes |
| **Total** | **56** | **96** | **168** | **264** | **Yes** |

## Redaction-Contract Decision and Evidence

**Decision:** Fail-closed in all environments. The guard throws when forbidden keys are present. Production smoke catches deployed leakage.

**Evidence:**
- 10 characterisation tests in `tests/punctuation-read-models.test.js` prove the contract
- Every key in `FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS` is individually tested
- The `variantSignature` allowance on active `currentItem` is documented and tested
- No code path silently strips instead of throwing

## Context-Pack Policy Decision

**Decision:** Teacher/admin-only in P3.

**Rationale:** Context-pack templates are generated from learner-provided content atoms (names, places, phrases). They have not been teacher-reviewed to the standard required for learner-facing questions. Exposing them would violate the "no runtime AI question generation" rule (P3 non-negotiable rule 1) and the "no learner-facing exposure of generated metadata" rule (rule 6).

**Implementation:** `CONTEXT_PACK_POLICY = 'teacher_admin_only'` constant + runtime guard that throws unless `allowContextPacks: true` is explicitly passed.

**Future path:** If context packs are expanded in P4+, they must pass through a teacher review gate where AI-generated atoms are compiled into deterministic template inputs.

## Preview-Tool Examples

```bash
# Single family, production depth
$ npm run preview:punctuation-templates -- --family gen_dash_clause_combine --variants 4

═══════════════════════════════════════════════════════════════
  Item ID:            gen_dash_clause_combine_1fstitn_1
  Family ID:          gen_dash_clause_combine
  Template ID:        gen_dash_clause_combine_template_1y5wkx
  Variant Signature:  puncsig_cntndu
  Mode:               combine
  Skill IDs:          dash_clause
  Cluster ID:         boundary
  Prompt:             Combine the two related clauses into one sentence with a dash.
  Stem:               The bell rang.\nEveryone hurried inside.
  Model Answer:       The bell rang – everyone hurried inside.
  Validator Type:     combineBoundaryBetweenClauses
  Rubric Type:        (none)
  Misconception Tags: boundary.dash_missing
  Readiness Tags:     constrained_transfer, misconception, negative_test
  Golden Tests:       ALL PASSED
    Accept cases:
      [PASS] "The bell rang – everyone hurried inside."
      [PASS] "The bell rang - everyone hurried inside."
      [PASS] "The bell rang — everyone hurried inside."
    Reject cases:
      [PASS] "The bell rang.\nEveryone hurried inside."
      [PASS] "The bell rang, everyone hurried inside."
      [PASS] "everyone hurried inside – The bell rang."
═══════════════════════════════════════════════════════════════

# JSON mode for CI diffing
$ npm run preview:punctuation-templates -- --family gen_dash_clause_combine --variants 4 --json
[{"id":"gen_dash_clause_combine_1fstitn_1","familyId":"gen_dash_clause_combine",...}]

# All families at capacity depth
$ npm run preview:punctuation-templates -- --all --variants 8
```

## Commands Run

```bash
# Production audit (strict, depth 4)
npm run audit:punctuation-content -- --strict --generated-per-family 4
# Result: PASS — 192 items, 0 duplicate signatures, 25 families, 14 reward units

# Capacity audit (strict, depth 8, converted families)
npm run audit:punctuation-content -- --strict --generated-per-family 8 \
  --min-signatures-by-family gen_sentence_endings_insert=8,gen_apostrophe_contractions_fix=8,gen_comma_clarity_insert=8,gen_dash_clause_fix=8,gen_dash_clause_combine=8,gen_hyphen_insert=8,gen_semicolon_list_fix=8
# Result: PASS — all 7 converted families have 8 distinct signatures

# Preview tool
npm run preview:punctuation-templates -- --family gen_dash_clause_combine --variants 8
npm run preview:punctuation-templates -- --family gen_dash_clause_combine --variants 8 --json
# Result: renders correctly with golden test results

# Test suite (108 tests, 0 failures)
node --test tests/punctuation-generators.test.js
node --test tests/punctuation-content-audit.test.js
node --test tests/punctuation-template-dsl.test.js
node --test tests/punctuation-context-pack-policy.test.js
node --test tests/punctuation-dsl-conversion-parity.test.js
node --test tests/punctuation-golden-marking.test.js
node --test tests/punctuation-preview-cli.test.js
node --test tests/punctuation-read-models.test.js
node --test tests/punctuation-ai-context-pack.test.js
```

## Residual Risks

### Risk: Duplicated hash utilities between template-dsl.js and generators.js

The manifest-leaf pattern means template-dsl.js re-implements FNV-1a hash, normalisation, and signature logic. A future correctness fix must be applied in both places. Mitigation: a shared `hash-utils.js` module could be extracted in P4 without changing the leaf-module boundary property.

### Risk: Cartesian product machinery is forward-looking

All 7 converted families currently use a degenerate 1:1 slot pattern (one value per slot per definition). The multi-slot cartesian expansion is tested synthetically but has no real consumer yet. This is intentional — future families will introduce true slot variability. The parity constraint prevents true slot reuse until P4+ relaxes the backward-compat requirement.

### Risk: Duplicate stems/models are review signals only

3 duplicate stems and 22 duplicate models exist across the full generated bank. These are expected (different families produce the same corrected form from different error types) but should be reviewed by content team before P4 raises production depth.

### Risk: Generated items carry template metadata in GENERATED_TEMPLATE_BANK

The `tests` field lives on templates in the bank (for golden test runner access). `buildGeneratedItem()` does not propagate it — this is asserted by the tests-field leak guard. However, any code importing the bank directly could access answer information. The bank is only imported by server-side scripts and tests, never by the client bundle.

## Test Summary

| Test file | Tests | Status |
| --- | ---: | --- |
| `punctuation-generators.test.js` | 9 | Pass |
| `punctuation-content-audit.test.js` | 26 | Pass |
| `punctuation-template-dsl.test.js` | 12 | Pass |
| `punctuation-context-pack-policy.test.js` | 4 | Pass |
| `punctuation-dsl-conversion-parity.test.js` | 6 | Pass |
| `punctuation-golden-marking.test.js` | 7 | Pass |
| `punctuation-preview-cli.test.js` | 8 | Pass |
| `punctuation-read-models.test.js` | 36 | Pass |
| **Total** | **108** | **Pass** |

## Recommendation on P4

**P4 should start.** P3 has built the infrastructure that P4 needs:

1. The DSL makes it safe to add new template variants — golden tests catch marking regressions instantly.
2. The preview CLI lets content reviewers see generated variants without running a learner session.
3. The audit reviewer report surfaces quality signals (duplicates, coverage gaps, capacity headroom) that P4's evidence and scheduler work will need.
4. The capacity-mode audit proves that all 7 converted families already have 8 distinct signatures — P4 can safely raise production depth for these families if evidence warrants it.

P4's likely focus (from the origin document):
- Spaced-return requirements by skill
- Varied-evidence requirements before deep secure
- Sibling-template retry after misconception
- Per-signature exposure limits
- Generated-repeat-rate telemetry
- Weak-skill recovery analytics
- Retention-after-secure checks

P4 should also convert the remaining 18 non-DSL families to structured definitions before raising production volume, ensuring the full bank has golden test coverage.
