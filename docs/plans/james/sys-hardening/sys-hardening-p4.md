我做咗一輪 remote repo scan。要先講清楚：呢個環境 clone GitHub 失敗，所以我無本地跑 test suite；以下係基於 GitHub rendered/raw pages、current main、PR page、P3 report、capacity docs、Worker docs、同幾個關鍵 source files 嘅 repo/code-path review。

我建議 P4 唔好叫 “System Hardening P4” 咁闊。應該叫：

# P4 — Production Certification & Post-P3 Surface Revalidation

核心意思係：**P3 已經將 hardening、capacity、multi-learner correctness 拉埋同一條線；P4 要做嘅唔係再開一堆新功能，而係將 P3 嘅 provisional readiness 變成可證明、可重跑、可守住嘅 production readiness。**

P3 其實做得好實在。P3 report 寫明已經完成 multi-learner bootstrap lock、first dated 30-learner production capacity evidence、D1 hot-path query budgets、dense-history full command loop、breaker follow-ups、repo split、CSP/HSTS residual handling，而且 zero-regression suite 4072/4075 pass，剩低一個 pre-existing flake 同兩個 skipped tests。([GitHub][1]) PR #377 亦已經 merged into main；而家 GitHub open PR page 顯示 0 open PRs，所以之前 P2/P3 嗰種 “report 話 done 但 PR 仲 open” 嘅 release-truth drift，今次表面上已經清咗。([GitHub][2]) ([GitHub][3])

但 P3 仲未等於「正式 30-learner certified」。P3 production run 係好靚：2026-04-27、commit `cbf39ec`、30 learners、burst 20、bootstrap P95 878.5ms、command P95 310.5ms、max bytes 18,578、0 5xx、0 signals。問題係 decision 仍然係 `small-pilot-provisional`，因為 evidence schema 仲係 v1；P3 report 自己寫明要 bump `EVIDENCE_SCHEMA_VERSION`，並 capture `meta.capacity` per-endpoint metrics，先可以 promote 到 30-learner beta。([GitHub][1])

所以 P4 第一件事唔係再 optimize，而係：**將 evidence system 升級到可以正式認證。**

---

## 我會定 P4 嘅 non-negotiable goals

P4 應該有五個主目標。

第一，**把 30-learner capacity claim 由 provisional 變成 certified**。唔係靠口講，而係靠 schema v2 evidence、per-endpoint capacity metadata、route/query budgets、同可重跑 verification。Capacity runbook 本身已經講明 capacity claim 必須用 dated measurement，而 evidence table 目前都仍然要求 schema v2 / `meta.capacity` 才可 promote。([GitHub][4]) ([GitHub][4])

第二，**scan post-P3 surface drift**。Current main 已經唔係純 P3 狀態；commit list 入面 P3 後面仲有 hero、grammar、punctuation、admin、solution docs 等 commits。P4 唔可以假設 P3 evidence 自動 cover 後續新增 surface。([GitHub][5])

第三，**將 Hero、Punctuation Star View、Admin Ops 等新/擴展路由納入 hardening / capacity budget**。Hero P1 已經加咗 `/api/hero/command`，雖然 zero persistent Hero state writes、亦係走正常 subject command pipeline，但佢仍然係一條 capacity-relevant command route。([GitHub][6]) Punctuation P6 亦有一個明確 performance warning：Worker command response 目前每次會 O(n) project Star View，對 2000+ attempts learner 可能變慢。([GitHub][7]) 呢啲就係 P4 要捉嘅 post-P3 regression risk。

第四，**security headers 要有決策，不可以永久 report-only**。而家 `security-headers.js` 仍然係 CSP Report-Only，HSTS 亦無 preload，CSP 仲保留 `unsafe-inline`。([GitHub][8]) 但 HSTS preload 唔可以亂開，因為 audit doc 清楚建議要先完成 DNS/operator sign-off。([GitHub][9])

第五，**refactor 要繼續，但只做 risk-reducing refactor**。P3 已經將 bootstrap、membership、mutation 相關 module 抽出一部分；但 P3 residuals 話 `repository.js` 仍然有 8,456 lines，row-transform pipeline 仍然係 dependency cliff。([GitHub][1]) P4 可以拆，但只拆 pure transforms / row mapping，唔應該一口氣重寫 command/bootstrap authority。

---

# Proposed P4 plan

## P4-U0 — Current-main hardening baseline

呢個係 P4 第一個 PR。目的係先釘死 P4 開始時嘅真實狀態。

要做一份 `docs/plans/james/sys-hardening/sys-hardening-p4.md`，入面記錄：

Current main commit SHA。
P3 capacity evidence row status。
P3 residual list。
Post-P3 new/changed surfaces。
P4 不做新 learner-visible feature 嘅 rule。
P4 release gates。
P4 risk register。

呢度要明確寫：**P4 係 certification / revalidation phase，不是 feature phase。**

Hardening charter 本身已經有穩定期規矩：hardening 期間唔應該加入新 learner-visible feature，除非係修補 broken/confusing/unsafe/slow/inaccessible behavior。([GitHub][10]) P4 應該重申呢條線，否則 Hero / Stars / Admin / Grammar / Punctuation 好容易又向 feature drift。

Acceptance criteria：

`sys-hardening-p4.md` 建立。
P4 baseline commit 記錄。
P4 scope 明確 exclude 新 subject、新 economy、新 dashboard、新 analytics product surface。
P4 每個 PR 都要標明屬於 certification、capacity、security、regression、或者 refactor。
No “drive-by feature” during P4。

---

## P4-U1 — Capacity evidence schema v2 + 30-learner certification promotion

呢個係 P4 最重要 PR。

目前 `scripts/lib/capacity-evidence.mjs` 入面 `EVIDENCE_SCHEMA_VERSION = 1`，而且 `requireBootstrapCapacity` 仲係 deferred。([GitHub][11]) P4 要將 schema 升到 v2，並且強制每個 capacity run capture per-endpoint `meta.capacity`。

Schema v2 至少要包括：

requestId
route / endpoint
method
status
response bytes
wall time
query count
D1 rows read
D1 rows written
D1 duration
bootstrapCapacity mode/version
capacity signals
Cloudflare Worker CPU/exceededCpu signal if available
test config hash
git SHA
environment
timestamp
learner count / burst / rounds
threshold config version

另外，`verify-capacity-evidence.mjs` 而家有 structural coherence checks，但 P3 residuals 自己都講 evidence verification 仍然可以被 fabricated；P4 至少要加 provenance fields，例如 GitHub Actions run URL、workflow name、commit SHA、threshold config hash。([GitHub][12]) ([GitHub][4])

重點係：P3 report 話「run itself does not need repeating」，但呢個只係喺已有 raw evidence 足夠 enrich 成 schema v2 嘅情況下先成立。([GitHub][1]) 如果舊 JSON 無 per-endpoint `meta.capacity`，我會選擇重跑 30-learner production/preview gate，而唔好用文件補數。

Acceptance criteria：

`EVIDENCE_SCHEMA_VERSION` 升到 2。
`capacity:classroom:release-gate` 產生 schema v2 JSON。
`capacity:verify-evidence` 對 30-learner claim 要求 schema v2。
Capacity docs evidence table 出現一行 `30-learner-beta-certified` 或清楚保留 `small-pilot-provisional` 並講明未能 promote 原因。
30-learner certification 必須仍然係 0 5xx、0 signals、bootstrap P95 ≤ 1000ms、command P95 ≤ 750ms、payload under cap。
Multi-learner bootstrap regression matrix 必須同時 pass。

---

## P4-U2 — Unblock local / preview capacity harness

PR #377 入面講得好清楚：local 10-learner smoke 被 `workerd` export rejection block，因為 `worker/src/index.js` 有 non-handler exported constants；所以 Step 1 operator precheck 無 produce。([GitHub][2]) 呢個要喺 P4 早期修。

原因好簡單：如果每次都要靠 production run 才知道 capacity regression，太遲、太貴、太危險。Local/preview smoke 唔係用嚟 certify production，但係用嚟早啲捉 regression。

Acceptance criteria：

`npm run capacity:local-worker -- --learners=10 --burst=10 --rounds=1` 可以跑。
Local run 唔需要 Cloudflare auth / production secret。
Local run 會輸出 schema v2 evidence，但標記為 `environment: local`，不可用作 production certification。
CI 可以跑一個 cheap capacity smoke。
`workerd` export rejection 被修，唔再 block preflight。

---

## P4-U3 — Post-P3 route and query budget sweep

P3 已經有 `/api/bootstrap`、subject command、Parent Hub 等 budget。P4 要做嘅係補返 current main 新增/變更 surface。

第一個係 Hero route。Hero P1 明確講 `/api/hero/command` 走 command route security chain，且 start tasks through normal subject command pipeline。([GitHub][6]) 所以 P4 要加：

`/api/hero/read-model` budget
`/api/hero/command` budget
Hero task launch 不可以 bypass learner write access
Hero command 不可以 create duplicate subject sessions under retry
Hero command 不可以 introduce persistent Hero state writes unless schema explicitly exists
Hero route must return bounded payload

第二個係 Punctuation Star View。Punctuation P6 已經承認 Star View projection 每次 command response O(n)，對 2000+ attempts learner 有 performance risk。([GitHub][7]) 呢個係典型 P4 server workload item。建議做一個 dense learner fixture，至少 2,000 attempts，測：

Punctuation command response P95
Star View projection duration
D1 rows read
response bytes
whether Star View can be cached/read-modelized
whether command response can return compact star delta instead of full projection

第三個係 Admin Ops。Worker README 顯示 admin ops surface 已經相當多，包括 KPI、activity、error events、occurrences、request denials、debug bundle、account search/detail、ops metadata、marketing messages、public ops ingest / active messages。([GitHub][13]) P4 要加 access/redaction/query budget matrix：

Parent 不可以 hit admin ops。
Demo 不可以 hit admin ops。
Admin search 必須 paginated。
Debug bundle 必須 redacted。
Public ops ingest 必須 cheap + rate limited。
Active messages endpoint 必須 cacheable / bounded。
Error event endpoints 不可以 leak learner payload。

Acceptance criteria：

`worker-query-budget.test.js` 覆蓋 Hero、Punctuation Star View、Admin Ops。
No new unbounded `event_log` / `practice_sessions` reads。
Admin routes have explicit role matrix tests。
Punctuation dense-history command no longer has obvious O(n) command-response projection risk, or risk is documented with a failing/pending performance budget that blocks certification above 30 learners。

---

## P4-U4 — CSP enforcement decision gate

我唔建議 P4 今日即刻 flip CSP enforcement。原因係 P3 residual 寫明要 monitor CSP logs 7 days；P3 merged / report 日期係 2026-04-27，所以最早合理 decision date 應該係 2026-05-04。([GitHub][1])

但 P4 可以即刻做兩件事。

第一，建立 `docs/operations/csp-enforcement-decision.md`，定義 2026-05-04 要睇乜：

report volume
violated directives
blocked URIs
auth/login impact
TTS/audio impact
Cloudflare/static bundle impact
admin ops impact
third-party Google login / font / image requirements
whether any report indicates real breakage

第二，寫 test 同 header ratchet。`security-headers.js` 而家仍然用 `Content-Security-Policy-Report-Only`，而且 `style-src` 仲有 `unsafe-inline`。([GitHub][8]) P4 要決定：

如果 reports clean：switch to enforced CSP。
如果 reports not clean：保留 report-only，但每個 violation 要有 owner / issue / expiry。
`upgrade-insecure-requests` 應該喺 enforcement flip 時一齊考慮。
`unsafe-inline` 可以短期保留，但必須有 inline style ratchet。

Acceptance criteria：

CSP decision doc merged。
CSP report review procedure documented。
Header tests cover enforced vs report-only mode。
Earliest enforcement flip after 2026-05-04, unless project explicitly accepts risk earlier。
No silent permanent report-only.

---

## P4-U5 — HSTS preload operator sign-off path

HSTS preload 唔應該由工程師憑感覺開。P3 HSTS audit 已經建議 defer preload，直到 operator enumerates DNS、verify apex/dev、confirm no HTTP-only subdomains、complete sign-off。([GitHub][9])

P4 要做嘅係將呢件事變成可執行 gate：

`docs/operations/hsts-preload-signoff.md`
列出 production domain
列出 subdomains
列出 Cloudflare zone settings
列出 dev/staging domains是否受 includeSubDomains 影響
列出 rollback impact
operator sign-off checkbox
date / approver

然後加 test：

如果 sign-off incomplete，`Strict-Transport-Security` 不可以包含 `preload`。
如果 sign-off complete，header 必須係 `max-age=63072000; includeSubDomains; preload` 或 project-approved equivalent。
Worker header 同 static `_headers` 不可以 drift。

Acceptance criteria：

HSTS preload either explicitly deferred with signed reason, or enabled with signed operator checklist。
No half-state。
No accidental preload before DNS audit。

---

## P4-U6 — Inline style debt ratchet

P3 residual 話仲有 232 個 `style={}` sites。([GitHub][1]) 呢個未必即刻係 production outage，但佢直接阻住 CSP 收緊。P4 唔需要一次清晒 232 個，但要有 ratchet。

建議 P4 target：

232 → ≤180，先清 high-risk / high-traffic surfaces：

auth shell
main app shell
practice control buttons
Parent Hub
Admin Ops
Hero card / Hero command surfaces
Grammar/Punctuation landing and post-session surfaces
error/loading/empty state primitives

Acceptance criteria：

新增 lint/audit：inline style count 不可上升。
P4 PR 至少 reduce 50 個 sites。
剩餘 inline styles 有 inventory。
No visual regression in core surfaces。
CSP decision doc references remaining count。

---

## P4-U7 — Breaker reset and sticky learner-fetch recovery

P3 residual 入面有兩個細但危險嘅 operational risk：

`bootstrapCapacityMetadata` reset 需要 admin/ops role，operator procedure 未夠完整。
`attemptedLearnerFetches` sticky guard 可能令 transient failure 後無法恢復，要有 UX prompt / retry path。([GitHub][1])

Circuit breaker code 本身已經有 named breakers、localStorage hint、transition callback、forceOpen/reset/snapshot/build degraded map；multi-tab cooldown desync 亦被接受為 residual。([GitHub][14]) ([GitHub][14]) P4 要做嘅唔係改到好複雜，而係補返 recovery story。

Acceptance criteria：

Operator runbook 有 breaker reset procedure。
Admin/ops endpoint access tested。
Multi-tab cooldown desync 有 telemetry counter。
Sticky learner fetch failure 後，breaker closes 時可以 clear guard 或顯示 “Retry loading learner stats”。
4-learner account regression test 覆蓋 transient sibling fetch failure → recovery。
No duplicate fetch storm。

---

## P4-U8 — Evidence provenance and anti-fabrication guard

Capacity runbook 已經點出一個問題：static evidence verification 可以被 fabricated，後續要加 signed provenance / raw log reference。([GitHub][4]) 呢個對 production readiness 好重要，因為一旦 capacity table 變成 release gate，就一定要防止「手寫 JSON 過關」。

P4 應該至少要求 schema v2 evidence 包括：

workflow run URL
git SHA
dirty tree flag
threshold config hash
load-driver version
environment
timestamp
operator
raw log artifact path
optional Cloudflare deployment id
optional signed attestation

Acceptance criteria：

`capacity:verify-evidence` 對 beta/stretched tiers require provenance。
Missing provenance = fail or at least cannot certify。
Warnings count displayed clearly。
Evidence table row must link to committed JSON artifact。
Manual evidence allowed only for `local-smoke` / `diagnostic`，不可 certify。

---

## P4-U9 — Repository row-transform refactor, but not a rewrite

P3 已經 extract 咗 `bootstrap-repository.js`、`membership-repository.js`、`mutation-repository.js` 等。Bootstrap module comment 仲寫明 bulk logic 留喺 `repository.js`，因為有太多 internal helpers；mutation module 亦清楚講 CAS UPDATE 係 authoritative stale-write defense，production D1 transaction no-op 唔可以靠 transaction 幻想。([GitHub][15]) ([GitHub][16])

所以 P4 refactor 應該好保守：

先 extract pure row transforms。
唔改 DB query semantics。
唔改 bootstrap envelope。
唔改 CAS/idempotency behavior。
唔改 learner access rules。
每步都跑 multi-learner bootstrap + dense-history command + capacity smoke。

建議抽：

`learner-row-transforms.js`
`subject-state-row-transforms.js`
`practice-session-row-transforms.js`
`event-log-row-transforms.js`
`read-model-row-transforms.js`

Acceptance criteria：

`repository.js` line count 明顯下降。
No behavior change snapshots。
Bootstrap capacity version no unnecessary bump。
All multi-learner / notModified / sibling invalidation tests pass。
No circular imports。
No widening of public API。

---

## P4-U10 — 60-learner stretch preflight, not certification yet

呢個要放最後，唔好一開始就跑。只有 U1-U3 pass，先做 60-learner preflight。

目的唔係即刻 claim 60 learners ready，而係知道下一個 bottleneck 係邊度：

Worker CPU？
D1 rows read？
Star View projection？
Hero command route？
Admin active messages？
Bootstrap notModified?
Retry storm？
Payload bytes？
Circuit breaker transition？

Acceptance criteria：

60 learners / burst 30 / 1 round preview or production-demo run。
Schema v2 evidence。
Decision 可以係 `60-learner-stretch-candidate` 或 `fail-with-root-cause`。
不可以因為一次 pass 就直接叫 school-ready。
如果 fail，P4 completion report 必須列 top bottleneck and next fix。

---

# P4 suggested PR sequence

我會咁排，避免大爆炸 PR：

1. `docs(hardening): add P4 production certification baseline`
   釘死 scope、current main SHA、post-P3 surface list、release gates。

2. `capacity(evidence): bump classroom evidence schema to v2`
   加 per-endpoint `meta.capacity`、provenance fields、verification rules。

3. `capacity(local): unblock local worker classroom smoke`
   修 `workerd` export rejection，令 10-learner local smoke 可以跑。

4. `capacity(routes): add Hero, Punctuation Star View, and Admin Ops budgets`
   將 post-P3 surface 拉入 query/row/bytes/latency budget。

5. `perf(punctuation): bound Star View command-response projection`
   處理 Punctuation P6 O(n) risk，或者轉 read-model / compact delta。

6. `security(csp): add enforcement decision gate and report review doc`
   唔一定即刻 enforce，但要有 2026-05-04 decision path。

7. `security(hsts): add preload operator sign-off gate`
   無 sign-off 不可 preload；有 sign-off 先 flip。

8. `security(styles): reduce inline style debt and add ratchet`
   232 → ≤180，並防止再上升。

9. `ops(breakers): document reset flow and fix learner-fetch recovery`
   補 sticky fetch recovery、operator reset、multi-tab telemetry。

10. `refactor(worker): extract repository row transforms behind locked tests`
    小步拆 `repository.js`，純搬 code，唔改 behavior。

11. `capacity(classroom): certify 30-learner beta and run 60-learner preflight`
    30 learner schema v2 certification；60 learner只做 stretch preflight。

---

# P4 completion criteria

P4 完成時，我會要求 completion report 可以清楚寫到以下幾句：

30-learner beta is certified under evidence schema v2, with per-endpoint `meta.capacity`, provenance, and committed evidence artifact.

Post-P3 routes are revalidated: Hero command, Punctuation Star View, Admin Ops, public ops endpoints, bootstrap, subject commands, Parent Hub.

4-learner account correctness remains locked: all writable learners appear, sibling compact state is present, selected learner heavy history remains bounded, notModified invalidates on sibling writes, viewer learners are not writable.

No capacity route has unbounded history read on hot path.

CSP has an enforcement decision dated on or after 2026-05-04, not indefinite report-only.

HSTS preload is either signed off and enabled, or explicitly deferred by operator sign-off.

Inline style debt has a ratchet and is lower than P3.

Breaker reset and transient learner-fetch recovery have operator and UX paths.

Repository refactor reduced dependency cliff without changing bootstrap/command semantics.

60-learner result is recorded as either candidate or fail-with-root-cause, not hand-waved.

---

## My blunt recommendation

P4 should not be “more hardening” in the vague sense. It should be a **certification phase**.

P3 proved the approach is now basically right. P4 needs to prove the repo can keep that correctness while new surfaces continue to land. The highest-risk areas are not the old bootstrap path anymore; they are:

Punctuation Star View projection becoming a new CPU hotspot.
Hero command/read-model becoming a new route outside old capacity assumptions.
Admin Ops expanding faster than access/redaction/query budgets.
Capacity evidence staying provisional because schema/provenance is incomplete.
CSP/HSTS staying in “almost hardened” mode forever.
Repository refactor accidentally changing multi-learner or CAS behavior.

So the clean P4 headline is:

**P4 turns P3’s provisional stability into enforceable production certification, then revalidates every route added after P3 before the project claims larger classroom readiness.**

[1]: https://github.com/fol2/ks2-mastery/blob/main/docs/plans/james/sys-hardening/sys-hardening-p3-completion-report.md "ks2-mastery/docs/plans/james/sys-hardening/sys-hardening-p3-completion-report.md at main · fol2/ks2-mastery · GitHub"
[2]: https://github.com/fol2/ks2-mastery/pull/377 "feat: P3 — Stability, Capacity Evidence, and Multi-Learner Correctness by fol2 · Pull Request #377 · fol2/ks2-mastery · GitHub"
[3]: https://github.com/fol2/ks2-mastery/pulls?q=is%3Apr+is%3Aopen "Pull requests · fol2/ks2-mastery · GitHub"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/operations/capacity.md "raw.githubusercontent.com"
[5]: https://github.com/fol2/ks2-mastery/commits/main "Commits · fol2/ks2-mastery · GitHub"
[6]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/hero-mode/hero-mode-p1-completion-report.md "raw.githubusercontent.com"
[7]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/punctuation/punctuation-p6-completion-report.md "raw.githubusercontent.com"
[8]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/worker/src/security-headers.js "raw.githubusercontent.com"
[9]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/hardening/hsts-preload-audit.md "raw.githubusercontent.com"
[10]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/hardening/charter.md "raw.githubusercontent.com"
[11]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/scripts/lib/capacity-evidence.mjs "raw.githubusercontent.com"
[12]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/scripts/verify-capacity-evidence.mjs "raw.githubusercontent.com"
[13]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/worker/README.md "raw.githubusercontent.com"
[14]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/platform/core/circuit-breaker.js "raw.githubusercontent.com"
[15]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/worker/src/bootstrap-repository.js "raw.githubusercontent.com"
[16]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/worker/src/mutation-repository.js "raw.githubusercontent.com"
