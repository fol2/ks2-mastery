# Admin Console P2 — Completion Report

**Plan**: `docs/plans/2026-04-27-001-feat-admin-console-p2-restructure-plan.md`
**Advisory origin**: `docs/plans/james/admin-page/admin-page-p2.md`
**Feature PR**: #363 (`feat/admin-console-p2-restructure`)
**Per-unit PRs**: #344, #346, #355, #356
**Date**: 2026-04-27
**Wall-clock**: ~4h (planning 45min, 6 implementation units, 15 reviewer dispatches, 4 review followers)

---

## Executive Summary

The admin console has been restructured from a monolithic 1,579-line single-surface (`AdminHubSurface.jsx`) into a professional sectioned console with direct URL entry, section tab navigation, and a debugging-first layout. **Zero new backend changes** — all routing handled by the existing Cloudflare SPA fallback + client-side hash parsing. Zero regressions: 4,104 tests pass, `audit:client` clean.

**Before**: one flat scroll of ~15 panels, no URL entry, no TopNav link, stale "skeleton" header copy, no way to deeplink to error debugging.

**After**: `/admin` direct URL with `#section=debug` deep-linking, TopNav "Admin" button for admin/ops users, 5 tabbed sections (Overview, Accounts, Debugging & Logs, Content, Marketing placeholder), dirty-row confirmation guard on section switch, accurate "Admin Console" header.

---

## What the Advisory Proposed vs What Shipped

The advisory (`admin-page-p2.md`) laid out 7 phases (P2.0–P2.6) and 7 PRs (A–G). This plan consolidated and descoped based on codebase verification:

| Advisory Phase | Proposed | What Shipped | Notes |
|---------------|----------|--------------|-------|
| **P2.0** | Fix CAS forwarding + error filter forwarding | **Skipped** — already fixed in P1.5 | Verified at `repository.js:8996-9009` (CAS) and `8946-8952` (filters) |
| **P2.1** | Admin IA shell | **Shipped** — 5 section components + tab navigation | U4+U5, PR #355 |
| **P2.2** | Debugging cockpit | **Partially shipped** — Error centre in its own section with debug-first layout | Full debug bundle (aggregated evidence packet) deferred |
| **P2.3** | Account management polish | **Partially shipped** — Accounts in its own section with existing capabilities | Account search, advanced GM tooling deferred |
| **P2.4** | Content + subject merge | **Partially shipped** — Content section groups all subject panels | Subject release readiness, misconception taxonomy deferred |
| **P2.5** | Asset & Effect Registry | **Not started** — deferred to follow-up | Monster Visual Config moved into Content section unchanged |
| **P2.6** | Marketing / Live Ops | **Shipped as placeholder** — empty section with future-intent copy | No backend, as planned |

**New scope items not in the advisory:**
- `/admin` direct URL entry via Cloudflare SPA fallback discovery (the advisory assumed Worker changes were needed — they are not)
- TopNav admin entry point (the advisory mentioned it but didn't scope it as a unit)
- Dirty-row section-switch guard (discovered during flow analysis)
- Hash-based section deep-linking with counter-based feedback-loop guard
- Characterization test suite (14 tests) as a pre-extraction safety net

---

## Implementation Units

| U-ID | PR | Scope | Tests | Reviewers | Reviewer Findings Fixed |
|------|-----|-------|-------|-----------|------------------------|
| U1 | #344 | Characterization test suite — pin all 15 admin panels before extraction | 14 | testing + correctness + project-standards | 2 HIGH (loading/error guards, cron banner), 4 MEDIUM (fixture fidelity, missing assertions) |
| U2 | #346 | SPA boot URL routing + hash section parser + counter-based feedback guard | 25 | correctness + testing + frontend-races | 2 HIGH (boolean→counter guard, store/hash desync), 3 MEDIUM (main.js untested, named handler, boot variants) |
| U3 | #356 | TopNav admin entry point for admin/ops roles | 8 | correctness + testing | 0 (clean — no blockers or HIGH findings) |
| U4+U5 | #355 | Section extraction (1,579→179 lines) + tab navigation + dirty-row guard | 9 new (tabs + guard) | correctness + testing + maintainability | 2 HIGH (no tab tests, no guard tests), 3 MEDIUM (dead imports, dead re-export, stale comment) |
| U6 | — | Regression sweep: adapt characterization tests to section-based rendering | — | — | 3 text/section routing fixes |

**Totals**: 6 units, 4 per-unit PRs, 56 new/adapted tests, 15 reviewer dispatches, 4 review followers.

---

## Architecture Decisions

### 1. Hash-based section routing — zero Worker changes

The advisory assumed the Worker needed new routes for `/admin/*` paths. During planning, we discovered `wrangler.jsonc` already has `"not_found_handling": "single-page-application"` and `/admin` is not in the `run_worker_first` array. Cloudflare's static asset layer serves `index.html` for `/admin` automatically.

This eliminated U2 (Worker SPA fallback route) from the original plan and kept the entire change set client-side. Section deep-linking uses URL hash: `/admin#section=debug`.

**Trade-off**: hash-based URLs are invisible to server-side analytics. For an internal admin tool, this is irrelevant.

### 2. Counter-based hashchange guard — not boolean

The initial implementation used a boolean `_programmaticHashUpdate` flag to prevent feedback loops when tab clicks set `location.hash`. The frontend-races reviewer (julik pattern) identified that rapid tab clicks could exhaust the boolean:

> Click-A sets guard true → Click-B sets guard true again → hashchange-A fires, clears guard → hashchange-B fires, guard is false, redundant state update.

Fixed to an integer counter `_programmaticHashSkips`: increment on write, decrement on consume. Also handles the interleaved manual-edit case correctly.

### 3. Store/hash sync on navigate-away

The correctness reviewer and races reviewer convergently identified a desync: navigating away from admin-hub didn't clear `location.hash`, so returning showed stale hash. Fixed with `history.replaceState` in all 5 navigation handlers that exit admin (navigate-home, open-subject, open-codex, open-parent-hub, open-profile-settings).

### 4. Dirty-row section-switch guard

Flow analysis during planning identified that section switching unmounts the Accounts section, destroying `AccountOpsMetadataRow` local state (unsaved edits protected by `dirtyRef`). Without a guard, admins editing metadata who switch to check error logs would silently lose their edits.

**Solution**: `shouldBlockSectionChange()` extracted as a pure function in `admin-section-guard.js`, tested independently. The shell calls `confirm()` before switching when dirty rows exist.

### 5. Extracted shared hash parser

The testing reviewer identified that `parseAdminSectionFromHash` was duplicated between `main.js` and the test file. Extracted to `src/platform/core/admin-hash.js` — both `main.js` and tests import the same production function.

### 6. R4 (login redirect) deferred

The auth flow (`bootstrap.js` → `renderAuthRoot()` → unconditional redirect to `/`) requires changes to 4+ files outside scope. Documented with a concrete `sessionStorage` stash approach for follow-up.

---

## File Layout After Extraction

```
src/surfaces/hubs/
  AdminHubSurface.jsx          179 lines (was 1,579)  — thin shell: guards + header + tabs + section render
  AdminOverviewSection.jsx     160 lines  — KPI, activity stream, demo ops
  AdminAccountsSection.jsx     392 lines  — roles, ops metadata, audit log
  AdminDebuggingSection.jsx    423 lines  — error centre, learner diagnostics
  AdminContentSection.jsx      383 lines  — content release, spelling debug, grammar panels, monster config
  AdminMarketingSection.jsx     18 lines  — placeholder
  AdminSectionTabs.jsx          81 lines  — tab bar with active/coming-soon states

src/platform/core/
  admin-hash.js                 23 lines  — shared parseAdminSectionFromHash

src/platform/hubs/
  admin-section-guard.js        16 lines  — pure shouldBlockSectionChange function
```

**AdminHubSurface reduction**: 1,579 → 179 lines (89% smaller). Total admin surface code: 1,675 lines across 9 files (was 1,579 in one file). The ~100-line increase is accounted for by new capabilities: tab component, hash parser, section guard, and per-section import boilerplate.

---

## Reviewer Findings — Convergent Patterns

Three findings were independently identified by 2+ reviewers (the "convergent reviewer" pattern from P1.5):

| Finding | Reviewers | Severity | Impact |
|---------|-----------|----------|--------|
| Boolean guard insufficient for rapid clicks | races + correctness + testing | HIGH | Could cause double state updates or swallow manual hash edits |
| Store/hash desync on navigate-away | correctness + races | HIGH | Stale `#section=debug` in URL bar after leaving admin |
| Dead `selectedWritableLearner` import | correctness + maintainability | MEDIUM | Lint warning, phantom dependency signal |

**Rule preserved from P1.5**: any finding convergent across ≥2 reviewers is automatically a BLOCKER. Held across this sprint.

---

## Test Coverage Summary

| Category | Files | Tests |
|----------|-------|-------|
| **Characterization** (U1) | `react-admin-hub-characterization.test.js` | 14 — pins all 15 panels, guard branches, degradation states |
| **URL routing** (U2) | `store-admin-route.test.js` | 25 — normalisation, section survival, hash parsing |
| **TopNav** (U3) | `react-topnav-admin-link.test.js` | 8 — role visibility, active state |
| **Section tabs** (U4) | `react-admin-section-tabs.test.js` | 5 — tab rendering, active state, Marketing chip |
| **Section guard** (U4) | `admin-section-guard.test.js` | 4 — same-section, dirty, clean, after-clear |
| **Adapted existing** | 6 existing test files | `initialSection` added where needed |

**Total new test assertions**: 56 across 5 new test files + 6 adapted files.

---

## Subagent Dispatch Telemetry

| Role | Count | Pattern |
|------|-------|---------|
| Implementation workers | 5 (U1, U2, U3, U4, U4-repair) | Isolated worktrees, each produces a PR |
| Review dispatches | 15 | 3×U1, 3×U2, 2×U3, 3×U4, plus project-standards |
| Review followers | 4 (U1, U2, U4, U6-inline) | Fix findings, push to same branch |

**Reviewer selection heuristic applied**:
- U1 (test-only): testing + correctness + project-standards
- U2 (routing + hashchange): correctness + testing + **frontend-races** (hashchange listener is async timing-sensitive)
- U3 (UI entry point): correctness + testing
- U4 (extraction + tabs): correctness + testing + **maintainability** (large structural change)

**Key efficiency**: U1 and U2 ran in parallel on isolated worktrees (no file overlap). U3 and U4 ran in parallel on isolated worktrees. All reviewer batches dispatched in parallel (3 reviewers per batch, simultaneous).

---

## Hard Invariants Preserved

All P1/P1.5 invariants verified unchanged:

- **`ops_status` enforcement** — `requireActiveAccount` + `requireMutationCapability` middleware chain untouched
- **CAS `row_version` guard** — `expectedRowVersion` fully threaded through client → Worker → repository
- **R24 fingerprint dedup** — `(error_kind, message_first_line, first_frame)` tuple authoritative
- **Additive hub payload** — `/api/hubs/admin` response shape unchanged, new sibling fields via spread only
- **Content-free leaf modules** — all new section files import from `admin-panel-patches.js` and other content-free leaves; `audit:client` passes
- **Auto-reopen logic** — error centre auto-reopen with CAS guard on status='resolved' preserved
- **Error redaction** — `(?<![A-Za-z])[A-Z]{4,}(?![A-Za-z])` pattern preserved

---

## Deferred to Follow-Up Work

| Item | Why Deferred | Recommended Approach |
|------|-------------|---------------------|
| **Login redirect preserving `/admin` target** (R4) | 4+ auth files outside scope | `sessionStorage` stash before `renderAuthRoot()`, read on next boot |
| **Debug Bundle** (aggregated evidence packet) | Requires new Worker endpoint | New `/api/admin/debug-bundle` endpoint aggregating errors, sessions, capacity, activity |
| **Occurrence timeline** | Requires `ops_error_event_occurrences` child table + migration | D1 migration + new repository helper + drawer expansion |
| **Account search + advanced GM tooling** | Feature work on existing section shell | Search input in Accounts section header, fuzzy match on email/name |
| **Asset & Effect Registry generalisation** | Data model changes, separate plan | Upgrade Monster Visual/Effect Config to general asset metadata |
| **Marketing/Live Ops functional backend** | Future phase, placeholder exists | Announcements, campaigns, event delivery when product needs arise |
| **`readAdminHub` sequential → `Promise.all`** | Known perf debt from P1 | Parallelise the 6 helper calls with shared actor resolution |
| **`assertAdminHubActor` dedup** | Known perf debt from P1 | Single actor resolution per hub load, passed to all helpers |

---

## Lessons Learned

### 1. Cloudflare SPA fallback eliminates most routing work

The advisory assumed Worker changes were needed for `/admin` routes. A 30-second check of `wrangler.jsonc` (`"not_found_handling": "single-page-application"`) eliminated an entire implementation unit. **Rule**: always check platform configuration before assuming code changes.

### 2. Characterization tests are cheap insurance for structural refactors

14 SSR characterization tests caught 3 text-copy mismatches and 10+ section-routing gaps during the merge phase. Writing them first (U1) meant every subsequent unit had a safety net. Total characterization test authoring time: ~8 minutes of subagent work. Bugs caught: 13 failures in U4, all fixable because the characterization tests told us exactly what broke.

### 3. Counter > boolean for async event guards

The boolean `_programmaticHashUpdate` pattern is intuitive but breaks under rapid dispatch. The integer counter `_programmaticHashSkips` handles N pending events correctly. This is a general pattern for any `location.hash` / `popstate` / `hashchange` guard. The frontend-races reviewer caught this — correctness and testing reviewers did not.

### 4. Flow analysis catches state-lifecycle bugs that code review misses

The dirty-row section-switch guard was identified during planning-phase flow analysis, not during code review. Without it, admins would silently lose unsaved edits when switching tabs. **Rule**: for any UI restructuring that changes component mount/unmount boundaries, trace every `useState` / `useRef` lifecycle through the new mount tree.

### 5. The 93-file diff is misleading

The PR shows `93 files changed, +3,226 / -9,893`. The large negative delta includes other PRs merged to `main` between our branch point and the merge target. The actual admin-specific changes are: **17 source files, +1,744 / -1,513** (the 1,513 deletions are AdminHubSurface shrinking from 1,579 to 179 lines). Plus **22 test files, +1,393 / -3,009** (the test deletions are unrelated to admin).

### 6. Per-unit PRs with worktree isolation > single-branch serial

Each implementation unit ran on its own worktree, produced its own PR, and went through independent review. This prevented the shared-worktree corruption pattern documented in `feedback_subagent_tool_availability.md`. The merge phase was clean — no conflicts between U1–U4 because they touched different file sets.

---

## Requirements Coverage

| R-ID | Description | Status | Verified By |
|------|-------------|--------|-------------|
| R1 | `/admin` URL entry | **Met** | `store-admin-route.test.js` boot detection tests |
| R2 | Browser refresh preserves section | **Met** | Hash-based routing + boot parser |
| R3 | Access Denied for non-admin/ops | **Met** | `react-admin-hub-characterization.test.js` test 8 |
| R4 | Login redirect preserving admin path | **Deferred** | Documented with sessionStorage approach |
| R5 | TopNav admin entry point | **Met** | `react-topnav-admin-link.test.js` (8 tests) |
| R6 | Section-based navigation | **Met** | `react-admin-section-tabs.test.js` (5 tests) |
| R7 | Zero regression | **Met** | 4,104 tests pass, `audit:client` passes |
| R8 | Updated header copy | **Met** | "Admin Console" + accurate subtitle |
| R9 | Section deep-linking | **Met** | `/admin#section=debug` via hash parser |
| R10 | Content section grouping | **Met** | AdminContentSection.jsx groups 7 panels |
| R11 | Marketing placeholder | **Met** | AdminMarketingSection.jsx with "Coming soon" (P2 state; later wired to full lifecycle by P3 backend + P4 U6 UI) |
| R12 | Structural meta-test coverage | **Met** | No new Worker routes added |
| R13 | Bundle audit passes | **Met** | 808 public files, 7 chunks, 206KB gzip |
