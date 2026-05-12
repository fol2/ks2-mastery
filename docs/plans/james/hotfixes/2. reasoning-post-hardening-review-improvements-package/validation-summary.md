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

Targeted Reasoning tests after patch:

- `24/24` pass.

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

## Fresh patch application check

Patch dry-run on a fresh extraction:

- `patch --binary --dry-run -p1 < 003-reasoning-post-hardening-review-improvements.patch`: passed.

Patch apply on a fresh extraction:

- `patch --binary -p1 < 003-reasoning-post-hardening-review-improvements.patch`: passed.

Targeted tests after fresh patch application:

- `24/24` pass.

Adversarial probe after fresh patch application matches the patched working tree and shows all targeted issues fixed.

## Known validation limits

`npm test` and `npm run build` did not complete in the lean ZIP extraction because `node_modules` are absent. The build log reports missing `esbuild`; the npm test preflight reports missing `react` and `esbuild`. This is an environment/dependency limitation of the extracted lean ZIP, not evidence of a Reasoning runtime failure.

Live production deployment was not certified from this environment.
