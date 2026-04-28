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

## Admin Capacity Residual Triage

### Certification-Critical Admin Routes (P5)

These Admin routes could theoretically affect learner-route performance if they share D1 connection pools or trigger heavy queries during capacity runs:

- `/api/admin/ops/kpi` — manual-refresh pattern (operator clicks to refresh, not live on every page load). Indexed queries via `readDashboardKpis`. Not blocking learner routes.
- `/api/admin/debug-bundle` — read-only diagnostic. Rate-limited at 10/min per session. Limitations: capacity collector bypass is documented but not fixed. Explicitly carried to P6.

### Routes NOT Certification-Critical (P5)

All other admin endpoints operate independently of learner routes during capacity certification runs (learner load uses demo sessions, not admin sessions).

### P6 Deferrals

- Full Admin KPI pre-aggregation (replace live counters with pre-computed values)
- Budget ceiling tests for all 14+ admin endpoints with `meta.capacity`
- Debug-bundle capacity collector instrumentation for raw DB aggregation
- Admin endpoint response-time budgets beyond the certification-critical set

### Verification

- No Admin route touched by P5 lacks access tests (verified by `tests/redaction-access-matrix.test.js` — covers parent, admin, ops roles across all route axes)
- Admin KPI live-count cost does not affect learner-route certification (admin sessions are not used during capacity runs)

## Post-P4 Drift Audit Results (2026-04-28)

Audit performed on commit `d6cc388` (latest origin/main at P5 start), rebased to `3d312cc` after merging U1 baseline.

### Audit Suite Results

| Audit | Result | Details |
| --- | --- | --- |
| Client bundle audit (`npm run audit:client`) | **PASSED** | 831 public files, 7 chunks scanned, main bundle 217,934 / 218,000 bytes gzip. All allowlisted tokens present and justified. |
| Production bundle audit (`npm run audit:production -- --skip-local`) | **PASSED** | 1 HTML-referenced bundle, 7 chunks transitively scanned, 19 direct paths, matrix demo check: ok, security-header checks: 5/5, cache-split checks: 12/12. |
| Multi-learner regression (`tests/worker-bootstrap-multi-learner-regression.test.js`) | **13/13 PASSED** | 4-learner account contract intact. Sibling compact state present. Not-modified invalidation working. Single-learner regression guard passing. |
| Query budget (`tests/worker-query-budget.test.js`) | **19/19 PASSED** | Bootstrap budget ≤13 queries. Admin role matrix (7 denied routes). Hero route budget. |
| Bootstrap capacity (`tests/worker-bootstrap-capacity.test.js`) | **3/3 PASSED** | High-history payloads bounded and redacted. Auth required. Capacity telemetry emitted. |
| Evidence schema v2 (`tests/capacity-evidence-schema.test.js`) | **14/14 PASSED** | requireBootstrapCapacity gate, NaN rejection, vacuous-truth guard, tier-schema mapping. |
| Security headers (`tests/security-headers.test.js`) | **ALL PASSED** | CSP cross-assertion (U6), HSTS preload gate, header drift checks. |

### Drift Assessment

**No regressions detected.** Post-P4 changes in rewards, SEO, Grammar, and Punctuation surfaces have not:

- Exposed private learner/admin/generated-answer/source data via public pages
- Weakened source lockdown (`/src/*`, `/shared/*`, `/worker/*`, `/tests/*`, `/docs/*`, `/legacy/*` still denied)
- Introduced reward presentation replay mutations
- Added Hero economy mutations
- Widened bootstrap payloads beyond P4 evidence baselines (response bytes: 34,919 B for full bootstrap, well within 600,000 B budget)
- Broken multi-learner bootstrap correctness (all 4-learner account contract assertions pass)
- Violated query budgets (bootstrap ≤13, command ≤13)

### Capacity Impact

Bootstrap response bytes for a high-history 3-learner account: **34,919 B** (vs P4 evidence of 36,852 B max). No material payload growth from post-P4 changes. The reward presentation, SEO, and Grammar/Punctuation changes are client-side rendering or worker-side write-path only — they do not add bootstrap-path queries.

### Conclusion

Current main is safe for capacity certification attempts. No drift-related blocker exists for the 30-learner re-run.
