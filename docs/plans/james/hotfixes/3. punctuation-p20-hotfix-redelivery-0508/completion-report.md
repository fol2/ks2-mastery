# Punctuation P20 hotfix completion report

Date: 2026-05-08
Production origin: `https://ks2.eugnel.uk`
Hotfix code commit: `ebd3a6029cf2db9594d44a98428a2ba1a982e98e`
Deployed Worker version: `a94835b2-f3b4-41f9-a1b4-e8bf67f64d3d`

## Scope closure

| Requirement | Evidence |
| --- | --- |
| Read and apply the hotfix package in this folder. | Applied the package patch and reconciled the package docs, contract, validation summary, and patch checksum. |
| Remove the P20 fixed-bank duplicate learner surfaces. | `reports/punctuation/punctuation-qg-p20-expansion-audit.json` reports `runtimeItems: 15072`, `uniqueLearnerSurfaces: 15072`, `duplicateSurfaceGroups: 0`, `fixedDuplicateSurfaceGroups: 0`, and `legacyFixedDuplicateSurfaceGroups: 0`. |
| Make stale baseline evidence fail validation. | `scripts/validate-punctuation-qg-p20-expansion-report.mjs` rejects non-zero `legacyFixedDuplicateSurfaceGroups`; `tests/punctuation-qg-p20-expansion-report-validator.test.js` proves the bundled baseline report is rejected. |
| Keep the package self-describing. | `README.md`, `validation-summary.md`, and `contract/punctuation-p20-runtime-surface-uniqueness-hotfix-contract.md` now describe the actual `fx12_parenthesis_001` to `006` replacement side and the corrected patch SHA-256. |
| Preserve production P20 gate behaviour. | `npm run verify:punctuation-qg:p20` passed after fresh evidence regeneration. |
| Deploy and prove production, not only local verification. | `npm run deploy` passed and reported Worker version `a94835b2-f3b4-41f9-a1b4-e8bf67f64d3d`; fresh production smoke is stored at `reports/punctuation/punctuation-qg-p20-production-smoke.json`. |
| Use reviewer-grade closure. | Independent code review found blockers; they were fixed and re-reviewed green. Contract audit required production certification; final re-audit is pending after this report/evidence commit. |

## Verification

| Command | Result |
| --- | --- |
| `node --test tests/punctuation-qg-p20-runtime-surface-uniqueness.test.js` | PASS |
| `node --test tests/punctuation-qg-p20-expansion-report-validator.test.js tests/punctuation-qg-p20-runtime-surface-uniqueness.test.js tests/punctuation-qg-p20-expansion.test.js tests/punctuation-session-ui.test.js tests/punctuation-session-input-hardening.test.js` | PASS |
| `npm run verify:punctuation-qg:p20` | PASS |
| `npm test` | PASS, 109,189 tests, 0 failures, 12 skipped |
| `npm run check` | PASS |
| `npm run deploy` | PASS |
| `node scripts/validate-punctuation-qg-p20-live-evidence.mjs reports/punctuation/punctuation-qg-p20-production-smoke.json` | PASS |

## Production smoke

The fresh production smoke in `reports/punctuation/punctuation-qg-p20-production-smoke.json` was generated on 2026-05-08 at `2026-05-08T18:34:22.445Z`.

Key attestation fields:

| Field | Value |
| --- | --- |
| `ok` | `true` |
| `origin` | `https://ks2.eugnel.uk` |
| `environment` | `production` |
| `releaseId` | `punctuation-qg-p20-15072-2026-05-04` |
| `runtimeItemCount` | `15072` |
| `workerCommitSha` | `ebd3a6029cf2db9594d44a98428a2ba1a982e98e` |
| `workerVersionId` | `a94835b2-f3b4-41f9-a1b4-e8bf67f64d3d` |
| `authenticatedCoverage` | `true` |
| `adminHubCoverage` | `true` |
| Dash acceptance | spaced hyphen, en dash, and em dash all returned `success` |

## Final status

The P20 fixed-bank duplicate surface hotfix is implemented, locally verified, pushed to `origin/main`, deployed to production, and backed by fresh production smoke evidence.
