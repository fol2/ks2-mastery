-- Capacity follow-up: remove secondary indexes that are not used by hot-path
-- runtime queries but amplify D1 rows-written billing for every command write.

DROP INDEX IF EXISTS idx_mutation_receipts_scope;
DROP INDEX IF EXISTS idx_mutation_receipts_account_applied;
DROP INDEX IF EXISTS idx_learner_read_models_key_updated;
DROP INDEX IF EXISTS idx_practice_sessions_updated;
