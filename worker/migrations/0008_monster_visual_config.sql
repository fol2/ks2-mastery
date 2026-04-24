CREATE TABLE IF NOT EXISTS platform_monster_visual_config (
  id TEXT PRIMARY KEY,
  draft_json TEXT NOT NULL,
  draft_revision INTEGER NOT NULL DEFAULT 0,
  draft_updated_at INTEGER NOT NULL,
  draft_updated_by_account_id TEXT,
  published_json TEXT NOT NULL,
  published_version INTEGER NOT NULL DEFAULT 1,
  published_at INTEGER NOT NULL,
  published_by_account_id TEXT,
  manifest_hash TEXT NOT NULL,
  schema_version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_monster_visual_config_versions (
  version INTEGER PRIMARY KEY,
  config_json TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  published_at INTEGER NOT NULL,
  published_by_account_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_monster_visual_versions_published
  ON platform_monster_visual_config_versions(published_at DESC, version DESC);
