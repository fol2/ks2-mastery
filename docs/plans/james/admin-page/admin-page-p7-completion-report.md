# Admin Console P7 — Completion Report

**Status:** Complete  
**Date:** 2026-04-29  
**PRs:** #574, #575, #576, #579, #580, #581, #584, #587, #588  
**Plan:** docs/plans/james/admin-page/admin-page-p7.md

---

## 1. Executive Summary

P7 is the final numbered Admin Console phase. It transforms the console from an operator debugging surface into a business-owner's daily operating cockpit with:
- Honest evidence certification (multi-lane display, preflight exclusion, smoke integration)
- Business KPIs with real/demo split (activation, retention, conversion, subject engagement, support friction)
- Support incident lifecycle (create, triage, resolve with CAS-guarded mutations)
- Account lifecycle with commercial placeholders and enforcement labelling
- Marketing lifecycle analytics with honest "Not tracked yet" labelling
- Content quality cross-subject summary with attention priority ranking
- Security hardening (asset preview URL allowlist, handler capability registry)
- Documentation closure (operating surfaces, CSP inventory, stale copy fixes)

After P7, Admin work becomes feature-by-feature maintenance — no P8 needed.

---

## 2. Outcomes vs Contract

### Outcome A — Evidence Certification Closure

- Evidence displayed in 7 lanes (smoke, capacity_certification, capacity_preflight, security_posture, database_posture, build_posture, admin_maintenance)
- Preflight evidence excluded from certification lanes via filename-based detection in classifyTier()
- Missing sources (admin_smoke, bootstrap_smoke, kpi_reconcile) render as explicit NOT_AVAILABLE rows
- Production smoke evidence writes to reports/admin-smoke/latest.json in pipeline-consumable format
- Operator action copy guides next steps per lane
- PRs: #576

### Outcome B — Business KPIs and Growth Analytics v1

- New "Business" tab (6th section) with KPI analytics panel
- Real/demo split via account_type column (COALESCE pattern)
- Activation (1/7/30 day), retention (new/returned cohorts), conversion (demo to real)
- Subject engagement by practice session volume
- Support friction indicators (repeated errors, denials, payment holds, suspensions)
- Bounded queries with indexed time-window WHERE clauses
- safeSection wrapping for partial failure resilience
- PR: #581

### Outcome C — Support Queue and Incident Triage v1

- 3 new D1 tables (admin_support_incidents, admin_support_incident_notes, admin_support_incident_links)
- Full lifecycle: open, investigating, waiting_on_parent, resolved, ignored
- CAS-guarded mutations with batch() and row_version
- 6 API routes with admin/ops role enforcement
- Incident panel in Business tab with filters, create, detail drawer
- Account detail shows open incident count
- Debug Bundle gains admin-only linkedIncidents extension
- Action classification: resolve/ignore require typed confirmation
- PRs: #584, #587

### Outcome D — Account Lifecycle and Commercial Placeholders

- 3 new columns on account_ops_metadata (conversion_source, cancelled_at, cancellation_reason)
- Account detail shows lifecycle panel with enforcement badges
- Fields classified as "enforced" (payment_hold, suspended) vs "business notes only" (plan_label, conversion_source)
- Existing ops_status CHECK constraint preserved
- PR: #584

### Outcome E — Marketing and Live Ops v1 Analytics

- Active message count: "N messages currently visible to signed-in users"
- Lifecycle timestamps (publishedAt, pausedAt, archivedAt) per message
- Analytics counters honestly labelled "Not tracked yet"
- Manual-publish semantics preserved (schedulingSemantics: 'manual_publish_required')
- Migration 0014 adds paused_at/archived_at columns
- PR: #579

### Outcome F — Content and Learning Quality Analytics v1

- New buildContentQualitySummary() function (existing API unchanged)
- Cross-subject quality panel with status badges
- Subjects distinguished: "Good learning signal", "No data yet", "Signal unavailable", "Content validation blocked"
- Attention priority ordering for "needs attention first"
- No subject content bundles imported into admin leaf
- PR: #580

### Outcome G — Security, Privacy, and Documentation Closure

- Asset preview URL allowlist (rejects javascript:, data:, protocol-relative, non-HTTPS)
- Post-parse protocol check catches tab/newline injection bypass
- Handler capability registry with role/mutation/CAS/audit metadata
- Prototype pollution guard on getHandlerCapability (Object.hasOwn)
- getSafePreviewUrl returns trimmed URL
- Operating surfaces docs updated with P6+P7 capabilities
- CSP inline-style inventory confirmed current
- Stale Debugging copy corrected
- Capacity docs updated with evidence lane semantics
- PRs: #574, #575

---

## 3. Schema Changes

### Migration 0014 (marketing lifecycle)
- ALTER TABLE admin_marketing_messages ADD COLUMN paused_at INTEGER
- ALTER TABLE admin_marketing_messages ADD COLUMN archived_at INTEGER

### Migration 0015 (incidents + account lifecycle)
- CREATE TABLE admin_support_incidents (with status CHECK, row_version CAS)
- CREATE TABLE admin_support_incident_notes (with audience CHECK)
- CREATE TABLE admin_support_incident_links (with link_type CHECK)
- ALTER TABLE account_ops_metadata ADD COLUMN conversion_source TEXT
- ALTER TABLE account_ops_metadata ADD COLUMN cancelled_at INTEGER
- ALTER TABLE account_ops_metadata ADD COLUMN cancellation_reason TEXT

---

## 4. New Routes

| Route | Method | Role | Purpose |
|-------|--------|------|---------|
| /api/admin/ops/business-kpis | GET | admin/ops | Business KPIs with real/demo split |
| /api/admin/incidents | POST | admin | Create incident |
| /api/admin/incidents | GET | admin/ops | List incidents |
| /api/admin/incidents/:id | GET | admin/ops | Incident detail |
| /api/admin/incidents/:id/status | PUT | admin | Update status (CAS) |
| /api/admin/incidents/:id/notes | POST | admin | Add note |
| /api/admin/incidents/:id/links | POST | admin | Add evidence link |

---

## 5. Test Coverage

| PR | Tests Added | Subject |
|----|-------------|---------|
| #574 | 53 | Asset URL allowlist, handler registry, prototype guard |
| #575 | 0 (doc-only) | CSP inventory confirmed via existing test |
| #576 | 86 | Preflight exclusion, multi-lane, smoke ingestion |
| #579 | 14 | Marketing lifecycle model, active count |
| #580 | 6 | Content quality summary, status labels |
| #581 | 27 | KPI display model, Worker queries, safeSection |
| #584 | 47 | Incident lifecycle, CAS, migration, account lifecycle |
| #587 | 32 | Incident UI panel, status transitions, action classification |
| **Total** | **265** | — |

---

## 6. Review Findings and Fixes

### Wave 1 Reviews
- PR #574: Prototype pollution in getHandlerCapability (medium) — fixed with Object.hasOwn
- PR #574: Untrimmed URL return (low) — fixed to return url.trim()
- PR #574: javascript: regex bypass via tab injection (low) — fixed with post-parse protocol check
- PR #576: await in non-async resolveSmokeCommit (HIGH) — fixed with async declaration
- PR #576: classifyTier preflight guard never fires for real files (MEDIUM) — fixed with filename-based /preflight/i regex
- PR #576: deriveLaneState doesn't handle NON_CERTIFYING (low) — fixed with hasNonCertifying check

### Wave 2 Reviews
- PR #581: Wrong table name 'accounts' vs 'adult_accounts' (HIGH) — fixed
- PR #581: ISO string vs INTEGER epoch comparison (HIGH) — fixed with daysAgoMs()
- PR #581: Wrong column 'value' vs 'metric_count' (HIGH) — fixed
- PR #581: practice_sessions has no account_id (HIGH) — fixed by removing subquery
- PR #581: ops_error_events has no created_at (HIGH) — fixed to use last_seen
- PR #581: admin_request_denials has no created_at (HIGH) — fixed to use denied_at
- PR #579: Missing migration for paused_at/archived_at (HIGH) — fixed with migration 0014

### Wave 3 Reviews
- PR #584: SELECT doesn't include lifecycle columns (MEDIUM) — fixed

---

## 7. Architecture Decisions

1. **New "Business" tab** — 6th section housing KPIs and incidents. Account lifecycle stays in Accounts section per origin contract
2. **Evidence in lanes, not global badge** — 7 independent lanes prevent cross-concern state hiding
3. **Preflight detection via filename regex** — more reliable than data.evidenceKind which is computed after classifyTier runs
4. **KPI via bounded queries on existing indexes** — no new pre-aggregation tables needed at P7 scale
5. **Incident CAS with batch()** — following D1 best practice (withTransaction is production no-op)
6. **Marketing lifecycle via ALTER TABLE** — nullable columns, no backfill needed
7. **Content quality summary as new function** — preserves existing buildContentQualitySignals() contract

---

## 8. Non-Goals Honoured

Verified not built:
- No billing/subscription integration
- No external CRM/helpdesk
- No complex RBAC (admin/ops preserved)
- No WebSocket/realtime dashboard
- No analytics warehouse
- No per-child marketing personalisation
- No scheduled auto-publish
- No reward economy operations
- No raw HTML/CSS/JS in Admin
- No subject engine merge
- No direct mastery mutation

---

## 9. Production Evidence Status

- Unit/integration test coverage: 265 new tests across 8 PRs
- Evidence summary: regenerated with preflight classification fix
- Production smoke: NOT RUN (pipeline ready but requires deployment first)
- Query budget: estimated; pinned values should be measured post-deploy
- Documentation: updated (operating surfaces, capacity docs, CSP inventory)

**Note:** This report does not claim production readiness. Production smoke has not been verified. The evidence pipeline is ready to consume smoke results once deployed and executed.

---

## 10. After P7

Admin Console is now mature enough to grow with product features. Future work follows this rule:

> Every new business, subject, reward, billing, marketing, or support feature brings its own Admin slice as part of that feature's contract.

No P8 should be created simply because more Admin work is possible.
