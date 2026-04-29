# Hero Mode pA1 — Staging Rollout Contract and Measurement Baseline

Status: proposed A-series phase contract  
Date: 2026-04-29  
Scope: KS2 Mastery platform-level Hero Mode only  
Series: A1 starts a new post-P6 phase line. It is not P7 and should not inherit old phase naming.

---

## 0. Phase position

Hero Mode has a coherent P0–P6 implementation line:

- P0 shadow scheduler and read model;
- P1 launch bridge into subject command paths;
- P2 child-facing Hero Quest shell;
- P3 task completion claims and daily progress;
- P4 capped Hero Coins ledger;
- P5 Hero Camp and Hero Pool monsters;
- P6 production-hardening foundations, metrics contract, analytics/readiness helpers, and rollout playbook.

The correct reading after P6 is:

```txt
Hero Mode is staging-ready.
Hero Mode is not production default-on.
```

pA1 must not add a new gameplay layer. Its job is to turn the P6 implementation from “reported ready for staging” into “observed, measured, reversible, and contract-clean across staging and, if earned, internal production”.

The phase must preserve the product truth established by the architecture/product contract:

```txt
Ready subject engines own learning.
Hero Mode owns the daily contract, capped economy, and Hero Camp.
```

If pA1 expands gameplay before this is proven, it will amplify the wrong risks: reward chasing, duplicate state, misleading mastery, and weak operational confidence.

---

## 1. One-sentence outcome

pA1 proves that default-off Hero Mode can run through seeded local/dev, seeded staging, multi-day staging, and an optional internal-production ring with verified telemetry, safe rollback, no subject-mastery mutation, no duplicate economy writes, and no product/documentation drift that would mislead the next rollout planner.

---

## 2. Product contract for pA1

### 2.1 What Hero Mode remains

Hero Mode remains one daily mission across ready subjects. It helps the child answer:

```txt
What is the best thing for me to do today?
```

It may select task envelopes from ready subjects, track honest completion, award capped Hero Coins for daily completion, and offer a calm Hero Camp where Hero-owned monsters can be invited or grown.

It may not become a seventh subject, a per-question reward engine, a streak system, a shop, or an item-level scheduler that bypasses subject engines.

### 2.2 Ready-subject truth

The ready-subject model remains part of the product contract.

Current ready subjects:

```txt
spelling
grammar
punctuation
```

Current locked/placeholder subjects:

```txt
arithmetic
reasoning
reading
```

Child-facing copy may say that Hero Quest uses ready subjects and that more subjects can join later. It must not imply six-subject completion.

pA1 must verify that locked subjects do not break the read model, scheduler, Home surface, Hero Quest card, or rollout metrics.

### 2.3 Learning authority boundary

A subject engine owns:

- item selection inside that subject;
- marking;
- hints, support, feedback, and retries;
- subject progress;
- subject Stars;
- subject monsters;
- subject mastery and Mega status.

Hero Mode owns:

- daily Hero Quest planning;
- ready/locked subject eligibility;
- task envelopes;
- Hero context passed into subject sessions;
- completion claims;
- daily Hero progress;
- capped Hero Coins;
- Hero-owned economy ledger;
- Hero Camp and Hero Pool monster state;
- rollout metrics and safety signals.

pA1 must treat this as a hard boundary. Hero commands must not mint subject Stars, change subject mastery, downgrade a learner, or mark subject answers.

### 2.4 Economy boundary

Hero Coins remain calm, capped, and non-extractive.

Permitted in pA1:

- +100 Hero Coins once for a completed daily Hero Quest, when the economy flag is enabled;
- deterministic ledger entries;
- deterministic Camp spend for invite/grow actions;
- insufficient-coins handling;
- idempotent replay safety;
- visibility of balance in child-safe surfaces.

Forbidden in pA1:

- per-question coins;
- correctness coins;
- speed coins;
- no-hint coins;
- streak coins;
- random rewards;
- loot boxes;
- paid currency;
- trading, gifting, auctions, or marketplaces;
- limited-time shop pressure;
- negative-punishment copy for missed days.

The economy must continue to reward honest daily completion, not farming.

### 2.5 Hero Camp boundary

Hero Camp remains a spending/autonomy surface, not a learning-evidence surface.

The six Hero Pool monsters remain Hero-owned:

```txt
glossbloom
loomrill
mirrane
colisk
hyphang
carillon
```

They may reuse art/assets and monster IDs, but their ownership, stage, branch, ledger, and cost state must remain Hero Mode state. They must not be treated as Grammar monsters or Punctuation monsters.

pA1 must not introduce child-facing branch choice, monster trading, random draws, new monsters, refunds, undo, or scarcity mechanics. Operational recovery may be discussed separately, but it must not become a child-facing product mechanic in pA1.

---

## 3. pA1 goals

### Goal 1 — Reconcile contract and documentation drift

pA1 must clean up drift that would mislead a rollout planner or future engineering agent.

Minimum drift items to check and reconcile:

- any wording that implies a `hero_progress` table, when authoritative Hero state is stored in `child_game_state` under `system_id = 'hero-mode'`;
- any wording that implies a `hero_pool` column, when Hero Pool state is inside the Hero Mode JSON state;
- any PNG asset wording, when the current client asset adapter expects `.webp` paths;
- inconsistent P6 test totals across completion/readiness/PR-style documents;
- wording that overclaims analytics/readiness helpers as a complete production dashboard;
- any forward-looking suggestion such as trading or extra economy mechanics that could be misread as an approved next phase;
- stale event, table, or metric names in rollout instructions.

The planner may choose whether this is one documentation PR or part of the pA1 implementation PR. The exit requirement is that the next planner can follow the docs without needing private context.

### Goal 2 — Prove feature-flag rollout sequencing

pA1 must validate the feature flag ladder, not merely list it.

The intended enable order remains:

```txt
HERO_MODE_SHADOW_ENABLED
HERO_MODE_LAUNCH_ENABLED
HERO_MODE_CHILD_UI_ENABLED
HERO_MODE_PROGRESS_ENABLED
HERO_MODE_ECONOMY_ENABLED
HERO_MODE_CAMP_ENABLED
```

The intended rollback order remains the reverse:

```txt
HERO_MODE_CAMP_ENABLED
HERO_MODE_ECONOMY_ENABLED
HERO_MODE_PROGRESS_ENABLED
HERO_MODE_CHILD_UI_ENABLED
HERO_MODE_LAUNCH_ENABLED
HERO_MODE_SHADOW_ENABLED
```

Rollback must preserve dormant state. It may hide surfaces and stop writes. It must not delete balances, ledger entries, completed tasks, or monster ownership.

pA1 should prove the ladder in at least local/dev and staging. It may include an internal production/team-only ring if the earlier rings pass.

### Goal 3 — Verify the full child-visible path manually

Automated tests are necessary but not enough for pA1. This phase must include browser/manual QA evidence for the complete path.

Minimum path:

1. a learner with Hero flags off sees the normal non-Hero surface;
2. shadow-only mode produces a safe read model but no child surface;
3. launch mode can prepare Hero launch context without exposing unsupported writes;
4. child UI mode shows one clear Hero Quest entry point;
5. starting a Hero task opens the correct subject session through the normal subject command path;
6. returning from the subject session preserves Hero context;
7. claim-task completes only after Worker-verified completion evidence;
8. daily completion awards +100 Hero Coins once when economy is enabled;
9. retry, refresh, and two-tab attempts do not double-award;
10. Hero Camp can invite and grow a Hero Pool monster when the Camp flag is enabled;
11. insufficient-coins states are calm and accurate;
12. rollback hides surfaces while preserving state.

The planner may decide the exact harness and seeded learner shape. The evidence must be concrete enough for someone else to repeat.

### Goal 4 — Prove telemetry sink and privacy behaviour

P6 defines a metrics contract. pA1 must prove that the important events and derived signals can be observed in the intended environment.

Minimum event/signal families to verify:

- Hero read-model health;
- scheduler output and no-eligible/no-launchable states;
- task launch attempted/succeeded/blocked;
- claim attempted/succeeded/rejected;
- daily completion and daily coin award;
- duplicate-award prevention;
- Camp invite/grow attempted/succeeded/rejected;
- insufficient coins;
- idempotency replay/different-hash rejection;
- stale-write retry/rejection;
- rollback/flag-disabled states;
- client-visible error categories.

The privacy validator must remain strict. Telemetry must not include raw child answer text, raw prompts, child free text, or answer bodies.

pA1 may use structured logs, an export, an existing admin surface, or a small purpose-built ops route. The planner may choose the smallest route that gives reliable operational evidence. pA1 should not overbuild a dashboard unless the lack of an operational surface blocks safe rollout.

### Goal 5 — Audit scheduler/provider/launcher parity

pA1 must verify that every child-visible scheduled Hero task is actually launchable, or that non-launchable tasks are safely skipped without trapping the child.

The planner should specifically audit provider/adapter parity across:

```txt
spelling
grammar
punctuation
```

Known watch item:

```txt
The Grammar provider can emit a breadth-maintenance envelope using launcher = 'mini-test'.
The current Grammar launch adapter supports smart-practice and trouble-practice.
```

This may be acceptable if the read model always skips non-launchable tasks and still gives the child a valid primary CTA. It is not acceptable if a learner can receive a Hero Quest whose only visible next step cannot be launched.

The planner has room to choose the fix:

- filter unlaunchable envelopes before child-visible scheduling;
- adjust a provider so it emits only supported launchers;
- add a proper subject launch adapter path if the subject engine already supports it safely;
- keep the current behaviour if tests and manual QA prove it is child-safe.

The fix must preserve the task-envelope architecture. Hero Mode must not start selecting subject items directly.

### Goal 6 — Verify state model and mutation safety

pA1 must confirm the implemented state model is the operational source of truth.

Authoritative Hero state:

```txt
child_game_state
system_id = 'hero-mode'
state_json = HeroModeStateV3-compatible JSON
```

pA1 must verify:

- Hero state is learner-scoped;
- commands use Worker mutation safety;
- request idempotency hash includes command payload details;
- same request ID + same payload replays safely;
- same request ID + different payload is rejected;
- stale writes are rejected or retried safely;
- two tabs cannot double-claim or double-spend;
- event-log mirrors are not treated as authoritative economy state;
- rollback leaves state dormant rather than deleted.

### Goal 7 — Establish the A2 decision baseline

pA1 must end with a clear recommendation:

```txt
Proceed to A2
Hold and harden
Rollback / do not widen
```

The recommendation must be based on evidence, not optimism.

---

## 4. Non-goals

pA1 must not include:

- new Hero gameplay;
- new Hero monsters;
- new Hero earning rules;
- bonus coins for extra practice;
- child-facing branch selection;
- trading or gifting;
- leaderboards;
- streak mechanics;
- random shops or loot boxes;
- parent reports;
- six-subject expansion;
- item-level scheduling;
- new subject mastery rules;
- subject Star changes;
- production default-on;
- public cohort rollout;
- marketing copy that implies final production readiness.

If a planner believes one of these is needed, it should be proposed as a later A-series phase with its own product contract, not smuggled into pA1.

---

## 5. Entry criteria

pA1 may start when:

- the P6 Hero Mode code and docs are present in the working branch;
- all six Hero flags remain default false in production configuration;
- the architecture/product contract and engineering/code review have been read;
- the team agrees pA1 is a validation and rollout-readiness phase, not a gameplay phase;
- the planner has access to seeded learners covering ready subjects, locked subjects, low balance, sufficient balance, completed daily quest, and stale/duplicate request cases.

pA1 should not start by designing new economy mechanics.

---

## 6. Exit criteria

pA1 is complete only when all of the following are true.

### 6.1 Contract cleanliness

- A/B docs and rollout docs no longer misstate the state model, asset format, or operational readiness.
- Test-count drift has been reconciled or clearly explained.
- Any stale table/column names have been removed or marked as historical.
- Analytics/readiness helpers are described accurately as helpers/foundations unless a real dashboard or route is actually delivered.

### 6.2 Local/dev proof

- Seeded local/dev can exercise every flag step in order.
- Shadow read model works with ready and locked subjects.
- Child UI can show a valid Hero Quest when enabled.
- Launch, claim, economy award, and Camp actions work under the correct flags.
- Rollback in reverse order preserves state.

### 6.3 Staging proof

- Seeded staging repeats the full flow.
- Multi-day staging covers at least two date keys.
- Daily award idempotency is verified across refresh/retry/two-tab scenarios.
- Camp debit idempotency is verified.
- Telemetry reaches the chosen sink.
- No raw child content appears in metrics.

### 6.4 Product and learning safety

- Hero tasks launch subject sessions through subject command paths.
- Hero Mode does not mutate subject Stars, subject mastery, or subject monsters.
- Capped daily completion remains the only earning path.
- Mega/secure subjects are treated as maintenance/retention candidates, not endless grinding targets.
- Locked subjects are presented calmly as not ready, not as broken features.

### 6.5 Operational readiness

- There is a repeatable QA checklist.
- There is a rollback checklist that has been exercised.
- There is a small metrics/readiness evidence note showing what was observed.
- There is a risk register for A2.
- There is an explicit recommendation: proceed, hold, or rollback.

---

## 7. Acceptance gates

### Gate A — Product copy and surface behaviour

Pass when:

- the home surface has one primary Hero Quest action when Hero UI is active;
- Hero Camp remains secondary to the learning mission;
- copy avoids pressure, gambling, scarcity, punishment, and streak language;
- completed quests show calm completion and balance information;
- insufficient coins copy asks the child to complete Hero Quests rather than grind questions;
- locked subjects are described as coming later or not ready.

Fail when:

- a child is pushed towards Camp before learning;
- copy suggests coins are earned by correctness, speed, or question count;
- a missed day feels like a loss;
- the surface offers several competing primary actions that undermine the daily contract.

### Gate B — Scheduler and launchability

Pass when:

- a generated child-visible quest has at least one launchable next task;
- no child-visible scheduled task creates a dead CTA;
- unsupported subject/launcher pairs are handled safely;
- provider/adapter parity is covered by tests or manual QA;
- locked subjects do not crash scheduling.

Fail when:

- the only next task is not launchable;
- a provider emits a launcher that reaches the child but cannot be started;
- Hero Mode compensates by selecting subject items directly.

### Gate C — Claim and progress integrity

Pass when:

- claim-task requires matching learner, quest ID, quest fingerprint, task ID, and completion evidence;
- claim-task cannot be faked by client-supplied subject payload or reward fields;
- duplicate claims replay safely;
- different payload under the same request ID is rejected;
- stale writes are safe;
- recent claim records are child-safe.

Fail when:

- a client can claim without Worker-verified completion;
- another learner's session can satisfy a claim;
- duplicate request handling can change balance or progress incorrectly.

### Gate D — Economy and Camp integrity

Pass when:

- daily completion awards +100 Hero Coins once;
- balance, lifetime earned, lifetime spent, and ledger remain internally consistent;
- Camp invite/grow costs are server-derived;
- client never supplies authoritative cost, amount, balance, stage, owned state, or ledger IDs;
- insufficient funds do not mutate state;
- already-owned or already-grown cases are safe and non-destructive;
- rollback preserves dormant economy and Hero Pool state.

Fail when:

- duplicate award or duplicate debit is possible;
- a negative balance can be produced by normal flows;
- client-provided values can alter cost or stage;
- rollback deletes earned/spent history.

### Gate E — Metrics and privacy

Pass when:

- key events reach the chosen telemetry sink;
- metrics fields are structured and bounded;
- no raw child content is emitted;
- readiness/analytics output can be used by an operator to judge health;
- missing telemetry is treated as a blocker for widening.

Fail when:

- pA1 relies only on local console evidence;
- key events cannot be observed after deployment;
- raw answer, prompt, or child free-text fields appear in telemetry.

---

## 8. Rollout rings for pA1

### Ring 0 — Code and documentation reconciliation

Purpose: make the contract safe to follow.

Required outcome:

- docs drift corrected;
- test-count position stated;
- rollout checklist updated for real state model;
- launchability audit plan written.

### Ring 1 — Local/dev seeded

Purpose: prove the ladder and state model in the fastest controllable environment.

Suggested coverage:

- no eligible subjects;
- ready subjects only;
- locked placeholders;
- completed subject session;
- stale write;
- duplicate request;
- low balance;
- sufficient balance;
- rollback after partial completion;
- rollback after Camp spend.

### Ring 2 — Staging seeded

Purpose: prove deployed behaviour, telemetry, and browser flow.

Required coverage:

- full flag ladder;
- full child-visible quest path;
- completion claim;
- once-only daily award;
- Camp invite/grow;
- insufficient coins;
- telemetry sink;
- privacy validator;
- rollback.

### Ring 3 — Staging multi-day

Purpose: prove date-key behaviour and daily completion across time.

Required coverage:

- at least two date keys;
- previously completed day remains stable;
- new day can generate a new quest;
- daily award does not duplicate across refresh/retry;
- scheduler output remains explainable.

### Ring 4 — Internal production, team-only, optional

Purpose: verify real environment wiring without public exposure.

This ring is optional in pA1 and must not happen unless Ring 2 and Ring 3 pass.

Constraints:

- tiny internal cohort only;
- explicit flag overrides or controlled accounts;
- no public default-on;
- enhanced monitoring;
- rollback rehearsed before enablement.

---

## 9. Stop conditions

Stop rollout and do not widen if any of the following occur:

- duplicate daily coin award;
- duplicate Camp debit;
- negative balance from normal flows;
- claim succeeds without verified subject completion;
- Hero command mutates subject Stars or mastery;
- child-visible quest has no valid launch path;
- telemetry sink is not receiving key events;
- raw child content appears in metrics;
- rollback cannot preserve dormant state;
- locked/placeholder subjects create broken UI;
- support or QA cannot explain why a task was selected;
- operational docs tell the next person to inspect a non-existent Hero table or column.

These are not “known issues to accept” for a wider rollout. They are blockers.

---

## 10. Planner discretion

The planner has room to choose:

- whether pA1 is delivered as one PR or several smaller PRs;
- the exact seeded learner fixtures;
- the exact browser QA tool or checklist format;
- whether telemetry proof uses existing logs, an export, a small admin route, or a minimal script;
- whether launchability parity is fixed by provider filtering, adapter support, read-model filtering, or an explicitly tested safe fallback;
- whether Ring 4 is included in pA1 or deferred to A2;
- how much documentation cleanup happens before code changes, provided drift is resolved before exit.

The planner does not have room to change:

- Hero Mode’s non-subject status;
- subject ownership of learning and mastery;
- capped daily economy;
- no per-question reward rule;
- no random reward rule;
- default-off production posture;
- preserve-state rollback rule;
- privacy boundary for metrics.

---

## 11. Suggested deliverables

pA1 should leave behind these artefacts:

1. an updated rollout/readiness note with real state model and flag order;
2. a QA checklist with completed evidence for local/dev and staging;
3. a telemetry verification note showing observed event families and privacy checks;
4. a launchability parity note for ready subjects;
5. a short risk register for A2;
6. a recommendation: proceed to A2, hold and harden, or rollback/do not widen.

These artefacts matter more than adding code volume.

---

## 12. A2 and A3 forecast

pA1 should decide the next phase based on evidence.

If pA1 passes cleanly, A2 should probably be:

```txt
A2 — Internal cohort measurement and minimal operations surface
```

Likely A2 focus:

- internal production/team-only cohort;
- multi-day observed learning and reward-health metrics;
- minimal operational dashboard or route if pA1 proves logs are insufficient;
- clearer adult/support explanation of Hero Quest selection;
- intervention playbook for duplicate, stale, or claim-repair cases.

If pA1 reveals launchability, telemetry, or state-integrity gaps, A2 should instead be a remedial hardening phase, not a rollout phase.

A3 should only become limited cohort/default-on preparation if A1/A2 evidence is healthy. A3 should still not be six-subject expansion unless Arithmetic, Reasoning, and Reading have Worker-backed subject engines and Hero providers.

---

## 13. Reference paths in this lean codebase

Primary product/system references:

```txt
docs/plans/james/hero-mode/hero-mode-A-architecture-product.md
docs/plans/james/hero-mode/hero-mode-B-engineering-system-code.md
docs/plans/james/hero-mode/hero-mode-p6-completion-report.md
docs/plans/james/hero-mode/hero-mode-p6-readiness-report.md
docs/plans/james/hero-mode/hero-mode-p6-rollout-playbook.md
```

Shared Hero layer:

```txt
shared/hero/constants.js
shared/hero/eligibility.js
shared/hero/scheduler.js
shared/hero/task-envelope.js
shared/hero/launch-status.js
shared/hero/progress-state.js
shared/hero/economy.js
shared/hero/hero-pool.js
shared/hero/monster-economy.js
shared/hero/metrics-contract.js
```

Worker Hero layer:

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

State and route integration:

```txt
worker/src/app.js
worker/src/repository.js
wrangler.jsonc
```

Client Hero layer:

```txt
src/platform/hero/hero-client.js
src/platform/hero/hero-ui-model.js
src/platform/hero/hero-camp-model.js
src/platform/hero/hero-monster-assets.js
src/surfaces/home/HeroQuestCard.jsx
src/surfaces/home/HeroCampPanel.jsx
src/surfaces/home/HomeSurface.jsx
src/surfaces/subject/HeroTaskBanner.jsx
```

Relevant test families:

```txt
tests/hero-*.test.js
tests/worker-hero-*.test.js
tests/hero-p6-*.test.js
tests/hero-p5-*.test.js
```

---

## 14. Final pA1 contract statement

pA1 is successful when Hero Mode is no longer merely “staging-ready on paper”. It must be observed as safe, reversible, measurable, and honest in staging, with default-off production posture preserved.

Do not use pA1 to make Hero Mode bigger. Use pA1 to make Hero Mode trustworthy.
