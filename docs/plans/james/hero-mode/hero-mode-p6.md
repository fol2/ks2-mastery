---
title: "Hero Mode P6 — Production Hardening, Metrics, Rollout, and Learning Health"
type: product-engineering-origin
status: draft
date: 2026-04-29
owner: james
intended_path: docs/plans/james/hero-mode/hero-mode-p6.md
phase: P6
origin: docs/plans/james/hero-mode/hero-mode-p5.md
previous_completion_report: docs/plans/james/hero-mode/hero-mode-p5-completion-report.md
---

# Hero Mode P6 — Production Hardening, Metrics, Rollout, and Learning Health

## 1. Guiding sentence

Hero Mode P6 proves that the full Hero Mode loop is safe enough to roll out: a child can complete a scientifically chosen daily quest, earn capped Hero Coins, choose how to grow Hero-owned Camp monsters, and return over time without the system damaging learning quality, subject mastery integrity, or trust.

P6 should answer this question:

> "Can Hero Mode run in production with strong observability, rollout controls, learning-health guardrails, reward-safety monitoring, asset/UI hardening, and rollback paths — while preserving subject ownership of learning and keeping Hero Camp calm, deterministic, and non-pressurising?"

P6 is successful when the team can:

1. enable the full Hero Mode flag stack safely in staging and selected production cohorts;
2. observe Hero Quest learning-health metrics, reward-health metrics, Camp economy metrics, and technical-safety metrics;
3. detect and respond to rushing, skipping, easy-task preference, reward chasing, duplicate debit/credit attempts, and state corruption;
4. prove that subject Stars, mastery, and subject monsters are not mutated by Hero economy or Camp commands;
5. verify that Hero Camp assets, dashboard wiring, confirmation flows, and accessibility work in a real browser;
6. define rollback playbooks for Camp, Economy, Progress, Child UI, Launch, and Shadow layers;
7. produce a go/no-go report for broader production rollout;
8. keep P6 free of new gameplay, new earning mechanics, new monsters, leaderboards, loot boxes, streak pressure, or paid-currency concepts.

P6 is a hardening and measurement phase. It is not a feature-expansion phase.

---

## 2. Current state after P5

P5 should be treated as the completed earn-and-spend feature foundation.

The current Hero Mode stack is:

```txt
P0 — shadow scheduler and read model
P1 — launchable task envelopes and subject command delegation
P2 — child-facing Hero Quest shell
P3 — completion claims and daily progress
P4 — Hero Coins ledger and capped daily completion award
P5 — Hero Camp, Hero Pool monsters, invite/grow spending
```

The expected flag hierarchy is:

```txt
HERO_MODE_SHADOW_ENABLED
  └─ HERO_MODE_LAUNCH_ENABLED
      └─ HERO_MODE_CHILD_UI_ENABLED
          └─ HERO_MODE_PROGRESS_ENABLED
              └─ HERO_MODE_ECONOMY_ENABLED
                  └─ HERO_MODE_CAMP_ENABLED
```

P6 must not weaken this hierarchy. Every deeper layer depends on the earlier layers.

P5 introduced:

- Hero Pool registry with six initial Hero-owned monsters;
- invite and grow spending commands;
- Hero state v3 with `heroPool`;
- economy ledger debit entries for monster invite/grow;
- read model v6 with a child-safe Camp block;
- Hero Camp UI panel and monster cards;
- Camp feature flag defaulting to off;
- no new D1 tables;
- no subject state mutation from Camp;
- no new earning sources.

P6 must validate these claims under production-like conditions, not just pure-unit fixtures.

---

## 3. P6 strategic decision: harden before expanding

Do not add new Hero gameplay in P6.

P6 must not add:

- new Hero monsters;
- new earning mechanics;
- per-task Coins;
- per-question Coins;
- bonus Coins;
- streak rewards;
- leaderboards;
- trading or gifting;
- random draws;
- shop/deal mechanics;
- paid currency;
- parent-set allowances;
- branch switching;
- refunds as a child-facing feature unless explicitly scoped as a safety/repair tool;
- six-subject expansion;
- item-level Hero scheduling;
- new subject mastery rules.

The product already has enough moving parts:

```txt
Daily Quest → verified completion → capped Coins → Camp invite/grow
```

The next risk is not lack of features. The next risk is unobserved harm: rushing, reward chasing, state inconsistency, broken assets, accidental subject contamination, or rollout without enough evidence.

P6 should therefore focus on:

```txt
measure, harden, reconcile, roll out, and stop if metrics go bad
```

---

## 4. P6 preflight blockers

Before enabling Hero Camp or Economy beyond internal/staging users, P6 must address the following preflight blockers. The implementation plan may split these into separate units, but they should be completed before rollout.

### 4.1 Verify Hero Camp asset paths

P5 added `src/platform/hero/hero-monster-assets.js` as a client-only asset adapter. It must be verified against the actual asset layout.

The existing platform monster helper uses this layout:

```txt
./assets/monsters/<monsterId>/<branch>/<monsterId>-<branch>-<stage>.<size>.webp
```

For example:

```txt
./assets/monsters/glossbloom/b1/glossbloom-b1-0.640.webp
```

P6 must ensure Hero Camp image rendering follows the real layout or imports the existing client-safe helper. If the current adapter builds a different path, it must be fixed before production rollout.

Acceptance:

- each of the six Hero Pool monsters renders stage 0, stage 1, stage 2, stage 3, and stage 4 images where assets exist;
- missing assets fall back to a real fallback path, not another broken path;
- image failures do not break the Camp card;
- tests cover at least one real known asset path for `glossbloom/b1`;
- no Worker/shared code imports client asset helpers.

### 4.2 Verify dashboard model wiring for Hero Camp

P5 integrates `HeroCampPanel` into `HomeSurface`. P6 must prove the dashboard runtime passes everything the panel needs:

```txt
model.heroReadModel
model.heroClient
model.learner.id
actions.refreshHeroQuest
```

This must be a real integration test, not just a component fixture.

Acceptance:

- with all Hero flags enabled and a v6 read model loaded, the dashboard renders Hero Quest and Hero Camp;
- clicking an affordable invite button opens confirmation;
- confirming calls the actual `heroClient.unlockMonster` method;
- after success, read model refresh runs and the Camp state updates;
- if `heroClient` is missing, the dashboard does not crash and surfaces a safe disabled state.

### 4.3 Verify Hero command idempotency payload coverage

P5 Camp commands must be protected by mutation receipts, stale write checks, already-owned/already-stage checks, and deterministic ledger IDs.

P6 must explicitly verify that the mutation receipt hash includes the command-specific identity. For Camp commands, that means at minimum:

```txt
command
learnerId
monsterId
branch for unlock-monster
targetStage for evolve-monster
```

If the route passes only `{ command, learnerId, requestId, expectedLearnerRevision }` into the Hero mutation boundary, then two different Camp actions accidentally sharing a `requestId` may replay the wrong response instead of raising idempotency reuse. That is not acceptable for a spending surface.

Acceptance:

- same requestId + same command body replays exactly;
- same requestId + different `monsterId` rejects as `idempotency_reuse`;
- same requestId + different `branch` rejects as `idempotency_reuse`;
- same requestId + different `targetStage` rejects as `idempotency_reuse`;
- tests prove the stored receipt hash changes when the command-specific body changes;
- the same audit should be applied to `claim-task` for `questId`, `questFingerprint`, and `taskId`.

### 4.4 Decide the branch-choice product rule

P5 registry supports `b1` and `b2` branches. If the UI always sends a default branch, then the child is not actually choosing a branch.

P6 must make this explicit:

Option A — no branch choice yet:

- use a single default branch;
- hide “Path A/Path B” language for unowned monsters;
- do not imply branch choice in copy;
- keep branch switching as a future non-goal.

Option B — branch choice is in scope:

- show a clear Path A / Path B selector before confirmation;
- explain that the choice is cosmetic;
- store selected branch in Hero-owned state;
- test both branches for invite and rendering;
- do not allow switching after confirmation in P6.

Acceptance:

- product copy and UI behaviour match the chosen rule;
- there is no “fake choice” where copy implies a path but the app silently chooses one.

### 4.5 Reconcile P5 completion-report test counts

The P5 completion report and PR summary must agree on the number of tests and regression scope.

Acceptance:

- update the completion report or PR-linked docs to use one consistent test count;
- note whether the count is P5-specific, all Hero tests, or full Worker tests;
- avoid claiming local/CI execution that was not actually run in the final verification environment.

### 4.6 Make Camp event mirror IDs deterministic or document why not

P4 uses deterministic ledger-derived event IDs for `hero.coins.awarded`. P5 Camp event mirror rows are non-authoritative, but P6 should still decide whether to make them deterministic:

```txt
hero-evt-<ledgerEntryId>
```

This is preferred because it makes event-log reconciliation easier.

If the team keeps random event IDs, document clearly that:

- the ledger is authoritative;
- event log is best-effort telemetry only;
- event-log duplicate analysis must deduplicate by `ledgerEntryId`.

Acceptance:

- either deterministic Camp event IDs are implemented, or a reconciliation rule deduplicates by `ledgerEntryId`;
- analytics never counts Camp actions from raw event row count alone.

---

## 5. P6 scope

P6 has eight product/engineering outcomes.

### 5.1 Hero production readiness gates

Define hard gates for enabling each flag in staging and production.

The go/no-go checklist must include:

- all relevant tests passing;
- successful browser smoke test for the full flow;
- metrics dashboard available;
- rollback plan tested;
- feature flags verified default-off in production config;
- no child-visible debug leak;
- no forbidden pressure vocabulary;
- no subject state mutation from Hero economy/Camp;
- no duplicate credit or debit in multi-tab tests;
- asset rendering verified;
- accessibility smoke test passed.

### 5.2 Metrics and observability foundation

Add structured analytics for four categories:

1. learning health;
2. engagement health;
3. reward/economy health;
4. technical safety.

These metrics should be generated from existing authoritative sources where possible:

- Hero read model state;
- Hero `child_game_state`;
- `practice_sessions`;
- `event_log` mirrors;
- structured Worker logs;
- client-side once-per-visit logs.

Do not build analytics from child-local assumptions.

### 5.3 Learning-health guardrails

P6 must prove that Hero Mode is not damaging learning.

Monitor:

- independent-first attempt rate;
- support-before-answer rate;
- session completion rate;
- task skip/abandon rate;
- too-fast attempt rate if available;
- due debt over time;
- weak item repair success;
- retention-after-secure success;
- post-Mega lapse rate;
- subject mix balance;
- repeated easy-subject preference;
- subject mastery inflation.

The key product principle remains:

```txt
Hero Mode should increase return motivation without lowering learning quality.
```

### 5.4 Reward-health and Camp-health guardrails

Monitor:

- Hero Quest start rate;
- Hero Quest completion rate;
- daily Coins awarded per learner per day;
- duplicate award prevented count;
- Camp open rate;
- first invite rate;
- monster distribution;
- grow action rate;
- insufficient balance rate;
- balance hoarding;
- rapid spend patterns;
- refund/repair requests if any;
- stale write rate on Camp commands;
- idempotency reuse attempts;
- event-log vs ledger reconciliation gaps.

### 5.5 Technical hardening

Harden edge cases across the full system:

- date rollover and Europe/London DST;
- claim grace window;
- stale quest and stale fingerprint;
- two tabs launching/claiming/spending;
- request replay;
- network drop after mutation before response;
- corrupt Hero state normalisation;
- v1/v2/v3 Hero state migration;
- malformed ledger entries;
- ledger retention cap;
- event-log mirror failure;
- read-model latency;
- capacity/path instrumentation;
- missing assets;
- accessibility states;
- reduced motion;
- mobile layout;
- demo/read-only account behaviour;
- reset learner behaviour.

### 5.6 Admin/parent explanation

P6 should add a minimal parent/admin-facing explanation, not a child pressure surface.

Parent copy should explain:

- Hero Quest is a daily learning plan across ready subjects;
- subject Stars and mastery remain subject-owned;
- Hero Coins are capped and earned by completing the daily Hero Quest;
- Hero Camp is a child choice surface, not a shop or random reward;
- no paid currency exists;
- Hero Mode can be disabled/hidden if needed by rollout flag.

This can be a short Parent Hub/help-panel block or an internal ops doc if the Parent Hub surface is not ready for it.

### 5.7 Rollout and rollback playbooks

P6 must define rollout rings:

1. local/dev with seeded Hero state;
2. staging with seeded balances and all six monsters;
3. staging with real multi-day earning;
4. internal production account;
5. tiny production cohort;
6. wider production cohort;
7. default-on decision only after metric review.

Rollback must be possible at each flag layer:

```txt
HERO_MODE_CAMP_ENABLED=false       // hide Camp and reject spend commands
HERO_MODE_ECONOMY_ENABLED=false    // hide Coins and stop new awards/spends
HERO_MODE_PROGRESS_ENABLED=false   // stop claims/progress writes
HERO_MODE_CHILD_UI_ENABLED=false   // hide child card
HERO_MODE_LAUNCH_ENABLED=false     // stop Hero launches
HERO_MODE_SHADOW_ENABLED=false     // stop Hero read model
```

Rollback must preserve state dormant. It must not wipe balances, ledger, or monster ownership.

### 5.8 Go/no-go report

P6 should end with a written readiness report:

```txt
docs/plans/james/hero-mode/hero-mode-p6-readiness-report.md
```

This report should include:

- which flags were tested;
- test results;
- smoke-test evidence;
- metric baseline;
- known issues;
- accepted risks;
- rollout recommendation;
- rollback steps;
- whether P7 is needed.

---

## 6. P6 non-goals

P6 does not include:

1. new Hero monsters;
2. new Hero Camp branches beyond the branch policy decision;
3. branch switching after invite;
4. refunds/undo as a child-facing flow unless explicitly scoped as a repair/admin tool;
5. per-question Coins;
6. bonus Coins;
7. streak rewards;
8. random rewards;
9. loot boxes;
10. shop/deal mechanics;
11. paid currency;
12. leaderboards;
13. trading/gifting;
14. parent-set coin allowances;
15. six-subject expansion;
16. item-level Hero scheduling;
17. subject mastery changes;
18. Grammar/Punctuation/Spelling Star changes;
19. subject monster roster changes;
20. new Hero-specific D1 tables unless long-term ledger archival is explicitly approved.

---

## 7. Metrics design

### 7.1 Learning-health metrics

Recommended metric names:

```txt
hero_learning_independent_first_attempt_rate
hero_learning_support_before_answer_rate
hero_learning_task_completion_rate
hero_learning_task_abandon_rate
hero_learning_retention_after_secure_pass_rate
hero_learning_recent_lapse_repair_rate
hero_learning_due_debt_delta
hero_learning_weak_item_recovery_days
hero_learning_post_mega_lapse_rate
hero_learning_subject_mix_share
hero_learning_subject_easy_preference_score
hero_learning_mastery_inflation_flag
```

Minimum dimensions:

```txt
learnerId hash / cohort id
subjectId
dateKey
hero task intent
launcher
eligible subject count
postMega flag
ready subject set
```

Do not log raw child answers in Hero analytics.

### 7.2 Engagement metrics

Recommended:

```txt
hero_engagement_card_rendered
hero_engagement_quest_started
hero_engagement_first_task_started
hero_engagement_task_completed
hero_engagement_daily_completed
hero_engagement_return_next_day
hero_engagement_return_next_7_days
hero_engagement_extra_practice_after_daily_complete
hero_engagement_dropoff_after_task_index
hero_engagement_subject_continue_from_hero
```

### 7.3 Economy and Camp metrics

Recommended:

```txt
hero_economy_daily_coins_awarded
hero_economy_duplicate_award_prevented
hero_economy_balance_after_award
hero_economy_balance_bucket
hero_economy_ledger_entry_count
hero_camp_opened
hero_camp_first_invite
hero_camp_monster_invited
hero_camp_monster_grown
hero_camp_insufficient_coins
hero_camp_duplicate_spend_prevented
hero_camp_stale_write
hero_camp_idempotency_reuse
hero_camp_balance_after_spend
hero_camp_monster_distribution
hero_camp_fully_grown_count
hero_camp_hoarding_score
hero_camp_rapid_spend_flag
```

### 7.4 Technical safety metrics

Recommended:

```txt
hero_tech_read_model_latency_ms
hero_tech_read_model_size_bytes
hero_tech_command_latency_ms
hero_tech_state_size_bytes
hero_tech_corrupt_state_repaired
hero_tech_state_migration_applied
hero_tech_asset_load_error
hero_tech_event_log_mirror_failed
hero_tech_revision_stale_write
hero_tech_retry_after_stale_write
hero_tech_two_tab_conflict
hero_tech_flag_misconfiguration
```

### 7.5 Metric privacy and retention

P6 metrics should:

- avoid raw answer text;
- avoid raw prompt text unless already public and necessary;
- use learner/account identifiers consistently with existing platform analytics policy;
- avoid collecting child free-text;
- keep child-visible UI free from metric labels;
- document retention expectations.

---

## 8. Analytics read model

P6 should add a server-side analytics/readiness layer rather than rely on ad hoc console log inspection.

Recommended files:

```txt
shared/hero/metrics-contract.js
worker/src/hero/analytics.js
worker/src/hero/readiness.js
tests/hero-p6-metrics-contract.test.js
tests/hero-p6-readiness.test.js
```

Possible route options:

```txt
GET /api/admin/hero/readiness
GET /api/admin/hero/metrics
```

Only expose these to authorised parent/admin roles according to existing hub permissions. If admin route scope is too large for P6, generate a script or internal fixture report instead.

The child dashboard must not receive internal metric aggregates.

---

## 9. Technical hardening requirements

### 9.1 State migration and corruption

Test:

- v1 state migrates to v3;
- v2 state migrates to v3;
- malformed `economy` block normalises safely;
- malformed `heroPool` block normalises safely;
- unknown monster IDs are dropped;
- invalid stages are clamped;
- invalid branches are handled according to product rule;
- negative balance is repaired to zero;
- invalid ledger entries are dropped or quarantined;
- read model does not crash from corrupt state.

### 9.2 Ledger and reconciliation

Test:

- earning ledger entries are positive;
- spending ledger entries are negative;
- `balanceAfter` never negative;
- `lifetimeEarned` unchanged by spending;
- `lifetimeSpent` unchanged by earning;
- ledger retention does not remove the current daily award marker;
- event-log mirror can be missing without corrupting state;
- event-log mirror can be duplicated without double-counting metrics when deduped by ledger entry id.

### 9.3 Multi-tab and request replay

Test:

- two tabs invite same monster;
- two tabs grow same monster;
- two tabs spend on different monsters with the same stale revision;
- same requestId replay same body;
- same requestId replay different monster body;
- network drop after successful mutation then retry;
- already-owned and already-stage responses do not bump balance or revision unnecessarily unless the mutation policy requires a replayed response.

### 9.4 Date/time

Test:

- Hero daily completion across midnight;
- Camp spending across midnight;
- claim grace window across Europe/London DST start/end;
- dateKey generation stable across reloads;
- today’s economy block does not hide old balance;
- old daily state does not award again after date rollover.

### 9.5 Asset and UI robustness

Test:

- all six monsters render at stage 0;
- owned stage 1–4 render or fall back gracefully;
- branch fallback works;
- image `onError` does not loop indefinitely;
- mobile card layout fits 320px width;
- keyboard can reach invite/grow/confirm/cancel;
- confirmation dialog traps focus or follows existing modal accessibility pattern;
- `aria-live` announcements are not noisy;
- reduced motion respected;
- screen reader labels are meaningful.

### 9.6 Performance and capacity

Test:

- `/api/hero/read-model` v6 payload size is bounded;
- read-model latency stays within current capacity budget;
- `POST /api/hero/command` Camp actions do not exceed acceptable query count;
- no large asset preloading from all stages unless explicitly intended;
- Hero Camp does not block Hero Quest render when assets fail.

---

## 10. Rollout plan

### 10.1 Local/dev

Enable all flags locally.

Seed:

- one learner with zero Coins;
- one learner with 150 Coins;
- one learner with 3650 Coins;
- one learner with one invited monster;
- one learner with all six fully grown;
- one learner with corrupt Hero state.

Verify all states manually and with automated smoke tests.

### 10.2 Staging seeded

Enable all flags for staging.

Run:

- full daily quest completion;
- final claim awards Coins;
- open Camp;
- invite one monster;
- grow one monster;
- insufficient balance case;
- reload after every step;
- two-tab duplicate invite/grow;
- rollback Camp flag and re-enable.

### 10.3 Staging real multi-day

Use real daily earning over multiple days.

Monitor:

- daily completion;
- award exactly once per day;
- balance accumulation;
- Camp spend timing;
- subject completion behaviour;
- no increase in suspicious rushing/skipping.

### 10.4 Internal production

Enable for internal production accounts only.

Monitor for at least several daily cycles.

Go/no-go criteria:

- no duplicate credit/debit;
- no asset failures above accepted threshold;
- no high stale-write spikes;
- no subject mastery contamination;
- no support tickets/confusing copy;
- no obvious reward-chasing signals.

### 10.5 Limited production cohort

Small cohort, preferably opt-in/internal family accounts first.

Review:

- learning-health metrics;
- engagement metrics;
- economy metrics;
- qualitative child/parent feedback;
- error logs.

### 10.6 Wider rollout

Only after the readiness report is accepted.

Do not default-on for all accounts if core learning metrics degrade.

---

## 11. Rollback playbooks

### 11.1 Camp rollback

Set:

```txt
HERO_MODE_CAMP_ENABLED=false
```

Expected:

- Camp UI hidden;
- invite/grow commands reject;
- Hero state preserved;
- P4 Coins earning continues;
- no monster ownership is deleted.

### 11.2 Economy rollback

Set:

```txt
HERO_MODE_ECONOMY_ENABLED=false
```

Expected:

- Coins hidden;
- no new daily awards;
- Camp hidden because Camp depends on Economy;
- progress continues if progress flag remains on;
- stored balance/ledger preserved dormant.

### 11.3 Progress rollback

Set:

```txt
HERO_MODE_PROGRESS_ENABLED=false
```

Expected:

- no claim-task;
- no progress writes;
- Hero card may fall back to P2/P3 disabled depending implementation;
- subject practice still works.

### 11.4 Child UI rollback

Set:

```txt
HERO_MODE_CHILD_UI_ENABLED=false
```

Expected:

- child Hero card hidden;
- subject cards remain usable;
- Worker shadow/launch may remain available only if flags allow internal testing.

### 11.5 Launch rollback

Set:

```txt
HERO_MODE_LAUNCH_ENABLED=false
```

Expected:

- Hero tasks cannot start;
- subject routes remain usable.

### 11.6 Full rollback

Set:

```txt
HERO_MODE_SHADOW_ENABLED=false
```

Expected:

- Hero read model unavailable;
- app falls back to existing dashboard pattern.

---

## 12. Testing requirements

P6 requires tests in these groups.

### 12.1 Preflight regression tests

- asset path real-layout test;
- dashboard model wiring test;
- command idempotency payload-hash test;
- branch-choice policy test;
- test-count/report consistency check if maintained through a fixture.

### 12.2 Metrics tests

- metric contract validation;
- metric event shape validation;
- no raw answers in Hero metric payloads;
- child read model does not expose analytics debug;
- event-log dedupe by ledger id.

### 12.3 Learning-health tests

- scheduler output preserves reason tags;
- post-Mega subjects receive maintenance, not high-frequency grind;
- due/weak priority unchanged by Coins/Camp;
- subject mix cap still applied;
- Hero mode does not alter subject Stars/mastery.

### 12.4 Economy/Camp tests

- duplicate invite/grow;
- insufficient balance;
- stale write;
- corrupt balance;
- malformed ledger;
- missing heroPool state;
- all six monsters;
- fully grown state;
- branch path, if enabled.

### 12.5 Browser smoke tests

If Playwright or similar browser tests are available, add a minimum smoke suite:

```txt
dashboard renders Hero Quest + Hero Camp
daily complete shows Coins
open Camp
invite monster
reload
grow monster
rollback Camp flag
```

If browser tests are too expensive for the standard suite, create a manual QA script and run it before readiness sign-off.

---

## 13. Acceptance criteria

P6 is complete when:

1. all P6 preflight blockers are resolved or explicitly accepted with mitigation;
2. full Hero Mode can be exercised in staging from Quest start to Camp grow;
3. Hero Camp assets render or fall back correctly;
4. Camp spending idempotency includes command-specific identity;
5. learning-health metrics exist and are documented;
6. reward/economy metrics exist and are documented;
7. technical-safety metrics exist and are documented;
8. production flags remain default-off unless explicitly approved;
9. rollout and rollback playbooks are tested;
10. no Hero command writes subject Stars, subject mastery, or subject monster state;
11. no pressure/gambling/shop vocabulary appears in child surfaces;
12. readiness report is written with a clear go/no-go recommendation.

---

## 14. Suggested implementation units

The implementation-planning agent should inspect the repo and choose exact files/tests, but a sensible unit breakdown is:

```txt
P6-U1  Preflight fixes: assets, dashboard wiring, idempotency payload hash
P6-U2  Branch-choice policy and UI/copy alignment
P6-U3  Metrics contract and event taxonomy
P6-U4  Worker analytics/readiness read model
P6-U5  Learning-health guardrail metrics
P6-U6  Economy/Camp reconciliation metrics
P6-U7  State migration/corruption hardening
P6-U8  Browser/manual smoke-test harness
P6-U9  Rollout/rollback playbooks and readiness report
P6-U10 Boundary and regression test closure
```

P6-U1 should happen first. Do not spend effort on dashboards before the known production blockers are closed.

---

## 15. P7 decision

P6 should end by deciding whether P7 is needed.

Possible P7 scopes:

- six-subject expansion when Arithmetic, Reasoning, and Reading are Worker-backed;
- advanced Hero scheduler provider contracts;
- refund/undo/admin repair tools;
- additional Hero Pool monsters;
- parent-facing reporting;
- long-term ledger archival table;
- A/B testing of Camp placement;
- branch choice expansion.

Do not pre-commit to P7 until P6 metrics show the current Hero loop is healthy.

---

## 16. Final P6 sentence

Hero Mode P6 turns the completed Hero Mode feature into a production-ready system: measured, observable, reversible, and learning-safe — with enough evidence to decide whether Hero Mode should roll out wider or pause for correction.
