# Item 2: Submit-answer D1 write reduction evidence

Date: 2026-05-31

## Root cause

`submit-answer` already persists the learner-visible feedback state and mastery deltas in `child_subject_state`, but the command also rewrote the active `practice_sessions` row. The active row is not the source of truth for resuming the player's current feedback state; it is needed for session start/completion history. Rewriting it on every answer added one D1 write per answer without changing the returned user experience.

## Fix

The subject command persistence plan now skips active `practice_sessions` writes only for `submit-answer`. Start-session and completion writes still persist the row, so session history remains available.

## Local capacity evidence

Before the fix, the local grammar command diagnostic for one started session produced:

- `submit-answer`: `queryCount = 13`, `d1RowsWritten = 6`
- Batch statements included `INSERT INTO practice_sessions`

After the fix:

- `submit-answer`: `queryCount = 12`, `d1RowsWritten = 5`
- Batch statements no longer include `practice_sessions` for active feedback
- `continue-session`: still writes `practice_sessions` completion history

The projection tests also show spelling `submit-answer` on the same shared persistence path now avoids the active `practice_sessions` rewrite.

## Verification

- `node --test tests/worker-grammar-subject-runtime.test.js`
  - 36 tests passed
  - Added assertions that active `practice_sessions` stays unchanged after `submit-answer`
  - Added assertion that persisted session completion summary is still written
  - Added D1 write budget assertion: grammar `submit-answer` writes at most 5 rows
- `node --test tests/worker-projections.test.js tests/worker-projection-hot-path-write.test.js tests/worker-projection-hot-path-read.test.js`
  - 23 tests passed
- `node --test tests/worker-query-budget.test.js`
  - 22 tests passed
- `git diff --check`
  - Passed with line-ending warnings only
