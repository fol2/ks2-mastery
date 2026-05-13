# Arithmetic 2026-05-13 Validation Summary

## Source ZIP

```text
ks2-mastery-lean-05130813.zip
SHA-256: 1c57a140600b2bb36e954c5814d626fac2ef451cf9d8ca733a87fc54b4e46c75
```

The ZIP is a lean review bundle with placeholder assets. It does not include `.git` metadata or installed `node_modules`.

Local runtime observed:

```text
Node.js v18.20.4
ZIP .nvmrc: 22
```

## Patch validation from a fresh extraction

```text
patch -p1 --dry-run: passed
patch -p1: passed
```

Patch dry-run log:

```text
checking file shared/arithmetic/content.js
checking file tests/worker-arithmetic-runtime.test.js
```

Patch apply log:

```text
patching file shared/arithmetic/content.js
patching file tests/worker-arithmetic-runtime.test.js
```

## Syntax checks

All passed:

```text
node --check shared/arithmetic/content.js
node --check tests/worker-arithmetic-runtime.test.js
node --check worker/src/subjects/arithmetic/engine.js
node --check worker/src/subjects/arithmetic/commands.js
node --check src/subjects/arithmetic/command-actions.js
```

## Targeted Worker tests

```text
node --test tests/worker-arithmetic-runtime.test.js
```

Result:

```text
15/15 passed
0 failed
```

## Custom Arithmetic audit

Command:

```bash
node validation/scripts/arithmetic-0513-custom-audit.mjs --per-template=1500
```

The script checks 30 templates across three difficulty bands and 1,500 seeds per band.

### Before patch

```text
templates: 30
cases: 135,000
unique stem/visual combinations: 76,996
correct-answer self-mark failures: 0
bad percent-unit acceptances: 0
explicit percentage-output cases: 1,596
explicit percentage-output acceptances: 1,596
pound-unit acceptances: 0
non-division r0 acceptances: 84,931
division zero-remainder acceptances: 9,000
powers-of-ten binary decimal artefacts: 514
findings recorded: 20
```

### After patch

```text
templates: 30
cases: 135,000
unique stem/visual combinations: 81,984
correct-answer self-mark failures: 0
bad percent-unit acceptances: 0
explicit percentage-output cases: 1,596
explicit percentage-output acceptances: 1,596
pound-unit acceptances: 0
non-division r0 acceptances: 0
division zero-remainder acceptances: 9,000
powers-of-ten binary decimal artefacts: 0
findings recorded: 0
```

## Current full-checkout validation

The package was applied and re-verified in the full repository worktree:

```text
D:\Coding\ks2-mastery\.worktrees\arithmetic-post-review-hardening
branch: codex/arithmetic-post-review-hardening
base: 741c3fba84f7c56e1882f5080ea66745033aabd4
```

Fresh validation evidence:

```text
node --check shared/arithmetic/content.js: passed
node --check tests/worker-arithmetic-runtime.test.js: passed
node --check worker/src/subjects/arithmetic/engine.js: passed
node --check worker/src/subjects/arithmetic/commands.js: passed
node --check src/subjects/arithmetic/command-actions.js: passed
node --test tests/worker-arithmetic-runtime.test.js: 15/15 passed
node --test tests/react-arithmetic-surface.test.js: 1/1 passed
npm run check: passed
npm test: 111,480 passed, 0 failed, 12 skipped
git diff --check: passed
```

Current evidence logs:

```text
validation/logs/current-node-check-shared-arithmetic-content-2026-05-13.log
validation/logs/current-node-check-worker-arithmetic-runtime-test-2026-05-13.log
validation/logs/current-node-check-worker-arithmetic-engine-2026-05-13.log
validation/logs/current-node-check-worker-arithmetic-commands-2026-05-13.log
validation/logs/current-node-check-arithmetic-command-actions-2026-05-13.log
validation/logs/current-worker-arithmetic-runtime-test-2026-05-13.log
validation/logs/current-react-arithmetic-surface-test-2026-05-13.log
validation/logs/current-npm-run-check-2026-05-13.log
validation/logs/current-npm-test-final-summary-2026-05-13.log
validation/logs/current-git-diff-check-2026-05-13.log
```

The post-review custom audit now checks all three accepted zero-remainder forms (`r 0`, `rem 0`, and `remainder 0`) across short and long exact-division templates, and rejects all three forms outside division contexts.

```text
templates: 30
cases: 135,000
unique stem/visual combinations: 81,984
correct-answer self-mark failures: 0
bad percent-unit acceptances: 0
explicit percentage-output cases: 1,596
explicit percentage-output acceptances: 1,596
pound-unit acceptances: 0
non-division r0 acceptances: 0
non-division rem0 acceptances: 0
non-division remainder0 acceptances: 0
division r0 acceptances: 9,000
division rem0 acceptances: 9,000
division remainder0 acceptances: 9,000
powers-of-ten binary decimal artefacts: 0
findings recorded: 0
```

Current audit evidence:

```text
validation/audits/current-custom-audit-2026-05-13.json
```

## Lean ZIP React surface limit

The lean ZIP did not include installed dependencies. The React Arithmetic surface test could not run in this environment because `esbuild` was missing:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'esbuild' imported from tests/react-arithmetic-surface.test.js
```

This was an environment/dependency limitation of the extracted lean bundle, not evidence of a React Arithmetic product failure. The full checkout validation above closes this gap with `node --test tests/react-arithmetic-surface.test.js`.

## Production deployment and smoke

The final patch was committed and pushed to `main`:

```text
commit: 6c623c373e98206c8ab9484709d852c7f4b9054f
branch: codex/arithmetic-post-review-hardening
remote target: origin/main
push result: 741c3fba..6c623c37 HEAD -> main
```

The push hook ran `npm test` before accepting the push:

```text
tests: 111,492
pass: 111,480
fail: 0
skipped: 12
duration_ms: 159805.3128
```

Deployment used the repository package script:

```bash
npm run deploy
```

Result:

```text
Worker: ks2-mastery
Cloudflare version ID: 2396c0ca-db8f-4bf9-bf6e-5e11e85ebe92
Production bundle audit: passed for https://ks2.eugnel.uk/
Security-header checks: 5/5
Cache-split checks: 15/15
```

Live Arithmetic smoke command:

```bash
node scripts/arithmetic-production-smoke.mjs --out="docs/plans/james/hotfixes/6. arithmetic-0513-excellence-package/validation/arithmetic-0513-production-smoke-2026-05-13.json" --smoke-type=arithmetic-0513-excellence-production
```

Result:

```text
ok: true
environment: production
origin: https://ks2.eugnel.uk
contentReleaseId: arithmetic-ks2-worker-v1-2026-05-11
practice smoke: passed
true test mode delayed-marking smoke: passed
stale-write guard smoke: passed
finishedAt: 2026-05-13T08:39:35.773Z
```

Production evidence:

```text
validation/arithmetic-0513-production-smoke-2026-05-13.json
validation/logs/current-npm-run-deploy-2026-05-13.log
```
