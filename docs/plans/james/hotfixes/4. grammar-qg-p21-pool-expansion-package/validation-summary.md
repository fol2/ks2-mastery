# Grammar QG P21 Validation Summary

## Source boundary

The uploaded lean ZIP remains the supplied snapshot. The applied production
work was completed in an isolated git worktree against current `origin/main`,
then reconciled with the existing Grammar release evidence chain.

The package remains Grammar-only. Reward, Stars, mastery, Hero Mode, monster,
event projection, D1 schema, R2, spelling, punctuation, and cross-subject
runtime behaviour were not intentionally changed.

## Patch identity

Patch file:

`patches/001-grammar-qg-p21-pool-expansion-and-local-repetition.patch`

Patch SHA-256:

`81aa706873ad7d1a081854b6b65d3eb5fb2f989d1061f6df1ad51b07837d26da`

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

Result: exit `0`, `9/9` tests pass.

Local repetition audit:

```text
node scripts/audit-grammar-qg-p21-local-repetition.mjs --json
```

Result:

```json
{
  "status": "pass",
  "summary": {
    "violationCount": 0,
    "warningCount": 0,
    "minUniqueTemplates": 18,
    "minUniquePrompts": 53,
    "minUniqueVariants": 59
  }
}
```

Full local production gate:

```text
npm test
```

Result after the manual-expansion CRLF verifier fix: `111437` pass, `0` fail, `12` skipped.

Cloudflare dry-run gate:

```text
npm run check
```

Result: exit `0`.

Manual expansion freshness gate:

```text
node scripts/generate-grammar-manual-expansion.mjs --check
```

Result after CRLF normalisation fix: exit `0`.

Production release gate:

```text
npm run verify:grammar-qg-production-release
```

Result after CRLF normalisation fix: exit `0`, full smart-practice audit `0` failures and `0` advisories.

Production deploy and smoke:

- `npm run deploy`: exit `0`, Cloudflare version `af313454-1cb3-4a2e-9eb8-2edf7ab3c801`
- `npm run smoke:production:grammar -- --json --expected-release=grammar-qg-p21-2026-05-11 --out=reports/grammar/grammar-production-smoke-grammar-qg-p21-2026-05-11.json`: exit `0`
- smoke result: `ok=true`, release `grammar-qg-p21-2026-05-11`, console/request/HTTP failures `0`

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

P21 fixes the learner-local pool and repetition contract in two ways:

1. It expands the pool with curated, low-risk, selected-response cases across every Grammar concept.
2. It prevents the scheduler from leaning on recently seen visible variants or static templates during heavy focused practice.

The initial package treated prompt-rhythm repeats as warnings. For this
production pass, those warnings were treated as blockers and fixed. The final
P21 local repetition report has `0` warnings.

The production-release verifier also exposed a Windows-only false stale result
in `scripts/generate-grammar-manual-expansion.mjs --check`: the generated file
content was semantically current, but CRLF line endings in the working tree did
not byte-match the LF generator output. The check now normalises line endings
before comparison and is covered by `tests/grammar-qg-p20-quality-hardening.test.js`.

## Evidence files

- `validation/production-ready-npm-run-verify-grammar-qg-p21-after-p21-collision-scan-zero-2026-05-11.log`
- `validation/production-ready-npm-run-verify-grammar-qg-p21-after-rebase-2026-05-11.log`
- `validation/production-ready-npm-run-verify-grammar-qg-p21-after-second-rebase-2026-05-11.log`
- `validation/production-ready-node-test-p10-evidence-p20-quality-hardening-final-2026-05-11.log`
- `validation/production-ready-node-test-p10-scheduler-p11-matrix-final-2026-05-11.log`
- `validation/production-ready-npm-test-after-rebase-2026-05-11.log`
- `validation/production-ready-npm-run-check-after-rebase-2026-05-11.log`
- `validation/production-ready-npm-test-after-second-rebase-2026-05-11.log`
- `validation/production-ready-npm-run-check-after-second-rebase-2026-05-11.log`
- `validation/production-ready-npm-run-verify-grammar-qg-p21-after-reasoning-rebase-2026-05-11.log`
- `validation/production-ready-npm-test-after-reasoning-rebase-2026-05-11.log`
- `validation/production-ready-npm-run-check-after-reasoning-rebase-2026-05-11.log`
- `validation/production-ready-npm-run-verify-grammar-qg-p21-after-reasoning-evidence-rebase-2026-05-11.log`
- `validation/production-ready-npm-run-deploy-2026-05-11.log`
- `validation/production-ready-grammar-production-smoke-p21-2026-05-11.log`
- `validation/production-ready-npm-run-verify-grammar-qg-production-release-2026-05-11.log`
- `validation/production-ready-generate-grammar-manual-expansion-after-production-release-blocker-2026-05-11.log`
- `validation/production-ready-npm-run-verify-grammar-qg-production-release-after-manual-expansion-2026-05-11.log`
- `validation/production-ready-manual-expansion-check-after-crlf-fix-2026-05-11.log`
- `validation/production-ready-node-test-grammar-qg-p20-quality-hardening-after-crlf-fix-2026-05-11.log`
- `validation/production-ready-npm-test-after-manual-expansion-2026-05-11.log`
- `validation/production-ready-npm-run-check-after-manual-expansion-2026-05-11.log`
- `validation/production-ready-npm-test-after-crlf-fix-2026-05-11.log`
- `validation/production-ready-npm-run-check-after-crlf-fix-2026-05-11.log`
- `validation/production-ready-npm-run-verify-grammar-qg-production-release-after-crlf-fix-2026-05-11.log`
- `reports/grammar/grammar-qg-p21-local-repetition.json`
- `reports/grammar/grammar-production-smoke-grammar-qg-p21-2026-05-11.json`
- `reports/grammar/grammar-qg-p21-smart-practice-full.json`
- `reports/grammar/grammar-qg-p21-smart-practice-full.md`
- `reports/grammar/grammar-qg-p21-certification-manifest.json`
- `reports/grammar/grammar-qg-p21-render-inventory.json`
- `reports/grammar/grammar-qg-p21-quality-register.json`
- `reports/grammar/grammar-qg-p21-distractor-audit.json`
- `reports/grammar/grammar-qg-p21-marking-matrix.json`

## Production boundary

Live production certification has been completed on `https://ks2.eugnel.uk`.
The final deploy, smoke, independent review, and sync evidence are recorded in
the completion report in this folder.
