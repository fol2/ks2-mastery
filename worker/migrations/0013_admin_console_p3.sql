-- Migration 0013: Admin Console P3 — occurrence, denial, and marketing tables.
--
-- Scope: adds the three new tables required by P3 Command Centre:
--   R6  → ops_error_event_occurrences (individual occurrence timeline)
--   R8  → admin_request_denials       (denial visibility log)
--   R19 → admin_marketing_messages    (marketing lifecycle)
--
-- All statements use IF NOT EXISTS for idempotency. Forward-only: there is
-- NO DOWN migration. All tables are standalone (no ALTER to existing tables).

-- ops_error_event_occurrences: individual occurrence rows for the error
-- timeline drilldown (R6). Each row links back to the parent fingerprint-
-- deduped ops_error_events row via event_id.
CREATE TABLE IF NOT EXISTS ops_error_event_occurrences (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES ops_error_events(id) ON DELETE CASCADE,
  occurred_at INTEGER NOT NULL,
  release TEXT,
  route_name TEXT,
  account_id TEXT,
  is_demo INTEGER DEFAULT 0,
  user_agent TEXT,
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_occ_event_occurred
  ON ops_error_event_occurrences(event_id, occurred_at DESC);

-- admin_request_denials: captures every denied admin request so the GM can
-- see what was blocked and why (R8).
CREATE TABLE IF NOT EXISTS admin_request_denials (
  id TEXT PRIMARY KEY,
  denied_at INTEGER NOT NULL,
  denial_reason TEXT NOT NULL,
  route_name TEXT,
  account_id TEXT,
  learner_id TEXT,
  session_id_last8 TEXT CHECK (session_id_last8 IS NULL OR length(session_id_last8) <= 8),
  is_demo INTEGER DEFAULT 0,
  release TEXT,
  detail_json TEXT CHECK (detail_json IS NULL OR json_valid(detail_json))
);

CREATE INDEX IF NOT EXISTS idx_denials_denied_at
  ON admin_request_denials(denied_at DESC);
CREATE INDEX IF NOT EXISTS idx_denials_account_denied_at
  ON admin_request_denials(account_id, denied_at DESC);
CREATE INDEX IF NOT EXISTS idx_denials_reason_denied_at
  ON admin_request_denials(denial_reason, denied_at DESC);

-- admin_marketing_messages: lifecycle-tracked announcements, tips, and
-- maintenance notices surfaced to customers via the admin console (R19).
CREATE TABLE IF NOT EXISTS admin_marketing_messages (
  id TEXT PRIMARY KEY,
  message_type TEXT NOT NULL DEFAULT 'announcement'
    CHECK (message_type IN ('announcement', 'maintenance')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'published', 'paused', 'archived')),
  title TEXT NOT NULL,
  body_text TEXT NOT NULL,
  severity_token TEXT DEFAULT 'info'
    CHECK (severity_token IN ('info', 'warning')),
  audience TEXT NOT NULL DEFAULT 'internal'
    CHECK (audience IN ('internal', 'demo', 'all_signed_in')),
  starts_at INTEGER,
  ends_at INTEGER,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  published_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  row_version INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_marketing_status_starts
  ON admin_marketing_messages(status, starts_at);
