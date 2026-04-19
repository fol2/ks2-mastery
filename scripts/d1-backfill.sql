-- Idempotent data repair for historical rows created before the formal
-- migration workflow existed.
--
-- Before every mutating statement runs, a SELECT below reports the row
-- count that WILL be affected. When applying against a remote DB, review
-- the counts in the wrangler output; unexpectedly large numbers usually
-- indicate a half-corrupt prior state and should be investigated before
-- letting the backfill overwrite real history with defaults.
--
-- UPDATEs targeting `NOT NULL` columns with `IS NULL` predicates have
-- been removed — the schema constraint already guarantees those can
-- never match. Only empty-string repairs remain for TEXT columns that
-- accept `''` despite the NOT NULL constraint.

-- ============================================================
-- Pre-change reports (counts of rows each mutation will touch)
-- ============================================================

SELECT 'subscriptions_missing' AS target, COUNT(*) AS rows_affected
FROM users
WHERE NOT EXISTS (SELECT 1 FROM subscriptions WHERE subscriptions.user_id = users.id);

SELECT 'child_state_missing' AS target, COUNT(*) AS rows_affected
FROM children
WHERE NOT EXISTS (SELECT 1 FROM child_state WHERE child_state.child_id = children.id);

SELECT 'child_state_empty_progress_json' AS target, COUNT(*) AS rows_affected
FROM child_state
WHERE TRIM(spelling_progress_json) = '';

SELECT 'child_state_empty_monster_json' AS target, COUNT(*) AS rows_affected
FROM child_state
WHERE TRIM(monster_state_json) = '';

SELECT 'child_state_empty_prefs_json' AS target, COUNT(*) AS rows_affected
FROM child_state
WHERE TRIM(spelling_prefs_json) = '';

SELECT 'subscriptions_empty_plan_code' AS target, COUNT(*) AS rows_affected
FROM subscriptions
WHERE TRIM(plan_code) = '';

SELECT 'subscriptions_empty_status' AS target, COUNT(*) AS rows_affected
FROM subscriptions
WHERE TRIM(status) = '';

-- ============================================================
-- Mutations (idempotent; safe to re-run)
-- ============================================================

INSERT INTO subscriptions (
  user_id,
  plan_code,
  status,
  paywall_enabled,
  created_at,
  updated_at
)
SELECT
  users.id,
  'free',
  'active',
  0,
  users.created_at,
  users.updated_at
FROM users
WHERE NOT EXISTS (
  SELECT 1
  FROM subscriptions
  WHERE subscriptions.user_id = users.id
);

INSERT INTO child_state (
  child_id,
  spelling_progress_json,
  monster_state_json,
  spelling_prefs_json,
  updated_at
)
SELECT
  children.id,
  '{}',
  '{}',
  '{}',
  children.updated_at
FROM children
WHERE NOT EXISTS (
  SELECT 1
  FROM child_state
  WHERE child_state.child_id = children.id
);

UPDATE child_state
SET spelling_progress_json = '{}'
WHERE TRIM(spelling_progress_json) = '';

UPDATE child_state
SET monster_state_json = '{}'
WHERE TRIM(monster_state_json) = '';

UPDATE child_state
SET spelling_prefs_json = '{}'
WHERE TRIM(spelling_prefs_json) = '';

UPDATE subscriptions
SET plan_code = 'free'
WHERE TRIM(plan_code) = '';

UPDATE subscriptions
SET status = 'active'
WHERE TRIM(status) = '';
