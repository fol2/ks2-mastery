---
title: "Hero Mode P1 — Launchable Task Envelopes and Subject Command Bridge"
type: product-engineering-origin
status: draft
date: 2026-04-27
owner: james
intended_path: docs/plans/james/hero-mode/hero-mode-p1.md
phase: P1
origin: docs/plans/james/hero-mode/hero-mode-p0.md
previous_completion_report: docs/plans/james/hero-mode/hero-mode-p0-completion-report.md
---

# Hero Mode P1 — Launchable Task Envelopes and Subject Command Bridge

## 1. Guiding sentence

Hero Mode P1 turns P0’s read-only shadow quest into a safe launch bridge: a selected Hero task envelope can start the correct subject session through the existing Worker subject command boundary, carrying an opaque `heroContext`, without showing child-facing Hero UI, awarding Coins, claiming progress, or creating Hero-owned persistent state.

P1 is not the public launch of Hero Mode. P1 is the engineering proof that a Hero task can become a real subject session without Hero Mode becoming a subject engine, a reward engine, or a parallel command system.

The implementation-planning agent should treat this file as the origin contract. It should inspect the current repo, especially P0 code and tests, then write its own root-level implementation plan with concrete units, exact files, tests, and sequencing.

---

## 2. P0 status and comments

P0 landed successfully and should be treated as a strong foundation, not as throwaway prototype code.

P0 shipped:

- a shared pure Hero layer under `shared/hero/`;
- read-only Worker provider stubs under `worker/src/hero/providers/`;
- a feature-gated `GET /api/hero/read-model` route;
- deterministic scheduling, effort budget, subject mix caps, Mega maintenance filtering, and debug reasons;
- structural and behavioural tests proving zero writes to persistent state;
- simulation fixtures for multiple learner archetypes;
- explicit safety flags: `childVisible:false`, `coinsEnabled:false`, `writesEnabled:false`.

This is exactly the right P0 shape.

P0 also leaves several deliberate P1 extension points:

1. `heroContext` exists only as an optional passthrough shape, not as generated cross-reference IDs.
2. P0 tasks do not yet have stable launchable `taskId`s.
3. `POST /api/hero/command` intentionally does not exist in P0.
4. P0 providers are read-only and must remain read-only in P1.
5. P0 scheduler is still `hero-p0-shadow-v1`; P1 must decide whether to introduce a separate launch contract version or bump the scheduler version.
6. P0’s no-write boundary tests must be adjusted carefully: P1 will intentionally start subject sessions, which means subject-owned writes become expected, but Hero-owned writes remain forbidden.

There is one important P0 follow-up to resolve before or during P1 planning:

**The P0 completion report says content release fingerprinting was resolved as a concatenation of per-subject release IDs, with graceful degradation. But the current `worker/src/hero/read-model.js` still passes `contentReleaseFingerprint: null` into `generateHeroSeed()`.**

That was acceptable for P0 because P0 was shadow-only and non-launching. It is less acceptable for P1 because a launch request must know whether it is launching the same daily quest the user saw. P1 must either:

- implement a real deterministic `contentReleaseFingerprint`, or
- introduce a clear `questSourceFingerprint` / `questSnapshotFingerprint` that lets the server detect stale launch requests, or
- explicitly document why the fingerprint remains `null` and compensate with another stale-quest guard.

Do not ignore this. Once Hero starts sessions, “same learner + same date” is not enough. Content, provider, scheduler, and subject availability drift matter.

---

## 3. Phase 1 outcome

By the end of P1, the platform should be able to answer this question in a debug / staging / internal context:

> “Given today’s Hero shadow quest, can this selected Hero task safely start the correct subject session, through the normal subject command pipeline, with a traceable Hero context?”

P1 should prove this with real Worker command execution, at least in tests and staging/debug mode.

A successful P1 launch flow should look like this:

```txt
1. Caller reads GET /api/hero/read-model.
2. The read model returns a deterministic daily quest with stable task IDs.
3. Caller selects one taskId.
4. Caller sends POST /api/hero/command with command:start-task.
5. Worker recomputes or validates the current Hero quest server-side.
6. Worker verifies the requested task belongs to today’s quest for the same learner.
7. Worker maps the task envelope to a subject start-session command.
8. Worker sends the command through the existing subject command mutation boundary.
9. The subject starts a normal session.
10. The response includes subjectReadModel plus a small heroLaunch block.
11. No Hero Coins, Hero ledger, Hero monster state, or Hero completion state is written.
```

P1 is complete when this flow works safely and repeatably for launchable tasks, with tests proving that Hero Mode has not become a parallel learning engine or reward system.

---

## 4. P1 is not P2, P3, or P4

P1 must stay boring and infrastructural.

P1 does **not** include:

1. no child-facing Hero dashboard card;
2. no Hero Camp;
3. no Hero Coins;
4. no Hero ledger;
5. no Hero monster ownership;
6. no unlock/evolve actions;
7. no task completion claim;
8. no daily progress persistence;
9. no streaks;
10. no “Daily Deal” copy;
11. no parent-facing Hero analytics page;
12. no changes to subject mastery algorithms;
13. no changes to Grammar/Punctuation Star calculation;
14. no Hero awarding subject Stars;
15. no Hero submitting answers;
16. no Hero continuing sessions;
17. no Hero ending sessions;
18. no Hero command types other than `start-task`.

P1 is only about making a Hero task envelope launchable.

---

## 5. Core product boundary

Hero Mode remains a platform-level orchestrator.

Subject engines still own:

- item selection;
- session creation internals;
- marking;
- feedback;
- support policy;
- mastery mutation;
- subject Stars;
- subject monster progression;
- subject reward projection;
- practice session summaries.

Hero Mode in P1 may:

- read the Hero shadow quest;
- validate a requested `questId` / `taskId`;
- map a Hero envelope to a subject `start-session` command;
- attach an opaque `heroContext` to that subject start command;
- return launch metadata for debug/QA;
- rely on the normal subject command persistence path to start the session.

Hero Mode in P1 must not:

- choose exact words, concepts, units, item IDs, templates, or answer specs;
- bypass subject command validation;
- dispatch answer commands;
- create its own session model;
- persist its own Hero task state;
- reward task completion;
- infer learning evidence from session results.

---

## 6. Current P0 codebase context P1 must respect

P0 created this shape:

```txt
shared/hero/
  constants.js
  contracts.js
  eligibility.js
  scheduler.js
  seed.js
  task-envelope.js

worker/src/hero/
  read-model.js
  routes.js
  providers/
    index.js
    spelling.js
    grammar.js
    punctuation.js
```

P0 also added:

```txt
GET /api/hero/read-model
```

behind:

```txt
HERO_MODE_SHADOW_ENABLED
```

The current Worker subject command route remains:

```txt
POST /api/subjects/:subjectId/command
```

with commands normalised by `worker/src/subjects/command-contract.js`. The subject command contract requires:

```js
{
  subjectId,
  command,
  learnerId,
  requestId,
  correlationId,
  expectedLearnerRevision,
  payload
}
```

The current Worker runtime registers only:

```txt
spelling
grammar
punctuation
```

P1 must keep Arithmetic, Reasoning, and Reading locked until those subjects have real Worker-backed command engines and Hero providers.

---

## 7. P1 strategic choice: launch bridge, not public UI

The cleanest P1 boundary is:

```txt
P0: Can compute a safe shadow quest.
P1: Can launch one selected task from that quest.
P2: Can show child-facing Today’s Hero Quest UI.
P3: Can claim task completion and award capped Coins.
P4: Can spend Coins in Hero Camp.
```

Do not jump from P0 straight to a dashboard card. If P2 UI is built before P1 launch semantics are hardened, the UI will drive the architecture instead of the learning contract driving the UI.

P1 should be mostly invisible to children. It can be exercised by tests, QA tooling, staging, or a temporary debug surface if the implementation plan explicitly keeps that surface out of production child navigation.

---

## 8. Launchable task envelope model

P0 task envelopes were subject-level descriptors. P1 must turn selected envelopes into launchable descriptors.

P1 tasks should include stable IDs.

Recommended selected task shape in the read model:

```js
{
  taskId: 'hero-task-4f2a91c3',
  subjectId: 'grammar',
  intent: 'weak-repair',
  launcher: 'trouble-practice',
  effortTarget: 6,
  reasonTags: ['weak', 'recent-miss'],
  launchStatus: 'launchable',
  heroContext: {
    version: 1,
    source: 'hero-mode',
    questId: 'hero-quest-8c752abf',
    taskId: 'hero-task-4f2a91c3',
    dateKey: '2026-04-27',
    timezone: 'Europe/London',
    schedulerVersion: 'hero-p1-launch-v1',
    subjectId: 'grammar',
    intent: 'weak-repair',
    launcher: 'trouble-practice',
    effortTarget: 6
  }
}
```

`taskId` must be deterministic for the same learner, date, quest, scheduler version, provider output, and selected task order.

A good task ID derivation is:

```txt
hash(questId + ordinal + subjectId + intent + launcher + effortTarget + reasonTags)
```

Do not derive `taskId` from child-visible copy. Copy changes must not change launch identity.

Do not let the client supply `subjectId`, `intent`, `launcher`, or subject payload during launch. The client supplies `questId` and `taskId`; the server recomputes the quest and derives everything else.

---

## 9. Launch status vocabulary

P1 should introduce explicit launchability, because not every P0 envelope is necessarily safe to start yet.

Suggested values:

```js
export const HERO_LAUNCH_STATUSES = Object.freeze([
  'launchable',
  'not-launchable',
  'subject-unavailable',
  'stale',
  'blocked'
]);
```

Use them as follows:

```txt
launchable
  The task can be mapped to a subject start-session command today.

not-launchable
  The task is useful as a shadow recommendation but no safe subject payload exists yet.

subject-unavailable
  The provider was available during scheduling but the subject command is currently unavailable, for example Punctuation flag off.

stale
  The requested task no longer matches today’s recomputed quest.

blocked
  The task is structurally valid but should not be started because of a policy rule, active incompatible session, missing revision, or similar guard.
```

P1 should not hide launch failures behind generic 500s. If a task cannot launch, return a clear structured error.

---

## 10. `heroContext` contract

`heroContext` is the most important P1 payload. It is the future bridge for P2 progress display and P3 completion claim, but it must remain inert in P1.

Recommended shape:

```js
{
  version: 1,
  source: 'hero-mode',
  phase: 'p1-launch',

  questId: 'hero-quest-8c752abf',
  taskId: 'hero-task-4f2a91c3',
  dateKey: '2026-04-27',
  timezone: 'Europe/London',
  schedulerVersion: 'hero-p1-launch-v1',
  questFingerprint: 'optional-stable-fingerprint',

  subjectId: 'grammar',
  intent: 'weak-repair',
  launcher: 'trouble-practice',
  effortTarget: 6,

  launchRequestId: 'req_...',
  launchedAt: 1777315200000
}
```

Rules:

1. `heroContext` is opaque to the subject learning algorithm.
2. Subjects may store it on session metadata.
3. Subjects must not use it to decide correctness, support, mastery, Stars, or rewards.
4. Subjects must not trust it if it came from the client; P1 should attach the server-normalised version.
5. It should be small, JSON-safe, and stable.
6. It must not include debug reasons, adult-only diagnostics, raw learner profile data, or subject-internal item IDs.
7. It must not include Coins, reward values, or monster IDs.

P1 should add a normaliser such as:

```txt
shared/hero/launch-context.js
```

or:

```txt
shared/hero/task-envelope.js
```

with:

```js
normaliseHeroContext(raw)
buildHeroContext({ quest, task, requestId, now })
validateHeroContext(context)
```

Do not duplicate this logic independently inside each subject.

---

## 11. Subject session passthrough requirement

P1 should prove that `heroContext` survives the start-session boundary.

Minimum requirement:

When a Hero task starts a subject session, the active subject session should carry a sanitized `heroContext` in either:

```txt
subjectReadModel.session.heroContext
```

or, if the public read model cannot expose it yet:

```txt
practice_sessions.session_state_json.session.heroContext
```

Preferred P1 requirement:

Both the returned `subjectReadModel.session.heroContext` and persisted active `practice_sessions.session_state_json` carry the same sanitized context.

Do not add the context to mastery state. It belongs to the session, not the learner’s subject progress.

Do not add the context to completed summaries in P1 unless it naturally falls through the subject session model. Completed-session claim is P3. P1 only needs active launch traceability.

---

## 12. Worker API contract

P1 may introduce:

```txt
POST /api/hero/command
```

behind a new feature flag:

```txt
HERO_MODE_LAUNCH_ENABLED=false
```

Do not reuse `HERO_MODE_SHADOW_ENABLED` for writes. Keep the read-model flag and launch flag separate.

Recommended command request:

```js
{
  command: 'start-task',
  learnerId: 'learner_123',
  questId: 'hero-quest-8c752abf',
  taskId: 'hero-task-4f2a91c3',
  requestId: 'req_hero_start_...',
  correlationId: 'corr_...',
  expectedLearnerRevision: 42
}
```

Aliases may be accepted only if they follow existing codebase conventions, for example `type` or `action`, but the canonical public contract should be `command:'start-task'`.

The client must not send subject payload. P1 must reject requests like:

```js
{
  command: 'start-task',
  subjectId: 'grammar',
  payload: { mode: 'easy' }
}
```

The server should derive subject command shape from the current Hero task envelope.

Recommended success response:

```js
{
  ok: true,
  heroLaunch: {
    version: 1,
    status: 'started',
    questId: 'hero-quest-8c752abf',
    taskId: 'hero-task-4f2a91c3',
    dateKey: '2026-04-27',
    subjectId: 'grammar',
    intent: 'weak-repair',
    launcher: 'trouble-practice',
    effortTarget: 6,
    subjectCommand: 'start-session',
    coinsEnabled: false,
    claimEnabled: false,
    childVisible: false
  },
  subjectId: 'grammar',
  command: 'start-session',
  learnerId: 'learner_123',
  changed: true,
  subjectReadModel: { /* normal subject read model */ },
  projections: { /* normal subject projections */ },
  events: [],
  domainEvents: [],
  reactionEvents: [],
  toastEvents: []
}
```

Recommended failure responses:

```txt
404 hero_launch_disabled
401 unauthenticated
403 forbidden
400 hero_command_required
400 hero_task_id_required
400 hero_quest_id_required
400 command_revision_required
404 hero_task_not_found
409 hero_quest_stale
409 hero_task_not_launchable
409 hero_subject_unavailable
409 hero_active_session_conflict
```

The exact error class should follow existing Worker conventions, but the code should be precise enough for P2 UI to act on later.

---

## 13. Do not create a parallel command system

This is the biggest engineering risk in P1.

P1 must not implement a separate subject write pipeline inside `worker/src/hero/`.

Correct pattern:

```txt
Hero validates selected task.
Hero builds a normal subject command.
The app/repository uses the existing subject command mutation path.
Subject runtime dispatches the normal start-session command.
Repository persists using existing idempotency, revision, practice session, event, and projection logic.
```

Incorrect pattern:

```txt
Hero directly writes child_subject_state.
Hero directly inserts practice_sessions rows.
Hero directly imports subject engines and calls them outside repository.runSubjectCommand.
Hero reimplements mutation receipts.
Hero creates hero_sessions table.
Hero starts answering / continuing / ending subject sessions.
```

The implementation plan should strongly prefer one of these structures:

### Preferred structure A — App owns the final subject dispatch

```txt
worker/src/hero/launch.js
  resolveHeroStartTaskCommand(...) -> { heroLaunch, subjectCommand }

worker/src/app.js
  POST /api/hero/command
    requireSameOrigin
    requireMutationCapability
    readJson
    resolveHeroStartTaskCommand
    repository.runSubjectCommand(... subjectRuntime.dispatch(...))
    return merged response
```

This keeps `worker/src/hero/` free of direct subject runtime imports.

### Acceptable structure B — Injected dispatcher

```txt
worker/src/hero/routes.js
  handleHeroCommand({ dispatchSubjectCommand })
```

This is acceptable only if:

- `worker/src/hero/` does not import `subjects/runtime.js`;
- the app injects a function that already goes through `repository.runSubjectCommand`;
- tests prove the normal mutation receipt path is used.

Avoid structure C:

```txt
worker/src/hero/routes.js imports createWorkerSubjectRuntime directly.
```

That creates a second command system. Do not do it.

---

## 14. Subject launch adapters

P1 needs a launch adapter layer that maps Hero envelope to subject `start-session` command payload.

Suggested location:

```txt
worker/src/hero/launch-adapters/
  index.js
  spelling.js
  grammar.js
  punctuation.js
```

or:

```txt
worker/src/hero/launchers/
  index.js
  spelling.js
  grammar.js
  punctuation.js
```

The launch adapter is not the same thing as the P0 provider.

Provider:

```txt
subject read model -> Hero task envelopes
```

Launch adapter:

```txt
Hero task envelope -> subject start-session command payload
```

Rules:

1. Launch adapters must not mutate state.
2. Launch adapters must not call subject runtime.
3. Launch adapters must not choose subject-internal items.
4. Launch adapters may choose a subject mode only if it is already supported by the subject command engine.
5. If a launcher cannot be safely mapped, return `not-launchable`.
6. Mapping must be test-covered by subject and launcher.

Tentative mapping guidance, to be verified by the implementing agent against current engines and client call sites:

```txt
Spelling
  smart-practice      -> start-session payload mode: smart
  trouble-practice    -> start-session payload mode: trouble
  guardian-check      -> start-session payload mode: guardian, only if postMega/guardian availability is true
  mini-test           -> probably not applicable unless existing spelling test mode is intentionally used
  gps-check           -> not applicable

Grammar
  smart-practice      -> start-session payload using the existing Grammar smart/default mode
  trouble-practice    -> existing Fix Trouble Spots / repair mode, if Worker supports it
  mini-test           -> existing Grammar mini-test mode, if Worker start-session supports it
  guardian-check      -> not applicable in P1 unless Grammar has a maintenance mode
  gps-check           -> not applicable

Punctuation
  smart-practice      -> start-session payload using existing punctuation practice mode
  trouble-practice    -> existing weak/wobbly repair mode, if Worker supports it
  gps-check           -> existing GPS-style check, if Worker start-session supports it
  mini-test           -> only if current punctuation Worker command supports it
  guardian-check      -> not applicable
```

If the actual subject command payload names differ, the implementation plan should use the real names and document the mapping.

Do not invent new subject modes in P1 just to satisfy Hero. If the subject does not already support the launch mode, mark the task `not-launchable` and defer the subject capability.

---

## 15. Launcher capability registry

P1 should make launchability explicit.

Suggested shape:

```js
{
  subjectId: 'punctuation',
  launcher: 'gps-check',
  launchable: true,
  subjectCommand: 'start-session',
  reason: 'punctuation-gps-check-supported'
}
```

If not launchable:

```js
{
  subjectId: 'grammar',
  launcher: 'guardian-check',
  launchable: false,
  reason: 'launcher-not-supported-for-subject'
}
```

The P1 read model should not pretend all scheduled tasks can launch. It should either:

- filter selected tasks to launchable tasks only, or
- retain all tasks but clearly mark `launchStatus`.

My recommendation:

**P1 should keep the scheduler output visible in debug, but add a separate `launchableTasks` view or `launchStatus` per task. P2 UI should later only display tasks where `launchStatus:'launchable'`.**

This gives engineering visibility without exposing broken tasks to children later.

---

## 16. Read model evolution in P1

`GET /api/hero/read-model` should remain read-only.

Do not change the meaning of P0 safety flags. The read model can still say:

```js
childVisible: false,
coinsEnabled: false,
writesEnabled: false
```

because the GET route itself remains read-only.

Add a separate launch capability block, for example:

```js
{
  hero: {
    version: 2,
    mode: 'launch-shadow',
    childVisible: false,
    coinsEnabled: false,
    writesEnabled: false,
    launch: {
      enabled: true,
      commandRoute: '/api/hero/command',
      command: 'start-task',
      claimEnabled: false,
      heroStatePersistenceEnabled: false
    },
    dailyQuest: {
      questId,
      status: 'launch-shadow',
      effortTarget,
      effortPlanned,
      tasks: [ /* stable task IDs + launchStatus */ ]
    }
  }
}
```

Possible version choices:

```txt
Option A: keep hero.version = 1 and add optional launch block.
Option B: bump hero.version = 2 because task identity and launchStatus are response-shape additions.
```

I prefer Option B if any consumer snapshot tests depend on the read-model shape. This is an additive-but-important contract change.

Do not remove P0 fields. P1 should be additive unless there is a strong reason.

---

## 17. Scheduler/versioning in P1

P0 uses:

```js
HERO_SCHEDULER_VERSION = 'hero-p0-shadow-v1'
```

P1 needs to decide whether launchability changes the scheduler version.

Recommended:

```js
HERO_SCHEDULER_VERSION = 'hero-p1-launch-v1'
HERO_LAUNCH_CONTRACT_VERSION = 1
```

Reason:

- P0 task ordering did not affect real sessions.
- P1 task ordering and IDs can start subject sessions.
- If the task ID algorithm, launchability filtering, or launch adapter mapping changes, stale launch requests should not silently start the wrong task.

If the team does not want to bump scheduler version in P1, then introduce a separate:

```js
questFingerprint
launchContractVersion
```

and require launch validation to check it.

Either way, P1 must have a stale-launch defence.

---

## 18. Stale quest and stale task handling

P1 launch requests should never trust the client’s copy of the quest.

On `POST /api/hero/command`, the server should:

1. resolve learner access;
2. recompute the Hero read model for the learner and current date;
3. find the requested `questId`;
4. find the requested `taskId`;
5. verify `launchStatus:'launchable'`;
6. verify the subject is still command-available;
7. build the subject command;
8. run the subject command through the normal mutation path.

If the quest no longer matches:

```txt
409 hero_quest_stale
```

If the task is missing:

```txt
404 hero_task_not_found
```

If the task exists but cannot currently launch:

```txt
409 hero_task_not_launchable
```

If the subject is disabled, for example Punctuation flag off:

```txt
409 hero_subject_unavailable
```

Stale launch failure should be treated as a normal recoverable condition. P2 UI can later refresh the Hero card and show the next task.

---

## 19. Idempotency and double-click behaviour

P1 starts subject sessions, so it must use the existing mutation idempotency system.

Minimum rules:

1. `POST /api/hero/command` requires `requestId`.
2. It requires `expectedLearnerRevision`.
3. It goes through `repository.runSubjectCommand`, not a direct D1 write.
4. Replaying the exact same launch request returns the same receipt / response behaviour as normal subject commands.
5. Reusing the same requestId with a different launch payload must fail with the existing idempotency reuse error.

Double-click with two different requestIds is harder. P1 does not need a full daily Hero state machine, but it should not create surprising chaos.

Preferred P1 behaviour:

- If the same learner already has an active subject session with the same `heroContext.taskId`, return `alreadyActive:true` and the current subject read model without starting another session.

Acceptable P1 behaviour if the above is too invasive:

- Document that P1 only guarantees idempotency for identical request replay, and P2 must ensure the UI reuses the same requestId while a launch is pending.

Do not implement a Hero task ledger in P1 just to solve double-click. That is P3 territory.

---

## 20. Expected writes in P1

P0 had a global no-write invariant. P1 intentionally changes that.

Expected writes when launching a task:

```txt
mutation_receipts             yes, via existing subject command path
child_subject_state           yes, because the subject session starts
practice_sessions             yes, active session row
learner_read_models           possible, if existing subject command projection hot path writes it
event_log                     possible, only if the subject start-session emits domain events
```

Forbidden writes in P1:

```txt
Hero Coins                    no
Hero ledger                   no
Hero monster ownership        no
Hero monster stage            no
Hero quest progress           no
Hero task completion state    no
Hero daily completion state   no
Hero-specific child_game_state no
Hero reward events            no
subject Stars from Hero       no
subject reward projection from Hero no
```

Tests must stop saying “Hero writes nothing at all” for the launch route. Instead they should say:

**Hero P1 launch may write only through the existing subject command path, and it may not write any Hero-owned reward/progress/economy state.**

The GET read model remains no-write.

---

## 21. Feature flags and deployment

P1 should add a new flag:

```txt
HERO_MODE_LAUNCH_ENABLED=false
```

Recommended environment behaviour:

```txt
local/dev:     can be true for testing
staging:       true after P1 tests pass
production:    false until P2/P3 readiness decision
```

`HERO_MODE_SHADOW_ENABLED` and `HERO_MODE_LAUNCH_ENABLED` should be independent.

Suggested behaviour:

```txt
GET /api/hero/read-model
  controlled by HERO_MODE_SHADOW_ENABLED

POST /api/hero/command
  controlled by HERO_MODE_LAUNCH_ENABLED
```

If launch is enabled but shadow read model is disabled, the launch route should still be able to compute/validate the quest internally, or it should fail with a clear configuration error:

```txt
409 hero_launch_misconfigured
```

My recommendation: launch route should require both flags in staging, unless the implementation plan has a good reason not to.

---

## 22. Auth, CSRF, and demo policy

P1 launch route is a mutation route. It must follow mutation security rules.

Required:

1. authenticated session;
2. same-origin check;
3. mutation capability check;
4. learner write access, not just read access;
5. `expectedLearnerRevision` CAS check through subject command path;
6. `requestId` idempotency;
7. subject exposure gates, especially for Punctuation;
8. existing demo write protections.

P0 allowed demo sessions to read the shadow model. P1 launch is different. It starts sessions.

The implementation plan must inspect the current demo policy. If demo subject commands are protected through `protectDemoSubjectCommand`, Hero launch must call the same protection or route through the same code path.

Do not allow a demo write loophole via `/api/hero/command`.

---

## 23. Capacity telemetry

P0 deferred capacity telemetry because the route was read-only and not child-facing.

P1 introduces a mutation path that internally runs a subject command. The implementation plan should decide whether to add `/api/hero/command` to the capacity-relevant path list.

My recommendation:

**Add `/api/hero/command` to capacity-relevant paths in P1 if the route executes subject commands.**

Reason:

- P1 launch touches the same hot path as `POST /api/subjects/:subjectId/command`.
- P2 will likely call this from the child dashboard.
- Waiting until P2 risks losing visibility while stabilising P1.

Do not add capacity telemetry to `GET /api/hero/read-model` unless needed. The launch route is the higher priority.

---

## 24. Client exposure in P1

P1 should not add a public child dashboard Hero card.

Allowed:

- tests;
- staging API calls;
- an internal/debug-only QA harness if explicitly gated and not reachable from normal child navigation.

Disallowed:

- Dashboard Hero card;
- child-facing Today’s Hero Quest CTA;
- Hero progress UI;
- Hero Camp link;
- Coins copy;
- daily streak copy;
- subject landing page changes to promote Hero.

Continue to protect against accidental `src/` imports if no debug UI is added.

If a debug client helper is added, it must be clearly internal and must not be bundled into the child surface by default.

---

## 25. Subject-specific launch proof target

P1 should aim to prove launchability across all three ready subjects, but the implementation plan may sequence this.

Recommended acceptance tier:

```txt
Required:
  Spelling start-task end-to-end through Hero launch route.

Strongly preferred:
  Grammar and Punctuation start-task end-to-end if current subject command payloads are already stable.

Allowed fallback:
  Grammar/Punctuation tasks are marked not-launchable with clear reasons until their adapters are safely mapped.
```

However, do not leave the read model in a state where P2 would accidentally show unlaunchable tasks as normal tasks. If an adapter is missing, mark it.

P1 should not fake support by inventing new modes or by sending payloads that only coincidentally work today.

---

## 26. Suggested file placement

The implementation-planning agent should inspect current code before finalising paths, but this is the intended shape.

Shared additions:

```txt
shared/hero/launch-context.js
shared/hero/launch-contract.js
```

or additive exports from existing:

```txt
shared/hero/task-envelope.js
shared/hero/contracts.js
```

Worker additions:

```txt
worker/src/hero/launch.js
worker/src/hero/launch-adapters/index.js
worker/src/hero/launch-adapters/spelling.js
worker/src/hero/launch-adapters/grammar.js
worker/src/hero/launch-adapters/punctuation.js
```

Worker modifications:

```txt
worker/src/hero/read-model.js
worker/src/hero/routes.js
worker/src/app.js
worker/src/subjects/{spelling,grammar,punctuation}/engine.js or session builders, only if needed for heroContext passthrough
worker/src/subjects/{spelling,grammar,punctuation}/read-models.js, only if needed to surface heroContext on active sessions
wrangler.jsonc
worker/wrangler.example.jsonc
```

Tests:

```txt
tests/hero-launch-contract.test.js
tests/hero-task-ids.test.js
tests/hero-launch-adapters.test.js
tests/worker-hero-command.test.js
tests/hero-launch-boundary.test.js
tests/hero-context-passthrough.test.js
```

Existing tests to update carefully:

```txt
tests/hero-no-write-boundary.test.js
```

Do not simply delete the P0 boundary tests. Split them:

```txt
GET /api/hero/read-model remains no-write.
POST /api/hero/command may write only via subject command path and must not write Hero-owned state.
```

---

## 27. Suggested implementation units

This is guidance for the implementation-planning agent, not a required unit breakdown.

### P1-U0 — Origin and P0 gap alignment

Read:

```txt
docs/plans/james/hero-mode/hero-mode-p0.md
docs/plans/james/hero-mode/hero-mode-p0-completion-report.md
shared/hero/*
worker/src/hero/*
worker/src/subjects/command-contract.js
worker/src/subjects/runtime.js
worker/src/app.js
worker/src/subjects/{spelling,grammar,punctuation}/commands.js
worker/src/subjects/{spelling,grammar,punctuation}/engine.js
```

Resolve:

- actual task ID strategy;
- actual content/quest fingerprint strategy;
- actual subject launch payload mapping;
- whether `hero.version` should bump;
- whether P1 supports all three subjects or Spelling-first with explicit `not-launchable` fallback.

### P1-U1 — Stable task IDs and launch context builders

Add deterministic task IDs and `heroContext` builders.

Tests:

- same inputs produce same task IDs;
- different task order or launcher changes task ID;
- heroContext strips unsafe fields;
- heroContext does not include Coins/rewards/monster state;
- task IDs are present on all selected read-model tasks.

### P1-U2 — Launchability registry and adapters

Add adapter mapping from envelope to subject `start-session` payload.

Tests:

- supported subject/launcher pairs map to `start-session`;
- unsupported pairs return `not-launchable`;
- adapters do not import subject runtime;
- adapters do not mutate input task envelopes;
- adapters do not include item-level IDs.

### P1-U3 — Read-model evolution

Update `GET /api/hero/read-model` so daily quest tasks include:

```txt
taskId
launchStatus
heroContext
```

and optional launch debug.

Tests:

- P0 fields remain present;
- childVisible/coinsEnabled/writesEnabled remain false for GET;
- launch block is present only when launch flag is enabled, or includes `enabled:false` when disabled;
- zero eligible remains safe;
- unlaunchable tasks are marked clearly.

### P1-U4 — Hero command contract and route

Add `POST /api/hero/command` with only `start-task`.

Tests:

- flag off returns structured 404;
- unauthenticated 401;
- cross-account forbidden;
- viewer/read-only membership cannot launch;
- missing requestId rejected;
- missing expectedLearnerRevision rejected;
- stale quest rejected;
- missing task rejected;
- not-launchable task rejected;
- client-supplied subject payload ignored or rejected.

### P1-U5 — Subject command bridge

Wire the validated Hero start task through the existing subject command path.

Tests:

- resulting command is a normal subject `start-session`;
- requestId/correlationId/expectedLearnerRevision are preserved;
- repository mutation receipt path is used;
- subject runtime dispatch is not imported directly by launch adapters;
- normal subject response is returned.

### P1-U6 — `heroContext` session passthrough

Ensure the subject active session carries sanitized `heroContext`.

Tests:

- active session read model or persisted session state contains `heroContext`;
- subject mastery state does not contain `heroContext` outside the session;
- marking/answer commands do not read `heroContext` for correctness;
- support/feedback logic is unchanged.

### P1-U7 — Boundary and regression tests

Update P0 boundary tests and add P1-specific boundaries.

Tests:

- GET remains no-write;
- POST writes expected subject-command tables only;
- no Hero Coins/ledger/monster state appears;
- no `hero.*` reward events are written;
- no child dashboard imports;
- existing subject command tests remain green.

### P1-U8 — Staging QA script or fixture flow

Add a small script or test helper that simulates:

```txt
read Hero model -> choose first launchable task -> start task -> inspect subject read model -> verify heroContext
```

This can be non-gating if full tests cover the behaviour, but it will be useful before P2 UI.

---

## 28. Acceptance criteria

P1 is complete only when all of these are true.

### Product acceptance

- Hero Mode remains a platform-level orchestrator, not a seventh subject.
- P1 launches subject sessions but does not show a child Hero dashboard.
- P1 does not introduce Coins, Hero Camp, Hero monsters, completion claims, or daily progress persistence.
- Hero tasks carry stable IDs and launchability status.
- Mega/post-Mega task semantics remain maintenance-focused.
- Unlaunchable tasks are explicit, not hidden.

### Architecture acceptance

- `GET /api/hero/read-model` remains read-only.
- `POST /api/hero/command` supports only `start-task`.
- Launch route is behind `HERO_MODE_LAUNCH_ENABLED`.
- Launch route uses same-origin, mutation capability, learner write access, requestId, and expectedLearnerRevision.
- Launch route goes through existing subject command mutation/persistence path.
- Hero launch adapters do not import subject runtime or write to D1.
- Hero does not create new D1 tables.
- Hero does not write Hero-owned persistent state.

### Subject acceptance

- At least Spelling launches end-to-end from a Hero task.
- Grammar and Punctuation either launch end-to-end or are marked not-launchable with precise reasons.
- `heroContext` is attached to the active subject session for launched tasks.
- Subject engines do not use `heroContext` for marking, mastery, Stars, or rewards.
- Existing subject start-session behaviour still works without `heroContext`.

### Safety acceptance

- No Hero Coins.
- No Hero ledger.
- No Hero monster ownership.
- No unlock/evolve commands.
- No subject Stars are granted by Hero.
- No reward projection changes are caused by Hero launch.
- No child-facing Hero UI.
- Punctuation feature gate remains respected.
- Demo write policy is not bypassed.

### Testing acceptance

- Launch contract tests pass.
- Stable task ID tests pass.
- Launch adapter tests pass.
- Worker Hero command route tests pass.
- Hero context passthrough tests pass.
- Updated no-write/no-Hero-state boundary tests pass.
- Existing P0 read-model tests pass, updated only for additive response fields if needed.
- Existing Spelling, Grammar, Punctuation, Worker, and subject-expansion tests remain green.

---

## 29. P1 failure modes to design against

### Failure mode 1 — Hero becomes a subject proxy

Bad:

```txt
POST /api/hero/command supports submit-answer, continue-session, skip, end-session.
```

Fix:

```txt
Only start-task exists in P1. Once the subject session starts, the subject UI uses normal subject commands.
```

### Failure mode 2 — Client controls the subject payload

Bad:

```txt
Client sends subjectId, launcher, mode, itemId, or payload and Hero forwards it.
```

Fix:

```txt
Client sends questId/taskId only. Server derives the launch payload from recomputed quest.
```

### Failure mode 3 — P1 silently starts stale tasks

Bad:

```txt
Task IDs from yesterday still launch today.
```

Fix:

```txt
Server recomputes dateKey/quest/task before launch and rejects stale requests.
```

### Failure mode 4 — Hero writes reward state early

Bad:

```txt
Starting a Hero task writes Coins, Hero progress, monster state, or reward events.
```

Fix:

```txt
P1 start only writes normal subject session state. Completion and Coins wait for P3.
```

### Failure mode 5 — Subject metadata contaminates mastery

Bad:

```txt
heroContext changes scoring, support, Stars, or monster progression.
```

Fix:

```txt
heroContext is opaque session metadata only.
```

### Failure mode 6 — Punctuation flag bypass

Bad:

```txt
Hero launch starts Punctuation even when the Punctuation subject exposure gate is off.
```

Fix:

```txt
Hero launch uses the same subject exposure checks as /api/subjects/:subjectId/command.
```

---

## 30. Copy direction for future P2, not P1

P1 should not add child copy, but it should preserve the future language direction.

Good future child copy:

```txt
Start today’s Hero Quest.
This task keeps your strongest skills strong.
Next: a quick Grammar repair round.
Your Mega Spelling only needs a guardian check today.
```

Bad copy:

```txt
Earn Coins now.
Don’t miss today’s deal.
Do more questions to get rewards.
Your Mega is not enough.
```

P1 should not ship either set of copy to children. It only needs enough debug/admin language to test launch flows.

---

## 31. Future phase boundaries after P1

### Hero Mode P2 — Child-facing Today’s Hero Quest UI

Likely scope:

- dashboard Hero card;
- one primary CTA;
- choose first launchable task;
- launch through P1 route;
- return-to-Hero shell after subject task;
- no Coins yet unless explicitly decided.

### Hero Mode P3 — Completion claim and capped Coins ledger

Likely scope:

- task completion claim;
- verify completed practice session belongs to learner and has matching heroContext;
- idempotent task completion state;
- daily cap;
- honest completion rules;
- no per-question Coins.

### Hero Mode P4 — Hero Camp and Hero Monster Pool

Likely scope:

- Hero-owned monster state;
- initial Hero Pool roster if product confirms;
- unlock/evolve spend actions;
- no random draw;
- confirm/undo/refund policy.

### Hero Mode P5 — Post-Mega hardening

Likely scope:

- retention lapse detector;
- low-frequency maintenance policy;
- metrics review for learning health vs engagement;
- parent/admin explanation copy.

---

## 32. Final P1 rule

When in doubt, P1 should start less and prove more.

A good P1 does not need to look exciting. It needs to make this true:

> A Hero task can start the right subject session, through the existing subject command boundary, with a traceable Hero context, while leaving rewards, completion, child UI, and Hero state completely untouched.

That is the bridge P2 and P3 need. Without it, a child-facing Hero Quest would be built on sand.
