# Hero Mode pA8 — Release Boundary Closure and A-Series Termination Contract

Status: proposed final operational closure contract  
Date: 2026-05-02  
Scope: KS2 Mastery platform-level Hero Mode only  
Series: A8 exists only because pA7 recorded a live production hold that was not contract-complete. A8 must end the A-series by making the exposure boundary known and recording a final production decision. It must not become another assurance, dashboard, testing, or gameplay phase.

---

## 0. Phase position

Hero Mode has already completed the feature build, hardening, release infrastructure, and multiple evidence phases:

```txt
P0-P6: feature build and production hardening
A1-A2: validation, privacy, launchability, and internal-cohort foundations
A3: provenance-aware evidence tooling
A4: limited external release infrastructure
A5: staged default-on release controls
A6: schema-accurate metrics and repo-side hold
A7: live production inspection and non-widening hold
A8: close the release boundary and terminate the A-series
```

pA7 did the right thing by holding. It found live production facts, but not enough to normalise Hero Mode:

```txt
HERO_INTERNAL_ACCOUNTS exists, but its value and size are unknown.
HERO_EXTERNAL_ACCOUNTS is absent.
HERO_ROLLOUT_PERCENT and HERO_ROLLOUT_SALT are absent.
HERO_EXCLUDED_ACCOUNTS is absent.
HERO_EMERGENCY_DISABLED is absent.
Global Hero flags are false.
Production child_game_state has zero hero-mode rows.
Production event_log has zero hero-mode rows.
A demo/non-cohort production session received 404 hero_shadow_disabled.
Known-account Hero smoke did not pass because it was not run.
Emergency-off rollback was not rehearsed.
```

Those are not reasons to build more product. They are reasons to close the operational boundary.

---

## 1. One-sentence outcome

A8 records the exact production exposure boundary, installs or proves the emergency brake and opt-out path, runs one known-account production smoke, and then records one final decision: **normalise Hero Mode, hold with a known boundary and dated owner, roll back to dormant/cohort-only, or keep dormant until owned**.

---

## 2. Product contract

Hero Mode remains:

```txt
one daily mission across ready subjects
```

It is not:

- a seventh subject;
- a six-subject claim;
- a per-question reward loop;
- a streak system;
- a shop-first experience;
- a new subject mastery engine.

Subject engines continue to own item selection, marking, hints, feedback, Stars, mastery, Mega status, and subject-specific monsters. Hero Mode owns the daily mission contract, Hero task envelopes, Hero context, capped daily Hero Coins, Hero Camp, rollout controls, and Hero-owned state.

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

A8 must not add new Hero monsters, new earning rules, branch-choice UI, trading, gifting, streaks, leaderboards, random rewards, six-subject claims, or subject Star/mastery changes.

---

## 3. Why A8 is allowed, despite the “no A8” warning

A7 was intended to end the A-series. It did not, because the production exposure boundary remained unknown and the valid hold contract was not complete. A8 is therefore allowed only as a closure sprint.

A8 is not allowed to ask “what else should Hero Mode become?”

A8 is allowed to ask only:

```txt
Who owns the release?
Exactly who can see Hero Mode today?
Can we stop Hero Mode instantly without state loss?
Can one known account complete the Hero path in production?
Do we normalise, hold, roll back, or keep dormant?
```

If the team cannot answer those questions, the honest decision is to keep Hero Mode dormant until owned. Do not invent A9.

---

## 4. Entry criteria

A8 may start only when these are true:

1. pA7 final decision is accepted as a live production hold, not a normalisation.
2. A person with Cloudflare production access is available to list, set, or rotate Worker secrets.
3. A product owner can make the final product decision.
4. A support owner can receive family issues or record explicit zeroes.
5. A rollback operator can apply emergency-off or equivalent rollback.
6. At least one known test or internal account exists for production smoke.
7. No one is expecting A8 to add child-facing features.

If production access, ownership, or a known account is unavailable, skip implementation work and record:

```txt
KEEP DORMANT UNTIL OWNED
```

---

## 5. Day 0 — Close the exposure boundary

Day 0 is the most important part of A8. Do not widen any account until it is complete.

### 5.1 Record or reset `HERO_INTERNAL_ACCOUNTS`

The pA7 blocker is that `HERO_INTERNAL_ACCOUNTS` exists but its value is hidden. A8 must resolve this in one of two ways.

Preferred path:

```txt
Rotate HERO_INTERNAL_ACCOUNTS to a reviewed JSON array with a known count.
```

Acceptable path:

```txt
Record the current value out-of-band in the release log without exposing private account IDs in public docs.
```

If the current internal list cannot be safely read or preserved, rotate it to a known reviewed value. A write-only secret cannot remain the basis of a production release boundary.

### 5.2 Install or prove the emergency brake

A8 must create or prove an emergency stop control:

```txt
HERO_EMERGENCY_DISABLED=false
```

The value may be false during normal operation, but the secret/control must exist and must be rehearsable. The release team must know how to set it to true quickly.

Emergency-off must override internal, external, rollout-bucket, and global-default exposure.

### 5.3 Install or prove opt-out/exclusion control

A8 must create or prove an exclusion mechanism:

```txt
HERO_EXCLUDED_ACCOUNTS=[]
```

The value may begin empty, but the path must exist before any real family exposure. A product release without opt-out/exclusion is not ready.

### 5.4 Keep percentage rollout off until smoke passes

Until known-account smoke passes:

```txt
HERO_ROLLOUT_PERCENT=0
```

or the rollout percentage secret remains absent and no global Hero flag is turned on.

### 5.5 Day 0 acceptance

Day 0 passes only when the release log can state:

- exact known internal allowlist count;
- external allowlist count;
- rollout percentage;
- emergency brake present and tested locally or in production rehearsal;
- exclusion control present;
- product owner, support owner, engineering owner, daily review owner, and rollback operator named;
- no new accounts widened before smoke.

If any of these are not true, the Day 0 decision is hold or dormant. Do not proceed to Stage 1.

---

## 6. Stage 1 — Known-account production smoke

A8 does not need a large cohort before it knows whether the release path works. Use one known account first.

### 6.1 Required smoke path

Run the following against production with a known enabled account:

1. Hero read model returns enabled Hero surface for the known account.
2. Non-cohort account remains hidden.
3. Explicitly excluded account remains hidden.
4. Start Hero task through `/api/hero/command`.
5. Task launches through the normal subject command path.
6. Subject session completes under Worker authority.
7. Claim succeeds only after Worker-verified completion evidence.
8. Daily +100 Hero Coin award is applied once.
9. Duplicate claim or retry does not double-award.
10. Camp invite/grow succeeds or is calmly blocked by balance.
11. No subject Stars, mastery, or subject monster state is mutated by the Hero command.
12. Metrics extractor sees the expected Hero state/event rows, or records precisely why the row is not observable.
13. Support log records either the issue or an explicit zero.

### 6.2 Rollback rehearsal

Immediately after the known-account smoke, rehearse rollback:

1. Enable emergency-off.
2. Confirm the known account no longer sees active Hero surfaces.
3. Confirm Hero commands are rejected with controlled non-500 responses.
4. Confirm `child_game_state` Hero state is preserved.
5. Confirm re-enablement restores access without deleting balances, ledger, tasks, or Hero Pool state.
6. Set the release back to the intended hold or rollout state.

If this cannot be run safely, the release cannot widen.

### 6.3 Stage 1 decision

Stage 1 must end with one of:

```txt
SMOKE PASS — proceed to Stage 2
SMOKE HOLD — fix specific release blocker
ROLL BACK TO DORMANT — failed safety or rollback
```

---

## 7. Stage 2 — Small real exposure

If Stage 1 passes, expose the smallest useful real group.

Given the current production context from pA7, if the number of real accounts is still very small, use named accounts rather than percentage rollout.

Recommended options:

```txt
Option A: 3-5 named real/internal accounts
Option B: 5% deterministic rollout if there are enough real eligible accounts
```

Run for 48 hours or two real usage days, whichever gives clearer evidence.

Gate to proceed:

- zero duplicate daily awards;
- zero duplicate Camp debits;
- zero negative balances;
- zero raw child content leaks;
- zero excluded-account exposure;
- no Hero-related 5xx spike;
- support owner records issues or explicit zeroes;
- product owner agrees the daily mission is understandable;
- Camp does not become the first or dominant child action before learning;
- no parent-facing six-subject confusion.

If live usage is still zero after Stage 2, do not normalise on silence. Decide whether to hold, recruit a real tester, or keep dormant until product ownership exists.

---

## 8. Stage 3 — Product decision, not another phase

A8 must make the decision. It must not punt to A9.

### 8.1 Normalise Hero Mode

Allowed only if:

- production boundary is known;
- emergency brake works;
- opt-out/exclusion works;
- known-account smoke passed;
- rollback rehearsal passed;
- small exposure produced no stop condition;
- support load is known and manageable;
- product owner signs that Hero Mode helps rather than distracts.

Normalisation means:

```txt
Hero Mode is default-on for eligible ready-subject learners.
```

It does not mean six-subject Hero Mode, new gameplay, or new economy mechanics.

### 8.2 Hold with known boundary

Use this if the feature appears safe but there is not enough real usage or product confidence.

The hold must record:

- exact internal allowlist count;
- exact external allowlist count;
- rollout percentage;
- whether emergency-off is present;
- whether exclusion control is present;
- named owner;
- review date no more than 14 calendar days later;
- one specific reason for hold.

A hold without a known boundary is not acceptable after A8.

### 8.3 Roll back to dormant or cohort-only

Use this if safety, rollback, support, or product comprehension fails.

Rollback must preserve Hero state dormant. It must not delete balances, ledger entries, completed task history, or Hero Pool ownership.

### 8.4 Keep dormant until owned

Use this if the remaining blockers are operational rather than technical:

- no support owner;
- no product owner;
- no rollback operator;
- no safe way to manage Cloudflare secrets;
- no known account for smoke;
- no appetite to expose real families yet.

This is a valid product decision. It is better than another pseudo-phase.

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
- emergency rollback cannot hide Hero surfaces;
- rollback loses Hero state;
- Camp becomes the primary call to action before learning;
- parent feedback shows pressure, punishment, scarcity, gambling, or six-subject confusion;
- support load exceeds named capacity;
- Hero-related 5xx spike breaches the agreed threshold;
- operator cannot explain why a task was selected.

A stop condition is a release brake, not a backlog item.

---

## 10. Testing discipline

A8 should add almost no tests.

Permitted new tests:

- one smoke harness test if the known-account smoke script has a parsing or command-boundary bug;
- one emergency-off route test if production rehearsal finds a blocker;
- one metric extraction test if live rows reveal a schema shape not covered by pA6.

Forbidden work:

- another large documentation assertion suite;
- synthetic stress testing without live load evidence;
- testing for test-count optics;
- re-testing the whole P0-P6 feature stack without a found defect;
- building a new dashboard.

Use the product time on release execution, not test theatre.

---

## 11. Required deliverables

A8 should leave only a small set of artefacts:

1. updated release command centre with named owners and known exposure counts;
2. updated live rollout log with the Day 0 boundary change and smoke result;
3. known-account production smoke evidence;
4. rollback rehearsal evidence;
5. metrics summary from live Hero rows, or a precise zero-usage statement;
6. support summary with real issues or explicit zeroes;
7. final production decision.

Do not create extra artefacts unless they directly support the final decision.

---

## 12. A-series termination rule

A8 ends the A-series.

If A8 normalises Hero Mode, remaining work becomes normal product backlog.

If A8 holds, the hold has a known boundary, owner, and review date; it is not A9.

If A8 rolls back, the rework becomes a named bugfix or product rework brief; it is not A9.

If A8 keeps dormant, the feature stays dormant until owned; it is not A9.

The only acceptable exception is a genuine production incident requiring a post-incident report. That report is not a phase.

---

## 13. Final statement

A8 is not the next phase of Hero Mode. It is the end of the phase line.

The desired ending is simple:

```txt
The exposure boundary is known.
The brake works.
Opt-out works.
One known account can complete Hero Mode in production.
Support is owned.
Metrics are honest.
The final decision is recorded.
The A-series ends.
```

If the team cannot do that, keep Hero Mode dormant until owned. Do not keep building the cabin before the wheel is attached to the car.
