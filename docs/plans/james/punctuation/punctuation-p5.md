你呢個補充係好重要，而且我會修正我之前個方向：**唔應該用 XP 做 Punctuation reward。用 Star 會好過 XP。**

原因好簡單：XP 聽落似 RPG 內部數值，小朋友未必知道「差幾多先升」。Star 就清楚好多：**100 Stars = Mega**。小朋友明，大人都明。最重要係，Star 可以同 learning evidence 綁死，唔係純粹答多幾題就衝上去。

我先做 review，然後寫下一 phase plan。

## Review：而家 Punctuation 最大問題係「有功能，但 product contract 未定好」

Phase 4 report 話已經完成 visible child journey，目標係小朋友兩 tap 可以入到 Punctuation question，見到 status、monster progress、child-register feedback，同埋有 telemetry trail。呢個係真修咗 bug，但你而家指出嘅問題係另一層：**兩 tap 入到題，不等於 landing page 好用**。Phase 4 係修 entry path；但 landing page 仍然未有 Spelling 嗰種「今日做咩、點解做、monster 陪住你、你差幾遠」嘅感覺。([GitHub][1])

而家 Punctuation setup 的確仲係三張 primary cards：Smart Review、Wobbly Spots、GPS Check；每張 card 都係 action button，一按就 dispatch `punctuation-start`。另外有 Open Punctuation Map、round length toggle、monster strip。呢個結構解決咗之前「按咗冇反應」嘅 bug，但會製造另一個 UX 問題：小朋友未建立 mission，就突然被送入題目。([GitHub][2])

相比之下，Spelling setup 明顯成熟好多。佢有 “Where you stand”，有 “Open codex”，有 “Browse the word bank”，mode cards 係揀 journey，而最終有一個清楚 begin button。即係：Spelling 先俾小朋友理解自己位置，再開始；Punctuation 而家係先俾小朋友一堆入口。([GitHub][3])

你講 landing 一開始同做完 session 返去唔同，我認為要當 bug/UX regression 處理。技術上它可能係因為 fresh learner 時 render empty state，做完一 round 後有 evidence 就 render dashboard stats；但產品上唔應該令 landing 結構前後變樣。Landing 應該係同一個 skeleton，只係數字/mission 狀態更新，而唔係一開始一個版，做完又另一個版。

## Review：Monster 進階目前真係太快

而家 Punctuation monster denominator 好細：Pealark 5 units，Claspin 2 units，Curlune 7 units，Quoral 14 units。([GitHub][4])

但 Punctuation stage 計法係比例制：100% 就 stage 4，2/3 就 stage 3，1/3 就 stage 2，大過 0 就 stage 1；caught 亦係 `mastered >= 1`。所以 Claspin 只要 1/2 secure 就直接 stage 2，2/2 就 Mega。呢個就係你見到「好易直接 Mega」嘅根因。([GitHub][5])

Spelling 唔係咁。Spelling direct monster 用固定 thresholds `[1, 10, 30, 60, 100]`，而 stageFor 係按 mastered count 過 threshold 先升 stage。即係 Spelling 嘅節奏係：1 捉蛋，10 初步長大，30 再進化，60 高階，100 Mega。呢個同你講嘅長線 reward curve 係一致嘅。([GitHub][4])

所以我會判斷：**Punctuation reward 問題唔係 monster 數量問題，而係進階 metric 錯咗。** 用 reward-unit percentage 直接推 monster stage，對 Punctuation 呢種細 denominator subject 唔適合。

## Review：Secure 本身有一定門檻，但仍然唔夠支撐 Mega

Punctuation scheduler 其實唔係一題啱就 secure。memory snapshot 要 streak >= 3、accuracy >= 0.8、correctSpanDays >= 7 先入 secure bucket。呢個基礎方向係對嘅。([GitHub][6])

但問題係 reward unit secure 係由 item memory secure 觸發：當 `nextItemSnap.secure`，而該 rewardUnit 未寫入，就會把 masteryKey 寫入 `progress.rewardUnits`。呢個對「unit secured」可以接受，但對「monster Mega」太粗。Mega 應該代表跨 item mode、跨 template、mixed review、spaced return、possibly GPS/transfer 都穩，而唔只係該 unit 對應 item secure。([GitHub][7])

另外我仍然見到一個需要修嘅 read-model bug：`securedRewardUnits` 仍然等於 `publishedRewardUnits.length`，即 tracked/published units 被當成 secured units。呢個會令 landing / parent / dashboard 顯示錯誤信號，必須放入下一 phase。([GitHub][8])

## 我建議：Punctuation 改用 100-Star system，不用 XP

我建議下一 phase 將 Punctuation monster reward contract 定死：

**每隻 active direct monster 都係 100 Stars 滿分。100 Stars = Mega。**

Direct monsters：

Pealark = 100 Stars
Claspin = 100 Stars
Curlune = 100 Stars

Grand monster：

Quoral = 100 Grand Stars，但獲得方法更難，curve 更大。

呢個設計解決你講嘅三個問題。

第一，小朋友期望一致：任何 direct monster 都係 100 Stars Mega。唔會出現「Claspin 2 個 unit 就 Mega，但 Pealark 要 5 個」呢種心理唔舒服。

第二，大人易理解：100 Stars = 100 分制，但背後唔係考試分數，而係 evidence score。

第三，可以保留早期 reward：小朋友肯做，就可以好快得到 Egg；但要去 Mega，就一定要長期穩定。

## Star curve：唔 linear，但清楚

我建議直接沿用 Spelling 嘅精神，但改成 Star wording：

| Stage      | Direct monster threshold | Meaning                    |
| ---------- | -----------------------: | -------------------------- |
| Not caught |                  0 Stars | 未遇到                        |
| Egg Found  |                   1 Star | 做過一次有意義練習，搵到蛋              |
| Hatch      |                 10 Stars | 開始掌握，蛋孵化                   |
| Evolve 2   |                 30 Stars | 有穩定 evidence               |
| Evolve 3   |                 60 Stars | 多次、混合、spaced practice 都穩   |
| Mega       |                100 Stars | 該 monster family 真正 secure |

呢個唔係 linear。間距係 1 → 10 → 30 → 60 → 100。越後面越難。更重要係，後面嘅 Stars 唔可以靠重複刷簡單題得到。

我會再加一個 rule：**Stars 可以顯示 progress，但 stage gate 要用 learning evidence lock。** 即係：

有 100 Stars 但 evidence gate 未過，不可以 Mega。
有全部 unit secure 但冇 mixed / spaced / deep evidence，不可以 Mega。
有 supported/guided answer，可以加少量 learning Stars，但不可以直接推到 secure/Mega。

呢個就避免「玩數字」破壞 learning integrity。

## Stars 應該點樣獲得？

我建議分四類 Star，咁小朋友覺得有進度，大人又知道背後真係學習證據。

**1. Try Stars，最多 10 Stars**
完成短 round、有 genuine attempt、冇亂 skip，可以有少量 Stars。呢類 Stars 主要幫小朋友捉到蛋、孵化初段。小朋友肯做，就應該有 reward。

**2. Practice Stars，最多 30 Stars**
Independent first attempt 答啱、答錯後 near retry 修正、同一 skill 見過不同 item/template，就有 Stars。呢類 Stars 代表「開始練得入腦」。

**3. Secure Stars，最多 35 Stars**
要 spaced return、mixed review、accuracy 穩、streak 穩、冇近期 lapse。呢類 Stars 代表「唔係一次撞啱」。

**4. Mastery Stars，最多 25 Stars**
要 deep secure：mixed mode、GPS 或 transfer / rewrite context 入面仍然做到，並且最近冇 wobble。呢類 Stars 先係 Mega 最後一段。

背後 learning loop 應該繼續係：mixed retrieval、independent first attempt、brief corrective nudge、必要時先 support、near retry、之後 spaced mixed return。呢個方向同你之前提供嘅 KS2 learning design brief 一致：它強調 spacing、interleaving、independent attempt、specific feedback、worked/faded support、near retry 同 delayed return，而唔係純粹刷題。

## Claspin 應該點處理？

Claspin 只有兩個 direct units，所以絕對唔可以再用 `2/2 = Mega`。

新 contract 應該係：

1 Star：搵到 Claspin Egg。
10 Stars：Hatch。可以由做過 apostrophe contractions / possession 初步練習達成。
30 Stars：至少一邊有 independent secure evidence。
60 Stars：contractions 同 possession 都有 secure evidence，而且有 spaced return。
100 Stars：兩邊都 deep secure，在 mixed punctuation / sentence context 都穩。

咁即使 Claspin skill scope細，都有完整 learning curve。佢可以早啲俾蛋，但 Mega 一定要真正掌握。

## Quoral 應該點處理？

Quoral 係 Grand monster，所以唔應該第一個 punctuation unit secure 就好似直接 caught。可以早期做「shadow / watching」效果，但唔應該當成正式 Egg Found。

我建議 Quoral 用 100 Grand Stars，但 Grand Stars 唔係 direct monster Stars 相加。Grand Stars 要來自 breadth + deep secure：

| Quoral Stage      | Threshold | Gate                                                     |
| ----------------- | --------: | -------------------------------------------------------- |
| Locked / Watching |       0–9 | 有 direct monster progress，但未夠廣                           |
| Quoral Egg Found  |        10 | 至少 2 隻 direct monster 有 Egg/Hatch，並有 3+ secure units     |
| Hatch             |        25 | 三隻 direct monster 都有 progress，至少 6 secure units          |
| Evolve 2          |        50 | 至少 8 secure/deep-secure units，跨 Pealark/Claspin/Curlune  |
| Evolve 3          |        75 | 至少 11 secure/deep-secure units，GPS/mixed review 有證據      |
| Grand Quoral      |       100 | 全 14 units deep secure，三隻 direct monster 都 Mega 或近乎 Mega |

咁 Quoral 會真係似大 Boss，而唔係免費附送。

## Landing Page：我建議改成「Mission dashboard」，唔再係 button wall

下一版 Punctuation Landing 應該跟 Spelling 學，但唔係照抄。Spelling 成功係因為：上面有清楚 journey，中段有 where you stand，下面有 word bank / codex 入口，最後有一個清晰 CTA。([GitHub][3])

Punctuation landing 我建議改成：

```txt
Bellstorm Coast

Today’s punctuation mission
Help Pealark practise speech marks and sentence endings.

[Start today’s round]  ← 唯一 primary CTA

今日小狀態
Due today: 2
Wobbly: 1
Stars earned: 14

Your monsters
Pealark      Egg Found      8 / 100 Stars
Claspin      Not caught     0 / 100 Stars
Curlune      Hatch          12 / 100 Stars
Quoral       Watching       3 / 100 Grand Stars

[Open Punctuation Map]
See all punctuation skills.

More practice
Wobbly Spots
GPS Check
```

最重要改動：

第一，above the fold 只可以有一個主要 Start button。
第二，Smart Review 應該係 default mission，不係同 Wobbly/GPS 三個 button 平排同級。
第三，Wobbly Spots 只有真係有 weak evidence 先突出。
第四，GPS Check 係 check-up mode，應該放 secondary area。
第五，Accuracy / Secure / Due 唔好一開頭就大大格放上面；對小朋友嚟講唔係 mission。
第六，monster companion 要放返主視覺，唔好只係底下一條 `X/Y secure`。而家 active strip 顯示 `mastered/publishedTotal secure`，呢個對小朋友唔夠有感。([GitHub][2])

## 做完 session 返 Landing 不應該變成另一個 page

你講得啱，呢個要修。

我建議新 rule：

Landing layout 永遠一致。
Fresh learner：數字係 0，mission 係 “Find your first punctuation egg”。
做完一 round：同一個 layout 更新為 “Pealark gained 2 Stars” 或 “Speech marks need another go”。
完成今日：同一個 layout 更新為 “No due work now — come back tomorrow”。
Analytics loading：同一個 layout 用 skeleton / “checking progress”，唔好換版。

即係一開始同做完 session 回來，**內容可以更新，但版型唔可以突變**。

## 下一 phase plan：Punctuation Phase 5 — Stars, Landing, and Reward Hardening

我建議 Phase 5 只做 hardening / correction，不加新 practice mode，不加新 skill，不加 AI。

### P5-U1：定義 Star Reward Contract

新增一份明確 spec：

```txt
Punctuation direct monsters use 100 visible Stars.
100 Stars = Mega.
Egg is quick.
Mega requires deep secure evidence.
Quoral uses 100 Grand Stars with harder gates.
XP wording is not learner-facing.
```

Acceptance：

Direct monsters 全部使用 0–100 Stars。
UI 不顯示 XP。
UI 不顯示 `Stage X of 4` 作為主 wording。
孩子見到：Not caught / Egg Found / Hatch / Evolve / Strong / Mega。
家長見到：Stars + evidence explanation。

### P5-U2：改 Punctuation stage algorithm

停止用現時 ratio-based `punctuationStageFor(mastered,total)` 推 stage。這個 ratio system 係 Claspin 太快 Mega 嘅根源。([GitHub][5])

改為：

```txt
stage = stageFromStars(stars, gates)
```

Direct thresholds：

```txt
0 = Not caught
1 = Egg Found
10 = Hatch
30 = Evolve 2
60 = Evolve 3
100 = Mega
```

Acceptance：

Claspin 2/2 simple secure 不會自動 Mega。
Pealark 5/5 simple secure 不會自動 Mega，除非 evidence gates 過。
Curlune 7/7 simple secure 不會自動 Mega，除非 deep secure 過。
Quoral 不會因第一個 unit secure 就正式 caught。

### P5-U3：新增 Evidence-to-Stars projector

唔一定要即刻重寫 scheduler；可以先加 projection layer：

```txt
rewardUnits + attempts + item memory + facet memory + supportLevel + GPS/mixed/transfer flags
→ star ledger / star view
```

Star evidence fields：

```txt
meaningfulAttempts
independentCleanAttempts
supportedCleanAttempts
distinctItemIds
distinctTemplateFamilies
itemModesSeen
mixedReviewClean
gpsClean
transferClean
spacedCleanDates
recentLapseCount
secureUnits
deepSecureUnits
```

Acceptance：

Guided/support-only evidence 可以加 Try/Practice Stars，但不可直接 deep secure。
Independent first attempt 權重高。
Spaced mixed return 權重高。
Recent lapse 會扣住 Mega gate。
Same item repeated grinding 有 cap。
Same-day repeated easy answers 有 cap。

### P5-U4：設計 direct monster Star weights

每隻 direct monster都係 100 Stars，但 raw evidence 不同。

Pealark 有 5 units，所以每 unit 可以大約 contribute 20 final Stars，但要由 multiple evidence slots 組成。
Claspin 有 2 units，所以每 unit raw weight 大，但 Mega gate 要更嚴，避免 2 simple secure = Mega。
Curlune 有 7 units，所以每 unit raw weight 小，但 breadth 更自然。

Example Claspin：

```txt
First apostrophe attempt: +1, Egg Found.
Complete apostrophe mini-round: small Try Stars, capped.
Contractions independent secure: contributes to Practice/Secure.
Possession independent secure: contributes to Practice/Secure.
Mixed sentence context clean: required for late Stars.
Spaced return after 7+ days: required for 60+.
Both contractions + possession deep secure: required for 100.
```

Acceptance：

所有 direct monsters 進度心理上差不多。
Scope 小嘅 monster 唔會比 scope 大嘅 monster快幾倍 Mega。
Scope 大嘅 monster亦唔會慢到放棄。

### P5-U5：設計 Quoral Grand Star curve

Quoral 用 100 Stars，但更難賺。

Rule：

```txt
Quoral Stars are not direct Stars summed.
Quoral Stars come from breadth, cross-monster security, and deep evidence.
```

Acceptance：

Quoral 早期可以顯示 “Watching Bellstorm Coast”，但不當 caught。
Quoral Egg 需要至少兩個 direct monster 有 meaningful progress。
Quoral Mega 需要全 14 units deep secure。
Grand Stars 不會同 direct Stars 混淆。

### P5-U6：Landing Page v2

將 setup 改成 mission dashboard：

```txt
Hero: monster companion + Today’s mission
Primary CTA: Start today’s round
Progress row: compact Due / Wobbly / Stars
Monster row: 4 monsters with star meters
Map card: My Punctuation Map
Secondary practice drawer: Wobbly Spots / GPS Check / Change length
```

Acceptance：

Above the fold 只有一個 primary CTA。
小朋友不用理解 Smart / Weak / GPS 三個同級 choices。
Accuracy 不再係第一眼最大元素。
Secure Unit 不再用 adult metric 放大顯示。
Round length 不再似主 decision。
Punctuation Map 明顯係 Word Bank equivalent。

### P5-U7：Fix pre/post-session landing inconsistency

修同一 learner 一開始進入同做完 session 返回 landing 結構不同的問題。

Acceptance：

Fresh → after one session → after summary back：同一 dashboard skeleton。
只有 numbers、mission、monster stars 更新。
不會由 empty state 換成另一套 layout。
Snapshot / journey test 對比 layout landmarks 必須一致。

### P5-U8：修 read-model securedRewardUnits bug

`securedRewardUnits` 唔可以再等於 `publishedRewardUnits.length`。而家 read-model 有呢個錯誤信號。([GitHub][8])

改成：

```txt
publishedRewardUnits = 14
trackedRewardUnits = units with any evidence
securedRewardUnits = units with securedAt
deepSecuredRewardUnits = units passing deep secure projection
```

Acceptance：

Fresh learner：14 published, 0 tracked, 0 secured。
One attempt：tracked may increase, secured remains 0。
One secure event：secured = 1。
Deep secure：deepSecured = 1。
Landing / Parent / Admin 不再混淆 published vs secured。

### P5-U9：Reward surface copy cleanup

所有 child-facing reward copy 改成：

```txt
Not caught
Egg Found
Hatched
Growing
Strong
Mega
```

不要：

```txt
Stage 2 of 4
2/2 secure
publishedTotal
reward unit
XP
```

Summary 目前仍然會 render `Stage {stage} of 4`，要改。([GitHub][9])

Acceptance：

Setup、Summary、Map、Home、Codex 全部用同一套 stage labels。
小朋友見到 0–100 Stars meter。
大人可在 Parent/Admin 見到 evidence breakdown，但 child surface 不顯示 technical metric。

### P5-U10：Tests and journey proof

必須加：

```txt
Claspin cannot Mega from 2 simple secure units.
Claspin Egg appears early.
Pealark and Curlune use same 100-Star curve.
Quoral does not catch on first unit.
Grand Quoral requires breadth + deep secure.
Fresh landing and post-session landing share same landmarks.
Landing has exactly one primary CTA.
Wobbly/GPS are secondary, not equal-weight primary buttons.
Punctuation Map remains accessible and useful.
Reserved monsters never render learner-facing.
```

另外要有 visual/journey artefact：

```txt
Home → Punctuation Landing → Start today’s round → Question → Feedback → Summary → Back to Landing
```

成功標準唔係 test pass 就算，而係 screenshot/video 一眼睇到：landing 變清楚、有 monster、有 star target、有一個 start action。

## 我建議你哋先唔好動咩

唔好再加 mode。
唔好再加 monster。
唔好再加 report。
唔好加 AI explanation 入 child flow。
唔好用更多文字去解釋現在混亂嘅 buttons。

而家要做嘅係兩件事：

**第一，定死 Star economy，令 reward 有長線 learning curve。**
**第二，重做 landing hierarchy，令小朋友知道今日做咩、點開始、努力會令邊隻 monster 成長。**

我覺得你個 Star 方向係正確嘅。下一版 plan 我會以 **100 Stars = Mega** 做核心，而唔再用 XP 或 simple reward-unit percentage。

[1]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/punctuation/punctuation-p4-completion-report.md "raw.githubusercontent.com"
[2]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/punctuation/components/PunctuationSetupScene.jsx "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/components/SpellingSetupScene.jsx "raw.githubusercontent.com"
[4]: https://github.com/fol2/ks2-mastery/blob/main/src/platform/game/monsters.js "ks2-mastery/src/platform/game/monsters.js at main · fol2/ks2-mastery · GitHub"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/platform/game/mastery/punctuation.js "raw.githubusercontent.com"
[6]: https://github.com/fol2/ks2-mastery/blob/main/shared/punctuation/scheduler.js "ks2-mastery/shared/punctuation/scheduler.js at main · fol2/ks2-mastery · GitHub"
[7]: https://github.com/fol2/ks2-mastery/blob/main/shared/punctuation/service.js "ks2-mastery/shared/punctuation/service.js at main · fol2/ks2-mastery · GitHub"
[8]: https://github.com/fol2/ks2-mastery/blob/main/src/subjects/punctuation/read-model.js "ks2-mastery/src/subjects/punctuation/read-model.js at main · fol2/ks2-mastery · GitHub"
[9]: https://github.com/fol2/ks2-mastery/blob/main/src/subjects/punctuation/components/PunctuationSummaryScene.jsx "ks2-mastery/src/subjects/punctuation/components/PunctuationSummaryScene.jsx at main · fol2/ks2-mastery · GitHub"
