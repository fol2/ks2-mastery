-- Support bounded learner_activity_feed retention sweeps without scanning the
-- full table. The table is a rollout-drain store on the subject-command path,
-- so cleanup must be indexed by the same timestamp predicate used by cron.
CREATE INDEX IF NOT EXISTS idx_learner_activity_feed_updated
  ON learner_activity_feed(updated_at);
