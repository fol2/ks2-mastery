-- Idempotent data repair for historical rows created before the formal
-- migration workflow existed.

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
WHERE spelling_progress_json IS NULL OR TRIM(spelling_progress_json) = '';

UPDATE child_state
SET monster_state_json = '{}'
WHERE monster_state_json IS NULL OR TRIM(monster_state_json) = '';

UPDATE child_state
SET spelling_prefs_json = '{}'
WHERE spelling_prefs_json IS NULL OR TRIM(spelling_prefs_json) = '';

UPDATE child_state
SET updated_at = CAST(unixepoch('now') * 1000 AS INTEGER)
WHERE updated_at IS NULL;

UPDATE subscriptions
SET plan_code = 'free'
WHERE plan_code IS NULL OR TRIM(plan_code) = '';

UPDATE subscriptions
SET status = 'active'
WHERE status IS NULL OR TRIM(status) = '';

UPDATE subscriptions
SET paywall_enabled = 0
WHERE paywall_enabled IS NULL;

UPDATE subscriptions
SET created_at = CAST(unixepoch('now') * 1000 AS INTEGER)
WHERE created_at IS NULL;

UPDATE subscriptions
SET updated_at = COALESCE(updated_at, created_at, CAST(unixepoch('now') * 1000 AS INTEGER))
WHERE updated_at IS NULL;
