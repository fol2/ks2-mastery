# Hero Mode pA4 — Productionisation Path and Limited External Release Contract

Status: proposed A-series phase contract  
Date: 2026-04-30  
Scope: KS2 Mastery platform-level Hero Mode only  
Series: A4 follows the A-series assurance line. It is not P7, and it must not restart feature-led phase naming.

---

## 0. Phase position

Hero Mode has already passed through the P0-P6 feature and hardening line, followed by A-series evidence work:

- P0 shadow scheduler and read model;
- P1 launch bridge into subject command paths;
- P2 child-facing Hero Quest shell;
- P3 task completion claims and daily progress;
- P4 capped Hero Coins ledger;
- P5 Hero Camp and Hero Pool monsters;
- P6 production-hardening foundations, metrics contract, analytics/readiness helpers, and rollout playbook;
- pA1 staging-rollout contract, local/dev validation, per-account override work, and evidence templates;
- pA2 evidence close-out, launchability fix, recursive privacy validation, ops probe, certification manifest, internal production enablement, and A3 recommendation;
- pA3 real-cohort evidence hardening, provenance-aware certification, direct Goal 6 telemetry extraction, real internal production observation, browser/rollback rehearsal, and A4 recommendation.

pA4 assumes pA3 has ended with:

```txt
PROCEED TO A4 LIMITED EXTERNAL COHORT
```

If pA3 does not end with that decision, pA4 should not start as written. The correct action would be a hold-and-harden or rollback/dormancy phase, not a productionisation phase.

The pA4 posture is:

```txt
Ship Hero Mode to real external early-access families under controlled production exposure.
Measure product value and safety in real use.
Prepare a grounded default-on decision.
Do not turn validation into an endless research loop.
Do not make Hero Mode bigger while productionising it.
```

---

## 1. What pA4 is for

pA4 is the first true productionisation phase.

It is not a stress-test phase. It is not another local validation phase. It is not a new gameplay phase. It is not a default-on launch unless the phase earns that decision through controlled external evidence.

The point of pA4 is to answer one business/product question:

```txt
Can Hero Mode safely become a production default path for eligible learners?
```

The answer may be yes, no, or not yet. The phase must be time-boxed and decision-led. It should not keep adding tests simply because more tests are possible.

---

## 2. One-sentence outcome

pA4 releases Hero Mode to a small external early-access cohort on production infrastructure, monitors learning, reward, privacy, support, and operational health, and ends with a concrete decision: proceed to staged default-on, hold and harden, or roll back / keep dormant.

---

## 3. Product contract for pA4

### 3.1 Hero Mode remains a daily learning contract

Hero Mode remains one daily mission across ready subjects. It helps the child answer:

```txt
What is the best thing for me to do today?
```

Hero Mode may:

- show a child-facing Hero Quest entry point;
- schedule task envelopes across ready subjects;
- pass Hero context into subject sessions;
- track verified completion;
- award capped Hero Coins once for a completed daily Hero Quest;
- allow calm Hero Camp spending and growth;
- provide operators with safe health and rollout signals.

Hero Mode must not become:

- a seventh subject;
- a subject mastery engine;
- a per-question reward engine;
- a streak system;
- a shop-first surface;
- a random reward or gambling mechanic;
- a six-subject marketing claim;
- an item-level scheduler that bypasses subject engines.

### 3.2 Subject authority remains unchanged

Subject engines continue to own:

- item selection inside the subject;
- marking;
- support, hints, feedback, and retries;
- subject progress;
- subject Stars;
- subject monsters;
- subject mastery and Mega status.

Hero Mode continues to own:

- daily Hero Quest planning;
- ready/locked subject eligibility;
- task envelopes;
- Hero context;
- completion claims;
- daily Hero progress;
- capped Hero Coins;
- Hero-owned economy ledger;
- Hero Camp and Hero Pool monster state;
- rollout telemetry and operational health signals.

pA4 must not introduce any production, support, admin, repair, or migration path that lets Hero Mode mint subject Stars, change subject mastery, downgrade a learner, mark subject answers, or mutate subject-owned monsters.

### 3.3 Ready-subject truth

Current Hero-ready subjects remain:

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

pA4 must not describe Hero Mode as a six-subject product. Public-facing copy may say that Hero Mode grows as more subjects become ready. It must not imply that Arithmetic, Reasoning, or Reading are already live Hero subjects.

### 3.4 Economy boundary

Hero Coins remain calm, capped, deterministic, and non-extractive.

Permitted in pA4:

- +100 Hero Coins once for a verified completed daily Hero Quest;
- deterministic ledger entries;
- deterministic Camp spend for invite/grow actions;
- insufficient-coins handling;
- idempotent replay safety;
- balance/reconciliation health checks;
- child-safe balance and recent action display.

Forbidden in pA4:

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

The economy should help the child feel completion and ownership. It must not train the child to farm the system.

### 3.5 Hero Camp boundary

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

pA4 must not add new monsters, rarity, random draws, branch-choice UI, refunds, undo, trading, gifting, or scarcity mechanics. Those are not productionisation work.

---

## 4. What the tests are for in pA4

pA4 should reduce test sprawl. It should not keep writing tests as a substitute for shipping.

The required tests and checks have different jobs:

### 4.1 Contract/regression tests

Purpose: prevent known high-cost failures.

These protect:

- feature flag and cohort gating;
- command idempotency;
- duplicate coin prevention;
- duplicate Camp spend prevention;
- privacy validation and stripping;
- launchability;
- subject authority boundaries;
- rollback state dormancy.

These are not stress tests. They are safety rails. They should run in CI and be focused.

### 4.2 Browser smoke checks

Purpose: prove the real child path still works after each release candidate.

These should cover only the critical flow:

```txt
Hero visible -> start task -> subject session -> return -> claim -> coins -> Camp -> rollback-hidden
```

They should be small. They should not become a full visual QA suite.

### 4.3 Cohort telemetry checks

Purpose: observe real external behaviour.

These answer:

- do children understand what to do;
- do they start the Hero Quest;
- do they complete it;
- do they hit dead ends;
- do duplicate rewards/spends occur;
- does reward farming appear;
- does Hero Mode distort subject mastery;
- does support receive confusing reports.

This is product evidence, not a unit-test replacement.

### 4.4 Capacity / stress checks

Purpose: make sure the small production cohort does not expose an obvious infrastructure risk.

pA4 does not need a full-scale stress test unless the cohort size or default-on plan requires it. A small external cohort is not a load event. The important pA4 performance questions are:

- do Hero read model and command routes stay within ordinary Worker/D1 expectations;
- do errors remain rare and explainable;
- does telemetry stay bounded;
- does the route fail closed under bad flags or bad accounts.

Full stress/capacity work can be scheduled before broad default-on if the external cohort is healthy and the next plan materially increases exposure.

### 4.5 The rule for new tests

New tests in pA4 are allowed only when:

- pA4 adds a new rollout-control mechanism;
- pA4 changes a production code path;
- a cohort incident reveals a real defect;
- a stop condition needs a reproducible guard.

Do not add tests merely to increase the count. Test count is not a product milestone.

---

## 5. pA4 entry criteria

pA4 may start when all of the following are true:

1. pA3 ended with `PROCEED TO A4 LIMITED EXTERNAL COHORT`;
2. pA3 evidence was based on real internal production observations, not simulation rows;
3. direct Goal 6 telemetry extraction exists and is repeatable;
4. browser QA and rollback rehearsal passed in production-like conditions;
5. global Hero flags remain off for non-cohort accounts;
6. the team has a named product owner, engineering owner, support owner, and daily review owner;
7. external early-access families are recruited with clear parent/adult consent;
8. support and rollback playbooks are ready;
9. there is a planned cohort size, start date, review cadence, and end date;
10. pA4 scope is frozen to productionisation only.

If any of these are missing, pA4 should pause before exposure widens. Missing entry evidence should not be hidden by writing more prose.

---

## 6. pA4 goals

### Goal 1 — Introduce external cohort rollout control

`HERO_INTERNAL_ACCOUNTS` is not enough for productionisation. It is an internal testing mechanism. pA4 needs an external cohort control mechanism that allows real families to be enabled without turning Hero Mode on globally.

The planner may choose the implementation, but the preferred minimal path is:

```txt
HERO_EXTERNAL_ACCOUNTS = JSON array of account IDs approved for external early access
```

The resolver should support this hierarchy:

1. global Hero flags remain the default authority;
2. internal accounts may be force-enabled for staff/testing;
3. external cohort accounts may be force-enabled for early access;
4. non-listed accounts remain hidden while global flags are off;
5. command routes and read models use the same resolved flag view;
6. every cohort decision is observable in ops output.

The planner may add percentage/hash bucketing only if A4 includes a second wider ring. Do not build a complex rollout platform before it is needed.

### Goal 2 — Release to a tiny external early-access cohort

The first external cohort should be small and real.

Recommended starting shape:

```txt
5-10 external family accounts
7 actual calendar days minimum for the first ring
at least 2 date-key rollovers
support owner checks daily
no global default-on
```

This is not a stress test. It is a product and safety pilot with real families.

The cohort should include, where practical:

- at least one learner who mostly uses Spelling;
- at least one learner with Grammar-ready signals;
- at least one learner with Punctuation-ready signals;
- at least one first-time or empty Hero state;
- at least one learner who can afford a Camp action;
- at least one learner who cannot yet afford a Camp action;
- at least one household using more than one browser/device session.

Do not delay the phase waiting for a perfect cohort. If a state is missing, record the limitation and decide whether it matters before widening.

### Goal 3 — Measure real product value, not only system health

pA4 must answer whether Hero Mode helps the product, not merely whether routes return 200.

Minimum product signals:

- Hero Quest shown count;
- Hero Quest start rate;
- first-task start rate;
- Hero task completion rate;
- daily Hero Quest completion rate;
- return next day / next week;
- subject mix distribution;
- task intent distribution;
- abandonment points;
- child or parent confusion reports;
- extra subject practice after coin cap;
- Camp open/invite/grow usage;
- signs of reward farming or rushing.

Minimum learning/safety signals:

- no subject Star inflation attributable to Hero commands;
- no subject mastery drift caused by Hero Mode;
- no unsupported subject/session launch;
- no dead primary CTA;
- no raw child content in metrics;
- no duplicate daily coin award;
- no duplicate Camp debit;
- no negative balance;
- no cohort leak to non-enabled accounts.

### Goal 4 — Keep support lightweight but real

pA4 needs enough support to learn quickly. It does not need a large support organisation.

Minimum support pack:

- one-page parent explainer: what Hero Mode is and is not;
- one-page support triage guide;
- operator route/script for learner health lookup;
- known-issues section;
- rollback instruction;
- escalation rule for privacy, duplicate rewards, dead CTA, or state corruption.

Support should never ask parents or children to send raw answers, free-text responses, or screenshots containing sensitive child content unless there is a separate safe handling process. Prefer learner ID/account ID/dateKey/request ID style diagnostics.

### Goal 5 — Prepare the default-on decision

pA4 should not drift into endless cohort work. It must end with one of three decisions:

```txt
PROCEED TO STAGED DEFAULT-ON
HOLD AND HARDEN
ROLL BACK / KEEP DORMANT
```

If the decision is `PROCEED TO STAGED DEFAULT-ON`, the next release step should still be staged, not an uncontrolled global flip.

A sensible default-on ladder is:

```txt
new eligible accounts only -> small percentage/hash bucket -> wider percentage -> default-on for eligible ready-subject learners
```

If the existing flag system cannot support percentage rollout, the next phase must either add that mechanism or use an allowlist/wave approach. Do not fake percentage rollout through manual docs.

---

## 7. Non-goals

pA4 must not include:

- new Hero gameplay;
- new Hero monsters;
- new earning rules;
- bonus coins for extra practice;
- per-question or correctness-based currency;
- streak mechanics;
- leaderboards;
- trading, gifting, auctions, or marketplaces;
- random rewards, rarity, loot boxes, or shop pressure;
- child-facing branch choice;
- six-subject Hero marketing;
- Arithmetic, Reasoning, or Reading Hero providers unless those subjects already have Worker-backed subject engines;
- item-level scheduling inside Hero Mode;
- subject Star or mastery changes;
- a large analytics dashboard;
- a broad public launch without a staged decision.

If one of these is genuinely needed, it belongs in a later product phase. It should not be smuggled into productionisation.

---

## 8. Schedule and time-box

pA4 should be deliberately time-boxed. The planner may adjust exact dates, but the default schedule should be measured in weeks, not months.

### Suggested schedule

| Window | Ring | Purpose | Maximum posture |
|---|---|---|---|
| Days 0-2 | A4-0 | Release candidate, cohort control, support pack, parent explainer | no external exposure |
| Days 3-9 | A4-1 | 5-10 external early-access family accounts | external allowlist only |
| Days 10-13 | A4-2 | Decision checkpoint and focused fixes only | hold or widen |
| Days 14-21 | A4-3 | Optional second wave, 25-50 accounts, if A4-1 is clean | allowlist or hash bucket |
| Days 22-24 | A4-4 | Default-on readiness decision | proceed / hold / rollback |

This schedule is intentionally tight. A4 should not become another open-ended evidence phase. If the first external cohort reveals a serious stop condition, the phase pauses. If it shows minor copy or support issues, fix or log them without derailing the whole roadmap.

### What may extend the schedule

Only these should extend pA4:

- privacy violation;
- duplicate coin award or Camp debit;
- negative balance;
- dead primary CTA affecting real learners;
- subject mastery/Star mutation by Hero Mode;
- cohort exposure leak;
- rollback failure;
- repeated unexplained production 500s on Hero routes;
- support load high enough to make wider rollout irresponsible.

Do not extend pA4 because:

- a test count target was not reached;
- a dashboard could be prettier;
- a non-blocking documentation improvement remains;
- a new gameplay idea appears;
- an ideal cohort mix was not perfectly achieved.

---

## 9. Rollout rings

### Ring A4-0 — Productionisation release candidate

Purpose: lock the scope and make external exposure possible without global default-on.

Required outcomes:

- pA3 recommendation reviewed and accepted;
- release candidate branch or PR identified;
- external cohort control implemented or verified;
- non-cohort exposure check passes;
- support pack ready;
- parent/adult explainer ready;
- rollback command/checklist rehearsed;
- focused CI and browser smoke pass;
- no new gameplay included.

Suggested deliverables:

```txt
docs/plans/james/hero-mode/A/hero-pA4-release-candidate.md
docs/plans/james/hero-mode/A/hero-pA4-support-pack.md
docs/plans/james/hero-mode/A/hero-pA4-parent-explainer.md
scripts/hero-pA4-external-cohort-smoke.mjs
```

### Ring A4-1 — First external early-access cohort

Purpose: expose Hero Mode to a tiny number of real families.

Recommended shape:

```txt
5-10 external accounts
7 actual calendar days
no global default-on
daily review owner
support owner active
```

Required checks:

- Hero visible only to external cohort accounts;
- Hero hidden to non-cohort accounts;
- at least one real Hero Quest start;
- at least one real task completion;
- at least one verified claim;
- daily coin award does not duplicate;
- Camp path is either used or explicitly noted as not exercised;
- telemetry contains no raw child content;
- support issues are logged and triaged;
- no stop condition fires.

### Ring A4-2 — Decision checkpoint and focused fixes

Purpose: avoid widening blindly.

At the checkpoint, classify findings:

```txt
Blocker: must fix before any further exposure.
Warning: can widen only with owner and mitigation.
Known issue: acceptable for current cohort, tracked for later.
Non-blocking: cosmetic or documentation-only.
```

The planner should apply a ruthless rule:

- fix blockers;
- fix warnings only when cheap and high-impact;
- do not add gameplay;
- do not create broad new test suites;
- do not pause for cosmetic polish that does not affect safety or comprehension.

### Ring A4-3 — Optional second external wave

Purpose: increase confidence before default-on decision.

This ring is optional but recommended if A4-1 is clean and the roadmap wants a stronger launch decision.

Recommended shape:

```txt
25-50 external accounts
7 actual calendar days
same telemetry and stop conditions
support daily review continues
```

If account-hash or percentage rollout exists, this ring may use a small deterministic bucket. If it does not exist, use an explicit account allowlist. Do not use global flags for this ring unless the product decision is already staged default-on.

### Ring A4-4 — Default-on readiness decision

Purpose: make the production decision.

The final recommendation must be one of:

```txt
PROCEED TO STAGED DEFAULT-ON
HOLD AND HARDEN
ROLL BACK / KEEP DORMANT
```

If proceeding, the recommendation must include:

- exact target population;
- exact flag or rollout mechanism;
- monitoring window;
- rollback trigger;
- owner names/roles;
- support coverage;
- known limitations;
- next review date.

---

## 10. Acceptance gates

### Gate A — Cohort control and exposure safety

Pass when:

- external cohort enablement is account-scoped or bucket-scoped;
- non-cohort accounts remain hidden while global flags are off;
- read model and command routes use the same resolved flag logic;
- ops can show why an account is enabled or hidden;
- rollback can remove exposure without deleting Hero state.

Fail when:

- enabling external accounts requires global default-on;
- non-cohort accounts see Hero surfaces unexpectedly;
- command routes accept Hero writes for non-enabled accounts;
- operators cannot identify who is enabled.

### Gate B — Product comprehension

Pass when:

- children have one clear primary Hero Quest action;
- Hero Camp remains secondary;
- parent/adult explainer sets correct expectations;
- locked subjects are described calmly;
- copy avoids pressure, gambling, scarcity, punishment, and streak language;
- support does not receive repeated “what am I supposed to do?” confusion.

Fail when:

- Camp pulls attention before learning;
- children cannot find the next Hero action;
- parents think Hero Mode is a six-subject product;
- copy implies coins are earned by speed, correctness, or question count.

### Gate C — Learning and subject-boundary safety

Pass when:

- Hero tasks launch through subject command paths;
- Hero Mode does not mutate subject Stars or mastery;
- task intent distribution is explainable;
- no subject is over-served into grinding;
- secure/Mega-like subjects are treated as maintenance, not endless work;
- subject practice still works normally outside Hero Mode.

Fail when:

- Hero commands alter subject mastery or Stars;
- Hero Mode selects items directly inside a subject engine;
- Hero Quest repeatedly sends children to unsuitable or unlaunchable work;
- locked subjects break the experience.

### Gate D — Economy and Camp integrity

Pass when:

- daily completion awards +100 Hero Coins at most once;
- duplicate claims do not duplicate awards;
- Camp spend is deterministic and idempotent;
- negative balances cannot occur in normal flows;
- insufficient-coins states are calm and non-mutating;
- ledger and balance remain reconcilable;
- rollback preserves dormant balances, ledger, and ownership.

Fail when:

- duplicate coin award occurs;
- duplicate Camp debit occurs;
- negative balance occurs;
- client-provided amount, cost, balance, stage, or owned state is trusted;
- rollback deletes earned or spent history.

### Gate E — Privacy and support safety

Pass when:

- raw child answers, prompts, free text, or input bodies do not appear in telemetry, exports, support notes, or ops output;
- parent/adult consent and early-access explanation are clear;
- support can triage without requesting sensitive child content;
- privacy validator and output stripping remain active;
- any production incident has a clear owner and action.

Fail when:

- raw child content leaks;
- support process asks for unsafe screenshots or answer text without a safe handling route;
- telemetry grows unbounded or includes sensitive content;
- external families are added without clear consent/communication.

### Gate F — Operational readiness for default-on

Pass when:

- production errors remain low and explainable;
- support load is manageable;
- rollback has been rehearsed and remains simple;
- telemetry answers the key product/safety questions;
- known issues are acceptable for a wider launch;
- the default-on population is defined narrowly as eligible ready-subject learners.

Fail when:

- operators cannot monitor health;
- the team cannot tell whether Hero Mode is helping or harming;
- support load exceeds the team’s ability to respond;
- default-on would expose learners whose subject mix is not ready.

---

## 11. Stop conditions

Stop widening immediately if any of the following occur:

- raw child content appears in telemetry, logs, exports, support notes, or ops output;
- non-cohort accounts see Hero surfaces unintentionally;
- Hero command succeeds for a non-enabled account;
- duplicate daily coin award is observed;
- duplicate Camp debit is observed;
- negative balance appears;
- claim succeeds without Worker-verified subject completion;
- Hero Mode mutates subject Stars, mastery, or subject monsters;
- child-visible primary CTA is dead or unlaunchable;
- rollback cannot hide Hero surfaces while preserving state;
- repeated unexplained 500s occur on Hero read model or command routes;
- support cannot explain or triage a real family issue;
- parent/adult feedback indicates the feature is misleading or pressuring the child.

A stop condition does not mean deleting Hero state. The default response remains:

```txt
narrow or clear cohort enablement
keep global flags off
preserve Hero state dormant
investigate with request IDs, learner IDs, date keys, and safe telemetry
```

---

## 12. Warning conditions

Warning conditions do not automatically stop pA4, but they require an owner and decision before widening:

- low Hero Quest start rate;
- low completion rate;
- repeated abandonment after first task;
- children open Camp but do not start learning;
- parents misunderstand Hero Coins;
- telemetry has blind spots for a non-critical signal;
- one ready subject dominates the schedule more than expected;
- support questions cluster around copy or navigation;
- performance is slower than ideal but not failing.

The planner should avoid treating every warning as a blocker. A4 needs judgement. Block only what threatens child safety, data/privacy, learning integrity, economy integrity, or the ability to roll back.

---

## 13. Metrics for pA4

### 13.1 Required launch metrics

- cohort accounts enabled;
- active learner count;
- Hero Quest shown count;
- Hero Quest start count;
- Hero task start count;
- Hero task completion count;
- Hero daily completion count;
- claim success/rejection count;
- coin award count;
- duplicate prevention count;
- Camp open/invite/grow/insufficient count;
- rollback-hidden checks;
- non-cohort exposure checks.

### 13.2 Required product metrics

- start rate from shown Hero Quest;
- daily completion rate;
- next-day return;
- subject mix;
- task intent mix;
- abandonment points;
- support/confusion reports;
- extra subject practice after cap;
- Camp usage after completion.

### 13.3 Required safety metrics

- duplicate daily award count;
- duplicate Camp debit count;
- negative balance count;
- dead CTA count;
- claim-without-completion count;
- non-cohort exposure count;
- raw child content violation count;
- subject Star/mastery drift attributable to Hero Mode;
- Hero route 4xx/5xx rates;
- rollback rehearsal result.

### 13.4 What not to optimise yet

Do not optimise pA4 around:

- maximum coin earning;
- maximum Camp opens;
- raw time-on-site;
- raw question count;
- streak retention;
- shop conversion;
- leaderboard behaviour.

The leading indicator should be:

```txt
children start and complete the daily Hero Quest, learning safety stays intact, economy remains clean, and support load stays manageable.
```

---

## 14. Support and communication contract

### 14.1 Parent/adult explainer

The explainer should say:

- Hero Mode gives one daily mission across ready subjects;
- it uses Spelling, Grammar, and Punctuation where ready;
- more subjects may join later;
- subject mastery and Stars still belong to each subject;
- Hero Coins reward daily mission completion, not speed or every correct answer;
- Hero Camp is optional and secondary;
- this is early access, so feedback is welcome.

It should not say:

- Hero Mode covers all six KS2 subjects;
- coins are earned for every right answer;
- a child loses anything for missing a day;
- Hero Mode replaces subject practice;
- Hero Mode is final/default for everyone.

### 14.2 Support triage minimum

Support should collect:

- account safe alias or account ID;
- learner safe alias or learner ID;
- dateKey;
- approximate time;
- device/browser;
- what surface was visible;
- request ID if available;
- whether the issue is learning flow, claim, coins, Camp, visibility, or copy.

Support should avoid collecting:

- raw answer text;
- raw prompt text;
- child free text;
- screenshots containing sensitive child content unless a safe handling route exists.

---

## 15. Engineering implementation notes

### 15.1 External cohort resolver

If not already present, pA4 should add a minimal resolver such as:

```txt
HERO_EXTERNAL_ACCOUNTS=["account-a", "account-b"]
```

Requirements:

- pure function, unit tested;
- additive-only for listed external accounts;
- separate internal and external classifications;
- malformed JSON fails closed;
- non-listed accounts inherit global flags;
- read model and command gates use the same resolver;
- ops output reports `overrideStatus` or equivalent without leaking sensitive data.

Optional later extension:

```txt
HERO_ROLLOUT_PERCENT=5
HERO_ROLLOUT_SALT=...
```

Do not add percentage bucketing unless A4 actually needs a second wave or staged default-on. A simple allowlist is enough for the first external cohort.

### 15.2 No new state shape unless required

pA4 should avoid migrations and state-shape changes. If cohort metadata is needed, prefer environment/config and safe logs over new persistent state.

New persistent fields are allowed only if they are essential to rollout control, support, or auditability.

### 15.3 Production release candidate discipline

Before external exposure, freeze a release candidate. Only allow changes that are:

- blocker fixes;
- rollout-control fixes;
- privacy fixes;
- support/ops fixes;
- copy changes that remove confusion or pressure.

Reject:

- new gameplay;
- new economy mechanics;
- new monsters;
- visual polish that risks regressions;
- broad refactors;
- unrelated subject work inside the same release candidate.

---

## 16. Exit criteria

pA4 is complete only when all of the following are true:

### 16.1 External cohort completed or deliberately stopped

- first external cohort was enabled through a controlled mechanism;
- cohort ran for the planned window or was stopped for a documented reason;
- non-cohort exposure checks passed;
- support and telemetry were reviewed.

### 16.2 Product and safety evidence reviewed

- start/completion/abandonment signals reviewed;
- subject mix and task intent mix reviewed;
- claim/economy/Camp integrity reviewed;
- privacy checks reviewed;
- subject mastery/Star drift reviewed;
- support issues classified;
- warning conditions resolved, accepted, or scheduled.

### 16.3 Decision issued

The final pA4 recommendation must state one of:

```txt
PROCEED TO STAGED DEFAULT-ON
HOLD AND HARDEN
ROLL BACK / KEEP DORMANT
```

It must include:

- evidence boundary;
- cohort size and duration;
- stop conditions encountered, if any;
- unresolved risks;
- support load;
- product value judgement;
- exact next rollout mechanism;
- owner for next phase or launch.

---

## 17. Default-on readiness criteria

pA4 may recommend staged default-on only if:

- no stop condition fired;
- non-cohort exposure stayed clean;
- duplicate award/debit counts are zero;
- negative balance count is zero;
- raw child content violation count is zero;
- dead CTA count is zero or explained and fixed;
- support load is manageable;
- children can find and complete the Hero Quest;
- parents are not materially confused by Hero Coins or Hero Camp;
- subject Star/mastery boundaries remain intact;
- rollback remains simple and verified;
- telemetry can still answer the key safety questions after widening.

A recommendation to proceed should still be staged. The first default-on step should be narrow, such as:

```txt
eligible new/demo accounts only
or
small deterministic account bucket
or
explicit wave of accounts selected by account age/readiness
```

Do not recommend broad default-on for every account unless the product has also proven that locked subjects, multi-learner households, returning old accounts, first-time accounts, low-connectivity sessions, and support paths all behave acceptably.

---

## 18. Planner discretion

The planner may choose:

- whether first external cohort is 5, 8, or 10 accounts;
- whether the first cohort runs 7 or 14 days;
- whether second wave is needed before the decision;
- whether external control is allowlist-only or includes percentage bucketing;
- exact telemetry extraction shape;
- exact support pack format;
- exact parent/adult explainer wording;
- whether A4 exits to staged default-on or a narrower A5 production-readiness phase.

The planner may not change:

- Hero Mode’s non-subject status;
- subject ownership of learning and mastery;
- capped daily economy;
- no per-question reward rule;
- no random reward rule;
- no six-subject claim;
- privacy boundary;
- preserve-state rollback;
- requirement for external cohort control before external exposure.

---

## 19. Suggested deliverables

pA4 should leave behind:

1. external cohort rollout-control implementation or verification note;
2. pA4 release candidate note;
3. parent/adult early-access explainer;
4. support triage pack;
5. external cohort evidence file;
6. pA4 metrics summary;
7. stop/warning condition register;
8. rollback evidence note;
9. final pA4 recommendation;
10. if proceeding, staged default-on plan.

Suggested paths:

```txt
docs/plans/james/hero-mode/A/hero-mode-pA4.md
docs/plans/james/hero-mode/A/hero-pA4-release-candidate.md
docs/plans/james/hero-mode/A/hero-pA4-external-cohort-evidence.md
docs/plans/james/hero-mode/A/hero-pA4-metrics-summary.md
docs/plans/james/hero-mode/A/hero-pA4-support-pack.md
docs/plans/james/hero-mode/A/hero-pA4-risk-register.md
docs/plans/james/hero-mode/A/hero-pA4-recommendation.md
scripts/hero-pA4-external-cohort-smoke.mjs
```

---

## 20. A5 forecast

If pA4 recommends staged default-on, A5 should be short and operational:

```txt
A5 — Staged Default-On and Post-Launch Monitoring
```

Likely A5 scope:

- deterministic percentage or eligibility-based rollout;
- final production support coverage;
- monitoring for 7-14 days after default-on;
- rollback drills remain active;
- no new gameplay;
- no six-subject widening;
- post-launch learning/reward-health review.

If pA4 recommends hold-and-harden, A5 should not be a launch phase. It should fix the specific blocking defects, not restart the whole assurance cycle.

---

## 21. Final pA4 contract statement

pA4 is successful when Hero Mode stops being only an internally proven feature and becomes a controlled, externally used production feature with real family evidence, support coverage, rollback control, and a grounded default-on decision.

Do not use pA4 to make Hero Mode bigger. Use pA4 to ship Hero Mode carefully, learn from real families, and decide whether it is ready to become a default production path.
