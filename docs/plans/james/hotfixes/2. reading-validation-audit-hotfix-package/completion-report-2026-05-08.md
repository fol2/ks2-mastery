# Reading validation audit hotfix completion report

## Scope

Package: `docs/plans/james/hotfixes/2. reading-validation-audit-hotfix-package`

Code commit: `c7716f57c2ed871978bc4d203737f3ca428fdc46`

Production origin: `https://ks2.eugnel.uk`

## Completed changes

- Reading marking now rejects locally contradicted correct phrases, keyword stems, and fuzzy evidence overlaps.
- Keyword groups still accept valid uncontradicted stems split across punctuation, such as `Folded. Slips of paper.`
- Evidence fallback now rejects negation attached to any overlapping evidence token, such as `the house did not change around her`.
- Corrected later evidence remains accepted when separated by a contradiction break, such as `not ... but ...`.
- Reading delayed-feedback controls now use mode-specific labels: `Mark now`, `Mark this section`, and `Mark whole paper`.
- The capacity evidence verifier now uses argv-based `execFileSync` for Git ancestry probes, avoiding the Windows shell timeout seen during the final repository gate.

## Local verification

- `node --test tests/reading-content-contract.test.js tests/worker-reading-runtime.test.js tests/reading-subject-registry.test.js tests/reading-session-interface.test.js`
  - Result: `38/38` pass.
  - Evidence: `validation/logs/repo-reading-targeted-tests-2026-05-08.log`
- `node docs/plans/james/hotfixes/2. reading-validation-audit-hotfix-package/validation/tools/reading-negation-audit.mjs`
  - Result: `0` negated matcher acceptances, `0` negated evaluation risks.
  - Evidence: `validation/audits/repo-reading-negation-audit-2026-05-08.json`
- `npm test`
  - Result: `109174` pass, `0` fail, `12` skipped.
  - Evidence: `validation/logs/repo-npm-test-2026-05-08.log`
- `npm run check`
  - Result: pass.
  - Evidence: `validation/logs/repo-npm-check-2026-05-08.log`
- Pre-push `npm test`
  - Result: `109174` pass, `0` fail, `12` skipped.

## Production deployment

- Command: `npm run deploy`
- First deploy attempt: failed during Cloudflare validation with startup CPU limit error `10021`; no successful Worker version was published.
- Retry command: `npm run deploy`
- Retry result: pass.
- Cloudflare Worker Version ID: `0ae565fd-11e7-467e-9abf-a8f85227bc8b`
- Production bundle audit: pass for `https://ks2.eugnel.uk/`.
- Evidence:
  - `validation/logs/repo-deploy-2026-05-08.log`
  - `validation/logs/repo-deploy-retry-2026-05-08.log`

## Production smoke

- Command: `node scripts/reading-production-smoke.mjs --out "docs/plans/james/hotfixes/2. reading-validation-audit-hotfix-package/validation/production/reading-production-smoke-2026-05-08.json"`
- Result: pass.
- Origin: `https://ks2.eugnel.uk`
- Commit SHA in smoke: `c7716f57c2ed871978bc4d203737f3ca428fdc46`
- Content release: `reading-poc-promoted-2026-05-05`
- Content version: `2`
- Immediate Reading smoke: `greenhouse_window` question `gw_q3`, score `1/1`.
- Delayed strict paper smoke: `paper_i`, `26` questions, max score `50`, strict section-mark rejection cleared before whole-paper marking.
- Finished at: `2026-05-08T16:05:39.832Z`
- Evidence:
  - `validation/production/reading-production-smoke-2026-05-08.json`
  - `validation/logs/reading-production-smoke-2026-05-08.log`

## Independent review

- Code reviewer: GREEN after edge-case fixes for mixed negated keyword stems, negated evidence overlap, punctuation-split keyword stems, stale audit JSON, unrelated report churn, and EOL warnings.
- Contract auditor: GREEN after final review of production evidence, updated docs, completion report, checksum manifest, deploy evidence, and local gate evidence.

## Final sync status

At the time this report was finalised, the code commit had been pushed to `origin/main` and deployed. This evidence package is ready to be pushed as a follow-up documentation/evidence commit.
