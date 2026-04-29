---
title: "feat: Admin Console P4 — Reliability, Truth Audit, and Logic Correction"
type: feat
status: active
date: 2026-04-27
origin: docs/plans/james/admin-page/admin-page-p4.md
deepened: 2026-04-27
---

# Admin Console P4 — Reliability, Truth Audit, and Logic Correction

## Overview

P4 is a hardening phase. After P3 shipped 13 units of new Admin surface (Debug Bundle, denial logging, account search, occurrence timeline, marketing backend, active-message delivery), the priority shifts from breadth to truthfulness. Source review against current `main` revealed three classes of defects: (1) UI labels/filters that do not match backend data, (2) an identifier semantic overload in Debug Bundle, and (3) a full Marketing backend that the client never wires. P4 fixes these, adds the missing P3 smoke coverage, wires Marketing into the UI, and refactors the largest sections under characterisation-test discipline.

**No regression** is the primary constraint. Every unit must prove it preserves existing behaviour before changing it.

---

## Problem Frame

An operator opening Admin today encounters misleading state: the denial filter dropdown offers reason codes that match zero real records; Debug Bundle treats the same input as both a fingerprint and an event ID depending on which sub-query runs; Marketing says "Coming soon" while docs say "shipped"; the admin smoke script covers none of the P3 panels; and the `confirmBroadPublish` gate has a known bypass path via `scheduled → published`. These are correctness issues, not polish.

(see origin: `docs/plans/james/admin-page/admin-page-p4.md`, sections 2.2–2.6)

---

## Requirements Trace

- R1. Every Admin section communicates its true state (PR-1)
- R2. Debug Bundle uses correct, unambiguous identifier semantics (PR-2, ER-3)
- R3. Denial reason taxonomy is complete and consistent across logger, API, UI, filter, and copied bundle (PR-4, ER-4)
- R4. Marketing section is wired to the existing backend or explicitly downgraded (PR-6)
- R5. `confirmBroadPublish` gate covers `scheduled` transition for broad-audience messages (PR-6, Priority B)
- R6. Idempotent replay response shape matches first-call shape (Priority B)
- R7. Admin smoke coverage extends to Debug Bundle, denials, account search, content, and marketing (PR-7, ER-7)
- R8. Panel freshness and failure visibility in debugging/account workflows (PR-9) — **deferred to P5** (see Deferred section); individual panels already have per-section error boundaries
- R9. Characterisation tests precede all refactors (ER-5, Priority E)
- R10. No new raw HTML/CSS/JS authoring surfaces; redacted copy by default (PR-10, Priority F) — **R10a (no raw HTML/CSS/JS) enforced in U6**; **R10b (redaction framework) deferred to P5** (see Deferred section)
- R11. Source, UI, docs, and completion report agree on shipped state (Priority A)

---

## Scope Boundaries

- No complex role/authority system beyond the existing `parent`/`admin`/`ops` model
- No billing/subscription automation
- No full live-ops event engine (reward multipliers, XP boosts, Hero Coins, streak pressure, content unlock campaigns)
- No child-facing Hero Mode surfaces or Hero economy/reward mechanics
- No subject-engine rewrites
- No raw HTML/CSS/JS authoring from Admin
- No redesign of learning/reward semantics for any subject
- No new panels or dashboards beyond what the P4 contract names

### Deferred to Follow-Up Work

- Complex audience targeting (per-child, per-cohort) — future Marketing iteration
- Full-text search infrastructure (SQL LIKE sufficient at current scale)
- Production Arithmetic/Reasoning/Reading content providers — placeholder only
- Hero Mode operational visibility slot — reserved, not implemented
- Operational evidence panel (PR-7 display portion: capacity posture, CSP/HSTS, smoke status) — separate P5 or ops-dashboard scope; smoke harmonisation portion of PR-7 is included in U7
- Panel freshness/failure framework (R8 / PR-9) — the origin contract's PR-9 describes a general freshness/failure framework (last-refreshed timestamps, refresh-in-progress state, manual retry, partial failure). P4 does not introduce this as a cross-cutting framework. Individual panels already have per-section error boundaries (`safeSection` in Debug Bundle, panel-level error states). A systematic `AdminPanelFrame` extraction is deferred to P5 when the pattern is proven across 3+ panels
- Safe-copy redaction framework (R10 / PR-10) — the origin contract's PR-10 describes a general redacted-copy system (Debug Bundle JSON, account summary, fingerprint/event ID, marketing preview). P4 preserves the existing Debug Bundle copy behaviour and does not introduce new copy surfaces. A dedicated redaction helper extraction (`safeCopyDebugBundle`, shareable vs internal-only output) is deferred to P5

---

## Context & Research

### Relevant Code and Patterns

- **Admin shell**: `src/surfaces/hubs/AdminHubSurface.jsx` (179-line thin shell with dirty-row guard)
- **Section tabs**: `src/surfaces/hubs/AdminSectionTabs.jsx` (tab definitions, `comingSoon` flag)
- **5 section components**: `AdminOverviewSection`, `AdminAccountsSection`, `AdminDebuggingSection`, `AdminContentSection`, `AdminMarketingSection`
- **Admin read model**: `src/platform/hubs/admin-read-model.js` — `buildAdminHubReadModel()` normaliser
- **Standalone Worker modules**: `worker/src/admin-debug-bundle.js`, `worker/src/admin-denial-logger.js`, `worker/src/admin-marketing.js` — self-contained, import only leaf utilities
- **Admin hub route**: `worker/src/app.js` — imperative URL matching, same-origin mutations
- **Active messages**: `src/platform/ops/active-messages.js` — `ActiveMessagesBar` rendered at `App.jsx` top level, 5-min polling, fail-open
- **Admin smoke**: `scripts/admin-ops-production-smoke.mjs` — covers hub + 4 narrow refreshes + ops-metadata mutation + error ingest; does NOT cover Debug Bundle, denials, account search, content, or marketing
- **Hash routing**: `src/platform/hubs/admin-hash.js`, `src/platform/hubs/admin-return-stash.js`
- **Denial logger**: `worker/src/admin-denial-logger.js` — `ALLOWED_DENIAL_REASONS` Set with 5 codes, `ctx.waitUntil` fire-and-forget, 10% sampling
- **Error codes**: `worker/src/error-codes.js` — canonical denial reason constants

### Institutional Learnings

- **Characterisation-first always** (P2 section extraction, P3 stability): lock current behaviour as fixtures before refactoring. P2's 14 characterisation tests caught 13 failures. (`docs/solutions/architecture-patterns/admin-console-section-extraction-pattern-2026-04-27.md`)
- **Standalone Worker modules**: Do not re-couple to `repository.js`. Import only from leaf utilities. (`docs/solutions/architecture-patterns/admin-console-p3-command-centre-architecture-2026-04-27.md`)
- **Per-section `safeSection` error boundary**: Debug Bundle wraps each sub-query; failed section returns `null`, not 500. Extend, don't break. (same source)
- **CAS guard audit on every mutation**: P3 found the same CAS-omission bug at 2 sites. Treat as BLOCKER severity. (same source)
- **`batch(db, [...])` for all multi-statement writes**: `withTransaction` is a production no-op on D1. (memory: `project_d1_atomicity_batch_vs_withtransaction.md`)
- **Vacuous-truth guard**: `[].every(() => false)` returns `true`. Assert `length > 0` before `.every()`. (`docs/solutions/best-practices/p3-stability-capacity-multi-learner-patterns-2026-04-27.md`)
- **Adversarial review for auth/denial/marketing**: Pattern-match review missed 4 highest-severity blockers. Construct failure scenarios first. (`docs/solutions/workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md`)

---

## Key Technical Decisions

- **Marketing: wire the existing backend, do not rebuild**: The backend is production-ready (790 lines, CAS, XSS validation, 46 tests). The client placeholder needs replacement with a real panel, not a backend rewrite.
- **Denial filter: align UI to Worker codes**: The 5 canonical codes in `ALLOWED_DENIAL_REASONS` are the source of truth. The UI dropdown must use these exact values. All 5 option values need correction: `suspended_account` → `account_suspended`, `rate_limited` → `rate_limit_exceeded`, `invalid_session` → `session_invalidated`, plus replace phantom codes `forbidden` and `demo_expired` with the two missing codes `payment_hold` and `csrf_rejection`. Import the `DENIAL_*` prefixed constants from `error-codes.js`, not the `ACCOUNT_*` prefixed auth-layer constants (critically, `DENIAL_PAYMENT_HOLD` is `'payment_hold'` while `ACCOUNT_PAYMENT_HOLD` is `'account_payment_hold'` — different strings).
- **Debug Bundle identifier: two separate fields**: Replace single `errorFingerprint` with explicit `errorFingerprint` (matches `ops_error_events.fingerprint`) and `errorEventId` (matches `ops_error_events.id`). Occurrence queries use `event_id` FK which references `ops_error_events.id`, so the occurrence sub-query must filter by event IDs resolved from fingerprint, not by fingerprint directly.
- **Characterisation tests via existing Node test runner**: No new test framework. Pin current behaviour with `node --test` before each refactor unit.
- **No operational evidence panel in P4**: The contract's PR-7 operational evidence display (capacity posture, CSP/HSTS, smoke status) is deferred. P4 delivers the smoke harmonisation portion of PR-7 (U7) but not the panel. P4 focuses on truth and correctness for existing panels, not new dashboard surface.
- **Marketing data: lazy-load on tab activation, not bundled in hub**: The `readAdminHub` Worker response does not include marketing data today. Rather than bloating the initial hub payload, the Marketing section will lazy-load via the existing `GET /api/admin/marketing/messages` endpoint when the operator navigates to the Marketing tab. This follows the standalone-module pattern (marketing routes already exist as independent endpoints).

---

## Open Questions

### Resolved During Planning

- **Q1 (P4 §12.1): Was Marketing UI intentionally left as placeholder?** Yes. `AdminMarketingSection.jsx` is 18 lines of static "Coming soon" text, receives zero props, has the comment "no live panels yet." The backend shipped in P3 U11 (#401) but the UI was never connected. The tab has `comingSoon: true` in `AdminSectionTabs.jsx`.
- **Q2 (P4 §12.2): Active-messages endpoint auth?** Authenticated-only. `GET /api/ops/active-messages` lives inside the `createSessionAuthBoundary` in `app.js`. Any authenticated user can call it. Not public/unauthenticated.
- **Q3 (P4 §12.3): Does an active-message renderer exist?** Yes. `src/platform/ops/active-messages.js` has `ActiveMessagesBar`, `ActiveMessageStack`, `ActiveMessageBanner`, `useActiveMessages` hook (5-min polling, fail-open). Rendered at `App.jsx` top level. Fully wired end-to-end.
- **Q4 (P4 §12.4): Debug Bundle occurrence input — fingerprint, event id, or both?** Currently single `errorFingerprint` field used for both (the bug). Resolution: split into two fields. Fingerprint matches `ops_error_events.fingerprint`; event ID matches `ops_error_events.id`. Occurrence sub-query resolves matching event IDs from fingerprint first, then filters `ops_error_event_occurrences.event_id IN (...)`.
- **Q5 (P4 §12.5): Canonical denial codes?** 5 codes: `account_suspended`, `payment_hold`, `session_invalidated`, `csrf_rejection`, `rate_limit_exceeded` (from `error-codes.js` + `ALLOWED_DENIAL_REASONS` Set).
- **Q6 (P4 §12.6): Scheduled Marketing auto-activation?** No auto-publisher exists. `operating-surfaces.md` explicitly states "no scheduled auto-publish for marketing messages (requires Cron Trigger or Durable Object timer)". Transitions are manual operator actions only. The `confirmBroadPublish` gap on `scheduled` is advisory — not exploitable today — but should be fixed as defence-in-depth.
- **Q7 (P4 §12.8): Admin deep-link paths?** Hash-only: `/admin#section=debug`. SPA fallback via `wrangler.jsonc` `"not_found_handling": "single-page-application"`. No real path aliases needed.
- **Q10 (P4 §12.10): Which section to refactor first?** `AdminDebuggingSection.jsx` — it is the largest section (949 lines, 4 sub-panels), contains the denial filter bug, the Debug Bundle form, the learner support panel, and the error timeline. Highest change frequency and bug risk.

### Deferred to Implementation

- **Q9 (P4 §12.9): Capacity/CSP status display**: Deferred to follow-up scope. Not addressed in P4.
- **Exact Marketing panel prop contract**: The specific fields forwarded from `AdminHubSurface` to the new Marketing panel depend on how `readAdminHub` currently shapes marketing data, which the implementer should verify at the point of wiring.
- **Admin smoke timing thresholds**: The specific timeout values and assertion thresholds for new smoke steps depend on observed production latency during implementation.

---

## Implementation Units

- U1. **Characterisation tests for Debugging section**

**Goal:** Pin the current externally visible behaviour of `AdminDebuggingSection` — all four sub-panels (error log centre, learner support, denial log, Debug Bundle) plus occurrence timeline and error details drawer — as test fixtures before any P4 modifications. The file is 949 lines with 4 distinct panel components, not 423.

**Requirements:** R9

**Dependencies:** None

**Files:**
- Create: `tests/admin-debugging-section-characterisation.test.js`
- Read: `src/surfaces/hubs/AdminDebuggingSection.jsx`
- Read: `worker/src/admin-debug-bundle.js`
- Read: `worker/src/admin-denial-logger.js`

**Approach:**
- SSR-render `AdminDebuggingSection` with representative model data (errors, denials, occurrences, debug bundle result)
- Pin rendered HTML structure, filter options, form field names, table columns, and section labels
- Pin Debug Bundle Worker response shape for each `safeSection` (success and null-failure cases)
- Pin denial log query parameters and response shape
- Follow P2 characterisation pattern: 1 test file, multiple sub-tests, snapshot-style assertions on text content

**Execution note:** Characterisation-first. These tests exist to catch regressions during U2–U5. They will be updated as each unit changes behaviour.

**Patterns to follow:**
- P2 characterisation tests from `tests/` directory (14 SSR characterisation tests that caught 13 failures)

**Test scenarios:**
- Happy path: error log panel renders with 3 mock error events showing fingerprint, route, occurrence count, status
- Happy path: denial log panel renders with 2 mock denials showing reason, route, timestamp
- Happy path: Debug Bundle form renders all input fields (account email, learner ID, route, time range, error fingerprint)
- Happy path: Debug Bundle form pre-fills fingerprint, accountId, and route from `model.debugBundle.prefill` when present
- Happy path: learner support panel renders with mock learner diagnostics data
- Happy path: occurrence timeline renders with mock occurrences showing occurred_at, route, release, event_id
- Happy path: denial filter dropdown has exactly 5 entries with current (pre-fix) values: `suspended_account`, `rate_limited`, `forbidden`, `invalid_session`, `demo_expired`
- Edge case: empty model data renders graceful empty states, not crashes
- Edge case: null/undefined model subsections render without error (per-section error boundary pattern)

**Verification:**
- All characterisation tests pass against current `main` with zero modifications to production code

---

- U2. **Fix denial reason filter mismatch**

**Goal:** Align the denial log UI filter dropdown to the 5 canonical Worker denial reason codes so that filter selections actually match real denial records.

**Requirements:** R3

**Dependencies:** U1

**Files:**
- Modify: `src/surfaces/hubs/AdminDebuggingSection.jsx` (lines 495-501: `DENIAL_REASON_OPTIONS`)
- Test: `tests/admin-debugging-section-characterisation.test.js` (update characterisation)
- Test: `tests/worker-admin-denial-filter.test.js` (new: round-trip filter test)

**Approach:**
- Replace all 5 values in `DENIAL_REASON_OPTIONS` with the canonical codes. All 5 current values are wrong:
  - `suspended_account` → `account_suspended`
  - `rate_limited` → `rate_limit_exceeded`
  - `invalid_session` → `session_invalidated`
  - `forbidden` → `csrf_rejection` (phantom code replaced with real code)
  - `demo_expired` → `payment_hold` (phantom code replaced with real code)
- Import the `DENIAL_*` prefixed constants from `error-codes.js` (`DENIAL_ACCOUNT_SUSPENDED`, `DENIAL_PAYMENT_HOLD`, `DENIAL_SESSION_INVALIDATED`, `DENIAL_CSRF_REJECTION`, `DENIAL_RATE_LIMIT_EXCEEDED`). Do NOT import the `ACCOUNT_*` prefixed auth-layer constants — critically, `ACCOUNT_PAYMENT_HOLD` is `'account_payment_hold'` while `DENIAL_PAYMENT_HOLD` is `'payment_hold'` (different strings)
- Update display labels to be operator-friendly (e.g., `account_suspended` → "Account Suspended", `csrf_rejection` → "CSRF / Same-Origin")
- Verify the denial log API query parameter (`?reason=`) is passed through to the Worker and honoured in the SQL WHERE clause

**Patterns to follow:**
- Existing filter pattern in `AdminDebuggingSection.jsx` for error status/kind filters
- `ALLOWED_DENIAL_REASONS` Set in `worker/src/admin-denial-logger.js` as the canonical source

**Test scenarios:**
- Happy path: each of the 5 filter values returns matching denial records when records exist
- Happy path: "All" / no-filter returns records across all reason codes
- Edge case: filter value not in canonical set returns empty results (not an error)
- Error path: worker returns 400 for unknown reason filter value — verify UI does not offer unknown values
- Integration: create denial records with each reason code via test helper, then filter by each code and verify exact matches

**Verification:**
- Denial filter dropdown shows exactly 5 options matching the canonical Worker codes
- Selecting any filter option returns only records with that reason code
- Characterisation tests updated to reflect new filter values
- No silent filter loss (ER-4)

---

- U3. **Fix Debug Bundle identifier semantics**

**Goal:** Split the overloaded `errorFingerprint` field into two unambiguous fields (`errorFingerprint` and `errorEventId`) so that operators can search by either fingerprint or event ID, and occurrence queries return correct results.

**Requirements:** R2

**Dependencies:** U1

**Files:**
- Modify: `worker/src/admin-debug-bundle.js` (lines 174-176 for error events, lines 211-213 for occurrences)
- Modify: `src/surfaces/hubs/AdminDebuggingSection.jsx` (Debug Bundle form: replace single field with two)
- Test: `tests/admin-debugging-section-characterisation.test.js` (update characterisation)
- Test: `tests/worker-admin-debug-bundle.test.js` (existing tests: add identifier correctness cases)

**Approach:**
- **Worker**: Accept both `errorFingerprint` (string) and `errorEventId` (string/number) as separate query parameters
  - Section 3 (recent errors): filter by `fingerprint = ?` when `errorFingerprint` is provided; filter by `id = ?` when `errorEventId` is provided; support both simultaneously with AND
  - Section 4 (occurrences): the resolution sub-query runs **inside** the `safeSection('errorOccurrences', ...)` callback to preserve the overall `Promise.all` parallel structure. When `errorFingerprint` is provided, first resolve matching event IDs via `SELECT id FROM ops_error_events WHERE fingerprint = ?` (unbounded — the outer occurrence query applies its own LIMIT). **Empty-match guard**: if the resolution returns zero event IDs, return an empty array immediately — do NOT construct `WHERE event_id IN ()` which is a SQLite syntax error. When `errorEventId` is provided, filter directly by `event_id = ?`
- **Client**: Replace single "Error fingerprint" input with two fields: "Error Fingerprint" (placeholder: `fp-xxxx`) and "Error Event ID" (placeholder: numeric ID)
- Both fields are optional; either or both may be provided

**Patterns to follow:**
- Existing `safeSection` wrapper pattern in `admin-debug-bundle.js`
- ER-3 identifier clarity: `errorEventId` vs `fingerprint` — never overload

**Test scenarios:**
- Happy path: search by fingerprint returns matching error events and their occurrences
- Happy path: search by event ID returns the specific event and its occurrences
- Happy path: search by both returns the intersection
- Happy path: search with neither fingerprint nor event ID returns events/occurrences matching only the time window and other active filters (route, account)
- Edge case: fingerprint matches multiple events — occurrences for all matched events are returned
- Edge case: fingerprint matches zero events — occurrence section returns empty array (not SQL error from empty `IN ()` clause)
- Edge case: event ID that does not exist returns empty occurrences section (not error)
- Error path: `safeSection` catches DB failure gracefully for each sub-query independently

**Verification:**
- Debug Bundle form shows two separate identifier fields
- Occurrence results match the operator's search intent (fingerprint resolves through event IDs correctly)
- Existing Debug Bundle tests pass with updated field names
- Per-section error boundary preserved

---

- U4. **Fix Marketing `confirmBroadPublish` on `scheduled` transition**

**Goal:** Extend the broad-publish confirmation gate to cover `draft → scheduled` for `all_signed_in` audience, closing the advisory gap ADV-U11-005.

**Requirements:** R5

**Dependencies:** None

**Files:**
- Modify: `worker/src/admin-marketing.js` (line 639: extend condition to include `scheduled` action)
- Test: `tests/worker-admin-marketing-mutations.test.js` (add scheduled-transition confirmation tests)

**Approach:**
- Change the `confirmBroadPublish` gate condition from `action === 'published'` to `(action === 'published' || action === 'scheduled')` at `admin-marketing.js:639`
- By the same defence-in-depth logic, extend `requireMaintenanceEndsAt` (line 647-649) from `action === 'published'` to also fire when `action === 'scheduled'` — a maintenance message with `all_signed_in` audience and no `ends_at` should be caught at scheduling time, not only at publish time
- No auto-publisher exists today, but both gates should be defence-in-depth: scheduling a broad-audience message is the commitment point even if a future auto-publisher is added later

**Patterns to follow:**
- Existing `confirmBroadPublish` gate pattern at `admin-marketing.js:639-643`
- P3 adversarial review convention: construct failure scenarios first

**Test scenarios:**
- Happy path: `draft → scheduled` with `audience: 'all_signed_in'` and `confirmBroadPublish: true` succeeds
- Error path: `draft → scheduled` with `audience: 'all_signed_in'` without `confirmBroadPublish` returns `marketing_broad_publish_unconfirmed`
- Happy path: `draft → scheduled` with `audience: 'internal'` succeeds without `confirmBroadPublish` (gate only applies to broad audiences)
- Happy path: existing `draft → published` gate still works as before (no regression)
- Error path: `paused → published` with `audience: 'all_signed_in'` without `confirmBroadPublish` returns `marketing_broad_publish_unconfirmed` (pins existing correct behaviour against accidental regression during condition restructure)
- Happy path: `paused → published` with `audience: 'all_signed_in'` and `confirmBroadPublish: true` succeeds
- Error path: `draft → scheduled` for maintenance + `all_signed_in` without `ends_at` returns `marketing_maintenance_requires_ends_at` (requireMaintenanceEndsAt extended to scheduled)
- Happy path: `draft → scheduled` for maintenance + `all_signed_in` with valid future `ends_at` succeeds

**Verification:**
- All existing marketing mutation tests pass (no regression)
- New tests prove the `confirmBroadPublish` gate on `scheduled` transition
- New tests prove the `requireMaintenanceEndsAt` gate on `scheduled` transition
- Existing `paused → published` gate behaviour pinned by explicit tests
- Both gates now cover all paths to broad-audience visibility

---

- U5. **Fix idempotent replay response-shape parity**

**Goal:** Make idempotent replay of Marketing transitions return the same shape as the first-call response, including the full `message` field. Closes advisory ADV-U11-007.

**Requirements:** R6

**Dependencies:** None

**Files:**
- Modify: `worker/src/admin-marketing.js` (lines 593-607: replay path)
- Test: `tests/worker-admin-marketing-mutations.test.js` (add replay shape parity test)

**Approach:**
- The first-call response (line 714-718) returns `{ messageId, previousStatus, newStatus, message: adminMessageFields(updated), mutation: { requestId, correlationId, replayed: false } }`
- The replay path (line 607) returns `{ ...stored, mutation: { requestId, correlationId, replayed: true } }` where `stored` is the original `response` object that only contains `{ messageId, previousStatus, newStatus }`
- Fix: after resolving the existing receipt, re-read the current message state from DB using `stored.messageId` and include it: `{ ...stored, message: adminMessageFields(currentRow), mutation: { ..., replayed: true } }`
- **Null guard**: if the re-read returns null (theoretically impossible — the schema has no delete state, only `archived` — but defensive), fall back to `message: null` so the response shape is still consistent
- The replayed `message` reflects current DB state, which may differ from the original transition time (other mutations may have occurred). This is intentional — consumers should treat the `message` field as best-effort-current when `replayed: true`

**Patterns to follow:**
- Existing `first(db, 'SELECT * FROM admin_marketing_messages WHERE id = ?', ...)` pattern for re-reading
- `adminMessageFields()` for consistent field mapping

**Test scenarios:**
- Happy path: first transition call returns `message` field with full message details
- Happy path: replay of same `requestId` returns `message` field with current message state and `replayed: true`
- Happy path: `Object.keys(firstCallResponse).sort()` deep-equals `Object.keys(replayResponse).sort()` — strict key-by-key shape parity (minus `replayed` flag value)
- Happy path: both first-call and replay `message` fields have the same set of keys
- Edge case: replayed transition where message was subsequently modified returns current state, not stale cached state

**Verification:**
- All existing marketing mutation tests pass (no regression)
- New test proves shape parity between first-call and replay
- Client code that consumes transition responses can treat first-call and replay identically

---

- U6. **Wire Marketing section to existing backend**

**Goal:** Replace the Marketing placeholder component with a real panel that surfaces the existing backend's lifecycle state machine, enabling operators to manage announcements and maintenance banners from Admin.

**Requirements:** R4, R1

**Dependencies:** U4, U5

**Files:**
- Modify: `src/surfaces/hubs/AdminMarketingSection.jsx` (replace placeholder with real panel)
- Modify: `src/surfaces/hubs/AdminSectionTabs.jsx` (remove `comingSoon: true` from marketing tab)
- Modify: `src/surfaces/hubs/AdminHubSurface.jsx` (forward marketing actions to section; pass `accessContext` for role gating)
- Create: `src/platform/hubs/admin-marketing-api.js` (new: API client wrappers for all 5 marketing routes)
- Modify: `src/platform/hubs/admin-read-model.js` (add marketing message normaliser)
- Test: `tests/admin-marketing-section.test.js` (new: UI characterisation + interaction tests)

**Approach:**
- **Marketing data: lazy-load on tab activation.** The `readAdminHub` Worker response does not include marketing data, and adding it would bloat every hub load. Instead, the Marketing section fetches via the existing `GET /api/admin/marketing/messages` endpoint when the operator navigates to the Marketing tab. This follows the standalone-module pattern
- **Client API integration layer**: Create `admin-marketing-api.js` with fetch wrappers for all 5 routes (list, create, get, update fields, transition lifecycle). Each wrapper uses same-origin headers + auth session cookie, matching the existing `fetchActiveMessages()` pattern in `src/platform/hubs/api.js`
- **State management**: The Marketing section manages its own local state (message list, loading, error, selected message, form state, CAS `expectedRowVersion`). No new store/dispatcher actions — the section is self-contained like `AdminContentSection`
- **Read model normaliser**: Add `normaliseMarketingMessage()` to `admin-read-model.js` for consistent field mapping from the Worker response to the UI model
- The new panel should show: message list with status badges, create/edit form with XSS-safe `body_text` input, lifecycle transition buttons with CAS `expectedRowVersion`, broad-publish confirmation dialog for `all_signed_in` audience on `published` and `scheduled` transitions
- Marketing mutations are admin-only (not ops) — respect the existing role model. Ops sees read-only list
- Use restricted Markdown preview matching the client-side `ActiveMessageBanner` renderer
- Do NOT use `dangerouslySetInnerHTML` — the client renderer uses React text nodes with safe inline formatting

**Patterns to follow:**
- `AdminAccountsSection.jsx` for list + detail pattern with search/filter
- `admin-marketing.js` state machine: `draft → scheduled → published → paused → archived` plus reverse transitions
- CAS pattern: `expectedRowVersion` on every mutation, post-batch guard
- Body text XSS validation: server-side primary gate, client preview as defence-in-depth

**Test scenarios:**
- Happy path: message list renders with status badges for each lifecycle state
- Happy path: create message form validates title (max 200), body_text (max 4000), message_type, audience, severity
- Happy path: lifecycle transition buttons show allowed transitions for current state
- Happy path: broad-publish confirmation dialog appears for `all_signed_in` audience on `published` and `scheduled` transitions
- Edge case: CAS conflict shows clear "message was updated by another session" error, not silent failure
- Edge case: XSS-rejected body_text shows validation error with rejected characters
- Error path: ops role user sees read-only view, mutation buttons hidden
- Integration: end-to-end: create draft → schedule → publish → pause → archive lifecycle in test

**Verification:**
- Marketing tab no longer shows "Soon" chip
- Marketing section renders real data from the backend
- All 5 lifecycle transitions work through the UI
- Broad-publish confirmation covers both `published` and `scheduled` targets
- No `dangerouslySetInnerHTML` in the Marketing panel code

---

- U7. **Extend admin smoke to cover P3 panels**

**Goal:** Add smoke coverage for Debug Bundle, denial log, account search, content overview, and marketing endpoints to the existing admin production smoke script.

**Requirements:** R7

**Dependencies:** U2, U3, U6

**Files:**
- Modify: `scripts/admin-ops-production-smoke.mjs`
- Read: `docs/hardening/admin-ops-smoke-setup.md` (verify smoke account has necessary permissions)

**Approach:**
- Add new smoke steps after the existing 6-step sequence:
  1. Debug Bundle generation: `POST /api/admin/debug-bundle` with smoke account ID and a recent time window — verify 200 response with expected section keys
  2. Denial log read: `GET /api/admin/denials?limit=5` — verify 200 and array response shape
  3. Account search: `GET /api/admin/accounts/search?q=<smoke-email>&limit=5` — verify the smoke account appears
  4. Account detail: `GET /api/admin/accounts/<smoke-id>/detail` — verify 200 and expected section keys
  5. Content overview: verify hub read model includes content section data
  6. Marketing messages list: `GET /api/admin/marketing/messages` — verify 200 and array response
  7. Marketing write-path round-trip: create a draft with `audience: 'internal'` (no broad-publish gate), verify 201, then transition to `archived`, verify 200. This exercises the CAS round-trip, XSS validation, and lifecycle state machine in production without leaving visible state (`internal` audience is never delivered to users, `archived` is terminal)
- Each new step follows the existing pattern: try/catch, correlation ID, exit code escalation
- Preserve existing exit code semantics (0/1/2/3)
- Add `--help` documentation for new steps

**Patterns to follow:**
- Existing smoke step pattern in `admin-ops-production-smoke.mjs` (fetch + assert + escalate)
- Exit code 1 for non-2xx, exit code 3 for state drift

**Test scenarios:**
- Happy path: all new smoke steps return 200 with expected response shapes
- Error path: individual step failure escalates exit code to 1 but does not abort remaining steps
- Edge case: smoke account has no denial records — empty array is success, not failure
- Edge case: smoke account has no marketing messages — empty array is success

**Verification:**
- `npm run smoke:production:admin-ops -- --help` documents all steps including new ones
- Running the full smoke against a deployed environment exercises Debug Bundle, denials, account search, content, and marketing

---

- U8. **Refactor AdminDebuggingSection into focused sub-panels**

**Goal:** Split the 949-line `AdminDebuggingSection.jsx` into focused sub-panel components along product boundaries, reducing module pressure and improving maintainability. The file contains 4 distinct panel components: `ErrorLogCentrePanel` (line 154), `LearnerSupportPanel` (line 399), `DenialLogPanel` (line 503), and `DebugBundlePanel` (line 802), plus private helpers (`OccurrenceTimeline`, `ErrorEventDetailsDrawer`, `DebugBundleSectionTable`, `DebugBundleResult`).

**Requirements:** R9 (characterisation-first), Priority E

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `src/surfaces/hubs/AdminDebuggingSection.jsx` (thin shell after extraction)
- Create: `src/surfaces/hubs/AdminErrorTimelinePanel.jsx` (includes `ErrorLogCentrePanel` + `OccurrenceTimeline` + `ErrorEventDetailsDrawer`)
- Create: `src/surfaces/hubs/AdminLearnerSupportPanel.jsx` (includes `LearnerSupportPanel`)
- Create: `src/surfaces/hubs/AdminRequestDenialsPanel.jsx` (includes `DenialLogPanel`)
- Create: `src/surfaces/hubs/AdminDebugBundlePanel.jsx` (includes `DebugBundlePanel` + `DebugBundleSectionTable` + `DebugBundleResult`)
- Test: `tests/admin-debugging-section-characterisation.test.js` (update for refactored structure)

**Execution note:** Characterisation-first. U1's tests must pass before and after extraction. No behaviour changes in this unit — pure structural refactor.

**Approach:**
- Extract 4 product-boundary panels, each self-contained with its own private helper components:
  - `AdminErrorTimelinePanel`: `ErrorLogCentrePanel` + `OccurrenceTimeline` + `ErrorEventDetailsDrawer`
  - `AdminLearnerSupportPanel`: `LearnerSupportPanel` (needs `appState`, `accessContext` — different prop requirements from other panels)
  - `AdminRequestDenialsPanel`: `DenialLogPanel`
  - `AdminDebugBundlePanel`: `DebugBundlePanel` + `DebugBundleSectionTable` + `DebugBundleResult`
- `AdminDebuggingSection` becomes a thin shell that composes the 4 panels, similar to how `AdminHubSurface` composes sections
- Each panel receives only the model/actions slices it needs (no prop drilling of the full model)
- Each extracted panel file carries its own private helper components — no cross-imports between new panel files
- Preserve existing internal state management (filter state, expanded rows, etc.) within each panel
- Do NOT create a generic `AdminPanelFrame` yet — only extract when the pattern is clear across 3+ panels

**Patterns to follow:**
- P2 section extraction: `AdminHubSurface.jsx` thin shell pattern (`docs/solutions/architecture-patterns/admin-console-section-extraction-pattern-2026-04-27.md`)
- Section prop contract: `{ model, appState, hubState, accessContext, accountDirectory, actions }`

**Test scenarios:**
- Happy path: all existing characterisation assertions pass with zero changes to assertion content (structure-only refactor)
- Happy path: each of the 4 extracted panels renders independently with its model slice
- Happy path: `LearnerSupportPanel` renders with mock learner diagnostics (different prop contract from other 3 panels)
- Edge case: null model subsection renders graceful empty state in each panel
- Integration: full DebuggingSection renders all 4 panels composed together

**Verification:**
- All characterisation tests pass with updated import paths
- `AdminDebuggingSection.jsx` is under 150 lines (thin shell composing 4 panels)
- No behaviour change — output is identical to pre-refactor state
- No cross-imports between extracted panel files
- No new external dependencies introduced

---

- U9. **Documentation truth audit and P4 completion report**

**Goal:** Reconcile Admin docs, operating surfaces, and completion reports with current source truth. Produce the P4 completion report.

**Requirements:** R11

**Dependencies:** U2, U3, U4, U5, U6, U7, U8

**Files:**
- Modify: `docs/operating-surfaces.md` (update Marketing state, active-message auth, denial codes)
- Modify: `docs/plans/james/admin-page/admin-page-p3-completion-report.md` (annotate deferred items as resolved by P4)
- Create: `docs/plans/james/admin-page/admin-page-p4-completion-report.md`
- Modify: `worker/README.md` (if route documentation needs updating)

**Approach:**
- Review every Admin-related claim in `operating-surfaces.md` against current source
- Marketing: update from "coming soon" / "backend-only" to "live" (after U6)
- Active messages: confirm documented as "authenticated-only" (not public)
- Denial codes: document the 5 canonical codes and their display labels
- Debug Bundle: document the two-field identifier contract
- P3 completion report: annotate each deferred item with P4 resolution status
- P4 completion report: list every shipped unit with PR reference, every deferred item plainly, every P3 residual resolved

**Test expectation:** none — documentation-only unit

**Verification:**
- No section of `operating-surfaces.md` contradicts current source
- P4 completion report lists every unit with honest shipped/deferred status
- P3 deferred items are either resolved or explicitly carried forward

---

## System-Wide Impact

- **Interaction graph:** Debug Bundle endpoint accepts new query parameters (U3); Marketing panel calls existing routes that were previously unreachable from UI (U6); denial filter correction changes which records are returned to the UI (U2)
- **Error propagation:** No change — per-section `safeSection` boundary in Debug Bundle preserved; panel-level error states preserved
- **State lifecycle risks:** Marketing transition gate change (U4) adds a new rejection path for `scheduled` with broad audience — operators who previously scheduled without confirmation will need to provide it. Low risk since no auto-publisher exists
- **API surface parity:** Debug Bundle gains a new optional parameter (`errorEventId`); old `errorFingerprint` parameter continues to work as before for error events. Backward compatible
- **Integration coverage:** U6 (Marketing wiring) creates the first end-to-end path from Admin UI → Marketing API → D1 → active-message delivery → client banner. This path was previously testable only via API
- **Unchanged invariants:** All 11 P1-P3 invariants preserved: R24 dedup, CAS row_version, auto-reopen, ops_status enforcement, session invalidation, additive hub, content-free leaf, mutation receipt, rate-limit-before-body, dirty-row guard, counter-based hashchange guard. Active-message delivery path (`App.jsx` → `ActiveMessagesBar`) is not modified

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Marketing wiring (U6) is the largest unit — requires API client, normaliser, state management, and panel UI | Dependencies on U4/U5 ensure backend correctness is fixed first; existing 46 backend tests provide safety net; lazy-load pattern avoids hub payload bloat; self-contained local state reduces coupling |
| Denial filter fix (U2) may briefly show zero results if deployed before denial records with new codes exist | The logger already uses the canonical codes — existing records will match immediately. Only the UI display labels change |
| Debug Bundle identifier split (U3) changes the API parameter contract | Old `errorFingerprint` parameter continues to work for error event queries (backward compatible). New `errorEventId` is additive |
| Admin smoke extensions (U7) may fail in environments without smoke account | Existing smoke setup docs and canary pattern preserved; new steps follow same failure-handling as existing steps |
| Refactor (U8) may introduce subtle rendering differences | Characterisation-first discipline (U1) and snapshot-style assertions catch any output change |
| U3 empty-fingerprint-match produces SQL syntax error if not guarded | Empty-match guard explicitly specified in approach: return empty array before constructing `IN ()` clause |
| U4 condition restructure could accidentally drop `paused → published` gate | Explicit test scenarios for `paused → published` path pin existing correct behaviour |

---

## Sources & References

- **Origin document:** [docs/plans/james/admin-page/admin-page-p4.md](docs/plans/james/admin-page/admin-page-p4.md)
- **P3 completion report:** [docs/plans/james/admin-page/admin-page-p3-completion-report.md](docs/plans/james/admin-page/admin-page-p3-completion-report.md)
- **P3 architecture patterns:** [docs/solutions/architecture-patterns/admin-console-p3-command-centre-architecture-2026-04-27.md](docs/solutions/architecture-patterns/admin-console-p3-command-centre-architecture-2026-04-27.md)
- **P2 section extraction pattern:** [docs/solutions/architecture-patterns/admin-console-section-extraction-pattern-2026-04-27.md](docs/solutions/architecture-patterns/admin-console-section-extraction-pattern-2026-04-27.md)
- **P3 stability patterns:** [docs/solutions/best-practices/p3-stability-capacity-multi-learner-patterns-2026-04-27.md](docs/solutions/best-practices/p3-stability-capacity-multi-learner-patterns-2026-04-27.md)
- **Autonomous sprint learnings:** [docs/solutions/workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md](docs/solutions/workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md)
- **P3 adversarial findings:** ADV-U11-005 (confirmBroadPublish gap), ADV-U11-007 (replay shape parity)
- Related PRs: P3 #382-#409 (13 units), P2 #344/#346/#355/#356
