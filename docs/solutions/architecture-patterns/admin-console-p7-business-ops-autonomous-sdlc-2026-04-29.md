---
module: admin-ops-console
date: "2026-04-29"
problem_type: architecture_pattern
component: development_workflow
severity: high
tags:
  - "admin-console"
  - "autonomous-sdlc"
  - "parallel-workers"
  - "worktree-isolation"
  - "evidence-certification"
  - "business-kpi"
  - "support-incidents"
  - "schema-mismatch-class"
applies_when: "Executing a large multi-unit implementation plan (8+ units) autonomously using parallel subagent workers with independent review cycles and isolated worktrees"
---

# Admin Console P7 — Business Operations Cockpit via Autonomous SDLC

## Context

P7 is the final numbered Admin Console phase, transforming the console from an operator debugging surface into a business-owner's daily operating cockpit. The implementation plan contained 12 units spanning evidence certification, business KPIs, support incidents, account lifecycle, marketing analytics, content quality, and security hardening.

The challenge: execute a 12-unit plan fully autonomously without regression, with the main repo working directory untouched, and produce a merged, production-ready result.

## Guidance

### Autonomous SDLC Wave Pattern

The 12 units were grouped into 5 dependency-ordered waves:

| Wave | Units | Parallelism | Theme |
|------|-------|-------------|-------|
| 1 | U1+U2+U3, U4, U11 | 3 workers | Evidence closure + docs + security |
| 2 | U5, U9, U10 | 3 workers | Business tab + marketing + content |
| 3 | U6+U8 | 1 worker | Schema + incident API + account lifecycle |
| 4 | U7 | 1 worker | Incident UI (depends on U5 shell + U6 API) |
| 5 | U12 | 1 worker | Completion evidence + report |

Each wave followed the cycle: **implement → review → fix → merge → next wave**.

### Schema Mismatch Detection is the Critical Review Value

The review cycle caught **14 findings**, of which **7 were HIGH severity schema mismatches** that would have caused silent runtime failures:

1. Wrong table name (`accounts` vs `adult_accounts`)
2. ISO string compared against INTEGER epoch columns
3. Wrong column name (`value` vs `metric_count`)
4. Non-existent column references (`account_id` on practice_sessions, `created_at` on ops_error_events and admin_request_denials)
5. Missing migration columns (`paused_at`, `archived_at`)

**Pattern:** `safeSection` wrapping + mock-based tests create a dangerous combination — schema errors are silently swallowed at runtime (the panel shows "No data yet") and pass tests (mocks don't enforce schema). Only a reviewer who cross-references the actual migration DDL catches these.

### Worker Isolation via Worktrees

Each wave's workers operated in isolated git worktrees branched from `origin/main`:
- Workers never touched the main checkout
- Each worker produced its own PR from its worktree
- After merge, old worktrees were cleaned and new ones created from the updated main
- This prevents cross-worker conflicts and keeps the user's working directory pristine

### Evidence Certification Lane Architecture (U1+U2+U3)

The key architectural decision: evidence displayed in **7 independent lanes** rather than a single global badge. This prevents a passing smoke from hiding a failing certification.

Critical implementation detail: `classifyTier()` is called BEFORE `classifyEvidenceKind()` in the pipeline, so the preflight guard must use **filename regex** (`/preflight/i.test(fileName)`), not `data.evidenceKind` which hasn't been computed yet. The initial implementation got this wrong — the reviewer caught it.

### D1 CAS Discipline (reinforced by U6)

Every write endpoint in P7 follows the established pattern:
- `batch()` never `withTransaction` (production no-op on D1)
- `AND row_version = ?` in UPDATE WHERE clause
- Check `meta.changes === 0` to detect CAS conflict → return 409
- Auto-refresh on 409 so client sees current state

### Business KPI Query Architecture (U5)

Real/demo split uses `COALESCE(account_type, 'real') <> 'demo'` — the `account_type` column on `adult_accounts`, NOT `is_demo` (which only exists on telemetry tables). All time-window comparisons use epoch-ms integers (not ISO strings) because D1 columns are INTEGER type.

Existing `admin_kpi_metrics` counters (maintained by cron) are read first; bounded time-window queries supplement only what isn't counter-tracked.

## Why This Matters

1. **Silent failures are the default failure mode** when `safeSection` + mocks combine. Without schema-aware reviews, KPI panels ship showing "No data yet" forever.

2. **Parallel execution at wave boundaries** reduces wall-clock time by ~60% compared to sequential unit-by-unit execution — 5 waves instead of 12 sequential PRs.

3. **The review cycle is non-optional** for schema-touching work. P7 proved that even well-prompted workers produce schema mismatches at a ~50% rate when the data model is non-trivial. Reviews caught all 7 before they reached production.

4. **Worktree isolation prevents the "main directory is dirty" class of issues** that earlier phases encountered when workers operated on the same checkout.

## When to Apply

- Multi-unit implementation plans (8+ units) with dependency ordering
- Plans touching D1 schema (new tables, new columns, new routes)
- Plans where multiple workers will operate in parallel
- Any work where the user's main repo checkout must remain untouched
- Large phases where token context conservation matters (scrum-master pattern delegates to workers rather than implementing directly)

## Examples

**Wave-based parallelism decision:** Units U1+U2+U3 (evidence) share no files with U4 (docs) or U11 (security). They were parallelised in Wave 1. Units U7 (incident UI) depends on both U5 (business tab shell) and U6 (incident API), so it ran alone in Wave 4 after both prerequisites merged.

**Schema mismatch caught by review:**
```javascript
// WRONG — worker wrote this (table doesn't exist, column is INTEGER not string)
const result = await db.prepare(
  `SELECT COUNT(*) as cnt FROM accounts WHERE created_at >= ?`
).bind(daysAgoIso(7)).first();

// CORRECT — after review fix
const result = await db.prepare(
  `SELECT COUNT(*) as cnt FROM adult_accounts WHERE created_at >= ?`
).bind(daysAgoMs(7)).first();
```

**Migration shared across units:** U6 and U8 both needed migration 0015. U8 was made dependent on U6 (which creates the file), and U8 appends its ALTER TABLE to the same migration. The plan explicitly captured this dependency to prevent parallel workers from creating conflicting files.
