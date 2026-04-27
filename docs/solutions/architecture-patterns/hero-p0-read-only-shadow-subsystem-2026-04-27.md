---
title: Hero P0 read-only shadow subsystem — proving a platform orchestrator boundary before child exposure
date: 2026-04-27
category: architecture-patterns
module: hero, shared-hero, worker-hero
problem_type: architecture_pattern
component: development_workflow
severity: high
applies_when:
  - Building a new platform-level orchestrator across existing subject engines
  - Introducing a cross-cutting feature that must not mutate existing subject state
  - Validating scheduler/selection logic before any child-facing UI exists
  - Extending a platform with additive-only changes to a large existing Worker app
tags:
  - hero-mode
  - shadow-scheduler
  - read-only-boundary
  - provider-pattern
  - deterministic-scheduling
  - no-write-boundary
  - effort-budget
  - subject-mix-cap
---

# Hero P0 read-only shadow subsystem — proving a platform orchestrator boundary before child exposure

## Context

Hero Mode is a platform-level daily mission system across ready subjects (Spelling, Grammar, Punctuation). The product risk: a cross-subject orchestrator could accidentally become a seventh learning engine, a reward system, or a child-facing economy before the learning contract is proven safe. The architecture risk: touching `worker/src/app.js` (2,050 lines), `worker/src/repository.js` (9,000+ lines), and three subject read-model layers with a single feature could regress existing behaviour.

The approach: build the entire orchestrator as a read-only "shadow mode" first (P0), prove the boundary structurally and behaviourally, then add write paths and child UI in later phases. This pattern — shadow-before-production — generalises to any cross-cutting platform feature that touches multiple existing subsystems.

## Guidance

### 1. Three-layer architecture for read-only platform features

```
shared/hero/          pure layer — zero Worker/React/D1 imports
  constants.js        canonical vocabulary (intents, launchers, effort, safety flags)
  contracts.js        quest-level normaliser
  eligibility.js      subject classification
  seed.js             deterministic hash + seeded PRNG
  task-envelope.js    builder + validator
  scheduler.js        deterministic greedy selection

worker/src/hero/      Worker integration layer — reads existing data, writes nothing
  providers/          per-subject read-only adapters
  read-model.js       orchestrator: providers → eligibility → scheduler → response
  routes.js           feature-flagged GET route

tests/                boundary proof
  hero-no-write-boundary.test.js  — structural + behavioural zero-write verification
```

The pure layer can be tested in Node without any Worker runtime. The Worker layer imports from the pure layer but never the reverse. This prevents circular dependencies and keeps the subsystem testable in isolation.

### 2. Provider pattern for cross-subject orchestration

Each ready subject exposes a read-only adapter that translates its existing read-model signals into a standardised envelope format:

```js
// Pattern: provider returns a snapshot, not a mutation
export function grammarProvider(readModel) {
  // Read existing signals — concepts, confidence labels, due counts
  // Emit task envelopes with effort budgets, not question counts
  // Return { subjectId, available, unavailableReason, signals, envelopes[] }
  // NEVER import command handlers, runtime dispatch, or mutation methods
}
```

The orchestrator iterates registered providers, resolves eligibility, and feeds eligible envelopes to the scheduler. Adding a future subject (e.g., Arithmetic) requires only a new provider file and a registry entry — zero changes to the scheduler or eligibility resolver.

### 3. Deterministic scheduling with seeded PRNG

The scheduler must produce the same quest for the same inputs every time, even across deployments. The implementation uses:
- DJB2 hash of `learnerId|dateKey|timezone|schedulerVersion|contentFingerprint` as seed
- Linear congruential generator seeded from the hash
- Integer arithmetic for scoring where possible
- Alphabetical tie-break on subjectId + intent for deterministic sort

Pin the output with a hardcoded fixture test — not just "same output twice" (which is run-to-run purity, not cross-version determinism).

### 4. No-write boundary proof as a structural invariant

The no-write guarantee is enforced at two levels:

**Structural (import-graph scanning):** Every `.js` file in `shared/hero/` and `worker/src/hero/` is scanned for forbidden imports — repository write methods, subject runtime dispatch, D1 write primitives, and client dashboard imports. This catches accidental drift at CI time.

**Behavioural (table row counts):** The route is called, and row counts in 7 protected tables are verified unchanged before and after: `child_game_state`, `child_subject_state`, `practice_sessions`, `event_log`, `mutation_receipts`, `account_subject_content`, `platform_monster_visual_config`.

Both levels are necessary. Structural tests catch the import path; behavioural tests catch indirect writes through helper chains that structural scanning may miss.

### 5. Subject mix caps enforce learning breadth

The scheduler enforces caps against the effort *target* (not the running total), avoiding a cold-start rejection problem:

| Eligible subjects | Cap per subject |
|-------------------|----------------|
| 3+ | 45% of effort target |
| 2 | 60% of effort target |
| 1 | 100% (debug explains why) |

Dividing by the running total at selection time would reject legitimate envelopes early in the quest (e.g., with 2 tasks totalling 4 effort, 45% of 4 = 1.8 — any envelope >= 2 is rejected despite the quest barely starting).

## Why This Matters

**Safety-first feature development:** Shipping a read-only shadow first proves the orchestrator cannot accidentally become a reward system, marking engine, or child-facing economy. The shadow mode runs in staging/debug for validation before any write path or UI is introduced.

**Regression protection at scale:** The platform has 4,000+ existing tests. A cross-cutting feature that touches the Worker app, repository, and three subject layers could silently break any of them. The additive-only pattern (one new route, two new directories, four lines modified in existing files) minimises blast radius.

**Extensibility by design:** The provider + eligibility + scheduler pipeline means future subjects join with one file change, not a rewrite. This is the difference between a platform that grows and one that fragments.

## When to Apply

- Building any new cross-cutting platform feature that reads from multiple existing subsystems
- Introducing a scheduler, recommender, or orchestrator that plans across domain boundaries
- Validating business logic (effort budgets, mix caps, Mega treatment) before child exposure
- Any feature where the safety invariant is "must not write" and that invariant needs to survive future development

## Examples

### Before: coupling orchestrator to subject internals

```js
// Anti-pattern: orchestrator selects specific questions
const grammarQuestion = selectGrammarQuestion(conceptId, templateId);
const spellingWord = selectSpellingWord(wordSlug);
heroQuest.tasks.push({ question: grammarQuestion, word: spellingWord });
```

### After: subject-level envelopes maintain authority boundaries

```js
// Pattern: orchestrator requests learning moments, subjects decide content
const envelope = buildTaskEnvelope({
  subjectId: 'grammar',
  intent: 'weak-repair',
  launcher: 'trouble-practice',
  effortTarget: 6,
  reasonTags: ['weak', 'recent-miss'],
  debugReason: 'Grammar has weak concepts with recent misses.',
});
```

### Review finding: tautological determinism tests

```js
// Anti-pattern: proves nothing across deployments
assert.equal(seed, seed);

// Pattern: pins the exact expected value
assert.equal(seed, 1266714188);
```

### Review finding: cap denominator matters

```js
// Anti-pattern: divides by running total (inflates fraction)
const fraction = subjectEffort / quest.effortPlanned;

// Pattern: divides by target (matches scheduler enforcement)
const fraction = subjectEffort / quest.effortTarget;
```

## Related

- `docs/plans/james/hero-mode/hero-mode-p0.md` — origin contract
- `docs/plans/james/hero-mode/hero-mode-p0-completion-report.md` — full completion report with simulation results and review findings
- `docs/plans/2026-04-27-001-feat-hero-mode-p0-shadow-scheduler-plan.md` — implementation plan
- `docs/solutions/learning-spelling-audio-cache-contract.md` — shared pure layer precedent (audio cache contract)
- `docs/solutions/workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md` — adversarial review patterns applied to Hero P0
