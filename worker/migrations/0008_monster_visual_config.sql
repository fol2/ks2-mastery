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
  schema_version INTEGER NOT NULL,
  last_mutation_account_id TEXT,
  last_mutation_request_id TEXT,
  last_mutation_request_hash TEXT,
  last_mutation_kind TEXT
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

CREATE TRIGGER IF NOT EXISTS trg_platform_monster_visual_config_publish_version
AFTER UPDATE OF published_version ON platform_monster_visual_config
WHEN NEW.published_version <> OLD.published_version
BEGIN
  INSERT INTO platform_monster_visual_config_versions (
    version,
    config_json,
    manifest_hash,
    schema_version,
    published_at,
    published_by_account_id
  )
  VALUES (
    NEW.published_version,
    NEW.published_json,
    NEW.manifest_hash,
    NEW.schema_version,
    NEW.published_at,
    COALESCE(NEW.published_by_account_id, 'system')
  );
END;
