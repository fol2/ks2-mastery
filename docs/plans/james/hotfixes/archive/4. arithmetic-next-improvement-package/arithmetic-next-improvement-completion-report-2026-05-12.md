# Arithmetic Next Improvement Completion Report

## Objective

Complete the Arithmetic next improvement contract from `docs/plans/james/hotfixes/4. arithmetic-next-improvement-package` in an isolated worktree, fix contract-related gaps, verify to production standard, deploy to `https://ks2.eugnel.uk`, and provide same-folder evidence.

## Worktree And Scope

Work was completed in `D:\Coding\ks2-mastery\.worktrees\arithmetic-post-review-hardening` on branch `codex/arithmetic-post-review-hardening`.

Final validation was rebased and rerun against:

```text
origin/main: 58ca56f63550fa926a947beb2c73e10c641a5321
```

Product/runtime scope stayed inside the contract files:

```text
shared/arithmetic/content.js
worker/src/subjects/arithmetic/engine.js
src/subjects/arithmetic/components/ArithmeticPracticeSurface.jsx
tests/worker-arithmetic-runtime.test.js
tests/react-arithmetic-surface.test.js
```

The validation helper `scripts/arithmetic-custom-audits.mjs` was changed as validation-only scope so the audit imports the current repository code instead of the original temporary extraction path, and so the audit covers malformed percentage-symbol placements. It does not change product runtime scope. The patch file and validation documents were updated as same-folder evidence artefacts.

## Contract Closure

- Unit-aware numeric marking now rejects `%` and `£` on ordinary numeric answers.
- Explicit percentage-output questions accept a plain number or one trailing `%`.
- Malformed percentage placements such as `%50`, `5%0`, and `50%%` are rejected.
- True Test answer and working fields remount by question key and reload the saved paper entry.
- True Test summaries include the full paper denominator through `questionCount`.
- Arithmetic enrichment expands the contracted pools while retaining 30 templates, 90 reward units, deterministic generation, finite answers, and the 12-question / 14-mark and 36-question / 40-mark paper shapes.

## Evidence Checklist

| Requirement | Evidence |
| --- | --- |
| Clean patch applies to current base | `validation/current-2026-05-12/logs/patch-apply-check-clean-origin-main-2026-05-12.log` |
| Clean patch applies to current index | `validation/current-2026-05-12/logs/patch-apply-check-clean-origin-main-cached-2026-05-12.log` |
| Patched tree can reverse the patch | `validation/current-2026-05-12/logs/patch-reverse-check-2026-05-12.log` |
| Patch SHA recorded | `validation/current-2026-05-12/patch-sha256.txt` |
| Syntax checks | `validation/current-2026-05-12/logs/node-check-*.log` |
| Arithmetic runtime regressions | `validation/current-2026-05-12/logs/worker-arithmetic-runtime-test-2026-05-12.log` |
| Arithmetic React surface regression | `validation/current-2026-05-12/logs/react-arithmetic-surface-test-2026-05-12.log` |
| 45,000-case Arithmetic audit | `validation/current-2026-05-12/audits/arithmetic-custom-audit-2026-05-12.json` |
| Full repository tests | `validation/current-2026-05-12/logs/npm-test-final-rerun-2026-05-12.log` |
| Cloudflare dry-run gate | `validation/current-2026-05-12/logs/npm-run-check-final-2026-05-12.log` |
| Production deployment | `validation/current-2026-05-12/logs/npm-run-deploy-2026-05-12.log` |
| Live Arithmetic smoke | `validation/current-2026-05-12/production-arithmetic-smoke-2026-05-12.json` |

## Final Gate Results

```text
node --check shared/arithmetic/content.js: passed
node --check worker/src/subjects/arithmetic/engine.js: passed
node --check worker/src/subjects/arithmetic/commands.js: passed
node --check src/subjects/arithmetic/command-actions.js: passed
node --test tests/worker-arithmetic-runtime.test.js: passed, 15/15
node --test tests/react-arithmetic-surface.test.js: passed, 1/1
custom Arithmetic audit: passed, findingCount 0
npm test: passed, 111,480 passed / 0 failed / 12 skipped
npm run check: passed
npm run deploy: passed
Arithmetic production smoke: passed, 2026-05-12T17:19:17.796Z
```

Production deployment used `npm run deploy`, which routes Wrangler through `scripts/wrangler-oauth.mjs`. The deployed Worker version was `6cbf20f3-56e9-4f2d-ada0-71eba10a7b39`.

The live smoke JSON records `ok: true`, `deployedUrl: https://ks2.eugnel.uk`, `trueTestMode.questionCount: 12`, `trueTestMode.summaryMaxScore: 14`, `trueTestMode.delayedFeedbackBeforeFinish: true`, and stale-write protection with `changed: false` and `revisionUnchanged: true`.

## Superseded Runs

Earlier failed or pre-fix full-suite logs are retained under `validation/current-2026-05-12/superseded/` for traceability only. They are superseded by targeted reruns and the final authoritative `npm-test-final-rerun-2026-05-12.log`.

## Independent Review Closure

First-pass independent review findings were treated as blockers:

- Code review identified malformed percentage placements that were still accepted on percentage-output questions. The parser, runtime test, audit script, patch, and evidence were updated.
- Contract audit identified missing same-folder closure evidence, unclear superseded logs, missing deployment evidence, and the need to label the validation-helper change as validation-only. This report, the current validation folder, and the validation summary address those findings.

Final independent review re-runs are recorded in `review/arithmetic-next-post-hardening-review.md`. The Code Reviewer and Contract Auditor both returned GREEN on the rebased branch against `origin/main` `58ca56f63550fa926a947beb2c73e10c641a5321`, with no remaining advisory-level blockers.
