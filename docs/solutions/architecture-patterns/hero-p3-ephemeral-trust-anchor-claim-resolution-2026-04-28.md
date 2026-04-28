---
title: "Hero P3: ephemeral trust anchor and claim resolution pattern"
date: 2026-04-28
category: architecture-patterns
module: hero-mode
problem_type: architecture_pattern
component: service_object
severity: high
applies_when:
  - "Transitioning a read-only orchestrator subsystem to write-capable"
  - "Trust anchor linking two entities is ephemeral and cleared on completion"
  - "Server-owned evidence of a relationship is nulled at session end"
  - "Idempotent progress tracking needed across unreliable client connections"
  - "Midnight-straddling events need a forward-only grace window"
related_components:
  - database
  - background_job
  - frontend_stimulus
tags:
  - hero-mode
  - trust-anchor
  - ephemeral-context
  - claim-resolver
  - child-game-state
  - d1-batch-atomicity
  - read-model
  - idempotency
  - shadow-to-production
  - forward-only-grace
---

# Hero P3: ephemeral trust anchor and claim resolution pattern

## Context

Hero Mode is a platform orchestrator that schedules daily learning tasks across subject engines (Spelling, Grammar, Punctuation). P0–P2 were entirely read-only — the Hero subsystem observed subject state but never wrote its own persistent state. P3 needed to transition to a write-capable system that could verify task completion, claim it exactly once, persist daily progress, and show authoritative results.

The critical blocker: heroContext (injected into subject sessions at start time with `questId`, `taskId`, `questFingerprint`) is completely CLEARED from all server-owned evidence when subject sessions complete. Subjects null out `state.session`, and `practice_sessions.session_state_json` is NULL on completion. After a session completes, there is zero server-owned evidence linking that session to Hero Mode.

The naive approach (client-driven claims or timing-based correlation) fails:
- Client-driven claims are trivially forgeable (security hole)
- Timing-based correlation (latest session for learner+subject) is gameable and unreliable
- Session state inspection races with subject cleanup
- Network drops, tab closes, and page refreshes lose all claim context

## Guidance

### The Three-Part Trust Anchor Pattern

**Part 1: Persist context at the subject boundary**

Subject engines copy relevant heroContext fields into `practice_sessions.summary_json` at completion time. This is additive metadata — no subject behaviour changes. The summary is built BEFORE `session` is nulled, so heroContext is still available.

```js
// shared/hero/launch-context.js
function extractHeroSummaryContext(session) {
  if (!session?.heroContext || session.heroContext.source !== 'hero-mode') return null;
  const ctx = session.heroContext;
  return {
    source: ctx.source,
    questId: ctx.questId || null,
    taskId: ctx.taskId || null,
    questFingerprint: ctx.questFingerprint || null,
    launchRequestId: ctx.launchRequestId || null,
  };
}

// In each subject engine's completion path (Grammar, Spelling, Punctuation):
const summary = {
  ...existingSummaryFields,
  heroContext: extractHeroSummaryContext(state.session),
};
// Then state.session = null (heroContext survives in summary)
```

**Part 2: Register intent at command time**

`start-task` writes a progress marker (`task.status = 'started'`) to hero progress state (`child_game_state` under `system_id='hero-mode'`). This creates a server-side "in-flight" signal — the first half of the evidence pair.

```js
// In start-task handler, after subject command succeeds:
const state = markTaskStarted(heroProgressState, taskId, requestId, nowTs);
await batch(db, [buildHeroProgressUpsertStatement(db, learnerId, accountId, state, nowTs, null)]);
```

The progress write is non-fatal (try/catch with logging). If it fails, the claim flow still works — just `pendingCompletedHeroSession` detection in the read model degrades gracefully.

**Part 3: Cross-reference at claim time**

The claim resolver finds the progress marker (status='started') and matches it with a completed `practice_sessions` row whose `summary_json.heroContext` has matching `questId`, `taskId`, and `questFingerprint`. This proves the session was both Hero-launched AND completed.

```js
// worker/src/hero/claim.js — pure resolver (receives pre-loaded data)
function resolveHeroClaimCommand({ body, heroProgressState, practiceSessionRows, nowTs }) {
  // 1. Validate request (forbidden fields, required fields)
  // 2. Check already-completed (idempotent)
  // 3. Verify task exists in progress state with status='started'
  // 4. Verify dateKey + 2h grace window
  // 5. Find matching practice_sessions row:
  for (const row of practiceSessionRows) {
    if (row.status !== 'completed') continue;
    const summary = JSON.parse(row.summary_json);
    if (summary?.heroContext?.questId === body.questId &&
        summary?.heroContext?.taskId === body.taskId &&
        summary?.heroContext?.questFingerprint === body.questFingerprint) {
      return { ok: true, status: 'claimed', practiceSessionId: row.id, ... };
    }
  }
  return { ok: false, code: 'hero_claim_no_evidence' };
}
```

### Supporting Patterns

**Mutation safety (runHeroCommandMutation):**
Parallels `runSubjectCommandMutation` — receipt lookup (LEFT JOIN with learner_profiles), CAS guard on `state_revision`, batch write (progress upsert + receipt + revision bump). Uses `batch(db, [...])` for D1 atomicity. Simpler than subject mutations: no projection context, no retry loop, no subject runtime write.

**Idempotency (two-layer):**
- Same `requestId` → replay stored response from `mutation_receipts` (server-side dedup via LEFT JOIN)
- Different `requestId` for same completed task → detect `task.status === 'completed'` → return `already-completed` without double-counting effort

**Read model v4 (four-source merge):**
Merges scheduled quest (deterministic) + persisted progress (hero state) + active session (ui_json) + pending completed (practice_sessions cross-reference). Completed tasks survive quest recomputation (anchored by stable taskId).

**Dual claim delivery:**
- Auto-claim: fires immediately after `isHeroSessionTerminal(subjectId, phase, sessionPresent)` detects completion in the subject command response
- Dashboard-load repair: on every read-model load, checks `pendingCompletedHeroSession` → auto-claims
- `pendingClaimKey` deduplication prevents double-firing

**Feature flag hierarchy (progressive enablement):**
```
SHADOW → LAUNCH → CHILD_UI → PROGRESS
```
Each flag requires all predecessors. PROGRESS defaults to false. Disabling PROGRESS reverts to read-only mode with zero data corruption — existing progress state is preserved but dormant.

**Grace window (forward-only, 2 hours):**
A task's `heroContext.dateKey` is authoritative. Claims apply to that date. The window extends 2 hours past the dateKey's midnight — allowing tasks started at 23:50 to be claimed at 00:30. Tasks from days ago are rejected.

## Why This Matters

The shadow-to-production transition is a common pattern in progressive feature delivery. The naive approach (just add writes!) fails when the trust anchor is ephemeral. Without this pattern:

- **Security**: Client-driven claims without server evidence are trivially forgeable
- **Reliability**: Race conditions between session cleanup and evidence lookup cause silent data loss
- **Resilience**: Network drops, tab closes, and page refreshes permanently lose progress

The three-part trust anchor pattern solves all three by ensuring server-owned evidence exists at every lifecycle boundary. Each piece is independently verifiable: the progress marker proves intent, the summary_json proves Hero-originated completion, and the cross-reference proves both happened for the same task.

The pattern also enables self-healing: any dashboard load discovers and claims completed-but-unclaimed tasks automatically via the read model's `pendingCompletedHeroSession` detection.

## When to Apply

- Transitioning any read-only orchestrator subsystem to write-capable
- When the subsystem delegates work to another engine that owns session lifecycle and cleanup
- When trust evidence is ephemeral (attached to session state that gets cleared on completion)
- When idempotent progress tracking is needed across unreliable client connections
- When you need claim repair (catching up after network failures, tab closes, page refreshes)
- When midnight/date boundaries create grace-window requirements

## Examples

**Before (P2 — no evidence after completion):**

```
start-task → heroContext injected into session
session completes → session = null, heroContext GONE
dashboard loads → "was this task completed?" → NO WAY TO KNOW
```

**After (P3 — trust anchor chain):**

```
start-task → heroContext injected + progress marker written (status:'started')
session completes → heroContext copied to summary_json (persists permanently)
claim-task → match progress marker + summary heroContext → VERIFIED
dashboard loads → read model v4 merges progress → AUTHORITATIVE
```

**Failure recovery (self-healing):**

```
start-task → marker written
session completes → summary_json persisted
[network drop / tab close / page refresh]
dashboard loads → pendingCompletedHeroSession detected → auto-claim fires → progress recovered
```

**Boundary invariant evolution across phases:**

| Phase | Write boundary |
|-------|---------------|
| P0 | Hero writes nothing |
| P1 | Hero writes only through existing subject command path |
| P2 | Same as P1 (child UI is read-only) |
| P3 | Hero writes to child_game_state (hero-mode) + mutation_receipts + event_log via runHeroCommandMutation |

## Related

- `docs/solutions/architecture-patterns/hero-p0-read-only-shadow-subsystem-2026-04-27.md` — foundational no-write boundary (now evolved by P3)
- `docs/solutions/architecture-patterns/hero-p1-launch-bridge-subject-command-delegation-2026-04-27.md` — launch bridge and subject command delegation (direct predecessor)
- `docs/solutions/architecture-patterns/hero-p2-child-facing-orchestrator-shell-shadow-to-production-2026-04-28.md` — shadow-to-production patterns (P3 builds on Pattern 4: fingerprint leak prevention)
- `docs/solutions/architecture-patterns/admin-console-p4-hardening-truthfulness-adversarial-review-2026-04-27.md` — CAS + batch atomicity patterns reused by runHeroCommandMutation
- Memory: `project_d1_atomicity_batch_vs_withtransaction.md` — `batch()` is the only atomic write mechanism; `withTransaction` is a production no-op
- PR #533: feat(hero): Hero Mode P3 — completion claims and daily progress
