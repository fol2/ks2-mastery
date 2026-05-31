DROP INDEX IF EXISTS idx_practice_sessions_learner_subject;

CREATE INDEX IF NOT EXISTS idx_practice_sessions_learner_subject
  ON practice_sessions(learner_id, subject_id, updated_at DESC, id DESC);
