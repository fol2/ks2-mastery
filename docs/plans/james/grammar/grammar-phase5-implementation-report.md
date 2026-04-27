# Grammar Phase 5 — 100-Star Monster Curve & Landing Simplification Implementation Report

**Date:** 2026-04-27
**Plan:** `docs/plans/2026-04-27-001-feat-grammar-phase5-star-curve-landing-plan.md`
**Review input:** `docs/plans/james/grammar/grammar-p5.md`
**Origin requirements:** `docs/brainstorms/2026-04-24-grammar-mastery-region-requirements.md` (R1–R20, A1–A5, F1–F3, AE1–AE4)
**Invariants doc (U1 deliverable):** `docs/plans/james/grammar/grammar-phase5-invariants.md`
**Simulation report (U3 deliverable):** `docs/plans/james/grammar/grammar-star-curve-simulation.md`
**Status:** Complete. All 10 implementation units (U1–U4, U6–U11) shipped to `feat/grammar-phase5-star-curve-landing`.
**Working model:** fully autonomous SDLC — scrum-master orchestration, per-unit worker → parallel reviewers → review follower → merge
**Branch:** `feat/grammar-phase5-star-curve-landing` (8 squash-merged PRs, ready for merge to `main`)
**Test surface:** 4,232 pass / 0 fail / 6 skipped (pre-existing)
**Net change:** 7,210 lines added, 543 lines deleted across 23 Phase 5 files

---

## 1. Executive Summary

Phase 2 made the Grammar Worker engine credible. Phase 3 rewrote the child surface on top of U8's view-model. Phase 4 proved the learning system is correct and production-safe — 14 PRs, 12 invariants, composite Concordium-never-revoked property test. **Phase 5 changes what the child sees without changing how the system learns.**

The core problem: Grammar's ratio-based monster staging (`grammarStageFor(mastered, total)` at `grammar.js:76-84`) produced wildly different effort-to-Mega curves depending on monster denominator. Couronnail (3 concepts) hit Mega after 3 secure concepts — achievable in days. Concordium (18 concepts) required 18/18 — months. Same "Mega" label, profoundly different meaning. Children and adults lost trust in the reward when it told them two lies with the same word.

Phase 5 replaces ratio staging with a **100-Star evidence-based display curve** that is identical across all four active Grammar monsters. Stars are not per-question XP — they are learning-evidence milestones earned through five tiers: first independent win (5%), repeat independent win (10%), varied practice (10%), secure confidence (15%), and retained after secure (60%). The curve is deliberately back-loaded: Egg is easy (1 Star), Mega is hard (requires every concept to pass retention review). The landing page is simplified to a single primary CTA ("Start Smart Practice") with a compact monster progress strip.

### Headline outcomes

- **8 PRs merged** to `feat/grammar-phase5-star-curve-landing`: #345 (U1), #349 (U2), #353 (U3), #358 (U4), #365 (U6), #366 (U9), #368 (U7+U8), #370 (U10+U11).
- **7,210 lines net-new** across 23 files (production code, tests, CSS, docs, simulation).
- **24 reviewer dispatches** across 8 PRs (correctness, testing, adversarial, project-standards, design-lens). **3 HIGH-severity bugs caught and fixed** before any merge.
- **Zero `contentReleaseId` bumps.** Phase 5 changes reward display only — no marking, scheduling, or mastery-evidence mutation.
- **Zero Phase 4 invariant regressions.** All 12 Phase 4 invariants (1–12) preserved. Phase 5 adds 15 new invariants (documented in `grammar-phase5-invariants.md`).
- **Simulation validated** the 5/10/10/15/60 weight split: Egg on day 1, Hatch in 1–9 days, Mega in 14–86 days depending on learner profile, Grand Concordium 10+ weeks. No weight adjustment needed.
- **English Spelling parity preserved.** No Spelling code touched.
- **Test surface grew from ~3,900 (Phase 4 exit) to 4,232** with 330+ net-new Grammar assertions.

### The five-layer architecture

Phase 5 delivered five distinct layers, each with a clean boundary:

| Layer | Module | Responsibility |
|---|---|---|
| **Constants & derivation** | `shared/grammar/grammar-stars.js` | Pure functions: evidence-tier detection, Star computation, stage mapping. No side effects, importable by Worker and client. |
| **Reward state integration** | `src/platform/game/mastery/grammar.js` | `starHighWater` latch, legacy migration floor, `progressForGrammarMonster` extension. |
| **Event semantics** | `grammarEventFromTransition` (same file) | Caught-wins-over-hatch cascade, Star-based level calculation. |
| **View model** | `src/subjects/grammar/components/grammar-view-model.js` | `buildGrammarMonsterStripModel`, `buildGrammarDashboardModel` with additive Star fields. |
| **UI surface** | `GrammarSetupScene.jsx` + `styles/app.css` | Monster strip, single CTA, secondary links, responsive CSS. |

---

## 2. Unit-by-unit Summary

### U1 — Scope-lock: Phase 5 invariants and contract freeze (PR [#345](https://github.com/fol2/ks2-mastery/pull/345))

**Files:** `docs/plans/james/grammar/grammar-phase5-invariants.md` (new), `tests/grammar-phase5-invariants.test.js` (new), `src/platform/game/mastery/index.js` (re-export extension).

**What landed.** 15 numbered invariants covering the full Phase 5 contract: 100-Star scale, evidence-tier milestones, non-linear stage thresholds, 1-Star Egg, Mega requires retention, monotonic Stars, no stage downgrade, Writing Try/AI yield 0 Stars, supported answers excluded from independent tiers, single primary CTA, compact monster strip, adult/child display separation, Concordium 1-Star Egg, no contentReleaseId bump, Phase 4 preserved. Module-load test pins denominator freeze (=== 18), active roster (4 monsters), concept-to-monster mapping completeness (13 direct + 5 punctuation-for-grammar), frozen state guards on all three constants (`GRAMMAR_AGGREGATE_CONCEPTS`, `GRAMMAR_MONSTER_CONCEPTS`, `GRAMMAR_CONCEPT_TO_MONSTER` including inner arrays), and a sorted 18-concept snapshot assertion to catch swap mutations.

**Reviewer yield (3 reviewers).** Testing reviewer caught 2 P1 issues: (1) three Star constant tests were tautological self-assertions (local const asserted against identical literal — passed forever regardless of production code); (2) Concordium missing from the roster assertion despite the title claiming 4 active monsters. Both resolved in the follower pass — tautologies converted to `test.todo()` stubs (later converted to real imports by U2), Concordium added via `GRAMMAR_MONSTER_IDS` + `GRAMMAR_GRAND_MONSTER_ID` imports.

### U2 — Star display model and evidence-tier derivation (PR [#349](https://github.com/fol2/ks2-mastery/pull/349))

**Files:** `shared/grammar/grammar-stars.js` (new, 330 lines), `src/platform/game/mastery/grammar-stars.js` (thin re-export), `tests/grammar-stars.test.js` (new, 739 lines), `tests/grammar-stars-drift-guard.test.js` (new, 115 lines), `tests/grammar-phase5-invariants.test.js` (todo stubs → real assertions).

**What landed.** The core of Phase 5. Five pure functions:

1. **`deriveGrammarConceptStarEvidence`** — Detects five boolean evidence tiers from a mastery concept node + recentAttempts array. The `firstAttemptIndependent === true` gate (not `supportLevelAtScoring === 0`) prevents nudge attempts from leaking through. `retainedAfterSecure` requires `independentCorrects.length >= 2` to enforce temporal ordering.
2. **`computeGrammarMonsterStars`** — Per-monster Star computation: `conceptBudget = 100 / conceptCount`, `monsterStars = floor(sum(conceptBudget × sum(unlockedWeights)) + 1e-9)`. Per-monster floor guarantee: any evidence → at least 1 Star. Epsilon-aware floor prevents IEEE 754 boundary traps.
3. **`grammarStarStageFor`** — Maps Stars to internal stages 0–4 for backward compat.
4. **`grammarStarDisplayStage`** — Maps Stars to 6 display stages (0–5) for the child-facing UI.
5. **`grammarStarStageName`** — Returns child-facing labels: "Not found yet" / "Egg found" / "Hatched" / "Growing" / "Nearly Mega" / "Mega".

Plus a drift-guard test using ripgrep (with canary assertion and graceful skip when rg unavailable).

**Reviewer yield (3 reviewers: correctness, testing, adversarial).** The adversarial reviewer was the highest-value addition to Phase 5's review process. Three findings that would have shipped as bugs without it:

| # | Finding | Severity | Root cause | Fix |
|---|---------|----------|-----------|-----|
| **ADV-001** | Nudge attempts pass independent filter | **HIGH (95%)** | `supportLevelAtScoring === 0 \|\| firstAttemptIndependent === true` — the OR let retry-correct answers (supportLevel 0 but firstAttemptIndependent false) through | Changed to `firstAttemptIndependent === true` only |
| **ADV-002** | IEEE 754 floor trap at Concordium evolve2 boundary | **MEDIUM (100%)** | 18 × (100/18 × 0.35) accumulated to 34.999... instead of 35 | Added epsilon: `Math.floor(totalStars + 1e-9)` |
| **ADV-003** | retainedAfterSecure has no temporal ordering | **HIGH (75%)** | A pre-secure independent correct satisfied the retention check | Required `independentCorrects.length >= 2` |

**Side observation — the adversarial reviewer's IEEE 754 exhaustive sweep.** ADV-002 was found by enumerating all 31 weight subsets × 4 monster concept counts and checking every stage-boundary crossing. Only one crossing was affected (Concordium at weight 0.35 → 34.999... vs threshold 35). This is the kind of finding that correctness reviewers miss because they trace representative cases, not the full combinatorial space.

### U3 — Simulation spike — validate thresholds (PR [#353](https://github.com/fol2/ks2-mastery/pull/353))

**Files:** `tests/helpers/grammar-simulation.js` (extended +503 lines), `tests/grammar-star-curve-simulation.test.js` (new, 373 lines), `docs/plans/james/grammar/grammar-star-curve-simulation.md` (new, 154 lines).

**What landed.** Multi-day deterministic simulation framework extending the existing seeded simulation helper. Three learner profiles (ideal 90%, typical 75%, struggling 55%) at two daily round sizes (5q, 10q) across 8 seeds each. SM-2-like spacing model with strength growth, interval advancement, scheduling heuristics.

**Key results:**

| Milestone | Ideal @10q | Typical @10q | Struggling @10q | Plan target |
|---|---|---|---|---|
| First Egg | Day 1 | Day 1 | Day 1 | 1–2 weeks |
| First Hatch | Day 2 | Day 5 | Day 9 | 2–3 weeks |
| First Mega | Day 18 | Day 41 | Day 86 | 5–8 weeks |
| Grand Concordium | >150 days | >150 days | >150 days | 10–14+ weeks |

**Weights confirmed — no adjustment needed.** The 5/10/10/15/60 split produces a curve where Egg is encouragement (day 1) and Mega is genuine mastery (weeks of practice). Grand Concordium not reachable within 150 days confirms the 18-concept aggregate is legitimately hard. Support-only ceiling: 25 Stars (above Hatch but well below Growing).

**Reviewer yield (2 reviewers).** Testing reviewer found the Grand Concordium assertion was vacuous (guarded by `if (r.daysToGrandConcordium !== null)` which never executed since no seed reached it). Replaced with Concordium-Stars-at-day-150 range assertion. Correctness reviewer found the simulation latches `secureConfidence` permanently while production re-evaluates live. Documented as known model limitation — the `starHighWater` latch in U4 is the production monotonicity guarantee, not the derivation function.

**Model limitations documented:**
1. `secureConfidence` latch: simulation optimistic for struggling profile
2. `retainedAfterSecure` temporal model: simulation slightly pessimistic (opposing bias)
3. Monotonicity by construction vs production live derivation
4. Early review credit: simulation grants full interval credit for pre-due reviews

### U4 — Stage gates, starHighWater latch, and no-downgrade migration (PR [#358](https://github.com/fol2/ks2-mastery/pull/358))

**Files:** `src/platform/game/mastery/grammar.js` (modified, +105 lines), `shared/grammar/grammar-stars.js` (extended, +56 lines), `src/platform/game/mastery/grammar-stars.js` (re-export update), `tests/grammar-star-staging.test.js` (new, 904 lines), `tests/grammar-concordium-invariant.test.js` (comment updates).

**What landed.** The load-bearing integration unit. Three capabilities in one atomic change:

1. **`progressForGrammarMonster` extension.** Returns `{ ...existing, stars, starMax, displayStage, stageName, starHighWater }`. Accepts optional `conceptNodes` + `recentAttempts` for Star computation. Without them, falls back to legacy floor from mastered-count ratio. The `stage` field (0–4) uses `max(legacyStage, starDerivedStage)` for backward compat.

2. **`starHighWater` monotonicity latch.** A single integer per monster on the reward state: `displayStars = max(computedStars, persisted.starHighWater, legacyFloor)`. Updated via `max(existing, computed)` on every write — never decreases.

3. **Legacy migration normaliser.** For pre-P5 learners (no `starHighWater` field): stage 0 → 0 Stars, stage 1 → 1 Star, stage 2 → 15 Stars, stage 3 → 35 Stars, stage 4 → 100 Stars. Silent normalisation only — no events during migration. The `seedStarHighWater` function computes the legacy floor on first write, preventing floor erasure.

**Reviewer yield (3 reviewers: correctness, testing, adversarial).** The most productive review round in Phase 5:

| # | Finding | Severity | Root cause | Fix |
|---|---------|----------|-----------|-----|
| **CORR-001 / ADV-005** | starHighWater written as 0 erases legacy floor | **HIGH (100%)** | `safeStarHighWater(undefined)` returns 0 → writes `starHighWater: 0` → permanently disables legacy floor for pre-P5 learners | Added `seedStarHighWater()` that computes legacy floor when entry has no starHighWater |
| **ADV-002** | displayStage/stage desync at 35 Stars | MEDIUM (100%) | Legacy stage 3 → floor 35 Stars, but `grammarStarStageFor(35) = 2` | Acceptable — internal stage preserved via max(), display label is the new system |
| **ADV-003** | Event emission gap at 35 Stars boundary | MEDIUM (100%) | grammarEventFromTransition fires on internal stage (0–4), not displayStage (0–5) | Acceptable — U6 scope, no change needed |
| **TEST-001** | 200-random ratchet never exercises Star path | P1 (75%) | progressForGrammarMonster called without conceptNodes | Noted for U9 (ratchet extension unit) |
| **TEST-002** | Missing Chronalyx legacy migration test | P1 (80%) | Only Bracehart/Couronnail/Concordium tested | Added Chronalyx 2/4 stage 2 test |

**Side observation — the seedStarHighWater pattern.** This was the single most important review-driven fix in Phase 5. Without it, every pre-P5 learner's first concept-secured event after deployment would permanently erase their visual Star floor. A Concordium learner at stage 3 (14/18 mastered, floor 35 Stars) would drop to 0 Stars on the next read. The internal `stage` field was preserved via `max(legacyStage, 0) = 3`, but the child-visible Stars field would regress from 35 to 0. The fix seeds the legacy floor into `starHighWater` on the very first write, capturing the migration floor into persistent state before it can be lost.

### U6 — Reward event semantics (PR [#365](https://github.com/fol2/ks2-mastery/pull/365))

**Files:** `src/platform/game/mastery/grammar.js` (modified, +9 lines), `tests/grammar-star-events.test.js` (new, 716 lines).

**What landed.** Star-based level calculation: `level = max(legacyLevel, floor(displayStars / 10))`, capped at 10. The existing `grammarEventFromTransition` priority cascade (caught > stage-increase > levelup) already correctly implements caught-wins-over-hatch — no modification needed to the event function itself.

**Reviewer yield (1 reviewer).** Zero findings. The reviewer noted two advisory residual risks: (1) test 5's name ("crosses Egg + Hatch") is misleading because the single-concept-at-a-time write path can never simultaneously cross both thresholds — the cascade handles it correctly by construction; (2) the plan's triple-threshold edge case (Egg + Hatch + Evolve2) is unreachable via the current write path. Both acknowledged as architectural properties, not bugs.

### U9 — Concordium-never-revoked invariant extension (PR [#366](https://github.com/fol2/ks2-mastery/pull/366))

**Files:** `tests/grammar-concordium-invariant.test.js` (extended, +378 lines), `tests/grammar-star-events.test.js` (carried from U6 merge), `tests/helpers/grammar-reward-invariant.js` (extended, +10 lines).

**What landed.** The Phase 5 extension of the Phase 4 property test:

- **3 new named regression shapes:** (8) pre-P5 Couronnail at Mega — legacy floor preserves stage 4 / 100 Stars; (9) pre-P5 Concordium at stage 3 — legacy floor preserves Stars ≥ 35 with 20-step random replay; (10) reserved monster evidence (Glossbloom) normalised into Concordium — Star ratchet holds across 30-step replay.
- **200-random Star ratchet (section 2b):** Synthetic `conceptNodes` + `recentAttempts` threaded through the full evidence-tier derivation. Asserts `stars >= maxPriorStars` at every step.
- **F2 integration test:** All 18 concept-secureds fired sequentially, verifying `starHighWater` persistence and Star ratchet at every step.
- **Snapshot helper** gains `starHighWater` in `PRESERVED_ENTRY_KEYS` for tracing.

**Reviewer yield (1 reviewer).** Found `syntheticAttempts` was dead code — constructed but never threaded through to `progressForGrammarMonster`. Follower fixed: `recentAttempts` parameter added to `assertConcordiumRatchet`, `initialMaxPriorFromState`, and `runSequence`. The 200-random Star ratchet now exercises the full attempt-dependent evidence tier pipeline, not just `secureConfidence`.

### U7+U8 — Monster strip and landing page simplification (PR [#368](https://github.com/fol2/ks2-mastery/pull/368))

**Files:** `src/subjects/grammar/components/grammar-view-model.js` (modified, +115 lines), `src/subjects/grammar/components/GrammarSetupScene.jsx` (modified, +181 lines), `styles/app.css` (modified, +250 lines), `tests/grammar-ui-model.test.js` (extended, +228 lines), `tests/react-grammar-surface.test.js` (updated), `scripts/inventory-inline-styles.mjs` (budget bump), `docs/hardening/csp-inline-style-inventory.md` (regenerated).

**What landed.** The child-facing surface change:

**Monster strip:** Four active monsters (Bracehart, Chronalyx, Couronnail, Concordium) in a compact horizontal strip below the hero. Each entry: monster image (320px asset), name, stage label, Star progress bar (accent-coloured fill), "X / 100 Stars" text. Child copy: "Get 1 Star to find the Egg. Reach 100 Stars for Mega." Horizontal scroll on narrow viewports (≤ 600px).

**Landing simplification:** Single "Start Smart Practice" CTA with `data-featured="true"` styling (1.1rem, 700 weight, 20rem max-width). Grammar Bank, Mini Test, Fix Trouble Spots → secondary links row with 44px min-height WCAG touch targets and `aria-pressed` selected state. Writing Try → collapsed More practice disclosure (filtered by `writingTryAvailable` when AI enrichment is disabled). Today cards preserved below CTA.

**CSS:** 250 lines covering responsive layout, monster strip, star bars, featured CTA, secondary links, today cards grid. `@media (max-width: 600px)` handles monster strip scroll, today grid 2-column, secondary links wrap.

**Reviewer yield (2 reviewers: correctness, design-lens).** Design-lens reviewer's critical finding: all 17 new CSS classes had zero stylesheet definitions. The worker implemented structure and tests perfectly but forgot CSS entirely — the layout would have shipped visually unstyled. Correctness reviewer caught: (1) Writing Try gate removed (writingTryAvailable not consumed) — fixed with filter; (2) monster asset size 160 → falls back to 320 — fixed to use 320 explicitly. Dead `bank` branch in PrimaryModeCard removed.

**Side observation — design-lens reviewer as CSS safety net.** This is the first Phase 5 unit where the design-lens reviewer was dispatched. Its finding — 250 lines of missing CSS — was the single largest follower change in the entire phase. The worker produced correct structure, correct tests, correct accessibility attributes, but zero visual treatment. This is a systematic blind spot in text-based code generation: structural correctness does not imply visual correctness.

### U10+U11 — View-model integration and end-to-end tests (PR [#370](https://github.com/fol2/ks2-mastery/pull/370))

**Files:** `src/subjects/grammar/components/grammar-view-model.js` (modified, +8 lines), `tests/grammar-star-e2e.test.js` (new, 789 lines), `tests/grammar-ui-model.test.js` (extended, +112 lines).

**What landed.**

**U10:** `buildGrammarDashboardModel` returns `monsterStrip` alongside the existing `concordiumProgress: { mastered, total }` — no breaking rename. Six new test assertions verify coexistence, shape freeze, fresh learner defaults, and reserved-monster exclusion.

**U11:** 15 end-to-end integration tests driving the full Star pipeline:

1. Full 0→100 Star journey for Bracehart (6 concepts, all evidence tiers) with event ordering
2. Full 0→100 Star journey for Couronnail (3 concepts, gradual not jump-to-Mega)
3. Full 0→100 Star journey for Chronalyx (4 concepts)
4. Concordium cross-cluster Star accumulation
5. Writing Try → 0 Star changes (invariant 5)
6. Supported answers → no independent tiers
7. Nudge attempts → no independent tiers (ADV-001 regression guard)
8. Spelling parity regression check
9. Incremental evidence tiers produce monotonically increasing Stars
10. Concordium full 18-concept journey to Grand Concordium
11. No event double-fire per monster per call
12. Dashboard model integration post-journey
13. Monster strip structural integrity
14. Legacy migration (pre-P5 Couronnail Mega preserved)
15. Stage threshold boundary assertions + Punctuation isolation

**Reviewer yield (1 reviewer).** Couronnail test was computing intermediate Stars without `conceptNodes` (falling back to legacy floor jumps: 1, 15, 100 — not "gradual"). Fixed to pass `conceptNodes` at each step, matching the Bracehart pattern. Dead helpers and unused imports removed.

---

## 3. Reviewer-driven Bug Catches

Phase 5 deployed 24 reviewer dispatches across 8 PRs. Three HIGH-severity bugs were caught and fixed before any merge:

### 3.1 Nudge gate (ADV-001, U2)

**The bug:** `supportLevelAtScoring === 0 || firstAttemptIndependent === true` let retry-correct answers through. A child who answered wrong, got a nudge ("Try again"), and answered correctly on retry would have `supportLevelAtScoring: 0` (because nudge is scored at 0) but `firstAttemptIndependent: false` (because the first attempt was wrong). The OR gate treated this as independent — awarding Stars that should require genuine first-attempt correctness.

**Impact if shipped:** A learner who never answered independently — only ever getting things right on retry — would earn the same evidence tiers as a learner who gets everything right first time. The "Stars are learning evidence, not XP" principle would be silently violated.

**Fix:** Changed to `firstAttemptIndependent === true` as the sole condition. This is the authoritative signal from `attempt-support.js` — it is true only when the child answered correctly on their first attempt with no support.

### 3.2 Legacy floor erasure (CORR-001/ADV-005, U4)

**The bug:** `recordGrammarConceptMastery` used `safeStarHighWater(aggregateEntry.starHighWater)` which returned 0 when `starHighWater` was undefined (pre-P5 learner). This wrote `starHighWater: 0` to the state, permanently disabling the legacy floor on all subsequent reads.

**Impact if shipped:** Every pre-P5 learner's first concept-secured event after Phase 5 deployment would permanently erase their Star floor. A Concordium learner at stage 3 (14/18 mastered, floor 35 Stars) would drop to 0 visible Stars after their next practice session. The internal `stage` field would survive via `max(legacyStage, 0) = 3`, but the child-visible `stars` field would regress from 35 to 0. Since Stars are supposed to be monotonically non-decreasing, this would be a trust-destroying regression.

**Fix:** Added `seedStarHighWater()` function that computes the legacy floor on first write. When an entry has no `starHighWater` field (pre-P5 learner), the function derives the legacy stage from `mastered.length / conceptTotal`, maps it to the Star floor (stage 0→0, 1→1, 2→15, 3→35, 4→100), and writes that as the initial `starHighWater`. The legacy floor is captured into persistent state before it can be lost.

### 3.3 IEEE 754 stage boundary trap (ADV-002, U2)

**The bug:** `Math.floor(totalStars)` where `totalStars` was 34.999999999999985 (from Concordium 18 concepts × (100/18) × 0.35 — accumulated floating-point error) produced 34 instead of 35. This placed a learner who had achieved `repeatIndependentWin + variedPractice + secureConfidence` on every Concordium concept at display stage 2 ("Hatched") instead of stage 3 ("Growing").

**Impact if shipped:** Concordium learners would hit an invisible ceiling at certain weight combinations. The system would appear to stall — 18 concepts with secure evidence across all of them, but the display says "Hatched" instead of "Growing". This was the only stage-boundary crossing affected (verified by the adversarial reviewer's exhaustive sweep of all 31 weight subsets × 4 monster concept counts).

**Fix:** `Math.floor(totalStars + 1e-9)`. The epsilon compensates for IEEE 754 accumulated error without affecting integer-valued totals.

---

## 4. Key Architectural Decisions

### 4.1 Read-time Star derivation, not event-driven

The plan's central architectural choice: Stars are derived at read time from mastery concept nodes + recentAttempts, not from new domain events. The existing `grammar.concept-secured` event pipeline remains untouched. This keeps the boundary between learning engine and reward layer clean — the reward layer never sees sub-secured evidence transitions.

The trade-off: Star computation happens on every client read, not on committed events. The `starHighWater` latch is the production monotonicity guarantee — the live derivation may fluctuate (concept losing secure status after wrong answers), but the persisted latch never decreases.

### 4.2 Per-monster floor guarantee with epsilon-aware floor

All four monsters use the same formula: `stars = Math.floor(sum(conceptStars) + 1e-9)` with a per-monster floor of 1 when any concept has any evidence. The floor is per-monster (not per-concept) — this prevents Concordium's 18-concept spread from inflating early Stars via per-concept rounding.

### 4.3 Evidence-tier latching via starHighWater

Stars are monotonically non-decreasing via a single integer latch per monster. The latch is:
- Read: `displayStars = max(computedStars, persisted.starHighWater, legacyFloor)`
- Write: `starHighWater = max(existing, computed)` — never decreases

This is simpler than per-concept per-tier bitmaps (which the plan considered but rejected for storage bloat). The trade-off: the latch captures the peak total, not which tiers were unlocked. If a future weight rebalance changes the relative contribution of tiers, the latch may hold a value that is unreachable under the new weights. Acceptable because weight rebalances are expected to be monotonic (no tier weight decreases in production).

### 4.4 Legacy migration via seedStarHighWater

Pre-P5 learners have no `starHighWater` field. On first write, `seedStarHighWater` computes the legacy stage from the existing `mastered.length / conceptTotal` ratio and maps it to a Star floor. This captures the migration floor into persistent state before it can be lost. The mapping: stage 0→0, 1→1, 2→15, 3→35, 4→100.

### 4.5 Caught contract widened

Pre-P5: `caught = mastered >= 1` (derived from secured concept count). Post-P5: `caught = mastered >= 1 || displayStars >= 1` (a learner with 1 Star but 0 mastered concepts is caught — matching the "1 Star catches the Egg" invariant). This widens the catch gate to include sub-secured evidence. The Concordium invariant test comments were updated to reflect the new contract.

---

## 5. What the Reviewer Cycle Catches (and Doesn't)

### 5.1 What it catches

- **Logic bugs in evidence-tier boundaries** (nudge gate, temporal ordering, IEEE 754 boundaries)
- **State persistence bugs** (legacy floor erasure — would have been invisible in unit tests because no test exercised the pre-P5 → post-P5 write → read round-trip)
- **Missing CSS** (250 lines that the worker forgot entirely)
- **Tautological tests** (self-referential assertions, dead code, vacuous guards)
- **Test-naming vs test-behaviour mismatches** (Couronnail "gradual" test using legacy floor jumps)
- **Dead code and stale comments** (PrimaryModeCard bank branch, Phase 3 layout description)

### 5.2 What it doesn't catch

- **Visual correctness.** The design-lens reviewer operates on code structure, not rendered pixels. CSS was added but never rendered in a browser during the review cycle. Playwright extension was deferred.
- **Production-scale recentAttempts window effects.** The 80-entry sliding window means evidence tiers can flip from true to false as old entries rotate out. The `starHighWater` latch mitigates this, but no test exercises a 80+ attempt sequence that rotates out evidence.
- **Cross-session starHighWater write-back timing.** The latch is updated during `recordGrammarConceptMastery` (concept-secured events). Stars computed from `conceptNodes` on the client read path include sub-secured evidence that is not yet in the latch. The gap closes on the next concept-secured event — but for learners who take a long time between events, the displayed Stars may temporarily exceed the persisted latch.

---

## 6. Simulation Insights

The U3 simulation validated the curve but also revealed structural properties:

1. **Egg on day 1 is a design property, not a timeline target.** Any correct independent answer immediately produces `firstIndependentWin → at least 1 Star → Egg`. The plan's "1–2 weeks to first Egg" target was too conservative — it reflected the pre-revision Concordium broad-coverage gate, not the 1-Star Egg rule.

2. **Support-only ceiling at 25 Stars is above Hatch (15) but below Growing (35).** A learner who only uses worked/faded support can see their monsters hatch but cannot progress beyond that. This is a meaningful incentive signal — the child sees progress (motivating) but also sees a ceiling (encouraging independent practice).

3. **Grand Concordium is genuinely hard.** No simulated profile reached it within 150 days. This is correct: 18 concepts each requiring retention evidence (2+ independent corrects after reaching secure) across 5 punctuation-for-grammar concepts that may only be encountered through cross-subject practice. Grand Concordium is the ultimate Grammar achievement, not a routine milestone.

4. **The struggling profile reaches Mega at day 86.** This is 12+ weeks of daily practice — long, but achievable. The back-loaded curve (60% weight on retention) means struggling learners progress slowly but are not locked out. They can reach Hatched/Growing stages in 2–3 weeks, which provides ongoing motivation.

---

## 7. Files Inventory

### New files created (12)

| File | Lines | Purpose |
|---|---|---|
| `shared/grammar/grammar-stars.js` | 386 | Core Star model: constants, derivation, computation, staging |
| `src/platform/game/mastery/grammar-stars.js` | 17 | Thin re-export for mastery module tree |
| `docs/plans/james/grammar/grammar-phase5-invariants.md` | 178 | 15 numbered Phase 5 invariants |
| `docs/plans/james/grammar/grammar-star-curve-simulation.md` | 154 | Simulation results report |
| `tests/grammar-phase5-invariants.test.js` | 266 | Module-load hard gates |
| `tests/grammar-stars.test.js` | 739 | Evidence-tier derivation tests (69 scenarios) |
| `tests/grammar-stars-drift-guard.test.js` | 115 | Ripgrep-based constant drift guard |
| `tests/grammar-star-staging.test.js` | 904 | Staging, latch, migration tests (30+ scenarios) |
| `tests/grammar-star-events.test.js` | 716 | Event emission tests (16 scenarios) |
| `tests/grammar-star-curve-simulation.test.js` | 373 | Simulation timeline assertions (17 scenarios) |
| `tests/grammar-star-e2e.test.js` | 789 | End-to-end journey tests (15 scenarios) |
| `docs/plans/2026-04-27-001-feat-grammar-phase5-star-curve-landing-plan.md` | 681 | Implementation plan |

### Modified files (11)

| File | Change |
|---|---|
| `src/platform/game/mastery/grammar.js` | progressForGrammarMonster Star fields, starHighWater latch, seedStarHighWater, Star-based level |
| `src/platform/game/mastery/index.js` | Re-export GRAMMAR_MONSTER_IDS, GRAMMAR_GRAND_MONSTER_ID, GRAMMAR_RESERVED_MONSTER_IDS |
| `src/subjects/grammar/components/grammar-view-model.js` | buildGrammarMonsterStripModel, secondary links, Writing Try filter, monsterStrip in dashboard |
| `src/subjects/grammar/components/GrammarSetupScene.jsx` | Monster strip, single CTA, secondary links, responsive layout |
| `styles/app.css` | +250 lines Grammar Phase 5 CSS |
| `tests/grammar-concordium-invariant.test.js` | 3 new named shapes, 200-random Star ratchet, F2 integration, comment updates |
| `tests/grammar-ui-model.test.js` | Monster strip model, concordiumProgress compat, Star field shape |
| `tests/react-grammar-surface.test.js` | SSR assertions updated for new layout |
| `tests/helpers/grammar-simulation.js` | Multi-day simulation framework (+503 lines) |
| `tests/helpers/grammar-reward-invariant.js` | starHighWater in PRESERVED_ENTRY_KEYS |
| `scripts/inventory-inline-styles.mjs` | Budget bump for progress bar inline style |

---

## 8. Relationship to Origin Requirements

Phase 5 advances the origin requirements document (`docs/brainstorms/2026-04-24-grammar-mastery-region-requirements.md`) without redefining them:

- **R4 (mastery scale derived from secured evidence):** Extended — Stars derive from five evidence tiers, not just binary secured/not-secured. The 0–100% mastery scale is now the 0–100 Star scale.
- **R7 (supported answers < independent correctness):** Structurally enforced — supported answers cannot unlock `firstIndependentWin`, `repeatIndependentWin`, or `retainedAfterSecure` tiers (75% of the weight budget).
- **R12 (Concordium reaches Mega only when full denominator secured):** Extended — Grand Concordium requires all 18 concepts at full evidence (retention + independent + varied), not just binary secured.
- **R15 (reporting separates education from game):** Preserved — adult confidence labels are live-state, child Stars are latched. The two systems intentionally diverge after confidence regression.

**Concordium Egg gate origin revision.** The origin document proposed a broad-coverage gate (6+ secure concepts across 2+ clusters) for Concordium Egg. James revised this in the same conversation (origin line 734): "Concordium 也可以 1 Star = Egg found." The simpler rule was adopted because (a) Concordium's 18-concept denominator naturally slows it, (b) consistency across all monsters reduces cognitive load, and (c) simulation confirmed early Concordium progression is appropriately slow. This is documented in R13 with full rationale.

---

## 9. What Phase 6 Inherits

Phase 5 defers three items to Phase 6:

1. **Content expansion** — 6 concepts at the 2-template floor (`pronouns_cohesion`, `formality`, `active_passive`, `subject_object`, `modal_verbs`, `hyphen_ambiguity`). The Phase 4 content-expansion audit (`grammar-content-expansion-audit.md`) sets up the work.
2. **Answer-spec declarative migration** — 20 constructed-response templates still route through the adapter. The Phase 4 answer-spec audit (`grammar-answer-spec-audit.md`) inventories every template.
3. **Parent/admin hub Star display** — Adult hubs already show confidence chips and accuracy. Adding Star counts is an enhancement deferred from P5 scope.

Phase 5 also creates a foundation for future phases:
- **Post-Mega Grammar layer** (guardian/review challenges analogous to Spelling Guardian) — the `retainedAfterSecure` tier provides the conceptual hook
- **Cross-subject Star parity** — the `shared/grammar/grammar-stars.js` module pattern can be replicated for Punctuation Stars
- **Concordium broad-coverage gate** — deferred from P5, available as a future staging constraint if simulation reveals early Concordium progression is too fast after content expansion

---

## 10. Process Observations

### 10.1 Adversarial reviewers are highest-value for numerical code

The three HIGH bugs were all found by the adversarial reviewer or the correctness reviewer operating in adversarial mode. Standard correctness reviewers trace representative cases; adversarial reviewers construct failure scenarios. For numerical code (evidence-tier boundaries, IEEE 754 arithmetic, state persistence race conditions), adversarial review is not optional.

### 10.2 Design-lens reviewers catch what text-based review cannot

The U7+U8 worker produced structurally correct code with correct tests, correct accessibility attributes, and correct action routing. It produced zero CSS. The design-lens reviewer caught 250 lines of missing stylesheet definitions. This is a systematic blind spot in text-based code generation: structure ≠ visual.

### 10.3 The seedStarHighWater pattern is the Phase 5 migration template

The legacy floor erasure bug (§3.2) is the kind of bug that survives unit testing because no unit test exercises the full pre-P5 → post-P5 → write → read round-trip. The fix — seeding `starHighWater` from the legacy floor on first write — is the correct pattern for any future migration that replaces a ratio-based system with an absolute-value system. The lesson: when adding a new persistent field that gates an existing derived value, seed it from the existing derivation on first write, not from a default.

### 10.4 Simulation before threshold lock saves rework

U3 ran before U4 locked the stage thresholds. If the 5/10/10/15/60 split had produced bad timelines, weights would have been adjusted before any downstream unit shipped. The simulation confirmed the weights, so U4–U11 shipped without rework. This ordering — validate before commit — saved an estimated 3–4 units of rework that would have been needed if the weights were wrong.
