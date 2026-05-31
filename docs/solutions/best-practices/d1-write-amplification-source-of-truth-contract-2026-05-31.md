---
title: "D1 write amplification: keep source-of-truth state, not normal-operation history"
date: 2026-05-31
category: best-practices
module: cloudflare-d1-capacity
problem_type: best_practice
component: database
severity: high
applies_when:
  - "A hot path on Cloudflare D1 writes both current state and append-only normal-operation history"
  - "Mutation receipts store full response payloads for idempotency replay"
  - "A derived read model duplicates data already present in source-of-truth state"
  - "A production D1 database is at risk of quota or write-pressure failures"
tags:
  - cloudflare-d1
  - write-amplification
  - mutation-receipts
  - event-log
  - retention
  - source-of-truth
related_components:
  - worker/src/repository.js
  - worker/src/cron/retention-sweep.js
  - src/platform/runtime/subject-command-client.js
---

# D1 write amplification: keep source-of-truth state, not normal-operation history

## Context

The same failure mode can reappear after a quota hotfix if the hot path keeps writing large or duplicate normal-operation data. A previous production outage was caused by `mutation_receipts.response_json` retaining full subject command responses. Shortening receipt retention reduced the immediate database size, but the underlying shape remained risky: every command could write current state, event history, activity feed rows, projection rows, receipts, rate-limit buckets, and revision rows.

The product does not need a permanent row for every normal answer/session event to preserve player experience. It needs current progress, active/resumable session state, reward state, a bounded projection token ring for dedupe, a compact idempotency receipt, and true error/audit records.

## Guidance

### 1. Separate player source of truth from operational history

Keep writes that are needed to reload or sync the app:

- `child_subject_state` for current subject state.
- `practice_sessions` for active and recent bounded session history.
- `child_game_state` for rewards and monster codex state.
- `learner_read_models` for bounded projection state and dedupe tokens.
- `learner_profiles.state_revision` for stale-write protection.

Do not keep append-only normal gameplay history just because it is convenient for debugging or timeline rendering. If a row is not needed for current product behaviour, admin audit, or error diagnosis, it should be bounded, derived, or not written.

### 2. Idempotency receipts should be proof, not replay archives

`mutation_receipts` should prove that a request ID was applied and protect against request-id reuse. It should not store a full read model for every command. A compact replay response with `replayRequiresRefresh: true` is enough when the client can hydrate before applying the replay marker.

### 3. Derived tables must have a drain plan

Tables such as `learner_activity_feed` are useful only if they materially reduce read cost and stay bounded. If the normal write path stops using a derived table, keep old reads during rollout, add a bounded retention sweep, and only drop the table after every deployed read path no longer references it.

### 4. Cleanup follows deployed code

Never purge or drop a table before the deployed Worker stops writing the target rows. The safe order is:

1. Deploy the low-write code.
2. Smoke the live command and bootstrap paths.
3. Take a remote D1 backup.
4. Run bounded cleanup.
5. Record D1 size and row-count evidence.
6. Consider a drop migration only after reads and writes are both removed.

## Verification

Useful regression tests for this pattern:

- Duplicate subject command request IDs return a compact replay and do not store `subjectReadModel` in `mutation_receipts.response_json`.
- Reward-producing commands update `child_game_state` and projection tokens without appending normal `event_log` or `learner_activity_feed` rows.
- Pure read commands report `d1RowsWritten = 0`.
- Retention sweeps prune stale completed/abandoned sessions and activity rows, while preserving active sessions.
- Bootstrap for existing authenticated accounts does not update account rows when nothing changed.
