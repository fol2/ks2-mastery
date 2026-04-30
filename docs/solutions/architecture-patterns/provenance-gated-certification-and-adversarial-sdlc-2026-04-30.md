---
title: "Provenance-Gated Certification and Adversarial SDLC Pattern"
date: 2026-04-30
category: architecture_pattern
module: hero-mode-a-series
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - Certification evidence includes simulated or synthetic rows alongside real-production data
  - A delivery is infrastructure-only with no runtime behaviour change
  - Trust assertions depend on distinguishing real from simulated provenance
  - Multi-round adversarial review is needed to harden a pipeline before production gate
  - The cost of false-positive certification is high (child safety, privacy, financial)
tags:
  - provenance
  - certification
  - evidence-pipeline
  - adversarial-review
  - trust-inversion
  - infrastructure-only-delivery
  - privacy-hardening
  - hero-mode
---

# Provenance-Gated Certification and Adversarial SDLC Pattern

## Context

pA2 used a validator that counted ANY dated row equally:

```javascript
// pA2 anti-pattern — "trust all evidence equally"
const count = (content.match(/\|\s*(20\d{2}-\d{2}-\d{2})/g) || []).length;
// 5 simulation rows satisfy a gate requiring 5 observations
```

This is the "ceremony satisfies gate" anti-pattern: going through the motions of recording evidence passes certification without any real-production observations. Simulation rows, staging rows, and manual notes all counted identically to genuine production telemetry.

The pA3 delivery (Hero Mode A-series, KS2 Mastery) solved this with two complementary patterns:
1. **Provenance-gated certification** — evidence rows carry source classification; gates count only real-production
2. **Adversarial SDLC cycle** — implement → dispatch N independent adversarial reviewers → triage → fix → re-review until 0 findings

This doc captures both as reusable architectural patterns applicable beyond Hero Mode.

## Guidance

### Pattern 1 — Provenance-Gated Certification

Add a **Source** column to the evidence schema with an enum classification:

| Source value | Trust level | Satisfies `min_real_*` gates? |
|---|---|---|
| `real-production` | Highest | Yes |
| `staging` | Medium | No |
| `local` | Low | No |
| `simulation` | Lowest | No |
| `manual-note` | Annotation only | No |

Validator function returns separate counters per source type:

```javascript
function countObservationsByProvenance(content) {
  const rows = parseEvidenceTable(content);
  const counts = { realProduction: 0, staging: 0, local: 0, simulation: 0, manualNote: 0 };
  for (const row of rows) {
    const source = normaliseSource(row.source); // missing → 'simulation'
    counts[source]++;
  }
  return counts;
}
```

Gate conditions use `min_real_*` prefix that only counts `real-production` rows:

```javascript
const gate = { min_real_observations: 5 };
const counts = countObservationsByProvenance(content);
const pass = counts.realProduction >= gate.min_real_observations;
```

**Critical defaults (fail-closed):**
- Missing Source column on a row → defaults to `simulation` (lowest trust)
- Invalid `--source` CLI flag → defaults to `simulation` with stderr warning (NOT `real-production`)
- Empty string source → defaults to `simulation`

**Trust inversion** is the specific failure mode where invalid input receives the HIGHEST trust tier. This inverts the security model — an operator typo silently inflates real-production counts past certification gates.

```javascript
// WRONG — invalid input gets highest trust (trust inversion)
if (!VALID_SOURCES.includes(raw)) return 'real-production';

// CORRECT — invalid input gets lowest trust (fail-closed)
if (!VALID_SOURCES.includes(raw)) return 'simulation';
```

**Certification states** progress linearly:
- `NOT_CERTIFIED` — critical gates not met
- `CERTIFIED_WITH_LIMITATIONS` — critical gates pass but coverage gaps exist
- `CERTIFIED_PRE_A4` — all gates fully satisfied

### Pattern 2 — Adversarial SDLC Cycle

After initial delivery, dispatch N independent reviewers in parallel. Each holds ONE perspective and attempts to BREAK the implementation:

| # | Perspective | Focus |
|---|---|---|
| 1 | Correctness | Logic errors, off-by-one, wrong defaults |
| 2 | Security | Trust inversions, privilege escalation, injection, privacy bypasses |
| 3 | Testing | Coverage gaps, missing edge cases, brittle assertions |
| 4 | Reliability | Race conditions, crash paths, non-atomic operations |
| 5 | Architecture | Coupling, abstraction leaks, pattern violations |
| 6 | Performance | O(n^2) paths, unbounded allocations, missing indexes |
| 7 | Contract Compliance | Schema mismatches, spec drift, unmet requirements |
| 8 | Standards | Naming, file structure, lint rules, documentation conventions |
| 9 | Maintainability | Dead code, unclear names, unnecessary coupling |
| 10 | Adversarial | Construct attack scenarios that break the system |

The cycle:
```
Implement → Review(N) → Triage → Fix(parallel) → Re-Review(N) → ... → 0 findings
```

Convergence behaviour (observed from this delivery):
- Round 1: 10 issues found (column order mismatch caught by 6/10 — high consensus signal)
- Round 2: verification of Round 1 fixes
- Round 3: 3 minor validator tightening gaps
- Round 4: 10/10 PASS — zero findings

## Why This Matters

**Provenance prevents "ceremony satisfies gate"** — the failure mode where recording *any* observation passes certification regardless of whether real users ever encountered the system. When child safety, privacy, or financial correctness depends on evidence, a simulation row must never substitute for real-production observation.

**Adversarial review catches composition failures** — problems at the boundary between components that self-review systematically misses. Specific catches from this project:
- Column order mismatch between writer and parser (found independently by 6/10 reviewers — high consensus is the signal that the bug is real and severe)
- Trust inversion where invalid source defaulted to highest trust (security reviewer)
- Privacy bypass where MAX_DEPTH=10 allowed forbidden fields at depth 11+ (adversarial reviewer)
- P0 env secrets leakage through effectiveFlags in telemetry probe response (security reviewer)

**The cycle converges monotonically** — each round's finding count decreases when fixes are genuine. 10 → 3 → 0 demonstrates logarithmic convergence. The cost is bounded: N reviewers × rounds until convergence.

**Infrastructure-only delivery guarantees zero regression** — when all deliverables are scripts, docs, and tests (no runtime code changes), the blast radius is architecturally bounded. The system under observation remains untouched.

## When to Apply

**Provenance-gated certification:**
- Any certification gate where rehearsal data coexists with real data
- When the cost of false-positive certification is high (child safety, privacy, financial)
- When evidence accumulates over time and early rows predate production
- When multiple environments (local, staging, production) feed the same evidence store

**Adversarial SDLC cycle:**
- Multi-PR deliveries where quality assurance matters beyond "tests pass"
- When shipping to production without easy rollback
- When the feature surface is too large for one reviewer to hold in working memory
- When previous phases revealed that self-review missed critical issues

**Do NOT apply when:**
- Evidence is single-source (only production writes) — provenance adds ceremony without value
- The delivery is a single atomic PR with full test coverage — adversarial overhead exceeds benefit
- Risk is low and reversible — a feature flag revert is cheaper than 4 review rounds

## Examples

**Before (pA2) — trust all evidence equally:**
```javascript
function countObservations(content) {
  return (content.match(/\|\s*(20\d{2}-\d{2}-\d{2})/g) || []).length;
}
// 5 simulation rows → countObservations returns 5 → gate PASSES
// Result: CERTIFIED despite zero real-production data
```

**After (pA3) — provenance-gated:**
```javascript
function countObservationsByProvenance(content) {
  const rows = parseEvidenceTable(content);
  return rows.reduce((acc, row) => {
    acc[normaliseSource(row.source)] = (acc[normaliseSource(row.source)] || 0) + 1;
    return acc;
  }, {});
}
// Same 5 simulation rows → { simulation: 5, realProduction: 0 }
// Gate "min_real_observations: 5" FAILS
// Result: NOT_CERTIFIED
```

**Adversarial review convergence:**
```
Round 1: 10 reviewers → 10 findings (4 critical, 3 high, 3 medium)
  Fix: 3 parallel PRs (#731 security, #732 correctness, #733 reliability)
Round 3: 10 reviewers → 3 findings (validator tightening)
  Fix: 1 direct commit (manifest threshold, condition handler, status check)
Round 4: 10 reviewers → 0 findings
  Verdict: CERTIFIED
```

## Related

- [Evidence-Locked Production Certification (P9)](../architecture-patterns/evidence-locked-production-certification-2026-04-29.md) — parent pattern (evidence must exist)
- [Grammar QG P10 Evidence Quality over Existence](../architecture-patterns/grammar-qg-p10-evidence-quality-over-existence-2026-04-29.md) — sibling (evidence must have substance)
- [Hero pA2 Evidence Cohort Measurement](../architecture-patterns/hero-pA2-evidence-cohort-measurement-phase-2026-04-30.md) — predecessor (Section 2 partially superseded by provenance-gating)
- [Autonomous Certification Phase Wave Execution](../workflow-issues/autonomous-certification-phase-wave-execution-2026-04-27.md) — grandparent workflow framework
- [Admin Console P4 Hardening/Truthfulness](../architecture-patterns/admin-console-p4-hardening-truthfulness-adversarial-review-2026-04-27.md) — conceptual sibling (trust inversion patterns)
- Plan: `docs/plans/2026-04-30-004-feat-hero-pA3-real-cohort-evidence-hardening-plan.md`
- Completion report: `docs/plans/james/hero-mode/A/hero-pA3-plan-completion-report.md`
- PRs: #725, #726, #727, #730, #731, #732, #733
