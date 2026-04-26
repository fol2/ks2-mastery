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

## Admin / Operations

Admin / Operations is a thin operator skeleton.
It currently shows:

- monster visual config draft/review/publish controls
- spelling content release status
- draft import / validation status
- mutation-receipt audit lookup
- admin-only account role management
- learner diagnostics entry points
- selected learner support summary

### Current data source

Admin / Operations reuses:

- `platform_monster_visual_config`
- `platform_monster_visual_config_versions`
- `account_subject_content`
- spelling content validation results
- `mutation_receipts`
- `adult_accounts.platform_role`
- learner profiles + memberships
- learner spelling read models for support diagnostics

### Current permission rule

Admin / Operations requires:

- platform role `admin` or `ops`

This surface is not available to `parent` accounts.

Account role management inside Operations is narrower:

- listing and changing adult account roles requires platform role `admin`
- `ops` can open Operations, but cannot change account roles
- the Worker blocks demoting the last remaining admin
- role changes are written to `adult_accounts.platform_role`
- role changes are recorded in `mutation_receipts`

Monster visual + effect config management is admin-only:

- `admin` can edit the browser-local draft buffer, save the shared cloud draft, publish, and restore a retained version into draft
- `ops` can inspect previews, validation state, changed assets, and blockers, but cannot mutate the config
- the latest 20 published versions are retained for rollback-to-draft

See `docs/monster-visual-config.md` for the authoritative publish-blocker list, authoring workflow, bundled-fallback coverage, and the `npm run smoke:production:effect` post-deploy probe.

## Admin ops console P1 extensions

The Admin / Operations surface carries four additional panels on top of the existing thin operator skeleton:

- **Dashboard overview** — on-demand KPI counters (accounts, learners, demos, practice sessions 7d/30d, event log 7d, mutation receipts 7d, error events by status, account-ops updates). Computed via live `COUNT(*)` with dedicated indexes on `event_log.created_at`, `practice_sessions.updated_at`, `mutation_receipts.applied_at`; state-derived counters sourced from `admin_kpi_metrics`.
- **Recent operations activity** — last 50 `mutation_receipts` across all accounts, manual refresh only. Account IDs masked to last 6 characters; learner-scoped `scope_id` masked to last 8 characters; platform-scoped IDs shown in full.
- **Account ops metadata** — admin-only edits to `ops_status` (active / suspended / payment_hold), `plan_label`, `tags_json`, `internal_notes`. GM-facing only; **not wired into sign-in enforcement** in P1. A persistent UI callout reflects the deferred enforcement status.
- **Error log centre** — last 50 `ops_error_events`, filterable by status. Admin can transition status among open / investigating / resolved / ignored.

### Public error-capture endpoint

`POST /api/ops/error-event` ingests client-side runtime errors from any surface (adult / learner / demo / signed-out). Unauthenticated, rate-limited per source IP (60 / 10 min via `request_limits`), byte-capped at 8KB via `request.arrayBuffer()` length check, redacted on both sides via closed allowlist + all-caps word scrubbing. Fingerprint dedup authoritative on `(error_kind, message_first_line, first_frame)` tuple; fingerprint SHA-256 is cache-only.

### Permission rules

- KPI / activity / error-log read: admin + ops.
- Account ops metadata view: admin + ops; `internal_notes` redacted to `null` for ops-role readers.
- Account ops metadata edit: admin only.
- Error-event status transition: admin only.

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
- `PUT /api/admin/accounts/role`
- `PUT /api/admin/monster-visual-config/draft`
- `POST /api/admin/monster-visual-config/publish`
- `POST /api/admin/monster-visual-config/restore`

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

- route-level Parent Hub and Admin / Operations surfaces in the shell
- explicit platform roles and helper rules
- Worker-backed hub endpoints
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

### Still intentionally thin or placeholder

- no billing, messaging, or marketing surfaces
- no full parent reporting suite
- no editorial CMS
- no heavy cross-subject analytics warehouse
- no push-updating dashboards
- no worker-backed audit search UI beyond basic lookup output
- no invite flow, organisation model, or rich admin account management beyond basic platform-role assignment
- no viewer learner promotion into the writable subject shell yet
- `ops_status` enforcement at auth boundary: suspended → 403 `account_suspended` on every authenticated request (session creation refused with redirect to `/?auth=account_suspended`); payment_hold → 403 `account_payment_hold` on mutation-receipt paths (GETs remain accessible); session invalidation via `status_revision` bump on every transition. See `docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md` for the full matrix.

## Why this pass stops here

This pass proves the platform can carry adult-facing operating surfaces without collapsing back into subject-specific code blobs or client-only dashboards.

That is enough for the first honest vertical slice.
The next richer reporting work should extend these read models instead of bypassing them.
