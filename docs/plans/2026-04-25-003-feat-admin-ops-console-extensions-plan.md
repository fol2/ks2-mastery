---
title: "feat: Admin / Operations console extensions (P1)"
type: feat
status: completed
date: 2026-04-25
deepened: 2026-04-25
origin: docs/plans/james/admin-page/admin-page-p1.md
---

# feat: Admin / Operations console extensions (P1)

## Overview

Extend the existing `AdminHubSurface` with four new panels and one client-wide error-capture pipeline, while preserving `MonsterVisualConfigPanel`, `AdminAccountRoles`, and all current admin hub behaviour unchanged.

**P1 adds:**

1. **Dashboard KPI overview** — read-only counters (accounts total, learners total, recent practice sessions 7d/30d, event-log volume 7d, active demos, mutation-receipt volume 7d). On-demand compute on admin refresh. Hybrid data strategy: `admin_kpi_metrics` table for state-derived counters (error events by status, account-ops mutation volume), live `SELECT COUNT(*)` with new indexes for totals and windowed metrics.
2. **Recent activity ops stream** — read-only list of the last ~50 `mutation_receipts` across accounts, ordered by `applied_at DESC`. Manual refresh only (no polling).
3. **Account ops metadata panel** — new `account_ops_metadata` D1 table (1:1 with `adult_accounts`): `ops_status` enum, `plan_label`, `tags_json`, `internal_notes`. Admin-only edit UI; **not wired into auth enforcement in P1** — GM-facing info only.
4. **Error log centre** — new `ops_error_events` D1 table with fingerprint dedup; public `POST /api/ops/error-event` ingest endpoint (no auth, rate-limited, redacted); client-wide capture hooks (`window.onerror` + `unhandledrejection` in `src/main.js` + `ErrorBoundary onError` in `App.jsx`); admin panel lists recent events with status control (open → investigating → resolved → ignored).

**Preserved unchanged:** `MonsterVisualConfigPanel` at `src/surfaces/hubs/AdminHubSurface.jsx:172`, `AdminAccountRoles`, `DemoOperationsSummary`, content release / import validation / audit lookup / learner support sections. `/api/bootstrap`, `/api/hubs/parent`, parent hub surface, and all subject runtime paths are out of scope.

---

## Problem Frame

Admin / Operations today surfaces role management, demo operations summary, content release snapshot, audit lookup, learner diagnostics, and monster visual config. It does **not** provide:

- At-a-glance platform KPIs (how many accounts / learners / recent sessions / errors).
- Any cross-account activity feed — `auditLogLookup` is scoped to the current account only.
- GM-facing account metadata beyond `platform_role` (no notes, no status label, no plan tracking, no tags).
- Visibility into client-side errors. A React crash today either renders the `ErrorBoundary` fallback or silently rejects, with no server-side record.

The input document `docs/plans/james/admin-page/admin-page-p1.md` is an AI starter-pack note (not a requirements doc, no frontmatter). Several of its proposals — admin dashboard overview, account GM panel, error log centre, integration into the existing admin hub — map cleanly onto real gaps. Others (15-second realtime polling, event delivery system, feature flags) are either premature optimisation for a single-operator (James) context or P2+ scope.

This plan takes the four items that deliver real operator value with bounded schema impact, and wires them into the existing hub surface without creating a parallel `AdminOpsConsole.jsx` (explicitly rejecting the starter-pack's `ks2-admin-starter.zip` file set).

---

## Requirements Trace

- R1. Extend the existing `AdminHubSurface` with new panels; do not create a separate admin app or parallel console component.
- R2. Preserve `<MonsterVisualConfigPanel>`, `<AdminAccountRoles>`, `<DemoOperationsSummary>`, content release / import validation / audit lookup / learner support sections unchanged. All current `actions.dispatch('monster-visual-config-*', ...)` keys remain untouched.
- R3. Dashboard KPI panel shows: accounts total, learners total, practice-session count (7d and 30d windows), event-log volume (7d window), active demo accounts, mutation-receipt volume (7d), plus error-event counts by status (open/investigating/resolved/ignored). Admin + ops platform roles can view.
- R4. KPI values compute on-demand when the admin opens the panel or clicks Refresh. Hybrid data source: state-derived counters come from `admin_kpi_metrics` (event-driven upsert); totals and windowed counts come from live `SELECT COUNT(*)` with new indexes.
- R5. Recent activity stream shows the last 50 rows from `mutation_receipts` across all accounts, ordered by `applied_at DESC`. Each row displays mutation kind, scope type, scope id, account id (last 6 chars only for privacy), applied_at timestamp. Admin + ops can view.
- R6. Recent activity stream refreshes on manual button click only. No polling, no websocket.
- R7. Account ops metadata panel allows admin to set, per account: `ops_status` (one of `active` / `suspended` / `payment_hold`), `plan_label` (free text, max 64 chars), `tags_json` (list of strings, max 10 tags × 32 chars each), `internal_notes` (free text, max 2000 chars). Admin-only mutation; ops-role accounts see values but cannot edit.
- R8. `account_ops_metadata` changes do NOT affect authentication, authorisation, or learner access in P1. They are GM-facing metadata only. Enforcement (e.g. blocking suspended accounts from sign-in) is explicitly deferred to a follow-up pass.
- R9. Error log centre panel lists the last ~50 error events, ordered by `last_seen DESC`. Filterable by status. Each row shows: error_kind, message first line, route_name, occurrence_count, first_seen, last_seen, status. Admin + ops can view.
- R10. Admin can transition an error event's status among `open` → `investigating` → `resolved` → `ignored`. Status changes use the mutation receipt pattern with account-scoped idempotency; the acting admin's `account_id` is the scope.
- R11. Client captures errors via: React `<ErrorBoundary onError={...}>` in `src/app/App.jsx`, `window.addEventListener('error', ...)` and `window.addEventListener('unhandledrejection', ...)` in `src/main.js`. Coverage extends to all adult + learner surfaces, including demo and signed-out states.
- R12. Client captures MUST redact before POST: drop any field whose name matches `/^(answer_raw|prompt|learner_name|email|password|session|cookie|token)$/i`; truncate `message` to first newline and cap at 500 chars; keep only the first frame of the stack; cap `user_agent` at 256 chars. Server re-runs redaction before DB write.
- R13. Error capture POST endpoint (`POST /api/ops/error-event`) is public (no session required), but rate-limited per source IP via the existing `request_limits` + `consumeRateLimit` pattern. Bucket `ops-error-capture-ip`, limit 60 requests per 10 minutes. Rate-limited responses return `{ ok: false, code: 'ops_error_rate_limited' }` with status 429.
- R14. Error event fingerprint = `sha256(error_kind + '|' + message_first_line + '|' + first_frame)`. Dedup via `INSERT ... ON CONFLICT(fingerprint) DO UPDATE SET last_seen = excluded.last_seen, occurrence_count = ops_error_events.occurrence_count + 1`.
- R15. Public error endpoint caps request body size at 8KB; oversized bodies return `{ ok: false, code: 'ops_error_payload_too_large' }` with status 400 and are NOT persisted. The endpoint does NOT call `requireSameOrigin` (error contexts may have invalid Origin headers); abuse protection is rate-limit + redaction + size cap.
- R16. All `/api/admin/*` routes introduced by this plan MUST call `requireSameOrigin(request, env)` (mirroring every existing admin route). All admin mutations use the mutation-receipt pattern with `requestId` + `correlationId`.
- R17. `/api/hubs/admin` payload is extended **additively only** — four new sibling fields added (`dashboardKpis`, `opsActivityStream`, `accountOpsMetadata`, `errorLogSummary`). All existing fields (`permissions`, `account`, `learnerSupport`, `demoOperations`, `contentReleaseStatus`, `importValidationStatus`, `auditLogLookup`, `monsterVisualConfig`) remain untouched.
- R18. New `/api/admin/*` GET routes for panels that need independent refresh: `GET /api/admin/ops/kpi`, `GET /api/admin/ops/activity`, `GET /api/admin/ops/error-events`. Each returns its own JSON payload so clicking Refresh on one panel does not re-fetch the entire admin hub.
- R19. Reads of `account_ops_metadata`, `ops_error_events`, and `admin_kpi_metrics` MUST soft-fail on `SqliteError: no such table` (pre-migration deploy ordering) using the `isMissingTableError` pattern at `worker/src/repository.js:140-146`. Admin hub must remain loadable even if migration 0010 has not yet been applied to the remote D1.
- R20. All three new tables are created in a single migration `worker/migrations/0010_admin_ops_console.sql`. Forward-only, no DOWN migration. All `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`.
- R21. **Atomicity must be batch-based, NOT `withTransaction`-based.** All admin mutations (U5) and the public error ingest (U6) compose their UPDATE/UPSERT statement + mutation-receipt / counter-bump statements into a single `batch(db, [stmt1, stmt2, ...])` call using `storeMutationReceiptStatement` + `bumpAdminKpiMetricStatement`. Rationale: `worker/src/d1.js:60-81` shows `withTransaction` degrades to a plain handler invocation in production D1 (savepoints only fire when `db.supportsSqlTransactions === true`, which is a test-only flag). `batch(db, [...])` is the only primitive the platform treats atomically. Canonical template: `worker/src/repository.js:2019, 2121, 2246` (Monster Visual Config save/publish/restore). **Do NOT mirror `updateManagedAccountRole` (line 2317) for atomicity — it inherits the same `withTransaction`-in-prod-is-no-op weakness and is kept only as a permission-gate + payload-validation shape reference.**
- R22. **Fresh-insert detection for `ops_error_events` must use `INSERT ... ON CONFLICT ... RETURNING` semantics** (or `changes()`), NOT `last_seen === first_seen` equality. Rationale: two rapid POSTs in the same millisecond with the same fingerprint land `first_seen === last_seen` on BOTH writes, double-bumping the `.status.open` counter. Use `INSERT INTO ops_error_events (...) VALUES (...) ON CONFLICT(fingerprint) DO UPDATE SET last_seen=excluded.last_seen, occurrence_count=ops_error_events.occurrence_count+1 RETURNING (first_seen = ?now) AS is_fresh` — or equivalent `changes()` pattern — and bump the fresh-insert counter only when `is_fresh` is true.
- R23. **Public error endpoint body size enforcement is byte-level, not header-level.** Read request body as `ArrayBuffer`, check `byteLength > 8192` → reject with 400 `ops_error_payload_too_large`, THEN decode + parse. `content-length` header is advisory only and can be omitted by a crafted client. Extend `worker/src/http.js` with `readJsonBounded(request, maxBytes)` or inline the byte-cap check in the new route handler.
- R24. **Fingerprint replay resistance.** Store the raw fingerprint inputs (`errorKind`, `messageFirstLine`, `firstFrame`) alongside the fingerprint column. Dedup lookup on INSERT path compares `(errorKind, messageFirstLine, firstFrame)` tuple match — NOT fingerprint-equality alone — to accept dedup. Keep the `fingerprint` column as the UNIQUE index backing (it is still a cheap lookup key) but treat it as a cache, not as the authoritative identity. This does not prevent an attacker from crafting identical three-tuple inputs (they can observe them), but it closes the "I know the SHA output but not the inputs" attack vector and makes the dedup logic explicit about what equality means.
- R25. **`internal_notes` is admin-only on read.** `readAccountOpsMetadataDirectory(db, { actorPlatformRole })` returns `internal_notes` only when `actorPlatformRole === 'admin'`. Ops-role readers receive the same rows with `internal_notes` replaced by `null` (or the field omitted). Same applies to the additive `/api/hubs/admin` payload field `accountOpsMetadata` and the dedicated `GET /api/admin/accounts-ops-metadata` endpoint. Client normaliser reflects this — `internalNotes` may be `null` even when the admin set it.
- R26. **Activity stream `scope_id` masking.** For entries where `scope_type='learner'`, replace `scope_id` (the full learner UUID) with last 8 chars. For `scope_type='account'`, keep the existing last-6-char account mask. For `scope_type='platform'`, show the full plan-local identifier (e.g. `ops-error-event:<id>`) — those are not PII.
- R27. **Ops-metadata panel UI must carry a non-enforcement notice.** The `AccountOpsMetadataPanel` renders a persistent, prominent callout adjacent to the `ops_status` control reading (UK English): `"Status labels are informational only. Suspension, payment-hold, and deactivation are not currently enforced by sign-in. Enforcement is planned for a later release."` This prevents an admin from believing they blocked a user by toggling the flag. Remove the callout only when auth enforcement lands in a follow-up plan.
- R28. **Redaction regex expansion.** Extend R12's redaction substring regex to include ks2-specific sensitive tokens: `answer_raw|prompt|learner_name|email|password|session|cookie|token|spelling_word|punctuation_answer|grammar_concept|prompt_token|learner_id`. Additionally, the `route_name` field strips any path segment matching `/^[0-9a-f-]{32,36}$/i` (UUID-shaped) or `/^learner-[a-z0-9]+$/i` and replaces with `[id]`. The expanded regex runs both client-side (in `redactClientErrorEvent`) and server-side (in `recordClientErrorEvent`).
- R29. **Error message word-content leak mitigation.** Server-side redaction additionally strips all-uppercase word-like tokens of 4+ letters from `messageFirstLine` (e.g. the literal `PRINCIPAL` in `"Cannot read property 'PRINCIPAL' of undefined"`) by replacing them with `[word]`. Rationale: KS2 spelling words may surface in JS runtime errors as property/variable names; the all-caps convention reliably catches them without destroying useful diagnostic text. This is defence in depth; implementer should accept some false positives (proper nouns in error messages) as a fair trade for PII protection.
- R30. **Public route placement does NOT bypass CORS / logging / middleware.** There is no middleware layer in `worker/src/app.js` (confirmed via dispatcher review). The public POST inherits nothing and breaks nothing by placement.
- R31. **Dispatcher pattern-matching for the account ops-metadata route.** `PUT /api/admin/accounts/:accountId/ops-metadata` MUST be added as a regex match (`/^\/api\/admin\/accounts\/([^/]+)\/ops-metadata$/.exec(url.pathname)`), not as literal-equality branch. Place AFTER the literal `/api/admin/accounts` and `/api/admin/accounts/role` branches so those take priority. The existing dispatcher already supports regex via `/^\/api\/auth\/([^/]+)\/start$/` at `worker/src/app.js:331, 339, 356`.

---

## Scope Boundaries

- Do NOT create a parallel `AdminOpsConsole.jsx` or separate admin app. Every new panel is rendered by extending `AdminHubSurface.jsx`.
- Do NOT modify, rename, or move `MonsterVisualConfigPanel`, `AdminAccountRoles`, `DemoOperationsSummary`, or any existing admin hub section.
- Do NOT rename, remove, or repurpose any existing field in the `/api/hubs/admin` payload. Additive-only.
- Do NOT wire `account_ops_metadata.ops_status` into auth / authorization / learner access checks in P1. That is a follow-up pass with its own review bar.
- Do NOT add polling, websockets, BroadcastChannel, or any other automatic refresh mechanism for the activity stream or KPI panel. All refresh is manual.
- Do NOT introduce a new mutation-receipt wrapper (no `withGlobalMutation` etc). Mirror `updateManagedAccountRole` for account-scoped admin writes.
- Do NOT use `requireSameOrigin` on the public error capture endpoint; origins are unreliable from error contexts.
- Do NOT persist raw error stacks, full event JSON, answer-bearing fields, prompts, learner names, emails, session state, or request body content in `ops_error_events`.
- Do NOT modify `/api/bootstrap`, `/api/hubs/parent`, parent hub surface, subject runtime paths, or demo session paths.
- Do NOT run raw `wrangler` or reintroduce `CLOUDFLARE_API_TOKEN` flows. Migrations apply via `npm run db:migrate:remote` / `db:migrate:local`.
- Do NOT copy the `ks2-admin-starter.zip` file set from the origin document verbatim. Its proposed `AdminOpsConsole.jsx`, `admin-ops-repository.js`, `admin-ops-routes.js`, and `admin-ops-panel.css` layout violate R1 (parallel component) and R2 (preservation of existing surface).

### Deferred to Follow-Up Work

- **Event delivery system** (announcements, maintenance banners, XP boosts, content unlocks, reward grants, seasonal events, experiments): separate plan, requires product design for learner-facing consumption surfaces.
- **Feature flags table**: separate plan; should be designed alongside rollout policy decisions and the CPU-capacity telemetry gates already in flight.
- **Realtime-ish polling / live activity stream**: P2 decision. P1 proves the shape with manual refresh; if operator value justifies polling cost, add it with idle-tab detection and capacity telemetry.
- **Enforcement of `ops_status='suspended'` in auth**: P2. Requires separate review against `worker/src/auth.js` session issuance and existing demo-conversion flow.
- **Billing / subscription surfaces**: not in scope; no plan yet.
- **Error event occurrence-graph sparkline / per-route aggregation**: P2 polish.
- **Admin search across learners / accounts beyond what exists**: P2; current `AdminAccountRoles` and learner-support diagnostics cover the current need.

---

## Context & Research

### Relevant Code and Patterns

**Worker server:**

- `worker/src/app.js` — route dispatcher. New admin routes plug in at `worker/src/app.js:552-579` (alongside existing monster-visual admin routes). Public error capture endpoint plugs in BEFORE `worker/src/app.js:352` (before `auth.requireSession(request)`) alongside `/api/demo/session` at `worker/src/app.js:242-264`.
- `worker/src/repository.js` — single-file data layer.
  - `requireAdminHubAccess(account)` at `worker/src/repository.js:929` — admin+ops gate for reads.
  - `requireAccountRoleManager(account)` at `worker/src/repository.js:938` — admin-only gate for writes.
  - `updateManagedAccountRole(db, {...})` at `worker/src/repository.js:2317-2448` — template for account-scoped admin mutation that does not bump `repo_revision`. This is the exact shape `updateAccountOpsMetadata` should follow.
  - `storeMutationReceiptStatement(db, {...}, { guard, exists })` at `worker/src/repository.js:787` — receipt writer that composes into batch alongside data UPDATE.
  - `listMutationReceiptRows(db, accountId, {...})` at `worker/src/repository.js:1590-1610` — current per-account audit helper. Generalise with a new `listRecentMutationReceipts(db, { limit })` that omits the `account_id` filter.
  - `readDemoOperationSummary(db, nowTs)` at `worker/src/repository.js:1612-1635` — template for aggregate COUNT reads; uses `demo_operation_metrics` pre-aggregated counters.
  - `isMissingTableError(err, 'table_name')` at `worker/src/repository.js:140-146` — soft-fail helper for pre-migration deploy states.
  - `readAdminHub(accountId, {...})` at `worker/src/repository.js:4051-4122` — the admin hub builder. Extend with four new sibling fields.
- `worker/src/auth.js:18-19, 274` — `ks2_session` cookie only; no CSRF token. `auth.getSession(request)` is non-throwing; use it for optional `account_id` attribution on the public error endpoint.
- `worker/src/demo/sessions.js:74-89` — `requireSameOrigin(request, env)` pattern; call on all new `/api/admin/*` routes.
- `worker/src/demo/sessions.js:91-114` — `consumeRateLimit(db, { bucket, identifier, limit, windowMs, now })` using `request_limits` table. Reuse verbatim for error-capture IP rate-limit.
- `worker/src/d1.js` — `batch`, `withTransaction`, `sqlPlaceholders`, `first`, `all`, `run`. Full D1 surface.
- `worker/src/http.js` — `json(body, status, headers)`, `readJson(request)`. All JSON responses use `cache-control: no-store`.
- `worker/src/errors.js:82-96` — `HttpError` subclasses + `errorResponse(error)` mapping.

**Migrations:**

- `worker/migrations/0003_mutation_safety.sql:4-20` — `mutation_receipts` table. Required FK target for admin mutations.
- `worker/migrations/0007_full_lockdown_runtime.sql:11-15` — `demo_operation_metrics` is the shape template for `admin_kpi_metrics`.
- `worker/migrations/0008_monster_visual_config.sql` — global admin table with CAS revision, naming convention.
- `worker/migrations/0009_capacity_read_models.sql` — most recent migration; next number is 0010.
- `worker/migrations/0004_production_auth.sql:1-9` (`account_credentials`) — template for 1:1 sidecar table tied to `adult_accounts` via PK+FK.
- `worker/migrations/0004_production_auth.sql:42` — `request_limits` table (the rate-limit backing).

**Client platform:**

- `src/platform/hubs/admin-read-model.js:1-225` — pure-function `buildAdminHubReadModel({...})`. Add four new normalisers alongside `normaliseAuditEntry`, `normaliseDemoOperations`, `normaliseMonsterVisualConfigAdminModel`: `normaliseDashboardKpis`, `normaliseOpsActivityStream`, `normaliseAccountOpsMetadataDirectory`, `normaliseErrorEventSummary`.
- `src/platform/hubs/api.js:56-156` — `createHubApi({...})`. Add `readAdminOpsKpi`, `readAdminOpsActivity`, `readAdminOpsErrorEvents`, `updateAccountOpsMetadata`, `updateOpsErrorEventStatus`, `postClientErrorEvent` (the last is public, does not require auth session).
- `src/platform/hubs/shell-access.js:79` — `READ_ONLY_BLOCKED_ACTIONS` map; add new admin-only action identifiers (`account-ops-metadata-save`, `ops-error-event-status-set`) if client-side blocking of ops-role is needed.
- `src/platform/react/ErrorBoundary.jsx:16-36` — existing React class component. `componentDidCatch(error, info)` already receives `info.componentStack`. Add `onError` prop forwarding (existing code already calls `this.props.onError?.(error, info)` — verify during implementation).
- `src/main.js:2206-2243` — existing global keydown listeners; the correct anchor region to add `globalThis.addEventListener('error', ...)` and `globalThis.addEventListener('unhandledrejection', ...)`.
- `src/main.js:1120-1124, 1145-1202` — `credentialFetch` pattern and optimistic-state-mutate-with-fetch-rollback pattern (`updateAdminAccountRole`). Template for `updateAccountOpsMetadata` and `updateOpsErrorEventStatus` client actions.
- `src/main.js:1736-1759` — existing `admin-accounts-refresh` / `monster-visual-config-*` dispatch handlers; add `admin-ops-kpi-refresh`, `admin-ops-activity-refresh`, `admin-ops-error-events-refresh`, `account-ops-metadata-save`, `ops-error-event-status-set`.
- `src/app/App.jsx:145, 227` — existing `<ErrorBoundary>` wrappings. Pass `onError` prop that forwards to the client error capture helper.

**Client surface:**

- `src/surfaces/hubs/AdminHubSurface.jsx:8-67` (`AdminAccountRoles`) — closest visual template for `AccountOpsMetadataPanel` and `ErrorLogCentrePanel`. Header card, status chip, per-row skill-row grid, `actions.dispatch(...)` pattern.
- `src/surfaces/hubs/AdminHubSurface.jsx:69-97` (`DemoOperationsSummary`) — closest visual template for `DashboardKpiPanel`. Label+value row repeater, timestamp chip.
- `src/surfaces/hubs/AdminHubSurface.jsx:214-292` (`Audit-log lookup` + learner support two-col) — closest visual template for `RecentActivityStreamPanel`.
- `src/surfaces/hubs/MonsterVisualConfigPanel.jsx:127, 316, 327, 340` — permission gate pattern (`canManage`) and `expectedDraftRevision` CAS dispatch pattern. Template for the ops-error-event status PUT payload.
- `src/surfaces/hubs/hub-utils.js` — `formatTimestamp(value)`, `AccessDeniedCard`, `isBlocked`. Use for all timestamp formatting.

**Tests:**

- `tests/worker-hubs.test.js` (449 lines) — integration test pattern: `createWorkerRepositoryServer()` → seed → `server.fetchAs('adult-admin', url, {...})` → assert response shape. New coverage for admin KPI, activity, account-ops metadata PUT, error-event POST + status PUT.
- `tests/worker-monster-visual-config.test.js` (651 lines) — transactional correctness template. Especially: receipt-storage-rollback test at line 234.
- `tests/hub-read-models.test.js` (679 lines) — pure-function tests for `buildAdminHubReadModel`. New assertions for the four new normalisers.
- `tests/hub-api.test.js` (171 lines) — client URL building + error mapping. New coverage for the five new `createHubApi` methods + the public `postClientErrorEvent`.
- `tests/react-hub-surfaces.test.js:31-49` — string-literal regression oracle. **MUST keep every existing assertion green** (especially `/Monster visuals/`, `/Save draft/`, `/Publish/` — these are the preservation proof for `MonsterVisualConfigPanel`). Add one assertion block per new panel with distinct, unambiguous title strings.

### Institutional Learnings

- `docs/mutation-policy.md:60-131, 215-263` — every admin write requires `requestId` + `correlationId` + mutation-receipt idempotency. No merge mode, no silent conflict resolution.
- `docs/operating-surfaces.md:125-145` — Admin / Operations requires `platformRole ∈ {admin, ops}`; mutations are admin-only; ops can inspect but not mutate.
- `docs/operating-surfaces.md:20-25` — "no extra reporting database, no client-only dashboard cache, no subject-owned admin store." `account_ops_metadata`, `ops_error_events`, `admin_kpi_metrics` are operational metadata tables, not reporting caches — they honour this rule.
- `docs/plans/2026-04-25-001-fix-bootstrap-cpu-capacity-plan.md:22-24, 86-89, 107-114` — D1 single-threaded per-DB; Free tier 5M rows read/day + 10ms CPU/request. Live COUNT over unbounded tables is a known capacity risk. `demo_operation_metrics` pattern exists specifically to avoid it.
- `docs/plans/2026-04-25-001-fix-bootstrap-cpu-capacity-plan.md:101, 269, 316` — public telemetry endpoints must use closed-allowlist serialisation, not denylist. Applies to `ops_error_events` ingest.
- `docs/plans/2026-04-25-002-feat-capacity-release-gates-and-telemetry-plan.md:59-60, 138-141, 166-167` — hub payload additive-fields strategy. **Do not create `/api/admin/v2`**; extend `/api/hubs/admin` additively.
- `docs/plans/2026-04-23-001-feat-full-lockdown-runtime-plan.md:98, 162, 288, 312, 532, 714, 831` — layered rate-limit posture (IP + account + session + command-type) for public endpoints. Reuse `request_limits`.
- `docs/plans/james/admin-page/admin-page-p1.md:97` — "I did not run your repo's full npm test/npm run check against these files." The starter-pack doc is explicitly unverified and must not be treated as reference implementation.
- `docs/plans/james/admin-page/admin-page-p1.md:89` — "do not make admin endpoints public or protected only by hidden UI." Every admin mutation path reuses existing `requireAdminHubAccess` / `requireAccountRoleManager` gates.
- `docs/operations/capacity.md:67-70` — PII / answer-bearing payload exposure is a release blocker. Tests must prove redaction on public endpoints.
- `memory/MEMORY.md:1` — `feedback_git_fetch_before_branch_work.md` — always `git fetch origin main` before starting feature work; stale session-start snapshots have caused near-regressions. Applies to the implementing agent when branching from this plan.

### External References

- None. All patterns for D1, Workers, Cloudflare mutation safety, admin hub extension, and React ErrorBoundary usage exist in-repo. The AGENTS.md Cantonese + UK-English convention is honoured in this plan's prose and any product copy.

---

## Key Technical Decisions

- **Single migration `0010_admin_ops_console.sql` for all three new tables.** Rationale: schema review happens once; deploy ordering is simpler; forward-only migration style is already established. All reads use `isMissingTableError` soft-fail to survive Worker-before-D1 deploy ordering.
- **Additive extension of `/api/hubs/admin` + dedicated per-panel refresh GET routes.** Rationale: initial load hydrates every panel through one hub fetch (consistent with current flow); per-panel Refresh buttons hit narrow endpoints so admin opening one panel does not pay the full hub cost. Reviewer-proven pattern per learnings #8.
- **Hybrid KPI strategy, not pure event-driven aggregation.** Rationale: windowed metrics (7d/30d) cannot be precomputed in a fixed-key counter table because the window shifts every second. Event-driven counters fit naturally only for state-derived metrics (error events by status, account-ops mutation volume). For windowed counts, live `COUNT(*)` with dedicated indexes is adequate for KS2 scale and simpler to reason about than bucketed counters. We flag this as a capacity risk and add telemetry (see Risks).
- **No `withGlobalMutation` wrapper introduced. Atomicity uses `batch(db, [...])`, not `withTransaction`.** Rationale: `worker/src/d1.js:60-81` shows `withTransaction` is a no-op under production D1. The canonical atomic template in this codebase is `withMonsterVisualConfigMutation` at `worker/src/repository.js:1914, 2019-2088`, which composes `[updateStatement, storeMutationReceiptStatement(...)]` into a `batch(db, [...])` call. New admin mutations use the same batch pattern plus `bumpAdminKpiMetricStatement` for counter bumps; `updateManagedAccountRole` (line 2317) is kept as a permission-gate + payload-validation shape reference only, not as the atomicity template. See R21. Adding a new mutation primitive still violates AGENTS.md YAGNI, but we explicitly choose the **right existing primitive** (batch-based) over the wrong one (withTransaction-based).
- **Account scope `requestId` space for error-event status changes.** Rationale: the acting admin is an account; using their `accountId` as the receipt scope keeps idempotency per-admin-per-request. Receipt `scopeType='platform'`, `scopeId='ops-error-event:<id>'` records which event was mutated for future audit.
- **Public error endpoint does NOT call `requireSameOrigin`.** Rationale: errors can originate from contexts where Origin is null (file://, extensions, cross-origin scripts, mid-navigation). Origin check would silently drop legitimate error captures. Abuse protection is the combination of (a) IP rate-limit, (b) 8KB body cap, (c) closed-allowlist redaction both client-side and server-side.
- **Strong closed-allowlist redaction, implemented twice.** Rationale: client-side redaction (in `src/main.js` error capture helper) protects against network observation; server-side redaction (in the Worker handler before DB write) is the authoritative gate. Defence in depth matches existing redaction posture for spelling/punctuation UI payloads.
- **No CSRF token introduction.** Rationale: admin mutations reuse the existing same-origin protection; the repo has deliberately not adopted CSRF tokens and this plan is not the place to change that posture.
- **`account_ops_metadata` does NOT bump `adult_accounts.repo_revision`.** Rationale: ops metadata is GM-facing; not learner-visible; does not invalidate client-side account state; mirrors the `updateManagedAccountRole` decision.

---

## Open Questions

### Resolved During Planning

- **Q: Should the error capture endpoint be authenticated?** A: No. Public endpoint so errors in demo/signed-out/session-expired states are captured. Rate-limit + redaction + size cap are the abuse defences. Optionally attach `account_id` when a session cookie is present using `auth.getSession(request)`.
- **Q: Should `ops_status='suspended'` block sign-in in P1?** A: No. P1 is GM metadata only; auth enforcement is a deferred follow-up. Explicitly documented in Scope Boundaries.
- **Q: Should KPI compute cache in Worker memory / KV?** A: No. On-demand compute with indexes is acceptable for KS2 scale. Cache invalidation is a P2 decision once refresh-cost evidence exists.
- **Q: Should Monster Visual Config Panel remain rendered?** A: Yes. Preserved unchanged per R2.
- **Q: Activity stream refresh mode?** A: Manual button only. No polling.
- **Q: Should each panel have its own GET route, or all panels via `/api/hubs/admin`?** A: Both. Initial hub fetch includes all four new sibling fields for fast first render; per-panel Refresh buttons call dedicated narrow routes. Per R17 + R18.

### Deferred to Implementation

- **Exact message-truncation threshold** (500 chars vs 1000) for error events — validate against typical real React error messages during implementation. Default to 500.
- **Exact per-panel loading-state copy** — follow existing admin hub copy register (`Ready` / `Loading` / `Saving ...` chips); no new vocabulary.
- **Whether `account_ops_metadata.tags_json` validation includes a fixed tag allowlist or free-form strings** — start free-form (max-length + max-count bounds only); allowlist can come later if tag sprawl emerges.
- **Whether the error event `status` transitions should be a strict state machine (open → investigating → resolved/ignored, no backwards)** — implementer may enforce in repository helper, or allow any transition with receipt trail. Default: allow any transition; receipts preserve history.
- **Exact Worker-side route file organisation** — new routes may live in `worker/src/repository.js` alongside existing admin helpers, OR split into `worker/src/admin/ops-console.js` if file size becomes unwieldy. Implementer decides based on diff size during U2 + U5.

---

## High-Level Technical Design

> *This illustrates the intended shape and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Admin hub data flow (additive fields only)

```
    AdminHubSurface.jsx
         │
         ├── (preserved) MonsterVisualConfigPanel ── model.monsterVisualConfig
         ├── (preserved) AdminAccountRoles         ── model.permissions + accountDirectory
         ├── (preserved) DemoOperationsSummary     ── model.demoOperations
         ├── (preserved) Content release + audit lookup + learner support
         │
         ├── (new) DashboardKpiPanel                ── model.dashboardKpis
         ├── (new) RecentActivityStreamPanel        ── model.opsActivityStream
         ├── (new) AccountOpsMetadataPanel          ── model.accountOpsMetadata
         └── (new) ErrorLogCentrePanel              ── model.errorLogSummary
                      │
                      │                                 GET /api/hubs/admin   (initial load, all 4 new fields)
                      │                                       │
    per-panel Refresh ├─ GET /api/admin/ops/kpi              ───┐
                      ├─ GET /api/admin/ops/activity          ───┤
                      └─ GET /api/admin/ops/error-events      ───┤
                                                                 │
    admin-only mutations                                         │
                      ├─ PUT /api/admin/accounts/:id/ops-metadata (receipt, CAS on account repo_revision=false variant)
                      └─ PUT /api/admin/ops/error-events/:id/status (receipt, scopeType=platform)
                                                                 │
    public error ingest                                          │
                      POST /api/ops/error-event (rate-limited, redacted, no same-origin)
                                                                 │
                                                                 ▼
                                                          D1 (account_ops_metadata,
                                                              ops_error_events,
                                                              admin_kpi_metrics,
                                                              mutation_receipts)
```

### Hybrid KPI data sources

| Metric | Source | Rationale |
|---|---|---|
| `accounts.total` | `COUNT(*) FROM adult_accounts WHERE COALESCE(account_type,'real') <> 'demo'` | Small N; no index needed |
| `learners.total` | `COUNT(*) FROM learner_profiles` | Small N; no index needed |
| `demos.active` | `COUNT(*) FROM adult_accounts WHERE account_type='demo' AND demo_expires_at > ?now` | Uses existing `idx_adult_accounts_demo_expiry` |
| `practice_sessions.7d` / `.30d` | `COUNT(*) FROM practice_sessions WHERE updated_at > ?cutoff` | **Requires new `idx_practice_sessions_updated`** |
| `event_log.7d` | `COUNT(*) FROM event_log WHERE created_at > ?cutoff` | **Requires new `idx_event_log_created`** |
| `mutation_receipts.7d` | `COUNT(*) FROM mutation_receipts WHERE applied_at > ?cutoff` | **Requires new `idx_mutation_receipts_applied`** |
| `error_events.byStatus.{open,investigating,resolved,ignored}` | `SELECT metric_key, metric_count FROM admin_kpi_metrics WHERE metric_key LIKE 'ops_error_events.status.%'` | Event-driven counter; bumped on insert + status change |
| `account_ops.updates.total` | `SELECT metric_count FROM admin_kpi_metrics WHERE metric_key='account_ops_metadata.updates'` | Event-driven counter; bumped in `updateAccountOpsMetadata` |

### Migration 0010 skeleton (directional, not literal SQL)

```sql
-- admin_kpi_metrics: key-value counters; mirror demo_operation_metrics
CREATE TABLE IF NOT EXISTS admin_kpi_metrics (
  metric_key TEXT PRIMARY KEY,
  metric_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- account_ops_metadata: 1:1 sidecar with adult_accounts
CREATE TABLE IF NOT EXISTS account_ops_metadata (
  account_id TEXT PRIMARY KEY,
  ops_status TEXT NOT NULL DEFAULT 'active',
  plan_label TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  internal_notes TEXT,
  updated_at INTEGER NOT NULL,
  updated_by_account_id TEXT,
  FOREIGN KEY (account_id) REFERENCES adult_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_account_id) REFERENCES adult_accounts(id) ON DELETE SET NULL,
  CHECK (ops_status IN ('active','suspended','payment_hold'))
);

-- ops_error_events: fingerprint-deduped error log
CREATE TABLE IF NOT EXISTS ops_error_events (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  error_kind TEXT NOT NULL,
  message_first_line TEXT NOT NULL,
  first_frame TEXT,
  route_name TEXT,
  user_agent TEXT,
  account_id TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  CHECK (status IN ('open','investigating','resolved','ignored')),
  FOREIGN KEY (account_id) REFERENCES adult_accounts(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_error_events_fingerprint ON ops_error_events(fingerprint);
CREATE INDEX IF NOT EXISTS idx_ops_error_events_status_last_seen ON ops_error_events(status, last_seen DESC, id);
CREATE INDEX IF NOT EXISTS idx_ops_error_events_last_seen ON ops_error_events(last_seen DESC, id);
-- R24: dedup preflight by tuple (authoritative), fingerprint is cache-only
CREATE INDEX IF NOT EXISTS idx_ops_error_events_tuple
  ON ops_error_events(error_kind, message_first_line, first_frame);

-- New indexes for the live windowed COUNT queries
CREATE INDEX IF NOT EXISTS idx_practice_sessions_updated ON practice_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mutation_receipts_applied ON mutation_receipts(applied_at DESC);
```

---

## Implementation Units

- U1. **Migration 0010 + D1 schema**

**Goal:** Ship all three new tables + three supporting indexes in one forward-only migration.

**Requirements:** R20, supports R3, R7, R9, R14, R19.

**Dependencies:** None.

**Files:**
- Create: `worker/migrations/0010_admin_ops_console.sql`
- Test: `tests/worker-migration-0010.test.js` (new, structure-only schema test)

**Approach:**
- Three `CREATE TABLE IF NOT EXISTS` statements: `admin_kpi_metrics` (mirror `demo_operation_metrics` exactly), `account_ops_metadata` (PK + FK on `adult_accounts`, `CHECK` constraint on `ops_status`), `ops_error_events` (PK, unique fingerprint index, status `CHECK`).
- Three `CREATE INDEX IF NOT EXISTS` for the new composite/single indexes on existing tables (`practice_sessions.updated_at`, `event_log.created_at`, `mutation_receipts.applied_at`).
- Forward-only; no DOWN migration.

**Execution note:** Schema-level change only. Test shape; do not test behaviour until U2 exists.

**Patterns to follow:**
- `worker/migrations/0004_production_auth.sql:1-9` (1:1 sidecar table shape).
- `worker/migrations/0007_full_lockdown_runtime.sql:11-15` (`demo_operation_metrics` counter table shape).
- `worker/migrations/0008_monster_visual_config.sql` (global admin table + retained history trigger — read only, not copied).
- `worker/migrations/0009_capacity_read_models.sql:13-37` (composite index naming + `DESC` ordering convention).

**Test scenarios:**
- Happy path: migration file parses as valid SQLite DDL; sqlite3 cli runs without error against a fresh DB.
- Happy path: after running 0001–0010, `admin_kpi_metrics`, `account_ops_metadata`, `ops_error_events` exist with expected columns and constraints (verify via `PRAGMA table_info`).
- Edge case: running 0010 twice is a no-op (every `IF NOT EXISTS` respected); no DDL error.
- Edge case: inserting `ops_error_events` with `status='bogus'` fails the `CHECK` constraint.
- Edge case: inserting `account_ops_metadata` with `ops_status='unknown'` fails the `CHECK` constraint.
- Edge case: unique fingerprint constraint — two inserts with same fingerprint fail the second (the real dedup uses `ON CONFLICT DO UPDATE` or `DO NOTHING` in U6).
- Edge case: verify new composite tuple index `idx_ops_error_events_tuple` exists and supports the R24 preflight lookup `WHERE error_kind=? AND message_first_line=? AND first_frame=?`.
- Edge case: verify new cross-table indexes `idx_practice_sessions_updated`, `idx_event_log_created`, `idx_mutation_receipts_applied` exist and `EXPLAIN QUERY PLAN` for the KPI COUNT queries shows `SEARCH ... USING INDEX`, not `SCAN TABLE`.

**Verification:** `npm run db:migrate:local` applies cleanly; re-run is idempotent; `PRAGMA table_info(admin_kpi_metrics)` / `account_ops_metadata` / `ops_error_events` returns the expected column list.

---

- U2. **Worker read helpers + three panel GET routes + hub payload extension**

**Goal:** Implement the server-side read path for the four new panels. Extend `/api/hubs/admin` additively with four new sibling fields. Expose three dedicated GET routes for per-panel Refresh.

**Requirements:** R3, R4, R5, R6, R9, R17, R18, R19.

**Dependencies:** U1.

**Files:**
- Modify: `worker/src/repository.js` — new helpers `readDashboardKpis`, `listRecentMutationReceipts`, `readAccountOpsMetadataDirectory`, `readOpsErrorEventSummary`, `bumpAdminKpiMetric`, `readAdminHub` extended with four new sibling fields.
- Modify: `worker/src/app.js` — three new routes `GET /api/admin/ops/kpi`, `GET /api/admin/ops/activity`, `GET /api/admin/ops/error-events`.
- Test: `tests/worker-admin-ops-read.test.js` (new) — integration tests for each GET route.
- Test: `tests/worker-hubs.test.js` — extend existing admin hub payload shape assertion to cover the four new sibling fields.

**Approach:**
- All four new helpers call `requireAdminHubAccess(account)` internally (admin + ops can view).
- `readDashboardKpis(db, nowTs)`: single batched D1 call using `Promise.all` of five `scalar` queries (accounts.total, learners.total, demos.active, sessions.7d, sessions.30d, event_log.7d, mutation_receipts.7d) + one `all` query on `admin_kpi_metrics WHERE metric_key LIKE 'ops_error_events.status.%'` + one scalar on `account_ops_metadata.updates`. Return `{ generatedAt, accounts: {total}, learners: {total}, demos: {active}, practiceSessions: {last7d, last30d}, eventLog: {last7d}, mutationReceipts: {last7d}, errorEvents: {byStatus: {open,investigating,resolved,ignored}}, accountOpsUpdates: {total} }`.
- `listRecentMutationReceipts(db, { limit=50 })`: `SELECT ... FROM mutation_receipts ORDER BY applied_at DESC LIMIT ?`. Mask `account_id` to last 6 chars before returning. Cap limit at 50.
- `readAccountOpsMetadataDirectory(db, { accountIds=null })`: LEFT JOIN `adult_accounts a` with `account_ops_metadata om ON om.account_id=a.id` so accounts without metadata still appear with defaults. Return rows ordered by `a.updated_at DESC`.
- `readOpsErrorEventSummary(db, { statusFilter=null, limit=50 })`: `SELECT ... FROM ops_error_events` with optional `WHERE status=?` filter, ordered by `last_seen DESC`, capped at 50.
- Every new helper wraps its `db.prepare(...).all()` / `.first()` in a try/catch that calls `isMissingTableError(err, 'admin_kpi_metrics' | 'account_ops_metadata' | 'ops_error_events')`. On missing-table, return an `empty*Shape()` (mirror `emptyLearnerReadModel` at `worker/src/repository.js:1365`) so admin hub stays loadable pre-migration.
- `readAdminHub(...)` extended to call all four helpers and attach their return values as sibling fields. Existing field order preserved; new fields appended.
- Three GET routes: tiny handlers that check `requireAdminHubAccess` (implicit via repo helpers), read query params (e.g. `?limit=50&status=open`), call the helper, wrap in `json({ ok: true, ...result })`. `requireSameOrigin(request, env)` called on each (per R16). Mirror `/api/admin/accounts` at `worker/src/app.js:535-538` structure.
- `bumpAdminKpiMetric(db, key, nowTs)`: helper that runs `INSERT INTO admin_kpi_metrics (metric_key, metric_count, updated_at) VALUES (?, 1, ?) ON CONFLICT(metric_key) DO UPDATE SET metric_count = metric_count + 1, updated_at = ?`. Standalone variant for places where batching is not needed. Wrapped with `isMissingTableError` soft-fail so a pre-migration deploy does not break writes.
- `bumpAdminKpiMetricStatement(db, key, nowTs, delta = 1)`: prepared-statement variant that returns a D1 `PreparedStatement` for batch composition. Used by U5 and U6 to bump counters in the same atomic `batch()` call as the main UPDATE + receipt. Supports negative `delta` for the status-swap decrement half.
- `consumeRateLimit` (currently private in `worker/src/demo/sessions.js:91-114`) MUST be exported from `worker/src/demo/sessions.js` OR extracted to a shared helper module. Implementer decides. Do NOT duplicate into a fourth copy. Preference: export from `demo/sessions.js` (minimal diff, clear lineage) despite the mild cross-module-concern smell.

**Patterns to follow:**
- `worker/src/repository.js:1612-1635` (`readDemoOperationSummary`) — COUNT aggregate shape.
- `worker/src/repository.js:1590-1610` (`listMutationReceiptRows`) — mutation-receipt query shape.
- `worker/src/repository.js:1090-1107` (`listAccountDirectoryRows`) — multi-table LEFT JOIN + `GROUP_CONCAT` pattern.
- `worker/src/repository.js:1365-1397` — `isMissingTableError` soft-fail template.
- `worker/src/repository.js:4051-4122` (`readAdminHub`) — the builder to extend.
- `worker/src/app.js:535-550` — admin GET/PUT route handler shape.

**Test scenarios:**
- Happy path — `GET /api/admin/ops/kpi` as admin returns all expected counters as integers ≥ 0 (`tests/worker-admin-ops-read.test.js`).
- Happy path — `GET /api/admin/ops/activity` as admin returns up to 50 rows ordered by `applied_at DESC`, with masked account_ids (last 6 chars).
- Happy path — `GET /api/admin/ops/error-events` as admin returns rows ordered by `last_seen DESC` when events exist.
- Happy path — `GET /api/admin/ops/error-events?status=open` filters by status.
- Happy path — `GET /api/hubs/admin` as admin returns extended payload with `dashboardKpis`, `opsActivityStream`, `accountOpsMetadata`, `errorLogSummary` as sibling fields alongside all existing fields.
- Happy path (preservation) — Every existing field in the admin hub payload (`permissions`, `account`, `learnerSupport`, `demoOperations`, `contentReleaseStatus`, `importValidationStatus`, `auditLogLookup`, `monsterVisualConfig`) is present and unchanged in shape.
- Edge case — `GET /api/admin/ops/activity?limit=9999` caps at 50.
- Edge case — empty DB: KPI returns zeros, activity returns empty array, error events returns empty array, account_ops metadata returns full account list with default `ops_status='active'` from the LEFT JOIN.
- Edge case — missing `admin_kpi_metrics` table (pre-migration deploy): `readDashboardKpis` returns a zeroed shape rather than 500. Error event reads also soft-fail.
- Error path — `GET /api/admin/ops/kpi` as `parent` role returns 403 (same gate as existing admin routes).
- Error path — `GET /api/admin/ops/kpi` without session returns 401.
- Error path — `GET /api/admin/ops/kpi` with missing Origin header in production returns 403.
- Integration — Bumping `admin_kpi_metrics` via `bumpAdminKpiMetric` then reading `dashboardKpis` reflects the new count.

**Verification:** `npm test` includes new tests and all pass. Existing `tests/worker-hubs.test.js` assertions remain green. `npm run check` passes.

---

- U3. **Admin read-model normalisers + hub-api client extensions**

**Goal:** Add four pure-function normalisers to `admin-read-model.js` and five new methods + one public method to the hub API client so the client can consume + refresh the new panels.

**Requirements:** Supports R3, R5, R7, R9, R10, R11, R17, R18.

**Dependencies:** U2.

**Files:**
- Modify: `src/platform/hubs/admin-read-model.js` — new normalisers `normaliseDashboardKpis`, `normaliseOpsActivityStream`, `normaliseAccountOpsMetadataDirectory`, `normaliseErrorEventSummary`; include new keys in `buildAdminHubReadModel` output.
- Modify: `src/platform/hubs/api.js` — new methods `readAdminOpsKpi()`, `readAdminOpsActivity({limit})`, `readAdminOpsErrorEvents({status,limit})`, `updateAccountOpsMetadata({accountId, patch, mutation})`, `updateOpsErrorEventStatus({eventId, status, mutation})`, `postClientErrorEvent(event)`.
- Test: `tests/hub-read-models.test.js` — extend with assertions for the four new normalisers and the extended `buildAdminHubReadModel` output.
- Test: `tests/hub-api.test.js` — extend with coverage for URL building + error mapping for the six new methods.

**Approach:**
- Each normaliser follows the existing `normaliseAuditEntry` / `normaliseDemoOperations` pattern: defensive input handling (null / array / non-object → empty defaults), numeric coercion via `Number(...) || 0` with `Math.max(0, ...)`, string coercion with `typeof x === 'string' ? x : ''`, timestamp coercion via existing `asTs(value, 0)`.
- `normaliseDashboardKpis`: input from Worker `dashboardKpis`; output `{ generatedAt, accounts: {total}, learners: {total}, demos: {active}, practiceSessions: {last7d, last30d}, eventLog: {last7d}, mutationReceipts: {last7d}, errorEvents: {byStatus: {open,investigating,resolved,ignored}}, accountOpsUpdates: {total} }` — all numeric fields ≥ 0.
- `normaliseOpsActivityStream`: input from `opsActivityStream`; output `{ generatedAt, entries: [{requestId, mutationKind, scopeType, scopeId, accountIdMasked, correlationId, statusCode, appliedAt}] }`. Each entry reuses the existing `normaliseAuditEntry` shape where possible.
- `normaliseAccountOpsMetadataDirectory`: input from `accountOpsMetadata`; output `{ accounts: [{accountId, email, displayName, platformRole, opsStatus, planLabel, tags: [string], internalNotes, updatedAt, updatedByAccountId}] }`. `tags` parsed from `tags_json` with a try/catch defaulting to empty array.
- `normaliseErrorEventSummary`: input from `errorLogSummary`; output `{ generatedAt, totals: {open, investigating, resolved, ignored, all}, entries: [{id, errorKind, messageFirstLine, routeName, occurrenceCount, firstSeen, lastSeen, status, accountIdMasked}] }`.
- `api.js` methods mirror the existing `readAdminHub` / `saveMonsterVisualConfigDraft` shapes using the existing `fetchHubJson` helper. `postClientErrorEvent` uses the same fetch but does NOT require an auth session (endpoint is public); implementer should create a thin variant or pass a no-op `authSession` for this one call.

**Patterns to follow:**
- `src/platform/hubs/admin-read-model.js:20-44` (`normaliseAuditEntry`, `normaliseDemoOperations`) for normaliser shape.
- `src/platform/hubs/api.js:83-155` (existing hub API methods) for fetch + error-map shape.
- `src/platform/hubs/api.js:41-54` (`fetchHubJson`) for the error-handling contract.

**Test scenarios:**
- Happy path — `normaliseDashboardKpis({accounts:{total:42},...})` returns the expected shape with all numeric fields present.
- Edge case — `normaliseDashboardKpis(null)` returns a fully-defaulted zeroed shape.
- Edge case — `normaliseDashboardKpis({errorEvents:{byStatus:null}})` returns defaulted zeros for each status.
- Edge case — `normaliseOpsActivityStream({entries:'not an array'})` returns empty entries array.
- Edge case — `normaliseAccountOpsMetadataDirectory` with `tags_json='malformed['` falls back to empty array without throwing.
- Edge case — `normaliseErrorEventSummary` with `totals.all=NaN` clamps to 0.
- Happy path — `readAdminOpsKpi()` builds URL `/api/admin/ops/kpi`, threads auth headers, returns parsed JSON.
- Happy path — `readAdminOpsActivity({limit: 25})` builds URL with `limit=25` query param.
- Happy path — `postClientErrorEvent({errorKind:'TypeError',messageFirstLine:'x is undefined',...})` builds URL `/api/ops/error-event` POST with JSON body.
- Error path — server returns `{ok:false, code:'forbidden', message:'...'}` → method throws Error with `.status`, `.code`, `.payload` set.

**Verification:** `npm test` passes including new test blocks. `buildAdminHubReadModel` output includes all four new sibling fields and all existing fields remain intact.

---

- U4. **Four new panels in `AdminHubSurface.jsx` (read-only, no mutation controls rendered)**

**Goal:** Render four new panels as siblings in `AdminHubSurface.jsx` consuming the extended `model.*` shape. Preserve every existing section exactly as-is. **Mutation controls (edit inputs in `AccountOpsMetadataPanel`, status select in `ErrorLogCentrePanel`, the R27 non-enforcement callout) are NOT rendered in U4** — they land with U5. This prevents a half-broken state where UI controls are visible but their dispatch handlers do not exist. Display-only: row data is read from the model; Refresh buttons (hitting U2's GET routes) work.

**Requirements:** R1, R2, R3, R5, R7 (read-only portion), R9 (read-only portion), R17, R25 (client honours `internalNotes` possibly-null), R26 (client renders masked `scope_id`).

**Dependencies:** U3.

**Files:**
- Modify: `src/surfaces/hubs/AdminHubSurface.jsx` — add four new local panel components (`DashboardKpiPanel`, `RecentActivityStreamPanel`, `AccountOpsMetadataPanel`, `ErrorLogCentrePanel`) and render them as new `<section>` siblings.
- Create (optional split): `src/surfaces/hubs/AdminOpsPanels.jsx` — if `AdminHubSurface.jsx` grows past ~500 lines, implementer may extract the four panels into a sibling file and import them. Decision during implementation.
- Test: `tests/react-hub-surfaces.test.js` — extend with one assertion block per new panel title + one content string each. **Every existing assertion must remain green** (preservation proof for MonsterVisualConfigPanel).

**Approach:**
- New panels rendered BETWEEN existing sections (likely: KPI panel near the top after the subject header; activity stream after KPI; account ops metadata and error log centre lower, before the learner-support two-col). Placement choice preserves the current reading order.
- Each panel is read-only in U4 — mutation controls are NOT rendered yet. `AccountOpsMetadataPanel` shows values as static text (no `<input>` / `<select>` / `<textarea>` / Save button). `ErrorLogCentrePanel` shows the current status as a static chip (no status-change select). Mutation controls appear in U5. This guarantees: if U4 lands without U5, no control exists that dispatches an unhandled action.
- `DashboardKpiPanel`: visual template from `DemoOperationsSummary` (`AdminHubSurface.jsx:69-97`). Single card with label/value row repeater + `formatTimestamp(generatedAt)` chip + Refresh button dispatching `admin-ops-kpi-refresh`.
- `RecentActivityStreamPanel`: visual template from `Audit-log lookup` section (`AdminHubSurface.jsx:214-228`). Card header + Refresh button dispatching `admin-ops-activity-refresh` + skill-row list showing `mutationKind / scopeType / scopeId / accountIdMasked / formatTimestamp(appliedAt)`.
- `AccountOpsMetadataPanel` (U4 read-only): visual template from `AdminAccountRoles` (`AdminHubSurface.jsx:8-67`). Card header + Refresh + per-account skill-row with: account email, ops_status **as chip** (not select), plan_label **as text**, tags **as read-only chip list**, internal_notes **as text block** (admins only — ops-role users see `—` per R25). No edit inputs, no Save button, no callout. Edit controls + R27 callout land in U5.
- `ErrorLogCentrePanel` (U4 read-only): custom composition. Card header + status filter chips (filter is a client-side concern; the backend filter param is already supported in U2) + Refresh button + skill-row list showing `errorKind / messageFirstLine / routeName / occurrenceCount / formatTimestamp(lastSeen) / status as chip`. No status select, no transition affordance. Status select lands in U5.
- Distinct, unambiguous title strings for each panel so existing + new string-literal tests remain unambiguous:
  - `"Dashboard overview"`
  - `"Recent operations activity"`
  - `"Account ops metadata"`
  - `"Error log centre"`
- `MonsterVisualConfigPanel` render at line 172 is explicitly untouched.

**Patterns to follow:**
- `src/surfaces/hubs/AdminHubSurface.jsx:8-67` (`AdminAccountRoles`) — panel composition.
- `src/surfaces/hubs/AdminHubSurface.jsx:69-97` (`DemoOperationsSummary`) — simple label/value grid.
- `src/surfaces/hubs/MonsterVisualConfigPanel.jsx:127` — `canManage` pattern (`permissions?.platformRole === 'admin'`).
- `src/surfaces/hubs/hub-utils.js` — `formatTimestamp`.

**Test scenarios:**
- Happy path — SSR render of AdminHubSurface with the extended fixture contains each new panel title (`/Dashboard overview/`, `/Recent operations activity/`, `/Account ops metadata/`, `/Error log centre/`).
- Happy path (preservation) — every existing assertion in `tests/react-hub-surfaces.test.js:31-49` remains green, especially `/Monster visuals/`, `/Save draft/`, `/Publish/`, `/Production platform access/`, `/Mutation receipt stream/`, `/Readable learners/`, `/Grammar diagnostics/`, `/Punctuation diagnostics/`.
- Edge case — when `dashboardKpis` is empty, KPI panel renders zeros not `undefined` or `NaN`.
- Edge case — when `opsActivityStream.entries=[]`, activity panel shows an empty-state message.
- Edge case — when admin permissions say `platformRole='ops'`, `AccountOpsMetadataPanel` renders rows with `internalNotes` as `—` placeholder (R25 redacted); admin sees the full note.
- Edge case — `ErrorLogCentrePanel` status filter chips: clicking "open" triggers an `admin-ops-error-events-refresh` dispatch with `{status:'open'}` which hits the U2 GET route.
- Edge case — `scope_id` masking in activity stream: entries with `scope_type='learner'` render as `<last-8-chars>` of the UUID; `scope_type='account'` as `<last-6-chars>`; `scope_type='platform'` as the full stable identifier (R26).
- Integration — render with `model.monsterVisualConfig` preserved AND new fields present simultaneously (proves additive-fields render path works).

**Verification:** `npm test` passes including `tests/react-hub-surfaces.test.js`. Manual browser render at `https://ks2.eugnel.uk` (per AGENTS.md verification step) shows all panels visible to an admin account; MonsterVisualConfigPanel, role management, and audit lookup unchanged.

---

- U5. **Admin mutations: account ops metadata + error event status + mutation UI controls**

**Goal:** Two new admin-only PUT routes and repository helpers, with mutation-receipt idempotency and admin-only gating, using **batch-based atomicity** (R21). Wire client `actions.dispatch` handlers. Add the mutation UI (edit inputs, Save button, status select) that U4 deliberately did not render. Add the R27 non-enforcement callout.

**Requirements:** R7 (write portion), R8, R10, R16, R21, R25 (server enforces actor-role for `internalNotes` read/echo), R27, R31 (dispatcher regex match).

**Dependencies:** U2, U3, U4.

**Files:**
- Modify: `worker/src/repository.js` — new helpers `updateAccountOpsMetadata(db, {...})`, `updateOpsErrorEventStatus(db, {...})`. Both call `requireAccountRoleManager` (admin-only). **Atomicity uses `batch(db, [updateStmt, receiptInsertStmt, ...counterBumpStmts])`** — see R21.
- Modify: `worker/src/app.js` — new routes: regex-matched `PUT /api/admin/accounts/:accountId/ops-metadata` (per R31) and regex-matched `PUT /api/admin/ops/error-events/:eventId/status`. Both call `requireSameOrigin` + read `mutation` envelope.
- Modify: `src/main.js` — new action handlers `account-ops-metadata-save` and `ops-error-event-status-set`. Optimistic local state patch + `credentialFetch` PUT + rollback on failure, mirroring `updateAdminAccountRole` at `src/main.js:1145-1202`.
- Modify: `src/surfaces/hubs/AdminHubSurface.jsx` — U4's read-only `AccountOpsMetadataPanel` gains edit inputs (ops_status select, plan_label text input, tags inline chip editor, internal_notes textarea, Save button). Gated on `canManage = permissions.platformRole === 'admin'`. R27 non-enforcement callout rendered adjacent to `ops_status` control. U4's read-only `ErrorLogCentrePanel` gains status select next to each row.
- Test: `tests/worker-admin-ops-mutations.test.js` (new) — integration tests for both PUTs including atomicity/rollback under batch semantics.

**Approach:**
- `updateAccountOpsMetadata`: Inputs `{ actorAccountId, actorPlatformRole, targetAccountId, patch: {opsStatus?, planLabel?, tags?, internalNotes?}, mutation: {requestId, correlationId} }`. Call `requireAccountRoleManager` (admin-only). Validate: `opsStatus` in enum; `planLabel` ≤ 64 chars; `tags` array of strings, ≤ 10 items, each ≤ 32 chars; `internalNotes` ≤ 2000 chars. **Compose statements into `batch(db, [upsertMetadataStmt, storeMutationReceiptStatement(...), bumpAdminKpiMetricStatement('account_ops_metadata.updates', nowTs)])`** — entire batch commits atomically or none of it does. Before dispatching batch: idempotency check via `first(db, 'SELECT ... FROM mutation_receipts WHERE account_id=? AND request_id=?', ...)` — if match, return stored response; if same id + different hash, throw `HttpError(409, 'idempotency_reuse')`. Receipt `scopeType='account'`, `scopeId=targetAccountId`, `mutationKind='admin.account_ops_metadata.update'`. Return refreshed directory row (with `internalNotes` echoed back to admin; ops-role would never reach this path since route is admin-gated).
- `updateOpsErrorEventStatus`: Inputs `{ actorAccountId, actorPlatformRole, eventId, status, mutation: {requestId, correlationId} }`. Call `requireAccountRoleManager`. Validate: `status` in enum. Read current status within the batch preflight (`first(db, 'SELECT status FROM ops_error_events WHERE id=?', [eventId])`) — if event not found, throw `HttpError(404, 'not_found')`; if `oldStatus === status`, return no-op success (idempotent by nature). **Batch** `[updateStatusStmt, storeMutationReceiptStatement(...), bumpAdminKpiMetricStatement('ops_error_events.status.'+oldStatus, nowTs, -1), bumpAdminKpiMetricStatement('ops_error_events.status.'+newStatus, nowTs, +1)]`. Receipt `scopeType='platform'`, `scopeId='ops-error-event:'+eventId`, `mutationKind='admin.ops_error_event.status-set'`. Counter decrement goes to -1; `bumpAdminKpiMetricStatement` must handle negative delta (clamp floor at 0 in the UPDATE: `metric_count = MAX(0, metric_count + ?)`). Return refreshed event row.
- Client `account-ops-metadata-save`: dispatches via `credentialFetch('/api/admin/accounts/:accountId/ops-metadata', {method:'PUT', body:JSON.stringify({patch, mutation})})`; optimistically updates the local model directory row then rolls back on response `ok:false`.
- Client `ops-error-event-status-set`: similar pattern; optimistic update of status, rollback on failure.
- U4 `AccountOpsMetadataPanel` gains: `{canManage}` prop-gated edit block. When `canManage`, render inputs + R27 callout. When not, render read-only view from U4 untouched.
- U4 `ErrorLogCentrePanel` gains: per-row status `<select>` when `canManage`.

**Patterns to follow:**
- `worker/src/repository.js:1914-2088` (`saveMonsterVisualConfigDraft` + `withMonsterVisualConfigMutation`) — **canonical batch-based atomic template**, including receipt statement composition and integration with `batch()`.
- `worker/src/repository.js:2317-2448` (`updateManagedAccountRole`) — **only as permission-gate + payload-validation shape reference**, NOT as atomicity template (it uses `withTransaction` which degrades to no-op under production D1).
- `worker/src/repository.js:747-825` (`storeMutationReceipt`, `storeMutationReceiptStatement`) — receipt writer; the `-Statement` variant returns a prepared statement for batch composition.
- `worker/src/app.js:331, 339, 356` (`/^\/api\/auth\/([^/]+)\/start$/`) — regex dispatcher pattern for parameterised paths (R31).
- `src/main.js:1145-1202` (`updateAdminAccountRole`) — client optimistic-update pattern.

**Test scenarios:**
- Happy path — admin PUT `/api/admin/accounts/:id/ops-metadata` with `{patch:{opsStatus:'suspended'}, mutation:{requestId, correlationId}}` returns 200 and refreshed row shows `opsStatus='suspended'`.
- Happy path — admin PUT `/api/admin/ops/error-events/:id/status` with `{status:'resolved', mutation}` returns 200 and event row shows `status='resolved'`.
- Happy path — after status PUT, `admin_kpi_metrics.byStatus.resolved` incremented and `.open` decremented.
- Idempotency — same `requestId` replays return the stored response without a second UPDATE.
- Idempotency reuse — same `requestId` + different payload returns 409 `idempotency_reuse`.
- Edge case — `opsStatus='bogus'` returns 400 `validation_failed`; no DB write.
- Edge case — `planLabel` 65 chars returns 400; no DB write.
- Edge case — `tags` with 11 items returns 400; no DB write.
- Edge case — `internalNotes` 2001 chars returns 400; no DB write.
- Edge case — error-event PUT for non-existent `eventId` returns 404 `not_found`.
- Error path — PUT as `ops` role returns 403 (admin-only per R8/R10).
- Error path — PUT as `parent` role returns 403.
- Error path — PUT as demo account returns 403 (`requireAdminHubAccess` blocks demo accounts per `worker/src/repository.js:929`).
- Error path — missing `Origin` header in production returns 403 (`requireSameOrigin`).
- Error path — malformed JSON body returns 400.
- Integration — after PUT, `GET /api/hubs/admin` reflects the new ops_status / error status in the extended payload fields; receipt appears in `listMutationReceiptRows` + cross-account `listRecentMutationReceipts`.
- Integration — **batch atomicity** under production-D1-equivalent conditions: if the receipt-insert statement inside the batch fails (simulate via prepared-statement injection in the test harness), the UPDATE + counter bumps also do NOT commit. Mirror `tests/worker-monster-visual-config.test.js:234-283` — which actually exercises batch-based atomicity, not savepoint-based. The test must run against the production-D1-shaped mock, not the savepoint-enabled SQLite shim.
- Integration — status-swap counter correctness: `open → investigating`, then `investigating → resolved`, then `resolved → open`: after each PUT, re-read `admin_kpi_metrics` and assert counters sum to 1 across all statuses for that single event. Verify `MAX(0, ...)` floor prevents drift below zero.
- Integration — R27 callout rendered: `AccountOpsMetadataPanel` in admin role contains the exact non-enforcement warning string `"Status labels are informational only. Suspension, payment-hold, and deactivation are not currently enforced by sign-in. Enforcement is planned for a later release."`. Extend `tests/react-hub-surfaces.test.js` to assert this string.

**Verification:** `npm test` passes. Manual browser test: as admin, open Admin Hub, edit an account's notes/status, observe the change persists and a new receipt appears in the activity stream. Transition an error event `open → investigating → resolved`, observe KPI counts update after refresh.

---

- U6. **Public error capture pipeline: endpoint + redaction + client hooks**

**Goal:** Build the public `POST /api/ops/error-event` endpoint with full defence stack (byte-level size cap + IP rate-limit + expanded redaction + replay-resistant dedup), the client-side redaction helper, and wire global capture hooks.

**Requirements:** R11, R12, R13, R14, R15, R21 (batch atomicity for UPSERT + counter bump), R22 (RETURNING-based fresh-insert detection), R23 (byte-level body cap), R24 (fingerprint-plus-tuple dedup), R28 (expanded redaction regex), R29 (all-caps word scrubbing), R30 (no middleware to respect).

**Dependencies:** U1, U2 (needs `bumpAdminKpiMetricStatement`).

**Files:**
- Create: `src/platform/ops/error-capture.js` — exports `redactClientErrorEvent(raw)`, `captureClientError({source, error, info})`, `installGlobalErrorCapture({credentialFetch})`.
- Modify: `src/main.js` — call `installGlobalErrorCapture(...)` near the existing global keydown listener block (around line 2243).
- Modify: `src/app/App.jsx` — add `onError={handleBoundaryError}` prop to the **single** existing `<ErrorBoundary>` at line 145 (the closing tag at line 227 wraps the same boundary; only one `onError` wiring site exists). `handleBoundaryError(error, info)` dispatches `captureClientError` with source `'react-error-boundary'`.
- Modify: `worker/src/repository.js` — new helper `recordClientErrorEvent(db, { clientEvent, sessionAccountId, nowTs })`. Recompute fingerprint server-side (do NOT trust client). Preflight read: `first(db, 'SELECT id, first_seen FROM ops_error_events WHERE error_kind=? AND message_first_line=? AND first_frame=? LIMIT 1', [...])` — per R24, this is the authoritative dedup key, fingerprint is a cache. Branch: (a) if existing row found, `batch(db, [updateLastSeenAndBumpCountStmt])` — one statement, no counter bump. (b) if not, **batch** `[insertStmt (with RETURNING id, first_seen), bumpAdminKpiMetricStatement('ops_error_events.status.open', nowTs)]`. Return `{ eventId, deduped }`. Wrap reads/writes in `isMissingTableError` soft-fail so pre-migration state returns `{eventId: null, deduped: false, unavailable: true}`.
- Modify: `worker/src/http.js` — add `readJsonBounded(request, maxBytes)` helper: `const buffer = await request.arrayBuffer(); if (buffer.byteLength > maxBytes) throw new HttpError(400, 'payload_too_large'); try { return JSON.parse(new TextDecoder().decode(buffer)); } catch { return {}; }`. Existing `readJson` kept as-is for the non-public callers.
- Modify: `worker/src/app.js` — new public route `POST /api/ops/error-event` placed BEFORE `auth.requireSession(request)` at line 352. Calls `readJsonBounded(request, 8192)`, validates shape, invokes `consumeRateLimit` (which U2 exported from `worker/src/demo/sessions.js`) with bucket `ops-error-capture-ip`, redacts server-side (per R12 + R28 + R29), calls `repository.recordClientErrorEvent`. Returns `{ ok: true, eventId, deduped }` or structured failure codes.
- Modify: `worker/src/demo/sessions.js` — export `consumeRateLimit` (per U2 note). Cosmetic refactor only; no behaviour change.
- Modify: `src/platform/react/ErrorBoundary.jsx` — confirmation-only: `this.props.onError?.(error, info)` already present at line 27. No change needed.
- Test: `tests/worker-ops-error-capture.test.js` (new) — endpoint integration tests including replay/poison attempt, byte-cap bypass attempt.
- Test: `tests/client-error-capture.test.js` (new) — pure-function tests for `redactClientErrorEvent` including R28 + R29 patterns.

**Approach:**
- **Client-side redaction (`redactClientErrorEvent`)** — run BEFORE network send:
  - Closed allowlist: return only `{ errorKind, messageFirstLine, firstFrame, routeName, userAgent, timestamp }`.
  - Truncate `messageFirstLine` to first newline and cap at 500 chars.
  - Keep only first frame of stack (split by `\n`, take `[0]`, cap 300 chars).
  - Cap `userAgent` at 256 chars.
  - **Expanded regex (R28):** strip substrings matching `/answer_raw|prompt|learner_name|email|password|session|cookie|token|spelling_word|punctuation_answer|grammar_concept|prompt_token|learner_id/i` even inside surviving fields — replace with `[redacted]`.
  - **All-caps word scrubbing (R29):** in `messageFirstLine`, replace runs of 4+ consecutive uppercase ASCII letters with `[word]` (e.g. `"Cannot read property 'PRINCIPAL' of undefined"` → `"Cannot read property '[word]' of undefined"`). KS2 spelling words surface as all-caps JS property names in errors; this catches them without destroying diagnostic text.
  - `routeName`: read from `location.pathname`, cap at 128 chars, strip query + hash. **Additionally (R28):** replace any path segment matching `/^[0-9a-f-]{32,36}$/i` (UUID-shaped) or `/^learner-[a-z0-9]+$/i` with `[id]`.
- **Client hooks (`installGlobalErrorCapture`)**:
  - `globalThis.addEventListener('error', (event) => captureClientError({source: 'window.onerror', error: event.error, info: {message: event.message, filename: event.filename}}))`
  - `globalThis.addEventListener('unhandledrejection', (event) => captureClientError({source: 'unhandled-rejection', error: event.reason}))`
  - `captureClientError` builds the raw event, runs `redactClientErrorEvent`, POSTs via `credentialFetch('/api/ops/error-event', {method:'POST', body: JSON.stringify(redacted)})`. Fire-and-forget; swallow response errors (never let error capture become a new error).
  - Bounded queue: if 10 unsent events are already in flight, drop oldest. Jittered backoff on network failure (start 1s, max 60s, ±25% jitter), **non-retryable** on 4xx responses (per learnings #10).
- **ErrorBoundary wire**: `onError` prop in `App.jsx` wraps the existing boundary call, extracts `info.componentStack` first line as `firstFrame`, dispatches to `captureClientError` with source `'react-error-boundary'`.
- **Server-side**:
  - Route placed before line 352 alongside `/api/demo/session`. Does NOT call `requireSameOrigin` per R15. Per R30, no middleware layer exists in the dispatcher; nothing to inherit.
  - Body read via `readJsonBounded(request, 8192)` — **byte-level** check via `request.arrayBuffer()` (R23). Oversize → 400 `ops_error_payload_too_large`.
  - `consumeRateLimit(db, { bucket:'ops-error-capture-ip', identifier: clientIp(request), limit:60, windowMs:10*60*1000, now: nowTs })`. Rate-limited → 429 `ops_error_rate_limited` + bump `admin_kpi_metrics.ops_error_events.rate_limited` counter.
  - Server-side redaction re-runs R12 + R28 + R29 (same expanded regex and all-caps scrubbing as client). Defence in depth: do NOT assume client redaction happened.
  - `fingerprint = sha256(errorKind + '|' + messageFirstLine + '|' + firstFrame)` computed server-side via Web Crypto `crypto.subtle.digest`.
  - **Replay-resistant dedup (R22, R24):** preflight tuple-lookup on `(error_kind, message_first_line, first_frame)` returns the existing row id if match. If matched, batch an UPDATE-only statement (`last_seen=?, occurrence_count=occurrence_count+1 WHERE id=?`). If not matched, batch an INSERT with `ON CONFLICT(fingerprint) DO NOTHING RETURNING id` (handles fingerprint-replay attacks — if a collision occurred, the INSERT silently drops and the preflight handles the "already existed" case on retry) plus the `.status.open` counter bump statement. The counter bump happens only when the INSERT actually landed (detectable via `changes()` or `RETURNING`).
  - **`account_id` attribution (Finding 6 mitigation):** attach only if `auth.getSession(request)` returns a valid non-demo session AND the `routeName` does NOT start with `/demo/`. Demo sessions → `null`. Real session on a demo route → `null` (prevents operator-self-exposure correlation).

**Patterns to follow:**
- `worker/src/demo/sessions.js:91-114` (`consumeRateLimit`) — rate-limit backing.
- `worker/src/demo/sessions.js:126-141` (`protectDemoCreate`) — public-endpoint abuse-protection template.
- `worker/src/app.js:242-264` (`POST /api/demo/session`) — public-endpoint route shape (placed before `requireSession`).
- `worker/src/repository.js:828-841` (`ensureAccount` ON CONFLICT) — upsert-with-dedup SQL pattern.
- `worker/src/repository.js:230-275` (`redactSpellingUiForClient`) — server-side redaction discipline.
- `src/platform/core/repositories/api.js` (`bootstrapBackoffDelay`, `BOOTSTRAP_COORDINATION_LEASE_MS`) — jittered-backoff template for client retries (per learnings #10).

**Test scenarios:**
- Happy path — client `redactClientErrorEvent({errorKind:'TypeError', message:'x is undefined', stack:'TypeError: x is undefined\n  at foo (bar.js:12)\n  at ...', userAgent:'Mozilla/5.0 ...'})` returns redacted shape with first-line message + first frame only.
- Happy path — `POST /api/ops/error-event` with valid payload returns `{ok:true, eventId, deduped:false}` and creates row with `status='open'`, `occurrence_count=1`.
- Happy path — second POST with same fingerprint returns `{ok:true, deduped:true}` and increments `occurrence_count` to 2 without changing `status`.
- Happy path — `admin_kpi_metrics.ops_error_events.status.open` bumped only on fresh insert, not on dedup.
- Happy path — signed-in admin's error captures `account_id` attached.
- Happy path — demo-session error captures `account_id` NULL (demo sessions are not attributed).
- Edge case — client redaction strips a field named `answer_raw` in the message body.
- Edge case — client redaction replaces `learner_name=Alice` substring in a stack line with `[redacted]`.
- Edge case (R28) — client redaction strips `spelling_word=PRINCIPAL` from message body.
- Edge case (R28) — `routeName = '/learner/abc123-def-456-789-ghi/spelling'` becomes `/learner/[id]/spelling`.
- Edge case (R29) — `messageFirstLine = "Cannot read property 'PRINCIPAL' of undefined"` becomes `"Cannot read property '[word]' of undefined"` after server-side scrub.
- Edge case (R29) — legitimate 3-letter acronyms (`URL`, `TTS`, `API`) are NOT scrubbed (threshold is 4+ letters).
- Edge case (R23) — 9KB payload via `content-length: 1` header bypass attempt: `readJsonBounded` reads actual ArrayBuffer length, rejects with 400 `ops_error_payload_too_large` and no DB write.
- Edge case (R23) — missing `content-length` header + 10KB body: ArrayBuffer size check catches, rejects, no DB write.
- Edge case — `errorKind` with special chars (unicode, null bytes) sanitised before fingerprint.
- Edge case — trailing whitespace / BOM in `messageFirstLine` trimmed.
- Error path — 61st request in 10min from same IP returns 429 `ops_error_rate_limited`.
- Error path — malformed JSON returns 400.
- Error path — missing required fields (`errorKind`, `messageFirstLine`) returns 400 `validation_failed`.
- Error path (critical redaction) — POST with `{messageFirstLine:'learner Alice solved answer=PRINCIPAL', errorKind:'Error'}` stores a redacted version with no `learner` / `Alice` / `PRINCIPAL` tokens visible to admin read (`tests/worker-ops-error-capture.test.js` must assert the stored row does NOT contain these tokens).
- Integration — React `<ErrorBoundary>` in `App.jsx`: simulate a render error, verify `captureClientError` called with correct source and shape.
- Integration — `window.onerror` fires: verify POST issued with correct payload shape.
- Integration — after POST, `GET /api/admin/ops/error-events` returns the new event to an admin; `GET /api/admin/ops/kpi` `errorEvents.byStatus.open` incremented.
- Integration — bounded queue: 15 rapid errors → 10 POSTed, 5 dropped (oldest); no uncaught exceptions thrown from the error capture system itself.
- Integration — 4xx response (e.g. 429 from rate limit) is non-retryable; client does not re-enqueue.
- Integration — 503 (transient network) triggers jittered backoff retry up to a cap, then gives up.
- Security — **fingerprint replay poison attack** (Finding 1): given a real error already stored with `{errorKind:'TypeError', messageFirstLine:'x is undefined', firstFrame:'at foo (bar.js:12)'}`, send a crafted POST with identical three-tuple. System correctly treats as dedup (via R24 preflight), increments `occurrence_count`, updates `last_seen`. Now verify the **tuple integrity is preserved**: if the attacker tries to shift the canonical tuple by sending `{errorKind:'TypeError', messageFirstLine:'x is undefined\nEVIL_PAYLOAD', firstFrame:'at foo (bar.js:12)'}`, the `messageFirstLine` truncation to first newline strips `EVIL_PAYLOAD` before the tuple lookup, so no new row is created and `occurrence_count` bumps once. Attacker cannot inject text into admin-visible fields.
- Security — **fingerprint collision attempt** (R24): two requests with the same three-tuple resolve to the same row (correct); two requests with different three-tuples that happen to hash to the same fingerprint (theoretical SHA-256 collision) trigger the `ON CONFLICT DO NOTHING` fallback — the second row fails to insert, but the preflight tuple-lookup catches the case and falls through to the existing-row UPDATE path. No data loss.
- Security — **`account_id` not attached on demo routes** (Finding 6): admin signed-in session + error fires while on `/demo/spelling` route → stored event has `account_id = NULL`.
- Security — **internalNotes redaction on activity stream**: if an admin's `account_ops_metadata.update` mutation included an `internalNotes` value, the activity stream must NOT surface that content. Test: admin updates notes, ops-role requests `GET /api/admin/ops/activity` — response entries show `mutationKind='admin.account_ops_metadata.update'` but no `internalNotes` payload in any field.

**Verification:** `npm test` passes. Manual smoke: trigger a synthetic client error (`throw new Error('synthetic-test')` from browser devtools) → row appears in Error Log Centre panel within one Refresh. Inspect stored row in D1 to verify no PII, no answer text, no learner name, no session content.

---

## System-Wide Impact

- **Interaction graph:**
  - `/api/hubs/admin` payload grows by four sibling fields. Every existing consumer (`AdminHubSurface.jsx`, `admin-read-model.js`) must tolerate new unknown fields without breaking — the normaliser pattern already does this, but extended assertions in `tests/hub-read-models.test.js` prove it.
  - `src/main.js` dispatch surface grows by five new action ids (`admin-ops-kpi-refresh`, `admin-ops-activity-refresh`, `admin-ops-error-events-refresh`, `account-ops-metadata-save`, `ops-error-event-status-set`). Existing ids unchanged.
  - Global `window.error` / `unhandledrejection` listeners are new; no prior listeners existed for these events, so no conflict.
  - `<ErrorBoundary onError={...}>` prop added at two existing usage sites in `App.jsx`; previously unused prop slot, so no consumer change.
- **Error propagation:**
  - Client capture pipeline swallows its own errors (never crash a crashing app). Server-side failures during ingest are logged and return a structured code; the client backoff handles retry.
  - Admin mutation failures propagate via the existing hub-api client error shape (`.status`, `.code`, `.payload`); UI displays the code and allows retry.
  - Missing-table soft-fail means a pre-migration deploy still loads the admin hub but new panels show empty/zero values with a subtle "Loading..." or "Unavailable" chip.
- **State lifecycle risks:**
  - Optimistic updates in `account-ops-metadata-save` and `ops-error-event-status-set` must roll back on server failure. Template exists at `src/main.js:1145-1202`.
  - `admin_kpi_metrics` counter drift: error-event status transitions recompute-and-bump two keys (old status -1, new status +1). If the UPDATE succeeds but the status-key bump fails mid-transaction, counters drift. Mitigation: all UPDATEs + counter bumps happen inside the same `withTransaction` boundary.
  - Client bounded queue overflow: 10 in-flight cap; drop-oldest policy. Documented; not a bug.
- **API surface parity:**
  - No existing `/api/hubs/admin` consumer outside the admin hub itself. No parallel consumers to update.
  - The hub-api client is versioned alongside the read model; adding new methods is additive.
- **Integration coverage:**
  - End-to-end admin hub render with all four new panels AND preserved MonsterVisualConfigPanel simultaneously (extended `tests/react-hub-surfaces.test.js`).
  - Error capture pipeline end-to-end: React boundary fires → client redacts → server redacts → D1 INSERT ON CONFLICT → admin GET reflects → admin status PUT → KPI counter reflects.
  - Receipt-rollback correctness for both admin mutations (mirror the monster visual test pattern).
- **Unchanged invariants:**
  - `MonsterVisualConfigPanel` renders at its current slot; all `monster-visual-config-*` action ids unchanged.
  - `AdminAccountRoles`, `DemoOperationsSummary`, content release section, audit lookup section, learner support section — no changes.
  - `/api/hubs/admin` existing fields (`permissions`, `account`, `learnerSupport`, `demoOperations`, `contentReleaseStatus`, `importValidationStatus`, `auditLogLookup`, `monsterVisualConfig`) — no changes.
  - `/api/bootstrap`, `/api/hubs/parent`, parent hub surface, subject runtime paths, demo session paths — no changes.
  - `adult_accounts.repo_revision` is NOT bumped by ops-metadata writes (intentional — ops metadata is not learner-state-affecting).
  - Session cookie, same-origin check, mutation policy — no changes to any of these core boundaries.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| **D1 COUNT cost at scale.** Live COUNT over `event_log`, `practice_sessions`, `mutation_receipts` is a known capacity risk per learnings #5. Current event volume is small but will grow. | New indexes `idx_event_log_created`, `idx_practice_sessions_updated`, `idx_mutation_receipts_applied` added in migration 0010. Refresh is manual (no polling). KPI endpoint logs its own `rows_read` telemetry following the Phase 2 capacity-telemetry pattern. Explicit risk entry: "admin KPI refresh cost is unproven at classroom scale; re-evaluate with production probe if event_log volume exceeds 500K rows." |
| **Deploy ordering: Worker deploys before D1 migration completes.** Admin hub would 500 on missing tables without soft-fail. | Every read of `admin_kpi_metrics`, `account_ops_metadata`, `ops_error_events` wrapped in `isMissingTableError` soft-fail (per `worker/src/repository.js:140-146` template). Hub renders with empty / zero values until migration lands. |
| **Public error endpoint abuse.** Unauthenticated POST is a classic abuse vector. | IP rate-limit (60 / 10min) via existing `request_limits`; 8KB body cap; closed-allowlist redaction (both sides); no Origin leak (intentional per R15). Additional aggregate counter `admin_kpi_metrics.ops_error_events.rate_limited` exposes abuse attempt volume in the KPI panel. |
| **Error capture leaking PII / answer-bearing content.** Release blocker per learnings #3 and `docs/operations/capacity.md:67-70`. | Redaction implemented twice (client + server) with closed allowlist. Dedicated test `tests/worker-ops-error-capture.test.js` asserts stored rows do not contain known sensitive tokens. Manual QA before first production deploy includes inspecting 10 recent stored rows in D1. |
| **Retry storm from client error capture.** Errors in the capture path could themselves queue more errors, triggering a runaway loop. | Capture code wrapped in top-level try/catch; never throws; bounded queue of 10; drop-oldest on overflow; jittered backoff; non-retryable on 4xx responses. Per learnings #10. |
| **Monster Visual Config regression.** `AdminHubSurface.jsx` edits could accidentally remove or break the preserved panel. | Explicit assertion `/Monster visuals/` + `/Save draft/` + `/Publish/` preserved in `tests/react-hub-surfaces.test.js`. Visual review during implementation. U4 verification step: manual browser check against `https://ks2.eugnel.uk`. |
| **Mutation-receipt scope-id space collision.** New receipts use `scopeType='platform'` with `scopeId='ops-error-event:<id>'`. If a different plan reuses the same scope space for a different entity, audit trail ambiguity. | Prefix `'ops-error-event:'` is distinctive. Document the scope-id convention in code comments at receipt-write sites. |
| **KPI counter drift via mid-transaction failure.** `withTransaction` is a no-op in production D1 (see `worker/src/d1.js:60-81`). If `bumpAdminKpiMetric` fails after a status UPDATE succeeded, the counter permanently drifts. | Per R21, all UPDATE + counter-bump pairs compose into a single `batch(db, [...])` call — the only production-D1 primitive that treats statements atomically. `MAX(0, ...)` floor in `bumpAdminKpiMetricStatement` prevents negative counters if an order-of-operations bug produces a spurious decrement. Test case (U5) injects a simulated batch failure and asserts all statements rolled back together. |
| **Fingerprint replay / dedup-poison attack.** Attacker sends crafted POSTs matching a known error's three-tuple inputs to overwrite `last_seen` and inflate `occurrence_count`, poisoning admin triage priority. | Per R24, dedup authoritative key is the tuple `(error_kind, message_first_line, first_frame)` via index `idx_ops_error_events_tuple`; fingerprint is cache-only. Attack still allows legitimate dedup increments but cannot inject false tuples (first-line truncation + all-caps scrubbing bounds surface area). Aggregate `ops_error_events.rate_limited` counter exposes unusual POST volume from single sources. |
| **`internal_notes` information disclosure to ops-role.** Admin writes candid account notes; ops-role can view via `readAccountOpsMetadataDirectory` unless filtered. | Per R25, `readAccountOpsMetadataDirectory` accepts `actorPlatformRole` and returns `internal_notes=null` for non-admin actors. Same rule applied in the `/api/hubs/admin` payload field. Client `normaliseAccountOpsMetadataDirectory` tolerates null. Test asserts ops-role response has no note content. |
| **`ops_status='suspended'` deceptive affordance.** Admin sets flag, believes account is suspended, is wrong. | Per R27, `AccountOpsMetadataPanel` renders a persistent callout beside the `ops_status` control explicitly stating labels are informational. Callout removed only when auth enforcement ships (follow-up pass). |
| **KS2 content leaking via error `messageFirstLine`.** Spelling words surface as all-caps property names in runtime errors. | Per R29, all-caps runs of 4+ letters replaced with `[word]` server-side. Per R28, ks2-specific redaction tokens expanded. Dedicated regression test `tests/worker-ops-error-capture.test.js` asserts stored rows contain no curriculum content for seeded payloads. |
| **Activity stream leaking learner UUIDs via `scope_id`.** Ops-role can see full learner UUIDs from mutation receipts, pairing with account_id last-6 enables learner-activity profiling. | Per R26, `listRecentMutationReceipts` output masks learner-scoped `scope_id` to last 8 chars. Client normaliser preserves mask. |
| **Byte-level body cap bypass via `content-length` omission.** Header-only check can be bypassed by malicious clients omitting the header. | Per R23, `readJsonBounded` reads actual `request.arrayBuffer()` and checks `byteLength` before parsing. `content-length` is advisory only; byte-level check is authoritative. |
| **Ops role mis-gating.** If a new panel's edit control accidentally renders for ops-role accounts (who should see-but-not-edit), ops could mutate despite Worker rejecting. | Client-side `canManage = permissions.platformRole === 'admin'` gates rendering of all edit inputs. Worker `requireAccountRoleManager` is the authoritative gate — client block is UX, server block is security. Tests verify both layers. |
| **Starter-pack file-set copying accident.** Implementer may be tempted to copy `ks2-admin-starter.zip` structure from the origin doc. | Scope Boundaries explicitly rejects this. Plan file naming and all file paths differ from the starter-pack proposals. |

---

## Documentation / Operational Notes

- Extend `docs/operating-surfaces.md` after implementation to document the four new panels and the public error-capture endpoint under the existing "Worker API path" section (additive edit, no existing content rewrite).
- Extend `worker/README.md` `/api` route table with the three new admin GET routes, two new admin PUT routes, and the one new public POST route.
- Add a brief section to `docs/mutation-policy.md` documenting the `scopeType='platform', scopeId='ops-error-event:<id>'` convention, and the new `admin.account_ops_metadata.update` / `admin.ops_error_event.status-set` mutation kinds.
- Capacity telemetry: the KPI endpoint should log `capacity.admin_ops_kpi` timing + rows_read per the Phase 2 capacity-telemetry pattern. Document in `docs/operations/capacity.md` after implementation.
- No CHANGELOG file in the repo; commit message + PR description are the release notes.
- Deployment:
  1. `npm test && npm run check` — must pass.
  2. `npm run db:migrate:remote` — apply migration 0010 BEFORE Worker deploy. If the migration is slow or fails, roll back by NOT deploying the Worker (soft-fail pattern means the existing admin hub keeps working).
  3. `npm run deploy` — Worker deploy.
  4. Browser smoke at `https://ks2.eugnel.uk`: sign in as admin, open Admin / Operations, verify each new panel loads, `MonsterVisualConfigPanel` unchanged, trigger a synthetic error via devtools (`throw new Error('smoke-test')`), verify it appears in the error log centre within one refresh.
- If an error event's redaction is found leaking something post-ship, emergency mitigation: temporarily disable the public POST route (`/api/ops/error-event`) at the edge; client capture fails quietly; triage the leak; ship a fix. The endpoint's optional nature makes this safe.

---

## Sources & References

- **Origin document:** `docs/plans/james/admin-page/admin-page-p1.md` (AI starter-pack note; treated as feature-description input, not as authoritative implementation. Scope locked via planning bootstrap.)
- **Sibling plans:**
  - `docs/plans/james/sys-hardening/sys-hardening-p1.md` — stabilisation-pass companion; this plan's scope is explicitly NOT hardening but does honour the capacity risk and redaction discipline called out there.
  - `docs/plans/2026-04-24-002-feat-monster-visual-config-centre-plan.md` — most recent admin-panel extension; structural and pattern template.
  - `docs/plans/2026-04-25-001-fix-bootstrap-cpu-capacity-plan.md` — D1 capacity / telemetry context; KPI panel honours its cost discipline.
  - `docs/plans/2026-04-25-002-feat-capacity-release-gates-and-telemetry-plan.md` — additive-fields hub payload strategy.
  - `docs/plans/2026-04-23-001-feat-full-lockdown-runtime-plan.md` — rate-limit layering template for public endpoints.
- **Relevant code (repo-relative):**
  - `worker/src/app.js`, `worker/src/repository.js`, `worker/src/auth.js`, `worker/src/demo/sessions.js`, `worker/src/d1.js`, `worker/src/http.js`, `worker/src/errors.js`
  - `worker/migrations/0001_platform.sql` through `worker/migrations/0009_capacity_read_models.sql`
  - `src/platform/hubs/admin-read-model.js`, `src/platform/hubs/api.js`, `src/platform/hubs/shell-access.js`
  - `src/platform/react/ErrorBoundary.jsx`
  - `src/surfaces/hubs/AdminHubSurface.jsx`, `src/surfaces/hubs/MonsterVisualConfigPanel.jsx`, `src/surfaces/hubs/hub-utils.js`
  - `src/app/App.jsx`, `src/main.js`
  - `tests/worker-hubs.test.js`, `tests/worker-monster-visual-config.test.js`, `tests/hub-read-models.test.js`, `tests/hub-api.test.js`, `tests/react-hub-surfaces.test.js`
- **Supporting docs:**
  - `docs/mutation-policy.md`, `docs/operating-surfaces.md`, `docs/full-lockdown-runtime.md`, `docs/ownership-access.md`, `docs/operations/capacity.md`, `docs/architecture.md`, `docs/repositories.md`
  - `AGENTS.md`
- **Related PRs (for review context, not formal dependencies):**
  - Recent admin-hub-adjacent PRs: #159 (punctuation P2 U4), #158 (grammar U7), #156 (grammar U6), #151 (grammar Enter key fix) per `git log --oneline -5`.
- **External docs used:** none. All patterns are in-repo.
