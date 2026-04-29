---
title: Validation-Phase Architecture with Per-Account Flag Override
date: 2026-04-29
category: architecture-patterns
module: hero-mode
problem_type: architecture_pattern
component: development_workflow
severity: medium
tags:
  - hero-mode
  - feature-flags
  - per-account-override
  - validation-phase
  - rollout-safety
  - ring-based-rollout
applies_when:
  - A feature has completed production hardening but requires operational evidence before general availability
  - Ring 4 internal testing needs per-account enablement without exposing the feature to all users
  - A validation-only phase (no new functionality) must be tracked as a distinct engineering milestone
  - Route pre-gates or feature gates need bypass mechanisms scoped to specific test accounts
---

# Validation-Phase Architecture with Per-Account Flag Override

## Context

When a complex feature stack has been built across multiple phases (P0–P6 in Hero Mode's case), the team faces pressure to ship immediately. However, production rollout of a multi-flag, multi-surface feature carries risk that unit tests alone cannot mitigate. The question becomes: how do you prove operational safety without adding new features, and how do you structure that proof work so it does not contaminate the feature branch history?

Hero Mode pA1 solved this by starting a new "A-series" (assurance series) after P6's production hardening, delivering 84 new tests, a staging smoke script, browser QA journeys, and a per-account override mechanism across 10 PRs — all without adding new gameplay, earning mechanics, or mutations.

## Guidance

### Start a New Series Identifier

Rather than continuing P-series numbering (P7, P8...), start a new series (A1, A2...) that communicates intent: no new behaviour, only evidence gathering. This prevents scope creep — when the phase explicitly forbids new behaviour, every change is a bug fix or evidence artefact.

### Structure Validation as Concentric Rings

Each ring increases blast radius with a gate between:

| Ring | Purpose | Evidence |
|------|---------|----------|
| 0 | Documentation drift reconciliation | Docs match implementation |
| 1 | Local/dev seeded validation | Flag ladder, parity, state preservation |
| 2 | Staging seeded smoke | Telemetry probe, browser QA |
| 3 | Staging multi-day soak | Timer-dependent bugs, daily resets |
| 4 | Internal production | Real infrastructure, team accounts only |

### Per-Account Flag Override

For Ring 4, implement a minimal override rather than toggling global flags:

```javascript
// shared/hero/account-override.js
export function resolveHeroFlagsWithOverride({ env, accountId }) {
  let parsed;
  try { parsed = JSON.parse(env.HERO_INTERNAL_ACCOUNTS || '[]'); }
  catch { return env; }
  if (!Array.isArray(parsed) || !parsed.includes(accountId)) return env;
  return {
    ...env,
    HERO_MODE_SHADOW_ENABLED: 'true',
    HERO_MODE_LAUNCH_ENABLED: 'true',
    HERO_MODE_CHILD_UI_ENABLED: 'true',
    HERO_MODE_PROGRESS_ENABLED: 'true',
    HERO_MODE_ECONOMY_ENABLED: 'true',
    HERO_MODE_CAMP_ENABLED: 'true',
  };
}
```

Constraints:
- **Additive-only**: force-enables for listed accounts, never force-disables
- **Secrets-based**: account list in environment JSON, not in code
- **Pure function**: no side effects, testable in isolation
- **Applied before pre-gates**: critical ordering constraint (see below)

### Critical Pattern: Override Before Pre-Gate

Route pre-gates that check raw `env` flags before authentication will bypass the override entirely:

```javascript
// BROKEN — override unreachable (pre-gate rejects before auth)
router.post('/api/hero/command', (req, env) => {
  if (!envFlagEnabled(env.HERO_MODE_LAUNCH_ENABLED)) return respond(404);
  const session = await authenticate(req, env);
  const resolvedEnv = resolveHeroFlagsWithOverride({ env, accountId: session.accountId });
  // ... never reached for override accounts when global flags are off
});

// FIXED — authenticate first, then resolve, then gate
router.post('/api/hero/command', async (req, env) => {
  const session = await authenticate(req, env);
  const heroCommandEnv = resolveHeroFlagsWithOverride({ env, accountId: session.accountId });
  if (!envFlagEnabled(heroCommandEnv.HERO_MODE_LAUNCH_ENABLED)) return respond(404);
  // ... handler uses heroCommandEnv for all flag checks
});
```

### Launchability Parity Proof

When providers emit task types that adapters don't support, prove the gap is safe:

1. Enumerate all types each provider can emit
2. Enumerate all types each adapter accepts
3. For mismatches, prove: (a) a fallback always produces a launchable type, (b) client skips non-launchable, or (c) all-non-launchable disables the CTA

```javascript
// Grammar emits mini-test but adapter only supports smart-practice/trouble-practice
// Safe because: fallback always emits smart-practice when no specific intent matches
test('Grammar always has at least one launchable task', () => {
  const readModel = { stats: { concepts: { total: 5, secured: 5, weak: 0, due: 0 } } };
  const result = grammarProvider(readModel);
  const launchable = result.envelopes.filter(e =>
    mapToSubjectPayload(e).launchable
  );
  assert(launchable.length > 0);
});
```

## Why This Matters

Separating validation from feature work produces three concrete benefits:

1. **Prevents scope creep** — when the phase explicitly forbids new behaviour, review is trivial: "is this a fix or evidence artefact? If not, reject."

2. **Ring gates provide abort points** — if Ring 2 reveals a timing bug, fix it before exposing real users. Each ring is a decision point: proceed, hold, or rollback.

3. **Per-account override avoids binary risk** — production-fidelity testing without blast radius. Global flags stay off; only listed accounts see the feature.

The pre-gate bypass discovery illustrates the value: the override was correctly implemented but unreachable because route middleware rejected requests before the override activated. Only by running Ring 1 validation against the actual request path (not just unit-testing the override function) was this caught — by a security review agent running after the implementation.

## When to Apply

Use this pattern when:

- The feature spans 3+ flags or feature gates that interact
- The feature touches both read paths and command/write paths
- Production rollout will be progressive (not a single global flip)
- The team needs to validate on real infrastructure before external exposure
- No existing staging environment perfectly mirrors production data shapes

Do not use for single-flag features or features where a simple A/B percentage rollout provides sufficient safety.

## Examples

### pA1 Implementation Metrics

| Metric | Value |
|--------|-------|
| PRs merged | 10 (plan + 9 units) |
| New tests | 84 |
| Test regressions | 0 |
| Production code files modified | 3 (app.js, read-model.js, launch.js) |
| New shared module | 1 (account-override.js) |
| Evidence templates produced | 4 (Ring 2, 3, 4, recommendation) |
| Security findings caught by review | 1 (pre-gate bypass) |
| CI failures | 0 |

### Ring 0 Drift Found

The rollout playbook referenced a `hero_progress` table that doesn't exist — authoritative state lives in `child_game_state` with `system_id = 'hero-mode'`. Documentation drift is a leading indicator of operational misunderstanding. Fix it first.

### Ring 1 Parity Matrix

| Subject | Provider Emits | Adapter Supports | Gap | Safe? |
|---------|---------------|------------------|-----|-------|
| Spelling | smart-practice, trouble-practice, guardian-check | All 3 | None | Yes |
| Grammar | smart-practice, trouble-practice, mini-test | smart-practice, trouble-practice | mini-test | Yes (fallback) |
| Punctuation | smart-practice, trouble-practice, gps-check | All 3 | None | Yes |

## Related

- `docs/solutions/architecture-patterns/hero-p4-coins-economy-capped-daily-award-2026-04-29.md` — P4 economy pattern (D1 atomicity, three-tier idempotency)
- `docs/plans/james/hero-mode/A/hero-mode-pA1.md` — origin contract for this validation phase
- `docs/plans/james/hero-mode/A/hero-pA1-plan-completion-report.md` — full implementation report
- `docs/plans/james/hero-mode/hero-mode-p6-rollout-playbook.md` — rollout ring definitions
- PRs: #614 (telemetry probe), #616 (parity audit), #620 (override), #627 (pre-gate fix)
