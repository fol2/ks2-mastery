---
title: "Grammar Phase 6 — Invariants (addendum)"
type: invariants
status: locked
date: 2026-04-27
plan: docs/plans/2026-04-27-002-feat-grammar-phase6-star-evidence-authority-plan.md
unit: U7
---

# Grammar Phase 6 — Invariants (addendum)

This document extends the Phase 5 invariants (`docs/plans/james/grammar/grammar-phase5-invariants.md`, 15 invariants locked) with six new invariants that cover the trust fixes shipped in Phase 6. The six fixes address evidence-shape authority, temporal proof, sub-secure persistence, and Grand Concordium timeline preservation.

**Phase 4 invariants 1--12 remain enforced.** Phase 5 invariants 1--15 remain enforced. Phase 6 extends but never weakens either set. Where a Phase 6 invariant overlaps with a Phase 5 invariant, the Phase 6 invariant is the stricter or more specific statement.

---

### P6-1. Production attempt shape is primary contract

`conceptIds` (array) + `result.correct` (nested) is the canonical production attempt shape. `deriveGrammarConceptStarEvidence` accepts both the production shape (`{ conceptIds: [...], result: { correct } }`) and the legacy flat shape (`{ conceptId, correct }`). Test fixtures must exercise the production shape to ensure the normaliser at `shared/grammar/grammar-stars.js` does not silently regress.

**Why:** The production Worker engine emits attempts with `conceptIds` (array, plural) and `result.correct` (nested object). A test suite that only exercises the legacy flat shape (`{ conceptId, correct }`) would pass while the production path silently broke. This invariant ensures the canonical shape is exercised in every evidence-tier derivation test.

**Enforced by:** U7 `tests/grammar-phase5-invariants.test.js` (pin: `deriveGrammarConceptStarEvidence` accepts `conceptIds` array), U2 `tests/grammar-stars.test.js` (production-shape fixtures).

---

### P6-2. variedPractice requires correct evidence

Wrong-answer-only template exposure does not unlock the `variedPractice` evidence tier. A learner who encounters 10 distinct templates but answers all of them incorrectly has demonstrated template diversity but not conceptual transfer. Only correct answers with distinct `templateId` values contribute to the `variedPractice` tier.

**Why:** The `variedPractice` tier (10% of the per-concept Star budget) is meant to prove the learner can transfer understanding across varied question forms. Wrong answers on varied templates prove exposure but not transfer. Counting wrong answers would inflate Stars for struggling learners who have not yet demonstrated conceptual grasp.

**Enforced by:** U7 `tests/grammar-phase5-invariants.test.js` (pin: variedPractice false for wrong-only distinct templates), U2 `tests/grammar-stars.test.js` (wrong-answer-only variedPractice tests).

---

### P6-3. retainedAfterSecure requires post-secure temporal proof

The `retainedAfterSecure` evidence tier (60% of the per-concept Star budget) requires at least one independent correct answer whose `createdAt` timestamp is strictly after the estimated first-secure date. A learning burst before secure status does not satisfy the tier. The `nowTs` parameter on `deriveGrammarConceptStarEvidence` enables deterministic testing of the temporal proof logic.

**Why:** Retention evidence proves the learner can recall under spaced review, not just in the session where they first secured. Without the temporal constraint, a learner who crammed 20 correct answers in one session and happened to cross the secure threshold would immediately unlock 60% of the budget -- defeating the purpose of the retention tier.

**Enforced by:** U7 `tests/grammar-phase5-invariants.test.js` (pin: `deriveGrammarConceptStarEvidence` accepts `nowTs` parameter), U2 `tests/grammar-stars.test.js` (temporal proof tests with injected timestamps).

---

### P6-4. Sub-secure Stars persist via starHighWater at evidence time

Stars earned before a concept reaches secure status survive session boundaries and `recentAttempts` truncation. The `starHighWater` latch is updated at evidence time (when `grammar.star-evidence-updated` fires), not only at concept-secured time. A learner with 3 Stars from first-independent-wins who logs out and returns the next day must see at least 3 Stars, even if `recentAttempts` has rolled and the derivation path would now compute 0.

**Why:** Phase 5 invariant 6 (Stars are monotonically non-decreasing) requires a persistence mechanism for sub-secure evidence. Without `starHighWater` updates at evidence time, a session boundary would cause the `recentAttempts` window to roll, the derivation would compute 0, and the child would see their Stars vanish. The `GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED` event and `updateGrammarStarHighWater` function together form the sub-secure persistence pipeline.

**Enforced by:** U7 `tests/grammar-phase5-invariants.test.js` (pin: `GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED` exists, `updateGrammarStarHighWater` is exported), U7 `tests/grammar-concordium-invariant.test.js` (ratchet: sub-secure Stars + truncation shape).

---

### P6-5. 1-Star Egg is a persisted reward state

`caught: true` fires from sub-secure evidence via the `star-evidence-updated` pathway, not only from concept-secured events. A learner who earns 1 Star from a first independent correct answer on any concept assigned to a monster sees the Egg appear. The Egg fires exactly once per monster -- subsequent Star-evidence-updated events for the same monster do not re-fire the `caught` event.

**Why:** Phase 5 invariant 4 (1 Star catches the Egg) defines the display contract, but the persistence contract also matters: the `caught: true` flag must be written to the reward state at evidence time so the Egg survives a page refresh. If `caught` only persisted at concept-secured time, a sub-secure learner would see the Egg vanish on reload.

**Enforced by:** U7 `tests/grammar-concordium-invariant.test.js` (ratchet: sub-secure caught persistence), U6 `tests/grammar-star-events.test.js` (sub-secure caught event fires exactly once).

---

### P6-6. Grand Concordium timeline >= 5 months preserved

The reward curve does not weaken Grand Concordium's timeline. Under the simulation model, Grand Concordium (Concordium at Mega, 100 Stars) is unreachable within 150 simulated days for any learner profile. This timeline reflects the genuine difficulty of demonstrating retention evidence across all 18 aggregate concepts with spaced review. Weakening the timeline without a dedicated product decision would undermine the Mega achievement's credibility.

**Why:** Grand Concordium is the capstone achievement for Grammar mastery. It requires every one of the 18 aggregate concepts to demonstrate all five evidence tiers including `retainedAfterSecure` (60% of the per-concept budget). The 5-month minimum timeline is a natural consequence of the spaced-review requirement, not an artificial gate. If a code change made Grand Concordium reachable in 30 days, it would signal either (a) a bug in the evidence model or (b) a deliberate product weakening that must be reviewed.

**Enforced by:** U7 `tests/grammar-concordium-invariant.test.js` (simulation: Grand Concordium unreachable within 150 days), U3 simulation report.

---

## Phase 4 + Phase 5 invariant preservation

All twelve Phase 4 invariants and all fifteen Phase 5 invariants remain enforced without weakening. Phase 6 specifically preserves:

- **P4 invariant 7** (denominator freeze: `GRAMMAR_AGGREGATE_CONCEPTS.length === 18`)
- **P4 invariant 11** (Concordium is never revoked post-secure) -- extended by P6-4 to cover sub-secure persistence
- **P5 invariant 6** (Stars are monotonically non-decreasing) -- strengthened by P6-4's `starHighWater` evidence-time update
- **P5 invariant 14** (no contentReleaseId bump) -- Phase 6 ships zero release-id bumps

---

## How reviewers cite this document

A Phase 6 review comment that flags a breach should cite the invariant number (e.g., "breach of P6-4 -- sub-secure Stars persist via starHighWater at evidence time") so that the discussion thread maps back to the same contract the worker read when writing the unit.

If a future requirements change necessitates relaxing an invariant, the relaxation must ship in a dedicated PR that (a) updates this document, (b) updates the enforcing test, and (c) ships the compensating migration -- never as a silent side effect of an implementation unit.
