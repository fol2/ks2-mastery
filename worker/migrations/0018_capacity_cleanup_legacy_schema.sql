-- Capacity cleanup: remove pre-SaaS tables and duplicate indexes that the
-- current Worker runtime no longer reads or writes.

DROP TABLE IF EXISTS spelling_sessions;
DROP TABLE IF EXISTS child_state;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS user_identities;
DROP TABLE IF EXISTS children;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS learners;
DROP TABLE IF EXISTS reward_events;

-- Older databases may carry both `idx_request_limits_updated` and the legacy
-- `idx_request_limits_updated_at` on the same single column.
DROP INDEX IF EXISTS idx_request_limits_updated_at;

-- Drain already-expired auth sessions immediately on migration. Cron keeps the
-- table bounded afterwards.
DELETE FROM account_sessions
WHERE rowid IN (
  SELECT rowid FROM account_sessions
  WHERE expires_at < CAST(strftime('%s', 'now') AS INTEGER) * 1000
  ORDER BY expires_at ASC
  LIMIT 5000
);
