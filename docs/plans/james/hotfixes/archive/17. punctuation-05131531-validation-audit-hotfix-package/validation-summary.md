# Punctuation 05131531 Validation Summary

## ZIP identity

- Source ZIP: `ks2-mastery-lean-05131531.zip`
- Source ZIP SHA-256: `e1f6c8a068734e7a0faf1d2f450b9f3d9df57532872bac5ec8b849faa3005298`
- ZIP integrity: `unzip -t` passed.
- ZIP shape: lean ZIP, no `.git` metadata in extraction.
- Runtime note: local Node version matched `.nvmrc` (`22`).

## Baseline review result

The uploaded P23 snapshot was locally healthy for the earlier hardening gates:

```text
release: punctuation-qg-p23-15072-2026-05-13
runtime/generated/fixed: 15072/14560/512
unique surfaces/signatures: 15072/15072
failing gates: none
```

The next subject-quality defect found was learner-facing surface language:

```json
{
  "redundantPhraseFindings": 90,
  "redundantAffectedItems": 90,
  "dashTypographyFindings": 2640,
  "dashAffectedItems": 840
}
```

Top redundant phrases from the baseline probe:

```text
focused and focused: 80
scripts and scripts: 1
number lines and number lines: 1
toolboxes and toolboxes: 1
memory cards and memory cards: 1
safety cones and safety cones: 1
garden forks and garden forks: 1
```

Representative baseline examples:

```text
Jude (focused and focused) updated the planning sheet.
The covered walkway tray held keys, scripts and scripts.
Ethan opened the badge - the room fell silent - and read the note.
```

## Patch summary

The patch:

- replaces accidental repeated list items in the fixed P12 quality bank;
- prevents the P20 parenthesis generator from producing `focused and focused`;
- changes dash-clause learner-facing model surfaces from spaced hyphen-minus to real en dashes;
- keeps spaced hyphen-minus as accepted-answer/test tolerance for keyboard accessibility;
- adds `dashTypographyQuality` and `redundantPhraseQuality` gates to the P20 audit;
- adds validator checks for the new gates and counters;
- adds runtime and adversarial tests for both quality classes;
- bumps release ID from P23 to P24.

## Patched result

Fresh patched probe:

```json
{
  "releaseId": "punctuation-qg-p24-15072-2026-05-13",
  "runtimeItems": 15072,
  "redundantPhraseFindings": 0,
  "redundantAffectedItems": 0,
  "dashTypographyFindings": 0,
  "dashAffectedItems": 0
}
```

Fresh patched audit compact result:

```json
{
  "releaseId": "punctuation-qg-p24-15072-2026-05-13",
  "status": "PASS",
  "runtimeItems": 15072,
  "generatedItems": 14560,
  "fixedItems": 512,
  "uniqueLearnerSurfaces": 15072,
  "uniqueVariantSignatures": 15072,
  "duplicateSurfaceGroups": 0,
  "hyphenAdverbialLyHyphenFindings": 0,
  "hyphenMalformedCompoundFindings": 0,
  "hyphenArticleAgreementFindings": 0,
  "apostropheContractionGrammarFindings": 0,
  "properNounCapitalisationFindings": 0,
  "dashTypographyFindings": 0,
  "redundantPhraseFindings": 0,
  "modelSelfMarkingFailures": 0,
  "failingGates": []
}
```

## Validation commands and results

Patch dry-run and apply from a clean extraction:

```text
git apply --check --ignore-whitespace: PASS
git apply --ignore-whitespace: PASS
```

Fresh patched expansion verifier from clean extraction:

```text
npm run verify:punctuation-qg:p20-expansion: PASS
tests: 30/30
release: punctuation-qg-p24-15072-2026-05-13
runtime/generated/fixed: 15072/14560/512
unique surfaces/signatures: 15072/15072
failing gates: none
```

Additional runtime/session/marking checks:

```text
node --test tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js tests/punctuation-session-ui.test.js tests/punctuation-session-input-hardening.test.js tests/punctuation-view-model.test.js tests/punctuation-golden-marking.test.js
PASS: 144/144
GOLDEN MARKING: 452 templates tested, 612 accept cases passed, 1348 reject cases passed
```

Full P20 verifier status:

```text
npm run verify:punctuation-qg:p20: FAILS at live evidence stage only
```

Failure reason: `reports/punctuation/punctuation-qg-p20-production-smoke.json` is not valid JSON / missing production fields in the lean ZIP. Expansion passes before the live stage.

## Files in this package

```text
contract/punctuation-05131531-surface-language-and-dash-quality-contract.md
patches/001-punctuation-05131531-surface-language-and-dash-quality-gate.patch
validation/*.log
validation/*.json
recommendations/punctuation-next-subject-quality-contract.md
github-supplement/recent-punctuation-commits.md
MANIFEST.txt
FILE_SHA256S.txt
```
