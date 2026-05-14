# Monster Subject Asset Alignment Completion Report

Date: 2026-05-14
Production origin: https://ks2.eugnel.uk
Package: `docs/plans/james/hotfixes/18. monster-subject-asset-alignment-package`
Status: complete

## Contract

Complete the subject monster artwork and Codex contract without renaming existing monsters. The fix covers the active Reading, Arithmetic, and Reasoning subject monsters, their runtime WebP assets, their Codex visibility, and duplicate protection against Hero Camp reserve monsters and all other monster families.

## Root Cause

The previous package did not fully prove Nelson's live counterexample. `readbloom`, `readrill`, `inferane`, `structurillon`, `sumkrab`, `carryfin`, `fractail`, `perciva`, `numdrake`, `fractalon`, `georune`, and `proofwyrm` had runtime WebP files that were byte-identical to Hero Camp reserve families. The broader audit also found `lorequill`, `arithon`, and `strategon` duplicated the `phaeton` family, while `measuron` duplicated `curlune`.

Codex also only grouped Spelling, Punctuation, and Grammar monsters, so Reading, Arithmetic, and Reasoning subject monsters were absent from the Codex surface even when their IDs and names were correct.

## Delivered Changes

- Kept all monster names and IDs unchanged.
- Added all active Reading, Arithmetic, and Reasoning subject monsters to Codex grouping and progression order.
- Removed subject monster visual-source inheritance so subject monsters render from their own families.
- Replaced or generated distinct transparent runtime WebP artwork for 16 subject monsters across both branches, all five stages, and all three runtime sizes: 480 files.
- Added deterministic generation and validation tooling for this contract.
- Added production smoke coverage that verifies live Codex DOM visibility, recursive deployed JS bundle evidence, 480 subject WebP hashes, Hero Camp duplicate absence, all other monster-family duplicate absence, and within-monster branch/stage distinctness.
- Bumped the monster runtime asset cache key to `20260514-subject-assets`.

## Evidence

Local validation:

- `validation/monster-subject-codex-and-art-validation-2026-05-14.json`
- Result: `ok: true`
- Codex entries: 28
- Codex groups: Spelling, Punctuation, Grammar, Reading, Arithmetic, Reasoning
- Hero Camp duplicate count: 0
- All-monster duplicate count: 0
- Within-monster duplicate count: 0
- Runtime image failure count: 0

Preview contact sheets:

- `evidence/runtime-preview/subject-monsters-b1-all-stages-contact-sheet-2026-05-14.png`
- `evidence/runtime-preview/subject-monsters-b2-all-stages-contact-sheet-2026-05-14.png`

Verification logs:

- `validation/targeted-monster-codex-tests-2026-05-14.log`
- `validation/npm-test-2026-05-14.log`
- `validation/npm-run-check-2026-05-14.log`

Production deployment:

- Commit deployed: `09d44ffe60f5e22ca61b91c7d5ac6547220d8e20`
- Deploy log: `validation/npm-run-deploy-2026-05-14.log`
- Cloudflare version ID: `fe3786c0-78cb-4627-918e-f644152a8493`
- Production bundle audit: passed for `https://ks2.eugnel.uk/`

Production smoke:

- `validation/production-monster-subject-codex-and-art-smoke-2026-05-14.json`
- Screenshot: `evidence/production-codex-ui/production-codex-ui-2026-05-14.png`
- Result: `ok: true`
- Bundle asset version seen: true
- Live source Codex entries: 28
- Live Codex DOM cards: 28
- Live subject WebP files checked: 480
- Live subject WebP failures: 0
- Live Hero Camp duplicate count: 0
- Live all-monster duplicate count: 0
- Live all-other monster WebP files checked: 540
- Live within-monster duplicate count: 0

## Independent Review Closure

The first independent Code Reviewer and Contract Auditor pass found blockers. Those blockers were fixed, locally verified, pushed, deployed, and production-smoked again.

Final independent re-review:

- Code Reviewer `019e27fb-6fc9-7f53-8fb0-b70d4527bf51`: GREEN, no blockers or advisories.
- Contract Auditor `019e27fb-701d-7cf2-b0cf-a1909115e201`: GREEN, no blockers or advisories.

Closure decision: complete. The runtime contract is deployed on `https://ks2.eugnel.uk`, the subject monster artwork is independent, Codex exposes the active subject monsters, and live production evidence proves no Hero Camp, Phaeton, Curlune, or other monster-family duplicate remains.
