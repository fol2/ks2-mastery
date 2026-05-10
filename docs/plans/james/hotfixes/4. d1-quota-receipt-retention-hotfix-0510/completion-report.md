# D1 quota receipt-retention hotfix completion report

Date: 2026-05-10
Production URL: `https://ks2.eugnel.uk`
Runtime commit: `fe819a44e653347ef91d6daee3908db3d6e5868f`
Cloudflare Worker version: `8cd79ced-aa8a-4dcb-ac9e-7c4a868da505`

## Status

Production is restored and deployed. The 503 / D1 failure was caused by remote D1 reaching its quota, not by legitimate two-person usage volume.

## Root cause

`mutation_receipts.response_json` retained full command response payloads for 30 days. Subject commands include large read-model payloads, so the receipts table grew to the Cloudflare D1 quota even with very small real-user traffic.

Initial production evidence:

- D1 `size_after`: `499,998,720` bytes.
- `mutation_receipts`: `25,696` rows, `322,695,011` response bytes.
- Real-account receipts: `25,501` rows, `321,606,965` response bytes.
- Demo receipts: `195` rows, `1,088,046` response bytes.

## Remediation

- Took a remote D1 backup before cleanup:
  `backups/d1/ks2-mastery-db-remote-2026-05-10T16-28-55-745Z.sql`
  (`470,721,488` bytes).
- Removed stale non-admin `mutation_receipts` rows older than 24 hours in bounded batches, preserving `admin.*` audit receipts.
- Changed non-admin mutation receipt retention from 30 days to 24 hours.
- Preserved the 365-day `admin.*` receipt audit retention.
- Added deployment-path hardening so concurrent public builds do not delete each other's temporary `dist/public` output.
- Fixed the pre-push hook to remove Git hook environment variables before running `npm test`; this prevents nested Git provenance tests from being misdirected by `GIT_DIR`.

Cleanup batch evidence:

| Batch | Rows deleted | D1 `size_after` bytes |
| --- | ---: | ---: |
| 1 | 5,000 | 363,520,000 |
| 2 | 5,000 | 320,675,840 |
| 3 | 5,000 | 235,687,936 |
| 4 | 5,000 | 127,094,784 |
| 5 | 3,929 | 46,555,136 |
| 6 | 0 | 46,456,832 |
| Final post-deploy sweep | 57 | 44,974,080 |
| Auditor follow-up sweep | 3 | 44,929,024 |

Final production D1 evidence:

- `mutation_receipts`: `1,722` rows, `23,434,344` response bytes.
- D1 `size_after`: `44,929,024` bytes.
- Non-admin receipts older than 24 hours: `0` rows, `0` response bytes.
- Evidence refreshed at `2026-05-10T17:02:04.538Z`.

## Verification

- `node --test tests/worker-cron-retention-sweep.test.js tests/worker-cron-trigger-reconcile.test.js tests/build-public.test.js` passed: 17 tests, 0 failures.
- `node --test tests/pre-push-hook.test.js` passed: 16 tests, 0 failures.
- `node --test tests/verify-capacity-evidence-metrics.test.js tests/verify-capacity-evidence-schema.test.js` passed under polluted Git hook env simulation: 50 tests, 0 failures.
- `npm test` passed before push: 109,196 tests, 0 failures.
- Pre-push `npm test` passed during `git push origin HEAD:main`: 109,197 tests, 0 failures.
- `npm run check` passed.
- `npm run deploy` passed.
- Production bundle audit passed for `https://ks2.eugnel.uk/`: 1 HTML-referenced bundle, 6 chunks scanned transitively, 19 direct paths, matrix demo check ok, 5/5 security-header checks, 15/15 cache-split checks.
- Direct production GET `https://ks2.eugnel.uk/` returned HTTP 200.
- Chrome was opened to `https://ks2.eugnel.uk`; Cloudflare tail captured Chrome 147 requests returning HTTP 200 for the live app bundle.

## Independent review

Independent reviewer close-out:

- Code reviewer: GREEN. Zero blockers/advisories. Reviewer independently ran `node --test tests/worker-cron-retention-sweep.test.js tests/worker-cron-trigger-reconcile.test.js tests/pre-push-hook.test.js`, parsed the evidence JSON, and checked `https://ks2.eugnel.uk/` returned HTTP 200.
- Contract auditor: initial NOT GREEN on report/push/final D1 freshness/workspace cleanliness. All blockers were addressed: report and evidence were refreshed, stale non-admin receipts were swept to zero, generated-file status was restored, and this hotfix folder is included for commit/push.
