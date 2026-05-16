# Reasoning world-class variety hardening completion report

## Result

Status: complete and production deployed.

Runtime commit: `686ff57fb3a39466c2d1a6753e83e2ffd11c661e`

Cloudflare deployment version: `20f2baaf-d483-4889-86f5-fd8caf171aff`

Production origin: `https://ks2.eugnel.uk`

## Scope delivered

- Expanded the Reasoning content release to `reasoning-variety-hardening-2026-05-13`.
- Increased the Reasoning template bank from 110 to 124 templates.
- Added 12 context themes, 14 themed template families, and one non-SATs extra-credit family.
- Hardened the scheduler so wide eligible pools avoid obvious same-template repeats while exact due retries still preserve their original `{ templateId, seed }`.
- Closed reviewer-raised impossible or ambiguous themed-item cases for mixed units, fractions, percentages, ratio labels, and money labels.
- Moved the production Reasoning smoke default report path to `reports/reasoning/reasoning-production-smoke-current.json`.

## Independent gates

- Code Reviewer: GREEN.
- Contract Auditor: GREEN.
- Auditor follow-up blocker closed by replacing stale raw `npm ci` evidence with base-labelled `node scripts/worktree-setup.mjs` evidence.

## Verification

- `validation/current-worktree-setup-main-54bbfbfb.log`: passed.
- `validation/current-targeted-reasoning-tests-main-54bbfbfb.log`: 29 tests passed.
- `validation/current-content-audit-124k-main-54bbfbfb.json`: 124,000 generated cases checked.
- `validation/current-scheduler-adversarial-probe-main-54bbfbfb.json`: anti-repeat probe passed across Smart Review, Skill Practice, Trouble Drill, and SATs Mini-Set.
- `validation/current-npm-test-main-54bbfbfb.log`: `npm test` passed 111,524 tests with 111,512 passing, 0 failing, and 12 skipped.
- Pre-push `npm test`: passed 111,524 tests with 111,512 passing, 0 failing, and 12 skipped before `686ff57f` was pushed to `main`.
- `validation/current-npm-build-main-54bbfbfb.log`: `npm run build` passed.
- `validation/current-npm-check-main-54bbfbfb.log`: `npm run check` passed through `scripts/wrangler-oauth.mjs`.
- `validation/current-patch-apply-check-main-54bbfbfb.log`: patch apply check passed on clean `origin/main`.
- `validation/current-patch-apply-main-54bbfbfb.log`: patch applied cleanly and changed exactly seven Reasoning files.
- `validation/current-git-diff-check-main-54bbfbfb.log`: scoped `git diff --check` passed for the seven Reasoning patch files.

## Production evidence

- `validation/production-npm-deploy-main-686ff57f.log`: `npm run deploy` passed and production bundle audit passed.
- `validation/production-reasoning-smoke-main-686ff57f.json`: live Reasoning command smoke passed.
- `validation/production-reasoning-smoke-main-686ff57f-direct.log`: command smoke console output.
- `validation/production-reasoning-ui-smoke-main-686ff57f.json`: live browser UI smoke passed on desktop and mobile viewports.
- `validation/production-reasoning-ui-smoke-main-686ff57f-direct.log`: UI smoke console output.
- `validation/screenshots/production-reasoning-ui-main-686ff57f/reasoning-setup-1280x800.png`: desktop setup screenshot.
- `validation/screenshots/production-reasoning-ui-main-686ff57f/reasoning-session-1280x800.png`: desktop session screenshot.
- `validation/screenshots/production-reasoning-ui-main-686ff57f/reasoning-setup-390x844.png`: mobile setup screenshot.

## Repository state

- Code commit `686ff57fb3a39466c2d1a6753e83e2ffd11c661e` was pushed to `origin/main`.
- Production evidence is recorded beside the source contract under `docs/plans/james/hotfixes/8. reasoning-world-class-variety-hardening-package/`.
- The final evidence commit is documentation and artefacts only.
