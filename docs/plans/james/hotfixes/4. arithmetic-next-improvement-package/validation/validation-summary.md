# Arithmetic next improvement validation summary

Source ZIP: `ks2-mastery-lean-05121221.zip`

Source ZIP SHA-256:

```text
651bfb83e19046ff2c8807333a05e8968d5c9a5fbec1137d23557b4ac852fcb8
```

Patch file: `arithmetic-next-improvement.patch`

Patch SHA-256:

```text
d92ae42b9e15f14278b0b06570ed9c511271167bbd9f8e63928c1c1e7146f310
```

## Environment

```text
Node: v22.16.0
npm: 10.9.2
.nvmrc: 22
```

## Patch application

Fresh ZIP extraction:

```text
patch -p1 --dry-run: passed
patch -p1: passed
```

## Syntax checks

```text
node --check shared/arithmetic/content.js: passed
node --check worker/src/subjects/arithmetic/engine.js: passed
node --check worker/src/subjects/arithmetic/commands.js: passed
node --check src/subjects/arithmetic/command-actions.js: passed
```

The JSX file is not checked with `node --check` because JSX syntax is compiled by the app toolchain, not plain Node.

## Runtime tests

```text
node --test tests/worker-arithmetic-runtime.test.js
15/15 passed
```

## Baseline audit before patch

The baseline custom audit found the unit-symbol marking bug:

```text
templates: 30
rewardUnits: 90
cases: 45,000
uniqueStemVisuals: 31,630
badPercentUnitAcceptances: 37,005
poundAccepted: 37,005
short paper: 12 questions / 14 marks
full paper: 36 questions / 40 marks
```

## Patched audit after patch

```text
templates: 30
rewardUnits: 90
cases: 45,000
uniqueStemVisuals: 35,106
duplicateStemVisuals: 9,894
badPercentUnitAcceptances: 0
poundAccepted: 0
expectedPercentOutputCases: 537
expectedPercentOutputAcceptances: 537
short paper: 12 questions / 14 marks
full paper: 36 questions / 40 marks
findingCount: 0
```

The patched audit improved generated stem/visual uniqueness from 31,630 to 35,106 in the same 45,000-case window while eliminating the unit-symbol marking bug.

## Limits

I did not certify live production deployment. I did not run the full React/Vite build or full repository test suite from this lean ZIP. The Arithmetic Worker runtime tests, syntax checks, patch-apply checks, and custom content/marking audits passed for the supplied snapshot.
