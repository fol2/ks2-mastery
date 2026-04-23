ALTER TABLE adult_accounts ADD COLUMN account_type TEXT NOT NULL DEFAULT 'real';
ALTER TABLE adult_accounts ADD COLUMN demo_expires_at INTEGER;
ALTER TABLE adult_accounts ADD COLUMN demo_template_id TEXT;
ALTER TABLE adult_accounts ADD COLUMN converted_from_demo_at INTEGER;

ALTER TABLE account_sessions ADD COLUMN session_kind TEXT NOT NULL DEFAULT 'real';

CREATE INDEX IF NOT EXISTS idx_adult_accounts_demo_expiry
  ON adult_accounts(account_type, demo_expires_at);

CREATE TABLE IF NOT EXISTS demo_operation_metrics (
  metric_key TEXT PRIMARY KEY,
  metric_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
