-- U7 Bootstrap v2: a sibling counter keyed by account_id that bumps whenever
-- the account's learner list structure changes (add, remove, rename,
-- avatar-change). A separate counter is needed so the SHA-256 revision hash
-- input changes even when `adult_accounts.repo_revision` (the CAS revision
-- for scoped mutations) happens to stay stable for a non-mutation refresh.
--
-- Implementation note: we use a sibling table (not `ALTER TABLE ADD COLUMN`)
-- so the migration is fully idempotent under D1 and under the local sqlite
-- helper that re-exec's the final migration file (see
-- `tests/worker-migration-0010.test.js` for the idempotency contract).
-- SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so a sibling
-- table with `CREATE TABLE IF NOT EXISTS` is the only idempotent path.
--
-- Rows are lazily created by the Worker on first bump; a missing row is
-- treated as revision 0. Foreign key uses ON DELETE CASCADE so account
-- teardown cleans the counter automatically.
CREATE TABLE IF NOT EXISTS adult_account_list_revisions (
  account_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (account_id) REFERENCES adult_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_adult_account_list_revisions_updated
  ON adult_account_list_revisions (updated_at DESC);
