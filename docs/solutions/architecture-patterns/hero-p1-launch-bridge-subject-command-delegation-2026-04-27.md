---
title: Hero P1 launch bridge — delegating to an existing command pipeline without becoming a parallel system
date: "2026-04-27"
category: architecture-patterns
module: hero-mode
problem_type: architecture_pattern
component: service_object
severity: high
applies_when:
  - "A shadow/read-only subsystem needs to trigger real actions through an existing command pipeline"
  - "A new feature must delegate to an established command boundary without becoming a parallel system"
  - "Cross-system launch requires server-side recomputation to avoid trusting client state"
  - "The existing pipeline has security, idempotency, and rate-limiting that must not be bypassed"
tags:
  - hero-mode
  - launch-bridge
  - subject-command
  - dispatch-ownership
  - active-injection
  - cross-system-boundary
  - shadow-to-launch-evolution
  - structural-boundary-tests
---

# Hero P1 launch bridge — delegating to an existing command pipeline without becoming a parallel system

## Context

Hero Mode P0 proved that a cross-subject platform orchestrator could compute a daily quest without writing to any persistent state — the "read-only shadow subsystem" pattern documented in `docs/solutions/architecture-patterns/hero-p0-read-only-shadow-subsystem-2026-04-27.md`. But P0 could not answer the next question: can a selected Hero task actually start a real subject session safely?

P2 (child-facing UI) needs a working launch path before a UI can be built. P3 (Coins ledger) needs a proven subject-command bridge before completion claims can be wired. The core engineering risk was that Hero Mode could become a parallel command system — a second subject write pipeline inside `worker/src/hero/` that duplicates idempotency, CAS guards, rate-limiting, demo protection, and mutation receipts from `worker/src/app.js`.

P1's job was to prove that Hero can launch subject sessions through the existing command infrastructure, carrying an opaque tracing context (`heroContext`), without Hero owning any of the dispatch. PR #397 shipped this proof with 228 tests, 9 commits, and zero Hero-owned persistent state writes.

## Guidance

### 1. Structure A: app owns dispatch

The origin document (§13) offered three dispatch structures. Structure A was chosen: `resolveHeroStartTaskCommand()` in `worker/src/hero/launch.js` returns a `{ heroLaunch, subjectCommand }` pair, but the actual `repository.runSubjectCommand(subjectRuntime.dispatch)` call stays in `worker/src/app.js`. This means the entire `worker/src/hero/` directory tree has zero imports from `worker/src/subjects/runtime.js`.

The boundary is enforced by structural tests (S-L1, S-L2 in `tests/hero-launch-boundary.test.js`) that scan every `.js` file in the hero directories for forbidden import strings. If a future developer adds a direct subject import, CI fails immediately.

Structure B (injected dispatcher) was rejected because an injected function hides the import chain from static scanning. Structure C (direct import) was forbidden outright.

### 2. Launch adapter pattern — the reverse of providers

P0 introduced **providers** that translate subject read-models into Hero task envelopes (subject → Hero). P1 introduced **launch adapters** that translate Hero task envelopes back into subject `start-session` payloads (Hero → subject).

Adapters live at `worker/src/hero/launch-adapters/{spelling,grammar,punctuation}.js` — each is a pure `LAUNCHER_TO_MODE` lookup returning `{ launchable, subjectId, payload: { mode } }` or `{ launchable: false, reason }`. They are 12–13 lines each. No state mutation, no subject runtime imports, no side effects. If a launcher cannot be safely mapped, the adapter returns `launchable: false` rather than silently swallowing the error.

This creates a clean symmetry with the provider layer:

```
Provider:  subject read-model  →  Hero task envelopes
Adapter:   Hero task envelope  →  subject start-session payload
```

The scheduler decides *what kind* of learning moment is needed. The adapter decides *how* to express that as a subject command. The subject engine decides *what specific content* to serve. No layer crosses into another's authority.

### 3. Server-side quest recomputation on every launch (CAS semantics)

On every `POST /api/hero/command`, the server reads the learner's current subject state, runs all providers and the full scheduler, produces a fresh quest with fresh task IDs, then validates the client's `questId` and `taskId` against that fresh quest (`worker/src/hero/launch.js` lines 74–98).

If the quest has changed → 409 `hero_quest_stale`. If the task is missing → 404 `hero_task_not_found`. If the task exists but is not launchable → 409 `hero_task_not_launchable`. The client is never trusted to supply `subjectId` or `payload` — those fields are explicitly rejected.

This costs approximately 2× the D1 reads of a direct subject command (one for quest recomputation, one for the subject command's own state read), but prevents stale launches where a cached quest no longer reflects the learner's current state. The scheduler version bump (`hero-p0-shadow-v1` → `hero-p1-launch-v1`) provides version-level staleness defence.

### 4. heroContext active injection — not contamination prevention

The initial plan framed the subject engine work as "extract-before-normalise" to prevent `heroContext` from contaminating subject normalisers. The feasibility reviewer disproved this: all three subject normalisers are whitelist-based.

- Punctuation's `normalisePunctuationPrefs` outputs only `{mode, roundLength}`
- Grammar constructs session state from explicit named fields
- Spelling's `startOptionsFromPayload` extracts only 7 named fields

Unknown payload keys are silently discarded by all three paths. There was never a contamination risk. The real work was **active injection** — adding `heroContext` as a named field onto `transition.state.session` after `startSession` returns. The heroContext shape (15 fields including `source:'hero-mode'`, `phase:'p1-launch'`, `questFingerprint:null`) is built by `shared/hero/launch-context.js`, validated, and sanitised through a strict 15-key allowlist before entering the subject payload.

### 5. subjectCommand shape parity

The flow analysis reviewer discovered that `protectDemoSubjectCommand` buckets rate-limiting on `command.subjectId + command.command`. If the Hero path produced `command: 'start-task'` (the Hero command name) instead of `command: 'start-session'` (the subject command name), demo rate-limiting would create a separate bucket, allowing Hero to bypass per-session-type rate limits.

The fix: `resolveHeroStartTaskCommand` returns `{ command: 'start-session' }` — the subject command name, not the Hero command name. The full `subjectCommand` object matches exactly the shape that `normaliseSubjectCommandRequest` produces: `{ subjectId, command, learnerId, requestId, correlationId, expectedLearnerRevision, payload }`.

### 6. Flag interaction guard

Two independent flags: `HERO_MODE_SHADOW_ENABLED` (P0 GET route) and `HERO_MODE_LAUNCH_ENABLED` (P1 POST route). The launch route requires both. If launch is enabled but shadow is disabled, the API surface would be inconsistent (can launch but cannot read the quest), so the server returns 409 `hero_launch_misconfigured`.

### 7. Boundary test evolution

P0 had 8 boundary tests (6 structural + 2 behavioural). P1 extended with 7 more:

- **S-L1/S-L2**: `launch.js` and `launch-adapters/` do not import `subjects/runtime`
- **S-L3**: `shared/hero/` does not import `subjects/runtime` (extends P0 S2)
- **S-L4**: No economy vocabulary tokens (`coin`, `shop`, `deal`, `loot`, `streak loss`) in any Hero source
- **S-L5**: No client `src/` file imports from hero launch modules
- **B-L1**: `mutation_receipts` row count increases after launch (proves subject command path used)
- **B-L2**: Zero `hero.*` event types in `event_log` after launch (Hero created no events of its own)

The P0 invariant ("Hero writes nothing") evolved to P1's refined invariant ("Hero writes only through the existing subject command path; Hero-owned state remains zero").

## Why This Matters

Without this pattern, the most likely failure mode is Hero becoming a parallel command system. A developer under time pressure adds `import { dispatch } from '../subjects/runtime.js'` to `worker/src/hero/launch.js`, duplicating the mutation receipt path, the CAS check, the idempotency enforcement, the demo rate-limit bucketing, and the Punctuation exposure gate. Now there are two command systems, and they drift.

The demo write loophole that the flow analysis reviewer caught (command name `start-task` vs `start-session` creating separate rate-limit buckets) is exactly the kind of subtle security gap that emerges when a second path exists. Without server-side quest recomputation, stale cached quests could launch against changed subject data. Without the structural boundary tests, the import prohibition relies on code review vigilance alone.

## When to Apply

- A new subsystem needs to trigger mutations owned by an existing system
- The existing system has security, idempotency, and rate-limiting infrastructure that must not be bypassed
- The new system's authority boundary is different from the existing system's (Hero decides *what* to launch; the subject decides *what content* to serve)
- The bridge must be testable for boundary compliance at CI time, not just at review time
- The "app owns dispatch" structure works when there is a single route-level orchestrator (like `app.js`) that already calls the existing command pipeline

## Examples

**Anti-pattern — Hero directly dispatches to subject runtime (creates parallel command system):**

```js
// worker/src/hero/launch.js — WRONG
import { createWorkerSubjectRuntime } from '../subjects/runtime.js';

export async function handleHeroLaunch({ body, repository, env }) {
  const runtime = createWorkerSubjectRuntime(env);
  const result = await repository.runSubjectCommand(
    accountId, subjectCommand,
    () => runtime.dispatch(subjectCommand, { env })
  );
  return result;
}
```

**Correct pattern — Hero returns a command object, app.js dispatches through existing path:**

```js
// worker/src/hero/launch.js — CORRECT
// NO import from subjects/runtime — structural test S-L1 enforces this
export async function resolveHeroStartTaskCommand({ body, repository, env, now }) {
  // ... validation, quest recomputation, task matching, adapter lookup ...
  const subjectCommand = {
    subjectId: adapterResult.subjectId,
    command: 'start-session',      // subject command name, not hero command name
    learnerId, requestId, correlationId, expectedLearnerRevision,
    payload: { ...adapterResult.payload, heroContext },
  };
  return { heroLaunch, subjectCommand };
}
```

```js
// worker/src/app.js — dispatch stays here, same path as direct subject commands
const { heroLaunch, subjectCommand } = await resolveHeroStartTaskCommand({ body, repository, env, now });
requireSubjectCommandAvailable(subjectCommand, env);         // Punctuation gate
await protectDemoSubjectCommand({ command: subjectCommand }); // same rate-limit bucket
const result = await repository.runSubjectCommand(            // same CAS, same idempotency
  session.accountId, subjectCommand,
  () => subjectRuntime.dispatch(subjectCommand, { env, request, session, account, repository, now, capacity }),
);
return json({ ok: true, heroLaunch, ...result });
```

**Launch adapter — pure mapper, 13 lines, zero subject imports:**

```js
// worker/src/hero/launch-adapters/spelling.js
const LAUNCHER_TO_MODE = Object.freeze({
  'smart-practice': 'smart',
  'trouble-practice': 'trouble',
  'guardian-check': 'guardian',
});

export function mapToSubjectPayload(taskEnvelope) {
  const mode = LAUNCHER_TO_MODE[taskEnvelope?.launcher];
  if (!mode) return { launchable: false, reason: 'launcher-not-supported-for-subject' };
  return { launchable: true, subjectId: 'spelling', payload: { mode } };
}
```

## Related

- **Predecessor:** `docs/solutions/architecture-patterns/hero-p0-read-only-shadow-subsystem-2026-04-27.md` — P0 read-only shadow subsystem. P1 extends P0's no-write invariant: subject writes become expected (via the existing command pipeline), but Hero-owned writes remain forbidden.
- **Authority boundary parallel:** `docs/solutions/architecture-patterns/grammar-p5-100-star-evidence-curve-and-autonomous-sdlc-2026-04-27.md` — Grammar P5 uses a similar authority boundary: "engine owns evidence; reward layer reacts to committed signals only." Hero P1's "scheduler decides what; adapter decides how; subject decides content" mirrors this.
- **SDLC methodology:** `docs/solutions/workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md` — the autonomous SDLC cycle (serial workers → 3 parallel adversarial reviewers → review-fix → merge) used to implement P1.
- **Completion report:** `docs/plans/james/hero-mode/hero-mode-p1-completion-report.md`
- **PR:** #397
