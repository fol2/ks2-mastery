# Admin Console P4 — Completion Report

**Plan**: `docs/plans/james/admin-page/admin-page-p4.md`  
**Preceded by**: `docs/plans/james/admin-page/admin-page-p3-completion-report.md`  
**Date**: 2026-04-27  
**Aggregate diff**: 8 PRs across 9 units  
**Execution mode**: hardening phase — no new feature expansion

---

## Executive Summary

P4 is a truthfulness and hardening phase. The Admin Console gained enough breadth in P3 that the primary risk shifted from "missing panels" to "an operator trusting a panel, filter, or label that is partially wired, stale, or inconsistent with source." P4 shipped 9 units across 8 PRs to make Admin boringly reliable.

The driving question from the P4 contract: **can the operator open Admin, locate the right section, trust the shown state, and understand whether a feature is live, backend-only, or deferred — without being surprised?**

After P4: yes. Every Admin section is fully live (no "coming soon" labels remain). Marketing is wired end-to-end with UI, API client, and lifecycle transitions. Debug Bundle identifiers are unambiguous. Denial reason filters match the 5 canonical codes. The Debugging section has been structurally refactored from 949 lines into a 30-line thin shell composing 4 focused sub-panels. Production smoke covers 14 steps including the marketing write-path.

---

## Implementation Units — Full Inventory

| U-ID | PR | Scope | Status |
|------|-----|-------|--------|
| U1 | #431 | Characterisation tests for AdminDebuggingSection (13 tests) | **Shipped** |
| U2 | #436 | Denial reason filter mismatch — 5 values corrected + friendly labels | **Shipped** |
| U3 | #437 | Debug Bundle identifier semantics — split `errorFingerprint` + `errorEventId` + empty-match guard | **Shipped** |
| U4 | #430 | `confirmBroadPublish` gate on scheduled transition | **Shipped** |
| U5 | #429 | Idempotent replay response-shape parity | **Shipped** |
| U6 | #440 | Wire Marketing section to existing backend (API client, normaliser, panel, CAS, lifecycle) | **Shipped** |
| U7 | #445 | Extend admin smoke coverage — 7 new steps (steps 8–14) including marketing write-path | **Shipped** |
| U8 | #441 | Extract Debugging section into 4 sub-panels (949 → 30 lines) | **Shipped** |
| U9 | this PR | Truth audit — operating surfaces, P3 annotations, P4 completion report | **Shipped** |

---

## Source-Truth Reconciliation

P4's first priority (Priority A in the contract) was to make source, reports, docs, and UI agree. Here is what was found wrong and what was fixed.

### Marketing section state

**Found**: P3 backend shipped the full marketing lifecycle (`admin-marketing.js`, 723 lines), but the Admin UI Marketing tab was still a placeholder. The `AdminSectionTabs.jsx` tab definition no longer had `comingSoon: true`, but `AdminMarketingSection.jsx` was still a stub.

**Fixed**: U6 (PR #440) wired the Marketing section to the existing backend via `createAdminMarketingApi()`, `normaliseMarketingMessage`, and a full lifecycle editor with CAS transitions, broad-publish confirmation, and submit locks.

### Active-messages endpoint auth contract

**Found**: `docs/operating-surfaces.md` described `GET /api/ops/active-messages` as "public unauthenticated". The Worker source places this route after `auth.requireSession(request)` — it is authenticated (any signed-in role).

**Fixed**: U9 (this PR) corrected `operating-surfaces.md` to say "authenticated (any signed-in role)".

### Denial reason filter mismatch

**Found**: The Debugging section denial filter only listed 3 reason values. The Worker logs 5 canonical denial reasons: `account_suspended`, `payment_hold`, `session_invalidated`, `csrf_rejection`, `rate_limit_exceeded`.

**Fixed**: U2 (PR #436) corrected the filter to expose all 5 values with friendly display labels.

### Debug Bundle identifier confusion

**Found**: The Debug Bundle UI accepted a single "fingerprint" field. The occurrence table uses `event_id` (referencing `ops_error_events.id`). The bundle code filtered by `event_id` when the user might have entered a fingerprint.

**Fixed**: U3 (PR #437) split the input into two explicit fields: `errorFingerprint` (dedupe/grouping fingerprint) and `errorEventId` (`ops_error_events.id`). Added empty-match guard so the API returns a clear signal when neither field matches.

### Broad-publish confirmation gap

**Found**: The `confirmBroadPublish` gate only fired on `published` transitions, not `scheduled`. A scheduled message with `audience: 'all_signed_in'` could bypass the confirmation gate.

**Fixed**: U4 (PR #430) extended the gate to fire on both `published` and `scheduled` transitions.

### Idempotent replay shape mismatch

**Found**: First-success marketing transitions returned a `message` field. Idempotent replay (same `requestId`) returned only `{ messageId, previousStatus, newStatus }` — a different shape that could confuse retry logic.

**Fixed**: U5 (PR #429) made replay responses include the `message` field matching first-success shape.

---

## P3 Residuals Resolved

| P3 deferred item | P4 resolution |
|-----------------|---------------|
| `confirmBroadPublish` on scheduled transition | **Resolved** — PR #430 (U4) |
| Idempotent replay response-shape parity | **Resolved** — PR #429 (U5) |
| Production smoke harmonisation | **Partially resolved** — PR #445 (U7) added 14-step coverage with structured JSON, `--help`, distinct exit codes |
| Debug Bundle Playwright end-to-end | **Not resolved** — P4 added smoke coverage but not Playwright browser test |

---

## Architectural Changes

### Debugging section extraction (U8, PR #441)

`AdminDebuggingSection.jsx` was 949 lines containing the error log centre, occurrence timeline, denial log, Debug Bundle panel, and learner support. U8 extracted these into four focused sub-panel files:

| File | Content |
|------|---------|
| `AdminErrorTimelinePanel.jsx` | ErrorLogCentrePanel + OccurrenceTimeline + ErrorEventDetailsDrawer |
| `AdminRequestDenialsPanel.jsx` | DenialLogPanel + DENIAL_REASON_OPTIONS + DENIAL_REASON_LABEL_MAP |
| `AdminDebugBundlePanel.jsx` | DebugBundlePanel + DebugBundleSectionTable + DebugBundleResult |
| `AdminLearnerSupportPanel.jsx` | LearnerSupportPanel |

The parent `AdminDebuggingSection.jsx` is now a 30-line thin composition shell preserving the original prop contract.

Characterisation tests (U1, PR #431, 13 tests) were written before the extraction to guarantee behaviour preservation.

### Marketing API client (U6, PR #440)

`createAdminMarketingApi()` provides `fetchMarketingMessages`, `createMarketingMessage`, and `transitionMarketingMessage` — a standalone API client that talks to the P3 marketing Worker routes. The `AdminMarketingSection.jsx` component manages local state with generation-counter stale-response guards, `useSubmitLock` for mutation debouncing, and CAS `expectedRowVersion` threading for lifecycle transitions.

---

## Invariants Preserved

All 11 P1–P3 hard invariants remain intact after P4:

1. **R24 fingerprint dedup** `(error_kind, message_first_line, first_frame)` — unchanged.
2. **`row_version` CAS on `account_ops_metadata`** — unchanged.
3. **Auto-reopen with CAS guard** — unchanged.
4. **`ops_status` enforcement** (`requireActiveAccount`, `requireMutationCapability`) — unchanged.
5. **Session invalidation via `status_revision`** — unchanged.
6. **Additive hub payload** — unchanged. Marketing uses a dedicated API client, not hub payload inflation.
7. **Content-free leaf module boundary** — all P4 client modules verified zero-import.
8. **Mutation receipt pattern** — unchanged.
9. **Rate-limit before body-cap** — unchanged.
10. **Dirty-row section-switch guard** — unchanged.
11. **Counter-based hashchange guard** — unchanged.

---

## Deferred Items

### Deferred from P4 scope (explicit non-goals)

These items from the P4 contract (sections PR-7, PR-9, PR-10) were intentionally deferred to P5:

- **Operational evidence panel (PR-7)** — compact display of release/build, smoke status, capacity posture, CSP/HSTS state. Deferred because the evidence schema and telemetry are not strong enough to avoid misleading the business owner.
- **Panel freshness/failure framework (PR-9)** — last-refreshed timestamp, stale-data warning, partial-failure visibility. Deferred as a cross-cutting concern that should be designed once, not per-panel.
- **Safe-copy redaction framework (PR-10)** — standardised redaction for Debug Bundle JSON, account summary, fingerprint copy. Deferred because the current role-based redaction is sufficient; the framework adds value only when more copy targets exist.

### Carried forward from P3

- **Debug Bundle Playwright end-to-end** — unit tests and 14-step production smoke cover aggregation, redaction, and endpoint shape. No browser-level test of the full search → generate → copy flow. Deferred.
- **Complex audience targeting** (per-child, per-cohort) for Marketing — future phase.
- **Full search infrastructure** (Elasticsearch, Meilisearch) — SQL LIKE sufficient at current scale.
- **Production Arithmetic/Reasoning/Reading content providers** — placeholder-only in content overview.

---

## Review Telemetry

| PR | Review type | Findings |
|----|------------|----------|
| #431 (U1) | Characterisation test — no review needed | — |
| #436 (U2) | Correctness | Values aligned to Worker constants |
| #437 (U3) | Correctness | Identifier split verified against occurrence table schema |
| #430 (U4) | Correctness | Gate condition confirmed on both `published` and `scheduled` |
| #429 (U5) | Correctness | Replay shape now includes `message` field |
| #440 (U6) | Adversarial | HIGH-1: form clears on success only; HIGH-2: CAS conflict triggers list refresh; MEDIUM-1: generation counter guards stale fetch; MEDIUM-2: broad-publish gate covers both transitions |
| #441 (U8) | Correctness | Extraction verified by U1 characterisation tests |
| #445 (U7) | Adversarial | Smoke steps 8–14 wrapped in individual try/catch for maximum coverage; state-drift guard for marketing create/archive pair |

---

## Admin Console Evolution: P1 → P1.5 → P2 → P3 → P4

| Phase | PR(s) | Focus | Tests added |
|-------|-------|-------|-------------|
| P1 | #188 | 4 panels + public error ingest | ~80 |
| P1.5 | #216, #227, #270, #292, #308 | CAS + enforcement + error cockpit | ~150 |
| P2 | #363 | IA restructure + section navigation | ~40 |
| P3 | #382–#409 | Command centre — 12 PRs | 227 |
| **P4** | **#429–#445** | **Hardening — 8 PRs** | **~60** |

P4 closed the gap between P3's claimed delivery and source truth. The Admin Console is now a five-section command centre where every section is fully live, every identifier is unambiguous, and every filter matches its backend. The next phase (P5) can safely expand features because the foundation is now honest.
