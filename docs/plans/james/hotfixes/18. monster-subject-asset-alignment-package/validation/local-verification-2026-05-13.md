# Local Verification - Monster Subject Asset Alignment

Date: 2026-05-13

Worktree: `D:\Coding\ks2-mastery\.worktrees\monster-assets-b2-20260513`

## Commands

- `node --test tests/monster-subject-asset-contract.test.js tests/monster-visual-config.test.js tests/reading-session-interface.test.js tests/monster-visual-renderers.test.js tests/worker-monster-visual-config.test.js tests/effect-config-defaults.test.js`
  - Result: pass.
  - Summary: 58 tests, 58 pass, 0 fail.
  - Evidence: `validation/targeted-monster-asset-tests-2026-05-13-final.log`
- `npm test`
  - Result: pass.
  - Summary: 111552 tests, 111540 pass, 0 fail, 12 skipped, 819 suites.
  - Evidence: `validation/npm-test-2026-05-13-final.log`
- `npm run check`
  - Result: pass.
  - Build summary: generated `src\platform\game\monster-asset-manifest.js` with 340 monster assets.
  - Client bundle audit: pass, 1285 public files, 6 chunks scanned, main bundle 205514 / 232000 bytes gzip.
  - Wrangler dry-run: pass, read 1409 files from `dist\public`, total upload 23392.10 KiB / gzip 2231.29 KiB.
  - Evidence: `validation/npm-run-check-2026-05-13-final.log`

## Asset Inventory

- Active Reading, Arithmetic, and Reasoning families covered: 16.
- New subject-owned WebP files: 480.
- Per family coverage: 30 files each, covering `b1` and `b2`, stages `0` to `4`, sizes `320`, `640`, and `1280`.
- Manifest count: 340 monster assets.
- Manifest hash: `933ba1c0858d0f5b5b223a97`.
- Runtime asset version: `20260513-subject-assets`.

## Image Generation Evidence

- Phaeton b2 stage 4 generated PNG:
  - `evidence/imagegen/phaeton-b2-stage-4-mega-form-generated-2026-05-13.png`
  - Format: PNG
  - Dimensions: 1254 x 1254
  - Colour space: sRGB
  - Channels: 3
  - Alpha: false
- Scope: recorded as art direction evidence for the user-requested Phaeton `b2` stage `4` mega form. The runtime release consumes subject-owned WebP folders copied from approved source-family art rather than replacing every runtime illustration with newly generated artwork.

## Notes

- Test-generated report/CSP artefacts were restored after verification.
- `.tmp-tests`, helper scripts, and stale shard logs from earlier redirected runs were removed after verification.
