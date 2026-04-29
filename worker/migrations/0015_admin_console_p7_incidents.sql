-- Migration 0015: Admin Console P7 — support incidents and account lifecycle.

CREATE TABLE IF NOT EXISTS admin_support_incidents (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'waiting_on_parent', 'resolved', 'ignored')),
  title TEXT NOT NULL,
  created_by TEXT NOT NULL,
  assigned_to TEXT,
  account_id TEXT,
  learner_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER,
  row_version INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (account_id) REFERENCES adult_accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_incidents_status_updated
  ON admin_support_incidents(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_account
  ON admin_support_incidents(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_support_incident_notes (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES admin_support_incidents(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  note_text TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'admin_only'
    CHECK (audience IN ('admin_only', 'ops_safe')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incident_notes_incident
  ON admin_support_incident_notes(incident_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_support_incident_links (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES admin_support_incidents(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL
    CHECK (link_type IN ('error_event', 'error_fingerprint', 'denial', 'marketing_message', 'account', 'learner')),
  link_target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incident_links_incident
  ON admin_support_incident_links(incident_id, created_at DESC);

-- U8: Account lifecycle extension
ALTER TABLE account_ops_metadata ADD COLUMN conversion_source TEXT;
ALTER TABLE account_ops_metadata ADD COLUMN cancelled_at INTEGER;
ALTER TABLE account_ops_metadata ADD COLUMN cancellation_reason TEXT;
