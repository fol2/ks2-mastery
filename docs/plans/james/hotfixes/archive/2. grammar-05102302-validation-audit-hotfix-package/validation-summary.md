# Grammar 05102302 validation summary

## ZIP identity

- Source ZIP: `ks2-mastery-lean-05102302.zip`
- SHA-256: `58b5ad91e1aac120f83c49fd0c198d763ffedfdb1b3bc72cfc1fa928c78783c6`
- Integrity: passed (`unzip -t` reported no errors)
- Runtime: Node `v22.16.0`, npm `10.9.2`, `.nvmrc=22`
- Lean manifest: `mode=placeholder`, `copied=2613`, `omitted=783`, `placeholders=783`, `missing=0`

## Baseline validation

Baseline ZIP checks were broadly healthy:

- Grammar QG audit: `510` templates, `18` concepts, `484` generated templates, `26` fixed templates.
- Deep audit: no low-depth generated-template finding in the built-in audit.
- Content quality seeds `1..3`: `1530` checks, `0` hard failures, `0` advisories.
- Open-response fairness seeds `1..3`: passed, `0` findings.
- P20 quality seeds `1..3`, smart seed `1`: all failure/finding counts `0`.
- Smart-practice smoke seeds `1..3`: `33` sessions, `0` failures, `0` advisories.

Known local limit: `tests/grammar-engine-generation.test.js` did not finish in the local execution window. I did not count that as a failure.

## Findings

### Finding A — ZIP-lagged Grammar Bank label glitch

The uploaded ZIP still had the pre-PR #896 Grammar Bank label ordering. A secure nested confidence concept with coarse `status: due` was shown as `needs-repair` / `Trouble spot`.

Baseline probe:

```json
{
  "secureCards": [],
  "dueCards": [
    { "id": "relative_clauses", "label": "needs-repair", "childLabel": "Trouble spot" }
  ]
}
```

Patched probe:

```json
{
  "secureCards": [
    { "id": "relative_clauses", "label": "secure", "childLabel": "Secure" }
  ],
  "dueCards": []
}
```

### Finding B — cross-template learner-surface repetition

The standard audits did not catch cross-template prompt collisions. A separate learner-surface audit over `510 × 30 = 15,300` surfaces found `43` cross-template duplicate events in the baseline ZIP.

Fresh-applied patched result:

```json
{
  "templateCount": 510,
  "seedCount": 30,
  "totalCases": 15300,
  "crossTemplateDuplicateSurfaceCount": 0
}
```

### Finding C — session feedback could be more action-clear

No correctness bug, but the question-session feedback panel could be made more intuitive by adding one next-step line inside the existing feedback frame. The patch does this without introducing a new primary action.

## Patch validation

Patch dry-run on a fresh ZIP extraction: passed.

Patch apply on a fresh ZIP extraction: passed.

Fresh-applied tests:

- `node --test tests/grammar-ui-model.test.js`: `135/135` pass
- `node --test tests/grammar-qg-p20-quality-hardening.test.js`: `6/6` pass
- `node --test tests/grammar-qg-p20-answer-acceptance.test.js`: `15/15` pass
- `node --test tests/grammar-answer-spec.test.js`: `19/19` pass

Patched working-tree additional tests:

- `node --test tests/grammar-answer-spec-audit.test.js`: `12/12` pass
- `node --test tests/grammar-question-generator-audit.test.js`: `5/5` pass

Patched audits:

- `node scripts/generate-grammar-manual-expansion.mjs --check`: up to date
- `node scripts/audit-grammar-question-generator.mjs --json`: pass shape retained
- `node scripts/audit-grammar-question-generator.mjs --deep --json`: pass shape retained
- `node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3 --json`: `1530` checks, `0` hard failures, `0` advisories
- `node scripts/audit-grammar-open-response-fairness.mjs --seeds=1,2,3`: passed, `0` findings
- `node scripts/audit-grammar-qg-p20-quality-hardening.mjs --seeds=1,2,3 --smart-seeds=1`: all failure/finding counts `0`

## Not certified here

- Live production readiness was not independently certified.
- Visual asset completeness was not certified because the lean ZIP intentionally uses placeholders.
- Full `npm test` was not run in this package; this is targeted Grammar validation plus fresh-applied patch validation.
