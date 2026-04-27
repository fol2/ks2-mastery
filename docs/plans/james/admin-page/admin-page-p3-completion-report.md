# Admin Console P3 — Completion Report

**Plan**: `docs/plans/2026-04-27-002-feat-admin-console-p3-command-centre-plan.md`
**Advisory origin**: `docs/plans/james/admin-page/admin-page-p3.md`
**Date**: 2026-04-27
**Preceded by**: `docs/plans/james/admin-page/admin-page-p2-completion-report.md`

---

## Executive Summary

The admin console has been transformed from a sectioned dashboard (P2) into a genuine support/debug/content-operations command centre. P3 shipped 12 feature units across 12 PRs: Worker-authoritative Debug Bundle, error occurrence timeline, request denial logging and visibility, account search and detail, cross-subject content overview, Asset & Effect Registry UI, Marketing/Live Ops V0 with lifecycle state machine and active message banner delivery, login redirect preservation, admin read performance cleanup, and the schema migration underpinning occurrence/denial/marketing tables.

**Before (P2)**: five-section tabbed console with existing P1/P1.5 panels reorganised. Debug = error list. Accounts = role assignment + ops metadata. Content = per-subject panels. Marketing = placeholder. No Worker-authoritative evidence aggregation. No account search. No denial visibility. No occurrence timeline.

**After (P3)**: operators can find an account by search, generate a bounded evidence bundle, trace error occurrences through releases, see why access was denied, view cross-subject content readiness, manage announcement/maintenance banners, and land back on the intended admin section after sign-in.

---

## PR List with Squash SHAs

| Unit | PR | Title | Squash SHA |
|------|-----|-------|-----------|
| U1 | [#392](https://github.com/fol2/ks2-mastery/pull/392) | parallelise readAdminHub + dedup assertAdminHubActor | `94811ea` |
| U2 | [#386](https://github.com/fol2/ks2-mastery/pull/386) | login redirect preservation via sessionStorage stash | `dae9c2d` |
| U3 | [#382](https://github.com/fol2/ks2-mastery/pull/382) | migration 0013 — occurrence, denial, marketing tables | `b97b46e` |
| U4 | [#398](https://github.com/fol2/ks2-mastery/pull/398) | request denial logging with ctx.waitUntil + sampling | `6755d26` |
| U5 | [#404](https://github.com/fol2/ks2-mastery/pull/404) | error occurrence timeline — capture + read + drawer | `75a1994` |
| U6 | [#408](https://github.com/fol2/ks2-mastery/pull/408) | Debug Bundle — Worker endpoint + client panel | `e1ca08c` |
| U7 | [#407](https://github.com/fol2/ks2-mastery/pull/407) | account search and detail support cockpit | `94bef90` |
| U8 | [#406](https://github.com/fol2/ks2-mastery/pull/406) | denial log panel in Debugging section | `123e668` |
| U9 | [#403](https://github.com/fol2/ks2-mastery/pull/403) | Content Management cross-subject overview | `3bbb202` |
| U10 | [#389](https://github.com/fol2/ks2-mastery/pull/389) | Asset & Effect Registry UI over Monster Visual Config | `f7d3da9` |
| U11 | [#401](https://github.com/fol2/ks2-mastery/pull/401) | Marketing/Live Ops V0 — lifecycle state machine + body_text validation | `3110193` |
| U12 | [#405](https://github.com/fol2/ks2-mastery/pull/405) | client-runtime active message banner delivery | `abdf35e` |
| U13 | This PR | Documentation update + completion report | — |

---

## Test Count Summary

| Unit | PR | New Tests | Test Files |
|------|-----|-----------|------------|
| U1 | #392 | 9 (8 new + 1 perf assertion) | `worker-admin-hub-parallel.test.js` (new), `worker-admin-ops-read.test.js` (+1) |
| U2 | #386 | 24 | `admin-return-stash.test.js` (new) |
| U3 | #382 | 14 | `worker-migration-0013.test.js` (new) |
| U4 | #398 | 24 (17 unit + 7 integration) | `worker-admin-denial-logger.test.js` (new), `worker-admin-denial-capture.test.js` (new) |
| U5 | #404 | 18 (8 worker + 10 React) | `worker-admin-ops-error-occurrences.test.js` (new), `react-admin-error-drawer-occurrences.test.js` (new) |
| U6 | #408 | 33 (10 endpoint + 12 redaction + 11 client) | `worker-admin-debug-bundle.test.js` (new), `worker-admin-debug-bundle-redaction.test.js` (new), `react-admin-debug-bundle-panel.test.js` (new) |
| U7 | #407 | 11 (7 search + 4 detail) | `worker-admin-account-search.test.js` (new), `worker-admin-account-detail.test.js` (new) |
| U8 | #406 | 11 (6 worker + 5 React) | `worker-admin-request-denials-read.test.js` (new), `react-admin-denial-panel.test.js` (new) |
| U9 | #403 | 22 (8 worker + 14 React) | `worker-admin-content-overview.test.js` (new), `react-admin-content-overview.test.js` (new) |
| U10 | #389 | 11 (4 adapter + 7 SSR) | `react-admin-asset-registry.test.js` (new) |
| U11 | #401 | 36 | `worker-admin-marketing-messages.test.js` (new), plus structural invariant tests |
| U12 | #405 | 14 | `react-active-message-banner.test.js` (new) |
| **Total** | | **227** | **19 new test files** |

---

## Invariants Preserved

All P1, P1.5, and P2 invariants verified unchanged across the P3 sprint:

| Invariant | Origin | Status |
|-----------|--------|--------|
| `ops_status` enforcement — `requireActiveAccount` + `requireMutationCapability` middleware chain | P1.5 Phase D | Preserved |
| CAS `row_version` guard — `expectedRowVersion` threaded client to Worker to repository | P1.5 Phase C | Preserved |
| R24 fingerprint dedup — `(error_kind, message_first_line, first_frame)` tuple authoritative | P1 | Preserved |
| Additive hub payload — `/api/hubs/admin` response shape unchanged, new sibling fields via spread | P1 | Preserved |
| Content-free leaf modules — all new section files import from content-free leaf normalisers | P2 | Preserved — new leaves: `admin-debug-bundle-panel.js`, `admin-account-search.js`, `admin-denial-panel.js`, `admin-content-overview.js`, `admin-asset-registry.js`, `admin-marketing-messages.js`, `admin-active-message.js` |
| Auto-reopen logic — error centre auto-reopen with CAS guard on status='resolved' | P1.5 Phase E | Preserved |
| Error redaction — `(?<![A-Za-z])[A-Z]{4,}(?![A-Za-z])` pattern | P1 | Preserved |
| Hash-based section routing — counter-based feedback guard | P2 | Preserved |
| Dirty-row section-switch guard | P2 | Preserved |
| Last-admin / self-lockout protections | P1 | Preserved |
| Monster Visual/Effect atomic publish + reviewed state | Pre-P3 | Preserved — U10 wraps existing config in registry UI without changing data model |

---

## Key Architectural Decisions

### 1. Standalone Worker modules for new concerns

Debug Bundle (`admin-debug-bundle.js`), denial logging (`admin-denial-logger.js`), and marketing messages (`admin-marketing-messages.js`) each ship as standalone Worker modules rather than growing `repository.js`. This keeps the repository file bounded and makes each concern independently testable. The pattern: standalone module exports pure functions, `app.js` wires the route, the module calls repository helpers where needed.

### 2. Dual-signature actor resolution

U1 introduced `assertAdminHubActorForBundle` alongside the existing `assertAdminHubActor`. The Debug Bundle needs a single actor resolution that returns the resolved account/role for per-section redaction decisions. The original `assertAdminHubActor` was deduped so it fires once per hub load (measured via capacity trace), and the bundle variant extends this with the role-redaction contract.

### 3. Per-section error boundary in Debug Bundle

Each of the 7 sub-queries in the Debug Bundle (errors, occurrences, denials, mutations, account summary, learner summary, capacity) runs in its own try/catch. A single table failure returns `null` for that section rather than failing the entire bundle. This was a deliberate design decision: when debugging production issues, partial evidence is more useful than no evidence.

### 4. ctx.waitUntil for denial logging

U4 threads Cloudflare's `ctx` execution context through `createWorkerApp().fetch()` and uses `ctx.waitUntil()` to write denial log entries after the response has been sent. This means denial logging cannot slow down the denied request itself. Sampling (configurable, default 100%) bounds write volume for high-traffic denial reasons.

### 5. Marketing lifecycle state machine

U11 implements a strict lifecycle: `draft -> scheduled -> published -> paused -> archived`. Transitions are Worker-enforced — the client cannot skip states. The `body_text` field uses a restricted-safe subset (no raw HTML/JS/CSS). The structural invariant test proves the marketing module has zero imports from subject engines, preventing any coupling to learning mastery.

### 6. Asset & Effect Registry as UI layer over existing data model

U10 wraps the existing Monster Visual Config data model in a registry-shaped UI (asset list, effect catalog, bindings, tunables) without changing the underlying `platform_monster_visual_config` schema. This establishes the registry direction while preserving the proven atomic publish, reviewed state, and bundled fallback behaviours. A future schema migration can lift the data model without changing the UI contract.

### 7. Active message delivery via fail-open public endpoint

U12 adds `GET /api/ops/active-messages` as a public (unauthenticated) endpoint. This allows maintenance banners to reach users who cannot authenticate (e.g. during an auth outage). The endpoint returns only schema-bound safe fields (`type`, `title`, `body_text`, `severity`). The client banner component fails open: if the fetch fails, no banner is shown — it does not block the app.

---

## Review Findings Fixed

Findings addressed during the P3 sprint (from reviewer dispatches):

| Finding | Unit | Severity | Resolution |
|---------|------|----------|------------|
| `assertAdminHubActor` fires multiple times per hub load | U1 | PERF | Deduped to single resolution with capacity trace assertion |
| sessionStorage stash vulnerable to injection via crafted URL | U2 | HIGH | Strict allowlist of stash-worthy paths + JSON parse with try/catch |
| `Number(null)` is `0` which passes `Number.isFinite` — denial time filter | U8 | HIGH | Explicit `null` guard on `from`/`to` params before numeric conversion |
| Ops role sees full account_id in denial logs | U8 | MEDIUM | Separate `DENIAL_ACCOUNT_ID_MASK_LAST_N = 8` constant, ops sees no account/learner linkage |
| Marketing module imports from repository could pull subject code | U11 | HIGH | Structural invariant test: marketing module has zero subject-engine imports |
| Debug Bundle rate limit too permissive for fan-out query | U6 | MEDIUM | Dedicated 10/min rate limit (stricter than general admin reads) |
| Content overview crash on placeholder subject with no engine | U9 | MEDIUM | Null-safe subject status derivation with explicit `placeholder` state |

---

## What the Advisory Proposed vs What Shipped

| Advisory Outcome | Proposed | What Shipped |
|-----------------|----------|--------------|
| **A — Admin entry survives sign-in** | sessionStorage stash or safe return-to | U2: sessionStorage stash with strict path allowlist, consume-once semantics |
| **B — Debug Bundle** | Worker-authoritative evidence packet | U6: `/api/admin/debug-bundle` aggregating 7 tables with per-section error boundary |
| **C — Error occurrence timeline** | Occurrence-level history for fingerprints | U5: `ops_error_event_occurrences` table + capture + read + drawer integration |
| **D — Request denial visibility** | Denial/support-log surface | U4: `ctx.waitUntil` denial logging + U8: denial log panel with filters |
| **E — Account search/detail** | Searchable account support cockpit | U7: search endpoint + detail endpoint + UI with Debug Bundle deep-link |
| **F — Content Management overview** | Cross-subject operations view | U9: subject overview with live/placeholder/gated status per subject |
| **G — Asset & Effect Registry** | Generalise Monster Visual Config | U10: registry UI over existing data model, direction established |
| **H — Marketing/Live Ops V0** | Safe announcement/maintenance banners | U11: lifecycle state machine + U12: client-runtime banner delivery |
| **I — Admin read performance** | Parallelise + dedup actor resolution | U1: `Promise.all` parallelisation + single actor resolution per hub load |
| **J — Documentation + PR hygiene** | Update docs, close stale PRs | U13: this PR |

---

## Stale PR Cleanup

The following P2 per-unit PRs were merged via the feature PR #363 but remained open. Closed as part of U13:

| PR | Title | Disposition |
|----|-------|-------------|
| #344 | `test(admin): U1 characterization suite for admin hub panels` | Closed — merged via #363 |
| #346 | `feat(admin): U2 SPA boot URL routing + hash section parser` | Closed — merged via #363 |
| #355 | `feat(admin): U4+U5 extract section components + tab navigation` | Closed — merged via #363 |
| #356 | `feat(admin): U3 TopNav admin entry point` | Closed — merged via #363 |

---

## Known Follow-Ups / Deferred Items

| Item | Why Deferred | Recommended Approach |
|------|-------------|---------------------|
| Debug Bundle search by session ID | Requires session-to-error join not yet indexed | Add `session_id` column to occurrences, index, extend bundle query |
| Account detail: recent practice sessions | Requires cross-learner session aggregation | Query `practice_sessions` by learner IDs from account memberships |
| Marketing: scheduled auto-publish | Requires Cron Trigger or Durable Object timer | Add `scheduledAt` check to existing reconciliation cron |
| Marketing: audience targeting beyond "all" | Product decision needed on parent-only, demo-only scopes | Extend `audience` enum when product requirements clarify |
| Asset & Effect Registry schema migration | Data model changes beyond UI layer | Lift `platform_monster_visual_config` into registry-shaped tables |
| Content Management: misconception taxonomy | Subject-specific analysis not yet cross-subject | Build per-subject misconception read models first |
| Content Management: skill/item coverage | Requires content analytics pipeline | Start with spelling coverage, extend to grammar/punctuation |
| Full parent-facing marketing campaigns | Out of scope for operator-facing V0 | Separate phase when parent engagement features are scoped |
| WebSocket real-time dashboard | Not justified by current admin usage patterns | Reconsider when concurrent admin sessions become common |

---

## Cumulative Admin Console State

After P3, the admin console comprises:

| Phase | PRs | Focus |
|-------|-----|-------|
| P1 | 1 (#188) | Four panels + public error capture + additive hub pattern |
| P1.5 | 5 (#216, #227, #270, #292, #308) | Truthfulness, rate limiting, CAS, ops_status enforcement, error cockpit |
| P2 | 1 feature (#363) + 4 per-unit (#344, #346, #355, #356) | Section extraction, direct URL entry, TopNav, tab navigation |
| P3 | 12 (#382, #386, #389, #392, #398, #401, #403, #404, #405, #406, #407, #408) | Command centre: debug bundle, occurrences, denials, account search, content overview, asset registry, marketing V0, active banners |

**Total P3 new tests**: 227 across 19 new test files.
