---
title: "Hero P6: Production Hardening — Preflight Resolution, Metrics Foundation, and Rollback-Safe Rollout"
date: 2026-04-29
category: architecture-patterns
module: hero-mode
problem_type: architecture_pattern
component: service_object
severity: high
applies_when:
  - "Feature-flag-gated system approaching production rollout"
  - "Multi-phase system with state mutations requiring idempotency guarantees"
  - "Systems needing gradual rollout with instant rollback at each layer"
  - "Observability must be proven before health thresholds are set"
  - "Asset/resource path handling must match actual deployment layout"
tags:
  - hero-mode
  - production-hardening
  - feature-flags
  - rollout-strategy
  - rollback-playbook
  - idempotency
  - observability
  - event-enrichment
  - state-migration
  - metrics-contract
---

# Hero P6: Production Hardening — Preflight Resolution, Metrics Foundation, and Rollback-Safe Rollout

## Context

Hero Mode P6 (PR #585, merged 2026-04-29) hardened a 6-phase feature-flag-gated game economy in an education platform before production rollout. The system enables children to complete daily quests, earn capped Hero Coins, and grow collectible Camp monsters.

P6 was not a feature expansion — it resolved 4 critical preflight blockers, introduced 52 structured metrics across 4 health domains, hardened state migration against adversarial inputs, and produced operational rollout/rollback playbooks.

The 6-flag linear hierarchy (`SHADOW → LAUNCH → CHILD_UI → PROGRESS → ECONOMY → CAMP`) enforces fail-closed dependencies: no child flag can enable before its parents. P6 does not extend this hierarchy.

This pattern applies whenever a feature-flag-gated system needs production certification without adding new features.

## Guidance

### Pattern 1: Preflight Blocker Resolution via Targeted Mutation

Each preflight blocker was isolated to a single testable module or function. Fixes were verified without touching related systems.

**Asset path mismatch** — Client adapter produced wrong filesystem paths:

Before (broken):
```javascript
// Generated: ./assets/monsters/glossbloom-b1-0/640.webp  ❌
const key = `${sourceAssetMonsterId}-${branchPart}-${stageNum}`;
return { src: `./assets/monsters/${key}/${size}.webp` };
```

After (correct):
```javascript
// Generates: ./assets/monsters/glossbloom/b1/glossbloom-b1-0.640.webp  ✓
const base = `./assets/monsters/${sourceAssetMonsterId}/${branchPart}`;
return { src: `${base}/${sourceAssetMonsterId}-${branchPart}-${stageNum}.${size}.webp` };
```

**Idempotency hash gap** — Mutation receipt hash excluded command-specific identity:

Before (vulnerable):
```javascript
// Camp heroCommand lacked payload → hash insensitive to monsterId/branch/targetStage
const heroCommand = { command: body.command, learnerId, requestId, expectedLearnerRevision };
// command.payload is undefined → two different Camp actions with same requestId replay wrong response
```

After (safe):
```javascript
const heroCommand = {
  command: body.command, learnerId, requestId, expectedLearnerRevision,
  payload: { monsterId: body.monsterId, branch: body.branch || 'b1', targetStage: body.targetStage },
};
// hash now differentiates: same requestId + different monsterId → 409 idempotency_reuse
```

**Event determinism** — Non-deterministic event IDs broke reconciliation:

```javascript
// Before: hero-evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}
// After:  hero-evt-${ledgerEntry.entryId}  ← matches P4 coins pattern, enables dedup by ID
```

### Pattern 2: Event Enrichment (Not New Event Types)

Governance rule: enrich existing telemetry events with new dimensions; never fork the pipeline.

```javascript
// Existing event enriched with learning-health dimensions:
console.log(JSON.stringify({
  event: 'hero_task_claim_succeeded',
  learnerId, questId, taskId,           // ← already present
  subjectId,                             // ← enriched
  heroTaskIntent: progressTask.intent,   // ← enriched
  launcher: progressTask.launcher,       // ← enriched
  eligibleSubjectCount: uniqueSubjects.size,  // ← enriched
  subjectMixShare: Math.round(share * 100) / 100,  // ← enriched
  postMegaFlag: null,                    // ← reserved (populated when derivation available)
}));
```

Privacy validation is machine-enforced:
```javascript
export function validateMetricPrivacy(eventPayload) {
  const FORBIDDEN = ['rawAnswer', 'rawPrompt', 'childFreeText', 'childInput', 'answerText'];
  const violations = FORBIDDEN.filter(f => f in eventPayload);
  return { valid: violations.length === 0, violations };
}
```

### Pattern 3: Measure-First Approach for Health Thresholds

Define metric structure and collection first. Define thresholds only after baselines accumulate in staging/production. No hardcoded alerting thresholds in P6.

```javascript
// 52 metrics defined across 4 categories — all frozen arrays, zero runtime side-effects
export const HERO_LEARNING_HEALTH_METRICS = Object.freeze([...]);  // 12 metrics
export const HERO_ENGAGEMENT_METRICS = Object.freeze([...]);       // 10 metrics
export const HERO_ECONOMY_CAMP_METRICS = Object.freeze([...]);     // 18 metrics
export const HERO_TECHNICAL_SAFETY_METRICS = Object.freeze([...]);  // 12 metrics

// Analytics derives facts without judgment:
export function classifyBalanceBucket(balance) {
  if (balance <= 0) return '0';
  if (balance < 100) return '1-99';
  if (balance < 300) return '100-299';
  if (balance < 600) return '300-599';
  if (balance < 1000) return '600-999';
  return '1000+';
}

// Readiness checks structural pass/fail — no business logic thresholds:
export function deriveReadinessChecks(heroState, flags) {
  return { checks: [...], overall: allPass ? 'ready' : 'not_ready' };
}
```

### Pattern 4: Rollback Preserves State Dormant

When a feature flag disables, the UI hides and new writes stop — but all existing state remains intact and recoverable.

```
Flag disable sequence (top-down):
1. HERO_MODE_CAMP_ENABLED = false        → Camp hidden, spend rejected, Coins earning continues
2. HERO_MODE_ECONOMY_ENABLED = false     → Coins hidden, no awards, Camp hidden (dependency)
3. HERO_MODE_PROGRESS_ENABLED = false    → No claims, subject practice still works
4. HERO_MODE_CHILD_UI_ENABLED = false    → Hero card hidden, subjects usable
5. HERO_MODE_LAUNCH_ENABLED = false      → Hero tasks cannot start
6. HERO_MODE_SHADOW_ENABLED = false      → Read model unavailable, full fallback

Re-enable any flag → state reappears from D1. Zero data loss.
```

Key implementation rules:
- Disable commands return 409 with typed error code (e.g., `hero_camp_disabled`)
- Never delete balance/ledger/ownership on rollback
- Read-model rebuilds on next request after re-enable
- Misconfigured flags (Camp on but Economy off) return 409 `hero_camp_misconfigured` — fail-closed

## Why This Matters

**Without preflight hardening:** Asset 404s in child UI, idempotency replay corruption (wrong monster owned), unreconcilable event logs.

**Without observability (measure-first):** Cannot detect if Hero Mode causes rushing or reward chasing. Stale-write spikes go undetected until support tickets arrive. No baseline for P7 decisions.

**Without rollback-preserves-dormant:** Emergency disable requires wiping all learner Hero state, losing progress and causing child frustration. Re-enablement requires re-earning from zero.

## When to Apply

- Feature-flag-gated system approaching production with state mutations
- Multiple health domains (learning, engagement, economy, technical) must align before wider rollout
- Command idempotency critical for spending/reservation systems
- Event reconciliation must be deterministic for analytics/audit/support
- Rollback must be instant and lossless at any layer in the flag hierarchy
- Assets/UI must degrade gracefully when backend state is unavailable

## Examples

### State Migration Hardening (56 adversarial tests)

```javascript
// v1 → v3 migration preserves daily + recentClaims, adds empty economy + heroPool
// v2 → v3 preserves economy, adds empty heroPool
// Corruption recovery:
// - NaN/negative/Infinity balance → 0
// - Unknown monsterIds → dropped from roster
// - Invalid stages (>4, <0, NaN) → clamped
// - Malformed ledger entries → dropped
// - Ledger retention cap (180) preserves current daily award marker
```

### Multi-Tab Safety

```javascript
// Two tabs invite same monster → second gets already_owned (200, idempotent)
// Two tabs grow same monster → second gets already_stage (200, idempotent)
// Two tabs spend on different monsters with stale revision → stale_write (409)
// Same requestId + different body → idempotency_reuse (409)
```

### Performance Bounds

```javascript
// Full v6 read model (6 monsters, 180 ledger entries) < 50KB
// Empty state read model < 8KB
// Shadow-only v3 < 5KB
// Child-safe ledger projection capped at 10 entries regardless of full ledger size
```

## Related

- [Hero P0: Read-Only Shadow Subsystem](./hero-p0-read-only-shadow-subsystem-2026-04-27.md) — Foundation pattern
- [Hero P1: Launch Bridge](./hero-p1-launch-bridge-subject-command-delegation-2026-04-27.md) — Shadow-to-production transition
- [Hero P2: Child-Facing Orchestrator Shell](./hero-p2-child-facing-orchestrator-shell-shadow-to-production-2026-04-28.md) — Three-layer architecture
- [Hero P3: Ephemeral Trust Anchor](./hero-p3-ephemeral-trust-anchor-claim-resolution-2026-04-28.md) — Idempotent progress tracking
- [Hero P4: Coins Economy](./hero-p4-coins-economy-capped-daily-award-2026-04-29.md) — State mutation + deterministic ledger
- [Hero P5: Calm Spending Surface](./hero-p5-calm-spending-surface-deterministic-debit-2026-04-29.md) — Economy completion + rollback pattern
- [Grammar QG P6: Calibration Telemetry](./grammar-qg-p6-calibration-telemetry-architecture-2026-04-29.md) — Event enrichment pattern origin
- [Punctuation QG P5: Production-Readiness Attestation](./punctuation-qg-p5-production-readiness-attestation-architecture-2026-04-29.md) — Telemetry manifest governance
- [Sys-Hardening P5: D1 Tail Latency & Evidence Culture](./sys-hardening-p5-certification-closure-d1-latency-and-evidence-culture-2026-04-28.md) — Capacity certification methodology
- [P3: Stability & Capacity Patterns](../best-practices/p3-stability-capacity-multi-learner-patterns-2026-04-27.md) — Measure-first-then-lock origin
