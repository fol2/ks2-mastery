# Punctuation B — Engineering / System / Code Reality Review

版本：P7 後工程審核草案  
範圍：只討論 KS2 Webapps 入面嘅 **Punctuation** subject  
目的：回答「而家工程上係咪真係支撐到產品契約？邊啲已經完成？邊啲 claimed 但未完全證明？邊啲以為 work 但其實有風險？下一步應該 harden 咩？」

---

## 0. Executive engineering judgement

P7 後，Punctuation 工程狀態比 P4/P5 時成熟好多。最大改善係：

- `punctuation-manifest.js` 成為 canonical client-safe manifest，減少 skill / cluster / reward / monster mapping drift。
- Worker command path 已經 inject Star evidence events，再交 reward projection。
- Punctuation Doctor 提供 admin-only safe diagnostic。
- Telemetry rate limit 改成 rolling 7-day window，避免 lifetime cap。
- Real Worker journey / pending / degraded proof 比之前扎實。
- Render-time side effects 已經移入 `useEffect`。
- Star-evidence latch writer 減少 live Star projection 同 Codex high-water 之間嘅 drift。

但我唔會話已經「完全 finished」。而家最大風險係 **truth mismatch**：docs、projection、events、Codex、Home、Landing、Summary、Punctuation Doctor 必須永遠講同一個真相。P7 已經解決好多，但仍然有幾個地方要核實 / harden：

- Production doc 入面仍然見到 `punctuation:::` mastery key 例子，似乎同 real format 不一致。
- Production doc 講 Quoral Grand threshold 一套，code 入面 `GRAND_TIERS` 似乎係另一套。
- P7 completion report 同 deferred list 同時提到 Quoral backend / shadow display，需要工程釐清實際已完成範圍。
- GPS / transfer context integration into Stars 仍係 deferred。
- `safeSummary` 依然偏向 clone + forbidden-key scan，而唔係 strict allowlist。
- 有啲 legacy export / comments / tests 仍然保留舊 mental model。

---

## 1. 我哋工程上是否足夠 deliver learner perspective？

### 判斷：大致係，但需要繼續 hardening，不應再加新 feature。

Learner perspective 需要：清楚 landing、短 round、feedback、summary、Punctuation Map、可信 progress、no answer leaks、Worker production authority。

目前 code 支持得比較好：

- `PunctuationSetupScene.jsx` 已經有 mission dashboard、primary CTA、monster Star meters、Map 入口、secondary Wobbly/GPS drawer。
- `PunctuationSessionScene.jsx` 負責 active / feedback flow，並區分 item input contract：insert/fix/paragraph prefill，combine/transfer blank，GPS save answer/no instant feedback。
- `PunctuationSummaryScene.jsx` 提供 score chips、skill chips、next action、monster teaser、GPS review cards、Back escape path。
- `PunctuationMapScene.jsx` 提供 14 skills browsing、filter、monster grouping、skill detail、focused practice。
- Worker read model 有 forbidden-key scan，active item / feedback / summary 不應 leak validators、answers、hidden queues。
- Real Worker-backed journeys 已經比之前更接近 production 行為。

### 仍然要小心

1. **GPS / transfer learning value 未完全連到 Stars**  
   UI 有 GPS / transfer / combine / paragraph，但 P7 deferred 明確指出 GPS / transfer context integration into Stars 仍未完整。Learner experience 可以完成，但 reward/evidence truth 未完全閉環。

2. **Landing / Summary 真相要一致**  
   P5/P6/P7 已經修好多，但任何新 projection field 都要保證 Landing、Summary、Map、Codex、Home 同 Punctuation Doctor 一致。

3. **Child-facing copy 與 technical state 要隔離**  
   Child UI 應該講 Not caught / Egg / Hatch / Growing / Strong / Mega / Stars，不應講 reward unit、stage index、release id、mastery key。

4. **Browser path vs Worker path 仍要防 drift**  
   Local/dev harness 可以存在，但 production authority 必須係 Worker。任何新 UI test 如果只靠 direct dispatch / fake fixture，都唔足夠。

---

## 2. 我哋工程上是否足夠 deliver game system？

### 判斷：Game system foundation 已經幾好，但 Star / Grand truth 要再核實。

已經做到：

- Active roster：Pealark、Claspin、Curlune、Quoral。
- Reserved roster：Colisk、Hyphang、Carillon 不應 learner-facing active render。
- 100-Star direct monster model。
- Star categories：Try / Practice / Secure / Mastery。
- Daily cap / anti-grinding logic。
- Claspin Mega gate，防止 2 simple units 直接 Mega。
- Curlune breadth gates。
- Quoral Grand Stars concept。
- Codex high-water / monotonic child display。
- Star-evidence latch events。

### 風險

1. **Quoral Grand Stars backend / UI / docs 要完全對齊**  
   `star-projection.js` 入面 Quoral tiers 似乎係 15 / 35 / 60 / 80 / 100；production doc 文字仍提 10 / 25 / 50 / 100。呢個一定要核實，否則小朋友 / parent / admin 會見到不同 expectation。

2. **Monster metadata 仍有 `masteredMax` 之類舊字段**  
   `monsters.js` 仍然以 count/max 描述 monster。呢啲可以保留作 legacy/asset metadata，但 child-facing reward 應以 Star projection 為準。下一輪可以加註解 / adapter，避免 future agent 用錯舊字段。

3. **Codex write concurrency 仍有 follow-up**  
   P7 deferred 提到 monster-codex CAS row_version，說明 high-water writes 仍有潛在並發 hardening 空間。

---

## 3. Learning 同 Game 是否已經 seamless link？

### 判斷：方向正確，而且比之前好好多。

正確鏈路應該係：

```txt
Learner answer
→ Worker subject command
→ deterministic marking / scheduling / progress mutation
→ attempts/items/facets/rewardUnits update
→ Star projection
→ star-evidence event
→ reward projection / codex high-water
→ read model
→ Landing / Summary / Map / Home display
```

目前 P7 後大致跟緊呢條線：

- Worker command path 先處理 subject command，再 derive Star evidence events，再 run reward projection。
- Reward projection 不是由 UI click 直接觸發。
- Star display 有 high-water merge，避免 child-facing downgrade。
- Punctuation Doctor 可以 safe explain blockers。

### Seam 問題仍可能存在

1. **Live projection vs persisted high-water**  
   P7 已加 latch writer，但下一步仍要確保所有 surfaces 都係同一邏輯：live + high-water merge，而唔係各自計。

2. **GPS mixed evidence 判斷要核實**  
   Star projection 入面 mixed evidence 似乎可以由 GPS attempt 出現而觸發。要核實係「任何 GPS attempt」還是「GPS clean / valid / marked success」；如果係任何 attempt，可能太寬。

3. **Summary / Landing / Map 不能用不同 field**  
   任何 surface 用 `stats.securedRewardUnits`、`ui.starView`、`codexState`、`progress.rewardUnits` 時，要確保語義清楚，唔好又出現 P5 前 `published = secured` 類 bug。

---

## 4. Reward system 是否正確 connected to learning？

### 判斷：比之前正確好多，但仍要做 evidence-truth hardening。

P5 前最大問題係 Monster stage 可以由 tiny denominator 快速 Mega，例如 Claspin 2/2 simple units。P5/P6/P7 已經改成 evidence-to-Stars model。

而家 reward connection 嘅正確點：

- Stars 來自 learning evidence，而唔係 raw click。
- Try Stars 有 cap，避免單純做題刷分。
- Practice Stars 有 daily throttle。
- Secure / Mastery Stars 需要 stronger evidence。
- Guided/support-only answer 不應直接 deep secure。
- Mega 需要 evidence gate。
- Quoral Grand Stars 不應係 direct Stars 簡單相加。

### 待核實 / 補強

1. **GPS / transfer context 未完全成為 late-stage evidence**  
   要明確：GPS correct、transfer clean、paragraph repair quality 如何 contribute late Stars。

2. **Pattern-based boosts deferred**  
   如果小朋友喺多個 distinct patterns 都穩，Star model 應該反映；目前仍 deferred。

3. **Grand Quoral exact contract 要落實**  
   Code、docs、UI、Punctuation Doctor、event narrative 必須一致。

4. **Star economy balance against Spelling**  
   P7 deferred 提到要校準同 Spelling 嘅 economy；呢個關乎 child expectation。Punctuation 100 Stars Mega 不能比 Spelling 容易太多，亦不能難到放棄。

---

## 5. 有冇 legacy code 要 refactor？

有，唔一定全部 urgent，但應該列入 hardening backlog。

### 5.1 `PrimaryModeCard` legacy export

`PunctuationSetupScene.jsx` 入面仍有 `PrimaryModeCard` export，comment 話 no longer rendered，只係給 backwards compatibility / isolated a11y tests。呢個係小風險：future agent 可能以為 setup 仍然係 card-first。建議：

- 將 tests 改成測真實 rendered dashboard。
- 如無外部 import，移除 legacy export。
- 如仍需要，移去 test-only helper 或清楚命名 `LegacyPrimaryModeCardForTests`。

### 5.2 Punctuation Map comments / manifest mirror

P7 已經引入 canonical `punctuation-manifest.js`，但部分 comments 仍然有「client mirror of canonical Worker content」嘅舊語境。建議清理 comment，避免下一位 agent 以為仍有多份 truth。

### 5.3 Summary redaction model

`safeSummary` 目前偏向 clone serialisable summary + recursive forbidden-key scan。呢個比無 redaction 好，但唔係最嚴格 allowlist。若 Punctuation 要再做 safety hardening，建議：

- Active item / feedback / summary / GPS review / diagnostic 分別用 allowlist。
- Forbidden-key scan 保留作 secondary safety net。

### 5.4 Local/dev service path

Local module / shared service 仍然存在，對 tests / demos 有用。但 production docs 明確要求 Worker-owned runtime。建議：

- 保持 bundle audit。
- 用 comments 清楚寫明 local path 不等於 production authority。
- 確保 new tests 有 Worker-path counterpart。

### 5.5 AI context pack / request-context-pack

AI context pack 目前唔係 child core flow。`request-context-pack` command / docs 需要清楚標示：

- non-authoritative。
- server-side only。
- redacted。
- not part of learner reward。

### 5.6 Docs stale field / mastery key

Production doc 仍顯示 `punctuation:::` 例子，似乎同真實 key format不一致。這是 documentation legacy，應該修到明確：

```txt
punctuation:<releaseId>:<clusterId>:<rewardUnitId>
```

同時要確認 docs 入面 Star thresholds 與 code 一致。

---

## 6. Subject 是否 properly connected to main system / Codex / main data？

### 判斷：基本係，但仍要做 final surface-truth audit。

已連接嘅地方：

- Subject registry / runtime：Punctuation 作為 Worker-command-backed subject slice。
- Home recommendation：可以根據 due/wobbly 等 dashboard stats 推薦 Punctuation；但 fallback 仍可能 Spelling-first。
- Game mastery shared constants：active / reserved monster IDs、grand monster ID。
- Codex / Monster Meadow：active/reserved rank 有分開，reserved tombstones 低 rank 以防 accidental render。
- Reward projection：domain events → game/codex state。
- Production gate：`PUNCTUATION_SUBJECT_ENABLED` 控制 exposure。
- Telemetry：Punctuation event ingestion / query / audit foundation。

### 要核實

1. **Punctuation Codex visibility under production flag**  
   要有 journey / integration test：flag on 時 Pealark/Claspin/Curlune/Quoral 出現；flag off 時不出現；reserved monsters never active。

2. **Home fallback behaviour**  
   Home 如果無 due work 仍 Spelling-first，呢個可能係 product decision，但如果 Punctuation 已經 mature，應該明確定義：何時 Home recommend Punctuation？fresh Punctuation learner 是否應該有 first-egg mission？

3. **Codex high-water race**  
   P7 deferred 提到 CAS row_version。若多 tab / repeated Worker response 同時更新 high-water，要防 stale overwrite。

---

## 7. What we have done so far

Punctuation 到 P7 大致完成：

1. **Production Worker runtime**  
   Worker owns session creation、item selection、marking、scheduling、progress mutation、events、reward projection、read model。

2. **14-skill Punctuation map**  
   Endmarks、apostrophes、speech、comma/flow、boundary、structure 等 grouped into 14 reward units。

3. **Practice modes / item modes**  
   Smart Review、Guided、Wobbly Spots、GPS Check；choose / insert / fix / combine / paragraph / transfer 等 item shapes。

4. **Learner UI surfaces**  
   Setup mission dashboard、Session、Feedback、Summary、Punctuation Map、Skill Detail modal。

5. **Monster roster correction**  
   Active：Pealark、Claspin、Curlune、Quoral。Reserved：Colisk、Hyphang、Carillon。

6. **100-Star model**  
   Direct monsters use Stars instead of tiny denominator stage ratio。

7. **Reward hardening**  
   Claspin/Curlune gates、daily throttle、monotonic display、star-evidence latch events。

8. **Canonical manifest**  
   One client-safe manifest for skills / clusters / reward units / active monsters。

9. **Read model redaction / bundle safety**  
   Forbidden-key scans and production bundle audit direction。

10. **Telemetry foundation**  
   Event kinds、allowlist、D1 table、rolling rate limit、audit query foundation。

11. **Punctuation Doctor**  
   Admin-only safe diagnostic showing blockers without answer leakage。

12. **Journey proof**  
   Real Worker-backed landing/session/summary/map/pending/degraded coverage improved.

---

## 8. What we claimed we have done, but may not be fully true

### 8.1 Production docs fully reflect Star model

P7 report says U12 updated docs. But current production doc still appears to show malformed mastery key `punctuation:::` and may still list Grand thresholds differently from code. This needs a docs/code truth pass.

### 8.2 Quoral Grand backend fully closed

P7 says Star truth is improved, but deferred list also mentions Quoral Grand Stars backend implementation / shadow display. This must be clarified:

- Is Quoral Grand Stars only displayed in UI?
- Is it persisted in codex high-water?
- Does it emit events?
- Does Punctuation Doctor read the same source?

### 8.3 Telemetry as operational dashboard

Telemetry ingestion/query exists, but production doc itself warns full dashboard/alerting is still aspirational. So claim should be “telemetry foundation”, not “operational telemetry system complete”。

### 8.4 GPS / transfer as mastery evidence

Practice UI supports GPS / transfer / combine / paragraph, but P7 deferred says GPS/transfer integration into Stars remains. So claim should be “GPS/transfer practice exists”, not “GPS/transfer fully drives mastery Stars”。

### 8.5 AI/context-pack learner product

AI context pack should not be claimed as learner-facing Punctuation product. It remains non-authoritative / server-side / redacted / teacher-admin style if used.

---

## 9. What we thought was working but actually not, or was historically fragile

### Already fixed or mostly fixed

- Setup card originally only selected mode, not start; later fixed。
- Landing was button wall; P5/P6/P7 moved to mission dashboard。
- `securedRewardUnits` inflated by published/tracked count; P5 fixed direction。
- Claspin could Mega too easily from 2 units; P6/P7 added gates。
- Star display could drift from codex latch; P7 added star-evidence latch writer。
- Telemetry sessionless events could become lifetime-capped; P7 rolling window fixed。
- Render-time telemetry/prefs dispatch existed; moved to effect。
- Constants drift across skill/monster/reward mapping; P7 manifest reduced drift。
- Pending/degraded journeys were previously scaffolded but not proven; P7 improved proof。

### Still suspicious / needs verification

1. **Production doc mismatches**  
   Mastery key and thresholds may still be stale.

2. **GPS mixed evidence permissiveness**  
   Need verify GPS attempt contribution requires meaningful / clean evidence, not just any attempt.

3. **Summary redaction strategy**  
   Forbidden-key scan may be enough currently, but strict allowlist would be stronger.

4. **Legacy tests around non-rendered components**  
   `PrimaryModeCard` isolated tests may create false confidence about actual landing UX.

5. **Home recommendation fallback**  
   Spelling-first fallback may be product-ok, but if Punctuation should onboard first-egg learners, logic needs explicit spec.

6. **Codex CAS race**  
   High-water writes should be idempotent and race-safe.

---

## 10. What we know we have not delivered yet

Known not-delivered / deferred items, focused on Punctuation only:

1. **GPS / transfer context fully integrated into Stars**  
   Need clear rules for how GPS clean, transfer rewrite, paragraph repair, sentence combine contribute to late-stage Stars.

2. **Pattern-based Star boosts**  
   Distinct punctuation patterns / template families should matter more precisely.

3. **Star economy balancing against Spelling**  
   100 Stars = Mega must feel equally meaningful across subjects.

4. **Quoral Grand backend/source-of-truth clarification**  
   Need ensure code/docs/UI/events/Doctor use same grand source.

5. **Desktop/tablet visual matrix**  
   Current journeys stronger than before, but broad visual baseline still deferred.

6. **In-session pending proof**  
   Summary/map pending proof improved, but in-session submit pending/stalled proof remains future hardening.

7. **Monster-codex CAS row_version**  
   Needed for stronger high-water race safety.

8. **Full operational telemetry dashboard / alerting**  
   Ingestion/query exists; dashboard/alerts still not complete.

9. **Docs truth reconciliation**  
   Production doc must match code exactly for mastery key format, Star thresholds, Quoral gates, and telemetry status.

10. **Strict summary allowlist**  
   Optional but recommended safety refactor.

---

## 11. Recommended next engineering posture

下一步唔應該加新 Punctuation mode、new monsters、new AI learner feature。建議 posture：

```txt
Punctuation hardening phase only:
- truth reconciliation
- docs/code consistency
- GPS/transfer Star integration
- Quoral source-of-truth clarification
- Codex race safety
- visual/journey proof expansion
- stale legacy cleanup
```

成功標準唔係「再多一個功能」，而係：

- 一個 learner surface、parent/admin surface、Punctuation Doctor、Codex、Home 都講同一個 Star truth。
- 一個 engineering agent 可以由 manifest 推導所有 skill/cluster/monster/reward mapping。
- 一個 admin 可以安全回答「點解未 Mega」。
- 一個小朋友可以相信 100 Stars = 真正努力同掌握，而唔係 UI 數字。

---

## 12. 參考過嘅 repo / docs

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
- `README.md`
- `docs/subject-expansion.md`
