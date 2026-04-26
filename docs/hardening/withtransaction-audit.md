# `withTransaction` audit — Phase C (U12)

Produced by the P1.5 Phase C hardening pass
(`docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md` §U12).

## Background

`worker/src/d1.js::withTransaction` uses the SQLite SAVEPOINT/ROLLBACK idiom
to give the test shim (`db.supportsSqlTransactions === true`) real atomicity.
**Production Cloudflare D1 does NOT support `db.exec('SAVEPOINT ...')`**, so
the helper degrades to a no-op: the statements run, but there is NO
rollback on failure. Leaving call sites wrapped in `withTransaction` implies
atomicity we do not have, which hides races from reviewers.

The canonical atomicity primitive on production D1 is
`batch(db, [bindStatement(...), ...])` — every statement commits or none
does. See `project_d1_atomicity_batch_vs_withtransaction.md` in the team
memory for the decision record.

## Rubric

1. **Single DB call inside wrapper** → delete the wrapper (always a no-op).
2. **Multiple statements, pure SQL, no intermediate branching, no external
   I/O, no lastrowid dependency** → convert to `batch([...])`.
3. **Multiple statements with (a) branching on intermediate read results,
   (b) external call (KV/fetch/DO), or (c) lastrowid dependency** →
   accept non-atomicity. Add `// NOTE: non-atomic by design — <reason>`
   comment. Do NOT keep the wrapper (misleading).

## Audit table

| path:line (pre-removal) | decision | reason | regression-test status |
| --- | --- | --- | --- |
| `worker/src/repository.js:3832` (`withMonsterVisualConfigMutation`) | removed, wrapped in `(async () => {...})()` with NOTE | (a) branching on `existingReceipt` + `currentRevision` CAS compare + (b) `apply()` callback runs its own `batch()` | `tests/monster-visual-config.test.js` + `tests/react-monster-visual-config-panel.test.js` green |
| `worker/src/repository.js:4262` (`updateManagedAccountRole`) | removed, wrapped in `(async () => {...})()` with NOTE | (a) existingReceipt short-circuit + target lookup + last-admin-locked defence + role-change UPDATE guarded by subquery | `tests/worker-admin-ops-mutations.test.js` admin-role subset green (exercises happy + stale + reuse paths) |
| `worker/src/repository.js:5117` (`withAccountMutation`) | removed, wrapped in `(async () => {...})()` with NOTE | (a) existingReceipt short-circuit + (b) `apply()` callback + `repo_revision` CAS | full worker suite green (hub-api, admin-ops-mutations, worker-admin-ops-read, worker-account-ops-metadata-cas) |
| `worker/src/repository.js:5230` (`withLearnerMutation`) | removed, wrapped in `(async () => {...})()` with NOTE | same shape as `withAccountMutation` but scoped to learners | worker + hub-api suites green |
| `worker/src/auth.js:127` (`runDemoConversionBatch` fallback branch) | kept with NOTE | fallback for a test-double shim that omits `db.batch()`; production always enters the `db.batch()` branch above. Removing would regress the test shim. | `tests/worker-auth.test.js` green |
| `worker/src/auth.js:605` (fresh-registration email path) | batched | rubric case 2 — inline INSERT into `adult_accounts` + INSERT into `account_credentials`, no intermediate branching | `tests/worker-auth.test.js` email-registration paths green |
| `worker/src/auth.js:960` (fresh-identity OAuth path) | batched | rubric case 2 — inline INSERT into `adult_accounts` + INSERT into `account_identities`, no intermediate branching | `tests/worker-auth.test.js` identity-registration paths green |

## Out-of-P1.5 deferred

All in-scope Phase C sites were processed. Sites outside Phase C scope
(none found by `grep -rn 'withTransaction' worker/src/`) would be listed
here if they existed.

## Expected `grep` baseline

After this audit, the canonical count is:

```
worker/src/auth.js:17:              import
worker/src/auth.js:127: — kept fallback NOTE
worker/src/auth.js:133: — kept fallback call
worker/src/d1.js:213:                declaration
worker/src/d1.js:214:                declaration body
worker/src/repository.js:2514:      unrelated comment
worker/src/repository.js:3833:      removed-site NOTE
worker/src/repository.js:4272:      removed-site NOTE
worker/src/repository.js:5131:      removed-site NOTE
worker/src/repository.js:5250:      removed-site NOTE
```

(The repository comments + one kept fallback in auth.js + the declaration
in d1.js. No new grep matches should appear without a corresponding audit
entry in this doc.)
