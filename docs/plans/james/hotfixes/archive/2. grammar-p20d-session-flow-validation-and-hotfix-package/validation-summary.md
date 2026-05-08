# Grammar P20d session-flow validation summary

## Rebuild note

This package was recreated after the previous Code Interpreter artifact expired. The package was rebuilt from the uploaded lean ZIP available in `/mnt/data`.

## Source ZIP

`/mnt/data/ks2-mastery-lean-05070029.zip`

SHA-256:

`fb4bfc0fb0dc0ca92dd17513de33a9f2eb722d1edb9bce4cc664d29e6f19be9a`

## Patch

Primary patch:

`patches/001-grammar-p20d-session-flow-primary-and-similar.patch`

LF-normalised helper copy:

`patches/001-grammar-p20d-session-flow-primary-and-similar.lf.patch`

Patch apply result on a fresh extraction:

```text
PASS: git apply --check
PASS: git apply
6 files changed, 67 insertions(+), 14 deletions(-)
```

## Bugs/glitches found

### Feedback primary action hierarchy

Baseline feedback rendered a disabled primary `Saved` button and placed `Next question` / `Finish round` as a secondary action. That is a usability glitch for a child-facing question session because the strongest visual action is unusable.

Patch result: feedback state now renders `Next question` or `Finish round` as the single active primary action. The disabled `Saved` submit button is not rendered in feedback.

### Similar-problem pre-answer mutation

Baseline probe:

```json
{
  "changed": true,
  "beforePhase": "session",
  "beforeAnswered": 0,
  "beforeCurrentIndex": 0,
  "beforeTemplateId": "fronted_adverbial_choose",
  "afterPhase": "session",
  "afterAnswered": 0,
  "afterCurrentIndex": 1,
  "afterTemplateId": "fronted_adverbial_choose",
  "afterTargetCount": 2
}
```

Patched probe:

```json
{
  "blocked": true,
  "code": "grammar_repair_not_ready",
  "message": "Similar problem is available after an answer has been marked.",
  "phase": "session",
  "answered": 0,
  "currentIndex": 0
}
```

Patched same-skill fresh-template probe after a marked wrong answer:

```json
{
  "changed": true,
  "baseTemplateId": "fronted_adverbial_choose",
  "nextTemplateId": "qg_p18_p15_adverbials_adverbial_transfer",
  "sameTemplate": false,
  "baseSkillIds": ["adverbials"],
  "nextSkillIds": ["adverbials"],
  "phase": "session",
  "answered": 1,
  "currentIndex": 1,
  "targetCount": 2,
  "similarProblems": 1
}
```

## Validation run results

Targeted Grammar engine/scheduler tests on the patched working tree:

```text
# tests 53
# pass 53
# fail 0
```

Fresh-applied patch check:

```text
PASS: git apply --check
PASS: git apply
Fresh-applied Grammar engine validation: 33/33 pass
```

Answer/P20 quality tests on patched working tree:

```text
# tests 37
# pass 37
# fail 0
```

Grammar QG/content audit summary:

```text
releaseId: grammar-qg-p20-2026-05-05
templateCount: 510
generatedTemplateCount: 484
constructedResponseCount: 189
manualReviewOnlyTemplateCount: 157
legacyAdapterTemplateCount: 0
lowDepthGeneratedTemplates: []
p4MixedTransferComplete: true
```

Content quality smoke:

```text
totalTemplatesChecked: 1530
hardFailCount: 0
advisoryCount: 0
```

Open-response fairness audit:

```text
passed: true
findingCount: 0
```

Manual expansion check:

```text
Grammar manual expansion is up to date: worker/src/subjects/grammar/manual-expansion.generated.js
```

## Runtime limitation

React SSR tests could not be executed in this lean ZIP environment because `node_modules` is absent and the React harness imports `esbuild`. The React assertions were updated in the patch and should run in CI or a dependency-complete checkout.

## Production limitation

This package is ZIP-local validation and patch evidence only. It is not live production certification. A post-deploy Grammar smoke with environment origin, release id, timestamp, and pass/fail result is still needed after shipping.
