# Grammar QG P20c validation + hotfix package

## Source boundary

Primary local validation snapshot: `ks2-mastery-lean-05061153.zip`.

This package is ZIP-local validation and patch evidence. It does not independently certify live production.

## Fresh rebuild note

The earlier `grammar-qg-p20c-validation-and-hotfix-package.zip` link could not be downloaded because that file was not present in `/mnt/data` in the current workspace. This package is a fresh rebuild of the P20c hotfix deliverable.

## Findings

The baseline Grammar QG state is broadly healthy, but one learner-facing marking bug was confirmed:

- `punctuationPattern` accepted en/em dashes where a hyphen was required.
- Example expected answer: `The team needed a well-earned break after the match.`
- Baseline incorrectly accepted `well—earned` and `well–earned`.

During rebuild, the generator check also exposed one reproducibility hygiene issue:

- `manual-expansion.generated.js` had a Windows-style header path, while the generator in this environment emitted POSIX-style `/` separators.
- The patch normalizes the generated source header path so `--check` is stable across platforms, and updates the generated file header.

## Patch included

`patches/001-grammar-qg-p20c-hyphen-dash-and-generator-guard.patch`

Patch scope:

- `worker/src/subjects/grammar/answer-spec.js`
- `scripts/generate-grammar-manual-expansion.mjs`
- `worker/src/subjects/grammar/manual-expansion.generated.js`
- `tests/grammar-answer-spec.test.js`
- `tests/grammar-qg-p20-answer-acceptance.test.js`
- `tests/grammar-qg-p20-quality-hardening.test.js`

## Validation results

Fresh patch dry-run: passed.

Fresh patch apply: passed.

Baseline probe:

```json
{
  "acceptedCorrect": true,
  "emDashAccepted": true,
  "enDashAccepted": true
}
```

Patched probe:

```json
{
  "acceptedCorrect": true,
  "emDashAccepted": false,
  "enDashAccepted": false
}
```

Targeted patched tests:

```text
# tests 37
# pass 37
# fail 0
```

Generated-source check:

```text
Grammar manual expansion is up to date: worker/src/subjects/grammar/manual-expansion.generated.js
```

P20 quality-hardening smoke:

```text
Grammar QG P20 quality-hardening audit: PASS
```

Smoke JSON summary:

- template count: 510
- seeds checked: 3
- P20 closed auto-mark template count: 23
- answer acceptance failures: 0
- fairness findings: 0
- template quality findings: 0
- unsafe auto-marked open prompts: 0
- smart-practice failures: 0
- smart-practice advisories: 0

## Limitation

This fresh rebuild uses ZIP-local tests and a short smoke window. It does not replace a full CI/staging release run, and it does not certify live production.
