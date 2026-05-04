---
title: "Hero Mode pA4 — Productionisation Delivery Patterns"
module: hero-mode
date: 2026-04-30
problem_type: architecture_pattern
component: development_workflow
severity: medium
tags:
  - "hero-mode"
  - "productionisation"
  - "cohort-control"
  - "document-as-code"
  - "operational-symmetry"
  - "rollout"
---

# Hero Mode pA4 — Productionisation Delivery Patterns

## Context

Hero Mode required a productionisation phase (pA4) to transition from internally-proven to externally-ready. The challenge: deliver cohort control, metrics infrastructure, stop/warning condition automation, operational documentation, and decision frameworks — without modifying the running feature beyond a single resolver upgrade.

The delivery produced 14 implementation units across 7 PRs, 503 tests, and 10 contract deliverables. Four reusable patterns emerged.

## Guidance

### 1. Additive Resolver Extension with Classified Override Status

When extending an account-scoped feature gate:
- Add a new env var (`HERO_EXTERNAL_ACCOUNTS`) parallel to the existing one (`HERO_INTERNAL_ACCOUNTS`)
- Return a classification enum (`internal | external | global | none`) rather than boolean
- Keep the old function as a backward-compatible wrapper calling the new primary
- Same resolver used by both read model and command routes (single source of truth)

```javascript
// New primary — returns classification
export function resolveHeroFlagsForAccount({ env, accountId }) {
  // ... parse both lists, classify, return { resolvedEnv, overrideStatus }
}

// Backward-compatible wrapper — unchanged API surface
export function resolveHeroFlagsWithOverride({ env, accountId }) {
  return resolveHeroFlagsForAccount({ env, accountId }).resolvedEnv;
}
```

This pattern avoids breaking existing callers while giving ops visibility into why an account is enabled.

### 2. Document-as-Validated-Code

Operational documents (support packs, parent explainers, risk registers) are validated by automated tests:
- Required content markers checked (7 statements the explainer must include)
- Forbidden content patterns rejected (pressure vocabulary, six-subject claims)
- Structural completeness enforced (all 13 stop conditions appear in register)

```javascript
// tests/hero-pA4-parent-explainer-validation.test.js
const content = readFileSync(explainerPath, 'utf8');
const FORBIDDEN = ['gamble', 'streak', 'punishment', 'limited time', 'hurry'];
for (const word of FORBIDDEN) {
  assert.ok(!content.toLowerCase().includes(word), `Forbidden: ${word}`);
}
```

This catches content drift before it reaches production and prevents accidental introduction of copy that violates product contracts.

### 3. Multi-Day Cohort Simulation via Date-Key Rollover Fixtures

When validating time-dependent behaviour without real calendar time:
- Build fixture factories producing N accounts × M days of events
- Each simulated day progresses through the full lifecycle (quest → task → claim → coins → camp)
- Date-key rollover tested explicitly (proves reset logic, no carryover corruption)
- Multi-device deduplication tested (same account, different sessions, same day)

The simulation produces a metrics dataset that the extraction infrastructure can process, proving the full pipeline works end-to-end without waiting for real observation windows.

### 4. Operational Symmetry Across Phases

All evidence and metrics tooling uses identical formats across A-series phases:
- 9-column provenance table (date, source, account, learner, signal, value, provenance, confidence, notes)
- Same `--source` flag distinguishes internal vs external cohort observations
- Same stop conditions with identical detection/response protocol
- One operator workflow regardless of cohort type

This means pA3 scripts process pA4 data without modification, and operators need only one mental model.

## Why This Matters

- **Minimal runtime footprint**: 503 tests and 10 deliverables added while modifying only 2 existing files (app.js resolver call, account-override.js extension). Feature risk stays near zero.
- **Document validation prevents drift**: Production copy violating product contracts (pressure language, false claims) is caught in CI, not by parent complaints.
- **Simulation unblocks delivery**: Teams can validate the full infrastructure without waiting for calendar time, separating "code works" from "real users behave as expected."
- **Operational symmetry reduces cognitive load**: One format, one workflow, one set of stop conditions regardless of which phase or cohort type is active.

## When to Apply

- Extending account-scoped feature gates with new cohort types
- Building productionisation infrastructure that must not modify running features
- Validating time-dependent behaviour in automated tests
- Creating operational documentation that must stay internally consistent with product contracts
- Any phase where multiple A-series assurance cycles share tooling

## Examples

**Before (pA2/pA3):** `HERO_INTERNAL_ACCOUNTS` returns boolean override, ops cannot distinguish internal from external enablement.

**After (pA4):** `resolveHeroFlagsForAccount` returns `{ resolvedEnv, overrideStatus: 'internal' | 'external' | 'global' | 'none' }`. Ops output shows classification. Same function used everywhere.

**Before:** Support pack is a markdown file that may drift from product contract. No automated check.

**After:** `tests/hero-pA4-support-pack-validation.test.js` (47 assertions) validates structure, required content, forbidden patterns, and cross-references on every CI run.
