---
title: "Grammar Phase 5 — Invariants (scope-lock)"
type: invariants
status: locked
date: 2026-04-27
plan: docs/plans/2026-04-27-001-feat-grammar-phase5-star-curve-landing-plan.md
unit: U1
---

# Grammar Phase 5 — Invariants (scope-lock)

This document is the single source of non-negotiables for Grammar Phase 5. Every Phase 5 PR reviewer cites these invariants by number when flagging a breach; every Phase 5 implementation unit (U1--U11) is obligated to preserve them. The list is locked at U1 before any code unit ships so that reviewers and workers reference the same contract when arguing about scope.

The fifteen invariants below are drawn from the Phase 5 plan's Requirements Trace (R1--R15) at `docs/plans/2026-04-27-001-feat-grammar-phase5-star-curve-landing-plan.md`. They follow the phrasing pattern established by the Phase 4 invariants document (`docs/plans/james/grammar/grammar-phase4-invariants.md`) so that the style is familiar across phases.

**Phase 4 invariants 1--12 remain enforced.** Phase 5 extends but never weakens them. Where a Phase 5 invariant overlaps with a Phase 4 invariant, the Phase 5 invariant is the stricter or more specific statement.

---

### 1. 100-Star scale for all active Grammar monsters

Every active Grammar monster (Bracehart, Chronalyx, Couronnail, Concordium) displays progress on a 0--100 Star scale. `GRAMMAR_MONSTER_STAR_MAX === 100` is universal and pinned. No monster uses a different maximum. No monster shows raw concept counts, ratios, or percentages to children.

**Why:** R1 (universal 100-Star scale). Children understand "42 / 100 Stars" across every monster without needing to know concept counts. A per-monster variable maximum would re-introduce the small-denominator confusion Phase 5 exists to eliminate.

**Enforced by:** U1 `tests/grammar-phase5-invariants.test.js` (constant pin), U2 `tests/grammar-stars.test.js` (derivation function always returns `starMax: 100`).

---

### 2. Stars are learning-evidence milestones, not per-question XP

Stars accrue from five evidence tiers (firstIndependentWin, repeatIndependentWin, variedPractice, secureConfidence, retainedAfterSecure). Answering more questions at the same difficulty does not accelerate Stars. A concept that has already unlocked a tier does not earn additional Stars from repeated demonstrations of that same tier.

**Why:** R2 (evidence-based, not volume-based). Per-question XP would reward grinding over genuine learning. Evidence tiers are latched: once unlocked, permanently counted -- repeated proof of the same tier is a no-op.

**Enforced by:** U2 `tests/grammar-stars.test.js` (tier-latch idempotency tests), U11 `tests/grammar-star-e2e.test.js` (end-to-end tier progression).

---

### 3. Non-linear stage thresholds

Stage thresholds are fixed at: 0 = Not found, 1 = Egg found, 15 = Hatched, 35 = Growing, 65 = Nearly Mega, 100 = Mega. The `grammarStarStageFor` function maps Stars to stages via these exact boundaries.

**Why:** R3 (non-linear stages). The thresholds are chosen so that Egg is immediate encouragement (1 Star), Mega is genuine mastery (100 Stars), and the intermediate stages are spaced to give a sense of progress at each phase of learning.

**Enforced by:** U2 `tests/grammar-stars.test.js` (boundary tests for every threshold), U4 `tests/grammar-star-staging.test.js` (staging integration).

---

### 4. 1 Star catches the Egg

The first valid learning evidence on any Grammar monster triggers Egg found (`caught = true`). No concept-secured requirement for Egg. A single independent correct answer on any concept assigned to a monster is sufficient.

**Why:** R4 (immediate encouragement). Children must see their monster hatch quickly to sustain engagement. Requiring concept-secured status for Egg would delay the first reward by days or weeks.

**Enforced by:** U2 `tests/grammar-stars.test.js` (1-Star Egg test), U6 `tests/grammar-star-events.test.js` (caught event fires at 1 Star).

---

### 5. Mega requires retention evidence

100 Stars is only reachable when every assigned concept has earned the `retainedAfterSecure` tier (60% of each concept's Star budget). Secure confidence alone caps at exactly 40% (5% + 10% + 10% + 15%) of the budget. A monster cannot reach Mega without every concept demonstrating retention beyond initial secure status.

**Why:** R5 (Mega is mastery, not just secure). The current system conflates secure with Mega for small-denominator monsters. Phase 5 separates them: secure is necessary but not sufficient. Retention evidence proves the learner can recall under spaced review, not just in the session where they first secured.

**Enforced by:** U2 `tests/grammar-stars.test.js` (secure-only caps below 100), U3 simulation report, U11 `tests/grammar-star-e2e.test.js` (full Mega journey requires retention).

---

### 6. Stars are monotonically non-decreasing

Once a Star is earned it is never lost. Evidence tiers are latched per concept -- once unlocked, permanently counted. The `starHighWater` latch on the reward state persists the monotonicity floor. `displayStars = max(derivedStars, starHighWater)` on every read.

**Why:** R6 (no regression). A child who sees "42 Stars" today must never see "38 Stars" tomorrow. The `starHighWater` latch protects against transient derivation regressions (e.g. `recentAttempts` window rollover). This is the Star analogue of the "Mega is never revoked" cross-subject precedent.

**Enforced by:** U4 `tests/grammar-star-staging.test.js` (latch holds when derived < persisted), U9 `tests/grammar-concordium-invariant.test.js` (Star ratchet in 200 random sequences).

---

### 7. No stage downgrade

No existing learner ever sees a lower stage than they previously achieved. Read-time normalisation computes `max(legacyStage, newStarDerivedStage)`. A pre-Phase-5 learner with Couronnail at Mega (3/3 secure, no retention evidence) retains Mega even though the new curve would derive fewer than 100 Stars from secure-only evidence.

**Why:** R7 (user trust). Stage regression destroys the emotional payoff of mastery and signals to learners that the app's own progress claims are unreliable. The legacy migration normaliser handles this transparently at read time.

**Enforced by:** U4 `tests/grammar-star-staging.test.js` (legacy migration scenarios), U9 `tests/grammar-concordium-invariant.test.js` (named legacy shapes).

---

### 8. Writing Try, AI explanation, and view-only actions yield 0 Stars

Only independent first-attempt correct, repeat independent correct, varied practice correct, concept-secured events, and retention-check correct answers produce Stars. Writing Try saves, AI-generated explanations, and view-only actions (browsing Grammar Bank, reading worked examples without attempting) must never increment Stars.

**Why:** R8 (evidence integrity). Stars measure learning evidence, not engagement. A child who browses the Grammar Bank or reads an AI explanation has not demonstrated retrieval. This preserves Phase 4 invariants 4 (AI is post-marking enrichment only) and 5 (Writing Try is non-scored).

**Enforced by:** U2 `tests/grammar-stars.test.js` (0-evidence yields 0 Stars), U11 `tests/grammar-star-e2e.test.js` (Writing Try and AI paths produce 0 Stars).

---

### 9. Supported answers cannot unlock independent-win or retention tiers

Supported (worked/faded) answers may contribute to overall mastery confidence but do not earn full Star credit in the `firstIndependentWin`, `repeatIndependentWin`, or `retainedAfterSecure` tiers. Only answers with `supportLevel === 0` (fully independent) qualify for these tiers.

**Why:** R9 (support honesty). A worked example that walks the learner through the answer is not evidence of independent recall. Counting supported answers as independent wins would inflate Stars and devalue the Mega achievement. This preserves Phase 4 invariant 3 (wrong-answer flow is nudge, retry, optional support).

**Enforced by:** U2 `tests/grammar-stars.test.js` (supported answers excluded from independent tiers), U11 `tests/grammar-star-e2e.test.js` (worked/faded support path).

---

### 10. Landing page: one primary CTA

Smart Practice becomes the sole primary button on the Grammar landing page. Grammar Bank, Mini Test, and Fix Trouble Spots become secondary links. Writing Try moves to the collapsed "More practice" disclosure. A child can start practising in one tap; the first screen does not require choosing among 8 modes.

**Why:** R10 (simplification). The current dashboard exposes 8+ modes before the child starts. Children ages 7--11 benefit from a single obvious action, matching the Spelling pattern. All modes remain accessible -- nothing is removed, only reorganised.

**Enforced by:** U8 `tests/grammar-ui-model.test.js` (single `data-featured="true"` element), U8 `tests/grammar-phase3-child-copy.test.js` (forbidden terms absent from simplified layout).

---

### 11. Compact monster strip on dashboard

All four active monsters shown on the Grammar landing page with `name -- stage label -- X/100 Stars` format. Reserved monsters (Glossbloom, Loomrill, Mirrane) never appear in the strip. No raw concept counts, no confidence taxonomy labels, no denominator visible to children.

**Why:** R11 (child-facing progress). The monster strip replaces the old `concordiumProgress: {mastered}/{total}` display with a universal Star scale. Children see consistent progress across monsters without needing to understand that Concordium has 18 concepts while Couronnail has 3.

**Enforced by:** U7 `tests/grammar-ui-model.test.js` (4 active monsters in strip, no reserved), U7 forbidden-terms check.

---

### 12. Adult/child display separation preserved

Adult confidence labels (emerging/building/consolidating/secure/needs-repair) remain live-state. Child Stars are latched. "Needs repair" in adult view coexists with non-decreasing Stars in child view. The two systems intentionally diverge after confidence regression.

**Why:** R12 (display separation). Adults need honest live-state labels to know where to focus review. Children need motivational non-decreasing progress to sustain effort. A concept that regresses from secure to needs-repair in the adult view does not cause Star loss in the child view.

**Enforced by:** U10 `tests/grammar-ui-model.test.js` (adult labels live-state, child Stars latched), U11 end-to-end divergence scenario.

---

### 13. Concordium follows 1-Star Egg like direct monsters

Concordium Egg is triggered by 1 Star, the same rule as all direct monsters. No broad-coverage gate (6+ secure concepts across 2+ clusters) is required for Concordium Egg in Phase 5. The 18-concept denominator naturally slows Concordium progression; consistency across all monsters reduces cognitive load.

**Why:** R13 (origin revision). The origin document initially proposed a broad-coverage gate for Concordium Egg. James revised this in the same conversation: "Concordium 也可以 1 Star = Egg found." The simpler rule was adopted because (a) Concordium's 18-concept denominator naturally slows it, (b) consistency across all monsters reduces cognitive load, and (c) a broad-coverage gate adds complexity without proportional value. If U3 simulation reveals Concordium Egg arrives too quickly, the gate can be reintroduced in a future phase.

**Enforced by:** U6 `tests/grammar-star-events.test.js` (Concordium caught at 1 Star), U9 `tests/grammar-concordium-invariant.test.js` (Concordium ratchet).

---

### 14. No contentReleaseId bump

Phase 5 ships zero `contentReleaseId` bumps. The release id is reserved for genuine content or marking-behaviour changes. Star display, stage thresholds, landing page layout, and monster strip are all `contentReleaseId`-neutral. This preserves Phase 4 invariant 9.

**Why:** R14 (no cache invalidation). Every `contentReleaseId` bump invalidates learner caches and forces a replay of every committed answer. Phase 5 changes reward display, not marking behaviour. No bump is justified.

**Enforced by:** U11 grep-based assertion (no Phase 5 PR touches `contentReleaseId`).

---

### 15. Phase 4 invariants 1--12 preserved

All twelve Phase 4 invariants (`docs/plans/james/grammar/grammar-phase4-invariants.md`) remain enforced. Phase 5 extends but never weakens them. Specifically:

- Phase 4 invariant 7 (denominator freeze: `GRAMMAR_AGGREGATE_CONCEPTS.length === 18`) is preserved. Phase 5 changes the display curve, not the concept set.
- Phase 4 invariant 11 (Concordium is never revoked post-secure) is extended: Stars ratchet alongside stage.
- Phase 4 invariant 12 (forbidden-keys universal floor unchanged) is preserved: no Phase 5 PR widens the floor.

**Why:** R15 (no regression). Phase 5 builds on Phase 4's proven foundation. Any Phase 4 invariant breach in a Phase 5 PR is an automatic blocker.

**Enforced by:** U1 `tests/grammar-phase5-invariants.test.js` (denominator freeze pin), all existing Phase 4 test suites (must continue passing unchanged).

---

## How reviewers cite this document

A Phase 5 review comment that flags a breach should cite the invariant number (e.g., "breach of P5 invariant 6 -- Stars are monotonically non-decreasing") so that the discussion thread maps back to the same contract the worker read when writing the unit. Workers executing U1--U11 are expected to re-read the relevant invariant before opening the PR and to name in their PR body which invariants the unit preserves.

If a future requirements change necessitates relaxing an invariant, the relaxation must ship in a dedicated PR that (a) updates this document, (b) updates the enforcing test, and (c) ships the compensating migration -- never as a silent side effect of an implementation unit.
