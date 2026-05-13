# Validation summary

## Source

- ZIP: `/mnt/data/ks2-mastery-lean-05131531.zip`
- ZIP SHA-256: `e1f6c8a068734e7a0faf1d2f450b9f3d9df57532872bac5ec8b849faa3005298`
- Local runtime: Node `v18.20.4`
- ZIP `.nvmrc`: Node `22`

## Baseline on uploaded ZIP

Targeted Reasoning/Hero/runtime tests passed: 46/46.

Baseline adversarial variety probe:

```json
{
  "cold": {
    "questionCount": 12,
    "uniqueTemplates": 12,
    "themedQuestions": 12,
    "uniqueThemes": 8,
    "extraCreditIds": ["theme_extra_credit_rate_pattern"]
  },
  "ready": {
    "questionCount": 12,
    "uniqueTemplates": 12,
    "themedQuestions": 12,
    "uniqueThemes": 8,
    "extraCreditIds": ["theme_extra_credit_rate_pattern"]
  }
}
```

## Patched result

Targeted tests passed: 49/49.

Patched content summary:

- Release id: `reasoning-variety-expansion-v2-2026-05-13`
- Templates: 138
- SATs-friendly templates: 136
- Context themes: 23
- Themed templates: 28
- Extra-credit templates: 2

Patched adversarial variety probe:

```json
{
  "cold": {
    "questionCount": 12,
    "uniqueTemplates": 12,
    "themedQuestions": 12,
    "uniqueThemes": 12,
    "extraCreditIds": []
  },
  "ready": {
    "questionCount": 12,
    "uniqueTemplates": 12,
    "themedQuestions": 12,
    "uniqueThemes": 12,
    "extraCreditIds": ["theme_extra_credit_crossing_rules"]
  }
}
```

Patched content audit:

```json
{
  "generated": 41400,
  "failureCount": 0,
  "distinctThemeIdsSeen": 23,
  "lowThemeCoverage": []
}
```

Fresh patchcheck content audit repeated the same 41,400-case result with 0 failures.

## Patch application

- `patch --binary --dry-run -p1`: passed on the lean ZIP patchcheck.
- `patch --binary -p1`: passed on the lean ZIP patchcheck.
- Current repo-root patch command: `git apply "docs/plans/james/hotfixes/16. reasoning-world-class-unlimited-variety-v2-package/patches/005-reasoning-world-class-unlimited-variety-v2.patch"`.
- Current patchcheck: `git apply --check` and `git apply` passed against pre-merge base commit `cf165dae`.

## Current repository verification

The original lean ZIP extraction did not include `node_modules`, so the package-only preflight could not complete full npm/build gates there. After applying the package in the normal repository worktree with dependencies installed, the current verification evidence is:

- `validation/current-contract-targeted-tests.log`: contract target list passed 50/50 against `cf165dae`.
- `validation/current-content-audit-41400.json`: 138 templates × 300 seeds = 41,400 generated cases, 0 failures.
- `validation/current-variety-probe.json`: cold and ready adversarial probes both returned 12 unique themes; cold learners received no extra-credit templates.
- `validation/current-npm-test.log`: full `npm test` passed with 111,536 pass, 0 fail, 12 skipped against `cf165dae`.
- `validation/current-npm-run-check.log`: `npm run check` completed the Cloudflare dry-run build, public build assertion, and client-bundle audit against `cf165dae`.
- `SHA256SUMS.txt`: verified after LF normalisation under the package `.gitattributes` rule.
