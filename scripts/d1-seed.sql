-- Local development seed data.
-- Demo sign-in:
--   email: demo.parent@example.test
--   password: demo-password-1234

INSERT OR IGNORE INTO users (
  id,
  email,
  password_hash,
  password_salt,
  created_at,
  updated_at
)
VALUES (
  'seed-demo-user',
  'demo.parent@example.test',
  '_dnp1MaGOon6WNBwxHdxX9eeJ_gtP-63oYxIC97B02k',
  'i9Y4bbZlGrHnSahssDU6Pw',
  CAST(unixepoch('now') * 1000 AS INTEGER),
  CAST(unixepoch('now') * 1000 AS INTEGER)
);

INSERT OR IGNORE INTO subscriptions (
  user_id,
  plan_code,
  status,
  paywall_enabled,
  created_at,
  updated_at
)
VALUES (
  'seed-demo-user',
  'free',
  'active',
  0,
  CAST(unixepoch('now') * 1000 AS INTEGER),
  CAST(unixepoch('now') * 1000 AS INTEGER)
);

INSERT OR IGNORE INTO children (
  id,
  user_id,
  name,
  year_group,
  avatar_color,
  goal,
  daily_minutes,
  weak_subjects_json,
  created_at,
  updated_at
)
VALUES (
  'seed-demo-child',
  'seed-demo-user',
  'Maya Demo',
  'Y5',
  '#3E6FA8',
  'sats',
  15,
  '[]',
  CAST(unixepoch('now') * 1000 AS INTEGER),
  CAST(unixepoch('now') * 1000 AS INTEGER)
);

INSERT OR IGNORE INTO child_state (
  child_id,
  spelling_progress_json,
  monster_state_json,
  spelling_prefs_json,
  updated_at
)
VALUES (
  'seed-demo-child',
  '{}',
  '{}',
  '{"yearFilter":"all","roundLength":"20","showCloze":true,"autoSpeak":true}',
  CAST(unixepoch('now') * 1000 AS INTEGER)
);
