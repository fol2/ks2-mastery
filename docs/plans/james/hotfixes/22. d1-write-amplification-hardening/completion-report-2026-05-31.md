# D1 write-amplification hardening completion report

Date: 2026-05-31
Production URL: `https://ks2.eugnel.uk`
Branch: `codex/d1-write-amplification-hardening`
Status: implementation locally verified and prepared for PR; production deployment and backup-first cleanup still require the release gate.

## Root cause

The D1 pressure was not caused by true error logging. It came from normal-operation write amplification on the subject-command hot path:

- Subject command receipts could store full read-model payloads.
- Normal gameplay events were written as append-only `event_log` history.
- The same public activity signal could also be duplicated into `learner_activity_feed`.
- Completed and abandoned `practice_sessions` were retained without a product-level bound.
- Existing authenticated reads could still take a write-capable account path even when the account row was unchanged.

This repeated the same class of problem as the earlier D1 quota incident: useful current state was mixed with large or redundant history, so ordinary play could grow D1 without a matching player-experience benefit.

## Remediation

- Kept source-of-truth player writes: `child_subject_state`, active/recent `practice_sessions`, `child_game_state`, `learner_read_models`, mutation revision metadata, and real error/audit records.
- Changed subject command receipts to compact replay metadata. Duplicate request IDs now return `replayRequiresRefresh: true`; the browser hydrates before applying the replay marker.
- Stopped normal subject commands from appending gameplay events to `event_log`.
- Stopped normal subject commands from writing duplicate `learner_activity_feed` rows.
- Preserved monster reward and replay dedupe through the projection read model's `recentEventTokens` ring.
- Added retention sweeps for stale completed/abandoned `practice_sessions` and stale `learner_activity_feed` rows.
- Collapsed demo command rate-limit fanout from four D1 buckets to two.
- Changed `ensureAccount` to read-first and write only when a row is missing or materially changed.

## Player experience contract

This is not a no-write design. Changed gameplay commands still write the state needed for progress, resume, reload, rewards, cross-device sync, and stale-write protection. The removed writes are redundant normal-history writes and full response archives.

Immediate command responses still return the full read model used by the UI. Only stored idempotency receipts are compact. On a duplicate replay, the client refreshes repositories before applying the compact replay marker, so the visible state remains current.

## Local verification

- `node --test tests/subject-command-client.test.js tests/worker-subject-runtime.test.js tests/worker-cron-retention-sweep.test.js tests/worker-query-budget.test.js tests/worker-projections.test.js tests/worker-projection-hot-path-read.test.js tests/worker-projection-hot-path-write.test.js tests/worker-demo-session.test.js`
  - Result: 95 tests passed, 0 failed.
  - Evidence included pure read `check-word-bank-drill` responses with `d1RowsWritten: 0`.
  - Reward command coverage proved `child_game_state` and projection tokens update while `event_log` and `learner_activity_feed` stay unchanged.
  - Compact subject command receipts were asserted below 512 bytes and without `subjectReadModel`.
- `node --test tests/punctuation-release-smoke.test.js tests/server-spelling-engine-parity.test.js tests/worker-bootstrap-capacity.test.js tests/worker-grammar-subject-runtime.test.js`
  - Result: 54 tests passed, 0 failed.
  - Evidence covered legacy tests whose old assertions expected append-only gameplay history.
- `npm test`
  - Result: 111633 tests passed, 0 failed, 12 skipped.
  - Log: `%TEMP%\ks2-npm-test-d1-hardening.log`.
- `npm run check`
  - Result: passed.
  - Includes Worker dry-run deploy, client build, public-build assertion, Worker bundle build, and client bundle audit.
  - Client bundle audit: 1285 public files, 6 chunks, main bundle 212142 / 232000 gzip bytes.
- `git diff --check`
  - Result: no whitespace errors.

## Browser smoke

- Harness: `node ./tests/helpers/browser-app-server.js --serve-only --port 0 --with-worker-api`.
- Browser driver: `agent-browser --session ks2-d1-smoke-20260531`.
- Flow: `/demo` -> Spelling -> start session -> submit an answer.
- Result: the UI loaded, the Spelling session started, the answer submission returned feedback, and no page errors were reported by `agent-browser errors --clear`.
- Local Worker evidence:
  - Existing demo bootstrap after session creation returned `d1RowsWritten: 0`.
  - `spelling.start-session` wrote 5 D1 rows: `child_subject_state`, `practice_sessions`, `learner_read_models`, compact `mutation_receipts`, and `learner_profiles` revision.
  - `spelling.submit-answer` wrote the same 5 source-of-truth/projection/receipt/revision rows.
  - The statement list for both commands contained no `event_log` write and no `learner_activity_feed` write.
  - Local TTS returned the expected unavailable fallback in this harness; the UI continued with "Audio unavailable" and this is not part of the D1 write path.

## Review closure

Manual LFG review focused on the command receipt replay contract, source-of-truth persistence, removed history writes, retention safety, demo limiter fanout, and old tests that depended on `event_log`. No residual code changes were required after the verification fixes above.

## Production cleanup gate

Cleanup is intentionally not run before deployment. The safe order remains:

1. Run `npm test`.
2. Run `npm run check`.
3. Deploy with `npm run deploy`.
4. Smoke `https://ks2.eugnel.uk` with a logged-in or demo session.
5. Take a remote D1 backup.
6. Run bounded cleanup for stale receipts, stale completed/abandoned sessions, and stale activity feed rows.
7. Record D1 `size_after`, row counts, and live smoke evidence here before closing the production ticket.
