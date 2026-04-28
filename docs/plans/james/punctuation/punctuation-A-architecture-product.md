# Punctuation A — 架構與產品契約

版本：P7 後產品審核草案  
範圍：只討論 KS2 Webapps 入面嘅 **Punctuation** subject  
目的：俾下一位產品 / learning / design / engineering agent 快速理解「我哋究竟想做咩、點解咁做、而家做到邊、仲有咩界線唔應該踩過」。

---

## 0. 一句總結

Punctuation 唔應該係「做幾條標點題攞怪獸」；佢應該係一個幫小朋友逐步掌握 **句子邊界、語氣、直接引語、comma flow、apostrophe、structure punctuation、proofreading and repair** 嘅 learning system。

Game layer 只係幫小朋友睇得見進度、保持動機、建立長線目標。真正嘅核心係：小朋友能否喺真句子入面 **notice punctuation need、choose correct mark、place it accurately、repair mistakes、and transfer to writing**。

P7 後，Punctuation 已經有比較完整嘅 learner journey、100-Star evidence model、Monster progress、Punctuation Map、diagnostic/debugging surfaces 同 Worker-backed runtime。但產品上仍然要守住幾條線：

- 唔可以令 Monster 進度快過 learning evidence。
- 唔可以將 Stars 當成 XP 或 click reward。
- 唔可以用 game UI 蓋過學習目的。
- 唔可以將 Grammar 同 Punctuation 混成同一個 mastery ledger。
- 唔可以話「全 GPS skill 已完成」而實際只係 Punctuation 自己成熟。

---

## 1. Learner Perspective：由 first principles 出發

### 1.1 我哋想小朋友最後做到咩？

Punctuation 嘅終極目標唔係「識講標點名」，而係小朋友可以喺 KS2 level writing / reading / GPS context 入面做到以下能力：

1. **讀懂句子結構同語氣**  
   知道一句話幾時完、幾時係問題、幾時係驚嘆、幾時係直接說話。

2. **選擇合適 punctuation mark**  
   例如 full stop、question mark、exclamation mark、comma、apostrophe、inverted commas、colon、semicolon、dash、hyphen、parentheses、bullet punctuation。

3. **放喺正確位置**  
   唔只係識揀 mark，而係識將 mark 放喺句子入面正確位置，例如 speech punctuation 入面 question mark 要喺 closing inverted comma 之前。

4. **修正錯誤 punctuation**  
   見到 comma splice、missing speech punctuation、apostrophe misuse、sentence boundary error，可以 repair。

5. **用喺真 writing / transfer context**  
   小朋友唔應該只係喺 isolated quiz 入面識做；要逐步能夠喺 sentence combine、paragraph repair、GPS-style check、transfer rewrite 入面保持正確。

### 1.2 我哋點樣做到？

Punctuation 目前用幾個層次去支持呢個目標：

| 層次 | 做咩 | 點解需要 |
|---|---|---|
| Smart Review | 自動揀 due / weak / fresh punctuation practice | 小朋友唔需要自己判斷今日做咩 |
| Guided practice | 當一個 skill 未穩時俾短 rule / example / support | 減少一開始亂撞答案 |
| Wobbly Spots | 專注最近弱項 | 快速 repair misconceptions |
| GPS Check | Test-like delayed feedback | 模擬 GPS checking，避免即時提示造成假掌握 |
| Punctuation Map | 顯示 14 skills 狀態同可 practice | 俾小朋友知道自己喺邊 |
| Summary | 回顧今次做咗咩、邊度要再試、Monster 有冇進步 | 將一 round practice 變成可理解嘅 progress |
| Star projection | 用 evidence 轉化成可見進度 | 防止一題啱就假裝 mastery |

### 1.3 我哋應用咗咩 learning theory？

Punctuation 嘅 product contract 其實係幾個 learning ideas 混合出嚟：

#### Spaced retrieval

同一個 skill 唔係今日做啱就算；要隔一段時間再抽返出嚟做，先知道有冇入 long-term memory。Punctuation scheduler / Star model 入面有 spaced clean dates、secure / deep-secure gate、recent lapse 等概念。

#### Interleaving / mixed practice

Punctuation 唔應該永遠按一個 skill 一組做晒。例如 apostrophe、speech、commas、sentence boundaries 應該喺 Smart Review / GPS / mixed context 入面交錯出現。咁先知道小朋友係真係識揀，而唔係因為一早知道今 round 只考 apostrophe。

#### Specific feedback

Feedback 要短、具體、指向下一步。例如「The question mark needs to stay inside the speech marks」比「wrong」有效。Punctuation Session / Feedback 設計應該保持：一個 answer，一個清楚 nudge，一個 next action。

#### Scaffolding and fading

Guided mode 可以俾 support，但 supported correct answer 唔應該等同 secure。系統要分清楚：有 support 下做到，係 learning；冇 support、隔一段時間、mixed context 仍然做到，先係 secure / deep secure。

#### Near retry and delayed return

錯咗之後可以有 near retry 修正 misconception，但真正 secure 要靠 delayed return。Punctuation 唔應該鼓勵即日重刷同一類簡單題就攞 Mega。

#### Transfer

標點最終係 writing skill。Sentence combine、paragraph repair、transfer rewrite 呢啲係由 quiz 過渡去 writing 嘅中間層。P7 後仍然有一個明確 follow-up：GPS / transfer context 要更完整入 Star evidence，而唔只係 practice UI 入面存在。

### 1.4 點解呢套方法應該達成目標？

因為標點能力唔係單一記憶，而係「認知句子結構 + 選 mark + 放位置 + proofread + transfer」。

如果只用 quiz correctness，會出現三個問題：

1. 小朋友可能靠 pattern recognition 撞中。
2. 同一日重複做同類題會有 false fluency。
3. Game progress 會快過真實能力。

而 Punctuation 目前嘅 design 將 learning evidence 拆細：attempts、item memory、facet memory、reward units、spaced dates、support level、mixed / GPS / transfer context。Star / Monster 只係呢啲 evidence 嘅 visual projection。咁做嘅好處係：孩子見到進步，大人可以信進步背後有學習證據。

---

## 2. 我哋 aim to do 同 aim not to do

### 2.1 Aim to do

Punctuation 要做到：

- 幫小朋友建立 KS2 punctuation skill map。
- 透過短 round 令每日 practice 清楚、低壓、可完成。
- 用 Smart Review 自動安排 due / weak / fresh items。
- 用 Punctuation Map 顯示 14 skills 嘅狀態。
- 用 Stars / Monsters 顯示長線進度，但唔扭曲 learning。
- 用 deterministic marking 保持公平同可 debug。
- 用 Worker command runtime 保持 production mutation / reward / redaction 安全。
- 俾 parent / admin / operator 有足夠 diagnostic 去理解「點解未 Mega」。

### 2.2 Aim not to do

Punctuation 唔應該做：

- 唔應該係 raw quiz farm。
- 唔應該一題啱就 secure。
- 唔應該將 Monster reward 當成主要 learning authority。
- 唔應該將 Stars 派俾 click、login、speed、或者單純完成。
- 唔應該喺 browser ship production marking / scheduler / answer bank。
- 唔應該用 AI 做 authoritative marking。
- 唔應該將 Grammar progress 同 Punctuation progress 混埋同一條 mastery ledger。
- 唔應該令 Grand Monster Quoral 變成早期免費獎品。
- 唔應該喺 child UI 顯示 technical fields：release id、mastery key、validator、accepted answers、facet raw code、hidden queue。

---

## 3. Tracking：我哋點知道小朋友真係進步？

### 3.1 目前追蹤嘅層次

Punctuation 目前 tracking 應該分成以下層次：

| Tracking 層 | 意義 |
|---|---|
| Attempt log | 小朋友試過咩、是否 independent、support level、mode/context |
| Item memory | 某 item / item family 是否穩 |
| Facet memory | 某 misconception / punctuation facet 是否反覆錯 |
| Reward unit | 14 個 published punctuation reward units 是否 secure / deep-secure |
| Star projection | 用 evidence 投影成 0–100 Stars |
| Codex high-water | Child-facing display 不倒退，避免 motivational drop |
| Telemetry | card opened、session start、feedback、summary、map、monster progress 等 product health |
| Diagnostic / Punctuation Doctor | Admin/operator 查看 safe reason：點解未升、邊個 gate block |

### 3.2 中間 hardening steps 是否已經成為 tracking / support？

大部分已經係：

- Landing Page 已經改成 mission dashboard，而唔係 button wall。
- Punctuation Map 已經成為 Word Bank-like status surface。
- Star model 已經由 raw unit percentage 改成 evidence-gated 100-Star projection。
- P7 後已經有 canonical manifest，減少 skill/monster/reward mapping drift。
- P7 後有 Punctuation Doctor，幫 admin/debuggers 理解 star / gate / blocker。
- Telemetry 已經有 event ingestion、allowlist、rate limit、audit trail；但 dashboard / alerting 仍未等於完整 product analytics。

仍然要小心嘅 tracking gap：

- GPS / transfer context 入 Stars 仍然係 deferred / not fully proven。
- Pattern-based Star boosts 仍然 deferred。
- Star economy 仍然需要同 Spelling 對齊 balance。
- Desktop/tablet Playwright visual matrix 未完成。
- In-session pending proof 未完全做完。

---

## 4. Learner journey：一個小朋友應該點樣經歷 Punctuation？

### 4.1 Landing

小朋友入 Punctuation 時，第一眼應該見到：

- 今日 mission。
- 一個清楚 primary CTA。
- 幾個簡單狀態：Due、Wobbly、Grand Stars。
- Pealark / Claspin / Curlune / Quoral 嘅 Star progress。
- Punctuation Map 入口。

Landing 唔應該係一堆同級 button。Smart Review 係 default journey；Wobbly Spots / GPS Check 係 secondary。

### 4.2 Practice session

Session 應該一題一題清楚呈現：

- Header：第幾題、skill、mode。
- Question card。
- 正確 input：choice / edit sentence / blank combine answer / paragraph repair。
- GPS mode 顯示 Save answer，同埋清楚講答案最後先 review。
- Guided support collapsed，唔應該一開始塞太多 explanation。

### 4.3 Feedback

Feedback 要短：

- Correct：簡短 positive feedback。
- Almost / Incorrect：一個具體 nudge。
- Optional model answer。
- Continue / Try another。

唔應該喺 child UI 變成 report。

### 4.4 Summary

Summary 應該講：

- 今次做咗幾多。
- 哪些 skill 練過。
- 哪些要再試。
- Monster / Stars 有冇更新。
- 下一步：wobbly spots / map / another round / dashboard。

### 4.5 Punctuation Map

Punctuation Map 係 Punctuation 版本嘅 Word Bank。小朋友可以：

- 睇 14 skills。
- 按 monster group 睇。
- 用 All / New / Learning / Due / Wobbly / Secure filter。
- 打開 skill detail。
- 開 focused practice。

Map 係 status + agency surface，唔係 admin report。

---

## 5. Grammar vs Punctuation：GPS learning process 入面點分清楚？

### 5.1 分工

Grammar 同 Punctuation 都係 GPS 重要部分，但 learning contract 唔同。

| 範疇 | Grammar | Punctuation |
|---|---|---|
| 核心問題 | 句子點樣由 words / phrases / clauses / tenses 組成 | 標點點樣令句子 boundary、voice、flow、structure 清楚 |
| 學習對象 | word class、clause、phrase、tense、agreement、sentence type、grammar relations | full stops、commas、apostrophes、speech marks、colon、semicolon、dash、hyphen、parentheses、bullet punctuation |
| 錯誤類型 | grammar concept / sentence structure misconception | punctuation placement / mark choice / boundary / clarity error |
| Practice style | identify, transform, classify, fix grammar structure | insert, choose, fix punctuation, combine, paragraph repair, GPS check |
| Reward ledger | Grammar-owned Stars / Monsters | Punctuation-owned Stars / Monsters |

### 5.2 點樣合併成完整 GPS skill？

合併應該發生喺 **practice orchestration / assessment / reporting layer**，唔係將兩科 mastery ledger 混埋。

正確方向：

- Punctuation GPS Check 可以 test-like delayed feedback。
- Grammar 亦可以有自己 GPS-style check。
- 未來可以有 cross-subject GPS mission，揀 Grammar + Punctuation + Spelling ready tasks。
- Parent/Admin 可以顯示整體 GPS readiness，但 drill-down 必須分開 Grammar / Punctuation / Spelling evidence。
- Writing / transfer task 可以同時涉及 grammar and punctuation，但 scoring / reward 要清楚拆分：邊個 evidence 屬於 Grammar，邊個屬於 Punctuation。

避免：

- 唔好因為 Punctuation 做得好就提升 Grammar monster。
- 唔好因為 Grammar correct 就派 Punctuation Stars。
- 唔好用一個「GPS score」取代 subject-level evidence。

---

## 6. Game Perspective：learner first, game second

### 6.1 Game layer 要交付咩？

Game layer 要做四件事：

1. **Progress visibility**  
   將 invisible learning evidence 變成小朋友睇得明嘅 Stars / Monster state。

2. **Long-term motivation**  
   俾小朋友見到 Pealark、Claspin、Curlune、Quoral 慢慢成長。

3. **Emotional safety**  
   唔因一次錯就怪獸退化；用 high-water / monotonic display 保護 child-facing progress。

4. **Goal clarity**  
   100 Stars = Mega。小朋友知道長遠目標，但每次 practice 都有細進步。

### 6.2 Game mechanisms

目前 Punctuation game model：

| Mechanism | Product meaning |
|---|---|
| Bellstorm Coast | Punctuation 世界觀 |
| Pealark | Endmarks + Speech + Boundary family |
| Claspin | Apostrophe family |
| Curlune | Comma / Flow + Structure family |
| Quoral | Grand Punctuation monster |
| Stars | Subject-owned learning evidence projection |
| 100 Stars | Direct monster Mega target |
| Grand Stars | Quoral cross-monster / deep evidence target |
| Codex high-water | 已顯示 progress 不倒退 |
| Star-evidence events | 將 learning evidence change 連去 reward narrative |

### 6.2.1 Direct monster display-state contract

之前 P5 / P6 已經定過 direct monster 嘅 child-facing rule：

| Display state | Star threshold | Product meaning |
|---|---:|---|
| Not caught | 0 Stars | 未有 meaningful evidence；subject landing / Codex 應該灰化，避免似已遇到 |
| Egg Found | 1+ Stars | 小朋友已有 genuine start；見到蛋、active visual、但未代表 secure |
| Hatch / Evolve / Strong / Mega | 10+ / 30+ / 60+ / 100 Stars | 越後面越需要 stronger evidence、spaced / mixed / deep secure gate |

`Egg Found` 係 first-found display state，不等於 first secured reward unit。
Subject landing、Codex card、Home dashboard / MonsterMeadow 唔可以用 first secured reward unit 先判斷是否 found；必須跟 `displayState`。
同樣，Hatch / Evolve / Strong / Mega 嘅 child-facing display 都要跟 Star-derived `displayStage` / `displayState`，唔可以跌返去 mastered-count stage。

Reward narrative 決定：

- Event kind 統一跟 Spelling 既有 vocabulary：first-found reward event 用 `caught`。喺 Punctuation，`caught` 喺 first Star / first `displayState: egg-found` moment 觸發；child-facing label 仍然可以係 Egg Found。呢個係 emotional safety moment：小朋友知道自己已經搵到蛋；toast 可以即時出，但 overlay celebration 要跟其他 monster celebration 一樣排到 session end。
- `caught` 只可以由 genuine Star evidence 觸發；skip、empty、duplicate replay、unsupported fake attempt、telemetry-only event 都唔可以 mint egg。
- Punctuation 唔再需要 legacy first-secured `caught` celebration；first-secured reward unit 只應該透過 Star/display-stage transition 觸發 Hatch / Evolve / Strong / Mega（如有 stage advance）。
- 所有 monster celebration overlay animation（Egg Found / Hatch / Evolve / Strong / Mega）要留到 session end，避免題目中途打斷 learning flow。State update / analytics event / toast 可以即時記錄，但 visual animation 應該 queue 到 Summary / session end 先播。
- Codex display 仍然要跟 `displayState`，唔可以跟 legacy `caught` boolean。

### 6.3 Game aim

Game aim 係：

- 令小朋友願意返嚟練。
- 令小朋友明白自己進步緊。
- 令 parent / teacher 相信 Monster growth 背後有 learning evidence。
- 令 difficult skills 有正面目標，而唔係只係「錯咗再做」。

### 6.4 Game avoid

Game 必須避免：

- per-question XP。
- raw completion farming。
- same-day grinding to Mega。
- Monster stage overlap / too-fast Mega。
- child-facing downgrades。
- loot-box / random reward / pressure economics。
- Grand Monster 太早正式 caught。
- Game state 直接控制 learning scheduler。

### 6.5 點樣 blend 入 learning？

正確 blend 係：

1. Subject engine 決定 learning evidence。
2. Star projection 將 evidence 轉成 visible Stars。
3. Monster layer 讀 Stars / high-water。
4. UI 只展示 child-friendly status。
5. Diagnostic surface 解釋 safe blocker。

Game 不應該派 learning evidence；Game 只應該展示 learning evidence。

---

## 7. Punctuation 現時 product truth

### 已經比較成熟

- 14-skill published Punctuation map。
- Smart Review / Guided / Wobbly / GPS practice flow。
- Punctuation Map。
- 100-Star direct monster model。
- Quoral Grand concept。
- Child-facing landing dashboard。
- Worker-owned production runtime。
- Redacted read models。
- Telemetry pipeline foundation。
- Punctuation Doctor foundation。

### 未應該過度 claim

- 唔應該話 GPS overall mastered；Punctuation 只係 GPS 入面一部分。
- 唔應該話 all transfer/GPS evidence fully drives Stars；P7 report 仍然列為 deferred。
- 唔應該話 Star economy 已經完全 balanced against Spelling；仍要校準。
- 唔應該話 telemetry 已經有 full dashboard/alerting；目前較似 ingestion/query foundation。
- 唔應該話 Quoral Grand backend 已完全無歧義；report 有 shadow/backend follow-up wording，需要工程再核實。

---

## 8. 下一步產品原則

如果之後繼續做 Punctuation，我建議只做 hardening / truth reconciliation，唔加新功能：

1. GPS / transfer context 要入 Star evidence，並有明確 correctness / quality gate。
2. Quoral Grand Stars 要完全釘死：backend、UI、docs、events 一致。
3. Star thresholds / wording 要同 docs 完全一致。
4. Punctuation Map / Summary / Landing / Codex / Home dashboard / MonsterMeadow 要用同一個 stage label / Star source / display state。
5. 需要用 real Worker journey + visual baseline 證明 child flow。
6. Parent/Admin 要能夠解釋「點解未 Mega」，但 child UI 保持簡潔。

---

## 9. 參考過嘅 repo / docs

- `docs/plans/james/punctuation/punctuation-p7-completion-report.md`
- `docs/punctuation-production.md`
- `src/subjects/punctuation/punctuation-manifest.js`
- `src/subjects/punctuation/star-projection.js`
- `src/subjects/punctuation/components/PunctuationSetupScene.jsx`
- `src/subjects/punctuation/components/PunctuationSessionScene.jsx`
- `src/subjects/punctuation/components/PunctuationSummaryScene.jsx`
- `src/subjects/punctuation/components/PunctuationMapScene.jsx`
- `worker/src/subjects/punctuation/commands.js`
- `worker/src/subjects/punctuation/read-models.js`
- `worker/src/subjects/punctuation/diagnostic.js`
- `worker/src/subjects/punctuation/events.js`
- `src/platform/game/mastery/punctuation.js`
- `src/platform/game/mastery/shared.js`
- `src/platform/game/monsters.js`
- `src/surfaces/home/HomeSurface.jsx`
- `src/surfaces/home/data.js`

外部 learning references used for product reasoning:

- Education Endowment Foundation, feedback guidance / feedback blog.
- Australian Education Research Organisation, spacing and retrieval practice guide.
