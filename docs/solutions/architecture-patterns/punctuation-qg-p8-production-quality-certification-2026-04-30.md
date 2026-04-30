---
title: "Punctuation QG P8 — Production Question-Quality Certification Architecture"
date: 2026-04-30
category: architecture-patterns
module: punctuation-qg
problem_type: architecture_pattern
component: testing_framework
severity: high
tags:
  - question-generation
  - production-certification
  - marking-oracle
  - preservation-oracle
  - negative-vectors
  - reviewer-decisions
  - verb-frame-detection
  - evidence-gate
applies_when:
  - "Building production certification for question-generator content"
  - "Adding quality gates to generated educational content"
  - "Implementing per-item QA review systems with machine-enforced gates"
---

# Punctuation QG P8 — Production Question-Quality Certification Architecture

## Context

Punctuation QG P8 addressed a fundamental quality gap: closed-form questions (insert/fix/combine/speech-marking) could accept technically-punctuated but semantically broken answers. The phase produced 15 PRs establishing 7 architectural patterns that enforce correctness at the marking layer rather than at test-time or authoring-time alone.

The core insight is that validation belongs where marking happens — not upstream in metadata, not downstream in tests — so every consumer of the marking function inherits the protection automatically.

The codebase already had 31 "markExact" items (exact string match) that were inherently strict. The challenge was 12 validator-based items plus ~170 transfer/speech items where flexible marking created loopholes for nonsense, fragment, or content-altered answers to pass.

## Guidance

### Pattern 1: Enforcement belongs in the marking layer

Place validation logic inside the production marking function (`markPunctuationAnswer()` or equivalent). This guarantees every code path — practice, assessment, replay, admin preview — gets the same enforcement. Never rely on test-only assertions or authoring-time flags to reject bad answers at runtime.

```javascript
// Inside markPunctuationAnswer(), not in a test helper
function evaluatePreservation(answer, item) {
  const expectedTokens = derivePreserveTokens(item.stem);
  const answerWords = tokenise(answer);
  if (answerWords.length - expectedTokens.length > 2) return { preserved: false };
  if (!wordSequencePreserved(answer, expectedTokens)) return { preserved: false };
  return { preserved: true };
}
```

### Pattern 2: Decompose composite correctness into independent facets

When a question type has multiple independent failure modes, assign each its own facet. Feedback shows the highest-priority failure only — children fix one thing at a time.

For speech marking, 5 independent facets in priority order:
1. `quote_variant` — inverted commas present
2. `speech_punctuation` — end-punct inside closing mark
3. `reporting_clause` — comma between clause and speech
4. `reporting_clause_words` — clause word preservation
5. `preservation` — spoken word fidelity

### Pattern 3: Verb-frame detection via wordlist (no NLP)

For KS2-level transfer items, a 656-form common verb set (~100 base verbs with inflections) distinguishes real sentences from nonsense. Three conditions: word count >= 5, at least one non-required word, at least one non-required verb. No NLP dependency, deterministic.

```javascript
function evaluateMeaningfulness(text, validator, item) {
  const words = tokenise(text);
  if (words.length < (validator.minMeaningfulWords ?? 5)) return { meaningful: false };
  const nonRequired = words.filter(w => !requiredTokens.has(w));
  if (nonRequired.length === 0) return { meaningful: false };
  if (!nonRequired.some(w => COMMON_VERB_FORMS.has(w.toLowerCase()))) return { meaningful: false };
  return { meaningful: true };
}
```

### Pattern 4: Production code as test oracle for negative vectors

Store negative vectors (wrong answers) as fixtures. At test time, run each through the actual production marking function and assert failure. The marker IS the oracle — no string comparisons, no mocks.

```json
{
  "vectors": [
    { "itemId": "lc_insert_supplies", "answer": "We needed pencils, rulers and glue in the cupboard.", "failureType": "extra_words" }
  ]
}
// Test: vectors.forEach(v => assert(markPunctuationAnswer(item, v.answer).correct === false))
```

### Pattern 5: Content-hashed cluster IDs

Generate stable identifiers via `SHA-256(sorted member IDs + type)`, truncated to 12 chars with type prefix. Deterministic, insertion-order-independent, survives reorderings.

### Pattern 6: Identical-rationale rejection

When a gate requires per-item review evidence, reject submissions where ALL rationale strings are identical. Catches auto-fill and copy-paste patterns that satisfy structural requirements without genuine review.

### Pattern 7: Evidence-check additivity for depth activation

Each phase adds checks to a pure-function gate with a monotonically growing evidence array. P7: 9 checks, P8: 14 checks. New checks are additive — old checks never removed, existing passing states never broken. Callers compute evidence externally; the gate just evaluates booleans.

## Why This Matters

**Correctness by construction, not by convention.** When enforcement lives in the marking layer, you cannot accidentally bypass it. A new UI, practice mode, or replay surface all inherit the validation.

**Child-appropriate feedback.** Faceted marking enables priority-ordered feedback. A child who gets inverted commas wrong does not simultaneously see comma placement errors — they fix one layer at a time.

**No false confidence from test suites.** Negative vectors proven through the production marker give genuine confidence. 189 vectors across 10 failure types prove that wrong answers actually fail.

**Sustainable quality growth.** The additive evidence-gate pattern means each phase raises the bar without destabilising previous phases.

## When to Apply

- **Marking-layer enforcement**: Any flexible answer-checking function called by multiple code paths
- **Facet layering**: Question types with 3+ independent ways to be wrong requiring targeted feedback
- **Verb-frame detection**: KS2/primary-level free-text items rejecting nonsense without NLP
- **Fixture-as-oracle**: Complex marking logic where you cannot trivially reason about all failure cases
- **Content-hashed IDs**: Grouping items into clusters/sets needing stable references across reorderings
- **Identical-rationale rejection**: Gates accepting free-text evidence per item where bulk-fill is a threat
- **Additive evidence gates**: Multi-phase projects where each phase raises quality requirements

## Examples

**Before P8:** `lc_insert_supplies` with answer "We needed pencils, rulers and glue in the cupboard." marked CORRECT (extra tail accepted by flexible validator).

**After P8:** Same answer marked INCORRECT with `content_preservation` facet failure and feedback "You changed the sentence — only add or fix the punctuation."

**Before P8:** `ac_transfer_contractions` with "Can't we're." marked CORRECT (tokens present, punctuation valid).

**After P8:** Same answer marked INCORRECT — fails verb-frame check (no verb outside required tokens) with feedback "Include your punctuated forms in a complete sentence."

**Before P8:** Speech item with "Tom shouted" instead of "Ella asked" marked CORRECT (valid speech punctuation).

**After P8:** Marked INCORRECT with `reporting_clause_words` facet failure and feedback "Keep the reporting clause from the question."

**Verification cascade (37 gates):**
```
verify:p8 → verify:p7 (27 logical) → verify:p6 → verify:p5 → verify:p4 → base
         → preservation oracle tests
         → speech reporting-clause tests
         → meaningful transfer tests
         → negative vector tests (189 vectors × markPunctuationAnswer)
         → reviewer pack v3 schema tests
         → explanation QA lint
         → production QA gate (real fixture, 192 decisions)
         → feedback specificity tests
         → depth-6 readiness gate
         → production decisions (real fixture load)
```

## Related

- `docs/solutions/architecture-patterns/punctuation-qg-p7-production-trust-hardening-2026-04-29.md` — direct predecessor (direction-aware speech, empty-fails invariant, semantic lint)
- `docs/solutions/architecture-patterns/evidence-locked-production-certification-2026-04-29.md` — cross-subject meta-pattern (manifest-driven, fail-closed certification)
- `docs/solutions/architecture-patterns/grammar-qg-p8-production-marker-as-test-oracle-2026-04-29.md` — Grammar sibling (markByAnswerSpec oracle, defence-in-depth audit rules)
- `docs/solutions/architecture-patterns/punctuation-qg-p6-production-quality-acceptance-architecture-2026-04-29.md` — P6 predecessor (characterisation-first, fairness validation)
- PRs: #657, #661, #664, #667, #673, #676, #679, #680, #694, #695, #696, #700, #706, #707
