---
title: "Cross-source Reward Presentation Contract"
type: product-engineering-contract
status: draft
date: 2026-04-28
owner: james
scope: Spelling, Punctuation, Grammar, Hero Mode, and future reward producers
---

# Cross-source Reward Presentation Contract

## 1. Guiding sentence

This is a unified reward presentation contract, not a unified evidence engine.

Subjects and modules may keep their own progress model. Spelling can keep its
mastered-word engine. Punctuation and Grammar can keep their Star high-water
projection. Hero Mode can remain a platform module with no Stars at all. The
shared contract starts only after a producer has decided that a learner-facing
reward moment exists.

The contract must answer:

> When any producer creates a reward moment, how do Toast, Celebration, replay,
> acknowledgement, and analytics consume it without knowing the producer's
> evidence engine?

---

## 2. Explicit non-goals

This contract does not:

1. migrate Spelling to Stars;
2. require future subjects to use Stars;
3. change any subject marking, scheduling, mastery, or evidence rules;
4. change Hero Mode shop, economy, inventory, ledger, or purchase logic;
5. introduce Hero-owned reward state before the Hero economy phase is approved;
6. migrate historic `event_log` rows in this documentation PR;
7. require every reward event to show both a toast and a celebration overlay;
8. unify adult-facing notifications in Parent Hub, Admin, email, or push;
9. replace in-page status surfaces such as Codex cards, Home meadow rendering,
   setup monster strips, or summary Star meters;
10. define audio, haptic, or desktop notification rendering beyond reserving
    future presentation kinds.

`displayState` remains a subject-owned projection for monster subjects that need
it. It is useful payload, not a universal schema requirement.

---

## 3. Current-state audit

### 3.1 Runtime flow today

The current reward pipeline has two partially shared paths:

1. Monster celebrations:
   - built as `type: 'reward.monster'` by
     `src/platform/game/mastery/shared.js`;
   - normalised and queued by `src/platform/game/monster-celebrations.js`;
   - acknowledged by `src/platform/game/monster-celebration-acks.js`;
   - rendered by `src/platform/game/render/CelebrationLayer.jsx`.

2. Toast-only rewards:
   - Spelling builds `type: 'reward.toast'` in
     `src/subjects/spelling/event-hooks.js`;
   - the event runtime treats any reaction event with `event.toast` or
     `event.monster` as a toast event;
   - client stores push those events into `state.toasts`.

These paths work, but they encode presentation rules in legacy event shapes:

- `reward.monster` always carries an embedded `toast` block.
- Monster overlays are detected by `type === 'reward.monster'` and
  `kind in caught/evolve/mega`.
- Toast dedupe uses event ids, while celebration acknowledgement has a
  monster-only local-storage key.
- Hero Mode currently has no reward presentation path.

### 3.2 Producer matrix

| Producer | Evidence engine | Current event source | Toast path | Celebration path | Current gap |
| --- | --- | --- | --- | --- | --- |
| Spelling monster reward | Mastered-word count and monster stage. No Stars. | `WORD_SECURED` -> `recordMonsterMastery()` -> `reward.monster`. | Embedded `event.toast` via `buildRewardMonsterEvent()`. | `reward.monster` queued by monster celebration helpers, deferred until session end. | Event shape is monster-specific; no explicit independent toast/celebration intents. |
| Spelling non-monster rewards | Guardian, Boss, Pattern Quest, and Achievement domain events. | `src/subjects/spelling/event-hooks.js` emits deterministic `reward.toast` events. | Direct toast-only route. | None. | Separate path from monster rewards; cannot declare "toast yes, overlay no" in a common schema. |
| Punctuation monster reward | Star high-water and display stage. | `STAR_EVIDENCE_UPDATED` -> `updatePunctuationStarHighWater()` -> `reward.monster`. | Embedded `event.toast`. | Monster celebration queue; all overlays defer to session end. | Uses the shared monster builder but still exposes presentation through legacy `reward.monster` shape. |
| Grammar monster reward | Star high-water and display stage; secure concepts no longer drive monster events. | `STAR_EVIDENCE_UPDATED` -> `updateGrammarStarHighWater()` -> `reward.monster`. | Embedded `event.toast`. | Monster celebration queue; all overlays defer to session end. | Same legacy monster shape as Punctuation. |
| Hero Mode P2 | Platform scheduler and launch bridge only. No Stars, no Coins, no Hero reward state. | No `hero.*` event-log rows; E2E tests assert zero Hero-owned events after launch. | None. | None. | Future Hero shop/economy needs reward presentation without becoming a subject and without forcing a toast. |
| Future non-Star subject | Producer-defined. | TBD. | Should be able to opt in or out. | Should be able to opt in or out. | Must not be forced into Stars or `displayState`. |

### 3.3 Important Hero Mode boundary

Hero Mode P2 is deliberately reward-free. The P2 origin document says it has no
Coins, Hero ledger, Hero monster ownership, Hero Camp, unlock/evolve actions,
task claim endpoint, `hero.*` events, Hero `child_game_state` writes, Hero D1
tables, subject Stars awarded by Hero, or Grammar/Punctuation Star semantic
changes.

The P2 completion report keeps the same boundary: P3 may add completion claims,
P4 may add Hero economy, and Punctuation command application must be revisited
when completion claims produce reward projections.

Therefore this contract prepares the presentation lane for future Hero rewards,
but it must not implement Hero economy semantics by itself.

---

## 4. Contract boundary

### 4.1 The producer owns evidence

Each producer owns:

- how it detects a milestone;
- whether that milestone is durable;
- whether it is subject-owned or module-owned;
- which learner-visible presentation, if any, should exist.

The shared layer must not derive learning truth from `kind`, `displayState`,
Stars, mastered count, Hero currency, or subject-specific payload fields.

### 4.2 The presentation layer owns rendering

Toast and Celebration are presentation services. They consume explicit
presentation intents. They should not infer copy, visual weight, or queue timing
from a producer's internal evidence model.

### 4.3 Toast and Celebration are independent

Every reward event may choose one of four presentation profiles:

| Profile | `presentations.toast` | `presentations.celebration` | Example |
| --- | --- | --- | --- |
| Both | one or more intents | one or more intents | Monster caught with a small toast and session-end overlay. |
| Toast only | one or more intents | empty | Guardian mission completed. |
| Celebration only | empty | one or more intents | Future Hero shop purchase with a visual reveal but no toast shelf entry. |
| Analytics only | empty | empty | Backend-only reward audit event or replay-safe marker. |

Consumers must render only the presentation intents that exist.

---

## 5. Proposed source-agnostic envelope

The vNext envelope is a presentation event. It can be emitted directly by new
producers or produced by adapters from legacy events during migration.

```js
{
  id: "reward.presentation:<producerType>:<producerId>:<rewardType>:<kind>:<dedupe-suffix>",
  type: "reward.presentation",

  producerType: "subject",      // "subject" | "module" | "platform"
  producerId: "punctuation",    // "spelling" | "grammar" | "hero-mode" | ...
  rewardType: "reward.monster", // "reward.monster" | "reward.hero" | "reward.badge" | ...
  kind: "caught",              // producer-defined, registry-backed

  learnerId: "learner-a",
  occurredAt: 1777399200000,
  sourceEventId: "optional-domain-event-id",

  fromState: null,              // producer-specific, optional
  toState: null,                // producer-specific, optional
  milestoneRankBefore: 0,       // optional numeric ordering helper
  milestoneRankAfter: 1,

  payload: {
    // Opaque producer payload. Examples:
    // monsterId, displayState, displayStars, stage, heroItemId, inventoryItemId,
    // price, currency, questId, releaseId, masteryKey.
  },

  presentations: {
    toast: [],
    celebration: [],
    // future keys: audio, haptic, desktopNotification, screenReader
  },

  analytics: {
    schemaVersion: 1
  }
}
```

### 5.1 Required fields

| Field | Rule |
| --- | --- |
| `id` | Deterministic and stable under replay. |
| `type` | `reward.presentation` for the new envelope. Legacy adapters may still read `reward.monster` and `reward.toast`. |
| `producerType` | `subject`, `module`, or `platform`. |
| `producerId` | Stable source id, for example `spelling`, `punctuation`, `grammar`, `hero-mode`. |
| `rewardType` | Stable product family, for example `reward.monster` or `reward.hero`. |
| `kind` | Producer-defined milestone kind, allowlisted through a registry. |
| `learnerId` | Required for routing, storage, and acknowledgement. |
| `occurredAt` | Event timestamp. |
| `presentations` | Object keyed by presentation kind. Known keys are `toast` and `celebration`; values are arrays of intents. Unknown keys must be ignored by consumers that do not support them. |

### 5.2 Optional source state

`fromState`, `toState`, and `payload` are intentionally not universal enums.

Examples:

- Punctuation can put `displayState: 'egg-found'` and `displayStars: 1`.
- Grammar can put its Star display stage and concept release id.
- Spelling can put `stage` and `mastered` without inventing Stars.
- Hero Mode can put `heroItemId`, `inventoryItemId`, or transaction ids once
  the economy phase exists.

---

## 6. Presentation intents

`presentations` is intentionally a map of arrays rather than two singleton
fields. Most events will carry zero or one toast and zero or one celebration,
but the array shape prevents a future breaking change when a producer needs two
presentation intents of the same type, for example a Hero purchase celebration
plus a first-time tutorial toast.

Unknown presentation kinds are reserved for future services such as audio,
haptic, desktop notification, or screen-reader-only announcements. Producers
may place those behind new registry keys later, but Toast and Celebration
consumers must ignore unknown keys today.

### 6.1 Toast intent

```js
presentations: {
  toast: [{
    id: "reward.presentation:...:toast:0",
    dedupeKey: "reward:<eventId>:toast:0",
    timing: "immediate",          // "immediate" | "deferred" | "producer-controlled"
    title: "Egg Found",
    body: "You found a new creature.",
    tone: "positive",             // "positive" | "quiet" | "warning" | "neutral"
    ariaLive: "polite",
    autoDismissMs: 10000
  }]
}
```

Toast is a peripheral service. It should not block typing, marking, or subject
flow. If `presentations.toast` is empty or missing, the toast service must do
nothing.

### 6.2 Celebration intent

```js
presentations: {
  celebration: [{
    id: "reward.presentation:...:celebration:0",
    dedupeKey: "reward:<eventId>:celebration:0",
    timing: "session-end",        // "immediate" | "session-end" | "producer-controlled"
    visualKind: "caught",         // renderer/effect registry key
    title: "Egg Found",
    body: "A new creature has joined your Codex.",
    priority: 50,
    assetRef: {
      family: "monster",
      monsterId: "pealark",
      branch: "a",
      stage: 0
    }
  }]
}
```

Celebration is an overlay service. If `presentations.celebration` is empty or
missing, no overlay should be queued.

`timing` belongs to the presentation intent, not to a subject-only helper. A
subject may still use its session state to choose `session-end`, but Hero Mode
or a future platform module can choose `immediate` or `producer-controlled`
without pretending to be a subject.

---

## 7. Registry design

The registry is producer-side. It resolves product vocabulary into explicit
presentation intents before the event reaches Toast or Celebration.

Recommended lookup key:

```txt
(producerType, producerId, rewardType, kind, toState?)
```

Examples:

| Producer | Kind | State | Toast | Celebration |
| --- | --- | --- | --- | --- |
| `subject:spelling` | `caught` | stage 1 | "New creature unlocked." | `visualKind: caught` |
| `subject:punctuation` | `caught` | `egg-found` | "Egg Found" | `visualKind: caught` |
| `subject:grammar` | `evolve` | `hatch` | "Hatched" | `visualKind: evolve` |
| `module:hero-mode` | `purchase` | item id | null | `visualKind: hero-purchase` |

Consumers should not contain hardcoded `kind -> copy` rules. They should render
the already-resolved `presentations` intents that they support.

---

## 8. Acknowledgement and replay

### 8.1 Separate acknowledgement per presentation

Toast and Celebration can exist independently, so acknowledgement must be per
presentation kind:

```txt
reward:<eventId>:toast
reward:<eventId>:celebration
```

When an event has multiple intents of the same kind, append an index or a stable
intent id:

```txt
reward:<eventId>:toast:0
reward:<eventId>:toast:first-time-help
```

This avoids the Hero-mode case where a celebration-only event would accidentally
look "unacknowledged" to the toast service, or vice versa.

### 8.2 Legacy compatibility

Current monster acknowledgement stores event ids under
`ks2-platform-v2.monster-celebration-acks`. A migration should:

1. keep reading old monster acknowledgement ids;
2. write new generic presentation acknowledgement keys for new events;
3. avoid backfilling existing local-storage entries unless necessary;
4. make adapter tests prove old `reward.monster` rows still render once and
   then acknowledge cleanly.

Current toast dismissal uses event ids and auto-dismiss timers. A migration
should preserve the visible behaviour while adding explicit toast ack/dedupe
keys.

### 8.3 Offline and reconnect replay

Offline or delayed-sync replay should render only unacknowledged presentation
intents for the selected learner. The event id remains the replay anchor, and
each presentation intent uses its own dedupe key. A producer that cannot prove
the underlying transaction or domain event was committed must not emit a
presentation event during reconnect.

For economy producers, reconnect replay has an extra rule: presentation replay
can re-show a committed purchase reveal, but it must never repeat inventory,
currency, or ledger mutation.

### 8.4 Idempotency rule for economy producers

For Hero Mode shop/economy, presentation must be downstream of a committed,
idempotent transaction. Replaying a presentation event must never purchase an
item, mutate inventory, spend currency, or claim a reward again.

---

## 9. Legacy adapter mapping

The first implementation PR should be behaviour-preserving. It should add
adapters before changing producers.

### 9.1 `reward.monster` adapter

Legacy input:

```js
{
  type: "reward.monster",
  kind: "caught",
  subjectId: "punctuation",
  learnerId,
  monsterId,
  monster,
  previous,
  next,
  toast
}
```

Adapter output:

```js
{
  type: "reward.presentation",
  producerType: "subject",
  producerId: subjectId || "spelling",
  rewardType: "reward.monster",
  kind,
  learnerId,
  fromState: previous,
  toState: next,
  payload: { monsterId, monster, previous, next },
  presentations: {
    toast: toast ? [normalisedToastIntent] : [],
    celebration: kind in ["caught", "evolve", "mega"] ? [normalisedCelebrationIntent] : []
  }
}
```

Legacy `levelup` should adapt to toast-only unless a product owner explicitly
adds a celebration visual. It must not be silently promoted into an overlay by
the generic adapter.

### 9.2 `reward.toast` adapter

Legacy input:

```js
{
  type: "reward.toast",
  kind: "guardian.renewed",
  subjectId: "spelling",
  learnerId,
  toast
}
```

Adapter output:

```js
{
  type: "reward.presentation",
  producerType: "subject",
  producerId: subjectId || "spelling",
  rewardType: "reward.toast",
  kind,
  learnerId,
  payload: { sourceEventId },
  presentations: {
    toast: [normalisedToastIntent],
    celebration: []
  }
}
```

---

## 10. Producer examples

### 10.1 Spelling monster caught

Spelling keeps its mastered-word evidence model. It emits a first-found
presentation when its existing `caught` transition happens. No Stars are added.

```js
{
  producerType: "subject",
  producerId: "spelling",
  rewardType: "reward.monster",
  kind: "caught",
  payload: { monsterId: "vellhorn", stage: 1, mastered: 1 },
  presentations: {
    toast: [{ title: "Vellhorn", body: "New creature unlocked." }],
    celebration: [{ visualKind: "caught", timing: "session-end" }]
  }
}
```

### 10.2 Punctuation first Star

Punctuation keeps its Star high-water projection. `displayState` is payload, not
a universal field.

```js
{
  producerType: "subject",
  producerId: "punctuation",
  rewardType: "reward.monster",
  kind: "caught",
  payload: { monsterId: "pealark", displayState: "egg-found", displayStars: 1 },
  presentations: {
    toast: [{ title: "Egg Found", body: "You found Pealark's egg." }],
    celebration: [{ visualKind: "caught", timing: "session-end" }]
  }
}
```

### 10.3 Grammar display-stage transition

Grammar keeps its Star thresholds but uses the same presentation vocabulary.

```js
{
  producerType: "subject",
  producerId: "grammar",
  rewardType: "reward.monster",
  kind: "evolve",
  payload: { monsterId: "bracehart", displayState: "hatch", displayStars: 15 },
  presentations: {
    toast: [{ title: "Hatched", body: "Bracehart hatched." }],
    celebration: [{ visualKind: "evolve", timing: "session-end" }]
  }
}
```

### 10.4 Hero Mode shop purchase

Hero Mode is a module, not a subject. It does not need Stars, `displayState`, or
subject session routing. A future shop purchase can choose celebration-only.

```js
{
  producerType: "module",
  producerId: "hero-mode",
  rewardType: "reward.hero",
  kind: "purchase",
  payload: {
    transactionId: "hero-txn-...",
    inventoryItemId: "cape-blue",
    price: 20,
    currency: "hero-coin"
  },
  presentations: {
    toast: [],
    celebration: [{
      visualKind: "hero-purchase",
      timing: "immediate",
      title: "New outfit unlocked",
      body: "Blue Cape is ready."
    }]
  }
}
```

The purchase transaction itself must be committed before this presentation event
exists. The presentation event must not be the transaction.

---

## 11. Migration plan

### PR 1 - Contract document and audit

This document. No runtime change.

### PR 2 - Shared schema helpers and legacy adapters

Add pure helpers:

- `normaliseRewardPresentationEvent(event)`;
- `presentationEventsFromLegacyRewardEvents(events)`;
- `resolveRewardToast(event)`;
- `resolveRewardCelebration(event)`;
- deterministic `presentationAckKey(event, "toast" | "celebration", intentIdOrIndex)`.

Tests:

- legacy `reward.monster` maps to toast and celebration arrays;
- legacy `reward.toast` maps to toast-only arrays;
- event with empty toast array and populated celebration array maps to
  celebration-only;
- old stored events without vNext fields still render.

### PR 3 - Generic celebration queue and acknowledgement

Introduce generic presentation queues while preserving the current monster queue
as a compatibility facade.

Tests:

- Spelling/Punctuation/Grammar monster celebrations still defer to session end;
- `reward:<eventId>:celebration:<id-or-index>` dedupes replay;
- local-storage legacy ack ids are honoured.

### PR 4 - Toast service migration

Move ToastShelf input to explicit toast intents while preserving existing
`store.pushToasts(legacyEvents)` call sites through adapters.

Tests:

- current Spelling Guardian/Boss/Pattern Quest toasts render unchanged;
- monster toast copy still appears when a toast intent exists;
- celebration-only events do not create toast rows.

### PR 4.5 - Synthetic Hero validation

Before Hero economy exists, add test-only fixtures that build a synthetic
`module:hero-mode` purchase presentation event with empty `presentations.toast`
and a populated `presentations.celebration` array. This validates module
producers, celebration-only behaviour, and per-presentation acknowledgement
without touching shop, currency, inventory, or ledger code.

Tests:

- synthetic Hero purchase renders celebration-only;
- no ToastShelf entry is created;
- acknowledgement uses `reward:<eventId>:celebration:<id-or-index>`;
- replay does not mutate any Hero state.

### PR 5 - Hero Mode integration when economy is approved

Once Hero shop/economy has a committed transaction model, emit presentation
events from the post-commit path.

Tests:

- presentation replay does not repeat purchase mutation;
- celebration-only Hero purchase renders without ToastShelf entry;
- no Hero presentation event appears before the economy transaction commits.

---

## 12. Review checklist for implementation PRs

1. No subject evidence engine changes unless a subject-specific PR explicitly
   requests them.
2. No Spelling Star migration.
3. No Hero shop/economy mutation in schema-only PRs.
4. Legacy `reward.monster` and `reward.toast` events still render.
5. Toast and Celebration can be independently absent.
6. Acknowledgement is per presentation kind.
7. Consumers do not infer copy from `kind` when explicit copy exists.
8. Hero Mode events use `producerType: 'module'` and `producerId: 'hero-mode'`,
   not `subjectId`.
9. No new bootstrap query is introduced just to render reward presentations.
10. Bundle budget changes are documented and justified.

---

## 13. Open product questions

1. Should Hero Mode economy vocabulary remain banned until the economy PR, or
   should the contract reserve safe adult-only wording now?
2. Should Toast have a durable acknowledgement store, or is auto-dismiss enough
   while Celebration gets durable ack?
3. Should `reward.presentation` be appended to `event_log`, or should it stay a
   reaction-event adapter over existing domain events for now?
4. Should session-end celebration timing remain producer-specified, or should a
   central queue policy override producer timing in child sessions?
5. Should adult-facing notifications eventually reuse this presentation envelope,
   or stay in a separate parent/admin notification contract?
6. How should dormant producer entries, such as future Hero economy presentation
   templates, be kept tested before their real producer exists?
7. If audio, haptic, desktop notification, or screen-reader-only presentations
   become product requirements, should they be new `presentations.*` keys or
   fields nested under toast/celebration intents?

These are implementation questions, not blockers for this contract.
