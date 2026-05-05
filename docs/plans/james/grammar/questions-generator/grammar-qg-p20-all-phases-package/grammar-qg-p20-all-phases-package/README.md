# Grammar QG P20 all-phases quality package

This package contains one implementation contract plus deployable patches for Grammar QG P20. Scope is Grammar only.

The patch is based on the uploaded lean ZIP snapshot `ks2-mastery-lean-05051051.zip`, whose Grammar QG baseline was P19 (`grammar-qg-p19-2026-05-04`). P20 bumps the active Grammar content release to `grammar-qg-p20-2026-05-05` because learner-visible marking behaviour changes.

## What this package actually changes

This is not just a plan. The patches directly improve Grammar question quality by:

- accepting sensible variants for deterministic closed Grammar answers, such as `adverb`, `an adverb`, `ADVERB.`, and quoted labels;
- keeping punctuation-sensitive questions strict where the punctuation is the grammar target;
- recovering 23 deterministic closed manual-expansion families from P19 manual-review-only back to safe auto-marking;
- keeping genuinely open writing non-scored and manual-review-only;
- cleaning learner-facing prompt text produced from legacy HTML/table prompts;
- adding a P20 full-pool quality audit and P20 tests;
- adding `--seeds` support to the Grammar smart-practice audit so review and release windows are reproducible;
- adding `npm run verify:grammar-qg-p20`.

## Package contents

- `contract/grammar-qg-p20-answer-acceptance-template-quality-variety-expansion-contract.md`
- `patches/001-answer-acceptance-and-closed-automark.patch`
- `patches/002-p20-contract-audit-and-tests.patch`
- `patches/003-smart-practice-seed-window-and-verify-script.patch`
- `patches/grammar-qg-p20-all-phases.patch`
- `validation-summary.md`
- `validation/` local run evidence and recovery log

## Apply patches

From the root of a clean extraction/repo:

```bash
patch -p1 < patches/001-answer-acceptance-and-closed-automark.patch
patch -p1 < patches/002-p20-contract-audit-and-tests.patch
patch -p1 < patches/003-smart-practice-seed-window-and-verify-script.patch
```

Or apply the monolithic patch:

```bash
patch -p1 < patches/grammar-qg-p20-all-phases.patch
```

## Test after applying

```bash
npm run verify:grammar-qg-p20
```

For release variety evidence, also run the longer smart-practice audit where runtime allows it:

```bash
node scripts/audit-grammar-qg-p19-smart-practice.mjs --seeds=1..30 --json-out=reports/grammar/grammar-qg-p20-smart-practice-full.json --md-out=reports/grammar/grammar-qg-p20-smart-practice-full.md
```

## Honest boundary

This package proves local behavior against the uploaded ZIP snapshot. It does not prove live production deployment or Cloudflare/D1 production behavior.
