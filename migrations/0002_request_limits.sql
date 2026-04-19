-- Auth abuse protection bucket counters.

CREATE TABLE IF NOT EXISTS request_limits (
  limiter_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_limits_updated_at ON request_limits (updated_at);
