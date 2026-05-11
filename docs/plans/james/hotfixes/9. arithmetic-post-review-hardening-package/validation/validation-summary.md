# Validation summary

## Source

Source ZIP: `ks2-mastery-lean-05111556.zip`

Source ZIP SHA-256:

`596ac6308b01dc16150d584123f9c00303bd102e73b3b977aea034ef852d108b`

Patch file:

`patches/001-arithmetic-post-review-hardening.patch`

## Patch validation

Fresh ZIP extraction patch dry-run:

```text
checking file shared/arithmetic/content.js
checking file worker/src/subjects/arithmetic/engine.js
checking file src/subjects/arithmetic/command-actions.js
checking file tests/worker-arithmetic-runtime.test.js
```

Fresh ZIP extraction patch apply:

```text
patching file shared/arithmetic/content.js
patching file worker/src/subjects/arithmetic/engine.js
patching file src/subjects/arithmetic/command-actions.js
patching file tests/worker-arithmetic-runtime.test.js
```

## Static checks

Passed:

```bash
node --check shared/arithmetic/content.js
node --check worker/src/subjects/arithmetic/engine.js
node --check src/subjects/arithmetic/command-actions.js
```

## Tests

Passed:

```bash
node --test tests/worker-arithmetic-runtime.test.js
```

Result: 14/14 passed.

Passed:

```bash
node --test tests/worker-arithmetic-runtime.test.js tests/worker-admin-content-overview.test.js tests/monster-celebrations.test.js tests/ui-subject-theme-contract.test.js tests/ui-subject-visual-adapter-contract.test.js
```

Result: 56/56 passed.

## Custom probes

Baseline probe showed the reviewed ZIP had these issues:

- `2½` parsed as `21/2`, not `2 1/2`.
- 152 of the first 200 difficulty-2 order-of-operations seeds produced non-integer answers.
- Seed 96433 in place-value partition produced no missing box and an undefined expected value.
- Blank practice answer counted as 1 answered attempt and emitted an answer event.
- Blank short test wrote 12 recent attempts, 12 retries, and wrong skill evidence.

Post-patch probe result:

- `2½` parses to 2.5 and marks correctly.
- 0 non-integer difficulty-2 order-of-operations answers in the 1,000-seed probe.
- Place-value seed 96433 generates a valid missing-box item with expected value 700.
- Blank practice submit produces an error but 0 answered, 0 attempts, and 0 events.
- Blank short test has 0 answered, 0 attempts, 0 retries, and 0 wrong skill increments.

## Content audit

Custom content audit result:

- Template count: 30.
- Generated cases checked: 18,000.
- Correct-answer self-marks: 18,000.
- Unique stem/visual combinations: 13,943.
- Findings: 0.

## Environment limit

`npm test` could not run from this lean ZIP extraction because `node_modules` is missing. The preflight output says:

```text
Missing node_modules (react, esbuild) — run "npm install" from this worktree root before "npm test".
```

That is an environment limitation of the lean ZIP, not a failing Arithmetic assertion. CI/release should still run the full build/test suite after installing dependencies.
