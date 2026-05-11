# Reading Phase 4 1000+ Question Expansion — Validation Summary

## Result

Prepared a next-stage Reading expansion patch that raises the pool from the current version-3 package to a version-4 package with 1052 questions.

## Counts

Baseline version 3:

- 24 passages
- 212 questions
- 13 papers
- 8 long passages
- Genre split: 9 fiction, 9 non-fiction, 6 poetry

Patched version 4:

- 108 passages
- 1052 questions
- 41 papers
- 64 long passages
- Genre split: 37 fiction, 37 non-fiction, 34 poetry

Delta:

- +84 passages
- +840 questions
- +28 papers
- +56 long passages

## Quality audit

`node scripts/audit-reading-content-quality.mjs --out="docs/plans/james/hotfixes/3. reading-phase4-1000q-expansion-package/validation/production-ready-reading-content-quality-audit-2026-05-11.json"`

Passed:

- Failures: 0
- Advisories: 0
- Duplicate normalised stem groups: 0
- Duplicate model answer groups: 0
- Repeated stem-shape advisories: 0

## Test validation

Original package validation:

`node --test tests/reading-content-contract.test.js tests/worker-reading-runtime.test.js`

Passed:

- Tests: 31
- Failed: 0
- Skipped: 0

Repository validation after integration:

`node --test tests/reading-content-contract.test.js tests/worker-reading-runtime.test.js tests/reading-session-interface.test.js`

Passed:

- Tests: 44
- Failed: 0
- Skipped: 0
- Evidence: `validation/production-ready-reading-targeted-tests-2026-05-11.log`

Full repository gates:

- `npm test`: 109219 passed, 0 failed, 12 skipped. Evidence: `validation/production-ready-npm-test-2026-05-11.log`
- `npm run check`: passed deploy dry-run, public build assertion, and client bundle audit. Evidence: `validation/production-ready-npm-check-2026-05-11.log`

## Patch validation

Fresh v3-baseline apply check passed:

- `git apply --check`: pass
- `git apply`: pass
- `node --check shared/reading/phase4-expansion.js`: pass
- Content summary after apply: version 4, 108 passages, 1052 questions, 41 papers

Current repository reconciliation:

- The source patch was generated against the version-3 baseline and did not apply cleanly to the current repository after later Reading hotfix drift.
- The implemented repository change preserves the current version-3 passage and paper order, appends the deterministic Phase 4 expansion, and keeps browser metadata answer-safe.
- The Reading release ID remains `reading-poc-promoted-2026-05-05` by contract evidence while `READING_CONTENT_VERSION` advances to `4`; this avoids an unrequested reward/mastery namespace reset.
- Dependency-complete `tests/reading-session-interface.test.js` now passes in the repository environment.

## Production status

Production-certified after GitHub `main` deployment by live behaviour on the deployed origin:

- Production origin: `https://ks2.eugnel.uk`
- Smoke evidence: `validation/production/reading-phase4-production-smoke-2026-05-11.json`
- Smoke result: `ok: true`
- Repository head used by the smoke runner: recorded in the smoke evidence as `repositoryHeadSha`
- Production-reported commit SHA: not exposed by the deployed app; the smoke does not claim one
- Content version: 4
- Content summary: 108 passages, 1052 questions, 41 papers, 37 fiction, 37 non-fiction, 34 poetry, 64 long passages
- Immediate-round result: accepted, full score
- Delayed-paper result: `paper_i`, 26 questions, 50 max score, stale section-mark error cleared
- Stale-write guard: stale question save changed no state, revision stayed unchanged, and persisted neither the stale key nor the active key
