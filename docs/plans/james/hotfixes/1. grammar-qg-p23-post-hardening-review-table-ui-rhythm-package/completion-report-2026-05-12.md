# Grammar QG P23 completion report

Date: 2026-05-12

## Summary

The Grammar QG P23 post-hardening package is implemented, reviewed, deployed, and production-smoked.

Runtime-bearing commit: `87864532eea08f3389ee55947e5c98e9e7959071`

Base at implementation close: `d1e7ffb92e7e7a146e7d45c3d1df88a603be50bd`

Cloudflare Worker version from the runtime deploy: `15418daa-b133-4159-93ab-3099b89f106c`

## Product And Contract Closure

- Table-choice Grammar read models now preserve row-specific option labels and accessibility labels without leaking answer or correctness metadata.
- Smart-practice selection now enforces the question-type run ceiling across recent attempts, retry insertion, focus saturation, and broad fallback.
- The latest-miss retry path is deferred when immediate insertion would create an excessive question-type run.
- P19/P21 smart-practice reports now compute the live template inventory and smallest mode-eligible focus pool dynamically.
- The stale raw local logs were intentionally omitted from committed evidence and replaced by a concise verification summary.

## Review Closure

- Code Reviewer: GREEN, no blockers or advisories on the final rebased commit.
- Contract Auditor: GREEN, no blockers or advisories on the final rebased commit.
- James's rule that advisories are blockers was applied throughout the cycle.

## Local Verification

All local gates were rerun after rebasing onto `origin/main` at `d1e7ffb92e7e7a146e7d45c3d1df88a603be50bd`.

| Gate | Result |
|---|---|
| `node --check worker/src/subjects/grammar/selection.js` | Pass |
| `node --check worker/src/subjects/grammar/read-models.js` | Pass |
| `node --check scripts/audit-grammar-qg-p19-smart-practice.mjs` | Pass |
| Focused Grammar node tests | Pass: 36 tests, 34 pass, 2 expected scale-horizon skips, 0 fail |
| `node scripts/audit-grammar-qg-p19-smart-practice.mjs` | Pass: 330 sessions, 0 failures, 0 advisories |
| `npm run verify:grammar-qg-production-release` | Pass: P21 local repetition 54 scenarios, 0 violations, 0 warnings; P21 smart-practice 330 sessions, 0 failures, 0 advisories |
| `npm test` | Pass: 111483 tests, 111471 pass, 12 skipped, 0 fail |
| `npm run check` | Pass: Wrangler OAuth dry-run and client bundle audit, main bundle 204441 / 232000 bytes gzip |
| `git diff --check` | Pass: exit 0; Windows line-ending warnings only |

## Production Verification

| Gate | Result |
|---|---|
| `npm run deploy` | Pass: Worker deployed and production bundle audit passed |
| `npm run smoke:production:grammar` | Pass against `https://ks2.eugnel.uk` |
| `node ./scripts/grammar-production-smoke.mjs --json --evidence-origin post-deploy --out ...` | Pass: JSON evidence recorded |
| Production browser smoke | Pass: demo browser session loaded `https://ks2.eugnel.uk`, Grammar text visible, no console errors, no request failures, no HTTP failures |

## Evidence Files

- `docs/plans/james/hotfixes/1. grammar-qg-p23-post-hardening-review-table-ui-rhythm-package/validation/live-rollout-2026-05-12/verification-summary.md`
- `docs/plans/james/hotfixes/1. grammar-qg-p23-post-hardening-review-table-ui-rhythm-package/validation/live-rollout-2026-05-12/grammar-production-smoke-2026-05-12.json`
- `docs/plans/james/hotfixes/1. grammar-qg-p23-post-hardening-review-table-ui-rhythm-package/validation/live-rollout-2026-05-12/grammar-production-browser-smoke-2026-05-12.json`
- `docs/plans/james/hotfixes/1. grammar-qg-p23-post-hardening-review-table-ui-rhythm-package/validation/live-rollout-2026-05-12/grammar-production-browser-smoke-2026-05-12.png`
- `reports/grammar/grammar-qg-p19-smart-practice-audit.json`
- `reports/grammar/grammar-qg-p19-smart-practice-audit.md`
- `reports/grammar/grammar-qg-p21-local-repetition.json`
- `reports/grammar/grammar-qg-p21-smart-practice-full.json`
- `reports/grammar/grammar-qg-p21-smart-practice-full.md`
- `tests/fixtures/grammar-selection-parity-snapshot.json`

## Release Notes

The pushed runtime commit was deployed and production-smoked before this completion report was added. This report and the evidence artefacts are documentation-only additions; the release closure includes a final redeploy after committing them so the deployed bundle and `origin/main` remain aligned.
