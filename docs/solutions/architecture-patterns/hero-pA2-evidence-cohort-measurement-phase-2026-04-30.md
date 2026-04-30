---
title: "Hero Mode pA2: Evidence-based measurement phase with honest certification gating"
date: 2026-04-30
category: architecture-patterns
module: hero-mode
problem_type: architecture_pattern
component: development_workflow
severity: high
applies_when:
  - "Running A-series validation phases that require production evidence"
  - "Building internal cohort measurement infrastructure before external rollout"
  - "Gating product decisions on machine-verifiable certification rather than prose sign-off"
  - "Multiple independent review rounds needed to verify contract compliance"
tags: [hero-mode, a-series, evidence-locked, certification, cohort, privacy, measurement, hold-and-harden]
---

# Hero Mode pA2: Evidence-based measurement phase with honest certification gating

## Context

Hero Mode completed P0-P6 (feature development) and pA1 (validation scaffolding). A2 was the first phase that required real production measurement — not just code correctness, but operational evidence that the system is safe to widen. The fundamental challenge: code agents can build tooling but cannot substitute for calendar-bound production observation. Over-claiming "complete" when only tooling was delivered caused trust erosion that required 4 rounds of independent review to resolve.

## Guidance

### 1. Separate "code-ready" from "phase-complete" in A-series phases

A-series phases exist to prove production behaviour, not code correctness. Code is a prerequisite, not the deliverable. The phase is complete when:
- The A3 decision is made (PROCEED / HOLD / ROLLBACK)
- The certification validator mechanically confirms evidence exists
- The decision honestly reflects the evidence quality

### 2. Use machine-verifiable certification, not prose sign-off

```
reports/hero/hero-pA2-certification-manifest.json  →  declares required evidence
scripts/validate-hero-pA2-certification-evidence.mjs  →  checks mechanically
```

The validator gates the decision. It checks file existence, observation counts, date key diversity, and decision keyword presence. Critically, it rejects placeholder text — a template saying `[PROCEED / HOLD / ROLLBACK]` fails the check.

### 3. Apply per-account override BEFORE route-level gates

The read-model route initially checked `env.HERO_MODE_SHADOW_ENABLED` before applying the override. Internal cohort accounts with global flags OFF got 404. The fix pattern:

```
authenticate → resolveHeroFlagsWithOverride({ env, accountId }) → gate on resolvedEnv
```

This must be applied consistently on ALL routes that check Hero flags (read-model, launch, claim, camp).

### 4. Recursive privacy validation at input AND output boundaries

Two layers:
- **Input-side**: `validateMetricPrivacyRecursive` rejects events with forbidden fields at any depth
- **Output-side**: `stripPrivacyFields` removes forbidden keys from probe responses

The depth-10 limit is acceptable because real Hero payloads are 3-4 levels deep. Document the limitation explicitly.

### 5. HOLD AND HARDEN is a valid success outcome

The contract allows three decisions. Choosing HOLD when evidence is insufficient is not failure — it prevents unsafe rollout. The A2 contract explicitly anticipated this: "The planner may choose to mark as 'hold and harden' if the evidence does not support widening. That is a valid success path."

### 6. Independent reviewer verification exposes over-claiming

4 rounds of 10 independent reviewers each caught progressively subtler issues:
- Round 1: 8 bugs (field mismatches, logic errors, over-claimed completion)
- Round 2: 3 gaps (cross-learner leakage, undocumented conditions, missing section)
- Round 3: 3 final items (event filter, stop condition severity, unresolved defects)
- Round 4: 0 findings (all pass)

The pattern: dispatch reviewers with the CONTRACT as their reference, not your claims about what you built.

## Why This Matters

Without machine-verifiable gating:
- Prose completion reports can over-claim (this happened in this session)
- Future agents will trust stale reports without checking evidence
- The A3 decision becomes a social judgment call rather than an evidence-backed gate

Without honest certification:
- CERTIFIED_PRE_A3 would be achievable by creating empty files with the right names
- The validator must check content (observation counts, date diversity, decision keywords) not just existence

Without the override-before-gate pattern:
- Production internal cohort cannot see Hero surfaces even after secret configuration
- The entire A2-2 ring is blocked by a code defect invisible to unit tests

## When to Apply

- Any A-series (validation/assurance) phase where production evidence is required
- Any phase where a go/no-go decision must be grounded in operational data
- Any internal cohort rollout where global flags remain OFF for non-listed accounts
- Any privacy-sensitive feature where telemetry must not leak child content

## Examples

### Certification validator rejecting placeholder

```js
// REJECTED: bracket-enclosed options list
**Recommendation:** [PROCEED TO A3 / HOLD AND HARDEN / ROLLBACK]

// ACCEPTED: real decision on labelled line
**Recommendation:** HOLD AND HARDEN
```

### Override ordering (correct)

```js
// routes.js — correct: override before gate
const resolvedEnv = resolveHeroFlagsWithOverride({ env, accountId: session.accountId });
if (!envFlagEnabled(resolvedEnv.HERO_MODE_SHADOW_ENABLED)) {
  throw new NotFoundError('Hero shadow read model is not available.');
}
```

### Stop condition severity classification

```js
// Contract §8 #9 is an immediate stop, not a warning
if (overrideStatus && overrideStatus.isInternalAccount === false) {
  conditions.push({ level: 'stop', key: 'override-not-internal' }); // NOT 'warn'
}
```

## Related Issues

- PR #697: Reviewer-found bug fixes (round 1)
- PR #704: Production internal cohort enablement
- PR #715: Final gaps (round 3)
- Issue #683: A2-2 production configuration and blocker discovery
- Issue #684: A2-3 multi-day observation
- Issue #685: A2-4 recommendation closure
- Origin contract: `docs/plans/james/hero-mode/A/hero-mode-pA2.md`
- Completion report: `docs/plans/james/hero-mode/A/hero-pA2-plan-completion-report.md`
