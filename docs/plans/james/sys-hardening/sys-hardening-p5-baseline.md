# System Hardening Phase 5 — Certification Closure Baseline

> **Phase identity:** P5 is a certification closure phase, not a new hardening programme.

## Current Main Commit

| Field | Value |
| --- | --- |
| SHA | `d6cc388` |
| Branch | `origin/main` at worktree creation |
| Date | 2026-04-28 |

## Capacity Decision Status

**`small-pilot-provisional`**

30-learner certification is NOT certified. The P4-U11 run observed P95 bootstrap of 1,126.3 ms against a 1,000 ms ceiling (+12.6% over). The capacity claim remains at `small-pilot-provisional` until a passing 30-learner run lands.

Allowed capacity language during P5:

> "Small-pilot-provisional. 30-learner certification is blocked by bootstrap P95 evidence."

## P4 Residuals Accepted into P5

| Residual | Origin | Context |
| --- | --- | --- |
| Warm-cache 30-learner re-run | P4-U11 | Failed on bootstrap P95 (1,126.3 ms vs 1,000 ms ceiling). Cold-cache burst suspected; warm re-run needed to isolate root cause. |
| Multi-IP load driver for 60-learner | P4-U12 | Failed on single-IP demo-session rate limit (`DEMO_LIMITS.createIp = 30` per 10-minute window). Load-test infrastructure bottleneck, not production capacity. |
| CSP enforcement decision | P4-U7 | Observation window closes 2026-05-04. Enforcement flip lands only after 7+ days with zero unexpected blocking violations. |
| Bootstrap P95 investigation | P4-U11 | Only if warm re-run still fails — investigate whether cold D1 statement caches or Worker cold-start contribute to the regression. |

## P4 Residuals Deferred to P6

| Residual | Rationale for Deferral |
| --- | --- |
| Deeper `repository.js` pipeline decomposition for impure functions | Scope exceeds closure phase; requires architectural refactoring. |
| Full Admin KPI pre-aggregation instead of live counters | Not blocking any certification tier; current live COUNTs stay under D1 budget at present scale. |
| Adding ceilings to every admin endpoint with `meta.capacity` | Incremental hardening, not a certification blocker. |
| Debug-bundle capacity collector instrumentation | Observability enhancement, not a certification gate. |
| 100+ learner repeated runs | Requires multi-IP infrastructure that P5 multi-IP work enables; sequenced to P6. |
| Durable Object coordination analysis | Blocked on classroom-scale breaker telemetry signal; premature without data. |
| HSTS preload activation | DNS sign-off incomplete; requires subdomain audit across all `*.eugnel.uk` subdomains. |

## Post-P4 Changed Surfaces (Drift to Revalidate)

These surfaces changed on `main` after P4 completion and before P5 baseline. Any P5 capacity measurement must account for potential regressions introduced by these commits.

### Rewards (~6 commits)

- `reward-presentations.js` — presentation row enhancements
- Toast shelf migration
- Celebration queue
- Hero validation

### SEO (~3 commits)

- Practice landing pages
- AI-readable identity and measurement checks

### Grammar (~3 commits)

- Phase 7 QoL and debuggability
- Constructed response migration to answer specs
- QG P1 release

### Punctuation (~6 commits)

- Codex star latches
- Content audit CI gate
- Generated metadata transport policy
- P2 fixed anchor depth
- Star scoping
- Deterministic generator capacity expansion

## Phase Identity

P5 is a **certification closure** phase. Its purpose is to:

1. Close the 30-learner certification by re-running with warm cache and investigating bootstrap P95 if the regression persists.
2. Unblock the 60-learner preflight by delivering a multi-IP load driver.
3. Decide on CSP enforcement after the observation window closes.
4. Revalidate capacity claims against the post-P4 drift surfaces listed above.

P5 does NOT introduce new hardening infrastructure, new circuit breakers, new telemetry surfaces, or new operational runbooks. Any such work discovered during P5 execution is captured as a P6 residual.
