---
title: "Hero Mode P2 — Child-Facing Daily Quest Shell"
type: product-engineering-origin
status: draft
date: 2026-04-27
owner: james
intended_path: docs/plans/james/hero-mode/hero-mode-p2.md
phase: P2
origin: docs/plans/james/hero-mode/hero-mode-p1.md
previous_completion_report: docs/plans/james/hero-mode/hero-mode-p1-completion-report.md
---

# Hero Mode P2 — Child-Facing Daily Quest Shell

## 1. Guiding sentence

Hero Mode P2 makes the daily Hero Quest visible to the child for the first time, allowing a launchable Hero task to be started from the dashboard and returning the learner to the normal subject session, while still keeping Hero Mode reward-free, claim-free, and free of Hero-owned persistent state.

P2 is the first child-facing phase, not the first economy phase.

P2 should answer this question:

> “Can a learner see today’s Hero Quest, understand why it exists, start the next launchable task safely, and keep their sense of place when the subject session opens — without Coins, Hero Camp, completion claims, or Hero-owned state?”

P2 is successful when the app can show a safe `Today’s Hero Quest` card on the dashboard, launch a selected Hero task through the P1 bridge, route the learner into the appropriate subject session, and surface lightweight Hero context on the subject surface. It must not show or imply completion rewards. P3 will own completion claims and Coins.

---

## 2. P1 status and comments

P1 landed successfully and should be treated as a solid launch bridge.

The P1 completion report says PR #397 shipped:

- a shared Hero launch contract layer;
- deterministic `taskId` derivation;
- `heroContext` build / validate / sanitise helpers;
- launch-status classification;
- subject launch adapters for Spelling, Grammar, and Punctuation;
- a `POST /api/hero/command` route supporting only `command:'start-task'`;
- server-side quest recomputation before launch;
- rejection of client-supplied `subjectId` and `payload`;
- launch through the existing subject command mutation path;
- `heroContext` passthrough into all three ready subject engines;
- 228 Hero tests with zero Hero-owned persistent state writes.

That is the right foundation for P2.

P2 must preserve the most important P1 boundary:

**Hero Mode launches subject sessions; it does not become a subject engine, a reward engine, or a parallel command system.**

P1 also documented five edge cases P2 must revisit:

1. double-submit can start the same Hero task twice with different `requestId`s;
2. quest recomputation has higher read cost than direct subject command;
3. `hero_active_session_conflict` does not exist yet;
4. `questFingerprint` is still `null`;
5. timezone is hardcoded to `Europe/London`.

P2 must address the first four as part of making Hero child-facing. The timezone issue can remain explicitly deferred unless a learner/account timezone field already exists in the repo when implementation starts.

---

## 3. Current repo context P2 must respect

The repo now has three important Hero layers:

### 3.1 Shared pure Hero layer

Existing files under `shared/hero/` include constants, scheduler, task envelopes, launch context, and launch status. The layer is intentionally pure: no Worker, React, D1, repository, subject runtime, or browser imports.

P2 may add pure helpers here, especially for:

- quest fingerprint derivation;
- child-safe Hero read-model normalisation;
- child-facing task labels / reason labels;
- active Hero session detection helpers if they can stay data-shape-only.

P2 must not import React or Worker code into `shared/hero/`.

### 3.2 Worker Hero layer

Existing files under `worker/src/hero/` include:

- `read-model.js` — builds Hero read model v2;
- `routes.js` — handles `GET /api/hero/read-model` behind `HERO_MODE_SHADOW_ENABLED`;
- `launch.js` — resolves `start-task` into a normal subject `start-session` command;
- `providers/` — maps subject read models into Hero task envelopes;
- `launch-adapters/` — maps Hero task envelopes into subject command payloads.

P2 may evolve the read model to version 3 and may harden `launch.js`, but it must keep dispatch ownership in `worker/src/app.js`. Hero files must still not import `subjects/runtime.js`.

### 3.3 Client shell and dashboard

Current dashboard entry is `src/surfaces/home/HomeSurface.jsx`. It currently builds:

- a learner greeting;
- meadow monsters;
- `Today's best round` from `selectTodaysBestRound(model.dashboardStats)`;
- a primary CTA that opens a subject directly;
- the subject card grid.

P2 should integrate Hero Mode here, not by adding a full new route first. The dashboard already has the correct “one primary daily action” shape. Hero should become the daily primary action when available, and the existing `Today’s best round` / subject CTA remains the fallback when Hero is disabled or unavailable.

Current route rendering is controlled from `src/app/App.jsx`, which supports `dashboard`, `codex`, `subject`, `profile-settings`, `parent-hub`, and `admin-hub`. P2 does not need to add a `hero` route. A dashboard card plus subject-surface Hero context is enough.

Subject rendering flows through `src/surfaces/subject/SubjectRoute.jsx`, which delegates to the ready subject React components. P1 injected `heroContext` into subject sessions, so P2 can show Hero context by reading the active subject session state rather than adding Hero-specific subject engines.

---

## 4. P2 is not P3, P4, or P5

P2 must stay disciplined.

P2 does **not** include:

1. no Hero Coins;
2. no Hero ledger;
3. no Hero monster ownership;
4. no Hero Camp;
5. no unlock / evolve actions;
6. no persistent Hero daily progress;
7. no task completion claim endpoint;
8. no `claim-task` command;
9. no `claim-daily-reward` command;
10. no `hero.*` events;
11. no writes to `child_game_state` for Hero;
12. no D1 Hero tables;
13. no streaks;
14. no “Daily Deal” copy;
15. no limited-time shop copy;
16. no random rewards;
17. no subject Stars awarded by Hero;
18. no Grammar / Punctuation Star semantics changes;
19. no answer submission through Hero;
20. no item-level Hero scheduler.

P2 may start a subject session because P1 already proved that path. That means subject-owned writes remain expected when a learner starts a task. But P2 must still produce zero Hero-owned persistent writes.

---

## 5. Product scope

P2 introduces four child-facing behaviours.

### 5.1 Dashboard Hero Quest card

When Hero Mode is child-visible and launch-enabled, the dashboard should show a `Today’s Hero Quest` card above or in place of the current `Today's best round` hero panel.

The card should show:

- a clear title: `Today’s Hero Quest`;
- a short learning-first line: `A few strong rounds picked from your ready subjects.`;
- effort planned, not effort completed: e.g. `18 effort planned`;
- next launchable task: subject, short intent label, reason label;
- ready subjects included today;
- locked subjects as quiet “coming later” context only when useful;
- one primary CTA: `Start Hero Quest` or `Continue Hero task`;
- one secondary CTA at most: `Open subjects` or `Refresh quest`, depending on state.

The card must not show Coins, rewards, streaks, shop language, or progress completion.

Because P3 owns completion claims, P2 must not show `18 / 24 complete` or task checkmarks based on guesses. It can show `Ready`, `In progress`, `Not launchable`, or `Unavailable`, but not `Completed` unless the completion is purely local and clearly non-authoritative. Prefer not to show completion at all in P2.

### 5.2 Launch from Hero card

Clicking the primary Hero CTA should:

1. choose the first launchable task from the current Hero read model;
2. call `POST /api/hero/command` with `command:'start-task'`;
3. let the Worker derive the subject command server-side;
4. apply the returned subject command result through the same local update path as subject commands;
5. route the learner to the launched subject surface;
6. show no Hero reward.

The client must never send `subjectId` or `payload` to `/api/hero/command`. P1 explicitly rejects those fields, and P2 should keep that rejection as a test fixture.

### 5.3 Subject-surface Hero context

When a subject session was launched from Hero Mode, the subject surface should show a lightweight banner or breadcrumb-level context.

Examples:

- `Hero Quest task: Grammar — weak repair`
- `This round is part of today’s Hero Quest.`
- `Finish the round, then return to your Hero Quest.`

This must be context only. It must not alter subject feedback, subject scoring, hints, support policy, Stars, or monster rewards.

The banner should be implemented at shell / subject route level where possible, not copied into every subject scene. If the current session state exposes `session.heroContext`, `SubjectRoute` or a small `HeroTaskBanner` can render above the subject-specific component.

### 5.4 Safe fallback and no regression

When Hero is unavailable, disabled, errored, or not launchable, the dashboard should behave like today.

Fallback cases:

- user not signed in or no Worker session;
- persistence degraded / runtime read-only;
- `HERO_MODE_CHILD_UI_ENABLED` off;
- `HERO_MODE_SHADOW_ENABLED` off;
- `HERO_MODE_LAUNCH_ENABLED` off;
- zero eligible subjects;
- all tasks not launchable;
- GET read-model fails;
- stale quest on launch;
- active Hero session conflict;
- Punctuation subject gate off;
- selected learner changed while fetch was in flight.

In all fallback cases, the existing dashboard subject cards and direct subject entry must remain usable.

---

## 6. Child-visible gating

P0 and P1 deliberately kept `childVisible:false`. P2 must introduce a separate child-visible gate.

Recommended Worker flag:

```txt
HERO_MODE_CHILD_UI_ENABLED=false
```

P2 should treat Hero as child-visible only when all required gates are true:

```txt
HERO_MODE_SHADOW_ENABLED=true
HERO_MODE_LAUNCH_ENABLED=true
HERO_MODE_CHILD_UI_ENABLED=true
```

`GET /api/hero/read-model` should continue to work for internal/debug usage when only shadow mode is enabled, but its payload should explicitly distinguish:

```js
hero.childVisible === false
hero.launch.enabled === false | true
hero.ui.enabled === false | true
```

Recommended read-model addition:

```js
ui: {
  enabled: boolean,
  surface: 'dashboard-card',
  reason: 'enabled' | 'child-ui-disabled' | 'launch-disabled' | 'shadow-disabled' | 'no-eligible-subjects' | 'no-launchable-tasks'
}
```

Client rule:

**Only render the child-facing Hero card when `hero.ui.enabled === true` and `hero.childVisible === true`.**

This avoids build-time client flags and lets production fail closed through Worker configuration.

---

## 7. Read-model evolution for P2

P2 should evolve the Hero read model from v2 to v3.

Recommended shape:

```js
{
  ok: true,
  hero: {
    version: 3,
    mode: 'child-launch',
    childVisible: true,
    coinsEnabled: false,
    writesEnabled: false,
    timezone: 'Europe/London',
    dateKey: '2026-04-27',
    schedulerVersion: 'hero-p2-child-ui-v1',

    questFingerprint: 'hero-qf-...',

    ui: {
      enabled: true,
      surface: 'dashboard-card',
      reason: 'enabled',
      copyVersion: 'hero-p2-copy-v1'
    },

    eligibleSubjects: [],
    lockedSubjects: [],

    dailyQuest: {
      questId: 'hero-quest-...',
      questFingerprint: 'hero-qf-...',
      status: 'shadow',
      effortTarget: 18,
      effortPlanned: 18,
      tasks: [
        {
          taskId: 'hero-task-...',
          subjectId: 'grammar',
          intent: 'weak-repair',
          launcher: 'smart-practice',
          effortTarget: 6,
          reasonTags: ['weak', 'due-review'],
          launchStatus: 'launchable',
          launchStatusReason: null,
          childLabel: 'Grammar repair round',
          childReason: 'A wobbly skill is ready to strengthen',
          heroContext: {
            source: 'hero-mode',
            phase: 'p2-child-launch',
            questId: 'hero-quest-...',
            questFingerprint: 'hero-qf-...',
            taskId: 'hero-task-...'
          }
        }
      ]
    },

    activeHeroSession: null | {
      subjectId: 'spelling',
      questId: 'hero-quest-...',
      questFingerprint: 'hero-qf-...',
      taskId: 'hero-task-...',
      intent: 'post-mega-maintenance',
      launcher: 'guardian-check',
      status: 'in-progress'
    },

    launch: {
      enabled: true,
      commandRoute: '/api/hero/command',
      command: 'start-task',
      claimEnabled: false,
      heroStatePersistenceEnabled: false
    },

    debug: {}
  }
}
```

The implementation-planning agent should adapt the exact shape to current conventions, but the above fields are the contract P2 needs.

Important: `coinsEnabled` remains false. `claimEnabled` remains false. `heroStatePersistenceEnabled` remains false.

---

## 8. Quest fingerprint requirement

P2 must stop shipping `questFingerprint:null` into a child-visible launch UI.

P1 could tolerate `null` because there was no public UI and the server recomputed the quest on each launch. P2 introduces a real dashboard card that may be visible across reloads, route changes, stale tabs, and subject-state drift. The client must be able to say, “I am launching the same quest I was shown.”

P2 should add a deterministic fingerprint.

Recommended inputs:

```txt
learnerId
accountId if safely available server-side
dateKey
timezone
schedulerVersion
eligible subject ids
locked subject ids
per-subject provider snapshot fingerprints
content release fingerprints when available
selected quest tasks without debug-only fields
```

If a subject lacks a real content release id, use an explicit stable marker such as:

```txt
subject:{subjectId}:content-release:missing
```

Do not hide missing release IDs by leaving the whole quest fingerprint null.

Recommended helper:

```txt
shared/hero/quest-fingerprint.js
```

Recommended functions:

```js
buildHeroQuestFingerprintInput(input)
deriveHeroQuestFingerprint(input)
```

Output should be short, stable, and non-sensitive:

```txt
hero-qf-{hex12}
```

P2 launch request should include:

```js
{
  command: 'start-task',
  learnerId,
  questId,
  questFingerprint,
  taskId,
  requestId,
  correlationId,
  expectedLearnerRevision
}
```

Worker should recompute the read model and reject mismatch:

```txt
409 hero_quest_stale
```

or, if the implementation prefers a narrower code:

```txt
409 hero_quest_fingerprint_mismatch
```

The client should handle either by refetching the read model and showing a gentle message:

> Your Hero Quest refreshed. Try the next task now.

No blame, no lost reward copy.

---

## 9. Active Hero session detection

P1’s known double-submit issue must be reduced before child UI.

P2 should add best-effort active Hero session detection in both GET and POST flows.

### 9.1 GET detection

`buildHeroShadowReadModel()` or a Worker helper should inspect subject read models for active sessions carrying `session.heroContext.source === 'hero-mode'`.

If found, return:

```js
activeHeroSession: {
  subjectId,
  questId,
  questFingerprint,
  taskId,
  intent,
  launcher,
  status: 'in-progress'
}
```

The dashboard card then uses `Continue Hero task` as the primary CTA and opens that subject directly, instead of starting another task.

### 9.2 POST conflict detection

Before resolving a new `start-task`, Worker should check active sessions.

Rules:

- if an active Hero session exists for the same learner and same `taskId`, return a safe idempotent-ish response or a structured conflict that lets the client navigate to the already-started subject;
- if an active Hero session exists for a different Hero task, return `409 hero_active_session_conflict`;
- if an active non-Hero subject session exists, prefer returning `409 subject_active_session_conflict` or a generic `active_session_conflict` rather than silently abandoning it;
- do not start a second session just because the user double-clicked.

The exact server response can be chosen by the implementation-planning agent after reading the current subject session semantics. The important UX rule is:

**A child double-click must not create two practice sessions or abandon the first without a clear reason.**

Client must also dedupe locally:

- disable the CTA while a launch is pending;
- use one pending key per `(learnerId, questId, taskId)`;
- ignore stale responses when learner or quest changed;
- refetch read model after `hero_quest_stale` or `hero_active_session_conflict`.

---

## 10. Client API layer

P2 should add a small client Hero API wrapper rather than reusing `createSubjectCommandClient` directly.

Reason: the Hero command route intentionally rejects `subjectId` and `payload`, while `createSubjectCommandClient` always sends subject command shape.

Recommended file:

```txt
src/platform/hero/hero-client.js
```

Recommended API:

```js
export function createHeroModeClient({
  baseUrl = '',
  fetch,
  getLearnerRevision,
  onLaunchApplied,
  onStaleWrite,
}) {
  return {
    readModel({ learnerId }),
    startTask({ learnerId, questId, questFingerprint, taskId, requestId })
  };
}
```

`readModel()` calls:

```txt
GET /api/hero/read-model?learnerId=...
```

`startTask()` calls:

```txt
POST /api/hero/command
```

with:

```js
{
  command: 'start-task',
  learnerId,
  questId,
  questFingerprint,
  taskId,
  requestId,
  correlationId: requestId,
  expectedLearnerRevision
}
```

It must:

- use credentialed fetch already installed by the app bootstrap;
- parse Worker JSON errors into a typed `HeroModeClientError`;
- not transport-retry on `projection_unavailable` if Worker marks `retryable:false`;
- not retry stale quest conflicts without first refetching;
- call `onLaunchApplied(response)` only after a successful launch response;
- not mutate repositories directly unless delegated by the main app integration.

Implementation can either reuse helpers from `read-model-client.js` / `subject-command-client.js` or create a focused wrapper, but it must not send the subject command body shape.

---

## 11. Client UI state

P2 needs UI state, not persistent Hero state.

Recommended state shape in the client shell:

```js
heroUi: {
  status: 'idle' | 'loading' | 'ready' | 'launching' | 'error' | 'disabled',
  learnerId: string,
  requestToken: number,
  readModel: null | HeroReadModelV3,
  error: '',
  pendingTaskKey: '',
  lastLaunch: null | {
    questId,
    questFingerprint,
    taskId,
    subjectId,
    launchedAt
  }
}
```

This can live as non-persistent app/UI state. It must not write to `repositories.gameState`, `child_game_state`, `child_subject_state`, or D1 by itself.

Recommended behaviours:

- load Hero read model when dashboard renders and signed-in Worker mode is available;
- reload when selected learner changes;
- reload after a successful Hero launch response is applied, but do not block routing to subject;
- reload after `hero_quest_stale`, `hero_active_session_conflict`, or `hero_task_not_found`;
- fail closed to the existing dashboard on GET failure;
- keep a small internal error banner only if Hero card was already shown.

Avoid fetching Hero read model from every render. Use request tokens or in-flight caching similar to Parent/Admin hub loaders to prevent slow responses from overwriting newer learner state.

---

## 12. Client integration points

The implementation-planning agent should inspect the latest `src/main.js`, `create-app-controller.js`, and dashboard files before writing the implementation plan. Based on the current repo, these are likely integration points.

### 12.1 `src/main.js`

Add Hero client and Hero UI state near other runtime clients.

P2 likely needs:

- `createHeroModeClient({ fetch: credentialFetch, getLearnerRevision })`;
- `loadHeroReadModel({ learnerId, force })`;
- `startHeroTask({ questId, questFingerprint, taskId })`;
- `applyHeroLaunchResponse(response)`;
- an action handler for `hero-read-model-refresh`;
- an action handler for `hero-start-task`;
- optional `hero-open-active-session` action.

`applyHeroLaunchResponse()` should reuse the same subject command application path used by normal subject commands wherever possible. It must update local subject UI/read models, then route to `heroLaunch.subjectId`.

If exact reuse is awkward because Punctuation currently has a specialised `applyPunctuationCommandResponse()`, factor a small shared helper rather than duplicating subject-specific behaviour blindly.

### 12.2 `buildHomeModel()`

Add a `hero` block to the home model:

```js
hero: {
  status,
  readModel,
  nextTask,
  activeHeroSession,
  canStart,
  canContinue,
  error
}
```

This should be a child-safe normalised model. Do not pass raw debug fields into the React card unless the surface is explicitly adult/debug-only.

### 12.3 `buildSurfaceActions()`

Expose actions:

```js
startHeroQuestTask(taskId)
continueHeroTask(subjectId)
refreshHeroQuest()
```

The React component should not know how to build a Worker command body. It should dispatch an app action.

### 12.4 `HomeSurface.jsx`

Render `HeroQuestCard` when `model.hero.enabled` is true.

Fallback to current hero copy and `Today’s best round` when Hero is disabled/unavailable.

Keep the “Your subjects” section unchanged.

### 12.5 `SubjectRoute.jsx`

Read active session `heroContext` from the current subject UI and render a lightweight `HeroTaskBanner` above the subject practice node.

Do not add subject-specific Hero banners unless a subject has a genuine layout problem that cannot be solved at shell level.

---

## 13. Recommended new client files

Recommended files:

```txt
src/platform/hero/hero-client.js
src/platform/hero/hero-ui-model.js
src/platform/hero/hero-copy.js
src/surfaces/home/HeroQuestCard.jsx
src/surfaces/subject/HeroTaskBanner.jsx
```

Optional if the implementation prefers smaller units:

```txt
src/surfaces/home/HeroQuestTaskList.jsx
src/platform/hero/active-session.js
```

Do not add `src/platform/game/hero/coins.js`, `HeroCamp.jsx`, or monster-owned state in P2.

---

## 14. UI copy contract

The P2 copy should make Hero Mode feel purposeful without introducing reward pressure.

Good copy:

```txt
Today’s Hero Quest
A few strong rounds picked from your ready subjects.
Start Hero Quest
Continue Hero task
This round is part of today’s Hero Quest.
Your Hero Quest refreshed. Try the next task now.
No Hero task is ready yet — your subjects are still available below.
```

Subject/intent labels:

```txt
Spelling guardian check
Grammar repair round
Punctuation GPS check
Mixed maintenance round
Mega maintenance check
```

Reason labels:

```txt
A wobbly skill is ready to strengthen.
A secure skill is due for a quick check.
Your Mega learning gets a light guardian check.
This keeps your ready subjects balanced.
```

Forbidden copy in P2:

```txt
Coins
Daily Deal
Shop
Buy
Loot
Streak lost
Don’t miss out
Claim reward
Earn 100
Treasure
Limited time
```

The no-economy vocabulary scan from P1 should be extended to child-facing Hero UI files. This feature must still feel learning-first.

---

## 15. UI behaviour states

`HeroQuestCard` should support at least these states.

### 15.1 Disabled / unavailable

Do not render the card, or render only in debug/adult mode. Child dashboard falls back to existing subject CTA.

### 15.2 Loading

Render either no card or a skeleton that does not shift layout too much. The existing dashboard remains usable.

### 15.3 Ready with launchable task

Render the card with one primary CTA.

Primary CTA:

```txt
Start Hero Quest
```

### 15.4 Active Hero session

If `activeHeroSession` exists, primary CTA should be:

```txt
Continue Hero task
```

Clicking it opens the active subject route directly. It should not call `POST /api/hero/command` again.

### 15.5 No launchable tasks

Render a gentle fallback or omit the card. Existing subject cards remain.

Copy:

```txt
No Hero task is ready yet — your subjects are still available below.
```

### 15.6 Launch pending

Disable CTA, set `aria-busy`, keep label stable or use:

```txt
Starting…
```

Do not allow double-click.

### 15.7 Stale quest

On `hero_quest_stale` / fingerprint mismatch:

- refetch Hero read model;
- show gentle message;
- leave existing dashboard usable.

### 15.8 Active session conflict

On `hero_active_session_conflict`:

- refetch Hero read model;
- if the response includes active session, show `Continue Hero task`;
- otherwise show a generic retry message.

---

## 16. Subject session experience

P2 should not ask every subject team to build Hero UI.

Recommended shell-level banner:

```txt
Hero Quest task
This round is part of today’s Hero Quest.
```

The banner can show:

- subject name;
- intent label;
- maybe `Task 2` if the ordinal is safely available;
- a back-to-dashboard link only if it does not disrupt the current subject session.

Avoid showing:

- Coins;
- completion progress;
- “reward waiting”;
- task checkboxes;
- pressure copy.

If the subject session summary screen is already controlled by the subject, do not redesign it in P2. A small shell-level “Back to Hero Quest” affordance after session phase ends is acceptable if it can be done generically and safely. Otherwise defer to P3 after completion claim exists.

---

## 17. Completion and progress boundary

This is the most important product boundary in P2.

P2 should not claim that a task is complete.

Reasons:

1. There is no `claim-task` endpoint yet.
2. There is no Hero-owned daily state yet.
3. There is no idempotent Hero ledger yet.
4. Some subject sessions may be abandoned, refreshed, or replaced.
5. Honest completion quality rules belong in P3.

P2 can show:

```txt
Ready
In progress
Continue
Unavailable
```

P2 should not show:

```txt
Completed
18 / 24 complete
Reward earned
Coins available
Claim
```

P3 will define authoritative task completion, effort credit, honest attempt quality, and Coins.

---

## 18. Worker hardening required before child visibility

P2 should include Worker hardening, not only React UI.

Required changes:

1. real quest fingerprint;
2. `hero.version` bump to 3;
3. child UI gate and `hero.ui` block;
4. `activeHeroSession` detection;
5. launch request accepts and validates `questFingerprint`;
6. launch rejects stale fingerprint;
7. launch handles active Hero session conflict;
8. all responses keep `coinsEnabled:false`, `claimEnabled:false`, `heroStatePersistenceEnabled:false`;
9. `/api/hero/read-model` becomes capacity-relevant if the public dashboard calls it regularly.

Current capacity patterns include `/api/hero/command` but not `/api/hero/read-model`. P2 should add:

```js
/^\/api\/hero\/read-model$/
```

or the equivalent current routing pattern, because the dashboard may now call it on normal child entry.

---

## 19. Security and privacy rules

P2 exposes Hero data to the child shell, so redaction matters.

The child-facing Hero model must not include:

- raw provider debug internals;
- rejected candidate lists with sensitive state;
- full subject read models;
- learner data for another learner;
- account IDs unless already exposed elsewhere safely;
- hidden subject IDs beyond safe locked-subject labels;
- raw error stack traces;
- command payloads;
- server-only fingerprints if they reveal content IDs considered private.

Debug fields can remain on the Worker response only if they are gated for admin/ops or explicitly marked safe. The default child card should consume a normalised child-safe subset.

Auth rules from P0/P1 stay mandatory:

- `GET /api/hero/read-model` must require authenticated session and learner read access;
- `POST /api/hero/command` must require same-origin, mutation capability, learner access, request idempotency, and normal subject command path;
- demo write policy must not be bypassed;
- Punctuation exposure gate must still block Punctuation launch when disabled.

---

## 20. Accessibility and UX requirements

P2 is a child-facing dashboard entry point, so it needs basic accessibility from day one.

Requirements:

- one primary CTA in the Hero card;
- button has clear accessible name;
- disabled / pending state uses `aria-busy` or clear disabled button text;
- stale/error message uses polite live region if shown after click;
- keyboard can launch and continue;
- focus does not jump unexpectedly after Hero read-model refresh;
- after successful launch, the subject route receives focus using existing route focus behaviour;
- no layout trap if the Hero card fails to load;
- reduced-motion users do not receive extra Hero animation.

Do not add heavy animation in P2. This is a shell and flow phase.

---

## 21. Analytics / observability for P2

P2 should add minimal observability, but not a new analytics product surface.

Useful structured client or Worker events/logs:

- `hero_read_model_loaded` — status only, no raw task payload;
- `hero_card_rendered` — childVisible true;
- `hero_task_launch_clicked`;
- `hero_task_launch_started`;
- `hero_task_launch_succeeded`;
- `hero_task_launch_failed` with safe code;
- `hero_quest_stale_refetched`;
- `hero_active_session_conflict`;
- `hero_card_hidden_reason`.

If the repo’s current telemetry pattern is Worker structured logs rather than client events, use that pattern. Do not create persistent Hero analytics tables in P2.

The minimum P2 success metrics are operational:

- card render success rate;
- GET read-model error rate;
- launch success rate;
- stale quest rate;
- double-click / pending dedupe rate;
- active session conflict rate;
- no increase in subject command errors.

Learning effectiveness metrics and Coins metrics belong to P3+ after completion claims exist.

---

## 22. Testing contract

The implementation plan should include tests in these categories.

### 22.1 Shared pure tests

Add tests for:

- quest fingerprint determinism;
- quest fingerprint changes when scheduler version changes;
- quest fingerprint changes when selected tasks change;
- quest fingerprint is non-null in child-visible mode;
- child label/reason normaliser strips debug fields;
- forbidden economy copy does not appear in Hero P2 copy module.

Possible files:

```txt
tests/hero-quest-fingerprint.test.js
tests/hero-child-read-model.test.js
tests/hero-copy-contract.test.js
```

### 22.2 Worker read-model tests

Add tests for:

- v3 read model shape;
- child UI disabled returns `ui.enabled:false`;
- child UI enabled only when all flags are on;
- `questFingerprint` present and propagated into tasks / heroContext;
- active Hero session detection;
- zero eligible subjects fail safely;
- no child UI when all tasks not launchable;
- debug fields absent from child-safe subset if a subset is introduced.

### 22.3 Worker launch tests

Add tests for:

- `questFingerprint` required in child-visible launch mode;
- stale fingerprint rejected;
- stale quest still rejected;
- active same-task session handled safely;
- active different-task Hero session returns `hero_active_session_conflict`;
- active non-Hero subject session does not get silently abandoned;
- client-supplied `subjectId` and `payload` still rejected;
- successful launch still creates zero `hero.*` events;
- successful launch still creates zero Hero-owned game state writes.

### 22.4 Client API tests

Add tests for:

- `createHeroModeClient.readModel()` calls the correct GET path;
- `startTask()` posts Hero command shape, not subject command shape;
- `startTask()` includes expected learner revision;
- typed error mapping for `hero_quest_stale`, `hero_active_session_conflict`, `hero_task_not_launchable`, `projection_unavailable`, network failure;
- no automatic retry of stale quest without caller refetch.

### 22.5 UI tests

Add tests for:

- card renders when `hero.ui.enabled` and `childVisible` are true;
- card hidden or fallback when disabled;
- primary CTA launches first launchable task;
- CTA disabled while launch pending;
- active session shows `Continue Hero task` and does not POST;
- stale quest message appears and refetch action fires;
- no Coins / Deal / Shop / Loot / Streak copy appears;
- existing `Today's best round` fallback still works;
- subject grid still renders.

Possible files:

```txt
tests/hero-dashboard-card.test.js
tests/hero-client.test.js
tests/hero-subject-banner.test.js
tests/hero-ui-flow.test.js
```

### 22.6 E2E / flow tests

Add at least one full flow test:

```txt
GET /api/hero/read-model
→ render HomeSurface with Hero card
→ click Start Hero Quest
→ POST /api/hero/command
→ apply returned subject command result
→ route opens launched subject
→ active subject session exposes heroContext
→ HeroTaskBanner renders
→ no Hero-owned writes/events
```

This should run for at least one subject. Prefer Spelling first because it has the most mature Worker path. Add Grammar/Punctuation as feasible launchable tests or as not-launchable/fallback tests if their fixtures make full E2E awkward.

---

## 23. Boundary tests that must continue to pass

P2 must preserve P0/P1 structural boundaries with updated expectations.

Structural scans should still prove:

- `shared/hero/` imports no Worker, D1, React, repository, or subject runtime;
- `worker/src/hero/` imports no `subjects/runtime.js`;
- launch adapters import no subject runtime;
- client files import no `worker/src/*` files;
- Hero UI files do not contain economy vocabulary;
- no Hero module writes D1 directly;
- no Hero module writes `child_game_state`;
- no Hero module creates `hero.*` events;
- no Hero persistent state table exists.

Behavioural tests should prove:

- `GET /api/hero/read-model` still writes zero protected tables;
- successful `POST /api/hero/command` only performs subject-command-path writes;
- successful launch creates no Hero-owned events;
- child dashboard fetch failure does not break subject access;
- repeated refreshes do not mutate learner revision.

---

## 24. Deployment strategy

Recommended deployment flags:

```txt
HERO_MODE_SHADOW_ENABLED=true       # internal/staging, already from P0
HERO_MODE_LAUNCH_ENABLED=true       # internal/staging, from P1
HERO_MODE_CHILD_UI_ENABLED=false    # new P2 gate, default false everywhere
```

Rollout order:

1. deploy P2 code with `HERO_MODE_CHILD_UI_ENABLED=false`;
2. verify no child-visible changes;
3. enable all three flags in local/staging/demo QA;
4. validate card rendering and launch flow;
5. keep production child UI off until P2 completion report is reviewed.

If production flags for P0/P1 remain off, P2 must behave exactly like current dashboard.

---

## 25. Suggested implementation units

This origin doc is not the final root-level implementation plan. The planning agent should inspect the repo and write a proper plan. Still, the work likely decomposes into these units.

### P2-U0 — Origin compliance and repo scan

Read P0/P1 origin docs, P1 completion report, current Hero files, dashboard files, app shell, subject route, and runtime command clients.

Deliverable: root-level implementation plan.

### P2-U1 — Quest fingerprint and read-model v3

Add deterministic quest fingerprint and read-model v3 shape. Keep childVisible false unless new flag is on.

### P2-U2 — Active Hero session detection

Detect active Hero sessions in GET and harden POST conflict handling.

### P2-U3 — Hero client API

Add client wrapper for GET read model and POST start-task.

### P2-U4 — Client Hero UI state and actions

Thread Hero state through `src/main.js` / app runtime model without persistence.

### P2-U5 — Dashboard HeroQuestCard

Add child-facing card, fallback behaviour, copy, and tests.

### P2-U6 — Subject HeroTaskBanner

Render lightweight Hero context above subject practice when active session has `heroContext`.

### P2-U7 — Flow and stale/conflict handling

Wire launch success route, stale refetch, conflict refetch, pending dedupe, and selected-learner race handling.

### P2-U8 — Boundary, accessibility, and no-economy hardening

Extend structural tests, UI tests, accessibility checks, and copy scans.

### P2-U9 — Capacity and deployment gates

Add `/api/hero/read-model` capacity instrumentation if appropriate, update Wrangler defaults, and document rollout.

---

## 26. Acceptance criteria

P2 is complete only when all of these are true.

### Product acceptance

- Child dashboard can show `Today’s Hero Quest` behind feature flags.
- One primary Hero CTA is available when a launchable task exists.
- Existing dashboard fallback remains when Hero is disabled or unavailable.
- The child can start a Hero task and land in the correct subject session.
- Subject session shows lightweight Hero context.
- No Coins, Hero Camp, Hero monsters, streaks, shop, deal, claim, or reward copy appears.
- P2 does not claim task completion.

### Architecture acceptance

- Hero remains platform orchestrator, not a subject engine.
- Exact item selection remains subject-owned.
- Launch still goes through `POST /api/hero/command` and then normal subject command boundary.
- Client never sends `subjectId` or `payload` to Hero command route.
- `questFingerprint` is non-null in child-visible flow.
- Active Hero session detection reduces double-submit / abandoned-session risk.
- No Hero-owned persistent state is written.
- No D1 Hero table is introduced.
- No `hero.*` events are emitted.

### Safety acceptance

- GET read-model remains read-only.
- POST start-task writes only through subject-command path.
- Punctuation feature gate remains respected.
- Demo policy remains respected.
- Stale quest/fingerprint results in refetch, not wrong launch.
- Active session conflict does not silently abandon the child’s session.
- Read-only/degraded persistence blocks launch or fails safely.
- Child model excludes raw debug data.

### Testing acceptance

- Existing P0/P1 Hero tests updated and passing.
- New P2 shared, Worker, client, UI, flow, and boundary tests pass.
- Existing Spelling, Grammar, and Punctuation runtime tests remain green.
- Existing dashboard fallback tests remain green.
- No-economy vocabulary scan includes new Hero UI files.
- Production build/audit does not expose Worker source or private Hero debug fields.

---

## 27. Future phases after P2

P2 intentionally stops before completion and reward.

Recommended next phases:

### P3 — Completion claim and daily progress

Add `claim-task` and authoritative Hero daily progress. Define honest completion, support/skip/spam rules, idempotency, and daily effort credit. Still no monster spending until state is safe.

### P4 — Coins ledger and capped daily reward

Add Hero Coins ledger, daily cap, idempotent awards, no per-question Coins, and no reward for spam/no-attempt. Keep Coins capped and learning-first.

### P5 — Hero Pool and Hero Camp

Add Hero-owned monster pool, unlock/evolve, child choice, no loot boxes, no random paid-like mechanics, and no subject monster contamination.

### P6 — Post-Mega retention hardening

Deepen Mega maintenance scheduling, lapse detection, low-frequency guardian checks, and learning-health metrics.

---

## 28. Final P2 contract

P2 should be built around this sentence:

**Hero Mode P2 gives the child a visible, launchable daily quest shell, but still treats Hero Mode as a reward-free orchestrator. The subject engines teach, mark, and progress mastery; Hero only shows the daily mission, starts the chosen task safely, and keeps the learner oriented.**

If a proposed P2 change needs Coins, completion claims, Hero monster ownership, Hero events, or Hero-owned persistence, it is not P2.

