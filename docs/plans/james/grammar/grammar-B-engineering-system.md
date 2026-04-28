# Grammar B — 工程、系統與 Code Review

**範圍：**只涵蓋 Grammar subject。  
**狀態基準：**根據 repo 最新 main 上的 Grammar Phase 3–7 reports、Phase 5/6/7 invariants、Grammar Worker / shared / UI / reward code scan。  
**用途：**這份文件回答「現在 engineering 是否支撐到產品設計？哪些已做？哪些未做？哪些以前以為 working 但其實曾經不 work？下一步應該留意甚麼？」

---

## 0. 一句話總結

Grammar 現在的工程形狀已經相當成熟：

> Worker owns scoring, scheduling, state mutation, persistence and read models；React renders read models and sends commands；Star/reward progress derives from learning evidence；child UI uses 100-Star display; adult/debug surfaces can explain Star counts; reward pipeline has monotonicity, idempotency and concurrency contract tests.

但它仍然不是「完全 finished subject」。下一步最大風險不在 UI，而在：

- content thin-pool
- answerSpec migration
- durable tier-level Star ledger
- exact first-secure timestamp
- Playwright state injection mechanism
- future Grammar + Punctuation GPS-level combined reporting

---

## 1. 我們是否在 good shape 去 deliver learner perspective？

### 1.1 短答：是，大致 good shape

原因：

- Grammar 已經不是 browser-local HTML prototype，而是 Worker-owned production subject。
- Child landing 已經變成 one-primary-CTA flow。
- Session UI 有 clear help visibility rules：pre-answer no AI/no support/no worked solution；Mini Test before finish no help/no feedback。
- Grammar Bank 存在，並用 child-safe confidence labels。
- Writing Try 是 non-scored transfer lane，且 Phase 7 已經 decouple from AI availability。
- Summary 已經用 Stars，而不是 raw concept count。
- Adult analytics 有 Star explanation debug surface，但 child surface 禁止 debug terms。

### 1.2 重要 caveat

Good shape 不代表 complete content。

Learner perspective 想做到「mixed, varied, durable, transferable Grammar mastery」。Engine / UI / reward 已支撐這件事，但 content pool 仍有薄弱處：

- 6 個 thin-pool concepts
- active_passive 和 subject_object 是 highest priority single-question-type thin-pool
- explain question type 只覆蓋 3 個 concepts / 2 個 distinct templates

所以目前的 learner system 架構健康，但 learning coverage 還未到理想 full depth。

### 1.3 工程上對 learner flow 的支撐

主要支撐點：

- `worker/src/subjects/grammar/engine.js`：deterministic engine、mastery updates、retry、recent attempts、support fields。
- `worker/src/subjects/grammar/commands.js`：command handler，連接 engine state、projection、Star evidence events。
- `worker/src/subjects/grammar/read-models.js`：safe read model。
- `src/subjects/grammar/session-ui.js`：session visibility / label truth table。
- `src/subjects/grammar/components/grammar-view-model.js`：dashboard、bank、summary、monster strip view models。
- `shared/grammar/grammar-status.js`：child/adult status taxonomy。

這些已經把「learning design」落到可測試 code。

---

## 2. 我們是否在 good shape 去 deliver game system？

### 2.1 短答：是，而且 P5–P7 後比之前健康很多

以前 Grammar 的 monster system 最大問題是 raw secure concept count 太粗，導致 small-denominator monsters 快速跳 Mega。Phase 5 後，所有 active Grammar monsters 統一 100 Stars。

現時 game system 有幾個正確特徵：

- 4 active monsters：Bracehart、Chronalyx、Couronnail、Concordium。
- Reserve monsters 保留但不 active：Glossbloom、Loomrill、Mirrane。
- 1 Star catches Egg。
- 15 / 35 / 65 / 100 non-linear curve。
- Stars 不是 XP。
- Mega requires retention evidence。
- starHighWater 確保 child-facing Stars 不倒退。
- legacy floor 確保 pre-P5 learners 不降級。
- P7 child surfaces 不再用 legacy stage field 作 monster display。
- Cross-surface display uses `displayState` (`not-found` / `egg-found` / `hatch` / `evolve` / `strong` / `mega`) rather than secure count or `stage >= 1`.

### 2.2 工程上對 game 的支撐

主要支撐點：

- `shared/grammar/grammar-stars.js`：Star constants、evidence tiers、Star computation、stage labels、high-water latch。
- `shared/grammar/grammar-concept-roster.js`：pure concept-to-monster mapping。
- `src/platform/game/mastery/grammar.js`：reward state integration、progressForGrammarMonster、recordGrammarConceptMastery、updateGrammarStarHighWater、legacy migration。
- `src/subjects/grammar/event-hooks.js`：Grammar domain events → reward events。
- `worker/src/subjects/grammar/commands.js`：server-side Star evidence event derivation。
- `shared/grammar/grammar-star-debug.js`：adult/admin/debug explanation model。

### 2.3 Game system 的限制

仍要注意：

- persistent tier-level Star ledger 未做。現在 Star debug 可以 explain，但 bounded recentAttempts rollover 後有些 tier-level details 可能只能由 highWater 表示，無法完整重建每個 tier 的來源。
- first-secure timestamp 仍是 estimate，不是 exact stored timestamp。
- Playwright state injection mechanism 還未 fully built；fixtures 已有，但 dev server injection contract 未完整實作。

這些不會令 current game 不可信，但會限制 long-term audit / debug depth。

---

## 3. Learning 與 Game 是否已 seamless link？

### 3.1 短答：已經正確連接，但仍有一個 future ledger gap

現時連接方式是正確的：

1. Learner submits answer。
2. Worker Grammar engine marks deterministically and updates learning state。
3. Engine emits domain events，例如 `grammar.answer-submitted`、`grammar.concept-secured`。
4. Command handler derives `grammar.star-evidence-updated` events from post-answer engine state。
5. Reward projection consumes Star evidence and updates monster codex state。
6. React read model renders Stars / `displayState` / creature progress。

這條鏈條重點是：**game follows learning，game does not control learning**。

### 3.2 為何這是 seamless？

它不是 UI 自己算 reward。它不是 click-based reward。它不是 game layer 自己 mark answer。

Star evidence derived from Worker-owned post-answer state；sub-secure Stars 由 `star-evidence-updated` event persist。`grammar.concept-secured` 仍由 `recordGrammarConceptMastery` persist mastery list for analytics / scheduling / adult understanding，但不再觸發 monster reward events。Active monster display 由 `displayStars = max(computedStars, starHighWater, legacyFloor)` 和 `displayState` 統一驅動。

### 3.3 為何仍有 ledger gap？

`starHighWater` 能保證 displayed Stars 不消失，但它不是完整 evidence ledger。

如果日後我們要回答：

「三個月前為甚麼給了 retainedAfterSecure？」

現在可以在很多情況下用 debug model + recent attempts 解釋；但若 recentAttempts rollover，debug model 可能只能說 high-water evidence existed，而不能完整 replay tier source。

所以 future work 應該考慮 durable tier-level ledger。

---

## 4. Reward system 是否正確連到 learning？

### 4.1 已連接的部分

已正確連接：

- `grammar.concept-secured` → `recordGrammarConceptMastery` for mastered[] / secure analytics only
- `grammar.star-evidence-updated` → `updateGrammarStarHighWater` for Star latch + monster events
- Direct monsters: 1 Star Egg persisted via `caught: true` and machine `displayState = egg-found`; Concordium stores raw latches but gates child-facing display until direct breadth exists
- `starHighWater` monotonic latch
- `displayState` parity across Grammar landing, summary, Home dashboard and Codex
- Concordium aggregate from all 18 concepts, with child-facing display gated until at least two direct Grammar monsters are found
- Direct monsters from shared concept roster
- Punctuation-for-grammar bridge concepts have direct owners as well as Concordium aggregate membership: `parenthesis_commas`, `speech_punctuation`, and `boundary_punctuation` → Bracehart; `apostrophes_possession` and `hyphen_ambiguity` → Couronnail
- Reserved monsters not active child-facing
- Writing Try / AI / view-only actions produce 0 Stars
- Supported answers excluded from independent tiers
- wrong-only variedPractice 不算
- retainedAfterSecure requires post-secure temporal proof

### 4.2 Reward event semantics

Reward event design 有幾個健康點：

- event IDs deterministic，並包含 kind / display stage / Star high-water，方便 idempotency。
- duplicate processing is safe。
- stale lower Stars 不會 reduce starHighWater。
- caught never reverts。
- zero-star events ignored。
- concept-secured 和 star-evidence-updated 的 ordering 不應破壞 state。
- `caught` means first-found / first-Star, matching Spelling / Punctuation unified event naming。
- Hatch / Growing / Nearly Mega emit `evolve`; Mega emits `mega`。
- celebration overlays defer to session end via shared `subjectIsInSession` / `shouldDelayMonsterCelebrations`; mid-session toasts remain unchanged for now。

### 4.3 要繼續守住的 reward boundary

不應讓以下東西改 Stars：

- Writing Try save
- AI explanation
- Grammar Bank browsing
- reading worked solution without attempt
- wrong answer only
- supported answer pretending to be independent
- game/hero layer action

---

## 5. 有沒有 legacy code 需要 refactor？

### 5.1 已 refactor 的 legacy risk

Phase 7 已經處理了一個重要架構債：`shared/grammar/grammar-stars.js` 不再 import platform `src/` code。Concept roster 已抽到 `shared/grammar/grammar-concept-roster.js`。這是正確方向。

### 5.2 仍然存在但可以接受的 compatibility code

仍有一些 backward-compatibility pieces：

- legacy ratio-based `stage` 仍存在，作為 migration / backward compat。
- legacy floor from pre-P5 stage 仍要保留，防止 old learners downgrade。
- `concordiumProgress.mastered / total` 可能仍保留於 dashboard model for backward compatibility，但 child surfaces 應該用 `monsterStrip` Stars。
- `masteredSummaryFromReward()` 仍保留，但 Phase 7 report 說已不被 child-facing surface 使用。

這些不一定要急著刪。它們是 migration safety。真正風險是 future PR accidentally uses them for child display，所以 P7 invariants 要繼續守。

### 5.3 應該列入 future refactor 的東西

1. Persistent tier-level Star evidence ledger。
2. Exact firstSecureAt timestamp in engine state。
3. Playwright state injection harness。
4. Cross-subject monotonic display helper，若 Punctuation / Spelling 採用相同 Star pattern。
5. AnswerSpec migration，尤其 constructed response。
6. Content release / oracle fixture workflow automation。
7. Grammar + Punctuation GPS combined adult reporting abstraction。

---

## 6. Subject 是否正確 connected to main system？

### 6.1 Subject runtime

Grammar 已接入 generic subject command route 和 Worker subject runtime。Production practice writes 走 Worker command path，不是 browser scoring。

核心 flow：

- React sends command intent。
- Worker runtime dispatches `subjectId = grammar`。
- Grammar command handler runs engine。
- Worker persists state / practice session / events / game state。
- Read model returns safe projection。

### 6.2 Main data / persistence

Grammar 使用 platform generic persistence paths：

- child_subject_state
- practice_sessions
- event_log
- child_game_state / monster codex projection

這是好事：Grammar 沒有自己另起一套 incompatible storage。

### 6.3 Codex / monster system

Grammar reward state 已接入 platform monster system：

- active roster from game/monster registry
- concept-to-monster mapping from shared roster
- reward projection from Grammar events
- child UI renders Stars and `displayState` via view model
- Home / Codex consume `displayState`, not `stage >= 1`, so Grammar first-Star eggs remain eggs rather than roaming monsters
- reserve monsters excluded from active Grammar progress

### 6.4 Analytics / adult system

Adult view 已經有：

- progress / confidence labels
- creature routes copy cleanup
- collapsible Star explanation
- redacted debug model

這已經足夠支撐家長 / reviewer 理解 progress，但還可以再進一步做 exportable reports 或 GPS combined report。

---

## 7. What we have done so far

### Phase 1–2 foundation

- Ported Grammar from legacy HTML reference into Worker-safe subject shape。
- Built deterministic content / engine baseline。
- Added Worker commands and read models。
- Added learning update model and session state。

### Phase 3 UX reset

- Rebuilt child flow。
- Added Grammar Bank equivalent。
- Separated child surfaces from adult analytics。
- Added Writing Try UI path as non-scored transfer。
- Reworked 3+1 active monster decision。

### Phase 4 learning hardening

- Locked learning-flow invariants。
- Hardened strict mini-test。
- Hardened support scoring, AI boundaries, transfer non-scoring。
- Added simulations / tests for selection and reward correctness。
- Produced content expansion and answer-spec audits.

### Phase 5 Star curve

- Replaced raw concept-count staging with 100-Star display scale。
- Defined 1-Star Egg, 15 Hatch, 35 Growing, 65 Nearly Mega, 100 Mega。
- Defined Stars as evidence tiers, not XP。
- Simplified landing to one primary CTA。
- Added compact monster strip。

### Phase 6 Star trust

- Fixed production attempt shape mismatch。
- Fixed wrong-only variedPractice inflation。
- Added retainedAfterSecure temporal proof。
- Added sub-secure Star persistence via `grammar.star-evidence-updated`。
- Persisted 1-Star Egg state。
- Fixed dashboard evidence data path。

### Phase 7 QoL / debug / refactor

- Summary now renders Stars, not raw counts。
- Writing Try no longer depends on AI enabled。
- Grammar Bank “Due” label changed to “Practise next”。
- Adult copy cleaned up。
- Shared concept roster extracted。
- Star debug model added。
- Command trace and deterministic event IDs added。
- State seed fixtures added。
- Concurrency/idempotency contract tests added。
- Status/filter semantics centralised。
- Playwright threshold tests added。

---

## 8. What we claimed we have done, but we didn't?

這裡要分清楚「目前 repo 真正 claim」和「早期 plan wording」。

### 8.1 不應 claim：full finished Grammar subject

Grammar 已經是 production-shaped, Worker-backed, child-usable subject；但不應 claim full finished subject。原因：

- content expansion backlog 未做
- answerSpec migration 未做完
- Writing Try 不做 scored writing assessment
- persistent tier ledger 未做
- exact firstSecureAt 未做
- Grammar + Punctuation combined GPS reporting 未完整產品化

所以正確 claim 應該是：

**Grammar is a hardened Worker-backed subject with child UX, deterministic practice, 100-Star reward curve, and strong invariants; content depth and answer-spec migration remain future phases.**

### 8.2 不應 claim：Writing Try measures mastery

Writing Try 只是 non-scored transfer lane。它可保存 writing evidence，但不改 mastery / Stars / reward。不能 claim 它自動證明 writing transfer mastery。

### 8.3 不應 claim：all Star evidence is fully replayable forever

現在 Star display 是 monotonic and persisted via high-water latch，但 tier-level explanation may degrade when bounded recentAttempts rolls over. Debug model can warn，但 persistent tier ledger 未做。

### 8.4 不應 claim：exact first secure date is stored

現在 retainedAfterSecure 用 estimated secure timestamp；Phase 7 明確把 exact first-secure timestamp 列為 deferred。

### 8.5 不應 claim：content pool is pedagogically complete

51 templates 是 strong baseline，但 content audit 已指出 thin-pool 和 explain coverage gap。

---

## 9. What we thought was working but actually not?

這部分很多已經在 P6/P7 修了，值得記錄，因為它反映之後 review 要怎樣做。

### 9.1 Star evidence production shape mismatch

曾經 Star derivation tests 用 `{ conceptId, correct }` flat shape，但 production attempts 是 `{ conceptIds: [...], result: { correct } }`。結果是 tests pass 但 production evidence tiers 可能 unlock 不到。Phase 6 已修。

### 9.2 variedPractice 曾經可能被 wrong-only exposure inflate

如果只看 distinct template exposure，孩子全錯也可能 unlock variedPractice。Phase 6 改成 correct-only template diversity。

### 9.3 retainedAfterSecure 曾經沒有真正 temporal proof

以前可能 pre-secure learning burst 被 retroactively 算作 retention。Phase 6 改成 requires post-secure independent correct timestamp。

### 9.4 sub-secure Stars 曾經可能只在 UI live path 存在

如果 Star high-water 只在 concept-secured 才更新，early Stars 會在 session end / recentAttempts rollover 後消失。Phase 6 加 `star-evidence-updated` persist。

### 9.5 1-Star Egg 曾經可能 display-only

Egg 如果只由 concept-secured 觸發，1-Star Egg 在 reload 後可能消失。Phase 6 修成 persisted caught state。

### 9.6 Dashboard live evidence path 曾經讀錯位置

Dashboard 曾讀 `grammar.recentAttempts`，production data 其實在 `grammar.analytics.recentAttempts`。Phase 6 修。

### 9.7 Summary 曾經用 raw concept count

Phase 7 修成 child summary 用 `X / 100 Stars`。

### 9.8 Writing Try 曾經和 AI capability 綁住

Phase 7 修成 Writing Try always available as non-scored transfer lane。

### 9.9 “Due” label 曾經不誠實

Filter 實際是 needs-repair/building，不是真 schedule-due。Phase 7 改 child label 做 “Practise next”。

### 9.10 Shared module dependency 曾經方向不乾淨

`shared/grammar/grammar-stars.js` 曾有 platform import 風險。Phase 7 抽 concept roster 到 shared。

---

## 10. What we know we haven't delivered yet and will work on later

### 10.1 Persistent tier-level Star ledger

Goal：每個 evidence tier 何時 unlocked、由哪個 command/session/attempt 造成，都可 durable audit。這比 starHighWater 更完整。

### 10.2 Exact firstSecureAt

Goal：retainedAfterSecure 不再使用 estimate，而是用 engine 記錄的 exact first secure timestamp。

### 10.3 Playwright state injection mechanism

Fixtures 已經有，但 browser test harness injection 尚未完整。Goal 是真正可以用 seeded learner state 測 star thresholds、Mega transition、legacy migration。

### 10.4 Content expansion for thin pools

Highest priority：

- active_passive
- subject_object

其他 high priority：

- pronouns_cohesion
- formality
- modal_verbs
- hyphen_ambiguity

Explain template coverage 也應擴充。

### 10.5 AnswerSpec migration

Selected-response 可以先 declarative `exact` batch。Constructed response 需要 per-template migration，尤其 punctuationPattern、normalisedText、acceptedSet、multiField、manualReviewOnly candidates。

任何 marking behaviour change 必須 bump contentReleaseId + oracle fixture refresh。

### 10.6 Grammar + Punctuation GPS combined report

Product 上應保持 Grammar / Punctuation 獨立，但成人可能需要 GPS-level combined view。這是 reporting abstraction，不應把 subject states 混成一個。

### 10.7 Writing Try review path

Writing Try 現在只是 non-scored transfer evidence。未來可考慮 adult/teacher review 或 deterministic checklist feedback，但不應未經 plan 就變成 auto-scored mastery。

### 10.8 Production telemetry / monitoring

建議未來加 release evidence pack：

- command failure rate
- no-op rate
- Star event count
- duplicate/replay count
- Mini Test completion
- Grammar Bank use
- Writing Try save count
- support-before-success ratio
- retainedAfterSecure unlock cadence

---

## 11. 工程健康度評估

### 11.1 Strong areas

- Worker boundary strong。
- Read model / command separation clear。
- Reward projection follows learning evidence。
- Star derivation pure and shared。
- Debug model redacted。
- Invariant framework dense。
- Concurrency/idempotency pure tests exist。
- Child-copy forbidden terms guarded。
- Active/reserve monster split clean。

### 11.2 Medium risks

- recentAttempts bounded window still matters for explainability。
- exact first-secure timestamp not stored。
- Playwright state injection incomplete。
- content pool thin in several concepts。
- answerSpec migration backlog may become painful if content expands before migration discipline。

### 11.3 High future risk if ignored

The highest future risk is not UI. It is **content/marking expansion without release discipline**.

If new templates are added without answerSpec, oracle refresh, contentReleaseId bump, and regression tests, Grammar could appear richer while marking fairness becomes weaker.

---

## 12. Engineering contract going forward

Any future Grammar work should obey:

1. Worker remains score/schedule/state authority.
2. React never imports production scoring templates or answer closures.
3. Stars remain evidence-derived, not per-question XP.
4. Writing Try remains non-scored unless a dedicated reviewed scoring phase lands.
5. AI remains enrichment-only, post-marking, non-score-bearing.
6. Any marking/content behaviour change bumps contentReleaseId unless proven no behavioural change.
7. Child-facing monster display uses Stars, never raw concept counts.
8. Debug surfaces stay adult/admin/test-only.
9. Punctuation-for-grammar bridge remains inside Grammar denominator and has direct Grammar monster ownership, but Punctuation subject identity remains separate.
10. New content must include answerSpec strategy and fixture refresh from day one.

---

## 13. Recommended next engineering focus

If we move on, my order would be:

1. Persistent tier-level Star ledger + exact firstSecureAt.
2. Playwright state injection mechanism.
3. AnswerSpec declarative migration for selected-response no-behaviour-change batch.
4. Thin-pool content expansion for active_passive and subject_object.
5. Constructed-response answerSpec migration and golden near-miss tests.
6. Adult GPS combined Grammar + Punctuation reporting contract.

Do not start with broad new features. The core subject is now solid enough to improve depth, but only if content and marking are handled with discipline.

---

## 14. 參考來源（repo files reviewed）

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
- `worker/src/subjects/grammar/commands.js`
- `worker/src/subjects/grammar/engine.js`
- `worker/src/subjects/grammar/read-models.js`
- `src/subjects/grammar/event-hooks.js`
- `src/platform/game/mastery/grammar.js`
- `src/platform/game/monsters.js`
- `src/subjects/grammar/session-ui.js`
- `src/subjects/grammar/components/grammar-view-model.js`
- `src/subjects/grammar/components/GrammarSetupScene.jsx`
- `src/subjects/grammar/components/GrammarSummaryScene.jsx`
- `src/subjects/grammar/components/GrammarAnalyticsScene.jsx`
