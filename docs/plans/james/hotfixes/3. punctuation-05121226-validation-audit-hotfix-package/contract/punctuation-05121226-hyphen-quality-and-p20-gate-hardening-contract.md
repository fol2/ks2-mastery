# Punctuation 05121226 hyphen quality + P20 gate hardening contract

## Source boundary

Primary authority is the uploaded ZIP snapshot `ks2-mastery-lean-05121226.zip`.

GitHub was used only as supplementary context for recent Punctuation activity. The ZIP proves the supplied snapshot; local commands prove behaviour in this container for that extracted snapshot; production remains separate and requires live smoke evidence with origin, environment, release ID, runtime count, authenticated coverage, admin coverage, and pass result.

## Verdict on post-hardening

The previous post-hardening duplicate-surface fix is present in the new ZIP. The runtime pool reports `15072` learner-facing surfaces and `15072` unique learner-facing surfaces after evidence regeneration. Fixed-bank duplicate groups, generated duplicate groups, and legacy fixed duplicate groups are all `0`.

The new audit found a fresh subject-quality issue in hyphen content. This is not a scheduler failure and not a marking-oracle failure. It is a learner-facing content-quality bug inside the hyphen question surfaces.

## Bug 1: adverbial `-ly` compounds are taught as required hyphenated modifiers

The baseline automated probe found generated/manual hyphen surfaces containing examples such as:

- `newly-built`
- `carefully-planned`
- `brightly-lit`
- `brightly-coloured`

For KS2 punctuation learning, this is the wrong rule to internalise. `-ly` adverbs before adjectives are normally not hyphenated. Punctuation should teach examples such as `well-built`, `well-planned`, `well-lit`, `high-speed`, `two-metre`, `long-term`, or `prize-winning` instead.

Baseline probe evidence:

- runtime `adverbialLyHyphen` findings: `182`
- source-bank `adverbialLyHyphen` findings: `7`

Patched probe evidence:

- runtime `adverbialLyHyphen` findings: `0`
- source-bank `adverbialLyHyphen` findings: `0`

## Bug 2: malformed no-space choice distractors

The baseline generated P20 hyphen choose items included distractors such as:

- `brightly-litdesign`
- `ice-colddesign`
- `long-termdesign`
- `open-endeddesign`

These are visibly glitchy. A wrong option may be wrong, but it should not look like a broken renderer or a string-concatenation error. The patch changes the over-hyphenated distractor shape to clean but incorrect forms such as `well-lit-design`, keeping the misconception test without a no-space typo.

Baseline probe evidence:

- runtime `malformedNoSpaceDesign` findings: `120`

Patched probe evidence:

- runtime `malformedNoSpaceDesign` findings: `0`

## Bug 3: article agreement in hyphen generated content

The baseline generated content produced surfaces such as:

- `a ice-cold design`
- `a open-ended design`
- `a up-to-date design`

The target punctuation mark is the hyphen, but the surrounding English still has to be clean. The patch adds deterministic article selection for generated compound modifiers.

Baseline probe evidence:

- runtime `articleAgreement` findings: `480`

Patched probe evidence:

- runtime `articleAgreement` findings: `0`

## Patch scope

The patch changes these files:

- `package.json`
- `src/subjects/punctuation/service-contract.js`
- `shared/punctuation/p20-systematic-expansion-bank.js`
- `shared/punctuation/manual-deep-expansion-bank.js`
- `shared/punctuation/manual-expansion-bank.js`
- `shared/punctuation/manual-p12-quality-bank.js`
- `scripts/audit-punctuation-qg-p20-expansion.mjs`
- `scripts/validate-punctuation-qg-p20-expansion-report.mjs`
- `tests/punctuation-qg-p20-expansion.test.js`
- `tests/punctuation-qg-p20-expansion-report-validator.test.js`
- `tests/punctuation-hyphen-quality.test.js`

## Content changes

Manual/systematic hyphen examples are changed away from `-ly` adverbs:

- `newly-built` → `well-built`
- `carefully-planned` → `well-planned`
- `brightly-lit` → `well-lit`
- `brightly-coloured` → `prize-winning`

Systematic generated hyphen examples now select the article before the compound:

- `an ice-cold design`
- `an open-ended design`
- `an up-to-date design`

The malformed no-space distractor is removed:

- before: `ice-colddesign`
- after: `ice-cold-design`

## Gate changes

`audit-punctuation-qg-p20-expansion.mjs` now includes a `hyphenCompoundQuality` gate that blocks:

- adverbial `-ly` hyphen compounds;
- malformed no-space compound distractors such as `well-litdesign`;
- article-agreement errors such as `a ice-cold`.

The P20 expansion validator now fails unless all three counters are zero:

- `hyphenAdverbialLyHyphenFindings`
- `hyphenMalformedCompoundFindings`
- `hyphenArticleAgreementFindings`

`npm run verify:punctuation-qg:p20-expansion` now runs the new hyphen quality test and the P20 report/runtime uniqueness tests after building, simulating, auditing, and validating the evidence.

## Lean ZIP / Node robustness changes

The P20 expansion tests now avoid Node 22-only `import.meta.dirname` so they can run in this Node 18 validation environment as well as in the repository’s intended Node 22 environment.

The tests also rebuild P20 evidence if the report is missing, invalid, `FAIL`, or stale for the current content release ID. This matters because lean ZIPs intentionally replace `reports/**` payloads with 0-byte placeholders.

The duplicate-report validator test now synthesises a stale duplicate fixture in a temporary directory instead of depending on archived report files that may be placeholdered in lean bundles.

## Release identity

Because learner-facing content changed, the patch bumps:

`punctuation-qg-p20-15072-2026-05-04`

 to:

`punctuation-qg-p21-15072-2026-05-12`

The item count remains `15072`. The release ID bump prevents old P20 production evidence from being accidentally reused to certify the new learner-facing content.

## Acceptance commands

Minimum local acceptance after applying patch:

```bash
git apply --check --ignore-whitespace patches/001-punctuation-05121226-hyphen-quality-and-p20-gate-hardening.patch
git apply --ignore-whitespace patches/001-punctuation-05121226-hyphen-quality-and-p20-gate-hardening.patch
npm run verify:punctuation-qg:p20-expansion
node --test tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js tests/punctuation-session-input-hardening.test.js tests/punctuation-scheduler.test.js tests/punctuation-session-ui.test.js tests/punctuation-view-model.test.js
node --test tests/punctuation-apostrophe-normalisation.test.js tests/punctuation-speech-fairness.test.js tests/punctuation-reporting-clause-enforcement.test.js tests/punctuation-closed-lexical-preservation-p10.test.js tests/punctuation-preservation-oracle.test.js tests/punctuation-negative-vectors.test.js tests/punctuation-golden-marking.test.js tests/punctuation-marking.test.js
```

Production acceptance after deployment:

```bash
npm run verify:punctuation-qg:p20-live
npm run verify:punctuation-qg:p20
```

The live commands require a real `reports/punctuation/punctuation-qg-p20-production-smoke.json` for the deployed release. The uploaded lean ZIP does not provide that evidence.
