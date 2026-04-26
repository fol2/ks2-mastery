係，呢個就係我會叫 **Hero Mode Phase 0** 要追做嘅嘢。不過我會將之前講嘅 “P‑1” 吞入 Phase 0 裏面，唔再另外開一個負數 phase。即係：

**Hero Mode P0 = Contract freeze + shadow scheduler + Worker read-model seam + test harness。**

唔係 child-facing Hero Quest。唔係 Coins。唔係 Hero Camp。唔係 monster unlock。Phase 0 完成嘅標準係：codebase 已經有一條安全、可測、deterministic 嘅 Hero foundation，可以喺 staging / debug mode 生成「今日 Hero shadow quest」，但未會影響小朋友畫面、subject mastery、Stars、Coins、monster state。

你而家講兩部分——「每一個 unit 去做」同「Phase 0 codebase 點處理」——我覺得好啱。應該就用 repo 現有 plan 風格寫成正式 plan，而唔係只做概念文。

現有 repo 嘅 planning pattern 幾清楚：Grammar P4 用 `Overview / Problem Frame / Requirements Trace / Scope Boundaries / Context / Key Technical Decisions / High-Level Technical Design / Implementation Units` 呢種重型格式，而且 unit 會列 dependencies、files、approach、test scenarios、verification；佢甚至用 unit dependency graph 去講 U0/U1/U2 點落地。([GitHub][1]) Punctuation P4 亦有 stable U-ID mapping、scope boundaries、feature flag、security gate、telemetry allowlist、ordered units 同 parallelism window。([GitHub][2]) Post‑Mega Spelling P2 就更加似我哋 Hero Mode 要學嘅模式：先講 data shape evolution、read-model evolution、output structure，再拆一堆 implementation units。([GitHub][3])

所以我會開兩份文件：

`docs/plans/james/hero-mode/hero-mode-p0.md`
呢份係 James/product-origin doc，寫產品 contract、learning contract、非目標、copy direction、future phases。

`docs/plans/2026-04-26-001-feat-hero-mode-p0-shadow-scheduler-plan.md`
呢份係 implementation plan，跟 repo 既有 root-level plan style，狀態 `active`，origin 指向上面嗰份。

## Phase 0 嘅核心定位

Phase 0 唔應該叫 “MVP UI”。應該叫：

**Hero Mode P0 — Contract, Shadow Scheduler, and Codebase Foundation**

Scope 一句講晒：

**Build a read-only Hero Mode foundation that can compute a deterministic daily shadow quest across ready subjects, explain why tasks were chosen, and prove that Hero Mode does not mutate subject mastery, Stars, Coins, or monster state.**

呢個定位好重要，因為你個 repo 現在已經有好硬嘅 architecture boundary。README 講明 subject engines 要同 shell 分開，game layer 只係 react to mastery，唔應該控制 learning flow。([GitHub][4]) Subject expansion doc 亦講明 production subject 唔應該喺 browser ship engine；session creation、marking、scheduling、progress mutation、reward projection 都應該喺 Worker subject command/read-model boundary。([GitHub][5]) Worker README 亦講 production practice writes 走 `POST /api/subjects/:subjectId/command`，Spelling、Grammar、Punctuation 由 Worker 擁有 session creation、selection/marking、progress mutation、event publication、read model。([GitHub][6])

所以 Phase 0 最重要嘅 engineering rule 係：

**Hero P0 只讀，不寫。只 plan，不 reward。只 shadow，不 launch。**

## Phase 0 唔做乜

我會喺 plan 最前面寫死呢幾條，避免 scope creep：

Phase 0 不做 child-facing Hero card。
Phase 0 不做 Coins ledger。
Phase 0 不做 Hero Camp。
Phase 0 不寫 `child_game_state`。
Phase 0 不新增 D1 table。
Phase 0 不改 Grammar / Punctuation Stars。
Phase 0 不改 subject scheduler / marking / mastery algorithm。
Phase 0 不直接選 Grammar concept、Punctuation unit、Spelling word 作為權威題目。
Phase 0 不新增 Hero command。
Phase 0 不 expose 給 production children，除非 feature flag 明確開 staging/debug。

呢個係保護底層學習系統。上一輪我哋已經定咗 Hero Mode 要做 daily learning contract，而 subject Stars / Mega / secure evidence 繼續 subject-owned；Hero Coins 只係將來完成 daily contract 嘅 capped economy，唔係 per-question XP。 Grammar P5 同 Punctuation P5 都已經明確轉向 “Stars = learning evidence, not XP / grind”，所以 Hero Mode Phase 0 要同呢個方向對齊，而唔係加多一套 reward pressure。([GitHub][7])

## Phase 0 unit plan

我會拆成 10 個 units。每個 unit 都可以一個 PR，或者 U0/U1 合 PR，但我建議仍然保持 per-unit review，因為呢個 feature 會變成平台主線。Punctuation P4 已經用過 ordered units + parallelism window 呢種做法，Post‑Mega P2 亦明確講 per-unit cadence。([GitHub][2])

### P0-U0 — Product contract freeze

目標：寫清楚 Hero Mode Phase 0 嘅產品 contract。

Files：

`docs/plans/james/hero-mode/hero-mode-p0.md`

內容要包括：

Hero Mode 不是第七科。
Hero Mode 不改 subject Stars。
Hero Mode 不改 subject mastery。
Hero Mode first version uses ready subjects only。
Ready subjects now = Spelling, Grammar, Punctuation。
Arithmetic / Reasoning / Reading are locked / coming later。
Daily Quest uses effort budget, not raw question count。
Phase 0 is shadow only。
No Coins in P0。
No Hero Camp in P0。
No loot box ever。
No per-question currency ever。
Post-Mega subjects get low-frequency maintenance, not endless grind。

Acceptance：

文件明確分開 `subject learning evidence`、`Hero daily contract`、`future Hero economy`。
文件明確講 fully secured / Mega subject 只會安排 maintenance / retention check。
文件明確講 Hero scheduler 第一版係 task-envelope，不係 item-level scheduler。
文件明確列出 P1/P2/P3 future boundaries，避免 Phase 0 偷渡 UI / Coins。

### P0-U1 — Hero shared contract module

目標：建立 pure contract，暫時不接 Worker route。

Files：

`shared/hero/contracts.js`
`shared/hero/constants.js`
`tests/hero-contracts.test.js`

核心 types / shapes：

```js
export const HERO_MODE_SCHEMA_VERSION = 1;

export const HERO_READY_SUBJECT_IDS = Object.freeze([
  'spelling',
  'grammar',
  'punctuation',
]);

export const HERO_TASK_INTENTS = Object.freeze([
  'due-review',
  'weak-repair',
  'retention-after-secure',
  'post-mega-maintenance',
  'breadth-maintenance',
  'starter-growth',
]);

export const HERO_LAUNCHERS = Object.freeze([
  'smart-practice',
  'trouble-practice',
  'mini-test',
  'guardian-check',
  'gps-check',
]);
```

Acceptance：

All constants frozen。
Unknown intent rejected。
Unknown subject rejected unless marked locked。
No dependency on React。
No dependency on subject engine files that should stay out of public bundle。
No database / repository dependency。

### P0-U2 — Eligible subject resolver

目標：Hero scheduler 唔應該等六科齊先開。佢要識分 ready / locked / unavailable。

現在 repo subject registry 已經列出六科：spelling、arithmetic、reasoning、grammar、punctuation、reading，但 Worker runtime 只建立 spelling、grammar、punctuation command handlers。([GitHub][8]) README 亦講 remaining three subjects are intentionally placeholders，未有 deterministic learning engine。([GitHub][4])

Files：

`shared/hero/eligibility.js`
`tests/hero-eligibility.test.js`

Output shape：

```js
{
  eligibleSubjects: [
    { subjectId: 'spelling', reason: 'worker-command-ready' },
    { subjectId: 'grammar', reason: 'worker-command-ready' },
    { subjectId: 'punctuation', reason: 'worker-command-ready' }
  ],
  lockedSubjects: [
    { subjectId: 'arithmetic', reason: 'placeholder-engine-not-ready' },
    { subjectId: 'reasoning', reason: 'placeholder-engine-not-ready' },
    { subjectId: 'reading', reason: 'placeholder-engine-not-ready' }
  ]
}
```

Acceptance：

Placeholder subjects never crash scheduler。
Adding Arithmetic later should be one-line registry/provider addition, not Hero rewrite。
If Punctuation flag is off in an environment, it can be `locked` or `temporarily-disabled` without breaking quest generation。
Tests cover all-ready, one-ready, zero-ready, missing subject stats.

### P0-U3 — Hero task envelope normaliser

目標：定義「Hero task」係 subject-level envelope，而唔係 raw item selection。

Files：

`shared/hero/task-envelope.js`
`tests/hero-task-envelope.test.js`

Shape：

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
  }
}
```

Acceptance：

No `wordSlug` required。
No `templateId` required。
No `punctuationItemId` required。
`itemRef` optional only, not required。
Every task must have `intent`, `launcher`, `effortTarget`, `reasonTags`。
`effortTarget` must be bounded, for example 1–12 per task。
Normaliser must strip unknown debug fields before child-facing use later。

呢個係我今次最想守住嘅 engineering boundary：**Hero tells the subject what kind of learning moment is needed; the subject still chooses the actual questions.**

### P0-U4 — Subject Hero provider stubs

目標：每科有一個 Hero provider，但 Phase 0 只產生 task envelopes，不碰 marking / item internals。

Files：

`worker/src/hero/providers/spelling.js`
`worker/src/hero/providers/grammar.js`
`worker/src/hero/providers/punctuation.js`
`worker/src/hero/providers/index.js`
`tests/hero-providers.test.js`

Provider interface：

```js
export function getHeroSubjectSnapshot({ learnerId, subjectReadModel, now }) {
  return {
    subjectId,
    available,
    unavailableReason,
    signals: {
      dueCount,
      weakCount,
      secureCount,
      megaLike,
      postMegaAvailable,
      retentionDueCount
    },
    envelopes: []
  };
}
```

Phase 0 provider behaviour：

Spelling provider can emit `due-review`, `weak-repair`, `post-mega-maintenance` if post-mega / Guardian signals are available. If not, it emits generic `smart-practice` envelope only.

Grammar provider should be tolerant. If P5 Star/evidence fields exist, use them. If not, fall back to due/weak/confidence read-model signals. If neither exists, mark unavailable with `missing-hero-readable-signals`.

Punctuation provider should use due/wobbly/secure signals if available. If P5 Star fields are not yet implemented, don’t block Phase 0; emit generic `smart-practice` or `gps-check` envelope only when safe.

Acceptance：

Providers never import browser-only React components。
Providers never call subject command handlers。
Providers never mutate subject state。
Providers can return `available:false` with reason instead of throwing。
Tests use realistic snapshots, not fantasy state shape only.

### P0-U5 — Deterministic shadow scheduler

目標：建立 Hero scheduler pure function，輸入 provider envelopes，輸出 daily shadow quest。

Files：

`shared/hero/scheduler.js`
`shared/hero/random-seed.js`
`tests/hero-scheduler.test.js`

Seed：

```txt
learnerId + dateKey + timezone + schedulerVersion + contentReleaseFingerprint
```

Output：

```js
{
  questId,
  dateKey,
  timezone,
  schedulerVersion: 'hero-p0-shadow-v1',
  status: 'shadow',
  effortTarget: 18,
  effortPlanned: 18,
  tasks: [
    {
      taskId,
      subjectId,
      intent,
      launcher,
      effortTarget,
      reasonTags,
      debugReason
    }
  ],
  debug: {
    candidateCount,
    rejectedCandidates,
    subjectMix,
    weights
  }
}
```

Initial scheduling rule：

60% due / spaced / retention
25% weak / recent miss repair
15% breadth / neglected ready subject

Subject cap：

No subject > 45% planned effort if at least 3 subjects eligible。
If only 2 subjects eligible, cap can relax to 60%。
If only 1 subject eligible, all tasks can come from that subject, but debug must explain why。

Acceptance：

Same learner + same date + same schedulerVersion = same quest。
Different date usually gives different quest。
Due/weak outranks random breadth。
Mega / fully secured subject gets maintenance envelope, not high-frequency grind。
Zero eligible subjects returns empty quest with safe message, not crash。
All tasks have explainable reason tags。
No Coins fields except `coinsEnabled:false` in debug safety block.

### P0-U6 — Worker read-model route behind feature flag

目標：提供 read-only shadow endpoint，供 staging/debug/adult tooling 使用。

Files：

`worker/src/hero/read-model.js`
`worker/src/hero/routes.js` 或直接在 `worker/src/app.js` 接 route
`tests/worker-hero-read-model.test.js`

Endpoint：

```txt
GET /api/hero/read-model?learnerId=...
```

Response：

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
    eligibleSubjects: [],
    lockedSubjects: [],
    dailyQuest: {},
    debugReasons: []
  }
}
```

Flag：

```txt
HERO_MODE_SHADOW_ENABLED=true
```

Deployment rule：

Flag off：route returns 404 or `{ok:false, code:'hero_shadow_disabled'}` depending existing convention。
Dev/staging：flag on。
Production：flag off until P0 accepted。

Auth rule：

Must require authenticated session。
Must require learner read access。
Must not allow arbitrary learnerId outside account membership。
Demo sessions can use it only if same demo learner is selected.

Acceptance：

No `POST` route in P0。
No writes to `child_game_state`。
No writes to `child_subject_state`。
No writes to `event_log`。
No writes to `practice_sessions`。
No D1 migration。
No child dashboard UI.
Route uses existing repository/auth boundary rather than a direct ad hoc D1 read. This follows the same discipline as Punctuation telemetry, where bypassing repository/subject-command authz was explicitly treated as a security regression.([GitHub][2])

我會考慮將 `/api/hero/read-model` 加入 capacity-relevant path list，因為將來 Hero card 會變成 dashboard critical path；現有 Worker app already has a closed capacity-relevant list for bootstrap、subject commands、hubs、classroom。([GitHub][9])

### P0-U7 — Shadow simulation CLI and fixture set

目標：唔好等 child UI 上線先知 scheduler 壞。用 fixtures 模擬 fresh / weak / secure / Mega / mixed learners。

Files：

`scripts/hero-shadow-simulate.mjs`
`tests/fixtures/hero/fresh-three-subjects.json`
`tests/fixtures/hero/spelling-mega-grammar-weak.json`
`tests/fixtures/hero/all-ready-balanced.json`
`tests/fixtures/hero/punctuation-disabled.json`
`tests/hero-shadow-simulate.test.js`

CLI output：

```txt
Hero Shadow Simulation
learners: 12
avg effort target: 18
subject mix: spelling 34%, grammar 33%, punctuation 33%
reason tags: due 42%, weak 26%, maintenance 20%, breadth 12%
post-mega maintenance tasks: 8
invalid tasks: 0
```

Acceptance：

Simulation runs without Worker deployment。
Fixtures include at least one fully secured / Mega-like subject。
Fixtures include missing P5 star fields。
Fixtures include placeholder subjects。
Output catches subject-overweighting。
Output catches missing reasonTags。
Output catches task envelopes that cannot launch later.

### P0-U8 — Safety and no-write gate

目標：用 tests 鎖死 Phase 0 不會偷偷變成 reward system。

Files：

`tests/hero-no-write-boundary.test.js`
`tests/hero-no-coins-p0.test.js`
`tests/hero-subject-boundary.test.js`

Assertions：

No `hero.coins` state persisted。
No `hero.monsters` state persisted。
No `child_game_state` write from Hero P0 modules。
No `subjectRuntime.dispatch` from `/api/hero/read-model`。
No subject command shape contains `heroContext` yet。
No child-facing route imports Hero P0 read model。
No “coin”, “shop”, “daily deal”, “loot”, “streak loss” copy in P0 child surfaces。

Acceptance：

Grep-style structural tests pass。
Worker read-model route can be called repeatedly with identical result and no revision change。
Two concurrent reads do not create mutation receipts。
Readonly viewer access works only if repo policy allows it; writable child shell still unchanged.

### P0-U9 — Phase 0 completeness gate

目標：跟 Grammar Phase 4 completeness gate 風格，防止 planned unit 混入 main。

Files：

`tests/fixtures/hero-phase0-baseline.json`
`tests/hero-phase0-completeness.test.js`
`docs/plans/2026-04-26-001-feat-hero-mode-p0-shadow-scheduler-plan.md`

Baseline example：

```json
[
  { "unit": "P0-U0", "status": "completed", "evidence": "docs..." },
  { "unit": "P0-U1", "status": "completed", "evidence": "tests..." }
]
```

Acceptance：

No unit remains `planned` when phase completion is claimed。
Every unit has evidence field。
Every test file exists。
Plan status can move from `active` to `completed` only after gate passes。

Grammar P4 already uses this style: it extended a baseline fixture and validator so no unit merges as planned.([GitHub][1]) Hero Mode 應該照抄呢個 discipline，因為將來 Coins / Hero Camp 更容易出 edge cases。

## Phase 0 codebase handling

我會將 codebase 分成三層，避免一開始就塞晒入 subject 或 dashboard。

第一層：`shared/hero/*`

只放 pure contracts、normalisers、scheduler、seed helper。呢層可以俾 Worker tests、Node tests、future client normaliser 共用，但唔應該 import subject engines。

建議：

```txt
shared/hero/
  constants.js
  contracts.js
  eligibility.js
  task-envelope.js
  scheduler.js
  random-seed.js
```

第二層：`worker/src/hero/*`

Worker-only read model and providers。呢度可以讀 Worker subject read models / repository shape，但仍然不 dispatch subject commands。

建議：

```txt
worker/src/hero/
  read-model.js
  routes.js
  providers/
    index.js
    spelling.js
    grammar.js
    punctuation.js
```

第三層：`tests/hero-*`

Hero Mode 要由第一日就有 boundary tests，唔好等 UI 做完先補。

建議：

```txt
tests/
  hero-contracts.test.js
  hero-eligibility.test.js
  hero-task-envelope.test.js
  hero-providers.test.js
  hero-scheduler.test.js
  worker-hero-read-model.test.js
  hero-shadow-simulate.test.js
  hero-no-write-boundary.test.js
  hero-phase0-completeness.test.js

tests/fixtures/hero/
  fresh-three-subjects.json
  spelling-mega-grammar-weak.json
  all-ready-balanced.json
  punctuation-disabled.json
```

我暫時唔建議 P0 加 `src/platform/game/hero/*` client UI code。最多只可以加一個 future-safe normaliser，例如：

```txt
src/platform/game/hero/read-model-normaliser.js
```

但如果冇即時 client consumer，我寧願 P0 唔加 client surface。理由係：一加 client code，好容易有人順手放 dashboard card；一放 dashboard card，就會開始問 Coins、CTA、Hero Camp。Phase 0 應該保持乾淨。

## Route / deployment strategy

P0 deployment 要係 low-risk：

Dev：`HERO_MODE_SHADOW_ENABLED=true`
Staging：`HERO_MODE_SHADOW_ENABLED=true` after tests pass
Production：`HERO_MODE_SHADOW_ENABLED=false`

Prod flag off 時，無 child-visible change。
Staging flag on 時，只係 authenticated read-model route。
No D1 migration。
No bootstrap envelope change。
No contentReleaseId bump。
No subject exposure change。
No new route in public app navigation。

如果真係要俾 internal QA 睇，建議先用 direct URL / API inspect，不要上 dashboard。到 P1/P2 先加 child-facing Hero card。

## Phase 0 implementation order

我會咁排 PR：

PR 1：P0-U0 docs only。
PR 2：P0-U1 + U2 contracts and eligibility。
PR 3：P0-U3 task envelope normaliser。
PR 4：P0-U4 subject provider stubs。
PR 5：P0-U5 scheduler pure function。
PR 6：P0-U6 Worker read-model route behind flag。
PR 7：P0-U7 simulation CLI and fixtures。
PR 8：P0-U8 no-write boundary tests。
PR 9：P0-U9 completeness gate and plan closeout。

PR 6 係唯一會接 Worker route 嘅 PR，所以 security review 要集中喺嗰度。PR 1–5 都應該係 pure module / tests，風險低。

## Phase 0 完成後，應該見到乜

完成 Phase 0 後，我期望可以打：

```txt
GET /api/hero/read-model?learnerId=...
```

然後見到：

```js
{
  ok: true,
  hero: {
    mode: 'shadow',
    childVisible: false,
    coinsEnabled: false,
    writesEnabled: false,
    dateKey: '2026-04-26',
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
      effortTarget: 18,
      effortPlanned: 18,
      tasks: [
        {
          subjectId: 'grammar',
          intent: 'weak-repair',
          launcher: 'smart-practice',
          effortTarget: 6,
          reasonTags: ['weak', 'due-review']
        },
        {
          subjectId: 'spelling',
          intent: 'post-mega-maintenance',
          launcher: 'guardian-check',
          effortTarget: 4,
          reasonTags: ['mega-maintenance', 'retention-after-secure']
        },
        {
          subjectId: 'punctuation',
          intent: 'breadth-maintenance',
          launcher: 'smart-practice',
          effortTarget: 8,
          reasonTags: ['breadth', 'ready-subject']
        }
      ]
    }
  }
}
```

但同時：

No child sees this yet。
No Stars change。
No Coins awarded。
No monster unlocked。
No subject session starts from Hero。
No event log mutation。
No learner revision bump。

呢個先係一個乾淨嘅 Phase 0。

## 我會點寫 Phase 0 plan 嘅 opening

可以直接咁寫：

```md
---
title: "feat: Hero Mode P0 — Contract, Shadow Scheduler, and Read-Model Foundation"
type: feat
status: active
date: 2026-04-26
origin: docs/plans/james/hero-mode/hero-mode-p0.md
---

# feat: Hero Mode P0 — Contract, Shadow Scheduler, and Read-Model Foundation

## Overview

Hero Mode P0 creates a read-only platform-level foundation for a future daily Hero Quest. It does not introduce child-facing UI, Coins, Hero Camp, or Hero monster ownership. The deliverable is a deterministic shadow scheduler and Worker read model that can explain one daily cross-subject learning mission across ready subjects.

Hero Mode is not a seventh subject. It reads subject-owned learning evidence and produces a daily task envelope. Subject engines remain responsible for session creation, item selection, marking, mastery, Stars, and reward projection.

P0 is complete when the Worker can compute a deterministic shadow quest for Spelling, Grammar, and Punctuation; placeholder subjects are safely locked; Mega/fully-secured subjects receive maintenance-only envelopes; and tests prove that no Hero P0 code path writes Coins, game state, subject state, practice sessions, or event log rows.
```

## 最後判斷

你問「呢個係咪 Phase 0 要追做嘅嘢？」我會答：**係，而且應該即刻開始 planning。**

但我要再劃清界線：Phase 0 嘅成功唔係「小朋友見到 Hero Mode」。Phase 0 嘅成功係 **engineering foundation 已經安全到可以承托之後嘅 Hero Mode**。

我會用呢句做 Phase 0 acceptance sentence：

**Hero Mode P0 proves that the platform can compute a safe, deterministic, read-only daily learning mission across ready subjects without touching subject mastery, Stars, Coins, or monster state.**

下一步最實際就係先寫 `hero-mode-p0.md` 同 implementation plan skeleton，然後按上面 U0–U9 填 files/tests/verification。

[1]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/2026-04-26-001-feat-grammar-phase4-learning-hardening-plan.md "raw.githubusercontent.com"
[2]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/2026-04-26-001-feat-punctuation-phase4-visible-child-journey-plan.md "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/2026-04-26-006-feat-post-mega-spelling-p2-visibility-pattern-foundation-plan.md "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/README.md "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/subject-expansion.md "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/worker/README.md "raw.githubusercontent.com"
[7]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/grammar/grammar-p5.md "raw.githubusercontent.com"
[8]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/platform/core/subject-registry.js "raw.githubusercontent.com"
[9]: https://github.com/fol2/ks2-mastery/blob/main/worker/src/app.js "ks2-mastery/worker/src/app.js at main · fol2/ks2-mastery · GitHub"
