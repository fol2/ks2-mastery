-- Migration 0012: Punctuation telemetry events table (plan P4 U9 / R10).
--
-- Creates the `punctuation_events` table that captures the 12 Punctuation
-- event kinds (card-opened, start-smart-review, first-item-rendered,
-- answer-submitted, feedback-rendered, summary-reached, map-opened,
-- skill-detail-opened, guided-practice-started, unit-secured,
-- monster-progress-changed, command-failed) with their per-kind
-- allowlisted payload JSON. Rows are inserted by the Worker
-- `record-event` command handler at
-- worker/src/subjects/punctuation/events.js. Per the plan:
--
--   - `release_id` is nullable (Phase 4 does NOT couple release-id into
--     the event write path; the column is cheap and saves a future
--     migration when release-scoped filtering is wanted).
--   - Three indexes support the two documented read patterns
--     (learner + kind + time) and (learner + time), plus a coarser
--     (kind + time) scan for release-smoke queries.
--   - The table is forward-only (no DOWN migration). Idempotent via
--     CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--
-- R11 release-id impact: none. Event writes do not change content,
-- scoring, mastery, or marking.

CREATE TABLE IF NOT EXISTS punctuation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id TEXT NOT NULL,
  event_kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  release_id TEXT,
  occurred_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_punctuation_events_learner_kind_time
  ON punctuation_events (learner_id, event_kind, occurred_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_punctuation_events_learner_time
  ON punctuation_events (learner_id, occurred_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_punctuation_events_kind_time
  ON punctuation_events (event_kind, occurred_at_ms DESC);
