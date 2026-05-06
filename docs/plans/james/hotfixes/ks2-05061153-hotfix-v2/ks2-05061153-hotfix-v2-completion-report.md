# KS2-05061153 Hotfix V2 Completion Report

## Scope

This report closes the Reading clock determinism hotfix package in `docs/plans/james/hotfixes/ks2-05061153-hotfix-v2`.

The runtime change threads the command clock through Reading due-status projections so learner stats, analytics and review-queue filtering are derived from the same command timestamp as the mutation being applied. The current repository already contained the runtime implementation; this completion pass added the missing regression coverage, rebased the contract package artefacts to the current `main`, fixed the production smoke harness assertion, and re-certified the deployed production flow.

## Changed Artefacts

- `worker/src/subjects/reading/engine.js`: Reading runtime uses `nowValue` through `nodeStatus`, `questionWeakness`, weighted passage selection, question selection, `buildStats`, `buildAnalytics`, and the command `apply()` flow.
- `tests/worker-reading-runtime.test.js`: adds the `clock-regression` coverage that proves a future `dueAt` item is not marked due when the injected command clock is earlier than the due timestamp.
- `scripts/reading-production-smoke.mjs`: validates immediate Reading answers by `score === maxScore`, matching the public feedback contract used by the smoke evidence while still failing non-full-mark answers.
- `docs/plans/james/hotfixes/ks2-05061153-hotfix-v2/reading-clock-hotfix-v2.patch`: rebased to the current applied workspace as the regression-test and smoke-harness patch.
- `docs/plans/james/hotfixes/ks2-05061153-hotfix-v2/sha256-05061153-v2.txt`: refreshed after the package rebase.
- `docs/plans/james/hotfixes/ks2-05061153-hotfix-v2/reading-clock-hotfix-v2-production-smoke.json`: production smoke evidence from `https://ks2.eugnel.uk`.

## Verification Evidence

- `node --check worker/src/subjects/reading/engine.js`: passed.
- `node --check tests/worker-reading-runtime.test.js`: passed.
- `node --check scripts/reading-production-smoke.mjs`: passed.
- `node --test tests/worker-reading-runtime.test.js tests/reading-content-contract.test.js tests/reading-subject-registry.test.js`: passed, `25 pass / 0 fail`.
- `git diff --check`: passed.
- `git apply --reverse --check docs/plans/james/hotfixes/ks2-05061153-hotfix-v2/reading-clock-hotfix-v2.patch`: passed.
- `npm test`: passed, `109145 pass / 0 fail / 12 skipped`.
- `npm run check`: passed Wrangler dry-run, public build assertion, and client bundle audit.
- `npm run deploy`: passed; final deployed Worker version `d143fe9e-2c98-438c-91e4-accdc450f95b`.
- `npm run smoke:production:reading -- --smoke-type reading-clock-hotfix-v2-production --out docs/plans/james/hotfixes/ks2-05061153-hotfix-v2/reading-clock-hotfix-v2-production-smoke.json`: passed against `https://ks2.eugnel.uk`.

## Production Smoke Summary

- Environment: `production`.
- Origin: `https://ks2.eugnel.uk`.
- Content release: `reading-poc-promoted-2026-05-05`.
- Content version: `2`.
- Immediate round: `rg_q2`, `rain_gardeners`, `score 1 / maxScore 1`.
- Delayed paper: `paper_i`, `26` questions, `maxScore 50`, stale error cleared.
- Evidence file: `docs/plans/james/hotfixes/ks2-05061153-hotfix-v2/reading-clock-hotfix-v2-production-smoke.json`.

## Independent Review

- Code review: GREEN from reviewer agent `019dfede-4090-72a2-8316-723fceba4368` after the final smoke-harness numeric guards were added.
- Contract audit: GREEN from auditor agent `019dfede-40e5-79f1-9d6a-be56e320d231` after the completion report, production smoke evidence, patch rebase and hash manifest refresh.

## Known Operational Notes

- On this Windows environment, sandboxed Node test and Wrangler runs fail with `spawn EPERM`; the release gates were re-run through the approved elevated path.
- `npm test` and `npm run check` regenerate unrelated admin and Grammar report outputs; those unrelated report drifts were restored and are not part of this hotfix package.
