# Item 4 - Command Payload Reduction

Date: 2026-05-31

## Root cause

Grammar command responses duplicated reward projection event payloads:

- top-level `projections.rewards.events`
- top-level `projections.rewards.toastEvents`
- nested `subjectReadModel.projections.rewards.events`
- nested `subjectReadModel.projections.rewards.toastEvents`

The client consumes the event/toast arrays from the top-level command projection payload, so the nested copy increased compute serialisation work and network response size without adding player-visible behaviour.

## Fix

`worker/src/subjects/grammar/read-models.js` now compacts nested grammar command projections before serialising `subjectReadModel`.

The nested read model keeps:

- `rewards.systemId`
- `rewards.state`

The top-level command payload still carries:

- `projections.rewards.events`
- `projections.rewards.toastEvents`
- `reactionEvents`
- `toastEvents`

This preserves reward UI events and learner progress while removing the duplicate nested event payload.

## Evidence

Local grammar submit-answer serialisation check:

- Before: 17,046 bytes
- After: 14,183 bytes
- Reduction: 2,863 bytes per response, about 16.8%
- New regression gate: submit-answer response must stay below 15,000 bytes

Local validation:

- `node --test tests/worker-grammar-subject-runtime.test.js`
  - 36 passed
- `node --test tests/worker-projections.test.js tests/worker-projection-hot-path-write.test.js tests/worker-projection-hot-path-read.test.js`
  - 23 passed
- `node --test tests/worker-query-budget.test.js`
  - 23 passed

Behaviour review:

- Top-level reward events remain present for UI consumption.
- Nested `subjectReadModel.projections.rewards.state` still matches the top-level reward state.
- Nested duplicate `events` and `toastEvents` are intentionally absent.
