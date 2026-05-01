# Hero Mode pA7 — Release Execution Sprint and A-Series Exit Contract

Status: proposed final operational release contract  
Date: 2026-05-01  
Scope: KS2 Mastery platform-level Hero Mode only  
Series: A7 follows pA6 only because pA6 recorded an honest repo-side hold rather than a production normalisation. A7 must be the last A-series phase. If A7 cannot close the release, the next work is not A8; it is a named product decision, bugfix, rollback, or rework backlog item.

---

## 0. Phase position

Hero Mode has already been built, hardened, instrumented, and repeatedly checked:

```txt
P0-P6: feature build and production hardening
A1-A2: validation, privacy, launchability, internal-cohort foundations
A3: provenance-aware evidence tooling
A4: external-cohort productionisation infrastructure
A5: staged default-on release infrastructure
A6: schema-accurate metric correction and repo-side hold
A7: execute the release decision, then end the A-series
```

A7 exists because pA6 did the correct thing: it did not pretend that empty exports, missing owners, and absent live rollout evidence were enough to normalise Hero Mode. A7 therefore has one job:

```txt
turn the pA6 hold into a real production decision
```

A7 must not become another assurance cycle, dashboard project, gameplay phase, or test-count exercise. It is the release execution sprint.

---

## 1. One-sentence outcome

A7 names owners, records the current live exposure boundary, runs the minimum live rollout/smoke/rollback checks required for confidence, and then records one final decision: **normalise Hero Mode for eligible ready-subject learners, hold with a dated owner-owned reason, roll back to cohort-only, or keep dormant and rework**.

---

## 2. Product contract

Hero Mode remains one daily mission across ready subjects.

It is not:

- a seventh subject;
- a claim that all six KS2 subjects are covered;
- a per-question reward engine;
- a streak system;
- a shop-first experience;
- a new subject mastery engine.

Subject engines continue to own item selection, marking, hints, feedback, Stars, mastery, Mega status, and subject-specific monsters.

Hero Mode owns the daily mission contract, task envelopes, Hero context, capped daily Hero Coins, Hero Camp, rollout controls, and Hero-owned state.

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

A7 must not introduce new Hero monsters, new earning rules, branch-choice UI, trading, gifting, streaks, leaderboards, random rewards, six-subject claims, or subject Star/mastery changes.

---

## 3. Why A7 is allowed at all

pA6 corrected the important metric-truth problem: authoritative Hero economy, ledger, balance, Hero Pool, and Camp state must be derived from `child_game_state` where `system_id='hero-mode'`, while `event_log` remains an observational telemetry mirror.

pA6 also recorded an honest hold:

- global Hero flags remain off in checked-in production config;
- `HERO_ROLLOUT_PERCENT` and `HERO_ROLLOUT_SALT` were not observed in the visible secret-name list;
- `HERO_INTERNAL_ACCOUNTS` existed, but its value and size were not readable;
- no live Hero production export was supplied;
- no named product, engineering, support, or daily-review owners were recorded;
- no production smoke or production rollback rehearsal was completed.

Those are release execution blockers, not reasons to design more Hero Mode.

A7 is allowed only to close those blockers. If it starts adding product scope, reject the phase.

---

## 4. Entry criteria

A7 may start when the following are true:

1. pA6 has recorded `HOLD AT CURRENT ROLLOUT PERCENTAGE` rather than claiming normalisation.
2. The pA6 schema-accurate metrics extractor exists and is the preferred metrics path.
3. The pA5 rollout resolver exists with this precedence:

```txt
emergency-off > excluded > internal > external > rollout-bucket > global-default > none
```

4. Emergency-off and excluded-account behaviour have focused local coverage.
5. The team agrees that A7 is the final release execution sprint, not a new feature or research phase.

If any of these are false, do not widen. Fix the specific item as a bug or documentation correction before A7 begins.

---

## 5. Day 0 release command centre

Day 0 must be completed before any new account is exposed.

### 5.1 Name accountable owners

Record named people or responsible roles for:

- product owner;
- engineering owner;
- support owner;
- daily review owner;
- rollback operator.

A7 cannot proceed with placeholder owners. If no owner is available, the correct decision is:

```txt
KEEP DORMANT UNTIL OWNED
```

This is not an engineering blocker. It is a product operations blocker.

### 5.2 Record the current live exposure boundary

The exact current exposure must be recorded before widening.

Minimum fields:

```txt
HERO_INTERNAL_ACCOUNTS: present/absent + known account count or explicitly rotated to known value
HERO_EXTERNAL_ACCOUNTS: present/absent + known account count
HERO_ROLLOUT_PERCENT: value or absent
HERO_ROLLOUT_SALT: present/absent, value never written to docs
HERO_EXCLUDED_ACCOUNTS: present/absent + known account count
HERO_EMERGENCY_DISABLED: true/false/absent
checked-in global Hero flags: true/false for all six flags
```

If secret values are write-only, rotate the relevant secret to a known reviewed value rather than guessing.

A7 must not widen from an unknown exposure state.

### 5.3 Confirm the support posture

Before live family exposure, support must have:

- approved parent-facing explanation;
- opt-out procedure;
- support-log capture path;
- rule for recording zeroes when no issues occur;
- escalation rule for privacy, economy, dead CTA, exposure, and rollback issues.

Support readiness is part of the product release, not a nice-to-have.

### 5.4 Run production smoke on a known account

Use a known account and learner profile. The smoke must check:

- Hero read model exposure classification;
- child-visible Hero Quest appears only when intended;
- start-task reaches a normal subject command path;
- subject completion returns claimable Hero context;
- claim-task succeeds only with Worker-verified completion;
- daily Hero Coins are awarded once only;
- Camp invite/grow works or is calmly blocked by balance;
- excluded account sees no Hero surface;
- non-cohort account cannot execute Hero commands;
- no raw child content appears in the exported telemetry sample.

This is not a stress test. It is a release sanity check.

### 5.5 Rehearse rollback once

Before widening, prove the brake:

```txt
HERO_EMERGENCY_DISABLED=true
```

or the equivalent operational rollback must:

- hide Hero surfaces;
- reject Hero commands with controlled non-500 errors;
- preserve Hero state dormant in `child_game_state`;
- preserve balances, ledger entries, completed tasks, and Hero Pool ownership;
- allow re-enablement without state loss.

If rollback cannot be rehearsed, do not widen.

---

## 6. A7 rollout schedule

A7 should finish within 7-10 calendar days unless a stop condition fires. A longer timeline is a hold decision, not a hidden continuation phase.

### Day 1 — Tiny live exposure

Population:

```txt
5-10 known accounts
```

or:

```txt
5% deterministic eligible accounts
```

Use named accounts if the production population is small. Use percentage rollout only if the exact current exposure boundary is known.

Gate to continue:

- production smoke passes;
- rollback rehearsal has passed;
- support owner is watching;
- no duplicate daily award;
- no duplicate Camp debit;
- no negative balance;
- no raw child content in telemetry export;
- no excluded or non-eligible exposure;
- no Hero-related 5xx spike;
- no parent-facing confusion that cannot be answered by the explainer.

### Days 2-3 — First widening

Population:

```txt
25-50 accounts
```

or:

```txt
25% deterministic eligible accounts
```

Gate to continue:

- Day 1 gates still hold;
- metrics extractor has run on live exported rows;
- support log has real entries or explicit zeroes;
- Hero Quest start and completion are not trivially low;
- Camp is not dominating before learning;
- task selection remains explainable to the operator;
- parent copy is not creating six-subject misunderstanding.

### Days 4-7 — Eligible default-on candidate

Population:

```txt
100% of eligible ready-subject learners, excluding opted-out and blocked accounts
```

or the maximum available production population if the product is still small.

Gate to normalise:

- at least four consecutive calendar days at the intended default-on state;
- zero stop conditions;
- warnings accepted, fixed, or converted into a dated hold;
- support load manageable by the named support owner;
- rollback drill passes again after reaching the intended exposure;
- no subject Star/mastery drift attributable to Hero Mode;
- product owner agrees Hero Mode is helping the daily route rather than distracting from learning.

### Day 8-10 — Final decision

The final decision must be one of:

```txt
NORMALISE HERO MODE
HOLD AT CURRENT ROLLOUT PERCENTAGE
ROLL BACK TO COHORT ONLY
KEEP DORMANT AND REWORK
```

If evidence is incomplete, choose HOLD with an exact review date and owner. Do not create A8 to postpone the decision.

---

## 7. Minimum metrics for A7

A7 uses the pA6 schema-accurate metrics path. Metrics must be classified honestly as observed-live, schema-derived, manual-support-log, client-instrumented, or not-observable-yet.

### 7.1 Required release metrics

- exposed account count;
- eligible ready-subject learner count;
- Hero read model requested;
- Hero Quest started;
- Hero task started;
- Hero task completed;
- daily Hero Quest completed;
- claim success count;
- coin award count;
- Camp invite/grow count;
- support issue count by category;
- opt-out count;
- rollback rehearsal result;
- route error count if request logs are available.

### 7.2 Zero-tolerance safety metrics

- duplicate daily Hero Coin award;
- duplicate Camp debit;
- negative Hero Coin balance;
- claim without Worker-verified completion;
- Hero command mutating subject Stars, mastery, or subject monsters;
- child-visible dead CTA;
- raw child content in telemetry, logs, exports, or ops output;
- excluded account exposed;
- rollback failure;
- Hero-related 5xx spike beyond the agreed threshold.

A single zero-tolerance breach stops widening.

### 7.3 Useful but non-blocking metrics

These can inform the product decision but should not block the release forever if they are not yet instrumented:

- Hero Quest shown count;
- start rate from shown;
- Camp open count;
- abandonment point distribution;
- detailed route 4xx/5xx breakdown;
- long-term next-day or next-week return rates.

If missing, record them as `not-observable-yet` and decide whether the current evidence is still enough to normalise or whether to hold.

---

## 8. Stop conditions

Stop widening immediately if any occur:

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

Stop conditions are release brakes. They are not backlog notes.

---

## 9. Testing discipline

A7 may add only small release-protecting tests.

Allowed:

- one test for a production smoke bug;
- one test for a resolver or rollback defect;
- one test for a schema/extractor bug;
- one test for a real stop condition discovered during A7.

Not allowed:

- another broad documentation validation suite;
- synthetic stress testing without live capacity evidence;
- re-testing all P0-P6 behaviour for optics;
- new gameplay test coverage;
- building tests because the phase needs to look large.

A7 should spend most of its time on live release execution, not on producing more local assurance artefacts.

---

## 10. If the decision is NORMALISE HERO MODE

Normalisation means Hero Mode becomes a normal production surface for eligible ready-subject learners only.

Actions:

1. Keep `HERO_EMERGENCY_DISABLED` or an equivalent emergency brake.
2. Keep `HERO_EXCLUDED_ACCOUNTS` or an equivalent opt-out/exclusion mechanism.
3. Retire temporary internal/external allowlist exposure where no longer needed.
4. Remove rollout percent/salt only when the team is comfortable that future staged release is not needed; otherwise keep them as safe operational controls.
5. Update production docs to state: Hero Mode is default-on for eligible ready-subject learners across ready subjects only.
6. Archive A1-A7 evidence as release history.
7. Move monitoring to normal Operations cadence.
8. Create ordinary backlog items for non-blocking improvements.

Normalisation does not mean all six subjects. It means default-on for the current ready-subject model.

---

## 11. If the decision is HOLD

Hold is acceptable, but it must be precise.

A valid hold must include:

- current exposure percentage or allowlist size;
- exact reason for hold;
- named owner;
- next review date no more than 14 calendar days later;
- specific evidence needed to move to normalise or rollback;
- support cadence until review.

An indefinite hold is not a phase. It is product limbo and should be rejected.

---

## 12. If the decision is ROLL BACK TO COHORT ONLY

Use this when wide exposure is unsafe but Hero Mode remains worth preserving under controlled accounts.

Actions:

- set rollout percentage to 0 or equivalent;
- keep a tiny internal/external allowlist only if needed for diagnosis;
- preserve Hero state dormant;
- document root cause;
- fix root cause as a normal bug/rework item;
- do not open A8 unless the product contract itself changes.

---

## 13. If the decision is KEEP DORMANT AND REWORK

Use this only for serious product, privacy, economy, support, or architecture failure.

Actions:

- turn emergency-off on or clear all exposure paths;
- archive all A-series evidence;
- write one rework brief naming the failure class;
- do not widen until the failure is fixed;
- do not create another rollout phase to avoid the hard decision.

---

## 14. Required A7 artefacts

Keep artefacts few and useful.

1. `hero-pA7-release-command-centre.md` — owners, exposure boundary, support readiness.
2. `hero-pA7-live-rollout-log.md` — actual exposure changes and decisions.
3. `hero-pA7-metrics-summary.md` — populated from live export or clearly marked incomplete.
4. `hero-pA7-support-summary.md` — real issues or explicit zeroes, with owner.
5. `hero-pA7-rollback-evidence.md` — production rollback rehearsal result.
6. `hero-pA7-final-decision.md` — one of the four outcomes.

The planner may update pA6 files instead of creating new files if that is cleaner. What matters is that the final decision is real and traceable.

---

## 15. Final statement

A7 is the end of the A-series.

Do not use A7 to make Hero Mode bigger. Use it to decide whether the already-built Hero Mode becomes normal production, remains held with an owner and date, rolls back, or goes dormant for rework.

The desired ending is boring:

```txt
Owners named.
Exposure known.
Smoke passed.
Rollback passed.
Metrics truthful.
Support ready.
No stop conditions.
Hero Mode normalised for eligible ready-subject learners.
A-series closed.
```

If that cannot be achieved, write the reason plainly and stop widening.
