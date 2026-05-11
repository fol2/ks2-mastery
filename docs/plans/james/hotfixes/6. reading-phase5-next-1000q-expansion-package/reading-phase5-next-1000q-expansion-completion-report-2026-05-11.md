# Reading Phase 5 Next-1000 Expansion - Completion Report

## Status

Complete and production-ready.

The Reading Phase 5 expansion package has been applied to the repository, verified locally, deployed to Cloudflare, and smoke-tested on `https://ks2.eugnel.uk`.

## Implemented Contract

- Reading content version is now `5`.
- Final Reading totals are 210 passages, 2072 questions, and 75 strict papers.
- Final genre split is 71 fiction, 71 non-fiction, and 68 poetry passages.
- Final long-passage count is 166.
- Phase 5 contributes 102 passages, 1020 questions, 34 strict papers, and 34 passages per genre.
- Browser-facing metadata remains answer-safe; answer keys remain in the shared/Worker Reading content layer.

## Files Changed

- `shared/reading/content.js`
- `shared/reading/metadata.js`
- `shared/reading/phase5-expansion.js`
- `tests/reading-phase5-next1000-contract.test.js`
- `tests/reading-content-contract.test.js`
- `scripts/audit-reading-content-quality.mjs`
- `scripts/reading-production-smoke.mjs`
- `reports/reading/reading-content-quality-audit.json`
- `docs/plans/james/hotfixes/6. reading-phase5-next-1000q-expansion-package/validation-summary.md`
- `docs/plans/james/hotfixes/6. reading-phase5-next-1000q-expansion-package/validation/source-boundary.md`
- `docs/plans/james/hotfixes/6. reading-phase5-next-1000q-expansion-package/validation/*`

## Scope Expansion

The source package named the content, metadata, expansion, and contract-test files. During independent review, production-readiness blockers required related fixes outside that narrow file list:

- The Reading production smoke runner now asserts exact content version 5 counts and records the expected commit SHA without implying the server independently reported it.
- The Reading content quality audit now catches repeated generated stem shapes after normalising passage-specific substitutions.
- The existing Reading content contract test now pins the version 5 denominator and Phase 5 quality checks.

These were fixing changes tied directly to the contract, not unrelated improvements.

## Local Verification

All evidence is stored in this package folder.

```bash
node --check shared/reading/phase5-expansion.js
npm run audit:reading-content
node --test tests/reading-content-contract.test.js tests/worker-reading-runtime.test.js tests/reading-reward-events.test.js tests/hero-reading-provider.test.js tests/reading-phase5-next1000-contract.test.js
npm test
npm run check
```

Results:

- Focused Reading tests: 36 passed, 0 failed.
- Full `npm test`: 109237 passed, 0 failed, 12 skipped.
- `npm run check`: passed.
- Reading content audit: 0 failures, 0 advisories.

Evidence:

- `validation/production-ready-node-check-phase5-expansion-2026-05-11.log`
- `validation/production-ready-reading-content-quality-audit-2026-05-11.log`
- `validation/production-ready-reading-focused-tests-2026-05-11.log`
- `validation/production-ready-npm-test-2026-05-11.log`
- `validation/production-ready-npm-check-2026-05-11.log`
- `validation/production-ready-reading-summary-2026-05-11.json`

## Deployment

- Implementation commit: `a6dca8dd68aa62c6dc778319f1233caa627ccc10`
- GitHub `main` after implementation push: `a6dca8dd68aa62c6dc778319f1233caa627ccc10`
- Deploy command: `npm run deploy`
- Deploy evidence: `validation/production-ready-npm-deploy-2026-05-11.log`
- Cloudflare version ID: `2de6f127-c763-4aac-b313-e79027511c3c`
- Production origin: `https://ks2.eugnel.uk`

## Production Smoke

Command:

```bash
node scripts/reading-production-smoke.mjs --expected-content-version=5 --commit-sha=a6dca8dd68aa62c6dc778319f1233caa627ccc10 --out=docs/plans/james/hotfixes/6.\ reading-phase5-next-1000q-expansion-package/validation/production/reading-phase5-production-smoke-2026-05-11.json
```

Evidence:

- `validation/production/reading-phase5-production-smoke-2026-05-11.json`

Result:

- `ok: true`
- `origin: https://ks2.eugnel.uk`
- `contentVersion: 5`
- `passageCount: 210`
- `questionCount: 2072`
- `paperCount: 75`
- `longPassageCount: 166`
- `genres: fiction 71, non-fiction 71, poetry 68`
- Immediate Reading answer persisted and scored correctly.
- Strict paper start path passed.
- Stale write guard passed without persisting stale data.

## Independent Review

Independent review was run in two streams:

- Code reviewer: initial blockers on generated stem/scaffold repetition and smoke evidence labelling were fixed; local follow-up returned green for local fixes.
- Contract auditor: initial blockers on evidence/reporting and content quality were fixed; local follow-up returned green for local fixes.
- Final post-deployment code review: green.
- Final post-deployment contract audit: the auditor required checksum and commit-integrity fixes for the final evidence package; those fixes are included here and in `SHA256SUMS.txt`.

Any reviewer advisory was treated as a blocker under this rollout policy.
