# Operating surfaces: Parent Hub and Admin / Operations

This note describes the first thin SaaS operating surfaces added on top of the hardened backend, permission rules, and spelling content model.

The goal of this pass is not to build a full dashboard suite.
The goal is to prove that the platform can expose real read models for adult-facing surfaces without pushing reporting logic into subject engines or inventing separate side stores.

## Scope

This pass adds two read surfaces:

- **Parent Hub**
- **Admin / Operations**

They are intentionally thin.
They reuse the durable data already owned by the platform:

- learner profiles
- subject state
- practice sessions
- event log
- spelling content bundles
- mutation receipts

No extra reporting database, no client-only dashboard cache, and no subject-owned admin store were added.

## Role model

There are now two separate permission lines.

### Platform role

Stored at the account level.

Current values:

- `parent`
- `admin`
- `ops`

These roles answer questions like:

- can this account open Parent Hub?
- can this account open Admin / Operations?

### Learner membership role

Stored at the account-to-learner membership level.

Current values:

- `owner`
- `member`
- `viewer`

These roles answer questions like:

- can this account read this learner?
- can this account write learner-scoped data?
- can this learner appear in diagnostics?

The two axes are deliberate.
A platform admin role does not erase learner membership checks, and a parent role does not unlock admin surfaces.

## Parent Hub

Parent Hub is a learner-facing adult read model.
It currently shows:

- learner overview
- due work / current focus
- recent sessions
- broad strengths
- broad weaknesses
- misconception patterns
- progress snapshot cards
- export entry points

### Current data source

Parent Hub is built from the durable spelling learner state:

- spelling progress map inside `child_subject_state`
- recent spelling sessions inside `practice_sessions`
- spelling retry / correction signals inside `event_log`
- the currently published spelling runtime snapshot

### Current permission rule

Parent Hub requires:

- platform role `parent` or `admin`
- readable learner membership (`owner`, `member`, or `viewer`)

That keeps the surface explicitly separate from Operations-only accounts while letting admins inspect parent-facing learner views for learners they can read.

## Admin Console

The Admin Console is a five-section command centre for support, debugging, content operations, and live ops. All five sections (Overview, Accounts, Debugging & Logs, Content, Marketing) are fully live — no section is marked "coming soon".

Direct entry at `/admin` with hash-based section deep-linking (`/admin#section=debug`, `/admin#section=accounts`, `/admin#section=content`, `/admin#section=marketing`). TopNav shows an "Admin" button for admin/ops users. Login redirect preservation via sessionStorage stash returns admins to the intended section after sign-in.

### Section layout

**Overview** — on-demand KPI counters (accounts, learners, demos, sessions 7d/30d, event log, mutation receipts, error events by status), recent operations activity stream (last 50 mutation receipts, masked identifiers), demo health.

**Accounts** — account search (email/ID/display name with ops_status and platform_role filters), account detail view (linked learners, recent errors, denials, mutations, ops metadata), account role management, ops metadata editing (status, plan label, tags, internal notes), mutation receipt/audit lookup. Account detail links into Debug Bundle generation.

**Debugging & Logs** — composed from four extracted sub-panels (P4 U8: `AdminErrorTimelinePanel`, `AdminRequestDenialsPanel`, `AdminDebugBundlePanel`, `AdminLearnerSupportPanel`; thin shell is 30 lines). Debug Bundle (Worker-authoritative evidence packet aggregating errors, occurrences, denials, mutations, account/learner state, capacity metrics with per-section error boundary; two-field identifier contract: `errorFingerprint` for dedupe/grouping fingerprint, `errorEventId` for `ops_error_events.id` — the UI and API accept both fields independently). Error log centre (status filter, route/kind/date/release/reopened filters, auto-reopen on release transition, build-hash attribution). Error occurrence timeline (per-fingerprint history with release context). Request denial log (filterable by the 5 canonical denial reasons: `account_suspended` → "Account Suspended", `payment_hold` → "Payment Hold", `session_invalidated` → "Session Invalidated", `csrf_rejection` → "CSRF / Same-Origin", `rate_limit_exceeded` → "Rate Limited"; also filterable by route and time range). Learner support/diagnostics.

**Content** — cross-subject content overview (live/placeholder/gated status per subject, error counts, release state), spelling content release/import status, post-Mega spelling debug, post-Mastery seed harness, grammar/punctuation diagnostics panels, Asset & Effect Registry (registry-shaped UI over Monster Visual Config with asset list, effect catalog, bindings, tunables — data model unchanged).

**Marketing / Live Ops** — fully wired UI with announcement and maintenance banner lifecycle (draft, scheduled, published, paused, archived), body_text validation (restricted-safe subset, no raw HTML/JS/CSS), active message delivery via authenticated endpoint for client-runtime banner rendering. P4 U6 wired the Marketing section to the existing backend: `createAdminMarketingApi()` API client, `normaliseMarketingMessage` normaliser, CAS-guarded lifecycle transitions, broad-publish confirmation gate on both `published` and `scheduled` transitions (P4 U4).

### Current data source

Admin Console reuses:

- `platform_monster_visual_config` and `platform_monster_visual_config_versions`
- `account_subject_content`
- spelling, grammar, and punctuation content validation results
- `mutation_receipts`
- `adult_accounts.platform_role`
- `account_ops_metadata` with `ops_status`, `plan_label`, `tags_json`, `internal_notes`
- `ops_error_events` and `ops_error_event_occurrences`
- `admin_request_denials`
- `admin_marketing_messages`
- `admin_kpi_metrics`
- learner profiles + memberships
- learner read models across subjects for support diagnostics
- practice sessions and event log for support context

### Current permission rule

Admin Console requires:

- platform role `admin` or `ops`

This surface is not available to `parent` accounts.

**`ops_status` is enforced at the auth boundary** (P1.5 Phase D): `requireActiveAccount` runs on every authenticated request; `requireMutationCapability` runs on every `POST/PUT/DELETE`. Suspended accounts cannot create sessions (redirect to `/?auth=account_suspended`). Payment-held accounts can read but cannot mutate. Status transitions trigger `status_revision` bump for session invalidation.

Account role management inside the console is narrower:

- listing and changing adult account roles requires platform role `admin`
- `ops` can open the console, but cannot change account roles
- the Worker blocks demoting the last remaining admin
- role changes are written to `adult_accounts.platform_role`
- role changes are idempotent by request id and recorded in `mutation_receipts`

Account search and detail:

- `admin` sees full email and identifiers
- `ops` sees masked email (last 6 chars), masked account ID (last 8 chars), no internal notes, no denial account/learner linkage

Debug Bundle:

- Worker-authoritative aggregation from 7 tables via `/api/admin/debug-bundle`
- per-section error boundary (single table failure returns `null` for that section, not full 500)
- admin sees full identifiers; ops sees masked with no account/learner linkage on denials
- JSON copy is admin-only; human summary copy is available to both roles
- rate-limited at 10 requests/min per session

Monster visual + effect config management is admin-only:

- `admin` can edit the browser-local draft buffer, save the shared cloud draft, publish, and restore a retained version into draft
- `ops` can inspect previews, validation state, changed assets, and blockers, but cannot mutate the config
- the latest 20 published versions are retained for rollback-to-draft
- the Asset & Effect Registry UI presents this through a registry-shaped interface (asset list, effect catalog, bindings, tunables) with the underlying data model unchanged

Marketing / Live Ops:

- only `admin` can create, edit, publish, pause, or archive messages
- `ops` can view live/scheduled messages but cannot mutate
- lifecycle state machine: `draft -> scheduled -> published -> paused -> archived` (Worker-enforced, client cannot skip states)
- `GET /api/ops/active-messages` is an authenticated endpoint (any signed-in role) for banner delivery (fail-open: fetch failure shows no banner, does not block the app)
- marketing messages have zero imports from subject engines — structural invariant enforced by test

See `docs/monster-visual-config.md` for the authoritative publish-blocker list, authoring workflow, bundled-fallback coverage, and the `npm run smoke:production:effect` post-deploy probe.

Production smoke coverage: `scripts/admin-ops-production-smoke.mjs` exercises 14 steps end-to-end against the live deployment — login, admin hub + 4 narrow refresh routes, ops-metadata forward/reverse mutation, error-event ingest + status transition, Debug Bundle generation, denial log read, account search + detail, content overview, marketing messages list, and marketing write-path round-trip (create draft then archive). Steps 1–7 abort on first failure; steps 8–14 continue on failure for maximum coverage per invocation. Exit codes: 0 (all green), 1 (step failure), 2 (usage/config error), 3 (state drift — forward mutation applied but reverse failed).

## Admin console data infrastructure

The Admin Console data infrastructure grew across P1 through P3.

### Public error-capture endpoint

`POST /api/ops/error-event` ingests client-side runtime errors from any surface (adult / learner / demo / signed-out). Unauthenticated, rate-limited per source IP (60 / 10 min via `request_limits`), byte-capped at 8KB via `request.arrayBuffer()` length check, redacted on both sides via closed allowlist + all-caps word scrubbing. Fingerprint dedup authoritative on `(error_kind, message_first_line, first_frame)` tuple; fingerprint SHA-256 is cache-only.

### Active-messages endpoint

`GET /api/ops/active-messages` delivers published announcement and maintenance banners. Authenticated (any signed-in role — parent, admin, or ops) so banners reach all active users. Returns only schema-bound safe fields (`type`, `title`, `body_text`, `severity`). The client banner component fails open (fetch failure shows no banner, does not block the app).

### Request denial logging

Auth/role/rate-limit denials are logged via `ctx.waitUntil()` so the log write happens after the response. Sampling is configurable (default 100%). Denial entries include reason, route, masked identifiers, and timestamp. Bounded retention.

### Error occurrence timeline

Each error fingerprint carries occurrence-level history in `ops_error_event_occurrences`. Occurrences are bounded per fingerprint and pruned on capture. The timeline shows release/build context, route, auth state, and auto-reopen evidence.

### Evidence schema (P6 — schema version 3)

Capacity evidence payloads follow a versioned schema. Version 3 (P6) introduced:

- **Multi-source aggregation.** Evidence rows from different CI shapes (certification-tier, preflight, dense-history smoke) are aggregated into `reports/capacity/latest-evidence-summary.json` by `scripts/generate-evidence-summary.mjs`. The summary distinguishes certification rows from non-certifying preflights so stale or failing evidence is never laundered.
- **Provenance fields.** Every evidence JSON carries `reportMeta.commit` (pinned git SHA), `reportMeta.dirtyTreeFlag`, and `reportMeta.thresholdConfigHash` so `verify-capacity-evidence.mjs` can cross-check the evidence against the threshold config that produced it.
- **Session-manifest metadata.** 60-learner preflight rows include `reportMeta.sessionManifest: true` to denote they used the session-manifest utility (batched demo-session creation) rather than inline demo creation.
- **Admin Production Evidence panel.** The Admin Overview section reads `latest-evidence-summary.json` and surfaces the most recent per-tier decision, including failed and setup-blocked entries, with no optimistic interpretation.

### Content Quality Signals panel (P6)

`GET /api/admin/ops/content-quality-signals` returns per-subject quality indicators surfaced in the Content section as the "Learning Quality Signals" panel (`ContentQualitySignalsPanel`). Each subject card shows:

- **Skill coverage** — percentage of curriculum skills with at least one active template.
- **Template coverage** — total distinct templates deployed versus registered skills.
- **High-wrong-rate detection** — items exceeding the wrong-rate threshold, with a drilldown list when the subject engine provides durable evidence.
- **Availability status** — per-signal availability (`all`, `some`, `none`) so the operator sees exactly which signals have backing data.

The panel is read-only. Signals are computed server-side from durable content state — no client-side heuristics or approximations. A per-section error boundary ensures that a failure in the quality-signals endpoint does not collapse other Content panels.

### Generic asset routes (P6)

P6 introduced generic CAS (compare-and-swap) asset routes that replace asset-specific endpoints with a uniform pattern:

- `PUT /api/admin/assets/:assetId/draft` — save a draft with `expectedDraftRevision` for conflict detection.
- `POST /api/admin/assets/:assetId/publish` — publish the current draft (requires matching draft revision).
- `POST /api/admin/assets/:assetId/restore` — restore a previous published version into draft (requires matching published version).

Currently registered asset handlers: `monster-visual-config`. Additional asset types register by adding entries to the `ASSET_HANDLERS` map in the Worker router. The legacy `/api/admin/monster-visual-config/draft|publish|restore` routes are retained as backward-compatible aliases delegating to the same repository methods.

All generic asset routes require:

- Platform role `admin` (ops cannot mutate assets).
- Same-origin verification (CSRF protection).
- Mutation capability (not `payment_hold` or `suspended`).

### Permission rules

- KPI / activity / error-log / denial-log / occurrence / content-overview / content-quality-signals / production-evidence read: admin + ops.
- Debug Bundle generation: admin + ops (with role-based redaction).
- Account search: admin + ops (ops sees masked email/ID).
- Account detail: admin + ops (ops sees masked email, no internal notes, no denial account linkage).
- Account ops metadata view: admin + ops; `internal_notes` redacted to `null` for ops-role readers.
- Account ops metadata edit: admin only.
- Error-event status transition: admin only.
- Marketing message mutations: admin only.
- Marketing message view: admin + ops.
- Generic asset mutations (draft/publish/restore): admin only.
- KPI reconciliation: admin only.

## Local reference build versus Worker API

There are two ways these surfaces currently appear.

### Local reference build

The browser shell now includes route entry points for Parent Hub and Admin / Operations.
Those views are intentionally honest reference surfaces.

What is real locally:

- read-model shape
- role-aware rendering
- learner summary calculations
- content release / validation summary
- export entry points

What is still placeholder locally:

- mutation-receipt audit lookup

The local build exposes a visible role switcher so the permission rules can be inspected without pretending local-first boot is a finished SaaS session model.

### Worker API path

The Worker now exposes:

- `GET /api/hubs/parent?learnerId=...`
- `GET /api/hubs/admin?learnerId=...&requestId=...&auditLimit=...`
- `GET /api/admin/accounts`
- `GET /api/admin/accounts/search`
- `PUT /api/admin/accounts/role`
- `PUT /api/admin/monster-visual-config/draft` (legacy alias)
- `POST /api/admin/monster-visual-config/publish` (legacy alias)
- `POST /api/admin/monster-visual-config/restore` (legacy alias)
- `PUT /api/admin/assets/:assetId/draft` (generic asset CAS draft)
- `POST /api/admin/assets/:assetId/publish` (generic asset CAS publish)
- `POST /api/admin/assets/:assetId/restore` (generic asset CAS restore)
- `GET /api/admin/ops/kpi`
- `GET /api/admin/ops/activity`
- `GET /api/admin/ops/error-events`
- `GET /api/admin/ops/request-denials`
- `GET /api/admin/ops/accounts-metadata`
- `GET /api/admin/ops/content-overview`
- `GET /api/admin/ops/content-quality-signals`
- `GET /api/admin/ops/production-evidence`
- `POST /api/admin/ops/reconcile-kpis`
- `GET /api/admin/debug-bundle`
- `POST /api/admin/spelling/seed-post-mega`
- `GET /api/admin/marketing/messages`
- `POST /api/admin/marketing/messages`
- `POST /api/ops/error-event` (public, unauthenticated)
- `GET /api/ops/active-messages` (authenticated, any role)

What is real there:

- platform-role enforcement
- learner membership checks
- admin-only account role management
- admin-only monster visual draft/publish/restore mutations
- content release / validation summary from durable content
- audit lookup from durable mutation receipts
- learner diagnostics backed by durable learner data
- readable learner selection for adult surfaces, including viewer memberships
- explicit writable versus read-only learner labels

Signed-in Parent Hub and Admin / Operations consume these Worker hub payloads directly.
They no longer rebuild signed-in hub state locally from the writable learner bootstrap.

`/api/bootstrap` remains writable-only by design.
Readable viewer learners are therefore surfaced inside adult hubs, not promoted into the main subject shell.

## Read-model boundaries

The important boundary rule is unchanged:

- subject engines own pedagogy and session transitions
- repositories own durable state transport
- read models own adult-facing summaries

The spelling engine does **not** own Parent Hub or Admin logic.
The hub read models consume durable records after the fact.

## What is real in this pass

### Real now

- route-level Parent Hub and Admin Console surfaces in the shell
- explicit platform roles and helper rules
- Worker-backed hub endpoints with parallelised admin hub reads and deduped actor resolution
- parent/admin permission tests
- spelling-backed learner summary read model
- admin-only account role assignment backed by D1
- content release status read model
- import / validation summary read model
- audit lookup backed by mutation receipts on the Worker path
- learner support / diagnostics summary
- signed-in hub reads through the shared hub API client
- global published monster visual config delivered through bootstrap for learner rendering
- viewer membership diagnostics with read-only write affordance blocking
- zero-writable signed-in shell state that does not fabricate a learner
- direct `/admin` URL entry with hash-based section deep-linking
- login redirect preservation via sessionStorage stash
- Worker-authoritative Debug Bundle aggregating 7 evidence tables
- error occurrence timeline per fingerprint with release context
- request denial logging via `ctx.waitUntil` with configurable sampling
- account search by email/ID/display name with ops_status and platform_role filters
- account detail view with linked learners, recent errors, denials, mutations
- cross-subject content overview with live/placeholder/gated status per subject
- Asset & Effect Registry UI over Monster Visual Config
- Marketing/Live Ops V0 with lifecycle state machine (draft/scheduled/published/paused/archived)
- active message banner delivery via authenticated endpoint with fail-open client rendering
- `ops_status` enforcement at auth boundary: suspended accounts cannot create sessions; payment-held accounts can read but not mutate

### Still intentionally thin or placeholder

- no billing or subscription surfaces
- no full parent reporting suite
- no editorial CMS for content authoring
- no heavy cross-subject analytics warehouse
- no push-updating / WebSocket dashboards
- no invite flow, organisation model, or rich admin account management beyond search + detail + role assignment
- no viewer learner promotion into the writable subject shell yet
- no scheduled auto-publish for marketing messages (requires Cron Trigger or Durable Object timer)
- no audience targeting beyond "all" for marketing banners
- no per-child marketing personalisation or reward manipulation

## Why this pass stops here

This pass proves the platform can carry adult-facing operating surfaces without collapsing back into subject-specific code blobs or client-only dashboards.

That is enough for the first honest vertical slice.
The next richer reporting work should extend these read models instead of bypassing them.
