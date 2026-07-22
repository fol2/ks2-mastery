-- Post-Mega is an admin QA tool, but it must obey the same bounded-state
-- authority as normal Spelling gameplay. Keep rollback pre-images as rows in
-- D1 instead of copying a learner's lifetime word history into a mutation
-- receipt or HTTP response.

CREATE TABLE IF NOT EXISTS spelling_seed_preimages (
  preimage_id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL,
  actor_account_id TEXT NOT NULL,
  seed_request_id TEXT NOT NULL,
  ui_json TEXT NOT NULL,
  data_json TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  source_updated_at INTEGER NOT NULL,
  source_updated_by_account_id TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  achievement_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_restored_at INTEGER,
  last_restored_by_account_id TEXT,
  UNIQUE (actor_account_id, seed_request_id),
  CHECK (preimage_id <> ''),
  CHECK (learner_id <> ''),
  CHECK (json_valid(ui_json)),
  CHECK (json_valid(data_json)),
  CHECK (json_valid(stats_json)),
  CHECK (item_count >= 0),
  CHECK (achievement_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_spelling_seed_preimages_learner_created
  ON spelling_seed_preimages (learner_id, created_at DESC, preimage_id DESC);

CREATE TABLE IF NOT EXISTS spelling_seed_preimage_items (
  preimage_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  progress_json TEXT,
  guardian_json TEXT,
  pattern_json TEXT,
  source_updated_at INTEGER NOT NULL,
  source_updated_by_account_id TEXT,
  PRIMARY KEY (preimage_id, slug),
  FOREIGN KEY (preimage_id) REFERENCES spelling_seed_preimages(preimage_id) ON DELETE CASCADE,
  CHECK (slug <> ''),
  CHECK (progress_json IS NOT NULL OR guardian_json IS NOT NULL OR pattern_json IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS spelling_seed_preimage_achievements (
  preimage_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  record_json TEXT NOT NULL,
  source_updated_at INTEGER NOT NULL,
  source_updated_by_account_id TEXT,
  PRIMARY KEY (preimage_id, achievement_id),
  FOREIGN KEY (preimage_id) REFERENCES spelling_seed_preimages(preimage_id) ON DELETE CASCADE,
  CHECK (achievement_id <> ''),
  CHECK (json_valid(record_json))
);
