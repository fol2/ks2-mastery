# Arithmetic 05131531 validation summary

## Source

Reviewed ZIP: `ks2-mastery-lean-05131531.zip`

Reviewed ZIP SHA-256: `e1f6c8a068734e7a0faf1d2f450b9f3d9df57532872bac5ec8b849faa3005298`

Patch SHA-256: `86de21f2010d0584a58dea6edef191cfbd6e86600729bba6664ad4f92145a771`

## Patch application

Current patch dry-run against `origin/main` (`ec5bc1f0`): passed.

Current patch apply against `origin/main` (`ec5bc1f0`): passed.

Evidence:

```text
validation/patch-dry-run.log
validation/patch-apply.log
```

## Syntax checks

Passed:

```text
node --check shared/arithmetic/content.js
node --check tests/worker-arithmetic-runtime.test.js
node --check scripts/build-bundles.mjs
node --check worker/src/subjects/arithmetic/engine.js
node --check worker/src/subjects/arithmetic/commands.js
node --check src/subjects/arithmetic/command-actions.js
```

## Targeted tests

Passed:

```text
node --test tests/worker-arithmetic-runtime.test.js
18/18 tests passed
```

Evidence:

```text
validation/worker-arithmetic-runtime-test.log
```

## Custom audit before patch

135,000 generated cases checked.

Findings before patch:

```text
malformedCommaAccepts: 25,540
negDenAccepts: 22,633
formalCommaVisuals: 16,435
correctFails: 0
binaryArtifacts: 0
```

## Custom audit after patch

Current rebased worktree audit:

```text
templates: 30
rewardUnits: 90
generated cases checked: 135,000
unique stem/visual combinations: 82,886
correct-answer self-mark failures: 0
malformed comma acceptances: 0
valid comma rejections: 0
negative-denominator fraction acceptances: 0
formal visual comma findings: 0
binary decimal artefacts: 0
order-of-operations whole/non-negative failures: 0
division zero-remainder valid acceptances: 9,000
zero-remainder valid forms: 1,234 r 0; 1,234 rem 0; 1,234 remainder 0
zero-remainder malformed forms rejected: 12,34 r 0; 12,34 rem 0; 12,34 remainder 0
```

Evidence:

```text
validation/arithmetic-audit-current.json
```

## Full repository gates

Passed on the rebased worktree at `origin/main` (`ec5bc1f0`) with Node `v22.15.1`:

```text
npm test
tests: 111,530
pass: 111,518
fail: 0
skipped: 12
duration_ms: 153,578.3145
```

```text
npm run check
Wrangler deploy dry-run: passed
Client bundle audit: passed
Public files: 805
Chunks scanned: 6
Main bundle gzip: 205,514 / 232,000 bytes
Dry-run upload: 23,179.83 KiB / gzip 2,201.62 KiB
```

Evidence:

```text
validation/npm-test-2026-05-13.log
validation/npm-run-check-2026-05-13.log
```

The `scripts/build-bundles.mjs` lock is included in this package as release-gate stabilisation. It prevents concurrent build-facing tests under the default Node test runner from racing the public build mirror or another bundle generation process.

## Production deployment

Deployed from commit `88556d57e0db564f7d08cf0ac6813fe0f28e0ef1`.

```text
npm run deploy
Cloudflare Worker version: 05a91f8c-17ec-4cb5-8878-173269be80ab
Production bundle audit: passed for https://ks2.eugnel.uk/
Security-header checks: 5/5
Cache-split checks: 15/15
```

Live Arithmetic smoke against `https://ks2.eugnel.uk`:

```text
ok: true
templateCount: 30
rewardUnitCount: 90
delayedFeedbackBeforeFinish: true
stale write changed: false
stale write revisionUnchanged: true
finishedAt: 2026-05-13T15:58:40.936Z
```

Evidence:

```text
validation/production-deploy-2026-05-13.log
validation/arithmetic-production-smoke-2026-05-13-rerun.log
validation/arithmetic-production-smoke-2026-05-13.json
```

## Historical lean-ZIP limit

The original lean-ZIP review environment did not include `node_modules`, so `tests/arithmetic-placeholder-boundary.test.js` could not run there because `react` was absent. That limitation is retained in `validation/dependency-limit-react-placeholder-boundary.log` as source-context history only. The final release gate above ran in the installed repository worktree with Node `v22.15.1`.
