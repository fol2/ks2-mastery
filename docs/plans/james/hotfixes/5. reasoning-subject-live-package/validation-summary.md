# Reasoning subject live validation summary

## Environment

- Source snapshot: `/mnt/data/ks2-mastery-lean-05111050.zip`
- Work tree: `/mnt/data/ks2-reasoning-work`
- Node: v22.16.0
- Package install: `npm ci --ignore-scripts` completed successfully before validation.

## Checks run

### Content bank smoke

Command: custom Node smoke over `shared/reasoning/content.js`.

Result:

- 110 templates
- 2,200 generated questions checked across 20 seeds each
- 0 failures
- safe question serialisation checked with feedback/skill metadata
- marker/evaluate function leakage rejected

Log: `validation/content-smoke.log`

### Syntax checks

Command: `node --check` over Reasoning shared, Worker, client module, mastery and Hero adapter/provider files.

Result: passed.

Log: `validation/syntax-checks.log`

### Targeted test suite

Command:

`npm test -- tests/reasoning-content-contract.test.js tests/reasoning-engine-rewards.test.js tests/reasoning-subject-registry.test.js tests/hero-reasoning-integration.test.js tests/hero-providers.test.js tests/hero-launch-adapters.test.js tests/hero-eligibility.test.js tests/worker-subject-runtime.test.js tests/worker-reading-runtime.test.js tests/reading-subject-registry.test.js tests/main-runtime.test.js tests/react-subject-contract.test.js tests/ui-visual-journey-ready-subjects.test.js tests/ui-subject-visual-adapter-contract.test.js tests/hero-pool-registry.test.js tests/subject-contract.test.js`

Result:

- 166 tests
- 6 suites
- 166 pass
- 0 fail

Log: `validation/targeted-tests.log`

### Build

Command: `npm run build`

Result: passed.

Note: the build log includes `fatal: not a git repository`, which is expected for the extracted lean ZIP because it has no `.git` metadata. Bundles were still produced successfully.

Log: `validation/build.log`


### Patch application

Commands:

- `patch -p1 --dry-run < 001-reasoning-subject-live.patch`
- `patch -p1 < 001-reasoning-subject-live.patch`

Result: dry-run and apply both passed on a fresh extraction of `ks2-mastery-lean-05111050.zip`.

Logs:

- `validation/patch-dry-run.log`
- `validation/patch-apply.log`

## Not certified here

- No live Cloudflare/D1 production smoke was run.
- Lean ZIP asset payload completeness is not certified.
- GitHub main was not treated as the implementation authority; the uploaded ZIP snapshot was.

## Repository integration certification

The repository integration on 2026-05-11 adds live deployment certification for runtime commit `fde9b7c14e1aff33dbb602e6c290a8d0294057e9`. The final Reasoning evidence/report packet is committed in `b3518e4a5c43900183355b8abdfdacacba9cc0e3`, which is present in `origin/main`.

Additional checks run:

- `npm test -- tests/reasoning-content-contract.test.js tests/reasoning-engine-rewards.test.js tests/reasoning-production-smoke.test.js tests/reasoning-subject-registry.test.js tests/hero-reasoning-integration.test.js tests/hero-providers.test.js tests/hero-launch-adapters.test.js tests/hero-eligibility.test.js tests/worker-subject-runtime.test.js tests/worker-reading-runtime.test.js tests/reading-subject-registry.test.js tests/main-runtime.test.js tests/react-subject-contract.test.js tests/ui-visual-journey-ready-subjects.test.js tests/ui-subject-visual-adapter-contract.test.js tests/hero-pool-registry.test.js tests/subject-contract.test.js` — passed, 171 tests after review fixes.
- `npm test` — passed, 109250 tests, 0 failures, 12 skipped after review fixes and rebase onto the latest `origin/main`.
- `npm run build` — passed after review fixes.
- `npm run check` — passed after review fixes.
- `npm test -- tests/worker-subject-runtime.test.js tests/worker-punctuation-runtime.test.js tests/reasoning-engine-rewards.test.js tests/reasoning-production-smoke.test.js` — passed after the startup fix, 193 tests.
- `npm test` — passed after the startup fix, 109251 tests, 0 failures, 12 skipped.
- `npm run build` — passed after the startup fix.
- `npm run check` — passed after the startup fix and latest-main rebase.
- `git push origin HEAD:main` pre-push `npm test` for the runtime push — passed, 109266 tests, 0 failures, 12 skipped.
- `git push origin HEAD:main` pre-push for the evidence/report push — docs-only hook path, tests skipped because the commit only changed documentation and evidence files.
- `npm run deploy` — passed, Cloudflare version `f639eadf-2573-4321-94ef-6ca5ecee8368`, Worker startup time `810 ms`, production bundle audit passed.
- `node ./scripts/reasoning-production-smoke.mjs --origin https://ks2.eugnel.uk --out "docs/plans/james/hotfixes/5. reasoning-subject-live-package/validation/production/reasoning-production-smoke-2026-05-11.json"` — passed.
- `node ./scripts/reasoning-production-ui-smoke.mjs --origin https://ks2.eugnel.uk --out "docs/plans/james/hotfixes/5. reasoning-subject-live-package/validation/production/reasoning-production-ui-smoke-2026-05-11.json" --screenshot-dir "docs/plans/james/hotfixes/5. reasoning-subject-live-package/validation/production/screenshots"` — passed.

Live evidence:

- `validation/production/reasoning-production-smoke-2026-05-11.json`
- `validation/production/reasoning-production-ui-smoke-2026-05-11.json`
- `validation/production/deploy-final-2026-05-11.log`
- `validation/production/screenshots/reasoning-setup-1280x800.png`
- `validation/production/screenshots/reasoning-session-1280x800.png`
- `validation/production/screenshots/reasoning-setup-390x844.png`

Local evidence logs:

- `validation/local/targeted-tests-review-fixes-2026-05-11.log`
- `validation/local/npm-test-review-fixes-2026-05-11.log`
- `validation/local/build-review-fixes-2026-05-11.log`
- `validation/local/check-review-fixes-2026-05-11.log`
- `validation/local/targeted-tests-startup-fix-2026-05-11.log`
- `validation/local/npm-test-startup-fix-2026-05-11.log`
- `validation/local/build-startup-fix-2026-05-11.log`
- `validation/local/check-startup-fix-2026-05-11.log`

The earlier "Not certified here" section describes the original lean package only. The repository integration certification above is the live production certification for the completed repo work.
