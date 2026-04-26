---
title: "Hero Mode P0 — Contract, Shadow Scheduler, and Read-Model Foundation"
type: product-engineering-origin
status: draft
date: 2026-04-26
owner: james
intended_path: docs/plans/james/hero-mode/hero-mode-p0.md
phase: P0
---

# Hero Mode P0 — Contract, Shadow Scheduler, and Read-Model Foundation

## 1. Guiding sentence

Hero Mode gives each child one daily mission across their ready subjects. The mission protects secure learning, repairs weak spots, and prepares a future capped Hero economy without letting rewards control the learning loop.

Phase 0 is not the child-facing launch of Hero Mode. Phase 0 is the foundation that proves the platform can compute a safe, deterministic, read-only daily Hero mission across ready subjects without touching subject mastery, Stars, Coins, monster state, practice sessions, or event logs.

The implementation-planning agent should treat this file as the origin contract. It should write its own implementation plan from this document, rather than assuming the unit breakdown here is exhaustive or final.

---

## 2. Phase 0 outcome

By the end of P0, the codebase should be able to answer this question in a debug/staging context:

> “For this learner, on this date, across the subjects that are actually ready, what would today’s Hero mission be, and why?”

The answer should be a read-only shadow read model. It should include eligible subjects, locked subjects, a deterministic daily quest envelope, planned effort, task envelopes, and debug reasons. It should not start any subject session, award any reward, mutate any state, or appear in the child dashboard.

A representative P0 response shape is:

```js
{
  ok: true,
  hero: {
    version: 1,
    mode: 'shadow',
    childVisible: false,
    coinsEnabled: false,
    writesEnabled: false,
    dateKey: '2026-04-26',
    timezone: 'Europe/London',
    schedulerVersion: 'hero-p0-shadow-v1',
    eligibleSubjects: [
      { subjectId: 'spelling', reason: 'worker-command-ready' },
      { subjectId: 'grammar', reason: 'worker-command-ready' },
      { subjectId: 'punctuation', reason: 'worker-command-ready' }
    ],
    lockedSubjects: [
      { subjectId: 'arithmetic', reason: 'placeholder-engine-not-ready' },
      { subjectId: 'reasoning', reason: 'placeholder-engine-not-ready' },
      { subjectId: 'reading', reason: 'placeholder-engine-not-ready' }
    ],
    dailyQuest: {
      questId: 'hero-quest-...',
      status: 'shadow',
      effortTarget: 18,
      effortPlanned: 18,
      tasks: [
        {
          taskId: 'hero-task-...',
          subjectId: 'grammar',
          intent: 'weak-repair',
          launcher: 'smart-practice',
          effortTarget: 6,
          reasonTags: ['weak', 'due-review'],
          heroContext: {
            questId: 'hero-quest-...',
            taskId: 'hero-task-...'
          }
        },
        {
          taskId: 'hero-task-...',
          subjectId: 'spelling',
          intent: 'post-mega-maintenance',
          launcher: 'guardian-check',
          effortTarget: 4,
          reasonTags: ['mega-maintenance', 'retention-after-secure'],
          heroContext: {
            questId: 'hero-quest-...',
            taskId: 'hero-task-...'
          }
        },
        {
          taskId: 'hero-task-...',
          subjectId: 'punctuation',
          intent: 'breadth-maintenance',
          launcher: 'smart-practice',
          effortTarget: 8,
          reasonTags: ['breadth', 'ready-subject'],
          heroContext: {
            questId: 'hero-quest-...',
            taskId: 'hero-task-...'
          }
        }
      ]
    },
    debug: {
      candidateCount: 9,
      rejectedCandidates: [],
      subjectMix: {
        spelling: 4,
        grammar: 6,
        punctuation: 8
      },
      safety: {
        noWrites: true,
        noCoins: true,
        noChildUi: true,
        noSubjectMutation: true
      }
    }
  }
}
```

This is a shadow prescription, not an assignment shown to the child.

---

## 3. Why Hero Mode exists

Hero Mode solves a product problem that subject-specific Post-Mega systems should not solve alone.

Once a child has secured or fully Megafied a subject, the product still needs a healthy reason for them to return. That reason should not be “keep grinding the same subject forever.” Mega should mean the subject is strong. The follow-on loop should be low-frequency, high-value maintenance: spaced checks, mixed review, retention-after-secure, recent lapse repair, and cross-subject breadth.

Hero Mode should become the daily platform-level route into this loop. It should help the child answer:

> “What is the most useful thing for me to practise today?”

It should not become:

> “How many questions can I click today for Coins?”

The learning loop must remain subject-owned. Hero Mode chooses the daily learning contract. The subject engines still own session creation, item selection, marking, feedback, mastery mutation, Stars, and subject reward projection.

---

## 4. Current repo context that P0 must respect

The current platform architecture already points to the correct boundary.

The README describes the project as a six-subject platform rebuild. It states that subject engines are separate from the shell, the game layer reacts to mastery instead of controlling learning flow, learner profiles belong to the platform, and the repository boundary is the persistence boundary. It also notes that Spelling works, Grammar has a Stage 1 Worker-command-backed practice surface, Punctuation has a rollout-gated production Worker-command-backed slice, and Arithmetic / Reasoning / Reading remain intentional placeholders with identities but no deterministic learning engine.

The Worker README states that production practice writes go through:

```txt
POST /api/subjects/:subjectId/command
```

For Spelling, Grammar, and Punctuation, the Worker owns session creation, selection/generation, marking/scoring, progress mutation, completed session writes, event publication, reward projection, and returned read models. It also documents generic learner-scoped collections: `child_subject_state`, `practice_sessions`, `child_game_state`, and `event_log`. P0 must not create a parallel persistence system.

The subject expansion checklist says production subjects must not ship their production engine as a browser runtime. It also says session creation, marking, scheduling, progress mutation, and reward projection should be owned by Worker subject commands before a subject is treated as production-ready. It further states that reward projection follows domain events, not UI clicks or game-layer state.

The current subject registry includes six subject identities, but the Worker subject runtime currently wires command handlers for Spelling, Grammar, and Punctuation. That means Hero Mode must begin with an eligible-subject model rather than a six-subject assumption.

Relevant repo references for the implementation-planning agent:

- `README.md`
- `worker/README.md`
- `docs/subject-expansion.md`
- `src/platform/core/subject-registry.js`
- `worker/src/subjects/runtime.js`
- `src/platform/game/monsters.js`
- `docs/plans/james/grammar/grammar-p5.md`
- `docs/plans/james/punctuation/punctuation-p5.md`

---

## 5. Relationship to Grammar P5 and Punctuation P5

Hero Mode must align with the Grammar and Punctuation reward hardening direction.

Grammar P5 moves Grammar monsters toward a 100-Star display model where Stars represent learning evidence, not XP. It explicitly rejects “answer a question, get +1 XP” behaviour. It also separates independent wins, repeat evidence, varied practice, secure confidence, and retained-after-secure evidence.

Punctuation P5 follows the same product direction: 100 Stars should represent Mega, late-stage progress should require mixed / spaced / deep evidence, and small-denominator monsters should not become Mega from a tiny amount of simple evidence.

Therefore Hero Mode must not introduce a second reward layer that undermines these subject contracts.

Correct relationship:

```txt
Subject Stars = subject-owned learning evidence.
Hero Quest = daily platform learning contract.
Hero Coins = future capped completion economy.
Hero Pool = future cross-subject autonomy surface.
```

Incorrect relationship:

```txt
Hero task completed => subject Stars granted.
Hero Coins earned per correct answer.
Hero Mode decides item-level mastery.
Hero Mode mutates Grammar/Punctuation progress.
Hero Mode turns Mega into endless subject grind.
```

P0 must prove the correct relationship structurally by being read-only.

---

## 6. Phase 0 scope

P0 includes:

1. A written Hero Mode contract, represented by this file.
2. Shared Hero constants and normalisers for a future implementation.
3. An eligible-subject resolver.
4. A task-envelope model.
5. Worker-side provider stubs for Spelling, Grammar, and Punctuation.
6. A deterministic shadow scheduler.
7. A read-only Worker Hero read model behind a feature flag.
8. Fixtures and tests that prove the scheduler is deterministic, explainable, and safe.
9. No-write boundary tests that make P0 impossible to accidentally turn into a reward system.
10. Planning guidance for later P1+ phases without implementing them.

P0 excludes:

1. No child-facing Hero dashboard card.
2. No Hero Camp.
3. No Hero Coins ledger.
4. No Hero monster ownership state.
5. No unlock / evolve commands.
6. No `POST /api/hero/command`.
7. No subject session launch from Hero.
8. No `heroContext` sent to subject commands yet, unless the implementation-planning agent explicitly creates a read-only shape fixture with no runtime use.
9. No writes to `child_game_state`.
10. No writes to `child_subject_state`.
11. No writes to `practice_sessions`.
12. No writes to `event_log`.
13. No D1 migration.
14. No content release bump.
15. No change to Grammar / Punctuation Star calculation.
16. No change to Spelling, Grammar, or Punctuation marking, scheduling, mastery, or reward projection.
17. No production child exposure by default.

The implementation plan should treat any accidental child-facing UI, currency field, mutation command, or reward projection as scope creep.

---

## 7. Product contract

### 7.1 Hero Mode is not a seventh subject

Hero Mode is a platform-level orchestrator. It is not Spelling, Grammar, Punctuation, Arithmetic, Reasoning, or Reading. It does not have its own marking pedagogy. It does not own subject concepts, words, units, item banks, misconceptions, or answer specs.

Hero Mode may eventually:

- read subject read models;
- ask subject providers for candidate learning envelopes;
- choose a daily cross-subject mission;
- launch subject sessions through the existing subject command boundary;
- verify completed subject sessions;
- award capped Hero Coins;
- manage a cross-subject Hero Monster Pool.

In P0, it only reads and plans.

### 7.2 Hero Mode grows with ready subjects

Hero Mode must not wait for all six subjects to be complete.

Current P0 ready subjects:

```txt
spelling
grammar
punctuation
```

Current P0 locked subjects:

```txt
arithmetic
reasoning
reading
```

Locked subjects should appear in the read model with clear reasons, such as:

```js
{ subjectId: 'arithmetic', reason: 'placeholder-engine-not-ready' }
```

This avoids two bad outcomes:

1. blocking Hero Mode until all future subjects are complete;
2. pretending placeholder subjects can supply real learning tasks.

When Arithmetic, Reasoning, or Reading later become Worker-command-backed subject engines, they should join Hero Mode by adding a provider and changing eligibility, not by rewriting the scheduler.

### 7.3 Hero Mode protects Mega; it does not farm Mega

A fully secured / Mega subject should still appear occasionally in Hero Mode, but only for protection and maintenance.

Correct intents for a fully secured subject:

- `retention-after-secure`
- `post-mega-maintenance`
- `mixed-review-check`
- `recent-lapse-repair`
- `guardian-check`

Incorrect intents for a fully secured subject:

- daily high-volume re-drill;
- repeating already-secure low-difficulty items for reward;
- extracting extra Stars from the same evidence;
- making the child feel Mega must be re-earned every day.

Child-facing future copy should say something like:

> “Your Grammar Garden is Mega. Today’s Hero Quest is a quick guardian check to keep it strong.”

It should not say:

> “You are Mega, but you still need to do more Grammar questions.”

P0 does not implement this copy in UI, but the read-model reasons should already support this semantics.

### 7.4 Hero Mode is learning-first, reward-second

Future Hero Coins can exist, but they must be contained.

Future coin rules, not implemented in P0:

- Coins reward honest daily quest completion.
- Coins do not reward each correct answer.
- Coins do not punish mistakes.
- Coins do not encourage fastest-click behaviour.
- Skip / spam / no genuine attempt should not count.
- Daily Coins should be capped.
- Extra practice after cap may continue subject mastery, but should not become a high-yield coin farm.
- No loot boxes.
- No random paid-like shop.
- No “missed today = loss” streak shame.
- Monster unlock/evolve should be a child choice, not an automatic reward mutation.

P0 should include `coinsEnabled: false` and `writesEnabled: false` explicitly, so the foundation cannot be mistaken for a hidden economy.

---

## 8. Learning contract

Hero Mode should be a daily learning contract, not a daily question quota.

The scheduler should favour:

1. spaced retrieval;
2. mixed retrieval;
3. due review;
4. weak / recent miss repair;
5. independent-first practice;
6. corrective feedback inside subject sessions;
7. near retry where appropriate;
8. spaced return after secure;
9. low-frequency maintenance for fully secured subjects;
10. breadth across ready subjects.

Hero Mode should avoid:

1. random “20 questions” packets;
2. per-question currency;
3. forcing every subject every day regardless of readiness;
4. repeating the easiest subject because it is cheap engagement;
5. turning Mega into endless grind;
6. overriding subject-owned scheduling;
7. surfacing technical evidence labels to children.

P0 should encode the learning contract in reasons and task intents, even before any child sees the feature.

---

## 9. Effort budget model

Hero Mode should use effort budget, not raw item count.

Reason: 20 spelling words, 20 grammar questions, 20 punctuation questions, a maths reasoning set, and a reading passage do not have equal cognitive load. Hero Mode must plan by approximate learning effort.

P0 default recommendation:

```txt
Daily shadow effort target: 18 units
Normal future range: 18–24 units
Optional future long quest: 35–40 units
```

P0 should keep the number configurable and conservative. It is better to start too light than to create a hidden daily burden.

Suggested effort scale:

```txt
1 unit   quick recall / short independent item
1–2      grammar or punctuation quick item cluster
2–3      reasoning-style or multi-step task
3–5      reading passage / longer mixed task
4–8      subject-level smart-practice envelope
```

P0 task envelopes should use `effortTarget`, not `questionCount`.

Example:

```js
{
  subjectId: 'grammar',
  intent: 'weak-repair',
  launcher: 'smart-practice',
  effortTarget: 6
}
```

This leaves the Grammar engine free to decide how many actual questions are appropriate.

---

## 10. Task envelope model

P0 must use subject-level task envelopes, not item-level candidate selection.

This is the most important engineering boundary in P0.

Hero Mode should not directly select:

- a spelling word slug;
- a Grammar concept id;
- a Grammar template id;
- a Punctuation unit id;
- a Punctuation item id;
- a specific answer-spec task;
- a subject-internal misconception id.

Those are subject-owned. Hero Mode can say what kind of learning moment is needed. The subject engine decides the exact session content.

P0 task envelope shape:

```js
{
  taskId: 'hero-task-...',
  subjectId: 'grammar',
  intent: 'retention-after-secure',
  launcher: 'smart-practice',
  effortTarget: 6,
  reasonTags: ['mega-maintenance', 'due-review'],
  availability: 'available',
  heroContext: {
    questId: 'hero-quest-...',
    taskId: 'hero-task-...'
  },
  debugReason: 'Grammar has secure concepts due for mixed retention review.'
}
```

Allowed P0 intents:

```js
[
  'due-review',
  'weak-repair',
  'retention-after-secure',
  'post-mega-maintenance',
  'breadth-maintenance',
  'starter-growth'
]
```

Allowed P0 launchers:

```js
[
  'smart-practice',
  'trouble-practice',
  'mini-test',
  'guardian-check',
  'gps-check'
]
```

The implementation-planning agent may adjust names to match existing route/mode constants, but must keep the principle: Hero P0 schedules envelopes, not exact questions.

---

## 11. Scheduler contract

P0 scheduler must be deterministic, explainable, testable, and read-only.

### 11.1 Deterministic seed

The same learner on the same date with the same scheduler version and content fingerprint should receive the same shadow quest.

Suggested seed components:

```txt
learnerId + dateKey + timezone + schedulerVersion + contentReleaseFingerprint
```

`dateKey` should be derived in the learner/product timezone. For current product planning, assume Europe/London unless the app already stores a learner/account timezone.

### 11.2 Initial weighting

Suggested initial scheduler weighting:

```txt
60% due / spaced / retention
25% weak / recent miss repair
15% breadth / neglected ready subject
```

This is not a coin-optimising function. It is a learning-need function.

### 11.3 Subject mix cap

Suggested cap:

```txt
If 3+ subjects are eligible: no subject should exceed 45% of planned effort.
If 2 subjects are eligible: no subject should exceed 60% of planned effort.
If 1 subject is eligible: all effort may come from that subject, but debug must explain why.
```

The cap should be soft enough to avoid nonsense when only one subject has due work, but strong enough to prevent Hero Mode becoming “mostly the easiest subject”.

### 11.4 Fully secured subject treatment

If a subject is fully secured / Mega-like, it may provide tasks only when there is a valid maintenance reason:

- retention due;
- recent lapse;
- mixed check scheduled;
- low-frequency guardian check;
- breadth maintenance because other subjects are unavailable or overloaded.

It should not generate high-volume ordinary practice just to fill the quest.

### 11.5 Debug reasons

Every task should carry a reason that is adult/debug-readable.

Examples:

```txt
Grammar has weak concepts with recent misses.
Spelling is Mega-like, but a guardian retention check is due.
Punctuation has not appeared in the last planned Hero shadow mix.
Only Spelling is eligible today; other subjects are locked.
```

Do not surface these exact debug reasons to children in P0. They are for QA and future adult/admin review.

---

## 12. Subject provider contract

Each ready subject should expose a small Hero provider. The provider should be a read-only adapter from subject read-model signals to Hero task envelopes.

Suggested provider entrypoint:

```js
export function getHeroSubjectSnapshot({
  learnerId,
  subjectId,
  subjectReadModel,
  now,
  dateKey,
  timezone,
  schedulerVersion
}) {
  return {
    subjectId,
    available: true,
    unavailableReason: null,
    signals: {
      dueCount: 0,
      weakCount: 0,
      secureCount: 0,
      megaLike: false,
      postMegaAvailable: false,
      retentionDueCount: 0
    },
    envelopes: []
  };
}
```

Provider rules:

1. Providers must not call subject command handlers.
2. Providers must not mutate subject state.
3. Providers must not start sessions.
4. Providers must not mark answers.
5. Providers must not infer learning evidence that the subject read model cannot support.
6. Providers may return `available: false` with a clear reason instead of throwing.
7. Providers should be tolerant of missing fields while P5 reward changes are still being implemented.
8. Providers should prefer a safe generic envelope over a brittle item-level guess.

### 12.1 Spelling provider guidance

The Spelling provider may look for:

- due words;
- weak words;
- recent misses;
- Smart Review availability;
- Guardian / Boss / Post-Mega availability if already represented in read models;
- Mega-like or fully secured state.

P0 output examples:

```js
{
  subjectId: 'spelling',
  intent: 'due-review',
  launcher: 'smart-practice',
  effortTarget: 6,
  reasonTags: ['due', 'spaced-retrieval']
}
```

```js
{
  subjectId: 'spelling',
  intent: 'post-mega-maintenance',
  launcher: 'guardian-check',
  effortTarget: 4,
  reasonTags: ['mega-maintenance', 'retention-after-secure']
}
```

If Post-Mega signals are not safely available, the provider should emit only generic Smart Review envelopes.

### 12.2 Grammar provider guidance

The Grammar provider should align with Grammar P5 but not depend on P5 being finished.

It may look for:

- due concepts;
- weak concepts;
- confidence labels;
- secure concepts;
- retention-after-secure signals if available;
- Star/evidence fields if P5 has already introduced them;
- Smart Practice availability;
- Mini Test availability;
- Fix Trouble Spots availability.

It must not grant Stars or reinterpret Grammar’s evidence model.

P0 output examples:

```js
{
  subjectId: 'grammar',
  intent: 'weak-repair',
  launcher: 'trouble-practice',
  effortTarget: 6,
  reasonTags: ['weak', 'recent-miss']
}
```

```js
{
  subjectId: 'grammar',
  intent: 'retention-after-secure',
  launcher: 'smart-practice',
  effortTarget: 6,
  reasonTags: ['retention-after-secure', 'mixed-review']
}
```

If P5 Star fields do not exist yet, the provider should fall back to existing due/weak/confidence read-model signals or mark itself unavailable with `missing-hero-readable-signals`.

### 12.3 Punctuation provider guidance

The Punctuation provider should align with Punctuation P5 but not depend on P5 being finished.

It may look for:

- due units;
- weak / wobbly units;
- recent misses;
- secure units;
- retention-after-secure signals if available;
- GPS-style checks if represented as safe launchers;
- Smart Practice availability.

It must not grant Stars or reinterpret Punctuation’s evidence model.

P0 output examples:

```js
{
  subjectId: 'punctuation',
  intent: 'due-review',
  launcher: 'smart-practice',
  effortTarget: 6,
  reasonTags: ['due', 'spaced-retrieval']
}
```

```js
{
  subjectId: 'punctuation',
  intent: 'breadth-maintenance',
  launcher: 'gps-check',
  effortTarget: 6,
  reasonTags: ['breadth', 'mixed-review']
}
```

If Punctuation is disabled in a deployment environment, it should be listed as locked or temporarily unavailable, not crash Hero Mode.

---

## 13. Worker read-model contract

P0 should expose a read-only Worker route behind a feature flag.

Suggested route:

```txt
GET /api/hero/read-model?learnerId=...
```

Suggested flag:

```txt
HERO_MODE_SHADOW_ENABLED=true
```

Suggested behaviour:

```txt
flag off       -> disabled response or 404, following current repo route conventions
flag on dev    -> authenticated debug read model available
flag on staging-> QA/debug read model available
flag on prod   -> allowed only if explicitly accepted; still childInvisible/writeDisabled
```

Access rules:

1. Require authenticated adult/session or valid demo session.
2. Require readable learner access.
3. Do not allow arbitrary learnerId reads across account boundaries.
4. Reuse existing repository/auth/session patterns.
5. Do not bypass learner ownership checks.
6. Do not introduce a new direct D1 access pattern if existing repository helpers can provide the required data.

Write rules:

1. No `POST /api/hero/command` in P0.
2. No mutation receipts in P0.
3. No state revision bump in P0.
4. No child_game_state writes.
5. No child_subject_state writes.
6. No practice_sessions writes.
7. No event_log writes.
8. No account_subject_content writes.
9. No platform monster visual config writes.

The route should be safe to call repeatedly and concurrently with identical results for the same inputs.

---

## 14. Codebase placement guidance

The implementation-planning agent should propose final file paths, but the intended shape is three layers.

### 14.1 Shared pure layer

Suggested location:

```txt
shared/hero/
```

Suggested files:

```txt
shared/hero/constants.js
shared/hero/contracts.js
shared/hero/eligibility.js
shared/hero/task-envelope.js
shared/hero/scheduler.js
shared/hero/random-seed.js
```

Rules:

- pure functions only;
- no React imports;
- no Worker repository imports;
- no subject command handler imports;
- no browser storage imports;
- no D1 imports;
- deterministic under fixed inputs;
- usable in Node tests.

### 14.2 Worker read-model layer

Suggested location:

```txt
worker/src/hero/
```

Suggested files:

```txt
worker/src/hero/read-model.js
worker/src/hero/routes.js
worker/src/hero/providers/index.js
worker/src/hero/providers/spelling.js
worker/src/hero/providers/grammar.js
worker/src/hero/providers/punctuation.js
```

Rules:

- Worker-only read model;
- read existing learner/subject data through the accepted repository/read-model patterns;
- do not dispatch subject commands;
- do not mutate any repository;
- do not import React;
- keep provider logic small and explainable;
- fail safe with unavailable reasons.

### 14.3 Tests and fixtures

Suggested locations:

```txt
tests/hero-contracts.test.js
tests/hero-eligibility.test.js
tests/hero-task-envelope.test.js
tests/hero-scheduler.test.js
tests/hero-providers.test.js
tests/worker-hero-read-model.test.js
tests/hero-no-write-boundary.test.js
tests/fixtures/hero/
```

Suggested fixtures:

```txt
tests/fixtures/hero/fresh-three-subjects.json
tests/fixtures/hero/spelling-mega-grammar-weak.json
tests/fixtures/hero/all-ready-balanced.json
tests/fixtures/hero/punctuation-disabled.json
tests/fixtures/hero/zero-eligible-subjects.json
```

P0 should not require `src/platform/game/hero/*` client UI. If a client-side normaliser is added for future use, it must not be imported by the child dashboard in P0.

---

## 15. Safety invariants

The implementation plan must include tests that prove these invariants.

### 15.1 No state writes

P0 Hero code must not write to:

```txt
child_game_state
child_subject_state
practice_sessions
event_log
account_subject_content
platform_monster_visual_config
platform_monster_visual_config_versions
mutation_receipts
```

### 15.2 No reward writes

P0 must not create or mutate:

```txt
Hero Coins
Hero ledger
Hero monster ownership
Hero monster stage
Hero unlock/evolve purchases
subject Stars
subject monster mastery
subject reward projection
```

### 15.3 No subject authority leaks

P0 must not:

```txt
start subject sessions
mark answers
score attempts
choose exact question items as authority
mutate mastery
publish domain events
project subject rewards
dispatch subject commands
ship browser-local production engines
```

### 15.4 No child exposure

P0 must not:

```txt
add a child dashboard Hero card
add Hero Camp UI
add Hero Coins copy
add Hero streak copy
add Hero shop copy
add loot/random reward copy
change subject landing primary CTAs
change subject route navigation
```

### 15.5 Explicit disabled flags

The P0 read model should include explicit safety flags:

```js
{
  childVisible: false,
  coinsEnabled: false,
  writesEnabled: false
}
```

This is intentionally redundant. It helps QA and future agents see that P0 is a shadow mode.

---

## 16. Test expectations

P0 should not be accepted without tests in these categories.

### 16.1 Contract tests

- Valid intents pass.
- Unknown intents fail.
- Valid launchers pass.
- Unknown launchers fail.
- Effort target is bounded.
- Task envelope normaliser strips unsafe debug-only fields from future child-facing shapes.
- Locked subjects can be represented safely.

### 16.2 Eligibility tests

- Spelling / Grammar / Punctuation are eligible when their providers are available.
- Arithmetic / Reasoning / Reading are locked by default.
- Punctuation can be temporarily disabled without crashing Hero Mode.
- Zero eligible subjects returns a safe empty shadow quest.
- Future subject addition requires provider/eligibility change, not scheduler rewrite.

### 16.3 Scheduler tests

- Same learner + same date + same scheduler version + same content fingerprint returns same quest.
- Different date usually changes quest.
- Due / retention tasks outrank random breadth.
- Weak / recent miss tasks outrank secure maintenance.
- Subject effort caps are respected when multiple subjects are eligible.
- A single eligible subject can fill the quest with a debug explanation.
- Fully secured / Mega-like subjects receive only maintenance-style envelopes.
- Every task includes reason tags and debug reason.
- Scheduler output contains no coin reward fields except `coinsEnabled:false` safety metadata.

### 16.4 Provider tests

- Providers return unavailable reasons instead of throwing on missing fields.
- Providers do not import or call command handlers.
- Providers do not mutate read-model input objects.
- Grammar provider works with both pre-P5 and post-P5-style snapshots.
- Punctuation provider works with both pre-P5 and post-P5-style snapshots.
- Spelling provider can emit generic Smart Review envelopes even if Post-Mega signals are absent.

### 16.5 Worker route tests

- Flag off disables the route.
- Flag on returns a read model for an authorised learner.
- Cross-account learner access is denied.
- Expired demo access is denied if that is the existing demo policy.
- Repeated calls do not change learner/account revisions.
- Repeated calls do not create mutation receipts.
- Concurrent calls do not write state.
- Returned shape includes `mode:'shadow'`, `childVisible:false`, `coinsEnabled:false`, `writesEnabled:false`.

### 16.6 No-write boundary tests

The implementation should include structural or behavioural tests proving P0 code cannot write reward or subject state. Grep-style tests are acceptable when they protect the boundary from accidental future drift.

Suggested assertions:

- no Hero P0 module imports write repository helpers;
- no Hero P0 module calls subject runtime dispatch;
- no `/api/hero/read-model` path writes to repository mutation methods;
- no child dashboard component imports Hero P0 read model;
- no P0 copy contains “coin”, “shop”, “deal”, “loot”, or “streak loss” in child surfaces.

The exact implementation should follow existing repo test patterns.

---

## 17. Shadow simulation guidance

The implementation-planning agent should consider a simple simulation script or fixture-driven test harness. This is not a child feature. It is a way to inspect scheduler behaviour before UI or rewards exist.

Possible script:

```txt
scripts/hero-shadow-simulate.mjs
```

Possible output:

```txt
Hero Shadow Simulation
learners: 12
avg effort target: 18
subject mix: spelling 34%, grammar 33%, punctuation 33%
reason tags: due 42%, weak 26%, maintenance 20%, breadth 12%
post-mega maintenance tasks: 8
invalid tasks: 0
```

Simulation should include at least these learner shapes:

1. fresh learner with all three ready subjects available;
2. spelling Mega-like, grammar weak, punctuation normal;
3. grammar secure but retention due;
4. punctuation disabled;
5. only one eligible subject;
6. zero eligible subjects;
7. missing Grammar P5 Star fields;
8. missing Punctuation P5 Star fields.

The goal is to catch bad scheduler incentives before a child ever sees Hero Mode.

---

## 18. Acceptance criteria

P0 is complete when all of these are true.

### 18.1 Product acceptance

- Hero Mode is documented as a platform-level daily learning contract, not a seventh subject.
- P0 is documented as read-only shadow mode.
- Subject Stars remain subject-owned learning evidence.
- Future Hero Coins are described as capped daily contract rewards, not per-question XP.
- Fully secured / Mega subjects are protected through low-frequency maintenance, not endless grind.
- Ready subjects are Spelling, Grammar, and Punctuation only.
- Arithmetic, Reasoning, and Reading are locked / coming later.

### 18.2 Architecture acceptance

- Hero P0 code has a shared pure layer.
- Hero P0 Worker code is read-model-only.
- Hero P0 has no child dashboard integration.
- Hero P0 has no D1 migration.
- Hero P0 has no `POST` command route.
- Hero P0 reuses existing auth/session/learner access rules.
- Hero P0 does not bypass repository boundaries.

### 18.3 Scheduler acceptance

- Scheduler is deterministic under fixed inputs.
- Scheduler is explainable through reason tags and debug reasons.
- Scheduler uses effort budget, not raw question count.
- Scheduler respects eligible/locked subjects.
- Scheduler avoids high-volume post-Mega grind.
- Scheduler has safe behaviour for zero eligible subjects.

### 18.4 Safety acceptance

- No writes to learner, subject, game, practice, event, account content, monster visual config, or mutation receipt state.
- No reward projection changes.
- No subject mastery changes.
- No subject Star changes.
- No Hero Coins or Hero monsters persisted.
- No child-facing Hero UI.

### 18.5 Testing acceptance

- Contract tests pass.
- Eligibility tests pass.
- Scheduler tests pass.
- Provider tests pass.
- Worker read-model tests pass.
- No-write boundary tests pass.
- Existing Spelling, Grammar, Punctuation, Worker, and subject-expansion tests stay green.

---

## 19. Future phase boundaries

These future phases are included only to stop P0 from absorbing them.

### Hero Mode P1 — Launchable task envelopes

Likely scope:

- child-invisible or limited internal route from Hero task envelope to subject command payload;
- `heroContext` added to subject command payloads in a no-reward, no-claim manner;
- one subject launch path proved end-to-end, probably Spelling first;
- still no Coins and no Hero Camp.

### Hero Mode P2 — Child-facing Today’s Hero Quest

Likely scope:

- dashboard Hero card;
- one primary CTA: “Start today’s Hero Quest”;
- progress through daily tasks;
- return-to-Hero summary after subject task;
- still no Coins, or only non-persistent placeholder copy if product explicitly chooses.

### Hero Mode P3 — Coins ledger and idempotent completion claim

Likely scope:

- `POST /api/hero/command`;
- claim task completion;
- verify subject session belongs to learner;
- idempotent daily reward ledger;
- daily cap;
- two-tab / retry hardening;
- no per-question Coins.

### Hero Mode P4 — Hero Camp and Hero Monster Pool

Likely scope:

- independent Hero-owned monster state;
- initial Hero Pool using reserved monster art assets if product confirms;
- unlock/evolve spend actions;
- child choice surface;
- confirm/undo/refund policy;
- no random draw / loot-box mechanic.

Candidate initial Hero Pool monsters, subject to product confirmation:

```txt
glossbloom
loomrill
mirrane
colisk
hyphang
carillon
```

These should be Hero-owned if used. They should not be treated as Grammar-owned or Punctuation-owned reserve progress.

### Hero Mode P5 — Post-Mega hardening

Likely scope:

- Mega maintenance interval policy;
- retention lapse detector;
- Guardian-style Hero tasks;
- parent/admin reporting for post-secure retention;
- metrics review for learning health vs engagement health;
- copy hardening: Mega is protected, not re-earned.

---

## 20. Metrics to design for, not necessarily emit in P0

P0 should shape its debug read model so these later metrics are possible.

### 20.1 Learning health

- independent-first attempt rate;
- support-before-answer rate;
- retention-after-secure pass rate;
- recent-lapse repair rate;
- due debt over time;
- weak item recovery time;
- mixed review success after 7 / 14 / 30 days;
- post-Mega lapse frequency;
- subject mastery inflation check.

### 20.2 Engagement health

- Hero Quest start rate;
- Hero Quest completion rate;
- next-day / next-week return;
- drop-off after first task;
- task abandoned reason;
- subject mix distribution;
- extra practice after coin cap, once Coins exist.

### 20.3 Reward health

Future only, not P0:

- Coins earned per learner per day;
- cap reached rate;
- bonus-practice rate after cap;
- monster unlock distribution;
- monster hoarding rate;
- undo/refund usage;
- double-claim prevention count;
- spam/no-attempt rejected count;
- two-tab conflict count.

The important future leading indicator is not “more questions answered.” It is:

> retention-after-secure improves while spam, skips, and too-fast attempts do not increase.

---

## 21. Copy direction for future phases

P0 should not add child copy, but future copy should follow these principles.

Good child copy:

```txt
Today’s Hero Quest is ready.
Keep your strongest skills strong.
Fix one wobbly spot.
Your Mega skills only need a quick guardian check today.
```

Bad child copy:

```txt
Do more questions to earn more Coins.
Don’t miss today’s deal.
You lost your streak.
Your Mega is not enough.
Grind this subject again.
```

Good adult/debug copy:

```txt
Chosen because Grammar has retention-after-secure evidence due.
Chosen because Punctuation has recent weak units.
Chosen because Spelling is fully secure and scheduled for low-frequency maintenance.
```

Bad adult/debug copy:

```txt
Chosen because this gives the most Coins.
Chosen because this is the fastest task.
Chosen randomly.
```

---

## 22. Open questions for the implementation-planning agent

The implementation-planning agent should resolve or explicitly defer these questions.

1. Should P0 return `404`, `403`, or `{ ok:false, code:'hero_shadow_disabled' }` when `HERO_MODE_SHADOW_ENABLED` is false?
2. What is the correct source of learner timezone today? If none exists, should P0 use Europe/London or account locale?
3. What existing Worker repository/read-model helper should the Hero read model reuse for subject snapshots?
4. How should P0 compute `contentReleaseFingerprint` across Spelling, Grammar, and Punctuation without creating a new content-release dependency?
5. How should provider tests represent pre-P5 vs post-P5 Grammar/Punctuation snapshots?
6. Should the P0 route be adult/debug only, or also available to demo sessions for QA?
7. Should capacity telemetry include the Hero read-model route in P0, or wait until child-facing P2?
8. Should the simulation script be required for P0 acceptance or treated as strongly recommended?
9. What existing completeness-gate pattern should be copied for P0 closeout?
10. What naming convention should be used: `hero-mode`, `hero`, or `daily-hero`?

Defaults recommended by this origin doc:

```txt
Disabled route: follow existing Worker route convention.
Timezone: Europe/London unless learner/account timezone exists.
Content fingerprint: schedulerVersion + subject release ids if available; otherwise null with debug reason.
Demo sessions: allowed only if existing learner access checks pass.
Capacity telemetry: optional in P0, required before child-facing launch.
Simulation script: strongly recommended.
Naming: shared/hero and worker/src/hero.
```

---

## 23. Planning instructions for the next agent

The next agent should not immediately implement child UI or Coins.

It should produce a root-level implementation plan, probably under:

```txt
docs/plans/2026-04-26-xxx-feat-hero-mode-p0-shadow-scheduler-plan.md
```

That implementation plan should:

1. cite this origin document;
2. state P0 scope and non-goals clearly;
3. list implementation units;
4. identify exact files to create/change;
5. identify tests for each unit;
6. include a no-write safety gate;
7. include a route flag strategy;
8. include a QA/debug verification method;
9. prove existing subject boundaries remain intact;
10. keep future P1+ work out of P0.

A sensible unit family would be:

```txt
U0  Origin contract / plan alignment
U1  Shared Hero constants and envelope normaliser
U2  Eligibility resolver
U3  Subject provider stubs
U4  Deterministic scheduler
U5  Worker read-model route behind flag
U6  Fixtures / simulation
U7  No-write boundary tests
U8  Completeness gate / closeout
```

This unit list is guidance, not a command. The implementation-planning agent should adapt it to the actual codebase after inspecting current files.

---

## 24. Glossary

### Hero Mode

A platform-level daily mission system across ready subjects. Not a subject. Not a marking engine.

### Daily Hero Quest

The future child-facing daily mission. In P0 this exists only as a shadow read-model quest.

### Shadow quest

A read-only computed quest that is not shown to children and does not mutate state.

### Ready subject

A subject with enough Worker-command-backed learning engine and read-model support to safely contribute Hero task envelopes.

### Locked subject

A subject identity that exists in the platform but should not contribute Hero tasks yet.

### Task envelope

A subject-level Hero instruction such as “Grammar weak repair, effort 6, smart practice.” It is not a specific question/item selection.

### Effort target

An approximate learning load unit. Hero Mode should plan effort, not raw question count.

### Retention-after-secure

Evidence that a child can still succeed after a concept/word/unit has already become secure and time has passed.

### Post-Mega maintenance

Low-frequency review for a fully secured / Mega-like subject. Its purpose is to protect durable learning, not generate endless reward progress.

### Hero Coins

A future capped economy for honest daily quest completion. Not implemented in P0. Not per-question XP.

### Hero Pool

A future cross-subject monster pool owned by Hero Mode. Not implemented in P0.

---

## 25. Final P0 rule

When in doubt, keep P0 boring.

P0 should be a small, deterministic, read-only planning layer. It should make the future Hero Mode safer by proving the hardest boundary first:

> Hero Mode can recommend a daily learning mission without becoming the learning engine, the reward engine, or the child-facing game economy.
