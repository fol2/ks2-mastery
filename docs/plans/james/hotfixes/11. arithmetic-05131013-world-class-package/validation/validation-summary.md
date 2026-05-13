# Arithmetic 05131013 Validation Summary

## Source

Primary ZIP: `/mnt/data/ks2-mastery-lean-05131013.zip`

Source ZIP SHA-256:

`3590a34029601d5d15646eb029f909028cccd3e878924b90752d40b109b471a5`

Patch:

`/mnt/data/arithmetic-05131013-world-class.patch`

Patch SHA-256:

`a4d5df85b4b2349921bd4b100e7997b03e04071c270e2e45481b02b061932c88`

## Current worktree validation

The package was revalidated on `origin/main` commit `b88e3b90` in worktree `D:\Coding\ks2-mastery\.worktrees\arithmetic-05131013-world-class`.

Additional current gates:

- `git apply --check --cached --verbose patches/001-arithmetic-05131013-world-class.patch`: passed for `shared/arithmetic/content.js`, `tests/react-arithmetic-surface.test.js`, and `tests/worker-arithmetic-runtime.test.js`.
- TDD red: worker Arithmetic runtime tests failed before applying the production content change.
- TDD green: `node --test tests/worker-arithmetic-runtime.test.js` passed, 16/16.
- Post-review hybrid zero probe: `fraction_decimal_hybrid`, difficulty 0, seed 16 now generates `0.3 − 1/4 =` with expected `1/20`, not zero.
- Strengthened custom audit: 135,000 cases, 0 findings, 0 malformed mixed-number accepts, 0 bad digit accepts, 0 unsimplified input fractions, 0 zero-result fraction subtractions including hybrid items, 0 negative difficulty-1 order outputs, 0 malformed decimal visuals.
- React Arithmetic surface test: passed with installed dependencies and the 30-second fixture timeout.
- Arithmetic paper-realism audit: passed for the short and full blueprints with no issues.
- First post-review full-suite `npm test`: failed once in unrelated spelling audio generation (`491 !== 492`). Targeted rerun of `tests/build-spelling-word-audio-generate.test.js` passed, then the complete `npm test` rerun passed with 111,485 passing tests, 0 failures, and 12 skipped tests.
- `npm run check`: passed through the OAuth-safe Wrangler dry-run path after the post-review fixes.
- Production browser smoke helper syntax check: `node --check validation/current-2026-05-13/scripts/arithmetic-production-browser-smoke.mjs` passed. The helper opens a production demo session in Chromium, exercises Arithmetic setup, submit, and feedback, and fails on console errors, page errors, request failures, or HTTP failures.
- Post-rebase validation on top of `origin/main` `97aa70da2426e0a65b464d44b55cd8670df0c1dd`: default full-suite `npm test` did not produce a clean run because unrelated build/admin subprocess harness failures moved between runs. The failing tests passed targeted reruns. Post-rebase Arithmetic worker runtime, React surface, and custom audit gates passed, and post-rebase `npm run check` passed.
- The package custom audit script was made reproducible from its committed package path by importing repo-root Arithmetic content directly. The post-rebase custom audit again reported 135,000 cases, 0 findings, and 0 regressions for the contract counters.

Current evidence lives under `validation/current-2026-05-13/`.

## Patch validation from fresh extraction

```text
patch -p1 --dry-run: passed
patch -p1: passed
```

## Syntax checks after patch

```text
node --check shared/arithmetic/content.js: passed
node --check worker/src/subjects/arithmetic/engine.js: passed
node --check worker/src/subjects/arithmetic/commands.js: passed
node --check src/subjects/arithmetic/command-actions.js: passed
node --check tests/worker-arithmetic-runtime.test.js: passed
```

## Worker Arithmetic tests after patch

```text
node --test tests/worker-arithmetic-runtime.test.js
```

Result:

```text
16/16 passed
```

## Custom Arithmetic audit before patch

The same audit script was run against the baseline ZIP extraction.

```json
{
  "templateCount": 30,
  "rewardUnitCount": 90,
  "cases": 135000,
  "uniqueStemVisual": 88678,
  "correctFails": 0,
  "unitPctBad": 0,
  "poundBad": 0,
  "r0Bad": 0,
  "divisionR0Ok": 9000,
  "explicitPctCases": 1556,
  "exactPercentAccept": 1556,
  "badMixedAccepts": 5537,
  "malformedMixedChecked": 11074,
  "badDigitAccepts": 54000,
  "digitChecks": 18000,
  "unsimplifiedInputFractions": 10877,
  "zeroFractionSubtractions": 135,
  "negativeOrderD1": 110,
  "formalDecimalBadVisual": 526,
  "decimalArtifacts": 0
}
```

## Custom Arithmetic audit after patch

The same audit script was run against a fresh ZIP extraction after applying the patch.

```json
{
  "templateCount": 30,
  "rewardUnitCount": 90,
  "cases": 135000,
  "uniqueStemVisual": 87214,
  "correctFails": 0,
  "unitPctBad": 0,
  "poundBad": 0,
  "r0Bad": 0,
  "divisionR0Ok": 9000,
  "explicitPctCases": 1556,
  "exactPercentAccept": 1556,
  "badMixedAccepts": 0,
  "malformedMixedChecked": 11020,
  "badDigitAccepts": 0,
  "digitChecks": 18000,
  "unsimplifiedInputFractions": 0,
  "zeroFractionSubtractions": 0,
  "negativeOrderD1": 0,
  "formalDecimalBadVisual": 0,
  "decimalArtifacts": 0,
  "findings": []
}
```

The slight reduction in unique stem/visual combinations is expected: the patch deliberately removes low-quality variants such as unsimplified prompt fractions, same-value subtraction, and malformed decimal displays.

## React test limit

This command was attempted:

```bash
node --test tests/react-arithmetic-surface.test.js
```

It failed because the lean ZIP does not include installed dependencies:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'esbuild'
```

This is not counted as a product failure. Full dependency CI should run after applying the patch.

## Production limit

The original uploaded package did not certify live production deployment. The current rollout adds deployment and production smoke evidence after the reviewed fix is merged to `main`.
