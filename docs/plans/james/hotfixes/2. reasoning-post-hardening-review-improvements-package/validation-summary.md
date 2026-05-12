# Validation summary

## Source identity

Source ZIP: `/mnt/data/ks2-mastery-lean-05121226.zip`

Source ZIP SHA-256:

`a0f99b47f8268e73f79aa7d95fe1b1fb63dba0a7aef87ff9ed6d744cf00e9dbe`

Runtime: Node `v22.16.0`, npm `10.9.2`, `.nvmrc` = `22`.

## Baseline before patch

Targeted Reasoning tests on the uploaded ZIP snapshot:

- `18/18` pass.

Adversarial probe before patch:

```json
{
  "domainLeakedBeforeMark": true,
  "retryStillQueuedAfterStart": false,
  "staleFeedbackAfterMove": true,
  "blankListResponseCleared": false,
  "supportedAwardedEvidence": true,
  "angleDegreeSuffixAccepted": false,
  "areaCm2SuffixAccepted": false,
  "workingCapturedByAction": false
}
```

## Patched working tree

Targeted Reasoning tests after the final reviewer and auditor fixes:

- `25/25` pass.

Patched adversarial probe:

```json
{
  "domainLeakedBeforeMark": false,
  "retryStillQueuedAfterStart": true,
  "retryRemovedAfterFinalise": true,
  "staleFeedbackAfterMove": false,
  "blankListResponseCleared": true,
  "supportedAwardedEvidence": false,
  "angleDegreeSuffixAccepted": true,
  "areaCm2SuffixAccepted": true,
  "workingCapturedByAction": true
}
```

Node syntax checks passed for touched `.js` files. The touched `.jsx` file was not checked by `node --check` because JSX compilation requires the build toolchain.

Final full-repository gates after the reviewer and auditor blockers were fixed, after the branch was fast-forwarded to the latest `origin/main`, and from committed code revision `ed5ed1e05cc4587052f315920b5e17449e753b3f`:

- `node --test tests/reasoning-content-contract.test.js tests/reasoning-engine-rewards.test.js tests/reasoning-production-smoke.test.js tests/reasoning-subject-registry.test.js`: `25/25` pass (`validation/current-targeted-tests-after-code-commit-2026-05-12.log`).
- `npm test`: `111478` pass, `0` fail, `12` skipped (`validation/current-npm-test-after-code-commit-2026-05-12.log`).
- `npm run build`: passed as part of deploy/check (`validation/production-deploy-2026-05-12.log`, `validation/current-npm-run-check-after-code-commit-2026-05-12.log`).
- `npm run check`: passed (`validation/current-npm-run-check-after-code-commit-2026-05-12.log`).

Reviewer and auditor blocker closure logs:

- `validation/red-review-blockers-2026-05-12.log`
- `validation/green-review-blockers-2026-05-12.log`
- `validation/red-question-nav-leak-2026-05-12.log`
- `validation/green-question-nav-leak-2026-05-12.log`
- `validation/red-auditor-blockers-2026-05-12.log`
- `validation/green-auditor-blockers-2026-05-12.log`
- `validation/final-code-review-after-final-review-blockers-and-origin-sync-2026-05-12.log`
- `validation/final-contract-audit-2026-05-12.log`

## Fresh patch application check

Current patch dry-run on a fresh worktree from the latest `origin/main`:

- `patch --dry-run -p1 < 003-reasoning-post-hardening-review-improvements.patch`: passed (`validation/final-patch-text-dry-run-after-final-review-blockers-and-origin-sync-2026-05-12.log`).

Current patch apply on a fresh worktree:

- `patch -p1 < 003-reasoning-post-hardening-review-improvements.patch`: passed (`validation/final-patch-text-apply-after-final-review-blockers-and-origin-sync-2026-05-12.log`).

Targeted tests after fresh patch application:

- `25/25` pass (`validation/final-patch-targeted-tests-after-final-review-blockers-and-origin-sync-2026-05-12.log`).

Adversarial probe after fresh patch application matches the patched working tree and shows all targeted issues fixed.

## Production deployment

- `npm run deploy`: passed, Cloudflare version `c70280c6-45ab-4b7f-b6ea-3b6cecf1f97a` (`validation/production-deploy-2026-05-12.log`).
- Production bundle audit: passed for `https://ks2.eugnel.uk/` as part of deploy.
- `node ./scripts/reasoning-production-smoke.mjs --origin https://ks2.eugnel.uk`: passed with source commit `ed5ed1e05cc4587052f315920b5e17449e753b3f` (`validation/production-reasoning-smoke-2026-05-12.json`, `validation/production-reasoning-smoke-2026-05-12.log`).
- `node ./scripts/reasoning-production-ui-smoke.mjs --origin https://ks2.eugnel.uk`: passed desktop and mobile viewports with no page errors, console errors, request failures, or HTTP failures (`validation/production-reasoning-ui-smoke-2026-05-12.json`, `validation/production-reasoning-ui-smoke-2026-05-12.log`).
- UI screenshots: `validation/production-reasoning-ui-screenshots-2026-05-12/reasoning-setup-1280x800.png`, `validation/production-reasoning-ui-screenshots-2026-05-12/reasoning-session-1280x800.png`, and `validation/production-reasoning-ui-screenshots-2026-05-12/reasoning-setup-390x844.png`.
- Final Contract Auditor pass: `PASS` with no findings (`validation/final-contract-audit-2026-05-12.log`).

## Known validation limits

The original lean ZIP extraction still has historical dependency-limit logs because `node_modules` were absent there. Those logs are superseded by the final full-repository gates and production evidence listed above.
