---
title: Admin console section extraction — monolith to sectioned shell with hash routing
date: 2026-04-27
category: architecture-patterns
module: admin-ops-console
problem_type: architecture_pattern
component: frontend_stimulus
severity: high
applies_when:
  - Restructuring a monolithic React surface into navigable sections
  - Adding URL-based deep-linking to a state-driven SPA without a router library
  - Extracting inline components from a large JSX file while preserving test coverage
  - Adding section navigation with dirty-state protection
tags:
  - admin-console
  - section-extraction
  - hash-routing
  - characterization-tests
  - dirty-row-guard
  - monolith-decomposition
  - spa-routing
  - cloudflare-spa-fallback
---

# Admin console section extraction — monolith to sectioned shell with hash routing

## Context

The admin console (`AdminHubSurface.jsx`) grew to 1,579 lines across P1 and P1.5 — ~15 inline panel components covering KPIs, account management, error logging, content release, subject diagnostics, monster config, and audit trails. All panels rendered in a single flat scroll with no URL entry, no section navigation, and no way to deeplink to a specific area like error debugging.

The restructuring needed to satisfy a hard "no regression" constraint: every existing admin panel, mutation, filter, and diagnostic must remain functional. The backend API surface from P1/P1.5 was preserved exactly — zero new Worker routes, migrations, or API endpoints.

## Guidance

### 1. Check platform configuration before assuming code changes

The advisory document assumed Worker route changes were needed for `/admin` URL entry. A check of `wrangler.jsonc` revealed `"not_found_handling": "single-page-application"` was already configured — Cloudflare serves `index.html` for any path not matching a static file. This eliminated an entire implementation unit and kept the change set purely client-side.

**Rule**: always check hosting platform configuration before writing routing code.

### 2. Use hash-based section routing for internal tools

Section deep-linking uses `#section=debug` rather than pathname segments (`/admin/debug`). Hash-based routing requires zero server/CDN changes, the SPA controls everything after `#`, and there is a single canonical URL per section.

The store carries `adminSection` in `appState.route`:
- `VALID_ADMIN_SECTIONS` set validates values, unknown sections fall back to `'overview'`
- `normaliseRoute` explicitly carries `adminSection` on every `setState` path — critical because `sanitiseState` runs on every state update and strips unrecognised fields
- A shared `admin-hash.js` module exports `parseAdminSectionFromHash()` used by both `main.js` and tests

### 3. Use a counter, not a boolean, for async event guards

Tab clicks update `location.hash` programmatically, which fires `hashchange` asynchronously. The initial boolean guard (`_programmaticHashUpdate`) fails under rapid clicks:

```
Click-A sets guard true → Click-B sets guard true → 
hashchange-A clears guard → hashchange-B sees false, processes redundantly
```

**Fix**: integer counter `_programmaticHashSkips`. Increment on programmatic write, decrement on consume. Handles N pending events correctly and doesn't swallow interleaved manual edits.

### 4. Sync hash on navigate-away to prevent stale state

When leaving admin-hub, `location.hash` retains its value. Returning later without an explicit section creates a store/hash desync. Fix: call `history.replaceState(null, '', pathname + search)` in all navigation handlers that exit admin (navigate-home, open-subject, open-codex, open-parent-hub, open-profile-settings).

### 5. Characterization tests before structural refactors

Before extracting any component, pin every panel's rendered output with SSR characterization tests. This provides the "no regression" safety net.

The 14 characterization tests caught 13 test failures during the merge phase — every failure was a section-routing or text-copy mismatch, all fixable because the tests told us exactly what broke.

**Cost**: ~8 minutes of subagent work to create. **Bugs caught**: 13.

### 6. Extract dirty-state guards as pure functions

The dirty-row section-switch guard uses `confirm()` which can't be tested in SSR. Extract the decision logic into a pure function (`shouldBlockSectionChange`) in a separate module, testable without a DOM:

```javascript
// src/platform/hubs/admin-section-guard.js
export function shouldBlockSectionChange(dirtyRegistry, nextSection, currentSection) {
  if (nextSection === currentSection) return { blocked: true, reason: 'same-section' };
  if (dirtyRegistry.anyDirty()) return { blocked: true, reason: 'dirty-rows' };
  return { blocked: false };
}
```

### 7. Section extraction file layout

The monolith becomes a thin shell (~179 lines) + per-section components:

```
AdminHubSurface.jsx       179 lines  — guards + header + tabs + section render
AdminOverviewSection.jsx  160 lines  — KPI, activity, demo ops
AdminAccountsSection.jsx  392 lines  — roles, ops metadata, audit log
AdminDebuggingSection.jsx 423 lines  — error centre, learner diagnostics
AdminContentSection.jsx   383 lines  — content release, spelling/grammar/punctuation panels, monster config
AdminMarketingSection.jsx  18 lines  — placeholder
AdminSectionTabs.jsx       81 lines  — tab bar with active/coming-soon states
```

Each section receives the same props: `{ model, appState, hubState, accessContext, accountDirectory, actions }`. Inline panel components move with their parent section — not into standalone files (premature abstraction).

## Why This Matters

Without this restructuring, the admin console was functional but unusable at scale:
- No URL entry means no bookmarking, no sharing, no browser-back
- No section navigation means scrolling past 15 panels to find error debugging
- Stale "skeleton" header copy undermines operator trust
- Future admin expansion (debug bundle, account search, asset registry) would add to an already-unmanageable monolith

The pattern also establishes a reusable approach for any future surface that grows beyond a single scroll.

## When to Apply

- A React surface exceeds ~500 lines with multiple logically distinct panel groups
- Users need to deeplink to specific areas of a complex surface
- The hosting platform already has SPA fallback configured (check before coding)
- Structural changes carry a "no regression" constraint against existing functionality
- Components have local state (useState/useRef) that would be lost on unmount — add guards before restructuring mount boundaries

## Examples

**Before**: one `AdminHubSurface` rendering all 15 panels in sequence, reachable only via `actions.dispatch('open-admin-hub')`.

**After**: `/admin#section=debug` loads directly into the Debugging & Logs section. TopNav shows "Admin" for admin/ops users. Tab bar switches between 5 sections with dirty-row confirmation guard. Each section is a focused component importing only what it needs.

**Key metrics from this extraction**:
- 1,579 → 179 lines (89% reduction in shell)
- 56 new test assertions across 5 test files
- 15 code review dispatches, 4 review followers
- 0 regressions (4,104 tests pass, bundle audit clean)

## Related

- `docs/plans/james/admin-page/admin-page-p2-completion-report.md` — full completion report with per-unit detail
- `docs/plans/james/admin-page/admin-page-p2.md` — original advisory document
- `docs/plans/2026-04-27-001-feat-admin-console-p2-restructure-plan.md` — implementation plan
- `docs/solutions/workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md` — SDLC orchestration pattern used for this sprint
- `docs/plans/james/admin-page/admin-page-p1-5-completion-report.md` — P1.5 invariants preserved by this work
- [`admin-console-p3-command-centre-architecture`](admin-console-p3-command-centre-architecture-2026-04-27.md) — P3 successor: standalone Worker modules, dual-signature actor, Debug Bundle error boundaries, marketing lifecycle, body_text XSS gate
- `docs/plans/james/admin-page/admin-page-p3-completion-report.md` — P3 completion report (13 units, 227 tests)
