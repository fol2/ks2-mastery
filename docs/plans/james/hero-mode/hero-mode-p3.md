---
title: "Hero Mode P3 — Completion Claims and Daily Progress"
type: product-engineering-origin
status: draft
date: 2026-04-28
owner: james
intended_path: docs/plans/james/hero-mode/hero-mode-p3.md
phase: P3
origin: docs/plans/james/hero-mode/hero-mode-p2.md
previous_completion_report: docs/plans/james/hero-mode/hero-mode-p2-completion-report.md
---

# Hero Mode P3 — Completion Claims and Daily Progress

## 1. Guiding sentence

Hero Mode P3 makes Hero Quest progress authoritative.

P2 proved that a child can see today’s Hero Quest, start a safe Hero task, enter the normal subject session, and keep Hero context while working. P3 must now prove that the platform can verify a completed Hero-launched subject session, persist daily Hero task progress, show the child what is complete and what comes next, and do all of this without introducing Coins, Hero Camp, Hero monsters, streak pressure, shop language, or any subject mastery mutation.

P3 should answer this question:

> “Can a learner finish a Hero-launched subject round, return to the dashboard, and see authoritative Hero progress for today’s quest — with idempotent completion claims, no duplicate progress, and no reward economy?”

P3 is successful when the app can:

1. start a Hero task using the P2 flow;
2. let the subject engine own the session, marking, feedback, Stars, and mastery;
3. verify that a completed session was genuinely launched by Hero Mode;
4. claim that task exactly once;
5. persist daily Hero progress in a minimal Hero-owned state record;
6. show completed tasks, effort completed, and the next task on the dashboard;
7. survive refresh, duplicate claim, multi-tab, stale quest, and session-cleared cases;
8. keep all economy and monster growth deferred to later phases.

P3 is the first Hero phase that intentionally writes Hero-owned state. It is not the first economy phase.

---

## 2. P2 status and what P3 inherits

P2 should be treated as a strong foundation.

The P2 completion report says PR #451 shipped:

- Hero read model v3;
- deterministic non-null `questFingerprint`;
- child-safe `ui` gate and copy layer;
- `activeHeroSession` detection from subject `ui_json`;
- safe same-task relaunch and different-task conflict handling;
- `HeroQuestCard` on the dashboard;
- `HeroTaskBanner` on the subject surface;
- client Hero API wrapper;
- client `heroUi` state and launch actions;
- three-flag hierarchy: shadow, launch, child UI;
- 274 tests with zero regressions;
- zero Hero-owned persistent state writes;
- zero Coins, Hero Camp, completion claims, or Hero-owned state.

P2 also deliberately left four things unresolved for P3:

1. post-session active-session confusion: after a subject completes, `activeHeroSession` may disappear or remain depending on subject cleanup;
2. `lastLaunch` lifecycle: currently it is only non-persistent UI state and is cleared on dashboard navigation;
3. midnight/dateKey edge cases: several `now()` calls still exist in related paths, and a request can straddle midnight;
4. completion authority: P2 cannot know whether a Hero task is complete because it has no claim endpoint and no Hero progress state.

P3’s job is to resolve those issues cleanly.

---

## 3. Strategic decision: P3 is progress, not economy

P3 must not jump straight to Coins.

The earlier Hero Mode design principle remains unchanged:

> learning first, rewards second.

Hero Mode exists to guide children into scientifically useful daily practice across ready subjects. The reward system must never distort subject learning, encourage rushing, or turn the product into “daily clicking for currency.”

Therefore P3 should introduce:

- completion claims;
- daily progress state;
- task completion status;
- effort completed;
- a stable return-to-Hero flow;
- progress-only copy;
- progress-only audit events if implemented.

P3 must not introduce:

- Coins;
- balance;
- spending;
- Hero monster ownership;
- Hero Camp;
- unlock/evolve actions;
- streak rewards;
- shops;
- limited-time deals;
- random rewards;
- reward claiming;
- per-question currency;
- subject Stars awarded by Hero.

This means P3 is allowed to say:

> “Nice work — this Hero task is complete.”

P3 is not allowed to say:

> “You earned 100 Coins.”

P4 can add the economy only after P3 proves task completion is reliable and idempotent.

---

## 4. P3 scope

P3 has six product/engineering outcomes.

### 4.1 Authoritative completion claim

P3 adds a new Hero command:

```txt
POST /api/hero/command
command: 'claim-task'
```

The command verifies that a completed subject session belongs to the same learner and carries a trusted Hero context created by the P1/P2 `start-task` bridge.

A task is complete for Hero only after the Worker validates the evidence. The client must not mark Hero tasks complete by local assumption alone.

### 4.2 Minimal persistent Hero daily progress

P3 introduces a small Hero-owned state record for daily progress. It should live in existing platform storage, preferably `child_game_state` under a single system id such as `hero-mode`, unless the implementation-planning agent finds an existing stronger platform state store.

P3 should not add new D1 tables.

The state stores today’s quest identity, task statuses, completed effort, and claim evidence. It does not store Coins, balance, purchases, monster ownership, or reward state.

### 4.3 Read model v4

P3 evolves the Hero read model to version 4.

Read model v4 should merge:

1. the deterministic scheduled quest from P2;
2. persisted Hero daily progress from P3;
3. active session detection from P2;
4. pending completed-but-unclaimed evidence when available.

The dashboard should no longer guess whether a task is complete.

### 4.4 Child-facing daily progress UI

P3 updates `HeroQuestCard` so a child can see:

- effort planned;
- effort completed;
- completed task count;
- current task status;
- next task;
- “Continue” when a Hero session is in progress;
- “Task complete” once the Worker has accepted the claim;
- “Today’s Hero Quest complete” once all planned effort/tasks are complete.

The copy remains learning-first and economy-free.

### 4.5 Return-to-Hero flow

When a Hero-launched subject session completes, the child should be gently returned to the Hero Quest context.

P3 should support at least one reliable path:

- automatic claim after a subject session reports completion;
- claim-on-dashboard-load if a completed unclaimed Hero session is detected;
- manual fallback CTA such as `Check Hero progress` if automatic claim cannot run.

The child should not need to understand the word “claim.” That is an internal command name.

### 4.6 Completion telemetry and safety tests

P3 must add tests and lightweight structured logs for:

- task claim succeeded;
- task claim replayed / already complete;
- task claim rejected;
- daily quest complete;
- duplicate claim prevented;
- cross-learner claim rejected;
- stale fingerprint / stale quest handling;
- midnight/dateKey grace handling;
- no economy vocabulary in child UI.

---

## 5. P3 non-goals

P3 does not include:

1. Hero Coins;
2. Hero balance;
3. Coin ledger;
4. spending;
5. Hero Camp;
6. Hero monster registry;
7. monster unlock/evolve UI;
8. branch choices;
9. refund/undo economy;
10. streak rewards;
11. parent reward controls;
12. random rewards;
13. shop/deal copy;
14. subject Stars awarded by Hero;
15. subject mastery changes from Hero;
16. item-level Hero scheduler;
17. six-subject Hero expansion;
18. changes to Grammar/Punctuation 100-Star semantics;
19. new D1 Hero tables;
20. offline-first Hero queueing beyond safe retry/refetch behaviour.

P3 may add Hero-owned state and progress events. That is the intentional boundary change from P2. It must not add economy state.

---

## 6. Current repo context P3 must respect

### 6.1 Shared Hero layer

The shared layer currently contains pure Hero modules such as constants, scheduler, eligibility, task envelopes, launch context, launch status, quest fingerprinting, and child-safe copy.

P3 may add pure progress helpers here, for example:

```txt
shared/hero/progress-state.js
shared/hero/claim-contract.js
shared/hero/completion-status.js
```

These files must remain pure. They must not import Worker code, repository code, React, D1 primitives, subject runtime, or browser-specific APIs.

### 6.2 Worker Hero layer

The Worker Hero layer currently owns:

```txt
worker/src/hero/read-model.js
worker/src/hero/routes.js
worker/src/hero/launch.js
worker/src/hero/providers/
worker/src/hero/launch-adapters/
```

P3 should add or evolve Worker modules for completion:

```txt
worker/src/hero/claim.js
worker/src/hero/progress-state.js
worker/src/hero/progress-read-model.js
```

Names may vary, but the separation should stay clear:

- `launch.js` resolves a Hero task into a subject `start-session` command;
- `claim.js` verifies a completed Hero-launched session and resolves a Hero progress mutation;
- `read-model.js` assembles the child-visible Hero model;
- repository functions perform persistent reads/writes.

Hero Worker files must still not import `worker/src/subjects/runtime.js` directly. Dispatch ownership remains in `worker/src/app.js`.

### 6.3 Existing command route

`POST /api/hero/command` currently supports only `start-task`.

P3 extends this route to support `claim-task`.

The route must still reject client-supplied `subjectId` and `payload` for Hero commands. The client may provide IDs required to identify the Hero task and optional session evidence, but the Worker must derive the expected subject/task from trusted Hero context and persisted subject/session data.

### 6.4 Existing platform storage

The platform already has generic learner-scoped storage:

- `child_subject_state` for subject-owned state;
- `child_game_state` for platform/game state by `system_id`;
- `practice_sessions` for subject practice history;
- `event_log` for domain/audit events;
- `mutation_receipts` for request idempotency.

P3 should use these existing tables. Do not add `hero_tasks`, `hero_quests`, `hero_sessions`, or `hero_state` tables in P3.

The preferred state location is:

```txt
child_game_state
learner_id = <learnerId>
system_id = 'hero-mode'
state_json = HeroModeProgressState
```

The implementation-planning agent should inspect the current repository helpers before choosing exact function names, but the principle is fixed: Hero daily progress is platform/game state, not subject state.

---

## 7. Product semantics

### 7.1 What “complete” means

A Hero task is complete when:

1. the subject session was started through Hero Mode;
2. the session carries `heroContext.source === 'hero-mode'`;
3. the session’s `heroContext.questId`, `questFingerprint`, and `taskId` match the claim;
4. the session belongs to the same learner;
5. the session belongs to the expected ready subject;
6. the subject engine has reached a completed state or persisted a completed practice session summary;
7. the Worker has recorded the claim in Hero progress state.

Correctness should not be the primary completion gate. P3 is claiming honest completion of the subject round, not awarding mastery. The subject engine still decides Stars, feedback, support policy, and mastery.

### 7.2 What “effort complete” means

P3 should count effort at the task-envelope level, not raw question count.

If a task has `effortTarget: 6`, completing that Hero-launched task adds 6 effort units to today’s Hero progress.

Do not count every question. Do not count every click. Do not use raw correct answers as Hero progress.

### 7.3 What “daily complete” means

A daily Hero Quest is complete when one of these conditions is true:

1. all scheduled Hero tasks are completed; or
2. `effortCompleted >= effortPlanned` with no remaining required tasks.

The implementation-planning agent should choose one canonical rule and test it. The safest P3 rule is task-completion-based because P2 tasks are envelope-level and scheduled in a small daily set.

Recommended P3 rule:

```txt
Daily complete = every planned task in the daily quest has completionStatus === 'completed'.
```

P4 can later translate daily completion into capped Coins.

### 7.4 What P3 does not mean

Completing a Hero task does not mean:

- the child earned Coins;
- a monster evolved;
- subject Stars changed because of Hero;
- Mega status changed because of Hero;
- the child must keep playing;
- failure should be punished.

Subject engines remain the learning authority.

---

## 8. Minimal Hero progress state shape

P3 should introduce a versioned Hero progress state.

This shape is intentionally smaller than the eventual economy state.

```ts
type HeroModeProgressState = {
  version: 1;

  daily: {
    dateKey: string;
    timezone: string;
    questId: string;
    questFingerprint: string;
    schedulerVersion: string;
    copyVersion: string;

    status: 'active' | 'completed' | 'expired';

    effortTarget: number;
    effortPlanned: number;
    effortCompleted: number;

    taskOrder: string[];
    completedTaskIds: string[];

    tasks: Record<string, HeroProgressTask>;

    generatedAt: number;
    firstStartedAt: number | null;
    completedAt: number | null;
    lastUpdatedAt: number;
  } | null;

  recentClaims: Array<HeroClaimRecord>;
};

type HeroProgressTask = {
  taskId: string;
  questId: string;
  questFingerprint: string;
  dateKey: string;

  subjectId: 'spelling' | 'grammar' | 'punctuation' | string;
  intent: string;
  launcher: string;
  effortTarget: number;

  status: 'planned' | 'started' | 'completed' | 'blocked';

  launchRequestId: string | null;
  claimRequestId: string | null;

  startedAt: number | null;
  completedAt: number | null;

  subjectPracticeSessionId: string | null;

  evidence: {
    source: 'practice-session' | 'subject-ui-json' | 'subject-summary' | 'unknown';
    sessionStatus: string | null;
    summaryStatus: string | null;
    subjectId: string;
    heroContextPhase: string | null;
  } | null;
};

type HeroClaimRecord = {
  claimId: string;
  requestId: string;
  learnerId: string;
  dateKey: string;
  questId: string;
  questFingerprint: string;
  taskId: string;
  subjectId: string;
  practiceSessionId: string | null;
  result: 'claimed' | 'already-completed' | 'rejected';
  reason: string | null;
  createdAt: number;
};
```

### 8.1 Important state constraints

The state must not include:

```txt
coins
coinBalance
totalEarned
totalSpent
shop
purchase
monsterOwnership
monsterStage
monsterBranch
streakReward
```

If the implementation needs to reserve a future economy field, use a clearly disabled metadata flag instead:

```js
futureEconomy: {
  enabled: false
}
```

But the preferred P3 design is to omit economy state entirely.

### 8.2 State migration rule

P3 should tolerate missing, empty, malformed, or older Hero progress state.

`normaliseHeroProgressState(raw)` should return a valid empty state instead of throwing in child-visible paths. Corrupt state should be logged and ignored or repaired safely.

### 8.3 Date rollover rule

Hero daily progress is date-keyed. A new `dateKey` starts a new daily state.

However, a task launched shortly before midnight should still be claimable shortly after midnight. P3 should include a grace rule.

Recommended rule:

```txt
A task can be claimed for the dateKey in its trusted heroContext if:
- the session heroContext dateKey matches the claim dateKey; and
- now is within a short grace window after that dateKey ends, for example 2 hours.
```

The exact grace window should be configurable or at least centralised in a constant.

---

## 9. Claim command contract

P3 extends `POST /api/hero/command` with `claim-task`.

### 9.1 Request body

Recommended request body:

```ts
type HeroClaimTaskRequest = {
  command: 'claim-task';

  learnerId: string;
  questId: string;
  questFingerprint: string;
  taskId: string;

  requestId: string;
  correlationId?: string;
  expectedLearnerRevision: number;

  // Optional evidence hints. These help lookup but are never trusted alone.
  practiceSessionId?: string;
  subjectSessionId?: string;
};
```

The client must still not send:

```txt
subjectId
payload
coins
reward
```

If `subjectId` or `payload` is supplied, the route should reject the request just as P2 rejects them for `start-task`.

### 9.2 Response body

Recommended successful response:

```ts
type HeroClaimTaskResponse = {
  ok: true;
  heroClaim: {
    version: 1;
    status: 'claimed' | 'already-completed';
    learnerId: string;
    dateKey: string;
    questId: string;
    questFingerprint: string;
    taskId: string;
    subjectId: string;
    effortCredited: number;
    effortCompleted: number;
    effortPlanned: number;
    dailyStatus: 'active' | 'completed';
    coinsEnabled: false;
    heroStatePersistenceEnabled: true;
  };
  hero: HeroReadModelV4;
};
```

Recommended rejected response codes:

```txt
hero_claim_disabled
hero_claim_misconfigured
hero_claim_learner_required
hero_claim_quest_required
hero_claim_task_required
hero_claim_fingerprint_required
hero_claim_no_evidence
hero_claim_evidence_not_completed
hero_claim_evidence_mismatch
hero_claim_cross_learner_rejected
hero_claim_stale_or_expired
hero_claim_task_not_in_quest
hero_claim_already_completed
hero_quest_stale
hero_quest_fingerprint_mismatch
command_request_id_required
command_revision_required
stale_write
projection_unavailable
```

`hero_claim_already_completed` may be a 200 response with status `already-completed` when the duplicate is safe and refers to the same task/evidence. Reserve 409 for mismatches or unsafe conflicts.

### 9.3 Idempotency

`claim-task` must be idempotent in two ways.

First, same `requestId` replay must return the same response through `mutation_receipts`.

Second, a different `requestId` trying to claim the same `questId + taskId` after it has already been completed must return safe `already-completed` and must not double-count effort.

This second rule is crucial for multi-tab, refresh, retry-after-network-failure, and manual fallback flows.

---

## 10. Completion evidence lookup

The Worker must verify completion from server-owned data.

P3 should not rely on child-visible `HeroTaskBanner` state or client `lastLaunch` alone. Those are hints only.

### 10.1 Trust anchor

The trust anchor is the server-created `heroContext` injected by `start-task`.

A valid claim requires matching Hero context:

```txt
source === 'hero-mode'
questId === request.questId
taskId === request.taskId
questFingerprint === request.questFingerprint
learnerId belongs to the authenticated account
subjectId matches the expected task subject
```

### 10.2 Evidence sources

The claim resolver should check evidence in this order, or another order justified by the implementation plan:

1. `practice_sessions` rows for the learner, expected subject, and recent time window;
2. raw subject `ui_json` session/summary if the subject still holds completion state;
3. subject read model completion summary only if it is server-side and not child-muted;
4. no evidence → reject.

The resolver must handle both possibilities documented by P2:

- subject clears `ui_json.session` after completion;
- subject leaves a completed session in `ui_json.session`.

Practice session history is the stronger long-term source because it survives subject UI cleanup.

### 10.3 What counts as completed evidence

The exact field names vary by subject, so the implementation plan should inspect Spelling, Grammar, and Punctuation session summaries.

P3 should centralise this in one helper, for example:

```ts
normaliseHeroCompletionEvidence({ subjectId, practiceSessionRow, subjectUi })
```

It should return:

```ts
{
  found: boolean;
  completed: boolean;
  subjectId: string;
  practiceSessionId: string | null;
  heroContext: object | null;
  sessionStatus: string | null;
  summaryStatus: string | null;
  reason: string | null;
}
```

Avoid copying subject-specific completion checks into route handlers.

### 10.4 Subject-specific caution

Punctuation has specialised client response handling for reward projections in normal subject flow. P2 intentionally used the generic subject command result path only for `start-session`, because starting a session does not generate reward projections.

P3 claim commands are Hero commands, not subject commands. They should return an updated Hero read model and possibly Hero progress events. If the client auto-claims after a Punctuation session completes, the implementation must ensure the existing Punctuation subject completion flow still uses its specialised path for subject toasts/celebrations. Do not replace Punctuation subject response handling with generic Hero response handling.

---

## 11. Worker route and repository requirements

### 11.1 Route gates

P3 should introduce a separate flag:

```txt
HERO_MODE_PROGRESS_ENABLED=false
```

The full child-visible progress path requires:

```txt
HERO_MODE_SHADOW_ENABLED=true
HERO_MODE_LAUNCH_ENABLED=true
HERO_MODE_CHILD_UI_ENABLED=true
HERO_MODE_PROGRESS_ENABLED=true
```

If progress is disabled:

- `GET /api/hero/read-model` may still return the P2-style child UI model;
- `POST /api/hero/command` with `claim-task` must return 404 or a typed disabled error;
- the UI must not show authoritative progress or task completion.

### 11.2 Auth and mutation safety

`claim-task` mutates Hero progress state. It must use the same mutation safety principles as production subject commands:

- authenticated session required;
- same-origin required;
- mutation capability required;
- learner write access required;
- expected learner revision required;
- request idempotency required;
- stale write rejection required;
- demo policy respected;
- response stored in `mutation_receipts`;
- no hidden server-side merge outside the repository mutation boundary.

P2 `start-task` delegates writes to `repository.runSubjectCommand(...)`. P3 needs an equivalent Hero-owned mutation path, for example:

```txt
repository.runHeroCommand(accountId, heroCommand, handler)
```

The exact function name can differ, but the behaviour must be equivalent.

Do not perform raw D1 writes directly from `worker/src/hero/claim.js` or `worker/src/app.js`.

### 11.3 Expected writes

P3 intentionally changes the P2 no-write boundary.

Allowed P3 writes:

- `child_game_state` row for `system_id = 'hero-mode'`;
- `mutation_receipts` for `claim-task` idempotency;
- `event_log` entries for non-reward Hero progress events, if implemented;
- learner revision bump if consistent with existing mutation safety;
- capacity/logging metrics if already supported by platform patterns.

Forbidden P3 writes:

- subject Stars from Hero;
- Grammar/Punctuation/Spelling mastery changes from Hero;
- `child_subject_state` writes except through normal subject commands unrelated to claiming;
- Coins state;
- Hero monster state;
- shop/purchase state;
- new D1 Hero tables;
- reward projections that look like subject rewards.

### 11.4 Allowed P3 events

P3 may introduce these Hero events:

```txt
hero.task.completed
hero.daily.completed
```

They are progress/audit events only.

P3 must not introduce:

```txt
hero.coins.awarded
hero.coins.spent
hero.monster.unlocked
hero.monster.evolved
reward.hero.*
```

If the implementation chooses not to emit events in P3, the daily progress state must still be auditable enough to support P4 and P6 metrics. The preferred design is to emit the two non-reward progress events through the same mutation path as the progress state update.

---

## 12. Read model v4

P3 should evolve the Hero read model to version 4.

Recommended shape:

```ts
type HeroReadModelV4 = {
  version: 4;
  mode: 'progress';
  childVisible: boolean;
  coinsEnabled: false;
  writesEnabled: true;

  dateKey: string;
  timezone: string;
  schedulerVersion: string;
  questFingerprint: string;

  eligibleSubjects: Array<{ subjectId: string; reason: string }>;
  lockedSubjects: Array<{ subjectId: string; reason: string }>;

  dailyQuest: {
    questId: string;
    status: 'active' | 'completed' | 'unavailable';
    effortTarget: number;
    effortPlanned: number;
    effortCompleted: number;
    taskCount: number;
    completedTaskCount: number;
    tasks: Array<HeroReadModelTaskV4>;
  };

  progress: {
    enabled: boolean;
    stateVersion: number;
    dateKey: string;
    status: 'none' | 'active' | 'completed' | 'expired';
    effortCompleted: number;
    effortPlanned: number;
    completedTaskIds: string[];
    justCompletedTaskId: string | null;
    canClaim: boolean;
    pendingClaimTaskId: string | null;
  };

  launch: {
    enabled: boolean;
    commandRoute: '/api/hero/command';
    command: 'start-task';
    claimEnabled: boolean;
    heroStatePersistenceEnabled: boolean;
  };

  claim: {
    enabled: boolean;
    commandRoute: '/api/hero/command';
    command: 'claim-task';
  };

  ui: {
    enabled: boolean;
    surface: 'dashboard-card';
    reason: string;
    copyVersion: string;
  };

  activeHeroSession: ActiveHeroSession | null;
  pendingCompletedHeroSession: PendingCompletedHeroSession | null;
};
```

Recommended per-task additions:

```ts
type HeroReadModelTaskV4 = HeroReadModelTaskV3 & {
  completionStatus: 'not-started' | 'in-progress' | 'completed' | 'completed-unclaimed' | 'blocked';
  completedAt: number | null;
  effortCompleted: number;
  canClaim: boolean;
};
```

### 12.1 Merging scheduled tasks with persisted progress

The read model must merge scheduled tasks with persisted progress by stable `taskId`.

If a task exists in progress state but is absent from today’s recomputed scheduled quest, the read model should not discard it silently. This can happen if subject state changed after launch or completion. The read model should preserve completed progress and surface a safe debug reason internally.

Child-visible behaviour should be simple:

- completed task remains complete;
- next launchable task comes from the current scheduled quest minus completed tasks;
- stale/orphan tasks do not appear as new tasks to repeat.

### 12.2 Pending completed session

If the Worker detects a completed Hero-launched session that is not yet claimed, read model v4 should expose a child-safe pending claim indicator:

```ts
pendingCompletedHeroSession: {
  taskId: string;
  questId: string;
  questFingerprint: string;
  subjectId: string;
  practiceSessionId: string | null;
} | null
```

The client can use this to auto-claim or show a gentle fallback CTA.

Do not expose raw session state or debug scheduling internals to the child browser.

---

## 13. Client requirements

### 13.1 Hero client

`src/platform/hero/hero-client.js` should add:

```ts
claimTask({
  learnerId,
  questId,
  questFingerprint,
  taskId,
  requestId,
  practiceSessionId,
  subjectSessionId
})
```

The client must still:

- never send `subjectId`;
- never send `payload`;
- include `expectedLearnerRevision`;
- use typed `HeroModeClientError`;
- trigger stale/refetch callback for stale quest/fingerprint errors;
- never auto-retry stale claims without a read-model refresh.

### 13.2 Main runtime actions

P3 should add app actions similar to:

```txt
hero-claim-task
hero-auto-claim-current-task
hero-read-model-refresh-after-claim
```

The names can vary.

The runtime should claim after completion through one of these patterns:

1. observe a subject command response that clearly indicates session completion and matches `heroUi.lastLaunch`;
2. on dashboard navigation/load, inspect read model v4 for `pendingCompletedHeroSession` and auto-claim;
3. use a manual fallback CTA if automatic claim fails safely.

The most robust P3 design is to support both automatic claim and dashboard-load claim. The automatic path gives a smooth child experience; the dashboard-load path repairs lost client state, refreshes, and multi-tab cases.

### 13.3 Hero UI state

`heroUi` should remain non-persistent on the client. Persistent progress lives on the Worker side.

Client state can include:

```ts
{
  status: 'idle' | 'loading' | 'ready' | 'launching' | 'claiming' | 'error';
  pendingTaskKey: string;
  pendingClaimKey: string;
  lastLaunch: object | null;
  lastClaim: object | null;
  readModel: HeroReadModelV4 | null;
  error: string;
}
```

Client state must not include an authoritative completed task list independent from the server read model.

### 13.4 Dashboard card update

`HeroQuestCard` should show progress only when `readModel.progress.enabled === true` and `readModel.childVisible === true`.

Recommended states:

1. disabled/unavailable → return null; existing fallback remains;
2. loading → return null or a non-blocking placeholder;
3. ready/not-started → show next task and `Start Hero Quest`;
4. in-progress → show `Continue Hero task`;
5. completed-unclaimed → show “Checking your Hero progress…” or a fallback button;
6. claiming → disable CTA with `aria-busy="true"`;
7. task claimed → show “Task complete” and next task;
8. daily complete → show “Today’s Hero Quest is complete” and no pressure to continue;
9. stale/error → show gentle refresh copy with `aria-live="polite"`.

Copy must remain economy-free.

### 13.5 Subject banner update

`HeroTaskBanner` can remain quiet, but it should be able to reflect completion if the client knows the task is complete from the server read model.

Examples:

```txt
Hero Quest task: Grammar — weak repair
This round is part of today’s Hero Quest.
```

After completion:

```txt
Hero task complete. Return to your Hero Quest for the next round.
```

Do not show reward copy.

---

## 14. Child copy guidance

P3 copy should focus on completion and next step.

Good copy:

```txt
Task complete.
Nice work — your Hero Quest has moved forward.
Next Hero task is ready.
Today’s Hero Quest is complete.
You kept your ready subjects strong today.
Checking your Hero progress…
Your Hero Quest refreshed. Try the next task now.
```

Avoid copy that implies economy, pressure, or punishment:

```txt
Claim your reward.
Earn Coins.
Don’t lose your streak.
Daily deal.
Limited time.
Grind more.
You missed out.
Unlock now.
Spend now.
Jackpot.
```

P3 should extend `HERO_FORBIDDEN_VOCABULARY` if new copy introduces risk.

The word `claim` is acceptable in internal command names and tests. It should not appear in child UI copy.

---

## 15. Learning and reward boundaries

P3 must preserve this separation:

### Subject-owned

- question selection;
- marking;
- hints;
- retries;
- feedback;
- support policy;
- Stars;
- mastery;
- subject monster mastery;
- subject session summaries.

### Hero-owned in P3

- daily progress state;
- task completion claims;
- effort completed;
- daily quest completion status;
- non-reward progress audit events;
- dashboard progress copy.

### Hero-owned in later phases, not P3

- Coins;
- Hero economy;
- Hero monsters;
- unlock/evolve purchases;
- Hero Camp.

Hero completion must never cause subject Stars to change directly. If a Hero-launched subject session produces subject Stars, that must happen because the subject engine awarded them through its normal rules, not because Hero claimed the task.

---

## 16. Security and abuse cases

P3 must explicitly test these cases.

### 16.1 Cross-learner claim

A user must not be able to claim another learner’s Hero task by guessing `questId`, `taskId`, `practiceSessionId`, or fingerprint.

The Worker must verify learner membership and session ownership before reading or writing progress.

### 16.2 Fake client completion

A client must not be able to mark a task complete by sending only `taskId` and `questFingerprint`.

The Worker must find server-owned completion evidence.

### 16.3 Duplicate claim

Same request replay returns the same receipt.

Different request, same completed task, returns `already-completed` without increasing effort again.

### 16.4 Wrong fingerprint

A claim with wrong `questFingerprint` should reject or require refetch. Do not leak the correct server fingerprint in errors.

### 16.5 Session completed after quest changes

If the subject session’s trusted `heroContext` points to a valid prior quest/date within the grace window, the claim should succeed even if today’s recomputed quest has shifted.

### 16.6 Stale old session

An old completed Hero session from days ago must not be claimable forever.

Use dateKey plus grace window.

### 16.7 Active non-Hero session

Claiming should not start, cancel, or overwrite non-Hero subject sessions.

### 16.8 Malformed persisted Hero state

Malformed progress state should not crash the dashboard. Normalise or reset safely.

### 16.9 Demo/read-only mode

Demo and degraded persistence policies must match existing platform mutation rules. If subject commands are blocked in a mode, Hero claim should be blocked too.

### 16.10 Multi-tab

Two tabs claiming the same task at the same time must result in one real mutation and one safe replay/already-completed response.

---

## 17. Date/time policy

P2 left a known edge case: multiple `now()` calls can straddle midnight.

P3 should capture a single `nowTs` at the start of each Hero route request and thread it through:

- read-model build;
- quest/dateKey derivation;
- claim validation;
- progress-state update;
- event timestamps;
- mutation receipt timestamps;
- structured logs.

Timezone remains `Europe/London` until a learner/account timezone field exists. P3 should not invent a new profile timezone feature unless the repo already has it by implementation time.

P3 should centralise any grace-window constant.

---

## 18. Observability

P3 should add structured logs similar to P2’s Hero launch logs.

Recommended server-side events:

```txt
hero_task_claim_succeeded
hero_task_claim_already_completed
hero_task_claim_rejected
hero_daily_progress_completed
hero_claim_evidence_missing
hero_claim_evidence_mismatch
```

Recommended payload fields:

```txt
learnerId
questId
taskId
subjectId
intent
launcher
claimStatus
dailyStatus
reason
```

Do not log raw session state, answer content, debug scheduler internals, or anything the child should not see.

Client-side observability can be lightweight:

```txt
[hero] progress_rendered
[hero] claim_started
[hero] claim_succeeded
[hero] claim_failed
[hero] daily_complete_rendered
```

Use once-per-visit guards where appropriate, as P2 did for card rendered/hidden logs.

---

## 19. Testing requirements

P3 needs a strong test suite because it intentionally introduces Hero-owned writes.

### 19.1 Shared pure tests

Suggested files:

```txt
tests/hero-progress-state.test.js
tests/hero-claim-contract.test.js
tests/hero-completion-status.test.js
```

Test:

- normalise empty state;
- normalise malformed state;
- initialise daily state;
- merge scheduled quest with progress;
- duplicate claim does not double-count effort;
- daily complete rule;
- dateKey rollover;
- no economy fields in progress state.

### 19.2 Worker claim resolver tests

Suggested file:

```txt
tests/hero-claim-resolver.test.js
```

Test:

- valid completed Spelling Hero session claims;
- valid completed Grammar Hero session claims;
- valid completed Punctuation Hero session claims;
- active but incomplete session rejects;
- completed non-Hero session rejects;
- wrong learner rejects;
- wrong taskId rejects;
- wrong questFingerprint rejects;
- old date outside grace window rejects;
- session cleared from `ui_json` still claimable through `practice_sessions`;
- duplicate claim returns already-completed.

### 19.3 Repository mutation safety tests

Suggested file:

```txt
tests/hero-progress-mutation-safety.test.js
```

Test:

- `claim-task` writes only allowed tables;
- `child_game_state` `hero-mode` row is upserted;
- `mutation_receipts` row is created;
- same `requestId` replays response;
- stale learner revision rejected;
- cross-account/learner rejected;
- no `child_subject_state` write from Hero claim;
- no Coins/monster fields persisted.

### 19.4 Read model v4 tests

Suggested file:

```txt
tests/hero-progress-read-model.test.js
```

Test:

- version 4 shape;
- progress block disabled when flag off;
- progress block enabled when flag on;
- task completion statuses merge correctly;
- completed tasks remain completed after quest recomputation;
- pending completed session surfaced safely;
- debug stripped from child-visible response;
- child copy remains economy-free.

### 19.5 Client tests

Suggested files:

```txt
tests/hero-client-claim.test.js
tests/hero-ui-progress-flow.test.js
tests/hero-dashboard-progress-card.test.js
tests/hero-subject-banner-progress.test.js
```

Test:

- `claimTask` request body shape;
- no `subjectId` or `payload` in claim body;
- typed error mapping;
- stale claim triggers refetch;
- dashboard progress states;
- claiming state has `aria-busy`;
- error state has `aria-live="polite"`;
- child UI has no economy vocabulary;
- task complete/daily complete copy is pressure-free.

### 19.6 E2E tests

Suggested file:

```txt
tests/hero-completion-flow-e2e.test.js
```

Test full flows:

1. read model v4 → start Hero task → complete subject session → claim task → dashboard shows completed task;
2. duplicate claim same requestId → same response;
3. duplicate claim different requestId → `already-completed`, no double effort;
4. claim wrong learner’s session → reject;
5. claim before subject completion → reject;
6. session cleared from `ui_json` but present in `practice_sessions` → claim succeeds;
7. Punctuation completion path still applies normal subject response handling;
8. all flags off → no claim endpoint;
9. progress flag off → P2 UI still safe, no progress claim;
10. midnight grace claim succeeds within grace and fails outside grace.

### 19.7 Boundary tests

P3 must update P2 boundary tests rather than deleting them.

The old P2 rule “no Hero-owned persistent state writes” becomes:

```txt
P3 may write only Hero daily progress state, mutation receipts, and allowed progress events.
```

Keep these structural boundaries:

- `shared/hero/` stays pure;
- client Hero files do not import Worker code;
- Hero UI files import only safe shared copy/progress helpers if allowed by the updated allowlist;
- no D1 write primitives in client files;
- no new Hero D1 migration tables;
- no economy vocabulary in child UI;
- no Coins/monster fields in persisted progress state;
- no subject mastery mutation from Hero claim.

---

## 20. Accessibility and UX requirements

P3 should maintain P2’s accessibility discipline.

Requirements:

- claim/progress live updates use `aria-live="polite"`;
- claim buttons, if any, have type `button`;
- disabled buttons use `aria-busy="true"` while claiming;
- no inline animations or motion-heavy progress transitions;
- daily completion state is clear without colour alone;
- task completion icons, if used, have accessible text or are decorative with adjacent text;
- no pressure copy when daily quest is complete.

P3 should not add confetti or heavy celebration animation. Save visual reward design for later Hero Camp/economy phases, and even then respect reduced motion.

---

## 21. Suggested implementation themes

This section is not a root-level implementation plan. The planning agent should still inspect the repo and write its own detailed plan with exact units, files, tests, and sequencing.

A likely P3 implementation sequence is:

### Theme A — shared progress contracts

Add pure state normalisers, claim contract helpers, completion status merge helpers, and no-economy invariants.

### Theme B — repository-backed Hero progress state

Add repository helpers to read/write `child_game_state` for `system_id='hero-mode'`, plus a Hero mutation wrapper using `mutation_receipts` and learner revision checks.

### Theme C — claim resolver

Add `worker/src/hero/claim.js` to validate request body, locate completed subject evidence, verify trusted `heroContext`, apply progress mutation, and return a claim result.

### Theme D — read model v4

Merge scheduled quest, progress state, active session, and pending completed evidence into a child-safe read model.

### Theme E — route extension and feature flag

Extend `/api/hero/command` to support `claim-task` behind `HERO_MODE_PROGRESS_ENABLED`; add config defaults with production off.

### Theme F — client claim API and runtime actions

Add `claimTask`, runtime actions, pending claim state, stale/refetch handling, and automatic/dashboard-load claim repair.

### Theme G — UI progress states

Update `HeroQuestCard`, `HeroTaskBanner`, and `buildHeroHomeModel` to display authoritative progress while keeping copy economy-free.

### Theme H — e2e and boundary hardening

Add E2E coverage for full start/complete/claim/progress flow, duplicate claims, cross-learner rejection, stale claims, date rollover, and no-economy boundaries.

---

## 22. P3 acceptance criteria

P3 is complete only when all of these are true.

### Product acceptance

- A child can start a Hero task from the dashboard.
- A child can complete the normal subject session.
- The completed Hero task is claimed by Worker verification, not client guesswork.
- The dashboard shows the task as complete after claim.
- The dashboard shows next task or daily complete state.
- Progress persists across page refresh.
- Daily complete copy is positive but non-pressuring.
- No Coins, Hero Camp, Hero monster, streak, shop, deal, or reward copy appears.

### Architecture acceptance

- Hero remains a platform orchestrator, not a subject engine.
- Subject engines still own marking, feedback, Stars, and mastery.
- `claim-task` uses a Hero mutation safety path with idempotency receipts.
- Hero progress state is stored in existing platform storage, preferably `child_game_state` under `system_id='hero-mode'`.
- No new Hero D1 tables are introduced.
- Read model version is bumped to v4.
- `claimEnabled` and `heroStatePersistenceEnabled` are true only when progress flag is on.
- Client still never sends `subjectId` or `payload` to Hero commands.

### Safety acceptance

- Duplicate claim does not double-count effort.
- Same request replay returns same response.
- Different request duplicate returns safe already-completed.
- Cross-learner claim is rejected.
- Wrong quest/fingerprint/task is rejected.
- Completion evidence missing/incomplete is rejected.
- Old session outside grace window is rejected.
- Session cleared from `ui_json` can still be claimed via `practice_sessions` if evidence exists.
- Debug/scheduler internals remain stripped from child-visible read model.
- No subject mastery or Stars are mutated by Hero claim.

### Test acceptance

- All P0/P1/P2 tests still pass or are deliberately updated to the P3 boundary.
- New P3 tests cover shared progress, claim resolver, mutation safety, read model v4, client claim API, UI progress states, E2E completion flow, and boundary no-economy checks.
- Boundary tests explicitly scan for forbidden economy fields and copy in P3 child UI.
- E2E tests include all three ready subjects where fixtures allow.

---

## 23. Specific edge cases the planning agent must address

### 23.1 P2 active session disappears after completion

If subject UI clears `session`, P2 cannot show continue and cannot know completion. P3 must use practice session history or another server-owned completion source to recover the claim.

### 23.2 P2 active session remains after completion

If subject UI leaves a completed session object, P3 must distinguish “in-progress” from “completed-unclaimed.” Do not show endless “Continue Hero task” for a completed session.

### 23.3 Client `lastLaunch` cleared on dashboard navigation

P2 clears `lastLaunch` on `navigate-home`. P3 must not depend solely on `lastLaunch` for claim repair. It can use `lastLaunch` for smooth auto-claim, but dashboard-load repair must work from server read model/evidence.

### 23.4 Quest recomputes after subject state changes

A completed task must remain complete even if the daily scheduler output shifts after the subject session updates state. Stable `taskId` and trusted session `heroContext` are the anchors.

### 23.5 Practice session does not include Hero context

If an implementation discovers that practice session history does not persist `heroContext`, P3 has two options:

1. update subject session persistence so Hero context is copied into the practice session summary/state at completion; or
2. claim from raw subject `ui_json` before it is cleared, with a dashboard-load repair limitation documented and tested.

The stronger fix is option 1, but it touches subject completion persistence and should be reviewed carefully.

### 23.6 Punctuation response path

Normal Punctuation answer/session completion should continue using its specialised response handling. Hero claim should not swallow or replace Punctuation subject feedback/reward projections.

### 23.7 Degraded persistence

If persistence is degraded/read-only, the UI should not start a claim mutation. Show a gentle “progress will update when sync recovers” style message only if needed. Avoid scary copy.

### 23.8 Network drop after subject completion

If the child completes the session but the claim request fails, dashboard-load repair should detect the completed unclaimed Hero session and allow/auto-run the claim later.

### 23.9 Two tabs

One tab claims the task. The other tab claims later. The second tab should refetch and show completed, or receive already-completed. No double effort.

### 23.10 Midnight

A task launched before midnight and completed shortly after midnight should be claimable for the original Hero quest date within the grace window. A task from several days ago should not be claimable.

---

## 24. Copy examples for P3 states

### Ready

```txt
Today’s Hero Quest
A few strong rounds picked from your ready subjects.
Next: Grammar — Fix a wobbly skill
Start Hero Quest
```

### In progress

```txt
Today’s Hero Quest
You have a Grammar task in progress.
Continue Hero task
```

### Claiming/checking

```txt
Checking your Hero progress…
```

### Task completed

```txt
Task complete.
Nice work — your Hero Quest has moved forward.
Next Hero task is ready.
```

### Daily complete

```txt
Today’s Hero Quest is complete.
You kept your ready subjects strong today.
```

### Error/refetch

```txt
Your Hero Quest refreshed. Try the next task now.
```

Do not use “claim your reward” in child copy.

---

## 25. Relationship to P4

P4 should add the capped Hero Coins economy only after P3 is stable.

P4 will need P3’s output:

- daily quest completed;
- task completed exactly once;
- effort completed;
- duplicate claim prevention;
- daily dateKey and status;
- audit trail;
- child copy that already knows daily complete.

P4 should not have to solve completion authority. If P4 has to guess whether a task was completed, P3 failed.

P3 should make P4 straightforward:

```txt
if daily.status === 'completed' and daily reward not yet awarded:
  award capped Coins exactly once
```

But P3 must not implement that rule yet.

---

## 26. Recommended remaining phase map

After P2, the core Hero Mode roadmap should be:

### P3 — Completion Claims and Daily Progress

This document. Worker verifies task completion, persists daily progress, and updates the child dashboard.

### P4 — Hero Coins Ledger and Capped Daily Economy

Add Coin balance, daily reward rules, idempotent award ledger, daily cap, bonus cap if any, reward copy, and no per-question currency. No Hero Camp yet unless the implementation deliberately combines P4/P5, which is not recommended.

### P5 — Hero Camp and Hero Pool Monsters

Add Hero-owned monsters, unlock/evolve actions, costs, confirmation/undo where appropriate, and the six initial Hero Pool monsters. No loot boxes. No random paid-like shop. Monster growth is child choice, not automatic.

### P6 — Hardening, Metrics, Rollout, and Post-Mega Retention

Add deeper analytics, admin/parent diagnostics if needed, post-Mega maintenance tuning, retention/lapse metrics, reward-health metrics, rollout gates, and production hardening. This is where the team checks whether Hero Mode improves retention-after-secure without increasing rushing/spam.

### Optional later phase — Six-subject expansion and advanced providers

When Arithmetic, Reasoning, and Reading have production-ready subject engines, add Hero providers for them. This should not block the core Hero Mode launch for the current ready subjects.

In short: after P2, expect four core phases: P3, P4, P5, and P6. The optional six-subject expansion is separate.

---

## 27. Final P3 principle

P3 should make Hero progress real, but still keep rewards restrained.

The line to protect is:

> Hero Mode can record that the child completed today’s learning contract. It cannot yet pay, sell, unlock, evolve, or alter subject mastery.

That is the right next step after P2.
