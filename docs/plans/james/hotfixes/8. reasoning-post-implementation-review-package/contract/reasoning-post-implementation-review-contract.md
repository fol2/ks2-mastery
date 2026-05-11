# Reasoning post-implementation review contract

## Source boundary

Primary authority: uploaded ZIP `/mnt/data/ks2-mastery-lean-05111556.zip`.

This contract is for the Reasoning subject only. It does not make claims about live production deployment. Local validation proves behaviour for the extracted ZIP snapshot after the patch is applied.

ZIP identity:

- SHA-256: `596ac6308b01dc16150d584123f9c00303bd102e73b3b977aea034ef852d108b`
- Integrity: `unzip -t` passed.
- Runtime observed locally: Node `v22.16.0`, matching the ZIP `.nvmrc` major version expectation.
- `npm test` could not run through package preflight because `node_modules` is absent in the lean extraction. Direct `node --test` targeted tests were run.

## Scope

Reasoning-only scope:

- `shared/reasoning/content.js`
- `worker/src/subjects/reasoning/engine.js`
- `src/subjects/reasoning/components/ReasoningPracticeSurface.jsx`
- `tests/reasoning-content-contract.test.js`
- `tests/reasoning-engine-rewards.test.js`

No changes are made to other subject engines, shared monster art, arithmetic, spelling, grammar, punctuation, reading content, or global reward semantics outside the Reasoning evidence event boundary.

## Findings fixed

### R1 — Malformed generated fraction error-analysis questions

The implemented Reasoning bank generated malformed learner-facing maths text for `fraction_error_analysis` at some seeds. Example failure pattern from the baseline audit:

- `undefined` numerator values.
- `NaN` wrong answers and solution lines.

Root cause: one branch selected `b` from an empty filtered array when the denominator and `a` left no valid `b` option.

Patch: choose `a` and `b` with safe bounded integer ranges so `a + b < denominator` is always true for the template's denominator choices.

### R2 — Seeded item-id drift in `reason_better_estimate`

The `reason_better_estimate` template sometimes recursively generated a different seed when the two estimates tied. This produced a question whose `itemId` did not match the requested `templateId:seed`.

This is a real Worker contract risk because session refs, safe question IDs, and answer submission expected-question checks depend on deterministic item IDs.

Patch: keep the public item ID tied to the requested seed while using a guarded internal alternate seed only for choosing non-tied parameters.

### R3 — First-wrong feedback leaked full worked-solution metadata to the browser read model

The implemented engine returned the safe question with feedback included even at the first-wrong nudge stage. The UI did not necessarily display the solution immediately, but the client read model contained solution material before support/finalisation.

Patch: first-wrong feedback now returns only the nudge-level safe question. Full solution/check/reflection data is included only after support is requested or the answer is finalised.

### R4 — Support could be requested before learner effort and in strict modes

Reasoning was designed around independent first attempts by default. The implemented command path allowed support requests before an attempt, and the UI showed support controls immediately for non-strict modes.

Patch:

- Worker blocks support before effort unless the session is explicitly in a teaching presentation (`worked` or `faded`) or already has seeded support.
- Worker blocks support in strict SATs sessions and after the question has already been marked.
- UI hides support controls until the learner has received first-wrong feedback, or until a teaching mode has seeded support.

### R5 — Worked/Faded modes were named but not structurally seeded

The session presentation field changed to `worked` or `faded`, but the engine did not seed support state. This made the modes behave more like independent practice.

Patch: `worked` sessions start with support level 2 for the active question refs; `faded` sessions start with support level 1. The read model can then expose the intended scaffolding consistently.

### R6 — Duplicate evidence-earned events

If the same mastery key was already present, the domain event `reasoning.evidence-earned` could still be emitted even though the evidence key was not new. This could pollute event consumers and analytics even where the monster projection avoided duplicate state.

Patch: `reasoning.evidence-earned` is emitted only when the mastery key is newly added. The answer/practice events still record the attempt.

## Non-goals

This patch does not:

- change Reasoning monster thresholds;
- change the 100-star/mega/grand-monster evidence model;
- change Hero Mode economics;
- add new templates;
- touch other subjects;
- claim live Cloudflare/D1 production deployment.

## Apply instructions

From a fresh extraction of `ks2-mastery-lean-05111556.zip`:

```bash
patch -p1 < patches/002-reasoning-post-implementation-review.patch
```

## Acceptance checks

Minimum checks after applying:

```bash
node --test \
  tests/reasoning-content-contract.test.js \
  tests/reasoning-engine-rewards.test.js \
  tests/reasoning-subject-registry.test.js \
  tests/reasoning-production-smoke.test.js \
  tests/hero-reasoning-integration.test.js
```

Expected result: `18/18` pass.

Recommended content audit: generate 20 seeds for each of the 110 Reasoning templates and verify:

- no generator throws;
- no `undefined`, `NaN`, `Infinity`, or `[object Object]` learner-facing text;
- `itemId === templateId:seed` for all generated questions.

Expected result: `2,200` checked, `0` failures.
