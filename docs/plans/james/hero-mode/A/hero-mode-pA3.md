# Hero Mode pA3 — Real-Cohort Evidence Hardening and External-Cohort Readiness Contract

Status: proposed A-series phase contract  
Date: 2026-04-30  
Scope: KS2 Mastery platform-level Hero Mode only  
Series: A3 follows the A-series assurance line. It is not P7, and it must not restart feature-led phase naming.

---

## 0. Phase position

Hero Mode has already passed through the P0-P6 feature and hardening line, followed by A-series validation work:

- P0 shadow scheduler and read model;
- P1 launch bridge into subject command paths;
- P2 child-facing Hero Quest shell;
- P3 task completion claims and daily progress;
- P4 capped Hero Coins ledger;
- P5 Hero Camp and Hero Pool monsters;
- P6 production-hardening foundations, metrics contract, analytics/readiness helpers, and rollout playbook;
- pA1 staging-rollout contract, local/dev validation, per-account override work, and evidence templates;
- pA2 evidence close-out, launchability fix, recursive privacy validation, ops probe, certification manifest, internal production enablement, and A3 recommendation.

The honest pA2 outcome is:

```txt
A2 code and operational foundations are credible.
A2 certification is mechanically complete.
The A3 decision is HOLD AND HARDEN.
External cohort readiness is not yet proven.
```

The reason is not a known Hero Mode safety failure. The reason is evidence strength. pA2 contains one real production observation and four operator-accepted simulation rows. Those rows are clearly labelled, and the pA2 recommendation correctly says they are not enough to widen exposure.

pA3 must therefore start as a real-evidence hardening phase, not as an automatic external cohort launch.

---

## 1. One-sentence outcome

pA3 proves, with real internal production usage rather than simulated rows, that Hero Mode is safe, understandable, measurable, privacy-safe, and reversible enough to justify a later tiny external cohort decision.

---

## 2. Product contract for pA3

### 2.1 Hero Mode remains a daily learning contract

Hero Mode remains one daily mission across ready subjects. It helps the child answer:

```txt
What is the best thing for me to do today?
```

Hero Mode may schedule task envelopes, pass Hero context into subject sessions, track verified completion, award capped daily Hero Coins, and let the child spend Hero Coins in Hero Camp.

Hero Mode must not become:

- a seventh subject;
- a subject mastery engine;
- a per-question reward system;
- a streak product;
- a shop-first surface;
- a random reward or gambling mechanic;
- an item-level scheduler that bypasses subject engines;
- a way to imply that all six subjects are production-ready.

### 2.2 Subject authority remains unchanged

Subject engines own:

- item selection within each subject;
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

pA3 must not introduce any command, route, migration, repair script, admin panel, or cohort tool that lets Hero commands mint subject Stars, alter subject mastery, downgrade a learner, mark subject answers, or mutate subject-owned monsters.

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

Hero Mode may mention that more subjects can join later, but only when those subjects have Worker-backed learning engines and Hero providers. pA3 must not market or test Hero Mode as a six-subject experience.

### 2.4 Economy boundary

Hero Coins remain calm, capped, deterministic, and non-extractive.

Permitted in pA3:

- +100 Hero Coins once for a verified completed daily Hero Quest;
- deterministic ledger entries;
- deterministic Camp spend for invite/grow actions;
- insufficient-coins handling;
- idempotent replay safety;
- operator-facing reconciliation checks;
- child-safe balance and recent action display.

Forbidden in pA3:

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

pA3 may measure whether children continue learning after the daily coin cap. It must not add a new earning path to force that behaviour.

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

pA3 must not add new monsters, branch-choice UI, refunds, undo, trading, rarity, random draws, or scarcity. Operational repair may exist only as an audited admin/support procedure, not as a child-facing product mechanic.

---

## 3. pA3 entry criteria

pA3 may start in hardening mode when:

1. the pA2 recommendation is complete and still says `HOLD AND HARDEN`;
2. pA2 evidence clearly distinguishes real production observations from simulation rows;
3. global Hero flags remain off for non-internal accounts;
4. `HERO_INTERNAL_ACCOUNTS` remains the only production enablement mechanism for internal testing;
5. the Grammar `mini-test` launchability fix is present and covered by tests;
6. recursive privacy validation and output stripping are present and covered by tests;
7. the ops probe remains admin/ops protected and read-only;
8. the team has named an evidence owner, support owner, and daily review owner;
9. the team accepts that pA3 is evidence hardening first, not external cohort launch by default.

pA3 may enter an optional external micro-cohort ring only after all mandatory hardening gates pass. If they do not pass, pA3 still succeeds by producing a clear hold/rollback recommendation.

---

## 4. pA3 goals

### Goal 1 — Repair the evidence model so simulation cannot pass as real usage

pA3 must upgrade the certification and evidence artefacts so they do not rely only on dated Markdown rows.

Minimum requirements:

- each observation row must carry a source classification: `real-production`, `staging`, `local`, `simulation`, or `manual-note`;
- the validator must count real production observations separately from simulated rows;
- A3 gating must require enough `real-production` rows, not merely enough date strings;
- evidence rows must include collection method, environment, timestamp, learner ID or safe alias, operator, and script/probe version where available;
- simulated rows may remain useful for rehearsals, but they must never satisfy real cohort duration gates;
- the validator should emit `CERTIFIED_WITH_LIMITATIONS` or `NOT_CERTIFIED` when real-production evidence is below the threshold, even if simulated rows are present.

This is the most important engineering correction for pA3. The current pA2 documents are honest in prose, but the mechanical validator is too permissive because it counts rows rather than provenance.

### Goal 2 — Collect real internal production evidence

pA3 must collect the real internal cohort evidence that pA2 could not yet provide.

Minimum recommended cohort:

- at least 5 actual production calendar days;
- at least 2 real date-key rollovers;
- at least 3 internal learner profiles;
- at least 2 devices or browser sessions;
- at least one first-time or empty Hero state;
- at least one low-balance learner;
- at least one Camp-sufficient learner;
- at least one Grammar-ready secure-only learner;
- at least one Punctuation-ready learner;
- at least one learner with locked placeholder subjects visible in the wider platform.

The planner may adjust the exact shape if account availability is constrained, but the evidence must cover more than one learner and more than one session shape. A single learner with five rows is not enough for external readiness.

### Goal 3 — Add direct Goal 6 telemetry extraction

pA2’s ops probe is useful but limited. pA3 must add a direct telemetry or D1 analysis path for the signals that pA2 marked as not observable from the probe.

Minimum signals to extract or manually verify:

- Hero Quest card shown;
- Hero Quest start rate;
- first task start rate;
- task completion rate;
- daily Hero Quest completion rate;
- abandonment reason categories;
- subject mix distribution;
- task intent distribution, including weak-repair, due-review, retention-after-secure, and breadth-maintenance;
- claim success and rejection reasons;
- duplicate-claim prevention count;
- daily coin award count and duplicate-award prevention count;
- Camp open, invite, grow, insufficient-coins, and duplicate-spend events;
- extra subject practice after daily coin cap;
- signs of rushing, skipping, reward farming, or too-fast completion;
- subject Stars and mastery drift before and after Hero sessions;
- no raw child answer text, raw prompts, or child free-text in any telemetry path.

The planner may implement this as a script, an admin-only export, a D1 query pack, or a small bounded ops route. It must be auditable and repeatable.

### Goal 4 — Re-run browser and rollback evidence under real conditions

pA3 must show that the implemented system works as a real child/adult flow, not only as pure function tests.

Minimum evidence:

1. non-internal account sees no Hero surface while global flags are off;
2. internal account sees the Hero read model and child-safe surface;
3. Hero Quest starts through the subject command path;
4. returning from the subject session preserves Hero context;
5. claim requires Worker-verified completion evidence;
6. daily completion awards Hero Coins once only;
7. refresh, retry, and two-tab attempts do not duplicate awards;
8. Camp invite/grow works only when affordable and does not duplicate spend;
9. insufficient-coins copy is calm and accurate;
10. locked placeholder subjects do not break the experience;
11. rollback by narrowing or clearing `HERO_INTERNAL_ACCOUNTS` hides Hero surfaces;
12. rollback preserves balances, ledgers, completed tasks, and Hero Pool ownership dormant.

This evidence may be manual, automated browser QA, or a mixture. It must be repeatable enough for another operator to re-run.

### Goal 5 — Reconcile pA1/pA2 documentation drift before any external widening

pA3 must clean the documentary trail before exposure expands.

Minimum drift items:

- pA1 must not say A2 completed 5+ real production days if A2 used simulation rows;
- pA2 must separate “code complete”, “mechanically certified”, “production internal enablement verified”, and “external readiness proven”;
- PR/test-count totals should be reconciled or clearly scoped;
- stale “what remains” sections should be updated so they do not contradict final status;
- ops evidence should distinguish local proof, production proof, and simulated proof;
- the certification manifest must explain what it proves and what it deliberately does not prove.

Documentation drift is not cosmetic here. The next rollout planner will make risk decisions from these documents.

### Goal 6 — Produce an A4 recommendation, not a default-on decision

pA3 must end with one of these decisions:

```txt
PROCEED TO A4 LIMITED EXTERNAL COHORT
HOLD AND HARDEN
ROLL BACK / KEEP DORMANT
```

If pA3 recommends proceeding, A4 should still be a tiny limited external cohort. It must not be default-on production.

---

## 5. Non-goals

pA3 must not include:

- production default-on;
- public or broad cohort rollout;
- six-subject Hero widening;
- Arithmetic, Reasoning, or Reading Hero providers unless those subjects first have Worker-backed subject engines;
- new Hero monsters;
- new Hero earning rules;
- bonus coins for extra practice;
- per-question or correctness-based currency;
- streak mechanics;
- leaderboards;
- trading, gifting, auctions, or marketplaces;
- random rewards, rarity, loot boxes, or shop pressure;
- child-facing branch choice;
- parent reports as a major product surface;
- item-level scheduling inside Hero Mode;
- subject Star or mastery changes;
- a full analytics dashboard unless a minimal route/script cannot support the required evidence.

If any of these are genuinely needed, they should be proposed as a later phase with a separate product contract.

---

## 6. Acceptance gates

### Gate A — Evidence provenance and certification honesty

Pass when:

- every evidence row has a source classification;
- the validator distinguishes real production rows from simulation rows;
- A3 gates cannot pass on simulation rows alone;
- the validator emits limitations explicitly when real usage is insufficient;
- the generated recommendation states the evidence boundary in plain language.

Fail when:

- five dated rows can certify A3 even if four are simulated;
- the validator reports `CERTIFIED_PRE_A3` without enough real internal usage;
- reports hide or soften the difference between simulated and elapsed production observations.

### Gate B — Real internal cohort coverage

Pass when:

- the minimum internal cohort has actually elapsed in production;
- at least three learner profiles are represented;
- at least two devices or browser sessions are represented;
- first-time, low-balance, Camp-sufficient, Grammar-ready, and Punctuation-ready states are covered;
- no stop condition fires;
- any warning condition has an owner, explanation, and remediation decision.

Fail when:

- the cohort is one learner only;
- evidence is mostly simulated;
- observations are copied manually without enough provenance;
- stop conditions are treated as acceptable “known issues”.

### Gate C — Learning, reward, and privacy telemetry

Pass when:

- start, completion, abandonment, subject mix, task intent, claim, economy, Camp, and duplicate-prevention signals can be extracted;
- subject Star/mastery drift is checked before and after Hero sessions;
- raw child content is absent at input and output paths;
- metrics are bounded and child-safe;
- unmeasurable signals are explicitly listed rather than implied.

Fail when:

- pA3 relies only on the pA2 ops probe for all Goal 6 signals;
- spam, rushing, farming, or mastery drift cannot be assessed at all;
- raw child answer text, raw prompts, or child free-text appear in metrics or exports.

### Gate D — Product and browser safety

Pass when:

- child-facing flow has one primary Hero Quest action when active;
- Hero Camp remains secondary;
- all scheduled child-visible tasks are launchable;
- no dead CTA appears;
- locked subjects are calm and non-breaking;
- insufficiency states are calm;
- copy avoids pressure, gambling, scarcity, punishment, and streak language.

Fail when:

- Camp pulls attention before the learning mission;
- a child receives a non-launchable primary task;
- copy implies coins are earned by speed, correctness, or raw question count;
- locked subjects look broken.

### Gate E — Rollback and exposure control

Pass when:

- non-internal accounts remain hidden while global flags are off;
- narrowing or clearing `HERO_INTERNAL_ACCOUNTS` hides Hero surfaces;
- command routes fail closed for non-internal accounts;
- rollback preserves dormant state;
- support/ops know exactly what to do if a stop condition fires.

Fail when:

- any non-internal account sees Hero surfaces unintentionally;
- rollback requires deleting balances, ledger entries, or ownership;
- operators have to guess which route, flag, table, or state object to inspect.

---

## 7. Rollout rings for pA3

### Ring A3-0 — Evidence-model repair and docs reconciliation

Purpose: make the gate honest before collecting more evidence.

Required outcome:

- certification validator updated for provenance;
- pA1/pA2 documentation drift corrected;
- real/simulation rows clearly separated;
- A3 evidence templates created.

### Ring A3-1 — Real internal production cohort

Purpose: gather real repeated-use evidence.

Required outcome:

- 5 actual production calendar days;
- 2+ date-key rollovers;
- 3+ internal learner profiles where possible;
- 2+ browser/device sessions;
- no stop conditions;
- warnings triaged.

### Ring A3-2 — Goal 6 telemetry extraction

Purpose: prove learning and reward-health signals, not just readiness-state signals.

Required outcome:

- direct telemetry or D1 analysis for start/completion/abandonment/subject mix/claim/economy/Camp/mastery drift;
- privacy validator checked against the extracted data;
- metrics summary updated with confidence levels and known blind spots.

### Ring A3-3 — Browser QA, rollback, and support rehearsal

Purpose: prove the real operational loop.

Required outcome:

- repeatable browser QA checklist;
- rollback rehearsal completed without deleting state;
- support checklist updated;
- non-internal exposure check repeated.

### Ring A3-4 — A4 decision

Purpose: make the next decision on evidence.

Required outcome:

- recommendation issued: proceed to A4 limited external cohort, hold and harden, or roll back / keep dormant;
- risk register updated;
- all stop conditions reviewed;
- A4 scope, if approved, capped and explicit.

### Optional Ring A3-5 — External micro-cohort rehearsal

This ring is optional and should be included only if the team deliberately chooses to make pA3 include the first tiny external exposure.

If included, constraints are strict:

- 10 external accounts maximum;
- 14 calendar days minimum;
- global Hero flags still off;
- per-account allowlist only;
- daily operator review;
- immediate rollback for negative balance, privacy leak, dead CTA, duplicate award, duplicate Camp debit, reconciliation gap, or non-internal leakage;
- no marketing claim and no default-on language.

The safer default is to leave external micro-cohort execution to A4.

---

## 8. Stop conditions

Stop rollout and do not widen if any of the following occur:

- duplicate daily coin award;
- duplicate Camp debit;
- negative balance from normal flows;
- claim succeeds without Worker-verified subject completion;
- Hero command mutates subject Stars, mastery, or subject monsters;
- child-visible quest has no valid launch path;
- non-internal account sees Hero surfaces unexpectedly;
- telemetry sink misses key events for the observation window;
- raw child content appears in metrics, probe output, logs, or exports;
- rollback cannot preserve dormant state;
- locked/placeholder subjects create broken UI;
- support or QA cannot explain why a task was selected;
- evidence rows cannot be traced to source, environment, and collection method;
- simulated rows are presented as real production observations;
- children are directed towards Camp before the learning mission;
- copy implies missed-day loss, streak punishment, scarcity, gambling, or shop pressure.

These are blockers, not “known issues to accept” for widening.

---

## 9. Planner discretion

The planner may choose:

- whether pA3 is delivered as one PR or several smaller PRs;
- the exact evidence schema for real/simulation provenance;
- whether telemetry extraction is a script, admin-only route, or D1 query pack;
- exact internal learner fixture selection, provided the coverage intent is met;
- whether optional external micro-cohort rehearsal belongs in pA3 or is deferred to A4;
- whether certification status names are revised to avoid implying more readiness than the evidence proves.

The planner may not change:

- Hero Mode’s non-subject status;
- subject ownership of learning and mastery;
- capped daily economy;
- no per-question reward rule;
- no random reward rule;
- default-off global production posture;
- preserve-state rollback rule;
- privacy boundary for metrics;
- requirement to distinguish real production evidence from simulation.

---

## 10. Suggested deliverables

pA3 should leave behind:

1. updated certification manifest and validator with real/simulation provenance;
2. A3 internal cohort evidence file with real production rows only counted for real gates;
3. Goal 6 telemetry extraction script or route;
4. A3 metrics baseline with learning, reward, privacy, and operational dimensions;
5. browser QA and rollback evidence;
6. updated pA1/pA2 drift notes;
7. risk register for A4;
8. final A4 recommendation: proceed, hold, or roll back / keep dormant.

---

## 11. A4 forecast

If pA3 passes cleanly, A4 should be:

```txt
A4 — Limited External Cohort, Per-Account Allowlist Only
```

Likely A4 constraints:

- 10 external accounts maximum at first;
- 14 actual calendar days;
- no global Hero flags;
- daily support and operator review;
- direct telemetry extraction already working;
- rollback rehearsed and documented;
- no new gameplay, no new earning rules, no six-subject widening.

If pA3 does not pass cleanly, A4 should not start. The next phase should remain hold-and-harden or rollback/dormancy.

---

## 12. Reference paths

Primary A-series documents:

```txt
docs/plans/james/hero-mode/A/hero-mode-pA1.md
docs/plans/james/hero-mode/A/hero-pA1-recommendation.md
docs/plans/james/hero-mode/A/hero-mode-pA2.md
docs/plans/james/hero-mode/A/hero-pA2-plan-completion-report.md
docs/plans/james/hero-mode/A/hero-pA2-recommendation.md
docs/plans/james/hero-mode/A/hero-pA2-internal-cohort-evidence.md
docs/plans/james/hero-mode/A/hero-pA2-metrics-baseline.md
docs/plans/james/hero-mode/A/hero-pA2-risk-register.md
```

Core A2 evidence/tooling paths:

```txt
reports/hero/hero-pA2-certification-manifest.json
scripts/validate-hero-pA2-certification-evidence.mjs
scripts/hero-pA2-cohort-smoke.mjs
scripts/hero-pA2-metrics-summary.mjs
shared/hero/metrics-privacy.js
shared/hero/metrics-contract.js
worker/src/hero/telemetry-probe.js
worker/src/hero/launch-adapters/grammar.js
worker/src/hero/read-model.js
worker/src/hero/routes.js
worker/src/app.js
```

Relevant tests:

```txt
tests/hero-pA2-privacy-recursive.test.js
tests/hero-pA2-launchability-secure-grammar.test.js
tests/hero-pA2-ops-probe.test.js
tests/hero-pA2-internal-override-surface.test.js
tests/hero-pA2-certification-evidence.test.js
tests/hero-pA2-cohort-smoke.test.js
```

---

## 13. Final pA3 contract statement

pA3 is successful when Hero Mode is no longer “mechanically certified with simulation accepted”. It must be backed by real internal production evidence, direct learning/reward-health telemetry, an honest certification gate, and a conservative A4 recommendation.

Do not use pA3 to make Hero Mode bigger. Use pA3 to make the evidence real.
