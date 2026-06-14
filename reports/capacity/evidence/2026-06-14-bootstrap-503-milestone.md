# Bootstrap 503 Stabilisation Milestone

Date: 2026-06-14

## Scope

This milestone records the targeted production fix and live CDP evidence for the `/api/bootstrap` 503 burst previously seen on a long-history account. It is not a 30 distinct-user classroom certification row and must not be used to promote the formal capacity tier.

## Deployed runtime

- Branch: `codex/cdp-e2e-stress-20260613`
- Runtime commit: `97187d0e5c1f51c82b839818485d4384baa483bd`
- Production build reported by `/api/version`: `97187d0e`
- Worker version deployed during the fix: `cf0df872-5919-4a97-aaed-c5faa7983141`

## Fix

Warm public bootstrap POST requests with `lastKnownRevision` now use the in-flight public bootstrap coalescing path. The in-flight key includes the revision hash so concurrent refreshes for the same account and revision can share the same not-modified probe without returning stale data across revisions.

The not-modified response is also stamped with the bounded public bootstrap capacity metadata so client and operator evidence can distinguish the warm path from a full selected-learner bootstrap.

## Verification before deployment

- `node --check worker\src\app.js` passed.
- `git diff --check` passed.
- `node --test tests\worker-bootstrap-v2.test.js` passed, 33/33.
- `npm run check` passed.
- `npm run deploy` completed and the bundled production audit passed.

Full `npm test` was attempted. It reported no assertion failure in the changed area, but the Windows Node test runner produced file-level process crashes in unrelated React suites. The same files passed when rerun standalone, so this milestone treats that as a host runner flake rather than an application regression.

## Production CDP evidence

Target:

- Origin: `https://ks2.eugnel.uk`
- Browser context: logged-in production session
- Account: Nelson's selected learner on account `adult-d9BHpWh3iAL4b5qB`
- Learner: `86a6c60f-e1ef-4985-954d-95ab13349c6f`
- Revision hash: `80839f1ac711fcf17bca357e13ac512d`

Live checks:

| Scenario | Result | Notes |
| --- | --- | --- |
| Full prime `GET /api/bootstrap` | 200 | About 75 KB response, browser wall time about 2.3 s |
| 30 concurrent full bootstrap requests | 30/30 HTTP 200, 0 HTTP 503 | Browser P95 about 3.28 s; this remains a performance risk |
| 30 concurrent warm not-modified POST requests | 30/30 HTTP 200, 0 HTTP 503, 30/30 `notModified` | 495-496 byte responses |
| Warm not-modified P95 | Browser about 690 ms, server about 577 ms | D1 range: 2-5 queries, 2-17 rows read |

## Regression status

No regression was detected in the verified scope:

- production serves build `97187d0e`
- `/api/bootstrap` returns 200 on full and warm paths
- the warm path returns compact not-modified responses
- 30 same-account concurrent warm requests returned zero 503s
- deployment production audit passed

## Known follow-up risks

The milestone is deliberately narrow. The remaining performance work is still required:

- full selected-learner bootstrap is still too slow for long-history accounts, with live browser wall time above two seconds and 30 concurrent full-bootstrap P95 above three seconds
- Arithmetic and Reasoning command paths still need a focused live stress pass because prior symptoms were not limited to bootstrap
- the next certification target should use a 30 distinct-user or equivalent classroom-shaped run rather than only same-account warm refreshes
