# Item 5 - D1 Cleanup

Date: 2026-05-31

## Root cause

The production D1 retention sweeps were healthy for the high-churn tables, but the database still carried old schema and one duplicate index:

- Legacy pre-SaaS tables still present: `users`, `children`, `sessions`, `spelling_sessions`, `child_state`, `subscriptions`, `user_identities`.
- Runtime code no longer reads or writes those tables. The only remaining direct references are in `scripts/d1-reset.mjs`.
- `request_limits` had both `idx_request_limits_updated` and the legacy duplicate `idx_request_limits_updated_at`.
- `account_sessions` retention only removed expired sessions that were also stale by status revision, so ordinary expired sessions could remain.

## Production inventory before fix

Remote read-only D1 inventory:

- `size_after`: 11,137,024 bytes
- `adult_accounts`: 78
- `learner_profiles`: 76
- `account_learner_memberships`: 76
- `child_subject_state`: 69
- `practice_sessions`: 699
- `event_log`: 607
- `mutation_receipts`: 317
- `request_limits`: 85
- `account_sessions`: 100
- `expired_account_sessions`: 18
- `learner_read_models`: 57
- `learner_activity_feed`: 9
- `child_game_state`: 52
- `ops_error_events`: 3
- `ops_error_event_occurrences`: 3
- `admin_request_denials`: 15
- `punctuation_events`: 0

Retention candidate check:

- `practice_stale_30d`: 0
- `mutation_receipts_stale_24h`: 0
- `request_limits_stale_24h`: 0
- `learner_activity_feed_stale_7d`: 0
- `admin_denials_stale_14d`: 0
- `event_log_over_200`: 0
- `stale_invalid_account_sessions`: 0
- `expired_account_sessions`: 18

Legacy table counts:

- `children`: 4
- `users`: 0
- `sessions`: 0
- `spelling_sessions`: 0
- `child_state`: 0
- `subscriptions`: 0
- `user_identities`: 0

## Fix

`worker/migrations/0018_capacity_cleanup_legacy_schema.sql`:

- Drops legacy pre-SaaS tables.
- Drops duplicate `idx_request_limits_updated_at`.
- Deletes up to 5,000 already-expired `account_sessions` rows during migration.

`worker/src/cron/retention-sweep.js`:

- Expired `account_sessions` cleanup now deletes every expired auth session row, not only expired rows with an older status revision.
- The bounded selector uses `idx_account_sessions_expires`.

## Behaviour review

- Player progress is untouched: source-of-truth rows remain in `learner_profiles`, `account_learner_memberships`, `child_subject_state`, `child_game_state`, `practice_sessions`, `event_log`, and `learner_read_models`.
- Live auth sessions are preserved.
- Expired auth sessions are already unusable by the auth boundary, so deleting them has no user-visible impact beyond requiring a new login for already-expired cookies.
- Error tables are preserved; this follows the current policy of recording only real errors.

## Evidence

Local validation:

- `node --test tests/worker-cron-retention-sweep.test.js tests/worker-migration-0018.test.js`
  - 16 passed
- `node --test tests/worker-query-budget.test.js`
  - 23 passed

Query-plan guard:

- `sweepStaleSessions uses the expires_at retention index`
  - Confirms the cleanup selector uses `idx_account_sessions_expires`.
