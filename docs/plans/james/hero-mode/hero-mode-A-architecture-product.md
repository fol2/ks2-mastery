# Hero Mode A — Architecture and Product Contract

Version: post-P6 product and architecture review draft  
Scope: KS2 Mastery platform-level **Hero Mode** only  
Purpose: give the next product, learning, design, and engineering agent a fast but complete understanding of what Hero Mode is, why it exists, what has shipped by P6, and which boundaries must not be crossed.

---

## 0. One-sentence summary

Hero Mode is not a seventh subject and not a reward wrapper over random practice; it is the platform-level daily learning contract that selects a small cross-subject mission from ready subjects, tracks honest completion, awards capped Hero Coins, and gives the child a calm Hero Camp where those Coins can invite and grow Hero-owned monsters.

The product truth after P6 is:

```txt
Ready subject engines still own learning.
Hero Mode owns the daily contract, capped economy, and Hero Camp.
```

This distinction is the whole feature. If it is lost, Hero Mode becomes either a fake subject or a reward-chasing layer. Neither is acceptable.

---

## 1. Learner perspective: why Hero Mode exists

### 1.1 The real problem

KS2 Mastery already has subject engines. Spelling, Grammar, and Punctuation can teach, mark, schedule, and show mastery. But once a child has secured a lot of subject content, especially when a subject is Mega or nearly fully secure, the app still needs a healthy reason for the child to return.

The wrong answer is:

```txt
Keep giving them more of the same questions for coins.
```

That creates rushing, easy-task preference, and reward chasing.

The right answer is:

```txt
Give the child one daily Hero Quest that protects secure learning, repairs weak spots, and keeps the ready subjects alive through spaced, mixed, explainable practice.
```

Hero Mode exists to turn “What should I do today?” into a simple, trusted answer.

### 1.2 What the child should feel

A child should feel:

- “There is one clear Hero Quest for me today.”
- “The app chose this because it helps keep my subjects strong.”
- “I can finish it.”
- “When I finish, my Hero Coins are added.”
- “I can choose which Hero Camp monster to invite or grow.”

They should not feel:

- “I need to grind questions for money.”
- “I must chase a streak.”
- “If I miss today, I lose out.”
- “The easiest subject gives me the best reward.”
- “Monsters grow because I clicked fast.”

### 1.3 What parents and teachers should be able to trust

Parents and teachers should be able to trust that:

- Hero Mode does not change subject mastery.
- Hero Coins are capped and tied to daily quest completion, not question farming.
- Hero Camp is cosmetic/motivational, not evidence of subject mastery.
- Subject Stars, Mega status, and subject monsters still mean subject-owned learning evidence.
- The app can explain why a Hero task was selected, at least in internal/debug surfaces.

---

## 2. Hero Mode is not a subject

Hero Mode must never be treated as Spelling, Grammar, Punctuation, Arithmetic, Reasoning, or Reading.

A subject engine owns:

- content;
- item selection inside that subject;
- marking;
- support and feedback;
- retries;
- session summaries;
- subject progress;
- subject Stars;
- subject monsters;
- subject mastery and Mega status.

Hero Mode owns:

- cross-subject daily mission planning;
- ready/locked subject eligibility;
- Hero task envelopes;
- Hero context passed into subject sessions;
- task completion claims;
- daily progress;
- capped daily Hero Coins;
- Hero-owned economy ledger;
- Hero Camp;
- Hero Pool monster ownership and stage;
- Hero rollout metrics and safety guardrails.

The practical rule is:

```txt
Hero can ask a subject to run a learning round.
Hero cannot mark the learning round or mint subject mastery.
```

---

## 3. Ready subjects and locked subjects

Hero Mode launched with the ready-subject model.

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

This is a product feature, not a weakness. Hero Mode should grow with the platform. It should not wait for six subject engines before becoming useful.

Child-facing copy can say:

```txt
Hero Quest uses your ready subjects.
More subjects can join later.
```

It should not say:

```txt
Six-subject Hero Mode is complete.
```

That would be false until Arithmetic, Reasoning, and Reading are Worker-backed subject engines with their own Hero providers.

---

## 4. The learning contract

### 4.1 Hero Quest is a daily learning mission

Hero Quest is a small set of task envelopes selected from ready subjects. It uses effort budget rather than raw question count.

The intended daily shape is:

```txt
one child-visible Hero Quest per dateKey
small number of task envelopes
mixed ready subjects where possible
explainable reason tags
subject sessions remain normal subject sessions
```

Hero Quest should prioritise:

- due spaced retrieval;
- weak or recent-miss repair;
- retention after secure/Mega;
- breadth across ready subjects;
- neglected ready subjects;
- low-frequency post-Mega maintenance.

It should not prioritise:

- easiest tasks;
- shortest tasks;
- highest accuracy tasks;
- reward maximisation;
- repeated same-day grind.

### 4.2 Task envelopes, not item-level control

Hero Mode should continue to use task envelopes as its default abstraction:

```ts
{
  taskId,
  subjectId,
  intent,
  launcher,
  effortTarget,
  reasonTags,
  heroContext
}
```

Hero says:

```txt
Today we need a Grammar weak-repair round.
```

The Grammar engine decides the actual items.

This avoids Hero Mode becoming coupled to subject internals and preserves subject authority.

### 4.3 Intended scheduling mix

The original scheduling intent remains:

```txt
60% due / spaced / retention
25% weak or recent-miss repair
15% breadth / neglected ready subject
```

This is not a hard product promise to the child. It is a design principle for the scheduler and analytics.

### 4.4 Fully secure / Mega subjects

For a fully secure subject, Hero Mode should do low-frequency maintenance, not endless extra work.

Good child copy:

```txt
A quick check to keep a strong skill sharp.
```

Avoid:

```txt
You are Mega, but keep doing more questions.
```

The product meaning of Mega is “strong and worth protecting”, not “ready for infinite repetition”.

---

## 5. Hero progress and completion

### 5.1 What completion means

A Hero task is complete when the Worker verifies that a subject session:

- was launched through Hero Mode;
- belongs to the same learner;
- carries matching `heroContext`;
- has the expected `questId`, `questFingerprint`, and `taskId`;
- reached a completed subject session state or completed practice session summary;
- is claimed through the Hero command boundary.

The client is never the authority for completion.

### 5.2 What effort means

Hero effort is task-envelope effort, not raw question count.

If a task has `effortTarget: 6`, completion adds 6 Hero effort units. It does not matter whether the subject internally used 4, 6, or 10 prompts. The subject owns the learning mechanics; Hero owns the daily contract.

### 5.3 What daily complete means

By P3/P4/P5/P6, the practical rule is:

```txt
Daily complete = all planned Hero tasks for the current daily quest are completed.
```

P4 uses this authoritative completion as the sole normal trigger for the daily Hero Coins award.

---

## 6. Hero Coins product contract

Hero Coins are a capped economy for completing the daily Hero contract.

They are not:

- per-question XP;
- correctness-only reward;
- speed reward;
- no-hint reward;
- subject mastery;
- a paid currency;
- a streak;
- a random prize.

P4 established the first earning rule:

```txt
Daily Hero Quest complete → +100 Hero Coins exactly once.
```

There is no P4/P5 bonus economy.

The child-facing meaning is:

```txt
You completed today’s Hero Quest. Hero Coins were added.
```

The product must avoid:

```txt
Claim your reward.
Daily deal.
Don’t miss out.
Spend now.
Buy now.
Jackpot.
Loot.
```

P6 keeps the economy measurable and reversible, but it does not change this product contract.

---

## 7. Hero Camp product contract

### 7.1 What Hero Camp is

Hero Camp is the calm place where the child chooses how to use Hero Coins.

It should feel like:

```txt
I am growing my own Hero world.
```

It should not feel like:

```txt
I am shopping for rewards.
```

### 7.2 Initial Hero Pool roster

P5 established six Hero-owned monsters:

```txt
glossbloom
loomrill
mirrane
colisk
hyphang
carillon
```

These reuse existing monster assets. They are Hero Pool creatures, not active Grammar or Punctuation mastery creatures.

### 7.3 Costs and long runway

P5 established:

```txt
Invite monster: 150 Hero Coins
Grow to stage 1: 300
Grow to stage 2: 600
Grow to stage 3: 1000
Grow to stage 4: 1600
```

Total per fully grown monster:

```txt
3650 Hero Coins
```

At 100 Coins per completed daily quest, this gives a long runway without microtransactions, random reward mechanics, or short-term grinding loops.

### 7.4 Stage language

Recommended child-facing stages:

```txt
not invited
invited / egg
hatched
growing
strong
fully grown
```

Do not call Hero Camp stage 4 “Mega” unless the product deliberately wants Hero monsters to share subject monster language. Safer language is “fully grown” or “grand”. Subject Mega should remain subject-owned.

### 7.5 Branch policy after P6

P5 introduced branch fields internally. P6 chose Option A: no child-facing branch choice yet, default branch `b1`.

Current product truth:

```txt
No Path A / Path B choice is offered to children.
Branch remains an internal/future-compatible field.
```

Do not claim child choice of branch until the UI actually exposes it.

---

## 8. Child journey after P6

### 8.1 Home surface

When enabled, the home surface (HomeSurface) shows the Hero Quest card as the primary action.

The Hero Quest card may show:

- today’s Hero Quest;
- effort planned/completed;
- next task;
- continue current Hero task;
- task complete;
- daily complete;
- Hero Coins added after completion.

The subject grid remains available. Hero Mode should guide, not block.

### 8.2 Subject session

When a Hero task launches a subject, the subject surface remains subject-owned. A quiet Hero banner may show that the round is part of today’s Hero Quest, but the learning UI must remain focused on the subject.

Hero should not display Coins while the child is answering subject questions.

### 8.3 Completion and return

After the subject session completes, Hero claims the task and updates daily progress. The child returns to a Hero Quest context where the next task or daily completion is clear.

If claim fails, the child should see a gentle refresh/check-progress state, not technical claim language.

### 8.4 Hero Camp

Hero Camp is secondary to the daily quest. It should be visible only when the full flag stack is enabled and should never replace the main learning route.

Camp interactions should always:

- show current balance;
- show server-derived cost;
- require confirmation before debit;
- refresh from the server after action;
- show calm success or insufficient balance copy;
- avoid pressure language.

---

## 9. Game layer boundary

Hero Mode uses game mechanics, but the game layer must remain subordinate to learning.

### 9.1 Good game behaviour

Good Hero game behaviour:

- visible daily progress;
- capped Hero Coins;
- child choice in Camp;
- long-runway monster growth;
- calm acknowledgement;
- no downgrade of already-owned Hero Camp state on rollback;
- no randomised reward reveals.

### 9.2 Bad game behaviour

Bad Hero game behaviour:

- per-question currency;
- timed deals;
- loot boxes;
- random monster draws;
- streak shame;
- leaderboards;
- “spend now” pressure;
- subject mastery shortcuts;
- making easy subjects more attractive than weak repair.

### 9.3 Relationship to subject monsters

Subject monsters are evidence projections from subject mastery.

Hero Pool monsters are choices funded by capped daily Hero Coins.

Do not mix the ledgers.

```txt
Subject monster progress answers: “What learning evidence has this child secured?”
Hero Pool progress answers: “How has this child chosen to use Hero Coins?”
```

---

## 10. Product and learning metrics after P6

P6 introduced the measurement contract. The metrics are not decorations; they are the reason Hero Mode can safely approach rollout.

### 10.1 Learning health

Learning health answers:

```txt
Is Hero Mode improving return and retention without harming subject learning?
```

Important metrics include:

- independent-first-attempt rate;
- support-before-answer rate;
- task completion rate;
- task abandon rate;
- retention-after-secure pass rate;
- recent-lapse repair rate;
- due debt delta;
- weak-item recovery days;
- post-Mega lapse rate;
- subject mix share;
- easy-subject preference score;
- mastery inflation flag.

### 10.2 Engagement

Engagement answers:

```txt
Do children start, continue, and return to Hero Quest in a healthy way?
```

Important metrics include:

- card rendered;
- quest started;
- first task started;
- task completed;
- daily completed;
- next-day return;
- seven-day return;
- extra practice after daily complete;
- drop-off after task index;
- subject continue from Hero.

### 10.3 Economy and Camp

Economy/Camp health answers:

```txt
Does the economy motivate choice without creating hoarding, rapid-spend pressure, or duplicate accounting?
```

Important metrics include:

- daily coins awarded;
- duplicate award prevented;
- balance after award;
- balance bucket;
- ledger entry count;
- Camp opened;
- first invite;
- monster invited/grown;
- insufficient Coins;
- duplicate spend prevented;
- stale write;
- idempotency reuse;
- balance after spend;
- monster distribution;
- fully grown count;
- hoarding score;
- rapid spend flag.

### 10.4 Technical safety

Technical safety answers:

```txt
Can the system survive rollout and rollback without data loss?
```

Important metrics include:

- read-model latency;
- read-model size;
- command latency;
- state size;
- corrupt state repaired;
- state migration applied;
- asset load error;
- event-log mirror failure;
- stale write;
- retry-after-stale-write;
- two-tab conflict;
- flag misconfiguration.

---

## 11. Rollout product truth

P6 says Hero Mode is ready for staging, not default-on production.

The rollout rings are:

1. local/dev seeded;
2. staging seeded;
3. staging multi-day;
4. internal production;
5. limited production cohort;
6. wider production cohort;
7. default-on decision.

The key product principle is:

```txt
Rollback hides surfaces and stops writes at that layer, but preserves state dormant.
```

Rollback must never delete balances, ledgers, monster ownership, or daily progress.

---

## 12. What is true after P6

After P6, it is fair to claim:

- Hero Mode has a complete P0–P6 feature stack.
- The stack covers shadow scheduling, launch, child UI, progress claims, daily Coins, Hero Camp, and production hardening.
- The six-flag hierarchy exists and defaults off in production.
- Hero Camp asset paths were corrected to match the real asset layout.
- Camp command idempotency was hardened to include command-specific payload.
- Branch choice is not child-facing; default `b1` is used.
- 52 Hero metrics are defined.
- Analytics/readiness helpers exist as pure modules.
- Rollout and rollback playbooks exist.
- The current recommendation is staging rollout, not immediate general availability.

---

## 13. What should not be over-claimed

Do not claim:

- Hero Mode is fully production default-on.
- Six subjects are supported.
- Arithmetic, Reasoning, or Reading are production Hero providers.
- Hero Mode improves learning yet; P6 prepares measurement but does not provide real cohort data.
- P6 metrics are already wired into a full admin dashboard (they are readiness derivation utilities only, not a live dashboard).
- Per-account production cohort bucketing is implemented unless the code is separately verified.
- Hero Camp has manual QA sign-off unless staging QA has been completed.
- Branch choice exists for children.
- Hero Camp trading, leaderboards, refunds, or advanced mechanics exist.

---

## 14. Recommended next product posture

Do not create P7 immediately.

First, run the P6 rollout playbook through staging and internal production. Collect at least 2–4 weeks of data before deciding P7.

P7 should be chosen by evidence, not by roadmap momentum.

Possible P7 directions only after metrics (none approved for pA1):

- admin Hero readiness route;
- parent-facing Hero explanation/reporting;
- six-subject expansion when more subjects are Worker-backed;
- long-term ledger archival;
- Camp placement A/B test;
- bake-in/removal of some feature-flag checks after stable default-on.

Avoid P7 directions such as:

- random rewards;
- streak pressure;
- leaderboards;
- paid currency;
- per-question Coins;
- new earning mechanics before learning-health proof.

---

## 15. Product glossary

| Term | Meaning |
|---|---|
| Hero Mode | Platform-level daily learning contract and meta-game |
| Ready subject | A subject with a production-ready Worker engine and Hero provider |
| Locked subject | A registered subject not yet eligible for Hero scheduling |
| Hero Quest | One daily cross-subject mission made from task envelopes |
| Task envelope | Subject-level instruction to launch a type of practice round |
| Hero context | Server-created identity linking a subject session to a Hero task |
| Claim task | Internal Worker command that verifies a completed Hero task |
| Hero Coins | Capped daily contract currency; not per-question reward |
| Hero Camp | Child choice surface for using Hero Coins |
| Hero Pool | Hero-owned monster roster and state |
| Invite | Child-facing language for creating ownership of a Hero monster |
| Grow | Child-facing language for advancing an owned Hero monster |
| Camp enabled | Final feature flag layer exposing Hero Camp |

---

## 16. Reference paths

Core product/history docs:

- `docs/plans/james/hero-mode/hero-mode-p0.md`
- `docs/plans/james/hero-mode/hero-mode-p1.md`
- `docs/plans/james/hero-mode/hero-mode-p2.md`
- `docs/plans/james/hero-mode/hero-mode-p3.md`
- `docs/plans/james/hero-mode/hero-mode-p4.md`
- `docs/plans/james/hero-mode/hero-mode-p5.md`
- `docs/plans/james/hero-mode/hero-mode-p6.md`
- `docs/plans/james/hero-mode/hero-mode-p6-completion-report.md`
- `docs/plans/james/hero-mode/hero-mode-p6-readiness-report.md`
- `docs/plans/james/hero-mode/hero-mode-p6-rollout-playbook.md`

Core code paths:

- `shared/hero/constants.js`
- `shared/hero/scheduler.js`
- `shared/hero/task-envelope.js`
- `shared/hero/launch-context.js`
- `shared/hero/progress-state.js`
- `shared/hero/economy.js`
- `shared/hero/hero-pool.js`
- `shared/hero/monster-economy.js`
- `shared/hero/metrics-contract.js`
- `worker/src/hero/read-model.js`
- `worker/src/hero/routes.js`
- `worker/src/hero/launch.js`
- `worker/src/hero/claim.js`
- `worker/src/hero/camp.js`
- `worker/src/hero/analytics.js`
- `worker/src/hero/readiness.js`
- `worker/src/app.js`
- `src/platform/hero/hero-client.js`
- `src/platform/hero/hero-ui-model.js`
- `src/platform/hero/hero-camp-model.js`
- `src/platform/hero/hero-monster-assets.js`
- `src/surfaces/home/HeroQuestCard.jsx`
- `src/surfaces/home/HeroCampPanel.jsx`
- `src/surfaces/home/HeroCampMonsterCard.jsx`
- `src/surfaces/home/HeroCampConfirmation.jsx`
- `src/surfaces/home/HomeSurface.jsx`
- `wrangler.jsonc`

