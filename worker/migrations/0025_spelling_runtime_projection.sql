ALTER TABLE content_operation_releases
ADD COLUMN runtime_snapshot_json TEXT;

ALTER TABLE content_operation_releases
ADD COLUMN runtime_summary_json TEXT;
