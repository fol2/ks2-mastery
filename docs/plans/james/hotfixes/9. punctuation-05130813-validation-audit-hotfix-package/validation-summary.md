# Punctuation 05130813 Validation Summary

## Verdict

The post-hardening ZIP is materially stronger than the previous one. Duplicate-surface and hyphen-quality hardening are present, the local expansion gate passes, and runtime size remains stable at 15,072 items.

I found one new subject-quality defect in the apostrophe-contraction generated bank and produced a patch that fixes the content and adds a permanent audit/validator gate.

## Source ZIP

```text
ks2-mastery-lean-05130813.zip
1c57a140600b2bb36e954c5814d626fac2ef451cf9d8ca733a87fc54b4e46c75
```

## Baseline status from uploaded ZIP

```text
npm run verify:punctuation-qg:p20-expansion: PASS
release: punctuation-qg-p21-15072-2026-05-12
runtime/generated/fixed: 15072/14560/512
unique surfaces/signatures: 15072/15072
failing gates: none
```

Baseline full verifier boundary:

```text
npm run verify:punctuation-qg:p20: FAILS at production evidence only
reason: reports/punctuation/punctuation-qg-p20-production-smoke.json is empty/non-valid JSON
```

## New issue found

The baseline verifier did not catch ungrammatical apostrophe-contraction generation.

Baseline custom probe:

```json
{
  "runtimeItems": 15072,
  "apostropheContractionItems": 1078,
  "affectedItems": 840,
  "findings": 1443,
  "byKind": {
    "bad-moved": 960,
    "bad-believe": 483
  }
}
```

Representative examples:

```text
Theo aren't believe Ivy haven't moved the tablet.
Zara you're believe Ethan weren't moved the torch.
Noah they're believe Sofia isn't moved the notebook.
Felix I've believe Nia you'll moved the poster.
```

## Patch result

The patch changes the contraction generator from arbitrary insertion to grammatical contraction cases, adds an apostrophe-contraction grammar quality gate, and bumps the content release ID to:

```text
punctuation-qg-p22-15072-2026-05-13
```

Fresh apply custom probe:

```json
{
  "releaseId": "punctuation-qg-p22-15072-2026-05-13",
  "runtimeItems": 15072,
  "apostropheContractionItems": 1078,
  "ok": true,
  "findingCount": 0,
  "findings": []
}
```

Fresh apply and verification:

```text
git apply --check --ignore-whitespace: PASS
git apply --ignore-whitespace: PASS
npm run verify:punctuation-qg:p20-expansion: PASS 17/17
```

Patched audit result:

```text
Punctuation QG P20 expansion audit: PASS
release: punctuation-qg-p22-15072-2026-05-13
runtime/generated/fixed: 15072/14560/512
unique surfaces/signatures: 15072/15072
failing gates: none
```

Patched quality counters:

```text
apostropheContractionGrammarFindings: 0
hyphenAdverbialLyHyphenFindings: 0
hyphenMalformedCompoundFindings: 0
hyphenArticleAgreementFindings: 0
modelSelfMarkingFailures: 0
```

Targeted patched tests:

```text
apostrophe quality + validator tests: PASS 7/7
runtime/scheduler/session/UI/view tests: PASS 66/66
production evidence shape tests: PASS 4/4
```

Patched full verifier pre-deployment boundary:

```text
npm run verify:punctuation-qg:p20: FAILS at production evidence only
reason: production smoke releaseId=punctuation-qg-p21-15072-2026-05-12, expected punctuation-qg-p22-15072-2026-05-13
```

## Honest limit

A very large marking/oracle test set was started but did not complete within the local execution window, so this package does not claim that command as a pass. A compact partial log and timeout note are included.

Live production is not certified. Deploy P22 and regenerate live smoke evidence before treating the new release as production-proven.
