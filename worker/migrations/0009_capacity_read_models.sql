CREATE TABLE IF NOT EXISTS learner_read_models (
  learner_id TEXT NOT NULL,
  model_key TEXT NOT NULL,
  model_json TEXT NOT NULL DEFAULT '{}',
  source_revision INTEGER NOT NULL DEFAULT 0,
  generated_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (learner_id, model_key),
  FOREIGN KEY (learner_id) REFERENCES learner_profiles(id) ON DELETE CASCADE,
  CHECK (model_key <> '')
);

CREATE INDEX IF NOT EXISTS idx_learner_read_models_key_updated
  ON learner_read_models(model_key, updated_at DESC, learner_id);

CREATE TABLE IF NOT EXISTS learner_activity_feed (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL,
  subject_id TEXT,
  activity_type TEXT NOT NULL,
  activity_json TEXT NOT NULL DEFAULT '{}',
  source_event_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (learner_id) REFERENCES learner_profiles(id) ON DELETE CASCADE,
  CHECK (activity_type <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_learner_activity_feed_source_event
  ON learner_activity_feed(source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_learner_activity_feed_learner_created
  ON learner_activity_feed(learner_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_learner_activity_feed_subject_created
  ON learner_activity_feed(learner_id, subject_id, created_at DESC, id DESC);
