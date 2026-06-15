-- Keep start-session's sibling-abandon update bounded for long-history learners.
-- The hot path only needs to find currently active sessions; completed and
-- abandoned history must not be scanned when a learner has months of practice.

CREATE INDEX IF NOT EXISTS idx_practice_sessions_active_learner_subject
  ON practice_sessions(learner_id, subject_id, id)
  WHERE status = 'active';
