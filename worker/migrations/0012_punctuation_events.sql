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
--
-- Review follow-on (2026-04-26): schema hardened after U9 review.
-- Since the feature flag `PUNCTUATION_EVENTS_ENABLED` is OFF in every
-- deployed environment (no production writes yet), we rewrite this
-- migration in place rather than landing a 0013 ALTER. Hardening:
--
--   1. `learner_id` gains `REFERENCES learner_profiles(id) ON DELETE CASCADE`
--      so GDPR erasure on the parent row cascades — every sibling learner
--      table (account_learner_memberships, learner_*_state, etc.) already
--      follows this pattern.
--   2. `event_kind` gains a CHECK constraint anchored to the 12 frozen
--      event kinds. Direct `wrangler d1 execute` inserts with arbitrary
--      kind values are now rejected at the storage boundary even when
--      they bypass the Worker allowlist.
--   3. `payload_json` gains `CHECK (json_valid(payload_json))` so a
--      corrupt row can never reach the downstream `JSON.parse` in the
--      query helper. SQLite evaluates the check at write time.
--   4. `request_id` column + `UNIQUE (learner_id, request_id)` index so
--      the Worker handler can use `INSERT OR IGNORE` for fire-and-forget
--      retry dedup (previously a retried `requestId` wrote a second row).

CREATE TABLE IF NOT EXISTS punctuation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL CHECK (event_kind IN (
    'card-opened',
    'start-smart-review',
    'first-item-rendered',
    'answer-submitted',
    'feedback-rendered',
    'summary-reached',
    'map-opened',
    'skill-detail-opened',
    'guided-practice-started',
    'unit-secured',
    'monster-progress-changed',
    'command-failed'
  )),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  release_id TEXT,
  request_id TEXT,
  occurred_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_punctuation_events_learner_kind_time
  ON punctuation_events (learner_id, event_kind, occurred_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_punctuation_events_learner_time
  ON punctuation_events (learner_id, occurred_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_punctuation_events_kind_time
  ON punctuation_events (event_kind, occurred_at_ms DESC);

-- UNIQUE index enforces retry idempotency: the Worker `record-event`
-- handler inserts with `INSERT OR IGNORE` so a duplicate `(learner_id,
-- request_id)` is silently ignored at the storage boundary. `request_id`
-- is nullable only for legacy rows that might pre-date the hardened
-- handler; all real writes send the command-envelope `requestId`.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_punctuation_events_learner_request
  ON punctuation_events (learner_id, request_id)
  WHERE request_id IS NOT NULL;
