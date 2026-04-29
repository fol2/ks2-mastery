# Hero Mode pA2 — Evidence Close-out, Internal Cohort Measurement, and Minimal Operations Contract

Status: proposed A-series phase contract  
Date: 2026-04-29  
Scope: KS2 Mastery platform-level Hero Mode only  
Series: A2 follows the A-series assurance line. It is not P7 and must not restart feature-led phase naming.

---

## 0. Phase position

Hero Mode has already passed through a P0–P6 feature and hardening line:

- P0 shadow scheduler and read model;
- P1 launch bridge into subject command paths;
- P2 child-facing Hero Quest shell;
- P3 task completion claims and daily progress;
- P4 capped Hero Coins ledger;
- P5 Hero Camp and Hero Pool monsters;
- P6 production-hardening foundations, metrics contract, analytics/readiness helpers, and rollout playbook;
- pA1 staging rollout contract, planning, local/dev validation scaffolding, per-account override work, and evidence templates.

A2 must treat pA1 honestly. If pA1 Ring 2, Ring 3, Ring 4, or the final pA1 recommendation are still pending, A2 begins in evidence close-out mode. It may not widen exposure until the missing pA1 evidence is filled, reviewed, and either accepted or deliberately converted into A2 remediation work.

The intended A2 posture is:

```txt
Close the pA1 evidence gap if it exists.
Then run a tiny internal cohort with real production infrastructure.
Measure learning, reward, privacy, and operational health.
Do not add gameplay.
Do not make Hero Mode public default-on.
```

A2 is successful only if it leaves the team with a grounded A3 decision: proceed to a limited external cohort, hold and harden, or roll back and keep Hero Mode dormant.

---

## 1. One-sentence outcome

A2 converts Hero Mode from a locally validated, default-off system into an internally measured, operationally observable, privacy-safe, team-only production pilot with a clear go/hold/rollback recommendation for A3.

---

## 2. Product contract for A2

### 2.1 Hero Mode remains a daily learning contract

Hero Mode remains one daily mission across ready subjects. It helps the child answer:

```txt
What is the best thing for me to do today?
```

It may schedule subject task envelopes, pass Hero context into subject sessions, track verified completion, award capped Hero Coins once per completed daily Hero Quest, and let the child spend Hero Coins in Hero Camp.

It must not become:

- a seventh subject;
- a subject mastery engine;
- a per-question reward system;
- a streak product;
- a shop-first surface;
- a random reward or gambling mechanic;
- an item-level scheduler that bypasses subject engines.

### 2.2 Subject authority remains unchanged

Subject engines own:

- item selection within the subject;
- marking;
- support, hints, feedback, and retries;
- subject progress;
- subject Stars;
- subject monsters;
- subject mastery and Mega status.

Hero Mode owns:

- daily Hero Quest planning;
- ready/locked subject eligibility;
- task envelopes;
- Hero context;
- completion claims;
- daily Hero progress;
- capped Hero Coins;
- Hero-owned ledger;
- Hero Camp and Hero Pool monster state;
- rollout telemetry and operational health signals.

A2 must not create any route, UI action, migration, repair script, or internal tool that lets Hero commands mint subject Stars, alter subject mastery, downgrade a learner, mark subject answers, or mutate subject-owned monsters.

### 2.3 Ready-subject truth

Current ready subjects remain:

```txt
spelling
grammar
punctuation
```

Current locked or placeholder subjects remain:

```txt
arithmetic
reasoning
reading
```

A2 may improve internal explanation for locked subjects, but it must not imply that Hero Mode is already a six-subject experience. Hero Quest may grow with more subjects later only when those subjects have Worker-backed learning engines and Hero providers.

### 2.4 Economy boundary

Hero Coins remain calm, capped, deterministic, and non-extractive.

Permitted in A2:

- +100 Hero Coins once for a verified completed daily Hero Quest;
- deterministic ledger entries;
- deterministic Camp spend for invite/grow actions;
- insufficient-coins handling;
- idempotent replay safety;
- operator-facing reconciliation checks;
- child-safe balance and recent action display.

Forbidden in A2:

- per-question coins;
- correctness coins;
- speed coins;
- no-hint coins;
- streak coins;
- bonus coins for extra practice;
- random rewards;
- loot boxes;
- paid currency;
- trading, gifting, auctions, or marketplaces;
- limited-time shop pressure;
- missed-day punishment copy.

A2 may measure whether children continue learning after the daily coin cap. It must not add a new earning path to encourage that behaviour.

### 2.5 Hero Camp boundary

Hero Camp remains secondary to the learning mission. It is an autonomy and spending surface, not a learning-evidence surface.

The six Hero Pool monsters remain Hero-owned:

```txt
glossbloom
loomrill
mirrane
colisk
hyphang
carillon
```

A2 must not add new monsters, branch-choice UI, refunds, undo, trading, rarity, random draws, or scarcity. Operational repair may exist only as an admin/support procedure with audit evidence, not as a child-facing product mechanic.

---

## 3. Entry criteria

A2 may enter internal cohort mode only when all of the following are true.

1. pA1 recommendation is complete, dated, and no longer marked pending.
2. pA1 Ring 2 staging seeded evidence is filled and accepted, or any failure is converted into an explicit A2 remediation item.
3. pA1 Ring 3 multi-day evidence covers at least two real date keys, or A2 begins by completing this proof before cohort exposure.
4. pA1 Ring 4 is either complete, explicitly deferred, or deliberately replaced by A2's internal cohort ring.
5. All pA1 stop conditions are clear, or the phase is declared hold-and-harden rather than cohort rollout.
6. Global production Hero flags remain default-off for non-internal accounts.
7. Per-account/internal override is secret-backed, additive-only, and verified not to expose Hero surfaces to non-listed accounts.
8. The team has a repeatable rollback procedure that preserves dormant Hero state.
9. The pA1 test-count position is reconciled or documented clearly enough that release notes do not overclaim.
10. The planner has named the evidence owner for telemetry, QA, rollout, and final A2 recommendation.

If these are not true, A2 is still allowed to start, but only as **A2 Evidence Close-out / Remedial Hardening**. It must not widen the cohort until the missing gate is closed.

---

## 4. A2 goals

### Goal 1 — Close pA1 evidence honestly

A2 must first close any remaining pA1 evidence gap.

Minimum work:

- fill or formally supersede the pA1 Ring 2 evidence note;
- fill or formally supersede the pA1 Ring 3 evidence note;
- fill, defer, or replace the pA1 Ring 4 evidence note;
- complete the pA1 recommendation with a real decision;
- reconcile stale status labels such as “planning complete” versus “rollout validation complete”;
- ensure no report implies production readiness where only staging or template evidence exists.

The A2 planner may choose to mark pA1 as “hold and harden” if the evidence does not support widening. That is a valid success path if it prevents an unsafe rollout.

### Goal 2 — Build the smallest useful operations surface

A2 should deliver a minimal operator surface or route that makes Hero Mode observable during an internal cohort. This is not a full analytics dashboard.

Minimum operator questions it must answer:

```txt
Are the Hero flags and internal overrides behaving as expected?
Are read models being generated?
Are launches succeeding through subject command paths?
Are claims being accepted, rejected, or replayed for the right reasons?
Are daily coin awards happening once only?
Are Camp debits idempotent and internally consistent?
Are privacy checks passing?
Are there no-launchable or no-eligible states?
Are non-internal accounts still hidden from Hero surfaces?
Can we roll back without losing state?
```

Acceptable implementations:

- an admin-only JSON probe;
- a small Operations panel section;
- a script that exports bounded structured logs;
- a combination of probe plus evidence template.

Not acceptable:

- a public route;
- a child-visible debug panel;
- a write-capable admin surface unless it is separately specified and audited;
- an unbounded log dump containing child data;
- a dashboard that implies business readiness without learning and privacy evidence.

### Goal 3 — Fix or prove launchability parity

A2 must resolve the ready-subject launchability contract, especially the Grammar breadth-maintenance watch item.

Known risk:

```txt
Grammar can emit launcher = 'mini-test'.
The current Grammar launch adapter may support only smart-practice and trouble-practice.
A secure-only Grammar learner can therefore have a non-launchable breadth-maintenance envelope unless another launchable task is also present or the UI suppresses the CTA.
```

A2 must not rely on vague fallback wording. It must add explicit evidence for these cases:

- Grammar-only learner with weak concepts;
- Grammar-only learner with due concepts;
- Grammar-only learner with retention-after-secure concepts;
- Grammar-only learner with secure concepts only;
- mixed spelling/grammar/punctuation learner where one subject emits an unsupported launcher;
- no eligible subjects;
- all scheduled tasks non-launchable.

The planner may choose the fix:

- add a safe Grammar mini-test launch adapter if the subject engine already supports that mode;
- change the Grammar provider so breadth-maintenance uses a supported launcher;
- suppress unsupported envelopes before child-visible scheduling;
- keep unsupported envelopes in debug/shadow only while forcing the child-visible next task to be launchable;
- intentionally show no Hero CTA with calm copy when there is no launchable task.

The final state must be simple: the child never sees a dead primary action.

### Goal 4 — Harden metrics and privacy validation

A2 must make privacy validation strong enough for internal production cohort evidence.

Minimum requirements:

- no raw child answer text;
- no raw prompts;
- no child free text;
- no answer bodies;
- no unbounded payloads;
- no nested raw child-content fields hidden inside a generic payload object;
- no learner-identifying data in broadly visible logs unless it is necessary, bounded, role-protected, and documented.

A2 should prefer schema-based or recursive validation over top-level field checks. The privacy validator should reject forbidden field names wherever they appear in a telemetry payload, unless a specific allowlist proves the field is not child content.

### Goal 5 — Run a tiny internal cohort on production infrastructure

After pA1 evidence is closed and the operations surface exists, A2 may run a tiny internal cohort.

Suggested cohort:

- internal team or trusted test accounts only;
- 3 to 10 accounts;
- at least 5 real calendar days, unless a stop condition fires earlier;
- at least two devices or browser sessions for one account;
- at least one first-time Hero learner;
- at least one learner with low Hero Coin balance;
- at least one learner with sufficient balance for Camp;
- at least one learner with locked/placeholder subjects visible in the wider product;
- at least one learner whose ready-subject mix includes Grammar and Punctuation.

Global production flags must remain off for everyone outside the cohort. A2 must verify this with a non-internal account before and after enablement.

### Goal 6 — Establish learning and reward-health baselines

A2 is not expected to prove long-term learning gains. It must establish whether Hero Mode is safe enough to widen.

Minimum signals:

- Hero Quest start rate for internal cohort;
- Hero Quest completion rate;
- task abandonment reason categories;
- subject mix distribution;
- weak-repair exposure;
- due-review exposure;
- retention-after-secure exposure;
- post-Mega or secure-maintenance exposure, where available;
- claim rejection reasons;
- duplicate-claim prevention count;
- duplicate-award prevention count;
- Camp invite/grow success and rejection counts;
- insufficient-coins states;
- extra subject practice after daily coin cap;
- any sign of rushing, skipping, or reward farming;
- any sign of subject mastery or Star inflation.

The leading health test is not “did usage increase?” The leading health test is:

```txt
Hero Mode increased clarity and completion without increasing spam, dead ends, duplicate rewards, privacy risk, or mastery distortion.
```

### Goal 7 — Give operators and support a clear explanation path

A2 must help the team explain why Hero Mode selected a task without exposing child-sensitive internals.

Minimum support/debug explanation:

- date key;
- scheduler version;
- eligible subjects;
- locked subjects;
- selected task envelopes;
- launchability status;
- child-safe reason labels;
- claim status;
- coin award status;
- Camp action status;
- rollback state.

This may be admin-only and minimal. It must not become a child-facing “why you are weak” panel.

### Goal 8 — Produce an A3 decision

A2 must end with one of these decisions:

```txt
Proceed to A3 limited external cohort.
Hold and harden before any widening.
Rollback / keep dormant.
```

The decision must include:

- evidence summary;
- stop-condition review;
- unresolved defects;
- privacy assessment;
- rollout blast-radius assessment;
- A3 risk register;
- recommendation owner and date.

---

## 5. Non-goals

A2 must not include:

- public cohort rollout;
- production default-on;
- marketing launch;
- new Hero monsters;
- new earning rules;
- bonus coins;
- per-question rewards;
- streak mechanics;
- leaderboards;
- trading, gifting, auctions, or marketplaces;
- random rewards or loot boxes;
- child-facing branch choice;
- subject Star changes;
- subject mastery rule changes;
- parent reports;
- six-subject expansion;
- item-level scheduling by Hero Mode;
- broad data warehouse work;
- a full analytics dashboard.

Any of these should be proposed as a later phase with its own product and safety contract.

---

## 6. Rollout rings for A2

### Ring A2-0 — Evidence close-out

Purpose: make sure pA1 is not being treated as more complete than it is.

Required outcome:

- pA1 recommendation completed or superseded;
- pA1 Ring 2/3/4 evidence status resolved;
- test-count drift reconciled or documented;
- launchability watch item assigned;
- A2 mode declared: cohort, remedial hardening, or rollback.

### Ring A2-1 — Ops surface in local/dev and staging

Purpose: prove operators can see what matters before production cohort exposure.

Required outcome:

- ops probe/route/panel exists behind admin access;
- privacy validator blocks forbidden fields, including nested fields;
- telemetry event families are visible in staging;
- non-internal accounts remain hidden;
- rollback evidence is visible.

### Ring A2-2 — Internal production enablement

Purpose: enable Hero Mode for listed accounts only.

Required outcome:

- internal override list applied from secret/config, not code;
- all six Hero flags remain globally off unless deliberately changed for a controlled environment;
- listed accounts see Hero surfaces;
- non-listed accounts do not;
- command routes, read models, telemetry, and rollback work in production infrastructure.

### Ring A2-3 — Multi-day internal cohort observation

Purpose: observe real calendar behaviour and repeated use.

Required outcome:

- at least five real calendar days, unless a stop condition fires;
- at least two date-key rollovers;
- daily award idempotency remains intact;
- Camp spend idempotency remains intact;
- learning/reward health signals collected;
- support explanation is sufficient for observed tasks;
- no raw child content in telemetry.

### Ring A2-4 — A3 recommendation

Purpose: decide whether Hero Mode earns a limited external cohort.

Required outcome:

- proceed / hold / rollback decision;
- evidence packet complete;
- A3 scope and blast radius defined if proceeding;
- remediation list defined if holding;
- rollback/state-dormancy note if not proceeding.

---

## 7. Acceptance gates

### Gate A — Evidence honesty

Pass when pA1 and A2 documents clearly distinguish planning, local/dev proof, staging evidence, internal production evidence, and production-readiness claims.

Fail when any report implies Ring 2/3/4 passed while the evidence artefacts are still templates or pending.

### Gate B — Operational observability

Pass when an operator can inspect flags, overrides, read-model health, launch outcomes, claim outcomes, coin awards, Camp actions, duplicate-prevention, privacy status, and rollback status.

Fail when widening depends on scattered console logs or private tribal knowledge.

### Gate C — Launchability

Pass when every child-visible Hero Quest has a launchable next action or intentionally shows no CTA with calm explanatory copy.

Fail when an unsupported provider/launcher pair can produce a dead primary action.

### Gate D — Claim, economy, and Camp integrity

Pass when verified completion is required for claims, +100 daily Hero Coins are awarded once only, Camp costs are server-derived, and idempotency protects retry, refresh, and two-tab flows.

Fail when duplicate award, duplicate debit, negative balance, client-supplied cost, or claim-without-completion is possible.

### Gate E — Privacy

Pass when telemetry and ops views reject raw child content at every nesting level and expose only bounded, role-appropriate operational fields.

Fail when raw answer text, raw prompts, child free text, answer bodies, or unbounded payloads can reach telemetry or an operator export.

### Gate F — Product safety

Pass when Hero Mode remains learning-first, Camp remains secondary, locked subjects are calm, and children are not pushed into reward farming.

Fail when copy or UI implies coins are earned by correctness, speed, no hints, question volume, streaks, or scarcity.

### Gate G — Rollback

Pass when rollback has been rehearsed and state remains dormant: balances, ledger, completed tasks, and Hero Pool ownership are preserved.

Fail when rollback deletes earned state, leaves broken surfaces visible, or requires manual database edits to recover normal product use.

---

## 8. Stop conditions

Stop A2 widening immediately if any of the following occur:

- duplicate daily coin award;
- duplicate Camp debit;
- negative Hero Coin balance from normal flows;
- claim succeeds without Worker-verified subject completion;
- Hero command mutates subject Stars, subject mastery, or subject monsters;
- child-visible Hero Quest has a dead CTA;
- telemetry sink does not receive key events;
- raw child content appears in telemetry or ops output;
- per-account override exposes Hero Mode to non-listed accounts;
- rollback cannot hide surfaces while preserving state;
- a stale or duplicate request returns a 500 instead of a controlled response;
- operators cannot explain why a task was selected;
- children are directed to Camp before the learning mission;
- support or QA must inspect non-existent tables or stale state locations to answer a rollout question.

These are blockers for A3. They are not acceptable known issues for external cohort rollout.

---

## 9. Suggested engineering deliverables

A2 should leave behind a compact set of artefacts.

Suggested code or test deliverables:

```txt
tests/hero-pA2-launchability-secure-grammar.test.js
tests/hero-pA2-privacy-recursive.test.js
tests/hero-pA2-ops-probe.test.js
tests/hero-pA2-internal-override-surface.test.js
scripts/hero-pA2-cohort-smoke.mjs
worker/src/hero/ops-probe.js              (or equivalent admin route/panel)
shared/hero/metrics-privacy.js            (if recursive validation is extracted)
```

Suggested evidence deliverables:

```txt
docs/plans/james/hero-mode/A/hero-pA2-ops-evidence.md
docs/plans/james/hero-mode/A/hero-pA2-internal-cohort-evidence.md
docs/plans/james/hero-mode/A/hero-pA2-metrics-baseline.md
docs/plans/james/hero-mode/A/hero-pA2-risk-register.md
docs/plans/james/hero-mode/A/hero-pA2-recommendation.md
docs/plans/james/hero-mode/A/hero-pA2-completion-report.md
```

Suggested documentation updates:

- pA1 recommendation finalised or superseded;
- rollout playbook updated with A2 cohort procedure;
- ops probe usage documented;
- privacy validation scope documented;
- launchability parity note updated;
- A3 forecast updated from evidence, not hope.

---

## 10. Planner discretion

The planner may choose:

- whether A2 starts in remedial mode or cohort mode;
- exact internal cohort size, within the small-cohort constraint;
- exact number of observation days, provided the minimum date-key evidence is met;
- whether the ops surface is a route, panel, script, or hybrid;
- whether Grammar launchability is fixed by adapter support, provider adjustment, scheduling filter, or deliberate no-CTA behaviour;
- whether Ring 4 from pA1 is completed as part of A2-0 or replaced by the A2 internal cohort ring;
- how much evidence is automated versus manually signed off.

The planner may not change:

- Hero Mode’s non-subject status;
- subject ownership of learning and mastery;
- the capped daily economy;
- the no per-question reward rule;
- the no random reward rule;
- default-off production posture for non-internal accounts;
- preserve-state rollback;
- privacy boundaries;
- the requirement for a final go/hold/rollback decision.

---

## 11. A3 forecast

A3 should only be proposed if A2 passes cleanly.

Likely A3 scope if A2 proceeds:

```txt
A3 — Limited External Cohort and Cohort-Safe Operations
```

A3 should remain a controlled rollout, not default-on production. It should define a small external cohort, cohort selection rules, support ownership, adult copy, privacy review, and rollback criteria.

A3 should not be six-subject Hero Mode unless Arithmetic, Reasoning, and Reading have their own Worker-backed subject engines and Hero providers.

If A2 finds telemetry, launchability, claim, economy, privacy, or support gaps, A3 should be replaced by an A2b/A3 remedial hardening contract.

---

## 12. Reference paths

Primary Hero Mode references:

```txt
docs/plans/james/hero-mode/A/hero-mode-pA1.md
docs/plans/james/hero-mode/A/hero-pA1-plan-completion-report.md
docs/plans/james/hero-mode/A/hero-pA1-recommendation.md
docs/plans/james/hero-mode/A/hero-pA1-ring2-evidence.md
docs/plans/james/hero-mode/A/hero-pA1-ring3-evidence.md
docs/plans/james/hero-mode/A/hero-pA1-ring4-evidence.md
docs/plans/james/hero-mode/hero-mode-p6-rollout-playbook.md
```

Hero read, command, and state paths:

```txt
worker/src/hero/read-model.js
worker/src/hero/routes.js
worker/src/hero/launch.js
worker/src/hero/claim.js
worker/src/hero/camp.js
worker/src/hero/providers/
worker/src/hero/launch-adapters/
worker/src/repository.js
shared/hero/progress-state.js
shared/hero/economy.js
shared/hero/hero-pool.js
shared/hero/metrics-contract.js
shared/hero/account-override.js
```

Client Hero paths:

```txt
src/platform/hero/hero-client.js
src/platform/hero/hero-ui-model.js
src/platform/hero/hero-camp-model.js
src/platform/hero/hero-monster-assets.js
src/surfaces/home/HeroQuestCard.jsx
src/surfaces/home/HeroCampPanel.jsx
src/surfaces/subject/HeroTaskBanner.jsx
```

---

## 13. Final A2 contract statement

A2 is not where Hero Mode becomes bigger. A2 is where Hero Mode becomes observable, measurable, supportable, and honest under tiny internal production use.

If pA1 evidence is still pending, A2 must close it before widening. If internal cohort evidence is healthy, A2 may recommend A3 limited external cohort. If not, A2 must hold, harden, or roll back while preserving dormant Hero state.
