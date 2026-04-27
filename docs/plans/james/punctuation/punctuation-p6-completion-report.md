---
title: "Punctuation Phase 6 — Completion Report"
type: report
status: completed
date: 2026-04-27
origin: docs/plans/james/punctuation/punctuation-p6.md
plan: docs/plans/2026-04-27-002-feat-punctuation-phase6-star-truth-production-hardening-plan.md
---

# Punctuation Phase 6 — Completion Report

## Executive summary

Phase 6 shipped on 2026-04-27 as **10 merged pull requests** covering **10 implementation units** executed via fully autonomous scrum-master orchestration with parallel adversarial review. The phase closed every follow-on risk identified in the Phase 5 completion report and the Phase 6 product-engineering contract: Stars now survive bootstrap and Worker round-trips, monster stages are monotonic, Practice Stars have a daily throttle, Curlune and Claspin Mega gates are evidence-gated and derivation-safe, reward events align with the Star surface, and telemetry is rate-limited at the Worker level.

- **Units landed**: 10 of 10 (U1 through U10).
- **PRs merged**: 10 (#378, #380, #381, #383, #384, #390, #393, #395, #399, #400).
- **Merge commits on `main`**: `c9f0218` → `aea1c15` → `d82e39e` → `da56319` → `61077a4` → `8126e38` → `7427991` → `79cde20` → `abbaaef` → `400479a`.
- **Lines**: +3,165 / −39 across 25 file slots.
- **Oracle replay (`tests/punctuation-legacy-parity.test.js`)**: **green across every merge**.
- **`contentReleaseId` bumps**: **zero**.
- **Engine files touched** (`shared/punctuation/marking.js`, `generators.js`, `scheduler.js`): **zero**.
- **Full Punctuation test suite at completion**: **301 pass / 0 fail** (up from ~200 pre-phase).
- **Real bugs caught by adversarial review and fixed before merge**: **3 HIGH** + **4 MEDIUM** (see Adversarial-review findings table).
- **Reviewer dispatches**: ~30 across 10 review cycles (correctness × 10, testing × 4, adversarial × 5, re-reviews × 7).
- **Review follower dispatches**: 6 (U1, U3, U4, U5, U7, U8).
- **Subagent dispatches total**: ~50 (workers, reviewers, followers, re-reviewers, rebase agents).

Phase 6 was a **production-hardening and reward-truth phase**. It was NOT a content phase, NOT a UX phase, and NOT a feature-addition phase. Its three measurable goals are now met:

1. **Star truth is visible everywhere it is promised**: Worker command responses, bootstrap/refresh hydration, Landing, Summary, Map, and Home/dashboard all show identical Star totals from a single canonical `starView`. The `stats.grandStars` path in `getDashboardStats` now reaches the Star-derived branch instead of the legacy ratio fallback.

2. **Stars are monotonic for the child**: The `starHighWater` latch in the mastery codex ratchets upward on every reward-unit mastery event. The `mergeMonotonicDisplay` view-model helper computes `displayStage = max(starDerivedStage, maxStageEver)` and `displayStars = max(computed, starHighWater)` across all three child-facing scenes (Setup, Summary, Map). A child's monster never de-evolves.

3. **The reward narrative is one system**: Toast events (`caught`, `evolve`, `mega`) now fire from `max(mastered-stage, star-stage)` where `star-stage` derives from the monotonic `starHighWater` latch. Quoral correctly uses `PUNCTUATION_GRAND_STAR_THRESHOLDS`. No toast contradicts what the child sees.

---

## Problem frame — what Phase 5 left behind

Phase 5 successfully replaced ratio-based stages with a 100-Star evidence model and rebuilt the landing page as a mission dashboard. But the Phase 5 completion report and James's Phase 6 product-engineering contract identified nine follow-on risks:

1. **Stars invisible in production.** Worker read-model never computed `starView`; after bootstrap/refresh, star meters showed 0.

2. **Home/dashboard showed legacy ratio.** `module.js:getDashboardStats` fell back to `securedRewardUnits / publishedRewardUnits` because `stats.grandStars` was never populated from the Worker path.

3. **Stages could regress.** `starDerivedStage` recalculated freely; a lapse made a monster appear to de-evolve. No `starHighWater` monotonicity latch existed (Grammar P5 had one).

4. **Practice Stars had no daily throttle.** A child could max Practice Stars (30) in a single sitting by completing 30+ distinct items.

5. **Curlune reached Mega at 3/7 units.** Weight normalisation saturation cliff — 43% breadth was enough for 100 Stars.

6. **Claspin Mega gate hardcoded skill strings.** `'apostrophe_contractions'` and `'apostrophe_possession'` as string literals, not derived from the cluster mapping.

7. **`deepSecuredRewardUnits` was placeholder 0.** Hardcoded at `read-model.js:446`; the Star system already used deep-secure logic internally.

8. **Reward events fired from mastered-count thresholds.** A `caught`/`evolve`/`mega` toast could contradict what the child saw on the Star surface.

9. **Telemetry had no per-session rate limiting.** Worker-side lacked explicit caps to prevent event flooding.

---

## Architecture — preserving the two-tier design

Phase 6 preserved the two-tier architecture established in Phase 5:

- **Tier 1 (mastery layer):** `progressForPunctuationMonster` operates on monster codex state (`gameStateRepository`) with count-based `stageFor(mastered, PUNCTUATION_MASTERED_THRESHOLDS)`. Drives event emissions, cross-subject aggregator, and any path that only has codex state. Phase 6 added `starHighWater` (monotonic latch) and `starStage` (derived from latch via `stageFor(starHighWater, thresholds)`) to this tier.

- **Tier 2 (read-model layer):** `buildPunctuationLearnerReadModel` calls `projectPunctuationStars(progress, releaseId)` to compute the full star ledger. The read-model output exposes `starView` consumed by all child-facing surfaces. Phase 6 wired this into the Worker payload via `buildPunctuationReadModel`.

- **Bridge:** `maxStageEver` high-water mark (Tier 1 → Tier 2 via codex), `starHighWater` latch (Tier 1 → Tier 2 via codex), and `mergeMonotonicDisplay` helper (Tier 2 view-model, merges live computation with codex latch for child-facing display).

The key Phase 6 architectural decisions:

1. **Worker delegates to client read-model for Star derivation.** Rather than duplicating `projectPunctuationStars` in the Worker, `buildPunctuationReadModel` calls `buildPunctuationLearnerReadModel({ subjectStateRecord: { data } })` and extracts only `starView`. This preserves the "one canonical Star view" contract.

2. **Event alignment via codex-only data.** `punctuationEventFromTransition` reads `starHighWater` from the codex entry and derives `starStage` via `stageFor()` — no subject-state data import needed. This keeps Tier 1 self-contained while aligning toasts with the Star surface.

3. **Shared monotonic merge helper.** The review cycle surfaced that 3 scenes (Setup, Summary, Map) each implemented the monotonic merge inline with divergent sanitisation. The `mergeMonotonicDisplay` helper in `punctuation-view-model.js` centralises the merge with consistent `safeNumber()` sanitisation.

---

## Unit-by-unit ledger

### U1 — starHighWater monotonicity latch (PR #381 → `61077a4`)

**What shipped:** `seedStarHighWater(entry)` following Grammar P5 pattern. `safeStarHighWater(value)` with `Math.floor(n + 1e-9)` epsilon guard. `progressForPunctuationMonster` returns `starHighWater` in its output shape. `recordPunctuationRewardUnitMastery` ratchets `starHighWater` on both direct and aggregate entries. Pre-P6 learners seed from legacy stage floor. 13 tests.

**Adversarial catches:**
- ADV-007 (LOW, confidence 100): Unused `total` parameter in `seedStarHighWater` — dead code from Grammar copy-paste. Fixed by follower.
- ADV-005 (MEDIUM, 75): Pre-flip Carillon learner seeds Quoral from raw entry (0) not normalised union (5 mastered). Documented with explicit test — dev/test-only scenario, never production.
- ADV-001 (MEDIUM, 75): Seed reads pre-write mastered count. By design — consumer uses `max(computedStars, starHighWater)`.

**Testing reviewer P1 catch:** No test for explicit `starHighWater: 0` (post-P6 vs pre-P6 distinction). Fixed by follower — critical for preventing legacy-floor inflation on post-P6 learners.

### U2 — Wire starView into Worker read-model and bootstrap (PR #393 → `7427991`)

**What shipped:** `data` parameter added to `buildPunctuationReadModel`. Two call sites thread `data`: command handler (`commands.js:155`) and bootstrap path (`repository.js:407`). Worker delegates to `buildPunctuationLearnerReadModel` for `starView`. `stats.grandStars` set from `starView.grand.grandStars`. 6 new Worker read-model tests including `deepStrictEqual` parity between Worker and client starView.

**Key implementation detail:** `buildPunctuationReadModel` extracts ONLY `learnerReadModel.starView` from the client read-model output — not the full object. This keeps the recursive `assertNoForbiddenReadModelKeys` scan safe (starView contains only star numbers and stage integers, no forbidden keys).

**Adversarial catch (ADV-006, MEDIUM):** O(n) star projection on every Worker command response — performance concern for learners with 2000+ attempts. Acceptable for Phase 6 scope; follow-on optimisation noted.

### U3 — Monotonic displayStage in view-model (PR #395 → `79cde20`)

**What shipped:** `activeMonsterProgressFromReward` computes `displayStage = Math.max(starDerivedStage, maxStageEver)` and `displayStars = Math.max(totalStars, starHighWater)` from codex entries. All 3 scenes (Setup, Summary, Map) use these for child-facing display. `mergeMonotonicDisplay` shared helper extracted. 11 new tests.

**Convergent catches (correctness + adversarial):**
- C1 / ADV-395-1 (HIGH): Setup scene "Stars earned" aggregate used raw `totalStars` while individual meters used `displayStars`. After evidence lapse, header < sum of meters. **Fixed by follower.**
- ADV-395-2/3 (MEDIUM): Divergent sanitisation across 3 merge sites — Map/Summary used inline `Math.floor(Number(x) || 0)` which passes `Infinity`, view-model used `safeNumber()` which rejects it. **Fixed by extracting shared `mergeMonotonicDisplay` helper.**

### U4 — Practice Stars daily throttle (PR #380 → `8126e38`)

**What shipped:** `MAX_SAME_DAY_PRACTICE_ITEMS = 25` constant. `computePracticeStars` restructured to bucket by calendar day during accumulation. Near-retry corrections daily-capped via `perDayCorrectItems` gating. 8 new tests.

**Convergent catches (correctness + testing):**
- COR-1 (LOW): `nearRetryCorrections` not daily-capped — a child grinding 50 fail-then-correct items in one day got uncapped near-retries. Inert today (PRACTICE_CAP absorbs), but violated design intent. **Fixed by follower.**
- TEST (MEDIUM): At-ceiling test used range assertions instead of exact value. **Fixed to `assert.equal(ceilingStars, 30)`.**

### U5 — Curlune breadth gate for Mega (PR #384 → `d82e39e`)

**What shipped:** Curlune Mega gate requiring `Math.ceil(MONSTER_UNIT_COUNT.curlune * 0.71) = 5` deep-secured skills. Gate caps Mastery Stars at 15 (total max 90 < 100) when fewer than 5 skills are deep-secure. 7 new tests.

**Adversarial catch (ADV-003, MEDIUM, confidence 100):** Curlune gate missing `securedUnitCount >= minRequired` check that Claspin gate has. A learner could theoretically pass the deep-secure skill count with only 1 secured reward unit. **Fixed by follower — structural parity with Claspin gate.**

### U6 — Derive Claspin gate from cluster mapping (PR #390 → `da56319`)

**What shipped:** `CLASPIN_REQUIRED_SKILLS` frozen constant derived from `SKILL_TO_CLUSTER.entries().filter(([, c]) => c === 'apostrophe')`. Replaces hardcoded string literals. 3 parity tests. Clean correctness review — MERGE-READY on first pass.

### U7 — Wire real deepSecuredRewardUnits (PR #378 → `aea1c15`)

**What shipped:** `deepSecuredRewardUnitCount` replaced from hardcoded 0 to real computation. For each tracked reward unit with `securedAt > 0`, checks if any facet matching the unit's cluster skills passes deep-secure test (`memorySnapshot.secure === true` AND raw `lapses === 0`). 10 new tests.

**Testing catches:**
- TEST-001 (P2): Missing cluster-mismatch test — facets for a different cluster should not promote the reward unit. **Fixed.**
- TEST-002 (P2): Missing non-secure-bucket-with-zero-lapses test — facet in 'learning' bucket with lapses=0 should not count. **Fixed.**
- TEST-003 (P3): Misleading test title. **Fixed.**

### U8 — Star-aligned reward events (PR #399 → `400479a`)

**What shipped:** `progressForPunctuationMonster` returns `starStage` derived from `stageFor(starHighWater, thresholds)`. `punctuationEventFromTransition` uses `max(mastered-stage, star-stage)` as effective stage. Quoral correctly uses `PUNCTUATION_GRAND_STAR_THRESHOLDS`. 10 new tests.

**Adversarial catch (ADV-U8-1, HIGH, confidence 90):** `progressForPunctuationMonster` computed `starStage` using `PUNCTUATION_STAR_THRESHOLDS` for ALL monsters including Quoral. The read-model correctly uses `PUNCTUATION_GRAND_STAR_THRESHOLDS` for Quoral. At starHighWater values in ranges [25,30) or [50,60), stages diverged — toast fired based on one stage while child saw another. **This was the exact contradiction U8 was designed to prevent.** Fixed by follower with conditional threshold selection and 3 divergent-range tests.

### U9 — Telemetry per-session rate limiting (PR #383 → `c9f0218`)

**What shipped:** `MAX_TELEMETRY_EVENTS_PER_SESSION_PER_KIND = 50` constant. `countExistingEventsForRateLimit()` queries D1 for existing event counts scoped by `(learner_id, event_kind, sessionId)`. Silent drop returns `{ok: true, recorded: false, rateLimited: true}`. 7 new tests against real SQLite D1 shim. Clean review — MERGE-READY on first pass.

### U10 — Worker-backed parity proof (PR #400 → `abbaaef`)

**What shipped:** New `tests/punctuation-star-parity-worker-backed.test.js` with 15 tests proving Worker/client/bootstrap Star parity: seeded progress non-zero, `stats.grandStars === starView.grand.grandStars`, `deepStrictEqual` Worker vs client starView, bootstrap path parity, monotonicity across 5 sessions with lapse, `stageFor` monotonicity 0-100, negative assertions (no "Stage X of 4", no "XP", no reserved monsters), forbidden-key scan on starView-enriched payload. Extended `punctuation-reward-parity.test.js` with 5 additional tests. 20 new tests total.

---

## Adversarial-review findings table — what would have shipped broken

| Unit | Finding | Severity | Class | Reviewer(s) |
|------|---------|----------|-------|-------------|
| U3 | Setup "Stars earned" aggregate uses raw `totalStars` while meters use monotonic `displayStars` — child sees contradictory numbers on same screen | HIGH | Monotonicity violation in aggregate path | Correctness + Adversarial (convergent) |
| U8 | Quoral `starStage` uses `PUNCTUATION_STAR_THRESHOLDS` instead of `PUNCTUATION_GRAND_STAR_THRESHOLDS` — toast fires based on wrong stage at [25,30) and [50,60) ranges | HIGH | Threshold-set mismatch for grand monster | Adversarial |
| U1 | No test for explicit `starHighWater: 0` — regression could re-apply legacy floor to every post-P6 learner | HIGH (test gap) | Post-P6 vs pre-P6 distinction unguarded | Testing |
| U5 | Curlune gate missing `securedUnitCount` check — deep-secure skills pass gate with only 1 secured reward unit | MEDIUM | Structural parity gap with Claspin gate | Adversarial |
| U4 | `nearRetryCorrections` loop bypasses daily cap — uncapped channel masked by PRACTICE_CAP | MEDIUM | Anti-grinding design intent violation | Correctness + Testing (convergent) |
| U3 | Divergent sanitisation: view-model `safeNumber()` rejects Infinity, Map/Summary inline pattern passes it | MEDIUM | Three-site merge logic drift | Adversarial |
| U1 | Unused `total` parameter in `seedStarHighWater` — dead code from Grammar copy | LOW | Copy-paste vestigial parameter | Adversarial |
| U7 | Misleading test title ("one deep-secured, one not" when both are deep-secured) | LOW | Test documentation error | Testing |

**Observation:** 3 of 8 findings were caught by **two independent reviewers converging on the same root cause** — the signature benefit of parallel adversarial review. The U3 aggregate contradiction and U8 Quoral threshold mismatch are the highest-ROI catches: both would have created child-visible inconsistencies that directly undermine the Star-truth contract Phase 6 exists to enforce.

---

## Requirements trace

| R-ID | Requirement | Shipped by | Evidence |
|------|-------------|------------|----------|
| R1 | Same Star truth on all surfaces | U2, U10 | Worker starView wired; `deepStrictEqual` parity test; 5-surface consistency proof |
| R2 | Stars are learning evidence | U4 | Practice Stars daily cap (25 items/day); near-retry cap via `perDayCorrectItems` |
| R3 | Reward narrative is one system | U8 | `max(mastered-stage, star-stage)` event emission; Quoral grand thresholds fix |
| R6 | 100 Stars = Mega | U1, U5 | starHighWater latch; Curlune 5/7 breadth gate |
| R8 | Mega requires broad evidence | U5, U6 | Curlune gate; Claspin gate derived from mapping |
| R10 | Anti-grinding | U4 | `MAX_SAME_DAY_PRACTICE_ITEMS = 25`; daily-capped near-retries |
| R11 | Worker/bootstrap Star parity | U2, U10 | `data` threaded at both call sites; bootstrap path verified |
| R12 | `stats.grandStars` matches starView | U2 | `payload.stats.grandStars = learnerReadModel.starView.grand.grandStars` |
| R13 | Monotonic child display | U1, U3 | starHighWater latch + `mergeMonotonicDisplay` across 3 scenes |
| R14 | deepSecuredRewardUnits real | U7 | Replaced placeholder 0 with facet-based computation |
| R15 | Mastery key format | U10 | Parity tests verify key format `punctuation:<releaseId>:<clusterId>:<rewardUnitId>` |
| R16 | Telemetry rate limiting | U9 | 50 events per session per kind; D1 query-based cap |
| R17 | No regression | All | Oracle replay green; 301 tests pass; zero engine file changes |
| R18 | Curlune Mega breadth | U5 | 5/7 deep-secured skills + secured units required |
| R19 | Claspin gate derived | U6 | `CLASPIN_REQUIRED_SKILLS` from `SKILL_TO_CLUSTER` |

---

## Execution-pattern notes

### Scrum-master protocol

Same pattern as Phase 5 — the main agent acted exclusively as dispatcher, collector, and merge-decision-maker. Zero lines of production code written by the scrum-master.

Per-unit SDLC cycle:
1. **Worker subagent** (`isolation: "worktree"`) — implement, test, push, open PR → STOP and report.
2. **2-3 parallel reviewer subagents** — dispatched by concern: correctness (always), adversarial (for reward-algorithm and display units), testing (for units with complex test scenarios).
3. **Convergence synthesis** — scrum-master reads all reviewer outputs, weighs severity, identifies 2+ independent convergence as high-signal.
4. **Review-follower subagent** — addresses all HIGH + convergent findings in a single commit, pushes.
5. **Re-reviewer subagent** — narrow scope: verify ONLY the fix. Verdict: MERGE-READY or BLOCK-REMAINS.
6. **Merge** via `gh pr merge --squash`.

### Parallelisation strategy

Phase 6 used a dependency-aware dispatch strategy:

- **Wave 1a** (parallel): U1, U7, U9 — no file overlap
- **Wave 1b** (serial within star-projection.js): U4 → U5 → U6
- **Wave 2**: U2 — blocked on U1 (critical path)
- **Wave 3**: U3 — blocked on U1 + U2
- **Wave 4** (parallel): U8 + U10 — no file overlap, both blocked on U3

The **parallel safety check** prevented concurrent modification of `star-projection.js` (U4/U5/U6 share it) and `mastery/punctuation.js` (U1/U8 share it). File overlap was detected at dispatch time and downgraded to serial.

The **critical path** was U1 → U2 → U3 → {U8, U10}. U1's 3-reviewer cycle (correctness + testing + adversarial) was the longest single gate — the adversarial review alone took ~6 minutes and produced 7 findings.

### Merge conflict handling

U4 (Practice Stars) branched before U5/U6 merged changes to `star-projection.js`. A rebase agent resolved the conflict (different functions, clean merge). U5/U6 merged to separate worktrees and landed cleanly.

---

## Insights — what worked, what to keep, what to change

### What worked

1. **Grammar P5 as the exact precedent.** The `starHighWater` latch, `seedStarHighWater`, `safeStarHighWater` with epsilon guard, and the two-tier architecture all transferred directly from Grammar P5. The institutional learning document (`docs/solutions/architecture-patterns/grammar-p5-100-star-evidence-curve-and-autonomous-sdlc-2026-04-27.md`) saved at least 2 units of rework.

2. **Convergent adversarial review on reward code.** 3 of the top 4 findings came from 2+ independent reviewers finding the same root cause. The U3 aggregate contradiction was caught by both correctness and adversarial. The U4 near-retry gap was caught by both correctness and testing. Parallel review ROI remains the highest for numerical/reward code.

3. **Shared helper extraction from review cycle.** The plan did not anticipate `mergeMonotonicDisplay`. The adversarial reviewer's finding that 3 scenes had divergent sanitisation led to the follower extracting a shared helper — a maintainability win that emerged from the review process, not the planning process.

4. **Quoral threshold mismatch caught at the last mile.** The U8 adversarial reviewer constructed the exact failure scenario (starHighWater=28, STAR_THRESHOLDS → stage 1 vs GRAND_STAR_THRESHOLDS → stage 2) that would have created the child-visible contradiction U8 was designed to prevent. Without adversarial review, this would have shipped and been extremely difficult to diagnose in production.

### What to keep

- **`starHighWater` latch pattern** across both Grammar and Punctuation. Any future subject with a star/stage display should follow the same codex-persisted monotonic latch.
- **`mergeMonotonicDisplay` as single merge point.** Future display surfaces must import this helper, not re-derive the monotonic merge inline.
- **Worker delegates to client read-model for Star derivation.** One canonical projection function, called from both paths.
- **Adversarial review on all event-emission and threshold code.** The Quoral threshold bug would not have been caught by correctness or testing reviewers alone.
- **Parity tests as regression guard.** `punctuation-star-parity-worker-backed.test.js` exercises the Worker → client → display chain end-to-end. Any future divergence will be caught by the `deepStrictEqual` assertion.

### What to change (follow-on work)

1. **Star-evidence latch writes for Punctuation.** Grammar has `updateGrammarStarHighWater` called by a `star-evidence-updated` event subscriber — the codex latch advances between mastery events from practice sessions. Punctuation lacks this: `starHighWater` only advances during `recordPunctuationRewardUnitMastery`. For a child who practises extensively without securing new units, the codex latch lags behind the live projection. The view-model's `max(liveStars, codexStarHighWater)` makes the display correct, but toast events use the stale codex value. Low urgency — the `max(mastered-stage, star-stage)` makes events fire at least as late as mastered-stage.

2. **O(n) star projection on every Worker command response.** `projectPunctuationStars` iterates all attempts (~5 passes) per command. For a learner with 3000+ attempts, this adds ~150K array operations per session. Caching the projection or computing incrementally would eliminate the redundant work. Low urgency — typical sessions have 4-12 items and the attempt array grows slowly.

3. **Curlune 0.71 magic number.** The threshold `Math.ceil(MONSTER_UNIT_COUNT.curlune * 0.71)` encodes "5 of 7" imprecisely. If Curlune grows to 8 units, the gate auto-scales to 6 (75%), which may be stricter than intended. Consider deriving from the explicit integer `5` or making the constant self-documenting.

### What to investigate further

- **Post-merge full-stack integration.** Phase 6 proves parity at the unit-test level. A full Worker-backed Playwright journey (start → answer → feedback → summary → return → refresh) exercising the real D1 path would close the remaining gap between test-harness and production.
- **Telemetry lifetime cap for sessionless events.** U9's `countExistingEventsForRateLimit` uses a lifetime per-learner cap for kinds without `sessionId` (8 of 12 kinds). After 50 cumulative `card-opened` events across all sessions ever, the learner is permanently rate-limited for that kind. If events are never purged, this is slow-burn telemetry data loss.

---

## Artefacts

- **Plan**: `docs/plans/2026-04-27-002-feat-punctuation-phase6-star-truth-production-hardening-plan.md`
- **Origin contract**: `docs/plans/james/punctuation/punctuation-p6.md` (James's product-engineering contract)
- **Phase 5 completion report** (predecessor): `docs/plans/james/punctuation/punctuation-p5-completion-report.md`
- **Star projection**: `src/subjects/punctuation/star-projection.js` — Practice Stars daily cap, Curlune breadth gate, Claspin derived gate
- **Mastery layer**: `src/platform/game/mastery/punctuation.js` — `starHighWater` latch, `starStage` derivation, star-aligned events
- **Worker read-model**: `worker/src/subjects/punctuation/read-models.js` — `data` parameter, starView delegation
- **View-model**: `src/subjects/punctuation/components/punctuation-view-model.js` — `mergeMonotonicDisplay`, monotonic `displayStage`/`displayStars`
- **Client read-model**: `src/subjects/punctuation/read-model.js` — real `deepSecuredRewardUnits`
- **Telemetry**: `worker/src/subjects/punctuation/events.js` — per-session rate limiting
- **Parity proof**: `tests/punctuation-star-parity-worker-backed.test.js` — 15-test Worker/client/bootstrap parity suite
- **Stage thresholds**: `PUNCTUATION_STAR_THRESHOLDS`, `PUNCTUATION_GRAND_STAR_THRESHOLDS`, `PUNCTUATION_MASTERED_THRESHOLDS` in `src/platform/game/monsters.js`
- **Monotonic merge**: `mergeMonotonicDisplay` in `src/subjects/punctuation/components/punctuation-view-model.js`

---

## Phase 6 is closed.

Next scope for Punctuation belongs to the follow-on items surfaced during this phase:

1. **Star-evidence latch writes** — add a Punctuation equivalent of Grammar's `updateGrammarStarHighWater` so `starHighWater` advances between mastery events from practice sessions.
2. **O(n) projection caching** — cache or incrementally compute `projectPunctuationStars` to avoid repeated full-array scans on every Worker command.
3. **Playwright integration** — full Worker-backed journey test exercising the real D1 path end-to-end.
4. **Telemetry purge or time-windowed caps** — prevent lifetime accumulation from permanently rate-limiting sessionless event kinds.

Plan file status flips to `completed`. Phase 6 workflow terminates here.
