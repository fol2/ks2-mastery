---
module: sys-hardening
date: 2026-04-28
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - running capacity certification against Cloudflare D1 under burst concurrent load
  - designing load-test infrastructure that must bypass per-IP rate limits
  - deciding whether to relax performance thresholds vs investigate platform characteristics
  - building evidence-driven certification gates that distinguish app code issues from platform behaviour
tags:
  - capacity-certification
  - d1-tail-latency
  - session-manifest
  - evidence-schema-v2
  - burst-load
  - rate-limit-bypass
  - cold-start
  - certification-closure
related_components:
  - database
  - testing_framework
---

# System Hardening P5 — Certification Closure, D1 Tail Latency, and Evidence Culture

## Context

P5 was a certification closure phase for a KS2 educational platform running on Cloudflare Workers + D1. The 30-learner classroom beta certification had failed in P4 (bootstrap P95 1,126 ms vs 1,000 ms ceiling, +12.6%). The hypothesis was "cold D1 statement cache after heavy deploy cycle". P5's job was to test that hypothesis with a warm-cache re-run and either certify or honestly document the blocker.

The 60-learner stretch preflight was separately blocked by test infrastructure — a single load-generator IP hitting the per-IP demo-session creation rate limit (`DEMO_LIMITS.createIp = 30`) before reaching the application measurement phase.

## Guidance

### 1. D1 Tail Latency is a Platform Characteristic, Not an Application Bug

P5's warm-cache re-run produced P95 1,167 ms (worse than P4's 1,126 ms) with:
- P50: 279 ms (healthy median)
- P95/P50 ratio: 4.2× (extreme tail variance)
- Query count: 12 (within budget ≤13)
- D1 rows read: 10 (minimal)
- Response bytes: 2,450 (tiny payload)

The warm-cache hypothesis was refuted. The root cause is D1's SQLite-over-network architecture producing latency spikes under burst concurrent access. A few requests in the 20-concurrent cold-bootstrap burst hit connection-pool or statement-cache initialisation delays.

**Key insight:** When P95 is 4× the P50 with minimal queries and tiny payloads, the bottleneck is network/platform latency variance, not application logic. Do not "fix" the application code for a platform characteristic.

### 2. Session-Manifest Mode Shifts the Rate-Limit Boundary

The single-IP rate-limit blocker was solved architecturally by separating **when sessions are created** from **when load is measured**:

```
Before (P4): Create 60 sessions → hit rate limit at session 31 → test aborts
After (P5):  Prepare manifest (separate step) → load driver uses pre-created sessions → no rate limit during test
```

The `--session-manifest` flag accepts a JSON array of pre-created `{learnerId, sessionCookie, createdAt, sourceIp}` objects. The load driver skips session creation entirely and measures only bootstrap + command routes.

The blocker shifted from "impossible" to "operational scheduling" — the manifest preparation is still per-IP rate-limited, but it's a separate preparatory step that can use multiple IPs or wait for window expiry.

### 3. Honest Failure Recording Preserves Certification Trust

P5 recorded `decision=fail` with exact measurements rather than:
- Relaxing the 1,000 ms threshold
- Retrying silently until getting a lucky run
- Changing the burst concurrency to avoid tail spikes
- Claiming "environmental" without evidence

Each honest failure adds data points. P4 and P5 together prove the regression is structural (not environmental), which reframes the next action from "retry" to "mitigate platform behaviour".

### 4. Cross-Assertion Tests Make Dead Constants Impossible

`CSP_ENFORCEMENT_MODE` existed for 2 phases without a runtime consumer. The P5 cross-assertion test mechanically enforces:
- If mode is `'enforced'`: header key MUST be `Content-Security-Policy`
- If mode is `'report-only'`: header key MUST be `Content-Security-Policy-Report-Only`
- Any other value: test FAILS (dead constant guard)

Pattern: any mode constant that gates a security-visible behaviour should have a test asserting the constant's value matches the actual runtime artefact (header, config, feature flag).

### 5. failureClass Taxonomy Separates Infrastructure from Application

The load driver now classifies every failure:

| Class | Meaning |
| --- | --- |
| `setup` | Session creation / manifest preparation failure |
| `auth` | 401/403 during test |
| `bootstrap` | Bootstrap route failure |
| `command` | Subject command failure |
| `threshold` | Budget/ceiling exceeded |
| `transport` | Network failure (status 0) |
| `evidence-write` | Evidence file I/O failure |

This prevents the P4 confusion where a `setup` failure (IP rate limit) was initially interpreted as an application capacity failure.

## Why This Matters

Without these patterns:
- Teams chase application code optimisations for platform latency problems (wasted engineering)
- Load tests conflate infrastructure limits with app capacity (wrong conclusions)
- Dead constants accumulate without mechanical enforcement (silent drift)
- Certification thresholds get relaxed under pressure (eroded trust)
- Honest failure data gets overwritten by "successful" retries (hidden risk)

With these patterns:
- Root causes are classified as app-code vs platform vs infrastructure
- Evidence culture compounds — each run adds signal regardless of pass/fail
- Load-test infrastructure evolves to match real classroom traffic patterns
- Mode constants are provably correct via test assertions
- The project can say "we know the blocker precisely" rather than "it was probably fine"

## When to Apply

- Running capacity certification against any database with variable latency (D1, PlanetScale, Neon, Turso)
- Designing load-test infrastructure that hits per-IP or per-identity rate limits
- Operating a threshold-gated certification regime where "retry until green" would erode trust
- Building security-header or feature-flag systems where mode constants gate runtime behaviour
- Separating "the code is slow" from "the platform has tail latency" in performance investigations

## Examples

### Before: P4 60-learner test (blocked)
```
$ npm run capacity:classroom -- --production --learners 60
Error: Session 31/60 — 429 Too Many Requests (DEMO_LIMITS.createIp = 30)
Decision: invalid (test never reached app measurement)
```

### After: P5 session-manifest mode (infrastructure ready)
```
$ node scripts/prepare-session-manifest.mjs --origin https://ks2.eugnel.uk --learners 60 --output manifests/60-learner.json
# (run from multiple IPs or after rate-limit window expiry)

$ npm run capacity:classroom -- --production --session-manifest manifests/60-learner.json --learners 60
# Driver skips session creation, measures bootstrap + command only
# Failures classified as bootstrap/command/transport — never conflated with setup
```

### Before: CSP mode constant with no consumer
```js
export const CSP_ENFORCEMENT_MODE = 'report-only'; // dead — nothing reads this
```

### After: Cross-assertion guard
```js
// test assertion
if (CSP_ENFORCEMENT_MODE === 'enforced') {
  assert.equal('Content-Security-Policy' in SECURITY_HEADERS, true);
  assert.equal('Content-Security-Policy-Report-Only' in SECURITY_HEADERS, false);
} else if (CSP_ENFORCEMENT_MODE === 'report-only') {
  assert.equal('Content-Security-Policy-Report-Only' in SECURITY_HEADERS, true);
  assert.equal('Content-Security-Policy' in SECURITY_HEADERS, false);
} else {
  assert.fail(`CSP_ENFORCEMENT_MODE has invalid value: ${CSP_ENFORCEMENT_MODE}`);
}
```
