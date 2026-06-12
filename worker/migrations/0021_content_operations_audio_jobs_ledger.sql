ALTER TABLE content_operation_audio_jobs ADD COLUMN idempotency_key TEXT;
ALTER TABLE content_operation_audio_jobs ADD COLUMN source_kind TEXT;
ALTER TABLE content_operation_audio_jobs ADD COLUMN provenance_json TEXT;
ALTER TABLE content_operation_audio_jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE content_operation_audio_jobs ADD COLUMN updated_at INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_operation_audio_jobs_idempotency
  ON content_operation_audio_jobs(idempotency_key);

