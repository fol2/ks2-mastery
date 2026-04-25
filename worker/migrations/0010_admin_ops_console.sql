-- admin_kpi_metrics: key-value counter table for event-driven KPI state.
-- Mirrors demo_operation_metrics (0007) shape exactly.
CREATE TABLE IF NOT EXISTS admin_kpi_metrics (
  metric_key TEXT PRIMARY KEY,
  metric_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- account_ops_metadata: 1:1 sidecar for adult_accounts carrying GM-facing
-- operational metadata. Mirrors account_credentials (0004) sidecar shape.
-- ops_status is informational only in P1; enforcement is deferred.
CREATE TABLE IF NOT EXISTS account_ops_metadata (
  account_id TEXT PRIMARY KEY,
  ops_status TEXT NOT NULL DEFAULT 'active',
  plan_label TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  internal_notes TEXT,
  updated_at INTEGER NOT NULL,
  updated_by_account_id TEXT,
  FOREIGN KEY (account_id) REFERENCES adult_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_account_id) REFERENCES adult_accounts(id) ON DELETE SET NULL,
  CHECK (ops_status IN ('active','suspended','payment_hold'))
);

-- ops_error_events: fingerprint-deduped client error log. Dedup authority is
-- the (error_kind, message_first_line, first_frame) tuple per R24; fingerprint
-- is a cache-only lookup key backed by the UNIQUE index below.
CREATE TABLE IF NOT EXISTS ops_error_events (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  error_kind TEXT NOT NULL,
  message_first_line TEXT NOT NULL,
  first_frame TEXT,
  route_name TEXT,
  user_agent TEXT,
  account_id TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  CHECK (status IN ('open','investigating','resolved','ignored')),
  FOREIGN KEY (account_id) REFERENCES adult_accounts(id) ON DELETE SET NULL
);

-- ops_error_events indexes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_error_events_fingerprint
  ON ops_error_events(fingerprint);
CREATE INDEX IF NOT EXISTS idx_ops_error_events_status_last_seen
  ON ops_error_events(status, last_seen DESC, id);
CREATE INDEX IF NOT EXISTS idx_ops_error_events_last_seen
  ON ops_error_events(last_seen DESC, id);
-- R24: authoritative tuple preflight index for replay-resistant dedup.
CREATE INDEX IF NOT EXISTS idx_ops_error_events_tuple
  ON ops_error_events(error_kind, message_first_line, first_frame);

-- Cross-table indexes supporting admin KPI windowed COUNT queries.
CREATE INDEX IF NOT EXISTS idx_practice_sessions_updated
  ON practice_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_created
  ON event_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mutation_receipts_applied
  ON mutation_receipts(applied_at DESC);
