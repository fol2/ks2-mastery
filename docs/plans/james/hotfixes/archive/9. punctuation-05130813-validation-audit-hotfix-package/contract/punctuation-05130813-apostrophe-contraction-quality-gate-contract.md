# Punctuation 05130813 Apostrophe-Contraction Quality Gate Contract

## Source boundary

Primary authority: uploaded ZIP `ks2-mastery-lean-05130813.zip`.

Supplementary authority: recent GitHub Punctuation commit search only. GitHub was used for context, not to override the uploaded ZIP snapshot.

Production authority: not proven by this package. The source ZIP contains an empty/non-valid production smoke artefact at `reports/punctuation/punctuation-qg-p20-production-smoke.json`; a main-derived repo may instead contain stale live evidence for an earlier release. Live production must be re-smoked after deployment.

Source ZIP SHA-256: `1c57a140600b2bb36e954c5814d626fac2ef451cf9d8ca733a87fc54b4e46c75`

Patch SHA-256: `9d6b219f74cd02726f3d8cebacf8870124218785eab6469fd1b1fc8088a812bc`

## Problem

The post-hardening ZIP passes the existing P20 expansion gates, including duplicate-surface and hyphen-quality gates. However, the apostrophe-contraction generated content still contains learner-facing grammar errors that the current verifier does not block.

Baseline custom probe found:

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

Representative bad learner-facing models from the uploaded ZIP:

```text
Theo aren't believe Ivy haven't moved the tablet.
Zara you're believe Ethan weren't moved the torch.
Noah they're believe Sofia isn't moved the notebook.
Felix I've believe Nia you'll moved the poster.
```

This is a learner-facing content-quality defect. It does not break the scheduler or self-marking, but it teaches through broken English and makes the generated bank visibly weaker than the rest of the subject.

## Required change

1. Replace arbitrary contraction insertion in `shared/punctuation/p20-systematic-expansion-bank.js`.
2. Generate apostrophe-contraction examples from grammatical clause templates.
3. Keep missing-apostrophe stems/distractors, but do not produce impossible forms such as `Maya you're believe` or `Noah weren't moved the`.
4. Add an audit gate named `apostropheContractionGrammarQuality`.
5. Add a report count named `apostropheContractionGrammarFindings` and require it to be zero.
6. Add runtime and synthetic regression tests.
7. Add the new test to `verify:punctuation-qg:p20-expansion`.
8. Bump the content release ID from `punctuation-qg-p21-15072-2026-05-12` to `punctuation-qg-p22-15072-2026-05-13`, because learner-facing content changed.

## Files changed by patch

```text
package.json
shared/punctuation/p20-systematic-expansion-bank.js
scripts/audit-punctuation-qg-p20-expansion.mjs
scripts/validate-punctuation-qg-p20-expansion-report.mjs
src/subjects/punctuation/service-contract.js
tests/punctuation-apostrophe-contraction-quality.test.js
tests/punctuation-qg-p20-expansion-report-validator.test.js
tests/punctuation-qg-p20-production-evidence.test.js
```

## Acceptance checks

Run from repo root after applying the patch:

```bash
npm run punctuation:qg:p20:build-evidence
node --test tests/punctuation-apostrophe-contraction-quality.test.js tests/punctuation-qg-p20-expansion-report-validator.test.js
npm run verify:punctuation-qg:p20-expansion
node --test tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js tests/punctuation-session-input-hardening.test.js tests/punctuation-scheduler.test.js tests/punctuation-session-ui.test.js tests/punctuation-session-view.test.js
node --test tests/punctuation-qg-p20-production-evidence.test.js
```

Expected local result:

```text
apostropheContractionGrammarFindings: 0
runtime/generated/fixed: 15072/14560/512
unique surfaces/signatures: 15072/15072
modelSelfMarkingFailures: 0
failing gates: none
```

## Production boundary

The full command below should continue to fail until fresh live evidence is generated:

```bash
npm run verify:punctuation-qg:p20
```

Expected pre-production boundary failure is missing, empty, non-valid, or stale live evidence. In a main-derived checkout that already has prior P21 smoke, the expected failure is:

```text
production smoke releaseId=punctuation-qg-p21-15072-2026-05-12, expected punctuation-qg-p22-15072-2026-05-13
```

After deploying P22, regenerate production smoke for `punctuation-qg-p22-15072-2026-05-13`, then rerun:

```bash
npm run verify:punctuation-qg:p20-live
npm run verify:punctuation-qg:p20
```
