我先透明講：我照你建議試咗 clone / pull repo，但呢個 workspace 解析唔到 `github.com`，所以 clone 失敗：`Could not resolve host: github.com`。所以今次我係用 GitHub / raw file 重新掃最新 main、Phase 4 report、reward code、Grammar UI model、README 同 open PR 狀態。

結論係：**Grammar Phase 4 本身係做完，而且做得幾紮實；但成個 repo 目前唔可以簡單話「完全 production-ready / 可以收工」。** Grammar 功能已經係 Worker-backed、已經有 child UX、Grammar Bank、Mini Test、Writing Try、reward wiring、Playwright golden paths；但 repo 而家有 open regression sweep PR 講明 `main` 曾經有 14 個 `npm test` failures，所以我會將下一 phase 定為 **no-new-feature release hardening + monster progression audit**，唔好再加功能住。Phase 4 report 話 14 個 implementation units 全部 merge、Grammar test surface 到 562/562 passing，而且 Phase 4 係 integrity gate；但 open PR #323 又明確講 `main` 有 14 個 `npm test` failures，要 regression sweep 後先做到 final zero failures。([GitHub][1]) ([GitHub][2])

## 1. 小朋友入 Grammar，應該 expect 見到咩 flow？

而家正確 child flow 應該係咁：

小朋友入去會見到 **Grammar Garden dashboard**，唔應該見到 Worker、read model、Stage 1、denominator、evidence snapshot 呢啲 developer / adult 字眼。Dashboard 主要有四個大入口：**Smart Practice**、**Fix Trouble Spots**、**Mini Test**、**Grammar Bank**。Smart Practice 係 default，描述係「Due · weak · one fresh concept」；Fix Trouble Spots 係做常錯概念；Mini Test 係短 timed set，到最後先出 marks；Grammar Bank 係好似 Spelling Word Bank 咁樣，畀小朋友睇自己每個 grammar concept 嘅狀態。([GitHub][3])

下面有「More practice」但係 secondary：**Learn a concept**、**Sentence Surgery**、**Sentence Builder**、**Worked Examples**、**Faded Guidance**。Phase 4 已經特別標示 Surgery / Builder 係 **Mixed practice**，即係佢哋唔會保證跟某一個 focused concept，避免小朋友按咗「relative clauses」但實際出咗 mixed practice 會覺得被呃。([GitHub][3])

如果小朋友按 **Smart Practice**，正常 flow 係：先有一題，先自己試，未答之前唔應該有 AI、worked solution、similar problem、faded help。答啱就短 feedback 然後下一題；答錯就先畀一個細 nudge，再 retry，之後先可以 optional support。Phase 4 已經用 learning-flow matrix 測咗呢啲規則，包括 pending state、mode flip、AI after marking、faded scaffold 唔漏答案、Mini Test timer expiry 等情況。([GitHub][1])

如果小朋友按 **Mini Test**，佢應該感覺似一個短測驗：有 timer、有題目 navigation、答案可以保存，未 finish 前唔應該見到 feedback / hint / support / answer。Finish 後先 review，未答嘅會顯示 Blank。Phase 4 Playwright golden paths 已經測咗 Mini Test navigate → preserve → finish → review。([GitHub][1])

如果小朋友按 **Grammar Bank**，佢應該見到全部 18 個 Grammar concepts，可以 filter：All、Due、Trouble、Learning、Nearly secure、Secure、New；亦可以按 monster cluster filter：Bracehart、Chronalyx、Couronnail、Concordium。Concept card 會有概念名、summary、child-friendly status、monster cluster、example sentence、attempt / correct / wrong tally，唔會直接用 percentage 嚇小朋友。([GitHub][3]) ([GitHub][3])

如果小朋友按 **Writing Try**，呢個係 non-scored writing transfer。佢可以寫句子 / paragraph、tick checklist、save。Save 咗唔會加 mastery、唔會出 monster reward、唔會改 misconception、唔會影響 Concordium。Phase 4 已經加咗 hide / unhide；成人 admin 先可以 archive / delete，而且 learner-facing projection 唔會 expose archive。([GitHub][1]) ([GitHub][1])

Adult / parent / admin report 係另一條路，唔應該放喺小朋友主 flow。Phase 4 已經加咗 adult confidence chips、Parent/Admin hub confidence wiring，同時 child copy forbidden terms 有 gate，避免小朋友畫面出現「Worker」「Stage 1」「read model」「denominator」呢類字眼。([GitHub][1]) ([GitHub][3])

用一句講：**小朋友應該見到一個好簡單嘅學習產品：今日做咩、我邊度弱、邊啲 secure、我隻 monster 去到邊。複雜 adaptive engine、confidence、reward evidence、read model 全部應該喺背後。**

## 2. 而家 Grammar 有咩 functionality？

而家 Grammar 已經唔係 HTML prototype。README 話 Grammar 係 **Stage 1 Worker-command-backed practice surface**，經 Worker subject command and read-model boundary，React render setup/session/feedback/summary/analytics states；production app 亦係 Worker-backed auth、API repositories、subject commands、server read models，`?local=1` 已經唔係 browser-local production runtime。([GitHub][4])

現有功能大概係：

**Smart Practice**：adaptive practice，應該混 due、weak、fresh concept。
**Fix Trouble Spots**：針對錯得多 / 需要 repair 嘅概念。
**Mini Test**：timed strict set，finish 前無 feedback。
**Grammar Bank**：好似 Spelling Word Bank，睇 18 個 concepts、status、examples、filter、focused practice。
**Learn / Worked / Faded**：教學支援 mode，但 support 會影響 mastery credit。
**Sentence Surgery / Sentence Builder**：mixed practice，唔假扮 focused practice。
**Writing Try**：non-scored transfer writing，save evidence 但唔改 mastery/reward。
**Read aloud / accessibility**：session / mini-test flow 有相關 coverage。
**AI enrichment**：只可以 post-marking，唔係 score-bearing，亦唔應該 pre-answer 出現。Phase 4 invariant 明確寫 AI 係 post-marking enrichment only。([GitHub][1])
**Adult / Parent / Admin view**：confidence labels、recent attempts、Writing Try admin archive/delete。([GitHub][1])

學習上，佢而家方向係啱：先獨立嘗試，再短 feedback，再必要時 worked/faded support，再 retry，再 spaced return。呢個同你一開始 KS2 reasoning prototype 入面講嘅「mixed retrieval、genuine independent attempt、minimal corrective feedback、worked/faded support only when needed、retry、spaced mixed return」一致。

## 3. Grammar 而家係咪 in production？

我會分開三層講，因為呢度好易混亂。

**技術上：Grammar 已經入咗 production architecture。** README 講 production 用 Worker-backed auth、server read models、subject commands，而 Grammar 已經 crossed deterministic learning engine boundary for Stage 1 practice surface。([GitHub][4])

**Phase 4 Grammar 本身：完成，而且測試好強。** Phase 4 report 話 14 PRs merged、zero blocking findings、Grammar tests 562/562 passing、production-smoke `stats.templates` leak 已修、Playwright golden paths 已加、reward wiring / Concordium invariant / Writing Try non-scored 都有 gate。([GitHub][1]) ([GitHub][1])

**但成個 repo / release 狀態：我唔會話完全 green。** Open PR #323 明確話 main 有 14 個 `npm test` failures，係 after 一批 PR merge without test gate；PR #326 亦話 14 pre-existing main fails unchanged。即係就算 Grammar P4 自己完成，整個 main branch 仍然有 repo-level regression sweep 要收尾。([GitHub][2]) ([GitHub][5])

所以我會咁定義而家狀態：

**Grammar：Worker-backed Stage 1 + Phase 4 hardened，已經係 production path 入面。**
**但：未應該叫 full finished Grammar subject / release-stamped production-ready，直到 repo-level `npm test`、`npm run check`、`audit:client`、`audit:production` 全部綠。** README 本身都講 Grammar crossed Stage 1 boundary，但 Grammar / Punctuation 都未係 finished full-subject product layer。([GitHub][4])

## 4. Monster 係點攞？現行 code 係點安排？

而家 active Grammar monsters 係四隻：

Bracehart
Chronalyx
Couronnail
Concordium

Reserve monsters 係 Glossbloom、Loomrill、Mirrane，資產仍然存在，但唔應該出現喺 learner-facing active Grammar summary。Repo active roster 已經係 `grammar: ['bracehart', 'chronalyx', 'couronnail', 'concordium']`，reserve 係 `grammarReserve: ['glossbloom', 'loomrill', 'mirrane']`。([GitHub][6])

概念分配係：

Bracehart：6 個 concepts，包括 sentence functions、clauses、relative clauses、noun phrases、active/passive、subject/object。
Chronalyx：4 個 concepts，包括 tense/aspect、modal verbs、adverbials、pronouns/cohesion。
Couronnail：3 個 concepts，包括 word classes、standard English、formality。
Concordium：18 個 Grammar aggregate concepts，包括 5 個 punctuation-for-grammar concepts。([GitHub][7])

**而家攞 monster 嘅核心規則係：concept secure 咗，先會記入 reward mastery。** Writing Try 唔會計；普通 scored practice / mini-test 如果令 concept cross 到 secure threshold，就會 record Grammar concept mastery。Reward layer 只 react to committed secured evidence，唔控制 learning flow。Phase 4 invariant 已經寫明呢點。([GitHub][1])

現行 code 嘅 `caught` 規則好簡單：`mastered >= 1` 就 caught。Stage 則係用 ratio 計：0% = stage 0；>0% = stage 1；>=50% = stage 2；>=75% = stage 3；100% = stage 4。([GitHub][7]) ([GitHub][7])

所以現行實際 thresholds 係：

| Monster    | Total secure concepts | Not caught | Caught / stage 1 | Stage 2 | Stage 3 | Stage 4 / Mega |
| ---------- | --------------------: | ---------: | ---------------: | ------: | ------: | -------------: |
| Bracehart  |                     6 |          0 |              1–2 |     3–4 |       5 |              6 |
| Chronalyx  |                     4 |          0 |                1 |       2 |       3 |              4 |
| Couronnail |                     3 |          0 |                1 |       2 |       — |              3 |
| Concordium |                    18 |          0 |              1–8 |    9–13 |   14–17 |             18 |

呢度有一個我覺得**好重要、好值得下一 phase 即刻處理嘅怪位**：你講嘅 product story 係「未有蛋 / not caught → 捉到蛋 → kid → 再 evolve → Mega」。但現行 code 其實係：stage 0 有 Egg 名稱 / asset，例如 `Bracehart Egg`、`Chronalyx Egg`、`Couronnail Egg`、`Concordium Egg`；但 `caught` 要 mastered >= 1 先 true。即係第一個 secure concept 發生時，event 係 `caught`，但 progress stage 已經係 stage 1，而唔係「caught egg but not hatched」。Event code 亦係先 check caught，再 check stage increase；所以第一個 secure 會 emit `caught`，唔會同時 emit `evolve`。([GitHub][6]) ([GitHub][7])

最明顯 bug / design mismatch 係 **Couronnail stage 3 永遠到唔到**。因為 total 得 3 個 concepts：1/3 係 stage 1，2/3 係 stage 2，3/3 直接 stage 4。`Formacrest` 呢個 stage 3 名稱理論上存在，但按現行 ratio staging 係 unreachable。([GitHub][6]) ([GitHub][7])

所以答案係：**而家係 secure concept 攞 monster，不係答一題啱就攞。第一個 secure 會 catch；全部 relevant concepts secure 會 Mega。** 但如果你想要 Spelling 嗰種「先搵到蛋，再孵化，再 kid，再 Mega」嘅感覺，現行 Grammar reward stage model 要再 harden。

## 5. 我搵到嘅 bug / flaw / regression risk

第一，**repo-level test gate 仍然係最大 release blocker**。Grammar P4 自己 green，但 open regression PR 講 main 有 14 個 `npm test` failures，呢個唔可以忽視。即使 failures 未必係 Grammar，都會影響你話「production ready」嘅信心。([GitHub][2])

第二，**monster stage story 同 product expectation 唔一致**。你想「not caught → catch egg → hatch / grow → Mega」，但現行係 first secure already caught + stage 1。Egg stage 有 asset 名，但 caught false，所以小朋友可能永遠無一個清楚「我剛剛捉到蛋」嘅持續狀態，只係見到 caught toast。([GitHub][7]) ([GitHub][6])

第三，**Couronnail stage 3 unreachable**。呢個係具體 bug，因為 3-concept denominator 配 ratio staging 會跳過 75% stage。([GitHub][7])

第四，**Phase 4 自己承認 Mega-on-18th-secure Playwright assertion 被弱化**。本來想測「Concordium 第 18 個 secure 變 Mega」，但 UI driving 17 concepts 超時，所以最後只測 monotone non-decreasing。呢個係 reward UI 最重要嘅 full-path gap。([GitHub][1])

第五，**adaptive freshness 仍有一個已知 soft-penalty 弱點**。Phase 4 report 寫 seed 13 仍然可以出 3 次 consecutive `word_classes`，因為 concept freshness 只係 soft penalty，唔係 hard serialisation guard。對小朋友嚟講，連續三題同概念會覺得奇怪 / repetitive。([GitHub][1])

第六，**admin transfer mutation 嘅 IDOR membership check deferred**。Phase 4 report 明確講 U10 IDOR membership check deferred，如果 multi-family deployment 真係行，就要補 membership check。([GitHub][1])

第七，**`.grammar-secondary-mode-label` CSS 未寫**。功能上冇事，但 Surgery / Builder “Mixed practice” label 可能視覺上唔夠清楚。([GitHub][1])

第八，**content thin-pool 係已知問題，但我唔建議下一 phase 做內容擴充**。Phase 4 audit 確認 6 個 thin-pool concepts 同 explain question-type gap；但你而家話唔加新 feature，要 hardening，所以應該只保留為 known limitation，唔好下一 phase 直接加 30 templates。([GitHub][1])

## 6. 下一 phase 我建議：Grammar Phase 5 — Release Hardening & Monster Progression Audit

呢個 phase 唔加新功能。只做 hardening、bug fixing、release confidence、monster progression alignment。

### U0 — Freeze scope and define release claim

寫一份：

`docs/plans/james/grammar/grammar-phase5-release-hardening-plan.md`

第一段要講清楚：

No new learner features.
No content expansion.
No answer-spec migration.
No contentReleaseId bump unless marking behaviour changes.
Goal is release confidence, reward correctness, monster-stage correctness, and production audit.

同時定義 repo 對外可以講咩：

“Grammar is Worker-backed Stage 1 with Phase 4 learning-integrity gates.”
唔好講 “full finished Grammar subject” 住，因為 README 本身都話未係 finished full-subject product layer。([GitHub][4])

### U1 — Main branch regression sweep first

呢個要排第一。等 PR #323 / related unit PRs 收尾，或者開 Phase 5 第一 unit 專門做 final verification。

Acceptance criteria：

`npm test` green
`npm run check` green
`npm run audit:client` green
`npm run audit:production` green
No known “14 pre-existing main fails” remains
Test-on-PR workflow installed / enforced

呢個唔係 Grammar glamour work，但係而家最重要。Open PR 已經講明 final target 係 main post-sweep zero failures。([GitHub][2])

### U2 — Monster progression contract

先唔好改 code，先寫 contract。要決定：

Stage 0 係咪「not caught / silhouette」？
First secure 係咪「catch egg」？
Egg caught 後會唔會 persist 一段時間？
幾多 secure 先 hatch？
Direct monsters denominator 太細時，係咪仍然要 5 visual stages？
Concordium 18 concepts 係咪 full Grammar Mega 唯一 final boss？我建議係 yes。

我建議 product contract 改成：

0 secure：Not caught，唔顯示已擁有 egg；可以顯示 silhouette / “not found yet”。
1st secure：Caught egg。
Next milestone：Hatch / kid stage。
Later milestone：evolve。
Full denominator：Mega.

### U3 — Fix Grammar stage calculation for 3 + 1 model

現行 ratio stage 對 Concordium okay，對 3-concept Couronnail 唔 okay。下一 phase 要揀其中一個：

**Option A：Decouple `caught` from visual `stage`。**
`caught: true` 可以同 `stage: 0` coexist，即係 stage 0 係「caught egg」，而 not-caught 係另一個 flag / display state。呢個最貼你講嘅「捉咗隻蛋」。

**Option B：Add `displayStage`，保留 reward `stage`。**
Reward engine 繼續 monotonic 0–4，但 UI 用 `displayStage` 去顯示 egg / hatch / grow。呢個比較安全，唔會太大機會破壞既有 reward tests。

**Option C：繼續 ratio，但承認 Couronnail 無 stage 3。**
我唔建議，因為你已經明確覺得奇怪，而呢個確實係產品感覺上唔完整。

我偏向 **Option B**。原因係 Phase 4 已經加咗好多 reward invariant，直接改 stage semantics 風險高；用 display mapping 可以保留 `recordGrammarConceptMastery` 同 event monotonicity，同時修正小朋友見到嘅 progression story。

### U4 — Write exact threshold tests for every active monster

要有明確 tests：

Bracehart：0 / 1 / 2 / 3 / 4 / 5 / 6 secure 每個 display stage 應該係咩。
Chronalyx：0 / 1 / 2 / 3 / 4 secure。
Couronnail：0 / 1 / 2 / 3 secure，唔可以 skip intended display stage unless contract 寫明。
Concordium：0 / 1 / 9 / 14 / 18 secure。
First secure emits caught once only。
Full denominator emits mega once only。
Re-secure same concept emits no duplicate reward。
Transfer evidence emits no reward。
Reserved monsters never toast / appear.

目前 code 已經有 Concordium never revoked property tests，但 Phase 4 自己講 Playwright 未 full assert 18th secure → Mega，所以呢度要補。([GitHub][1]) ([GitHub][1])

### U5 — Add demo seed hook for monster reward UI testing

Phase 4 避免加 `/demo?seedSecuredCount=17`，所以 18th secure UI path 測唔實。下一 phase hardening 可以加 **testing-only / demo-only seed hook**，唔係 learner feature。

例如：

`/demo?subject=grammar&seedConcordiumSecured=17`

或者更安全：

`/demo?fixture=grammar-concordium-premega`

用嚟測：

Dashboard before：17/18, not Mega
做一題 secure final concept
Toast：Concordium Mega
Codex / dashboard / summary 全部變 Grand Concordium
Refresh 後仍然 Mega
Re-answer 唔 duplicate toast

呢個係 hardening hook，唔係新 product feature。

### U6 — Monster UI audit across all surfaces

要檢查所有地方一致：

Dashboard monster card
Summary reward section
Codex / Meadow
Toast
Grammar Bank cluster filters
Adult report
Legacy migrated state

特別要睇：not caught 係咪顯示 egg？如果 product story 係「未捉到蛋」，not caught 就唔應該顯示 “Bracehart Egg” 好似已擁有咁。Egg asset/name 應該係 caught egg stage，而 not-caught 應該係 silhouette / unknown / not found。

### U7 — Adaptive serialisation hardening

唔係要重寫 engine，只係修 known residual：避免同一 concept 連續三題，除非 pool 真係 forced。

Acceptance criteria：

Normal Smart Practice：same concept max 2 in a row。
Same template max 1 in a short window unless forced。
Due / weak priority 仍然高過 cosmetic variety。
Seed 13 `word_classes` 3× consecutive regression fixed。
Simulation tests prove no overcorrection.

呢個符合學習設計：interleaving 要真，唔係表面上叫 adaptive 但實際連續同一概念。Spacing / interleaving / independent attempt 係你原先 learning loop 嘅核心。

### U8 — Admin security hardening

補 U10 deferred IDOR membership check：

`runAdminGrammarTransferMutation` 要 verify admin account 對 learner 有權限，而唔只係 platformRole admin。Phase 4 report 已經講 TODO 應該用 membership check / `canViewLearnerDiagnostics` primitive。([GitHub][1])

Also improve audit identity：

event_log 除 actor_account_id / platformRole，可以 snapshot email/display name，如果 repo privacy policy 容許。唔係 blocker，但 admin audit 用起上嚟會清楚好多。

### U9 — Child UI polish bugs only, no new features

只修 bug / glitch：

`.grammar-secondary-mode-label` CSS。
Unknown confidence label 唔好 fallback 做 “Learning” 太自然；可以用 “Check status” 或 fail test。Current child helper unknown label returns `Learning`，雖然成人 taxonomy 已 harden，但 child UI 呢度可以再保守啲。([GitHub][3])
Check all child surfaces still pass forbidden terms。
Check mobile Monster card layout。
Check read aloud does not read answer / feedback before allowed.

### U10 — Release evidence pack

最後生成一份：

`docs/plans/james/grammar/grammar-phase5-release-evidence.md`

入面要有：

Git commit / PR list
`npm test` result
`npm run check` result
`audit:client` result
`audit:production` result
Grammar golden paths result
Monster threshold table
Known limitations accepted
No contentReleaseId bump confirmation
Production URL smoke result
Screenshots or Playwright artifact references

呢個好重要，因為而家 repo PR 太密，靠口講「done」好容易亂。下一個 phase 要將「done」變成 evidence。

## 7. 我嘅實際建議

我會即刻做兩件事：

第一，**唔加新 functionality，先清 repo-level red tests**。只要 open PR 仲話 main 有 14 npm failures，我哋就唔應該再講「production perfected」。([GitHub][2])

第二，**將 monster progression 當成 Phase 5 主題之一**。你覺得怪係合理，因為現行 code 係工程上可用，但 product story 唔夠清楚：第一個 secure 已經 caught + stage 1；Couronnail stage 3 unreachable；Concordium 18th secure UI full path 未被 Playwright 強測。呢啲唔係 cosmetic，係小朋友 motivation loop 嘅核心。

我會將下一 phase 叫：

**Grammar Phase 5 — Release Hardening, Monster Progression Contract & Production Evidence**

而唔叫 content expansion。Grammar 之後的確需要 content expansion，但唔係而家。現在最重要係：**每條 flow 都可信、每個 reward 都講得通、每個 test gate 都綠、每個小朋友見到嘅狀態都同實際 learning evidence 一致。**

[1]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/grammar/grammar-phase4-implementation-report.md "raw.githubusercontent.com"
[2]: https://github.com/fol2/ks2-mastery/pull/323 "docs(regression-sweep): main-branch regression sweep design 2026-04-26 by fol2 · Pull Request #323 · fol2/ks2-mastery · GitHub"
[3]: https://github.com/fol2/ks2-mastery/blob/main/src/subjects/grammar/components/grammar-view-model.js "ks2-mastery/src/subjects/grammar/components/grammar-view-model.js at main · fol2/ks2-mastery · GitHub"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/README.md "raw.githubusercontent.com"
[5]: https://github.com/fol2/ks2-mastery/pull/326 "feat(capacity): U9 circuit breakers + graceful degradation (Phase 2 final) by fol2 · Pull Request #326 · fol2/ks2-mastery · GitHub"
[6]: https://github.com/fol2/ks2-mastery/blob/main/src/platform/game/monsters.js "ks2-mastery/src/platform/game/monsters.js at main · fol2/ks2-mastery · GitHub"
[7]: https://github.com/fol2/ks2-mastery/blob/main/src/platform/game/mastery/grammar.js "ks2-mastery/src/platform/game/mastery/grammar.js at main · fol2/ks2-mastery · GitHub"
