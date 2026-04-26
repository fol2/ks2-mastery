# Bootstrap Multi-Learner Stats Hotfix — Design

**Date:** 2026-04-26
**Status:** Approved (fully-autonomous scrum-master execution)
**Scope:** 2 units (U1 server-side decoupling + U2 client refetch)
**Severity:** User-visible prod bug — Nelson + James learning progress shows as `0` on Spelling setup; Eugenia unaffected because she is the persisted `selected_learner_id`.

## Problem

On the live site (`ks2-mastery`), opening **Spelling → Setup** displays `0` for Where-You-Stand stats for every learner except the account's active (selected) learner. Switching learners via the learner picker keeps the `0`s until the user triggers a Worker command (e.g., changing a stat filter option), at which point the full stats "come back".

This is a **client-transport bug, not data loss**. `D1` still holds every learner's `child_subject_state` row; the server simply does not ship them.

## Root cause

U7 ("Minimal Bootstrap v2", PR #290, `185b1b4`) introduced a `selectedLearnerBounded` mode on `bootstrapBundle()` to keep the bootstrap payload small:

- `worker/src/repository.js:6519` — `bootstrapBundle({ selectedLearnerBounded = false })`
- `worker/src/repository.js:6575` — `const boundedToSelected = publicReadModels && selectedLearnerBounded && selectedId`
- `worker/src/repository.js:6576` — `const queryLearnerIds = boundedToSelected ? [selectedId] : learnerIds`
- `worker/src/repository.js:6648-6673` — every per-learner `WHERE learner_id IN (…)` query (`child_subject_state`, `practice_sessions`, `child_game_state`, `event_log`) uses `queryLearnerIds`.

Both public bootstrap callers hardcode `selectedLearnerBounded: true`:

- `worker/src/repository.js:8078` — `bootstrapV2` (POST `/api/bootstrap`)
- `worker/src/repository.js:8099` — `bootstrapV2Get` (GET `/api/bootstrap`)

On the client side, `src/platform/core/store.js:490` `selectLearner` reads from the local cache only:

- `store.js:296` — `subjectUiForLearner` calls `repositories.subjectStates.readForLearner(learnerId)`, which reads the persisted/hydrated snapshot only. No network fetch.
- Result: switching to Nelson/James returns empty stats until the next Worker command response repopulates the cache via `applyCommandResultToCache`.

## Non-goal — preserve U7 capacity

U7's capacity ceilings exist to protect two large payloads:

1. `BUNDLED_MONSTER_VISUAL_CONFIG` — ~450 KB; expensive and lazy-fetchable.
2. `practice_sessions` + `event_log` — unbounded history; can be tens of KB per active learner.

**The `child_subject_state` row per (learner, subject) is small** (typically < 3 KB — it's the UI snapshot + data JSON for Spelling/Grammar/Punctuation/Math). With the repo's current per-account learner ceiling, shipping all writable learners' `child_subject_state` rows on bootstrap costs single-digit KB, not hundreds.

The fix must **keep `monster_visual_config`, `practice_sessions`, and `event_log` bounded**, and **unbind only `child_subject_state` (plus `child_game_state`, which is the same kind of compact per-learner slot)**.

## Approach — Option C (confirmed)

Two units, landed sequentially:

### U1 — Server: decouple `child_subject_state` from bounded mode (hotfix)

**Change (`worker/src/repository.js:6648`):**

1. Introduce a second query-id list `subjectStateLearnerIds` (and `gameStateLearnerIds`) that is **always** the full `learnerIds` array, independent of `boundedToSelected`.
2. Use this new list in the `child_subject_state` SELECT and the `child_game_state` SELECT.
3. Leave `practice_sessions` + `event_log` + `monster_visual_config` paths untouched — they continue to use `queryLearnerIds` / the bounded mode.
4. Update `bootstrapCapacityMeta` so the `bootstrapMode` label stays accurate (`'selected-learner-bounded'` still truthfully describes the sessions/events shape; subject-state rows are orthogonal to the capacity ceilings). Add a small meta marker indicating `subjectStatesBounded: false` so tests can assert the new contract and future U7-style optimisations can opt back in if needed.

**Test (TDD — write first, must fail on `main`):**

In `tests/worker-bootstrap-v2.test.js`, add a scenario:

- Create a 3-learner account (A selected, B + C writable).
- Insert non-default `child_subject_state` rows for all three (distinct `data_json` shapes).
- Hit `POST /api/bootstrap` (no `lastKnownRevision`, `publicReadModels=1`).
- Assert response `subjectStates` contains keyed entries for **all three** learners (A/B/C) for every subject row inserted.
- Assert `bootstrapCapacity.bootstrapMode === 'selected-learner-bounded'` (unchanged).
- Assert `practiceSessions` + `eventLog` are still bounded to the selected learner.

**Also update** existing bounded-mode snapshot tests in `tests/worker-bootstrap-v2.test.js` + `tests/worker-bootstrap-capacity.test.js` that assert `subjectStates` keys are bounded to `[selectedId]`. These will now need to assert all learners' states are present while still asserting sessions/events bounds.

**Blast radius:** ~20-30 lines in `repository.js` + test updates. No schema change, no migration, no client change.

**Rollback:** trivial — revert the PR. No data migration to undo.

### U2 — Client: `selectLearner` auto-refetch missing state (follow-up)

**Change (`src/platform/core/store.js:490`):**

1. When `selectLearner(learnerId)` runs, check whether the local cache already has `child_subject_state` for that learner.
2. If not, fire an idempotent fetch (reuse the existing subject-command-client path that returns a `subjectReadModel`, so `applyCommandResultToCache` handles persistence).
3. Guard against duplicate in-flight fetches (`inFlightLearnerFetches` set keyed by learnerId).
4. Debounce rapid learner-switch spamming.

**After U1 lands**, U2 is a defence-in-depth measure for any future bootstrap call that does not ship full state (e.g., cold re-auth, forced-logout-after-migration). It's not load-bearing for the current bug — U1 fixes the reported behaviour on its own.

**Test:**

- Unit test `selectLearner` under a fake `subjectStates` repository that starts empty for the target learner, confirm one fetch fires, confirm second call before fetch resolves does not fire a duplicate, confirm cache-hit path fires zero fetches.
- No Playwright test in U2 — U1's server test is the end-to-end proof.

**Blast radius:** ~40-60 lines in `store.js` + 1 new test file. No server change.

**Rollback:** revert PR; client reverts to U1's behaviour (which already fixes the reported bug).

## Units are sequential, not parallel

U1 + U2 both touch the `/api/bootstrap` → `selectLearner` contract. Parallel worktrees would share the same logical path and collide on test fixtures + mental model, matching the **U1+U9 shared-path incident** recorded in `feedback_subagent_tool_availability.md`. U1 ships first, U2 branches off the updated `main`.

## Acceptance criteria

- [ ] **U1 merged:** loading `/api/bootstrap` on a multi-learner account returns `child_subject_state` for every writable learner. Nelson + James stats render immediately on Spelling Setup without any user action.
- [ ] **U1 tests:** new multi-learner test passes; updated bounded-mode assertions still pass; existing Playwright `multi-tab-bootstrap` test still green.
- [ ] **U2 merged:** if the client somehow observes a missing learner's `subject_state` (e.g., late-added learner, cold reboot edge case), `selectLearner` fetches it once without user action.
- [ ] **No regression:** U7 capacity ceilings for `practice_sessions` + `event_log` remain intact; `monster_visual_config` bounded path unchanged; `bootstrapCapacity.bootstrapMode` still reports `'selected-learner-bounded'` on public calls.

## Out of scope

- Re-architecting bootstrap into per-learner on-demand fetches.
- Caching bootstrap response server-side.
- Adding a new `GET /api/learner/:id/subject-state` endpoint — the existing subject-command-client path already returns read-model updates we can reuse (see `applyCommandResultToCache` in `src/platform/core/api.js`).
- Monster visual config pointer optimisation changes.

## Review gates

Per `feedback_autonomous_sdlc_cycle.md` pattern:

- **Orchestrator-only reviewers** (ce-\* family — cannot run inside worktree subagents):
  - U1: ce-correctness, ce-testing, ce-reliability, ce-performance, ce-data-integrity-guardian.
  - U2: ce-correctness, ce-maintainability, ce-testing, ce-julik-frontend-races (async UI + DOM-timing-sensitive).
- **Review follower** resolves blockers and re-pushes.
- Final reviewer pass gates merge; zero remaining blockers required.
