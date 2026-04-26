我睇完之後，最大結論係：**下一 phase 唔應該再開一條純 hardening 或純 CPU optimization 線，而係要合併成一個「stability + capacity certification + multi-learner correctness」phase。**
你哋而家唔係完全未 optimize；相反，已經做咗好多正確嘢。但最危險嘅位係：**有咗 bounded bootstrap / read-model / telemetry / breaker，但仲未用 dated evidence 去正式證明 30/60/100 learner tier；同時 multi-learner account 曾經被 optimization 搞壞過，所以之後每個 capacity PR 都一定要有 multi-learner regression gate。**

我今次 review 主要係基於 GitHub repo、raw docs、PR pages 同目前 `main` 上嘅相關 source files；我無喺呢個回合本地跑完整 test suite，所以以下係架構／文件／PR／code-path review，唔係 live production certification。

## 1. 目前 repo 狀態：方向係啱，但未可以講「classroom certified」

README 顯示而家個 project 已經唔係 browser-only prototype，而係 React shell + Worker/D1 backend：Worker 負責 auth、demo session、D1 repository、subject commands、server read models、Parent/Admin hub、TTS proxy 等；production practice authority 亦已經係 Worker API 後面。呢個係正確 SaaS 方向，但亦代表 `/api/bootstrap`、subject command、D1 query、JSON serialization 會變成核心 scalability bottleneck。([GitHub][1])

你哋第一輪 CPU work 已經針對咗真 bottleneck：`/api/bootstrap` 同 subject command projection 過往會讀、parse、redact、normalise、serialize 太多 `practice_sessions` 同 `event_log`，所以容易喺 cold bootstrap / retry storm 入面爆 Worker CPU。Phase 1 CPU report 講明已經做咗 bounded bootstrap、lazy learner history APIs、read-model/activity-feed foundation、bounded command projection、retry/backoff、stale command recovery、multi-tab coordination 同 classroom load driver；但同一份 report 亦講明：30/60/100+ learner launch 未 certified，要等 dated production/preview measurement。([GitHub][2])

所以我會好直接咁講：**而家可以話「repo 已經有 capacity certification tools」，但唔應該話「已經支援一班同時 reload」。** `docs/operations/capacity.md` 目前仍然標示 30-learner classroom beta、60-learner stretch、100+ school-ready 都係 Not certified，而且 Capacity Evidence table 仲係 `_pending first run_`。([GitHub][3])

## 2. 已經做咗啲乜

CPU / workload 方面，已經唔係原地踏步。Phase 1 做咗 bounded production bootstrap、lazy history、read-model/activity feed、bounded projection、client backoff/jitter、multi-tab coordination、capacity driver。Phase 2 再加咗 release gate、capacity telemetry、local Worker load, projection hot-path hardening、minimal bootstrap v2、JSON `notModified`、Playwright multi-tab validation、circuit breaker 設計。Phase 2 completion report 仲記錄咗幾個重要數字：30-learner selected bootstrap 由 545KB 減到 19.5KB，`notModified` 約 471 bytes，common command hot path `event_log` reads 降到 0。([GitHub][4])

目前 `worker/src/repository.js` 入面嘅 bounded constants 都反映呢個方向：recent sessions per learner 5、active session 1、recent public events 50、bootstrap capacity version 3、bootstrap mode 限定為 `selected-learner-bounded` / `full-legacy` / `not-modified`。更加重要係，code comment 已經講明 version 3 係因為 hotfix 加入 `subjectStatesBounded`，同埋 `writableLearnerStatesDigest`，用嚟令 sibling learner subject-state write 都會 invalidate `notModified` probe。([GitHub][5])

System hardening 方面，P1 做咗 security headers、CSP report-only、cache split、chaos suite、multi-tab bootstrap coordination、dense-history spelling smoke、redaction/access matrix 等；P2 做咗 double-submit guard、rehydrate sanitisation、demo/auth UX、TTS watchdog、empty/loading/error primitives、85 visual baselines、Grammar/Punctuation accessibility scenes、CSP inventory、HSTS audit、adult-surface code splitting、Playwright CI、error-copy oracle。([GitHub][6])

換句話講，前面兩條線其實已經有 overlap，而且 overlap 唔少。下一步再分開做，會增加 regression 風險。應該收斂成一條 release-quality 線。

## 3. Multi-learner account：呢個係下一 phase 最重要 regression guardrail

你提到「一個 Google login 入面可以有四個 learners」呢點，repo 入面真係已經有過一個好值得警惕嘅 bug。PR #316 寫得好清楚：U7 minimal bootstrap v2 將所有 per-learner SELECT 都 bound 到 currently selected learner，結果 Nelson / James 呢啲 sibling learner 喺 Spelling Setup 見到 0 stats；D1 data 其實無壞，係 server transport bug。修法係：`child_subject_state` 同 `child_game_state` 呢類細而 load-bearing 嘅 per-learner subject slots 要 ship for every writable learner；但 `practice_sessions` 同 `event_log` 繼續只 bound selected learner，因為呢兩樣先係大 payload。([GitHub][7])

後續 PR #319 再加 client defence-in-depth：當 `selectLearner(id)` 發現 target learner 本地無 cached `child_subject_state`，可以 fire idempotent fetch；有 in-flight guard、防 duplicate、swallow error、stale-navigation guard，避免 learner switching 時 UI 被舊 fetch clobber。([GitHub][8])

呢度嘅產品規則應該寫死：

**一個 account 可以有多個 writable learners。Bootstrap 唔可以為咗慳 payload 而令 sibling learner 消失、stats 變 0、或者 switch learner 後無法 hydrate。**

但同時亦唔應該回到以前「所有 learner 所有歷史都塞入 bootstrap」。正確平衡係：

selected learner 可以有完整 first-paint 所需資料；其他 writable learners 必須出現喺 learner list，並且要有 compact subject/game state 俾 setup stats / Where You Stand 顯示；heavy history，例如 `practice_sessions`、`event_log`、analytics feed，必須仍然 selected-learner-bounded 或 lazy load。

我會將呢個定為下一 phase 第一條 non-negotiable test matrix。

## 4. 我見到嘅 regression / process risk

第一個 risk 係 source-of-truth drift。`cpuload-p2-completion-report.md` 寫 Phase 2 所有 exit criteria met，並列 #326 U9 circuit breakers 作為 merged/delivered evidence。([GitHub][4]) 但 GitHub 目前 open PR list 顯示 #326 仍然係唯一 open PR，而 PR page 亦顯示 #326 狀態係 Open、想 merge 62 commits into main。([GitHub][9])

更麻煩係，`main` 上又已經見到 circuit-breaker primitive 同 capacity docs 嘅 U9 內容。`src/platform/core/circuit-breaker.js` 存在，而且寫明五個 named breakers、closed/half-open/open state machine、localStorage broadcast、no telemetry opinion by itself。([GitHub][10]) `capacity.md` 亦已經有 Circuit Breakers section。([GitHub][3])

所以呢個未必係 runtime regression，但係 **release hygiene regression**：PR status、completion report、main branch source 三者唔一致。下一步要先 reconcile：究竟 #326 係重複 branch 未 close？係 partial merged？係 PR page stale？定係 completion report 講早咗？唔清楚之前，唔好用「Phase 2 complete」做 production decision。

第二個 risk 係 certification 空洞。工具已經有，但 evidence table 未有 dated run。`capacity:classroom:release-gate` 已經定義咗 production command、thresholds，例如 max 5xx = 0、max network failure = 0、bootstrap P95 1000ms、command P95 750ms、max bytes 600000、require zero signals。([GitHub][3]) 但 evidence table 未填，即係 operationally 未 prove。

第三個 risk 係 hardening overreach。System hardening P2 原本已經刻意講明唔應該再踩入 bootstrap CPU、command projection CPU、D1 budgets、load certification 等 capacity stream 範圍。([GitHub][11]) 依家既然你想合併兩條線，反而要更清楚 boundary：合併係為咗統一 release priority，同一套 regression gates；唔係俾任何 PR 無限制郁晒 client、Worker、D1、capacity、security。

第四個 risk 係 refactor 太早。`worker/src/repository.js` 已經變得好大，確實需要拆，但而家最緊要唔係即刻大拆，而係先 lock behavior。尤其係 bootstrap envelope、learner membership、selected learner、writable/viewer separation、`notModified` revision hash、read-model fallback、subject command idempotency。未有 tests 之前大 refactor，會再次踩中 multi-learner bug。

## 5. 下一 phase 我建議咁定義

我會叫下一 phase：

**P3 — Stability, Capacity Evidence, and Multi-Learner Correctness**

目標唔係「再 optimize 一輪」。目標係：**任何 optimization 都唔可以犧牲 correctness；任何 hardening 都要支援 scalability；任何 capacity claim 都要有 evidence。**

### P0：先做 multi-learner bootstrap regression lock

第一個 PR 應該只做 tests + 小修，不要重構。要造一個 4-learner account fixture，模擬你講嘅真實情況：一個 Google account，四個 learners，每個 learner 有唔同 subject state、game state、revision、progress。

Acceptance criteria：

`GET /api/bootstrap` 同 `POST /api/bootstrap` 都要包括所有 writable learners 嘅 compact `child_subject_state` / `child_game_state`。Selected learner 可以有 full first-paint data。Sibling learners 唔可以有 full `practice_sessions` / `event_log` heavy payload。Switch learner 用 `preferredLearnerId` 後，要 hydrate 正確 learner，而唔係繼續顯示上一個 learner 或 0 stats。Sibling learner subject-state write 必須 invalidate `notModified`。Viewer learner 要喺 hub surfaces read-only，不應該喺 main writable subject shell 被當成可寫 learner。呢個同 README 入面 writable/readable viewer separation 係一致嘅。([GitHub][1])

呢個 PR 嘅目的係防止將來任何人再為咗減 payload，無意中將 account 壓扁成 single learner。

### P0：reconcile #326 / capacity completion truth

第二個 PR 或 maintenance task 要處理 #326 狀態。要做三件事：一，確認 main 上 circuit breaker code 是否真係已經完整；二，若 #326 已經等同 merged，就 close / document；三，若未 merged，就唔好喺 completion report 寫「merged / Phase 2 complete」。PR #326 自己 summary 寫咗五個 named circuit breakers、breakerTransition telemetry、derived-write breaker、priority order，但 GitHub 狀態仍然係 Open。([GitHub][12])

呢個唔係吹毛求疵。你哋而家進入 production hardening，release docs 就係 operations truth。Docs 錯，將來 rollback、incident review、capacity claim 都會錯。

### P0：第一次 dated capacity gate run

第三件事先係跑 capacity gate。唔好一開始就衝 60 或 100。先用 preview 或 production demo sessions 做 10 learners / 10 burst / 1 round，過咗先 30 learners / 20 burst / 1 round。每次都要 persist JSON evidence，填入 `docs/operations/capacity.md` evidence table。Runbook 已經寫明要記錄 commit、environment、learner count、burst、rounds、P95 bootstrap、P95 command、max bytes、5xx、signals、decision。([GitHub][3])

Release blocker 要照 runbook 嚴格執行：任何 Worker Error 1102 / `exceededCpu`、任何 `/api/bootstrap` 503、任何 D1 overloaded/daily-limit、bootstrap P95 > 1000ms、command P95 > 750ms、payload over cap、missing bootstrapCapacity、redaction leak，都唔可以 claim readiness。([GitHub][3])

我會好保守：未有第一條 dated evidence row 前，所有文案只可以講「ready to test 30-learner beta」，唔可以講「supports 30 learners」。

### P1：補 Phase 2 completion report 入面已知 residuals

CPU P2 completion report 自己列咗 U2.5、U5.5、U9.1 等 residuals：school-load confirmation、full command loop、Grammar/Punctuation stale-409、Parent Hub pagination、KV lock、breaker follow-ups、evidence provenance 等。([GitHub][4]) 呢啲應該係 P1，唔係 optional cleanup。

我會優先揀：

Grammar/Punctuation stale-409 + command loop，因為呢兩個直接影響 progress preservation。Parent Hub pagination，因為 history lazy load 做咗之後，pagination 係 scalability correctness。Breaker U9.1，因為 graceful degradation 最怕「睇落 degrade，其實掩蓋咗 write failure」。Runbook 已經寫明 priority order：student answer write > reward/event projection > parent analytics；failed write 絕對唔可以被顯示成 synced。([GitHub][3])

### P1：D1 query budget / hot-path audit

下一個真正 optimization 應該唔係「再估邊度慢」，而係將 hot path budget 寫死。對 `/api/bootstrap`、subject command、Parent Hub summary、Classroom summary 建立 query budget：

`/api/bootstrap` selected-learner-bounded mode：queryCount、rowsRead、responseBytes、eventLog rows、practiceSessions rows 都要有上限。Subject command common path：應該繼續保持 `event_log` hot read = 0 或 bounded recent window。Parent/Admin surfaces：一定要 pagination，唔可以因為 adult hub 而偷塞全歷史。

Capacity telemetry 已經提供 `meta.capacity` 同 structured log surface，包含 query count、D1 rows/duration、response bytes、signals。([GitHub][3]) 下一步係將呢啲由「observability」升級成「release gate」。

### P2：再做 refactor，但要小步

Refactor 係需要，但唔應該做成一個巨型 PR。`worker/src/repository.js` 可以逐步拆：

`bootstrap-repository.js`：account/session/learner/bootstrap envelope、revision hash、notModified。
`history-repository.js`：practice session、event log、lazy history。
`read-model-repository.js`：learner_read_models、activity feed、projection persistence。
`subject-command-repository.js`：mutation receipts、idempotency、CAS/revision checks。
`capacity-metadata.js`：bootstrapCapacity meta、capacity mode、bounded flags。
`membership-repository.js`：account learner membership、writable/viewer role rules。

但每一步只搬 code，不改 behavior；每一步都要跑 multi-learner matrix、bootstrap v2 snapshot、capacity dry-run、worker access tests。尤其 `BOOTSTRAP_CAPACITY_VERSION` 已經有 comment 寫明 envelope required field 變就要 bump version，同 PR 一齊更新 snapshot。([GitHub][5]) 呢條規矩要保留。

## 6. 我建議嘅 PR sequence

我會咁排：

PR 1：`test(bootstrap): lock multi-learner account bootstrap contract`
只做 4-learner account matrix。重點係所有 writable learners stats 可見、heavy history selected-only、switch learner 正確、sibling write invalidates notModified、viewer read-only separation。

PR 2：`docs(capacity): reconcile P2 completion report and PR #326 state`
處理 source-of-truth drift。未 reconcile 前，唔好再講 Phase 2 final。

PR 3：`capacity: add first dated preview release-gate evidence`
跑 10 learner → 30 learner gate，commit JSON evidence，填 capacity table。未 pass 就唔 claim。

PR 4：`capacity: enforce hot-path query budgets`
將 `/api/bootstrap`、subject command、Parent/Classroom summary 嘅 queryCount、rowsRead、bytes、signals 寫成 tests/gates。

PR 5：`test(capacity): dense-history full command loop`
Spelling 唔止 start-session，要 advance + submit + end-session。Grammar/Punctuation 要 stale-409 / retry / no lost progress。Parent Hub 要 pagination smoke。

PR 6：`fix(capacity): U9.1 breaker follow-ups`
確保 breaker 唔會 mask failed writes，transition telemetry 唔 spam，sticky bootstrap breaker reset 有 operator path，derivedWrite breaker client/server semantics 一致。

PR 7：`refactor(worker): split bootstrap/read-model/history repositories behind locked tests`
到呢一步先拆 repository。無 behavior change，純拆。

PR 8：`hardening: CSP/HSTS/style/chunk failure follow-up`
呢個先返去做 non-capacity hardening residuals：CSP enforcement decision、HSTS preload operator audit、remaining inline style migration、React.lazy chunk-load inner retry。Sys-hardening P2 report 已經記錄 CSP 仍然 report-only、HSTS preload 未加、remaining inline style sites、dark-mode baselines 等 residuals。([GitHub][13])

## 7. 最重要嘅產品/工程原則

你最初講得啱：呢個唔係「Cloudflare Free tier 太廢」咁簡單。就算將來上 paid，如果每次 bootstrap 都讀大歷史、serialize 大 payload、retry storm、multi-tab duplication、或者 adult hub 無 pagination，成本都會線性甚至爆炸式上升。

但另一邊，optimization 唔可以破壞 product truth。**一個 account 有多個 learners** 就係 product truth。任何 server workload optimization 都要尊重呢點。正確做法唔係「只 load 一個 child」，而係「heavy history selected-only，compact learner state all writable learners」。

所以我建議下一步唔好再問「下一個 optimization 係咩」。應該問：

**呢個 commit 可唔可以證明：4-learner account 正常、30-learner gate 有 dated evidence、0 bootstrap 503、0 exceededCpu、0 lost progress、0 private data leak？**

做到呢個，先至係真正 scalable、expandable、production-ready。

[1]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/README.md "raw.githubusercontent.com"
[2]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/cpuload/implementation-report.md "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/operations/capacity.md "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/cpuload/cpuload-p2-completion-report.md "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/worker/src/repository.js "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/sys-hardening/sys-hardening-p1-completion-report.md "raw.githubusercontent.com"
[7]: https://github.com/fol2/ks2-mastery/pull/316 "fix(bootstrap): U1 — ship child_subject_state for all learners (hotfix) by fol2 · Pull Request #316 · fol2/ks2-mastery · GitHub"
[8]: https://github.com/fol2/ks2-mastery/pull/319 "fix(bootstrap): U2 — client selectLearner refetch hook (defence-in-depth, no-op by default) by fol2 · Pull Request #319 · fol2/ks2-mastery · GitHub"
[9]: https://github.com/fol2/ks2-mastery/pulls?q=is%3Apr+is%3Aopen "Pull requests · fol2/ks2-mastery · GitHub"
[10]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/platform/core/circuit-breaker.js "raw.githubusercontent.com"
[11]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/sys-hardening/sys-hardening-p2.md "raw.githubusercontent.com"
[12]: https://github.com/fol2/ks2-mastery/pull/326 "feat(capacity): U9 circuit breakers + graceful degradation (Phase 2 final) by fol2 · Pull Request #326 · fol2/ks2-mastery · GitHub"
[13]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/sys-hardening/sys-hardening-p2-completion-report.md "raw.githubusercontent.com"
