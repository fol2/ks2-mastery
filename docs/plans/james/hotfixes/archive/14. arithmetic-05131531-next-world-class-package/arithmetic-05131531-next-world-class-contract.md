# Arithmetic 05131531 next world-class hardening contract

## Source boundary

Primary source snapshot: `ks2-mastery-lean-05131531.zip`.

Source ZIP SHA-256: `e1f6c8a068734e7a0faf1d2f450b9f3d9df57532872bac5ec8b849faa3005298`.

GitHub `main` is the production release baseline for this package. The original ZIP remains the source snapshot that exposed the Arithmetic findings; the final patch is authored against current `origin/main` so it can be applied, reviewed, and deployed without drift.

## Scope

Arithmetic subject only.

In scope:

- `shared/arithmetic/content.js`
- `tests/worker-arithmetic-runtime.test.js`
- `scripts/build-bundles.mjs` as release-gate stabilisation only.
- Arithmetic marking, procedural question quality, and Arithmetic-specific learner-facing presentation.
- Full-repository validation evidence needed before production deployment.

Out of scope:

- Other subjects.
- Global reward/monster systems except by validating Arithmetic does not alter the contract.
- Full React/Vite build certification from a lean ZIP without installed dependencies.

## Contract changes

1. Numeric marking must keep useful tolerance for correct UK thousands separators, but malformed comma grouping must not be accepted. `1,234` remains valid for `1234`; `12,34` and `1,23,4` are rejected.

2. Division answers that explicitly allow zero-remainder notation still accept well-formed comma grouping, such as `1,234 r 0`, but reject malformed comma grouping in the same notation.

3. Fraction marking must reject signed denominators and double-negative fraction forms for positive answers. `-1/-2` is not a valid KS2 answer for `1/2`.

4. Formal written-method visuals must not place thousands commas inside algorithm rows. The calculated answer and solution text may still use UK formatted numbers, but column/short/long written layouts use plain digit strings.

5. Order-of-operations generation gets additional exact, whole-number structures across difficulty bands while preserving non-negative whole-number outcomes.

6. Existing Arithmetic contracts remain stable: 30 templates, 90 reward units, isolated Worker marking, delayed True Test marking, blank-submission protection, reward-unit evidence, and redacted read models.

7. Repository release validation must be stable under the default Node test runner. Bundle generation shares the existing public-build lock so build-facing tests cannot race each other while producing the same build artefacts.

## Patch files

- `scripts/build-bundles.mjs`
- `shared/arithmetic/content.js`
- `tests/worker-arithmetic-runtime.test.js`

## Apply command

From repository root:

```bash
patch -p1 < arithmetic-05131531-next-world-class.patch
```

`git apply arithmetic-05131531-next-world-class.patch` is also valid from the repository root.

## Required validation after applying

```bash
node --check shared/arithmetic/content.js
node --check tests/worker-arithmetic-runtime.test.js
node --check scripts/build-bundles.mjs
node --check worker/src/subjects/arithmetic/engine.js
node --check worker/src/subjects/arithmetic/commands.js
node --check src/subjects/arithmetic/command-actions.js
node --test tests/worker-arithmetic-runtime.test.js
npm test
npm run check
```

Full repository CI/build should still run in an installed dependency environment.
