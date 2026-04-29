---
title: "Hero Mode P5 — Hero Camp and Hero Pool Monsters"
type: product-engineering-origin
status: draft
date: 2026-04-29
owner: james
intended_path: docs/plans/james/hero-mode/hero-mode-p5.md
phase: P5
origin: docs/plans/james/hero-mode/hero-mode-p4.md
previous_completion_report: docs/plans/james/hero-mode/hero-mode-p4-completion-report.md
---

# Hero Mode P5 — Hero Camp and Hero Pool Monsters

## 1. Guiding sentence

Hero Mode P5 gives children a calm, choice-led place to use Hero Coins: a Hero-owned Monster Pool that grows from the daily learning contract without becoming a shop, a gambling mechanic, a subject mastery system, or a second reward engine.

P5 should answer this question:

> “Can a child open Hero Camp, choose a Hero Pool monster, use safely earned Hero Coins to invite or grow that monster, and see a persistent Hero-owned monster state — with idempotent spending, no random rewards, no subject mastery mutation, and no pressure copy?”

P5 is successful when the platform can:

1. expose a child-safe Hero Camp surface behind its own feature flag;
2. show the child’s Hero Coins balance from the P4 economy state;
3. show an initial Hero Pool roster of six Hero-owned monsters;
4. let the child choose which monster to invite and which owned monster to grow;
5. debit Hero Coins through the same Hero mutation boundary used by P3/P4;
6. append deterministic spending ledger entries exactly once;
7. persist Hero monster ownership and stages in Hero-owned state;
8. keep Hero monsters separate from subject monsters and subject mastery;
9. preserve the one-primary-action Hero Quest dashboard pattern;
10. avoid shops, deals, loot boxes, random draws, countdowns, streak pressure, and “spend now” copy.

P5 is the first Hero spending phase. It is not a learning-scheduler phase and it is not a subject reward phase.

---

## 2. P4 status and what P5 inherits

P4 should be treated as the safe earning foundation.

P4 shipped:

- Hero read model v5 when economy is enabled;
- `HERO_MODE_ECONOMY_ENABLED=false` by default;
- a fixed daily completion award of 100 Hero Coins;
- economy state in the existing `child_game_state` row for `system_id = 'hero-mode'`;
- a deterministic ledger entry for the daily award;
- idempotent award behaviour through mutation receipt, already-completed handling, and deterministic ledger IDs;
- child-facing balance acknowledgement in `HeroQuestCard`;
- no Hero Camp;
- no monster ownership;
- no spending;
- no shop mechanics.

P4 intentionally leaves the following for P5:

- `economy.lifetimeSpent` remains zero;
- `economy.ledger` contains only earning-side entries;
- `HERO_ECONOMY_ENTRY_TYPES` does not yet include monster spending entries;
- no Hero-owned monster state exists;
- no Hero Camp UI exists;
- the dashboard copy may mention that Hero Coins are saved for Hero Camp, but there is no camp surface yet.

P5 must build on P4 rather than replace it. The P4 earning side remains the only way children earn Hero Coins in the core flow. P5 adds a spending and choice surface; it must not add new earning mechanics.

---

## 3. P5 preflight checks before monster spending

Before allowing a child to spend Hero Coins, the implementation plan must include a short preflight hardening unit. These checks are important because P5 introduces debit operations for the first time.

### 3.1 Do not infer learner identity from ledger contents

P4’s daily award helper can operate safely for the earning path because the daily block also stores the award marker and the ledger is small and bounded. For P5 spending, do not infer `learnerId` from existing ledger entries.

All P5 spend helpers must receive the authoritative `learnerId` explicitly from the Worker route / mutation context.

Recommended rule:

```txt
P5 spending helpers never derive learner identity from ledger[0] or from child input.
```

### 3.2 Strengthen economy state normalisation

P4’s economy normaliser is intentionally light. P5 should make economy state normalisation stricter because negative ledger entries become valid for controlled spending.

P5 should normalise and validate:

- `balance` as a finite non-negative number;
- `lifetimeEarned` as a finite non-negative number;
- `lifetimeSpent` as a finite non-negative number;
- ledger entries by known type;
- positive amounts for earning entries;
- negative amounts only for approved spending entries;
- `balanceAfter` as finite and non-negative;
- malformed ledger entries should be dropped from the child-safe projection and should not crash the read model.

Do not silently accept arbitrary ledger entry shapes once spending exists.

### 3.3 Add spending entry types explicitly

P4 entry types are earning-side only. P5 must explicitly extend the economy entry type contract before adding debit operations.

Recommended P5 entry types:

```ts
'daily-completion-award' // existing, positive amount
'monster-invite'         // negative amount
'monster-grow'           // negative amount
'admin-adjustment'       // reserved, not child flow
```

Avoid the word `purchase` in child copy. Internal code may use `spend`, `debit`, or `cost`, but the child-facing language should be “invite”, “grow”, and “use Hero Coins”.

### 3.4 Keep event_log non-authoritative

P4 correctly treats `hero.coins.awarded` as a mirror, not the authority. P5 must follow the same rule.

Hero Camp spending is authoritative only when the Hero state row is updated through the Hero mutation boundary. Event mirror rows are optional and should never be used to decide ownership, stage, balance, or spend success.

### 3.5 Preserve P4’s learning-first reward boundary

P5 must not change:

- Hero scheduler;
- task selection;
- subject command routing;
- subject scoring;
- subject Stars;
- subject monster mastery;
- daily Coins award rules.

Hero Camp is a choice surface after earning. It is not a new way to earn.

---

## 4. Strategic decision: P5 is Hero Camp, not a shop

P5 should not be designed as a shop.

The child is not “buying” monsters. The child is choosing how to grow a Hero Camp using Hero Coins earned through the daily learning contract. This distinction matters because the product must not create gambling-like or commercial pressure around learning.

Use this product language:

```txt
Hero Camp
Hero Pool
Invite a monster
Grow a monster
Use 150 Hero Coins
Saved for Hero Camp
Choose a path
```

Avoid this product language:

```txt
Shop
Buy
Deal
Limited time
Loot
Draw
Pack
Jackpot
Offer
Spend now
Unlock now
Don't miss out
```

Internal command names may use `unlock-monster` and `evolve-monster` if that is clearer for engineering, but the child UI should prefer `invite` and `grow`.

---

## 5. Product semantics

### 5.1 What Hero Pool monsters mean

Hero Pool monsters are cross-subject Hero creatures. They belong to Hero Mode, not to Spelling, Grammar, Punctuation, Arithmetic, Reasoning, or Reading.

They represent a child’s long-term Hero journey across ready subjects. They do not represent mastery of any one subject.

A child should be able to understand the relationship like this:

> “I complete Hero Quests to add Hero Coins. I choose which Hero Camp monster to invite or grow.”

The subject engines remain responsible for learning evidence. Hero Camp is a motivational choice layer.

### 5.2 What inviting a monster means

Inviting a monster means the child uses Hero Coins to add that monster to their Hero Camp. It creates Hero-owned monster state.

Recommended initial behaviour:

- invited monster appears at stage 0, egg/found state;
- child chooses one branch/path when inviting, if branch assets are ready;
- branch choice is cosmetic and has no learning effect;
- branch choice is immutable in P5, to avoid refund/change complexity;
- grow actions happen later through separate commands.

### 5.3 What growing a monster means

Growing a monster means moving an owned Hero Pool monster from one stage to the next by using Hero Coins.

Recommended stages:

```txt
stage 0 = invited / egg
stage 1 = hatched
stage 2 = growing
stage 3 = strong
stage 4 = grand / complete
```

Do not call stage 4 “Mega” in Hero Camp unless the product wants Hero monsters to share the same emotional language as subject monsters. The safer P5 copy is “fully grown” or “grand”. Subject Mega should stay subject-owned.

### 5.4 What Hero Camp does not mean

Hero Camp does not mean:

- subject mastery;
- subject Stars;
- Mega status;
- a learning shortcut;
- a paid currency system;
- a random reward draw;
- a limited-time shop;
- a leaderboard;
- pressure to play every day;
- a new subject.

---

## 6. P5 scope

P5 has six product/engineering outcomes.

### 6.1 Hero Pool registry

Create a Hero-owned monster registry with an initial roster of six monsters:

```txt
glossbloom
loomrill
mirrane
colisk
hyphang
carillon
```

These IDs reuse existing monster assets and names, but Hero ownership is independent from subject ownership.

The registry should record:

- monster id;
- display name;
- short Hero Camp description;
- source asset monster id;
- origin reserve group for documentation only;
- branch options;
- invite cost;
- stage grow costs;
- maximum stage;
- child-safe display order.

### 6.2 Hero-owned monster state

Add a Hero Pool state block to the existing Hero state row.

Preferred storage remains:

```txt
child_game_state
learner_id = <learnerId>
system_id = 'hero-mode'
state_json = HeroModeStateV3
```

Do not add a new D1 table for Hero monsters in P5 unless the implementation plan proves the state row cannot safely support the small initial roster.

### 6.3 Spending commands

Add Hero commands for Hero Camp actions:

```txt
POST /api/hero/command
command: 'unlock-monster' // internal name; child copy says invite
command: 'evolve-monster' // internal name; child copy says grow
```

The server derives the cost, balance, next stage, ledger entry, and state update. The client must not send amount, cost, balance, ledger entry id, or ownership state.

### 6.4 Economy debit and deterministic ledger

Spending must update the P4 economy state safely:

- balance decreases by the server-derived cost;
- balance never goes below zero;
- lifetimeSpent increases by the cost;
- lifetimeEarned is unchanged;
- ledger entry amount is negative for spending;
- ledger entry id is deterministic from the spend identity;
- replay and duplicate actions cannot double-charge.

### 6.5 Hero Camp read model v6

Evolve the Hero read model to version 6 when Camp is enabled.

The read model should expose child-safe Hero Camp data:

- whether Camp is enabled;
- balance;
- roster version;
- monsters with ownership/stage/branch/cost/affordability;
- next affordable action;
- recent Camp action acknowledgement;
- no raw debug evidence;
- no subject mastery data inside the monster ownership block.

### 6.6 Hero Camp UI

Add a child-facing Hero Camp surface.

Recommended P5 UI shape:

- a secondary “Open Hero Camp” link or card from the dashboard;
- a Hero Camp panel/page with Coin balance;
- six monster cards;
- owned/unowned state;
- invite/grow button with clear cost;
- confirmation before debit;
- success acknowledgement;
- insufficient balance message;
- no random draw;
- no shop/deal/streak/limited-time copy.

The dashboard’s primary action should remain “Start Hero Quest” when a Hero Quest is available. Hero Camp is a secondary route, not the daily learning route.

---

## 7. P5 non-goals

P5 does not include:

1. new earning mechanics;
2. per-task Coins;
3. per-question Coins;
4. speed bonuses;
5. no-hint bonuses;
6. streak rewards;
7. random monster draws;
8. loot boxes;
9. shop/deal/limited-time mechanics;
10. paid currency;
11. parent-controlled allowance controls;
12. refunds or undo after confirmed spending;
13. branch switching after invite;
14. trading or gifting;
15. leaderboards;
16. six-subject Hero expansion;
17. changes to Hero scheduler;
18. changes to subject mastery;
19. changes to subject monster rosters;
20. changes to Grammar/Punctuation/Spelling Stars;
21. writing subject reward projections from Hero commands.

P6 can handle broader hardening, telemetry, rollout, and optional undo/refund if the product wants it after the spending path is proven safe.

---

## 8. Current repo context P5 must respect

### 8.1 Hero state and economy

The current Hero state uses the existing `child_game_state` row for `system_id='hero-mode'`. P4 has moved the Hero state to version 2 and added an `economy` block with balance, lifetime earned, lifetime spent, ledger, and `lastUpdatedAt`.

P5 should migrate this to a new version, for example:

```ts
type HeroModeStateV3 = HeroModeStateV2 & {
  heroPool: HeroPoolState;
}
```

The normaliser must accept P3/P4 states and migrate safely:

```txt
v1 progress state → v3 with empty economy + empty Hero Pool
v2 economy state  → v3 with existing economy + empty Hero Pool
v3 state          → v3 normalised
unknown state     → safe empty v3
```

Do not wipe balance, ledger, daily progress, or recent claims during migration.

### 8.2 Monster asset registry

The existing platform monster registry contains active subject monsters and reserve monsters. The six proposed Hero Pool monsters already exist as monster IDs in the platform registry, but some are reserve creatures in Grammar or Punctuation.

P5 must keep these concepts separate:

```txt
subject monster = subject-owned mastery creature
Hero Pool monster = Hero-owned camp creature using the same asset id
```

Do not move reserve monsters into active subject rosters. Do not read subject monster state to decide Hero ownership. Do not write subject monster summaries from Hero Camp commands.

### 8.3 Shared layer purity

P5 should add pure shared modules for registry and spending logic, for example:

```txt
shared/hero/hero-pool.js
shared/hero/monster-economy.js
```

These files must remain pure. They must not import Worker code, repository code, React, D1, subject runtime, or `src/platform/game/monsters.js`.

If client rendering needs monster images, add a client-only adapter that maps Hero monster IDs to the existing asset helper.

Recommended separation:

```txt
shared/hero/hero-pool.js              // authoritative IDs, costs, state helpers
worker/src/hero/camp.js               // command resolver and mutation intent
src/platform/hero/hero-camp-model.js  // child UI model
src/platform/hero/hero-monster-assets.js // client-only asset mapping
```

### 8.4 Command route

`POST /api/hero/command` currently supports `start-task` and `claim-task`.

P5 extends it with Camp actions. The route should remain a single Hero command boundary, not a new public API family.

Do not create `/api/hero/shop` or `/api/hero/purchase` endpoints.

---

## 9. Feature flags

P5 must introduce a new flag:

```txt
HERO_MODE_CAMP_ENABLED=false
```

The full Hero Camp path requires:

```txt
HERO_MODE_SHADOW_ENABLED=true
HERO_MODE_LAUNCH_ENABLED=true
HERO_MODE_CHILD_UI_ENABLED=true
HERO_MODE_PROGRESS_ENABLED=true
HERO_MODE_ECONOMY_ENABLED=true
HERO_MODE_CAMP_ENABLED=true
```

Flag behaviour:

| Flag state | Expected behaviour |
|---|---|
| Camp off | P4 economy works; no Camp UI; no Camp commands |
| Camp on, economy off | misconfigured; Camp must remain unavailable |
| Camp on, child UI off | no child Camp UI; commands disabled |
| Camp on, progress off | misconfigured; no Camp commands |
| all flags on | Hero Camp read model and spending commands available |

Default in `wrangler.jsonc` and `worker/wrangler.example.jsonc` must be:

```json
"HERO_MODE_CAMP_ENABLED": "false"
```

Do not enable Camp by default in production.

---

## 10. Initial Hero Pool roster

Recommended initial roster:

```ts
export const HERO_POOL_INITIAL_MONSTER_IDS = Object.freeze([
  'glossbloom',
  'loomrill',
  'mirrane',
  'colisk',
  'hyphang',
  'carillon',
]);
```

Recommended registry shape:

```ts
type HeroPoolMonsterDefinition = {
  monsterId: string;
  displayName: string;
  sourceAssetMonsterId: string;
  origin: 'grammar-reserve' | 'punctuation-reserve';
  displayOrder: number;
  maxStage: 4;
  inviteCost: number;
  growCosts: Record<1 | 2 | 3 | 4, number>;
  branchOptions: Array<{
    branch: 'b1' | 'b2';
    childLabel: string;
  }>;
  childBlurb: string;
};
```

Recommended definitions:

```txt
Glossbloom — a word-garden creature that loves clear phrases.
Loomrill   — a thread creature that keeps ideas joined together.
Mirrane    — a mirror creature that reflects roles and voices.
Colisk     — a structure creature that builds strong lists and shapes.
Hyphang    — a boundary creature that links ideas carefully.
Carillon   — a bell creature that gathers the Hero Camp together.
```

These blurbs are Hero Camp personality copy. They should not claim subject mastery.

---

## 11. Costs and progression

P5 should use a simple, predictable cost curve.

Recommended P5 costs:

```ts
export const HERO_MONSTER_INVITE_COST = 150;

export const HERO_MONSTER_GROW_COSTS = Object.freeze({
  1: 300,   // stage 0 → 1
  2: 600,   // stage 1 → 2
  3: 1000,  // stage 2 → 3
  4: 1600,  // stage 3 → 4
});
```

Total to fully grow one monster:

```txt
150 + 300 + 600 + 1000 + 1600 = 3650 Hero Coins
```

At 100 Hero Coins per completed daily quest, this gives a multi-week goal without creating a short-term grind loop. Six monsters create a long runway without needing random rewards.

P5 should not include cheaper repeat actions or micro-spends. The child should make meaningful choices, not click through tiny purchases.

---

## 12. Hero Pool state shape

Recommended state block:

```ts
type HeroPoolState = {
  version: 1;
  rosterVersion: string;
  selectedMonsterId: string | null;
  monsters: Record<string, HeroPoolMonsterState>;
  recentActions: HeroCampActionRecord[];
  lastUpdatedAt: number | null;
};

type HeroPoolMonsterState = {
  monsterId: string;
  owned: boolean;
  stage: 0 | 1 | 2 | 3 | 4;
  branch: 'b1' | 'b2' | null;
  investedCoins: number;
  invitedAt: number | null;
  lastGrownAt: number | null;
  lastLedgerEntryId: string | null;
};

type HeroCampActionRecord = {
  actionId: string;
  requestId: string;
  type: 'monster-invite' | 'monster-grow';
  monsterId: string;
  stageBefore: number | null;
  stageAfter: number;
  branch: 'b1' | 'b2' | null;
  cost: number;
  ledgerEntryId: string;
  createdAt: number;
};
```

### 12.1 State constraints

Hero Pool state must not include:

- subject skill IDs;
- subject concept IDs;
- subject Stars;
- subject mastery denominators;
- Grammar/Punctuation monster reward state;
- shop offers;
- random draw state;
- limited-time modifiers;
- streak multipliers.

### 12.2 Normalisation rules

The normaliser should:

- create empty Hero Pool state when absent;
- drop unknown monster IDs from child-facing state;
- clamp stages to 0–4;
- normalise invalid branch to `null` or default branch only before ownership;
- preserve valid owned monster state;
- preserve balance and economy state independently;
- never create ownership just because a subject reserve monster exists.

---

## 13. Spending ledger entries

P5 should extend the economy ledger with deterministic spending entries.

### 13.1 Invite ledger entry

Recommended idempotency key:

```txt
hero-monster-invite:v1:<learnerId>:<monsterId>:<branch>
```

Recommended ledger entry:

```ts
type HeroMonsterInviteLedgerEntry = {
  entryId: string;
  idempotencyKey: string;
  type: 'monster-invite';
  amount: -150;
  balanceAfter: number;
  learnerId: string;
  monsterId: string;
  branch: 'b1' | 'b2';
  stageAfter: 0;
  source: {
    kind: 'hero-camp-monster-invite';
    rosterVersion: string;
  };
  createdAt: number;
  createdBy: 'system';
};
```

### 13.2 Grow ledger entry

Recommended idempotency key:

```txt
hero-monster-grow:v1:<learnerId>:<monsterId>:<targetStage>
```

Recommended ledger entry:

```ts
type HeroMonsterGrowLedgerEntry = {
  entryId: string;
  idempotencyKey: string;
  type: 'monster-grow';
  amount: -cost;
  balanceAfter: number;
  learnerId: string;
  monsterId: string;
  stageBefore: number;
  stageAfter: number;
  source: {
    kind: 'hero-camp-monster-grow';
    rosterVersion: string;
  };
  createdAt: number;
  createdBy: 'system';
};
```

### 13.3 Ledger rules

Spending ledger rules:

- negative amount is allowed only for `monster-invite` and `monster-grow`;
- balanceAfter must be non-negative;
- lifetimeSpent increases by `Math.abs(amount)`;
- lifetimeEarned does not change;
- duplicate spend identity cannot create a second debit;
- same requestId replays the same response;
- different requestId for an already-owned invite returns `already-owned` with zero additional cost;
- different requestId for an already-reached stage returns `already-stage` with zero additional cost.

---

## 14. Hero Camp command contracts

### 14.1 `unlock-monster` command

Internal command name:

```txt
unlock-monster
```

Child copy should say “Invite”.

Recommended request:

```ts
type HeroUnlockMonsterRequest = {
  command: 'unlock-monster';
  learnerId: string;
  monsterId: string;
  branch: 'b1' | 'b2';
  requestId: string;
  correlationId?: string;
  expectedLearnerRevision: number;
};
```

The client must not send:

```txt
cost
amount
balance
ledgerEntryId
stage
owned
payload
subjectId
shop
reward
```

Recommended success response:

```ts
type HeroUnlockMonsterResponse = {
  ok: true;
  heroCampAction: {
    version: 1;
    status: 'invited' | 'already-owned';
    learnerId: string;
    monsterId: string;
    branch: 'b1' | 'b2';
    stageAfter: 0;
    cost: number;
    coinsUsed: number;
    coinBalance: number;
    ledgerEntryId: string | null;
  };
  mutation: MutationMeta;
};
```

### 14.2 `evolve-monster` command

Internal command name:

```txt
evolve-monster
```

Child copy should say “Grow”.

Recommended request:

```ts
type HeroEvolveMonsterRequest = {
  command: 'evolve-monster';
  learnerId: string;
  monsterId: string;
  targetStage: 1 | 2 | 3 | 4;
  requestId: string;
  correlationId?: string;
  expectedLearnerRevision: number;
};
```

Recommended success response:

```ts
type HeroEvolveMonsterResponse = {
  ok: true;
  heroCampAction: {
    version: 1;
    status: 'grown' | 'already-stage';
    learnerId: string;
    monsterId: string;
    stageBefore: number;
    stageAfter: number;
    cost: number;
    coinsUsed: number;
    coinBalance: number;
    ledgerEntryId: string | null;
  };
  mutation: MutationMeta;
};
```

### 14.3 Error codes

Recommended typed errors:

```txt
hero_camp_disabled
hero_camp_misconfigured
hero_monster_unknown
hero_monster_branch_required
hero_monster_branch_invalid
hero_monster_already_owned
hero_monster_not_owned
hero_monster_stage_invalid
hero_monster_stage_not_next
hero_monster_max_stage
hero_insufficient_coins
hero_client_field_rejected
hero_economy_state_invalid
stale_write
idempotency_reuse
```

Use 200 for safe duplicate already-owned/already-stage responses when no state change and no debit occurs. Use 409 for insufficient balance, stale write, and unsafe conflicts.

---

## 15. Worker route and repository requirements

### 15.1 Route gates

Hero Camp commands require:

- authenticated session;
- same-origin;
- mutation capability;
- learner write access;
- expected learner revision;
- `HERO_MODE_CAMP_ENABLED=true`;
- `HERO_MODE_ECONOMY_ENABLED=true`;
- child UI enabled.

The route should fail closed when misconfigured.

### 15.2 Mutation safety

Camp actions must use the same Hero mutation boundary as `claim-task`.

Required mutation properties:

- request receipt for same-request replay;
- stale revision rejection;
- compare-and-swap state update;
- deterministic ledger id;
- no raw D1 writes outside the repository mutation boundary for authoritative state;
- event mirror optional and non-authoritative;
- no subject runtime dispatch;
- no subject state writes.

### 15.3 Command resolver separation

Recommended Worker module:

```txt
worker/src/hero/camp.js
```

Responsibilities:

- validate command body;
- reject forbidden client fields;
- read registry definitions;
- derive expected cost/action;
- return a mutation intent or typed error;
- remain free of subject runtime imports.

The route handler may call the resolver, but the resolver should not write to D1 directly.

### 15.4 Demo policy

Demo write policy must match the existing Hero command boundary. Do not allow Hero Camp spending to bypass demo restrictions or rate limits.

If demo accounts are allowed to use Hero Camp in future, that should be an explicit demo-owned route/policy decision, not an accidental bypass.

---

## 16. Read model v6

When Camp is enabled, evolve the Hero read model to version 6.

Recommended shape:

```ts
type HeroReadModelV6 = HeroReadModelV5 & {
  version: 6;
  camp: {
    enabled: boolean;
    version: 1;
    commandRoute: '/api/hero/command';
    commands: {
      unlockMonster: 'unlock-monster';
      evolveMonster: 'evolve-monster';
    };
    rosterVersion: string;
    balance: number;
    selectedMonsterId: string | null;
    monsters: HeroCampMonsterReadModel[];
    recentActions: HeroCampActionReadModel[];
  };
};
```

Recommended monster read-model shape:

```ts
type HeroCampMonsterReadModel = {
  monsterId: string;
  displayName: string;
  childBlurb: string;
  sourceAssetMonsterId: string;
  owned: boolean;
  stage: 0 | 1 | 2 | 3 | 4;
  branch: 'b1' | 'b2' | null;
  maxStage: 4;
  inviteCost: number;
  nextGrowCost: number | null;
  nextStage: number | null;
  canInvite: boolean;
  canGrow: boolean;
  canAffordInvite: boolean;
  canAffordGrow: boolean;
  fullyGrown: boolean;
};
```

### 16.1 Read model rules

- When Camp is disabled, keep P4 v5 shape or include `camp: { enabled:false }` only if the client needs it. Choose one convention and test it.
- When Camp is enabled but economy is disabled, return a typed disabled/misconfigured state; do not show Camp UI.
- Child-safe read model must not expose raw ledger source objects, request IDs, account IDs, or internal debug state.
- The read model may expose `recentActions` in child-safe form only.

### 16.2 Affordability is display-only

The read model may compute `canAffordInvite` and `canAffordGrow` for UI. The command handler must still re-check balance and state on every mutation. Never trust client-side affordability.

---

## 17. Client and UI requirements

### 17.1 Hero client

Add methods to `src/platform/hero/hero-client.js`:

```ts
unlockMonster({ learnerId, monsterId, branch, requestId })
evolveMonster({ learnerId, monsterId, targetStage, requestId })
```

The client must:

- include expected learner revision;
- never send cost, amount, balance, ledger entry id, stage ownership, or subject payload;
- use typed Hero errors;
- refresh the read model after successful Camp action;
- handle stale writes by applying revision hints and refetching, not by local balance edits.

### 17.2 Hero Camp model

Add a client model helper:

```txt
src/platform/hero/hero-camp-model.js
```

It should derive:

- `campEnabled`;
- balance;
- monster cards;
- selected monster;
- next action;
- confirmation copy;
- affordability states;
- last action acknowledgement;
- safe empty states.

Authoritative state still lives on the Worker read model.

### 17.3 Hero Camp UI surface

Recommended UI file names:

```txt
src/surfaces/home/HeroCampPanel.jsx
src/surfaces/home/HeroCampMonsterCard.jsx
```

The implementation may choose a route or a dashboard panel. The important product rule is:

```txt
Hero Quest remains the primary dashboard action. Hero Camp is a secondary choice surface.
```

Recommended states:

1. Camp disabled → no Camp link;
2. loading → non-blocking placeholder;
3. empty/new → show six monsters and balance;
4. insufficient balance → show calm “Save more Hero Coins by completing Hero Quests.”;
5. invite confirmation → clear cost and result;
6. invite success → monster appears in Camp;
7. grow confirmation → clear cost and next stage;
8. grow success → stage updated;
9. fully grown → no grow CTA;
10. stale/error → gentle refresh.

### 17.4 Asset rendering

Use the existing monster asset helper in client-only code. Do not import client asset helpers into shared or Worker code.

Recommended adapter:

```txt
src/platform/hero/hero-monster-assets.js
```

It may map:

```ts
heroMonsterId → monsterAssetSrcSet(sourceAssetMonsterId, stage, branch)
```

If assets are missing for a branch/stage, the UI should degrade gracefully.

### 17.5 Confirmation UX

Every debit action must have a confirmation step.

Good confirmation copy:

```txt
Use 150 Hero Coins to invite Glossbloom to Hero Camp?
Your balance will be 250 Hero Coins.
```

For grow:

```txt
Use 600 Hero Coins to grow Glossbloom to stage 2?
Your balance will be 140 Hero Coins.
```

Avoid:

```txt
Buy now
Spend now
Limited offer
Don't miss out
```

P5 does not need undo/refund if confirmation is clear and idempotency is strong. Refund can be a P6 hardening topic.

---

## 18. Child copy guidance

Good child copy:

```txt
Hero Camp
Choose a Hero monster to invite.
Use 150 Hero Coins to invite Glossbloom.
Glossbloom joined your Hero Camp.
Use 600 Hero Coins to grow Glossbloom.
Glossbloom grew stronger.
You need 40 more Hero Coins.
Complete Hero Quests to add more Hero Coins.
Fully grown.
```

Avoid child copy:

```txt
Shop
Buy
Deal
Limited time
Loot
Lucky draw
Jackpot
Offer ends soon
Spend now
Don't miss out
Claim reward
```

The word “unlock” may appear in code and test names, but the child UI should prefer “invite”. The word “evolve” may appear in code and test names, but the child UI should prefer “grow”.

---

## 19. Testing requirements

P5 requires tests in seven groups.

### 19.1 Shared Hero Pool tests

Test:

- initial roster contains exactly six IDs;
- all six IDs are unique;
- all six IDs have definitions;
- costs are positive integers;
- grow costs increase by stage;
- max stage is 4;
- branch options are valid;
- registry is frozen;
- shared files are pure.

### 19.2 State migration tests

Test:

- v1 progress state migrates to v3 safely;
- v2 economy state migrates to v3 safely;
- valid Hero Pool state preserves ownership;
- invalid monster IDs are dropped or hidden;
- invalid stages clamp safely;
- balance and ledger are preserved;
- malformed state returns safe empty state.

### 19.3 Spending helper tests

Test:

- invite action debits correct cost;
- grow action debits correct cost;
- insufficient balance rejects;
- balance never goes negative;
- lifetimeSpent increments;
- lifetimeEarned unchanged;
- deterministic ledger entry IDs;
- same spend identity cannot double-debit;
- already-owned invite is safe;
- already-stage grow is safe;
- negative ledger amounts are allowed only for approved spending types.

### 19.4 Worker command tests

Test:

- `unlock-monster` happy path;
- `evolve-monster` happy path;
- Camp flag off returns disabled;
- economy off + Camp on returns misconfigured;
- unknown monster rejected;
- invalid branch rejected;
- client-supplied cost/amount/balance/ledger/payload rejected;
- stale write rejected;
- same request replayed;
- different request for already-owned returns no debit;
- different request for already-stage returns no debit;
- no `child_subject_state` write;
- no `practice_sessions` write;
- no subject runtime dispatch.

### 19.5 Read model tests

Test:

- v6 when Camp enabled;
- v5 or disabled Camp block when Camp disabled;
- balance shown from economy state;
- owned monster state merged with registry;
- affordability computed correctly;
- fully grown monster has no grow action;
- child-safe recent actions;
- debug fields stripped;
- malformed Hero Pool state does not crash.

### 19.6 UI tests

Test:

- Camp link appears only when enabled;
- Hero Quest remains the primary dashboard action;
- six monster cards render;
- invite confirmation shows correct cost and balance-after;
- grow confirmation shows correct cost and target stage;
- insufficient balance copy is calm;
- success acknowledgement works;
- no shop/deal/loot/limited-time copy;
- HeroTaskBanner remains economy-free and Camp-free;
- keyboard and screen reader accessibility.

### 19.7 Boundary tests

Test:

- `worker/src/hero/` still does not import subject runtime;
- `shared/hero/` stays pure;
- Worker/shared code does not import `src/platform/game/monsters.js`;
- subject monster state is not read or written by Hero Camp;
- no new D1 Hero tables;
- event mirror is not used as authority;
- pressure vocabulary forbidden everywhere;
- economy vocabulary scoped to Hero Camp and economy surfaces.

---

## 20. Metrics and observability

P5 should add monitoring from day one.

Recommended structured logs:

```txt
hero_camp_opened
hero_monster_invite_started
hero_monster_invited
hero_monster_grow_started
hero_monster_grown
hero_monster_spend_blocked
hero_monster_duplicate_prevented
hero_monster_insufficient_coins
hero_camp_disabled_attempt
hero_camp_invariant_failed
```

Recommended product metrics:

- Hero Camp open rate after daily completion;
- first monster invite rate;
- distribution of first chosen monster;
- grow action rate;
- insufficient balance rate;
- balance hoarding rate;
- number of children who complete another Hero Quest after viewing Camp;
- whether Camp increases return rate without increasing spam/skips;
- daily quest completion rate before/after Camp enable;
- subject mix stability after Camp enable.

Important guardrail:

```txt
Camp should convert safe Coins into child choice without increasing rushing, task abandonment, or easy-subject preference.
```

---

## 21. Boundary invariants

### 21.1 Allowed in P5

P5 allows:

- Hero Camp UI;
- Hero Pool registry;
- Hero-owned monster state;
- Hero Coin spending;
- negative ledger entries for approved monster actions;
- `lifetimeSpent` increases;
- child-facing “Hero Coins” copy in Camp/economy surfaces;
- invite/grow confirmation;
- optional event mirror for Camp actions.

### 21.2 Still forbidden in P5

P5 still forbids:

- per-question Coins;
- random rewards;
- loot boxes;
- shop/deal/limited-time language;
- subject Stars from Hero;
- subject mastery mutation;
- subject monster mutation;
- branch effects on learning;
- leaderboard pressure;
- streak rewards;
- paid currency;
- client-supplied cost or balance;
- direct D1 writes outside the Hero mutation boundary for authoritative Camp state.

---

## 22. Rollout guidance

Default deployment:

```txt
HERO_MODE_CAMP_ENABLED=false
```

Recommended enablement path:

1. dev only with seeded balances;
2. staging with one learner and all six monsters;
3. staging with real P4-earned balances;
4. limited internal production account;
5. child-visible production rollout after monitoring confirms no regressions.

Rollback:

```txt
Set HERO_MODE_CAMP_ENABLED=false
```

Rollback should:

- hide Camp UI;
- reject Camp commands;
- preserve Hero Pool state;
- preserve economy state;
- keep P4 daily earning working if economy remains enabled.

Do not delete state on rollback.

---

## 23. P6 handoff

P5 prepares P6 by creating a real choice surface. P6 should focus on hardening, metrics, rollout, retention tuning, and optional refinements.

Likely P6 topics:

- production analytics dashboard;
- post-Mega retention tuning;
- scheduler learning-health monitoring;
- economy abuse monitoring;
- undo/refund policy if needed;
- long-term ledger archival if state grows;
- additional Camp copy polish;
- A/B testing Camp placement;
- six-subject expansion once more subjects are production-ready;
- parent-facing explanation of Hero Mode.

P6 should not be used to patch fundamental spending-safety flaws. P5 must ship spending safety correctly.

---

## 24. Suggested implementation unit outline

This is an origin document, not the final root-level implementation plan. The implementation-planning agent should inspect the latest repo and write the exact unit plan, files, tests, and sequencing.

A sensible P5 unit outline is:

```txt
P5-U0  Preflight economy hardening for debit operations
P5-U1  Shared Hero Pool registry and cost contract
P5-U2  Hero state v2→v3 migration with heroPool block
P5-U3  Pure spending helpers and deterministic ledger entries
P5-U4  Worker Camp command resolver
P5-U5  POST /api/hero/command wiring for unlock/evolve
P5-U6  Read model v6 with child-safe Camp block
P5-U7  Client Hero Camp API methods and UI model
P5-U8  Hero Camp UI surface and monster cards
P5-U9  Boundary, vocabulary, abuse, and E2E tests
P5-U10 Telemetry, rollout flags, and completion report
```

The implementation plan should remain free to adjust this outline if the current repo shape suggests a cleaner dependency order.

---

## 25. Acceptance criteria

P5 is complete only when all of these are true.

### Product acceptance

- Child can open Hero Camp when flags are enabled.
- Child can see six Hero Pool monsters.
- Child can invite one monster using Hero Coins.
- Child can grow an owned monster using Hero Coins.
- Child sees calm confirmation and success copy.
- Hero Quest remains the primary dashboard action.
- No shop, deal, loot, limited-time, or streak-pressure copy.
- No random monster draw.

### Economy acceptance

- Balance decreases exactly once for each successful invite/grow.
- Balance never goes below zero.
- lifetimeSpent increases correctly.
- lifetimeEarned is unchanged by spending.
- Ledger entries are deterministic and idempotent.
- Already-owned/already-stage actions do not double-charge.
- Client cannot supply cost, amount, balance, or ledger IDs.

### Architecture acceptance

- Hero Pool state is stored under Hero-owned platform/game state.
- No new D1 Hero tables unless explicitly justified by the implementation plan.
- Hero Camp commands use the Hero mutation boundary.
- No Hero Camp code writes subject state.
- No Hero Camp code mutates subject Stars, mastery, or subject monster summaries.
- Shared Hero modules stay pure.
- Worker Hero modules still do not import subject runtime.

### Testing acceptance

- Pure registry/state/spending tests pass.
- Worker command E2E tests pass.
- Read model v6 tests pass.
- UI and accessibility tests pass.
- Vocabulary boundary tests pass.
- Abuse/idempotency tests pass.
- Existing P0–P4 Hero tests pass.
- Existing Worker tests pass.

---

## 26. Final P5 sentence

Hero Mode P5 turns safely earned Hero Coins into child choice: a calm Hero Camp where children invite and grow Hero-owned monsters through deterministic, idempotent spending — without touching subject mastery, introducing shops, or turning learning into a reward chase.
