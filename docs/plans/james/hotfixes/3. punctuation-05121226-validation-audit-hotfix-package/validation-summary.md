# Validation summary

## Source identity

- Source ZIP: `ks2-mastery-lean-05121226.zip`
- Source ZIP SHA-256: `a0f99b47f8268e73f79aa7d95fe1b1fb63dba0a7aef87ff9ed6d744cf00e9dbe`
- ZIP integrity: `unzip -t` passed
- Archive shape: rootless lean ZIP
- `.git` metadata: absent
- Lean caveat: `reports/**` and some other paths are placeholdered, so production evidence is not proven by the ZIP
- Local Node: `v18.20.4`
- Repository `.nvmrc`: `22`

## Post-hardening review

The earlier fixed-bank duplicate-surface issue is closed in this ZIP. After regenerating P20 evidence, the P20 expansion audit shows:

```text
runtime/generated/fixed: 15072/14560/512
unique surfaces/signatures: 15072/15072
duplicateSurfaceGroups: 0
generatedDuplicateSurfaceGroups: 0
fixedDuplicateSurfaceGroups: 0
legacyFixedDuplicateSurfaceGroups: 0
```

## New issue found

The remaining learner-facing bug is in hyphen content quality. The baseline ZIP taught or displayed:

- adverbial `-ly` hyphen examples such as `newly-built`, `carefully-planned`, `brightly-lit`, and `brightly-coloured`;
- malformed no-space choice distractors such as `ice-colddesign` and `open-endeddesign`;
- article errors such as `a ice-cold`, `a open-ended`, and `a up-to-date`.

This is a subject-quality issue, not a scheduler or UI-frame issue. It matters because children should not learn a wrong hyphen rule, and wrong options should not look like broken generated text.

## Patch result

The patch changes manual/systematic hyphen examples, fixes article selection in generated compound-modifier items, removes the malformed no-space distractor, and adds audit/validator/test gates so these defects cannot return silently.

The patch also bumps the Punctuation content release ID to:

```text
punctuation-qg-p21-15072-2026-05-12
```

## Fresh patch-apply validation

From a fresh extraction of `ks2-mastery-lean-05121226.zip`:

```text
git apply --check --ignore-whitespace: PASS
git apply --ignore-whitespace: PASS
npm run verify:punctuation-qg:p20-expansion: PASS
```

Patched expansion result:

```text
Punctuation QG P20 expansion audit: PASS
release: punctuation-qg-p21-15072-2026-05-12
runtime/generated/fixed: 15072/14560/512
unique surfaces/signatures: 15072/15072
failing gates: none
```

Patched quality counters:

```text
hyphenAdverbialLyHyphenFindings: 0
hyphenMalformedCompoundFindings: 0
hyphenArticleAgreementFindings: 0
modelSelfMarkingFailures: 0
```

Patched quality/report/runtime tests:

```text
node --test tests/punctuation-hyphen-quality.test.js tests/punctuation-qg-p20-expansion.test.js tests/punctuation-qg-p20-expansion-report-validator.test.js tests/punctuation-qg-p20-runtime-surface-uniqueness.test.js
PASS: 11/11
```

Patched runtime/session/scheduler/UI/view tests:

```text
PASS: 177/177
```

Patched marking/oracle tests:

```text
PASS: 98/98
```

Patched release/reward projection tests:

```text
PASS: 129/129
```

## Production boundary

`npm run verify:punctuation-qg:p20` still fails at the live-evidence stage in the lean ZIP because `reports/punctuation/punctuation-qg-p20-production-smoke.json` is a 0-byte placeholder. The expansion part passes; production is not certified from this package.

Regenerate live production smoke after implementing and deploying this patch, then run:

```bash
npm run verify:punctuation-qg:p20-live
npm run verify:punctuation-qg:p20
```
