---
title: "Grammar Phase 6 — Star Derivation Pipeline Trust & Server-Owned Persistence"
date: 2026-04-27
category: architecture-patterns
module: grammar-reward-display
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - "A derivation function consumes Worker attempt data with multiple known shapes"
  - "A tier measures breadth, diversity, or variety across attempts"
  - "A tier has temporal semantics (retained-after, post-X)"
  - "A subsystem declared X-unaware by a prior phase needs X-related side effects"
  - "A dashboard consumes nested state with fixture-shortcut risk"
  - "A reward pipeline ships after tests pass but before production data exercises it"
tags:
  - star-derivation
  - production-shape-normalisation
  - server-owned-persistence
  - temporal-proof
  - monster-targeted-latch
  - adversarial-review
  - trust-phase
  - autonomous-sdlc
---

# Grammar Phase 6 — Star Derivation Pipeline Trust & Server-Owned Persistence

## Context

Phase 5 delivered the 100-Star evidence-based display curve for Grammar monsters (see predecessor: `docs/solutions/architecture-patterns/grammar-p5-100-star-evidence-curve-and-autonomous-sdlc-2026-04-27.md`). All Phase 5 tests passed. However, six trust defects survived the full test suite because **the tests validated derivation logic against idealised fixture shapes, not production Worker data shapes.** The consequences were invisible in CI but total in production: Stars never unlocked, progress vanished between sessions, Egg gated incorrectly, diversity counted wrong answers, retention had no temporal proof, and the dashboard read from an undefined path.

Phase 6 is the trust phase — it converts test-level confidence into production-level trust. The contract question (origin `grammar-p6.md` §1):

> When a child sees "Bracehart — 17 / 100 Stars", can we prove those Stars came from real learning evidence, will never disappear, are not inflated by support, AI, Writing Try, wrong answers, or client-only read-model artefacts, and are consistent with what the adult view says?

Sprint: 9 units, 8 PRs (#379, #385, #387, #388, #391, #394, #396, #402), 4,105 lines, 3 HIGH bugs caught by adversarial reviewers, 6 new invariants (P6-1 through P6-6). Full report: `docs/plans/james/grammar/grammar-phase6-implementation-report.md`.

**Architecture revision from Phase 5:** Phase 5 explicitly rejected adding Star-evidence events (documented in the P5 compound learning, lines 30, 50, 106: "Adding new event types would couple the reward layer to internal engine transitions"). Phase 6 introduces `grammar.star-evidence-updated` but places event emission in the **command handler** (not the engine), preserving the P5 architecture boundary. The engine remains Star-unaware; the command handler bridges the gap. This revision is the narrowest fix that achieves server-owned Star persistence without violating the engine isolation contract.

## Guidance

### 1. Normalise production data shapes at the derivation boundary

Production Worker attempts use `conceptIds` (plural array) and `result.correct` (nested), but derivation code filtered on `conceptId` (singular) and `correct` (flat). The fix is a normaliser pair declared once at the derivation entry point:

```javascript
// grammar-stars.js — normaliser at derivation boundary
function matchesConcept(a) {
  if (!isPlainObject(a)) return false;
  if (Array.isArray(a.conceptIds)) return a.conceptIds.includes(conceptId);
  return a.conceptId === conceptId;
}

function readCorrect(a) {
  if (isPlainObject(a.result)) return a.result.correct;
  return a.correct;
}

// All downstream code uses matchesConcept(a) and readCorrect(a)
const conceptAttempts = attempts.filter(matchesConcept);
const independentCorrects = conceptAttempts.filter(
  (a) => readCorrect(a) === true && a.firstAttemptIndependent === true,
);
```

**Rule:** Every derivation function that consumes attempt data must declare its shape contract via normaliser functions at the top. Raw property access on attempt objects below the normaliser is a defect. Test fixtures must exercise the production shape as the primary path, with legacy shape as secondary.

### 2. Filter correctness before counting diversity

The `variedPractice` tier counted all attempts for template diversity, including wrong answers:

```javascript
// BEFORE — wrong answers inflate diversity
const templates = new Set();
for (const a of conceptAttempts) {
  if (typeof a.templateId === 'string' && a.templateId) templates.add(a.templateId);
}

// AFTER — only correct attempts prove diversity
const templates = new Set();
for (const a of conceptAttempts) {
  if (readCorrect(a) === true && typeof a.templateId === 'string' && a.templateId) {
    templates.add(a.templateId);
  }
}
```

**Rule:** Any tier that measures "variety" or "breadth" must filter to correct attempts first. Wrong answers demonstrate exposure, not mastery.

### 3. Temporal gates require timestamp proof, not just count gates

The `retainedAfterSecure` tier checked `secureConfidence && independentCorrects.length >= 2` — but those two corrects could predate the secure event, retroactively satisfying retention. The fix adds a temporal gate:

```javascript
// BEFORE — two pre-secure corrects retroactively satisfy retention
if (result.secureConfidence && independentCorrects.length >= 2) {
  result.retainedAfterSecure = true;
}

// AFTER — temporal proof: at least one correct must postdate the secure estimate
if (result.secureConfidence) {
  const securedAtTs = nowTs - (node.intervalDays * 86_400_000);
  const hasPostSecureCorrect = independentCorrects.some(
    (a) => typeof a.createdAt === 'number' && Number.isFinite(a.createdAt) && a.createdAt > securedAtTs
  );
  if (hasPostSecureCorrect) {
    result.retainedAfterSecure = true;
  }
}
```

The estimate is intentionally **permissive** (not conservative) — `intervalDays` can decrease on regression (`× 0.45` on wrong answers), pushing the estimate closer to now. The exposure is bounded: once `intervalDays` drops below 7, `secureConfidence` becomes false and blocks the tier entirely.

**Rule:** Any tier named "retained" or "after-X" must enforce a temporal boundary. A count gate alone cannot prove temporal ordering.

### 4. Emit derived-state events from the command handler, not the engine

Phase 5 established that the Grammar engine is Star-unaware. Phase 6 needed sub-secure Star persistence (Stars vanished on session end). The bridge point is the **command handler** (`worker/src/subjects/grammar/commands.js`):

```javascript
// Command handler — Star bridge preserving P5 architecture boundary
// After engine processes answer, derive Stars from post-answer state
const starResult = computeGrammarMonsterStars(monsterId, evidenceMap);
if (starResult.stars > previousStarHighWater) {
  domainEvents.push({
    type: 'grammar.star-evidence-updated',
    learnerId,
    conceptId,
    monsterId,          // monster-targeted — NOT broadcast
    computedStars: starResult.stars,
  });
}
```

The subscriber calls `updateGrammarStarHighWater` with the explicit `monsterId`. The initial implementation wrote `computedStars` to both direct monster and Concordium — an **inflation bug caught by adversarial review** (Concordium starHighWater inflated by direct monster's higher per-concept budget). The monster-targeted latch:

```javascript
// updateGrammarStarHighWater — monster-targeted, not broadcast
export function updateGrammarStarHighWater({ monsterId, computedStars, ... }) {
  const entry = state[monsterId] || { mastered: [], caught: false };
  entry.starHighWater = Math.max(entry.starHighWater || 0, computedStars);
  if (computedStars >= 1 && !entry.caught) {
    entry.caught = true;  // Fixes Egg display-only defect — persisted from sub-secure evidence
  }
  // Does NOT touch mastered[] — exclusive to concept-secured events
}
```

**Rule:** When an architecture boundary declares a subsystem "X-unaware," new X-related side effects must emit from the boundary layer (command handler), not from within the unaware subsystem. Events must carry a target identifier to prevent broadcast inflation.

### 5. Verify dashboard data paths against actual state shape

The dashboard read `grammar?.recentAttempts` but the normalised state places it at `grammar?.analytics?.recentAttempts`:

```javascript
// BEFORE — undefined in production (pre-existing Phase 5 U7 bug)
const recentAttempts = Array.isArray(grammar?.recentAttempts) ? grammar.recentAttempts : [];

// AFTER — correct path matching normaliseGrammarReadModel output
const recentAttempts = Array.isArray(grammar?.analytics?.recentAttempts)
  ? grammar.analytics.recentAttempts : [];
```

**Rule:** Dashboard view-model builders must be tested with state shapes extracted from a real (or production-faithful) snapshot, not hand-constructed fixtures that flatten nesting. The test-fixture shortcutting defect class (§5.1 of origin) applies recursively: if your fixtures don't match production shape, your tests prove nothing about production.

## Why This Matters

Six defects survived a full Phase 5 test suite with 330+ assertions because **tests validated derivation logic against idealised fixture shapes, not production Worker data shapes.** The compound effect: the entire Star progression system was cosmetic — it computed correctly in tests but produced zero observable progress in production.

The pattern is generalisable: any reward, progression, or analytics pipeline that derives values from Worker attempt data will hit this defect class if:
1. The derivation function assumes a shape that differs from production
2. Diversity/breadth tiers count wrong-answer exposure
3. Temporal tiers use count gates instead of timestamp proof
4. Sub-session-lifetime derived values aren't persisted before the source data expires
5. Dashboard paths use fixture-shortcut nesting instead of production nesting

Phase 6 proves these are not theoretical risks — every one was confirmed in the Grammar codebase and fixed. The adversarial review process caught 3 additional bugs (Concordium inflation, stale worktree bases, dashboard undefined path) that unit tests structurally cannot detect.

## When to Apply

- **After any phase that introduces a new derivation pipeline.** Schedule a trust phase that runs real Worker data shapes through the pipeline before declaring production-ready.
- **Any derivation function consuming Worker attempt data.** Normalise at the boundary. Exercise production shape as the primary test path.
- **Any tier measuring breadth, diversity, or variety.** Filter to correct attempts first.
- **Any tier with temporal semantics.** Enforce a timestamp boundary, not a count threshold.
- **Any new side effect for a subsystem declared "X-unaware."** Emit from the command handler boundary with an explicit target identifier.
- **Any dashboard consuming nested state.** Test with production-faithful snapshots.
- **Any monotonic latch that writes to multiple targets.** Ensure each target receives only its own computed value — never broadcast the same value to all targets.

## Examples

### Concordium starHighWater inflation — caught by adversarial review

**Before (initial U4 implementation):** `updateGrammarStarHighWater` took a `conceptId`, derived both the direct monster and Concordium, wrote the SAME `computedStars` to both.

Scenario: Learner earns evidence on `sentence_functions` only. Bracehart (6 concepts, budget 16.67): Stars = 4. Concordium (18 concepts, budget 5.56): Stars = 1. Function wrote `starHighWater: 4` to both — permanently inflating Concordium from 1 to 4.

**After (adversarial reviewer fix):** `updateGrammarStarHighWater` accepts `monsterId` and updates only the specified monster. Regression test: Concordium `computedStars: 1` + Bracehart `computedStars: 4` → assert Concordium stays at 1.

### Worktree timing hazard — caught by adversarial review

**Before:** U6 worker branched from main before U1 merged. Test fixtures used production shape (`conceptIds` array), but the derivation function still had the old `conceptId` filter. Tests passed vacuously — evidence derivation returned all-false for every tier, and assertions happened to match.

**After:** Review follower rebased on main (bringing in U1 normaliser). Tests re-verified with correct expected values. The autonomous SDLC doesn't detect stale-base conditions automatically — this is a known gap.

### Trust phase sprint pattern

Phase 6 used a wave-based parallel execution pattern:

| Wave | Units | Strategy |
|------|-------|----------|
| 1 | U1 (production shape) | Serial — foundation for all others |
| 2 | U2+U3, U4, U6 | 3 parallel worktrees (U2+U3 serial due to shared files) |
| 3 | U5 (Egg verification) | Serial — depends on U4 |
| 4 | U7 (invariants) | Serial — depends on all above |
| 5 | U8 (trust contract e2e) | Serial — depends on U7 |
| 6 | U9 (Playwright QA) | Serial — depends on U8 |

File overlap check before Wave 2 dispatch: U2+U3 share `grammar-stars.js` (serial), U4 touches `commands.js`/`event-hooks.js`/`grammar.js` (independent), U6 touches `grammar-view-model.js`/`GrammarSetupScene.jsx` (independent). No cross-overlap → 3 parallel worktrees safe.

## Related

- **Direct predecessor:** `docs/solutions/architecture-patterns/grammar-p5-100-star-evidence-curve-and-autonomous-sdlc-2026-04-27.md` — Phase 5 established the Star derivation pipeline; Phase 6 fixes 6 defects and adds server-owned persistence. P5 explicitly rejected Star-evidence events; P6 introduces them via the command handler boundary, preserving the engine isolation contract.
- **Workflow pattern:** `docs/solutions/workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md` — autonomous SDLC orchestration, adversarial review dispatch, worktree isolation.
- **Architectural sibling:** `docs/solutions/architecture-patterns/hero-p0-read-only-shadow-subsystem-2026-04-27.md` — grammar provider reads the same mastery concept state; command-handler boundary pattern parallel.
- **Phase 6 invariants:** `docs/plans/james/grammar/grammar-phase6-invariants.md` — P6-1 through P6-6.
- **Phase 6 implementation report:** `docs/plans/james/grammar/grammar-phase6-implementation-report.md`.
- PRs: #379 (U1), #385 (U6), #387 (U2+U3), #388 (U4), #391 (U5), #394 (U7), #396 (U8), #402 (U9), #412 (report).
