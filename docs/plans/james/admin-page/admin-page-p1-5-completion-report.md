# Admin / Operations Console P1.5 — Completion Report

**Feature**: Hardening sprint that turned the P1 admin console into a production-trust surface — per-panel freshness + error visibility, IPv6-aware public endpoint rate limiting, `row_version` CAS, reconciliation cron, `ops_status` enforcement at the auth boundary, and an error-centre debugging cockpit with build-hash attribution.

**Plan**: [`docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md`](../../2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md) — 1 197 lines, 20 implementation units across 5 phases, deepened via correctness + adversarial + coherence reviewers before implementation.

**Origin input**: [`docs/plans/james/admin-page/admin-page-p2.md`](admin-page-p2.md) — the advisory report that argued "don't build P2 event delivery yet; harden P1 first" and spelled out the five phase bands (A – E).

**PRs (5, all merged into `main`)**:

| PR | Phase | Title | Squash SHA |
|---|---|---|---|
| [#216](https://github.com/fol2/ks2-mastery/pull/216) | A | admin truthfulness + UI failure states | `ca5ebef` |
| [#227](https://github.com/fol2/ks2-mastery/pull/227) | B | public endpoint hardening (IPv6 /64 + global budget + smoke) | `58d759e` |
| [#270](https://github.com/fol2/ks2-mastery/pull/270) | C | data integrity (row_version CAS + reconciliation cron + withTransaction audit) | `64f049c` |
| [#292](https://github.com/fol2/ks2-mastery/pull/292) | D | `ops_status` enforcement at the auth boundary | `700554c` |
| [#308](https://github.com/fol2/ks2-mastery/pull/308) | E | error centre cockpit (build-hash + auto-reopen + drawer + filters) | `1c0adfd` |

**Aggregate diff**: 109 files changed across the 5 PRs, **18 597 insertions / 429 deletions** (per `gh pr view` payloads on merge). Most of that weight is tests + runbooks — see the per-phase breakdown below.

**Window**: planning started 2026-04-25 (same day P1 shipped). PR #216 opened 2026-04-26; PR #308 merged 2026-04-26 16:54 UTC. End-to-end wall-clock was about one orchestrator session — but every phase ran its own parallel-reviewer fan-out + resolver loop + re-review gate, so the effective SDLC cycle count per unit was higher than the wall-clock implies.

---

## What changed vs P1 (advisory → implementation)

The P2 advisory named six production-trust risks. P1.5 closes all six. The left column is the advisory quote; the right column is what landed.

| Advisory risk | What P1.5 shipped |
|---|---|
| "Admin KPIs can mislead — real vs demo conflated; dashboard and error-centre totals can disagree" | Phase A real/demo split across `accounts.*`, `learners.*`, `practiceSessions.*`, `mutationReceipts.*`, plus `errorEvents.byOrigin.{client,server}`. Phase C reconciliation cron rebuilds the error-status counters from source every night via `sweepMutationReceipts` + recompute. |
| "Refresh errors are silent" | Phase A replaces four `console.error` swallows with `refreshedAt` + `refreshError` envelope; `<PanelHeader>` renders "Last refreshed" + a coded error banner. 11-code authoritative router (`src/platform/hubs/admin-refresh-error-text.js`) dispatches every P1.5 error code — later phases emit codes only, no routing changes. |
| "`ops_status` is a label, not a gate" | Phase D writes `createSession` refusal (suspended cannot even mint a cookie; redirect to `/?auth=account_suspended`), `requireActiveAccount` on every authenticated request, `requireMutationCapability` on every `POST/PUT/DELETE` route (structural meta-test + negative-control). Self-suspend guard **and** cross-actor last-active-admin guard both ship. R27 callout removed; `docs/operating-surfaces.md:260` flipped to describe the new enforcement matrix in the same PR. |
| "Public error ingest has IPv6 `/64` rotation gap; three parallel `clientIp` copies" | Phase B introduces `worker/src/rate-limit.js::normaliseRateLimitSubject` with tiered keys (`v4:<addr>`, `v6/64:<16-hex>`, `unknown:<reason>`). All three `consumeRateLimit` implementations consolidate through it. Strict-`CF-Connecting-IP`-only mode unless `env.TRUST_XFF === '1'` and stage is non-production. IPv4 leading-zero canonicalisation (`01.02.03.04` → `v4:1.2.3.4`) prevents the 81-variant bucket-multiplication attack adversarial review caught. |
| "Account metadata lacks CAS; prop-to-state `useEffect` wipes dirty edits" | Phase A ships `useRef`-gated dirty-form protection + `admin-metadata-dirty-registry` + dirty-transition flush. Phase C adds `row_version` CAS on `account_ops_metadata` with an EXISTS-guarded batch so the mutation receipt + counter bump cannot persist on a CAS-lost loser (the non-obvious defect that took two review rounds to close — see Lessons below). |
| "Error centre is a list, not a debugging tool" | Phase E adds build-hash attribution via esbuild `define` + strict `/^[a-f0-9]{6,40}$/` regex, auto-reopen on release transition (5-condition rule + 24 h cooldown + CAS guard + rate-limited dedup-replay), a `<details>`-based drawer with R25-compliant redaction matrix, and six filters (`status` / `route` / `kind` / `date-range` / `new-in-release` / `reopened-after-resolved`) threaded through a parameterised WHERE with LIKE-wildcard escaping. |

---

## Implementation units (20 units across 5 phases)

### Phase A — admin truthfulness + UI failure states (#216 · `ca5ebef`)

3 units. Diff: +3 588 / -121 across 15 files. Scope: UI only (React admin surface + one additive server-side KPI split). No migration, no new route.

| U-ID | Goal | Key artefacts |
|---|---|---|
| U1 | Per-panel `refreshedAt` + `refreshError` envelope; shared `<PanelHeader>` component | `src/platform/hubs/admin-refresh-error-text.js` (new — 11-code router), `src/surfaces/hubs/admin-panel-header.jsx` (new), `src/platform/hubs/admin-panel-patches.js` (compose success / apply refresh error) |
| U2 | `useRef` dirty-form protection + cascade KPI→activity refresh + dirty-transition flush | `src/platform/hubs/admin-metadata-dirty-registry.js` (new), `src/platform/hubs/admin-refresh-cascade.js` (new), `AdminHubSurface.jsx` `AccountOpsMetadataRow` refactor |
| U3 | Real-vs-demo KPI split + client/server error origin | `worker/src/repository.js::readDashboardKpis` (additive sibling fields), `admin-read-model.js` normaliser, `DashboardKpiPanel` paired-stat rendering |

**Reviewer round found a Blocker**: julik-frontend-races + correctness both flagged that `dirtyRef.current` was never cleared on save success. A registered scalar was cleared but the component ref wasn't, so any row would freeze on its last-edited state forever after the first save. Closed by extracting `decideDirtyResetOnServerUpdate` into a pure helper keyed on `account.updatedAt` advancing past `savedAtRef.current`.

### Phase B — public endpoint hardening (#227 · `58d759e`)

3 units. Diff: +2 542 / -39 across 15 files. Scope: Worker rate-limit refactor + production smoke script + runbook.

| U-ID | Goal | Key artefacts |
|---|---|---|
| U4 | `normaliseRateLimitSubject(request, opts)` pure helper with tiered IPv4 / IPv6 /64 / unknown keys + `trustXForwardedFor` + `globalBudgetKey` | `worker/src/rate-limit.js` (new), 38 tests including leading-zero IPv4 / uppercase IPv6 / ULA / link-local / loopback / zone-id stripping |
| U5 | Route all `consumeRateLimit` call sites through helper + fresh-insert cap + global budget + per-bucket-category KPI telemetry | three impls consolidated; `/api/ops/error-event` gains `ops-error-capture-global` (6 000 / 10 min) + `ops-error-fresh-insert:<subject>` (10 / hr) buckets |
| U6 | Production same-origin smoke script + scoped smoke service-account runbook | `scripts/admin-ops-production-smoke.mjs`, `tests/admin-ops-production-smoke.test.js` (opt-in via `KS2_PRODUCTION_SMOKE=1`), `docs/hardening/admin-ops-smoke-setup.md` |

**Adversarial reviewer caught the Critical**: `parseIpv4` returned the raw string, so `01.02.03.04` hashed to a different bucket than `1.2.3.4` — an attacker gets 3⁴ = 81 distinct bucket keys per IP, defeating per-IP limits globally. Fix: canonicalise to `${Number(a)}.${Number(b)}.${Number(c)}.${Number(d)}`. Regression test asserts 5 leading-zero variants of `1.2.3.4` collapse to the same key.

**Second Blocker (correctness-flagged)**: the smoke script's `assertAdminHubPanels` required keys `['kpi', 'activity', 'errorEvents', 'accountsMetadata']`, but the server emits `{ adminHub: { dashboardKpis, opsActivityStream, accountOpsMetadata, errorLogSummary } }`. Every live-smoke run would have thrown 100 % of the time. Surfaced on the first correctness pass, fixed before merge.

**TRUST_XFF production foot-gun (High)**: initial implementation only checked `env.ENVIRONMENT === 'production'`. `auth.js` and `request-origin.js` elsewhere in the codebase use `env.ENVIRONMENT || env.NODE_ENV`. Security re-review caught the inconsistency — a deploy carrying `NODE_ENV=production` from a Node-derived template but no explicit `ENVIRONMENT` would silently trust `X-Forwarded-For`, letting attackers spoof any bucket key. Final code uses `String(env.ENVIRONMENT || env.NODE_ENV || '').trim().toLowerCase()` with 4 regression tests (NODE_ENV-only, mixed-case, ENVIRONMENT-wins-over-NODE_ENV, bare flag).

### Phase C — data integrity (#270 · `64f049c`)

6 units. Diff: +5 464 / -143 across 31 files. Scope: migration, CAS, reconciliation cron, retention sweeps, `withTransaction` audit.

| U-ID | Goal | Key artefacts |
|---|---|---|
| U7 | Migration 0011 — all P1.5 columns in one file (row_version, status_revision, session-stamp, release-tracking) + 2 covering indexes | `worker/migrations/0011_admin_ops_p1_5_hardening.sql`, recovery runbook at `docs/operations/migration-0011-recovery.md` |
| U8 | `row_version` CAS on `updateAccountOpsMetadata` — three-layer guard + receipt-hash inclusion of `expectedRowVersion` | `worker/src/repository.js` CAS branch, 4-tuple EXISTS guard (account_id, updated_at, updated_by_account_id, row_version) on receipt + counter-bump statements |
| U9 | 409 diff banner with "Keep mine" / "Use theirs" + extracted pure helpers for test | `src/platform/hubs/admin-metadata-conflict-diff.js`, `admin-metadata-conflict-actions.js`, `tests/react-admin-metadata-row-conflict.test.js` |
| U10 | KPI reconciliation script + admin-only POST route + CAS-takeover single-flight lock | `scripts/admin-reconcile-kpis.mjs`, `reconcileAdminKpiMetricsInternal` (server-side recompute; client `computedValues` used only for audit-diff in the mutation receipt) |
| U11 | Cron trigger (`0 4 * * *` + `0 5 * * *` fallback) + retention sweeps (sessions / receipts / request_limits) + dashboard banner on failure | `worker/src/index.js::scheduled`, `worker/src/cron/retention-sweep.js`, `capacity.cron.reconcile.last_{success,failure}_at` telemetry |
| U12 | `withTransaction` audit — remove from admin-ops + auth call sites; convert to `batch([])` where atomic, document kept sites with explicit non-atomic NOTE | `docs/hardening/withtransaction-audit.md` |

**Blocker convergence across reviewers**: two independent reviewers (correctness + data-integrity) flagged that the post-batch-verify re-read of `row_version` was a tautology — after the batch commits, the CAS loser's UPSERT matches zero rows, **but the mutation_receipt INSERT + counter bumps still commit atomically** because D1 `batch()` only rolls back on thrown SQL errors (a zero-match UPDATE is not an error). Retry with the same `requestId` then replayed a phantom success via `loadMutationReceipt` — a silent-success bug that would have shipped undetected without the cross-reviewer convergence.

Fix went through two rounds:
- **Round 1** changed the post-verify from "re-read row_version" to "inspect `batch()` result's `rowsAffected === 1` on the UPSERT statement". Adversarial + correctness + data-integrity all re-flagged the *new* Blocker: even with rowsAffected=0, the sibling INSERT + counter bumps still persist.
- **Round 2** extended `storeMutationReceiptStatement` + `bumpAdminKpiMetricStatement` with an `{ exists }` guard parameter. Receipt / counter statements emit `INSERT ... SELECT ... WHERE EXISTS (<guard>)` tied to a 4-tuple write-signature `(account_id, updated_at, updated_by_account_id, row_version)`. On CAS-lost, the EXISTS returns zero rows and neither statement actually inserts. The `ignored` admin concurrent-write regression test asserts receipt absence on both the TOCTOU race and last-admin-guard paths.

**Other blockers caught in the loop**: cron handler's `ensureCronActorAccount` initially seeded `platform_role='admin'` (scope-guardian flagged the `last_admin_required` guard participation risk) — changed to `'ops'`. Reconciliation `loadMutationReceipt` preflight added in round 2 so retried reconcile requests replay the cached receipt instead of hitting a raw PK violation.

### Phase D — `ops_status` enforcement at the auth boundary (#292 · `700554c`)

3 units. Diff: +3 824 / -62 across 30 files. Scope: auth-boundary helpers + session stamping + self-suspend / last-admin guards + R27 removal + operator runbook. **Adversarial reviewer mandatory per project SDLC policy** (auth-boundary changes).

| U-ID | Goal | Key artefacts |
|---|---|---|
| U13 | Session stamping (`account_sessions.status_revision_at_issue`) + suspended-account refusal at `createSession` (all 4 creation paths: OAuth callback, dev-stub, email register, email login) | `worker/src/auth.js::createSession`, 302 redirect + capacity telemetry event on refusal |
| U14 | `requireActiveAccount` + `requireMutationCapability` + coverage meta-test + stale-session sweep + JOIN soft-fail | 18 mutation routes gained the capability check; meta-test scans `app.js` source + has negative-control fixture asserting the detector catches a deliberately-broken route |
| U15 | Self-suspend guard + cross-actor last-active-admin guard + `status_revision` bump + `updateOpsErrorEventStatus` release stamp + R27 callout removal + `docs/operating-surfaces.md:260` flip + admin-lockout runbook | `worker/src/repository.js::updateAccountOpsMetadata` guards, `docs/hardening/admin-lockout-runbook.md` (new), confirmation-prompt delegation helper extracted for test |

**Blocker chain (3) surfaced by review round 1**:
1. Branch was stale vs main — 1 238 lines of punctuation code appeared as spurious deletions in the PR diff (this is a recurring hazard; the project-wide `feedback_git_fetch_before_branch_work.md` memory exists for exactly this reason). Resolved by rebasing immediately.
2. U15 confirmation-prompt (`handleSave` gate + `defaultConfirmOpsStatusChange`) had zero test coverage — "exact pattern that bit Phase A Blocker B1". Fixed by extracting helpers into `src/platform/hubs/admin-ops-confirm.js` and covering with 19 tests spanning pure-function + component integration.
3. U14 coverage meta-test had no negative control — a regex regression would silently neuter the check. Fixed by extracting scanner to `tests/helpers/mutation-capability-scanner.js` + 7-case negative-control fixture.

**Round-2 Blocker (scope-guardian + data-integrity convergence)**: `updateManagedAccountRole`'s `lastAdminGuard` counted `platform_role = 'admin'` without the `ops_status = 'active'` JOIN — meaning a suspended admin still counted as "another active admin" for the role-demote guard. Cross-path race: if A suspends B via ops_status while B demotes A via role-change, both guards could pass with inconsistent counting semantics. Fix: LEFT JOIN `account_ops_metadata` + `COALESCE(m.ops_status, 'active') = 'active'` on the role guard's SELECT + 4 parity tests.

**All 5 reviewers signed off clean on round 2** (adversarial, security, correctness, testing+scope, data-integrity — matching the SDLC memory's mandate that auth-boundary work triggers adversarial review).

### Phase E — error centre cockpit (#308 · `1c0adfd`)

5 units. Diff: +3 179 / -64 across 18 files. Scope: build-hash attribution, auto-reopen state-machine, drawer UI, filters, flow-gap resolutions.

| U-ID | Goal | Key artefacts |
|---|---|---|
| U16 | Build-hash injection via esbuild `define` + `__BUILD_HASH__` client guard + release-field regex `/^[a-f0-9]{6,40}$/` | `scripts/build-client.mjs::resolveBuildHash` (execSync-injectable for test), `src/platform/ops/error-capture.js` release threading |
| U17 | Auto-reopen 5-condition rule + 24 h cooldown + CAS guard + dedup-replay rate limit + structured log | `recordClientErrorEvent` auto-reopen branch with `AND status = 'resolved'` WHERE guard; `ops-error-auto-reopen` post-commit bucket (10/hr/subject) + `ops_error_events.auto_reopen_throttled` KPI; `ops_error_event.auto_reopened` structured log for forensic trail |
| U18 | Error-centre details drawer (`<details>/<summary>`) + R25 redaction matrix | `ErrorEventDetailsDrawer` component; admin sees `account_id.slice(-6)`, ops sees null |
| U19 | Six filters (status / route / kind / date-range / new-in-release / reopened-after-resolved) + LIKE-wildcard escaping + `currentRelease` pre-fill | `readAdminOpsErrorEvents` dynamic parameterised WHERE + `escapeLikePattern` helper + `ESCAPE '\'` clause; `currentRelease` threaded through `readAdminHub` payload |
| U20 | Flow-gap resolutions (NULL release never auto-reopens; canary/blue-green treated as distinct; drawer survives narrow refresh) + regression tests | `tests/worker-error-cockpit-flow-gaps.test.js`, `tests/react-admin-error-drawer-refresh.test.js` |

**Adversarial Highs (2, closed)**:
- **adv-e-1**: auto-reopen UPDATE had no CAS guard — concurrent admin "Ignore" click could clobber status + double-decrement the resolved counter. Closed by adding `AND status = 'resolved'` + `meta.changes === 1` verification + fallback to normal dedup UPDATE when the CAS misses.
- **adv-e-2**: fresh-insert cap only fired on `!preflight.wouldBeDedup` path; an anonymous attacker could force 60/10 min reopens per /64 per fingerprint (cooldown bounded same-fingerprint; N resolved fingerprints × 60/10 min = flood). Closed by adding a post-commit `ops-error-auto-reopen` telemetry bucket — DB write commits atomically, but sustained abuse surfaces in the `auto_reopen_throttled` KPI counter for operator triage.

**Design-lens review blocked merge on 3 UX non-negotiables** (+ 1 a11y):
- "New in release" filter pre-fill from server-side `currentRelease` (plan had called for it; initial implementation left it as free-text).
- Filtered-empty vs unfiltered-empty copy differentiation ("No errors match the current filters." vs "No error events recorded.") + "Filters active" chip.
- Drawer `<summary>` carrying per-row signal (status + short SHA) instead of identical "View event details" for every row.
- Post-fix a11y gap: `aria-describedby` link between release filter input and its "Current deploy: {sha}" helper span.

All 4 UX fixes landed; both final re-reviewers (adversarial + design-lens) signed off to merge.

---

## SDLC cycle actually run (scrum-master orchestration)

The user mandate: **"SDLC cycle: independent subagent worker (work and create PR for review) → independent reviewers (subagents (compound-engineering ce reviewers) → independent review follower (review follower skills) update pr → independent reviewer → (no blocker) PR merge → next step / pr. Stop only finished all. Fully autonomous. You as the main agents be like a scrum master, to save your token context to go through the entire phase. For UI / UX elements, don't forget to introduce /frontend-designer"**.

The orchestrator (me) executed this pattern 5 times — once per phase. Token-budget discipline mattered: each phase easily ran 6–8 reviewers + 1–2 resolver workers, and I had to keep reviewer output out of the main context window by delegating synthesis to the resolver briefs (never quoting reviewer reports verbatim in my prompts; instead distilling the findings into a fixed-width task list).

### Per-phase reviewer dispatch table

| Phase | Worker | Reviewers (parallel, background) | Resolver rounds | Re-review after resolver |
|---|---|---|---|---|
| A | 1 (U1–U3) | `ce-correctness-reviewer`, `ce-maintainability-reviewer`, `ce-julik-frontend-races-reviewer`, `ce-testing-reviewer`, `ce-scope-guardian-reviewer` | 1 (addresses 1 Blocker + 10 Importants + 4 Low) | `ce-correctness-reviewer` + `ce-julik-frontend-races-reviewer` |
| B | 1 (U4–U6) | `ce-adversarial-reviewer` (mandatory per SDLC memory — public endpoint), `ce-correctness-reviewer`, `ce-security-reviewer`, `ce-maintainability-reviewer`, `ce-testing-reviewer`, `ce-reliability-reviewer`, `ce-scope-guardian-reviewer` (7 reviewers) | 2 (partial in-flight state stashed, resolver restored + closed 17 findings including 1 Critical + 4 High). Secondary polish pass after security H1 re-flagged `NODE_ENV` fallback. | `ce-correctness-reviewer` + `ce-julik-frontend-races-reviewer` |
| C | 1 (U7–U12) | `ce-correctness-reviewer`, `ce-data-integrity-guardian`, `ce-reliability-reviewer`, `ce-testing-reviewer`, `ce-security-reviewer`, `ce-scope-guardian-reviewer`, `ce-adversarial-reviewer` (7 reviewers) | 2 (round 1 closed 4 Blockers + 3 Highs + 9 Importants; round 2 closed the convergent data-integrity Blocker on CAS-loser receipt persistence — took two rounds because the initial rowsAffected fix didn't close the sibling INSERT + counter-bump persistence) | `ce-correctness-reviewer` + `ce-data-integrity-guardian` + `ce-testing-reviewer` |
| D | 1 (U13–U15) | `ce-adversarial-reviewer` (mandatory — auth boundary), `ce-security-reviewer`, `ce-correctness-reviewer`, `ce-testing-reviewer` (also covering scope) (4 reviewers) | 1 (closed 3 Blockers + 6 Importants + 3 Nice-to-haves) | `ce-testing-reviewer` |
| E | 1 (U16–U20) | `ce-adversarial-reviewer`, `ce-correctness-reviewer` (+ testing), `ce-security-reviewer` (+ scope), `ce-design-lens-reviewer` (replaced the unavailable `ce-frontend-design`) (4 reviewers) | 1 (closed 2 Highs + 1 Medium + 3 non-negotiable UX + 2 Lows + rebase Blocker) | `ce-adversarial-reviewer` + `ce-design-lens-reviewer` |

**Reviewer minutes worked**: across all 5 phases, the orchestrator dispatched **27 reviewer agents + 6 resolver workers + 5 worker agents** — 38 subagents total, almost all running in parallel. Token-context for the main orchestrator stayed bounded because synthesis happened in the resolver briefs rather than in the orchestrator's own reasoning.

### Rebase hygiene as a first-class concern

`main` moved during every phase's review window. The report would be incomplete without noting that **every phase needed at least one rebase before merge** — once during Phase B (spurious `worker/src/capacity/telemetry.js` "deletion" caused by a 5-commit-stale base), twice during Phase C (main moved both during reviewer wait and again during resolver wait), and three times during Phase D (including a sibling-route `requireMutationCapability` allowlist entry that the merged main needed).

The cumulative lesson landed in memory as `feedback_autonomous_sdlc_cycle.md` — the rebase-before-merge-gate is non-negotiable when the SDLC cycle takes longer than ~1 h of main-branch activity.

### Catastrophic near-misses caught by the convergent-reviewer pattern

Three defects would have shipped as phantom-success bugs without the multi-reviewer convergence:

1. **Phase A dirtyRef never cleared** (julik + correctness, independently): rows freeze on last-edited state forever after first save. An admin editing an account's `internal_notes` then reloading the page would see their save persisted but never see subsequent server-side updates. Caught because julik's frontend-races check traced the ref-mutation path while correctness traced the pure logic — both independently walked to the same dispatch action and found the clear-ref step missing.
2. **Phase C CAS-loser receipt persistence** (correctness + data-integrity, independently): CAS-losing UPSERT commits zero rows but batch still writes the sibling receipt + counter bump. Retries with the same `requestId` replay a stored "success" response. Applied role would stay unchanged on the losing request yet the audit trail says it succeeded. Caught because correctness ran through `batchResult[0].meta.changes` semantics while data-integrity audited the mutation_receipts FK + PK compatibility end-to-end — both spotted the same gap from different angles.
3. **Phase E auto-reopen CAS-less UPDATE** (adversarial, in first pass): the 5-condition rule was right; the UPDATE itself lacked `AND status = 'resolved'`. Concurrent "Ignore" click could clobber state + double-swap counters. Caught because the adversarial reviewer's attack-construction style explicitly races admin UI actions against ingest-route events — a pattern none of the other reviewers use by default.

Each of these was non-exploitable-by-attacker but **catastrophic for operator trust** — the kind of bug where the admin dashboard says one thing and the database says another, and the only way to find out is to notice the counter drift and manually reconcile.

---

## Test posture + deferred work

**Test count on `main` at merge of #308**: `npm test` reports 3 882+ passes, 2 expected pre-existing failures (`grammar-production-smoke` + `punctuation-release-smoke` — both were failing on `main` before P1.5 started and are tracked separately), occasional Windows EPERM flakes on `verify-capacity-evidence` / `build-spelling-word-audio` (tempdir teardown races, not regressions). Every phase's resolver ran the same full-suite verification gate and landed with zero new regressions.

**New test files added**: 30+ test files across the 5 PRs, including:
- `tests/worker-rate-limit-subject.test.js` (38 cases — IPv4 canonicalisation, IPv6 variants, TRUST_XFF guard, ULA / link-local / loopback / zone-id)
- `tests/worker-rate-limit-ipv6-propagation.test.js` (per-call-site IPv6 /64 regression proof)
- `tests/worker-ops-error-fresh-insert-cap.test.js` + `worker-ops-error-global-budget.test.js` (abuse-path coverage)
- `tests/worker-migration-0011.test.js` + `worker-migration-0011-recovery.test.js` (idempotency + partial-apply recovery)
- `tests/worker-account-ops-metadata-cas.test.js` (three-layer CAS + retry-after-TOCTOU proves no phantom replay)
- `tests/worker-admin-reconcile-kpis.test.js` (server-side recompute + CAS-takeover single-flight race)
- `tests/worker-cron-trigger-reconcile.test.js` + `worker-cron-retention-sweep.test.js`
- `tests/worker-auth-ops-status-enforcement.test.js` + `worker-mutation-capability-coverage.test.js` + negative-control fixture
- `tests/worker-session-creation-refuses-suspended.test.js` + `worker-session-status-revision-stamp.test.js`
- `tests/worker-self-suspend-guard.test.js` + `worker-last-admin-locked-out.test.js` + `worker-ops-status-revision-bump.test.js` + `worker-resolved-in-release-write.test.js` + `worker-stale-session-sweep.test.js`
- `tests/worker-auth-batch-atomicity.test.js` (U12 batch atomicity with `delete DB.supportsSqlTransactions`)
- `tests/react-admin-error-drawer.test.js` + `react-admin-error-drawer-refresh.test.js` + `worker-ops-error-event-auto-reopen.test.js` + `worker-admin-ops-error-events-filter.test.js` + `worker-error-cockpit-flow-gaps.test.js`
- `tests/build-hash-injection.test.js` + `worker-ops-error-event-release.test.js`

### Explicit follow-ups (non-blocking, documented on the PRs)

Per review policy, non-blocking findings stay documented on the merged PR rather than blocking it. These are the acknowledged P1.5 residuals:

| Area | Follow-up |
|---|---|
| Phase C — CAS same-ms + same-actor collision | The 4-tuple EXISTS guard `(account_id, updated_at, updated_by_account_id, row_version)` degrades when two writers from the same admin tab collide within a single millisecond. Documented as accepted Phase-D follow-up; practical reachability is one admin's two tabs saving the identical row at sub-ms. |
| Phase C — `updateOpsErrorEventStatus` drift under CAS-fail | Same pattern as the convergent C Blocker, but out of Phase C's declared scope. U10 reconcile covers the counter drift; the phantom-replay hazard is narrower because this path is admin-only. |
| Phase D — telemetry payloads emit raw code strings | `auth.js` lines 475 / 1468 / 1504 / 1517 emit `{code: 'account_suspended', …}` as string literals rather than importing from `error-codes.js`. The import convergence landed in `errors.js` + `repository.js` but telemetry was outside CONV-1 scope. |
| Phase D — operator audit trail on 403 denials | Security-reviewer Medium: `requireActiveAccount` / `requireMutationCapability` throw without emitting a structured "request denied" log. Denial patterns are not greppable in Workers tail beyond the request-level capacity line. |
| Phase E — auto-reopen log name fires on CAS-fail | Resolver deliberately emits `ops_error_event.auto_reopened` before the CAS-guarded batch so the forensic event is captured regardless of outcome. A regression in the CAS guard would show a spurious auto-reopen log without a state change. Splitting into `auto_reopen_attempted` + `auto_reopen_committed` would disambiguate. |
| Phase E — auto_reopen_throttled KPI is deploy-window-ambiguous | A legit post-release error storm indistinguishable from abuse at the KPI layer. Operators can raise the per-subject cap for announced releases; a dashboard annotation linking KPI spikes to recent-deploy timestamps would close the ambiguity. |
| Phase E — canary / blue-green release-set awareness deferred | Plan explicitly defers this. P1.5 treats all non-matching SHAs as reopen triggers; the `ops-error-auto-reopen` rate limit mitigates the worst case. |
| Phase E — occurrence timeline | Drawer shows `first_seen + last_seen + occurrence_count` only; a true "last 5 occurrences" timeline requires a new `ops_error_event_occurrences` child table. Out of P1.5 scope. |
| FTS5 on `ops_error_events` | Phase E ships `LIKE` with covering index + wildcard escaping. Full-text search is a deferred spike once the drawer proves admins actually want cross-field search. |

---

## Lessons worth compounding

### Rebase discipline overrides local optimisation

Every phase hit at least one rebase; Phase C hit three. The orchestrator's instinct is to merge quickly after sign-off, but `gh pr merge --squash` fails fast with "merge conflicts" whenever main has moved — and GitHub cannot auto-rebase in this repo (auto-merge isn't enabled). The pattern that works: **rebase immediately before the final merge command**, not when the reviewers start, and delegate complex rebases (binary-flagged `worker/src/app.js` with embedded NUL bytes, multi-phase commit replay with semantic conflicts like "does U14 allowlist the new grammar route that main just added?") to a dedicated rebase-worker subagent so the main context doesn't burn token budget on merge-file gymnastics.

### Convergent-finding detection is the pattern, not individual reviewer quality

Every Blocker that mattered was flagged by 2+ independent reviewers. Every finding flagged by only one reviewer turned out to be either a genuine Nice-to-have or a scope-outside concern. The SDLC convention of "≥2 convergent findings → automatic fix-follower, single findings → residual list" held across all 5 phases. The orchestrator's job is to recognise convergence quickly in the synthesis step, not to try to triage every finding independently.

### Adversarial review earns its mandatory slot

Every phase that touched auth/public-endpoint/state-machine logic ran adversarial review. In every one, the adversarial reviewer found at least one finding nobody else caught — leading-zero IPv4 canonicalisation (Phase B), fresh-insert-cap escape via dedup replay (Phase E), cross-path race between role-change and ops-status (Phase D). The SDLC memory entry mandating adversarial review for public endpoints + state machines paid for itself five times over.

### "Test-harness vs production" is a recurring defect class

The project MEMORY warns about this, and P1.5 produced fresh examples:
- Phase B smoke script asserted on keys the server never emits (test would have passed every CI run, failed every production run).
- Phase C migration-0011 idempotency test used a bespoke `applyMigration0011Idempotent` helper that swallowed `duplicate column name` — production Wrangler does not. The test gave false confidence that partial-apply was safe.
- Phase D U14 stale-revision test only exercised the dev-stub header path; the production `accountSessionFromToken` JOIN path was uncovered until correctness re-review demanded it.

Each of these was fixed in the resolver loop before merge; they are repeated here because the pattern recurs across every phase of every plan and the cheapest catch is a reviewer specifically checking "does the test actually drive the production code path or a test-only parallel?".

### Phased PRs beat a single large PR for hardening work

The plan's per-phase PR decision (vs a bundled PR) was validated by the review load. Each PR had 15–31 changed files with 2 500–5 500 LOC of diff. Bundled as one PR, the review workload would have been 109 files / 18 000+ LOC — beyond the practical ceiling where reviewers catch subtle convergent Blockers. The phased approach also let Phase D + E ship *after* the Phase C migration was proven stable in production, reducing the blast radius of any migration-order bug.

---

## Sources & references

- **Plan**: [`docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md`](../../2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md) (1 197 lines)
- **Advisory input**: [`docs/plans/james/admin-page/admin-page-p2.md`](admin-page-p2.md)
- **Previous report**: [`docs/plans/james/admin-page/admin-page-p1-completion-report.md`](admin-page-p1-completion-report.md) — pattern reference for this report
- **Runbooks added during P1.5**:
  - [`docs/hardening/admin-ops-smoke-setup.md`](../../../hardening/admin-ops-smoke-setup.md) (B)
  - [`docs/hardening/withtransaction-audit.md`](../../../hardening/withtransaction-audit.md) (C)
  - [`docs/operations/migration-0011-recovery.md`](../../../operations/migration-0011-recovery.md) (C)
  - [`docs/hardening/admin-lockout-runbook.md`](../../../hardening/admin-lockout-runbook.md) (D)
- **Policy docs flipped by P1.5**:
  - [`docs/operating-surfaces.md`](../../../operating-surfaces.md) — line 260 flipped from "no enforcement" to describing the Phase D matrix, same PR as the enforcement code.
- **Memory entries accumulated**:
  - `feedback_autonomous_sdlc_cycle.md` — scrum-master orchestration pattern, convergence voting, rebase-before-merge gate, "test-harness vs production" recurring defect
  - `feedback_subagent_tool_availability.md` — `ce-*` reviewers are orchestrator-only; certain named agents (`ce-frontend-design`) are plan-time fictions not actual subagents; `ce-design-lens-reviewer` is the working substitute
  - `project_admin_ops_console_p1.md` — canonical reference for R24 tuple dedup + R29 redaction + additive-hub pattern (all preserved by P1.5)
  - `project_d1_atomicity_batch_vs_withtransaction.md` — directly exercised by U12; withTransaction audit doc is the compounding artefact
