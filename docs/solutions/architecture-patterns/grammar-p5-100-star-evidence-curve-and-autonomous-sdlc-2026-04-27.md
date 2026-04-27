---
title: "100-Star evidence-based display curve — read-time derivation, starHighWater latch, and autonomous 10-unit SDLC"
date: 2026-04-27
category: architecture-patterns
module: grammar-reward-display
problem_type: architecture_pattern
component: development_workflow
severity: high
applies_when:
  - "Replacing a ratio-based progression with an absolute-value display scale"
  - "Adding a monotonicity latch to a derived value that can fluctuate"
  - "Migrating existing users to a new display model without visual regression"
  - "Running a 10+ unit autonomous SDLC sprint with adversarial review"
tags:
  - grammar
  - star-curve
  - evidence-tiers
  - monotonicity-latch
  - legacy-migration
  - adversarial-review
  - autonomous-sdlc
  - ieee-754
---

# 100-Star evidence-based display curve — read-time derivation, starHighWater latch, and autonomous 10-unit SDLC

## Context

Grammar Phase 5 replaced ratio-based monster staging (`grammarStageFor(mastered, total)`) with a 100-Star evidence-based display curve. The old system produced wildly different effort-to-Mega curves depending on monster denominator: Couronnail (3 concepts) hit Mega in days, Concordium (18 concepts) took months. Same "Mega" label, profoundly different meaning.

The core architectural challenge: the Grammar reward pipeline fires only on `grammar.concept-secured` events — the sole bridge from the mastery engine to the reward layer. But Stars need sub-secured evidence (first independent win, repeat win, varied practice). Adding new event types would couple the reward layer to internal engine transitions, violating Phase 4 invariant 6 ("rewards react to committed evidence only").

The delivery challenge: 10 implementation units with hard dependency chains, each requiring the full SDLC cycle (worker → reviewers → follower → merge), shipped autonomously by an AI scrum master.

## Guidance

### 1. Read-time derivation for cross-boundary display values

When a display value depends on data owned by a different system layer, derive it at read time rather than adding new events or coupling the layers.

Grammar Stars are derived from mastery concept nodes (`state.mastery.concepts`) + `recentAttempts` by a pure function in `shared/grammar/grammar-stars.js`. The reward layer (`grammar.js`) never sees sub-secured evidence — it only stores the `starHighWater` latch. The client read path (which has full engine state) computes Stars, and the latch captures the peak.

```
Engine state (mastery nodes + recentAttempts)
  → pure derivation function (shared/grammar/grammar-stars.js)
    → computed Stars
      → max(computed, persisted starHighWater, legacyFloor)
        → display Stars
```

The alternative — adding `grammar.star-evidence-changed` events — would have required changes to the Worker engine, event hooks, projection pipeline, and every consumer. The read-time approach required zero changes to the existing pipeline.

### 2. The starHighWater monotonicity latch pattern

When a derived value can fluctuate (concept losing secure status after wrong answers) but the display must never decrease:

- Store a single integer `starHighWater` per entity (per monster in this case)
- On read: `displayValue = max(derived, persisted)`
- On write: `persisted = max(existing, derived)` — never decreases
- On first write for legacy entities: **seed from the legacy derivation**, not from 0

The seed-from-legacy rule is critical. Without it, the first write permanently erases the legacy floor. This was the highest-severity bug caught by review (§3.2 of the completion report).

### 3. seedStarHighWater: seed new persistent fields from existing derivations

When adding a new persistent field that gates an existing derived value, seed it from the existing derivation on first write, not from a default value.

```js
function seedStarHighWater(entry, total) {
  if (entry.starHighWater !== undefined && entry.starHighWater !== null) {
    return safeStarHighWater(entry.starHighWater);
  }
  // Pre-P5: seed from legacy floor
  const mastered = grammarMasteredCount(entry);
  const legacyStage = grammarStageFor(mastered, total);
  return legacyStarFloorFromStage(legacyStage);
}
```

The pattern generalises: any migration that replaces a ratio-based system with an absolute-value system needs to capture the ratio-derived floor into the new persistent field before the ratio is discarded.

### 4. Epsilon-aware floor for IEEE 754 accumulated error

When summing fractional per-item contributions and flooring the total, accumulated IEEE 754 error can push values like 35.0 to 34.999... The floor produces 34 instead of 35.

Fix: `Math.floor(totalStars + 1e-9)`. The epsilon compensates for accumulated error without affecting integer-valued totals.

This was found by the adversarial reviewer's exhaustive sweep of all 31 weight subsets × 4 monster concept counts — only one stage boundary was affected (Concordium at weight 0.35).

### 5. firstAttemptIndependent as the sole independent-evidence gate

When checking whether an answer was genuinely independent (unsupported), use `firstAttemptIndependent === true` — the authoritative signal from the attempt-support system. Do NOT use `supportLevelAtScoring === 0` as a proxy, because nudge attempts (child got it wrong, retried correctly) have `supportLevelAtScoring: 0` but `firstAttemptIndependent: false`. An OR gate between the two lets retry-correct answers leak through as "independent".

### 6. Adversarial review for numerical code

Standard correctness reviewers trace representative cases. Adversarial reviewers construct failure scenarios and sweep combinatorial spaces. For numerical code (evidence-tier boundaries, floating-point arithmetic, state persistence race conditions), adversarial review is not optional.

Phase 5 stats: 3 HIGH-severity bugs caught by adversarial/correctness reviewers across 24 dispatches. The nudge gate and legacy floor erasure would have shipped as invisible bugs without adversarial scrutiny.

### 7. Simulation before threshold lock

Run deterministic multi-day simulations to validate curve parameters before any downstream unit hardcodes them. Phase 5 U3 ran before U4 locked the stage thresholds. The simulation confirmed the 5/10/10/15/60 evidence-tier weight split produces sensible timelines (Egg day 1, Mega 14-86 days, Grand Concordium 10+ weeks). No weight adjustment was needed — but if it had been, only U2's constants would have changed, not 8 downstream units.

## Why This Matters

**Read-time derivation** keeps system boundaries clean. The Grammar engine and reward layer have a well-defined contract (`grammar.concept-secured` events). Adding sub-secured evidence events would have blurred that boundary, making both systems harder to reason about and test independently.

**The starHighWater latch** is the difference between "Stars never decrease" (the invariant) and "Stars sometimes decrease after wrong answers" (the un-latched reality). The latch is cheap (one integer per monster) and the pattern is reusable for any monotonic display value.

**seedStarHighWater** prevents the most dangerous class of migration bug: silent data loss on first interaction. A pre-P5 learner at stage 3 (35 Stars floor) whose first post-deployment event writes `starHighWater: 0` would permanently drop to 0 visible Stars. The internal stage survives via `max(legacyStage, 0) = 3`, but the child-visible field regresses. Trust is destroyed.

**Adversarial review** catches bugs that unit tests miss because unit tests exercise representative cases, not adversarial state shapes. The nudge gate, legacy floor erasure, and IEEE 754 boundary were all invisible to standard correctness review.

## When to Apply

- Replacing a ratio-based or count-based progression with an absolute-value display scale
- Adding a monotonicity guarantee to a value derived from fluctuating state
- Migrating existing users to a new display model where the old model's derived values must be preserved
- Shipping numerical code where floating-point boundaries affect user-visible thresholds
- Running autonomous SDLC sprints with 5+ units touching shared state

## Examples

### Before: ratio-based staging (unfair across monsters)

```js
function grammarStageFor(mastered, total) {
  const ratio = mastered / total;
  if (ratio >= 1) return 4;    // Couronnail: 3/3 = Mega in days
  if (ratio >= 0.75) return 3; // Concordium: 14/18 = stage 3 after months
  if (ratio >= 0.5) return 2;
  if (ratio > 0) return 1;
  return 0;
}
```

### After: 100-Star evidence curve (fair, back-loaded, latched)

```js
// Five evidence tiers per concept
const GRAMMAR_CONCEPT_STAR_WEIGHTS = Object.freeze({
  firstIndependentWin: 0.05,   // Easy: any independent correct
  repeatIndependentWin: 0.10,  // Moderate: second independent correct
  variedPractice: 0.10,        // Moderate: 2+ distinct templates
  secureConfidence: 0.15,      // Hard: strength ≥ 0.82, interval ≥ 7d, streak ≥ 3
  retainedAfterSecure: 0.60,   // Hardest: 2+ independent corrects after secure
});

// Universal scale: all monsters use 100 Stars
// conceptBudget = 100 / conceptCount
// monsterStars = floor(sum(conceptBudget × sum(unlockedWeights)) + 1e-9)
// displayStars = max(computed, persisted.starHighWater, legacyFloor)
```

### The 10-unit autonomous SDLC sprint

| Unit | What | PRs | Review catches |
|------|------|-----|----------------|
| U1 | Invariants + contract freeze | #345 | Tautological tests, missing Concordium roster |
| U2 | Star model + evidence tiers | #349 | Nudge gate (HIGH), IEEE 754 (MEDIUM), temporal retention (HIGH) |
| U3 | Simulation spike | #353 | Vacuous assertion, model limitations |
| U4 | Staging + latch + migration | #358 | Legacy floor erasure (HIGH), missing Chronalyx test |
| U6 | Event semantics | #365 | Clean pass |
| U9 | Invariant extension | #366 | Dead syntheticAttempts code |
| U7+U8 | Monster strip + landing | #368 | 250 lines missing CSS, Writing Try gate |
| U10+U11 | View-model + e2e | #370 | Couronnail gradual proof, dead helpers |

**8 PRs, 24 reviewer dispatches, 3 HIGH bugs caught, 7,210 lines, 4,232 tests pass.**

## Related

- `docs/plans/james/grammar/grammar-phase5-implementation-report.md` — full completion report
- `docs/plans/james/grammar/grammar-phase5-invariants.md` — 15 Phase 5 invariants
- `docs/plans/james/grammar/grammar-star-curve-simulation.md` — simulation results
- `docs/plans/2026-04-27-001-feat-grammar-phase5-star-curve-landing-plan.md` — implementation plan
- `docs/solutions/workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md` — SDLC orchestration pattern
