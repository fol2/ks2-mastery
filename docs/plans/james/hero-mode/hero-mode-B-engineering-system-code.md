# Hero Mode B — Engineering / System / Code Reality Review

Version: post-P6 engineering review draft  
Scope: KS2 Mastery platform-level **Hero Mode** implementation  
Purpose: answer whether the codebase really supports the Hero Mode product contract, what is complete, where the reports over-claim or drift, and what the next engineering agent must verify before any wider rollout.

---

## 0. Executive engineering judgement

Hero Mode is now feature-complete through the first production-hardening pass. The P0–P6 stack exists in code:

```txt
P0 shadow scheduler
P1 task launch bridge
P2 child-facing quest shell
P3 completion claims and daily progress
P4 Hero Coins ledger and capped daily economy
P5 Hero Camp and Hero Pool monsters
P6 hardening, metrics, rollout and readiness
```

The implementation is broadly consistent with the completion reports. The main architecture decisions are sound:

- Hero Mode is platform-level, not a subject.
- Subject engines remain the authority for learning.
- Hero tasks are envelopes, not item-level scheduler overrides.
- Hero state lives under existing learner-scoped game state, not new Hero tables.
- Hero commands use Worker mutation safety.
- Economy and Camp are feature-gated and default off.
- Rollback hides surfaces and preserves dormant state.

However, P6 should be read as **ready for staging**, not production default-on. There are a few report inconsistencies and some operational pieces are foundation-only rather than fully wired production systems.

---

## 1. Phase lineage and what each phase really added

| Phase | Main contribution | Engineering truth |
|---|---|---|
| P0 | Shadow scheduler and read model | Read-only foundation; no child UI, no writes |
| P1 | Launch bridge | `POST /api/hero/command` can start subject sessions via normal subject command path |
| P2 | Child-facing shell | HeroQuestCard, subject banner, quest fingerprint, active-session detection |
| P3 | Progress and claims | `claim-task`, Hero progress state, v4 read model, auto-claim/repair |
| P4 | Coins | Daily completion awards +100 Hero Coins once; economy ledger; v5 read model |
| P5 | Hero Camp | Invite/grow Hero-owned monsters using Coins; v6 Camp read model |
| P6 | Hardening | asset fix, idempotency hash fix, metrics, analytics/readiness helpers, rollout docs |

The line of development is coherent. P6 did not add new gameplay; it hardened the existing P0–P5 surface.

---

## 2. Layered architecture

Hero Mode is implemented in four main layers.

### 2.1 Shared pure layer

Directory:

```txt
shared/hero/
```

Responsibilities:

- constants;
- eligibility;
- scheduler;
- task envelope normalisation;
- launch context;
- completion status;
- progress state normalisation;
- economy ledger helpers;
- Hero Pool registry;
- monster spending helpers;
- metrics contract.

Important files:

```txt
shared/hero/constants.js
shared/hero/eligibility.js
shared/hero/scheduler.js
shared/hero/task-envelope.js
shared/hero/launch-context.js
shared/hero/completion-status.js
shared/hero/progress-state.js
shared/hero/economy.js
shared/hero/hero-pool.js
shared/hero/monster-economy.js
shared/hero/metrics-contract.js
```

Rules:

- no Worker imports;
- no React imports;
- no D1/repository imports;
- no subject runtime imports;
- no browser-only APIs;
- pure deterministic helpers only.

### 2.2 Worker Hero layer

Directory:

```txt
worker/src/hero/
```

Responsibilities:

- read model assembly;
- route handler for `GET /api/hero/read-model`;
- launch resolver;
- claim resolver;
- Camp command resolver;
- provider registry;
- analytics/readiness pure derivation modules.

Important files:

```txt
worker/src/hero/read-model.js
worker/src/hero/routes.js
worker/src/hero/launch.js
worker/src/hero/claim.js
worker/src/hero/camp.js
worker/src/hero/providers/
worker/src/hero/launch-adapters/
worker/src/hero/analytics.js
worker/src/hero/readiness.js
```

Rules:

- `worker/src/hero` should not import `worker/src/subjects/runtime.js` directly.
- Subject dispatch stays in `worker/src/app.js`.
- `camp.js` is a pure resolver: no D1, no repository, no subject runtime.
- Event-log mirrors are non-authoritative.

### 2.3 Worker app and repository layer

Core file:

```txt
worker/src/app.js
```

Responsibilities:

- authentication/session boundary;
- same-origin/mutation capability;
- route dispatch;
- subject command delegation;
- Hero command handling;
- structured telemetry logs;
- event mirror writes.

Repository responsibilities:

```txt
worker/src/repository.js
```

- read subject models for Hero providers;
- read/write Hero progress/economy/Camp state;
- run Hero commands through CAS + mutation receipts;
- preserve idempotency and learner revision safety.

Hero authoritative state is stored in:

```txt
child_game_state
system_id = 'hero-mode'
state_json = HeroModeStateV3
```

### 2.4 Client platform and surface layer

Important client/platform files:

```txt
src/platform/hero/hero-client.js
src/platform/hero/hero-ui-model.js
src/platform/hero/hero-camp-model.js
src/platform/hero/hero-monster-assets.js
```

Important surface files:

```txt
src/surfaces/home/HeroQuestCard.jsx
src/surfaces/home/HeroCampPanel.jsx
src/surfaces/home/HeroCampMonsterCard.jsx
src/surfaces/home/HeroCampConfirmation.jsx
src/surfaces/home/HomeSurface.jsx
src/surfaces/subject/HeroTaskBanner.jsx
```

Rules:

- client state is not authoritative;
- server read model owns progress, balance and Camp state;
- client never sends subject command payloads through Hero commands;
- client never sends cost, amount, balance, stage, owned, ledger entry id or subject payload for Camp spending;
- client refreshes after successful Hero actions.

---

## 3. Data model reality

### 3.1 HeroModeState v3

Current state shape after P5/P6:

```ts
type HeroModeStateV3 = {
  version: 3;
  daily: HeroDailyProgress | null;
  recentClaims: HeroClaimRecord[];
  economy: HeroEconomyState;
  heroPool: HeroPoolState;
};
```

### 3.2 Daily progress

The daily block stores:

- dateKey;
- timezone;
- questId;
- questFingerprint;
- schedulerVersion;
- status;
- effort target/planned/completed;
- taskOrder;
- completedTaskIds;
- per-task status;
- completedAt/lastUpdatedAt;
- P4 daily economy marker after award.

This is progress state only. It does not store subject Stars or subject mastery.

### 3.3 Economy

The economy block stores:

- balance;
- lifetimeEarned;
- lifetimeSpent;
- ledger;
- lastUpdatedAt.

P4 added positive earning entries:

```txt
daily-completion-award
```

P5 added negative spending entries:

```txt
monster-invite
monster-grow
```

The normaliser now enforces non-negative balance/lifetime values and ledger polarity rules.

### 3.4 Hero Pool

The heroPool block stores:

- rosterVersion;
- selectedMonsterId;
- monsters by monsterId;
- recentActions;
- lastUpdatedAt.

Only six monster IDs are valid in v1 roster:

```txt
glossbloom
loomrill
mirrane
colisk
hyphang
carillon
```

Unknown monster IDs are dropped by normalisation.

### 3.5 Event log

Event log entries exist for observability and audit mirrors, but the source of truth is the Hero state row.

Do not reconstruct balances or ownership from event_log unless doing reconciliation. State mutation is authoritative.

---

## 4. Command system

### 4.1 `start-task`

Command:

```txt
POST /api/hero/command
command = start-task
```

Flow:

1. validate Hero request;
2. recompute Hero read model;
3. validate questId/fingerprint/taskId;
4. check active Hero/non-Hero sessions;
5. map task envelope to subject `start-session` payload;
6. inject `heroContext`;
7. dispatch through normal subject command mutation path;
8. optionally write a Hero progress marker.

Subject engine remains the learning authority.

### 4.2 `claim-task`

Command:

```txt
POST /api/hero/command
command = claim-task
```

Flow:

1. validate request;
2. read Hero progress state;
3. find expected task;
4. verify completed practice session evidence;
5. require matching `heroContext` when economy is enabled;
6. apply claim to Hero progress;
7. if daily just completed and economy enabled, award daily Coins;
8. write through Hero mutation boundary;
9. emit best-effort event mirrors/structured logs.

P6 added claim command payload into idempotency hash:

```txt
questId + questFingerprint + taskId
```

This closes the P3/P4 class of same-requestId wrong-replay risks.

### 4.3 `unlock-monster`

Internal command name:

```txt
unlock-monster
```

Child copy says “invite”.

Flow:

1. ensure Camp, Economy, Progress, Child UI and parents are enabled;
2. read Hero state;
3. validate monsterId and default branch;
4. derive invite cost from server registry;
5. check balance;
6. create deterministic negative ledger entry;
7. create Hero-owned monster state;
8. write through Hero mutation boundary;
9. mirror event/log.

P6 added command payload to idempotency hash:

```txt
monsterId + branch + targetStage
```

### 4.4 `evolve-monster`

Internal command name:

```txt
evolve-monster
```

Child copy says “grow”.

Flow:

1. ensure Camp flag stack;
2. validate monster ownership;
3. validate next sequential target stage;
4. derive grow cost from server registry;
5. check balance;
6. create deterministic negative ledger entry;
7. update monster stage/investedCoins;
8. update balance/lifetimeSpent;
9. write through Hero mutation boundary.

### 4.5 Idempotency rules

Expected behaviours:

- same requestId + same body replays stored response;
- same requestId + different command identity rejects as idempotency reuse;
- already-owned invite returns safe success with no debit;
- already-reached grow stage returns safe success with no debit;
- stale revision returns stale_write and does not mutate;
- event mirror failure does not mutate state a second time.

---

## 5. Read model reality

The read model has evolved through versions:

```txt
v3 = child UI shell without progress writes
v4 = progress and claim state
v5 = economy block and coinsEnabled
v6 = Hero Camp block
```

Current `buildHeroShadowReadModel` still builds from:

- subject read models;
- eligibility;
- scheduler;
- active sessions;
- progress state;
- recent completed sessions;
- economy flag;
- camp flag.

### v6 camp block

When Camp is enabled, read model v6 includes:

- commandRoute;
- command names;
- rosterVersion;
- balance;
- selectedMonsterId;
- six monster cards;
- ownership;
- stage;
- branch internal field;
- invite/grow costs;
- affordability booleans;
- recentActions.

Affordability is for display only. The command handler re-checks everything.

### Debug stripping

Child-visible responses still strip the debug block. Internal/shadow mode may keep debug data.

---

## 6. Scheduler and provider reality

Hero scheduler remains task-envelope based.

Providers exist for current ready subjects:

```txt
spelling
grammar
punctuation
```

The scheduler does not directly select raw words/concepts/items as the authoritative source of practice. It selects envelopes and subject engines choose actual practice content.

This is still the correct architecture. Do not “optimise” P7 by moving subject item selection into Hero unless there is a deliberate provider-contract change.

---

## 7. UI reality

### 7.1 Dashboard

`HomeSurface` renders HeroQuestCard when Hero is active and renders HeroCampPanel under it when the Camp read model is enabled.

Hero Quest remains primary. Camp is secondary.

### 7.2 Hero Camp

Camp UI currently supports:

- balance display;
- six monster cards;
- invite/grow CTA;
- confirmation dialog;
- success acknowledgement;
- insufficient balance copy;
- fully grown state;
- gentle error/refresh state.

P6 removed child-facing branch choice. The UI should not show Path A/Path B.

### 7.3 Asset adapter

P6 corrected Hero monster asset paths to the real asset layout:

```txt
./assets/monsters/<monsterId>/<branch>/<monsterId>-<branch>-<stage>.<size>.webp
```

The old P5 path shape was wrong and should not be reused.

### 7.4 Client model boundaries

`hero-camp-model.js` intentionally does not import shared/hero. It derives UI labels from the read model. This keeps client rendering separate from shared server contract modules.

---

## 8. Feature flags and rollback

Hero Mode has six ordered flags:

```txt
HERO_MODE_SHADOW_ENABLED
HERO_MODE_LAUNCH_ENABLED
HERO_MODE_CHILD_UI_ENABLED
HERO_MODE_PROGRESS_ENABLED
HERO_MODE_ECONOMY_ENABLED
HERO_MODE_CAMP_ENABLED
```

Production defaults remain false.

Enable bottom-up:

```txt
Shadow → Launch → Child UI → Progress → Economy → Camp
```

Disable top-down:

```txt
Camp → Economy → Progress → Child UI → Launch → Shadow
```

Rollback principle:

```txt
Hide the surface and stop commands at that layer. Do not delete state.
```

---

## 9. Metrics and observability

### 9.1 Metrics contract

`shared/hero/metrics-contract.js` defines 52 metrics across:

- learning health;
- engagement;
- economy/Camp;
- technical safety.

It also defines privacy validation to reject raw child-content fields.

### 9.2 Analytics helpers

`worker/src/hero/analytics.js` provides pure helpers for:

- balance bucket classification;
- hero health indicators;
- reconciliation gap;
- spend pattern classification.

These are currently foundation utilities. Do not assume a full admin metrics route exists unless the code is added later.

### 9.3 Readiness helpers

`worker/src/hero/readiness.js` derives readiness checks from state and flags. It is pure and side-effect-free.

Again, this is a derivation module, not by itself a production dashboard.

---

## 10. Test and validation reality

P6 completion report claims:

```txt
283 new P6 tests, 0 regressions
READY FOR STAGING
```

P6 readiness report says:

```txt
265 P6 unit/integration tests + 117 regression = 382
```

PR #585 says:

```txt
282 P6 tests + 117 P5 regression = 399
```

This inconsistency is not necessarily a product bug, but it is documentation drift. Before any formal production sign-off, reconcile the test counts in the reports.

The important engineering reality is:

- many P6 tests exist;
- the reports consistently claim zero failures;
- the PR was merged;
- I did not independently run the full test suite in this review.

---

## 11. Validation of P1–P6 claims

### 11.1 Claims that look true

The following claims align with code/reports:

- P0 created read-only shadow scheduling/read model.
- P1 added Hero start-task launch bridge.
- P2 added child-facing Hero shell and fingerprinting.
- P3 added claim-task and progress state.
- P4 added daily +100 Hero Coins award and economy ledger.
- P5 added Hero Camp and Hero Pool monsters.
- P6 fixed asset paths and idempotency hash identity.
- Hero state uses existing `child_game_state`, not new D1 Hero tables.
- Production flags default off.
- Hero Camp uses the six intended reserve monsters as Hero-owned monsters.
- P6 metrics/readiness/analytics modules exist.
- P6 rollout and rollback docs exist.

### 11.2 Claims that need wording correction

Some report/playbook wording is stale or imprecise:

1. The readiness/playbook mentions checking a `hero_progress` table or `hero_pool` column. Current architecture stores Hero state in `child_game_state` JSON under `system_id='hero-mode'`.

2. The readiness report says monster assets are small PNGs. The actual assets and adapter use `.webp` paths.

3. The readiness report describes U4 as “event IDs derived from learnerId + dateKey + taskIndex”, while P6 app patch uses deterministic event IDs from requestId suffixes for claim events and ledgerEntryId for Camp events. The latter is the code truth.

4. Test counts differ across completion report, readiness report, and PR body.

5. P7 recommendations in readiness mention “advanced camp mechanics (monster evolution, trading)”. Monster growth already exists; trading should not be assumed desirable.

### 11.3 Remaining gaps before production default-on

Not blockers for staging, but must be resolved before wider rollout:

- run manual browser QA with all six flags enabled;
- verify dashboard wiring in a real deployed environment;
- reconcile report/test-count drift;
- verify analytics events reach the intended production sink, not only console logs;
- confirm whether per-account bucketing/flag overrides in rollout playbook are implemented or aspirational;
- add an admin/ops route if readiness/metrics need live visibility;
- collect 2–4 weeks of staging/internal production metrics before P7.

---

## 12. Known architectural constraints

### 12.1 No new subject expansion through Hero

Hero Mode can include Arithmetic, Reasoning, and Reading only after those subjects have proper Worker-backed engines and Hero providers.

Do not create fake Hero tasks for placeholder subjects.

### 12.2 No item-level authority in Hero

Hero task envelopes are the current abstraction. Any move to item-level Hero selection must be a deliberate provider-contract phase with strong tests.

### 12.3 No economy expansion before measurement

P6 says to defer P7 until metrics accumulate. Do not add new earning mechanics simply because the Camp loop is available.

### 12.4 No random reward mechanics

This is a hard product and engineering boundary.

No loot boxes, no random draws, no chance-based reveals, no paid-like shops.

---

## 13. What has genuinely been completed

Genuinely completed by P6:

- full core feature loop from scheduling to Camp spending;
- six-layer flag stack;
- default-off production config;
- state migration to v3;
- economy ledger with earning and spending entries;
- deterministic spend IDs;
- Camp asset path correction;
- branch policy simplification;
- event/log enrichment;
- metrics contract;
- analytics/readiness pure helpers;
- rollout and rollback playbook;
- strong structural boundaries around subject state.

---

## 14. What is not yet completed

Not yet completed or not proven by code reviewed here:

- general availability rollout;
- production cohort bucketing implementation, unless separately verified;
- live admin dashboard for Hero metrics;
- parent-facing Hero reporting;
- long-term ledger archival;
- six-subject expansion;
- refund/undo policy;
- branch choice UI;
- real-world proof that Hero Mode improves learning outcomes;
- post-rollout thresholds based on actual data.

---

## 15. Recommended next engineering posture

Do not start P7 immediately.

Recommended order:

1. Fix/clean documentation drift in P6 readiness/playbook.
2. Run Ring 1 local/dev seeded manually.
3. Run Ring 2 staging seeded with all six flags.
4. Verify asset loading and Camp actions in an actual browser.
5. Confirm telemetry sink and event shapes.
6. Collect multi-day staging data.
7. Only then decide whether P7 is needed.

The next agent should treat P6 as a staging-readiness checkpoint, not a mandate to add more features.

---

## 16. Risk register

| Risk | Severity | Status | Recommended action |
|---|---:|---|---|
| Report test count mismatch | Low | Open documentation drift | Reconcile completion/readiness/PR numbers |
| Stale rollout wording (`hero_progress`, `hero_pool column`) | Medium | Open docs drift | Correct rollout playbook wording |
| Assets use `.webp`, readiness says PNG | Low | Open docs drift | Correct readiness report or future A/B docs |
| Analytics modules have no visible production route | Medium | Accepted foundation | Add admin route only after rollout need is clear |
| Per-account bucketing may be aspirational | Medium | Needs verification | Confirm flag infrastructure before cohort rollout |
| Real browser QA not proven in reports | Medium | Open | Run manual QA with flags enabled |
| P7 trading suggestion conflicts with calm economy | Medium | Product risk | Do not pursue without separate product review |
| Child learning impact unproven | High but expected | Requires data | 2–4 weeks observation before P7/default-on |

---

## 17. Engineering glossary

| Term | Code meaning |
|---|---|
| Hero read model | Worker-built response from `worker/src/hero/read-model.js` |
| Hero command | `POST /api/hero/command` command family |
| `heroContext` | Server-created session linkage for Hero-launched subject sessions |
| Hero progress state | Daily progress in `child_game_state` Hero state row |
| Economy ledger | Balance-affecting entries in Hero state economy block |
| Hero Pool | Hero-owned monster state inside Hero state v3 |
| Event mirror | Non-authoritative `event_log` copy of state mutation |
| Mutation receipt | Idempotency record keyed by request id and payload hash |
| CAS | Compare-and-swap through learner revision |
| Flag hierarchy | Ordered Hero feature flags, parent before child |

---

## 18. Reference paths

Reports and planning:

- `docs/plans/james/hero-mode/hero-mode-p0-completion-report.md`
- `docs/plans/james/hero-mode/hero-mode-p1-completion-report.md`
- `docs/plans/james/hero-mode/hero-mode-p2-completion-report.md`
- `docs/plans/james/hero-mode/hero-mode-p3-completion-report.md`
- `docs/plans/james/hero-mode/hero-mode-p4-completion-report.md`
- `docs/plans/james/hero-mode/hero-mode-p5-completion-report.md`
- `docs/plans/james/hero-mode/hero-mode-p6-completion-report.md`
- `docs/plans/james/hero-mode/hero-mode-p6-readiness-report.md`
- `docs/plans/james/hero-mode/hero-mode-p6-rollout-playbook.md`

Core shared modules:

- `shared/hero/constants.js`
- `shared/hero/eligibility.js`
- `shared/hero/scheduler.js`
- `shared/hero/task-envelope.js`
- `shared/hero/launch-context.js`
- `shared/hero/completion-status.js`
- `shared/hero/progress-state.js`
- `shared/hero/economy.js`
- `shared/hero/hero-pool.js`
- `shared/hero/monster-economy.js`
- `shared/hero/metrics-contract.js`

Core Worker modules:

- `worker/src/hero/read-model.js`
- `worker/src/hero/routes.js`
- `worker/src/hero/launch.js`
- `worker/src/hero/claim.js`
- `worker/src/hero/camp.js`
- `worker/src/hero/analytics.js`
- `worker/src/hero/readiness.js`
- `worker/src/repository.js`
- `worker/src/app.js`

Core client modules:

- `src/platform/hero/hero-client.js`
- `src/platform/hero/hero-ui-model.js`
- `src/platform/hero/hero-camp-model.js`
- `src/platform/hero/hero-monster-assets.js`
- `src/surfaces/home/HeroQuestCard.jsx`
- `src/surfaces/home/HeroCampPanel.jsx`
- `src/surfaces/home/HeroCampMonsterCard.jsx`
- `src/surfaces/home/HeroCampConfirmation.jsx`
- `src/surfaces/home/HomeSurface.jsx`
- `src/surfaces/subject/HeroTaskBanner.jsx`

Configuration:

- `wrangler.jsonc`
- `worker/wrangler.example.jsonc`

