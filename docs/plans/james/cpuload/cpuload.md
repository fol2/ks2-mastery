可以，呢個係一條正確問題，但要問得更工程化一點：唔係「Free tier 可以同時幾多人？」而係「每個玩家每分鐘會打幾多 API、每個 API 用幾多 Worker CPU、讀寫幾多 D1 rows、冷啟動同全班 reload 時會唔會爆」。以你而家嘅 repo 同 incident report 睇，真正瓶頸唔係普通平均流量，而係 `/api/bootstrap` 同 command projection 路徑曾經因為讀全歷史、JSON parse、redact、normalise、再 serialize 大 payload 而爆 Worker CPU。呢個已經喺你上載嘅 incident report 裏面確認：`/api/bootstrap` 曾經出現 `outcome: exceededCpu`，而當時現行 production 又似乎被較新 deployment 覆蓋咗 bounded-history hotfix。

我會直接講結論先：**Free tier 可以做 demo、家庭用、小型 pilot；未優化前唔應該承諾一班學生同時 reload 都有完美體驗。重新套用 bounded bootstrap 之後，可以合理目標係 30–60 個 human-paced active learners；完成結構性 read-model / pagination / command-path 優化後，單一 D1 database 目標可以去到 100+ active learners，但一定要 load test 驗證。**

Cloudflare Workers Free plan 目前係每日 100,000 Worker requests，無一般 requests-per-second 限制，但每次 invocation 只有 10ms CPU；Paid/Standard 係 10M requests/month included、30M CPU-ms/month included，單次 CPU 上限可高好多。([Cloudflare Docs][1]) D1 方面，單一 database 本質上係 single-threaded，一次處理一個 query；如果平均 query 1ms，理論約 1,000 qps；如果 100ms，就約 10 qps；而 D1 query execution 同 result serialization 仍然會計入 Workers CPU/memory 限制。([Cloudflare Docs][2]) Free D1 亦有每日 rows read/write 限制：5M rows read/day、100k rows written/day、5GB storage；撞到 Free plan daily limits 時 D1 會回錯。([Cloudflare Docs][3])

Repo 方向本身係啱嘅：README 講到呢個係 KS2 Mastery Platform v2，目標係建立可承載六個 KS2 exam subjects 嘅穩定 base，而 production 已經係 Worker-backed auth、D1-backed repository、subject commands、server read models、TTS proxy、Parent/Admin hub 等。([GitHub][4]) 但正因為你已經由 browser prototype 走向 Worker/D1 SaaS 架構，bootstrap 同 read-model 設計就要轉成「細 payload、預先計好、lazy load history」，唔可以再每次 page load 都重建全歷史。

## 1. 「同時玩家」估算：我會點定義

「同時玩家」要分三種，因為三種壓力完全唔同。

第一種係 **active human-paced learners**。即係學生正常做題：讀題、打答案、提交、睇 feedback。佢哋唔係每秒打一個 request，通常 20–60 秒先有一次 command。呢種最容易 scale。

第二種係 **simultaneous cold bootstrap**。即係全班同一時間開 app、refresh、login recovery，全部打 `/api/bootstrap`。你之前出事就係呢條路。呢種係最危險，因為 bootstrap 會同時讀 account/learner/subject/session/event/read-model 資料。

第三種係 **recovery burst**。即係 409 conflict、multi-tab、網絡失敗後，client retry/bootstrap/rebase。呢種如果設計差，retry 會放大事故；incident report 已經指出 retry 不能修好 deterministic CPU exhaustion。

所以我會用以下 capacity definition：

`safe active learners = 可以連續 15–30 分鐘 human-paced 使用，P95 command < 150–250ms wall time，P95 Worker CPU < 5ms，5xx 接近 0，無 lost progress。`

`safe cold bootstrap learners = 同一秒開 app，P95 bootstrap < 300–500ms wall time，P95 Worker CPU < 10ms，response < 75–150KB，無 exceededCpu。`

## 2. Free tier 下嘅現實估算

以下係工程估算，唔係 load-test 結果。你要當佢係 launch planning range，而唔係保證。

| 狀態                                                  |       Human-paced active learners |                        同時 cold bootstrap | 判斷                                                                                     |
| --------------------------------------------------- | --------------------------------: | ---------------------------------------: | -------------------------------------------------------------------------------------- |
| 目前未確認 bounded hotfix 已在 production                  | 5–15 個高歷史真實帳戶；20–50 個細 demo users | 1–5 個 Nelson-sized high-history accounts | 唔安全。因為 uncapped bootstrap 曾經 25–26ms CPU 出 503，之後 sample 又見 38ms CPU 成功但已高過 Free 10ms。 |
| 重新套用 bounded-history hotfix 後                       |             30–60 active learners |                    10–20 cold bootstraps | 合理 classroom pilot range，但要 tail/log 驗證 P95 CPU。                                       |
| 完成結構性 read-model + minimal bootstrap + pagination 後 |              100+ active learners |                    30–50 cold bootstraps | 可作工程目標；仍受單一 D1 database serialized queries 約束。                                         |
| 只升 Paid、不改架構                                        |                    503 CPU 風險會細好多 |                                   可能即時好轉 | 但唔係好產品。大 payload、慢 first paint、D1 queue、history growth 仍然會拖死體驗。                        |

每日 request quota 反而未必係第一瓶頸。假設一個 15 分鐘 session 有 25–50 個 dynamic API requests，100,000 requests/day 即係約 2,000–4,000 sessions/day。真實限制多數先來自 bootstrap CPU、D1 query duration、rows read/write、以及突發 reload。Workers Free 有 100k requests/day，但無一般 RPS limit；D1 單 DB 就會因為 query 時間而排隊。([Cloudflare Docs][1])

我唔建議你用「盡量榨盡 CPU」做目標。正確目標係：**每個 request 用最少 CPU，令 Free tier 10ms CPU 都穩定過，Paid tier 只作 safety margin，而唔係靠錢掩蓋壞架構。**

## 3. 立即工程優先次序

第一件事：**重新套用 / merge bounded-history hotfix，然後加 production smoke gate。** Incident report 入面已經有清晰做法：public bootstrap 限制 practice sessions、event log、command projection recent events，而且要用高歷史帳戶 assert production payload 已 bounded。

具體 gate 應該係 deploy 後自動跑：

```bash
npm test
npm run check
npm run deploy
npm run audit:production
node scripts/probe-production-bootstrap.mjs --account high-history
```

驗收條件：

```text
/api/bootstrap:
  status = 200
  practiceSessionsReturned <= defined cap
  publicEventsReturned <= defined cap
  responseBytes <= 150KB initially, target <= 75KB
  Worker cpuTime P95 <= 10ms on Free target
  no outcome: exceededCpu
```

Repo 已經有 `npm test`、`npm run check`、`npm run deploy`、`audit:production` 呢類腳本路線；README 亦講到 deploy 後會做 production audit。([GitHub][4]) 但你要補一個「高歷史 bootstrap regression gate」，因為普通 tests 未必證明 production version 真的包含 bounded hotfix。

第二件事：**把 `/api/bootstrap` 改成 minimal boot document。**

Bootstrap 只應該回：

```json
{
  "account": "...",
  "session": "...",
  "learners": "small list only",
  "selectedLearner": "...",
  "revisions": "...",
  "currentSubjectState": "...",
  "activePracticeSession": "...",
  "gameReadModel": "small",
  "featureFlags": "...",
  "serverTime": "..."
}
```

唔應該回：

```text
all practice_sessions
all event_log
full private spelling state then redact
full parent dashboard
full analytics
full historical activity
```

將 history 拆出去：

```text
GET /api/learners/:learnerId/recent-sessions?limit=20&cursor=...
GET /api/learners/:learnerId/activity?limit=50&cursor=...
GET /api/parent-hub/summary?learnerId=...
GET /api/subjects/:subject/summary?learnerId=...
GET /api/subjects/spelling/word-bank?learnerId=...
```

Product 上，學生第一屏只需要可以繼續練習；Parent Hub 同 analytics 可以 lazy load。呢個亦符合你另一份 KS2 maths/reasoning design brief 嘅學習重點：核心 loop 應該係 mixed retrieval、independent attempt、feedback、retry、spaced return，而唔係 page load 時塞滿歷史資料。

第三件事：**預先計 read models，唔好每次讀 event log 重建 UI。**

建議新增：

```sql
CREATE TABLE learner_read_models (
  learner_id TEXT NOT NULL,
  model_key TEXT NOT NULL,
  model_json TEXT NOT NULL,
  model_version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (learner_id, model_key)
);

CREATE TABLE learner_activity_feed (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL,
  subject_id TEXT,
  event_type TEXT NOT NULL,
  public_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_activity_learner_created
  ON learner_activity_feed(learner_id, created_at DESC, id DESC);
```

每次 command write 成功時，同一個 transaction 更新：

```text
subject runtime state
practice session state
event_log audit row
learner_activity_feed public row
learner_read_models: dashboard summary / parent summary / subject summary
state_revision
```

咁 bootstrap 只讀幾行 JSON read-model，而唔係 parse 幾百至幾千條 events。

第四件事：**command path 要避免「無事件都重建 projection」。**

Spelling/Grammar/Punctuation command handler 應該：

```text
1. read current runtime
2. apply command
3. if no domain events and no persisted state change:
     return current small read model
     do not load event history
4. if events exist:
     write events
     update read models incrementally
5. return minimal command result
```

Incident report 已經指出 spelling command path 曾經會讀 learner full event_log 做 dedupe/reward projection。呢件事要改成 idempotency table / recent window / precomputed reward state，而唔係 scan history。

## 4. Database / D1 optimization plan

D1 單 DB single-threaded，所以你要將 query 做到短、小、indexed。Cloudflare 官方講得好直接：query performance 決定 throughput；合適 index 嘅 simple read 可以少過 1ms SQL duration，而 write 通常幾 ms 起跳；D1 太多 concurrent requests 會先 queue，queue 滿就 overloaded。([Cloudflare Docs][2])

我會做以下 indexes，但要先用 query plan / D1 meta 驗證，唔好盲加：

```sql
CREATE INDEX idx_practice_sessions_learner_subject_updated
  ON practice_sessions(learner_id, subject_id, updated_at DESC, id DESC);

CREATE INDEX idx_event_log_learner_type_created
  ON event_log(learner_id, event_type, created_at DESC, id DESC);

CREATE INDEX idx_subject_state_learner_subject
  ON child_subject_state(learner_id, subject_id);

CREATE INDEX idx_activity_learner_type_created
  ON learner_activity_feed(learner_id, event_type, created_at DESC, id DESC);
```

每條 endpoint 都要記錄 D1 meta：

```js
{
  endpoint,
  queryName,
  rowsRead,
  rowsWritten,
  sqlDurationMs,
  resultRows,
  responseBytes,
  accountLearnerCount,
  returnedSessions,
  returnedEvents
}
```

D1 每個 query meta 會提供 rows_read / rows_written；Cloudflare docs 亦建議用 meta、GraphQL Analytics API、dashboard 去估 usage。([Cloudflare Docs][3])

## 5. Client / UX plan：保證「完美體驗」嘅做法

「完美」唔係永遠零 latency；係學生唔會感覺壞、不會失去答案、不會卡死。

我會定義 product SLO：

```text
First usable screen:
  P50 < 500ms
  P95 < 1.2s

Submit answer -> feedback:
  P50 < 150ms
  P95 < 400ms

Bootstrap:
  P95 Worker CPU < 10ms
  P95 response < 100KB
  zero exceededCpu

Reliability:
  5xx < 0.1%
  no lost progress
  stale revision conflict auto-recovers
```

Client 方面：

1. Static assets 盡量 cache，React shell 唔好等所有 read models。
2. Bootstrap 成功後存在 IndexedDB/local cache；下次先 show stale-but-safe UI，再 background refresh。
3. Command optimistic UI，但要清楚標示 sync state：synced / syncing / retrying / degraded。
4. Multi-tab 要有 leader election 或 BroadcastChannel，避免三個 tab 同時 bootstrap/command。
5. Retry 要 exponential backoff + jitter；CPU exceeded 類型唔好即刻狂 retry。
6. 409 conflict 之後只 fetch minimal revision/state patch，唔好 full bootstrap。
7. Parent Hub / Admin / Word Bank / activity feed lazy load，唔阻學生練習。

## 6. Observability plan

`wrangler.jsonc` 已經開 observability，而且 Worker 有 D1、R2、Durable Object learner lock 等 binding。([GitHub][5]) 但你需要把 observability 變成 release gate。

每個 request log：

```json
{
  "endpoint": "/api/bootstrap",
  "status": 200,
  "cpuTimeMs": 6.4,
  "wallTimeMs": 128,
  "responseBytes": 84231,
  "d1RowsRead": 420,
  "d1RowsWritten": 0,
  "returnedSessions": 40,
  "returnedEvents": 120,
  "learnerCount": 3,
  "deploymentId": "...",
  "mode": "public-read-model"
}
```

Alerts：

```text
P0:
  any outcome: exceededCpu
  any /api/bootstrap 503
  any D1 overloaded

P1:
  /api/bootstrap P95 CPU > 10ms
  command P95 CPU > 5ms
  /api/bootstrap response > 150KB
  D1 rows_read per bootstrap > 1,000
  D1 rows_written/day approaching 80k on Free
```

Dashboard 要分開睇：

```text
bootstrap
subject command
auth/session
TTS/audio
parent hub
admin/ops
static asset fallback
```

## 7. Load test plan

未 load test 前，唔好再講「可支援一班」。我會加三種測試。

第一種：synthetic history test。

```text
A. 1 learner, 20 sessions, 50 events
B. 3 learners, 300 sessions, 800 events
C. 30 learners, 10,000 events
D. worst-case parent account with multiple learners
```

第二種：burst test。

```text
10 simultaneous bootstrap
20 simultaneous bootstrap
50 simultaneous bootstrap
100 simultaneous bootstrap
```

第三種：human-paced classroom test。

```text
30 learners
60 learners
100 learners

Each learner:
  bootstrap once
  answer command every 20–45 sec
  occasional retry
  occasional session complete
  15–30 minutes duration
```

驗收：

```text
no exceededCpu
no D1 overloaded
P95 command wall < 250ms
P95 bootstrap wall < 500ms
P95 Worker CPU bootstrap < 10ms
P95 Worker CPU command < 5ms
5xx < 0.1%
```

工具可以用 `k6`、`autocannon`、或者簡單 Node script。重點係每個 virtual user 要有自己 learner/session/revision/requestId，否則你測唔到 CAS/conflict/idempotency 真問題。

## 8. Product report：而家產品應該點定位

### Product status

你而家唔係純本地 HTML toy；repo README 顯示 browser app 已經係 React shell，production 用 Worker auth、API repositories、subject commands、server read models、TTS，而且 Spelling/Grammar/Punctuation 已經逐步走進 Worker-command-backed practice surface。([GitHub][4]) 產品方向係一個 KS2 multi-subject mastery platform，而唔係單一 spelling game。

### Product risk

最大風險唔係內容，而係「可靠性信任」。如果學生提交答案後 503、家長/老師見到 reload 卡住，學習產品會即刻失去信任。對教育產品嚟講，loss of progress 比慢 300ms 嚴重好多。

### Product principle

首頁 / bootstrap 應該只服務一件事：**令學生可以繼續學習**。歷史報告、Parent Hub、Admin diagnostics、analytics 全部係次要 surface，可以延遲載入。

### Suggested product tiers

Free/pilot tier：

```text
Target: family demo, small parent test, 5–20 learners total
Limits:
  one active classroom not guaranteed
  parent analytics lazy
  no heavy admin analytics during class
  bounded history only
```

Classroom beta：

```text
Target: 30 learners active
Requirement:
  bounded bootstrap live
  read models live
  load test passed at 30 active / 20 cold bootstrap
  incident rollback plan
```

School-ready：

```text
Target: 100+ active learners
Requirement:
  structural read models
  per-school/class D1 sharding or proven single-DB capacity
  production dashboards
  alerting
  paid Workers plan strongly recommended
```

### Paid plan recommendation

我會老實講：**Free tier 可以做 early pilot，但如果你想真 classroom launch，$5/month Workers Paid 係合理保險。** Paid plan CPU/request 空間大好多，D1 Free daily limits 亦可移除或轉成 paid usage；但 Cloudflare pricing 同 D1 docs 都顯示，compute/queries 仍然係會計量或受架構限制，所以 Paid 唔應該取代 optimization。([Cloudflare Docs][6])

## 9. 90 日工程 roadmap

### Week 0–1：止血

```text
Reapply bounded-history hotfix
Add high-history production smoke test
Add CPU/response-size logging around /api/bootstrap and commands
Set alert for exceededCpu and bootstrap 503
Cut bootstrap response below 150KB
```

Exit criteria：

```text
Nelson-sized account bootstrap no longer returns full 292 sessions / 767 events
P95 bootstrap CPU below Free target or clearly measured
No known 503 on bootstrap
```

### Week 2–3：bootstrap 拆細

```text
Define minimal bootstrap contract
Move recent sessions to paginated endpoint
Move activity feed to paginated endpoint
Move Parent Hub summary to separate endpoint
Client lazy-load non-critical surfaces
```

Exit criteria：

```text
Bootstrap does not grow with historical event_log
Bootstrap response target <= 75–100KB
High-history and low-history accounts have similar bootstrap CPU
```

### Week 4–6：read models

```text
Add learner_read_models
Add learner_activity_feed
Update read models during command writes
Backfill read models from existing event_log
Make parent/admin surfaces read from read models
```

Exit criteria：

```text
No endpoint needs full event_log for normal user flow
Command projection no longer scans historical events
Parent dashboard first query <= small fixed row count
```

### Week 7–8：command path hardening

```text
Skip projections when command produces no events
Use idempotency/request table rather than event scan
Keep learner lock / Durable Object critical section short
Return minimal command result
Add CAS conflict recovery patch endpoint
```

Exit criteria：

```text
Common commands P95 Worker CPU < 5ms
No-op / save-prefs / end-session routes avoid event history
Conflict recovery does not full-bootstrap unless absolutely needed
```

### Week 9–10：load test and capacity certification

```text
Build scripted classroom load test
Run 10/20/50 bootstrap burst
Run 30/60/100 human-paced learner simulation
Capture Worker CPU, wall time, rows read/written, response bytes, 5xx
```

Exit criteria：

```text
Publish capacity table based on measured numbers
Pick launch cap: e.g. 30 learners/class for beta
Set dashboard alert thresholds from real P95/P99
```

### Week 11–12：scale architecture decision

```text
If single D1 is enough: keep simple
If D1 queue appears: shard by school/class/account
If analytics grows: move heavy analytics to async job/read model
If TTS is hot: pre-generate/cache in R2
```

Cloudflare D1 docs explicitly position D1 for horizontal scale across multiple smaller databases, including per-user/per-tenant/per-entity style isolation, so per-school or per-class D1 sharding is a natural later option if one DB becomes a classroom bottleneck.([Cloudflare Docs][2])

## 10. Final answer on Free tier simultaneous players

My practical answer:

**Right now, before confirming the bounded hotfix is live: don’t trust more than 5–15 real high-history active users, and don’t trust a whole-class simultaneous reload.**

**After bounded bootstrap is definitely live: plan for 30–60 active human-paced learners on Free tier, but cap simultaneous cold bootstrap expectations to around 10–20 until tested.**

**After structural read-model optimization: target 100+ active learners and 30–50 simultaneous bootstraps from one D1 database, with the caveat that D1 queueing and write bursts must be measured.**

The most important engineering move is not buying more CPU. It is making every important request bounded, small, and boring. Once `/api/bootstrap` is constant-size and commands no longer replay history, the app can feel fast even on Free tier; Paid then becomes a reliability margin rather than a crutch.

[1]: https://developers.cloudflare.com/workers/platform/limits/ "Limits · Cloudflare Workers docs"
[2]: https://developers.cloudflare.com/d1/platform/limits/ "Limits · Cloudflare D1 docs"
[3]: https://developers.cloudflare.com/d1/platform/pricing/ "Pricing · Cloudflare D1 docs"
[4]: https://github.com/fol2/ks2-mastery "GitHub - fol2/ks2-mastery: KS2 Unified — browser-side React prototype of a KS2 (UK Year 5/6) study app · GitHub"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/wrangler.jsonc "raw.githubusercontent.com"
[6]: https://developers.cloudflare.com/workers/platform/pricing/ "Pricing · Cloudflare Workers docs"
