# Admin Console P7 — Business Operations, Growth Analytics, and Readiness Closure Contract

**Status:** Proposed contract  
**Language:** UK English  
**Audience:** Product owner, engineering lead, and the next implementation-planning agent  
**Repository context:** `fol2/ks2-mastery`  
**Preceded by:** Admin Console P6 — Evidence Integrity, Content and Asset Operations Maturity

---

## 1. Purpose

P7 should be the final Admin phase before Admin work becomes feature-by-feature maintenance. P1 through P6 have turned Admin from an entry point and debugging surface into an evidence-backed operator console. P7 must now answer the business-owner question:

> Can I run the SaaS day to day — understand usage, spot growth/retention problems, triage support issues, see launch readiness honestly, and manage lightweight live operations — without reading logs or trusting misleading summary numbers?

P7 is not a request for a large implementation ticket list. It is a product and engineering contract. The next agent should use this document to produce its own implementation plan, with exact files, migrations, test units, sequencing, rollout notes, and PR boundaries.

---

## 2. Source-truth validation summary

P6 is directionally successful. It corrected the P5 truth gaps around evidence population, string redaction, ops-role browser proof, and panel freshness. It also matured Content and Asset Operations. However, the current source still shows several gaps that P7 must resolve before the console is described as fully business-ready.

### 2.1 Claims that appear valid

The following P6 claims are supported by current source shape:

- The evidence generator is now schema 3 and aggregates multiple source dimensions: capacity evidence, admin smoke, bootstrap smoke, CSP status, D1 migrations, build version, and KPI reconcile.
- The checked-in evidence summary is no longer empty; it has schema 3, a generated timestamp, a source manifest, capacity entries, CSP status, D1 migration count, and build version.
- Safe-copy now has a string redaction path and uses it before returning string copies.
- Marketing list freshness is no longer `null`; the Marketing section stores `refreshedAt` from the Worker response and passes it to `AdminPanelFrame`.
- Content Operations now has release readiness, validation blocker/warning signals, truthful clickability, and a content-quality-signal normaliser.
- Generic asset client routes exist in the hub API for draft save, publish, and restore.
- PR #550 was merged into `main`, and there were no open PRs at the time of this contract review.

### 2.2 Claims that need narrowing or correction

P7 must treat these as source-truth gaps, not as optional polish.

#### Gap A — Preflight evidence is being classified as certification evidence

`reports/capacity/latest-evidence-summary.json` currently includes `60-learner-stretch-preflight-20260428.json` under the key `certified_60_learner_stretch`, with `ok: false`. The capacity runbook explicitly says preflight rows are not certification evidence. The evidence generator currently classifies by filename pattern, so a preflight file with `60-learner` in its name can enter the certification lane.

This is not catastrophic because it fails rather than overclaims. But it pollutes the meaning of certification tiers. A preflight failure should be displayed as `preflight_60_learner_stretch`, not as a failed certification attempt.

#### Gap B — Missing evidence sources are not surfaced as metric rows

P6 says missing admin smoke, bootstrap smoke, and KPI reconcile are shown as `NOT_AVAILABLE`. The summary has a `sources` manifest that marks them as `found: false`, but the panel model currently builds rows only from `summary.metrics`. Because missing sources do not create metric entries, the React panel cannot show those missing sources as explicit rows unless it uses the `sources` manifest. The current panel renders the metric table but does not render the source manifest.

This means the operator may see a shorter table rather than an explicit “Admin smoke: Not available” row.

#### Gap C — Overall evidence state can hide higher-tier failures

The current overall-state function ranks “best passing tier” above failures once a passing row exists. That is understandable for certification display, but it is risky for an operations console. A smoke-pass should not make the overall panel look reassuring if the 30-learner classroom beta is currently failing. P7 should split evidence into lanes rather than rely on one global badge.

#### Gap D — Production smoke remains unrun in the P6 evidence trail

P6’s report and PR #550 both state that production smoke was not run in the session and should follow deployment. P7 must not treat P6 as production-verified. It should close the loop by making production smoke evidence a first-class, generated, committed or recorded artefact.

#### Gap E — CSP/style documentation is stale or inconsistent

P6 reports 32 inline styles extracted from Admin JSX, but the checked-in CSP inline-style inventory still reports the older total site count and older per-file counts. P7 should regenerate the inventory or reconcile the documentation. Until that happens, the style budget documentation is not a reliable source of truth.

#### Gap F — Operating docs have not fully caught up with P6

`docs/operating-surfaces.md` documents P1–P4/P5-era Admin capabilities well, but it does not yet describe the P6 evidence schema, content-quality-signal panel, or generic asset route implications in enough detail. It also still lists some older Worker API route summaries rather than the newer Admin route set.

#### Gap G — Asset preview URL and handler registry need firmer safety contracts

Asset Registry v1 exposes `previewUrl` in the registry model and renders it as an external link when present. P6 accepted a residual that the Worker does not currently set this field. P7 should close this before future assets start using previews: preview URLs must be server-allowlisted and client-normalised, and each asset handler must declare role requirements, mutation class, CAS fields, and audit behaviour.

#### Gap H — Some Debugging copy still implies old limitations

The error drawer still contains copy saying the occurrence timeline is aggregated and per-event history is deferred, while occurrence timelines have existed since P3/P4. This is small, but it is exactly the kind of wording drift that earlier Admin phases were meant to eliminate.

---

## 3. P7 product goal

P7 should make Admin useful as a business owner’s operating cockpit without weakening the learning-first and safety-first architecture.

The business owner should be able to:

1. See honest launch readiness and evidence state at a glance.
2. Understand real usage, activation, retention, and demo-to-account conversion trends.
3. Triage support incidents from account search through resolution without losing context.
4. Understand which content and subject areas are driving support load or poor learning outcomes.
5. Manage safe, lightweight Marketing and Live Ops messages with clear lifecycle evidence.
6. See what is deliberately not built yet: billing, full CRM, complex RBAC, scheduled auto-publish, and external analytics warehouse.

---

## 4. P7 contract outcomes

### Outcome A — Evidence Certification Closure

P7 must turn the Production Evidence panel from “schema 3 data exists” into “the operator cannot misunderstand readiness”.

Required product behaviour:

- Evidence is displayed in lanes: `smoke`, `capacity certification`, `capacity preflight`, `security posture`, `database/migration posture`, `build/deploy posture`, and `admin maintenance`.
- Missing sources are visible as rows with `Not available`, not hidden by omission.
- Preflight evidence never appears in a certified tier row.
- A failing certification run remains visible even if smoke evidence passes.
- The panel distinguishes `not available`, `stale`, `failing`, `smoke pass`, `provisional`, `certified`, and `preflight only` without using reassuring language for non-certifying evidence.
- Production smoke and bootstrap smoke results can be generated and consumed by the evidence summary pipeline.
- The evidence panel gives concrete operator action copy: “run admin smoke”, “run bootstrap smoke”, “rerun 30-learner certification”, “CSP still report-only”, “KPI reconcile evidence missing”.

Engineering boundaries:

- The generator must not classify solely by loose filename matching when the evidence payload has a stronger plan/decision field.
- Preflight detection must be explicit. File names containing `preflight` should be excluded from certification lanes even if they include learner counts.
- Missing-source entries must be represented either as generated metric rows or rendered directly from the source manifest. The implementation plan must choose one and test it.
- Evidence summaries should remain static/deploy-time unless a future plan introduces secure runtime evidence generation.

Acceptance requirements:

- Unit tests prove preflight files cannot become `certified_30`, `certified_60`, or `certified_100` rows.
- Unit tests prove missing admin smoke, bootstrap smoke, and KPI reconcile appear as `Not available` rows.
- UI tests prove a failing 30-learner certification and a passing admin smoke can appear together without the overall panel implying classroom readiness.
- Production smoke evidence is generated in a shape the summary generator can consume.
- The capacity runbook and evidence panel agree on what is certified, provisional, failed, or preflight-only.

### Outcome B — Business KPIs and Growth Analytics v1

P7 should add owner-facing SaaS analytics, but keep them lightweight and query-bounded.

Required product behaviour:

- Show real-account and demo-account counts separately.
- Show demo session starts, demo resets, demo conversions, and conversion rate over 7 and 30 days where data exists.
- Show active accounts and active learners over 1, 7, and 30 days.
- Show retention cohorts in a simple first version: new accounts this week, returned within 7 days, returned within 30 days.
- Show practice engagement by subject: starts, completions, and recent activity where the data model supports it.
- Show support friction indicators: accounts with repeated errors, repeated denials, payment holds, suspended accounts, and unresolved support incidents once incidents exist.
- Every metric must state whether it includes demo data, real accounts, or both.

Engineering boundaries:

- Do not introduce a full analytics warehouse in P7.
- Avoid unbounded scans over `event_log`, `practice_sessions`, or `mutation_receipts`. Use indexed bounded windows or pre-aggregated counters.
- Business KPI queries must be manually refreshed or lazily loaded; no polling dashboard.
- Raw child identifiers and internal notes must not appear in business KPI rows.

Acceptance requirements:

- KPI definitions are documented in code comments and operator docs.
- Real/demo split is enforced in the API response shape, not only labelled in the UI.
- Empty states distinguish “no data yet” from “endpoint failed”.
- Tests prove demo rows cannot inflate real conversion/retention counts.
- Capacity telemetry or query-budget evidence exists for the new KPI route(s).

### Outcome C — Support Queue and Incident Triage v1

P3–P6 made it possible to debug an individual account. P7 should make it possible to manage a support incident lifecycle.

Required product behaviour:

- Admin can create an internal support incident from account detail, Debug Bundle, or error event detail.
- Incidents have a small lifecycle: `open`, `investigating`, `waiting_on_parent`, `resolved`, `ignored`.
- Incidents can link to account id, learner id, error fingerprint, error event id, denial id, marketing message id, and free-text operator notes.
- Incident notes must have safe-copy controls and redaction rules aligned with existing safe-copy audiences.
- Account detail shows recent incidents and open incident count.
- Debug Bundle can include linked incidents in an admin-only section, with ops-safe redaction where appropriate.
- Resolved incidents keep an audit trail but do not mutate learner progress, subject mastery, account status, or marketing messages.

Engineering boundaries:

- This is not a full CRM. No email sending, no external helpdesk integration, no SLA automation, and no parent-facing ticket portal in P7.
- Incident notes are internal. They must never be shown to parent accounts.
- Avoid attaching raw request bodies, cookies, session ids, or full stack traces to incidents.
- Incident mutations must use existing idempotent mutation receipt patterns.

Acceptance requirements:

- Admin can create, update status, add note, and link evidence to an incident.
- Ops can view redacted incident summaries if allowed by the existing admin/ops model, but cannot see internal notes unless explicitly authorised by the contract.
- Tests prove parent accounts cannot access incident endpoints.
- Tests prove incident links do not expose full session ids or raw learner identifiers in ops-safe views.
- Debug Bundle includes incident references without breaking the existing seven-section bundle contract.

### Outcome D — Account Lifecycle and Commercial Placeholders

P7 should add the minimum business-account lifecycle needed for SaaS operations, without building billing.

Required product behaviour:

- Account detail should show a commercial lifecycle panel with placeholder-safe fields such as plan label, trial/demo status, account age, last active, conversion source if known, payment hold, suspension, and cancellation placeholder.
- The UI should make clear which fields are operationally enforced and which are business notes only.
- Payment hold and suspended account semantics must remain as defined by the existing auth boundary.
- No billing provider integration is required.
- No invoices, payments, taxation, or subscription automation should be built in P7.

Engineering boundaries:

- Do not add a complex role or permission layer. Keep `admin` and `ops`, but define a future capability matrix in documentation.
- Do not make commercial placeholders enforce access unless the existing `ops_status` contract says they should.
- Any new lifecycle mutations must be CAS-guarded and audited.

Acceptance requirements:

- Account lifecycle panel is safe to show to the business owner without implying unsupported billing features.
- `payment_hold` and `suspended` behaviour remains unchanged and tested.
- Last-admin and self-lockout protections remain intact.
- Docs explain what is enforced now and what is only future billing metadata.

### Outcome E — Marketing and Live Ops v1 Analytics, Not Campaign Engine Bloat

Marketing V0 is now safe and honest. P7 should add measurement and operator clarity before building heavier campaign features.

Required product behaviour:

- Marketing list/detail should show message lifecycle history, published time, paused/archived time where available, and broad-audience confirmation evidence.
- Show current active messages and whether they are visible to signed-in users.
- Show basic delivery/engagement counters only if they can be captured safely and bounded: impressions, dismissals, active-window hits, and error/fetch failures. If these counters are not implemented, the UI must say “not tracked yet”.
- Scheduled still means “manual publish required” unless P7 explicitly adds Worker/Cron authority.

Engineering boundaries:

- Do not build per-child targeting in P7.
- Do not build reward manipulation, Hero Coins, XP multipliers, or learning-economy events in Admin P7.
- Do not add automatic scheduled publish unless the implementation plan includes a Worker/Cron design, idempotent publish receipts, broad-audience confirmation carry-forward, rollback/pause safety, and smoke coverage.
- Marketing content must remain schema-bound and restricted-Markdown only. No raw HTML, CSS, or JavaScript authoring.

Acceptance requirements:

- Marketing lifecycle history is visible and audited.
- Any analytics counters are clearly labelled as tracked or not tracked.
- Manual-publish semantics remain unambiguous in UI and Worker responses.
- Broad-audience transitions remain confirmed and tested.

### Outcome F — Content and Learning Quality Analytics v1

P6 introduced content quality signals. P7 should use them to give the business owner a learning-quality view, not just operational content status.

Required product behaviour:

- Content section should surface cross-subject quality signals in a compact summary: coverage, common misconceptions, high-wrong-rate items/templates, validation blockers, and subjects with no signal coverage yet.
- Subject rows must distinguish “good learning signal”, “no data yet”, “signal unavailable”, and “content validation blocked”.
- The business owner should be able to answer: “Which subject/content area needs attention first?”
- Links from content quality rows should deep-link to real diagnostics only when they exist.

Engineering boundaries:

- Subject engines remain owners of pedagogy, scheduling, and mastery evidence.
- Admin must not mutate subject mastery directly.
- Admin must not import subject content datasets directly into UI leaves.
- Placeholder subjects must not fabricate quality signals.

Acceptance requirements:

- Content quality signal rows are truthful for live, gated, and placeholder subjects.
- Tests prove unavailable signal data renders as unavailable, not zero.
- Tests prove no subject content bundles are imported into admin leaf modules.
- Punctuation/Grammar/Spelling signal semantics are documented enough for future subject providers to implement the same contract.

### Outcome G — Security, Privacy, and Documentation Closure

P7 must finish the documentation and safety cleanup created by P6.

Required product behaviour:

- Operator docs match current Admin capabilities, route names, evidence semantics, and limitations.
- CSP inline-style inventory is regenerated and agrees with source counts after P6.
- Stale Debugging copy is removed or corrected.
- Safe-copy rules are documented as the official clipboard boundary.
- Generic asset handler rules are documented before more asset categories are added.

Engineering boundaries:

- No new raw clipboard usage in Admin surfaces.
- No raw CSS/HTML/JS authoring in Admin.
- No server-provided URL may be rendered as a clickable link without an allowlist/sanitisation contract.
- No new public ingest endpoint without rate limit, body cap, redaction, and abuse telemetry.

Acceptance requirements:

- Docs updated: operating surfaces, Worker route table, CSP inventory, evidence/capacity docs, and Admin phase report errata if needed.
- Tests or static checks catch reintroduction of raw clipboard usage.
- Static or unit tests prove asset preview URLs reject `javascript:`, `data:`, protocol-relative URLs, and unapproved origins before rendering.
- A style inventory test proves the checked-in CSP inventory is current.

---

## 5. Permission model contract

P7 should not introduce a full permission system. The current roles remain:

- `admin`
- `ops`
- `parent`

P7 may add a capability matrix document and lightweight code metadata to prepare future roles, but it must not implement a complex RBAC layer unless a later contract explicitly calls for it.

Minimum P7 capability expectations:

- Admin can mutate account ops metadata, account lifecycle placeholders, incident status, marketing messages, and asset registry entries where existing contracts allow.
- Ops can view operational data with redactions and without mutation controls except where existing behaviour explicitly allows read-only diagnostics.
- Parent cannot access Admin endpoints.
- Payment-held accounts can read but cannot mutate where the existing `ops_status` contract says so.
- Suspended accounts remain blocked by the auth boundary.

---

## 6. Data and storage posture

The next implementation plan must decide whether P7 needs new tables. The product contract allows new durable storage for support incidents and business KPI snapshots, but only if the implementation plan proves the data cannot be derived safely and cheaply from existing tables.

Likely new table family:

```text
admin_support_incidents
admin_support_incident_notes
admin_support_incident_links
```

Possible derived/counter table extension:

```text
admin_business_kpi_metrics
```

Storage requirements:

- All new mutation tables need idempotency or mutation receipt integration.
- Notes and links must avoid raw tokens, raw request bodies, and full session ids.
- Retention policy must be stated, even if the first version keeps incidents indefinitely.
- Indexes must support the intended account, learner, status, and date filters.
- Demo and real data must remain distinguishable.

---

## 7. Production and smoke evidence contract

P7 is not complete unless it produces evidence, not just code.

Required evidence:

- Unit/integration test summary.
- Browser test summary for at least one admin and one ops flow touched by P7.
- Admin production smoke output after deploy, or a documented reason it was not run.
- Evidence summary regenerated after production smoke and committed or attached according to repo convention.
- Capacity or query-budget evidence for any new analytics route.
- Documentation update list.

If production smoke is not run, the completion report must not claim production readiness. It must say “not production-smoke-verified”.

---

## 8. Non-goals

P7 must not accidentally become a larger product expansion.

Explicit non-goals:

- Full billing/subscription integration.
- External CRM/helpdesk integration.
- Complex role hierarchy or organisation/team model.
- WebSocket/realtime dashboard.
- Analytics warehouse or third-party analytics migration.
- Per-child marketing personalisation.
- Scheduled auto-publish unless explicitly designed and tested in the implementation plan.
- Reward economy operations, Hero Coins, XP multipliers, streak pressure, or loot-box mechanics.
- Raw HTML/CSS/JS authoring in Admin.
- Subject engine merge.
- Direct Admin mutation of subject mastery evidence.

---

## 9. Suggested implementation slices for the next agent to consider

This is not a ticket plan, but these are natural slices the implementation planner may choose from.

1. Evidence generator and panel correctness: preflight split, missing-source rows, multi-lane display, production smoke evidence ingestion.
2. Documentation/source-truth closure: operating surfaces, route docs, CSP inventory, stale Debugging copy, P6 errata.
3. Business KPI read model: real/demo usage, activation, retention, conversion, subject activity, query budget.
4. Support incident lifecycle: tables, routes, account detail integration, Debug Bundle linkage, safe-copy note handling.
5. Account lifecycle/commercial placeholders: account detail panel and audited CAS mutations where needed.
6. Marketing lifecycle analytics: tracked/not-tracked clarity, lifecycle history, active message visibility, no campaign bloat.
7. Content quality analytics polish: source availability, drilldowns, subject-provider contract docs.
8. Security hardening closure: asset preview URL allowlist, asset handler capability registry, static checks.

The implementation plan should sequence evidence/documentation closure first, because P7 depends on a truthful operator console.

---

## 10. Definition of done

P7 is done when:

- Evidence lanes cannot overclaim certification or hide missing sources.
- Preflight runs are never displayed as certification attempts.
- Production smoke evidence is integrated or explicitly marked unavailable.
- Business KPIs show real/demo split, activation, retention, conversion, and subject engagement without unbounded queries.
- Support incidents can be created, linked, triaged, and resolved internally.
- Account lifecycle/commercial placeholders are visible without implying billing automation.
- Marketing lifecycle analytics are honest and bounded.
- Content quality signals help identify what needs attention first.
- Docs, CSP inventory, route docs, and stale UI copy agree with current source.
- Admin remains safe: no raw clipboard, no raw HTML/CSS/JS authoring, no unallowlisted preview URLs, no direct subject mastery mutation.
- Completion evidence includes tests, browser proof for touched flows, and production-smoke status.

---

## 11. After P7

After P7, stop running Admin as a numbered phase chain. The Admin Console should be considered mature enough to grow with product features.

Future work should follow this rule:

> Every new business, subject, reward, billing, marketing, or support feature brings its own Admin slice as part of that feature’s contract.

If a future feature needs Admin controls, that feature contract should define the Admin read model, mutation safety, role behaviour, tests, and smoke evidence. Do not create P8 simply because there is more Admin work possible.
