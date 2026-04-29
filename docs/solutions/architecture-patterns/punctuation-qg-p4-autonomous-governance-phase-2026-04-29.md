---
title: "Punctuation QG P4: Autonomous Governance Phase — DSL Completion, Scheduler Maturity, Evidence Dedup"
date: 2026-04-29
category: architecture-patterns
module: punctuation-qg
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - "completing DSL coverage across all generator families (scaling from partial to full governance)"
  - "adding scheduler maturity: misconception retry, exposure limits, reason tags"
  - "hardening reward evidence with variant-signature dedup at projection layer"
  - "introducing severity-classified reviewer reports for non-engineer content reviewers"
  - "creating one-command release gates for content-generation modules"
  - "executing multi-unit plans autonomously with parallel worktree isolation"
tags:
  - autonomous-sdlc
  - dsl-conversion
  - scheduler-maturity
  - star-evidence-dedup
  - governance-phase
  - characterisation-testing
  - punctuation-qg
  - release-gate
  - telemetry
  - reviewer-report
  - leaf-manifest
  - worktree-isolation
---

# Punctuation QG P4: Autonomous Governance Phase

## Context

Punctuation QG P3 delivered DSL authoring tools covering 7 of 25 generator families. The scheduler operated with hard-coded rotation logic and no tuneable constants. Star evidence accumulated without dedup — the persistence-layer `starHighWater` latch was a monotonic ratchet that masked inflation from repeated variant-signatures counting as independent evidence. Reviewer tooling lacked severity classification, and no single-command release gate existed.

The system worked but was accumulating governance debt. Each unconverted family added drift risk (manual edits diverge from DSL conventions). Each scheduler tweak required reading control-flow code. Each star projection omission compounded into measurable mastery inflation.

P4's mandate: keep production volume stable (192 items), complete the authoring system, and mature evidence/scheduler behaviour for later safe expansion.

## Guidance

### 1. Characterisation-first safe conversion

Before modifying any production code path, snapshot its exact output into a frozen test fixture. The snapshot IS the regression test. Convert code only after the characterisation test passes green.

```js
// Step 1: Generate and freeze baseline BEFORE any conversion
const items = createPunctuationGeneratedItems({ perFamily: 4 });
const baseline = groupByFamily(items);
writeFixture('tests/fixtures/punctuation-qg-p4-parity-baseline.json', baseline);

// Step 2: Parity test compares live output to frozen baseline
for (const [familyId, expectedItems] of Object.entries(baseline)) {
  const actual = generateFamily(familyId, { perFamily: 4 });
  assert.deepStrictEqual(actual, expectedItems); // byte-exact match
}

// Step 3: Convert family to DSL — parity test catches any output drift
```

### 2. Evidence dedup at the projection layer

Star evidence dedup operates in the pure projection function (`projectPunctuationStars`), not at the persistence layer. The `starHighWater` latch remains an untouched monotonic ratchet.

```js
// WRONG: dedup at persistence — masks inflation
async function recordEvidence(evidence) {
  if (!existing.includes(evidence.id)) await db.insert(evidence);
  // Two different IDs with same variantSignature both persist → inflation
}

// CORRECT: dedup at projection — inflation structurally impossible
function projectSecureStars(attempts, facet) {
  const countedSignatures = new Set();
  for (const attempt of attempts) {
    if (attempt.variantSignature && countedSignatures.has(attempt.variantSignature)) continue;
    countedSignatures.add(attempt.variantSignature);
    // Only first occurrence counts as independent evidence
  }
}
```

### 3. Scheduler constants as a leaf manifest

Extract all tuneable parameters into a zero-import module with drift tests.

```js
// shared/punctuation/scheduler-manifest.js — ZERO sibling imports
export const MAX_SAME_SIGNATURE_PER_SESSION = 1;
export const MAX_SAME_SIGNATURE_ACROSS_ATTEMPTS = 3;
export const MAX_SAME_SIGNATURE_DAYS = 7;
export const EXPOSURE_WEIGHT_BLOCKED = 0.01;
export const REASON_TAGS = Object.freeze({ /* ... */ });
```

Drift test pins the export count:
```js
assert.strictEqual(Object.keys(manifest).length, 11);
```

### 4. One-command release gate

Compose all independent quality checks into a single pass/fail script. No partial passes allowed.

```js
// scripts/verify-punctuation-qg.mjs
const components = [
  { name: 'Strict audit (depth 4)', command: '...' },
  { name: 'Capacity audit (depth 8)', command: '...' },
  { name: 'Golden marking tests', command: '...' },
  { name: 'DSL parity tests', command: '...' },
  { name: 'Read-model redaction', command: '...' },
  { name: 'Content audit tests', command: '...' },
  { name: 'Reviewer report (all DSL)', command: '...' },
];
// Run all, report pass/fail per component, exit non-zero on ANY failure
```

### 5. Autonomous parallel execution with worktree isolation

Each implementation unit operates in its own git worktree. Units share no mutable state. An independent correctness reviewer evaluates each PR before merge. Merge conflicts are resolved by the later unit rebasing onto the earlier merge.

Pattern: **14 PRs in 6 waves**, dependency-ordered, with adversarial review on reward-algorithm code.

## Why This Matters

| Without this pattern | Consequence |
|---------------------|-------------|
| No characterisation snapshots | Template conversions silently alter production output; children receive different questions after "refactor-only" changes |
| Persistence-layer dedup | Star counts inflate; starHighWater ratchet masks the problem because it only moves forward |
| Inline scheduler constants | Tuning requires reading control-flow code; accidental edits during refactors go undetected |
| Per-check CI gates | A PR passes lint but fails characterisation; local dev diverges from CI |
| Shared working tree for parallel units | Stash-clobber destroys work; merge ordering becomes non-deterministic |
| No reviewer severity | Non-engineer content reviewers cannot distinguish blocking issues from informational signals |

## When to Apply

- **Deterministic content-generation systems** must evolve without altering existing output (question generators, template banks, curriculum content)
- **Reward/progression algorithms** accumulate evidence that must never double-count (star systems, XP ledgers, achievement trackers)
- **Scheduler/weighting logic** uses constants that need independent tuning (difficulty curves, cooldowns, rotation weights)
- **Multi-phase delivery** requires parallel execution without serialisation (plans with 5+ independent units)
- **Governed systems** require machine-verifiable proof that changes are behaviour-preserving (regulated content, exam-aligned material)
- **Post-governance phases** need evidence-based expansion decisions (P5 readiness gated on P4 telemetry data)

## Examples

### Before P4: Manual conversion with hidden drift

A developer converts a template family by rewriting code. No baseline exists. The reviewer eyeballs the output. A subtle change in slot ordering produces different questions for seeds 4-8. Nobody notices until star divergence appears 3 weeks later.

### After P4: Characterisation-gated conversion

1. Freeze baseline fixture (U7): `createPunctuationGeneratedItems({ perFamily: 4 })` → JSON snapshot
2. Convert family to DSL: `definePunctuationTemplate()` → `expandDslTemplates({ embedTemplateId: false })`
3. Parity test: `assert.deepStrictEqual(liveOutput, frozenBaseline)` — fails instantly on any drift
4. Golden marking: `tests.accept` + `tests.reject` prove validator correctness
5. Capacity audit: depth 8 confirms ≥8 unique signatures per family

### Evidence dedup in practice

Two correct attempts with the same `variantSignature` on skill `fronted_adverbial::combine`:
- **Before P4**: Both count → 2 Secure evidences → inflated star count
- **After P4**: First counts, second skipped by per-facet Set → 1 Secure evidence → accurate progression

## Delivered Metrics (P4 Closure)

```text
DSL-backed families:     25 / 25 (100%)
Production items:        192 (unchanged)
Capacity items (depth 8): 292
Duplicate signatures:    0 (production and capacity)
PRs merged:              14 (#555-#570)
Verify gate:             7/7 passing
Blocker caught by review: 1 (feedback.kind field name)
Manual intervention:     0
```

## Cross-References

- **Predecessor**: `docs/solutions/architecture-patterns/punctuation-qg-p3-dsl-authoring-time-normaliser-2026-04-28.md` — P3 established the DSL-as-normaliser pattern that P4 extends to full governance
- **Parallel sibling**: `docs/solutions/architecture-patterns/grammar-qg-p5-machine-verifiable-content-release-process-2026-04-28.md` — Grammar QG applied the same release-gate and deep-seed patterns independently
- **Star evidence ancestry**: `docs/solutions/architecture-patterns/punctuation-p6-star-truth-monotonic-hardening-2026-04-27.md` — P6 established the monotonic latch that P4's dedup preserves
- **Seed collision fix**: `docs/solutions/logic-errors/seeded-prng-index-collision-pickbyseed-2026-04-28.md` — pickBySeed modulo pattern used in all DSL slot selection
- **SDLC process**: `docs/solutions/workflow-issues/autonomous-certification-phase-wave-execution-2026-04-27.md` — wave execution pattern for autonomous multi-unit delivery
- **Completion report**: `docs/plans/james/punctuation/questions-generator/punctuation-qg-p4-completion-report.md` — full verification evidence and acceptance checklist
