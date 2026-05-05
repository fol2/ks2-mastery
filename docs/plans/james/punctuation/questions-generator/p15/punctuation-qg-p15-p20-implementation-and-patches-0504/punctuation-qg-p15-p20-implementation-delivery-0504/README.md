# Punctuation QG P15-P20 implementation delivery

This corrected package includes the deployable P15-P20 implementation patch, not only the contract/gates package.

The earlier `punctuation-qg-p15-p20-contract-and-patches-0504.zip` was not enough for deployment: it contained the contract plus post-P20 gates, but it did not expand the production question pool. This package fixes that.

## Main deployable patch

Apply from the KS2 repo root:

```bash
git apply patches/000-combined-punctuation-qg-p15-p20-implementation-and-gates.patch
```

Then run the source/local P20 verifier:

```bash
npm run verify:punctuation-qg:p20-expansion
```

The full production verifier remains intentionally deployment-gated:

```bash
npm run verify:punctuation-qg:p20-live
npm run verify:punctuation-qg:p20
```

`verify:punctuation-qg:p20-live` is expected to fail until a real deployed production smoke exists at `reports/punctuation/punctuation-qg-p20-production-smoke.json`. This package does not fake production evidence.

## What the patch implements

Release: `punctuation-qg-p20-15072-2026-05-04`

The patch expands punctuation QG to:

- 15,072 runtime items.
- 14,560 generated items.
- 512 fixed items.
- 126 generated families.
- 120 production depth for full-depth families.
- 84 new P20 systematic generator families: six per published punctuation skill.
- 15,066 unique learner-facing surfaces.
- 15,072 unique variant signatures.
- 0 generated duplicate learner-surface groups.
- Review governance, negative-vector register, heavy-play simulation, and report validation gates.

The new systematic source file is:

```text
shared/punctuation/p20-systematic-expansion-bank.js
```

## Key scripts added

```text
scripts/build-punctuation-qg-p20-evidence.mjs
scripts/simulate-punctuation-qg-p20-heavy-play.mjs
scripts/audit-punctuation-qg-p20-expansion.mjs
scripts/validate-punctuation-qg-p20-expansion-report.mjs
scripts/validate-punctuation-qg-p20-live-evidence.mjs
```

## Tests and gates added

```text
tests/punctuation-qg-p20-expansion.test.js
tests/punctuation-qg-p20-production-evidence.test.js
```

Older P10/P12/P14 regression tests were also updated so they remain valid after the P20 pool expansion rather than failing on old hard-coded P12/P14 item counts.

## Local validation recorded

The patched implementation worktree passed:

```bash
npm run verify:punctuation-qg:p20-expansion
```

A patch-apply validation also passed `git apply --check`, `node --check` for the added scripts, and the direct P20 verifier chain:

```bash
node scripts/build-punctuation-qg-p20-evidence.mjs \
  && node scripts/simulate-punctuation-qg-p20-heavy-play.mjs \
  && node scripts/audit-punctuation-qg-p20-expansion.mjs --out reports/punctuation/punctuation-qg-p20-expansion-audit.json \
  && node scripts/validate-punctuation-qg-p20-expansion-report.mjs reports/punctuation/punctuation-qg-p20-expansion-audit.json
```

## Important production boundary

This is source/local implementation evidence. It proves the patched code and generated evidence pass locally. It does not prove live deployment. After deployment, add real production smoke evidence with origin, environment, timestamp, release ID, runtime count, authenticated coverage, and admin/debug coverage, then run `npm run verify:punctuation-qg:p20-live`.
