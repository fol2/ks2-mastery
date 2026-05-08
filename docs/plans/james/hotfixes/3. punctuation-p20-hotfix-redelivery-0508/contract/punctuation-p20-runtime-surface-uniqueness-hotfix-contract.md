# Punctuation P20 Runtime Surface Uniqueness Hotfix Contract

## Source boundary

Primary authority: uploaded ZIP snapshot `ks2-mastery-lean-05080102.zip`.

Source ZIP SHA-256: `b8f30cefff6178f7db18bfc47e53387b4ebd680d3ae35eee5aeba0ee4b91fe50`.

GitHub was checked only as supplementary repository context. The patch is written against the uploaded ZIP snapshot and should be applied from the repository root.

Environment used in this rebuild:

```text
node=v22.16.0
npm=10.9.2
.nvmrc=22
```

## Issue

The P20 runtime pool contained six exact duplicate fixed-bank learner-facing parenthesis choice surfaces. The scheduler anti-repeat work is healthy, but the content bank itself should not expose exact duplicated question surfaces because repeated wording can become noticeable to pupils over time.

Duplicate fixed-bank groups found in the baseline audit:

- `fx12_parenthesis_001` and `fx12_parenthesis_021`
- `fx12_parenthesis_002` and `fx12_parenthesis_022`
- `fx12_parenthesis_003` and `fx12_parenthesis_023`
- `fx12_parenthesis_004` and `fx12_parenthesis_024`
- `fx12_parenthesis_005` and `fx12_parenthesis_025`
- `fx12_parenthesis_006` and `fx12_parenthesis_026`

Baseline counts:

- Runtime items: 15,072
- Unique learner-facing surfaces: 15,066
- Generated duplicate surface groups: 0
- Legacy fixed-bank duplicate surface groups: 6

## Patch scope

Patch file: `patches/001-punctuation-p20-fixed-duplicate-surface-and-gate.patch`.

Patch SHA-256: `51eea511f8bf2b6f8cbc2cbf9bd32220f76e38e03f6db9ba1d5c2cacdde6295d`.

Files changed:

- `shared/punctuation/fixed-expansion-items-p12.js`
- `scripts/audit-punctuation-qg-p20-expansion.mjs`
- `scripts/validate-punctuation-qg-p20-expansion-report.mjs`
- `tests/punctuation-qg-p20-runtime-surface-uniqueness.test.js`
- `tests/punctuation-qg-p20-expansion-report-validator.test.js`

## Intended changes

The six duplicate parenthesis fixed-bank pairs are resolved by replacing the `fx12_parenthesis_001` to `fx12_parenthesis_006` side of each pair with new KS2-appropriate parenthesis choice surfaces. The matching `fx12_parenthesis_021` to `fx12_parenthesis_026` items remain as the original approved surfaces. The correct-answer index and parenthesis skill metadata are preserved.

The P20 expansion audit is hardened so `duplicateSurfaceGroups` checks the full runtime pool, not only generated items. The audit now also reports `generatedDuplicateSurfaceGroups` and `fixedDuplicateSurfaceGroups` for diagnosis.

The P20 expansion report validator now fails if runtime, generated, or fixed-bank duplicate surface groups are present.

A new runtime uniqueness test asserts that the complete P20 runtime pool has no duplicate learner-facing surfaces across fixed and generated items using the same signature semantics as the audit.

## Acceptance criteria

From a fresh extraction of the uploaded ZIP:

```bash
git apply --check --ignore-whitespace patches/001-punctuation-p20-fixed-duplicate-surface-and-gate.patch
```

must pass.

After applying the patch:

```bash
node --test tests/punctuation-qg-p20-runtime-surface-uniqueness.test.js
node scripts/audit-punctuation-qg-p20-expansion.mjs --out /tmp/punctuation-qg-p20-expansion-audit.json
node scripts/validate-punctuation-qg-p20-expansion-report.mjs /tmp/punctuation-qg-p20-expansion-audit.json
npm run verify:punctuation-qg:p20
```

must pass.

The audit must report:

- `runtimeItems: 15072`
- `uniqueLearnerSurfaces: 15072`
- `duplicateSurfaceGroups: 0`
- `generatedDuplicateSurfaceGroups: 0`
- `fixedDuplicateSurfaceGroups: 0`

## Production boundary

This rebuilt package does not certify a new live production deployment. Local verification passed for the patched ZIP snapshot. A production smoke with origin, environment, release ID, timestamp, runtime count, authenticated coverage, admin coverage, and pass/fail result is still required before calling this new hotfix production-certified.
