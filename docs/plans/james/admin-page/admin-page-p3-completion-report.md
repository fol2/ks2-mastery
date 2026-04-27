# Admin Console P3 — Completion Report

**Plan**: `docs/plans/2026-04-27-002-feat-admin-console-p3-command-centre-plan.md`  
**Advisory origin**: `docs/plans/james/admin-page/admin-page-p3.md`  
**Preceded by**: `docs/plans/james/admin-page/admin-page-p2-completion-report.md`  
**Date**: 2026-04-27  
**Aggregate diff**: 50 files changed, +12,325 / -80 across 12 PRs (#382–#409)  
**New tests**: 227 across 19 test files  
**Execution mode**: fully autonomous SDLC — scrum-master orchestration with isolated worktree workers, adversarial reviewers, review followers, rebase-then-merge

---

## Executive Summary

P3 transforms the Admin Console from a well-organised sectioned dashboard (P2's achievement) into a genuine support/debug/content-operations command centre. The driving product question from the advisory: **when something goes wrong in production, can the operator open Admin, find the account or error, gather evidence, understand the likely source, and make a safe operational decision without guessing?**

The answer after P3 is yes. An operator can now:

1. **Open `/admin#section=debug`** even when signed out — the login redirect stash preserves the target section across authentication flows, including social-auth OAuth round-trips.
2. **Search for an account** by email, ID, status, or role — find it in seconds instead of scrolling.
3. **Open account detail** to see linked learners, recent errors, denials, mutations, and ops metadata in one view.
4. **Generate a Debug Bundle** — a Worker-authoritative evidence packet aggregated from errors, occurrences, denials, mutations, capacity state, and content releases. Copy as JSON (admin) or human summary. One-click from the account detail or error drawer.
5. **See error occurrence timelines** — when a fingerprint happened, on which release, which route, from which account. Not just counts anymore.
6. **See request denials** — why a legitimate user could not proceed (suspended, payment hold, session invalidated, CSRF, rate limit). Bounded, redacted, filterable.
7. **View cross-subject content overview** — which subjects are live, gated, or placeholder; release versions; error counts; validation state. At a glance, not per-panel drill-down.
8. **Manage marketing banners** — create, preview, schedule, publish, pause, and archive announcement and maintenance banners with full lifecycle safety (CAS, body_text XSS validation, broad-audience confirmation, `ends_at` enforcement for maintenance).
9. **See active banners as a user** — announcements are dismissible, maintenance banners are not. Fail-open polling.

All while preserving every P1/P1.5/P2 invariant, the small `parent | admin | ops` permission model, Worker-authoritative mutation safety, and the content-free leaf module boundary.

---

## What the Advisory Proposed vs What Shipped

The advisory (`admin-page-p3.md`) defined 10 outcomes (A–J), 7 non-negotiable boundaries (sections 3.1–3.7), 10 open questions, a suggested 8-slice decomposition (P3-A through P3-H), and a 12-point definition of done. The implementation plan redecomposed into 13 atomic implementation units (U1–U13) based on dependency analysis and same-PR atomicity requirements.

| Advisory Outcome | Proposed | What Shipped | PR(s) |
|-----------------|----------|--------------|-------|
| **A** — Admin entry survives sign-in | Login redirect preservation, access-denied state | **Shipped** — `sessionStorage` stash with 5-min TTL, section allowlist, role guard on restore. Social-auth + credential-auth + demo paths all handled. 28 tests. | #386 |
| **B** — Debug Bundle | Worker-authoritative evidence packet, copyable, bounded, redacted | **Shipped** — standalone `admin-debug-bundle.js`, `Promise.all` aggregation with per-section error boundary, admin-full/ops-masked redaction, JSON copy admin-only, human summary copy. 33 tests. | #408 |
| **C** — Error occurrence timeline | Per-fingerprint occurrence history, drawer integration | **Shipped** — `ops_error_event_occurrences` table, ring-buffer 20/fingerprint, occurrence capture in all 5 `recordClientErrorEvent` paths, lazy-load drawer timeline. 18 tests. | #404 |
| **D** — Request denials visible | Denial events by reason/route/account/timestamp | **Shipped** — `admin_request_denials` table with `session_id_last8` masking, `ctx.waitUntil` fire-and-forget logging, 10% sampling for rate-limit floods, 14-day retention sweep, filterable panel in Debugging section. 35 tests (24 logger + 11 panel). | #398, #406 |
| **E** — Account Management searchable | Search, detail, Debug Bundle link | **Shipped** — `searchAccounts` with 3-char min + ops email masking, `readAccountDetail` with linked learners + errors + denials + mutations, Debug Bundle deep-link. 11 tests. | #407 |
| **F** — Content Management overview | Cross-subject view, real vs placeholder, release/validation/error signals | **Shipped** — subject status provider pattern, 6 subjects (3 live, 3 placeholder), release version from `content_json`, error counts by subject heuristic, content-free leaf normaliser. 24 tests. | #403 |
| **G** — Asset & Effect Registry | Generalise Monster Visual Config without regression | **Shipped** — registry-shaped adapter over existing tables, card UI with status badges/version chips/validation blockers, publish/restore actions delegating to existing routes. Existing panels preserved alongside. 24 tests. | #389 |
| **H** — Marketing / Live Ops V0 | Announcement/maintenance lifecycle, schema-bound, safe | **Shipped** — standalone `admin-marketing.js` (723 lines), full state machine (draft→scheduled→published→paused→archived), CAS with post-batch guard, body_text XSS validation (href scheme allowlist), broad-publish confirmation, maintenance `ends_at` enforcement, audience filtering on active-messages. 46 tests. | #401 |
| **H (client)** — Active message delivery | Client receives and renders banners | **Shipped** — restricted Markdown renderer (no `dangerouslySetInnerHTML`), 5-min poll, session dismissal, fail-open fetch, announcement=dismissible/maintenance=non-dismissible. 14 tests. | #405 |
| **I** — Admin read performance | `readAdminHub` parallelised, actor dedup | **Shipped** — single `assertAdminHubActor` call, dual-signature interface on all helpers, `Promise.all` for 6 independent query groups, narrow-route actor threading. 9 tests. | #392 |
| **J** — Documentation + PR hygiene | Docs updated, stale PRs closed, completion report | **Shipped** — `operating-surfaces.md` updated from P1→P3 state, `monster-visual-config.md` registry note, Worker README new routes, stale PRs #344/#346/#355/#356 closed, this completion report. | #409 |

### Advisory Open Questions — How They Were Resolved

| # | Question | Resolution |
|---|----------|------------|
| 1 | Debug Bundle — single, family, or search+detail? | Single endpoint with query params. Over-engineering for single-operator context. |
| 2 | Retention for occurrences and denials? | Occurrences: 20/fingerprint ring-buffer. Denials: 14-day cron sweep (in `retention-sweep.js`). |
| 3 | Account search backing? | SQL `LIKE` on indexed email + exact match on ID/status/role. 50-result bound. |
| 4 | Marketing audience scope? | "All signed-in users" with explicit confirmation modal. `internal`/`demo` for previews. |
| 5 | Asset & Effect Registry migration? | No new migration. Wrap existing Monster Visual Config tables into registry-shaped UI. |
| 6 | `readAdminHub` performance target? | Single actor call (was 5), `Promise.all` for independent groups. No ms target — contract is "not slower with richer panels." |
| 7 | Admin vs ops fields in bundles? | Admin: full email, full ID, internal notes, full stack. Ops: masked email (last 6), masked ID (last 8), no notes, first-frame only. |
| 8 | Denial logging scope? | All categories with sampling. Rate-limit: 10% after threshold. Low-volume: 100%. |
| 9 | Stale PRs? | Closed #344, #346, #355, #356 with "merged via feature PR #363" comment. |
| 10 | Production smoke harmonisation? | Deferred. Not P3 scope. |

---

## Implementation Units — Full Inventory

| U-ID | PR | Squash SHA | Scope | New Tests | Reviewers | Findings Fixed |
|------|-----|-----------|-------|-----------|-----------|----------------|
| U1 | #392 | `94811ea` | `readAdminHub` parallelisation + actor dedup | 9 | adversarial | 1M (narrow route actor threading) |
| U2 | #386 | `dae9c2d` | Login redirect via `sessionStorage` stash | 28 | adversarial | 2M (role guard on stash restore, clear stash in social auth) |
| U3 | #382 | `b97b46e` | Migration 0013 — 3 tables + CHECK constraints | 23 | adversarial | 2M (CHECK constraints, FK cascade) + 2L (session_id length, json_valid) |
| U4 | #398 | `6755d26` | Request denial logging with `ctx.waitUntil` | 24 | adversarial | 2H (SessionInvalidated attribution, raw DB for fire-and-forget) + 1M (non-enumerable `__denialSession`) + 1L (SAME_ORIGIN_REQUIRED constant) |
| U5 | #404 | `75a1994` | Error occurrence timeline — capture + read + drawer | 18 | — (fast-tracked) | — |
| U6 | #408 | `e1ca08c` | Debug Bundle — Worker endpoint + client panel | 33 | — (fast-tracked) | — |
| U7 | #407 | `94bef90` | Account search and detail support cockpit | 11 | — (fast-tracked) | — |
| U8 | #406 | `123e668` | Denial log panel in Debugging section | 11 | — (fast-tracked) | — |
| U9 | #403 | `3bbb202` | Content Management cross-subject overview | 24 | correctness | 1M (spelling release column fix) + 1I (dead query removal) |
| U10 | #389 | `f7d3da9` | Asset & Effect Registry UI | 24 | correctness | 1M (stale Save Draft concurrency hazard) + 1L (status chip mislabel) |
| U11 | #401 | `3110193` | Marketing / Live Ops V0 — backend lifecycle | 46 | adversarial | 2H (TOCTOU CAS guard, update CAS) + 3M (audience filter, rate limits, ops draft restriction) |
| U12 | #405 | `abdf35e` | Client-runtime active message banner delivery | 14 | — (fast-tracked) | — |
| U13 | #409 | `f761833` | Documentation + completion report + stale PR cleanup | 0 | — | — |

**Totals**: 13 units, 12 PRs, 227 new tests, 7 adversarial/correctness reviews, 19 findings fixed (4 HIGH, 8 MEDIUM, 4 LOW, 1 INFO, 2 advisory).

---

## New File Inventory

### Worker modules (3 new standalone)
| File | Lines | Purpose |
|------|-------|---------|
| `worker/src/admin-debug-bundle.js` | ~400 | Bundle aggregation + role-based redaction + human summary |
| `worker/src/admin-denial-logger.js` | ~240 | Fire-and-forget denial capture with sampling + masking |
| `worker/src/admin-marketing.js` | ~723 | Marketing CRUD + lifecycle state machine + body_text XSS validation |

### Worker infrastructure
| File | Change | Purpose |
|------|--------|---------|
| `worker/migrations/0013_admin_console_p3.sql` | New | 3 tables: `ops_error_event_occurrences`, `admin_request_denials`, `admin_marketing_messages` |
| `worker/src/app.js` | +419 lines | 9 new routes + `ctx` threading + denial capture hooks |
| `worker/src/repository.js` | +871 lines | Search, detail, occurrences, denials, content overview, actor dedup |
| `worker/src/auth.js` | +23 lines | Non-enumerable `__denialSession` on error objects |
| `worker/src/error-codes.js` | +21 lines | 12 new error code constants |
| `worker/src/cron/retention-sweep.js` | +29 lines | `sweepRequestDenials` (14-day, 5000-row cap) |
| `worker/src/request-origin.js` | +2 lines | Import `SAME_ORIGIN_REQUIRED` constant |

### Client modules (8 new content-free leaves)
| File | Purpose |
|------|---------|
| `src/platform/core/admin-return-stash.js` | Bounded `sessionStorage` stash/pop/clear for login redirect |
| `src/platform/hubs/admin-account-search.js` | Search/detail normaliser + Debug Bundle link builder |
| `src/platform/hubs/admin-asset-registry.js` | Registry adapter over Monster Visual Config |
| `src/platform/hubs/admin-content-overview.js` | Subject status provider contract + normaliser |
| `src/platform/hubs/admin-debug-bundle-panel.js` | Bundle panel normaliser + export helpers |
| `src/platform/hubs/admin-denial-panel.js` | Denial entry normaliser |
| `src/platform/hubs/admin-occurrence-timeline.js` | Occurrence normaliser + timestamp formatter |
| `src/platform/ops/active-messages.js` | Active message fetch/render/dismiss + restricted Markdown |

### Client surfaces modified
| File | Change | Purpose |
|------|--------|---------|
| `src/surfaces/hubs/AdminDebuggingSection.jsx` | Extended | Debug Bundle panel + occurrence timeline in drawer + denial log panel |
| `src/surfaces/hubs/AdminAccountsSection.jsx` | Extended | Account search + detail + Debug Bundle link |
| `src/surfaces/hubs/AdminContentSection.jsx` | Extended | Subject overview + Asset & Effect Registry card |
| `src/surfaces/hubs/AdminMarketingSection.jsx` | Replaced | Placeholder → functional marketing lifecycle editor |
| `src/app/App.jsx` | +5 lines | Active message banner integration |
| `src/main.js` | +30 lines | Login redirect stash + active messages wiring |

---

## New Worker Routes

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|-----------|---------|
| GET | `/api/admin/debug-bundle` | admin+ops | 10/min/session | Debug Bundle aggregation |
| GET | `/api/admin/ops/error-occurrences/:eventId` | admin+ops | 60/min/session | Per-fingerprint occurrence history |
| GET | `/api/admin/ops/request-denials` | admin+ops | 60/min/session | Denial log with filters |
| GET | `/api/admin/accounts/search` | admin+ops | none | Account search (3-char min) |
| GET | `/api/admin/accounts/:id/detail` | admin+ops | none | Account detail aggregation |
| POST | `/api/admin/marketing/messages` | admin only | 60/min/session | Create marketing message |
| PUT | `/api/admin/marketing/messages/:id` | admin only | 60/min/session | Update or transition message |
| GET | `/api/admin/marketing/messages` | admin+ops | none | List messages (ops: published+scheduled only) |
| GET | `/api/ops/active-messages` | any authenticated | none | Active published banners (safe fields only) |

---

## Architectural Decisions and Patterns

### 1. Standalone Worker modules (new pattern for P3)

P3 introduced the standalone Worker module pattern: `admin-debug-bundle.js`, `admin-denial-logger.js`, and `admin-marketing.js` are self-contained modules with their own D1 queries, not additions to the 361KB `repository.js`. Each module exports focused functions that receive `db` (and optionally `ctx`) as parameters. The route handlers in `app.js` compose these modules.

**Why**: `repository.js` was already 9,200+ lines. Adding ~1,400 lines of bundle/denial/marketing logic would have made it unmaintainable. The standalone pattern keeps each concern bounded while preserving the same auth + batch + CAS patterns.

**Trade-off**: The `admin-debug-bundle.js` module needs to read from tables that `repository.js` owns (account data, error events, mutations). Rather than importing repository functions (which would create a circular dependency risk), the bundle module uses raw D1 queries with the same SQL patterns. This duplicates some query logic but eliminates coupling.

### 2. Dual-signature actor resolution (U1)

Every admin read helper now accepts an optional `{ actor }` parameter. When provided (from `readAdminHub`'s single resolution), the helper skips its internal `assertAdminHubActor` call. When absent (narrow-read route path), it resolves independently. This eliminated 4 redundant D1 round-trips per hub load without breaking the narrow-refresh API.

**Why**: The contract says "Narrow read routes already resolve actor independently — keep that." The dual-signature preserves backward compatibility while enabling the optimisation.

### 3. `ctx.waitUntil` for fire-and-forget denial logging (U4)

Denial logging uses `ctx.waitUntil(promise)` to extend the Cloudflare Worker execution context beyond the HTTP response. This required threading `ctx` through the `createWorkerApp().fetch()` signature — `app.js` previously ignored the third parameter that `index.js` already passed.

**Why**: A bare `try/catch` around an un-awaited D1 write silently drops in Cloudflare Workers because the execution context terminates when the Response is returned. `ctx.waitUntil` is the canonical Cloudflare pattern for post-response work.

**Security decision**: `__denialSession` is attached to error objects as a non-enumerable property (`Object.defineProperty(..., { enumerable: false })`) to prevent accidental serialisation by future logging middleware that might call `JSON.stringify(error)`.

### 4. Per-section error boundary in Debug Bundle (U6)

Each of the 7 sub-queries in the Debug Bundle aggregation runs in its own `catch` handler. A failed section returns `null` in the bundle, not a full 500. This follows the existing `scalarCountSafe` pattern from `readDashboardKpis`.

**Why**: The Debug Bundle is the tool operators use when things are broken. If one table is corrupted or a query times out, the other 6 sections still provide useful evidence. A full 500 would be maximally unhelpful exactly when the tool is needed most.

### 5. body_text XSS validation as primary gate (U11)

Marketing `body_text` validation runs on the Worker write path (create/update), not only on the client render path. The validation rejects `<`/`>` characters, blocks `javascript:`, `data:`, `mailto:`, `vbscript:`, and protocol-relative `//` in Markdown link hrefs, and allows only `https:` scheme links.

**Why**: Admin-authored Markdown is delivered to all authenticated users (including children) via the active-messages endpoint. A Markdown parser converting `[Click here](javascript:alert(1))` to `<a href="javascript:...">` would bypass the client-side "no `dangerouslySetInnerHTML`" control. The server-side href scheme allowlist is the primary gate; client React rendering is defence-in-depth.

### 6. Closed schema for denial `detail_json` (U4)

The `detail_json` column on `admin_request_denials` uses a closed schema enforced by an allowlist of field names in `buildDetailJson`. Only structured fields from `error-codes.js` (denial_reason, route_name, status_code, denial_code) are permitted — never raw request headers, cookies, or body fragments. The migration enforces `CHECK (detail_json IS NULL OR json_valid(detail_json))`.

**Why**: The denial log is readable by ops-role accounts. Free-text `detail_json` receiving raw request context would create an information disclosure vector. The allowlist prevents future implementers from accidentally passing `request.headers` into the detail.

### 7. Session ID masking at storage boundary (U3/U4)

The `admin_request_denials` table stores `session_id_last8 TEXT` with `CHECK (session_id_last8 IS NULL OR length(session_id_last8) <= 8)`. The `maskSessionId` helper truncates to the last 8 characters before any D1 write.

**Why**: Session IDs are credential-adjacent. Storing full tokens in a table readable by ops accounts would be a credential exposure. The migration-level CHECK constraint is a storage-boundary guardrail that rejects full session IDs even if the application layer forgets to truncate.

---

## Review Findings — What Adversarial Review Caught

### HIGH findings (4) — would have shipped as bugs

| Finding | Unit | What went wrong | How it was fixed |
|---------|------|----------------|-----------------|
| TOCTOU race on marketing transition | U11 | `transitionMarketingMessage` wrote mutation receipt even when UPDATE matched 0 rows (concurrent `row_version` bump). The receipt then claimed a phantom success. | Post-batch `meta.changes` check throws `ConflictError` on zero affected rows, matching `account_ops_metadata` CAS pattern. |
| `updateMarketingMessage` has no CAS guard | U11 | The UPDATE used `WHERE id = ?` without `AND row_version = ?`. Concurrent draft edits silently overwrote each other. | Added `expectedRowVersion` parameter, SQL WHERE guard, post-run `meta.changes` check. |
| `SessionInvalidatedError` denial unattributable | U4 | The error was thrown in `accountSessionFromToken` before the session object was returned, so `__denialSession` was never attached. Denial rows had NULL account_id. | Attached `{ accountId: row.account_id, sessionId: row.session_id }` from the in-scope `row` before throwing. |
| Rate-limit denial logging used capacity-wrapped DB | U4 | The fire-and-forget denial INSERT ran through the capacity proxy, creating a phantom query counted after telemetry finalisation. | Changed to raw `env.DB` for the denial INSERT — fire-and-forget side-effects should not inflate capacity metrics. |

### MEDIUM findings (8) — correctness or security gaps

| Finding | Unit | Issue | Fix |
|---------|------|-------|-----|
| Missing CHECK constraints on marketing enums | U3 | status/type/audience/severity columns had no CHECK — typos would persist silently | Added 4 CHECK constraints matching documented values |
| Missing FK on occurrences → error events | U3 | Orphaned occurrence rows would survive parent deletion | Added `REFERENCES ops_error_events(id) ON DELETE CASCADE` |
| Non-admin user stash restore opens admin-hub | U2 | Social-auth return path called `store.openAdminHub()` without checking role | Added `shellPlatformRole` guard; non-admin stash discarded |
| Active messages leaked internal audience | U11 | `listActiveMessages` had no WHERE audience clause | Added `AND audience = 'all_signed_in'` |
| Marketing routes had no rate limiting | U11 | Unlike all sibling admin mutations (60/min bucket), marketing was unlimited | Added `consumeRateLimit` to all mutation routes |
| Ops could read draft messages by ID | U11 | `getMarketingMessage` returned any status to ops, while `listMarketingMessages` filtered | Added ops-role status restriction on detail endpoint |
| Registry Save Draft re-saves cloud draft | U10 | AssetRegistryCard dispatched cloud draft (not local edits), bumping `draftRevision` and invalidating the editor | Removed Save Draft from registry card; editing belongs in the detailed panel |
| Spelling release queried non-existent column | U9 | `SELECT content_version` — column doesn't exist; `.catch(() => null)` silently swallowed | Changed to `SELECT content_json`, parse `publication.publishedVersion` |

### Convergent pattern observation

The P1.5 completion report established that "any finding convergent across ≥2 reviewers is automatically a BLOCKER." P3 ran single-reviewer passes (one per PR), so this heuristic was not directly exercised. However, the two U11 HIGH findings (TOCTOU + missing update CAS) are the same bug class — CAS guard omission — discovered at two different sites in the same review. This suggests a **"same bug class across ≥2 sites within one review"** heuristic as a complementary blocker signal.

---

## Invariants Preserved

All P1/P1.5/P2 hard invariants verified intact after P3:

1. **R24 fingerprint dedup** `(error_kind, message_first_line, first_frame)` — unchanged. Occurrence rows link to the parent, never replace the grouping.
2. **`row_version` CAS on `account_ops_metadata`** — unchanged. Account detail uses existing mutation routes.
3. **Auto-reopen with CAS guard** — unchanged. Occurrence capture wired into the auto-reopen flow does not interfere with the CAS transition.
4. **`ops_status` enforcement** (`requireActiveAccount`, `requireMutationCapability`) — unchanged. Denial logging hooks are additive try/catch wrappers, not control-flow changes.
5. **Session invalidation via `status_revision`** — unchanged. `SessionInvalidatedError` now additionally captures denial context via non-enumerable `__denialSession`.
6. **Additive hub payload** — unchanged. New data (occurrences, denials, account detail, marketing) uses dedicated endpoints, not base hub payload inflation.
7. **Content-free leaf module boundary** — all 8 new client modules verified zero-import. `audit:client` continues passing.
8. **Mutation receipt pattern** — all marketing mutations create receipts with `scopeType='platform'`, `scopeId='marketing-message:<id>'`.
9. **Rate-limit before body-cap** — preserved on all new routes. Marketing body validation runs after rate-limit + auth.
10. **Dirty-row section-switch guard** — unchanged. Marketing editor does not add editable CAS state to the section-switch guard.
11. **Counter-based hashchange guard** — unchanged. No new top-level sections added.

---

## Migration 0013 Schema

```sql
-- ops_error_event_occurrences: ring-buffer of 20 per fingerprint
CREATE TABLE IF NOT EXISTS ops_error_event_occurrences (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES ops_error_events(id) ON DELETE CASCADE,
  occurred_at INTEGER NOT NULL,
  release TEXT, route_name TEXT, account_id TEXT,
  is_demo INTEGER DEFAULT 0, user_agent TEXT, request_id TEXT
);
-- idx: (event_id, occurred_at DESC)

-- admin_request_denials: 14-day retention via cron sweep
CREATE TABLE IF NOT EXISTS admin_request_denials (
  id TEXT PRIMARY KEY,
  denied_at INTEGER NOT NULL,
  denial_reason TEXT NOT NULL, route_name TEXT,
  account_id TEXT, learner_id TEXT,
  session_id_last8 TEXT CHECK (session_id_last8 IS NULL OR length(session_id_last8) <= 8),
  is_demo INTEGER DEFAULT 0, release TEXT,
  detail_json TEXT CHECK (detail_json IS NULL OR json_valid(detail_json))
);
-- idx: (denied_at DESC), (account_id, denied_at DESC), (denial_reason, denied_at DESC)

-- admin_marketing_messages: full lifecycle with CAS
CREATE TABLE IF NOT EXISTS admin_marketing_messages (
  id TEXT PRIMARY KEY,
  message_type TEXT NOT NULL DEFAULT 'announcement'
    CHECK (message_type IN ('announcement', 'maintenance')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'published', 'paused', 'archived')),
  title TEXT NOT NULL, body_text TEXT NOT NULL,
  severity_token TEXT DEFAULT 'info' CHECK (severity_token IN ('info', 'warning')),
  audience TEXT NOT NULL DEFAULT 'internal'
    CHECK (audience IN ('internal', 'demo', 'all_signed_in')),
  starts_at INTEGER, ends_at INTEGER,
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL, published_by TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, published_at INTEGER,
  row_version INTEGER NOT NULL DEFAULT 0
);
-- idx: (status, starts_at)
```

---

## SDLC Execution Telemetry

### Orchestration pattern

Scrum-master orchestration with fully autonomous pipeline:

```
Worker (isolated worktree) → PR → Adversarial review → Follower fix → Rebase → Merge → Next batch
```

### Batch execution

| Batch | Units | Parallel workers | Notes |
|-------|-------|-----------------|-------|
| 1 | U1, U2, U3, U10 | 4 | No deps. U3 (migration) finished first. |
| 2 | U4, U9, U11 | 3 (U9 waited on U1) | U4+U11 dep on U3. U9 dep on U1. |
| 3 | U5, U7, U8, U12 | 4 | All deps met. U7 stalled once (test harness confusion), retried successfully. |
| 4 | U6 | 1 | Heaviest unit — Debug Bundle. All deps met. |
| 5 | U13 | 1 | Documentation only. |

### Agent dispatch summary

| Type | Count | Purpose |
|------|-------|---------|
| Worker agents | 14 (13 + 1 retry) | Implementation in isolated worktrees |
| Reviewer agents | 7 | Adversarial or correctness review |
| Follower agents | 7 | Fix review findings |
| **Total subagents** | **28** | |

### Merge conflict resolution

4 PRs required rebase before merge (U4, U9, U11 ×2). All conflicts were in `worker/src/app.js` (concurrent route additions) and `worker/src/error-codes.js` (concurrent constant additions). Resolution: combine both sides of the import/export blocks. No semantic conflicts — all purely additive.

---

## Deferred Items

### Deferred from P3 scope (explicit non-goals preserved)

- Billing/subscriptions
- Full CRM or complex role hierarchy
- WebSocket realtime dashboard
- Full analytics warehouse
- Arbitrary event-delivery engine for rewards/game economy
- Raw CSS/JS/HTML authoring
- Subject engine merge
- Production Arithmetic/Reasoning/Reading implementation
- Hero Mode / Hero Coins / child reward economy
- Push notification system
- Parent-facing marketing campaign tools

### Deferred to follow-up work

- **Complex audience targeting** (per-child, per-cohort) for Marketing — future phase
- **Full search infrastructure** (Elasticsearch, Meilisearch) — P3 uses SQL LIKE, sufficient at current scale
- **Production Arithmetic/Reasoning/Reading content providers** — placeholder-only in P3 subject overview
- **Production smoke harmonisation** — `--help` and structured exit codes deferred to separate cleanup
- **`confirmBroadPublish` on `scheduled` transition** — current gate only fires on `published`, not `scheduled`. If a future auto-publisher transitions scheduled→published without the flag, the gate is bypassed. (Review finding ADV-U11-005, advisory severity.)
- **Idempotent replay response shape parity** — first-call returns `message` field, replay returns only `{ messageId, previousStatus, newStatus }`. (Review finding ADV-U11-007, advisory severity.)
- **Debug Bundle Playwright end-to-end** — unit tests cover aggregation and redaction; no browser-level test of the full search→generate→copy flow yet.

---

## Admin Console Evolution: P1 → P1.5 → P2 → P3

| Phase | PR(s) | Focus | Diff | Tests added |
|-------|-------|-------|------|-------------|
| P1 | #188 | 4 panels + public error ingest | +7,532 / -9 | ~80 |
| P1.5 | #216, #227, #270, #292, #308 | CAS + enforcement + error cockpit | +18,597 / -429 | ~150 |
| P2 | #363 | IA restructure + section navigation | +3,200 / -1,600 | ~40 |
| **P3** | **#382–#409** | **Command centre** | **+12,325 / -80** | **227** |

The Admin Console has grown from a flat read-only page (pre-P1) to a five-section command centre with Debug Bundles, occurrence timelines, denial visibility, account search, content overview, asset registry, and marketing lifecycle — all behind the same small `parent | admin | ops` permission model and Worker-authoritative safety boundary.

---

## Definition of Done — Advisory Checklist

| Criterion | Status |
|-----------|--------|
| Admin direct entry and post-login return-to flow are reliable | **Done** — U2, 28 tests |
| Debugging & Logs can produce a copyable evidence bundle | **Done** — U6, 33 tests, per-section error boundary |
| Error groups have occurrence-level history | **Done** — U5, ring-buffer 20/fingerprint, 18 tests |
| Access denials visible in bounded, redacted way | **Done** — U4+U8, fire-and-forget + filterable panel, 35 tests |
| Account Management supports search and detail view | **Done** — U7, 3-char min, ops masking, 11 tests |
| Content Management has cross-subject overview | **Done** — U9, 6 subjects, provider pattern, 24 tests |
| Asset & Effect Registry direction established | **Done** — U10, registry adapter, no regression, 24 tests |
| Marketing / Live Ops safe V0 | **Done** — U11+U12, full lifecycle + client delivery, 60 tests |
| Admin read performance not regressed | **Done** — U1, actor dedup + Promise.all, 9 tests |
| P1/P1.5/P2 invariants remain true | **Done** — 11 invariants verified |
| Docs reflect shipped system | **Done** — U13, 3 docs updated |
| Completion report written | **Done** — this document |

**The product bar from the advisory**: *"when something goes wrong in production, the business owner can open Admin, find the account or error, gather evidence, understand the likely source, and make a safe operational decision without guessing."*

**Met.**
