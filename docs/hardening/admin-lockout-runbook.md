# Admin Lockout Recovery Runbook

**Scope:** Phase D / U15 ships auth-boundary enforcement for `ops_status`.
The happy path is protected by two application-layer guards in
`updateAccountOpsMetadata` (see `worker/src/repository.js`):

1. **Self-suspend guard** — an admin cannot change their own
   `ops_status` away from `active`.
2. **Last-active-admin guard** — when the target is an admin and the
   incoming status is non-active, the repository counts other active
   admins across `adult_accounts` × `account_ops_metadata`. If zero
   remain, the repository rejects with `409 last_admin_locked_out`.

Both guards are defence-in-depth. A determined concurrent race (two
admins mutually suspending each other at the same moment) can still
leave the system in a state where every admin has `ops_status ≠ 'active'`
— at which point nobody can sign in to the admin hub to fix it. This
runbook documents the emergency D1-console path to recover.

## Detection

You will see the admin-lockout state when:

- Every admin attempting to sign in receives the
  `/?auth=account_suspended` landing page (see `src/main.js` error-banner
  router, code `account_suspended`), OR
- Every admin fetch receives 401 `session_invalidated` immediately after
  sign-in (because `status_revision` bumped while their session was
  open), AND
- The Cloudflare D1 console query
  `SELECT COUNT(*) FROM adult_accounts a LEFT JOIN account_ops_metadata m ON m.account_id = a.id WHERE a.platform_role = 'admin' AND COALESCE(m.ops_status, 'active') = 'active'`
  returns **0**.

## Emergency recovery

**Prerequisites:**

- `wrangler` CLI configured with access to the `ks2-platform-v2-worker`
  D1 database (see `scripts/wrangler-oauth.mjs` for the OAuth pivot used
  by `npm run check` and deploy).
- A senior engineer with operator-on-call shift authority.

**Step 1 — identify a recovery target.** Pick one admin account to
re-activate. Prefer the most recently created admin whose credentials
you control:

```sh
wrangler d1 execute ks2-platform-v2-worker-db \
  --command "SELECT a.id, a.email, a.platform_role, m.ops_status, m.row_version, m.status_revision FROM adult_accounts a LEFT JOIN account_ops_metadata m ON m.account_id = a.id WHERE a.platform_role = 'admin' ORDER BY a.created_at DESC"
```

Record the target's `id`, current `row_version`, and `status_revision`.

**Step 2 — reset the admin to `active` via a direct UPDATE.** This
bypasses the application-layer guards. It also bumps `row_version` and
`status_revision` so any cached sessions are invalidated on next request:

```sh
wrangler d1 execute ks2-platform-v2-worker-db \
  --command "UPDATE account_ops_metadata SET ops_status = 'active', row_version = row_version + 1, status_revision = status_revision + 1, updated_at = (cast(strftime('%s','now') as integer) * 1000), updated_by_account_id = '<your-operator-id>' WHERE account_id = '<target-admin-id>'"
```

Substitute `<your-operator-id>` with your account id (for the audit
trail) and `<target-admin-id>` with the chosen admin.

**Step 3 — verify.** The target admin should now pass
`requireActiveAccount` on next request. Sign in as that admin and use
the admin hub UI to restore `ops_status` for any other admins who were
accidentally locked out:

```sh
# Optional: sweep stale sessions so the target must re-auth cleanly.
wrangler d1 execute ks2-platform-v2-worker-db \
  --command "DELETE FROM account_sessions WHERE account_id = '<target-admin-id>'"
```

**Step 4 — post-mortem.** Capture:

- The `updated_at` timestamps of the two concurrent mutations that drove
  the race.
- The mutation_receipt rows for both (`scope_type = 'account'`,
  `scope_id = <admin-id>`).
- The `admin_kpi_metrics` values for `admin_account_ops_updates` before
  and after.

File a post-mortem in `docs/hardening/` with the reconstructed
timeline. If the race is reproducible, consider tightening the
last-admin guard to require at least TWO other active admins (a stricter
invariant) or adding an optimistic two-phase commit across the two
target rows.

## Non-emergency avoidance

- The admin hub UI (Phase D / U15) now requires the operator to type
  the last 6 chars of the target account id before submitting any
  non-active `ops_status` — this removes the accidental-click failure
  mode.
- The Phase A admin-refresh-error router renders the new
  `self_suspend_forbidden` and `last_admin_locked_out` banners so the UX
  is clear when the guard fires.
- The Phase C mutation-receipt audit trail (`mutation_receipts` table)
  captures every `ops_status` transition with actor + target + before /
  after state — use the admin ops activity panel to spot suspicious
  patterns before they converge on lockout.

## Ownership

Operator on-call owns this runbook. The application-layer guards and
the runbook are expected to converge — if the runbook fires, a guard
missed, and the next iteration should tighten it.
