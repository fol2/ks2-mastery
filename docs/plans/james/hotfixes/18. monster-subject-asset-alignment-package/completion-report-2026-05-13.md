# Monster Subject Asset Alignment Completion Report

Date: 2026-05-13

## Summary

The active Reading, Arithmetic, and Reasoning monster rosters now use
subject-owned runtime asset folders instead of cross-subject `assetId` aliases.
Each of the 16 active subject monster families has `b1` and `b2` branches,
stages `0` to `4`, and `320`, `640`, and `1280` WebP assets.

Runtime image paths now resolve through each subject monster id, while copied
source-family visual tuning is preserved for baseline facing, meadow movement,
codex foot pads, and tuned provenance. The Phaeton-derived legendary subject
monsters (`lorequill`, `arithon`, `strategon`) keep Phaeton `fly-b` behaviour
and foot-pad tuning while serving images from their own subject-owned folders.

## Deployment

- Runtime commit deployed to production: `4a0816be`.
- Production URL: `https://ks2.eugnel.uk`.
- Cloudflare deploy version id: `6c44bf78-52b9-43e1-bd22-d0baabc94ddb`.
- Deploy command: `npm run deploy`.
- Deploy evidence: `validation/npm-run-deploy-2026-05-13.log`.

## Verification

- Targeted contract/render suite: 58 tests, 58 pass, 0 fail.
- Full suite: 111552 tests, 111540 pass, 0 fail, 12 skipped, 819 suites.
- `npm run check`: pass, including Wrangler dry-run and client bundle audit.
- Pre-push hook: pass, including full `npm test`, before `4a0816be` was pushed to `main`.
- Production bundle audit: pass for `https://ks2.eugnel.uk/`.
- Production monster asset smoke: 128 live checks, 128 pass.

## Independent Review

- Code Reviewer second pass: GREEN.
- Contract Auditor second pass: GREEN.
- Previous blockers were closed:
  - Phaeton-derived subject monsters preserve source-family visual tuning.
  - Runtime asset paths remain subject-owned.
  - Generated report/CSP/temp artefacts were cleaned.
  - Image-generation evidence is explicitly scoped as art direction evidence,
    not a runtime WebP replacement package.

## Evidence Files

- Contract: `contract/monster-subject-asset-alignment-contract.md`.
- Asset provenance: `evidence/asset-provenance/subject-monster-asset-provenance-2026-05-13.md`.
- Image generation prompt: `evidence/imagegen/phaeton-b2-stage-4-prompt-2026-05-13.md`.
- Image generation output: `evidence/imagegen/phaeton-b2-stage-4-mega-form-generated-2026-05-13.png`.
- Local verification summary: `validation/local-verification-2026-05-13.md`.
- Targeted test log: `validation/targeted-monster-asset-tests-2026-05-13-final.log`.
- Full test log: `validation/npm-test-2026-05-13-final.log`.
- Check log: `validation/npm-run-check-2026-05-13-final.log`.
- Deploy log: `validation/npm-run-deploy-2026-05-13.log`.
- Production asset smoke: `validation/production-monster-asset-smoke-2026-05-13.json`.
