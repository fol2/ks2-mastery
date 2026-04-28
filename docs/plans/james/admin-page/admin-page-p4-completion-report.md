# Admin Console P4 — Completion Report

**Contract**: `docs/plans/james/admin-page/admin-page-p4.md`  
**Implementation plan**: `docs/plans/2026-04-27-004-feat-admin-console-p4-reliability-hardening-plan.md`  
**Preceded by**: `docs/plans/james/admin-page/admin-page-p3-completion-report.md`  
**Date**: 2026-04-27  
**Aggregate diff**: 9 PRs (#429–#448), +4,762 / -1,032  
**New tests**: ~95 across 6 test files  
**Execution mode**: fully autonomous SDLC — scrum-master orchestration with isolated worktree workers, adversarial reviewers, review followers, squash-merge to main

---

## Executive Summary

P4 is a truthfulness and hardening phase. After P3 shipped 13 units of new Admin surface, the primary risk shifted from "missing panels" to "an operator trusting a panel, filter, route, or label that is partially wired, stale, inconsistent with source, or not covered by production-shaped evidence." P4 shipped 9 units across 9 PRs to make Admin boringly reliable.

The driving question from the P4 contract: **can the operator open Admin, locate the right section, trust the shown state, and understand whether a feature is live, backend-only, or deferred — without being surprised?**

After P4: yes.

### What changed

1. **Three source-truth bugs fixed**: the denial filter dropdown offered 5 values that matched zero real records; the Debug Bundle treated the same input as both a fingerprint and an event ID; the Marketing section said "Coming soon" while the backend was production-ready.
2. **Two P3 adversarial advisories closed**: `confirmBroadPublish` gate extended to `scheduled` transitions (ADV-U11-005); idempotent replay now returns the same response shape as first-call (ADV-U11-007).
3. **Marketing section wired end-to-end**: 790-line backend connected to a new lifecycle panel with API client, CAS conflict handling, broad-publish confirmation, and fetch-generation guards.
4. **Debugging section structurally refactored**: 949-line monolith extracted into 4 focused sub-panels + 30-line thin shell, under characterisation-test discipline.
5. **Admin smoke coverage doubled**: from 7 steps to 14, covering Debug Bundle, denials, account search, account detail, content overview, marketing read, and marketing write-path round-trip.
6. **Documentation reconciled**: `operating-surfaces.md` corrected (active-messages auth, denial codes, Marketing state, Debug Bundle identifiers), P3 deferred items annotated, this completion report.

Every Admin section is now fully live. No "coming soon" labels remain. All 11 P1-P3 invariants are preserved.

---

## Implementation Units — Full Inventory

| U-ID | PR | Merge time | Scope | +/- | Status |
|------|-----|-----------|-------|-----|--------|
| U5 | #429 | 19:37 UTC | Idempotent replay response-shape parity — ADV-U11-007 | +111/-1 | **Shipped** |
| U4 | #430 | 19:37 UTC | `confirmBroadPublish` + `requireMaintenanceEndsAt` on `scheduled` — ADV-U11-005 | +163/-5 | **Shipped** |
| U1 | #431 | 19:42 UTC | Characterisation tests for AdminDebuggingSection (13 tests, 4 panels) | +972/-0 | **Shipped** |
| U2 | #436 | 19:54 UTC | Denial reason filter: 5 values corrected + friendly labels + round-trip tests | +238/-43 | **Shipped** |
| U3 | #437 | 19:55 UTC | Debug Bundle identifier split + empty-match guard — ER-3 | +378/-10 | **Shipped** |
| U6 | #440 | 20:10 UTC | Wire Marketing section to existing backend — full lifecycle panel | +1,364/-12 | **Shipped** |
| U8 | #441 | 20:10 UTC | Extract Debugging section into 4 sub-panels (949 → 30 lines) | +980/-941 | **Shipped** |
| U7 | #445 | 20:23 UTC | Extend admin smoke coverage — 7 new steps (14 total) | +367/-8 | **Shipped** |
| U9 | #448 | 20:30 UTC | Docs truth audit + completion report | +189/-12 | **Shipped** |

Total wall-clock from first merge to last: **53 minutes**.

---

## Source-Truth Reconciliation

P4's first priority (Priority A in the contract) was: "the current source, reports, docs, and UI agree." Source review against `main` revealed six discrepancies. All were fixed.

### 1. Denial reason filter was non-functional

**Severity**: correctness bug — the filter dropdown matched zero real records.

**Found**: `AdminDebuggingSection.jsx` line 495 defined `DENIAL_REASON_OPTIONS` as:
```
['suspended_account', 'rate_limited', 'forbidden', 'invalid_session', 'demo_expired']
```
The Worker's `ALLOWED_DENIAL_REASONS` Set contained:
```
['account_suspended', 'payment_hold', 'session_invalidated', 'csrf_rejection', 'rate_limit_exceeded']
```
All 5 UI values were wrong — 3 were name-mangled (`suspended_account` vs `account_suspended`), and 2 were phantom codes (`forbidden`, `demo_expired`) that the logger silently dropped. The filter dropdown appeared functional but returned empty results for every selection.

**Fixed**: U2 (PR #436) replaced all 5 values with canonical `DENIAL_*` constants from `error-codes.js`, added operator-friendly display labels (e.g. `csrf_rejection` → "CSRF / Same-Origin"), and added a `DENIAL_REASON_LABEL_MAP` for row rendering. 7 round-trip filter tests prove each code returns matching records.

**Critical trap avoided**: `error-codes.js` exports both `ACCOUNT_PAYMENT_HOLD` (`'account_payment_hold'`) and `DENIAL_PAYMENT_HOLD` (`'payment_hold'`). These are different strings. The adversarial reviewer caught this ambiguity and the plan explicitly mandated `DENIAL_*` prefixed imports.

### 2. Debug Bundle identifier was semantically overloaded

**Severity**: correctness bug — occurrence queries returned zero results when searching by fingerprint.

**Found**: `admin-debug-bundle.js` accepted a single `errorFingerprint` parameter. In section 3 (recent errors), it correctly matched `ops_error_events.fingerprint`. In section 4 (occurrences), it was pushed into `event_id = ?` — but `event_id` is a FK referencing `ops_error_events.id` (a UUID-style primary key), not a fingerprint string. An operator entering `fp-xxxx` always got zero occurrence results.

**Fixed**: U3 (PR #437) split the input into two explicit fields: `errorFingerprint` (matches `ops_error_events.fingerprint`) and `errorEventId` (matches `ops_error_events.id`). The occurrence sub-query now resolves fingerprints to event IDs first via an intermediate SELECT, then filters `event_id IN (...)`. An empty-match guard returns `[]` when the fingerprint matches zero events, preventing a SQLite `WHERE event_id IN ()` syntax error.

**Architectural note**: The resolution sub-query runs inside the `safeSection('errorOccurrences', ...)` callback to preserve the `Promise.all` parallel structure. The UNIQUE index on `ops_error_events(fingerprint)` bounds the intermediate SELECT to at most 1 row.

### 3. Marketing UI was a placeholder while docs said "shipped"

**Severity**: truth mismatch — backend production-ready, client was 18-line static text.

**Found**: `AdminMarketingSection.jsx` was 18 lines of "Coming soon" placeholder receiving zero props. `AdminSectionTabs.jsx` had `comingSoon: true` on the marketing tab. Meanwhile, `admin-marketing.js` (790 lines) was a complete lifecycle state machine with CAS, XSS validation, and 46 tests — all unreachable from the UI.

**Fixed**: U6 (PR #440) replaced the placeholder with a full lifecycle panel:
- Created `admin-marketing-api.js` with 5 fetch wrappers (list, create, get, update, transition)
- Added `normaliseMarketingMessage()` to the admin read model
- Built a self-contained panel with: message list + status badges, create form with client-side validation, lifecycle transition buttons from `VALID_TRANSITIONS` map, broad-publish confirmation dialog, CAS conflict handling with auto-refresh, XSS-safe Markdown preview
- Marketing data lazy-loads on tab activation via existing `GET /api/admin/marketing/messages` endpoint — no hub payload inflation
- Ops role sees read-only view; mutation buttons hidden

### 4. Active-messages endpoint auth was misdocumented

**Severity**: documentation error — docs said "public unauthenticated", source says authenticated.

**Found**: `docs/operating-surfaces.md` described `GET /api/ops/active-messages` as "public unauthenticated" in 3 locations. The Worker source places this route after `auth.requireSession(request)` — it requires authentication (any signed-in role).

**Fixed**: U9 (PR #448) corrected all 3 references.

### 5. Broad-publish confirmation gate had a bypass path

**Severity**: defence-in-depth gap — ADV-U11-005 from P3 adversarial review.

**Found**: The `confirmBroadPublish` gate at `admin-marketing.js:639` only checked `action === 'published'`. The `draft → scheduled` transition for `audience: 'all_signed_in'` was ungated. No auto-publisher exists today, but if one were added, a scheduled message could reach broad-audience visibility without operator confirmation.

**Fixed**: U4 (PR #430) extended both gates:
- `confirmBroadPublish`: `action === 'published'` → `(action === 'published' || action === 'scheduled')`
- `requireMaintenanceEndsAt`: same extension (defence-in-depth symmetry — a maintenance message scheduled without `ends_at` should be caught at scheduling time)
- 7 new test cases; 2 existing tests adapted (now require `confirmBroadPublish: true` on their intermediate `draft → scheduled` step)

**Adversarial verification**: The reviewer confirmed no bypass exists through any combination of transitions in `VALID_TRANSITIONS`. The `scheduled → draft → scheduled` unschedule path re-triggers the gate because `row.audience` is immutable after creation.

### 6. Idempotent replay returned a different response shape

**Severity**: contract inconsistency — ADV-U11-007 from P3 adversarial review.

**Found**: First-call marketing transitions returned `{ messageId, previousStatus, newStatus, message: adminMessageFields(updated), mutation: { replayed: false } }`. Replay returned `{ messageId, previousStatus, newStatus, mutation: { replayed: true } }` — missing the `message` field. Clients parsing the response would fail on replay.

**Fixed**: U5 (PR #429) re-reads the current message row from DB on replay and includes `message: adminMessageFields(currentRow)` with a null guard. 4 new tests including strict `Object.keys` shape parity assertion.

---

## Architectural Changes

### Debugging section extraction (U8, PR #441)

`AdminDebuggingSection.jsx` was 949 lines containing 4 distinct panel components, 4 private helpers, filter state, expanded-row state, and form state. U8 extracted these into 4 self-contained files:

| File | Content | Lines |
|------|---------|-------|
| `AdminErrorTimelinePanel.jsx` | ErrorLogCentrePanel + OccurrenceTimeline + ErrorEventDetailsDrawer | ~300 |
| `AdminLearnerSupportPanel.jsx` | LearnerSupportPanel (different prop contract: needs `appState`, `accessContext`) | ~100 |
| `AdminRequestDenialsPanel.jsx` | DenialLogPanel + DENIAL_REASON_OPTIONS + DENIAL_REASON_LABEL_MAP + normaliseDenialEntry | ~200 |
| `AdminDebugBundlePanel.jsx` | DebugBundlePanel + DebugBundleSectionTable + DebugBundleResult | ~300 |

The parent `AdminDebuggingSection.jsx` is now a 30-line thin composition shell. Each extracted panel carries its own private helpers — no cross-imports between panel files. This follows the P2 extraction pattern where `AdminHubSurface.jsx` went from 1,579 → 179 lines.

**Characterisation-first discipline**: U1 (PR #431) wrote 13 characterisation tests pinning all 4 panels' rendered output before any extraction. The reviewer identified 2 HIGH gaps (DebugBundleResult rendering path and error centre filters were unpinned), which a follower fixed before merge. The extraction then proceeded with full regression safety.

### Marketing client architecture (U6, PR #440)

The Marketing panel uses a standalone API client pattern rather than integrating into the hub dispatcher:

```
AdminMarketingSection (local state)
  → createAdminMarketingApi() (5 fetch wrappers)
    → GET/POST/PUT /api/admin/marketing/messages (existing P3 Worker routes)
      → admin-marketing.js (790-line state machine)
        → D1 batch() with CAS
```

Key design decisions:
- **Lazy-load on tab activation**: avoids bloating `readAdminHub` payload for every admin page load
- **Self-contained local state**: message list, loading, error, selected message, form state, CAS `expectedRowVersion` — no new store/dispatcher actions
- **Generation-counter stale-response guard**: `fetchGeneration` ref prevents rapid Refresh clicks from producing last-write-wins with stale data
- **Form-reset-on-success-only**: after adversarial review caught premature form clearing, `handleSubmit` awaits the API promise and only clears on success
- **CAS conflict auto-refresh**: after a 409 conflict, the message list is auto-refreshed so the detail view shows current server state

### Production smoke architecture (U7, PR #445)

7 new smoke steps (8–14) follow the established pattern (try/catch, correlation ID, exit code escalation) with one addition: the marketing write-path round-trip (step 14) creates a draft with `audience: 'internal'`, then archives it, with state-drift retry — exercising CAS, XSS validation, and the lifecycle state machine in production without leaving visible state.

The adversarial reviewer caught 2 BLOCKER-level contract mismatches (wrong response keys for denials `entries` vs `rows` and accounts `results` vs `rows/accounts`) plus a HIGH (snake_case `row_version` vs camelCase `rowVersion` in the CAS flow). All fixed by follower before merge.

---

## Adversarial Review Telemetry

P4 ran adversarial review on every PR. **~20 subagents total** (9 workers + 8 reviewers + 5 followers). The review pipeline caught issues that would have been production bugs:

| PR | Review | Findings | Resolution |
|----|--------|----------|------------|
| #429 (U5) | Adversarial | 2 LOW: null guard untested, key-parity is structural only | Advisory — accepted |
| #430 (U4) | Adversarial | 3 LOW: rate-limit reset safe, test fixes correct, no bypass path | Advisory — accepted |
| #431 (U1) | Adversarial | **2 HIGH**: DebugBundleResult path unpinned (106 lines), error centre filters unpinned (6 inputs) | **Follower fixed** — added 2 new tests (12→13) |
| #436 (U2) | Adversarial | **1 HIGH**: `worker-admin-request-denials-read.test.js` still seeded old wrong codes. 1 MEDIUM: raw codes in denial rows | **Follower fixed** — 8 legacy codes replaced, friendly labels added to rows |
| #437 (U3) | Adversarial | 1 MEDIUM: theoretical cross-section race. 2 LOW: safeSection hides failure signal, prefill inherits falsy guard | Advisory — accepted |
| #440 (U6) | Adversarial | **2 HIGH**: CAS conflict stale state, form reset before server response. 4 MEDIUM: dead onRefresh prop, rapid-refresh race, datetime NaN, body_text untrimmed | **Follower fixed** — CAS auto-refresh, form-reset-on-success, removed dead prop, fetch generation guard |
| #441 (U8) | Adversarial | 2 HIGH (merge-order artifact from U2/U3 landing first). 1 MEDIUM: CI red (pre-existing). 1 LOW: CSS class→inline | Merge-order artifact — HIGHs were correct changes from U2/U3 |
| #445 (U7) | Adversarial | **2 BLOCKER**: wrong response keys (`rows` vs `entries`/`results`). **2 HIGH**: `rowVersion` casing, drift-return bypasses summary | **Follower fixed** — all 4 response key/casing/control-flow issues corrected |
| #448 (U9) | Docs only | No review | — |

### What the reviews caught that tests did not

The most valuable adversarial catches were **contract mismatches** — cases where the code was internally consistent but disagreed with the actual API response shape:

1. **U7 denial response key**: smoke checked `payload.rows` but the API returns `entries`. Tests using mocks would pass; only the review caught it by tracing through `repository.js`.
2. **U7 account search key**: smoke checked `payload.rows` / `payload.accounts` but the API returns `results`. Same class of bug.
3. **U7 `row_version` casing**: smoke read `rowVersion` (camelCase) but the API returns `row_version` (snake_case). The initial archive worked by coincidence (both 0), masking the bug.
4. **U2 legacy test codes**: `worker-admin-request-denials-read.test.js` seeded old wrong codes via raw SQL, bypassing the `ALLOWED_DENIAL_REASONS` validation gate. The tests passed but tested a production-unreachable scenario.

These are the bug class that unit tests with mocks cannot catch. The adversarial reviewers' source-tracing methodology — following data from Worker response through app.js spread through API client to assertion — is what found them.

---

## P3 Residuals Resolved

| P3 deferred item | P4 resolution |
|-----------------|---------------|
| `confirmBroadPublish` on `scheduled` transition (ADV-U11-005) | **Resolved** — PR #430 (U4). Extended to both `published` and `scheduled`. `requireMaintenanceEndsAt` extended symmetrically. |
| Idempotent replay response-shape parity (ADV-U11-007) | **Resolved** — PR #429 (U5). Replay re-reads current row for `message` field. |
| Production smoke harmonisation | **Resolved** — PR #445 (U7). 14-step coverage with structured JSON, `--help`, distinct exit codes, marketing write-path round-trip. |
| Debug Bundle Playwright end-to-end | **Not resolved** — P4 added unit tests + smoke coverage but not a Playwright browser test. Deferred. |

---

## Invariants Preserved

All 11 P1-P3 hard invariants remain intact after P4:

1. **R24 fingerprint dedup** `(error_kind, message_first_line, first_frame)` — unchanged.
2. **`row_version` CAS on `account_ops_metadata`** — unchanged. Marketing CAS follows the same `batch()` + post-batch guard pattern.
3. **Auto-reopen with CAS guard** — unchanged.
4. **`ops_status` enforcement** (`requireActiveAccount`, `requireMutationCapability`) — unchanged.
5. **Session invalidation via `status_revision`** — unchanged.
6. **Additive hub payload** — unchanged. Marketing uses a dedicated lazy-load API client, not hub payload inflation.
7. **Content-free leaf module boundary** — all P4 client modules verified zero-import from worker/.
8. **Mutation receipt pattern** — unchanged. Marketing transitions write receipts via `mutationReceiptStatement`.
9. **Rate-limit before body-cap** — unchanged. Marketing routes share `admin-ops-mutation` bucket.
10. **Dirty-row section-switch guard** — unchanged.
11. **Counter-based hashchange guard** — unchanged.

---

## Deferred Items

### Deferred from P4 scope (explicit non-goals in plan)

| Item | Origin | Reason for deferral |
|------|--------|-------------------|
| Operational evidence panel | Contract PR-7 | Evidence schema and telemetry not strong enough to avoid misleading the business owner. Needs capacity-evidence v3, CSP/HSTS gate state, and a clear "provisional vs certified" taxonomy. |
| Panel freshness/failure framework | Contract PR-9 | Cross-cutting concern (last-refreshed timestamp, stale-data warning, retry button, partial failure). Should be designed once as `AdminPanelFrame`, not per-panel. P4's `safeSection` pattern is the per-query version; the UI-level version is P5. |
| Safe-copy redaction framework | Contract PR-10 | Current role-based redaction is sufficient. `safeCopyDebugBundle` with shareable vs internal-only output adds value only when more copy targets exist (account summary, marketing preview). |
| Debug Bundle Playwright e2e | P3 residual | Unit tests + 14-step production smoke cover aggregation, redaction, endpoint shape. Browser-level test of search→generate→copy flow remains deferred. |
| Complex audience targeting | Contract non-goal | Per-child, per-cohort marketing targeting is a future Marketing iteration. |
| Full search infrastructure | Contract non-goal | SQL LIKE sufficient at current scale (~hundreds of accounts, not thousands). |

### Items from the P4 contract that P4 delivered

| Contract requirement | Delivery |
|---------------------|----------|
| PR-1: Section truthfulness | All 5 sections live. No "coming soon" labels. |
| PR-2: Debug Bundle correctness | Two-field identifier with resolution sub-query. |
| PR-3: Occurrence timeline usefulness | Fields preserved from P3. No additional fields added (kind, message summary, source classification remain as P3 shipped). |
| PR-4: Request-denial evidence | 5 canonical codes, friendly labels, round-trip tests. |
| PR-5: Account support QoL | Unchanged from P3 (search, detail, Debug Bundle link). |
| PR-6: Marketing truth and safety | Marketing is live. Broad-publish covers scheduled. Replay is shape-consistent. |
| PR-8: Admin navigation QoL | Unchanged from P2 (hash deep-linking, SPA fallback, login redirect stash). |
| ER-1: Worker-authoritative mutations | Unchanged. Marketing transitions are Worker-authoritative. |
| ER-2: Explicit auth contracts | Active-messages auth corrected in docs. Marketing mutations admin-only. |
| ER-3: Identifier clarity | Debug Bundle uses `errorFingerprint` vs `errorEventId`. |
| ER-4: No silent filter loss | Denial filter now matches real records. |
| ER-5: Characterisation before refactor | 13 characterisation tests preceded U8 extraction. |
| ER-7: Production-shaped evidence | 14-step admin smoke with marketing write-path. |

---

## Execution Pattern

### Batch orchestration

The sprint ran in 5 dependency-ordered batches with all work in isolated git worktrees. Main repo never changed branch.

```
Batch 1 (parallel):  U1 + U4 + U5  → review → merge
Batch 2 (parallel):  U2 + U3        → review → follower → merge
Batch 3 (parallel):  U6 + U8        → review → follower → merge
Batch 4:             U7             → review → follower → merge
Batch 5:             U9             → merge
```

### SDLC cycle per unit

```
Worker (isolated worktree) → implement + test + commit + push + create PR
  → Adversarial reviewer → construct failure scenarios, trace data paths
    → (if BLOCKER/HIGH) Follower → fix findings + push to same PR
      → (optional re-review)
  → Squash merge to main
```

### Throughput

- 9 PRs merged in 53 minutes wall-clock
- ~20 subagents total (9 workers, 8 reviewers, 5 followers)
- 6 BLOCKER/HIGH findings caught by review and fixed before merge
- 0 regressions in main

---

## Admin Console Evolution: P1 → P4

| Phase | PR(s) | Focus | Files Δ | Tests |
|-------|-------|-------|---------|-------|
| P1 | #188 | 4 panels + public error ingest | +3,200 | ~80 |
| P1.5 | #216–#308 | CAS + enforcement + error cockpit | +4,100 | ~150 |
| P2 | #344–#363 | IA restructure + section navigation (1,579→179 lines) | +1,800/-1,400 | ~40 |
| P3 | #382–#409 | Command centre — 13 units, 12 PRs | +12,325/-80 | 227 |
| **P4** | **#429–#448** | **Hardening — 9 units, 9 PRs** | **+4,762/-1,032** | **~95** |

**Cumulative**: the Admin Console is now a five-section command centre with ~600 tests, 14-step production smoke, characterisation-tested structure, and honest documentation. Every section is live, every identifier is unambiguous, every filter matches its backend, and the debugging workflow supports evidence-based operator decision-making from account search through to copied Debug Bundle.

---

## P4 done means

From the contract, section 13: "P4 is done when Admin is less exciting and more dependable."

The business owner should feel:

- "I know where to go." → 5 live sections, hash deep-linking, login redirect stash.
- "I know whether this feature is actually live." → No "coming soon" labels. Marketing wired.
- "I can debug from evidence." → Debug Bundle with unambiguous identifiers. Denial filter works.
- "I can trust the labels and filters." → 5 canonical denial codes with friendly labels. Round-trip tested.
- "I can copy a safe bundle." → Existing role-based redaction preserved. Copy buttons functional.
- "I can see production health without reading five docs." → 14-step smoke script. (Evidence panel deferred to P5.)
- "The code is ready for the next feature phase." → 949→30 line extraction. Characterisation tests. No coupling debt.

Only after that should Admin move back into larger product expansion: operational evidence panels, advanced Marketing/Live Ops, content management, or future Hero Mode operational surfaces.
