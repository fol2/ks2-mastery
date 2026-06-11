CREATE TABLE IF NOT EXISTS content_operation_releases (
  release_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  status TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  base_release_id TEXT,
  package_id TEXT,
  published_at INTEGER,
  published_by_account_id TEXT,
  rollback_of_release_id TEXT,
  proof_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_operation_releases_subject_status
  ON content_operation_releases(subject_id, status, published_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_operation_releases_package
  ON content_operation_releases(package_id);

CREATE TABLE IF NOT EXISTS content_operation_packages (
  package_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  base_release_id TEXT,
  base_release_hash TEXT,
  state TEXT NOT NULL,
  created_by_account_id TEXT NOT NULL,
  updated_by_account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  approved_at INTEGER,
  published_at INTEGER,
  superseded_by_package_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_content_operation_packages_subject_state
  ON content_operation_packages(subject_id, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_operation_packages_base_release
  ON content_operation_packages(base_release_id);

CREATE TABLE IF NOT EXISTS content_operation_package_operations (
  operation_id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  operation_order INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_path TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  before_hash TEXT,
  after_hash TEXT,
  payload_json TEXT NOT NULL,
  created_by_account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (package_id) REFERENCES content_operation_packages(package_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_operation_package_operations_order
  ON content_operation_package_operations(package_id, operation_order);

CREATE INDEX IF NOT EXISTS idx_content_operation_package_operations_entity
  ON content_operation_package_operations(package_id, entity_type, entity_id, field_path);

CREATE TABLE IF NOT EXISTS content_operation_package_candidates (
  candidate_id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  base_release_id TEXT,
  current_release_id TEXT,
  operations_hash TEXT NOT NULL,
  candidate_hash TEXT NOT NULL,
  candidate_snapshot_json TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  audio_scan_json TEXT,
  asset_scan_json TEXT,
  reward_scan_json TEXT,
  visibility_scan_json TEXT,
  conflicts_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (package_id) REFERENCES content_operation_packages(package_id)
);

CREATE INDEX IF NOT EXISTS idx_content_operation_package_candidates_package
  ON content_operation_package_candidates(package_id, created_at DESC);

CREATE TABLE IF NOT EXISTS content_operation_package_approvals (
  approval_id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  candidate_hash TEXT NOT NULL,
  approved_by_account_id TEXT NOT NULL,
  approved_at INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  audio_fallback_json TEXT,
  asset_summary_json TEXT,
  validation_summary_json TEXT,
  FOREIGN KEY (package_id) REFERENCES content_operation_packages(package_id),
  FOREIGN KEY (candidate_id) REFERENCES content_operation_package_candidates(candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_content_operation_package_approvals_package
  ON content_operation_package_approvals(package_id, approved_at DESC);

CREATE TABLE IF NOT EXISTS content_operation_events (
  event_id TEXT PRIMARY KEY,
  package_id TEXT,
  release_id TEXT,
  subject_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_account_id TEXT,
  event_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_operation_events_package
  ON content_operation_events(package_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_operation_events_release
  ON content_operation_events(release_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_operation_events_subject
  ON content_operation_events(subject_id, created_at DESC);

CREATE TABLE IF NOT EXISTS content_operation_audio_jobs (
  job_id TEXT PRIMARY KEY,
  package_id TEXT,
  candidate_id TEXT,
  lane TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  voice_id TEXT NOT NULL,
  pace_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  profile_version TEXT NOT NULL,
  content_key TEXT NOT NULL,
  status TEXT NOT NULL,
  r2_key TEXT,
  error_json TEXT,
  requested_by_account_id TEXT NOT NULL,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_operation_audio_jobs_package_status
  ON content_operation_audio_jobs(package_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_operation_audio_jobs_content_key
  ON content_operation_audio_jobs(content_key, lane, voice_id, pace_id);

CREATE TABLE IF NOT EXISTS content_operation_asset_uploads (
  asset_upload_id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  monster_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  stage_id TEXT NOT NULL,
  asset_kind TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  validation_json TEXT NOT NULL,
  preview_json TEXT,
  status TEXT NOT NULL,
  created_by_account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (package_id) REFERENCES content_operation_packages(package_id)
);

CREATE INDEX IF NOT EXISTS idx_content_operation_asset_uploads_package
  ON content_operation_asset_uploads(package_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_operation_asset_uploads_monster
  ON content_operation_asset_uploads(monster_id, branch_id, stage_id);

CREATE TABLE IF NOT EXISTS content_operation_account_overrides (
  override_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  release_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_by_account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_content_operation_account_overrides_active
  ON content_operation_account_overrides(account_id, subject_id, active);
