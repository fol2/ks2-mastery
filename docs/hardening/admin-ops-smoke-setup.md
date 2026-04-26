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

## What the smoke exercises

1. `POST /api/auth/login` — obtain cookie.
2. `GET /api/hubs/admin` — envelope contains kpi, activity, errorEvents, accountsMetadata panels.
3. Four narrow refresh routes (`/api/admin/ops/{kpi,activity,error-events,accounts-metadata}`).
4. `PUT /api/admin/accounts/:id/ops-metadata` — no-op `plan_label` stamp on the smoke account only.
5. `PUT /api/admin/accounts/:id/ops-metadata` — inverse restore so state is unchanged post-run.
6. `POST /api/ops/error-event` — synthetic error from a fake `smoke-release-0000000`.
7. `PUT /api/admin/ops/error-events/:id/status` — investigating → open transition.

Every mutation carries a `smoke-<iso-date>-<sequence>` requestId for idempotency + telemetry filtering.

## Manual run

```
KS2_SMOKE_ACCOUNT_EMAIL=... KS2_SMOKE_ACCOUNT_PASSWORD=... \
  npm run smoke:production:admin-ops
```

Exit codes: `0` all green, `1` step failure (correlation id emitted on stdout), `2` usage error.
