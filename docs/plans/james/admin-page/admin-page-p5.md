# Admin Console P5 — Operator Readiness, Evidence, and QoL Contract

**Status:** Proposed next phase after Admin Console P4  
**Intended location:** `docs/plans/james/admin-page/admin-page-p5.md`  
**Audience:** next product/engineering agent  
**Document type:** product + engineering contract, not an implementation ticket plan  
**Date:** 2026-04-28  

---

## 1. Purpose

Admin P1 through P4 created a five-section command centre for the business owner: Overview, Accounts, Debugging & Logs, Content, and Marketing / Live Ops. P4 specifically made the console more truthful by fixing source/report/UI drift, wiring Marketing end-to-end, correcting Debug Bundle identifiers, correcting request-denial filters, and expanding production smoke coverage.

P5 must not be another broad feature expansion phase.

P5 is the phase where Admin becomes dependable under real operating pressure: a parent reports a bug, the owner opens Admin, sees whether production evidence is fresh, follows a clear debugging flow, copies a safe evidence packet, and avoids accidental customer-facing or learner-state mutations.

The product goal is:

> The operator can trust the Admin Console during a live support/debugging incident without reading source code, guessing which panel is stale, or accidentally performing a high-impact mutation.

The engineering goal is:

> Admin surfaces share consistent freshness/error/copy/confirmation/refactor patterns, have browser-level proof for the main support flow, and expose production readiness state honestly without over-claiming certification.

---

## 2. Baseline after P4

P5 starts from these assumptions, which the next agent must re-verify against `main` before planning implementation units:

1. Admin is directly reachable at `/admin` with hash section deep-linking.
2. Admin has five live sections: Overview, Accounts, Debugging & Logs, Content, Marketing.
3. Marketing is no longer a placeholder. It supports announcement and maintenance message lifecycle through Worker-backed routes.
4. Debugging has four extracted panels:
   - error timeline / error log centre
   - request denials
   - Debug Bundle
   - learner support
5. Debug Bundle accepts separate `errorFingerprint` and `errorEventId` concepts.
6. Request-denial filters use canonical denial reason codes.
7. Account search and account detail exist.
8. Content has a cross-subject overview and Asset & Effect Registry wrapper over Monster Visual Config.
9. Production admin smoke covers the current command-centre flow.
10. No complex permission system is required yet. Current roles remain `admin`, `ops`, and `parent`.

P5 must preserve the P1–P4 invariants unless the implementation plan explicitly proves a safe replacement.

---

## 3. Product problem to solve

The Admin Console is now powerful, but a powerful console can still fail the business if:

- the operator cannot tell whether a panel is stale;
- a “scheduled” live-ops message sounds as if it will auto-publish when the system does not actually have an auto-publisher;
- the Debug Bundle is technically correct but not easy to use during a real parent complaint;
- copy/export leaks internal notes or child identifiers to the wrong audience;
- destructive QA tools look too casual;
- Content Management groups many panels but does not guide the operator to the right subject/action;
- production readiness is hidden in docs and scripts instead of visible in Admin;
- inline styles, duplicated panel logic, and large section components keep accumulating UI debt.

P5 must focus on those operator-product risks.

---

## 4. P5 theme

**Theme:** Operator Readiness & Evidence QoL

P5 should feel boring in a good way. The operator should gain confidence, not more buttons.

A good P5 result is not “Admin has lots of new features.”  
A good P5 result is “Admin is easier to trust, easier to debug with, and harder to misuse.”

---

## 5. Non-goals

P5 must not attempt these unless the implementation plan explicitly narrows them into a tiny safety slice:

- no full CMS/editorial workflow;
- no rich marketing audience targeting beyond existing V0 audiences;
- no automated campaign/reward system;
- no billing/subscription suite;
- no organisation/team/role matrix beyond current `admin` / `ops` placeholder semantics;
- no WebSocket/realtime dashboard;
- no analytics warehouse;
- no Hero Mode child UI, Coins, Hero Camp, or reward economy build-out;
- no subject mastery mutation from Admin except existing, explicitly admin-gated diagnostic/QA tools.

Hero Mode, if referenced at all, should appear only as a future read-only operational surface or a contract link. It should not be built inside Admin P5.

---

## 6. Product requirements

### PR-1 — Unified panel freshness and failure frame

All Admin panels that load or refresh server data must use a consistent product language for:

- generated/refreshed timestamp;
- refresh button;
- loading state;
- stale data warning;
- last successful refresh;
- narrow refresh failure;
- retry action;
- empty state;
- partial failure state, where applicable.

The operator must be able to answer, for every major panel:

1. When was this data generated?
2. Is this the latest successful result?
3. Did the latest refresh fail?
4. Can I retry from here?
5. Is “empty” a real empty state or a failed load?

This should be expressed as a shared Admin panel frame/pattern, not as another set of one-off banners.

Existing `PanelHeader` can be extended or replaced, but P5 must avoid copy/paste panel state logic.

### PR-2 — Operational evidence panel

Overview should gain an operator-facing “Production Evidence” or “System Readiness” panel.

This panel must be honest and conservative. It should not claim “ready” unless the repository has current evidence.

At minimum it should surface:

- latest admin production smoke status;
- latest bootstrap/capacity smoke status if available;
- capacity certification tier, using the repo’s existing taxonomy;
- CSP status: report-only, enforcing, or unknown;
- D1 migration state if safely available;
- current build/release identifier;
- last KPI reconciliation success/failure;
- whether evidence is missing, stale, provisional, or certified.

Product language must distinguish:

- “not measured”
- “smoke passed”
- “small-pilot provisional”
- “certified”
- “failing”
- “unknown”

The panel must not read random local files in production. The implementation plan must choose a safe evidence source, such as Worker-produced records, a checked-in latest evidence JSON summary, a narrow endpoint, or a manually updated operational metric. If the evidence source is not available yet, P5 may ship the panel with honest “not available / not certified” states and a clear contract for future wiring.

### PR-3 — Debug Bundle browser workflow

P4 added unit/smoke coverage for Debug Bundle. P5 must add browser-level proof for the real operator flow.

The core flow:

1. Open `/admin#section=debug`.
2. Search or prefill from an account/error context.
3. Generate a Debug Bundle.
4. Confirm section rendering.
5. Copy safe human summary.
6. Admin-only: copy JSON.
7. Confirm ops-role redaction prevents sensitive export.

The browser test should prove the workflow that the owner actually uses, not just endpoint response shapes.

### PR-4 — Safe copy framework

Admin has multiple copy needs now:

- Debug Bundle summary;
- Debug Bundle JSON;
- account support summary;
- error fingerprint / event ID;
- marketing preview text;
- production evidence summary.

P5 must define and implement a shared safe-copy policy.

The policy must distinguish:

- internal/admin-only copy;
- ops-safe copy;
- parent/support-safe copy;
- public/marketing preview copy.

Safe copy must enforce redaction before writing to clipboard. It must never rely on “the operator will manually remove secrets.”

Minimum redaction expectations:

- no cookies;
- no auth tokens;
- no raw request bodies;
- no full child identifiers in parent-safe output;
- no internal notes in ops-safe or parent-safe output;
- no raw stack traces in parent-safe output;
- no email address in parent-safe output unless explicitly confirmed and product-justified.

### PR-5 — Support incident flow

Admin must support one concrete incident workflow from start to finish:

> “A parent says their child could not continue practice / saw a bug / got blocked.”

The operator must be able to:

1. Search account by email or account ID.
2. Open account detail.
3. See linked learners, recent errors, recent denials, and recent mutations.
4. Jump to Debug Bundle with account context prefilled.
5. Generate bundle.
6. Copy a safe summary.
7. See whether production evidence or capacity state may explain the issue.
8. Return to the account detail without losing the context.

This workflow should become the primary acceptance path for Admin P5.

### PR-6 — Marketing scheduling truth

P4 made Marketing live, but P5 must make scheduling semantics impossible to misread.

The contract must choose one of two product truths:

**Option A — no auto-publish in P5.**  
Then “scheduled” must be described as “staged for a future window; not auto-delivered until published” or equivalent. The UI must not imply that scheduling alone will show a banner to users. Any broad-audience scheduled message still needs confirmation, but the operator must understand that publication is manual.

**Option B — add auto-publish.**  
Then P5 must define the Worker/Cron/Durable Object authority, race handling, CAS/idempotency, audit receipt, smoke coverage, and rollback path.

Recommendation: choose Option A for P5 unless there is a strong reason to add scheduling automation now. The goal of P5 is hardening and QoL, not a full campaign engine.

### PR-7 — Marketing draft editing QoL

Marketing currently has create/list/detail/lifecycle concepts. P5 should make the operator workflow complete for safe V0 use:

- edit draft title/body/severity/timing where the backend allows it;
- show validation errors inline;
- preview restricted Markdown before publish/schedule;
- preserve form data on failed save;
- show CAS conflict with refresh/retry guidance;
- disable or hide actions the current role cannot perform;
- show why an action is unavailable.

This is QoL, but it is also safety: an operator should not need to archive and recreate a message because the UI lacks a draft edit path while the backend already supports one.

### PR-8 — Content section guidance and subject drilldown truth

Content currently groups many useful panels, but P5 must reduce ambiguity.

The subject overview must not suggest a subject-specific drilldown if the drilldown only scrolls to a generic panel. Each subject row should have one of these honest actions:

- open subject-specific diagnostics;
- open content release panel;
- open asset/effect registry context;
- show “no drilldown yet”;
- show “placeholder subject — not live.”

Content Management should answer:

1. Which subjects are live, gated, or placeholders?
2. Which subjects have release/validation problems?
3. Which subject has user-facing errors?
4. Which subject has support load?
5. Which content/asset config is publishable or blocked?
6. Where should the operator click next?

P5 does not need to build a full content CMS. It must make the current Content section easier to interpret and less misleading.

### PR-9 — QA/destructive tool hardening

Admin has diagnostic and QA tools that can overwrite or permanently delete learner-facing state, such as seed harnesses and archive/delete flows.

P5 must audit all Admin destructive or high-impact tools and apply a consistent safety pattern:

- clear danger copy;
- explicit target learner/account display;
- typed confirmation for production-destructive writes where appropriate;
- environment guard if a tool is intended only for local/preview;
- rate limit preserved;
- mutation receipt preserved;
- rollback/pre-image availability where promised;
- no destructive action hidden behind a casual secondary button.

This is especially important for any tool that says it overwrites learner state or permanently deletes evidence.

### PR-10 — Admin CSS/CSP cleanup slice

P5 should include a narrow Admin-facing UI debt cleanup slice aligned with the existing CSP inline-style inventory.

This is not “rewrite the UI.” It is a controlled migration:

- choose a limited set of high-count Admin shared-pattern inline styles;
- replace them with CSS classes or approved CSS variables;
- add or update visual baseline coverage for affected Admin panels;
- do not touch dynamic-content-driven visual config styles unless the sanitisation contract is already in place;
- do not create new inline styles unless classified and justified.

The purpose is to reduce future CSP enforcement risk and make Admin styling maintainable.

### PR-11 — Characterisation-first refactor

Any P5 refactor of Accounts, Content, Marketing, or Debugging sub-panels must follow the P4 extraction discipline:

1. Add characterization tests first.
2. Extract one panel/concern at a time.
3. Preserve prop contracts unless the PR explicitly migrates callers.
4. Keep client leaf modules free of Worker imports.
5. Avoid behavior changes inside “refactor-only” PRs.
6. Run relevant smoke/unit/visual evidence before claiming completion.

Recommended candidates:

- Marketing create/list/detail/edit subcomponents.
- Content subject overview / asset registry / QA harness subcomponents.
- Account search/detail/metadata row subcomponents.
- Shared copy/freshness/confirmation utilities.

### PR-12 — Admin runbook and operator copy

P5 must update operator docs to match source, but more importantly it must improve in-product copy.

The owner should not need to read a repo doc to understand:

- what “scheduled” means;
- why an admin action is disabled;
- whether data is stale;
- whether capacity evidence is provisional;
- whether a Debug Bundle is safe to share;
- what an ops-role user can and cannot see;
- what a destructive QA action will change.

Docs must reflect source, but the UI must carry the essential meaning.

---

## 7. Engineering requirements

### ER-1 — No new source-truth drift

Before implementation, the next agent must re-scan:

- P4 completion report;
- current `src/surfaces/hubs/*Admin*` files;
- `worker/src/app.js`;
- `worker/src/admin-marketing.js`;
- `worker/src/admin-debug-bundle.js`;
- `docs/operating-surfaces.md`;
- capacity/CSP hardening docs;
- production smoke script;
- open PRs.

P5 completion must include a source-truth reconciliation section listing any mismatches found and how they were fixed.

### ER-2 — Evidence classification is a closed taxonomy

The Production Evidence panel must use a closed enum for readiness/certification states. Free-text “looks good” labels are not acceptable.

Suggested enum:

```ts
type EvidenceState =
  | 'not_available'
  | 'stale'
  | 'failing'
  | 'smoke_pass'
  | 'small_pilot_provisional'
  | 'certified_30_learner_beta'
  | 'certified_60_learner_stretch'
  | 'certified_100_plus'
  | 'unknown';
```

The implementation may choose different exact strings, but the contract must preserve conservative semantics.

### ER-3 — Clipboard writes go through one helper

All new Admin clipboard actions must go through a shared helper that:

- accepts a declared copy audience;
- redacts or rejects unsupported content;
- returns success/failure state for UI feedback;
- is testable without a browser clipboard;
- uses `navigator.clipboard` only at the final boundary.

No panel should directly stringify arbitrary server payloads to clipboard without passing through the safe-copy policy.

### ER-4 — Browser e2e must cover the support incident path

P5 must include at least one Playwright or equivalent browser-level test for the support/debugging path.

Mocked endpoint tests are not enough for this requirement.

The implementation plan should decide whether to run this against local Worker, fixture mode, or a controlled test harness, but it must prove the real UI flow.

### ER-5 — Marketing truth must be enforced by both UI and tests

If P5 keeps manual publish semantics, tests must assert that “scheduled” copy does not imply automatic delivery.

If P5 adds auto-publish, tests must assert the cron/timer flow, idempotency, audit receipt, broad-publish confirmation, maintenance `ends_at`, and failure recovery.

### ER-6 — Destructive operations must share confirmation semantics

High-impact Admin actions must be classified. Suggested levels:

- low: refresh, view, copy redacted summary;
- medium: edit draft metadata, save notes, search;
- high: publish all-user message, suspend account, archive evidence;
- critical: overwrite learner state, delete evidence, broad maintenance banner.

High and critical actions require explicit confirmation patterns. Critical actions should require typed target confirmation or environment gating unless there is a strong reason not to.

### ER-7 — P5 must not inflate the base admin hub payload unnecessarily

P4 used lazy loading for Marketing to avoid hub payload growth. P5 must preserve this pattern.

Production Evidence, Marketing edit details, or other potentially heavy data should be lazy-loaded or narrowly fetched unless there is a clear reason to include them in `/api/hubs/admin`.

### ER-8 — Role and redaction tests are required

Every new copy/export/detail surface must be tested for both `admin` and `ops` roles.

At minimum:

- admin sees full identifiers where allowed;
- ops sees masked identifiers;
- ops cannot export JSON if the contract says admin-only;
- internal notes do not leak to ops-safe or parent-safe copies;
- disabled mutation controls are not merely hidden on the client when server authority is required.

### ER-9 — No raw HTML/CSS/JS authoring

Marketing and Asset/Effect tools must continue to block raw HTML/JS/CSS authoring.

Allowed rich text/effect configuration must remain schema-bound, template-bound, or token-bound. P5 must not introduce free-form CSS or executable snippets.

### ER-10 — Production smoke remains additive and safe

If P5 adds new production smoke steps, they must not leave customer-visible state behind.

Marketing write-path round-trips should use internal audience or clean up/archival flows. Debug Bundle smoke must avoid exporting sensitive data to logs. Evidence-panel smoke should check classification shape, not print raw payloads.

---

## 8. Suggested P5 acceptance scenarios

### Scenario A — parent complaint debug flow

Given an admin account, when the operator searches for a parent account and opens account detail, then the operator can generate a Debug Bundle with the account prefilled, copy a safe summary, and return to the account detail without losing context.

### Scenario B — ops-role safe debugging

Given an ops-role account, when the operator opens Debugging & Logs and generates a Debug Bundle, then sensitive identifiers and internal notes are redacted, JSON export is unavailable, and the UI explains why.

### Scenario C — panel freshness

Given any major Admin panel, when the latest refresh fails after a previous success, then the panel still shows the last successful timestamp, shows a visible stale/failure warning, and offers retry where possible.

### Scenario D — production evidence honesty

Given missing or stale capacity evidence, the Overview evidence panel must show “not available” or “stale/provisional,” not “healthy” or “certified.”

### Scenario E — marketing scheduling

Given a broad all-signed-in message, when the operator tries to schedule or publish it, then the broad-publish confirmation is required and the UI clearly communicates whether scheduling auto-delivers or requires manual publish.

### Scenario F — destructive QA action

Given a tool that overwrites learner state or permanently deletes evidence, when the operator attempts it in production, then the UI requires explicit confirmation and the Worker records an audit receipt.

### Scenario G — Admin CSP/style cleanup

Given the chosen Admin panel style migration, visual/baseline tests show no unintended regression, and the inline-style inventory count does not increase.

---

## 9. Required completion report sections

The P5 completion report must include:

1. Executive summary.
2. Source-truth reconciliation.
3. Product changes by Admin section.
4. Engineering changes by concern.
5. Evidence and tests run.
6. Browser e2e evidence.
7. Production smoke evidence.
8. Redaction/copy/export verification.
9. Marketing scheduling truth decision.
10. Destructive tool audit result.
11. CSP/style inventory impact.
12. Deferred items and why they are safe to defer.
13. Updated recommendation for remaining Admin phases.

---

## 10. Definition of done

P5 is done when:

- every major Admin panel has consistent freshness/failure semantics;
- Overview exposes production evidence honestly;
- the main parent-complaint debugging workflow is browser-tested;
- Debug Bundle copy/export follows a shared safe-copy policy;
- Marketing scheduling semantics are impossible to misunderstand;
- Marketing V0 has a complete safe draft edit/preview workflow or explicitly documented deferral;
- destructive QA/Admin tools have consistent confirmations;
- Content Management does not imply false subject drilldowns;
- at least one controlled Admin CSS/CSP cleanup slice lands without visual regression;
- P5 completion report records real test/check/smoke evidence;
- no new “coming soon but looks live” or “live but hidden” discrepancy is introduced.

---

## 11. Recommended sequencing for the next agent

This contract intentionally does not prescribe exact implementation units. The next agent should create its own implementation plan with files, tests, migrations, PR order, and sequencing.

Recommended ordering:

1. Source-truth audit and implementation plan.
2. Characterization tests for affected Admin panels.
3. Shared panel freshness/failure frame.
4. Safe-copy framework.
5. Debug Bundle browser workflow.
6. Production Evidence panel.
7. Marketing scheduling truth + draft edit QoL.
8. Content/QA destructive-tool hardening.
9. CSP/Admin style cleanup slice.
10. Documentation and completion report.

The next agent should keep units small enough for adversarial review.

---

## 12. Phase strategy after P5

Admin should not continue forever as one endless phase chain.

Recommended remaining Admin phases:

### P5 — Operator Readiness & Evidence QoL

This contract. Required before moving back to larger feature work.

### P6 — Content and Asset Operations Maturity

Only after P5. This phase should mature Content Management:

- subject drilldowns;
- release readiness;
- content library/editor boundaries;
- asset/effect registry v1 beyond Monster Visual Config wrapper;
- validation queues;
- rollback/restore ergonomics.

P6 should still avoid becoming a full CMS unless the product explicitly needs it.

### P7 — Business Operations and Growth Analytics

Optional but likely valuable before wider SaaS rollout:

- marketing/live-ops beyond V0;
- business KPIs;
- support queue workflow;
- conversion/demo analytics;
- billing/subscription placeholders;
- role/permission placeholder expansion;
- account lifecycle workflows.

After P7, Admin should switch from “phase build-out” to normal product maintenance: each new business feature brings its own Admin slice.

If time is tight, the minimum path is: do P5, then stop Admin phase work temporarily and return only when Content/Marketing/Hero/Business needs create specific Admin requirements.

---

## 13. Final product judgement

Admin P4 made the console truthful at the source-code level.

Admin P5 must make it truthful at the operator level.

That means the next success metric is not number of panels. It is whether the business owner can handle a live user problem calmly, using evidence, without accidentally changing the wrong state.
