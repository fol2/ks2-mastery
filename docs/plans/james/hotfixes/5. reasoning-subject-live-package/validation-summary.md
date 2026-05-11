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
