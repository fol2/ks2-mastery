---
title: DSL-as-normaliser-layer for zero-regression content authoring
date: 2026-04-28
category: architecture-patterns
module: punctuation-qg
problem_type: architecture_pattern
component: tooling
severity: low
applies_when:
  - hand-authored generator families exceed 20 and drift risk grows
  - teacher-authored specs must normalise into flat template arrays without runtime change
  - characterisation snapshots must lock production output before conversion
  - golden accept/reject marking tests required for template correctness
  - content systems need both author-time tooling and runtime stability guarantees
tags:
  - dsl
  - authoring-time-normaliser
  - punctuation
  - question-generation
  - template-expansion
  - zero-runtime-change
  - characterisation-testing
  - golden-marking-tests
---

# DSL-as-normaliser-layer for zero-regression content authoring

## Context

The Punctuation question generator had 25 hand-authored families in a frozen object literal (`GENERATED_TEMPLATE_BANK`, 1877 lines in `shared/punctuation/generators.js`). Each family was a flat array of template objects with fields: prompt, stem, model, validator, misconceptionTags, readiness. Authoring was error-prone:

- Metadata (skillIds, clusterId, rewardUnitId, mode) was duplicated across every template in a family
- No built-in marking tests — model answers were verified at audit time only
- No preview tooling — content reviewers had to run a learner session or read raw code
- Audit output was pass/fail only — no quality signals for reviewers
- No structured way to add templates safely

P2 had made the system governable (release gates, content audit CI, redaction contracts). P3 needed to make it authorable without disturbing the frozen production output (192 runtime items, 4 variants/family, 14 reward units).

## Guidance

### Pattern: DSL-as-normaliser-layer

Define an author-facing DSL that expands via a deterministic normaliser into the SAME flat data shape the runtime already consumes. The runtime path sees zero change — the DSL is invisible at runtime.

**Core architecture:**

```
Teacher-Authored DSL Definition
  { id, familyId, slots, build(), tests }
         │ expandDslTemplates()
         ▼
Flat Template Array (same shape as before)
  [{ prompt, stem, model, validator, ... }]
         │ injected into GENERATED_TEMPLATE_BANK
         ▼
Existing Runtime (unchanged)
  pickTemplate() → buildGeneratedItem() → runtime items
```

**Three composing sub-patterns:**

1. **Characterisation-first conversion** — Before converting any family, snapshot exact production output (item IDs, variant signatures, prompts, stems, models) as a fixture file. After conversion, assert deep equality. The snapshot IS the regression test — any drift is immediately visible in the test diff.

2. **Golden marking tests** — Each DSL template carries `tests: { accept: [...], reject: [...] }` cases that travel with the template. A test runner builds generated items from expanded templates and calls the production marking function against each case. Minimum 4 cases per template: model answer (accept), misconception (reject), legitimate alternate (accept/reject), false-positive guard (reject).

3. **Incremental adoption** — Conversion is family-by-family. Non-converted families continue working from hand-authored arrays unchanged. The DSL module replaces entries in the existing bank one-at-a-time.

### Key implementation decisions

| Decision | Rationale |
|----------|-----------|
| `embedTemplateId: false` mode | Preserves content-hash-based template IDs for backward compatibility — the runtime computes IDs from content, not from DSL metadata |
| Three-tier pool (legacy/stable/capacity) | Determines which templates serve which variant indices without mixing production and expansion concerns |
| Manifest-leaf pattern (zero sibling imports) | DSL module copies hash utilities inline to avoid coupling to generators.js internals |
| Deterministic lexicographic cartesian product | Slot keys sorted alphabetically, values expanded in order — ensures template array is stable across runs |
| Runtime guard for context packs | `allowContextPacks: true` required explicitly; prevents accidental leakage into learner paths |

## Why This Matters

- **Zero-regression refactoring** of production content systems is hard. This pattern solves it by making the refactoring purely representational — the output shape never changes, so the runtime is unaffected.
- **Characterisation snapshots** work for ANY content/data transformation system where you need to prove "nothing changed" during a structural refactoring. The pattern is not specific to question generators.
- **Golden marking tests** eliminate the class of bugs where "template looks right but marking rejects the model answer." These travel with the template and are tested atomically — they cannot be forgotten or skipped.
- **Incremental adoption** means you can convert one family, verify it, merge, and repeat — avoiding big-bang migrations with their compounding risk.

## When to Apply

- Introducing structured authoring/DSL layers to existing content generation systems
- Converting hand-authored data to programmatic definitions without changing runtime behaviour
- Any system with frozen production output that must remain stable during authoring improvements
- Content systems needing both author-time tooling (preview, golden tests, audit reports) and runtime stability guarantees
- When the runtime path is proven correct and the problem is purely in the authoring/review workflow

**When NOT to apply:**
- Greenfield systems where you can define the output shape from day one
- Systems where output drift is acceptable (e.g., non-deterministic generators)
- Cases where the existing data shape is already well-structured and validated

## Examples

**Before (hand-authored, error-prone):**

```javascript
// shared/punctuation/generators.js — 8 templates per family, metadata repeated
GENERATED_TEMPLATE_BANK = {
  gen_dash_clause_combine: Object.freeze([
    {
      prompt: 'Combine the two related clauses into one sentence with a dash.',
      stem: 'The bell rang.\nEveryone hurried inside.',
      model: 'The bell rang – everyone hurried inside.',
      validator: { type: 'combineBoundaryBetweenClauses', mark: '–' },
      misconceptionTags: ['boundary.dash_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    // 7 more objects with repeated misconceptionTags, readiness, validator structure...
  ]),
};
```

**After (DSL-backed, single source of truth):**

```javascript
// shared/punctuation/dsl-families/dash-clause-combine.js
import { definePunctuationTemplate } from '../template-dsl.js';

export default [
  definePunctuationTemplate({
    id: 'dash_clause_combine_v1',
    familyId: 'gen_dash_clause_combine',
    mode: 'combine',
    skillIds: ['dash_clause'],
    clusterId: 'boundary',
    rewardUnitId: 'dash-clauses-core',
    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    slots: { variant: [0] },
    build({ variant }) {
      return {
        prompt: 'Combine the two related clauses into one sentence with a dash.',
        stem: 'The bell rang.\nEveryone hurried inside.',
        model: 'The bell rang – everyone hurried inside.',
        validator: { type: 'combineBoundaryBetweenClauses', mark: '–' },
      };
    },
    tests: {
      accept: [
        'The bell rang – everyone hurried inside.',
        'The bell rang - everyone hurried inside.',
        'The bell rang — everyone hurried inside.',
      ],
      reject: [
        'The bell rang.\nEveryone hurried inside.',
        'The bell rang, everyone hurried inside.',
        'everyone hurried inside – The bell rang.',
      ],
    },
  }),
  // Additional templates extend capacity without changing production variants
];
```

**Characterisation test (the regression guarantee):**

```javascript
// tests/punctuation-dsl-conversion-parity.test.js
test('DSL produces identical output at perFamily=4', () => {
  const items = createPunctuationGeneratedItems({ seed: BASELINE.seed, perFamily: 4 });
  const filtered = items
    .filter(i => PRIORITY_FAMILIES.includes(i.generatorFamilyId))
    .map(i => ({ id: i.id, variantSignature: i.variantSignature, prompt: i.prompt,
                 stem: i.stem, model: i.model, validator: i.validator }));
  assert.deepEqual(filtered, BASELINE.perFamily4); // Exact match or fail
});
```

**Golden marking test (the correctness guarantee):**

```javascript
// tests/punctuation-golden-marking.test.js
for (const item of expandedItems) {
  for (const acceptCase of template.tests.accept) {
    const result = markPunctuationAnswer({ item, answer: { typed: acceptCase } });
    assert.equal(result.correct, true, `Accept case failed: "${acceptCase}"`);
  }
  for (const rejectCase of template.tests.reject) {
    const result = markPunctuationAnswer({ item, answer: { typed: rejectCase } });
    assert.equal(result.correct, false, `Reject case passed: "${rejectCase}"`);
  }
}
```

## Related

- [Punctuation P7 stabilisation contract](punctuation-p7-stabilisation-contract-and-autonomous-sdlc-2026-04-28.md) — establishes the manifest-leaf and redaction contract patterns that P3 builds upon
- [pickBySeed modulo pattern](../logic-errors/seeded-prng-index-collision-pickbyseed-2026-04-28.md) — the deterministic selection function preserved through DSL expansion
- [Grammar P7 quality trust consolidation](grammar-p7-quality-trust-consolidation-and-autonomous-sdlc-2026-04-27.md) — the redaction contract and backward-compatibility re-export patterns
- [Admin Console P4 characterisation-first truthfulness](admin-console-p4-hardening-truthfulness-adversarial-review-2026-04-27.md) — the "test against production shapes, not assumed shapes" discipline
- [Grammar P6 normaliser at derivation boundary](grammar-p6-star-derivation-trust-and-server-owned-persistence-2026-04-27.md) — normaliser-pair pattern for derivation functions
- PR: [#552](https://github.com/fol2/ks2-mastery/pull/552) — implementation
- Plan: `docs/plans/2026-04-28-009-feat-punctuation-qg-p3-dsl-authoring-tools-plan.md`
- Completion report: `docs/plans/james/punctuation/questions-generator/punctuation-qg-p3-completion-report-2026-04-28.md`
