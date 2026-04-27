---
title: "Punctuation P6 — Star Truth, Monotonic Latch, and Worker Delegation with Adversarial-Review SDLC"
date: 2026-04-27
category: architecture-patterns
module: punctuation-reward-display
problem_type: architecture_pattern
component: service_object
severity: high
applies_when:
  - Adding a new persisted monotonic latch field to a subject's mastery codex
  - Wiring subject-specific read-model data into the Worker payload for bootstrap/refresh parity
  - Implementing Mega gates that must survive curriculum changes
  - Aligning toast/reward events with a Star-derived display surface
  - Running autonomous multi-unit sprints on reward-algorithm or child-facing display code
tags:
  - star-projection
  - monotonic-display
  - worker-read-model
  - bootstrap-parity
  - adversarial-review
  - mega-gate
  - anti-grinding
  - two-tier-architecture
---

# Punctuation P6 — Star Truth, Monotonic Latch, and Worker Delegation with Adversarial-Review SDLC

## Context

Punctuation Phase 5 replaced ratio-based monster stages with a 100-Star evidence-gated system and rebuilt the landing page as a mission dashboard. Phase 6 was a production-hardening phase that closed 9 follow-on risks: Stars invisible after bootstrap, stages that could regress, Practice Stars without daily throttle, Curlune reaching Mega at 3/7 units, Claspin gate hardcoding skill strings, `deepSecuredRewardUnits` as a placeholder zero, reward events contradicting the Star surface, and telemetry without rate limits.

The phase shipped 10 PRs (#378-#400) with 3 HIGH bugs caught by adversarial review before merge. Grammar P5 (`grammar-p5-100-star-evidence-curve-and-autonomous-sdlc-2026-04-27.md`) established the foundational patterns; this document captures the Punctuation-specific extensions, cross-tier wiring decisions, and the adversarial-review findings that would have shipped broken.

## Guidance

### 1. Worker delegates to client read-model for Star derivation — never duplicate the projection

The Worker read-model (`buildPunctuationReadModel`) does NOT duplicate `projectPunctuationStars`. Instead, it threads `result.data` (containing `progress` with `items`, `facets`, `rewardUnits`, `attempts`) as a new `data` parameter and calls `buildPunctuationLearnerReadModel({ subjectStateRecord: { data } })` to obtain `starView`. Only `starView` is extracted — not the full client read-model output.

Two call sites thread `data`:
- **Command handler** (`commands.js:155`): `data: result.data`
- **Bootstrap path** (`repository.js:407`): `data` already available as the second parameter of `redactPunctuationUiForClient`

This ensures one canonical Star projection function, called from both paths. The `assertNoForbiddenReadModelKeys` recursive scan is safe because `starView` contains only star numbers and stage integers — no forbidden keys.

**Key constraint**: Only extract `starView` from the client read-model output. Attaching the full output (which includes `skillRows`, `weakestFacets`, `recentMistakes`, etc.) would expand the forbidden-key scan surface and risk false-positive throws on future field additions.

### 2. starHighWater latch: seed from legacy floor, not from 0

The `starHighWater` field persists in the mastery codex and ratchets upward on every reward-unit mastery event. The highest-severity Grammar P5 bug was seeding from 0 instead of the legacy derivation — Punctuation P6 follows the same pattern:

- `seedStarHighWater(entry)`: if `entry.starHighWater !== undefined && entry.starHighWater !== null`, preserve via `safeStarHighWater(existing)`. Otherwise, seed from `punctuationLegacyStarFloor(stageFor(mastered, PUNCTUATION_MASTERED_THRESHOLDS))`.
- The `!== undefined && !== null` guard is critical: `0` is a valid post-P6 value that must NOT trigger legacy seeding. Using `if (!entry.starHighWater)` would treat `0` as falsy and re-apply the legacy floor — permanently inflating every post-P6 learner at zero stars.
- `safeStarHighWater(n)` uses `Math.floor(n + 1e-9)` epsilon guard for IEEE 754 accumulated error at stage boundaries.
- The `total` parameter from Grammar's version was removed — Punctuation uses count-based staging, not ratio-based.

### 3. Grand monster (Quoral) must use GRAND thresholds everywhere — not just the read-model

The adversarial reviewer caught (HIGH, confidence 90) that `progressForPunctuationMonster` computed `starStage` using `PUNCTUATION_STAR_THRESHOLDS` [1,10,30,60,100] for ALL monsters including Quoral. The read-model correctly uses `PUNCTUATION_GRAND_STAR_THRESHOLDS` [1,10,25,50,100] for Quoral's display. At starHighWater values in [25,30) or [50,60), the stages diverge — a toast fires based on one stage while the child sees another.

**Fix**: Conditional threshold selection:
```javascript
const starThresholds = monsterId === PUNCTUATION_GRAND_MONSTER_ID
  ? PUNCTUATION_GRAND_STAR_THRESHOLDS
  : PUNCTUATION_STAR_THRESHOLDS;
```

**Rule**: Any code that derives a stage from a star count MUST check whether the monster is the grand monster and use the corresponding thresholds. This applies to: `progressForPunctuationMonster`, `buildPunctuationLearnerReadModel`, `mergeMonotonicDisplay` consumers, and any future toast/event/display path.

### 4. Monotonic merge must be a single shared helper, not per-scene inline code

The review cycle found 3 scenes (Setup, Summary, Map) each implementing the monotonic merge inline with divergent sanitisation: the view-model used `safeNumber()` (rejects Infinity), while Map/Summary used `Math.max(0, Math.floor(Number(x) || 0))` (passes Infinity through). The fix extracted `mergeMonotonicDisplay(liveStars, liveStage, codexEntry)` as a shared export in `punctuation-view-model.js`.

**Rule**: All child-facing surfaces must import `mergeMonotonicDisplay` rather than re-derive the merge inline. The aggregate "Stars earned" counter must also use `displayStars` (not raw `totalStars`) to prevent the child seeing a header number less than the sum of individual meters.

### 5. Mega gates must derive from the cluster mapping, not hardcode skill IDs

Claspin's gate hardcoded `'apostrophe_contractions'` and `'apostrophe_possession'`. If a third apostrophe skill were added, both the gate and `MONSTER_UNIT_COUNT` would need manual updating. The fix derives `CLASPIN_REQUIRED_SKILLS` from `SKILL_TO_CLUSTER.entries().filter(([, c]) => c === 'apostrophe')`.

Curlune's gate uses `Math.ceil(MONSTER_UNIT_COUNT.curlune * 0.71)` for the minimum threshold and requires both `securedUnitCount >= min` AND `deepSecuredSkillCount >= min` for structural parity with Claspin.

### 6. Near-retry corrections must respect the same daily cap as independent-correct items

The Practice Stars daily throttle capped `independentCorrect` and `correctItems` via `perDayCorrectItems`, but the `nearRetryCorrections` loop scanned all attempts without daily-cap gating. Both correctness and testing reviewers converged on this gap. The fix: only count a fail→correct transition if the correcting attempt's `itemId` is in `perDayCorrectItems.get(day)`.

### 7. Adversarial review is mandatory on all reward-algorithm and threshold code

Across Punctuation P5 (4 BLOCKERs / 21 dispatches) and P6 (3 HIGH + 4 MEDIUM / ~30 dispatches), adversarial review is the single highest-ROI review type for numerical/reward code. Key pattern: construct concrete failure scenarios with specific star values at threshold boundaries, then trace through the code step by step. Pattern-match review and testing review alone would NOT have caught the Quoral threshold mismatch (U8), the Stars-earned aggregate contradiction (U3), or the near-retry daily-cap bypass (U4).

## Why This Matters

Without these patterns:
- A child refreshes the page and all Star meters show 0 (Worker starView wiring gap)
- A child's monster de-evolves after a lapse (no monotonic latch)
- A child grinds 30+ items in one day to max Practice Stars (no daily throttle)
- Curlune reaches Mega from 3 of 7 units (no breadth gate)
- A toast says "Pealark evolved!" but the Star meter already shows a higher stage (threshold mismatch)
- Three scenes show three different star counts for the same monster (divergent sanitisation)

Each of these is a child-visible trust violation that erodes the "100 Stars = Mega" contract.

## When to Apply

- Adding a new subject with a Star/stage display system
- Wiring any subject's read-model data into the Worker payload
- Adding or modifying Mega/evolution gates on monster progression
- Implementing anti-grinding throttles on Star-like reward currencies
- Running autonomous sprints on child-facing reward code

## Examples

### Worker starView delegation (U2)

```javascript
// worker/src/subjects/punctuation/read-models.js
export function buildPunctuationReadModel({ learnerId, state, prefs, stats, analytics, content, data = null, ... }) {
  // ... existing payload assembly ...

  // U2: delegate to client read-model for canonical Star derivation
  const learnerReadModel = buildPunctuationLearnerReadModel({
    subjectStateRecord: data != null ? { data } : {},
  });
  payload.starView = learnerReadModel.starView;
  payload.stats.grandStars = learnerReadModel.starView.grand.grandStars;

  assertNoForbiddenReadModelKeys(payload); // starView has no forbidden keys
  return payload;
}
```

### Monotonic display merge (U3)

```javascript
// punctuation-view-model.js
export function mergeMonotonicDisplay(liveStars, liveStage, codexEntry) {
  const maxStageEver = safeNumber(codexEntry?.maxStageEver, 0);
  const starHighWater = safeNumber(codexEntry?.starHighWater, 0);
  return {
    displayStage: Math.max(liveStage, maxStageEver),
    displayStars: Math.max(liveStars, starHighWater),
  };
}
```

### Star-aligned event emission (U8)

```javascript
// mastery/punctuation.js
function punctuationEventFromTransition(payload, previous, next) {
  const prevEffective = Math.max(previous.stage, previous.starStage || 0);
  const nextEffective = Math.max(next.stage, next.starStage || 0);
  if (!previous.caught && next.caught) {
    return buildPunctuationEvent({ ...payload, kind: 'caught', previous, next });
  }
  if (nextEffective > prevEffective) {
    return buildPunctuationEvent({ ...payload, kind: nextEffective === 4 ? 'mega' : 'evolve', previous, next });
  }
  // ...
}
```

## Related

- `docs/solutions/architecture-patterns/grammar-p5-100-star-evidence-curve-and-autonomous-sdlc-2026-04-27.md` — Grammar P5 established the `starHighWater` latch, read-time derivation, and epsilon guard patterns that Punctuation P6 follows
- `docs/solutions/architecture-patterns/hero-p0-read-only-shadow-subsystem-2026-04-27.md` — Hero P0 provider pattern enforces the read-only boundary that P6 contract section 11 requires
- `docs/plans/james/punctuation/punctuation-p6.md` — the product-engineering contract
- `docs/plans/james/punctuation/punctuation-p6-completion-report.md` — unit-by-unit ledger with adversarial findings table
- `docs/plans/2026-04-27-002-feat-punctuation-phase6-star-truth-production-hardening-plan.md` — the implementation plan
