# Grammar QG P21A Validation Summary

## Source boundary

The uploaded lean ZIP remains the supplied snapshot. This package was built against the previously patched Grammar 05102302 baseline, because P21A builds on the earlier interface/variety and Grammar Bank hotfix package.

GitHub was used only as supplementary shape evidence. Production was not independently certified.

## Patch identity

Patch file:

`patches/001-grammar-qg-p21-pool-expansion-and-local-repetition.patch`

Patch SHA-256:

`650b17cd8ba6ee5563f04c10d79d25e65469a7deb5cf0f6a9fbed1592f0d6444`

Source ZIP SHA-256:

`58b5ad91e1aac120f83c49fd0c198d763ffedfdb1b3bc72cfc1fa928c78783c6`

Prerequisite hotfix package SHA-256:

`78af044ed5b83ea9ae7675458f4aa21002dadde1dfd8342adef5d47aeeb98330`

## Validation results

Patch dry-run on a fresh previous-hotfix baseline: passed.

Patch apply on a fresh previous-hotfix baseline: passed.

Fresh-applied P21 tests:

```text
node --test tests/grammar-qg-p21-pool-expansion.test.js tests/grammar-qg-p21-local-repetition.test.js
```

Result: `4/4` pass.

Combined patched tests:

```text
node --test tests/grammar-qg-p21-pool-expansion.test.js tests/grammar-qg-p21-local-repetition.test.js tests/grammar-question-generator-audit.test.js
```

Result: `11/11` pass.

Package verifier:

```text
npm run verify:grammar-qg-p21
```

Result: exit `0`.

Local repetition audit:

```text
node scripts/audit-grammar-qg-p21-local-repetition.mjs --steps=40 --json
```

Result:

```json
{
  "status": "pass",
  "summary": {
    "violationCount": 0,
    "warningCount": 147,
    "minUniqueTemplates": 18,
    "minUniquePrompts": 29,
    "minUniqueVariants": 40
  }
}
```

Default package local repetition report:

```json
{
  "status": "pass",
  "summary": {
    "violationCount": 0,
    "warningCount": 327,
    "minUniqueTemplates": 18,
    "minUniquePrompts": 40,
    "minUniqueVariants": 58
  }
}
```

Grammar QG audit:

- release id: `grammar-qg-p21-2026-05-11`
- template count: `546`
- repeated generated variants: `0`
- generated signature collisions: `0`

Grammar QG deep audit:

- release id: `grammar-qg-p21-2026-05-11`
- template count: `546`
- repeated generated variants: `0`
- generated signature collisions: `0`
- low-depth generated templates: `0`

Content quality seeds 1..3:

```json
{
  "totalTemplatesChecked": 1638,
  "hardFailCount": 0,
  "advisoryCount": 0
}
```

## Product interpretation

P21A improves the learner experience in two ways:

1. It expands the pool with curated, low-risk, selected-response cases across every Grammar concept.
2. It prevents the scheduler from leaning on recently seen visible variants or static templates during heavy focused practice.

The warning count in the local repetition audit is not a hard failure. Those warnings are prompt-rhythm repeats where the short instruction repeats but the full visible task surface differs. They are kept in the report so product review can continue to improve perceived variety.

## Honest limits

This package does not prove production. It does not include a final live smoke, deployed origin, production release id, or Cloudflare/D1 evidence.

This package also does not complete the long-term target of 900-1,100 effective Grammar templates. It creates the P21A harness and first curated expansion slice so future expansion can happen safely.
