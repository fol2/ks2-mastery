# Grammar QG P23 — Post-Hardening Review, Table UI Fidelity, and Practice Rhythm Contract

Status: apply-ready patch package  
Base: `ks2-mastery-lean-05121226.zip`  
Primary evidence layer: uploaded ZIP and local ZIP runs  
GitHub layer: supplementary only  
Production layer: not certified by this package

## Purpose

P21 expanded the Grammar pool and P22 hardened scheduler performance and explanation distractor quality. P23 is a post-hardening subject review focused on two learner-facing weaknesses that remain inside Grammar itself:

1. Heterogeneous `table_choice` questions must keep row-specific options and accessibility labels through the Worker read model, so the React table-choice interface can show only the choices that make sense for each row.
2. Extended or focused Grammar sessions must avoid long runs of the same interaction shape when viable alternatives exist. Learners should not see nine `choose` questions in a row when the same focused concept has `classify`, `identify`, `fix`, `rewrite`, `build`, or `explain` alternatives.

The contract is deliberately narrow. It does not expand the content pool, change the content release id, or change mastery/reward semantics.

## Required implementation

### R1. Preserve table-row options in the safe read model

`worker/src/subjects/grammar/read-models.js` must preserve:

- safe top-level `inputSpec.options` as `{ value, label }` objects;
- row-level `inputSpec.rows[].options` for `table_choice` rows when present;
- row-level `ariaLabel` when present.

Row-level options must be string-normalised and must not leak answer-only metadata.

### R2. Regression coverage for heterogeneous table-choice items

A Worker/read-model test must start a Grammar session with a heterogeneous table-choice template and assert:

- raw item rows have row-specific options;
- the public read model keeps the same row option sets;
- the public read model keeps row labels and row aria labels;
- a row with four intended options does not silently fall back to all global columns.

### R3. Practice rhythm guard

`buildGrammarPracticeQueue` must avoid selecting a fourth consecutive item with the same `questionType` when alternatives are available inside the current candidate pool or broad fallback pool.

The guard may only soften ordering/rhythm. It must not:

- remove retry/similar/spaced lane semantics;
- force impossible variety when a concept/mode genuinely has no alternatives;
- change queue size;
- change content template metadata;
- change reward/mastery/Stars behaviour.

### R4. Practice rhythm regression coverage

A regression test must scan `smart`, `trouble`, and `satsset` queues across mixed practice and all Grammar focus concepts. For deterministic release seeds, the maximum same-question-type run in a 10-question queue must be `<= 3` whenever alternatives are available.

### R5. Perf tripwire hygiene in lean/runtime-mismatched environments

Existing performance tests must not fail merely because a skipped test incorrectly calls `test.skip()` from inside the test body or because the local ZIP runtime is below `.nvmrc` and lacks Node 22 module mocking. They must:

- use the correct `t.skip()` API;
- explicitly skip the call-count probe below Node 22;
- continue to run fully in the Node 22 release environment.

## Acceptance checks

Minimum local checks for this package:

```bash
git apply --check patches/001-grammar-qg-p23-table-row-options-and-practice-rhythm.patch
node --check worker/src/subjects/grammar/read-models.js
node --check worker/src/subjects/grammar/selection.js
node --test tests/grammar-engine-generation.test.js
node --test tests/grammar-selection-core-freshness.test.js
node --test tests/grammar-selection-perf-tripwire.test.js
node --test tests/grammar-qg-p9-table-choice-contract.test.js tests/grammar-qg-p10-table-render.test.js
node --test tests/grammar-qg-p21-local-repetition.test.js tests/grammar-qg-p21-pool-expansion.test.js
node scripts/audit-grammar-qg-p21-local-repetition.mjs --steps=60 --json
node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3 --json
npm run verify:grammar-qg-p21
```

Expected results:

- Patch applies cleanly to the supplied ZIP snapshot.
- Heterogeneous table-choice read model rows preserve row-specific options.
- Practice rhythm probe finds `0` same-question-type runs of length `>= 4` in the scanned 10-question queues.
- P21 local repetition audit remains `pass`, with `0` violations and `0` warnings.
- Content quality seeds `1..3` remain `0` hard failures and `0` advisories.
- P21 verification remains green.

## Non-goals

P23 does not:

- add templates;
- bump `GRAMMAR_CONTENT_RELEASE_ID`;
- change marking semantics;
- change reward, Stars, monster, Hero, or mastery systems;
- certify live production.

## Release-readiness boundary

This package proves local ZIP-snapshot behaviour only. Before live rollout, run the Node 22 release gate and production smoke required by the normal Grammar release process.
