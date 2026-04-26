-- Migration 0011: Admin-ops console P1.5 hardening schema additions.
--
-- Scope: adds every column + index required by Phase C/D/E of the P1.5
-- hardening plan so that downstream application code (PR 4 Phase D,
-- PR 5 Phase E) never reads a column that isn't deployed. This migration
-- is forward-only. There is NO DOWN migration: columns are additive,
-- nullable (or default-zero), and partial-apply-safe per plan section
-- "Phase C — Data integrity".
--
-- Columns added (7):
--   account_ops_metadata.row_version         INTEGER NOT NULL DEFAULT 0  -- Phase C U8 CAS
--   account_ops_metadata.status_revision     INTEGER NOT NULL DEFAULT 0  -- Phase D U15 bump
--   account_sessions.status_revision_at_issue INTEGER NOT NULL DEFAULT 0  -- Phase D U13 stamp / U14 compare
--   ops_error_events.first_seen_release      TEXT (nullable)             -- Phase E U16
--   ops_error_events.last_seen_release       TEXT (nullable)             -- Phase E U16
--   ops_error_events.resolved_in_release     TEXT (nullable)             -- Phase D U15 writes / Phase E U17 reads
--   ops_error_events.last_status_change_at   INTEGER (nullable)          -- Phase D U15 writes / Phase E U17 reads
--
-- Indexes added (2):
--   idx_ops_error_events_last_seen_release   -- supports Phase E U19 "new in this release" filter
--   idx_ops_error_events_status_change       -- supports Phase E U19 "reopened after resolved" filter
--
-- Idempotency note: ALTER TABLE ADD COLUMN has no "IF NOT EXISTS" in
-- SQLite, so a naive re-apply raises "duplicate column name". In
-- production this is harmless because Wrangler's d1_migrations table
-- prevents double-apply; in tests the helper in
-- tests/worker-migration-0011.test.js uses per-statement tolerance to
-- simulate that tracker. CREATE INDEX IF NOT EXISTS is inherently idempotent.

-- account_ops_metadata: row_version (U8 CAS) + status_revision (U15 bump)
ALTER TABLE account_ops_metadata ADD COLUMN row_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE account_ops_metadata ADD COLUMN status_revision INTEGER NOT NULL DEFAULT 0;

-- account_sessions: revision stamp for Phase D session compare
ALTER TABLE account_sessions ADD COLUMN status_revision_at_issue INTEGER NOT NULL DEFAULT 0;

-- ops_error_events: release tracking columns (nullable)
ALTER TABLE ops_error_events ADD COLUMN first_seen_release TEXT;
ALTER TABLE ops_error_events ADD COLUMN last_seen_release TEXT;
ALTER TABLE ops_error_events ADD COLUMN resolved_in_release TEXT;
ALTER TABLE ops_error_events ADD COLUMN last_status_change_at INTEGER;

-- Indexes supporting Phase E error-centre filters.
CREATE INDEX IF NOT EXISTS idx_ops_error_events_last_seen_release
  ON ops_error_events(last_seen_release);
CREATE INDEX IF NOT EXISTS idx_ops_error_events_status_change
  ON ops_error_events(status, last_status_change_at);
