# Admin-ops production smoke: setup runbook

**Script:** `scripts/admin-ops-production-smoke.mjs`
**Harness:** `tests/admin-ops-production-smoke.test.js`
**Opt-in flag:** `KS2_PRODUCTION_SMOKE=1` (live run)
**Composition:** wired into `npm run smoke:production:admin-ops`.

## Required env vars

- `KS2_SMOKE_ACCOUNT_EMAIL` — smoke service account email.
- `KS2_SMOKE_ACCOUNT_PASSWORD` — smoke service account password.
- `KS2_SMOKE_BASE_URL` (optional; default `https://ks2.eugnel.uk`).
- `KS2_SMOKE_TIMEOUT_MS` (optional; default 15000).

## Provisioning the smoke account

1. Seed one `adult_accounts` row with `account_type = 'real'` and `platform_role = 'admin'`.
2. Seed the matching `account_ops_metadata` row with `internal_notes = 'smoke-test-account'` so real admin-activity dashboards can filter the row out.
3. Register an email+password credential against that account (the smoke run authenticates via `/api/auth/login`).
4. Store the credentials as GitHub Actions secrets `KS2_SMOKE_ACCOUNT_EMAIL` + `KS2_SMOKE_ACCOUNT_PASSWORD`.

Rotate the password every 30 days (`npm run ops:rotate-smoke-credentials` is tracked as a follow-up — manual rotation for now).

## Credential blast radius

The smoke account is **not a scoped smoke role**. It is a full `platform_role = 'admin'` account, so the blast radius of a credential leak is the same as a human admin credential leak until the password is rotated. Treat the GitHub Actions secrets with the same care as production database credentials.

- **Attack surface on compromise:** full admin-hub read (KPIs, activity stream, error events, account metadata) plus full account-role management (promote / demote / revoke). A compromised runner can escalate any existing account to admin, disable any existing admin, or read every audit-relevant attribute.
- **Rotation cadence:** rotate the password every 30 days, and rotate immediately on any GitHub Actions runner compromise signal (workflow run with unexpected `actor`, unknown step in the published action log, or a Dependabot-style PR that modifies the smoke workflow itself).
- **Filtering from real metrics:**
  - `account_ops_metadata.internal_notes = 'smoke-test-account'` is filtered out of admin-activity aggregates.
  - Every mutation carries a `smoke-<iso-date>-<sequence>-<uuid8>` `requestId` prefix, grep-friendly in Workers logs and in the admin activity panel.
- **Distinct from human admin credentials:** never share the smoke password with a human operator — human admins authenticate through the social-login flow, not through `/api/auth/login` with this email. This keeps the attribution logs unambiguous.
- **Planned follow-up:** a scoped `platform_role = 'smoke'` role with read-only admin-hub access plus exactly the endpoints the smoke script hits is tracked as a P1.5 follow-up. Until that lands, treat the smoke credentials as admin-equivalent and rotate aggressively.

## What the smoke exercises

### Core steps (1-7) — abort on first failure

1. `POST /api/auth/login` — obtain cookie.
2. `GET /api/hubs/admin` — envelope carries `adminHub.{dashboardKpis, opsActivityStream, errorLogSummary, accountOpsMetadata}` (matches `worker/src/repository.js::readAdminHub`).
3. Four narrow refresh routes (`/api/admin/ops/{kpi,activity,error-events,accounts-metadata}`).
4. `PUT /api/admin/accounts/:id/ops-metadata` — no-op `plan_label` stamp on the smoke account only (pre-run canary refuses a `smoke-`-prefixed label; see State drift recovery below).
5. `PUT /api/admin/accounts/:id/ops-metadata` — inverse restore wrapped in try/finally with one retry before exiting with `EXIT_STATE_DRIFT`.
6. `POST /api/ops/error-event` — synthetic error tagged `release: '0000000'` (7-char hex, passes Phase E's `^[a-f0-9]{6,40}$` gate).
7. `PUT /api/admin/ops/error-events/:id/status` — investigating → open transition.

### P3 panel steps (8-14) — continue on failure

8. `GET /api/admin/debug-bundle?account_id=<smoke-id>&time_from=<24h-ago>&time_to=<now>` — Debug Bundle generation. Verifies the 7 expected section keys (`accountSummary`, `recentErrors`, `errorOccurrences`, `recentDenials`, `recentMutations`, `linkedLearners`, `capacityState`).
9. `GET /api/admin/ops/request-denials?limit=5` — denial log read. Empty array is valid.
10. `GET /api/admin/accounts/search?q=<smoke-email>&limit=5` — account search. Verifies the smoke account appears in results.
11. `GET /api/admin/accounts/<smoke-id>/detail` — account detail. Verifies section keys (`account`, `learners`, `recentErrors`, `recentDenials`, `recentMutations`, `opsMetadata`).
12. `GET /api/admin/ops/content-overview` — content overview narrow panel.
13. `GET /api/admin/marketing/messages` — marketing messages list.
14. `POST /api/admin/marketing/messages` + `PUT /api/admin/marketing/messages/:id` — marketing write-path round-trip. Creates an `audience: 'internal'` draft then transitions to `archived`. If create succeeds but archive fails, exits with `EXIT_STATE_DRIFT` (code `3`).

Every mutation carries a `smoke-<iso-date>-<sequence>-<uuid8>` requestId for idempotency + telemetry filtering. The trailing 8-char UUID slice prevents receipt-cache collisions between two same-day runs.

## State drift recovery

If a run exits with `EXIT_STATE_DRIFT` (code `3`), the smoke account's `plan_label` is still stamped with `smoke-<iso>`. Subsequent runs will refuse to start via the `SMOKE_ACCOUNT_DIRTY` pre-run canary. To unblock:

1. Open the admin hub as a human admin.
2. Locate the smoke account in the accounts-metadata panel.
3. Reset `plan_label` to a non-`smoke-`-prefixed value (the pre-run-drift value if known; `baseline` is a reasonable default).
4. Re-run the smoke job.

The `EXIT_STATE_DRIFT` envelope emits `lastKnownGoodPlanLabel` (the value the script tried to restore) so recovery does not require manual database archaeology.

## Manual run

```
KS2_SMOKE_ACCOUNT_EMAIL=... KS2_SMOKE_ACCOUNT_PASSWORD=... \
  npm run smoke:production:admin-ops
```

Exit codes: `0` all green, `1` step failure (correlation id emitted on stdout), `2` usage error (missing env or `SMOKE_ACCOUNT_DIRTY`), `3` state drift (`STATE_DRIFT_DETECTED`).

## Env var reference

Every env var consumed by the public ops-error ingest or the smoke runner is documented below. Each row gives the key, its default, when to change it, and the risk of misconfiguration.

### Worker-side rate limits (read from `env` inside the Worker runtime)

| Key | Default | When to change | Misconfig risk |
| --- | --- | --- | --- |
| `OPS_ERROR_FRESH_INSERT_LIMIT` | `10` (fresh inserts per hour per subject) | Raise during a controlled load test that needs more than 10 distinct fingerprints from one `/64`. Lower below 10 only in an ongoing abuse window. | Too high lets an attacker rotating `first_frame` insert garbage rows faster. Too low causes legitimate post-release crash loops to drop rows and undercount. |
| `OPS_ERROR_GLOBAL_LIMIT` | `6000` (events per 10-minute window, route-wide) | Raise immediately before an announced large release where a genuine crash loop is expected. Drop it if the crash-loop pattern shows up on an unannounced change. Monitor `ops_error_events.global_budget_exhausted.{v4,v6_64,unknown}` counters while tuning. | Too low starves legitimate post-release errors. Too high lets a distributed attack across many `/64`s saturate the worker. |
| `OPS_ERROR_AUTO_REOPEN_LIMIT` | `10` (Phase E auto-reopens per hour per subject) | Raise only during a controlled load test that deliberately replays resolved fingerprints from one `/64`. Drop it if the `ops_error_events.auto_reopen_throttled` KPI shows abuse without a legitimate release cause. | Too high lets an attacker force unlimited resolved→open flips via dedup-replay (the dedup path skips `fresh_insert` since `wouldBeDedup === true`). Too low flags normal post-release auto-reopens as suspicious. |
| `TRUST_XFF` | **unset** (never default-on in production) | Set to `"1"` only in dev or staging behind a reverse proxy that populates `X-Forwarded-For`. The helper in `worker/src/rate-limit.js::envTrustsXForwardedFor` ignores the flag when `ENVIRONMENT=production` and emits a `rate_limit.trust_xff_ignored_in_production` Workers log so the operator sees the foot-gun caught. | Setting `TRUST_XFF=1` on a production Worker would let an attacker spoof the rate-limit subject via `X-Forwarded-For` and either rotate through fresh buckets or collide with a victim's bucket. The production guard makes the misconfiguration visible but harmless. |

### Smoke runner (read from `process.env`)

| Key | Default | When to change | Misconfig risk |
| --- | --- | --- | --- |
| `KS2_SMOKE_ACCOUNT_EMAIL` | required | Rotation or a new smoke account. | Missing → `EXIT_USAGE`. Wrong value → login step fails with 401. |
| `KS2_SMOKE_ACCOUNT_PASSWORD` | required | Password rotation every 30 days, or immediately on runner compromise. | Missing → `EXIT_USAGE`. Wrong value → login step fails with 401. |
| `KS2_SMOKE_BASE_URL` | `https://ks2.eugnel.uk` | Staging smoke run, or a dry run against a dev worker. HTTPS is required — HTTP URLs are rejected at startup. | Wrong host runs the smoke against the wrong environment. HTTP URL → `EXIT_USAGE`. |
| `KS2_PRODUCTION_SMOKE` | unset | Set to `1` to opt `tests/admin-ops-production-smoke.test.js` into a live run against the configured base URL. | Accidentally set in CI without the other env vars → `EXIT_USAGE`. |
| `KS2_SMOKE_TIMEOUT_MS` | `15000` | Lower on a fast local network, raise if the worker is responding slowly under load. | Too low → spurious AbortError failures; too high → CI minutes consumed on a hung request. |
