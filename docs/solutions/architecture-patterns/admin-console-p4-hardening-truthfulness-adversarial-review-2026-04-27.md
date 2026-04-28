---
title: "Admin Console P4 — Characterisation-first truthfulness and adversarial review in hardening sprints"
date: 2026-04-27
category: architecture-patterns
module: admin-ops-console
problem_type: architecture_pattern
component: development_workflow
severity: high
applies_when:
  - Running multi-unit hardening sprints with autonomous subagents
  - Client-server contract surfaces exist that unit tests with mocks cannot verify
  - A feature surface has grown rapidly and needs a truthfulness pass before being trusted for production decisions
  - Admin/ops tooling where incorrect display propagates as incorrect human decisions
  - Multi-layer systems (client, server, database) with independent data representations
tags:
  - adversarial-review
  - autonomous-sdlc
  - contract-mismatch
  - hardening-sprint
  - admin-console
  - characterisation-testing
  - source-truth-audit
  - cas-patterns
---

# Admin Console P4 — Characterisation-First Truthfulness and Adversarial Review in Hardening Sprints

## Context

After Admin Console P3 shipped 13 units of new surface area — debug bundles, denial logging, account search, marketing lifecycle — the admin console appeared feature-complete. All tests passed. The UI rendered without errors. But a systematic hardening pass (P4) revealed a category of bug that passing tests cannot catch: **contract mismatches**, where code is internally consistent but disagrees with reality.

Three source-truth bugs illustrate the problem:

1. **Denial filter was non-functional.** The UI dropdown offered 5 filter values (`suspended_account`, `rate_limited`, `forbidden`, `invalid_session`, `demo_expired`) — none matching the 5 actual logger codes (`account_suspended`, `payment_hold`, `session_invalidated`, `csrf_rejection`, `rate_limit_exceeded`). The dropdown rendered correctly, accepted selections, fired queries, and returned zero results every time. No test caught this because tests seeded data using the same wrong codes via raw SQL.

2. **Debug Bundle returned phantom results.** A single `errorFingerprint` field served double duty: as a fingerprint hash for error-panel lookups and a row primary key for occurrence-panel lookups. The overload produced correct results in some views and silent empty results in others, depending on which interpretation the current query path assumed.

3. **Marketing was "shipped" but invisible.** A 790-line production-ready backend (CAS transitions, XSS validation, 46 passing tests) was wired to an 18-line client placeholder reading "Coming soon." The P3 completion report listed it as shipped.

These are not edge cases. They are the default failure mode when feature velocity outpaces contract verification. (auto memory [claude]: P3 completion report documented Marketing as shipped; P4 contract sections 2.2-2.3 flagged the discrepancy.)

### Sprint execution

P4 ran as a fully autonomous SDLC cycle: 9 units in 5 dependency-ordered batches, ~20 subagents (workers + adversarial reviewers + followers), 53-minute wall-clock to merge all 9 PRs (#429-#448). The adversarial review pipeline caught 6 BLOCKER/HIGH findings that would have been production bugs. Main repo never changed branch — all work in isolated worktrees.

## Guidance

### 1. Pin existing behaviour before changing anything

Write characterisation tests that snapshot the current output of every rendering path and every query result shape. These tests do not assert correctness — they assert stability. The goal is to make any change visible in the diff.

For the Admin Console, this meant 13 characterisation tests across 4 panels (949 lines of source) before a single line of feature code changed. The adversarial reviewer then found 2 HIGH gaps in the characterisation coverage itself — a 106-line `DebugBundleResult` rendering path with 7 section panels that had zero test coverage, and 6 error-centre filter inputs with no assertions. The follower fixed these before merge. (auto memory [claude]: P2 characterisation tests caught 13 failures during section extraction — same pattern proven twice.)

**Pattern**: one characterisation test per independently-queryable section, asserting the full response shape including field names and nesting structure.

### 2. Test against real API response shapes, not assumed shapes

The highest-value adversarial findings were all **shape mismatches** — cases where the test code was internally consistent but disagreed with the actual server response:

| What the code assumed | What the API actually returns | Consequence |
|----------------------|------------------------------|-------------|
| `payload.rows` | `payload.entries` (denial log) | Filter always returned empty |
| `payload.rows` / `payload.accounts` | `payload.results` (account search) | Search appeared broken |
| `message.rowVersion` (camelCase) | `message.row_version` (snake_case) | CAS check passed by coincidence (both 0); first real update would break archival |

The `row_version` case is particularly instructive: initial operations worked because both the stale client value and the real server value were `0`, so the CAS check passed by coincidence. The bug would surface only after the first real update — exactly the scenario a demo or smoke test skips.

**Guard**: smoke tests must assert on actual field names from a real (or faithfully replayed) API response, not from developer assumption. Assert shape first (`'entries' in payload`), then contents.

### 3. Seed test data through production code paths, not raw SQL

The denial filter tests seeded data via raw SQL inserts, bypassing the denial logger's `ALLOWED_DENIAL_REASONS` validation gate. The test database contained denial codes that production code could never produce. Tests passed against data that could not exist.

```javascript
// BEFORE (broken — tests pass against unreachable data)
await db.exec(
  `INSERT INTO denials (code, ts) VALUES ('suspended_account', ...)`
);
// Test: WHERE code = 'suspended_account' → 1 row ✓
// Production: logDenial writes 'account_suspended' → filter finds 0 rows

// AFTER (seeds through production code path)
await logDenial(db, { code: DENIAL_CODES.ACCOUNT_SUSPENDED, ... });
// Filter uses same DENIAL_CODES enum → guaranteed match
```

A subtle trap: `ACCOUNT_PAYMENT_HOLD` produces string `'account_payment_hold'`, while `DENIAL_PAYMENT_HOLD` produces `'payment_hold'`. Similar constant names, different string values. Tests seeding through the production path would catch this immediately; raw SQL inserts cannot.

### 4. Use two-step resolution for identifier overloads

When a single field serves double duty (fingerprint vs row ID), introduce a resolution sub-query inside the data-access boundary:

```javascript
const section = await safeSection('occurrences', async () => {
  // Step 1: resolve fingerprint → event IDs
  const events = await db.prepare(
    `SELECT id FROM error_events WHERE fingerprint = ?`
  ).bind(fingerprint).all();

  const ids = events.results.map(e => e.id);
  if (ids.length === 0) return []; // ← empty-set guard (critical)

  // Step 2: query with resolved IDs
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(
    `SELECT * FROM error_occurrences WHERE event_id IN (${placeholders})`
  ).bind(...ids).all();
});
```

The **empty-match guard** is critical. Without it, a resolution that finds no matching event produces `WHERE event_id IN ()`, which is not valid SQLite and throws a 500 instead of returning an empty section. The resolution sub-query runs inside `safeSection` to preserve the overall `Promise.all` parallel structure.

### 5. Wire client to server as a discrete, testable step

Backend completeness does not imply feature delivery. The Marketing feature had a production-ready backend for weeks, yet users could not reach it. Treat client wiring as its own unit with acceptance criteria:

- **Lazy-load API client**: the marketing panel loads data via a dedicated fetch on tab activation, not by inflating the hub payload that every panel shares. This preserves the standalone-worker-module boundary.
- **CAS with `batch(db, [...])`, never `withTransaction`**: `withTransaction` is a production no-op on Cloudflare D1. Post-batch, check `meta.changes` to confirm the expected row count was affected.
- **Form-reset-on-success-only**: never clear form state before the async API response. If the server rejects, the user retains their input. If the server accepts, then clear.
- **CAS conflict auto-refresh**: on 409, refresh the message list so the detail view shows current server state, breaking the retry-failure loop.
- **Fetch generation counter**: increment a ref on each fetch; discard responses from previous generations to prevent rapid clicks from producing last-write-wins with stale data.

### 6. Run adversarial review on the tests, not just the code

The standard adversarial review asks "does this code do what it claims?" The hardening extension asks "do these tests test what they claim?" This is where the raw-SQL seeding bug, the shape-mismatch bugs, and the unpinned rendering paths were caught. A test that passes against wrong data is worse than no test — it provides false confidence.

Construct failure scenarios first, then check whether the test would catch them. Pattern-match review ("does this look right?") missed all 4 highest-severity blockers across prior sprints. (auto memory [claude]: sys-hardening-p2 adversarial reviewers found 12 of 25 blockers with the failure-scenarios-first approach.)

## Why This Matters

Without characterisation-first hardening:

- **Silent data loss**: the denial filter returned zero results for every selection. An admin investigating a user complaint would conclude "no denials recorded" and close the ticket. The data existed; the query could not find it.
- **Phantom state**: CAS conflict without local refresh means the admin operates on a message version the server has already moved past. Every subsequent save fails in a loop, or worse, overwrites a concurrent edit.
- **Coincidence-dependent correctness**: the `row_version` camelCase bug worked in testing because both values were `0`. The first real production update would break archival. Bugs that depend on initial-value coincidence are invisible to every test that does not simulate a second operation.
- **False completion reporting**: a feature with a production-ready backend and a placeholder client is 0% shipped from the user's perspective, not 95%. Reporting it as complete means it will never appear on a work queue again.

The common thread: every one of these bugs existed in a codebase where all tests passed and all UI rendered without error.

## When to Apply

- **Post-feature-velocity stabilisation**: a surface area has grown rapidly (P1 through P3 added 13+ units) and needs a truthfulness pass before being trusted for production decisions.
- **Admin/ops tooling**: admin consoles are high-trust surfaces — an admin who sees "0 denials" acts on that information. Incorrectness in admin tooling propagates as incorrect human decisions.
- **Multi-layer systems with independent data paths**: when client, server, and database each have their own representation of the same concept (denial codes, identifier semantics, field names), contract mismatches are the expected failure mode.
- **D1/SQLite with CAS patterns**: `batch()` atomicity, `meta.changes` verification, and empty-set SQL guards are D1-specific requirements that standard ORM-based testing will not surface.
- **Any system where tests seed their own data**: the raw-SQL seeding antipattern is universal. If tests can insert data that production code cannot produce, the tests are testing a different system.

Do **not** apply the full characterisation-first protocol to throwaway prototypes or features under active design churn — the characterisation tests will break on every iteration and provide drag without value. Apply it at the point where a feature is declared "done" and will now be maintained.

## Examples

### Example 1: Smoke test shape assertion

```javascript
// BEFORE (assumed field names — tests pass, production breaks)
const res = await adminApi.getDenials({ code: 'account_suspended' });
assert(res.payload.rows.length > 0);        // ← field is 'entries', not 'rows'
assert(res.payload.rows[0].rowVersion >= 0); // ← field is 'row_version'

// AFTER (assert shape first, then contents)
const res = await adminApi.getDenials({ code: 'account_suspended' });
assert('entries' in res.payload, 'expected entries key in denial response');
assert(res.payload.entries.length > 0);
assert('row_version' in res.payload.entries[0], 'expected snake_case row_version');
```

### Example 2: CAS form state — reject before reset

```javascript
// BEFORE (form clears on submit, before server responds)
async function handlePublish(formData) {
  setFormState({});        // ← clears immediately
  const res = await api.publish(formData);
  if (!res.ok) showError('Failed'); // user's input is gone
}

// AFTER (clear only on confirmed success)
async function handlePublish(formData) {
  const res = await api.publish(formData);
  if (!res.ok) {
    if (res.status === 409) await refreshLocalState(); // CAS: reload server state
    showError(res.error);
    return; // form retains user's input
  }
  setFormState({}); // clear only after confirmed success
}
```

### Example 3: Adversarial review catch rates across sprints

| Sprint | Units | Subagents | Adversarial findings (BLOCKER+HIGH) | Bug class |
|--------|-------|-----------|--------------------------------------|-----------|
| Sys-Hardening P2 | 13 | 28 | 12 of 25 | CAS omissions, stale UI state |
| Admin Console P3 | 13 | 28 | 4 | CAS guard, TOCTOU, denial attribution |
| **Admin Console P4** | **9** | **~20** | **6** | **Contract mismatches, shape drift, stale state** |

The P4 finding class — contract mismatches between client and server — is distinctive because these bugs are **invisible to unit tests with mocks**. The reviewer catches them by tracing data from Worker response through app.js spread through API client to assertion. This source-tracing methodology is the core P4 insight.

## Related

- [Admin Console P3 Command Centre Architecture](admin-console-p3-command-centre-architecture-2026-04-27.md) — direct predecessor; standalone modules, CAS patterns, `safeSection` error boundary
- [Admin Console Section Extraction Pattern](admin-console-section-extraction-pattern-2026-04-27.md) — P2 characterisation-first extraction (14 tests caught 13 failures)
- [P3 Stability, Capacity, Multi-Learner Patterns](../best-practices/p3-stability-capacity-multi-learner-patterns-2026-04-27.md) — characterisation-first methodology, client-vs-server boundary checks, vacuous-truth guards
- [Sys-Hardening P2 Autonomous Sprint Learnings](../workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md) — adversarial review SDLC (failure-scenarios-first found 12 of 25 blockers)
- [Grammar P7 Quality Trust Consolidation](grammar-p7-quality-trust-consolidation-and-autonomous-sdlc-2026-04-27.md) — parallel Playwright contract testing pattern
- P4 completion report: `docs/plans/james/admin-page/admin-page-p4-completion-report.md`
- P4 implementation plan: `docs/plans/2026-04-27-004-feat-admin-console-p4-reliability-hardening-plan.md`
