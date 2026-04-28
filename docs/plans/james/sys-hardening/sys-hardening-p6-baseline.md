# System Hardening P6 — Baseline and Drift Record

**Phase:** P6 — Capacity Certification and Operations Handover
**Recorded:** 2026-04-28T22:36:59Z
**Branch:** `codex/sys-hardening-p6-capacity`
**Current main commit:** `d1e0be7756f94fb008b049720e5f919a5a746c33` (`docs(admin): add P5 completion report — operator readiness, evidence, and QoL (#537)`)
**P5 reported final commit:** `7ea8a0074544b84399a9c02fe13abdd9b0a6834b` (`capacity(evidence): record 60-learner preflight status — infrastructure ready, manifest prep rate-limited`)
**Implementation plan:** `docs/plans/2026-04-28-006-fix-p6-capacity-certification-handover-plan.md`

This record is the P6 starting point. It captures current `main` before any P6 bootstrap mitigation, certification rerun, CSP decision, HSTS activation, or Admin evidence follow-up is attempted.

## Baseline Summary

| Surface | Baseline status |
| --- | --- |
| Git ancestry | `d1e0be77` is 14 commits ahead of the P5 reported final commit `7ea8a00`; `7ea8a00` is an ancestor of current `main`. |
| 30-learner classroom beta | **Not certified.** Latest P5 warm-cache production evidence fails only `maxBootstrapP95Ms`: 1,167.4 ms observed vs 1,000 ms configured. |
| 60-learner stretch | **Not certified.** Current preflight evidence is a named setup/infrastructure blocker and did not reach application bootstrap or command load. |
| Public capacity decision | Remains `small-pilot-provisional` until new schema-v2 evidence passes the 30-learner release gate. |
| CSP enforcement | **Deferred by date gate.** Observation window is open from 2026-04-27T00:00:00Z to 2026-05-04T00:00:00Z; the daily log is still unpopulated. |
| HSTS preload | **Deferred by operator gate.** `HSTS_PRELOAD_ENABLED` remains `false`; DNS-zone enumeration and sign-off are incomplete. |
| Admin production evidence | Present as a P5 panel/model. P6 replaces the placeholder summary with generated failed/non-certifying metrics, and the panel must continue to fail closed on stale or diagnostic evidence. |
| Worktree hygiene | Behavioural mitigation work starts from `origin/main`; the only pre-mitigation local addition is the P6 implementation plan and this baseline record. |

## Post-P5 Drift Since `7ea8a00`

The current branch contains 14 commits after the P5 reported final commit. The drift is documentation-heavy, with several Admin and Punctuation product surfaces added after the original P5 capacity closure.

| Area | Current drift | P6 interpretation |
| --- | --- | --- |
| P5/P6 documents | Added P5 completion report, P6 contract, Admin Page P5 report, Punctuation QG P2 report, and the D1 latency evidence-culture solution note. | These are source-of-truth updates, not runtime behaviour changes. P6 must reconcile against them. |
| Capacity evidence summary | Added `scripts/generate-evidence-summary.mjs`; P6 replaces the placeholder `reports/capacity/latest-evidence-summary.json` with generated failed/non-certifying metrics. | Needs P6 truth pass so failing/blocked/diagnostic evidence cannot look like success or absence. |
| Admin Production Evidence | Added `admin-production-evidence` model, React panel, and tests. | Good taxonomy exists; P6 must ensure current evidence summary feeds it honestly. |
| Admin support incident flow | Added incident flow model/UI/tests and Worker admin app wiring. | Admin-only drift; no learner-route certification claim depends on it, but Admin residuals stay in the P6 ledger. |
| Admin marketing/content QoL | Added/changed marketing edit, scheduling truth, subject drilldown actions, fixtures, destructive confirmation, and Debug Bundle UI tests. | Admin-only/product-support drift. P6 should avoid broad UI churn unless evidence panels need truth wording. |
| Punctuation production | Updated Punctuation read models, star projection, release smoke, and production smoke script. | Subject product drift. P6 characterization tests must ensure bootstrap and learner-state contracts still hold. |
| Worker route wiring | `worker/src/app.js` changed for Admin support/marketing surfaces after P5. | Route-level drift exists, but there is no evidence it changes `/api/bootstrap` capacity yet. Query-budget and bootstrap-capacity tests remain required before certification. |

## Evidence Snapshot

| Evidence file | Status | Key reading |
| --- | --- | --- |
| `reports/capacity/evidence/30-learner-beta-v2-20260428-p5-warm.json` | Fail | 30 learners, 20 bootstrap burst, production, zero 5xx/network/signals, bootstrap P95 1,167.4 ms, command P95 409.7 ms, bootstrap query count 12, D1 rows read 10. |
| `reports/capacity/evidence/30-learner-beta-v2-20260428.json` | Fail | Earlier 30-learner production run, bootstrap P95 1,126.3 ms, same single threshold class. |
| `reports/capacity/evidence/60-learner-stretch-preflight-20260428-p5.json` | Non-certifying setup blocker | Did not reach application load; current shape cannot certify 60 learners. |
| `reports/capacity/evidence/60-learner-stretch-preflight-20260428.json` | Non-certifying setup blocker | Earlier preflight blocker; retained for history only. |
| `reports/capacity/latest-evidence-summary.json` | Generated summary | P6-generated schema-v2 summary currently reports the latest 30-learner evidence as failed and the latest 60-learner evidence as non-certifying; regeneration must not promote stale or diagnostic evidence. |

## Current Decision Gates

### 30-Learner Gate

P6 starts from a real failure, not an ambiguous gap. The next valid promotion requires new schema-v2 evidence that:

- runs against production or an explicitly accepted equivalent release gate;
- uses the pinned `reports/capacity/configs/30-learner-beta.json` threshold config;
- preserves zero 5xx, zero network failures, zero hard capacity signals, command P95 under 750 ms, max response bytes under 600,000, and bootstrap P95 under 1,000 ms;
- preserves multi-learner correctness and writable learner state; and
- records the new commit SHA and evidence path.

### 60-Learner Gate

The current 60-learner files are preflight records only. P6 can claim progress only if the run reaches `/api/bootstrap` and subject-command load, or if it fails with a new named blocker that is not the demo-session setup bucket.

### CSP Gate

No P6 PR on 2026-04-28 can honestly flip CSP enforcement. The documented observation window closes on 2026-05-04T00:00:00Z and the daily log is still placeholder data. P6 can only preserve the gate and produce a dated deferral unless a later run after 2026-05-04 supplies the required log and sign-off.

### HSTS Gate

No P6 PR can honestly enable preload without operator DNS enumeration and sign-off. The baseline keeps `HSTS_PRELOAD_ENABLED = false` and treats preload as an operator-gated follow-up.

## Baseline Verification

The following characterization run passed before any P6 bootstrap mitigation or evidence-summary change:

```sh
node --test tests/worker-bootstrap-multi-learner-regression.test.js tests/worker-query-budget.test.js tests/worker-bootstrap-capacity.test.js tests/capacity-evidence-schema.test.js tests/security-headers.test.js
```

Result on 2026-04-28T22:37Z: **PASS** — 99 tests passed, 0 failed.

The P6 mitigation and evidence PRs must continue to pass these characterization suites before any certification claim:

| Suite | Purpose |
| --- | --- |
| `node --test tests/worker-bootstrap-multi-learner-regression.test.js` | Protects multi-learner bootstrap correctness and compact/writable learner-state behaviour. |
| `node --test tests/worker-query-budget.test.js` | Protects route query budgets, including bootstrap and Admin capacity residuals. |
| `node --test tests/worker-bootstrap-capacity.test.js` | Protects `meta.capacity.bootstrapCapacity` and authenticated bootstrap capacity semantics. |
| `node --test tests/capacity-evidence-schema.test.js` | Protects evidence schema-v2 compatibility. |
| `node --test tests/security-headers.test.js` | Protects CSP/HSTS gate semantics. |

## P6 Non-Goals At Baseline

- Do not relax the 30-learner threshold inside a mitigation PR.
- Do not certify 60 learners from setup-blocked preflight files.
- Do not bypass production rate limits by spoofing client IPs.
- Do not flip CSP before the observation window and operator sign-off criteria are satisfied.
- Do not enable HSTS preload without a completed DNS audit and operator sign-off.
- Do not decompose `worker/src/repository.js` or run 100+ learner probes until the 30-learner and 60-learner gates are settled.
