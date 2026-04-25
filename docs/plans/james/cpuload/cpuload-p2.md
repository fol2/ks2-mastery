我睇完 implementation report 同目前 repo 相關檔案後，我嘅判斷係：**你哋已經完成咗第一輪真正有價值嘅 CPU hardening；下一階段唔應該再衝去大重構，而係要把「已實作嘅防護」變成可量度、可阻止壞 release、可支援 launch decision 嘅系統。**

原本事故係 `/api/bootstrap` 同 subject command projection 做太多 unbounded history work，導致 Worker CPU exhaustion；呢點喺之前 incident report 已經確認。 而今次 implementation report 顯示，你哋已經做咗 bounded bootstrap、lazy learner history APIs、read-model/activity-feed storage foundation、read-model backfill、bounded command projection、client retry/backoff、stale command recovery、multi-tab bootstrap coordination、classroom load driver 同 regression coverage。([GitHub][1])

最重要嘅產品結論係：**目前可以話 repo 已經具備 small pilot readiness assessment 工具，但未可以話 30/60/100+ learner classroom capacity 已經 certified。** Implementation report 自己都好清楚寫明：30-learner beta、60-learner stretch、100+ school-ready 都唔應該 claim，直到有 dated production/preview run、P95、zero 5xx、D1 row metrics、Worker tail evidence 同 rollback/degrade drill。([GitHub][1])

## 我見到你哋已經實作咗乜

第一，bootstrap 已經由「讀全歷史」轉成「bounded public bootstrap」。目前 `repository.js` 入面 cap 已經好具體：每個 learner recent sessions 5、active sessions 1、active lookup 5、recent public events 50，而 command projection recent event window 係 200；亦有 capacity read-model table 名同 `command.projection.v1` version constant。呢個係正確方向。([GitHub][2])

第二，歷史 UI 已經有 lazy route。Parent Hub recent sessions 同 activity 依家係獨立 endpoint，有 `learnerId`、`limit`、`cursor`，即係歷史資料唔再必然要塞入 `/api/bootstrap` first paint。([GitHub][3])

第三，read-model 基建已經落咗 schema。Implementation report 指出 migration `0009_capacity_read_models.sql` 加咗 `learner_read_models`、`learner_activity_feed`，再配合 model-key lookup、learner/activity cursor indexes、read-model helper、public activity allowlist、backfill script 同 tests。([GitHub][1])

第四，command path 有明顯改善。Report 講 `readLearnerProjectionBundle()` 已經唔再為 common projection path scan 全 learner events，改用 bounded recent event-token window，亦開始 persist `command.projection.v1`；Smart Review/Trouble Drill start-session dense-history case 由約 1.7s 降到約 12.5ms。([GitHub][1])

第五，client retry 壓力已經降低。Client 有 bootstrap backoff、subject command jitter、stale revision recovery、multi-tab coordination。Code 入面 bootstrap backoff 會識別 5xx、`exceededCpu`、CPU limit、Worker Error 1102，再用 exponential delay + jitter；subject command client 亦有 stale-write retry 同 jittered transport retry。([GitHub][4])

第六，capacity driver 已經存在，而且已經有 production safety basics。`classroom-load-test.mjs` 支援 dry-run、local-fixture、production，會測 cold bootstrap burst 同 human-paced Grammar command rounds，並分類 `exceededCpu`、D1 overload、daily limit、auth failure、5xx、429、network failure 等 signals。([GitHub][5])

## 下一階段嘅核心目標

下一階段目標唔係「再估可以幾多人」。目標應該係：

**把 capacity 由 estimate 變成 evidence。**

即係每次 deploy 之後都可以答到：

「呢個 commit，喺呢個 environment，幾多 learners、幾多 cold bootstraps、幾多 command rounds、P95 bootstrap 幾多 ms、P95 command 幾多 ms、response 最大幾大、D1 rows read/write 幾多、有無 exceededCpu、有無 D1 overload、有無 5xx、有無 redaction leak。」

你而家最危險嘅唔係冇優化，而係「有咗優化但冇 hard release gate」。Implementation report 都講到下一輪應該係 post-merge production validation、evidence persistence、threshold options、capacity evidence table，而唔係再做另一個 architectural rewrite。([GitHub][1])

## P0：先做 release-blocking capacity gate

第一個 PR 應該叫類似：

`capacity: persist and gate classroom load evidence`

要改 `scripts/classroom-load-test.mjs`，加以下 flags：

```bash
--output reports/capacity/2026-04-25-main-30l.json
--max-5xx 0
--max-network-failures 0
--max-bootstrap-p95-ms 1000
--max-command-p95-ms 750
--max-response-bytes 600000
--require-zero-signals
--require-bootstrap-capacity
```

Implementation report 已經列咗類似 threshold flags，但目前 load driver usage 只見到 `--summary-only`、`--confirm-production-load` 等，未見 `--output` 或 `--max-5xx` 呢類真正 gate options。([GitHub][5])

我會令 threshold failure 直接 non-zero exit，唔好只係 report 入面寫 fail。即係 release script 可以咁：

```bash
npm test -- --test-concurrency=1
npm run check
npm run smoke:production:bootstrap -- \
  --url https://ks2.eugnel.uk \
  --cookie "$KS2_SESSION_COOKIE" \
  --max-bytes 200000 \
  --max-sessions 12 \
  --max-events 100

npm run capacity:classroom -- \
  --production \
  --origin https://ks2.eugnel.uk \
  --confirm-production-load \
  --demo-sessions \
  --learners 10 \
  --bootstrap-burst 10 \
  --rounds 1 \
  --output reports/capacity/latest-smoke.json \
  --max-5xx 0 \
  --require-zero-signals
```

Done when:

```text
A capacity run produces a JSON report file.
The JSON report includes commit SHA, environment, origin, learner count, bootstrap burst, rounds, auth mode, startedAt, finishedAt, endpoint P50/P95, max response bytes, signals and failures.
Any failed threshold exits non-zero.
docs/operations/capacity.md can link to or summarise the report.
```

## P0：加 production high-load safety guard

而家 production load 要 `--confirm-production-load` 同 explicit auth/demo sessions，呢個係好事。([GitHub][5]) 但下一步要避免誤打大流量 production test。

加：

```bash
--confirm-high-production-load
```

規則：

```text
if mode === production and learners > 20:
  require --confirm-high-production-load

if mode === production and bootstrapBurst > 20:
  require --confirm-high-production-load

if mode === production and learners > 60:
  require --confirm-school-load
```

呢個唔係 bureaucracy，係保護你自己。D1 每個 database 本質上 single-threaded，一次處理一個 query；query 慢時 throughput 會急跌，queue 滿會 overloaded。([Cloudflare Docs][6]) 所以 production load test 係真係可以壓壞你自己嘅 backend。

## P1：加 D1 / Worker telemetry，否則你只會知道「慢」，唔會知道「點解慢」

Load driver 目前能夠計 wall time、response bytes、endpoint status、signals，但 implementation report 都承認 D1 row metrics 未係 first-class output。([GitHub][1]) 下一階段必須補。

我建議喺 `worker/src/d1.js` 做 query wrapper，不要喺每個 endpoint 手寫 metrics。每次 request 建一個 request-local capacity collector：

```js
{
  requestId,
  endpoint,
  method,
  queryCount,
  d1RowsRead,
  d1RowsWritten,
  d1SqlDurationMs,
  d1ResultRows,
  d1Statements: [
    { name, rowsRead, rowsWritten, durationMs }
  ]
}
```

然後每個 capacity-relevant endpoint log 一行 structured JSON：

```json
{
  "kind": "capacity.request",
  "requestId": "ks2_req_...",
  "endpoint": "/api/bootstrap",
  "status": 200,
  "wallMs": 184,
  "responseBytes": 74210,
  "queryCount": 9,
  "d1RowsRead": 231,
  "d1RowsWritten": 0,
  "bootstrapCapacity": {
    "version": 1,
    "recentSessionLimitPerLearner": 5,
    "activeSessionLimitPerLearner": 1,
    "recentEventLimitPerLearner": 50
  },
  "signals": []
}
```

你要特別記錄：

```text
bootstrapCapacity present/missing
learners returned
selected learner id present
subject state rows returned
practice sessions returned
event rows returned
activity feed rows returned
read-model rows returned
derived write skipped because table missing
projection fallback used
command.projection.v1 read hit/miss/stale
```

Cloudflare Workers Free plan 係 10ms CPU/request、100k requests/day；Paid/Standard 係 30M CPU-ms/month included，單 invocation default 30s/max 5min CPU。([Cloudflare Docs][7]) D1 query execution/result serialization 都會跑喺 Worker CPU/memory limits 入面，所以 query row counts 同 JSON serialization 係同 CPU incident 直接相關。([Cloudflare Docs][6])

Done when:

```text
Capacity report can tell whether a failure is CPU, payload, D1 rows, D1 duration, D1 overload, auth, redaction, stale conflict or network.
Every load-driver request carries x-ks2-request-id.
Worker logs include that request id.
Runbook explains how to correlate load report rows with Worker Logs / tail output.
```

## P1：把 `docs/operations/capacity.md` 變成唯一 launch truth

目前 capacity runbook 已經有 certification status：family demo、small pilot provisional、30 learner beta not certified、60 stretch not certified、100+ target not certified，仲列明 capacity claim 必須基於 dated measurement，而唔係 planning estimate。([GitHub][8]) 呢個文件應該升級成 release evidence table。

加一個表：

```md
## Capacity Evidence

| Date | Commit | Env | Plan | Learners | Burst | Rounds | P95 Bootstrap | P95 Command | Max Bytes | 5xx | Signals | Decision |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| 2026-04-25 | 3978f59 | preview | Free | 10 | 10 | 1 | 320ms | 180ms | 81KB | 0 | none | small pilot smoke pass |
```

Decision value 要限制：

```text
fail
smoke pass
small pilot provisional
30 learner beta certified
60 learner stretch certified
100+ target certified
```

唔好畀人手寫「looks good」。要用 fixed status，避免 product claim 漂移。

## P1：做 real Worker integration load test

Implementation report 明確話目前 load driver unit-tested with mocked fetch，但仍然需要 real local Worker run。([GitHub][1]) 你要補中間層：唔好由 unit tests 直接跳 production。

加 script：

```bash
npm run capacity:local-worker
```

內部做：

```bash
npm run db:migrate:local
wrangler dev --local --port 8787
npm run capacity:classroom -- \
  --local-fixture \
  --origin http://localhost:8787 \
  --demo-sessions \
  --learners 10 \
  --bootstrap-burst 10 \
  --rounds 1 \
  --max-5xx 0 \
  --require-zero-signals
```

Done when:

```text
CI or local verification can spin up the real Worker route layer.
The load driver proves cookies, demo sessions, route handling and JSON response shapes against the Worker, not only mocked fetch.
```

## P1：加 dense-history subject smoke，唔好只測 bootstrap

原事故唔止 bootstrap；spelling command path 亦曾經會因 projection 讀 history 而危險。你哋已經優化 Smart Review start-session，但下一步要有 production/preview smoke。Implementation report 都列咗 H8：production/preview smoke 要 cover dense-history subject starts，尤其 Spelling Smart Review。([GitHub][1])

新增：

```bash
npm run smoke:production:spelling-start
```

測：

```text
GET /api/bootstrap
POST /api/subjects/spelling/command start-session smart
POST answer command
POST advance command
POST end-session command
```

每一步 assert：

```text
status 200
no 5xx
no exceededCpu signal
P95 wall under threshold
response bytes under threshold
projection fallback count = 0 ideally, <= 1 allowed during migration
command.projection.v1 read hit after first command
```

之後擴展到：

```text
grammar command
punctuation command
stale 409 recovery path
Parent Hub lazy recent sessions
Parent Hub activity feed pagination
```

## P2：把 `command.projection.v1` 從「persisted output」變成「hot-path input」

而家 report 話 `command.projection.v1` 已經 persist，但 follow-up 要「consume more directly」。([GitHub][1]) 呢個係下一個真正 CPU optimization。

目標係 common command path 唔再讀 event window，除非 read model missing/stale。命令流程應該係：

```text
1. Read subject runtime state.
2. Read command.projection.v1 by learner_id.
3. Apply command.
4. Use projection read-model for reward/dedupe/streak context.
5. Write subject state/session/events.
6. Incrementally update command.projection.v1.
7. Append public activity feed rows.
8. Return small command result.
```

Fallback：

```text
if command.projection.v1 missing or source_revision < safe lower bound:
  read bounded 200-event window once
  rebuild projection
  persist read model
  log projectionFallback=rehydrated
```

Do not silently use full `event_log`. That was the class of bug that caused the incident.

Add tests:

```text
high-history learner with 2,000 events:
  common command reads command.projection.v1
  event_log query count = 0 for hot path

missing projection:
  bounded fallback only
  projection persisted after command

stale projection:
  bounded catch-up only
  no full-history scan

idempotent replay:
  same requestId returns same mutation receipt
  no duplicate reward event
```

Done when:

```text
Common spelling/grammar/punctuation command paths use read-model state as input.
Bounded event window is migration/fallback path, not normal path.
Load report exposes projectionHit/projectionMiss/projectionFallback.
```

## P2：再縮 `/api/bootstrap`，因為 per-learner caps 仍然會隨 learner count 增長

目前 caps 係 per learner：每個 learner 5 recent sessions、1 active session、50 events。([GitHub][2]) 呢個對家庭 account 好，但如果產品之後走 classroom model，一個 adult/teacher account 有 30 learners，bootstrap 仍然可以變成：

```text
30 learners × 5 recent sessions
30 learners × 50 public events
多個 subject states
多個 game/read-model rows
```

即係「唔再跟全歷史增長」，但仍然「跟 account learner count 增長」。下一階段要做 **minimal bootstrap v2**：

```json
{
  "session": {},
  "account": {},
  "learners": {
    "selectedLearner": {},
    "list": "small display list only"
  },
  "sync": {
    "accountRevision": 123,
    "selectedLearnerRevision": 456
  },
  "selectedLearnerState": {
    "subjectStates": {},
    "activePracticeSession": {},
    "gameState": {},
    "readModels": {}
  },
  "bootstrapCapacity": {}
}
```

移走：

```text
all learners' recent sessions
all learners' public events
all learners' subject states unless needed for parent landing
parent activity
admin summary
word bank
full analytics
```

加 endpoint：

```text
GET /api/bootstrap?learnerId=...
GET /api/hubs/parent/summary?learnerId=...
GET /api/hubs/parent/recent-sessions?learnerId=...&limit=...
GET /api/hubs/parent/activity?learnerId=...&limit=...
GET /api/classroom/learners/summary
```

如果 product 仲係 family-oriented，可以保持 current envelope；但 code 應該加 launch-mode decision：

```text
family mode:
  selected learner + small sibling display list

classroom mode:
  selected learner only on bootstrap
  class roster summaries lazy
```

Done when:

```text
Bootstrap payload is bounded by selected learner, not by account learner count.
High-history 1 learner and 30-learner account have similar bootstrap CPU/payload for selected-learner load.
Parent/class surfaces lazy-load their own summaries.
```

## P2：加 ETag / revision-based not-modified bootstrap

當 app reload 或 multi-tab coordination follower 等緊時，好多 bootstrap 可能其實冇 state change。可以加 revision hash：

```text
ETag: "accountRev:123;learnerRev:456;capacityV1"
```

Client 下次：

```text
If-None-Match: "accountRev:123;learnerRev:456;capacityV1"
```

Server 如果無變：

```text
304 Not Modified
```

或者：

```json
{ "ok": true, "notModified": true, "revision": {...} }
```

我會偏向 JSON notModified，因為你有現成 repository hydrate/cache semantics，會少啲 browser/cache edge case。

Done when:

```text
Repeated bootstrap after no state change returns tiny response.
Load test has scenario: 30 repeated bootstrap no-change requests.
P95 bytes and CPU drop materially for repeated reloads.
```

## P2：D1 query budgets and query-plan audit

Cloudflare D1 Free 每 invocation 受 read subrequest limits 影響，D1 docs 列明 queries per Worker invocation Free 50 / Paid 1000。([Cloudflare Docs][9]) 即使未撞 limit，query count 太高都會增加 wall time、queueing、serialization CPU。

為每個 hot endpoint 定 hard budget：

```text
/api/bootstrap selected learner:
  target queryCount <= 10
  hard fail in test if > 15

/api/hubs/parent/recent-sessions:
  target queryCount <= 3

/api/hubs/parent/activity:
  target queryCount <= 3

POST /api/subjects/:subject/command:
  target queryCount <= 12
  hard fail in test if > 20
```

加 `EXPLAIN QUERY PLAN` audit script：

```bash
npm run db:query-plan:capacity
```

檢查：

```text
practice_sessions by learner_id, subject_id, updated_at desc, id desc
learner_activity_feed by learner_id, created_at desc, id desc
learner_read_models primary lookup
event_log fallback by learner_id, created_at desc, id desc
mutation_receipts by request_id / scope
state_revision lookup
```

Done when:

```text
Capacity tests assert query count budgets.
Query plan audit confirms no hot path table scan.
D1 rows read/write appear in capacity report.
```

## P2：Backfill 要有 production-safe resumability

你哋有 `npm run read-models:backfill`，但下一步要確保 production-safe。Implementation report 都話要先喺 local/preview DB copy 跑 backfill，confirm remote D1 migration state，並記錄 skipped derived writes。([GitHub][1])

Backfill 應該有：

```bash
--dry-run
--limit-learners 10
--resume-from <cursor>
--max-rows 1000
--sleep-ms 100
--output reports/read-model-backfill/...
--verify-only
```

Backfill table：

```sql
capacity_backfill_runs (
  id,
  started_at,
  finished_at,
  commit_sha,
  status,
  learners_seen,
  learners_updated,
  errors_json,
  cursor_json
)
```

Done when:

```text
Backfill can stop/restart without duplicate activity rows.
Backfill can verify source_revision coverage.
Production command path works if backfill is incomplete.
```

## P3：Browser-level validation

Unit tests cover multi-tab coordination, but report says real browser validation still needed.([GitHub][1]) 呢個最好用 Playwright，但如果你想避免新增 dependency，可以先做 manual smoke checklist；但長遠我會加 Playwright。

測試：

```text
Open same account in 3 tabs.
Force refresh all tabs within 1 second.
Only one leading bootstrap lease should be active.
Followers wait/reuse/back off.
No pending operation lost.
Stale command recovery does not full-bootstrap by default.
```

Add test counters:

```text
bootstrapLeaderAcquired
bootstrapFollowerWaited
bootstrapFollowerUsedCache
bootstrapFollowerTimedOut
bootstrapFallbackFullRefresh
staleCommandSmallRefresh
staleCommandFullBootstrapFallback
```

Done when:

```text
Real browser run proves localStorage coordination works in Chromium.
Report records number of actual /api/bootstrap requests triggered by 3-tab refresh.
```

## P3：Circuit breakers and graceful degradation

你唔想學生因 Parent Hub history 或 analytics 壞咗而做唔到題。下一步要加 degrade rules：

```text
If Parent Hub recent sessions fails:
  show "Recent history temporarily unavailable"
  do not retry more than once immediately
  do not force /api/bootstrap

If activity feed fails:
  hide feed, keep practice available

If read-model derived write fails:
  log derivedWriteSkipped
  preserve primary subject command write

If bootstrap capacity metadata missing:
  release blocker in smoke
  production runtime still returns safe minimal error, not private debug
```

Subject command path原則：

```text
Student answer write > reward/event projection > parent analytics
```

即係答案保存係最高 priority。Reward 可以遲啲補，analytics 可以 degrade，但 learner progress 唔可以 lost。

## Suggested PR sequence

我會按呢個順序做，避免同時改太多導致 rollback 困難。

| PR   | Name                                                        | Purpose                                                                        |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| PR A | `capacity: persist load evidence and threshold gates`       | `--output`、threshold flags、non-zero exit、evidence JSON                         |
| PR B | `capacity: add production load guardrails`                  | high-load second confirmation、safety block、max production learner guard        |
| PR C | `observability: add capacity metrics and D1 query counters` | request id、query count、rows read/write、response bytes、projection fallback logs |
| PR D | `capacity: run real worker local fixture`                   | deterministic wrangler dev/local Worker integration load test                  |
| PR E | `smoke: add dense-history subject command probes`           | spelling start-session、answer、advance、end-session smoke                        |
| PR F | `projection: consume command.projection.v1 on hot paths`    | read-model as input, bounded fallback only                                     |
| PR G | `bootstrap: selected-learner minimal bootstrap v2`          | bound bootstrap by selected learner, not account learner count                 |
| PR H | `browser: validate multi-tab bootstrap coordination`        | Playwright/manual e2e smoke with metrics                                       |

## Certification gates I would use

Family demo:

```text
bootstrap smoke passes
no redaction failure
no 5xx
bootstrap capacity metadata present
```

Small pilot:

```text
10 demo learners
10 bootstrap burst
1–3 command rounds
0 5xx
0 exceededCpu
0 D1 overload
P95 bootstrap < 1000ms
P95 command < 750ms
max bootstrap response < configured cap
```

30-learner classroom beta:

```text
30 learners
20–30 bootstrap burst
3 command rounds
repeat 3 times on preview or production-safe demo sessions
0 5xx in all runs
0 exceededCpu
0 D1 overload
P95 bootstrap < 750ms preferred, < 1000ms hard cap
P95 command < 400ms preferred, < 750ms hard cap
D1 row metrics captured
Worker logs correlated
rollback/degrade drill completed
```

60-learner stretch:

```text
60 learners
30–50 bootstrap burst
3–5 rounds
repeat on two separate days or deployments
same zero-failure rules
D1 queue/row metrics reviewed
```

100+ school-ready:

```text
100+ learners
50+ bootstrap burst
mixed subject commands, not Grammar only
Parent Hub lazy endpoints included
D1 row metrics, Worker tail evidence, rollback drill
decision recorded in docs/operations/capacity.md
```

Given current Cloudflare platform behaviour, I would not certify based on Free-tier limits alone. Workers Free has 10ms CPU/request and 100k requests/day, while D1 single DB throughput depends heavily on query duration and can overload if concurrent requests queue too much.([Cloudflare Docs][7])

## Product-facing recommendation

For product language, stay conservative:

```text
Ready for family demo / small pilot validation.
Not yet certified for whole-class simultaneous reload.
30-learner classroom beta pending dated preview/production capacity evidence.
```

Do not say:

```text
Supports 30 students
Supports 100 students
Free tier is enough
Classroom ready
```

until the evidence table has passing runs. The current runbook already says not to claim classroom or school readiness from Free-tier limits alone.([GitHub][8])

## Bottom line

You have implemented the right first-stage fixes. The remaining risk is no longer “we don’t know how to reduce bootstrap CPU”; it is “we don’t yet have hard evidence gates that stop us from shipping or claiming capacity too early.”

So next stage should be:

1. **Persist capacity evidence.**
2. **Fail release automatically on bad thresholds.**
3. **Add D1/Worker telemetry with request correlation.**
4. **Run real Worker and production-safe load tests.**
5. **Move command projection fully onto read-model input.**
6. **Shrink bootstrap further so it is selected-learner bounded, not account-learner bounded.**

That is the shortest path from “implemented optimisation” to “safe classroom launch decision.”

[1]: https://github.com/fol2/ks2-mastery/blob/main/docs/plans/james/cpuload/implementation-report.md "ks2-mastery/docs/plans/james/cpuload/implementation-report.md at main · fol2/ks2-mastery · GitHub"
[2]: https://github.com/fol2/ks2-mastery/blob/main/worker/src/repository.js "ks2-mastery/worker/src/repository.js at main · fol2/ks2-mastery · GitHub"
[3]: https://github.com/fol2/ks2-mastery/blob/main/worker/src/app.js "ks2-mastery/worker/src/app.js at main · fol2/ks2-mastery · GitHub"
[4]: https://github.com/fol2/ks2-mastery/blob/main/src/platform/core/repositories/api.js "ks2-mastery/src/platform/core/repositories/api.js at main · fol2/ks2-mastery · GitHub"
[5]: https://github.com/fol2/ks2-mastery/blob/main/scripts/classroom-load-test.mjs "ks2-mastery/scripts/classroom-load-test.mjs at main · fol2/ks2-mastery · GitHub"
[6]: https://developers.cloudflare.com/d1/reference/faq/ "FAQs · Cloudflare D1 docs"
[7]: https://developers.cloudflare.com/workers/platform/pricing/ "Pricing · Cloudflare Workers docs"
[8]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/operations/capacity.md "raw.githubusercontent.com"
[9]: https://developers.cloudflare.com/d1/platform/limits/ "Limits · Cloudflare D1 docs"
