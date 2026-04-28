---
title: "Hero Mode P4 — Hero Coins Ledger and Capped Daily Economy"
type: product-engineering-origin
status: draft
date: 2026-04-28
owner: james
intended_path: docs/plans/james/hero-mode/hero-mode-p4.md
phase: P4
origin: docs/plans/james/hero-mode/hero-mode-p3.md
previous_completion_report: docs/plans/james/hero-mode/hero-mode-p3-completion-report.md
---

# Hero Mode P4 — Hero Coins Ledger and Capped Daily Economy

## 1. Guiding sentence

Hero Mode P4 adds the first reward economy, but only after P3 has made daily Hero progress authoritative.

P4 should answer this question:

> “When a learner completes today’s Hero Quest, can the platform award a small, capped Hero Coins reward exactly once, store an auditable ledger entry, show the child a calm balance update, and still avoid per-question rewards, rushing, gambling-like mechanics, subject mastery mutation, or Hero monster spending?”

P4 is successful when the app can:

1. detect that today’s Hero Quest has become complete through the P3 completion-claim flow;
2. award the daily Hero Coins amount exactly once;
3. persist a replay-safe economy ledger under Hero-owned platform/game state;
4. expose a child-safe read model with balance and today’s award status;
5. show a calm dashboard update after completion;
6. keep all reward language capped, non-pressurising, and free of shop/deal/loot/streak mechanics;
7. preserve subject ownership of Stars, marking, feedback, mastery, and subject monsters;
8. leave Hero Camp, monster ownership, unlock/evolve, spending, refund, and branch choices for P5.

P4 is the first Hero economy phase. It is not the Hero Camp phase.

---

## 2. P3 status and what P4 inherits

P3 should be treated as the authoritative progress foundation.

P3 shipped:

- Hero read model v4;
- persistent Hero progress state in `child_game_state` under `system_id = 'hero-mode'`;
- `claim-task` command;
- task status: planned, started, completed, blocked;
- effort completed;
- daily completion status;
- `recentClaims` audit trail;
- `hero.task.completed` and `hero.daily.completed` progress/audit events;
- auto-claim after Hero-launched subject completion;
- dashboard-load repair for completed but unclaimed Hero sessions;
- no Coins, no economy state, no Hero monsters, and no spending.

P4 must build on that shape. Do not rebuild the progress system. Do not create a second claim route. Do not add a separate reward table before proving that the existing platform state can hold a safe, small economy ledger.

The preferred P4 direction is:

```txt
P3 claim-task marks final task complete
  ↓
inside the same Hero mutation, if daily.status becomes completed
  ↓
P4 awards daily Hero Coins exactly once
  ↓
read model v5 exposes balance and award status
  ↓
child sees calm “Hero Coins added” copy on the dashboard
```

The award should be a reaction to authoritative daily completion. It must not become a goal function for the scheduler.

---

## 3. P4 preflight hardening required before economy launch

Before enabling any Coins, the implementation plan must include a short preflight hardening unit. These are not optional tidy-ups; they are economy-safety blockers.

### 3.1 Tighten completion evidence trust anchor

P3 correctly stores `heroContext` in completed practice session summaries and uses that as the main trust anchor. However, the current resolver path that receives a specific `practiceSessionId` treats a completed session with no `summary_json.heroContext` as completed evidence for a Hero claim.

That was tolerable before economy because P3 only progressed a task. It is not tolerable once Coins are awarded.

P4 must change the rule:

```txt
A claim that can lead to Coins must require summary_json.heroContext.source === 'hero-mode'.
```

A completed practice session with missing Hero context should be rejected with a typed reason, for example:

```txt
hero_claim_missing_hero_context
```

The fallback may still recognise pre-P3 sessions for migration diagnostics, but it must not credit Hero progress or Coins.

### 3.2 Do not use event_log as the authoritative economy trigger

P3 emits `hero.daily.completed`, but the event write is best-effort and non-fatal. P4 must not award Coins by subscribing to or polling that event as the source of truth.

The source of truth for P4 is the Hero progress/economy state inside the `claim-task` mutation:

```txt
if daily.status transitions to completed AND daily award not yet issued:
  append deterministic ledger entry
  update balance
```

Events may mirror the economy change for observability, but they are not the authority.

### 3.3 Deterministic ledger IDs, not random IDs

P3 `recentClaims` can use generated claim IDs because it is a debugging trail. P4 ledger entries must be deterministic and idempotent.

Recommended idempotency key:

```txt
hero-daily-coins:v1:<learnerId>:<dateKey>:<questId>:<questFingerprint>
```

Recommended ledger entry id:

```txt
hero-ledger-<stable hash of idempotency key>
```

Never use `Math.random()` or wall-clock-only IDs for the authoritative Coins ledger.

### 3.4 Convert “route may not be wired yet” tests into hard assertions

Some P3 mutation-safety tests still contain compatibility branches that accept structured non-200 responses if `claim-task` is not wired. That was useful during staged implementation. After P3 is complete, P4 should remove or replace those branches for the economy path.

For P4, the tests must fail if the route is not wired.

### 3.5 Make the vocabulary boundary scope-aware

P3 forbids economy vocabulary across Hero child UI. P4 intentionally introduces “Hero Coins”. Do not delete the vocabulary tests. Instead, split them:

- economy terms such as `coin` are allowed only in P4 economy copy and economy UI components;
- pressure/gambling/shop terms remain forbidden everywhere: `deal`, `loot`, `jackpot`, `limited time`, `daily deal`, `don't miss out`, `shop`, `buy`, `streak reward`, `spend now`;
- subject surfaces and non-economy Hero copy must remain free of economy language.

This protects the learning surfaces while allowing a controlled reward acknowledgement.

---

## 4. Strategic decision: P4 is daily completion economy only

P4 must not award Coins per question, per answer, per click, per correct response, or per support-free attempt.

The P4 economy has one core award:

```txt
Daily Hero Quest completed → +100 Hero Coins
```

That is deliberately simple. It creates a clear daily reward contract without turning every subject item into a currency opportunity.

P4 should not introduce:

- per-task Coins;
- per-question Coins;
- correctness-only Coins;
- speed bonuses;
- no-hint bonuses;
- streak bonuses;
- random bonus drops;
- shop offers;
- limited-time multipliers;
- repeat-grind bonuses after daily completion;
- monster unlock/evolve spending.

P4 may show the daily potential before completion, but only in calm language:

```txt
Complete today’s Hero Quest to add 100 Hero Coins.
```

Avoid pressure copy:

```txt
Don’t miss out.
Limited-time reward.
Earn fast.
Keep your streak alive.
```

---

## 5. Product semantics

### 5.1 What Hero Coins mean

Hero Coins represent completion of a valuable daily learning contract.

They do not represent:

- intelligence;
- correctness;
- speed;
- subject mastery;
- Stars;
- Mega status;
- number of questions clicked;
- parental approval;
- a streak.

A child should be able to understand Hero Coins as:

> “I completed today’s Hero Quest. My Hero Coins were added.”

The reward is a celebration of honest completion, not a bribe for rushing.

### 5.2 What earns Coins in P4

A learner earns Coins in P4 only when:

1. Hero Mode progress is enabled;
2. Hero Mode economy is enabled;
3. today’s Hero Quest is complete according to P3 progress state;
4. the daily completion was reached through verified Hero task claims;
5. the daily award has not already been issued for the same `dateKey + questId + questFingerprint`;
6. the Worker writes the ledger entry and balance update through the Hero mutation boundary.

Correctness is not the main gate. The subject engine already owns correctness, feedback, Stars, and mastery.

### 5.3 What happens after daily Coins are awarded

After the daily award is issued:

- the balance increases;
- the dashboard may show a calm completion state;
- the child can still practise subjects normally;
- subject mastery continues through subject engines;
- no additional Hero Coins are awarded for the same daily quest;
- P4 does not yet offer anything to spend Coins on.

The child-facing copy should set expectations gently:

```txt
Hero Coins saved. Hero Camp arrives in a later update.
```

If that wording feels too “coming soon”, the UI can simply show the balance without promising a future surface.

---

## 6. P4 scope

P4 has six product/engineering outcomes.

### 6.1 Economy state and ledger

Add Hero-owned economy state to the existing Hero state row.

Preferred storage remains:

```txt
child_game_state
learner_id = <learnerId>
system_id = 'hero-mode'
state_json = HeroModeStateV2
```

Do not add new D1 tables in P4 unless the implementation-planning agent proves that `child_game_state` cannot safely support a small daily ledger. The expected daily ledger size is small enough for the existing state row.

### 6.2 Daily completion award

Award a fixed daily completion amount once per daily quest.

Recommended P4 constant:

```ts
HERO_DAILY_COMPLETION_COINS = 100
```

The value should live in a shared pure economy module and be easy to tune later.

### 6.3 Read model v5

Evolve the Hero read model to version 5 when economy is enabled.

Read model v5 should include:

- `coinsEnabled: true` only when the full economy gate is on;
- current balance;
- lifetime earned;
- today’s potential Coins;
- today’s award status;
- today’s awarded amount;
- recent ledger entries for debugging/admin use, with child-safe filtering;
- no monster spending data yet.

### 6.4 Child-facing economy acknowledgement

Update `HeroQuestCard` to show a calm balance and daily completion award when appropriate.

The UI should not look like a shop. It should not look like a slot machine. It should not animate random rewards. It should not show urgency.

P4 may add:

- “Hero Coins” balance label;
- “100 Hero Coins added” after daily completion;
- a small “Saved for Hero Camp” hint if desired;
- no CTA to spend.

### 6.5 Idempotent mutation behaviour

All P4 economy writes must be idempotent.

Test these cases:

- same final `claim-task` request replay returns the same award response;
- different request after the daily quest is already complete does not issue another award;
- two tabs finish/claim around the same time and only one award is posted;
- stale revision rejects safely;
- event logging failure does not cause a second award;
- read-model reload does not award Coins by itself.

### 6.6 Economy safety telemetry

Add structured logs and/or event mirror entries for:

- daily Coins awarded;
- daily Coins already awarded;
- daily Coins award blocked;
- economy disabled attempt;
- duplicate award prevented;
- ledger invariant failure.

Telemetry is for monitoring. It is not the source of truth.

---

## 7. P4 non-goals

P4 does not include:

1. Hero Camp;
2. Hero monster ownership;
3. monster unlock;
4. monster evolve;
5. branch choices;
6. spending;
7. refunds;
8. purchases;
9. shop UI;
10. random rewards;
11. loot boxes;
12. streak rewards;
13. per-question Coins;
14. correctness-only Coins;
15. speed bonuses;
16. paid currency;
17. parent-adjusted allowance controls;
18. six-subject expansion;
19. subject Stars awarded by Hero;
20. changes to Grammar, Punctuation, or Spelling mastery algorithms.

P5 will handle Hero Camp and Hero Pool monsters. P4 only creates the safe, capped earning side.

---

## 8. Current repo context P4 must respect

### 8.1 Existing Hero progress state

P3 currently stores Hero progress state like this:

```ts
type HeroModeProgressStateV1 = {
  version: 1;
  daily: HeroDailyProgress | null;
  recentClaims: HeroClaimRecord[];
};
```

P4 should migrate this to a combined Hero state rather than create a separate system id.

Recommended:

```ts
type HeroModeStateV2 = {
  version: 2;
  daily: HeroDailyProgressV2 | null;
  recentClaims: HeroClaimRecord[];
  economy: HeroEconomyState;
};
```

The normaliser must accept P3 v1 state and migrate it safely:

```txt
v1 progress state → v2 state with empty economy balance and empty ledger
```

Do not wipe existing daily progress during migration.

### 8.2 Existing `claim-task` command

P3 already routes `claim-task` through the Hero command mutation path.

P4 should extend that path rather than add a new public command for daily Coins.

The final task claim should be enough to award the daily Coins when daily completion is reached.

A separate public command such as `claim-daily-coins` is not recommended for P4 because it would encourage “claim reward” product language and create another idempotency surface.

### 8.3 Existing event boundary

P3 emits these progress events:

```txt
hero.task.completed
hero.daily.completed
```

P4 may add this economy event:

```txt
hero.coins.awarded
```

If implemented, it must be a deterministic mirror of the ledger entry:

```txt
event id = hero-evt-<ledgerEntryId>
```

It must not be the mechanism that decides whether the award exists.

### 8.4 Existing child UI vocabulary tests

The P3 UI forbids economy vocabulary across Hero surfaces. P4 must revise this boundary rather than remove it.

Recommended split:

```txt
HERO_FORBIDDEN_PRESSURE_VOCABULARY
  deal, loot, jackpot, limited time, daily deal, don't miss out, streak reward, grind, buy now, spend now

HERO_ECONOMY_COPY_ALLOWLIST
  Hero Coins, balance, added, saved
```

Child UI tests should verify that economy terms appear only in the P4 economy block, not in subject task copy, task reasons, scheduler explanations, or subject banners unless intentionally scoped.

---

## 9. Feature flags

P4 must introduce a new economy flag:

```txt
HERO_MODE_ECONOMY_ENABLED=false
```

The full P4 child-facing economy path requires:

```txt
HERO_MODE_SHADOW_ENABLED=true
HERO_MODE_LAUNCH_ENABLED=true
HERO_MODE_CHILD_UI_ENABLED=true
HERO_MODE_PROGRESS_ENABLED=true
HERO_MODE_ECONOMY_ENABLED=true
```

Flag behaviour:

| Flag state | Expected behaviour |
|---|---|
| economy off | P3 progress works; no Coins displayed; no economy state writes except migration-safe reads if needed |
| progress off, economy on | misconfigured; economy must remain off and log/return a safe code |
| child UI off, economy on | no child economy UI; Worker should not award via child flow |
| all flags on | final verified daily completion can award capped Coins once |

Default in `wrangler.jsonc` and `worker/wrangler.example.jsonc` must be:

```json
"HERO_MODE_ECONOMY_ENABLED": "false"
```

Do not enable this by default in production.

---

## 10. Economy constants and shared modules

Recommended new shared pure module:

```txt
shared/hero/economy.js
```

Recommended exports:

```ts
export const HERO_ECONOMY_VERSION = 1;
export const HERO_DAILY_COMPLETION_COINS = 100;
export const HERO_DAILY_BONUS_COINS_CAP = 0; // P4: no bonus economy yet
export const HERO_LEDGER_RECENT_LIMIT = 180;

export const HERO_ECONOMY_ENTRY_TYPES = Object.freeze([
  'daily-completion-award',
  'admin-adjustment',       // reserved, not enabled in P4 child flow
]);
```

Recommended pure helpers:

```ts
deriveDailyAwardKey({ learnerId, dateKey, questId, questFingerprint, economyVersion })
deriveLedgerEntryId(awardKey)
normaliseHeroEconomyState(raw)
ensureHeroEconomyState(heroState)
canAwardDailyCompletionCoins(heroState, daily)
applyDailyCompletionCoinAward(heroState, awardContext)
selectChildSafeEconomyReadModel(heroState, daily)
```

Shared modules must remain pure. They may use deterministic hashing. They must not import Worker code, repository code, React, D1, subject runtime, or browser APIs.

Avoid `Date.now()` and `Math.random()` inside authoritative economy helpers. Pass `nowTs` in from the Worker.

---

## 11. State shape

### 11.1 Hero state v2

Recommended shape:

```ts
type HeroModeStateV2 = {
  version: 2;

  daily: HeroDailyProgressV2 | null;

  recentClaims: HeroClaimRecord[];

  economy: {
    version: 1;
    balance: number;
    lifetimeEarned: number;
    lifetimeSpent: number; // P4 remains 0; spending starts in P5
    ledger: HeroEconomyLedgerEntry[];
    lastUpdatedAt: number | null;
  };
};
```

### 11.2 Daily progress v2 economy fields

Extend the daily block with an economy sub-block:

```ts
type HeroDailyProgressV2 = HeroDailyProgressV1 & {
  economy: {
    dailyAwardStatus: 'not-eligible' | 'available' | 'awarded' | 'blocked';
    dailyAwardCoinsAvailable: number;
    dailyAwardCoinsAwarded: number;
    dailyAwardLedgerEntryId: string | null;
    dailyAwardedAt: number | null;
    dailyAwardReason: string | null;
  };
};
```

If economy is disabled, keep the state clean. Either omit `daily.economy` or set it to a normalised disabled/zero state. The implementation plan should choose one rule and test it.

### 11.3 Ledger entry

Recommended ledger entry:

```ts
type HeroEconomyLedgerEntry = {
  entryId: string;
  idempotencyKey: string;
  type: 'daily-completion-award';

  amount: number; // positive for award, negative reserved for future spending/refund
  balanceAfter: number;

  learnerId: string;
  dateKey: string;
  questId: string;
  questFingerprint: string;

  source: {
    kind: 'hero-daily-completion';
    dailyCompletedAt: number;
    completedTaskIds: string[];
    effortCompleted: number;
    effortPlanned: number;
  };

  createdAt: number;
  createdBy: 'system';
};
```

### 11.4 Ledger retention

P4 can store a bounded recent ledger in `child_game_state`.

Recommended P4 retention:

```txt
Keep the most recent 180 ledger entries in state.
```

This is enough for child-visible history and debugging. If long-term accounting becomes important, P6 or a later economy hardening phase can add a dedicated ledger table or use event-log reconciliation. P4 should avoid new storage unless necessary.

---

## 12. Awarding algorithm

### 12.1 Trigger

The only P4 award trigger is daily completion.

The preferred trigger point is inside the existing `claim-task` mutation, after applying the task claim and deriving the updated daily status.

Pseudo-flow:

```ts
const before = heroState;
const afterClaim = applyClaimToProgress(before, claimResult, nowTs);

const afterAward = applyDailyCompletionCoinAward(afterClaim, {
  learnerId,
  nowTs,
  dailyCompletionCoins: HERO_DAILY_COMPLETION_COINS,
});

return { state: afterAward, claimResult, economyResult };
```

### 12.2 Eligibility

Coins are awarded only when:

```txt
before.daily.status !== 'completed'
afterClaim.daily.status === 'completed'
economy flag is enabled
daily award ledger entry does not already exist
all planned task IDs are completed
```

A robust implementation may also allow:

```txt
before.daily.status === 'completed'
AND daily award missing
AND this is the same dateKey
AND this is the first P4-enabled completion response
```

But do not backfill old P3 completions by default. Backfilling risks surprising balances and makes testing harder.

### 12.3 Award amount

Recommended P4:

```txt
+100 Hero Coins for daily completion
```

No other P4 award sources.

### 12.4 Idempotency

The award helper must check both:

1. the daily award marker, for example `daily.economy.dailyAwardLedgerEntryId`; and
2. the ledger idempotency key.

If either indicates that the award already exists, return:

```ts
{
  awarded: false,
  alreadyAwarded: true,
  amount: 0,
  ledgerEntryId: existingEntryId,
}
```

Do not add balance again.

### 12.5 Response behaviour

When final claim completes the daily quest and Coins are awarded, the response may include:

```ts
heroClaim: {
  status: 'claimed',
  dailyStatus: 'completed',
  coinsEnabled: true,
  coinsAwarded: 100,
  coinBalance: 300,
}
```

When the task was already completed and the daily award was already issued:

```ts
heroClaim: {
  status: 'already-completed',
  dailyStatus: 'completed',
  coinsEnabled: true,
  coinsAwarded: 0,
  coinBalance: 300,
  dailyCoinsAlreadyAwarded: true,
}
```

Avoid child copy that uses the internal word “claim”.

---

## 13. Worker route and repository requirements

### 13.1 Route gates

`POST /api/hero/command` with `claim-task` must keep all P3 gates and add economy behaviour only when:

```txt
HERO_MODE_ECONOMY_ENABLED=true
```

If economy is disabled, `claim-task` should behave exactly like P3:

- progress updates;
- no Coins;
- `coinsEnabled: false`;
- no economy ledger entry;
- no balance display.

### 13.2 Auth and mutation safety

P4 economy writes must use the same Hero mutation boundary as P3:

- authenticated session;
- same-origin;
- mutation capability;
- learner write access;
- expected learner revision;
- mutation receipt;
- stale write rejection;
- idempotency reuse rejection;
- no hidden merge outside the repository boundary.

Economy state changes must be part of the same state write as the final progress update. Do not write balance in a second non-CAS statement after the claim mutation succeeds.

### 13.3 Repository helpers

The implementation-planning agent should inspect current repository helpers, then add or adapt methods as needed.

Preferred pattern:

```txt
repository.runHeroCommand(...)
  applyCommand returns next HeroModeStateV2 + response metadata
  repository writes child_game_state + mutation_receipt + revision bump atomically
```

If event mirror rows are added, prefer adding them inside the same batch with deterministic IDs. If that is too invasive for P4, event mirror rows may remain best-effort, but the ledger state must remain authoritative.

### 13.4 Expected writes

Allowed P4 writes:

- `child_game_state` for `system_id = 'hero-mode'` with progress + economy state;
- `mutation_receipts` for `claim-task` idempotency;
- `learner_profiles.state_revision` bump through the mutation boundary;
- optional deterministic `event_log` rows for `hero.coins.awarded`;
- structured logs.

Forbidden P4 writes:

- `child_subject_state` from economy code;
- `practice_sessions` from economy code;
- subject Stars;
- subject mastery;
- subject monster mastery;
- Hero monster ownership;
- spending/purchase/refund state;
- new Hero economy tables unless explicitly justified by the implementation plan.

---

## 14. Read model v5

P4 should evolve the Hero read model to version 5 when economy is enabled.

Recommended root fields:

```ts
type HeroReadModelV5 = HeroReadModelV4 & {
  version: 5;
  coinsEnabled: boolean;

  economy: {
    enabled: boolean;
    version: 1;
    balance: number;
    lifetimeEarned: number;
    lifetimeSpent: number;

    today: {
      dateKey: string;
      questId: string;
      awardStatus: 'not-eligible' | 'available' | 'awarded' | 'blocked';
      coinsAvailable: number;
      coinsAwarded: number;
      ledgerEntryId: string | null;
      awardedAt: number | null;
    };

    recentLedger: Array<{
      entryId: string;
      type: 'daily-completion-award';
      amount: number;
      dateKey: string;
      createdAt: number;
    }>;
  };
};
```

When economy is disabled, the read model may remain v4 or return v5 with:

```ts
economy: { enabled: false }
coinsEnabled: false
```

Choose one convention and test it. The simpler child-client path is usually:

```txt
progress enabled only → v4
economy enabled → v5
```

### 14.1 Child-safe filtering

Do not expose full ledger internals to the child browser.

Child-safe recent ledger may include:

- entry id;
- type;
- amount;
- dateKey;
- createdAt.

Do not expose debug source details, request IDs, account IDs, or raw claim evidence in child UI responses.

### 14.2 Balance after flag changes

If economy is disabled after being enabled, existing state should remain stored but dormant.

Read model behaviour with economy disabled:

- no balance display;
- no new awards;
- no child economy copy;
- existing economy state preserved for future re-enable.

---

## 15. Client requirements

### 15.1 Hero client

`src/platform/hero/hero-client.js` should not need a new public `claim-daily-coins` method in P4.

The existing `claimTask` method should receive an enriched response when the final daily task completes:

```ts
heroClaim.coinsEnabled
heroClaim.coinsAwarded
heroClaim.coinBalance
heroClaim.dailyCoinsAlreadyAwarded
```

The client should treat those as server facts. It must not compute or add Coins locally.

### 15.2 Hero UI model

`buildHeroHomeModel` should derive economy fields from the read model:

```ts
{
  coinsEnabled: boolean;
  coinBalance: number;
  coinsAwardedToday: number;
  dailyAwardStatus: string;
  showCoinsAwarded: boolean;
  showCoinBalance: boolean;
}
```

Do not store authoritative balance in client-only `heroUi`. The server read model owns it.

### 15.3 HeroQuestCard

P4 may update the daily-complete state like this:

```txt
Today’s Hero Quest is complete.
100 Hero Coins added.
Balance: 300 Hero Coins.
```

The card should still avoid pressure. No countdowns. No shop link. No “spend now”. No “don’t miss tomorrow”.

If economy is disabled, the card should render the P3 daily-complete copy unchanged.

### 15.4 Subject banner

The subject banner should remain learning-context only. It does not need to show Coins.

Reason:

- the subject surface is where the child is thinking about learning;
- Coins belong in the Hero dashboard completion acknowledgement;
- showing Coins during subject tasks risks shifting attention from the task to the reward.

Recommended rule:

```txt
HeroTaskBanner remains economy-free in P4.
```

### 15.5 Toasts and animation

P4 may add a small completion toast, but it should be calm and deterministic.

Allowed:

```txt
Hero Coins added.
```

Avoid:

```txt
Jackpot!
Big win!
Hurry back tomorrow!
```

No randomised particle effects, no roulette, no spinning coin counters, no chance-based reward reveal.

---

## 16. Copy guidance

P4 introduces controlled economy copy.

Good copy:

```txt
Hero Coins added.
You completed today’s Hero Quest.
Balance: 300 Hero Coins.
Complete today’s Hero Quest to add 100 Hero Coins.
Hero Coins are saved for Hero Camp.
```

Avoid copy:

```txt
Claim your reward.
Earn fast.
Daily deal.
Don’t miss out.
Limited time.
Keep your streak.
Spend now.
Buy now.
Lucky bonus.
Jackpot.
Loot.
```

Internal command names may still use `claim-task`. Child copy should not use “claim”.

---

## 17. Metrics and observability

P4 must add economy-health metrics from day one.

Recommended server logs/events:

```txt
hero_daily_coins_awarded
hero_daily_coins_already_awarded
hero_daily_coins_blocked
hero_daily_coins_disabled
hero_daily_coins_duplicate_prevented
hero_economy_state_migrated
hero_economy_invariant_failed
```

Recommended product metrics:

- daily quest completion rate before/after Coins;
- coin award rate per completed daily quest;
- duplicate award prevention count;
- stale write rate during final task claims;
- claim-task latency with economy enabled;
- dashboard return rate after daily completion;
- extra subject practice after daily Coins awarded;
- spam/no-attempt rejection rate from P3 remains stable;
- subject mix distribution remains stable;
- retention-after-secure pass rate remains stable or improves.

The important guardrail is:

```txt
Coins should increase return motivation without increasing rushing, skipping, or easy-task preference.
```

---

## 18. Testing requirements

P4 requires tests in five groups.

### 18.1 Shared economy tests

Test:

- deterministic award key;
- deterministic ledger entry id;
- v1 progress state migrates to v2 economy state;
- malformed economy state normalises safely;
- daily award applies once;
- already-awarded state does not double count;
- ledger retention cap;
- no `Math.random()` / `Date.now()` inside authoritative helpers.

### 18.2 Worker mutation tests

Test:

- final claim awards +100 Coins exactly once;
- non-final claim awards 0;
- same request replay returns same award response;
- different request after completion returns no duplicate award;
- stale revision rejects before award;
- event-log failure does not duplicate award;
- economy disabled preserves P3 behaviour;
- economy enabled but progress disabled is blocked/misconfigured;
- no `child_subject_state` or `practice_sessions` writes from economy code.

### 18.3 Read model tests

Test:

- v4 when progress enabled and economy disabled, if that convention is chosen;
- v5 when economy enabled;
- balance and today award status;
- child-safe ledger filtering;
- debug fields stripped from child-visible responses;
- economy state persists but is hidden when flag off;
- malformed economy state does not crash dashboard.

### 18.4 Client/UI tests

Test:

- daily complete card with economy off uses P3 copy;
- daily complete card with economy on shows Coins added;
- balance displays correctly;
- no shop/spending CTA;
- no economy copy in `HeroTaskBanner`;
- no forbidden pressure vocabulary;
- `aria-live` for balance update;
- no animation requirement.

### 18.5 Security and abuse tests

Test:

- claim with specific `practiceSessionId` but missing `summary_json.heroContext` is rejected;
- client cannot send `coins`, `balance`, `reward`, `ledger`, `amount`, or `economy` fields in claim requests;
- cross-learner session cannot award Coins;
- forged questFingerprint cannot award Coins;
- stale date outside grace cannot award Coins;
- repeated final task claim from two tabs awards once;
- same ledger id cannot be posted twice.

---

## 19. Boundary invariants

P4 changes the P3 boundary intentionally. The new boundary should be explicit.

### 19.1 Allowed in P4

P4 allows:

- `coinsEnabled: true` in Hero read model when economy flag is on;
- `economy` block in Hero state;
- `Hero Coins` child copy in scoped economy UI;
- `hero.coins.awarded` mirror event if deterministic and idempotent;
- balance display;
- daily completion award.

### 19.2 Still forbidden in P4

P4 still forbids:

- subject mastery mutation from Hero;
- subject Stars awarded by Hero;
- subject monster mutation from Hero;
- Hero monster ownership;
- spending;
- shop/deal/loot mechanics;
- random rewards;
- streak rewards;
- pressure copy;
- per-question rewards;
- per-correct-answer rewards;
- child-supplied economy amount;
- client-computed balance;
- event-log-driven authoritative awards.

### 19.3 Updated structural scans

Update boundary tests so they distinguish:

```txt
allowed economy files:
  shared/hero/economy.js
  shared/hero/hero-economy-copy.js (if created)
  worker/src/hero/economy*.js
  src/platform/hero/* economy selectors
  HeroQuestCard economy block

forbidden economy files:
  subject engines
  subject services except unchanged heroContext summary passthrough
  subject read models
  scheduler/provider logic
  HeroTaskBanner unless explicitly approved
```

---

## 20. Rollout plan

P4 should be deployed behind flags.

Recommended stages:

### Stage 1 — Development only

```txt
HERO_MODE_ECONOMY_ENABLED=true
```

Run E2E through final daily completion and duplicate claims.

### Stage 2 — Staging

Enable all Hero flags for internal learners.

Check:

- balance increments once;
- no duplicate awards;
- no reward copy in subject surfaces;
- no performance regression on final claim;
- event logs, if implemented, match ledger entries.

### Stage 3 — Limited production cohort

Enable P0–P4 flags for a small cohort only if the platform has a cohort flag mechanism. If not, keep production off until P4+P5 are both ready for a coherent child experience.

### Stage 4 — Wider release

Do not widen if these metrics are unhealthy:

- duplicate award prevention spikes;
- claim failures increase;
- subject completion drops;
- children abandon after seeing balance because there is nothing to do with Coins;
- spam/skipping increases.

---

## 21. Relationship to P5

P4 earns Coins. P5 spends Coins.

P5 should add:

- Hero Camp;
- Hero Pool monster registry;
- six initial Hero Pool monsters;
- unlock/evolve costs;
- child choice;
- confirm/undo;
- no random draw;
- no shop pressure;
- no paid currency.

P4 must prepare for P5 by keeping the economy state clean:

```txt
balance
lifetimeEarned
lifetimeSpent
ledger
```

Do not prematurely add monster ownership or spending fields in P4. P5 should own those semantics.

---

## 22. Recommended implementation units for the planning agent

This origin document is not the root implementation plan, but the implementation-planning agent should consider a sequence like this:

1. **P4-U0 — Preflight P3 hardening**
   Tighten claim evidence so missing `summary_json.heroContext` cannot credit progress/Coins; convert route-wiring compatibility tests into hard assertions for P4 paths.

2. **P4-U1 — Shared economy contract**
   Add economy constants, deterministic award keys, ledger entry shapes, state migration helpers, and no-random/no-Date.now tests.

3. **P4-U2 — Hero state v2 migration**
   Migrate P3 progress state to v2 with an economy block while preserving daily progress and recent claims.

4. **P4-U3 — Daily completion award helper**
   Implement pure `applyDailyCompletionCoinAward()` and idempotency checks.

5. **P4-U4 — Worker claim-task economy integration**
   Extend final `claim-task` mutation to award Coins inside the same Hero state write when daily completion is reached.

6. **P4-U5 — Read model v5**
   Add child-safe economy summary and balance, behind `HERO_MODE_ECONOMY_ENABLED`.

7. **P4-U6 — Client/UI economy acknowledgement**
   Update Hero client response handling, home model, and HeroQuestCard daily-complete state. Keep HeroTaskBanner economy-free.

8. **P4-U7 — Event/log mirror and monitoring**
   Add deterministic optional `hero.coins.awarded` mirror event and structured logs.

9. **P4-U8 — Boundary, abuse, and E2E tests**
   Cover duplicate awards, two tabs, stale writes, forged requests, missing heroContext, and vocabulary scope.

10. **P4-U9 — Completion report and rollout checklist**
    Document exact flags, tests, remaining risks, and P5 handoff.

---

## 23. Acceptance criteria

P4 is complete only when all of the following are true.

### Product

- Completing today’s Hero Quest can add Hero Coins.
- Coins are awarded only for daily Hero Quest completion.
- No per-question, correctness-only, speed, streak, random, or shop-based rewards exist.
- The dashboard shows calm economy copy when enabled.
- The subject task surface remains learning-first and economy-free.
- No Hero Camp, monster ownership, unlock/evolve, or spending exists in P4.

### Architecture

- Economy state lives under Hero-owned platform/game state.
- No new D1 table is added unless explicitly justified in the implementation plan.
- The award is applied inside the Hero mutation boundary, not as a best-effort side effect.
- Ledger entries have deterministic idempotency keys and deterministic entry IDs.
- Event log, if used, mirrors the ledger and is not the source of truth.
- The read model exposes child-safe economy fields only when the economy flag is enabled.

### Safety

- Missing `summary_json.heroContext` cannot lead to Coins.
- Cross-learner evidence cannot lead to Coins.
- Client-supplied amount/balance/reward/economy fields are rejected.
- Same daily quest cannot award Coins twice.
- Two tabs cannot double-award.
- Stale write cannot award.
- Economy flag off preserves P3 behaviour.

### Learning boundary

- Hero Coins do not modify subject Stars.
- Hero Coins do not modify Grammar/Punctuation/Spelling mastery.
- Hero Coins do not change subject scheduler behaviour.
- Hero Coins do not change marking or feedback.
- Hero scheduler still optimises learning need, not reward maximisation.

### Testing

- Shared economy tests pass.
- Worker mutation tests pass.
- Read model v5 tests pass.
- Client/UI tests pass.
- Boundary vocabulary tests are scope-aware and pass.
- Abuse tests pass.
- Existing P0/P1/P2/P3 Hero tests either pass unchanged or are updated with clear P4 boundary evolution.

---

## 24. Final P4 sentence

Hero Mode P4 gives the platform a safe earning economy: one verified daily Hero Quest completion can add one capped Hero Coins award, exactly once, with a deterministic ledger and calm child-facing balance copy. It must strengthen the daily learning contract, not turn KS2 Mastery into a reward chase.
