# Arithmetic next improvement validation summary

Source ZIP: `ks2-mastery-lean-05121221.zip`

Source ZIP SHA-256:

```text
651bfb83e19046ff2c8807333a05e8968d5c9a5fbec1137d23557b4ac852fcb8
```

Patch file: `patches/001-arithmetic-next-improvement.patch`

Patch SHA-256:

```text
599fe82c7ec74840360d8a3e6e836531c5b2eb0d24bc1ca248807f73cf811dfb
```

## Environment

```text
Node: v22.15.1
.nvmrc: 22
```

## Patch consistency

The final patch was regenerated from the actual repository diff for the contract runtime and regression files:

```text
shared/arithmetic/content.js
worker/src/subjects/arithmetic/engine.js
src/subjects/arithmetic/components/ArithmeticPracticeSurface.jsx
tests/worker-arithmetic-runtime.test.js
tests/react-arithmetic-surface.test.js
```

Final base:

```text
origin/main: 58ca56f63550fa926a947beb2c73e10c641a5321
```

Patch checks:

```text
git apply --check against clean origin/main: passed
git apply --check --cached against clean origin/main index: passed
git apply --reverse --check against the patched worktree: passed
```

## Syntax checks

```text
node --check shared/arithmetic/content.js: passed
node --check worker/src/subjects/arithmetic/engine.js: passed
node --check worker/src/subjects/arithmetic/commands.js: passed
node --check src/subjects/arithmetic/command-actions.js: passed
```

The JSX surface is checked through the targeted React/jsdom regression, build, and repository test suite rather than `node --check`.

## Runtime and audit checks

The audit helper change in `scripts/arithmetic-custom-audits.mjs` is validation-only: it makes the same-folder audit import the current repository module and adds malformed percentage-symbol checks. It does not change product runtime scope.

```text
node --test tests/worker-arithmetic-runtime.test.js: 15/15 passed
node --test tests/react-arithmetic-surface.test.js: 1/1 passed
node docs/plans/james/hotfixes/4. arithmetic-next-improvement-package/scripts/arithmetic-custom-audits.mjs: passed (validation-only helper)
```

Final custom audit:

```text
templates: 30
rewardUnits: 90
cases: 45,000
uniqueStemVisuals: 35,106
badPercentUnitAcceptances: 0
poundAccepted: 0
expectedPercentOutputCases: 537
expectedPercentOutputAcceptances: 537
malformedPercentOutputAcceptances: 0
short paper: 12 questions / 14 marks
full paper: 36 questions / 40 marks
findingCount: 0
```

## Full repository gates

Final authoritative logs are under `validation/current-2026-05-12/`.

```text
npm test: passed (111,480 passed / 0 failed / 12 skipped)
npm run check: passed (Wrangler OAuth dry-run deploy path)
npm run deploy: passed (Cloudflare Worker version 6cbf20f3-56e9-4f2d-ada0-71eba10a7b39)
Arithmetic production smoke: passed against https://ks2.eugnel.uk (finished 2026-05-12T17:19:17.796Z)
True Test production smoke: 12 questions / 14 marks, delayed feedback before finish
Stale-write production guard: changed false, revision unchanged true
```

Earlier failed or pre-fix logs were moved to `validation/current-2026-05-12/superseded/` and are not authoritative closure evidence. The final pass is `validation/current-2026-05-12/logs/npm-test-final-rerun-2026-05-12.log`.
