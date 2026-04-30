# Hero Mode pA5 — Staged Default-On Production Release Contract

Status: proposed final A-series productionisation phase contract  
Date: 2026-04-30  
Scope: KS2 Mastery platform-level Hero Mode only  
Series: A5 follows A4 only if A4 produces a real `PROCEED TO STAGED DEFAULT-ON` recommendation. It is not a new gameplay phase.

---

## 0. Phase position

Hero Mode has already completed the feature-build line and the early assurance line:

```txt
P0-P6: feature build and production hardening
A1-A2: validation, observability, privacy, and internal cohort foundations
A3: real-evidence hardening and A4 readiness tooling
A4: limited external productionisation infrastructure and external cohort path
A5: staged default-on production release, or stop
```

A5 should be the last A-series phase before Hero Mode is considered a normal part of the eligible learner experience. It must not become another broad discovery phase. The job is to make a controlled production decision and execute it safely.

The product principle remains unchanged:

```txt
Hero Mode gives each child one daily mission across their ready subjects.
Subject engines own learning, marking, mastery, Stars, and subject monsters.
Hero Mode owns the daily contract, capped Hero Coins, rollout controls, and Hero Camp.
```

A5 must not turn Hero Mode into a seventh subject, a shop, a streak system, a per-question reward engine, or a six-subject claim before Arithmetic, Reasoning, and Reading have real Worker-backed subject engines and Hero providers.

---

## 1. One-sentence outcome

A5 either enables Hero Mode by default for eligible ready-subject learners through a staged rollout with live rollback, support, and safety monitoring, or records a clear product decision to keep Hero Mode cohort-gated until specific blockers are fixed.

---

## 2. A5 is not a testing phase for its own sake

The purpose of A5 testing is to protect the release, not to slow it down.

Only these test categories are in scope:

1. **Rollout-control tests** — prove account exposure is deterministic, reversible, and not leaking to excluded users.
2. **Safety regression tests** — protect zero-tolerance invariants: duplicate coins, duplicate Camp debit, negative balance, dead CTA, raw child content, subject Star/mastery mutation, and rollback state loss.
3. **Production smoke checks** — prove the live release works for real accounts after each stage change.
4. **Metrics sanity checks** — prove the operator can see launch, completion, support, and stop-condition signals.

A5 must not add tests just to increase the count. A new test is justified only when it protects a release mechanism, covers a discovered production defect, or prevents a stop condition from recurring.

---

## 3. Assumptions before A5 starts

A5 assumes all of the following are true.

1. A4 completed with real external cohort evidence, not only templates or simulations.
2. The A4 recommendation is explicitly `PROCEED TO STAGED DEFAULT-ON`.
3. No A4 stop condition remains open.
4. A support owner, engineering owner, product owner, and daily review owner have been named.
5. The parent/adult explainer has been approved for real families.
6. The rollback procedure has been rehearsed against production accounts.
7. The external cohort showed manageable support load and no learning-boundary distortion.
8. Global Hero flags remain off until the A5 rollout mechanism is proven.

If any of these are false, A5 should not begin. Finish A4 instead. Do not use A5 to pretend missing A4 evidence exists.

---

## 4. Product contract for default-on

### 4.1 Eligible learners only

Default-on does not mean all possible accounts and all six subjects.

A learner is eligible when:

- the learner has at least one Hero-ready subject;
- the ready subject can produce a launchable Hero task;
- the account is active and not suspended;
- the account is not explicitly excluded or opted out;
- the learner state can be read and written through the Worker-owned repository boundary.

Current Hero-ready subjects remain:

```txt
spelling
grammar
punctuation
```

Locked/placeholder subjects remain:

```txt
arithmetic
reasoning
reading
```

Child-facing and parent-facing copy must not imply that Hero Mode already covers all six KS2 subjects.

### 4.2 Learning authority boundary

A5 must preserve this boundary:

- subject engines choose subject items;
- subject engines mark answers;
- subject engines own Stars, mastery, Mega, support, hints, feedback, and subject-specific monsters;
- Hero Mode launches subject tasks through subject command paths;
- Hero Mode records Hero progress and Hero economy only after Worker-verified completion evidence.

Hero commands must never mutate subject Stars, subject mastery, subject monster state, or answer correctness.

### 4.3 Economy boundary

Hero Coins remain capped and calm.

Permitted:

- +100 Hero Coins once per completed daily Hero Quest;
- server-derived Camp invite/grow costs;
- insufficient-coins states;
- idempotent replay safety;
- rollback-dormant preservation.

Forbidden:

- per-question coins;
- correctness coins;
- speed coins;
- streak coins;
- paid currency;
- random rewards;
- loot boxes;
- limited-time shop pressure;
- missed-day punishment copy;
- new monsters or new Camp mechanics.

### 4.4 Hero Camp boundary

Hero Camp is secondary to the daily learning mission. It may remain visible as a reward/autonomy surface after learning progress, but it must not become the primary call to action before the Hero Quest is complete.

The six Hero Pool monsters remain unchanged:

```txt
glossbloom
loomrill
mirrane
colisk
hyphang
carillon
```

A5 must not introduce branch-choice UI, trading, gifting, refunds, scarcity mechanics, or new art-dependent product claims.

---

## 5. Known pre-A5 clean-up required

Before any staged default-on switch, the planner must close these drift items. These are small, concrete fixes; they should not become a new phase.

### 5.1 Correct Hero state storage wording

Operational docs must describe the actual state model:

```txt
child_game_state
system_id = 'hero-mode'
state_json = Hero progress/economy/Hero Pool JSON
```

Docs must not tell operators that Hero progress, Camp ownership, or economy balance primarily live in KV unless the implementation really changes to KV. Event logs are observational mirrors, not the source of truth for Hero state.

### 5.2 Correct stale deliverable paths

The pA4 release candidate must reference actual paths. Known stale-looking references to correct or confirm include:

```txt
src/hero/routes/
shared/hero/metrics/
shared/hero/product-metrics.js
scripts/hero-pA4-cohort-simulation.mjs
```

Use the real files that exist in the codebase, such as:

```txt
worker/src/app.js
worker/src/hero/routes.js
shared/hero/account-override.js
shared/hero/product-signals.js
shared/hero/stop-conditions.js
shared/hero/warning-conditions.js
scripts/hero-pA4-product-metrics.mjs
scripts/hero-pA4-external-cohort-smoke.mjs
scripts/hero-pA4-metrics-validator.mjs
scripts/hero-pA4-operator-lookup.mjs
```

### 5.3 Reconcile test-count wording

A5 should not care about headline test counts, but docs should avoid avoidable drift. Record counts as named suites rather than one universal number. For example:

```txt
pA4 focused local suite: N tests, X pass, 0 fail, run on Node 22 from the supplied snapshot.
```

Do not overclaim full production or full CI from local focused runs.

### 5.4 Do not fake percentage rollout

If percentage rollout is part of A5, it must exist in code. If it does not exist, use explicit account waves until a minimal deterministic bucket is implemented.

A document that says `HERO_ROLLOUT_PERCENT=5` is not itself a rollout mechanism.

### 5.5 Remove counting example rows from evidence templates

The pA4 external cohort evidence template currently contains an example row that looks like a real `real-production` observation. Before A5, templates should avoid countable fake rows. Use one of these instead:

```txt
<!-- example row only, do not count -->
```

or set provenance to:

```txt
example-only
```

A certification or metrics parser must ignore example rows. A5 must not start from evidence files that can accidentally count a placeholder as production usage.

### 5.6 Tighten non-cohort exposure detection semantics

A non-cohort account existing outside the allowlist is not itself a stop condition. The stop condition is:

```txt
A non-cohort or explicitly excluded account saw a Hero surface, received an enabled Hero read model, or successfully executed a Hero command.
```

Detection code should therefore include an observed exposure signal, such as:

```ts
{ accountId, env, heroSurfaceVisible, commandAccepted, readModelEnabled }
```

and should not trigger merely because `overrideStatus === 'none'`. Otherwise the detector creates false positives for every normal public account.

---

## 6. A5 rollout-control contract

A5 needs one production-safe exposure mechanism. It should not build a complicated feature-flag platform.

### 6.1 Preferred minimal resolver

Extend the existing Hero flag resolver so it can classify exposure as:

```txt
internal
external
rollout-bucket
global-default
excluded
none
```

Suggested precedence:

```txt
emergency-off > explicit exclude > internal allowlist > external allowlist > rollout bucket > global default > none
```

The resolver must return both:

```ts
{
  resolvedEnv,
  overrideStatus
}
```

The child must never see raw account lists, rollout salts, or cohort membership details.

### 6.2 Minimal environment variables

Use as few new variables as possible.

Suggested additions:

```txt
HERO_ROLLOUT_PERCENT=0..100
HERO_ROLLOUT_SALT=<secret string>
HERO_EXCLUDED_ACCOUNTS=[...]
HERO_EMERGENCY_DISABLED=true|false
```

`HERO_INTERNAL_ACCOUNTS` and `HERO_EXTERNAL_ACCOUNTS` continue to exist for explicit allowlists.

If the planner chooses not to implement percentage bucketing in A5, the rollout may proceed through named external account waves only, but it must not be described as a percentage rollout.

### 6.3 Deterministic bucket rule

The bucket must be stable for the account and salt. The same account must not move in and out of Hero Mode randomly across requests.

The recommended hash input is:

```txt
accountId + ':' + HERO_ROLLOUT_SALT
```

Account-level bucketing is preferred over learner-level bucketing so a household gets one coherent product experience. Learner-level eligibility still applies inside the account.

### 6.4 Emergency rollback

`HERO_EMERGENCY_DISABLED=true` must hide Hero Mode and reject Hero commands for every account, regardless of allowlist or bucket membership. State must remain dormant and preserved.

This is the release brake. Do not ship A5 without it or an equivalent one-command rollback.

---

## 7. A5 rollout schedule

A5 should be paced. It should not drag for months.

The following schedule is intentionally short but still reversible.

### Day 0 — Release preflight

Required outcomes:

- A4 final recommendation says `PROCEED TO STAGED DEFAULT-ON`.
- State-storage and stale-path docs are corrected.
- Rollout resolver is deployed and smoke-tested with `HERO_ROLLOUT_PERCENT=0`.
- Emergency rollback is proven once.
- Owners and escalation route are named.
- Parent/support copy is frozen.

No child-facing feature change is allowed on Day 0.

### Days 1-3 — Stage 1: small production bucket or named wave

Population:

```txt
5-10% deterministic eligible accounts
```

If percentage bucketing is not implemented, use:

```txt
25-50 named external accounts
```

Gate to continue:

- zero stop conditions;
- Hero route 5xx rate below 1%;
- duplicate daily award count = 0;
- duplicate Camp debit count = 0;
- raw child content violation count = 0;
- non-eligible exposure count = 0;
- support volume is manageable within the named support capacity;
- product owner confirms child/parent comprehension is acceptable.

### Days 4-7 — Stage 2: wider production bucket

Population:

```txt
25% deterministic eligible accounts
```

If still allowlist-only, use:

```txt
100-200 named external accounts or all available early-access accounts
```

Gate to continue:

- Stage 1 gates still hold;
- start rate is not trivially low;
- daily completion among starters is healthy enough to show the mission is understandable;
- Camp usage does not dominate before daily learning;
- no evidence of reward farming or rush behaviour beyond the warning threshold;
- support issues are classifiable using the support pack.

### Days 8-14 — Stage 3: default-on for eligible ready-subject learners

Population:

```txt
100% of eligible ready-subject learners, unless excluded or opted out
```

Mechanism:

- either `HERO_ROLLOUT_PERCENT=100` with eligibility checks;
- or equivalent global default-on through the resolver, not a raw uncontrolled flip of all six Hero flags.

Gate to phase close:

- no stop conditions for seven consecutive calendar days;
- warning conditions reviewed daily and accepted or fixed;
- support response time remains within product capacity;
- no subject learning-boundary violations;
- no privacy violation;
- rollback drill passes after default-on.

### Day 15 — Production decision

The decision must be one of:

```txt
NORMALISE HERO MODE
HOLD AT CURRENT ROLLOUT PERCENTAGE
ROLL BACK TO COHORT ONLY
KEEP DORMANT AND REWORK
```

`NORMALISE HERO MODE` means Hero Mode becomes a normal product surface for eligible ready-subject learners. It does not mean Hero Mode is complete for six subjects, nor does it permit new economy mechanics.

---

## 8. A5 metrics contract

A5 should measure the minimum needed to make the production decision.

### 8.1 Launch metrics

Required daily metrics:

- eligible learner count;
- exposed account count;
- Hero Quest shown count;
- Hero Quest start count;
- Hero task start count;
- Hero task completion count;
- daily Hero Quest completion count;
- claim success count;
- claim rejection count;
- coin award count;
- Camp open count;
- Camp invite/grow count;
- route 4xx/5xx counts.

### 8.2 Product metrics

Required daily metrics:

- start rate from shown Hero Quest;
- completion rate from starters;
- next-day return rate for exposed accounts;
- subject mix distribution;
- task-intent mix;
- abandonment point distribution;
- parent/support confusion reports;
- Camp-before-learning ratio;
- extra subject practice after daily coin cap;
- warning-condition count.

### 8.3 Safety metrics

Zero-tolerance metrics:

- duplicate daily award;
- duplicate Camp debit;
- negative balance;
- dead CTA;
- claim without Worker-verified completion;
- raw child content in telemetry or ops output;
- Hero command mutating subject Stars/mastery;
- exposure to explicitly excluded accounts;
- rollback failure;
- production 5xx spike attributable to Hero Mode.

A single zero-tolerance breach stops widening. The owner may narrow, patch, or roll back, but must not continue widening while the breach is unresolved.

---

## 9. Product success criteria

A5 is not successful merely because there are no crashes. It must show that Hero Mode helps the product.

Success means:

- children know what to do next;
- the Hero Quest path starts and completes without confusion;
- parents understand Hero Mode is across ready subjects only;
- Hero Coins do not distort practice behaviour;
- Camp remains secondary and calm;
- support load is explainable and manageable;
- subject learning evidence remains owned by subject engines;
- rollback remains easy and state-preserving.

The planner should set numeric targets before Stage 1 begins. Suggested starting targets:

```txt
Hero Quest start rate from shown: >= 35%
Completion rate among starters: >= 55%
Support confusion reports: manageable by named owner
Route 5xx attributable to Hero: < 1%
Zero-tolerance safety metrics: exactly 0
```

These are launch-control thresholds, not permanent product OKRs.

---

## 10. Stop conditions

Stop widening immediately if any occur:

- duplicate daily coin award;
- duplicate Camp debit;
- negative Hero Coin balance;
- claim succeeds without Worker-verified subject completion;
- Hero command mutates subject Stars, mastery, or subject monsters;
- child-visible Hero Quest has no valid launch path;
- raw child content appears in telemetry, logs, or ops output;
- explicitly excluded account sees Hero surfaces;
- non-eligible learner sees Hero as a primary route;
- rollback cannot hide Hero surfaces within the expected operational window;
- rollback hides surfaces but loses state;
- parent feedback indicates pressure, scarcity, gambling, or punishment copy;
- Camp becomes the primary action before the daily learning mission;
- production support load exceeds the named owner's capacity;
- Hero-related 5xx spike exceeds the agreed threshold;
- operator cannot explain why a task was selected.

These are production release brakes, not backlog items.

---

## 11. Warning conditions

Warnings do not automatically stop the rollout, but they must be reviewed daily.

Examples:

- low start rate despite Hero Quest being shown;
- high first-task abandonment;
- unusual subject mix concentration;
- high Camp opens before learning completion;
- high claim rejection rate;
- repeated insufficient-coins confusion;
- support questions that show parents think Hero covers all six subjects;
- increased very-short sessions suggesting rushing;
- metric sink gaps or delayed telemetry.

The daily review owner must classify each warning as:

```txt
accepted
watch
fix before next stage
stop widening
```

---

## 12. Required A5 deliverables

A5 should leave a small set of useful artefacts.

### 12.1 Rollout resolver evidence

A short evidence note proving:

- internal allowlist works;
- external allowlist works;
- rollout percentage works, if implemented;
- excluded accounts stay excluded;
- emergency rollback overrides everything;
- malformed JSON fails closed;
- `overrideStatus` is visible to ops and hidden from child surfaces.

### 12.2 Live rollout log

A single timeline showing:

- date/time of each rollout change;
- flag or secret changed;
- population affected;
- operator;
- smoke result;
- stop/warning conditions;
- decision to continue, hold, narrow, or roll back.

### 12.3 Metrics summary

A populated production metrics summary covering the A5 window.

### 12.4 Support summary

A short summary of parent/child support issues and how they were resolved.

### 12.5 Final production decision

A signed recommendation:

```txt
NORMALISE HERO MODE
HOLD AT CURRENT ROLLOUT PERCENTAGE
ROLL BACK TO COHORT ONLY
KEEP DORMANT AND REWORK
```

---

## 13. Engineering implementation guidance

### 13.1 Do the minimum code change

A5 should touch only:

```txt
shared/hero/account-override.js
worker/src/app.js
worker/src/hero/routes.js, only if needed for resolver plumbing
scripts/hero-pA4-* or new hero-pA5-* rollout scripts
tests/hero-pA5-rollout-resolver.test.js
docs/plans/james/hero-mode/A/hero-pA5-*.md
```

Do not refactor Hero commands, Camp, economy, subject engines, or Home UI unless a blocker requires it.

### 13.2 Keep tests small and release-focused

Minimum new tests:

- resolver precedence test;
- bucket stability test;
- excluded-account test;
- emergency-off test;
- route consistency test for read model and command;
- ops visibility/privacy test.

Do not create another 500-test documentation suite unless there is a real defect class to protect.

### 13.3 Do not add new user features

Forbidden in A5:

- new monsters;
- new Camp surface;
- new earning rules;
- new child copy that changes the product promise;
- branch choice UI;
- trading/gifting;
- streaks;
- leaderboards;
- six-subject Hero Mode claim;
- parent analytics expansion beyond launch support needs.

A5 is a release phase. Ship the wheel; do not start building the cabin.

---

## 14. Rollback contract

Rollback must be available at three levels:

1. **Targeted rollback** — remove one account from allowlist or exclusion list.
2. **Stage rollback** — reduce rollout percentage to the previous safe value.
3. **Emergency rollback** — set emergency disabled or equivalent global brake.

Rollback must:

- hide Hero surfaces;
- reject Hero commands without 500s;
- preserve `child_game_state` Hero state dormant;
- preserve event history;
- preserve ledger and Hero Pool state within the Hero state model;
- restore the same state after re-enablement.

Rollback must not:

- delete balances;
- delete ledger entries;
- delete Hero Pool ownership;
- reset daily quest history;
- mutate subject mastery;
- require a database migration;
- require manual SQL repair for normal rollback.

---

## 15. Parent and support posture

A5 must keep the parent story simple:

```txt
Hero Mode gives your child one suggested daily mission across ready subjects.
It does not replace the subjects.
It does not cover subjects that are not ready yet.
Hero Coins are a capped daily completion reward.
Camp is optional and child-chosen.
```

Support must be able to answer:

- Why did my child see Hero Mode?
- Why did another child not see it?
- Why does Hero Mode not include Arithmetic/Reasoning/Reading yet?
- Why did coins not increase twice?
- Why can my child not afford a Camp action?
- What happens if Hero Mode is turned off?
- Can we opt out or be excluded?

If support cannot answer these from the pack, do not widen.

---

## 16. Exit criteria

A5 is complete only when one final decision is recorded.

### 16.1 Normalise Hero Mode

Allowed when:

- A5 stages completed with zero stop conditions;
- warnings are accepted or fixed;
- support load is manageable;
- default-on state is stable for at least seven calendar days;
- rollback drill passes after default-on;
- product owner agrees Hero Mode is helping rather than distracting.

### 16.2 Hold at current rollout percentage

Use when:

- the feature is safe but product/support confidence is not strong enough for wider default-on;
- warning conditions need more observation;
- cohort size needs longer calendar time;
- no emergency rollback is needed.

### 16.3 Roll back to cohort only

Use when:

- a fix is required before wide exposure;
- support load exceeds capacity;
- product comprehension is weak;
- warning conditions point to reward distortion.

### 16.4 Keep dormant and rework

Use when:

- a stop condition indicates fundamental risk;
- rollback fails;
- privacy is violated;
- subject mastery boundary is broken;
- duplicate economy writes occur in normal flows.

---

## 17. Final statement

A5 should finish the productionisation path. It is not a licence to expand Hero Mode. It is the controlled release of the existing Hero Mode product to eligible learners.

The strongest A5 outcome is boring:

```txt
Hero Mode turns on gradually.
Children understand the daily mission.
Parents understand the boundary.
Coins stay capped.
Camp stays secondary.
No stop conditions fire.
Rollback works.
Hero Mode becomes normal for eligible ready-subject learners.
```

If A5 cannot achieve that, stop and fix the specific release blocker. Do not invent another broad assurance phase.
