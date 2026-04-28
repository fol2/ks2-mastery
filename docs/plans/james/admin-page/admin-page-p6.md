# Admin Console P6 — Evidence Integrity, Content and Asset Operations Maturity Contract

**Document type:** Product and engineering contract  
**Status:** Draft for implementation planning  
**Date:** 2026-04-28  
**Requested filename:** `admi-page-p6.md`  
**Follows:** Admin Console P5 — Operator Readiness, Evidence, and QoL  
**Intended reader:** the next implementation agent, who should turn this contract into its own implementation plan with units, exact files, tests, migrations, sequencing, review gates, and rollback strategy.

---

## 1. Executive intent

P6 must not be a feature-bloat phase. P5 made the Admin Console safer and more usable under incident pressure, but the next risk is that the console now looks more mature than some of its underlying evidence and content-operations machinery.

P6 therefore has two jobs:

1. **Close truth and hardening gaps left by P5 validation**, especially around Production Evidence, safe-copy redaction, panel freshness, and browser-level role proof.
2. **Mature Content and Asset Operations** so the Admin Console becomes a reliable operating surface for subject content, release readiness, validation, rollback, and asset/effect configuration.

The output of P6 should be a calmer, more trustworthy Admin Console. It should help the operator answer: “Is the platform healthy?”, “Can I trust this evidence?”, “Which subject/content/asset area needs attention?”, and “Can I safely publish or roll back?”

P6 should not introduce a new economy, a complex campaign engine, a billing system, or a full permissions framework.

---

## 2. Product outcome

After P6, the business owner should be able to open Admin and confidently operate three workflows.

### 2.1 Evidence and readiness workflow

The operator can open Overview and see production readiness without reading multiple runbooks. The panel must clearly distinguish:

- no evidence available;
- stale evidence;
- smoke-pass evidence only;
- small-pilot provisional evidence;
- failing classroom evidence;
- certified classroom evidence, only when a dated threshold run actually supports it.

If the latest 30-learner evidence is failing, Admin must not soften that into a green state. It should say that the 30-learner target is not certified and point the operator towards the failing dimension, such as bootstrap P95.

### 2.2 Support/debugging workflow

The operator can handle a parent complaint without leaking internal data. The workflow should remain:

Account search → account detail → Debug Bundle → safe summary → return to account.

P6 must tighten the copy/export boundary so the Admin Console has a demonstrable guarantee that parent-safe and ops-safe copied text cannot include raw account IDs, learner IDs, internal notes, cookies, auth tokens, request bodies, or stack traces.

### 2.3 Content and asset operations workflow

The operator can inspect live subjects, content releases, validation state, and asset/effect configuration from one Content section. The operator should be able to tell:

- which subjects are live, gated, or placeholders;
- which live subjects have real diagnostics;
- whether a content release is safe to publish;
- whether validation blockers exist;
- which asset/effect draft is live, dirty, publishable, or rollback-ready;
- what would change before a publish.

Subject engines must remain separate. Admin may orchestrate, inspect, and publish through Worker-authoritative routes, but it must not become a subject runtime or a second learning engine.

---

## 3. Validation findings entering P6

This section is intentionally blunt. These findings are not accusations against P5; they are the hardening items that should shape P6.

### 3.1 P1 to P4 are broadly validated against current source and later reports

The phase chain is coherent:

- P1 created the initial Admin/Operations surface and public client-error ingest.
- P1.5 hardened P1 with real/demo KPI split, visible refresh failures, IPv6-aware rate limiting, row-version CAS, KPI reconciliation, `ops_status` enforcement, and a stronger error centre.
- P2 created the Admin entry, navigation, section shell, TopNav link, hash deep-linking, and dirty-row guard.
- P3 added the command-centre features: account search/detail, Debug Bundle, error occurrences, denial logs, Content overview, Asset Registry direction, Marketing backend, active banners, and admin read-model performance work.
- P4 corrected truth/wiring issues in P3, including denial codes, Debug Bundle identifier semantics, Marketing UI wiring, active-message auth documentation, broad scheduled publish confirmation, idempotent replay shape, smoke coverage, and Debugging refactor.

No new P6 work should reopen those phases for broad rewrites unless a current source-level bug is found. P6 should build on them.

### 3.2 P5 is mostly valid, but its Production Evidence claim is too broad

P5’s report says the Production Evidence panel shows admin smoke status, bootstrap smoke, capacity tier, CSP status, D1 migration state, build hash, and KPI reconcile status.

The current evidence generator reads JSON files from `reports/capacity/evidence/` and classifies tiers by filename. It does not, by itself, aggregate admin smoke, bootstrap smoke, CSP status, D1 migration state, build hash, or KPI reconciliation state.

The checked-in `reports/capacity/latest-evidence-summary.json` currently contains an empty metrics object and `generatedAt: null`.

Therefore, P6 must treat Production Evidence as a **framework that exists but needs source-backed evidence expansion**. The UI must not imply that those operational states are real unless the Worker response and summary generator actually carry them.

### 3.3 Safe-copy is structurally useful but not yet a complete redaction boundary for strings

P5 introduced audience-aware safe-copy helpers. This is the right direction. However, string inputs are effectively passed through after only empty-string checking. The Debug Bundle UI copies a human summary string through the parent-safe path.

P6 must close this by either:

- generating human summaries only from already-redacted bundle objects, and proving that contract with tests; or
- adding string-level redaction to the safe-copy framework; or
- both.

The final guarantee should be simple: any copy action labelled parent-safe is safe even if an upstream summary accidentally contains a raw sensitive token.

### 3.4 Panel freshness is not yet consistently meaningful

AdminPanelFrame exists and is useful, but not every panel has a real `refreshedAt`, last-success memory, refresh-error envelope, or stale-data behaviour. Some complex Debugging panels deliberately remain outside the shared wrapper. Marketing structurally uses the frame, but the list currently needs a real refresh timestamp to make freshness warnings meaningful.

P6 should not force one wrapper onto every panel if it makes the UI worse. It should, however, create a consistent panel data contract so operators know whether a panel is fresh, stale, empty, failed, or partially failed.

### 3.5 Ops-role browser evidence remains incomplete

P5 added a Playwright Debug Bundle workflow, but the ops-role interactive path is still noted as structurally correct and marked as a fixme in the P5 report. Unit tests are valuable, but a browser-level ops proof is important because ops masking is exactly the sort of boundary that can fail through UI wiring.

P6 should either complete the ops-role Playwright proof or replace it with an equivalent browser-level role proof that exercises the same redaction and button-visibility contract.

### 3.6 Capacity certification must remain conservative

Current capacity documentation does not certify the 30-learner classroom beta target. The latest evidence records a failing 30-learner run where bootstrap P95 exceeded the configured ceiling, while command P95, response size, 5xx, and signals were acceptable.

P6 must carry that truth into Admin. The console may show progress and provisional readiness, but it must not imply classroom or school readiness until dated evidence supports the claim.

### 3.7 CSP/style hardening is improved but not finished

P5 reduced inline styles, but the inventory still has many `shared-pattern-available` and `dynamic-content-driven` sites. P6 does not need to complete all CSP work, but it should perform one controlled Admin-adjacent cleanup slice with visual coverage and keep the inventory text internally consistent.

---

## 4. P6 scope

P6 is a hardening-plus-maturity phase. It should have seven outcome areas.

### 4.1 Evidence Integrity v2

P6 must turn Production Evidence from a panel shell into a source-backed evidence surface.

The next implementation plan should define an evidence registry that can represent:

- admin smoke status;
- bootstrap smoke status;
- capacity tier status;
- CSP Report-Only or enforced status;
- D1 migration state;
- current build hash or release identifier;
- KPI reconciliation state;
- latest generated time;
- evidence file provenance;
- stale/failing/not-available states.

This registry can be JSON-based at first. It does not need a new database table unless the implementation agent proves one is necessary.

The panel must be honest when data is absent. Empty evidence is not “unknown good”; it is “not available”. Stale evidence is not “passing”; it is “stale”. A failing 30-learner run is not “small pilot certified”; it is “30-learner target failing, lower tiers may still be provisional”.

### 4.2 Safe Copy and Export Boundary v2

P6 must make every copy/export action defensible.

The implementation plan should audit all Admin copy buttons and exports. Every copied payload must declare an audience:

- admin-only;
- ops-safe;
- parent-safe;
- public preview.

The redaction boundary must work for objects and strings. The implementation should include tests that intentionally place sensitive values in strings and verify removal or masking.

Parent-safe output must never contain:

- full email addresses;
- full account IDs;
- learner IDs;
- session IDs;
- cookies;
- auth headers;
- raw request bodies;
- internal notes;
- stack traces;
- internal-only route or table names where they would confuse or alarm parents.

Ops-safe output may contain more operational detail than parent-safe output, but it must still avoid internal notes, raw auth data, and unnecessary account/learner linkage.

### 4.3 Panel State Contract v2

P6 should complete the panel freshness/failure semantics without overfitting the UI.

Every server-backed Admin panel should expose, directly or via a normaliser:

- `generatedAt` or `refreshedAt`;
- `lastSuccessfulRefreshAt`, if applicable;
- `refreshError`, using one normalised envelope shape;
- `loading` state;
- `empty` state;
- whether displayed data is stale;
- whether the panel is showing partial data after a failed refresh.

The exact component wrapper is an implementation detail. The product contract is that the operator can understand the freshness and reliability of each panel at a glance.

Marketing, Content overview, Production Evidence, Account detail, Debug Bundle, Error Timeline, Denials, and Asset Registry should be assessed explicitly. Panels that remain custom must document why.

### 4.4 Content Operations Maturity

P6 should upgrade Content from “grouped existing panels” to a true content-operations surface.

For live subjects, Content should show:

- live/gated/placeholder status;
- release version;
- validation blockers and warnings;
- recent subject-specific error count;
- support load signal;
- release readiness;
- drilldown availability;
- content coverage signals where available.

Subject-specific drilldowns should be truthful. If a subject has diagnostics, the row should open them. If it does not, the row should say so and not pretend to be clickable.

P6 should prefer read-only diagnostics and release-readiness views over a large editor. Content authoring can remain thin unless the implementation agent finds existing safe Worker-authoritative edit routes to reuse.

### 4.5 Skill, Template, Item, and Misconception Signals

Content Management should begin reflecting the learning-product model, not just file/version state.

For subjects where durable evidence exists, the Admin Console should be able to show at least a summary of:

- skill coverage;
- template coverage;
- item coverage;
- common misconceptions;
- high-wrong-rate content;
- content with repeated support usage;
- content with suspiciously low or high success rates;
- content recently changed but not yet evidenced.

P6 does not need to invent this data for placeholder subjects. It should show the signal where it exists and say “not available yet” where it does not.

### 4.6 Asset and Effect Registry v1

P6 should move the Asset & Effect Registry from a registry-shaped wrapper to an operator-grade v1.

The Registry should support, at minimum:

- asset list with stable asset IDs;
- category and owner context;
- published version;
- draft revision;
- validation state;
- manifest/config hash;
- last published time and actor;
- publish blockers;
- preview affordance;
- publish and restore actions with CAS and confirmation;
- rollback-to-draft ergonomics;
- reduced-motion and fallback status where relevant.

The registry must keep the existing safety boundary: no raw HTML, no raw JavaScript, and no arbitrary raw CSS authoring. If style tuning is exposed, it should use tokens, allowlisted classes, numeric clamps, or already-approved config fields.

### 4.7 Refactor and Maintainability Slice

P6 should reduce future change risk where Admin sections are getting large again, but only after characterisation coverage exists.

The implementation plan should identify the highest-risk Admin files by size, coupling, and mutation complexity. It should then choose one narrow refactor slice that improves maintainability without changing product behaviour.

Good candidates are:

- extracting Content sub-panels behind stable props;
- extracting Asset Registry helpers;
- unifying refresh/error envelope normalisers;
- removing duplicated timestamp/status formatting;
- moving validation-label helpers to content-free platform modules.

Do not do a sweeping rewrite. P6 is a maturity phase, not a rewrite phase.

---

## 5. Non-goals

P6 must not include:

- billing, subscriptions, invoices, or payment-provider integration;
- full CRM or support-ticket queue;
- complex role hierarchy beyond the current admin/ops distinction;
- Marketing auto-publish scheduler unless a separate scheduling contract is written;
- arbitrary campaign/event engine for rewards, coins, XP, streaks, or content unlocks;
- parent-facing campaign tools;
- WebSocket or Durable Object realtime dashboard;
- analytics warehouse;
- raw CSS, raw HTML, or raw JavaScript authoring in Admin;
- subject engine merge;
- production implementation of placeholder subjects unless already planned elsewhere;
- Hero Mode controls or reward-economy controls.

If any of these become urgent, they should have their own contract.

---

## 6. Engineering boundaries

P6 must preserve these boundaries.

### 6.1 Worker-authoritative mutation boundary

Any publish, restore, edit, archive, delete, or status transition must be Worker-authoritative. The client may prepare a request, but the Worker owns validation, role checks, CAS, mutation receipts, and response shape.

### 6.2 Existing permission simplicity

P6 should keep the current platform-role model:

- `admin` may mutate Admin-owned operational state;
- `ops` may inspect where safe, with redaction;
- `parent` cannot access Admin.

The implementation may add placeholders for future role expansion, but should not introduce a new permission matrix unless required for safety.

### 6.3 Content-free client leaf modules

New client-side helpers should stay content-free unless they are explicitly subject-owned. Admin platform helpers must not import large subject datasets or Worker modules.

### 6.4 Redaction at more than one boundary

Server-side redaction and client-side safe-copy redaction are complementary. P6 should not rely on only one side for sensitive copy/export paths.

### 6.5 Evidence must be reproducible

Any certification or readiness claim shown in Admin must point back to dated, reproducible evidence: file path, run time, commit/build, environment, threshold config, and result.

### 6.6 No false readiness claims

Admin should never show a green readiness state because a metric is missing. Missing, stale, or failed evidence must have its own visible states.

---

## 7. Acceptance criteria

P6 is complete only when all of the following are true.

### 7.1 Validation and truth audit

- A P6 completion report contains a short validation table for P1 to P5.
- Any P5 claim that was corrected, narrowed, or deferred is explicitly listed.
- Operating docs, completion reports, and source behaviour agree on Production Evidence, Marketing scheduling, safe-copy, and Content/Asset capabilities.

### 7.2 Production Evidence

- Production Evidence uses a source-backed evidence registry, not just an empty placeholder file.
- If no evidence exists, the panel says no evidence is available.
- If evidence is stale, the panel says stale.
- If 30-learner capacity is failing, Admin shows that it is failing and does not claim classroom readiness.
- The evidence generator or registry documents its sources and schema.
- Tests prove that unknown or missing evidence cannot classify as certified.

### 7.3 Safe copy/export

- All Admin copy/export actions go through the safe-copy framework or an explicitly equivalent server-side export gate.
- String inputs are redacted or generated from already-redacted objects with tests proving the boundary.
- Parent-safe output is tested with seeded emails, account IDs, learner IDs, session IDs, auth headers, request bodies, internal notes, and stack traces.
- Ops-safe output is tested separately from admin-only output.
- Browser-level evidence proves ops cannot see or copy admin-only Debug Bundle JSON.

### 7.4 Panel freshness/failure

- Every major server-backed panel has a meaningful freshness/failure contract.
- Marketing list view has a real last-refreshed value or intentionally does not claim freshness.
- Debugging panels that remain outside AdminPanelFrame still expose clear loading/error/stale semantics.
- Refresh-error envelopes use one normalised shape.
- Tests cover stale-with-data, loading-without-data, empty, failed-with-last-success, and failed-without-last-success states.

### 7.5 Content Operations

- Content overview rows are truthful and actionable.
- Live subjects expose diagnostics where implemented.
- Placeholder or no-drilldown subjects do not behave like clickable rows.
- Release readiness is visible for subjects with release data.
- Validation blockers and warnings are visible without opening developer tools.
- At least one live subject has a subject-specific drilldown that is useful for an operator investigating content quality.

### 7.6 Asset and Effect Registry

- Asset Registry v1 has stable asset rows, version/draft state, validation state, publish blockers, and rollback affordance.
- Publish and restore actions are Worker-authoritative, CAS-guarded, audited, and confirmed.
- No registry path allows raw HTML, raw JavaScript, or arbitrary raw CSS authoring.
- Visual/effect preview and reduced-motion/fallback status are truthful.

### 7.7 Refactor safety

- Any structural refactor starts with characterisation tests.
- Refactors preserve behaviour before changing behaviour.
- New helpers have clear ownership and do not create subject/platform coupling.
- The Admin Console remains navigable at `/admin` with section deep-linking.

### 7.8 Evidence and test posture

The P6 completion report must include actual command evidence. At minimum, it should state:

- unit/integration tests run;
- Admin-specific tests run;
- Playwright or browser-level tests run;
- production smoke status, if run;
- capacity/evidence generator status;
- known skipped/fixme tests and why they are safe or not safe.

A skipped or fixme ops-role Debug Bundle browser test is not acceptable as the final P6 state unless there is an equivalent replacement proof.

---

## 8. Suggested product decomposition for the implementation agent

This is not a ticket plan. The next agent should create its own implementation plan. However, the work will likely fall into these slices:

1. **P6-A: Source-truth audit and P5 gap closure.** Confirm current source, reports, and docs; narrow or correct any overclaims.
2. **P6-B: Production Evidence v2.** Expand the evidence registry/generator and wire the panel to real evidence.
3. **P6-C: Safe Copy v2 and ops browser proof.** Close string redaction and remove the ops-role browser proof gap.
4. **P6-D: Panel State Contract v2.** Normalise freshness/error states and apply to the highest-risk panels.
5. **P6-E: Content Operations maturity.** Add subject drilldowns, release readiness, validation queues, and learning-quality signals where data exists.
6. **P6-F: Asset and Effect Registry v1.** Make the registry operational rather than just registry-shaped.
7. **P6-G: Refactor and CSP/style cleanup slice.** Reduce Admin maintainability and inline-style debt without changing behaviour.
8. **P6-H: Documentation, smoke, and completion report.** Make source/docs/report agree and include real evidence.

The next implementation plan should break these into atomic units with PR order, exact files, tests, migration decisions, review requirements, and rollback strategy.

---

## 9. Review gates

The next implementation agent should use specialist review, not just a happy-path implementation pass.

Required review lenses:

- **Correctness review** for evidence classification, CAS, panel state, and route contracts.
- **Security/redaction review** for safe-copy, Debug Bundle, exports, Markdown, and asset config.
- **Adversarial review** for public or cross-role boundaries, broad-publish/publish paths, evidence overclaiming, and stale-state attacks.
- **Frontend race review** for refresh generation guards, stale response overwrites, dirty forms, and section navigation.
- **Data-integrity review** for publish/restore, mutation receipts, and evidence provenance.
- **Design/UX review** for operator clarity, especially avoiding green-but-unknown states.

Any convergent high-severity finding across reviewers should block merge until resolved.

---

## 10. Risks to watch

### 10.1 Evidence overclaiming

This is the highest P6 risk. A pretty evidence panel that hides empty or stale data is worse than no panel.

### 10.2 Copy/export leakage

Debugging tools naturally collect sensitive data. The copy boundary needs hostile seeded-data tests, not just structural “helper was called” tests.

### 10.3 Content section becoming a dumping ground

Content Management should become clearer, not larger and messier. P6 should group by operator intent: overview, release readiness, diagnostics, asset/effect registry, validation.

### 10.4 Asset config turning into arbitrary styling

The Registry must remain token/config based. Raw CSS/HTML/JS authoring should stay out of scope.

### 10.5 Refactor without characterisation

Large Admin refactors without characterisation tests are not acceptable. The previous phases succeeded because they pinned behaviour first.

---

## 11. Completion report expectations

The P6 completion report should include:

- source-truth validation against P5 claims;
- list of corrected claims or remaining residuals;
- product changes by Admin section;
- engineering changes by concern;
- test evidence and skipped-test explanation;
- browser-level evidence for ops/admin role differences;
- Production Evidence sample output and classification examples;
- redaction matrix results;
- Content/Asset before-and-after summary;
- CSP/style inventory delta, if style cleanup was included;
- remaining Admin phases recommendation.

The report must be honest about what was not run. Do not claim local, production, or Playwright evidence unless it actually ran.

---

## 12. Recommended phases after P6

If P6 lands cleanly, Admin probably needs **one more planned phase** before phase-based Admin work should stop.

### P7 — Business Operations and Growth Analytics

P7 should cover business-owner needs that are currently still thin:

- account lifecycle views;
- business KPIs;
- conversion and retention analytics;
- support queue or incident triage workflow;
- Marketing/Live Ops beyond V0, if justified;
- billing/subscription placeholders, not full payment integration unless separately contracted;
- role/permission placeholders if more operators join.

After P7, do not continue Admin as an endless phase chain. Each new product feature should bring its own Admin slice.

If time is tight, P6 can be a safe stopping point after evidence, redaction, and Content/Asset maturity are complete.

---

## 13. One-sentence contract

**P6 makes Admin evidence-backed and content-operational: it corrects P5’s remaining truth gaps, proves safe-copy and role boundaries, and turns Content/Asset management into a reliable operator surface without expanding into billing, complex permissions, or reward/live-ops bloat.**
