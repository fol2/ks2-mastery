我掃完。先講結論：你第一點完全啱。**而家 Admin 功能其實已經唔少，但入口同資訊架構未夠正式**。下一個 phase 唔應該再盲加功能，而係做一個 **Admin P2：入口 + 分區重組 + Debugging cockpit + Content/Asset merge**。

我今次係用 GitHub source-level review 掃 main、兩份 report、Admin surface、Worker route、client API、Home/TopNav、PR list。因為我呢邊 container clone GitHub 時 DNS resolve 唔到，所以我冇本地 run test suite；下面係 repo source review，不是 executed local test run。

## 1. Admin Page 入口：現在確實未做好

repo 入面其實已經有 `admin-hub` route、`openAdminHub()` store action、同 `open-admin-hub` controller action。React App 亦已經 lazy-load `AdminHubSurface`，即係 Admin 畫面本身存在。問題係：**Landing/Home/TopNav 冇可靠入口**。Home 目前只見到 Parent Hub 條件式按鈕，冇 Admin button；TopNav 亦唔見 admin navigation。你講「Landing Page 冇位俾我入」係準確。([GitHub][1])

我建議第一個 hotfix 就係加直接 URL：

```text
/admin
/admin/accounts
/admin/debug
/admin/content
/admin/marketing
```

唔需要 UI link 都得。做法係：

前端 boot app 時，如果 `location.pathname` 係 `/admin` 或 `/admin/...`，就 initial route 去 `admin-hub`，並用 subpath 設定 active section。Worker/hosting 層要保證 `/admin*` reload 時會 serve SPA index，而唔係 404。AdminHub 自己已經有權限 gate，冇 admin/ops role 就會顯示 Access Denied。`AdminHubSurface` 目前明確要求 admin 或 operations platform role；而 Worker docs 目前平台角色係 `parent`, `admin`, `ops`，唔係 “writer”。([GitHub][2])

你問我睇唔睇到你係咩 user：**我睇唔到你實際 signed-in session 或 D1 row**。你可以即刻喺已登入 browser 試：

```js
fetch('/api/auth/session').then(r => r.json()).then(console.log)
```

或者試：

```js
fetch('/api/hubs/admin').then(r => r.status).then(console.log)
```

如果係 200，你個 account 應該有 admin/ops 權限；如果係 401/403，就係 session/role 問題。Owner bootstrap 可以喺 D1 查：

```sql
SELECT id, email, platform_role FROM adult_accounts;
```

必要時 owner-only 更新：

```sql
UPDATE adult_accounts
SET platform_role = 'admin'
WHERE lower(email) = lower('your@email@example.com');
```

下一個 PR 我會命名做：**admin-p2-entry-route**。Acceptance criteria 好簡單：signed-in admin 開 `/admin` 直接入 Admin；ops 開 `/admin` 可 view；parent/demo 開 `/admin` 會被拒；reload `/admin/debug` 唔 404；登入後可以 redirect back `/admin`。

## 2. Admin 現在已經做到啲乜

P1.5 report 顯示 admin hardening 已經完成好多：per-panel freshness/error visibility、IPv6-aware public endpoint rate limiting、row_version CAS、KPI reconciliation cron、`ops_status` auth-boundary enforcement、error cockpit 加 build hash attribution。報告亦講 5 個 PR 已 merge 入 main：#216、#227、#270、#292、#308。([GitHub][3])

以目前 repo 來講，Admin 大概已經有以下能力：

**Account Management / GM 類功能**

你已經有 account role management、platform role 管理、account ops metadata。Account metadata 包括 `ops_status`、plan label、tags、internal notes；而 P1.5 已經將 `suspended` / `payment_hold` 變成有 enforcement 的狀態，不再只係 label。Admin UI 亦有 last-admin safety 類保護。([GitHub][2])

**Dashboard / SaaS operating view**

Admin dashboard 有 real/demo accounts、learners、sessions、event logs、client/server/admin error origins、open/investigating/resolved/ignored error counts、account ops updates、cron/reconcile warning。呢個已經係 SaaS owner 需要嘅第一層 health dashboard。([GitHub][2])

**Debugging / Error Log Centre**

Error centre 已經唔係簡單 list。UI 有 filters：status、route、kind、date range、release、reopened-after-resolved。Error detail drawer 有 kind/message/route/first frame/user agent/occurrence count/first seen/last seen/release/resolved info/linked account recent events。呢個係你想要「唔好亂估，要用 log debug」嘅核心工具。([GitHub][2])

**Audit / Recent Activity / Ops stream**

Admin read model 包含 audit log、demo operations、ops activity stream、KPI、account ops metadata、error summary、learner support、post-mastery debug、seed harness 等。UI 亦有 recent activity / mutation receipt 類資料。([GitHub][4])

**Content Release / Subject diagnostics**

Admin 目前有 content release status、import validation status、spelling published snapshot、words/sentences/draft/published/validation/export/open settings 類入口。另有 Post-Mega spelling debug、post-mastery seed harness、Grammar concept confidence、Grammar Writing Try archive/delete 等 subject-specific admin 工具。([GitHub][2])

**Monster Visual / Asset Effect Config**

另一份 report 顯示 Monster Effect Config 已經完成整合：Admin 可 author effect library、per-monster binding、celebration tunables、closed-template catalog，並且 visual + effect 用同一 draft/publish/restore path。Runtime 用 published `effect` sub-document，並有 code fallback。重點係 admin 只調參數，唔直接寫 DOM/CSS/JS，template/catalog 係 closed allowlist，呢個方向係安全嘅。([GitHub][5])

## 3. 我發現兩個要即刻查嘅 flow flaw

呢兩點我會放喺下一個 phase 最前，因為佢哋可能令你以為 hardening 已完成，但某些 API 實際冇完全接上。

第一，**Account metadata CAS 可能前後端冇接實**。Client API `updateAccountOpsMetadata` 會送 `expectedRowVersion`，但我喺 Worker route 見到 `/api/admin/accounts/:id/ops-metadata` 讀 body 後 call `repository.updateAccountOpsMetadata(...)` 時似乎冇 forward `expectedRowVersion`。如果 repository 依賴呢個值做 CAS，咁 UI 以為有 concurrency protection，但 route 可能冇真正保護到。呢個要即刻寫 test pin 住。([GitHub][6])

第二，**Error centre filters 可能 UI 有、route 冇完整傳落 repo**。Client API 支援 `route`, `kind`, `lastSeenAfter`, `lastSeenBefore`, `release`, `reopenedAfterResolved` 等 query；但 Worker route 我見到似乎只抽 `status` 同 `limit` 去 call `readAdminOpsErrorEvents`。如果係真，Admin UI 入面嘅 route/kind/release/date filter 可能表面可選，但 backend 無效。呢個對 debugging 好傷，因為你以為 filter 咗某條 route，但其實睇緊混合資料。([GitHub][6])

我會將呢兩個列做 **P2.0 blocker hotfix**，先過測試再做大重組。

## 4. Admin 應該點分區

我同意你提出嘅四大區，但我會稍微改名，令 business owner 用起來更清晰：

```text
Admin
  Overview
  Account Management
  Debugging & Logs
  Content Management
  Marketing / Live Ops
  System Settings / Permissions placeholder
```

**Overview**
放 KPI、real/demo usage、error summary、cron/reconcile status、current release/build、capacity/degradation 狀態。你而家有 #326 open PR 做 circuit breakers + graceful degradation，呢啲資料 merge 後應該入 Overview/System Health，而唔係散落 logs。PR list 我見到 #326 capacity circuit breaker/graceful degradation 同 #323 regression sweep design 仍然 open。([GitHub][7])

**Account Management**
放 account search、role、ops_status、plan、tags、notes、learner membership/support view、last activity、linked errors。GM 類操作集中喺度。

**Debugging & Logs**
放 Error Log Centre、route/release filters、linked account debug bundle、recent mutation receipts、denied request logs、subject command failures、capacity/circuit breaker events、client error ingest health。你收到用戶 feedback 時，第一步應該係入呢區查：account、route、release、fingerprint、recent subject command，而唔係估 CPU 或亂改邏輯。

**Content Management**
放 spelling/grammar/punctuation/content release、word/content library、subject merge dashboard、monster visual/effect config、asset metadata、animation/effect tuning。呢區唔應該只係「字庫」；因為你個產品核心係 skill/template/item + misconception tracking，Content Management 要管理嘅係 learning content metadata，而唔係純文字。你之前 design brief 已經明確講 skill、template、specific item 三層 tracking 同 misconception 是 first-class data，呢個要反映到 Admin。

**Marketing / Live Ops**
先做 placeholder，之後放 announcements、maintenance banner、campaigns、seasonal challenge、reward multiplier、content unlock、event delivery。呢區將來可以好似 online game live ops，但而家唔好同 Content Publish 混埋。

**System Settings / Permissions placeholder**
而家唔需要複雜權限，但要留位。現階段只需要 `admin` / `ops`。將來先加 `content_admin`, `marketing_admin`, `support`, `viewer`。

## 5. Subject merge 應該點理解

我建議你唔好將 “subject merge” 理解成將 Spelling/Grammar/Punctuation/Arithmetic/Reasoning 所有 engine 混成一堆 code。正確方向係：**Admin shell 合併，但 subject runtime 保持分離**。

Worker docs 已經話 subject command runtime 係經 `/api/subjects/:subjectId/command`，並處理 session ownership、learner access、demo expiry、request idempotency 等。即係 backend 已有 subject boundary。([GitHub][8])

所以 Admin 入面做一個 **Subject Management** section：

```text
Content Management
  Subject Overview
    Spelling
    Grammar
    Punctuation
    Arithmetic
    Reasoning
    Reading / future
  Content Library
  Release Validation
  Skill/Template/Item Coverage
  Misconception Taxonomy
  Monster & Asset Config
```

每個 subject 顯示：

content version
published/draft status
validation errors
coverage by skill/template
recent learner usage
recent errors by route/build
subject command failure rate
weakest skills / common misconceptions
release readiness

呢個比「幾多條題目」有用得多，因為你可以知道係 content 壞、engine 壞、asset 壞、定係 learner flow 壞。

## 6. Asset metadata / Animation / CSS 應該點做

Monster Visual/Effect Config 其實已經係一個好好嘅 prototype。佢用 closed templates、allowlisted lifecycle/layer/reduced-motion/params/modifier classes，admin 只調參數，不直接輸入 JS/CSS/DOM。呢個設計要保留。([GitHub][5])

下一步係將佢由「Monster Visual Config」升級成 **Asset & Effect Registry**：

```text
Asset Registry
  asset_id
  display_name
  category
  monster_id / subject_id / context
  manifest_hash
  runtime_fallback_status
  visual_config
  effect_config
  animation_tokens
  css_token_overrides
  reviewed_status
  published_version
  last_published_by
```

關於 CSS，我唔建議俾 admin 寫 raw CSS。應該做 **CSS tokens / approved class variants**：

```text
size: small | medium | large
motionIntensity: none | low | normal | high
glow: none | soft | strong
celebrationBurst: off | low | normal
reducedMotionMode: static | simplified
```

咁 business owner 可以調效果，但唔會變成 XSS / broken layout / random CSS bug factory。

## 7. Debugging 下一步：要由 error list 變成 debug cockpit

而家 Error Centre 已經可以用，但要再推一步先真正幫你處理「我收到 feedback，但唔知邊度壞」。

我建議新增一個 **Debug Bundle** 功能：

輸入 account email / learner id / session id / route / approximate time，Admin 自動匯總：

recent client errors
server/admin errors
subject command failures
bootstrap payload version
current release/build hash
capacity/degradation state
recent account ops changes
recent learner activity
recent content release version
monster/effect config version
browser/user-agent
route path
linked fingerprints

然後有一個 copy button：

```text
Copy debug bundle
```

你之後排 bug 時，就唔係「估係 CPU、估係 hardening、估係 content」，而係一份 evidence packet。

P1.5 report 已經留低幾個 residual follow-up：occurrence timeline deferred、FTS5 deferred、operator audit trail on 403 denials、auto-reopen log semantics、canary/blue-green deferred。呢啲全部都應該歸入 Debugging & Logs 下一階段。([GitHub][3])

我會優先做：

```text
ops_error_event_occurrences
request_denial_events
capacity_events
subject_command_failure_events
admin_debug_bundles
```

尤其係 `request_denial_events`。好多 production 問題其實係 403/role/status/payment_hold/demo-expiry，但如果你冇 log，使用者只會話「入唔到」、「按唔到」、「卡住」。

## 8. 下一個 phase plan

我會咁排：

### P2.0 — Admin Entry + Critical Route Fixes

目標：先令你入到 Admin，兼修補可能嘅 hardening 接線漏洞。

工作：

加 `/admin` `/admin/debug` `/admin/accounts` `/admin/content` `/admin/marketing` direct routes
Worker/SPA fallback 支援 reload
登入後保留 target admin path
Admin/ops role gate
parent/demo/suspended/payment_hold route tests
forward `expectedRowVersion` 到 account metadata repository
forward error centre all filters 到 repository
加 regression tests pin 住 CAS + filters

呢個係第一 PR，唔好拖。

### P2.1 — Admin Information Architecture

目標：將而家所有散落 panel group 成正式 admin console。

工作：

Admin left/sidebar or top section tabs
Overview
Account Management
Debugging & Logs
Content Management
Marketing / Live Ops
Settings / Permissions placeholder
每區有 empty state、last refreshed、refresh failed、read-only/locked state
將「Admin / operations skeleton」呢類 wording 改走，因為而家唔係 skeleton 了

### P2.2 — Debugging Cockpit

目標：令 feedback 可以靠 logs 定位。

工作：

Error detail drawer 升級
occurrence timeline
release/build filter 真正 backend 生效
copy fingerprint
copy debug bundle
linked account/learner/session trace
denied request logs
subject command failures
capacity/circuit breaker events from #326 once merged
“new since release” / “reopened after resolved” queue

### P2.3 — Account Management Polish

目標：GM 工具變成可信、唔易誤操作。

工作：

account search
account detail page
ops_status transition confirmation
payment_hold/suspended reason
audit trail visible
notes/tags with version conflict UI
last admin lockout test
support view：linked learners、recent sessions、recent errors、recent content interactions

### P2.4 — Content Management + Subject Merge

目標：將 content、subject status、release validation、word library 合一。

工作：

Subject Overview
Spelling content release panel 正式化
word/content library editor
import/export validation
skill/template/item coverage
misconception taxonomy
subject release readiness
content version audit
subject-specific debug links

注意：subject runtime 不 merge，Admin view merge。

### P2.5 — Asset & Effect Registry

目標：將 Monster Visual/Effect Config 放入 Content Management，變成 general asset metadata system。

工作：

asset registry
per-monster visual/effect page
animation token editor
CSS token editor，不開 raw CSS
review checklist
draft/publish/restore
runtime fallback preview
reduced-motion preview
visual + effect atomic publish test，因為 mixture report 自己都話 atomic visual+effect publish claim 未被 Worker test pin 住。([GitHub][5])

### P2.6 — Marketing / Live Ops Placeholder

目標：先建立乾淨位置，不急住做複雜 live ops。

工作：

Announcements placeholder
Maintenance banner placeholder
Campaign placeholder
Event delivery schema draft
audience preview
draft/scheduled/published/paused/archived lifecycle
audit log
canary/test-account only publish

Marketing 不應該直接改 content publish，也不應該直接改 asset config。三者要分開 lifecycle。

## 9. 我建議下一批 PR 順序

我會用呢個順序：

```text
PR A: /admin direct route + auth redirect + smoke tests
PR B: fix admin account CAS route forwarding + error filter forwarding
PR C: Admin IA shell: Overview / Accounts / Debug / Content / Marketing
PR D: Debug Bundle + denied request logs + occurrence timeline
PR E: Content Management subject merge shell
PR F: Asset & Effect Registry under Content Management
PR G: Marketing / Live Ops placeholder
```

最重要係 PR A + PR B。你而家最大痛點係「我入唔到」同「我想 debug 但唔知 log 係咪真係準」。入口同 filter/CAS 先修，之後先做 comprehensive page。Otherwise Admin 會變得好大，但你仍然唔信佢。

[1]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/surfaces/home/HomeSurface.jsx "raw.githubusercontent.com"
[2]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/surfaces/hubs/AdminHubSurface.jsx "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/admin-page/admin-page-p1-5-completion-report.md "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/platform/hubs/admin-read-model.js "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/admin-page/pr100n119-mixture.md "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/platform/hubs/api.js "raw.githubusercontent.com"
[7]: https://github.com/fol2/ks2-mastery/pulls "Pull requests · fol2/ks2-mastery · GitHub"
[8]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/worker/README.md "raw.githubusercontent.com"
