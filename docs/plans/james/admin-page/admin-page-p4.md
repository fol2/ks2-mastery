# Admin Page P4 — Reliability, QoL, Logic Correction, and Refactor Contract

Status: proposed contract for the next implementation agent  
Owner intent: pause feature expansion; make Admin trustworthy, easier to operate, easier to debug, and safer to evolve  
Primary audience: product/engineering agent that will produce its own implementation plan, files, migrations, tests, and sequencing

---

## 1. Executive position

P4 is not a feature-growth phase.

P4 is a hardening and truthfulness phase for the Admin Console after P3. The Admin surface now has enough breadth that the next risk is not “missing panels”; the next risk is that an operator trusts a panel, filter, route, banner, or report that is only partially wired, stale, inconsistent with source, or not covered by production-shaped evidence.

The goal of P4 is to make Admin boringly reliable.

An operator should be able to open Admin, locate the right section, diagnose a reported problem, trust the shown state, copy a safe debug bundle, and understand whether a feature is live, backend-only, disabled, coming soon, or intentionally deferred.

P4 should prefer correction, clarity, and small durable refactors over new product surface area.

---

## 2. Source-review signals that triggered P4

These are not implementation instructions. They are the contract-level reasons P4 exists.

### 2.1 P3 claims substantial delivery

The P3 completion report says P3 shipped Admin deep-linking, account search/detail, Debug Bundle, occurrence timelines, request denial logs, cross-subject content overview, Marketing / Live Ops V0, active message delivery, and read-model performance work.

That is the right direction. However, P4 must verify that every claimed user/operator capability is actually reachable, wired, tested, and documented in current `main`.

### 2.2 Marketing appears inconsistent between report, docs, and current source

The P3 report says Marketing / Live Ops V0 and active message delivery shipped. Current source review found the Admin Marketing section still presenting as a “Coming soon” placeholder, and the Admin tabs still marking Marketing as `comingSoon`.

This may be a partial merge, a deliberate UI deferral, a stale file, a reverted surface, or a source/documentation mismatch. P4 must reconcile it before adding any more Admin features.

### 2.3 Active-message delivery needs end-to-end truth

Current source contains a client active-message module and API helper, but the App-level scan did not establish a visible banner wiring path by obvious names. P4 must prove active-message delivery end-to-end or downgrade the docs/report wording to “backend/client helper only, not operator-visible yet.”

The endpoint’s access semantics must also be consistent. One source describes active messages as callable by authenticated users; another operating-surface description calls the endpoint public unauthenticated. P4 must settle this contract.

### 2.4 Debug Bundle identifier semantics need correction

The Debug Bundle UI invites filtering by fingerprint. The occurrence table schema described by P3 stores `event_id` referencing `ops_error_events(id)`. Current worker debug-bundle code appears to filter occurrences with `event_id = ?` when the incoming field is named or understood as `errorFingerprint`.

P4 must make error identifiers unambiguous across UI, API, repository, and database:

- `errorEventId` means an `ops_error_events.id`.
- `fingerprint` means a dedupe/grouping fingerprint.
- The UI must not label one as the other.
- Occurrence queries by fingerprint must resolve matching event ids first, or the API must require an event id.

This is a debugging correctness issue, not polish.

### 2.5 Denial taxonomy appears incomplete at the UI layer

The P3 intent includes visibility into request denials such as suspended accounts, payment hold, invalidated sessions, CSRF/same-origin issues, and rate limits. Current Debugging section filters show only a smaller reason set. P4 must align actual logged denial reason codes, filter options, labels, docs, and support workflows.

Admin cannot be a real debugging cockpit if denial reasons are silently missing or grouped too broadly.

### 2.6 Some P3 residuals are now P4 blockers

The P3 report explicitly deferred or flagged:

- broad-publish confirmation on scheduled Marketing transitions;
- idempotent replay response-shape parity;
- Debug Bundle Playwright end-to-end coverage;
- production smoke harmonisation.

These should not roll forward again as footnotes. They are the first-class P4 hardening backlog.

### 2.7 Post-P3 stability work changes the Admin contract

After P3, the repo added or documented substantial stability/capacity work, including multi-learner bootstrap correctness, D1 hot-path query budget enforcement, dense-history command loops, repository splitting, chunk-load retry handling, CSP/HSTS residuals, and capacity evidence.

Admin P4 should not ignore that work. It should surface the operational evidence that matters to an owner/operator, without over-claiming production readiness before the evidence schema and telemetry are strong enough.

---

## 3. Product promise for P4

After P4, the business owner should be able to:

1. Open Admin reliably by URL or navigation.
2. Know whether each Admin section is live, disabled, backend-only, coming soon, or intentionally deferred.
3. Search for an account and see support-relevant status without guessing.
4. Build a safe Debug Bundle from account, learner, route, fingerprint/event id, and time window.
5. Inspect client/server/admin errors with correct occurrence history.
6. Inspect access denials with a complete reason taxonomy.
7. Understand whether Marketing / Live Ops is actually live and whether active messages reach users.
8. See current operational evidence such as capacity posture, smoke status, and CSP rollout state.
9. Trust that broad or risky operator actions require clear confirmation.
10. Use Admin without being surprised by stale panels, silent refresh failures, misleading labels, or contradictory docs.

---

## 4. Non-goals

P4 must not become a large feature expansion.

The following are out of scope unless explicitly re-contracted:

- a complex role/authority system beyond the existing small platform role model;
- billing/subscription automation;
- a full live-ops event engine with reward multipliers, XP boosts, Hero Coins, streak pressure, or content unlock campaigns;
- child-facing Hero Mode surfaces;
- subject-engine rewrites;
- raw HTML, raw CSS, or raw JavaScript authoring from Admin;
- a redesign of the learning/reward semantics for Grammar, Punctuation, Spelling, or future subjects.

Hero Mode, if referenced at all, should remain a separate learning/reward contract. Admin P4 may reserve a future read-only operational visibility slot, but it must not introduce Hero economy or child reward mechanics.

---

## 5. P4 priorities

### Priority A — Truth audit and source/report/doc parity

The first P4 outcome is that the current source, reports, docs, and UI agree.

If a feature is not operator-visible, do not call it shipped as an Admin feature. If a feature is backend-only, say backend-only. If a feature is hidden behind an unlinked helper, say not yet wired. If a feature is intentionally disabled, expose that state explicitly.

Required truth outcomes:

- Marketing section state is reconciled.
- Active-message delivery state is reconciled.
- Operating-surface docs match current route access rules.
- P3 completion report residuals are either fixed or carried into P4 completion report honestly.
- No Admin section label says “coming soon” while docs say fully live, or vice versa.

### Priority B — Logic correction blockers

P4 must fix correctness issues before adding QoL polish.

Required corrections:

- Debug Bundle and occurrence lookup use correct identifier semantics.
- Denial reason taxonomy is complete and consistent.
- Broad-publish confirmation applies to scheduled Marketing transitions if scheduled messages can later become active without another operator confirmation.
- Marketing transition idempotent replay responses match first-success response shape closely enough for safe retries.
- Any “active messages” endpoint has a clear auth contract and matching docs/tests.
- Account/search/debug filters must not silently ignore user-selected filters.

### Priority C — Debugging workflow QoL

The Debugging section should become a practical support cockpit.

A realistic operator flow:

1. Parent reports “my child got stuck” or “the app was slow.”
2. Operator opens `/admin/debug`.
3. Operator searches by account email, learner id, route, approximate time, or fingerprint/event id.
4. Admin shows recent errors, occurrences, access denials, account state, relevant subject activity, recent content/release state, and capacity/degradation context.
5. Operator copies a safe Debug Bundle summary for issue tracking.
6. Operator can distinguish likely causes: account status, payment hold, role/session problem, route/client crash, subject command failure, content validation issue, capacity degradation, or active-message/config issue.

P4 should add clarity and friction reduction around this flow, not unrelated dashboards.

### Priority D — Production smoke and evidence harmonisation

Admin is an operations tool. It must be covered by production-shaped smoke tests, not only unit tests.

P4 should standardise smoke-script behaviour:

- consistent `--help` output;
- consistent exit codes;
- optional machine-readable JSON output;
- clear environment variable requirements;
- no ambiguous success when required routes are unavailable;
- consistent naming between package scripts and docs.

Admin smoke coverage should include, at minimum:

- `/admin` entry and section deep-linking;
- account search/detail path;
- Debug Bundle creation and copy-safe response shape;
- error occurrence lookup;
- request denial lookup;
- content overview load;
- Marketing/active-message lifecycle if Marketing remains claimed as live;
- no-access behaviour for non-admin users;
- stale/failed panel state rendering where practical.

### Priority E — Refactor for maintainability

P2 split the old giant Admin surface into sections. P3 added significant new capabilities. P4 should now reduce module pressure before the next feature phase.

Refactor requirements:

- Characterisation tests must come before behaviour-preserving refactors.
- Large Admin section files should be split along product boundaries, not arbitrary component boundaries.
- Worker route logic should keep validation, repository access, and response shaping separable.
- Shared Admin UI primitives should be extracted only when repeated behaviour is real, not speculative.
- The main client controller surface should not keep absorbing unrelated Admin or ops behaviour.
- Refactors must not change public semantics unless explicitly documented.

Recommended refactor seams:

- Debug Bundle form and result rendering;
- error filters and error drawer;
- request-denial table/filtering;
- account search/detail card;
- Marketing list/editor/transition controls, if Marketing remains in scope;
- admin panel freshness/error wrappers;
- safe-copy helpers;
- shared section state for refresh, stale, dirty, and failed panels.

### Priority F — Security and operator safety

P4 must close safety gaps created by Admin becoming more powerful.

Required safety properties:

- No raw HTML rendering for Marketing or Admin-authored messages.
- No raw CSS/JS authoring in Admin.
- All copied Debug Bundles are redacted by default.
- PII exposure is intentional, minimal, and role-gated.
- Request-denial logs do not leak secrets, tokens, full cookies, or raw auth headers.
- Broad audience actions require explicit confirmation.
- Idempotency, CAS, and stale-write behaviour are documented and tested for risky mutations.
- Same-origin/CSRF expectations are consistent across Admin mutation routes.
- Admin continues to fail closed for mutations and fail visibly for panels.

---

## 6. Product requirements

### PR-1: Admin section truthfulness

Every Admin section must communicate its true state.

Allowed states:

- live;
- live but read-only;
- backend-only;
- disabled by configuration;
- coming soon;
- degraded because refresh failed;
- unavailable because of role/account status.

A section must not appear fully live if its backend route, client wiring, or runtime delivery path is incomplete.

### PR-2: Debug Bundle correctness

Debug Bundle must use clear identifiers and return evidence that matches the operator’s query.

The operator must be able to tell whether they are searching by:

- account email;
- account id;
- learner id;
- route;
- date/time range;
- error fingerprint;
- error event id.

The returned bundle must label each section as:

- matched;
- empty but successfully queried;
- skipped because no input was provided;
- unavailable because of permissions/configuration;
- failed because of an internal error.

Partial bundle failure must not destroy the whole bundle.

### PR-3: Occurrence timeline usefulness

If occurrence timelines are claimed as shipped, the Admin UI must show real occurrence history, not only aggregate text saying it is deferred.

Minimum useful timeline fields:

- occurred at;
- route;
- release/build;
- kind;
- message summary;
- user-agent family or safe summary;
- linked account/learner/session when available and allowed;
- source/origin classification;
- recurrence after resolved when applicable.

### PR-4: Request-denial evidence

Admin must make access and permission failures debuggable.

The denial taxonomy must cover at least:

- suspended account;
- payment hold;
- forbidden role;
- invalid or missing session;
- session invalidated;
- same-origin/CSRF failure;
- rate limited;
- demo expired;
- malformed request;
- unknown/internal safety denial.

The UI should group reasons for readability but preserve exact machine codes in the detail view or copied bundle.

### PR-5: Account support QoL

Account Management should support actual support work, not just metadata editing.

An account detail/support view should make it easy to inspect:

- account role/status;
- ops status and reason;
- plan label/tags/notes;
- linked learners;
- recent sessions;
- recent errors;
- recent denials;
- recent Admin/account mutations;
- recent content/subject activity if available;
- safe link into Debug Bundle prefilled with this account.

### PR-6: Marketing truth and safety

P4 must decide whether Marketing is truly live in this repo state.

If Marketing is live:

- the Admin Marketing section must be wired;
- lifecycle states must be visible;
- active-message delivery must be visible in the user runtime;
- broad-publish confirmation must cover immediate and scheduled activation paths;
- idempotent transition replay must be safe;
- production smoke must verify active-message visibility.

If Marketing is not live:

- Admin must continue showing a clear placeholder;
- docs and completion reports must stop claiming operator-visible delivery;
- backend/client helper modules may remain, but they must be documented as dormant or backend-only.

### PR-7: Operational evidence panel

Admin Overview or Debugging should expose a compact operational-evidence panel.

It should not replace full docs or CI logs, but it should show:

- current release/build identifier when available;
- latest production smoke status when available;
- capacity evidence posture;
- whether the current capacity status is provisional or certified;
- CSP/HSTS rollout state if active;
- recent degradation/circuit-breaker events when available;
- last KPI reconciliation status.

This panel must avoid over-claiming. “Small-pilot-provisional” must not be displayed as “production certified.”

### PR-8: Admin navigation QoL

Admin must remain easy to enter and share.

Expected behaviour:

- `/admin` opens Admin.
- Section links are stable.
- `/admin/debug`, `/admin/accounts`, `/admin/content`, `/admin/marketing`, or equivalent deep links are either supported or explicitly redirected to stable hash/state URLs.
- Browser back/forward works predictably.
- Reloading a section does not lose the selected section.
- Unauthorized users see a clear denial, not a blank app or generic crash.

### PR-9: Panel freshness and failure visibility

Every data-heavy Admin panel should show freshness and failure state.

Minimum behaviour:

- last refreshed timestamp;
- refresh in progress state;
- visible refresh failure state;
- manual retry;
- partial failure rather than full-page collapse when possible;
- stale data warning when mutation side effects have not yet refreshed dependent panels.

### PR-10: Safe copy and operator notes

Copy buttons are useful but dangerous.

P4 must define safe-copy behaviour for:

- Debug Bundle JSON;
- Debug Bundle summary;
- fingerprint/event id;
- account support summary;
- marketing preview text if live.

Copied output must be redacted by default, labelled with generation time, and avoid raw secrets. If full internal-only output exists, it must be clearly separated from shareable output.

---

## 7. Engineering requirements

### ER-1: Worker-authoritative mutations

Admin mutations remain Worker-authoritative. The client may optimistically render status, but persistent state transitions must be validated and applied by Worker routes/repositories.

### ER-2: Explicit auth contracts

Every Admin and ops route must state who can call it:

- admin only;
- admin or ops;
- any authenticated user;
- unauthenticated/public;
- internal/cron only.

Route implementation, docs, tests, and client comments must agree.

### ER-3: Identifier clarity

APIs must not overload names like `id`, `event`, `fingerprint`, or `message` when multiple ids exist.

Use explicit field names:

- `accountId`;
- `learnerId`;
- `errorEventId`;
- `errorOccurrenceId`;
- `fingerprint`;
- `marketingMessageId`;
- `requestDenialId`;
- `releaseId` or `buildHash`.

### ER-4: No silent filter loss

If the UI offers a filter, the backend must either honour it or return a clear unsupported-filter error. It must not silently ignore route, kind, release, date, account, learner, or status filters.

### ER-5: Characterisation before refactor

Before splitting large Admin or Worker modules, the next agent must first capture current externally visible behaviour through tests or snapshots. Refactor PRs should be boring and low-risk.

### ER-6: Data model constraints where feasible

Where P3 introduced or extended operational tables, P4 should verify constraints and indexes:

- lifecycle/state check constraints;
- status/reason enums where appropriate;
- foreign-key semantics;
- updated-at/row-version discipline;
- indexes for admin filters;
- migration rollback/forward compatibility where the repo expects it.

### ER-7: Production-shaped evidence

P4 cannot be declared complete only because unit tests pass.

The completion evidence should include:

- local test/check/audit results;
- relevant production smoke output or a clear reason it was not run;
- capacity verification status when touched;
- Playwright or equivalent browser proof for key operator flows;
- docs updated to match source.

---

## 8. Refactor contract

P4 refactoring is allowed and encouraged, but only under these rules:

1. Refactor for a named risk: readability, testability, drift prevention, route contract clarity, or repeated UI state.
2. Do not refactor while also changing business semantics in the same unit unless unavoidable and explicitly explained.
3. Split by domain, not by personal preference.
4. Preserve route names and data shapes unless the contract explicitly changes them.
5. Add regression tests around any corrected logic before or with the correction.
6. Avoid creating a generic framework that makes small panels harder to read.
7. Keep Admin product language understandable to a non-engineering business owner.

Suggested extraction targets:

- `AdminDebugBundlePanel`;
- `AdminErrorTimelinePanel`;
- `AdminRequestDenialsPanel`;
- `AdminAccountSearchPanel`;
- `AdminAccountSupportDetail`;
- `AdminMarketingMessagesPanel` if Marketing is live;
- `AdminPanelFrame` for freshness/failure/retry state;
- `safeCopyDebugBundle` and redaction helpers;
- route-level validators for Admin ops endpoints.

---

## 9. Documentation requirements

P4 must update docs as part of the work, not afterthoughts.

Required documentation outcomes:

- Admin P4 completion report, with honest shipped/deferred status.
- Operating surfaces updated to match route access and section truth.
- Marketing/active-message state documented as live, backend-only, or deferred.
- Debug Bundle input/output semantics documented.
- Denial reason taxonomy documented.
- Production smoke commands documented with examples.
- Capacity/CSP docs updated only if P4 changes their state.
- Any stale P1/P1.5/P2/P3 wording that contradicts current source is corrected or clearly superseded.

---

## 10. Acceptance criteria

P4 may be considered complete only when all of the following are true:

1. Current source, Admin UI, operating docs, and P4 report agree on what Admin can do.
2. Marketing state is reconciled and tested or explicitly downgraded.
3. Active-message endpoint auth semantics are unambiguous and tested.
4. Debug Bundle identifier semantics are corrected and tested.
5. Occurrence timeline UI reflects real occurrence data if claimed as shipped.
6. Request-denial taxonomy is complete across logger, API, UI, docs, and copied bundle.
7. Broad-publish/scheduled Marketing safety is fixed or Marketing remains disabled.
8. Idempotent replay response-shape parity is fixed for risky Marketing transitions if Marketing is live.
9. At least one browser-level flow proves Admin debugging from entry to copied bundle.
10. Production smoke scripts relevant to Admin have harmonised help/output/exit behaviour.
11. Admin panel freshness/failure states are visible in the main debugging/account workflows.
12. Refactors are backed by characterisation tests or equivalent evidence.
13. Security review confirms no new raw HTML/CSS/JS authoring or unsafe debug copying.
14. Completion report lists every deferred item plainly.

---

## 11. Recommended evidence commands

The next agent should decide the exact command set based on changed files, but P4 evidence should normally include these families:

- unit/integration tests;
- type/check/lint equivalents used by the repo;
- client audit;
- production audit where safe;
- Admin ops smoke;
- account/bootstrap smoke if account flows changed;
- capacity evidence verification if Admin surfaces capacity state;
- Playwright/browser smoke for Admin entry and Debug Bundle;
- targeted regression tests for identifier, denial, Marketing, and filter corrections.

Do not claim these were run unless they were actually run.

---

## 12. Open questions for the implementation agent

The next agent should answer these before writing a low-level implementation plan:

1. Was the P3 Marketing UI intentionally left as a placeholder, reverted, or never wired into `main`?
2. Should `GET /api/ops/active-messages` be public unauthenticated, any-authenticated, or admin-only for preview? Which one is actually implemented?
3. Does an active-message renderer exist under a different name, or is the client helper currently unused?
4. Is the Debug Bundle occurrence input meant to be fingerprint, event id, or both?
5. What are the canonical request-denial reason codes in Worker code today?
6. Are scheduled Marketing messages automatically activated later, or only manually transitioned by an operator?
7. Which production smoke scripts are currently stable enough to be part of P4 completion evidence?
8. Should `/admin/debug` path aliases be real paths, redirects, or hash-only deep links?
9. How should capacity/CSP status be displayed without misleading the business owner?
10. Which large Admin section should be refactored first based on change frequency and bug risk?

---

## 13. P4 done means

P4 is done when Admin is less exciting and more dependable.

The business owner should feel:

- “I know where to go.”
- “I know whether this feature is actually live.”
- “I can debug from evidence.”
- “I can trust the labels and filters.”
- “I can copy a safe bundle.”
- “I can see production health without reading five docs.”
- “The code is ready for the next feature phase.”

Only after that should Admin move back into larger product expansion, advanced Marketing/Live Ops, broader content management, or future Hero Mode operational surfaces.
