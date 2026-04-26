---
title: "refactor: Admin / Operations console P1.5 hardening"
type: refactor
status: active
date: 2026-04-25
deepened: 2026-04-25
origin: docs/plans/james/admin-page/admin-page-p2.md
---

# refactor: Admin / Operations console P1.5 hardening

## Overview

Close the P1→P1.5 hardening gaps the advisory report (`docs/plans/james/admin-page/admin-page-p2.md`) identified as blockers to trustworthy production operation — before any further admin feature expansion, and **before** P2 event delivery. Five phases ship as five separate PRs, each independently reviewable and rollback-safe.

**P1.5 adds:**

1. **Admin truthfulness + UI failure states** (Phase A) — per-panel `generatedAt` rendering; visible refresh-error banners replacing silent `console.error`; mutation-success auto-refresh of dependent panels; KPI real-vs-demo split; `useRef` dirty-form protection against refresh-wipe.
2. **Public endpoint hardening** (Phase B) — single `normaliseRateLimitSubject(request)` helper unifying three `consumeRateLimit` implementations and all call sites with IPv4 / IPv6 `/64` / unknown tiers + optional global bucket; production same-origin smoke test suite.
3. **Data integrity** (Phase C) — `row_version INTEGER` CAS on `account_ops_metadata` with 409 UX ("Keep mine" / "Use theirs"); KPI reconciliation script + admin-only POST route + Cloudflare Cron Trigger; `withTransaction` call-site audit and removal where it is a silent no-op.
4. **`ops_status` enforcement** (Phase D) — enforce `suspended` and `payment_hold` at the auth boundary; session carries `ops_status` (re-read per request, request-scoped memo); self-suspend guard; session invalidation via `status_revision` bump; structured error vocabulary expansion.
5. **Error centre debugging cockpit** (Phase E) — build-hash capture client + server; per-error details drawer; filters (status / route / kind / date-range / "new since last deploy" / "reopened after resolved"); auto-reopen on recurrence in a newer release; `ops_error_events` schema extension for release tracking.

**Preserved unchanged:** `MonsterVisualConfigPanel`, `AdminAccountRoles`, `DemoOperationsSummary`, content-release / import-validation / audit-lookup / learner-support sections, Parent Hub, all subject runtime paths, demo-session lifecycle, and existing mutation-receipt / idempotency contracts. R24 3-tuple authoritative dedup for `ops_error_events` stays load-bearing — Phase E extends schema, never replaces grouping.

---

## Problem Frame

PR #188 shipped a working admin console (dashboard KPIs, ops activity stream, account ops metadata, error log centre, public client-error ingest) but explicitly deferred six follow-ups, each of which has since been flagged as a **production-trust risk** by the `admin-page-p2.md` advisory pass:

1. Admin KPIs can mislead — demo and real-account data are conflated; dashboard and error-centre counters can disagree (drift is acknowledged in code comments).
2. Refresh errors are silent — four narrow-refresh paths swallow failures to `console.error`, leaving the admin to trust stale panels.
3. `ops_status` is a label, not a gate — the UI carries an R27 non-enforcement callout because `suspended` / `payment_hold` have no effect on sign-in or writes.
4. Public error ingest has IPv6 `/64` rotation as a known-deferred rate-limit gap; three parallel `clientIp` copies make systematic fixes brittle.
5. Account metadata lacks CAS — two tabs can silently overwrite each other, and prop-to-state `useEffect` re-sync can wipe dirty edits mid-type.
6. Error centre is a list, not a debugging tool — no release attribution, no drawer, no auto-reopen, no search beyond status.

**Execution posture.** The advisory report recommends hardening over feature expansion, and the P1 completion report's explicit P1.5 deferral list aligns with the five phases here. Per-phase PR is chosen over bundled because Phases A, B, and C have independent risk surfaces (UI, network edge, data) and benefit from independent reviewer focus; D and E have structural dependencies on A (generatedAt envelope) and C (reconciliation + migration precedent) that per-phase sequencing naturally enforces.

---

## Requirements Trace

- R1. Every admin-hub panel surfaces a server-produced `generatedAt` and a visible error state on refresh failure; silent `console.error` is eliminated from the four narrow-refresh paths.
- R2. Successful mutations auto-refresh logically dependent panels (account metadata save → KPI + activity; error status transition → error list + error KPI + activity), without clobbering dirty form state.
- R3. KPI payload separates real accounts / learners / sessions from demo accounts / learners / sessions, and separates client-origin errors from server/admin-origin errors.
- R4. `consumeRateLimit` call sites across `auth.js`, `app.js`, `demo/sessions.js`, and `tts.js` route through a single `normaliseRateLimitSubject(request)` helper with tiered subject keys: per-IPv4 address, per-IPv6 `/64`, `unknown:` bucket for missing / malformed / link-local / ULA / loopback, plus an optional `global:` ceiling for the public ingest endpoint.
- R5. Production same-origin smoke test suite covers admin hub load, all four narrow refreshes, account metadata save, and error status transition; runs post-deploy as part of `npm run audit:production`.
- R6. `account_ops_metadata` grows a monotonic `row_version INTEGER NOT NULL DEFAULT 0` column; `updateAccountOpsMetadata` requires `expectedRowVersion` in the envelope, returns `409 account_ops_metadata_stale` on mismatch, and includes `expectedRowVersion` in the mutation-receipt payload hash so 409-retry is not idempotency-replayed.
- R7. The admin UI on 409 keeps the user's typed buffer, shows an inline diff banner, and offers "Keep mine" (refetch current `row_version` + retry) and "Use theirs" (discard local edit); never auto-refetch-and-retry without user action.
- R8. `admin_kpi_metrics` has a reconciliation script `scripts/admin-reconcile-kpis.mjs` that recomputes counters from authoritative source tables and an admin-only `POST /api/admin/ops/reconcile-kpis` route that the script invokes over the OAuth-wrapped Worker HTTP API; the route is idempotency-gated and single-flight per `metric_key` set.
- R9. A Cloudflare Cron Trigger invokes the reconciliation route daily (default 04:00 UTC); cron failures emit a `capacity.admin_ops_reconcile_cron.failure` event so the admin dashboard can surface silent scheduler failures.
- R10. `withTransaction` is removed from call sites where it currently acts as a silent no-op; each removal is paired with an audit assertion that the remaining `batch()` or plain handler is truly atomic or explicitly non-atomic with a comment explaining why.
- R11. `account_ops_metadata.ops_status` is enforced at the auth boundary: `suspended` → `ForbiddenError` code `account_suspended` on every request after the transition; `payment_hold` → block mutation-receipt paths only (GETs and account-management reads allowed) with code `account_payment_hold`.
- R12. `ops_status` transitions bump a new `account_ops_metadata.status_revision INTEGER NOT NULL DEFAULT 0` column. `account_sessions` grows a `status_revision_at_issue INTEGER NOT NULL DEFAULT 0` column stamped at login. `requireSession()` adds one joined read that rejects with code `session_invalidated` when `sessions.status_revision_at_issue != account_ops_metadata.status_revision`.
- R13. Admins cannot set their own `ops_status` to `suspended` or `payment_hold` — `updateAccountOpsMetadata` rejects with code `self_suspend_forbidden` when `actor.accountId == target.accountId` and incoming `ops_status != 'active'`. The `last_admin_required` precedent (`repository.js:3682`) is the pattern; no global "last admin" guard for `ops_status` is added in P1.5 (deferred).
- R14. Error-capture client payload grows a nullable `release` string from a build-time-defined `__BUILD_HASH__` constant produced by `scripts/build-bundles.mjs`.
- R15. `ops_error_events` grows nullable `first_seen_release TEXT`, `last_seen_release TEXT`, `resolved_in_release TEXT`, and `last_status_change_at INTEGER` columns. Auto-reopen fires only on the `status='resolved' → new event with non-null release ≠ resolved_in_release` transition, with a 24-hour cooldown keyed on `last_status_change_at`.
- R16. Error log centre panel gains a per-row details drawer (expandable `<details>`) exposing full stack frame (admin-only) / first frame (ops) / route / user-agent / first_seen / last_seen / occurrence_count / release-of-first-seen / release-of-last-seen / linked-account-last-6-chars (admin-only) / last 5 occurrence timestamps.
- R17. Error centre supports filters: status, route (substring match on LIKE), kind, date-range (`last_seen >= ?`), "new in this release" (`first_seen_release = :currentRelease`), "reopened after resolved" (`last_status_change_at > 0 AND status = 'open' AND resolved_in_release IS NOT NULL`).
- R18. A central `worker/src/error-codes.js` exports every structured error code string as a named constant. Every `new HttpError(..., '<code>', ...)` call in new code references the constant; existing code refactors opportunistically (not blocking).
- R19. Phase A dirty-form protection uses `useRef` to track dirty status; the prop-to-state `useEffect` accepts the server state only when `!dirtyRef.current`. On save success, clear the ref. On 409, keep the ref true and surface the R7 UI.
- R20. Phase A auto-refresh after mutation is panel-scoped and uses the existing narrow `refreshAdminOps*` helpers. It is suppressed on a panel whose dirty-ref is true for any row (prevents the refresh-wipe edge case from re-entering through the back door).

---

## Scope Boundaries

### Deferred for later

Carried from advisory report — product / version sequencing. Work that will be done eventually but not in P1.5.

- **P2 event delivery system** (`ops_delivery_events`, Draft → Preview → Schedule/Publish → Pause → Archive, audience targeting, canary rollout). Explicitly sequenced *after* P1.5 per the advisory.
- **Broader analytics (learning-quality)** — daily/weekly active learners, skill-strength trends, misconception tags, template wrong-rate. These deserve their own dedicated plan.
- **Admin UI deep polish** — inline validation, character counters, disable-Save-unless-dirty, "saving…" state per row, inline server validation errors (replacing `alert`). Advisory item #8; keep minimal: dirty-form protection is load-bearing for Phase A/C, the rest is follow-up.

### Outside this product's identity

None — P1.5 is all scope-internal.

### Deferred to Follow-Up Work

Plan-local — implementation work intentionally split out of P1.5 PRs to keep review scope tight.

- **`withTransaction` full-repo removal** — P1.5 audits and removes only the call sites touched by Phase C / D. Remaining sites in older handlers (`repository.js:3193, 3623, 4478, 4591`; `auth.js:125, 613, 968`) become a dedicated tech-debt pass.
- **FTS5 search on `ops_error_events`** — Phase E uses `LIKE '%?%'` with a covering index on the route column. Full-text search is a separate spike once the drawer proves admins actually want cross-field search.
- **`payment_hold` fine-grained capability matrix** — P1.5 treats "mutation-receipt path" as the atomic block boundary. A per-feature capability set (`premium_content`, `account_management`, `subject_commands` etc.) is deferred until the business has a real billing flow.
- **`ops_status` applied to demo accounts** — demo accounts ignore `ops_status` at the auth boundary in P1.5; `account_type = 'demo'` already has its own lifecycle path.
- **Client-side dirty-form `beforeunload` warning** — navigate-away protection is nice-to-have; Phase A covers in-surface re-render preservation only.
- **Semver / tagged-release regex widening** — U16 restricts release to `/^[a-f0-9]{6,40}$/` (SHA only). When tagged releases ship, this regex widens deliberately to accept semver shapes, with defence-in-depth redaction still applied.
- **`ops:rotate-smoke-credentials` automation** — U6 establishes scoped smoke service-account credentials. A 30-day automated rotation script is a follow-up, not blocking P1.5.
- **Canary / blue-green release-set awareness** — P1.5's auto-reopen treats all `resolved_in_release != incoming.release` as a reopen trigger. Canary / blue-green patterns would require a `releases` table with rollout state — introduced when canary deploy tooling lands.

---

## Context & Research

### Relevant Code and Patterns

- **Admin surface panel layout** — `src/surfaces/hubs/AdminHubSurface.jsx` (panels: `AdminAccountRoles`, `DashboardKpiPanel`, `RecentActivityStreamPanel`, `DemoOperationsSummary`, `AccountOpsMetadataPanel` + `AccountOpsMetadataRow`, `ErrorLogCentrePanel`). All `generatedAt` source fields are already emitted server-side — Phase A reuses them; no schema change required for the basic timestamp rendering.
- **Narrow-refresh helpers** — `src/main.js:757-795` (`refreshAdminOpsKpi`, `refreshAdminOpsActivity`, `refreshAdminOpsErrorEvents`, `refreshAdminOpsAccountsMetadata`). Each currently swallows failures to `console.error` (`main.js:763, 773, 783, 793`) — Phase A's primary delta lives here.
- **Per-panel patch helpers** — `src/platform/hubs/admin-panel-patches.js` preserves `savingAccountId` / `savingEventId` scalars during refresh; Phase A extends this pattern with per-row dirty-ref awareness.
- **Additive-hub pattern** — hub payload evolution is always sibling-field addition via spread (R17 precedent from `docs/plans/2026-04-25-003-feat-admin-ops-console-extensions-plan.md`). Phase A adds `refreshedAt` / `refreshError` siblings; Phase E adds release-tracking siblings to error rows.
- **CAS precedent** — `repository.js:2354-2577 updateOpsErrorEventStatus` shows the three-layer guard (client-supplied `expectedPreviousStatus` → SQL `AND status = ?` defence-in-depth → post-batch verify). Phase C mirrors this for `account_ops_metadata` using `row_version` instead of `status`.
- **Mutation receipt + payload hash** — `repository.js:172 mutationPayloadHash`, `repository.js:789 storeMutationReceiptStatement`. R6 adds `expectedRowVersion` to the hashed body so CAS-retry is not idempotency-replayed.
- **Rate-limit primitives** — three separate `consumeRateLimit` implementations exist (`auth.js:353`, `demo/sessions.js:56`, `tts.js:61`) all backed by the shared `request_limits` table (`migrations/0004_production_auth.sql:42`). Call sites span ~12 locations. Phase B introduces **one** helper file `worker/src/rate-limit.js` and routes all three implementations through it.
- **`requireSameOrigin` + auth boundary** — `worker/src/request-origin.js:68` (dual mode: strict / sec-fetch-only), `worker/src/auth.js:1187-1199` (`requireSession` inherits `sec-fetch-only`). Phase D's enforcement hooks into `auth.requireSession()` via a new `requireActiveAccount(session)` helper; Phase B's smoke test hammers the strict mode path.
- **D1 atomicity** — `worker/src/d1.js:60-81 withTransaction` is a silent production no-op when `db.supportsSqlTransactions !== true`. Canonical template: `repository.js saveMonsterVisualConfigDraft` (batch + mutation receipt + counter bump in one call). Phase C's reconciliation + CAS path must compose via `batch(db, [stmt1, stmt2, ...])`.
- **Redaction regex parity** — `src/platform/ops/error-capture.js:31-91` client-side mirrors `repository.js:2602-2646` server-side. R28/R29 P1 learning: **`(?<![A-Za-z])[A-Z]{4,}(?![A-Za-z])`** (NOT `\b[A-Z]{4,}\b` — `\b` treats `_` as a word char). Phase E does not touch this surface, but the drawer exposes fields that must flow through the existing redaction matrix unchanged.
- **Last-admin guard precedent** — `repository.js:3665-3685 updateManagedAccountRole` uses conditional UPDATE + zero-rows → 409 `last_admin_required`. Phase D's `self_suspend_forbidden` is a simpler variant (application-layer `if actor === target && status !== 'active'` before the batch).

### Institutional Learnings

- **D1 atomicity — always `batch(db, [...])`, never `withTransaction`.** `memory/project_d1_atomicity_batch_vs_withtransaction.md` — canonical template `saveMonsterVisualConfigDraft`; wrong template `updateManagedAccountRole`. Atomicity tests must `delete DB.supportsSqlTransactions` before asserting. Applies to Phase C (CAS + reconciliation) and D (session-invalidation writes).
- **Additive sibling fields via spread, never `/api/admin/v2`.** `memory/project_admin_ops_console_p1.md` and `docs/plans/2026-04-25-002-feat-capacity-release-gates-and-telemetry-plan.md`. Applies across all five phases.
- **R24 authoritative 3-tuple dedup** `(error_kind, message_first_line, first_frame)`; fingerprint is cache-only UNIQUE-index backing. Applies to Phase E — do not introduce soft-grouping, do not retrofit SHA-based grouping.
- **R27 non-enforcement callout string** is asserted verbatim at `AdminHubSurface.jsx:179` and tested in `tests/react-hub-surfaces.test.js`. Phase D removes both in the same PR; same-PR removal is non-negotiable to avoid docs drift.
- **Wrangler OAuth pivot.** `memory/project_wrangler_oauth_and_npm_check.md`. Any migration uses `npm run db:migrate:remote`; never raw `wrangler` or `CLOUDFLARE_API_TOKEN`. Reconciliation script uses the `credentialFetch` path per `scripts/backfill-learner-read-models.mjs` precedent.
- **Windows-on-Node test hygiene.** `memory/project_windows_nodejs_pitfalls.md`. CRLF normalisation on fixture compares; `pathToFileURL(process.argv[1]).href === import.meta.url` for CLI entrypoint guards; orchestrator fail-fast with `try/catch` + `process.exit(1)`; fresh-worktree `npm install` preflight.
- **Autonomous SDLC cycle — adversarial-reviewer mandate.** `memory/feedback_autonomous_sdlc_cycle.md`. Adversarial reviewer is mandatory for Phase B (public endpoint + redaction) and D (state-machine transitions + auth enforcement). Plan-deepening is non-optional — Phase 5.3 of this skill will auto-run.
- **`docs/operating-surfaces.md:260`** currently documents `ops_status` non-enforcement verbatim. Phase D flips this line in the same PR as the enforcement code.

### External References

- **Rate-limit subject normalisation** — RFC 5952 (IPv6 canonical text form), RFC 6177 (IPv6 end-site allocation), RFC 8981 (SLAAC privacy extensions — per-address IPv6 tracking useless within minutes). Cloudflare rate-limit binding docs explicitly discourage IP-only keys.
- **Build-hash / release attribution** — esbuild `define` option (`esbuild.github.io/api/#define`) with `JSON.stringify(gitSha)`. Sentry `GroupResolution` schema for `first_seen_release` / `last_seen_release` / `resolved_in_release` pattern.
- **Session invalidation** — OWASP ASVS v4.0.3 §V3.3.1 mandates server-side token invalidation on logout / status change. SuperTokens / Auth0 blog posts on `status_revision` bump vs denylist (bump wins for our DB-backed-session model).
- **Optimistic concurrency UX** — RFC 9110 §15.5.13 distinguishes 412 (HTTP-protocol precondition) from 409 (application-semantic conflict); codebase precedent (`expectedPreviousStatus` for `ops_error_events`) keeps P1.5 on 409 with `expectedRowVersion` in the hashed body.
- **Cloudflare Cron Triggers** — `developers.cloudflare.com/workers/configuration/cron-triggers/`. `wrangler.toml` `[triggers]` block + `scheduled` handler in the Worker. No new binding required.

---

## Key Technical Decisions

- **Per-phase PR, not bundled** — five PRs keep review scope tight and rollback safe. Confirmed with user. Accepted cost: five review cycles instead of one.
- **`payment_hold` blocks mutation-receipt paths only** — GETs and account-management reads stay open. Confirmed with user. Deferred: per-feature capability matrix (premium content, subject commands as separate capability tiers).
- **Self-suspend + last-active-admin guard (cross-actor) both in Phase D** — U15 ships both: (1) `self_suspend_forbidden` when `actorAccountId === targetAccountId && incomingStatus !== 'active'`; (2) `last_admin_locked_out` when `targetAccountId` is the sole `platform_role = 'admin' AND ops_status = 'active'` account and `incomingStatus !== 'active'`. Revised after adversarial-reviewer flagged the two-admin mutual-suspend deadlock (A creates B, A-via-B suspends A, B suspends A). Confirmed with user. Pattern mirrors `last_admin_required` (`repository.js:3682`).
- **Daily Cloudflare Cron Trigger for reconciliation** — admin-triggerable script still exists, but default cadence is automated. Confirmed with user. Default schedule: 04:00 UTC daily; failures route to admin dashboard as a visible metric.
- **`row_version INTEGER` over `ETag` / `If-Match` / 412** — preserves mutation-receipt payload-hash invariant; avoids re-plumbing idempotency layer. Uses the same CAS pattern as the codebase's `expectedPreviousStatus` (for `ops_error_events`); `row_version` is a new **monotonic counter** column on `account_ops_metadata`, distinct from the `repo_revision` / `state_revision` pattern that applies to account- and learner-owned tables. Do not conflate: `row_version` is plan-local, scoped to `account_ops_metadata`.
- **`status_revision` column on `account_ops_metadata` + session stamping** — single joined read in `requireSession()`; no Durable Object pub/sub; no short-TTL refresh gate. Mirrors the existing single-authority auth-boundary pattern.
- **Subject normalisation lives in `worker/src/rate-limit.js` (new file)** — one `normaliseRateLimitSubject(request, { ipv6Prefix = 64, allowGlobalBudget = false }): { bucketKey, fallback }` export. All three existing `consumeRateLimit` implementations change their `identifier` argument to a call to this helper; the underlying `request_limits` table and SHA hashing stay unchanged.
- **esbuild `define` via JS API, not CLI** — `scripts/build-bundles.mjs` (or the client bundle script) reads `git rev-parse --short HEAD` via `execSync`, embeds via `define: { __BUILD_HASH__: JSON.stringify(hash) }`. Avoids Windows shell-quoting hazards.
- **Release field is SHA-shaped only** — server-side regex is `/^[a-f0-9]{6,40}$/` (lowercase hex, 6–40 chars). Revised from the initial `/^[a-z0-9._-]+$/i` after adversarial-reviewer flagged PII-smuggling (a spelling word like `principal` would have passed the case-insensitive alnum regex). Dirty-tree suffix becomes `abcd123-dirty`? NO — the hyphen is rejected. Dirty-tree builds skip the release stamp entirely (emit `null`) so dev noise does not pollute `ops_error_events.release` columns. Semver / tagged release rollout is a follow-up that widens the regex deliberately.
- **`createSession` refuses suspended accounts at the auth boundary** — OAuth callback, dev-stub, and any other session-creation path check `ops_status` from `account_ops_metadata` before issuing a cookie. Not-`active` → redirect to `/?auth=account_hold` (for payment_hold) / `/?auth=account_suspended` (for suspended) with NO cookie. Confirmed with user. Prevents the "fresh cookie + immediate 403" UX whiplash and avoids `account_sessions` rows for suspended accounts.
- **Auto-reopen 24h cooldown** — prevents churny reopen loops when the same fingerprint recurs rapidly after a resolve. Gate: `last_status_change_at + 86400000 < :now` before applying the resolved → open transition.
- **Reconciliation writes via shadow-key swap** — avoids a naive `UPDATE admin_kpi_metrics SET metric_count = :computed` racing with concurrent live bumps. Script computes each metric, stores into `admin_kpi_metrics` rows keyed `<metric_key>:reconcile_pending`, then swaps pending→canonical in a single `batch()` with `DELETE` of the pending row.
- **Structured error codes live in `worker/src/error-codes.js`** — constants named exactly as the string values; new code uses the constants; existing code is not blocking-refactored but gets refactored opportunistically in touched files.

---

## Open Questions

### Resolved During Planning

- **Phase split** → 5 separate per-phase PRs (A → B → C → D → E). User decision.
- **`payment_hold` write/read boundary** → mutation-receipt paths only. User decision.
- **Last-admin guard scope** → self-suspend guard AND cross-actor last-active-admin guard both in Phase D (U15). User decision (revised after adversarial review flagged the two-admin mutual-suspend deadlock risk).
- **Reconciliation automation** → daily Cloudflare Cron Trigger + manual script + admin-only API route. User decision.
- **CAS primitive** → `row_version INTEGER` monotonic counter in request body + receipt hash, 409 on mismatch. Decided from codebase CAS precedent.
- **Session invalidation mechanism** → `status_revision` bump + per-request joined read. Decided from no-DO / no-KV constraint + OWASP guidance.
- **Build-hash injection** → esbuild JS-API `define` with `git rev-parse --short HEAD` via `execSync`. Decided from Windows portability requirement.
- **Cron schedule default** → 04:00 UTC daily. Overridable via `wrangler.toml`.
- **Error-code registry location** → `worker/src/error-codes.js`, new-code-mandatory, existing-code-opportunistic.
- **Phase E schema extension** → four nullable columns (`first_seen_release`, `last_seen_release`, `resolved_in_release`, `last_status_change_at`); no `seen_in_releases TEXT` denorm in P1.5 (deferred as follow-up).
- **`row_version` bumps on every UPDATE; `status_revision` bumps only when `ops_status` changes** — the two counters are orthogonal. Per U8 CAS rule, `row_version` increments once per commit of `updateAccountOpsMetadata` regardless of which fields changed. Per U15, `status_revision` increments only when the stored `ops_status` string differs from the incoming value. A PATCH that sets `ops_status = 'active'` when the row is already `active` is a status no-op: `row_version` still bumps (because other fields in the PATCH may have changed), `status_revision` does not. If only `ops_status = 'active' → 'active'` and no other field changes, the UPDATE still commits and still bumps `row_version` (this is accepted; CAS is a cheap no-op).
- **Self-suspend guard fires BEFORE status-change check** — the guard rejects `actorAccountId === targetAccountId && incomingStatus !== 'active'` at the API layer, before any DB work. Only after the guard passes does `updateAccountOpsMetadata` proceed. This prevents a self-suspend attempt from bumping `row_version` even transiently.
- **Release source for `updateOpsErrorEventStatus` is server-side** — when an admin transitions an error event to `resolved`, the handler reads the server's own `__BUILD_HASH__` (or a `BUILD_HASH` env var) and writes that into `resolved_in_release`. The admin's PATCH body does NOT carry `release`. This prevents a malicious admin from forging arbitrary release IDs into the audit trail and keeps the auto-reopen rule sound (it compares incoming-event `release` against a server-controlled value).
- **Request-id handling on Keep-mine retry** — U9's "Keep mine" button mints a fresh UUID v4 `requestId` on every click. Receipt caching is keyed on `(requestId, payloadHash)`; minting ensures no inadvertent idempotency-replay even if a sequence of CAS retries happens to produce identical `expectedRowVersion` values.

### Deferred to Implementation

- **Exact cron schedule in `wrangler.toml`** — 04:00 UTC is the default intent; the cron expression form may shift during wiring if Cloudflare's 1-minute lead-time jitter proves disruptive to the admin dashboard's "last reconciled at" display.
- **Exact FTS vs LIKE decision for Phase E route-name search** — P1.5 ships LIKE; the drawer spike will confirm whether admins use route-name search enough to warrant FTS follow-up.
- **Which exact existing `withTransaction` call sites get removed in Phase C/D** — audit happens during U11 (Phase C-4) implementation; removals that fall outside Phase C / D touch surfaces become the deferred tech-debt pass.
- **Precise dirty-ref lifecycle on save-in-flight + refresh-in-flight collision** — Phase A U1 spike will confirm whether a save-in-flight scalar (`savingAccountId` present) suffices to suppress auto-refresh or whether a separate `dirtyRef` per row is needed. Expected outcome: per-row dirtyRef.
- **Release-set awareness for canary auto-reopen** (flow gap E3) — P1.5 uses simple "build_hash ≠ resolved_in_release" rule. Future work may add a `releases` table once canary patterns exist. This is acceptable because the repo does not yet run concurrent releases.
- **`unknown:` bucket separation between malformed-IP and missing-CF-header** — decided during Phase B U6 implementation; flow gap B4 leans toward `unknown:malformed` vs `unknown:missing` prefixes so the two remain separable in observability.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### `ops_status` enforcement decision matrix (Phase D)

| Incoming request `ops_status` | Request method | Admin hub path | Mutation-receipt path | Parent hub / GET / error ingest | Outcome |
|---|---|---|---|---|---|
| `active` | GET / POST | allowed | allowed | allowed | 200 — normal |
| `payment_hold` | GET | allowed | — | allowed | 200 — read-only surfaces continue |
| `payment_hold` | POST (mutation) | — | **block** | — | 403 `account_payment_hold` |
| `payment_hold` | GET account-management | allowed | — | — | 200 — explicitly allowed so user can resolve billing |
| `suspended` | any | **block** | **block** | **block except `/api/ops/error-event`** | 403 `account_suspended`; error capture stays open so we see the suspended browser's errors |
| `active` session after admin suspend (status_revision bump) | any | — | — | — | 401 `session_invalidated` on next request |

**Gate placement** — `auth.requireSession()` performs the joined read. Mutation-receipt-path check happens in a new `requireMutationCapability(session)` helper that mutation routes call early, before any work. Error capture (`/api/ops/error-event`) bypasses both because it is unauthenticated.

### Rate-limit subject-key tiers (Phase B)

    normaliseRateLimitSubject(request, opts) -> { bucketKey, fallback }
      if ipv4:  bucketKey = "v4:<addr>"
      if ipv6:  bucketKey = "v6/64:<first-four-hextets>"
      if unknown/malformed/link-local/ULA:  bucketKey = "unknown:<reason>"
      if opts.allowGlobalBudget:  also consume "global:<route>" bucket with higher ceiling

    Call sites pass (request, { ipv6Prefix: 64, allowGlobalBudget: route==='ops-error-capture' })
    consumeRateLimit receives bucketKey and hashes it into request_limits.limiterKey exactly as today.

### CAS + retry flow (Phase C)

```mermaid
sequenceDiagram
  participant UI
  participant API
  participant DB
  UI->>API: PUT /ops-metadata { expectedRowVersion: 3, fields..., requestId, correlationId }
  API->>DB: batch([ UPDATE ... WHERE row_version = 3, storeReceipt, bumpKpi ])
  alt Match — row_version bumps 3→4
    DB-->>API: rowsAffected=1, new row_version=4
    API-->>UI: 200 { ok, row: { row_version: 4, ... } }
    UI->>UI: clear dirtyRef; accept next refresh
  else Mismatch — row was changed
    DB-->>API: rowsAffected=0
    API-->>UI: 409 { code: 'account_ops_metadata_stale', currentState: { row_version: 4, ... } }
    UI->>UI: keep dirtyRef=true; show diff banner
    Note over UI: user picks "Keep mine" (retry with row_version=4) or "Use theirs" (discard)
  end
```

### Auto-reopen rule (Phase E)

    New event with release R arrives for fingerprint F
    SELECT status, resolved_in_release, last_status_change_at FROM ops_error_events WHERE ... = F
    if status = 'resolved' AND resolved_in_release IS NOT NULL
       AND R != resolved_in_release AND R IS NOT NULL
       AND (now - last_status_change_at) > 86_400_000:   # 24h cooldown
           set status = 'open'; set last_status_change_at = now
    (else: normal UPSERT dedup)

### Session-invalidation revision bump (Phase D)

    At login:
      stamp sessions.status_revision_at_issue = account_ops_metadata.status_revision
    At each authenticated request (inside requireSession):
      JOIN account_ops_metadata on accountId
      if sessions.status_revision_at_issue != account_ops_metadata.status_revision:
          throw 401 session_invalidated
      if ops_status != 'active':
          apply payment_hold / suspended policy table above
    At updateAccountOpsMetadata (any ops_status change):
      batch([
        UPDATE account_ops_metadata SET ops_status=?, status_revision = status_revision + 1, ...,
        storeMutationReceipt,
        bumpKpi
      ])
      # Sessions become stale on next request; no explicit DELETE needed.

---

## Implementation Units

### Phase A — Admin truthfulness + UI failure states (PR 1 of 5)

- U1. **Per-panel `refreshedAt` + `refreshError` envelope surfacing**

**Goal:** expose server-produced `generatedAt` to the UI for every admin-ops panel and capture the error state of each narrow refresh into `adultSurfaceState.adminHub` instead of swallowing to `console.error`.

**Requirements:** R1

**Dependencies:** none

**Files:**
- Modify: `src/main.js` (lines 757–795 — the four `refreshAdminOps*` helpers replace `console.error(...)` with `dispatch('admin-ops-<panel>-refresh-error', { error })` and a matching success clear)
- Modify: `src/platform/hubs/admin-panel-patches.js` (extend patch helpers so `refreshedAt` and `refreshError` are preserved across re-renders)
- Modify: `src/surfaces/hubs/AdminHubSurface.jsx` (add `<PanelHeader panel={...} />` shared component rendering `generatedAt` + refresh-error banner)
- Create: `src/surfaces/hubs/admin-panel-header.jsx`
- Test: `tests/react-admin-hub-refresh.test.js`

**Approach:**
- Introduce a small shared `<PanelHeader>` component that reads `panel.generatedAt` (already emitted server-side, rendered as "Last refreshed <N> ago" relative to server wall-clock) and `panel.refreshError` (new). Four panels consume it.
- `dispatch('admin-ops-<panel>-refresh-error', { error })` sets `panel.refreshError = { code, message, at: Date.now() }` in state. Successful refresh clears it. Both transitions are reducer-only, no new middleware.
- **Error banner text by code** (authoritative map; every code referenced anywhere in P1.5 appears here):

  | Code | Banner text |
  |---|---|
  | `rate_limited` | "Refresh throttled — retry in a moment" |
  | `admin_hub_forbidden` | "Your session no longer has permission — please sign in again" + re-auth CTA |
  | `session_invalidated` | Triggers **global** sign-in redirect (not a banner — handled at app-shell level, see U14) |
  | `account_suspended` | Triggers **global** suspended-account landing page (not a banner; full-app state) |
  | `account_payment_hold` | "This action requires active billing. Contact ops." + billing CTA |
  | `self_suspend_forbidden` | "You cannot change your own account status" |
  | `last_admin_locked_out` | "Cannot change this account — they're the only active administrator" |
  | `account_ops_metadata_stale` | Triggers **banner with diff + buttons** (U9) — not handled by this shared map |
  | `reconcile_in_progress` | "Another reconciliation is in progress — try again in a minute" |
  | `validation_failed` | 400-class input validation failure (e.g. malformed release, oversized payload); not surfaced as a refresh banner — the triggering action's own UI handles the 400 (inline form error) |
  | network / 5xx / generic | "Refresh failed — click to retry" + correlation id if present |

  Mutation 401 codes (`session_invalidated`, `account_suspended`) are full-app state transitions: the SPA shell catches them on ANY fetch (refresh OR mutation) and routes to sign-in or suspended-landing. Per-panel banners cover only idempotent refresh failures.
- **Auto-refresh cascade error handling:** U2's cascade fires `refreshAdminOpsKpi()` THEN `refreshAdminOpsActivity()` sequentially. If KPI refresh fails, Activity refresh is suppressed (fail-fast) — the KPI banner signals the condition; Activity will catch up on its next scheduled refresh. Parallel dispatch would muddy the error correlation.

**Technical design:** directional only — the shared `<PanelHeader>` replaces four duplicated `<div className="card-header">` blocks; each panel already emits `generatedAt`, so server-side is one-line additive.

**Patterns to follow:** `AdminHubSurface.jsx:179` R27 callout rendering (verbatim-string convention); `src/platform/hubs/admin-panel-patches.js:58-66` scalar-preservation pattern.

**Test scenarios:**
- Happy path: narrow refresh succeeds — panel `refreshedAt` updates to server `generatedAt`; any prior `refreshError` cleared.
- Edge case: refresh in flight while a new refresh is dispatched — only the most recent request's result is applied (requestToken guard).
- Error path: `fetch` rejects with network error — panel shows banner "Refresh failed" with retry CTA; state is `{ refreshError: { code: 'network', ... }, generatedAt: <previous> }`.
- Error path: server returns 429 `rate_limited` — panel shows "Refresh throttled"; no stale panel write.
- Integration: partial-refresh — when full `loadAdminHub` succeeds for 3 panels and fails for 1 (simulated via mock), the 3 succeeding panels render fresh `refreshedAt`, the 4th keeps prior `refreshedAt` plus error banner.

**Verification:** all four panels render last-refreshed + error banner in every state; no remaining `console.error` calls in `main.js` refresh paths.

---

- U2. **Dirty-form protection + auto-refresh suppression**

**Goal:** prevent prop-to-state re-sync from wiping a dirty edit, and suppress dependent-panel auto-refresh on panels with any dirty row.

**Requirements:** R2, R19, R20

**Dependencies:** U1

**Files:**
- Modify: `src/surfaces/hubs/AdminHubSurface.jsx` (`AccountOpsMetadataRow` component — replace unconditional `useEffect(() => setDraft(server), [server])` with `useRef`-gated version)
- Modify: `src/main.js` (dispatcher handler for `account-ops-metadata-save` success — fire `refreshAdminOpsKpi()` + `refreshAdminOpsActivity()` after checking panel-level dirty scalar; same for `ops-error-event-status-set` success → `refreshAdminOpsErrorEvents()` + `refreshAdminOpsKpi()` + `refreshAdminOpsActivity()`)
- Test: `tests/react-admin-metadata-row-dirty.test.js`
- Test: `tests/react-admin-auto-refresh-chain.test.js`

**Approach:**
- `AccountOpsMetadataRow` uses `useRef(false)` as `dirtyRef`; the `useEffect` guards prop-to-state sync with `if (!dirtyRef.current) setDraft(server)`. `onChange` sets `dirtyRef.current = true`. On save success the dispatcher caller signals the row to clear `dirtyRef` (via a ref callback or a props-passed clear function).
- Auto-refresh suppression: if ANY row in the metadata panel has dirty state, suppress the metadata-panel's own narrow refresh (not the panel-cascade KPI / activity refreshes, which always fire after a successful save). The goal is "don't wipe an edit mid-type", not "block all observability".
- **Dirty-transition flush:** when a dirty row becomes clean (save success OR "Use theirs"), if any metadata-panel refreshes were suppressed during the dirty window, fire one metadata-panel refresh immediately on the transition. Track via a panel-level `suppressedRefreshCount` counter: increment on suppressed refresh, fire + reset on clean-transition. This closes the ghost-change UX (coherence #6 + #9).
- On 409 (Phase C): keep `dirtyRef.current = true`; the row's local draft is NOT reset by the error handler. The banner in U9 owns the UX from there.

**Technical design:** directional only. The `useRef`-gated pattern is documented in the external-research synthesis; exact React hook composition is an implementation detail.

**Patterns to follow:** Phase C (U9) will piggy-back on the same `dirtyRef` primitive for its 409 UX.

**Test scenarios:**
- Happy path: user types in notes, row is dirty; external refresh lands → textarea keeps typed text (server state cached but not applied); user clicks Save; on success the ref clears and next refresh applies.
- Edge case: two rows edited simultaneously — each maintains independent dirty state; saving row A does not clear row B's dirty ref.
- Error path: mutation succeeds but follow-up narrow refresh fails — panel shows refresh-error banner (from U1) but dirty state on other rows is untouched.
- Integration: account metadata save success → KPI panel + activity panel auto-refresh fire within 300ms of save response; if any row in metadata panel is dirty at that moment, only the *other* panels (KPI + activity) refresh, not the metadata panel itself.
- Edge case: refresh arrives while save is in-flight — the `savingAccountId` scalar plus `dirtyRef` suppress the clobber; result is "save lands first, applies server state, clears ref; refresh landed after no-ops on now-clean row".

**Verification:** typing in a notes textarea is never wiped by any combination of refresh timings; auto-refresh chain fires after each successful admin-ops mutation except where suppression applies.

---

- U3. **Real-vs-demo KPI split**

**Goal:** separate real-account / real-learner / real-session counters from demo ones, and split error counts by origin class.

**Requirements:** R3

**Dependencies:** none

**Files:**
- Modify: `worker/src/repository.js` (`readDashboardKpis` ~line 1726 — add `accounts.demo`, `learners.real`, `learners.demo`, `practiceSessions7d.real/demo`, `practiceSessions30d.real/demo`, `mutationReceipts7d.real/demo`, `errorEvents.byOrigin.client/server`)
- Modify: `src/platform/hubs/admin-read-model.js` (normalise new KPI sibling fields)
- Modify: `src/surfaces/hubs/AdminHubSurface.jsx` (`DashboardKpiPanel` — render real and demo rows as separate stats with a neutral grouping)
- Test: `tests/worker-admin-ops-kpi-split.test.js`
- Test: `tests/react-admin-hub-kpi-split.test.js`

**Approach:**
- Reuse the existing `COALESCE(account_type, 'real') <> 'demo'` filter from `readDashboardKpis` line 1744 — apply it to every counter that today is raw. Split client vs server errors via `route_name LIKE '/api/%'` (server) vs NULL/client-path (client) on `ops_error_events`. Document the split rule in the payload response comment.
- UI shows `Real / Demo` badge pair side-by-side, with an `—` placeholder when demo subsystem is fully off (distinguishes "0 demos" from "demo disabled" by presence of the field).

**Patterns to follow:** R17 additive-sibling. Existing `accounts.total` excluded demos; new fields are its siblings.

**Test scenarios:**
- Happy path: 5 real accounts + 3 demo → `accounts.real = 5`, `accounts.demo = 3`, `accounts.total = 5` (preserves historical meaning).
- Edge case: zero demos — `demo` counters are `0`, not `null`.
- Integration: legacy client reading only `accounts.total` still works (additive-only contract).
- Error path: a malformed `account_type` value (not `'demo'` and not `'real'`) falls into the real bucket per the `COALESCE` filter.

**Verification:** KPI panel renders split; legacy contract preserved; `npm run db:test` passes the new KPI-split test.

---

### Phase B — Public endpoint hardening (PR 2 of 5)

- U4. **`normaliseRateLimitSubject(request)` helper**

**Goal:** single normalisation function producing tiered bucket keys for every public and authenticated endpoint.

**Requirements:** R4

**Dependencies:** none

**Files:**
- Create: `worker/src/rate-limit.js` (exports `normaliseRateLimitSubject(request, { ipv6Prefix, allowGlobalBudget } = {}): { bucketKey, fallbackReason }`)
- Test: `tests/worker-rate-limit-subject.test.js`

**Approach:**
- **Header precedence + trust mode:** by default accept only `CF-Connecting-IP` (the only Cloudflare-signed header). Fall back to `X-Forwarded-For` / `X-Real-IP` ONLY when `env.TRUST_XFF === '1'` (dev / staging behind-origin scenarios). In production, missing `CF-Connecting-IP` → `unknown:missing` with a stricter bucket. Prevents the adversarial IPv4→IPv6 escape where an attacker sends `X-Forwarded-For: 2001:db8::/64` and gets a fresh per-/64 bucket.
- Detect format: pure IPv4 (`/^\d{1,3}(\.\d{1,3}){3}$/`) → `v4:<addr>`. Contains `:` → IPv6 path.
- IPv6 path: expand with `::` logic, RFC 5952 lowercase, extract first 4 hextets as 16-hex-char key → `v6/64:<16hex>`. Reject link-local `fe80::/10`, ULA `fc00::/7`, loopback `::1`, unspecified `::` → `unknown:<reason>`.
- IPv4-in-IPv6 (`::ffff:1.2.3.4`) → treat as IPv4 subject (prevents all IPv4 traffic sharing one v6/64 bucket).
- Malformed (header present but fails both parsers) → `unknown:malformed`.
- `allowGlobalBudget: true` returns a second `globalKey` in the response object so the caller can consume both buckets.

**Execution note:** test-first. Pure function with no I/O; ~12 test vectors drive the implementation.

**Patterns to follow:** existing `clientIp` helpers at `auth.js:341`, `app.js:218`, `demo/sessions.js:36` — this helper supersedes all three.

**Test scenarios:**
- Happy path IPv4: `1.2.3.4` → `v4:1.2.3.4`.
- Happy path IPv6: `2001:DB8:0:0:ABCD::1` and `2001:db8::abcd:0:0:1` → same `v6/64:20010db800000000`.
- Edge case: IPv4-in-IPv6 `::ffff:1.2.3.4` → `v4:1.2.3.4`.
- Edge case: link-local `fe80::1` → `unknown:link_local`.
- Edge case: loopback `::1` → `unknown:loopback`.
- Edge case: ULA `fc00::1` → `unknown:ula`.
- Error path: missing header → `unknown:missing`.
- Error path: garbage `not-an-ip` → `unknown:malformed`.
- Error path: IPv6 with zone `fe80::1%eth0` → zone stripped, same result as `fe80::1`.
- Happy path global: `{ allowGlobalBudget: true }` returns second key `global:<prefix>`.

**Verification:** unit tests green across all 10+ vectors; pure function; no DB dependency.

---

- U5. **Route all `consumeRateLimit` call sites through the helper**

**Goal:** three implementations and ~12 callers use `normaliseRateLimitSubject` for their `identifier` argument; `request_limits` backing table and SHA hashing unchanged.

**Requirements:** R4

**Dependencies:** U4

**Files:**
- Modify: `worker/src/auth.js` (`consumeRateLimit` + `clientIp` call sites at lines 341, 353, 412, 418, 434, 453 — pass subject key through helper)
- Modify: `worker/src/app.js` (`resolveClientIp` at 218, public error ingest at 413–419 — use helper; opt-in `allowGlobalBudget: true` for the error-ingest bucket)
- Modify: `worker/src/demo/sessions.js` (`clientIp` at 36, `consumeRateLimit` at 56–79, call sites at 92, 109, 127 — route through helper)
- Modify: `worker/src/tts.js` (call sites at 88, 95, 112, 119, 136, 143 — route through helper)
- Delete: duplicate `clientIp` local helpers (three copies) — replaced by the one helper's internal resolution
- Test: `tests/worker-rate-limit-ipv6-propagation.test.js` (one representative test per call site proving same-/64 addresses hit the same bucket)

**Approach:**
- Behaviour-preserving refactor: identifier hashing stays via `sha256(identifier)` where `identifier` is now the helper's `bucketKey`. Buckets like `ops-error-capture-ip` stay as the prefix passed to `consumeRateLimit`; the helper only changes what goes into the hash.
- Migration note in the PR description: historical `request_limits` rows keyed by raw IP become dead rows — they harmlessly age out within the 10-minute window; no migration SQL required.
- **Fresh-insert abuse limit** (adv-2): the public `/api/ops/error-event` route adds a **second** `consumeRateLimit` call keyed `ops-error-fresh-insert:<subject>` with a stricter budget (10 fresh-INSERTs per hour per subject). This fires ONLY when the tuple-dedup path in `recordClientErrorEvent` determines the event is a new fingerprint (fresh row). A deduping replay does not count. Attackers rotating `first_frame` to defeat R24 dedup hit this bucket first and are throttled. Legitimate deploy-triggered error bursts from a cohort of distinct users stay within the per-request 60/10min limit.
- **Global budget** (adv-2 concrete number): when `allowGlobalBudget: true` is set on the public ingest, the global bucket ceiling is 6000 events per 10-minute window across all subjects. Tuned to absorb a real post-release crash loop (an error firing for every user for a few minutes) while blocking a single /48 attacker from exhausting.
- The fresh-insert limit and global budget numbers are conservative defaults — operationally tunable via `env.OPS_ERROR_FRESH_INSERT_LIMIT` and `env.OPS_ERROR_GLOBAL_LIMIT`.

**Execution note:** verify behaviour-preservation with a before/after run of `npm run test -- tests/worker-auth.test.js tests/worker-demo-session.test.js tests/worker-ops-error-capture.test.js`.

**Patterns to follow:** Phase B plan-deepening and adversarial reviewer are mandatory here (public endpoint + unified helper — both adversarial triggers).

**Test scenarios:**
- Happy path IPv6: two distinct low-64 suffixes in `2001:db8::/64` share one bucket; hit N times, the Nth triggers 429.
- Edge case: legit IPv4-in-IPv6 user's requests go to the `v4` bucket, not the `v6/64` bucket with their neighbours.
- Edge case: missing header traffic shares the `unknown:missing` bucket across all callers — a stricter limit applies here.
- Integration: `/api/ops/error-event` now consumes both the `v6/64:...` and the `global:ops-error-capture` buckets; global exhaustion triggers 429 even when a specific `/64` is under its own budget.
- Regression: all existing rate-limit tests pass unchanged (the helper is behaviour-preserving for the common-case IPv4 scenario).

**Verification:** IPv6 `/64` grouping demonstrably works in the ops-error ingest test; existing auth + demo + TTS rate-limit tests still pass; deployed `request_limits` table shape unchanged.

---

- U6. **Production same-origin smoke test suite**

**Goal:** post-deploy smoke test proves admin hub load + all four narrow refreshes + account metadata save + error status transition pass with correct same-origin + Sec-Fetch-Site headers against the live `https://ks2.eugnel.uk` instance.

**Requirements:** R5

**Dependencies:** U4, U5 (must pass with the new helper in place)

**Files:**
- Create: `scripts/admin-ops-production-smoke.mjs` (Node script using OAuth-wrapped fetch)
- Modify: `package.json` (add `"smoke:production:admin-ops": "node scripts/admin-ops-production-smoke.mjs"` and include in `audit:production`)
- Create: `tests/admin-ops-production-smoke.test.js` (opt-in via `KS2_PRODUCTION_SMOKE=1`)

**Approach:**
- **Credential handling (per adv-11 hardening):** smoke script uses a dedicated **smoke service account** with credentials stored in CI secrets (`KS2_SMOKE_ACCOUNT_EMAIL` + `KS2_SMOKE_ACCOUNT_PASSWORD` in GitHub Actions). Rotation cadence: every 30 days; rotation command `npm run ops:rotate-smoke-credentials` (follow-up; tracked separately).
- **Smoke account is scoped:** the account has `platform_role = 'admin'` but its `account_ops_metadata.internal_notes` is opaque (e.g. `'smoke-test-account'`). The account's `row_version` bump pattern from save+reverse-save is expected and ignored by real telemetry.
- **Read-only + reversible mutation pair:** issue admin hub GET, all four narrow refreshes, then save a `plan_label` update with a known pre-value, verify `row_version` bumped, then save the inverse — leaves account state at the starting value.
- **Test harness opt-in** behind `KS2_PRODUCTION_SMOKE=1` so CI does not hit production by default. Staging smoke runs under a different env flag (`KS2_STAGING_SMOKE=1`) with staging credentials.
- **Audit:** every smoke run produces a receipt at `mutation_kind = 'admin.account_ops_metadata.update'` with the smoke account's `account_id` — filterable out of real admin-activity metrics via the `requestId` prefix convention (`smoke-<iso_date>-<sequence>`).

**Execution note:** CLI entrypoint guard uses `pathToFileURL(process.argv[1]).href === import.meta.url` per Windows hygiene learning.

**Patterns to follow:** `scripts/backfill-learner-read-models.mjs` structure; secrets policy follows existing GitHub Actions conventions for the repo.

**Test scenarios:**
- Happy path: `KS2_PRODUCTION_SMOKE=1 npm run smoke:production:admin-ops` hits live deployment and exits 0.
- Error path: if any endpoint returns a non-2xx, script exits with non-zero and prints the correlation id + status.
- Edge case: `KS2_PRODUCTION_SMOKE` not set — test file is skipped, not failing.

**Verification:** `npm run audit:production` includes and runs the new smoke with a clean exit; manual run in a browser after deploy confirms the admin hub on `ks2.eugnel.uk` still functions.

---

### Phase C — Data integrity (PR 3 of 5)

- U7. **Migration 0011: full P1.5 schema addition (row_version + status_revision + session stamping + release tracking)**

**Goal:** one migration file lands every P1.5 column — `account_ops_metadata.row_version`, `account_ops_metadata.status_revision`, `account_sessions.status_revision_at_issue`, and `ops_error_events` release-tracking columns — so Phase D and E application code in later PRs never reads a column that isn't deployed.

**Requirements:** R6, R12, R15

**Dependencies:** none

**Files:**
- Create: `worker/migrations/0011_admin_ops_p1_5_hardening.sql`
- Test: `tests/worker-migration-0011.test.js`

**Approach:**
- Forward-only migration; `CREATE INDEX IF NOT EXISTS`; explicit column-existence check via `pragma_table_info` before each `ALTER TABLE ADD COLUMN` (SQLite does not support `IF NOT EXISTS` on ALTER TABLE directly — use `SELECT name FROM pragma_table_info('t') WHERE name='col'` and skip the ALTER when present).
- All new columns nullable or default-zero so partial-apply is structurally safe (a failed ALTER mid-file leaves earlier tables with new columns, later tables without — and the application code in PR 4/5 tolerates `no such column` errors via R19-precedent soft-fail).
- **Columns added (exhaustive):**
  - `account_ops_metadata.row_version INTEGER NOT NULL DEFAULT 0` — used by U8 CAS.
  - `account_ops_metadata.status_revision INTEGER NOT NULL DEFAULT 0` — used by U15 bump + U14 session-compare JOIN.
  - `account_sessions.status_revision_at_issue INTEGER NOT NULL DEFAULT 0` — stamped by U13; compared by U14.
  - `ops_error_events.first_seen_release TEXT` — set by U16 on fresh insert.
  - `ops_error_events.last_seen_release TEXT` — set by U16 on every event.
  - `ops_error_events.resolved_in_release TEXT` — set by U15's `updateOpsErrorEventStatus` on `→ resolved`.
  - `ops_error_events.last_status_change_at INTEGER` — set by U15 on any status transition; read by U17 auto-reopen cooldown.
- **Indexes added:**
  - `idx_ops_error_events_last_seen_release` on `ops_error_events(last_seen_release)` — supports U19 "new in this release" filter.
  - `idx_ops_error_events_status_change` on `ops_error_events(status, last_status_change_at)` — supports U19 "reopened after resolved" filter.
- **Migration rollback policy:** none. Forward-only. Document in the file header.

**Patterns to follow:** `worker/migrations/0010_admin_ops_console.sql` — same style + same `CREATE ... IF NOT EXISTS` discipline.

**Test scenarios:**
- Happy path fresh: migration applies cleanly on a 0010-shaped DB.
- Edge case idempotent re-run: `pragma_table_info` check skips already-existing columns; no error.
- Edge case partial pre-existing: column `account_ops_metadata.status_revision` exists (hotfix scenario) — migration skips that ALTER and proceeds with the rest.
- Integration: existing rows have `row_version = 0`, `status_revision = 0`, release columns NULL after migration; admin hub continues to load via the existing R19 soft-fail pattern.
- Error path: forcibly introduce a failure mid-migration — verify remaining statements can be re-run idempotently on next attempt (hotfix path).

**Verification:** `npm run db:migrate:remote` succeeds; `tests/worker-migration-0011.test.js` green; `npm run db:migrations:list:remote` shows `0011` applied; a smoke SELECT against each new column succeeds.

---

- U8. **CAS on `updateAccountOpsMetadata`**

**Goal:** require `expectedRowVersion` in the mutation envelope; bump `row_version` on success; 409 `account_ops_metadata_stale` on mismatch with current-state echo; include `expectedRowVersion` in the payload hash so 409-retry is not spuriously idempotency-replayed.

**Requirements:** R6

**Dependencies:** U7

**Files:**
- Modify: `worker/src/repository.js` (`updateAccountOpsMetadata` — add pre-check of `expectedRowVersion`, SQL `AND row_version = ?` guard, post-batch verify, include in `mutationPayloadHash`)
- Modify: `src/platform/hubs/api.js` (client caller includes `expectedRowVersion`; on 409 returns `{ conflict: true, currentState: ... }` to dispatcher)
- Modify: `src/main.js` (dispatcher handler — on 409, call the Phase C U9 UI)
- Test: `tests/worker-account-ops-metadata-cas.test.js`

**Approach:**
- Three-layer guard mirrors `updateOpsErrorEventStatus` exactly: pre-check → SQL guard → post-batch verify.
- 409 response body: `{ ok: false, code: 'account_ops_metadata_stale', currentState: { row_version, ops_status, plan_label, tags, internal_notes, updated_at, updated_by } }` (redacted per R25 `internal_notes` admin-only rule).
- Post-batch verify is critical — without it, a concurrent swap that matches twice-plus-one wraparound is theoretically possible (though `row_version` counter never wraps in practical timescales).
- **`row_version` bumps on every UPDATE**, regardless of which fields changed or whether `ops_status` changed. This keeps CAS semantics pure: the CAS primitive tracks any-change, not status-change. See "Key Technical Decisions" for the orthogonality rule.
- **Keep-mine requestId minting** (per correctness + adversarial synthesis): the U9 UI's "Keep mine" button MUST generate a fresh UUID v4 `requestId` on every click. The receipt-caching layer (`(requestId, payloadHash)`) must not serve a cached 409-retry's result to a later retry that only happens to share the same `expectedRowVersion`.
- **Admin mutation rate limit** (adv-10 + Phase B integration): authenticated admin mutation routes get a per-session rate-limit bucket `admin-mutation-per-session` at 60 requests per minute per session. Protects against runaway-client save storms overwhelming `mutation_receipts`. Plumbed through Phase B's `normaliseRateLimitSubject` using the session hash as the subject key.

**Execution note:** start with a failing integration test for the 409 path, then implement.

**Patterns to follow:** `updateOpsErrorEventStatus` at `repository.js:2354-2577`; `mutationPayloadHash` at `repository.js:172`.

**Test scenarios:**
- Happy path: expected matches → update lands, `row_version` bumps 3 → 4, response echoes new row.
- Edge case: `expectedRowVersion = 0` on first edit — valid (default from fresh migration).
- Error path 409: two concurrent saves, both with `expectedRowVersion = 3` — one wins (row_version 3 → 4), the other gets 409 with `currentState.row_version = 4`.
- Integration: 409-retry with fresh `expectedRowVersion = 4` — receipt hash differs from the 409-producing request, so it is not idempotency-replayed; succeeds cleanly.
- Integration: same request retried (same `requestId`, same body including `expectedRowVersion`) — returns the cached receipt result (normal idempotency).
- Edge case: account deleted between admin's read and save — returns `404 account_missing`, not 409 (because `AND row_version = ?` fails due to zero-match, but we distinguish missing-account from stale-row via a pre-check).

**Verification:** all six scenarios pass; `expectedRowVersion` is in the hashed payload (grep `mutationPayloadHash` body composition).

---

- U9. **Admin UI 409 UX + diff banner**

**Goal:** on 409 from `updateAccountOpsMetadata`, keep the user's draft, show an inline diff banner with "Keep mine" / "Use theirs" actions.

**Requirements:** R7, R19

**Dependencies:** U2, U8

**Files:**
- Modify: `src/surfaces/hubs/AdminHubSurface.jsx` (`AccountOpsMetadataRow` — add conflict banner state, diff renderer, two buttons)
- Modify: `src/main.js` (dispatcher handler for 409 — set row-level conflict state; does NOT clear `dirtyRef`)
- Test: `tests/react-admin-metadata-row-conflict.test.js`

**Approach:**
- Inline banner appears above the row's edit form when `row.conflict = { currentState: ... }`. Shows only fields that differ between `currentState` and the user's draft. `Keep mine` button triggers a resubmit with `expectedRowVersion = currentState.row_version` and the user's current draft. `Use theirs` button clears draft, sets the form to `currentState`, clears `dirtyRef`, hides banner.
- No modal — per industry convention (Linear / GitHub), banners keep flow.
- Accessibility: banner gets role="alert"; two buttons are real `<button>` elements, not divs.

**Patterns to follow:** R25 redaction — `currentState.internal_notes` may be null for ops-role viewers; banner hides that field if it's null and the draft has a value (rare but possible).

**Test scenarios:**
- Happy path: 409 arrives; banner renders with diff; user types further edits; clicks "Keep mine" → new save fires with updated `expectedRowVersion` and user's draft; banner dismisses on success.
- Edge case: user clicks "Use theirs" → draft replaces with server state; banner dismisses; `dirtyRef` clears.
- Edge case: 409 arrives while user is mid-edit of a different field than the one that changed — banner still shows, diff accurately identifies the changed field (not the in-progress field).
- Error path: "Keep mine" resubmit also 409s (third writer) — banner refreshes with newer `currentState`.
- Integration: two tabs open, tab A saves first, tab B saves second — tab B sees 409; tab A's subsequent auto-refresh updates tab A's view without wiping its non-dirty state.

**Verification:** conflict scenario walkthrough in a browser confirms banner UX; automated test asserts banner renders + buttons dispatch correctly.

---

- U10. **KPI reconciliation script + admin-only route**

**Goal:** `scripts/admin-reconcile-kpis.mjs` computes counters from authoritative source tables and posts to `POST /api/admin/ops/reconcile-kpis`; route applies the shadow-key swap atomically.

**Requirements:** R8, R10

**Dependencies:** U7 (for the `last_status_change_at` column used in error-centre reconciliation; Phase E's release-tracking reconciliation is simpler and can use the same machinery)

**Files:**
- Create: `scripts/admin-reconcile-kpis.mjs` (Node script, OAuth-wrapped fetch, same auth env as `scripts/backfill-learner-read-models.mjs`)
- Modify: `worker/src/app.js` (new route `POST /api/admin/ops/reconcile-kpis`, admin-only, requireSameOrigin strict, mutation-receipt idempotent)
- Modify: `worker/src/repository.js` (new `reconcileAdminKpiMetrics(db, { computedValues, actor, requestId, correlationId })` helper — single-flight guard via a `reconcile_pending` prefix key; shadow-swap in one `batch()`)
- Modify: `package.json` (add `"admin:reconcile-kpis": "node scripts/admin-reconcile-kpis.mjs"`)
- Test: `tests/worker-admin-reconcile-kpis.test.js`
- Test: `tests/admin-reconcile-script-smoke.test.js` (entrypoint-guard + CRLF-safe invocation)

**Approach:**
- **Server-side recompute (adversarial hardening):** the route does NOT trust the client's `computedValues`. It re-computes every metric server-side from source tables (same SELECT COUNT queries the script runs). The client-supplied `computedValues` are used only for drift diagnostics — logged as `{ clientComputed, serverComputed, delta }` in the mutation receipt so forensic audit can catch a rogue admin trying to zero counters. The authoritative write uses the server's own numbers.
- **Script computes canonical values** via `SELECT COUNT(*) ...` for each `metric_key` (client-side, for the diagnostic log only).
- **Single-flight lock with explicit staleness detection:**
  1. INSERT OR IGNORE into `admin_kpi_metrics` row with `metric_key = 'reconcile_pending:lock'`, `metric_count = 0`, `updated_at = :now` (ab-used as a lock table; one row, singleton pattern).
  2. SELECT `metric_count` AS `owner_hash_low`, `updated_at` FROM `admin_kpi_metrics WHERE metric_key = 'reconcile_pending:lock'` — where `owner_hash_low` is the low-32-bits of the caller's `requestId` hashed as integer, encoded into `metric_count`.
  3. If the returned row's `owner_hash_low` matches the caller's → acquired (we won the INSERT).
  4. Else if `now - updated_at > 600_000` (10 minute stale window) → CAS-takeover: `UPDATE admin_kpi_metrics SET metric_count = :ourOwnerHash, updated_at = :now WHERE metric_key = 'reconcile_pending:lock' AND metric_count = :staleOwnerHash`. If `rowsAffected = 1`, takeover succeeded; else another caller took over first → return 409 `reconcile_in_progress`.
  5. Else (locked, not stale) → return 409 `reconcile_in_progress`.
  6. After completion: `DELETE FROM admin_kpi_metrics WHERE metric_key = 'reconcile_pending:lock' AND metric_count = :ourOwnerHash` (CAS on own hash prevents us from accidentally clearing a later takeover's lock if we timed out).
- **Heartbeat for long runs:** if reconciliation iterates across many metric_keys, heartbeat every 30s by `UPDATE ... SET updated_at = :now WHERE metric_count = :ourOwnerHash`. Keeps stale-detection accurate.
- **Drift-vs-live-bump:** reconciliation writes are "last write wins" within the batch window. A live bump arriving between server-side SELECT COUNT and the write phase will be overwritten. Accepted: daily cadence bounds drift to ≤24h.
- **Mutation-receipt for forensic:** every reconciliation call writes a receipt with `mutation_kind = 'admin.ops.reconcile_kpis'`, `scope_type = 'platform'`, `scope_id = 'reconcile-kpis:<requestId>'`, body containing `{ clientComputed, serverComputed, appliedCounts, deltas }` for every metric_key. A rogue admin attempting counter tampering leaves a full audit trail.
- **Alternative considered:** `INSERT ... ON CONFLICT DO UPDATE SET metric_count = MAX(excluded.metric_count, admin_kpi_metrics.metric_count)` — rejected because it cannot *correct* an over-counted metric.

**Patterns to follow:** `scripts/backfill-learner-read-models.mjs`; Wrangler OAuth path.

**Test scenarios:**
- Happy path: script runs, posts computed values; route re-computes server-side; route writes server values; returns 200 with summary of deltas per metric_key + client-vs-server discrepancies (should be zero if script timing was clean).
- Edge case: client posts tampered `computedValues = { '<key>': 0 }` — server recomputes, writes real value, audit-log entry records the discrepancy.
- Edge case: live counter bump between server's SELECT and write — reconciliation's value wins; documented expected behaviour (drift reappears within a day, bounded).
- Error path: two concurrent reconciliations — first acquires lock; second sees non-stale lock → 409 `reconcile_in_progress`.
- Error path stale-lock recovery: simulated Worker crash leaves lock row with `updated_at = now - 11min`. Next caller sees stale, CAS-takeover succeeds, completes normally.
- Error path stale-lock race: two callers both see stale lock, both attempt CAS-takeover; CAS on old hash means exactly one wins → the other gets 409.
- Integration: script invoked via OAuth wrapper; CLI entrypoint guard passes on Windows; exit code 0 on success, 1 on failure.
- Edge case: metric_key in source table but absent from reconciliation spec — not touched (reconciliation is allowlist-based, not sweep).
- Forensic: every reconciliation writes a `admin.ops.reconcile_kpis` mutation receipt; `npm run test -- tests/worker-admin-reconcile-kpis.test.js` asserts receipt shape.

**Verification:** `npm run admin:reconcile-kpis` against local test instance updates counters; deployed reconciliation returns a diff summary; the 10-min stale-lock window plus heartbeat prevents concurrent overwrites while allowing crash recovery.

---

- U11. **Cloudflare Cron Trigger + capacity telemetry**

**Goal:** wire a `scheduled` handler into the Worker that invokes the reconciliation internally; publish cron failure to capacity telemetry so the admin dashboard surfaces it.

**Requirements:** R9

**Dependencies:** U10

**Files:**
- Modify: `wrangler.toml` (add `[triggers] crons = ["0 4 * * *"]`)
- Modify: `worker/src/index.js` (add `scheduled(event, env, ctx)` export that calls an internal `reconcileAdminKpiMetricsInternal(env)` helper — bypasses HTTP)
- Modify: `worker/src/repository.js` (factor `reconcileAdminKpiMetricsInternal` out of U10's route handler so both paths share logic)
- Modify: `src/main.js` + `AdminHubSurface.jsx` (surface `lastReconciledAt` + `cronFailureAt` in dashboard KPI panel)
- Test: `tests/worker-cron-trigger-reconcile.test.js`

**Approach:**
- Cron uses the same single-flight logic as the HTTP route, so a manual+cron collision is safely prevented.
- **Cron fires twice daily** (primary `0 4 * * *`, fallback retry `0 5 * * *`) so a crashed/locked primary run self-recovers within an hour rather than 24h.
- **Retention sweep** included in the cron handler (runs after reconciliation succeeds):
  - `DELETE FROM account_sessions WHERE status_revision_at_issue < (SELECT MAX(status_revision) FROM account_ops_metadata WHERE account_id = account_sessions.account_id) AND expires_at < :now` — prunes stale sessions orphaned by revision-bump sweeps (defence-in-depth for U14's immediate sweep).
  - `DELETE FROM mutation_receipts WHERE created_at < :now - 30_day_ms` — prunes old receipts so CAS-retry storms don't grow the table unbounded (30-day retention window; adjust if forensic retention requires longer).
  - `DELETE FROM request_limits WHERE reset_at < :now - 24_hour_ms` — the request_limits table already expires buckets, but old rows can linger; this is explicit cleanup.
- **Telemetry keys** (explicit names per coherence review):
  - Success: UPSERT `admin_kpi_metrics` rows with `metric_key = 'capacity.cron.reconcile.success'`, `metric_count = <counter>`, `updated_at = :now`.
  - Success timestamp: `metric_key = 'capacity.cron.reconcile.last_success_at'`, `metric_count = :now`.
  - Failure: `metric_key = 'capacity.cron.reconcile.last_failure_at'`, `metric_count = :now`.
  - Failure reason (string): stored in a separate `admin_kpi_metrics` column or in a dedicated `admin_ops_cron_telemetry` keyed row — defer shape to implementation.
- **Dashboard banner** shows `last_failure_at > last_success_at` → "Automated reconciliation failed at <human-date>; last success <human-date>. Investigate or run `npm run admin:reconcile-kpis`."

**Technical design:** directional only. Cron is a plain `scheduled` handler; no fanout, no DO.

**Patterns to follow:** Cloudflare docs `/workers/configuration/cron-triggers/`; existing `capacity.*` metric emission if present, else define a convention.

**Test scenarios:**
- Happy path: Miniflare-style test harness triggers `scheduled` event; reconciliation runs; `last_success_at` bumps.
- Error path: D1 read throws inside cron — failure is captured into telemetry; dashboard banner renders on next refresh.
- Edge case: cron fires while a manual HTTP reconciliation is in flight — second attempt is rejected, logged, but not escalated to failure telemetry (document this as expected).

**Verification:** staged deployment with cron set to a near-term time proves the schedule fires and telemetry updates.

---

- U12. **`withTransaction` call-site audit + removal in admin-ops paths**

**Goal:** audit every `withTransaction` call; remove where it is a silent no-op; document remaining where true savepoint behaviour is desired but unavailable on production D1.

**Requirements:** R10

**Dependencies:** none (can land before or after U7–U11; sequenced here for PR review cohesion)

**Files:**
- Modify: `worker/src/repository.js` (audit call sites at lines 3193, 3623, 4478, 4591; remove where they're no-op wrappers around a single handler call)
- Modify: `worker/src/auth.js` (audit call sites at 125, 613, 968; same treatment)
- Create: `docs/hardening/withtransaction-audit.md` (one-line-per-site table: removed / kept-with-comment / out-of-P1.5-scope)

**Approach:**
- **Decision rubric (sharpened per correctness review):**
  1. **Single DB call inside wrapper** → delete the wrapper (always a no-op; behaviour-preserving removal).
  2. **Multiple statements, pure SQL, no intermediate branching, no external I/O, no `lastrowid` dependency** → convert to `batch([stmt1, stmt2, ...])`. This is the common case; atomicity is genuinely recoverable.
  3. **Multiple statements but at least one of (a) branching on intermediate read results, (b) external call (KV/fetch/DO), (c) statement dependency on a generated ID from an earlier statement** → accept non-atomicity; add `// NOTE: non-atomic by design — <specific reason (a/b/c + detail)>` comment. Atomicity is not recoverable without architectural changes; do NOT hide this behind a false wrapper.
- Cross-table reads and cross-table writes are NOT reasons to accept non-atomicity — `batch()` supports them. The only valid reasons are (a)(b)(c) above. An implementer following the letter of this rubric cannot accidentally bake in silent races.
- Out-of-P1.5 sites (those outside the admin-ops / auth reach) are listed in the audit doc with rationale for deferral.
- **Audit doc columns** (per coherence review): path:line | decision (removed / batched / kept-non-atomic) | reason (a/b/c or "always no-op") | regression-test status.

**Patterns to follow:** Canonical template `saveMonsterVisualConfigDraft`; wrong template `updateManagedAccountRole`.

**Test scenarios:**
- Regression: `npm run test` green after every removal (the wrapper was a no-op on production D1, so removal is behaviour-preserving there; in the test shim with `supportsSqlTransactions = true`, removal DOES change semantics — every test path hitting removed sites must exercise the new `batch()` form or the accepted non-atomic path).
- Happy path batched conversion: a multi-statement wrapper converted to `batch([...])` now passes the same test suite; add one explicit atomicity test (`delete DB.supportsSqlTransactions` before running, per the D1 atomicity learning) to prove the `batch()` is genuinely atomic in the shim.
- Edge case accepted non-atomic: the `// NOTE: non-atomic by design — <reason>` comment appears on every site where (a)(b)(c) applies; CI grep-assertion confirms no site is kept without the comment.

**Verification:** `grep -rn 'withTransaction' worker/src/ tests/` shows exactly the expected count: 1 declaration in `d1.js` + all explicit-kept sites (listed in the audit doc); no surprise matches. `docs/hardening/withtransaction-audit.md` has a row per every pre-removal site.

---

### Phase D — `ops_status` enforcement (PR 4 of 5)

- U13. **Session stamping: `account_sessions.status_revision_at_issue` + suspended-account rejection at createSession**

**Goal:** (a) stamp the account's current `status_revision` into the session at login so `requireSession()` can compare on each request; (b) `createSession` refuses to issue a cookie for non-active accounts.

**Requirements:** R12

**Dependencies:** U7 (migration includes `account_sessions.status_revision_at_issue` + all other P1.5 columns)

**Files:**
- Modify: `worker/src/auth.js` (at session creation — pre-check `ops_status`; reject suspended with redirect to `/?auth=account_suspended`; for active and payment_hold accounts, read current `status_revision` from `account_ops_metadata`, stamp into the new session row)
- Note: `account_sessions.status_revision_at_issue` column is added by U7 (migration 0011). U13 only reads and writes it.
- Test: `tests/worker-session-status-revision-stamp.test.js`
- Test: `tests/worker-session-creation-refuses-suspended.test.js`

**Approach:**
- **Migration scope (corrected):** the `account_sessions.status_revision_at_issue` column is added by U7's migration 0011, not by U13. U13 only reads and writes it. This simplifies the Phase C → Phase D sequencing invariant: PR 3 lands the complete schema; PR 4 only adds application logic.
- **Session creation points:** OAuth callback, demo-session bootstrap, dev-stub. All converge on the `INSERT INTO account_sessions` path.
- **Pre-create `ops_status` check:** `SELECT ops_status FROM account_ops_metadata WHERE account_id = ?` (LEFT JOIN style; treat missing row as `'active'`). If not `active`:
  - `suspended` → no INSERT; return 302 redirect to `/?auth=account_suspended`; no cookie set.
  - `payment_hold` → conditional: if session endpoint is a parent/admin-access path (deferred — all session creation in P1.5 is adult-access), issue cookie; `requireMutationCapability` later handles mutation blocking. The simpler policy adopted here: `payment_hold` still allows session issuance so the user can access their billing UI.
- **INSERT shape:** extend to include `status_revision_at_issue = :current_status_revision` (COALESCE from the same SELECT used for the pre-check).
- **Audit:** a rejected session attempt emits a capacity-telemetry event `capacity.auth.session_creation_refused.<reason>` so repeated rejections (sign of a returning-after-suspend flow) are visible.

**Patterns to follow:** existing `INSERT INTO account_sessions` call sites in `auth.js`.

**Test scenarios:**
- Happy path active: new session has `status_revision_at_issue` matching account's current `status_revision`.
- Error path suspended: `ops_status = 'suspended'` account — session creation returns 302 to `/?auth=account_suspended`; no `account_sessions` row; no cookie header; capacity event logged.
- Happy path payment_hold: `ops_status = 'payment_hold'` account — session IS created (user can reach billing UI); request-level `requireMutationCapability` handles the later write-blocking. Tested separately in U14.
- Edge case legacy account: no `account_ops_metadata` row — treated as `active`; session creates normally with `status_revision_at_issue = 0`.
- Edge case pre-migration session: sessions issued before 0011 applies have `status_revision_at_issue = 0` (default). They remain valid until the account's `status_revision` bumps above 0.

**Verification:** fresh active login stamps correctly; suspended OAuth callback returns redirect without cookie; session rows for suspended accounts do not accumulate.

---

- U14. **`requireActiveAccount(session)` + `requireMutationCapability(session)`**

**Goal:** auth-boundary helpers that reject `suspended` + stale-revision sessions with `account_suspended` / `session_invalidated`; mutation-layer helper rejects `payment_hold` writes with `account_payment_hold`.

**Requirements:** R11, R12

**Dependencies:** U13

**Files:**
- Modify: `worker/src/auth.js` (extend `requireSession` to JOIN `account_ops_metadata` in its session SELECT; add new exports `requireActiveAccount(session)` and `requireMutationCapability(session)`)
- Modify: `worker/src/errors.js` (add `AccountSuspendedError`, `AccountPaymentHoldError`, `SessionInvalidatedError` — all extend `ForbiddenError` / `UnauthenticatedError` as appropriate)
- Create: `worker/src/error-codes.js` (first pass — named constants for the three new codes plus the existing codes the new code will reference)
- Modify: `worker/src/app.js` (every mutation-receipt-bearing route — insert `requireMutationCapability(session)` after `requireSession()`)
- Test: `tests/worker-auth-ops-status-enforcement.test.js`

**Approach:**
- `requireSession()` JOIN is one-line additive to the existing SELECT (`account_ops_metadata.ops_status`, `account_ops_metadata.status_revision`). The JOIN is LEFT JOIN (legacy accounts with no metadata row are treated as `active`).
- **Migration soft-fail guard:** the JOIN is wrapped in a try/catch that detects `no such column` or `no such table` — behaviour falls back to pre-Phase-D semantics (no enforcement) with a loud capacity-telemetry event `capacity.auth.enforcement_unavailable`. This protects against the partial-migration scenario (flow gap + adv-12) where PR 4 lands before migration 0011 has fully applied; after the next deploy, behaviour snaps back to enforced.
- `requireActiveAccount(session)` is called implicitly by `requireSession()` — throws `AccountSuspendedError` or `SessionInvalidatedError`.
- `requireMutationCapability(session)` is called explicitly by mutation routes and throws `AccountPaymentHoldError` when `ops_status = 'payment_hold'`. Must be called in every mutation route.
- **Coverage meta-test** (adv-7): `tests/worker-mutation-capability-coverage.test.js` reads `worker/src/app.js`, enumerates every route handler with method `PUT` / `POST` / `DELETE`, and asserts the handler body contains a `requireMutationCapability(session)` call within 20 lines of its `requireSession()` call (or is explicitly listed in an allowlist for documented exemptions like `/api/ops/error-event`, which is unauthenticated). A future PR adding a new mutation route cannot forget the helper without failing CI.
- **Stale-session sweep on revision bump** (adv-6): when `updateAccountOpsMetadata` in U15 bumps `status_revision`, the same `batch()` appends `DELETE FROM account_sessions WHERE account_id = :target AND status_revision_at_issue < :new_revision`. Previous sessions become unreachable immediately on commit rather than lingering as invalidated rows. Verified in U11's retention sweep cron as defence-in-depth.
- Per-route memo: cache the JOIN result on `session._account_meta_cache` so successive helpers in the same request don't re-query.

**Execution note:** start with failing integration tests for all three error cases + the coverage meta-test + the stale-session sweep.

**Patterns to follow:** existing `requireSession()` structure at `auth.js:1187`; `requireMutationCapability` mirrors `requireAdminHubAccess` shape.

**Test scenarios:**
- Happy path: `active` account, fresh session — all three helpers return cleanly.
- Error path: `suspended` account → `requireActiveAccount` throws 403 `account_suspended`.
- Error path: stale `status_revision_at_issue` (account bumped but session not re-issued) → throws 401 `session_invalidated`.
- Error path: `payment_hold` account + mutation route → throws 403 `account_payment_hold`.
- Happy path: `payment_hold` account + GET route → passes (not a mutation).
- Integration: admin bumps target user to `suspended`; target's next request fails with `session_invalidated` (revision mismatch); on re-login (new session stamps new revision), request succeeds if `ops_status` later returned to `active`, or fails with `account_suspended` if still suspended.
- Edge case: legacy account with no `account_ops_metadata` row — LEFT JOIN returns NULL; treated as `active`; no session_invalidated.
- Edge case: migration 0011 not yet applied (new column absent) — JOIN soft-fails; capacity event fires; request passes through unenforced; next deploy snaps back to enforcement.
- Edge case: stale-session sweep on revision bump — two tabs of same account share cookie S1. Admin bumps revision. Both tabs fail with `session_invalidated`. Both re-auth. Old S1 row is DELETEd by the sweep in the same `batch()` as the bump, so no ghost row remains.
- Meta-test: `tests/worker-mutation-capability-coverage.test.js` enumerates every `POST/PUT/DELETE` route in `worker/src/app.js`; fails CI if any route doesn't call `requireMutationCapability` within 20 lines of `requireSession` (allowlist covers `/api/ops/error-event` and other documented public endpoints).

**Verification:** enforcement matrix (from H-LTD above) passes end-to-end; every mutation route calls `requireMutationCapability` (meta-test proves this structurally); stale-session sweep verified via two-tab fixture.

---

- U15. **Self-suspend guard + last-active-admin guard + `ops_status` transition persistence**

**Goal:** `updateAccountOpsMetadata` rejects self-suspend AND rejects suspending/payment-holding the last active admin; `ops_status` transitions bump `status_revision`; every UPDATE bumps `row_version`; `updateOpsErrorEventStatus` writes `resolved_in_release` + `last_status_change_at`; remove the R27 non-enforcement UI callout and flip `docs/operating-surfaces.md:260`.

**Requirements:** R13 (and supporting R6, R12, R15)

**Dependencies:** U14

**Files:**
- Modify: `worker/src/repository.js` (`updateAccountOpsMetadata` — add pre-check guards; UPDATE statement always bumps `row_version`, bumps `status_revision` only when `ops_status` differs; single `batch()` call)
- Modify: `worker/src/repository.js` (`updateOpsErrorEventStatus` — when transitioning to `resolved`, write `resolved_in_release = <server-side BUILD_HASH>`; on any status transition, write `last_status_change_at = now`)
- Modify: `worker/src/error-codes.js` (add `SELF_SUSPEND_FORBIDDEN`, `LAST_ADMIN_LOCKED_OUT`, `ACCOUNT_SUSPENDED`, `ACCOUNT_PAYMENT_HOLD`, `SESSION_INVALIDATED`, `ACCOUNT_OPS_METADATA_STALE`, `RECONCILE_IN_PROGRESS`)
- Modify: `src/surfaces/hubs/AdminHubSurface.jsx` (remove the R27 non-enforcement callout at line 179 and its string-assertion; add a read-only "Status is enforced" note adjacent to the `ops_status` selector; add a confirmation dialog on submit of a non-`active` `ops_status` value naming the target account)
- Modify: `src/main.js` (error-banner router — add text mappings for all new codes per U1's pattern; mutation 401 `session_invalidated` triggers global sign-in redirect, not a per-panel banner)
- Modify: `tests/react-hub-surfaces.test.js` (remove the R27 callout assertion at its current location; add assertion for the new "Status is enforced" note; confirm the confirm-dialog interaction)
- Modify: `docs/operating-surfaces.md` (replace line 260 text — see "Approach" below for exact strings)
- Create: `docs/hardening/admin-lockout-runbook.md` (emergency D1-console recovery path for the mutual-admin-suspend edge case)
- Test: `tests/worker-self-suspend-guard.test.js`
- Test: `tests/worker-last-admin-locked-out.test.js`
- Test: `tests/worker-ops-status-revision-bump.test.js`
- Test: `tests/worker-account-ops-row-version-always-bumps.test.js`
- Test: `tests/worker-resolved-in-release-write.test.js`

**Approach:**
- **Guard order** (fire before any DB work):
  1. Self-suspend: `if (actorAccountId === targetAccountId && incomingStatus !== 'active' && incomingStatus !== null) throw new ForbiddenError('self_suspend_forbidden', ...)`
  2. Last-active-admin: when `incomingStatus !== 'active'` AND the target row has `platform_role = 'admin'`, run a pre-check `SELECT COUNT(*) FROM adult_accounts a JOIN account_ops_metadata m ON m.account_id = a.id WHERE a.platform_role = 'admin' AND m.ops_status = 'active' AND a.id != :targetId` and reject with `ConflictError('last_admin_locked_out', ...)` if count is 0. (Zero means this target is the only active admin.)
- **Combined UPDATE statement** (single `batch()`):
  `UPDATE account_ops_metadata SET ops_status = :newStatus, plan_label = :newLabel, ..., row_version = row_version + 1, status_revision = status_revision + CASE WHEN ops_status <> :newStatus THEN 1 ELSE 0 END, updated_at = :now WHERE account_id = :targetId AND row_version = :expectedRowVersion`
  One statement, two counters, CAS guard, atomicity via `batch`.
- **`updateOpsErrorEventStatus` release write:** when the admin action is `status → resolved`, read server's `__BUILD_HASH__` (same constant the Worker bundle uses) OR `env.BUILD_HASH`. Fall back to NULL if both are absent - Phase E U17's auto-reopen rule requires `resolved_in_release IS NOT NULL`, so NULL effectively opts out, which is the correct semantic (no reopen on missing release stamps). Write into `resolved_in_release`. On any status transition (including `resolved → open` / `open → investigating`), write `last_status_change_at = :now`. No existing test broken — both columns are nullable additions from U7.
- **`docs/operating-surfaces.md:260` flip:**
  - **OLD text (approximate — verify at implementation time):** `no ops_status enforcement in auth (sign-in still succeeds for suspended / payment-hold accounts in P1; enforcement deferred)`.
  - **NEW text:** `ops_status enforcement at auth boundary: suspended → 403 account_suspended on every authenticated request; payment_hold → 403 account_payment_hold on mutation-receipt paths (GETs remain accessible); enforcement hooks via requireActiveAccount() and requireMutationCapability() in worker/src/auth.js; session invalidation via status_revision bump on every transition (see docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md).`
- **Confirmation dialog UI** — when the admin submits `ops_status != 'active'` for another admin, SPA shows `Are you sure? This will immediately revoke <account_id_last6>'s access. Type the account id to confirm.` This is operational defence against accidental mutual-admin lockout.

**Execution note:** test-first for the guards — the last-active-admin guard is easy to forget and easy to test.

**Patterns to follow:** `last_admin_required` application-layer guard at `repository.js:3682` (role demote), mirrored here for `ops_status` transitions.

**Test scenarios:**
- Happy path: admin A sets admin B (second admin) to `suspended` — succeeds; `row_version` bumps; `status_revision` bumps on B; B's next request fails with `session_invalidated` (U14 test).
- Error path guard 1: admin A sets admin A's own `ops_status` to `suspended` → 403 `self_suspend_forbidden`; no DB writes; no `row_version` bump.
- Error path guard 2: admin A is sole active admin; admin A sets admin A's own `ops_status` to `payment_hold` → 403 `self_suspend_forbidden` (self-suspend fires first, preempting last-admin check).
- Error path guard 2 cross-actor: admin A + admin B both active; admin B suspends admin A first → A is suspended. Now B is sole active admin. Admin B sets admin A to `active` but A is the only admin currently non-active → allowed (last-admin guard only blocks transitions AWAY from active for the sole active admin). Admin C (created by B) then suspends admin B → this is legal only if admin A is active at that moment; if A is still suspended → 409 `last_admin_locked_out`.
- Error path guard 2 concurrent: two admins A and B exist, both active; admin A tries to suspend admin B at the same moment admin B tries to suspend admin A. Both pre-check sees two actives; both pass the pre-check. Batch 1 commits (e.g. A→suspended); batch 2's UPDATE for B uses `WHERE row_version = :expectedB` but the guard result has been stale. Documented acceptance: one wins on account of row_version CAS; the other's 409 triggers the 'Keep mine' UX and rerun — on rerun the last-admin pre-check NOW sees only one active admin (the winner) and rejects with 409 `last_admin_locked_out`.
- Happy path active→active no-op (same actor): admin A PATCHes with `ops_status = 'active'` (already active) → succeeds; `row_version` bumps (other fields may have changed); `status_revision` UNCHANGED (the CASE expression returns 0).
- Happy path `plan_label`-only change: PATCH with only `plan_label` change, no `ops_status` in body → `row_version` bumps; `status_revision` UNCHANGED.
- Happy path transition `active → suspended → active`: `status_revision` bumps twice (N → N+1 → N+2); `row_version` bumps twice (M → M+1 → M+2); both in lock-step because both UPDATEs.
- Happy path `resolved_in_release` write: admin transitions error event to `resolved` → row's `resolved_in_release` equals server's `__BUILD_HASH__`.
- Happy path `last_status_change_at` write: admin transitions error event from `open → investigating` → row's `last_status_change_at = now`.
- Edge case `BUILD_HASH` absent: server has no `__BUILD_HASH__` / `env.BUILD_HASH` -> `resolved_in_release = NULL`; error event resolves cleanly; auto-reopen rule (U17) will NOT fire against NULL because the rule additionally requires `resolved_in_release IS NOT NULL` (the correct opt-out).
- Integration react-hub-surfaces.test.js: R27 callout removed; "Status is enforced" note present; confirmation dialog renders on non-active submit.

**Verification:** R27 callout gone; confirmation dialog present; guard matrix walkthrough in staging; `docs/operating-surfaces.md:260` updated; `tests/worker-self-suspend-guard.test.js` + `tests/worker-last-admin-locked-out.test.js` green.

---

### Phase E — Error centre debugging cockpit (PR 5 of 5)

- U16. **Build-hash injection via esbuild `define`**

**Goal:** `scripts/build-bundles.mjs` reads `git rev-parse --short HEAD`, injects `__BUILD_HASH__` constant into the client bundle; `captureClientError` forwards it on every POST.

**Requirements:** R14

**Dependencies:** none

**Files:**
- Modify: `scripts/build-bundles.mjs` (or `scripts/build-client.mjs` depending on which owns the `define` block) — `execSync('git rev-parse --short HEAD')` with CI fallback
- Modify: `src/platform/ops/error-capture.js` — reference `__BUILD_HASH__` (with `typeof` guard), include in payload
- Modify: `worker/src/app.js` — public ingest route accepts `release` field; passes through to `recordClientErrorEvent`
- Modify: `worker/src/repository.js` (`recordClientErrorEvent`) — write `last_seen_release` on every event; write `first_seen_release` only on fresh INSERT; NULL release tolerated
- Test: `tests/build-hash-injection.test.js`
- Test: `tests/worker-ops-error-event-release.test.js`

**Approach:**
- `JSON.stringify(hash)` for proper escaping. Fallbacks: (a) `.git` absent (CI shallow clones) → `null` (not `"unknown"` — NULL signals "don't auto-reopen on this"); (b) tree is dirty (`git status --porcelain` non-empty) → `null`. Dirty-tree builds never stamp, preventing dev/prod release cross-contamination.
- Client-side guard: `const release = typeof __BUILD_HASH__ === 'string' ? __BUILD_HASH__ : null;`.
- **Server-side regex (tightened per adversarial review):** accept only lowercase-hex 6–40 chars — `/^[a-f0-9]{6,40}$/`. No case-insensitive flag, no dots, no dashes, no underscores. Rejects `principal` (lowercase letters not all hex), `PRINCIPAL` (uppercase), `V5-BETA`, `2026.04.25` — everything that isn't SHA-shaped.
- **Validate before truncate:** length > 40 OR regex mismatch → reject with 400 `validation_failed`. No silent truncation.
- **Defence-in-depth redaction:** still pass `release` through `scrubSensitiveServer` + `scrubAllCapsServer` before write, even though the regex already excludes any input those would match. Cheap; future-proofs against accidental regex widening.
- Semver / tagged-release rollout is a deliberate follow-up that will widen this regex to accept semver shapes; deliberately outside P1.5 scope.

**Execution note:** CLI + build-script hygiene per the Windows learning (CRLF normalisation, `pathToFileURL` entrypoint guard).

**Patterns to follow:** existing `scripts/build-bundles.mjs` `metafile: true` already writes a sidecar JSON; follow the same orchestrator fail-fast pattern.

**Test scenarios:**
- Happy path: clean build runs; bundled output contains a string literal matching `/^[a-f0-9]{6,40}$/`; error-capture test asserts payload contains `release` field with matching value.
- Edge case: dirty tree — release is `null` in payload; server writes NULL; auto-reopen rule doesn't fire on NULL.
- Edge case: missing `.git` (CI edge case) — release is `null`; same behaviour as dirty.
- Error path: malicious client posts `release: 'principal'` — server rejects with 400 `validation_failed`. (Regression test against the adversarial finding.)
- Error path: malicious client posts `release: 'PRINCIPAL'` — server rejects with 400 `validation_failed`.
- Error path: `release` = `'abc' + '0'.repeat(200)` — rejected; payload too long.
- Happy path fresh insert: valid release → `first_seen_release = last_seen_release = payload.release`.
- Happy path dedup: valid release, existing fingerprint → `last_seen_release` updates to new release; `first_seen_release` preserved.

**Verification:** bundle grep shows injected SHA; live POST with valid SHA accepts; live POST with `principal` rejects with 400; DB row has both columns populated with SHA-shaped strings only.

---

- U17. **Auto-reopen on release transition**

**Goal:** when an event matching a `status='resolved'` fingerprint arrives from a release ≠ `resolved_in_release` and the 24h cooldown has elapsed, the status flips back to `open` and `last_status_change_at` updates.

**Requirements:** R15

**Dependencies:** U7, U16

**Files:**
- Modify: `worker/src/repository.js` (`recordClientErrorEvent` — after fingerprint lookup, apply the auto-reopen rule before the dedup UPSERT)
- Test: `tests/worker-ops-error-event-auto-reopen.test.js`

**Approach:**
- Logic lives in the existing `recordClientErrorEvent` pre-check before UPSERT (around `repository.js:2741-2760`). One additional SQL read to fetch `status, resolved_in_release, last_status_change_at` — feasible inside the existing fingerprint lookup (extend the SELECT).
- **Rule (gated on all five conditions):** auto-reopen fires when
  1. `status = 'resolved'` (NOT `ignored`, NOT `open`, NOT `investigating` — `ignored` is terminal-until-manual)
  2. `resolved_in_release IS NOT NULL`
  3. incoming `release IS NOT NULL` AND SHA-shaped per U16 regex
  4. incoming `release != resolved_in_release`
  5. `now - last_status_change_at > 86_400_000` (24h cooldown)
- **Cooldown semantics:** `last_status_change_at` is written on every status transition (both manual via `updateOpsErrorEventStatus` in U15 AND auto-reopen here). Dedup-UPSERTs for non-status-changing events DO NOT touch `last_status_change_at`. This makes the 24h window measured from the most recent status transition (resolve OR reopen), preventing traffic from silently extending or shortening the cooldown.
- **Write path for `resolved_in_release`:** NOT in U17. U15 owns the write (when an admin transitions to `resolved`, U15's `updateOpsErrorEventStatus` writes server's `__BUILD_HASH__` into `resolved_in_release` AND writes `last_status_change_at = :now`). U17 only READS these columns.
- **Counter swap when auto-reopen triggers:** `batch()` gets one more statement — `UPDATE status = 'open', last_status_change_at = :now` — plus counter decrement at `ops_error_events.status.resolved` and increment at `.open`.
- **Does not cascade a mutation receipt.** Auto-reopen is triggered by a public (anonymous) client event — there is no actor to scope a receipt to. Reconciliation (U10) covers the counter drift this creates.

**Execution note:** test-first; the cooldown edge cases are tricky.

**Patterns to follow:** existing CAS + batch pattern for status transitions.

**Test scenarios:**
- Happy path: fingerprint resolved in release A (resolved_in_release='abc123', last_status_change_at=T-25h). Event from release B (`def456`) at T → rule fires: all 5 conditions met → status → open; counter swap; `last_status_change_at = T`.
- Edge case same-release recurrence: event from same release A within 1h → rule fails condition 4 (releases match); normal dedup UPSERT; status unchanged.
- Edge case NULL release: incoming event with `release = null` → rule fails condition 3; normal dedup; no reopen (prevents legacy / pre-injection clients from triggering).
- Edge case malformed-but-accepted release: incoming event with a valid SHA-shape that differs from resolved_in_release → rule fires (normal path).
- Edge case ignored status: fingerprint status = `ignored`, last_status_change_at = T-48h; event from new release arrives → rule fails condition 1 (`status != 'resolved'`); status remains `ignored`; no reopen. This is load-bearing — admins use `ignored` to silence noisy errors permanently.
- Edge case cooldown active: fingerprint resolved at T; event from new release at T+12h → rule fails condition 5 (within 24h cooldown); normal dedup; `last_status_change_at` UNCHANGED (the dedup path does not touch it).
- Edge case cooldown boundary: fingerprint resolved at T; event from new release at T+24h+1ms → rule fires; new `last_status_change_at = T+24h+1ms`; next reopen cannot fire before T+48h+2ms.
- Edge case resolved-in-release is NULL: fingerprint resolved but without a release stamp (legacy resolve before U15 shipped) → rule fails condition 2; no reopen.
- Integration: a manual admin transition to resolved → subsequent auto-reopen by a new release after cooldown → the swap is visible via next narrow refresh of the error-centre panel; KPI counters stay consistent with reconciliation.
- Integration resolved-silent-recurs: resolved in release A at T; silent in release B (no events) for T..T+72h; event from release C at T+72h → rule fires; `last_status_change_at = T+72h`; `resolved_in_release` preserved as `A` until admin resolves again.

**Verification:** auto-reopen happens exactly once per eligible trigger; cooldown suppresses churn; counters stay consistent with reconciliation; `ignored` never auto-reopens.

---

- U18. **Error-centre details drawer**

**Goal:** per-row expandable drawer with full event metadata, redacted per actor role.

**Requirements:** R16

**Dependencies:** U16

**Files:**
- Modify: `src/surfaces/hubs/AdminHubSurface.jsx` (`ErrorLogCentrePanel` — each row wraps in `<details>`; `<summary>` renders the current compact row; the expanded body renders the drawer)
- Modify: `worker/src/repository.js` (`readAdminOpsErrorEvents` — return drawer-ready fields; redact per `actorPlatformRole` per R25)
- Modify: `src/platform/hubs/admin-read-model.js` (normalise new fields)
- Test: `tests/react-admin-error-drawer.test.js`
- Test: `tests/worker-admin-ops-error-events-drawer-payload.test.js`

**Approach:**
- Drawer fields: full stack frame (admin only — stored but currently only `firstFrame` is persisted; P1.5 drawer exposes the already-captured firstFrame, deeper frames are deferred), route name, user-agent, first_seen / last_seen (absolute + relative), occurrence_count, first_seen_release / last_seen_release / resolved_in_release, linked account last-6-chars (admin only), last 5 occurrence timestamps (requires a new lightweight `ops_error_event_occurrences` pattern OR skipping — decide in U18: P1.5 exposes `occurrence_count` + `first_seen` + `last_seen` only; occurrence timeline is deferred).
- Reuse `<details>/<summary>` pattern from `AdminHubSurface.jsx:530-536` — no new drawer primitive.
- Redaction matrix: admin sees all; ops-role sees `account_id` as NULL (redacted); public / parent never reach this surface.

**Patterns to follow:** R25 redaction convention; existing `formatTimestamp` + `formatTimestampRelative` utilities.

**Test scenarios:**
- Happy path admin: drawer shows all fields including `internal_notes` link placeholders.
- Happy path ops: drawer shows same metadata but `account_id` is NULL.
- Edge case: NULL `first_seen_release` on a legacy event — drawer shows "release: unknown".
- Integration: dirty-form protection from Phase A applies to the drawer (if drawer had form fields — currently read-only, so NA; future-proof).

**Verification:** manual browser walkthrough; automated tests assert the role-based redaction.

---

- U19. **Error-centre filters (route / kind / date-range / new-in-release / reopened-after-resolved)**

**Goal:** admin can narrow the error list using multiple filters combined; route/kind use server-side SQL filters; "new in release" and "reopened" use the release-tracking columns.

**Requirements:** R17

**Dependencies:** U7, U16, U17

**Files:**
- Modify: `worker/src/repository.js` (`readAdminOpsErrorEvents` — accept filter arg `{ status, route, kind, lastSeenAfter, lastSeenBefore, release, reopenedAfterResolved }`; build dynamic WHERE; bound inputs)
- Modify: `worker/src/app.js` (`/api/admin/ops/error-events` GET route — accept URL query parameters, validate, pass through)
- Modify: `src/surfaces/hubs/AdminHubSurface.jsx` — add filter UI (chips for status already exist; add select for route, text input for kind, date-range pair, checkbox for "new in this release", checkbox for "reopened after resolved")
- Modify: `src/main.js` — `refreshAdminOpsErrorEvents(filters)` threads the filter object through
- Test: `tests/worker-admin-ops-error-events-filter.test.js`

**Approach:**
- Route filter: `LIKE '%' || ? || '%'` with a covering index on `route_name` (ensure one exists; if not, add to migration 0011 in U7). Input is capped at 64 chars.
- Kind: exact match.
- Date-range: numeric timestamps; sane bounds (not more than 90 days ago, cap on range span).
- "New in this release": requires the client to know the current release. Simplest: server exposes `currentRelease` on the admin-ops payload; client filter UI says "New in release <short-sha>".
- "Reopened after resolved": `WHERE last_status_change_at IS NOT NULL AND status = 'open' AND resolved_in_release IS NOT NULL`.

**Patterns to follow:** existing URL-query parsing at `worker/src/app.js` for narrow admin routes.

**Test scenarios:**
- Happy path: combined filter (status='open' + route LIKE '/api/%') returns only matching rows.
- Edge case: date-range spans no rows — returns empty list with `generatedAt` still populated.
- Edge case: "new in release" with unknown release — returns empty.
- Error path: route filter with SQL-metacharacters — escaped via parameterised query; no injection.
- Integration: filters combined with sort (`last_seen DESC`) return the expected ordering.

**Verification:** filter UI exercises every combination once in an automated test; server rejects malformed input with `validation_failed`.

---

- U20. **Drawer + filter flow-gap resolutions**

**Goal:** close the specific flow gaps from the planning phase — canary-release auto-reopen, resolved-silent-recurs handling, build-hash-null, cross-phase (Phase A refresh during Phase E drawer open) interactions — as explicit behaviours with test coverage.

**Requirements:** R15, R16, R17

**Dependencies:** U17, U18, U19

**Files:**
- Modify: `worker/src/repository.js` (apply the documented rules from H-LTD auto-reopen section)
- Modify: `src/main.js` (auto-refresh suppression: if a drawer is open for row X and a narrow refresh arrives, the drawer stays open; only the row's summary data updates)
- Test: `tests/worker-error-cockpit-flow-gaps.test.js` (explicit tests for each named scenario from the Phase E flow gap analysis)

**Approach:**
- Build-hash-null policy: NULL release never triggers auto-reopen; written to `last_seen_release` as NULL; does not affect `resolved_in_release`.
- Canary/blue-green policy: P1.5 treats all releases equally — if build X+1 is a canary, a reopen triggered by it is still a reopen. Document this as "sufficient for single-release deploy pattern; revisit when canary ships".
- Phase A + drawer interaction: narrow refresh while drawer is open updates the list data but keeps the expanded drawer's row open. Dirty-ref pattern from Phase A extends to "drawer-open" as a semi-dirty state (no-op for now; drawer is read-only).

**Test scenarios:**
- Edge case: resolved-in-X → silent-in-X+1 → recurs-in-X+2 → reopen fires at X+2 (the X+1 silence does not count as a fresh resolve).
- Edge case: manual reopen vs auto-reopen — test the state sequence `open → resolved → [auto-reopen, last_status_change_at bumps] → investigating (manual) → resolved → [new release, auto-reopen again]`.
- Integration: drawer open on row R; narrow refresh lands; drawer stays open; row R's summary data refreshes.

**Verification:** each named flow gap from the Phase E analysis has at least one test; manual browser walkthrough of the drawer + refresh interaction confirms no UX regression.

---

## System-Wide Impact

- **Interaction graph:** Phase D enforcement hooks into `auth.requireSession()` — every authenticated route inherits the check. Phase A auto-refresh chain touches every admin-ops panel's state reducer. Phase B's `normaliseRateLimitSubject` touches every existing rate-limited route (auth, demo-session, TTS, public error ingest). Phase E's auto-reopen adds one UPDATE statement to `recordClientErrorEvent`'s hot path.
- **Error propagation:** new structured error codes (`account_suspended`, `account_payment_hold`, `session_invalidated`, `self_suspend_forbidden`, `account_ops_metadata_stale`, `reconcile_in_progress`) propagate from Worker through hub-api response envelope into UI dispatcher. Every new code must be rendered by Phase A's error-banner router (U1) or it becomes an invisible failure.
- **State lifecycle risks:** Phase C's `row_version` bumping + Phase D's `status_revision` bumping are independent counters on the same row (`account_ops_metadata`). Every UPDATE must bump `row_version` unconditionally; only `ops_status` changes bump `status_revision`. A buggy implementation that forgets to bump `row_version` on a `status_revision`-only change breaks CAS for the next edit.
- **API surface parity:** Parent Hub payload does NOT carry `ops_status` or `status_revision` today. Phase D's enforcement hooks at `requireSession()` apply uniformly to Parent Hub too — a `suspended` parent gets `account_suspended`; a `payment_hold` parent gets `account_payment_hold` on any mutation route. The Parent Hub UI is not updated in P1.5 (out of scope — surface-wide enforcement via a distinct follow-up).
- **Integration coverage:** Phase B `consumeRateLimit` refactor is a cross-phase hot path (TTS + auth + demo-session + ops-error-capture). Any regression cascades across the app. The U5 integration test must exercise every call site (not just the public ingest).
- **Unchanged invariants:**
  - R21/R22/R23/R24 from PR #188 (atomicity template, fresh-insert detection, body-cap order, 3-tuple dedup authority) are preserved verbatim.
  - R27 callout is REMOVED in Phase D (U15) simultaneously with the enforcement code — same PR, same commit.
  - All current mutation-receipt envelopes (`requestId`, `correlationId`, scope tuples) are unchanged. P1.5 does not add new scope types.
  - `requireSameOrigin` semantics are unchanged; Phase B only adds a new call site's coverage in smoke tests.

---

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Phase B `consumeRateLimit` refactor regresses an existing caller (TTS silently stops rate-limiting) | Med | High — under-limit exposure | Integration test per call site in U5; adversarial reviewer mandate for U4+U5; staged rollout (deploy to staging, watch `request_limits` table for bucket distribution changes before production deploy) |
| Phase D enforcement breaks a legit admin scenario (admin locks themselves out mid-edit) | Low | High — customer-visible outage | Self-suspend guard (U15); before Phase D merges, manual QA runs the full ops transition matrix in a staging account; explicit rollback SQL prepared (`ops_status` reset path) |
| Phase C `row_version` CAS breaks idempotent replay after 409 | Low | High — silent data loss | U8 test asserts receipt hash includes `expectedRowVersion`; integration test exercises 409-retry with fresh expected value |
| Reconciliation script overwrites live bumps (counter drift appears worse) | Med | Med — admin dashboard shows wrong numbers briefly | Single-flight lock (U10); document the "reconciliation writes win within the batch window" trade-off; daily cadence bounds drift window |
| Auto-reopen churn (same fingerprint reopens repeatedly) | Med | Med — noisy admin UX | 24h cooldown on `last_status_change_at` (U17); admin can manually `ignored` a known-noisy error to skip auto-reopen (ignored status never auto-reopens) |
| `withTransaction` removal exposes previously-hidden non-atomicity | Low | Med — partial-state bugs surface in tests | U12 audit doc tracks every removal; tests run after each removal; if a test fails, the site is not a no-op and should move to `batch()` or be documented as accepted-non-atomic |
| Cloudflare Cron Trigger doesn't fire (silent cron outage) | Low | Med — drift accumulates unseen | Telemetry `cron.reconcile.last_success_at` surfaced on admin dashboard (U11); manual script runs on demand |
| Windows dev CRLF / spawn hazards break tests for new scripts | Med | Low — dev-friction | Reference Windows-on-Node memory; `pathToFileURL` entrypoint guards on all new CLI scripts; CRLF-aware fixture compares |
| Build-hash `execSync('git ...')` fails in Cloudflare's build environment | Low | Low — release field NULL | Emit `null` (not a sentinel string); release is nullable everywhere; auto-reopen rule short-circuits on NULL per U17 condition 3 |
| IPv6 /64 bucket starves legit shared-NAT cohort (mobile carrier /64) | Med | Med — false positives | Tiered subject keys include `unknown:` fallback; global ceiling limits any one /64's budget impact; adversarial reviewer explicitly looks for this |
| Migration 0011 combined (three phases' columns) partial-applied | Low | High — half-fixed schema | All columns are nullable or default-zero so partial-apply is safe; `requireSession` JOIN soft-fails on `no such column` with a capacity-telemetry event; rollback strategy: leave columns; rollback code reverts to ignore-columns behaviour. |
| IPv4 → IPv6 rate-limit escape via `X-Forwarded-For` spoof when `CF-Connecting-IP` absent | Med | High — rate-limit effectively disabled | U4 strict mode: default to `CF-Connecting-IP` only; `X-Forwarded-For` fallback requires `env.TRUST_XFF = '1'` (dev/staging only). U6 smoke asserts missing-CF-header production request returns 429 after a small burst. |
| Attacker defeats R24 3-tuple dedup by rotating `first_frame` → unbounded `ops_error_events` row growth | Med | High — DB bloat, drawer unusable | U5 second rate-limit bucket on fresh-INSERTs (10/hr/subject); global public-ingest ceiling 6000/10min. Row-count telemetry banner on admin dashboard. |
| Release field PII smuggling via `/i` case-insensitive regex | Med | Med — PII leak to ops-role | U16 tightened regex `/^[a-f0-9]{6,40}$/` rejects anything non-SHA-shaped; defence-in-depth still scrubs via existing redaction functions. |
| Suspended account issues session on OAuth callback → fresh-cookie + immediate 403 UX whiplash | Low | Med — confusing UX, ghost `account_sessions` rows | U13 `createSession` pre-checks `ops_status`; suspended → 302 redirect with no cookie; capacity event on refusal. |
| Two-admin mutual-suspend deadlock (A suspends B and B suspends A simultaneously, both succeed, no admin can log in) | Low | Critical — full admin lockout | U15 cross-actor `last_admin_locked_out` guard (application-layer + conditional UPDATE). U15 confirmation dialog requires typing target account id. `docs/hardening/admin-lockout-runbook.md` covers D1-console rescue. |
| Future mutation route forgets `requireMutationCapability` → silent `payment_hold` write | Med | High — enforcement bypass | U14 coverage meta-test: `tests/worker-mutation-capability-coverage.test.js` enumerates every `POST/PUT/DELETE` in `app.js` and asserts the handler contains `requireMutationCapability` within 20 lines of `requireSession`. Documented allowlist for public endpoints. |
| Rogue or compromised admin zeros KPI counters via direct reconcile POST | Low | Med — dashboard temporarily lies; cron recovers within a day | U10 route re-computes server-side; client `computedValues` used only as diagnostic-log fodder. Every call produces a mutation receipt with before/after counts. |
| Reconciliation stale-lock blocks cron for up to 24h after Worker crash | Low | Med — drift accumulates invisibly | U10 explicit stale-detection algorithm (10-min expiry + CAS-takeover + heartbeat). U11 cron fires twice daily (`0 4` + `0 5`) so a crashed primary recovers within an hour. |
| Admin CAS-retry storm grows `mutation_receipts` unbounded | Low | Med — table growth | U8 per-session admin mutation rate limit (60/min/session). U11 retention sweep prunes receipts older than 30 days. U9 UI disables Save button while mutation is in-flight. |
| Production smoke-script credentials leak / CI-runner compromise grants full admin access | Low | High — admin compromise | U6 dedicated scoped service account with rotated credentials (30-day cadence); `npm run ops:rotate-smoke-credentials` (follow-up automation). Smoke runs under a distinct `requestId` prefix (`smoke-<iso>-<seq>`) filterable from real admin metrics. |

---

## Alternative Approaches Considered

- **Bundled single PR (A→B→C→D→E in one PR).** Rejected: merge-stash hazard on a 20-unit PR; reviewer fatigue; rollback is all-or-nothing. Chosen: 5 per-phase PRs.
- **Durable Object for session-revocation broadcast (Phase D alternative).** Rejected: only `LearnerLock` DO exists today; introducing a second DO is scope creep; one per-request JOIN read meets the consistency bar without new infra.
- **`ETag` / `If-Match` / 412 for Phase C CAS.** Rejected: breaks the invariant that receipt payload hash includes CAS pre-image (ETag lives in headers, not hashed body); would require re-plumbing the idempotency layer. `row_version` in body stays consistent with existing `expectedPreviousStatus` pattern.
- **Per-feature capability matrix for `payment_hold`.** Rejected in P1.5: the user chose "mutation-receipt path" as the block boundary for simplicity; capability tiers (premium / subject-command / account-management) become a follow-up once billing is real.
- **FTS5 search in Phase E.** Rejected for P1.5: LIKE-with-index is sufficient at 10–100k rows; FTS5 interaction with `batch()` across shadow tables is undocumented and warrants a spike before production rollout. Follow-up plan will add FTS5 once the drawer proves admins want cross-field search.
- **Reconciliation via Durable-Object-singleton.** Rejected: cron + HTTP admin route is simpler, uses the OAuth path already proven. DO would only help if reconciliation needed real-time coalescing (it doesn't — daily cadence suffices).
- **Global "last active admin" DB guard in Phase D.** Deferred: user chose self-suspend-only for the first ship. Once enforcement is proven in production the cross-actor guard ships in a follow-up (mirrors `last_admin_required` pattern for role demote).

---

## Dependencies / Prerequisites

- Migration 0011 must land and run before any Phase C / D / E code path executes. PR 3 (Phase C) includes the migration; Phases D and E read its columns via soft-fail-on-missing-column patterns from R19 precedent + the `requireSession` JOIN try/catch in U14.
- `scripts/wrangler-oauth.mjs` must be functional for deployments (existing infrastructure — no new work).
- Cloudflare account must support Cron Triggers on the Worker plan. (Already supported on the app's current plan; confirm before U11.)
- `admin_kpi_metrics` table exists with columns `metric_key TEXT PK, metric_count INTEGER, updated_at INTEGER` from P1's migration `worker/migrations/0010_admin_ops_console.sql`. U3, U10, and U11 read and write to this table; a partial P1 deploy without 0010 would block all of Phase A / C.
- Admin + smoke-service-account users must exist in the staging D1 for the production smoke test (U6); coordinate with existing ops-user seeding. Smoke service account has `platform_role = 'admin'`, `account_type = 'real'`, and a dedicated `internal_notes = 'smoke-test-account'` so it's identifiable in metrics.
- GitHub Actions secrets `KS2_SMOKE_ACCOUNT_EMAIL` and `KS2_SMOKE_ACCOUNT_PASSWORD` must be configured before PR 2 merges (needed for U6).

---

## Phased Delivery

### Phase 1 (PR 1 of 5) — Admin truthfulness

**Units:** U1, U2, U3. **Scope:** UI-only + one additive server response change for KPI split.
**Merge criterion:** green `npm run test` + manual browser walkthrough of admin hub showing all "last refreshed" + error banners + dirty-form protection + KPI split.

### Phase 2 (PR 2 of 5) — Public endpoint hardening

**Units:** U4, U5, U6. **Scope:** Worker-side refactor + new smoke script.
**Merge criterion:** green `npm run test` + adversarial reviewer sign-off on the IPv6 /64 + call-site coverage; `npm run smoke:production:admin-ops` clean against staging.

### Phase 3 (PR 3 of 5) — Data integrity

**Units:** U7, U8, U9, U10, U11, U12. **Scope:** Migration 0011 + CAS + 409 UX + reconciliation + cron + `withTransaction` audit.
**Merge criterion:** green `npm run test`, migration applied on staging, cron verified firing once, reconciliation diff reviewed and zero-delta on a clean staging DB.

### Phase 4 (PR 4 of 5) — `ops_status` enforcement

**Units:** U13, U14, U15. **Scope:** `createSession` suspended-account refusal + auth-boundary enforcement + self-suspend + last-active-admin guards + R27 callout removal + admin-lockout runbook + docs flip.
**Merge criterion:** green `npm run test`, enforcement matrix walked manually in staging, R27 string assertion replaced, `docs/operating-surfaces.md:260` updated, `docs/hardening/admin-lockout-runbook.md` reviewed by a second human, confirmation-dialog UX verified for non-active `ops_status` submit, `tests/worker-mutation-capability-coverage.test.js` green.

### Phase 5 (PR 5 of 5) — Error centre cockpit

**Units:** U16, U17, U18, U19, U20. **Scope:** Build-hash injection + auto-reopen + drawer + filters + flow-gap resolutions.
**Merge criterion:** green `npm run test`, drawer exercises all redaction permutations, auto-reopen verified under 24h-cooldown + new-release manually.

---

## Documentation Plan

- **`docs/operating-surfaces.md`** — line 260 enforcement flip (Phase D / U15); add Phase B rate-limit subject taxonomy to the surface description.
- **`docs/mutation-policy.md`** — document the `expectedRowVersion` extension on `admin.account_ops_metadata.update`; add `admin.ops.reconcile_kpis` as a new mutation kind with scope `platform`, scope_id `reconcile-kpis:<request_id>`; add the enforcement codes (`account_suspended`, `account_payment_hold`, `session_invalidated`) to the error-code registry section.
- **`worker/README.md`** — add the `normaliseRateLimitSubject` helper as a first-class primitive; note the three implementations it unifies.
- **`docs/operations/capacity.md`** — document the new `admin_kpi_metrics.cron.reconcile.*` telemetry keys.
- **`docs/hardening/withtransaction-audit.md`** — new file; produced by U12 as part of Phase 3 PR.
- **`docs/hardening/p1.5-completion-report.md`** — follow-up after all five PRs merge (mirrors `admin-page-p1-completion-report.md`).

---

## Operational / Rollout Notes

- **Per-phase rollout gating:** each phase ships with its own `npm run audit:production` pass; do not sequence two phases into the same deploy window.
- **Phase D rollout** requires a one-off migration to stamp `status_revision_at_issue = 0` on existing `account_sessions` rows (done in U13's migration addendum). All existing sessions survive deploy; they become invalidated only after an admin bumps a `status_revision`.
- **Phase E cron** starts emitting immediately on deploy; the first reconciliation run will produce a large diff (no prior reconciliation). Budget admin review of the first diff before the cron schedule runs unattended.
- **Adversarial reviewer** auto-dispatch on Phases B (public endpoint + redaction) and D (state-machine transitions + auth enforcement) per the autonomous SDLC rule — these are non-negotiable on PR open.
- **Rollback matrix:**
  - Phase A — UI-only, revert PR; no data loss.
  - Phase B — Worker refactor, revert PR; `request_limits` table stays valid.
  - Phase C — migration is additive; revert PR; new columns stay but are ignored by the old code (explicit forward-only migration policy).
  - Phase D — revert PR; `ops_status` reverts to label-only; the R27 callout must be re-added manually if the revert needs to stay long-term.
  - Phase E — revert PR; release-tracking columns stay NULL; auto-reopen stops; drawer falls back to the P1 flat list.

---

## Sources & References

- **Origin document:** [docs/plans/james/admin-page/admin-page-p2.md](../plans/james/admin-page/admin-page-p2.md) — advisory report defining the P1.5 scope and priority order (A → B → C → D → E).
- **Direct predecessor plan:** [docs/plans/2026-04-25-003-feat-admin-ops-console-extensions-plan.md](./2026-04-25-003-feat-admin-ops-console-extensions-plan.md) — admin console P1 (shipped PR #188).
- **P1 completion report:** [docs/plans/james/admin-page/admin-page-p1-completion-report.md](../plans/james/admin-page/admin-page-p1-completion-report.md) — explicit list of P1.5 deferrals; load-bearing inputs for this plan.
- **Mutation policy:** [docs/mutation-policy.md](../mutation-policy.md) — CAS vocabulary (`repo_revision`, `state_revision`), 409 conventions, mutation-receipt contract.
- **Operating surfaces:** [docs/operating-surfaces.md](../operating-surfaces.md) line 260 — current `ops_status` non-enforcement documentation (flipped in Phase D).
- **Hardening charter:** [docs/hardening/charter.md](../hardening/charter.md) — "PR-as-fix cites the baseline entry" rule.
- **Related code:**
  - `src/surfaces/hubs/AdminHubSurface.jsx` (panel layout, R27 callout at line 179)
  - `src/main.js` (lines 757–795 narrow-refresh helpers; 1225, 1539, 1609 mutation handlers)
  - `src/platform/hubs/admin-panel-patches.js` (scalar preservation pattern)
  - `src/platform/ops/error-capture.js` (client capture + redaction)
  - `worker/src/app.js` (route dispatcher, public error-event route, rate-limit call sites)
  - `worker/src/auth.js` (session boundary, rate-limit call sites)
  - `worker/src/repository.js` (`readDashboardKpis`, `readAccountOpsMetadataDirectory`, `updateAccountOpsMetadata`, `updateOpsErrorEventStatus`, `recordClientErrorEvent`)
  - `worker/src/d1.js` (the `withTransaction` no-op and `batch` atomicity primitive)
  - `worker/migrations/0010_admin_ops_console.sql` (precedent migration style)
- **External references:**
  - Cloudflare Workers docs — Cron Triggers (`developers.cloudflare.com/workers/configuration/cron-triggers/`), rate-limit binding (`/workers/runtime-apis/bindings/rate-limit/`), CF-Connecting-IP header (`/fundamentals/reference/http-request-headers/`), D1 SQL API + FTS5 support (`/d1/sql-api/sql-statements/`).
  - RFC 5952 (IPv6 canonical text), RFC 6177 (IPv6 allocation), RFC 8981 (SLAAC privacy), RFC 9110 §15.5.13 + §13.1.1 (409 vs 412 semantics), OWASP ASVS v4.0.3 §V3.3.1 (session logout / invalidation).
  - esbuild `define` option — `esbuild.github.io/api/#define`.
  - Sentry `GroupResolution` schema for release-aware resolved/reopened semantics.
