你呢個方向我同意，而且我會正式改口：**用 Star，好過用 XP。** XP 會令人覺得「做多啲題就一定升級」，好容易變成 grind。Star 可以定義成「學習證據」，即係小朋友唔係靠刷題，而係靠真正掌握、隔一段時間仍然做到、不同題型都做到，先攞到 Star。

我亦確認返你講最新 PR：你之前提到嘅 failure 已經有 regression sweep 收咗。PR #339 已 merge，寫明 `npm test` 由 14 failing 變 0 failing，結果係 3990 pass / 0 fail，`audit.yml` 亦升級做 hard PR gate。呢點我會喺之後 plan 入面當成已解決，不再當 primary blocker。([GitHub][1])

## 核心改動：所有 Grammar monsters 都用 100 Stars 滿分

我建議 Grammar reward curve 改成：

**每隻 active Grammar monster 都係 100 Stars = Mega。**

唔好再出現「Couronnail 12 Stars 已經 Mega，但 Bracehart 12 Stars 只係 Kid」呢種心理落差。你講得啱，小朋友同大人都應該有一個統一預期：**100 Stars 就係 Mega**。

但要注意一點：**100 Stars 係 display scale，不係 raw skill count。**
背後每隻 monster 的 concept 數量唔同，所以系統要做 normalization。

現時 active Grammar roster 係 Bracehart、Chronalyx、Couronnail、Concordium；Glossbloom、Loomrill、Mirrane 已經係 reserve。repo 入面 `MONSTERS_BY_SUBJECT.grammar` 亦係呢四隻 active grammar monsters。([GitHub][2])

現時 Grammar direct mapping 係 Bracehart 6 concepts、Chronalyx 4 concepts、Couronnail 3 concepts，Concordium aggregate 18 concepts；而現有 staging 係用 secure concept ratio 去計 stage，所以細 denominator monster 會好容易跳 stage，尤其 Couronnail 3 concepts 會由 2/3 stage 2 直接 3/3 Mega。([GitHub][3])

所以新 plan 要解決兩件事：

第一，**全部 monster display 都係 100 Stars**。
第二，**Star 唔係 linear 加上去；越後期越難。**

## 新 progression curve

我建議固定用呢個 curve：

| State      | Child-facing name | Star requirement |
| ---------- | ----------------- | ---------------: |
| Not caught | Not found yet     |                0 |
| Egg        | Egg found         |   catch gate met |
| Hatch      | Hatched           |         15 Stars |
| Evolve 2   | Growing           |         35 Stars |
| Evolve 3   | Nearly Mega       |         65 Stars |
| Mega       | Mega              |        100 Stars |

呢條 curve 係 deliberate non-linear：

Egg → Hatch：最容易，15 Stars。
Hatch → Evolve 2：再要 20 Stars。
Evolve 2 → Evolve 3：再要 30 Stars。
Evolve 3 → Mega：最後再要 35 Stars，而且要有 retention evidence。

即係越後越難，但不是不可能。小朋友一開始會較快見到 Egg / Hatch，有 motivation；但 Mega 要真正 durable mastery，唔係兩三日刷題刷出嚟。

## Star 唔應該係「答啱一題 +1」

呢點好重要。

Star 唔應該像 XP 咁「每答啱一題就加」。如果咁做，小朋友可以靠重複低難度題目刷上 Mega，學習價值會變差。

Star 應該由 **evidence tiers** 產生。每個 concept 有一個 Star budget。假設 Bracehart 有 6 concepts，每個 concept budget 約 16.7 Stars；Chronalyx 有 4 concepts，每個 concept budget 25 Stars；Couronnail 有 3 concepts，每個 concept budget 約 33.3 Stars；Concordium 18 concepts，每個 concept budget 約 5.56 Stars。

但每個 concept budget 唔係一次過攞晒。要逐層解鎖。

我建議每個 concept 的 Star budget 分成：

| Evidence tier          | Share of that concept’s Star budget | Meaning                                       |
| ---------------------- | ----------------------------------: | --------------------------------------------- |
| First independent win  |                                  5% | 第一次真正自己答啱                                     |
| Repeat independent win |                                 10% | 之後再獨立答啱一次                                     |
| Varied practice        |                                 10% | 不同 template / question shape 都做到              |
| Secure confidence      |                                 15% | 達到現有 secure 定義                                |
| Retained after secure  |                                 60% | secure 後隔一段時間，在 mixed review / mini-test 仍然做到 |

呢個分配係特登設計成後段重。因為 Grammar concept 少，如果「secure」本身已經畀太多 Star，monster 會升得太快。現在 secure 只係代表「你已經好穩」，但 Mega 要再證明「隔咗時間都仲穩」。

現有 repo 的 `secure` 定義本身唔係鬆：要 strength ≥ 0.82、correct streak ≥ 3、spacing interval ≥ 7 days；attempts ≤ 2 仍然係 emerging，weak 或 recent misses 會變 needs-repair。即係 secure 已經係有 spaced evidence 的狀態，不是一題答啱就 secure。([GitHub][4])

但我哋而家再加一層：**secure 不是 Mega；retention after secure 才是 Mega 的主力。**

## 例子：點解第一個 secure 只係 Egg，不會即刻 Hatch

用新 formula：

一個 concept 去到 secure，但未做 retention，大約只攞到：

5% + 10% + 10% + 15% = 40% of that concept budget。

即係：

Bracehart：一個 secure concept 約 6.7 Stars。
Chronalyx：一個 secure concept 約 10 Stars。
Couronnail：一個 secure concept 約 13.3 Stars。
Concordium：一個 secure concept 約 2.2 Stars。

所以第一個 secure concept 會觸發 **Egg found**，但通常未夠 15 Stars Hatch。呢個就同 Spelling 的感覺一致：第一個 secure 給你一隻蛋，但唔係即刻大爆升級。

如果之後小朋友對同一 concept 做到 retention check，呢個 concept 就可以補埋後面 60% budget。咁 Egg → Hatch 就會好自然：小朋友再證明一次，蛋就孵化。

## Concordium 要特別處理

Concordium 係 grand monster，不應該第一個 secure concept 就出蛋。

Direct monsters 可以：

1 secure concept = Egg found。

但 Concordium 應該代表 whole-subject breadth，所以我建議：

**Concordium Egg gate：至少 6 個 secure concepts，而且要橫跨至少 2 隻 direct monsters。**

例如只做晒 Bracehart 一個 cluster，都唔應該即刻搵到 Concordium。Concordium 應該係「你開始掌握整個 Grammar Garden」先出現。

Concordium 後面仍然用同一個 100-Star scale：

15 Stars = Hatch
35 Stars = Evolve 2
65 Stars = Evolve 3
100 Stars = Grand Concordium

但 Mega / Grand Concordium 必須要 all 18 concepts 達到 full evidence，包括 retention after secure。

咁做有三個好處：

第一，direct monsters 給短中期 motivation。
第二，Concordium 保持 legendary / grand reward 感覺。
第三，全部都係 100 Stars，認知上簡單。

## Landing Page 亦要跟呢個改

你覺得 Landing Page 有啲 messy，我同意。現時 Grammar dashboard 已經比以前好，但結構仍然有 hero、today cards、Concordium progress、4 primary mode cards、round length、speech rate、Begin round、Writing Try、More practice。repo comment 都明確寫咗呢個 structure。([GitHub][5])

我建議下一版 Landing Page 用呢個 hierarchy：

第一屏只見到：

**Grammar Garden**
“Fix tricky sentences. Grow your creatures.”

一個大 CTA：

**Start Smart Practice**

三個細 status：

Due today
Trouble spots
Secure skills

一條 compact monster strip：

Bracehart · Egg found · 8/100 Stars
Chronalyx · Not found yet · 0/100 Stars
Couronnail · Hatched · 18/100 Stars
Concordium · Not found yet · 4/100 Stars

下面 secondary links：

Grammar Bank
Mini Test
Fix Trouble Spots

再下面 collapsed：

More practice: Learn, Surgery, Builder, Worked, Faded, Writing Try

現時 dashboard 有四個 primary mode cards，Smart Practice、Fix Trouble Spots、Mini Test、Grammar Bank；Smart Practice 已經被標示為 obvious default action，Grammar Bank 亦係 primary card。([GitHub][6])
我建議再簡化一步：**Smart Practice 成為唯一 primary card / button，其他三個變 secondary links。**

理由好簡單：Spelling 清楚，係因為小朋友不用先理解多個模式先開始。Grammar 更複雜，所以更需要一條 default path。

## Revised plan：Grammar Phase 5 — 100-Star Monster Curve & Landing Simplification

### U0 — Freeze product contract

建立：

`docs/plans/james/grammar/grammar-phase5-star-curve-landing-plan.md`

Scope 寫清楚：

No new content.
No new learning mode.
No answer-spec migration.
No contentReleaseId bump unless marking changes.
This phase only changes reward display/progression logic and dashboard information architecture.

Invariants：

Star is not XP.
Stars are learning-evidence milestones, not per-question currency.
Writing Try gives 0 Stars.
AI explanation gives 0 Stars.
Worked/faded supported answers cannot unlock independent-win or retention Stars.
No monster downgrades after deployment.
Adult learning confidence may still show “needs repair” even if child reward stage is not removed.

### U1 — Add 100-Star display model

Create new helper, probably:

`src/platform/game/mastery/grammar-stars.js`

Core constants:

```js
export const GRAMMAR_MONSTER_STAR_MAX = 100;

export const GRAMMAR_STAR_STAGE_THRESHOLDS = Object.freeze({
  hatch: 15,
  evolve2: 35,
  evolve3: 65,
  mega: 100,
});

export const GRAMMAR_CONCEPT_STAR_WEIGHTS = Object.freeze({
  firstIndependentWin: 0.05,
  repeatIndependentWin: 0.10,
  variedPractice: 0.10,
  secureConfidence: 0.15,
  retainedAfterSecure: 0.60,
});
```

Important: **do not overload raw `mastered` count**. Existing `mastered` still means secure concepts. New field should be display-facing:

```js
{
  stars: 42,
  starMax: 100,
  stageName: 'Growing',
  displayStage: 2,
  nextMilestoneStars: 65,
  nextMilestoneLabel: 'Nearly Mega',
}
```

### U2 — Define concept evidence tiers

Implement a pure function:

```js
deriveGrammarConceptStarEvidence({
  conceptId,
  conceptNode,
  templateNodes,
  questionTypeNodes,
  recentAttempts,
  now,
})
```

It should return:

```js
{
  firstIndependentWin: true,
  repeatIndependentWin: true,
  variedPractice: false,
  secureConfidence: true,
  retainedAfterSecure: false,
}
```

Rules:

`firstIndependentWin` only counts first-attempt independent correct, support level 0.

`repeatIndependentWin` needs another independent correct on a later attempt/session.

`variedPractice` needs distinct template/question shape. For thin-pool concepts, fallback to distinct generated items is acceptable, but mark this in tests.

`secureConfidence` uses the existing confidence/status system.

`retainedAfterSecure` needs a later independent correct after the concept has been secure and due again, preferably in Smart Practice mixed review or Mini Test.

Supported worked/faded success can help learning confidence, but should not unlock independent / retention Stars at full value. This protects the learning loop: genuine first attempt, corrective feedback, support only when needed, retry, spaced return. That is aligned with the research-backed design brief you gave earlier. 

### U3 — Convert evidence into 100 Stars

For each monster:

```js
conceptBudget = 100 / conceptCount
conceptStars =
  conceptBudget * sum(unlockedEvidenceWeights)
monsterStars = floor(sum(conceptStars))
```

Example for Couronnail:

3 concepts, so each concept budget ≈ 33.3 Stars.

One secure concept without retention:

33.3 × 0.40 = 13.3 Stars.

So:

First secure concept → Egg found.
Still under 15 Stars → not hatched yet.
Retention or another concept pushes it over 15 → Hatch.

This fixes the exact problem you spotted: no tiny monster jumps from early progress straight to Mega.

### U4 — Stage gates

Direct monsters:

| Stage     | Requirement               |
| --------- | ------------------------- |
| Not found | 0 secure concepts         |
| Egg found | at least 1 secure concept |
| Hatch     | at least 15 Stars         |
| Evolve 2  | at least 35 Stars         |
| Evolve 3  | at least 65 Stars         |
| Mega      | 100 Stars                 |

Concordium:

| Stage            | Requirement                                                  |
| ---------------- | ------------------------------------------------------------ |
| Not found        | below broad-coverage gate                                    |
| Egg found        | at least 6 secure concepts across at least 2 direct monsters |
| Hatch            | at least 15 Stars and broad gate met                         |
| Evolve 2         | at least 35 Stars                                            |
| Evolve 3         | at least 65 Stars                                            |
| Grand Concordium | 100 Stars, all 18 concepts fully evidenced                   |

For Concordium, broad coverage matters. It should not be possible to grind only one cluster and unlock the grand monster early.

### U5 — No downgrade migration

Changing the display curve can make some existing learners look like they moved backwards. Avoid that.

Add a migration/normaliser:

```js
normaliseGrammarStarRewardState(previousState, computedProgress)
```

Rules:

If learner already caught a monster, keep Egg found.

If learner already saw stage 2, never display below stage 2.

If learner already saw Mega, keep Mega.

If new Star calculation is higher, move forward.

Never emit catch/evolve/mega toasts during read-time migration.

Reserved monsters remain hidden.

This keeps trust. We can improve the curve without punishing existing progress.

### U6 — Update dashboard monster strip

Landing Page should show compact, aligned progress:

Bracehart — Egg found — 8/100 Stars
Chronalyx — Growing — 42/100 Stars
Couronnail — Not found yet — 0/100 Stars
Concordium — Not found yet — 6/100 Stars

Child copy:

“100 Stars = Mega”
“Stars come from secure skills and later review.”

No raw evidence labels on the child dashboard. Adult report can show details.

### U7 — Simplify Landing Page

Update:

`GrammarSetupScene.jsx`
`grammar-view-model.js`

Current dashboard already removed old adult/developer copy and has child-facing hero, today cards, Concordium progress, primary modes, Writing Try, More practice, and quiet controls.([GitHub][5])

New layout:

One primary CTA:

**Start Smart Practice**

Secondary row:

Grammar Bank
Mini Test
Fix Trouble Spots

Monster strip:

4 active monsters, 100-Star progress.

Collapsed More practice:

Learn
Sentence Surgery
Sentence Builder
Worked Examples
Faded Guidance
Writing Try

Move Writing Try out of the primary area. It is valuable, but it is non-scored transfer, not the main daily path.

Acceptance criteria:

A child can start in one click.

The first screen does not require choosing among 8 modes.

All active monsters use 100-Star language.

No Worker / read model / denominator / evidence technical language in child dashboard.

### U8 — Reward event semantics

Events should become clearer:

First secure direct concept:

`caught` → “You found Bracehart’s Egg!”

15 Stars:

`hatch` or `evolve` → “Bracehart hatched!”

35 Stars:

`evolve`

65 Stars:

`evolve`

100 Stars:

`mega`

For Concordium:

No `caught` until broad gate is met.

Important: first secure concept should not fire both `caught` and `hatch` in one go. If the computed Stars cross 15 at the same time, queue the higher event for a later clear learning moment, or display only the most meaningful event. For motivation, I prefer:

First event: Egg found.
Next qualifying round: Hatch.

That gives the child a clearer story.

### U9 — Simulation before final thresholds

Before implementing final values blindly, add deterministic simulation:

`docs/plans/james/grammar/grammar-star-curve-simulation.md`

Scenarios:

Ideal learner: mostly independent correct.
Typical learner: 75–85% correct, occasional support.
Struggling learner: repeated misses and support.
Daily 5-question round.
Daily 10-question round.

Report:

Days to first direct Egg.
Days to first Hatch.
Days to first direct Mega.
Days to Concordium Egg.
Days to Grand Concordium.
Number of sessions.
Number of independent attempts.
Support usage impact.

Target feel:

First direct Egg: within 1–2 weeks.
First direct Hatch: 2–3 weeks.
First direct Mega: 5–8 weeks.
Concordium Egg: after broad progress, maybe 4–6 weeks.
Grand Concordium: 10–14+ weeks for realistic daily use.

If simulation shows Mega in 2 weeks, curve is too easy.
If simulation shows Egg only after 6 weeks, curve is too hard.

### U10 — Tests

Add tests for:

All active Grammar monsters have `starMax: 100`.

Couronnail no longer jumps straight to Mega from 3 secure concepts without retention.

First direct secure concept catches Egg but does not hatch.

Hatch threshold is 15 Stars.

Evolve 2 threshold is 35 Stars.

Evolve 3 threshold is 65 Stars.

Mega requires 100 Stars.

Concordium does not catch at 1 secure concept.

Concordium requires broad coverage.

Writing Try gives no Stars.

AI explanations give no Stars.

Supported worked/faded attempts do not unlock full independent Star tiers.

Legacy progress never displays lower than before.

Reserved monsters remain hidden.

Dashboard shows one primary Start Smart Practice action.

## My final recommendation

你提議「100 Stars = Mega」係正確方向。
我會將 Grammar monster progression 由：

**secure concept count → stage**

改成：

**secure concept + independent evidence + variation + retention → normalized 100 Stars → stage**

咁樣就會同時解決：

小朋友睇得明。
大人睇得明。
不同 monster denominator 唔同但 display 一致。
小 monster 不會太快 Mega。
Mega 真係代表 durable mastery，而唔係短期刷題。
Landing Page 可以簡化成 Spelling 那種「一眼知做咩」的模式。

下一版 plan 名稱我會改成：

**Grammar Phase 5 — 100-Star Monster Curve & Landing Simplification**

呢個 phase 唔係加功能，而係將現有 Grammar 變得更清楚、更公平、更有學習曲線。

[1]: https://github.com/fol2/ks2-mastery/pull/339 "docs(regression-sweep): completion report — 14→0 failures, 9 PRs, 3.5h by fol2 · Pull Request #339 · fol2/ks2-mastery · GitHub"
[2]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/platform/game/monsters.js "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/platform/game/mastery/grammar.js "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/shared/grammar/confidence.js "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/grammar/components/GrammarSetupScene.jsx "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/grammar/components/grammar-view-model.js "raw.githubusercontent.com"

---

同意，呢個改法更好。

我會將 monster progression 改成：

**0 Stars = Not found yet**
**1 Star = Egg found**
**15 Stars = Hatch**
**35 Stars = Evolve 2**
**65 Stars = Evolve 3**
**100 Stars = Mega**

咁樣就清楚好多：小朋友一開始有一個早期成功，就即刻見到「我搵到隻蛋」。之後先慢慢養大隻 monster。呢個比「等到 secure 先有蛋」好，因為 secure 本身已經係一個比較後期、比較穩定嘅學習狀態；如果蛋都要等到 secure，早期 motivation 會太慢。

我會保留你講嘅重點：**Egg 易攞，Mega 難但 achievable。**

## 更新後嘅 Monster Star Curve

新版本應該係：

| Stars | Stage     | Child-facing meaning |
| ----: | --------- | -------------------- |
|     0 | Not found | 仲未搵到                 |
|     1 | Egg found | 搵到隻蛋                 |
|    15 | Hatch     | 孵化                   |
|    35 | Evolve 2  | 長大一階                 |
|    65 | Evolve 3  | 接近 Mega              |
|   100 | Mega      | 完全進化                 |

呢條 curve 仍然係 non-linear：

1 → 15 最容易，因為要畀小朋友快啲有成功感。
15 → 35 需要更多穩定練習。
35 → 65 開始要求不同題型、不同情境都做到。
65 → 100 最難，要有 secure + later retention，但唔應該難到放棄。

## Star 點樣攞？

我會改成：**Star 係學習證據，不是每答一題 +1 XP。**

但第一粒 Star 要容易攞。

建議規則：

第一粒 Star 可以由以下其中一種觸發：

1. 第一次 independent first-attempt correct；或者
2. 在 Learn / Worked / Faded 後，完成一條 clean retry；或者
3. Mini Test 中有一條相關 concept 答啱。

即係唔需要 secure。只要系統有一個合理學習證據，就可以畀 1 Star，然後 catch egg。

但之後的 Stars 要慢慢嚴格：

| Evidence                           | Star role            |
| ---------------------------------- | -------------------- |
| First win                          | 拎到第一粒 Star，catch egg |
| Repeat independent success         | 慢慢加 Stars            |
| Different template / question type | 加更多 Stars            |
| Concept reaches secure             | 加一批 Stars            |
| Retention after secure             | 後段大 Stars，推向 Mega    |

呢個好處係：小朋友初期唔會等太耐，但後面仍然需要真正 mastery。

呢個仍然符合我哋一直講嘅 learning loop：先有真實嘗試，之後有簡短 feedback，需要時先有 worked/faded support，再 retry，再 spaced return。Star 應該獎勵呢啲有效學習證據，而唔係純粹刷題數量。

## 更新後嘅 Phase 5 Plan 重點

我會將 plan 改成：

**Grammar Phase 5 — 1-Star Egg, 100-Star Monster Curve & Landing Simplification**

Scope 不變：

No new content.
No new learning modes.
No answer-spec migration.
No contentReleaseId bump unless marking behaviour changes.
This phase only changes landing clarity and reward progression display.

## Revised U1 — 1 Star catches the Egg

新 rule：

```js
0 Stars = not caught
>= 1 Star = caught egg
```

不再用：

```js
first secure concept = caught egg
```

Acceptance criteria：

任何 active Grammar monster 攞到第 1 粒 Star，就顯示 Egg found。

第一粒 Star 不需要 concept secure。

Writing Try 不給 Star。

AI explanation 不給 Star。

純粹打開 lesson / read explanation 不給 Star。

Wrong answer 不給 Star。

## Revised U2 — 100-Star common scale

所有 active monsters 都係：

```js
starMax: 100
```

包括：

Bracehart
Chronalyx
Couronnail
Concordium

Display 一律：

`23 / 100 Stars`

咁小朋友同大人都容易明白。

## Revised U3 — Non-linear stage thresholds

固定 thresholds：

```js
const GRAMMAR_STAR_STAGE_THRESHOLDS = {
  egg: 1,
  hatch: 15,
  evolve2: 35,
  evolve3: 65,
  mega: 100,
};
```

Stage copy：

0 Stars: “Not found yet”
1–14 Stars: “Egg found”
15–34 Stars: “Hatched”
35–64 Stars: “Growing”
65–99 Stars: “Nearly Mega”
100 Stars: “Mega”

## Revised U4 — Star weighting

我會調整上次提過嘅 evidence weighting，令第一粒 Star 更早出現。

不是：

First independent win = 5% of concept budget

而係：

First valid learning evidence = at least 1 displayed Star.

之後才用 budget / normalized scoring 慢慢加上去。

例如：

```js
firstValidWin: grants at least 1 Star
repeatIndependentWin: adds small Stars
variedPractice: adds more Stars
secureConfidence: adds bigger Stars
retainedAfterSecure: adds largest Stars
```

即係「第一粒 Star」係 guarantee catch egg；但「後面 99 Stars」仍然要靠真正掌握。

## Revised U5 — Concordium 都跟 1-Star Egg

我會跟你今次意思改埋 Concordium：

**Concordium 也可以 1 Star = Egg found。**

但 Concordium 後面會升得慢，因為佢的 100 Stars 應該來自全 18 concepts 的 aggregate evidence，而不是單一 cluster。

所以：

一開始可能小朋友見到 Concordium Egg。
但 Hatch / Evolve / Mega 會慢好多。
Mega 仍然要 whole-subject mastery。

呢個比之前「Concordium 要 6 secure concepts 先出蛋」更一致，也更易理解。

## Revised U6 — Landing Page copy

Landing Page monster strip 可以好簡單：

Bracehart — Egg found — 1/100 Stars
Chronalyx — Not found yet — 0/100 Stars
Couronnail — Hatched — 18/100 Stars
Concordium — Egg found — 2/100 Stars

加一句 child-friendly copy：

**“Get 1 Star to find the Egg. Reach 100 Stars for Mega.”**

呢句夠清楚。

成人版可以再補：

“Stars come from correct practice, varied questions, secure skills, and later review.”

但 child landing 唔需要解釋太多。

## Revised tests

要加 / 改 tests：

0 Stars shows Not found.

1 Star shows Egg found.

1 Star does not require secure confidence.

1 Star does not require secure concept count.

15 Stars shows Hatched.

35 Stars shows Evolve 2 / Growing.

65 Stars shows Evolve 3 / Nearly Mega.

100 Stars shows Mega.

Couronnail can go through every stage and no longer jumps straight to Mega.

Concordium also follows 1-Star Egg rule.

Writing Try gives 0 Stars.

AI explanation gives 0 Stars.

Worked/faded support can contribute only after a valid retry, not just by viewing support.

Legacy caught monsters remain caught.

No existing visible stage is downgraded.

## Final adjusted principle

我會咁寫死喺 plan 入面：

**Egg is encouragement. Mega is mastery.**

所以 Egg 要容易，1 Star 就夠。
但 Mega 要慢慢嚟，要有 repeated, varied, spaced evidence。

呢個係最好 balance：小朋友早期有成功感，大人又清楚見到 100-Star curve，系統亦唔會變成純刷題 XP。
