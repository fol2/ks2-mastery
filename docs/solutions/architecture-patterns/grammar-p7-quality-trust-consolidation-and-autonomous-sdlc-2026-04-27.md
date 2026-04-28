---
title: "Grammar Phase 7 — Quality & Trust Consolidation: Dependency Extraction, Debug Observability, and Playwright Contract Testing"
date: 2026-04-27
category: architecture-patterns
module: grammar-quality-trust
problem_type: architecture_pattern
component: development_workflow
severity: high
applies_when:
  - "A shared module has become a dependency bottleneck coupling platform code to subject-specific code"
  - "A debug surface needs to explain why a derived value (Stars, stages) takes its current value"
  - "Child-facing UX couples optional AI features to non-AI workflows via shared state"
  - "Playwright tests need deterministic state-seeding across concurrent workers"
  - "A sprint must prove all prior-phase invariants are preserved while adding new ones"
tags:
  - grammar
  - dependency-extraction
  - star-debug-model
  - command-trace
  - playwright-state-seeding
  - confidence-fallback
  - writing-try-decoupling
  - status-filter-semantics
  - drift-guard
  - invariant-preservation
  - autonomous-sdlc
  - trust-consolidation
---

# Grammar Phase 7 — Quality & Trust Consolidation: Dependency Extraction, Debug Observability, and Playwright Contract Testing

## Context

Grammar Phases 4 through 6 built a 100-Star reward curve, five-label confidence taxonomy, and star-evidence pipeline across shared, client, and Worker layers. By the end of P6, the functional machinery was complete but several quality debts had accumulated:

- The shared Star module (`shared/grammar/grammar-stars.js`) imported concept data from `src/platform/game/mastery/grammar.js`, violating the `shared/ never imports src/` boundary contract.
- The five confidence labels were duplicated across `confidence.js` and `grammar-view-model.js`, with local maps that could drift independently.
- Child-facing surfaces mixed metaphors: the summary screen showed raw concept counts while the dashboard showed Stars; the "Due" filter label exposed internal scheduling terminology; the Writing Try feature was gated on an unrelated AI toggle.
- No debug tooling existed to answer "why does this monster show N Stars?" without reading raw evidence arrays.
- No deterministic test fixtures existed for seeding Grammar state in Playwright browser tests, and the concurrency contract (idempotency, monotonicity, ordering invariance) was asserted only indirectly.

P7 ran 12 units in a wave-based parallel dispatch pattern to close these debts without feature-flag risk — all changes are backward-compatible consolidations. 23 files changed, 2,955 lines added, 125 deleted. 407 tests pass. All 33 P4+P5+P6 invariants preserved. Zero `GRAMMAR_CONTENT_RELEASE_ID` bump. PR #428.

## Guidance

### 1. Extract shared data to break dependency direction violations

When a `shared/` module imports from `src/`, extract the pure data into a new `shared/` module. The platform layer re-exports for backward compatibility so that zero call sites change.

```js
// shared/grammar/grammar-concept-roster.js — pure frozen data, zero src/ imports
export const GRAMMAR_MONSTER_CONCEPTS = Object.freeze({
  bracehart: Object.freeze([
    'sentence_functions', 'clauses', 'relative_clauses',
    'noun_phrases', 'active_passive', 'subject_object',
  ]),
  // ... chronalyx, couronnail
});

export function conceptIdsForGrammarMonster(monsterId) {
  if (monsterId === 'concordium') return GRAMMAR_AGGREGATE_CONCEPTS;
  return GRAMMAR_MONSTER_CONCEPTS[monsterId] || [];
}
```

The platform mastery layer then re-exports:

```js
// src/platform/game/mastery/grammar.js
import { GRAMMAR_MONSTER_CONCEPTS, GRAMMAR_AGGREGATE_CONCEPTS, GRAMMAR_CONCEPT_TO_MONSTER }
  from '../../../../shared/grammar/grammar-concept-roster.js';
export { GRAMMAR_MONSTER_CONCEPTS, GRAMMAR_AGGREGATE_CONCEPTS, GRAMMAR_CONCEPT_TO_MONSTER };
```

Zero test changes needed because function signatures remain identical.

### 2. Centralise status/filter semantics as a canonical taxonomy

When the same label set is mapped in multiple files, create one frozen taxonomy array where each entry carries all the facets: internal label, child label, CSS tone, and filter ID.

```js
// shared/grammar/grammar-status.js
export const GRAMMAR_STATUS_TAXONOMY = Object.freeze([
  Object.freeze({
    internalLabel: 'needs-repair',
    childLabel: 'Trouble spot',
    childTone: 'trouble',
    bankFilterId: 'trouble',
    isChildCopy: false,  // the internal label is not child-safe
  }),
  // ... building, consolidating, secure, emerging
]);

export function grammarChildLabelForInternal(label) {
  const entry = grammarStatusForLabel(label);
  return entry ? entry.childLabel : 'Check status';
}
```

All consumers delegate to the shared contract. Drift becomes impossible by construction.

### 3. Unify display models via fallback to persisted state

When summary and dashboard views disagree on display values, have both consume the same builder function. The summary passes `null` for evidence parameters, causing the builder to fall back to `starHighWater` (persisted state) rather than recomputing live evidence.

```js
// Dashboard path — live evidence:
monsterStrip: buildGrammarMonsterStripModel(rewardState, masteryConceptNodes, recentAttempts),

// Summary path — persisted fallback:
monsterStrip: buildGrammarMonsterStripModel(rewardState, null, null),
// Falls back to starHighWater from reward state — always available.
```

### 4. Decouple features from unrelated capability toggles

When a feature does not depend on an external capability, set its availability unconditionally. Let the downstream scene handle graceful degradation for missing inputs.

```js
// Before: gated on an unrelated toggle
writingTryAvailable: aiEnrichment?.enabled ?? false,

// After: unconditionally available
writingTryAvailable: true,
// The transfer scene handles empty prompts gracefully.
```

### 5. Use child-safe labels for internal-term filters

Rename filters whose labels expose internal scheduling terminology. Keep the filter id and routing unchanged so telemetry and Worker routing are unaffected.

```js
// Before:
Object.freeze({ id: 'due', label: 'Due', tone: 'due' }),

// After:
Object.freeze({ id: 'due', label: 'Practise next', tone: 'due' }),
// The id stays 'due' — only the child-facing label changes.
```

### 6. Build pure shared debug models with redaction contracts

For "why N Stars?" diagnostics, create a pure shared module that returns per-concept tier breakdown, source attribution (live/highWater/legacyFloor), and retention timing estimates — but never raw answer content. Enforce the redaction boundary via snapshot tests.

```js
// shared/grammar/grammar-star-debug.js
export function buildGrammarStarDebugModel({ monsterId, conceptNodes, recentAttempts, rewardEntry, nowTs }) {
  return {
    monsterId,
    displayStars, starHighWater, computedLiveStars, legacyFloor,
    stageName, displayStage, nextMilestone,
    source,           // 'live' | 'highWater' | 'legacyFloor'
    conceptEvidence,  // per-concept tier booleans + starsContributed
    rejectedCategories,
    warnings,         // e.g. 'Rolling window may have truncated older evidence'
    // NEVER: correctAnswer, acceptedAnswers, templateClosure, aiPrompt, aiOutput
  };
}
```

### 7. Use deterministic event IDs for replay idempotency

Replace `Date.now()` in event IDs with `requestId + computedStars`. Replay then produces the same ID, which is a prerequisite for idempotency testing.

```
// Before: grammar.star-evidence.${learnerId}.${monsterId}.${Date.now()}
// After:  grammar.star-evidence.${learnerId}.${monsterId}.${requestId}.${computedStars}
```

### 8. Frozen state-seeding fixtures for browser tests

Create factory functions that return frozen `{ rewardState, analytics }` objects matching the platform interface. Each factory represents a specific deterministic state. 72 unit tests validate the fixtures themselves — the Playwright tests consume them.

```js
// tests/helpers/grammar-state-seed.js
export function seedPreHatch() {
  return deepFreeze({
    rewardState: {
      bracehart: { mastered: [...], caught: true, starHighWater: 14, releaseId },
      // ... other monsters at baseline
    },
    analytics: { concepts: [...], progressSnapshot: { ... } },
  });
}

export function validateSeedShape(seed) { /* throws if shape is invalid */ }
```

### 9. Prove concurrency via pure function testing

Test `applyStarHighWaterLatch` directly with 100 random sequences for monotonicity ratchet. Test event ordering invariance by running the same events in different orders. No HTTP concurrency needed — the pure-function approach proves the mathematical property directly.

```js
test('100 random sequences — displayStars never decreases', () => {
  const rng = createSeededRandom(42);
  for (let seq = 0; seq < 100; seq++) {
    let highWater = 0, prevDisplay = 0;
    for (let step = 0; step < length; step++) {
      const computedStars = Math.floor(rng() * 101);
      const { displayStars, updatedHighWater } = applyStarHighWaterLatch({
        computedStars, starHighWater: highWater, legacyStage: 0,
      });
      assert.ok(displayStars >= prevDisplay);
      highWater = updatedHighWater;
      prevDisplay = displayStars;
    }
  }
});
```

### 10. Wave-based parallel dispatch with file-overlap check

Before dispatching units in parallel, check for file overlap. If two units modify the same file, serialise them. If no overlap exists, dispatch in parallel.

P7 dependency graph produced these waves:
- **Wave 1:** U1 (foundation — characterisation-first, inline)
- **Wave 2:** U3 → U2 (serial — shared `grammar-view-model.js`)
- **Wave 3:** U4 + U5 + U6 + U9 (4-way parallel — no file overlap)
- **Wave 4:** U7 + U8 + U10 (3-way parallel — no file overlap)
- **Wave 5:** U11 + U12 (final — Playwright + drift guards)

This cut 12 serial cycles to effectively 6 cycles.

## Why This Matters

- **Dependency direction violations silently break Worker builds.** When `shared/` imports from `src/`, the Worker build pulls in React/DOM/router code. The failure is silent at dev time (bundler tree-shakes it out) but surfaces as a production crash when the Worker runtime evaluates a side-effect import.
- **Duplicated label maps drift.** Two files mapping the same 5 labels will inevitably diverge. A centralised frozen taxonomy makes drift impossible by construction.
- **Children do not understand internal terminology.** "Due" means nothing to a 9-year-old. "Practise next" communicates the same intent in child-safe language. Raw concept counts contradict the 100-Star metaphor that the child sees everywhere else.
- **Debug models without redaction leak answer content.** A debug surface exposing raw `recentAttempts` (which contain question text) violates the data contract. The redaction boundary — tier booleans and star contributions but never raw attempt content — is a structural guarantee.
- **Pure-function concurrency proofs are cheaper than HTTP tests.** 100 random sequences through `applyStarHighWaterLatch` runs in milliseconds, covers all boundary conditions, and is deterministic.
- **State-seeding fixtures decouple browser tests from engine paths.** Without fixtures, a Playwright test needing "bracehart at 14 Stars" must drive the engine through 14 Stars of interactions. With a fixture factory, the test injects state directly.

## When to Apply

| Pattern | Apply when... |
|---|---|
| Dependency extraction | A `shared/` module imports from `src/` or `worker/` |
| Status taxonomy centralisation | The same label set is mapped in 2+ files |
| Display model unification | Two views show the same metric differently |
| Feature decoupling | A feature's availability is gated on an unrelated capability toggle |
| Child-safe relabelling | A filter/chip/label exposes internal terminology |
| Redacted debug model | You need "why this value?" diagnostics for admin/test surfaces |
| Deterministic event IDs | Events use `Date.now()` in their ID |
| Frozen state-seeding fixtures | Browser tests need known state but driving the engine is too expensive |
| Pure-function concurrency proofs | You need to prove monotonicity, idempotency, or ordering invariance |
| Wave-based parallel dispatch | Multiple sprint units have a dependency graph allowing parallelism |

## Examples

**Before/after: dependency direction violation**

```
BEFORE (shared imports platform — direction violation):
  shared/grammar/grammar-stars.js
    └── import { GRAMMAR_MONSTER_CONCEPTS } from '../../src/platform/game/mastery/grammar.js'

AFTER (shared imports shared — direction preserved):
  shared/grammar/grammar-stars.js
    └── import { conceptIdsForGrammarMonster } from './grammar-concept-roster.js'
  src/platform/game/mastery/grammar.js
    └── import { ... } from '../../../../shared/grammar/grammar-concept-roster.js'
    └── export { ... }  // backward compat re-export
```

**Before/after: summary monster progress**

```jsx
// BEFORE — raw concept counts
<span>{monster.mastered}/{monster.total}</span>

// AFTER — Star-based display
<span>{monster.stageName} — {monster.stars} / {monster.starMax} Stars</span>
```

**Before/after: confidence label fallback**

```js
// BEFORE — silently displays "Learning" for unknown labels
if (!isGrammarConfidenceLabel(label)) return 'Learning';

// AFTER — honest fallback
if (!isGrammarConfidenceLabel(label)) return 'Check status';
```

**Usage: debug model for admin diagnostics**

```js
const debug = buildGrammarStarDebugModel({
  monsterId: 'bracehart',
  conceptNodes: learnerMasteryNodes,
  recentAttempts: engineAttempts,
  rewardEntry: rewardState.bracehart,
});
// debug.source → 'highWater' (display driven by persisted high-water)
// debug.conceptEvidence[0].tiers → { firstIndependentWin: true, ..., retainedAfterSecure: false }
// debug.warnings → ['Rolling window may have truncated older evidence']
// NEVER contains raw attempt text or answer content
```

## Related

- **Direct predecessor (P6):** `docs/solutions/architecture-patterns/grammar-p6-star-derivation-trust-and-server-owned-persistence-2026-04-27.md` — Phase 6 established the production-shape trust pipeline and command-handler event emission; Phase 7 adds diagnostic instrumentation (Star Debug Model, command trace) and Playwright state-seeding that proves the trust pipeline under real browser state.
- **Foundational predecessor (P5):** `docs/solutions/architecture-patterns/grammar-p5-100-star-evidence-curve-and-autonomous-sdlc-2026-04-27.md` — Phase 5 established the read-time derivation, starHighWater latch, and epsilon guard. Phase 7's debug model exposes the full derivation pipeline for diagnostic inspection.
- **SDLC orchestration:** `docs/solutions/workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md` — canonical autonomous sprint pattern; P7 applies and refines the scrum-master orchestration, adversarial review, and worktree isolation.
- **Cross-subject sibling:** `docs/solutions/architecture-patterns/punctuation-p6-star-truth-monotonic-hardening-2026-04-27.md` — Punctuation's `mergeMonotonicDisplay` shared helper parallels P7's status/filter centralisation across Grammar's display surfaces.
- **Convergent sprint patterns:** `docs/solutions/best-practices/p3-stability-capacity-multi-learner-patterns-2026-04-27.md` — characterisation-first testing and vacuous-truth guard patterns applied to P7's Playwright state-seeded tests.
- **Dependency direction parallel:** `docs/solutions/architecture-patterns/hero-p0-read-only-shadow-subsystem-2026-04-27.md` — three-layer architecture (pure/Worker/test) and structural boundary tests inform P7's shared module dependency direction rules.
