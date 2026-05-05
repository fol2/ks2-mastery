# Validation summary

Validated against the uploaded lean ZIP snapshot as the base.

## Patch integrity

`git apply --check patches/000-combined-punctuation-qg-p15-p20-implementation-and-gates.patch` passed against the clean base snapshot used to produce the patch.

## Syntax checks

The added/modified P20 scripts pass `node --check`:

- `scripts/audit-punctuation-qg-p20-expansion.mjs`
- `scripts/build-punctuation-qg-p20-evidence.mjs`
- `scripts/simulate-punctuation-qg-p20-heavy-play.mjs`
- `scripts/validate-punctuation-qg-p20-expansion-report.mjs`
- `scripts/validate-punctuation-qg-p20-live-evidence.mjs`
- `shared/punctuation/p20-systematic-expansion-bank.js`

## Source/local verifier

`npm run verify:punctuation-qg:p20-expansion` passed in the patched implementation worktree.

The verifier writes/rebuilds:

- `reports/punctuation/punctuation-qg-p20-review-register.json`
- `reports/punctuation/punctuation-qg-p20-negative-vector-register.json`
- `reports/punctuation/punctuation-qg-p20-heavy-play-simulation.json`
- `reports/punctuation/punctuation-qg-p20-expansion-audit.json`

Then it validates the P20 audit report.

## Current P20 audit headline

- Status: PASS
- Release: `punctuation-qg-p20-15072-2026-05-04`
- Runtime items: 15,072
- Generated items: 14,560
- Fixed items: 512
- Generator families: 126
- Unique learner-facing surfaces: 15,066
- Unique variant signatures: 15,072
- Generated duplicate surface groups: 0
- Model self-marking failures: 0

## Live production boundary

`verify:punctuation-qg:p20-live` is intentionally not satisfied by this package. It requires a real deployed production smoke file. Do not treat this source/local package as live production certification.
