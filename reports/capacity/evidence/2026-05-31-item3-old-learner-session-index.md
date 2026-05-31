# Item 3: Old learner session lookup pressure evidence

Date: 2026-05-31

## Root cause

Live D1 projection coverage is healthy for active learners:

- `learner_profiles`: 76
- learners with subject state: 57
- `command.projection.v1` rows: 57
- missing projection rows for learners with subject state: 0
- stale projection rows beyond the 200-revision bounded window: 0
- missing `recentEventTokens` rings: 0

The remaining old-learner pressure is the latest subject session lookup used by subject runtime reads:

```sql
SELECT id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at
FROM practice_sessions
WHERE learner_id = ? AND subject_id = ?
ORDER BY updated_at DESC, id DESC
LIMIT 1
```

Before the fix, the live query planner chose `idx_practice_sessions_learner_updated (learner_id, updated_at DESC, id DESC)`, which can scan across all subjects for an old learner. Live data already has one learner with 507 sessions and one learner-subject pair with 359 sessions, so this path will get heavier as old learner history grows.

## Fix

Migration `0017_practice_sessions_subject_order_index.sql` replaces the existing subject index instead of adding a duplicate index:

```sql
DROP INDEX IF EXISTS idx_practice_sessions_learner_subject;

CREATE INDEX IF NOT EXISTS idx_practice_sessions_learner_subject
  ON practice_sessions(learner_id, subject_id, updated_at DESC, id DESC);
```

This keeps the lookup subject-scoped and order-stable while avoiding a second overlapping subject/session index.

## Verification

- Remote D1 read-only probe confirmed projection coverage is not currently the bottleneck:
  - `missing_projection = 0`
  - `stale_projection = 0`
  - `missing_token_ring = 0`
- Remote D1 read-only probe confirmed old-learner session skew:
  - `max_sessions_per_learner = 507`
  - `max_sessions_per_learner_subject = 359`
- `node --test tests/worker-query-budget.test.js`
  - 23 tests passed
  - Added query-plan assertion that the latest session lookup uses `idx_practice_sessions_learner_subject`
  - Added assertion that the query plan does not need a temporary sort
- `git diff --check`
  - Passed with line-ending warnings only
