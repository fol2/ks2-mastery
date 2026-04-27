---
title: "feat: Punctuation Phase 5 — Stars, Landing, and Reward Hardening"
type: feat
status: completed
date: 2026-04-27
deepened: 2026-04-27
origin: docs/plans/james/punctuation/punctuation-p5.md
---

# feat: Punctuation Phase 5 — Stars, Landing, and Reward Hardening

## Overview

Punctuation's reward system currently uses a ratio-based stage algorithm (`punctuationStageFor(mastered, total)`) that produces trivially fast Mega for small-denominator clusters — Claspin reaches Mega with just 2 simple secure units. The read-model conflates tracked reward units with secured ones, inflating progress on every surface. The landing page presents three equal-weight action buttons instead of a single mission CTA. Phase 5 replaces the ratio system with a 100-Star evidence-gated model, fixes the read-model bug, and rebuilds the landing page into a mission dashboard — hardening only, no new content, no new modes.

---

## Problem Frame

Phase 4 shipped the visible child journey: a child can now reach a Punctuation question within two taps, see monster progress, and navigate back safely. But Phase 4 exposed deeper reward and UX problems that the P5 advisory doc (`docs/plans/james/punctuation/punctuation-p5.md`) diagnosed:

1. **Monster evolution is too fast for small clusters.** `punctuationStageFor(mastered, total)` at `src/platform/game/mastery/punctuation.js:110-118` divides mastered count by cluster total. Claspin has 2 units: 1/2 = stage 2, 2/2 = stage 4 (Mega). A child can reach Claspin Mega without any spaced or mixed evidence. Spelling avoids this with fixed thresholds `DIRECT_STAGE_THRESHOLDS = [1, 10, 30, 60, 100]` at `src/platform/game/monsters.js:206`.

2. **The read-model inflates secured counts.** `src/subjects/punctuation/read-model.js:508` sets `securedRewardUnits: publishedRewardUnits.length` — it counts every tracked unit as secured. This propagates to `module.js:87` (Home dashboard `pct`) and `module.js:89` (streak). Every surface shows inflated progress.

3. **The landing page is a button wall.** Three primary cards (Smart Review, Wobbly Spots, GPS Check) sit as equal-weight entry points. There is no "today's mission" framing, no monster companion above the fold, and the dominant visual elements are adult metrics (Accuracy, Secure counts). The child does not know what to do or why.

4. **Landing layout changes between states.** Fresh learner and post-session return render different layouts. The skeleton should be invariant; only content should update.

5. **Stage labels use adult language.** Summary renders `Stage {stage} of 4` — meaningless to a child. The copy should use the Spelling pattern's creature names or the star-stage equivalents.

---

## Requirements Trace

- R1. Direct Punctuation monsters use a fixed 100-Star scale. 100 Stars = Mega. (see origin: P5 spec §Star curve)
- R2. Quoral (grand monster) uses 100 Grand Stars with harder evidence gates. (see origin: P5 spec §Quoral)
- R3. Stars are computed at read time from existing reward unit evidence, item memory, facet memory, and attempt data — a view-layer projection in the read-model, not new persistence. The star projection runs in `buildPunctuationLearnerReadModel` where all evidence fields are available, NOT in `progressForPunctuationMonster` which operates on monster codex state only. (confirmed: user selected view-layer projection approach)
- R4. The ratio-based `punctuationStageFor` is retired. The mastery layer (`progressForPunctuationMonster`) switches to count-based thresholds that prevent small-denominator Mega. Child-facing surfaces display star-derived stages from the read-model projection. (see origin: P5 spec §P5-U2)
- R5. Claspin with 2 simple secure units cannot reach Mega. Deep secure evidence gates are required for stage 4. (see origin: P5 spec §Claspin)
- R6. The read-model `securedRewardUnits` bug is fixed: tracked, secured, and deep-secured counts are distinct. (see origin: P5 spec §P5-U8)
- R7. The landing page becomes a mission dashboard with one primary CTA, monster companion, star meters, and secondary practice options below the fold. (see origin: P5 spec §Landing Page)
- R8. Landing layout skeleton is invariant across fresh-learner, mid-session, and post-session states. Only content updates. (see origin: P5 spec §Consistent landing)
- R9. All child-facing reward copy uses stage names (Not caught / Egg Found / Hatch / Evolve / Strong / Mega) and star meters. No `Stage X of 4`, no `XP`, no `X/Y secure`. Stage labels map 1:1 to stages 0-4: 0=Not caught, 1=Egg Found, 2=Hatch, 3=Evolve, 4=Mega. The "Strong" label is reserved for a display variant when stars are 60-99 (still stage 3 internally). (see origin: P5 spec §P5-U9)
- R10. No regression: oracle replay 11/11, zero `contentReleaseId` bump, zero engine file touches (`shared/punctuation/marking.js`, `generators.js`, `scheduler.js`), Spelling parity preserved. (user explicit constraint)
- R11. Stars may not be farmed by grinding same-day easy items. Evidence caps and learning-quality gates enforce meaningful practice. (see origin: P5 spec §Star evidence fields)
- R12. Supported/guided answers contribute Try/Practice Stars but cannot push to Secure/Mastery Stars. (see origin: P5 spec §Star categories)
- R13. Monster stages are additive — previously earned stages never de-evolve. Since stars are a read-time projection and evidence can weaken (lapses), the mastery layer persists a `maxStageEver` high-water mark in the existing monster codex state (`gameStateRepository`). The display stage is `max(currentStarStage, maxStageEver)`. This is a single integer field per monster entry, not a new table. (see origin: requirements doc R15)

---

## Scope Boundaries

- No new practice modes, no new skills, no new content, no AI.
- No changes to `shared/punctuation/marking.js`, `shared/punctuation/generators.js`, or `shared/punctuation/scheduler.js` (engine scope lock).
- No `contentReleaseId` bump.
- No new D1 tables or migrations for Star persistence — Stars are a view-layer projection. The only persistence addition is a `maxStageEver` integer per monster entry in the existing `gameStateRepository` codex (to enforce R13 additivity when star evidence weakens).
- No Parent Hub or Admin Hub redesign — those surfaces may read the corrected read-model but their layout is out of scope.
- No cross-subject reward system changes.

### Deferred to Follow-Up Work

- Quoral "Watching Bellstorm Coast" shadow/preview state before formal Egg — visual-only, separate PR.
- Dev-only stall endpoint for pending-command journey assertions (P4 deferral).
- Per-session rate limit on `record-event` (P4 deferral).
- `completedToday` signal distinguishing fresh learner from completed-today on Home hero (P4 deferral).

---

## Context & Research

### Relevant Code and Patterns

- `src/platform/game/monsters.js:206` — `DIRECT_STAGE_THRESHOLDS = Object.freeze([1, 10, 30, 60, 100])` — the Spelling fixed-threshold pattern P5 will adopt.
- `src/platform/game/monsters.js:217-224` — `stageFor(mastered, thresholds)` — accepts custom thresholds, already proven for Spelling. Punctuation can call this with its own star thresholds.
- `src/platform/game/mastery/punctuation.js:110-118` — `punctuationStageFor(mastered, total)` — the ratio-based function being retired.
- `src/platform/game/mastery/punctuation.js:125-143` — `progressForPunctuationMonster` — calls `punctuationStageFor`; will be rewired to call the new star-based stage function.
- `src/platform/game/mastery/punctuation.js:58-96` — `normalisePunctuationMonsterState` — read-time normaliser pattern (pre-flip union). The star projector should follow this same pure-function, idempotent pattern.
- `src/subjects/punctuation/read-model.js:507-508` — the `securedRewardUnits` bug: `publishedRewardUnits.length` used where `securedCount` should be computed from `securedAt` timestamps.
- `src/subjects/punctuation/read-model.js:118-139` — `memorySnapshot` — existing secure-bucket logic (`streak >= 3, accuracy >= 0.8, correctSpanDays >= 7`) that the star projector will read.
- `src/subjects/spelling/components/SpellingSetupScene.jsx` — the mission dashboard pattern with hero + meadow + stat grid + word bank link.
- `src/subjects/punctuation/components/punctuation-view-model.js` — existing view-model with `PUNCTUATION_PRIMARY_MODE_CARDS`, `buildPunctuationDashboardModel`, etc.
- `src/subjects/punctuation/components/PunctuationSetupScene.jsx` — current landing page with three primary cards.
- `src/subjects/punctuation/components/PunctuationSummaryScene.jsx` — currently renders `Stage {stage} of 4`.

### Institutional Learnings

- **Test-harness-vs-production divergence** hit Punctuation 4 times across P3-P4. For every new P5 field (star counts, evidence gates), the adversarial reviewer must construct "fresh learner completes 1 round" and trace every field to a production writer. (see `project_punctuation_p4.md`)
- **Read-time normaliser pattern** is the codebase norm for derived reward views (`normalisePunctuationMonsterState`, `normaliseGrammarRewardState`). Star projection must follow this — pure function, no stored-state mutation.
- **5-surface reward parity proof** from P4-U5 must be extended to cover the new star metric. (see `project_punctuation_p4.md` §U5)
- **Grammar's concordium-never-revoked invariant** aligns with R13 (additive stages). The pattern is: earned progress stays in the view even when learning evidence weakens.

---

## Key Technical Decisions

- **Two-tier stage architecture (critical — resolves data-domain mismatch):** `progressForPunctuationMonster` operates on monster codex state (`gameStateRepository`) and has 7+ call sites across 4 files, including the cross-subject aggregator (`mastery/spelling.js:148-153`) and event-hooks (`recordPunctuationRewardUnitMastery`). These call sites have NO access to subject-state evidence data (`progress.items`, `progress.facets`, etc.). The star projection therefore runs at a **different layer**: inside `buildPunctuationLearnerReadModel` (read-model.js), where all evidence fields are already destructured. The architecture is:
  - **Tier 1 (mastery layer):** `progressForPunctuationMonster` continues to receive only monster codex state. It switches from ratio-based `punctuationStageFor(mastered, total)` to count-based `stageFor(mastered, PUNCTUATION_MASTERED_THRESHOLDS)` where thresholds prevent small-denominator Mega. This tier drives event emissions (`caught`, `evolve`, `mega`), the cross-subject aggregator, and any path that only has codex state.
  - **Tier 2 (read-model layer):** `buildPunctuationLearnerReadModel` calls `projectPunctuationStars(progress, releaseId)` to compute the full star ledger. The read-model output exposes `starView: { perMonster, grand }` alongside the existing `progressSnapshot`. Child-facing surfaces (Setup, Summary, Map, Home) read from `starView` for display. The display stage is `max(starDerivedStage, maxStageEver)` to enforce R13 additivity.
  - **Tier bridge:** When `recordPunctuationRewardUnitMastery` fires a stage transition (Tier 1), the new stage is written to `maxStageEver` in the codex entry. When the read-model (Tier 2) computes star-derived stages, it takes `max(starStage, maxStageEver)`. This ensures display never de-evolves and celebration events still fire at secured-unit boundaries.
- **Reuse `stageFor(mastered, thresholds)` from `monsters.js`** for Tier 1: Define `PUNCTUATION_MASTERED_THRESHOLDS` (e.g., `[1, 2, 4, 6, 14]` — count-based, not ratio-based) so that Claspin 2/2 reaches stage 2 (not Mega) and Quoral 14/14 reaches Mega. These thresholds apply to secured-unit counts, not stars.
- **Define `PUNCTUATION_STAR_THRESHOLDS = [1, 10, 30, 60, 100]`** for Tier 2: The star projection produces 0-100 stars per monster. `stageFor(stars, PUNCTUATION_STAR_THRESHOLDS)` produces the child-facing star-derived stage. `PUNCTUATION_GRAND_STAR_THRESHOLDS` has harder gates for Quoral.
- **Star projection is a pure read-time function**: `projectPunctuationStars(progress, releaseId) => starLedger`. Runs inside `buildPunctuationLearnerReadModel` where `progress.items`, `progress.facets`, `progress.rewardUnits`, and `progress.attempts` are available. Never persisted to D1 or `child_subject_state`. Testable as a pure function.
- **Four Star categories (Try, Practice, Secure, Mastery)**: Each has a cap and evidence requirements. The caps sum to 100 per direct monster. The projector reads existing evidence fields only.
- **`maxStageEver` persisted in monster codex entry**: A single integer per monster entry in `gameStateRepository`. Written when `recordPunctuationRewardUnitMastery` computes a stage advance. Read by the read-model to enforce R13. This is NOT a new table — it is one field added to the existing `{ mastered: [], caught: bool }` entry shape.
- **Fix read-model bug early**: U1 in this plan, not U8 as in the advisory. Downstream units need correct secured counts.
- **Monster `masteredMax` values unchanged in `monsters.js`**: The star projection does not change the stored `mastered` arrays or `masteredMax`.
- **`caught` and `Egg Found` are distinct concepts**: `caught: mastered >= 1` remains anchored to the secured-unit event (Tier 1). `Egg Found` is the stage-1 display label (Tier 2) shown when stars >= 1. A child can see "Egg Found" from Try Stars before any unit secures — this is intentional (the child sees reward for effort). The `caught` boolean and the celebration toast fire only when a unit actually secures. The plan intentionally decouples the display milestone (star-derived) from the internal state transition (secured-unit). If this dual-signal is confusing at implementation time, the implementer may gate "Egg Found" display on `caught === true` instead — this is a U7 UI decision.

---

## Open Questions

### Resolved During Planning

- **Should Stars be persisted?** No — view-layer projection from existing evidence fields. User confirmed. Zero migration risk.
- **Should `stageFor` be reused or a new function created?** Reuse `stageFor` with custom thresholds. The function at `monsters.js:217` already accepts thresholds and is proven.
- **Should the read-model fix land early or late?** Early (U1) — the landing page and star projection depend on correct secured counts.
- **Where does the star projection run?** In `buildPunctuationLearnerReadModel` (Tier 2), not in `progressForPunctuationMonster` (Tier 1). Resolved during deepening — `progressForPunctuationMonster` operates on monster codex state only and has 7+ call sites (including the cross-subject aggregator and event-hooks) that cannot supply subject-state evidence data. The two-tier architecture preserves all existing call signatures.
- **How is R13 (additive stages) enforced when stars can decrease?** A `maxStageEver` high-water mark is written to the monster codex entry by `recordPunctuationRewardUnitMastery` (Tier 1). The read-model (Tier 2) computes `displayStage = max(starDerivedStage, maxStageEver)`. Evidence weakening does not de-evolve the displayed stage.
- **Are `caught` and `Egg Found` the same thing?** No. `caught` is an internal boolean (`mastered >= 1`, Tier 1) triggered by the first secured reward unit. `Egg Found` is the stage-1 display label (Tier 2) shown when stars >= 1. A child may see "Egg Found" from Try Stars before any unit secures. The `caught` celebration toast fires only at the secured-unit boundary. This decoupling is intentional.
- **Stage label set**: 5 stages (0-4) with 5 primary labels: Not caught / Egg Found / Hatch / Evolve / Mega. "Strong" is a display variant for stage 3 when stars are 60-99. Matches the advisory's table. The origin's "Evolve 2" / "Evolve 3" distinction is handled as Evolve (stars 30-59) vs Strong (stars 60-99), both mapping to stage 3 internally.

### Deferred to Implementation

- **Exact per-category star weights for each cluster size**: The advisory proposes Try=10, Practice=30, Secure=35, Mastery=25. The implementer should tune these so Claspin (2 units, high weight per unit) feels comparable to Pealark (5 units, lower weight per unit). The projector function is the single tuning point.
- **Grand Star derivation formula**: Whether Grand Stars use a weighted sum of direct-monster progress, a breadth-gate approach, or a hybrid. The plan specifies breadth gates per the advisory but the exact weights are implementation-time.
- **Monster `nameByStage` alignment with new labels**: Current `nameByStage` arrays use creature names (e.g., `['Pealark Egg', 'Pealark', 'Chimewing', 'Bellcrest', 'Mega Bellcrest']`). The new child-facing stage labels (Not caught / Egg Found / Hatch / Evolve / Strong / Mega) may be used alongside creature names or instead. This is a U8 UI-copy decision — both label systems can coexist (e.g., "Chimewing · Evolve · 38 / 100 Stars").
- **`PUNCTUATION_MASTERED_THRESHOLDS` exact values**: The plan proposes `[1, 2, 4, 6, 14]` but these may need tuning once the star projection (Tier 2) is wired. The Tier 1 thresholds only need to prevent Claspin 2/2 = Mega; the exact progression feel is driven by Tier 2 star thresholds.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
┌─────────────────────────────────────────────────────────────────────┐
│  TIER 1: Mastery layer (monster codex state only)                   │
│                                                                     │
│  gameStateRepository[monsterId] = { mastered: [], caught, maxStageEver }
│        │                                                            │
│        ▼                                                            │
│  progressForPunctuationMonster(state, monsterId)                    │
│    stage = stageFor(mastered.length, PUNCTUATION_MASTERED_THRESHOLDS)│
│    caught = mastered.length >= 1                                    │
│        │                                                            │
│        ├── recordPunctuationRewardUnitMastery → event emissions     │
│        ├── cross-subject aggregator (mastery/spelling.js)           │
│        └── Codex monster summary                                    │
│                                                                     │
│  Write: maxStageEver = max(currentStage, existing maxStageEver)     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  TIER 2: Read-model layer (full evidence available)                 │
│                                                                     │
│  buildPunctuationLearnerReadModel({ subjectStateRecord, ... })      │
│    progress.items[itemId]     → memorySnapshot → bucket, secure     │
│    progress.facets[facetKey]  → memorySnapshot → bucket, secure     │
│    progress.rewardUnits[key]  → { securedAt, clusterId, ... }       │
│    progress.attempts[]        → { correct, supportLevel, ... }      │
│        │                                                            │
│        ▼                                                            │
│  projectPunctuationStars(progress, releaseId) → starLedger          │
│    per monster → { tryStars, practiceStars, secureStars,            │
│                    masteryStars, total }  capped [10, 30, 35, 25]   │
│    grand → { grandStars, total }                                    │
│        │                                                            │
│        ▼                                                            │
│  starDerivedStage = stageFor(stars, PUNCTUATION_STAR_THRESHOLDS)    │
│  displayStage = max(starDerivedStage, maxStageEver)   ← R13 guard  │
│        │                                                            │
│        ▼                                                            │
│  Read-model output includes: starView.perMonster, starView.grand    │
│                                                                     │
│  Child-facing surfaces read starView:                               │
│    Setup landing  │  Summary strip  │  Map groupings  │  Home card  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Units

- U1. **Fix read-model securedRewardUnits bug**

**Goal:** Correct the conflation of tracked and secured reward units so all downstream surfaces display accurate progress.

**Requirements:** R6, R10

**Dependencies:** None

**Files:**
- Modify: `src/subjects/punctuation/read-model.js`
- Modify: `src/subjects/punctuation/module.js`
- Test: `tests/punctuation-read-model.test.js`

**Approach:**
- In `read-model.js`, compute four distinct counts from `currentPublishedRewardUnits()`: `publishedRewardUnits` (always 14), `trackedRewardUnits` (entries that exist in the progress store), `securedRewardUnits` (entries with a valid `securedAt` timestamp), `deepSecuredRewardUnits` (0 for now — placeholder until U3 defines deep-secure projection).
- Fix lines 507-508, 521, and 542 where `publishedRewardUnits.length` is used instead of the correct secured count.
- In `module.js`, fix the `pct` derivation at line 87 and `streak` at line 89 to use the corrected `securedRewardUnits`.

**Patterns to follow:**
- The existing `currentPublishedRewardUnits()` helper at `read-model.js:186-195` already filters by `PUNCTUATION_CLIENT_REWARD_UNIT_KEYS`. Inspect each entry's `securedAt` field — set by `shared/punctuation/service.js:847`.

**Test scenarios:**
- Happy path: Fresh learner — 14 published, 0 tracked, 0 secured.
- Happy path: One item becomes secure → reward unit entry written → tracked 1, secured 1.
- Happy path: Three units tracked, only one has `securedAt` → tracked 3, secured 1.
- Edge case: Reward unit entry exists but `securedAt` is missing/null → tracked but not secured.
- Integration: `module.js` `pct` derives from `securedRewardUnits / totalRewardUnits`, not tracked/published.
- Integration: Home dashboard, Codex, and landing stats all display the corrected secured count.

**Verification:**
- Oracle replay 11/11 green. No engine file changes.
- `securedRewardUnits` equals the count of entries with valid `securedAt`, not `publishedRewardUnits.length`.

---

- U2. **Replace ratio-based stage algorithm with count-based thresholds (Tier 1)**

**Goal:** Retire `punctuationStageFor(mastered, total)` in the mastery layer and replace it with count-based `stageFor(mastered, thresholds)` so Claspin cannot trivially Mega. This is the Tier 1 change — it fixes event emissions and the cross-subject aggregator without requiring evidence data.

**Requirements:** R4, R5, R10, R13

**Dependencies:** U1

**Files:**
- Modify: `src/platform/game/mastery/punctuation.js`
- Modify: `src/platform/game/monsters.js` (add threshold constants)
- Test: `tests/punctuation-mastery.test.js`

**Approach:**
- Define `PUNCTUATION_MASTERED_THRESHOLDS = Object.freeze([1, 2, 4, 6, 14])` in `monsters.js` — count-based thresholds for the mastered-unit count. With these thresholds: Claspin 2/2 mastered → stage 2 (not Mega), Pealark 5/5 → stage 3, Curlune 7/7 → stage 4, Quoral 14/14 → stage 4. The exact values are tunable — the key invariant is Claspin 2/2 ≤ stage 2.
- Define `PUNCTUATION_STAR_THRESHOLDS = Object.freeze([1, 10, 30, 60, 100])` for Tier 2 (used by the read-model star projection in U3/U4).
- Define `PUNCTUATION_GRAND_STAR_THRESHOLDS` (e.g., `Object.freeze([1, 10, 25, 50, 100])`) for Quoral.
- In `mastery/punctuation.js`, replace `punctuationStageFor(mastered, total)` with `stageFor(mastered, PUNCTUATION_MASTERED_THRESHOLDS)` inside `progressForPunctuationMonster`. No other signature changes — this function still receives only monster codex state.
- Add `maxStageEver` persistence: when `recordPunctuationRewardUnitMastery` computes a new stage that exceeds the existing `maxStageEver`, write it to the codex entry. Read-model (Tier 2, U4) uses this for R13 display additivity.
- `caught` remains `mastered >= 1`. All existing call sites unchanged.

**Patterns to follow:**
- `stageFor(mastered, thresholds)` at `monsters.js:217-224`.
- `DIRECT_STAGE_THRESHOLDS` / `PHAETON_STAGE_THRESHOLDS` constant pattern.

**Test scenarios:**
- Happy path: 0 mastered → stage 0.
- Happy path: 1 mastered → stage 1.
- Happy path: 2 mastered → stage 2.
- Covers R5: Claspin with 2 mastered units → stage 2 max (threshold `[1,2,4,6,14]` puts 2 at stage 2, not 4).
- Happy path: Pealark 5 mastered → stage 3 (threshold 4 for stage 3).
- Happy path: Curlune 7 mastered → stage 4 (threshold 6 for stage 3, but 7 > 6, so stage 4 needs threshold check — tune thresholds so 7/7 is stage 3 or 4 depending on desired curve).
- Happy path: Quoral 14 mastered → stage 4.
- Edge case: `maxStageEver` written on stage advance, read back on subsequent calls.
- Regression: All existing `punctuationEventFromTransition` tests still pass (stages remain 0-4 integers).
- Regression: `recordPunctuationRewardUnitMastery` event emission unchanged — events fire at the same boundaries.
- Regression: Cross-subject aggregator (`mastery/spelling.js:148-153`) returns consistent results — call signature unchanged.
- Regression: Oracle replay 11/11.

**Verification:**
- `punctuationStageFor` has zero references. Grep confirms removal.
- `stageFor(mastered, PUNCTUATION_MASTERED_THRESHOLDS)` is the Tier 1 stage path.
- Claspin 2/2 does not reach stage 4.
- `maxStageEver` is written to codex entry on stage transitions.

---

- U3. **Evidence-to-Stars projector**

**Goal:** Implement the pure read-time projection that converts existing evidence fields into per-monster star counts with four categories (Try, Practice, Secure, Mastery) and per-category caps.

**Requirements:** R1, R3, R11, R12

**Dependencies:** U1, U2

**Files:**
- Create: `src/subjects/punctuation/star-projection.js`
- Test: `tests/punctuation-star-projection.test.js`

**Approach:**
- Export `projectPunctuationStars(progress, releaseId)` returning `{ perMonster: { [monsterId]: { tryStars, practiceStars, secureStars, masteryStars, total } }, grand: { grandStars, total } }`.
- **Try Stars** (max 10): Count meaningful attempts (non-skip, genuine interaction). Cap same-item repeats. Cap same-day easy repeats.
- **Practice Stars** (max 30): Independent first-attempt correct, near-retry corrections, distinct item/template variety within the cluster.
- **Secure Stars** (max 35): Require spaced return (`correctSpanDays >= 7`), mixed review clean, accuracy stable, streak stable, no recent lapse.
- **Mastery Stars** (max 25): Require deep secure — mixed mode, GPS/transfer context clean, no recent wobble. This is the gate that prevents Claspin from trivially reaching 100.
- The function reads only from `progress.items`, `progress.facets`, `progress.rewardUnits`, `progress.attempts` — all existing fields populated by the Worker service.
- Grand Stars use breadth gates: require evidence from multiple direct monsters, not just depth in one.

**Execution note:** This is the unit where the user's learning-design expertise shapes the feature. The specific weights and formulas for each star category are a meaningful design choice — the implementer should prepare the function signature, test harness, and evidence-field wiring, then present the category logic as a contribution point.

**Patterns to follow:**
- `normalisePunctuationMonsterState(state)` at `mastery/punctuation.js:58-96` — pure function, idempotent, never persists.
- `memorySnapshot(value, nowTs)` at `read-model.js:118-139` — the existing secure/due/weak classification this projector reads from.

**Test scenarios:**
- Happy path: Fresh learner, zero attempts → all stars 0 for every monster.
- Happy path: One meaningful attempt → Try Stars increase, total > 0, Egg Found stage.
- Happy path: 3+ independent correct, 2+ distinct items → Practice Stars accumulate.
- Happy path: Item secure (`streak >= 3, accuracy >= 0.8, correctSpanDays >= 7`) → Secure Stars unlock.
- Covers R11: 10 same-item repeated attempts on same day → Try/Practice Stars capped, not inflated.
- Covers R12: Supported-only answers (supportLevel > 0) → Try/Practice Stars only, Secure/Mastery Stars blocked.
- Covers R5: Claspin with 2 items — both simple secure (item memory secure but no mixed/spaced/GPS evidence) → ~60-70 stars max, not 100.
- Edge case: Zero attempts but reward unit entry exists (impossible in current system but defensive) → 0 stars.
- Edge case: Attempt data inconsistent with item memory → stars derive from evidence, not assertion.
- Integration: `projectPunctuationStars` output feeds `stageFor(stars, thresholds)` and produces correct stages.

**Verification:**
- The function is a pure function: same input always produces same output, no side effects.
- Grep confirms no persistence calls inside the projector.
- Every star count field traces back to a production-writer in `shared/punctuation/service.js` — no test-harness-only fields.

---

- U4. **Wire star projection into read-model and expose starView (Tier 2)**

**Goal:** Integrate the star projection into `buildPunctuationLearnerReadModel` so child-facing surfaces can display star-derived stages and star meters. Extend the reward parity proof.

**Requirements:** R1, R2, R3, R10, R13

**Dependencies:** U2, U3

**Files:**
- Modify: `src/subjects/punctuation/read-model.js`
- Modify: `src/subjects/punctuation/module.js`
- Modify: `src/subjects/punctuation/components/punctuation-view-model.js`
- Test: `tests/punctuation-read-model.test.js`
- Test: `tests/punctuation-reward-parity.test.js`

**Approach:**
- In `buildPunctuationLearnerReadModel`, call `projectPunctuationStars(progress, releaseId)` (from U3) after existing evidence destructuring. This runs at `read-model.js:428-431` where `progress.items`, `progress.facets`, `progress.rewardUnits`, and `progress.attempts` are already available.
- Add `starView` to the read-model output: `{ perMonster: { [monsterId]: { tryStars, practiceStars, secureStars, masteryStars, total, stage, displayStage } }, grand: { grandStars, total, stage, displayStage } }`.
- `displayStage = max(starDerivedStage, maxStageEver)` where `maxStageEver` is read from the monster codex state (written by U2's `recordPunctuationRewardUnitMastery`). This enforces R13 additivity.
- `module.js` `getDashboardStats` reads `starView` from the read-model to produce the `pct` scalar (now `starView.grand.grandStars` or an aggregate) and per-monster star counts.
- `punctuation-view-model.js` helpers updated to read `starView` for display: `buildPunctuationDashboardModel` and the Summary/Map monster strip helpers.
- Extend the P4-U5 five-surface reward parity test: seed a state, compute stars, verify Home/Codex/Setup/Summary/Map all read identical `starView` values.

**Patterns to follow:**
- The existing `progressSnapshot` structure in `read-model.js:503-515` — `starView` sits alongside it as a sibling object.
- `buildPunctuationDashboardModel` in `punctuation-view-model.js` — already transforms read-model output for display.

**Test scenarios:**
- Happy path: Seeded state with 3 secure units → `starView.perMonster[pealark].total` matches projection → displayStage matches thresholds.
- Covers R13: Seed maxStageEver=3 in codex, evidence weakens to stars=25 (starStage=2) → displayStage remains 3.
- Covers R13: Evidence strengthens to stars=65 (starStage=3) with maxStageEver=2 → displayStage becomes 3, maxStageEver updated to 3.
- Integration: Home `SubjectCard.progress`, Codex monster summary, Setup/Summary/Map all read from the same `starView` derivation chain.
- Integration: `module.js` `pct` derives from `starView.grand.grandStars`, not the old `securedRewardUnits / publishedRewardUnits`.
- Regression: `progressForPunctuationMonster` (Tier 1) still returns count-based stages — unchanged from U2. The cross-subject aggregator at `mastery/spelling.js:148-153` is unaffected.
- Regression: `recordPunctuationRewardUnitMastery` event emissions unchanged.
- Regression: Oracle replay 11/11.

**Verification:**
- `buildPunctuationLearnerReadModel` output includes `starView` with per-monster star breakdowns.
- Five-surface parity test asserts star-count identity across all consumer surfaces.
- `displayStage >= maxStageEver` holds for every monster in every test case.

---

- U5. **Direct monster Star weights design**

**Goal:** Calibrate the per-category star weights so all three direct monsters (Pealark 5 units, Claspin 2 units, Curlune 7 units) feel psychologically similar in progression speed.

**Requirements:** R1, R5, R11

**Dependencies:** U3

**Files:**
- Modify: `src/subjects/punctuation/star-projection.js`
- Test: `tests/punctuation-star-projection.test.js`

**Approach:**
- For each direct monster, define per-unit raw weights that account for cluster size:
  - Pealark (5 units): each unit contributes ~20 raw stars across categories.
  - Claspin (2 units): each unit contributes ~50 raw stars but Mastery Stars require mixed/spaced/GPS evidence that 2 simple secure units cannot provide.
  - Curlune (7 units): each unit contributes ~14 raw stars; breadth compensates naturally.
- The key constraint: "Scope small嘅 monster 唔會比 scope 大嘅 monster 快幾倍 Mega" and "Scope 大嘅 monster亦唔會慢到放棄."
- Add calibration tests that assert progression timeline similarity across monsters.

**Execution note:** This is the core tuning unit. The star weights are a meaningful design choice that shapes child experience. The implementer should present the weight table and progression curves for user review before finalising.

**Patterns to follow:**
- `PUNCTUATION_CLIENT_REWARD_UNITS` mapping in `read-model.js:28-43` — the cluster-to-unit mapping this uses.

**Test scenarios:**
- Happy path: Claspin learner with both units at item-secure (basic) but no mixed/GPS evidence → ~65-75 stars, stage 3 (Growing/Strong), not Mega.
- Happy path: Pealark learner with 3/5 units secure + mixed evidence → ~55-65 stars, stage 3.
- Happy path: Curlune learner with 5/7 units secure → ~55-65 stars, stage 3.
- Covers R5: Claspin reaches Mega only with deep-secure evidence (mixed sentence context clean, spaced return after 7+ days, both contractions + possession deep secure).
- Edge case: One monster has all Mastery Stars, another has none → stage differences are reasonable (max 1 stage gap for same effort).

**Verification:**
- A "complete simple secure" journey for each direct monster produces stages within 1 stage of each other.
- Claspin Mega requires evidence beyond 2 simple secure units.

---

- U6. **Quoral Grand Star curve**

**Goal:** Define the Grand Star derivation with breadth gates so Quoral cannot be trivially caught and its Mega requires full Punctuation mastery.

**Requirements:** R2

**Dependencies:** U3, U5

**Files:**
- Modify: `src/subjects/punctuation/star-projection.js`
- Modify: `src/platform/game/monsters.js` (add `PUNCTUATION_GRAND_STAR_THRESHOLDS`)
- Test: `tests/punctuation-star-projection.test.js`

**Approach:**
- Grand Stars derive from breadth + deep-secure evidence, not from summing direct Stars.
- Gates per the advisory:
  - Quoral Egg Found (10 Grand Stars): at least 2 direct monsters have Egg/Hatch + 3 secure units.
  - Hatch (25): all 3 direct monsters have progress + 6 secure units.
  - Evolve 2 (50): 8+ secure/deep-secure units across all three clusters.
  - Evolve 3 (75): 11+ secure/deep-secure units + GPS/mixed review evidence.
  - Grand Quoral (100): all 14 units deep secure + all 3 direct monsters at or near Mega.
- `PUNCTUATION_GRAND_STAR_THRESHOLDS` defined in `monsters.js`.

**Patterns to follow:**
- `PHAETON_STAGE_THRESHOLDS = Object.freeze([3, 25, 95, 145, 213])` — Spelling's aggregate threshold pattern.

**Test scenarios:**
- Happy path: First unit secure in one monster → Quoral at 0 Grand Stars (Locked/Watching).
- Happy path: 2 direct monsters with Egg + 3 secure units → Quoral Egg Found.
- Happy path: All 3 direct monsters progressing, 6 secure → Quoral Hatch.
- Happy path: All 14 units deep secure, all direct monsters Mega → Grand Quoral (100).
- Edge case: All units from one monster only → Quoral below Egg threshold (breadth gate blocks).
- Edge case: 13/14 units deep secure → Quoral at Evolve 3, not Grand (completeness required).

**Verification:**
- Quoral never catches from a single unit's progress.
- Grand Quoral requires all 14 units at deep-secure and breadth across all three direct monsters.

---

- U7. **Landing page v2 — mission dashboard**

**Goal:** Replace the three-card button wall with a mission dashboard: one primary CTA, monster companion, star meters, secondary practice options.

**Requirements:** R7, R8, R9, R10

**Dependencies:** U1, U4

**Files:**
- Modify: `src/subjects/punctuation/components/PunctuationSetupScene.jsx`
- Modify: `src/subjects/punctuation/components/punctuation-view-model.js`
- Modify: `styles/app.css`
- Test: `tests/react-punctuation-scene.test.js`
- Test: `tests/journeys/smart-review.mjs` (extend existing)

**Approach:**
- Above the fold: Bellstorm Coast hero with active monster companion + "Today's punctuation mission" headline + single `[Start today's round]` CTA.
- Progress row: compact Due / Wobbly / Stars earned (not Accuracy or Secure counts as primary).
- Monster row: 4 monsters with star meters (`X / 100 Stars`) and stage label.
- Map card: `[Open Punctuation Map]` link.
- Secondary practice drawer: Wobbly Spots / GPS Check / Change round length.
- The CTA dispatches Smart Review as default, Wobbly if weaknesses exist, or continues an active session.
- Layout skeleton is invariant (R8): fresh learner sees `0 / 100 Stars` and "Find your first punctuation egg" mission; post-session sees updated stars and "Pealark gained 2 Stars".

**Patterns to follow:**
- `SpellingSetupScene.jsx` — hero + meadow + stat grid + word bank link structure.
- `PUNCTUATION_PRIMARY_MODE_CARDS` and `buildPunctuationDashboardModel` in `punctuation-view-model.js`.

**Test scenarios:**
- Happy path: Fresh learner — single CTA "Find your first punctuation egg", all monsters at 0/100 Stars.
- Happy path: Post-session — same layout, updated stars and mission text.
- Happy path: Wobbly spots exist — CTA switches to "Practise wobbly spots" or secondary CTA promoted.
- Covers R8: SSR landmark comparison between fresh-learner and post-session renders — same `data-*` attributes, same section order, different content.
- Covers R9: No `Stage X of 4` anywhere in the rendered output.
- Edge case: Analytics loading/degraded → skeleton with "Checking progress..." placeholder, same layout.
- Edge case: Active session exists → CTA becomes "Continue your round".
- Regression: Round-length preference still accessible via secondary drawer.
- Regression: Punctuation Map link still reachable.

**Verification:**
- Above the fold has exactly one primary CTA.
- No adult metrics (Accuracy, Secure count) as primary visual elements.
- `data-*` landmark elements identical across fresh/post-session renders.

---

- U8. **Reward surface copy cleanup**

**Goal:** Replace all child-facing `Stage X of 4`, `X/Y secure`, `publishedTotal`, and `XP` references with star-stage names and star meters.

**Requirements:** R9, R10

**Dependencies:** U4, U7

**Files:**
- Modify: `src/subjects/punctuation/components/PunctuationSummaryScene.jsx`
- Modify: `src/subjects/punctuation/components/PunctuationMapScene.jsx`
- Modify: `src/subjects/punctuation/components/punctuation-view-model.js`
- Test: `tests/react-punctuation-scene.test.js`

**Approach:**
- Summary's `MonsterProgressStrip` changes from `Stage {stage} of 4` + dot indicators to creature name + `X / 100 Stars` + stage label (Not caught / Egg Found / Hatch / Evolve / Strong / Mega).
- Map's monster grouping headers change from secure counts to star meters.
- The view-model exports a `punctuationStageLabel(stage)` helper returning the child-facing label.
- All surfaces use the same label set. Parent/Admin surfaces can still show detailed evidence breakdowns but child surfaces never show technical metrics.

**Patterns to follow:**
- `MONSTERS[monsterId].nameByStage[stage]` — existing creature-name-by-stage pattern.

**Test scenarios:**
- Happy path: Summary renders "Pealark · Egg Found · 8 / 100 Stars" instead of "Stage 1 of 4". Stage label reads from `starView.perMonster[monsterId].displayStage`.
- Happy path: Map renders "Claspin · 0 / 100 Stars" instead of "0/2 secure".
- Covers R9: Grep for `Stage.*of.*4` in rendered output → zero matches.
- Covers R9: Grep for `XP` in child-facing components → zero matches.
- Covers R9: Grep for `secure` as visible text in child-facing components → zero matches (may appear in data attributes or non-visible code).
- Edge case: Stage 0 monster → "Not caught" label, not "Stage 0 of 4".

**Verification:**
- No child-facing surface contains `Stage X of 4`, `XP`, or `X/Y secure` as visible text.
- All surfaces use the same `punctuationStageLabel` helper for consistency.

---

- U9. **Journey specs and parity proof**

**Goal:** Add journey specs proving the critical path works end-to-end and extend the reward parity proof to cover star consistency across all surfaces.

**Requirements:** R1, R7, R8, R10

**Dependencies:** U7, U8

**Files:**
- Create: `tests/journeys/punctuation-landing-skeleton.mjs`
- Modify: `tests/journeys/smart-review.mjs`
- Modify: `tests/journeys/reward-parity-visual.mjs`
- Test: `tests/punctuation-reward-parity.test.js`

**Approach:**
- New journey `punctuation-landing-skeleton.mjs`: screenshot landing pre-session and post-session, assert identical landmark elements (`data-section`, `data-monster-row`, `data-cta`).
- Extend `smart-review.mjs`: verify star meter visible on landing, CTA dispatches correctly, star count updates after session completion.
- Extend `reward-parity-visual.mjs`: assert star-count consistency across Home, Setup, Summary, Map, Codex after a seeded secured unit.
- Unit test `punctuation-reward-parity.test.js`: pure-function parity proof — seed state → project stars → verify all five consumer surfaces read identical values.

**Test scenarios:**
- Happy path: Home → Punctuation Landing → Start → Q1 → Feedback → Summary → Back to Landing — stars visible throughout.
- Covers R8: Landing pre-session and post-session screenshots share identical DOM landmarks.
- Covers R1: Star meters on landing show `X / 100 Stars` for each monster.
- Integration: Seeded secured unit produces identical star/stage deltas on all 5 surfaces.
- Regression: Reserved monsters (`colisk`, `hyphang`, `carillon`) never appear on any surface.
- Regression: Oracle replay 11/11.

**Verification:**
- All journey specs pass.
- Five-surface parity test asserts star-count identity.
- No reserved monsters visible.

---

## System-Wide Impact

- **Interaction graph:** Two tiers, two interaction graphs. **Tier 1** (`progressForPunctuationMonster`): called by `recordPunctuationRewardUnitMastery`, `punctuationMonsterSummaryFromState`, `activePunctuationMonsterSummaryFromState`, and `monsterSummaryFromState` in `mastery/spelling.js` (the cross-subject aggregator). These call sites receive count-based stages after U2 — their signatures are unchanged, and no subject-state data is needed. **Tier 2** (`buildPunctuationLearnerReadModel`): the star projection runs here, producing `starView` consumed by child-facing components (Setup, Summary, Map, Home via `module.js`). The two tiers interact through `maxStageEver` in the codex: Tier 1 writes it on stage advance, Tier 2 reads it for R13 display additivity.
- **Error propagation:** The star projector is a pure function. If it throws, the caller (`progressForPunctuationMonster`) should catch and fall back to stage 0 / 0 stars rather than crashing the render. This matches the existing defensive `Math.max(0, ...)` patterns throughout the mastery layer.
- **State lifecycle risks:** No new persistence means no migration risk. The star projection reads existing fields. If a field is missing (e.g., `progress.attempts` is empty), stars default to 0.
- **API surface parity:** The Punctuation landing page, Summary, and Map all consume the same `progressForPunctuationMonster` output. The Home `SubjectCard` reads `getDashboardStats` which derives from the same projection. No surface is special-cased.
- **Integration coverage:** The five-surface parity test (U9) covers the cross-layer integration that unit tests alone cannot prove.
- **Unchanged invariants:** `contentReleaseId` stays at `punctuation-r4-full-14-skill-structure`. Oracle replay stays 11/11. Engine files untouched. Spelling parity preserved. Monster additivity preserved (R13). The `ACTIVE_PUNCTUATION_MONSTER_IDS` set does not change. The `PUNCTUATION_CLIENT_REWARD_UNITS` manifest does not change.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Star projection formula feels wrong after implementation — child reaches Mega too fast or too slowly | U5 is an explicit tuning unit with calibration tests. Weights are configurable in a single function. User reviews the weight table before finalising. |
| Test-harness-vs-production divergence (hit Punctuation 4 times in P3-P4) | Adversarial reviewer must construct "fresh learner completes 1 round" for every unit touching star projection. Every new field must trace to a production writer. |
| Landing page redesign breaks existing journey specs | U7 extends existing specs rather than replacing them. The `tests/journeys/` infrastructure from P4-U8 is preserved. |
| Five-surface parity breaks during intermediate units (U2-U3 gap) | U2 ships a temporary bridge that preserves existing stage behaviour. U4 replaces it with real projection. Parity test runs at U4. |
| Cross-subject aggregator (`mastery/spelling.js:148-153`) affected | The aggregator calls `activePunctuationMonsterSummaryFromState` which flows through the updated path. No special handling needed — the returned shape is unchanged (`{ subjectId, monster, progress }`). |

---

## Documentation / Operational Notes

- `docs/punctuation-production.md` should be updated after Phase 5 to reflect the star-based reward system — separate "wired" from "aspirational" as P4-U9 did.
- No Cloudflare deploy changes needed — Phase 5 is client + shared code only, no new Worker routes or D1 migrations.

---

## Sources & References

- **Origin document:** [docs/plans/james/punctuation/punctuation-p5.md](../james/punctuation/punctuation-p5.md)
- **Upstream requirements:** [docs/brainstorms/2026-04-24-punctuation-subject-engine-reward-blend-requirements.md](../brainstorms/2026-04-24-punctuation-subject-engine-reward-blend-requirements.md)
- **Phase 4 completion report:** [docs/plans/james/punctuation/punctuation-p4-completion-report.md](../james/punctuation/punctuation-p4-completion-report.md)
- **Spelling stage function:** `src/platform/game/monsters.js:206-224`
- **Punctuation ratio stage function (retiring):** `src/platform/game/mastery/punctuation.js:110-118`
- **Read-model bug site:** `src/subjects/punctuation/read-model.js:507-508`
- **Orchestration learnings:** `docs/solutions/workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md`
