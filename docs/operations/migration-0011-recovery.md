# Migration 0011 — recovery runbook

Status: Phase C P1.5 (2026-04-26).

This runbook covers the recovery path for
`worker/migrations/0011_admin_ops_p1_5_hardening.sql` in the event the
migration stops part-way through — e.g. a mid-ALTER deploy failure, a
wrangler crash, or the `d1_migrations` tracker landing out of sync with
the live schema.

The migration is forward-only and additive (nullable columns /
default-zero, `CREATE INDEX IF NOT EXISTS`), but SQLite does not support
`ALTER TABLE ADD COLUMN IF NOT EXISTS`, so a naive re-apply raises
`duplicate column name` on columns that already landed. The procedure
below applies only the missing statements and reconciles the tracker.

## 1. Diagnose

Check whether `d1_migrations` thinks 0011 landed:

```
wrangler d1 execute <db-name> --command "SELECT name, applied_at FROM d1_migrations WHERE name LIKE '0011%';"
```

Three possible outcomes:

- No row: migration was never applied (or was rolled back). Fix path: try
  `wrangler d1 migrations apply <db-name>`. If it fails part-way, follow
  the partial-state procedure in section 2.
- Row present: migration is recorded as applied. Verify the schema
  actually matches (section 2) — the row does NOT guarantee the columns
  are all present if the tracker wrote before the last ALTER failed.
- Multiple rows / stale rows: indicates a split-brain with another
  concurrent deploy. Pause deploys, follow section 2, then hand-reconcile
  `d1_migrations` in section 4.

## 2. Inspect partial state

For each table the migration touches:

```
wrangler d1 execute <db-name> --command "PRAGMA table_info(account_ops_metadata);"
wrangler d1 execute <db-name> --command "PRAGMA table_info(account_sessions);"
wrangler d1 execute <db-name> --command "PRAGMA table_info(ops_error_events);"
```

Columns added by 0011 (7):

- `account_ops_metadata.row_version` — INTEGER NOT NULL DEFAULT 0
- `account_ops_metadata.status_revision` — INTEGER NOT NULL DEFAULT 0
- `account_sessions.status_revision_at_issue` — INTEGER NOT NULL DEFAULT 0
- `ops_error_events.first_seen_release` — TEXT (nullable)
- `ops_error_events.last_seen_release` — TEXT (nullable)
- `ops_error_events.resolved_in_release` — TEXT (nullable)
- `ops_error_events.last_status_change_at` — INTEGER (nullable)

Indexes added (2):

```
wrangler d1 execute <db-name> --command "PRAGMA index_list(ops_error_events);"
```

Check for:

- `idx_ops_error_events_last_seen_release` on `(last_seen_release)`
- `idx_ops_error_events_status_change` on `(status, last_status_change_at)`

## 3. Hand-apply the missing statements

For each **missing** column, run the corresponding ALTER:

```
wrangler d1 execute <db-name> --command "ALTER TABLE account_ops_metadata ADD COLUMN row_version INTEGER NOT NULL DEFAULT 0;"
wrangler d1 execute <db-name> --command "ALTER TABLE account_ops_metadata ADD COLUMN status_revision INTEGER NOT NULL DEFAULT 0;"
wrangler d1 execute <db-name> --command "ALTER TABLE account_sessions ADD COLUMN status_revision_at_issue INTEGER NOT NULL DEFAULT 0;"
wrangler d1 execute <db-name> --command "ALTER TABLE ops_error_events ADD COLUMN first_seen_release TEXT;"
wrangler d1 execute <db-name> --command "ALTER TABLE ops_error_events ADD COLUMN last_seen_release TEXT;"
wrangler d1 execute <db-name> --command "ALTER TABLE ops_error_events ADD COLUMN resolved_in_release TEXT;"
wrangler d1 execute <db-name> --command "ALTER TABLE ops_error_events ADD COLUMN last_status_change_at INTEGER;"
```

**Skip any column that already exists** — the ALTER would raise
`duplicate column name` and abort the recovery procedure.

The two indexes are always safe to re-run (they use
`CREATE INDEX IF NOT EXISTS`):

```
wrangler d1 execute <db-name> --command "CREATE INDEX IF NOT EXISTS idx_ops_error_events_last_seen_release ON ops_error_events(last_seen_release);"
wrangler d1 execute <db-name> --command "CREATE INDEX IF NOT EXISTS idx_ops_error_events_status_change ON ops_error_events(status, last_status_change_at);"
```

## 4. Mark the migration complete

Only after all columns + indexes are in place, write the tracker entry
if it is missing:

```
wrangler d1 execute <db-name> --command "INSERT INTO d1_migrations(name, applied_at) VALUES ('0011_admin_ops_p1_5_hardening.sql', unixepoch() * 1000);"
```

If the tracker already has a row for 0011, leave it alone.

## 5. Verify

Re-run the standard migration list — the output should show 0011 in the
"Already applied" column:

```
wrangler d1 migrations list <db-name>
```

Smoke-test the affected code paths:

- Admin ops metadata PUT — exercises `row_version` (U8 CAS).
- Cron scheduled — exercises retention sweeps that reference
  `status_revision_at_issue`.
- Error-event list — reads `first_seen_release` / `last_seen_release`.

## Out-of-scope

- Schema **rollback**. There is no down migration. If a hard rollback is
  required, create a new forward-only migration (e.g. 0012) that reverses
  the intended changes.
- `d1_migrations` rewrites. Do NOT `DELETE FROM d1_migrations` in
  production. If the tracker is corrupt, coordinate with the platform
  owner first.
