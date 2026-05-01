# Hero Mode pA6 — Production Close-out, Normalisation, or Stop Contract

Status: proposed final A-series close-out contract  
Date: 2026-04-30  
Scope: KS2 Mastery platform-level Hero Mode only  
Series: A6 follows pA5 only because pA5 delivered production-release infrastructure but left live rollout execution and the final production decision pending. A6 must be the last A-series phase unless a genuine production blocker forces rollback or redesign.

---

## 0. Phase position

Hero Mode has already been built and hardened through the P-series, then moved through the A-series assurance and productionisation path:

```txt
P0-P6: feature build and production hardening
A1-A2: validation, observability, privacy, and internal-cohort foundations
A3: provenance-aware evidence tooling and real-evidence gate design
A4: limited external productionisation infrastructure
A5: staged default-on release infrastructure
A6: close the production decision with real rollout evidence, normalise, or stop
```

A6 is not a new gameplay phase. It exists to close the remaining gap between **release infrastructure exists** and **Hero Mode is a normal production product surface**.

The important distinction is:

```txt
pA5 code complete does not mean Hero Mode is normalised.
pA5 templates exist does not mean rollout evidence exists.
pA6 either records real production evidence and normalises Hero Mode, or stops widening.
```

If the team can close these items inside pA5 instead, do that and do not open a separate implementation phase. If A6 is opened, keep it short and final.

---

## 1. One-sentence outcome

A6 converts Hero Mode from staged-release infrastructure into a settled product decision: **normalise Hero Mode for eligible ready-subject learners, hold at a known rollout level, roll back to cohort-only, or keep dormant and rework**.

---

## 2. Product contract

Hero Mode remains:

```txt
one daily mission across ready subjects
```

It is not:

```txt
a seventh subject
a six-subject claim
a shop
a streak system
a per-question reward engine
a new mastery engine
```

Subject engines continue to own item selection, marking, hints, feedback, Stars, mastery, Mega status, and subject-specific monsters. Hero Mode owns the daily mission contract, task envelopes, Hero context, capped daily Hero Coins, Hero Camp, rollout controls, and Hero-owned state.

Current Hero-ready subjects remain:

```txt
spelling
grammar
punctuation
```

Locked or placeholder subjects remain:

```txt
arithmetic
reasoning
reading
```

A6 must not imply that Hero Mode covers all six KS2 subjects until the remaining subjects have Worker-backed subject engines and Hero providers.

---

## 3. Why A6 is allowed at all

A5 was correctly scoped as staged default-on release, not feature expansion. However, the pA5 completion evidence shows a split:

```txt
release-control infrastructure: delivered
live rollout execution: deferred
production metrics: template only
support log: template only
production decision: pending
```

A6 therefore has one job: **finish the release decision without building a new cabin around the wheel**.

A6 should be rejected if it becomes another broad testing, dashboard, gameplay, or research phase.

---

## 4. Entry criteria

A6 may start only when all of the following are true or explicitly acknowledged as blockers to close in A6 Day 0.

1. The pA5 rollout resolver is deployed or ready to deploy, including:
   - `HERO_INTERNAL_ACCOUNTS`;
   - `HERO_EXTERNAL_ACCOUNTS`;
   - `HERO_ROLLOUT_PERCENT`;
   - `HERO_ROLLOUT_SALT`;
   - `HERO_EXCLUDED_ACCOUNTS`;
   - `HERO_EMERGENCY_DISABLED`.
2. The resolver precedence is:

```txt
emergency-off > excluded > internal > external > rollout-bucket > global-default > none
```

3. Read-model and command routes use the same resolved Hero flag view.
4. Emergency-off hides Hero surfaces and rejects Hero commands without deleting Hero state.
5. Named owners exist:
   - product owner;
   - engineering owner;
   - support owner;
   - daily review owner.
6. The parent/support explanation is approved for real families.
7. The A5 rollout-control tests and safety regression tests pass in CI or in the correct Node version for the repository.
8. The metric extraction gap in §6 below is either fixed before the rollout or explicitly downgraded with a narrower decision target.

If pA4 or pA5 evidence is still only simulated or templated, A6 must not call Hero Mode normalised. It may only execute the live rollout and record the decision.

---

## 5. Non-goals

A6 must not include:

- new Hero monsters;
- new Camp mechanics;
- branch-choice UI;
- trading, gifting, refunds, streaks, leaderboards, random rewards, or scarcity mechanics;
- new earning rules;
- per-question Hero Coins;
- subject Star or mastery changes;
- Arithmetic, Reasoning, or Reading Hero providers unless those subjects already have production Worker-backed engines;
- a new dashboard unless the existing admin/ops route genuinely cannot support the release decision;
- a large new test suite for test-count optics;
- load/stress testing unless live rollout shows a capacity problem.

A6 is a release close-out phase, not a feature phase.

---

## 6. Required Day 0 correction — metric truth must match the real schema

Before widening beyond the first live rollout step, A6 must correct or explicitly qualify the pA5 metric layer.

### 6.1 Current risk

Some pA5 metric patterns refer to conceptual or stale tables such as:

```txt
cohort_members
hero_ledger
```

The current Hero state model is:

```txt
child_game_state
system_id = 'hero-mode'
state_json = Hero progress/economy/Hero Pool JSON
```

`event_log` is an observational mirror. It is useful for telemetry, but it is not the authoritative Hero economy or Hero Pool state.

A6 must not allow a report to say "metrics covered" when the extraction path points at tables that do not exist or at client-only events that are not emitted.

### 6.2 Metric truth rule

Every A6 production metric must be classified as one of:

```txt
observed-live
schema-derived
manual-support-log
client-instrumented
not-observable-yet
```

A metric is not production-ready merely because it appears in a registry.

### 6.3 Required schema-accurate extraction

A6 should produce or patch a small read-only extraction script that uses the real platform state:

```txt
event_log
child_game_state
child_subject_state
account_learner_memberships
accounts / learners as already available in the repository
```

Examples:

- balance, ledger, daily award, Hero Pool ownership, and Camp spend checks come from `child_game_state.state_json` for `system_id='hero-mode'`;
- server-side claim, award, Camp, and route events come from `event_log`;
- subject mastery/Star drift comes from comparing subject state before and after rollout, not from Hero state;
- parent confusion and opt-out issues come from the support log;
- Hero Quest shown, Camp opened, and first CTA impressions require client instrumentation or must be marked `not-observable-yet`.

### 6.4 Decision impact of client-only blind spots

A6 should not block forever on a non-essential client-only metric. It has two acceptable choices:

1. add minimal client telemetry for the few metrics needed to make the decision; or
2. make a narrower decision using server-observable substitutes, such as:

```txt
exposed account count
read model requested
Hero command started
task claimed
daily completed
coins awarded
Camp invite/grow attempted
support issue count
```

The production decision must say which choice was made.

---

## 7. A6 rollout schedule

A6 should be short. It should finish within roughly two working weeks unless a stop condition fires.

### Day 0 — Preflight and metric correction

Required outcomes:

- metric extractor points at the real schema or marks blind spots honestly;
- rollout resolver evidence passes;
- emergency rollback is rehearsed once;
- production smoke account proves read model, command, claim, coins, and Camp behaviour;
- support owner confirms the support pack is usable;
- pA5 template example rows are not countable as live evidence.

No product expansion happens on Day 0.

### Days 1-2 — Stage 1: tiny live rollout

Population:

```txt
5% deterministic eligible accounts
```

or, if the live population is small:

```txt
25-50 named accounts
```

Gate to continue:

- zero duplicate daily awards;
- zero duplicate Camp debits;
- zero negative balances;
- zero raw child content leaks;
- zero excluded-account exposure;
- no Hero-related 5xx spike;
- smoke and rollback still pass;
- support can explain every issue.

### Days 3-5 — Stage 2: controlled wider rollout

Population:

```txt
25% deterministic eligible accounts
```

or the largest available early-access group if named-only.

Gate to continue:

- Stage 1 gates still pass;
- Hero Quest start and completion are not trivially low;
- Camp does not become the main action before learning;
- parents are not confused about ready subjects versus all six subjects;
- product owner agrees the feature is helping rather than distracting.

### Days 6-12 — Stage 3: eligible default-on stability

Population:

```txt
100% of eligible ready-subject learners, excluding opted-out and blocked accounts
```

Gate to normalise:

- seven consecutive calendar days at the intended default-on state;
- zero stop conditions;
- warnings accepted or fixed;
- support load manageable;
- rollback drill passes after reaching the intended default-on state;
- no Hero-attributable subject mastery/Star drift beyond the agreed tolerance.

### Day 13 — Final production decision

The decision must be exactly one of:

```txt
NORMALISE HERO MODE
HOLD AT CURRENT ROLLOUT PERCENTAGE
ROLL BACK TO COHORT ONLY
KEEP DORMANT AND REWORK
```

Do not create A7 for an ambiguous result. Pick the honest outcome and record the next action as normal product work, a bugfix, or a rollback.

---

## 8. Acceptance gates

### Gate A — Real evidence, not templates

Pass when:

- the live rollout log has real entries;
- the metrics summary has real values and dates;
- the support summary has real counts, including zeroes where no issues occurred;
- example rows are ignored;
- the final production decision is no longer pending.

Fail when:

- rollout artefacts remain templates;
- simulated or example rows are counted as live production evidence;
- the decision still says `[PENDING]`.

### Gate B — Release-control safety

Pass when:

- emergency-off wins over every other resolver state;
- excluded accounts stay excluded;
- percentage bucketing is stable per account and salt;
- read model and command route classifications match;
- command blocks return controlled errors, not 500s;
- child-facing responses never expose account lists, rollout salt, or override status.

Fail when:

- rollout membership changes randomly between requests;
- excluded accounts can see or command Hero Mode;
- rollback needs SQL repair or deletes Hero state.

### Gate C — Schema-accurate metrics

Pass when:

- every metric is mapped to a real source or explicitly marked not observable;
- no query references non-existent Hero tables;
- authoritative economy/Camp checks read `child_game_state` Hero JSON;
- event-log checks are treated as telemetry, not the source of truth;
- client-only blind spots are either instrumented or clearly excluded from the decision.

Fail when:

- a metric registry is treated as production evidence;
- metrics are marked pass while querying conceptual tables;
- safety metrics cannot be inspected for live rollout.

### Gate D — Product boundary and child experience

Pass when:

- Hero Mode remains one daily mission across ready subjects;
- subject engines still own Stars and mastery;
- Hero Coins remain capped daily completion economy;
- Camp remains secondary;
- copy avoids pressure, scarcity, punishment, streaks, gambling, and six-subject overclaim.

Fail when:

- Hero becomes a shop, a streak loop, or a seventh subject;
- parents believe Arithmetic, Reasoning, and Reading are already covered by Hero Mode;
- children are pushed to Camp before learning.

### Gate E — Operational closure

Pass when:

- a named owner signs the decision;
- support load is understood;
- rollback is rehearsed and documented;
- monitoring transitions to a normal cadence if Hero Mode is normalised;
- deferred items are either closed or moved to normal backlog with owners.

Fail when:

- no one owns post-release support;
- the feature is left half-on with no review date;
- emergency-off is the only known operating procedure.

---

## 9. Stop conditions

Stop widening immediately if any of these occur:

- duplicate daily Hero Coin award;
- duplicate Camp debit;
- negative Hero Coin balance;
- claim succeeds without Worker-verified subject completion;
- Hero command mutates subject Stars, mastery, or subject monsters;
- child-visible Hero Quest has no valid launch path;
- raw child content appears in telemetry, logs, exports, or ops output;
- explicitly excluded account sees Hero surfaces or executes Hero commands;
- non-eligible learner sees Hero Mode as a primary route;
- rollback cannot hide Hero surfaces;
- rollback loses Hero state;
- Camp becomes the primary call to action before learning;
- parent feedback shows pressure, punishment, scarcity, gambling, or six-subject confusion;
- support load exceeds named capacity;
- Hero-related 5xx spike breaches the agreed threshold;
- operator cannot explain why a task was selected.

A stop condition is not an A6 task. It is a release brake.

---

## 10. If the decision is NORMALISE HERO MODE

Normalisation means Hero Mode becomes a normal production surface for eligible ready-subject learners.

Required actions:

1. Keep `HERO_EMERGENCY_DISABLED` as the release brake.
2. Keep `HERO_EXCLUDED_ACCOUNTS` or an equivalent opt-out mechanism.
3. Remove or retire temporary cohort-only secrets where no longer needed:
   - `HERO_INTERNAL_ACCOUNTS` for normal product exposure;
   - `HERO_EXTERNAL_ACCOUNTS` for early access;
   - `HERO_ROLLOUT_PERCENT` and `HERO_ROLLOUT_SALT`, unless retained for future staged changes.
4. Update production docs to say Hero Mode is default-on for eligible ready-subject learners only.
5. Archive A1-A6 evidence as release history.
6. Move monitoring to the standard Operations cadence.
7. Create normal backlog items for non-blocking improvements.

Normalisation must not mean six-subject Hero Mode. It means default-on for the currently ready subjects.

---

## 11. If the decision is HOLD

Hold is acceptable when Hero Mode is safe but the value signal or support confidence is not yet strong enough.

Required actions:

- record the exact rollout percentage or allowlist size;
- record the reason for hold;
- set a review date no more than 14 calendar days later;
- keep daily or twice-weekly monitoring;
- do not add gameplay while held;
- fix only the issues that block the decision.

Hold must not become an indefinite hidden phase.

---

## 12. If the decision is ROLL BACK TO COHORT ONLY

Rollback to cohort-only is appropriate when wide exposure is unsafe but the feature is worth preserving for controlled accounts.

Required actions:

- set `HERO_ROLLOUT_PERCENT=0` or equivalent;
- keep internal/external allowlists for controlled verification only;
- preserve Hero state dormant;
- document the root cause;
- fix the root cause before any future widening;
- do not delete balances, ledger entries, completed task history, or Hero Pool ownership.

---

## 13. If the decision is KEEP DORMANT AND REWORK

Use this only for a serious product, privacy, economy, or architecture failure.

Required actions:

- set emergency-off or clear all exposure paths;
- archive the evidence;
- write a rework brief with the specific failure class;
- do not open another A-series rollout phase until the failure is fixed;
- start a new feature/rework contract only if the product decision is still to pursue Hero Mode.

---

## 14. Testing discipline

A6 tests should be small.

Permitted new tests:

- schema-accurate metric extractor test;
- resolver final-state test;
- emergency-off route test;
- example-row ignore test;
- one safety regression for any newly found release blocker.

Forbidden test work:

- adding tests just to grow the count;
- re-testing the whole P0-P6 stack without a defect reason;
- building a synthetic stress-test suite without live load evidence;
- turning support documentation into hundreds of fragile assertions.

A6 should spend time on production evidence, not test theatre.

---

## 15. Deliverables

A6 should leave behind only these artefacts:

1. `hero-pA6-preflight.md` or an updated pA5 rollout preflight note;
2. a schema-accurate metrics extraction note or patch;
3. a populated live rollout log;
4. a populated metrics summary;
5. a populated support summary;
6. rollback rehearsal evidence;
7. the final production decision;
8. a short post-release clean-up list if normalised.

The planner may choose to update the existing pA5 files rather than creating new pA6 files. Fewer artefacts are better when they are honest and complete.

---

## 16. Final statement

A6 is the close-out phase. It should not make Hero Mode bigger. It should make the production decision real.

The desired ending is boring and useful:

```txt
Hero Mode is default-on for eligible ready-subject learners.
The wheel is on the car.
Emergency rollback still works.
Excluded accounts stay excluded.
Parents understand the promise.
Coins stay capped.
Camp stays secondary.
Subject mastery remains subject-owned.
The A-series ends.
```

If that cannot be achieved, stop widening and write the reason plainly.
