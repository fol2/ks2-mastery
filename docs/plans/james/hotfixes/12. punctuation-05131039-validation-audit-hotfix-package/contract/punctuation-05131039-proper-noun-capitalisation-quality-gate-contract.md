# Punctuation 05131039 proper-noun capitalisation quality gate contract

## Evidence boundary

Primary authority: uploaded ZIP `/mnt/data/ks2-mastery-lean-05131039.zip`.

User-stated filename: `ks2-mastery-lean-05130839.zip`.

Observed uploaded filename: `ks2-mastery-lean-05131039.zip`.

GitHub was used only as a supplementary commit-history signal. Local validation was run from the extracted uploaded ZIP snapshot. Production is not certified by this package.

## Baseline validation

The uploaded ZIP passed the existing P22 P20-expansion verifier after regenerating local evidence:

```text
release: punctuation-qg-p22-15072-2026-05-13
runtime/generated/fixed: 15072/14560/512
unique surfaces/signatures: 15072/15072
failing gates: none
```

That confirms the prior duplicate-surface, hyphen-quality, and apostrophe-contraction hardening is present and locally working.

## New subject-quality defect

The runtime pool still contained generated model answers and accepted answers with lowercase proper names.

Examples from the uploaded ZIP:

```text
Where did maya put the map?
Where did theo put the tablet?
Where did asha put the toolbox?
After the bell rang, maya checked the project file.
During the storm, omar checked the notice.
```

This is learner-facing because these are model answers / accepted answers, not only broken distractors. It is especially damaging in `sentence_endings`, where the learner is explicitly practising capital letters and sentence endings.

Baseline probe:

```json
{
  "runtimeItems": 15072,
  "findingCount": 2560,
  "uniqueAffectedItems": 1160
}
```

Affected families:

```text
gen_sentence_endings_transfer
gen_p20_sentence_endings_choose
gen_p20_sentence_endings_insert
gen_p20_sentence_endings_fix
gen_p20_sentence_endings_combine
gen_p20_sentence_endings_paragraph
gen_p20_sentence_endings_transfer
gen_fronted_adverbial_transfer
gen_p20_fronted_adverbial_choose
gen_p20_fronted_adverbial_insert
gen_p20_fronted_adverbial_fix
gen_p20_fronted_adverbial_combine
gen_p20_fronted_adverbial_paragraph
gen_p20_fronted_adverbial_transfer
```

## Root cause

`shared/punctuation/p20-systematic-expansion-bank.js` used `c.actor.toLowerCase()` to create the core sentence-ending and fronted-adverbial clause text, then used simple sentence-case repair. That only capitalised the first letter of the sentence and did not restore mid-sentence proper names.

For `fronted_adverbial`, the lowercase actor appeared after the comma:

```text
After the bell rang, maya checked the project file.
```

For `sentence_endings`, the lowercase actor appeared inside questions:

```text
Where did maya put the map?
```

## Patch scope

Patch file:

```text
patches/001-punctuation-05131039-proper-noun-capitalisation-quality-gate.patch
```

Files changed:

```text
package.json
shared/punctuation/p20-systematic-expansion-bank.js
src/subjects/punctuation/service-contract.js
scripts/audit-punctuation-qg-p20-expansion.mjs
scripts/validate-punctuation-qg-p20-expansion-report.mjs
tests/punctuation-proper-noun-capitalisation-quality.test.js
tests/punctuation-qg-p20-expansion-report-validator.test.js
```

## Implementation requirements

1. P20 sentence-ending generated model answers must capitalise proper names in model/accepted answers.
2. P20 fronted-adverbial generated model answers must capitalise proper names after the comma.
3. Learner stems may still contain lowercase names when the task is a capital-letter repair task.
4. The P20 audit must expose a new `properNounCapitalisationQuality` gate.
5. The P20 audit counts must expose `properNounCapitalisationFindings`.
6. The P20 report validator must fail unless `properNounCapitalisationFindings === 0` and the gate is `ok: true`.
7. The `verify:punctuation-qg:p20-expansion` chain must include the new proper-noun test file.
8. Because learner-facing generated content changed, the release ID must move from:

```text
punctuation-qg-p22-15072-2026-05-13
```

To:

```text
punctuation-qg-p23-15072-2026-05-13
```

## Expected patched evidence

```text
release: punctuation-qg-p23-15072-2026-05-13
runtime/generated/fixed: 15072/14560/512
unique surfaces/signatures: 15072/15072
properNounCapitalisationFindings: 0
hyphenAdverbialLyHyphenFindings: 0
hyphenMalformedCompoundFindings: 0
hyphenArticleAgreementFindings: 0
apostropheContractionGrammarFindings: 0
modelSelfMarkingFailures: 0
failing gates: none
```

Patched proper-noun probe:

```json
{
  "releaseId": "punctuation-qg-p23-15072-2026-05-13",
  "runtimeItems": 15072,
  "findingCount": 0,
  "uniqueAffectedItems": 0,
  "findings": []
}
```

## Validation commands

From a clean ZIP extraction after applying the patch:

```bash
git apply --check patches/001-punctuation-05131039-proper-noun-capitalisation-quality-gate.patch
git apply patches/001-punctuation-05131039-proper-noun-capitalisation-quality-gate.patch
node --test tests/punctuation-proper-noun-capitalisation-quality.test.js
npm run verify:punctuation-qg:p20-expansion
node --test tests/punctuation-qg-p20-runtime-surface-uniqueness.test.js tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js tests/punctuation-session-input-hardening.test.js tests/punctuation-session-ui.test.js tests/punctuation-scheduler.test.js tests/punctuation-golden-marking.test.js
```

## Production boundary

The uploaded ZIP has an empty production smoke file:

```text
reports/punctuation/punctuation-qg-p20-production-smoke.json
```

The full local verifier therefore fails at live evidence validation after the expansion stage passes. That is expected from this lean ZIP and must not be interpreted as a patched content failure.

After implementing and deploying P23, regenerate live production smoke for:

```text
punctuation-qg-p23-15072-2026-05-13
```

Then run:

```bash
npm run verify:punctuation-qg:p20-live
npm run verify:punctuation-qg:p20
```

Production certification requires origin, environment, release ID, runtime count, worker commit/deployment evidence, authenticated coverage, admin coverage, and smart-six coverage.
