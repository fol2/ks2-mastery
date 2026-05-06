# Grammar QG P20c Validation Hotfix Contract

## Scope

Subject: Grammar only.

This hotfix must not touch the separate Punctuation subject, reward/mastery projection, Stars, Hero Mode, monsters, or subject progression. The patch is limited to Grammar answer marking, Grammar manual-expansion generation hygiene, and tests/audit evidence.

## Problems fixed

### 1. Hyphen/dash false acceptance in Grammar `punctuationPattern` marking

`normaliseSmartPunctuation()` currently folds en dashes and em dashes into hyphens before marking. That is helpful for some exact/label-style learner answers, but it is unsafe for punctuation-sensitive Grammar tasks. In a hyphen task, a learner answer with an en dash or em dash should not be treated as the same answer as a hyphen.

Example affected generated Grammar task:

`proc3_hyphen_fix_meaning`

Expected answer:

`The team needed a well-earned break after the match.`

Before the patch, these were incorrectly accepted:

`The team needed a well—earned break after the match.`

`The team needed a well–earned break after the match.`

### 2. Manual-expansion generator must preserve fairness flags and be reproducible across platforms

`compactCase` must preserve `manualReviewOnly` and `nonScored` flags so generated-source compaction cannot silently strip fairness metadata.

The generated-source header path must also be stable across Windows/POSIX path separators so `node scripts/generate-grammar-manual-expansion.mjs --check` does not fail only because one machine wrote `docs\...` and another wrote `docs/...`.

## Required implementation

1. Add a `punctuationPattern`-specific smart-punctuation normaliser that keeps smart quote/apostrophe friendliness but does not fold en/em dashes into hyphens.
2. Use that stricter normaliser only for `punctuationPattern` marking.
3. Keep the existing broader smart punctuation normaliser for the other answer-spec paths that intentionally tolerate iPad keyboard substitutions.
4. Export `compactCaseForTest` from `scripts/generate-grammar-manual-expansion.mjs` and preserve `manualReviewOnly`/`nonScored` fields when present.
5. Normalize the generated source header path to POSIX-style `/` separators before writing `manual-expansion.generated.js`.
6. Update `manual-expansion.generated.js` so the generator check is clean in this environment.
7. Add regression tests for:
   - unit-level hyphen vs en/em dash distinction in `punctuationPattern`;
   - generated hyphen rewrite task rejecting dash substitutions;
   - compacted manual-expansion cases preserving fairness flags.

## Acceptance gates

The patch is acceptable only if all of the following pass on a fresh extraction of `ks2-mastery-lean-05061153.zip`:

```bash
patch --dry-run -p1 < patches/001-grammar-qg-p20c-hyphen-dash-and-generator-guard.patch
patch -p1 < patches/001-grammar-qg-p20c-hyphen-dash-and-generator-guard.patch
node --test tests/grammar-answer-spec.test.js tests/grammar-qg-p20-answer-acceptance.test.js tests/grammar-qg-p20-quality-hardening.test.js
node scripts/generate-grammar-manual-expansion.mjs --check
node scripts/audit-grammar-qg-p20-quality-hardening.mjs --seeds=1..3 --smart-seeds=1 --out=/tmp/grammar-qg-p20c-smoke.json
```

Expected outcomes:

- baseline probe shows en/em dash substitutions were accepted before patch;
- patched probe shows en/em dash substitutions are rejected;
- targeted tests pass;
- generator check passes;
- P20 quality-hardening smoke passes with zero answer-acceptance failures and zero template-quality/fairness findings.

## Non-goals

- Do not add new Grammar question families in this hotfix.
- Do not expand the 15k pool.
- Do not change learner rewards, Stars, Hero Mode, or monsters.
- Do not change the separate Punctuation subject.
- Do not claim production certification from ZIP-local evidence alone.
