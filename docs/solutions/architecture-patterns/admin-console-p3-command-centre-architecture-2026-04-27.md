---
title: Admin Console P3 — Command Centre Architecture Patterns
date: 2026-04-27
category: architecture-patterns
module: admin-ops-console
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - Building admin/ops consoles requiring standalone Worker module isolation
  - Actor-identity resolution across hub-reads and narrow-refresh routes
  - Fire-and-forget audit logging in Cloudflare Workers
  - Aggregation endpoints that must degrade gracefully during incidents
  - Admin-authored content delivered to all users including children
  - Sensitive data columns readable by a broader audience than their writers
  - Autonomous SDLC sprints of 5+ implementation units
tags:
  - admin-console
  - standalone-worker-module
  - dual-signature-actor
  - ctx-waituntil
  - error-boundary
  - xss-validation
  - closed-schema
  - autonomous-sdlc
---

# Admin Console P3 — Command Centre Architecture Patterns

## Context

The Admin Console grew through four phases on a Cloudflare Workers + D1 (SQLite) + React SPA platform:

- **P1** (PR #188): 4 panels + public error ingest, R24 3-tuple dedup, additive-hub pattern
- **P1.5** (PRs #216–#308): row_version CAS + ops_status enforcement + error cockpit
- **P2** (PR #363): IA restructure — section extraction (1,579→179 lines), hash deep-linking, TopNav, dirty-row guard; zero Worker changes
- **P3** (PRs #382–#409): command centre — Debug Bundles, error occurrence timelines, denial logging, account search, content overview, asset registry, marketing lifecycle

P3 was the largest phase: 13 units, 12 PRs, +12,325 lines, 227 tests, 28 subagent dispatches across 5 batches. By P3, `worker/src/repository.js` had reached 10,029 lines. The execution used fully autonomous SDLC with scrum-master orchestration: workers in isolated worktrees, adversarial review, follower fix, rebase, merge.

Key files introduced in P3:
- `worker/src/admin-debug-bundle.js` — aggregation with per-section error boundaries
- `worker/src/admin-denial-logger.js` — fire-and-forget denial capture via `ctx.waitUntil`
- `worker/src/admin-marketing.js` — lifecycle state machine with server-side XSS validation
- `worker/migrations/0013_admin_console_p3.sql` — 3 new tables with migration-level CHECK constraints

Predecessor pattern docs: [`admin-console-section-extraction-pattern`](admin-console-section-extraction-pattern-2026-04-27.md) (P2), [`sys-hardening-p2-13-unit-autonomous-sprint-learnings`](../workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md) (SDLC orchestration).

## Guidance

### 1. Standalone Worker modules

When `repository.js` gains a self-contained feature surface, extract it into a standalone module rather than appending to the monolith. Each module receives `db` (and optionally `ctx`) as parameters and owns its own D1 queries.

P3 introduced three standalone modules:
- `worker/src/admin-debug-bundle.js` — exports `aggregateDebugBundle`, `redactBundleForRole`, `buildHumanSummary`
- `worker/src/admin-denial-logger.js` — exports `logRequestDenial`, `shouldCaptureDenial`, `maskSessionId`
- `worker/src/admin-marketing.js` — exports `createMarketingMessage`, `updateMarketingMessage`, `transitionMarketingMessage`, `listMarketingMessages`, `getMarketingMessage`, `listActiveMessages`

None import from `repository.js`. They import only from leaf utilities (`d1.js`, `error-codes.js`, `errors.js`, `utils.js`). The trade-off: some query patterns (e.g. missing-table guards) are duplicated rather than shared. This is deliberate — coupling to the monolith's internal helpers would re-establish the dependency P3 was designed to break.

### 2. Dual-signature actor resolution

Admin read helpers accept an optional `{ actor }` parameter. When provided (from `readAdminHub`), the helper skips its internal `assertAdminHubActor` call. When absent (narrow-read routes), it resolves independently.

**Before (pre-P3):** `readAdminHub` called N helpers sequentially, each running its own `assertAdminHubActor` — one D1 round-trip per helper to re-read the same `adult_accounts` row and re-check the same role.

**After (P3 U1, `worker/src/repository.js`):**

```javascript
// Hub orchestrator: single resolution, threaded to all helpers
async readAdminHub(accountId, ...) {
  const actor = await assertAdminHubActor(db, accountId); // exactly 1 D1 round-trip
  const [demoOps, monsterConfig, kpis, activity, opsMeta, errors] = await Promise.all([
    readDemoOperationSummary(db, nowTs),
    readMonsterVisualConfigState(db, nowTs),
    readDashboardKpis(db, { now: nowTs, actorAccountId: accountId, actor }),
    listRecentMutationReceipts(db, { ..., actor }),
    readAccountOpsMetadataDirectory(db, { ..., actor }),
    readOpsErrorEventSummary(db, { ..., actor }),
  ]);
}

// Each helper: dual-signature
async function readDashboardKpis(db, { now, actorAccountId, actor = null } = {}) {
  if (!actor) await assertAdminHubActor(db, actorAccountId); // only on narrow routes
  // ...query work...
}
```

This eliminated 4 redundant D1 round-trips per hub load.

### 3. `ctx.waitUntil` for fire-and-forget side-effects

Denial logging uses `ctx.waitUntil(promise)` to extend Cloudflare Worker execution context beyond the HTTP response. The response (403/429) returns immediately; the D1 INSERT completes asynchronously.

The implementation chain:

1. **Thread `ctx`** through `createWorkerApp().fetch(request, env, ctx)` — P3 added the third parameter that `index.js` already passed but `app.js` previously ignored.

2. **Non-enumerable `__denialSession`** on error objects prevents accidental serialisation:
```javascript
Object.defineProperty(error, '__denialSession', {
  value: session,
  enumerable: false,
});
```

3. **Dispatch via `ctx.waitUntil`** in the denial logger:
```javascript
if (ctx && typeof ctx.waitUntil === 'function') {
  ctx.waitUntil(doInsert());  // extends execution context beyond response
} else {
  doInsert();  // test environments — fire-and-forget without ctx
}
```

The fallback to bare `doInsert()` (no await) means test environments work without mocking `ctx`.

### 4. Per-section error boundary in aggregation

The Debug Bundle aggregates 7 sub-queries. Each runs inside a `safeSection` wrapper:

```javascript
async function safeSection(label, fn) {
  try {
    return await fn();
  } catch (error) {
    try {
      console.error('[ks2-debug-bundle]', JSON.stringify({
        event: 'debug_bundle.section_failed',
        section: label,
        reason: error?.message || String(error),
      }));
    } catch { /* even the error log is best-effort */ }
    return null;
  }
}

// All 7 sections in parallel:
const [account, learners, errors, occurrences, denials, mutations, capacity] =
  await Promise.all([
    safeSection('accountSummary', async () => { /* ... */ }),
    safeSection('linkedLearners', async () => { /* ... */ }),
    // ...
  ]);
```

A failed section returns `null`, not a 500. The nested try/catch around `console.error` prevents even the error logging from disrupting other sections. Sub-queries additionally use `allSafe`/`firstSafe` wrappers that catch `no such table` errors specifically — so a missing migration degrades to an empty section rather than `null`.

**Design principle**: the tool operators use when things are broken must not itself break.

### 5. Server-side content validation as primary XSS gate

Marketing `body_text` is validated on the Worker write path at `worker/src/admin-marketing.js`. The validation enforces:

- **`<`/`>` rejection**: `containsHtmlTags` rejects any body_text containing angle brackets. No raw HTML passes the write boundary.
- **Link href scheme allowlist**: only `https:` permitted. Blocked: `javascript:`, `data:`, `mailto:`, `vbscript:`, protocol-relative `//`.
- **Markdown link extraction**: regex finds all `[text](href)` patterns for scheme validation.

This is the primary XSS gate. Client-side React rendering (no `dangerouslySetInnerHTML`) is defence-in-depth, not the primary boundary. The rationale: admin-authored content is delivered to all signed-in users (including children). If the write path permits malicious content, no amount of client-side escaping is trustworthy.

### 6. Closed schema for sensitive data columns

The denial table enforces storage-boundary guardrails at two layers:

**Migration layer** (`worker/migrations/0013_admin_console_p3.sql`):
```sql
session_id_last8 TEXT CHECK (session_id_last8 IS NULL OR length(session_id_last8) <= 8),
detail_json TEXT CHECK (detail_json IS NULL OR json_valid(detail_json))
```
The `length <= 8` CHECK means even if application code has a bug, the full session token physically cannot be stored.

**Application layer** (`worker/src/admin-denial-logger.js`):
- `maskSessionId`: truncates to last 8 characters before INSERT
- `buildDetailJson`: field-name allowlist (`DETAIL_KEYS`). Only allowed keys pass through, only primitive values. Raw headers, cookies, request bodies are structurally excluded.
- `ALLOWED_DENIAL_REASONS`: closed set validates `denialReason` — unknown values silently dropped.

**Principle**: storage-boundary guardrails prevent application-layer mistakes. A bug in the auth boundary cannot leak a full session token because the schema physically cannot store one.

### 7. Scrum-master SDLC orchestration

P3 executed 13 units across 28 subagent dispatches in 5 batches. The canonical SDLC pattern is documented in [`sys-hardening-p2-13-unit-autonomous-sprint-learnings`](../workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md). P3-specific telemetry:

- **28 subagents**: 14 workers (1 retry), 7 reviewers, 7 followers
- **4 HIGH bugs caught** by adversarial review (all CAS or audience-related)
- **4 merge-conflict rebases** — all in `app.js` (concurrent route additions) and `error-codes.js` (concurrent constants). Purely additive, no semantic conflicts.
- **Convergent bug-class heuristic** (P3 addition): the same CAS-guard-omission bug was found at 2 sites in one U11 review — `transitionMarketingMessage` (missing post-batch `meta.changes` check) and `updateMarketingMessage` (missing `AND row_version = ?` in WHERE). Confirms this as a systematic pattern, not a one-off. Treat same-bug-class-at-multiple-sites as BLOCKER.

## Why This Matters

| Pattern | What it prevents |
|---------|-----------------|
| Standalone modules | `repository.js` growing past maintainability (11,500+ lines without extraction); constant merge conflicts in parallel development |
| Dual-signature actors | 4 redundant D1 round-trips per hub load; sluggish admin experience under P3's heavier query load |
| `ctx.waitUntil` | Silent denial-log drops when Worker execution context terminates after response |
| Per-section error boundary | Debug Bundle failing completely during the exact incidents operators need it for |
| Server-side XSS validation | Stored XSS via admin-authored Markdown links delivered to children |
| Closed schema | Full session tokens persisting in ops-readable denial logs (credential exposure) |
| SDLC orchestration | 4 HIGH bugs shipping to production; merge conflicts across parallel workers |

## When to Apply

| Pattern | Trigger condition |
|---------|-------------------|
| Standalone Worker modules | `repository.js` exceeds ~5,000 lines AND new feature is self-contained (owns its own tables) |
| Dual-signature actor | A function is called from both a hub-read (shared context) and narrow routes (no shared context) |
| `ctx.waitUntil` | Any D1 write in a Cloudflare Worker that must not block the HTTP response |
| Per-section error boundary | Any aggregation endpoint operators use during incidents |
| Server-side content validation | Any admin-authored content delivered to a broader audience than its authors |
| Closed schema | Any column readable by a broader audience than its writers, or storing secret derivatives |
| SDLC orchestration | Sprints of 5+ units, or any sprint requiring parallel worker isolation |

## Examples

### Dual-signature actor resolution — full before/after

**Before**: each of 4 helpers independently called `assertAdminHubActor`, producing 5 total D1 SELECTs per `readAdminHub` (1 in hub + 4 in helpers).

**After**: single call at hub level, actor threaded to all helpers via optional parameter. Helpers fall back to independent resolution only on narrow-read routes. Net: 1 SELECT per hub load, 1 per narrow route. Zero API contract change.

Files: `worker/src/repository.js` — `assertAdminHubActor` (line ~2003), `readAdminHub` (line ~9577), each helper's `actor = null` default parameter.

### Per-section error boundary — safeSection wrapper

**Pattern**: wrap each aggregation sub-query in `safeSection(label, asyncFn)`. Failed section → `null` in the result, not a full 500. Nested try/catch on the error log itself prevents logging failures from cascading. `allSafe`/`firstSafe` add a second layer catching `no such table` errors specifically.

**Result**: a Debug Bundle generated during a partially-broken deployment returns 6/7 sections populated. The operator gets actionable evidence instead of a blank screen.

File: `worker/src/admin-debug-bundle.js` — `safeSection` (line ~52), `allSafe`/`firstSafe` (lines ~79–95), `Promise.all` dispatch (line ~126).

## Related

- [`admin-console-section-extraction-pattern`](admin-console-section-extraction-pattern-2026-04-27.md) — P2 predecessor: monolith extraction, hash routing, characterization-first testing
- [`sys-hardening-p2-13-unit-autonomous-sprint-learnings`](../workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md) — canonical SDLC orchestration pattern (P3 is the third application)
- [`hero-p0-read-only-shadow-subsystem`](hero-p0-read-only-shadow-subsystem-2026-04-27.md) — standalone module boundary pattern (Hero's provider pattern parallels P3's subject status providers)
- P3 completion report: `docs/plans/james/admin-page/admin-page-p3-completion-report.md`
- P3 advisory contract: `docs/plans/james/admin-page/admin-page-p3.md`
- P3 implementation plan: `docs/plans/2026-04-27-002-feat-admin-console-p3-command-centre-plan.md`
