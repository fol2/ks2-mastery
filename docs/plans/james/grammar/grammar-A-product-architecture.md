# Grammar A — 產品與架構：Learner-first + Game-second Review

**範圍：**只涵蓋 Grammar subject。  
**狀態基準：**根據 repo 最新 main 上的 Grammar Phase 3–7 reports、Phase 5/6/7 invariants、Grammar Star / reward / dashboard / session / analytics 相關 code scan。  
**用途：**這份文件不是 implementation ticket。它是一份產品與架構層面的說明，讓下一個 agent、產品 reviewer、或工程 reviewer 明白 Grammar 這科「到底想做到甚麼、為何這樣做、怎樣知道有沒有做到」。

---

## 0. 一句話總結

Grammar 的產品目標不是「小朋友背到 grammar labels」，而是：

> 讓 KS2 learner 能夠在閱讀、句子理解、改寫、修正、測驗和短寫作中，穩定運用 Grammar knowledge；並且透過一個簡單、低噪音、孩子能理解的 interface，知道自己今日應該做甚麼、自己哪裡弱、哪些 skill 已經穩、以及 creatures 怎樣因為真實 learning evidence 而成長。

Game layer 的目標不是製造另一套學習真相，而是：

> 把真實 learning evidence 翻譯成清楚、可期待、不可刷假的 100-Star creature progress；Egg 給早期鼓勵，Mega 代表 durable mastery。

如果用最短 product contract 去講：

**Learner first. Game second. Stars reflect evidence. Rewards never replace learning.**

---

## 1. Learner perspective：我們由 first principles 想達成甚麼？

### 1.1 Grammar 在這個 webapp 入面的定義

Grammar 在這個 subject 入面不是完整 English writing engine。它是一個 KS2 Grammar / GPS mastery engine。

它處理的是：

- sentence functions
- word classes
- noun phrases
- adverbials
- clauses
- relative clauses
- tense / aspect
- standard English
- pronouns and cohesion
- formality
- active / passive
- subject / object
- modal verbs
- 以及五個 punctuation-for-grammar bridge concepts：parenthesis commas、speech punctuation、apostrophes possession、boundary punctuation、hyphen ambiguity

這些概念組成現時 Grammar 的 18-concept aggregate denominator。現時 deterministic content pool 是 51 templates，分成 selected-response 和 constructed-response 題型。這個 scope 的重點是 **grammar control**：小朋友能否認得、選得出、修得正、改寫得到、解釋到、在短寫作中嘗試使用。

它刻意不是：

- 不做 full作文自動評分。
- 不用 AI 生成 score-bearing questions。
- 不用 AI mark score-bearing free text。
- 不把 game progress 當成 mastery 本身。
- 不把 session volume、click count、view-only activity 當成學會。

### 1.2 我們真正想讓 learner 變成怎樣？

理想 learner 不是只會說「這是 relative clause」。理想 learner 應該可以做到以下幾件事：

第一，能夠 **recognise**。看到句子時知道某個 grammar feature 在哪裡，例如 relative clause、fronted adverbial、modal verb、passive voice。

第二，能夠 **discriminate**。不是只靠關鍵字，而是能分辨容易混淆的東西，例如 relative clause vs subordinate clause、subject vs object、apostrophe possession vs contraction、formal vs informal register。

第三，能夠 **repair**。當句子有錯，能夠修正。Grammar learning 如果只停留在多選題，會變成 recognition-heavy；所以 fix / rewrite / build 題型是必要的。

第四，能夠 **explain**。小朋友不需要寫成人式 grammar report，但要有能力簡短理解「為甚麼這個答案合理」。Explain 題型目前仍然偏少，是 future content expansion 的重點之一。

第五，能夠 **retain**。今日答對不是 mastery。隔一段時間仍然能夠在 mixed review 或 mini-test 做到，才叫穩。

第六，能夠 **transfer**。Grammar 最後不是為了玩題目，而是支援讀寫。Writing Try 已經作為 non-scored transfer lane 存在，讓小朋友嘗試把 grammar 用在自己的句子入面，但不自動改 mastery 或 reward。

### 1.3 我們用甚麼學習理論？

這科的設計主要用以下幾條 learning principles。這些不是裝飾，它們直接對應現在的 product flow 和 tracking model。

#### Retrieval practice

小朋友要先自己 recall / apply，而不是一開始就看答案或看 AI explanation。這就是為何 Smart Practice 的 first attempt 不應該 show worked solution、AI、similar problem 或 faded help。

#### Spaced retrieval

Grammar concept 需要隔一段時間回來做。Secure 不是一次 session 的高分；它需要 strength、streak、spacing、due / weak status 支持。Phase 6 之後，Mega 更需要 retainedAfterSecure 這類 post-secure temporal proof。

#### Interleaving / varied practice

Grammar 很多錯誤來自相似概念混淆。若只連續操同一個 template，小朋友可能只是 pattern match。所以 selector 和 Star evidence 要鼓勵不同 template / question shape 的 correct evidence。variedPractice 只可以由 correct evidence 觸發，wrong-only exposure 不算。

#### Worked examples and fading

Worked / faded support 有教學價值，但它不是同等的 independent mastery evidence。系統承認 support 可以幫 learning confidence，但不應 unlock firstIndependentWin、repeatIndependentWin 或 retainedAfterSecure 這類 full Star evidence。

#### Timely corrective feedback

錯答案要快些 correction，避免 misconception 強化。但 feedback 不應變成一大段 report。孩子需要短 nudge、retry、需要時再 support。

#### Transfer to writing

Writing Try 讓小朋友把 grammar 概念搬到自己的句子或短段落。這是 learning transfer 的入口，但現階段保持 non-scored，因為 deterministic paragraph scoring / teacher review 是另一個更大 scope。

#### Cognitive load and UI simplicity

Grammar 本身比 Spelling 更抽象。UI 必須更簡單，不是更複雜。Phase 5–7 的 one-primary-CTA landing、Grammar Bank、Star strip、child-safe labels，本質上是在降低 decision load。

---

## 2. Learner flow：小朋友入去應該 expect 甚麼？

### 2.1 Default route

小朋友入 Grammar，不應該首先被問「你想用哪一種教學策略」。

正確 flow 應該是：

1. Landing / Dashboard
2. 一個清楚 primary CTA：**Start Smart Practice**
3. 今日狀態：Due / trouble / secure / streak 等簡單 status
4. 四隻 active Grammar creatures 的 100-Star strip
5. Secondary links：Grammar Bank、Mini Test、Fix Trouble Spots
6. More practice：Learn、Sentence Surgery、Sentence Builder、Worked、Faded、Writing Try

這個 flow 的重點是：孩子可以一眼知道「按哪裡開始」。

### 2.2 Smart Practice

Smart Practice 是日常主要路徑。它背後應該混合：

- due review
- weak / trouble concepts
- recent misses
- under-secured question types
- 一點 fresh concept 或 breadth

孩子不需要知道 selector 的細節。孩子只需要見到一題、一個答案區、一個 submit。

Pre-answer state 應該是：

- no answer leakage
- no AI explanation
- no worked solution
- no similar problem
- no faded support unless explicitly in support mode

After answer state：

- correct：短 feedback + next
- wrong：短 nudge + retry
- repeated difficulty / requested help：faded / worked / similar problem

### 2.3 Fix Trouble Spots

這條路是針對需要 repair 的 concepts。它不應該是「罰你做錯題」，而應該是「我們回來修補最有價值的地方」。

它跟 Smart Practice 的分別是 focus：Smart Practice 管今日最佳 mix；Trouble Spots 更集中處理 weak / needs-repair concepts。

### 2.4 Mini Test

Mini Test 是測驗感，不是教學感。

未 finish 前：

- no feedback
- no hint
- no AI
- no worked solution
- no answer reveal

Finish 後：

- show score
- review answers
- queue missed / weak concepts for repair

Mini Test 的價值是讓小朋友練習 KS2-style timed / delayed-feedback setting。它不是讓孩子一邊拿 hint 一邊「測驗」。

### 2.5 Grammar Bank

Grammar Bank 是 Grammar 版的 Word Bank。

孩子應該用它看：

- 我有哪些 concepts？
- 哪些是 Trouble spot？
- 哪些是 Learning？
- 哪些是 Nearly secure？
- 哪些是 Secure？
- 我想練某一個 concept，可以怎樣開始？

Phase 7 已經將 “Due” child label 改成 “Practise next”，這是正確方向。因為如果沒有真正 schedule-due signal，孩子看到 “Due” 會以為這是 timetable-level due；“Practise next” 更誠實。

### 2.6 Writing Try

Writing Try 是 non-scored transfer lane。

它讓小朋友用 grammar 寫自己的句子或短段落。它應該幫助孩子：

- 把 concept 放入真句子
- tick checklist
- 保存 evidence
- 交給成人或未來 review flow

但現階段它不應該：

- 給 Stars
- 改 mastery
- 觸發 monster reward
- 改 retry queue
- 改 misconception status
- 讓 AI mark score-bearing paragraph

Writing Try 係 learning support，不是 mastery oracle。

---

## 3. 我們怎樣 track learning？

### 3.1 Learning state，不是 raw score

Grammar track 的不是單純「答對幾多題」。它 track 多層 evidence：

- concept mastery
- template evidence
- question type evidence
- generated item evidence
- misconceptions
- retry queue
- session state
- recent attempts
- support usage
- firstAttemptIndependent
- supportLevelAtScoring
- due / weak / confidence labels

這種 tracking 的意義是：同一個 80% accuracy 可以代表不同東西。孩子可能只是在同一 template drill 得熟，或者真的能跨 question type 應用。系統要分辨。

### 3.2 Confidence labels

Child side 用簡單 labels：

- New
- Learning
- Trouble spot
- Nearly secure
- Secure
- Check status

Adult / debug side 可以見更詳細 evidence：attempt count、recent miss、distinct template、confidence、Star debug。

### 3.3 Secure 的角色

Secure 仍然重要，但已經不屬於 monster reward event 的觸發條件。

Secure 表示 concept 已經有一定 strength、streak、spacing evidence。但 Phase 5 後，Mega 要 retainedAfterSecure，即是 secure 之後再隔一段時間仍然能 independent correct。

這樣做是正確的，因為 Grammar concepts 少。如果用 secure concept count 直接推 monster stage，就會出現小 denominator monster 太快 Mega 的問題。

因此 secure skills 是 learner understanding / scheduling / analytics 的 evidence；monster display 和 celebration 則只由 Stars / displayState 驅動。這個分離跟 Punctuation reward correction 後的 cross-subject contract 一致。

### 3.4 Stars 的角色

Stars 是 child-facing progress translation，不是 learning state 本身。

每隻 active Grammar monster 都用 0–100 Stars：

| Stars | Machine `displayState` | Grammar child-facing label |
|---:|---|---|
| 0 | `not-found` | Not found yet |
| 1+ | `egg-found` | Egg found |
| 15+ | `hatch` | Hatched |
| 35+ | `evolve` | Growing |
| 65+ | `strong` | Nearly Mega |
| 100 | `mega` | Mega |

`displayState` 是 cross-subject machine enum；Grammar 可以保留自己的 child-facing wording。Subject landing、Home dashboard、Codex、summary 和 monster CSS 都應 consume 同一個 `displayState`，不能各自用 legacy `stage >= 1` 或 secure count 重新 derive found / egg / monster。

Stars 來自五個 evidence tiers：

- firstIndependentWin
- repeatIndependentWin
- variedPractice
- secureConfidence
- retainedAfterSecure

重點是：**Star 是學習證據，不是每題 XP。**

### 3.5 Debug / adult explanation

Phase 7 加入 Star Debug Model 後，成人或工程 reviewer 應該可以回答：

「為甚麼 Bracehart 現在是 42 Stars？」

答案不應該是「因為 UI 算出來」。應該能追到：

- 哪些 concept 貢獻了 evidence
- 哪些 tiers unlocked
- 哪些 evidence 被 rejected
- displayStars 來自 live / highWater / legacyFloor
- 是否有 rolling window warning

這種 explainability 對 trust 很重要。家長可以信，工程也可以 debug。

---

## 4. Grammar 與 Punctuation：GPS 裏面怎樣分、怎樣合？

### 4.1 為何不能混成一科？

Grammar 和 Punctuation 在 KS2 GPS 入面有重疊，但學習行為不同。

Grammar 重點是：

- sentence structure
- word / phrase / clause relationships
- register and formality
- tense / voice / cohesion
- meaning and structure control

Punctuation 重點是：

- marks and boundary conventions
- punctuation precision
- sentence demarcation
- speech punctuation
- apostrophes / commas / hyphens as punctuation choices

如果兩者完全混成一科，孩子會不清楚自己是在學 structure 還是在學 marks。成人 report 亦會失去 diagnostic value。

### 4.2 為何 Grammar 仍然有 punctuation-for-grammar concepts？

Grammar 的 18 concepts 包含五個 punctuation-for-grammar bridge concepts。原因是某些 punctuation 是 grammar meaning 的表達工具。例如：

- parenthesis commas 支援 parenthetical grammar structure
- speech punctuation 影響 sentence interpretation
- apostrophes possession 涉及 noun relationship
- boundary punctuation 影響 clause / sentence boundary
- hyphen ambiguity 影響 meaning disambiguation

所以 Grammar 需要這些 concepts 來完成 full GPS-style grammar claim。

但這不代表 Grammar 吞併 Punctuation。

### 4.3 Punctuation subject 應該怎樣保持獨立？

Punctuation subject 應該是自己的 learning region / progression。它可以深入處理 punctuation conventions、precision、editing habits、marks placement、punctuation fluency。

Grammar 可以在自己的 tasks 入面使用 punctuation-for-grammar bridge；Punctuation 則把 marks 當成 subject focus。

### 4.4 怎樣 combine 成 whole GPS skill？

Product 上應該用三層看：

1. Grammar subject：structure and grammar control
2. Punctuation subject：marks and punctuation precision
3. GPS whole-skill view：成人 / dashboard 用 combined evidence 顯示 child 在 GPS 的整體 readiness

孩子的日常 flow 不需要見到太複雜的 GPS meta-layer。孩子只需要清楚：「今日做 Grammar」或「今日做 Punctuation」。成人 report 可以把兩者合併看，尤其用於 SATs / school readiness。

---

## 5. Game perspective：我們由 first principles 想做到甚麼？

### 5.1 Game 的真正用途

Game layer 的用途不是讓孩子為了 reward 而刷題。Game layer 的用途是：

- 把抽象 learning progress 變成孩子能看見的成長
- 給早期鼓勵，降低挫敗感
- 讓長期 mastery 有可見目標
- 讓成人也能理解 progress curve
- 不干擾 learning engine

### 5.2 Learner first, game second

這是不可妥協的排序。

Learning engine 決定題目、marking、support、retry、spacing、misconception。Game layer 只能讀 learning evidence，然後 projection 成 creature state。

Game layer 不應該：

- 改 mastery
- 改 scheduling
- 選題
- mark answer
- 讓孩子因為 reward 而跳過 hard learning
- 用 coins / streak pressure 取代 learning evidence

### 5.3 Active Grammar creatures

現時 active Grammar creatures 是：

- Bracehart
- Chronalyx
- Couronnail
- Concordium

Reserve creatures 是：

- Glossbloom
- Loomrill
- Mirrane

Reserve creatures 不應出現在 child-facing active Grammar progress。它們可以保留 asset / future option，但不應接收 active Grammar rewards。

### 5.4 Concept-to-monster mapping

Direct monsters 對應 direct grammar clusters：

- Bracehart：sentence architecture family
- Chronalyx：time / verb / flow family
- Couronnail：word / standard English / register family

Concordium 是 aggregate monster，吃全 18 Grammar concepts，包括 punctuation-for-grammar bridge concepts。

The five punctuation-for-grammar bridge concepts still belong to Grammar's
18-concept Concordium aggregate, but they also have direct monster ownership
for child-facing progress:

- Bracehart owns parenthesis commas, speech punctuation, and boundary punctuation.
- Couronnail owns apostrophes possession and hyphen ambiguity.

This keeps bridge practice from making the grand monster appear before any
corresponding direct monster. Concordium display is additionally gated: the
grand monster must stay `not-found` until at least two direct Grammar monsters
are already found. Stored Concordium high-water can remain for audit/backward
compatibility, but the child-facing egg can be taken back when it was produced
only by aggregate bridge evidence.

### 5.5 100-Star curve 為何好過 raw concept count？

Grammar concepts 太少。用 secure concept count 直接 staging 會令 small-denominator monsters 太快 Mega。例如三個 concepts 的 monster 可以很快從 early progress 跳到 Mega。

100-Star curve 解決了三個問題：

第一，孩子和成人有統一標準：100 Stars = Mega。

第二，不同 monster denominator 不同，但 display scale 一樣。

第三，Mega 不等於 secure count，而等於 broader learning evidence，尤其 retention evidence。

### 5.6 Egg 為何 1 Star 就給？

Egg 是 encouragement，不是 mastery。

如果蛋要等 secure，孩子可能要幾日甚至幾星期才見到第一個 creature reward。這太慢。1 Star Egg 代表「你已經有第一個真實 learning evidence」。

這給小朋友早期成功感，但不會令 Mega 變便宜，因為 100 Stars 仍然要 repeated、varied、secure、retained evidence。

Egg Found 的 celebration event 使用 unified monster event kind `caught`，語義是 first-found / first-Star，不是 first secure。Hatch / Growing / Nearly Mega / Mega 的 overlay celebration 由 Star threshold transition 觸發，並在 session end 播放；mid-session toast 目前暫時保留。

Concordium 是例外：它是 grand monster，不應該因為單一 bridge concept 或單一 direct family 率先出蛋。Concordium 的 raw Star latch 可以記住 aggregate evidence，但 child-facing `displayState` 要等至少兩隻 direct Grammar monsters 已 found 才可以離開 `not-found`。

### 5.7 Stars 為何不能是 XP？

XP 通常意味著「做多啲就加多啲」。Grammar 不應鼓勵刷題。

Star 的 contract 是：

- repeated same-tier evidence 不再加
- wrong-only exposure 不加
- Writing Try 不加
- AI explanation 不加
- view-only 不加
- supported answer 不當 independent evidence
- retainedAfterSecure 佔最大 weight

這樣 reward 才會支援 learning，而不是破壞 learning。

### 5.8 Game blend 入 learning flow 的方式

孩子在 landing 看：

- creature strip
- stage label
- X / 100 Stars
- next milestone

孩子在 summary 看：

- round result
- monster progress in Stars
- next action

成人在 analytics 看：

- Star explanation
- source: live / highWater / legacyFloor
- concept evidence tiers
- rejected categories

這個分層很好。孩子看 motivation，成人看 explanation，engine 保持 deterministic。

---

## 6. 我們想做與不想做

### 6.1 我們想做

- Daily Grammar flow 清楚，孩子可以一 click 開始。
- Smart Practice 由 system 幫孩子選最有價值的 practice。
- Grammar Bank 幫孩子知道每個 concept 狀態。
- Mini Test 提供 strict delayed-feedback practice。
- Writing Try 提供 non-scored transfer。
- Adult view 能看到 learning evidence，而不是只有 reward。
- Stars 代表真實 learning evidence。
- Monster progress 永不倒退。
- Debug model 能解釋每個 displayed Star。

### 6.2 我們刻意不做

- 不做 per-question XP。
- 不做 AI score-bearing marking。
- 不把 Writing Try 自動計分。
- 不讓 game layer control scheduling。
- 不把 Grammar 和 Punctuation 完全合併。
- 不用 raw concept count 作 child-facing monster progress。
- 不在 child UI 顯示 Worker、projection、denominator、read model 等 implementation terms。
- 不把 content expansion 混入 reward / UI hardening phase。

---

## 7. 我們有沒有完成中間 hardening steps？

大致上有，而且 P3–P7 形成了清楚序列。

### Phase 3：Child UX reset

把 Grammar 從混亂 control panel 變成 child-flow：Dashboard → Practise → Fix → Review → Grammar Bank。這一步是讓孩子「知道誰打誰」。

### Phase 4：Learning integrity hardening

驗證 independent attempt、mini-test strictness、wrong-answer repair、Writing Try non-scored、reward wiring 等 learning invariants。

### Phase 5：100-Star display curve

修正 small denominator monster curve，確立 1-Star Egg、100-Star Mega、Stars not XP、Mega requires retention。

### Phase 6：Star evidence authority

修正 Star pipeline trust defects：production attempt shape、wrong-only variedPractice、retention temporal proof、sub-secure persistence、1-Star Egg persistence、dashboard live evidence path。

### Phase 7：QoL/debug/refactor hardening

修 summary Star display、Writing Try AI gate、Due label、adult copy、shared dependency direction、debug model、deterministic event ID、concurrency contract、state seed fixtures、child-copy guards。

結論：Grammar 目前不只是「功能有了」。它已經有一套明確、測試化、可解釋的 learning + game contract。

---

## 8. 現在 product 形狀是否健康？

我的判斷：**健康，但未到 final finished subject。**

健康的原因：

- Learner flow 已經清楚。
- Game curve 已經可信。
- Stars 已經不是純 UI illusion。
- Debug / adult explanation 已經有基礎。
- Mini Test、Writing Try、Grammar Bank 各自邊界清楚。
- Grammar vs Punctuation 邊界有基本原則。

仍未 final 的原因：

- Thin-pool concepts 仍然存在。
- Explain 題型 coverage 偏少。
- Answer-spec migration 仍是 inventory/backlog。
- Persistent tier-level Star ledger 未做。
- Exact first-secure timestamp 仍是 estimate。
- Playwright state injection mechanism 未完整實裝。
- Writing Try 尚不是 scored transfer，也不應暫時假裝是。
- Grammar + Punctuation 的 GPS whole-skill adult view 還可以更正式。

---

## 9. 下一步產品方向，不是 implementation plan

如果只看產品，下一個大方向應該是：

1. 先決定是否進入 content reliability / content expansion phase。
2. 若進入，先補 active_passive、subject_object、pronouns_cohesion、formality、modal_verbs、hyphen_ambiguity 這些 thin-pool concepts。
3. 同時把 answerSpec migration 作為 content work 的 release discipline，而不是事後補救。
4. 實作 persistent tier-level Star ledger 和 exact firstSecureAt，令 debug / Star explanation 不依賴 bounded recentAttempts。
5. 保持 child flow 不加 complexity。即使內容多了，Landing Page 仍然只應該有一個 obvious primary action。

最重要一句：

**不要因為 Grammar 已經有 100-Star curve，就忘記 Stars 只是 learning evidence 的 translation。真正產品價值仍然是小朋友能否長期、混合、獨立、可遷移地使用 Grammar。**

---

## 10. 參考來源（repo + learning references）

Repo files reviewed:

- `docs/plans/james/grammar/grammar-phase7-implementation-report.md`
- `docs/plans/james/grammar/grammar-phase7-invariants.md`
- `docs/plans/james/grammar/grammar-phase6-implementation-report.md`
- `docs/plans/james/grammar/grammar-phase6-invariants.md`
- `docs/plans/james/grammar/grammar-phase5-implementation-report.md`
- `docs/plans/james/grammar/grammar-phase5-invariants.md`
- `docs/plans/james/grammar/grammar-content-expansion-audit.md`
- `docs/plans/james/grammar/grammar-answer-spec-audit.md`
- `shared/grammar/grammar-stars.js`
- `shared/grammar/grammar-star-debug.js`
- `shared/grammar/grammar-concept-roster.js`
- `shared/grammar/grammar-status.js`
- `src/subjects/grammar/components/grammar-view-model.js`
- `src/subjects/grammar/components/GrammarSetupScene.jsx`
- `src/subjects/grammar/components/GrammarSummaryScene.jsx`
- `src/subjects/grammar/components/GrammarAnalyticsScene.jsx`
- `src/subjects/grammar/session-ui.js`
- `src/subjects/grammar/event-hooks.js`
- `src/platform/game/mastery/grammar.js`
- `worker/src/subjects/grammar/commands.js`
- `worker/src/subjects/grammar/engine.js`
- `worker/src/subjects/grammar/read-models.js`

Learning references used for theory alignment:

- AERO, *Spacing and retrieval practice guide*.
- AERO, *Vary Practice: Space and vary tasks for guided and independent student practise*.
- The Learning Scientists, *Six strategies for effective learning*.
- Project-supplied KS2 learning-loop design notes.
