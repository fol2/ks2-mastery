---
title: "Punctuation P7 — stabilisation contract pattern and autonomous SDLC cycle"
date: 2026-04-28
category: architecture-patterns
module: punctuation
problem_type: architecture_pattern
component: development_workflow
severity: high
applies_when:
  - shipping a stabilisation phase after a feature build-out (no new features, only trust/debug/hardening)
  - scaling autonomous agent SDLC beyond single-PR work to 12-unit phased delivery
  - extending the 100-Star reward model to new subjects or hardening existing ones
  - adding diagnostic/doctor surfaces to subjects with complex derived state
tags:
  - stabilisation-contract
  - autonomous-sdlc
  - star-evidence-latch
  - punctuation-doctor
  - fault-injection-stall
  - constants-drift-manifest
  - review-convergent-findings
  - projection-performance
---

# Punctuation P7 — stabilisation contract pattern and autonomous SDLC cycle

## Context

Phase 5 built the 100-Star evidence model. Phase 6 hardened Star truth, monotonic display, and Worker parity. After 19 PRs of reward-system work, the codebase was feature-complete but carried eight maintenance and trust debts: stale codex latch, unbounded projection, lifetime telemetry caps, render-time side effects, 4-module constants drift, no diagnostic surface, unproven pending/degraded navigation, and stale docs.

Phase 7 was scoped as a **stabilisation contract** — a product-engineering document (`docs/plans/james/punctuation/punctuation-p7.md`) with 10 product outcomes, 5 engineering contracts, and an explicit "no regression" constraint. It was executed as 12 implementation units across 3 phases using the autonomous SDLC cycle: independent worker subagent → independent reviewer subagents → review follower → re-review → merge.

The result: 12 PRs, +5,080/−487 lines, zero regressions, zero engine changes. Review caught 2 HIGH + 3 MEDIUM bugs before merge. The SDLC cycle's value was proven — the 2 HIGH bugs in U8 (dead admin gate, empty codex load) would have been dead-on-arrival in production.

## Guidance

### 1. The stabilisation contract as a gating document

A stabilisation contract differs from a feature plan:

- **Scope is defined by outcomes, not features.** Each outcome is a testable statement ("Stars never de-evolve in child UI"), not a feature spec.
- **Non-goals are explicit.** P7 banned new skills, modes, monsters, content releases, and marking changes. This prevented scope creep.
- **Engineering contracts separate from product outcomes.** Redaction, idempotency, cache correctness, fault-injection safety, and refactor safety were separate sections (§6.1-6.5) with their own verification criteria.
- **Verification expectations prescribe proof levels** (pure projection tests, Worker/read-model tests, browser/journey tests, doc static checks), not implementation.

The pattern: write the contract as a product-engineering document with measurable completion criteria (§11). Then write an implementation plan that maps units to those criteria. The plan references the contract; the contract does not reference the plan.

### 2. Canonical manifest eliminates constants drift

**Before P7:** `SKILL_TO_CLUSTER`, `RU_TO_CLUSTERS`, `PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER`, and `ACTIVE_PUNCTUATION_MONSTER_IDS` were defined independently in `star-projection.js`, `read-model.js`, `service-contract.js`, and `punctuation-view-model.js` with "must stay in lock-step" comments.

**After P7:** `punctuation-manifest.js` is a leaf module (imports only from `platform/game/monsters.js`). All 4 modules import from it. A 17-assertion drift test pins exact counts and cross-checks `PUNCTUATION_GRAND_MONSTER_ID` against `mastery/shared.js`.

**The pattern:** When client-safe metadata is mirrored across modules due to circular dependency constraints, extract a leaf manifest with zero imports from any sibling in the same domain module graph. Derive all secondary lookups (reverse maps, Sets, counts) in the manifest, not at each consumer.

### 3. Star-evidence latch completes cross-subject symmetry

P7-U4 added `punctuation.star-evidence-updated` following the exact Grammar P6 pattern:

```
command handler → deriveStarEvidenceEvents() → domain event stream
  → event-hooks subscriber → updatePunctuationStarHighWater()
  → ratchet starHighWater = max(existing, computedStars)
  → ratchet maxStageEver = max(existing, stageFor(computedStars, thresholds))
```

Both Grammar and Punctuation now share this architecture. Key invariants:

- Events emitted in the **command handler** (before read-model assembly), not in the read-model builder (which stays pure).
- Monster-targeted writes — each monster gets its own event with monster-specific `computedStars`. No broadcast.
- Grand monster (Quoral/Concordium) uses `GRAND_STAR_THRESHOLDS`, direct monsters use `STAR_THRESHOLDS`. Grammar P6 had a HIGH bug from mixing these; P7 adversarial review confirmed the separation is correct.
- No toast — latch writes are silent. Toast timing stays on reward-unit mastery events.
- Idempotent under retry (`max()` is idempotent). Safe under two-tab race (pre-existing D1 last-writer-wins limitation, not introduced by the latch).

### 4. Projection performance: measure first, cache conditionally

P7-U5 established the pattern: **benchmark realistic long-history data before adding caching.**

| Attempts | Median | Bound |
|----------|--------|-------|
| 500 | ~2ms | < 5ms |
| 3,000 | ~4.5ms | < 15ms |
| 5,000 | ~8.5ms | < 25ms |

At sub-10ms for 5,000 attempts, caching is unnecessary overhead with invalidation risk. The contract required "measured and bounded", not "cached". Future subjects should apply the same discipline: measure before optimising.

### 5. Fault-injection stall enables honest pending proof

The existing `timeout` fault kind returns a 408 immediately — it does not hang. P7-U9 added `stall-punctuation-command` with a new `stall` action type in the middleware that holds the HTTP socket without responding for a configurable duration.

This enabled P7-U11's 4 Playwright scenes proving children cannot get trapped on Summary/Map/modal. The `summary-back-while-pending` journey (blocked since P4 U8) is now active.

The pattern for any future pending-state proof: arm the stall fault via `page.route()` with the `x-ks2-fault-opt-in` header, trigger a mutation command that stalls, then assert escape buttons remain enabled while mutation buttons are disabled.

### 6. Autonomous SDLC cycle scales to 12-unit phased delivery

The cycle: `worker → reviewer(s) → follower → merge → next`. Phase 7 proved this at scale:

| Metric | Value |
|--------|-------|
| Total units | 12 |
| Parallel batches | 3 (Phase 1: U1+U2+U3, Phase 2: U4+U5+U6+U7, Phase 3: U9+U10+U11) |
| Serial dependencies | U8 after U4, U11 after U9, U12 after all |
| Worker worktrees | 12 isolated git worktrees |
| Review dispatches | ~24 |
| Follower dispatches | 10 |
| Clean-pass merges (no follower) | 2 (U4, U5) |

**Critical SDLC observation — convergent findings are the highest-value signal.** When two independent reviewers find the same issue, it is almost certainly a real bug. P7 had 4 convergent findings (U1 drift pinning, U2 latch simulation, both from correctness + testing/maintainability reviewers independently) — all were genuine.

**The highest-value review moment** was U8's correctness review catching `session.isAdmin` (property doesn't exist; correct check is `session.platformRole === 'admin'`). The test suite passed green because all 10 diagnostic tests bypassed the command handler. This is the "looks green but proves the wrong thing" class — the exact pattern the P7 contract warned about in §4.4.

## Why This Matters

Without the stabilisation contract pattern, teams ship features on top of maintenance debt until a regression forces a halt. P7 proves that a dedicated hardening phase — scoped by outcomes, executed autonomously, and gated by adversarial review — can close 8 trust debts in one sprint without touching any content, marking, or feature surface.

Without the SDLC review cycle, the 2 HIGH bugs in U8 would have shipped. The admin gate bug would have made the Doctor diagnostic unreachable in production. The codex loading bug would have made every Star diagnostic show zero. Both passed 10 unit tests green.

## When to Apply

- After any 2+ phase feature build-out, before expanding to the next feature.
- When the codebase has 3+ "must stay in lock-step" comment clusters — extract a manifest.
- When adding the 100-Star model to a new subject — follow the latch pattern, not copy-paste.
- When a pending/degraded state contract exists but is "tested" only by asserting on a clean render — add a fault-injection stall.
- When projection or derivation performance is assumed to be fine — benchmark it.

## Examples

### Manifest leaf extraction (before/after)

**Before (star-projection.js, read-model.js, service-contract.js, view-model.js):**
```js
// star-projection.js — inlined to avoid circular dep
const SKILL_TO_CLUSTER = new Map([
  ['sentence_endings', 'endmarks'],
  // ... 14 entries, must match read-model.js
]);

// read-model.js
export const PUNCTUATION_CLIENT_SKILLS = Object.freeze([
  { id: 'sentence_endings', name: '...', clusterId: 'endmarks' },
  // ... 14 entries, must match star-projection.js
]);
```

**After (punctuation-manifest.js):**
```js
// Leaf module — zero imports from other punctuation modules
import { MONSTERS_BY_SUBJECT } from '../../platform/game/monsters.js';

export const PUNCTUATION_CLIENT_SKILLS = Object.freeze([...]);
export const SKILL_TO_CLUSTER = Object.freeze(
  new Map(PUNCTUATION_CLIENT_SKILLS.map(s => [s.id, s.clusterId]))
);
// All consumers import from here. Drift test pins exact values.
```

### Convergent review catching real bugs

```
U2 correctness reviewer (confidence 65):
  "Three simple migration tests simulate only dispatch, omit updateSubjectUi latch"

U2 testing reviewer (confidence 72):
  "Three migration tests simulate the dispatch but skip the updateSubjectUi latch step"

→ Same finding, independent reviewers → 100% true positive → Fixed by follower
```

## Related

- `docs/solutions/architecture-patterns/punctuation-p6-star-truth-monotonic-hardening-2026-04-27.md` — P6 patterns (starHighWater latch, monotonic merge, grand-threshold dispatch)
- `docs/solutions/architecture-patterns/grammar-p5-100-star-evidence-curve-and-autonomous-sdlc-2026-04-27.md` — Grammar 100-Star pattern origin
- `docs/solutions/architecture-patterns/grammar-p6-star-derivation-trust-and-server-owned-persistence-2026-04-27.md` — Grammar latch writer pattern (template for P7-U4)
- `docs/plans/james/punctuation/punctuation-p7.md` — P7 product-engineering contract
- `docs/plans/james/punctuation/punctuation-p7-completion-report.md` — Full completion report with per-unit PR table
- `docs/plans/2026-04-27-003-feat-punctuation-phase7-qol-debuggability-hardening-plan.md` — Implementation plan
