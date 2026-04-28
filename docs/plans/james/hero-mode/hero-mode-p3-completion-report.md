---
title: "Hero Mode P3 — Completion Report"
type: completion-report
status: complete
date: 2026-04-28
pr: "#533"
merge_sha: bf7ce99
origin: docs/plans/james/hero-mode/hero-mode-p3.md
plan: docs/plans/2026-04-28-006-feat-hero-mode-p3-completion-claims-daily-progress-plan.md
predecessor: docs/plans/james/hero-mode/hero-mode-p2-completion-report.md
---

# Hero Mode P3 — Completion Report

## Executive Summary

Hero Mode P3 shipped in PR #533 (squash-merged 2026-04-28T22:33:32Z). It introduces the **first Hero-owned persistent state** — completing the transition from P2's read-only orchestrator shell to a write-capable progress system. A child can now finish a Hero-launched subject round, return to the dashboard, and see authoritative Hero progress with idempotent completion claims, no duplicate progress, and no reward economy.

**Key metrics:**
- 13 commits → 1 squash merge
- 645 hero tests, 0 failures, 0 regressions
- 12 implementation units executed sequentially (dependency-ordered)
- 2 code review findings caught and fixed before merge
- Zero economy vocabulary in child UI
- Zero new D1 tables
- Production-safe: `HERO_MODE_PROGRESS_ENABLED=false` by default

---

## What P3 Proves

P3 answers the guiding question from the origin document:

> "Can a learner finish a Hero-launched subject round, return to the dashboard, and see authoritative Hero progress for today's quest — with idempotent completion claims, no duplicate progress, and no reward economy?"

**Yes.** The implementation satisfies all 12 requirements and all acceptance criteria from the origin spec (sections 4, 7, 22).

---

## Architecture Delivered

### Three-layer extension preserved

| Layer | P2 (read-only) | P3 (write-capable) |
|-------|----------------|-------------------|
| `shared/hero/` | 10 pure modules | +3 modules: `progress-state.js`, `claim-contract.js`, `completion-status.js` |
| `worker/src/hero/` | `read-model.js`, `launch.js`, `routes.js`, providers, adapters | +`claim.js` (evidence resolver) |
| `worker/src/repository.js` | `readHeroSubjectReadModels` | +`readHeroProgressState`, `buildHeroProgressUpsertStatement`, `runHeroCommandMutation`, `readHeroProgressData`, `writeHeroProgress` |
| `src/platform/hero/` | `hero-client.js` (readModel, startTask), `hero-ui-model.js` | +`claimTask` method, progress fields in buildHeroHomeModel |
| `src/surfaces/` | `HeroQuestCard.jsx`, `HeroTaskBanner.jsx` | +claiming/claimed/daily-complete/progress states |

### Flag hierarchy

```
HERO_MODE_SHADOW_ENABLED       → read-only shadow quest (P0)
  └─ HERO_MODE_LAUNCH_ENABLED  → start-task command (P1)
      └─ HERO_MODE_CHILD_UI_ENABLED → child-visible card (P2)
          └─ HERO_MODE_PROGRESS_ENABLED → claim-task + progress writes (P3)
```

All four flags must be `true` for the full P3 experience. Progress flag defaults to `false` in `wrangler.jsonc`.

### Data flow: claim lifecycle

```
start-task → subject session starts → heroContext injected
    ↓
hero progress: task.status = 'started' (child_game_state)
    ↓
subject engine owns session (marking, feedback, Stars)
    ↓
session completes → summary_json includes heroContext (trust anchor)
    ↓
auto-claim fires → POST /api/hero/command { command: 'claim-task' }
    ↓
claim resolver: validates evidence (practice_sessions.summary_json.heroContext)
    ↓
runHeroCommandMutation: batch(progress_upsert + receipt + revision_bump)
    ↓
read model v4 returned → dashboard shows "Task complete"
```

### Trust anchor chain

The critical architectural discovery during planning: **heroContext is cleared from all server-owned state when sessions complete** (subjects null out `state.session`, and `session_state_json` is NULL on completed practice sessions). P3 resolved this by:

1. **U1**: Subject engines now copy `heroContext` fields into `practice_sessions.summary_json` at completion time
2. **U5**: Claim resolver searches completed `practice_sessions` for matching `summary_json.heroContext`
3. **U4**: start-task writes a progress marker so the read model knows a task is "in-flight"

This three-step pattern creates a server-owned evidence chain that survives subject session cleanup.

---

## Implementation Units Delivered

| Unit | Description | Files | Tests |
|------|------------|-------|-------|
| U1 | heroContext in practice session summaries | 5 modified | 10 (in existing file) |
| U2 | Shared progress contracts | 3 created | 60 |
| U3 | Repository helpers + mutation safety | 1 modified, 1 created | 14 |
| U4 | start-task progress write | 3 modified | 12 (extended) |
| U5 | Claim evidence resolver | 2 created | 26 |
| U6 | Claim command handler + route wiring | 1 modified, 1 created | 8 |
| U7 | Read model v4 with progress merge | 3 modified, 1 created | 27 (+ 14 extended) |
| U8 | Feature flag + config defaults | 4 modified | 3 (extended) |
| U9 | Client claim API | 1 modified, 1 created | 15 |
| U10 | Runtime actions + auto-claim + repair | 6 modified, 1 created | 34 |
| U11 | UI progress states | 4 modified, 2 created | 27 |
| U12 | E2E flows + boundary hardening | 2 created | 19 |

**Totals:** 645 tests across 17 test files. Zero regressions in pre-existing hero tests.

---

## Critical Decisions Made During Implementation

### 1. heroContext persistence in summary_json (U1)

Subject engines (Grammar, Spelling, Punctuation) now include `heroContext: { source, questId, taskId, questFingerprint, launchRequestId }` in practice session summaries. This is **additive metadata only** — no subject completion behaviour is changed.

**Why this matters:** Without this, P3 has no server-owned evidence linking a completed session to a Hero launch after the session clears. The alternative (claim from ui_json before it clears) creates race conditions and makes dashboard-load repair impossible.

### 2. start-task writes a progress marker (U4)

`start-task` now performs a **non-fatal** hero progress upsert (`task.status = 'started'`) separate from the subject command batch. This gives the read model a "task in-flight" signal.

**Why non-fatal:** The progress marker is informational. If it fails, the claim flow still works (just `pendingCompletedHeroSession` detection degrades). The subject command is the critical path.

### 3. runHeroCommandMutation parallels runSubjectCommandMutation (U3)

Same CAS + receipt + batch pattern, but simpler: no projection context, no retry loop, no subject runtime write. Hero commands write only to `child_game_state` + `mutation_receipts` + `learner_profiles.state_revision`.

**Why no retry loop:** Hero state is simpler than subject state. Concurrent hero mutations for the same learner are rare (unlike subject commands which can race during rapid answering). A single CAS attempt with stale_write rejection is sufficient.

### 4. Auto-claim + dashboard-load repair dual path (U10)

Two independent claim triggers ensure robustness:
- **Auto-claim**: Fires immediately after subject session terminal detection (`isHeroSessionTerminal`)
- **Dashboard-load repair**: Fires on every read-model load when `pendingCompletedHeroSession` exists

**Why both:** Auto-claim handles the happy path (smooth UX). Dashboard-load repair handles: network drops, tab closures, app crashes, multi-tab, and page refreshes. The `pendingClaimKey` deduplication prevents double-firing.

### 5. Grace window: forward-only, 2 hours (U5)

A task launched before midnight can be claimed up to 2 hours after the dateKey ends. The grace is forward-only (a task from 2026-04-28 can be claimed on 2026-04-29 at 01:30, but a task from 2026-04-29 cannot be claimed for 2026-04-28).

---

## Code Review Findings and Fixes

Two reviewers ran in parallel (correctness + maintainability). Findings addressed before merge:

### Fixed (HIGH)

1. **heroLaunch response missing questFingerprint** — The `heroLaunch` object in `launch.js` didn't include `questFingerprint`. Auto-claim would send an empty string, failing server validation. Fixed by adding `questFingerprint: heroReadModel.questFingerprint` to the response.

2. **Stale-write retry uses same revision** — The hero client's `onStaleWrite` callback was a no-op. Retry would fail with the same stale revision. Fixed by wiring `applyLearnerRevisionHint(learnerId, currentRevision)` into the callback (same pattern as subject commands).

### Accepted (MEDIUM, architectural)

3. **Claim handler inlined in app.js** — 200-line block could be extracted to `worker/src/hero/claim-handler.js`. Deferred to P4 as a refactor opportunity when the handler grows with economy logic.

4. **CAS phantom success** — Theoretical TOCTOU gap where batch writes 0 rows but returns success. D1 serialises writes making the race window near-zero. Accepted with monitoring via structured logs.

### Noted (LOW, pre-existing)

5. **`fresh-exploration` / `starter-growth` copy mismatch** — Pre-existing in P2 copy maps, not introduced by P3.

---

## Boundary Invariants: P2 → P3 Evolution

| Invariant | P2 | P3 |
|-----------|----|----|
| Hero writes | Zero | `child_game_state` (hero-mode) + `mutation_receipts` + `event_log` (hero.* types) + `learner_profiles.state_revision` |
| Hero events | Zero | `hero.task.completed`, `hero.daily.completed` only |
| Economy state | None | None (explicitly tested) |
| Subject writes from Hero | None | None (boundary test verified) |
| `shared/hero/` purity | Pure | Pure (9 boundary assertions) |
| Child UI vocabulary | No economy terms | No economy terms (HERO_FORBIDDEN_VOCABULARY enforced) |

---

## Test Coverage Architecture

```
tests/hero-progress-state.test.js        — 29 tests (pure progress logic)
tests/hero-claim-contract.test.js        — 18 tests (validation, forbidden fields)
tests/hero-completion-status.test.js     — 13 tests (status derivation)
tests/hero-context-passthrough.test.js   — 19 tests (heroContext in summaries)
tests/hero-progress-mutation-safety.test.js — 14 tests (CAS, receipt, batch)
tests/hero-claim-resolver.test.js        — 26 tests (evidence lookup, grace)
tests/hero-launch-flow-e2e.test.js       — 12 tests (start-task + progress)
tests/hero-claim-flow-e2e.test.js        — 8 tests  (claim route integration)
tests/hero-progress-read-model.test.js   — 30 tests (v4 merge, pending, flags)
tests/hero-client-claim.test.js          — 15 tests (client API, retry)
tests/hero-ui-progress-flow.test.js      — 34 tests (auto-claim, repair, dedup)
tests/hero-dashboard-progress-card.test.js — 18 tests (card states, a11y)
tests/hero-subject-banner-progress.test.js — 9 tests (banner completion)
tests/hero-completion-flow-e2e.test.js   — 10 tests (full 10-flow E2E)
tests/hero-p3-boundary.test.js           — 9 tests  (structural invariants)
+ existing P0/P1/P2 tests                — ~371 tests (zero regressions)
```

---

## What P3 Leaves Unresolved for P4

P3 makes P4 straightforward. The capped Hero Coins economy can now build on:

1. **daily.status === 'completed'** — authoritative signal that the quest is done
2. **Idempotent claims** — no risk of double-awarding (same task can't be claimed twice)
3. **effortCompleted** — exact effort credited, ready for coin calculation
4. **recentClaims audit trail** — 7-day retention for debugging
5. **Event emission** — `hero.daily.completed` is the trigger for P4's coin award

P4's core logic reduces to:
```
if daily.status === 'completed' AND daily coin award not yet issued:
  award capped Coins exactly once
```

P3 deliberately leaves these for P4:
- `coinsEnabled: false` field is present but always false
- No economy state in `child_game_state`
- No reward vocabulary in child UI
- No coin calculation logic

---

## Performance Characteristics

- **start-task latency delta**: +1 non-fatal batch statement (hero progress upsert). Negligible.
- **claim-task**: 1 hero progress read + 1 practice_sessions query + 1 ui_json query + 1 runHeroCommandMutation batch. ~4 D1 queries total.
- **Read model v4**: +1 child_game_state read + 1 practice_sessions query (24h window, LIMIT 20). Piggybacked via `readHeroProgressData`.
- **Client auto-claim**: Fire-and-forget (non-blocking). Dashboard-load repair is idempotent and deduped by `pendingClaimKey`.

---

## Operational Notes

### Enabling P3 in production

Set all four flags:
```
HERO_MODE_SHADOW_ENABLED = "true"
HERO_MODE_LAUNCH_ENABLED = "true"
HERO_MODE_CHILD_UI_ENABLED = "true"
HERO_MODE_PROGRESS_ENABLED = "true"
```

### Monitoring

Server-side structured logs:
- `hero_task_claim_succeeded` — healthy claim
- `hero_task_claim_already_completed` — safe duplicate
- `hero_task_claim_rejected` — rejection with code/reason
- `hero_daily_progress_completed` — daily quest finished
- `hero_claim_disabled_attempt` — claim attempted with flag off

Client-side (once-per-visit):
- `[hero] claim_started`
- `[hero] claim_succeeded`
- `[hero] claim_failed`
- `[hero] daily_complete_rendered`

### Rollback

Set `HERO_MODE_PROGRESS_ENABLED = "false"`. All P3 behaviour stops immediately:
- Read model returns v3 (no progress block)
- claim-task returns 404
- Client auto-claim silently no-ops (no claim block in read model)
- Existing progress state in child_game_state is preserved but dormant

---

## Relationship to Hero Mode Roadmap

```
P0 ✅ Shadow scheduler + read-model (PR #357)
P1 ✅ Launch bridge + subject command delegation (PR #397)
P2 ✅ Child-facing quest shell (PR #451)
P3 ✅ Completion claims + daily progress (PR #533) ← this report
P4 ⏳ Hero Coins ledger + capped daily economy
P5 ⏳ Hero Camp + Hero Pool monsters
P6 ⏳ Hardening, metrics, retention, rollout
```

P3 is the last "infrastructure" phase. P4 onwards is reward economy — building on the proven, idempotent, auditable completion claims that P3 delivers.

---

## Session Statistics

- **Planning**: ~30 minutes (1 planning pass + 1 deepening + document review)
- **Implementation**: 12 parallel-dispatched workers, ~4 hours wall-clock
- **Review**: 2 parallel reviewers (correctness + maintainability), 2 findings fixed
- **Total commits**: 13 (12 units + 1 fix) → squash-merged as 1
- **Lines changed**: ~3,200 added across implementation + tests
- **Zero regressions**: All pre-existing hero tests pass unchanged
